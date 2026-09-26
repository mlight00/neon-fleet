// rush3-r411-art — r4.11 그림 시트(2026-09-27 Gemini v9). **그림만 — 규칙 불변(두 줄 공통)**.
//  이사님 원문(2026-09-26 실플레이 5차): "보스 광역 대미지 그래픽도 코드로 그리지 말고 이미지를 만들어서 사용하자. 그리고 보스의 피격시,
//   파괴 시 이미지와 일반 적들의 걸어오는 모습등과 피격등 모든 이미지들을 스프라이트로 만들자."
//  ART-1: 시트 규격(SHEETS3)이 실제 파일 크기와 맞는다(PNG 머리 IHDR — 그림을 풀지 않고 너비·높이만 읽는다)
//  ART-2: 그림 → 피격·움직임 시트 키(hitSheetKey3·moveSheetKey3)
//  ART-3~5b: 그리기(적 움직임·피격 시트 · 보스 몸 시트·쓰러진 보스 · 광역 효과 9종·남는 웅덩이·그물·경보 중 곁들임) — 시트가 없으면 종전 폴백
//  ART-6: 셸(피격 시트 타이머 · 보스/중간 보스 처치 연출)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SHEETS3, SHEET_BASE3, hitSheetKey3, moveSheetKey3, ENEMY_ART3, sheetSec } from '../rush3/sprites.js';
import { createRenderer3, enemyMotionPose, artBase3, DRIVE_CYCLE, BOSS_WRECK } from '../rush3/render.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage } from '../rush3/stages.js';
import { makeFx } from '../rush3/main.js';
import { atkRun, botInput, inp } from './lib/rush3-bossatk.mjs';
import { bootApp } from './lib/rush3-shell.mjs';

const ROOT = new URL('../', import.meta.url);
//  PNG 머리: 8바이트 서명 + IHDR 길이(4) + 'IHDR'(4) + 너비(4, 큰 끝) + 높이(4)
function pngSize(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('latin1', 12, 16), 'IHDR', path + ' PNG 머리');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('ART-1: 시트 규격 = 실제 파일 — 불러오는 모든 시트(pending 아님)의 파일이 있고, 너비 = 열 × 칸 폭 · 높이 = 줄 × 칸 높이 · 칸 수 ≤ 열 × 줄 · refH > 0', () => {
  let n = 0;
  for (const [key, m] of Object.entries(SHEETS3)) {
    if (m.pending) continue;
    const p = new URL(SHEET_BASE3 + m.file + '.png', ROOT);
    assert.ok(existsSync(p), key + ': 파일 ' + m.file + '.png');
    const { w, h } = pngSize(p);
    const rows = Math.ceil(m.frames / m.cols);
    assert.equal(w, m.cols * m.fw, key + ' 너비');
    assert.equal(h, rows * m.fh, key + ' 높이');
    assert.ok(m.frames <= m.cols * rows && m.refH > 0 && m.fps > 0, key + ' 칸 수·refH·fps');
    n++;
  }
  //  r4.11 새 시트: 효과 8 · 보스 5 · 움직임 3(+E1 걷기) · 피격 8
  const pre = (p) => Object.keys(SHEETS3).filter((k) => k.startsWith(p)).length;
  assert.deepEqual([pre('fx:'), pre('bd:'), pre('mv:'), pre('hs:')], [8, 5, 3, 8]);
  assert.ok(n >= 12 + 24, '확인한 시트 수 ' + n);
});

