// rush3-advice — 결과 화면 제안 한 줄(계약서 6장 · 개정 r3 §6-2, V3-HINT). advice.js 는 순수 모듈이라 셸을 import 하지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviceLine, ADVICE_DEFAULT } from '../rush3/advice.js';
import { buildStage } from '../rush3/stages.js';
import { createRun } from '../rush3/combat.js';
import { playPolicy } from './lib/rush3-policies.mjs';

//  최소 run: 손실 집계 + 행·통만 있으면 된다
function mkRun(o = {}) {
  return {
    won: false, lossByGate: 0, lossByShot: 0, lossByTouch: 0, missedSupplies: 0, skippedSupplies: 0,
    lastBadGateId: null, gateRows: [], supplies: [], ...o,
  };
}
const row = (id, z, value, hint, passed = true) => ({ id, z, passed, cells: [{ x0: 80, x1: 400, value, maxValue: 40, idx: 0 }], hint });
const sup = (id, z, o = {}) => ({ id, z, x: 150, r: 30, kind: 'soldier', missed: false, skipped: false, hint: null, ...o });

test('V3-HINT: 1순위 = 마지막으로 통과한 음수 게이트 행의 hint', () => {
  const r = mkRun({
    lossByGate: 3, missedSupplies: 1, lossByShot: 5, lossByTouch: 2, lastBadGateId: 'g2',
    gateRows: [row('g1', 1140, -6, '첫 행 안내'), row('g2', 5400, -20, '둘째 행 안내')],
    supplies: [sup('c1', 2300, { missed: true, hint: '통 안내' })],
  });
  assert.equal(adviceLine(r, null), '둘째 행 안내');
  //  hint 가 없으면 기본 게이트 문구
  const r2 = mkRun({ lossByGate: 3, lastBadGateId: 'g1', gateRows: [row('g1', 1140, -6, null)] });
  assert.equal(adviceLine(r2, null), ADVICE_DEFAULT.gate);
});

test('V3-HINT: 2순위 = 놓친(missed) 통 중 z 가 가장 작은 통의 hint — skipped 는 후보에서 제외', () => {
  const r = mkRun({
    missedSupplies: 2, lossByShot: 9,
    supplies: [
      sup('c9', 6300, { skipped: true, missed: true, hint: '이건 의도된 선택이라 나오면 안 된다' }),
      sup('c3', 1900, { missed: true, hint: '앞의 통 안내' }),
      sup('c5', 2800, { missed: true, hint: '뒤의 통 안내' }),
    ],
  });
  assert.equal(adviceLine(r, null), '앞의 통 안내');
  //  skipped 만 있으면 통 순위로 내려가지 않는다(손실 원인 문구로)
  const r2 = mkRun({ missedSupplies: 0, skippedSupplies: 1, lossByTouch: 3,
                     supplies: [sup('c9', 6300, { skipped: true, hint: '나오면 안 된다' })] });
  assert.equal(adviceLine(r2, null), ADVICE_DEFAULT.touch);
});

test('V3-HINT: 3·4순위 = 피격 우세면 저격수 문구, 접촉만이면 돌격체 문구', () => {
  assert.equal(adviceLine(mkRun({ lossByShot: 4, lossByTouch: 2 }), null), ADVICE_DEFAULT.shot);
  assert.equal(adviceLine(mkRun({ lossByShot: 2, lossByTouch: 2 }), null), ADVICE_DEFAULT.shot, '동률이면 피격 문구');
  assert.equal(adviceLine(mkRun({ lossByShot: 1, lossByTouch: 5 }), null), ADVICE_DEFAULT.touch);
});

test('V3-HINT: 5순위 = 성공 판은 반대쪽 보급 문구, 실패 판은 null(셸이 missedLine 을 쓴다)', () => {
  assert.equal(adviceLine(mkRun({ won: true }), null), ADVICE_DEFAULT.won);
  assert.equal(adviceLine(mkRun({ won: false }), null), null);
  assert.equal(adviceLine(null, null), null);
});

test('V3-HINT: 결정적이다(같은 run 이면 항상 같은 문구) · 배치의 hint 를 stage 로도 찾는다', () => {
  const r = mkRun({ missedSupplies: 1, supplies: [sup('c1', 2300, { missed: true })] });
  const stage = { supplies: [{ id: 'c1', hint: '배치가 가진 문구' }] };
  assert.equal(adviceLine(r, stage), '배치가 가진 문구');
  for (let i = 0; i < 5; i++) assert.equal(adviceLine(r, stage), '배치가 가진 문구');
});

