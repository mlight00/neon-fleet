import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK, recordDamageFeedback, readDamageFlash, readLastHitPoint, isDamageFlashTarget,
} from '../js/damage-feedback.js';

const enemy = () => ({ hp: 10, maxHp: 10, indestructible: false });

test('G39-HIT-EFFECTIVE-ONLY: 실효 피해가 0 이면 기록하지 않는다', () => {
  //  ⚠️`hitByBullet` 이 불려도 보호막이 전부 막으면 HP 는 그대로다(affixes.js affixAbsorb).
  //   호출됐다는 이유로 번쩍이면 막힌 타격에 본체가 맞은 것처럼 보인다.
  const e = enemy();
  assert.equal(recordDamageFeedback(e, 5, 5, 1.0, 0), false, '0 피해는 기록 없음');
  assert.equal(readDamageFlash(e, 1.0), 0);
  assert.equal(recordDamageFeedback(e, 5, 5, 1.0, 3), true, '실피해는 기록');
  assert.ok(readDamageFlash(e, 1.0) > 0);
});

test('G39-HIT-DECAY: 플래시는 flashDur 동안 선형 감쇠한다', () => {
  const e = enemy();
  recordDamageFeedback(e, 0, 0, 10, 1);
  assert.equal(readDamageFlash(e, 10), 1, '기록 직후 1');
  const mid = readDamageFlash(e, 10 + FEEDBACK.flashDur / 2);
  assert.ok(Math.abs(mid - 0.5) < 1e-6, `절반 시점 0.5 — 실측 ${mid}`);
  assert.equal(readDamageFlash(e, 10 + FEEDBACK.flashDur), 0, '유지시간 끝나면 0');
  assert.equal(readDamageFlash(e, 10 + 5), 0, '한참 뒤도 0');
});

test('G39-HIT-COOLDOWN: 같은 대상은 flashCooldown 안에 재발동하지 않는다', () => {
  //  ⚠️발칸 연사로 매 타격 최대 밝기가 되면 스트로브가 되어 광과민 위험이 있다.
  const e = enemy();
  recordDamageFeedback(e, 0, 0, 100, 1);
  assert.equal(recordDamageFeedback(e, 0, 0, 100 + 0.1, 1), false, '쿨다운 안에서는 거부');
  assert.equal(recordDamageFeedback(e, 0, 0, 100 + FEEDBACK.flashCooldown, 1), true, '쿨다운 뒤 허용');
});

test('G39-HIT-RATE: 1초 동안 최대 3회까지만 발동한다(광과민 기준)', () => {
  const e = enemy();
  let fired = 0;
  for (let i = 0; i < 60; i++) if (recordDamageFeedback(e, 0, 0, 200 + i / 60, 1)) fired++;
  assert.ok(fired <= 3, `1초에 ${fired}회 — 3회 이하여야 한다`);
});

test('G39-HIT-POINT: 마지막 명중 지점을 남긴다', () => {
  const e = enemy();
  assert.equal(readLastHitPoint(e), null, '기록 전엔 없음');
  recordDamageFeedback(e, 12, 34, 1, 1);
  assert.deepEqual(readLastHitPoint(e), { x: 12, y: 34 });
});

test('G39-HIT-TARGET: 파괴 불가·maxHp 없음은 HP 플래시 대상이 아니다', () => {
  //  Debris(파괴 불가)는 HP 색·몸체 플래시 대상이 아니다 — 기존 금속 스파크만 유지한다.
  assert.equal(isDamageFlashTarget({ hp: 5, maxHp: 5 }), true);
  assert.equal(isDamageFlashTarget({ hp: 5, maxHp: 5, indestructible: true }), false);
  assert.equal(isDamageFlashTarget({ x: 0, y: 0 }), false, 'maxHp 없음');
  assert.equal(isDamageFlashTarget(null), false);
});

test('G39-HIT-NO-MUTATION: 엔티티에 필드를 추가하지 않는다', () => {
  //  ⚠️렌더 전용 상태가 게임 객체로 새면 저장·밸런스·결정성에 영향을 준다.
  const e = enemy();
  const before = Object.keys(e).sort().join(',');
  recordDamageFeedback(e, 1, 2, 1, 5);
  readDamageFlash(e, 1);
  assert.equal(Object.keys(e).sort().join(','), before, '키가 늘면 안 된다');
});
