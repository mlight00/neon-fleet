// ── Neon Fleet 실제 3D 함미 추적 (Phase 0) — 기능 플래그·품질·성능·용량 상수 ──
//  작업지시서 §3.2 / §5 / §7 / §9 / §10. 이 모듈은 순수 상수·판정만 담는다(Three.js 미의존).
//  게임 규칙·밸런스·좌표(worldX/worldY)는 절대 건드리지 않는다. 여기 값은 "보는 방식"에만 쓰인다.

/** 3D 를 기본 OFF 로 두는 측정·개발 하네스(§G-21 §3.1). 이 경로들은 "기존 기준과 같은 비용"으로 돌아야 한다 —
 *  Prolific 측정·코어루프 자동측정·25분 캠페인 측정·함대/보스 프리뷰. 3D 를 원하면 `?chase3d=1` 을 명시한다.
 *  값이 아니라 키 존재로 판정하는 이유: 게임 자신이 `_clParams.has(...)` 로 이 모드들을 켜기 때문에
 *  `?fleetlab`(값 없음)도 하네스로 동작한다 — 판정 기준을 게임과 어긋나게 두면 그 URL 만 3D 가 켜진다. */
export const HARNESS_KEYS = ['coreLoopMeasure', 'campaign25', 'fleetlab', 'bosslab'];

/** 함미 3D 사용 여부(순수 판정). 우선순위는 아래 순서로 고정한다.
 *   1. `?chase3d=0` — 모든 경로에서 강제 OFF(어떤 조합보다 우선).
 *   2. `?chase3d=1` — 일반 게임·개발/측정 경로 모두에서 명시적 ON.
 *   3. 파라미터 없음 + 일반 포털 게임 — ON(§G-19).
 *   4. 파라미터 없음 + 측정/개발 하네스(HARNESS_KEYS, playtest=prolific) — OFF.
 *  §G-19 배경: 배포판(포털)은 index.html 을 쿼리 없이 열기 때문에 `?chase3d=1` 이 붙을 수 없어 3D 가 한 번도
 *  켜지지 않았다(GLB 20MB 를 넣고도 2D 로만 돌았다 — 이사 "배포본이 이상해"). 그래서 기본을 ON 으로 뒤집었는데,
 *  그 뒤집기가 측정 하네스까지 3D 비용을 지우는 부작용을 낳았다(Codex P0). 4번이 그 부작용만 되돌린다. */
export function chase3dEnabled(search = '') {
  try {
    const p = new URLSearchParams(search);
    const v = p.get('chase3d');
    if (v === '0') return false;
    if (v === '1') return true;
    if (p.get('playtest') === 'prolific') return false;
    for (const k of HARNESS_KEYS) if (p.has(k)) return false;
    return true;
  } catch { return true; }
}
/** 결정적 검증 장면(개발 오버레이 포함) 플래그. **chase3d=1 을 명시**해야 열린다(기본 ON 과 무관 — 개발 전용). */
export function chase3dTestEnabled(search = '') {
  try { const p = new URLSearchParams(search); return p.get('chase3d') === '1' && p.get('chase3dTest') === '1'; } catch { return false; }
}
/** 모델 검사실(Opus5 §8). **chase3d=1 을 명시**해야 열린다 — 기본 URL 에선 절대 빈 문자열(기본 ON 과 무관). */
export function chase3dLabTarget(search = '') {
  try { const p = new URLSearchParams(search); return p.get('chase3d') === '1' ? (p.get('chase3dLab') || '') : ''; } catch { return ''; }
}
/** 소품(탄·픽업) 3D — 개발/A-B 전용 플래그. 이사 실기 "엉망" + Codex "가독성 A/B 통과 전 2D 유지" 판정으로
 *  기본 OFF(기존 2D 스트릭·스프라이트). chase3d=1 과 함께 chase3dProps=1 일 때만 켠다. */
