// 주인공 함선 4티어 실루엣 + 엔진 화염 (비주얼 스펙: 부록 §1, 진화 티어는 balance.evolution)
// 모든 좌표는 로컬 (0,0) 중심, 기수 = -y. 몸체는 프리렌더, 화염은 매 프레임 글로우 없이 그린다.
import { COLORS, makeSprite } from './render.js';
import { getSprite } from './sprites.js';
import { flagshipProfile } from './creative-direction.js';

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
const SHIP_DEFS_RAW = [
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

// 진화 크기 개편: 상위 티어일수록 기함이 화면을 가려 회피가 불가능했다.
// 스카웃(T1)은 그대로 두고, 상위 티어의 스프라이트·주포·노즐·궤도 좌표를 같은 비율로 축소해
// "진화해도 탄을 피할 수 있는" 크기로 유지한다. 비율 = 새 크기 / 기존 크기 (SPRITE_SIZES 기준).
const SHIP_SCALE = [1.0, 0.73, 0.67, 0.58, 0.52, 0.44];
export const SHIP_DEFS = SHIP_DEFS_RAW.map((d, t) => {
  const s = SHIP_SCALE[t] ?? 1;
  return {
    ...d,
    w: Math.round(d.w * s), h: Math.round(d.h * s),
    clearR: Math.round(d.clearR * s),
    mounts: d.mounts.map((m) => ({ x: m.x * s, y: m.y * s })),
    nozzles: d.nozzles.map((n) => ({ x: n.x * s, y: n.y * s, len: n.len * s })),
    deckLights: d.deckLights ? d.deckLights.map(([x, y]) => [x * s, y * s]) : undefined,
  };
});

const spriteCache = [];
const baseSpriteCache = [];

function drawCapitalBase(ctx, d, tier) {
  const halfW = d.w * 0.43, halfH = d.h * 0.43;
  ctx.save();
  ctx.shadowColor = COLORS.ally; ctx.shadowBlur = 8;
  // 상위 함선은 기존 A5/A6 이미지에 섞인 라벨·부속 오브젝트를 쓰지 않고 정규화 좌표로 새 실루엣을 만든다.
  const twin = tier >= 5;
  ctx.fillStyle = 'rgba(18,43,55,.94)'; ctx.strokeStyle = '#88f7ed'; ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(0, -halfH);
  ctx.lineTo(-halfW * 0.22, -halfH * 0.46);
  ctx.lineTo(-halfW, halfH * 0.2);
  ctx.lineTo(-halfW * 0.46, halfH * 0.12);
  ctx.lineTo(-halfW * 0.27, halfH);
  ctx.lineTo(0, halfH * 0.7);
  ctx.lineTo(halfW * 0.27, halfH);
  ctx.lineTo(halfW * 0.46, halfH * 0.12);
  ctx.lineTo(halfW, halfH * 0.2);
  ctx.lineTo(halfW * 0.22, -halfH * 0.46);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (twin) {
    ctx.fillStyle = 'rgba(30,70,78,.88)';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.roundRect(side * halfW * 0.58 - halfW * 0.12, -halfH * 0.35, halfW * 0.24, halfH * 1.02, halfW * 0.08); ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(38,82,88,.7)';
    ctx.fillRect(-halfW * 0.72, -halfH * 0.02, halfW * 1.44, halfH * 0.2);
  }
  ctx.fillStyle = '#eaffff';
  ctx.beginPath(); ctx.moveTo(0, -halfH * 0.62); ctx.lineTo(-halfW * 0.1, -halfH * 0.32); ctx.lineTo(0, -halfH * 0.12); ctx.lineTo(halfW * 0.1, -halfH * 0.32); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** 무기 그림이 합쳐지지 않은 중립 함체. 기함은 이 위에 지휘 프레임과 무기 장착물을 조립한다. */
export function shipBaseSprite(tier) {
  // A5/A6 원본에는 잘린 글자·주변 오브젝트가 남아 있어 상위 2티어는 새 절차적 함체를 사용한다.
  const gem = tier < 4 ? getSprite('A' + (tier + 1)) : null;
  if (gem) return gem;
  if (!baseSpriteCache[tier]) {
    const d = SHIP_DEFS[tier];
    baseSpriteCache[tier] = makeSprite(d.w, d.h, tier >= 4 ? (ctx) => drawCapitalBase(ctx, d, tier) : d.draw);
  }
  return baseSpriteCache[tier];
}

export function shipSprite(tier, weapon) {
  // 무기별 함선 변형 우선(A{n}{V=발칸/L=레이저/H=호밍}) → 기존 A{n} → 절차적 드로잉 폴백
  const wc = weapon === 'laser' ? 'L' : weapon === 'homing' ? 'H' : 'V';
  const gem = getSprite('A' + (tier + 1) + wc) || getSprite('A' + (tier + 1));
  if (gem) return gem;
  if (!spriteCache[tier]) {
    const d = SHIP_DEFS[tier];
    spriteCache[tier] = makeSprite(d.w, d.h, d.draw);
  }
  return spriteCache[tier];
}

/**
 * NF-0 LUMEN 전용 지휘 프레임.
 * 호위 드론의 청록색과 겹치지 않는 금빛 척추·함교·티어 핀으로 기함을 즉시 구분한다.
 */
export function drawCommandFrame(ctx, tier, t) {
  const d = SHIP_DEFS[tier];
  const p = flagshipProfile(tier);
  const pulse = 0.72 + 0.28 * Math.sin(t * 3.2);
  const top = -d.h * 0.34, bottom = d.h * 0.28;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,205,92,${0.58 + pulse * 0.24})`;
  ctx.lineWidth = 1.4 + tier * 0.12;
  ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(0, bottom); ctx.stroke();
  ctx.fillStyle = '#fff4c6';
  ctx.beginPath(); ctx.moveTo(0, top - 5); ctx.lineTo(-3.6, top + 2); ctx.lineTo(0, top + 7); ctx.lineTo(3.6, top + 2); ctx.closePath(); ctx.fill();

  const pins = p.commandLights;
  for (let i = 0; i < pins; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const x = side * (d.clearR * (0.34 + row * 0.1));
    const y = -d.clearR * 0.1 + row * 5;
    ctx.globalAlpha = 0.45 + pulse * 0.5;
    ctx.fillStyle = i < 2 ? '#fff4c6' : '#ffbd4a';
    ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  }
  ctx.globalAlpha = 0.2 + pulse * 0.1;
  ctx.strokeStyle = '#ffbd4a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, d.clearR * p.frameScale, d.clearR * p.frameScale * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawVulcanRig(ctx, m, size, t, advanced) {
  const recoil = Math.max(0, Math.sin(t * 22)) * (advanced ? 1.8 : 0.9);
  ctx.strokeStyle = '#5dfff0'; ctx.lineWidth = advanced ? 2.2 : 1.7;
  ctx.beginPath(); ctx.moveTo(m.x - size * 0.16, m.y + recoil); ctx.lineTo(m.x - size * 0.16, m.y - size);
  ctx.moveTo(m.x + size * 0.16, m.y + recoil); ctx.lineTo(m.x + size * 0.16, m.y - size); ctx.stroke();
  ctx.fillStyle = '#d8fffb'; ctx.fillRect(m.x - 1.5, m.y - size - 2, 3, 3);
}

function drawLaserRig(ctx, m, size, t, advanced) {
  const pulse = 0.55 + 0.45 * Math.sin(t * 6 + m.x);
  ctx.strokeStyle = advanced ? '#ffffff' : '#a8f0ff'; ctx.lineWidth = advanced ? 2.2 : 1.5;
  ctx.beginPath(); ctx.moveTo(m.x, m.y + size * 0.2); ctx.lineTo(m.x, m.y - size); ctx.stroke();
  ctx.globalAlpha = 0.48 + pulse * 0.42; ctx.fillStyle = '#a8f0ff';
  ctx.beginPath(); ctx.moveTo(m.x, m.y - size - 4); ctx.lineTo(m.x - 3, m.y - size); ctx.lineTo(m.x, m.y - size + 4); ctx.lineTo(m.x + 3, m.y - size); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawHomingRig(ctx, m, size, t, advanced) {
  const w = advanced ? 7 : 5.5, h = size * 0.7;
  ctx.fillStyle = 'rgba(255,217,61,.22)'; ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.roundRect(m.x - w / 2, m.y - h * 0.7, w, h, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff3a8';
  const cells = advanced ? 3 : 2;
  for (let i = 0; i < cells; i++) ctx.fillRect(m.x - w / 2 + 1.5 + i * ((w - 3) / cells), m.y - h * 0.55, 1.2, 2.2);
}

/** 현재 무기·레벨·진화가 선체 위 장착물의 형태와 크기로 보인다. */
export function drawWeaponRig(ctx, tier, weapon, weaponLv, t, evolutionId = null, superId = null) {
  const d = SHIP_DEFS[tier];
  const p = flagshipProfile(tier);
  const advanced = !!evolutionId;
  const superAdvanced = !!superId;
  const mountCount = Math.min(d.mounts.length, Math.max(1, 1 + tier + Math.max(0, weaponLv - 1)));
  const size = (4.8 + weaponLv * 1.45 + tier * 0.38) * p.mountPresence * (advanced ? 1.16 : 1) * (superAdvanced ? 1.12 : 1);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < mountCount; i++) {
    const m = d.mounts[i];
    if (weapon === 'laser') drawLaserRig(ctx, m, size, t, advanced || superAdvanced);
    else if (weapon === 'homing') drawHomingRig(ctx, m, size, t, advanced || superAdvanced);
    else drawVulcanRig(ctx, m, size, t, advanced || superAdvanced);
  }
  if (superAdvanced) {
    ctx.globalAlpha = 0.28 + Math.sin(t * 5) * 0.08; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, -d.clearR * 0.08, d.clearR * 0.82, d.clearR * 0.48, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** U1~U5 조립 연출: 에너지 배선 → 장착 브래킷 → 점화. */
export function drawUpgradeSequence(ctx, tier, fx) {
  if (!fx || fx.t <= 0 || fx.max <= 0) return;
  const d = SHIP_DEFS[tier];
  const elapsed = Math.max(0, Math.min(1, 1 - fx.t / fx.max));
  const grade = fx.grade || 1;
  const radius = d.clearR + 6 + grade * 3;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (elapsed < 0.28) {
    const p = elapsed / 0.28;
    ctx.strokeStyle = `rgba(255,217,61,${0.2 + p * 0.7})`; ctx.lineWidth = 1.5 + grade * 0.25;
    ctx.beginPath(); ctx.arc(0, 0, radius * (1.45 - p * 0.45), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke();
  } else if (elapsed < 0.72) {
    const p = (elapsed - 0.28) / 0.44;
    ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      const x = side * radius * (1.35 - p * 0.35);
      ctx.beginPath(); ctx.moveTo(x, -radius * 0.55); ctx.lineTo(x - side * radius * 0.22, -radius * 0.55); ctx.lineTo(x - side * radius * 0.22, radius * 0.55); ctx.lineTo(x, radius * 0.55); ctx.stroke();
    }
    for (let i = 0; i < 2 + grade; i++) {
      const a = (i / (2 + grade)) * Math.PI * 2 + p * 2;
      ctx.fillStyle = '#fff5c7'; ctx.fillRect(Math.cos(a) * radius - 1, Math.sin(a) * radius * 0.65 - 1, 2, 2);
    }
  } else {
    const p = (elapsed - 0.72) / 0.28;
    ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5 - p * 3;
    ctx.beginPath(); ctx.arc(0, 0, radius * (0.75 + p * 1.1), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - p) * 0.35; ctx.fillStyle = fx.color || '#ffd93d'; ctx.beginPath(); ctx.arc(0, 0, radius * (1.2 + p), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
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
