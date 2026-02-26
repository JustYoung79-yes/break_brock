const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Firebase (firebase.js 모듈에서 초기화됨)
let firebaseApp = window.firebaseApp || null;
let firestoreDb = window.firestoreDb || null;

const STAGE6_ONLY = (typeof window !== 'undefined' && window.STAGE6_ONLY) || false;
const BOSS6_TEST = (typeof window !== 'undefined' && window.BOSS6_TEST) || false;
const BOSS5_TEST = (typeof window !== 'undefined' && window.BOSS5_TEST) || false;
const BOSS4_TEST = (typeof window !== 'undefined' && window.BOSS4_TEST) || false;
const STAGE4_ONLY = (typeof window !== 'undefined' && window.STAGE4_ONLY) || false;
const STAGE3_ONLY = (typeof window !== 'undefined' && window.STAGE3_ONLY) || false;

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
const PADDLE_HEIGHT = 30;
const BALL_RADIUS = 8;
const BRICK_PADDING = 4;
const BRICK_OFFSET_TOP = 60;
const BRICK_OFFSET_LEFT = 30;

// 난이도별 설정 (stage6BossInvincibleMs: HP 1일 때 무적 시간, ms)
const DIFFICULTY_CONFIG = {
    easy: { ballSpeed: 3, stage6BallSpeed: 5, scoreMult: 1, bossScoreMult: 1, reinforcedMult: 0.5, itemCount: 8, nerfCount: 2, stage6BossInvincibleMs: 10000 },
    medium: { ballSpeed: 5, stage6BallSpeed: 7, scoreMult: 2, bossScoreMult: 2, reinforcedMult: 1, itemCount: 5, nerfCount: 5, stage6BossInvincibleMs: 20000 },
    hard: { ballSpeed: 7, stage6BallSpeed: 9, scoreMult: 3, bossScoreMult: 3, reinforcedMult: 1.5, itemCount: 2, nerfCount: 8, stage6BossInvincibleMs: 33000 }
};

// 옵션 설정값
let options = {
    paddleSpeed: 12,
    ballSpeed: 3,
    difficulty: 'easy',
    brickRows: 6,
    brickCols: 10,
    canvasWidth: 800,
    canvasHeight: 600,
    paddleSkin: 'default',
    ballSkin: 'default',
    language: 'ko',
};

// 꾸미기 상점 스킨 정의 (판: gradient 색상, 공: gradient 색상)
const PADDLE_SKINS = [
    { id: 'default', name: '검', emoji: '⚔️', colors: ['#667eea', '#764ba2'] },
    { id: 'blue', name: '파랑', emoji: '🔵', colors: ['#48dbfb', '#0abde3'] },
    { id: 'red', name: '빨강', emoji: '🔴', colors: ['#ff6b6b', '#ee5a5a'] },
    { id: 'green', name: '초록', emoji: '🟢', colors: ['#1dd1a1', '#10ac84'] },
    { id: 'gold', name: '골드', emoji: '⭐', colors: ['#ffd700', '#f9ca24'] },
];
const BALL_SKINS = [
    { id: 'default', name: '기본', emoji: '⚪', colors: ['#ffffff', '#e0e0ff', '#9d9dff'] },
    { id: 'blue', name: '파랑', emoji: '🔵', colors: ['#ffffff', '#48dbfb', '#0abde3'] },
    { id: 'fire', name: '불꽃', emoji: '🔥', colors: ['#ffffff', '#ff6b6b', '#ff3838'] },
    { id: 'ice', name: '얼음', emoji: '❄️', colors: ['#ffffff', '#74b9ff', '#0984e3'] },
    { id: 'rainbow', name: '무지개', emoji: '🌈', colors: null },
];

// UI 동기화 (메인+사이드바) - DOM 캐시로 querySelectorAll 반복 호출 감소
let _uiStage, _uiScore, _uiLives, _uiCoins;
function updateStageUI(v) {
    if (!_uiStage) _uiStage = document.querySelectorAll('.stageVal');
    _uiStage.forEach(el => { el.textContent = v; });
}
function updateScoreUI(v) {
    if (!_uiScore) _uiScore = document.querySelectorAll('.scoreVal');
    _uiScore.forEach(el => { el.textContent = v; });
}
function updateLivesUI() {
    if (!_uiLives) _uiLives = document.querySelectorAll('.livesVal');
    const effectiveHealth = Math.max(0, lives - bossBulletDamageAccum);  // 보스 총알 0.2 데미지 반영
    const pct = Math.min(100, Math.max(0, (effectiveHealth / 3) * 100));  // 3생명=100%, 2.8=93%, 1=33%
    _uiLives.forEach(el => { el.style.width = pct + '%'; });
}
function updateCoinsUI(v) {
    if (!_uiCoins) _uiCoins = document.querySelectorAll('.coinVal');
    _uiCoins.forEach(el => { el.textContent = v; });
}

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

