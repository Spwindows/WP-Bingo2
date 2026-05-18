const LOTTERY_TYPES = {
  tattslotto: {
    label: "TattsLotto",
    mainCount: 6,
    mainMin: 1,
    mainMax: 45,
    hasPowerball: false
  },
  ozlotto: {
    label: "Oz Lotto",
    mainCount: 7,
    mainMin: 1,
    mainMax: 47,
    hasPowerball: false
  },
  powerball: {
    label: "Powerball",
    mainCount: 7,
    mainMin: 1,
    mainMax: 35,
    hasPowerball: true,
    powerballMin: 1,
    powerballMax: 20
  }
};

const MOOD_PROFILES = {
  happy: {
    label: "Happy",
    style: "high",
    copy: "Your mood added a high-energy lift, pulling the spread toward brighter, bolder numbers."
  },
  calm: {
    label: "Calm",
    style: "balanced",
    copy: "Your calm mood created a steady, balanced number spread."
  },
  lucky: {
    label: "Lucky",
    style: "mixed",
    copy: "Your lucky mood mixed birthday numbers with today’s date for a playful lucky spread."
  },
  stressed: {
    label: "Stressed",
    style: "grounding",
    copy: "Your mood added a grounding bias, keeping the pick steadier and more centred."
  },
  excited: {
    label: "Excited",
    style: "high",
    copy: "Your excited mood pushed extra spark into today’s number ritual."
  },
  tired: {
    label: "Tired",
    style: "grounding",
    copy: "Your tired mood softened the spread into a grounded, steady pick."
  },
  hopeful: {
    label: "Hopeful",
    style: "mixed",
    copy: "Your hopeful mood blended higher-energy numbers with your personal birthday signature."
  },
  confident: {
    label: "Confident",
    style: "high",
    copy: "Your confident mood added a bold high-energy bias to the draw."
  },
  anxious: {
    label: "Anxious",
    style: "grounding",
    copy: "Your anxious mood added grounding energy, keeping today’s numbers stable and balanced."
  },
  grateful: {
    label: "Grateful",
    style: "balanced",
    copy: "Your grateful mood created a balanced lucky spread with a softer rhythm."
  }
};

const STORAGE_KEY = "luckyNumberPicker.savedPicks.v1";

const form = document.getElementById("luckyForm");
const genderInput = document.getElementById("gender");
const dobInput = document.getElementById("dob");
const moodInput = document.getElementById("mood");
const lotteryTypeInput = document.getElementById("lotteryType");

const resultCard = document.getElementById("resultCard");
const resultLotteryLabel = document.getElementById("resultLotteryLabel");
const numberRow = document.getElementById("numberRow");
const powerballWrap = document.getElementById("powerballWrap");
const powerballBall = document.getElementById("powerballBall");
const luckyExplanation = document.getElementById("luckyExplanation");
const copyBtn = document.getElementById("copyBtn");
const saveBtn = document.getElementById("saveBtn");
const clearSavedBtn = document.getElementById("clearSavedBtn");
const savedPicks = document.getElementById("savedPicks");
const statusMessage = document.getElementById("statusMessage");

let currentPick = null;

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getBirthSignature(dateOfBirth) {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const digits = `${year}${month}${day}`.split("").map(Number);
  const digitTotal = digits.reduce((total, digit) => total + digit, 0);
  let lifePath = digitTotal;

  while (lifePath > 9) {
    lifePath = String(lifePath)
      .split("")
      .map(Number)
      .reduce((total, digit) => total + digit, 0);
  }

  return {
    year,
    month,
    day,
    digitTotal,
    lifePath
  };
}

function createSeed({ gender, dateOfBirth, mood, lotteryType }) {
  const today = getTodayKey();
  const birthSignature = getBirthSignature(dateOfBirth);
  const seedParts = [
    gender,
    dateOfBirth,
    mood,
    today,
    lotteryType,
    birthSignature.day,
    birthSignature.month,
    birthSignature.year,
    birthSignature.digitTotal,
    birthSignature.lifePath
  ];

  return hashString(seedParts.join("|"));
}

