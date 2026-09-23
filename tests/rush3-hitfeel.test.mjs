// rush3-hitfeel — 손맛 연출 검사(r3.24 · 이사 관찰 2026-09-23 "여러 대 맞아야 터지는 애들은 피탄될 때마다 반응이 그래픽으로 표현되어 손맛이 있다",
//  "각 적들마다 특색 있는 반응과 병사 획득 시 이벤트도 그래픽으로"). 전부 셸(main.js)·렌더(render.js) 연출이고 규칙 run 은 읽기만 한다.
//  ⚠️검사는 그림 없이 돈다(Node) — 흰 실루엣(작업 캔버스) 경로는 캡처(research/hitfeel-20260923)로만 확인된다. 여기서는 도형 폴백의 흰 채움을 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, STEP, sizeByHp } from '../rush3/combat.js';
import { makeBullet } from '../rush3/weapons.js';
import { buildStage } from '../rush3/stages.js';
import { BAL3 } from '../rush3/balance.js';
import { projectorFor } from '../rush3/project.js';
import { createRenderer3, hitRole, HIT_FLASH_FILL } from '../rush3/render.js';
import { boot, makeFx, onEnemyHit, onEnemyDeath, onBossDeath, onJoin, tickHitFx, addCorpse, trimParts } from '../rush3/main.js';
import { createSave3 } from '../rush3/save.js';

const FX = BAL3.fx;
const PJ = projectorFor('standard');
//  셸의 sp(x, z) 와 같은 꼴(run.z = 0 으로 둔다)
const sp = (x, z) => PJ.project(x, z);
const squad = () => PJ.project(240, 0);
const noBurst = () => {};
const tick = (fx, dt, burstAt = noBurst) => tickHitFx(fx, dt, { sp, squad, burstAt });
const hitEv = (o) => ({ type: 'enemyHit', id: 1, kind: 'grunt', hp: 5, x: 240, z: 300, r: 14, hpMax: 8, dmg: 1, weapon: 'rifle', skin: null, ...o });

//  역할 = skin 우선, 없으면 kind(courses.js 의 ARMOR·CART·JUMPER·HOUND·POD·MAGNET)
const CASES = [
  ['grunt', null, 'grunt'], ['rusher', null, 'rusher'], ['shooter', null, 'shooter'],
  ['grunt', 'E3_wallguard', 'armor'], ['grunt', 'E7_cartyard', 'cart'],
  ['rusher', 'E2_ramhound', 'rusher'], ['rusher', 'E8_manholejumper', 'rusher'],
  ['shooter', 'E9_spawnpod', 'shooter'], ['shooter', 'E10_magnethead', 'shooter'], ['shooter', 'E4_needleeye', 'shooter'],
  ['elite', null, 'elite'], ['elite', 'B4_smelter', 'elite'],
];

test('V3-HITFEEL HF-1: 역할 판정 — skin 이 역할을 뜻하고, 모든 역할이 BAL3.fx.hitRoles 에 반응 표를 가진다', () => {
  for (const [kind, skin, role] of CASES) assert.equal(hitRole(kind, skin), role, kind + '/' + skin);
  for (const role of ['grunt', 'rusher', 'shooter', 'armor', 'cart', 'elite']) {
    const R = FX.hitRoles[role];
    assert.ok(R && typeof R.knock === 'number' && typeof R.flash === 'number' && R.death, role + ' 반응 표');
  }
  //  특색: 장갑체는 돌격체보다 덜 밀리고(무겁다) 카트는 넉백이 없다. 사망 연출은 역할마다 다르다
  assert.ok(FX.hitRoles.armor.knock < FX.hitRoles.rusher.knock);
  assert.equal(FX.hitRoles.cart.knock, 0);
  const deaths = ['grunt', 'rusher', 'shooter', 'armor', 'cart', 'elite'].map((r) => FX.hitRoles[r].death);
  assert.equal(new Set(deaths).size, deaths.length, '사망 연출 6가지가 서로 다르다: ' + deaths);
});

