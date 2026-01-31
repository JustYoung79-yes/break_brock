const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const STAGE6_ONLY = (typeof window !== 'undefined' && window.STAGE6_ONLY) || false;
const BOSS6_TEST = (typeof window !== 'undefined' && window.BOSS6_TEST) || false;

// 폴더 구조에 따른 경로 (GitHub Pages 등 서브경로 대응)
const PATH_BASE = (function() {
    if (window.location.protocol === 'file:') return './';
    const path = window.location.pathname;
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.substring(0, lastSlash + 1) : './';
})();
const PATH = {
    image: PATH_BASE + '그림/',
    bgm: PATH_BASE + '배경음악/'
};

// 게임 설정 (옵션에서 변경 가능)
const PADDLE_WIDTH = 168; // 120 * 1.4
const PADDLE_HEIGHT = 15;
const BALL_RADIUS = 8;
const BRICK_PADDING = 4;
const BRICK_OFFSET_TOP = 60;
const BRICK_OFFSET_LEFT = 30;

// 옵션 설정값
let options = {
    paddleSpeed: 12,
    ballSpeed: 3,
    brickRows: 6,
    brickCols: 10,
    canvasWidth: 800,
    canvasHeight: 600,
};

// 모바일 감지
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

function isLandscape() {
    return window.innerWidth >= window.innerHeight;
}

// 전체화면 여부
function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}

// 모바일 가로 모드용 캔버스 크기 (전체화면 시 주소창 제외하여 최대 활용)
function applyMobileLandscapeDimensions() {
    if (!isMobile() || !isLandscape()) return;
    const fs = isFullscreen();
    const padW = fs ? 20 : 40;
    const padH = fs ? 100 : 180;  // 전체화면 시 헤더/인포/컨트롤만 (주소창 제외)
    const maxW = Math.max(200, Math.min(window.innerWidth - padW, 960));
    const maxH = Math.max(200, Math.min(window.innerHeight - padH, 600));
    options.canvasWidth = maxW;
    options.canvasHeight = maxH;
}

// 전체화면 토글
function toggleFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (!req || !exit) return;
    try {
        if (isFullscreen()) {
            exit.call(document);
        } else {
            req.call(el);
        }
    } catch (e) { console.warn('fullscreen:', e); }
}

// 가로 모드 고정 시도
function tryLockLandscape() {
    if (!isMobile()) return;
    try {
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) { /* 일부 브라우저에서 lock 미지원 */ }
}

// 회전 안내 오버레이 표시 (모바일 세로 모드일 때)
function updateRotateOverlay() {
    const el = document.getElementById('rotateOverlay');
    if (!el) return;
    if (isMobile() && !isLandscape()) {
        el.style.display = 'flex';
        el.classList.remove('hidden');
    } else {
        el.style.display = 'none';
        el.classList.add('hidden');
    }
}

// 게임 상태
let gameRunning = false;
let gamePaused = false;
let ballLaunched = false;
let ballStickTimer = 0;
const BALL_AUTO_LAUNCH_SEC = 3;
let score = 0;
let lives = 3;
let currentStage = 1;
const TOTAL_STAGES = 6;
const STAGE_NAMES = ['', '스테이지 1', '스테이지 2', '스테이지 3', '스테이지 4', '스테이지 5', '스테이지 6'];
let animationId;
let activeItems = [];
let fallingItems = [];
let balls = [];
let bullets = [];
let bossBullets = [];
let hasBulletPower = false;
let savedGameState = null;
let currentAccount = '';
let bricksHitThisFrame = new Set();

// 패들
const paddle = {
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    x: 0,
    y: 0,
    baseWidth: PADDLE_WIDTH,
    speed: 12
};

// 벽돌 색상
const brickColors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd'];

// 아이템 타입 (8종)
const ITEM_TYPES = ['TRIPLE_BALL', 'BULLET', 'LIFE', 'PADDLE_2X', 'BALL_SLOW', 'MAGNET', 'EXTRA_POINTS', 'LASER'];

// 너프 타입 (보스 총알/너프블럭)
const NERF_TYPES = ['PADDLE_SLOW', 'PADDLE_SMALL', 'BALL_FAST', 'GAME_FREEZE'];
const NERF_DISPLAY_NAMES = { PADDLE_SLOW: '판 느림', PADDLE_SMALL: '판 축소', BALL_FAST: '공 빠름', GAME_FREEZE: '2초 멈춤' };
// 보스 총알 효과: 다른 효과 2배 확률, 1초 멈춤 1배
const BOSS_BULLET_NERF_WEIGHTS = [
    { type: 'PADDLE_SLOW', weight: 2 },
    { type: 'PADDLE_SMALL', weight: 2 },
    { type: 'BALL_FAST', weight: 2 },
    { type: 'GAME_FREEZE', weight: 1 }
];

// 체력별 색상 (1~10)
const HP_COLORS = {
    1: '#ff6b6b', 2: '#feca57', 3: '#48dbfb', 4: '#5f27cd', 5: '#ff3838',
    6: '#ff3838', 7: '#1dd1a1', 8: '#ee5a24', 9: '#5f27cd', 10: '#00d2d3'
};

// 스테이지별 보스 설정: { hp, movePattern: 'none'|'lr'|'free'|'curve', shootInterval: 0|180|300 }
const BOSS_CONFIG = {
    1: { hp: 1, movePattern: 'none', shootInterval: 0 },
    2: { hp: 2, movePattern: 'none', shootInterval: 0 },
    3: { hp: 3, movePattern: 'lr', shootInterval: 0 },
    4: { hp: 3, movePattern: 'free', shootInterval: 0 },
    5: { hp: 4, movePattern: 'lr', shootInterval: 180 },
    6: { hp: 10, movePattern: 'curve', shootInterval: 60 }
};

// 스테이지별 강화블럭 개수
const REINFORCED_COUNT_BY_STAGE = [0, 5, 10, 20, 30, 50];

// 아이템 효과 표시 이름 (지속형)
const ITEM_DISPLAY_NAMES = {
    paddle2x: '판 2배',
    ballSlow: '공 느림',
    bullet: '총알',
    magnet: '자석',
    paddleSlow: '판 느림',
    paddleSmall: '판 축소',
    ballFast: '공 빠름',
    gameFreeze: '2초 멈춤',
    paddleFreeze: '판 멈춤'
};

// 스테이지별 설정 (블록수 증가, 크기 감소)
const STAGE_CONFIG = [
    { rows: 6, cols: 10 },
    { rows: 7, cols: 11 },
    { rows: 8, cols: 12 },
    { rows: 9, cols: 13 },
    { rows: 10, cols: 14 },
    { rows: 11, cols: 15 }
];

function isBrickInLayout(stage, row, col, rows, cols) {
    switch (stage) {
        case 1: return true;
        case 2:
            const center = cols / 2;
            const halfWidth = 2 + rows/2 - Math.abs(row - rows/2);
            return Math.abs(col - center) < halfWidth;
        case 3:
            return (row + col) % 2 === 0;
        case 4:
            const midCol = (cols - 1) / 2;
            const midRow = (rows - 1) / 2;
            const dist = Math.abs(col - midCol) + Math.abs(row - midRow);
            return dist <= Math.min(rows, cols) / 2 + 2;
        case 5:
            return (row + col) % 2 === 1;
        case 6:
            return (row % 3 !== 1 || col % 3 !== 1) && (row + col) % 4 !== 0;
        default: return true;
    }
}

function createBricks() {
    if (BOSS6_TEST) {
        const cfg = BOSS_CONFIG[6] || BOSS_CONFIG[1];
        const w = 80, h = 80;  // stage6 기본 크기 반
        return [[{
            x: (options.canvasWidth - w) / 2,
            y: BRICK_OFFSET_TOP + 80,
            width: w,
            height: h,
            visible: true,
            hp: cfg.hp,
            maxHp: cfg.hp,
            isItem: false,
            isNerf: false,
            itemType: null,
            isBoss: true,
            radius: Math.min(w, h) / 2,
            bossBaseSize: Math.min(w, h),
            bossVx: 0,
            bossVy: 0,
            bossShootTimer: 0
        }]];
    }
    const config = STAGE_CONFIG[Math.min(currentStage - 1, STAGE_CONFIG.length - 1)];
    const rows = config.rows;
    const cols = config.cols;
    const padding = Math.max(2, BRICK_PADDING - currentStage);
    const brickWidth = (options.canvasWidth - BRICK_OFFSET_LEFT * 2 - padding * (cols - 1)) / cols;
    const brickHeight = Math.max(14, 24 - currentStage * 2);

    const validPositions = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (isBrickInLayout(currentStage, r, c, rows, cols)) {
                validPositions.push(`${r},${c}`);
            }
        }
    }

    const shuffled = [...validPositions].sort(() => Math.random() - 0.5);
    const nerfCount = Math.min(currentStage - 1, 5);
    const itemCount = 10 - nerfCount;
    const itemNerfPositions = shuffled.slice(0, 10);
    const itemPositions = new Set(itemNerfPositions.slice(0, itemCount));
    const nerfPositions = new Set(itemNerfPositions.slice(itemCount, 10));

    const reinforcedCount = REINFORCED_COUNT_BY_STAGE[Math.min(currentStage - 1, 5)] || 0;
    const reinforcedHpOptions = currentStage >= 4 ? [2, 3, 4] : currentStage >= 3 ? [2, 3] : [2];
    const reinforcedPositions = new Set();
    for (let i = 10; i < shuffled.length && reinforcedPositions.size < reinforcedCount; i++) {
        reinforcedPositions.add(shuffled[i]);
    }

    const bricks = [];
    for (let row = 0; row < rows; row++) {
        bricks[row] = [];
        for (let col = 0; col < cols; col++) {
            if (!isBrickInLayout(currentStage, row, col, rows, cols)) {
                bricks[row][col] = null;
                continue;
            }
            const pos = `${row},${col}`;
            const isItemBlock = itemPositions.has(pos);
            const isNerfBlock = nerfPositions.has(pos);
            const isReinforced = reinforcedPositions.has(pos);
            let hp = 1, itemType = null;
            if (isItemBlock) {
                itemType = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
                if (itemType === 'LIFE' && Math.random() > 0.2) itemType = ITEM_TYPES.filter(t => t !== 'LIFE')[Math.floor(Math.random() * 7)];
            } else if (isNerfBlock) {
                itemType = 'NERF_' + NERF_TYPES[Math.floor(Math.random() * NERF_TYPES.length)];
            } else if (isReinforced) {
                hp = reinforcedHpOptions[Math.floor(Math.random() * reinforcedHpOptions.length)];
            }
            let finalItemType = null, isItem = false, isNerf = false;
            if (itemType) {
                if (itemType.startsWith('NERF_')) {
                    isNerf = true;
                    finalItemType = itemType.replace('NERF_', '');
                } else {
                    isItem = true;
                    finalItemType = itemType;
                }
            }
            bricks[row][col] = {
                x: BRICK_OFFSET_LEFT + col * (brickWidth + padding),
                y: BRICK_OFFSET_TOP + row * (brickHeight + padding),
                width: brickWidth,
                height: brickHeight,
                visible: true,
                hp, maxHp: hp,
                isItem, isNerf,
                itemType: finalItemType,
                isBoss: false,
                bossVx: 0, bossVy: 0,
                bossShootTimer: 0
            };
        }
    }
    return bricks;
}

