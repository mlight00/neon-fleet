// ── §G-28 Codex 4차 검수 반영 — 절대 계약 회귀 테스트 ──
//  이 파일의 테스트는 **실제 게임 코드를 실행**해서 값을 재고, 소스 문자열 대조에 기대지 않는다.
//  (§G-27 검수 지적: "코드에 해당 문자열이 있다"는 완료 근거가 아니다.)
//
//  G28-WING 이 가장 중요하다. §G-23 에서 "레이저가 기함 바깥에서 발사되는 것처럼 보인다"는
//  시각 지적을 고치려고 `BAL.gate1.loadout.hardpointX.wing` 을 22 → 8 로 바꿨는데,
//  이 값은 표시값이 아니라 **발사체가 실제로 생성되는 x** 였다(entities `this.x + hx + m.x`,
//  main `spawnResonance` 의 레일 시작 x). 즉 게임 좌표를 바꾼 것 = 절대 계약 위반이었다.
//  시각 문제는 렌더 전용 경로에서만 고쳐야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BAL } from '../js/balance.js';
import { Squad, Bullet, HomingMissile, noteShotOrigin as noteShotOriginFor } from '../js/entities.js';
import { SHIP_DEFS } from '../js/ships.js';
import { readFileSync } from 'node:fs';
import { WEAPON_COLORS } from '../js/render.js';
import { EVO_PROJECTILE_COLOR as EVO_COLORS } from '../js/weapon-evolutions.js';

const LOGICAL_W = 480, LOGICAL_H = 800;

/** 발사만 관찰하는 최소 world — 이펙트·사운드는 호출 수만 센다. */
function stubWorld() {
  const muzzles = [];
  return {
    bullets: [], missiles: [], enemies: [], hazards: [], pickups: [],
    muzzles,
    effects: {
      muzzle: (x, y, c, n) => muzzles.push({ x, y, c, n }),
      ring: () => {}, spark: () => {}, shock: () => {}, pop: () => {},
      hit: () => {}, text: () => {}, trail: () => {},
    },
  };
}

/** 결정적 난수 — RNG 호출 순서·횟수를 그대로 재현하려고 Math.random 을 갈아끼운다. */
function withFixedRandom(seq, fn) {
  const real = Math.random;
  let i = 0;
  const used = [];
  Math.random = () => { const v = seq[i % seq.length]; i++; used.push(v); return v; };
  try { return { result: fn(), draws: i, used }; }
  finally { Math.random = real; }
}

/** wing 슬롯에 무기를 달고 한 번 발사시킨다. dt 는 반드시 한 발이 나오도록 크게 준다. */
function fireWing(weaponId, { tier = 0, level = 1, seq = [0.5] } = {}) {
  const sq = new Squad(LOGICAL_W, LOGICAL_H, 1);
  sq.tier = tier;
  sq.weapon = 'vulcan';
  sq.weaponLv = 1;
  sq.wing = { weaponId, level };
  const w = stubWorld();
  //  flagPower 는 getter 다 — 대입하지 않고 shared 로만 넘긴다(게임 상태를 건드리지 않는다).
  //  main 슬롯은 이 테스트의 관심사가 아니다 — wing 만 직접 호출해 좌표를 격리한다.
  const shared = {
    mfx: 1, fireRate: 1, damage: 10, powerMult: 1,
    trait: BAL.shipTraits[Math.min(sq.tier, BAL.shipTraits.length - 1)],
    escortShare: 0, flagPower: 100, rush: null,
    ks: { supportMult: 1, dmgMult: 1 },
  };
  const out = withFixedRandom(seq, () => {
    sq._spawnWeaponShots(weaponId, level, 1.0, w, {
      ...shared,
      hx: BAL.gate1.loadout.hardpointX.wing,
      accKey: '_wingAcc',
      dpsScale: BAL.gate1.loadout.wingDpsScale ?? 0.5,
    });
    return w;
  });
  return { sq, world: out.result, draws: out.draws };
}

