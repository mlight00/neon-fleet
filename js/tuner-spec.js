// 튜너 항목표 — 두 갈래로 정렬한다.
//   ① 내 함대(cat:'fleet') — 기함·순양함 드론·무기·생존·성장.
//   ② 적(cat:'enemy')      — 섹터별로 그 섹터에서 처음 등장하는 적 + 그 섹터 보스를,
//                            조정 가능한 값(체력·크기·발사·피해 등)을 자동으로 전부 펼쳐서 보여준다.
// 여기 없는 값도 '그 외 전체'에서 조정할 수 있다(자동 생성).
//
// ns: 'bal' = balance.js의 BAL, 'sprite' = sprites.js의 SPRITE_SIZES
// min/max/step은 슬라이더 범위일 뿐 강제가 아니다(숫자 칸에 직접 더 큰 값도 입력 가능).

import { BAL } from './balance.js';
import { flatten, getPath } from './tuning.js';

// ───────────────────────── ① 내 함대 ─────────────────────────
const FLEET_GROUPS = [
  {
    id: 'flagship', cat: 'fleet', title: '기함 (크기·화력)', desc: '내 본대 함선의 크기와 기본 화력',
    items: [
      { ns: 'sprite', path: 'A1', name: '기함 크기 T0 EMBER', min: 20, max: 120, step: 1 },
      { ns: 'sprite', path: 'A2', name: '기함 크기 T1 FLARE', min: 20, max: 140, step: 1 },
      { ns: 'sprite', path: 'A3', name: '기함 크기 T2 ARCLIGHT', min: 20, max: 160, step: 1 },
      { ns: 'sprite', path: 'A4', name: '기함 크기 T3 AURORA', min: 20, max: 180, step: 1 },
      { ns: 'sprite', path: 'A5', name: '기함 크기 T4 ZENITH', min: 20, max: 200, step: 1 },
      { ns: 'sprite', path: 'A6', name: '기함 크기 T5 QUASAR', min: 20, max: 240, step: 1 },
      { ns: 'bal', path: 'squad.start', art: 'A1', name: '시작 드론 수', min: 1, max: 60, step: 1 },
      { ns: 'bal', path: 'squad.fireRate', art: 'A1', name: '드론 1기당 초당 발사', desc: '전체 DPS의 기반', min: 0.2, max: 8, step: 0.1 },
      { ns: 'bal', path: 'squad.damage', art: 'A1', name: '탄 1발 피해', desc: '전체 DPS의 기반', min: 0.1, max: 5, step: 0.1 },
      { ns: 'bal', path: 'squad.escortShare', art: 'A1', name: '드론 발사 지분', desc: '총 화력 중 호위 드론 몫(나머지는 기함)', min: 0, max: 0.9, step: 0.05 },
      { ns: 'bal', path: 'squad.radius', art: 'A1', name: '드론 피격 반경', min: 3, max: 20, step: 1 },
      { ns: 'bal', path: 'squad.maxWidth', art: 'A1', name: '편대 최대 반폭', desc: '클수록 피하기 어렵다', min: 40, max: 160, step: 2 },
    ],
  },
  {
    id: 'weapon', cat: 'fleet', title: '무기 화력', desc: '무기별 DPS 계수와 레벨 배수',
    items: [
      { ns: 'bal', path: 'weapons.vulcan.coef', art: 'PROJ_VULCAN_BASE', name: '발칸 DPS 계수', min: 0.2, max: 3, step: 0.05 },
      { ns: 'bal', path: 'weapons.laser.coef', art: 'PROJ_LASER_BASE', name: '레이저 DPS 계수', min: 0.2, max: 3, step: 0.05 },
      { ns: 'bal', path: 'weapons.homing.coef', art: 'PROJ_HOMING_BASE', name: '유도 미사일 DPS 계수', min: 0.2, max: 3, step: 0.02 },
      { ns: 'bal', path: 'weapons.lvCoef', name: '무기 레벨 배수 [1,2,3레벨]', desc: '쉼표로 구분', min: 0, max: 4, step: 0.05 },
      { ns: 'bal', path: 'weapons.homing.cap', art: 'PROJ_HOMING_BASE', name: '유도탄 동시 상한', min: 2, max: 60, step: 1 },
      { ns: 'bal', path: 'weapons.homing.turnRate', art: 'PROJ_HOMING_BASE', name: '유도탄 선회 속도', min: 0.5, max: 15, step: 0.5 },
      { ns: 'bal', path: 'weapons.laser.pierce', art: 'PROJ_LASER_BASE', name: '레이저 관통 수 [1,2,3레벨]', min: 0, max: 12, step: 1 },
      { ns: 'bal', path: 'weapons.laser.decay', art: 'PROJ_LASER_BASE', name: '레이저 관통당 감쇠', desc: '작을수록 뒤쪽 적에 약함', min: 0.1, max: 1, step: 0.05 },
      { ns: 'bal', path: 'gate1.loadout.wingDpsScale', name: '보조 무기 DPS 배수', min: 0.1, max: 1.5, step: 0.05 },
      { ns: 'bal', path: 'charge.blastCoef', name: '차지 랜스 위력 계수', min: 0.05, max: 1.5, step: 0.02 },
      { ns: 'bal', path: 'charge.stageTime', name: '차지 단계당 시간(초)', min: 0.1, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'cruiser', cat: 'fleet', title: '순양함 드론 (호위 편대)', desc: '드론이 합체한 순양함의 화력·체력·편성',
    items: [
      { ns: 'bal', path: 'escort.dronesPerCruiser', art: 'A2', name: '순양함 1척당 드론', min: 10, max: 400, step: 5 },
      { ns: 'bal', path: 'escort.cruisersPerFlagshipByTier', art: 'A2', name: '승급 필요 순양함 [T0→T5]', desc: '쉼표로 구분', min: 1, max: 20, step: 1 },
      { ns: 'bal', path: 'escort.cruiserPower', art: 'A2', name: '순양함 1척 화력', min: 10, max: 400, step: 5 },
      { ns: 'bal', path: 'escort.maxCruisers', art: 'A2', name: '순양함 최대 수', min: 1, max: 24, step: 1 },
      { ns: 'bal', path: 'escort.cruiserHp', art: 'A2', name: '순양함 체력', min: 5, max: 300, step: 5 },
      { ns: 'bal', path: 'escort.cruiserR', art: 'A2', name: '순양함 피탄 반경', min: 5, max: 60, step: 1 },
      { ns: 'bal', path: 'escort.slotGap', art: 'A2', name: '순양함 편성 간격', min: 8, max: 80, step: 2 },
      { ns: 'bal', path: 'escort.upgradeBonus', art: 'A2', name: '승급 흡수 보너스 배수', min: 1, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'survive', cat: 'fleet', title: '생존 · 집중', desc: '기함 내구도·피격 피해·집중 게이지',
    items: [
      { ns: 'bal', path: 'gate1.survivability.hullMax', name: '기함 내구도 최대', min: 20, max: 600, step: 10 },
      { ns: 'bal', path: 'gate1.survivability.hullMaxPerTier', name: '승급당 내구도 증가', min: 0, max: 100, step: 2 },
      { ns: 'bal', path: 'gate1.survivability.dmgNormalShot', name: '일반 적탄 피해', min: 1, max: 60, step: 1 },
      { ns: 'bal', path: 'gate1.survivability.dmgEliteShot', name: '정예 적탄 피해', min: 1, max: 90, step: 1 },
      { ns: 'bal', path: 'gate1.survivability.dmgCollision', name: '충돌 피해', min: 1, max: 120, step: 1 },
      { ns: 'bal', path: 'gate1.survivability.hitInvuln', name: '피격 후 무적(초)', min: 0, max: 3, step: 0.1 },
      { ns: 'bal', path: 'flow.max', name: '집중 게이지 최대', min: 20, max: 400, step: 10 },
      { ns: 'bal', path: 'flow.gainPerKill', name: '처치당 집중 적립', min: 1, max: 40, step: 1 },
      { ns: 'bal', path: 'flow.rushDamageMult', name: '폭주 피해 배수', min: 1, max: 3, step: 0.02 },
      { ns: 'bal', path: 'flow.rushDuration', name: '폭주 지속(초)', min: 1, max: 12, step: 0.5 },
    ],
  },
  {
    id: 'economy', cat: 'fleet', title: '성장 · 보상', desc: '드론·코인 수급과 보급 수송선',
    items: [
      { ns: 'bal', path: 'economy.droneGainMult', name: '드론 획득 배수', desc: '크리스탈·수송선 전체', min: 0.02, max: 1.5, step: 0.02 },
      { ns: 'bal', path: 'economy.crystalContactMult', art: 'C1', name: '크리스탈 보상 배수', desc: '무위험 수집이라 낮게', min: 0.05, max: 2, step: 0.05 },
      { ns: 'bal', path: 'economy.coinBankMult', name: '격납고 적립 코인 배수', min: 0.1, max: 3, step: 0.1 },
      { ns: 'bal', path: 'pod.perRun', art: 'C5', name: '보급 수송선 수 / 노드', min: 0, max: 20, step: 1 },
      { ns: 'bal', path: 'pod.small.reward', art: 'C5', name: '수송선 보상 (소)', min: 1, max: 200, step: 1 },
      { ns: 'bal', path: 'pod.mid.reward', art: 'C5', name: '수송선 보상 (중)', min: 1, max: 400, step: 2 },
      { ns: 'bal', path: 'pod.large.reward', art: 'C5', name: '수송선 보상 (대)', min: 1, max: 800, step: 5 },
      { ns: 'bal', path: 'crystal.small', art: 'C1', name: '크리스탈 소 [최소,최대]', min: 1, max: 200, step: 1 },
      { ns: 'bal', path: 'crystal.mid', art: 'C1', name: '크리스탈 중 [최소,최대]', min: 1, max: 400, step: 2 },
      { ns: 'bal', path: 'crystal.large', art: 'C1', name: '크리스탈 대 [최소,최대]', min: 1, max: 800, step: 5 },
    ],
  },
];

// ───────────────────────── ② 적 (섹터별) ─────────────────────────
// 각 적의 조정 가능한 값을 balance.js 구조에서 자동으로 펼친다. leaf 키 → 한글 라벨·슬라이더 범위 매핑.
const LEAF_KO = {
  hp: '체력', r: '피격 반경', radius: '피격 반경', coin: '격파 코인', bounty: '격파 드론 보상',
  dmgPct: '탄 피해(비례%)', dmgMin: '탄 최소 피해', fireInterval: '발사 간격(초)', shotSpeed: '탄 속도',
  speed: '이동/탄 속도', enterSpeed: '진입 속도', dashSpeed: '돌진 속도', telegraph: '돌진 예고(초)',
  hoverY: '정지 높이', stay: '체류(초)', stayTime: '체류(초)', cycle: '사이클(초)', charge: '충전(초)',
  beamShots: '빔 발수', beamGap: '빔 간격(초)', orbitR: '공전 반경', hz: '공전 속도(Hz)',
  descend: '하강 속도', descent: '하강 속도', count: '탄 수', spreadDeg: '확산 각도(도)',
  fanDeg: '부채 각도(도)', fanCount: '부채 탄수', spawnInterval: '사출 간격(초)', spawnCount: '사출 수',
  blink: '점멸 간격(초)', shieldUp: '방패 켜짐(초)', shieldDown: '방패 꺼짐(초)', shieldReduce: '방패 피해 감소율',
  hpScaleMul: '체력 스케일 배수', frontReduce: '정면 피해 감소율', coreHp: '코어 체력', coreOffset: '코어 위치',
  approach: '접근 속도', flee: '도주 속도', stealR: '탈취 반경', rewardMult: '탈취 보상 배수',
  armorReduce: '장갑 감소율', cleanseDrones: '정화 드론', offsetY: '세로 오프셋', sway: '좌우 흔들림',
  swayHz: '흔들림(Hz)', armRadius: '기폭 반경', fuse: '점화(초)', blastRadius: '폭발 반경',
  contactMin: '접촉 최소 피해', hpMin: '최소 체력', hpMax: '최대 체력', pairs: '집게 쌍',
  volley: '연발', enrage: '광폭', minStage: null,   // null = 튜너에서 숨김(구조값)
};

/** leaf 키 → 슬라이더 범위(값 기준 휴리스틱). 반환 {} 이면 슬라이더 없이 숫자칸만. */
function leafRange(key, v) {
  if (typeof v !== 'number') return {};
  if (/Pct$|Reduce$|Mul$|Frac$|Share$/.test(key)) return { min: 0, max: 1, step: 0.01 };
  if (/Interval|cycle|blink|fuse|telegraph|Delay|stay|stayTime|charge|warn|gap|Sec$|beamGap/i.test(key)) return { min: 0.05, max: Math.max(4, +(v * 2).toFixed(2)), step: 0.05 };
  if (/hz$/i.test(key)) return { min: 0.1, max: 3, step: 0.05 };
  if (/hp/i.test(key)) return { min: 1, max: Math.max(50, Math.round(v * 4)), step: 1 };
  if (/speed|descent|descend|approach|flee/i.test(key)) return { min: 10, max: Math.max(400, Math.round(v * 2)), step: 5 };
  if (/radius|^r$|orbitR|armRadius|blastRadius|stealR|coreOffset|offsetY|hoverY/i.test(key)) return { min: 1, max: Math.max(60, Math.round(v * 2)), step: 1 };
  if (/count|shots|pairs|volley|drones/i.test(key)) return { min: 1, max: Math.max(12, Math.round(v * 3)), step: 1 };
  if (/coin|bounty|dmgMin/i.test(key)) return { min: 0, max: Math.max(15, Math.round(v * 3)), step: 1 };
  if (/Deg$/.test(key)) return { min: 0, max: 180, step: 5 };
  return {};
}

/** 밸런스 접두사(예: 'newEnemies.shielder') 아래 모든 leaf를 튜너 항목으로 펼친다. */
function expandBal(prefix, enemyName, art) {
  const sub = getPath(BAL, prefix);
  if (!sub || typeof sub !== 'object') return [];
  const out = [];
  for (const [leaf, v] of Object.entries(flatten(sub))) {
    const key = leaf.split('.').pop();
    if (LEAF_KO[key] === null) continue;                       // 숨김 키(minStage 등)
    const label = LEAF_KO[key] || key;
    out.push({ ns: 'bal', path: `${prefix}.${leaf}`, art, name: `${enemyName} · ${label}`, ...leafRange(key, v) });
  }
  return out;
}

// 섹터별 적 레지스트리. 각 적: 크기 스프라이트(size) + 밸런스 접두사(bal) 자동 펼침 + 명시 항목(items).
//  bal 접두사는 그 적의 조정 가능한 모든 값을 자동 노출한다. 크리처는 등급별 값이 한 블록에 섞여 있어 명시로 지정.
const ENEMY_SECTORS = [
  {
    sector: 1, boss: { id: 'B8', name: '리퍼 로드' },
    enemies: [
      { name: '크리처 (소)', art: 'B1', size: 'B1', items: [
        { ns: 'bal', path: 'creature.small', art: 'B1', name: '크리처 소 · 체력', min: 1, max: 200, step: 1 },
        { ns: 'bal', path: 'creature.radius.small', art: 'B1', name: '크리처 소 · 피격 반경', min: 5, max: 90, step: 1 },
        { ns: 'bal', path: 'creature.contactPct.small', art: 'B1', name: '크리처 소 · 접촉 피해(비례%)', min: 0, max: 0.5, step: 0.01 },
        { ns: 'bal', path: 'creature.bounty.small', art: 'B1', name: '크리처 소 · 격파 드론 보상', min: 0, max: 20, step: 1 },
      ] },
      { name: '운석', art: 'C4', bal: 'meteor' },
      { name: '크리처 공통', art: 'B2', items: [
        { ns: 'bal', path: 'creature.speed', art: 'B2', name: '크리처 공통 · 하강 속도', min: 20, max: 300, step: 5 },
        { ns: 'bal', path: 'creature.homing', art: 'B2', name: '크리처 공통 · 유도 속도', min: 0, max: 200, step: 5 },
        { ns: 'bal', path: 'creature.contactMult', art: 'B2', name: '크리처 공통 · 접촉 배수', min: 0, max: 8, step: 0.5 },
      ] },
    ],
  },
  {
    sector: 2, boss: { id: 'B9', name: '볼텍스 마우' },
    enemies: [
      { name: '크리처 (중)', art: 'B2', size: 'B2', items: [
        { ns: 'bal', path: 'creature.mid', art: 'B2', name: '크리처 중 · 체력', min: 1, max: 400, step: 2 },
        { ns: 'bal', path: 'creature.radius.mid', art: 'B2', name: '크리처 중 · 피격 반경', min: 5, max: 110, step: 1 },
        { ns: 'bal', path: 'creature.contactPct.mid', art: 'B2', name: '크리처 중 · 접촉 피해(비례%)', min: 0, max: 0.5, step: 0.01 },
        { ns: 'bal', path: 'creature.bounty.mid', art: 'B2', name: '크리처 중 · 격파 드론 보상', min: 0, max: 20, step: 1 },
      ] },
      { name: '위버', art: 'B6', size: 'B6', bal: 'weaver' },
      { name: '기뢰', art: 'VEC:mine', bal: 'mine' },
      { name: '잔해(파괴불가)', art: 'VEC:debris', bal: 'debris' },
      { name: '프리즘 와든', art: 'B19', bal: 'adaptiveEnemies.prismWarden' },
      { name: '스캐빈저', art: 'B18', bal: 'adaptiveEnemies.scavenger' },
    ],
  },
  {
    sector: 3, boss: { id: 'B10', name: '옵시디언 클로' },
    enemies: [
      { name: '저격', art: 'B4', size: 'B4', bal: 'sniper' },
      { name: '돌진병', art: 'VEC:charger', bal: 'charger' },
      { name: '봄버', art: 'B16', size: 'B16', bal: 'newEnemies.bomber' },
      { name: '궤도병', art: 'B18', size: 'B18', bal: 'newEnemies.orbiter' },
      { name: '부패 게이트 기생체', art: 'B19', bal: 'adaptiveEnemies.gateParasite' },
    ],
  },
  {
    sector: 4, boss: { id: 'B11', name: '보이드 세라프' },
    enemies: [
      { name: '크리처 (대)', art: 'B3', size: 'B3', items: [
        { ns: 'bal', path: 'creature.large', art: 'B3', name: '크리처 대 · 체력', min: 1, max: 900, step: 5 },
        { ns: 'bal', path: 'creature.radius.large', art: 'B3', name: '크리처 대 · 피격 반경', min: 5, max: 140, step: 1 },
        { ns: 'bal', path: 'creature.contactPct.large', art: 'B3', name: '크리처 대 · 접촉 피해(비례%)', min: 0, max: 0.5, step: 0.01 },
        { ns: 'bal', path: 'creature.bounty.large', art: 'B3', name: '크리처 대 · 격파 드론 보상', min: 0, max: 20, step: 1 },
      ] },
      { name: '포탑', art: 'B5', size: 'B5', bal: 'turret' },
      { name: '전격(재퍼)', art: 'B17', size: 'B17', bal: 'newEnemies.zapper' },
      { name: '모선(캐리어)', art: 'B20', size: 'B20', bal: 'newEnemies.carrier' },
    ],
  },
  {
    sector: 5, boss: { id: 'B22', name: '네온 아비터' },
    enemies: [
      { name: '분열병(크리처 중 값 공유 · 섹터 2에서 조정)' },
      { name: '방패병(실더)', art: 'B19', size: 'B19', bal: 'newEnemies.shielder' },
    ],
  },
  {
    sector: 6, boss: { id: 'B7', name: '하이브 퀸' },
    enemies: [
      { name: '점멸병(블링커)', art: 'B21', size: 'B21', bal: 'newEnemies.blinker' },
    ],
  },
];

/** 보스 난이도 3종(체력=처치시간 배수·발사체 데미지·발사 빈도) + 크기. */
function bossRows(boss) {
  const b = `보스 ${boss.name}`;
  return [
    { ns: 'bal', path: `bossTune.${boss.id}.hp`, art: boss.id, name: `${b} · 체력(처치시간 배수)`, desc: '클수록 오래 버팀', min: 0.3, max: 4, step: 0.05 },
    { ns: 'bal', path: `bossTune.${boss.id}.dmg`, art: boss.id, name: `${b} · 발사체 데미지 배수`, min: 0.3, max: 4, step: 0.05 },
    { ns: 'bal', path: `bossTune.${boss.id}.fire`, art: boss.id, name: `${b} · 발사 빈도 배수`, desc: '클수록 빠름', min: 0.3, max: 4, step: 0.05 },
    { ns: 'sprite', path: boss.id, name: `${b} · 크기`, min: 80, max: 600, step: 10 },
  ];
}

// 섹터를 가리지 않는 전역 난이도·밀도·보스 기본값(섹터별 조정 위에 얹히는 공통 배수).
const ENEMY_GLOBAL = {
  id: 'enemyGlobal', cat: 'enemy', title: '적 공통 · 난이도', desc: '모든 섹터에 적용되는 전역 배수·등장 밀도·보스 기본값',
  items: [
    { ns: 'bal', path: 'difficulty.globalMult', name: '전체 난이도 배수', desc: '적 체력↑·발사 주기↓ 동시', min: 0.5, max: 3, step: 0.02 },
    { ns: 'bal', path: 'difficulty.enemyHpMult', name: '일반 적 체력 배수', min: 0.3, max: 4, step: 0.05 },
    { ns: 'bal', path: 'difficulty.bossHpMult', name: '보스 체력 배수(전역)', min: 0.3, max: 4, step: 0.05 },
    { ns: 'bal', path: 'difficulty.bossRateMult', name: '보스 발사 속도 배수(전역)', desc: '클수록 빠름', min: 0.5, max: 4, step: 0.1 },
    { ns: 'bal', path: 'economy.enemyHpPowerScale', name: '적 체력 화력비례 완만도', desc: '클수록 내 DPS가 앞선다', min: 40, max: 400, step: 5 },
    { ns: 'bal', path: 'economy.enemyHpPowerCap', name: '적 체력 비례 상한', min: 2, max: 40, step: 1 },
    { ns: 'bal', path: 'spawn.enemyMult', name: '적 복제 수 (기본)', desc: '한 배치가 몇 개로 복제되는가', min: 1, max: 12, step: 1 },
    { ns: 'bal', path: 'spawn.enemyMultMax', name: '적 복제 수 상한', min: 1, max: 24, step: 1 },
    { ns: 'bal', path: 'spawn.enemyMultStageStep', name: '복제 +1까지 필요한 난이도', desc: '작을수록 빨리 많아진다', min: 1, max: 8, step: 1 },
    { ns: 'bal', path: 'scrollSpeed', name: '스크롤 속도', desc: '판이 흐르는 속도(초당 px)', min: 60, max: 500, step: 10 },
    { ns: 'bal', path: 'sector.depth', name: '섹터 깊이', desc: '보스 전까지 노드 열 수', min: 2, max: 9, step: 1 },
    { ns: 'bal', path: 'sector.extraSeconds', name: '스테이지 추가 플레이 시간(초)', desc: '각 노드 길이를 늘린다', min: 0, max: 60, step: 1 },
    { ns: 'bal', path: 'affix.baseChance', name: '엘리트 변이 기본 확률', min: 0, max: 1, step: 0.02 },
    { ns: 'bal', path: 'affix.chancePerStage', name: '변이 확률 섹터당 증가', min: 0, max: 0.4, step: 0.01 },
    { ns: 'bal', path: 'affix.chanceCap', name: '변이 확률 상한', min: 0, max: 1, step: 0.05 },
    { ns: 'bal', path: 'boss.hp', art: 'B8', name: '보스 최소 체력(기본값)', min: 500, max: 40000, step: 500 },
    { ns: 'bal', path: 'boss.hpPerPower', art: 'B8', name: '보스 체력 = 화력 × 이 값', min: 1, max: 60, step: 1 },
    { ns: 'bal', path: 'boss.hpPerPowerCap', art: 'B8', name: '보스 체력 비례 상한', min: 2, max: 120, step: 2 },
    { ns: 'bal', path: 'midboss.hpMin', art: 'B8', name: '중간보스 최소 체력', min: 100, max: 12000, step: 100 },
    { ns: 'bal', path: 'midboss.hpPerPower', art: 'B8', name: '중간보스 체력 = 화력 × 이 값', min: 0.5, max: 20, step: 0.5 },
    { ns: 'bal', path: 'midboss.rewardDrones', art: 'B8', name: '중간보스 처치 드론 보상', min: 0, max: 120, step: 2 },
    { ns: 'bal', path: 'midboss.progress', art: 'B8', name: '중간보스 등장 지점', desc: '트랙 진행 비율', min: 0.1, max: 0.95, step: 0.05 },
  ],
};

/** 섹터별 적 그룹을 조립한다(각 적 자동 펼침 + 섹터 보스). 맨 앞에 전역 난이도 그룹. */
function buildEnemyGroups() {
  const sectors = ENEMY_SECTORS.map((s) => {
    const items = [];
    for (const e of s.enemies) {
      if (e.size) items.push({ ns: 'sprite', path: e.size, name: `${e.name} · 크기`, min: 20, max: 320, step: 5 });
      if (e.items) items.push(...e.items);
      if (e.bal) items.push(...expandBal(e.bal, e.name, e.art));
    }
    items.push(...bossRows(s.boss));
    return {
      id: `sector${s.sector}`, cat: 'enemy',
      title: `섹터 ${s.sector} · ${s.boss.name}`,
      desc: `${s.enemies.map((e) => e.name).join(' · ')} + 보스`,
      items,
    };
  });
  return [ENEMY_GLOBAL, ...sectors];
}

export const GROUPS = [...FLEET_GROUPS, ...buildEnemyGroups()];

/** 핵심 항목의 (ns, path) 집합 — '그 외 전체'에서 중복 표시를 피하는 데 쓴다. */
export function coreKeySet() {
  const s = new Set();
  for (const g of GROUPS) for (const it of g.items) s.add(`${it.ns}:${it.path}`);
  return s;
}

/** cat별 항목 총 개수 */
export function catCount(cat) {
  return GROUPS.filter((g) => g.cat === cat).reduce((n, g) => n + g.items.length, 0);
}
export function coreCount() { return GROUPS.reduce((n, g) => n + g.items.length, 0); }

/**
 * '그 외 전체'용 자동 썸네일 매칭 — 경로 접두사(또는 스프라이트 id)로 그림을 고른다.
 * 항목의 art가 있으면 그게 우선이고, 없을 때만 여기로 넘어온다.
 */
const PREFIX_ART = [
  ['creature.radius.small', 'B1'], ['creature.radius.mid', 'B2'], ['creature.radius.large', 'B3'],
  ['creature.small', 'B1'], ['creature.mid', 'B2'], ['creature.large', 'B3'], ['creature', 'B2'],
  ['sniper', 'B4'], ['turret', 'B5'], ['weaver', 'B6'],
  ['newEnemies.bomber', 'B16'], ['newEnemies.zapper', 'B17'], ['newEnemies.orbiter', 'B18'],
  ['newEnemies.shielder', 'B19'], ['newEnemies.carrier', 'B20'], ['newEnemies.blinker', 'B21'],
  ['bossTune.B7', 'B7'], ['bossTune.B8', 'B8'], ['bossTune.B9', 'B9'], ['bossTune.B10', 'B10'],
  ['bossTune.B11', 'B11'], ['bossTune.B22', 'B22'], ['bossTune.B12', 'B12'], ['bossTune.B13', 'B13'],
  ['bossTune.B14', 'B14'], ['bossTune.B15', 'B15'],
  ['bossPatterns.B7', 'B7'], ['bossPatterns.B8', 'B8'], ['bossPatterns.B9', 'B9'],
  ['bossPatterns.B10', 'B10'], ['bossPatterns.B11', 'B11'], ['bossPatterns.B22', 'B22'],
  ['bossPatterns.B12', 'B12'], ['bossPatterns.B13', 'B13'], ['bossPatterns.B14', 'B14'], ['bossPatterns.B15', 'B15'],
  ['neonArbiter', 'B22'], ['boss', 'B8'], ['midboss', 'B8'],
  ['weapons.vulcan', 'PROJ_VULCAN_BASE'], ['weapons.laser', 'PROJ_LASER_BASE'], ['weapons.homing', 'PROJ_HOMING_BASE'],
  ['weaponEvolution.vulcan', 'PROJ_VULCAN_STORM'], ['weaponEvolution.laser', 'PROJ_LASER_CUTTER'],
  ['weaponEvolution.homing', 'PROJ_HOMING_WASP'],
  ['weaponSuperEvolution.vulcan', 'PROJ_VULCAN_NEEDLE'], ['weaponSuperEvolution.laser', 'PROJ_LASER_PRISM'],
  ['weaponSuperEvolution.homing', 'PROJ_HOMING_SIEGE'],
  ['pod', 'C5'], ['crystal', 'C1'], ['meteor', 'C4'], ['powerModule', 'C3'], ['capsule', 'C2'],
  ['escort', 'A2'], ['squad', 'A1'], ['shipTraits', 'A1'], ['evolution', 'A1'], ['charge', 'A1'],
  ['adaptiveEnemies.prismWarden', 'B19'], ['adaptiveEnemies.scavenger', 'B18'], ['adaptiveEnemies.gateParasite', 'B19'],
  // 아래 셋은 그림 파일이 없고 코드로 그리는 적 → 튜너가 실제 draw()를 호출해 썸네일을 만든다.
  ['charger', 'VEC:charger'], ['mine', 'VEC:mine'], ['debris', 'VEC:debris'],
];

/** ns/path에 맞는 썸네일 스프라이트 id (없으면 null). */
export function artFor(ns, path) {
  if (ns === 'sprite') return path;                 // 크기 항목은 그 스프라이트 자신
  for (const [prefix, id] of PREFIX_ART) {
    if (path === prefix || path.startsWith(prefix + '.')) return id;
  }
  return null;
}
