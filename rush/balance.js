// rush/balance.js — 스타포지 러시 수치 단일 진실. 로직 없음.
export const BAL = {
  //  판 = 5구간 × 900. 구간마다 신규 적 2종 합류(누적), 구간 끝(900의 배수)마다 전용 보스.
  track: { length: 8000, zoneLen: 1600, zones: 5, scrollSpeed: 190, gateEvery: 400, firstGateZ: 260, waveEvery: 160 },
  //  followRate = 기존 게임(js/balance.js) followSpeed 와 동일값
  squad: { y: 640, moveSpeed: 420, followRate: 9, unitSpacingX: 22, unitSpacingY: 18, drawCap: 130, startCount: 1,
           heroSize: 46, soldierSize: 22, ringGap: 19, ringStart: 26,
           muzzles: [1, 1, 2, 2, 3], bulletW: [4, 5, 6, 7, 8],   // 티어별 발사 열·탄 굵기(성장 체감)
           fireInterval: 0.5, bulletSpeed: 700, bulletDmg: 1, dmgPerTroop: 0.02, touchLossPerHit: 1 },
  tiers: [1, 25, 75, 150, 300],          // M1~M5 병력 임계
  gates: {
    colors: { add: '#35E5FF', mul: '#F6C84A', sub: '#FF6A3D', div: '#FF3DA5' },
    // 진행도 t(0..1)에 따른 값 범위
    addMin: 4, addMax: 40, mulVals: [2, 3], subMin: 5, subMax: 60, divVals: [2, 3],
    width: 150, gap: 20, h: 64,   // 총폭 320(80~400) = 도로·이동 범위와 일치
  },
  enemies: {
    //  구간1
    scrapbit:      { hp: 2,  r: 12, speed: 120, count: [4, 10], coin: 1 },
    wheeler:       { hp: 3,  r: 13, speed: 170, count: [2, 4],  coin: 2, zigzag: 140 },
    //  구간2
    ramhound:      { hp: 6,  r: 16, speed: 260, count: [1, 2],  coin: 3, touchLoss: 3 },
    signaler:      { hp: 7,  r: 15, speed: 55,  count: [1, 2],  coin: 4, shootEvery: 2.2, shotSpeed: 220, fan: 3 },
    //  구간3
    wallguard:     { hp: 30, r: 24, speed: 45,  count: [1, 1],  coin: 5 },
    cartyard:      { hp: 45, r: 22, speed: 30,  count: [1, 1],  coin: 7, touchLoss: 4 },
    //  구간4
    needleeye:     { hp: 5,  r: 14, speed: 60,  count: [1, 2],  coin: 4, shootEvery: 1.4, shotSpeed: 240 },
    manholejumper: { hp: 8,  r: 14, speed: 110, count: [1, 3],  coin: 4, hopEvery: 1.6, hopSpeed: 260 },
    //  구간5
    spawnpod:      { hp: 14, r: 18, speed: 40,  count: [1, 2],  coin: 6, spawns: 'scrapbit', spawnN: 3, touchLoss: 2 },
    magnethead:    { hp: 9,  r: 16, speed: 75,  count: [1, 2],  coin: 8, stealCoins: 5 },
  },
  //  구간 보스 5종 — 공통 골격(좌우 이동+부채꼴 사격+접촉)에 스탯만 다르게. 스멜터는 잡졸 소환.
  boss: { baseHp: 120, hpPerTroop: 2.2, touchLossPerSec: 12 },
  bosses: [
    { key: 'b1', name: '그레이더',      hpMult: 0.35, r: 48, speed: 60,  shootEvery: 1.1, fan: 1, shotSpeed: 200, coin: 25 },
    { key: 'b2', name: '갠트리 위도우', hpMult: 0.50, r: 52, speed: 65,  shootEvery: 1.0, fan: 2, shotSpeed: 210, coin: 35 },
    { key: 'b3', name: '레일 리바이어던', hpMult: 0.70, r: 56, speed: 70, shootEvery: 1.0, fan: 4, shotSpeed: 200, coin: 45 },
    { key: 'b4', name: '스멜터',        hpMult: 0.85, r: 55, speed: 60,  shootEvery: 1.1, fan: 3, shotSpeed: 220, coin: 55, spawnEvery: 4 },
    { key: 'b5', name: '크라운 브레이커', hpMult: 1.0, r: 60, speed: 75,  shootEvery: 0.85, fan: 5, shotSpeed: 220, coin: 80 },
  ],
  coins: { perDistance: 0.01 },          // 거리 보정 코인(주 수입은 격파)
  fx: { slowmoAt: 5, slowmoDur: 0.5, slowmoScale: 0.4, slowmoMax: 2,
        continueTroops: 10, continueInvulnSec: 2, bossHushSec: 1.5,
        shakeDur: 0.25, shakeAmp: 7, hurtFlashDur: 0.35 },
  upgrades: {
    startTroops: { max: 9, effect: 1,    costs: [30, 80, 160, 280, 450, 680, 980, 1350, 1800] },
    fireRate:    { max: 5, effect: 0.05, costs: [40, 100, 200, 350, 550] },
    magnet:      { max: 5, effect: 0.10, costs: [25, 60, 120, 220, 380] },
  },
};