test('ART-2: 그림 → 시트 키 — E1 잡졸은 종전 피격 12칸·새 걷기 8칸 · E2·E4~E10 피격 시트 · E3 장갑체는 피격 시트 없음(걷기 시트와 몸 비율이 달라 코드 번쩍임) · 움직임 시트는 E1·E3(걷기)·E2·E7(차) · E5 바퀴·보스는 움직임 시트 없음', () => {
  assert.equal(hitSheetKey3('E1_scrapbit'), 'e_grunt_hit');
  assert.equal(moveSheetKey3('E1_scrapbit'), 'e_grunt_walk');
  for (const a of ['E2_ramhound', 'E4_needleeye', 'E5_wheeler', 'E6_signaler', 'E7_cartyard', 'E8_manholejumper', 'E9_spawnpod', 'E10_magnethead']) assert.equal(hitSheetKey3(a), 'hs:' + a, a);
  assert.equal(hitSheetKey3('E3_wallguard'), null);
  assert.deepEqual(['E3_wallguard', 'E2_ramhound', 'E7_cartyard'].map(moveSheetKey3), ['mv:E3_wallguard', 'mv:E2_ramhound', 'mv:E7_cartyard']);
  for (const a of ['E5_wheeler', 'E4_needleeye', 'E6_signaler', 'E8_manholejumper', 'E9_spawnpod', 'E10_magnethead']) assert.equal(moveSheetKey3(a), null, a);
  for (const a of ENEMY_ART3.filter((x) => x.startsWith('B'))) {
    assert.equal(moveSheetKey3(a), null, a);
    assert.ok(SHEETS3['bd:' + a], a + ' 보스 몸 시트');
  }
  assert.equal(hitSheetKey3(null), null);
  assert.equal(moveSheetKey3(undefined), null);
});

//  ── 그리기 검사(가짜 그림 — 시트 칸이 어느 그림의 몇 번째 칸으로 그려지는지 drawImage 9인자 호출로 본다). 규칙(run)은 읽기만 ──
function recCtx() {
  const ops = [], stack = [], grad = { addColorStop() {} };
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, fill: t.fillStyle, stroke: t.strokeStyle, alpha: t.globalAlpha });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
//  가짜 그림 묶음: keys = 있는 시트(SHEETS3 규격 그대로 + img 표시), gets = 정지 그림
function fakeSprites(keys, gets = {}) {
  const sh = {};
  for (const k of keys) sh[k] = { img: { key: k, width: SHEETS3[k].fw * SHEETS3[k].cols, height: SHEETS3[k].fh }, ...SHEETS3[k] };
  return { get: (k) => gets[k] ?? null, icon: () => null, ready: new Set(), sheet: (k) => sh[k] ?? null };
}
function drawOps(run, fx, sprites) {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, sprites).draw({ state: 'run', now: 1, run, fx, hud: { distM: 0 }, buttons: [], saveOk: true });
  return ops;
}
//  시트 칸 그리기(9인자) 중 그림 key 의 것 → [칸 번호(원본 x ÷ 칸 폭)]
const cellsOf = (ops, key) => ops.filter((o) => o.op === 'drawImage' && o.args.length === 9 && o.args[0] && o.args[0].key === key).map((o) => Math.round(o.args[1] / SHEETS3[key].fw));
const ALL_ART = Object.keys(SHEETS3).filter((k) => /^(fx|bd|mv|hs):/.test(k)).concat(['e_grunt_walk', 'e_grunt_hit']);

function enemyRun(list) {
  const run = createRun(buildStage(1));
  for (const u of run.units) u.fireT = 1e9;
  for (const e of list) run.enemies.push({ px: e.x, pz: e.z, vz: 60, dead: false, touched: false, r: 16, ...e });
  return run;
}

