// rush3/balance.js — 스타포지 러시 v3 수치 단일 진실(계약서 DESIGN_v3_stage1.md 1·3·4·6장). 로직 없음.
// 기존 rush/balance.js 의 색·연출 상수는 값만 옮겼다(참조 공유 금지). 객체는 깊게 동결.

function deepFreeze(o) {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return Object.freeze(o);
}

export const BAL3 = deepFreeze({
  // 규칙 진행 단위(초). 30/60/120Hz 화면에서 같은 STEP 입력열이면 같은 결과
  STEP: 1 / 60,
  // 세계 속도: 부대 전진 px/s(보스전 중 0)
  scroll: 190,
  // 논리 화면·좌표계(1장)
  view: { w: 480, h: 800, LINE_Y: 640, dprMax: 2 },
  // 도로 폭 x 80~400(중앙 240), 시작 x 240
  road: { x0: 80, x1: 400, center: 240, startX: 240 },
  // 화면 진입: obj.z - run.z <= 760 부터 그린다(y ≥ -120)
  enterZ: 760,
  // 정리 임계: 탄 z > run.z + LINE_Y + 10(화면 위를 벗어나면 소멸 — 화면 밖 게이트·정예를 맞히지 않게), 적 z < run.z - 200
  cull: { bulletAhead: 10, enemyBehind: 200 },
  // 부대·유닛(3-5장, 4장 1단계)
  squad: {
    //  unitCap 150 → 100(r3.21, 이사 결정 2026-09-20 B안). coverDepthUnits = coverZ 비행시간 보정선(stages.MAX_DY)이 전제하는 대형 깊이의 유닛 수 —
    //   상한을 내려도 150 으로 고정한다: 실제 대형(≤100)은 더 얕아 탄이 통에 더 빨리 닿으므로 150 기준 보정선이 여전히 누출을 막고(보수적),
    //   1~3 기준 코스의 coverZ(1953·2524·3259·6094)와 기록·검사가 흔들리지 않는다. 100 기준으로 내리면 11px 씩 앞당겨진다(보고서 difficulty-b-20260920)
    unitR: 9, unitHp: 2, unitCap: 100, coverDepthUnits: 150,
    // 조향: 지수 추종 followRate, 횡이동 상한 moveMax px/s, 키 조향 keySpeed px/s
    followRate: 9, moveMax: 250, keySpeed: 420,
    // 벽 밖 대형 반폭 상한(hw'), 통로 안 여유(corridorWidth/2 - margin)
    hwMax: 60, corridorMargin: 6,
    // 벽 활성 구간 선행 여유: wall.z0 - 60 <= run.z <= wall.z1
    wallLead: 60,
    // 대형 그리기 상수(기존 값 이식)
    heroSize: 46, soldierSize: 22, ringGap: 19, ringStart: 26, unitSpacingX: 22, unitSpacingY: 18, drawCap: 130,
  },
  // 무기 3종(3-4장). gateHit 는 모든 무기 1
  weapons: {
    rifle: { id: 'rifle', rank: 1, interval: 0.5,  dmg: 1, vz: 700, w: 4, color: '#F6C84A', name: '소총', gateHit: 1 },
    auto:  { id: 'auto',  rank: 2, interval: 0.25, dmg: 1, vz: 800, w: 5, color: '#35E5FF', name: '기관총', gateHit: 1 },
    // heavy: 적 직격 시 반경 22 폭발(폭발 dmg 1, 직격 적은 3만, 벽 반대편 제외). 통·게이트·벽 명중 시 폭발 없음
    //  r3.31(이사 소감 2026-09-23 "중화기를 고르면 후반부는 모두 쉽게 클리어된다"): 발사 간격 0.6 → 0.8 · 폭발 반경 28 → 22 · 폭발 피해 2 → 1.
    //   실측(어려움 13~24, evLead, 시작 무기만 바꿈): 종전 12판 중 11승·생존 합 665·보스전 평균 6.5초로 전 무기 중 1위 →
    //   10승·471·10.8초(기관총 11승·573·9.6초 아래, 저격·전격·산탄 위). 후보 4안 스윕에서 골랐다(간격 0.9 는 8승으로 과함)
    heavy: { id: 'heavy', rank: 3, interval: 0.8,  dmg: 3, vz: 650, w: 8, color: '#FF9A4A', name: '중화기', gateHit: 1, blastR: 22, blastDmg: 1 },
    //  r3.10(2026-09-19 이사 결정 A) 신규 3종(이미지프롬프트_v5 §5). 같은 순위끼리는 교체 없음.
    //   scatter: 발사마다 fan 발을 ±spreadDeg 부채꼴로, 사거리 range px 뒤 소멸(근거리·게이트 특화 — 모든 발 gateHit 1)
    //   sniper : 관통 pierce 체(같은 적은 다시 안 맞음), dmg 3 · arc: 직격 시 chainR 안 적 chain 체에 chainDmg 연쇄(벽 너머 제외)
    //  r4.7(이사님 지시 2026-09-26 "산탄총: 이름에 맞게 총알이 산탄해서 뻗어나가도록 변경, 현재는 나뭇잎 같음"):
    //   3발 ±14°/0.55초 → **6발 ±18°(전체 36°)/1.1초**(작고 둥근 알갱이가 넓게 퍼진다). 초당 발 수는 3/0.55 = 6/1.1 ≈ 5.45 로 같다 —
    //   발 수가 두 배인 만큼 간격을 두 배로 늘려 초당 총 피해·초당 게이트 +1 을 종전과 비슷하게 둔다(Mk II·III 도 같은 간격 배수라 같은 원칙).
    //   pelletVz = 발 번호별 속도 배수(결정적 — 한 번에 쏜 알갱이가 한 줄로 서지 않고 흩뿌려진다). 사거리 420 그대로. 그림은 코드로 그리는 둥근 알갱이(render)
    scatter: { id: 'scatter', rank: 2, interval: 1.1, dmg: 1, vz: 520, w: 4, color: '#B6FF4A', name: '산탄포', gateHit: 1, fan: 6, spreadDeg: 18, range: 420,
               pelletVz: [0.94, 1.05, 0.98, 1.03, 0.92, 1.07] },
    //  r4.7(이사님 지시 2026-09-26 "저격총: 관통탄으로 이름 변경"): 화면 이름만 '관통탄'. 내부 id 'sniper'·그림 키(bullet_sniper)·저장은 그대로.
    //   적 '저격수'(shooter)는 다른 대상이라 이름을 바꾸지 않는다
    sniper:  { id: 'sniper',  rank: 3, interval: 0.9,  dmg: 3, vz: 900, w: 4, color: '#DDEBFF', name: '관통탄', gateHit: 1, pierce: 2 },
    //  stunSec(r3.31, 이사 지시 2026-09-23 "전격무기는 맞은 적들이 잠시 동안 못 움직이도록"): 직격·연쇄로 맞은 **일반 적**은 그동안 멈춘다
    //   (이동·가속·저격 예고/발사 모두 정지). 정예·아레나 보스는 제외 — 보스를 묶으면 보스전이 사라진다
    arc:     { id: 'arc',     rank: 3, interval: 0.7,  dmg: 1, vz: 750, w: 5, color: '#7F9BFF', name: '전격포', gateHit: 1, chain: 2, chainR: 90, chainDmg: 1, stunSec: 0.8 },
  },
  //  무기 강화 Mk I~III(r3.10): 같은 무기 통을 다시 먹으면 한 단계. 같은 무기 안에서 발사 간격·탄 폭·피해가 한 단계씩(그림 3단계와 1:1)
  weaponMk: Object.freeze([
    Object.freeze({ dmgAdd: 0, intervalMul: 1,    wMul: 1 }),
    Object.freeze({ dmgAdd: 0, intervalMul: 0.85, wMul: 1.25 }),
    Object.freeze({ dmgAdd: 1, intervalMul: 0.75, wMul: 1.5 }),
  ]),
  // 게이트(3-2장): 두께 24, 피격 플래시 0.12s, 색(+파랑/−빨강/0회색)
  //  armZ = 게이트 전용 사격 활성 구간(부대 중심 기준 전방 거리 px). row.z - run.z <= armZ 가 되면 셔터가 열린다.
  //  null 인 행은 항상 열림(학습용). 닫힌 셔터에 닿은 탄은 흡수되고 값은 변하지 않는다(계약서 3-2)
  gate: { h: 24, flashT: 0.12, armZ: 340, openT: 0.25, colors: { pos: '#35E5FF', neg: '#FF6A3D', zero: '#9AA1AC' } },
  // 보급 통(3-3장): 반경 30, chain 발판 = s.z + 60 + i*40, 발판 판정 |run.x - pad.x| <= 70
  //  armZ(r3.18 대항 검수 반영) = 통 피격 활성 구간(부대 중심 기준 전방 거리 px). 정의에 armZ: true 인 통은 s.z − run.z <= armZ 가 되기 전까지 탄을 흡수하고 내구가 줄지 않는다
  //   (게이트 셔터 armZ 와 같은 꼴). 440 = 화면 y 200(HUD 아래) — 화면에 **보인 뒤에 열린다**를 규칙으로 보장(차량·캡슐만 켠다, 정지 통은 종전대로 null)
  supply: { r: 30, padOffset: 60, padGap: 40, padHalfW: 70, armZ: 440 },
  // 벽(3-6장): 중앙 분리벽 기본 x 228~252
  wall: { x0: 228, x1: 252 },
  // 적 4종(3-7장). vz 는 세계 기준 부대 쪽 접근 속도(양수)
  enemies: {
    // 잡졸: 스폰한 열을 그대로 직진(2026-09-11 35→0: 추종이 조작의 의미를 흐렸다 — 비켜야 하는 위협은 돌격체, 사선 다툼은 저격수가 맡는다). 접촉 유닛 hp −1, 적 소모
    //  ⚠️vz(r3.27, 이사 지시 2026-09-23 "일반 적 하강 속도가 너무 빠르다 — 느리게 해서 쌓인 적을 쏘는 손맛"): 60 → 24.
    //   화면에서 적이 내려오는 속도 = 부대 전진(scroll 190) + 이 값이라 250 → 214(−14%)이고, 적이 화면에 머무는 시간은 그만큼 길어져
    //   앞 물결과 뒤 물결이 겹친다(= 쌓인 적). 접근이 느려진 만큼 쉬워지지 않도록 r3.22 의 지옥 지표(무손실 승리 0판)로 되잡는다
    grunt:   { hp: 2, r: 14, vz: 24, track: 0, touchDmg: 1 },
    // 돌격체: 스폰 x 직진, 가속 260/s², 최대 420. 접촉 유닛 hp −2
    //  r3.27: 처음 속도만 90 → 45(멀리서는 천천히 다가온다) — 가속·최대는 그대로라 가까이서 달려드는 위협은 유지
    //  r3.31(이사 지시 "달려나오는 자동차는 속도를 더 낮춰주자"): 가속 260 → 180 · 최대 420 → 290
    rusher:  { hp: 4, r: 18, vz: 45, accel: 180, maxVz: 290, touchDmg: 2 },
    // 저격수: 도로 고정(vz 0). 1.6s 마다 예고 0.5s 후 탄 1발(적탄 vz 260, dmg 1, r 5). 접촉 없음
    shooter: { hp: 6, r: 22, vz: 0, shootEvery: 1.6, aimTime: 0.5, shot: { vz: 260, dmg: 1, r: 5 }, touchDmg: 0 },
    // 정예: hp 는 스테이지 고정(stages.js). 스폰 z = run.z + 760, run.z + 420 까지 150/s 하강 후 좌우 60px/s 왕복
    elite:   { r: 48, spawnAhead: 760, holdAhead: 420, descendSpeed: 150, patrolSpeed: 60,
               // 1.0s 마다 부채꼴 3발(적탄 vz 230, dmg 1, 각도 ±18°)
               shootEvery: 1.0, fan: 3, fanDeg: 18, shot: { vz: 230, dmg: 1, r: 5 },
               // 유닛 원과 겹치면 0.5s 마다 앞줄 1명 hp −3
               touchEvery: 0.5, touchDmg: 3,
               // 소환(S3): 4s 마다 grunt 2 (정예 x±40, z = 정예 z −40)
               summonEvery: 4, summonKind: 'grunt', summonN: 2, summonDx: 40, summonDz: -40 },
  },
  // 복수 정예(r3.16 · 01 §5-8 · 계획서 B-1 장치 5): 스테이지 정의 `elites: [{ hp, role, x, skin, patrol, summon }]` 의 역할 표.
  //  ⚠️enemies 에 넣지 않는다 — combat.enemyDefsFor 가 enemies 를 kind 로 순회하므로 거기에 두면 가짜 kind 가 생긴다(DIFF-3 이 kind 4종을 잠근다).
  //  사격 주기·소환 주기·r·부채꼴·접촉·spawnAhead 는 enemies.elite 그대로(난이도 배수도 종전 자리에서 적용). 역할은 **행동의 유무와 정지 거리·속도 배수**만 정한다.
  //   elite    = 종전 단수 정예 그대로(사격 + 정의의 summon 플래그대로 소환). summon null = 정의 플래그를 따른다
  //   gunner   = 사격만(부채꼴 3발) · summoner = 소환만(잡졸 2/4초) · tank = 사격·소환 없음, 체력 큼, 느리게 내려와 더 가까이(360) 정지, 순찰 절반
  //  laneHw = 정의에 x 가 있을 때 순찰 반폭(px). 2체 x160/320 이면 원 r48 이 겹치지 않는 최대값(160+32+48 = 240 = 320−32−48).
  //  holdAhead 460 은 화면 y 180(그림 반높이 62 → 위 118)이라 HUD 정예 막대 글(y 111)과 겹치지 않는다. 360 은 y 280.
  //  체력 비례 크기(r3.31): r = 표 r × min(cap, 1 + k·log2(체력 ÷ 표 체력)). 체력 2배 +10% · 4배 +20% · 12배 +36% · 18배 +42%
  sizeByHp: { k: 0.1, cap: 1.45 },
  //  보스 페이즈(r3.27, 이사 결정 A 2026-09-23 "보스 체력에 맞춘 페이즈 단계"): 남은 체력 비율이 at 의 값 아래로 내려갈 때마다 한 단계 오른다.
  //   옛 러너(rush/combat.js phase2At·rage)에 있던 장치를 v3 에 처음 들여온 것 — v3 보스는 체력만 크고 끝까지 같은 속도였다.
  //   rate = 사격·소환 **주기** 배수(작을수록 자주) · speed = 순찰/추격 속도 배수 · dashEvery = 아레나 돌진 주기 배수.
  //   배열 길이는 at + 1(0단계 = 배수 1 = 종전과 같음). 단계는 내려가지 않는다(회복 없음)
  //   from = 페이즈를 켜는 첫 스테이지. 1·2번은 정예 체력이 120·220 이라 페이즈에 닿기 전에 끝나고, 어려움 2번 성공 경로가
  //   병력 4명(최대 17)으로 이미 아슬아슬해 보스를 조금만 세게 해도 깨진다(SD-7 잠금, 2026-09-23 실측) — 학습 구간은 종전 그대로 둔다
  bossPhases: { from: 3, at: [0.5, 0.2], rate: [1, 0.8, 0.62], speed: [1, 1.15, 1.3], dashEvery: [1, 0.82, 0.68] },

  elites: {
    laneHw: 32,
    roles: {
      elite:    { label: '정예', shoot: true,  summon: null,  holdAhead: 420, descendMul: 1,   patrolMul: 1 },
      gunner:   { label: '포격', shoot: true,  summon: false, holdAhead: 420, descendMul: 1,   patrolMul: 1 },
      //  r3.31: 소환형 정지 거리 460 → 420. 산탄포(사거리 420)는 460 에 선 보스에 앞줄 몇 명만 닿아, 사격을 안 하는 소환형과
      //   **끝나지 않는 판**이 났다(지옥 10번 evLead 실측: 4분 뒤 병력 7명·보스 체력 705 그대로). 다른 역할과 같은 420 으로
      summoner: { label: '소환', shoot: false, summon: true,  holdAhead: 420, descendMul: 1,   patrolMul: 1 },
      tank:     { label: '장갑', shoot: false, summon: false, holdAhead: 360, descendMul: 0.7, patrolMul: 0.5 },
    },
  },
  // 아레나 보스(r3.17 · 01 §5-1·§5-8 · 계획서 B-1 장치 6): 스테이지 정의 `arena: { z, w?, depth?, boss: {...} }` 의 기본값. 정의의 boss 칸이 덮어쓴다.
  //  w     = 광장 x 범위(도로 80~400 이 40~440 으로 열린다). 부대 중심 허용 = w ± 대형 반폭(최대 60) → 100~380
  //  depth = 부대 세로 오프셋 ay(기준선 LINE_Y 기준, 음수 = 화면 위쪽) 허용 범위. −280 이면 앞줄 y≈248(정예 배너 196~252 아래), +40 이면 150명 뒷줄(dy 159)이 y 839 → 화면 밖 아래로 조금 나간다(발밑 숫자는 H−14 로 클램프)
  //  bossZ = 보스 z 허용 = run.z + [lo, hi](화면 y 80~720)
  //  boss  = r · spawnAhead(진입 시 등장 z = run.z + 500 → y 140) · speed(추격 px/s) · touchEvery/touchDmg(겹침 접촉, 도로 정예와 같은 값)
  //          dash { every(돌진 주기 초, 회복 뒤부터), first(진입 뒤 첫 예고까지), warn(예고 초), speed(돌진 px/s), range(최대 돌진 px), recover(착지 뒤 정지 초) }
  //          shock { r(착지 충격 반지름), dmg(반지름 안 병사 hp 손실) } · summon { every, kind, n, dx, dz } | null · shoot { every, fan, fanDeg } | null
  //  상하 조향 속도·추종·상한은 squad.keySpeed(420)·followRate(9)·moveMax(250) 를 축별로 그대로 쓴다(대각선은 최대 354 px/s)
  //  난이도 배수는 createRun 이 한 번 적용한다: shock.dmg·touchDmg × touchDmg(반올림) · dash.every·shoot.every ÷ eliteFireRate · summon.every ÷ eliteSummonRate
  //  ⚠️enemies 에 넣지 않는다(enemyDefsFor 가 enemies 를 kind 로 순회한다 — elites 와 같은 이유)
  arena: {
    w: [40, 440], depth: [-280, 40],
    bossZ: [-80, 560],
    boss: { r: 48, spawnAhead: 500, speed: 110, touchEvery: 0.5, touchDmg: 3,
            dash: { every: 3.0, first: 1.5, warn: 0.8, speed: 620, range: 420, recover: 0.6 },
            shock: { r: 70, dmg: 1 }, summon: null, shoot: null,
            //  guard(r3.18 대항 검수 반영) = 첫 착지 충격까지 피격 무효(보호막). 탄은 흡수(bossGuard), 폭발·연쇄도 무효. 첫 충격 STEP 에 해제(bossGuardOff).
            //   자동 조준(명중 ≈ 100%)이라 도착 병력이 크면 첫 돌진 전에 죽는 것을 규칙으로 막는다 — 최소 1회 예고·돌진·충격을 반드시 본다
            guard: true },
  },
  // 난이도 배수 표(계약서 3-8) — **r4.2(2026-09-25) 두 줄 표**. 위협만 올리고 성장 축(게이트·보급·무기·병사 hp·armZ·coverZ)은 손대지 않는다.
  //  이사님 지시(2026-09-24) "보통, 어려움, 지옥으로 난이도 구성된 것들 삭제하고" → 결정 D2′(2026-09-25) = **지옥 값 그대로**(2번 판 조정 없음).
  //  화면에서 난이도 선택(타이틀 토글·1/2/3 키·HUD 칩·결과 표기)을 지웠고, 표에는 두 줄만 남는다:
  //   brutal = **기본 줄**(옛 '지옥' 수치 그대로). 게임 화면(셸 main.js)은 늘 이 줄로 출격한다(PLAY_DIFFICULTY). 기록 칸 키 `버전:brutal` 도 그대로 이어진다.
  //   normal = **검사용 배수 1 줄**(옛 '보통', 화면에 없음). 규칙 모듈의 기본값(DEFAULT_DIFFICULTY)이라 buildStage(id)·createRun 을 인자 없이 부르는 규칙 검사의 기대값이 그대로다.
  //   옛 '어려움'(hard) 줄은 지웠다 — 모르는 id 라 difficultyMult 가 throw 한다. 옛 저장의 `버전:hard` 칸은 save.js 가 지우지 않고 보존만 한다.
  //  배수는 buildStage/createRun 시점에 한 번 적용되고 stepRun 안에는 난이도 분기가 없다(DIFF-6 정적 검사).
  //   enemyHp      잡졸·돌격체·저격수 hp(반올림)      eshotDmg     저격수·정예 적탄 dmg(배수 1 줄 1 · 기본 줄 3)
  //   touchDmg     잡졸·돌격체·정예 접촉 피해          eliteHp      정예 hp(반올림)
  //   spawnCount   xs 없이 rows 로 뿌리는 스폰의 n(반올림, xs 명시 스폰은 그대로)   eliteFireRate 정예 부채꼴 발사 빈도(shootEvery ÷ 배수)
  //   extraSpawns  이 줄에서만 스테이지 정의의 추가 배치(stages/courses 의 extraSpawns — 옛 이름 brutalSpawns, S1·S5·S8)를 spawns 뒤에 붙인다(r3.22)
  //  화면 이름(label·short)은 r4.2 에서 지웠다 — 어디에도 표시하지 않는다.
  difficulty: {
    //  r3.9(2026-09-18 이사 결정 2)는 위협을 **출현 빈도**로만 올렸다(enemyHp·eliteHp 1 고정). → **r3.21(2026-09-20 이사 결정 B안)로 뒤집음**:
    //   이사 실기(지옥, 24까지 조작 없이 클리어) "일반 적 체력이 낮아 한두 방에 다 파괴된다" — 체력 배수를 되살렸다(brutal 2/1.5).
    //   빈도 배수(waves·waveGap·spawnCount·eliteSummonRate)와 적탄·접촉 피해 배수는 r3.9 그대로 둔다. 스테이지 구간 배율(enemyHpByStage)은 여기에 곱해진다.
    //   ⚠️1~3 기준 코스(enemyHpByStage difficultyHp: ['brutal'])에서는 배수 1 줄의 enemyHp·eliteHp 가 ×1 이다(stages.buildStage·combat.createRun).
    normal: { id: 'normal', enemyHp: 1,   eshotDmg: 1, touchDmg: 1, eliteHp: 1,    spawnCount: 1,   waves: 1, waveGap: 0,   eliteFireRate: 1,    shooterFireRate: 1, gateCapMul: 1, eliteSummonRate: 1, extraSpawns: false },
    //   waves·waveGap 은 봇 실측(2026-09-19, 6후보 스윕)으로 잡았다. brutal waves 3 은 gap 160~480 전부에서 planBoss 가 S2 정예 전에 전멸(SD-8 위반).
    //   지옥은 waves 대신 spawnCount 1.8·소환 2배·피해 3배로 벌어진다.
    brutal: { id: 'brutal', enemyHp: 2,   eshotDmg: 3, touchDmg: 3, eliteHp: 1.5,  spawnCount: 1.8, waves: 2, waveGap: 360, eliteFireRate: 1.5,  shooterFireRate: 1, gateCapMul: 1, eliteSummonRate: 2, extraSpawns: true },
  },
  //  적 체력 스테이지 배율(r3.21, 이사 결정 2026-09-20 B안 ①): 스테이지 번호 구간별 배수. 잡졸·돌격체·저격수(스폰 정의 hp 명시 포함)와
  //   정예·아레나 보스의 **소환 잡졸**에 곱한다(stages.makeSpawn 이 ev.hp 를 항상 명시하고, combat.enemyDefsFor 가 같은 배율을 표에 박아 소환 경로도 같다).
  //   정예 hp 는 r3.18 재산정값 그대로(구간 배율 적용 안 함 — 난이도 eliteHp 배수만). 구간은 to(이 번호까지) 오름차순·mul 단조 증가(V3-DIFFB 가 잠근다).
  //   1~3 ×1 은 기준 코스 불변(STAGE_IDS). 번호가 아닌 id(proto3·검사 합성)는 ×1. 출발값은 이사 지시 그대로 — 봇 스윕(보고서 difficulty-b-20260920)에서 조정 여지.
  //   difficultyHp: false(r3.21 대항 검수 반영) = 그 구간에서는 난이도 체력 배수(enemyHp·eliteHp)도 **×1** — 1~3 기준 코스는 구간 배율 ×1 과 같은 원칙으로
  //    세 난이도의 적·정예 체력이 r3.9(33568b2)와 완전히 같다(hard S2 의 봇 성공 경로 보존·SD-7 잠금 유지). 이사 소감('한두 방에 파괴')은 지옥 24 스테이지 실기에서 나왔고
  //    1~3 은 2명 시작 코스라 체력 1.5배가 치명적이었다(hard S2 planBoss 4/17 → 0/10). 빈도·적탄·접촉 배수는 1~3 에서도 그대로 걸린다. 생략 = true(4~24·proto3·합성)
  //   r3.22 부터 1~3 행은 difficultyHp: ['brutal'](지옥에서만 체력 배수). r4.2 두 줄 표에서도 값 그대로 — 기본 줄(brutal)은 적용, 배수 1 줄(normal)은 ×1 이라 결과가 같다.
  enemyHpByStage: [
    { to: 3, mul: 1, difficultyHp: ['brutal'] }, { to: 8, mul: 2 }, { to: 12, mul: 4 }, { to: 18, mul: 7 }, { to: 24, mul: 12 },
  ],
  // 랜덤 길(계약서 3-9 · 2026-09-16 이사 지시 "빈 길이 아니라 랜덤 길"). S3 분리벽 w3 우측 통로에 걸리는 5종 풀.
  //  좋음 3(병사 통·무기 통·연속 증원) : 꽝 2(막을 수 있는 음수 게이트·확정 손실 게이트) 를 균등 1/5 로 뽑는다.
  //  추첨은 buildStage 시점에 한 번(mulberry32 한 번) — 규칙 진행 중 난수는 여전히 0 이다.
  //  good  = 좋음/꽝 구분(결과 문구·공개 효과음) · label = 표지·결과 문구에 쓰는 짧은 이름
  //  kind  = 'soldier' | 'weapon' | 'chain'(통) · 'gate'(음수 게이트 한 칸)
  //  ⚠️꽝은 '병력이 실제로 줄어드는 것'이어야 한다. 적 무리는 이 지점(병력 68~69)에서 접촉 전에 전멸해
  //   손실 0 + 공짜 처치로 끝난다(2026-09-17 실측: 세 난이도 모두 69→69). 그래서 꽝 2 는 둘 다 게이트다.
  lottery: {
    //  '?' 표지가 걷히는 선 = 통로 확정선(wall.z0 - squad.wallLead). 걷히는 연출 시간은 gate.openT(0.25s) 를 함께 쓴다
    openT: 0.25,
    pool: [
      { id: 'soldier8', good: true, kind: 'soldier', label: '병사 8', durability: 14, n: 8,
        hint: '오른쪽 랜덤 길은 판마다 달라집니다. 이번엔 병사 8 이었어요' },
      { id: 'heavy', good: true, kind: 'weapon', label: '중화기', durability: 24, weapon: 'heavy',
        hint: '랜덤 길에서 중화기가 나오면 내구 24 라 병력이 모여야 열립니다' },
      { id: 'chain6', good: true, kind: 'chain', label: '연속 증원', durability: 8, pads0: 6, maxPads: 12,
        hint: '랜덤 길의 증원 설비는 발판이 오른쪽 차선에 깔립니다' },
      { id: 'badGate', good: false, kind: 'gate', label: '−15 게이트', value: -15, maxValue: 0,
        hint: '랜덤 길의 −15 게이트는 상한이 0 이라 쏘는 만큼 무효로 만들 수 있습니다' },
      //  확정 손실: 상한이 자기 값(maxValue === value)이라 쏴도 오르지 않는다. 왼쪽에서 받았을 병사 10 과 같은 크기를 잃는다
      { id: 'trapGate', good: false, kind: 'gate', label: '−10 확정 게이트', value: -10, maxValue: -10,
        hint: '랜덤 길의 확정 게이트는 상한이 자기 값이라 쏜 만큼 줄어들지 않습니다' },
    ],
  },
  // 보너스전(r3.15 · 01 §5-9): 본전투 승리 확정 뒤 sec 초 표적전. tiers = 보상 단계 문턱(점수, 오름차순 — 넘을 때마다 단계 +1),
  //  targetR = 표적 반지름(px, 탄 반폭을 더해 직격 판정), bannerSec = 시작 배너 '보너스전! N초' 표시 시간.
  //  tiers 는 봇 실측(2026-09-19, 가장 가까운 표적 조준 20초, S8 표적 4개 — 검수 반영으로 3→4)으로 잡았다: 소총 15명 49 · 기관총 15명 85 → 단계 1, 기관총 30명 162 → 2,
  //   기관총 100명 311 → 3(planBoss 보통 64명 기관총 287 = 3, 어려움·지옥 56/53명 259/260 = 2). '단계 1 은 보통 병력이면 닿고 단계 3 은 병력을 많이 살린 판만'.
  //   표적 3개 시절 [30, 100, 200](같은 봇 46/83/133/227·planBoss 215/192/193)과 같은 사다리를 유지하도록 점수 상승분(≈ +30%)만큼 올렸다. ⚠️봇 기준 — 사람 실플레이 뒤 재조정
  //  respawn = 표적 파괴 뒤 재등장까지 기본 초(정의가 안 적으면). 짧을수록 화력이 점수로 더 직접 이어진다(봇 실측 2026-09-19: 1.5 는 점수가 30 처치에서 포화)
  bonus: { tiers: [40, 130, 270], targetR: 22, respawn: 0.5, bannerSec: 1.5 },
  // 연출 상수(6장 + 기존 값 이식)
  //  gateTipSec   = 셔터 칸 위 짧은 글('가까워지면 열림' · '지금 쏘면 +1') 표시 시간(계약서 6장 N2-③)
  //  shutterGuideSec = 첫 셔터 조우 배너(저장 seenShutter 로 판당 아닌 사용자당 1회) 표시 시간
  fx: { shakeDur: 0.25, shakeAmp: 7, hurtFlashDur: 0.35, guideSec: 3, eliteBannerSec: 0.8, rewardPopSec: 0.5,
        fireVolBase: 0.4, fireVolPer: 40, joinManyAt: 3, gateTipSec: 1.2, shutterGuideSec: 3,
        //  objectiveBannerSec(r3.14 구출 캡슐) = 출격 직후 '작전 목표' 배너(판당 1회) 표시 시간
        objectiveBannerSec: 3,
        //  bossKillBannerSec(r3.16 복수 정예) = 정예 하나를 잡았는데 남은 목표가 있을 때 배너 '정예 N 격파 — 남은 목표 M' 표시 시간
        bossKillBannerSec: 1.2,
        //  아레나(r3.17): arenaOpenSec = 도로가 광장으로 열리는 연출 초 · arenaGuideSec = '드래그로 피하세요' 배너(판마다 진입 시 1회) · shockRingSec = 착지 충격 확장 링
        arenaOpenSec: 0.6, arenaGuideSec: 2.4, shockRingSec: 0.45,
        //  동작 시트(6장, 2026-09-18 파일럿): 히어로는 걷기 heroWalkMinSec 뒤 발사 이벤트에 사격 시트 1회,
        //  쓰러진 잡졸은 사망 시트 뒤 corpseLingerSec 머물다 corpseFadeSec 동안 흐려진다(최대 corpseCap 구)
        //  heroFireAlways(이사 결정 9/18): 출격 중엔 사격 시트만 계속 재생(걷기 시트 미사용). false 면 heroFire 타이머로 걷기↔사격 교대
        heroFireAlways: true, heroWalkMinSec: 0.2, corpseLingerSec: 0.6, corpseFadeSec: 0.3, corpseCap: 40,
        //  손맛(r3.24, 이사 관찰 2026-09-23 "여러 대 맞아야 터지는 애들은 피탄될 때마다 반응이 그래픽으로"): 셸·렌더 전용 연출 상수. 규칙은 읽지 않는다.
        //   partsCap = 화면 파편 상한(넘으면 오래된 것부터 버린다 — 적 수십 기가 한꺼번에 맞아도 프레임이 버티게)
        partsCap: 240,
        hit: {
          //  공통 피격 반응 길이(초): 흰색 번쩍임 · 넉백(위로 밀렸다 복귀) · 스쿼시(가로 퍼짐·세로 눌림) · HP 숫자 튐 · '-n' 떠오름
          flashSec: 0.08, knockSec: 0.14, squashSec: 0.16, hpPopSec: 0.2, dmgFloatSec: 0.55,
          //  번쩍임 쉼(초): 연사로 매 프레임 맞아도 번쩍임은 flashSec 켜짐 → 최소 flashGap 꺼짐으로 깜빡인다(늘 하얗게 떠서 그림이 안 보이던 것 — 캡처 실측)
          flashGap: 0.07,
          //  '-n' 은 스폰 체력이 이 값 이상인 적에만(한두 방에 죽는 적은 생략 — 화면이 어지럽지 않게). HP 태그(r3.21 hpMax > 2)와 같은 문턱
          dmgFloatMinHp: 3,
          //  같은 적이 연사로 맞을 때 '-n' 을 묶는 간격(초): 이 안에 또 맞으면 떠 있는 '-n' 의 숫자를 키운다(글자 수십 개가 겹치지 않게) ·
          //   dmgFloatCap = 화면에 동시에 뜨는 '-n' 최대 수(넘으면 오래된 것부터)
          dmgMergeSec: 0.25, dmgFloatCap: 24,
        },
        //  적 종류별 반응(역할 = skin 우선, 없으면 kind). knock = 넉백 px(배율 전) · squash = 최대 변형률 · shake = 좌우 흔들림 px ·
        //   sparks = 피격 파편 수 가산 · metal = 흰·노랑 금속 스파크를 섞는다 · flash = 번쩍임 불투명도 · death = 사망 연출 종류 · deathSec = 잔해 머무는 초
        hitRoles: {
          grunt:   { knock: 5,   squash: 0.18, shake: 0,   sparks: 0, metal: false, flash: 0.9,  death: 'sheet',  deathSec: 0 },
          rusher:  { knock: 11,  squash: 0.2,  shake: 3.5, sparks: 1, metal: false, flash: 0.9,  death: 'tumble', deathSec: 0.9 },
          shooter: { knock: 4,   squash: 0.12, shake: 0,   sparks: 1, metal: false, flash: 0.95, death: 'ring',   deathSec: 0.55 },
          armor:   { knock: 1.5, squash: 0.06, shake: 0,   sparks: 3, metal: true,  flash: 0.8,  death: 'plates', deathSec: 1.1 },
          cart:    { knock: 0,   squash: 0.05, shake: 3,   sparks: 2, metal: true,  flash: 0.75, death: 'boom',   deathSec: 1.0 },
          elite:   { knock: 3,   squash: 0.05, shake: 2,   sparks: 1, metal: true,  flash: 0.55, death: 'multi',  deathSec: 0 },
        },
        //  skin → 역할(그림이 역할을 뜻한다, courses.js 의 ARMOR·CART·JUMPER·HOUND·POD·MAGNET)
        hitRoleBySkin: { E3_wallguard: 'armor', E7_cartyard: 'cart', E2_ramhound: 'rusher', E8_manholejumper: 'rusher',
                         E4_needleeye: 'shooter', E9_spawnpod: 'shooter', E10_magnethead: 'shooter' },
        //  그림 배율(r3.31, 이사 지시 "바리케이드 모양 적과 신호등은 좀 더 크기를 키워주자"): **그리기 전용** — 판정 r 은 그대로.
        //   두 그림은 세로로 길거나(신호등) 납작해서(바리케이드) 같은 r 에서 다른 적보다 작아 보였다
        artScale: { E3_wallguard: 1.35, E6_signaler: 1.4 },
        //  전격 기절 표시(r3.31): 멈춘 적 둘레에 청보라 고리 + 번개 조각
        stunColor: '#9FB4FF',
        //  무기별 피격 스파크: n = 개수 · r = 크기 · sp = 속도 · shape(dot 점 · line 가는 선 · bolt 번개 조각) · color
        hitSparks: {
          rifle:   { n: 3, r: 2.6, sp: 140, shape: 'dot',  color: '#F6C84A' },
          auto:    { n: 3, r: 2.2, sp: 150, shape: 'dot',  color: '#35E5FF' },
          heavy:   { n: 5, r: 4.2, sp: 170, shape: 'dot',  color: '#FF9A4A' },
          scatter: { n: 6, r: 1.6, sp: 120, shape: 'dot',  color: '#B6FF4A' },
          sniper:  { n: 3, r: 1.2, sp: 260, shape: 'line', color: '#EEF4FF' },
          arc:     { n: 4, r: 2.0, sp: 160, shape: 'bolt', color: '#9E86FF' },
        },
        //  정예·아레나 보스 사망 = 다단 폭발(span 초에 걸쳐 n 번, 자리는 반지름 안에서 돌아가며)
        bossMultiBoom: { n: 4, span: 0.6 },
        //  병사 합류 연출(이사 ②): 통 자리에서 병사 실루엣이 튀어나와 부대로 날아간다(sec 초, 최대 max 명까지만 그리고 나머지는 숫자로) ·
        //   hop = 튀어오르는 높이(px) · 도착 순간 부대 위 반짝임 sparkleSec
        joinFly: { sec: 0.5, max: 10, hop: 70, sparkleSec: 0.35 } },
  // 색(기존 값 이식 + v3 게이트 색)
  colors: {
    outline: '#14233A', hero: '#F3F1E8', heroHurt: '#FF4A4A', soldier: '#DFE6F5', hud: '#FFFFFF', gold: '#F6C84A',
    gatePos: '#35E5FF', gateNeg: '#FF6A3D', gateZero: '#9AA1AC', gateFlash: '#FFFFFF',
    bulletRifle: '#F6C84A', bulletAuto: '#35E5FF', bulletHeavy: '#FF9A4A',
    supplyBody: '#FFE9B8', supplyDark: '#8A6D1F', chainPad: '#35E5FF', wall: '#9AA1AC', wallTop: '#DFE6F5',
    //  구출 캡슐(r3.14): 유리 테·받침 선(capsule) + 유리 반투명 채움(capsuleGlass). 새 그림 없이 도형으로 그린다
    capsule: '#7FE8DC', capsuleGlass: 'rgba(127,232,220,0.38)',
    //  보너스전 표적(r3.15): 노란 선물 상자(bonusBox) + 붉은 리본(bonusRibbon). 새 그림 없이 도형으로 그린다
    bonusBox: '#FFD34A', bonusRibbon: '#FF4A6A',
    enemy: { grunt: '#B3402F', rusher: '#3A3A3A', shooter: '#2B2F36', elite: '#2B1420' },
    eshot: '#FF3DA5', eshotCore: '#FF3020', warn: '#C2273B',
    bg: [
      { road: '#B7B1A2', side: '#857F6F', line: 'rgba(255,255,255,0.55)' },
      { road: '#A8A296', side: '#7A746A', line: 'rgba(255,255,255,0.5)' },
      { road: '#948F86', side: '#6A655D', line: 'rgba(255,255,255,0.42)' },
      //  4·5 = 13~24 스테이지 배경(BG4 공장 내부·BG5 최종 구역). 그림이 없을 때의 대체 팔레트
      { road: '#8C8A8C', side: '#5E5B62', line: 'rgba(255,255,255,0.38)' },
      { road: '#7E7C86', side: '#4F4C58', line: 'rgba(255,255,255,0.34)' },
    ],
  },
});

