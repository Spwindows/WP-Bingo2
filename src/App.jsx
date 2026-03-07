import { useEffect, useMemo, useState } from "react";

const ENTRY = 5;
const ADMIN_PIN = "1234"; // change this to your own PIN
const STORAGE_KEY = "wp-bingo-club-v1";

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
    "#be123c",
  ];
  return colors[num % colors.length];
}

export default function App() {
  const [players, setPlayers] = useState([]);
  const [drawn, setDrawn] = useState([]);
  const [name, setName] = useState("");
  const [nums, setNums] = useState("");
  const [week, setWeek] = useState(1);
  const [winnerFound, setWinnerFound] = useState(false);
  const [winnerName, setWinnerName] = useState("");
  const [history, setHistory] = useState([]);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      setPlayers(saved.players || []);
      setDrawn(saved.drawn || []);
      setName("");
      setNums("");
      setWeek(saved.week || 1);
      setWinnerFound(saved.winnerFound || false);
      setWinnerName(saved.winnerName || "");
      setHistory(saved.history || []);
      setAdminUnlocked(saved.adminUnlocked || false);
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
        winnerName,
        history,
        adminUnlocked,
      })
    );
  }, [players, drawn, week, winnerFound, winnerName, history, adminUnlocked]);

  const roundStarted = drawn.length > 0;

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

    if (roundStarted) {
      alert("No new players can join after the round starts");
      return;
    }

    const numbers = nums
      .split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    if (!name.trim()) return alert("Enter name");
    if (numbers.length !== 6) return alert("Enter exactly 6 numbers");

    const unique = [...new Set(numbers)].sort((a, b) => a - b);

    if (unique.length !== 6) return alert("Numbers must be 6 different numbers");
    if (unique.some((n) => n < 1 || n > 49)) {
      return alert("Numbers must be between 1 and 49");
    }

    const duplicateName = players.some(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (duplicateName) return alert("That player name already exists");

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

  function getWeeksPaid(player) {
    if (player.leftAfterWeek !== null) return player.leftAfterWeek;
    return week;
  }

  function isActive(player) {
    return player.leftAfterWeek === null;
  }

  function drawNumbers() {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    if (winnerFound) {
      alert("Winner already found");
      return;
    }

    const activePlayers = players.filter(isActive);

    if (activePlayers.length === 0) {
      alert("Add players first");
      return;
    }

    const newNumbers = randomDraw();
    const updated = [...drawn, ...newNumbers];
    setDrawn(updated);

    const winner = activePlayers.find((p) => {
      const hits = p.numbers.filter((n) => updated.includes(n));
      return hits.length === 6;
    });

    if (winner) {
      const totalTakingsNow = players.reduce(
        (sum, p) => sum + (p.leftAfterWeek !== null ? p.leftAfterWeek : week) * ENTRY,
        0
      );
      const payoutNow = totalTakingsNow * 0.8;

      setWinnerFound(true);
      setWinnerName(winner.name);
      setHistory([
        {
          id: crypto.randomUUID(),
          winner: winner.name,
          weekWon: week,
          payout: payoutNow.toFixed(2),
          takings: totalTakingsNow.toFixed(2),
          drawnAtWin: [...updated],
          when: new Date().toLocaleString(),
        },
        ...history,
      ]);
      alert(`Winner: ${winner.name}`);
    } else {
      setWeek((w) => w + 1);
    }
  }

  function withdrawPlayer(id) {
    if (!adminUnlocked) {
      alert("Unlock admin first");
      return;
    }

    const player = players.find((p) => p.id === id);
    if (!player) return;

    if (!roundStarted) {
      setPlayers(players.filter((p) => p.id !== id));
      return;
    }

    if (!isActive(player)) return;

    const ok = window.confirm(
      `${player.name} will stop paying after week ${week}. Continue?`
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

    const ok = window.confirm("Start a new round?");
    if (!ok) return;

    setDrawn([]);
    setWeek(1);
    setWinnerFound(false);
    setWinnerName("");
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

    const ok = window.confirm("Reset everything?");
    if (!ok) return;

    setPlayers([]);
    setDrawn([]);
    setName("");
    setNums("");
    setWeek(1);
    setWinnerFound(false);
    setWinnerName("");
    setHistory([]);
  }

  const totalTakings = useMemo(() => {
    return players.reduce((sum, p) => sum + getWeeksPaid(p) * ENTRY, 0);
  }, [players, week]);

  const payout = totalTakings * 0.8;
  const retained = totalTakings * 0.2;
  const activeCount = players.filter(isActive).length;

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "Arial, sans-serif",
        background: "#f3f4f6",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <img
              src="/logo.png"
              alt="Logo"
              style={{ height: 64, width: "auto", borderRadius: 12 }}
            />
            <div>
              <h1 style={{ margin: 0 }}>Weekly Bingo Club</h1>
              <div style={{ color: "#666", marginTop: 4 }}>
                $5 per week • 6 numbers • Winner gets 80%
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!adminUnlocked ? (
              <button style={darkBtn} onClick={unlockAdmin}>Unlock Admin</button>
            ) : (
              <button style={greyBtn} onClick={lockAdmin}>Lock Admin</button>
            )}
            <button style={darkBtn} onClick={drawNumbers}>Draw Numbers</button>
            <button style={greyBtn} onClick={newRound}>New Round</button>
            <button style={dangerBtn} onClick={resetEverything}>Reset All</button>
          </div>
        </div>

        <div style={statsGrid}>
          <StatCard title="Week" value={week} />
          <StatCard title="Active Players" value={activeCount} />
          <StatCard title="Takings" value={`$${totalTakings.toFixed(2)}`} />
          <StatCard title="Payout 80%" value={`$${payout.toFixed(2)}`} />
          <StatCard title="Retained 20%" value={`$${retained.toFixed(2)}`} />
        </div>

        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Numbers Drawn</h2>
          {drawn.length === 0 ? (
            <p style={{ color: "#666" }}>No numbers drawn yet</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {drawn.map((n, i) => (
                <div
                  key={`${n}-${i}`}
                  style={{
                    ...ball,
                    background: ballColor(n),
                    color: "#fff",
                    transform: "scale(1)",
                    transition: "transform 0.2s ease",
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
          )}

          <p style={{ marginTop: 14 }}>
            <strong>Round status:</strong>{" "}
            {winnerFound ? "Winner found" : roundStarted ? "In progress" : "Open for entries"}
          </p>

          {winnerFound && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 12,
                background: "#dcfce7",
                color: "#166534",
                fontWeight: "bold",
              }}
            >
              Winner: {winnerName} — payout ${payout.toFixed(2)}
            </div>
          )}
        </div>

        <div style={twoCol}>
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Join</h2>
            {roundStarted ? (
              <p style={{ color: "#b91c1c" }}>Entries closed until next round</p>
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
                <button type="submit" style={darkBtn}>Add Player</button>
              </form>
            )}
          </div>

          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Rules</h2>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>Players must join before the first draw</li>
              <li>$5 per week per active player</li>
              <li>Withdrawn players stop paying future weeks</li>
              <li>Previous paid weeks still count in the pot</li>
              <li>Only active players can win</li>
              <li>Winner gets 80% of takings</li>
            </ul>
          </div>
        </div>

        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Players</h2>
          {players.length === 0 ? (
            <p style={{ color: "#666" }}>No players added yet</p>
          ) : (
            <div style={playersGrid}>
              {players.map((p) => {
                const hits = p.numbers.filter((n) => drawn.includes(n));
                const active = isActive(p);
                const paidWeeks = getWeeksPaid(p);
                const paidAmount = paidWeeks * ENTRY;

                return (
                  <div
                    key={p.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: 14,
                      background: active ? "#fff" : "#f9fafb",
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
                      <strong>{p.name} {!active ? "(withdrawn)" : ""}</strong>
                      <span style={pill}>{hits.length}/6</span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      {p.numbers.map((n) => {
                        const matched = drawn.includes(n);
                        return (
                          <div
                            key={n}
                            style={{
                              ...ball,
                              width: 36,
                              height: 36,
                              fontSize: 14,
                              background: matched ? "#16a34a" : "#e5e7eb",
                              color: matched ? "#fff" : "#111",
                            }}
                          >
                            {n}
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ color: "#444", fontSize: 14, lineHeight: 1.6 }}>
                      <div>Weeks paid: {paidWeeks}</div>
                      <div>Total paid: ${paidAmount.toFixed(2)}</div>
                      <div>Status: {active ? "Active" : `Stopped after week ${p.leftAfterWeek}`}</div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <button style={dangerBtn} onClick={() => withdrawPlayer(p.id)}>
                        {!roundStarted ? "Remove" : active ? "Withdraw" : "Withdrawn"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Winner History</h2>
          {history.length === 0 ? (
            <p style={{ color: "#666" }}>No completed rounds yet</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <strong>{item.winner}</strong>
                  <div>Week won: {item.weekWon}</div>
                  <div>Total takings: ${item.takings}</div>
                  <div>Payout: ${item.payout}</div>
                  <div style={{ color: "#666", fontSize: 13 }}>{item.when}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={card}>
      <div style={{ color: "#666", fontSize: 13, marginBottom: 6 }}>{title}</div>
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
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 15,
};

const darkBtn = {
  background: "#111827",
  color: "#fff",
  border: "none",
  padding: "11px 14px",
  borderRadius: 10,
  cursor: "pointer",
};

const greyBtn = {
  background: "#e5e7eb",
  color: "#111827",
  border: "none",
  padding: "11px 14px",
  borderRadius: 10,
  cursor: "pointer",
};

const dangerBtn = {
  background: "#fee2e2",
  color: "#991b1b",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  cursor: "pointer",
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
  background: "#eef2ff",
  color: "#4338ca",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
};
