// rush3/supply.js — 보급 통(병사/무기/연속 증원). 순수 규칙만(난수·화면·balance 없음). 계약서 3-3.
// s = { id, z, x, r, kind, durability, maxDurability, payload, opened, missed, locked, skipped, coverZ, pairId, hint, activated, queuedPads, pads,
//       move, homeX, moveT, prevX }
// payload: soldier { n } / weapon { weapon } / chain { pads0, maxPads } / capsule { n }   pads = [{ z, x, taken }]
// capsule(r3.14 구출 캡슐) = 판 목표(run.objective)가 가리키는 통. 탄·차폐·내구·개봉 경로는 일반 통과 같고, 열리면 joinMany + capsuleRescue,
//   미개봉으로 지나치면 capsuleMissed 를 더 낸다. 승패(run.won)에는 관여하지 않는다 — 놓쳐도 실패가 아니고 구출도 승리가 아니다.
// coverZ = 차폐 개방선(비행시간 보정선). run.z < coverZ 이면 탄을 흡수하고 내구는 줄지 않는다(계약서 3-3 · 개정 r3 §3-3).
// pairId = 벽으로 배제되는 쌍의 이름. 한 판에서 같은 pairId 는 최대 1개만 열린다.
// move(r3.13 차량) = { x0, x1, period } | null. 통의 z 는 고정이고 x 만 삼각파(왕복)로 움직인다. homeX = 출발 x(위상 원점),
//   moveT = 화면 진입(obj.z - run.z <= ENTER_Z)부터 센 자기 시계(초, null = 아직 진입 전), prevX = 직전 STEP 의 x(탄 캡슐 스윕용).
// armZ(r3.18 대항 검수 반영) = 피격 활성 구간(px) | null. s.z − run.z > armZ 인 동안 탄은 흡수되고(supplyBlock reason 'arm') 내구는 줄지 않는다 —
//   게이트 셔터와 같은 꼴. 화면 위(진입선 760)에서 탄 줄기에 맞아 **보이기도 전에 열리는 것**을 막는다. null = 항상 활성(종전 통 전부).
// 유닛 증감은 squad.js 의 addUnits/removeUnits 를 직접 호출한다(콜백 주입 없음).
import { addUnits } from './squad.js';
import { triWave } from './motion.js';

export const SUPPLY_R = 30;
export const PAD_START = 60;
export const PAD_GAP = 40;
export const PAD_REACH = 70;
// 벽 활성(통로 확정) 선행 여유. squad.SQUAD_DEFAULTS.wallLead 와 같은 값(순수 모듈이라 import 하지 않고 상수로 둔다)
export const WALL_LEAD = 60;
// 화면 진입선(px). BAL3.enterZ 와 같은 값 — 차량 통의 자기 시계는 여기서부터 센다(WALL_LEAD 처럼 상수로 복제, 검사가 일치를 잠근다)
export const ENTER_Z = 760;
// 구출 캡슐 합류 병사 수 기본값(r3.14). 배치(courses)가 n 을 안 적으면 이 값 — stages.makeSupplyDef 도 같은 상수를 쓴다(단일 출처)
export const CAPSULE_N_DEFAULT = 3;

// def = { id, z, x, kind, durability, maxDurability?, r?, payload, padStart?, padGap?, coverZ?, pairId?, hint?, move? }
export function makeSupply(def) {
  const payload = def.payload ? { ...def.payload } : {};
  if (def.kind === 'capsule' && payload.n == null) payload.n = CAPSULE_N_DEFAULT;
  const move = def.move ? { x0: def.move.x0, x1: def.move.x1, period: def.move.period } : null;
  const s = {
    id: def.id, z: def.z, x: def.x, r: def.r ?? SUPPLY_R, kind: def.kind,
    durability: def.durability, maxDurability: def.maxDurability ?? def.durability,
    payload, opened: false, missed: false, locked: false, skipped: false, activated: false, queuedPads: 0, pads: [],
    coverZ: def.coverZ ?? null, pairId: def.pairId ?? null, hint: def.hint ?? null,
    padStart: def.padStart ?? PAD_START, padGap: def.padGap ?? PAD_GAP,
    //  r3.13 차량: move 는 복사본(구조 공유 금지). 정지 통은 move null 이고 prevX 는 항상 x 와 같다
    move, homeX: def.x, moveT: null, prevX: def.x,
    //  r3.18: 피격 활성 구간. 없으면 null(종전과 같은 객체 키 집합 + 이 칸 하나)
    armZ: def.armZ ?? null,
  };
  return s;
}

