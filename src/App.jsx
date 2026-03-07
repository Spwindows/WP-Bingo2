import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://yeqbjdxkktmjchkcljwr.supabase.co",
  "sb_publishable_AhduFGwHCFi3vkVt3ostxw_N_-41Oxv"
);

const CURRENCY = "£";
const ADMIN_PIN = "1234";

function formatMoney(value) {
  return `${CURRENCY}${Number(value || 0).toFixed(2)}`;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateBingoCard() {
  const cols = [
    shuffle([...Array(15)].map((_, i) => i + 1)).slice(0, 5),
    shuffle([...Array(15)].map((_, i) => i + 16)).slice(0, 5),
    shuffle([...Array(15)].map((_, i) => i + 31)).slice(0, 5),
    shuffle([...Array(15)].map((_, i) => i + 46)).slice(0, 5),
    shuffle([...Array(15)].map((_, i) => i + 61)).slice(0, 5),
  ];

  const grid = Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) => cols[col][row])
  );

  grid[2][2] = "FREE";
  return grid;
}

function flattenCard(cardNumbers) {
  if (!Array.isArray(cardNumbers)) return [];
  return cardNumbers.flat();
}

function getUnlockableNumbers(cardNumbers) {
  return flattenCard(cardNumbers).filter((n) => n !== "FREE");
}

function pickRandomLockedNumbers(cardNumbers, unlockedNumbers, count) {
  const unlockedSet = new Set((unlockedNumbers || []).map(String));
  const available = getUnlockableNumbers(cardNumbers).filter(
    (n) => !unlockedSet.has(String(n))
  );

  return shuffle(available).slice(0, count);
}

function isUnlocked(value, unlockedNumbers) {
  if (value === "FREE") return true;
  return (unlockedNumbers || []).map(String).includes(String(value));
}

function getCompletedLines(cardNumbers, unlockedNumbers) {
  if (!Array.isArray(cardNumbers) || cardNumbers.length !== 5) return [];

  const lines = [];

  for (let r = 0; r < 5; r += 1) {
    const row = cardNumbers[r];
    if (row.every((v) => isUnlocked(v, unlockedNumbers))) {
      lines.push({ type: "row", index: r });
    }
  }

  for (let c = 0; c < 5; c += 1) {
    const col = [0, 1, 2, 3, 4].map((r) => cardNumbers[r][c]);
    if (col.every((v) => isUnlocked(v, unlockedNumbers))) {
      lines.push({ type: "col", index: c });
    }
  }

  const diag1 = [0, 1, 2, 3, 4].map((i) => cardNumbers[i][i]);
  if (diag1.every((v) => isUnlocked(v, unlockedNumbers))) {
    lines.push({ type: "diag", index: 1 });
  }

  const diag2 = [0, 1, 2, 3, 4].map((i) => cardNumbers[i][4 - i]);
  if (diag2.every((v) => isUnlocked(v, unlockedNumbers))) {
    lines.push({ type: "diag", index: 2 });
  }

  return lines;
}

function cellIsHighlighted(cardNumbers, unlockedNumbers, rowIndex, colIndex) {
  const lines = getCompletedLines(cardNumbers, unlockedNumbers);
  return lines.some((line) => {
    if (line.type === "row") return line.index === rowIndex;
    if (line.type === "col") return line.index === colIndex;
    if (line.type === "diag" && line.index === 1) return rowIndex === colIndex;
    if (line.type === "diag" && line.index === 2) return rowIndex + colIndex === 4;
    return false;
  });
}

