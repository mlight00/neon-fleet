// ── Neon Fleet 실제 3D — 2D 월드 ↔ 3D 전장 좌표, 함미 추적 카메라, 입력 역변환, 씬모델 ──
//  작업지시서 §8. 이 모듈은 Three.js·DOM 미의존 → Node에서 좌표·역변환·스냅샷을 실제로 검증한다.
//  (SHIP_DEFS·BAL 은 순수 데이터 import — Opus5 §5.1 실드론 공식이 요구)
//
//  좌표 계약(§8):
//    X = (worldX - squadX) * SCALE_X     // 플레이어 상대 가로(기함은 항상 X=0)
//    Z = (squadY - worldY) * SCALE_Z     // 진행 방향(앞쪽이 +Z, 카메라에서 멀어짐)
//    Y = visualAltitude                  // 시각용 높이. 충돌 판정엔 절대 쓰지 않음(§8)
//  기존 worldX/worldY 는 수정하지 않는다. 게임의 진실은 계속 2D이다(§3.1).
import { SHIP_DEFS } from './ships.js';
import { BAL } from './balance.js';

export const SCALE_X = 0.060;   // 논리 px → 3D unit (가로)
export const SCALE_Z = 0.060;   // 논리 px → 3D unit (진행/깊이)

// 함미 추적 카메라 기하(§7). 기함 뒤·위에서 진행 방향을 바라본다. 자유 회전 없음.
//  t=1(200~220%)은 함미 추적 포즈, t→0(160%)은 조금 더 높고 뒤로 물러난 전술 근접 포즈 → 같은 t 로 부드럽게 이동.
export const CAMERA = {
  chase: { height: 6.4, dist: 9.9, lookY: -0.15, lookZ: 15.0, fov: 52 },   // t=1 — AURORA 함미·엔진이 하단에 잘리지 않게(§7 구도)
  high:  { height: 9.5, dist: 6.5, lookY: 1.2,  lookZ: 12.0, fov: 56 },   // t=0(전환 시작)
  near: 0.5,
  //  §G-30 far 확장(이사 "차지샷이 너무 짧아"): 400 이면 빔이 화면 y≈198 에서 끝나 소실점(184)에
  //   14px 못 미친다 — 끝이 잘려 "멈췄다"로 읽힌다. 실제 씬 개체는 깊이 80 이내라 far 를 늘려도
  //   가려짐 순서는 그대로고, near=0.5 대비 비율만 커진다(깊이 정밀도는 이 씬에서 문제되지 않는다).
  far: 1600,
  bankMax: 0.22,   // 기함 좌우 이동 시 최대 롤(rad) — 시각 효과
};
const lerp = (a, b, t) => a + (b - a) * t;

// ── 최소 mat4 (THREE와 같은 column-major·WebGL clip space). 입력 역변환/투영에 쓴다. ──
function perspective(fovyDeg, aspect, near, far) {
  const top = near * Math.tan((fovyDeg * Math.PI) / 360);
  const h = 2 * top, w = aspect * h;
  const x = (2 * near) / w, y = (2 * near) / h;
  const c = -(far + near) / (far - near), d = (-2 * far * near) / (far - near);
  // column-major
  return [x, 0, 0, 0,  0, y, 0, 0,  0, 0, c, -1,  0, 0, d, 0];
}
function lookAt(eye, target, up) {
  let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  // s = normalize(cross(f, up))
  let sx = fy * up[2] - fz * up[1], sy = fz * up[0] - fx * up[2], sz = fx * up[1] - fy * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
  // u = cross(s, f)
  const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
  return [
    sx, ux, -fx, 0,
    sy, uy, -fy, 0,
    sz, uz, -fz, 0,
    -(sx * eye[0] + sy * eye[1] + sz * eye[2]),
    -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
    (fx * eye[0] + fy * eye[1] + fz * eye[2]),
    1,
  ];
}
function mulMM(a, b) {
  const c = new Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
    c[col * 4 + row] = s;
  }
  return c;
}
function mulMV(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
  ];
}

/**
 * 함미 추적 카메라 상태를 만든다. THREE 카메라도 이 eye/target/fov/aspect/near/far 로 동일하게 설정한다.
 * → 여기 투영 수식과 실제 렌더 투영이 일치(§8 옵션2: 동일 수식의 해석적 역변환). 브라우저 QA에서 교차검증.
 */
