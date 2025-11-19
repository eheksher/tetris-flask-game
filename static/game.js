// =========================
//  TETRIS - game.js (RTL)
// =========================

// --- Canvas setup ---
const boardCanvas = document.getElementById("tetris");
const boardCtx = boardCanvas.getContext("2d");
boardCtx.scale(20, 20); // 12x20 תאים

const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");
nextCtx.scale(20, 20);  // נציג כגריד 6x6

const holdCanvas = document.getElementById("hold");
const holdCtx = holdCanvas.getContext("2d");
holdCtx.scale(20, 20);  // נציג כגריד 6x6

// --- UI elements ---
const $score = document.getElementById("score");
const $lines = document.getElementById("lines");
const $level = document.getElementById("level");
const $hiscores = document.getElementById("hiscores");

// --- Mobile buttons ---
const btn = id => document.getElementById(id);
btn("btn-left").onclick   = () => move(-1);
btn("btn-right").onclick  = () => move(1);
btn("btn-down").onclick   = () => softDrop();
btn("btn-drop").onclick   = () => hardDrop();
btn("btn-rotate").onclick = () => rotate(+1);
btn("btn-hold").onclick   = () => hold();
btn("btn-pause").onclick  = () => togglePause();
btn("btn-restart").onclick= () => restart();

// --- Game constants ---
const COLORS = {
  0: null, 1: "#00FFFF", // I
  2: "#FFFF00",          // O
  3: "#800080",          // T
  4: "#00FF00",          // S
  5: "#FF0000",          // Z
  6: "#0000FF",          // J
  7: "#FFA500"           // L
};

// כל צורה בתוך מטריצת 4x4 (SRS)
const PIECES = {
  "I": [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0]
  ],
  "O": [
    [0,0,0,0],
    [0,2,2,0],
    [0,2,2,0],
    [0,0,0,0]
  ],
  "T": [
    [0,0,0,0],
    [0,3,0,0],
    [3,3,3,0],
    [0,0,0,0]
  ],
  "S": [
    [0,0,0,0],
    [0,4,4,0],
    [4,4,0,0],
    [0,0,0,0]
  ],
  "Z": [
    [0,0,0,0],
    [5,5,0,0],
    [0,5,5,0],
    [0,0,0,0]
  ],
  "J": [
    [0,0,0,0],
    [6,0,0,0],
    [6,6,6,0],
    [0,0,0,0]
  ],
  "L": [
    [0,0,0,0],
    [0,0,7,0],
    [7,7,7,0],
    [0,0,0,0]
  ]
};
const TYPES = Object.keys(PIECES);

// --- Helpers ---
function createMatrix(w, h){ const m=[]; while(h--) m.push(new Array(w).fill(0)); return m; }
function cloneMatrix(m){ return m.map(r => r.slice()); }
function createMatrixFromType(type){ return PIECES[type].map(r => r.slice()); }

function clearCanvas(ctx, w, h){
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, w, h);
  // רשת עדינה
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  for(let x=0;x<w;x++){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=0;y<h;y++){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
}

function drawMatrix(ctx, matrix, offset){
  matrix.forEach((row,y)=>{
    row.forEach((val,x)=>{
      if(val !== 0){
        ctx.fillStyle = COLORS[val];
        ctx.fillRect(x+offset.x, y+offset.y, 1, 1);
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = "#0a0d14";
        ctx.strokeRect(x+offset.x, y+offset.y, 1, 1);
      }
    });
  });
}

function drawGhost(ctx, arena, player){
  // חישוב מיקום נחיתה
  const ghostPos = {x: player.pos.x, y: player.pos.y};
  while(!collide(arena, {matrix: player.matrix, pos: {x: ghostPos.x, y: ghostPos.y+1}})){
    ghostPos.y++;
  }
  // ציור שקוף
  ctx.save();
  ctx.globalAlpha = 0.25;
  drawMatrix(ctx, tintMatrix(player.matrix), ghostPos);
  ctx.restore();
}
function tintMatrix(matrix){
  // המרה לערך 0/1 → 8 (צבע אפור עדין)
  return matrix.map(row => row.map(v => (v ? 8 : 0)));
}
COLORS[8] = "#9aa3af"; // צבע ה-Ghost