// ── 전환 계약(§7). 기존 2.5D chaseBlend와 같은 구간을 쓴다: 1.6~2.0에서 smoothstep. ──
export const CHASE3D = {
  START_ZOOM: 1.60,   // 이 아래(100~160%)는 WebGL 휴면(§7 · §9.4)
  FULL_ZOOM: 2.00,    // 이 위(200~220%)는 실제 3D 완전 표시
  DORMANT_BELOW: 1.60,
};
/** 3D 자원(동적 import·GLB)을 읽기 시작하는 **줌 목표**(§G-22 §4.1).
 *  줌 정착 단계는 100/150/200/220 네 칸뿐이고 150% 는 3D 를 전혀 표시하지 않는 독립 사용 모드다.
 *  G21 은 경계를 1.50 에 두어 **150% 로만 노는 플레이어에게도 GLB 20MB 를 지웠다**(Codex P0).
 *  그래서 "사용자가 200%(또는 220%)를 요청한 순간"으로 옮긴다 — 목표 배율을 보므로 보간이 진행되는
 *  동안(=아직 3D 가 안 보이는 동안) 로드를 끝낼 여유가 생긴다. */
export const INIT_ZOOM = CHASE3D.FULL_ZOOM;
/** 이 줌 **목표**에서 3D 초기화를 시작해야 하는가(순수 판정). 현재 배율이 아니라 목표를 본다. */
export function shouldInit3D(zoomTarget) { return zoomTarget >= INIT_ZOOM - 1e-6; }

/** 3D 자원을 **유휴 시간에 미리** 받아둘 것인가 — §G-34 후속 A안(이사님 선택 2026-08-11).
 *
 *  왜 필요한가: `INIT_ZOOM` 은 3D 가 **보이기 시작하는 배율과 같다**(둘 다 2.00).
 *  줌 단계가 100/150/200/220 으로 점프하므로 "요청한 순간 로드 시작"의 실제 여유는 줌 애니메이션
 *  수백 ms 뿐이고, 그 사이에 GLB 20MB 를 받아 파싱·GPU 업로드까지 끝낼 수 없다.
 *  → 첫 전환에서 **2D 기함이 보이다가 3D 로 바뀐다**(이사님 실기 지적).
 *
 *  그래서 "확대를 한 번이라도 누른" 시점(100% 초과)에 **유휴 콜백**으로 미리 받아둔다.
 *  ⚠️100% 로만 노는 플레이어는 여전히 아무것도 받지 않는다 — 예전 G21 이 150% 전용 플레이어에게
 *   20MB 를 지웠던 문제(Codex P0)의 취지는 그대로 지킨다. 확대를 누른 사람은 곧 200% 로 갈 가능성이 높다.
 *  ⚠️유휴 시간에만 돈다. 게임 진행을 방해하지 않는 것이 이 방식의 전제다. */
export function shouldPrefetch3D(zoomTarget) { return zoomTarget > 1 + 1e-6; }

/** 전환 t: 100~160% → 0, 160~200% → smoothstep, 200~220% → 1 (§7). */
export function transitionT(zoom) {
  const raw = Math.min(1, Math.max(0, (zoom - CHASE3D.START_ZOOM) / (CHASE3D.FULL_ZOOM - CHASE3D.START_ZOOM)));
  return raw * raw * (3 - 2 * raw);
}
/** WebGL 렌더 루프를 돌려야 하는가(§9.4: 160% 미만 휴면). */
export function shouldRender3D(zoom) { return zoom >= CHASE3D.DORMANT_BELOW - 1e-6; }

// ── 품질·성능 상수(§9.3 픽셀비율, §4.3 폴리곤 상한, §9.5 안전 하한) ──
export const QUALITY = {
  PIXEL_RATIO_DESKTOP: 1.5,   // 데스크톱 WebGL 내부 해상도 상한(§9.3)
  PIXEL_RATIO_MOBILE: 1.0,    // 모바일 상한
  MOBILE_MAX_W: 820,          // 이 이하 폭 = 모바일로 간주(픽셀비율·안전 하한 강화)
  SAFE_MIN_FPS_DESKTOP: 45,   // 지속적으로 이 아래면 품질 강등/휴면 고려
  SAFE_MIN_FPS_MOBILE: 30,    // §16 중단조건: 모바일 지속 30fps 미만 = 실패
  TRI_BUDGET: { flagship: 15000, boss: 20000, enemy: 3000, drone: 1000 },  // §4.3 상한(목표 아님)
  ADD_BYTES_BUDGET: 3.0 * 1024 * 1024,   // §10 새 3D 자산 압축 전 3.0MB 이하
};

