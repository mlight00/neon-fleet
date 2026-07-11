import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, hitCrystal, stormDecay, scaleGate, generateSectorMap } from '../js/logic.js';
import { mulberry32 } from '../js/chunks.js';

test('applyGate: 덧셈/곱셈/뺄셈/나눗셈, 최소 0, 나눗셈 내림', () => {
  assert.equal(applyGate(10, { op: '+', value: 5 }), 15);
  assert.equal(applyGate(10, { op: 'x', value: 2 }), 20);
  assert.equal(applyGate(10, { op: '-', value: 50 }), 0);
  assert.equal(applyGate(7, { op: '/', value: 2 }), 3);
});

test('applyGate: 0기에서 좋은 게이트를 받으면 살아난다', () => {
  assert.equal(applyGate(0, { op: '+', value: 5 }), 5);
  assert.equal(applyGate(0, { op: 'x', value: 3 }), 0);
});

test('generateSectorMap: 열 구조·보스 1개·도달성·정비 보장', () => {
  for (const seed of [1, 42, 777, 2024]) {
    const m = generateSectorMap(2, mulberry32(seed), 5);
    assert.equal(m.cols.length, 6, '열 = depth+1');
    assert.equal(m.cols[0].length, 1); assert.equal(m.cols[0][0].type, 'combat'); // 진입
    assert.equal(m.cols[5].length, 1); assert.equal(m.cols[5][0].type, 'boss');   // 보스
    // 보스 정확히 1개
    const bosses = m.cols.flat().filter((n) => n.type === 'boss');
    assert.equal(bosses.length, 1);
    // 모든 non-첫열 노드는 이전 열에서 최소 1개 incoming (도달성)
    for (let c = 1; c < m.cols.length; c++) for (let r = 0; r < m.cols[c].length; r++) {
      assert.ok(m.cols[c - 1].some((n) => n.next.includes(r)), `col${c} row${r} 도달불가(seed${seed})`);
    }
    // 보스 직전 열에 정비 노드 보장
    assert.ok(m.cols[4].some((n) => n.type === 'repair'), `보스직전 정비 없음(seed${seed})`);
    // 모든 중간 노드는 타입이 배정됨
    for (let c = 1; c < 5; c++) for (const n of m.cols[c]) assert.ok(n.type, 'type 미배정');
  }
});

test('scaleGate: 정액(+/−)은 스테이지마다 커지고, 비율(×/÷)은 원본 유지', () => {
  // 비율 연산(자기 스케일)은 손대지 않음
  assert.deepEqual(scaleGate({ op: 'x', value: 2 }, 5, 0.6, 6), { op: 'x', value: 2 });
  assert.deepEqual(scaleGate({ op: '/', value: 2 }, 8, 0.6, 6), { op: '/', value: 2 });
  // 정액은 스테이지 1에서 원본, 깊을수록 커짐
  assert.equal(scaleGate({ op: '-', value: 30 }, 1, 0.6, 6).value, 30);   // ×1.0
  assert.equal(scaleGate({ op: '-', value: 30 }, 3, 0.6, 6).value, 66);   // ×2.2
  assert.equal(scaleGate({ op: '+', value: 45 }, 2, 0.6, 6).value, 72);   // ×1.6
  assert.equal(scaleGate({ op: '-', value: 10 }, 100, 0.6, 6).value, 60); // 상한 ×6
});

test('차악 게이트: 양쪽 다 감점이면 편대수에 따라 덜 나쁜 쪽이 갈린다', () => {
  const half = { op: '/', value: 2 };   // 절반 상실 (비율)
  const flat = { op: '-', value: 30 };  // 정액 상실
  // 편대 적을 때(40): 절반=20손실 < 정액=30손실 → ÷2가 차악
  assert.ok((40 - applyGate(40, half)) < (40 - applyGate(40, flat)));
  // 편대 많을 때(200): 절반=100손실 > 정액=30손실 → -30이 차악
  assert.ok((200 - applyGate(200, half)) > (200 - applyGate(200, flat)));
});

test('hitCrystal: 데미지 누적, 파괴 시 원래 값 보상', () => {
  assert.deepEqual(hitCrystal({ hp: 20, reward: 20 }, 6), { hp: 14, broken: false, reward: 0 });
  assert.deepEqual(hitCrystal({ hp: 3, reward: 20 }, 6), { hp: 0, broken: true, reward: 20 });
});

