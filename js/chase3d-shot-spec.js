// ── 발사체 2D 시각 사양 → 3D 표시 사양 **어댑터**(§G-21 §6.2 / §G-22 §8.2) ──
//  수치의 출처는 `projectile-visual-spec.js` 하나뿐이다. 2D 렌더(entities.js)도 같은 모듈을 읽으므로
//  한쪽만 바뀌어 조용히 어긋나는 일이 없다(G21 에서는 이 파일이 2D 수식을 복사해 두어 그 위험이 있었다 — Codex L).
//  여기서 추가로 하는 일은 **3D 전용 원근 압축**뿐이다: 중립 사양을 입력으로 받아 3D 배율로 바꾼다.
//  게임 밸런스 값(데미지·속도·관통·발사 간격)은 읽지도 바꾸지도 않는다.
import {
  PROJ_COLOR, vulcanArtScale, laserBoltLength, LASER_BEAMW_REF, TRACER_LEN_REL,
} from './projectile-visual-spec.js';

const _hexCache = new Map();
/** '#rrggbb' → int(순수·캐시). 알 수 없는 값이면 fallback. */
export function hexToInt(hex, fallback) {
  if (typeof hex !== 'string' || !hex) return fallback;
  let v = _hexCache.get(hex);
  if (v === undefined) { v = parseInt(hex.replace('#', ''), 16); if (!Number.isFinite(v)) v = fallback; _hexCache.set(hex, v); }
  return v;
}

/** 중립 사양의 색(문자열)을 3D instanceColor 용 int 로 굳힌 표. */
export const SHOT_COLOR = {
  tracer: hexToInt(PROJ_COLOR.tracer, 0x3ff5e0),
  vulcan: hexToInt(PROJ_COLOR.vulcan, 0x3ff5e0),
  vulcanCore: hexToInt(PROJ_COLOR.vulcanCore, 0xfffefb),
  laser: hexToInt(PROJ_COLOR.laser, 0xa8f0ff),
  ebullet: hexToInt(PROJ_COLOR.ebullet, 0xff7a5a),
  missile: 0xffffff,   // 유도탄은 실모델 원색(텍스처) — 틴트하지 않는다
};

/** 발칸 lv1 기준 배율(= lengthMul 1.0 의 정의). */
export const VULCAN_SCALE_REF = vulcanArtScale(1);
/** 레이저 lv1 기준 길이. */
export const LASER_LEN_REF = laserBoltLength(1);
export { LASER_BEAMW_REF, TRACER_LEN_REL };

/** 굵기 배율 상한(§G-22 §8.3). 근거는 docs 완료보고서 §레이저 폭 참조 —
 *  2D 비(최대 3.83배)를 그대로 쓰면 §G-18 에서 이사가 반려한 "기함을 덮는 흰 기둥" 폭으로 돌아간다.
 *  √압축 + 이 상한이면 가장 굵은 절단탄의 월드 폭이 반려 폭(1.70 unit)의 63% 에 머문다. */
export const WIDTH_MUL_MAX = 2.0;

/** 재사용 가능한 빈 사양 객체(프레임 중 할당 금지 — 호출부가 1개 만들어 계속 덮어쓴다). */
export function makeShotSpec() {
  return { key: '', kind: '', owner: '', lv: 1, beamW: 0, cutter: false, lengthMul: 1, widthMul: 1, color: 0xffffff, coreColor: -1, core: 0 };
}

/**
 * 탄 하나의 3D 표시 사양을 out 에 채운다(순수·무할당).
 *  @param key 'pbullet' | 'laser' | 'missile' | 'ebullet'
 *  @param b   2D Bullet(읽기 전용)
 *  @param out makeShotSpec() 결과(재사용)
 */
export function shotSpec(key, b, out) {
  const lv = Math.max(1, (b && b.lv) | 0 || 1);
  const sizeScale = (b && Number.isFinite(b.scale) && b.scale > 0) ? b.scale : 1;   // 니들 진화 축소
  out.key = key; out.lv = lv; out.beamW = 0; out.cutter = false;
  out.widthMul = 1; out.coreColor = -1; out.core = 0;
  if (key === 'missile') {
    out.kind = 'missile'; out.owner = 'flagship';
    out.lengthMul = sizeScale;
    out.color = SHOT_COLOR.missile;
    return out;
  }
  if (key === 'ebullet') {
    out.kind = 'ebullet'; out.owner = 'enemy';
    out.lengthMul = sizeScale;
    out.color = hexToInt(b && b.color, SHOT_COLOR.ebullet);
    return out;
  }
  if (key === 'laser') {
    const beamW = (b && Number.isFinite(b.beamW) && b.beamW > 0) ? b.beamW : LASER_BEAMW_REF;
    out.kind = 'laser'; out.owner = 'flagship';
    out.beamW = beamW; out.cutter = !!(b && b.cutter);
    out.lengthMul = (laserBoltLength(lv) / LASER_LEN_REF) * sizeScale;
    //  순서 보존 + 절대폭 압축: lv1 1.00 / lv3 1.29 / 절단탄 1.96(상한 2.0)
    out.widthMul = Math.min(WIDTH_MUL_MAX, Math.max(1, Math.sqrt(beamW / LASER_BEAMW_REF)));
    out.color = hexToInt(b && b.color, SHOT_COLOR.laser);
    return out;
  }
  // pbullet — 기함 발칸 / 호위 드론 예광탄
  if (b && b.kind === 'tracer') {
    out.kind = 'tracer'; out.owner = 'escort';
    out.lengthMul = TRACER_LEN_REL * sizeScale;   // 2D 와 같은 위계: 기함 발칸보다 확실히 작다
    out.color = SHOT_COLOR.tracer;                // 2D 예광탄은 진화색을 쓰지 않는다
    out.coreColor = -1; out.core = 0;             // §G-22 §6: 2D 예광탄에는 백열 심이 없다 — 3D 도 없어야 한다
    return out;
  }
  out.kind = 'vulcan'; out.owner = 'flagship';
  out.lengthMul = (vulcanArtScale(lv) / VULCAN_SCALE_REF) * sizeScale;
  //  외곽 = 진화색(2D 는 진화 스프라이트가 이 색을 갖는다), 코어 = 백열 — 3D 도 2겹으로 같은 그림.
  out.color = hexToInt(b && b.color, SHOT_COLOR.vulcan);
  out.coreColor = SHOT_COLOR.vulcanCore;
  out.core = 1;
  return out;
}

export default { shotSpec, makeShotSpec, hexToInt, SHOT_COLOR };
