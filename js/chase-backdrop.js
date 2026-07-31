// js/chase-backdrop.js — 함미 추적 시점의 "전진 워프" 배경(이사: "배경이 위에서 아래로 내려와서 앞으로 가는 3D 효과가 없다").
//  소실점(화면 상단 수렴점)에서 별이 방사형으로 뻗어 나와 다가오는 표준 우주 전진 연출.
//  ⚠️ 순수 화면 연출 — 게임 규칙·좌표·충돌·스폰 무관. 결정적(시드 고정, Math.random 미사용)·프레임 중 할당 없음(고정 테이블).

const N = 110;
// 별 테이블: [angle(rad), phase0(0~1), speedMul, tint(0|1)] — 모듈 로드 시 1회 생성(mulberry32 시드 11).
const STARS = new Float64Array(N * 4);
{
  let s = 11 >>> 0;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < N; i++) {
    STARS[i * 4] = rnd() * Math.PI * 2;          // 방위각(균일) — 화면 밖 방향은 그리기에서 자연 클리핑
    STARS[i * 4 + 1] = rnd();                     // 위상(별마다 다른 출발 깊이)
    STARS[i * 4 + 2] = 0.55 + rnd() * 0.9;        // 속도 배율(층 깊이감)
    STARS[i * 4 + 3] = rnd() < 0.3 ? 1 : 0;       // 30% 시안 틴트
  }
}

const fract = (v) => v - Math.floor(v);

/** 별 i 의 상태(테스트용 순수 함수). travel = 전진 누적량(스크롤 비례).
 *  r01: 0(소실점) → 1(화면 밖) 순환. rr = r01^2.2 — 멀리서 느리고 가까울수록 가속(원근 감각). */
export function warpStar(i, travel) {
  const a = STARS[i * 4], p0 = STARS[i * 4 + 1], sp = STARS[i * 4 + 2];
  const r01 = fract(p0 + travel * sp);
  const rr = Math.pow(r01, 2.2);
  return { r01, rr, dirX: Math.cos(a), dirY: Math.sin(a), speed: sp, tint: STARS[i * 4 + 3] };
}

export const WARP_STAR_COUNT = N;

/** 워프 별 필드를 그린다. o: { W, H, cx, cy(소실점), blend(0~1), travel }.
 *  blend 비례로 페이드 인 — 전술(블렌드 0)에서는 아무것도 그리지 않는다. */
export function drawWarpField(ctx, o) {
  const b = o.blend;
  if (!(b > 0.01)) return;
  const RX = o.W * 0.85, RY = o.H * 0.95;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < N; i++) {
    const st = warpStar(i, o.travel);
    const rr = st.rr;
    if (rr < 0.004) continue;                        // 소실점 정중앙(점 크기 0 부근) 생략
    const x1 = o.cx + st.dirX * rr * RX, y1 = o.cy + st.dirY * rr * RY;
    if (x1 < -20 || x1 > o.W + 20 || y1 < -20 || y1 > o.H + 20) continue;
    const rPrev = Math.pow(Math.max(0, st.r01 - 0.045), 2.2);   // 스트릭 꼬리(소실점 쪽)
    const x0 = o.cx + st.dirX * rPrev * RX, y0 = o.cy + st.dirY * rPrev * RY;
    ctx.globalAlpha = b * (0.10 + 0.72 * st.r01);
    ctx.strokeStyle = st.tint ? 'rgba(140,230,255,0.9)' : 'rgba(225,238,255,0.9)';
    ctx.lineWidth = 0.6 + 2.4 * rr;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
