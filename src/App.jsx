import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
"https://yeqbjdxkktmjchkcljwr.supabase.co",
"sb_publishable_AhduFGwHCFi3vkVt3ostxw_N_-41Oxv"
);

const ADMIN_PIN = "1234";

export default function App() {

const [profiles,setProfiles] = useState([])
const [selectedUser,setSelectedUser] = useState("")
const [round,setRound] = useState(null)
const [card,setCard] = useState(null)
const [challenge,setChallenge] = useState(null)
const [leaderboard,setLeaderboard] = useState([])
const [message,setMessage] = useState("")
const [admin,setAdmin] = useState(false)

const [answer,setAnswer] = useState("")
const [selectedAnswer,setSelectedAnswer] = useState("")

const [newPlayer,setNewPlayer] = useState("")
const [newEmail,setNewEmail] = useState("")

const [question,setQuestion] = useState("")
const [a1,setA1] = useState("")
const [a2,setA2] = useState("")
const [a3,setA3] = useState("")
const [a4,setA4] = useState("")
const [correct,setCorrect] = useState("")

useEffect(()=>{
load()
},[])

async function load(){

const roundRes = await supabase
.from("weekly_rounds")
.select("*")
.eq("status","active")
.single()

setRound(roundRes.data)

const players = await supabase
.from("profiles")
.select("*")
.eq("is_admin",false)

setProfiles(players.data)

if(players.data.length>0){
setSelectedUser(players.data[0].id)
}

const chall = await supabase
.from("daily_challenges")
.select("*")
.order("challenge_date",{ascending:false})
.limit(1)
.single()

setChallenge(chall.data)

loadLeaderboard()

}

async function loadLeaderboard(){

const res = await supabase
.from("leaderboard_entries")
.select("*,profiles(display_name)")
.order("points",{ascending:false})

setLeaderboard(res.data)

}

useEffect(()=>{

if(selectedUser){
loadPlayer()
}

},[selectedUser])

async function loadPlayer(){

const cardRes = await supabase
.from("bingo_cards")
.select("*")
.eq("user_id",selectedUser)
.single()

setCard(cardRes.data)

}

function unlockAdmin(){

const pin = prompt("Admin PIN")

if(pin===ADMIN_PIN){

setAdmin(true)
setMessage("Admin unlocked")

}else{

setMessage("Wrong pin")

}

}

async function submitAnswer(){

if(!selectedAnswer){

setMessage("Choose answer")
return

}

const correctAnswer = challenge.payload.correct_answer

const correctBool = selectedAnswer===correctAnswer

let points = correctBool ? 5 : 0

let numbers = correctBool ? 1 : 0

await supabase.from("challenge_attempts").insert({

user_id:selectedUser,
round_id:round.id,
challenge_id:challenge.id,
score:points,
correct:correctBool,
completed:true,
points_awarded:points,
numbers_awarded:numbers

})

const board = leaderboard.find(x=>x.user_id===selectedUser)

if(board){

await supabase
.from("leaderboard_entries")
.update({points:board.points+points})
.eq("user_id",selectedUser)

}else{

await supabase
.from("leaderboard_entries")
.insert({

user_id:selectedUser,
round_id:round.id,
points:points

})

}

setMessage(correctBool ? "Correct!" : "Wrong answer")

loadLeaderboard()

}

async function addPlayer(){

const id = crypto.randomUUID()

await supabase.from("profiles").insert({

id:id,
display_name:newPlayer,
email:newEmail,
is_admin:false

})

await supabase.from("memberships").insert({

user_id:id,
plan:"standard",
status:"active"

})

await supabase.from("leaderboard_entries").insert({

user_id:id,
round_id:round.id,
points:0

})

await supabase.from("bingo_cards").insert({

user_id:id,
round_id:round.id,
card_numbers:[
[5,18,34,46,61],
[12,21,37,50,67],
[8,23,"FREE",52,71],
[3,19,40,55,73],
[10,27,44,58,69]
],
unlocked_numbers:[]

})

setMessage("Player added")

load()

}

async function deletePlayer(){

if(!selectedUser)return

await supabase.from("challenge_attempts").delete().eq("user_id",selectedUser)
await supabase.from("leaderboard_entries").delete().eq("user_id",selectedUser)
await supabase.from("bingo_cards").delete().eq("user_id",selectedUser)
await supabase.from("memberships").delete().eq("user_id",selectedUser)
await supabase.from("profiles").delete().eq("id",selectedUser)

setMessage("Player deleted")

load()

}

async function createQuestion(){

await supabase.from("daily_challenges").insert({

round_id:round.id,
challenge_date:new Date().toISOString().split("T")[0],
title:"Daily Trivia",
challenge_type:"trivia",
payload:{

question:question,
answers:[a1,a2,a3,a4],
correct_answer:correct

},
reward_numbers:1,
reward_points:5

})

setMessage("Question created")

load()

}

return(

<div style={{padding:30,fontFamily:"Arial"}}>

<h1>Skill Bingo Club</h1>

<button onClick={unlockAdmin}>Admin</button>

<h2>Choose Player</h2>

<select value={selectedUser} onChange={e=>setSelectedUser(e.target.value)}>

{profiles.map(p=>(

<option key={p.id} value={p.id}>{p.display_name}</option>

))}

</select>

<h2>Daily Challenge</h2>

{challenge &&(

<div>

<h3>{challenge.payload.question}</h3>

{challenge.payload.answers.map(a=>(

<button key={a} onClick={()=>setSelectedAnswer(a)}>

{a}

</button>

))}

<br/>

<button onClick={submitAnswer}>Submit</button>

</div>

)}

<h2>Leaderboard</h2>

{leaderboard.map((l,i)=>(

<div key={l.id}>

#{i+1} {l.profiles.display_name} — {l.points}

</div>

))}

{admin &&(

<>

<h2>Add Player</h2>

<input placeholder="Name" onChange={e=>setNewPlayer(e.target.value)}/>

<input placeholder="Email" onChange={e=>setNewEmail(e.target.value)}/>

<button onClick={addPlayer}>Add</button>

<h2>Delete Player</h2>

<button onClick={deletePlayer}>Delete Selected</button>

<h2>Create Question</h2>

<input placeholder="Question" onChange={e=>setQuestion(e.target.value)}/>

<input placeholder="Answer 1" onChange={e=>setA1(e.target.value)}/>

<input placeholder="Answer 2" onChange={e=>setA2(e.target.value)}/>

<input placeholder="Answer 3" onChange={e=>setA3(e.target.value)}/>

<input placeholder="Answer 4" onChange={e=>setA4(e.target.value)}/>

<input placeholder="Correct Answer" onChange={e=>setCorrect(e.target.value)}/>

<button onClick={createQuestion}>Create Challenge</button>

</>

)}

<p>{message}</p>

</div>

)

}
