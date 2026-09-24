// A_first-buy.mjs — 검토 1번(첫 구매가 눈에 보여야 함) 측정 스크립트. 게임 코드는 읽기만 한다(수정·커밋 없음).
//  1) buildStage(1~3, {difficulty:'brutal'}) 를 덤프해 적 종류별 실제 체력·무기 통을 정리한다.
//     createRun 뒤 run.enemyDefs(소환 잡졸 체력)·run.elites(보스 체력)도 함께 읽는다.
//  2) '메인 로봇 한 대'의 처치 탄 수 표: 무기(소총·기관총·중화기, Mk I) × 화력 단계 0~5(피해 × (1 + 0.3k)) × 적 체력.
//     ceil(체력 ÷ 피해) 와, 게임이 실제로 쓰는 뺄셈(e.hp -= b.dmg; e.hp <= 0 이면 사망, combat.js L411·L413)을
//     그대로 흉내 낸 '뺄셈 탄 수'를 같이 적는다(소수 피해의 부동소수 오차 확인용).
//  3) 연사 1~2(간격 × 0.87^r)·다연발 1~3(한 번에 1+m 발)이 '처치 시간'을 몇 % 줄이는지.
//     처치 시간 = 발사 횟수 × 발사 간격(메인 로봇 총이 적 한 기에 쓰는 시간, 비행 시간 제외).
//     발사 횟수 = ceil(필요 탄 수 ÷ 한 번에 나가는 탄 수). 다연발 탄은 모두 같은 적에 맞는다고 가정(상한값).
//  ⚠️전부 계산값이다(전탄 명중 가정). 사람의 체감·성공률이 아니다.
//  실행: node A_first-buy.mjs  → A_first-buy.json
import { writeFileSync } from 'node:fs';
import { buildStage, DEFS } from '../../../../rush3/stages.js';
import { createRun } from '../../../../rush3/combat.js';
import { BAL3 } from '../../../../rush3/balance.js';
import { weaponStats } from '../../../../rush3/weapons.js';

const DIFF = 'brutal';
const POWER_STEP = 0.3, RATE_MUL = 0.87;

// ── 1) 스테이지 덤프 ─────────────────────────────────────────────
function isBrutalExtra(id, sp) {
  const extra = DEFS[id].brutalSpawns || [];
  return extra.some((b) => b.z === sp.z && b.kind === sp.kind);
}
const stages = {};
const hpSet = new Map();   // label → hp
for (const id of [1, 2, 3]) {
  const st = buildStage(id, { difficulty: DIFF });
  const run = createRun(st);
  const spawns = st.spawns.map((s) => ({ z: s.z, kind: s.kind, n: s.n, hp: s.hp, fromBrutalSpawns: isBrutalExtra(id, s) }));
  const elites = run.elites.map((e) => ({ z: e.z, hp: e.hp, summon: e.summon, role: e.role ?? 'elite' }));
  const summonHp = run.elites.some((e) => e.summon) ? run.enemyDefs[BAL3.enemies.elite.summonKind].hp : null;
  const weaponCrates = st.supplies.filter((s) => s.kind === 'weapon').map((s) => ({ id: s.id, z: s.z, x: s.x, weapon: s.payload.weapon, durability: s.durability, pairId: s.pairId }));
  const supplyDur = st.supplies.map((s) => ({ id: s.id, kind: s.kind, durability: s.durability }));
  stages[id] = {
    difficulty: st.difficulty, difficultyHp: st.difficultyHp, enemyHpMul: st.enemyHpMul, startUnits: st.startUnits, startWeapon: st.startWeapon,
    tableHp: Object.fromEntries(Object.entries(run.enemyDefs).filter(([, d]) => d.hp != null).map(([k, d]) => [k, d.hp])),
    spawns, elites, summonKind: summonHp != null ? BAL3.enemies.elite.summonKind : null, summonHp,
    weaponCrates, supplyDur,
    lotteryDefaultSeedPick: st.lottery ? { pick: st.lottery.pick, kind: st.lottery.kind, label: st.lottery.label } : null,
  };
  for (const s of spawns) {
    const label = s.kind + (s.hp !== run.enemyDefs[s.kind].hp ? '(장갑 hp' + s.hp + ')' : '');
    hpSet.set(label, s.hp);
  }
  elites.forEach((e) => hpSet.set('boss S' + id, e.hp));
  if (summonHp != null) hpSet.set('summon grunt S' + id, summonHp);
}
// 랜덤 길 풀(3번 우측 통로, 셸은 판마다 시계 시드로 뽑는다). 무기 통이 들어 있는지
const lotteryPool = BAL3.lottery.pool.map((p) => ({ id: p.id, kind: p.kind, weapon: p.weapon ?? null, durability: p.durability ?? null, chance: 1 / BAL3.lottery.pool.length }));

