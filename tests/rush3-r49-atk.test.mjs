// rush3-r49-atk — r4.9 보스별 고유 공격 + 안내 규칙(이사님 실플레이 4차, 2026-09-26).
//  이사님 원문: "보스전이 괜찮다. 다만 모든 보스를 같은 패턴으로 만들지 말고 각 보스마다 특색있는 패턴을 만들어주자. 그리고 보스전에서 피해야할 구역을
//   안내해주는데 날아오는 총알의 경우는 없애자. 광역 대미지가 있는 구역에 대한 경보만 주자."
//  BOSS-UNIQUE = 보스 스킨 5종의 고유 공격 집합이 서로 겹치지 않고 · 페이즈마다 새 공격이 열리고 · 게임 줄에서 r4.8 공용 5종·옛 부채꼴이 쓰이지 않고 ·
//   역할(포격·소환·장갑)은 자기 스킨 공격만.
//  BOSS-TELE = 탄 공격은 도로에 예고·안전 구역 그림이 없고(장전 번쩍임은 보스 몸에만) · 광역만 붉은 경보 · 초록은 어디에도 없다(그리기 호출 기록).
//  BOSS-SAFE(한 번에 한 공격) · BOSS-SLOW(그물 느려짐 — 걸리면 느려지고, 느려져도 다음 공격은 피할 수 있다) · BOSS-POOL(남는 쇳물).
//  BOSS-DODGE(모든 판·보스·공격 × 병력 × 자리)는 rush3-r49-dodge-{a,b,c,d} 네 파일(병렬).
//  ⚠️난이도 판단이 아니다(이사님 지시 "난이도는 너의 봇테스트로 하지 말도록") — 봇 승패를 잠그지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { atkPlanFor, unlockedAtk, ATK_KINDS, ATK_DEFAULT_SKIN, atkType, skinKinds } from '../rush3/bossatk.js';
import { createRenderer3, ATK_CHARGE, ATK_DANGER, ATK_LOOK, ATK_FX } from '../rush3/render.js';
import { SPRITE_KEYS3 } from '../rush3/sprites.js';
import { makeFx } from '../rush3/main.js';
import { pickInput } from './lib/rush3-policies.mjs';
import { bootApp } from './lib/rush3-shell.mjs';
import { BA, atkRun, playAttack, botInput, playInput, isStart, inp, checkSafe } from './lib/rush3-bossatk.mjs';

const SKINS = Object.keys(BA.skins);
//  r4.8 공용 5종(게임 줄에서 더 쓰지 않는다)
const OLD_KINDS = ['aim', 'wall', 'pillar', 'sweep', 'burst'];
//  r4.9 (가) 옛 초록 안전 구역 색(r4.8 ATK_SAFE) — 이제 어디에도 그려지지 않아야 한다
const OLD_GREEN = '#5CFF8A';
//  공격마다 그 공격을 쓰는 판 하나(그림 검사·느려짐 검사용). r4.10: 게임 줄 보스 판(3·6·9·12·15·18·21·24)에서 — 9번 = B3 레일 리바이어던 · 12번 = B4 스멜터
const STAGE_OF = { blade: 3, smoke: 3, ricochet: 3, hook: 6, needles: 6, web: 6, rail: 9, chain: 9, crossrail: 9, pour: 12, slag: 12, rain: 12, mace: 24, blades: 24, quake: 24 };
//  r4.10(이사님 실플레이 5차 — 보스는 3·6·9·12·15·18·21·24 판에만): 게임 줄 보스 판
const BOSS_IDS = BAL3.difficulty.brutal.bossStages;

