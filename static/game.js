/* ======================
   Tetris – game.js
   ====================== */

// --- Canvas setup ---
const boardCanvas = document.getElementById("tetris");
const boardCtx = boardCanvas.getContext("2d");
boardCtx.scale(20, 20); // 240x400 => 12x20

const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");
nextCtx.scale(20, 20); // 120x120 => 6x6

const holdCanvas = document.getElementById("hold");
const holdCtx = holdCanvas.getContext("2d");
holdCtx.scale(20, 20);

// --- UI elements ---
const $score   = document.getElementById("score");
const $lines   = document.getElementById("lines");
const $level   = document.getElementById("level");
const $hiscores = document.getElementById("hiscores");
const $onlineScores = document.getElementById("online-scores");
const $playerName = document.getElementById("playerName");

// Mobile buttons (אם קיימים)
const btn = id => document.getElementById(id);
if (btn("btn-left")) {
  btn("btn-left").onclick   = () => move(-1);
  btn("btn-right").onclick  = () => move(1);
  btn("btn-down").onclick   = () => softDrop();
  btn("btn-drop").onclick   = () => hardDrop();
  btn("btn-rotate").onclick = () => rotate(+1);
  btn("btn-hold").onclick   = () => holdPiece();
  btn("btn-pause").onclick  = () => togglePause();
  btn("btn-restart").onclick= () => restart();
}

// --- Sounds ---
let bgMusic = null;
let lineSound = null;
let audioStarted = false;

try {
  bgMusic = new Audio("/static/sounds/bg.mp3");
  bgMusic.loop = true;
  lineSound = new Audio("/static/sounds/line.wav");
} catch (e) {
  console.warn("Audio init failed (probably missing files)", e);
}

function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;
  if (bgMusic) {
    bgMusic.volume = 0.4;
    bgMusic.play().catch(() => {});
  }
}

["keydown", "mousedown", "touchstart"].forEach(evt => {
  window.addEventListener(evt, startAudioOnce, { once: true });
});

// --- Game constants ---
const COLORS = {
  0: null,
  1: "#00FFFF", // I
  2: "#FFFF00", // O
  3: "#800080", // T
  4: "#00FF00", // S
  5: "#FF0000", // Z
  6: "#0000FF", // J
  7: "#FFA500"  // L
};

const PIECES = {
  "I": [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  "O": [
    [2, 2],
    [2, 2]
  ],
  "T": [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0]
  ],
  "S": [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0]
  ],
  "Z": [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0]
  ],
  "J": [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0]
  ],
  "L": [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0]
  ]
};
const TYPES = Object.keys(PIECES);

// --- Helpers ---
function createMatrix(w, h) {
  const matrix = [];
  while (h--) matrix.push(new Array(w).fill(0));
  return matrix;
}

function cloneMatrix(m) {
  return m.map(row => row.slice());
}

function clearCanvas(ctx, w, h) {
  ctx.fillStyle = "#050816";
  ctx.fillRect(0, 0, w, h);

  // grid עדין
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 0.03;
  for (let x = 0; x < w; x++) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawMatrix(ctx, matrix, offset) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        ctx.fillStyle = COLORS[value];
        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);

        ctx.lineWidth = 0.05;
        ctx.strokeStyle = "#0a0d14";
        ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
      }
    });
  });
}

function collide(arena, player) {
  const m = player.matrix;
  const o = player.pos;
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (
        m[y][x] !== 0 &&
        (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0 && arena[y + player.pos.y]) {
        arena[y + player.pos.y][x + player.pos.x] = value;
      }
    });
  });
}

// --- Arena & player ---
const arena = createMatrix(12, 20);

const player = {
  pos: { x: 0, y: 0 },
  matrix: null,
  type: null,
  next: [],
  hold: null,
  canHold: true,
  score: 0,
  lines: 0,
  level: 1
};

// --- Random 7-bag ---
let bag = [];

