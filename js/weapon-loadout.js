// 무기 슬롯 (전면개편 §5.3). main·wing 2슬롯이 독립 발사주기·레벨·피해통계를 가진다.
// 순수 로직 — 진화/초진화 상태는 Squad의 무기별 맵(weaponEvolutions 등, weaponId 키)에 그대로 두고,
// 여기서는 "어떤 무기가 어느 슬롯에, 몇 레벨로, 발사 쿨은 얼마"만 관리한다.
// 같은 무기는 최대 한 슬롯에만 존재한다(세 공명 쌍이 모두 서로 다른 두 무기라 충돌 없음).

export const SLOT_NAMES = ['main', 'wing'];

/** 새 로드아웃. main에 시작 무기, wing은 빈 슬롯. */
export function createLoadout(startWeaponId = 'vulcan') {
  return {
    slots: [
      { slot: 'main', weaponId: startWeaponId, level: 1, cd: 0 },
      { slot: 'wing', weaponId: null, level: 1, cd: 0 },
    ],
  };
}

/** 무기가 장착된 슬롯만(발사 대상). */
export function activeSlots(lo) {
  return lo.slots.filter((s) => s.weaponId);
}

/** 특정 무기가 든 슬롯 객체(없으면 null). */
export function findSlot(lo, weaponId) {
  return lo.slots.find((s) => s.weaponId === weaponId) || null;
}

/** 첫 빈 슬롯(없으면 null). */
export function firstEmpty(lo) {
  return lo.slots.find((s) => !s.weaponId) || null;
}

/** 슬롯이 가득 찼는가(모든 슬롯에 무기). */
export function isFull(lo) {
  return lo.slots.every((s) => s.weaponId);
}

/** 두 슬롯의 무기 id 배열([main, wing], 빈 슬롯은 null). */
export function slotWeapons(lo) {
  return lo.slots.map((s) => s.weaponId);
}

/** 공명 쌍(무기 두 개)이 현재 두 슬롯에 모두 있는가. */
export function hasPair(lo, pair) {
  const ws = slotWeapons(lo).filter(Boolean);
  return pair.every((w) => ws.includes(w));
}

/** 무기의 현재 레벨(미장착이면 0). */
export function levelOf(lo, weaponId) {
  const s = findSlot(lo, weaponId);
  return s ? s.level : 0;
}

/**
 * 무기 획득 처리(§5.3). 기존 무기 교체가 아니라 빈 슬롯 장착이 기본.
 *  - 이미 장착: 레벨업(maxLv 상한) → { result:'leveled', slot }
 *  - 빈 슬롯 존재: 장착 → { result:'equipped', slot, filledWing }
 *  - 가득 참: 장착·레벨 변화 없음 → { result:'full' } (호출부가 명시적 교체/강화 제안)
 */
export function equip(lo, weaponId, maxLv = 3) {
  const existing = findSlot(lo, weaponId);
  if (existing) {
    const before = existing.level;
    existing.level = Math.min(maxLv, existing.level + 1);
    return { result: 'leveled', slot: existing, changed: existing.level !== before };
  }
  const empty = firstEmpty(lo);
  if (empty) {
    empty.weaponId = weaponId;
    empty.level = 1;
    empty.cd = 0;
    return { result: 'equipped', slot: empty, filledWing: empty.slot === 'wing' };
  }
  return { result: 'full' };
}

/** 명시적 교체(가득 찬 뒤 사용자 확인). 지정 슬롯의 무기를 교체하고 레벨 1로. */
export function replaceSlot(lo, slotName, weaponId) {
  const s = lo.slots.find((x) => x.slot === slotName);
  if (!s) return { result: 'noslot' };
  const prev = s.weaponId;
  s.weaponId = weaponId;
  s.level = 1;
  s.cd = 0;
  return { result: 'replaced', slot: s, prev };
}

/** 무기 직접 레벨업(캡슐 등). maxLv 상한. */
export function levelUp(lo, weaponId, maxLv = 3) {
  const s = findSlot(lo, weaponId);
  if (!s) return false;
  const before = s.level;
  s.level = Math.min(maxLv, s.level + 1);
  return s.level !== before;
}

// ── 구 단일 무기 구조 호환 어댑터(§5.3 호환성) ───────────────────
// 기존 세이브·테스트·캠페인이 쓰던 { weapon, weaponLv } ↔ 슬롯 구조를 오가게 한다.

/** 구 { weapon, weaponLv } → 로드아웃(main 한 슬롯). wing은 비움. */
export function loadoutFromLegacy(weapon = 'vulcan', weaponLv = 1) {
  const lo = createLoadout(weapon);
  lo.slots[0].level = weaponLv || 1;
  return lo;
}

/** 로드아웃 → 구 { weapon, weaponLv }(main 슬롯 기준). 구 코드 읽기 호환. */
export function legacyView(lo) {
  const main = lo.slots[0];
  return { weapon: main.weaponId, weaponLv: main.level };
}
