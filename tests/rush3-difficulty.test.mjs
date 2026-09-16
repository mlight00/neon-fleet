// rush3-difficulty — 난이도 선택(계약서 3-8) V3-DIFF + V3-SIM-DIFF.
//  V3-DIFF: 배수 표가 적 hp·적탄·접촉·정예·스폰 수에 정확히 반영되고, normal 은 종전과 완전히 같다(기존 검사 174건은 그대로 통과).
//  V3-SIM-DIFF: 봇 정책 결과표(난이도 × 스테이지 × aim/center/plan). **봇 결과이지 사람의 성공률이 아니다.**
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAL3, DIFFICULTY_IDS, DEFAULT_DIFFICULTY, difficultyMult } from '../rush3/balance.js';
import { buildStage, STAGE_IDS } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, enemyDefsFor, STEP } from '../rush3/combat.js';
import { playPolicy } from './lib/rush3-policies.mjs';

const DIFFS = ['normal', 'hard', 'brutal'];

//  합성 스테이지(게이트·통·벽 없음). spawns 의 hp 는 ev.hp(스폰 정의 고정값) 경로
function synth(over = {}) {
  return { id: 'd', version: 2, title: 'diff', startUnits: 5, startWeapon: 'rifle', length: 100000, eliteZ: null,
           gateRows: [], supplies: [], walls: [], spawns: [], elite: null, ...over };
}
function play(run, sec, x = 240) {
  const ev = [];
  for (let i = 0; i < Math.round(sec / STEP) && !run.over; i++) {
    stepRun(run, { pointerX: x, dragDx: 0, keyDir: 0 }, STEP);
    ev.push(...drainEvents(run));
  }
  return ev;
}