let bricks = [];

// delta time (공 속도 일정화 - 모바일 프레임레이트 변동 대응)
let lastFrameTime = performance.now();
const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;

// 입력 처리
let mouseX = canvas.width / 2;
let keys = {};
let lastInputMethod = 'mouse';

function getCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    return (clientX - rect.left) * scaleX;
}

canvas.addEventListener('mousemove', (e) => {
    mouseX = getCanvasX(e.clientX);
    lastInputMethod = 'mouse';
});

// 터치 지원 (모바일 세로 모드) - 상대 이동, 스크롤 방지
let touchOnCanvas = false;
let lastTouchX = 0;
canvas.addEventListener('touchstart', (e) => {
    touchOnCanvas = true;
    unlockAudio();
    e.preventDefault();
    if (e.touches.length > 0) {
        lastTouchX = getCanvasX(e.touches[0].clientX);
        lastInputMethod = 'touch';
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
        const currentX = getCanvasX(e.touches[0].clientX);
        const delta = currentX - lastTouchX;
        paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x + delta));
        lastTouchX = currentX;
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    touchOnCanvas = false;
    e.preventDefault();
    if (gameRunning && !gamePaused && !ballLaunched && e.changedTouches.length > 0) {
        launchBall();
    } else if (gameRunning && !gamePaused && hasBulletPower && e.changedTouches.length > 0) {
        shootBullet();
    }
}, { passive: false });

canvas.addEventListener('touchcancel', () => {
    touchOnCanvas = false;
}, { passive: true });

// document 레벨에서 캔버스 터치 시 스크롤 방지 (일부 모바일 브라우저 대응)
document.addEventListener('touchmove', (e) => {
    if (touchOnCanvas && gameRunning) {
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === ']') {
        e.preventDefault();
        const loginEl = document.getElementById('loginOverlay');
        const editEl = document.getElementById('editAccountModal');
        const loginVisible = loginEl && !loginEl.classList.contains('hidden');
        const editVisible = editEl && !editEl.classList.contains('hidden');
        if (loginVisible || editVisible) return;
        if (!document.getElementById('optionsPanel').classList.contains('hidden')) return;
        openOptions();
        return;
    }
    keys[e.key] = true;
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) lastInputMethod = 'keyboard';
    if (e.key === ' ' && gameRunning && !gamePaused) {
        if (!ballLaunched) launchBall();
        else if (hasBulletPower) shootBullet();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

function updatePaddle() {
    const paddleFrozen = activeItems.some(i => i.type === 'paddleFreeze');
    if (paddleFrozen) return;
    if (keys['ArrowLeft'] || keys['ArrowRight']) {
        if (keys['ArrowLeft']) paddle.x -= paddle.speed;
        if (keys['ArrowRight']) paddle.x += paddle.speed;
        lastInputMethod = 'keyboard';
    } else if (lastInputMethod === 'mouse') {
        const targetX = mouseX - paddle.width / 2;
        paddle.x += (targetX - paddle.x) * 0.2;
    }
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
}

// 공 각도를 20~70도(수직 기준)로 제한하여 측면 끼임 방지
function clampBallAngle(dx, dy) {
    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 0.001) return { dx, dy };
    const tilt = Math.atan2(Math.abs(dx), Math.abs(dy)) * 180 / Math.PI;
    const clampedTilt = Math.max(20, Math.min(70, tilt));
    const rad = clampedTilt * Math.PI / 180;
    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;
    return {
        dx: signX * speed * Math.sin(rad),
        dy: signY * speed * Math.cos(rad)
    };
}

function launchBall() {
    if (ballLaunched || balls.length === 0) return;
    ballStickTimer = 0;
    const speed = options.ballSpeed;
    balls.forEach(b => {
        b.dx = speed * (Math.random() > 0.5 ? 1 : -1);
        b.dy = -speed;
        const c = clampBallAngle(b.dx, b.dy);
        b.dx = c.dx; b.dy = c.dy;
    });
    ballLaunched = true;
}

function shootBullet() {
    if (!hasBulletPower) return;
    bullets.push({
        x: paddle.x + paddle.width / 2 - 2,
        y: paddle.y,
        width: 4,
        height: 15,
        dy: -12
    });
}

function spawnFallingItem(x, y, type) {
    const w = 48, h = 56;
    fallingItems.push({
        x: x - w/2,
        y: y,
        width: w,
        height: h,
        dy: 3,
        type: type,
        color: '#e8a54a'
    });
}

function playItemPickupSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const prevVol = bgmAudio ? bgmAudio.volume : 1;
    if (bgmAudio) { bgmAudio.volume = 0.08; setTimeout(() => { if (bgmAudio) bgmAudio.volume = prevVol; }, 500); }
    const dingNotes = [880, 1100, 1320, 1760];
    dingNotes.forEach((freq, i) => {
        setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.12);
        }, i * 60);
    });
}

// 공 속도 효과 적용 전: 기존 효과 제거 후 기본 속도로 복구
function clearBallSpeedEffectsAndRestoreBase() {
    activeItems = activeItems.filter(i => i.type !== 'ballSlow' && i.type !== 'ballFast');
    const baseSpeed = options.ballSpeed;
    balls.forEach(b => {
        const s = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
        if (s > 0.001) {
            const mult = baseSpeed / s;
            b.dx *= mult;
            b.dy *= mult;
        } else {
            b.dx = baseSpeed * (Math.random() > 0.5 ? 1 : -1);
            b.dy = -baseSpeed;
        }
    });
}

function pickRandomBossBulletNerf() {
    const total = BOSS_BULLET_NERF_WEIGHTS.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const item of BOSS_BULLET_NERF_WEIGHTS) {
        r -= item.weight;
        if (r <= 0) return item.type;
    }
    return BOSS_BULLET_NERF_WEIGHTS[0].type;
}

function applyNerfEffect(type) {
    const duration = 600;
    switch (type) {
        case 'PADDLE_SLOW':
            activeItems.push({ type: 'paddleSlow', duration });
            break;
        case 'PADDLE_SMALL':
            activeItems.push({ type: 'paddleSmall', duration });
            break;
        case 'BALL_FAST':
            clearBallSpeedEffectsAndRestoreBase();
            activeItems.push({ type: 'ballFast', duration });
            balls.forEach(b => {
                b.dx *= 2;
                b.dy *= 2;
            });
            break;
        case 'GAME_FREEZE':
            activeItems.push({ type: 'paddleFreeze', duration: 120 });  // 2초 멈춤
            break;
    }
}

function applyItemEffect(type) {
    if (NERF_TYPES.includes(type)) {
        applyNerfEffect(type);
        return;
    }
    playItemPickupSound();
    switch (type) {
        case 'LIFE':
            lives++;
            document.getElementById('lives').textContent = lives;
            break;
        case 'PADDLE_2X':
            paddle.width = Math.min(paddle.baseWidth * 2, canvas.width * 0.8);
            activeItems.push({ type: 'paddle2x', duration: 600 });
            break;
        case 'BALL_SLOW':
            clearBallSpeedEffectsAndRestoreBase();
            balls.forEach(b => {
                b.dx *= 0.5;
                b.dy *= 0.5;
            });
            activeItems.push({ type: 'ballSlow', duration: 600 });
            break;
        case 'TRIPLE_BALL':
            const mainBall = balls[0];
            if (mainBall) {
                const baseSpeed = Math.sqrt(mainBall.dx**2 + mainBall.dy**2);
                balls.push({
                    x: mainBall.x, y: mainBall.y, radius: BALL_RADIUS,
                    dx: baseSpeed * 0.7, dy: -baseSpeed * 0.7
                });
                balls.push({
                    x: mainBall.x, y: mainBall.y, radius: BALL_RADIUS,
                    dx: -baseSpeed * 0.7, dy: -baseSpeed * 0.7
                });
            }
            break;
        case 'BULLET':
            hasBulletPower = true;
            activeItems.push({ type: 'bullet', duration: 600 });
            break;
        case 'MAGNET':
            activeItems.push({ type: 'magnet', duration: 600 });
            break;
        case 'EXTRA_POINTS':
            score += 100;
            document.getElementById('score').textContent = score;
            break;
        case 'LASER':
            const topRow = bricks.findIndex(row => row.some(b => b && b.visible));
            if (topRow >= 0) {
                bricks[topRow].forEach(b => {
                    if (b && b.visible) {
                        b.visible = false;
                        score += 10;
                    }
                });
                document.getElementById('score').textContent = score;
            }
            break;
    }
}

