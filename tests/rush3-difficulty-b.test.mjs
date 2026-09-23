// rush3-difficulty-b — 난이도 B안(r3.21, 이사 결정 2026-09-20) V3-DIFFB.
//  ① 적 체력 스테이지 구간 배율(BAL3.enemyHpByStage) 단조 증가 · makeSpawn 이 ev.hp 를 항상 명시 · 소환 잡졸도 같은 배율 · spawnEnemy 가 hpMax 기록
//  ② 획득 숫자 후처리(gain 0.5 → 1.0) 정수·단조(벽 표지 soldier n 도 — 검수 반영, 대조는 STG-5 가 1~24 전부) · 3칸 행 값 서로 다름 · 음수 칸 max > 양수 칸 max · 부대 상한 100(BAL3 = SQUAD_DEFAULTS)
//  ③ 봇 실측: planBoss 보통 1~24 완주(⚠️4~24 planBoss = 정예 전 무입력) · evLead 보통 4~24 완주(DB-7b, 4~24 성공 경로) · 지옥 무입력 S13 이상 실패 ≥ 70% · 머리 위 체력 숫자 렌더(12px, hpMax > 2 만, HUD 아래·지나간 적 제외)
//  ④ 대항 검수 반영(2026-09-20): 1~3 기준 코스는 난이도 체력 배수(enemyHp·eliteHp)도 ×1(enemyHpByStage difficultyHp: false) — hard S2 성공 경로(SD-7) 보존
//  ⚠️봇 결과는 사람의 성공률이 아니다(결정적 1판). 표 전체는 보고서 newmode/v3/research/difficulty-b-20260920/report.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3, enemyHpMulFor, difficultyHpFor, difficultyMult } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS, STAGE_IDS, MAX_DY, DEFS } from '../rush3/stages.js';
import { COURSE_IDS, gainFor } from '../rush3/courses.js';
import { createRun, stepRun, drainEvents, enemyDefsFor, STEP } from '../rush3/combat.js';
import { SQUAD_DEFAULTS, formation } from '../rush3/squad.js';
import { createRenderer3, ZOOM, HUD_ROW, HP_TAG_MIN_Y } from '../rush3/render.js';
import { projectorFor } from '../rush3/project.js';
import { playPolicy } from './lib/rush3-policies.mjs';

const DIFFS = ['normal', 'hard', 'brutal'];

//  정의에 체력을 직접 적은 스폰의 hp(1~3 = stages.DEFS 의 spawns·지옥이면 brutalSpawns). 4~24 는 스킨 hp 로 표현되므로 여기서 다루지 않는다
function explicitHp(id, d, sp) {
  if (!DEFS[id]) return undefined;
  const defs = DEFS[id].spawns.concat(d === 'brutal' ? (DEFS[id].brutalSpawns ?? []) : []);
  return defs.find((x) => x.z === sp.z && x.kind === sp.kind && x.hp != null)?.hp;
}

//  courses.js 의 역할 근사 스킨 → 정의 hp(ARMOR 10 · POD 14 · MAGNET 9 · CART 20). 나머지 스킨·무스킨은 표 hp
const SKIN_HP = { E3_wallguard: 10, E9_spawnpod: 14, E10_magnethead: 9, E7_cartyard: 20 };
const at = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });
function synth(over = {}) {
  return { id: 'db', version: 1, title: 'diffb', startUnits: 5, startWeapon: 'rifle', length: 100000, eliteZ: null,
           gateRows: [], supplies: [], walls: [], spawns: [], elite: null, ...over };
}
function play(run, sec, x = 240) {
  const ev = [];
  for (let i = 0; i < Math.round(sec / STEP) && !run.over; i++) { stepRun(run, at(x), STEP); ev.push(...drainEvents(run)); }
  return ev;
}

