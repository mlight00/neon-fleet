// rush3/stages.js — 기준 전투 3개 고정 배치(계약서 5장). buildStage 는 호출마다 새 객체(구조 공유 금지).
// 난수는 빌드 시점 좌표 확정용 hashSeed/mulberry32 만(규칙 진행 중 난수 없음).
import { BAL3, DEFAULT_DIFFICULTY, difficultyMult, enemyHpMulFor, difficultyHpFor } from './balance.js';
import { makeCourses, COURSE_IDS } from './courses.js';
import { WEAPONS } from './weapons.js';
import { formation } from './squad.js';
import { CAPSULE_N_DEFAULT } from './supply.js';
import { hashSeed, mulberry32 } from '../rush/rng.js';
import { bossFloor, bountyFloor } from './firepower.js';

//  STAGE_IDS = 검사·봇 실측·계약서 기준 코스(1~3, 코스 버전 2). ALL_STAGE_IDS = 셸(타이틀·다음 작전)이 보는 공개 목록 1~24(4~24 는 courses.js).
export const STAGE_IDS = [1, 2, 3];
export const ALL_STAGE_IDS = Object.freeze([...STAGE_IDS, ...COURSE_IDS]);

const ROAD = BAL3.road;
const WALL_X = BAL3.wall;
const ENTER = BAL3.enterZ;
//  벽 활성(통로 확정) 선행 여유 — squad.clampCenter 와 같은 값
const WALL_LEAD = BAL3.squad.wallLead;
//  가장 느린 탄 속도(현재 heavy 650). coverZ 공식이 여기에 매달려 있다(더 느린 무기를 넣으면 배제가 다시 열린다).
//  r3.10: 사거리 제한(range)이 있는 무기(산탄포 520)는 제외 — 1~3스테이지엔 등장하지 않고, 등장하는 스테이지는 24스테이지 설계에서
//   그 무기의 사거리(range)가 통까지의 거리보다 짧은지까지 포함해 coverZ 를 다시 계산한다(STG-4 가 그 스테이지에서 잡는다)
export const VZ_MIN = Math.min(...Object.values(WEAPONS).filter((w) => w.range == null).map((w) => w.vz));
//  대형 최대 깊이(coverZ 가 전제하는 대형 = coverDepthUnits 150 명의 dy 최대). 탄은 부대 중심이 아니라 run.z - dy 에서 출발하므로 그만큼 더 날아간다.
//   r3.21 에서 unitCap 이 100 으로 내려갔지만 보정선의 깊이 기준은 150 으로 고정한다(더 얕은 대형은 더 빨리 닿으므로 보수적 — balance.squad 주석)
export const MAX_DY = Math.max(...formation(BAL3.squad.coverDepthUnits).map((p) => p.dy));

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
    //  r3.22 지옥 전용(이사 소감 2026-09-22 "지옥도 아직 너무 쉽다"): 학습판이라 잡졸뿐이어서 지옥에서도 손실 0 으로 흘렀다
    //   → 저격수 2(원거리에서 병력을 깎는다) + 돌격체 2(부대에 닿는다).
    //  r4.2(2026-09-25): 이름만 brutalSpawns → extraSpawns. 기본 줄(brutal, 게임 화면)에서만 붙고 검사용 배수 1 줄(normal)은 읽지 않는다 — 배치·순서 불변
    extraSpawns: [
      //  r3.25 손맛(이사 관찰 2026-09-23 "여러 대 맞아야 터지는 적의 손맛"): 체력 10 잡졸 무리 — 1~3 은 구간 배율을 올리면
      //   어려움 2번 성공 경로가 깨져(스윕 2026-09-23) 지옥 1번에만 **체력을 명시한** 단단한 무리로 여러 발 맞는 장면을 준다
      { z: 3300, kind: 'grunt', n: 4, xs: [130, 200, 280, 350], corridorHw: null, hp: 10 },
      { z: 2600, kind: 'shooter', n: 2, xs: [160, 320], corridorHw: null },
      { z: 4600, kind: 'shooter', n: 3, xs: [130, 240, 350], corridorHw: null },
      { z: 6300, kind: 'rusher', n: 3, xs: [140, 240, 340], corridorHw: null },
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
    //  r4.7 현상금 적(게임 화면 줄 brutal 에서만 — 배수 1 줄은 읽지 않는다, version 불변). 배치 규칙·체력 계산은 계약서 r4.7 (c)
    bounties: [{ z: 5900, x: 240 }],
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
    //  r4.7 현상금 적(게임 화면 줄 brutal 에서만, version 불변)
    bounties: [{ z: 4100, x: 240 }],
  },
};

