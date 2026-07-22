// 튜너 '핵심' 항목표 — 자주 만지는 값에 한글 이름·설명·권장 범위를 붙인다.
// 여기 없는 값도 튜너의 '전체 보기'에서 전부 조정할 수 있다(자동 생성).
//
// ns: 'bal' = balance.js의 BAL, 'sprite' = sprites.js의 SPRITE_SIZES
// min/max/step은 슬라이더 범위일 뿐 강제가 아니다(숫자 칸에 직접 더 큰 값도 입력 가능).

export const GROUPS = [
  {
    id: 'fleet', title: '내 함대', desc: '기함과 드론의 크기·화력',
    items: [
      { ns: 'sprite', path: 'A1', name: '기함 크기 T0 EMBER', min: 20, max: 120, step: 1 },
      { ns: 'sprite', path: 'A2', name: '기함 크기 T1 FLARE', min: 20, max: 140, step: 1 },
      { ns: 'sprite', path: 'A3', name: '기함 크기 T2 ARCLIGHT', min: 20, max: 160, step: 1 },
      { ns: 'sprite', path: 'A4', name: '기함 크기 T3 AURORA', min: 20, max: 180, step: 1 },
      { ns: 'sprite', path: 'A5', name: '기함 크기 T4 ZENITH', min: 20, max: 200, step: 1 },
      { ns: 'sprite', path: 'A6', name: '기함 크기 T5 QUASAR', min: 20, max: 240, step: 1 },
      { ns: 'bal', path: 'squad.start', name: '시작 드론 수', min: 1, max: 60, step: 1 },
      { ns: 'bal', path: 'squad.fireRate', name: '드론 1기당 초당 발사', desc: '전체 DPS의 기반', min: 0.2, max: 8, step: 0.1 },
      { ns: 'bal', path: 'squad.damage', name: '탄 1발 피해', desc: '전체 DPS의 기반', min: 0.1, max: 5, step: 0.1 },
      { ns: 'bal', path: 'squad.escortShare', name: '드론 발사 지분', desc: '총 화력 중 호위 드론 몫(나머지는 기함)', min: 0, max: 0.9, step: 0.05 },
      { ns: 'bal', path: 'squad.radius', name: '드론 피격 반경', min: 3, max: 20, step: 1 },
      { ns: 'bal', path: 'squad.maxWidth', name: '편대 최대 반폭', desc: '클수록 피하기 어렵다', min: 40, max: 160, step: 2 },
    ],
  },
  {
    id: 'weapon', title: '무기 화력', desc: '무기별 DPS 계수와 레벨 배수',
    items: [
      { ns: 'bal', path: 'weapons.vulcan.coef', name: '발칸 DPS 계수', min: 0.2, max: 3, step: 0.05 },
      { ns: 'bal', path: 'weapons.laser.coef', name: '레이저 DPS 계수', min: 0.2, max: 3, step: 0.05 },
      { ns: 'bal', path: 'weapons.homing.coef', name: '유도 미사일 DPS 계수', min: 0.2, max: 3, step: 0.02 },
      { ns: 'bal', path: 'weapons.lvCoef', name: '무기 레벨 배수 [1,2,3레벨]', desc: '쉼표로 구분', min: 0, max: 4, step: 0.05 },
      { ns: 'bal', path: 'weapons.homing.cap', name: '유도탄 동시 상한', min: 2, max: 60, step: 1 },
      { ns: 'bal', path: 'weapons.homing.turnRate', name: '유도탄 선회 속도', min: 0.5, max: 15, step: 0.5 },
      { ns: 'bal', path: 'weapons.laser.pierce', name: '레이저 관통 수 [1,2,3레벨]', min: 0, max: 12, step: 1 },
      { ns: 'bal', path: 'weapons.laser.decay', name: '레이저 관통당 감쇠', desc: '작을수록 뒤쪽 적에 약함', min: 0.1, max: 1, step: 0.05 },
      { ns: 'bal', path: 'gate1.loadout.wingDpsScale', name: '보조 무기 DPS 배수', min: 0.1, max: 1.5, step: 0.05 },
      { ns: 'bal', path: 'charge.blastCoef', name: '차지 랜스 위력 계수', min: 0.05, max: 1.5, step: 0.02 },
      { ns: 'bal', path: 'charge.stageTime', name: '차지 단계당 시간(초)', min: 0.1, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'enemyHp', title: '적 체력·난이도', desc: '전체 난이도 배수와 화력 비례 스케일',
    items: [
      { ns: 'bal', path: 'difficulty.globalMult', name: '전체 난이도 배수', desc: '적 체력↑·발사 주기↓ 동시', min: 0.5, max: 3, step: 0.02 },
      { ns: 'bal', path: 'difficulty.enemyHpMult', name: '일반 적 체력 배수', min: 0.3, max: 4, step: 0.05 },
      { ns: 'bal', path: 'difficulty.bossHpMult', name: '보스 체력 배수', min: 0.3, max: 4, step: 0.05 },
      { ns: 'bal', path: 'difficulty.bossRateMult', name: '보스 발사 속도 배수', desc: '클수록 빠름', min: 0.5, max: 4, step: 0.1 },
      { ns: 'bal', path: 'economy.enemyHpPowerScale', name: '적 체력 화력비례 완만도', desc: '클수록 내 DPS가 앞선다', min: 40, max: 400, step: 5 },
      { ns: 'bal', path: 'economy.enemyHpPowerCap', name: '적 체력 비례 상한', min: 2, max: 40, step: 1 },
      { ns: 'bal', path: 'economy.enemyHangarWeight', name: '적 체력에 격납고 반영', desc: '0=옛 동작, 1=완전 반영', min: 0, max: 1, step: 0.1 },
      { ns: 'bal', path: 'creature.small', name: '크리처 체력 (소)', min: 1, max: 200, step: 1 },
      { ns: 'bal', path: 'creature.mid', name: '크리처 체력 (중)', min: 1, max: 400, step: 2 },
      { ns: 'bal', path: 'creature.large', name: '크리처 체력 (대)', min: 1, max: 900, step: 5 },
      { ns: 'bal', path: 'sniper.hp', name: '저격 체력', min: 1, max: 300, step: 1 },
      { ns: 'bal', path: 'turret.hp', name: '포탑 체력', min: 1, max: 400, step: 1 },
      { ns: 'bal', path: 'weaver.hp', name: '위버 체력', min: 1, max: 200, step: 1 },
      { ns: 'bal', path: 'charger.hp', name: '돌진병 체력', min: 1, max: 300, step: 1 },
    ],
  },
  {
    id: 'enemySize', title: '적 크기', desc: '화면에 보이는 크기(저장 후 자동으로 다시 로드)',
    items: [
      { ns: 'sprite', path: 'B1', name: '크리처 소 (샤드)', min: 20, max: 260, step: 5 },
      { ns: 'sprite', path: 'B2', name: '크리처 중 (리퍼)', min: 20, max: 280, step: 5 },
      { ns: 'sprite', path: 'B3', name: '크리처 대 (브루드)', min: 20, max: 320, step: 5 },
      { ns: 'sprite', path: 'B4', name: '저격', min: 20, max: 200, step: 5 },
      { ns: 'sprite', path: 'B5', name: '포탑', min: 20, max: 200, step: 5 },
      { ns: 'sprite', path: 'B6', name: '위버', min: 20, max: 200, step: 5 },
      { ns: 'sprite', path: 'B16', name: '봄버', min: 20, max: 200, step: 5 },
      { ns: 'sprite', path: 'B17', name: '전격', min: 20, max: 200, step: 5 },
      { ns: 'sprite', path: 'B18', name: '궤도병', min: 20, max: 200, step: 5 },
      { ns: 'sprite', path: 'B19', name: '방패병', min: 20, max: 200, step: 5 },
      { ns: 'sprite', path: 'B20', name: '모선', min: 20, max: 200, step: 5 },
      { ns: 'sprite', path: 'B21', name: '점멸병', min: 20, max: 200, step: 5 },
      { ns: 'bal', path: 'creature.radius.small', name: '크리처 소 · 피격 반경', desc: '보이는 크기와 맞춰야 자연스럽다', min: 5, max: 90, step: 1 },
      { ns: 'bal', path: 'creature.radius.mid', name: '크리처 중 · 피격 반경', min: 5, max: 110, step: 1 },
      { ns: 'bal', path: 'creature.radius.large', name: '크리처 대 · 피격 반경', min: 5, max: 140, step: 1 },
      { ns: 'bal', path: 'sniper.radius', name: '저격 · 피격 반경', min: 5, max: 90, step: 1 },
      { ns: 'bal', path: 'turret.radius', name: '포탑 · 피격 반경', min: 5, max: 90, step: 1 },
      { ns: 'bal', path: 'weaver.radius', name: '위버 · 피격 반경', min: 5, max: 90, step: 1 },
    ],
  },
  {
    id: 'freq', title: '등장 빈도·밀도', desc: '적이 얼마나 많이, 얼마나 자주 나오는가',
    items: [
      { ns: 'bal', path: 'spawn.enemyMult', name: '적 복제 수 (기본)', desc: '한 배치가 몇 개로 복제되는가', min: 1, max: 12, step: 1 },
      { ns: 'bal', path: 'spawn.enemyMultMax', name: '적 복제 수 상한', min: 1, max: 24, step: 1 },
      { ns: 'bal', path: 'spawn.enemyMultStageStep', name: '복제 +1까지 필요한 난이도', desc: '작을수록 빨리 많아진다', min: 1, max: 8, step: 1 },
      { ns: 'bal', path: 'scrollSpeed', name: '스크롤 속도', desc: '판이 흐르는 속도(초당 px)', min: 60, max: 500, step: 10 },
      { ns: 'bal', path: 'sector.depth', name: '섹터 깊이', desc: '보스 전까지 노드 열 수', min: 2, max: 9, step: 1 },
      { ns: 'bal', path: 'affix.baseChance', name: '엘리트 변이 기본 확률', min: 0, max: 1, step: 0.02 },
      { ns: 'bal', path: 'affix.chancePerStage', name: '변이 확률 섹터당 증가', min: 0, max: 0.4, step: 0.01 },
      { ns: 'bal', path: 'affix.chanceCap', name: '변이 확률 상한', min: 0, max: 1, step: 0.05 },
      { ns: 'bal', path: 'midboss.wingUnlockMinCol', name: '중간보스 첫 등장 열', desc: '0=첫 노드', min: 0, max: 5, step: 1 },
      { ns: 'bal', path: 'midboss.progress', name: '중간보스 등장 지점', desc: '트랙 진행 비율', min: 0.1, max: 0.95, step: 0.05 },
      { ns: 'bal', path: 'pod.perRun', name: '보급 수송선 수 / 노드', min: 0, max: 20, step: 1 },
    ],
  },
  {
    id: 'boss', title: '보스', desc: '보스 체력과 중간보스',
    items: [
      { ns: 'bal', path: 'boss.hp', name: '보스 최소 체력', min: 500, max: 40000, step: 500 },
      { ns: 'bal', path: 'boss.hpPerPower', name: '보스 체력 = 화력 × 이 값', min: 1, max: 60, step: 1 },
      { ns: 'bal', path: 'boss.hpPerPowerCap', name: '보스 체력 비례 상한', min: 2, max: 120, step: 2 },
      { ns: 'bal', path: 'boss.hangarWeight', name: '보스 체력에 격납고 반영', desc: '0=옛 동작, 1=완전 반영', min: 0, max: 1, step: 0.1 },
      { ns: 'bal', path: 'boss.sectorHpMult.1', name: '섹터 1 보스 추가 배수', min: 0.3, max: 5, step: 0.1 },
      { ns: 'bal', path: 'midboss.hpMin', name: '중간보스 최소 체력', min: 100, max: 12000, step: 100 },
      { ns: 'bal', path: 'midboss.hpPerPower', name: '중간보스 체력 = 화력 × 이 값', min: 0.5, max: 20, step: 0.5 },
      { ns: 'bal', path: 'midboss.rewardDrones', name: '중간보스 처치 드론 보상', min: 0, max: 120, step: 2 },
      { ns: 'sprite', path: 'B7', name: '보스 크기 · 하이브 퀸', min: 80, max: 600, step: 10 },
      { ns: 'sprite', path: 'B8', name: '보스 크기 · 리퍼 로드', min: 80, max: 600, step: 10 },
      { ns: 'sprite', path: 'B22', name: '보스 크기 · 네온 아비터', min: 80, max: 600, step: 10 },
    ],
  },
  {
    id: 'survive', title: '생존', desc: '내구도와 피격 피해',
    items: [
      { ns: 'bal', path: 'gate1.survivability.hullMax', name: '기함 내구도 최대', min: 20, max: 600, step: 10 },
      { ns: 'bal', path: 'gate1.survivability.hullMaxPerTier', name: '승급당 내구도 증가', min: 0, max: 100, step: 2 },
      { ns: 'bal', path: 'gate1.survivability.dmgNormalShot', name: '일반 적탄 피해', min: 1, max: 60, step: 1 },
      { ns: 'bal', path: 'gate1.survivability.dmgEliteShot', name: '정예 적탄 피해', min: 1, max: 90, step: 1 },
      { ns: 'bal', path: 'gate1.survivability.dmgCollision', name: '충돌 피해', min: 1, max: 120, step: 1 },
      { ns: 'bal', path: 'gate1.survivability.hitInvuln', name: '피격 후 무적(초)', min: 0, max: 3, step: 0.1 },
      { ns: 'bal', path: 'escort.cruiserHp', name: '순양함 체력', min: 5, max: 300, step: 5 },
      { ns: 'bal', path: 'flow.max', name: '집중 게이지 최대', min: 20, max: 400, step: 10 },
    ],
  },
  {
    id: 'economy', title: '성장·보상', desc: '드론·코인 수급과 승급 속도',
    items: [
      { ns: 'bal', path: 'economy.droneGainMult', name: '드론 획득 배수', desc: '크리스탈·수송선 전체', min: 0.02, max: 1.5, step: 0.02 },
      { ns: 'bal', path: 'economy.crystalContactMult', name: '크리스탈 보상 배수', desc: '무위험 수집이라 낮게', min: 0.05, max: 2, step: 0.05 },
      { ns: 'bal', path: 'economy.coinBankMult', name: '격납고 적립 코인 배수', min: 0.1, max: 3, step: 0.1 },
      { ns: 'bal', path: 'pod.small.reward', name: '수송선 보상 (소)', min: 1, max: 200, step: 1 },
      { ns: 'bal', path: 'pod.mid.reward', name: '수송선 보상 (중)', min: 1, max: 400, step: 2 },
      { ns: 'bal', path: 'pod.large.reward', name: '수송선 보상 (대)', min: 1, max: 800, step: 5 },
      { ns: 'bal', path: 'escort.dronesPerCruiser', name: '순양함 1척당 드론', min: 10, max: 400, step: 5 },
      { ns: 'bal', path: 'escort.cruisersPerFlagshipByTier', name: '승급 필요 순양함 [T0→T5]', desc: '쉼표로 구분', min: 1, max: 20, step: 1 },
      { ns: 'bal', path: 'escort.cruiserPower', name: '순양함 1척 화력', min: 10, max: 400, step: 5 },
      { ns: 'bal', path: 'escort.maxCruisers', name: '순양함 최대 수', min: 1, max: 24, step: 1 },
    ],
  },
];

/** 핵심 항목의 (ns, path) 집합 — '전체 보기'에서 중복 표시를 피하는 데 쓴다. */
export function coreKeySet() {
  const s = new Set();
  for (const g of GROUPS) for (const it of g.items) s.add(`${it.ns}:${it.path}`);
  return s;
}

/** 핵심 항목 총 개수 */
export function coreCount() {
  return GROUPS.reduce((n, g) => n + g.items.length, 0);
}