test('ART-3 적 그리기: 달리는 E2 = 달리기 시트(칸 = 다가온 거리 박자) · 맞는 동안 = 피격 시트(섬광 칸부터) · 손상 그림이 있는 체력 절반 이하 = 손상 그림 + 코드 움직임(시트 아님) · 걷는 E1 = 8칸 걷기 시트 · E3 = 걷기 시트, 맞아도 피격 시트 없음 · 시트가 없으면 종전 폴백 · 그리기 전후 run 동일', () => {
  const run = enemyRun([
    { id: 901, kind: 'rusher', skin: 'E2_ramhound', x: 200, z: 0, hp: 10, hpMax: 10 },
    { id: 902, kind: 'grunt', x: 300, z: 0, hp: 1, hpMax: 1, r: 14 },
    { id: 903, kind: 'grunt', skin: 'E3_wallguard', x: 120, z: 0, hp: 30, hpMax: 30 },
  ]);
  for (const e of run.enemies) e.z = e.pz = run.z + 320;
  const sprites = fakeSprites(ALL_ART);
  const snap = JSON.stringify(run);
  let ops = drawOps(run, makeFx(), sprites);
  assert.equal(JSON.stringify(run), snap, '그리기 전후 run 동일');
  const e2 = run.enemies[0], e1 = run.enemies[1], e3 = run.enemies[2];
  const cyc = (e) => { const c = enemyMotionPose(e, run, 1).cyc; return Math.floor((((c % 1) + 1) % 1) * SHEETS3[moveSheetKey3(artBase3(e.kind, e.skin))].frames); };
  assert.deepEqual(cellsOf(ops, 'mv:E2_ramhound'), [cyc(e2)], 'E2 달리기 시트 칸 = 박자');
  assert.deepEqual(cellsOf(ops, 'e_grunt_walk'), [cyc(e1)], 'E1 걷기 8칸 시트 칸 = 걸음 박자');
  assert.deepEqual(cellsOf(ops, 'mv:E3_wallguard'), [cyc(e3)], 'E3 걷기 시트');
  //  박자: 다가오면 칸이 바뀐다(한 바퀴 = DRIVE_CYCLE px · 걷기 두 걸음)
  const before = cyc(e2);
  e2.z -= DRIVE_CYCLE / 4;
  assert.notEqual(cyc(e2), before, '달리기 칸이 넘어간다');
  e2.z += DRIVE_CYCLE / 4;
  //  맞는 동안(셸 fx.enemyHit 남은 초): 피격 시트 — 막 맞았을 때 0칸(섬광), 달리기 시트는 그리지 않는다
  const fx = makeFx();
  fx.enemyHit[901] = sheetSec('hs:E2_ramhound');
  fx.enemyHit[903] = 0.2;   // E3 는 셸이 켜지 않지만, 켜져 있어도 피격 시트가 없어 걷기 그대로
  ops = drawOps(run, fx, sprites);
  assert.deepEqual(cellsOf(ops, 'hs:E2_ramhound'), [0], 'E2 피격 시트 섬광 칸');
  assert.deepEqual(cellsOf(ops, 'mv:E2_ramhound'), [], '피격 시트가 도는 동안 달리기 시트 없음');
  assert.equal(cellsOf(ops, 'mv:E3_wallguard').length, 1, 'E3 는 피격 시트 없이 걷기 시트');
  fx.enemyHit[901] = sheetSec('hs:E2_ramhound') - 2.5 / SHEETS3['hs:E2_ramhound'].fps;
  assert.deepEqual(cellsOf(drawOps(run, fx, sprites), 'hs:E2_ramhound'), [2], '시간이 지나면 마지막 칸(평상)');
  //  손상 그림(체력 절반 이하)이 있으면 그 정지 그림 + 코드 움직임 — 시트를 쓰지 않는다
  e2.hp = 4;
  const dmgIm = { key: 'dmg', width: 100, height: 100 };
  const withDmg = fakeSprites(ALL_ART, { 'dmg:E2_ramhound': dmgIm });
  ops = drawOps(run, makeFx(), withDmg);
  assert.deepEqual(cellsOf(ops, 'mv:E2_ramhound'), [], '손상 그림이면 달리기 시트 없음');
  assert.ok(ops.some((o) => o.op === 'drawImage' && o.args[0] === dmgIm), '손상 그림을 그린다');
  e2.hp = 10;
  //  시트가 하나도 없으면 시트 칸 그리기 없음(종전 폴백)
  assert.equal(drawOps(run, makeFx(), null).filter((o) => o.op === 'drawImage').length, 0, '그림 없음 = 도형 폴백');
});

