// 런 디렉터 (전면개편 §5.1/5.2). 시간 기반 사건을 관리한다.
// 순수 로직 — UI·적 생성·세이브·렌더를 넣지 않는다. 호출부가 dt와 paused를 넘기면
// 이번 틱에 발화한 사건 목록을 돌려준다. 일시정지·선택 화면 동안 런 시간이 흐르지 않는다.

/**
 * 8분 타임라인 스케줄을 cfg(BAL.gate1.timeline)로부터 만든다.
 * 명시 사건 + 반복 행동 변화(30~50초 간격, 75초 이상 공백 없음).
 */
function buildSchedule(cfg) {
  const s = [];
  // 반복 행동 변화 프롬프트: firstBehaviorUpgrade부터 behaviorInterval 간격, 보스 전까지.
  let n = 0;
  for (let t = cfg.firstBehaviorUpgrade; t < cfg.bossStart; t += cfg.behaviorInterval) {
    s.push({ key: `behavior:${n++}`, type: 'behaviorUpgrade', t });
  }
  // 명시 사건(§5.1).
  s.push({ key: 'secondWeapon', type: 'secondWeapon', t: cfg.secondWeapon });
  s.push({ key: 'hullTier1', type: 'hullTier', t: cfg.hullTier1 });
  s.push({ key: 'resonanceTelegraph', type: 'resonanceTelegraph', t: cfg.resonanceTelegraph });
  s.push({ key: 'firstResonance', type: 'firstResonance', t: cfg.firstResonance });
  s.push({ key: 'framePick', type: 'framePick', t: cfg.framePick });
  s.push({ key: 'eliteWave', type: 'eliteWave', t: cfg.eliteWave });
  s.push({ key: 'bossStart', type: 'bossStart', t: cfg.bossStart });
  s.push({ key: 'result', type: 'result', t: cfg.resultAt });
  s.sort((a, b) => a.t - b.t || (a.type === 'behaviorUpgrade' ? -1 : 1));
  return s;
}

/**
 * 디렉터 생성. schedule을 넘기지 않으면 Gate 1 8분 스케줄(buildSchedule)을 쓴다.
 *  Gate 2(25분)는 campaign25가 만든 스케줄을 그대로 넘긴다 — tick/next/elapsed는 스케줄 형식만 맞으면 범용 동작.
 */
export function createRunDirector(cfg, schedule) {
  return {
    cfg,
    t: 0,
    schedule: schedule || buildSchedule(cfg),
    firedKeys: new Set(),
  };
}

/**
 * 한 프레임 진행(§5.2). paused면 시간 정지. 이번 틱에 시각을 지난 미발화 사건을 발화.
 * 반환: { t, events: [{ type, key, t }] }.
 */
export function tickDirector(dir, dt, paused = false) {
  const events = [];
  if (!paused && dt > 0) {
    dir.t += dt;
    for (const ev of dir.schedule) {
      if (ev.t <= dir.t && !dir.firedKeys.has(ev.key)) {
        dir.firedKeys.add(ev.key);
        events.push({ ...ev, t: dir.t });   // 스케줄 사건의 부가 필드(region·boss·tier·choice 등)까지 전달
      }
    }
  }
  return { t: dir.t, events };
}

/** 경과 시간(초). */
export function elapsed(dir) { return dir.t; }

/** 다음 미발화 사건(HUD 카운트다운용). 없으면 null. */
export function nextEvent(dir) {
  let best = null;
  for (const ev of dir.schedule) {
    if (!dir.firedKeys.has(ev.key) && (!best || ev.t < best.t)) best = ev;
  }
  return best ? { type: best.type, t: best.t, inSec: Math.max(0, best.t - dir.t) } : null;
}

/** 다음 행동 변화까지 남은 시간(초). 없으면 null. */
export function timeToNextBehavior(dir) {
  const next = dir.schedule.find((e) => e.type === 'behaviorUpgrade' && !dir.firedKeys.has(e.key));
  return next ? Math.max(0, next.t - dir.t) : null;
}

/** 8분 결과 시점 도달 여부. */
export function isRunComplete(dir) {
  return dir.firedKeys.has('result');
}

/** 행동 변화 사건 시각 목록(측정·검증용). */
export function behaviorUpgradeSchedule(dir) {
  return dir.schedule.filter((e) => e.type === 'behaviorUpgrade').map((e) => e.t);
}
