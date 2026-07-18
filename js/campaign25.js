// Gate 2 (전면개편 §7): 25분 6지역 시간 기반 캠페인 — 순수 오케스트레이션.
// core-loop.js가 8분 하네스에 한 역할을 25분 실전 캠페인에 한다: "시각에 따라 어느 지역이고, 디렉터 사건이
// 오면 무엇을 하는지"의 순수 결정 로직만 담아 테스트 가능하게 한다. 실제 스폰·전투·렌더는 main.js가 소유한다.
// 보스 순서는 기존 캠페인과 동일(B8·B9·B10·B11·B22·B7) — 시간축으로 재구성한 것.

/** 시각 t(초)에 해당하는 지역 객체. 아직 출격(intro) 중이면 null. 마지막 지역 이후엔 마지막 지역. */
export function regionAt(cfg, t) {
  let cur = null;
  for (const r of cfg.regions) { if (t >= r.startSec) cur = r; }
  return cur;
}

/** 지역 index(1~6) → 지역 정의. 없으면 null. */
export function regionByIndex(cfg, i) {
  return cfg.regions.find((r) => r.i === i) || null;
}

/** 지역 index(1~6) → 그 지역 보스 id. */
export function regionBossId(cfg, i) {
  const r = regionByIndex(cfg, i);
  return r ? r.boss : null;
}

/** 지역의 끝 시각(초) = 다음 지역 진입 시각, 마지막 지역은 totalSec. */
export function regionEndSec(cfg, i) {
  const idx = cfg.regions.findIndex((r) => r.i === i);
  if (idx < 0) return cfg.totalSec;
  const next = cfg.regions[idx + 1];
  return next ? next.startSec : cfg.totalSec;
}

/**
 * 25분 캠페인 전체 사건 스케줄(정렬). run-director의 스케줄 형식({key,type,t,...})과 호환 —
 *  createRunDirector(cfg, buildCampaign25Schedule(cfg))로 넘긴다.
 * 지역 진입·지역별 보스·함체 승급·무기/공명/프레임/함대슬롯/Apex·경로 선택·행동 변화·결과를 모두 시각에 배치.
 */
export function buildCampaign25Schedule(cfg) {
  const s = [];
  for (const r of cfg.regions) {
    s.push({ key: `region:${r.i}`, type: 'regionEnter', t: r.startSec, region: r.i });
    s.push({ key: `boss:${r.i}`, type: 'bossStart', t: r.bossSec, region: r.i, boss: r.boss });
  }
  for (const h of cfg.hullTiers) s.push({ key: `hull:${h.tier}`, type: 'hullTier', t: h.at, tier: h.tier });
  s.push({ key: 'secondWeapon', type: 'secondWeapon', t: cfg.secondWeaponSec });
  s.push({ key: 'fleetTelegraph', type: 'fleetTelegraph', t: cfg.fleetTelegraphSec });
  s.push({ key: 'fleetSlot', type: 'fleetSlot', t: cfg.fleetSlotSec });
  s.push({ key: 'firstResonance', type: 'firstResonance', t: cfg.firstResonanceSec });
  s.push({ key: 'secondResonance', type: 'secondResonance', t: cfg.secondResonanceSec });
  s.push({ key: 'framePick', type: 'framePick', t: cfg.framePickSec });
  s.push({ key: 'finalWeaponEvo', type: 'finalWeaponEvo', t: cfg.finalWeaponEvoSec });
  s.push({ key: 'apex', type: 'apex', t: cfg.apexSec });
  cfg.pathChoiceSec.forEach((t, i) => s.push({ key: `path:${i}`, type: 'pathChoice', t, choice: i }));
  let n = 0;
  for (let t = cfg.introSec + cfg.behaviorInterval; t < cfg.resultSec; t += cfg.behaviorInterval) {
    s.push({ key: `behavior:${n++}`, type: 'behaviorUpgrade', t });
  }
  s.push({ key: 'result', type: 'result', t: cfg.resultSec });
  s.sort((a, b) => a.t - b.t || (a.type === 'behaviorUpgrade' ? -1 : 1));
  return s;
}

/**
 * 캠페인 사건 → 실행 행동 매핑(순수). core-loop.eventAction의 25분판 — Gate 2 신규 사건을 추가로 해석한다.
 * 반환 kind: 'regionEnter'|'bossStart'|'hullTier'|'equipWing'|'fleetSlot'|'fleetTelegraph'|'resonanceReady'
 *  |'secondResonance'|'framePick'|'finalWeaponEvo'|'apex'|'pathChoice'|'behavior'|'result'. 없으면 null.
 */
export function eventAction25(evtType) {
  switch (evtType) {
    case 'regionEnter': return { kind: 'regionEnter' };
    case 'bossStart': return { kind: 'bossStart' };
    case 'hullTier': return { kind: 'hullTier' };
    case 'secondWeapon': return { kind: 'equipWing' };
    case 'fleetSlot': return { kind: 'fleetSlot' };
    case 'fleetTelegraph': return { kind: 'fleetTelegraph' };
    case 'firstResonance': return { kind: 'resonanceReady' };
    case 'secondResonance': return { kind: 'secondResonance' };
    case 'framePick': return { kind: 'framePick' };
    case 'finalWeaponEvo': return { kind: 'finalWeaponEvo' };
    case 'apex': return { kind: 'apex' };
    case 'pathChoice': return { kind: 'pathChoice' };
    case 'behaviorUpgrade': return { kind: 'behavior' };
    case 'result': return { kind: 'result' };
    default: return null;
  }
}

/** 25분 힘 성장 목표(§1.3): t분에서 기대 배율(대략). 측정 검증용 곡선. */
export function expectedPowerMult(cfg, t) {
  const min = t / 60;
  if (min <= 1) return 1;
  if (min >= 25) return 200;
  // 1→25분 사이 로그성장(1배→200배). 측정 시 실제 곡선이 단조증가인지 확인하는 기준.
  return Math.round(Math.pow(200, (min - 1) / 24) * 10) / 10;
}
