// E_weapon-direct.mjs — v4 기획 검토 E 담당(7번 '직격 화력' 이름): 영구 화력 +30%/단계를 **직격 피해(b.dmg)에만** 곱할 때 무기별 효과 차이 계산.
//  읽기 전용: balance.js·weapons.js·stages.js 를 import 만 한다. 결과 = E_weapon-direct.json. 전투 시뮬레이션이 아니라 산술 계산이다.
//  근거 코드: combat.js L411 `e.hp -= b.dmg`(직격) · L414-417 폭발·연쇄·기절은 WEAPONS[b.kind](무기 정의)에서 읽음 ·
//   weapons.js L48 탄에는 dmg 만 실림 · supply.js L193 통 내구도 b.dmg 로 깎임 · gates.js L87 게이트는 b.gateHit(피해와 무관)
//  처치 탄 수는 combat.js 와 같은 방식(hp 에서 dmg 를 반복해서 빼고 hp <= 0 이면 처치)으로 센다 — 부동소수 오차까지 그대로 재현.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BAL3 } from '../../../../rush3/balance.js';
import { weaponStats } from '../../../../rush3/weapons.js';
import { buildStage } from '../../../../rush3/stages.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEVELS = [0, 1, 2, 3, 4, 5];
const mulOf = (L) => 1 + 0.3 * L; // 기획 3-4 (가) 화력: 피해 × (1 + 0.3 × 단계)
const r3 = (v) => Math.round(v * 1000) / 1000;

function shotsToKill(hp, dmg) {
  let h = hp, n = 0;
  while (h > 0 && n < 10000) { h -= dmg; n++; }
  return n;
}
function shotsExact(hp, dmg) { return Math.ceil(hp / dmg - 1e-9); } // 오차 없는 산술값

//  1) 무기 정의에서 읽히는 값(강화 대상 밖)
const weapons = {};
for (const id of Object.keys(BAL3.weapons)) {
  const w = weaponStats(id, 1);
  const def = BAL3.weapons[id];
  weapons[id] = {
    name: def.name, direct: w.dmg, interval: w.interval, fan: w.fan, spreadDeg: w.spreadDeg, range: w.range, pierce: w.pierce,
    blastR: w.blastR, blastDmg: w.blastDmg, chain: w.chain, chainR: w.chainR, chainDmg: w.chainDmg, stunSec: def.stunSec ?? 0,
  };
}

//  2) 한 발(직격 1 + 부가 피해)이 주는 총피해 중 '직격 화력'이 키우는 몫
//   heavy: 직격 3 + 주변 k 체에 폭발 1씩(k = 0..3) / arc: 직격 1 + 연쇄 c 체에 1씩(c = 0..2) + 기절 0.8초(피해 아님)
const perShot = { heavy: [], arc: [] };
for (const k of [0, 1, 2, 3]) {
  const row = { neighbors: k };
  for (const L of LEVELS) {
    const base = weapons.heavy.direct + k * weapons.heavy.blastDmg;
    const up = weapons.heavy.direct * mulOf(L) + k * weapons.heavy.blastDmg;
    row['L' + L] = { total: r3(up), gainPct: r3((up / base - 1) * 100) };
  }
  perShot.heavy.push(row);
}
for (const c of [0, 1, 2]) {
  const row = { chained: c };
  for (const L of LEVELS) {
    const base = weapons.arc.direct + c * weapons.arc.chainDmg;
    const up = weapons.arc.direct * mulOf(L) + c * weapons.arc.chainDmg;
    row['L' + L] = { total: r3(up), gainPct: r3((up / base - 1) * 100) };
  }
  perShot.arc.push(row);
}

//  3) 산탄포 부채꼴: 거리 d 에서 가운데 탄과 옆 탄의 가로 간격 = d·tan(14°). 적 반지름 r + 탄 폭/2 보다 크면 옆 탄은 같은 적을 못 맞힌다
const scatterSpread = [];
const tan14 = Math.tan(weapons.scatter.spreadDeg * Math.PI / 180);
const radii = { grunt: BAL3.enemies?.grunt?.r ?? null, rusher: BAL3.enemies?.rusher?.r ?? null, shooter: BAL3.enemies?.shooter?.r ?? null };
for (const d of [60, 120, 200, 300, 420]) {
  const off = d * tan14;
  const row = { distance: d, sideOffsetPx: r3(off) };
  for (const [k, r] of Object.entries(radii)) if (r != null) row['sideHits_' + k] = off <= r + BAL3.weapons.scatter.w / 2;
  scatterSpread.push(row);
}