// 모바일 가로 모드용 캔버스 크기 (게임창 세로 꽉, UI 오른쪽 패널)
function applyMobileLandscapeDimensions() {
    if (!isMobile() || !isLandscape()) return;
    const sidebarW = 140;
    const pad = 16;
    const maxW = Math.max(200, Math.min(window.innerWidth - sidebarW - pad, 960));
    const maxH = Math.max(200, Math.min(window.innerHeight - pad, 600));
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

// 모바일 로그인 후: 가로모드+전체화면 고정 (세로 전환 불가)
function enforceMobileLandscapeFullscreen() {
    if (!isMobile() || isLoginScreenVisible()) return;
    tryLockLandscape();
    if (!isFullscreen()) {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (req) req.call(el).catch(() => {});
    }
}

// 회전 안내 오버레이 표시 (모바일 세로 모드일 때, 로그인 화면 제외)
function updateRotateOverlay() {
    const el = document.getElementById('rotateOverlay');
    if (!el) return;
    if (isMobile() && !isLandscape() && !isLoginScreenVisible()) {
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
let bossBulletDamageAccum = 0;
let currentStage = 1;
const TOTAL_STAGES = 6;
const STAGE_NAMES = ['', '스테이지 1', '스테이지 2', '스테이지 3', '스테이지 4', '스테이지 5', '스테이지 6'];
let animationId;
let activeItems = [];
let fallingItems = [];
let balls = [];
let bullets = [];
let bossBullets = [];
let bossShields = [];  // { bossBrick } - 보스 주변 방어막, 공으로 때려야 제거
let damageNumbers = [];  // { x, y, value, until } - 보스 타격 시 표시되는 데미지 숫자
let shieldActiveUntil = 0;  // 방패 착용 시 클릭하면 이 시간까지 보스/부하몬스터 공격 막음
let bombExplosions = [];  // { x, y, radius, startTime, duration } - 폭탄 블록 폭발 이펙트
let creatorMode = false;
let creatorBricks = [];  // 만들기 모드용 벽돌 배열
let creatorDragging = false;
let creatorDragBrick = null;
let creatorDragOffsetX = 0;
let creatorDragOffsetY = 0;
let creatorLoopId = null;
let creatorDeleteMode = false;
let hasBulletPower = false;
let bulletAutoFireFrame = 0;
const BULLET_AUTO_FIRE_INTERVAL = 12;
let savedGameState = null;
let currentAccount = '';
let suspendedLoginAttempted = false;  // 정지된 계정으로 로그인 시도한 뒤 '계정 새로 만들기' 시 페널티
const GUEST_ACCOUNT = '__guest__';
function isGuestAccount() { return currentAccount === GUEST_ACCOUNT; }
let bricksHitThisFrame = new Set();
let lastDestroyedBricksThisFrame = [];  // 스테이지1~4: 마지막 벽돌2개가 한 프레임에 파괴될 때 보스 변환용
let bricksBrokenCount = 0;  // 14개마다 랜덤 보너스 (총알 13초 / 강화공 14초)
let coins = 0;  // 벽돌당 2코인, 장비 구매에 사용
let bossUpgrades = { ballSizeMult: 1, paddleSpeedMult: 1, explodeChance: 0, extraLife: 0 };  // 보스 처치 시 선택
let minions = [];  // 스테이지4+ 부하몬스터
let minionBullets = [];
let awaitingBossUpgradeChoice = false;
let awaitingMercyAttackChoice = false;
let mercyAttackBossBrick = null;
let ballDamageOverrideStage1to4 = null;  // 스테이지1~4 보스 체력 10일 때 9, 다음 스테이지에서 null
let bossDustEffects = [];  // { x, y, vx, vy, alpha, until }
let stage6DarkPhaseUntil = 0;   // 0=비활성, 아니면 밀리초 타임스탬프(9초간 어둠)
let stage6DarkPhaseNextAt = 0;  // 다음 어둠 트리거 시각
let stage56RecoveryItemTimer = 0;  // 스테이지5,6 회복아이템 20초 타이머
let stage6ItemMessageUntil = 0;  // 스테이지6 아이템 떨어질 때 메시지 표시
let stage6ItemMessageText = '';
let stage6BossIntroUntil = 0;    // 스테이지6 보스 등장 시 잠시 멈춤 및 '포효하는 어둠의 기사' 표시
let stage5ChaosBlinkUntil = 0;   // 스테이지5 혼돈 효과: 공 깜박임 종료 시각
let stage5ChaosTripleUntil = 0;  // 스테이지5 혼돈 효과: 3개→1개로 되돌릴 시각 (0=비활성)
let stage5ScreenFlipNextAt = 0;  // 스테이지5 화면 뒤집기 다음 트리거 시각
let stage5ScreenFlipped = false;
let stage5ScreenTiltNextAt = 0;  // 스테이지5 화면 옆으로 누움 다음 트리거 시각 (40초 주기)
let stage5ScreenTiltUntil = 0;   // 스테이지5 화면 옆으로 누움 종료 시각 (6초 지속)
let stage5BallTeleportNextAt = 0; // 스테이지5 공 순간이동 다음 트리거 시각 (10초 주기)
let stage5BallTeleportUntil = 0;  // 스테이지5 공 순간이동 효과 종료 시각 (3초 지속)
let stage5BallTeleportLastAt = 0; // 스테이지5 공 순간이동 마지막 시각 (1초 간격)
let stage5ScytheNextAt = 0;      // 스테이지5 제낫 변신 다음 트리거 시각 (18초 주기)
let stage5BossMottoNextAt = 0;  // 스테이지5 보스 "뭐든지 할수 있어!" 말풍선 다음 시각 (1초 주기)
let stage5ScytheRainUntil = 0;       // 스테이지5 제낫 비 패턴 종료 시각 (HP 20일 때 20초간)
let stage5ScytheRainTriggered = false;
let stage5FallingScythes = [];      // { x, y, vy, w, h }
let stage5ScytheRainSpawnTimer = 0;
let stage5BossAt30Percent = false;   // 스테이지5 보스 체력 30% 이하 도달 시 true
let stage5ScytheRain30NextAt = 0;    // 스테이지5 제낫 비(30%) 다음 트리거 시각 (20초 주기)
let stage5ScytheRain30Until = 0;     // 스테이지5 제낫 비(30%) 종료 시각 (20초 지속)
let stage5FallingScythes30 = [];     // 30% 제낫 비 낙하 제낫 (닿으면 체력 0.3 감소)
let stage5ScytheRain30SpawnTimer = 0;
let paddleScytheHitCooldownUntil = 0; // 제낫에 맞은 후 쿨다운
let paddleBossTouchCooldownUntil = 0;  // 판-보스 접촉 시 생명 감소 쿨다운 (1초)
let stage5IntroPhase = 0;  // 0=없음, 1=ㄳ터.png 대기, 2=6666666.png 후 스테이지5 시작

const STAGE5_BOSS_DEFEAT_MSG = '당신은 강해요 강해 빨라요 빨라 하지만 더 빨르고 더 강한게 있어요. 기사의 손이 다가옵니다. 잘 막을수 있을지! 흐하흐흐하흐ㅏㅎ';

function showStage5BossDefeatMessage() {
    awaitingBossUpgradeChoice = true;
    gamePaused = true;
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    const resetBtn = document.getElementById('resetRankingStageBtn');
    if (msgEl && overlayEl) {
        msgEl.textContent = STAGE5_BOSS_DEFEAT_MSG;
        msgEl.style.whiteSpace = 'pre-wrap';
        msgEl.style.maxWidth = '90%';
        if (resetBtn) resetBtn.style.display = 'none';
        overlayEl.style.zIndex = '20';
        overlayEl.classList.remove('hidden');
    }
    setTimeout(() => {
        if (overlayEl) {
            overlayEl.classList.add('hidden');
            overlayEl.style.zIndex = '';
        }
        showBossUpgradeChoice();
    }, 20000);
}

function showStage6BossDefeatWhiteFade() {
    const overlayEl = document.getElementById('stage6WhiteFadeOverlay');
    if (!overlayEl) {
        showBossUpgradeChoice();
        return;
    }
    overlayEl.classList.remove('hidden');
    overlayEl.classList.remove('stage6-white');
    setTimeout(() => {
        overlayEl.classList.add('stage6-white');
        setTimeout(() => {
            overlayEl.classList.add('hidden');
            overlayEl.classList.remove('stage6-white');
            showBossUpgradeChoice();
        }, 2100);
    }, 100);
}

function showBossUpgradeChoice() {
    awaitingBossUpgradeChoice = true;
    gamePaused = true;
    document.getElementById('bossUpgradeOverlay')?.classList.remove('hidden');
}

function finishMercyAttackChoice() {
    document.getElementById('mercyAttackOverlay')?.classList.add('hidden');
    document.getElementById('stageMsgOverlay')?.classList.add('hidden');
    awaitingMercyAttackChoice = false;
    if (mercyAttackBossBrick) {
        mercyAttackBossBrick.visible = false;
        mercyAttackBossBrick = null;
    }
    minions = [];
    minionBullets = [];
    bossDustEffects = [];
    showBossUpgradeChoice();
}
function applyBossUpgrade(choice) {
    if (choice === 'ballSize') bossUpgrades.ballSizeMult *= 1.13;
    else if (choice === 'paddleSpeed') bossUpgrades.paddleSpeedMult *= 1.12;
    else if (choice === 'explode') bossUpgrades.explodeChance = 0.1;
    else if (choice === 'extraLife') { lives++; updateLivesUI(); bossUpgrades.extraLife++; }
    else if (choice === 'bulletDuration') { hasBulletPower = true; activeItems.push({ type: 'bullet', duration: 300 }); updateBulletFireButtonVisibility(); }
    document.getElementById('bossUpgradeOverlay')?.classList.add('hidden');
    awaitingBossUpgradeChoice = false;
    gamePaused = false;
    if (STAGE4_ONLY && currentStage === 4) endStage4OnlyTest();
    else if (currentStage < TOTAL_STAGES) showStageClearAndNext();
    else winGame();
}

// 패들
const paddle = {
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    x: 0,
    y: 0,
    baseWidth: PADDLE_WIDTH,
    speed: 12
};

// 협동 모드: 위쪽 패들 (2P가 조종)
let coopMode = false;
const paddleTop = {
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
const ITEM_TYPES = ['TRIPLE_BALL', 'BULLET', 'LIFE', 'PADDLE_2X', 'BALL_SLOW', 'MAGNET', 'EXTRA_POINTS', 'LASER', 'POWER_BALL'];

// 너프 타입 (보스 총알/너프블럭)
const NERF_TYPES = ['PADDLE_SLOW', 'PADDLE_SMALL', 'BALL_FAST', 'GAME_FREEZE'];
const NERF_DISPLAY_NAMES = { PADDLE_SLOW: '판 느림', PADDLE_SMALL: '판 축소', BALL_FAST: '판 느림', GAME_FREEZE: '2초 멈춤' };
// 보스 총알 효과: 다른 효과 2배 확률, 1초 멈춤 1배
const BOSS_BULLET_NERF_WEIGHTS = [
    { type: 'PADDLE_SLOW', weight: 2 },
    { type: 'PADDLE_SMALL', weight: 2 },
    { type: 'BALL_FAST', weight: 2 },
    { type: 'GAME_FREEZE', weight: 1 }
];

// 체력별 색상 (1~4) - 1:초록, 2:파랑, 3:분홍, 4:보라
const HP_COLORS = {
    1: '#22c55e', 2: '#3b82f6', 3: '#ec4899', 4: '#8b5cf6'
};

// 스테이지별 보스 설정: hp, movePattern, shootInterval, shieldInterval(프레임, 60fps기준)
const BOSS_CONFIG = {
    1: { hp: 20, movePattern: 'lr', shootInterval: 0, shieldInterval: 0 },
    2: { hp: 30, movePattern: 'lr', shootInterval: 0, shieldInterval: 0 },
    3: { hp: 40, movePattern: 'lr', shootInterval: 0, shieldInterval: 0 },
    4: { hp: 90, movePattern: 'free', shootInterval: 540, shieldInterval: 780 },   // 총알 9초마다, 방어막 13초
    5: { hp: 600, movePattern: 'free', shootInterval: 102, shieldInterval: 540 },  // 대각선 포함 자유 이동, 총알 1.7초마다, 방어막 9초
    6: { hp: 1000, movePattern: 'curve', shootInterval: 60, shieldInterval: 300 } // 5초
};

// 스테이지별 강화블럭 개수 (기준값, 난이도에 따라 배율 적용)
const REINFORCED_COUNT_BY_STAGE = [0, 5, 10, 20, 30, 50];

function getReinforcedCount(stageIdx) {
    const base = REINFORCED_COUNT_BY_STAGE[Math.min(stageIdx, 5)] || 0;
    const cfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
    return Math.max(0, Math.floor(base * cfg.reinforcedMult));
}

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
    paddleFreeze: '판 멈춤',
    powerBall: '강화공'
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

function createBossBrickOnly(stageKey, width, height) {
    const cfg = BOSS_CONFIG[stageKey] || BOSS_CONFIG[1];
    const w = width, h = height;
    const brick = {
        x: (options.canvasWidth - w) / 2,
        y: BRICK_OFFSET_TOP + 80,
        width: w, height: h,
        visible: true, hp: cfg.hp, maxHp: cfg.hp,
        isItem: false, isNerf: false, itemType: null, isBoss: true,
        radius: Math.min(w, h) / 2, bossBaseSize: Math.min(w, h),
        bossVx: 0, bossVy: 0, bossShootTimer: 0
    };
    return [[brick]];
}

function createBricks() {
    if (BOSS6_TEST) return createBossBrickOnly(6, 120, 120);
    if (BOSS4_TEST) return createBossBrickOnly(4, 80, 80);
    if (BOSS5_TEST) return createBossBrickOnly(5, 130, 130);
    const config = STAGE_CONFIG[Math.min(currentStage - 1, STAGE_CONFIG.length - 1)];
    const rows = config.rows;
    const cols = config.cols;
    const padding = Math.max(2, BRICK_PADDING - currentStage);
    const brickWidth = (options.canvasWidth - BRICK_OFFSET_LEFT * 2 - padding * (cols - 1)) / cols;
    const paddleArea = 80;
    const availableHeight = options.canvasHeight - BRICK_OFFSET_TOP - paddleArea;
    const maxBrickHeight = Math.max(12, (availableHeight - padding * (rows - 1)) / rows);
    const brickHeight = Math.min(Math.max(14, 24 - currentStage * 2), maxBrickHeight);

    const validPositions = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (isBrickInLayout(currentStage, r, c, rows, cols)) {
                validPositions.push(`${r},${c}`);
            }
        }
    }

    const shuffled = [...validPositions].sort(() => Math.random() - 0.5);
    const diffCfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
    const itemCount = Math.min(diffCfg.itemCount, 10);
    const nerfCount = Math.min(diffCfg.nerfCount, 10 - itemCount);
    const itemNerfPositions = shuffled.slice(0, itemCount + nerfCount);
    const itemPositions = new Set(itemNerfPositions.slice(0, itemCount));
    const nerfPositions = new Set(itemNerfPositions.slice(itemCount, itemCount + nerfCount));

    const reinforcedCount = getReinforcedCount(currentStage - 1);
    const reinforcedHpOptions = currentStage >= 4 ? [2, 3, 4] : currentStage >= 3 ? [2, 3] : [2];
    const reinforcedPositions = new Set();
    for (let i = 10; i < shuffled.length && reinforcedPositions.size < reinforcedCount; i++) {
        reinforcedPositions.add(shuffled[i]);
    }
    const bombCount = Math.min(3, Math.max(1, Math.floor(shuffled.length / 25)));
    const bombPositions = new Set();
    for (let i = 15; i < shuffled.length && bombPositions.size < bombCount; i++) {
        const p = shuffled[i];
        if (!itemPositions.has(p) && !nerfPositions.has(p)) bombPositions.add(p);
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
            const isBombBlock = bombPositions.has(pos);
            let hp = 1, itemType = null;
            if (isItemBlock) {
                itemType = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
                if (itemType === 'LIFE' && Math.random() > 0.2) {
                    const others = ITEM_TYPES.filter(t => t !== 'LIFE');
                    itemType = others[Math.floor(Math.random() * others.length)];
                }
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
                isBomb: isBombBlock,
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
let screenShakeIntensity = 0;  // 벽돌 충돌 시 미세 흔들림
const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;

// 입력 처리
let mouseX = canvas.width / 2;
let keys = {};
let lastInputMethod = 'mouse';
let lastPaddleDirection = 0;
let prevPaddleX = 0;
let paddleMoving = false;

function getCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    return (clientX - rect.left) * scaleX;
}
function getCanvasPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

document.addEventListener('mousemove', (e) => {
    mouseX = getCanvasX(e.clientX);
    lastInputMethod = 'mouse';
});

// 터치 지원 (모바일 세로 모드) - 상대 이동, 스크롤 방지
let touchOnCanvas = false;
let lastTouchX = 0;
let creatorTouchStart = null;
canvas.addEventListener('touchstart', (e) => {
    touchOnCanvas = true;
    audioUnlockedByUser = true; // Android: 첫 터치로 오디오 잠금 해제
    unlockAudio();
    e.preventDefault();
    if (creatorMode && e.touches.length > 0) {
        const t = e.touches[0];
        const pos = getCanvasPos(t.clientX, t.clientY);
        creatorTouchStart = { x: pos.x, y: pos.y };
        const brick = creatorBrickAt(pos.x, pos.y);
        if (creatorDeleteMode) {
            if (brick) creatorBricks = creatorBricks.filter(b => b !== brick);
        } else if (brick) {
            creatorDragging = true;
            creatorDragBrick = brick;
            creatorDragOffsetX = pos.x - brick.x;
            creatorDragOffsetY = pos.y - brick.y;
        } else if (pos.y >= BRICK_OFFSET_TOP && pos.y <= canvas.height - 80) {
            creatorBricks.push(createDefaultCreatorBrick(pos.x, pos.y));
        }
        return;
    }
    if (e.touches.length > 0) {
        lastTouchX = getCanvasX(e.touches[0].clientX);
        lastInputMethod = 'touch';
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (creatorMode && creatorDragging && creatorDragBrick && e.touches.length > 0) {
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        creatorDragBrick.x = Math.max(0, Math.min(canvas.width - creatorDragBrick.width, pos.x - creatorDragOffsetX));
        creatorDragBrick.y = Math.max(BRICK_OFFSET_TOP, Math.min(canvas.height - 80 - creatorDragBrick.height, pos.y - creatorDragOffsetY));
        return;
    }
    if (e.touches.length > 0) {
        const currentX = getCanvasX(e.touches[0].clientX);
        let delta = currentX - lastTouchX;
        if (currentStage === 5 && stage5ScreenFlipped) delta = -delta;
        if (delta > 0) lastPaddleDirection = 1;
        else if (delta < 0) lastPaddleDirection = -1;
        paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x + delta));
        lastTouchX = currentX;
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    touchOnCanvas = false;
    e.preventDefault();
    if (creatorMode) { creatorDragging = false; creatorDragBrick = null; creatorTouchStart = null; return; }
    if (stage5IntroPhase === 1 && e.changedTouches.length > 0) {
        stage5IntroPhase = 2;
        setTimeout(() => { stage5IntroPhase = 0; showStageStartAndResume(); }, 1500);
        return;
    }
    if (gameRunning && !gamePaused && !ballLaunched && e.changedTouches.length > 0) {
        launchBall();
    }
}, { passive: false });

canvas.addEventListener('click', (e) => {
    if (stage5IntroPhase === 1) {
        e.preventDefault();
        stage5IntroPhase = 2;
        setTimeout(() => { stage5IntroPhase = 0; showStageStartAndResume(); }, 1500);
    }
    // 방패 착용 시 클릭하면 0.4초 동안 보스/부하몬스터 공격 막기
    if (gameRunning && !gamePaused && (options.equipment && options.equipment[0]) === 'shield') {
        shieldActiveUntil = Date.now() + 400;
    }
});

canvas.addEventListener('touchcancel', () => {
    touchOnCanvas = false;
}, { passive: true });

// document 레벨에서 캔버스 터치 시 스크롤 방지 (일부 모바일 브라우저 대응)
document.addEventListener('touchmove', (e) => {
    if (touchOnCanvas && gameRunning) {
        e.preventDefault();
        if (e.touches.length > 0) {
            const currentX = getCanvasX(e.touches[0].clientX);
            let delta = currentX - lastTouchX;
            if (currentStage === 5 && stage5ScreenFlipped) delta = -delta;
            if (delta > 0) lastPaddleDirection = 1;
            else if (delta < 0) lastPaddleDirection = -1;
            paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x + delta));
            lastTouchX = currentX;
        }
    }
}, { passive: false });

document.addEventListener('keydown', (e) => {
    const isChatInput = e.target?.id === 'friendChatInput' || e.target?.closest?.('#friendChatModal');
    if (e.key === ' ' && isChatInput) { keys[' '] = true; return; }
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (coopMode && ['a', 'A', 'd', 'D'].includes(e.key)) e.preventDefault();
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
    if (stage5IntroPhase === 1 && e.key === ' ') {
        e.preventDefault();
        stage5IntroPhase = 2;
        setTimeout(() => { stage5IntroPhase = 0; showStageStartAndResume(); }, 1500);
        return;
    }
    if (e.key === ' ' && gameRunning && !gamePaused) {
        if (!ballLaunched) launchBall();
        else if (hasBulletPower && options.difficulty === 'hard' && !isMobile()) shootBullet();
    }
    // 마이스크림: 전투 중 Z키로 체력 0.3 회복 (1회 사용 시 소모)
    if ((e.key === 'z' || e.key === 'Z') && gameRunning && !gamePaused) {
        const count = (options.consumables && options.consumables.mayCream) || 0;
        if (count > 0) {
            e.preventDefault();
            options.consumables.mayCream = count - 1;
            bossBulletDamageAccum = Math.max(0, bossBulletDamageAccum - 0.3);
            updateLivesUI();
            saveOptionsToAccount().catch(() => {});
        }
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

function updatePaddle() {
    prevPaddleX = paddle.x;
    const speedMult = bossUpgrades.paddleSpeedMult || 1;
    // 스테이지5 화면 뒤집힌 상태에서는 키 방향을 보정해, 누르는 방향과 화면에서 움직이는 방향이 같게
    const flipKeys = currentStage === 5 && stage5ScreenFlipped;
    if (keys['ArrowLeft'] || keys['ArrowRight']) {
        if (keys['ArrowLeft']) { paddle.x += (flipKeys ? 1 : -1) * paddle.speed * speedMult; lastPaddleDirection = flipKeys ? 1 : -1; }
        if (keys['ArrowRight']) { paddle.x += (flipKeys ? -1 : 1) * paddle.speed * speedMult; lastPaddleDirection = flipKeys ? -1 : 1; }
        lastInputMethod = 'keyboard';
    } else if (lastInputMethod === 'mouse') {
        const effectiveMouseX = (currentStage === 5 && stage5ScreenFlipped) ? (canvas.width - mouseX) : mouseX;
        const targetX = effectiveMouseX - paddle.width / 2;
        const prevX = paddle.x;
        paddle.x += (targetX - paddle.x) * 0.2;
        if (paddle.x > prevX) lastPaddleDirection = 1;
        else if (paddle.x < prevX) lastPaddleDirection = -1;
    }
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
    paddleMoving = Math.abs(paddle.x - prevPaddleX) > 0.3;
    // 협동 모드: 2P가 위쪽 패들 조종 (A / D)
    if (coopMode) {
        if (keys['a'] || keys['A']) { paddleTop.x -= paddleTop.speed * speedMult; }
        if (keys['d'] || keys['D']) { paddleTop.x += paddleTop.speed * speedMult; }
        paddleTop.x = Math.max(0, Math.min(canvas.width - paddleTop.width, paddleTop.x));
    }
}

// 공 각도를 20~70도(수직 기준)로 제한하여 측면 끼임/모서리 끼임 방지
function clampBallAngle(dx, dy) {
    const speed = Math.sqrt(dx * dx + dy * dy);
    const minSpeed = (options.ballSpeed || 5) * 0.5;
    const useSpeed = speed < 0.001 ? minSpeed : speed;
    const tilt = Math.atan2(Math.abs(dx), Math.abs(dy)) * 180 / Math.PI;
    const clampedTilt = tilt < 15 ? 80 : Math.max(25, Math.min(70, tilt));
    const rad = clampedTilt * Math.PI / 180;
    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;
    let outDx = signX * useSpeed * Math.sin(rad);
    let outDy = signY * useSpeed * Math.cos(rad);
    const minDx = useSpeed * 0.35;
    if (Math.abs(outDx) < minDx) outDx = (outDx >= 0 ? 1 : -1) * minDx;
    return { dx: outDx, dy: outDy };
}

function launchBall() {
    if (ballLaunched || balls.length === 0) return;
    ballStickTimer = 0;
    const speed = options.ballSpeed;
    const dir = lastPaddleDirection > 0 ? 1 : (lastPaddleDirection < 0 ? -1 : (Math.random() > 0.5 ? 1 : -1));
    balls.forEach(b => {
        b.dx = speed * dir;
        b.dy = -speed;
        const c = clampBallAngle(b.dx, b.dy);
        b.dx = c.dx; b.dy = c.dy;
    });
    ballLaunched = true;
}

function updateBulletFireButtonVisibility() {
    const btn = document.getElementById('bulletFireBtn');
    if (!btn) return;
    const show = gameRunning && !gamePaused && hasBulletPower && options.difficulty === 'hard' && isMobile();
    btn.style.display = show ? '' : 'none';
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

function playBrickBreakSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.start(t);
        osc.stop(t + 0.06);
    } catch (e) {}
}

function vibrateBrickBreak() {
    if (isMobile() && navigator.vibrate) {
        try { navigator.vibrate(15); } catch (e) {}
    }
}

function playHurtSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.08);
    } catch (e) {}
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
            activeItems.push({ type: 'paddleSlow', duration });
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
            lives += (currentStage === 6 ? 2 : 1);
            updateLivesUI();
            break;
        case 'PADDLE_2X':
            paddle.width = Math.min(paddle.baseWidth * 2, canvas.width * 0.8);
            activeItems.push({ type: 'paddle2x', duration: 600 });
            break;
        case 'BALL_SLOW':
            if (currentStage <= 5) break;
            activeItems = activeItems.filter(i => i.type !== 'ballFast');
            balls.forEach(b => {
                const s = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
                if (s > 0.001) {
                    const baseSpeed = options.ballSpeed;
                    const mult = (baseSpeed * 0.5) / s;
                    b.dx *= mult;
                    b.dy *= mult;
                }
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
            updateBulletFireButtonVisibility();
            break;
        case 'MAGNET':
            activeItems.push({ type: 'magnet', duration: 600 });
            break;
        case 'EXTRA_POINTS':
            score += 100;
            updateScoreUI(score);
            break;
        case 'LASER':
            const topRow = bricks.findIndex(row => row.some(b => b && b.visible));
            if (topRow >= 0) {
                let laserCount = 0;
                bricks[topRow].forEach(b => {
                    if (b && b.visible) {
                        b.visible = false;
                        score += 10;
                        laserCount++;
                    }
                });
                if (laserCount > 0) {
                    playBrickBreakSound();
                    vibrateBrickBreak();
                }
                updateScoreUI(score);
            }
            break;
        case 'POWER_BALL':
            activeItems.push({ type: 'powerBall', duration: 600 });
            break;
    }
}

function applyBallSpeedFromActiveItems() {
    const ballSlow = activeItems.some(i => i.type === 'ballSlow');
    const ballFast = activeItems.some(i => i.type === 'ballFast');
    const baseSpeed = options.ballSpeed;
    let targetSpeed = baseSpeed;
    if (ballSlow) targetSpeed *= 0.5;
    if (ballFast) targetSpeed *= 2;
    balls.forEach(b => {
        const s = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
        if (s < 0.001) {
            b.dx = targetSpeed * (Math.random() > 0.5 ? 1 : -1);
            b.dy = -targetSpeed;
            return;
        }
        const mult = targetSpeed / s;
        b.dx *= mult;
        b.dy *= mult;
    });
}

function updateActiveItems() {
    if (hasBulletPower && options.difficulty !== 'hard') {
        bulletAutoFireFrame++;
        if (bulletAutoFireFrame >= BULLET_AUTO_FIRE_INTERVAL) {
            bulletAutoFireFrame = 0;
            shootBullet();
        }
    } else {
        bulletAutoFireFrame = 0;
    }
    updateBulletFireButtonVisibility();
    activeItems = activeItems.filter(item => {
        item.duration--;
        return item.duration > 0;
    });
    hasBulletPower = activeItems.some(i => i.type === 'bullet');
    const paddleSlow = activeItems.some(i => i.type === 'paddleSlow');
    const paddleSmall = activeItems.some(i => i.type === 'paddleSmall');
    const paddle2x = activeItems.some(i => i.type === 'paddle2x');
    if (paddleSlow) paddle.speed = options.paddleSpeed * 0.5;
    else paddle.speed = options.paddleSpeed;
    if (paddleSmall) paddle.width = paddle.baseWidth * 0.7;
    else if (paddle2x) paddle.width = Math.min(paddle.baseWidth * 2, canvas.width * 0.8);
    else paddle.width = paddle.baseWidth;
    applyBallSpeedFromActiveItems();
}

function updateFallingItems(dt = 1) {
    const magnetActive = activeItems.some(i => i.type === 'magnet');
    fallingItems = fallingItems.filter(item => {
        if (magnetActive && !NERF_TYPES.includes(item.type)) {
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

function getBallDamage() {
    const warriorMult = (currentAccount === '용사') ? 2.3 : 1;
    let dmg;
    if (currentStage <= 4 && ballDamageOverrideStage1to4 !== null)
        dmg = Math.round(ballDamageOverrideStage1to4 * (1 + (options.forgeAttack ?? 0) * 0.2));
    else {
        const base = currentStage >= 6 ? 90 : (currentStage === 5 ? 30 : 10);
        const mult = 1 + (options.forgeAttack ?? 0) * 0.2;
        dmg = Math.round(base * mult);
    }
    return Math.round(dmg * warriorMult);
}
function hitBrick(brick, isBullet = false) {
    if (bricksHitThisFrame.has(brick)) return;
    bricksHitThisFrame.add(brick);
    const hitInvincible = brick.isBoss && brick.bossHitInvincibleUntil && Date.now() < brick.bossHitInvincibleUntil;
    if (brick.isBoss && (isBossInvincible(brick) || hitInvincible)) return;
    let damage = brick.isBoss ? (isBullet ? 1 : (Math.random() < 0.18 ? 20 : getBallDamage())) : 1;
    brick.hp = Math.max(0, brick.hp - damage);
    if (brick.isBoss && currentStage === 5 && brick.hp === 20 && !stage5ScytheRainTriggered) {
        stage5ScytheRainTriggered = true;
        stage5ScytheRainUntil = Date.now() + 20000;
        stage5FallingScythes = [];
    }
    if (brick.isBoss && currentStage === 5 && brick.hp <= 180) stage5BossAt30Percent = true;  // 600의 30%
    if (brick.isBoss && currentStage <= 4 && brick.hp === 10) ballDamageOverrideStage1to4 = 9;
    if (brick.isBoss && currentStage <= 4 && brick.hp <= 1 && !brick.mercyChoiceTriggered) {
        brick.mercyChoiceTriggered = true;
        brick.hp = 1;
        awaitingMercyAttackChoice = true;
        mercyAttackBossBrick = brick;
        gamePaused = true;
        document.getElementById('mercyAttackOverlay')?.classList.remove('hidden');
    }
    if (brick.isBoss && !isBullet && damage > 0) {
        damageNumbers.push({
            x: brick.x + brick.width / 2, y: brick.y + brick.height / 2,
            value: damage, until: Date.now() + 600
        });
    }
    playBrickBreakSound();
    vibrateBrickBreak();
    if (currentStage === 5 || currentStage === 6) {
        screenShakeIntensity = Math.min(screenShakeIntensity + 6, 12);
    } else {
        screenShakeIntensity = Math.min(screenShakeIntensity + 3, 6);
    }
    if (brick.isBoss && brick.hp === 1 && currentStage === 6) {
        const cfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
        const invincibleMs = cfg.stage6BossInvincibleMs || 20000;
        brick.bossInvincibleUntil = Date.now() + invincibleMs;  // stage6만: 난이도별 무적 시간
        brick.bossInvinciblePhase = true;
    }
    if (brick.isBoss && !isBullet) {
        brick.bossHitInvincibleUntil = Date.now() + 1000;  // 공 맞을 때 1초 무적
        if (currentStage <= 3 && damage > 0) {
            brick.bossSpeechText = '아야!';
            brick.bossSpeechUntil = Date.now() + 1500;
        }
    }
    const cfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
    let addScore;
    if (brick.isBoss) {
        const BOSS_SCORES = [100, 200, 500, 1000, 2000, 4000];
        const baseScore = BOSS_SCORES[Math.min(currentStage - 1, 5)] || 100;
        addScore = baseScore * (cfg.bossScoreMult || 1);
    } else {
        const baseScore = brick.isItem ? 25 : (brick.isNerf ? 15 : (brick.isBomb ? 15 : 10));
        addScore = baseScore * cfg.scoreMult;
    }
    score += addScore;
    updateScoreUI(score);
    if (!brick.isBoss && bossUpgrades.explodeChance > 0 && Math.random() < bossUpgrades.explodeChance) {
        setTimeout(() => explodeNearbyBricks(brick), 50);
    }
    if (brick.hp <= 0) {
        if (!brick.isBoss && currentStage <= 4) lastDestroyedBricksThisFrame.push(brick);
        brick.visible = false;
        if (!brick.isBoss) { coins += 8; updateCoinsUI(coins); }
        if (brick.isItem && brick.itemType) spawnFallingItem(brick.x + brick.width/2, brick.y, brick.itemType);
        if (brick.isNerf && brick.itemType) spawnFallingItem(brick.x + brick.width/2, brick.y, brick.itemType);
        if (brick.isBomb) setTimeout(() => explodeNearbyBricks(brick), 400);
        applyBrickBreakBonus();
        if (brick.isBoss) {
            minions = [];
            minionBullets = [];
            if (currentStage === 5) {
                setStage5Cleared();
                showStage5BossDefeatMessage();
            } else if (currentStage === 6) {
                showStage6BossDefeatWhiteFade();
            } else {
                showBossUpgradeChoice();
            }
        }
    }
}

function applyBrickBreakBonus() {
    bricksBrokenCount++;
    if (bricksBrokenCount % 14 !== 0) return;
    const effect = Math.random() < 0.5 ? 'bullet' : 'powerBall';
    if (effect === 'bullet') {
        hasBulletPower = true;
        activeItems.push({ type: 'bullet', duration: 780 });  // 13초
        updateBulletFireButtonVisibility();
    } else {
        activeItems.push({ type: 'powerBall', duration: 840 });  // 14초
    }
    playItemPickupSound();
}

function destroyBrickWithoutHit(brick) {
    if (!brick || !brick.visible || brick.isBoss) return;
    const cfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
    const baseScore = brick.isItem ? 25 : brick.isNerf ? 15 : 10;
    score += baseScore * cfg.scoreMult;
    updateScoreUI(score);
    playBrickBreakSound();
    vibrateBrickBreak();
    if (currentStage === 5 || currentStage === 6) {
        screenShakeIntensity = Math.min(screenShakeIntensity + 4, 12);
    } else {
        screenShakeIntensity = Math.min(screenShakeIntensity + 2, 6);
    }
    brick.hp = 0;
    brick.visible = false;
    coins += 8;
    updateCoinsUI(coins);
    if (brick.isItem && brick.itemType) spawnFallingItem(brick.x + brick.width/2, brick.y, brick.itemType);
    if (brick.isNerf && brick.itemType) spawnFallingItem(brick.x + brick.width/2, brick.y, brick.itemType);
    applyBrickBreakBonus();
}

function explodeNearbyBricks(centerBrick) {
    const cx = centerBrick.x + centerBrick.width / 2;
    const cy = centerBrick.y + centerBrick.height / 2;
    const radius = centerBrick.width * 2.2;
    bombExplosions.push({ x: cx, y: cy, radius: radius * 0.5, startTime: Date.now(), duration: 450 });
    bricks.forEach(row => {
        row.forEach(brick => {
            if (!brick || !brick.visible || brick === centerBrick || brick.isBoss) return;
            const bcx = brick.x + brick.width / 2;
            const bcy = brick.y + brick.height / 2;
            const dx = bcx - cx, dy = bcy - cy;
            if (dx * dx + dy * dy <= radius * radius) destroyBrickWithoutHit(brick);
        });
    });
}

function updateBoss(dt = 1) {
    if (currentStage === 5 || currentStage === 6) {
        stage56RecoveryItemTimer += dt;
        if (stage56RecoveryItemTimer >= 1200) {
            stage56RecoveryItemTimer = 0;
            const centerX = 24 + Math.random() * (canvas.width - 48);
            spawnFallingItem(centerX, 0, 'LIFE');
            if (currentStage === 6) {
                stage6ItemMessageUntil = Date.now() + 3500;
                stage6ItemMessageText = Math.random() < 0.24 ? '누군가 당신을 도와줬다' : '지금까지 만나왔던 적이 당신을 도와줬다';
            }
        }
    } else {
        stage56RecoveryItemTimer = 0;
    }
    const cfg = BOSS_CONFIG[currentStage] || BOSS_CONFIG[1];
    const now = Date.now();
    bricks.forEach(row => {
        row.forEach(brick => {
            if (!brick || !brick.visible || !brick.isBoss) return;
            if (currentStage === 5 && Date.now() < stage5ScytheRainUntil) return;
            const inScytheMode = currentStage === 5 && brick.bossScytheUntil && now < brick.bossScytheUntil;
            if (currentStage === 5) {
                if (stage5ScytheNextAt <= 0) stage5ScytheNextAt = now + 18000;
                if (!inScytheMode && now >= stage5ScytheNextAt) {
                    brick.bossScytheUntil = now + 500;  // 제낫 모드 0.5초
                    stage5ScytheNextAt = now + 18000;
                }
                if (stage5BossMottoNextAt <= 0) stage5BossMottoNextAt = now + 1000;
                if (now >= stage5BossMottoNextAt) {
                    stage5BossMottoNextAt = now + 1000;
                    brick.bossSpeechText = '뭐든지 할수 있어!';
                    brick.bossSpeechUntil = now + 1500;
                }
            }
            const r = Math.min(brick.width, brick.height) / 2;
            const cx = brick.x + brick.width / 2, cy = brick.y + brick.height / 2;
            if (brick.width !== brick.height) {
                brick.width = brick.height = r * 2;
                brick.x = cx - r;
                brick.y = cy - r;
            }
            brick.radius = r;
            const isInvincible = isBossInvincible(brick) || (brick.bossHitInvincibleUntil && Date.now() < brick.bossHitInvincibleUntil);
            if ((currentStage === 5 || currentStage === 6) && brick.bossBaseSize) {
                const baseSize = brick.bossBaseSize;
                const newSize = (currentStage === 5) ? baseSize * 0.95 : baseSize;
                const cx = brick.x + brick.width / 2, cy = brick.y + brick.height / 2;
                brick.width = brick.height = newSize;
                brick.radius = newSize / 2;
                brick.x = cx - newSize / 2;
                brick.y = cy - newSize / 2;
            }
            brick.bossShootTimer = (brick.bossShootTimer || 0) + dt;
            if (currentStage === 5) {
                brick.bossSpeechTimer = (brick.bossSpeechTimer || 0) + dt;
                if (brick.bossSpeechTimer >= 2200) {
                    brick.bossSpeechTimer = 0;
                    brick.bossSpeechText = '혼돈이야! 혼돈이야!';
                    brick.bossSpeechUntil = Date.now() + 2000;
                    // 혼돈 대사 시 랜덤 효과: 1=공 깜박임, 2=공 3개→1개
                    if (Math.random() < 0.5) {
                        stage5ChaosBlinkUntil = Date.now() + 3500;
                    } else {
                        if (ballLaunched && balls.length >= 1 && balls.length <= 3) {
                            const main = balls[0];
                            const spd = Math.sqrt(main.dx * main.dx + main.dy * main.dy) || options.ballSpeed;
                            while (balls.length < 3) {
                                const sign = balls.length === 1 ? 1 : -1;
                                balls.push({ x: main.x, y: main.y, radius: BALL_RADIUS, dx: spd * 0.7 * sign, dy: -spd * 0.7 });
                            }
                            stage5ChaosTripleUntil = Date.now() + 4500;
                        }
                    }
                }
            } else if (currentStage === 6) {
                brick.bossSpeechTimer = (brick.bossSpeechTimer || 0) + dt;
                if (brick.bossSpeechTimer >= 180) {
                    brick.bossSpeechTimer = 0;
                    brick.bossSpeechText = '어둠';
                    brick.bossSpeechUntil = Date.now() + 2000;
                }
                const now = Date.now();
                if (stage6DarkPhaseNextAt <= 0) stage6DarkPhaseNextAt = now + 30000;
                if (stage6DarkPhaseUntil <= 0 && now >= stage6DarkPhaseNextAt) {
                    stage6DarkPhaseUntil = now + 9000;
                    stage6DarkPhaseNextAt = now + 30000;
                }
                if (stage6DarkPhaseUntil > 0 && now >= stage6DarkPhaseUntil) {
                    stage6DarkPhaseUntil = 0;
                }
            }
            if (currentStage >= 4) {
                brick.bossMinionTimer = (brick.bossMinionTimer || 0) + dt;
                if (brick.bossMinionTimer >= 780) {
                    brick.bossMinionTimer = 0;
                    const mx = brick.x + brick.width / 2 - 12;
                    const my = brick.y + brick.height;
                    minions.push({ x: mx, y: my, width: 24, height: 24, vx: 1.5, vy: 0, hp: 1, shootTimer: 0 });
                }
            }
            if (currentStage >= 4 && (cfg.shieldInterval || 0) > 0) {
                brick.bossShieldTimer = (brick.bossShieldTimer || 0) + dt;
                if (brick.bossShieldTimer >= cfg.shieldInterval) {
                    brick.bossShieldTimer = 0;
                    bossShields = bossShields.filter(s => s.bossBrick !== brick);
                    bossShields.push({ bossBrick: brick });
                }
            }
            const shootInt = (brick.hp === 1 ? cfg.shootInterval / 2 : cfg.shootInterval);
            const bulletDy = (brick.hp === 1 ? 6 : 3);
            if (!inScytheMode && cfg.shootInterval > 0 && brick.bossShootTimer >= shootInt) {
                brick.bossShootTimer = 0;
                let bulletType = null;
                let bulletX, bulletY, bulletW, bulletH;
                if (currentStage === 4) {
                    brick.bossStage4BulletToggle = !brick.bossStage4BulletToggle;
                    bulletType = brick.bossStage4BulletToggle ? 'orange' : 'blue';
                    brick.bossSpeechText = bulletType === 'orange' ? '안 움직이지마!' : '움직이지마!';
                    brick.bossSpeechUntil = Date.now() + 2000;
                    bulletX = 0;
                    bulletY = 0;
                    bulletW = canvas.width;
                    bulletH = 24;
                } else {
                    const bw = currentStage === 5 ? Math.round(304 * 0.36 * 0.3) : (currentStage === 6 ? 48 : 8);
                    const bh = currentStage === 5 ? Math.round(456 * 0.36 * 0.4) : (currentStage === 6 ? 72 : 12);
                    const size = Math.max(bw, bh);
                    bulletX = brick.x + brick.width / 2 - size / 2;
                    bulletY = brick.y + brick.height;
                    bulletW = size;
                    bulletH = size;
                }
                bossBullets.push({
                    x: bulletX,
                    y: bulletY,
                    width: bulletW,
                    height: bulletH,
                    dy: bulletDy,
                    stage4Type: bulletType
                });
            }
            let speedMult = brick.hp === 1 ? 0.5 : 2;  // 에너지 1: 반속, 에너지 2+: 2배
            if (currentStage === 6 && isInvincible) speedMult *= 2;  // 스테이지6 무적 시 2배
            if (currentStage <= 3) speedMult *= 0.2;  // 스테이지 1,2,3은 많이 느리게
            if (inScytheMode) {
                const targetX = paddle.x + paddle.width / 2 - brick.width / 2;
                // 보스가 판과 실제로 겹치도록: 보스 하단이 판 안쪽으로 들어가게 (판-보스 접촉 시 생명 감소 트리거)
                const targetY = paddle.y - brick.height / 2 + 10;
                const spd = 2.4 * (dt / 16);  // 제낫 모드 시 판 추적 속도
                const dx = targetX - (brick.x + brick.width / 2);
                const dy = targetY - (brick.y + brick.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
                const moveCap = 65;  // 프레임당 최대 이동량
                brick.x = Math.max(0, Math.min(canvas.width - brick.width, brick.x + (dx / dist) * spd * Math.min(dist, moveCap)));
                brick.y = Math.max(BRICK_OFFSET_TOP, Math.min(canvas.height - brick.height, brick.y + (dy / dist) * spd * Math.min(dist, moveCap)));
            } else if (cfg.movePattern === 'lr') {
                brick.bossVx = brick.bossVx || 2;
                brick.x += brick.bossVx * speedMult;
                if (brick.x <= 0 || brick.x + brick.width >= canvas.width) brick.bossVx = -brick.bossVx;
                brick.x = Math.max(0, Math.min(canvas.width - brick.width, brick.x));
            } else if (cfg.movePattern === 'free') {
                brick.bossVx = brick.bossVx || 1.5;
                brick.bossVy = brick.bossVy || 1;
                brick.x += brick.bossVx * speedMult * dt;
                brick.y += brick.bossVy * speedMult * dt;
                if (brick.x <= 0 || brick.x + brick.width >= canvas.width) brick.bossVx = -brick.bossVx;
                if (brick.y <= BRICK_OFFSET_TOP || brick.y + brick.height >= canvas.height - 100) brick.bossVy = -brick.bossVy;
                brick.x = Math.max(0, Math.min(canvas.width - brick.width, brick.x));
                brick.y = Math.max(BRICK_OFFSET_TOP, Math.min(canvas.height - 100 - brick.height, brick.y));
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
                brick.x = Math.max(0, Math.min(canvas.width - brick.width, brick.x));
                brick.y = Math.max(BRICK_OFFSET_TOP, Math.min(canvas.height - 100 - brick.height, brick.y));
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
            // 공 피하기: 공이 보스 쪽으로 올 때 가로로 회피 (제낫 모드가 아닐 때만)
            if (!inScytheMode && ballLaunched && balls.length > 0 && cfg.movePattern !== 'none') {
                const bcx = brick.x + brick.width / 2, bcy = brick.y + brick.height / 2;
                const baseDodge = 1.5;
                const DODGE_SPEED = currentStage <= 3 ? baseDodge * 0.2 : baseDodge;
                const DODGE_RANGE = 250;
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
    // 판이 보스에 닿으면 생명 1 감소 (쿨다운 1초)
    bricks.forEach(row => {
        row.forEach(brick => {
            if (!brick || !brick.visible || !brick.isBoss) return;
            if (brick.x + brick.width > paddle.x && brick.x < paddle.x + paddle.width &&
                brick.y + brick.height > paddle.y && brick.y < paddle.y + paddle.height) {
                if (now > paddleBossTouchCooldownUntil) {
                    paddleBossTouchCooldownUntil = now + 1000;
                    lives--;
                    updateLivesUI();
                    if (typeof playHurtSound === 'function') playHurtSound();
                    if (lives <= 0) handleDeath();
                }
            }
        });
    });
    minions = minions.filter(m => {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.x <= 0 || m.x + m.width >= canvas.width) m.vx = -m.vx;
        if (m.y <= BRICK_OFFSET_TOP || m.y + m.height >= canvas.height - 80) m.vy = -m.vy;
        m.shootTimer = (m.shootTimer || 0) + dt;
        if (m.shootTimer >= 240) {
            m.shootTimer = 0;
            minionBullets.push({ x: m.x + m.width / 2 - 4, y: m.y + m.height, width: 8, height: 12, dy: 4 });
        }
        return m.hp > 0;
    });
    minionBullets = minionBullets.filter(b => {
        b.y += b.dy * dt;
        if (b.y > canvas.height) return false;
        if (b.y + b.height > paddle.y && b.y < paddle.y + paddle.height &&
            b.x + b.width > paddle.x && b.x < paddle.x + paddle.width) {
            if (shieldActiveUntil <= Date.now()) applyNerfEffect(pickRandomBossBulletNerf());
            return false;
        }
        if (coopMode && b.y + b.height > paddleTop.y && b.y < paddleTop.y + paddleTop.height &&
            b.x + b.width > paddleTop.x && b.x < paddleTop.x + paddleTop.width) {
            if (shieldActiveUntil <= Date.now()) applyNerfEffect(pickRandomBossBulletNerf());
            return false;
        }
        return true;
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
        if (!hit) {
            for (const minion of minions) {
                if (b.x + b.width > minion.x && b.x < minion.x + minion.width &&
                    yMax > minion.y && yMin < minion.y + minion.height) {
                    minion.hp = 0;
                    coins += 8;
                    updateCoinsUI(coins);
                    hit = true;
                    break;
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
            if (shieldActiveUntil > Date.now()) {
                return false;
            }
            let shouldTakeDamage = true;
            if (currentStage === 4 && b.stage4Type) {
                if (b.stage4Type === 'blue') {
                    shouldTakeDamage = paddleMoving;
                } else if (b.stage4Type === 'orange') {
                    shouldTakeDamage = !paddleMoving;
                }
            }
            if (shouldTakeDamage) {
                const dmg = Math.max(0.05, 0.2 - (options.forgeDefense ?? 0) * 0.05);
                bossBulletDamageAccum += dmg;
                playHurtSound();
                updateLivesUI();
                damageNumbers.push({
                    x: paddle.x + paddle.width / 2,
                    y: paddle.y - 25,
                    value: '-' + dmg.toFixed(2),
                    until: Date.now() + 1000
                });
                const threshold = 1 + (options.forgeHealth ?? 0) * 0.2;
                while (bossBulletDamageAccum >= threshold) {
                    bossBulletDamageAccum -= threshold;
                    lives--;
                    updateLivesUI();
                    if (lives <= 0) handleDeath();
                    else resetBall();
                }
            }
            if (!b.isBomb && !(currentStage === 4 && (b.stage4Type === 'orange' || b.stage4Type === 'blue'))) {
                applyNerfEffect(pickRandomBossBulletNerf());
            }
            return false;
        }
        if (coopMode && b.y + b.height > paddleTop.y && b.y < paddleTop.y + paddleTop.height &&
            b.x + b.width > paddleTop.x && b.x < paddleTop.x + paddleTop.width) {
            if (shieldActiveUntil > Date.now()) {
                return false;
            }
            const dmg = Math.max(0.05, 0.2 - (options.forgeDefense ?? 0) * 0.05);
            bossBulletDamageAccum += dmg;
            playHurtSound();
            updateLivesUI();
            damageNumbers.push({
                x: paddleTop.x + paddleTop.width / 2,
                y: paddleTop.y + paddleTop.height + 5,
                value: '-' + dmg.toFixed(2),
                until: Date.now() + 1000
            });
            const threshold = 1 + (options.forgeHealth ?? 0) * 0.2;
            while (bossBulletDamageAccum >= threshold) {
                bossBulletDamageAccum -= threshold;
                lives--;
                updateLivesUI();
                if (lives <= 0) handleDeath();
                else resetBall();
            }
            if (!b.isBomb) applyNerfEffect(pickRandomBossBulletNerf());
            return false;
        }
        return true;
    });
}

function resetBall() {
    ballLaunched = false;
    ballStickTimer = 0;
    const ballY = Math.max(BALL_RADIUS + 5, Math.min(canvas.height - BALL_RADIUS - 5, paddle.y - BALL_RADIUS - 5));
    const ballX = Math.max(BALL_RADIUS, Math.min(canvas.width - BALL_RADIUS, paddle.x + paddle.width / 2));
    balls = [{
        x: ballX,
        y: ballY,
        dx: 0,
        dy: 0,
        radius: BALL_RADIUS
    }];
}

function updateBall(dt = 1) {
    if (stage5IntroPhase >= 1) return;
    bricksHitThisFrame.clear();
    lastDestroyedBricksThisFrame = [];
    updateFallingItems(dt);
    updateBullets(dt);
    updateBoss(dt);

    // 스테이지5 혼돈 효과: 3개→1개 시 1개는 진짜(핑크), 나머지는 가짜(빨강). 가짜는 판 통과.
    if (currentStage === 5 && stage5ChaosTripleUntil > 0 && Date.now() >= stage5ChaosTripleUntil) {
        stage5ChaosTripleUntil = 0;
        if (balls.length > 1) {
            balls[0].stage5Fake = false;  // 진짜 (핑크)
            for (let i = 1; i < balls.length; i++) balls[i].stage5Fake = true;  // 가짜 (빨강, 판 통과)
        }
    }

    // 스테이지5 40초마다 화면 옆으로 누움 (6초 지속), 25초마다 화면 뒤집기 (제낫 비 중에는 화면 뒤집기/기울기 없음)
    if (currentStage === 5) {
        const now = Date.now();
        const el = document.querySelector('.game-main');
        const scytheRainActive = now < stage5ScytheRainUntil || now < stage5ScytheRain30Until;
        if (scytheRainActive) {
            if (el) el.style.transform = '';
        } else {
            if (stage5ScreenTiltNextAt <= 0) stage5ScreenTiltNextAt = now + 40000;
            if (now >= stage5ScreenTiltNextAt) {
                stage5ScreenTiltNextAt = now + 40000;
                stage5ScreenTiltUntil = now + 6000;
            }
            if (now < stage5ScreenTiltUntil) {
                if (el) el.style.transform = 'rotate(90deg)';
            } else {
                if (stage5ScreenFlipNextAt <= 0) stage5ScreenFlipNextAt = now + 25000;
                if (now >= stage5ScreenFlipNextAt) {
                    stage5ScreenFlipNextAt = now + 25000;
                    stage5ScreenFlipped = !stage5ScreenFlipped;
                }
                if (el) el.style.transform = stage5ScreenFlipped ? 'rotate(180deg)' : '';
            }
        }
        if (stage5BallTeleportNextAt <= 0) stage5BallTeleportNextAt = now + 10000;
        if (now >= stage5BallTeleportNextAt) {
            stage5BallTeleportNextAt = now + 10000;
            stage5BallTeleportUntil = now + 3000;
            stage5BallTeleportLastAt = 0;
        }
    } else {
        if (stage5ScreenFlipped) {
            stage5ScreenFlipped = false;
            const el = document.querySelector('.game-main');
            if (el) el.style.transform = '';
        }
        stage5ScreenFlipNextAt = 0;
        stage5ScreenTiltNextAt = 0;
        stage5ScreenTiltUntil = 0;
        stage5BallTeleportNextAt = 0;
        stage5BallTeleportUntil = 0;
        stage5BallTeleportLastAt = 0;
        stage5ChaosBlinkUntil = 0;
        stage5ChaosTripleUntil = 0;
        stage5ScytheNextAt = 0;
        stage5BossMottoNextAt = 0;
        stage5ScytheRainUntil = 0;
        stage5ScytheRainTriggered = false;
        stage5FallingScythes = [];
        stage5ScytheRainSpawnTimer = 0;
        stage5BossAt30Percent = false;
        stage5ScytheRain30NextAt = 0;
        stage5ScytheRain30Until = 0;
        stage5FallingScythes30 = [];
        stage5ScytheRain30SpawnTimer = 0;
        stage5IntroPhase = 0;
    }

    const stage5ScytheRainActive = currentStage === 5 && Date.now() < stage5ScytheRainUntil;
    // 스테이지5 보스 체력 30% 이하: 20초마다 제낫 비 20초 지속, 닿으면 체력 0.3 감소
    const stage5ScytheRain30Active = currentStage === 5 && stage5BossAt30Percent && Date.now() < stage5ScytheRain30Until;
    if (currentStage === 5 && stage5BossAt30Percent) {
        const now = Date.now();
        if (stage5ScytheRain30NextAt <= 0 || now >= stage5ScytheRain30NextAt) {
            stage5ScytheRain30NextAt = now + 20000;
            stage5ScytheRain30Until = now + 20000;
            stage5FallingScythes30 = [];
            stage5ScytheRain30SpawnTimer = 0;
        }
    }
    if (stage5ScytheRain30Active) {
        stage5ScytheRain30SpawnTimer += dt;
        if (stage5ScytheRain30SpawnTimer >= 8) {
            stage5ScytheRain30SpawnTimer = 0;
            const w = 44, h = 56;
            stage5FallingScythes30.push({
                x: Math.random() * Math.max(0, canvas.width - w),
                y: -h,
                vy: 3.5,
                w, h
            });
        }
        const now = Date.now();
        for (let i = stage5FallingScythes30.length - 1; i >= 0; i--) {
            const s = stage5FallingScythes30[i];
            s.y += s.vy * dt;
            if (s.y > canvas.height + s.h) {
                stage5FallingScythes30.splice(i, 1);
                continue;
            }
            if (s.y + s.h > paddle.y && s.y < paddle.y + paddle.height &&
                s.x + s.w > paddle.x && s.x < paddle.x + paddle.width) {
                if (shieldActiveUntil <= now) {
                    bossBulletDamageAccum += 0.3;
                    playHurtSound();
                    updateLivesUI();
                    const threshold = 1 + (options.forgeHealth ?? 0) * 0.2;
                    while (bossBulletDamageAccum >= threshold) {
                        bossBulletDamageAccum -= threshold;
                        lives--;
                        updateLivesUI();
                        if (lives <= 0) handleDeath();
                        else resetBall();
                    }
                }
                stage5FallingScythes30.splice(i, 1);
            }
        }
    }
    if (stage5ScytheRainActive) {
        stage5ScytheRainSpawnTimer += dt;
        if (stage5ScytheRainSpawnTimer >= 8) {
            stage5ScytheRainSpawnTimer = 0;
            const w = 44, h = 56;
            stage5FallingScythes.push({
                x: Math.random() * Math.max(0, canvas.width - w),
                y: -h,
                vy: 3.5,
                w, h
            });
        }
        const now = Date.now();
        for (let i = stage5FallingScythes.length - 1; i >= 0; i--) {
            const s = stage5FallingScythes[i];
            s.y += s.vy * dt;
            if (s.y > canvas.height + s.h) {
                stage5FallingScythes.splice(i, 1);
                continue;
            }
            if (s.y + s.h > paddle.y && s.y < paddle.y + paddle.height &&
                s.x + s.w > paddle.x && s.x < paddle.x + paddle.width) {
                if (shieldActiveUntil <= now && now > paddleScytheHitCooldownUntil) {
                    paddleScytheHitCooldownUntil = now + 800;
                    lives--;
                    updateLivesUI();
                    if (typeof playHurtSound === 'function') playHurtSound();
                    if (lives <= 0) handleDeath();
                }
                stage5FallingScythes.splice(i, 1);
            }
        }
    }

    if (!stage5ScytheRainActive) {
    if (!ballLaunched && balls.length > 0) {
        balls[0].x = paddle.x + paddle.width / 2;
        balls[0].y = paddle.y - BALL_RADIUS - 5;
        ballStickTimer += dt;
        if (ballStickTimer >= 60 * BALL_AUTO_LAUNCH_SEC) {
            launchBall();
        }
        return;
    }
    const powerBallActive = activeItems.some(i => i.type === 'powerBall');
    const ballRadiusMult = (powerBallActive ? 1.5 : 1) * (bossUpgrades.ballSizeMult || 1);
    // 스테이지5: 10초마다 3초 동안 1초마다 공 무작위 순간이동
    if (currentStage === 5 && ballLaunched && balls.length > 0 && Date.now() < stage5BallTeleportUntil) {
        const now = Date.now();
        if (stage5BallTeleportLastAt === 0 || now >= stage5BallTeleportLastAt + 1000) {
            stage5BallTeleportLastAt = now;
            const margin = 50;
            const minX = margin;
            const maxX = Math.max(minX, canvas.width - margin);
            const minY = margin;
            const maxY = Math.max(minY, canvas.height - margin);
            balls.forEach(ball => {
                const r = ball.radius * ballRadiusMult;
                ball.x = minX + Math.random() * (maxX - minX);
                ball.y = minY + Math.random() * (maxY - minY);
                ball.x = Math.max(r, Math.min(canvas.width - r, ball.x));
                ball.y = Math.max(r, Math.min(canvas.height - r, ball.y));
            });
        }
    }
    for (let bi = balls.length - 1; bi >= 0; bi--) {
        const ball = balls[bi];
        const r = ball.radius * ballRadiusMult;
        ball.x += ball.dx * dt;
        ball.y += ball.dy * dt;

        if (ball.x - r < 0 || ball.x + r > canvas.width) {
            ball.dx = -ball.dx;
            const c = clampBallAngle(ball.dx, ball.dy);
            ball.dx = c.dx; ball.dy = c.dy;
            ball.x = Math.max(r, Math.min(canvas.width - r, ball.x));
        }
        // 협동 모드: 위쪽 패들에 맞으면 아래로 반사, 상단 이탈 시 생명 감소
        if (coopMode) {
            if (!ball.stage5Fake &&
                ball.y - r < paddleTop.y + paddleTop.height &&
                ball.y + r > paddleTop.y &&
                ball.x > paddleTop.x &&
                ball.x < paddleTop.x + paddleTop.width &&
                ball.dy < 0) {
                const hitPos = Math.max(-1, Math.min(1, (ball.x - (paddleTop.x + paddleTop.width / 2)) / (paddleTop.width / 2)));
                const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                const angleDeg = 20 + 50 * Math.abs(hitPos);
                const angleRad = angleDeg * Math.PI / 180;
                ball.dx = (hitPos >= 0 ? 1 : -1) * speed * Math.sin(angleRad);
                ball.dy = speed * Math.cos(angleRad);
                const c = clampBallAngle(ball.dx, ball.dy);
                ball.dx = c.dx; ball.dy = c.dy;
            } else if (ball.y - r < 0) {
                const wasReal = !ball.stage5Fake;
                balls.splice(bi, 1);
                if (wasReal) {
                    const hasRealLeft = balls.some(b => !b.stage5Fake);
                    if (!hasRealLeft) {
                        playHurtSound();
                        lives--;
                        updateLivesUI();
                        if (lives <= 0) handleDeath();
                        else resetBall();
                    }
                }
            }
        } else if (ball.y - r < 0) {
            ball.dy = -ball.dy;
            const c = clampBallAngle(ball.dx, ball.dy);
            ball.dx = c.dx; ball.dy = c.dy;
            ball.y = Math.max(r, ball.y);
        }
        ball.x = Math.max(r, Math.min(canvas.width - r, ball.x));
        if (ball.y < r && !coopMode) ball.y = r;

        if (ball.y + r > paddle.y &&
            ball.y - r < paddle.y + paddle.height &&
            ball.x > paddle.x &&
            ball.x < paddle.x + paddle.width) {
            if (!ball.stage5Fake) {
                const hitPos = Math.max(-1, Math.min(1, (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2)));
                const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                const angleDeg = 20 + 50 * Math.abs(hitPos);
                const angleRad = angleDeg * Math.PI / 180;
                ball.dx = (hitPos >= 0 ? 1 : -1) * speed * Math.sin(angleRad);
                ball.dy = -speed * Math.cos(angleRad);
                const c = clampBallAngle(ball.dx, ball.dy);
                ball.dx = c.dx; ball.dy = c.dy;
            }
            // 가짜 공은 판에 닿지 않고 통과
        }

        if (ball.y + r > canvas.height) {
            const wasReal = !ball.stage5Fake;
            balls.splice(bi, 1);
            if (wasReal) {
                const hasRealLeft = balls.some(b => !b.stage5Fake);
                if (!hasRealLeft) {
                    playHurtSound();
                    lives--;
                    updateLivesUI();
                    if (lives <= 0) {
                        handleDeath();
                    } else {
                        resetBall();
                    }
                }
            }
            // 가짜 공은 하단 이탈 시 제거만, 생명 감소 없음
        }
    }

    balls.forEach(ball => {
        if (ball.stage5Fake) return;
        let ballHit = false;
        const r = ball.radius * ballRadiusMult;
        for (const minion of minions) {
            if (ball.x + r > minion.x && ball.x - r < minion.x + minion.width &&
                ball.y + r > minion.y && ball.y - r < minion.y + minion.height) {
                minion.hp = 0;
                coins += 8;
                updateCoinsUI(coins);
                const dx = ball.x - (minion.x + minion.width / 2);
                const dy = ball.y - (minion.y + minion.height / 2);
                const len = Math.sqrt(dx * dx + dy * dy) || 0.001;
                const nx = dx / len, ny = dy / len;
                const dot = ball.dx * nx + ball.dy * ny;
                if (dot > 0) {
                    ball.dx -= 2 * dot * nx;
                    ball.dy -= 2 * dot * ny;
                    const c = clampBallAngle(ball.dx, ball.dy);
                    ball.dx = c.dx; ball.dy = c.dy;
                }
                ballHit = true;
                break;
            }
        }
        if (ballHit) return;
        bossShields = bossShields.filter(shield => {
            const b = shield.bossBrick;
            if (!b || !b.visible) return false;
            const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
            const bossR = b.radius || b.width / 2;
            const shieldOuter = bossR + 22;
            const shieldInner = bossR + 2;
            const dx = ball.x - cx, dy = ball.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= shieldInner && dist <= shieldOuter + r) {
                ballHit = true;
                const nx = dx / (dist || 0.001);
                const ny = dy / (dist || 0.001);
                const dot = ball.dx * nx + ball.dy * ny;
                if (dot > 0) {
                    ball.dx -= 2 * dot * nx;
                    ball.dy -= 2 * dot * ny;
                    const c = clampBallAngle(ball.dx, ball.dy);
                    ball.dx = c.dx; ball.dy = c.dy;
                }
                playBrickBreakSound();
                return false;
            }
            return true;
        });
        if (ballHit) return;
        bricks.forEach(row => {
            row.forEach(brick => {
                if (brick && brick.visible && (!ballHit || powerBallActive) &&
                    ball.x + r > brick.x &&
                    ball.x - r < brick.x + brick.width &&
                    ball.y + r > brick.y &&
                    ball.y - r < brick.y + brick.height) {
                    hitBrick(brick, false);
                    if (!powerBallActive) {
                        const overlapLeft = (ball.x + r) - brick.x;
                        const overlapRight = (brick.x + brick.width) - (ball.x - r);
                        const overlapTop = (ball.y + r) - brick.y;
                        const overlapBottom = (brick.y + brick.height) - (ball.y - r);
                        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                        if (minOverlap === overlapLeft || minOverlap === overlapRight) ball.dx = -ball.dx;
                        else ball.dy = -ball.dy;
                        const c = clampBallAngle(ball.dx, ball.dy);
                        ball.dx = c.dx; ball.dy = c.dy;
                        ballHit = true;
                    }
                }
            });
        });
    });
    }

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
            const baseMult = currentStage === 6 ? 3.8 : 3;
            const size = Math.min(bossBrick.width, bossBrick.height) * baseMult;
            bossBrick.x += (bossBrick.width - size) / 2;
            bossBrick.y += (bossBrick.height - size) / 2;
            bossBrick.width = size;
            bossBrick.height = size;
            bossBrick.radius = size / 2;
            bossBrick.bossBaseSize = size;
            if (currentStage === 6) {
                stage6BossIntroUntil = Date.now() + 2500;
                gamePaused = true;
            }
        }
    }
    // 마지막 벽돌 2개가 한 프레임에 파괴되어 보스 변환을 건너뛴 경우: 하나를 보스로 부활
    if (visibleCount === 0 && currentStage <= 4 && lastDestroyedBricksThisFrame.length > 0) {
        const bossBrick = lastDestroyedBricksThisFrame[0];
        if (bossBrick) {
            const cfg = BOSS_CONFIG[currentStage] || BOSS_CONFIG[1];
            bossBrick.visible = true;
            bossBrick.isBoss = true;
            bossBrick.hp = cfg.hp;
            bossBrick.maxHp = cfg.hp;
            const baseMult = currentStage === 6 ? 3.8 : 3;
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
    if (allBricksGone && !awaitingBossUpgradeChoice) {
        if (STAGE3_ONLY && currentStage === 3) {
            endStage3OnlyTest();
        } else if (STAGE4_ONLY && currentStage === 4) {
            endStage4OnlyTest();
        } else if (currentStage < TOTAL_STAGES) {
            showStageClearAndNext();
        } else {
            winGame();
        }
    }
}

function endStage3OnlyTest() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    activeItems = [];
    fallingItems = [];
    hasBulletPower = false;
    bullets = [];
    bossBullets = [];
    bossShields = [];
    minions = [];
    minionBullets = [];
    damageNumbers = [];
    bombExplosions = [];
    bulletAutoFireFrame = 0;
    paddle.width = paddle.baseWidth;
    paddle.speed = options.paddleSpeed;
    updateBulletFireButtonVisibility();
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    const resetBtn = document.getElementById('resetRankingStageBtn');
    if (msgEl && overlayEl) {
        msgEl.textContent = '스테이지 3 클리어 - 테스트 종료';
        if (resetBtn) { resetBtn.style.display = 'none'; }
        overlayEl.classList.remove('hidden');
    }
}

function endStage4OnlyTest() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    activeItems = [];
    fallingItems = [];
    hasBulletPower = false;
    bullets = [];
    bossBullets = [];
    bossShields = [];
    damageNumbers = [];
    bombExplosions = [];
    bulletAutoFireFrame = 0;
    paddle.width = paddle.baseWidth;
    paddle.speed = options.paddleSpeed;
    updateBulletFireButtonVisibility();
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    const resetBtn = document.getElementById('resetRankingStageBtn');
    if (msgEl && overlayEl) {
        msgEl.textContent = '스테이지 4 클리어 - 테스트 종료';
        if (resetBtn) { resetBtn.style.display = 'none'; }
        overlayEl.classList.remove('hidden');
    }
}

let stageClearInProgress = false;
function showStageClearAndNext() {
    if (stageClearInProgress) return;
    stageClearInProgress = true;
    const justClearedStage1 = currentStage === 1;
    gameRunning = false;
    cancelAnimationFrame(animationId);
    activeItems = [];
    fallingItems = [];
    hasBulletPower = false;
    bullets = [];
    bossBullets = [];
    bossShields = [];
    damageNumbers = [];
    bombExplosions = [];
    bulletAutoFireFrame = 0;
    paddle.width = paddle.baseWidth;
    paddle.speed = options.paddleSpeed;
    updateBulletFireButtonVisibility();
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    const resetBtn = document.getElementById('resetRankingStageBtn');
    if (msgEl && overlayEl) {
        msgEl.textContent = '스테이지 클리어!';
        if (resetBtn) { resetBtn.style.display = 'inline-block'; }
        overlayEl.classList.remove('hidden');
    }
    if (justClearedStage1 && currentAccount && !isGuestAccount()) {
        saveClearedStage1().catch(() => {});
    }
    options.coins = coins;
    saveCoins();
    setTimeout(() => {
        if (resetBtn) { resetBtn.style.display = 'none'; }
        ballDamageOverrideStage1to4 = null;
        currentStage++;
        updateStageUI(currentStage);
        if (currentStage === 6) {
            const cfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
            options.ballSpeed = cfg.stage6BallSpeed;
        }
        bricks = createBricks();
        resetBall();
        if (currentStage === 5) {
            stage5IntroPhase = 1;
            if (overlayEl) overlayEl.classList.add('hidden');
            gameRunning = true;
            gamePaused = false;
            gameLoop();
            stageClearInProgress = false;
        } else if (currentStage === 6 && Math.random() < 0.01) {
            showChijijikVideoThen(() => {
                showStageStartAndResume();
                stageClearInProgress = false;
            });
        } else {
            showStageStartAndResume();
            stageClearInProgress = false;
        }
    }, 2000);
}

function showStageStartAndResume() {
    startBGM(currentStage);
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    const resetBtn = document.getElementById('resetRankingStageBtn');
    if (msgEl && overlayEl) {
        msgEl.textContent = currentStage === 4 ? '어두워졌습니다!' : (STAGE_NAMES[currentStage] || `스테이지 ${currentStage}`);
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

const earlyBossImage = new Image();
earlyBossImage.onload = onImageLoad;
earlyBossImage.onerror = () => { earlyBossImage.src = PATH.image + 'Boss.png'; };
earlyBossImage.src = PATH.image + '초반보스.png';

const stage2BossImage = new Image();
stage2BossImage.onload = onImageLoad;
stage2BossImage.onerror = () => { stage2BossImage.src = PATH.image + 'Boss.png'; };
stage2BossImage.src = PATH.image + '프로깃.png';

const stage3BossImage = new Image();
stage3BossImage.onload = onImageLoad;
stage3BossImage.onerror = () => { stage3BossImage.src = PATH.image + 'Boss.png'; };
stage3BossImage.src = PATH.image + '글레이드.png';

const stage4BossImage = new Image();
stage4BossImage.onload = onImageLoad;
stage4BossImage.onerror = () => { stage4BossImage.src = PATH.image + 'Boss.png'; };
stage4BossImage.src = PATH.image + '스테이지4보스.png';

const stage5BossImage = new Image();
stage5BossImage.onload = onImageLoad;
stage5BossImage.onerror = () => { stage5BossImage.src = PATH.image + 'Boss.png'; };
stage5BossImage.src = PATH.image + '스테이지5보스.png';

const stage5IntroImage1 = new Image();
stage5IntroImage1.onload = onImageLoad;
stage5IntroImage1.onerror = () => { stage5IntroImage1.src = PATH.image + 'Boss.png'; };
stage5IntroImage1.src = PATH.image + 'ㄳ터.png';
const stage5IntroImage2 = new Image();
stage5IntroImage2.onload = onImageLoad;
stage5IntroImage2.onerror = () => { stage5IntroImage2.src = PATH.image + 'Boss.png'; };
stage5IntroImage2.src = PATH.image + '6666666.png';

const stage6BossImage = new Image();
stage6BossImage.onload = onImageLoad;
stage6BossImage.onerror = () => { stage6BossImage.src = PATH.image + 'Boss.png'; };
stage6BossImage.src = PATH.image + '최종보스.png';

const paddleImage = new Image();
paddleImage.onload = onImageLoad;
paddleImage.src = PATH.image + '검.png';

const gladeImage = new Image();
gladeImage.onload = onImageLoad;
gladeImage.src = PATH.image + '글레이드.png';

const stage5BgImage = new Image();
stage5BgImage.onload = onImageLoad;
stage5BgImage.src = PATH.image + '스테이지5배경화면.png';

const stage5BossBulletImage = new Image();
stage5BossBulletImage.onload = onImageLoad;
stage5BossBulletImage.src = PATH.image + '제빌의 공격.png';

const stage5ScytheImage = new Image();
stage5ScytheImage.onload = onImageLoad;
stage5ScytheImage.onerror = () => { stage5ScytheImage.src = PATH.image + 'Boss.png'; };
stage5ScytheImage.src = PATH.image + '제낫.png';

const stage6BgImage = new Image();
stage6BgImage.onload = onImageLoad;
stage6BgImage.src = PATH.image + '스테이지6배경화면.png';

const stage6BossBulletImage = new Image();
stage6BossBulletImage.onload = onImageLoad;
stage6BossBulletImage.src = PATH.image + '최종보스 공격.png';

function drawPaddle() {
    const skin = PADDLE_SKINS.find(s => s.id === (options.paddleSkin || 'default')) || PADDLE_SKINS[0];
    if (skin.id === 'default' && paddleImage.complete && paddleImage.naturalWidth > 0) {
        try {
            ctx.drawImage(paddleImage, paddle.x, paddle.y, paddle.width, paddle.height);
            return;
        } catch (e) { /* 이미지 그리기 실패 시 fallback */ }
    }
    const cols = skin.colors || ['#667eea', '#764ba2'];
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    gradient.addColorStop(0, cols[0]);
    gradient.addColorStop(0.5, cols[1] || cols[0]);
    gradient.addColorStop(1, cols[0]);
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

function drawPaddleTop() {
    if (!coopMode) return;
    // 2P 위쪽 패들 (구별용 초록 계열)
    const cols = ['#48dbfb', '#0abde3'];
    const gradient = ctx.createLinearGradient(paddleTop.x, 0, paddleTop.x + paddleTop.width, 0);
    gradient.addColorStop(0, cols[0]);
    gradient.addColorStop(0.5, cols[1]);
    gradient.addColorStop(1, cols[0]);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    const cx = paddleTop.x + paddleTop.width / 2;
    const cy = paddleTop.y;
    const a = paddleTop.width / 2;
    const b = paddleTop.height * 0.8;
    ctx.moveTo(paddleTop.x, cy);
    ctx.ellipse(cx, cy, a, b, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawBall() {
    if (stage5IntroPhase >= 1) return;
    if (currentStage === 5 && Date.now() < stage5ScytheRainUntil) return;
    const powerBallActive = activeItems.some(i => i.type === 'powerBall');
    const rMult = (powerBallActive ? 1.5 : 1) * (bossUpgrades.ballSizeMult || 1);
    const skin = BALL_SKINS.find(s => s.id === (options.ballSkin || 'default')) || BALL_SKINS[0];
    const stage5Blink = currentStage === 5 && Date.now() < stage5ChaosBlinkUntil;
    if (stage5Blink) ctx.save();
    const stage5FakePhase = currentStage === 5 && balls.some(b => b.stage5Fake);
    balls.forEach(ball => {
        if (stage5Blink) ctx.globalAlpha = Math.floor(Date.now() / 120) % 2 === 0 ? 0.35 : 1;
        const r = ball.radius * rMult;
        const gradient = ctx.createRadialGradient(
            ball.x - 3, ball.y - 3, 0,
            ball.x, ball.y, r
        );
        if (ball.stage5Fake) {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.5, '#ff6666');
            gradient.addColorStop(1, '#cc0000');
        } else if (stage5FakePhase) {
            gradient.addColorStop(0, '#ffc0cb');
            gradient.addColorStop(0.5, '#ff69b4');
            gradient.addColorStop(1, '#db7093');
        } else if (powerBallActive) {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.5, '#ff6666');
            gradient.addColorStop(1, '#cc0000');
        } else if (currentStage === 6 && skin.id === 'default') {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.5, '#ff6666');
            gradient.addColorStop(1, '#cc0000');
        } else if (skin.colors) {
            gradient.addColorStop(0, skin.colors[0]);
            gradient.addColorStop(0.5, skin.colors[1] || skin.colors[0]);
            gradient.addColorStop(1, skin.colors[2] || skin.colors[1] || skin.colors[0]);
        } else {
            const h = (Date.now() / 30) % 360;
            gradient.addColorStop(0, `hsl(${h}, 100%, 100%)`);
            gradient.addColorStop(0.5, `hsl(${(h + 60) % 360}, 90%, 70%)`);
            gradient.addColorStop(1, `hsl(${(h + 120) % 360}, 90%, 50%)`);
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
        ctx.fill();
    });
    if (stage5Blink) ctx.restore();
}

function drawFallingItems() {
    if (currentStage === 4) return;
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
    if (currentStage !== 4) {
        bullets.forEach(b => {
            ctx.fillStyle = '#00ff88';
            ctx.fillRect(b.x, b.y, b.width, b.height);
        });
    }
    bossBullets.forEach(b => {
        if (currentStage === 4 && (b.stage4Type === 'orange' || b.stage4Type === 'blue')) {
            ctx.fillStyle = b.stage4Type === 'orange' ? '#ff8800' : '#4488ff';
            ctx.fillRect(b.x, b.y, b.width, b.height);
        } else if (currentStage === 5 && stage5BossBulletImage.complete && stage5BossBulletImage.naturalWidth > 0) {
            ctx.drawImage(stage5BossBulletImage, Math.floor(b.x), Math.floor(b.y), Math.floor(b.width), Math.floor(b.height));
        } else if (currentStage === 6 && stage6BossBulletImage.complete && stage6BossBulletImage.naturalWidth > 0) {
            ctx.drawImage(stage6BossBulletImage, Math.floor(b.x), Math.floor(b.y), Math.floor(b.width), Math.floor(b.height));
        } else if (b.isBomb && bombImage.complete && bombImage.naturalWidth > 0) {
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
            if (!brick || !brick.visible) return;
            if (currentStage === 4 && !brick.isBoss) return;
                const hp = brick.hp || 1;
                if (brick.isBoss) {
                    if (currentStage === 5 && Date.now() < stage5ScytheRainUntil) return;
                    const cx = brick.x + brick.width / 2;
                    const cy = brick.y + brick.height / 2;
                    const r = brick.radius ?? Math.min(brick.width, brick.height) / 2;
                    const size = r * 2;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.clip();
                    const stage5Scythe = currentStage === 5 && brick.bossScytheUntil && Date.now() < brick.bossScytheUntil;
                    let img = currentStage === 1 ? earlyBossImage : (currentStage === 2 ? stage2BossImage : (currentStage === 3 ? stage3BossImage : (currentStage === 4 ? stage4BossImage : (currentStage === 5 ? (stage5Scythe && stage5ScytheImage.complete && stage5ScytheImage.naturalWidth > 0 ? stage5ScytheImage : stage5BossImage) : (currentStage === 6 ? stage6BossImage : bossImage)))));
                    if (currentStage === 5 && stage5IntroPhase === 1 && stage5IntroImage1.complete && stage5IntroImage1.naturalWidth > 0) img = stage5IntroImage1;
                    if (currentStage === 5 && stage5IntroPhase === 2 && stage5IntroImage2.complete && stage5IntroImage2.naturalWidth > 0) img = stage5IntroImage2;
                    if (img.complete && img.naturalWidth > 0) {
                        ctx.drawImage(img, Math.floor(cx - r), Math.floor(cy - r), Math.floor(size), Math.floor(size));
                    } else {
                        ctx.fillStyle = `hsl(${(Date.now() / 50) % 360}, 80%, 55%)`;
                        ctx.beginPath();
                        ctx.arc(cx, cy, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                    const bossInvincible = isBossInvincible(brick) || (brick.bossHitInvincibleUntil && Date.now() < brick.bossHitInvincibleUntil);
                    ctx.strokeStyle = bossInvincible ? '#ff0000' : '#fff';
                    ctx.lineWidth = bossInvincible ? 6 : 4;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                    if (brick.bossSpeechText && Date.now() < (brick.bossSpeechUntil || 0)) {
                        const txt = brick.bossSpeechText;
                        ctx.font = 'bold 18px "Noto Sans KR", sans-serif';
                        const tw = ctx.measureText(txt).width;
                        const bubbleW = Math.max(tw + 24, 80);
                        const bubbleH = 36;
                        const bx = cx - bubbleW / 2;
                        const by = cy - r - bubbleH - 12;
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                        ctx.lineWidth = 2;
                        const rad = 8;
                        ctx.beginPath();
                        ctx.moveTo(bx + rad, by);
                        ctx.lineTo(bx + bubbleW - rad, by);
                        ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + rad);
                        ctx.lineTo(bx + bubbleW, by + bubbleH - rad);
                        ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - rad, by + bubbleH);
                        ctx.lineTo(bx + rad, by + bubbleH);
                        ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - rad);
                        ctx.lineTo(bx, by + rad);
                        ctx.quadraticCurveTo(bx, by, bx + rad, by);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                        ctx.fillStyle = '#000';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(txt, cx, by + bubbleH / 2);
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'alphabetic';
                    }
                } else {
                    const color = brick.isBomb ? '#f97316' : (HP_COLORS[hp] || HP_COLORS[1]);
                    ctx.fillStyle = color;
                    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
                    ctx.strokeStyle = brick.isItem ? '#fff' : (brick.isBomb ? '#fff' : 'rgba(0,0,0,0.3)');
                    ctx.lineWidth = brick.isItem ? 2 : (brick.isBomb ? 2 : 1);
                    ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
                }
                if (brick.isItem && !brick.isNerf) {
                    if (bagImage.complete && bagImage.naturalWidth > 0) {
                        ctx.drawImage(bagImage, Math.floor(brick.x), Math.floor(brick.y), Math.floor(brick.width), Math.floor(brick.height));
                    } else {
                        drawBagShape(brick.x, brick.y, brick.width, brick.height);
                    }
                }
                if (brick.isNerf || brick.isBomb) {
                    if (bombImage.complete && bombImage.naturalWidth > 0) {
                        ctx.drawImage(bombImage, Math.floor(brick.x), Math.floor(brick.y), Math.floor(brick.width), Math.floor(brick.height));
                    }
                }
        });
    });
}

function drawBackgroundOverDestroyedBricks() {
    bricks.forEach(row => {
        row.forEach(brick => {
            if (!brick || brick.visible) return;
            const x = Math.floor(brick.x);
            const y = Math.floor(brick.y);
            const w = Math.ceil(brick.width);
            const h = Math.ceil(brick.height);
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            if (currentStage === 4) {
                ctx.fillStyle = '#0f0c29';
                ctx.fillRect(x, y, w, h);
            } else if (currentStage === 5 && stage5BgImage.complete && stage5BgImage.naturalWidth > 0) {
                ctx.drawImage(stage5BgImage, x, y, w, h, x, y, w, h);
            } else if (currentStage === 6 && stage6BgImage.complete && stage6BgImage.naturalWidth > 0) {
                ctx.drawImage(stage6BgImage, x, y, w, h, x, y, w, h);
            } else {
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = 'rgba(138, 43, 226, 0.1)';
                ctx.lineWidth = 1;
                for (let i = Math.floor(x / 40) * 40; i < x + w; i += 40) {
                    ctx.beginPath();
                    ctx.moveTo(i, 0);
                    ctx.lineTo(i, canvas.height);
                    ctx.stroke();
                }
                for (let i = Math.floor(y / 40) * 40; i < y + h; i += 40) {
                    ctx.beginPath();
                    ctx.moveTo(0, i);
                    ctx.lineTo(canvas.width, i);
                    ctx.stroke();
                }
            }
            ctx.restore();
        });
    });
}

function drawBossShields() {
    bossShields.forEach(shield => {
        const b = shield.bossBrick;
        if (!b || !b.visible) return;
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        const bossR = b.radius || b.width / 2;
        const inner = bossR + 2, outer = bossR + 22;
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.arc(cx, cy, (inner + outer) / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    });
}

function drawStage6ItemMessage() {
    if (currentStage !== 6 || Date.now() >= stage6ItemMessageUntil) return;
    ctx.save();
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 200, 0.95)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const txt = stage6ItemMessageText || '지금까지 만나왔던 적이 당신을 도와줬다';
    const x = canvas.width / 2;
    const y = 80;
    ctx.strokeText(txt, x, y);
    ctx.fillText(txt, x, y);
    ctx.restore();
}

function drawDamageNumbers() {
    const now = Date.now();
    damageNumbers = damageNumbers.filter(d => {
        if (now >= d.until) return false;
        ctx.save();
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#ff0000';
        ctx.textAlign = 'center';
        ctx.fillText(String(d.value), d.x, d.y - 10);
        ctx.restore();
        return true;
    });
}

function drawBombExplosions() {
    const now = Date.now();
    bombExplosions = bombExplosions.filter(e => {
        const elapsed = now - e.startTime;
        if (elapsed >= e.duration) return false;
        const t = elapsed / e.duration;
        const expand = 1 + t * 2.5;
        const alpha = 1 - t;
        const r = e.radius * expand;
        ctx.save();
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        g.addColorStop(0, `rgba(255, 200, 50, ${alpha * 0.9})`);
        g.addColorStop(0.4, `rgba(255, 100, 0, ${alpha * 0.6})`);
        g.addColorStop(0.7, `rgba(255, 50, 0, ${alpha * 0.3})`);
        g.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 150, ${alpha * 0.5})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        return true;
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
    const isInvincible = isBossInvincible(bossBrick) || (bossBrick.bossHitInvincibleUntil && Date.now() < bossBrick.bossHitInvincibleUntil);
    const barW = 45;  // 가로 1/3 축소 (134/3)
    const barH = 28;
    const gap = 12;
    const x = bossBrick.x + bossBrick.width / 2 - barW / 2;
    const y = bossBrick.y + bossBrick.height + gap;
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

    if (screenShakeIntensity > 0.1) {
        ctx.save();
        const sx = (Math.random() - 0.5) * 2 * screenShakeIntensity;
        const sy = (Math.random() - 0.5) * 2 * screenShakeIntensity;
        ctx.translate(sx, sy);
    }

    if (currentStage === 4) {
        ctx.fillStyle = '#0f0c29';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (currentStage === 5 && stage5BgImage.complete && stage5BgImage.naturalWidth > 0) {
        ctx.drawImage(stage5BgImage, 0, 0, canvas.width, canvas.height);
    } else if (currentStage === 6 && stage6BgImage.complete && stage6BgImage.naturalWidth > 0) {
        ctx.drawImage(stage6BgImage, 0, 0, canvas.width, canvas.height);
    } else {
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
    }

    drawBackgroundOverDestroyedBricks();
    drawBricks();
    drawPaddle();
    if (coopMode) drawPaddleTop();
    if (currentStage === 5 && Date.now() < stage5ScytheRainUntil && stage5ScytheImage.complete && stage5ScytheImage.naturalWidth > 0) {
        stage5FallingScythes.forEach(s => {
            ctx.drawImage(stage5ScytheImage, Math.floor(s.x), Math.floor(s.y), Math.floor(s.w), Math.floor(s.h));
        });
    }
    if (currentStage === 5 && Date.now() < stage5ScytheRain30Until && stage5ScytheImage.complete && stage5ScytheImage.naturalWidth > 0) {
        stage5FallingScythes30.forEach(s => {
            ctx.drawImage(stage5ScytheImage, Math.floor(s.x), Math.floor(s.y), Math.floor(s.w), Math.floor(s.h));
        });
    }
    drawFallingItems();
    drawBullets();
    drawBall();
    drawActiveItemEffects();
    drawBossShields();
    drawBossHPBar();
    if (currentStage === 6 && stage6BossIntroUntil > 0 && Date.now() < stage6BossIntroUntil) {
        let bossBrick = null;
        outer: for (const row of bricks) {
            for (const brick of row) {
                if (brick && brick.visible && brick.isBoss) { bossBrick = brick; break outer; }
            }
        }
        if (bossBrick) {
            const cx = bossBrick.x + bossBrick.width / 2;
            const textY = bossBrick.y + bossBrick.height + 18;
            ctx.save();
            ctx.font = '14px "Noto Sans KR", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('포효하는 어둠의 기사', cx, textY);
            ctx.restore();
        }
    }
    drawBombExplosions();
    drawStage6ItemMessage();
    drawDamageNumbers();
    minions.forEach(m => {
        if (currentStage >= 4 && gladeImage.complete && gladeImage.naturalWidth > 0) {
            ctx.drawImage(gladeImage, Math.floor(m.x), Math.floor(m.y), Math.floor(m.width), Math.floor(m.height));
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(m.x, m.y, m.width, m.height);
        } else {
            ctx.fillStyle = '#ff6b6b';
            ctx.fillRect(m.x, m.y, m.width, m.height);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(m.x, m.y, m.width, m.height);
        }
    });
    minionBullets.forEach(b => {
        ctx.fillStyle = '#ff3333';
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });

    const now = Date.now();
    if (bossDustEffects.length > 0) {
        bossDustEffects = bossDustEffects.filter(p => {
            const elapsed = now - (p.startTime || now);
            if (elapsed >= (p.duration || 800)) return false;
            p.x += p.vx;
            p.y += p.vy;
            const pAlpha = 1 - elapsed / (p.duration || 800);
            ctx.save();
            ctx.globalAlpha = Math.max(0, pAlpha);
            ctx.fillStyle = '#aaa';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return true;
        });
    }

    if (currentStage === 6 && stage6DarkPhaseUntil > Date.now()) {
        ctx.fillStyle = 'rgba(0,0,0,0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawPaddle();
        if (coopMode) drawPaddleTop();
        if (Math.floor(Date.now() / 150) % 2 === 0) drawBall();
    }

    if (screenShakeIntensity > 0.1) ctx.restore();
    screenShakeIntensity *= 0.75;
}

function isAnyPauseOverlayVisible() {
    if (typeof document !== 'undefined' && document.hidden) return true;
    const ids = ['optionsPanel', 'stageMsgOverlay', 'bossUpgradeOverlay', 'mercyAttackOverlay', 'passwordPromptModal', 'editAccountModal', 'findPasswordModal', 'createAccountModal', 'storageAdminModal', 'friendRankingModal', 'friendChatModal', 'rotateOverlay'];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) return true;
    }
    return false;
}

function gameLoop(now = performance.now()) {
    if (!gameRunning) return;
    if (isAnyPauseOverlayVisible()) gamePaused = true;
    else if (currentStage === 6 && stage6BossIntroUntil > 0 && Date.now() >= stage6BossIntroUntil) {
        stage6BossIntroUntil = 0;
        gamePaused = false;
    } else if (currentStage === 6 && stage6BossIntroUntil > 0 && Date.now() < stage6BossIntroUntil) gamePaused = true;
    else gamePaused = false;
    if (gamePaused) {
        if (currentStage === 6 && stage6BossIntroUntil > 0 && Date.now() < stage6BossIntroUntil) draw();
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
    const diffEl = document.getElementById('difficulty');
    options.difficulty = (diffEl && diffEl.value) || 'easy';
    const cfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
    options.ballSpeed = currentStage === 6 ? cfg.stage6BallSpeed : cfg.ballSpeed;
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
    // 협동 모드: 위쪽 패들 위치/크기
    paddleTop.y = 10;
    paddleTop.baseWidth = PADDLE_WIDTH * (options.canvasWidth / 800);
    paddleTop.width = paddleTop.baseWidth;
    paddleTop.height = PADDLE_HEIGHT;
    paddleTop.speed = options.paddleSpeed;
}

function startGame(isNewGame = true) {
    stageClearInProgress = false;
    applyOptions();
    gameRunning = true;
    gamePaused = false;
    ballLaunched = false;
    ballStickTimer = 0;
    hasBulletPower = false;
    bulletAutoFireFrame = 0;
    fallingItems = [];
    bullets = [];
    bossBullets = [];
    bossShields = [];
    damageNumbers = [];
    bombExplosions = [];
    activeItems = [];
    bricksBrokenCount = 0;
    bossUpgrades = { ballSizeMult: 1, paddleSpeedMult: 1, explodeChance: 0, extraLife: 0 };
    bossBulletDamageAccum = 0;
    shieldActiveUntil = 0;
    ballDamageOverrideStage1to4 = null;
    if (isNewGame) {
        score = 0;
        lives = 3;
        stage6DarkPhaseUntil = 0;
        stage6DarkPhaseNextAt = 0;
        stage56RecoveryItemTimer = 0;
        stage6ItemMessageUntil = 0;
        currentStage = (STAGE6_ONLY || BOSS6_TEST) ? 6 : (BOSS5_TEST ? 5 : (BOSS4_TEST || STAGE4_ONLY ? 4 : (STAGE3_ONLY ? 3 : 1)));
        updateStageUI(currentStage);
        bricks = createBricks();
    } else if (savedGameState) {
        score = savedGameState.score;
        lives = savedGameState.lives;
        currentStage = savedGameState.stage || 1;
        updateStageUI(currentStage);
        bricks = savedGameState.bricks;
    } else {
        score = 0;
        lives = 3;
        bricks = createBricks();
    }
    updateScoreUI(score);
    updateLivesUI();
    document.getElementById('startOverlay')?.classList.add('hidden');
    document.getElementById('gameOverOverlay')?.classList.add('hidden');
    document.getElementById('gameOverOverlay')?.classList.remove('game-over-visible');
    document.getElementById('winOverlay')?.classList.add('hidden');
    document.getElementById('mercyAttackOverlay')?.classList.add('hidden');
    coins = options.coins ?? coins;
    setMaxCoins(Math.max(getMaxCoins(), coins));
    updateCoinsUI(coins);
    updateOptionsButtonVisibility();
    updateBulletFireButtonVisibility();
    if (isMobile()) enforceMobileLandscapeFullscreen();
    paddle.x = (canvas.width - paddle.width) / 2;
    if (coopMode) paddleTop.x = (canvas.width - paddleTop.width) / 2;
    mouseX = canvas.width / 2;
    resetBall();
    applyEquipmentAtStart();
    showStageStartAndResume();
}

function applyEquipmentAtStart() {
    const eq = options.equipment || [];
    if (eq.includes('powerBall')) activeItems.push({ type: 'powerBall', duration: 1800 });
    if (eq.includes('tripleStart') && balls.length >= 1) {
        const main = balls[0];
        const spd = options.ballSpeed;
        balls.push({ x: main.x, y: main.y, radius: BALL_RADIUS, dx: spd * 0.7, dy: -spd * 0.7 });
        balls.push({ x: main.x, y: main.y, radius: BALL_RADIUS, dx: -spd * 0.7, dy: -spd * 0.7 });
    }
    updateBulletFireButtonVisibility();
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
        document.getElementById('gameOverOverlay')?.classList.add('hidden');
        document.getElementById('gameOverOverlay')?.classList.remove('game-over-visible');
        startGame(false);
    }
}

function restartGame() {
    document.getElementById('gameOverOverlay')?.classList.add('hidden');
    document.getElementById('gameOverOverlay')?.classList.remove('game-over-visible');
    document.getElementById('winOverlay')?.classList.add('hidden');
    startGame(true);
}

let audioCtx = null;
let bgmAudio = null;
let loginBgmAudio = null;
let audioUnlockedByUser = false; // Android WebView: 사용자 터치 전 오디오 차단 방지용

// 스테이지별 배경음악 (6스테이지는 Stage5 사용)
const BGM_FILES = [
    PATH.bgm + 'Stage1.mp3',
    PATH.bgm + 'Stage2.mp3',
    PATH.bgm + 'Stage4.mp3',   // 스테이지3: Stage4.mp3
    PATH.bgm + 'stage (3).mp3',
    PATH.bgm + 'Stage5.mp3',
    PATH.bgm + 'Stage6.mp3'
];

function unlockAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
}

function stopLoginBGM() {
    if (loginBgmAudio) {
        loginBgmAudio.pause();
        loginBgmAudio.currentTime = 0;
        loginBgmAudio = null;
    }
}

function startLoginBGM() {
    unlockAudio();
    stopBGM();
    stopLoginBGM();
    loginBgmAudio = new Audio(PATH.bgm + 'login.mp3');
    loginBgmAudio.loop = true;
    loginBgmAudio.volume = 0.5;
    loginBgmAudio.play().catch(() => {});
}

// Android WebView: 사용자 터치 전에는 오디오가 차단됨. 첫 터치 시 BGM 시작
function startLoginBGMOrSchedule() {
    if (audioUnlockedByUser) {
        startLoginBGM();
        return;
    }
    const onFirstInteraction = () => {
        audioUnlockedByUser = true;
        document.removeEventListener('touchstart', onFirstInteraction);
        document.removeEventListener('click', onFirstInteraction);
        startLoginBGM();
    };
    document.addEventListener('touchstart', onFirstInteraction, { once: true, passive: true });
    document.addEventListener('click', onFirstInteraction, { once: true });
}

function startBGM(stage) {
    unlockAudio();
    stopLoginBGM();
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

const MAX_RANKING = 40;
const RANKING_DISPLAY_COUNT = 40;
const FIRESTORE_TIMEOUT_MS = 15000;

function isOnline() {
    return typeof navigator !== 'undefined' && navigator.onLine;
}

async function isOnlineStorageAvailable() {
    if (!firestoreDb || typeof window.firestoreGetDoc !== 'function') {
        return { ok: false, error: '저장소 초기화에 실패했습니다. 페이지를 새로고침해 주세요.' };
    }
    if (window.location.protocol === 'file:') {
        return { ok: false, error: 'file://에서는 저장소를 사용할 수 없습니다. http://localhost 등 웹 서버로 실행해 주세요.' };
    }
    try {
        await withTimeout((window.firestoreGetDoc || (() => firestoreDb.collection('game').doc('data').get()))(), FIRESTORE_TIMEOUT_MS);
        return { ok: true };
    } catch (e) {
        const msg = (e?.message || String(e)).toLowerCase();
        const code = (e?.code || '').toLowerCase();
        let userMsg = '온라인 저장소에 연결할 수 없습니다.';
        if (msg.includes('permission') || code === 'permission-denied') {
            userMsg = 'Firestore 보안 규칙이 접근을 차단합니다. Firebase 콘솔 → Firestore → 규칙에서 game 컬렉션 읽기/쓰기를 허용해 주세요.';
        } else if (msg.includes('타임아웃') || msg.includes('timeout')) {
            userMsg = '연결 시간이 초과되었습니다. 네트워크를 확인한 후 다시 시도해 주세요.';
        } else if (msg.includes('unavailable') || code === 'unavailable') {
            userMsg = 'Firestore 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
        } else if (msg.includes('not-found') || code === 'not-found') {
            userMsg = 'Firestore가 프로젝트에 활성화되지 않았을 수 있습니다. Firebase 콘솔에서 Firestore를 생성해 주세요.';
        }
        console.warn('Firestore 연결 오류:', e?.code, e?.message, e);
        return { ok: false, error: userMsg };
    }
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('타임아웃')), ms))
    ]);
}

async function getAccounts() {
    if (!firestoreDb) throw new Error('온라인 저장소에 연결할 수 없습니다.');
    const docSnap = await withTimeout(window.firestoreGetDoc(), FIRESTORE_TIMEOUT_MS);
    const data = (docSnap?.exists ? docSnap.data() : null) || {};
    const accounts = data.accounts;
    if (accounts && typeof accounts === 'object' && !Array.isArray(accounts)) return accounts;
    return {};
}

async function saveAccount(name, data) {
    const accounts = await getAccounts();
    accounts[name] = data;
    await withTimeout(window.firestoreSetDoc({ accounts }, { merge: true }), FIRESTORE_TIMEOUT_MS);
}

async function deleteAccountData(name) {
    const accounts = await getAccounts();
    delete accounts[name];
    await withTimeout(window.firestoreSetDoc({ accounts }, { merge: true }), FIRESTORE_TIMEOUT_MS);
}

async function getAccount(name) {
    const accounts = await getAccounts();
    return accounts[name] || null;
}

// ----- 친구 / 친구 요청 / 채팅 (Firestore: friends, friendRequests, chat) -----
const CHAT_ROOM_MAX_MESSAGES = 100;

// 채팅 비속어 필터: 해당 단어는 글자 수만큼 #으로 표시
const CHAT_BAD_WORDS = [
    '시발', '씨발', 'ㅅㅂ', '시팔', '씨팔', '개새끼', '개세끼', '병신', '지랄', '니애미', '니엄마', '엠창', 'ㅂㅅ',
    '븅신', '뻐큐', '바보', '멍청이', '느금마', '니얼굴',
    'fuck', 'shit', 'damn', 'bitch', 'asshole', 'dick', 'cunt', 'fuk', 'sht', 'btch'
];
function filterBadWords(text) {
    if (!text || typeof text !== 'string') return text;
    let out = text;
    for (const word of CHAT_BAD_WORDS) {
        if (!word) continue;
        const repl = '#'.repeat(word.length);
        const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        out = out.replace(re, repl);
    }
    return out;
}

function getChatRoomId(a, b) {
    if (!a || !b) return '';
    return [a, b].sort().join('|');
}

const CHAT_OFFICIAL_ACCOUNT = '벽돌깨기rpg공식계정';
const CHAT_VIOLATION_LIMIT = 5;

async function getFriendsData() {
    const data = await getFirestoreGameData();
    return {
        friends: data.friends && typeof data.friends === 'object' ? data.friends : {},
        friendRequests: data.friendRequests && typeof data.friendRequests === 'object' ? data.friendRequests : {},
        chat: data.chat && typeof data.chat === 'object' ? data.chat : {},
        chatViolations: data.chatViolations && typeof data.chatViolations === 'object' ? data.chatViolations : {}
    };
}

async function getChatViolations() {
    const data = await getFirestoreGameData();
    return data.chatViolations && typeof data.chatViolations === 'object' ? data.chatViolations : {};
}

async function incrementChatViolation(accountName) {
    const data = await getFirestoreGameData();
    const v = data.chatViolations || {};
    const cur = v[accountName] || { count: 0, suspendedUntil: 0 };
    v[accountName] = { count: (cur.count || 0) + 1, suspendedUntil: cur.suspendedUntil || 0 };
    await withTimeout(window.firestoreSetDoc({ chatViolations: v }, { merge: true }), FIRESTORE_TIMEOUT_MS);
}

async function setChatSuspension(accountName, days) {
    const data = await getFirestoreGameData();
    const v = data.chatViolations || {};
    const cur = v[accountName] || { count: 0, suspendedUntil: 0 };
    v[accountName] = { count: cur.count || 0, suspendedUntil: Date.now() + days * 24 * 60 * 60 * 1000 };
    await withTimeout(window.firestoreSetDoc({ chatViolations: v }, { merge: true }), FIRESTORE_TIMEOUT_MS);
}

async function isChatSuspended(accountName) {
    const v = await getChatViolations();
    const cur = v[accountName];
    return cur && cur.suspendedUntil > Date.now();
}

async function getFriends(accountName) {
    const { friends } = await getFriendsData();
    const list = friends[accountName];
    return Array.isArray(list) ? list : [];
}

async function getFriendRequestsTo(accountName) {
    const { friendRequests } = await getFriendsData();
    const list = friendRequests[accountName];
    return Array.isArray(list) ? list : [];
}

async function addFriendRequest(fromAccount, toAccount) {
    if (!fromAccount || !toAccount || fromAccount === toAccount) return { ok: false, message: '잘못된 요청입니다.' };
    const accounts = await getAccounts();
    if (!accounts[toAccount]) return { ok: false, message: '해당 아이디를 가진 계정이 없습니다.' };
    const { friendRequests, friends } = await getFriendsData();
    const myFriends = Array.isArray(friends[fromAccount]) ? friends[fromAccount] : [];
    if (myFriends.includes(toAccount)) return { ok: false, message: '이미 친구입니다.' };
    const toList = Array.isArray(friendRequests[toAccount]) ? friendRequests[toAccount] : [];
    if (toList.includes(fromAccount)) return { ok: false, message: '이미 친구 요청을 보냈습니다.' };
    friendRequests[toAccount] = [...toList, fromAccount];
    await withTimeout(window.firestoreSetDoc({ friendRequests }, { merge: true }), FIRESTORE_TIMEOUT_MS);
    return { ok: true, message: '친구 요청을 보냈습니다.' };
}

async function acceptFriendRequest(accountName, fromAccount) {
    const { friends, friendRequests } = await getFriendsData();
    const reqList = Array.isArray(friendRequests[accountName]) ? friendRequests[accountName] : [];
    if (!reqList.includes(fromAccount)) return { ok: false, message: '해당 요청이 없습니다.' };
    friendRequests[accountName] = reqList.filter(id => id !== fromAccount);
    friends[accountName] = [...(Array.isArray(friends[accountName]) ? friends[accountName] : []), fromAccount];
    friends[fromAccount] = [...(Array.isArray(friends[fromAccount]) ? friends[fromAccount] : []), accountName];
    await withTimeout(window.firestoreSetDoc({ friends, friendRequests }, { merge: true }), FIRESTORE_TIMEOUT_MS);
    return { ok: true };
}

async function rejectFriendRequest(accountName, fromAccount) {
    const { friendRequests } = await getFriendsData();
    const reqList = Array.isArray(friendRequests[accountName]) ? friendRequests[accountName] : [];
    friendRequests[accountName] = reqList.filter(id => id !== fromAccount);
    await withTimeout(window.firestoreSetDoc({ friendRequests }, { merge: true }), FIRESTORE_TIMEOUT_MS);
    return { ok: true };
}

async function removeFriend(accountName, friendName) {
    const { friends } = await getFriendsData();
    if (!Array.isArray(friends[accountName]) || !friends[accountName].includes(friendName)) return { ok: false };
    friends[accountName] = friends[accountName].filter(id => id !== friendName);
    friends[friendName] = Array.isArray(friends[friendName]) ? friends[friendName].filter(id => id !== accountName) : [];
    await withTimeout(window.firestoreSetDoc({ friends }, { merge: true }), FIRESTORE_TIMEOUT_MS);
    return { ok: true };
}

async function getChatMessages(roomId) {
    const { chat } = await getFriendsData();
    const list = chat[roomId];
    return Array.isArray(list) ? list : [];
}

async function sendChatMessage(roomId, fromAccount, text) {
    let trimmed = String(text).trim().slice(0, 200);
    if (!trimmed) return { ok: false };
    const suspended = await isChatSuspended(fromAccount);
    if (suspended) {
        const v = await getChatViolations();
        const cur = v[fromAccount];
        const until = cur?.suspendedUntil ? new Date(cur.suspendedUntil) : null;
        const dayStr = until ? until.toLocaleDateString('ko-KR') : '';
        return { ok: false, message: '채팅이 정지되었습니다.' + (dayStr ? ' (' + dayStr + '까지)' : '') };
    }
    const hadBadWord = filterBadWords(trimmed) !== trimmed;
    if (hadBadWord) await incrementChatViolation(fromAccount);
    trimmed = filterBadWords(trimmed);
    const { chat } = await getFriendsData();
    const list = Array.isArray(chat[roomId]) ? chat[roomId] : [];
    list.push({ from: fromAccount, text: trimmed, at: Date.now() });
    if (list.length > CHAT_ROOM_MAX_MESSAGES) list.splice(0, list.length - CHAT_ROOM_MAX_MESSAGES);
    chat[roomId] = list;
    await withTimeout(window.firestoreSetDoc({ chat }, { merge: true }), FIRESTORE_TIMEOUT_MS);
    return { ok: true };
}

async function getFriendRanking(accountName) {
    const [friends, ranking] = await Promise.all([getFriends(accountName), getRanking()]);
    if (!friends.length) return [];
    const friendSet = new Set(friends);
    return ranking.filter(r => friendSet.has(r.account)).sort((a, b) => (b.score - a.score));
}

const MAX_CUSTOM_LEVELS = 100;

async function getFirestoreGameData() {
    if (!firestoreDb) throw new Error('온라인 저장소에 연결할 수 없습니다.');
    const docSnap = await withTimeout(window.firestoreGetDoc(), FIRESTORE_TIMEOUT_MS);
    return (docSnap?.exists ? docSnap.data() : null) || {};
}

async function getCustomLevels() {
    try {
        const data = await getFirestoreGameData();
        const arr = data.customLevels;
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        console.warn('커스텀 레벨 로드 실패:', e);
        return [];
    }
}

function serializeCreatorBrick(b) {
    return {
        x: b.x, y: b.y, width: b.width, height: b.height,
        visible: b.visible !== false, hp: b.hp ?? 1, maxHp: b.maxHp ?? 1,
        isItem: !!b.isItem, isNerf: !!b.isNerf, isBoss: !!b.isBoss, isBomb: !!b.isBomb,
        itemType: b.itemType || null,
        bossVx: b.bossVx || 0, bossVy: b.bossVy || 0, bossShootTimer: b.bossShootTimer || 0
    };
}

function deserializeCreatorBrick(data) {
    const def = createDefaultCreatorBrick(0, 0);
    return {
        ...def,
        x: data.x ?? def.x, y: data.y ?? def.y,
        width: data.width ?? def.width, height: data.height ?? def.height,
        visible: data.visible !== false, hp: data.hp ?? 1, maxHp: data.maxHp ?? 1,
        isItem: !!data.isItem, isNerf: !!data.isNerf, isBoss: !!data.isBoss, isBomb: !!data.isBomb,
        itemType: data.itemType || null,
        bossVx: data.bossVx || 0, bossVy: data.bossVy || 0, bossShootTimer: data.bossShootTimer || 0
    };
}

async function saveCreatorLevel(name) {
    if (!name || !name.trim()) return;
    if (!currentAccount || isGuestAccount()) {
        alert('레벨을 저장하려면 로그인이 필요합니다.');
        return;
    }
    if (creatorBricks.length === 0) {
        alert('저장할 벽돌이 없습니다. 벽돌을 배치한 후 저장해 주세요.');
        return;
    }
    try {
        const data = await getFirestoreGameData();
        let list = Array.isArray(data.customLevels) ? data.customLevels : [];
        const acc = await getAccount(currentAccount);
        const level = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2),
            author: currentAccount,
            authorProfile: (acc?.profile || '').trim(),
            name: String(name).trim().slice(0, 50),
            bricks: creatorBricks.map(serializeCreatorBrick),
            date: Date.now()
        };
        list.push(level);
        if (list.length > MAX_CUSTOM_LEVELS) list = list.slice(-MAX_CUSTOM_LEVELS);
        await withTimeout(window.firestoreSetDoc({ customLevels: list }, { merge: true }), FIRESTORE_TIMEOUT_MS);
        alert('레벨이 저장되었습니다!');
    } catch (e) {
        alert('저장에 실패했습니다. ' + (e.message || '인터넷 연결을 확인해 주세요.'));
    }
}

async function playCustomLevel(levelId) {
    try {
        const list = await getCustomLevels();
        const level = list.find(l => l.id === levelId);
        if (!level || !Array.isArray(level.bricks)) {
            alert('레벨을 찾을 수 없습니다.');
            return;
        }
        creatorBricks = level.bricks.map(deserializeCreatorBrick);
        document.getElementById('customLevelsModal')?.classList.add('hidden');
        document.getElementById('creatorStartBtn')?.click();
    } catch (e) {
        alert('레벨 불러오기 실패. ' + (e.message || ''));
    }
}

// 장비 아이템 정의 (consumable: true 면 구매 시 보유 개수만 증가, Z키 등으로 사용)
const EQUIPMENT_ITEMS = [
    { id: 'shuriken', name: '수리검', desc: '공 작고 빨라, 벽돌 2개 관통', price: 30, emoji: '🥷' },
    { id: 'powerBall', name: '강화공', desc: '게임 시작 시 강화공 30초', price: 5000, emoji: '💪' },
    { id: 'tripleStart', name: '3공 시작', desc: '시작하자마자 공 3개', price: 990, emoji: '🔮' },
    { id: 'mayCream', name: '마이스크림', desc: '전투 중 Z키로 사용 시 체력 0.3 회복 (1회 사용)', price: 177, emoji: '🧴', consumable: true },
    { id: 'shield', name: '방패', desc: '화면 클릭 시 보스·부하몬스터 공격 막기', price: 1895, emoji: '🛡️' }
];

// 계정별 옵션 저장/로드
const DEFAULT_OPTIONS = {
    paddleSpeed: 12,
    ballSpeed: 3,
    difficulty: 'easy',
    brickRows: 6,
    brickCols: 10,
    canvasWidth: 800,
    canvasHeight: 600,
    paddleSkin: 'default',
    ballSkin: 'default',
    language: 'ko',
    forgeHealth: 0,
    forgeAttack: 0,
    forgeDefense: 0
};

async function loadOptionsForAccount(accountName) {
    const acc = accountName ? await getAccount(accountName) : null;
    const saved = acc?.options;
    if (saved && typeof saved === 'object') {
        options.paddleSpeed = saved.paddleSpeed ?? DEFAULT_OPTIONS.paddleSpeed;
        let savedDiff = saved.difficulty ?? DEFAULT_OPTIONS.difficulty;
        if (savedDiff === 'difficult') savedDiff = 'hard';
        options.difficulty = savedDiff;
        const cfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
        options.ballSpeed = cfg.ballSpeed;
        options.brickRows = saved.brickRows ?? DEFAULT_OPTIONS.brickRows;
        options.brickCols = saved.brickCols ?? DEFAULT_OPTIONS.brickCols;
        options.canvasWidth = saved.canvasWidth ?? DEFAULT_OPTIONS.canvasWidth;
        options.canvasHeight = saved.canvasHeight ?? DEFAULT_OPTIONS.canvasHeight;
        options.paddleSkin = saved.paddleSkin ?? DEFAULT_OPTIONS.paddleSkin;
        options.ballSkin = saved.ballSkin ?? DEFAULT_OPTIONS.ballSkin;
        options.language = saved.language ?? DEFAULT_OPTIONS.language;
        options.coins = saved.coins ?? 0;
        options.equipment = Array.isArray(saved.equipment) ? saved.equipment : [];
        options.equipmentOwned = Array.isArray(saved.equipmentOwned) ? saved.equipmentOwned : (Array.isArray(saved.equipment) ? [...saved.equipment] : []);
        options.consumables = saved.consumables && typeof saved.consumables === 'object' ? saved.consumables : {};
        options.forgeHealth = saved.forgeHealth ?? 0;
        options.forgeAttack = saved.forgeAttack ?? 0;
        options.forgeDefense = saved.forgeDefense ?? 0;
    } else {
        Object.assign(options, DEFAULT_OPTIONS);
        options.coins = options.coins ?? 0;
        options.equipment = options.equipment ?? [];
        options.equipmentOwned = options.equipmentOwned ?? (options.equipment?.length ? [...options.equipment] : []);
        options.consumables = options.consumables ?? {};
        options.forgeHealth = options.forgeHealth ?? 0;
        options.forgeAttack = options.forgeAttack ?? 0;
        options.forgeDefense = options.forgeDefense ?? 0;
    }
    coins = options.coins;
    setMaxCoins(Math.max(getMaxCoins(), coins));
    updateCoinsUI(coins);
    const diffEl = document.getElementById('difficulty');
    if (diffEl) diffEl.value = options.difficulty || 'easy';
}

async function saveClearedStage1() {
    if (!currentAccount || isGuestAccount()) return;
    try {
        const acc = await getAccount(currentAccount);
        if (!acc) return;
        await saveAccount(currentAccount, {
            ...acc,
            options: { ...(acc.options || {}), clearedStage1: true }
        });
    } catch (e) { console.warn('clearedStage1 저장 오류:', e); }
}

async function hasClearedStage1(accountName) {
    if (!accountName || accountName === GUEST_ACCOUNT) return false;
    try {
        const acc = await getAccount(accountName);
        return !!(acc?.options?.clearedStage1);
    } catch (e) { return false; }
}

async function saveOptionsToAccount() {
    if (!currentAccount) return;
    const acc = await getAccount(currentAccount);
    if (!acc) return;
    await saveAccount(currentAccount, {
        ...acc,
        options: {
            paddleSpeed: options.paddleSpeed,
            ballSpeed: options.ballSpeed,
            difficulty: options.difficulty,
            brickRows: options.brickRows,
            brickCols: options.brickCols,
            canvasWidth: options.canvasWidth,
            canvasHeight: options.canvasHeight,
            paddleSkin: options.paddleSkin ?? 'default',
            ballSkin: options.ballSkin ?? 'default',
            language: options.language ?? 'ko',
            coins: options.coins ?? 0,
            equipment: options.equipment ?? [],
            equipmentOwned: options.equipmentOwned ?? [],
            consumables: options.consumables ?? {},
            forgeHealth: options.forgeHealth ?? 0,
            forgeAttack: options.forgeAttack ?? 0,
            forgeDefense: options.forgeDefense ?? 0
        }
    });
}

function saveCoins() {
    setMaxCoins(Math.max(getMaxCoins(), coins));
    if (isGuestAccount()) {
        try { localStorage.setItem('guestCoins', String(coins)); } catch (e) {}
    } else if (currentAccount) {
        options.coins = coins;
        saveOptionsToAccount().catch(() => {});
    }
}

async function getRanking() {
    if (!firestoreDb) throw new Error('온라인 저장소에 연결할 수 없습니다.');
    const docSnap = await withTimeout(window.firestoreGetDoc(), FIRESTORE_TIMEOUT_MS);
    const data = docSnap.exists ? docSnap.data() : {};
    const ranking = data.ranking;
    return Array.isArray(ranking) ? ranking : [];
}

async function saveToRanking(score) {
    if (isGuestAccount()) return 0;
    const ranking = await getRanking();
    let profile = '';
    let profileImage = '';
    if (currentAccount) {
        try {
            const acc = await getAccount(currentAccount);
            profile = (acc?.profile || '').trim();
            profileImage = acc?.profileImage || '';
        } catch (e) { /* ignore */ }
    }
    ranking.push({
        account: currentAccount,
        profile,
        profileImage,
        score,
        stage: currentStage || 1,
        date: new Date().toISOString()
    });
    ranking.sort((a, b) => b.score - a.score);
    const trimmed = ranking.slice(0, MAX_RANKING);
    await withTimeout(window.firestoreSetDoc({ ranking: trimmed }, { merge: true }), FIRESTORE_TIMEOUT_MS);
    const rank = trimmed.findIndex(r => r.score === score && r.account === (currentAccount || '게스트')) + 1;
    return rank > 0 ? rank : 1;
}

async function clearRanking() {
    await withTimeout(window.firestoreSetDoc({ ranking: [] }, { merge: true }), FIRESTORE_TIMEOUT_MS);
}

const ADMIN_PASSWORD = 'admin';

async function handleResetAllRanking() {
    const pwd = prompt('관리자 비밀번호를 입력하세요.');
    if (pwd === null) return;
    if (pwd !== ADMIN_PASSWORD) {
        alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    try {
        await clearRanking();
        await resetRankingUI();
        alert('전체 점수가 초기화되었습니다.');
    } catch (e) {
        alert('점수 초기화에 실패했습니다. ' + (e.message || '인터넷 연결을 확인해 주세요.'));
    }
}

async function handleResetMyRanking() {
    if (!currentAccount || isGuestAccount()) {
        alert('로그인된 계정이 없습니다.');
        return;
    }
    if (!confirm(currentAccount + ' 계정의 점수만 삭제하시겠습니까?')) return;
    try {
        const ranking = (await getRanking()).filter(r => r.account !== currentAccount);
        await withTimeout(window.firestoreSetDoc({ ranking }, { merge: true }), FIRESTORE_TIMEOUT_MS);
        await resetRankingUI();
        alert('내 점수가 초기화되었습니다.');
    } catch (e) {
        alert('점수 초기화에 실패했습니다. ' + (e.message || '인터넷 연결을 확인해 주세요.'));
    }
}

function formatRankingDate(isoStr) {
    if (!isoStr) return '-';
    try {
        const d = new Date(isoStr);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    } catch { return '-'; }
}

async function renderRanking(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let ranking;
    try {
        ranking = await getRanking();
    } catch (e) {
        el.innerHTML = '<h3>🏆 점수 순위</h3><p class="ranking-error">순위를 불러올 수 없습니다. 인터넷 연결을 확인해 주세요.</p>';
        return;
    }
    if (!ranking || !ranking.length) {
        el.innerHTML = '<h3>🏆 점수 순위</h3><p>기록이 없습니다</p>';
        return;
    }
    const rows = ranking.slice(0, RANKING_DISPLAY_COUNT).map((r, i) => {
        const imgHtml = (r.profileImage && r.profileImage.startsWith('data:')) ? `<img class="profile-img" src="${r.profileImage}" alt="">` : '';
        const accountName = (r.account === GUEST_ACCOUNT ? '게스트' : (r.account || '게스트'));
        const displayName = (r.profile && r.profile.trim()) ? `${r.profile.trim()} (${accountName})` : accountName;
        return `<tr><td>${i + 1}</td><td>${imgHtml}${displayName}</td><td>${r.score}</td><td>${r.stage || '-'}스테이지</td><td>${formatRankingDate(r.date)}</td></tr>`;
    }).join('');
    el.innerHTML = '<h3>🏆 점수 순위</h3><table class="ranking-table"><thead><tr><th>순위</th><th>프로필</th><th>점수</th><th>최종스테이지</th><th>획득일</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

async function resetRankingUI() {
    await renderRanking('rankingDisplay');
    await renderRanking('winRankingDisplay');
    const goFirst = document.getElementById('gameOverFirstPlace');
    const celebration = document.getElementById('firstPlaceCelebration');
    if (goFirst) goFirst.classList.add('hidden');
    if (celebration) celebration.classList.add('hidden');
}

const REVIVE_MESSAGES = [
    '지금은 죽을 시간이 아니야. 일어나.',
    '너만이 희망이야. 일어나.'
];

const STORAGE_PREFIX = 'bb_';
function getTotalDeaths() {
    try { return Math.max(0, parseInt(localStorage.getItem(STORAGE_PREFIX + 'totalDeaths') || '0', 10)); } catch (e) { return 0; }
}
function incrementTotalDeaths() {
    const n = getTotalDeaths() + 1;
    try { localStorage.setItem(STORAGE_PREFIX + 'totalDeaths', String(n)); } catch (e) {}
    return n;
}
function getMaxCoins() {
    try { return Math.max(0, parseInt(localStorage.getItem(STORAGE_PREFIX + 'maxCoins') || '0', 10)); } catch (e) { return 0; }
}
function setMaxCoins(v) {
    const prev = getMaxCoins();
    if (v <= prev) return;
    try { localStorage.setItem(STORAGE_PREFIX + 'maxCoins', String(v)); } catch (e) {}
}
function getStage5Cleared() {
    try { return localStorage.getItem(STORAGE_PREFIX + 'stage5Cleared') === '1'; } catch (e) { return false; }
}
function setStage5Cleared() {
    try { localStorage.setItem(STORAGE_PREFIX + 'stage5Cleared', '1'); } catch (e) {}
}

const ACHIEVEMENTS = [
    { id: 'firstDeath', name: '첫번째 죽음', desc: '한 번 죽으면 달성할 수 있어', check: () => getTotalDeaths() >= 1 },
    { id: 'death10', name: '10번째 죽음', desc: '열 번 죽으면 달성할 수 있어', check: () => getTotalDeaths() >= 10 },
    { id: 'rich', name: '부자', desc: '코인이 10000개가 되면 달성할 수 있어', check: () => getMaxCoins() >= 10000 },
    { id: 'chaos', name: '혼돈', desc: '스테이지5를 클리어하면 달성할 수 있어', check: () => getStage5Cleared() },
    { id: 'death100', name: '내가 이렇게 못했었나?', desc: '100번 죽으면 달성할 수 있어', check: () => getTotalDeaths() >= 100 }
];

function handleDeath() {
    const n = incrementTotalDeaths();
    gameOver(n >= 100);
}

function startReviveSequence() {
    cancelAnimationFrame(animationId);
    stopBGM();
    const overlayEl = document.getElementById('reviveOverlay');
    const textEl = document.getElementById('reviveOverlayText');
    if (!overlayEl || !textEl) {
        lives = 1;
        updateLivesUI();
        resetBall();
        draw();
        animationId = requestAnimationFrame(gameLoop);
        return;
    }
    const total = getTotalDeaths();
    const msg = total === 99 ? '너 만큼 못하는사람은 없었는데?' : REVIVE_MESSAGES[Math.floor(Math.random() * REVIVE_MESSAGES.length)];
    textEl.textContent = msg;
    overlayEl.classList.remove('hidden');
    overlayEl.classList.remove('revive-white');
    textEl.style.opacity = '1';

    setTimeout(() => {
        overlayEl.classList.add('revive-white');
        setTimeout(() => {
            paddle.y = canvas.height - 40;
            paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
            lives = 1;
            updateLivesUI();
            resetBall();
            startBGM(currentStage);
            overlayEl.classList.add('hidden');
            overlayEl.classList.remove('revive-white');
            textEl.style.opacity = '1';
            draw();
            animationId = requestAnimationFrame(gameLoop);
        }, 1600);
    }, 2500);
}

function gameOver(show100DeathMessage) {
    gameRunning = false;
    stopBGM();
    cancelAnimationFrame(animationId);
    options.coins = coins;
    saveCoins();
    saveGameState();
    document.getElementById('finalScore').textContent = score;
    const overlayEl = document.getElementById('gameOverOverlay');
    const rankingEl = document.getElementById('rankingDisplay');
    const deathMsgEl = document.getElementById('gameOverDeathMessage');
    const msg100El = document.getElementById('gameOver100DeathText');
    if (msg100El) {
        msg100El.textContent = show100DeathMessage ? '너 만큼 못하는사람은 없었는데?' : '';
        msg100El.style.display = show100DeathMessage ? '' : 'none';
    }
    if (deathMsgEl) {
        deathMsgEl.textContent = show100DeathMessage ? '너 만큼 못하는사람은 없었는데?' : (REVIVE_MESSAGES[Math.floor(Math.random() * REVIVE_MESSAGES.length)] || '사망했습니다.');
        deathMsgEl.classList.remove('game-over-msg-hidden');
    }
    const buttonsEl = document.getElementById('gameOverButtons');
    if (buttonsEl) buttonsEl.classList.add('game-over-buttons-hidden');
    if (rankingEl) rankingEl.innerHTML = '<h3>🏆 점수 순위</h3><p>순위 불러오는 중...</p>';
    if (overlayEl) {
        overlayEl.classList.remove('hidden');
        overlayEl.classList.add('game-over-visible');
    }
    setTimeout(() => {
        if (deathMsgEl) deathMsgEl.classList.add('game-over-msg-hidden');
        if (buttonsEl) buttonsEl.classList.remove('game-over-buttons-hidden');
    }, 4000);
    (async () => {
        try {
            await saveToRanking(score);
            const ranking = await getRanking();
            const isFirst = ranking.length > 0 && ranking[0].score === score;
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
            await renderRanking('rankingDisplay');
        } catch (e) {
            console.warn('gameOver 점수 처리 오류:', e);
            if (rankingEl) rankingEl.innerHTML = '<h3>🏆 점수 순위</h3><p class="ranking-error">점수 저장 및 순위 불러오기에 실패했습니다. 인터넷 연결을 확인해 주세요.</p>';
        }
    })();
}

function winGame() {
    gameRunning = false;
    updateBulletFireButtonVisibility();
    stopBGM();
    cancelAnimationFrame(animationId);
    options.coins = coins;
    saveCoins();
    document.getElementById('winScore').textContent = score;
    const overlayEl = document.getElementById('winOverlay');
    const rankingEl = document.getElementById('winRankingDisplay');
    if (rankingEl) rankingEl.innerHTML = '<h3>🏆 점수 순위</h3><p>순위 불러오는 중...</p>';
    if (overlayEl) overlayEl.classList.remove('hidden');
    const resetMyBtn = document.getElementById('resetMyRankingBtnWin');
    if (resetMyBtn) resetMyBtn.style.display = isGuestAccount() ? 'none' : '';
    (async () => {
        try {
            await saveToRanking(score);
            const ranking = await getRanking();
            const isFirst = ranking.length > 0 && ranking[0].score === score;
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
            await renderRanking('winRankingDisplay');
        } catch (e) {
            console.warn('winGame 점수 처리 오류:', e);
            if (rankingEl) rankingEl.innerHTML = '<h3>🏆 점수 순위</h3><p class="ranking-error">점수 저장 및 순위 불러오기에 실패했습니다. 인터넷 연결을 확인해 주세요.</p>';
        }
    })();
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

const FORGE_ITEMS = [
    { id: 'forgeHealth', name: '체력 +0.2', desc: '생명 1 감소까지 필요한 데미지 증가', price: 150, emoji: '❤️' },
    { id: 'forgeAttack', name: '공격력 +0.2', desc: '벽돌/보스에게 주는 데미지 20% 증가', price: 150, emoji: '⚔️' },
    { id: 'forgeDefense', name: '방어력 +0.05', desc: '보스 총알 피해 감소', price: 150, emoji: '🛡️' }
];

function initForgeShop() {
    const grid = document.getElementById('forgeGrid');
    if (!grid) return;
    const c = options.coins ?? coins ?? 0;
    document.querySelectorAll('.coinVal').forEach(el => { el.textContent = c; });
    grid.innerHTML = FORGE_ITEMS.map(item => {
        const level = options[item.id] ?? 0;
        const canBuy = c >= item.price && (currentAccount && !isGuestAccount());
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; background:rgba(0,0,0,0.3); border-radius:8px;">
            <div><span>${item.emoji}</span> <strong>${item.name}</strong> - ${item.desc}<br><small>${item.price} 코인 · Lv.${level}</small></div>
            <button type="button" class="btn btn-small" data-forge="${item.id}" data-price="${item.price}">${canBuy ? '강화' : '코인 부족'}</button>
        </div>`;
    }).join('');
    grid.querySelectorAll('button[data-forge]').forEach(btn => {
        const id = btn.dataset.forge;
        const price = parseInt(btn.dataset.price, 10);
        btn.addEventListener('click', async () => {
            const bal = options.coins ?? coins ?? 0;
            if (bal < price) { alert('코인이 부족합니다.'); return; }
            if (isGuestAccount()) { alert('대장간 강화는 로그인이 필요합니다.'); return; }
            options.coins = Math.max(0, bal - price);
            options[id] = (options[id] ?? 0) + 1;
            coins = options.coins;
            await saveOptionsToAccount();
            updateCoinsUI(coins);
            initForgeShop();
            initEquipmentShop();
        });
    });
}

function initEquipmentShop() {
    const grid = document.getElementById('equipmentShopGrid');
    if (!grid) return;
    const bal = options.coins ?? coins ?? 0;
    document.querySelectorAll('.coinVal').forEach(el => { el.textContent = bal; });
    const owned = options.equipmentOwned || options.equipment || [];
    const equippedId = (options.equipment && options.equipment[0]) || null;
    const consumables = options.consumables || {};
    grid.innerHTML = EQUIPMENT_ITEMS.map(item => {
        if (item.consumable) {
            const count = consumables[item.id] || 0;
            const canBuy = bal >= item.price && (currentAccount && !isGuestAccount());
            const btnText = canBuy ? '구매' : '코인 부족';
            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; background:rgba(0,0,0,0.3); border-radius:8px;">
                <div><span>${item.emoji}</span> <strong>${item.name}</strong> - ${item.desc}<br><small>${item.price} 코인 · 보유: ${count}개</small></div>
                <button type="button" class="btn btn-small" data-eq="${item.id}" data-price="${item.price}" data-action="buy" data-consumable="1">${btnText}</button>
            </div>`;
        }
        const isOwned = owned.includes(item.id);
        const isEquipped = equippedId === item.id;
        const canBuy = !isOwned && bal >= item.price && (currentAccount && !isGuestAccount());
        let btnText = '코인 부족';
        let btnDisabled = false;
        let btnAction = 'buy';
        if (isEquipped) { btnText = '착용중'; btnDisabled = true; btnAction = 'none'; }
        else if (isOwned) { btnText = '착용'; btnAction = 'equip'; }
        else if (canBuy) { btnText = '구매'; btnAction = 'buy'; }
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; background:rgba(0,0,0,0.3); border-radius:8px;">
            <div><span>${item.emoji}</span> <strong>${item.name}</strong> - ${item.desc}<br><small>${item.price} 코인</small></div>
            <button type="button" class="btn btn-small ${isEquipped ? 'btn-outline' : ''}" ${btnDisabled ? 'disabled' : ''} data-eq="${item.id}" data-price="${item.price}" data-action="${btnAction}">${btnText}</button>
        </div>`;
    }).join('');
    grid.querySelectorAll('button[data-eq]').forEach(btn => {
        const id = btn.dataset.eq;
        const price = parseInt(btn.dataset.price, 10);
        const action = btn.dataset.action;
        const isConsumable = btn.dataset.consumable === '1';
        if (action === 'none') return;
        btn.addEventListener('click', async () => {
            if (isGuestAccount()) { alert('장비 구매는 로그인이 필요합니다.'); return; }
            if (isConsumable) {
                const b = options.coins ?? coins ?? 0;
                if (b < price) { alert('코인이 부족합니다.'); return; }
                options.coins = Math.max(0, b - price);
                coins = options.coins;
                if (!options.consumables) options.consumables = {};
                options.consumables[id] = (options.consumables[id] || 0) + 1;
                await saveOptionsToAccount();
                updateCoinsUI(coins);
                initEquipmentShop();
                return;
            }
            if (action === 'equip') {
                options.equipment = [id];
                await saveOptionsToAccount();
                initEquipmentShop();
                initShopUI();
                return;
            }
            if (action === 'buy') {
                const b = options.coins ?? coins ?? 0;
                if (b < price) { alert('코인이 부족합니다.'); return; }
                options.coins = Math.max(0, b - price);
                coins = options.coins;
                options.equipmentOwned = [...(options.equipmentOwned || options.equipment || []), id];
                options.equipment = [id];
                await saveOptionsToAccount();
                updateCoinsUI(coins);
                initEquipmentShop();
                initShopUI();
            }
        });
    });
}

function initShopUI() {
    const paddleGrid = document.getElementById('paddleSkinGrid');
    const ballGrid = document.getElementById('ballSkinGrid');
    if (paddleGrid) {
        paddleGrid.innerHTML = '';
        PADDLE_SKINS.forEach(s => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'shop-skin-btn' + (options.paddleSkin === s.id ? ' selected' : '');
            btn.title = s.name;
            btn.textContent = s.emoji;
            btn.style.background = s.colors ? `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})` : '#444';
            btn.addEventListener('click', () => {
                options.paddleSkin = s.id;
                initShopUI();
                saveOptionsToAccount().catch(() => {});
                if (gameRunning && ctx) draw();
            });
            paddleGrid.appendChild(btn);
        });
    }
    if (ballGrid) {
        ballGrid.innerHTML = '';
        BALL_SKINS.forEach(s => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'shop-skin-btn' + (options.ballSkin === s.id ? ' selected' : '');
            btn.title = s.name;
            btn.textContent = s.emoji;
            btn.style.background = s.colors ? `radial-gradient(circle, ${s.colors[0]}, ${s.colors[2] || s.colors[1]})` : 'linear-gradient(135deg, #ff6b6b, #48dbfb, #1dd1a1)';
            btn.addEventListener('click', () => {
                options.ballSkin = s.id;
                initShopUI();
                saveOptionsToAccount().catch(() => {});
                if (gameRunning && ctx) draw();
            });
            ballGrid.appendChild(btn);
        });
    }
}

function openOptions() {
    if (gameRunning) gamePaused = true;
    const paddleEl = document.getElementById('paddleSpeed');
    const paddleVal = document.getElementById('paddleSpeedVal');
    const diffEl = document.getElementById('difficulty');
    const blockEl = document.getElementById('blockCount');
    const langEl = document.getElementById('language');
    if (paddleEl) paddleEl.value = options.paddleSpeed;
    if (diffEl) diffEl.value = options.difficulty || 'easy';
    if (paddleVal) paddleVal.textContent = options.paddleSpeed;
    if (blockEl) blockEl.value = options.brickRows === 5 ? 'small' : options.brickRows === 8 ? 'large' : 'medium';
    if (langEl) langEl.value = options.language || 'ko';
    const ssEl = document.getElementById('screenSize');
    if (ssEl) ssEl.value = (isMobile() && options.canvasWidth <= 960) ? 'mobile' : options.canvasWidth === 640 ? 'small' : options.canvasWidth === 960 ? 'large' : 'medium';
    initShopUI();
    initForgeShop();
    initEquipmentShop();
    updateAchievementsList();
    initFriendsSection();
    document.getElementById('optionsPanel')?.classList.remove('hidden');
}

function updateAchievementsList() {
    const container = document.getElementById('achievementsList');
    if (!container) return;
    container.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
        const done = a.check();
        const row = document.createElement('div');
        row.className = 'option-row';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.innerHTML = '<span style="font-size:1.2rem;">' + (done ? '✅' : '⬜') + '</span><div><strong>' + a.name + '</strong><br><span style="font-size:0.85rem; color:#b8b8ff;">' + a.desc + '</span></div>';
        container.appendChild(row);
    });
}

let currentChatFriend = '';
let currentChatRoomId = '';

async function initFriendsSection() {
    const section = document.getElementById('friendsSection');
    const addBtn = document.getElementById('friendAddBtn');
    const addInput = document.getElementById('friendAddInput');
    const addMsg = document.getElementById('friendAddMessage');
    const requestsList = document.getElementById('friendRequestsList');
    const friendsList = document.getElementById('friendsList');
    if (!section || !addBtn || !requestsList || !friendsList) return;
    if (isGuestAccount() || !currentAccount) {
        addBtn.disabled = true;
        if (addInput) addInput.placeholder = '로그인 후 이용 가능';
        if (addMsg) addMsg.textContent = '';
        requestsList.innerHTML = '<p style="color:#888; font-size:0.85rem;">로그인이 필요합니다.</p>';
        friendsList.innerHTML = '<p style="color:#888; font-size:0.85rem;">로그인이 필요합니다.</p>';
        return;
    }
    addBtn.disabled = false;
    if (addInput) addInput.placeholder = '친구 아이디 입력';
    try {
        const [friends, requests] = await Promise.all([getFriends(currentAccount), getFriendRequestsTo(currentAccount)]);
        requestsList.innerHTML = requests.length === 0
            ? '<p style="color:#888; font-size:0.85rem;">받은 요청 없음</p>'
            : requests.map(from => `<div style="display:flex; align-items:center; justify-content:space-between; padding:6px; background:rgba(0,0,0,0.2); border-radius:6px; margin-bottom:4px;">
                <span>${escapeHtml(from)}</span>
                <span>
                    <button type="button" class="btn btn-small" data-friend-accept="${escapeHtml(from)}">수락</button>
                    <button type="button" class="btn btn-small btn-outline" data-friend-reject="${escapeHtml(from)}">거절</button>
                </span>
            </div>`).join('');
        friendsList.innerHTML = friends.length === 0
            ? '<p style="color:#888; font-size:0.85rem;">친구 없음. 아이디로 친구 요청을 보내세요.</p>'
            : friends.map(name => `<div style="display:flex; align-items:center; justify-content:space-between; padding:6px; background:rgba(0,0,0,0.2); border-radius:6px;">
                <span>${escapeHtml(name)}</span>
                <span>
                    <button type="button" class="btn btn-small" data-friend-chat="${escapeHtml(name)}">채팅</button>
                    <button type="button" class="btn btn-small btn-outline" data-friend-remove="${escapeHtml(name)}">삭제</button>
                </span>
            </div>`).join('');
        requestsList.querySelectorAll('[data-friend-accept]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const from = btn.dataset.friendAccept;
                const r = await acceptFriendRequest(currentAccount, from);
                if (r.ok) initFriendsSection();
            });
        });
        requestsList.querySelectorAll('[data-friend-reject]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const from = btn.dataset.friendReject;
                await rejectFriendRequest(currentAccount, from);
                initFriendsSection();
            });
        });
        friendsList.querySelectorAll('[data-friend-chat]').forEach(btn => {
            btn.addEventListener('click', () => openFriendChat(btn.dataset.friendChat));
        });
        friendsList.querySelectorAll('[data-friend-remove]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(btn.dataset.friendRemove + ' 님을 친구 목록에서 삭제할까요?')) return;
                await removeFriend(currentAccount, btn.dataset.friendRemove);
                initFriendsSection();
            });
        });
        const violatorsSection = document.getElementById('chatViolatorsSection');
        const violatorsList = document.getElementById('chatViolatorsList');
        if (currentAccount === CHAT_OFFICIAL_ACCOUNT && violatorsSection && violatorsList) {
            violatorsSection.style.display = '';
            const v = await getChatViolations();
            const violators = Object.entries(v).filter(([, o]) => o && (o.count || 0) >= CHAT_VIOLATION_LIMIT);
            violatorsList.innerHTML = violators.length === 0
                ? '<p style="color:#888; font-size:0.85rem;">비속어 5회 이상 계정 없음</p>'
                : violators.map(([acc, o]) => {
                    const count = o.count || 0;
                    const daysOpts = [1, 2, 3, 4, 5, 6, 7, 8].map(d => `<option value="${d}">${d}일</option>`).join('');
                    return `<div class="chat-violator-row" style="display:flex; align-items:center; justify-content:space-between; padding:6px; background:rgba(0,0,0,0.2); border-radius:6px; margin-bottom:4px;">
                        <span>${escapeHtml(acc)} (${count}회)</span>
                        <span>
                            <select class="chat-suspend-days" style="margin-right:6px; padding:4px;">${daysOpts}</select>
                            <button type="button" class="btn btn-small" data-violator-account="${escapeHtml(acc)}">정지</button>
                        </span>
                    </div>`;
                }).join('');
            violatorsList.querySelectorAll('[data-violator-account]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const acc = btn.dataset.violatorAccount;
                    const row = btn.closest('.chat-violator-row');
                    const select = row?.querySelector('.chat-suspend-days');
                    const days = select ? parseInt(select.value, 10) || 1 : 1;
                    await setChatSuspension(acc, days);
                    alert(acc + ' 계정을 ' + days + '일 채팅 정지했습니다.');
                    initFriendsSection();
                });
            });
        } else if (violatorsSection) {
            violatorsSection.style.display = 'none';
        }
    } catch (e) {
        if (addMsg) addMsg.textContent = '불러오기 실패: ' + (e.message || '');
        friendsList.innerHTML = '<p style="color:#ff6b6b;">불러오기 실패</p>';
    }
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

async function openFriendChat(friendName) {
    if (typeof closeOptions === 'function') closeOptions();
    currentChatFriend = friendName;
    currentChatRoomId = getChatRoomId(currentAccount, friendName);
    const modal = document.getElementById('friendChatModal');
    const title = document.getElementById('friendChatTitle');
    if (title) title.textContent = '💬 ' + friendName + ' 님과 채팅';
    if (modal) modal.classList.remove('hidden');
    await refreshFriendChatMessages();
    document.getElementById('friendChatInput')?.focus();
}

async function refreshFriendChatMessages() {
    const el = document.getElementById('friendChatMessages');
    if (!el || !currentChatRoomId) return;
    try {
        const messages = await getChatMessages(currentChatRoomId);
        el.innerHTML = messages.length === 0
            ? '<p style="color:#888;">대화 내용이 없습니다.</p>'
            : messages.map(m => {
                const isMe = m.from === currentAccount;
                const time = new Date(m.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                return `<div style="margin-bottom:8px;"><span style="color:${isMe ? '#8af' : '#b8b8ff'};">${escapeHtml(m.from)}</span> <span style="font-size:0.8rem; color:#888;">${time}</span><br><span style="word-break:break-all;">${escapeHtml(filterBadWords(m.text))}</span></div>`;
            }).join('');
        el.scrollTop = el.scrollHeight;
    } catch (e) {
        el.innerHTML = '<p style="color:#ff6b6b;">메시지 불러오기 실패</p>';
    }
}

function closeFriendChat() {
    currentChatFriend = '';
    currentChatRoomId = '';
    document.getElementById('friendChatModal')?.classList.add('hidden');
}

async function initFriendsSectionAndBind() {
    document.getElementById('friendAddBtn')?.addEventListener('click', async () => {
        const input = document.getElementById('friendAddInput');
        const msg = document.getElementById('friendAddMessage');
        const id = (input?.value || '').trim();
        if (!id) { if (msg) msg.textContent = '아이디를 입력하세요.'; return; }
        if (id === currentAccount) { if (msg) msg.textContent = '자기 자신은 추가할 수 없습니다.'; return; }
        if (isGuestAccount()) { if (msg) msg.textContent = '로그인이 필요합니다.'; return; }
        msg.textContent = '요청 중...';
        const r = await addFriendRequest(currentAccount, id);
        if (msg) msg.textContent = r.message || (r.ok ? '요청을 보냈습니다.' : '실패');
        if (input) input.value = '';
        if (r.ok) initFriendsSection();
    });
    document.getElementById('friendRankingBtn')?.addEventListener('click', async () => {
        if (isGuestAccount()) { alert('로그인이 필요합니다.'); return; }
        const modal = document.getElementById('friendRankingModal');
        const listEl = document.getElementById('friendRankingList');
        if (modal) modal.classList.remove('hidden');
        if (listEl) listEl.innerHTML = '<p>불러오는 중...</p>';
        try {
            const ranking = await getFriendRanking(currentAccount);
            if (listEl) {
                listEl.innerHTML = ranking.length === 0
                    ? '<p style="color:#888;">친구가 없거나 친구의 순위 기록이 없습니다.</p>'
                    : '<table style="width:100%; border-collapse:collapse;"><tr style="border-bottom:1px solid rgba(255,255,255,0.2);"><th style="text-align:left; padding:6px;">순위</th><th style="text-align:left; padding:6px;">아이디</th><th style="text-align:right; padding:6px;">점수</th></tr>' +
                    ranking.map((r, i) => `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><td style="padding:6px;">${i + 1}</td><td style="padding:6px;">${escapeHtml(r.account)}</td><td style="padding:6px; text-align:right;">${Number(r.score).toLocaleString()}</td></tr>`).join('') + '</table>';
            }
        } catch (e) {
            if (listEl) listEl.innerHTML = '<p style="color:#ff6b6b;">불러오기 실패</p>';
        }
    });
    document.getElementById('friendRankingCloseBtn')?.addEventListener('click', () => document.getElementById('friendRankingModal')?.classList.add('hidden'));
    document.getElementById('friendChatSendBtn')?.addEventListener('click', async () => {
        const input = document.getElementById('friendChatInput');
        const text = input?.value?.trim();
        if (!text || !currentChatRoomId) return;
        const r = await sendChatMessage(currentChatRoomId, currentAccount, text);
        if (r.ok) {
            if (input) input.value = '';
            await refreshFriendChatMessages();
        } else if (r.message) {
            alert(r.message);
        }
    });
    document.getElementById('friendChatCloseBtn')?.addEventListener('click', closeFriendChat);
    document.getElementById('friendChatInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('friendChatSendBtn')?.click();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFriendsSectionAndBind);
} else {
    initFriendsSectionAndBind();
}

const optionsBtn = document.getElementById('optionsBtn');
if (optionsBtn) optionsBtn.addEventListener('click', openOptions);
const optionsBtnSide = document.getElementById('optionsBtnSide');
if (optionsBtnSide) optionsBtnSide.addEventListener('click', openOptions);
const optionsBtnLogin = document.getElementById('optionsBtnLogin');
if (optionsBtnLogin) optionsBtnLogin.addEventListener('click', openOptions);
const guestPlayBtn = document.getElementById('guestPlayBtn');
if (guestPlayBtn) guestPlayBtn.addEventListener('click', doGuestLogin);

function updateFullscreenButton() {
    const btns = document.querySelectorAll('#fullscreenBtn, #fullscreenBtnSide');
    btns.forEach(btn => {
        if (!btn) return;
        btn.style.display = isMobile() ? '' : 'none';
        btn.textContent = '⛶';
        btn.title = isFullscreen() ? '전체화면 해제' : '전체화면';
    });
}

function isLoginScreenVisible() {
    const el = document.getElementById('loginOverlay');
    return el && !el.classList.contains('hidden');
}

function updateExitButton() {
    if (STAGE6_ONLY) return;
    const show = currentAccount && !isLoginScreenVisible();
    document.querySelectorAll('#exitBtn, #exitBtnSide').forEach(btn => {
        if (btn) btn.style.display = show ? '' : 'none';
    });
}

async function doExit() {
    if (STAGE6_ONLY || BOSS5_TEST || BOSS4_TEST) return;
    try {
        if (isFullscreen()) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (exit) exit.call(document);
        }
        if (!confirm('로그인 화면으로 돌아가시겠습니까?')) return;
        gameRunning = false;
        gamePaused = false;
        currentAccount = '';
        document.getElementById('gameOverOverlay')?.classList.add('hidden');
    document.getElementById('gameOverOverlay')?.classList.remove('game-over-visible');
        document.getElementById('winOverlay')?.classList.add('hidden');
        document.getElementById('startOverlay')?.classList.add('hidden');
        const loginEl = document.getElementById('loginOverlay');
        if (loginEl) loginEl.classList.remove('hidden');
        document.getElementById('passwordInput').value = '';
        startLoginBGM();
        await refreshAccountList();
        updateOptionsButtonVisibility();
        updateExitButton();
        updateRotateOverlay();
        draw();
    } catch (e) {
        console.warn('doExit 오류:', e);
    }
}

document.querySelectorAll('#fullscreenBtn, #fullscreenBtnSide').forEach(b => { if (b) b.addEventListener('click', toggleFullscreen); });
document.querySelectorAll('#exitBtn, #exitBtnSide').forEach(b => { if (b) b.addEventListener('click', doExit); });

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

function closeOptions() {
    const panel = document.getElementById('optionsPanel');
    if (panel) panel.classList.add('hidden');
    try {
        if (gameRunning) gamePaused = false;
        const paddleEl = document.getElementById('paddleSpeed');
        const diffEl = document.getElementById('difficulty');
        const langEl = document.getElementById('language');
        options.paddleSpeed = parseInt(paddleEl ? paddleEl.value : 12) || 12;
        options.difficulty = (diffEl && diffEl.value) || 'easy';
        options.language = (langEl && langEl.value) || 'ko';
        const cfg = DIFFICULTY_CONFIG[options.difficulty] || DIFFICULTY_CONFIG.medium;
        options.ballSpeed = currentStage === 6 ? cfg.stage6BallSpeed : cfg.ballSpeed;
        const blockEl = document.getElementById('blockCount');
        const blockCount = blockEl ? blockEl.value : 'medium';
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
        saveOptionsToAccount().catch(e => console.warn('옵션 저장 오류:', e));
    } catch (e) {
        console.error('옵션 닫기 오류:', e);
    }
}
const optionsCloseBtn = document.getElementById('optionsCloseBtn');
if (optionsCloseBtn) optionsCloseBtn.addEventListener('click', closeOptions);

// ========== 미니게임 ==========
function openMinigameTetris() {
    const overlay = document.getElementById('minigameTetrisOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.getElementById('optionsPanel')?.classList.add('hidden');
    startTetris();
}
function openMinigameTouchTycoon() {
    const overlay = document.getElementById('minigameTouchTycoonOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.getElementById('optionsPanel')?.classList.add('hidden');
    startTouchTycoon();
}

const TETRIS_COLS = 10;
const TETRIS_ROWS = 20;
const TETRIS_BLOCK = 20;
let tetrisGrid, tetrisPiece, tetrisNext, tetrisScore, tetrisInterval, tetrisLoopId;
const TETRIS_SHAPES = {
    I: [[1,1,1,1]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]]
};
const TETRIS_COLORS = ['#667eea','#48dbfb','#1dd1a1','#ffd700','#ff6b6b','#a29bfe','#fd79a8'];

function startTetris() {
    tetrisGrid = Array(TETRIS_ROWS).fill(null).map(() => Array(TETRIS_COLS).fill(0));
    tetrisScore = 0;
    tetrisPiece = null;
    tetrisNext = Object.keys(TETRIS_SHAPES)[Math.floor(Math.random() * 7)];
    const c = document.getElementById('tetrisCanvas');
    const nc = document.getElementById('tetrisNextCanvas');
    if (!c || !nc) return;
    document.getElementById('tetrisScore').textContent = '0';
    const onKey = (e) => {
        if (!tetrisPiece) return;
        if (e.key === 'ArrowLeft') { moveTetris(-1); e.preventDefault(); }
        if (e.key === 'ArrowRight') { moveTetris(1); e.preventDefault(); }
        if (e.key === 'ArrowDown') { dropTetris(); e.preventDefault(); }
        if (e.key === 'ArrowUp') { rotateTetris(); e.preventDefault(); }
        if (e.key === ' ') { hardDropTetris(); e.preventDefault(); }
    };
    document.removeEventListener('keydown', tetrisKeyHandler);
    tetrisKeyHandler = onKey;
    document.addEventListener('keydown', onKey);
    if (tetrisInterval) clearInterval(tetrisInterval);
    tetrisInterval = setInterval(tickTetris, 500);
    spawnTetrisPiece();
    drawTetris();
}

let tetrisKeyHandler = null;
function spawnTetrisPiece() {
    const name = tetrisNext;
    tetrisNext = Object.keys(TETRIS_SHAPES)[Math.floor(Math.random() * 7)];
    const shape = TETRIS_SHAPES[name].map(r => [...r]);
    tetrisPiece = { shape, x: Math.floor((TETRIS_COLS - shape[0].length) / 2), y: 0, color: TETRIS_COLORS[Math.floor(Math.random() * TETRIS_COLORS.length)] };
    if (collidesTetris(tetrisPiece)) {
        clearInterval(tetrisInterval);
        tetrisInterval = null;
        document.removeEventListener('keydown', tetrisKeyHandler);
        alert('게임 오버! 점수: ' + tetrisScore);
    }
}
function collidesTetris(p, dx = 0, dy = 0) {
    for (let r = 0; r < p.shape.length; r++)
        for (let c = 0; c < p.shape[r].length; c++)
            if (p.shape[r][c]) {
                const nx = p.x + c + dx, ny = p.y + r + dy;
                if (nx < 0 || nx >= TETRIS_COLS || ny >= TETRIS_ROWS) return true;
                if (ny >= 0 && tetrisGrid[ny][nx]) return true;
            }
    return false;
}
function mergeTetris() {
    for (let r = 0; r < tetrisPiece.shape.length; r++)
        for (let c = 0; c < tetrisPiece.shape[r].length; c++)
            if (tetrisPiece.shape[r][c]) {
                const ny = tetrisPiece.y + r;
                if (ny >= 0) tetrisGrid[ny][tetrisPiece.x + c] = tetrisPiece.color;
            }
    let cleared = 0;
    for (let r = TETRIS_ROWS - 1; r >= 0; r--) {
        if (tetrisGrid[r].every(c => c)) { tetrisGrid.splice(r, 1); tetrisGrid.unshift(Array(TETRIS_COLS).fill(0)); cleared++; r++; }
    }
    tetrisScore += cleared * 100;
    document.getElementById('tetrisScore').textContent = tetrisScore;
    spawnTetrisPiece();
}
function moveTetris(dx) { if (!collidesTetris(tetrisPiece, dx, 0)) { tetrisPiece.x += dx; drawTetris(); } }
function dropTetris() { if (!collidesTetris(tetrisPiece, 0, 1)) { tetrisPiece.y++; tetrisScore += 1; document.getElementById('tetrisScore').textContent = tetrisScore; drawTetris(); } else { mergeTetris(); } }
function hardDropTetris() { while (!collidesTetris(tetrisPiece, 0, 1)) { tetrisPiece.y++; tetrisScore += 2; } mergeTetris(); drawTetris(); }
function rotateTetris() {
    const rotated = tetrisPiece.shape[0].map((_, i) => tetrisPiece.shape.map(r => r[i]).reverse());
    const prev = tetrisPiece.shape;
    tetrisPiece.shape = rotated;
    if (collidesTetris(tetrisPiece)) tetrisPiece.shape = prev;
    drawTetris();
}
function tickTetris() { dropTetris(); }
function drawTetris() {
    const c = document.getElementById('tetrisCanvas');
    const nc = document.getElementById('tetrisNextCanvas');
    if (!c || !nc) return;
    const ctx = c.getContext('2d');
    const nctx = nc.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < TETRIS_ROWS; r++)
        for (let col = 0; col < TETRIS_COLS; col++)
            if (tetrisGrid[r][col]) {
                ctx.fillStyle = tetrisGrid[r][col];
                ctx.fillRect(col * TETRIS_BLOCK, r * TETRIS_BLOCK, TETRIS_BLOCK - 1, TETRIS_BLOCK - 1);
            }
    if (tetrisPiece) {
        ctx.fillStyle = tetrisPiece.color;
        for (let r = 0; r < tetrisPiece.shape.length; r++)
            for (let col = 0; col < tetrisPiece.shape[r].length; col++)
                if (tetrisPiece.shape[r][col])
                    ctx.fillRect((tetrisPiece.x + col) * TETRIS_BLOCK, (tetrisPiece.y + r) * TETRIS_BLOCK, TETRIS_BLOCK - 1, TETRIS_BLOCK - 1);
    }
    nctx.fillStyle = '#1a1a2e';
    nctx.fillRect(0, 0, nc.width, nc.height);
    const nextShape = TETRIS_SHAPES[tetrisNext];
    const sc = 12;
    nctx.fillStyle = TETRIS_COLORS[0];
    for (let r = 0; r < nextShape.length; r++)
        for (let col = 0; col < nextShape[r].length; col++)
            if (nextShape[r][col])
                nctx.fillRect(20 + col * sc, 20 + r * sc, sc - 1, sc - 1);
}

function closeTetris() {
    if (tetrisInterval) { clearInterval(tetrisInterval); tetrisInterval = null; }
    document.removeEventListener('keydown', tetrisKeyHandler);
    document.getElementById('minigameTetrisOverlay')?.classList.add('hidden');
}

let touchTycoonBalls = [], touchTycoonCoins = 0, touchTycoonLoopId;
function startTouchTycoon() {
    touchTycoonBalls = [];
    touchTycoonCoins = 0;
    const c = document.getElementById('touchTycoonCanvas');
    if (!c) return;
    document.getElementById('touchTycoonCoins').textContent = '0';
    const click = (e) => {
        const rect = c.getBoundingClientRect();
        const scaleX = c.width / rect.width, scaleY = c.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;
        let hit = false;
        for (let i = touchTycoonBalls.length - 1; i >= 0; i--) {
            const b = touchTycoonBalls[i];
            const dx = mx - b.x, dy = my - b.y;
            if (dx * dx + dy * dy <= b.r * b.r) {
                touchTycoonBalls.splice(i, 1);
                touchTycoonCoins++;
                document.getElementById('touchTycoonCoins').textContent = touchTycoonCoins;
                coins = (options.coins ?? coins ?? 0) + 1;
                options.coins = coins;
                updateCoinsUI(coins);
                saveOptionsToAccount().catch(() => {});
                hit = true;
                break;
            }
        }
        if (!hit) {
            touchTycoonCoins = Math.max(0, touchTycoonCoins - 2);
            document.getElementById('touchTycoonCoins').textContent = touchTycoonCoins;
            coins = Math.max(0, (options.coins ?? coins ?? 0) - 2);
            options.coins = coins;
            updateCoinsUI(coins);
            saveOptionsToAccount().catch(() => {});
        }
    };
    c.onclick = click;
    c.ontouchend = (e) => { e.preventDefault(); click(e.changedTouches?.[0] || e); };
    const spawn = () => {
        touchTycoonBalls.push({
            x: 30 + Math.random() * (c.width - 60),
            y: 30 + Math.random() * (c.height - 60),
            r: 15 + Math.random() * 20,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2
        });
    };
    for (let i = 0; i < 5; i++) spawn();
    let lastSpawn = Date.now();
    const loop = () => {
        const ov = document.getElementById('minigameTouchTycoonOverlay');
        if (!ov || ov.classList.contains('hidden')) return;
        touchTycoonLoopId = requestAnimationFrame(loop);
        const now = Date.now();
        if (now - lastSpawn > 800) { spawn(); lastSpawn = now; }
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, c.width, c.height);
        for (const b of touchTycoonBalls) {
            b.x += b.vx; b.y += b.vy;
            if (b.x - b.r < 0 || b.x + b.r > c.width) b.vx *= -1;
            if (b.y - b.r < 0 || b.y + b.r > c.height) b.vy *= -1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fillStyle = '#667eea';
            ctx.fill();
            ctx.strokeStyle = '#b8b8ff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    };
    if (touchTycoonLoopId) cancelAnimationFrame(touchTycoonLoopId);
    loop();
}

function closeTouchTycoon() {
    document.getElementById('minigameTouchTycoonOverlay')?.classList.add('hidden');
    if (touchTycoonLoopId) { cancelAnimationFrame(touchTycoonLoopId); touchTycoonLoopId = null; }
}

document.getElementById('minigameTetrisBtn')?.addEventListener('click', openMinigameTetris);
document.getElementById('minigameTouchTycoonBtn')?.addEventListener('click', openMinigameTouchTycoon);
document.getElementById('tetrisCloseBtn')?.addEventListener('click', closeTetris);
document.getElementById('touchTycoonCloseBtn')?.addEventListener('click', closeTouchTycoon);

function createDefaultCreatorBrick(x, y) {
    const w = 60, h = 22;
    return {
        x: x - w / 2, y: y - h / 2, width: w, height: h,
        visible: true, hp: 1, maxHp: 1, isItem: false, isNerf: false, isBoss: false, isBomb: false,
        itemType: null, bossVx: 0, bossVy: 0, bossShootTimer: 0
    };
}
function creatorBrickAt(cx, cy) {
    for (let i = creatorBricks.length - 1; i >= 0; i--) {
        const b = creatorBricks[i];
        if (cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height) return b;
    }
    return null;
}
function drawCreatorMode() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    creatorBricks.forEach(brick => {
        if (!brick || !brick.visible) return;
        const hp = brick.hp || 1;
        const color = brick.isBomb ? '#f97316' : (HP_COLORS[hp] || HP_COLORS[1]);
        ctx.fillStyle = color;
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
}
function creatorLoop() {
    if (!creatorMode) return;
    drawCreatorMode();
    creatorLoopId = requestAnimationFrame(creatorLoop);
}
async function hasCreatorModeTutorialShown() {
    if (currentAccount && !isGuestAccount()) {
        try {
            const acc = await getAccount(currentAccount);
            return !!(acc?.options?.creatorModeTutorialShown);
        } catch (e) { return false; }
    }
    return !!localStorage.getItem('creatorModeTutorialShown');
}
async function saveCreatorModeTutorialShown() {
    if (currentAccount && !isGuestAccount()) {
        try {
            const acc = await getAccount(currentAccount);
            if (acc) await saveAccount(currentAccount, { ...acc, options: { ...(acc.options || {}), creatorModeTutorialShown: true } });
        } catch (e) {}
    } else {
        localStorage.setItem('creatorModeTutorialShown', '1');
    }
}
function enterCreatorMode() {
    if (STAGE6_ONLY || BOSS5_TEST || BOSS4_TEST || STAGE4_ONLY || STAGE3_ONLY) return;
    applyOptions();
    canvas.width = options.canvasWidth;
    canvas.height = options.canvasHeight;
    paddle.baseWidth = PADDLE_WIDTH * (options.canvasWidth / 800);
    paddle.width = paddle.baseWidth;
    paddle.x = (canvas.width - paddle.width) / 2;
    paddle.y = canvas.height - 40;
    if (creatorBricks.length === 0 && bricks.length > 0) {
        bricks.forEach(row => {
            row.forEach(b => {
                if (b && b.visible) creatorBricks.push({ ...b, x: b.x, y: b.y });
            });
        });
    }
    document.getElementById('optionsPanel')?.classList.add('hidden');
    document.getElementById('startOverlay')?.classList.add('hidden');
    document.getElementById('loginOverlay')?.classList.add('hidden');
    creatorMode = true;
    creatorDeleteMode = false;
    document.body.classList.add('creator-mode');
    document.getElementById('creatorOverlay')?.classList.remove('hidden');
    if (gameRunning) { gameRunning = false; if (animationId) cancelAnimationFrame(animationId); }
    hasCreatorModeTutorialShown().then(shown => {
        if (!shown) document.getElementById('creatorTutorialOverlay')?.classList.remove('hidden');
    });
    creatorLoop();
}
function exitCreatorMode() {
    creatorMode = false;
    creatorDragging = false;
    creatorDragBrick = null;
    creatorDeleteMode = false;
    if (creatorLoopId) { cancelAnimationFrame(creatorLoopId); creatorLoopId = null; }
    document.body.classList.remove('creator-mode');
    document.getElementById('creatorOverlay')?.classList.add('hidden');
    document.getElementById('creatorTutorialOverlay')?.classList.add('hidden');
    document.getElementById('startOverlay')?.classList.remove('hidden');
    draw();
}
function onCreatorMouseDown(e) {
    if (!creatorMode) return;
    const pos = getCanvasPos(e.clientX, e.clientY);
    const brick = creatorBrickAt(pos.x, pos.y);
    if (creatorDeleteMode || e.button === 2 || (e.button === 0 && e.ctrlKey)) {
        if (brick) { creatorBricks = creatorBricks.filter(b => b !== brick); }
        if (e.button === 2 || e.ctrlKey) e.preventDefault();
        return;
    }
    if (e.button !== 0) return;
    if (brick) {
        creatorDragging = true;
        creatorDragBrick = brick;
        creatorDragOffsetX = pos.x - brick.x;
        creatorDragOffsetY = pos.y - brick.y;
    } else {
        if (pos.y < BRICK_OFFSET_TOP || pos.y > canvas.height - 80) return;
        creatorBricks.push(createDefaultCreatorBrick(pos.x, pos.y));
    }
}
function onCreatorMouseMove(e) {
    if (!creatorMode || !creatorDragging || !creatorDragBrick) return;
    const pos = getCanvasPos(e.clientX, e.clientY);
    creatorDragBrick.x = Math.max(0, Math.min(canvas.width - creatorDragBrick.width, pos.x - creatorDragOffsetX));
    creatorDragBrick.y = Math.max(BRICK_OFFSET_TOP, Math.min(canvas.height - 80 - creatorDragBrick.height, pos.y - creatorDragOffsetY));
}
function onCreatorMouseUp(e) {
    if (!creatorMode) return;
    if (e.button === 0) { creatorDragging = false; creatorDragBrick = null; }
}
function onCreatorContextMenu(e) {
    if (!creatorMode) return;
    e.preventDefault();
    const pos = getCanvasPos(e.clientX, e.clientY);
    const brick = creatorBrickAt(pos.x, pos.y);
    if (brick) creatorBricks = creatorBricks.filter(b => b !== brick);
}
canvas.addEventListener('mousedown', onCreatorMouseDown);
canvas.addEventListener('mousemove', onCreatorMouseMove);
canvas.addEventListener('mouseup', onCreatorMouseUp);
canvas.addEventListener('mouseleave', onCreatorMouseUp);
canvas.addEventListener('contextmenu', onCreatorContextMenu);
document.getElementById('creatorModeBtn')?.addEventListener('click', () => {
    closeOptions();
    enterCreatorMode();
});
document.getElementById('creatorExitBtn')?.addEventListener('click', exitCreatorMode);
document.getElementById('creatorDeleteBtn')?.addEventListener('click', () => {
    creatorDeleteMode = !creatorDeleteMode;
    const btn = document.getElementById('creatorDeleteBtn');
    if (btn) btn.classList.toggle('selected', creatorDeleteMode);
});
document.getElementById('creatorSaveLevelBtn')?.addEventListener('click', async () => {
    const name = prompt('레벨 이름을 입력하세요 (최대 50자)');
    if (name !== null) await saveCreatorLevel(name);
});
document.getElementById('creatorLoadOthersBtn')?.addEventListener('click', async () => {
    const modal = document.getElementById('customLevelsModal');
    const listEl = document.getElementById('customLevelsList');
    if (!modal || !listEl) return;
    listEl.innerHTML = '<p style="color:#b8b8ff;">불러오는 중...</p>';
    modal.classList.remove('hidden');
    try {
        const levels = await getCustomLevels();
        if (levels.length === 0) {
            listEl.innerHTML = '<p style="color:#b8b8ff;">저장된 레벨이 없습니다.</p>';
        } else {
            listEl.innerHTML = '';
            const sorted = [...levels].sort((a, b) => (b.date || 0) - (a.date || 0));
            sorted.forEach(l => {
                const author = (l.authorProfile && l.authorProfile.trim()) ? `${l.authorProfile} (${l.author})` : (l.author || '익명');
                const div = document.createElement('div');
                div.style.cssText = 'padding:8px 12px; margin:4px 0; background:rgba(255,255,255,0.08); border-radius:8px;';
                div.innerHTML = `<strong>${(l.name || '이름 없음').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</strong> · ${author.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')} `;
                const btn = document.createElement('button');
                btn.className = 'btn btn-small';
                btn.style.marginLeft = '8px';
                btn.textContent = '플레이';
                btn.addEventListener('click', () => playCustomLevel(l.id));
                div.appendChild(btn);
                listEl.appendChild(div);
            });
        }
    } catch (e) {
        listEl.innerHTML = '<p style="color:#ff6b6b;">불러오기 실패: ' + (e.message || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</p>';
    }
});
document.getElementById('customLevelsModalClose')?.addEventListener('click', () => {
    document.getElementById('customLevelsModal')?.classList.add('hidden');
});
document.getElementById('mercyBtn')?.addEventListener('click', () => {
    if (!awaitingMercyAttackChoice) return;
    document.getElementById('mercyAttackOverlay')?.classList.add('hidden');
    if (mercyAttackBossBrick) {
        const b = mercyAttackBossBrick;
        const cx = b.x + b.width / 2, cy = b.y;
        if (b.isItem && b.itemType) spawnFallingItem(cx, cy, b.itemType);
        if (b.isNerf && b.itemType) spawnFallingItem(cx, cy, b.itemType);
        b.visible = false;
        mercyAttackBossBrick = null;
    }
    minions = [];
    minionBullets = [];
    coins += 100;
    updateCoinsUI(coins);
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    if (msgEl && overlayEl) {
        msgEl.textContent = '적도 그만 싸우자고 생각했다';
        overlayEl.classList.remove('hidden');
    }
    setTimeout(() => {
        if (overlayEl) overlayEl.classList.add('hidden');
        awaitingMercyAttackChoice = false;
        bossDustEffects = [];
        showBossUpgradeChoice();
    }, 2500);
});
document.getElementById('attackBtn')?.addEventListener('click', () => {
    if (!awaitingMercyAttackChoice || !mercyAttackBossBrick) return;
    const b = mercyAttackBossBrick;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (b.isItem && b.itemType) spawnFallingItem(cx, b.y, b.itemType);
    if (b.isNerf && b.itemType) spawnFallingItem(cx, b.y, b.itemType);
    for (let i = 0; i < 40; i++) {
        const a = (Math.PI * 2 * i) / 40 + Math.random() * 0.5;
        const v = 2 + Math.random() * 4;
        bossDustEffects.push({
            x: cx, y: cy,
            vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            startTime: Date.now(), duration: 800
        });
    }
    document.getElementById('mercyAttackOverlay')?.classList.add('hidden');
    b.visible = false;
    mercyAttackBossBrick = null;
    minions = [];
    minionBullets = [];
    setTimeout(() => {
        awaitingMercyAttackChoice = false;
        bossDustEffects = [];
        showBossUpgradeChoice();
    }, 900);
});
document.getElementById('creatorTutorialOkBtn')?.addEventListener('click', () => {
    document.getElementById('creatorTutorialOverlay')?.classList.add('hidden');
    saveCreatorModeTutorialShown();
});
document.getElementById('creatorStartBtn')?.addEventListener('click', () => {
    bricks = creatorBricks.length > 0 ? [creatorBricks.map(b => ({ ...b }))] : createBricks();
    creatorMode = false;
    creatorDragging = false;
    creatorDragBrick = null;
    creatorDeleteMode = false;
    if (creatorLoopId) { cancelAnimationFrame(creatorLoopId); creatorLoopId = null; }
    document.body.classList.remove('creator-mode');
    document.getElementById('creatorOverlay')?.classList.add('hidden');
    document.getElementById('creatorTutorialOverlay')?.classList.add('hidden');
    score = 0; lives = 3; currentStage = 1;
    stage6DarkPhaseUntil = 0;
    stage6DarkPhaseNextAt = 0;
    updateStageUI(currentStage);
    updateScoreUI(score);
    updateLivesUI();
    document.getElementById('startOverlay')?.classList.add('hidden');
    document.getElementById('gameOverOverlay')?.classList.add('hidden');
    document.getElementById('gameOverOverlay')?.classList.remove('game-over-visible');
    document.getElementById('winOverlay')?.classList.add('hidden');
    document.getElementById('mercyAttackOverlay')?.classList.add('hidden');
    gameRunning = true;
    gamePaused = false;
    ballLaunched = false;
    ballStickTimer = 0;
    hasBulletPower = false;
    bullets = []; bossBullets = []; bossShields = []; damageNumbers = []; bombExplosions = [];
    awaitingMercyAttackChoice = false;
    mercyAttackBossBrick = null;
    bossDustEffects = [];
    fallingItems = []; activeItems = [];
    paddle.x = (canvas.width - paddle.width) / 2;
    mouseX = canvas.width / 2;
    resetBall();
    updateOptionsButtonVisibility();
    updateBulletFireButtonVisibility();
    showStageStartAndResume();
});

const storageAdminBtn = document.getElementById('storageAdminBtn');
if (storageAdminBtn) storageAdminBtn.addEventListener('click', () => {
    const pwd = prompt('비밀번호를 입력하세요.');
    if (pwd === null) return;
    if (pwd !== ADMIN_PASSWORD) {
        alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    const modal = document.getElementById('storageAdminModal');
    if (modal) modal.classList.remove('hidden');
});

const storageAdminCloseBtn = document.getElementById('storageAdminCloseBtn');
if (storageAdminCloseBtn) storageAdminCloseBtn.addEventListener('click', () => {
    const modal = document.getElementById('storageAdminModal');
    if (modal) modal.classList.add('hidden');
});

const storageAdminResetAllBtn = document.getElementById('storageAdminResetAllBtn');
if (storageAdminResetAllBtn) storageAdminResetAllBtn.addEventListener('click', async () => {
    if (!confirm('모든 계정과 점수 데이터를 삭제합니다. 복구할 수 없습니다. 계속하시겠습니까?')) return;
    try {
        await withTimeout(window.firestoreSetDoc({ accounts: {}, ranking: [] }, { merge: true }), FIRESTORE_TIMEOUT_MS);
        await resetRankingUI();
        alert('전체 데이터가 초기화되었습니다.');
        const modal = document.getElementById('storageAdminModal');
        if (modal) modal.classList.add('hidden');
    } catch (e) {
        alert('초기화에 실패했습니다. ' + (e.message || '인터넷 연결을 확인해 주세요.'));
    }
});

const bulletFireBtn = document.getElementById('bulletFireBtn');
if (bulletFireBtn) bulletFireBtn.addEventListener('click', () => {
    if (gameRunning && !gamePaused && hasBulletPower && options.difficulty === 'hard') shootBullet();
});

const paddleSpeedEl = document.getElementById('paddleSpeed');
if (paddleSpeedEl) paddleSpeedEl.addEventListener('input', (e) => {
    const v = document.getElementById('paddleSpeedVal');
    if (v) v.textContent = e.target.value;
});
const diffEl = document.getElementById('difficulty');
if (diffEl) diffEl.addEventListener('change', () => {
    const cfg = DIFFICULTY_CONFIG[diffEl.value] || DIFFICULTY_CONFIG.medium;
    options.ballSpeed = currentStage === 6 ? cfg.stage6BallSpeed : cfg.ballSpeed;
});

function showTutorialOverlay() {
    document.getElementById('startOverlay')?.classList.add('hidden');
    document.getElementById('tutorialOverlay')?.classList.remove('hidden');
}
function hideTutorialOverlay() {
    document.getElementById('tutorialOverlay')?.classList.add('hidden');
}
const startBtn = document.getElementById('startBtn');
if (startBtn) startBtn.addEventListener('click', async () => {
    coopMode = false;
    if (BOSS4_TEST || BOSS5_TEST || BOSS6_TEST || STAGE4_ONLY || STAGE6_ONLY || STAGE3_ONLY) {
        startGame(true);
        return;
    }
    const cleared = await hasClearedStage1(currentAccount);
    if (cleared) {
        startGame(true);
    } else {
        showTutorialOverlay();
    }
});
const coopModeBtn = document.getElementById('coopModeBtn');
if (coopModeBtn) coopModeBtn.addEventListener('click', () => {
    document.getElementById('startOverlay')?.classList.add('hidden');
    document.getElementById('coopOverlay')?.classList.remove('hidden');
});
const coopStartBtn = document.getElementById('coopStartBtn');
if (coopStartBtn) coopStartBtn.addEventListener('click', () => {
    coopMode = true;
    document.getElementById('coopOverlay')?.classList.add('hidden');
    startGame(true);
});
const coopBackBtn = document.getElementById('coopBackBtn');
if (coopBackBtn) coopBackBtn.addEventListener('click', () => {
    document.getElementById('coopOverlay')?.classList.add('hidden');
    document.getElementById('startOverlay')?.classList.remove('hidden');
});
const tutorialStartBtn = document.getElementById('tutorialStartBtn');
if (tutorialStartBtn) tutorialStartBtn.addEventListener('click', () => {
    hideTutorialOverlay();
    startGame(true);
});
const continueBtn = document.getElementById('continueBtn');
if (continueBtn) continueBtn.addEventListener('click', () => {
    document.getElementById('gameOverOverlay')?.classList.remove('game-over-visible');
    continueGame();
});
const newGameBtn = document.getElementById('newGameBtn');
if (newGameBtn) newGameBtn.addEventListener('click', () => {
    const overlay = document.getElementById('gameOverOverlay');
    const buttonsEl = document.getElementById('gameOverButtons');
    const rankingEl = document.getElementById('rankingDisplay');
    const countdownEl = document.getElementById('gameOverQuitCountdown');
    if (buttonsEl) buttonsEl.classList.add('game-over-buttons-hidden');
    if (rankingEl) rankingEl.classList.remove('game-over-hide');
    if (countdownEl) {
        countdownEl.classList.remove('game-over-hide');
        let left = 20;
        countdownEl.textContent = left + '초 후 게임이 종료됩니다.';
        const tick = setInterval(() => {
            left--;
            if (countdownEl) countdownEl.textContent = left > 0 ? left + '초 후 게임이 종료됩니다.' : '게임을 종료합니다...';
            if (left <= 0) {
                clearInterval(tick);
                if (overlay) overlay.classList.remove('game-over-visible');
                restartGame();
            }
        }, 1000);
    } else {
        setTimeout(() => {
            if (overlay) overlay.classList.remove('game-over-visible');
            restartGame();
        }, 20000);
    }
});
const gameOverBackToLoginBtn = document.getElementById('gameOverBackToLoginBtn');
if (gameOverBackToLoginBtn) gameOverBackToLoginBtn.addEventListener('click', () => {
    if (!confirm('로그인 화면으로 돌아가시겠습니까?')) return;
    gameRunning = false;
    gamePaused = false;
    currentAccount = '';
    document.getElementById('gameOverOverlay')?.classList.add('hidden');
    document.getElementById('gameOverOverlay')?.classList.remove('game-over-visible');
    document.getElementById('loginOverlay')?.classList.remove('hidden');
});
const playAgainBtn = document.getElementById('playAgainBtn');
if (playAgainBtn) playAgainBtn.addEventListener('click', restartGame);
document.querySelectorAll('#resetMyRankingBtn, #resetMyRankingBtnWin').forEach(b => { if (b) b.addEventListener('click', handleResetMyRanking); });
document.querySelectorAll('#resetAllRankingBtn, #resetAllRankingBtnWin').forEach(b => { if (b) b.addEventListener('click', handleResetAllRanking); });

async function refreshAccountList(selectAccountName) {
    if (STAGE6_ONLY || BOSS5_TEST || BOSS4_TEST) return;
    const statusEl = document.getElementById('loginConnectionStatus');
    try {
        const status = await isOnlineStorageAvailable();
        if (!status.ok) {
            if (statusEl) { statusEl.textContent = status.error || '인터넷 연결을 확인해 주세요.'; statusEl.style.display = 'block'; statusEl.className = 'login-status error'; }
            return;
        }
        if (statusEl) statusEl.style.display = 'none';
        const accountInput = document.getElementById('accountSelect');
        const accountsObj = await getAccounts();
        const accounts = Object.keys(accountsObj).filter(k => accountsObj[k] && typeof accountsObj[k] === 'object').sort();
        if (accountInput) {
            if (selectAccountName && accounts.indexOf(selectAccountName) >= 0) accountInput.value = selectAccountName;
        }
    } catch (e) {
        if (statusEl) { statusEl.textContent = '온라인 저장소에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.'; statusEl.style.display = 'block'; statusEl.className = 'login-status error'; }
        console.error('refreshAccountList 오류:', e);
    }
}

async function doLogin() {
    const status = await isOnlineStorageAvailable();
    if (!status.ok) {
        alert(status.error || '온라인 저장소에 연결할 수 없습니다. 인터넷 연결을 확인한 후 다시 시도해 주세요.');
        return;
    }
    const name = (document.getElementById('accountSelect')?.value || '').trim();
    const password = (document.getElementById('passwordInput')?.value || '').trim();
    if (!name) {
        alert('계정 아이디를 입력하세요.');
        return;
    }
    let acc;
    try {
        acc = await getAccount(name);
    } catch (e) {
        alert('계정 정보를 불러올 수 없습니다. ' + (e.message || ''));
        return;
    }
    if (!acc || acc.password !== password) {
        alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    try {
        const suspended = await isChatSuspended(name);
        if (suspended) {
            suspendedLoginAttempted = true;
            alert('정지 당하셨습니다.');
            return;
        }
    } catch (e) { /* 정지 정보 조회 실패 시 로그인 허용 */ }
    suspendedLoginAttempted = false;
    currentAccount = name;
    await loadOptionsForAccount(name);
    stopLoginBGM();
    document.getElementById('loginOverlay')?.classList.add('hidden');
    const pwdInput = document.getElementById('passwordInput');
    if (pwdInput) pwdInput.value = '';
    const accDisplay = document.getElementById('currentAccountDisplay');
    if (accDisplay) accDisplay.textContent = '(' + name + ')';
    document.getElementById('startOverlay')?.classList.remove('hidden');
    const editAccountBtn = document.getElementById('editAccountBtn');
    if (editAccountBtn) editAccountBtn.style.display = '';
    updateRotateOverlay();
    updateExitButton();
    if (isMobile()) enforceMobileLandscapeFullscreen();
}

function doGuestLogin() {
    currentAccount = GUEST_ACCOUNT;
    coins = parseInt(localStorage.getItem('guestCoins') || '0', 10);
    options.coins = coins;
    setMaxCoins(Math.max(getMaxCoins(), coins));
    updateCoinsUI(coins);
    stopLoginBGM();
    document.getElementById('loginOverlay')?.classList.add('hidden');
    const accDisplay = document.getElementById('currentAccountDisplay');
    if (accDisplay) accDisplay.textContent = '(평범한 게스트)';
    document.getElementById('startOverlay')?.classList.remove('hidden');
    const editAccountBtn = document.getElementById('editAccountBtn');
    if (editAccountBtn) editAccountBtn.style.display = 'none';
    updateRotateOverlay();
    updateExitButton();
    if (isMobile()) enforceMobileLandscapeFullscreen();
}

let passwordPromptCallback = null;

function showPasswordPrompt(title, desc, onConfirm) {
    try {
        const titleEl = document.getElementById('passwordPromptTitle');
        const descEl = document.getElementById('passwordPromptDesc');
        const inputEl = document.getElementById('passwordPromptInput');
        const modal = document.getElementById('passwordPromptModal');
        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = desc;
        if (inputEl) inputEl.value = '';
        passwordPromptCallback = onConfirm;
        if (modal) modal.classList.remove('hidden');
    } catch (e) {
        console.error('비밀번호 입력 모달 오류:', e);
        alert('창을 열 수 없습니다.');
    }
}

function hidePasswordPrompt() {
    const el = document.getElementById('passwordPromptModal');
    if (el) el.classList.add('hidden');
    passwordPromptCallback = null;
}

function handleDeleteAccount() {
    const name = (document.getElementById('accountSelect')?.value || '').trim();
    if (!name) {
        alert('삭제할 계정 아이디를 입력하세요.');
        return;
    }
    showPasswordPrompt('계정 삭제', name + ' 계정의 비밀번호를 입력하세요. 삭제 후 복구할 수 없습니다.', async (pwd) => {
        try {
            const acc = await getAccount(name);
            if (!acc || acc.password !== pwd) {
                alert('비밀번호가 올바르지 않습니다.');
                return false;
            }
            await deleteAccountData(name);
            await refreshAccountList();
            if (currentAccount === name) currentAccount = '';
            alert('계정이 삭제되었습니다.');
            return true;
        } catch (e) {
            alert('계정 삭제 중 오류가 발생했습니다. ' + (e.message || '인터넷 연결을 확인해 주세요.'));
            return false;
        }
    });
}

function playScreamSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        const t = audioCtx.currentTime;
        const duration = 1.8;
        const masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0, t);
        masterGain.gain.linearRampToValueAtTime(0.55, t + 0.03);
        masterGain.gain.setValueAtTime(0.5, t + 0.1);
        masterGain.gain.exponentialRampToValueAtTime(0.4, t + 0.6);
        masterGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        masterGain.connect(audioCtx.destination);
        const fundFreq = 380;
        const oscTypes = ['sawtooth', 'square', 'sawtooth'];
        [1, 1.8, 2.4, 3.2, 4.1].forEach((mult, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = oscTypes[i % 3];
            osc.frequency.setValueAtTime(fundFreq * mult, t);
            osc.frequency.setValueAtTime(fundFreq * mult * 1.15, t + 0.05);
            osc.frequency.exponentialRampToValueAtTime(fundFreq * mult * 0.7, t + 0.4);
            osc.frequency.setValueAtTime(fundFreq * mult * 0.75, t + 0.5);
            osc.frequency.exponentialRampToValueAtTime(fundFreq * mult * 0.5, t + duration);
            gain.gain.setValueAtTime(0.2 / mult, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(t);
            osc.stop(t + duration);
        });
        const bufferSize = audioCtx.sampleRate * duration;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 2200;
        noiseFilter.Q.value = 1.2;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.35, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start(t);
    } catch (e) {}
}

function showChijijikVideoThen(callback) {
    const overlay = document.createElement('div');
    overlay.id = 'chijijikVideoOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:999998; background:#000; display:flex; align-items:center; justify-content:center;';
    const videoSrc = PATH_BASE + '동영상/화면 치지직.mp4';
    const video = document.createElement('video');
    video.style.cssText = 'max-width:100%; max-height:100%; width:100%; height:100%; object-fit:contain;';
    video.playsInline = true;
    video.muted = false;
    video.autoplay = true;
    video.src = videoSrc;
    function done() {
        overlay.remove();
        if (typeof callback === 'function') callback();
    }
    video.onended = done;
    video.onerror = done;
    overlay.appendChild(video);
    document.body.appendChild(overlay);
    video.play().catch(done);
    setTimeout(done, 60000);
}

function showSuspendedPunishmentAndExit() {
    stopLoginBGM();
    const overlay = document.createElement('div');
    overlay.id = 'suspendedPunishmentOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:999999; background:#000; display:flex; align-items:center; justify-content:center;';
    const videoSrc = PATH_BASE + '동영상/화면 치지직.mp4';
    const video = document.createElement('video');
    video.style.cssText = 'max-width:100%; max-height:100%; width:100%; height:100%; object-fit:contain;';
    video.playsInline = true;
    video.muted = false;
    video.autoplay = true;
    video.src = videoSrc;
    const img = new Image();
    img.alt = '';
    img.style.cssText = 'max-width:100%; max-height:100%; object-fit:contain; display:none;';
    img.src = PATH.image + '666666.png';
    img.onerror = () => { img.src = PATH.image + '6666666.png'; };
    function doExit() {
        try { window.close(); } catch (e) {}
        overlay.innerHTML = '<p style="color:#fff; font-size:1.5rem;">게임이 종료되었습니다.</p>';
    }
    video.onended = doExit;
    video.onerror = () => {
        img.style.display = 'block';
        video.style.display = 'none';
        playScreamSound();
        setTimeout(doExit, 2800);
    };
    overlay.appendChild(video);
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    playScreamSound();
    video.play().catch(() => {
        img.style.display = 'block';
        video.style.display = 'none';
        setTimeout(doExit, 2800);
    });
    setTimeout(doExit, 60000);
}

async function showCreateAccountModal() {
    if (suspendedLoginAttempted) {
        showSuspendedPunishmentAndExit();
        return;
    }
    try {
        await refreshAccountList();
        ['newAccountName', 'newPassword', 'newPasswordConfirm', 'newQuestion', 'newHint', 'newAnswer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const newPwd = document.getElementById('newPassword');
        const newPwdConfirm = document.getElementById('newPasswordConfirm');
        if (newPwd) newPwd.type = 'password';
        if (newPwdConfirm) newPwdConfirm.type = 'password';
        const toggleNew = document.getElementById('toggleNewPassword');
        const toggleNewConfirm = document.getElementById('toggleNewPasswordConfirm');
        if (toggleNew) toggleNew.textContent = '👁';
        if (toggleNewConfirm) toggleNewConfirm.textContent = '👁';
        const msgEl = document.getElementById('passwordMatchMsg');
        if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }
        const modal = document.getElementById('createAccountModal');
        if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
        setupProfileCanvasDrawing('newProfileCanvas', 'newProfileClearBtn');
        const newCanvas = document.getElementById('newProfileCanvas');
        if (newCanvas) {
            const ctx = newCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
        }
    } catch (e) {
        console.error('계정 새로 만들기 모달 열기 오류:', e);
        alert('모달을 열 수 없습니다.');
    }
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
    const modal = document.getElementById('createAccountModal');
    if (modal) { modal.classList.add('hidden'); modal.style.display = ''; }
}

function getProfileCanvasDataUrl(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return '';
    try {
        return canvas.toDataURL('image/png');
    } catch (e) { return ''; }
}

function loadProfileCanvas(canvasId, dataUrl) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !dataUrl) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
}

function setupProfileCanvasDrawing(canvasId, clearBtnId, brushSizeInputId, brushSizeValId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let isDrawing = false;
    let currentColor = '#000000';
    const brushInput = brushSizeInputId ? document.getElementById(brushSizeInputId) : null;
    const brushValEl = brushSizeValId ? document.getElementById(brushSizeValId) : null;
    function getBrushSize() {
        if (brushInput) return Math.max(1, Math.min(12, parseInt(brushInput.value, 10) || 3));
        return 3;
    }
    if (brushInput && brushValEl) {
        brushInput.oninput = () => { brushValEl.textContent = brushInput.value; };
        brushValEl.textContent = brushInput.value;
    }
    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX || (e.touches && e.touches[0]?.clientX) || 0) - rect.left;
        const y = (e.clientY || (e.touches && e.touches[0]?.clientY) || 0) - rect.top;
        return { x: Math.floor(x * scaleX), y: Math.floor(y * scaleY) };
    }
    function draw(x, y) {
        const r = getBrushSize();
        ctx.fillStyle = currentColor;
        ctx.beginPath();
        ctx.arc(Math.max(0, Math.min(x, canvas.width)), Math.max(0, Math.min(y, canvas.height)), r, 0, Math.PI * 2);
        ctx.fill();
    }
    canvas.onmousedown = (e) => { isDrawing = true; const p = getPos(e); draw(p.x, p.y); };
    canvas.onmousemove = (e) => { if (isDrawing) { const p = getPos(e); draw(p.x, p.y); } };
    canvas.onmouseup = () => { isDrawing = false; };
    canvas.onmouseleave = () => { isDrawing = false; };
    canvas.ontouchstart = (e) => { e.preventDefault(); isDrawing = true; const p = getPos(e); draw(p.x, p.y); };
    canvas.ontouchmove = (e) => { e.preventDefault(); if (isDrawing) { const p = getPos(e); draw(p.x, p.y); } };
    canvas.ontouchend = () => { isDrawing = false; };
    const wrap = canvas.closest('.profile-canvas-wrap');
    if (wrap) {
        wrap.querySelectorAll('.profile-color-btn').forEach(btn => {
            btn.onclick = () => {
                wrap.querySelectorAll('.profile-color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentColor = btn.dataset.color || '#000000';
            };
        });
    }
    const clearBtn = document.getElementById(clearBtnId);
    if (clearBtn) clearBtn.onclick = () => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); };
}