function refillBag() {
  bag = TYPES.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function nextType() {
  if (!bag.length) refillBag();
  return bag.pop();
}

function queueFill() {
  while (player.next.length < 5) {
    player.next.push(nextType());
  }
}

function createPiece(type) {
  return cloneMatrix(PIECES[type]);
}

// --- Game logic ---
function playerReset() {
  queueFill();
  const type = player.next.shift();
  player.type = type;
  player.matrix = createPiece(type);
  player.pos.y = 0;
  player.pos.x =
    ((arena[0].length / 2) | 0) - ((player.matrix[0].length / 2) | 0);
  player.canHold = true;

  if (collide(arena, player)) {
    // Game over
    handleGameOver();
  }
}

function handleGameOver() {
  saveHiScoreLocal(player.score);
  saveHiScoreServer(player.score);
  renderHiScores();
  fetchTopScoresServer();

  arena.forEach(row => row.fill(0));
  player.score = 0;
  player.lines = 0;
  player.level = 1;
  dropInterval = levelToInterval(player.level);
}

function holdPiece() {
  if (!player.canHold) return;

  if (player.hold === null) {
    player.hold = { type: player.type, matrix: createPiece(player.type) };
    playerReset();
  } else {
    const tmp = { type: player.type, matrix: player.matrix };
    player.type = player.hold.type;
    player.matrix = createPiece(player.type);
    player.hold = tmp;
    player.pos.y = 0;
    player.pos.x =
      ((arena[0].length / 2) | 0) - ((player.matrix[0].length / 2) | 0);
    if (collide(arena, player)) {
      // אם אין מקום לצורה שהוחזרה – לא מחליפים
      player.type = tmp.type;
      player.matrix = tmp.matrix;
    }
  }

  player.canHold = false;
  drawSide();
}

function arenaSweep() {
  let rowCount = 0;
  outer: for (let y = arena.length - 1; y >= 0; y--) {
    for (let x = 0; x < arena[y].length; x++) {
      if (arena[y][x] === 0) {
        continue outer;
      }
    }
    const row = arena.splice(y, 1)[0].fill(0);
    arena.unshift(row);
    y++;
    rowCount++;
  }

  if (rowCount > 0) {
    const lineScores = [0, 100, 300, 500, 800];
    const base = lineScores[rowCount] || rowCount * 200;
    player.score += base * player.level;
    player.lines += rowCount;

    if (lineSound) {
      try { lineSound.currentTime = 0; lineSound.play().catch(() => {}); } catch(e){}
    }

    const newLevel = 1 + Math.floor(player.lines / 10);
    if (newLevel !== player.level) {
      player.level = newLevel;
      dropInterval = levelToInterval(player.level);
    }
    updateStats();
  }
}

function updateStats() {
  $score.textContent = player.score.toLocaleString();
  $lines.textContent = player.lines;
  $level.textContent = player.level;
}

function levelToInterval(level) {
  return Math.max(1000 - (level - 1) * 80, 120); // הולך ומתגבר
}

// --- Controls ---
function move(dir) {
  player.pos.x += dir;
  if (collide(arena, player)) {
    player.pos.x -= dir;
  }
}

function softDrop() {
  player.pos.y++;
  if (collide(arena, player)) {
    player.pos.y--;
    merge(arena, player);
    arenaSweep();
    playerReset();
    drawSide();
  }
  dropCounter = 0;
}

function hardDrop() {
  while (!collide(arena, player)) {
    player.pos.y++;
  }
  player.pos.y--;
  merge(arena, player);
  arenaSweep();
  playerReset();
  drawSide();
  dropCounter = 0;
}

// Rotations – פשוט, עם נסיונות wall-kick קלים
function rotate(dir) {
  const oldMatrix = player.matrix;
  const rotated = rotateMatrix(player.matrix, dir);
  player.matrix = rotated;

  const posX = player.pos.x;
  let offset = 1;
  while (collide(arena, player)) {
    player.pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > player.matrix[0].length) {
      // לא הצלחנו – מחזירים
      player.matrix = oldMatrix;
      player.pos.x = posX;
      return;
    }
  }
}

function rotateMatrix(matrix, dir) {
  const m = cloneMatrix(matrix);
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < y; x++) {
      [m[x][y], m[y][x]] = [m[y][x], m[x][y]];
    }
  }
  if (dir > 0) {
    m.forEach(row => row.reverse());
  } else {
    m.reverse();
  }
  return m;
}

