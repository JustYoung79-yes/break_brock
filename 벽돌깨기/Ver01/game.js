const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 폴더 구조에 따른 경로 (Ver01/Ver02 기준 상위 폴더 참조)
const PATH = {
    image: '../그림/',
    bgm: '../배경음악/'
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
    itemBlockMin: 3,
    itemBlockMax: 5
};

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
let hasBulletPower = false;
let savedGameState = null;
let currentAccount = '';

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

// 아이템 효과 표시 이름 (지속형)
const ITEM_DISPLAY_NAMES = {
    paddle2x: '판 2배',
    ballSlow: '공 느림',
    bullet: '총알',
    magnet: '자석'
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

    const itemCount = Math.max(options.itemBlockMin, Math.min(options.itemBlockMax, Math.floor(validPositions.length * 0.15) + 1));

    const itemPositions = [];
    const shuffled = [...validPositions].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(itemCount, shuffled.length); i++) {
        itemPositions.push(shuffled[i]);
    }

    const bricks = [];
    for (let row = 0; row < rows; row++) {
        bricks[row] = [];
        for (let col = 0; col < cols; col++) {
            if (!isBrickInLayout(currentStage, row, col, rows, cols)) {
                bricks[row][col] = null;
                continue;
            }
            const isItemBlock = itemPositions.includes(`${row},${col}`);
            const itemType = isItemBlock ? ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)] : null;
            const finalType = (itemType === 'LIFE' && Math.random() > 0.2) ? ITEM_TYPES.filter(t => t !== 'LIFE')[Math.floor(Math.random() * 7)] : itemType;
            bricks[row][col] = {
                x: BRICK_OFFSET_LEFT + col * (brickWidth + padding),
                y: BRICK_OFFSET_TOP + row * (brickHeight + padding),
                width: brickWidth,
                height: brickHeight,
                visible: true,
                color: finalType ? '#ffd700' : brickColors[row % brickColors.length],
                isItem: !!finalType,
                itemType: finalType
            };
        }
    }
    return bricks;
}

let bricks = [];

// 입력 처리
let mouseX = canvas.width / 2;
let keys = {};
let lastInputMethod = 'mouse';

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    mouseX = (e.clientX - rect.left) * scaleX;
    lastInputMethod = 'mouse';
});

document.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
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

function launchBall() {
    if (ballLaunched || balls.length === 0) return;
    ballStickTimer = 0;
    const speed = options.ballSpeed;
    balls.forEach(b => {
        b.dx = speed * (Math.random() > 0.5 ? 1 : -1);
        b.dy = -speed;
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
    const dingNotes = [880, 1100, 1320, 1760];
    dingNotes.forEach((freq, i) => {
        setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.08);
        }, i * 60);
    });
}

function applyItemEffect(type) {
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
            balls.forEach(b => {
                b.dx *= 2;
                b.dy *= 2;
            });
        }
        return item.duration > 0;
    });
}