// ─────────────────────────────────────────────────────────────────────────────
// P0-1 wing 하드포인트는 게임 좌표다 — 표시 문제로 건드리면 안 된다
// ─────────────────────────────────────────────────────────────────────────────
test('G28-WING-CONST: wing 하드포인트 오프셋은 22 (게임 좌표 — 시각 조정용으로 바꾸지 말 것)', () => {
  assert.equal(BAL.gate1.loadout.hardpointX.wing, 22,
    'hardpointX.wing 은 발사체 생성 x 와 공명 레일 시작 x 에 그대로 더해진다. ' +
    '"선체 밖에서 쏘는 것처럼 보인다"는 시각 문제는 렌더 경로에서 고쳐야 한다.');
  assert.equal(BAL.gate1.loadout.hardpointX.main, 0, 'main 슬롯은 기함 중심');
});

//  §G-42(2026-08-13) 갱신: 이사님 승인으로 **부호를 좌우 번갈아** 쓴다(크기 22 는 그대로).
//   보조무기가 늘 오른쪽에서만 나가 "빔이 기함 우측에 형성된다"는 제보를 받았다.
//   ⚠️여전히 게임 좌표다 — 크기 22 를 시각 이유로 바꾸는 것은 금지 그대로.
test('G28-WING-LASER: wing 레이저 탄이 실제로 x ± 22 + 마운트 오프셋에서 생성된다', () => {
  const { sq, world } = fireWing('laser', { tier: 0, level: 1 });
  assert.ok(world.bullets.length > 0, '레이저 탄이 생성됐다');
  const mounts = SHIP_DEFS[sq.tier].mounts;
  for (const b of world.bullets) {
    //  어느 마운트에서 나왔든 x 는 (기함 x ± 22 + 그 마운트 x) 중 하나여야 한다(§G-42 좌우 번갈아).
    const want = mounts.flatMap((m) => [sq.x + 22 + m.x, sq.x - 22 + m.x]);
    assert.ok(want.some((v) => Math.abs(v - b.x) < 1e-6),
      `탄 x=${b.x} 가 기대 좌표 ${want.join(' / ')} 중 하나와 일치해야 한다`);
    assert.equal(b.sourceWeaponId, 'laser', '피해 집계·공명 판정이 무기를 구분한다');
  }
});

test('G28-WING-VULCAN: wing 발칸도 같은 하드포인트에서 생성되고 RNG 소비가 탄 수와 맞는다', () => {
  const { sq, world, draws } = fireWing('vulcan', { tier: 0, level: 1, seq: [0.5] });
  assert.ok(world.bullets.length > 0);
  const mounts = SHIP_DEFS[sq.tier].mounts;
  for (const b of world.bullets) {
    const want = mounts.flatMap((m) => [sq.x + 22 + m.x, sq.x - 22 + m.x]);
    assert.ok(want.some((v) => Math.abs(v - b.x) < 1e-6), `탄 x=${b.x}`);
  }
  //  발칸은 탄마다 퍼짐 각을 뽑는다 — RNG 호출이 탄 수 이상이어야 한다(순서 회귀 감지).
  assert.ok(draws >= world.bullets.length, `RNG 호출 ${draws} >= 탄 ${world.bullets.length}`);
});

test('G28-WING-HOMING: wing 미사일도 x ± 22 에서 생성된다(마운트 오프셋 없음)', () => {
  const { sq, world } = fireWing('homing', { tier: 0, level: 1 });
  const shots = world.bullets.concat(world.missiles || []);
  const mis = shots.filter((b) => b instanceof HomingMissile);
  assert.ok(mis.length > 0, '미사일이 생성됐다');
  for (const m of mis) {
    assert.ok(Math.abs(m.x - (sq.x + 22)) < 1e-6 || Math.abs(m.x - (sq.x - 22)) < 1e-6,
      `미사일은 마운트 오프셋 없이 hx 만 좌우로 더한다 — 실측 ${m.x}, 기대 ${sq.x - 22} 또는 ${sq.x + 22}`);
  }
});