/** 이 프레임에 3D 레이어를 구동할 수 있는가(순수 판정 — main.draw() 와 테스트가 같은 함수를 쓴다).
 *  §G-15: flythrough 는 2D 기함이 화면 위로 빠져나가는 연출인데 3D 기함은 카메라에 고정돼 제자리에 남는다 →
 *   두 척으로 보인다(이사 "섹터 종료 시 날아가는 2D 기함과 3D 기함이 모두 보임"). cutscene 은 전체화면 연출(로직 정지).
 *   둘 다 2D 전용이라 3D 레이어를 통째로 내린다. bossDeath 는 전투 연출이라 3D 를 유지한다(카메라·좌표가 그대로다).
 *  false 면 main 은 t3d=0 으로 두고 #game3d 를 숨긴다 → 기함은 항상 정확히 한 쪽에서만 그려진다. */
export function chase3dFrameGate(state, phase, hasRun, hasCtl, zoomTarget) {
  if (!hasCtl || !hasRun || state !== 'play') return false;
  //  §G-22 §4.2: 준비가 끝난 뒤에도 사용자가 200% 미만을 요청한 상태면 3D 를 그리지 않는다.
  //   (전환 t 로도 걸러지지만, "무엇이 3D 를 켜는가"를 한 곳에 명시해 두어야 나중에 어긋나지 않는다.)
  if (!(zoomTarget >= INIT_ZOOM - 1e-6)) return false;
  return phase !== 'flythrough' && phase !== 'cutscene';
}

/** 기함이 이번 프레임에 어느 레이어에 그려지는가 — 'none3d'(2D 가 그린다) | '3d'.
 *  t=0.5 하드 컷(§G-16): 겹침 0·공백 0. 두 레이어의 합은 항상 정확히 1이어야 한다. */
export function flagshipLayer(gateOpen, t3d) { return gateOpen && t3d >= 0.5 ? '3d' : '2d'; }

/** 성능 프로필(§G-22 §5.1) — **renderer 픽셀비율·LOD 와 FPS 가드가 반드시 같은 결과를 쓴다.**
 *  G21 은 픽셀비율이 폭 820px 기준, LOD·FPS 하한이 "세로 && 폭 ≤500px" 기준이라 서로 다른 기기 판정을 했다.
 *  기준을 renderer 가 이미 쓰던 `QUALITY.MOBILE_MAX_W`(820px) 하나로 통일한다. UA 문자열은 보지 않는다.
 *  높이는 판정에 쓰지 않는다 — 세로/가로 조건을 더하면 다시 두 기준이 갈라진다(그게 원래 결함이었다).
 *
 *  **고정 정책**: 프로필은 **세션 시작 시 한 번** 계산해 renderer 와 가드가 같은 객체를 쓴다.
 *  리사이즈·화면 회전으로 품질 등급이 중간에 바뀌면 픽셀비율이 요동치고, 이미 누적된 FPS 표본의
 *  기준선이 달라져 판정이 뒤섞인다. 등급 변경이 필요하면 새로고침(새 세션)이 경계다. */
export function performanceProfileForViewport(width, height) {
  const mobile = width <= QUALITY.MOBILE_MAX_W;
  return {
    mobile,
    pixelRatioCap: mobile ? QUALITY.PIXEL_RATIO_MOBILE : QUALITY.PIXEL_RATIO_DESKTOP,
    minFps: mobile ? QUALITY.SAFE_MIN_FPS_MOBILE : QUALITY.SAFE_MIN_FPS_DESKTOP,
    lod: mobile ? 1 : 0,
    viewport: { w: width, h: height },
  };
}

