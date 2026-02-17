/**
 * DELTARUNE 스타일 브라우저 게임
 * - 오버월드 탐험, 전투(박스 내 회피), 대화
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const TILE = 16;
const MAP_W = 40;
const MAP_H = 30;

// 게임 상태
const GameState = { TITLE: 'title', OVERWORLD: 'overworld', DIALOG: 'dialog', BATTLE: 'battle' };
let state = GameState.TITLE;
let dialogQueue = [];
let dialogIndex = 0;

// 플레이어
const player = {
  x: 10 * TILE,
  y: 8 * TILE,
  w: 14,
  h: 20,
  speed: 2,
  dir: 'down',
  moving: false
};

// 맵 (0: 빈칸, 1: 벽, 2: 적, 3: NPC)
const map = [];
for (let y = 0; y < MAP_H; y++) {
  map[y] = [];
  for (let x = 0; x < MAP_W; x++) {
    if (x === 0 || x === MAP_W - 1 || y === 0 || y === MAP_H - 1) {
      map[y][x] = 1;
    } else if (x === 15 && y >= 5 && y <= 12) map[y][x] = 1;
    else if (y === 14 && x >= 10 && x <= 25) map[y][x] = 1;
    else if (x === 20 && y === 8) map[y][x] = 2;
    else if (x === 25 && y === 15) map[y][x] = 2; // 적
    else if (x === 12 && y === 10) map[y][x] = 3; // NPC
    else map[y][x] = 0;
  }
}

// NPC/이벤트 위치
const npcs = [
  { x: 12, y: 10, lines: ['라세이: 어두운 세계에 오신 걸 환영해요.', '크리스. 수지와 함께 가세요.'] }
];

// 전투
let battle = {
  hp: 20,
  maxHp: 20,
  soul: { x: 160, y: 100 },
  bullets: [],
  bulletTimer: 0,
  boxW: 320,
  boxH: 200
};

const keys = {};

function rectCollide(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function tileAt(tx, ty) {
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return 1;
  return map[ty][tx];
}

function checkMapCollision(nx, ny) {
  const left = Math.floor(nx / TILE);
  const right = Math.floor((nx + player.w - 1) / TILE);
  const top = Math.floor(ny / TILE);
  const bottom = Math.floor((ny + player.h - 1) / TILE);
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (tileAt(tx, ty) === 1) return true;
    }
  }
  return false;
}

function startDialog(lines) {
  dialogQueue = Array.isArray(lines) ? lines : [lines];
  dialogIndex = 0;
  state = GameState.DIALOG;
  const box = document.getElementById('dialog-box');
  const text = document.getElementById('dialog-text');
  text.textContent = dialogQueue[0];
  box.classList.remove('hidden');
}

function advanceDialog() {
  dialogIndex++;
  if (dialogIndex >= dialogQueue.length) {
    state = GameState.OVERWORLD;
    document.getElementById('dialog-box').classList.add('hidden');
    return;
  }
  document.getElementById('dialog-text').textContent = dialogQueue[dialogIndex];
}

function startBattle() {
  state = GameState.BATTLE;
  battle.hp = battle.maxHp;
  battle.soul = { x: battle.boxW / 2 - 8, y: battle.boxH / 2 - 8 };
  battle.bullets = [];
  battle.bulletTimer = 0;
  document.getElementById('battle-ui').classList.remove('hidden');
  document.getElementById('game-canvas').classList.add('hidden');
  updateBattleHP();
  document.getElementById('soul').style.left = battle.soul.x + 'px';
  document.getElementById('soul').style.top = battle.soul.y + 'px';
}

function endBattle() {
  state = GameState.OVERWORLD;
  document.getElementById('battle-ui').classList.add('hidden');
  document.getElementById('game-canvas').classList.remove('hidden');
  document.getElementById('dialog-box').classList.add('hidden');
  dialogQueue = [];
  }

function updateBattleHP() {
  const pct = Math.max(0, battle.hp / battle.maxHp) * 100;
  document.getElementById('hp-fill').style.width = pct + '%';
  document.getElementById('hp-value').textContent = battle.hp + '/' + battle.maxHp;
}

function addBullet() {
  const side = Math.floor(Math.random() * 4);
  let x, y, vx, vy;
  const speed = 1.5 + Math.random() * 1;
  if (side === 0) {
    x = Math.random() * battle.boxW;
    y = 0;
    vx = (Math.random() - 0.5) * 0.5;
    vy = speed;
  } else if (side === 1) {
    x = battle.boxW;
    y = Math.random() * battle.boxH;
    vx = -speed;
    vy = (Math.random() - 0.5) * 0.5;
  } else if (side === 2) {
    x = Math.random() * battle.boxW;
    y = battle.boxH;
    vx = (Math.random() - 0.5) * 0.5;
    vy = -speed;
  } else {
    x = 0;
    y = Math.random() * battle.boxH;
    vx = speed;
    vy = (Math.random() - 0.5) * 0.5;
  }
  battle.bullets.push({
    x, y, w: 12, h: 12,
    vx, vy
  });
}

function updateBattle(dt) {
  battle.bulletTimer += dt;
  if (battle.bulletTimer > 400) {
    battle.bulletTimer = 0;
    addBullet();
  }
  const soulEl = document.getElementById('soul');
  const soulW = 16, soulH = 16;
  battle.soul.x += (keys.ArrowRight ? 3 : 0) - (keys.ArrowLeft ? 3 : 0);
  battle.soul.y += (keys.ArrowDown ? 3 : 0) - (keys.ArrowUp ? 3 : 0);
  battle.soul.x = Math.max(4, Math.min(battle.boxW - soulW - 4, battle.soul.x));
  battle.soul.y = Math.max(4, Math.min(battle.boxH - soulH - 4, battle.soul.y));
  soulEl.style.left = battle.soul.x + 'px';
  soulEl.style.top = battle.soul.y + 'px';

  for (let i = battle.bullets.length - 1; i >= 0; i--) {
    const b = battle.bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < -20 || b.x > battle.boxW + 20 || b.y < -20 || b.y > battle.boxH + 20) {
      battle.bullets.splice(i, 1);
      continue;
    }
    if (b.x < battle.soul.x + soulW && b.x + b.w > battle.soul.x &&
        b.y < battle.soul.y + soulH && b.y + b.h > battle.soul.y) {
      battle.hp--;
      battle.bullets.splice(i, 1);
      updateBattleHP();
      if (battle.hp <= 0) {
        battle.hp = 1;
        setTimeout(() => { startDialog('수지: 괜찮아. 다시 해보자.'); endBattle(); }, 800);
      }
    }
  }
}

function drawOverworld() {
  ctx.fillStyle = '#1a0f2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const camX = Math.max(0, player.x - canvas.width / 2 + player.w / 2);
  const camY = Math.max(0, player.y - canvas.height / 2 + player.h / 2);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const sx = x * TILE - camX;
      const sy = y * TILE - camY;
      if (sx < -TILE || sy < -TILE || sx > canvas.width || sy > canvas.height) continue;
      if (map[y][x] === 1) {
        ctx.fillStyle = '#2d1b4e';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = '#4a2c6a';
        ctx.strokeRect(sx, sy, TILE, TILE);
      } else if (map[y][x] === 2) {
        ctx.fillStyle = '#6b21a8';
        ctx.beginPath();
        ctx.arc(sx + TILE/2, sy + TILE/2, TILE/2 - 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (map[y][x] === 3) {
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
      } else {
        ctx.fillStyle = '#251a3d';
        ctx.fillRect(sx, sy, TILE, TILE);
      }
    }
  }

  const px = player.x - camX;
  const py = player.y - camY;
  ctx.fillStyle = '#e8e0f0';
  ctx.fillRect(px, py, player.w, player.h);
  ctx.strokeStyle = '#8b5cf6';
  ctx.strokeRect(px, py, player.w, player.h);
}

function drawTitle() {
  ctx.fillStyle = '#1a0f2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawBattleBullets() {
  const box = document.getElementById('battle-box');
  const existing = box.querySelectorAll('.bullet');
  existing.forEach(el => el.remove());
  battle.bullets.forEach(b => {
    const el = document.createElement('div');
    el.className = 'bullet';
    el.style.cssText = `position:absolute;left:${b.x}px;top:${b.y}px;width:12px;height:12px;background:#8b5cf6;border-radius:2px;`;
    box.appendChild(el);
  });
}

function update(dt) {
  if (state === GameState.BATTLE) {
    updateBattle(dt);
    drawBattleBullets();
    return;
  }
  if (state === GameState.OVERWORLD) {
    let nx = player.x, ny = player.y;
    if (keys.ArrowLeft) { nx -= player.speed; player.dir = 'left'; }
    if (keys.ArrowRight) { nx += player.speed; player.dir = 'right'; }
    if (keys.ArrowUp) { ny -= player.speed; player.dir = 'up'; }
    if (keys.ArrowDown) { ny += player.speed; player.dir = 'down'; }
    if (!checkMapCollision(nx, player.y)) player.x = nx;
    if (!checkMapCollision(player.x, ny)) player.y = ny;

    const pt = { x: player.x, y: player.y, w: player.w, h: player.h };
    const tx = Math.floor((player.x + player.w / 2) / TILE);
    const ty = Math.floor((player.y + player.h / 2) / TILE);
    if (tileAt(tx, ty) === 3) {
      const npc = npcs.find(n => n.x === tx && n.y === ty);
      if (npc) startDialog(npc.lines);
    }
    if (tileAt(tx, ty) === 2) {
      map[ty][tx] = 0;
      startBattle();
    }
  }

  if (state === GameState.OVERWORLD || state === GameState.DIALOG) {
    drawOverworld();
  }
}

let lastTime = performance.now();
function loop(now) {
  const dt = now - lastTime;
  lastTime = now;
  update(dt);
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (state === GameState.TITLE) {
    state = GameState.OVERWORLD;
    document.getElementById('title-screen').classList.add('hidden');
    return;
  }
  if (state === GameState.DIALOG) {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') {
      e.preventDefault();
      advanceDialog();
    }
    return;
  }
  keys[e.key] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
});

document.addEventListener('keyup', e => { keys[e.key] = false; });

document.querySelectorAll('#battle-options button').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'fight') {
      setTimeout(() => { endBattle(); }, 600);
    } else if (action === 'act') {
      startDialog('수지: 하품하기 - 적이 지루해 보인다.');
    } else if (action === 'spare') {
      startDialog('자비를 베풀었다. 적이 떠났다.');
      setTimeout(() => { endBattle(); }, 1500);
    } else {
      startDialog('아이템은 없어.');
    }
  });
});

requestAnimationFrame(loop);