function updateOptionsButtonVisibility() {
    const editEl = document.getElementById('editAccountModal');
    const editVisible = editEl && !editEl.classList.contains('hidden');
    const hide = editVisible;
    document.querySelectorAll('#optionsBtn, #optionsBtnSide').forEach(btn => {
        if (btn) btn.style.display = hide ? 'none' : '';
    });
    updateExitButton();
}

async function showEditProfileFromLogin() {
    const name = (document.getElementById('accountSelect')?.value || '').trim();
    const password = (document.getElementById('passwordInput')?.value || '').trim();
    if (!name) { alert('계정 아이디를 입력하세요.'); return; }
    if (!password) { alert('비밀번호를 입력하세요.'); return; }
    try {
        const acc = await getAccount(name);
        if (!acc || acc.password !== password) {
            alert('비밀번호가 올바르지 않습니다.');
            return;
        }
        currentAccount = name;
        await showEditAccountModal();
    } catch (e) {
        alert('계정 정보를 불러올 수 없습니다. ' + (e.message || ''));
    }
}

async function showEditAccountModal() {
    if (!currentAccount) return;
    try {
        const acc = await getAccount(currentAccount);
        if (!acc) return;
    document.getElementById('editAccountNameDisplay').textContent = '계정: ' + currentAccount;
    const editProfileEl = document.getElementById('editProfile');
    if (editProfileEl) editProfileEl.value = acc.profile || '';
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
    setupProfileCanvasDrawing('editProfileCanvas', 'editProfileClearBtn', 'editProfileBrushSize', 'editProfileBrushSizeVal');
    if (acc.profileImage) {
        loadProfileCanvas('editProfileCanvas', acc.profileImage);
    } else {
        const editCanvas = document.getElementById('editProfileCanvas');
        if (editCanvas) {
            const ctx = editCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, editCanvas.width, editCanvas.height);
        }
    }
    document.getElementById('editAccountModal').classList.remove('hidden');
    updateOptionsButtonVisibility();
    } catch (e) {
        alert('계정 정보를 불러올 수 없습니다. ' + (e.message || '인터넷 연결을 확인해 주세요.'));
    }
}

