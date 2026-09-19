// rush3/project.js — 원근 투영(r3.20 · 실게임 구현계획 §4-6 "원근 투영 — 규칙이 아니라 그리기다"). 순수 함수, DOM 없음.
//  규칙 계층은 트랙 좌표(x, z)만 쓰고 화면은 렌더가 만든다(계약서 §1). 종전 변환 `y = LINE_Y − (z − run.z)` 한 줄을
//  여기의 project(x, d) 로 바꾼다 — 충돌·사거리·게이트 칸 x 범위는 트랙 좌표 그대로다. d = z − run.z(부대 기준선 앞 거리).
//
//  식(이사 소감 2026-09-19 "확대 모드는 캐릭터는 잘 보이는데 앞이 안 보여 답답하다 — 라스트워는 적의 생동감도 내 캐릭터 변화도 다 잘 보였다"):
//   앞쪽(d ≥ 0)
//   배율   s(d) = near / (1 + d / D)                         부대 줄(d 0)은 near 배, 멀수록 작아진다
//   화면 y y(d) = LINE_Y − near·D·ln(1 + d / D)              배율의 적분 — 물체 간 간격이 배율과 같이 줄어 자연스럽다
//   화면 x x'   = 240 + (x − 240)·s(d)                        가운데로 모인다(도로가 사다리꼴)
//   D    = depth / (near / far − 1)                          far = 화면 위 끝(d = depth)에서의 배율에서 역산
//   뒤쪽(d < 0, 부대 뒤 대형·시체·지나간 게이트) — 수정 라운드 2(2026-09-20)
//   배율   s(d) = near                                       부대 줄 배율 고정(자라지 않는다)
//   화면 y y(d) = LINE_Y − d                                 기울기 1 = 평면 간격. 뒷줄이 평면과 같은 자리에 머문다
//   처음(라운드 0·1)엔 앞쪽 식을 d < 0 으로 이어 쓰고 s 상한(1.9 → 1.5)만 두었는데, y 가 배율의 적분이라 near > 1 인 한 뒷줄 간격이 near 배 이상이 되어
//   뒷줄 병사 밑변이 화면(H 800)을 넘는 최소 인원이 표준 59명·가까이 40명(평면 143명)이었다 — 무입력 봇도 8스테이지부터 닿는 보통 상황.
//   그래서 뒤쪽은 배율만 near 로 키우고 간격은 평면 그대로 둔다: 150명 뒷줄(dy 159)이 평면과 같은 y 799 에 머물고 앞줄만 커진다.
//   d = 0 에서 y 기울기가 near(앞) → 1(뒤)로 꺾이지만 부대 줄 자체(s = near, y = LINE_Y)는 이어진다.
//  평면(flat: near === far)은 종전 변환과 항등 — 검사·캡처 대조용(개발 주소 ?flat=1).
import { BAL3 } from './balance.js';

const LINE_Y = BAL3.view.LINE_Y, CX = BAL3.road.center;

//  세 모드(셸 토글 '가까이 ○/●' + 개발용 flat). depth 700 = 화면 위 끝 근처(y ≈ −50~−60)까지가 종전과 비슷한 앞 거리
export const PERSPECTIVE = Object.freeze({
  standard: Object.freeze({ near: 1.45, far: 0.72, depth: 700 }),
  close:    Object.freeze({ near: 1.8,  far: 0.6,  depth: 700 }),
  flat:     Object.freeze({ near: 1,    far: 1,    depth: 700 }),
  //  가독성 하한(01 §11 "멀리 있는 물체도 선택에 필요한 큰 실루엣·숫자"): 게이트 값·통 내구·표지 글 최소 15px, 게이트 칸 높이 최소 18px
  minFont: 15, minGateH: 18,
});

export function makeProjector({ near, far, depth, lineY = LINE_Y, cx = CX } = PERSPECTIVE.standard) {
  const flat = near === far;
  const D = flat ? Infinity : depth / (near / far - 1);
  //  뒤쪽(d < 0)은 배율 near 고정·기울기 1 직선(위 머리말). flat 은 near = 1 이라 두 갈래가 같은 식이다
  const s = (d) => (flat || d < 0) ? near : near / (1 + d / D);
  const y = (d) => (flat || d < 0) ? lineY - d : lineY - near * D * Math.log(1 + d / D);
  //  y 의 역함수(배경 조각·화면 아래 끝의 d 계산용). 부대 줄 아래(sy > lineY)는 뒤쪽 = 평면 간격
  const dOf = (sy) => (flat || sy > lineY) ? lineY - sy : D * (Math.exp((lineY - sy) / (near * D)) - 1);
  const project = (x, d) => {
    const k = s(d);
    return { x: cx + (x - cx) * k, y: y(d), s: k };
  };
  //  부대 줄(d 0, s = near)의 역투영: 화면 x → 트랙 x. 마우스 절대 위치(pointerX)와 터치·펜 드래그(검수 반영 2026-09-20 — 선형이라
  //   이동량도 1/near 로 줄어 손가락과 부대가 1:1 로 붙는다)가 쓴다
  const unproject = (sx, d = 0) => cx + (sx - cx) / s(d);
  return Object.freeze({ near, far, depth, D, flat, lineY, cx, s, y, dOf, project, unproject });
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
