// §G-47 — 보스 페이즈 순수 판정.
//
// ✅이사님 승인(2026-08-18)으로 **배선됨**: 3단계 · 66/33% · 전환 무적 0.4s · B8 우선 · 길이 유지.
//  지키는 것: 경계 판정 · **표 없는 보스 9종 현행 유지** · 전환 1회성 · rate 이중적용 금지.
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
  //  §G-47 2차: 임계가 이사 지정으로 70/30 이 됐다. 값을 여기 하드코딩하면 또 깨지므로 표에서 읽는다.
  const [, t2, t3] = BOSS_PHASES.B8.map((x) => x.at);
  assert.equal(at(1.00), 0, '만피는 1페이즈');
  assert.equal(at(t2 + 0.01), 0, '2단계 임계 직전은 아직 1페이즈');
  assert.equal(at(t2), 1, '2단계 임계 정각에 넘어간다 — 경계 포함');
  assert.equal(at((t2 + t3) / 2), 1, '두 임계 사이는 2페이즈');
  assert.equal(at(t3 + 0.01), 1, '3단계 임계 직전은 아직 2페이즈');
  assert.equal(at(t3), 2, '3단계 임계 정각에 넘어간다');
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

test('✅배선됨 — 이사님 승인 2026-08-18(3단계 · 66/33% · 무적 0.4s · B8 우선 · 길이 유지)', () => {
  //  ⚠️이 테스트는 원래 **미배선을 고정**하고 있었다. 승인이 나서 뒤집었다 —
  //   이 뒤집힘 자체가 "승인됐다"는 기록이다(사양서 §3).
  const bosses = readFileSync(join(ROOT, 'js/bosses.js'), 'utf8');
  assert.ok(/boss-phases\.js/.test(bosses), 'bosses.js 가 페이즈 모듈을 안 쓴다');
  assert.ok(/tickPhase\(dt, world\)/.test(bosses), 'update 에서 페이즈를 갱신하지 않는다');
  //  ⚠️기존 광폭화 경로는 **반드시 살아 있어야** 한다 — 표에 없는 보스 9종이 그걸 쓴다
  assert.ok(/get enraged\(\)/.test(bosses), '기존 enraged 경로가 사라졌다 — 표 없는 9종이 무방비가 된다');
  //  전환 무적(이사 결정 3)
  assert.ok(/phaseInvulnT = 0\.4/.test(bosses), '전환 무적 0.4초가 없다');
  assert.ok(/if \(this\.phaseInvulnT > 0\) return;/.test(bosses), '무적이 피해를 안 막는다');
});

test('⚠️페이즈 rate 가 광폭화와 곱해지지 않는다 — 마지막 단계가 폭주하면 안 된다', () => {
  const bosses = readFileSync(join(ROOT, 'js/bosses.js'), 'utf8');
  const iv = bosses.slice(bosses.indexOf('interval(base) {'), bosses.indexOf('interval(base) {') + 500);
  assert.ok(/ph \? ph\.rate : \(this\.enraged/.test(iv),
    '페이즈 rate 와 광폭화 배수가 함께 걸린다 — 3단계에서 발사 간격이 두 번 줄어든다');
});

test('주·보조 패턴이 볼리마다 교대한다 — 한 가지 대응으로 굳지 않게', () => {
  const bosses = readFileSync(join(ROOT, 'js/bosses.js'), 'utf8');
  assert.ok(/_volley \| 0\) % 2 === 1/.test(bosses), '패턴 교대 기준이 없다');
  assert.ok(/this\._volley = \(this\._volley \| 0\) \+ 1/.test(bosses), '볼리 카운터가 안 늘어난다');
  assert.ok(/findPatternByKind\(BAL\.bossPatterns, kind\)/.test(bosses),
    '보조 패턴 수치를 기존 표에서 빌려오지 않는다 — 새로 만들면 안 된다');
});

// ── §G-47 4단계 — 전환 연출 ──────────────────────────────────────────────────────────

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

