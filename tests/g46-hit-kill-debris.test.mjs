// §G-46 — 적 피격·격파 3D 파편.
//
// 이사님 요청: "3D 에서 적 피탄이 빨간 번쩍뿐이라 밋밋하다" → 파편, 그리고 "터질 때도".
// 여기서 지키는 것: 상승 에지 1회성 · 품질 사다리 연동 · 전역 RNG 미소비 · 예산 상한 · 배선.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordDamageFeedback, consumeHitSpark, readDamageFlash, FEEDBACK } from '../js/damage-feedback.js';
import { writeEnemySlot } from '../js/chase3d-collect.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const enemy = (hp = 10, maxHp = 10) => ({ hp, maxHp, x: 0, y: 0 });
const DEF = { len: 150, max: 300 };

test('consumeHitSpark: 한 번 맞으면 한 번만 나온다', () => {
  const e = enemy();
  assert.equal(consumeHitSpark(e), false, '맞은 적 없는데 파편이 나온다');

  recordDamageFeedback(e, 0, 0, 0, 3);
  assert.equal(consumeHitSpark(e), true, '피격 직후 1회분이 안 나온다');
  assert.equal(consumeHitSpark(e), false, '같은 피격으로 두 번 나온다');
  assert.equal(consumeHitSpark(e), false);

  //  쿨다운(0.34s) 뒤 새 피격 → 다시 한 번
  recordDamageFeedback(e, 0, 0, FEEDBACK.flashCooldown + 0.01, 3);
  assert.equal(consumeHitSpark(e), true, '새 피격인데 안 나온다');
  assert.equal(consumeHitSpark(e), false);
});

test('감쇠값(flash)으로 판정하면 안 되는 이유 — 여러 프레임 0이 아니다', () => {
  //  이 테스트가 설계 근거다. flash>0 으로 방출하면 한 번 맞을 때마다 프레임 수만큼 쏟아진다.
  const e = enemy();
  recordDamageFeedback(e, 0, 0, 0, 3);
  let framesNonZero = 0;
  for (let t = 0; t < FEEDBACK.flashDur; t += 1 / 60) if (readDamageFlash(e, t) > 0) framesNonZero++;
  assert.ok(framesNonZero >= 2, `flash>0 인 프레임이 ${framesNonZero}개뿐 — 전제가 바뀌었다`);
  //  반면 spark 는 정확히 1회
  let sparks = 0;
  for (let t = 0; t < FEEDBACK.flashDur; t += 1 / 60) if (consumeHitSpark(e)) sparks++;
  assert.equal(sparks, 1, 'spark 가 1회가 아니다');
});

test('writeEnemySlot 이 spark·hp 를 슬롯에 기록한다', () => {
  const e = enemy(3, 10);
  const slot = {};
  const p = { x: 100, y: 200, scale: 1 };

  writeEnemySlot(slot, e, p, DEF, 0, 0, FEEDBACK.boost);
  assert.equal(slot.spark, 0, '맞지도 않았는데 spark 가 섰다');
  assert.ok(Math.abs(slot.hp - 0.3) < 1e-9, 'hp 비율이 슬롯에 안 들어온다');

  recordDamageFeedback(e, 0, 0, 1, 2);
  writeEnemySlot(slot, e, p, DEF, 0, 1, FEEDBACK.boost);
  assert.equal(slot.spark, 1, '피격 후 spark 가 안 선다');
  writeEnemySlot(slot, e, p, DEF, 0, 1, FEEDBACK.boost);
  assert.equal(slot.spark, 0, '같은 피격으로 다음 프레임에도 spark 가 선다');
});

test('죽은 적은 spark 를 내지 않는다 — 격파 연출이 담당한다', () => {
  const e = enemy();
  recordDamageFeedback(e, 0, 0, 0, 3);
  e.dead = true;
  const slot = {};
  writeEnemySlot(slot, e, { x: 0, y: 0, scale: 1 }, DEF, 0, 0, FEEDBACK.boost);
  //  isDamageFlashTarget 이 dead 를 막으므로 flash 는 0. spark 는 기록 자체가 남아 있어 1회는 나올 수 있으나
  //  main 은 죽은 적을 3D 목록에 넣지 않는다. 여기서는 flash 가 0 인 것만 고정한다(§G39-R2 계약).
  assert.equal(readDamageFlash(e, 0), 0, '죽은 적의 flash 가 0 이 아니다 — G39-R2 회귀');
});

// ── 렌더러 배선 (main.js·renderer 는 export 가 없어 정적 검사) ──────────────────────────

const R = readFileSync(join(ROOT, 'js/chase3d-renderer.js'), 'utf8');
const M = readFileSync(join(ROOT, 'js/main.js'), 'utf8');

