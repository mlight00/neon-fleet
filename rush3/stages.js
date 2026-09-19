// rush3/stages.js — 기준 전투 3개 고정 배치(계약서 5장). buildStage 는 호출마다 새 객체(구조 공유 금지).
// 난수는 빌드 시점 좌표 확정용 hashSeed/mulberry32 만(규칙 진행 중 난수 없음).
import { BAL3, DEFAULT_DIFFICULTY, difficultyMult } from './balance.js';
import { WEAPONS } from './weapons.js';
import { formation } from './squad.js';
import { hashSeed, mulberry32 } from '../rush/rng.js';

export const STAGE_IDS = [1, 2, 3];

const ROAD = BAL3.road;
const WALL_X = BAL3.wall;
const ENTER = BAL3.enterZ;
//  벽 활성(통로 확정) 선행 여유 — squad.clampCenter 와 같은 값
const WALL_LEAD = BAL3.squad.wallLead;
//  가장 느린 탄 속도(현재 heavy 650). coverZ 공식이 여기에 매달려 있다(더 느린 무기를 넣으면 배제가 다시 열린다).
//  r3.10: 사거리 제한(range)이 있는 무기(산탄포 520)는 제외 — 1~3스테이지엔 등장하지 않고, 등장하는 스테이지는 24스테이지 설계에서
//   그 무기의 사거리(range)가 통까지의 거리보다 짧은지까지 포함해 coverZ 를 다시 계산한다(STG-4 가 그 스테이지에서 잡는다)
export const VZ_MIN = Math.min(...Object.values(WEAPONS).filter((w) => w.range == null).map((w) => w.vz));
//  대형 최대 깊이(유닛 상한까지 채운 대형의 dy 최대). 탄은 부대 중심이 아니라 run.z - dy 에서 출발하므로 그만큼 더 날아간다
export const MAX_DY = Math.max(...formation(BAL3.squad.unitCap).map((p) => p.dy));

/** 배제 쌍의 차폐 개방선 = '비행시간 보정선'(개정 r3 §3-3 · 2026-09-17 보정).
 *  통로 확정선(wall.z0 - 60)에 두면 확정 **직전에 쏜 탄**이 차폐가 걷힌 뒤 반대편 통에 도착해 배제가 뚫린다.
 *  확정 직전에 쏜 가장 느린 탄이 통에 닿는 순간의 run.z 까지 차폐를 유지한다. 보정 2가지가 함께 들어간다:
 *   ① 1 STEP 지연 — clampCenter 는 직전 STEP 의 run.z 로 통로를 확정하므로, 아직 제약 없는 대형이 쏘는 마지막 STEP 은 확정선 + scroll×STEP 이다.
 *   ② 대형 깊이 — 탄 출발 z 는 run.z - dy 라 목표까지 최대 MAX_DY 만큼 더 날아간다(뒷줄 유닛이 쏜 탄이 가장 늦게 닿는다).
 *    coverZ = ceil( C + (s.z + MAX_DY - C) × scroll / vzMin ),  C = wall.z0 - 60 + scroll × STEP */
export function coverZFor(wallZ0, supplyZ) {
  const commitZ = wallZ0 - WALL_LEAD + BAL3.scroll * BAL3.STEP;
  return Math.ceil(commitZ + (supplyZ + MAX_DY - commitZ) * BAL3.scroll / VZ_MIN);
}