function collide(arena, obj){
  const m = obj.matrix, o = obj.pos;
  for(let y=0;y<m.length;y++){
    for(let x=0;x<m[y].length;x++){
      if(m[y][x] !== 0 &&
         ((arena[y+o.y] && arena[y+o.y][x+o.x]) !== 0)){
        return true;
      }
    }
  }
  return false;
}

function merge(arena, player){
  player.matrix.forEach((row,y)=>{
    row.forEach((val,x)=>{
      if(val !== 0) arena[y+player.pos.y][x+player.pos.x] = val;
    });
  });
}

// --- Random generators (7-bag) ---
let bag = [];
function nextType(){
  if(bag.length === 0){
    bag = TYPES.slice();
    for(let i=bag.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [bag[i],bag[j]]=[bag[j],bag[i]];
    }
  }
  return bag.pop();
}

// --- Player / Arena ---
const arena = createMatrix(12, 20);
const player = {
  pos: {x: 0, y: 0},
  matrix: null,
  type: null,
  rot: 0,          // 0,1,2,3
  next: [],
  hold: null,
  holdType: null,
  canHold: true,
  score: 0,
  lines: 0,
  level: 1,
};

// --- Queue / Reset / Hold ---
function queueFill(){
  while(player.next.length < 5){
    player.next.push(nextType());
  }
}

function playerReset(useHeld=false){
  if(useHeld && player.hold){
    [player.matrix, player.type] = [player.hold, player.holdType];
  } else {
    queueFill();
    player.type = player.next.shift();
    player.matrix = createMatrixFromType(player.type);
  }
  player.rot = 0;
  player.pos.y = 0;
  player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
  player.canHold = true;

  if(collide(arena, player)){
    // Game over
    saveHiScore(player.score);
    arena.forEach(row => row.fill(0));
    player.score = 0; player.lines = 0; player.level = 1;
    dropInterval = levelToInterval(player.level);
    updateStats();
  }
}

function hold(){
  if(!player.canHold) return;
  if(player.hold === null){
    player.hold = cloneMatrix(player.matrix);
    player.holdType = player.type;
    playerReset(false);
  } else {
    const m = cloneMatrix(player.matrix), t = player.type;
    player.matrix = player.hold; player.type = player.holdType;
    player.hold = m;            player.holdType = t;
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    player.rot = 0;
    if(collide(arena, player)){
      // שחזור אם לא חוקי
      player.matrix = m; player.type = t;
      player.pos.y = 0;
      player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    }
  }
  player.canHold = false;
  drawSide();
}

// --- Clear lines / scoring ---
function arenaSweep(){
  let rowCount = 0;
  outer: for(let y=arena.length-1;y>=0; y--){
    for(let x=0;x<arena[y].length;x++){
      if(arena[y][x] === 0) continue outer;
    }
    const row = arena.splice(y,1)[0].fill(0);
    arena.unshift(row);
    y++;
    rowCount++;
  }
  if(rowCount > 0){
    const points = [0, 100, 300, 500, 800][rowCount] || (800 + (rowCount-4)*300);
    player.score += points * player.level;
    player.lines += rowCount;
    const newLevel = 1 + Math.floor(player.lines/10);
    if(newLevel !== player.level){
      player.level = newLevel;
      dropInterval = levelToInterval(player.level);
    }
    updateStats();
  }
}

function updateStats(){
  $score.textContent = player.score;
  $lines.textContent = player.lines;
  $level.textContent = player.level;
}

function levelToInterval(level){
  return Math.max(1000 - (level-1)*80, 120);
}