export function makeChaseCamera(viewportW, viewportH, t = 1) {
  const aspect = viewportW > 0 && viewportH > 0 ? viewportW / viewportH : 1;
  const tt = Math.min(1, Math.max(0, t));
  const c = CAMERA.chase, h = CAMERA.high;
  const height = lerp(h.height, c.height, tt), dist = lerp(h.dist, c.dist, tt);
  const lookY = lerp(h.lookY, c.lookY, tt), lookZ = lerp(h.lookZ, c.lookZ, tt), fov = lerp(h.fov, c.fov, tt);
  const eye = [0, height, -dist];
  const target = [0, lookY, lookZ];
  const up = [0, 1, 0];
  const P = perspective(fov, aspect, CAMERA.near, CAMERA.far);
  const V = lookAt(eye, target, up);
  const VP = mulMM(P, V);
  return { eye, target, up, fov, aspect, near: CAMERA.near, far: CAMERA.far, VP, W: viewportW, H: viewportH, t: tt };
}

/** 3D 점(x,y,z)을 화면 픽셀로 투영. behind: 카메라 뒤(클립 w≤0)면 true. */
export function projectPoint3D(cam, x, y, z) {
  const clip = mulMV(cam.VP, [x, y, z, 1]);
  const w = clip[3];
  const behind = w <= 1e-6;
  const iw = behind ? 1e-6 : 1 / w;
  const ndcX = clip[0] * iw, ndcY = clip[1] * iw;
  return { sx: (ndcX * 0.5 + 0.5) * cam.W, sy: (1 - (ndcY * 0.5 + 0.5)) * cam.H, behind, ndcX, ndcY };
}

/** 기함(월드 x)의 화면 X. 기함은 3D 상 (X,0,0) 선 위에 있다. */
export function worldXToScreenX(cam, worldX, squadX) {
  const x3 = (worldX - squadX) * SCALE_X;
  return projectPoint3D(cam, x3, 0, 0).sx;
}

/**
 * 입력 역변환(§8): 화면 X → 기존 논리 worldX. 플레이어 평면(Y=0,Z=0 선) 위 점의 투영을 해석적으로 역변환.
 *  카메라는 롤이 없고 forward가 YZ평면에 있어 화면-X는 가로 각도에만 대응 → f(X)=screenX 는 단조 → 이분법으로 정확히 역변환.
 *  Three 객체를 직접 끌어 좌표로 쓰지 않는다(§8 금지). 오차는 이분법 허용오차(≪1px)까지.
 */
export function screenXToWorldX(cam, screenX, squadX) {
  // f(x3) = projectPoint3D(x3,0,0).sx. 화면 폭을 넉넉히 덮는 3D X 범위에서 이분법.
  const spanX = Math.max(2, (cam.far * Math.tan((cam.fov * Math.PI) / 360)) * cam.aspect); // 충분히 큰 범위
  let lo = -spanX, hi = spanX;
  const fLo = projectPoint3D(cam, lo, 0, 0).sx;
  const fHi = projectPoint3D(cam, hi, 0, 0).sx;
  const inc = fHi >= fLo; // 증가 방향
  // 화면 밖으로 나가는 클릭은 범위 끝으로 클램프
  if ((inc && screenX <= fLo) || (!inc && screenX >= fLo)) return squadX + (lo / SCALE_X);
  if ((inc && screenX >= fHi) || (!inc && screenX <= fHi)) return squadX + (hi / SCALE_X);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const f = projectPoint3D(cam, mid, 0, 0).sx;
    if ((f < screenX) === inc) lo = mid; else hi = mid;
  }
  const x3 = (lo + hi) / 2;
  return squadX + x3 / SCALE_X;
}

// ── 좌표 변환 헬퍼(3D 개체 배치) ──
export function worldToX3(worldX, squadX) { return (worldX - squadX) * SCALE_X; }
export function worldToZ3(worldY, squadY) { return (squadY - worldY) * SCALE_Z; }