// ── 2) 처치 탄 수 표 ─────────────────────────────────────────────
function shotsSub(hp, dmg) {        // 게임과 같은 뺄셈(combat.js L411·L413 / supply.js L194-195)
  let h = hp, n = 0;
  while (h > 0) { h -= dmg; n++; if (n > 100000) return Infinity; }
  return n;
}
const WEAPON_IDS = ['rifle', 'auto', 'heavy'];
const enemyHp = [...new Set([...hpSet.values()])].sort((a, b) => a - b);
const hpLabels = {};
for (const [label, hp] of hpSet) (hpLabels[hp] ||= []).push(label);

const shotTable = [];
const floatMismatch = [];
for (const wid of WEAPON_IDS) {
  const w = weaponStats(wid, 1);
  for (let k = 0; k <= 5; k++) {
    const dmg = w.dmg * (1 + POWER_STEP * k);
    const row = { weapon: wid, mk: 1, power: k, dmg, interval: w.interval, byHp: {} };
    for (const hp of enemyHp) {
      const c = Math.ceil(hp / dmg), s = shotsSub(hp, dmg);
      row.byHp[hp] = { ceil: c, sub: s };
      if (c !== s) floatMismatch.push({ weapon: wid, power: k, dmg, hp, ceil: c, sub: s });
    }
    shotTable.push(row);
  }
}
// 화력 1단계가 탄 수를 바꾸는가(0단계 대비). 뺄셈 기준
const power1Visible = [];
for (const wid of WEAPON_IDS) {
  const r0 = shotTable.find((r) => r.weapon === wid && r.power === 0), r1 = shotTable.find((r) => r.weapon === wid && r.power === 1);
  for (const hp of enemyHp) power1Visible.push({ weapon: wid, hp, labels: hpLabels[hp], shots0: r0.byHp[hp].sub, shots1: r1.byHp[hp].sub, changed: r1.byHp[hp].sub < r0.byHp[hp].sub,
    killTimeCut: 1 - r1.byHp[hp].sub / r0.byHp[hp].sub });
}

// ── 3) 연사·다연발·화력의 처치 시간 단축 ───────────────────────
//  처치 시간 = volleys × interval, volleys = ceil(shots ÷ perVolley). 기준 = 같은 무기 0단계
const killTime = [];
const variants = [
  { key: 'power1', power: 1, rate: 0, multi: 0 }, { key: 'power2', power: 2, rate: 0, multi: 0 },
  { key: 'rate1', power: 0, rate: 1, multi: 0 }, { key: 'rate2', power: 0, rate: 2, multi: 0 },
  { key: 'multi1', power: 0, rate: 0, multi: 1 }, { key: 'multi2', power: 0, rate: 0, multi: 2 }, { key: 'multi3', power: 0, rate: 0, multi: 3 },
];
for (const wid of WEAPON_IDS) {
  const w = weaponStats(wid, 1);
  for (const hp of enemyHp) {
    const base = shotsSub(hp, w.dmg) * w.interval;
    const row = { weapon: wid, hp, labels: hpLabels[hp], baseSec: base, cut: {} };
    for (const v of variants) {
      const shots = shotsSub(hp, w.dmg * (1 + POWER_STEP * v.power));
      const volleys = Math.ceil(shots / (1 + v.multi));
      const t = volleys * w.interval * Math.pow(RATE_MUL, v.rate);
      row.cut[v.key] = { sec: t, cutPct: Math.round((1 - t / base) * 1000) / 10 };
    }
    killTime.push(row);
  }
}
// 연속 사격(적이 줄지어 오는 경우) 기준 E = 병사 몇 명분. 화력은 적마다 계단식이라 E 가 체력마다 다르다(아래 effectivePowerE)
const E = { power1: 1 + POWER_STEP, rate1: 1 / RATE_MUL, rate2: 1 / (RATE_MUL * RATE_MUL), multi1: 2, multi2: 3, multi3: 4 };
const effectivePowerE = [];
for (const wid of WEAPON_IDS) {
  const w = weaponStats(wid, 1);
  for (const hp of enemyHp) effectivePowerE.push({ weapon: wid, hp, E_power1: shotsSub(hp, w.dmg) / shotsSub(hp, w.dmg * 1.3) });
}

