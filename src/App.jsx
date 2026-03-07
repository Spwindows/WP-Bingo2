import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

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

function dayToIndex(day) {
  const map = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  return map[day];
}

function getWeeksPaid(player, currentWeek) {
  if (player.left_after_week !== null && player.left_after_week !== undefined) {
    return player.left_after_week;
  }
  return currentWeek;
}

function isActive(player) {
  return player.left_after_week === null || player.left_after_week === undefined;
}

export default function App() {
  const [players, setPlayers] = useState([]);
  const [drawn, setDrawn] = useState([]);
  const [club, setClub] = useState({
    id: null,
    week: 1,
    winner_found: false,
    winner_names: [],
    carryover: 0,
    round_cancelled: false,
    auto_draw_enabled: false,
    auto_draw_day: "Friday",
    auto_draw_time: "19:00",
    last_auto_draw_stamp: "",
  });

  const [history, setHistory] = useState([]);

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

  useEffect(() => {
    loadAll();

    const playersSub = supabase
      .channel("players-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadPlayers)
      .subscribe();

    const drawsSub = supabase
      .channel("draws-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "draws" }, loadDraws)
      .subscribe();

    const clubSub = supabase
      .channel("club-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "club_state" }, loadClub)
      .subscribe();

    const historySub = supabase
      .channel("history-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "winner_history" }, loadHistory)
      .subscribe();

    return () => {
      supabase.removeChannel(playersSub);
      supabase.removeChannel(drawsSub);
      supabase.removeChannel(clubSub);
      supabase.removeChannel(historySub);
    };
  }, []);

  useEffect(() => {
    if (!club.auto_draw_enabled) return;

    const timer = setInterval(() => {
      if (shouldAutoDrawNow()) {
        const stamp = buildCurrentAutoStamp();
        if (stamp !== club.last_auto_draw_stamp) {
          updateClub({ last_auto_draw_stamp: stamp });
          runDraw();
        }
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [club, players, drawn, isDrawing]);

  async function loadAll() {
    await Promise.all([loadPlayers(), loadDraws(), loadClub(), loadHistory()]);
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: true });

    if (data) setPlayers(data);
  }

  async function loadDraws() {
    const { data } = await supabase
      .from("draws")
      .select("*")
      .order("created_at", { ascending: true });

    if (data) setDrawn(data);
  }

  async function loadClub() {
    const { data } = await supabase
      .from("club_state")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (data) {
      setClub({
        ...data,
        winner_names: data.winner_names || [],
      });
    }
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("winner_history")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setHistory(data);
  }

  async function updateClub(patch) {
    if (!club.id) return;
    await supabase.from("club_state").update(patch).eq("id", club.id);
  }

  const totalMembershipFees = useMemo(() => {
    return players.reduce(
      (sum, p) => sum + getWeeksPaid(p, club.week) * MEMBERSHIP_FEE,
      0
    );
  }, [players, club.week]);

  const currentJackpot = useMemo(() => {
    const paid = players.reduce(
      (sum, p) => sum + getWeeksPaid(p, club.week) * JACKPOT_FEE,
      0
    );
    return paid + Number(club.carryover || 0);
  }, [players, club.week, club.carryover]);

  const winnerPrizeEach =
    club.winner_names.length > 0
      ? currentJackpot / club.winner_names.length
      : currentJackpot;

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerName.trim()) return null;
    return (
      players.find(
        (p) => p.name.toLowerCase() === selectedPlayerName.trim().toLowerCase()
      ) || null
    );
  }, [players, selectedPlayerName]);

  useEffect(() => {
    if (!roundStarted) return;
    if (club.winner_found) return;
    if (club.round_cancelled) return;
    if (players.length === 0) return;

    const active = players.filter(isActive);

    if (active.length === 0) {
      const jackpotPaid = players.reduce(
        (sum, p) => sum + getWeeksPaid(p, club.week) * JACKPOT_FEE,
        0
      );

      updateClub({
        carryover: Number(club.carryover || 0) + jackpotPaid,
        round_cancelled: true,
      });
    }
  }, [players, roundStarted, club]);

  function shouldAutoDrawNow() {
    if (club.winner_found || club.round_cancelled || isDrawing) return false;
    const activePlayers = players.filter(isActive);
    if (activePlayers.length === 0) return false;

    const now = new Date();
    const targetDay = dayToIndex(club.auto_draw_day);
    const [hourStr, minuteStr] = club.auto_draw_time.split(":");
    const targetHour = parseInt(hourStr, 10);
    const targetMinute = parseInt(minuteStr, 10);

    return (
      now.getDay() === targetDay &&
      now.getHours() === targetHour &&
      now.getMinutes() === targetMinute
    );
  }

  function buildCurrentAutoStamp() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${club.auto_draw_day}-${club.auto_draw_time}`;
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
      alert("No new players can be added after the round starts");
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

    await supabase.from("players").insert({
      id: crypto.randomUUID(),
      name: adminName.trim(),
      numbers: unique,
      left_after_week: null,
    });

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

  async function finishDraw(updated, drawIdsForHighlight) {
    const activePlayers = players.filter(isActive);

    const winners = activePlayers.filter((p) => {
      const hits = p.numbers.filter((n) =>
        updated.some((d) => d.value === n)
      );
      return hits.length === 6;
    });

    if (winners.length > 0) {
      const totalJackpotNow =
        players.reduce(
          (sum, p) => sum + getWeeksPaid(p, club.week) * JACKPOT_FEE,
          0
        ) + Number(club.carryover || 0);

      const splitPrize = totalJackpotNow / winners.length;
      const winnerList = winners.map((w) => w.name);

      await supabase.from("winner_history").insert({
        id: crypto.randomUUID(),
        winners: winnerList,
        week_won: club.week,
        jackpot: totalJackpotNow,
        split_prize: splitPrize,
      });

      await updateClub({
        winner_found: true,
        winner_names: winnerList,
        round_cancelled: false,
        carryover: 0,
      });

      alert(
        winners.length === 1
          ? `Winner: ${winnerList[0]}`
          : `Winners: ${winnerList.join(", ")}\nEach wins ${formatMoney(splitPrize)}`
      );
    } else {
      await updateClub({ week: club.week + 1 });
    }

    setIsDrawing(false);
    setCurrentDraw([]);
    setLastDrawIds(drawIdsForHighlight);
  }

  async function runDraw() {
    if (club.winner_found) {
      alert("Winner already found");
      return;
    }

    if (club.round_cancelled) {
      alert("This round has been cancelled. Start a new round.");
      return;
    }

    if (isDrawing) return;

    const activePlayers = players.filter(isActive);

    if (activePlayers.length === 0) {
      alert("Add players first");
      return;
    }

    const newNumbers = randomDraw();
    const newEntries = newNumbers.map((n) => ({
      id: crypto.randomUUID(),
      value: n,
    }));

    setIsDrawing(true);
    setCurrentDraw([]);
    setLastDrawIds([]);

    newEntries.forEach((entry, index) => {
      setTimeout(() => {
        setCurrentDraw((prev) => [...prev, entry]);
      }, index * 500);
    });

    setTimeout(async () => {
      await supabase.from("draws").insert(newEntries);
      const updated = [...drawn, ...newEntries];
      await finishDraw(updated, newEntries.map((x) => x.id));
    }, newEntries.length * 500 + 250);
  }

  function drawNumbers() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }
    runDraw();
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

    const ok = window.confirm(
      `${player.name} will stop contributing after week ${club.week}. Continue?`
    );
    if (!ok) return;

    await supabase
      .from("players")
      .update({ left_after_week: club.week })
      .eq("id", id);
  }

  async function newRound() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (isDrawing) return;

    const ok = window.confirm("Start a new round?");
    if (!ok) return;

    await supabase.from("draws").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase
      .from("players")
      .update({ left_after_week: null })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    await updateClub({
      week: 1,
      winner_found: false,
      winner_names: [],
      round_cancelled: false,
      last_auto_draw_stamp: "",
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

    await supabase.from("players").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("draws").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase
      .from("winner_history")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    await updateClub({
      week: 1,
      winner_found: false,
      winner_names: [],
      carryover: 0,
      round_cancelled: false,
      auto_draw_enabled: false,
      auto_draw_day: "Friday",
      auto_draw_time: "19:00",
      last_auto_draw_stamp: "",
    });

    setPlayerLookup("");
    setSelectedPlayerName("");
    setAdminName("");
    setAdminNums("");
    setCurrentDraw([]);
    setLastDrawIds([]);
  }

  return (
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif", background: "linear-gradient(180deg, #eff6ff 0%, #fdf2f8 50%, #f0fdf4 100%)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ ...card, background: "linear-gradient(135deg, #1d4ed8, #7c3aed, #db2777)", color: "white" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <img src="/logo.png" alt="Logo" style={{ height: 110, width: 110, borderRadius: 20, objectFit: "cover", background: "white", padding: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.15)" }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 36 }}>Weekly Bingo Club</h1>
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                {formatMoney(WEEKLY_TOTAL)} weekly • {formatMoney(MEMBERSHIP_FEE)} membership • {formatMoney(JACKPOT_FEE)} jackpot
              </div>
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                Private club • Max {MAX_PLAYERS} members
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!adminUnlocked ? (
              <button style={darkBtn} onClick={unlockAdmin}>Unlock Admin</button>
            ) : (
              <button style={greyBtn} onClick={lockAdmin}>Lock Admin</button>
            )}
            <button style={yellowBtn} onClick={drawNumbers} disabled={isDrawing || activeCount === 0 || club.round_cancelled}>
              {isDrawing ? "Drawing..." : "Draw Numbers"}
            </button>
            <button style={greyBtn} onClick={newRound} disabled={isDrawing}>New Round</button>
            <button style={dangerBtn} onClick={resetEverything} disabled={isDrawing}>Reset All</button>
          </div>
        </div>

        <div style={statsGrid}>
          <StatCard title="Week" value={club.week} bg="linear-gradient(135deg,#f59e0b,#f97316)" />
          <StatCard title="Active Players" value={activeCount} bg="linear-gradient(135deg,#10b981,#059669)" />
          <StatCard title="Members" value={`${players.length}/${MAX_PLAYERS}`} bg="linear-gradient(135deg,#0ea5e9,#0284c7)" />
          <StatCard title="Current Jackpot" value={formatMoney(currentJackpot)} bg="linear-gradient(135deg,#3b82f6,#2563eb)" />
          <StatCard title={club.winner_names.length > 1 ? "Winner Prize Each" : "Winner Prize"} value={formatMoney(club.winner_names.length > 1 ? winnerPrizeEach : currentJackpot)} bg="linear-gradient(135deg,#8b5cf6,#7c3aed)" />
        </div>

        <div style={{ ...card, background: "#eef2ff" }}>
          <h2 style={{ marginTop: 0, color: "#4338ca" }}>Check My Numbers</h2>
          <p style={{ marginTop: 0, color: "#475569" }}>Type your name to view only your ticket and progress.</p>
          <form onSubmit={checkMyNumbers}>
            <input placeholder="Enter your name" value={playerLookup} onChange={(e) => setPlayerLookup(e.target.value)} style={input} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={bigYellowBtn}>View My Ticket</button>
              <button type="button" style={greyBtn} onClick={clearPlayerLookup}>Clear</button>
            </div>
          </form>
          {selectedPlayer && (
            <div style={{ marginTop: 16 }}>
              <PlayerCard player={selectedPlayer} drawn={drawn} week={club.week} jackpotFee={JACKPOT_FEE} isDrawing={isDrawing} adminUnlocked={false} onWithdraw={() => {}} />
            </div>
          )}
        </div>

        <div style={{ ...card, background: "#ffffffee" }}>
          <h2 style={{ marginTop: 0, color: "#1e3a8a" }}>Numbers Drawn</h2>
          {drawn.length === 0 ? (
            <p style={{ color: "#666" }}>No numbers drawn yet</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {drawn.map((entry) => (
                <div key={entry.id} style={{ ...ball, background: ballColor(entry.value), color: "#fff" }}>
                  {entry.value}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={twoCol}>
          <div style={{ ...card, background: "#fff7ed" }}>
            <h2 style={{ marginTop: 0, color: "#c2410c" }}>Add Player (Admin Only)</h2>
            {!adminUnlocked ? (
              <p>Unlock admin to add players.</p>
            ) : (
              <form onSubmit={addPlayer}>
                <input placeholder="Name" value={adminName} onChange={(e) => setAdminName(e.target.value)} style={input} />
                <input placeholder="6 numbers e.g. 3,7,12,18,24,45" value={adminNums} onChange={(e) => setAdminNums(e.target.value)} style={input} />
                <button type="submit" style={bigYellowBtn}>Add Player</button>
              </form>
            )}
          </div>

          <div style={{ ...card, background: "#f0fdf4" }}>
            <h2 style={{ marginTop: 0, color: "#166534" }}>Players</h2>
            {players.length === 0 ? (
              <p>No players added yet</p>
            ) : (
              <div style={playersGrid}>
                {players.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    drawn={drawn}
                    week={club.week}
                    jackpotFee={JACKPOT_FEE}
                    isDrawing={isDrawing}
                    adminUnlocked={adminUnlocked}
                    onWithdraw={() => withdrawPlayer(player.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, drawn, week, jackpotFee, isDrawing, adminUnlocked, onWithdraw }) {
  const hits = player.numbers.filter((n) =>
    drawn.some((d) => d.value === n)
  );
  const active = player.left_after_week === null;
  const paidWeeks = player.left_after_week !== null ? player.left_after_week : week;
  const jackpotPaid = paidWeeks * jackpotFee;

  return (
    <div style={{ border: "2px solid #e5e7eb", borderRadius: 18, padding: 14, background: active ? "linear-gradient(180deg,#ffffff,#eff6ff)" : "linear-gradient(180deg,#f9fafb,#f3f4f6)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong>{player.name} {!active ? "(withdrawn)" : ""}</strong>
        <span style={pill}>{hits.length}/6</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {player.numbers.map((n) => {
          const matched = drawn.some((d) => d.value === n);
          return (
            <div key={n} style={{ ...ball, width: 38, height: 38, fontSize: 14, background: matched ? ballColor(n) : "#e5e7eb", color: matched ? "#fff" : "#111" }}>
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
          <button style={dangerBtn} onClick={onWithdraw} disabled={isDrawing}>
            {!drawn.length ? "Remove" : active ? "Withdraw" : "Withdrawn"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, bg }) {
  return (
    <div style={{ borderRadius: 18, padding: 18, background: bg, color: "white" }}>
      <div style={{ fontSize: 13, marginBottom: 6 }}>{title}</div>
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

const inputSmall = {
  padding: 12,
  borderRadius: 12,
  border: "2px solid #a5f3fc",
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