// ── 개체 분류(Opus5 §5.2): isEnemy 확인된 일반 적만 이 함수로 온다. 미지원은 위장하지 않는다. ──
const PICKUP_RE = /^(Coin|Crystal|Pow|Capsule|DronePod|PowerModule)$/;   // 보상류(entities.js 실클래스)
const OBSTACLE_RE = /^(Meteor|Debris)$/;                                  // 장애물(isEnemy 아님)
const cname = (e) => (e && e.constructor && e.constructor.name) || '';

export function classifyEnemy(e) {
  const n = cname(e);
  if (n === 'Creature') return 'b1';
  if (n === 'Sniper') return 'b4';
  return 'unsupported';   // Turret/Weaver/Charger/Mine/Bomber/… — B1 위장 금지(§5.2). 하이브리드에선 기존 2D 유지.
}
/** 보스 분류(§5.2): Boss 는 spriteId, MidBoss 는 def.id. B8만 b8 — 나머지는 unsupported(기존 2D 유지). */
export function classifyBoss(idOrBoss) {
  const id = typeof idOrBoss === 'string' ? idOrBoss : (idOrBoss && (idOrBoss.spriteId || (idOrBoss.def && idOrBoss.def.id))) || '';
  return id === 'B8' ? 'b8' : 'unsupported';
}

/** 실게임 드론 배치(Opus5 §5.1) — Squad.draw()와 동일한 공식. 게임 상태는 읽기만 한다. */
export function realDrones(sq) {
  const offs = sq && sq._offsets, w = sq && sq.width;
  if (!Array.isArray(offs) || !(w > 0)) return [];
  const cap = (BAL.squad && BAL.squad.drawCap) || 60;
  const def = SHIP_DEFS[Math.min(sq.tier || 0, SHIP_DEFS.length - 1)] || {};
  const clearR = def.clearR || 0;
  const n = Math.min(sq.count || 0, cap, offs.length);
  const t = sq.t || 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = offs[i];
    const ox = o.x * w, oy = o.y * w * 0.8;
    if (Math.hypot(ox, oy) < clearR) continue;   // 기함 클리어런스 내측은 실제 draw도 건너뜀
    out.push({ worldX: sq.x + ox, worldY: sq.y + oy + Math.sin(t * 3 + o.phase) * 2 });
  }
  return out;
}

/**
 * 살아있는 2D 월드에서 3D 렌더에 필요한 최소 정보만 읽어 순수 스냅샷을 만든다(읽기 전용, §3.1).
 *  드론 = 실게임 공식(§5.1). 분류 = isEnemy·클래스·spriteId/def.id(§5.2). frozen 입력 안전.
 */
export function buildSnapshot(run) {
  if (!run || !run.squad || !run.world) return null;
  const sq = run.squad, w = run.world;
  const list = (arr) => (Array.isArray(arr) ? arr : []);
  const alive = (e) => e && !e.dead;
  const ents = list(w.entities);
  // 일반 적: isEnemy === true 인 살아있는 개체만(§5.2). MidBoss 는 체급상 보스로 분리.
  const enemies = ents.filter((e) => alive(e) && e.isEnemy === true && cname(e) !== 'MidBoss')
    .map((e) => ({ kind: classifyEnemy(e), worldX: e.x, worldY: e.y, r: e.r || 12 }));
  const midbosses = ents.filter((e) => alive(e) && cname(e) === 'MidBoss')
    .map((b) => ({ kind: classifyBoss(b), worldX: b.x, worldY: b.y, r: b.r || 45, hpFrac: b.maxHp ? Math.max(0, b.hp) / b.maxHp : 1 }));
  return {
    squadX: sq.x, squadY: sq.y,
    flagship: { worldX: sq.x, worldY: sq.y, tier: sq.tier || 0, count: sq.count || 0, cruisers: sq.cruisers || 0, dead: !!sq.dead, vx: sq.vx || 0, charging: !!sq.charging, chargeFrac: sq.chargeFrac || 0, bank: sq.bank || 0 },
    drones: realDrones(sq),
    cruisers: Math.max(0, sq.cruisers || 0),
    enemies,
    bosses: list(run.bosses).filter(alive).map((b) => ({ kind: classifyBoss(b), worldX: b.x, worldY: b.y, r: b.r || 60, hpFrac: b.maxHp ? Math.max(0, b.hp) / b.maxHp : 1 })).concat(midbosses),
    bullets: list(w.bullets).filter(alive).map((b) => ({ worldX: b.x, worldY: b.y, prevY: b.prevY ?? b.y, r: b.r || 3, lance: cname(b) === 'ChargeLance' })),
    enemyBullets: list(w.enemyBullets).filter(alive).map((b) => ({ worldX: b.x, worldY: b.y, r: b.r || 4 })),
    gates: ents.filter((e) => /^(GatePair|TriGate)$/.test(cname(e)) && typeof e.laneRect === 'function')
      .map((g) => ({ lanes: [0, 1, 2].map((i) => g.laneRect(i)).filter(Boolean), y: g.y })),
    pickups: ents.filter((e) => alive(e) && PICKUP_RE.test(cname(e))).map((p) => ({ worldX: p.x, worldY: p.y })),
    obstacles: ents.filter((e) => alive(e) && OBSTACLE_RE.test(cname(e))).map((o) => ({ worldX: o.x, worldY: o.y, r: o.r || 20 })),
  };
}

