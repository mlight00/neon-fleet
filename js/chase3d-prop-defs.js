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
  b19: { cap: 8, len: 105, max: 210, glb: 'assets/3d/b19_model.glb', rotX: 0, rotY: Math.PI },   // 방패병 — §G-5 실모델
  b20: { cap: 4, len: 105, max: 210, glb: 'assets/3d/b20_model.glb', rotX: 0, rotY: Math.PI },   // 부화 모함 — §G-5 실모델
  b21: { cap: 8, len: 100, max: 200, glb: 'assets/3d/b21_model.glb', rotX: 0, rotY: Math.PI },   // 블링커 — §G-5 실모델
  //  보스 6종(§G-6): 대형 단일 개체(cap 1). len = 2D sizes(380/340)×1.09.
  b7: { cap: 1, len: 414, max: 830, glb: 'assets/3d/b7_model.glb', rotX: 0, rotY: Math.PI },     // 하이브 퀸(최종)
  b22: { cap: 1, len: 414, max: 830, glb: 'assets/3d/b22_model.glb', rotX: 0, rotY: Math.PI },   // 네온 아비터(최종)
  b8: { cap: 1, len: 371, max: 750, glb: 'assets/3d/b8_model.glb', rotX: 0, rotY: Math.PI },
  b9: { cap: 1, len: 371, max: 750, glb: 'assets/3d/b9_model.glb', rotX: 0, rotY: Math.PI },
  b10: { cap: 1, len: 371, max: 750, glb: 'assets/3d/b10_model.glb', rotX: 0, rotY: Math.PI },
  b11: { cap: 1, len: 371, max: 750, glb: 'assets/3d/b11_model.glb', rotX: 0, rotY: Math.PI },
  //  §G-16 위험물 4종(이사 "삼각형·원형으로 남은 적들과 운석, 제대로된 이미지화"): 이 넷만 아트가 아예 없어
  //  2D 도형 폴백으로 남아 있었다(운석은 C4 스프라이트 파일 자체가 없다). 모델을 넣으면 즉시 뜬다 —
  //  GLB 가 없으면 스웜이 비고(swarmReady=false) main 이 수집을 건너뛰어 기존 2D 가 그대로 나온다(사라지지 않는다).
  h1: { cap: 8, len: 100, max: 200, glb: 'assets/3d/h1_model.glb', rotX: 0, rotY: Math.PI },   // 운석(Meteor) — 파괴 가능
  h2: { cap: 8, len: 92, max: 184, glb: 'assets/3d/h2_model.glb', rotX: 0, rotY: Math.PI },    // 잔해(Debris) — 파괴 불가
  h3: { cap: 8, len: 105, max: 210, glb: 'assets/3d/h3_model.glb', rotX: 0, rotY: Math.PI },   // 돌격기(Charger)
  h4: { cap: 8, len: 96, max: 192, glb: 'assets/3d/h4_model.glb', rotX: 0, rotY: Math.PI },    // 기뢰(Mine)
};

/** §G-6 아군 실모델(드론·순양함) — 노즈 +z(소실점) 계약, 'direct' 배치. 회전은 실측 보정.
 *  rotY π = 이사 실기 지적(드론 위아래 반전 — 노즈가 화면 아래를 향함) 교정: 기수만 180° 돌리고
 *  갑판은 그대로 카메라(+y) 쪽 유지. rotX 부호 반전은 배 밑면이 보이게 되므로 금지(실측). */
export const ALLY3D = {
  a1: { cap: 60, glb: 'assets/3d/a1_model.glb', rotX: -Math.PI / 2, rotY: Math.PI },   // 드론
  a2: { cap: 10, glb: 'assets/3d/a2_model.glb', rotX: -Math.PI / 2, rotY: Math.PI },   // 순양함
};