test('BOSS-UNIQUE 배정표: 스킨 5종 × 고유 공격 3종 = 15종이 서로 겹치지 않는다 · 스킨마다 탄·광역이 섞여 있다 · r4.8 공용 5종은 없다 · 판 정의(1~24)의 배정은 자기 스킨 공격만', () => {
  assert.equal(SKINS.length, 5);
  const all = SKINS.flatMap((s) => skinKinds(s));
  assert.equal(all.length, 15, '스킨마다 3종');
  assert.equal(new Set(all).size, 15, '어떤 두 보스도 같은 공격이 없다');
  assert.deepEqual([...ATK_KINDS].sort(), [...all].sort(), '공격 표 = 스킨 공격의 합');
  for (const k of OLD_KINDS) assert.ok(!ATK_KINDS.includes(k), 'r4.8 공용 패턴 없음: ' + k);
  for (let i = 0; i < SKINS.length; i++) for (let j = i + 1; j < SKINS.length; j++) {
    const a = new Set(skinKinds(SKINS[i]));
    assert.ok(!skinKinds(SKINS[j]).some((k) => a.has(k)), `${SKINS[i]} ↔ ${SKINS[j]} 겹침 없음`);
  }
  for (const s of SKINS) {
    const ks = skinKinds(s);
    for (const k of ks) assert.equal(BA.kinds[k].skin, s, `${k} 의 주인 = ${s}`);
    assert.ok(ks.some((k) => atkType(k) === 'shot') && ks.some((k) => atkType(k) === 'aoe'), `${s}: 탄과 광역이 섞여 있다`);
  }
  //  판 정의: 게임 줄 보스마다 자기 스킨(그림이 없으면 B1)의 공격만 · 배수 1 줄은 배정이 없다
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    //  r4.10 중간 보스(mid — 보스와 다르다: 고유 공격 없음, 검사 MIDBOSS)는 뺀다
    for (const e of st.elites.filter((x) => !x.mid)) {
      const skin = e.skin ?? ATK_DEFAULT_SKIN;
      assert.equal(e.atk.skin, skin, `S${id}: 공격 스킨 = 그림 스킨`);
      for (const k of e.atk.seq) assert.ok(skinKinds(skin).includes(k), `S${id} ${skin}: ${k} 는 자기 공격`);
      assert.equal(new Set(e.atk.seq).size, e.atk.seq.length, `S${id}: 순서에 같은 공격이 두 번 없다`);
    }
    assert.equal(buildStage(id).elites.some((e) => 'atk' in e), false, `S${id}: 배수 1 줄은 배정이 없다`);
  }
});

test('BOSS-UNIQUE 페이즈·역할: 체력 50%·30%(r4.9 (다) 게임 줄 문턱) 마다 새 고유 공격이 하나씩 열린다(보스 판 8개 — 모두 페이즈 있음) · 페이즈 없는 판의 배정(early)은 삽날 밀기·잔해 튕기기를 처음부터 번갈아 · 포격 = 자기 스킨 탄 · 소환 = 광역 하나 · 장갑 = 광역 · 18번 포격은 B1 그레이더(그림 키 elite = B1_grader)', () => {
  //  r4.10: 게임 줄 보스 판(3~24 의 3의 배수)은 모두 페이즈가 있다(bossPhases.from 3) — 페이즈 없는 1·2번에는 이제 보스가 없다
  for (const id of BOSS_IDS) assert.equal(buildStage(id, { difficulty: 'brutal' }).bossPhases, true, `S${id} 보스 판은 페이즈 있음`);
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    //  r4.10 중간 보스(mid — 보스와 다르다: 고유 공격 없음, 검사 MIDBOSS)는 뺀다
    for (const e of st.elites.filter((x) => !x.mid)) {
      const p = e.atk;
      if ((e.role ?? 'elite') !== 'elite') continue;
      if (st.bossPhases) {
        assert.equal(p.open, 1, `S${id}: 처음 하나`);
        assert.equal(p.seq.length, p.open + BAL3.bossPhases.at.length, `S${id}: 페이즈마다 하나씩`);
        for (let ph = 1; ph <= BAL3.bossPhases.at.length; ph++) {
          const a = unlockedAtk(p, ph - 1), b = unlockedAtk(p, ph);
          assert.equal(b.length, a.length + 1);
          assert.ok(!a.includes(b[b.length - 1]), `S${id}: 페이즈 ${ph} 에서 새 공격`);
        }
      } else {
        assert.deepEqual(unlockedAtk(p, 0), ['blade', 'ricochet'], `S${id}(페이즈 없음): 삽날 밀기·잔해 튕기기 번갈아`);
      }
    }
  }
  //  페이즈 없는 판의 배정(학습 구간 early — 배정 함수는 그대로): 삽날 밀기·잔해 튕기기를 처음부터 둘 다 연다
  assert.deepEqual(unlockedAtk(atkPlanFor({}, false, { phases: false }), 0), ['blade', 'ricochet'], '페이즈 없음: 삽날 밀기·잔해 튕기기 번갈아');
  assert.deepEqual(atkPlanFor({ role: 'gunner' }).seq, ['blade', 'ricochet'], '18번 포격(그림 없음) = B1 탄 공격');
  assert.equal(atkPlanFor({ role: 'gunner' }).skin, 'B1_grader');
  assert.equal(SPRITE_KEYS3.elite, 'B1_grader', '그림 없는 보스의 그림 = B1 그레이더');
  assert.deepEqual(atkPlanFor({ role: 'gunner', skin: 'B3_railleviathan' }).seq, ['chain'], '23번 포격 = B3 탄(객차 연결탄)');
  assert.deepEqual(atkPlanFor({ role: 'summoner', skin: 'B2_gantrywidow' }).seq, ['hook'], '소환 = 광역 하나(갈고리 낙하)');
  assert.deepEqual(atkPlanFor({ role: 'tank', skin: 'B4_smelter' }).seq, ['pour', 'rain'], '장갑 = 광역만(쇳물 붓기·쇳물 비)');
  //  실제 판의 역할 배정(r4.10: 복수 보스 판 = 18번 합동전 — 옛 10번의 B1 포격 + B2 소환. 옛 23번 3체는 게임 줄에서 중간 보스 판이 되었다)
  const s18 = buildStage(18, { difficulty: 'brutal' });
  assert.deepEqual(s18.elites.map((e) => [e.role, e.atk.skin, e.atk.seq.join(',')]), [['gunner', 'B1_grader', 'blade,ricochet'], ['summoner', 'B2_gantrywidow', 'hook']]);
  for (const e of s18.elites) {
    const want = e.role === 'gunner' ? 'shot' : 'aoe';
    for (const k of e.atk.seq) assert.equal(atkType(k), want, `${e.role}: ${k}`);
  }
});