function updateFallingItems() {
    const magnetActive = activeItems.some(i => i.type === 'magnet');
    fallingItems = fallingItems.filter(item => {
        if (magnetActive) {
            const paddleCenter = paddle.x + paddle.width / 2;
            item.x += (paddleCenter - (item.x + item.width/2)) * 0.05;
        }
        item.y += item.dy;
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

function updateBullets() {
    bullets = bullets.filter(b => {
        b.y += b.dy;
        if (b.y < 0) return false;
        let hit = false;
        outer: for (const row of bricks) {
            for (const brick of row) {
                if (brick && brick.visible && b.x + b.width > brick.x && b.x < brick.x + brick.width &&
                    b.y < brick.y + brick.height && b.y + b.height > brick.y) {
                    brick.visible = false;
                    score += brick.isItem ? 25 : 10;
                    document.getElementById('score').textContent = score;
                    if (brick.isItem && brick.itemType) spawnFallingItem(brick.x + brick.width/2, brick.y, brick.itemType);
                    hit = true;
                    break outer;
                }
            }
        }
        return !hit && b.y > 0;
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

function updateBall() {
    updateFallingItems();
    updateBullets();

    if (!ballLaunched && balls.length > 0) {
        balls[0].x = paddle.x + paddle.width / 2;
        balls[0].y = paddle.y - BALL_RADIUS - 5;
        ballStickTimer++;
        if (ballStickTimer >= 60 * BALL_AUTO_LAUNCH_SEC) {
            launchBall();
        }
        return;
    }

    for (let bi = balls.length - 1; bi >= 0; bi--) {
        const ball = balls[bi];
        ball.x += ball.dx;
        ball.y += ball.dy;

        if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.dx = -ball.dx;
        if (ball.y - ball.radius < 0) ball.dy = -ball.dy;

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
        }

        if (ball.y + ball.radius > canvas.height) {
            balls.splice(bi, 1);
            if (balls.length === 0) {
                lives--;
                document.getElementById('lives').textContent = lives;
                if (lives <= 0) {
                    gameOver();
                } else {
                    gameRunning = false;
                    cancelAnimationFrame(animationId);
                    setTimeout(() => {
                        resetBall();
                        gameRunning = true;
                        gameLoop();
                    }, 1000);
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
                    brick.visible = false;
                    score += brick.isItem ? 25 : 10;
                    document.getElementById('score').textContent = score;
                    if (brick.isItem && brick.itemType) {
                        spawnFallingItem(brick.x + brick.width/2, brick.y, brick.itemType);
                    }
                    const overlapLeft = (ball.x + ball.radius) - brick.x;
                    const overlapRight = (brick.x + brick.width) - (ball.x - ball.radius);
                    const overlapTop = (ball.y + ball.radius) - brick.y;
                    const overlapBottom = (brick.y + brick.height) - (ball.y - ball.radius);
                    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                    if (minOverlap === overlapLeft || minOverlap === overlapRight) ball.dx = -ball.dx;
                    else ball.dy = -ball.dy;
                    ballHit = true;
                }
            });
        });
    });

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
    if (msgEl && overlayEl) {
        msgEl.textContent = '스테이지 클리어!';
        overlayEl.classList.remove('hidden');
    }
    setTimeout(() => {
        currentStage++;
        document.getElementById('stage').textContent = currentStage;
        bricks = createBricks();
        resetBall();
        showStageStartAndResume();
    }, 2000);
}

function showStageStartAndResume() {
    const msgEl = document.getElementById('stageMsgText');
    const overlayEl = document.getElementById('stageMsgOverlay');
    if (msgEl && overlayEl) {
        msgEl.textContent = STAGE_NAMES[currentStage] || `스테이지 ${currentStage}`;
        overlayEl.classList.remove('hidden');
    }
    startBGM(currentStage);
    setTimeout(() => {
        if (overlayEl) overlayEl.classList.add('hidden');
        gameRunning = true;
        gamePaused = false;
        gameLoop();
    }, 2000);
}

const bagImage = new Image();
bagImage.onerror = () => { bagImage.src = PATH.image + '자루.png'; };
bagImage.src = PATH.image + '자루 TP.png';

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
        const w = item.width || 48;
        const h = item.height || 56;
        if (bagImage.complete && bagImage.naturalWidth > 0) {
            ctx.drawImage(bagImage, item.x, item.y, w, h);
        } else {
            drawBagShape(item.x, item.y, w, h);
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
        const name = ITEM_DISPLAY_NAMES[item.type] || item.type;
        const sec = Math.ceil(item.duration / 60);
        const text = `${name} ${sec}초`;
        const w = ctx.measureText(text).width + 16;
        ctx.fillStyle = 'rgba(102, 126, 234, 0.85)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y - 8, w, lineHeight, 4);
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
                ctx.fillStyle = brick.color;
                ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
                ctx.strokeStyle = brick.isItem ? '#fff' : 'rgba(0,0,0,0.3)';
                ctx.lineWidth = brick.isItem ? 2 : 1;
                ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
                if (brick.isItem) {
                    if (bagImage.complete && bagImage.naturalWidth > 0) {
                        ctx.drawImage(bagImage, brick.x, brick.y, brick.width, brick.height);
                    } else {
                        drawBagShape(brick.x, brick.y, brick.width, brick.height);
                    }
                }
            }
        });
    });
}

function draw() {
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

    drawBricks();
    drawPaddle();
    drawFallingItems();
    drawBullets();
    drawBall();
    drawActiveItemEffects();
}

