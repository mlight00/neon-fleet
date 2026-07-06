// 모든 밸런스 수치의 단일 소스. 로직 없음 — 여기 숫자만 바꿔서 게임을 조정한다.
export const BAL = {
  logicalW: 480,

  scrollSpeed: 220,          // 초당 px
  scrollSpeedLateBonus: 1.1, // 판 후반(진행 70%~) 속도 배율

  squad: {
    start: 8,        // 시작 드론 수
    fireRate: 2,     // 드론 1기당 초당 발사 수
    damage: 1,       // 탄환 1발 데미지
    drawCap: 60,     // 개별 드론 렌더 상한 (초과 시 무리 고정 + 숫자)
    contactCapPct: 0.6, // 접촉 1회 최대 손실 = 편대의 60% (소편대 한 방 전멸 방지)
    radius: 7,       // 드론 반지름
    followSpeed: 9,  // targetX 추적 반응 (클수록 민첩)
    laneMargin: 30,  // 트랙 좌우 여백
    maxWidth: 120,   // 편대 최대 반폭
  },

  bullet: { speed: 620, radius: 3, cap: 400 },

  // 함선 진화 (드론 소모형): 비용에 도달하면 모은 드론 전량이 기함의 재료로 흡수된다.
  // 진화 후엔 기본 호위(시작 드론 수)만 재사출 — 다음 진화는 처음부터 다시 모은다.
  evolution: {
    costs: [0, 60, 140, 280, 500, 800],          // costs[t] = 티어 t 도달 비용 (한 판에 2~3회 진화 사이클 목표)
    names: ['스카웃', '인터셉터', '스트라이커', '커리어', '드레드노트', '타이탄'],
    // 기함 자체 화력 (드론 환산치): 흡수한 드론들이 기함 파워로 영구 전환된다.
    // 총 화력 = 드론 수 + shipPower[티어] → 진화 직후에도 화력이 꺾이지 않게 직전 비용 합산 수준으로 설정.
    shipPower: [0, 65, 210, 490, 970, 1700],
    // 진화 후 재편성: 흡수량의 25%가 새 호위대로 재사출 (최소 시작 드론 수) — 나머지는 기함의 재료로 소멸
    retainRatio: 0.25,
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
  enemyShots: { cap: 12, telegraphTime: 0.4 },
  // (사격형 적 HP·피해 1.3배 난이도 상향)
  sniper: { hp: 33, enterSpeed: 300, hoverY: 180, stayTime: 5, fireInterval: 1.6, shotSpeed: 260, dmgPct: 0.078, dmgMin: 4, radius: 14 },
  turret: { hp: 52, fireInterval: 2.3, shotSpeed: 190, fanDeg: 25, fanCount: 5, dmgPct: 0.052, dmgMin: 3, coin: 5, radius: 16 },
  weaver: { hp: 13, y: 160, speed: 150, fireInterval: 0.55, shotSpeed: 260, dmgPct: 0.039, dmgMin: 3, radius: 11 },
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
  },

  creature: {
    // 등급별 HP. 접촉 피해 = max(남은HP x contactMult, 편대수 x contactPct) → 대군이어도 접촉이 아프다
    small: 12, mid: 46, large: 140,
    contactMult: 3,
    contactPct: { small: 0.05, mid: 0.10, large: 0.18 }, // 편대 %비례 피해 (대군 트리비얼 해결)
    radius: { small: 12, mid: 20, large: 32 },
    speed: 100,       // 하강 속도 (스크롤에 더해짐)
    homing: 60,       // 편대 방향 유도 속도
  },

  meteor: { radius: 22, hpMin: 8, hpMax: 25, coin: 2 },

  boss: {
    hp: 7000,          // 최소 HP (소모형 진화의 함대 화력 규모에 맞춤 — 보스전 10~14초 목표)
    hpPerPower: 14,    // 보스 등장 시 max(hp, 최대 총화력 x 이 값) — 어떤 함대든 보스전 10초 안팎 유지
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