function hideEditAccountModal() {
    document.getElementById('editAccountModal')?.classList.add('hidden');
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

async function handleEditAccount() {
    const currentPwd = (document.getElementById('editCurrentPassword')?.value || '').trim();
    const newPwd = (document.getElementById('editNewPassword')?.value || '').trim();
    const newPwdConfirm = (document.getElementById('editNewPasswordConfirm')?.value || '').trim();
    const question = (document.getElementById('editQuestion')?.value || '').trim();
    const hint = (document.getElementById('editHint')?.value || '').trim();
    const answer = (document.getElementById('editAnswer')?.value || '').trim();
    if (!currentPwd) { alert('현재 비밀번호를 입력하세요.'); return; }
    try {
        const acc = await getAccount(currentAccount);
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
        const profile = (document.getElementById('editProfile')?.value || '').trim();
        const profileImage = getProfileCanvasDataUrl('editProfileCanvas') || '';
        await saveAccount(currentAccount, { ...acc, password: finalPassword, question, hint, answer, profile: profile || '', profileImage });
        hideEditAccountModal();
        alert('계정 정보가 수정되었습니다.');
    } catch (e) {
        alert('계정 정보 수정에 실패했습니다. ' + (e.message || '인터넷 연결을 확인해 주세요.'));
    }
}

async function handleCreateAccount() {
    try {
        const status = await isOnlineStorageAvailable();
        if (!status.ok) {
            alert(status.error || '온라인 저장소에 연결할 수 없습니다. 인터넷 연결을 확인한 후 다시 시도해 주세요.');
            return;
        }
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
        if (await getAccount(name)) { alert('이미 존재하는 계정 이름입니다.'); return; }
        const profile = (document.getElementById('newProfile')?.value || '').trim();
        const profileImage = getProfileCanvasDataUrl('newProfileCanvas') || '';
        await saveAccount(name, { password: pwd, question, hint, answer, profile: profile || '', profileImage });
        await refreshAccountList(name);
        hideCreateAccountModal();
        document.getElementById('passwordInput').value = '';
        alert('계정이 생성되었습니다.');
    } catch (e) {
        console.error('계정 생성 오류:', e);
        alert('계정 생성 중 오류가 발생했습니다. ' + (e.message || '인터넷 연결을 확인해 주세요.'));
    }
}

async function showFindPasswordModal() {
    try {
        await refreshAccountList();
        ['findPasswordQuestion', 'findPasswordHint', 'findPasswordAnswer', 'findPasswordResult'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.style.display = 'none'; if (id === 'findPasswordAnswer') el.value = ''; }
        });
        const ansEl = document.getElementById('findPasswordAnswer');
        if (ansEl) ansEl.value = '';
        const modal = document.getElementById('findPasswordModal');
        if (modal) modal.classList.remove('hidden');
    } catch (e) {
        console.error('비밀번호 찾기 모달 오류:', e);
        alert('비밀번호 찾기 창을 열 수 없습니다.');
    }
}