test('V3-HITFEEL HF-2: 모든 적 종류의 enemyHit 에 피격 상태 fx.hit[id] 가 생기고, 시간이 지나면 사라진다', () => {
  for (const [kind, skin, role] of CASES) {
    const fx = makeFx();
    const id = kind === 'elite' ? 'b1' : 7;
    const got = onEnemyHit(fx, hitEv({ id, kind, skin }), sp);
    assert.equal(got, role);
    assert.ok(fx.hit[id], kind + '/' + skin + ' 피격 상태');
    assert.equal(fx.hit[id].t, 0);
    assert.equal(fx.hit[id].role, role);
    assert.ok(fx.parts.length > 0, '피격 스파크');
    //  반응 길이(가장 긴 것) + '-n' 수명이 지나면 지워진다
    for (let i = 0; i < 60; i++) tick(fx, 1 / 60);
    assert.equal(fx.hit[id], undefined, kind + '/' + skin + ' 1초 뒤엔 없다');
  }
  //  연속 피격은 n 이 오르고 t 는 0 으로 되돌아간다
  const fx = makeFx();
  onEnemyHit(fx, hitEv({}), sp);
  tick(fx, 0.05);
  onEnemyHit(fx, hitEv({ hp: 4 }), sp);
  assert.equal(fx.hit[1].n, 2);
  assert.equal(fx.hit[1].t, 0);
  //  죽는 탄(hp ≤ 0)은 피격 상태를 남기지 않는다 — 사망 연출이 이어받는다
  onEnemyHit(fx, hitEv({ hp: 0 }), sp);
  assert.equal(fx.hit[1], undefined);
});

test("V3-HITFEEL HF-3: '-n' 은 여러 대 맞는 적(스폰 체력 ≥ dmgFloatMinHp)에만, 연사는 한 글자로 묶는다", () => {
  const fx = makeFx();
  onEnemyHit(fx, hitEv({ hpMax: 2, hp: 1 }), sp);
  assert.equal(fx.floaters.filter((f) => f.dmg).length, 0, '한두 방에 죽는 적은 숫자 생략');
  const fx2 = makeFx();
  onEnemyHit(fx2, hitEv({ id: 3, hpMax: 20, hp: 19, dmg: 1 }), sp);
  tick(fx2, 0.05);
  onEnemyHit(fx2, hitEv({ id: 3, hpMax: 20, hp: 16, dmg: 3 }), sp);
  const d = fx2.floaters.filter((f) => f.dmg);
  assert.equal(d.length, 1, '묶음 간격 안의 두 발은 한 글자');
  assert.equal(d[0].text, '-4');
  //  상한: 적 40기가 한꺼번에 맞아도 '-n' 은 dmgFloatCap 개까지
  const fx3 = makeFx();
  for (let i = 0; i < 40; i++) onEnemyHit(fx3, hitEv({ id: 100 + i, hpMax: 20, hp: 10 }), sp);
  assert.equal(fx3.floaters.filter((f) => f.dmg).length, FX.hit.dmgFloatCap);
});

test('V3-HITFEEL HF-4: 무기별 스파크가 다르다 — 저격 가는 선·전격 번개·산탄 작은 점 여럿·중화기 큰 점, 금속 역할은 흰·노랑 스파크를 더한다', () => {
  const sparks = (weapon, skin = null) => { const fx = makeFx(); onEnemyHit(fx, hitEv({ weapon, skin }), sp); return fx.parts; };
  assert.ok(sparks('sniper').every((p) => p.shape === 'line'));
  assert.ok(sparks('arc').every((p) => p.shape === 'bolt'));
  const sc = sparks('scatter'), hv = sparks('heavy');
  assert.ok(sc.length > hv.length, '산탄은 여럿');
  assert.ok(Math.max(...sc.map((p) => p.r)) < Math.min(...hv.map((p) => p.r)), '중화기가 크다');
  assert.equal(hv[0].color, FX.hitSparks.heavy.color);
  const armor = sparks('rifle', 'E3_wallguard');
  assert.ok(armor.length > sparks('rifle').length, '장갑체는 스파크가 많다');
  assert.ok(armor.some((p) => p.color === '#FFFFFF' || p.color === '#FFE070'), '금속 스파크');
});

test('V3-HITFEEL HF-5: 파편 상한 — partsCap 을 넘으면 오래된 것부터 버린다', () => {
  const fx = makeFx();
  const first = { x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, r: 1, tag: 'oldest' };
  fx.parts.push(first);
  for (let i = 0; i < 200; i++) onEnemyHit(fx, hitEv({ id: i, weapon: 'scatter', skin: 'E3_wallguard' }), sp);
  assert.equal(fx.parts.length, FX.partsCap);
  assert.ok(!fx.parts.includes(first), '가장 오래된 파편이 먼저 빠진다');
  fx.parts.length = 0;
  for (let i = 0; i < FX.partsCap + 5; i++) fx.parts.push({ i });
  trimParts(fx);
  assert.equal(fx.parts[0].i, 5);
});