/** 피격 활성 여부(r3.18). armZ 가 없으면 항상 true. run 이 없으면(옛 합성 호출) true — 흡수를 조용히 만들지 않는다 */
export function supplyArmed(s, run) {
  return s.armZ == null || !run || s.z - run.z <= s.armZ;
}

/** 차량 통의 x(r3.13). 삼각파 왕복: x0 → x1 → x0 가 period 초. homeX 가 x0 이면 오른쪽으로, x1 이면 왼쪽으로 먼저 간다.
 *  (x0·x1 사이의 homeX 는 그 자리에서 오른쪽으로 출발 — 점프 없음.) 난수·시계 없음, t 만의 함수.
 *  공식은 motion.triWave 한 곳(보너스 표적 bonus.targetX 와 공용) — 여기서는 homeX → 출발 위상 u0 변환만 한다 */
export function vehicleX(move, homeX, t) {
  const span = move.x1 - move.x0;
  if (!(span > 0) || !(move.period > 0)) return homeX;
  const u0 = homeX >= move.x1 ? 0.5 : Math.max(0, (homeX - move.x0) / span) / 2;
  return triWave(move.x0, move.x1, move.period, u0, t);
}

/** 차량 통 한 STEP(r3.13, combat 3-c 단계). 반환 = 이번 STEP 에 x 가 갱신됐는가.
 *   · 매 STEP prevX = x(정지 통도 — 탄 스윕이 [prevX, x] 캡슐을 본다)
 *   · 열리거나(opened) 지나치면(missed/skipped) 그 자리에 선다 — chain 은 열린 x 에 발판이 한 줄로 깔린다
 *   · 진입 STEP(s.z - run.z <= ENTER_Z 가 처음 성립): 시계만 0, x 는 아직 homeX. 다음 STEP 부터 moveT += dt
 *   · run.z 만 읽으므로(입력·난수 무관) 진입 시점·위상이 판마다 같다. 차폐(coverZ) 중에도 움직인다 */
export function moveSupply(s, run, dt) {
  s.prevX = s.x;
  if (!s.move) return false;
  if (s.opened || s.missed || s.skipped) return false;
  if (s.moveT === null) {
    if (s.z - run.z <= ENTER_Z) s.moveT = 0;
    return false;
  }
  s.moveT += dt;
  s.x = vehicleX(s.move, s.homeX, s.moveT);
  return true;
}

// 충돌 후보 여부: (opened && chain 아님) || missed || locked || skipped 면 제외.
//  차폐(coverZ)는 여기서 보지 않는다 — 차폐된 통도 충돌 후보로 남아 탄을 흡수한다(hitSupply 안에서 검사).
export function supplyActive(s) {
  return !((s.opened && s.kind !== 'chain') || s.missed || s.locked || s.skipped);
}

// 차폐 중인가(탄이 흡수되고 내구가 줄지 않는 구간)
export function supplyCovered(s, run) {
  return s.coverZ != null && run && run.z < s.coverZ;
}

/** 지나는 시점에 '구조적으로 획득 불가능했는가'(개정 r3 §6-1).
 *  (a) 벽 배제  : 통이 어떤 벽의 활성 구간 안에 있고 통로가 이미 확정됐는데 통 원이 그 통로와 전혀 겹치지 않는다
 *  (b) 차폐 미개방 : coverZ 가 아직 안 열렸다
 *  (c) 쌍 배제  : 같은 pairId 의 다른 통이 이미 열렸다  */
export function structurallyLost(s, run) {
  const walls = (run && run.walls) || [];
  const side = (run && run.wallSide) || {};
  for (const w of walls) {
    if (!(w.z0 - WALL_LEAD <= s.z && s.z <= w.z1)) continue;
    const sd = side[w.id];
    if (sd !== 'L' && sd !== 'R') continue;
    if (sd === 'L' ? s.x - s.r > w.x0 : s.x + s.r < w.x1) return true;
  }
  if (supplyCovered(s, run)) return true;
  if (s.pairId != null) {
    for (const o of (run && run.supplies) || []) {
      if (o === s || o.pairId !== s.pairId) continue;
      if (o.opened) return true;
    }
  }
  return false;
}