async function onFindPasswordAccountSelect() {
    const name = document.getElementById('findPasswordAccountSelect')?.value?.trim();
    const qEl = document.getElementById('findPasswordQuestion');
    const hEl = document.getElementById('findPasswordHint');
    const aEl = document.getElementById('findPasswordAnswer');
    if (!name) {
        if (qEl) qEl.style.display = 'none';
        if (hEl) hEl.style.display = 'none';
        if (aEl) aEl.style.display = 'none';
        return;
    }
    const acc = await getAccount(name);
    if (!acc) return;
    qEl.textContent = '질문: ' + acc.question;
    hEl.textContent = '힌트: ' + (acc.hint || '(없음)');
    qEl.style.display = 'block';
    hEl.style.display = 'block';
    aEl.style.display = 'block';
}

async function handleFindPassword() {
    const name = document.getElementById('findPasswordAccountSelect')?.value?.trim();
    const answer = (document.getElementById('findPasswordAnswer')?.value || '').trim();
    const resultEl = document.getElementById('findPasswordResult');
    if (!name || !answer) {
        alert('계정을 선택하고 답을 입력하세요.');
        return;
    }
    const acc = await getAccount(name);
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

function setupLoginHandlers() {
    if (STAGE6_ONLY || BOSS5_TEST || BOSS4_TEST) return;
    function checkLoginInputFor6() {
        const accountEl = document.getElementById('accountSelect');
        const passwordEl = document.getElementById('passwordInput');
        const accountVal = (accountEl && accountEl.value) || '';
        const passwordVal = (passwordEl && passwordEl.value) || '';
        if (accountVal.includes('6') || passwordVal.includes('6')) {
            try {
                if (typeof window.Capacitor !== 'undefined' && window.Capacitor.Plugins && window.Capacitor.Plugins.App && window.Capacitor.Plugins.App.exitApp) {
                    window.Capacitor.Plugins.App.exitApp();
                } else {
                    window.close();
                }
            } catch (e) {}
        }
    }
    const accountSelect = document.getElementById('accountSelect');
    if (accountSelect) {
        accountSelect.addEventListener('input', checkLoginInputFor6);
        accountSelect.addEventListener('keyup', checkLoginInputFor6);
    }
    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) {
        passwordInput.addEventListener('input', checkLoginInputFor6);
        passwordInput.addEventListener('keyup', checkLoginInputFor6);
        passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });
    }
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
    if (passwordPromptConfirmBtn) passwordPromptConfirmBtn.addEventListener('click', async () => {
        const pwd = (document.getElementById('passwordPromptInput')?.value || '').trim();
        if (!passwordPromptCallback) return;
        const result = await passwordPromptCallback(pwd);
        if (result) hidePasswordPrompt();
    });
    const passwordPromptCancelBtn = document.getElementById('passwordPromptCancelBtn');
    if (passwordPromptCancelBtn) passwordPromptCancelBtn.addEventListener('click', hidePasswordPrompt);
    const passwordPromptInput = document.getElementById('passwordPromptInput');
    if (passwordPromptInput) passwordPromptInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('passwordPromptConfirmBtn')?.click(); });
}

