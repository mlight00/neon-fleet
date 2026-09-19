// rush3/project.js — 원근 투영(r3.20 · 실게임 구현계획 §4-6 "원근 투영 — 규칙이 아니라 그리기다"). 순수 함수, DOM 없음.
//  규칙 계층은 트랙 좌표(x, z)만 쓰고 화면은 렌더가 만든다(계약서 §1). 종전 변환 `y = LINE_Y − (z − run.z)` 한 줄을
//  여기의 project(x, d) 로 바꾼다 — 충돌·사거리·게이트 칸 x 범위는 트랙 좌표 그대로다. d = z − run.z(부대 기준선 앞 거리).
//
//  식(이사 소감 2026-09-19 "확대 모드는 캐릭터는 잘 보이는데 앞이 안 보여 답답하다 — 라스트워는 적의 생동감도 내 캐릭터 변화도 다 잘 보였다"):
//   배율   s(d) = near / (1 + d / D)                         부대 줄(d 0)은 near 배, 멀수록 작아진다
//   화면 y y(d) = LINE_Y − near·D·ln(1 + d / D)              배율의 적분 — 물체 간 간격이 배율과 같이 줄어 자연스럽다
//   화면 x x'   = 240 + (x − 240)·s(d)                        가운데로 모인다(도로가 사다리꼴)
//   D    = depth / (near / far − 1)                          far = 화면 위 끝(d = depth)에서의 배율에서 역산
//  뒤쪽(d < 0, 부대 뒤 대형·시체)은 같은 식으로 확장하되 s 상한 sMax(1.9). 상한에 닿은 뒤로는 y 도 그 배율로 직선(적분 일관).
//  평면(flat: near === far)은 종전 변환과 항등 — 검사·캡처 대조용(개발 주소 ?flat=1).
import { BAL3 } from './balance.js';

const LINE_Y = BAL3.view.LINE_Y, CX = BAL3.road.center;

//  세 모드(셸 토글 '가까이 ○/●' + 개발용 flat). depth 700 = 화면 위 끝 근처(y ≈ −50~−60)까지가 종전과 비슷한 앞 거리
export const PERSPECTIVE = Object.freeze({
  standard: Object.freeze({ near: 1.45, far: 0.72, depth: 700 }),
  close:    Object.freeze({ near: 1.8,  far: 0.6,  depth: 700 }),
  flat:     Object.freeze({ near: 1,    far: 1,    depth: 700 }),
  sMax: 1.9,
  //  가독성 하한(01 §11 "멀리 있는 물체도 선택에 필요한 큰 실루엣·숫자"): 게이트 값·통 내구·표지 글 최소 15px, 게이트 칸 높이 최소 18px
  minFont: 15, minGateH: 18,
});

export function makeProjector({ near, far, depth, sMax = PERSPECTIVE.sMax, lineY = LINE_Y, cx = CX } = PERSPECTIVE.standard) {
  const flat = near === far;
  const D = flat ? Infinity : depth / (near / far - 1);
  //  s 상한이 걸리는 d(뒤쪽): near / (1 + dCap / D) = sMax → dCap = D·(near / sMax − 1). 그 뒤로 y 는 sMax 기울기의 직선
  const dCap = flat ? -Infinity : D * (near / sMax - 1);
  const yCap = flat ? Infinity : lineY - near * D * Math.log(1 + dCap / D);
  const s = (d) => {
    if (flat) return near;
    if (d <= dCap) return sMax;
    return near / (1 + d / D);
  };
  const y = (d) => {
    if (flat) return lineY - d;
    if (d <= dCap) return yCap + sMax * (dCap - d);
    return lineY - near * D * Math.log(1 + d / D);
  };
  //  y 의 역함수(배경 조각·화면 아래 끝의 d 계산용)
  const dOf = (sy) => {
    if (flat) return lineY - sy;
    if (sy >= yCap) return dCap - (sy - yCap) / sMax;
    return D * (Math.exp((lineY - sy) / (near * D)) - 1);
  };
  const project = (x, d) => {
    const k = s(d);
    return { x: cx + (x - cx) * k, y: y(d), s: k };
  };
  //  부대 줄(d 0, s = near)의 역투영: 화면 x → 트랙 x. 마우스 절대 위치(pointerX)가 쓴다
  const unproject = (sx, d = 0) => cx + (sx - cx) / s(d);
  return Object.freeze({ near, far, depth, D, flat, sMax, lineY, cx, s, y, dOf, project, unproject });
}

//  모드별 인스턴스(한 번만 만든다). 렌더(그리기)와 셸(연출 좌표·마우스 역투영)이 같은 것을 쓴다
const CACHE = {};
export function projectorFor(mode) {
  const m = PERSPECTIVE[mode] ? mode : 'standard';
  return CACHE[m] || (CACHE[m] = makeProjector(PERSPECTIVE[m]));
}

//  셸 상태 → 모드 이름. flat(개발 대조) > zoom(가까이) > 표준
export function projectorMode({ flat = false, zoom = false } = {}) {
  return flat ? 'flat' : zoom ? 'close' : 'standard';
}
