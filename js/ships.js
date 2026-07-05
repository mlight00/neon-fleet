// 주인공 함선 4티어 실루엣 + 엔진 화염 (비주얼 스펙: 부록 §1, 진화 티어는 balance.evolution)
// 모든 좌표는 로컬 (0,0) 중심, 기수 = -y. 몸체는 프리렌더, 화염은 매 프레임 글로우 없이 그린다.
import { COLORS, makeSprite } from './render.js';
import { getSprite } from './sprites.js';

const BODY_FILL = 'rgba(63,245,224,0.12)';
const COCKPIT = 'rgba(255,255,255,0.85)';

function stroke(ctx, w = 2) {
  ctx.strokeStyle = COLORS.ally;
  ctx.lineWidth = w;
  ctx.stroke();
}

function poly(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (close) ctx.closePath();
}

function dot(ctx, x, y, r, color = COLORS.ally) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ── T1 스카웃: 제비꼬리 드론 (전장 14)
function drawScout(ctx) {
  ctx.shadowColor = COLORS.ally;
  ctx.shadowBlur = 8;
  poly(ctx, [[0, -7], [-5, 5], [0, 2], [5, 5]]);
  ctx.fillStyle = COLORS.ally;
  ctx.fill();
}

// ── T2 인터셉터: X윙형 4날개 (전장 32)
function drawInterceptor(ctx) {
  ctx.shadowColor = COLORS.ally;
  ctx.shadowBlur = 10;
  // 동체
  poly(ctx, [[0, -16], [-3, -9], [-3, 5], [-1, 9], [1, 9], [3, 5], [3, -9]]);
  ctx.fillStyle = BODY_FILL;
  ctx.fill();
  stroke(ctx, 2);
  // 날개 4장 (X자)
  for (const [x1, y1, x2, y2] of [[-3, -3, -15, 6], [3, -3, 15, 6], [-3, 3, -12, 11], [3, 3, 12, 11]]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    stroke(ctx, 2.5);
  }
  // 날개끝 발광점
  for (const [x, y] of [[-15, 6], [15, 6], [-12, 11], [12, 11]]) dot(ctx, x, y, 2);
  // 콕핏
  poly(ctx, [[0, -9], [-2, -5], [0, -2], [2, -5]]);
  ctx.fillStyle = COCKPIT;
  ctx.fill();
}

// ── T3 스트라이커: 트윈테일 + 캐너드 + 주 날개 + 나셀 2 (전장 48)
function drawStriker(ctx) {
  ctx.shadowColor = COLORS.ally;
  ctx.shadowBlur = 10;
  // 동체 (트윈테일 W자 꼬리)
  poly(ctx, [[0, -24], [-4, -12], [-4, 8], [-8, 17], [-3, 13], [0, 16], [3, 13], [8, 17], [4, 8], [4, -12]]);
  ctx.fillStyle = BODY_FILL;
  ctx.fill();
  stroke(ctx, 2);
  // 캐너드 (앞 소형 날개)
  for (const s of [-1, 1]) {
    poly(ctx, [[s * 4, -13], [s * 11, -8], [s * 4, -9]]);
    ctx.fillStyle = 'rgba(63,245,224,0.35)';
    ctx.fill();
  }
  // 주 날개
  for (const s of [-1, 1]) {
    poly(ctx, [[s * 4, -2], [s * 22, 9], [s * 18, 13], [s * 4, 7]]);
    ctx.fillStyle = BODY_FILL;
    ctx.fill();
    stroke(ctx, 2);
    // 날개끝 캐논 (앞으로 돌출)
    ctx.beginPath();
    ctx.moveTo(s * 21, 10);
    ctx.lineTo(s * 21, 3);
    stroke(ctx, 2);
    dot(ctx, s * 22, 9, 2.5);
  }
  // 엔진 나셀 2개
  for (const s of [-1, 1]) {
    ctx.strokeStyle = COLORS.ally;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(s * 9 - 2, 12, 4, 7);
  }
  // 콕핏
  poly(ctx, [[0, -14], [-2.5, -8], [0, -4], [2.5, -8]]);
  ctx.fillStyle = COCKPIT;
  ctx.fill();
}

// ── T4 커리어: 항공모함 (전장 76 × 전폭 60)
function drawCarrier(ctx) {
  ctx.shadowColor = COLORS.ally;
  ctx.shadowBlur = 12;
  // 좌우 비행갑판
  for (const s of [-1, 1]) {
    poly(ctx, [[s * 10, -10], [s * 28, -4], [s * 28, 24], [s * 10, 20]]);
    ctx.fillStyle = BODY_FILL;
    ctx.fill();
    stroke(ctx, 2);
    // 활주로 라인
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(s * 19, -2);
    ctx.lineTo(s * 19, 22);
    stroke(ctx, 1);
    ctx.globalAlpha = 1;
  }
  // 중앙 함체
  poly(ctx, [[0, -38], [-8, -26], [-10, 18], [-6, 32], [6, 32], [10, 18], [8, -26]]);
  ctx.fillStyle = 'rgba(63,245,224,0.18)';
  ctx.fill();
  stroke(ctx, 2.5);
  // 함교 + 안테나
  ctx.strokeStyle = COLORS.ally;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-3, -8, 6, 8);
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(0, -14);
  ctx.stroke();
  // 측면 포탑
  dot(ctx, -10, 0, 2);
  dot(ctx, 10, 0, 2);
  // 콕핏 코어
  dot(ctx, 0, -20, 3, COCKPIT);
}

