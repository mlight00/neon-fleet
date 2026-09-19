// rush3-courses — 4~24 스테이지 1차 배치(묶음 B-2·B-3, 2026-09-19). 형식·불변식·성공 경로를 잠근다.
//  ⚠️STAGE_IDS(1~3) 는 종전 검사의 기준 코스로 그대로 두고, 셸 목록은 ALL_STAGE_IDS(1~24) 다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_IDS, ALL_STAGE_IDS, buildStage, stageMeta, stageVersion, coverZFor } from '../rush3/stages.js';
import { COURSE_IDS } from '../rush3/courses.js';
import { cellAt } from '../rush3/gates.js';
import { WEAPONS } from '../rush3/weapons.js';
import { BAL3 } from '../rush3/balance.js';
import { playPolicy, pickInput } from './lib/rush3-policies.mjs';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';

const NEW = COURSE_IDS;
//  장치 교체로 코스 버전을 올린 번호(기록은 버전별로 보존된다 — 계약서 7장). 새 장치 담당은 여기에 자기 키만 추가한다.
//   6·12 = 움직이는 보급(차량, r3.13) · 7 = 구출 캡슐(r3.14) · 8 = 보너스전(r3.15) · 9·23 = 복수 정예(r3.16) · 10·11·24 = 아레나 보스(r3.17)
const REPLACED = { 6: 2, 7: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 23: 2, 24: 2 };

test('V3-COURSE C-1: 목록 — STAGE_IDS 는 1~3 그대로, ALL_STAGE_IDS 는 1~24, 4~24 는 전부 buildStage 가능·결정적', () => {
  assert.deepEqual(STAGE_IDS, [1, 2, 3]);
  assert.deepEqual([...ALL_STAGE_IDS], Array.from({ length: 24 }, (_, i) => i + 1));
  for (const id of NEW) {
    const a = buildStage(id), b = buildStage(id);
    assert.deepEqual(a, b, 'S' + id + ' 결정성');
    assert.equal(stageVersion(id), REPLACED[id] ?? 1, 'S' + id + ' 코스 버전');
    assert.ok(stageMeta(id).title.length > 0);
  }
});

test('V3-COURSE C-2: 길이·정예·배경 — 길이 30~60초(z 5700~11400)·eliteZ = elite.z < length·bg 1~5(C-3 표)', () => {
  const BG = { 4: 1, 5: 2, 6: 4, 7: 3, 8: 1, 9: 2, 10: 4, 11: 4, 12: 5, 13: 4, 14: 4, 15: 4, 16: 4, 17: 4, 18: 4, 19: 5, 20: 5, 21: 5, 22: 5, 23: 5, 24: 5 };
  for (const id of NEW) {
    const st = buildStage(id);
    assert.ok(st.length >= 5700 && st.length <= 11400, `S${id} 길이 ${st.length}`);
    assert.ok(st.elite && st.elite.z === st.eliteZ && st.elite.z < st.length, `S${id} 정예 z`);
    assert.equal(st.bg, BG[id], `S${id} 배경`);
    assert.ok(st.elite.hp > 0);
  }
  //  1~3 의 bg 는 스테이지 번호
  for (const id of STAGE_IDS) assert.equal(buildStage(id).bg, id);
});

test('V3-COURSE C-3: 게이트 행 — 칸이 도로 80~400 을 빈틈없이 덮고(2칸·3칸) 값이 정수, 셔터 armZ 는 표 기본값', () => {
  for (const id of NEW) {
    const st = buildStage(id);
    assert.ok(st.gateRows.length >= 3, `S${id} 행 ${st.gateRows.length}`);
    const full = st.gateRows.filter((r) => !r.bypass);
    assert.ok(full.length >= 3, `S${id} 완전 피복 행 ${full.length}`);
    for (const row of st.gateRows) {
      for (const c of row.cells) { assert.equal(c.value, Math.trunc(c.value)); assert.ok(c.maxValue >= Math.abs(c.value) || c.value < 0, `S${id} ${row.id} 상한`); }
      if (row.bypass) {
        //  우회 가능 행(랜덤 길 한 칸): 도로 안에만 있으면 된다. 셔터 개방선은 통과 같은 openZ(applyLottery)
        for (const c of row.cells) assert.ok(c.x0 >= 80 && c.x1 <= 400, `S${id} ${row.id} 우회 칸 범위`);
        continue;
      }
      assert.equal(row.cells[0].x0, 80); assert.equal(row.cells.at(-1).x1, 400);
      for (let i = 1; i < row.cells.length; i++) assert.equal(row.cells[i].x0, row.cells[i - 1].x1, `S${id} ${row.id} 칸 경계`);
      for (let x = 80; x < 400; x += 4) assert.ok(cellAt(row, x), `S${id} ${row.id} x=${x}`);
      assert.equal(row.armZ, BAL3.gate.armZ);
    }
    //  완전 피복 행은 z 순이고 서로 1000px 이상 떨어진다(사격 시간 확보)
    for (let i = 1; i < full.length; i++) assert.ok(full[i].z - full[i - 1].z >= 1000, `S${id} 행 간격`);
  }
});