function updateActiveItems() {
    activeItems = activeItems.filter(item => {
        item.duration--;
        if (item.type === 'paddle2x' && item.duration <= 0) paddle.width = paddle.baseWidth;
        if (item.type === 'bullet' && item.duration <= 0) hasBulletPower = false;
        if (item.type === 'ballSlow' && item.duration <= 0) {
            balls.forEach(b => { b.dx *= 2; b.dy *= 2; });
        }
        if (item.type === 'paddleSlow' && item.duration <= 0) paddle.speed = options.paddleSpeed;
        if (item.type === 'paddleSmall' && item.duration <= 0) paddle.width = paddle.baseWidth;
        if (item.type === 'ballFast' && item.duration <= 0) {
            const baseSpeed = options.ballSpeed;
            balls.forEach(b => {
                const s = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
                if (s > 0.001) {
                    const mult = baseSpeed / s;
                    b.dx *= mult;
                    b.dy *= mult;
                } else {
                    b.dx = baseSpeed * (Math.random() > 0.5 ? 1 : -1);
                    b.dy = -baseSpeed;
                }
            });
        }
        return item.duration > 0;
    });
    const paddleSlow = activeItems.some(i => i.type === 'paddleSlow');
    const paddleSmall = activeItems.some(i => i.type === 'paddleSmall');
    const paddle2x = activeItems.some(i => i.type === 'paddle2x');
    if (paddleSlow) paddle.speed = options.paddleSpeed * 0.5;
    else paddle.speed = options.paddleSpeed;
    if (paddleSmall) paddle.width = paddle.baseWidth * 0.7;
    else if (paddle2x) paddle.width = Math.min(paddle.baseWidth * 2, canvas.width * 0.8);
    else paddle.width = paddle.baseWidth;
}

function updateFallingItems(dt = 1) {
    const magnetActive = activeItems.some(i => i.type === 'magnet');
    fallingItems = fallingItems.filter(item => {
        if (magnetActive) {
            const paddleCenter = paddle.x + paddle.width / 2;
            item.x += (paddleCenter - (item.x + item.width/2)) * 0.05 * dt;
        }
        item.y += item.dy * dt;
        if (item.y + item.height > paddle.y &&
            item.y < paddle.y + paddle.height &&
            item.x + item.width > paddle.x &&
            item.x < paddle.x + paddle.width) {
            applyItemEffect(item.type);
            return false;
        }
        return item.y < canvas.height;
    });
}

function isBossInvincible(brick) {
    if (currentStage !== 6 || !brick.isBoss || brick.hp > 1 || !brick.bossInvincibleUntil) return false;
    const now = Date.now();
    while (now >= brick.bossInvincibleUntil) {
        const wasInvincible = brick.bossInvinciblePhase;
        brick.bossInvinciblePhase = !brick.bossInvinciblePhase;
        brick.bossInvincibleUntil += brick.bossInvinciblePhase ? 20000 : 10000;
        if (wasInvincible && !brick.bossInvinciblePhase && !brick.bossFirstInvincibleEnded && currentStage === 6) {
            brick.hp = 10;
            brick.maxHp = 10;
            brick.bossFirstInvincibleEnded = true;
        }
    }
    return brick.bossInvinciblePhase;
}

function hitBrick(brick, isBullet = false) {
    if (bricksHitThisFrame.has(brick)) return;
    bricksHitThisFrame.add(brick);
    const hitInvincible = brick.isBoss && currentStage === 6 && brick.bossHitInvincibleUntil && Date.now() < brick.bossHitInvincibleUntil;
    if (brick.isBoss && (isBossInvincible(brick) || hitInvincible)) return;
    brick.hp = Math.max(0, brick.hp - 1);  // 1씩만 감소
    if (brick.isBoss && brick.hp === 1 && currentStage === 6) {
        brick.bossInvincibleUntil = Date.now() + 30000;  // stage6만: 첫 무적 30초
        brick.bossInvinciblePhase = true;
    }
    if (brick.isBoss && currentStage === 6 && !isBullet) brick.bossHitInvincibleUntil = Date.now() + 1000;  // 공 맞을 때 1초 무적
    score += brick.isItem ? 25 : (brick.isNerf ? 15 : 10);
    document.getElementById('score').textContent = score;
    if (brick.hp <= 0) {
        brick.visible = false;
        if (brick.isItem && brick.itemType) spawnFallingItem(brick.x + brick.width/2, brick.y, brick.itemType);
        if (brick.isNerf && brick.itemType) spawnFallingItem(brick.x + brick.width/2, brick.y, brick.itemType);
    }
}

function updateBoss(dt = 1) {
    const cfg = BOSS_CONFIG[currentStage] || BOSS_CONFIG[1];
    bricks.forEach(row => {
        row.forEach(brick => {
            if (!brick || !brick.visible || !brick.isBoss) return;
            const isInvincible = isBossInvincible(brick) || (currentStage === 6 && brick.bossHitInvincibleUntil && Date.now() < brick.bossHitInvincibleUntil);
            if ((currentStage === 5 || currentStage === 6) && brick.bossBaseSize) {
                const baseSize = brick.bossBaseSize;
                const newSize = (currentStage === 5) ? baseSize * 0.7 : baseSize;
                const cx = brick.x + brick.width / 2, cy = brick.y + brick.height / 2;
                brick.width = brick.height = newSize;
                brick.radius = newSize / 2;
                brick.x = cx - newSize / 2;
                brick.y = cy - newSize / 2;
            }
            brick.bossShootTimer = (brick.bossShootTimer || 0) + dt;
            const shootInt = (brick.hp === 1 ? cfg.shootInterval / 2 : cfg.shootInterval);
            const bulletDy = (brick.hp === 1 ? 12 : 6);
            if (cfg.shootInterval > 0 && brick.bossShootTimer >= shootInt) {
                brick.bossShootTimer = 0;
                bossBullets.push({
                    x: brick.x + brick.width / 2 - 4,
                    y: brick.y + brick.height,
                    width: 8, height: 12,
                    dy: bulletDy
                });
            }
            let speedMult = brick.hp === 1 ? 0.5 : 2;  // 에너지 1: 반속, 에너지 2+: 2배
            if (currentStage === 6 && isInvincible) speedMult *= 2;  // 스테이지6 무적 시 2배
            if (cfg.movePattern === 'lr') {
                brick.bossVx = brick.bossVx || 2;
                brick.x += brick.bossVx * speedMult;
                if (brick.x <= 0 || brick.x + brick.width >= canvas.width) brick.bossVx = -brick.bossVx;
            } else if (cfg.movePattern === 'free') {
                brick.bossVx = brick.bossVx || 1.5;
                brick.bossVy = brick.bossVy || 1;
                brick.x += brick.bossVx * speedMult * dt;
                brick.y += brick.bossVy * speedMult * dt;
                if (brick.x <= 0 || brick.x + brick.width >= canvas.width) brick.bossVx = -brick.bossVx;
                if (brick.y <= BRICK_OFFSET_TOP || brick.y + brick.height >= canvas.height - 100) brick.bossVy = -brick.bossVy;
            } else if (cfg.movePattern === 'curve') {
                const baseVel = 1.2;
                brick.bossVx = brick.bossVx ?? (baseVel * (Math.random() > 0.5 ? 1 : -1));
                brick.bossVy = brick.bossVy ?? (baseVel * (Math.random() > 0.5 ? 1 : -1));
                brick.bossCurveTimer = (brick.bossCurveTimer || 0) + dt;
                if (brick.bossCurveTimer >= 8) {
                    brick.bossCurveTimer = 0;
                    brick.bossVx += (Math.random() - 0.5) * 1.2;
                    brick.bossVy += (Math.random() - 0.5) * 1.2;
                }
                const ax = Math.abs(brick.bossVx), ay = Math.abs(brick.bossVy);
                if (ax > 0.001 || ay > 0.001) {
                    const minRatio = 0.6;
                    if (ax < ay * minRatio) brick.bossVx = (brick.bossVx >= 0 ? 1 : -1) * ay * minRatio;
                    if (ay < ax * minRatio) brick.bossVy = (brick.bossVy >= 0 ? 1 : -1) * ax * minRatio;
                }
                const maxSpeed = brick.hp === 1 ? 9 : 3;  // 에너지 1일 때 3배 빠르게
                const speed = Math.sqrt(brick.bossVx ** 2 + brick.bossVy ** 2);
                if (speed > maxSpeed && speed > 0.01) {
                    brick.bossVx *= maxSpeed / speed;
                    brick.bossVy *= maxSpeed / speed;
                } else if (speed < (brick.hp === 1 ? 2.25 : 0.75) && speed > 0.01) {
                    brick.bossVx *= (brick.hp === 1 ? 3.6 : 1.2) / speed;
                    brick.bossVy *= (brick.hp === 1 ? 3.6 : 1.2) / speed;
                }
                brick.x += brick.bossVx * speedMult;
                brick.y += brick.bossVy * speedMult;
                if (brick.x <= 0) {
                    brick.x = 1;
                    brick.bossVx = Math.abs(brick.bossVx) * (0.9 + Math.random() * 1.2);
                    brick.bossVy += (Math.random() - 0.5) * 2.25;
                } else if (brick.x + brick.width >= canvas.width) {
                    brick.x = canvas.width - brick.width - 1;
                    brick.bossVx = -Math.abs(brick.bossVx) * (0.9 + Math.random() * 1.2);
                    brick.bossVy += (Math.random() - 0.5) * 2.25;
                }
                if (brick.y <= BRICK_OFFSET_TOP) {
                    brick.y = BRICK_OFFSET_TOP + 1;
                    brick.bossVy = Math.abs(brick.bossVy) * (0.9 + Math.random() * 1.2);
                    brick.bossVx += (Math.random() - 0.5) * 2.25;
                } else if (brick.y + brick.height >= canvas.height - 100) {
                    brick.y = canvas.height - 100 - brick.height - 1;
                    brick.bossVy = -Math.abs(brick.bossVy) * (0.9 + Math.random() * 1.2);
                    brick.bossVx += (Math.random() - 0.5) * 2.25;
                }
                const s = Math.sqrt(brick.bossVx ** 2 + brick.bossVy ** 2);
                if (s > maxSpeed && s > 0.01) {
                    brick.bossVx *= maxSpeed / s;
                    brick.bossVy *= maxSpeed / s;
                }
            }
            // 공 피하기: 공이 보스 쪽으로 올 때 가로로 회피
            if (ballLaunched && balls.length > 0 && cfg.movePattern !== 'none') {
                const bcx = brick.x + brick.width / 2, bcy = brick.y + brick.height / 2;
                const DODGE_SPEED = 1.5, DODGE_RANGE = 250;
                for (const ball of balls) {
                    const dx = bcx - ball.x, dy = bcy - ball.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > DODGE_RANGE || dist < 5) continue;
                    const dot = (dx * ball.dx + dy * ball.dy) / (dist + 0.001);
                    if (dot > 0.3) {
                        const dodge = (ball.x < bcx ? DODGE_SPEED : -DODGE_SPEED) * dt;
                        brick.x = Math.max(0, Math.min(canvas.width - brick.width, brick.x + dodge));
                        break;
                    }
                }
            }
        });
    });
}