function gameLoop() {
    if (!gameRunning) return;
    if (gamePaused) {
        animationId = requestAnimationFrame(gameLoop);
        return;
    }

    updatePaddle();
    updateActiveItems();
    updateBall();
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
    const screenSize = document.getElementById('screenSize').value;
    if (screenSize === 'small') { options.canvasWidth = 640; options.canvasHeight = 480; }
    else if (screenSize === 'large') { options.canvasWidth = 960; options.canvasHeight = 720; }
    else { options.canvasWidth = 800; options.canvasHeight = 600; }
    const itemCount = document.getElementById('itemBlockCount')?.value || '3-5';
    const [min, max] = itemCount.split('-').map(Number);
    options.itemBlockMin = min;
    options.itemBlockMax = max;
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
    activeItems = [];
    if (isNewGame) {
        score = 0;
        lives = 3;
        currentStage = 1;
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
const BGM_FILES = [1, 2, 3, 4, 5, 5].map(n => `${PATH.bgm}Stage${n}.mp3`);

function startBGM(stage) {
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

const RANKING_KEY = 'brickBreakerRanking';
const MAX_RANKING = 10;

function getRanking() {
    try {
        return JSON.parse(localStorage.getItem(RANKING_KEY) || '[]');
    } catch { return []; }
}

function saveToRanking(score) {
    const ranking = getRanking();
    ranking.push({ score, date: new Date().toISOString() });
    ranking.sort((a, b) => b.score - a.score);
    localStorage.setItem(RANKING_KEY, JSON.stringify(ranking.slice(0, MAX_RANKING)));
    const rank = ranking.findIndex(r => r.score === score) + 1;
    return rank > 0 ? rank : 1;
}

function renderRanking(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const ranking = getRanking();
    el.innerHTML = ranking.length ? '<h3>🏆 점수 순위</h3><ol>' +
        ranking.slice(0, 5).map((r, i) => `<li>${r.score}점</li>`).join('') + '</ol>' : '';
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
    document.getElementById('screenSize').value =
        options.canvasWidth === 640 ? 'small' : options.canvasWidth === 960 ? 'large' : 'medium';
    const itemEl = document.getElementById('itemBlockCount');
    if (itemEl) itemEl.value = options.itemBlockMin + '-' + options.itemBlockMax;
    document.getElementById('optionsPanel').classList.remove('hidden');
}

document.getElementById('optionsBtn').addEventListener('click', openOptions);

document.getElementById('optionsCloseBtn').addEventListener('click', () => {
    if (gameRunning) gamePaused = false;
    applyOptions();
    if (gameRunning) {
        startBGM(currentStage);
        paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
        mouseX = Math.max(0, Math.min(canvas.width, mouseX));
    } else {
        paddle.x = (canvas.width - paddle.width) / 2;
        mouseX = canvas.width / 2;
        bricks = createBricks();
        draw();
    }
    document.getElementById('optionsPanel').classList.add('hidden');
});

document.getElementById('paddleSpeed').addEventListener('input', (e) => {
    document.getElementById('paddleSpeedVal').textContent = e.target.value;
});
document.getElementById('ballSpeed').addEventListener('input', (e) => {
    document.getElementById('ballSpeedVal').textContent = e.target.value;
});

document.getElementById('startBtn').addEventListener('click', () => startGame(true));
document.getElementById('continueBtn').addEventListener('click', continueGame);
document.getElementById('newGameBtn').addEventListener('click', restartGame);
document.getElementById('playAgainBtn').addEventListener('click', restartGame);

function doLogin() {
    const input = document.getElementById('accountInput');
    const name = (input?.value || '').trim();
    if (!name) {
        alert('계정 이름을 입력하세요.');
        return;
    }
    currentAccount = name;
    document.getElementById('loginOverlay').classList.add('hidden');
    const accDisplay = document.getElementById('currentAccountDisplay');
    if (accDisplay) accDisplay.textContent = '(' + name + ')';
    document.getElementById('startOverlay').classList.remove('hidden');
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('accountInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doLogin();
});

function handleResetRanking() {
    clearRanking();
    resetRankingUI();
}
document.getElementById('resetRankingBtn').addEventListener('click', handleResetRanking);

function init() {
    applyOptions();
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
    draw();
}

init();
