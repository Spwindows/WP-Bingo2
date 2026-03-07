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

function generateMemorySequence(length = 5) {
  return Array.from({ length }, () => Math.floor(Math.random() * 9) + 1);
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

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [deletingPlayer, setDeletingPlayer] = useState(false);
  const [resettingChallenge, setResettingChallenge] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [newPlayerPlan, setNewPlayerPlan] = useState("standard");

  const [questionTitle, setQuestionTitle] = useState("");
  const [memoryLength, setMemoryLength] = useState("5");
  const [rewardPoints, setRewardPoints] = useState("5");
  const [rewardNumbers, setRewardNumbers] = useState("1");

  const [memorySequence, setMemorySequence] = useState([]);
  const [showSequence, setShowSequence] = useState(false);
  const [memoryStarted, setMemoryStarted] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [memoryLocked, setMemoryLocked] = useState(false);

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

  useEffect(() => {
    if (challenge) {
      setQuestionTitle(challenge.title || "");
      setMemoryLength(String(challenge.payload?.sequence_length ?? 5));
      setRewardPoints(String(challenge.reward_points ?? 5));
      setRewardNumbers(String(challenge.reward_numbers ?? 1));
    }
  }, [challenge]);

  useEffect(() => {
    resetLocalMemoryGame();
  }, [selectedUserId, challenge?.id]);

  function resetLocalMemoryGame() {
    setMemorySequence([]);
    setShowSequence(false);
    setMemoryStarted(false);
    setUserInput("");
    setMemoryLocked(false);
  }

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
      const nonAdminProfiles = data.filter((p) => !p.is_admin);

      if (!selectedUserId && nonAdminProfiles.length > 0) {
        setSelectedUserId(nonAdminProfiles[0].id);
      }

      if (
        selectedUserId &&
        !data.some((p) => p.id === selectedUserId) &&
        nonAdminProfiles.length > 0
      ) {
        setSelectedUserId(nonAdminProfiles[0].id);
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

      const latestChallenge = await supabase
        .from("daily_challenges")
        .select("*")
        .eq("round_id", activeRound.id)
        .order("challenge_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      setChallenge(latestChallenge.data || null);

      if (selectedUserId) {
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

  async function deleteSelectedPlayer() {
    if (!adminUnlocked) {
      setMessage("Unlock admin first.");
      return;
    }

    if (!selectedUserId) {
      setMessage("No player selected.");
      return;
    }

    const player = profiles.find((p) => p.id === selectedUserId);
    if (!player || player.is_admin) {
      setMessage("Cannot delete this player.");
      return;
    }

    const ok = window.confirm(
      `Delete ${player.display_name}? This will remove their profile, membership, bingo card, leaderboard entry, and challenge attempts.`
    );
    if (!ok) return;

    setDeletingPlayer(true);
    setMessage("");

    await supabase.from("challenge_attempts").delete().eq("user_id", selectedUserId);
    await supabase.from("winners").delete().eq("user_id", selectedUserId);
    await supabase.from("leaderboard_entries").delete().eq("user_id", selectedUserId);
    await supabase.from("bingo_cards").delete().eq("user_id", selectedUserId);
    await supabase.from("memberships").delete().eq("user_id", selectedUserId);

    const { error } = await supabase.from("profiles").delete().eq("id", selectedUserId);

    if (error) {
      console.error("Delete player failed:", error);
      setDeletingPlayer(false);
      setMessage("Could not delete player.");
      return;
    }

    setDeletingPlayer(false);
    setMessage("Player deleted.");
    setSelectedUserId("");
    setMembership(null);
    setCard(null);
    setAttempt(null);
    resetLocalMemoryGame();

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
    resetLocalMemoryGame();
    setResettingChallenge(false);
    setMessage("Today's challenge has been reset for this player.");
    await refreshAll();
  }

  async function saveChallengeQuestion() {
    if (!adminUnlocked) {
      setMessage("Unlock admin first.");
      return;
    }
    if (!challenge?.id) {
      setMessage("No challenge found.");
      return;
    }

    const sequenceLength = Number(memoryLength || 5);
    const points = Number(rewardPoints || 5);
    const numbers = Number(rewardNumbers || 1);

    if (!questionTitle.trim()) {
      setMessage("Enter a challenge title.");
      return;
    }
    if (sequenceLength < 3 || sequenceLength > 9) {
      setMessage("Sequence length should be between 3 and 9.");
      return;
    }

    setSavingQuestion(true);
    setMessage("");

    const { error } = await supabase
      .from("daily_challenges")
      .update({
        title: questionTitle.trim(),
        challenge_type: "memory",
        payload: {
          sequence_length: sequenceLength,
          show_seconds: 3,
          instructions: "Memorise the sequence and type it back in the same order.",
        },
        reward_points: points,
        reward_numbers: numbers,
      })
      .eq("id", challenge.id);

    if (error) {
      console.error("Challenge save failed:", error);
      setSavingQuestion(false);
      setMessage("Could not update challenge.");
      return;
    }

    setSavingQuestion(false);
    setMessage("Memory challenge updated.");
    resetLocalMemoryGame();
    await refreshAll();
  }

  function startMemoryChallenge() {
    if (attempt?.completed) {
      setMessage("You already completed today's challenge.");
      return;
    }
    if (!activeMembership) {
      setMessage("Membership is inactive.");
      return;
    }

    const length = Number(challenge?.payload?.sequence_length || 5);
    const sequence = generateMemorySequence(length);

    setMemorySequence(sequence);
    setShowSequence(true);
    setMemoryStarted(true);
    setMemoryLocked(true);
    setUserInput("");
    setMessage("Memorise the sequence.");

    const showMs = Number(challenge?.payload?.show_seconds || 3) * 1000;

    setTimeout(() => {
      setShowSequence(false);
      setMemoryLocked(false);
      setMessage("Enter the sequence in the same order, separated by spaces.");
    }, showMs);
  }

  async function submitMemoryChallenge() {
    if (!currentProfile || !activeMembership || !card || !challenge) return;

    if (attempt?.completed) {
      setMessage("You already completed today's challenge.");
      return;
    }

    if (!memoryStarted || showSequence) {
      setMessage("Start the memory challenge first.");
      return;
    }

    if (!userInput.trim()) {
      setMessage("Enter the sequence.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    const entered = userInput
      .trim()
      .split(/[\s,]+/)
      .map((x) => Number(x))
      .filter((x) => !Number.isNaN(x));

    let correctCount = 0;
    for (let i = 0; i < memorySequence.length; i += 1) {
      if (entered[i] === memorySequence[i]) correctCount += 1;
    }

    let isCorrect = false;
    let rewardPointsValue = 0;
    let rewardNumbersValue = 0;
    let score = 0;

    if (correctCount === memorySequence.length) {
      isCorrect = true;
      rewardPointsValue = Number(challenge.reward_points || 5) + 5;
      rewardNumbersValue = Math.max(2, Number(challenge.reward_numbers || 1));
      score = 100;
    } else if (correctCount >= memorySequence.length - 1) {
      isCorrect = true;
      rewardPointsValue = Number(challenge.reward_points || 5);
      rewardNumbersValue = Number(challenge.reward_numbers || 1);
      score = 80;
    } else {
      isCorrect = false;
      rewardPointsValue = 0;
      rewardNumbersValue = 0;
      score = correctCount * 10;
    }

    const newlyUnlocked = isCorrect
      ? pickRandomLockedNumbers(card.card_numbers, card.unlocked_numbers || [], rewardNumbersValue)
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
      score,
      correct: isCorrect,
      completed: true,
      points_awarded: rewardPointsValue,
      numbers_awarded: newlyUnlocked.length,
    });

    if (attemptError) {
      console.error("Attempt save failed:", attemptError);
      setSubmitting(false);
      setMessage("Could not save attempt.");
      return;
    }

    const existingLeaderboard = leaderboard.find((x) => x.user_id === selectedUserId);
    const currentPoints = existingLeaderboard?.points || 0;

    let leaderboardError = null;

    if (existingLeaderboard) {
      const { error } = await supabase
        .from("leaderboard_entries")
        .update({
          points: currentPoints + rewardPointsValue,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", selectedUserId)
        .eq("round_id", round.id);

      leaderboardError = error;
    } else {
      const { error } = await supabase.from("leaderboard_entries").insert({
        user_id: selectedUserId,
        round_id: round.id,
        points: rewardPointsValue,
        updated_at: new Date().toISOString(),
      });

      leaderboardError = error;
    }

    if (leaderboardError) {
      console.error("Leaderboard update failed:", leaderboardError);
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
      console.error("Card update failed:", cardError);
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

    setSubmitting(false);
    if (correctCount === memorySequence.length) {
      setMessage(
        `Perfect memory! +${rewardPointsValue} points and +${newlyUnlocked.length} number(s).`
      );
    } else if (correctCount >= memorySequence.length - 1) {
      setMessage(
        `Good memory! You got ${correctCount}/${memorySequence.length}. +${rewardPointsValue} points and +${newlyUnlocked.length} number(s).`
      );
    } else {
      setMessage(`You got ${correctCount}/${memorySequence.length} correct. No reward this time.`);
    }

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
                £4.99 membership • Memory challenge • Leaderboard • Jackpot prizes
              </div>
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                Unlock numbers through memory skill, not luck
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
          <>
            <div style={{ ...cardStyle, background: "#fff7ed" }}>
              <h2 style={{ marginTop: 0, color: "#c2410c" }}>Add / Remove Player</h2>
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
                    onClick={deleteSelectedPlayer}
                    disabled={deletingPlayer || !selectedUserId}
                    style={dangerBtn}
                  >
                    {deletingPlayer ? "Deleting..." : "Delete Selected Player"}
                  </button>

                  <button
                    onClick={resetTodaysChallenge}
                    disabled={resettingChallenge || !selectedUserId || !challenge}
                    style={greyBtn}
                  >
                    {resettingChallenge ? "Resetting..." : "Reset Today's Challenge"}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, background: "#fefce8" }}>
              <h2 style={{ marginTop: 0, color: "#a16207" }}>Edit Today's Memory Challenge</h2>
              <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
                <input
                  value={questionTitle}
                  onChange={(e) => setQuestionTitle(e.target.value)}
                  placeholder="Challenge title"
                  style={inputStyle}
                />

                <input
                  value={memoryLength}
                  onChange={(e) => setMemoryLength(e.target.value)}
                  placeholder="Sequence length"
                  style={inputStyle}
                  inputMode="numeric"
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(e.target.value)}
                    placeholder="Reward points"
                    style={inputStyle}
                    inputMode="numeric"
                  />
                  <input
                    value={rewardNumbers}
                    onChange={(e) => setRewardNumbers(e.target.value)}
                    placeholder="Reward numbers"
                    style={inputStyle}
                    inputMode="numeric"
                  />
                </div>

                <button onClick={saveChallengeQuestion} disabled={savingQuestion} style={primaryBtn}>
                  {savingQuestion ? "Saving..." : "Save Memory Challenge"}
                </button>
              </div>
            </div>
          </>
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
            <h2 style={{ marginTop: 0, color: "#c2410c" }}>Daily Memory Challenge</h2>

            {challenge ? (
              <>
                <div style={{ marginBottom: 12, lineHeight: 1.7 }}>
                  <div><strong>Title:</strong> {challenge.title}</div>
                  <div><strong>Date:</strong> {challenge.challenge_date}</div>
                  <div>
                    <strong>Reward:</strong> {challenge.reward_points} points + {challenge.reward_numbers} number(s)
                  </div>
                  <div>
                    <strong>Sequence length:</strong> {challenge.payload?.sequence_length || 5}
                  </div>
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
                    Memorise the sequence, then type it back in the same order.
                  </div>

                  {!memoryStarted && (
                    <button
                      onClick={startMemoryChallenge}
                      disabled={attempt?.completed || submitting || !activeMembership}
                      style={primaryBtn}
                    >
                      Start Challenge
                    </button>
                  )}

                  {showSequence && (
                    <div
                      style={{
                        marginTop: 16,
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        justifyContent: "center",
                      }}
                    >
                      {memorySequence.map((num, index) => (
                        <div
                          key={`${num}-${index}`}
                          style={{
                            width: 54,
                            height: 54,
                            borderRadius: 14,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "bold",
                            fontSize: 24,
                            color: "white",
                            background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                          }}
                        >
                          {num}
                        </div>
                      ))}
                    </div>
                  )}

                  {memoryStarted && !showSequence && (
                    <div style={{ marginTop: 14 }}>
                      <input
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Enter numbers like: 4 7 1 9 3"
                        style={inputStyle}
                        disabled={memoryLocked || attempt?.completed || submitting}
                      />

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                        <button
                          onClick={submitMemoryChallenge}
                          disabled={attempt?.completed || submitting}
                          style={primaryBtn}
                        >
                          {attempt?.completed
                            ? "Challenge Completed"
                            : submitting
                            ? "Submitting..."
                            : "Submit Sequence"}
                        </button>

                        <button
                          onClick={startMemoryChallenge}
                          disabled={attempt?.completed || submitting}
                          style={greyBtn}
                        >
                          Replay Sequence
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12, lineHeight: 1.7 }}>
                  <div>
                    <strong>Today's status:</strong>{" "}
                    {attempt?.completed
                      ? attempt.correct
                        ? "Completed successfully"
                        : "Completed unsuccessfully"
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
            <li>Daily memory challenge unlocks numbers on the bingo card</li>
            <li>Perfect memory earns bigger rewards</li>
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
  boxSizing: "border-box",
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