function updateBullets(dt = 1) {
    bullets = bullets.filter(b => {
        const oldY = b.y;
        b.y += b.dy * dt;
        if (b.y < 0) return false;
        const yMin = Math.min(oldY, b.y);
        const yMax = Math.max(oldY + b.height, b.y + b.height);
        let hit = false;
        outer: for (const row of bricks) {
            for (const brick of row) {
                if (brick && brick.visible &&
                    b.x + b.width > brick.x && b.x < brick.x + brick.width &&
                    yMax > brick.y && yMin < brick.y + brick.height) {
                    hitBrick(brick, true);
                    hit = true;
                    break outer;
                }
            }
        }
        return !hit && b.y > 0;
    });
    bossBullets = bossBullets.filter(b => {
        b.y += b.dy * dt;
        if (b.y > canvas.height) return false;
        if (b.y + b.height > paddle.y && b.y < paddle.y + paddle.height &&
            b.x + b.width > paddle.x && b.x < paddle.x + paddle.width) {
            if (b.isBomb) {
                lives--;
                document.getElementById('lives').textContent = lives;
                if (lives <= 0) gameOver();
                else resetBall();
            } else {
                applyNerfEffect(pickRandomBossBulletNerf());
            }
            return false;
        }
        return true;
    });
}

function resetBall() {
    ballLaunched = false;
    ballStickTimer = 0;
    const speed = options.ballSpeed;
    balls = [{
        x: canvas.width / 2,
        y: paddle.y - BALL_RADIUS - 5,
        dx: 0,
        dy: 0,
        radius: BALL_RADIUS
    }];
}

function updateBall(dt = 1) {
    bricksHitThisFrame.clear();
    updateFallingItems(dt);
    updateBullets(dt);
    updateBoss(dt);

    if (!ballLaunched && balls.length > 0) {
        balls[0].x = paddle.x + paddle.width / 2;
        balls[0].y = paddle.y - BALL_RADIUS - 5;
        ballStickTimer += dt;
        if (ballStickTimer >= 60 * BALL_AUTO_LAUNCH_SEC) {
            launchBall();
        }
        return;
    }
    for (let bi = balls.length - 1; bi >= 0; bi--) {
        const ball = balls[bi];
        ball.x += ball.dx * dt;
        ball.y += ball.dy * dt;

        if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) {
            ball.dx = -ball.dx;
            const c = clampBallAngle(ball.dx, ball.dy);
            ball.dx = c.dx; ball.dy = c.dy;
        }
        if (ball.y - ball.radius < 0) {
            ball.dy = -ball.dy;
            const c = clampBallAngle(ball.dx, ball.dy);
            ball.dx = c.dx; ball.dy = c.dy;
        }

        if (ball.y + ball.radius > paddle.y &&
            ball.y - ball.radius < paddle.y + paddle.height &&
            ball.x > paddle.x &&
            ball.x < paddle.x + paddle.width) {
            const hitPos = Math.max(-1, Math.min(1, (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2)));
            const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            const angleDeg = 20 + 50 * Math.abs(hitPos);
            const angleRad = angleDeg * Math.PI / 180;
            ball.dx = (hitPos >= 0 ? 1 : -1) * speed * Math.sin(angleRad);
            ball.dy = -speed * Math.cos(angleRad);
            const c = clampBallAngle(ball.dx, ball.dy);
            ball.dx = c.dx; ball.dy = c.dy;
        }

        if (ball.y + ball.radius > canvas.height) {
            balls.splice(bi, 1);
            if (balls.length === 0) {
                lives--;
                document.getElementById('lives').textContent = lives;
                if (lives <= 0) {
                    gameOver();
                } else {
                    resetBall();
                }
            }
        }
    }

    balls.forEach(ball => {
        let ballHit = false;
        bricks.forEach(row => {
            row.forEach(brick => {
                if (brick && brick.visible && !ballHit &&
                    ball.x + ball.radius > brick.x &&
                    ball.x - ball.radius < brick.x + brick.width &&
                    ball.y + ball.radius > brick.y &&
                    ball.y - ball.radius < brick.y + brick.height) {
                    hitBrick(brick, false);
                    const overlapLeft = (ball.x + ball.radius) - brick.x;
                    const overlapRight = (brick.x + brick.width) - (ball.x - ball.radius);
                    const overlapTop = (ball.y + ball.radius) - brick.y;
                    const overlapBottom = (brick.y + brick.height) - (ball.y - ball.radius);
                    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                    if (minOverlap === overlapLeft || minOverlap === overlapRight) ball.dx = -ball.dx;
                    else ball.dy = -ball.dy;
                    const c = clampBallAngle(ball.dx, ball.dy);
                    ball.dx = c.dx; ball.dy = c.dy;
                    ballHit = true;
                }
            });
        });
    });

    const visibleCount = bricks.reduce((s, row) => s + row.filter(b => b && b.visible).length, 0);
    if (visibleCount === 1) {
        let bossBrick = null;
        outer: for (const row of bricks) {
            for (const brick of row) {
                if (brick && brick.visible) { bossBrick = brick; break outer; }
            }
        }
        if (bossBrick && !bossBrick.isBoss) {
            const cfg = BOSS_CONFIG[currentStage] || BOSS_CONFIG[1];
            bossBrick.isBoss = true;
            bossBrick.hp = cfg.hp;
            bossBrick.maxHp = cfg.hp;
            const baseMult = currentStage === 6 ? 1.5 : 3;  // stage6 기본 크기 반
            const size = Math.min(bossBrick.width, bossBrick.height) * baseMult;
            bossBrick.x += (bossBrick.width - size) / 2;
            bossBrick.y += (bossBrick.height - size) / 2;
            bossBrick.width = size;
            bossBrick.height = size;
            bossBrick.radius = size / 2;
            bossBrick.bossBaseSize = size;
        }
    }

    const allBricksGone = bricks.every(row => row.every(brick => !brick || !brick.visible));
    if (allBricksGone) {
        if (currentStage < TOTAL_STAGES) {
            showStageClearAndNext();
        } else {
            winGame();
        }
    }
}

function showStageClearAndNext() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    const resetBtn = document.getElementById('resetRankingStageBtn');
    if (msgEl && overlayEl) {
        msgEl.textContent = '스테이지 클리어!';
        if (resetBtn) { resetBtn.style.display = 'inline-block'; }
        overlayEl.classList.remove('hidden');
    }
    setTimeout(() => {
        if (resetBtn) { resetBtn.style.display = 'none'; }
        currentStage++;
        document.getElementById('stage').textContent = currentStage;
        if (currentStage === 6) {
            options.ballSpeed = 7;
            const ballSpeedEl = document.getElementById('ballSpeed');
            if (ballSpeedEl) { ballSpeedEl.value = 7; document.getElementById('ballSpeedVal').textContent = 7; }
        }
        bricks = createBricks();
        resetBall();
        showStageStartAndResume();
    }, 2000);
}

function showStageStartAndResume() {
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    const resetBtn = document.getElementById('resetRankingStageBtn');
    if (msgEl && overlayEl) {
        msgEl.textContent = STAGE_NAMES[currentStage] || `스테이지 ${currentStage}`;
        if (resetBtn) { resetBtn.style.display = 'none'; }
        overlayEl.classList.remove('hidden');
    }
    setTimeout(() => {
        if (overlayEl) overlayEl.classList.add('hidden');
        gameRunning = true;
        gamePaused = false;
        gameLoop();
    }, 2000);
}

function onImageLoad() {
    if (gameRunning && ctx) draw();
}

const bagImage = new Image();
bagImage.onerror = () => { bagImage.src = PATH.image + '자루.png'; };
bagImage.onload = onImageLoad;
bagImage.src = PATH.image + '자루 TP.png';

const bombImage = new Image();
bombImage.onload = onImageLoad;
bombImage.src = PATH.image + '폭탄.png';

const bossImage = new Image();
bossImage.onload = onImageLoad;
bossImage.onerror = () => { bossImage.src = PATH.image + 'boss.png'; };
bossImage.src = PATH.image + 'Boss.png';