/** §G-7 픽업 실모델(이사 VARCO) — 'spin'(y 자전) 배치라 세운 그대로 두고 회전 보정은 실측만.
 *  cap 은 PROP_CAPS 와 동일해야 한다(placeSwarm 상한·InstancedMesh 용량이 이 값). capsule 은
 *  현행 규칙에서 스폰되지 않는 레거시라 제외(순수 조형 유지). 로드 실패 시 조형 폴백. */
export const PICKUP3D = {
  crystal: { cap: 12, glb: 'assets/3d/p1_model.glb' },
  pod:     { cap: 8,  glb: 'assets/3d/p2_model.glb' },
  coin:    { cap: 48, glb: 'assets/3d/p3_model.glb' },
  pow:     { cap: 8,  glb: 'assets/3d/p4_model.glb' },
};

/** §G-12 기함 무기 실모델(이사 VARCO) — 포탑 3종은 갑판 장착점에, 미사일은 발사체로, 포구는 기수에.
 *  포신·노즈는 +z(소실점=전방)를 향해야 한다. rotY 는 검사실 진열(chase3dLab=weapons) 30°/6° 스윕
 *  캡처로 확정한 실측값이다 — 바운딩박스는 앞뒤를 못 가린다(§G-8 교훈).
 *   w1 발칸: 포구 다발이 -z → π.   w2 레이저: 포신이 비축(대각) → -π/4(315°에서 포구가 카메라 정면).
 *   w3 유도: 3×3 발사관이 이미 +z → 0.   w4 미사일: 노즈 -z(0°는 노즐·핀) → π.   w5 포구: 금색 조리개가 +z → 0. */
export const WEAPON3D = {
  //  §G-23 발칸 재설계(이사 지적 "발칸은 데미지가 낮아도 빠르게 많이 쏟아내는 무기인데 2D·3D 다 그 느낌이 아니다"):
  //   w1 파일 내용을 **w1r(6열 회전총열 미니건)** 으로 교체했다. 경로·배선은 그대로라 회전 규약도 π 유지에서 출발한다.
  //   원본은 assets/3d/w1r_50k.glb(이사 VARCO), 구 단발포는 w1_50k.glb 로 남아 있어 되돌릴 수 있다.
  vulcan: { cap: 5, glb: 'assets/3d/w1_model.glb', rotY: Math.PI },        // W1 발칸 포탑(w1r 재설계본)
  laser:  { cap: 5, glb: 'assets/3d/w2_model.glb', rotY: -Math.PI / 4 },   // W2 레이저 포탑
  homing: { cap: 5, glb: 'assets/3d/w3_model.glb', rotY: 0 },              // W3 유도 발사대
  missile:{ cap: 24, glb: 'assets/3d/w4_model.glb', rotY: Math.PI },       // W4 유도 미사일 탄체(발사체 — PROP_CAPS.missile 과 동일)
  muzzle: { cap: 1, glb: 'assets/3d/w5_model.glb', rotY: 0 },              // W5 차지 포구(기수 고정)
  //  §G-23 V1 발칸 예광탄 실모델(이사 VARCO). 기존 절차 방추(청록 조각)를 대체한다 —
  //   실측 바운딩박스의 최대축이 Z(길이 ≈ 폭의 5.5배)라 게임 규약(노즈 −z)과 축이 이미 맞는다 → rotY 0 에서 출발.
  //   ⚠️앞뒤(노즈가 +z 인지 −z 인지)는 바운딩박스로 못 가린다 — 실기에서 뒤집혀 보이면 π 를 더한다(§G-8 교훈).
  round:  { cap: PROP_CAPS.pbullet, glb: 'assets/3d/v1_model.glb', rotY: 0 },
};

/** 갑판 장착점(정규화) — ships.js 의 NORMALIZED_MOUNTS 사본. 2D 스프라이트와 같은 자리에 3D 포탑을 세운다.
 *  x=폭 비율(+우), y=길이 비율(−가 전방) — 3D 에서는 z = −y × 모델 길이로 환산한다.
 *  ⚠️ships.js 가 바뀌면 여기도 같이 바꿀 것(테스트 W3D-05 가 두 표의 일치를 잠근다). */
