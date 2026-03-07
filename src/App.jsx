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

  const roundStarted = drawn.length > 0;

  function addPlayer(e) {
    e.preventDefault();

    if (roundStarted) {
      alert("No new players can join after the round has started.");
      return;
    }

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
        numbers: uniqueNumbers.sort((a, b) => a - b),
        joinedWeek: 1,
        leftAfterWeek: null,
      },
    ]);

    setName("");
    setNums("");
  }

  function getPlayerPaidWeeks(player) {
    if (player.leftAfterWeek !== null) {
      return player.leftAfterWeek;
    }
    return week;
  }

  function isPlayerActive(player) {
    return player.leftAfterWeek === null;
  }

  function draw() {
    if (winnerFound) {
      alert("Winner already found. Start a new round.");
      return;
    }

    const activePlayers = players.filter((p) => isPlayerActive(p));

    if (activePlayers.length === 0) {
      alert("Add at least one active player first.");
      return;
    }

    const newNums = randomDraw();
    const updatedDrawn = [...drawn, ...newNums];
    setDrawn(updatedDrawn);

    const hasWinner = activePlayers.some((p) => {
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
        leftAfterWeek: null,
      }))
    );
  }

  function removePlayer(id) {
    const player = players.find((p) => p.id === id);
    if (!player) return;

    if (!roundStarted) {
      const confirmed = window.confirm(
        `Remove ${player.name} from this round?`
      );
      if (!confirmed) return;

      setPlayers(players.filter((p) => p.id !== id));
      return;
    }

    if (!isPlayerActive(player)) {
      alert(`${player.name} has already been withdrawn.`);
      return;
    }

    const confirmed = window.confirm(
      `${player.name} will stop paying after week ${week}. Their previous weeks already paid will still count in the pot. Continue?`
    );

    if (!confirmed) return;

    setPlayers(
      players.map((p) =>
        p.id === id
          ? {
              ...p,
              leftAfterWeek: week,
            }
          : p
      )
    );
  }

  const totalTakings = players.reduce((sum, player) => {
    return sum + getPlayerPaidWeeks(player) * ENTRY;
  }, 0);

  const payout = totalTakings * 0.8;
  const retained = totalTakings * 0.2;
  const activeCount = players.filter((p) => isPlayerActive(p)).length;

  return (
    <div style={{ padding: 20, fontFamily: "Arial", maxWidth: 950 }}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
  <img src="/logo.png" style={{height:60}} />
  <h1>Weekly Bingo Club</h1>
</div>

      <p>
        <strong>Current week:</strong> {week}
      </p>

      <p>
        <strong>Round status:</strong>{" "}
        {roundStarted ? "In progress" : "Open for player entries"}
      </p>

      <p>
        <strong>Active players:</strong> {activeCount}
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
        const paidWeeks = getPlayerPaidWeeks(p);
        const paidAmount = paidWeeks * ENTRY;
        const active = isPlayerActive(p);

        return (
          <div
            key={p.id}
            style={{
              marginBottom: 16,
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 8,
              background: active ? "#fff" : "#f7f7f7",
            }}
          >
            <strong>
              {p.name} {!active ? "(withdrawn)" : ""}
            </strong>
            <div>Numbers: {p.numbers.join(", ")}</div>
            <div>Matched: {hits.length}/6</div>
            <div>Weeks paid: {paidWeeks}</div>
            <div>Total paid: ${paidAmount.toFixed(2)}</div>
            <div>
              Status: {active ? "Active in current round" : `Stopped after week ${p.leftAfterWeek}`}
            </div>

            <div style={{ marginTop: 8 }}>
              <button onClick={() => removePlayer(p.id)}>
                {!roundStarted ? "Remove Player" : active ? "Withdraw Player" : "Already Withdrawn"}
              </button>
            </div>

            {win && active && (
              <div style={{ color: "green", fontWeight: "bold", marginTop: 8 }}>
                WINNER — payout ${payout.toFixed(2)}
              </div>
            )}
          </div>
        );
      })}

      <h3>Join</h3>

      {roundStarted ? (
        <p style={{ color: "red" }}>
          Entries are closed for this round. New players can join next round.
        </p>
      ) : (
        <form onSubmit={addPlayer}>
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: 320, marginBottom: 8 }}
          />
          <br />
          <input
            placeholder="6 numbers e.g 3,7,12,18,24,45"
            value={nums}
            onChange={(e) => setNums(e.target.value)}
            style={{ width: 320, marginBottom: 8 }}
          />
          <br />
          <button type="submit">Add Player</button>
        </form>
      )}

      <h3>Takings</h3>
      <p>Total takings: ${totalTakings.toFixed(2)}</p>
      <p>Payout (80%): ${payout.toFixed(2)}</p>
      <p>Retained (20%): ${retained.toFixed(2)}</p>

      <h3>Rules</h3>
      <ul>
        <li>Players must join before the first draw.</li>
        <li>Each player pays $5 per week while active in the round.</li>
        <li>If a player withdraws, their previous paid weeks still count in the pot.</li>
        <li>Withdrawn players stop contributing from future weeks.</li>
        <li>Only active players can win the round.</li>
        <li>Winner receives 80% of total takings.</li>
      </ul>
    </div>
  );
}