test('G28-WING-SLOT: main 슬롯(hx=0)과 wing 슬롯(hx=22)이 실제로 22px 떨어져 나간다', () => {
  const sq = new Squad(LOGICAL_W, LOGICAL_H, 1);
  sq.tier = 0;
  const shared = {
    mfx: 1, fireRate: 1, damage: 10, powerMult: 1,
    trait: BAL.shipTraits[0], escortShare: 0, flagPower: 100, rush: null,
    ks: { supportMult: 1, dmgMult: 1 },
  };
  const wMain = stubWorld(), wWing = stubWorld();
  withFixedRandom([0.5], () => {
    sq._spawnWeaponShots('laser', 1, 1.0, wMain, { ...shared, hx: 0, accKey: 'fireAcc', dpsScale: 1 });
  });
  sq._wingAcc = 0; sq._laserMid = 0;   // 마운트 순환 인덱스를 같은 출발점으로
  withFixedRandom([0.5], () => {
    sq._spawnWeaponShots('laser', 1, 1.0, wWing, { ...shared, hx: 22, accKey: '_wingAcc', dpsScale: 1 });
  });
  assert.ok(wMain.bullets.length > 0 && wWing.bullets.length > 0);
  const dx = wWing.bullets[0].x - wMain.bullets[0].x;
  assert.equal(Math.abs(dx), 22, `두 슬롯의 x 차이 크기는 정확히 하드포인트 오프셋 — 실측 ${dx} (§G-42: 부호는 발사마다 번갈아)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// P0-1 렌더 전용 보정 — 게임 좌표는 그대로 두고 "보이는 위치"만 포구에서 이어 붙인다
// ─────────────────────────────────────────────────────────────────────────────
test('G28-ORIGIN: 발사구 보간은 생성 직후 최대 → 26px 진행 후 0, 게임 x 는 불변', async () => {
  const { noteShotOrigin, shotOriginDX } = await import('../js/entities.js');
  const b = new Bullet(300, 500, 10, { vy: -600 });
  const gameX = b.x, gameY = b.y;
  //  포구(선체 위 마운트)는 게임 x 보다 22px 안쪽이라고 하자.
  noteShotOrigin(b, gameX - 22, gameY);
  assert.equal(shotOriginDX(b), -22, '생성 직후에는 포구 자리에 그려진다');
  assert.equal(b.x, gameX, '게임 좌표는 건드리지 않는다');

  b.y = gameY - 13;                       // 절반 진행
  assert.ok(Math.abs(shotOriginDX(b) - (-11)) < 1e-9, '절반 지점에서 절반만 남는다');
  assert.equal(b.x, gameX);

  b.y = gameY - 26;                       // 보간 종료
  assert.equal(shotOriginDX(b), 0, '26px 진행하면 실제 좌표로 완전히 이어진다');
  assert.equal(shotOriginDX(b), 0, '기록이 지워져 이후 호출도 0(누수 없음)');
});

test('G28-ORIGIN-DRAW: 실제 Bullet.draw 가 보간만큼 옮겨 그린다(게임 좌표는 그대로)', () => {
  //  기록 캔버스 — translate 를 누적해 실제로 어디에 그렸는지 잰다.
  const calls = [];
  let tx = 0;
  const stack = [];
  const ctx = {
    save: () => stack.push(tx), restore: () => { tx = stack.pop() ?? 0; },
    translate: (x) => { tx += x; }, rotate: () => {}, scale: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    arc: () => {}, ellipse: () => {}, stroke: () => {}, fill: () => {},
    fillRect: (x, y, w, h) => calls.push({ x: x + tx, y, w, h }),
    drawImage: () => {}, setLineDash: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set strokeStyle(v) {}, get strokeStyle() { return ''; },
    set globalAlpha(v) {}, get globalAlpha() { return 1; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    set shadowBlur(v) {}, get shadowBlur() { return 0; },
    set shadowColor(v) {}, get shadowColor() { return ''; },
    set globalCompositeOperation(v) {}, get globalCompositeOperation() { return 'source-over'; },
    set font(v) {}, set textAlign(v) {}, fillText: () => {},
  };
  const mk = () => new Bullet(300, 500, 10, { vy: -600, kind: 'tracer' });
  const plain = mk(); plain.draw(ctx);
  const baseX = calls.length ? calls[0].x : null;
  assert.ok(baseX !== null, '예광탄은 fillRect 로 그려진다');

  calls.length = 0;
  const shifted = mk();
  noteShotOriginFor(shifted, 300 - 22, 500);
  shifted.draw(ctx);
  assert.ok(calls.length > 0);
  assert.ok(Math.abs((calls[0].x - baseX) - (-22)) < 1e-6,
    `보간 중에는 22px 안쪽에 그려진다 — 실측 ${(calls[0].x - baseX).toFixed(2)}`);
  assert.equal(shifted.x, 300, '게임 좌표 불변');
});

// ─────────────────────────────────────────────────────────────────────────────
// P0-3 초진화 발칸 — 2D 스프라이트가 3D 런타임 색을 따라가는가
// ─────────────────────────────────────────────────────────────────────────────
test('G28-EVOSPRITE: 초진화가 있으면 전용 스프라이트를 고른다(색 함수와 같은 우선순위)', async () => {
  const { weaponProjectileSpriteId } = await import('../js/ships.js');
  const { weaponProjectileColor } = await import('../js/weapon-evolutions.js');

  //  스프라이트 선택과 색 선택이 **같은 우선순위**(초진화 > 진화 > 기본)를 따라야 한다.
  const rows = [
    [null, null, 'PROJ_VULCAN_BASE', WEAPON_COLORS.vulcan],
    ['vulcan_needle', null, 'PROJ_VULCAN_NEEDLE', EVO_COLORS.vulcan_needle],
    ['vulcan_storm', null, 'PROJ_VULCAN_STORM', EVO_COLORS.vulcan_storm],
    ['vulcan_storm', 'vulcan_tempest', 'PROJ_VULCAN_TEMPEST', EVO_COLORS.vulcan_tempest],
    ['vulcan_needle', 'vulcan_lance', 'PROJ_VULCAN_LANCE', EVO_COLORS.vulcan_lance],
  ];
  for (const [evo, sup, wantId, wantColor] of rows) {
    assert.equal(weaponProjectileSpriteId('vulcan', evo, sup), wantId, `${evo}/${sup} 스프라이트`);
    assert.equal(weaponProjectileColor(evo, sup, WEAPON_COLORS.vulcan), wantColor, `${evo}/${sup} 색`);
  }
  //  superId 를 안 넘기던 옛 호출 방식도 깨지지 않는다(기본값 null).
  assert.equal(weaponProjectileSpriteId('vulcan', 'vulcan_storm'), 'PROJ_VULCAN_STORM');
});

test('G28-EVOCOLOR: 2D 스프라이트를 구울 때 쓴 색 == 현재 게임 상수 (에셋 뒤처짐 감지)', () => {
  //  이미지에 구워진 색은 런타임에 되읽을 수 없다. 그래서 제작기가 "무슨 색으로 구웠는지"를
  //  매니페스트로 남긴다. 상수만 바꾸고 이미지를 다시 굽지 않으면 **여기서 즉시 실패**한다.
  //  → 그때 할 일: E:\workspace\claude\neon-fleet\art\v1-2d\make_vulcan_2d.py 재실행 후 webp 복사.
  const man = JSON.parse(readFileSync(
    new URL('../assets/art2-webp/weapons/projectiles/vulcan_colors.json', import.meta.url), 'utf8'));
  const want = {
    base: WEAPON_COLORS.vulcan,
    needle: EVO_COLORS.vulcan_needle,
    storm: EVO_COLORS.vulcan_storm,
    tempest: EVO_COLORS.vulcan_tempest,
    lance: EVO_COLORS.vulcan_lance,
  };
  for (const [k, v] of Object.entries(want)) {
    assert.equal(String(man.colors[k]).toLowerCase(), String(v).toLowerCase(),
      `${k} 스프라이트가 옛 색으로 구워져 있다 — make_vulcan_2d.py 를 다시 실행해야 한다`);
  }
  //  5종 모두 서로 다른 색이어야 진화를 눈으로 구분할 수 있다.
  const uniq = new Set(Object.values(man.colors).map((c) => String(c).toLowerCase()));
  assert.equal(uniq.size, 5, '5종 색이 전부 달라야 한다');
});