test('BOSS-UNIQUE 실제 판: 게임 줄 보스 판 8개의 보스는 조준 부채꼴(eshot n ≥ 3)을 쏘지 않고, 쏜 탄·터진 구역은 모두 **자기 스킨의 고유 공격**(r4.8 공용 5종 없음) · 배수 1 줄 보스(1~24)는 종전 부채꼴 그대로', () => {
  for (const id of ALL_STAGE_IDS) {
    for (const row of ['brutal', 'normal']) {
      if (row === 'brutal' && !BOSS_IDS.includes(id)) continue;
      const st = buildStage(id, { difficulty: row });
      const stage = { ...st, startUnits: 30, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
      const run = createRun(stage, { heroGuard: true });
      run.z = run.prevZ = stage.eliteZ - 2;
      let fans = 0, pattern = 0;
      const used = new Set();
      for (let i = 0; i < 60 * 16 && !run.over; i++) {
        stepRun(run, pickInput('planBoss', run), STEP);
        for (const b of run.bosses) { b.hp = b.max = 1e9; b.summon = false; b.phase = 2; }
        for (const u of run.units) u.hp = 1e9;
        for (const s of run.eshots) if (s.atk != null) { pattern++; used.add(s.pat); }
        for (const e of drainEvents(run)) {
          if (e.type === 'eshot' && e.n >= 3) fans++;
          if (e.type === 'bossBoom' || isStart(e)) used.add(e.kind);
        }
      }
      if (row === 'brutal') {
        assert.equal(fans, 0, `S${id} 게임 줄: 부채꼴 없음`);
        assert.ok(run.bosses.every((b) => b.atk && !b.shoot), `S${id} 게임 줄: 모든 보스가 고유 공격`);
        const own = new Set(run.bosses.flatMap((b) => skinKinds(b.atk.skin)));
        assert.ok(used.size > 0, `S${id}: 공격이 나왔다`);
        for (const k of used) { assert.ok(own.has(k), `S${id}: ${k} 는 이 판 보스 스킨의 공격`); assert.ok(!OLD_KINDS.includes(k), `S${id}: 공용 ${k} 없음`); }
      } else {
        assert.ok(run.bosses.every((b) => !('atk' in b)) && !('bossAtk' in run), `S${id} 배수 1 줄: 공격 칸 없음`);
        assert.equal(pattern, 0);
        if (run.bosses.some((b) => b.shoot)) assert.ok(fans > 0, `S${id} 배수 1 줄: 부채꼴 그대로`);
      }
    }
  }
});

test('BOSS-UNIQUE 페이즈 실제: 3번 B1 — 체력 90% 는 삽날 밀기만, 45% 에 굴뚝 매연탄, 29%(30% 문턱 바로 아래 — 광분) 에 잔해 튕기기가 실제로 나온다 · 페이즈 없는 판(3번을 페이즈 없이 세운 판 — r4.10 게임 줄에는 없다)은 삽날 밀기·잔해 튕기기가 처음부터 번갈아', () => {
  const run0 = (id, noPhase = false) => {
    const st0 = buildStage(id, { difficulty: 'brutal' });
    //  페이즈 없는 판: 옛 1·2번 학습 구간과 같은 배정(early)·페이즈 끔(규칙 경로 그대로 — 판 정의 칸만 바꾼 합성 판)
    const st = noPhase ? { ...st0, bossPhases: false, elites: st0.elites.map((e) => ({ ...e, atk: atkPlanFor(e, false, { phases: false }) })) } : st0;
    const stage = { ...st, startUnits: 60, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
    const run = createRun(stage, { heroGuard: true });
    run.z = run.prevZ = stage.eliteZ - 2;
    return run;
  };
  const attacks = (run, count, hpFrac) => {
    const kinds = [];
    for (let i = 0; i < 60 * 90 && kinds.length < count; i++) {
      stepRun(run, playInput(run), STEP);
      for (const b of run.bosses) { b.summon = false; b.hp = b.max * hpFrac; }
      for (const u of run.units) u.hp = 1e9;
      for (const e of drainEvents(run)) if (isStart(e)) kinds.push(e.kind);
    }
    return kinds;
  };
  const r4 = run0(3);
  assert.deepEqual([...new Set(attacks(r4, 3, 0.9))], ['blade']);
  const p1 = attacks(r4, 4, 0.45);
  assert.ok(p1.includes('smoke') && !p1.includes('ricochet'), '50% 아래: 굴뚝 매연탄이 열린다 ' + p1);
  const p2 = attacks(r4, 5, 0.29);
  assert.ok(p2.includes('ricochet'), '30% 아래(광분): 잔해 튕기기가 열린다 ' + p2);
  const r1 = run0(3, true);
  const k1 = attacks(r1, 4, 0.9);
  assert.deepEqual([...new Set(k1)].sort(), ['blade', 'ricochet'], '페이즈 없음: 두 공격 번갈아 ' + k1);
  for (let i = 1; i < k1.length; i++) assert.notEqual(k1[i], k1[i - 1], '페이즈 없음: 번갈아 나온다');
});

test('BOSS-SAFE 한 번에 한 공격: 복수 보스 판(18 합동전 — r4.10)과 광장(21·24) — 60초 동안 시작~끝 사이에 새 공격이 없고, 보스가 번갈아 공격하며, 봇은 피해 0', () => {
  for (const id of [18, 21, 24]) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const stage = { ...st, startUnits: 60, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
    const run = createRun(stage, { heroGuard: true });
    run.z = run.prevZ = stage.eliteZ - 2;
    let open = null, starts = 0, hurt = 0;
    const who = [];
    for (let i = 0; i < 60 * 60; i++) {
      stepRun(run, playInput(run), STEP);
      for (const b of run.bosses) { if (b.hp < 1e8) b.hp = b.max = 1e9; b.summon = false; }
      if (run.arena) { run.arena.boss.touchDmg = 0; run.arena.boss.shock.dmg = 0; }
      for (const e of drainEvents(run)) {
        if (isStart(e)) { assert.equal(open, null, `S${id}: 앞 공격(${open})이 끝나기 전에 새 공격`); open = e.serial; starts++; who.push(e.id); }
        if (e.type === 'bossAtkEnd') { assert.equal(e.serial, open); open = null; }
        if (e.type === 'hurt' && e.cause === 'shot') hurt++;
      }
    }
    assert.ok(starts >= 6, `S${id}: 공격 ${starts}번`);
    assert.equal(hurt, 0, `S${id}: 보이는 탄·경보를 보고 설 곳으로 간 부대는 60초 내내 피해 0`);
    if (st.elites.length > 1) assert.equal(new Set(who).size, st.elites.length, `S${id}: 보스 ${st.elites.length}체가 모두 공격한다(차례)`);
    if (st.elites.length > 1) for (let i = 1; i < who.length; i++) assert.notEqual(who[i], who[i - 1], `S${id}: 같은 보스가 연달아 공격하지 않는다`);
  }
});

//  호출 기록 ctx(rush3-render 와 같은 꼴): 호출마다 { op, args, fill, stroke, alpha }
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
const drawRun = (run, fx = makeFx()) => {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 0 }, buttons: [], saveOk: true });
  return ops;
};
const hasColor = (ops, c) => ops.some((o) => ((o.op === 'fill' || o.op === 'fillRect') && o.fill === c) || (o.op === 'stroke' && o.stroke === c));
//  광역이 터질 때 보스 특색 연출 색(셸 fx.atkBlasts → render.drawAtkBlasts)
const BOOM_COLOR = { smoke: ATK_FX.smoke, hook: ATK_FX.steel, web: ATK_FX.web, rail: ATK_FX.train, crossrail: ATK_FX.train, pour: ATK_FX.molten, rain: ATK_FX.molten, mace: ATK_FX.gold, quake: ATK_FX.gold };

