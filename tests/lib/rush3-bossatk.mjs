// tests/lib/rush3-bossatk.mjs — r4.9 보스 고유 공격 검사 도구(BOSS-DODGE·BOSS-SAFE·BOSS-UNIQUE 가 함께 쓴다).
//  보스전만 떼어 낸 판에서 보스 하나가 고유 공격 하나만 쓰게 세우고(atkRun), 공격 한 번을 봇으로 지나간다(playAttack).
//  봇 = '보이는 것만 보고 움직이는 부대': 광역은 붉은 경보가 뜬 순간부터, 탄은 **발사 뒤 탄이 보일 때부터** 규칙이 아는 설 곳(cur.goal — 빈틈 가운데)으로 간다.
//   장전 중에는 모른다(도로에 안내가 없다). 광장은 세로(dragDy)도 움직인다.
//  ⚠️난이도 판단이 아니다(이사님 지시 "난이도는 너의 봇테스트로 하지 말도록") — '피할 수 있음'의 기계적 증명·동작 확인이다.
import assert from 'node:assert/strict';
import { BAL3 } from '../../rush3/balance.js';
import { buildStage } from '../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../rush3/combat.js';
import { ATK_DEFAULT_SKIN, atkType, planHazards, shapeHitsBox, squadFrame } from '../../rush3/bossatk.js';

export const BA = BAL3.bossAtk;
export const NS = [1, 30, 60, 100];
const SQ = BAL3.squad;
export const inp = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });
//  실제 대형 반폭(유닛 원 끝까지)·앞뒤 끝
export const halfW = (run) => run.units.reduce((m, u) => Math.max(m, Math.abs(u.dx)), 0) + SQ.unitR;

/** 보스전만 떼어 낸 판: 게임 줄 id 판, 병력 n, 보스 bi 가 공격 kind 하나만(k = 이 공격을 쓴 횟수 — 빈틈 위치·겨누는 쪽 번갈이).
 *  다른 보스는 공격 차례에서 뺀다. 도로 보스는 하강을 건너뛰어 자리(hold)에, 광장 보스는 부대 위쪽(240, +400)에서 추격.
 *  보스 체력·소환·접촉·착지 충격·돌진은 끈다(그 공격의 피해만 센다). opts.slow = 시작할 때 그물 느려짐 남은 초 · opts.mod(run) = 더 손볼 것 */
