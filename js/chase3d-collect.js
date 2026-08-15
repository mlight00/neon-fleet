// ── 적 3D 슬롯 기록(순수) — §G39-R1 ────────────────────────────────────────────────────
//
//  `main.js` 의 `put3D()` 가 실제로 쓰는 **바로 그** 슬롯 기록이다. 테스트도 이 함수를 부른다.
//  (`chase3d-shot-place.js` 와 같은 이유로 분리했다 — renderer/main 안에 인라인이면 정규식 대조밖에 못 한다.)
//
//  ⚠️**위치와 색을 한 호출로 묶은 것이 이 모듈의 요점이다.**
//   Codex 구현검수 §5: "production 의 `writeDamageColor(o, ...)` 한 줄을 지워도 테스트가 다 통과한다."
//   색만 따로 지울 수 있으면 그 회귀는 조용히 지나간다. 여기서는 색을 지우려면 위치도 같이 지워야 하고,
//   그러면 적이 전부 화면 원점에 크기 0 으로 몰려 **눈에 띄게 깨진다** — 조용한 회귀가 성립하지 않는다.
//
//  ⚠️프레임마다 도는 경로다. 새 객체를 만들지 않는다 — 넘겨받은 슬롯에 직접 쓴다.
import { writeDamageColor, readDamageFlash, consumeHitSpark } from './damage-feedback.js';

/**
 * 적 1기를 3D 스웜 슬롯에 기록한다.
 *  @param slot  재사용 슬롯 `{ sx, sy, px, wob, cr, cg, cb }`
 *  @param e     게임 개체(읽기 전용 — 여기서 게임 truth 를 바꾸지 않는다)
 *  @param p     `projectObject()` 결과 `{ x, y, scale }`
 *  @param def   `ENEMY3D[key]` — 화면 전장 `len` 과 상한 `max`
 *  @param wob   흔들림 위상
 *  @param now   게임 누적 시간(초). ⚠️벽시계가 아니다
 *  @param boost 피격 번쩍 최대 배수(`FEEDBACK.boost` / `boostReduced`)
 *  @returns 같은 slot
 */
export function writeEnemySlot(slot, e, p, def, wob, now, boost) {
  slot.sx = p.x;
  slot.sy = p.y;
  slot.px = Math.min(def.max, def.len * p.scale);
  slot.wob = wob;
  //  체력·피격을 색으로. maxHp 가 없는 개체(위험물 일부)는 무염색(흰색)으로 남는다.
  const hpFrac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  writeDamageColor(slot, hpFrac, readDamageFlash(e, now), boost);
  //  §G-46: 이번 프레임에 새로 맞았으면 파편 1회분을 청구한다(같은 기록으로 두 번 안 나온다).
  //   placeSwarm 이 이 값을 보고 **이미 계산해 둔 적의 3D 좌표에서** 파편을 낸다 — 추가 좌표 계산 0.
  //  ⚠️여기서 파편을 만들지 않는다. 이 모듈은 순수 기록자다(무할당·three 미의존).
  slot.spark = consumeHitSpark(e) ? 1 : 0;
  //  §G-46: 빈사 표현용. placeSwarm 이 잔불 확률에 쓴다(0.3 이하부터).
  slot.hp = hpFrac;
  return slot;
}
