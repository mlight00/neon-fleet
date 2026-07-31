// ── 소품(탄·픽업) 3D 순수 상수 — 의존 0 소형 모듈 ──
//  Codex 재검토 P2: main 이 소품 상수를 쓰려고 chase3d-props.js(→aurora-geometry 38.9KB 체인)를
//  기본 URL 에서까지 정적 로드하던 문제를 끊는다. 지오메트리 팩토리는 chase3d-props.js 에 남고
//  renderer(플래그 뒤 동적 로드)만 그것을 import 한다.

export const PROP_KEYS = ['pbullet', 'ebullet', 'missile', 'crystal', 'coin', 'pow', 'pod', 'capsule'];

/** 소품 기본색(2D 팔레트 계승). 탄은 개체 color 가 있으면 그 색이 우선(instanceColor). */
export const PROP_BASE_COLOR = {
  pbullet: 0xffd34d, ebullet: 0xff7a5a, missile: 0xffb15c,
  crystal: 0x7fe8ff, coin: 0xffc93c, pow: 0xffe066, pod: 0x6fe0c8, capsule: 0x9fd4ff,
};

/** 실전 인스턴스 상한(종별) — 수가 많은 탄은 넉넉히, 픽업은 소량. */
export const PROP_CAPS = { pbullet: 96, ebullet: 96, missile: 24, crystal: 12, coin: 48, pow: 8, pod: 8, capsule: 8 };