// ─────────────────────────────────────────────────────────────────────────────
test('V3-DIFFB DB-1: 구간 배율 표 — to 오름차순·mul 단조 증가·1~3 은 1(difficultyHp false)·24 까지 덮음, enemyHpMulFor/difficultyHpFor 는 표 값(비숫자·범위 밖은 1/true), 난이도 표 hard 1.5/1.25·brutal 2/1.5', () => {
  const T = BAL3.enemyHpByStage;
  assert.ok(Object.isFrozen(T) && T.length >= 2);
  for (let i = 1; i < T.length; i++) { assert.ok(T[i].to > T[i - 1].to, '구간 오름차순'); assert.ok(T[i].mul > T[i - 1].mul, '배율 단조 증가'); }
  assert.equal(T[0].to, 3); assert.equal(T[0].mul, 1, '1~3 기준 코스는 ×1');
  assert.equal(T.at(-1).to, 24);
  assert.deepEqual(T.map((r) => [r.to, r.mul]), [[3, 1], [8, 2], [12, 4], [18, 7], [24, 12]], '출발값(이사 지시) — 봇 스윕으로 바꾸면 보고서와 함께 갱신');
  const want = (id) => T.find((r) => id <= r.to).mul;
  for (const id of ALL_STAGE_IDS) assert.equal(enemyHpMulFor(id), want(id), 'S' + id);
  for (const id of STAGE_IDS) assert.equal(enemyHpMulFor(id), 1);
  assert.equal(enemyHpMulFor('proto3'), 1); assert.equal(enemyHpMulFor('d'), 1); assert.equal(enemyHpMulFor(undefined), 1); assert.equal(enemyHpMulFor(999), 1);
  //  r3.22 지옥 강화(2026-09-22): 1~3 구간은 **지옥에서만** 난이도 체력 배수(difficultyHp: ['brutal']). 보통·어려움은 종전(r3.9 판) 그대로.
  //   difficultyHpFor(id) 처럼 난이도를 생략하면 배열 행은 false(적용 안 함). 나머지 구간·비숫자·범위 밖은 true
  assert.deepEqual(T[0].difficultyHp, ['brutal']);
  for (let i = 1; i < T.length; i++) assert.notEqual(T[i].difficultyHp, false, '구간 ' + i);
  for (const id of STAGE_IDS) {
    assert.equal(difficultyHpFor(id), false, 'S' + id + ' 난이도 생략');
    assert.equal(difficultyHpFor(id, 'normal'), false, 'S' + id + ' 보통');
    assert.equal(difficultyHpFor(id, 'hard'), false, 'S' + id + ' 어려움');
    assert.equal(difficultyHpFor(id, 'brutal'), true, 'S' + id + ' 지옥');
  }
  for (const id of COURSE_IDS) assert.equal(difficultyHpFor(id), true, 'S' + id);
  assert.equal(difficultyHpFor('proto3'), true); assert.equal(difficultyHpFor(undefined), true); assert.equal(difficultyHpFor(999), true);
  assert.deepEqual(DIFFS.map((d) => [difficultyMult(d).enemyHp, difficultyMult(d).eliteHp]), [[1, 1], [1.5, 1.25], [2, 1.5]]);
});

test('V3-DIFFB DB-2: makeSpawn — 1~24 × 3난이도 모든 스폰의 hp = round((정의 hp ?? 표 hp) × 구간 배율 × enemyHp) 를 항상 명시(1~3 은 enemyHp·eliteHp ×1 = 세 난이도 같은 체력), stage.enemyHpMul·difficultyHp 기록, 정예 hp 는 구간 배율 없이 × eliteHp 만', () => {
  for (const id of ALL_STAGE_IDS) {
    const mul = enemyHpMulFor(id);
    const base = buildStage(id);
    for (const d of DIFFS) {
      const st = buildStage(id, { difficulty: d });
      const m = difficultyMult(d);
      assert.equal(st.enemyHpMul, mul, `S${id} ${d} enemyHpMul`);
      assert.equal(st.difficultyHp, id > 3 || d === 'brutal', `S${id} ${d} difficultyHp`);
      const eh = st.difficultyHp ? m.enemyHp : 1, bh = st.difficultyHp ? m.eliteHp : 1;
      assert.ok(st.spawns.length > 0);
      for (const sp of st.spawns) {
        //  정의에 체력을 직접 적은 스폰(r3.25 지옥 1번 단단한 잡졸 등)이 먼저 — 없으면 스킨 체력 → 표 체력
        const defHp = explicitHp(id, d, sp) ?? SKIN_HP[sp.skin] ?? BAL3.enemies[sp.kind].hp;
        assert.ok(Number.isInteger(sp.hp) && sp.hp > 0, `S${id} ${d} 스폰 hp 정수`);
        assert.equal(sp.hp, Math.round(defHp * mul * eh), `S${id} ${d} ${sp.kind}${sp.skin ? '(' + sp.skin + ')' : ''} z${sp.z} hp`);
      }
      //  정예: 구간 배율 없음 — normal 값 × eliteHp(1~3 은 ×1)
      for (let k = 0; k < st.elites.length; k++) assert.equal(st.elites[k].hp, Math.round(base.elites[k].hp * bh), `S${id} ${d} 정예 ${k}`);
    }
    //  같은 스테이지 안에서 난이도 순으로 단조 증가. r3.22: 지옥 전용 추가 무리(brutalSpawns)가 z 순 정렬 중간에 끼므로
    //   번호(k)가 아니라 **이벤트 z·종류**로 짝을 맞춘다(추가 무리는 보통·어려움에 짝이 없어 비교에서 빠진다)
    for (let k = 0; k < base.spawns.length; k++) {
      const b0 = base.spawns[k];
      const hp = DIFFS.map((d) => buildStage(id, { difficulty: d }).spawns.find((x) => x.z === b0.z && x.kind === b0.kind && x.skin === b0.skin).hp);
      assert.ok(hp[0] <= hp[1] && hp[1] <= hp[2], `S${id} 무리 ${k}(z${b0.z} ${b0.kind}) 난이도 단조 ${hp}`);
    }
  }
  //  스테이지 순으로 표 잡졸(스킨 없음) hp 가 내려가지 않는다(구간 배율 단조)
  let prev = 0;
  for (const id of ALL_STAGE_IDS) {
    const g = buildStage(id).spawns.find((s) => s.kind === 'grunt' && !s.skin);
    if (!g) continue;
    assert.ok(g.hp >= prev, `S${id} 잡졸 hp ${g.hp} < 앞 스테이지 ${prev}`);
    prev = g.hp;
  }
  assert.deepEqual([4, 9, 13, 19].map((id) => buildStage(id).spawns.find((s) => s.kind === 'grunt' && !s.skin).hp), [4, 8, 14, 24]);
  //  1~3: 보통·어려움의 잡졸·정예 체력이 같다(r3.9 = 33568b2 와 동일) · 지옥만 × enemyHp·eliteHp(r3.22) · 4 부터는 세 난이도 모두 배수
  const s2 = buildStage(2).spawns.map((s) => s.hp);
  assert.deepEqual(buildStage(2, { difficulty: 'hard' }).spawns.map((s) => s.hp), s2, 'S2 어려움 = 보통');
  assert.deepEqual(buildStage(2, { difficulty: 'brutal' }).spawns.map((s) => s.hp), s2.map((h) => Math.round(h * BAL3.difficulty.brutal.enemyHp)), 'S2 지옥 = 보통 × enemyHp');
  assert.deepEqual(DIFFS.map((d) => buildStage(3, { difficulty: d }).elite.hp), [500, 500, Math.round(500 * BAL3.difficulty.brutal.eliteHp)]);
  assert.deepEqual(DIFFS.map((d) => buildStage(4, { difficulty: d }).spawns[0].hp), [4, 6, 8]);
  assert.equal(buildStage(13).spawns.find((s) => s.skin === 'E3_wallguard').hp, 70, '장갑체 10 × 7');
  assert.equal(buildStage(21, { difficulty: 'brutal' }).spawns.find((s) => s.skin === 'E7_cartyard').hp, 480, '카트 20 × 12 × 2');
});