test('V3-HINT: 실제 배치의 통·게이트에 hint 문구가 들어 있다(어절 중간 줄바꿈 없이 한 줄)', () => {
  for (const id of [1, 2, 3]) {
    const st = buildStage(id);
    for (const s of st.supplies) {
      assert.equal(typeof s.hint, 'string', 'S' + id + ' ' + s.id + ' hint');
      assert.ok(s.hint.length > 0 && !s.hint.includes('\n'));
    }
    for (const row2 of st.gateRows) {
      if (row2.hint === null) continue;      // S1 첫 학습용 행은 안내가 없다
      assert.ok(typeof row2.hint === 'string' && row2.hint.length > 0);
    }
  }
  //  createRun 이 만든 run 의 통·행도 hint 를 그대로 물고 온다
  const run = createRun(buildStage(3));
  assert.equal(typeof run.supplies[0].hint, 'string');
  assert.equal(typeof run.gateRows[0].hint, 'string');
  assert.equal(run.skippedSupplies, 0);
  assert.equal(run.lastBadGateId, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-HINT-N1(2026-09-17 2차 검수 N1) — 실패 안내는 **그 판에서 실제로 할 수 있는 행동**이어야 한다.
//  S2 는 2명으로 시작하고 첫 게이트(z1140) 앞에는 보급이 없다. 옛 문구 '병력이 더 모인 뒤에 오른쪽'은
//  같은 첫 게이트를 더 많은 병력으로 다시 만날 방법이 없어 실행 불가능한 권유였다.
// ─────────────────────────────────────────────────────────────────────────────
test('V3-HINT-N1: S2 첫 게이트 우측을 골라 전멸한 판의 제안 한 줄이 실행 가능한 다음 행동을 알려준다', () => {
  //  우측 고정 봇 = 검수가 재현한 조건(오른쪽에 서서 쏘다 −20 칸을 통과)
  const { run } = playPolicy(2, 'right', 14400);
  assert.equal(run.over, true);
  assert.equal(run.won, false);
  assert.equal(run.lastBadGateId, 'g1', '마지막으로 통과한 음수 게이트 = S2 첫 게이트');
  assert.equal(run.lossByGate, 2, '2명으로 시작해 −20 칸에서 둘 다 잃는다');
  assert.ok(run.time < 10, '약 6초 만에 끝난다: ' + run.time.toFixed(2));
  const line = adviceLine(run, run);
  assert.equal(line, '첫 갈림길은 왼쪽 +칸으로 통과하세요. 뒤에서 병력을 모아 큰 게이트에 도전할 수 있어요.');
  //  배치의 hint 가 1순위로 그대로 나온다(기본 문구로 떨어지지 않는다)
  assert.equal(line, buildStage(2).gateRows[0].hint);
  //  옛 문구(그 자리에서 실행할 수 없는 권유)는 배치에도 기본 문구에도 남아 있지 않다
  for (const s of [line, ADVICE_DEFAULT.gate]) {
    assert.ok(!/병력이 더 모인 뒤/.test(s), '실행 불가능한 옛 문구가 남아 있다: ' + s);
  }
});

test('V3-HINT-N1: 기본 게이트 문구도 지금 할 수 있는 행동이다(배치에 hint 가 없을 때)', () => {
  const r = mkRun({ lossByGate: 4, lastBadGateId: 'g1', gateRows: [row('g1', 1140, -20, null)] });
  assert.equal(adviceLine(r, null), ADVICE_DEFAULT.gate);
  //  '피할 수 있다 + 한 칸 옆으로' = 같은 판에서 바로 해 볼 수 있는 행동
  assert.ok(/옆/.test(ADVICE_DEFAULT.gate) && /칸/.test(ADVICE_DEFAULT.gate), ADVICE_DEFAULT.gate);
  //  행에 hint 가 있으면 언제나 그것이 이긴다(우선순위 1의 뜻)
  const r2 = mkRun({ lossByGate: 4, lastBadGateId: 'g1', gateRows: [row('g1', 1140, -20, '배치 문구가 이긴다')] });
  assert.equal(adviceLine(r2, null), '배치 문구가 이긴다');
});
