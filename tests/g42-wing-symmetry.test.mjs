// ── §G-42 — 보조무기(wing) 하드포인트 좌우 대칭 ────────────────────────────────────────
//
//  이사님 제보(2026-08-13): "레이저 보조무기 선택 시 빔이 기함의 우측에 형성되어 나간다. 2D 와 3D 모두 같다."
//
//  원인: `BAL.gate1.loadout.hardpointX.wing = 22` 를 **항상 +** 로만 더했다.
//   주무기 마운트는 좌우 대칭인데(예: tier3 = −18.3 / +18.3 / −9.76 / +9.76) 보조무기는
//   거기에 +22 를 얹기만 해서 발사 패턴 전체가 오른쪽으로 밀렸다. 모든 등급에서 그 자리는 선체 밖이다
//   (§G-28 실측: T0 +14px · T2 +12px · T4 +11px · T5 +5px). 레이저는 초당 18발이라 기둥으로 이어져 보인다.
//   2D·3D 가 같은 이유는 둘 다 `shotRenderX()` 라는 한 함수를 쓰기 때문이다.
//
//  수정(이사님 승인): **크기 22 는 그대로 두고 부호만 발사마다 뒤집는다.**
//  ⚠️크기 22 는 게임 좌표다 — 시각 이유로 바꾸면 안 된다(§G-28 P0-1, `G28-WING-CONST` 가 지킨다).
//   이번에 바꾼 부호도 탄이 실제로 생기는 자리라 **이사님 승인 아래** 한 변경이다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { Squad, alternateHardpointX } from '../js/entities.js';
import { BAL } from '../js/balance.js';
import { SHIP_DEFS } from '../js/ships.js';

const noop = () => {};
function stubWorld() {
  return {
    bullets: [], enemyBullets: [], entities: [], bosses: [], logicalW: 480, logicalH: 800,
    mfx: { bossDmgMult: 1 }, stageMods: { enemyHp: 1, shotCap: 999 }, stats: { damage: 1 },
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop }, spawnEntity: noop,
  };
}
const SHARED = {
  fireRate: 1, damage: 1, powerMult: 1, trait: { rate: 1, dmg: 1, spread: 1, pierce: 0 },
  escortShare: 0, rush: {}, ks: { flagMult: 1, supportMult: 1 },
};
/** wing 슬롯으로 한 번 발사시킨다(실제 production 메서드). */
function fireWing(sq, world, weaponId, dt) {
  sq._spawnWeaponShots(weaponId, 1, dt, world, {
    ...SHARED, mfx: world.mfx, flagPower: sq.flagPower,
    hx: BAL.gate1.loadout.hardpointX.wing, accKey: '_wingAcc', dpsScale: 0.5,
  });
}
function squadAt(tier) {
  const sq = new Squad(480, 800, 1); sq.x = 240; sq.y = 640; sq.tier = tier;
  sq.wing = { weaponId: 'laser', level: 1 };
  return sq;
}
/** 마운트 수 n 과 좌우 2 의 최소공배수 = 완전한 한 주기. 이만큼 쏘면 모든 (마운트, 쪽) 조합이 같은 횟수다. */
const fullCycle = (n) => (n % 2 === 0 ? n : n * 2);

test('G42-WING-BOTH-SIDES: 보조무기가 좌우 양쪽에서 나간다(한쪽 쏠림 없음)', () => {
  const sq = squadAt(0), w = stubWorld();
  fireWing(sq, w, 'laser', 1.0);
  assert.ok(w.bullets.length >= 4, `표본이 충분해야 한다 — 실측 ${w.bullets.length}발`);
  const left = w.bullets.filter((b) => b.x < sq.x).length;
  const right = w.bullets.filter((b) => b.x > sq.x).length;
  assert.ok(left > 0, `왼쪽에서도 나가야 한다 — 좌 ${left} / 우 ${right}`);
  assert.ok(right > 0, `오른쪽에서도 나가야 한다 — 좌 ${left} / 우 ${right}`);
  assert.ok(Math.abs(left - right) <= 1, `좌우가 균등해야 한다 — 좌 ${left} / 우 ${right}`);
});

test('G42-WING-CENTERED: 전 등급에서 한 주기 평균이 정확히 기함 중심이다', () => {
  //  ⚠️마운트 수가 짝수인 등급(tier1=2, tier3=4)은 좌우 순환과 주기가 겹쳐 (마운트, 쪽) 짝이 고정된다.
  //   마운트 자체가 좌우 대칭쌍이라 그래도 평균은 중심이 된다 — 그 사실을 여기서 못 박는다.
  for (let tier = 0; tier < SHIP_DEFS.length; tier++) {
    const sq = squadAt(tier), w = stubWorld();
    const n = SHIP_DEFS[tier].mounts.length;
    const shots = fullCycle(n);
    for (let i = 0; i < shots; i++) fireWing(sq, w, 'laser', 1 / 18 + 1e-9);
    assert.equal(w.bullets.length, shots, `tier ${tier}: 한 주기 ${shots}발이 나와야 한다 — 실측 ${w.bullets.length}`);
    const avg = w.bullets.reduce((s, b) => s + b.x, 0) / w.bullets.length;
    assert.ok(Math.abs(avg - sq.x) < 1e-9,
      `tier ${tier}(마운트 ${n}개): 한 주기 평균이 기함 중심이어야 한다 — 실측 ${avg.toFixed(4)}, 기대 ${sq.x}`);
  }
});