//  §G-48: 2D 신규 아트에 맞춰 갱신. ⚠️`ships.js` 의 NORMALIZED_MOUNTS 와 **값이 같아야 한다**
//   (HW-15 가 강제한다 — 2D 와 3D 가 같은 자리에 무기를 달아야 시점을 바꿔도 안 어긋난다).
export const MOUNT_POINTS = [
  [[0, -0.369]],                                                                      // T0 EMBER — 기수 1문
  [[-0.277, -0.027], [0.277, -0.027]],                                                // T1 FLARE — 날개 1쌍
  [[-0.302, -0.043], [0.302, -0.043], [0, -0.386]],                                   // T2 ARCLIGHT
  [[-0.31, -0.049], [0.31, -0.049], [-0.253, -0.169], [0.253, -0.169]],               // T3 AURORA — 2쌍
  [[-0.261, -0.033], [0.261, -0.033], [-0.181, -0.153], [0.181, -0.153], [0, -0.392]],  // T4 ZENITH
  [[-0.29, -0.09], [0.29, -0.09], [-0.174, -0.21], [0.174, -0.21], [0, -0.371]],      // T5 QUASAR
];

/** §G-43 기함 추진 분사구(정규화 `[x, y, len]`) — 2D `drawFlames` 와 **같은 자리**에 3D 제트를 낸다.
 *
 *  이사님 제보(2026-08-13): "2D 에서는 함미에 추진 불꽃이 보이는데 함미모드에서는 분사구 제트가 전혀 안 보인다."
 *  실제로 3D 기함에는 추진 연출이 아예 없었다 — 2D `ships.js drawFlames()` 만 있었다.
 *
 *  값은 `ships.js` `SHIP_DEFS_RAW[t].nozzles` 를 그 등급의 `w`·`h` 로 나눈 것이다(MOUNT_POINTS 와 같은 방식).
 *  ⚠️2D 는 `+y` 가 함미다. 3D 배치에서 `z = -y * sz * S` 로 뒤집으면 선미(−z)에 놓인다.
 *  ⚠️`len` 은 2D 화염 길이를 세로 크기로 나눈 값 — 3D 플룸 기본 길이의 기준이다.
 */
//  §G-48: 게임이 실제로 쓰는 `ships.js` SHIP_DEFS[t].nozzles 를 (visualWidth, visualSize) 로 나눈 값.
//  ⚠️2D 와 3D 가 다른 자리에서 불을 뿜으면 시점을 바꿀 때 어긋난다 — G43-NOZZLE-MATCHES-2D 가 강제한다.
//  ⚠️T0~T3 은 분사구가 **1개**다(예전엔 2개). 개수를 안 맞추면 없는 자리에서 불이 난다.
export const NOZZLE_POINTS = [
  [[0, 0.215, 0.147]],                                                    // t0 EMBER
  [[0, 0.248, 0.126]],                                                    // t1 FLARE
  [[0, 0.279, 0.112]],                                                    // t2 ARCLIGHT
  [[0, 0.285, 0.101]],                                                    // t3 AURORA
  [[-0.105, 0.291, 0.091], [0, 0.291, 0.091], [0.105, 0.291, 0.091]],     // t4 ZENITH
  [[-0.113, 0.328, 0.082], [0, 0.328, 0.082], [0.113, 0.328, 0.082]],     // t5 QUASAR
];