// 보상 데이터(pendingRewards 항목). id 는 chain 활성화 때 통을 찾기 위한 덤.
export function supplyReward(s) {
  return { kind: s.kind, payload: { ...s.payload }, x: s.x, z: s.z, id: s.id };
}

// 탄 스윕 [pz, z](수직 선분, 중심 x 기준 = 탄 폭 미반영) vs 통 원(중심 (x, z), 반지름 r) 의 최초 교차 z.
// 겹치지 않으면 null. 교차 z = 스윕이 원에 처음 들어가는 z = max(s.z - 반현, 스윕 시작).
//  r3.13 차량: 통의 x 를 점이 아니라 이번 STEP 의 이동 구간 [min(prevX, x), max(prevX, x)] 로 본다(캡슐 = 스타디움 판정).
//   dx = 탄 x 에서 그 구간까지의 거리. 정지 통은 prevX === x 라 종전 판정과 완전히 같고(회귀 0), 빠른 왕복에서도
//   통이 탄 x 를 한 STEP 에 건너뛰어 놓치는 일(터널링)이 없다. prevX 가 없는 옛 리터럴 객체는 점으로 본다.
export function sweepContactSupply(s, bullet) {
  if (!supplyActive(s)) return null;
  const px = s.prevX ?? s.x;
  const lo = Math.min(px, s.x), hi = Math.max(px, s.x);
  const dx = Math.max(0, lo - bullet.x, bullet.x - hi);
  if (dx > s.r) return null;
  const half = Math.sqrt(s.r * s.r - dx * dx);
  const zlo = Math.min(bullet.pz, bullet.z), zhi = Math.max(bullet.pz, bullet.z);
  if (!(zhi >= s.z - half && zlo <= s.z + half)) return null;
  return Math.max(s.z - half, zlo);
}

// 겹침 여부만(기존 계약 유지). 판정은 sweepContactSupply 하나로 모았다.
export function sweepHitsSupply(s, bullet) {
  return sweepContactSupply(s, bullet) !== null;
}

//  r4.4 소수 피해 여유값(combat.HP_EPS 와 같은 값): 직격 화력 강화 탄(1.3·1.6 …)이 남기는 부동소수 잔량은 0 으로 본다
const DUR_EPS = 1e-9;

// 발판 1개 추가(maxPads 상한). 추가됐으면 true.
function addPad(s, events) {
  const max = s.payload.maxPads ?? Infinity;
  if (s.pads.length >= max) return false;
  const i = s.pads.length;
  s.pads.push({ z: s.z + s.padStart + i * s.padGap, x: s.x, taken: false });
  events.push({ type: 'padAdd', id: s.id, pads: s.pads.length, x: s.x, z: s.pads[i].z });
  return true;
}

// chain 보상 적용(9단계): 발판 pads0 개를 s.z + 60 + i*40, x = s.x 에 생성(이벤트 chainOn).
// 개봉과 활성화 사이(같은 STEP 5 의 후속 탄)에 세어 둔 queuedPads 는 여기서 한꺼번에 발판으로 만든다(padAdd 는 그 수만큼).
// 활성화 여부는 activated 플래그로 판단한다(pads 길이가 아님). 두 번 활성화되지 않는다.
export function activateChain(s, events) {
  if (s.kind !== 'chain' || s.activated) return false;
  s.activated = true;
  const n = Math.min(s.payload.pads0 ?? 0, s.payload.maxPads ?? Infinity);
  for (let i = 0; i < n; i++) s.pads.push({ z: s.z + s.padStart + i * s.padGap, x: s.x, taken: false });
  events.push({ type: 'chainOn', id: s.id, pads: s.pads.length, x: s.x, z: s.z });
  const queued = s.queuedPads;
  s.queuedPads = 0;
  for (let i = 0; i < queued; i++) if (!addPad(s, events)) break;
  return true;
}

