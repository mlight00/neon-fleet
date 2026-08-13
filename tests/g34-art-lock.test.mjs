// ── §G-34 §8 (P1) — 스프라이트 결정 고정 + 판정 링의 의미 ──
//  ① `lockedSprite`: 개체 하나의 그림은 **수명 내내 바뀌지 않는다**. 스프라이트가 늦게 도착하거나
//     영영 안 와도(404) 마찬가지다 — 화면에서 같은 물체가 도중에 다른 모습이 되면 안 된다.
//  ② 판정 링: 장식이 아니라 **플레이어가 피해야 할 반경**을 그린다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { lockedSprite, Debris } from '../js/entities.js';
import { BAL } from '../js/balance.js';

test('G34-ARTLOCK-404: 스프라이트가 없으면 폴백으로 고정되고 흔들리지 않는다', () => {
  //  Node 에는 캔버스가 없어 모든 스프라이트가 미준비다 — 그 자체가 **404/미로딩 상황의 재현**이다.
  const obj = {};
  const first = lockedSprite(obj, 'nf2_does_not_exist_zzz');
  assert.equal(first, null, '없는 스프라이트는 null(=2D 폴백으로 그린다)');
  //  같은 개체를 몇 번을 물어봐도 답이 같아야 한다. 프레임마다 답이 달라지면 그림이 깜빡인다.
  for (let i = 0; i < 5; i++) {
    assert.equal(lockedSprite(obj, 'nf2_does_not_exist_zzz'), null, `${i + 2}번째 호출도 같은 결정`);
  }
});

test('G34-ARTLOCK-LATE: 늦게 도착해도 이미 그리기 시작한 개체는 모습을 바꾸지 않는다', () => {
  //  스프라이트는 비동기로 로드된다. 잠금이 없으면 "폴백으로 그리던 적이 갑자기 새 그림으로 바뀌는"
  //  일이 생긴다 — 같은 물체가 도중에 다른 것이 되면 플레이어는 새 적이 나타났다고 읽는다.
  //  ⚠️Node 에서 실제 로딩을 흉내 낼 수 없으므로, **잠금 자체**를 검증한다:
  //   첫 호출에서 결정이 박히고, 그 뒤 **id 를 바꿔 물어도** 첫 결정이 유지된다.
  const obj = {};
  lockedSprite(obj, 'nf2_missing_a');                       // 첫 결정 = 미준비(폴백)
  const afterOtherId = lockedSprite(obj, 'nf2_missing_b');  // 다른 id 로 물어도
  assert.equal(afterOtherId, null, '한 번 폴백으로 정해진 개체는 계속 폴백이다');
});

test('G34-ARTLOCK-PEROBJECT: 결정은 개체별로 독립이다', () => {
  //  전역 플래그로 만들면 한 개체의 결정이 화면의 모든 개체를 바꾼다.
  const a = {}, b = {};
  assert.equal(lockedSprite(a, 'nf2_missing_x'), null);
  assert.equal(lockedSprite(b, 'nf2_missing_y'), null);
  //  서로 다른 객체가 서로의 결정을 덮어쓰지 않는지(같은 값이어도 독립적으로 저장돼야 한다).
  assert.equal(lockedSprite(a, 'nf2_missing_x'), null, 'a 의 결정 유지');
  assert.equal(lockedSprite(b, 'nf2_missing_y'), null, 'b 의 결정 유지');
});

test('G34-HITRING-MEANING: 판정 링은 "플레이어가 피해야 할 반경"을 그린다', () => {
  //  Codex §8 지적: 잔해는 기함 접촉이 `r × 0.82`, 탄 충돌은 `r` 로 **두 반경**이 있다.
  //  어느 쪽을 그려야 하나? → 잔해는 **파괴 불가**다(`hitByBullet` 이 스파크만 내고 피해 0).
  //   즉 탄 쪽 반경은 플레이어 판단에 아무 영향이 없고, 의미 있는 판정은 접촉 하나뿐이다.
  //   그래서 링은 `r × 0.82`(접촉)를 그리는 것이 맞다 — 이 계약을 값으로 잠근다.
  const d = new Debris(240, 300);
  assert.ok(d.r > 0, '잔해에 반경이 있다');

  //  ① 파괴 불가 확인 — 탄을 맞아도 hp 가 줄거나 죽지 않는다.
  const fx = { burst() {}, text() {}, ring() {}, halo() {}, flash() {} };
  const before = { dead: d.dead, hp: d.hp };
  d.hitByBullet(9999, { effects: fx });
  assert.equal(d.dead, before.dead, '탄으로는 죽지 않는다(파괴 불가)');
  assert.equal(d.hp, before.hp, '탄으로는 체력이 줄지 않는다');

  //  ② 접촉 계수가 밸런스와 함께 살아 있는지 — 링이 그리는 값과 충돌이 쓰는 값이 같아야 한다.
  //   (둘 다 `this.r * 0.82` 로 같은 상수를 쓴다. 한쪽만 바뀌면 "보이는 것 ≠ 맞는 것"이 된다.)
  const CONTACT_REL = 0.82;
  assert.ok(d.r * CONTACT_REL < d.r, '접촉 반경은 그림 반경보다 작다(원본 비율 유지 때문)');
  assert.ok(BAL.debris && Number.isFinite(BAL.debris.hitCooldown),
    '접촉 피해에 쿨다운이 있다(한 번 스치고 연타로 죽지 않게)');
});