/**
 * 순수 스냅샷 → 3D 씬 모델(각 개체의 3D 좌표·배율·유한값). Three 미의존.
 *  이 결과를 scene 이 InstancedMesh/Mesh 로 적용한다. frozen 입력 안전(§12.2 결정성).
 */
export function computeSceneModel(snap) {
  if (!snap) return { flagship: null, drones: [], cruisers: [], enemies: [], bosses: [], bullets: [], enemyBullets: [], gates: [], pickups: [] };
  const sx = snap.squadX, sy = snap.squadY;
  const P = (wx, wy, y = 0) => ({ x: worldToX3(wx, sx), y, z: worldToZ3(wy, sy) });
  const fin = (o) => Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z);
  const map = (arr, y = 0, extra = () => ({})) => arr.map((e) => { const p = P(e.worldX, e.worldY, y); return { ...p, ...extra(e) }; }).filter(fin);

  const fs = snap.flagship;
  // 롤: 실게임 Squad.bank(±~0.5)를 우선 사용(2D draw 와 같은 신호), 없으면 vx 파생. 판정에는 절대 미반영(§9.3).
  const bankSrc = Number.isFinite(fs.bank) && fs.bank !== 0 ? fs.bank * 0.45 : -(fs.vx || 0) * 0.0016;
  const bank = Math.max(-CAMERA.bankMax, Math.min(CAMERA.bankMax, bankSrc));
  const flagship = fs.dead ? null : { ...P(fs.worldX, fs.worldY, 0), bank, tier: fs.tier, count: fs.count, charging: fs.charging, chargeFrac: fs.chargeFrac };

  // 순양함: 기함 좌우로 대칭 편대 배치(시각적 규모감). 실제 게임에 순양함 개체 좌표가 없으므로 파생 배치.
  const cruisers = [];
  for (let i = 0; i < Math.min(snap.cruisers, 8); i++) {
    const side = i % 2 === 0 ? -1 : 1; const rank = Math.floor(i / 2) + 1;
    cruisers.push({ x: side * (1.1 + rank * 0.55), y: -0.15, z: -0.5 - rank * 0.4 });
  }

  return {
    flagship,
    drones: map(snap.drones, 0.15),
    cruisers: cruisers.filter(fin),
    enemies: map(snap.enemies, 0.0, (e) => ({ kind: e.kind, r: e.r })),
    bosses: map(snap.bosses, 0.6, (b) => ({ kind: b.kind, r: b.r, hpFrac: b.hpFrac })),
    bullets: snap.bullets.map((b) => ({ ...P(b.worldX, b.worldY, 0.2), z1: worldToZ3(b.prevY, sy), lance: !!b.lance, r: b.r })).filter(fin),
    enemyBullets: map(snap.enemyBullets, 0.2, (b) => ({ r: b.r })),
    gates: snap.gates.map((g) => ({ lanes: g.lanes.map((rc) => ({ x0: worldToX3(rc.x, sx), x1: worldToX3(rc.x + rc.w, sx), z: worldToZ3(g.y, sy) })) })),
    pickups: map(snap.pickups, 0.1),
  };
}

export default {
  SCALE_X, SCALE_Z, CAMERA, makeChaseCamera, projectPoint3D, worldXToScreenX, screenXToWorldX,
  worldToX3, worldToZ3, classifyEnemy, buildSnapshot, computeSceneModel,
};