function handleOrientationOrResize() {
    const wasPortrait = isMobile() && !isLandscape();
    updateRotateOverlay();
    if (isMobile() && !isLandscape() && gameRunning) {
        gamePaused = true;
        stopBGM();
    }
    if (isMobile() && isLandscape()) {
        if (gameRunning) {
            gamePaused = false;
            startBGM(currentStage);
        }
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
window.addEventListener('orientationchange', () => {
    if (isMobile()) enforceMobileLandscapeFullscreen();
    handleOrientationOrResize();
});
window.addEventListener('resize', () => {
    if (isMobile()) {
        enforceMobileLandscapeFullscreen();
        handleOrientationOrResize();
    } else {
        handleOrientationOrResize();
    }
    updateFullscreenButton();
    updateExitButton();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (gameRunning) {
            gamePaused = true;
            stopBGM();
        }
    } else {
        if (isMobile()) enforceMobileLandscapeFullscreen();
        if (gameRunning && !(isMobile() && !isLandscape())) {
            gamePaused = false;
            startBGM(currentStage);
        }
    }
});

async function init() {
    if (!isLoginScreenVisible()) tryLockLandscape();
    updateRotateOverlay();
    updateFullscreenButton();
    if (isMobile() && isLandscape()) applyMobileLandscapeDimensions();
    applyOptions();
    if (STAGE6_ONLY || BOSS6_TEST || BOSS5_TEST || BOSS4_TEST || STAGE4_ONLY || STAGE3_ONLY) {
        currentStage = BOSS4_TEST ? 4 : (BOSS5_TEST ? 5 : (BOSS6_TEST ? 6 : (STAGE4_ONLY ? 4 : 3)));
        currentAccount = BOSS4_TEST ? 'boss4_test' : (BOSS5_TEST ? 'boss5_test' : (BOSS6_TEST ? 'boss6_test' : (STAGE4_ONLY ? 'stage4_test' : 'stage3_test')));
        bricks = createBricks();
        paddle.x = (canvas.width - paddle.width) / 2;
        paddle.y = canvas.height - 40;
        balls = [{ x: canvas.width / 2, y: paddle.y - BALL_RADIUS - 5, dx: 0, dy: 0, radius: BALL_RADIUS }];
        ballLaunched = false;
        mouseX = canvas.width / 2;
        updateStageUI(currentStage);
        document.getElementById('startOverlay')?.classList.remove('hidden');
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
    document.getElementById('startOverlay')?.classList.add('hidden');
    document.getElementById('loginOverlay')?.classList.remove('hidden');
    startLoginBGMOrSchedule();
    try {
        await refreshAccountList();
    } catch (e) {
        console.warn('초기 데이터 로드 오류:', e);
    }
    updateOptionsButtonVisibility();
    updateExitButton();
    setupLoginHandlers();
    draw();
}

window.doLogin = doLogin;
window.showCreateAccountModal = showCreateAccountModal;
window.showFindPasswordModal = showFindPasswordModal;
window.handleDeleteAccount = handleDeleteAccount;
window.handleCreateAccount = handleCreateAccount;
window.hideCreateAccountModal = hideCreateAccountModal;
window.handleFindPassword = handleFindPassword;
window.showEditProfileFromLogin = showEditProfileFromLogin;
window.addEventListener('online', () => { refreshAccountList(); });

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
