// §G-47 — 보스 페이즈 순수 판정.
//
// ⚠️이 단계에서는 **아직 배선되지 않았다.** 표만 만들고 게임 동작은 그대로다.
//  그래서 여기서 지키는 것은 "배선했을 때 안전한가" 다 — 경계·현행유지·전환 1회성.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOSS_PHASES, bossPhaseAt, consumePhaseChange, hasPhases } from '../js/boss-phases.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('⚠️표에 없는 보스는 현행 유지 — 10종을 한 번에 바꾸지 않는다', () => {
  //  이게 이 설계의 안전장치다. null 이면 bosses.js 는 기존 enraged 경로를 그대로 쓴다.
  assert.equal(bossPhaseAt(100, 100, BOSS_PHASES.B7), null, 'B7 이 페이즈를 갖는다 — 아직 검증 안 된 보스다');
  assert.equal(bossPhaseAt(100, 100, undefined), null);
  assert.equal(bossPhaseAt(100, 100, []), null);
  assert.equal(hasPhases('B7'), false);
  assert.equal(hasPhases('B8'), true, 'B8 은 검증 대상이라 표에 있어야 한다');
});

test('임계 경계에서 정확히 넘어간다', () => {
  const P = BOSS_PHASES.B8;
  const at = (frac) => bossPhaseAt(frac * 3500, 3500, P).index;
  assert.equal(at(1.00), 0, '만피는 1페이즈');
  assert.equal(at(0.67), 0, '66% 직전은 아직 1페이즈');
  assert.equal(at(0.66), 1, '66% 정각에 2페이즈 — 경계 포함');
  assert.equal(at(0.50), 1, '50% 는 2페이즈');
  assert.equal(at(0.34), 1, '33% 직전은 아직 2페이즈');
  assert.equal(at(0.33), 2, '33% 정각에 3페이즈');
  assert.equal(at(0.01), 2, '빈사는 3페이즈');
});

test('체력 0 이하·비정상 값에도 안전하다 — 사망 프레임에 깜빡이면 안 된다', () => {
  const P = BOSS_PHASES.B8;
  assert.equal(bossPhaseAt(0, 3500, P).index, 2, '체력 0 에서 마지막 페이즈여야 한다');
  assert.equal(bossPhaseAt(-50, 3500, P).index, 2, '음수 체력에서 null 이면 연출이 끊긴다');
  assert.equal(bossPhaseAt(9999, 3500, P).index, 0, '체력이 최대를 넘어도 1페이즈');
  assert.equal(bossPhaseAt(100, 0, P), null, 'maxHp 0 은 판정 불가 → 현행 유지');
  assert.equal(bossPhaseAt(100, -1, P), null);
});

test('페이즈마다 실제로 다른 공격을 한다 — 속도만 바뀌면 지루함이 그대로다', () => {
  //  이사님 지적의 핵심: 광폭화는 같은 패턴을 빨리 할 뿐이었다.
  const P = BOSS_PHASES.B8;
  const kinds = P.map((p) => `${p.kind}+${p.add ?? '-'}`);
  assert.equal(new Set(kinds).size, P.length, `페이즈별 공격 구성이 겹친다: ${kinds.join(' / ')}`);
  //  2페이즈부터는 보조 패턴이 붙어야 "대응이 안 통하는" 변화가 생긴다
  assert.ok(P.slice(1).every((p) => p.add), '2페이즈 이후에 보조 패턴이 없다 — 속도만 바뀐다');
});

test('보조 패턴은 이미 있는 것에서 빌려 쓴다 — 새 공격을 만들지 않는다', async () => {
  const { BAL } = await import('../js/balance.js');
  const known = new Set(Object.values(BAL.bossPatterns).map((p) => p.kind));
  for (const [id, phases] of Object.entries(BOSS_PHASES)) {
    for (const p of phases) {
      assert.ok(known.has(p.kind), `${id}: 모르는 주 패턴 '${p.kind}'`);
      if (p.add) assert.ok(known.has(p.add), `${id}: 모르는 보조 패턴 '${p.add}'`);
    }
  }
});

test('표가 내림차순이다 — 아니면 판정이 어긋난다', () => {
  for (const [id, phases] of Object.entries(BOSS_PHASES)) {
    for (let i = 1; i < phases.length; i++) {
      assert.ok(phases[i].at < phases[i - 1].at,
        `${id}: at 이 내림차순이 아니다 (${phases[i - 1].at} → ${phases[i].at})`);
    }
    assert.equal(phases[0].at, 1.00, `${id}: 첫 페이즈가 만피(1.00)에서 시작하지 않는다`);
  }
});

