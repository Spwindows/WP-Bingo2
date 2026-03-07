import { useState } from "react";

const ENTRY = 5;

function randomDraw() {
  const nums = [];
  while (nums.length < 6) {
    const n = Math.floor(Math.random() * 49) + 1;
    if (!nums.includes(n)) nums.push(n);
  }
  return nums.sort((a, b) => a - b);
}

export default function App() {
  const [players, setPlayers] = useState([]);
  const [drawn, setDrawn] = useState([]);
  const [name, setName] = useState("");
  const [nums, setNums] = useState("");
  const [week, setWeek] = useState(1);
  const [winnerFound, setWinnerFound] = useState(false);

  function addPlayer(e) {
    e.preventDefault();

    const numbers = nums
      .split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    if (!name.trim()) {
      alert("Enter a name");
      return;
    }

    if (numbers.length !== 6) {
      alert("Need exactly 6 numbers");
      return;
    }

    const uniqueNumbers = [...new Set(numbers)];
    if (uniqueNumbers.length !== 6) {
      alert("Numbers must be 6 different numbers");
      return;
    }

    if (uniqueNumbers.some((n) => n < 1 || n > 49)) {
      alert("Numbers must be between 1 and 49");
      return;
    }

    setPlayers([
      ...players,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        numbers: uniqueNumbers,
        joinedWeek: week,
        active: true,
      },
    ]);

    setName("");
    setNums("");
  }

  function draw() {
    if (winnerFound) {
      alert("Winner already found. Start a new round.");
      return;
    }

    if (players.filter((p) => p.active).length === 0) {
      alert("Add at least one active player first");
      return;
    }

    const newNums = randomDraw();
    const updatedDrawn = [...drawn, ...newNums];
    setDrawn(updatedDrawn);

    const hasWinner = players.some((p) => {
      if (!p.active) return false;
      const hits = p.numbers.filter((n) => updatedDrawn.includes(n));
      return hits.length === 6;
    });

    if (hasWinner) {
      setWinnerFound(true);
    } else {
      setWeek((prev) => prev + 1);
    }
  }

  function newRound() {
    setDrawn([]);
    setWeek(1);
    setWinnerFound(false);
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        joinedWeek: 1,
        active: true,
      }))
    );
  }

  function removePlayer(id) {
    setPlayers(players.filter((p) => p.id !== id));
  }

  function toggleActive(id) {
    setPlayers(
      players.map((p) =>
        p.id === id ? { ...p, active: !p.active } : p
      )
    );
  }

  function weeksPaidForPlayer(player) {
    if (!player.active) return 0;
    return week - player.joinedWeek + 1;
  }

  const totalTakings = players.reduce((sum, player) => {
    return sum + weeksPaidForPlayer(player) * ENTRY;
  }, 0);

  const payout = totalTakings * 0.8;
  const retained = totalTakings * 0.2;

  return (
    <div style={{ padding: 20, fontFamily: "Arial", maxWidth: 900 }}>
      <h1>Weekly Bingo Club</h1>

      <p>
        <strong>Current week:</strong> {week}
      </p>

      <button onClick={draw}>Draw Numbers</button>
      <button onClick={newRound} style={{ marginLeft: 10 }}>
        New Round
      </button>

      <h3>Numbers Drawn</h3>
      <p>{drawn.length ? drawn.join(" - ") : "No numbers drawn yet"}</p>

      <h3>Players</h3>

      {players.length === 0 && <p>No players added yet.</p>}

      {players.map((p) => {
        const hits = p.numbers.filter((n) => drawn.includes(n));
        const win = hits.length === 6;
        const playerPaid = weeksPaidForPlayer(p) * ENTRY;

        return (
          <div
            key={p.id}
            style={{
              marginBottom: 16,
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          >
            <strong>{p.name}</strong> {p.active ? "" : "(inactive)"}
            <div>Numbers: {p.numbers.join(", ")}</div>
            <div>Matched: {hits.length}/6</div>
            <div>Joined week: {p.joinedWeek}</div>
            <div>Weeks paid: {weeksPaidForPlayer(p)}</div>
            <div>Total paid: ${playerPaid.toFixed(2)}</div>

            <div style={{ marginTop: 8 }}>
              <button onClick={() => toggleActive(p.id)}>
                {p.active ? "Pause Player" : "Activate Player"}
              </button>
              <button
                onClick={() => removePlayer(p.id)}
                style={{ marginLeft: 8 }}
              >
                Remove
              </button>
            </div>

            {win && (
              <div style={{ color: "green", fontWeight: "bold", marginTop: 8 }}>
                WINNER — payout ${payout.toFixed(2)}
              </div>
            )}
          </div>
        );
      })}

      <h3>Join</h3>

      <form onSubmit={addPlayer}>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: 300, marginBottom: 8 }}
        />
        <br />
        <input
          placeholder="6 numbers e.g 3,7,12,18,24,45"
          value={nums}
          onChange={(e) => setNums(e.target.value)}
          style={{ width: 300, marginBottom: 8 }}
        />
        <br />
        <button type="submit">Add Player</button>
      </form>

      <h3>Takings</h3>
      <p>Total takings: ${totalTakings.toFixed(2)}</p>
      <p>Payout (80%): ${payout.toFixed(2)}</p>
      <p>Retained (20%): ${retained.toFixed(2)}</p>
    </div>
  );
}