// 표 그대로의 스테이지 정의. z 는 계약서 표의 z(정지물 = 부대 줄에 도달하는 위치, 스폰 = 발동 지점 ev.z)
//  gate: cells [x0, x1, value] / supply: kind 별 payload / wall: z0~z1 / spawn: xs 명시 없으면 차선 균등 분산+지터, dz = zs 상대 오프셋
//  배치 개정 담당이 고치는 표(version 포함). 검사에서 코스 버전을 임시로 바꿔 셸 경로를 확인하므로 export 한다.
export const DEFS = {
  1: {
    version: 2, title: '첫 진격', startUnits: 1, startWeapon: 'rifle', length: 7600, eliteZ: 7200,
    gates: [
      //  첫 게이트는 항상 열림(armZ null) — "쏘면 숫자가 오른다"를 바로 배우는 학습용 행
      { z: 1140, maxValue: 15, bypass: true, armZ: null, cells: [[240, 400, 1]] },
      { z: 3040, maxValue: 15, bypass: true, cells: [[80, 240, -9]],
        hint: '왼쪽 −9 칸은 빈 길로 우회할 수 있습니다. 옆으로 한 번만 비켜 보세요' },
    ],
    supplies: [
      { z: 2100, x: 240, kind: 'soldier', durability: 4, n: 2, hint: '앞의 통은 그 차선에 서 있기만 하면 저절로 열립니다' },
      { z: 4180, x: 240, kind: 'weapon', durability: 8, weapon: 'auto', hint: '기관총 통은 내구 8 이라 조금 더 오래 쏴야 합니다' },
      { z: 5890, x: 150, kind: 'soldier', durability: 6, n: 2, hint: '왼쪽 통은 왼쪽 차선으로 붙어야 열립니다' },
      { z: 5890, x: 330, kind: 'soldier', durability: 10, n: 4, hint: '오른쪽 통이 병사 4명으로 더 큽니다' },
    ],
    walls: [],
    spawns: [
      //  탄막 무리(통로 없음) — 잡졸 hp 2 라 부대 화력으로 정리한다
      { z: 3800, kind: 'grunt', n: 4, xs: [120, 200, 280, 360], dz: [0, 40, 80, 120], corridorHw: null },
      //  회피 통로 무리: 1열 가운데 166px · 2열 208px 이 비어 있다(필요 폭 = 2 × 반폭 53 + 10 = 116)
      { z: 5300, kind: 'grunt', n: 6, xs: [94, 136, 330, 372, 115, 351], dz: [0, 0, 0, 0, 40, 40], corridorHw: 53 },
    ],
    elite: { z: 7200, hp: 120, summon: false },
  },
  2: {
    version: 2, title: '갈림길', startUnits: 2, startWeapon: 'rifle', length: 8600, eliteZ: 8200,
    gates: [
      //  안전한 작은 확정 보상(좌) vs 병력을 모아야 여는 큰 음수(우) — 양쪽 모두 음수인 행을 늘리지 않는다
      //  ⚠️안내는 **이 판에서 지금 할 수 있는 행동**만 적는다(2026-09-17 2차 검수 N1). S2 는 2명으로 시작하고
      //   이 행 앞에는 보급이 없어 '병력을 모은 뒤 오른쪽'은 실행할 수 없는 권유였다 — 뒤 구간의 큰 게이트로 미룬다.
      { z: 1140, maxValue: 20, bypass: false, cells: [[80, 240, 1, 3], [240, 400, -20, 20]],
        hint: '첫 갈림길은 왼쪽 +칸으로 통과하세요. 뒤에서 병력을 모아 큰 게이트에 도전할 수 있어요.' },
      { z: 5400, maxValue: 20, bypass: false, cells: [[80, 240, 2, 12], [240, 400, -20, 40]],
        hint: '오른쪽 −20 은 상한이 40 입니다. 소총이면 13명, 기관총이면 7명쯤부터 이득입니다' },
    ],
    supplies: [
      //  분리벽 안 필수 선택: 병력(좌) vs 화력(우). 벽 + 차폐(coverZ)가 함께 있어야 배제가 성립한다
      { z: 2300, x: 120, kind: 'soldier', durability: 6, n: 3, pairId: 'w1', coverZ: 1953,
        hint: '분리벽 왼쪽 통로에는 병사 3명이 있습니다. 벽 앞 표지를 보고 미리 차선을 고르세요' },
      { z: 2300, x: 326, kind: 'weapon', durability: 12, weapon: 'auto', pairId: 'w1', coverZ: 1953,
        hint: '분리벽 오른쪽 기관총을 확보하면 다음 무리를 빨리 정리할 수 있어요' },
      { z: 5800, x: 150, kind: 'soldier', durability: 15, n: 5,
        hint: '두 번째 게이트에서 오른쪽을 골랐다면 이 통은 왼쪽으로 옮겨야 얻습니다' },
    ],
    walls: [{ z0: 1800, z1: 3000, signs: { L: { kind: 'soldier', n: 3 }, R: { kind: 'weapon', weapon: 'auto' } } }],
    spawns: [
      //  회피 통로 무리: 오른쪽 도로 끝까지 165px 이 비어 있다(필요 폭 = 2 × 반폭 61 + 10 = 132)
      { z: 3600, kind: 'grunt', n: 4, xs: [95, 137, 179, 221], corridorHw: 61 },
      { z: 3600, kind: 'rusher', n: 4, xs: [110, 215, 265, 370], corridorHw: null },
      { z: 4600, kind: 'shooter', n: 3, xs: [150, 240, 330], corridorHw: null },
      { z: 7000, kind: 'grunt', n: 8, xs: [94, 136, 178, 220, 262, 304, 346, 386], dz: [0, 0, 0, 0, 40, 40, 40, 40], corridorHw: null },
    ],
    elite: { z: 8200, hp: 220, summon: false },
  },
  3: {
    version: 2, title: '군단', startUnits: 3, startWeapon: 'rifle', length: 11000, eliteZ: 10600,
    gates: [
      //  선택 C 의 한쪽 — 좌 안전 +12 vs 우 도전 +40. 앞의 통(z3900)과 사격창을 나눠 쓴다
      { z: 4000, maxValue: 40, bypass: false, cells: [[80, 240, 3, 12], [240, 400, -25, 40]],
        hint: '오른쪽 −25 는 상한이 40 입니다. 기관총이면 7명, 소총이면 13명쯤부터 채울 수 있어요' },
    ],
    supplies: [
      { z: 1100, x: 160, kind: 'soldier', durability: 4, n: 2, hint: '통은 좌우로 번갈아 놓여 있습니다. 가만히 있으면 하나도 못 엽니다' },
      { z: 1500, x: 320, kind: 'soldier', durability: 5, n: 2, hint: '오른쪽 통으로 한 번 옮겨 보세요' },
      { z: 1900, x: 160, kind: 'soldier', durability: 6, n: 3, hint: '다시 왼쪽입니다. 통이 보이기 시작할 때 옮기면 늦지 않습니다' },
      //  선택 A: 연속증원(좌, 최대 15명이지만 좌측 차선에 묶인다) vs 즉시 병사 5(우, 자유롭다)
      { z: 2800, x: 150, kind: 'chain', durability: 10, pads0: 5, maxPads: 15, pairId: 'p1', coverZ: 2524,
        hint: '왼쪽 증원 설비는 최대 15명까지 자라지만 발판이 왼쪽 차선에 깔립니다' },
      { z: 2800, x: 330, kind: 'soldier', durability: 10, n: 5, pairId: 'p1', coverZ: 2524,
        hint: '오른쪽 통은 병사 5명을 즉시 줍니다. 대신 성장 상한이 없습니다' },
      //  선택 B: 기관총(좌, 게이트 효율 2배) vs 중화기(우, 적 처리·정예전). 중화기를 고르면 발판 9개를 버린다
      { z: 3500, x: 150, kind: 'weapon', durability: 12, weapon: 'auto', pairId: 'p2', coverZ: 3259,
        hint: '기관총은 게이트에 넣는 탄이 소총의 두 배입니다' },
      { z: 3500, x: 330, kind: 'weapon', durability: 24, weapon: 'heavy', pairId: 'p2', coverZ: 3259,
        hint: '중화기는 적 처리와 정예전에 강하지만 게이트 효율은 가장 낮습니다' },
      //  선택 C 의 다른 한쪽 — 게이트 사격창(z3660 개시)과 같은 창을 나눠 쓴다
      { z: 3900, x: 150, kind: 'soldier', durability: 24, n: 4, coverZ: 3660,
        hint: '이 통과 게이트 오른쪽 칸은 같은 사격 시간을 나눠 씁니다. 둘 다 노리면 둘 다 모자랍니다' },
      //  선택 D: 좌 통로에 병사 10명 + 저격수 2기 / 우 통로는 판마다 바뀌는 랜덤 길(3-9)
      { z: 6300, x: 150, kind: 'soldier', durability: 20, n: 10, coverZ: 6094,
        hint: '분리벽 왼쪽에는 병사 10명과 저격수 2기가 있습니다. 오른쪽은 판마다 달라지는 랜덤 길입니다' },
    ],
    walls: [
      { z0: 2400, z1: 2900, signs: { L: { kind: 'chain' }, R: { kind: 'soldier', n: 5 } } },
      { z0: 3150, z1: 3550, signs: { L: { kind: 'weapon', weapon: 'auto' }, R: { kind: 'weapon', weapon: 'heavy' } } },
      //  우측 = 랜덤 길('?'). 실제 내용은 buildStage 가 판마다 추첨한다(3-9)
      { z0: 6000, z1: 7200, signs: { L: { kind: 'soldier', n: 10 }, R: { kind: 'lottery' } } },
    ],
    //  랜덤 길(3-9): w3(walls[2]) 우측 통로. 통·게이트 모두 z6300 x330(칸 [252,400))에 놓인다
    lottery: { wallIdx: 2, z: 6300, x: 330, cell: [252, 400] },
    spawns: [
      { z: 5200, kind: 'grunt', n: 14, xs: [94, 136, 178, 220, 262, 304, 346, 115, 157, 199, 241, 283, 325, 367],
        dz: [0, 0, 0, 0, 0, 0, 0, 40, 40, 40, 40, 40, 40, 40], corridorHw: null },
      { z: 6300, kind: 'shooter', n: 2, xs: [120, 190], corridorHw: null },
      { z: 8000, kind: 'rusher', n: 6, xs: [100, 160, 210, 270, 320, 380], corridorHw: null },
      { z: 8800, kind: 'grunt', n: 18, rows: 2, corridorHw: null },
      { z: 8800, kind: 'shooter', n: 3, xs: [130, 240, 350], corridorHw: null },
    ],
    elite: { z: 10600, hp: 500, summon: true },
  },
};