test('stormDecay: 초당 비율 감소, 최소 0', () => {
  assert.equal(stormDecay(100, 0.5, 0.10), 95);
  assert.equal(stormDecay(0, 1, 0.10), 0);
});


// ─── 스테이지 난이도 스케일링 ───
const { stageMods } = await import('../js/logic.js');

test('stageMods: 스테이지 1은 기본값 (배수 1)', () => {
  const m = stageMods(1);
  assert.equal(m.enemyHp, 1);
  assert.equal(m.enemyRate, 1);
  assert.equal(m.crystal, 1);
  assert.equal(m.boss, 1);
  assert.equal(m.tierShift, 0);
});

test('stageMods: 스테이지가 오르면 적은 준지수로 단단·빠르게, 보상은 완만', () => {
  const m = stageMods(3);
  assert.ok(Math.abs(m.enemyHp - 2.52) < 1e-9);  // g=2: 1 + 0.6×2 + 0.08×4
  assert.ok(Math.abs(m.enemyRate - 0.86) < 1e-9); // g=2: 1 - 0.07×2
  assert.ok(Math.abs(m.crystal - 1.36) < 1e-9);   // g=2: 1 + 0.18×2
  assert.ok(Math.abs(m.boss - 2.16) < 1e-9);      // g=2: 1 + 0.5×2 + 0.04×4
});

test('stageMods: 준지수라 후반이 급격히 어려워진다 (제곱항)', () => {
  const m10 = stageMods(10);   // g=9
  assert.ok(Math.abs(m10.enemyHp - (1 + 0.6 * 9 + 0.08 * 81)) < 1e-9); // 12.88
  assert.ok(m10.enemyHp > 2 * stageMods(6).enemyHp);  // 후반 가속 확인
});

test('stageMods: 고스테이지에서도 하한/상한 존중', () => {
  const m = stageMods(20);
  assert.ok(m.enemyRate >= 0.5);
  assert.ok(m.tierShift <= 0.25);
  assert.ok(m.shotCap <= 30);
});

// ─── 격납고 비용 곡선 ───
const { hangarCost } = await import('../js/logic.js');

test('hangarCost: 레벨 0 = 기본가, 레벨마다 단조 증가', () => {
  assert.equal(hangarCost(60, 0, 1.6), 60);
  let prev = 0;
  for (let lv = 0; lv < 10; lv++) {
    const c = hangarCost(60, lv, 1.6);
    assert.ok(c > prev, `lv${lv} 비용이 증가해야 함`);
    assert.ok(Number.isInteger(c), '비용은 정수');
    prev = c;
  }
});

test('hangarCost: 성장 배수 반영 (1.6^lv)', () => {
  assert.equal(hangarCost(100, 2, 1.6), 256);
});

// ─── 드론 합체 순양함 (자동) + 기함 업그레이드 판정 ───
const { dronesToCruisers, canUpgradeFlagship } = await import('../js/logic.js');
const CCFG = { dronesPerCruiser: 40, cruisersPerFlagship: 5, maxCruisers: 10 };

test('dronesToCruisers: 40기당 순양함 1척, 남는 드론 유지', () => {
  assert.deepEqual(dronesToCruisers(95, 0, CCFG), { count: 15, cruisers: 2, merged: 2 });
  assert.deepEqual(dronesToCruisers(39, 0, CCFG), { count: 39, cruisers: 0, merged: 0 });
});

test('dronesToCruisers: 순양함 상한에서 멈춤 (드론은 남는다)', () => {
  assert.deepEqual(dronesToCruisers(400, 9, CCFG), { count: 360, cruisers: 10, merged: 1 });
  assert.deepEqual(dronesToCruisers(400, 10, CCFG), { count: 400, cruisers: 10, merged: 0 });
});

test('canUpgradeFlagship: 순양함 임계치 이상 + 최고 티어 미만이면 true', () => {
  assert.equal(canUpgradeFlagship(5, 2, 5, CCFG), true);
  assert.equal(canUpgradeFlagship(4, 2, 5, CCFG), false);   // 순양함 부족
  assert.equal(canUpgradeFlagship(9, 5, 5, CCFG), false);   // 이미 최고 티어
});