test('V3-DIFFB DB-3: enemyDefsFor(difficulty, hpMul, difficultyHp) — 표 hp × hpMul × enemyHp(반올림, difficultyHp false 면 enemyHp 대신 1), run.enemyDefs 가 stage.enemyHpMul·difficultyHp 를 받는다, 정예·아레나 보스 소환 잡졸도 같은 체력, spawnEnemy 가 hpMax 를 기록', () => {
  for (const d of DIFFS) for (const mul of [1, 2, 4, 7, 12]) {
    const e = enemyDefsFor(d, mul), m = difficultyMult(d);
    for (const kind of ['grunt', 'rusher', 'shooter']) assert.equal(e[kind].hp, Math.round(BAL3.enemies[kind].hp * mul * m.enemyHp), `${d} ×${mul} ${kind}`);
    assert.equal(e.elite.hp, undefined);
    //  difficultyHp false: 체력만 배수 없이(적탄·접촉·주기는 그대로 배수)
    const f = enemyDefsFor(d, mul, false);
    for (const kind of ['grunt', 'rusher', 'shooter']) assert.equal(f[kind].hp, BAL3.enemies[kind].hp * mul, `${d} ×${mul} ${kind} difficultyHp false`);
    assert.deepEqual([f.shooter.shot.dmg, f.grunt.touchDmg, f.elite.shootEvery], [e.shooter.shot.dmg, e.grunt.touchDmg, e.elite.shootEvery], d + ' 나머지 배수는 그대로');
  }
  assert.deepEqual(enemyDefsFor('normal', 1), enemyDefsFor('normal'), '생략 = 1');
  assert.deepEqual(enemyDefsFor('hard', 2, true), enemyDefsFor('hard', 2), '생략 = true');
  for (const id of [1, 2, 3, 4, 9, 13, 19]) for (const d of DIFFS) {
    const st = buildStage(id, { difficulty: d });
    assert.deepEqual(createRun(st).enemyDefs, enemyDefsFor(d, st.enemyHpMul, st.difficultyHp), `S${id} ${d} run.enemyDefs`);
  }
  //  1~3(S3 정예 소환): run.enemyDefs 의 잡졸 hp 가 보통·어려움 2(r3.9 와 같음), 지옥은 × enemyHp(r3.22)
  for (const d of DIFFS) {
    const want = d === 'brutal' ? Math.round(2 * BAL3.difficulty.brutal.enemyHp) : 2;
    assert.equal(createRun(buildStage(3, { difficulty: d })).enemyDefs.grunt.hp, want, d + ' S3 소환 잡졸 hp');
  }
  //  도로 스폰: ev.hp 그대로 + hpMax 기록
  const g = createRun(synth({ spawns: [{ z: 0, kind: 'grunt', n: 2, xs: [200, 280], zs: [3000, 3000], hp: 14 }] }));
  play(g, STEP);
  assert.deepEqual(g.enemies.map((e) => [e.hp, e.hpMax]), [[14, 14], [14, 14]]);
  //  맞으면 hp 만 줄고 hpMax 는 남는다
  const h = createRun(synth({ startUnits: 10, spawns: [{ z: 0, kind: 'grunt', n: 1, xs: [240], zs: [700], hp: 40 }] }));
  const hev = play(h, 2);
  assert.ok(hev.some((e) => e.type === 'enemyHit'));
  assert.ok(h.enemies[0].hp < 40 && h.enemies[0].hpMax === 40);
  //  정예 소환(ev.hp 없이 spawnEnemy): 합성 stage.enemyHpMul 7 → 잡졸 hp 14(보통)·21(어려움)·28(지옥)
  //   정예는 하강(≈2.3s) 뒤 summonEvery 마다 소환하고, 소환 잡졸은 부대 사격에 곧 죽으므로 소환 STEP 에 바로 본다
  for (const d of DIFFS) {
    const run = createRun(synth({ startUnits: 30, enemyHpMul: 7, elite: { z: 0, hp: 100000, summon: true } }), { difficulty: d });
    let sumEv = null;
    for (let i = 0; i < 600 && !sumEv && !run.over; i++) { stepRun(run, at(240), STEP); for (const e of drainEvents(run)) if (e.type === 'summon') sumEv = e; }
    assert.ok(sumEv, d + ' 소환이 났다');
    const summoned = run.enemies.filter((e) => e.kind === 'grunt' && Math.abs(e.z - sumEv.z) < 1e-6);
    assert.ok(summoned.length >= 2, d + ' 소환 잡졸 2');
    const want = Math.round(2 * 7 * difficultyMult(d).enemyHp);
    for (const e of summoned) assert.deepEqual([e.hp, e.hpMax], [want, want], d + ' 소환 잡졸 hp');
  }
  //  실제 코스(S12 정예 소환, ×4): 소환 잡졸 hp = 도로 잡졸 hp = 8
  const r12 = createRun(buildStage(12));
  let sum = null;
  for (let i = 0; i < 14400 && !sum; i++) { stepRun(r12, at(240), STEP); for (const e of drainEvents(r12)) if (e.type === 'summon') sum = e; }
  assert.ok(sum, 'S12 정예가 소환했다');
  const summoned = r12.enemies.filter((e) => e.kind === 'grunt' && Math.abs(e.z - sum.z) < 1e-6);
  assert.ok(summoned.length >= 1, '소환 잡졸이 같은 STEP 에 놓였다');
  for (const e of summoned) assert.deepEqual([e.hp, e.hpMax], [8, 8]);
  assert.equal(buildStage(12).spawns.find((s) => s.kind === 'grunt').hp, 8);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-DIFFB DB-4: 획득 숫자 후처리 — gain(4) 0.5 → gain(24) 1.0 단조, 1~3·랜덤 길 풀 불변, 4~24 게이트 값·상한·통 n·발판이 정수(양수 최소 1), S4/S24 표본', () => {
  assert.equal(gainFor(4), 0.5); assert.equal(gainFor(24), 1); assert.equal(gainFor(14), 0.75);
  for (let id = 5; id <= 24; id++) assert.ok(gainFor(id) > gainFor(id - 1), 'gain 단조 ' + id);
  assert.equal(gainFor(3), 1); assert.equal(gainFor(1), 1);
  //  1~3: 종전 값 그대로(계약서 §5 표)
  assert.deepEqual(buildStage(2).gateRows.map((r) => r.cells.map((c) => [c.value, c.maxValue])), [[[1, 3], [-20, 20]], [[2, 12], [-20, 40]]]);
  assert.deepEqual(buildStage(3).supplies.map((s) => s.payload.n ?? s.payload.pads0 ?? s.payload.weapon), [2, 2, 3, 5, 5, 'auto', 'heavy', 4, 10]);
  assert.deepEqual(BAL3.lottery.pool.map((p) => p.n ?? p.value ?? p.pads0 ?? p.weapon), [8, 'heavy', 6, -15, -10], '랜덤 길 풀 불변');
  for (const id of COURSE_IDS) {
    const st = buildStage(id);
    for (const row of st.gateRows) {
      for (const c of row.cells) {
        assert.ok(Number.isInteger(c.value) && Number.isInteger(c.maxValue), `S${id} ${row.id} 정수`);
        assert.ok(c.value !== 0, `S${id} ${row.id} 0 칸 없음`);
        assert.ok(c.maxValue >= c.value, `S${id} ${row.id} 상한 ≥ 값`);
      }
    }
    for (const s of st.supplies) {
      if (s.kind === 'soldier' || s.kind === 'capsule') assert.ok(Number.isInteger(s.payload.n) && s.payload.n >= 1, `S${id} ${s.id} n`);
      if (s.kind === 'chain') assert.ok(Number.isInteger(s.payload.pads0) && Number.isInteger(s.payload.maxPads) && s.payload.pads0 >= 1 && s.payload.maxPads >= s.payload.pads0, `S${id} ${s.id} 발판`);
    }
  }
  //  S4(gain 0.5): 정의 (-4/3/-6 · 2/-8/5 · -3/-10/4 max 20) · 병사 4/5 → 값·상한 절반
  const s4 = buildStage(4);
  assert.deepEqual(s4.gateRows.map((r) => r.cells.map((c) => [c.value, c.maxValue])),
                   [[[-4, 8], [2, 3], [-6, 8]], [[1, 2], [-8, 8], [3, 4]], [[-3, 10], [-10, 10], [2, 3]]]);
  assert.deepEqual(s4.supplies.map((s) => s.payload.n ?? s.payload.weapon), [2, 'auto', 3]);
  //  S24(gain 1.0): 정의 그대로(양수 칸 상한 value+2 만 적용)
  const s24 = buildStage(24);
  assert.deepEqual(s24.gateRows[0].cells.map((c) => [c.value, c.maxValue]), [[-6, 15], [6, 8], [-8, 15]]);
  assert.deepEqual(s24.supplies.filter((s) => s.kind === 'soldier').map((s) => s.payload.n), [8, 9, 8]);
  assert.deepEqual([s24.supplies.find((s) => s.kind === 'chain').payload.pads0, s24.supplies.find((s) => s.kind === 'chain').payload.maxPads], [6, 12]);
  //  같은 정의 n 이면 스테이지가 뒤일수록 크거나 같다(gain 단조). r3.29 로 코스가 자리를 바꿨으므로 통 id 가 아니라
  //   **그 판의 첫 병사 통**으로 비교한다(id 는 코스마다 다른 내용물을 가리킬 수 있다)
  const n = (id) => buildStage(id).supplies.find((s) => s.kind === 'soldier').payload.n;
  assert.ok(n(8) <= n(16) && n(16) <= n(23), `${n(8)} ≤ ${n(16)} ≤ ${n(23)}`);
});