// --- Keyboard events ---
document.addEventListener("keydown", e => {
  if (e.repeat) return;
  switch (e.code) {
    case "ArrowLeft":
      move(-1);
      break;
    case "ArrowRight":
      move(1);
      break;
    case "ArrowDown":
      softDrop();
      break;
    case "Space":
      e.preventDefault();
      hardDrop();
      break;
    case "KeyQ":
      rotate(-1);
      break;
    case "KeyE":
      rotate(1);
      break;
    case "KeyC":
      holdPiece();
      break;
    case "KeyP":
      togglePause();
      break;
    case "KeyR":
      restart();
      break;
  }
});

// --- Draw loops ---
function drawBoard() {
  clearCanvas(boardCtx, boardCanvas.width / 20, boardCanvas.height / 20);
  drawMatrix(boardCtx, arena, { x: 0, y: 0 });
  drawMatrix(boardCtx, player.matrix, player.pos);
}

function drawNext() {
  clearCanvas(nextCtx, nextCanvas.width / 20, nextCanvas.height / 20);
  if (player.next.length) {
    const type = player.next[0];
    const m = createPiece(type);
    const off = {
      x: ((6 - m[0].length) / 2),
      y: ((6 - m.length) / 2)
    };
    drawMatrix(nextCtx, m, off);
  }
}

function drawHold() {
  clearCanvas(holdCtx, holdCanvas.width / 20, holdCanvas.height / 20);
  if (player.hold) {
    const m = createPiece(player.hold.type);
    const off = {
      x: ((6 - m[0].length) / 2),
      y: ((6 - m.length) / 2)
    };
    drawMatrix(holdCtx, m, off);
  }
}

function drawSide() {
  drawNext();
  drawHold();
}

// --- Game loop ---
let dropCounter = 0;
let dropInterval = levelToInterval(1);
let lastTime = 0;
let paused = false;

function update(time = 0) {
  const dt = time - lastTime;
  lastTime = time;

  if (!paused) {
    dropCounter += dt;
    if (dropCounter > dropInterval) {
      player.pos.y++;
      if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        arenaSweep();
        playerReset();
        drawSide();
      }
      dropCounter = 0;
    }
    drawBoard();
  }

  requestAnimationFrame(update);
}

function togglePause() {
  paused = !paused;
}

function restart() {
  arena.forEach(row => row.fill(0));
  player.score = 0;
  player.lines = 0;
  player.level = 1;
  player.hold = null;
  player.next.length = 0;
  bag.length = 0;
  dropInterval = levelToInterval(1);
  updateStats();
  playerReset();
  drawSide();
}

// --- High scores: local + server ---
// localStorage only keeps top 5 on this device

function loadHiScores() {
  const arr = JSON.parse(localStorage.getItem("tetris_hiscores_v1") || "[]");
  return Array.isArray(arr) ? arr : [];
}

function saveHiScoreLocal(score) {
  if (!score || score <= 0) return;
  const arr = loadHiScores();
  arr.push({ score, date: new Date().toISOString() });
  arr.sort((a, b) => b.score - a.score);
  const top = arr.slice(0, 5);
  localStorage.setItem("tetris_hiscores_v1", JSON.stringify(top));
}

function renderHiScores() {
  const arr = loadHiScores();
  if (!$hiscores) return;
  $hiscores.innerHTML = arr
    .map(x => `<li>${x.score.toLocaleString()}</li>`)
    .join("");
}

// Online (server) scores
async function saveHiScoreServer(score) {
  if (!score || score <= 0) return;
  const name = ($playerName && $playerName.value.trim()) || "שחקן";
  try {
    await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score })
    });
  } catch (err) {
    console.warn("saveHiScoreServer failed:", err);
  }
}

async function fetchTopScoresServer() {
  if (!$onlineScores) return;
  try {
    const res = await fetch("/api/scores");
    if (!res.ok) return;
    const data = await res.json();
    $onlineScores.innerHTML = data
      .map((r, i) => `<li>${i + 1}. ${r.name} – ${r.score}</li>`)
      .join("");
  } catch (err) {
    console.warn("fetchTopScoresServer failed:", err);
  }
}

// --- Init ---
function init() {
  queueFill();
  playerReset();
  drawSide();
  updateStats();
  renderHiScores();
  fetchTopScoresServer();
  update();
}

init();