// 보급 통 내구(피해가 그대로 먹는다, supply.js L193-194). 메인 로봇 한 대의 탄 수
const supplyTable = [];
const durs = [...new Set(Object.values(stages).flatMap((s) => s.supplyDur.map((d) => d.durability)).concat(lotteryPool.map((p) => p.durability).filter((d) => d != null)))].sort((a, b) => a - b);
for (const wid of WEAPON_IDS) {
  const w = weaponStats(wid, 1);
  const row = { weapon: wid, byDur: {} };
  for (const d of durs) row.byDur[d] = { power0: shotsSub(d, w.dmg), power1: shotsSub(d, w.dmg * 1.3), power2: shotsSub(d, w.dmg * 1.6) };
  supplyTable.push(row);
}

const out = {
  kind: '계산값(전탄 명중·메인 로봇 한 대·Mk I 가정). 봇 판 결과가 아니고 사람 성공률도 아니다',
  generatedBy: 'A_first-buy.mjs',
  assumptions: [
    '화력 k 단계 피해 = 무기 피해 × (1 + 0.3k) (기획 3-4 (가)). 구현이 반올림을 넣으면 탄 수가 달라질 수 있다',
    '뺄셈 탄 수 = 게임과 같은 e.hp -= dmg 반복(부동소수). ceil 탄 수 = ceil(체력 ÷ 피해)',
    '처치 시간 = 발사 횟수 × 발사 간격(첫 발 이후 총이 그 적에 묶이는 시간, 비행 시간 제외). 다연발 탄은 모두 같은 적에 맞는다고 가정',
    '중화기 폭발(blastDmg 1)·전격 연쇄는 WEAPONS 에서 읽으므로 화력 강화가 적용되지 않는다고 보고 제외(직격만)',
    '1~3번에서 Mk III(피해 +1)는 스테이지 데이터상 도달 불가: 같은 무기 통이 판마다 최대 1개(3번은 중화기 통 + 랜덤 길 중화기일 때만 Mk II). Mk II 는 피해가 같아 탄 수 표가 같다',
  ],
  stages, lotteryPool, enemyHp, hpLabels,
  weaponsMk1: Object.fromEntries(WEAPON_IDS.map((w) => [w, weaponStats(w, 1)])),
  shotTable, floatMismatch, power1Visible, killTime, E, effectivePowerE, supplyTable,
};
writeFileSync(new URL('./A_first-buy.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');

// 콘솔 요약
console.log('HP:', JSON.stringify(hpLabels));
for (const r of power1Visible) console.log(`${r.weapon} hp${r.hp} ${r.labels.join('/')}: ${r.shots0} -> ${r.shots1}${r.changed ? '  (줄어듦)' : ''}`);
console.log('float mismatch:', JSON.stringify(floatMismatch));
for (const r of killTime) console.log(r.weapon, 'hp' + r.hp, Object.entries(r.cut).map(([k, v]) => k + ' ' + v.cutPct + '%').join(' | '));
