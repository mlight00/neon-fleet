// rush3/supply.js — 보급 통(병사/무기/연속 증원). 순수 규칙만(난수·화면·balance 없음). 계약서 3-3.
// s = { id, z, x, r, kind, durability, maxDurability, payload, opened, missed, locked, activated, queuedPads, pads }
// payload: soldier { n } / weapon { weapon } / chain { pads0, maxPads }   pads = [{ z, x, taken }]
// 유닛 증감은 squad.js 의 addUnits/removeUnits 를 직접 호출한다(콜백 주입 없음).
import { addUnits } from './squad.js';

export const SUPPLY_R = 30;
export const PAD_START = 60;
export const PAD_GAP = 40;
export const PAD_REACH = 70;

// def = { id, z, x, kind, durability, maxDurability?, r?, payload, padStart?, padGap? }
export function makeSupply(def) {
  const payload = def.payload ? { ...def.payload } : {};
  const s = {
    id: def.id, z: def.z, x: def.x, r: def.r ?? SUPPLY_R, kind: def.kind,
    durability: def.durability, maxDurability: def.maxDurability ?? def.durability,
    payload, opened: false, missed: false, locked: false, activated: false, queuedPads: 0, pads: [],
    padStart: def.padStart ?? PAD_START, padGap: def.padGap ?? PAD_GAP,
  };
  return s;
}

// 충돌 후보 여부: (opened && chain 아님) || missed || locked 면 제외.
export function supplyActive(s) {
  return !((s.opened && s.kind !== 'chain') || s.missed || s.locked);
}

// 보상 데이터(pendingRewards 항목). id 는 chain 활성화 때 통을 찾기 위한 덤.
export function supplyReward(s) {
  return { kind: s.kind, payload: { ...s.payload }, x: s.x, z: s.z, id: s.id };
}

// 탄 스윕 [pz, z](수직 선분) vs 통 원(중심 (x, z), 반지름 r) 겹침.
export function sweepHitsSupply(s, bullet) {
  if (!supplyActive(s)) return false;
  const dx = Math.abs(bullet.x - s.x);
  if (dx > s.r) return false;
  const half = Math.sqrt(s.r * s.r - dx * dx);
  const zlo = Math.min(bullet.pz, bullet.z), zhi = Math.max(bullet.pz, bullet.z);
  return zhi >= s.z - half && zlo <= s.z + half;
}

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
export function hitSupply(s, bullet, events, run) {
  if (!run || !Array.isArray(run.pendingRewards)) throw new TypeError('hitSupply: run.pendingRewards 배열이 필요하다');
  if (!supplyActive(s)) return false;
  bullet.dead = true;
  if (s.opened) {
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
  if (s.durability <= 0) {
    s.durability = 0;
    s.opened = true;
    run.pendingRewards.push(supplyReward(s));
    events.push({ type: 'supplyOpen', id: s.id, kind: s.kind, x: s.x, z: s.z });
  } else {
    events.push({ type: 'supplyHit', id: s.id, durability: s.durability, x: s.x, z: s.z });
  }
  return true;
}

// prevZ < s.z <= z 에 미개봉이면 missed(피해 없음). chain 은 이 시점에 locked(발판 더 이상 증가 없음).
export function passSupply(s, run, events) {
  if (s.missed || (s.opened && s.kind !== 'chain')) return false;
  if (!(run.prevZ < s.z && s.z <= run.z)) return false;
  let changed = false;
  if (!s.opened) {
    s.missed = true;
    run.missedSupplies = (run.missedSupplies || 0) + 1;
    events.push({ type: 'supplyMissed', id: s.id, kind: s.kind, x: s.x, z: s.z });
    changed = true;
  }
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
  if (reward.kind === 'weapon') {
    const rank = opts.weaponRank;
    const w = reward.payload.weapon;
    if (typeof rank === 'function' && rank(w) > rank(run.weapon)) {
      run.weapon = w;
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
