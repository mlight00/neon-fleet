import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK, writeDamageColor } from '../js/damage-feedback.js';

test('G39-COLOR-FULL: 체력 100% · 피격 없음이면 원본색(1,1,1)', () => {
  const s = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(s, 1, 0, FEEDBACK.boost);
  assert.deepEqual([s.cr, s.cg, s.cb], [1, 1, 1]);
});

test('G39-COLOR-NO-ALLOC: 호출자 슬롯에 직접 쓰고 그 객체를 돌려준다', () => {
  //  ⚠️새 객체를 반환하면 적 수만큼 매 프레임 임시 객체가 생긴다(무할당 계약 위반).
  const s = { cr: 0, cg: 0, cb: 0 };
  assert.equal(writeDamageColor(s, 0.5, 0, FEEDBACK.boost), s, '같은 객체여야 한다');
});

test('G39-COLOR-DAMAGE: 체력이 낮을수록 붉어진다(R 유지 · G/B 감쇠)', () => {
  const hi = { cr: 0, cg: 0, cb: 0 }, lo = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(hi, 0.66, 0, FEEDBACK.boost);
  writeDamageColor(lo, 0.10, 0, FEEDBACK.boost);
  assert.ok(lo.cg < hi.cg, `G 가 더 낮아야 한다 — 0.66:${hi.cg} vs 0.10:${lo.cg}`);
  assert.ok(lo.cb < hi.cb, 'B 도 더 낮아야 한다');
  assert.ok(lo.cr >= lo.cg && lo.cr >= lo.cb, '붉은 쪽이 남아야 한다');
});

test('G39-COLOR-LATE-ONSET: 0.66 위에서는 거의 변하지 않는다', () => {
  //  ⚠️초반부터 붉으면 적이 몰릴 때 화면 전체가 붉어진다(설계 §11 위험).
  const s = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(s, 0.8, 0, FEEDBACK.boost);
  assert.ok(s.cg > 0.9, `체력 80% 에서 G ${s.cg} — 0.9 초과여야 한다`);
});

test('G39-COLOR-FLASH: 피격이면 전 채널이 밝아지고 최대 배수를 넘지 않는다', () => {
  const n = { cr: 0, cg: 0, cb: 0 }, f = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(n, 1, 0, FEEDBACK.boost);
  writeDamageColor(f, 1, 1, FEEDBACK.boost);
  assert.ok(f.cr > n.cr && f.cg > n.cg && f.cb > n.cb, '전 채널이 밝아진다');
  assert.ok(f.cr <= FEEDBACK.boost + 1e-9, `최대 ${FEEDBACK.boost} 배 이하 — 실측 ${f.cr}`);
});

test('G39-COLOR-COMPOSE: 저체력 적이 맞으면 "붉은 채로" 밝아진다', () => {
  //  ⚠️곱 합성이라 색 비율이 유지돼야 한다. 흰색으로 뭉개지면 체력 정보가 사라진다.
  const lo = { cr: 0, cg: 0, cb: 0 }, loFlash = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(lo, 0.15, 0, FEEDBACK.boost);
  writeDamageColor(loFlash, 0.15, 1, FEEDBACK.boost);
  const ratio0 = lo.cg / lo.cr, ratio1 = loFlash.cg / loFlash.cr;
  assert.ok(Math.abs(ratio0 - ratio1) < 1e-9, `G/R 비율 유지 — ${ratio0} vs ${ratio1}`);
});

test('G39-COLOR-REDUCED: reduced-motion 배수가 더 약하다', () => {
  const a = { cr: 0, cg: 0, cb: 0 }, b = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(a, 1, 1, FEEDBACK.boost);
  writeDamageColor(b, 1, 1, FEEDBACK.boostReduced);
  assert.ok(b.cr < a.cr, `약해야 한다 — ${b.cr} < ${a.cr}`);
  assert.ok(b.cr > 1, '그래도 1 보다는 밝다(정보는 남긴다)');
});

test('G39-COLOR-CLAMP: hpFrac 범위 밖·비정상 입력을 방어한다', () => {
  const s = { cr: 0, cg: 0, cb: 0 };
  for (const bad of [-1, 2, NaN, undefined, null]) {
    writeDamageColor(s, bad, 0, FEEDBACK.boost);
    for (const v of [s.cr, s.cg, s.cb]) {
      assert.ok(Number.isFinite(v) && v >= 0 && v <= FEEDBACK.boost, `${bad} → ${v}`);
    }
  }
});