test('G42-WING-MAGNITUDE: 오프셋 크기는 여전히 정확히 22 다(게임 좌표 불변)', () => {
  //  §G-28 P0-1 계약: 크기를 시각 이유로 줄이면 안 된다. 부호만 바뀌었음을 확인한다.
  const sq = squadAt(0), w = stubWorld();
  fireWing(sq, w, 'laser', 1.0);
  const mounts = SHIP_DEFS[0].mounts;
  for (const b of w.bullets) {
    const off = mounts.map((m) => b.x - (sq.x + m.x));
    assert.ok(off.some((o) => Math.abs(Math.abs(o) - 22) < 1e-6),
      `모든 탄의 오프셋 크기가 22 여야 한다 — 실측 ${off.map((o) => o.toFixed(2)).join(' / ')}`);
  }
});

test('G42-WING-HOMING-ALTERNATES: 보조 유도탄도 좌우 번갈아 나간다', () => {
  const sq = squadAt(0); sq.wing = { weaponId: 'homing', level: 1 };
  const w = stubWorld();
  for (let i = 0; i < 6; i++) fireWing(sq, w, 'homing', 1.0);
  const xs = w.bullets.map((b) => b.x);
  assert.ok(xs.length >= 2, `미사일이 나와야 한다 — 실측 ${xs.length}`);
  assert.ok(xs.some((x) => x < sq.x) && xs.some((x) => x > sq.x),
    `유도탄도 좌우 양쪽에서 나가야 한다 — 실측 ${xs.join(', ')}`);
});

test('G42-MAIN-UNAFFECTED: 주무기(hx=0)는 전혀 영향받지 않는다', () => {
  //  ⚠️좌우 교대가 main 슬롯까지 번지면 주무기 발사 위치가 통째로 바뀐다(게임 판정 변경).
  const sq = squadAt(3), w = stubWorld();
  sq._spawnWeaponShots('laser', 1, 1.0, w, {
    ...SHARED, mfx: w.mfx, flagPower: sq.flagPower, hx: 0, accKey: 'fireAcc', dpsScale: 1,
  });
  assert.ok(w.bullets.length > 0);
  const want = SHIP_DEFS[3].mounts.map((m) => sq.x + m.x);
  for (const b of w.bullets) {
    assert.ok(want.some((v) => Math.abs(v - b.x) < 1e-6),
      `주무기는 마운트 위치 그대로여야 한다 — 실측 ${b.x}, 기대 ${want.join(' / ')}`);
  }
});

test('G42-NO-GLOBAL-RNG: 좌우 교대가 전역 난수를 소비하지 않는다', () => {
  //  ⚠️§G39-R1 계약: 전역 Math.random 은 치명타·탄 분산·스폰과 같은 스트림이다.
  //   교대를 난수로 구현하면 그만큼 이후 전투 결과가 달라진다. 단순 카운터여야 한다.
  const count = (fn) => {
    const orig = Math.random; let n = 0;
    Math.random = () => { n++; return orig(); };
    try { fn(); } finally { Math.random = orig; }
    return n;
  };
  //  레이저는 퍼짐 각을 뽑지 않는다 → 치명타 판정 외에 난수를 쓸 이유가 없다.
  //  같은 발사 수에서 main(hx=0)과 wing(hx=22)의 전역 난수 소비가 같아야 한다.
  const runSlot = (hx, accKey) => {
    const sq = squadAt(0), w = stubWorld();
    const draws = count(() => sq._spawnWeaponShots('laser', 1, 1.0, w, {
      ...SHARED, mfx: w.mfx, flagPower: sq.flagPower, hx, accKey, dpsScale: 1,
    }));
    return { draws, shots: w.bullets.length };
  };
  const main = runSlot(0, 'fireAcc');
  const wing = runSlot(BAL.gate1.loadout.hardpointX.wing, '_wingAcc');
  assert.equal(wing.shots, main.shots, `전제: 같은 발사 수여야 비교가 성립한다 — main ${main.shots} / wing ${wing.shots}`);
  assert.equal(wing.draws, main.draws,
    `좌우 교대가 난수를 추가 소비하면 안 된다 — main ${main.draws} / wing ${wing.draws}`);
});

// ── 공용 헬퍼 계약 ────────────────────────────────────────────────────────────────────
//  ⚠️보조무기 슬롯(entities `_spawnWeaponShots`)과 공명 레일(main `spawnResonance`)이 **같은 함수**를 쓴다.
//   레일 호출부는 main.js 안이라 Node 로 실행할 수 없다(export 0개) — 그래서 두 경로가 공유하는
//   이 함수의 계약을 여기서 못 박는다. 레일이 이 함수를 부르는 한 줄만 미실행이다.