// --- Movement ---
function move(dir){
  player.pos.x += dir;
  if(collide(arena, player)) player.pos.x -= dir;
}
function softDrop(){
  player.pos.y++;
  if(collide(arena, player)){
    player.pos.y--;
    merge(arena, player);
    arenaSweep();
    playerReset(false);
    drawSide();
  }
  dropCounter = 0;
}
function hardDrop(){
  while(!collide(arena, player)) player.pos.y++;
  player.pos.y--;
  merge(arena, player);
  arenaSweep();
  playerReset(false);
  drawSide();
  dropCounter = 0;
}

// --- SRS kick tables ---
const KICKS_JLSTZ = {
  "0>1": [[0,0], [-1,0], [-1,+1], [0,-2], [-1,-2]],
  "1>0": [[0,0], [+1,0], [+1,-1], [0,+2], [+1,+2]],
  "1>2": [[0,0], [+1,0], [+1,+1], [0,-2], [+1,-2]],
  "2>1": [[0,0], [-1,0], [-1,-1], [0,+2], [-1,+2]],
  "2>3": [[0,0], [+1,0], [+1,-1], [0,+2], [+1,+2]],
  "3>2": [[0,0], [-1,0], [-1,+1], [0,-2], [-1,-2]],
  "3>0": [[0,0], [-1,0], [-1,-1], [0,+2], [-1,+2]],
  "0>3": [[0,0], [+1,0], [+1,+1], [0,-2], [+1,-2]],
};
const KICKS_I = {
  "0>1": [[0,0], [-2,0], [+1,0], [-2,-1], [+1,+2]],
  "1>0": [[0,0], [+2,0], [-1,0], [+2,+1], [-1,-2]],
  "1>2": [[0,0], [-1,0], [+2,0], [-1,+2], [+2,-1]],
  "2>1": [[0,0], [+1,0], [-2,0], [+1,-2], [-2,+1]],
  "2>3": [[0,0], [+2,0], [-1,0], [+2,+1], [-1,-2]],
  "3>2": [[0,0], [-2,0], [+1,0], [-2,-1], [+1,+2]],
  "3>0": [[0,0], [+1,0], [-2,0], [+1,-2], [-2,+1]],
  "0>3": [[0,0], [-1,0], [+2,0], [-1,+2], [+2,-1]],
};
const KICKS_O = {
  "0>1": [[0,0]], "1>2": [[0,0]], "2>3": [[0,0]], "3>0": [[0,0]],
  "1>0": [[0,0]], "2>1": [[0,0]], "3>2": [[0,0]], "0>3": [[0,0]],
};

// --- Rotation (safe) ---
function rotateMatrix(matrix, dir){
  const m = cloneMatrix(matrix);
  for(let y=0;y<m.length;y++){
    for(let x=0;x<y;x++){
      [m[x][y], m[y][x]] = [m[y][x], m[x][y]];
    }
  }
  if(dir > 0) m.forEach(row => row.reverse()); else m.reverse();
  return m;
}
function getKickTable(type){
  if(type === "I") return KICKS_I;
  if(type === "O") return KICKS_O;
  return KICKS_JLSTZ;
}
function tryRotate(dir){
  const prevMatrix = cloneMatrix(player.matrix);
  const prevX = player.pos.x, prevY = player.pos.y;
  const prevRot = player.rot;

  const nextRot = (player.rot + (dir > 0 ? 1 : 3)) % 4;
  const rotated = rotateMatrix(player.matrix, dir);
  const key = `${prevRot}>${nextRot}`;
  const kicks = getKickTable(player.type)[key] || [[0,0]];

  for (const [kx, ky] of kicks){
    player.pos.x = prevX + kx;
    player.pos.y = prevY + ky;
    player.matrix = rotated;
    if (!collide(arena, player)){
      player.rot = nextRot;
      return true;
    }
  }
  // נכשלו כל הקיקים — שחזור מלא
  player.matrix = prevMatrix;
  player.pos.x = prevX;
  player.pos.y = prevY;
  return false;
}
function rotate(dir){ tryRotate(dir); }