test('V3-COURSE C-4: 통·벽·스폰 — 통은 도로 안·무기 id 유효, 배제 쌍 coverZ 는 공식과 같음, 차폐물은 kind cover·도로 안, 스폰 xs 도로 안, 차량 move 범위', () => {
  for (const id of NEW) {
    const st = buildStage(id);
    const solid = st.walls.filter((w) => w.kind !== 'cover');
    for (const s of st.supplies) {
      assert.ok(s.x - s.r >= 80 && s.x + s.r <= 400, `S${id} ${s.id} 통 x`);
      //  차량(r3.13): 왕복 범위도 도로 안, 양 끝에서 출발, STEP 당 이동이 반지름 이하(판독 여유), 진짜 벽 활성 구간에서 벽 x 를 건너지 않는다
      if (s.move) {
        const m = s.move;
        assert.ok(m.x0 < m.x1 && Number.isFinite(m.period) && m.period > 0, `S${id} ${s.id} move 형식`);
        assert.ok(m.x0 - s.r >= 80 && m.x1 + s.r <= 400, `S${id} ${s.id} move 범위 도로 안`);
        assert.ok(s.x === m.x0 || s.x === m.x1, `S${id} ${s.id} 출발 x 는 양 끝 중 하나`);
        assert.ok(2 * (m.x1 - m.x0) / m.period * BAL3.STEP <= s.r, `S${id} ${s.id} 속도`);
        for (const w of solid) {
          if (!(w.z0 - BAL3.squad.wallLead <= s.z && s.z <= w.z1)) continue;
          assert.ok(m.x1 + s.r < w.x0 || m.x0 - s.r > w.x1, `S${id} ${s.id} 차량이 벽 ${w.id} 를 건넌다`);
        }
      }
      if (s.kind === 'weapon') assert.ok(WEAPONS[s.payload.weapon], `S${id} ${s.id} 무기 id`);
      if (s.pairId) {
        const w = solid.find((wl) => wl.z0 <= s.z && s.z <= wl.z1);
        assert.ok(w, `S${id} ${s.id} 짝 통은 벽 안`);
        assert.equal(s.coverZ, coverZFor(w.z0, s.z), `S${id} ${s.id} coverZ 공식`);
        const mates = st.supplies.filter((o) => o.pairId === s.pairId);
        assert.equal(mates.length, 2);
        assert.ok(mates.some((o) => o.x < 240) && mates.some((o) => o.x > 240), `S${id} 쌍은 좌우 하나씩`);
      }
    }
    for (const w of st.walls) {
      if (w.kind === 'cover') assert.ok(w.x0 >= 80 && w.x1 <= 400 && w.z1 > w.z0, `S${id} ${w.id} 차폐 범위`);
      else { assert.deepEqual([w.x0, w.x1], [BAL3.wall.x0, BAL3.wall.x1]); assert.ok(w.signs && w.signs.L && w.signs.R, `S${id} ${w.id} 표지`); }
    }
    for (const sp of st.spawns) {
      assert.equal(sp.xs.length, sp.n); assert.equal(sp.zs.length, sp.n);
      for (const x of sp.xs) assert.ok(x >= 80 && x <= 400, `S${id} 스폰 x=${x}`);
      assert.ok(sp.z < st.eliteZ, `S${id} 스폰은 정예 전`);
    }
    if (st.lottery) assert.ok(st.walls[stageDefLotteryWall(id)] && st.lottery.revealZ > 0, `S${id} 랜덤 길 벽`);
  }
});
function stageDefLotteryWall() { return 3; }

