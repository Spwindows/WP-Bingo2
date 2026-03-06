import { useState } from "react";

export default function App() {
  const [numbers, setNumbers] = useState([]);

  function draw() {
    const pool = Array.from({ length: 49 }, (_, i) => i + 1);
    const result = [];

    while (result.length < 6) {
      const i = Math.floor(Math.random() * pool.length);
      result.push(pool[i]);
      pool.splice(i, 1);
    }

    setNumbers(result.sort((a,b)=>a-b));
  }

  return (
    <div style={{fontFamily:"Arial", padding:40}}>
      <h1>Weekly Bingo Draw</h1>

      <button onClick={draw}>
        Draw Numbers
      </button>

      <div style={{marginTop:20, fontSize:22}}>
        {numbers.length === 0 ? "No draw yet" : numbers.join(" - ")}
      </div>
    </div>
  );
}