// --- Keyboard ---
document.addEventListener("keydown", e => {
  if(e.repeat) return;
  switch(e.code){
    case "ArrowLeft":  move(-1); break;
    case "ArrowRight": move(1); break;
    case "ArrowDown":  softDrop(); break;
    case "Space":      hardDrop(); break;
    case "KeyQ":       rotate(-1); break;
    case "KeyE":       rotate(1); break;
    case "KeyC":       hold(); break;
    case "KeyP":       togglePause(); break;
    case "KeyR":       restart(); break;
  }
});

// --- Draw loops ---
function drawBoard(){
  const W = boardCanvas.width/20, H = boardCanvas.height/20;
  clearCanvas(boardCtx, W, H);
  drawMatrix(boardCtx, arena, {x:0,y:0});
  drawGhost(boardCtx, arena, player); // ghost לפני השחקן שיראה שקוף מאחור
  drawMatrix(boardCtx, player.matrix, player.pos);
}
function drawNext(){
  const W = nextCanvas.width/20, H = nextCanvas.height/20; // 6x6
  clearCanvas(nextCtx, W, H);
  if(player.next.length){
    const type = player.next[0];
    const m = createMatrixFromType(type); // 4x4
    const off = {x: Math.floor((W - 4)/2), y: Math.floor((H - 4)/2)}; // מרכז 4 בתוך 6
    drawMatrix(nextCtx, m, off);
  }
}
function drawHold(){
  const W = holdCanvas.width/20, H = holdCanvas.height/20; // 6x6
  clearCanvas(holdCtx, W, H);
  if(player.hold){
    const off = {x: Math.floor((W - 4)/2), y: Math.floor((H - 4)/2)};
    drawMatrix(holdCtx, player.hold, off);
  }
}
function drawSide(){ drawNext(); drawHold(); }

// --- Game loop ---
let dropCounter = 0;
let dropInterval = levelToInterval(1);
let lastTime = 0;
let paused = false;

function update(time=0){
  if(!paused){
    const dt = time - lastTime;
    lastTime = time;
    dropCounter += dt;
    if(dropCounter > dropInterval){
      player.pos.y++;
      if(collide(arena, player)){
        player.pos.y--;
        merge(arena, player);
        arenaSweep();
        playerReset(false);
        drawSide();
      }
      dropCounter = 0;
    }
    drawBoard();
  } else {
    lastTime = time; // למנוע "קפיצה" אחרי Resume
  }
  requestAnimationFrame(update);
}

function togglePause(){ paused = !paused; }

function restart(){
  arena.forEach(r => r.fill(0));
  player.score = 0; player.lines = 0; player.level = 1;
  dropInterval = levelToInterval(1);
  player.hold = null; player.holdType = null; player.canHold = true; player.next.length = 0;
  playerReset(false);
  drawSide();
  updateStats();
}

// --- High scores (local) ---
function loadHiScores(){
  const arr = JSON.parse(localStorage.getItem("tetris_hiscores") || "[]");
  return Array.isArray(arr) ? arr : [];
}
function saveHiScore(score){
  const arr = loadHiScores();
  arr.push({score, date: new Date().toISOString()});
  arr.sort((a,b)=>b.score-a.score);
  const top = arr.slice(0,5);
  localStorage.setItem("tetris_hiscores", JSON.stringify(top));
  renderHiScores();
}
function renderHiScores(){
  const arr = loadHiScores();
  $hiscores.innerHTML = arr.map(x => `<li>${x.score.toLocaleString()}</li>`).join("");
}

// --- Init ---
function init(){
  queueFill();
  playerReset(false);
  renderHiScores();
  drawSide();
  updateStats();
  update();
}
init();