test('ART-4 보스 그리기: 몸 시트가 있으면 몸 전체를 시트로(평상 0칸 · 번쩍이는 동안 맞음 1칸 — 정지 그림과 섞지 않는다) · 쓰러진 보스(fx.bossWrecks) = 폭발 2칸(boomSec 전) → 잔해 3칸 → 끝에 흐려짐 · 몸 시트가 없으면 잔해를 그리지 않는다', () => {
  const { run, bo } = atkRun(3, 30, 0, 'smoke', 240, 0);
  const bKey = 'bd:' + (bo.skin || 'B1_grader');
  const B1 = { key: 'B1static', width: 100, height: 100 };
  const sprites = fakeSprites(ALL_ART, { elite: B1, ['skin:' + bo.skin]: B1 });
  run.bossAtk.cur = null;
  let ops = drawOps(run, makeFx(), sprites);
  assert.deepEqual(cellsOf(ops, bKey), [0], '평상 0칸');
  assert.ok(!ops.some((o) => o.op === 'drawImage' && o.args[0] === B1), '정지 그림은 그리지 않는다');
  const fx = makeFx();
  fx.hit[bo.id] = { t: 0.01, fa: 0.01, dir: -1, role: 'elite', n: 1 };
  ops = drawOps(run, fx, sprites);
  assert.ok(cellsOf(ops, bKey).includes(1) && !cellsOf(ops, bKey).includes(0), '번쩍이는 동안 맞음 1칸');
  //  잔해: 규칙의 보스는 dead(그리지 않음), 셸 bossWrecks 만
  bo.dead = true;
  const w = { x: bo.x, z: bo.z, r: bo.r, skin: bo.skin ?? null, t: 0.1, life: BOSS_WRECK.lifeSec };
  const at = (t) => { const f = makeFx(); f.bossWrecks.push({ ...w, t }); return drawOps(run, f, sprites); };
  assert.deepEqual(cellsOf(at(0.1), bKey), [2], '폭발 2칸');
  assert.deepEqual(cellsOf(at(BOSS_WRECK.boomSec + 0.1), bKey), [3], '잔해 3칸');
  const late = at(BOSS_WRECK.lifeSec - BOSS_WRECK.fadeSec / 2).find((o) => o.op === 'drawImage' && o.args[0] && o.args[0].key === bKey);
  assert.ok(late && late.alpha < 1 && late.alpha > 0, '끝에 흐려진다 ' + (late && late.alpha));
  assert.equal(cellsOf(at(BOSS_WRECK.lifeSec + 0.1), bKey).length, 0, '수명이 끝나면 없음');
  const f0 = makeFx(); f0.bossWrecks.push(w);
  assert.equal(drawOps(run, f0, null).filter((o) => o.op === 'drawImage').length, 0, '몸 시트가 없으면 잔해 그림 없음');
});

//  r4.10 게임 줄 보스 판에서 광역 공격 하나를 실제로 터뜨려(bossBoom) 셸처럼 fx.atkBlasts 에 넣는다
const AOE_STAGE = { smoke: 3, hook: 6, web: 6, rail: 9, crossrail: 9, pour: 12, rain: 12, mace: 24, quake: 24 };
function boomOf(kind) {
  const { run } = atkRun(AOE_STAGE[kind], 60, 0, kind, 240, 0);
  const fx = makeFx();
  for (let i = 0; i < 60 * 4 && !fx.atkBlasts.length; i++) {
    stepRun(run, botInput(run, 240), STEP);
    for (const e of drainEvents(run)) if (e.type === 'bossBoom' && !fx.atkBlasts.length) fx.atkBlasts.push({ kind: e.kind, shape: e.shape, look: e.look, t: 0, life: 0.6 });
  }
  assert.ok(fx.atkBlasts.length, kind + ' 터짐');
  //  남은 구역의 경보·곁들임·웅덩이는 떼어 낸다(터짐 그림만 본다 — 그것들은 ART-5b)
  run.bossAtk.cur = null;
  return { run, fx };
}

test('ART-5 광역 효과 그림: 광역 9종이 터지면 그 효과 시트(fx:<종류> — 교차 레일은 레일)로 그린다 · 진행에 따라 칸이 넘어간다 · 충격파는 끊긴 틈 쪽으로 돌린다(π/2 − ang) · 철퇴는 꼭짓점 기준(칸 아래 가운데) · 레일은 줄을 따라 여러 조각 · 시트가 없으면 종전 코드 연출 · 그리기 전후 run 동일', () => {
  const sprites = fakeSprites(ALL_ART);
  for (const kind of Object.keys(AOE_STAGE)) {
    const { run, fx } = boomOf(kind);
    const key = 'fx:' + (kind === 'crossrail' ? 'rail' : kind);
    const b = fx.atkBlasts[0];
    const snap = JSON.stringify(run);
    const at = (k) => { b.t = k * b.life; return drawOps(run, fx, sprites); };
    const early = at(0.05), late = at(0.9);
    assert.equal(JSON.stringify(run), snap, kind + ': 그리기 전후 run 동일');
    const c0 = cellsOf(early, key), c1 = cellsOf(late, key);
    assert.ok(c0.length >= 1 && c1.length >= 1, kind + ': 효과 시트로 그린다');
    if (kind === 'pour') assert.ok(c0.every((c) => c === 0), '쇳물 붓기 터짐 = 0칸(남는 웅덩이는 drawPool)');
    else if (kind === 'rain') assert.ok(Math.min(...c0) >= 1 && Math.max(...c1) === SHEETS3[key].frames - 1, '쇳물 비 = 1칸부터 마지막 칸까지');
    else assert.ok(Math.max(...c1) > Math.min(...c0), kind + ': 칸이 넘어간다 ' + c0 + ' → ' + c1);
    if (kind === 'rail' || kind === 'crossrail') assert.ok(c0.length >= 2, kind + ': 줄을 따라 여러 조각 ' + c0.length);
    if (kind === 'quake') {
      const rot = early.filter((o) => o.op === 'rotate').map((o) => o.args[0]);
      assert.ok(rot.some((r) => Math.abs(r - (Math.PI / 2 - b.shape.ang)) < 1e-9), '충격파 틈 방향 회전');
    }
    if (kind === 'mace') {
      const d = early.find((o) => o.op === 'drawImage' && o.args[0] && o.args[0].key === key);
      assert.ok(Math.abs(d.args[6] + d.args[8]) < 1e-9 && Math.abs(d.args[5] + d.args[7] / 2) < 1e-9, '철퇴 = 칸 아래 가운데가 기준점');
    }
    //  시트 없음 → 효과 시트 그리기 없음(종전 코드 연출 — BOSS-TELE 가 보스 특색 색을 확인한다)
    b.t = 0.1 * b.life;
    assert.equal(cellsOf(drawOps(run, fx, null), key).length, 0, kind + ': 시트가 없으면 코드 연출');
  }
});