//  격리 시제품(r3.11, 2026-09-19 · 실게임 구현계획 §7 착수 2): STAGE_IDS 에 넣지 않는다 — 타이틀·봇 실측·기록과 분리.
//  셸은 rush3.html?stage=proto3 로만 연다(기록 저장 없음). 도로 80~400 을 3등분한 세 칸 행 + 사선만 막는 차폐물(kind 'cover').
const T3 = [80, 80 + 320 / 3, 80 + 640 / 3, 400];
export const PROTO_IDS = ['proto3'];
export const PROTO_DEFS = {
  proto3: {
    version: 1, title: '시험 · 세 갈래', startUnits: 6, startWeapon: 'rifle', length: 5200, eliteZ: 4800,
    gates: [
      //  가운데(+3)가 정답이지만 그 앞에 차폐물이 있어 정면에서는 못 쏜다 — 옆 칸에서 비스듬히 쏘거나 차폐 뒤에서 미리 쏴야 한다
      { z: 1500, maxValue: 15, cells: [[T3[0], T3[1], -4], [T3[1], T3[2], 3], [T3[2], T3[3], -6]], hint: '세 칸: 가운데가 늘 정답은 아니다' },
      //  왼쪽(+2) 앞 차폐, 오른쪽(+5)이 열려 있다
      { z: 3000, maxValue: 15, cells: [[T3[0], T3[1], 2], [T3[1], T3[2], -8], [T3[2], T3[3], 5]], hint: '가려진 칸은 쏠 수 없다' },
    ],
    supplies: [
      { z: 2200, x: 150, kind: 'soldier', durability: 8, n: 4 },
      { z: 3800, x: 330, kind: 'weapon', durability: 12, weapon: 'auto' },
    ],
    walls: [
      { kind: 'cover', x0: 190, x1: 290, z0: 1120, z1: 1160 },
      { kind: 'cover', x0: 80, x1: 186, z0: 2620, z1: 2660 },
    ],
    spawns: [
      { z: 2400, kind: 'grunt', n: 4, xs: [120, 200, 280, 360], corridorHw: null },
      { z: 3400, kind: 'rusher', n: 2, xs: [160, 320], corridorHw: null },
    ],
    elite: { z: 4800, hp: 100, summon: false },
  },
};