function drawPaddle() {
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(0.5, '#764ba2');
    gradient.addColorStop(1, '#667eea');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    const cx = paddle.x + paddle.width / 2;
    const cy = paddle.y + paddle.height;
    const a = paddle.width / 2;
    const b = paddle.height * 0.8;
    ctx.moveTo(paddle.x, cy);
    ctx.ellipse(cx, cy, a, b, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawBall() {
    balls.forEach(ball => {
        const gradient = ctx.createRadialGradient(
            ball.x - 3, ball.y - 3, 0,
            ball.x, ball.y, ball.radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.5, '#e0e0ff');
        gradient.addColorStop(1, '#9d9dff');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawFallingItems() {
    fallingItems.forEach(item => {
        const w = Math.floor(item.width || 48);
        const h = Math.floor(item.height || 56);
        const x = Math.floor(item.x);
        const y = Math.floor(item.y);
        const isNerf = NERF_TYPES.includes(item.type);
        if (isNerf && bombImage.complete && bombImage.naturalWidth > 0) {
            ctx.drawImage(bombImage, x, y, w, h);
        } else if (bagImage.complete && bagImage.naturalWidth > 0) {
            ctx.drawImage(bagImage, x, y, w, h);
        } else {
            drawBagShape(x, y, w, h);
        }
    });
}

function drawBagShape(x, y, w, h) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#e8a54a';
    ctx.strokeStyle = '#c4842a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w*0.2, h*0.1);
    ctx.lineTo(w*0.15, h*0.25);
    ctx.quadraticCurveTo(w*0.05, h*0.9, w*0.5, h*0.95);
    ctx.quadraticCurveTo(w*0.95, h*0.9, w*0.85, h*0.25);
    ctx.lineTo(w*0.8, h*0.1);
    ctx.quadraticCurveTo(w*0.5, 0, w*0.2, h*0.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a08060';
    ctx.strokeStyle = '#6b5344';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w*0.5, h*0.12, w*0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8b7355';
    ctx.fillRect(w*0.35, 0, w*0.3, h*0.08);
    ctx.strokeRect(w*0.35, 0, w*0.3, h*0.08);
    ctx.restore();
}

function drawBullets() {
    bullets.forEach(b => {
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });
    bossBullets.forEach(b => {
        if (b.isBomb && bombImage.complete && bombImage.naturalWidth > 0) {
            ctx.drawImage(bombImage, b.x, b.y, b.width, b.height);
        } else {
            ctx.fillStyle = b.isBomb ? '#ff0000' : '#ff4444';
            ctx.fillRect(b.x, b.y, b.width, b.height);
        }
    });
}

function drawActiveItemEffects() {
    if (activeItems.length === 0) return;
    const pad = 8;
    let x = pad;
    const y = 12;
    const lineHeight = 18;
    ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    activeItems.forEach(item => {
        const name = ITEM_DISPLAY_NAMES[item.type] || NERF_DISPLAY_NAMES[item.type] || item.type;
        const sec = Math.ceil(item.duration / 60);
        const text = `${name} ${sec}초`;
        const w = ctx.measureText(text).width + 16;
        ctx.fillStyle = 'rgba(102, 126, 234, 0.85)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(x, y - 8, w, lineHeight);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, x + 8, y);
        x += w + pad;
    });
}

function drawBricks() {
    bricks.forEach(row => {
        row.forEach(brick => {
            if (brick && brick.visible) {
                const hp = brick.hp || 1;
                if (brick.isBoss) {
                    const cx = brick.x + brick.width / 2;
                    const cy = brick.y + brick.height / 2;
                    const r = brick.radius ?? Math.min(brick.width, brick.height) / 2;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();
                    if (bossImage.complete && bossImage.naturalWidth > 0) {
                        ctx.drawImage(bossImage, Math.floor(brick.x), Math.floor(brick.y), Math.floor(brick.width), Math.floor(brick.height));
                    } else {
                        ctx.fillStyle = `hsl(${(Date.now() / 50) % 360}, 80%, 55%)`;
                        ctx.beginPath();
                        ctx.arc(cx, cy, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                    const bossInvincible = isBossInvincible(brick) || (currentStage === 6 && brick.bossHitInvincibleUntil && Date.now() < brick.bossHitInvincibleUntil);
                    ctx.strokeStyle = bossInvincible ? '#ff0000' : '#fff';
                    ctx.lineWidth = bossInvincible ? 6 : 4;  // 테두리 2배
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    const color = HP_COLORS[hp] || HP_COLORS[1];
                    ctx.fillStyle = color;
                    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
                    ctx.strokeStyle = brick.isItem ? '#fff' : 'rgba(0,0,0,0.3)';
                    ctx.lineWidth = brick.isItem ? 2 : 1;
                    ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
                }
                if (brick.isItem && !brick.isNerf) {
                    if (bagImage.complete && bagImage.naturalWidth > 0) {
                        ctx.drawImage(bagImage, Math.floor(brick.x), Math.floor(brick.y), Math.floor(brick.width), Math.floor(brick.height));
                    } else {
                        drawBagShape(brick.x, brick.y, brick.width, brick.height);
                    }
                }
                if (brick.isNerf) {
                    if (bombImage.complete && bombImage.naturalWidth > 0) {
                        ctx.drawImage(bombImage, Math.floor(brick.x), Math.floor(brick.y), Math.floor(brick.width), Math.floor(brick.height));
                    }
                }
                if (!brick.isBoss && hp > 1 && !brick.isItem) {
                    ctx.fillStyle = '#fff';
                    const fontSize = Math.min(brick.width, brick.height) * 0.5;
                    ctx.font = 'bold ' + fontSize + 'px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(hp, brick.x + brick.width/2, brick.y + brick.height/2);
                }
            }
        });
    });
}

function drawBossHPBar() {
    let bossBrick = null;
    outer: for (const row of bricks) {
        for (const brick of row) {
            if (brick && brick.visible && brick.isBoss) {
                bossBrick = brick;
                break outer;
            }
        }
    }
    if (!bossBrick) return;
    const hp = bossBrick.hp || 1;
    const maxHp = bossBrick.maxHp || 1;
    const isInvincible = isBossInvincible(bossBrick) || (currentStage === 6 && bossBrick.bossHitInvincibleUntil && Date.now() < bossBrick.bossHitInvincibleUntil);
    const barW = 45;  // 가로 1/3 축소 (134/3)
    const barH = 28;
    const gap = 12;
    const x = bossBrick.x + bossBrick.width / 2 - barW / 2;
    const y = bossBrick.y - barH - gap;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, barW, barH);
    ctx.strokeRect(x, y, barW, barH);
    const fillW = (hp / maxHp) * (barW - 8);
    ctx.fillStyle = isInvincible ? '#00ff88' : (hp > maxHp * 0.5 ? '#48dbfb' : hp > maxHp * 0.25 ? '#feca57' : '#ff3838');
    ctx.fillRect(x + 4, y + 4, Math.max(0, fillW - 4), barH - 8);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.strokeStyle = 'rgba(138, 43, 226, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }

    drawBricks();
    drawPaddle();
    drawFallingItems();
    drawBullets();
    drawBall();
    drawActiveItemEffects();
    drawBossHPBar();
}

function gameLoop(now = performance.now()) {
    if (!gameRunning) return;
    if (gamePaused) {
        lastFrameTime = now;
        animationId = requestAnimationFrame(gameLoop);
        return;
    }
    const deltaTime = Math.min(now - lastFrameTime, 100);
    lastFrameTime = now;
    const dt = deltaTime / FRAME_MS;

    updatePaddle();
    updateActiveItems(dt);
    updateBall(dt);
    draw();

    animationId = requestAnimationFrame(gameLoop);
}

function applyOptions() {
    options.paddleSpeed = parseInt(document.getElementById('paddleSpeed').value) || 12;
    options.ballSpeed = parseInt(document.getElementById('ballSpeed').value) || 3;
    const blockCount = document.getElementById('blockCount').value;
    if (blockCount === 'small') { options.brickRows = 5; options.brickCols = 8; }
    else if (blockCount === 'large') { options.brickRows = 8; options.brickCols = 12; }
    else { options.brickRows = 6; options.brickCols = 10; }
    const screenSizeEl = document.getElementById('screenSize');
    const screenSize = screenSizeEl ? screenSizeEl.value : 'medium';
    if (isMobile() && isLandscape()) {
        applyMobileLandscapeDimensions();
    } else if (screenSize === 'mobile') { options.canvasWidth = 640; options.canvasHeight = 360; }
    else if (screenSize === 'small') { options.canvasWidth = 640; options.canvasHeight = 480; }
    else if (screenSize === 'large') { options.canvasWidth = 960; options.canvasHeight = 720; }
    else { options.canvasWidth = 800; options.canvasHeight = 600; }
    paddle.speed = options.paddleSpeed;
    canvas.width = options.canvasWidth;
    canvas.height = options.canvasHeight;
    paddle.y = canvas.height - 40;
    paddle.baseWidth = PADDLE_WIDTH * (options.canvasWidth / 800);
    paddle.width = paddle.baseWidth;
}

function startGame(isNewGame = true) {
    applyOptions();
    gameRunning = true;
    gamePaused = false;
    ballLaunched = false;
    ballStickTimer = 0;
    hasBulletPower = false;
    fallingItems = [];
    bullets = [];
    bossBullets = [];
    activeItems = [];
    if (isNewGame) {
        score = 0;
        lives = 3;
        currentStage = (STAGE6_ONLY || BOSS6_TEST) ? 6 : 1;
        document.getElementById('stage').textContent = currentStage;
        bricks = createBricks();
    } else if (savedGameState) {
        score = savedGameState.score;
        lives = savedGameState.lives;
        currentStage = savedGameState.stage || 1;
        document.getElementById('stage').textContent = currentStage;
        bricks = savedGameState.bricks;
    } else {
        score = 0;
        lives = 3;
        bricks = createBricks();
    }
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = lives;
    document.getElementById('startOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    document.getElementById('winOverlay').classList.add('hidden');
    updateOptionsButtonVisibility();
    paddle.x = (canvas.width - paddle.width) / 2;
    mouseX = canvas.width / 2;
    resetBall();
    showStageStartAndResume();
}

function saveGameState() {
    savedGameState = {
        score, lives: 0, stage: currentStage,
        bricks: bricks.map(row => row.map(b => b ? {
            ...b,
            visible: b.visible,
            isItem: b.isItem,
            itemType: b.itemType
        } : null))
    };
}

function continueGame() {
    if (savedGameState) {
        savedGameState.lives = 3;
        savedGameState.score = 0;
        document.getElementById('gameOverOverlay').classList.add('hidden');
        startGame(false);
    }
}

function restartGame() {
    document.getElementById('gameOverOverlay').classList.add('hidden');
    document.getElementById('winOverlay').classList.add('hidden');
    startGame(true);
}

let audioCtx = null;
let bgmAudio = null;

// 스테이지별 배경음악 (6스테이지는 Stage5 사용)
const BGM_FILES = [1, 2, 3, 4, 5, 6].map(n => `${PATH.bgm}Stage${n}.mp3`);

function unlockAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function startBGM(stage) {
    unlockAudio();
    stopBGM();
    const idx = Math.min(Math.max(1, stage), BGM_FILES.length) - 1;
    const src = BGM_FILES[idx];
    bgmAudio = new Audio(src);
    bgmAudio.loop = true;
    bgmAudio.volume = 0.5;
    bgmAudio.play().catch(() => {});
}

function stopBGM() {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio.currentTime = 0;
        bgmAudio = null;
    }
}

const RANKING_KEY_PREFIX = 'brickBreakerRanking_';
const ACCOUNTS_KEY = 'brickBreakerAccounts';
const MAX_RANKING = 10;
const RANKING_DISPLAY_COUNT = 10;

function getAccounts() {
    try {
        return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}');
    } catch { return {}; }
}

function saveAccount(name, data) {
    const accounts = getAccounts();
    accounts[name] = data;
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function deleteAccountData(name) {
    const accounts = getAccounts();
    delete accounts[name];
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    localStorage.removeItem(RANKING_KEY_PREFIX + name.replace(/[^a-zA-Z0-9가-힣_]/g, '_'));
}

function getAccount(name) {
    return getAccounts()[name] || null;
}

// 계정별 옵션 저장/로드
const DEFAULT_OPTIONS = {
    paddleSpeed: 12,
    ballSpeed: 3,
    brickRows: 6,
    brickCols: 10,
    canvasWidth: 800,
    canvasHeight: 600
};

function loadOptionsForAccount(accountName) {
    const acc = accountName ? getAccount(accountName) : null;
    const saved = acc?.options;
    if (saved && typeof saved === 'object') {
        options.paddleSpeed = saved.paddleSpeed ?? DEFAULT_OPTIONS.paddleSpeed;
        options.ballSpeed = saved.ballSpeed ?? DEFAULT_OPTIONS.ballSpeed;
        options.brickRows = saved.brickRows ?? DEFAULT_OPTIONS.brickRows;
        options.brickCols = saved.brickCols ?? DEFAULT_OPTIONS.brickCols;
        options.canvasWidth = saved.canvasWidth ?? DEFAULT_OPTIONS.canvasWidth;
        options.canvasHeight = saved.canvasHeight ?? DEFAULT_OPTIONS.canvasHeight;
    } else {
        Object.assign(options, DEFAULT_OPTIONS);
    }
}

function saveOptionsToAccount() {
    if (!currentAccount) return;
    const acc = getAccount(currentAccount);
    if (!acc) return;
    saveAccount(currentAccount, {
        ...acc,
        options: {
            paddleSpeed: options.paddleSpeed,
            ballSpeed: options.ballSpeed,
            brickRows: options.brickRows,
            brickCols: options.brickCols,
            canvasWidth: options.canvasWidth,
            canvasHeight: options.canvasHeight
        }
    });
}

function getRankingKey() {
    return RANKING_KEY_PREFIX + (currentAccount || 'guest').replace(/[^a-zA-Z0-9가-힣_]/g, '_');
}

function getRanking() {
    try {
        return JSON.parse(localStorage.getItem(getRankingKey()) || '[]');
    } catch { return []; }
}

function saveToRanking(score) {
    const ranking = getRanking();
    ranking.push({ score, date: new Date().toISOString(), account: currentAccount || '게스트' });
    ranking.sort((a, b) => b.score - a.score);
    localStorage.setItem(getRankingKey(), JSON.stringify(ranking.slice(0, MAX_RANKING)));
    const rank = ranking.findIndex(r => r.score === score) + 1;
    return rank > 0 ? rank : 1;
}

function clearRanking() {
    localStorage.setItem(getRankingKey(), '[]');
}

function renderRanking(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const ranking = getRanking();
    el.innerHTML = ranking.length ? '<h3>🏆 점수 순위 (' + (currentAccount || '게스트') + ')</h3><ol>' +
        ranking.slice(0, RANKING_DISPLAY_COUNT).map((r, i) => `<li>${r.score}점</li>`).join('') + '</ol>' : '<h3>🏆 점수 순위</h3><p>기록이 없습니다</p>';
}

function resetRankingUI() {
    renderRanking('rankingDisplay');
    renderRanking('winRankingDisplay');
    const goFirst = document.getElementById('gameOverFirstPlace');
    const celebration = document.getElementById('firstPlaceCelebration');
    if (goFirst) goFirst.classList.add('hidden');
    if (celebration) celebration.classList.add('hidden');
}

function gameOver() {
    gameRunning = false;
    stopBGM();
    cancelAnimationFrame(animationId);
    saveGameState();
    saveToRanking(score);
    const ranking = getRanking();
    const isFirst = ranking.length > 0 && ranking[0].score === score;
    document.getElementById('finalScore').textContent = score;
    const goFirstEl = document.getElementById('gameOverFirstPlace');
    if (goFirstEl) {
        if (isFirst) {
            goFirstEl.textContent = '🎊 1등 축하합니다! 🎊';
            goFirstEl.classList.remove('hidden');
            playVictoryMusic();
        } else {
            goFirstEl.classList.add('hidden');
        }
    }
    renderRanking('rankingDisplay');
    document.getElementById('gameOverOverlay').classList.remove('hidden');
}

function winGame() {
    gameRunning = false;
    stopBGM();
    cancelAnimationFrame(animationId);
    saveToRanking(score);
    const ranking = getRanking();
    const isFirst = ranking.length > 0 && ranking[0].score === score;
    document.getElementById('winScore').textContent = score;
    renderRanking('winRankingDisplay');
    const celebrationEl = document.getElementById('firstPlaceCelebration');
    if (celebrationEl) {
        if (isFirst) {
            celebrationEl.textContent = '🎊 1등 축하합니다! 🎊';
            celebrationEl.classList.remove('hidden');
        } else {
            celebrationEl.classList.add('hidden');
        }
    }
    playVictoryMusic();
    document.getElementById('winOverlay').classList.remove('hidden');
}

function playVictoryMusic() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const victoryNotes = [523, 659, 784, 1047, 784, 659, 523];
    victoryNotes.forEach((freq, i) => {
        setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.2);
        }, i * 150);
    });
}

function openOptions() {
    if (gameRunning) gamePaused = true;
    document.getElementById('paddleSpeed').value = options.paddleSpeed;
    document.getElementById('ballSpeed').value = options.ballSpeed;
    document.getElementById('paddleSpeedVal').textContent = options.paddleSpeed;
    document.getElementById('ballSpeedVal').textContent = options.ballSpeed;
    document.getElementById('blockCount').value =
        options.brickRows === 5 ? 'small' : options.brickRows === 8 ? 'large' : 'medium';
    const ssEl = document.getElementById('screenSize');
    if (ssEl) ssEl.value = (isMobile() && options.canvasWidth <= 960) ? 'mobile' : options.canvasWidth === 640 ? 'small' : options.canvasWidth === 960 ? 'large' : 'medium';
    document.getElementById('optionsPanel').classList.remove('hidden');
}

document.getElementById('optionsBtn').addEventListener('click', openOptions);

function updateFullscreenButton() {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return;
    btn.style.display = isMobile() ? '' : 'none';
    btn.textContent = isFullscreen() ? '⛶' : '⛶';
    btn.title = isFullscreen() ? '전체화면 해제' : '전체화면';
}
const fullscreenBtn = document.getElementById('fullscreenBtn');
if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => {
    toggleFullscreen();
});

function onFullscreenChange() {
    updateFullscreenButton();
    if (isMobile() && isLandscape()) {
        applyMobileLandscapeDimensions();
        applyOptions();
        try {
            canvas.width = options.canvasWidth;
            canvas.height = options.canvasHeight;
            paddle.y = canvas.height - 40;
            paddle.x = Math.min(paddle.x, canvas.width - paddle.width);
            if (!gameRunning) {
                paddle.x = (canvas.width - paddle.width) / 2;
                bricks = createBricks();
            }
            draw();
        } catch (e) { console.warn('fullscreen resize:', e); }
    }
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);
document.addEventListener('mozfullscreenchange', onFullscreenChange);
document.addEventListener('MSFullscreenChange', onFullscreenChange);

document.getElementById('optionsCloseBtn').addEventListener('click', () => {
    if (gameRunning) gamePaused = false;
    options.paddleSpeed = parseInt(document.getElementById('paddleSpeed').value) || 12;
    options.ballSpeed = parseInt(document.getElementById('ballSpeed').value) || 3;
    const blockCount = document.getElementById('blockCount').value;
    if (blockCount === 'small') { options.brickRows = 5; options.brickCols = 8; }
    else if (blockCount === 'large') { options.brickRows = 8; options.brickCols = 12; }
    else { options.brickRows = 6; options.brickCols = 10; }
    const screenSizeEl = document.getElementById('screenSize');
    const screenSize = screenSizeEl ? screenSizeEl.value : 'medium';
    if (isMobile() && isLandscape()) {
        applyMobileLandscapeDimensions();
    } else if (screenSize === 'mobile') { options.canvasWidth = 640; options.canvasHeight = 360; }
    else if (screenSize === 'small') { options.canvasWidth = 640; options.canvasHeight = 480; }
    else if (screenSize === 'large') { options.canvasWidth = 960; options.canvasHeight = 720; }
    else { options.canvasWidth = 800; options.canvasHeight = 600; }
    paddle.speed = options.paddleSpeed;
    if (gameRunning) startBGM(currentStage);
    if (!gameRunning) {
        canvas.width = options.canvasWidth;
        canvas.height = options.canvasHeight;
        paddle.baseWidth = PADDLE_WIDTH * (options.canvasWidth / 800);
        paddle.width = paddle.baseWidth;
        paddle.y = canvas.height - 40;
        paddle.x = (canvas.width - paddle.width) / 2;
        bricks = createBricks();
        draw();
    }
    saveOptionsToAccount();
    document.getElementById('optionsPanel').classList.add('hidden');
});

document.getElementById('paddleSpeed').addEventListener('input', (e) => {
    document.getElementById('paddleSpeedVal').textContent = e.target.value;
});
document.getElementById('ballSpeed').addEventListener('input', (e) => {
    document.getElementById('ballSpeedVal').textContent = e.target.value;
});

document.getElementById('startBtn').addEventListener('click', () => startGame(true));
const continueBtn = document.getElementById('continueBtn');
if (continueBtn) continueBtn.addEventListener('click', continueGame);
document.getElementById('newGameBtn').addEventListener('click', restartGame);
document.getElementById('playAgainBtn').addEventListener('click', restartGame);

function refreshAccountList() {
    if (STAGE6_ONLY) return;
    const select = document.getElementById('accountSelect');
    const findSelect = document.getElementById('findPasswordAccountSelect');
    if (!select || !findSelect) return;
    const accounts = Object.keys(getAccounts()).sort();
    select.innerHTML = findSelect.innerHTML = '<option value="">-- 계정 선택 --</option>' +
        accounts.map(a => `<option value="${a.replace(/"/g, '&quot;')}">${a.replace(/</g, '&lt;')}</option>`).join('');
}

function doLogin() {
    const name = (document.getElementById('accountSelect')?.value || '').trim();
    const password = (document.getElementById('passwordInput')?.value || '').trim();
    if (!name) {
        alert('계정을 선택하세요.');
        return;
    }
    const acc = getAccount(name);
    if (!acc || acc.password !== password) {
        alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    currentAccount = name;
    loadOptionsForAccount(name);
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('passwordInput').value = '';
    const accDisplay = document.getElementById('currentAccountDisplay');
    if (accDisplay) accDisplay.textContent = '(' + name + ')';
    document.getElementById('startOverlay').classList.remove('hidden');
}

let passwordPromptCallback = null;

function showPasswordPrompt(title, desc, onConfirm) {
    document.getElementById('passwordPromptTitle').textContent = title;
    document.getElementById('passwordPromptDesc').textContent = desc;
    document.getElementById('passwordPromptInput').value = '';
    passwordPromptCallback = onConfirm;
    document.getElementById('passwordPromptModal').classList.remove('hidden');
}

function hidePasswordPrompt() {
    document.getElementById('passwordPromptModal').classList.add('hidden');
    passwordPromptCallback = null;
}

function handleResetRanking() {
    if (!currentAccount) {
        alert('로그인된 계정이 없습니다.');
        return;
    }
    if (!confirm(currentAccount + ' 계정의 점수를 초기화하시겠습니까?')) return;
    clearRanking();
    resetRankingUI();
    alert('점수가 초기화되었습니다.');
}

function handleDeleteAccount() {
    const name = (document.getElementById('accountSelect')?.value || '').trim();
    if (!name) {
        alert('삭제할 계정을 선택하세요.');
        return;
    }
    showPasswordPrompt('계정 삭제', name + ' 계정의 비밀번호를 입력하세요. 삭제 후 복구할 수 없습니다.', (pwd) => {
        const acc = getAccount(name);
        if (!acc || acc.password !== pwd) {
            alert('비밀번호가 올바르지 않습니다.');
            return false;
        }
        deleteAccountData(name);
        refreshAccountList();
        if (currentAccount === name) currentAccount = '';
        alert('계정이 삭제되었습니다.');
        return true;
    });
}

function showCreateAccountModal() {
    ['newAccountName', 'newPassword', 'newPasswordConfirm', 'newQuestion', 'newHint', 'newAnswer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('newPassword').type = 'password';
    document.getElementById('newPasswordConfirm').type = 'password';
    document.getElementById('toggleNewPassword').textContent = '👁';
    document.getElementById('toggleNewPasswordConfirm').textContent = '👁';
    const msgEl = document.getElementById('passwordMatchMsg');
    if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }
    document.getElementById('createAccountModal').classList.remove('hidden');
}

function togglePasswordVisibility(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input || !btn) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
        btn.title = '비밀번호 숨기기';
    } else {
        input.type = 'password';
        btn.textContent = '👁';
        btn.title = '비밀번호 보기';
    }
}

