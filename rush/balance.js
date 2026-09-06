// rush/balance.js — 스타포지 러시 수치 단일 진실. 로직 없음.
export const BAL = {
  //  판 = 5구간 × 900. 구간마다 신규 적 2종 합류(누적), 구간 끝(900의 배수)마다 전용 보스.
  track: { length: 57000, zoneLen: 11400, zones: 5, scrollSpeed: 190, gateEvery: 780, firstGateZ: 300, waveEvery: 200, enemyHpMult: [1, 2, 3.2, 4.6, 6.2], enemyAdvMult: [0.6, 0.8, 1, 1.1, 1.2], eshotDmg: [1, 1, 2, 2, 3], enemySizeMult: [1, 1.08, 1.16, 1.24, 1.32] },   // 구간 배율: 체력·전진속도·적탄 위력   // 구간당 60초(스크롤), 성장은 게이트가·웨이브는 양념
  //  followRate = 기존 게임(js/balance.js) followSpeed 와 동일값
  squad: { y: 640, maxCount: 999, moveSpeed: 420, followRate: 9, unitSpacingX: 22, unitSpacingY: 18, drawCap: 130, startCount: 1,
           heroSize: 46, heroSizes: [46, 52, 58, 66, 74], soldierSize: 22, ringGap: 19, ringStart: 26,
           muzzles: [1, 1, 2, 2, 3], bulletW: [4, 5, 6, 7, 8], tierDmgMult: [1, 1.15, 1.3, 1.5, 1.75],   // 티어별 발사 열·탄 굵기·위력(무기 진화)
           fireInterval: 0.5, fireRateCap: 7, bulletSpeed: 700, bulletSpeeds: [700, 730, 770, 820, 880], bulletDmg: 1, dmgPerTroop: 0.012, touchLossPerHit: 1 },
  tiers: [1, 60, 180, 360, 700],         // M1~M5 병력 임계 — 최종 진화는 종반에나
  demoteRatio: 0.75,                     // 강등 완충: 임계의 75% 아래로 떨어져야 강등(진화 성취 보존)
  gates: {
    colors: { add: '#35E5FF', mul: '#F6C84A', sub: '#FF6A3D', div: '#FF3DA5' },
    // 진행도 t(0..1)에 따른 값 범위
    addMin: 3, addMax: 62, mulVals: [2, 3], subMin: 5, subMax: 90, divVals: [2, 3],
    width: 150, gap: 20, h: 64,   // 총폭 320(80~400) = 도로·이동 범위와 일치
  },
  enemies: {
    //  구간1
    scrapbit:      { hp: 1,  r: 14, speed: 250, count: [2, 4],  coin: 1 },   // 1구간 기준 한 발 격파(구간 배율로 비례 강화)
    wheeler:       { hp: 1,  r: 17, speed: 265, count: [2, 3],  coin: 2, zigzag: 140 },   // 1구간 기준 한 발 격파(구간 배율로 비례 강화)
    //  구간2
    ramhound:      { hp: 6,  r: 28, speed: 215, accel: 260, maxSpeed: 540, count: [1, 2], coin: 3, touchLoss: 3, straight: true },
    signaler:      { hp: 7,  r: 23, speed: 190, count: [1, 2],  coin: 4, shootEvery: 1.6, shotSpeed: 250, fan: 3, straight: true, drawScale: 1.8, shot: 'lamp' },   // 신호등 포탑 — 램프탄 3연 부채꼴
    //  구간3
    wallguard:     { hp: 34, r: 40, speed: 235, count: [1, 1],  coin: 5, touchLoss: 4, showHp: true, straight: true, shieldReduce: 0.3 },   // 방벽 — 탄 70% 감쇠(단단한 벽)
    cartyard:      { hp: 44, r: 42, speed: 215, count: [1, 1],  coin: 7, touchLoss: 5, showHp: true, deathBurst: 4 },   // 고철 수레 — 좌우로 기우뚱, 터지면 파편 산탄 4발
    //  구간4
    needleeye:     { hp: 5,  r: 25, speed: 190, count: [1, 2],  coin: 4, shootEvery: 2.2, shotSpeed: 520, straight: true, drawScale: 1.35, shot: 'needle', aimTime: 0.55 },   // 가로등 저격수 — 조준선 후 고속 니들 단발
    manholejumper: { hp: 8,  r: 16, speed: 235, count: [1, 3],  coin: 4, hopEvery: 1.8, hopSpeed: 330, hopShock: 3 },   // 부대 쪽으로 점프, 착지 시 파편 충격파
    //  구간5
    spawnpod:      { hp: 14, r: 30, speed: 190, count: [1, 2],  coin: 6, spawns: 'scrapbit', spawnN: 3, touchLoss: 2, straight: true, emitEvery: 2.6 },   // 도로 고정 고치 — 살아있는 동안에도 잡졸을 낳는다
    magnethead:    { hp: 9,  r: 19, speed: 240, count: [1, 2],  coin: 8, stealCoins: 5, magnetR: 130, magnetPull: 620 },   // 자기장 — 아군 탄을 빨아들여 빗나가게 한다
    //  POW 뱃지: 주우면 5초 버스터(전방 관통 빔). 탄이 통과하는 픽업(못 쏨).
    pow:           { hp: 1,  r: 22, speed: 190, count: [1, 1],  coin: 0, straight: true, pickup: true },
    //  전 구간 공통: 보급 컨테이너 — 한참 쏴서 깨면 병력 획득(게이트 밖의 성장 축)
    supply:        { hp: 26, r: 34, speed: 190, count: [1, 1],  coin: 0, showHp: true, touchLoss: 0, straight: true,   // 도로에 놓인 컨테이너
                     rewardByZone: [10, 16, 25, 38, 52] },
  },
  //  구간 보스 5종 — 공통 골격(좌우 이동+부채꼴 사격+접촉)에 스탯만 다르게. 스멜터는 잡졸 소환.
  boss: { hpByZone: [560, 1250, 1800, 2450, 3300], touchLossPerSec: 16, shotBonus: 1,   // 구간 고정 체력 — 병력을 모을수록 빨리 잡는다
          phase2At: 0.5, rageAt: 0.3, phase2Rate: 0.75, rageRate: 0.58, rageSpeed: 1.25 },   // rageRate 0.58 = 페이즈2 대비 발사 빈도 +30%   // 페이즈2=패턴 가속+부채꼴+1, 광분=총력전
  bosses: [
    { key: 'b1', name: '그레이더',      hpMult: 0.9, r: 48, speed: 60,  shootEvery: 1.1, fan: 2, shotSpeed: 220, coin: 25, ramEvery: 4.5, ramSpeed: 460 },
    { key: 'b2', name: '갠트리 위도우', hpMult: 1.1, r: 52, speed: 70,  shootEvery: 1.0, fan: 3, shotSpeed: 230, coin: 35, hookEvery: 3.0, hookSpeed: 320, hookSwing: 95 },
    { key: 'b3', name: '레일 리바이어던', hpMult: 1.2, r: 56, speed: 75, shootEvery: 0.9, fan: 5, shotSpeed: 210, coin: 45, sweepEvery: 4.8, sweepSpeed: 800, sweepHit: 10 },
    { key: 'b4', name: '스멜터',        hpMult: 1.35, r: 55, speed: 62,  shootEvery: 0.95, fan: 4, shotSpeed: 230, coin: 55, spawnEvery: 3.2, poolEvery: 4.4, poolDmg: 3 },
    { key: 'b5', name: '크라운 브레이커', hpMult: 1.6, r: 60, speed: 80,  shootEvery: 0.75, fan: 6, shotSpeed: 230, coin: 80, ramEvery: 5.5, ramSpeed: 460, spawnEvery: 4 },
  ],
  coins: { perDistance: 0.0015 },        // 거리 보정 코인(주 수입은 격파) — 판이 길어진 만큼 단가 하향
  fx: { busterDur: 5, busterDps: 70, busterHalfW: 30, slowmoAt: 5, slowmoDur: 0.5, slowmoScale: 0.4, slowmoMax: 2,
        continueTroops: 10, continueByZone: [10, 25, 45, 70, 100], continueInvulnSec: 2, bossHushSec: 1.5,   // 이어하기 복구는 구간 비례
        shakeDur: 0.25, shakeAmp: 7, hurtFlashDur: 0.35 },
  upgrades: {
    startTroops: { max: 9, effect: 1,    costs: [30, 80, 160, 280, 450, 680, 980, 1350, 1800] },
    fireRate:    { max: 5, effect: 0.05, costs: [40, 100, 200, 350, 550] },
    magnet:      { max: 5, effect: 0.10, costs: [25, 60, 120, 220, 380] },
  },
};
