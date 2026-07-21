// 모든 밸런스 수치의 단일 소스. 로직 없음 — 여기 숫자만 바꿔서 게임을 조정한다.
export const BAL = {
  logicalW: 480,

  scrollSpeed: 220,          // 초당 px
  scrollSpeedLateBonus: 1.1, // 판 후반(진행 70%~) 속도 배율

  squad: {
    start: 8,        // 시작 드론 수
    fireRate: 2,     // 드론 1기당 초당 발사 수
    damage: 1,       // 탄환 1발 데미지
    evolveInvuln: 0.8, // 진화 직후 무적 시간(초) — 파워 스파이크를 안전하게 만끽 (A3)
    drawCap: 60,     // 개별 드론 렌더 상한 (초과 시 무리 고정 + 숫자)
    contactCapPct: 0.6, // 접촉 1회 최대 손실 = 편대의 60% (소편대 한 방 전멸 방지)
    radius: 7,       // 드론 반지름
    followSpeed: 9,  // targetX 추적 반응 (클수록 민첩)
    laneMargin: 30,  // 트랙 좌우 여백
    maxWidth: 84,    // 편대 최대 반폭 (회피 가능하게 축소 — 옛 120은 트랙 절반을 덮었다)
  },

  bullet: { speed: 620, radius: 3, cap: 400 },

  // 경제 조정: 드론 획득 총량 배수 (크리스탈·수송선). 낮추면 진화가 느려지고 난이도가 오른다.
  // enemyHpPowerScale: 적 HP를 함대 화력(maxPower)에 비례. 클수록 완만(내 DPS가 앞서 = 파워판타지).
  // enemyHpPowerCap: 비례 상한 — 이 배수를 넘으면 더 안 단단해져 강해질수록 쓸어버리는 손맛 (STG rank 완화).
  // enemyHpCapPerStage: 화력 비례 HP 상한을 스테이지마다 이만큼 올림 → 깊은 판에선 즉사 안 함(무한 상승)
  // droneGainMult 하향 = 진화 감속. 화력비례 상한(Cap)을 크게 올려 강해져도 적이 안 녹게(즉사 방지) →
  //  후반 난이도 역전을 막고, 실제 위협은 밀도(spawn)+탄막(shotCap)+회피로 온다.
  economy: { droneGainMult: 0.22, enemyHpPowerScale: 130, enemyHpPowerCap: 12, enemyHpCapPerStage: 1.5 },

  // 차지 랜스 (홀드→충전→발사): 자동사격을 멈추고 에너지를 모아 정면 관통 빔 발사
  charge: {
    stageTime: 0.5,                    // 단계당 충전 시간(초)
    maxStage: 3,                       // 기본 최대 단계 (과부하 모듈로 +1)
    minStageToFire: 1,                 // 이 단계 미만이면 발사 안 함 (오클릭 안전)
    blastCoef: 0.24,                   // 랜스 피해 = power × blastCoef × stageMult × 발사속도·공격력·무기레벨·무기계수 (자동사격과 동일 스케일; 계수 추가분만큼 기존 0.47→0.24로 보정)
    stageMult: [0, 1, 2.4, 4.2, 6.5],  // stage 1..4 (index 0 미사용)
    width: [0, 26, 40, 56, 78],        // 빔 반폭 by stage
  },

  // 적 스폰 배수: 트랙의 적 항목(크리처/저격/포탑/위버)을 이 배수만큼 복제 (미러 배치)
  // 적 복제 수 = enemyMult + floor((stage-1)/stageStep), 상한 max. 깊은 판일수록 적이 많아 움직여야 생존.
  // 밀도 = 후반 난이도의 핵심. 스테이지마다 적 복제 수가 늘어 화력으로 다 못 쓸고 회피를 강제한다.
  spawn: { enemyMult: 3, enemyMultMax: 12, enemyMultStageStep: 2 },

  // 엘리트 변이(어픽스): 적에 특성을 붙여 같은 적을 다양하게. 색 오라+아이콘으로 표시.
  // 로직은 affixes.js, 여기엔 수치·표시만. 스테이지 깊을수록 자주·중첩된다.
  affix: {
    baseChance: 0.08, chancePerStage: 0.06, chanceCap: 0.55,
    twoAffixStage: 6,                                     // 이 스테이지부터 최대 2개 중첩
    defs: {
      swift:  { name: '고속',   icon: '»', color: '#ff9c41', spd: 1.6, fire: 0.7 },  // 빠른 이동/발사
      shield: { name: '보호막', icon: '◈', color: '#3fd0f5', charges: 1 },           // 첫 피격 무효
      split:  { name: '분열',   icon: '✶', color: '#b44cff', count: 2 },             // 죽으면 소형 분열
      toxic:  { name: '돌격',   icon: '☣', color: '#7cff4c', contact: 1.7 },         // 접촉 피해 증가
      elite:  { name: '정예', icon: '★', color: '#ffd93d', hp: 3.2, radius: 1.35, bounty: 6, coin: 8 }, // 단단·대박
      magnet: { name: '유도탄', icon: '◎', color: '#ff4cd2', homing: 3.2 },          // 탄이 편대 유도
    },
  },

  // 돌진병: 예고 후 편대를 향해 급강하 (회피 타이밍 게임)
  charger: { hp: 30, enterSpeed: 95, dashSpeed: 540, telegraph: 0.7, hoverY: 150, contactPct: 0.14, contactMin: 6, coin: 4, bounty: 2, radius: 24 },
  // 기뢰: 천천히 떠다니다 가까우면 폭발 (가만히 못 있게 만듦)
  mine: { hp: 10, descent: 55, sway: 34, swayHz: 0.4, armRadius: 115, fuse: 0.55, blastRadius: 92, dmgPct: 0.12, dmgMin: 8, coin: 3, radius: 13 },

  // 함선 진화: 순양함을 모아 기함을 업그레이드(자동). 티어 이름만 데이터로 유지.
  // (화력은 흡수 순양함을 squad.banked에 누적 — entities.checkEvolution. 옛 드론소모/오버로드/승천 제거)
  evolution: {
    // 기함 등급 = '빛의 단계'. 세계관이 NF-0 LUMEN(빛의 단위)로 시작해 회수한 빛(NEON CORE)으로
    // 함선을 다시 만들고 왕관을 부수는 이야기라, 등급마다 빛이 커지는 고유명사로 통일(이사 선택).
    // 예전 이름(스카우트·인터셉터·스트라이커)은 함선이 아니라 전투기 등급이었고,
    // 캐리어(항공모함)가 드레드노트(전함)보다 아래라 위계도 어긋나 있었다.
    names: ['잔광', '섬광', '집광', '극광', '백야', '초신성'],
  },

  // ── NEON ADAPTATION Phase 1 ──────────────────────────────────
  // 무기 진화(Lv3 후 같은 색 캡슐로 2택). 특정 무기 완전 면역 금지, 피해 감소 ≤70%.
  weaponEvolution: {
    evoLevelStep: 0.14,   // 진화 레벨(1→2→3)당 그 무기 피해 배수 증가 → "강해지는 게 느껴진다"
    superLevelStep: 0.12, // 초진화 레벨(1→2→3)당 추가 피해 배수
    duplicateReward: { drones: 20, coin: 10 },  // (미사용) 옛 대체 보상
    // 양갈래를 정반대 스타일로 확실히 구분 (광역/연쇄 ↔ 단일/관통)
    vulcan_storm:  { spread: 1.7, ricochetFrac: 0.75, ricochetRadius: 165, bounces: 2 },                       // 폭풍: 넓게 뿌리고 적 사이를 2번 튕김(다수전) · 반동피해 0.6→0.75
    vulcan_needle: { spread: 0.12, rate: 1.9, critBonus: 0.2, sizeMult: 0.82, pierceBonus: 2 },                // 니들: 일직선 초고속 관통 드릴(단일) — 발사체 원본이 이미 가늘어(폭 29px) sizeMult를 너무 낮추면 폭 1px로 실종 → 0.82로 완화(백열 코어와 합쳐 가시)
    laser_prism:   { splitFrac: 0.5, splitRadius: 200, splitPierce: 2 },                                        // 프리즘: 관통 후 좌우로 크게 분열(다수전)
    laser_cutter:  { every: 5, widthMult: 2.3, pierceBonus: 4, clearRadius: 16, dmgMult: 1.6 },                // 커터: 5발마다 굵은 절단탄 + 적탄 제거(반경 34→16·빈도 3→5로 하향, 대신 dmg 1.5→1.6)
    homing_wasp:   { count: 4, totalFrac: 2.8, cap: 34 },                                                       // 와스프: 소형 4발 군집(분산 표적) · 발당 위력 대폭↑(5발×0.34→4발×0.7), 총 1.7→2.8
    homing_siege:  { rateMult: 0.42, dmgMult: 5.2, sizeMult: 1.7, blastRadius: 110, blastFrac: 0.5, bossBonus: 0.25, speedMult: 0.75, turnMult: 0.65 }, // 시즈: 느린 초대형 강타 · 발사 0.3→0.42·피해 4.4→5.2·폭발 100→110
  },

  // 2단계 초진화(1단계 진화 후 같은 색 캡슐 → 2택). 정의는 weapon-evolutions.js. 무기 전체를 증폭(뚜렷한 정체성).
  //  dmgMult=무기 피해, rateMult=발사 속도, spreadMult=발칸 확산, pierceBonus=관통 추가.
  weaponSuperEvolution: {
    vulcan_tempest: { dmgMult: 1.15, rateMult: 1.15, spreadMult: 1.4, pierceBonus: 0 },   // 초광역 폭풍
    vulcan_lance:   { dmgMult: 1.30, rateMult: 1.0,  spreadMult: 0.5, pierceBonus: 2 },    // 관통 집중
    laser_nova:     { dmgMult: 1.22, rateMult: 1.0,  spreadMult: 1.0, pierceBonus: 2 },    // 증폭 관통
    laser_reaper:   { dmgMult: 1.10, rateMult: 1.35, spreadMult: 1.0, pierceBonus: 1 },    // 초고속 절단
    homing_legion:  { dmgMult: 1.10, rateMult: 1.45, spreadMult: 1.0, pierceBonus: 0 },    // 미사일 난사
    homing_nova:    { dmgMult: 1.40, rateMult: 0.7,  spreadMult: 1.0, pierceBonus: 0 },    // 초대형 강타
  },

  // 기함 교리(첫 업그레이드 1회 선택). 전문 분야 +20~25%, 비전문엔 직접 보너스 없음.
  doctrine: {
    swarm: { supportMult: 1.25, escortShareBonus: 0.10, droneGainBonus: 0.10 },
    lance: { chargeSpeedMult: 1.20, chargeDmgMult: 1.15 },
    phase: { hitRadiusDelta: -3, hitRadiusMin: 12, bankDmgMax: 0.20 },
  },

  // 대응형 신규 적 3종 (js/adaptive-enemies.js). 최소 두 가지 대응법 제공.
  //  체력벽이 아니지만 후반에 무력화되지 않도록 완만한 전용 HP 스케일(상한 있음)을 적용한다.
  adaptiveEnemies: {
    hpPerStage: 0.18, hpScaleMax: 2.6,   // HP = 기본 × min(2.6, 1+0.18×(stage-1))
    prismWarden:  { minStage: 2, hp: 70, r: 42, frontReduce: 0.55, coreHp: 16, coreOffset: 34, coin: 7 },  // 정면 55%감소(일반공격도 통하게), 코어 더 빨리 깨짐
    scavenger:    { minStage: 2, hp: 35, r: 34, approach: 150, flee: 260, stealR: 28, rewardMult: 1.5, coin: 5, stayTime: 1.2 },
    gateParasite: { minStage: 3, hp: 45, r: 30, offsetY: 36, cleanseDrones: 10, armorReduce: 0.35 },  // 일반 공격 35% 감소(65%만), 랜스 강습3단+ 무시(전액)
  },

  // ── 집중 게이지(FLOW) → 폭주(NEON RUSH). '적 처치 콤보'로 게이지가 차고 100에서 폭주 자동 발동.
  //  (구 '근접 회피'가 너무 어렵다는 피드백 → 처치 콤보로 개편). 로직은 js/flow.js(순수). 보상형(필수 아님).
  flow: {
    gainPerKill: 12,        // 적 1기 처치당 집중 게이지 적립 (콤보)
    gain: 10,               // (구) 회피 1회 적립 — 현재 미사용
    grazeBand: 18,          // (구) 회피 판정 폭 — 현재 미사용
    max: 100,
    decayDelay: 1.5,        // 마지막 처치 후 감소 시작(초)
    decayPerSec: 8,         // 이후 초당 감소 (콤보 유지 압박)
    minBulletAge: 0.12,     // (구) — 현재 미사용
    rushDuration: 4.0,
    rushDamageMult: 1.18,
    rushChargeSpeedMult: 1.20,
    rushMoveResponseMult: 1.15,
    hitLoss: 35,            // 피격 시 게이지 손실 (콤보 끊김)
    textCooldown: 0.12,
  },

  // 키스톤(원정당 1개, 첫 섹터 보스 후 선택). 정의는 js/keystones.js. 여기엔 수치만.
  keystone: {
    swarmForge:  { killsPerProc: 8, ghostDuration: 8, ghostDurationMax: 16, ghostCruisers: 2, supportBonus: 0.5, flagPenalty: 0.08 },  // 유령 순양함이 실제 사격까지(체감↑)
    lanceEcho:   { minStage: 3, delay: 0.35, dmgFrac: 0.45, widthFrac: 0.65, autoPenalty: 0.12, maxPending: 3 },
    phaseAfterimage: { killsPerProc: 5, radius: 70, maxClear: 8 },   // 적 5기 처치마다 충격파 (구: 회피 3회)
  },

  // B22 네온 아비터: STAGGER(피해 누적/랜스)로 BREAK를 유발하는 상호작용형 보스. (구 graze→피해기반)
  neonArbiter: {
    staggerMax: 10, dmgStaggerFrac: 0.05, lanceStagger: 2,   // 보스 HP의 5% 딜마다 무력화 +1 (총 50% 딜=완전 무력화)
    breakDuration: 1.6, breakDamageMult: 1.25, staggerCooldown: 2.0,
    wallInterval: 1.35, wallTelegraph: 0.65, wallCount: 8, wallGapSlots: 2, wallSpeed: 170, wallMinGapPx: 72,
    ringInterval: 1.55, ringCount: 14, ringGapDeg: 55, ringSpeed: 155,
    enrageIntervalMult: 0.82,
  },

  // 드론 합체 순양함: 드론이 자동으로 순양함으로 뭉쳐 기함과 같은 무기로 함께 쏜다(1척=cruiserPower 화력).
  //  드론 → (자동) 순양함 → (선택창) 기함 업그레이드. 강화 단계를 나눠 진행이 오래 이어진다.
  //  드론→순양함은 자동(게이트·선택 없음). 순양함이 모여 기함을 올릴 때만 선택창(모듈 드래프트)이 뜬다.
  escort: {
    dronesPerCruiser: 130,    // 드론 130기 → 순양함 1척 (자동 합체) — 합체 감속
    cruisersPerFlagship: 9,   // 순양함 N척 → 기함 1단계 자동 업그레이드 (아래 표가 없을 때의 기본값)
    // 등급별 필요 순양함. 초반 승급이 너무 오래 걸린다(이사)는 피드백으로 앞 단계를 싸게 —
    // index = 현재 등급(0=스카우트 → 1). 뒤 단계는 기존 9척 그대로라 후반 페이스는 유지된다.
    cruisersPerFlagshipByTier: [4, 6, 8, 9, 9],
    cruiserPower: 130,        // 순양함 1척 화력(드론 환산) — 총화력·적 스케일에 합산
    maxCruisers: 12,          // 순양함 최대 (성능·화면 상한)
    slotGap: 30,              // 순양함 편성 간격(px)
    cruiserHp: 45,            // 순양함 1척 체력 — 적탄에 피탄되면 깎이고 0이면 격침(노드 시작 시 회복)
    cruiserR: 15,             // 순양함 피탄 반경(px)
    upgradeBonus: 1.25,       // 기함 업그레이드 시 흡수 순양함 화력 × 이 값을 기함에 은행 → 업그레이드가 항상 이득(+25%)
    // 최종 단계(타이탄+순양함 만석)에서 넘치는 드론은 체력이 아니라 포인트(코인)로 전환.
    dronePointCap: 300,       // 최종 상태에서 드론(체력) 상한 — 초과분은 포인트화
    coinPerExcessDrone: 0.5,  // 초과 드론 1기당 코인 (2기 = 1코인)
  },

  // 보급 수송선: 부수면 그 자리에서 드론 지급 — "파괴 = 드론 회수"의 주력 공급원.
  // 난이도(진행도)별로 단단해지고 보상도 커진다.
  pod: {
    perRun: 6,                                   // 한 판 배치 수 (진행도에 고르게)
    small: { hp: 14, reward: 12, r: 15 },
    mid:   { hp: 42, reward: 34, r: 19 },
    large: { hp: 110, reward: 88, r: 24 },
    swayAmp: 46, swayHz: 0.35,                   // 좌우로 천천히 흔들리며 하강
  },

  // 속성 무기 3종 (부록 §2): DPS 총량이 아니라 "모양"을 바꾼다
  weapons: {
    vulcan: { coef: 1.2, speed: 560, spreadDeg: [16, 20, 24] },       // Lv별 확산각 (파워 상향 1.0→1.2: 발칸 빈약 피드백)
    laser: { coef: 1.15, speed: 900, pierce: [3, 3, 4], decay: 0.65 }, // 관통 수, 관통당 감쇠
    homing: { coef: 0.88, rate: 12, speedFrom: 300, speedTo: 480, turnRate: 5, cap: 16 }, // 자동조준 보정 완화(0.56→0.8→0.88: 초반 적을 못 부순다는 피드백으로 10% 상향, 이사)
    lvCoef: [1.0, 1.15, 1.3],
    maxLv: 3,
    // 진화·초진화 강화 진행 속도 늦춤(사용자: 섹터 2에 이미 최종 진화). 베이스 Lv는 그대로,
    // maxLv 도달 후의 진화 사다리(선택·강화)만 이 횟수만큼 캡슐/게이트를 모아야 한 칸 오른다.
    evolveAdvanceCost: 2,
  },

  // 색깔 캡슐: 같은 색 = Lv+1, 다른 색 = 교체(Lv 유지)
  capsule: { radius: 13, driftAmp: 60, driftHz: 0.5 },

  // 보너스 게이트 (진행 50%): 드론 / 무기Lv / 실드
  bonusGate: { progress: 0.5, drones: 40 },

  // 사격형 적 (부록 §4): 적탄은 여유 1.2s+, % 피해, 상한 12발
  enemyShots: { cap: 16, telegraphTime: 0.55 },   // 예고 시간 확대 (A1: 회피 여유) · cap↑=초반 긴장(회피 강제)
  // (사격형 적 HP·피해 1.3배 난이도 상향) — 패턴 다양화: 점사/원형탄/조준탄 변주
  sniper: { hp: 33, enterSpeed: 300, hoverY: 180, stayTime: 5, fireInterval: 1.6, shotSpeed: 260, dmgPct: 0.078, dmgMin: 4, radius: 24,
    burstCount: 3, burstGap: 0.11 },         // 두 번에 한 번 3점사
  turret: { hp: 52, fireInterval: 2.3, shotSpeed: 190, fanDeg: 25, fanCount: 5, dmgPct: 0.052, dmgMin: 3, coin: 5, radius: 26,
    ringCount: 8, ringSpeed: 150 },          // 부채꼴 ↔ 8방향 원형탄 번갈아
  weaver: { hp: 13, y: 160, speed: 150, fireInterval: 0.55, shotSpeed: 260, dmgPct: 0.039, dmgMin: 3, radius: 18,
    aimedEvery: 3 },                         // 3발마다 1발은 편대 조준탄
  brood: { spawnInterval: 2.5 },             // 브루드 캐리어 샤드 사출 주기

  // 신규 일반 적 6종 (스프라이트 B16~B21, PNG 없으면 코드 도형 폴백). 거동이 서로 확연히 다르게.
  newEnemies: {
    bomber:   { hp: 30, r: 28, hoverY: 150, enterSpeed: 150, stay: 4.5, fireInterval: 2.2, count: 7, spreadDeg: 62, speed: 120, dmgPct: 0.05, dmgMin: 4, coin: 4 }, // 광역 융단(넓은 하강 산탄)
    zapper:   { hp: 26, r: 26, hoverY: 140, enterSpeed: 200, stay: 4.5, cycle: 2.2, charge: 0.9, beamShots: 9, beamGap: 0.045, speed: 320, dmgPct: 0.045, dmgMin: 4, coin: 4 }, // 세로 번개 기둥
    orbiter:  { hp: 22, r: 24, orbitR: 66, hz: 0.5, descend: 52, fireInterval: 1.1, speed: 235, dmgPct: 0.04, dmgMin: 3, coin: 3 }, // 원 그리며 조준탄
    shielder: { hp: 46, r: 28, hoverY: 162, enterSpeed: 170, stay: 6, shieldUp: 0.6, shieldDown: 2.6, fireInterval: 1.3, speed: 195, dmgPct: 0.05, dmgMin: 4, coin: 6, shieldReduce: 0.25, hpScaleMul: 0.045 }, // 방패 약화 2차: HP스케일 0.14→0.045(현행 1/3, 여전히 너무 강함 피드백). 감소 25%·켜짐0.6/꺼짐2.6 유지
    carrier:  { hp: 42, r: 24, hoverY: 128, enterSpeed: 140, stay: 6, spawnInterval: 2.6, spawnCount: 2, coin: 6 }, // 소형 드론 사출
    blinker:  { hp: 20, r: 24, blink: 1.25, fireInterval: 1.25, speed: 265, dmgPct: 0.045, dmgMin: 4, coin: 4 }, // 순간이동+조준탄
  },

  powerModule: { duration: 10, multiplier: 2, radius: 14 },

  crystal: {
    radius: 26,
    // 크기 등급별 [최소값, 최대값] — 표시 숫자 = HP = 파괴 시 획득 드론 수
    small: [10, 20],
    mid: [40, 80],
    large: [150, 400],
  },

  gate: {
    width: 110, height: 46,
    passFlashTime: 0.5,
    // 평평한 +/− 게이트 값은 스테이지가 깊을수록 커진다(비율 ×/÷ 는 자기 스케일이라 그대로).
    // → 스테이지마다 게이트의 체감 무게가 비슷하게 유지되고, 후반에도 감점이 유의미하다.
    flatScalePerStage: 0.6,
    flatScaleMax: 6,
  },

  // 기함별 전투 개성 (진화 티어 0~6). 총 DPS(rate×dmg)는 완만히 증가하되 거동이 '확연히' 달라진다:
  //  rate=연사(탄 수), dmg=탄당 위력, spread=벌칸 확산, pierce=관통 보너스. 티어 초과 시 마지막 값 클램프.
  //  차이를 확실히 느끼도록 극단적으로 벌렸다(연사 1.6↔0.8, 확산 0.4↔2.0, 관통 0↔3).
  // 이름은 evolution.names와 1:1(빛의 단계). 각 등급의 뜻이 그 등급의 사격 특성과 맞물린다.
  shipTraits: [
    { tag: '잔광 · 균형형',          rate: 1.00, dmg: 1.00, spread: 1.0,  pierce: 0 }, // T0 꺼진 함대에 남은 마지막 빛 — 부서진 정찰함
    { tag: '섬광 · 고속 연사',        rate: 1.65, dmg: 0.72, spread: 1.25, pierce: 0 }, // T1 번쩍이는 빛 = 탄을 쏟아붓는다
    { tag: '집광 · 집중 화력',        rate: 0.95, dmg: 1.65, spread: 0.4,  pierce: 0 }, // T2 빛을 한 점에 모음 = 좁고 묵직한 한 방
    { tag: '극광 · 광역 사격',        rate: 1.45, dmg: 0.90, spread: 2.1,  pierce: 0 }, // T3 오로라 = 부채꼴로 흩뿌림
    { tag: '백야 · 관통 포격',        rate: 0.85, dmg: 1.55, spread: 0.7,  pierce: 2 }, // T4 밤이 사라진 상태 = 뚫고 나간다
    { tag: '초신성 · 최대 관통·화력',   rate: 0.78, dmg: 2.05, spread: 0.55, pierce: 3 }, // T5 별의 폭발 = 왕관을 부수는 빛
  ],

  creature: {
    // 등급별 HP. 접촉 피해 = max(남은HP x contactMult, 편대수 x contactPct) → 대군이어도 접촉이 아프다
    small: 12, mid: 46, large: 140,
    contactMult: 3,
    contactPct: { small: 0.05, mid: 0.10, large: 0.18 }, // 편대 %비례 피해 (대군 트리비얼 해결)
    bounty: { small: 0, mid: 2, large: 6 },   // 격파 시 드론 회수 (하향)
    radius: { small: 26, mid: 34, large: 46 },   // 시각 확대(B1~B3)에 맞춰 히트박스도 확대(이사: 위→아래 크리처 크게)
    speed: 100,       // 하강 속도 (스크롤에 더해짐)
    homing: 60,       // 편대 방향 유도 속도
  },

  meteor: { radius: 22, hpMin: 8, hpMax: 25, coin: 2 },

  // 파괴 불가 장애물(잔해/소행성) — 쏴도 안 부서짐, 오직 회피. 좌우로 표류하며 내려온다.
  debris: {
    rBig: 44, rHuge: 66,
    rotSpeed: 0.9,        // 회전 (rad/s, ±)
    drift: 62,            // 좌우 표류 속도 (px/s, ± / 벽에서 반사)
    hitCooldown: 0.5,     // 접촉 재피해 간격 (오래 붙으면 계속 깎임)
    contactPct: 0.22, contactMin: 4,  // 접촉 시 편대 %+정액 상실 (contactDamage 상한이 즉사 방지)
  },

  boss: {
    hp: 3500,          // 최소 HP
    hpPerPower: 16,    // 보스 HP=max(hp, 최대화력 x 이 값) — 목표 처치시간에 맞춰 하향 (A4: 강한 함대는 녹임)
    hpPerPowerCap: 40, // 화력 대비 보스 HP 상한 배수 — 과성장해도 보스전이 무한정 길어지지 않게
    radius: 60,
    y: 130,                 // 보스 구간에서 화면 상단 고정 y
    minionInterval: 2.7,    // 소형 크리처 소환 주기(초)
    minionCount: 3,
    shotInterval: 1.8,      // 조준탄 주기(초)
    shotSpeed: 210,
    shotRadius: 10,
    shotDamagePct: 0.078,   // 명중 시 편대의 % 소멸 (아래 최소값 보장)
    shotDamageMin: 6,
    fanInterval: 3.6,       // 5방향 부채꼴 패턴 주기(초)
    fanDeg: 24, fanCount: 5, fanSpeed: 185,
    fanDamagePct: 0.052, fanDamageMin: 4,
    enrageRatio: 0.5,       // HP 50% 이하 광폭화
    enrageRate: 0.6,        // 광폭화 시 발사 주기 배수
    engageRange: 620,       // 편대와 이 거리 안이면 교전 시작
    // 무한 상승: 보스 크기 스테이지 비례 증가 + 다중 보스(2~3기 동시)
    sizePerStage: 0.06, sizeScaleMax: 1.7,   // 크기 = min(1.7, 1 + 0.06×(stage-1))
    multiTotalMult: 1.4,                      // 다중 보스 총 HP 배수(각=이/보스수), 크기 fit 축소
    // 다중 보스는 bossTier(=섹터) 기준(§4.3): 섹터1=단일, 섹터2=2기, 섹터3+=3기 (구 stage 동작 재현).
    multiFromSector2: 2, multiFromSector3: 3,
  },

  chunk: {
    heightPx: 900,  // 청크 1개의 트랙 길이
    perRun: 14,     // 한 판의 청크 수 (뒤에 보스 구간) — 드론을 모으고→바치고→다시 모으는 사이클이 돌게 길게
    tierBounds: [0.3, 0.65], // 진행도 경계: <0.3 easy, <0.65 mid, 이후 hard
  },

  // 전체 난이도 미세 조정 knob (사용자 요청). 적·보스 체력 ×globalMult, 적 발사 주기 ÷globalMult(더 빠름).
  // 1.0 = 기준. 1.38 = 전체 +38%(1.15에서 다시 ×1.2). 곡선은 그대로 두고 체감만 일괄 상하 조정.
  // bossHpMult/bossRateMult = 보스 전용 추가 배수(일반 적 난이도는 적절하다는 피드백 → 보스만 강화).
  //  - 보스는 scaleEnemy를 안 거쳐 globalMult 발사 버프를 못 받았음 → bossRateMult로 별도 보정.
  //  - bossRateMult는 발사 주기 나눗수(클수록 빠르게 쏨).
  difficulty: { globalMult: 1.38, bossHpMult: 1.3, bossRateMult: 1.8, enemyHpMult: 1.3 },   // enemyHpMult=잡몹 HP 전용 30%↑(발사 주기는 불변, 이사 플레이피드백)

  run: {
    failOverlayDelay: 0.5,  // 실패 후 오버레이까지(초)
    coinPerClear: 50,       // (구) 클리어 보상 — Phase C에서 nodeReward로 대체(잔존 참조 없음)
    failBaseCoins: 12,      // 실제 사망 시 기본 보상 (첫 원정 성장 단절 방지)
    coinPerProgress: 30,    // 실제 사망 시 진행도(0~1) x 이 값 추가 (자발적 종료엔 없음)
  },

  // 캠페인·엔드리스 (지시서 Phase D §6). 섹터별 보스 순서 + 엔드리스 보스 순환.
  campaign: {
    sectors: 6,
    bosses: ['B8', 'B9', 'B10', 'B11', 'B22', 'B7'],   // 섹터 1~6 (6=B7 하이브 퀸 = 최종)
    endlessBosses: ['B12', 'B13', 'B14', 'B15', 'B22'],// 캠페인 클리어 후 무한 원정 순환
  },

  // 항로 보상 계약 (지시서 Phase C §5). 노드 코인·모듈·보급/정비 배수.
  nodeReward: {
    // 코인 = baseNodeCoins(sector,col) × 타입 배수. 보스는 별도(높게).
    coinMult: { combat: 1.0, supply: 0.5, hazard: 1.2, elite: 1.8, repair: 0, boss: 2.5 },
    supplyPayoutMult: 1.4,          // 보급 노드에서만 크리스탈·수송선 payout ×1.4 (정확히 한 번)
    eliteDraftCount: 4,             // 정예 드래프트 4택(희귀 1장 이상 보장)
    repairModuleCostPerSector: 25,  // 모듈 정비 비용 = 이 값 × sector
    repairHealMin: 12,              // 긴급 수리 최소 회복
    repairHealPct: 0.35,            // 긴급 수리 = max(12, round(count×0.35))
  },

  // 섹터 분기 맵 (슬레이 더 스파이어식)
  sector: {
    depth: 5,          // 열 깊이 (col 0 진입 ~ col 5 보스 = 6열)
    combatLen: 7,      // 교전/정예 노드 트랙 청크 수
    shortLen: 4,       // 위험/보급/보스 노드 트랙 청크 수
    repairPct: 0.5,    // 정비 노드: 현재 드론의 이 비율만큼 회복(추가)
    repairMin: 20,     // 정비 최소 회복량
  },

  // 보스별 고유 공격 패턴 (스프라이트 ID 기준). fan(부채꼴) 슬롯이 kind별 서명기로 대체된다.
  // shotMult/minionMult = 조준탄·소환 주기 배수 (클수록 느슨), tanky = 보스 HP 배수
  bossPatterns: {
    B7:  { kind: 'brood', minionMult: 0.55, shotMult: 1.25 },                        // 하이브 퀸: 산란 폭주 (소환 45% 더 자주)
    B8:  { kind: 'crescent', volley: 7, volleyDeg: 15, speed: 235, swayMult: 1.7, shotMult: 1.1 }, // 리퍼 로드: 참격 부채 7연발 + 빠른 이동
    B9:  { kind: 'spiral', interval: 0.16, sweepHz: 0.22, sweepDeg: 75, speed: 180, shotMult: 1.4 }, // 볼텍스 마우: 좌우로 쓸어내는 나선 탄류
    B10: { kind: 'pincer', pairs: 3, speed: 240, tanky: 1.2, shotMult: 1.2 },        // 옵시디언 클로: 좌우 집게 협공탄 + 단단한 몸
    B11: { kind: 'ring', count: 12, speed: 165, shotMult: 1.15 },                    // 보이드 세라프: 회전 깃털 원형탄
    // 신규 보스 4종
    B12: { kind: 'cross', arms: 4, spinHz: 0.6, speed: 175, interval: 0.14, shotMult: 1.3 },              // 프리즘 타이런트: 회전 십자 빔
    B13: { kind: 'wave', count: 7, spanW: 260, waveHz: 0.5, phase: 0.6, amp: 0.5, speed: 170, interval: 0.5, shotMult: 1.2 }, // 타이달 리바이어던: 파동 커튼
    // 스톰브링어 융단 폭격 재설계(테스터: 무작위·무의미·저난도): 위험 컬럼 예고 → 안전 컬럼으로 이동 요구 → 밀집 낙하.
    B14: { kind: 'rain', speed: 230, dangerCols: 3, warnSec: 0.85, strikes: 10, perCol: 2, strikeInterval: 0.12, gapSec: 1.3, cols: 7, shotMult: 1.3 },
    B15: { kind: 'laserSweep', stack: 3, sweepHz: 0.35, sweepW: 200, speed: 340, interval: 0.05, shotMult: 1.4 }, // 옵틱 워든: 소탕 레이저
  },

  // 보스 변주: 로스터가 한 바퀴 돈 뒤(스테이지 6+) 같은 보스가 강화판으로 재등장.
  // loop = floor((stage-1)/5). 같은 스프라이트로 시작부터 광폭 + 탄 추가 + 빠른 발사.
  bossVariant: {
    fromStage: 13, suffixes: ['', ' II', ' III', ' IV', ' V'],   // 변이판은 섹터3 보스(stage18)+ (첫 보스는 기본형)
    hpPerLoop: 0.12,        // loop당 HP +12%
    fasterPerLoop: 0.1,     // loop당 발사·소환 주기 배수 -0.1(빠름), minFaster 하한
    minFaster: 0.55,
    fanBonusPerLoop: 2,     // loop당 서명 공격 탄 수 +2
    // 바퀴마다 보스 색상 회전(hue-rotate deg) — loop 0=0(기본), 이후 순환. "5종 반복" 체감 완화.
    loopHues: [0, 140, 260, 60, 200, 320],
  },

  // 중간보스: 직전 스테이지 보스가 트랙 중반에 일반 적처럼 등장해 지나간다 (스테이지 2+).
  // 격파 = 드론 대량 회수, 놓치면 그냥 통과 (패널티 없음)
  midboss: {
    progress: 0.55,          // 트랙 진행 55% 지점에서 등장
    hpMin: 900, hpPerPower: 4, // HP = max(hpMin, 그 시점 최대 총화력 x 4) — 집중 사격 3~5초감
    speedRatio: 0.35, ownSpeed: 42, // 하강 = 스크롤 x 비율 + 자체 속도 (화면 통과 약 7초)
    swayAmp: 90, swayHz: 0.3,
    shotInterval: 2.2, dmgPct: 0.06, dmgMin: 4,
    contactPct: 0.25, contactSelfDmg: 250, contactCooldown: 1.0, // 부딪히면 서로 아프고 통과
    rewardDrones: 24, rewardDronesPerStage: 6, coin: 30,
    radius: 46,
  },

  // 보스 격파 연출: 파괴 애니메이션 → 우주선 통과 → 클리어
  // 연쇄 폭발 단계. 섹터 보스는 컷신으로 길게(sectorDuration) 보여준다 — 격침되는 보스를 두고
  // 기함이 빠져나가는 그림(이사 요청). sink*=침몰 표현, letterbox=시네마 띠 높이 비율.
  bossDeath: { duration: 1.8, sectorDuration: 3.2, chainInterval: 0.13, sinkDrift: 52, sinkRoll: 0.42, letterbox: 0.1 },
  flythrough: { startV: 140, accel: 1100, exitY: -90, invuln: 0.5 }, // 우주선 상승 통과 (invuln=클리어 통과 중 무적 유지 floor초)

  // ── Gate 1: 8분 핵심 재미 수직 슬라이스 (전면개편 §5) ──────────
  // 시간 기반 사건·무기 슬롯·공명·기함 내구도·지휘 프레임의 튜닝값. 로직은 역할별 모듈.
  gate1: {
    // 8분 타임라인 계약(§5.1). 초 단위. 허용오차 ±15s(첫 공명은 별도 창).
    timeline: {
      firstBehaviorUpgrade: 30,   // 0:30 첫 행동 변화 (통과창 25~45)
      secondWeapon: 75,           // 1:15 두 번째 무기 (통과창 60~90)
      hullTier1: 135,             // 2:15 H1 승급
      resonanceTelegraph: 210,    // 3:30 첫 공명/진화 예고
      firstResonance: 270,        // 4:30 첫 공명 완성 (확정창 255~285)
      framePick: 330,             // 5:30 지휘 프레임 / H2
      eliteWave: 390,             // 6:30 정예 웨이브
      bossStart: 430,             // 7:10 검증 보스
      resultAt: 480,              // 8:00 결과 요약
      behaviorInterval: 40,       // 행동 변화 사건 간격(중앙값 30~50 목표)
      tolerance: 15,              // 일반 사건 허용 오차(초)
    },
    // 무기 슬롯(§5.3). Gate 1은 main·wing 2슬롯.
    loadout: {
      slots: ['main', 'wing'],
      wingUnlockSec: 75,          // wing 슬롯 해금 시점(런디렉터 secondWeapon과 동기)
      // 두 하드포인트 오프셋(px, 기함 중심 기준) — 마운트 동시 표시
      hardpointX: { main: 0, wing: 22 },
      wingDpsScale: 0.5,          // wing 무기 직접사격 DPS 배수(두 번째 무기는 가산 보상, 총량 완만↑)
    },
    // 무기 조합 공명 3종(§5.4). 발동은 피해배수만 금지 — 모양·표적·소리 중 2+ 변화.
    resonance: {
      railStorm:  { pair: ['vulcan', 'laser'],  chargePerHit: 1, threshold: 18, cooldown: 0.14, dmgFrac: 65, width: 36, pierce: 8 }, // 발칸·레이저 명중 누적→관통 레일
      microMissile: { pair: ['vulcan', 'homing'], chargePerHit: 1, threshold: 44, cooldown: 0.6, count: 6, dmgFrac: 3.9 },            // 발칸·유도 명중 누적→소형 미사일 묶음 분산추적
      seekerBeam: { pair: ['laser', 'homing'],  markDuration: 2.8, cooldown: 0.5, missileBonus: 2.0 },                                // 레이저 표식→미사일 우선추적·증폭, 파괴 시 표식 이동
      minFirstAt: 255, maxFirstAt: 285,  // 첫 공명 확정 완성 창
      telegraphLead: 30,                 // 완성 전 예고 시간(20~40s 창의 중앙)
    },
    // 기함 내구도·함대 자원 분리(§5.6). 권장 초기값(고정답 아님).
    survivability: {
      hullMax: 100,                      // 기함 내구도 기본 최대
      hullMaxPerTier: 22,                // H0~H5 승급당 최대치 증가
      tierHealFrac: 0.5,                 // 승급 시 회복 = 최대치 증가분의 이 비율(만피 금지)
      dmgNormalShot: 8,                  // 일반 적탄 내구도 피해(6~10)
      dmgEliteShot: 16,                  // 정예·보스 주요탄(12~20)
      dmgCollision: 22,                  // 충돌·레이저 경고 실패(18~28)
      repairFrac: 0.20,                  // 제한 수리 = 최대치의 15~25%
      hitInvuln: 0.6,                    // 내구도 피격 후 짧은 무적(밀집 피격 순삭 방지, 회피 여지)
      measureHullMax: 1400,              // 측정 하네스 전용 내구도(헤드리스 자동회피 보정). 실제 플레이는 hullMax(100).
      emergencyRebuildMax: 1,            // 긴급 재건 출격당 최대 횟수
      emergencyRebuildCruisers: 3,       // 긴급 재건 시 복구 순양함 수
      emergencyRebuildHullCost: 10,      // 긴급 재건 비용(내구도)
      emergencyRebuildAtFrac: 0.3,       // 내구도가 최대치의 이 비율 아래로 처음 떨어지면 1회 자동 발동
    },
    // 지휘 프레임 3종(§5.7). 교리 3종을 흡수. auto=자동 스킬.
    frames: {
      assault: { doctrine: 'lance',  name: '어썰트', icon: '⚔', glow: '#ff5c2a', auto: { killsPerProc: 24, name: '전방 집중', focusDmgMult: 1.6, focusDuration: 3 } },
      carrier: { doctrine: 'swarm',  name: '캐리어', icon: '🛰', glow: '#3fd0f5', auto: { intervalSec: 8, name: '호위 동기화', volleyMult: 1.5 } },
      phase:   { doctrine: 'phase',  name: '페이즈', icon: '◈', glow: '#b44cff', auto: { flowThreshold: 100, name: '위상 돌파', dashInvuln: 0.6 } },
    },
    // 사람 플레이 생존 곡선(Codex 관찰: 초보가 1:15 사망). 초반 유예 + 시간 램프로 8분 완주 가능하게.
    play: {
      introSec: 55,         // 첫 구간: 사격 적 없이 이동·크리스탈 수집만(조작 학습)
      graceSec: 150,        // 이 시각 이전엔 기함 내구도 피해 경감(조작 학습 유예)
      graceDmgMult: 0.25,   // 유예 중 내구도 피해 배수
      rampMidSec: 150,      // 스트림 밀도 램프: <150s 경량(1기), <320s 중간(2기), 이후 최대(3기)
      rampLateSec: 320,
    },
    // 보스 TTK 목표(§5.8): 세 빌드 모두 B22를 45~60초에 잡게 한다. HP·탄수만 늘리는 벽 금지 — 계수·패턴으로 만든다.
    //  방식: 고정 HP(avgDps×avgDpsMult)로 대략의 중심을 잡고 양측 클램프가 원정별 편차를 흡수한다.
    //  (1) 하한 dpsCap: 실제 HP 감소 기준 초당 상한 → 고DPS 빌드 순삭 방지(TTK 하한 minTTKSec).
    //  (2) 상한 enrage: enrageStart 넘기면 보스 피격 피해가 초당 ramp만큼 증폭 → HP가 좀 높게 잡혀도 ~57초엔 끝난다.
    //   HP를 등장 후 재보정하던 방식은 폐기(STAGGER 분모·BREAK 배수와 얽힘, Codex 3차). 클램프만으로 밴드에 안착.
    bossTtk: { b22Min: 45, b22Max: 60, b7Min: 60, b7Max: 90, avgDpsMult: 98, minTTKSec: 47, enrageStartSec: 47, enrageRampPerSec: 2.5 },
  },

  // ═══ Gate 2 (전면개편 §7): 25분 6지역 시간 기반 캠페인 ═══
  //  Gate 1(8분 하네스)의 검증된 시스템(로드아웃·공명·내구도·프레임·보스 클램프)을 실전 25분 캠페인으로 승격한다.
  //  각 지역은 startSec에 진입, bossSec에 지역 보스 등장(끝은 다음 지역 진입 또는 totalSec). 노드형 맵은 폴백 보존.
  gate2: {
    totalSec: 1500,               // 25분
    introSec: 10,                 // 0~10초 출격(크리스탈 수집·조작 학습) → 10초에 첫 지역 전투 시작(이사 요청: 도입부 단축)
    // §7.1 6개 지역. boss는 §7.5 처치시간 목표. backdrop=섹터 배경 인덱스(1~6, Gate 0 R2 매핑).
    regions: [
      { i: 1, id: 'coldWake',     name: 'COLD WAKE',     startSec: 10,   bossSec: 200,  boss: 'B8',  backdrop: 1, bossTtk: [30, 45] },
      { i: 2, id: 'prismGrave',   name: 'PRISM GRAVE',   startSec: 240,  bossSec: 440,  boss: 'B9',  backdrop: 2, bossTtk: [30, 45] },
      { i: 3, id: 'furnaceLine',  name: 'FURNACE LINE',  startSec: 480,  bossSec: 680,  boss: 'B10', backdrop: 3, bossTtk: [30, 45] },
      { i: 4, id: 'brokenArmada', name: 'BROKEN ARMADA', startSec: 720,  bossSec: 920,  boss: 'B11', backdrop: 4, bossTtk: [30, 45] },
      { i: 5, id: 'choirVeil',    name: 'CHOIR VEIL',    startSec: 960,  bossSec: 1140, boss: 'B22', backdrop: 5, bossTtk: [45, 60] },
      { i: 6, id: 'crownCore',    name: 'CROWN CORE',    startSec: 1200, bossSec: 1380, boss: 'B7',  backdrop: 6, bossTtk: [60, 90] },
    ],
    // 함체 승급 시각(§7.3 H1~H5). 기능 변화는 G2-B에서 배선. at=승급 발동 시각(초).
    hullTiers: [
      { tier: 1, at: 135 },    // 섹터1
      { tier: 2, at: 360 },    // 섹터2
      { tier: 3, at: 600 },    // 섹터3
      { tier: 4, at: 1020 },   // 섹터5
      { tier: 5, at: 1260 },   // 섹터6 타이탄
    ],
    secondWeaponSec: 90,          // 1~4분 두 번째 무기(§7.1)
    fleetTelegraphSec: 660,       // 섹터3 세 번째 슬롯 예고(§7.1)
    fleetSlotSec: 780,            // 섹터4(12~16분) 함대 슬롯 해금(§7.2, 배선 G2-C)
    firstResonanceSec: 330,       // 섹터2 첫 공명
    secondResonanceSec: 840,      // 섹터4 두 번째 공명
    framePickSec: 540,            // 섹터3 지휘 프레임 자동 스킬
    finalWeaponEvoSec: 1050,      // 섹터5 최종 무기 진화
    apexSec: 1290,                // 섹터6 Apex(§7.3 T5)
    pathChoiceSec: [240, 480, 720, 960, 1200],  // ~4분마다 큰 경로 선택(§7.4, 배선 G2-D)
    behaviorInterval: 45,         // 행동 변화 사건 간격(§7.1 지속 성장 체감)
    resultSec: 1500,              // 25분 결과(B7 처치=완결점)
    // §7.3 함체 T0~T5 기능 변화: 발사 개성은 shipTraits가 담당하고, 여기선 승급마다 '추가로' 얻는 기능(누적).
    //  index=tier(0=T0 정찰정 … 5=T5 타이탄). move=이동 반응, resonPower=공명 증폭, sideGuns=측면 포대 문수, apex=최종 지배기.
    hullFn: [
      { move: 1.00, resonPower: 1.00, sideGuns: 0, apex: false, label: '기본 주포·소형 드론' },   // T0 정찰정
      { move: 1.28, resonPower: 1.00, sideGuns: 0, apex: false, label: '이동 반응 강화' },         // T1 인터셉터
      { move: 1.28, resonPower: 1.30, sideGuns: 0, apex: false, label: '공명 회로 증폭' },         // T2 스트라이커
      { move: 1.40, resonPower: 1.30, sideGuns: 0, apex: false, label: '호위 편대 확장' },         // T3 캐리어(함대 슬롯=G2-C)
      { move: 1.40, resonPower: 1.45, sideGuns: 2, apex: false, label: '대형 측면 포대' },         // T4 드레드노트
      { move: 1.50, resonPower: 1.60, sideGuns: 2, apex: true,  label: 'Apex · 화면 지배' },       // T5 타이탄
    ],
    apexIntervalSec: 8.5,         // 타이탄 Apex 주기(초): 적탄 소거 + 광역 대미지 펄스
    apexDamageFrac: 0.06,         // Apex 펄스 피해 = 보스 maxHp의 이 비율(적은 즉사)
    sideGunIntervalSec: 0.5,      // 측면 포대 발사 주기(초)
    sideGunDmgFrac: 0.5,          // 측면 포대 1문 피해 = 주무기 기준 이 비율
    // §7.2 세 번째 슬롯 = 함대 시스템. 첫 시스템=전투기 편대(자율 조준·독립 사격, 주포 복제 아님).
    //  기함 앞 편대 대형을 유지하며 사거리 내 적을 스스로 조준. 볼트는 sourceWeaponId 'fleet'로 별도 집계(공명 미충전).
    fleet: {
      systemId: 'fighters',       // 첫 함대 시스템 식별자(향후 기뢰·지원빔·방어드론 확장 여지)
      label: '전투기 편대',
      count: 3,                   // 전투기 문수
      dmgFrac: 0.40,             // 전투기 볼트 1발 피해 = 기함 flagPower 기준 비율
      fireInterval: 0.66,         // 전투기 1기 발사 주기(초)
      range: 540,                // 자율 조준 사거리(px)
      boltSpeed: 580,            // 전투기 볼트 속도(px/s)
      followLerp: 7,             // 편대 위치 추종 계수(높을수록 빠릿)
      bob: 7,                    // 편대 상하 부유 진폭(px)
      color: '#7dffb0',          // 전투기·볼트 색(아군 청록그린 — 발칸/레이저/호밍과 구분)
      formation: [[-52, -26], [52, -26], [0, -58]],  // 기함 기준 편대 오프셋 [dx,dy] (count까지 사용)
    },
    // §7.4 ~4분마다 큰 경로 선택(pathChoiceSec 5회). 각 선택은 2택, 각 옵션이 최소 2개 축을 바꾼다(가짜 분기 금지).
    //  축: enemyRateMult(다음 구간 밀도=위험/보상)·hullHeal(수리)·weaponLv(무기 강화)·resonCharge(공명 가속)·droneGain(호위=보상)·shield(방어).
    pathChoices: [
      { a: { id: 'siege',      label: '강습 항로',      desc: '다음 구간 적 밀도 ↑ · 호위 편대 +8',   mods: { enemyRateMult: 1.40, droneGain: 8 } },
        b: { id: 'refit',      label: '정비 항로',      desc: '기함 내구도 +30% · 다음 구간 적 밀도 ↓', mods: { hullHeal: 0.30, enemyRateMult: 0.82 } } },
      { a: { id: 'overcharge', label: '과충전 항로',    desc: '주무기 강화 · 공명 충전 가속',           mods: { weaponLv: 1, resonCharge: 0.5 } },
        b: { id: 'bulwark',    label: '방벽 항로',      desc: '기함 내구도 +25% · 보호막 전개',         mods: { hullHeal: 0.25, shield: true } } },
      { a: { id: 'supply',     label: '보급 항로',      desc: '호위 편대 +12 · 내구도 +20%',           mods: { droneGain: 12, hullHeal: 0.20 } },
        b: { id: 'elitehunt',  label: '정예 사냥 항로', desc: '적 밀도 ↑ · 주무기 강화',               mods: { enemyRateMult: 1.35, weaponLv: 1 } } },
      { a: { id: 'blitz',      label: '속공 항로',      desc: '적 밀도 ↑ · 공명 충전 가속',            mods: { enemyRateMult: 1.45, resonCharge: 0.6 } },
        b: { id: 'steady',     label: '안정 항로',      desc: '기함 내구도 +30% · 호위 편대 +8',       mods: { hullHeal: 0.30, droneGain: 8 } } },
      { a: { id: 'allout',     label: '총력 항로',      desc: '주무기 강화 · 호위 편대 +10',           mods: { weaponLv: 1, droneGain: 10 } },
        b: { id: 'fortress',   label: '요새 항로',      desc: '기함 내구도 +40% · 보호막 전개',         mods: { hullHeal: 0.40, shield: true } } },
    ],
    pathFallbackDrones: 6,   // 상한(만피·최대레벨 등)으로 무효화된 경로 mod 1건당 대체 혜택(호위 편대) — 2축 계약 보존
    // §7.5 지역별 적 구성: "적은 HP 벽이 아니라 빌드 시험지". 지역마다 다른 역할 조합으로 다른 빌드 측면을 시험한다.
    //  index = region.i-1 (지역 1~6). pool = 전투 스트림 적 종류(순환), elite = 정예 웨이브 종류. 전부 pending 스폰 가능 타입.
    // pool = 전투 스트림 종류(자유), elite = 정예 웨이브 종류. elite는 정예 변이 스케일을 '1회만' 렌더하는 타입만 허용(creature·turret).
    //  charger는 draw가 확대된 this.r + 캔버스 spriteScale로 이중 스케일(Codex G2-E 3차), 그 외(sniper 등)는 spriteScale 무시(2차) → 제외.
    regionThreat: [
      { label: '경량 군집 · 이동/광역',   pool: ['creature', 'weaver'],                            elite: 'creature' }, // 1 COLD WAKE — 기초
      { label: '저격·포탑 · 우선 표적',    pool: ['sniper', 'turret', 'weaver'],                    elite: 'turret' },   // 2 — 표적 선택
      { label: '장갑·방패 · 표적 순서',    pool: ['shielder', 'charger', 'turret'],                 elite: 'turret' },   // 3 FURNACE LINE — 관통/순서
      { label: '모선·궤도 · 광역/전개',    pool: ['carrier', 'orbiter', 'weaver'],                  elite: 'creature' }, // 4 BROKEN ARMADA — 광역
      { label: '전격·점멸 · 위치 선정',    pool: ['zapper', 'blinker', 'bomber'],                   elite: 'creature' }, // 5 CHOIR VEIL — 기동
      { label: '총력 혼성 · 모든 시험',    pool: ['weaver', 'turret', 'shielder', 'orbiter', 'blinker'], elite: 'turret' },   // 6 CROWN CORE — 종합
    ],
    eliteWaveSec: 100,   // §7.5 지역 정예 웨이브 주기(초): 현재 지역 elite 타입을 정예 변이(★ 3.2×HP)로 스폰 → 4~8초 처치 역할
    behaviorOverflowPower: 55,   // 무기 유한 스텝 소진 후(후반) 행동 변화 사건마다 소폭 화력(banked) 성장 — 25분 내내 성장 유지(Codex 홀리스틱)
  },

  // 격납고: 코인으로 사는 영구 강화. 벽에 막히면 강화로 미는 게임 루프의 완성 조각.
  hangar: {
    costGrowth: 1.6,        // 레벨당 비용 배수
    maxLv: 10,
    upgrades: {
      drones: { name: '시작 드론 수', desc: '출격 시 보유 드론 증가', base: 60, step: 2, unit: '기' },
      dmg: { name: '공격력', desc: '탄환 1발의 피해 증가', base: 90, step: 0.1, unit: '' },
      rate: { name: '연사력', desc: '초당 발사 횟수 증가', base: 90, step: 0.2, unit: '/s' },
      coin: { name: '코인 획득량', desc: '획득 코인 증가', base: 50, step: 0.1, unit: 'x' },
    },
  },
};