/** §G-13 발사체 3D 상시(이사 "발사체가 포물선을 그리며 날아간다 — 무기를 집어 던지는 느낌 / 3D 모두 적용").
 *  ⚠️곡선의 원인은 배치 방식이다. 다른 개체는 2.5D 투영의 화면좌표를 역투영해 3D 에 놓는데(화면 정합),
 *   그 2.5D 투영은 ①매 프레임 기함의 현재 x 를 기준으로 모든 개체를 다시 놓고 ②깊이를 depth^2 로 압축한다.
 *   그래서 이동하며 쏜 탄 줄기가 화면에서 활처럼 휘고, 이미 날아간 탄까지 옆으로 미끄러진다.
 *  ⚠️위 가설은 실측으로 **폐기**됐다(§G-13 16점 최소제곱 잔차 0px — 2.5D 투영은 직선을 휘게 하지 않는다).
 *   진짜 원인은 2D 가 탄 스프라이트를 **회전 없이** 그린 것이다(chase-render.js drawProjected 는 translate+scale 만 한다).
 *  → 최종 계약(§G-13/§G-20, chase3d-renderer.js placeShots): 값을 각각 옳은 출처에서 가져온다.
 *   ①화면 위치 = 2.5D 투영 화면좌표(sx/sy)의 역투영 — 적·기함·픽업이 모두 이 좌표계에 정합돼 있다.
 *     발사체만 월드로 따로 놓으면 가로 퍼짐이 1.5배가 돼(실측 396px vs 270px) 탄이 적을 빗나가 보인다.
 *   ②깊이·자세 = 월드 — 깊이는 탄이 기함보다 앞선 거리로 주고, 진행각(yaw)으로 실제 회전시킨다. */
export const SHOT_KEYS = ['pbullet', 'ebullet', 'missile', 'laser'];
/** 발사체 3D **기준** 전장(unit). 기함 전장 4.78 기준. 실제 전장 = 이 값 × 종류별 lengthMul(chase3d-shot-spec).
 *  §G-15 이사 실기 교정: 레이저는 "2D 처럼 길게 뻗는 광선"이어야 하는데 짧고 통통해 풍선처럼 보였다 →
 *  전장을 크게 키웠다가(3.4) 굵기 과교정과 겹쳐 기함을 덮어 §G-18 에서 1.70 으로 되돌렸다. 유도탄은 "너무 작다" → 0.86 → 1.5. */
//  §G-30 레이저 전장(이사 "레이저도 직선으로 나가고 있네 — 소실점으로 향해야 하지 않아?"):
//   3D 레이저의 **방향은 이미 소실점을 향한다**(월드 +z, 원근 투영이 자동으로 소실점으로 모은다 — 실측 확인).
//   문제는 길이였다. 화면 전장이 2D(42~74px)의 절반도 안 돼 "점"으로 보였고, 그래서 기울기가 읽히지 않았다.
//   → 전장 1.70 → **2.10**(원거리 화면 전장 26 → 52px, 2D `laserBoltLength` 42~74 대역).
//  ⚠️**전장을 키우면 폭도 같이 커진다** — `shotScale` 의 폭 = `전장 × SHOT_W`.
//   처음에 3.20 으로 올렸다가 폭이 1.88배가 되어 §G-18 의 "흰 기둥이 기함을 덮는" 문제가 재발했고 테스트가 잡았다.
//   그래서 `SHOT_W.laser` 를 0.32 → **0.259** 로 낮춰 **월드 폭 곱 0.5439** 를 유지했다(이전 1.70×0.32 = 0.544 와 동일).
export const SHOT_LEN = { pbullet: 0.62, ebullet: 0.50, missile: 1.50, laser: 2.10 };
/** 전장 대비 가로·두께 **기준** 배율. 1=원형 비율 유지, <1=가늘게(광선).
 *  실제 굵기 = 이 값 × widthMul(chase3d-shot-spec — 레이저는 beamW·레벨·절단탄에 따라 1.00~2.00 배).
 *  ⚠️레이저 재교정(이사 "함미모드?" — 기함이 안 보임): 전장 3.4·굵기 0.5 는 폭이 1.7 unit(=월드 28px)이라
 *  2D 빔 굵기(beamW 4~9px)의 4배였다. 연사로 겹치면 기함 위에 흰 기둥이 쌓여 함선을 통째로 가린다.
 *  §G-20 재조정(이사 "함미모드에서 레이저가 안 보인다"): 0.17(월드 4.8px)은 너무 얇았다.
 *  2D 는 빔 굵기를 `max(MIN_SCREEN_PX, beamW*2*scale)` 로 그려 추적 배율에서 화면 16~27px 이 된다.
 *  → 0.32(월드 ≈9px = beamW*2 대역)로 올린다. §G-18 의 28px(기함을 덮던 값)의 1/3 이다. */