function def(id) {
  const d = DEFS[id] ?? PROTO_DEFS[id];
  if (!d) throw new Error('unknown stage ' + id);
  return d;
}

// 코스 배치 버전(계약서 7장). 배치를 고치면 이 값을 올린다 → 저장 기록이 버전별로 따로 쌓인다.
export function stageVersion(id) {
  return def(id).version ?? 1;
}

// 메타만(제목·시작 병력·무기·길이·정예 z)
export function stageMeta(id) {
  const d = def(id);
  return { id, title: d.title, startUnits: d.startUnits, startWeapon: d.startWeapon, length: d.length, eliteZ: d.eliteZ };
}

// 게이트 행: 계약서 3-2 필드 전부 초기값 포함. cells 항목 = [x0, x1, value] 또는 [x0, x1, value, maxValue](칸별 상한)
//  armZ 미지정 = BAL3.gate.armZ(340), 명시적 null = 항상 열림(학습용 행)
function makeRow(idx, g) {
  const cells = g.cells.map(([x0, x1, value, maxValue]) => ({ x0, x1, value, maxValue: maxValue ?? g.maxValue, flashT: 0 }));
  const armZ = g.armZ === undefined ? BAL3.gate.armZ : g.armZ;
  return { id: 'g' + idx, z: g.z, h: BAL3.gate.h, cells, passed: false, bypass: !!g.bypass,
           armZ, armed: armZ == null, hint: g.hint ?? null };
}

