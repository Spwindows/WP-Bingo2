import { useEffect, useMemo, useState } from "react";

const MEMBERSHIP_FEE = 1;
const JACKPOT_FEE = 4;
const WEEKLY_TOTAL = MEMBERSHIP_FEE + JACKPOT_FEE;
const CURRENCY = "£";
const ADMIN_PIN = "1234";
const MAX_PLAYERS = 50;
const STORAGE_KEY = "wp-bingo-club-v10";

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
  return `${CURRENCY}${Number(value).toFixed(2)}`;
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

export default function App() {
  const [players, setPlayers] = useState([]);
  const [drawn, setDrawn] = useState([]);
  const [name, setName] = useState("");
  const [nums, setNums] = useState("");
  const [week, setWeek] = useState(1);

  const [winnerFound, setWinnerFound] = useState(false);
  const [winnerNames, setWinnerNames] = useState([]);
  const [history, setHistory] = useState([]);

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDraw, setCurrentDraw] = useState([]);
  const [lastDrawIds, setLastDrawIds] = useState([]);
  const [carryover, setCarryover] = useState(0);
  const [roundCancelled, setRoundCancelled] = useState(false);

  const [autoDrawEnabled, setAutoDrawEnabled] = useState(false);
  const [autoDrawDay, setAutoDrawDay] = useState("Friday");
  const [autoDrawTime, setAutoDrawTime] = useState("19:00");
  const [lastAutoDrawStamp, setLastAutoDrawStamp] = useState("");

  const [playerLookup, setPlayerLookup] = useState("");
  const [selectedPlayerName, setSelectedPlayerName] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw);
      setPlayers(saved.players || []);
      setDrawn(saved.drawn || []);
      setWeek(saved.week || 1);
      setWinnerFound(saved.winnerFound || false);
      setWinnerNames(saved.winnerNames || []);
      setHistory(saved.history || []);
      setAdminUnlocked(saved.adminUnlocked || false);
      setCarryover(saved.carryover || 0);
      setRoundCancelled(saved.roundCancelled || false);
      setAutoDrawEnabled(saved.autoDrawEnabled || false);
      setAutoDrawDay(saved.autoDrawDay || "Friday");
      setAutoDrawTime(saved.autoDrawTime || "19:00");
      setLastAutoDrawStamp(saved.lastAutoDrawStamp || "");
      setSelectedPlayerName(saved.selectedPlayerName || "");
    } catch {
      // ignore bad saved data
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        players,
        drawn,
        week,
        winnerFound,
        winnerNames,
        history,
        adminUnlocked,
        carryover,
        roundCancelled,
        autoDrawEnabled,
        autoDrawDay,
        autoDrawTime,
        lastAutoDrawStamp,
        selectedPlayerName,
      })
    );
  }, [
    players,
    drawn,
    week,
    winnerFound,
    winnerNames,
    history,
    adminUnlocked,
    carryover,
    roundCancelled,
    autoDrawEnabled,
    autoDrawDay,
    autoDrawTime,
    lastAutoDrawStamp,
    selectedPlayerName,
  ]);

  const roundStarted = drawn.length > 0;

  function getWeeksPaid(player, currentWeek = week) {
    if (player.leftAfterWeek !== null) return player.leftAfterWeek;
    return currentWeek;
  }

  function isActive(player) {
    return player.leftAfterWeek === null;
  }

  const activeCount = players.filter(isActive).length;

  const totalMembershipFees = useMemo(() => {
    return players.reduce((sum, p) => sum + getWeeksPaid(p) * MEMBERSHIP_FEE, 0);
  }, [players, week]);

  const currentJackpot = useMemo(() => {
    const paid = players.reduce((sum, p) => sum + getWeeksPaid(p) * JACKPOT_FEE, 0);
    return paid + carryover;
  }, [players, week, carryover]);

  const winnerPrizeEach =
    winnerNames.length > 0 ? currentJackpot / winnerNames.length : currentJackpot;

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
    if (winnerFound) return;
    if (roundCancelled) return;
    if (players.length === 0) return;

    const active = players.filter(isActive);

    if (active.length === 0) {
      const jackpotPaid = players.reduce(
        (sum, p) => sum + getWeeksPaid(p, week) * JACKPOT_FEE,
        0
      );

      setCarryover((prev) => prev + jackpotPaid);
      setRoundCancelled(true);

      alert(
        `Round cancelled — no active players remain.\nCarryover jackpot ${formatMoney(
          carryover + jackpotPaid
        )}`
      );
    }
  }, [players, roundStarted, winnerFound, roundCancelled, week, carryover]);

  useEffect(() => {
    if (!autoDrawEnabled) return;
    if (!adminUnlocked) return;

    const timer = setInterval(() => {
      if (shouldAutoDrawNow()) {
        const stamp = buildCurrentAutoStamp();
        if (stamp !== lastAutoDrawStamp) {
          setLastAutoDrawStamp(stamp);
          runDraw();
        }
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [
    autoDrawEnabled,
    adminUnlocked,
    autoDrawDay,
    autoDrawTime,
    lastAutoDrawStamp,
    players,
    winnerFound,
    roundCancelled,
    isDrawing,
  ]);

  function shouldAutoDrawNow() {
    if (winnerFound || roundCancelled || isDrawing) return false;
    const activePlayers = players.filter(isActive);
    if (activePlayers.length === 0) return false;

    const now = new Date();
    const targetDay = dayToIndex(autoDrawDay);
    const [hourStr, minuteStr] = autoDrawTime.split(":");
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
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${autoDrawDay}-${autoDrawTime}`;
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

  function addPlayer(e) {
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

    const numbers = nums
      .split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    if (!name.trim()) {
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
      (p) => p.name.toLowerCase() === name.trim().toLowerCase()
    );

    if (duplicateName) {
      alert("That player name already exists");
      return;
    }

    setPlayers([
      ...players,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        numbers: unique,
        leftAfterWeek: null,
      },
    ]);

    setName("");
    setNums("");
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

  function finishDraw(updated, drawIdsForHighlight) {
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
          (sum, p) => sum + getWeeksPaid(p, week) * JACKPOT_FEE,
          0
        ) + carryover;

      const splitPrize = totalJackpotNow / winners.length;
      const winnerList = winners.map((w) => w.name);

      setWinnerFound(true);
      setWinnerNames(winnerList);
      setRoundCancelled(false);

      setHistory([
        {
          id: crypto.randomUUID(),
          winners: winnerList,
          weekWon: week,
          jackpot: totalJackpotNow.toFixed(2),
          splitPrize: splitPrize.toFixed(2),
          when: new Date().toLocaleString(),
        },
        ...history,
      ]);

      setCarryover(0);

      alert(
        winners.length === 1
          ? `Winner: ${winnerList[0]}`
          : `Winners: ${winnerList.join(", ")}\nEach wins ${formatMoney(splitPrize)}`
      );
    } else {
      setWeek((w) => w + 1);
    }

    setIsDrawing(false);
    setCurrentDraw([]);
    setLastDrawIds(drawIdsForHighlight);
  }

  function runDraw() {
    if (winnerFound) {
      alert("Winner already found");
      return;
    }

    if (roundCancelled) {
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

    setTimeout(() => {
      setDrawn((prev) => {
        const updated = [...prev, ...newEntries];
        finishDraw(updated, newEntries.map((x) => x.id));
        return updated;
      });
    }, newEntries.length * 500 + 250);
  }

  function drawNumbers() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }
    runDraw();
  }

  function withdrawPlayer(id) {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (isDrawing) return;

    const player = players.find((p) => p.id === id);
    if (!player) return;

    if (!roundStarted) {
      setPlayers(players.filter((p) => p.id !== id));
      return;
    }

    if (!isActive(player)) return;

    const ok = window.confirm(
      `${player.name} will stop contributing after week ${week}. Continue?`
    );
    if (!ok) return;

    setPlayers(
      players.map((p) =>
        p.id === id ? { ...p, leftAfterWeek: week } : p
      )
    );
  }

  function newRound() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (isDrawing) return;

    const ok = window.confirm("Start a new round?");
    if (!ok) return;

    setDrawn([]);
    setCurrentDraw([]);
    setLastDrawIds([]);
    setWeek(1);
    setWinnerFound(false);
    setWinnerNames([]);
    setRoundCancelled(false);

    setPlayers(
      players.map((p) => ({
        ...p,
        leftAfterWeek: null,
      }))
    );
  }

  function resetEverything() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (isDrawing) return;

    const ok = window.confirm("Reset everything?");
    if (!ok) return;

    setPlayers([]);
    setDrawn([]);
    setCurrentDraw([]);
    setLastDrawIds([]);
    setName("");
    setNums("");
    setWeek(1);
    setWinnerFound(false);
    setWinnerNames([]);
    setHistory([]);
    setCarryover(0);
    setRoundCancelled(false);
    setAutoDrawEnabled(false);
    setLastAutoDrawStamp("");
    setPlayerLookup("");
    setSelectedPlayerName("");
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
              disabled={isDrawing || activeCount === 0 || roundCancelled}
            >
              {isDrawing ? "Drawing..." : "Draw Numbers"}
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
            title="Week"
            value={week}
            bg="linear-gradient(135deg,#f59e0b,#f97316)"
          />
          <StatCard
            title="Active Players"
            value={activeCount}
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
            title={winnerNames.length > 1 ? "Winner Prize Each" : "Winner Prize"}
            value={formatMoney(
              winnerNames.length > 1 ? winnerPrizeEach : currentJackpot
            )}
            bg="linear-gradient(135deg,#8b5cf6,#7c3aed)"
          />
        </div>

        {carryover > 0 && (
          <div
            style={{
              ...card,
              background: "linear-gradient(135deg,#fde68a,#f59e0b)",
              color: "#111827",
              fontWeight: "bold",
            }}
          >
            Carryover jackpot: {formatMoney(carryover)}
          </div>
        )}

        <div style={{ ...card, background: "#ecfeff" }}>
          <h2 style={{ marginTop: 0, color: "#155e75" }}>Auto Draw</h2>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={autoDrawDay}
              onChange={(e) => setAutoDrawDay(e.target.value)}
              style={inputSmall}
            >
              <option>Sunday</option>
              <option>Monday</option>
              <option>Tuesday</option>
              <option>Wednesday</option>
              <option>Thursday</option>
              <option>Friday</option>
              <option>Saturday</option>
            </select>

            <input
              type="time"
              value={autoDrawTime}
              onChange={(e) => setAutoDrawTime(e.target.value)}
              style={inputSmall}
            />

            <button
              style={autoDrawEnabled ? dangerBtn : yellowBtn}
              onClick={() => {
                if (!adminUnlocked) {
                  alert("Unlock admin first");
                  return;
                }
                setAutoDrawEnabled((prev) => !prev);
              }}
            >
              {autoDrawEnabled ? "Disable Auto Draw" : "Enable Auto Draw"}
            </button>
          </div>

          <p style={{ marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>
            Auto draw only runs if this app is open on the admin device at the
            scheduled time.
          </p>
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
          <h3 style={{ marginTop: 0 }}>Progressive Jackpot</h3>
          <p style={{ marginBottom: 0, lineHeight: 1.7 }}>
            Each week players contribute <strong>{formatMoney(JACKPOT_FEE)}</strong> to the
            jackpot pool. Six numbers are drawn weekly. Numbers that match a
            player's ticket remain marked until all six numbers are matched. The
            jackpot continues to grow every week until one or more players
            complete all six numbers. If multiple players win in the same draw,
            the jackpot is split equally.
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
                week={week}
                jackpotFee={JACKPOT_FEE}
                isDrawing={isDrawing}
                adminUnlocked={false}
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
                <div style={{ opacity: 0.6 }}>Press Draw Numbers to begin</div>
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

          <h2 style={{ marginTop: 0, color: "#1e3a8a" }}>Numbers Drawn</h2>

          {drawn.length === 0 ? (
            <p style={{ color: "#666" }}>No numbers drawn yet</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {drawn.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    ...ball,
                    background: ballColor(entry.value),
                    color: "#fff",
                    boxShadow: lastDrawIds.includes(entry.id)
                      ? "0 0 0 4px rgba(250,204,21,0.45), 0 8px 18px rgba(0,0,0,0.18)"
                      : "0 6px 14px rgba(0,0,0,0.18)",
                    transform: lastDrawIds.includes(entry.id)
                      ? "scale(1.08)"
                      : "scale(1)",
                    transition: "all 0.25s ease",
                  }}
                >
                  {entry.value}
                </div>
              ))}
            </div>
          )}

          <p style={{ marginTop: 16 }}>
            <strong>Round status:</strong>{" "}
            {winnerFound
              ? "Winner found"
              : roundCancelled
              ? "Cancelled"
              : roundStarted
              ? "In progress"
              : "Open for entries"}
          </p>

          {winnerFound && (
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
              {winnerNames.length === 1
                ? `Winner: ${winnerNames[0]} — winner prize ${formatMoney(currentJackpot)}`
                : `Winners: ${winnerNames.join(", ")} — each wins ${formatMoney(
                    winnerPrizeEach
                  )}`}
            </div>
          )}

          {roundCancelled && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 14,
                background: "linear-gradient(135deg,#f59e0b,#f97316)",
                color: "white",
                fontWeight: "bold",
              }}
            >
              Round cancelled — no active players remain. Jackpot carried into next
              round.
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
              players. Membership is capped at {MAX_PLAYERS} players.
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={input}
                />
                <input
                  placeholder="6 numbers e.g. 3,7,12,18,24,45"
                  value={nums}
                  onChange={(e) => setNums(e.target.value)}
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
              <li>Private club membership</li>
              <li>Membership capped at {MAX_PLAYERS} players</li>
              <li>
                The jackpot rolls over each week until a player matches all <strong>6 numbers</strong>
              </li>
              <li>Numbers are drawn weekly and matches are permanently marked</li>
              <li>Players keep the same numbers for the entire round</li>
              <li>The winner receives <strong>100% of the jackpot pool</strong></li>
              <li>If multiple players match all 6 numbers in the same draw, the jackpot is split equally</li>
              <li>Players may withdraw but previously contributed weeks remain in the jackpot</li>
              <li>If all players withdraw, the jackpot carries forward to the next round</li>
              <li>This bingo club operates as a <strong>private members social club</strong></li>
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
                  week={week}
                  jackpotFee={JACKPOT_FEE}
                  isDrawing={isDrawing}
                  adminUnlocked={adminUnlocked}
                  onWithdraw={() => withdrawPlayer(player.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ ...card, background: "#faf5ff" }}>
          <h2 style={{ marginTop: 0, color: "#6b21a8" }}>Winner History</h2>
          {history.length === 0 ? (
            <p style={{ color: "#666" }}>No completed rounds yet</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "2px solid #e9d5ff",
                    borderRadius: 14,
                    padding: 12,
                    background: "white",
                  }}
                >
                  <strong style={{ color: "#7c3aed" }}>
                    {item.winners.join(", ")}
                  </strong>
                  <div>Week won: {item.weekWon}</div>
                  <div>Jackpot: {formatMoney(item.jackpot)}</div>
                  {item.winners.length > 1 ? (
                    <div>Each won: {formatMoney(item.splitPrize)}</div>
                  ) : (
                    <div>Winner prize: {formatMoney(item.splitPrize)}</div>
                  )}
                  <div style={{ color: "#666", fontSize: 13 }}>{item.when}</div>
                </div>
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
  week,
  jackpotFee,
  isDrawing,
  adminUnlocked,
  onWithdraw,
}) {
  const hits = player.numbers.filter((n) =>
    drawn.some((d) => d.value === n)
  );
  const active = player.leftAfterWeek === null;
  const paidWeeks = player.leftAfterWeek !== null ? player.leftAfterWeek : week;
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
        <div>Status: {active ? "Active" : `Stopped after week ${player.leftAfterWeek}`}</div>
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
