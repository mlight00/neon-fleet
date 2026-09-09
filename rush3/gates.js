// rush3/gates.js — 사격형 게이트 행. 순수 규칙만(난수·화면·balance 없음). 계약서 3-2.
// row  = { id, z, h, cells, passed, bypass }   cell = { x0, x1, value, maxValue, flashT, rowId, idx }  ([x0,x1) 반열림)
// 유닛 증감은 squad.js 의 addUnits/removeUnits 를 직접 호출한다(콜백 주입 없음).
import { addUnits, removeUnits, layoutUnits } from './squad.js';

export const GATE_H = 24;
export const GATE_MAX_VALUE = 15;
export const GATE_FLASH = 0.12;
export const GATE_COLORS = { good: '#35E5FF', bad: '#FF6A3D', zero: '#9AA1AC' };

// def = { id, z, h?, maxValue?, bypass?, cells: [{ x0, x1, value, maxValue? }] }
export function makeGateRow(def) {
  const rowMax = def.maxValue ?? GATE_MAX_VALUE;
  const row = { id: def.id, z: def.z, h: def.h ?? GATE_H, cells: [], passed: false, bypass: !!def.bypass };
  (def.cells || []).forEach((c, i) => {
    row.cells.push({ x0: c.x0, x1: c.x1, value: Math.trunc(c.value), maxValue: c.maxValue ?? rowMax, flashT: 0, rowId: def.id, idx: i });
  });
  return row;
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

// 탄 스윕 [pz, z] 가 행 z 구간 [row.z - h/2, row.z + h/2] 와 겹치고 x 가 칸 안이면 명중. passed 행은 후보 제외.
export function sweepHitsGate(row, cell, bullet) {
  if (row.passed) return false;
  if (!(bullet.x >= cell.x0 && bullet.x < cell.x1)) return false;
  const zlo = Math.min(bullet.pz, bullet.z), zhi = Math.max(bullet.pz, bullet.z);
  const half = row.h / 2;
  return zhi >= row.z - half && zlo <= row.z + half;
}

// 탄 1발 → 칸 값 +gateHit(모든 무기 1, 상한 maxValue). 탄은 흡수(dead). 음수→0 이상 전환은 gateFlip.
export function hitGateCell(cell, bullet, events) {
  const before = cell.value;
  const gain = Math.max(0, Math.trunc(bullet.gateHit ?? 1));
  cell.value = Math.min(cell.maxValue, cell.value + gain);
  cell.flashT = GATE_FLASH;
  bullet.dead = true;
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
    }
  }
  events.push({ type: 'gatePass', id: row.id, value, applied, idx: cell ? cell.idx : -1, x: run.x, z: row.z });
  return true;
}