// ─── 은행 화력 스택: 승급↔강등 반복해도 farming 불가 (GPT 지적 회귀 방지) ───
const { bankUpgrade, bankDemote } = await import('../js/logic.js');

test('은행 스택: 승급→강등 10회 반복해도 화력이 누적되지 않는다 (farming 차단)', () => {
  let b = 0, s = [];
  const G = 1463;   // 한 티어 업그레이드 적립분
  let peak = 0;
  for (let i = 0; i < 10; i++) {
    ({ banked: b, stack: s } = bankUpgrade(b, s, G));
    peak = Math.max(peak, b);
    ({ banked: b, stack: s } = bankDemote(b, s));
    assert.equal(b, 0, `사이클 ${i}: 업글→강등 후 banked 0`);
  }
  assert.equal(peak, G, '누적 없이 한 티어분에서 상한');
  assert.equal(s.length, 0, '스택 비어야 함');
});

test('은행 스택: 여러 티어 연속 승급 후 연속 강등이면 정확히 역순 롤백해 0', () => {
  let b = 0, s = [];
  const gains = [100, 250, 500, 800, 1200];
  for (const g of gains) ({ banked: b, stack: s } = bankUpgrade(b, s, g));
  assert.equal(b, gains.reduce((a, x) => a + x, 0));      // 전부 적립
  for (let i = 0; i < gains.length; i++) ({ banked: b, stack: s } = bankDemote(b, s));
  assert.equal(b, 0); assert.equal(s.length, 0);          // 전부 롤백
});

test('은행 강등: 스택이 비면 안전 (음수·에러 없음)', () => {
  assert.deepEqual(bankDemote(0, []), { banked: 0, stack: [] });
});

// ─── 게이트 패러사이트 감염 반전 ───
const { invertGateOp } = await import('../js/logic.js');
test('invertGateOp: +N→-ceil(N/2), ×N→/N, -N·/N 유지', () => {
  assert.deepEqual(invertGateOp({ op: '+', value: 40 }), { op: '-', value: 20 });
  assert.deepEqual(invertGateOp({ op: '+', value: 45 }), { op: '-', value: 23 });   // ceil
  assert.deepEqual(invertGateOp({ op: 'x', value: 2 }), { op: '/', value: 2 });
  assert.deepEqual(invertGateOp({ op: '-', value: 30 }), { op: '-', value: 30 });    // 나쁜 건 유지
  assert.deepEqual(invertGateOp({ op: '/', value: 2 }), { op: '/', value: 2 });
});

// ─── 기함 업그레이드 화력 불변식 (GPT 지적 #1 회귀 방지) ───
const { BAL } = await import('../js/balance.js');
test('기함 업그레이드는 화력을 감소시키지 않는다 (흡수 순양함 → 은행 + 보너스)', () => {
  const E = BAL.escort;
  const gain = E.cruisersPerFlagship * E.cruiserPower * E.upgradeBonus;  // 기함에 은행되는 화력
  const lost = E.cruisersPerFlagship * E.cruiserPower;                    // 소비된 순양함 화력
  assert.ok(E.upgradeBonus >= 1, 'upgradeBonus는 1 이상이어야 화력 손실이 없다');
  assert.ok(gain >= lost, `업그레이드 이득 ${gain} >= 손실 ${lost}`);
});

// ─── 차지 랜스 단계 ───
const { chargeStageFor } = await import('../js/logic.js');

test('chargeStageFor: 충전 시간에 따라 단계 상승, maxStage 상한', () => {
  assert.equal(chargeStageFor(0, 0.5, 3), 0);
  assert.equal(chargeStageFor(0.4, 0.5, 3), 0);   // 1단 미달
  assert.equal(chargeStageFor(0.5, 0.5, 3), 1);
  assert.equal(chargeStageFor(1.2, 0.5, 3), 2);
  assert.equal(chargeStageFor(1.6, 0.5, 3), 3);
  assert.equal(chargeStageFor(9, 0.5, 3), 3);     // 상한 3
  assert.equal(chargeStageFor(9, 0.5, 4), 4);     // 과부하 모듈 → 4단
});
