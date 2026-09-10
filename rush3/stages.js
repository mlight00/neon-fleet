// rush3/stages.js — 기준 전투 3개 고정 배치(계약서 5장). buildStage 는 호출마다 새 객체(구조 공유 금지).
// 난수는 빌드 시점 좌표 확정용 hashSeed/mulberry32 만(규칙 진행 중 난수 없음).
import { BAL3 } from './balance.js';
import { hashSeed, mulberry32 } from '../rush/rng.js';

export const STAGE_IDS = [1, 2, 3];

const ROAD = BAL3.road;
const WALL_X = BAL3.wall;
const ENTER = BAL3.enterZ;

// 표 그대로의 스테이지 정의. z 는 계약서 표의 z(정지물 = 부대 줄에 도달하는 위치, 스폰 = 발동 지점 ev.z)
//  gate: cells [x0, x1, value] / supply: kind 별 payload / wall: z0~z1 / spawn: xs 명시 없으면 차선 균등 분산+지터, dz = zs 상대 오프셋
const DEFS = {
  1: {
    title: '첫 진격', startUnits: 1, startWeapon: 'rifle', length: 7600, eliteZ: 7200,
    gates: [
      { z: 1140, maxValue: 15, bypass: true, cells: [[240, 400, 1]] },
      { z: 3040, maxValue: 15, bypass: true, cells: [[80, 240, -9]] },
    ],
    supplies: [
      { z: 2100, x: 240, kind: 'soldier', durability: 4, n: 2 },
      { z: 4180, x: 240, kind: 'weapon', durability: 8, weapon: 'auto' },
      { z: 5890, x: 150, kind: 'soldier', durability: 6, n: 2 },
      { z: 5890, x: 330, kind: 'soldier', durability: 10, n: 4 },
    ],
    walls: [],
    spawns: [
      { z: 3800, kind: 'grunt', n: 4, xs: [120, 200, 280, 360], dz: [0, 40, 80, 120] },
      { z: 5300, kind: 'grunt', n: 6, rows: 2 },
    ],
    elite: { z: 7200, hp: 120, summon: false },
  },
  2: {
    title: '갈림길', startUnits: 2, startWeapon: 'rifle', length: 8600, eliteZ: 8200,
    gates: [
      { z: 1140, maxValue: 20, bypass: false, cells: [[80, 240, -6], [240, 400, -20]] },
      { z: 5400, maxValue: 20, bypass: false, cells: [[80, 240, 2], [240, 400, -20]] },
    ],
    supplies: [
      { z: 2300, x: 120, kind: 'soldier', durability: 6, n: 3 },
      { z: 2300, x: 326, kind: 'weapon', durability: 12, weapon: 'auto' },
      { z: 5800, x: 330, kind: 'soldier', durability: 15, n: 5 },
    ],
    walls: [{ z0: 1800, z1: 3000 }],
    spawns: [
      { z: 3600, kind: 'grunt', n: 5, rows: 1 },
      { z: 3600, kind: 'rusher', n: 4, xs: [110, 215, 265, 370] },
      { z: 4600, kind: 'shooter', n: 3, xs: [150, 240, 330] },
      { z: 7000, kind: 'grunt', n: 8, rows: 2 },
    ],
    elite: { z: 8200, hp: 220, summon: false },
  },
  3: {
    title: '군단', startUnits: 3, startWeapon: 'rifle', length: 11000, eliteZ: 10600,
    gates: [
      { z: 4000, maxValue: 40, bypass: false, cells: [[80, 240, 3], [240, 400, -25]] },
    ],
    supplies: [
      { z: 1100, x: 160, kind: 'soldier', durability: 4, n: 2 },
      { z: 1500, x: 320, kind: 'soldier', durability: 5, n: 2 },
      { z: 1900, x: 160, kind: 'soldier', durability: 6, n: 3 },
      { z: 2800, x: 320, kind: 'chain', durability: 10, pads0: 5, maxPads: 15 },
      { z: 4400, x: 330, kind: 'weapon', durability: 24, weapon: 'heavy' },
      { z: 6300, x: 326, kind: 'soldier', durability: 12, n: 6 },
    ],
    walls: [{ z0: 6000, z1: 7200 }],
    spawns: [
      { z: 5200, kind: 'grunt', n: 14, rows: 2 },
      { z: 6300, kind: 'shooter', n: 2, xs: [120, 190] },
      { z: 8000, kind: 'rusher', n: 6, xs: [100, 160, 210, 270, 320, 380] },
      { z: 8800, kind: 'grunt', n: 18, rows: 2 },
      { z: 8800, kind: 'shooter', n: 3, xs: [130, 240, 350] },
    ],
    elite: { z: 10600, hp: 500, summon: true },
  },
};

function def(id) {
  const d = DEFS[id];
  if (!d) throw new Error('unknown stage ' + id);
  return d;
}