// ─────────────────────────────────────────────────────────────────────────────
// V3-DIFF
// ─────────────────────────────────────────────────────────────────────────────
test('V3-DIFF DIFF-1: 배수 표 = 계약서 3-8 표 그대로(출발값) · id 목록 순서 · 모르는 id 는 throw', () => {
  assert.deepEqual(DIFFICULTY_IDS, DIFFS);
  assert.equal(DEFAULT_DIFFICULTY, 'normal');
  const pick = (m) => [m.enemyHp, m.eshotDmg, m.touchDmg, m.eliteHp, m.spawnCount, m.eliteFireRate];
  assert.deepEqual(pick(BAL3.difficulty.normal), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(pick(BAL3.difficulty.hard), [1.5, 2, 2, 1.6, 1.4, 1.25]);
  assert.deepEqual(pick(BAL3.difficulty.brutal), [2.2, 3, 3, 2.4, 1.8, 1.5]);
  assert.deepEqual(DIFFS.map((d) => BAL3.difficulty[d].label), ['보통', '어려움', '극한']);
  assert.deepEqual(DIFFS.map((d) => BAL3.difficulty[d].short), ['', '어려움', '극한'], 'HUD 짧은 표기는 어려움·극한만');
  assert.ok(Object.isFrozen(BAL3.difficulty) && Object.isFrozen(BAL3.difficulty.hard));
  assert.equal(difficultyMult('hard'), BAL3.difficulty.hard);
  assert.throws(() => difficultyMult('nope'), /unknown difficulty/);
  assert.throws(() => buildStage(1, { difficulty: 'nope' }), /unknown difficulty/);
  assert.throws(() => createRun(synth(), { difficulty: 'nope' }), /unknown difficulty/);
});

test('V3-DIFF DIFF-2: normal 은 종전과 완전히 같다 — buildStage(id) ≡ buildStage(id,{normal}), enemyDefs ≡ BAL3.enemies, run.difficulty=normal', () => {
  for (const id of STAGE_IDS) {
    const a = buildStage(id), b = buildStage(id, { difficulty: 'normal' });
    assert.deepEqual(a, b);
    assert.equal(a.difficulty, 'normal');
    assert.equal(createRun(a).difficulty, 'normal');
  }
  const en = enemyDefsFor('normal');
  for (const kind of Object.keys(BAL3.enemies)) assert.deepEqual(en[kind], BAL3.enemies[kind], kind + ' 은 배수 1 이면 원표와 같다');
  assert.deepEqual(enemyDefsFor(), en, '인자 생략 = normal');
  //  성장 축은 난이도와 무관: 게이트·통·벽·시작 병력·무기·길이·armZ·coverZ 가 세 난이도에서 deepEqual
  for (const id of STAGE_IDS) {
    const n = buildStage(id);
    for (const d of ['hard', 'brutal']) {
      const s = buildStage(id, { difficulty: d });
      assert.equal(s.difficulty, d);
      assert.deepEqual([s.gateRows, s.supplies, s.walls, s.startUnits, s.startWeapon, s.length, s.eliteZ, s.version],
                       [n.gateRows, n.supplies, n.walls, n.startUnits, n.startWeapon, n.length, n.eliteZ, n.version], `S${id} ${d}: 성장 축 불변`);
    }
  }
  assert.deepEqual([BAL3.squad.unitHp, BAL3.gate.armZ], [2, 340], '병사 hp·armZ 는 표에 없다(손대지 않는다)');
});

test('V3-DIFF DIFF-3: enemyDefsFor — hp(반올림)·접촉·적탄 dmg·정예 발사 주기가 배수대로, 나머지 필드는 그대로', () => {
  const rows = { normal: enemyDefsFor('normal'), hard: enemyDefsFor('hard'), brutal: enemyDefsFor('brutal') };
  const hp = (k) => DIFFS.map((d) => rows[d][k].hp);
  const touch = (k) => DIFFS.map((d) => rows[d][k].touchDmg);
  assert.deepEqual(hp('grunt'), [2, 3, 4]);     // 2×2.2 = 4.4 → 4
  assert.deepEqual(hp('rusher'), [4, 6, 9]);    // 4×2.2 = 8.8 → 9
  assert.deepEqual(hp('shooter'), [6, 9, 13]);  // 6×2.2 = 13.2 → 13
  assert.deepEqual(touch('grunt'), [1, 2, 3]);
  assert.deepEqual(touch('rusher'), [2, 4, 6]);
  assert.deepEqual(touch('elite'), [3, 6, 9]);
  assert.deepEqual(DIFFS.map((d) => rows[d].shooter.shot.dmg), [1, 2, 3], '어려움부터 적탄 1발 = 병사 1명(hp 2)');
  assert.deepEqual(DIFFS.map((d) => rows[d].elite.shot.dmg), [1, 2, 3]);
  assert.deepEqual(DIFFS.map((d) => +rows[d].elite.shootEvery.toFixed(4)), [1, 0.8, 0.6667]);
  assert.deepEqual(DIFFS.map((d) => rows[d].shooter.shootEvery), [1.6, 1.6, 1.6], '저격수 주기는 표에 없다(정예만)');
  for (const d of DIFFS) {
    const e = rows[d];
    assert.deepEqual([e.grunt.r, e.grunt.vz, e.grunt.track, e.rusher.accel, e.rusher.maxVz, e.shooter.aimTime, e.shooter.shot.vz, e.elite.fan, e.elite.fanDeg, e.elite.r, e.elite.summonN],
                     [14, 60, 0, 260, 420, 0.5, 260, 3, 18, 48, 2], d + ': 배수 대상이 아닌 필드는 그대로');
    assert.ok(Object.isFrozen(e) && Object.isFrozen(e.elite) && Object.isFrozen(e.elite.shot));
  }
  assert.equal(rows.hard.elite.hp, undefined, '정예 hp 는 스테이지 값(buildStage)이라 표에 없다');
});

test('V3-DIFF DIFF-4: buildStage — 정예 hp(eliteHp 반올림)·rows 스폰 n(spawnCount 반올림)만 바뀌고 xs 명시 스폰은 좌표까지 그대로', () => {
  assert.deepEqual(DIFFS.map((d) => STAGE_IDS.map((id) => buildStage(id, { difficulty: d }).elite.hp)),
                   [[120, 220, 500], [192, 352, 800], [288, 528, 1200]]);
  //  rows 스폰은 S3 z8800 잡졸(n 18, rows 2) 하나뿐
  const rowsN = DIFFS.map((d) => buildStage(3, { difficulty: d }).spawns.find((s) => s.z === 8800 && s.kind === 'grunt').n);
  assert.deepEqual(rowsN, [18, 25, 32]);   // 18×1.4 = 25.2 → 25 · 18×1.8 = 32.4 → 32
  for (const d of DIFFS) {
    const sp = buildStage(3, { difficulty: d }).spawns.find((s) => s.z === 8800 && s.kind === 'grunt');
    assert.equal(sp.xs.length, sp.n); assert.equal(sp.zs.length, sp.n);
    for (let i = 0; i < sp.n; i++) {
      assert.ok(sp.xs[i] >= 80 + 14 && sp.xs[i] <= 400 - 14, `${d} xs[${i}]=${sp.xs[i]} 도로 안`);
      assert.ok(sp.zs[i] >= 8800 + 760, `${d} zs[${i}] 화면 밖 위`);
    }
    //  rows 2 → 두 열(z 8800+760 / +800)에 나뉘고 앞 열이 ceil(n/2)
    const rowsZ = new Set(sp.zs.map((z) => Math.floor((z - 8800 - 760) / 40)));
    assert.deepEqual([...rowsZ].sort(), [0, 1], d + ' 두 열');
    assert.equal(sp.zs.filter((z) => z < 8800 + 760 + 40).length, Math.ceil(sp.n / 2), d + ' 앞 열 수');
  }
  //  xs 명시 스폰(회피 통로 규격의 대상)은 n·xs·zs·corridorHw 전부 normal 과 같다
  for (const id of STAGE_IDS) {
    const n = buildStage(id).spawns.filter((s) => !(id === 3 && s.z === 8800 && s.kind === 'grunt'));
    for (const d of ['hard', 'brutal']) {
      const s = buildStage(id, { difficulty: d }).spawns.filter((x) => !(id === 3 && x.z === 8800 && x.kind === 'grunt'));
      assert.deepEqual(s, n, `S${id} ${d}: xs 명시 스폰 불변`);
    }
  }
  //  buildStage 는 난이도별로도 호출마다 새 객체·결정적
  assert.deepEqual(buildStage(3, { difficulty: 'brutal' }), buildStage(3, { difficulty: 'brutal' }));
  assert.notEqual(buildStage(3, { difficulty: 'brutal' }).spawns, buildStage(3, { difficulty: 'brutal' }).spawns);
});

test('V3-DIFF DIFF-5: 실제 stepRun — 스폰된 잡졸 hp·돌격체 접촉 피해·저격수 적탄 피해·정예 발사 횟수가 배수대로 (createRun 의 난이도 덮어쓰기 경로)', () => {
  for (const d of DIFFS) {
    const m = BAL3.difficulty[d];
    //  잡졸 3기 스폰(ev.hp 없음 → enemyDefs 의 hp)
    const g = createRun(synth({ spawns: [{ z: 0, kind: 'grunt', n: 3, xs: [120, 240, 360], zs: [3000, 3000, 3000] }] }), { difficulty: d });
    assert.equal(g.difficulty, d);
    play(g, STEP);
    assert.deepEqual(g.enemies.map((e) => e.hp), Array(3).fill(Math.round(2 * m.enemyHp)), d + ' 잡졸 hp');
    //  ev.hp 가 명시된 스폰은 그 값 그대로(스테이지 정의 고정값 원칙)
    const gh = createRun(synth({ spawns: [{ z: 0, kind: 'grunt', n: 1, xs: [240], zs: [3000], hp: 7 }] }), { difficulty: d });
    play(gh, STEP);
    assert.equal(gh.enemies[0].hp, 7, d + ' ev.hp 명시는 배수와 무관');
    //  돌격체(hp 99999 로 안 죽게) 접촉 → hurt n = touchDmg
    const r = createRun(synth({ startUnits: 20, spawns: [{ z: 0, kind: 'rusher', n: 1, xs: [240], zs: [900], hp: 99999 }] }), { difficulty: d });
    const rev = play(r, 6);
    const touch = rev.find((e) => e.type === 'hurt' && e.cause === 'touch');
    assert.ok(touch, d + ' 돌격체 접촉이 났다');
    assert.equal(touch.n, Math.round(2 * m.touchDmg), d + ' 접촉 피해');
    //  저격수(hp 99999) 적탄 → hurt n = eshotDmg. 부대가 지나치기 전에 맞도록 멀리(z 1900) 둔다
    const s = createRun(synth({ startUnits: 20, spawns: [{ z: 0, kind: 'shooter', n: 1, xs: [240], zs: [1900], hp: 99999 }] }), { difficulty: d });
    const sev = play(s, 8);
    const shot = sev.find((e) => e.type === 'hurt' && e.cause === 'shot');
    assert.ok(shot, d + ' 저격수 탄이 맞았다');
    assert.equal(shot.n, Math.round(1 * m.eshotDmg), d + ' 적탄 피해(어려움부터 1발 = 병사 1명)');
    if (d !== 'normal') assert.ok(sev.some((e) => e.type === 'unitLost'), d + ' 적탄 1발에 병사 1명이 죽는다');
    //  정예(hp 100000) 부채꼴 발사 횟수: 6초 동안 floor(6 / shootEvery) 회(첫 발은 spawn 뒤 shootEvery 초)
    const b = createRun(synth({ startUnits: 30, elite: { z: 0, hp: 100000, summon: false } }), { difficulty: d });
    const bev = play(b, 6 + STEP / 2);
    const volleys = bev.filter((e) => e.type === 'eshot' && e.n === 3).length;
    assert.equal(volleys, Math.floor(6 / (1 / m.eliteFireRate) + 1e-9), d + ' 정예 발사 횟수');
    assert.equal(b.boss.max, 100000, '정예 hp 는 stage.elite.hp 그대로(배수는 buildStage 몫)');
  }
});

test('V3-DIFF DIFF-6: run.difficulty·run.enemyDefs 는 생성 시점에 확정되고 stepRun 소스에는 난이도 분기가 없다(V3-PURE 계열 정적 검사)', () => {
  const src = readFileSync(new URL('../rush3/combat.js', import.meta.url), 'utf8');
  const after = src.slice(src.indexOf('export function stepRun'));
  assert.ok(!/difficult/i.test(after), 'stepRun 이후 소스에 difficulty 참조가 없다');
  assert.ok(!/BAL3\.enemies|\bEN\[|\bEN\./.test(after), 'stepRun 이후에는 BAL3.enemies 를 직접 읽지 않는다(run.enemyDefs 만)');
  //  stage.difficulty 가 기본, opts.difficulty 가 덮어쓴다
  assert.equal(createRun(buildStage(2, { difficulty: 'hard' })).difficulty, 'hard');
  assert.equal(createRun(buildStage(2, { difficulty: 'hard' }), { difficulty: 'brutal' }).difficulty, 'brutal');
  assert.equal(createRun(synth()).difficulty, 'normal');
  const run = createRun(buildStage(2, { difficulty: 'brutal' }));
  assert.ok(Object.isFrozen(run.enemyDefs));
  assert.deepEqual(run.enemyDefs, enemyDefsFor('brutal'));
  //  같은 난이도·같은 입력열이면 결정적
  const pick = (r) => ({ z: r.z, x: r.x, units: r.units.map((u) => [u.id, u.hp]), kills: r.kills, time: r.time, weapon: r.weapon, peak: r.peak, won: r.won });
  assert.deepEqual(pick(playPolicy(2, 'aim', 14400, 'hard').run), pick(playPolicy(2, 'aim', 14400, 'hard').run));
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SIM-DIFF — 봇 결과표. 난이도 3 × 스테이지 3 × 정책(aim·center·plan) = 27판(각 판 상한 14,400 STEP).
//  ⚠️ 이 표는 **봇 정책의 결과**다. 사람의 성공률이 아니며 1판 결정적 시뮬이라 분포도 아니다.
//  실측(2026-09-16, 출발값 표): aim 은 normal S1~S3·hard S1·S3 완주, hard S2 와 brutal S1 은 정예전에서 전멸(코스는 끝까지 감).
//   hard S2 는 eliteHp 1.0·eliteFireRate 1.0 까지 내려도 aim 이 못 이긴다(정예 hp 56 잔존) — 원인은 적탄 dmg 2(1발 = 병사 1명) 와
//   옆으로 비키지 않는 봇의 조합(소총 21명 vs 정예 3발/초). 그래서 아래 검사는 그 두 판을 '기록'으로만 잡는다(보고서 §3).
// ─────────────────────────────────────────────────────────────────────────────
const SIM_POLICIES = ['aim', 'center', 'plan'];
const RUNS = {};
for (const d of DIFFS) for (const id of STAGE_IDS) for (const p of SIM_POLICIES) RUNS[d + ':' + id + ':' + p] = playPolicy(id, p, 14400, d);
const R = (d, id, p) => RUNS[d + ':' + id + ':' + p];
const row = (d, id, p) => {
  const r = R(d, id, p), run = r.run;
  return { difficulty: d, stage: id, policy: p, won: run.won, units: run.units.length, peak: run.peak, kills: run.kills, lossByShot: run.lossByShot, lossByTouch: run.lossByTouch,
           weapon: run.weapon, eliteReached: r.events.elite === 1, bossHpLeft: run.boss ? Math.ceil(run.boss.hp) : 0, time: +run.time.toFixed(1), steps: r.steps };
};
export const SIM_TABLE = [];
for (const d of DIFFS) for (const id of STAGE_IDS) for (const p of SIM_POLICIES) SIM_TABLE.push(row(d, id, p));

test('V3-SIM-DIFF SD-0: 27판 전부 상한 안에서 끝난다 · 결과표 출력(봇 결과 — 사람 성공률 아님)', (t) => {
  for (const r of SIM_TABLE) {
    assert.equal(R(r.difficulty, r.stage, r.policy).run.over, true, `${r.difficulty} S${r.stage} ${r.policy} 가 끝나지 않음`);
    assert.ok(r.steps < 14400);
  }
  for (const r of SIM_TABLE) t.diagnostic('SIM-DIFF ' + JSON.stringify(r));
});

test('V3-SIM-DIFF SD-1: normal 은 종전 그대로 — aim 3스테이지 완주, center 는 S1 만 완주', () => {
  for (const id of STAGE_IDS) assert.equal(R('normal', id, 'aim').run.won, true, `normal S${id} aim`);
  assert.equal(R('normal', 1, 'center').run.won, true);
  assert.equal(R('normal', 2, 'center').run.won, false);
  assert.equal(R('normal', 3, 'center').run.won, false);
});

test('V3-SIM-DIFF SD-2: hard — aim 이 S1·S3 완주. S2 는 코스 끝(정예 등장)까지 가되 정예전 전멸 = 기록', () => {
  assert.equal(R('hard', 1, 'aim').run.won, true, 'hard S1 aim');
  assert.equal(R('hard', 3, 'aim').run.won, true, 'hard S3 aim');
  const s2 = R('hard', 2, 'aim');
  assert.equal(s2.events.elite, 1, 'hard S2 aim: 정예까지 도달(코스 자체는 지날 수 있다)');
  assert.ok(s2.run.z >= 8200, 'hard S2 aim: 정예 z 도달');
  //  기록: 이긴다면 좋고, 지면 정예전 전멸이어야 한다(코스 중간 전멸이면 배치 문제 → 실패)
  if (!s2.run.won) assert.ok(s2.run.boss && s2.run.units.length === 0, 'hard S2 aim: 지더라도 정예전에서만 진다');
});

test('V3-SIM-DIFF SD-3: brutal — aim S1 은 정예까지 도달(정예전 결과는 기록), S2·S3 는 결과만 기록', () => {
  const s1 = R('brutal', 1, 'aim');
  assert.equal(s1.events.elite, 1, 'brutal S1 aim: 정예 등장까지 도달');
  if (!s1.run.won) assert.ok(s1.run.boss && s1.run.units.length === 0, 'brutal S1 aim: 지더라도 정예전에서만 진다');
  for (const id of [2, 3]) assert.equal(R('brutal', id, 'aim').run.over, true);
});

test('V3-SIM-DIFF SD-4: 무조작(center)은 hard·brutal 에서 S2·S3 실패 유지(units 0 → over, won 아님)', () => {
  for (const d of ['hard', 'brutal']) for (const id of [2, 3]) {
    const run = R(d, id, 'center').run;
    assert.equal(run.over, true);
    assert.equal(run.won, false, `${d} S${id} center 가 완주됨`);
    assert.equal(run.units.length, 0);
  }
});

test('V3-SIM-DIFF SD-5: 난이도 순서가 결과에 실린다 — 같은 스테이지·같은 봇이면 생존 병력 normal ≥ hard ≥ brutal, 손실은 그 반대', () => {
  for (const id of STAGE_IDS) for (const p of ['aim', 'plan']) {
    const u = DIFFS.map((d) => R(d, id, p).run.units.length);
    assert.ok(u[0] >= u[1] && u[1] >= u[2], `S${id} ${p} 생존 ${u.join(' ≥ ')}`);
    const loss = DIFFS.map((d) => { const r = R(d, id, p).run; return r.lossByShot + r.lossByTouch; });
    assert.ok(loss[0] <= loss[1] && loss[1] <= loss[2], `S${id} ${p} 손실 ${loss.join(' ≤ ')}`);
  }
  //  성장 축은 그대로: 같은 봇의 최고 병력(peak)은 난이도로 늘지 않는다
  for (const id of STAGE_IDS) for (const p of SIM_POLICIES) {
    const pk = DIFFS.map((d) => R(d, id, p).run.peak);
    assert.ok(pk[1] <= pk[0] && pk[2] <= pk[0], `S${id} ${p} peak ${pk.join('/')}`);
  }
});
