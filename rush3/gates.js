// rush3/gates.js — 사격형 게이트 행. 순수 규칙만(난수·화면·balance 없음). 계약서 3-2.
// row  = { id, z, h, cells, passed, bypass, armZ, armed, hint }   cell = { x0, x1, value, maxValue, flashT, rowId, idx }  ([x0,x1) 반열림)
// armZ = 게이트 전용 사격 활성 구간(부대 중심 기준 전방 거리). null 이면 항상 열림.
//  닫힌 셔터(armed === false)에 닿은 탄은 흡수하고 값은 바꾸지 않는다(계약서 3-2 · 개정 r3 1장).
// 유닛 증감은 squad.js 의 addUnits/removeUnits 를 직접 호출한다(콜백 주입 없음).
import { addUnits, removeUnits, layoutUnits } from './squad.js';

export const GATE_H = 24;
export const GATE_MAX_VALUE = 15;
export const GATE_FLASH = 0.12;
export const GATE_ARM_Z = 340;
export const GATE_COLORS = { good: '#35E5FF', bad: '#FF6A3D', zero: '#9AA1AC' };

// def = { id, z, h?, maxValue?, bypass?, armZ?, hint?, cells: [{ x0, x1, value, maxValue? }] }
//  armZ 를 명시하지 않으면 GATE_ARM_Z(340). 명시적 null = 항상 열린 학습용 행
export function makeGateRow(def) {
  const rowMax = def.maxValue ?? GATE_MAX_VALUE;
  const armZ = def.armZ === undefined ? GATE_ARM_Z : def.armZ;
  const row = { id: def.id, z: def.z, h: def.h ?? GATE_H, cells: [], passed: false, bypass: !!def.bypass,
                armZ, armed: armZ == null, hint: def.hint ?? null };
  (def.cells || []).forEach((c, i) => {
    row.cells.push({ x0: c.x0, x1: c.x1, value: Math.trunc(c.value), maxValue: c.maxValue ?? rowMax, flashT: 0, rowId: def.id, idx: i });
  });
  return row;
}

// STEP 3-b: 셔터 갱신. row.z - run.z <= armZ 가 처음 성립하는 STEP 에 armed 로 바뀌며 이벤트 gateArm 을 정확히 1회 낸다.
//  run.z 는 감소하지 않으므로(보스전 중 멈출 뿐) 한 번 열린 셔터는 되돌아가지 않는다.
export function updateGateArm(row, run, events) {
  if (row.armed || row.passed) return false;
  if (row.armZ != null && row.z - run.z > row.armZ) return false;
  row.armed = true;
  const cells = row.cells;
  const x = cells.length ? (cells[0].x0 + cells[cells.length - 1].x1) / 2 : 0;
  if (events) events.push({ type: 'gateArm', id: row.id, z: row.z, x });
  return true;
}

// 중심 x가 든 칸([x0,x1) 반열림). 없으면 null(우회로).
export function cellAt(row, x) {
  for (const c of row.cells) if (x >= c.x0 && x < c.x1) return c;
  return null;
}

export function gateColor(value) {
  return value > 0 ? GATE_COLORS.good : value < 0 ? GATE_COLORS.bad : GATE_COLORS.zero;
}

// 부호를 항상 표기(+3 / −6 / 0). 음수 부호는 U+2212.
export function gateLabel(value) {
  return value > 0 ? '+' + value : value < 0 ? '−' + (-value) : '0';
}

// 탄 스윕 [pz, z](중심 x 기준 = 탄 폭 미반영) 와 행 z 구간 [row.z - h/2, row.z + h/2] 의 최초 교차 z.
// x 가 칸 밖이거나 passed 행이면 null. 교차 z = max(행 앞면, 스윕 시작).
export function sweepContactGate(row, cell, bullet) {
  if (row.passed) return null;
  if (!(bullet.x >= cell.x0 && bullet.x < cell.x1)) return null;
  const zlo = Math.min(bullet.pz, bullet.z), zhi = Math.max(bullet.pz, bullet.z);
  const half = row.h / 2;
  if (!(zhi >= row.z - half && zlo <= row.z + half)) return null;
  return Math.max(row.z - half, zlo);
}

// 겹침 여부만(기존 계약 유지). 판정은 sweepContactGate 하나로 모았다.
export function sweepHitsGate(row, cell, bullet) {
  return sweepContactGate(row, cell, bullet) !== null;
}

// 탄 1발 → 칸 값 +gateHit(모든 무기 1, 상한 maxValue). 탄은 흡수(dead). 음수→0 이상 전환은 gateFlip.
//  ⚠️셔터 검사는 여기(hitGateCell)에만 둔다. sweepContactGate 에서 null 을 돌려주면 행이 충돌 후보에서 빠져
//   탄이 '흡수'가 아니라 '통과'해 버린다(개정 r3 §1-5).
export function hitGateCell(row, cell, bullet, events) {
  bullet.dead = true;                       // 흡수는 어느 경우든 일어난다
  if (row && !row.armed) {
    events.push({ type: 'gateBlock', id: row.id, idx: cell.idx, x: bullet.x, z: row.z });
    return true;
  }
  const before = cell.value;
  const gain = Math.max(0, Math.trunc(bullet.gateHit ?? 1));
  cell.value = Math.min(cell.maxValue, cell.value + gain);
  cell.flashT = GATE_FLASH;
  const ev = { id: cell.rowId, idx: cell.idx, value: cell.value, x: (cell.x0 + cell.x1) / 2 };
  if (before < 0 && cell.value >= 0) events.push({ type: 'gateFlip', ...ev });
  else events.push({ type: 'gateHit', ...ev });
  return true;
}

// prevZ < row.z <= z 인 STEP 에 중심 x 의 칸 1개만 적용. 행 단위 passed. 이벤트 gatePass { id, value, applied }.
// 유닛 증감은 squad.js 직접: 양수 = addUnits(cap 클램프·layoutUnits 포함), 음수 = removeUnits(뒤에서) 후 layoutUnits.
export function passGateRow(row, run, events) {
  if (row.passed) return false;
  if (!(run.prevZ < row.z && row.z <= run.z)) return false;
  row.passed = true;
  const cell = cellAt(row, run.x);
  let value = 0, applied = 0;
  if (cell) {
    value = cell.value;
    if (value > 0) applied = addUnits(run, value);
    else if (value < 0) {
      const removed = removeUnits(run.units, -value, 'back');
      layoutUnits(run.units);
      applied = -removed;
      run.lossByGate = (run.lossByGate || 0) + removed;
      run.badGatesPassed = (run.badGatesPassed || 0) + 1;
      //  결과 화면 제안(advice.js)이 '마지막으로 통과한 음수 게이트'를 정확히 짚게 하는 표식
      run.lastBadGateId = row.id;
    }
  }
  events.push({ type: 'gatePass', id: row.id, value, applied, idx: cell ? cell.idx : -1, x: run.x, z: row.z });
  return true;
}