test('G42-HELPER-ALTERNATES: 부호가 번갈아 나오고 크기는 그대로다', () => {
  const h = {};
  const got = Array.from({ length: 6 }, () => alternateHardpointX(h, 'side', 22));
  assert.deepEqual(got, [22, -22, 22, -22, 22, -22], `번갈아 나와야 한다 — 실측 ${got.join(', ')}`);
  assert.equal(got.reduce((s, v) => s + v, 0), 0, '한 주기 합은 0(대칭)');
});

test('G42-HELPER-ZERO: 크기 0(main 슬롯)이면 카운터를 건드리지 않는다', () => {
  //  ⚠️main 슬롯까지 카운터가 돌면 슬롯 간섭이 생긴다.
  const h = {};
  for (let i = 0; i < 5; i++) assert.equal(alternateHardpointX(h, 'side', 0), 0);
  assert.equal(h.side, undefined, 'hx=0 이면 카운터 자체가 생기면 안 된다');
});

test('G42-HELPER-INDEPENDENT: 키가 다르면 서로 간섭하지 않는다', () => {
  //  보조무기 슬롯과 공명 레일은 각자의 카운터를 쓴다 — 한쪽이 다른 쪽 순서를 밀면 안 된다.
  const h = {};
  assert.equal(alternateHardpointX(h, '_wingAcc_side', 22), 22);
  assert.equal(alternateHardpointX(h, '_railSide', 22), 22, '레일은 자기 카운터로 시작해야 한다');
  assert.equal(alternateHardpointX(h, '_wingAcc_side', 22), -22, 'wing 은 자기 순서를 이어간다');
  assert.equal(alternateHardpointX(h, '_railSide', 22), -22);
});

test('G42-HELPER-NO-RNG: 헬퍼가 전역 난수를 쓰지 않는다', () => {
  const orig = Math.random; let n = 0;
  Math.random = () => { n++; return orig(); };
  try { const h = {}; for (let i = 0; i < 20; i++) alternateHardpointX(h, 'side', 22); }
  finally { Math.random = orig; }
  assert.equal(n, 0, '난수를 쓰면 치명타·분산·스폰 순서가 밀린다(§G39-R1 계약)');
});

test('G42-RESET-ON-LAUNCH: 출격(installGate1)마다 좌우 카운터가 0 으로 돌아간다', () => {
  //  같은 조건이면 같은 순서로 나가야 한다(결정성). 이전 판의 마지막 쪽이 다음 판 첫 발에 새면 안 된다.
  const sq = new Squad(480, 800, 1);
  sq._wingAcc_side = 1; sq.fireAcc_side = 1; sq._railSide = 1;
  sq.installGate1({ mainWeapon: 'vulcan' });
  assert.equal(sq._wingAcc_side, 0, '보조무기 슬롯 카운터');
  assert.equal(sq.fireAcc_side, 0, '주무기 슬롯 카운터');
  assert.equal(sq._railSide, 0, '공명 레일 카운터');
});

test('G42-WING-MIRROR: 한 주기 오프셋이 좌우 정확한 거울쌍이다(평균 0 보다 강한 조건)', () => {
  //  §G39-R2 후속 (Codex 최종재검수 §3-2): `G42-WING-CENTERED` 의 **평균 0** 만으로는 대칭 증명이 안 된다.
  //   예컨대 왼쪽 −10 두 발과 오른쪽 +20 한 발도 평균은 0 이지만 화면은 비대칭이다.
  //   정렬한 왼쪽 오프셋과 오른쪽 오프셋이 원소별로 부호만 다른지 본다.
  //
  //  ⚠️짝수 마운트 등급(tier1=2, tier3=4)은 마운트 순환과 좌우 순환의 주기가 겹쳐 (마운트, 쪽) 짝이
  //   고정된다. 그래도 거울쌍이 되는 이유는 **마운트 배열 자체가 좌우 대칭쌍**이기 때문이다.
  //   마운트 순서나 값이 나중에 비대칭으로 바뀌면 이 테스트가 잡는다.
  for (let tier = 0; tier < SHIP_DEFS.length; tier++) {
    const sq = squadAt(tier), w = stubWorld();
    const n = SHIP_DEFS[tier].mounts.length;
    for (let i = 0; i < fullCycle(n); i++) fireWing(sq, w, 'laser', 1 / 18 + 1e-9);

    const off = w.bullets.map((b) => b.x - sq.x);
    const left = off.filter((v) => v < 0).sort((a, b) => a - b);          // 가장 왼쪽부터
    const right = off.filter((v) => v > 0).sort((a, b) => b - a);         // 가장 오른쪽부터
    const center = off.filter((v) => v === 0);

    assert.equal(center.length, 0, `tier ${tier}: 정중앙 발사는 없어야 한다(hx 가 항상 ±22)`);
    assert.equal(left.length, right.length,
      `tier ${tier}: 좌우 발수가 같아야 한다 — 좌 ${left.length} / 우 ${right.length}`);
    left.forEach((v, i) => {
      assert.ok(Math.abs(v + right[i]) < 1e-9,
        `tier ${tier}: ${i}번째 짝이 거울쌍이 아니다 — 좌 ${v.toFixed(3)} / 우 ${right[i].toFixed(3)}`);
    });
  }
});
