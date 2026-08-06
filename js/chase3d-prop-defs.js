// ── 소품(탄·픽업) 3D 순수 상수 — 의존 0 소형 모듈 ──
//  Codex 재검토 P2: main 이 소품 상수를 쓰려고 chase3d-props.js(→aurora-geometry 38.9KB 체인)를
//  기본 URL 에서까지 정적 로드하던 문제를 끊는다. 지오메트리 팩토리는 chase3d-props.js 에 남고
//  renderer(플래그 뒤 동적 로드)만 그것을 import 한다.

export const PROP_KEYS = ['pbullet', 'ebullet', 'missile', 'laser', 'crystal', 'coin', 'pow', 'pod', 'capsule'];

/** 소품 기본색(2D 팔레트 계승). 탄은 개체 color 가 있으면 그 색이 우선(instanceColor). */
export const PROP_BASE_COLOR = {
  pbullet: 0xffd34d, ebullet: 0xff7a5a, missile: 0xffb15c, laser: 0x9ff2ff,
  crystal: 0x7fe8ff, coin: 0xffc93c, pow: 0xffe066, pod: 0x6fe0c8, capsule: 0x9fd4ff,
};

/** 실전 인스턴스 상한(종별) — 수가 많은 탄은 넉넉히, 픽업은 소량. */
export const PROP_CAPS = { pbullet: 96, ebullet: 96, missile: 24, laser: 48, crystal: 12, coin: 48, pow: 8, pod: 8, capsule: 8 };

/** §G-4 적 12종 빌보드(이사 제작 Gemini 렌더) — cap=동시 표시 상한, len/max=화면 전장(논리px, 2D sizes×1.09 배율감).
 *  B1 163 은 이사 실기 보정 확정값(+30%), B2/B4/B5/B6 기존값 유지. 신규 6종=2D sizes(92~96)×1.09. */
export const ENEMY3D = {
  //  b1 = §G-5 실모델 1호(이사 VARCO 생성 GLB): rotX π/2 = 서 있는 모델(뿔 +y·노즈 -y)을 게임 축(노즈 -z)으로.
  //  pitch 는 실모델이라 실제 기울기로 작동 — 다이빙 자세 유지.
  b1: { cap: 28, len: 163, max: 325, pitch: -0.15, glb: 'assets/3d/b1_model.glb', rotX: 0, rotY: Math.PI },   // 세워서 정면 얼굴이 보이게(이사 — 눕히면 등판만 보임)
  b2: { cap: 8, len: 180, max: 360, pitch: -0.15, glb: 'assets/3d/b2_model.glb', rotX: 0, rotY: Math.PI },   // 중형 크리처 — 세움·정면(이사 확정 각)
  b3: { cap: 4, len: 200, max: 400, pitch: -0.12, glb: 'assets/3d/b3_model.glb', rotX: 0, rotY: Math.PI },   // 대형 크리처 — 세움·정면
  b4: { cap: 8, len: 105, max: 210, pitch: -0.15, glb: 'assets/3d/b4_model.glb', rotX: 0, rotY: Math.PI },   // 저격수 — 세움·정면
  b5: { cap: 8, len: 105, max: 210, glb: 'assets/3d/b5_model.glb', rotX: 0, rotY: Math.PI },   // 터렛 — 세움·정면
  b6: { cap: 8, len: 105, max: 210, glb: 'assets/3d/b6_model.glb', rotX: 0, rotY: Math.PI },   // 위버 — 세움·정면
  b16: { cap: 8, len: 100, max: 200, glb: 'assets/3d/b16_model.glb', rotX: 0, rotY: Math.PI },   // 폭격기 — §G-5 실모델
  b17: { cap: 8, len: 105, max: 210, pitch: -0.15, glb: 'assets/3d/b17_model.glb', rotX: 0, rotY: Math.PI },   // 전기 재퍼 — 세움·정면
  b18: { cap: 8, len: 100, max: 200, glb: 'assets/3d/b18_model.glb', rotX: 0, rotY: Math.PI },   // 오비터 — 세움·정면
  b19: { cap: 8, len: 105, max: 210 },   // 방패병(Shielder)
  b20: { cap: 4, len: 105, max: 210 },   // 부화 모함(BroodCarrier)
  b21: { cap: 8, len: 100, max: 200 },   // 블링커(Blinker)
};