//  ⚠️§G-30 최종값: 폭 = **전장 × 이 값**(shotScale `out.x = len * wRel * ...`).
//   전장 2.10 × 0.259 = **0.5439** — 개편 전(1.70 × 0.32 = 0.544)과 같은 굵기다.
//   전장을 다시 만질 일이 생기면 **이 곱을 유지**하도록 이 값도 함께 조정해야 한다.
export const SHOT_W = { pbullet: 1.0, ebullet: 1.0, missile: 1.0, laser: 0.259 };
/** 화면 최소 전장(논리px)의 **기준값**. 2D 는 KIND_SCALE.minRel 로 탄이 아주 작아지지 않게 막는데, 3D 는 진짜 원근이라
 *  그 바닥이 없어 중간에서 사라지는 것처럼 보였다(이사) → 같은 성격의 하한을 3D 에도 준다.
 *  종류별 실효 하한 = 이 값 × lengthMul — 그래야 원거리에서도 예광탄 < 발칸 위계가 유지된다(§G-21 §6.3). */
export const SHOT_MIN_PX = { pbullet: 16, ebullet: 15, missile: 22, laser: 52 };   // §G-30 레이저: 2D laserBoltLength(lv1~5)=42~74px 대역
/** 발사체 고도 — 기수 집속 코어(y 0.35)와 같은 평면대에 둬 "포구에서 나간다"로 읽히게. */
export const SHOT_Y = 0.30;

/** §G-8 기함 실모델(이사 승인 "B 로 하자") — 등급(squad.tier 0~5)별 스왑. 회전=아군 함선 규약.
 *  T0 EMBER·T1 FLARE 는 드론·순양함과 같은 원화라 a1/a2 모델 재사용(이사 합의). 로드 전·실패 시
 *  절차 AURORA 폴백(포털 빌드=GLB 제외라 자동 폴백). 전장은 renderer 의 FLAG_LEN 이 통일. */
//  ⚠️회전은 GLB 원본 자세에 따라 다르다(실측 필수 — 바운딩박스 최대축으로 판별):
//   a1/a2 = y 최대(서 있음) → rotX -π/2 로 눕힌다. t2/t4/t5 = z 최대(이미 누움) → rotX 금지(적용하면 세워져 5m 벽이 됨).
//   a0 = x 최대(넓적) → rotX -π/2 로 갑판을 위로.
export const FLAG3D = {
  0: { glb: 'assets/3d/a1_model.glb', rotX: -Math.PI / 2, rotY: Math.PI },   // EMBER (드론 원화 — 서 있는 원본)
  1: { glb: 'assets/3d/a2_model.glb', rotX: -Math.PI / 2, rotY: Math.PI },   // FLARE (순양함 원화 — 서 있는 원본)
  2: { glb: 'assets/3d/t2_model.glb', rotY: Math.PI },                       // ARCLIGHT (누운 원본)
  3: { glb: 'assets/3d/a0_model.glb', rotX: -Math.PI / 2, rotY: Math.PI },   // AURORA (A/B 의 B)
  4: { glb: 'assets/3d/t4_model.glb', rotY: Math.PI },                       // ZENITH (누운 원본)
  5: { glb: 'assets/3d/t5_model.glb', rotY: Math.PI },                       // QUASAR (누운 원본)
};
