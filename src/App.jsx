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

    if (!name.trim()) return alert("Enter a name");
    if (numbers.length !== 6) return alert("Need exactly 6 numbers");

    setPlayers([
      ...players,
      {
        name,
        numbers,
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

    const newNums = randomDraw();
    const updatedDrawn = [...drawn, ...newNums];
    setDrawn(updatedDrawn);

    const hasWinner = players.some((p) => {
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
  }

  const jackpot = players.length * ENTRY * week;
  const payout = jackpot * 0.8;

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Weekly Bingo Club</h1>

      <p>
        <strong>Week:</strong> {week}
      </p>

      <button onClick={draw}>Draw Numbers</button>
      <button onClick={newRound} style={{ marginLeft: 10 }}>
        New Round
      </button>

      <h3>Numbers Drawn</h3>
      <p>{drawn.join(" - ")}</p>

      <h3>Players</h3>

      {players.map((p) => {
        const hits = p.numbers.filter((n) => drawn.includes(n));
        const win = hits.length === 6;

        return (
          <div key={p.name} style={{ marginBottom: 14 }}>
            <strong>{p.name}</strong>
            <div>{p.numbers.join(", ")}</div>
            <div>Matched: {hits.length}/6</div>

            {win && (
              <div style={{ color: "green", fontWeight: "bold" }}>
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
        />
        <br />
        <input
          placeholder="6 numbers e.g 3,7,12,18,24,45"
          value={nums}
          onChange={(e) => setNums(e.target.value)}
        />
        <br />
        <button type="submit">Add Player</button>
      </form>

      <h3>Jackpot</h3>
      <p>${jackpot.toFixed(2)}</p>
      <p>Payout (80%) ${payout.toFixed(2)}</p>
    </div>
  );
}