/**
 * §G-45 — 프레임이 모자랄 때 **끄기 전에 낮춘다**(이사 결정 2026-08-14).
 *
 *  ## 왜 만들었나
 *  전에는 지속 저FPS 한 번이면 `chase3d` 를 통째로 버리고 `_c3dPhase=4` 로 잠갔다.
 *  그 판이 끝날 때까지 3D 가 돌아오지 않는다 — 전투가 끝나 프레임이 회복돼도 그대로다.
 *  이사님 실기(스테이지 3 부근): 기함이 2D 로 굳어 다시는 3D 가 되지 않았다. 원인은
 *  `reason:'low-fps'` 로 확정됐다.
 *
 *  ## 사다리
 *  픽셀비율을 먼저 내리고(가장 싸고 티가 덜 난다), 그 다음 LOD 를 낮춘다.
 *      데스크톱 1.5 → 1.0 → 0.85+LOD1 → 0.7 → (더 없음 = 2D)
 *      모바일   1.0(LOD1) → 0.7 → (더 없음 = 2D)
 *  단조 감소라 재측정이 유한하게 끝난다 — 진동하지 않는다.
 *
 *  ⚠️`minFps`·`mobile` 은 건드리지 않는다. 판정 기준까지 같이 내리면 사다리가 무의미해진다.
 *
 *  @param profile 현재 프로필
 *  @returns 한 칸 낮춘 새 프로필. **더 낮출 것이 없으면 null**(호출자가 2D 로 내린다).
 */
export function degradeProfile(profile) {
  if (!profile) return null;
  const px = +profile.pixelRatioCap || 0;
  const lod = profile.lod | 0;
  const step = (profile.qualityStep | 0) + 1;
  if (px > 1.0)  return { ...profile, pixelRatioCap: 1.0,  lod,    qualityStep: step };
  if (lod < 1)   return { ...profile, pixelRatioCap: 0.85, lod: 1, qualityStep: step };
  if (px > 0.7)  return { ...profile, pixelRatioCap: 0.7,  lod: 1, qualityStep: step };
  return null;   // 바닥 — 여기서도 못 버티면 3D 를 접는다
}

/** 저성능 폴백 감시기(§G-21 §5.2 · §G-22 §5.3). 순수 로직 — 시간·표본을 주입받아 판정만 한다.
 *  계약:
 *   · 3D 가 실제로 보이는 정상 구간의 프레임만 센다(sampling=false 면 진행 중인 창을 버린다).
 *   · warm-up(기본 2초)이 지난 뒤부터 창(기본 3초)을 채워 평균 FPS 를 낸다.
 *   · 기준 미달 창이 연속 strikes(기본 2)회면 tripped — 세션 동안 되돌리지 않는다(2D↔3D 진동 방지 latch).
 *   · 배열을 만들지 않는다(누적값만) — 프레임 무할당 계약.
 *
 *  ⚠️**긴 프레임을 dt 값만 보고 버리지 않는다.** G21 은 `dt > 500ms` 를 전부 탭 정지로 간주해 버렸는데,
 *   그러면 **화면이 보이는 채로 1~2fps 로 기어가는 진짜 저성능**(프레임 간격 500~1000ms)이 영원히
 *   트립되지 않았다 — 가드가 가장 필요한 상황을 정확히 놓친 것이다(Codex P0).
 *   탭 비활성·복귀 같은 "중단"은 호출부가 visibilitychange 로 감지해 interrupted=true 로 알려준다.
 *   긴 프레임 하나는 창을 즉시 닫아 strike 를 1회만 만들고, 트립은 여전히 연속 2창을 요구한다. */