test('V3-DIFFB DB-5: 게이트 칸 값 차별화 — 3칸 행은 세 값이 서로 다르다(1~24·proto3), 음수 칸 max > 양수 칸 max(같은 행, 1~24 — 격리 시제품 proto3 는 행 상한뿐이라 제외), 양수 칸 max ≥ 값, 1~3 DEFS 칸별 상한 확인', () => {
  for (const id of [...ALL_STAGE_IDS, 'proto3']) {
    const st = buildStage(id);
    for (const row of st.gateRows) {
      if (row.cells.length === 3) assert.equal(new Set(row.cells.map((c) => c.value)).size, 3, `S${id} ${row.id} 세 칸 값 ${row.cells.map((c) => c.value)}`);
      const neg = row.cells.filter((c) => c.value < 0), pos = row.cells.filter((c) => c.value > 0);
      if (id !== 'proto3') for (const a of neg) for (const b of pos) assert.ok(a.maxValue > b.maxValue, `S${id} ${row.id} 음수 칸 상한 ${a.value}/${a.maxValue} ≤ 양수 칸 ${b.value}/${b.maxValue}`);
      for (const b of pos) assert.ok(b.maxValue >= b.value, `S${id} ${row.id} 양수 칸 상한`);
    }
  }
  //  1~3(stages.DEFS, 무수정): S2 g1 1/3·−20/20, S2 g2 2/12·−20/40, S3 g1 3/12·−25/40 — 이미 칸별 상한이고 음수 칸이 크다
  assert.deepEqual(buildStage(3).gateRows[0].cells.map((c) => [c.value, c.maxValue]), [[3, 12], [-25, 40]]);
  //  4~24 헬퍼 규칙: 양수 칸 상한 = round(max(3, value+2) × gain) — S24(gain 1) 에서 그대로 보인다
  for (const row of buildStage(24).gateRows) for (const c of row.cells) if (c.value > 0) assert.equal(c.maxValue, Math.max(3, c.value + 2), `S24 ${row.id}`);
});