export default function App() {
  const [profiles, setProfiles] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  const [membership, setMembership] = useState(null);
  const [round, setRound] = useState(null);
  const [card, setCard] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [winners, setWinners] = useState([]);
  const [attempt, setAttempt] = useState(null);

  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [newPlayerPlan, setNewPlayerPlan] = useState("standard");
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [resettingChallenge, setResettingChallenge] = useState(false);

  const currentProfile = useMemo(
    () => profiles.find((p) => p.id === selectedUserId) || null,
    [profiles, selectedUserId]
  );

  const activeMembership = membership?.status === "active";
  const unlockedNumbers = card?.unlocked_numbers || [];
  const completedLines = card ? getCompletedLines(card.card_numbers, unlockedNumbers) : [];
  const hasBingo = completedLines.length > 0;

  useEffect(() => {
    loadBootData();
  }, []);

  useEffect(() => {
    if (selectedUserId && round?.id) {
      loadUserData(selectedUserId, round.id, challenge?.id);
    }
  }, [selectedUserId, round?.id, challenge?.id]);

  async function loadBootData() {
    const activeRound = await loadActiveRound();
    await loadProfiles();
    if (activeRound?.id) {
      await loadRoundData(activeRound.id);
    }
  }

  async function loadProfiles() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("display_name", { ascending: true });

    if (data) {
      setProfiles(data);
      if (!selectedUserId && data.length > 0) {
        setSelectedUserId(data.find((p) => !p.is_admin)?.id || data[0].id);
      }
    }
  }

  async function loadActiveRound() {
    const { data } = await supabase
      .from("weekly_rounds")
      .select("*")
      .eq("status", "active")
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setRound(data);
      return data;
    }
    return null;
  }

  async function loadRoundData(roundId) {
    const [challengeRes, leaderboardRes, prizesRes, winnersRes] = await Promise.all([
      supabase
        .from("daily_challenges")
        .select("*")
        .eq("round_id", roundId)
        .order("challenge_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("leaderboard_entries")
        .select("*, profiles(display_name)")
        .eq("round_id", roundId)
        .order("points", { ascending: false }),
      supabase
        .from("prizes")
        .select("*")
        .eq("round_id", roundId)
        .order("position", { ascending: true }),
      supabase
        .from("winners")
        .select("*, profiles(display_name)")
        .eq("round_id", roundId)
        .order("created_at", { ascending: false }),
    ]);

    setChallenge(challengeRes.data || null);
    setLeaderboard(
      (leaderboardRes.data || []).map((entry, index) => ({
        ...entry,
        display_rank: index + 1,
      }))
    );
    setPrizes(prizesRes.data || []);
    setWinners(winnersRes.data || []);
  }

  async function loadUserData(userId, roundId, challengeId) {
    const [membershipRes, cardRes, attemptRes] = await Promise.all([
      supabase.from("memberships").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("bingo_cards")
        .select("*")
        .eq("user_id", userId)
        .eq("round_id", roundId)
        .maybeSingle(),
      challengeId
        ? supabase
            .from("challenge_attempts")
            .select("*")
            .eq("user_id", userId)
            .eq("challenge_id", challengeId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setMembership(membershipRes.data || null);
    setCard(cardRes.data || null);
    setAttempt(attemptRes.data || null);
  }

  async function refreshAll() {
    const activeRound = await loadActiveRound();
    if (activeRound?.id) {
      await loadRoundData(activeRound.id);
      if (selectedUserId) {
        const latestChallenge = await supabase
          .from("daily_challenges")
          .select("*")
          .eq("round_id", activeRound.id)
          .order("challenge_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        setChallenge(latestChallenge.data || null);
        await loadUserData(selectedUserId, activeRound.id, latestChallenge.data?.id);
      }
    }
    await loadProfiles();
  }

  function unlockAdmin() {
    const pin = window.prompt("Enter admin PIN");
    if (pin === ADMIN_PIN) {
      setAdminUnlocked(true);
      setMessage("Admin unlocked.");
    } else {
      setMessage("Wrong PIN.");
    }
  }

  function lockAdmin() {
    setAdminUnlocked(false);
    setMessage("Admin locked.");
  }

  async function addPlayer() {
    if (!adminUnlocked) {
      setMessage("Unlock admin first.");
      return;
    }
    if (!round?.id) {
      setMessage("No active round found.");
      return;
    }
    if (!newPlayerName.trim() || !newPlayerEmail.trim()) {
      setMessage("Enter player name and email.");
      return;
    }

    setAddingPlayer(true);
    setMessage("");

    const playerId = crypto.randomUUID();
    const cardNumbers = generateBingoCard();

    const { error: profileError } = await supabase.from("profiles").insert({
      id: playerId,
      display_name: newPlayerName.trim(),
      email: newPlayerEmail.trim().toLowerCase(),
      is_admin: false,
    });

    if (profileError) {
      setAddingPlayer(false);
      setMessage("Could not create profile. Email may already exist.");
      return;
    }

    const { error: membershipError } = await supabase.from("memberships").insert({
      user_id: playerId,
      plan: newPlayerPlan,
      status: "active",
    });

    if (membershipError) {
      setAddingPlayer(false);
      setMessage("Profile created, but membership failed.");
      return;
    }

    const { error: leaderboardError } = await supabase.from("leaderboard_entries").insert({
      user_id: playerId,
      round_id: round.id,
      points: 0,
    });

    if (leaderboardError) {
      setAddingPlayer(false);
      setMessage("Profile created, but leaderboard entry failed.");
      return;
    }

    const { error: cardError } = await supabase.from("bingo_cards").insert({
      user_id: playerId,
      round_id: round.id,
      card_numbers: cardNumbers,
      unlocked_numbers: [],
      completed: false,
    });

    if (cardError) {
      setAddingPlayer(false);
      setMessage("Profile created, but bingo card failed.");
      return;
    }

    setNewPlayerName("");
    setNewPlayerEmail("");
    setNewPlayerPlan("standard");
    setSelectedUserId(playerId);
    setAddingPlayer(false);
    setMessage("Player added successfully.");

    await refreshAll();
  }

  async function resetTodaysChallenge() {
    if (!adminUnlocked) {
      setMessage("Unlock admin first.");
      return;
    }
    if (!selectedUserId || !challenge?.id) {
      setMessage("No player or challenge selected.");
      return;
    }

    setResettingChallenge(true);
    setMessage("");

    const { error } = await supabase
      .from("challenge_attempts")
      .delete()
      .eq("user_id", selectedUserId)
      .eq("challenge_id", challenge.id);

    if (error) {
      setResettingChallenge(false);
      setMessage("Could not reset challenge.");
      return;
    }

    setAttempt(null);
    setSelectedAnswer("");
    setResettingChallenge(false);
    setMessage("Today's challenge has been reset for this player.");

    await refreshAll();
  }

  async function submitChallenge() {
    if (!currentProfile || !activeMembership || !card || !challenge) return;

    if (attempt?.completed) {
      setMessage("You already completed today's challenge.");
      return;
    }

    if (!selectedAnswer) {
      setMessage("Please choose an answer.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    const payload = challenge.payload || {};
    const correctAnswer = payload.correct_answer;
    const isCorrect = selectedAnswer === correctAnswer;
    const rewardNumbers = isCorrect ? Number(challenge.reward_numbers || 1) : 0;
    const rewardPoints = isCorrect ? Number(challenge.reward_points || 5) : 0;

    const newlyUnlocked = isCorrect
      ? pickRandomLockedNumbers(card.card_numbers, card.unlocked_numbers || [], rewardNumbers)
      : [];

    const updatedUnlocked = [
      ...new Set([...(card.unlocked_numbers || []), ...newlyUnlocked].map(String)),
    ].map((v) => (Number.isNaN(Number(v)) ? v : Number(v)));

    const linesAfter = getCompletedLines(card.card_numbers, updatedUnlocked);
    const bingoCompleted = linesAfter.length > 0;

    const { error: attemptError } = await supabase.from("challenge_attempts").upsert({
      user_id: selectedUserId,
      round_id: round.id,
      challenge_id: challenge.id,
      score: isCorrect ? 100 : 0,
      correct: isCorrect,
      completed: true,
      points_awarded: rewardPoints,
      numbers_awarded: newlyUnlocked.length,
    });

    if (attemptError) {
      setSubmitting(false);
      setMessage("Could not save attempt.");
      return;
    }

    const existingLeaderboard = leaderboard.find((x) => x.user_id === selectedUserId);
    const currentPoints = existingLeaderboard?.points || 0;

    const { error: leaderboardError } = await supabase.from("leaderboard_entries").upsert({
      user_id: selectedUserId,
      round_id: round.id,
      points: currentPoints + rewardPoints,
      updated_at: new Date().toISOString(),
    });

    if (leaderboardError) {
      setSubmitting(false);
      setMessage("Could not update leaderboard.");
      return;
    }

    const { error: cardError } = await supabase
      .from("bingo_cards")
      .update({
        unlocked_numbers: updatedUnlocked,
        completed: bingoCompleted,
        completed_at: bingoCompleted ? new Date().toISOString() : null,
      })
      .eq("id", card.id);

    if (cardError) {
      setSubmitting(false);
      setMessage("Could not update bingo card.");
      return;
    }

    if (bingoCompleted) {
      const existingBingoWinner = winners.find((w) => w.win_type === "bingo");
      if (!existingBingoWinner) {
        const bingoPrize =
          prizes.find((p) => p.prize_type === "bingo" && p.position === 1)?.amount || 0;

        await supabase.from("winners").insert({
          round_id: round.id,
          user_id: selectedUserId,
          win_type: "bingo",
          prize_amount: bingoPrize,
          notes: "First line completed",
        });
      }
    }

    setSelectedAnswer("");
    setSubmitting(false);
    setMessage(
      isCorrect
        ? `Correct! You earned ${rewardPoints} points and unlocked ${newlyUnlocked.length} number(s).`
        : "Incorrect answer. Challenge recorded."
    );

    await refreshAll();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 16,
        fontFamily: "Arial, sans-serif",
        background: "linear-gradient(180deg,#eff6ff 0%,#fdf2f8 50%,#f0fdf4 100%)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            ...cardStyle,
            background: "linear-gradient(135deg,#1d4ed8,#7c3aed,#db2777)",
            color: "white",
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <img
              src="/logo.png"
              alt="Logo"
              style={{
                width: 100,
                height: 100,
                objectFit: "cover",
                borderRadius: 20,
                background: "white",
                padding: 8,
              }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: 34 }}>Skill Bingo Club</h1>
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                £4.99 membership • Weekly challenge • Leaderboard • Jackpot prizes
              </div>
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                Unlock numbers through skill, not luck
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!adminUnlocked ? (
              <button onClick={unlockAdmin} style={darkBtn}>Unlock Admin</button>
            ) : (
              <button onClick={lockAdmin} style={greyBtn}>Lock Admin</button>
            )}
          </div>
        </div>

        <div style={gridStats}>
          <StatCard
            title="Current Week"
            value={round ? round.week_number : "-"}
            bg="linear-gradient(135deg,#f59e0b,#f97316)"
          />
          <StatCard
            title="Weekly Prize"
            value={round ? formatMoney(round.weekly_prize) : "-"}
            bg="linear-gradient(135deg,#10b981,#059669)"
          />
          <StatCard
            title="Jackpot Prize"
            value={round ? formatMoney(round.jackpot_prize) : "-"}
            bg="linear-gradient(135deg,#3b82f6,#2563eb)"
          />
          <StatCard
            title="My Membership"
            value={membership ? membership.plan.toUpperCase() : "NONE"}
            bg="linear-gradient(135deg,#8b5cf6,#7c3aed)"
          />
        </div>

        <div style={{ ...cardStyle, background: "#eef2ff" }}>
          <h2 style={{ marginTop: 0, color: "#4338ca" }}>Choose Player</h2>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={selectStyle}
          >
            {profiles
              .filter((p) => !p.is_admin)
              .map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
          </select>

          <div style={{ marginTop: 12, lineHeight: 1.7 }}>
            <div><strong>Player:</strong> {currentProfile?.display_name || "-"}</div>
            <div><strong>Membership:</strong> {activeMembership ? `${membership.plan.toUpperCase()} (${membership.status})` : "Inactive"}</div>
            <div><strong>Round:</strong> {round?.title || "-"}</div>
          </div>
        </div>

        {adminUnlocked && (
          <div style={{ ...cardStyle, background: "#fff7ed" }}>
            <h2 style={{ marginTop: 0, color: "#c2410c" }}>Add Player</h2>
            <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
              <input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Player name"
                style={inputStyle}
              />
              <input
                value={newPlayerEmail}
                onChange={(e) => setNewPlayerEmail(e.target.value)}
                placeholder="Player email"
                style={inputStyle}
              />
              <select
                value={newPlayerPlan}
                onChange={(e) => setNewPlayerPlan(e.target.value)}
                style={inputStyle}
              >
                <option value="standard">Standard</option>
                <option value="vip">VIP</option>
              </select>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={addPlayer} disabled={addingPlayer} style={primaryBtn}>
                  {addingPlayer ? "Adding..." : "Add Player"}
                </button>

                <button
                  onClick={resetTodaysChallenge}
                  disabled={resettingChallenge || !selectedUserId || !challenge}
                  style={dangerBtn}
                >
                  {resettingChallenge ? "Resetting..." : "Reset Today's Challenge"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={twoCol}>
          <div style={{ ...cardStyle, background: "#fff" }}>
            <h2 style={{ marginTop: 0, color: "#1e3a8a" }}>My Bingo Card</h2>

            {card ? (
              <>
                <div style={bingoHeaderRow}>
                  {["B", "I", "N", "G", "O"].map((letter) => (
                    <div key={letter} style={bingoHeaderCell}>
                      {letter}
                    </div>
                  ))}
                </div>

                <div style={bingoGrid}>
                  {card.card_numbers.map((row, rowIndex) =>
                    row.map((value, colIndex) => {
                      const unlocked = isUnlocked(value, card.unlocked_numbers || []);
                      const highlighted = cellIsHighlighted(
                        card.card_numbers,
                        card.unlocked_numbers || [],
                        rowIndex,
                        colIndex
                      );

                      return (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          style={{
                            ...bingoCell,
                            background:
                              value === "FREE"
                                ? "linear-gradient(135deg,#fde68a,#f59e0b)"
                                : highlighted
                                ? "linear-gradient(135deg,#22c55e,#16a34a)"
                                : unlocked
                                ? "linear-gradient(135deg,#3b82f6,#2563eb)"
                                : "#f3f4f6",
                            color: value === "FREE" || unlocked || highlighted ? "white" : "#111827",
                            border: highlighted
                              ? "3px solid #14532d"
                              : unlocked
                              ? "2px solid #1d4ed8"
                              : "2px solid #e5e7eb",
                          }}
                        >
                          {value}
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{ marginTop: 14, lineHeight: 1.7 }}>
                  <div><strong>Unlocked numbers:</strong> {(card.unlocked_numbers || []).length}</div>
                  <div><strong>Completed lines:</strong> {completedLines.length}</div>
                  <div><strong>Status:</strong> {hasBingo ? "BINGO achieved" : "Still in progress"}</div>
                </div>
              </>
            ) : (
              <p>No bingo card found.</p>
            )}
          </div>

          <div style={{ ...cardStyle, background: "#fff7ed" }}>
            <h2 style={{ marginTop: 0, color: "#c2410c" }}>Daily Challenge</h2>

            {challenge ? (
              <>
                <div style={{ marginBottom: 12, lineHeight: 1.7 }}>
                  <div><strong>Title:</strong> {challenge.title}</div>
                  <div><strong>Date:</strong> {challenge.challenge_date}</div>
                  <div><strong>Reward:</strong> {challenge.reward_points} points + {challenge.reward_numbers} number(s)</div>
                </div>

                <div
                  style={{
                    background: "white",
                    borderRadius: 14,
                    padding: 14,
                    border: "2px solid #fed7aa",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontWeight: "bold", marginBottom: 10 }}>
                    {challenge.payload?.question}
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {(challenge.payload?.answers || []).map((answer) => (
                      <button
                        key={answer}
                        type="button"
                        onClick={() => setSelectedAnswer(answer)}
                        disabled={attempt?.completed || submitting}
                        style={{
                          ...answerBtn,
                          background:
                            selectedAnswer === answer
                              ? "linear-gradient(135deg,#3b82f6,#2563eb)"
                              : "#fff",
                          color: selectedAnswer === answer ? "white" : "#111827",
                        }}
                      >
                        {answer}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={submitChallenge}
                    disabled={!activeMembership || attempt?.completed || submitting}
                    style={primaryBtn}
                  >
                    {attempt?.completed
                      ? "Challenge Completed"
                      : submitting
                      ? "Submitting..."
                      : "Submit Answer"}
                  </button>
                </div>

                <div style={{ marginTop: 12, lineHeight: 1.7 }}>
                  <div>
                    <strong>Today's status:</strong>{" "}
                    {attempt?.completed
                      ? attempt.correct
                        ? "Completed correctly"
                        : "Completed incorrectly"
                      : "Not attempted yet"}
                  </div>
                  {message && (
                    <div style={{ marginTop: 8, color: "#7c2d12", fontWeight: "bold" }}>
                      {message}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p>No daily challenge found.</p>
            )}
          </div>
        </div>

        <div style={twoCol}>
          <div style={{ ...cardStyle, background: "#ffffffee" }}>
            <h2 style={{ marginTop: 0, color: "#7c2d12" }}>Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p>No leaderboard entries yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {leaderboard.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      background:
                        entry.user_id === selectedUserId
                          ? "linear-gradient(135deg,#eff6ff,#dbeafe)"
                          : "white",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "bold" }}>
                        #{entry.display_rank} {entry.profiles?.display_name || "Player"}
                      </div>
                      <div style={{ color: "#64748b", fontSize: 14 }}>
                        Round {round?.week_number || "-"}
                      </div>
                    </div>
                    <div style={{ fontWeight: "bold", fontSize: 20 }}>{entry.points}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...cardStyle, background: "#faf5ff" }}>
            <h2 style={{ marginTop: 0, color: "#6b21a8" }}>Prizes & Winners</h2>

            <div style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 10 }}>Prizes</h3>
              {prizes.length === 0 ? (
                <p>No prizes set.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {prizes.map((prize) => (
                    <div
                      key={prize.id}
                      style={{
                        border: "2px solid #e9d5ff",
                        borderRadius: 12,
                        padding: 12,
                        background: "white",
                      }}
                    >
                      <div style={{ fontWeight: "bold" }}>{prize.title}</div>
                      <div style={{ color: "#6b21a8" }}>
                        {prize.prize_type.toUpperCase()} • {formatMoney(prize.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 style={{ marginBottom: 10 }}>Winners</h3>
              {winners.length === 0 ? (
                <p>No winners yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {winners.map((winner) => (
                    <div
                      key={winner.id}
                      style={{
                        border: "2px solid #ddd6fe",
                        borderRadius: 12,
                        padding: 12,
                        background: "white",
                      }}
                    >
                      <div style={{ fontWeight: "bold" }}>
                        {winner.profiles?.display_name || "Winner"}
                      </div>
                      <div>
                        {winner.win_type.toUpperCase()} • {formatMoney(winner.prize_amount)}
                      </div>
                      {winner.notes && (
                        <div style={{ color: "#64748b", fontSize: 14 }}>{winner.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, background: "#f0fdf4" }}>
          <h2 style={{ marginTop: 0, color: "#166534" }}>How This Version Works</h2>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Players pay membership, not per draw</li>
            <li>Daily skill challenge unlocks numbers on the bingo card</li>
            <li>Correct answers award points and number reveals</li>
            <li>Leaderboard tracks weekly performance</li>
            <li>First completed bingo line can win the weekly bingo prize</li>
            <li>Jackpot and leaderboard prizes are platform-funded</li>
          </ul>
        </div>
      </div>
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

const cardStyle = {
  background: "#fff",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  marginBottom: 16,
};

const gridStats = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const selectStyle = {
  width: "100%",
  maxWidth: 320,
  padding: 14,
  borderRadius: 12,
  border: "2px solid #c7d2fe",
  fontSize: 16,
  background: "white",
};

const inputStyle = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "2px solid #fed7aa",
  fontSize: 15,
  background: "white",
};

const primaryBtn = {
  background: "linear-gradient(135deg,#f59e0b,#f97316)",
  color: "white",
  border: "none",
  padding: "14px 20px",
  borderRadius: 12,
  fontWeight: "bold",
  cursor: "pointer",
};

const dangerBtn = {
  background: "linear-gradient(135deg,#ef4444,#dc2626)",
  color: "white",
  border: "none",
  padding: "14px 20px",
  borderRadius: 12,
  fontWeight: "bold",
  cursor: "pointer",
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

const answerBtn = {
  border: "2px solid #d1d5db",
  borderRadius: 12,
  padding: "12px 14px",
  textAlign: "left",
  cursor: "pointer",
  fontWeight: "bold",
};

const bingoHeaderRow = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 8,
  marginBottom: 8,
};

const bingoHeaderCell = {
  textAlign: "center",
  fontWeight: "bold",
  fontSize: 22,
  color: "#1e3a8a",
};

const bingoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 8,
};

const bingoCell = {
  minHeight: 62,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
  fontSize: 18,
  textAlign: "center",
  padding: 6,
};