//  r3.18 대항 검수 반영 하한: 복수 정예(9·23)는 등장 → 마지막 격파까지 최소 생존 초, 아레나(10·11·24)는 **첫 착지 충격(첫 recover)이 격파보다 먼저**(보호막이 잠근다)
//   + 최소 전투 초. 종전엔 정예가 1.9~3.5초, 아레나 보스가 첫 돌진 전에 죽어 장치가 화면에 나타날 시간이 없었다
const MIN_FIGHT = { 9: 8, 23: 6, 10: 6, 11: 6, 24: 6 };
test('V3-COURSE C-5: 성공 경로(보통) — 4~24 전부 planBoss 봇이 완주한다(봇 결과 — 사람 성공률 아님), 정예 생존·첫 충격 하한', (t) => {
  const rows = [];
  for (const id of NEW) {
    const r = playPolicy(id, 'planBoss', 14400, 'normal');
    rows.push(`S${id} won=${r.run.won} units=${r.run.units.length} peak=${r.run.peak} steps=${r.steps} weapon=${r.run.weapon}`);
    assert.equal(r.run.over, true, `S${id} 끝나지 않음`);
    assert.ok(r.steps < 14400, `S${id} 상한 안`);
    assert.equal(r.run.won, true, `S${id} planBoss 미완주(정예 잔여 hp ${r.run.boss ? Math.ceil(r.run.boss.hp) : 0}, 병력 ${r.run.units.length})`);
  }
  for (const [id, minSec] of Object.entries(MIN_FIGHT).map(([k, v]) => [Number(k), v])) {
    const run = createRun(buildStage(id, { difficulty: 'normal' }));
    let t0 = null, lastKill = null, firstShock = null, firstKill = null;
    for (let i = 0; i < 14400 && !run.over; i++) {
      stepRun(run, pickInput('planBoss', run), STEP);
      for (const e of drainEvents(run)) {
        if ((e.type === 'elite' || e.type === 'arenaEnter') && t0 === null) t0 = run.time;
        if (e.type === 'bossShock' && firstShock === null) firstShock = run.time;
        if (e.type === 'bossKill') { if (firstKill === null) firstKill = run.time; lastKill = run.time; }
      }
    }
    assert.ok(run.won && t0 !== null && lastKill !== null, `S${id} 완주`);
    assert.ok(lastKill - t0 >= minSec, `S${id} 전투 ${(lastKill - t0).toFixed(1)}초 < ${minSec}초`);
    if (buildStage(id).arena) assert.ok(firstShock !== null && firstShock < firstKill, `S${id} 첫 충격(${firstShock})이 격파(${firstKill})보다 먼저여야 한다`);
    rows.push(`S${id} fight=${(lastKill - t0).toFixed(1)}s firstShock=${firstShock == null ? '-' : (firstShock - t0).toFixed(1)}`);
  }
  for (const line of rows) t.diagnostic('COURSE ' + line);
});

test('V3-COURSE C-6: 그림 교체·배경 전달 — 스폰 skin 이 적에게, 정예 skin 이 보스에게, bg 가 run 에 그대로 실린다(규칙은 kind·hp 만 본다)', () => {
  const st13 = buildStage(13);
  const armored = st13.spawns.filter((s) => s.skin === 'E3_wallguard');
  assert.ok(armored.length >= 2, '13 장갑체 물결');
  //  r3.21: 정의 hp 10 × 스테이지 구간 배율 7(13~18) × 보통 1 = 70(stages.makeSpawn 이 항상 명시)
  for (const s of armored) assert.equal(s.hp, 70);
  const run = createRun(st13, { difficulty: 'normal' });
  assert.equal(run.bg, 4);
  //  첫 장갑 물결까지 전진(입력 없음) → 스폰된 적에 skin 이 붙고 kind 는 grunt 그대로
  let seen = null;
  for (let i = 0; i < 2400 && !seen; i++) {
    stepRun(run, { x: run.x, fire: true });
    seen = run.enemies.find((e) => e.skin === 'E3_wallguard') ?? null;
  }
  assert.ok(seen, '장갑 그림 적이 나타남');
  assert.equal(seen.kind, 'grunt');
  assert.equal(seen.hp <= 70 && seen.hp > 0, true);
  //  정예 skin: 24 는 B5_crownbreaker, 4 는 기본(없음)
  const st24 = buildStage(24);
  assert.equal(st24.elite.skin, 'B5_crownbreaker');
  assert.equal(buildStage(4).elite.skin, undefined);
  assert.equal(createRun(st24).bg, 5);
  assert.equal(createRun(buildStage(1)).bg, 1);
});
