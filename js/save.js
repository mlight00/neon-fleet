// 저장 래퍼 — storage 주입식이라 테스트 가능, 실패 시 메모리 폴백
const KEY = 'neonFleet.v1';
const DEFAULTS = {
  best: 0, coins: 0, stage: 1, style: 'C', styleChosen: false,
  introSeen: false,                             // 인트로 크롤 시청 여부
  stageMigrated: true,                          // stage 기록 마이그레이션 완료 플래그(신규 저장은 항상 true)
  up: { drones: 0, dmg: 0, rate: 0, coin: 0 }, // 격납고 강화 레벨
  snd: { bgm: 0.5, sfx: 0.8, mute: false },     // 사운드 설정
};

const SECTOR_SPAN = 6; // 옛 stage = (sector-1)×(depth+1) + col + 1, depth 5 → 6

export function createSave(storage = globalThis.localStorage) {
  let available = false;
  try {
    storage.getItem(KEY); // 접근 가능성 탐침 (시크릿 모드 등에서 throw)
    available = true;
  } catch {
    available = false;
  }

  let memory = null; // storage 불능 시 세션 내 폴백

  // 1회 마이그레이션: 옛 버그로 stage에 내부 난이도((sector-1)×6+col+1)가 저장된 것을 섹터로 환산.
  // 신규 저장(DEFAULTS.stageMigrated=true)은 건드리지 않는다. 원본 raw를 직접 파싱해 플래그 유무로 판별.
  if (available) {
    try {
      const raw = storage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && !data.stageMigrated) {
          if (typeof data.stage === 'number') data.stage = Math.max(1, Math.floor((data.stage - 1) / SECTOR_SPAN) + 1);
          data.stageMigrated = true;
          storage.setItem(KEY, JSON.stringify(data));
        }
      }
    } catch { /* 손상된 데이터는 get()에서 기본값으로 복구 */ }
  }

  return {
    available,
    get() {
      if (!available) return memory ? { ...memory } : structuredClone(DEFAULTS);
      try {
        const raw = storage.getItem(KEY);
        if (!raw) return structuredClone(DEFAULTS);
        const data = JSON.parse(raw);
        return {
          ...structuredClone(DEFAULTS), ...data,
          up: { ...DEFAULTS.up, ...(data.up || {}) },
          snd: { ...DEFAULTS.snd, ...(data.snd || {}) },
        };
      } catch {
        return structuredClone(DEFAULTS);
      }
    },
    set(patch) {
      const next = { ...this.get(), ...patch };
      memory = next;
      if (available) {
        try {
          storage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* 쿼터 초과 등 — 메모리 폴백 유지 */
        }
      }
      return next;
    },
    /** 전체 진행 초기화 (사운드 설정 + 인트로 시청 여부는 유지) */
    reset() {
      const { snd, introSeen } = this.get();
      const fresh = { ...structuredClone(DEFAULTS), snd, introSeen };
      memory = fresh;
      if (available) {
        try { storage.setItem(KEY, JSON.stringify(fresh)); } catch {}
      }
      return fresh;
    },
  };
}