function checkPasswordMatch() {
    const pwd = (document.getElementById('newPassword')?.value || '').trim();
    const confirm = (document.getElementById('newPasswordConfirm')?.value || '').trim();
    const msgEl = document.getElementById('passwordMatchMsg');
    if (!msgEl) return;
    if (!confirm) {
        msgEl.style.display = 'none';
        return;
    }
    msgEl.style.display = 'block';
    if (pwd === confirm) {
        msgEl.textContent = '비밀번호가 일치합니다.';
        msgEl.className = 'password-match-msg ok';
    } else {
        msgEl.textContent = '비밀번호가 다릅니다.';
        msgEl.className = 'password-match-msg error';
    }
}

function hideCreateAccountModal() {
    document.getElementById('createAccountModal').classList.add('hidden');
}

function updateOptionsButtonVisibility() {
    const optionsBtn = document.getElementById('optionsBtn');
    if (!optionsBtn) return;
    const loginEl = document.getElementById('loginOverlay');
    const editEl = document.getElementById('editAccountModal');
    const loginVisible = loginEl && !loginEl.classList.contains('hidden');
    const editVisible = editEl && !editEl.classList.contains('hidden');
    optionsBtn.style.display = (loginVisible || editVisible) ? 'none' : '';
}

function showEditAccountModal() {
    if (!currentAccount) return;
    const acc = getAccount(currentAccount);
    if (!acc) return;
    document.getElementById('editAccountNameDisplay').textContent = '계정: ' + currentAccount;
    document.getElementById('editCurrentPassword').value = '';
    document.getElementById('editNewPassword').value = '';
    document.getElementById('editNewPasswordConfirm').value = '';
    document.getElementById('editQuestion').value = acc.question || '';
    document.getElementById('editHint').value = acc.hint || '';
    document.getElementById('editAnswer').value = acc.answer || '';
    const msgEl = document.getElementById('editPasswordMatchMsg');
    if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }
    document.getElementById('editCurrentPassword').type = 'password';
    document.getElementById('editNewPassword').type = 'password';
    document.getElementById('editNewPasswordConfirm').type = 'password';
    document.getElementById('editAccountModal').classList.remove('hidden');
    updateOptionsButtonVisibility();
}