test('V3-DIFFB DB-6: 부대 상한 100 — BAL3.squad.unitCap = SQUAD_DEFAULTS.unitCap = 100, 실제 addUnits 클램프, coverZ 깊이 기준(coverDepthUnits 150)은 그대로라 MAX_DY·1~3 coverZ 불변', () => {
  assert.equal(BAL3.squad.unitCap, 100); assert.equal(SQUAD_DEFAULTS.unitCap, 100);
  assert.equal(BAL3.squad.coverDepthUnits, 150);
  assert.equal(MAX_DY, Math.max(...formation(150).map((p) => p.dy)));
  assert.ok(MAX_DY > Math.max(...formation(100).map((p) => p.dy)), '150 기준 깊이가 100 기준보다 깊다(보수적)');
  assert.deepEqual(buildStage(2).supplies.filter((s) => s.pairId).map((s) => s.coverZ), [1953, 1953]);
  assert.deepEqual(buildStage(3).supplies.filter((s) => s.coverZ).map((s) => s.coverZ), [2524, 2524, 3259, 3259, 3660, 6094]);
  //  실제 클램프: 병사 통 n 50 을 두 번 먹어도 100
  const run = createRun(synth({ startUnits: 90, supplies: [
    { id: 'c1', z: 600, x: 240, r: 30, kind: 'soldier', durability: 1, maxDurability: 1, payload: { n: 50 }, opened: false, missed: false, locked: false, skipped: false, pads: [], coverZ: null, pairId: null, hint: null, move: null, armZ: null },
  ] }));
  play(run, 6);
  assert.equal(run.peak, 100); assert.equal(run.units.length, 100);
});

