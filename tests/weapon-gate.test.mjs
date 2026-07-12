import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Squad, TriGate } from '../js/entities.js';

const noop = () => {};
function makeWorld(sq) {
  return {
    squad: sq, logicalW: 480, logicalH: 776, entities: [], bullets: [], enemyBullets: [], bosses: [],
    scrollSpeed: 0, effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop }, mfx: {},
    addCoins: noop,
  };
}
function weaponGate(y) {
  return new TriGate(480, y, [
    { kind: 'weapon', weapon: 'vulcan' },
    { kind: 'weapon', weapon: 'laser' },
    { kind: 'weapon', weapon: 'homing' },
  ]);
}
function squadAt(x, weapon) {
  const s = new Squad(480, 776, 100); s.weapon = weapon; s.x = x; s.y = 400;
  return s;
}

test('무기 게이트: 발칸 레인 가장자리를 스치며 통과해도 레이저가 유지된다 (버그 수정)', () => {
  const s = squadAt(15, 'laser');          // far-left = 발칸 레인 가장자리
  const w = makeWorld(s);
  const g = weaponGate(400);               // 편대와 같은 y → 통과 판정
  g.update(0, w);
  assert.equal(s.weapon, 'laser', '가장자리 스침 → 무기 유지');
});

test('무기 게이트: 발칸 레인 중앙에 확실히 있으면 발칸으로 변경(의도한 선택)', () => {
  const s = squadAt(80, 'laser');          // 발칸 레인(0~160) 중앙 ≈ 80
  const w = makeWorld(s);
  weaponGate(400).update(0, w);
  assert.equal(s.weapon, 'vulcan', '레인 중앙 → 의도적 변경');
});

test('무기 게이트: 현재 무기와 같은 레인이면 그대로 (호밍 레인의 호밍)', () => {
  const s = squadAt(400, 'homing');        // 호밍 레인(320~480) 중앙 ≈ 400
  const w = makeWorld(s);
  weaponGate(400).update(0, w);
  assert.equal(s.weapon, 'homing');
});

test('무기 게이트: 레이저 레인 중앙에서 레이저로 의도적 선택', () => {
  const s = squadAt(240, 'vulcan');        // 레이저 레인(160~320) 중앙 = 240
  const w = makeWorld(s);
  weaponGate(400).update(0, w);
  assert.equal(s.weapon, 'laser');
});