function hideEditAccountModal() {
    document.getElementById('editAccountModal').classList.add('hidden');
    updateOptionsButtonVisibility();
}

function checkEditPasswordMatch() {
    const pwd = (document.getElementById('editNewPassword')?.value || '').trim();
    const confirm = (document.getElementById('editNewPasswordConfirm')?.value || '').trim();
    const msgEl = document.getElementById('editPasswordMatchMsg');
    if (!msgEl) return;
    if (!confirm) {
        msgEl.style.display = 'none';
        return;
    }
    msgEl.style.display = 'block';
    if (pwd === confirm) {
        msgEl.textContent = '비밀번호가 일치합니다.';
        msgEl.className = 'password-match-msg ok';
    } else {
        msgEl.textContent = '비밀번호가 다릅니다.';
        msgEl.className = 'password-match-msg error';
    }
}

function handleEditAccount() {
    const currentPwd = (document.getElementById('editCurrentPassword')?.value || '').trim();
    const newPwd = (document.getElementById('editNewPassword')?.value || '').trim();
    const newPwdConfirm = (document.getElementById('editNewPasswordConfirm')?.value || '').trim();
    const question = (document.getElementById('editQuestion')?.value || '').trim();
    const hint = (document.getElementById('editHint')?.value || '').trim();
    const answer = (document.getElementById('editAnswer')?.value || '').trim();
    if (!currentPwd) { alert('현재 비밀번호를 입력하세요.'); return; }
    const acc = getAccount(currentAccount);
    if (!acc || acc.password !== currentPwd) {
        alert('현재 비밀번호가 올바르지 않습니다.');
        return;
    }
    if (newPwd && newPwd !== newPwdConfirm) {
        alert('새 비밀번호가 일치하지 않습니다.');
        return;
    }
    if (!question || !answer) { alert('비밀번호 찾기 질문과 답을 입력하세요.'); return; }
    const finalPassword = newPwd || currentPwd;
    saveAccount(currentAccount, { ...acc, password: finalPassword, question, hint, answer });
    hideEditAccountModal();
    alert('계정 정보가 수정되었습니다.');
}

function handleCreateAccount() {
    const name = (document.getElementById('newAccountName')?.value || '').trim();
    const pwd = (document.getElementById('newPassword')?.value || '').trim();
    const pwdConfirm = (document.getElementById('newPasswordConfirm')?.value || '').trim();
    const question = (document.getElementById('newQuestion')?.value || '').trim();
    const hint = (document.getElementById('newHint')?.value || '').trim();
    const answer = (document.getElementById('newAnswer')?.value || '').trim();
    if (!name) { alert('계정 이름을 입력하세요.'); return; }
    if (!pwd) { alert('비밀번호를 입력하세요.'); return; }
    if (pwd !== pwdConfirm) { alert('비밀번호가 일치하지 않습니다.'); return; }
    if (!question || !answer) { alert('비밀번호 찾기 질문과 답을 입력하세요.'); return; }
    if (getAccount(name)) { alert('이미 존재하는 계정 이름입니다.'); return; }
    saveAccount(name, { password: pwd, question, hint, answer });
    refreshAccountList();
    hideCreateAccountModal();
    alert('계정이 생성되었습니다.');
}