// 보급 통: 계약서 3-3 필드 전부 초기값 포함
function makeSupplyDef(idx, s) {
  let payload;
  if (s.kind === 'soldier') payload = { n: s.n };
  else if (s.kind === 'weapon') payload = { weapon: s.weapon };
  else payload = { pads0: s.pads0, maxPads: s.maxPads };
  return { id: 'c' + idx, z: s.z, x: s.x, r: BAL3.supply.r, kind: s.kind,
           durability: s.durability, maxDurability: s.durability,
           payload, opened: false, missed: false, locked: false, skipped: false, pads: [],
           coverZ: s.coverZ ?? null, pairId: s.pairId ?? null, hint: s.hint ?? null };
}

//  signs = 벽 앞머리에 그리는 통로 안내 표지(연출이 아니라 계약 데이터 — V3-STAGES 가 실제 통 내용과 대조한다)
//  kind 'cover'(r3.11) = 사선만 막는 짧은 차폐물: x0·x1 을 직접 적고, 통로(이동)는 막지 않는다(combat.createRun 이 walls/covers 로 나눈다)
function makeWall(idx, w) {
  const cover = w.kind === 'cover';
  const wall = { id: (cover ? 'v' : 'w') + idx, z0: w.z0, z1: w.z1, x0: cover ? w.x0 : WALL_X.x0, x1: cover ? w.x1 : WALL_X.x1 };
  if (cover) wall.kind = 'cover';
  if (w.signs) wall.signs = { L: { ...w.signs.L }, R: { ...w.signs.R } };
  return wall;
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
//  난이도(3-8): xs 없이 rows 로 뿌리는 무리만 n 을 spawnCount 배(반올림)로 늘린다. xs 명시 무리는 배치 그대로(회피 통로 규격이 깨지지 않게).
//   시드는 i 만 쓰므로 늘어난 뒤에도 앞 n 개의 지터는 종전과 같다(cols 가 바뀌면 대역 폭은 달라진다).
function makeSpawn(id, sp, walls, mult) {
  const r = BAL3.enemies[sp.kind].r;
  //  r3.9: xs 명시 무리는 waves 번 반복 — 같은 xs·같은 통로 규격으로 waveGap px 뒤에 다시 들어온다(출현 빈도 = 난이도)
  const waves = sp.xs ? Math.max(1, Math.round(mult.waves ?? 1)) : 1;
  const n = sp.xs ? sp.n * waves : Math.max(1, Math.round(sp.n * mult.spawnCount));
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
      const k = i % sp.n, w = Math.floor(i / sp.n);
      x = sp.xs[k];
      z = evZ + ENTER + (sp.dz ? sp.dz[k] : 0) + w * (mult.waveGap ?? 0);
    } else {
      const row = Math.floor(i / cols), col = i % cols;
      x = lo + bandW * (col + 0.5) + jx;
      z = evZ + ENTER + row * 40 + jz;
    }
    x = keepOutOfWalls(x, z, r, walls);
    xs.push(Math.round(x * 100) / 100);
    zs.push(Math.round(z * 100) / 100);
  }
  //  corridorHw = 그 구간 예상 부대 반폭(회피 통로 규격 검사 기준). null = 통로 없음(탄막 무리)
  const ev = { z: evZ, kind: sp.kind, n, xs, zs, corridorHw: sp.corridorHw ?? null };
  if (sp.hp != null) ev.hp = sp.hp;
  return ev;
}

