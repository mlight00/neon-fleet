// ── Neon Fleet 실제 3D 함미 추적 (Phase 0) — 기능 플래그·품질·성능·용량 상수 ──
//  작업지시서 §3.2 / §5 / §7 / §9 / §10. 이 모듈은 순수 상수·판정만 담는다(Three.js 미의존).
//  게임 규칙·밸런스·좌표(worldX/worldY)는 절대 건드리지 않는다. 여기 값은 "보는 방식"에만 쓰인다.

/** URLSearchParams 문자열(또는 location.search)에서 3D 시제품 플래그를 읽는다. */
export function chase3dEnabled(search = '') {
  try { return new URLSearchParams(search).get('chase3d') === '1'; } catch { return false; }
}
/** 결정적 검증 장면(개발 오버레이 포함) 플래그. chase3d=1 과 함께여야 의미가 있다. */
export function chase3dTestEnabled(search = '') {
  try { const p = new URLSearchParams(search); return p.get('chase3d') === '1' && p.get('chase3dTest') === '1'; } catch { return false; }
}
/** AURORA 모델 검사실(Opus5 §8). chase3d=1 필수 — 기본 URL 에선 절대 빈 문자열. */
export function chase3dLabTarget(search = '') {
  try { const p = new URLSearchParams(search); return p.get('chase3d') === '1' ? (p.get('chase3dLab') || '') : ''; } catch { return ''; }
}
/** 소품(탄·픽업) 3D — 개발/A-B 전용 플래그. 이사 실기 "엉망" + Codex "가독성 A/B 통과 전 2D 유지" 판정으로
 *  기본 OFF(기존 2D 스트릭·스프라이트). chase3d=1 과 함께 chase3dProps=1 일 때만 켠다. */
export function chase3dPropsEnabled(search = '') {
  try { const p = new URLSearchParams(search); return p.get('chase3d') === '1' && p.get('chase3dProps') === '1'; } catch { return false; }
}

// ── 전환 계약(§7). 기존 2.5D chaseBlend와 같은 구간을 쓴다: 1.6~2.0에서 smoothstep. ──
export const CHASE3D = {
  START_ZOOM: 1.60,   // 이 아래(100~160%)는 WebGL 휴면(§7 · §9.4)
  FULL_ZOOM: 2.00,    // 이 위(200~220%)는 실제 3D 완전 표시
  DORMANT_BELOW: 1.60,
};

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

// ── 검증 장면 개체 수(§11). 결정적이어야 하므로 난수 없이 고정 배치. ──
export const TEST_SCENE = {
  drones: 12, cruisers: 2, b1: 5, b4: 3, reaper: 1, gateLanes: 3, pickups: 1,
};

export default { chase3dEnabled, chase3dTestEnabled, CHASE3D, transitionT, shouldRender3D, QUALITY, TEST_SCENE };