export function createFpsGuard(opts = {}) {
  const warmupMs = opts.warmupMs ?? 2000;
  const windowMs = opts.windowMs ?? 3000;
  const minFps = opts.minFps ?? QUALITY.SAFE_MIN_FPS_DESKTOP;
  const needStrikes = opts.strikes ?? 2;
  let activeMs = 0, winMs = 0, winFrames = 0, strikes = 0, tripped = false, lastFps = 0;
  return {
    get tripped() { return tripped; },
    get strikes() { return strikes; },
    get lastFps() { return lastFps; },
    get warmedUp() { return activeMs >= warmupMs; },
    /**
     * §G-45 — 품질을 실제로 낮춘 뒤 **다시 재기 위해** latch 를 푼다.
     *  ⚠️호출자는 반드시 품질을 먼저 내린 뒤에 부를 것. 그냥 부르면 원래 막으려던
     *   2D↔3D 진동이 되살아난다. 사다리(degradeProfile)가 단조 감소라 재측정은 유한하게 끝난다.
     *  warm-up 도 되돌린다 — 픽셀비율을 바꾼 직후 몇 프레임은 재할당 비용이라 표본이 못 된다.
     */
    reset() { activeMs = 0; winMs = 0; winFrames = 0; strikes = 0; tripped = false; },
    /**
     * 한 프레임 보고. 반환=이제부터 2D 고정인가.
     *  @param dtMs       직전 프레임과의 간격
     *  @param sampling   3D 가 실제로 보이는 정상 구간인가(연출·일시정지·드래프트·탭 비활성은 false)
     *  @param interrupted 이 프레임 직전에 중단이 있었는가(visibilitychange 등) — 창을 버리고 표본에서 뺀다
     */
    sample(dtMs, sampling, interrupted) {
      if (tripped) return true;
      if (interrupted || !sampling || !(dtMs > 0)) { winMs = 0; winFrames = 0; return false; }
      activeMs += dtMs;
      if (activeMs < warmupMs) return false;
      winMs += dtMs; winFrames++;
      if (winMs < windowMs) return false;
      lastFps = (winFrames * 1000) / winMs;
      winMs = 0; winFrames = 0;
      if (lastFps < minFps) { strikes++; if (strikes >= needStrikes) tripped = true; }
      else strikes = 0;
      return tripped;
    },
  };
}

// ── 검증 장면 개체 수(§11). 결정적이어야 하므로 난수 없이 고정 배치. ──
export const TEST_SCENE = {
  drones: 12, cruisers: 2, b1: 5, b4: 3, reaper: 1, gateLanes: 3, pickups: 1,
};


/**
 * §G-37 P1 — 기함을 3D 로 표시해도 되는가. **순수 판정**(three 의존 없음 — main 이 정적 import 한다).
 *
 *  ⚠️G36 의 main 은 `ready.flagshipBundle ? bundle(t,w) : ready.flagship(t)` 였다.
 *   나중에 bundle 이 빠지면 **조용히 선체 전용 판정으로 되돌아간다**(Codex 8차 §5).
 *   원자 게이트가 필수 계약이므로 **bundle 이 없으면 false = 2D 유지**다.
 */
export function flagshipReadyForDisplay(ready, tier, weapon) {
  if (!ready || typeof ready.flagshipBundle !== 'function') return false;
  return !!ready.flagshipBundle(tier, weapon);
}

export default { chase3dEnabled, flagshipReadyForDisplay, chase3dTestEnabled, CHASE3D, transitionT, shouldRender3D, shouldInit3D, shouldPrefetch3D, INIT_ZOOM, QUALITY, TEST_SCENE, createFpsGuard, performanceProfileForViewport, chase3dFrameGate, flagshipLayer };