test('ART-5b 남는 쇳물 웅덩이·그물에 걸린 부대·경보 중 곁들임: 웅덩이 = 끓는 1칸 → 마지막에 식은 2칸 · 느려진 부대 위 = 그물 1칸(풀리기 직전 2칸) · 경보 중 그물 1칸·레일 2칸·쇳물 방울 0칸', () => {
  const sprites = fakeSprites(ALL_ART);
  //  웅덩이: 붓기가 터진 뒤 구역이 남아 있는 동안
  const { run } = atkRun(12, 60, 0, 'pour', 240, 0);
  let pooled = null;
  for (let i = 0; i < 60 * 4 && !pooled; i++) {
    stepRun(run, botInput(run, 240), STEP); drainEvents(run);
    const cur = run.bossAtk.cur;
    if (cur && cur.zones && cur.zones.some((z) => z.done && z.until > cur.age + 0.4)) pooled = cur;
  }
  assert.ok(pooled, '남는 웅덩이');
  assert.ok(cellsOf(drawOps(run, makeFx(), sprites), 'fx:pour').includes(1), '끓는 웅덩이 1칸');
  const z = pooled.zones.find((q) => q.done);
  z.until = pooled.age + 0.3;
  assert.ok(cellsOf(drawOps(run, makeFx(), sprites), 'fx:pour').includes(2), '마지막엔 식은 2칸');
  //  그물에 걸린 부대
  const r2 = enemyRun([]);
  r2.slowT = 1.2;
  assert.deepEqual(cellsOf(drawOps(r2, makeFx(), sprites), 'fx:web'), [1], '그물 1칸');
  r2.slowT = 0.2;
  assert.deepEqual(cellsOf(drawOps(r2, makeFx(), sprites), 'fx:web'), [2], '풀리기 직전 2칸');
  //  경보 중(터지기 전): 그물·레일·쇳물 비
  for (const [kind, key, cell] of [['web', 'fx:web', 1], ['rail', 'fx:rail', 2], ['rain', 'fx:rain', 0]]) {
    const { run: r } = atkRun(AOE_STAGE[kind], 60, 0, kind, 240, 0);
    let n = 0;
    while (!(r.bossAtk.cur && r.bossAtk.cur.state === 'tele') && n++ < 60 * 3) { stepRun(r, inp(240), STEP); drainEvents(r); }
    assert.ok(r.bossAtk.cur, kind + ' 경보');
    const cells = cellsOf(drawOps(r, makeFx(), sprites), key);
    assert.ok(cells.length >= 1 && cells.every((c) => c === cell), kind + ' 경보 중 ' + cell + '칸: ' + cells);
  }
});

