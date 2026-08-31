// rush/balance.js — 스타포지 러시 수치 단일 진실. 로직 없음.
export const BAL = {
  track: { length: 2600, scrollSpeed: 190, gateEvery: 300, firstGateZ: 260, waveEvery: 150, bossZ: 2600 },
  squad: { y: 640, moveSpeed: 420, unitSpacingX: 22, unitSpacingY: 18, drawCap: 130, startCount: 1,
           fireInterval: 0.5, bulletSpeed: 560, bulletDmg: 1, touchLossPerHit: 1 },
  tiers: [1, 25, 75, 150, 300],          // M1~M5 병력 임계
  gates: {
    colors: { add: '#35E5FF', mul: '#F6C84A', sub: '#FF6A3D', div: '#FF3DA5' },
    // 진행도 t(0..1)에 따른 값 범위
    addMin: 4, addMax: 40, mulVals: [2, 3], subMin: 5, subMax: 60, divVals: [2, 3],
    width: 190, gap: 26, h: 64,
  },
  enemies: {
    scrapbit:  { hp: 2,  r: 12, speed: 120, count: [4, 10], coin: 1 },
    ramhound:  { hp: 6,  r: 16, speed: 260, count: [1, 2],  coin: 3, rush: true, touchLoss: 3 },
    wallguard: { hp: 30, r: 24, speed: 45,  count: [1, 1],  coin: 5 },
    needleeye: { hp: 5,  r: 14, speed: 60,  count: [1, 2],  coin: 4, shootEvery: 1.4, shotSpeed: 240 },
  },
  boss: { baseHp: 120, hpPerTroop: 2.2, r: 55, speed: 90, shootEvery: 0.9, fan: 3, shotSpeed: 210,
          touchLossPerSec: 12, coin: 40 },
  coins: { perDistance: 0.01 },          // 거리 보정 코인(주 수입은 격파)
  fx: { slowmoAt: 5, slowmoDur: 0.5, slowmoScale: 0.4, slowmoMax: 2,
        continueTroops: 10, continueInvulnSec: 2, bossHushSec: 1.5 },
  upgrades: {
    startTroops: { max: 9, effect: 1,    costs: [30, 80, 160, 280, 450, 680, 980, 1350, 1800] },
    fireRate:    { max: 5, effect: 0.05, costs: [40, 100, 200, 350, 550] },
    magnet:      { max: 5, effect: 0.10, costs: [25, 60, 120, 220, 380] },
  },
};
