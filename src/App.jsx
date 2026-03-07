import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://yeqbjdxkktmjchkcljwr.supabase.co",
  "sb_publishable_AhduFGwHCFi3vkVt3ostxw_N_-41Oxv"
);

const MEMBERSHIP_FEE = 1;
const JACKPOT_FEE = 4;
const WEEKLY_TOTAL = MEMBERSHIP_FEE + JACKPOT_FEE;
const CURRENCY = "£";
const ADMIN_PIN = "1234";
const MAX_PLAYERS = 50;

function randomDraw() {
  const nums = [];
  while (nums.length < 6) {
    const n = Math.floor(Math.random() * 49) + 1;
    if (!nums.includes(n)) nums.push(n);
  }
  return nums.sort((a, b) => a - b);
}

function ballColor(num) {
  const colors = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#9333ea",
    "#ea580c",
    "#0891b2",
    "#db2777",
  ];
  return colors[num % colors.length];
}

function formatMoney(value) {
  return `${CURRENCY}${Number(value || 0).toFixed(2)}`;
}

function isActive(player) {
  return player.left_after_week === null || player.left_after_week === undefined;
}

function getWeeksPaid(player, currentWeek, weekDrawn) {
  if (player.left_after_week !== null && player.left_after_week !== undefined) {
    return player.left_after_week;
  }
  return weekDrawn ? currentWeek : currentWeek - 1;
}

function groupDrawsByWeek(drawn) {
  const grouped = {};
  for (const item of drawn) {
    const wk = item.week || 1;
    if (!grouped[wk]) grouped[wk] = [];
    grouped[wk].push(item);
  }
  return Object.entries(grouped)
    .map(([week, nums]) => ({
      week: Number(week),
      nums: nums.sort((a, b) => a.value - b.value),
    }))
    .sort((a, b) => a.week - b.week);
}