test('파편 버퍼가 적까지 감당하도록 늘었다', () => {
  const m = R.match(/const DEBRIS_MAX\s*=\s*(\d+)/);
  assert.ok(m, 'DEBRIS_MAX 를 찾지 못했다');
  assert.ok(+m[1] >= 48, `DEBRIS_MAX 가 ${m[1]} — 적 피격까지 쓰려면 48 이상이어야 한다`);
});

test('방출이 공용 함수 하나로 모였다 — 기함도 같은 경로를 쓴다', () => {
  assert.ok(/function emitDebris\(/.test(R), 'emitDebris 공용 방출기가 없다');
  //  기함 피격이 옛날처럼 _deb.push 를 직접 하지 않는지
  const flagBlock = R.slice(R.indexOf('_prevFlash + 0.1'), R.indexOf('_prevFlash = fl'));
  assert.ok(/emitDebris\(/.test(flagBlock), '기함 피격이 공용 방출기를 안 쓴다');
  assert.ok(!/_deb\.push\(/.test(flagBlock), '기함 피격이 아직 _deb.push 를 직접 한다');
});

test('품질 사다리에 물려 있다 — 프레임이 모자라면 파편이 먼저 준다', () => {
  assert.ok(/function debrisBudget\(/.test(R), 'debrisBudget 이 없다');
  const b = R.slice(R.indexOf('function debrisBudget('), R.indexOf('function debrisBudget(') + 600);
  assert.ok(/qualityStep/.test(b), '품질 단계(qualityStep)를 안 본다 — §G-45 사다리와 무관해진다');
  assert.ok(/prefersReducedMotion3D\(\)/.test(b), 'reduced-motion 을 존중하지 않는다');
});

test('프레임당 방출 상한이 있다 — 적 60기 동시 피격에도 폭주하지 않는다', () => {
  assert.ok(/DEBRIS_PER_FRAME/.test(R), '프레임 예산 상수가 없다');
  //  ⚠️`_debFrameBudget = DEBRIS_PER_FRAME` 한 번만 세면 **선언문**에도 걸려, 프레임 초기화를
  //   통째로 지워도 통과한다(돌연변이 M3 로 실제 확인). 선언 + 초기화 = 최소 2회여야 한다.
  const assigns = (R.match(/_debFrameBudget\s*=\s*DEBRIS_PER_FRAME/g) || []).length;
  assert.ok(assigns >= 2,
    `_debFrameBudget 대입이 ${assigns}곳 — 선언만 있고 프레임 초기화가 없다. 예산이 한 번 소진되면 영영 안 돌아온다`);
  //  차감도 실제로 하는가 (예산을 세기만 하고 안 쓰면 무의미)
  assert.ok(/_debFrameBudget\s*-=/.test(R), '예산을 차감하지 않는다');
});

test('격파는 큐를 거친다 — 적이 사라진 뒤엔 좌표를 알 수 없기 때문', () => {
  assert.ok(/ctl\.killBurst\s*=/.test(R), 'killBurst 진입점이 없다');
  assert.ok(/KILL_Q_MAX/.test(R), '킬 큐 상한이 없다 — 3D 가 꺼져 있으면 무한히 쌓인다');
  //  main 이 중앙 킬 알림에서 부르는가
  const kill = M.slice(M.indexOf('function onEnemyKilled('), M.indexOf('function onEnemyKilled(') + 1200);
  assert.ok(/chase3d\.killBurst\(/.test(kill), 'onEnemyKilled 이 killBurst 를 부르지 않는다');
  assert.ok(/try\s*\{/.test(kill), '연출 호출이 try 로 감싸이지 않았다 — 실패가 킬 처리를 막는다');
});

test('⚠️전역 Math.random 을 쓰지 않는다 — 쓰면 전투 결과가 달라진다', () => {
  //  주석 속 언급은 제외하고 실제 호출만 센다.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const code = strip(R);
  const start = code.indexOf('function emitDebris(');
  const end = code.indexOf('function debrisBudget(') + 700;
  const region = code.slice(start, end);
  assert.ok(!/Math\.random\s*\(/.test(region), '파편 방출·예산 경로가 전역 Math.random 을 쓴다');
  //  killBurst 경로(main)도
  const killCode = strip(M).slice(M.indexOf('function onEnemyKilled('), M.indexOf('function onEnemyKilled(') + 1200);
  assert.ok(!/Math\.random\s*\(/.test(killCode), '격파 연출 경로가 전역 Math.random 을 쓴다');
});

test('색 쓰기 실패가 3D 전체를 끄지 않는다 — 국소 격리', () => {
  const i = R.indexOf('_debColored');
  assert.notEqual(i, -1, '_debColored 플래그가 없다');
  const region = R.slice(R.indexOf('debris.setColorAt'), R.indexOf('debris.setColorAt') + 300);
  assert.ok(/catch/.test(region), 'setColorAt 이 try/catch 로 감싸이지 않았다');
  assert.ok(/_debColored\s*=\s*false/.test(region), '실패 시 색만 포기하고 계속 가는 경로가 없다');
});
