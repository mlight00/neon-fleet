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
    unitR: 9, unitHp: 2, unitCap: 150,
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
  },
  // 게이트(3-2장): 두께 24, 피격 플래시 0.12s, 색(+파랑/−빨강/0회색)
  //  armZ = 게이트 전용 사격 활성 구간(부대 중심 기준 전방 거리 px). row.z - run.z <= armZ 가 되면 셔터가 열린다.
  //  null 인 행은 항상 열림(학습용). 닫힌 셔터에 닿은 탄은 흡수되고 값은 변하지 않는다(계약서 3-2)
  gate: { h: 24, flashT: 0.12, armZ: 340, openT: 0.25, colors: { pos: '#35E5FF', neg: '#FF6A3D', zero: '#9AA1AC' } },
  // 보급 통(3-3장): 반경 30, chain 발판 = s.z + 60 + i*40, 발판 판정 |run.x - pad.x| <= 70
  supply: { r: 30, padOffset: 60, padGap: 40, padHalfW: 70 },
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
  // 난이도 배수(계약서 3-8). 위협만 올리고 성장 축(게이트·보급·무기·병사 hp·armZ·coverZ)은 손대지 않는다.
  //  normal 은 전부 ×1 = 종전과 완전히 같은 판. 배수는 buildStage/createRun 시점에 한 번 적용되고 stepRun 안에는 난이도 분기가 없다.
  //  근거: 이사 실플레이 3회 소감 "가만히 있으면 손해는 나지만 난이도가 너무 낮아 완전 쉽다"(2026-09-16). 사람이 직접 지점을 고르게 하는 명시적 선택이다.
  //   enemyHp      잡졸·돌격체·저격수 hp(반올림)      eshotDmg     저격수·정예 적탄 dmg(어려움부터 1발 = 병사 1명)
  //   touchDmg     잡졸·돌격체·정예 접촉 피해          eliteHp      정예 hp(반올림)
  //   spawnCount   xs 없이 rows 로 뿌리는 스폰의 n(반올림, xs 명시 스폰은 그대로)   eliteFireRate 정예 부채꼴 발사 빈도(shootEvery ÷ 배수)
  difficulty: {
    normal: { id: 'normal', label: '보통',   short: '',       enemyHp: 1,   eshotDmg: 1, touchDmg: 1, eliteHp: 1,   spawnCount: 1,   eliteFireRate: 1 },
    hard:   { id: 'hard',   label: '어려움', short: '어려움', enemyHp: 1.5, eshotDmg: 2, touchDmg: 2, eliteHp: 1.6, spawnCount: 1.4, eliteFireRate: 1.25 },
    brutal: { id: 'brutal', label: '극한',   short: '극한',   enemyHp: 2.2, eshotDmg: 3, touchDmg: 3, eliteHp: 2.4, spawnCount: 1.8, eliteFireRate: 1.5 },
  },
  // 랜덤 길(계약서 3-9 · 2026-09-16 이사 지시 "빈 길이 아니라 랜덤 길"). S3 분리벽 w3 우측 통로에 걸리는 5종 풀.
  //  좋음 3(병사 통·무기 통·연속 증원) : 꽝 2(음수 게이트·돌격체) 를 균등 1/5 로 뽑는다.
  //  추첨은 buildStage 시점에 한 번(mulberry32 한 번) — 규칙 진행 중 난수는 여전히 0 이다.
  //  good  = 좋음/꽝 구분(결과 문구·공개 효과음) · label = 표지·결과 문구에 쓰는 짧은 이름
  //  kind  = 'soldier' | 'weapon' | 'chain'(통) · 'gate'(음수 게이트 한 칸) · 'enemy'(돌격 무리)
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
      { id: 'rusher4', good: false, kind: 'enemy', label: '돌격체 4', enemy: 'rusher', n: 4, xs: [282, 312, 342, 372] },
    ],
  },
  // 연출 상수(6장 + 기존 값 이식)
  fx: { shakeDur: 0.25, shakeAmp: 7, hurtFlashDur: 0.35, guideSec: 3, eliteBannerSec: 0.8, rewardPopSec: 0.5,
        fireVolBase: 0.4, fireVolPer: 40, joinManyAt: 3 },
  // 색(기존 값 이식 + v3 게이트 색)
  colors: {
    outline: '#14233A', hero: '#F3F1E8', heroHurt: '#FF4A4A', soldier: '#DFE6F5', hud: '#FFFFFF', gold: '#F6C84A',
    gatePos: '#35E5FF', gateNeg: '#FF6A3D', gateZero: '#9AA1AC', gateFlash: '#FFFFFF',
    bulletRifle: '#F6C84A', bulletAuto: '#35E5FF', bulletHeavy: '#FF9A4A',
    supplyBody: '#FFE9B8', supplyDark: '#8A6D1F', chainPad: '#35E5FF', wall: '#9AA1AC', wallTop: '#DFE6F5',
    enemy: { grunt: '#B3402F', rusher: '#3A3A3A', shooter: '#2B2F36', elite: '#2B1420' },
    eshot: '#FF3DA5', eshotCore: '#FF3020', warn: '#C2273B',
    bg: [
      { road: '#B7B1A2', side: '#857F6F', line: 'rgba(255,255,255,0.55)' },
      { road: '#A8A296', side: '#7A746A', line: 'rgba(255,255,255,0.5)' },
      { road: '#948F86', side: '#6A655D', line: 'rgba(255,255,255,0.42)' },
    ],
  },
});

// 난이도 id 목록(타이틀 토글 순서 = 표 순서). 데이터 접근만 — 규칙 로직이 아니다.
export const DIFFICULTY_IDS = Object.freeze(Object.keys(BAL3.difficulty));
export const DEFAULT_DIFFICULTY = 'normal';
// 타이틀 초기 선택(저장에 난이도가 없을 때). 2026-09-16 이사 결정: 극한으로 전 스테이지 격파 → 기본 선택을 극한으로.
//  규칙 계층 기본(DEFAULT_DIFFICULTY, buildStage 인자 생략 시)은 normal 그대로 — 테스트·봇 기준선.
export const DEFAULT_PICK_DIFFICULTY = 'brutal';

// 난이도 배수 표 한 줄. 모르는 id 는 throw(규칙 모듈이 조용히 normal 로 떨어지지 않게 — 셸이 저장값을 미리 거른다)
export function difficultyMult(id) {
  const m = BAL3.difficulty[id];
  if (!m) throw new Error('unknown difficulty ' + id);
  return m;
}
