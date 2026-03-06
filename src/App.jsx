import { useState } from "react";

const ENTRY = 5;

function randomDraw() {
  const nums = [];
  while (nums.length < 6) {
    const n = Math.floor(Math.random() * 49) + 1;
    if (!nums.includes(n)) nums.push(n);
  }
  return nums.sort((a,b)=>a-b);
}

export default function App() {

  const [players,setPlayers] = useState([]);
  const [drawn,setDrawn] = useState([]);
  const [name,setName] = useState("");
  const [nums,setNums] = useState("");

  function addPlayer(e){
    e.preventDefault();

    const numbers = nums.split(",").map(n=>parseInt(n.trim()));

    if(numbers.length !== 6) return alert("Need 6 numbers");

    setPlayers([
      ...players,
      {
        name,
        numbers
      }
    ])

    setName("")
    setNums("")
  }

  function draw(){
    const newNums = randomDraw();
    setDrawn([...drawn,...newNums]);
  }

  const jackpot = players.length * ENTRY;

  return (
    <div style={{padding:20,fontFamily:"Arial"}}>

      <h1>Weekly Bingo Club</h1>

      <button onClick={draw}>Draw Numbers</button>

      <h3>Numbers Drawn</h3>
      <p>{drawn.join(" - ")}</p>

      <h3>Players</h3>

      {players.map(p=>{

        const hits = p.numbers.filter(n=>drawn.includes(n))

        const win = hits.length === 6

        return (
          <div key={p.name} style={{marginBottom:10}}>

            <strong>{p.name}</strong>

            <div>
              {p.numbers.join(", ")}
            </div>

            <div>
              Matched: {hits.length}/6
            </div>

            {win && (
              <div style={{color:"green"}}>
                WINNER — payout ${(jackpot*0.8).toFixed(2)}
              </div>
            )}

          </div>
        )
      })}

      <h3>Join</h3>

      <form onSubmit={addPlayer}>

        <input
          placeholder="Name"
          value={name}
          onChange={e=>setName(e.target.value)}
        />

        <br/>

        <input
          placeholder="6 numbers e.g 3,7,12,18,24,45"
          value={nums}
          onChange={e=>setNums(e.target.value)}
        />

        <br/>

        <button>Add Player</button>

      </form>

      <h3>Jackpot</h3>

      <p>${jackpot}</p>
      <p>Payout (80%) ${(jackpot*0.8).toFixed(2)}</p>

    </div>
  );
}