/** 랜덤 길 추첨(계약서 3-9 · 2026-09-16 이사 지시). 시드 하나로 mulberry32 를 **한 번**만 돌려 균등 1/5.
 *  시드를 안 주면 LOTTERY_DEFAULT_SEED — 검사·봇 시뮬의 기준선(같은 시드면 buildStage 두 번이 deepEqual). */
export const LOTTERY_DEFAULT_SEED = hashSeed('rush3:lottery:default');

export function lotteryPick(seed = LOTTERY_DEFAULT_SEED) {
  const pool = BAL3.lottery.pool;
  const r = mulberry32(seed >>> 0)();
  const idx = Math.min(pool.length - 1, Math.floor(r * pool.length));
  return { idx, entry: pool[idx] };
}

/** 뽑힌 항목을 stage 에 얹는다. 기존 물체 뒤에 **덧붙이기만** 하므로 c1~c9·g1 의 id 는 그대로다.
 *  통(soldier/weapon/chain) = z6300 x330 + coverZ(= 좌 통과 같은 비행시간 보정선)
 *  게이트 = 우 칸 한 칸(bypass). 셔터 개방선을 통의 차폐 개방선과 같은 z(openZ)로 맞춘다 —
 *   기본 armZ(340)면 확정 전에 쏜 탄이 셔터가 열린 뒤 도착해 값을 바꾼다(통 쪽 누출과 같은 계열).
 *  stage.lottery = { pick, idx, seed, good, label, kind, trap, z, x, revealZ, openZ, wallId, supplyId, rowId } — 셸이 결과 한 줄·'?' 연출에 쓴다.
 *  trap = 확정 손실 게이트(상한이 자기 값이라 쏴도 안 줄어든다) 여부 — 화면의 함정 외형(render.isTrapGateRow)과 같은 조건을 뽑은 쪽에서도 알린다. */
