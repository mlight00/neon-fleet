// 런 로그 (전면개편 §6.1). 외부 분석 서버 없이 개발 중 window.__nfRunMetrics로 확인.
// 순수 로직 — 시간은 호출부가 런 클록(초)으로 넘긴다(Date 미사용, 테스트 가능·결정적).
// 렌더·규칙·저장이 직접 내부를 수정하지 않도록 공개 메서드로만 기록한다.

/** 런 통계 수집기. seed/runId는 호출부가 주입. 모든 record 메서드는 idempotent-safe하게 설계. */
export function createRunMetrics({ runId = 'run', seed = 0 } = {}) {
  const m = {
    runId, seed,
    durationSec: 0,
    choiceTimes: [],            // 모든 강화/카드 선택 시각
    behaviorUpgradeTimes: [],   // 행동 변화(모양/수/속도/범위) 강화만
    secondWeaponSec: null,      // 두 번째 무기 장착 시각(최초 1회)
    fleetSlotSec: null,         // 세 번째 슬롯(함대 시스템) 해금 시각(최초 1회, §7.2)
    firstResonanceSec: null,    // 첫 공명 완성 시각(최초 1회)
    hullTierTimes: [],          // 함체 승급 시각(H1..H5)
    framePickSec: null,         // 지휘 프레임 선택 시각(최초 1회)
    bossStartSec: null,
    bossEndSec: null,
    bossId: null,
    bossTtkSec: null,
    damageByWeapon: {},         // { vulcan, laser, homing } 누적 피해
    damageByResonance: {},      // { railStorm, microMissile, seekerBeam } 누적 피해
    hullDamageTaken: 0,
    hullRepairs: 0,
    cruiserLosses: 0,
    emergencyRebuilds: 0,
    gameOverReason: null,       // 'hull' | 'quit' | 'clear' | ...
    fpsLowPercentile: null,     // fps 5백분위(저사양 체감)
    _fps: [],                   // 원시 fps 샘플(스냅샷 시 백분위 계산)
  };

  const once = (key, t) => { if (m[key] == null) m[key] = round1(t); };

  return {
    /** 강화/카드 선택. behavior=true면 행동 변화 사건으로도 기록. */
    choice(t, { behavior = false } = {}) {
      m.choiceTimes.push(round1(t));
      if (behavior) m.behaviorUpgradeTimes.push(round1(t));
    },
    secondWeapon(t) { once('secondWeaponSec', t); },
    fleetSlot(t) { once('fleetSlotSec', t); },
    firstResonance(t) { once('firstResonanceSec', t); },
    hullTier(t) { m.hullTierTimes.push(round1(t)); },
    framePick(t) { once('framePickSec', t); },
    bossStart(t, id) { if (m.bossStartSec == null) { m.bossStartSec = round1(t); m.bossId = id ?? null; } },
    bossEnd(t) {
      if (m.bossEndSec == null && m.bossStartSec != null) {
        m.bossEndSec = round1(t);
        m.bossTtkSec = round1(m.bossEndSec - m.bossStartSec);
      }
    },
    /** 무기별 피해 누적. weaponId = 'vulcan'|'laser'|'homing'. */
    weaponDamage(weaponId, amount) {
      if (!weaponId || !(amount > 0)) return;
      m.damageByWeapon[weaponId] = (m.damageByWeapon[weaponId] || 0) + amount;
    },
    /** 공명별 피해 누적 (원래 두 무기 통계와 구분, §5.4). */
    resonanceDamage(resonanceId, amount) {
      if (!resonanceId || !(amount > 0)) return;
      m.damageByResonance[resonanceId] = (m.damageByResonance[resonanceId] || 0) + amount;
    },
    hullDamage(amount) { if (amount > 0) m.hullDamageTaken = round1(m.hullDamageTaken + amount); },
    hullRepair() { m.hullRepairs += 1; },
    cruiserLoss(n = 1) { m.cruiserLosses += n; },
    emergencyRebuild() { m.emergencyRebuilds += 1; },
    gameOver(reason, t) { if (m.gameOverReason == null) { m.gameOverReason = reason; if (t != null) m.durationSec = round1(t); } },
    fpsSample(fps) { if (fps > 0 && Number.isFinite(fps)) m._fps.push(fps); },
    setDuration(t) { m.durationSec = round1(t); },

    /** 공명 기여도 비율(총 피해 대비). §6.2 통과 8~30%. */
    resonanceShare() {
      const w = sum(Object.values(m.damageByWeapon));
      const r = sum(Object.values(m.damageByResonance));
      const total = w + r;
      return total > 0 ? r / total : 0;
    },

    /** 결과 계약 객체(순수 스냅샷). nowSec를 주면 durationSec 갱신. */
    snapshot(nowSec) {
      if (nowSec != null) m.durationSec = round1(nowSec);
      const { _fps, ...rest } = m;
      return {
        ...structuredCloneSafe(rest),
        fpsLowPercentile: percentile(_fps, 5),
        resonanceShare: round3(this.resonanceShare()),
      };
    },
  };
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function round1(x) { return Math.round(x * 10) / 10; }
function round3(x) { return Math.round(x * 1000) / 1000; }

/** 오름차순 p백분위(0~100). 빈 배열이면 null. */
export function percentile(samples, p) {
  if (!samples || !samples.length) return null;
  const s = [...samples].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * (s.length - 1))));
  return round1(s[idx]);
}

function structuredCloneSafe(o) {
  // 배열·객체·원시값만 담기므로 얕은 깊은복사로 충분(테스트 환경 structuredClone 의존 회피).
  return JSON.parse(JSON.stringify(o));
}