test('BOSS-TELE 그림(안내 규칙): 탄 공격 6종은 장전 동안 보스 몸 번쩍임만 · 도로에 붉은 표시·안전 구역 자료 없음(발사 뒤에도) · 탄은 보스 스킨 모양 색 / 광역 9종은 붉은 경보만(장전 번쩍임 없음) · 터지면 보스 특색 연출 · 초록은 어디에도 없다 · 그리기는 run 을 읽기만 한다', () => {
  for (const kind of ATK_KINDS) {
    const id = STAGE_OF[kind];
    const { run, bo } = atkRun(id, 60, 0, kind, 240, 0);
    let n = 0;
    while (!run.bossAtk.cur && n++ < 30) { stepRun(run, inp(240), STEP); drainEvents(run); }
    const cur0 = run.bossAtk.cur;
    assert.equal(cur0 && cur0.kind, kind, `S${id} ${kind} 시작`);
    const snap = JSON.stringify(run);
    const ops = drawRun(run);
    assert.equal(JSON.stringify(run), snap, `S${id} ${kind}: 그리기 전후 run 이 같다`);
    assert.ok(!hasColor(ops, OLD_GREEN), `${kind}: 초록 안전 구역 없음`);
    if (atkType(kind) === 'shot') {
      assert.equal(cur0.state, 'charge', `${kind}: 탄 공격은 장전부터`);
      assert.ok(hasColor(ops, ATK_CHARGE), `${kind}: 장전 번쩍임(보스 몸)`);
      assert.ok(!hasColor(ops, ATK_DANGER), `${kind}: 장전 동안 도로에 붉은 표시 없음`);
      assert.ok(!('safe' in cur0) && !('goal' in cur0) && !('shots' in cur0), `${kind}: 장전 중 공격 칸에 설 곳·탄 자료가 없다(그릴 것이 없다)`);
      while (run.bossAtk.cur && run.bossAtk.cur.state === 'charge') { stepRun(run, inp(240), STEP); drainEvents(run); }
      const cur = run.bossAtk.cur;
      for (let i = 0; i < 8; i++) { stepRun(run, botInput(run, 240), STEP); drainEvents(run); }
      assert.ok(run.eshots.some((s) => s.atk === cur.serial && s.pat === kind), `${kind}: 발사`);
      const ops2 = drawRun(run);
      assert.ok(!hasColor(ops2, ATK_DANGER) && !hasColor(ops2, OLD_GREEN) && !hasColor(ops2, ATK_CHARGE), `${kind}: 발사 뒤에도 도로 안내 없음`);
      assert.ok(hasColor(ops2, ATK_LOOK[bo.atk.look].color), `${kind}: 탄 모양 색 ${bo.atk.look}`);
    } else {
      assert.equal(cur0.state, 'tele', `${kind}: 광역은 경보부터`);
      assert.ok(hasColor(ops, ATK_DANGER), `${kind}: 붉은 경보 구역`);
      assert.ok(!hasColor(ops, ATK_CHARGE), `${kind}: 광역에는 장전 번쩍임이 없다`);
      //  터짐: 셸이 bossBoom 으로 넣는 연출(fx.atkBlasts)이 보스 특색 색으로 그려진다
      const fx = makeFx();
      let booms = 0;
      for (let i = 0; i < 60 * 3 && run.bossAtk.cur; i++) {
        stepRun(run, botInput(run, 240), STEP);
        for (const e of drainEvents(run)) if (e.type === 'bossBoom') { booms++; fx.atkBlasts.push({ kind: e.kind, shape: e.shape, look: e.look, t: 0.1, life: 0.4 }); }
        if (booms) break;
      }
      assert.ok(booms > 0, `${kind}: 터짐`);
      const ops3 = drawRun(run, fx);
      assert.ok(hasColor(ops3, BOOM_COLOR[kind]), `${kind}: 터지는 연출 = 보스 특색 색`);
      assert.ok(!hasColor(ops3, OLD_GREEN), `${kind}: 터진 뒤에도 초록 없음`);
    }
  }
  //  스킨 5종 탄 모양이 모두 다르다
  assert.equal(new Set(Object.values(BA.skins).map((s) => s.look)).size, 5);
  for (const s of Object.values(BA.skins)) assert.ok(ATK_LOOK[s.look], s.look);
  //  소스에도 초록 안전 구역 색·상수가 남아 있지 않다
  const src = readFileSync(new URL('../rush3/render.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('ATK_SAFE') && !src.includes(OLD_GREEN), 'render.js: 초록 안전 구역 상수·색 없음');
});

test('V3-SHELL-BOSSATK: 게임 화면(셸) — 3번 B1 탄 공격 = 장전음(bossCharge) + 보스 몸 번쩍임 · 도로에 붉은·초록 안내 없음 · 잔해 덩어리 탄 / 6번 B2 광역(갈고리 낙하) = 경보음(lotWarn) + 붉은 경보 + 터지는 소리·강철 연출', async () => {
  //  r4.10: 게임 줄 첫 보스 판 = 3번(1번은 대물결 판)
  const h = await bootApp({ withOps: true, unlockThrough: 2 });
  h.app.startRun(3);
  h.frames(2);
  const run = h.app.getRun();
  run.z = run.prevZ = run.eliteZ - 4;
  run.spawnCursor = run.spawns.length; run.enemies.length = 0;
  let charge = false, flash = false, road = false, debris = false, chargeSfx = false, n = 0;
  while (h.app.getState() === 'run' && n++ < 60 * 40 && !(charge && debris && flash)) {
    const r = h.app.getRun();
    //  3번 보스는 페이즈가 있다 — 체력 1e9 로 두면 페이즈 0(삽날 밀기 = 탄 공격만)이라 1번 시절과 같은 탄 공격만 본다
    for (const b of r.bosses) { b.hp = b.max = 1e9; }
    for (const u of r.units) u.hp = 1e9;
    h.app.input.state.pointerX = botInput(r, 240).pointerX;
    h.ops.length = 0;
    const before = h.audio.played.length;
    h.frames(1);
    if (h.audio.played.slice(before).includes('bossCharge')) chargeSfx = true;
    if (r.bossAtk && r.bossAtk.cur && r.bossAtk.cur.state === 'charge') { charge = true; if (hasColor(h.ops, ATK_CHARGE)) flash = true; }
    if (hasColor(h.ops, ATK_DANGER) || hasColor(h.ops, OLD_GREEN)) road = true;
    if (hasColor(h.ops, ATK_LOOK.debris.color)) debris = true;
  }
  assert.ok(charge && chargeSfx && flash, '장전 + 장전음 + 보스 몸 번쩍임');
  assert.ok(!road, '3번 보스(페이즈 0 = 탄 공격만)의 공격 내내 도로에 붉은·초록 안내 없음');
  assert.ok(debris, 'B1 보스 탄 = 잔해 덩어리');
  const g = await bootApp({ withOps: true, unlockThrough: 5 });
  g.app.startRun(6);
  g.frames(2);
  const r6 = g.app.getRun();
  r6.z = r6.prevZ = r6.eliteZ - 4;
  r6.spawnCursor = r6.spawns.length; r6.enemies.length = 0;
  let tele = false, red = false, warn = false, boomSfx = false, steel = false, m = 0;
  while (g.app.getState() === 'run' && m++ < 60 * 40 && !(tele && red && warn && boomSfx && steel)) {
    const r = g.app.getRun();
    for (const b of r.bosses) { b.hp = b.max = 1e9; }
    for (const u of r.units) u.hp = 1e9;
    g.app.input.state.pointerX = botInput(r, 240).pointerX;
    g.ops.length = 0;
    const before = g.audio.played.length;
    g.frames(1);
    const played = g.audio.played.slice(before);
    if (played.includes('lotWarn')) warn = true;
    if (r.bossAtk && r.bossAtk.cur && r.bossAtk.cur.state === 'tele') { tele = true; if (hasColor(g.ops, ATK_DANGER)) red = true; }
    if (played.includes('kill') && tele) boomSfx = true;
    if (hasColor(g.ops, ATK_FX.steel)) steel = true;
    assert.ok(!hasColor(g.ops, OLD_GREEN), '초록 안전 구역 없음');
  }
  assert.ok(tele && red && warn, '광역 경보 + 경보음 + 붉은 경보 구역');
  assert.ok(boomSfx && steel, '갈고리가 내리꽂힘 = 터지는 소리 + 강철 연출(크레인 줄·먼지 고리)');
});

test('BOSS-SLOW 거미줄 그물: 그물 안 병사는 피해 + 부대가 2초 동안 느려진다(가로 최고 속도 × 0.5) · 느려짐은 게임 줄 그물에 걸렸을 때만 생긴다 · 느려진 채로도 모든 고유 공격을 피할 수 있다(설계가 느려진 닿는 거리로 잰다)', () => {
  const W = BA.kinds.web;
  //  ① 제자리 부대가 그물에 걸린다 → 피해 + slowT
  let caught = null;
  for (const x0 of [140, 240, 340]) {
    const { run } = atkRun(STAGE_OF.web, 60, 0, 'web', x0, 0);
    for (let i = 0; i < 60 * 3 && !caught; i++) {
      stepRun(run, inp(x0), STEP);
      for (const e of drainEvents(run)) if (e.type === 'bossBoom' && e.hits > 0) caught = { run, x0 };
    }
    if (caught) break;
  }
  assert.ok(caught, '제자리 부대가 그물에 걸린다');
  const run = caught.run;
  assert.ok(Math.abs(run.slowT - (W.slowSec - 0)) < STEP * 2, `느려짐 ${run.slowT}초`);
  //  느려진 동안 가로 최고 속도 = moveMax × slowMul(멀리 끌어도 한 STEP 이동 ≤ 250 × 0.5 / 60)
  const target = run.x > 240 ? 90 : 390;
  let maxStep = 0;
  for (let i = 0; i < 30; i++) { const x = run.x; stepRun(run, inp(target), STEP); drainEvents(run); maxStep = Math.max(maxStep, Math.abs(run.x - x)); }
  assert.ok(maxStep <= BAL3.squad.moveMax * W.slowMul * STEP + 1e-6 && maxStep > BAL3.squad.moveMax * W.slowMul * STEP * 0.9, `느려진 한 STEP 이동 ${maxStep.toFixed(3)}`);
  for (let i = 0; i < 60 * 2; i++) { stepRun(run, inp(240), STEP); drainEvents(run); }
  assert.ok(!('slowT' in run), '2초 뒤 느려짐이 풀리고 칸이 지워진다');
  //  ② 느려진 채로 시작한 공격(모든 고유 공격 × 시작 자리 3곳)도 피할 수 있다 — 설계의 닿는 거리가 느려짐을 반영한다
  for (const kind of ATK_KINDS) {
    const id = STAGE_OF[kind], arena = !!buildStage(id, { difficulty: 'brutal' }).arena;
    let started = 0;
    for (const [xi, x0] of (arena ? [100, 240, 380] : [140, 240, 340]).entries()) {
      const r0 = atkRun(id, 60, 0, kind, x0, xi, { slow: W.slowSec }).run;
      const r = playAttack(r0, 'move', x0);
      if (!r.started) continue;
      started++;
      const label = `느려짐 S${id} ${kind} x${x0}`;
      assert.equal(r.hurt, 0, label + ': 피해 0');
      checkSafe(r.plan, r.at, r.flightT, arena, label, r.plan.type === 'shot' ? W.slowSec - (BA.charge + STEP) : W.slowSec - STEP);
    }
    assert.ok(started > 0, `느려짐 ${kind}: 한 곳 이상에서 공격이 시작된다`);
  }
  //  배수 1 줄(normal)에는 그물이 없다 → 느려짐 칸이 생기지 않는다
  assert.equal(buildStage(6).elites.some((e) => 'atk' in e), false);
});

test('BOSS-POOL 쇳물 붓기: 붓는 순간 원 안 병사 피해 · 쇳물이 3초 남아 들어가면 0.5초마다 피해 · 쇳물이 식어야 공격이 끝난다 · 보스가 쓰러지면 남은 쇳물도 거둔다', () => {
  const P = BA.kinds.pour;
  const { run } = atkRun(STAGE_OF.pour, 30, 0, 'pour', 240, 0);
  //  웅덩이에 걸어 들어가도 판이 끝나지 않게(피해 수만 센다)
  for (const u of run.units) u.hp = 1e9;
  let boomAt = null, zone = null, end = null, t = 0;
  const hurtT = [];
  for (let i = 0; i < 60 * 8 && end == null; i++) {
    //  경보 동안은 설 곳으로 피했다가, 터진 뒤 쇳물 한가운데로 걸어 들어간다
    const into = zone && t > boomAt + 0.6;
    stepRun(run, into ? inp(zone.x) : botInput(run, 240), STEP);
    t += STEP;
    for (const e of drainEvents(run)) {
      if (e.type === 'bossBoom') { boomAt = t; zone = e.shape; assert.equal(e.hits, 0, '경보를 보고 피한 부대는 붓는 순간 안 맞는다'); }
      if (e.type === 'hurt' && e.cause === 'shot') hurtT.push(t);
      if (e.type === 'bossAtkEnd') end = t;
    }
  }
  assert.ok(zone && zone.t === 'circ' && zone.R === P.R, '쇳물 웅덩이');
  assert.ok(hurtT.length > 0 && hurtT.every((x) => x > boomAt + 0.6), '웅덩이에 들어간 뒤에 맞는다');
  //  남은 쇳물 피해는 tick(0.5초) 간격으로만
  const ticks = [...new Set(hurtT.map((x) => Math.round((x - boomAt) / STEP)))];
  for (let i = 1; i < ticks.length; i++) assert.equal(ticks[i] - ticks[i - 1], Math.round(P.tick / STEP), '쇳물 피해 간격 = tick');
  assert.ok(end != null && end >= boomAt + P.linger - STEP * 2 && end <= boomAt + P.linger + STEP * 2, `쇳물이 식을 때(${P.linger}초) 공격이 끝난다`);
  //  보스가 쓰러지면(복수 보스 판의 한 보스) 남은 쇳물도 거둔다 — r4.10: 복수 보스 판 = 18번(둘째 보스에게 쇳물 붓기를 시킨 합성 공격, 규칙 경로는 같다)
  const s23 = atkRun(18, 30, 1, 'pour', 240, 0);
  for (let i = 0; i < 60 * 1.2; i++) { stepRun(s23.run, botInput(s23.run, 240), STEP); drainEvents(s23.run); }
  assert.ok(s23.run.bossAtk.cur && s23.run.bossAtk.cur.zones.some((z) => z.until > s23.run.bossAtk.cur.age), '쇳물이 남아 있다');
  s23.bo.hp = 0; s23.bo.dead = true;
  stepRun(s23.run, inp(240), STEP);
  assert.equal(s23.run.bossAtk.cur, null, '보스가 쓰러지면 남은 쇳물을 거둔다');
});

test('V3-PURE-BOSSATK: rush3/bossatk.js 는 난수·시계·저장·코인·화면이 없고, 난이도 이름·적 표(BAL3.enemies)를 읽지 않는다 · combat.js 의 stepRun 이후 규약(DIFF-6) 그대로', () => {
  const code = readFileSync(new URL('../rush3/bossatk.js', import.meta.url), 'utf8');
  for (const s of ['Math.random', 'Date.', 'performance.', 'localStorage', 'document', 'window', 'BAL3.enemies', 'difficult', 'save.js', 'coins.js', 'wallet']) assert.ok(!code.includes(s), 'bossatk.js: ' + s);
  assert.doesNotMatch(code, /import[^;]*from\s*['"][^'"]*rng\.js['"]/);
  const src = readFileSync(new URL('../rush3/combat.js', import.meta.url), 'utf8');
  const tail = src.slice(src.indexOf('export function stepRun'));
  for (const s of ['BAL3.enemies', 'EN[', 'EN.', 'difficult']) assert.ok(!tail.includes(s), 'DIFF-6: ' + s);
});