function applyLottery(d, stage, seed) {
  const cfg = d.lottery;
  if (!cfg) { stage.lottery = null; return; }
  const useSeed = Number.isFinite(seed) ? (seed >>> 0) : LOTTERY_DEFAULT_SEED;
  const { idx, entry } = lotteryPick(useSeed);
  const wall = stage.walls[cfg.wallIdx];
  const revealZ = wall.z0 - WALL_LEAD;
  const openZ = coverZFor(wall.z0, cfg.z);
  let supplyId = null, rowId = null;
  if (entry.kind === 'gate') {
    const row = makeRow(stage.gateRows.length + 1, {
      z: cfg.z, maxValue: entry.maxValue, bypass: true, hint: entry.hint, armZ: cfg.z - openZ,
      cells: [[cfg.cell[0], cfg.cell[1], entry.value, entry.maxValue]],
    });
    rowId = row.id;
    stage.gateRows.push(row);
  } else {
    const sup = makeSupplyDef(stage.supplies.length + 1, {
      z: cfg.z, x: cfg.x, kind: entry.kind, durability: entry.durability,
      n: entry.n, weapon: entry.weapon, pads0: entry.pads0, maxPads: entry.maxPads,
      coverZ: openZ, hint: entry.hint,
    });
    supplyId = sup.id;
    stage.supplies.push(sup);
  }
  const trap = entry.kind === 'gate' && !entry.good && entry.maxValue === entry.value;
  stage.lottery = { pick: entry.id, idx, seed: useSeed, good: !!entry.good, label: entry.label, kind: entry.kind, trap,
                    z: cfg.z, x: cfg.x, revealZ, openZ, wallId: wall.id, supplyId, rowId };
}

// 스테이지 전체를 새 객체로 조립. 재도전 = 재호출(이전 판의 durability/value/passed/opened 가 남지 않는다)
//  난이도(3-8)는 여기서 한 번 박힌다: stage.difficulty · rows 스폰 n(spawnCount) · 정예 hp(eliteHp, 반올림).
//  적 hp·적탄·접촉·정예 발사 빈도는 createRun 이 stage.difficulty 를 읽어 run.enemyDefs 로 만든다. 게이트·통·벽·시작 병력·무기는 난이도와 무관.
//  difficulty 생략 = normal = 종전과 완전히 같은 객체(difficulty 필드만 추가).
//  랜덤 길(3-9)은 '재도전 동일 배치' 원칙의 명시적 예외 — lotterySeed 가 판마다 달라 우측 통로만 바뀐다(셸이 시계로 만든다).
export function buildStage(id, { difficulty = DEFAULT_DIFFICULTY, lotterySeed } = {}) {
  const d = def(id);
  const mult = difficultyMult(difficulty);
  const walls = d.walls.map((w, i) => makeWall(i + 1, w));
  //  스폰 좌표 보정·랜덤 길은 진짜 벽만 본다(차폐물은 이동을 막지 않는다)
  const solid = walls.filter((w) => w.kind !== 'cover');
  const stage = {
    id, version: d.version ?? 1, difficulty,
    title: d.title, startUnits: d.startUnits, startWeapon: d.startWeapon, length: d.length, eliteZ: d.eliteZ,
    gateRows: d.gates.map((g, i) => makeRow(i + 1, g)),
    supplies: d.supplies.map((s, i) => makeSupplyDef(i + 1, s)),
    walls,
    spawns: d.spawns.map(sp => makeSpawn(id, sp, solid, mult)),
    elite: d.elite ? { z: d.elite.z, hp: Math.round(d.elite.hp * mult.eliteHp), summon: !!d.elite.summon } : null,
  };
  applyLottery(d, stage, lotterySeed);
  stage.spawns.sort((a, b) => a.z - b.z);
  return stage;
}