// 메타만(제목·시작 병력·무기·길이·정예 z)
export function stageMeta(id) {
  const d = def(id);
  return { id, title: d.title, startUnits: d.startUnits, startWeapon: d.startWeapon, length: d.length, eliteZ: d.eliteZ };
}

// 게이트 행: 계약서 3-2 필드 전부 초기값 포함
function makeRow(idx, g) {
  const cells = g.cells.map(([x0, x1, value]) => ({ x0, x1, value, maxValue: g.maxValue, flashT: 0 }));
  return { id: 'g' + idx, z: g.z, h: BAL3.gate.h, cells, passed: false, bypass: !!g.bypass };
}

// 보급 통: 계약서 3-3 필드 전부 초기값 포함
function makeSupplyDef(idx, s) {
  let payload;
  if (s.kind === 'soldier') payload = { n: s.n };
  else if (s.kind === 'weapon') payload = { weapon: s.weapon };
  else payload = { pads0: s.pads0, maxPads: s.maxPads };
  return { id: 'c' + idx, z: s.z, x: s.x, r: BAL3.supply.r, kind: s.kind,
           durability: s.durability, maxDurability: s.durability,
           payload, opened: false, missed: false, locked: false, pads: [] };
}

function makeWall(idx, w) {
  return { id: 'w' + idx, z0: w.z0, z1: w.z1, x0: WALL_X.x0, x1: WALL_X.x1 };
}

// 벽 구간(z0~z1) 안의 z 이고 x 가 벽 폭(반경 포함) 안이면 가까운 통로로 밀어낸다
function keepOutOfWalls(x, z, r, walls) {
  for (const w of walls) {
    if (z < w.z0 || z > w.z1) continue;
    const mid = (w.x0 + w.x1) / 2;
    if (x > w.x0 - r && x < w.x1 + r) x = x < mid ? w.x0 - r - 4 : w.x1 + r + 4;
  }
  return Math.max(ROAD.x0 + r, Math.min(ROAD.x1 - r, x));
}

// 스폰 이벤트: xs 명시 → 그대로, 없으면 rows 열로 차선 대역 균등 분산 + 지터
//  ev.z = 표 z 그대로 = 발동 지점(combat: ev.z <= run.z). 시드 = hashSeed(id + ':' + ev.z + ':' + i)(계약서 0장)
//  zs = 절대 트랙 z = ev.z + 760(화면 진입 거리, 정예 스폰 run.z + 760 과 같은 규칙) + 행 오프셋 + 지터
//  → 발동 순간 zs[i] - run.z >= 760 이라 화면 밖 위에서 등장. combat 은 zs[i] 에 그대로 놓는다(run.z 를 더하지 않는다)
function makeSpawn(id, sp, walls) {
  const r = BAL3.enemies[sp.kind].r;
  const n = sp.n;
  const evZ = sp.z;
  const xs = [], zs = [];
  const rows = sp.rows ?? 1;
  const cols = Math.ceil(n / rows);
  const lo = ROAD.x0 + r, hi = ROAD.x1 - r;
  const bandW = (hi - lo) / cols;
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(hashSeed(id + ':' + evZ + ':' + i));
    const jx = (rng() - 0.5) * bandW * 0.6;
    const jz = rng() * 12;
    let x, z;
    if (sp.xs) {
      x = sp.xs[i];
      z = evZ + ENTER + (sp.dz ? sp.dz[i] : 0);
    } else {
      const row = Math.floor(i / cols), col = i % cols;
      x = lo + bandW * (col + 0.5) + jx;
      z = evZ + ENTER + row * 40 + jz;
    }
    x = keepOutOfWalls(x, z, r, walls);
    xs.push(Math.round(x * 100) / 100);
    zs.push(Math.round(z * 100) / 100);
  }
  const ev = { z: evZ, kind: sp.kind, n, xs, zs };
  if (sp.hp != null) ev.hp = sp.hp;
  return ev;
}

// 스테이지 전체를 새 객체로 조립. 재도전 = 재호출(이전 판의 durability/value/passed/opened 가 남지 않는다)
export function buildStage(id) {
  const d = def(id);
  const walls = d.walls.map((w, i) => makeWall(i + 1, w));
  const stage = {
    id, version: 1,
    title: d.title, startUnits: d.startUnits, startWeapon: d.startWeapon, length: d.length, eliteZ: d.eliteZ,
    gateRows: d.gates.map((g, i) => makeRow(i + 1, g)),
    supplies: d.supplies.map((s, i) => makeSupplyDef(i + 1, s)),
    walls,
    spawns: d.spawns.map(sp => makeSpawn(id, sp, walls)),
    elite: d.elite ? { z: d.elite.z, hp: d.elite.hp, summon: !!d.elite.summon } : null,
  };
  stage.spawns.sort((a, b) => a.z - b.z);
  return stage;
}