// ─────────────────────────────────────────────────────────────────────────────
//  봇 실측(결정적 1판씩). 보통 planBoss = 성공 경로 잠금(1~24 전부). 지옥 무입력(x240 고정 = center) = 조작이 필요해졌는가.
const NORMAL_BOSS = ALL_STAGE_IDS.map((id) => [id, playPolicy(id, 'planBoss', 14400, 'normal')]);
const BRUTAL_CENTER = ALL_STAGE_IDS.filter((id) => id >= 13).map((id) => [id, playPolicy(id, 'center', 14400, 'brutal')]);

test('V3-DIFFB DB-7: 성공 경로 — planBoss 보통 1~24 전부 완주(봇 결과 — 사람 성공률 아님. ⚠️PLAN 은 1~3 뿐이라 4~24 planBoss = 정예 전 무입력 x240 + 정예 뒤 보스 추종 — 4~24 의 조작 성공 경로는 DB-7b), 최고 병력 ≤ 100', (t) => {
  for (const [id, r] of NORMAL_BOSS) {
    t.diagnostic(`DIFFB normal planBoss S${id} won=${r.run.won} units=${r.run.units.length} peak=${r.run.peak} steps=${r.steps}`);
    assert.equal(r.run.over, true, `S${id} 끝나지 않음`);
    assert.equal(r.run.won, true, `S${id} planBoss 보통 미완주(병력 ${r.run.units.length}, 정예 잔여 ${r.run.boss ? Math.ceil(r.run.boss.hp) : 0})`);
    assert.ok(r.run.peak <= 100, `S${id} peak ${r.run.peak} > 100`);
  }
});

//  4~24 성공 경로 봇(대항 검수 반영): evLead = 정예 전 '예상 최종값이 큰 칸'(설계 의도 — 음수 칸을 끝까지 올린다) + 차량 lead, 정예 뒤 planBoss 와 같음(tests/lib/rush3-policies.mjs)
const EV_RUNS = {};
for (const d of DIFFS) for (const id of COURSE_IDS) EV_RUNS[d + ':' + id] = playPolicy(id, 'evLead', 14400, d);

test('V3-DIFFB DB-7b: 4~24 성공 경로 — evLead 보통 4~24 전부 완주(정예 전 조작이 있는 봇 — 사람 성공률 아님) · 최고 병력 ≤ 100 · 어려움/지옥 완주 수는 기록하되 어려움 ≥ 지옥(난이도 순서)', (t) => {
  const tally = {};
  for (const d of DIFFS) {
    tally[d] = 0;
    for (const id of COURSE_IDS) {
      const r = EV_RUNS[d + ':' + id];
      const bossLeft = (r.run.bosses ?? []).filter((b) => !b.dead).reduce((a, b) => a + Math.ceil(b.hp), 0);
      t.diagnostic(`DIFFB ${d} evLead S${id} won=${r.run.won} units=${r.run.units.length} peak=${r.run.peak} bossLeft=${bossLeft} weapon=${r.run.weapon}`);
      assert.equal(r.run.over, true, `${d} S${id} 끝나지 않음`);
      assert.ok(r.run.peak <= 100, `${d} S${id} peak ${r.run.peak} > 100`);
      if (r.run.won) tally[d]++;
      if (d === 'normal') assert.equal(r.run.won, true, `보통 S${id} evLead 미완주(병력 ${r.run.units.length}, 정예 잔여 ${bossLeft})`);
    }
  }
  t.diagnostic(`DIFFB evLead 4~24 완주: 보통 ${tally.normal}/21 · 어려움 ${tally.hard}/21 · 지옥 ${tally.brutal}/21`);
  assert.equal(tally.normal, 21);
  assert.ok(tally.hard >= tally.brutal, `어려움 ${tally.hard} < 지옥 ${tally.brutal}`);
  //  evLead 는 정예 전에 무입력보다 병력을 더 모은다(설계 의도대로 게이트를 올린 결과): 보통 4~24 의 peak 합
  const peak = (p) => COURSE_IDS.reduce((a, id) => a + (p === 'evLead' ? EV_RUNS['normal:' + id] : NORMAL_BOSS.find(([i]) => i === id)[1]).run.peak, 0);
  assert.ok(peak('evLead') > peak('planBoss'), `evLead peak 합 ${peak('evLead')} ≤ planBoss ${peak('planBoss')}`);
});

test('V3-DIFFB DB-8: 지옥 무입력(x240 고정)은 S13 이상에서 실패 비율 ≥ 70% — 조작 없이 끝까지 가는 판이 사라졌다(이사 실기 소감의 반증)', (t) => {
  let fail = 0;
  for (const [id, r] of BRUTAL_CENTER) {
    t.diagnostic(`DIFFB brutal center S${id} won=${r.run.won} units=${r.run.units.length} peak=${r.run.peak} z=${Math.round(r.run.z)}`);
    assert.equal(r.run.over, true, `S${id} 끝나지 않음`);
    if (!r.run.won) { fail++; assert.equal(r.run.units.length, 0, `S${id} 실패면 전멸`); }
  }
  const ratio = fail / BRUTAL_CENTER.length;
  t.diagnostic(`DIFFB brutal center S13~24 실패 ${fail}/${BRUTAL_CENTER.length} = ${(ratio * 100).toFixed(0)}%`);
  assert.ok(ratio >= 0.7, `지옥 무입력 S13+ 실패 비율 ${(ratio * 100).toFixed(0)}% < 70%`);
});

