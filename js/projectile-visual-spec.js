// ── 발사체 시각 사양 — 2D 렌더(entities.js)와 3D 어댑터(chase3d-shot-spec.js)의 **단일 진실** ──
//  §G-22 §8.2. 이전에는 `chase3d-shot-spec.js` 가 2D 수식을 **복사**해 두어, entities.js 쪽이 바뀌면
//  조용히 어긋났다(Codex 지적 L). 이제 양쪽이 이 모듈을 import 한다 — 값이 한 곳에만 있다.
//
//  ⚠️ 이 모듈은 **그리는 크기·색만** 담는다. 데미지·속도·관통·발사 간격 같은 밸런스는 balance.js 소관이다.
//   beamW 만 예외적으로 여기 있는데, 그 값이 판정에 전혀 쓰이지 않고(충돌 반경은 BAL.bullet.radius)
//   오로지 빔 굵기를 정하는 표현값이기 때문이다.
import { COLORS } from './render.js';

/** 진화색이 없을 때 2D 가 실제로 쓰는 기본색. */
export const PROJ_COLOR = {
  tracer: COLORS.ally,   // 호위 드론 예광탄 — 진화색을 쓰지 않는다(항상 아군 청록)
  laser: '#a8f0ff',      // Bullet.drawLaser 기본색
  vulcan: COLORS.ally,   // Bullet.drawVulcan 기본색
  vulcanCore: '#fffefb', // 스프라이트 위에 '덮어쓰기'로 항상 그리는 백열 심
  ebullet: '#ff7a5a',    // 적탄 기본색
};

// ── 발칸 ──
/** 발칸탄 스프라이트 렌더 배율(레벨별). Bullet.draw 의 `sc`. */
export function vulcanArtScale(lv) { return 0.38 + lv * 0.07; }
/** 발칸탄 스프라이트의 긴 변(논리px). sprites.js SPRITE_SIZES.PROJ_VULCAN_BASE 와 같아야 한다. */
export const VULCAN_SPRITE_LONG_PX = 32;
/** 백열 심 — 탄 폭에 **비례**하는 가로폭(클램프)과, 탄두 쪽에 국한된 세로 구간.
 *
 * §G-24. 이전에는 고정 2.8px × 세로 92% 였는데, 발칸탄은 화면에서 폭 3~8px 로 그려진다(실측:
 * lv1 base 6.4px · needle 1.1px). 즉 심이 탄의 40~100% 를 덮어 스프라이트 그림이 보이지 않고
 * 어떤 진화든 '흰 막대'로 렌더됐다. 심의 목적은 탄 위치를 잃지 않게 하는 백열점이지 탄 자체가 아니다.
 * 폭을 탄 폭 비례로, 세로를 탄두 부근으로 좁혀 심은 남기고 그림·진화색이 드러나게 한다.
 */
export const VULCAN_CORE = {
  wRel: 0.24,    // 탄의 화면 폭 대비 심 폭
  wMin: 0.9,     // 아주 가는 니들에서도 최소 이만큼(위치 식별 보장)
  wMax: 2.8,     // 옛 고정폭이 상한 — 굵은 폭풍탄에서도 그림을 덮지 않는다
  hRel: 0.30,    // 탄 길이 대비 심 길이
  yRel: -0.10,   // 심 중심의 세로 위치(음수=탄두 쪽). 팁의 진화색은 심 위에 남는다
};
/** 탄의 화면 폭(px)에 대한 실제 심 폭. 2D·테스트가 같은 식을 쓴다. */
export function vulcanCoreWidth(screenW) {
  return Math.min(VULCAN_CORE.wMax, Math.max(VULCAN_CORE.wMin, screenW * VULCAN_CORE.wRel));
}

// ── 레이저 ──
/** 레이저 스프라이트 렌더 배율(레벨별). Bullet.draw 의 `sc`. */
export function laserArtScale(lv) { return 0.58 + lv * 0.08; }
/** 레이저 볼트 길이(논리px). Bullet.drawLaser 의 `L`. */
export function laserBoltLength(lv) { return 34 + lv * 8; }
/** 레이저 화면 폭(논리px) = beamW*2. 스프라이트 경로도 이 값 아래로는 가로를 늘려 보정한다. */
export function laserScreenWidth(beamW) { return beamW * 2; }
/** 기함 레이저의 beamW(레벨별) — entities.js Squad 발사부와 공유. 표현값(판정 무관). */
export function squadLaserBeamW(level) { return 3 + level * 1.5; }
/** 레이저 기준 beamW = lv1. 3D 굵기 배율의 기준점. */
export const LASER_BEAMW_REF = squadLaserBeamW(1);   // 4.5

// ── 호위 드론 예광탄 ──
/** 2D 가 그리는 예광탄 상자(논리px). Bullet.draw 의 `fillRect(x-1, y-5, 2, 8)`. */
export const TRACER_BOX = { w: 2, h: 8 };
/** 예광탄 / 기함 발칸 lv1 의 길이비 — 3D 크기 위계의 근거. */
export const TRACER_LEN_REL = TRACER_BOX.h / (VULCAN_SPRITE_LONG_PX * vulcanArtScale(1));

export default {
  PROJ_COLOR, vulcanArtScale, VULCAN_SPRITE_LONG_PX, VULCAN_CORE, vulcanCoreWidth,
  laserArtScale, laserBoltLength, laserScreenWidth, squadLaserBeamW, LASER_BEAMW_REF,
  TRACER_BOX, TRACER_LEN_REL,
};