//  격리 시제품(r3.11, 2026-09-19 · 실게임 구현계획 §7 착수 2): STAGE_IDS 에 넣지 않는다 — 타이틀·봇 실측·기록과 분리.
//  셸은 rush3.html?stage=proto3 로만 연다(기록 저장 없음). 도로 80~400 을 3등분한 세 칸 행 + 사선만 막는 차폐물(kind 'cover').
const T3 = [80, 80 + 320 / 3, 80 + 640 / 3, 400];
export const PROTO_IDS = ['proto3'];
export const PROTO_DEFS = {
  proto3: {
    version: 1, title: '세 갈래', startUnits: 6, startWeapon: 'rifle', length: 5200, eliteZ: 4800,
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

let COURSES = null;
function courses() { return COURSES ?? (COURSES = makeCourses({ coverZFor })); }
function def(id) {
  const d = DEFS[id] ?? courses()[id] ?? PROTO_DEFS[id];
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
//  capMul(r3.22 지옥 강화 손잡이) = 난이도 gateCapMul — 칸 상한(쏴서 올릴 수 있는 최대)에 곱한다. 1 = 불변.
//   양수 칸은 초기 값 아래로 내려가지 않고, 음수 칸의 상한은 1 이상. 결과 정수(반올림)
function capFor(value, max, capMul) {
  if (capMul === 1 || max == null) return max;
  const m = Math.round(max * capMul);
  return value > 0 ? Math.max(value, m) : Math.max(1, m);
}
function makeRow(idx, g, capMul = 1) {
  const cells = g.cells.map(([x0, x1, value, maxValue]) => ({ x0, x1, value, maxValue: capFor(value, maxValue ?? g.maxValue, capMul), flashT: 0 }));
  const armZ = g.armZ === undefined ? BAL3.gate.armZ : g.armZ;
  return { id: 'g' + idx, z: g.z, h: BAL3.gate.h, cells, passed: false, bypass: !!g.bypass,
           armZ, armed: armZ == null, hint: g.hint ?? null };
}

// 보급 통: 계약서 3-3 필드 전부 초기값 포함
//  move(r3.13 차량) = { x0, x1, period } 복사본(구조 공유 금지 — buildStage 두 번이 deepEqual 이되 참조는 다르다). 정지 통은 null
//  capsule(r3.14 구출 캡슐) = payload { n }(생략 시 supply.CAPSULE_N_DEFAULT). 이 분기가 없으면 chain payload 로 떨어져 합류 수가 NaN 이 된다
//  armZ(r3.18) = true 면 BAL3.supply.armZ(440), 숫자면 그대로, 없으면 null(항상 활성 — 종전 통 전부)
function makeSupplyDef(idx, s) {
  let payload;
  if (s.kind === 'soldier') payload = { n: s.n };
  else if (s.kind === 'weapon') payload = { weapon: s.weapon };
  else if (s.kind === 'capsule') payload = { n: s.n ?? CAPSULE_N_DEFAULT };
  else payload = { pads0: s.pads0, maxPads: s.maxPads };
  return { id: 'c' + idx, z: s.z, x: s.x, r: BAL3.supply.r, kind: s.kind,
           durability: s.durability, maxDurability: s.durability,
           payload, opened: false, missed: false, locked: false, skipped: false, pads: [],
           coverZ: s.coverZ ?? null, pairId: s.pairId ?? null, hint: s.hint ?? null,
           move: s.move ? { x0: s.move.x0, x1: s.move.x1, period: s.move.period } : null,
           armZ: s.armZ === true ? BAL3.supply.armZ : (s.armZ ?? null) };
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
//  적 체력(r3.21 B안): ev.hp 를 **항상** 명시 = round((정의 hp ?? 표 hp) × 스테이지 구간 배율(hpMul) × 난이도 enemyHp). 정의에 hp 가 있는 무리(장갑체 10 등)도
//   같은 배율을 받는다 — '명시 hp 는 그대로' 원칙(r3.3)은 이사 결정으로 폐기. combat.spawnEnemy 는 ev.hp 를 그대로 쓴다(소환 잡졸은 enemyDefs 표가 같은 배율).
function makeSpawn(id, sp, walls, mult, hpMul) {
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
  const ev = { z: evZ, kind: sp.kind, n, xs, zs, corridorHw: sp.corridorHw ?? null,
               hp: Math.round((sp.hp ?? BAL3.enemies[sp.kind].hp) * hpMul * mult.enemyHp) };
  //  역할 근사용 그림 교체(B-3): 규칙은 읽지 않고 렌더만 본다
  if (sp.skin) ev.skin = sp.skin;
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

//  정예 정의 정규화(r3.16 복수 정예): `elites` 배열 우선, 없으면 단수 `elite` 를 배열 1개로. 원소마다 새 객체(구조 공유 금지).
//   z = 원소 z ?? 정의 eliteZ · hp = round(hp × eliteHp 배수) · summon 은 불리언으로 · skin/x/role/patrol 은 정의에 있을 때만(단수 정의 = 종전 키 집합 그대로).
//   ⚠️hp 는 **원값**을 받는다 — 여기서 한 번만 배수를 곱하므로 호출부(아레나 등 파생 정의)가 미리 곱하면 이중 배수가 된다
//   아레나(r3.17): 정의에 elite/elites 가 없고 arena 가 있으면 arena.boss 에서 원값 { z: arena.z, hp, summon: !!summon, skin } 을 **파생**한다 —
//   한 정의에서 두 표현이 갈라지지 않게 hp·skin·summon 은 arena.boss 에만 적는다. 파생 원소는 단수 정의와 키 집합이 같다(아레나 표지는 stage.arena 하나)
function makeElites(d, mult) {
  const defs = d.elites ?? (d.elite ? [d.elite] : d.arena
    ? [{ z: d.arena.z, hp: d.arena.boss.hp, summon: !!d.arena.boss.summon, ...(d.arena.boss.skin ? { skin: d.arena.boss.skin } : {}) }]
    : []);
  return defs.map((e) => ({
    z: e.z ?? d.eliteZ, hp: Math.round(e.hp * mult.eliteHp), summon: !!e.summon,
    ...(e.skin ? { skin: e.skin } : {}),
    ...(e.x != null ? { x: e.x } : {}),
    ...(e.role ? { role: e.role } : {}),
    ...(e.patrol != null ? { patrol: e.patrol } : {}),
  }));
}

// 스테이지 전체를 새 객체로 조립. 재도전 = 재호출(이전 판의 durability/value/passed/opened 가 남지 않는다)
//  난이도(3-8)는 여기서 한 번 박힌다: stage.difficulty · rows 스폰 n(spawnCount) · 정예 hp(eliteHp, 반올림).
//  적 hp·적탄·접촉·정예 발사 빈도는 createRun 이 stage.difficulty 를 읽어 run.enemyDefs 로 만든다. 게이트·통·벽·시작 병력·무기는 난이도와 무관.
//  difficulty 생략 = normal = 종전과 완전히 같은 객체(difficulty 필드만 추가).
//  r4.2 두 줄 표: 'brutal'(기본 줄 = 옛 지옥, 게임 화면이 늘 넘긴다) · 'normal'(검사용 배수 1 줄 = 옛 보통, 인자 생략 기본값). 그 밖(지운 'hard' 포함)은 throw.
//  랜덤 길(3-9)은 '재도전 동일 배치' 원칙의 명시적 예외 — lotterySeed 가 판마다 달라 우측 통로만 바뀐다(셸이 시계로 만든다).
/** 아레나 정의 정규화(r3.17): 코스의 `arena: { z, w?, depth?, boss: {...} }` 를 BAL3.arena 기본값과 병합한 사본으로(호출마다 새 객체).
 *  boss 는 { ...BAL3.arena.boss, ...정의 boss, dash/shock 는 칸별 병합, summon/shoot 는 정의에 있을 때만 객체 아니면 null }.
 *  hp 는 여기 두지 않는다 — 진실은 makeElites 가 파생한 stage.elite.hp(난이도 배수 자리도 그쪽). 난이도 배수(접촉·주기)는 createRun 이 한 번 적용한다 */
function makeArena(a) {
  const A = BAL3.arena, B = A.boss, b = a.boss ?? {};
  return {
    z: a.z, w: [...(a.w ?? A.w)], depth: [...(a.depth ?? A.depth)],
    boss: {
      r: b.r ?? B.r, spawnAhead: b.spawnAhead ?? B.spawnAhead, speed: b.speed ?? B.speed,
      touchEvery: b.touchEvery ?? B.touchEvery, touchDmg: b.touchDmg ?? B.touchDmg,
      guard: b.guard ?? B.guard,
      ...(b.skin ? { skin: b.skin } : {}),
      dash: { ...B.dash, ...(b.dash ?? {}) },
      shock: { ...B.shock, ...(b.shock ?? {}) },
      summon: b.summon ? { ...b.summon } : null,
      shoot: b.shoot ? { ...b.shoot } : null,
    },
  };
}

export function buildStage(id, { difficulty = DEFAULT_DIFFICULTY, lotterySeed } = {}) {
  const d = def(id);
  const mult = difficultyMult(difficulty);
  //  빌드 시점 정합성 guard(r3.17): 아레나 정의는 elite/elites 와 함께 쓸 수 없다(보스가 둘로 갈라진다). eliteZ 는 arena.z 와 같아야 한다(stageMeta 가 eliteZ 를 읽는다)
  if (d.arena && (d.elite || d.elites)) throw new Error('stage ' + id + ': arena 와 elite/elites 를 함께 정의할 수 없다');
  if (d.arena && d.eliteZ != null && d.eliteZ !== d.arena.z) throw new Error('stage ' + id + ': eliteZ(' + d.eliteZ + ')가 arena.z(' + d.arena.z + ')와 다르다');
  const walls = d.walls.map((w, i) => makeWall(i + 1, w));
  //  스폰 좌표 보정·랜덤 길은 진짜 벽만 본다(차폐물은 이동을 막지 않는다)
  const solid = walls.filter((w) => w.kind !== 'cover');
  //  적 체력 스테이지 구간 배율(r3.21): 1~3 ×1 … 19~24 ×12. 스폰 ev.hp 에 박히고, createRun 이 run.enemyDefs(소환 잡졸 hp)에도 같은 값을 곱한다
  const hpMul = enemyHpMulFor(id);
  //  난이도 체력 배수 적용 여부(r3.21 대항 검수 반영): 1~3 기준 코스(difficultyHp: false)는 enemyHp·eliteHp 를 ×1 로 읽는다 — 세 난이도의 적·정예 체력이
  //   r3.9 와 같다(hard S2 성공 경로 보존). 빈도(waves·spawnCount)·적탄·접촉 배수는 그대로. stage.difficultyHp 로 createRun 에 흘러 소환 잡졸 hp 도 같은 규칙
  const diffHp = difficultyHpFor(id, difficulty);
  const hpMult = diffHp ? mult : { ...mult, enemyHp: 1, eliteHp: 1 };
  const stage = {
    id, version: d.version ?? 1, difficulty, enemyHpMul: hpMul, difficultyHp: diffHp,
    //  r3.27 보스 페이즈 적용 여부(1·2번 학습 구간 제외 — balance.bossPhases.from)
    bossPhases: id >= BAL3.bossPhases.from,
    title: d.title, startUnits: d.startUnits, startWeapon: d.startWeapon, length: d.length, eliteZ: d.eliteZ ?? d.arena?.z ?? null,
    gateRows: d.gates.map((g, i) => makeRow(i + 1, g, mult.gateCapMul ?? 1)),
    supplies: d.supplies.map((s, i) => makeSupplyDef(i + 1, s)),
    walls,
    //  r3.22 지옥 전용 추가 배치 → r4.2 이름 extraSpawns: 배수 표 줄의 extraSpawns 가 참인 줄(기본 줄 brutal)에서만 정의의 extraSpawns 를
    //   spawns **뒤에** 붙인다(뒤에서 z 순 정렬 — 붙이는 순서는 r3.22 와 같다). 검사용 배수 1 줄(normal)의 배치는 불변. spawns 에 합쳐 두지 않는다(V3-DIFF2ROW)
    spawns: (mult.extraSpawns && d.extraSpawns ? d.spawns.concat(d.extraSpawns) : d.spawns).map(sp => makeSpawn(id, sp, solid, hpMult, hpMul)),
    //  정예(r3.16 복수 정예): 정의 `elites: [...]`(1~3체) 또는 단수 `elite`(배열 1개로 정규화). 원소 z 는 정의의 eliteZ(전원 같은 z 에서 함께 등장).
    //   난이도 배수 eliteHp 는 원소마다 반올림 적용(종전과 같은 자리). role/x/patrol 은 정의에 있을 때만 싣는다 — 단수 정의의 원소는
    //   종전 stage.elite 와 **키 집합까지 같은 모양**({ z, hp, summon(, skin) })이라 C-2·C-6·STG·DIFF 의 읽기가 그대로 통과한다.
    //   role 기본값('elite')·차선 기본값(도로 전체)은 combat.createRun 이 해석한다(stage 에 박지 않는다)
    elites: makeElites(d, hpMult),
    //  배경 번호(C-3 표). 1~3 은 스테이지 번호와 같다
    bg: d.bg ?? (typeof id === 'number' ? Math.min(3, id) : 1),
    //  판 목표(r3.14 구출 캡슐): 정의의 objective { kind, supplyId } 사본. 없는 스테이지는 null(1~3·PROTO·나머지 코스)
    objective: d.objective ? { kind: d.objective.kind, supplyId: d.objective.supplyId } : null,
    //  보너스전(r3.15): 정의의 bonus { sec, targets } → { sec, tiers, targets }(전부 사본 — 호출마다 새 객체). 없는 스테이지는 null.
    //   표적 id 는 't' + 순번(보스 'b'·통 'c'·게이트 'g' 와 접두가 겹치지 않는다 — 저격총 b.hit 목록이 id 를 섞어 담는다).
    //   tiers 는 정의가 적지 않으면 BAL3.bonus.tiers, respawn 은 BAL3.bonus.respawn, r 은 BAL3.bonus.targetR(규칙 모듈 bonus.js 는 balance 를 모른다)
    bonus: d.bonus ? {
      sec: d.bonus.sec,
      tiers: [...(d.bonus.tiers ?? BAL3.bonus.tiers)],
      targets: d.bonus.targets.map((t, i) => ({ id: 't' + (i + 1), dz: t.dz, x0: t.x0, x1: t.x1, period: t.period, phase: t.phase ?? 0,
                                                hp: t.hp, max: t.hp, value: t.value, respawn: t.respawn ?? BAL3.bonus.respawn, r: BAL3.bonus.targetR })),
    } : null,
    //  아레나(r3.17): 정의의 arena 를 BAL3.arena 기본값과 병합한 사본. 없는 스테이지는 null(아레나 표지는 이 칸 하나 — stage.elite 는 순수 모양 유지)
    arena: d.arena ? makeArena(d.arena) : null,
  };
  //  stage.elite = 첫 원소의 별칭(같은 객체 — verdict·기존 읽기용). 정예 없는 스테이지는 null
  stage.elite = stage.elites[0] ?? null;
  //  빌드 시점 정합성 guard(unknown stage 와 같은 계열의 데이터 오류): 목표가 가리키는 통은 반드시 capsule 이어야 한다
  if (stage.objective && stage.objective.kind === 'capsule'
      && !stage.supplies.some((s) => s.id === stage.objective.supplyId && s.kind === 'capsule')) {
    throw new Error('stage ' + id + ': objective supplyId 가 capsule 통을 가리키지 않는다');
  }
  applyLottery(d, stage, lotterySeed);
  //  r4.8 보스전 밀집 대형(이사님 지시 2026-09-26 "병사를 아무리 많이 모아도 보스에 가면 … 모든 총알을 맞게 된다"): 줄 표의 bossHw 가 있는 줄(게임 화면 = brutal)에서만.
  //   보스 등장부터 승리까지 대형 반폭 상한(combat.stepHwCap). 아래 보스 체력 바닥의 상한 화력 계산기도 **같은 대형**으로 잰다(firepower.bossDpsFor — stage.bossHw).
  //   검사용 배수 1 줄(normal)은 이 칸이 없다(종전 판 그대로)
  if (mult.bossHw && stage.elites.length) stage.bossHw = mult.bossHw;
  //  r4.7 보스 체력 바닥(이사님 지시 2026-09-26 "적어도 보스와 30초는 싸울 수 있도록"): 줄 표의 bossFloor 가 참인 줄(게임 화면 = brutal)에서만.
  //   보스 체력 합 ÷ 상한 화력(rush3/firepower.js — 이 판을 가장 잘 했을 때 보스 앞 부대가 보스에 실제로 닿는 초당 피해) ≥ BAL3.bossMinFightSec.
  //   모자라면 비율을 지키며 올린다(옛 체력 아래로는 안 내려간다). 랜덤 길은 풀의 좋은 결과 중 최선으로 계산하므로 추첨 시드와 무관하게 같은 체력이다.
  //   stage.bossFloor = 계산 내역(보고·검사용 — 규칙은 읽지 않는다). 검사용 배수 1 줄(normal)은 이 칸이 없고 체력도 종전 그대로
  if (mult.bossFloor && stage.elites.length) {
    const f = bossFloor(stage);
    stage.elites.forEach((e, i) => { e.hp = f.hp[i]; });
    stage.bossFloor = { sec: f.sec, units: f.units, weapon: f.weapon, mk: f.mk, dps: f.dps, base: f.base, hp: f.hp, minSec: f.minSec };
  }
  //  r4.7 현상금 적(이사님 지시 2026-09-26 "체력이 특수한 높은 일반 적을 배치해서 … 끝까지 쏴야 깰 수 있는 긴장감 … 대신 코인 같은 보상"):
  //   줄 표의 bounty 가 참인 줄(게임 화면 = brutal)에서만 판 정의의 bounties [{ z(발동 z), x }] 를 스폰 1체로 붙인다(물결·무리 수 배수 없음 — makeSpawn 을 거치지 않는다).
  //   체력 = firepower.bountyFloor(그 z 까지의 상한 부대가 사거리 진입부터 닿기까지 줄 수 있는 피해 합 × 0.9). stage.bounties = 계산 내역(보고·검사용 — 규칙은 읽지 않는다)
  if (mult.bounty && d.bounties && d.bounties.length) {
    stage.bounties = d.bounties.map((b) => {
      const f = bountyFloor(stage, b.z);
      stage.spawns.push({ z: b.z, kind: 'bounty', n: 1, xs: [b.x], zs: [b.z + ENTER], corridorHw: null, hp: f.hp });
      return { z: b.z, x: b.x, hp: f.hp, units: f.units, weapon: f.weapon, mk: f.mk, dmg: f.dmg, sec: f.sec };
    });
  }
  stage.spawns.sort((a, b) => a.z - b.z);
  //  보너스 스테이지 불변식 guard(r3.15 검수 반영, 같은 계열의 빌드 시점 데이터 오류): stepBonus 는 셔터·통 이동·스폰·접촉을 부르지 않으므로
  //   게이트·통·스폰 z 가 전부 eliteZ(없으면 length) 이하여야 한다 — 보너스 구간(그 뒤)에 물체를 두면 조용히 멈춘 물체가 생긴다.
  //   랜덤 길·정렬 뒤에 검사한다(추첨으로 붙는 통·게이트까지 본다). V3-BONUS B-1 의 S8 루프는 같은 조건의 실측 대조군
  if (stage.bonus) {
    const endZ = stage.eliteZ ?? stage.length;
    for (const row of stage.gateRows) if (row.z > endZ) throw new Error('stage ' + id + ': 보너스 스테이지의 게이트 ' + row.id + '(z ' + row.z + ')가 보너스 구간(z > ' + endZ + ')에 있다');
    for (const s of stage.supplies) if (s.z + s.r > endZ) throw new Error('stage ' + id + ': 보너스 스테이지의 통 ' + s.id + '(z ' + s.z + ')가 보너스 구간(z > ' + endZ + ')에 있다');
    for (const sp of stage.spawns) if (sp.z > endZ) throw new Error('stage ' + id + ': 보너스 스테이지의 스폰(z ' + sp.z + ')이 보너스 구간(z > ' + endZ + ')에 있다');
  }
  //  아레나 스테이지 불변식 guard(r3.17): 광장에서는 run.z 가 멈추므로 게이트·통·벽·스폰이 전부 arena.z − 800 앞에 끝나야 한다 —
  //   스폰은 발동 z + 760 에 놓이므로 arena.z − 800 이면 진입 순간 z ≤ arena.z − 40(부대 뒤)이고, 정지 저격수라도 정지된 광장 위에 남지 않는다.
  //   (V3-ARENA A-1 이 10·11·24 에서 같은 조건을 실측한다)
  if (stage.arena) {
    const endZ = stage.arena.z - 800;
    for (const row of stage.gateRows) if (row.z > endZ) throw new Error('stage ' + id + ': 아레나 스테이지의 게이트 ' + row.id + '(z ' + row.z + ')가 광장 앞 여유(z > ' + endZ + ')에 있다');
    for (const s of stage.supplies) if (s.z + s.r > endZ) throw new Error('stage ' + id + ': 아레나 스테이지의 통 ' + s.id + '(z ' + s.z + ')가 광장 앞 여유(z > ' + endZ + ')에 있다');
    for (const w of stage.walls) if (w.z1 > endZ) throw new Error('stage ' + id + ': 아레나 스테이지의 벽 ' + w.id + '(z1 ' + w.z1 + ')가 광장 앞 여유(z > ' + endZ + ')에 있다');
    for (const sp of stage.spawns) if (sp.z > endZ) throw new Error('stage ' + id + ': 아레나 스테이지의 스폰(z ' + sp.z + ')이 광장 앞 여유(z > ' + endZ + ')에 있다');
  }
  return stage;
}