// 배수 표의 줄 id 목록(r4.2 두 줄 표: ['normal', 'brutal']). 데이터 접근만 — 규칙 로직이 아니다. 화면에는 쓰지 않는다.
export const DIFFICULTY_IDS = Object.freeze(Object.keys(BAL3.difficulty));
// 규칙 계층 기본(buildStage·createRun·enemyDefsFor 인자 생략 시) = 검사용 배수 1 줄(normal) — 규칙 검사·봇 기준선. r4.2 에서도 그대로다.
export const DEFAULT_DIFFICULTY = 'normal';
// 게임 화면이 늘 출격하는 줄 = 기본 줄(brutal, 옛 '지옥'). r4.2(2026-09-25) 난이도 선택 삭제 — 셸(main.js)은 이 값 하나만 buildStage 에 넘긴다.
//  종전 이름 DEFAULT_PICK_DIFFICULTY(타이틀 초기 선택, 2026-09-16 이사 결정 '지옥')와 같은 값이다 — 새 사용자의 기록 칸(`버전:brutal`)도 그대로 이어진다.
export const PLAY_DIFFICULTY = 'brutal';

// 난이도 배수 표 한 줄. 모르는 id(지운 'hard' 포함)는 throw — 규칙 모듈이 조용히 배수 1 줄로 떨어지지 않게
export function difficultyMult(id) {
  const m = BAL3.difficulty[id];
  if (!m) throw new Error('unknown difficulty ' + id);
  return m;
}

// 적 체력 스테이지 배율 조회(r3.21). 숫자 스테이지 번호만 표를 읽고, 그 밖(proto3·검사 합성 id·표 범위 밖 번호)은 1. 데이터 접근만.
function hpRowFor(stageId) {
  if (typeof stageId !== 'number' || !Number.isFinite(stageId)) return null;
  for (const row of BAL3.enemyHpByStage) if (stageId <= row.to) return row;
  return null;
}
export function enemyHpMulFor(stageId) {
  return hpRowFor(stageId)?.mul ?? 1;
}
// 난이도 체력 배수(enemyHp·eliteHp)를 적용하는 스테이지인가(r3.21 대항 검수 반영). 표의 difficultyHp: false 구간(1~3)만 false, 그 밖은 true. 데이터 접근만.
//  difficultyHp 행 값: 생략·true = 모든 줄에 적용 · false = 전부 ×1 · **배열 = 그 줄에서만 적용**(r3.22 지옥 강화 — 1~3 은 기본 줄 brutal 만)
export function difficultyHpFor(stageId, difficulty) {
  const v = hpRowFor(stageId)?.difficultyHp;
  if (Array.isArray(v)) return difficulty != null && v.includes(difficulty);
  return v !== false;
}