test('ART-6 셸: 피격 시트 타이머 — E2 등은 그 피격 시트 길이로 켜고 도는 동안 다시 켜지 않는다(값이 줄기만 하다 끝난다) · E3 장갑체는 켜지 않는다 · 보스 처치 = 쓰러진 보스(bossWrecks) · 중간 보스 처치 = 그 판 적 그림의 쓰러진 모습(corpses)', async () => {
  //  (가) 피격 타이머: 판 1 앞에 E2·E3 적을 세우고 부대가 쏘게 둔다
  const h = await bootApp({ unlockThrough: 3 });
  h.app.startRun(1);
  h.frames(2);
  const run = h.app.getRun(), fx = h.app.getFx();
  run.spawnCursor = run.spawns.length; run.enemies.length = 0;
  run.enemies.push({ id: 9901, kind: 'rusher', skin: 'E2_ramhound', x: run.x, z: run.z + 260, px: run.x, pz: run.z + 260, vz: 0, hp: 1e6, hpMax: 1e6, r: 16, dead: false, touched: false });
  run.enemies.push({ id: 9902, kind: 'grunt', skin: 'E3_wallguard', x: run.x + 6, z: run.z + 300, px: run.x + 6, pz: run.z + 300, vz: 0, hp: 1e6, hpMax: 1e6, r: 16, dead: false, touched: false });
  const seq = [];
  let e3 = false;
  for (let i = 0; i < 60 * 3; i++) {
    for (const e of run.enemies) { e.z = e.pz = run.z + (e.id === 9901 ? 260 : 300); e.vz = 0; }
    h.frames(1);
    seq.push(fx.enemyHit[9901] ?? 0);
    if (fx.enemyHit[9902] > 0) e3 = true;
  }
  const full = sheetSec('hs:E2_ramhound');
  assert.ok(seq.some((v) => v > 0), 'E2 피격 타이머가 켜진다');
  let restarts = 0;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] > seq[i - 1] + 1e-9) { restarts++; assert.equal(seq[i - 1], 0, '도는 동안(값 > 0) 다시 켜지 않는다 — 끝난(0) 뒤에만'); }
  }
  assert.ok(restarts >= 1 && Math.max(...seq) <= full + 1e-9, '끝나면 다음 탄에 다시(' + restarts + '회) · 길이 = 시트 길이');
  assert.ok(!e3, 'E3 장갑체는 피격 시트가 없어 켜지 않는다');
  //  (나) 보스 처치 → 쓰러진 보스
  const hb = await bootApp({ unlockThrough: 3 });
  hb.app.startRun(3);
  hb.frames(2);
  const rb = hb.app.getRun();
  rb.z = rb.prevZ = rb.eliteZ - 4; rb.spawnCursor = rb.spawns.length; rb.enemies.length = 0;
  let n = 0;
  while (!rb.bosses.length && n++ < 600) hb.frames(1);
  for (const b of rb.bosses) b.hp = 1;
  for (let i = 0; i < 60 * 6 && !hb.app.getFx().bossWrecks.length; i++) { for (const u of rb.units) u.hp = 1e9; hb.frames(1); }
  const wr = hb.app.getFx().bossWrecks;
  assert.equal(wr.length, 1, '보스 처치 → 쓰러진 보스 1');
  assert.equal(wr[0].life, BOSS_WRECK.lifeSec);
  //  (다) 중간 보스 처치 → 쓰러진 모습(보스 잔해 아님)
  const hm = await bootApp({ unlockThrough: 3 });
  hm.app.startRun(2);
  hm.frames(2);
  const rm = hm.app.getRun();
  rm.z = rm.prevZ = rm.eliteZ - 4; rm.spawnCursor = rm.spawns.length; rm.enemies.length = 0;
  n = 0;
  while (!rm.bosses.length && n++ < 600) hm.frames(1);
  const mid = rm.bosses[0];
  assert.ok(mid && mid.mid, '중간 보스');
  mid.hp = 1;
  const fm = hm.app.getFx();
  let corpse = null;
  for (let i = 0; i < 60 * 6 && !corpse; i++) { for (const u of rm.units) u.hp = 1e9; hm.frames(1); corpse = fm.corpses.find((c) => c.id === mid.id) ?? null; }
  assert.ok(corpse, '중간 보스 쓰러진 모습');
  assert.equal(corpse.kind, mid.look.kind);
  assert.equal(corpse.skin ?? null, mid.look.skin ?? null);
  assert.equal(fm.bossWrecks.length, 0, '중간 보스는 보스 잔해가 아니다');
});