/**
 * §G-38 — **날아오는 오브젝트 전체**의 3D 시각 중심 보정(월드 유닛, 아래로).
 *
 *  이사님 제보(2026-08-12): "적이 기함보다 위에 떠 있는 느낌" → 이어서
 *  "날아오는 모든 오브젝트 위치를 다 동일하게 맞춰줘. 크리스탈, 보급선, 운석, 등등".
 *
 *  ## 왜 떠 보였나 (실측)
 *  같은 배치점(화면 y=664)에 놓고 렌더 알파 경계를 쟀다:
 *      적   top 627 / bot 700 / **중심 663.5**   ← 배치점에 중심 정렬
 *      기함 top 612 / bot 745 / **중심 678.5**   ← 배치점보다 **15px 아래**
 *  기함 모델은 엔진·꼬리가 원점 아래로 뻗어 시각 중심이 낮고, 나머지는 중심 정렬이다.
 *  같은 위치인데 기함이 낮게 보이니 주변 오브젝트가 떠 있는 것으로 읽혔다.
 *
 *  ⚠️먼저 "고도(월드 y)" 를 의심해 평면 고정을 넣어 봤다 — **화면상 변화가 0** 이었다.
 *   `placeSwarm` 은 화면 위치·크기를 맞추고 고도를 **결과로** 두므로 고도만 바꾸면 보이지 않는다.
 *   원인은 고도가 아니라 **모델의 시각 중심 차이**였다.
 *
 *  ## 적용 대상 — `behindFlag` 를 쓰는 것 전부(= 기함이 지나쳐 가는 것들)
 *  · 적 12종(ENEMY3D) — **운석 h1 · 잔해 h2 포함**
 *  · 픽업(PICKUP3D) — 크리스탈 · 보급 수송선 · 코인 · POW
 *  ⚠️**발사체는 제외한다.** 아군탄은 기함 포구에서 나가고 적탄은 기함에 맞는다 —
 *   내리면 포구 정합(muzzleGapPx 0)과 명중 위치가 어긋난다. `behindFlag=false` 인 이유와 같다.
 *
 *  ⚠️화면 고정 px 가 아니라 **월드 오프셋**이다 — 원근이 자연스럽게 적용된다.
 *   화면 px 로 내리면 먼 개체까지 같은 양으로 밀려 원근이 깨진다.
 *  ⚠️**렌더 전용.** 2D 판정·충돌·스폰은 그대로다(3D 는 읽기 전용 표현 계층).
 *
 *  ## 값의 이력 — **계산이 아니라 이사님 선택이다**
 *  같은 프레임에서 잰 "기함 중심 − 오브젝트 중심"(음수 = 오브젝트가 아래):
 *
 *  | 값 | 차이 | 판정 |
 *  |---|---|---|
 *  | 0    | **+15.0** | 떠 보임 — 최초 제보 상태 |
 *  | 0.26 | +2.5      | 시각 중심 정렬(기하학적 기준선) |
 *  | 0.52 | −10.0     | 이사님 "한칸만 더" |
 *  | **0.78** | **−21.0** | **현재** — 이사님 "한 포인트 더"(2026-08-12) |
 *
 *  한 칸 ≈ 0.26 이고 기함 근처에서 화면 약 12px 씩 움직인다.
 *  ⚠️0.26 이 정렬 기준선이고 그 아래는 **연출 선택**이다. 바꾸려면 이사님 확인을 받아라.
 *  ⚠️기함에는 유휴 흔들림 애니메이션이 있어 **절대 y 는 프레임마다 ±8px 흔들린다.**
 *   비교는 반드시 **같은 프레임 안에서** 하라(위 표가 그 방식이다).
 */
export const WORLD_OBJ_VIS_DROP = 0.78;

/** @deprecated 이름만 남긴 별칭 — 적 전용이 아니게 됐다. 새 코드는 WORLD_OBJ_VIS_DROP 를 쓴다. */
export const ENEMY_VIS_DROP = WORLD_OBJ_VIS_DROP;

/**
 * §G-40 — 3D 차지 빔 폭 배수(2D 대비).
 *
 *  이사님 결정(2026-08-13): **1.0 — 전부 같은 폭으로 통일.**
 *
 *  ## 왜 2.0 이었다가 1.0 으로 돌아왔나
 *  함미모드에서 빔이 가늘게 느껴져 3D 만 2배로 넓혔다. 그런데 그러자
 *  **판정이 어느 쪽 그림과도 맞출 수 없게** 됐다 — 판정은 발사 순간 한 번 계산되고
 *  그때 2D 로 보는지 3D 로 보는지 게임은 모른다. 3D 에 맞추면 2D 가 2배 어긋나고, 반대도 마찬가지다.
 *
 *  → **배수를 없애고 기본 폭(`BAL.charge.widthShipMult`)을 키우는 쪽**을 골랐다.
 *    그러면 2D 그림 = 3D 그림 = 판정이 **한 숫자**가 된다. 어느 시점에서 보든 보이는 대로 맞는다.
 *
 *  ⚠️함미모드가 다시 가늘게 느껴지면 이 값이 아니라 `widthShipMult` 를 올려라.
 *   이 값을 1 에서 벗어나게 하는 순간 판정↔그림 일치가 깨진다.
 *   (`tests/g40-lance-width.test.mjs` 의 `G40-HIT-MATCHES-3D-DRAW` 가 그 어긋남을 잡는다.)
 */
export const LANCE_3D_WIDTH_MULT = 1.0;