//  4) 지옥 1~24 실제 스폰 체력(정의에 적힌 ev.hp)별 처치 탄 수 — 무기별 · 단계별. 적 수(n)로 가중
const hpCount = new Map();
for (let id = 1; id <= 24; id++) {
  const st = buildStage(id, { difficulty: 'brutal' });
  for (const sp of st.spawns) if (Number.isFinite(sp.hp)) hpCount.set(sp.hp, (hpCount.get(sp.hp) || 0) + sp.n);
}
const hps = [...hpCount.keys()].sort((a, b) => a - b);
const totalEnemies = [...hpCount.values()].reduce((s, v) => s + v, 0);
const stk = {};
for (const wid of ['rifle', 'auto', 'scatter', 'heavy', 'sniper', 'arc']) {
  const base = weapons[wid].direct;
  const byLevel = {};
  for (const L of LEVELS) {
    const dmg = base * mulOf(L);
    let reduced = 0, fpExtra = 0, sumRatio = 0;
    const fpCases = [];
    for (const hp of hps) {
      const n = hpCount.get(hp);
      const s0 = shotsToKill(hp, base), sL = shotsToKill(hp, dmg), sX = shotsExact(hp, dmg);
      if (sL < s0) reduced += n;
      if (sL !== sX) { fpExtra += n; fpCases.push({ hp, dmg: r3(dmg), shotsSim: sL, shotsExact: sX }); }
      sumRatio += n * (sL / s0);
    }
    byLevel['L' + L] = {
      dmg: r3(dmg),
      enemiesWithFewerShotsPct: r3(reduced / totalEnemies * 100),
      meanShotsRatio: r3(sumRatio / totalEnemies),
      fpExtraShotEnemiesPct: r3(fpExtra / totalEnemies * 100),
      fpCases: fpCases.slice(0, 6),
    };
  }
  stk[wid] = byLevel;
}

const out = {
  meta: {
    script: 'E_weapon-direct.mjs', date: new Date().toISOString(),
    note: '산술 계산(전투 시뮬레이션 아님). 화력 단계 L 의 직격 피해 = 무기 피해 × (1 + 0.3L), Mk I 기준. 폭발·연쇄 피해와 기절 시간은 무기 정의 값 그대로(코드 현 구조).',
    codeRefs: {
      directHit: 'rush3/combat.js L411 e.hp -= b.dmg',
      weaponDefRead: 'rush3/combat.js L414 const w = WEAPONS[b.kind]; L415 stun(e, w.stunSec); L416 blast(run, e, w.blastR, w.blastDmg); L417 chainArc(run, e, w.chain, w.chainR, w.chainDmg, ev, w.stunSec)',
      bulletCarriesOnlyDmg: 'rush3/weapons.js L48 makeBullet: { ..., dmg: s.dmg, ..., kind: s.id, gateHit: 1 }',
      mkAlsoDirectOnly: 'rush3/weapons.js L22 "발사 간격·피해·탄 폭만 Mk 를 타고, 나머지(vz·fan·pierce·chain·blast)는 정의 그대로"',
      supplyUsesDmg: 'rush3/supply.js L193 const dmg = Math.max(0, bullet.dmg ?? 1)',
      gateIgnoresDmg: 'rush3/gates.js L87 const gain = Math.max(0, Math.trunc(bullet.gateHit ?? 1))',
    },
    brutalSpawnHpValues: Object.fromEntries(hps.map((h) => [h, hpCount.get(h)])),
    totalSpawnEnemies: totalEnemies,
  },
  weapons,
  perShotShareHeavyArc: perShot,
  scatterSpread,
  shotsToKillByWeapon: stk,
};
writeFileSync(join(HERE, 'E_weapon-direct.json'), JSON.stringify(out, null, 1));
console.log('hp values', JSON.stringify(out.meta.brutalSpawnHpValues), 'total', totalEnemies);
console.log('heavy', JSON.stringify(perShot.heavy.map((r) => [r.neighbors, r.L1.gainPct, r.L5.gainPct])));
console.log('arc', JSON.stringify(perShot.arc.map((r) => [r.chained, r.L1.gainPct, r.L5.gainPct])));
console.log('scatter', JSON.stringify(scatterSpread));
for (const [w, v] of Object.entries(stk)) console.log(w, 'L1', JSON.stringify({ fewer: v.L1.enemiesWithFewerShotsPct, ratio: v.L1.meanShotsRatio, fp: v.L1.fpExtraShotEnemiesPct }), 'L2', JSON.stringify({ fewer: v.L2.enemiesWithFewerShotsPct, ratio: v.L2.meanShotsRatio, fp: v.L2.fpExtraShotEnemiesPct }), 'L5', v.L5.meanShotsRatio);