function showFindPasswordModal() {
    refreshAccountList();
    document.getElementById('findPasswordQuestion').style.display = 'none';
    document.getElementById('findPasswordHint').style.display = 'none';
    document.getElementById('findPasswordAnswer').style.display = 'none';
    document.getElementById('findPasswordResult').style.display = 'none';
    document.getElementById('findPasswordAnswer').value = '';
    document.getElementById('findPasswordModal').classList.remove('hidden');
}

function onFindPasswordAccountSelect() {
    const name = document.getElementById('findPasswordAccountSelect')?.value?.trim();
    const qEl = document.getElementById('findPasswordQuestion');
    const hEl = document.getElementById('findPasswordHint');
    const aEl = document.getElementById('findPasswordAnswer');
    if (!name) {
        qEl.style.display = 'none';
        hEl.style.display = 'none';
        aEl.style.display = 'none';
        return;
    }
    const acc = getAccount(name);
    if (!acc) return;
    qEl.textContent = '질문: ' + acc.question;
    hEl.textContent = '힌트: ' + (acc.hint || '(없음)');
    qEl.style.display = 'block';
    hEl.style.display = 'block';
    aEl.style.display = 'block';
}

function handleFindPassword() {
    const name = document.getElementById('findPasswordAccountSelect')?.value?.trim();
    const answer = (document.getElementById('findPasswordAnswer')?.value || '').trim();
    const resultEl = document.getElementById('findPasswordResult');
    if (!name || !answer) {
        alert('계정을 선택하고 답을 입력하세요.');
        return;
    }
    const acc = getAccount(name);
    if (!acc) return;
    const correct = acc.answer.trim().toLowerCase() === answer.trim().toLowerCase();
    if (correct) {
        const pwd = acc.password;
        const half = Math.ceil(pwd.length / 2);
        let revealed = '';
        for (let i = 0; i < pwd.length; i++) {
            revealed += (i < half) ? pwd[i] : '*';
        }
        resultEl.textContent = '비밀번호 50%: ' + revealed;
        resultEl.style.display = 'block';
    } else {
        alert('답이 올바르지 않습니다.');
    }
}

if (!STAGE6_ONLY) {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', doLogin);
    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });
    const createAccountBtn = document.getElementById('createAccountBtn');
    if (createAccountBtn) createAccountBtn.addEventListener('click', showCreateAccountModal);
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', handleDeleteAccount);
    const findPasswordBtn = document.getElementById('findPasswordBtn');
    if (findPasswordBtn) findPasswordBtn.addEventListener('click', showFindPasswordModal);
    const createAccountSubmitBtn = document.getElementById('createAccountSubmitBtn');
    if (createAccountSubmitBtn) createAccountSubmitBtn.addEventListener('click', handleCreateAccount);
    const createAccountCancelBtn = document.getElementById('createAccountCancelBtn');
    if (createAccountCancelBtn) createAccountCancelBtn.addEventListener('click', hideCreateAccountModal);
    const toggleLoginPassword = document.getElementById('toggleLoginPassword');
    if (toggleLoginPassword) toggleLoginPassword.addEventListener('click', () => togglePasswordVisibility('passwordInput', 'toggleLoginPassword'));
    const togglePasswordPrompt = document.getElementById('togglePasswordPrompt');
    if (togglePasswordPrompt) togglePasswordPrompt.addEventListener('click', () => togglePasswordVisibility('passwordPromptInput', 'togglePasswordPrompt'));
    const toggleNewPassword = document.getElementById('toggleNewPassword');
    if (toggleNewPassword) toggleNewPassword.addEventListener('click', () => togglePasswordVisibility('newPassword', 'toggleNewPassword'));
    const toggleNewPasswordConfirm = document.getElementById('toggleNewPasswordConfirm');
    if (toggleNewPasswordConfirm) toggleNewPasswordConfirm.addEventListener('click', () => togglePasswordVisibility('newPasswordConfirm', 'toggleNewPasswordConfirm'));
    const newPasswordConfirm = document.getElementById('newPasswordConfirm');
    if (newPasswordConfirm) newPasswordConfirm.addEventListener('blur', checkPasswordMatch);
    const findPasswordAccountSelect = document.getElementById('findPasswordAccountSelect');
    if (findPasswordAccountSelect) findPasswordAccountSelect.addEventListener('change', onFindPasswordAccountSelect);
    const findPasswordSubmitBtn = document.getElementById('findPasswordSubmitBtn');
    if (findPasswordSubmitBtn) findPasswordSubmitBtn.addEventListener('click', handleFindPassword);
    const findPasswordCancelBtn = document.getElementById('findPasswordCancelBtn');
    if (findPasswordCancelBtn) findPasswordCancelBtn.addEventListener('click', () => { const el = document.getElementById('findPasswordModal'); if (el) el.classList.add('hidden'); });
    const editAccountBtn = document.getElementById('editAccountBtn');
    if (editAccountBtn) editAccountBtn.addEventListener('click', showEditAccountModal);
    const editAccountSubmitBtn = document.getElementById('editAccountSubmitBtn');
    if (editAccountSubmitBtn) editAccountSubmitBtn.addEventListener('click', handleEditAccount);
    const editAccountCancelBtn = document.getElementById('editAccountCancelBtn');
    if (editAccountCancelBtn) editAccountCancelBtn.addEventListener('click', hideEditAccountModal);
    const toggleEditCurrentPassword = document.getElementById('toggleEditCurrentPassword');
    if (toggleEditCurrentPassword) toggleEditCurrentPassword.addEventListener('click', () => togglePasswordVisibility('editCurrentPassword', 'toggleEditCurrentPassword'));
    const toggleEditNewPassword = document.getElementById('toggleEditNewPassword');
    if (toggleEditNewPassword) toggleEditNewPassword.addEventListener('click', () => togglePasswordVisibility('editNewPassword', 'toggleEditNewPassword'));
    const toggleEditNewPasswordConfirm = document.getElementById('toggleEditNewPasswordConfirm');
    if (toggleEditNewPasswordConfirm) toggleEditNewPasswordConfirm.addEventListener('click', () => togglePasswordVisibility('editNewPasswordConfirm', 'toggleEditNewPasswordConfirm'));
    const editNewPasswordConfirm = document.getElementById('editNewPasswordConfirm');
    if (editNewPasswordConfirm) editNewPasswordConfirm.addEventListener('blur', checkEditPasswordMatch);
    const passwordPromptConfirmBtn = document.getElementById('passwordPromptConfirmBtn');
    if (passwordPromptConfirmBtn) passwordPromptConfirmBtn.addEventListener('click', () => {
        const pwd = (document.getElementById('passwordPromptInput')?.value || '').trim();
        if (passwordPromptCallback && passwordPromptCallback(pwd)) hidePasswordPrompt();
    });
    const passwordPromptCancelBtn = document.getElementById('passwordPromptCancelBtn');
    if (passwordPromptCancelBtn) passwordPromptCancelBtn.addEventListener('click', hidePasswordPrompt);
    const passwordPromptInput = document.getElementById('passwordPromptInput');
    if (passwordPromptInput) passwordPromptInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('passwordPromptConfirmBtn')?.click(); });
}

const resetRankingBtn = document.getElementById('resetRankingBtn');
if (resetRankingBtn) resetRankingBtn.addEventListener('click', handleResetRanking);

function handleOrientationOrResize() {
    updateRotateOverlay();
    if (isMobile() && isLandscape()) {
        applyMobileLandscapeDimensions();
        applyOptions();
        try {
            if (gameRunning) {
                canvas.width = options.canvasWidth;
                canvas.height = options.canvasHeight;
                paddle.y = canvas.height - 40;
                paddle.x = Math.min(paddle.x, canvas.width - paddle.width);
            } else {
                canvas.width = options.canvasWidth;
                canvas.height = options.canvasHeight;
                paddle.y = canvas.height - 40;
                paddle.x = (canvas.width - paddle.width) / 2;
                bricks = createBricks();
                draw();
            }
        } catch (e) { console.warn('orientation resize:', e); }
    }
}
window.addEventListener('orientationchange', handleOrientationOrResize);
window.addEventListener('resize', () => {
    if (isMobile()) handleOrientationOrResize();
    updateFullscreenButton();
});

function init() {
    tryLockLandscape();
    updateRotateOverlay();
    updateFullscreenButton();
    if (isMobile() && isLandscape()) applyMobileLandscapeDimensions();
    applyOptions();
    if (STAGE6_ONLY || BOSS6_TEST) {
        currentStage = 6;
        currentAccount = BOSS6_TEST ? 'boss6_test' : 'stage6';
        bricks = createBricks();
        paddle.x = (canvas.width - paddle.width) / 2;
        paddle.y = canvas.height - 40;
        balls = [{ x: canvas.width / 2, y: paddle.y - BALL_RADIUS - 5, dx: 0, dy: 0, radius: BALL_RADIUS }];
        ballLaunched = false;
        mouseX = canvas.width / 2;
        document.getElementById('stage').textContent = 6;
        document.getElementById('startOverlay').classList.remove('hidden');
        const loginEl = document.getElementById('loginOverlay');
        if (loginEl) loginEl.classList.add('hidden');
        draw();
        return;
    }
    currentStage = 1;
    bricks = createBricks();
    paddle.x = (canvas.width - paddle.width) / 2;
    paddle.y = canvas.height - 40;
    balls = [{
        x: canvas.width / 2,
        y: paddle.y - BALL_RADIUS - 5,
        dx: 0,
        dy: 0,
        radius: BALL_RADIUS
    }];
    ballLaunched = false;
    mouseX = canvas.width / 2;
    document.getElementById('startOverlay').classList.add('hidden');
    document.getElementById('loginOverlay').classList.remove('hidden');
    refreshAccountList();
    updateOptionsButtonVisibility();
    draw();
}

init();