// ─────────────────────────────────────────────────────────────────────────────
function recCtx() {
  const ops = [];
  const grad = { addColorStop() {} };
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, font: t.font, fill: t.fillStyle });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const fxLike = () => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0,
                        shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false, shocks: [] });

test('V3-DIFFB DB-9: 렌더 — hpMax > 2 인 적만 남은 체력 정수를 **적 아래**(투영 x·배율 k, 12px 하한)에, hpMax ≤ 2 는 숫자 없음, 정예 발밑 숫자는 그대로', () => {
  //  ⚠️r3.20 원근 화해(2026-09-21): 숫자를 '머리 위'가 아니라 종전 HP 태그 자리(적 아래)에 그린다.
  //   머리 위에 두면 적이 화면 위로 들어오는 동안 HUD 줄과 겹친다(B안 대항 검수 ①) — 아래 두기가 그 겹침을 구조적으로 없앤다.
  const run = createRun(synth({ startUnits: 3, spawns: [
    { z: 0, kind: 'grunt', n: 3, xs: [120, 240, 360], zs: [1200, 1200, 1200] },
  ] }));
  play(run, STEP);
  const [a, b, c] = run.enemies;
  a.hp = 7; a.hpMax = 7;         // 체력 큰 잡졸 → 숫자
  b.hp = 1; b.hpMax = 2;         // 다친 체력 2 잡졸 → 숫자 없음(1~3 스테이지 잡졸)
  c.hp = 30.4; c.hpMax = 40;     // 소수 → 올림 정수 31
  const DZ = 300;
  for (const e of run.enemies) { e.z = run.z + DZ; e.pz = e.z; }
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
  const texts = ops.filter((o) => o.op === 'fillText');
  //  기대 자리: 투영(표준) 그대로 — x 는 투영 x(트랙 x 가 아니다), y 는 적 아래 y + r·k + 16k, 글자 max(12, 16k)
  const P = projectorFor('standard');
  const qa = P.project(a.x, DZ), k = qa.s;
  const fsExp = Math.max(12, 16 * k);
  const t7 = texts.find((o) => o.args[0] === '7');
  assert.ok(t7, '체력 7 숫자');
  assert.ok(Math.abs(t7.args[1] - qa.x) < 1e-6, '투영 x(' + qa.x + ') 에 그린다 — 트랙 x ' + a.x + ' 가 아니다');
  assert.ok(Math.abs(t7.args[2] - (qa.y + a.r * k + 16 * k)) < 1e-6, '적 아래: ' + t7.args[2]);
  assert.ok(t7.args[2] > qa.y, '그림 중심보다 아래');
  assert.ok(new RegExp('\\b' + fsExp.toFixed(0) + 'px\\b').test(t7.font) || parseFloat(t7.font.match(/([\d.]+)px/)[1]) === fsExp, '글자 ' + fsExp + ': ' + t7.font);
  assert.equal(t7.fill, BAL3.colors.bulletHeavy);
  //  소수 체력은 올림, 좌우 적도 각자의 투영 x
  const qc = P.project(c.x, DZ);
  const t31 = texts.find((o) => o.args[0] === '31');
  assert.ok(t31 && Math.abs(t31.args[1] - qc.x) < 1e-6, '30.4 → 31, 투영 x');
  //  체력 2 잡졸은 숫자 없음(가운데 x 근처에 숫자가 없어야 한다)
  const qb = P.project(b.x, DZ);
  assert.equal(texts.some((o) => /^\d+$/.test(String(o.args[0])) && Math.abs(o.args[1] - qb.x) < 1 && Math.abs(o.args[2] - (qb.y + b.r * k + 16 * k)) < 1), false, '체력 2 잡졸엔 숫자 없음');
  //  정예: 발밑 숫자 그대로(크기는 배율을 따른다)
  const r2 = createRun(synth({ startUnits: 3, elite: { z: 0, hp: 500, summon: false } }));
  play(r2, 3);
  assert.ok(r2.boss);
  const rec = recCtx();
  createRenderer3(rec.ctx, null).draw({ state: 'run', now: 1, run: r2, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
  assert.ok(rec.ops.some((o) => o.op === 'fillText' && o.args[0] === String(Math.ceil(r2.boss.hp))), '정예 체력 숫자');
});

//  숫자를 적 아래에 둔 뒤의 규약 두 가지: ① 부대를 지나친 적은 생략(부대 발밑 병력 수 옆에 뜬다) ② HUD 줄과 겹치지 않는다
function hpTexts(run, zoom = false) {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true, zoom });
  return ops.filter((o) => o.op === 'fillText' && /^\d+$/.test(String(o.args[0])) && o.fill === BAL3.colors.bulletHeavy);
}
test('V3-DIFFB DB-9b: 체력 숫자는 지나친 적·HUD 띠에서 생략하고 그 아래에서만 그린다 — 임계 거리는 투영에서 직접 구한다(표준·가까이)', () => {
  //  ⚠️r3.20 원근 화해(2026-09-21) 실측: 숫자를 적 아래로 옮겨도 **먼 구간**에서는 HUD 띠(y < HP_TAG_MIN_Y)를 지난다
  //   (표준 dz 491~647 · 가까이 469~646). 그래서 B안 대항 검수 ① 의 '생략' 은 그대로 살리고 판정만 투영 y 로 재유도했다.
  assert.equal(HP_TAG_MIN_Y, ZOOM.chip.y + ZOOM.chip.h + 18);
  assert.ok(HP_TAG_MIN_Y > HUD_ROW.distCy && HP_TAG_MIN_Y > ZOOM.chip.y + ZOOM.chip.h, 'HUD 줄·가까이 칩 아래');
  const mk = (dz) => {
    const run = createRun(synth({ startUnits: 3, spawns: [{ z: 0, kind: 'grunt', n: 1, xs: [240], zs: [1200], hp: 40 }] }));
    play(run, STEP);
    const e = run.enemies[0]; e.z = run.z + dz; e.pz = e.z;
    return run;
  };
  //  ① 지나친 적(dz < 0)은 어느 모드에서도 생략 — 종전에는 부대 발밑 병력 수 옆에 숫자가 떴다
  assert.equal(hpTexts(mk(-60)).length, 0, '지나친 적');
  assert.equal(hpTexts(mk(-60), true).length, 0, '지나친 적(가까이)');
  //  r3.31: 적 반지름은 체력 비례로 커진다(체력 40 → r 14 × sizeByHp) — 숫자 자리는 **실제 반지름**으로 구한다
  const R = mk(0).enemies[0].r;
  const tagY = (P, dz) => { const q = P.project(240, dz); return q.y + R * q.s + 16 * q.s; };
  for (const [mode, zoom] of [['standard', false], ['close', true]]) {
    const P = projectorFor(mode);
    //  임계 dz: 숫자 y 가 HP_TAG_MIN_Y 아래로 내려오는 첫 거리(1px 단위로 찾는다 — 매핑이 바뀌면 이 값도 같이 움직인다)
    let dzEdge = null;
    for (let dz = 0; dz <= 900; dz++) if (tagY(P, dz) >= HP_TAG_MIN_Y) dzEdge = dz;
    assert.ok(dzEdge !== null && dzEdge > 200, mode + ' 임계 거리');
    //  바로 안쪽은 그리고, 바로 바깥(더 먼 쪽)은 생략
    const inside = hpTexts(mk(dzEdge), zoom);
    assert.equal(inside.length, 1, mode + ' dz ' + dzEdge + ' 표시');
    assert.ok(inside[0].args[2] >= HP_TAG_MIN_Y, mode + ' 숫자 y ' + inside[0].args[2].toFixed(1) + ' ≥ ' + HP_TAG_MIN_Y);
    assert.equal(hpTexts(mk(dzEdge + 2), zoom).length, 0, mode + ' dz ' + (dzEdge + 2) + ' 는 HUD 띠라 생략');
    //  HUD 띠 한가운데(숫자 y 가 0~128 인 거리)도 생략 — 겹침이 실제로 사라졌다
    let banded = null;
    for (let dz = 0; dz <= 900; dz++) { const ty = tagY(P, dz); if (ty >= 0 && ty < HP_TAG_MIN_Y) { banded = dz; break; } }
    assert.ok(banded !== null, mode + ' 띠 구간 존재');
    assert.equal(hpTexts(mk(banded), zoom).length, 0, mode + ' dz ' + banded + '(숫자 y ' + tagY(P, banded).toFixed(0) + ') 생략');
    //  가까운 거리들은 전부 표시 + 자리는 언제나 적 아래 + 12px 하한
    for (const dz of [0, 100, 300]) {
      const t = hpTexts(mk(dz), zoom);
      assert.equal(t.length, 1, mode + ' dz ' + dz + ' 표시');
      const q = P.project(240, dz);
      assert.ok(Math.abs(t[0].args[1] - q.x) < 1e-6, mode + ' 투영 x');
      assert.ok(Math.abs(t[0].args[2] - tagY(P, dz)) < 1e-6, mode + ' 적 아래 자리');
      assert.ok(t[0].args[2] > q.y, mode + ' 그림 중심보다 아래');
      assert.ok(parseFloat(t[0].font.match(/([\d.]+)px/)[1]) >= 12, '12px 하한');
    }
  }
  //  1~3 스테이지 실제 잡졸(hpMax 2)은 어느 위치에서도 숫자 없음
  const r2 = createRun(synth({ startUnits: 3, spawns: [{ z: 0, kind: 'grunt', n: 1, xs: [240], zs: [1200] }] }));
  play(r2, STEP); r2.enemies[0].z = r2.z + 300; r2.enemies[0].pz = r2.enemies[0].z;
  assert.equal(hpTexts(r2).length, 0);
});