export default function App() {
  const [players, setPlayers] = useState([]);
  const [drawn, setDrawn] = useState([]);
  const [club, setClub] = useState({
    id: null,
    week: 1,
    week_drawn: false,
    carryover: 0,
    winner_found: false,
    winner_names: [],
  });

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDraw, setCurrentDraw] = useState([]);
  const [lastDrawIds, setLastDrawIds] = useState([]);

  const [adminName, setAdminName] = useState("");
  const [adminNums, setAdminNums] = useState("");

  const [playerLookup, setPlayerLookup] = useState("");
  const [selectedPlayerName, setSelectedPlayerName] = useState("");

  const roundStarted = drawn.length > 0;
  const activeCount = players.filter(isActive).length;
  const drawGroups = useMemo(() => groupDrawsByWeek(drawn), [drawn]);

  useEffect(() => {
    loadAll();

    const playersChannel = supabase
      .channel("players-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => loadPlayers()
      )
      .subscribe();

    const drawsChannel = supabase
      .channel("draws-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draws" },
        () => loadDraws()
      )
      .subscribe();

    const clubChannel = supabase
      .channel("club-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_state" },
        () => loadClub()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(drawsChannel);
      supabase.removeChannel(clubChannel);
    };
  }, []);

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerName.trim()) return null;
    return (
      players.find(
        (p) => p.name.toLowerCase() === selectedPlayerName.trim().toLowerCase()
      ) || null
    );
  }, [players, selectedPlayerName]);

  const paidWeeks = useMemo(() => {
    return Math.max(0, getWeeksPaid({ left_after_week: null }, club.week, club.week_drawn));
  }, [club.week, club.week_drawn]);

  const totalMembershipFees = useMemo(() => {
    return players.reduce(
      (sum, p) => sum + getWeeksPaid(p, club.week, club.week_drawn) * MEMBERSHIP_FEE,
      0
    );
  }, [players, club.week, club.week_drawn]);

  const currentJackpot = useMemo(() => {
    const paid = players.reduce(
      (sum, p) => sum + getWeeksPaid(p, club.week, club.week_drawn) * JACKPOT_FEE,
      0
    );
    return paid + Number(club.carryover || 0);
  }, [players, club.week, club.week_drawn, club.carryover]);

  const winnerPrizeEach =
    club.winner_names.length > 0
      ? currentJackpot / club.winner_names.length
      : currentJackpot;

  async function loadAll() {
    await Promise.all([loadPlayers(), loadDraws(), loadClub()]);
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data) setPlayers(data);
  }

  async function loadDraws() {
    const { data, error } = await supabase
      .from("draws")
      .select("*")
      .order("week", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && data) setDrawn(data);
  }

  async function loadClub() {
    const { data, error } = await supabase
      .from("club_state")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setClub({
        ...data,
        week: Number(data.week || 1),
        week_drawn: !!data.week_drawn,
        winner_names: data.winner_names || [],
      });
    }
  }

  async function updateClub(patch) {
    if (!club.id) return;
    await supabase.from("club_state").update(patch).eq("id", club.id);
  }

  function unlockAdmin() {
    const pin = window.prompt("Enter admin PIN");
    if (pin === ADMIN_PIN) {
      setAdminUnlocked(true);
      alert("Admin unlocked");
    } else {
      alert("Wrong PIN");
    }
  }

  function lockAdmin() {
    setAdminUnlocked(false);
  }

  async function addPlayer(e) {
    e.preventDefault();

    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (players.length >= MAX_PLAYERS) {
      alert(`Club is full (${MAX_PLAYERS} members max)`);
      return;
    }

    if (roundStarted) {
      alert("No new players can be added after the first weekly draw");
      return;
    }

    const numbers = adminNums
      .split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    if (!adminName.trim()) {
      alert("Enter name");
      return;
    }

    if (numbers.length !== 6) {
      alert("Enter exactly 6 numbers");
      return;
    }

    const unique = [...new Set(numbers)].sort((a, b) => a - b);

    if (unique.length !== 6) {
      alert("Numbers must be 6 different numbers");
      return;
    }

    if (unique.some((n) => n < 1 || n > 49)) {
      alert("Numbers must be between 1 and 49");
      return;
    }

    const duplicateName = players.some(
      (p) => p.name.toLowerCase() === adminName.trim().toLowerCase()
    );

    if (duplicateName) {
      alert("That player name already exists");
      return;
    }

    const { error } = await supabase.from("players").insert({
      id: crypto.randomUUID(),
      name: adminName.trim(),
      numbers: unique,
      left_after_week: null,
    });

    if (error) {
      alert("Could not add player");
      return;
    }

    setAdminName("");
    setAdminNums("");
  }

  function checkMyNumbers(e) {
    e.preventDefault();

    if (!playerLookup.trim()) {
      alert("Enter your name");
      return;
    }

    const found = players.find(
      (p) => p.name.toLowerCase() === playerLookup.trim().toLowerCase()
    );

    if (!found) {
      alert("No player found with that name");
      return;
    }

    setSelectedPlayerName(found.name);
  }

  function clearPlayerLookup() {
    setPlayerLookup("");
    setSelectedPlayerName("");
  }

  async function drawNumbers() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (club.winner_found) {
      alert("Winner already found. Start a new round.");
      return;
    }

    if (club.week_drawn) {
      alert(`Week ${club.week} has already been drawn. Start next week first.`);
      return;
    }

    if (isDrawing) return;

    const activePlayers = players.filter(isActive);

    if (activePlayers.length === 0) {
      alert("Add players first");
      return;
    }

    const drawWeek = club.week;

    setIsDrawing(true);
    setCurrentDraw([]);
    setLastDrawIds([]);

    const numbers = randomDraw();
    const newEntries = numbers.map((n) => ({
      id: crypto.randomUUID(),
      value: n,
      week: drawWeek,
    }));

    newEntries.forEach((entry, index) => {
      setTimeout(() => {
        setCurrentDraw((prev) => [...prev, entry]);
      }, index * 450);
    });

    setTimeout(async () => {
      const { error } = await supabase.from("draws").insert(newEntries);

      if (error) {
        setIsDrawing(false);
        alert("Draw failed");
        return;
      }

      const updatedDrawn = [...drawn, ...newEntries];
      setLastDrawIds(newEntries.map((x) => x.id));

      await updateClub({ week_drawn: true });
      await finishWeekCheck(updatedDrawn, drawWeek);

      setIsDrawing(false);
      setCurrentDraw([]);
    }, newEntries.length * 450 + 250);
  }

  async function finishWeekCheck(updatedDrawn, drawWeek) {
    const activePlayers = players.filter(isActive);

    const winners = activePlayers.filter((p) => {
      const hits = p.numbers.filter((n) =>
        updatedDrawn.some((d) => d.value === n)
      );
      return hits.length === 6;
    });

    if (winners.length > 0) {
      const winnerList = winners.map((w) => w.name);

      await updateClub({
        winner_found: true,
        winner_names: winnerList,
      });

      const jackpotAtWin =
        players.reduce(
          (sum, p) => sum + getWeeksPaid(p, drawWeek, true) * JACKPOT_FEE,
          0
        ) + Number(club.carryover || 0);

      if (winnerList.length === 1) {
        alert(`Winner: ${winnerList[0]} — prize ${formatMoney(jackpotAtWin)}`);
      } else {
        alert(
          `Winners: ${winnerList.join(", ")}\nEach wins ${formatMoney(
            jackpotAtWin / winnerList.length
          )}`
        );
      }
    }
  }

  async function startNextWeek() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (isDrawing) return;

    if (!club.week_drawn && roundStarted) {
      alert(`Week ${club.week} has not been drawn yet.`);
      return;
    }

    if (club.winner_found) {
      alert("Winner already found. Start a new round.");
      return;
    }

    const activePlayers = players.filter(isActive);
    if (activePlayers.length === 0) {
      alert("No active players.");
      return;
    }

    await updateClub({
      week: club.week + 1,
      week_drawn: false,
    });
  }

  async function withdrawPlayer(id) {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (isDrawing) return;

    const player = players.find((p) => p.id === id);
    if (!player) return;

    if (!roundStarted) {
      await supabase.from("players").delete().eq("id", id);
      return;
    }

    if (!isActive(player)) return;

    const weeksToCharge = club.week_drawn ? club.week : club.week - 1;
    const ok = window.confirm(
      `${player.name} will stop contributing after week ${Math.max(0, weeksToCharge)}. Continue?`
    );
    if (!ok) return;

    await supabase
      .from("players")
      .update({ left_after_week: Math.max(0, weeksToCharge) })
      .eq("id", id);

    const stillActive = players.filter((p) => p.id !== id && isActive(p));

    if (stillActive.length === 0) {
      await updateClub({
        carryover: currentJackpot,
        winner_found: false,
        winner_names: [],
      });
    }
  }

  async function newRound() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (isDrawing) return;

    const ok = window.confirm("Start a new round?");
    if (!ok) return;

    await supabase
      .from("draws")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    await supabase
      .from("players")
      .update({ left_after_week: null })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    await updateClub({
      week: 1,
      week_drawn: false,
      winner_found: false,
      winner_names: [],
    });

    setCurrentDraw([]);
    setLastDrawIds([]);
  }

  async function resetEverything() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (isDrawing) return;

    const ok = window.confirm("Reset everything?");
    if (!ok) return;

    await supabase
      .from("players")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    await supabase
      .from("draws")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    await updateClub({
      week: 1,
      week_drawn: false,
      carryover: 0,
      winner_found: false,
      winner_names: [],
    });

    setPlayerLookup("");
    setSelectedPlayerName("");
    setAdminName("");
    setAdminNums("");
    setCurrentDraw([]);
    setLastDrawIds([]);
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "Arial, sans-serif",
        background:
          "linear-gradient(180deg, #eff6ff 0%, #fdf2f8 50%, #f0fdf4 100%)",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            ...card,
            background: "linear-gradient(135deg, #1d4ed8, #7c3aed, #db2777)",
            color: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <img
              src="/logo.png"
              alt="Logo"
              style={{
                height: 110,
                width: 110,
                borderRadius: 20,
                objectFit: "cover",
                background: "white",
                padding: 8,
                boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
              }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: 36 }}>Weekly Bingo Club</h1>
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                {formatMoney(WEEKLY_TOTAL)} weekly • {formatMoney(MEMBERSHIP_FEE)} membership •{" "}
                {formatMoney(JACKPOT_FEE)} jackpot
              </div>
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                Private club • Max {MAX_PLAYERS} members
              </div>
            </div>
          </div>

          <div
            style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}
          >
            {!adminUnlocked ? (
              <button style={darkBtn} onClick={unlockAdmin}>
                Unlock Admin
              </button>
            ) : (
              <button style={greyBtn} onClick={lockAdmin}>
                Lock Admin
              </button>
            )}
            <button
              style={yellowBtn}
              onClick={drawNumbers}
              disabled={isDrawing || activeCount === 0 || club.week_drawn}
            >
              {isDrawing ? "Drawing..." : `Draw Week ${club.week}`}
            </button>
            <button
              style={greyBtn}
              onClick={startNextWeek}
              disabled={isDrawing || !club.week_drawn || club.winner_found}
            >
              Start Week {club.week + 1}
            </button>
            <button style={greyBtn} onClick={newRound} disabled={isDrawing}>
              New Round
            </button>
            <button style={dangerBtn} onClick={resetEverything} disabled={isDrawing}>
              Reset All
            </button>
          </div>
        </div>

        <div style={statsGrid}>
          <StatCard
            title="Current Week"
            value={club.week}
            bg="linear-gradient(135deg,#f59e0b,#f97316)"
          />
          <StatCard
            title="Week Status"
            value={club.week_drawn ? "Drawn" : "Open"}
            bg="linear-gradient(135deg,#10b981,#059669)"
          />
          <StatCard
            title="Members"
            value={`${players.length}/${MAX_PLAYERS}`}
            bg="linear-gradient(135deg,#0ea5e9,#0284c7)"
          />
          <StatCard
            title="Current Jackpot"
            value={formatMoney(currentJackpot)}
            bg="linear-gradient(135deg,#3b82f6,#2563eb)"
          />
          <StatCard
            title={club.winner_names.length > 1 ? "Winner Prize Each" : "Winner Prize"}
            value={formatMoney(
              club.winner_names.length > 1 ? winnerPrizeEach : currentJackpot
            )}
            bg="linear-gradient(135deg,#8b5cf6,#7c3aed)"
          />
        </div>

        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "#fff7ed",
            marginBottom: 16,
            border: "2px solid #fdba74",
          }}
        >
          <h3 style={{ marginTop: 0 }}>One Draw Per Week Rule</h3>
          <p style={{ marginBottom: 0, lineHeight: 1.7 }}>
            Each week allows <strong>one draw only</strong>. After the weekly numbers are drawn,
            the draw button locks. The admin must press <strong>Start Week {club.week + 1}</strong>
            before another draw can happen. Each active player is charged once per drawn week.
          </p>
        </div>

        <div style={{ ...card, background: "#eef2ff" }}>
          <h2 style={{ marginTop: 0, color: "#4338ca" }}>Check My Numbers</h2>
          <p style={{ marginTop: 0, color: "#475569", lineHeight: 1.6 }}>
            Type your name to view only your ticket and progress.
          </p>

          <form onSubmit={checkMyNumbers}>
            <input
              placeholder="Enter your name"
              value={playerLookup}
              onChange={(e) => setPlayerLookup(e.target.value)}
              style={input}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={bigYellowBtn}>
                View My Ticket
              </button>
              <button type="button" style={greyBtn} onClick={clearPlayerLookup}>
                Clear
              </button>
            </div>
          </form>

          {selectedPlayer && (
            <div style={{ marginTop: 16 }}>
              <PlayerCard
                player={selectedPlayer}
                drawn={drawn}
                currentWeek={club.week}
                weekDrawn={club.week_drawn}
                jackpotFee={JACKPOT_FEE}
                adminUnlocked={false}
                isDrawing={false}
                onWithdraw={() => {}}
              />
            </div>
          )}
        </div>

        <div style={{ ...card, background: "#ffffffee" }}>
          <div
            style={{
              marginBottom: 20,
              padding: 20,
              borderRadius: 18,
              background: "linear-gradient(135deg,#111827,#1f2937)",
              color: "white",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 18,
                marginBottom: 10,
                opacity: 0.85,
                fontWeight: "bold",
              }}
            >
              Live Draw
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: 14,
                minHeight: 80,
                alignItems: "center",
              }}
            >
              {currentDraw.length === 0 && !isDrawing && (
                <div style={{ opacity: 0.6 }}>
                  {club.week_drawn
                    ? `Week ${club.week} already drawn`
                    : `Press Draw Week ${club.week} to begin`}
                </div>
              )}

              {currentDraw.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    fontWeight: "bold",
                    background: ballColor(entry.value),
                    color: "#fff",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                    animation: "popIn 0.35s ease",
                  }}
                >
                  {entry.value}
                </div>
              ))}
            </div>
          </div>

          <h2 style={{ marginTop: 0, color: "#1e3a8a" }}>Numbers Drawn By Week</h2>

          {drawGroups.length === 0 ? (
            <p style={{ color: "#666" }}>No numbers drawn yet</p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {drawGroups.map((group) => (
                <div
                  key={group.week}
                  style={{
                    border: "2px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: "bold", marginBottom: 10 }}>
                    Week {group.week}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {group.nums.map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          ...ball,
                          background: ballColor(entry.value),
                          color: "#fff",
                          boxShadow: lastDrawIds.includes(entry.id)
                            ? "0 0 0 4px rgba(250,204,21,0.45), 0 8px 18px rgba(0,0,0,0.18)"
                            : "0 6px 14px rgba(0,0,0,0.18)",
                        }}
                      >
                        {entry.value}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={{ marginTop: 16 }}>
            <strong>Round status:</strong>{" "}
            {club.winner_found
              ? "Winner found"
              : club.week_drawn
              ? `Week ${club.week} complete — next week locked until admin starts it`
              : `Week ${club.week} open for its one weekly draw`}
          </p>

          {club.winner_found && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 14,
                background: "linear-gradient(135deg,#22c55e,#16a34a)",
                color: "white",
                fontWeight: "bold",
              }}
            >
              {club.winner_names.length === 1
                ? `Winner: ${club.winner_names[0]} — winner prize ${formatMoney(currentJackpot)}`
                : `Winners: ${club.winner_names.join(", ")} — each wins ${formatMoney(
                    winnerPrizeEach
                  )}`}
            </div>
          )}
        </div>

        <div style={twoCol}>
          <div style={{ ...card, background: "#fff7ed" }}>
            <h2 style={{ marginTop: 0, color: "#c2410c" }}>Add Player (Admin Only)</h2>

            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              <strong>Private club only.</strong> Only the club admin can add
              players before the first weekly draw. Membership is capped at {MAX_PLAYERS} players.
            </div>

            {players.length >= MAX_PLAYERS && (
              <p style={{ color: "#b91c1c", fontWeight: "bold" }}>
                Club is full ({MAX_PLAYERS} members)
              </p>
            )}

            {!adminUnlocked ? (
              <p style={{ color: "#475569" }}>Unlock admin to add players.</p>
            ) : roundStarted ? (
              <p style={{ color: "#b91c1c", fontWeight: "bold" }}>
                Entries closed until next round
              </p>
            ) : (
              <form onSubmit={addPlayer}>
                <input
                  placeholder="Name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  style={input}
                />
                <input
                  placeholder="6 numbers e.g. 3,7,12,18,24,45"
                  value={adminNums}
                  onChange={(e) => setAdminNums(e.target.value)}
                  style={input}
                />
                <button
                  type="submit"
                  style={bigYellowBtn}
                  disabled={players.length >= MAX_PLAYERS}
                >
                  Add Player
                </button>
              </form>
            )}
          </div>

          <div style={{ ...card, background: "#f0fdf4" }}>
            <h2 style={{ marginTop: 0, color: "#166534" }}>Rules & Membership</h2>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>
                Weekly contribution is <strong>{formatMoney(WEEKLY_TOTAL)}</strong>
              </li>
              <li>
                <strong>{formatMoney(MEMBERSHIP_FEE)}</strong> is a club membership/admin fee
              </li>
              <li>
                <strong>{formatMoney(JACKPOT_FEE)}</strong> goes into the progressive jackpot pool
              </li>
              <li>Only one draw of 6 numbers is allowed per week</li>
              <li>After a draw, that week locks until admin starts the next week</li>
              <li>Players pay once per active drawn week</li>
              <li>Numbers are drawn weekly and saved against that week</li>
              <li>Players keep the same numbers for the entire round</li>
              <li>Membership capped at {MAX_PLAYERS} players</li>
              <li>The winner receives <strong>100% of the jackpot pool</strong></li>
              <li>If multiple players match all 6 numbers in the same draw, the jackpot is split equally</li>
              <li>Players may withdraw but previous contributed weeks remain in the jackpot</li>
              <li>If all players withdraw, the jackpot carries forward to the next round</li>
            </ul>
          </div>
        </div>

        <div style={{ ...card, background: "#ffffffee" }}>
          <h2 style={{ marginTop: 0, color: "#7c2d12" }}>Players</h2>
          {players.length === 0 ? (
            <p style={{ color: "#666" }}>No players added yet</p>
          ) : (
            <div style={playersGrid}>
              {players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  drawn={drawn}
                  currentWeek={club.week}
                  weekDrawn={club.week_drawn}
                  jackpotFee={JACKPOT_FEE}
                  adminUnlocked={adminUnlocked}
                  isDrawing={isDrawing}
                  onWithdraw={() => withdrawPlayer(player.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            ...card,
            background: "#eff6ff",
            color: "#1e3a8a",
          }}
        >
          <strong>Membership fees collected:</strong> {formatMoney(totalMembershipFees)}
        </div>
      </div>

      <style>{`
        @keyframes popIn {
          0% {
            transform: scale(0.1) rotate(-40deg);
            opacity: 0;
          }
          60% {
            transform: scale(1.25) rotate(10deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
}

function PlayerCard({
  player,
  drawn,
  currentWeek,
  weekDrawn,
  jackpotFee,
  adminUnlocked,
  isDrawing,
  onWithdraw,
}) {
  const hits = player.numbers.filter((n) =>
    drawn.some((d) => d.value === n)
  );
  const active = isActive(player);
  const paidWeeks = getWeeksPaid(player, currentWeek, weekDrawn);
  const jackpotPaid = paidWeeks * jackpotFee;

  return (
    <div
      style={{
        border: "2px solid #e5e7eb",
        borderRadius: 18,
        padding: 14,
        background: active
          ? "linear-gradient(180deg,#ffffff,#eff6ff)"
          : "linear-gradient(180deg,#f9fafb,#f3f4f6)",
        boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <strong style={{ fontSize: 18 }}>
          {player.name} {!active ? "(withdrawn)" : ""}
        </strong>
        <span style={pill}>{hits.length}/6</span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 10,
        }}
      >
        {player.numbers.map((n) => {
          const matched = drawn.some((d) => d.value === n);
          return (
            <div
              key={n}
              style={{
                ...ball,
                width: 38,
                height: 38,
                fontSize: 14,
                background: matched ? ballColor(n) : "#e5e7eb",
                color: matched ? "#fff" : "#111",
              }}
            >
              {n}
            </div>
          );
        })}
      </div>

      <div style={{ color: "#374151", fontSize: 14, lineHeight: 1.6 }}>
        <div>Weeks contributed: {paidWeeks}</div>
        <div>Jackpot contributed: {formatMoney(jackpotPaid)}</div>
        <div>Status: {active ? "Active" : `Stopped after week ${player.left_after_week}`}</div>
      </div>

      {adminUnlocked && (
        <div style={{ marginTop: 10 }}>
          <button
            style={dangerBtn}
            onClick={onWithdraw}
            disabled={isDrawing}
          >
            {!drawn.length ? "Remove" : active ? "Withdraw" : "Withdrawn"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, bg }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 18,
        background: bg,
        color: "white",
        boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.95 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: "bold" }}>{value}</div>
    </div>
  );
}

const card = {
  background: "#fff",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  marginBottom: 16,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const playersGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const input = {
  width: "100%",
  maxWidth: 360,
  display: "block",
  marginBottom: 10,
  padding: 14,
  borderRadius: 12,
  border: "2px solid #fed7aa",
  fontSize: 15,
  background: "white",
};

const darkBtn = {
  background: "#111827",
  color: "#fff",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: "bold",
};

const greyBtn = {
  background: "#e5e7eb",
  color: "#111827",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: "bold",
};

const yellowBtn = {
  background: "linear-gradient(135deg,#f59e0b,#f97316)",
  color: "white",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: "bold",
};

const bigYellowBtn = {
  background: "linear-gradient(135deg,#f59e0b,#f97316)",
  color: "white",
  border: "none",
  padding: "14px 20px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: 16,
};

const dangerBtn = {
  background: "linear-gradient(135deg,#ef4444,#dc2626)",
  color: "#fff",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: "bold",
};

const ball = {
  width: 42,
  height: 42,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
};

const pill = {
  background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
  color: "#fff",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
};