test('V3-HITFEEL HF-6: 사망 — kill 이벤트의 kind/skin/r 이 잔해에 실리고, 역할별 연출(링·흔들림·다단 폭발)이 다르다', () => {
  const kill = (kind, skin, r = 20) => ({ type: 'kill', id: 9, kind, skin, x: 200, z: 300, r });
  for (const [kind, skin, role] of CASES.filter((c) => c[0] !== 'elite')) {
    const fx = makeFx();
    onEnemyDeath(fx, kill(kind, skin), sp);
    assert.equal(fx.corpses.length, 1, kind + '/' + skin);
    const c = fx.corpses[0];
    assert.deepEqual([c.kind, c.skin, c.r, c.role], [kind, skin, 20, role]);
    assert.ok(c.life > 0, '머무는 시간');
  }
  //  저격수 = 마젠타 링 · 카트 = 링 + 약한 흔들림 · 장갑체 = 장갑판 조각 + 연기 · 돌격체 = 먼지
  let fx = makeFx(); onEnemyDeath(fx, kill('shooter', null), sp);
  assert.ok(fx.shocks.some((s) => s.color === BAL3.colors.eshot));
  fx = makeFx(); onEnemyDeath(fx, kill('grunt', 'E7_cartyard'), sp);
  assert.ok(fx.shakeT > 0 && fx.shakeT < FX.shakeDur, '카트 = 약한 흔들림');
  fx = makeFx(); onEnemyDeath(fx, kill('grunt', 'E3_wallguard'), sp);
  assert.ok(fx.parts.some((p) => p.shape === 'plate') && fx.parts.some((p) => p.shape === 'smoke'));
  fx = makeFx(); onEnemyDeath(fx, kill('rusher', 'E2_ramhound'), sp);
  assert.ok(fx.parts.some((p) => p.shape === 'smoke'));
  //  옛 호출 꼴(역할 없이 addCorpse) = 잡졸
  fx = makeFx(); addCorpse(fx, { id: 1, kind: 'grunt', x: 0, z: 0 });
  assert.equal(fx.corpses[0].role, 'grunt');
  //  보스 = 0.6초에 걸친 다단 폭발(n 번)
  fx = makeFx();
  const booms = [];
  onBossDeath(fx, { type: 'bossKill', id: 'b1', x: 240, z: 400, r: 48 });
  assert.equal(fx.booms.length, FX.bossMultiBoom.n);
  for (let i = 0; i < 60; i++) tick(fx, 1 / 60, (x, z, r, big) => booms.push([x, z, r, big]));
  assert.equal(booms.length, FX.bossMultiBoom.n, '다단 폭발이 전부 터졌다');
  assert.equal(fx.booms.length, 0);
});

test("V3-HITFEEL HF-7: 병사 합류 — 병사들이 통 자리에서 부대로 날아가고, 다 도착하는 순간 '+n명 합류'와 반짝임", () => {
  const fx = makeFx();
  onJoin(fx, 120, 500, 3, '+3명 합류');
  assert.equal(fx.recruits.length, 3);
  tick(fx, 0.1);
  const a = fx.recruits[0];
  const start = sp(120, 500), end = squad();
  assert.ok(a.sy > Math.min(start.y, end.y) - 200 && a.sx !== 0, '날아가는 중(화면점)');
  assert.equal(fx.floaters.length, 0, '도착 전엔 글이 없다');
  for (let i = 0; i < 60; i++) tick(fx, 1 / 60);
  assert.equal(fx.recruits.length, 0, '모두 도착');
  assert.ok(fx.floaters.some((f) => f.text === '+3명 합류' && f.big), '도착 순간 크게');
  assert.ok(fx.parts.some((p) => p.shape === 'star'), '반짝임');
  //  그림은 최대 joinFly.max 명(나머지는 숫자로)
  const fx2 = makeFx();
  onJoin(fx2, 120, 500, 40, '+40명 합류');
  assert.equal(fx2.recruits.length, FX.joinFly.max);
});