function seededRandom(seed) {
  let state = seed >>> 0;

  return function nextRandom() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildWeightedPool(config, moodProfile, birthSignature) {
  const pool = [];

  for (let number = config.mainMin; number <= config.mainMax; number += 1) {
    let weight = 3;

    if (number === birthSignature.day || number === birthSignature.month || number === birthSignature.lifePath) {
      weight += 4;
    }

    if (number === clampNumber(birthSignature.digitTotal, config.mainMin, config.mainMax)) {
      weight += 2;
    }

    if (moodProfile.style === "high" && number > Math.floor(config.mainMax * 0.58)) {
      weight += 2;
    }

    if (moodProfile.style === "grounding" && number <= Math.ceil(config.mainMax * 0.42)) {
      weight += 2;
    }

    if (moodProfile.style === "balanced") {
      const middle = config.mainMax / 2;
      const distance = Math.abs(number - middle);
      if (distance <= config.mainMax * 0.22) {
        weight += 2;
      }
    }

    if (moodProfile.style === "mixed") {
      if (number % 7 === birthSignature.lifePath % 7 || number % 3 === birthSignature.month % 3) {
        weight += 2;
      }
    }

    for (let i = 0; i < weight; i += 1) {
      pool.push(number);
    }
  }

  return pool;
}

function generateUniqueNumbers({ count, min, max, random, moodProfile, birthSignature }) {
  const config = {
    mainCount: count,
    mainMin: min,
    mainMax: max
  };

  const weightedPool = buildWeightedPool(config, moodProfile, birthSignature);
  const selected = new Set();
  let safetyCounter = 0;

  while (selected.size < count && safetyCounter < 1000) {
    safetyCounter += 1;
    const index = Math.floor(random() * weightedPool.length);
    const candidate = weightedPool[index];
    selected.add(candidate);
  }

  for (let number = min; selected.size < count && number <= max; number += 1) {
    selected.add(number);
  }

  return Array.from(selected).sort((a, b) => a - b);
}

function generatePowerballNumber(config, random, birthSignature) {
  const span = config.powerballMax - config.powerballMin + 1;
  const personalBoost = (birthSignature.lifePath + birthSignature.month) % span;
  const seededPick = Math.floor(random() * span);
  return config.powerballMin + ((seededPick + personalBoost) % span);
}

function getGenderLabel(value) {
  const labels = {
    female: "Female",
    male: "Male",
    "non-binary": "Non-binary",
    "prefer-not": "Prefer not to say"
  };

  return labels[value] || "Not selected";
}

function generateLuckyPick(formValues) {
  const config = LOTTERY_TYPES[formValues.lotteryType];
  const moodProfile = MOOD_PROFILES[formValues.mood];
  const birthSignature = getBirthSignature(formValues.dateOfBirth);
  const seed = createSeed(formValues);
  const random = seededRandom(seed);

  const numbers = generateUniqueNumbers({
    count: config.mainCount,
    min: config.mainMin,
    max: config.mainMax,
    random,
    moodProfile,
    birthSignature
  });

  const powerball = config.hasPowerball
    ? generatePowerballNumber(config, random, birthSignature)
    : null;

  return {
    id: `${Date.now()}-${seed}`,
    seed,
    lotteryType: formValues.lotteryType,
    lotteryLabel: config.label,
    gender: formValues.gender,
    genderLabel: getGenderLabel(formValues.gender),
    dateOfBirth: formValues.dateOfBirth,
    mood: formValues.mood,
    moodLabel: moodProfile.label,
    dateGenerated: getTodayKey(),
    numbers,
    powerball,
    explanation: buildExplanation(config, moodProfile, birthSignature)
  };
}

function buildExplanation(config, moodProfile, birthSignature) {
  const birthdayPieces = [
    birthSignature.day,
    birthSignature.month,
    birthSignature.lifePath
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  return [
    `Your birthday signature added ${birthdayPieces.join(", ")} into the ritual.`,
    moodProfile.copy,
    `Today’s date refreshed your ${config.label} lucky pick for this draw style.`
  ].join(" ");
}

function getFormValues() {
  return {
    gender: genderInput.value,
    dateOfBirth: dobInput.value,
    mood: moodInput.value,
    lotteryType: lotteryTypeInput.value
  };
}

function setError(fieldId, message) {
  const errorEl = document.getElementById(`${fieldId}Error`);
  if (errorEl) {
    errorEl.textContent = message;
  }
}

function clearErrors() {
  ["gender", "dob", "mood", "lotteryType"].forEach((fieldId) => setError(fieldId, ""));
}

function validateForm(values) {
  clearErrors();

  const errors = {};

  if (!values.gender) {
    errors.gender = "Choose a gender option.";
  }

  if (!values.dateOfBirth) {
    errors.dob = "Enter your date of birth.";
  }

  if (!values.mood) {
    errors.mood = "Choose how you are feeling.";
  }

  if (!values.lotteryType) {
    errors.lotteryType = "Choose TattsLotto, Oz Lotto or Powerball.";
  }

  Object.entries(errors).forEach(([fieldId, message]) => setError(fieldId, message));

  return Object.keys(errors).length === 0;
}

function renderResults(pick) {
  resultCard.hidden = false;
  resultLotteryLabel.textContent = pick.lotteryLabel;
  numberRow.innerHTML = "";

  pick.numbers.forEach((number) => {
    const ball = document.createElement("div");
    ball.className = "number-ball";
    ball.textContent = number;
    numberRow.appendChild(ball);
  });

  if (pick.powerball !== null) {
    powerballWrap.hidden = false;
    powerballBall.textContent = pick.powerball;
  } else {
    powerballWrap.hidden = true;
    powerballBall.textContent = "";
  }

  luckyExplanation.textContent = pick.explanation;
  statusMessage.textContent = "";

  resultCard.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

function formatPickText(pick) {
  const main = pick.numbers.join(", ");
  if (pick.powerball !== null) {
    return `${pick.lotteryLabel}: ${main} | Powerball: ${pick.powerball}`;
  }

  return `${pick.lotteryLabel}: ${main}`;
}

async function copyNumbers() {
  if (!currentPick) {
    statusMessage.textContent = "Pick numbers first.";
    return;
  }

  const text = formatPickText(currentPick);

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    statusMessage.textContent = "Lucky numbers copied.";
  } catch (error) {
    statusMessage.textContent = "Copy failed. You can manually select the numbers.";
  }
}

function getSavedPicks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function setSavedPicks(picks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
}

function savePick() {
  if (!currentPick) {
    statusMessage.textContent = "Pick numbers before saving.";
    return;
  }

  const saved = getSavedPicks();
  const alreadySaved = saved.some((pick) => {
    return pick.dateGenerated === currentPick.dateGenerated
      && pick.lotteryType === currentPick.lotteryType
      && pick.mood === currentPick.mood
      && pick.dateOfBirth === currentPick.dateOfBirth
      && pick.gender === currentPick.gender
      && pick.numbers.join(",") === currentPick.numbers.join(",")
      && pick.powerball === currentPick.powerball;
  });

  if (alreadySaved) {
    statusMessage.textContent = "This lucky pick is already saved.";
    return;
  }

  const nextSaved = [currentPick, ...saved].slice(0, 25);
  setSavedPicks(nextSaved);
  renderSavedPicks();
  statusMessage.textContent = "Lucky pick saved.";
}

function deleteSavedPick(id) {
  const saved = getSavedPicks();
  const nextSaved = saved.filter((pick) => pick.id !== id);
  setSavedPicks(nextSaved);
  renderSavedPicks();
}

function clearSavedPicks() {
  setSavedPicks([]);
  renderSavedPicks();
}

function renderSavedPicks() {
  const saved = getSavedPicks();
  savedPicks.innerHTML = "";

  if (!saved.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No saved picks yet. Generate a lucky set and save it here.";
    savedPicks.appendChild(empty);
    return;
  }

  saved.forEach((pick) => {
    const item = document.createElement("article");
    item.className = "saved-item";

    const numbers = document.createElement("div");
    numbers.className = "saved-numbers";
    numbers.textContent = formatPickText(pick);

    const meta = document.createElement("div");
    meta.className = "saved-meta";

    const metaItems = [
      pick.lotteryLabel,
      `Mood: ${pick.moodLabel}`,
      `Generated: ${pick.dateGenerated}`
    ];

    metaItems.forEach((text) => {
      const pill = document.createElement("span");
      pill.className = "saved-pill";
      pill.textContent = text;
      meta.appendChild(pill);
    });

    const actions = document.createElement("div");
    actions.className = "saved-actions";

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-btn";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteSavedPick(pick.id));

    actions.appendChild(deleteButton);
    item.appendChild(numbers);
    item.appendChild(meta);
    item.appendChild(actions);
    savedPicks.appendChild(item);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const values = getFormValues();

  if (!validateForm(values)) {
    return;
  }

  currentPick = generateLuckyPick(values);
  renderResults(currentPick);
});

copyBtn.addEventListener("click", copyNumbers);
saveBtn.addEventListener("click", savePick);
clearSavedBtn.addEventListener("click", clearSavedPicks);

renderSavedPicks();
