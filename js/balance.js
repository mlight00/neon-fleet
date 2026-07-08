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
    maxWidth: 120,   // 편대 최대 반폭
  },

  bullet: { speed: 620, radius: 3, cap: 400 },

  // 경제 조정: 드론 획득 총량 배수 (크리스탈·수송선). 낮추면 진화가 느려지고 난이도가 오른다.
  // enemyHpPowerScale: 적 HP를 함대 화력(maxPower)에 비례. 클수록 완만(내 DPS가 앞서 = 파워판타지).
  // enemyHpPowerCap: 비례 상한 — 이 배수를 넘으면 더 안 단단해져 강해질수록 쓸어버리는 손맛 (STG rank 완화).
  economy: { droneGainMult: 0.5, enemyHpPowerScale: 110, enemyHpPowerCap: 6 },   // 드론 획득 하향(0.7→0.5): 너무 쉽게 안 모이게

  // 차지 랜스 (홀드→충전→발사): 자동사격을 멈추고 에너지를 모아 정면 관통 빔 발사
  charge: {
    stageTime: 0.5,                    // 단계당 충전 시간(초)
    maxStage: 3,                       // 기본 최대 단계 (과부하 모듈로 +1)
    minStageToFire: 1,                 // 이 단계 미만이면 발사 안 함 (오클릭 안전)
    blastCoef: 0.47,                   // 랜스 피해 = power × blastCoef × stageMult[stage] (1/3로 너프)
    stageMult: [0, 1, 2.4, 4.2, 6.5],  // stage 1..4 (index 0 미사용)
    width: [0, 26, 40, 56, 78],        // 빔 반폭 by stage
  },

  // 적 스폰 배수: 트랙의 적 항목(크리처/저격/포탑/위버)을 이 배수만큼 복제 (미러 배치)
  spawn: { enemyMult: 2 },

  // 엘리트 변이(어픽스): 적에 특성을 붙여 같은 적을 다양하게. 색 오라+아이콘으로 표시.
  // 로직은 affixes.js, 여기엔 수치·표시만. 스테이지 깊을수록 자주·중첩된다.
  affix: {
    baseChance: 0.08, chancePerStage: 0.06, chanceCap: 0.55,
    twoAffixStage: 6,                                     // 이 스테이지부터 최대 2개 중첩
    defs: {
      swift:  { name: '가속',   icon: '»', color: '#ff9c41', spd: 1.6, fire: 0.7 },  // 빠른 이동/발사
      shield: { name: '보호막', icon: '◈', color: '#3fd0f5', charges: 1 },           // 첫 피격 무효
      split:  { name: '분열',   icon: '✶', color: '#b44cff', count: 2 },             // 죽으면 소형 분열
      toxic:  { name: '독성',   icon: '☣', color: '#7cff4c', contact: 1.7 },         // 접촉 피해 증가
      elite:  { name: '엘리트', icon: '★', color: '#ffd93d', hp: 3.2, radius: 1.35, bounty: 6, coin: 8 }, // 단단·대박
      magnet: { name: '자성탄', icon: '◎', color: '#ff4cd2', homing: 3.2 },          // 탄이 편대 유도
    },
  },

  // 돌진병: 예고 후 편대를 향해 급강하 (회피 타이밍 게임)
  charger: { hp: 30, enterSpeed: 95, dashSpeed: 540, telegraph: 0.7, hoverY: 150, contactPct: 0.14, contactMin: 6, coin: 4, bounty: 2, radius: 15 },
  // 기뢰: 천천히 떠다니다 가까우면 폭발 (가만히 못 있게 만듦)
  mine: { hp: 10, descent: 55, sway: 34, swayHz: 0.4, armRadius: 115, fuse: 0.55, blastRadius: 92, dmgPct: 0.12, dmgMin: 8, coin: 3, radius: 13 },

  // 함선 진화 (드론 소모형): 비용에 도달하면 모은 드론 전량이 기함의 재료로 흡수된다.
  // 진화 후엔 기본 호위(시작 드론 수)만 재사출 — 다음 진화는 처음부터 다시 모은다.
  evolution: {
    // 파괴 보상(수송선·현상금) 추가로 드론 공급이 늘어난 만큼 비용 상향 (한 판에 2~3회 사이클 유지)
    costs: [0, 110, 250, 500, 860, 1350],        // costs[t] = 티어 t 도달 비용 (진화 덜 자주 = 상향)
    names: ['스카웃', '인터셉터', '스트라이커', '커리어', '드레드노트', '타이탄'],
    // 기함 자체 화력 (드론 환산치): 흡수한 드론들이 기함 파워로 영구 전환된다.
    // 총 화력 = 드론 수 + shipPower[티어] → 진화 직후에도 화력이 꺾이지 않게 직전 비용 합산 수준으로 설정.
    shipPower: [0, 85, 275, 660, 1350, 2450],
    // 진화 후 재편성: 흡수량의 25%가 새 호위대로 재사출 (최소 시작 드론 수) — 나머지는 기함의 재료로 소멸
    retainRatio: 0.25,
    // 최고 티어 후 '오버로드': 이만큼 더 모아 바치면 모듈 1개 더 획득 + 기함 파워 상승 (무한 성장 = 무한 심연 연결점)
    overloadCost: 1200,
    overloadPower: 320,
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
    vulcan: { coef: 1.0, speed: 560, spreadDeg: [16, 20, 24] },       // Lv별 확산각
    laser: { coef: 1.15, speed: 900, pierce: [3, 3, 4], decay: 0.65 }, // 관통 수, 관통당 감쇠
    homing: { coef: 0.7, rate: 12, speedFrom: 300, speedTo: 480, turnRate: 5, cap: 16 },
    lvCoef: [1.0, 1.15, 1.3],
    maxLv: 3,
  },

  // 색깔 캡슐: 같은 색 = Lv+1, 다른 색 = 교체(Lv 유지)
  capsule: { radius: 13, driftAmp: 60, driftHz: 0.5 },

  // 보너스 게이트 (진행 50%): 드론 / 무기Lv / 실드
  bonusGate: { progress: 0.5, drones: 40 },

  // 사격형 적 (부록 §4): 적탄은 여유 1.2s+, % 피해, 상한 12발
  enemyShots: { cap: 12, telegraphTime: 0.55 },   // 예고 시간 확대 (A1: 회피 여유)
  // (사격형 적 HP·피해 1.3배 난이도 상향) — 패턴 다양화: 점사/원형탄/조준탄 변주
  sniper: { hp: 33, enterSpeed: 300, hoverY: 180, stayTime: 5, fireInterval: 1.6, shotSpeed: 260, dmgPct: 0.078, dmgMin: 4, radius: 14,
    burstCount: 3, burstGap: 0.11 },         // 두 번에 한 번 3점사
  turret: { hp: 52, fireInterval: 2.3, shotSpeed: 190, fanDeg: 25, fanCount: 5, dmgPct: 0.052, dmgMin: 3, coin: 5, radius: 16,
    ringCount: 8, ringSpeed: 150 },          // 부채꼴 ↔ 8방향 원형탄 번갈아
  weaver: { hp: 13, y: 160, speed: 150, fireInterval: 0.55, shotSpeed: 260, dmgPct: 0.039, dmgMin: 3, radius: 11,
    aimedEvery: 3 },                         // 3발마다 1발은 편대 조준탄
  brood: { spawnInterval: 2.5 },             // 브루드 캐리어 샤드 사출 주기

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
  shipTraits: [
    { tag: '스카웃 · 균형',            rate: 1.00, dmg: 1.00, spread: 1.0, pierce: 0 }, // T1 기본
    { tag: '인터셉터 · 쾌속연사(탄막)',  rate: 1.65, dmg: 0.72, spread: 1.25, pierce: 0 }, // T2 탄을 쏟아붓는다
    { tag: '스트라이커 · 집중포화(고화력)', rate: 0.95, dmg: 1.65, spread: 0.4, pierce: 0 }, // T3 좁고 묵직한 한 방
    { tag: '커리어 · 광역산탄(넓게)',    rate: 1.45, dmg: 0.90, spread: 2.1, pierce: 0 }, // T4 부채꼴로 흩뿌림
    { tag: '드레드노트 · 관통포(꿰뚫음)', rate: 0.85, dmg: 1.55, spread: 0.7, pierce: 2 }, // T5 적 3기 관통
    { tag: '타이탄 · 초중포(관통·최대)',  rate: 0.78, dmg: 2.05, spread: 0.55, pierce: 3 }, // T6 4기 관통 대구경
  ],

  creature: {
    // 등급별 HP. 접촉 피해 = max(남은HP x contactMult, 편대수 x contactPct) → 대군이어도 접촉이 아프다
    small: 12, mid: 46, large: 140,
    contactMult: 3,
    contactPct: { small: 0.05, mid: 0.10, large: 0.18 }, // 편대 %비례 피해 (대군 트리비얼 해결)
    bounty: { small: 0, mid: 2, large: 6 },   // 격파 시 드론 회수 (하향)
    radius: { small: 12, mid: 20, large: 32 },
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
  },

  chunk: {
    heightPx: 900,  // 청크 1개의 트랙 길이
    perRun: 14,     // 한 판의 청크 수 (뒤에 보스 구간) — 드론을 모으고→바치고→다시 모으는 사이클이 돌게 길게
    tierBounds: [0.3, 0.65], // 진행도 경계: <0.3 easy, <0.65 mid, 이후 hard
  },

  run: {
    failOverlayDelay: 0.5,  // 실패 후 오버레이까지(초)
    coinPerClear: 50,       // 클리어 보상 = 이 값 x 스테이지 번호
    coinPerProgress: 20,    // 실패 시 진행도 x 이 값
  },

  // 보스별 고유 공격 패턴 (스프라이트 ID 기준). fan(부채꼴) 슬롯이 kind별 서명기로 대체된다.
  // shotMult/minionMult = 조준탄·소환 주기 배수 (클수록 느슨), tanky = 보스 HP 배수
  bossPatterns: {
    B7:  { kind: 'brood', minionMult: 0.55, shotMult: 1.25 },                        // 하이브 퀸: 산란 폭주 (소환 45% 더 자주)
    B8:  { kind: 'crescent', volley: 7, volleyDeg: 15, speed: 235, swayMult: 1.7, shotMult: 1.1 }, // 리퍼 로드: 참격 부채 7연발 + 빠른 이동
    B9:  { kind: 'spiral', interval: 0.16, sweepHz: 0.22, sweepDeg: 75, speed: 180, shotMult: 1.4 }, // 볼텍스 마우: 좌우로 쓸어내는 나선 탄류
    B10: { kind: 'pincer', pairs: 3, speed: 240, tanky: 1.2, shotMult: 1.2 },        // 옵시디언 클로: 좌우 집게 협공탄 + 단단한 몸
    B11: { kind: 'ring', count: 12, speed: 165, shotMult: 1.15 },                    // 보이드 세라프: 회전 깃털 원형탄
  },

  // 보스 변주: 로스터가 한 바퀴 돈 뒤(스테이지 6+) 같은 보스가 강화판으로 재등장.
  // loop = floor((stage-1)/5). 같은 스프라이트로 시작부터 광폭 + 탄 추가 + 빠른 발사.
  bossVariant: {
    fromStage: 6, suffixes: ['', ' II', ' III', ' IV', ' V'],
    hpPerLoop: 0.12,        // loop당 HP +12%
    fasterPerLoop: 0.1,     // loop당 발사·소환 주기 배수 -0.1(빠름), minFaster 하한
    minFaster: 0.55,
    fanBonusPerLoop: 2,     // loop당 서명 공격 탄 수 +2
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
  bossDeath: { duration: 1.8, chainInterval: 0.13 }, // 연쇄 폭발 단계
  flythrough: { startV: 140, accel: 1100, exitY: -90 }, // 우주선 상승 통과

  // 격납고: 코인으로 사는 영구 강화. 벽에 막히면 강화로 미는 게임 루프의 완성 조각.
  hangar: {
    costGrowth: 1.6,        // 레벨당 비용 배수
    maxLv: 10,
    upgrades: {
      drones: { name: '시작 편대', desc: '출격 시 드론 수', base: 60, step: 2, unit: '기' },
      dmg: { name: '공격력', desc: '탄환 데미지', base: 90, step: 0.1, unit: '' },
      rate: { name: '발사 속도', desc: '드론당 초당 발사 수', base: 90, step: 0.2, unit: '/s' },
      coin: { name: '수익 회로', desc: '코인 획득량', base: 50, step: 0.1, unit: 'x' },
    },
  },
};