test('V3-HITFEEL HF-8: combat 이벤트 페이로드 — enemyHit 에 무기·피해·스폰 체력·skin, kill 에 skin·r 이 **덧붙고** 판정은 그대로', () => {
  const stage = { id: 't', version: 1, title: 't', startUnits: 1, startWeapon: 'rifle', length: 100000, eliteZ: null,
    gateRows: [], supplies: [], walls: [], elite: null,
    spawns: [{ z: 0, kind: 'grunt', n: 1, xs: [240], zs: [400], hp: 3, skin: 'E3_wallguard', corridorHw: null }] };
  const run = createRun(stage);
  for (const u of run.units) u.fireT = 1e9;
  for (let i = 0; i < 3; i++) run.bullets.push(makeBullet('rifle', 240, 380 - i * 30, 1));
  const ev = [];
  for (let i = 0; i < 60 && !ev.some((e) => e.type === 'kill'); i++) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); ev.push(...drainEvents(run)); }
  const hits = ev.filter((e) => e.type === 'enemyHit');
  assert.equal(hits.length, 3, '3발에 죽는다(체력 3 · 판정 불변)');
  assert.deepEqual(hits.map((h) => h.hp), [2, 1, 0]);
  //  r3.31: 반지름은 체력 비례로 커진다(표 체력 2 → 3 = 1.5배 → r 14 × sizeByHp)
  const r3 = 14 * sizeByHp(2, 3);
  for (const h of hits) assert.deepEqual([h.weapon, h.dmg, h.hpMax, h.skin, h.r], ['rifle', 1, 3, 'E3_wallguard', r3]);
  const k = ev.find((e) => e.type === 'kill');
  assert.deepEqual([k.skin, k.r, k.kind], ['E3_wallguard', r3, 'grunt']);
  assert.equal(run.kills, 1);
});

//  ── 셸 결선: 규칙 run 불변 · 렌더 번쩍임 ──
function fakeCanvas(rec) {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas: null, globalAlpha: 1, fillStyle: '' }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => { if (rec) rec.push({ op: k, fill: t.fillStyle }); if (k.startsWith('create')) return grad; if (k === 'measureText') return { width: 10 }; return undefined; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { width: 480, height: 800, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }), addEventListener() {} };
}
function fakeAudio() {
  return { unlock() {}, sfx() { return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} };
}
function fakeStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }

test('V3-HITFEEL HF-9: 연출은 규칙 run 을 쓰지 않는다 — 피격·사망·합류·보스 처치 이벤트를 셸에 흘려도 run 은 한 글자도 안 바뀐다', async () => {
  const queue = [];
  let nowMs = 1000;
  const app = boot(fakeCanvas(null), { win: null, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save: createSave3(fakeStorage()), audio: fakeAudio(), sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frame = (dt) => { nowMs += dt; queue.shift()(nowMs); };
  app.setDifficulty('normal');
  app.startRun(13);
  for (let i = 0; i < 30; i++) frame(1000 / 60);
  const run = app.getRun();
  //  셸 전용 칸(lotteryOutcome·mainRecord)과 이벤트 큐는 비교에서 뺀다
  const snap = () => JSON.stringify(run, (k, v) => (k === 'events' || k === 'lotteryOutcome' || k === 'mainRecord' ? undefined : v));
  const synth = [
    hitEv({ id: 1, kind: 'grunt', skin: 'E3_wallguard', hp: 30, hpMax: 40 }), hitEv({ id: 2, kind: 'rusher', skin: 'E2_ramhound' }),
    hitEv({ id: 3, kind: 'shooter' }), hitEv({ id: 4, kind: 'grunt', skin: 'E7_cartyard', weapon: 'heavy' }), hitEv({ id: 'b1', kind: 'elite', weapon: 'arc' }),
    { type: 'kill', id: 5, kind: 'grunt', skin: 'E7_cartyard', x: 240, z: run.z + 300, r: 14 },
    { type: 'kill', id: 6, kind: 'shooter', skin: null, x: 200, z: run.z + 320, r: 22 },
    { type: 'joinMany', id: 'c1', n: 4, x: 200, z: run.z + 400 },
  ];
  const before = snap();
  run.events.push(...synth);
  //  1ms 프레임: 규칙 STEP 은 0 번(누적기가 STEP 에 못 미친다) — handleEvents·updateFx 만 돈다
  frame(1);
  const fx = app.getFx();
  assert.equal(snap(), before, '연출이 run 을 고치지 않았다');
  for (const id of [1, 2, 3, 4, 'b1']) assert.ok(fx.hit[id], 'fx.hit[' + id + ']');
  assert.equal(fx.recruits.length, 4);
  assert.ok(fx.corpses.some((c) => c.role === 'cart') && fx.corpses.some((c) => c.role === 'shooter'));
  //  시간이 지나면 피격 상태·날아가는 병사가 사라진다(이 구간은 게임이 진행되므로 run 비교는 위에서 끝낸다)
  for (let i = 0; i < 90; i++) frame(1000 / 60);
  for (const id of [1, 2, 3, 4, 'b1']) assert.equal(fx.hit[id], undefined);
  assert.equal(fx.recruits.length, 0);
});

test('V3-HITFEEL HF-10: 렌더 — 피격 중인 적·보스에 흰색 번쩍임(흰 채움)과 자세 변형(save·translate·scale), 날아가는 병사를 그린다', () => {
  const run = createRun(buildStage(1));
  run.enemies.push({ id: 900, kind: 'grunt', x: 240, z: run.z + 200, px: 240, pz: run.z + 200, vz: 60, hp: 5, hpMax: 8, r: 14, dead: false, touched: false });
  run.enemies.push({ id: 901, kind: 'shooter', skin: 'E9_spawnpod', x: 150, z: run.z + 260, px: 150, pz: run.z + 260, vz: 0, hp: 9, hpMax: 14, r: 22, dead: false, touched: false, aimT: 0 });
  const baseFx = () => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null,
    lotOpen: 0, lotSeen: false, lotSame: false, heroFire: 0, enemyHit: {}, corpses: [], hit: {}, booms: [], recruits: [] });
  const draw = (fx) => { const ops = []; createRenderer3(fakeCanvas(ops).getContext(), null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 10 }, buttons: [], saveOk: true }); return ops; };
  const whiteFills = (ops) => ops.filter((o) => (o.op === 'fill' || o.op === 'fillRect') && o.fill === HIT_FLASH_FILL).length;
  const calm = draw(baseFx());
  const fx = baseFx();
  fx.hit[900] = { t: 0.02, dir: -1, role: 'grunt', n: 1 };
  fx.hit[901] = { t: 0.02, dir: -1, role: 'shooter', n: 1 };
  const hot = draw(fx);
  assert.equal(whiteFills(hot) - whiteFills(calm), 2, '피격 중인 두 적에 흰 채움 한 번씩');
  const pose = (ops) => ops.filter((o) => o.op === 'scale').length;
  assert.equal(pose(hot) - pose(calm), 2, '스쿼시(scale) 두 번');
  //  번쩍임이 끝난 뒤(flashSec 뒤)에는 흰 채움이 없다
  fx.hit[900].t = fx.hit[901].t = FX.hit.flashSec + 0.01;
  assert.equal(whiteFills(draw(fx)), whiteFills(calm), '번쩍임은 짧다');
  //  보스: 정예 run(S3 류)을 만들 수 없으면 합성 보스로
  const brun = createRun(buildStage(1));
  brun.bosses = [{ id: 'b1', kind: 'elite', role: 'elite', x: 240, z: brun.z + 400, hp: 50, max: 80, r: 48, dead: false, state: 'patrol' }];
  brun.boss = brun.bosses[0];
  const bfx = baseFx();
  const bdraw = (f) => { const ops = []; createRenderer3(fakeCanvas(ops).getContext(), null).draw({ state: 'run', now: 1, run: brun, fx: f, hud: { distM: 10 }, buttons: [], saveOk: true }); return ops; };
  const bCalm = bdraw(bfx);
  bfx.hit.b1 = { t: 0.01, dir: -1, role: 'elite', n: 1 };
  const bHot = bdraw(bfx);
  assert.equal(whiteFills(bHot) - whiteFills(bCalm), 1, '보스 번쩍임');
  assert.ok(bHot.filter((o) => o.op === 'translate').length > bCalm.filter((o) => o.op === 'translate').length, '보스·체력 막대 흔들림');
  //  날아가는 병사: 병사 도형(삼각 fill) 이 늘어난다
  const rfx = baseFx();
  rfx.recruits = [{ x0: 0, z0: 0, i: 0, k: 2, t: 0.1, life: 0.5, sx: 200, sy: 400, s: 1.2 }, { x0: 0, z0: 0, i: 1, k: 2, t: 0.1, life: 0.5, sx: 220, sy: 380, s: 1.2 }];
  const fills = (ops) => ops.filter((o) => o.op === 'fill').length;
  assert.equal(fills(draw(rfx)) - fills(calm), 4, '병사 2명 × (금색 테 + 실루엣)');
  //  잔해: 비잡졸 잔해는 그림 없이도 그린다(그을음 타원)
  const cfx = baseFx();
  cfx.corpses = [{ x: 240, z: run.z + 150, t: 0.2, h: 40, kind: 'grunt', skin: 'E7_cartyard', r: 14, role: 'cart', life: 1, id: 3 }];
  assert.ok(draw(cfx).filter((o) => o.op === 'ellipse').length > calm.filter((o) => o.op === 'ellipse').length, '카트 그을음');
});
