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
    // heavy: 적 직격 시 반경 28 폭발(폭발 dmg 2, 직격 적은 3만, 벽 반대편 제외). 통·게이트·벽 명중 시 폭발 없음
    heavy: { id: 'heavy', rank: 3, interval: 0.6,  dmg: 3, vz: 650, w: 8, color: '#FF9A4A', name: '중화기', gateHit: 1, blastR: 28, blastDmg: 2 },
    //  r3.10(2026-09-19 이사 결정 A) 신규 3종(이미지프롬프트_v5 §5). 같은 순위끼리는 교체 없음.
    //   scatter: 발사마다 fan 발을 ±spreadDeg 부채꼴로, 사거리 range px 뒤 소멸(근거리·게이트 특화 — 3발 모두 gateHit 1)
    //   sniper : 관통 pierce 체(같은 적은 다시 안 맞음), dmg 3 · arc: 직격 시 chainR 안 적 chain 체에 chainDmg 연쇄(벽 너머 제외)
    scatter: { id: 'scatter', rank: 2, interval: 0.55, dmg: 1, vz: 520, w: 4, color: '#B6FF4A', name: '산탄포', gateHit: 1, fan: 3, spreadDeg: 14, range: 420 },
    sniper:  { id: 'sniper',  rank: 3, interval: 0.9,  dmg: 3, vz: 900, w: 4, color: '#DDEBFF', name: '저격총', gateHit: 1, pierce: 2 },
    arc:     { id: 'arc',     rank: 3, interval: 0.7,  dmg: 1, vz: 750, w: 5, color: '#7F9BFF', name: '전격포', gateHit: 1, chain: 2, chainR: 90, chainDmg: 1 },
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
    grunt:   { hp: 2, r: 14, vz: 60, track: 0, touchDmg: 1 },
    // 돌격체: 스폰 x 직진, 가속 260/s², 최대 420. 접촉 유닛 hp −2
    rusher:  { hp: 4, r: 18, vz: 90, accel: 260, maxVz: 420, touchDmg: 2 },
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
  elites: {
    laneHw: 32,
    roles: {
      elite:    { label: '정예', shoot: true,  summon: null,  holdAhead: 420, descendMul: 1,   patrolMul: 1 },
      gunner:   { label: '포격', shoot: true,  summon: false, holdAhead: 420, descendMul: 1,   patrolMul: 1 },
      summoner: { label: '소환', shoot: false, summon: true,  holdAhead: 460, descendMul: 1,   patrolMul: 1 },
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
  // 난이도 배수(계약서 3-8). 위협만 올리고 성장 축(게이트·보급·무기·병사 hp·armZ·coverZ)은 손대지 않는다.
  //  normal 은 전부 ×1 = 종전과 완전히 같은 판. 배수는 buildStage/createRun 시점에 한 번 적용되고 stepRun 안에는 난이도 분기가 없다.
  //  근거: 이사 실플레이 3회 소감 "가만히 있으면 손해는 나지만 난이도가 너무 낮아 완전 쉽다"(2026-09-16). 사람이 직접 지점을 고르게 하는 명시적 선택이다.
  //   enemyHp      잡졸·돌격체·저격수 hp(반올림)      eshotDmg     저격수·정예 적탄 dmg(어려움부터 1발 = 병사 1명)
  //   touchDmg     잡졸·돌격체·정예 접촉 피해          eliteHp      정예 hp(반올림)
  //   spawnCount   xs 없이 rows 로 뿌리는 스폰의 n(반올림, xs 명시 스폰은 그대로)   eliteFireRate 정예 부채꼴 발사 빈도(shootEvery ÷ 배수)
  //  ⚠️표시 이름(label·short)과 id 는 다른 것이다 — 2026-09-18 이사 결정으로 세 칸의 화면 이름은 **보통 / 어려움 / 지옥**이지만
  //   id('normal'·'hard'·'brutal')·배수·저장 칸 키 접미는 종전 그대로다(기록 칸 `2:brutal` 은 옛 저장과 그대로 이어진다).
  difficulty: {
    //  r3.9(2026-09-18 이사 결정 2)는 위협을 **출현 빈도**로만 올렸다(enemyHp·eliteHp 1 고정). → **r3.21(2026-09-20 이사 결정 B안)로 뒤집음**:
    //   이사 실기(지옥, 24까지 조작 없이 클리어) "일반 적 체력이 낮아 한두 방에 다 파괴된다" — 체력 배수를 되살린다(hard 1.5/1.25 · brutal 2/1.5).
    //   빈도 배수(waves·waveGap·spawnCount·eliteSummonRate)와 적탄·접촉 피해 배수는 r3.9 그대로 둔다. 스테이지 구간 배율(enemyHpByStage)은 여기에 곱해진다.
    //   ⚠️1~3 기준 코스(enemyHpByStage difficultyHp: false)에서는 enemyHp·eliteHp 가 ×1 로 읽힌다(stages.buildStage·combat.createRun) — 대항 검수 반영.
    normal: { id: 'normal', label: '보통',   short: '',       enemyHp: 1,   eshotDmg: 1, touchDmg: 1, eliteHp: 1,    spawnCount: 1,   waves: 1, waveGap: 0,   eliteFireRate: 1,    shooterFireRate: 1, gateCapMul: 1, eliteSummonRate: 1 },
    //   waves·waveGap 은 봇 실측(2026-09-19, 6후보 스윕)으로 잡았다: hard 2/360·brutal 2/360 만 성공 경로 잠금(SD-7)·정예전 도달(SD-8)·단조성(SD-5)을 전부 지킨다.
    //   brutal waves 3 은 gap 160~480 전부에서 planBoss 가 S2 정예 전에 전멸(SD-8 위반). 지옥은 waves 대신 spawnCount 1.8·소환 2배·피해 3배로 벌어진다.
    hard:   { id: 'hard',   label: '어려움', short: '어려움', enemyHp: 1.5, eshotDmg: 2, touchDmg: 2, eliteHp: 1.25, spawnCount: 1.4, waves: 2, waveGap: 360, eliteFireRate: 1.25, shooterFireRate: 1, gateCapMul: 1, eliteSummonRate: 1.5 },
    brutal: { id: 'brutal', label: '지옥',   short: '지옥',   enemyHp: 2,   eshotDmg: 3, touchDmg: 3, eliteHp: 1.5,  spawnCount: 1.8, waves: 2, waveGap: 360, eliteFireRate: 1.5,  shooterFireRate: 1, gateCapMul: 1, eliteSummonRate: 2 },
  },
  //  적 체력 스테이지 배율(r3.21, 이사 결정 2026-09-20 B안 ①): 스테이지 번호 구간별 배수. 잡졸·돌격체·저격수(스폰 정의 hp 명시 포함)와
  //   정예·아레나 보스의 **소환 잡졸**에 곱한다(stages.makeSpawn 이 ev.hp 를 항상 명시하고, combat.enemyDefsFor 가 같은 배율을 표에 박아 소환 경로도 같다).
  //   정예 hp 는 r3.18 재산정값 그대로(구간 배율 적용 안 함 — 난이도 eliteHp 배수만). 구간은 to(이 번호까지) 오름차순·mul 단조 증가(V3-DIFFB 가 잠근다).
  //   1~3 ×1 은 기준 코스 불변(STAGE_IDS). 번호가 아닌 id(proto3·검사 합성)는 ×1. 출발값은 이사 지시 그대로 — 봇 스윕(보고서 difficulty-b-20260920)에서 조정 여지.
  //   difficultyHp: false(r3.21 대항 검수 반영) = 그 구간에서는 난이도 체력 배수(enemyHp·eliteHp)도 **×1** — 1~3 기준 코스는 구간 배율 ×1 과 같은 원칙으로
  //    세 난이도의 적·정예 체력이 r3.9(33568b2)와 완전히 같다(hard S2 의 봇 성공 경로 보존·SD-7 잠금 유지). 이사 소감('한두 방에 파괴')은 지옥 24 스테이지 실기에서 나왔고
  //    1~3 은 2명 시작 코스라 체력 1.5배가 치명적이었다(hard S2 planBoss 4/17 → 0/10). 빈도·적탄·접촉 배수는 1~3 에서도 그대로 걸린다. 생략 = true(4~24·proto3·합성)
  enemyHpByStage: [
    { to: 3, mul: 1, difficultyHp: false }, { to: 8, mul: 2 }, { to: 12, mul: 4 }, { to: 18, mul: 7 }, { to: 24, mul: 12 },
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
        heroFireAlways: true, heroWalkMinSec: 0.2, corpseLingerSec: 0.6, corpseFadeSec: 0.3, corpseCap: 40 },
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

// 난이도 id 목록(타이틀 토글 순서 = 표 순서). 데이터 접근만 — 규칙 로직이 아니다.
export const DIFFICULTY_IDS = Object.freeze(Object.keys(BAL3.difficulty));
export const DEFAULT_DIFFICULTY = 'normal';
// 타이틀 초기 선택(저장에 난이도가 없을 때). 2026-09-16 이사 결정: 가장 높은 난이도로 전 스테이지 격파 → 기본 선택을 그 칸으로.
//  규칙 계층 기본(DEFAULT_DIFFICULTY, buildStage 인자 생략 시)은 normal 그대로 — 테스트·봇 기준선.
export const DEFAULT_PICK_DIFFICULTY = 'brutal';

// 난이도 배수 표 한 줄. 모르는 id 는 throw(규칙 모듈이 조용히 normal 로 떨어지지 않게 — 셸이 저장값을 미리 거른다)
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
//  difficultyHp 행 값: 생략·true = 모든 난이도에 적용 · false = 전부 ×1 · **배열 = 그 난이도에서만 적용**(r3.22 지옥 강화 — 1~3 은 지옥만)
export function difficultyHpFor(stageId, difficulty) {
  const v = hpRowFor(stageId)?.difficultyHp;
  if (Array.isArray(v)) return difficulty != null && v.includes(difficulty);
  return v !== false;
}