test('✅전환 연출이 실제로 배선됐다 — 전환을 눈으로 알린다', () => {
  const M = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
  const B = readFileSync(join(ROOT, 'js/bosses.js'), 'utf8');
  assert.ok(/chase3d\.phaseBurst\(/.test(M), 'main.js 가 전환 연출을 안 부른다');
  assert.ok(/notifyPhaseChange/.test(M) && /notifyPhaseChange/.test(B), '전환 알림 통로가 끊겼다');
  //  ⚠️연출 실패가 전투를 멈추면 안 된다
  const nf = M.slice(M.indexOf('notifyPhaseChange(boss'), M.indexOf('notifyPhaseChange(boss') + 500);
  assert.ok(/try\s*\{/.test(nf), '전환 연출 호출이 try 로 감싸이지 않았다');
});

// ── §G-47 2차 — 이사 실기 평가 반영 (2026-08-18) ──────────────────────────────────────
//
// 1차 평가: 전환 인지 "그런가보다" · 대응 "비슷" · 과밀 "가끔" · 보스전 "길어짐".
// 진단: 세 페이즈가 **같은 탄**을 각도만 바꿔 쐈다 — 피하는 방법이 안 바뀌니 대응도 안 바뀐다.

import { Boss } from '../js/bosses.js';

/** 실제 발사를 돌려 탄 구성을 본다(정적 검사로는 '탄이 달라졌는가'를 증명 못 한다). */
function fireAt(frac) {
  const shots = [];
  const w = { squad: { x: 240, y: 700, count: 8 }, entities: [], enemyBullets: [],
    spawnEnemyBullet: (b) => shots.push(b), spawnEntity() {},
    effects: { halo() {}, flash() {}, burst() {}, text() {} }, notifyPhaseChange() {} };
  const b = new Boss(480, 1, 1, 1, 'B8');
  b.hp = b.maxHp * frac;
  b.tickPhase(0.016, w);
  b.fireSignature(w);
  return { shots, phase: b.phase, boss: b };
}

test('G47R2-THRESHOLDS: 임계가 이사 지정값 70% / 30% 다', () => {
  const at = BOSS_PHASES.B8.map((p) => p.at);
  assert.deepEqual(at, [1.00, 0.70, 0.30], `임계가 ${at} — 이사 지정은 70/30 이다`);
});

test('G47R2-RATE: 3단계 발사가 1.8배다', () => {
  const rate = BOSS_PHASES.B8[2].rate;
  assert.ok(Math.abs(1 / rate - 1.8) < 0.02, `발사 배수가 ${(1 / rate).toFixed(2)} — 이사 지정은 1.8 이다`);
});

test('⚠️G47R2-SHOT-VARIETY: 페이즈마다 **탄이 실제로 다르다**', () => {
  //  이번 작업의 핵심. 1차에서 '대응이 비슷' 했던 직접 원인이다.
  const sig = (frac) => {
    const { shots } = fireAt(frac);
    assert.ok(shots.length > 0, `hp ${frac}: 탄이 안 나간다`);
    const s = shots[0];
    return `${s.shape}/${s.r}/${s.homing || 0}`;
  };
  const p1 = sig(1.0), p2 = sig(0.5), p3 = sig(0.15);
  assert.notEqual(p1, p2, `1·2단계 탄이 같다 (${p1}) — 각도만 바꾸면 대응이 안 바뀐다`);
  assert.notEqual(p2, p3, `2·3단계 탄이 같다 (${p2})`);
  assert.notEqual(p1, p3, `1·3단계 탄이 같다 (${p1})`);
});

test('G47R2-HOMING: 후반 페이즈에 유도탄이 실제로 붙는다', () => {
  //  유도가 붙어야 '옆으로 흘리는' 회피가 안 통한다 = 대응이 바뀐다.
  assert.equal(fireAt(1.0).shots[0].homing || 0, 0, '1단계부터 유도가 붙으면 초반이 가혹하다');
  assert.ok(fireAt(0.5).shots[0].homing > 0, '2단계에 유도가 없다');
  assert.ok(fireAt(0.15).shots[0].homing > 0, '3단계에 유도가 없다');
});

test('⚠️G47R2-SHAPE-DIFFERS-FROM-BASE: 모양이 그 보스 기본과 달라야 눈에 보인다', () => {
  //  실측 교훈: B8 기본 모양이 needle 인데 페이즈에도 needle 을 줬더니
  //  유도가 붙어도 **눈으로는 같은 탄**이었다.
  const base = fireAt(1.0).shots[0].shape;
  for (const f of [0.5, 0.15]) {
    assert.notEqual(fireAt(f).shots[0].shape, base,
      `hp ${f} 의 모양이 기본(${base})과 같다 — 유도만 붙고 시각 변화가 없다`);
  }
});

test('⚠️G47R2-SIZE-NOT-CLOBBERED: 케이스의 r 하드코딩이 페이즈 크기를 덮지 않는다', () => {
  //  실측: ring 케이스가 `{ ...fanOpts, r: 6 }` 로 덮어써 3단계 r11 이 r6 으로 나갔다.
  const want = BOSS_PHASES.B8[2].shot.r;
  const got = fireAt(0.15).shots[0].r;
  assert.equal(got, want, `3단계 탄 크기가 ${got} — 표는 ${want} 다. 케이스 하드코딩이 이겼다`);
});

test('⚠️G47R2-COUNT-DOWN: 후반일수록 탄 수가 준다 (과밀·길어짐 대응)', () => {
  //  이사 실기: 과밀 '가끔' + 보스전 '길어짐'. 둘 다 탄이 많아 못 쏘는 데서 온다.
  //  종류를 늘리면서 수까지 늘리면 화면이 막힌다 — **같은 양을 다른 종류로**가 원칙이다.
  const mult = BOSS_PHASES.B8.map((p) => p.countMult ?? 1);
  assert.ok(mult[1] < 1 && mult[2] < mult[1], `탄 수 배수가 ${mult} — 후반으로 갈수록 줄어야 한다`);
  //  ⚠️표만 보면 배선이 끊겨도 통과한다(돌연변이 P2 로 실제 확인 — countMult 를 무시해도 통과했다).
  //   **실제 발사 수**로 검증한다. 패턴이 달라 절대 수는 못 비교하니, 같은 패턴에 배수만 뺀 값과 대조한다.
  const n2 = fireAt(0.5).shots.length;            // 2단계 crescent, 배수 0.85
  const raw = BOSS_PHASES.B8[0];                  // 1단계도 crescent — 같은 패턴의 원본 수
  const base = fireAt(1.0).shots.length;
  assert.ok(n2 < base,
    `2단계 탄이 ${n2} 발로 1단계 ${base} 발보다 적지 않다 — countMult 배선이 끊겼다`);
  assert.equal(n2, Math.max(3, Math.round(base * mult[1])),
    `2단계 탄 수가 배수와 안 맞는다 (${n2})`);
  //  다만 0 이 되면 안 된다
  for (const f of [1.0, 0.5, 0.15]) assert.ok(fireAt(f).shots.length >= 3, `hp ${f}: 탄이 3발 미만`);
});

test('G47R2-FX-STRONGER: 전환 연출이 1차보다 강하다 (이사: 약함)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/bosses.js', import.meta.url), 'utf8');
  const i = src.indexOf('consumePhaseChange(this, ph.index)');
  const blk = src.slice(i, i + 900);
  const m = blk.match(/effects\.flash\(([\d.]+)\)/);
  assert.ok(m && +m[1] >= 0.3, `플래시가 ${m && m[1]} — 1차의 0.18 은 전투 중에 묻혔다`);
  assert.ok((blk.match(/effects\.halo\(/g) || []).length >= 2, '후광이 하나뿐이다');
  assert.ok(/effects\.burst\(/.test(blk), '전환에 파편이 없다');
});

test('G47R2-OTHERS-UNTOUCHED: B8 외 보스는 여전히 종전 그대로', () => {
  //  표에 없으면 null = 현행 유지. 한 번에 10종을 바꾸지 않는다는 원칙이 유지되는지.
  assert.deepEqual(Object.keys(BOSS_PHASES), ['B8'], '표에 B8 외 보스가 들어왔다 — 승인 범위 밖');
});