export function atkRun(id, n, bi, kind, x0, k, opts = {}) {
  const st = buildStage(id, { difficulty: 'brutal' });
  const stage = { ...st, startUnits: n, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
  const run = createRun(stage, { heroGuard: true });
  run.z = run.prevZ = stage.eliteZ - 2;
  let steps = 0;
  while (!run.bosses.length && steps < 600) { stepRun(run, inp(x0), STEP); drainEvents(run); steps++; }
  for (const b of run.bosses) {
    b.hp = b.max = 1e9; b.summon = false;
    if (b.arena) { b.x = 240; b.z = run.z + 400; b.state = 'chase'; b.dashT = 1e9; }
    else { b.z = run.z + b.holdAhead; b.state = 'hold'; }
    if (b.index !== bi) b.atk = null;
  }
  if (run.arena) { run.arena.boss.touchDmg = 0; run.arena.boss.shock.dmg = 0; }
  const bo = run.bosses[bi];
  bo.atk = { ...bo.atk, seq: [kind], open: 1 };
  bo.atkK[kind] = k;
  run.hwCap = run.bossHw;
  run.bossAtk.wait = 1e9;
  for (let i = 0; i < 40; i++) { stepRun(run, inp(x0), STEP); drainEvents(run); }
  if (opts.mod) opts.mod(run, bo);
  if (opts.slow) run.slowT = opts.slow;
  run.bossAtk.wait = 0; run.bossAtk.turn = bo.index;
  return { run, bo };
}

//  봇이 설 곳을 아는가: 광역 = 경보부터 · 탄 = 발사 뒤(탄이 보일 때)부터
export const canSee = (cur) => !!(cur && cur.goal && (cur.type !== 'shot' || cur.state === 'act'));
/** 봇 입력: 설 곳을 알면 그 x(광장은 세로 목표 tay 도 — 부대 중심 z = run.z − ay), 모르면 x0 그대로 */
export function botInput(run, x0) {
  const cur = run.bossAtk && run.bossAtk.cur;
  if (!canSee(cur)) return inp(x0);
  const o = inp(cur.goal.x);
  if (run.phase === 'arena') o.dragDy = (run.z - cur.goal.z) - run.tay;
  return o;
}
/** 보스전을 통째로 치르는 봇 입력(사람처럼): 설 곳을 알면 그리로(botInput). 공격이 없을 때 — 도로 = 보스 바로 아래를 따라감(r4.8 BOSS-SAFE 봇) ·
 *  광장 = 추격하는 보스에게서 가장 먼 모서리(x 100·380 × 위·아래 끝)로 거리를 둔다(보스가 부대 위에 올라앉으면 보스 둘레를 치는 공격을 할 수 없다) */
export function playInput(run) {
  const cur = run.bossAtk && run.bossAtk.cur;
  if (canSee(cur)) return botInput(run, run.x);
  if (run.phase === 'arena' && run.boss) {
    let best = null;
    for (const x of [100, 380]) for (const ay of run.arena.depth) {
      const d = Math.hypot(x - run.boss.x, run.z - ay - run.boss.z);
      if (!best || d > best.d) best = { x, ay, d };
    }
    const o = inp(best.x);
    o.dragDy = best.ay - run.tay;
    return o;
  }
  return inp(run.boss ? run.boss.x : 240);
}
//  공격 시작 이벤트: 광역 경보(bossTele) · 탄 장전(bossCharge)
export const isStart = (e) => e.type === 'bossTele' || e.type === 'bossCharge';

/** 공격 한 번: mode 'move' = 설 곳을 알게 되면 그리로 · 'stay' = 제자리.
 *  설계는 광역 = 경보 순간(bossTele), 탄 = 발사 순간(bossFire — 장전이 끝난 STEP 에 다시 설계한다)에 기록한다(그 순간의 실제 부대 x·z·반폭과 함께).
 *  flightT = 발사 순간 그 공격의 탄들이 부대 띠(설계 축에 수직인 띠)에 처음 들어오기까지 실제 시간 — STEP 마다 규칙 탄을 따라가며 잰다.
 *  장전만 하고 거둔 공격(다시 설계가 안 됨)은 '시작'으로 세지 않는다. 반환 { started, hurt, plan, at: { x, z, hw }, flightT, cancelled?, unfinished? } */
export function playAttack(run, mode, x0) {
  let plan = null, hurt = 0, at = null, flightT = null, opened = false, fireAge = null, slab = null;
  for (let i = 0; i < 60 * 14; i++) {
    stepRun(run, mode === 'move' ? botInput(run, x0) : inp(x0), STEP);
    const cur = run.bossAtk.cur;
    for (const e of drainEvents(run)) {
      if (isStart(e)) opened = true;
      const shotFire = e.type === 'bossFire' && cur && cur.type === 'shot';
      if ((e.type === 'bossTele' || shotFire) && cur) {
        plan = JSON.parse(JSON.stringify(cur));
        at = { x: run.x, z: run.z - (run.ay || 0), hw: halfW(run) };
        if (shotFire) {
          fireAge = 0;
          const F = squadFrame(run);
          const B = { x0: F.x - F.hw - BA.margin / 2, x1: F.x + F.hw + BA.margin / 2, z0: F.zLo - BA.margin / 2, z1: F.zHi + BA.margin / 2 };
          slab = plan.axis === 'z' ? [B.x0, B.x1, 'x'] : [B.z0, B.z1, 'z'];
        }
      }
      if (e.type === 'hurt' && e.cause === 'shot') hurt++;
      if (e.type === 'bossAtkEnd') {
        if (e.cancelled && !plan) return { started: false, cancelled: true };
        return { started: !!plan, hurt, plan, at, flightT };
      }
    }
    //  실제 비행 시간: 발사 뒤 STEP 마다 그 공격의 탄 중 띠(설계 순간의 부대 상자 범위 ± 탄 반지름)에 든 것이 처음 생긴 시각
    if (fireAge != null) {
      if (flightT == null && run.eshots.some((s) => s.atk === plan.serial && !s.dead && (slab[2] === 'x' ? s.x : s.z) >= slab[0] - s.r && (slab[2] === 'x' ? s.x : s.z) <= slab[1] + s.r)) flightT = fireAge;
      fireAge += STEP;
    }
    if (!opened && i > 4) return { started: false };
  }
  return { started: !!plan, hurt, plan, at, flightT, unfinished: true };
}

/** 판마다 보스·고유 공격 목록 */
export function bossKinds(id) {
  const st = buildStage(id, { difficulty: 'brutal' });
  return st.elites.map((e, bi) => ({ bi, kinds: e.atk.seq, skin: e.atk.skin ?? e.skin ?? ATK_DEFAULT_SKIN, role: e.role ?? 'elite', arena: !!st.arena }));
}

/** BOSS-SAFE 규칙(설계 하나 + 설계 순간의 실제 부대):
 *  ① 안전 상자 = 부대 폭 + 48(가로)·부대 깊이 + 48(세로) 이상, 도로·광장 가장자리 안 ② 모든 위험(탄 길 선분·광역 구역)이 상자와 떨어져 있다
 *  ③ 닿는 시간: 광역 = 경보(0.7~0.9초), 탄 = 설계의 reachT ≤ **실제 비행 시간**(탄이 부대 띠에 처음 들어오기까지 — 한 STEP 여유)
 *  ④ 설 곳까지 거리(가로·세로 각각) ≤ 닿는 거리 = moveMax × 닿는 시간 × 0.8(그물 느려짐 중이면 느려진 만큼 줄어든 값 이하) */
export function checkSafe(p, at, flightT, arena, label, slowT = 0) {
  const [s0, s1] = p.safe, [z0, z1] = p.safeZ;
  const [e0, e1] = arena ? [40, 440] : [80, 400];
  assert.ok(at.hw <= p.hw + 1e-9, `${label}: 설계 반폭 ${p.hw} ≥ 실제 ${at.hw}`);
  assert.ok(s1 - s0 >= 2 * p.hw + BA.margin - 1e-9, `${label}: 안전 상자 폭 ${(s1 - s0).toFixed(1)} ≥ 부대 폭 + 48 = ${2 * p.hw + BA.margin}`);
  assert.ok(z1 - z0 >= (p.band[1] - p.band[0]) + BA.margin - 1e-9, `${label}: 안전 상자 깊이 ≥ 부대 깊이 + 48`);
  //  가로로 피하는 설계는 상자가 가장자리 안(설 곳 범위가 그렇게 정해진다). 광장에서 세로로 피하는 설계는 x 가 지금 자리 그대로라
  //   상자 여유(24)와 반폭 상한(64 − 벽 밖 60)만큼(28px) 가장자리 밖으로 걸칠 수 있다(병사는 가장자리 안 — clampCenter 가 누른다)
  const hang = p.axis === 'z' ? BA.margin / 2 + 4 : 0;
  assert.ok(s0 >= e0 - hang - 1e-9 && s1 <= e1 + hang + 1e-9, `${label}: 안전 상자가 가장자리 안 [${s0.toFixed(1)}, ${s1.toFixed(1)}]`);
  const box = { x0: s0, x1: s1, z0, z1 };
  for (const h of planHazards(p)) assert.ok(!shapeHitsBox(h, box), `${label}: 위험(${h.t})이 안전 상자와 떨어져 있다`);
  assert.equal(p.type, atkType(p.kind), `${label}: 종류`);
  if (p.type === 'shot') {
    assert.ok(!('tele' in p) || !p.tele, `${label}: 탄 공격은 경보가 없다`);
    assert.ok(flightT != null && p.reachT <= flightT + STEP + 1e-9, `${label}: 설계 닿는 시간 ${p.reachT.toFixed(3)} ≤ 실제 비행 시간 ${flightT == null ? '없음' : flightT.toFixed(3)}`);
  } else {
    assert.ok(p.tele >= 0.7 && p.tele <= 0.9, `${label}: 경보 ${p.tele}초`);
    assert.equal(p.reachT, p.tele, `${label}: 광역 닿는 시간 = 경보`);
  }
  const s = Math.min(slowT, p.reachT);
  const D = BA.reachK * BAL3.squad.moveMax * (BA.kinds.web.slowMul * s + (p.reachT - s));
  assert.ok(Math.abs(p.reachD - D) < 1e-6, `${label}: 닿는 거리 ${p.reachD.toFixed(2)} = moveMax × 시간 × 0.8(느려짐 반영 ${D.toFixed(2)})`);
  assert.ok(Math.abs(p.goal.x - at.x) <= p.reachD + 1e-9 && Math.abs(p.goal.z - at.z) <= p.reachD + 1e-9, `${label}: 설 곳까지 닿는 거리 안`);
  assert.ok(Math.abs((s0 + s1) / 2 - p.goal.x) < 1e-6, `${label}: 설 곳 = 안전 상자 가운데`);
}

//  r4.9 (다) 광분 상태로 세우기(시뮬레이션용): 광분 칸 + 페이즈를 켜는 판은 광분 단계(2 — 보스가 빨라진다). 체력은 atkRun 이 1e9 로 둔 그대로(광분은 칸으로만)
export const enrage = (run, bo) => { bo.rage = true; if (run.bossPhases !== false) bo.phase = 2; };
/** 판 묶음 하나의 BOSS-DODGE·BOSS-SAFE(+ 위협): 모든 보스·고유 공격 × 병력 1·30·60·100 × 시작 자리 3곳.
 *  ① 봇(설 곳으로)은 그 공격에서 피해 0 · 끝난다 · 설계가 BOSS-SAFE 규칙을 지킨다 ② (판·보스·공격·병력)마다 한 곳 이상에서 공격이 실제로 시작
 *  ③ 위협: (판·보스·공격)마다 병력 30·60·100 × 시작 자리 3곳 중 한 곳 이상에서 제자리 부대가 맞는다.
 *  opts.rage = 광분 상태(r4.9 (다) — 탄 속도 × 1.12 로 설계·비행 시간을 잰다). 반환 시뮬레이션 수 */
//  r4.10(이사님 실플레이 5차 — 보스는 3·6·9·12·15·18·21·24 판에만): 네 파일이 보스 판 8개를 둘씩 나눠 맡는다. 보스가 없는 판을 넘기면
//   조용히 0판으로 통과하지 않게 판마다 보스가 있는지 먼저 본다
export function dodgeGroup(ids, opts = {}) {
  const mod = opts.rage ? enrage : undefined, tag = opts.rage ? ' 광분' : '';
  let sims = 0;
  for (const id of ids) {
    assert.ok(bossKinds(id).length > 0, `S${id}: 게임 줄 보스 판이어야 한다(보스 정의 있음)`);
    for (const b of bossKinds(id)) {
      const xs = b.arena ? [100, 240, 380] : [140, 240, 340];
      for (const kind of b.kinds) {
        let stayHit = 0;
        for (const [ni, n] of NS.entries()) {
          let started = 0;
          for (const [xi, x0] of xs.entries()) {
            const k = (xi + ni) % 3;
            const label = `S${id} 보스${b.bi} ${kind} ${n}명 x${x0} k${k}${tag}`;
            const { run } = atkRun(id, n, b.bi, kind, x0, k, { mod });
            const r = playAttack(run, 'move', x0);
            sims++;
            if (!r.started) continue;
            started++;
            assert.ok(!r.unfinished, label + ': 공격이 끝난다');
            assert.equal(r.hurt, 0, label + ': 설 곳(빈틈 가운데)으로 간 부대는 피해 0');
            checkSafe(r.plan, r.at, r.flightT, b.arena, label);
            if (n >= 30 && !stayHit) {
              const q = playAttack(atkRun(id, n, b.bi, kind, x0, k, { mod }).run, 'stay', x0);
              sims++;
              if (q.hurt > 0) stayHit++;
            }
          }
          assert.ok(started > 0, `S${id} 보스${b.bi} ${kind} ${n}명${tag}: 시작 자리 3곳 중 한 곳 이상에서 공격이 시작된다(설계 가능)`);
        }
        assert.ok(stayHit > 0, `S${id} 보스${b.bi} ${kind}${tag}: 제자리 부대가 한 번도 맞지 않았다(위협 없음)`);
      }
    }
  }
  return sims;
}
