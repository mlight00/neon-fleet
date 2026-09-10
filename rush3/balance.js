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
  gate: { h: 24, flashT: 0.12, colors: { pos: '#35E5FF', neg: '#FF6A3D', zero: '#9AA1AC' } },
  // 보급 통(3-3장): 반경 30, chain 발판 = s.z + 60 + i*40, 발판 판정 |run.x - pad.x| <= 70
  supply: { r: 30, padOffset: 60, padGap: 40, padHalfW: 70 },
  // 벽(3-6장): 중앙 분리벽 기본 x 228~252
  wall: { x0: 228, x1: 252 },
  // 적 4종(3-7장). vz 는 세계 기준 부대 쪽 접근 속도(양수)
  enemies: {
    // 잡졸: x 를 run.x 쪽으로 35px/s 추종(2026-09-10 90→35: 무조작이어도 사선에 들어와 죽던 것을 완화). 접촉 유닛 hp −1, 적 소모
    grunt:   { hp: 2, r: 14, vz: 60, track: 35, touchDmg: 1 },
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
