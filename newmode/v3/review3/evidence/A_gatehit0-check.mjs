// A_gatehit0-check.mjs — 검토 2번: 탄에 gateHit: 0 을 실으면 기존 hitGateCell(gates.js L80-94)이 어떻게 처리하는지 확인.
//  게임 코드는 그대로 부르기만 한다(수정 없음). 게이트 행은 makeGateRow 로 만든 합성 행.
import { writeFileSync } from 'node:fs';
import { hitGateCell, makeGateRow, isGateCellFixed } from '../../../../rush3/gates.js';

const cases = [];
// ① 열린 칸 + gateHit 0
{ const row = makeGateRow({ id: 'g1', z: 100, armZ: null, cells: [{ x0: 80, x1: 240, value: -3, maxValue: 5 }] });
  const ev = [], b = { x: 100, z: 100, pz: 90, gateHit: 0, dead: false };
  hitGateCell(row, row.cells[0], b, ev);
  cases.push({ case: '열린 칸, gateHit 0', valueBefore: -3, valueAfter: row.cells[0].value, bulletDead: b.dead, events: ev }); }
// ② 열린 칸 + gateHit 없음(기존 탄과 같은 1)
{ const row = makeGateRow({ id: 'g1', z: 100, armZ: null, cells: [{ x0: 80, x1: 240, value: -3, maxValue: 5 }] });
  const ev = [], b = { x: 100, z: 100, pz: 90, dead: false };
  hitGateCell(row, row.cells[0], b, ev);
  cases.push({ case: '열린 칸, gateHit 없음(기본 1)', valueBefore: -3, valueAfter: row.cells[0].value, bulletDead: b.dead, events: ev }); }
// ③ 닫힌 셔터 + gateHit 0
{ const row = makeGateRow({ id: 'g2', z: 500, cells: [{ x0: 80, x1: 240, value: 5, maxValue: 5 }] });
  const ev = [], b = { x: 100, gateHit: 0, dead: false };
  hitGateCell(row, row.cells[0], b, ev);
  cases.push({ case: '닫힌 셔터, gateHit 0', valueBefore: 5, valueAfter: row.cells[0].value, bulletDead: b.dead, events: ev, fixedWhileClosed: isGateCellFixed(row, row.cells[0]) }); }
const out = { generatedBy: 'A_gatehit0-check.mjs', cases };
writeFileSync(new URL('./A_gatehit0-check.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(cases, null, 1));