// 티어별 정의: 스프라이트 크기, 노즐(화염), 주포 마운트(발사 위치 — 진화 체감의 핵심), 편대 이격 반경
// 좌표는 Gemini 쇼케이스 data.ts의 turretCoords/engineCoords(%)를 로컬 px로 환산한 값.
export const SHIP_DEFS = [
  {
    name: 'scout', w: 34, h: 34, draw: drawScout,
    nozzles: [{ x: 0, y: 12, len: 6 }],
    mounts: [{ x: 0, y: -12 }],
    clearR: 12,
  },
  {
    name: 'interceptor', w: 60, h: 60, draw: drawInterceptor,
    nozzles: [{ x: -6, y: 21, len: 9 }, { x: 6, y: 21, len: 9 }],
    mounts: [{ x: -9, y: -12 }, { x: 9, y: -12 }],
    clearR: 24,
  },
  {
    name: 'striker', w: 78, h: 78, draw: drawStriker,
    nozzles: [{ x: -12, y: 31, len: 10 }, { x: 12, y: 31, len: 10 }],
    mounts: [{ x: -20, y: -8 }, { x: -8, y: -23 }, { x: 8, y: -23 }, { x: 20, y: -8 }],
    clearR: 34,
  },
  {
    name: 'carrier', w: 104, h: 104, draw: drawCarrier,
    nozzles: [{ x: -23, y: 44, len: 9 }, { x: -8, y: 44, len: 9 }, { x: 8, y: 44, len: 9 }, { x: 23, y: 44, len: 9 }],
    mounts: [{ x: -31, y: -5 }, { x: -16, y: -26 }, { x: 0, y: -36 }, { x: 16, y: -26 }, { x: 31, y: -5 }],
    clearR: 48,
    deckLights: [[-31, -10], [-31, 2], [-31, 14], [31, -10], [31, 2], [31, 14]],
  },
  {
    // T5 드레드노트 (페인티드 아트 전용 — 폴백은 커리어 확대)
    name: 'dreadnought', w: 132, h: 110, draw: drawCarrier,
    nozzles: [{ x: -52, y: 46, len: 10 }, { x: -26, y: 50, len: 11 }, { x: 0, y: 52, len: 12 }, { x: 26, y: 50, len: 11 }, { x: 52, y: 46, len: 10 }],
    mounts: [{ x: -38, y: -38 }, { x: -14, y: -46 }, { x: 14, y: -46 }, { x: 38, y: -38 }, { x: -58, y: -6 }, { x: 58, y: -6 }],
    clearR: 58,
  },
  {
    // T6 타이탄 (최종 기함 — 쌍동체 + 중앙 대구경포)
    name: 'titan', w: 120, h: 172, draw: drawCarrier,
    nozzles: [{ x: -30, y: 76, len: 12 }, { x: 0, y: 82, len: 14 }, { x: 30, y: 76, len: 12 }],
    mounts: [{ x: 0, y: -84 }, { x: -20, y: -70 }, { x: 20, y: -70 }, { x: -40, y: -34 }, { x: 40, y: -34 }, { x: -48, y: 6 }, { x: 48, y: 6 }, { x: 0, y: -34 }],
    clearR: 64,
  },
];

const spriteCache = [];
export function shipSprite(tier) {
  // Gemini 아트 스프라이트 우선, 로드 전/실패 시 기존 절차적 드로잉 폴백
  const gem = getSprite('A' + (tier + 1));
  if (gem) return gem;
  if (!spriteCache[tier]) {
    const d = SHIP_DEFS[tier];
    spriteCache[tier] = makeSprite(d.w, d.h, d.draw);
  }
  return spriteCache[tier];
}

/** 엔진 배기 화염: 2겹 삼각형, 글로우 없음 (매 프레임). 로컬 좌표(함선 변환 안)에서 호출. */
export function drawFlames(ctx, tier, t) {
  const d = SHIP_DEFS[tier];
  for (let i = 0; i < d.nozzles.length; i++) {
    const n = d.nozzles[i];
    const len = n.len * (0.75 + 0.25 * Math.sin(t * 38 + i * 2.1) + 0.15 * Math.random());
    // 외피 (청록)
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = COLORS.ally;
    poly(ctx, [[n.x - 3, n.y], [n.x + 3, n.y], [n.x, n.y + len]]);
    ctx.fill();
    // 코어 (흰색)
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    poly(ctx, [[n.x - 1.2, n.y], [n.x + 1.2, n.y], [n.x, n.y + len * 0.6]]);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** 커리어 유도등: 순차로 흐르는 점멸 (로컬 좌표) */
export function drawDeckLights(ctx, tier, t) {
  const d = SHIP_DEFS[tier];
  if (!d.deckLights) return;
  ctx.fillStyle = COLORS.ally;
  d.deckLights.forEach(([x, y], i) => {
    ctx.globalAlpha = 0.3 + 0.7 * (((t * 2 - i * 0.33) % 1 + 1) % 1);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  });
  ctx.globalAlpha = 1;
}