// 탄 1발 처리. 무시 대상이면 false(흡수도 없음). 통은 탄을 흡수한다.
// 내구 <= 0 이 되는 첫 탄에서 opened → run.pendingRewards 에 보상 정확히 1회 push + 이벤트 supplyOpen(연출용, reward 없음).
// run(pendingRewards 배열 포함)은 필수 — 보상 경로를 하나로 고정하기 위해 없으면 throw.
// chain 은 opened 이후 유효탄 1발(무기 무관) = 발판 +1(maxPads 까지, 이벤트 padAdd). 아직 활성화 전이면 queuedPads 로 셈.
//  r4.4 (b) 로봇 다연발의 추가 탄(bullet.extra, 이사님 결정 N3): 열린 증원 설비에 닿으면 흡수만 하고 발판을 늘리지 않는다(queuedPads 도).
//   열리기 전 통의 내구에는 다른 탄과 똑같이 피해를 준다(일반 보급 통 효과). 내구 판정은 소수 피해 여유값(DUR_EPS) — 정수 피해에선 결과 불변
export function hitSupply(s, bullet, events, run) {
  if (!run || !Array.isArray(run.pendingRewards)) throw new TypeError('hitSupply: run.pendingRewards 배열이 필요하다');
  if (!supplyActive(s)) return false;
  bullet.dead = true;
  //  차폐 구간: 흡수만 하고 내구는 줄지 않는다(⚠️sweepContactSupply·supplyActive 에 넣으면 흡수가 통과로 뒤집힌다)
  if (supplyCovered(s, run)) {
    events.push({ type: 'supplyBlock', id: s.id, x: bullet.x, z: s.z, reason: 'cover' });
    return true;
  }
  //  피격 활성 전(armZ, r3.18): 차폐와 같은 흡수. 차폐가 먼저 판정되므로 둘 다 걸린 통의 reason 은 'cover'
  if (!supplyArmed(s, run)) {
    events.push({ type: 'supplyBlock', id: s.id, x: bullet.x, z: s.z, reason: 'arm' });
    return true;
  }
  if (s.opened) {
    if (bullet.extra) return true;
    if (s.activated) addPad(s, events);
    else {
      const max = s.payload.maxPads ?? Infinity;
      const pads0 = Math.min(s.payload.pads0 ?? 0, max);
      if (pads0 + s.queuedPads < max) s.queuedPads++;
    }
    return true;
  }
  const dmg = Math.max(0, bullet.dmg ?? 1);
  s.durability -= dmg;
  if (s.durability <= DUR_EPS) {
    s.durability = 0;
    s.opened = true;
    run.pendingRewards.push(supplyReward(s));
    events.push({ type: 'supplyOpen', id: s.id, kind: s.kind, x: s.x, z: s.z });
  } else {
    events.push({ type: 'supplyHit', id: s.id, durability: s.durability, x: s.x, z: s.z });
  }
  return true;
}

// prevZ < s.z <= z 에 미개봉이면 missed/skipped(피해 없음). chain 은 이 시점에 locked(발판 더 이상 증가 없음).
//  판정 순서(개정 r3 §6-1): 0 조기 반환 → 0-b z 창 → 1 개봉 chain(locked 만) → 2 구조적 불가면 skipped → 3 그 외 missed.
//  skipped = 벽·차폐·쌍 배제로 애초에 얻을 수 없던 통(의도된 선택). missed = 실제 기회 손실.
export function passSupply(s, run, events) {
  if (s.missed || s.skipped || (s.opened && s.kind !== 'chain')) return false;
  if (!(run.prevZ < s.z && s.z <= run.z)) return false;
  let changed = false;
  if (!s.opened) {
    if (structurallyLost(s, run)) {
      s.skipped = true;
      run.skippedSupplies = (run.skippedSupplies || 0) + 1;
      events.push({ type: 'supplySkipped', id: s.id, kind: s.kind, x: s.x, z: s.z });
    } else {
      s.missed = true;
      run.missedSupplies = (run.missedSupplies || 0) + 1;
      events.push({ type: 'supplyMissed', id: s.id, kind: s.kind, x: s.x, z: s.z });
    }
    //  구출 캡슐(r3.14): 놓친 통 집계·supplyMissed/supplySkipped 는 위에서 그대로 내고, 판 목표만 따로 알린다.
    //   run.objective 가 없는 합성 run(검사)에서도 이벤트만 나고 throw 하지 않는다. 승패는 건드리지 않는다
    if (s.kind === 'capsule') {
      events.push({ type: 'capsuleMissed', id: s.id, x: s.x, z: s.z, reason: s.skipped ? 'skipped' : 'missed' });
      const o = run.objective;
      if (o && o.kind === 'capsule' && o.supplyId === s.id && !o.done) o.missed = true;
    }
    changed = true;
  }
  //  ⚠️미개봉 chain 도 지나는 순간 locked(기존 V3-CHAIN 계약). skipped 분기에서도 실제로 발생한다(S3 p1 좌 = chain)
  if (s.kind === 'chain' && !s.locked) {
    s.locked = true;
    changed = true;
  }
  return changed;
}