test('전환 감지: 넘어간 프레임에만 1회 — 매 프레임 터지면 안 된다', () => {
  const boss = {};
  //  첫 관측은 전환이 아니다(전투 시작에 연출이 터지면 안 된다)
  assert.equal(consumePhaseChange(boss, 0), false, '전투 시작에 전환 연출이 터진다');
  assert.equal(consumePhaseChange(boss, 0), false, '같은 페이즈인데 전환으로 잡힌다');
  assert.equal(consumePhaseChange(boss, 1), true, '페이즈가 바뀌었는데 감지 못 한다');
  assert.equal(consumePhaseChange(boss, 1), false, '같은 전환이 두 번 터진다');
  assert.equal(consumePhaseChange(boss, 2), true);
  //  보스마다 독립이어야 한다(엔티티에 붙는 상태)
  const other = {};
  assert.equal(consumePhaseChange(other, 2), false, '다른 보스의 첫 관측이 전환으로 샌다');
});

test('⚠️아직 배선되지 않았다 — 승인 전이므로 게임 동작이 그대로여야 한다', () => {
  //  이 테스트는 **일부러** 미배선을 고정한다. 이사님 승인(사양서 §3) 전에 몰래 켜지면 잡힌다.
  //  승인 후 배선할 때 이 테스트를 함께 뒤집어라 — 그게 "승인됐다"는 기록이 된다.
  const bosses = readFileSync(join(ROOT, 'js/bosses.js'), 'utf8');
  assert.ok(!/boss-phases\.js/.test(bosses),
    'bosses.js 가 페이즈 모듈을 import 했다 — 게임 규칙 변경은 이사님 승인 후다(사양서 §3)');
  //  기존 광폭화 경로는 그대로 살아 있어야 한다
  assert.ok(/get enraged\(\)/.test(bosses), '기존 enraged 경로가 사라졌다 — 표 없는 보스 9종이 무방비가 된다');
});

// ── §G-47 4단계 — 전환 연출(표시 전용, 미배선) ────────────────────────────────────────

test('페이즈 전환 연출 진입점이 있다 — 지금 광폭화는 아무 신호가 없다', () => {
  //  사양서 §2-2: 전환을 못 느끼면 페이즈를 나눈 의미가 없다.
  const R = readFileSync(join(ROOT, 'js/chase3d-renderer.js'), 'utf8');
  assert.ok(/ctl\.phaseBurst\s*=/.test(R), '전환 연출 진입점이 없다');
  //  격파 큐를 재사용해야 좌표 변환·예산·품질 사다리를 다시 안 만든다
  const pb = R.slice(R.indexOf('ctl.phaseBurst'), R.indexOf('ctl.killBurst'));
  assert.ok(/_killQ\.push/.test(pb), '격파 큐를 재사용하지 않는다 — 좌표 변환을 중복 구현하게 된다');
  assert.ok(/KILL_Q_MAX/.test(pb), '큐 상한을 안 본다');
  assert.ok(/boss:/.test(pb), '격파와 구분할 표식이 없다 — 세기를 다르게 못 준다');
});

test('전환은 격파보다 크게 터진다 — 단계가 뒤로 갈수록 강하게', () => {
  const R = readFileSync(join(ROOT, 'js/chase3d-renderer.js'), 'utf8');
  //  ⚠️창을 넉넉히 잡는다 — 주석이 늘면 실제 코드 줄이 창 밖으로 밀린다(실제로 그렇게 깨졌다).
  const drain = R.slice(R.indexOf('const bMul'), R.indexOf('_killQ.length = 0'));
  assert.ok(/k\.boss \? 1\.0 \+ k\.boss \* 0\.4 : 1/.test(drain), '전환 세기 배수가 없다');
  //  일반 격파(boss 없음)는 배수 1 이어야 한다 — 전환 코드가 격파를 바꾸면 안 된다
  assert.ok(/: 1;/.test(drain), '격파 경로가 그대로 1 이 아니다');
  assert.ok(/debrisBudget\('kill'\) \* bMul/.test(drain), '개수에 세기를 안 곱한다');
  //  ⚠️크기도 bMul 이어야 한다. `k.boss ? 1.5 : 1` 로 고정하면 1단계·2단계가 같아진다(실측 확인).
  //   개수는 프레임 상한 12 에 걸려 구분이 안 되므로, 크기·속도가 유일한 단계 신호다.
  assert.ok(/\(0\.55 \+ scl \* 0\.7\) \* bMul/.test(drain),
    '크기가 단계와 무관하게 고정돼 있다 — 1단계와 2단계가 구분되지 않는다');
});

test('⚠️전환 연출도 아직 아무도 부르지 않는다 — 승인 전이다', () => {
  const M = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
  const B = readFileSync(join(ROOT, 'js/bosses.js'), 'utf8');
  assert.ok(!/phaseBurst\(/.test(M), 'main.js 가 전환 연출을 부른다 — 배선은 승인 후다');
  assert.ok(!/phaseBurst\(/.test(B), 'bosses.js 가 전환 연출을 부른다 — 배선은 승인 후다');
});