// prevZ < pad.z <= z 이고 |run.x - pad.x| <= 70 인 발판 → taken, 유닛 +1(발판당 1회, squad.addUnits 직접), 이벤트 padTake { applied }.
// unitCap 에 걸려 실제 추가가 0 이어도 발판은 소모(taken)되고 applied 0 으로 알린다.
export function takePads(s, run, events) {
  let any = false;
  s.pads.forEach((p, i) => {
    if (p.taken) return;
    if (!(run.prevZ < p.z && p.z <= run.z)) return;
    if (Math.abs(run.x - p.x) > PAD_REACH) return;
    p.taken = true;
    const applied = addUnits(run, 1);
    events.push({ type: 'padTake', id: s.id, idx: i, applied, x: p.x, z: p.z });
    any = true;
  });
  return any;
}

// 보상 적용 헬퍼(9단계용, 선택). weaponRank 가 없으면 무기 보상은 건너뛴다(weaponSame 으로 알림).
// soldier 는 squad.addUnits 직접(cap 클램프, layoutUnits 포함). supplies 에서 id 로 chain 통을 찾아 activateChain. 반환 = 적용했는지.
export function applySupplyReward(reward, run, events, opts = {}) {
  if (reward.kind === 'soldier') {
    const n = reward.payload.n ?? 0;
    const added = addUnits(run, n);
    events.push({ type: 'joinMany', id: reward.id, n: added, x: reward.x, z: reward.z });
    return true;
  }
  //  구출 캡슐(r3.14): 병사 통과 같은 joinMany(셸의 '+N명 합류'·효과음·집계가 그대로 산다) + capsuleRescue 1회.
  //   run.objective 가 이 통을 가리키면 done — n 은 실제 합류 수(unitCap 클램프 뒤). objective 가 없는 합성 run 도 throw 없음
  if (reward.kind === 'capsule') {
    const added = addUnits(run, reward.payload.n ?? 0);
    events.push({ type: 'joinMany', id: reward.id, n: added, x: reward.x, z: reward.z });
    events.push({ type: 'capsuleRescue', id: reward.id, n: added, x: reward.x, z: reward.z });
    const o = run.objective;
    if (o && o.kind === 'capsule' && o.supplyId === reward.id) { o.done = true; o.missed = false; o.n = added; }
    return true;
  }
  if (reward.kind === 'weapon') {
    const rank = opts.weaponRank;
    const w = reward.payload.weapon;
    //  r3.10 강화: 지금 든 무기와 같은 통이면 Mk 한 단계(최대 opts.mkMax). 만렙이면 weaponSame
    if (w === run.weapon) {
      const mk = run.weaponMk || 1, max = opts.mkMax ?? 3;
      if (mk < max) {
        run.weaponMk = mk + 1;
        events.push({ type: 'weaponMk', weapon: w, mk: run.weaponMk, x: reward.x, z: reward.z });
        return true;
      }
      events.push({ type: 'weaponSame', weapon: w, x: reward.x, z: reward.z });
      return false;
    }
    if (typeof rank === 'function' && rank(w) > rank(run.weapon)) {
      run.weapon = w;
      run.weaponMk = 1;
      events.push({ type: 'weaponSwap', weapon: w, x: reward.x, z: reward.z });
      return true;
    }
    events.push({ type: 'weaponSame', weapon: w, x: reward.x, z: reward.z });
    return false;
  }
  if (reward.kind === 'chain') {
    const s = (opts.supplies || []).find((c) => c.id === reward.id);
    return s ? activateChain(s, events) : false;
  }
  return false;
}
