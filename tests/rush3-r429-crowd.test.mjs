// rush3-r429-crowd — r4.29 무리 체력 바닥 · 웨이브 적 수 V3-R429 CROWD.
//  이사님 지시(2026-09-30) "현재 9스테이지까지 깼는데 난이도가 아직도 너무너무너무 쉬워" · "실제 웨이브로 느껴지도록 적 숫자를 더 늘려줘".
//  게임 줄(brutal)에서만: 무리마다 위협 비율 f = 무리 체력 합 ÷ (그 z 까지의 상한 무리 화력 × 접근 시간) 를 BAL3.crowd 바닥까지 올린다(내리지 않는다) ·
//   웨이브 겹 적 수 × waveCountMul · 웨이브 체력 합은 max(목표, 종전 체력 합) · 배수 1 줄 · 보스 · 현상금 적은 그대로.
//  ⚠️이 검사는 '계산대로 들어갔는가'만 잠근다. 어려움이 알맞은지는 이사님 실플레이로 정한다(봇으로 판단하지 않는다 — 2026-09-26 지시)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS, stageKindOf } from '../rush3/stages.js';
import { STAGE_END } from '../rush3/courses.js';
import { crowdFloor, crowdFFor, crowdDpsAt, approachSec, routeChoices } from '../rush3/firepower.js';
import { scheduledEnemyCount, stageValue, createTally } from '../rush3/coins.js';
import { crowdRow } from './lib/rush3-crowd.mjs';

const C = BAL3.crowd;
const B = (id) => buildStage(id, { difficulty: 'brutal' });
const ROAD = { x0: 80, x1: 400 };

test('CROWD-1 표: BAL3.crowd = 일반 f 0.6 → 판마다 +0.08 → 1.0(6번부터) · 웨이브 f 1.0 → +0.067 → 1.6(10번부터) · 웨이브 적 수 × 3 · 한 줄 10 · 게임 줄만 켜짐', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(C)), { regular: { f1: 0.6, step: 0.08, max: 1.0 }, wave: { f1: 1.0, step: 0.067, max: 1.6 }, waveCountMul: 3, waveRowN: 10 });
  assert.ok(Object.isFrozen(C) && Object.isFrozen(C.regular) && Object.isFrozen(C.wave), '표는 얼려 둔다');
  assert.equal(BAL3.difficulty.brutal.crowdFloor, true, '게임 줄(brutal)만');
  assert.ok(!BAL3.difficulty.normal.crowdFloor, '검사용 배수 1 줄은 칸이 없다');
  const reg = ALL_STAGE_IDS.map((id) => crowdFFor(id, C.regular)), wav = ALL_STAGE_IDS.map((id) => crowdFFor(id, C.wave));
  assert.deepEqual([reg[0], wav[0]], [0.6, 1.0], '1번 = 출발값');
  for (let i = 1; i < reg.length; i++) assert.ok(reg[i] >= reg[i - 1] && wav[i] >= wav[i - 1], `S${i + 1} f 바닥은 내려가지 않는다`);
  assert.ok(reg[4] < 1.0 && reg.slice(5).every((f) => f === 1.0), '일반 무리는 6번부터 상한 1.0');
  assert.ok(wav[8] < 1.6 && wav.slice(9).every((f) => f === 1.6), '웨이브는 10번부터 상한 1.6');
  //  판 번호가 아닌 판(시제품 등)은 1번 값
  assert.deepEqual([crowdFFor('proto3', C.regular), crowdFFor(undefined, C.wave)], [0.6, 1.0]);
});

test('CROWD-2 일반 무리: 게임 줄 1~24 모든 일반 무리 — f ≥ 바닥(n × 체력 ≥ f × 상한 무리 화력 × 접근 시간) · 이미 넘는 무리는 그대로 · 모자란 무리는 딱 바닥까지(올림) · 내리지 않는다', () => {
  let raised = 0, kept = 0;
  for (const id of ALL_STAGE_IDS) {
    const st = B(id);
    const routes = routeChoices(st);
    const f = crowdFFor(id, C.regular);
    assert.equal(st.crowdFloor.fRegular, f, `S${id} fRegular`);
    for (const sp of st.spawns) {
      if (sp.kind === 'bounty' || sp.horde) continue;
      const r = crowdRow(st, sp);
      assert.ok(r, `S${id} z${sp.z} ${sp.kind} 내역`);
      const need = f * crowdDpsAt(st, sp.z, routes) * approachSec(sp.kind);
      assert.ok(sp.hp >= r.before, `S${id} z${sp.z} ${sp.kind}: 내리지 않는다 ${r.before} → ${sp.hp}`);
      assert.ok(sp.n * sp.hp >= need - 1e-9, `S${id} z${sp.z} ${sp.kind}: f ≥ 바닥 (${sp.n} × ${sp.hp} ≥ ${need.toFixed(1)})`);
      if (sp.n * r.before >= need) { assert.equal(sp.hp, r.before, `S${id} z${sp.z} ${sp.kind}: 이미 넘는 무리는 그대로`); kept++; }
      else { assert.equal(sp.hp, Math.ceil(need / sp.n), `S${id} z${sp.z} ${sp.kind}: 딱 바닥까지`); raised++; }
    }
  }
  assert.ok(raised > 0 && kept > 0, `올린 무리 ${raised} · 그대로 둔 무리 ${kept}`);
});

test('CROWD-3 웨이브: 게임 줄 웨이브 판(1·4·7·…·22) — 겹마다 적 수 = round(정의 n × 3 × spawnCount) · 줄 수 = max(정의 줄, 올림(적 수 ÷ 10)) · 체력 = max(1, 올림(max(목표, 종전 체력 합) ÷ 적 수)) · 종전보다 약해지지 않는다 · 모두 도로 안', () => {
  const sc = BAL3.difficulty.brutal.spawnCount;
  let n = 0;
  for (const id of ALL_STAGE_IDS) {
    if (stageKindOf(id, 'brutal') !== 'horde') continue;
    n++;
    const st = B(id);
    const parts = STAGE_END[id].parts;
    const hs = st.spawns.filter((sp) => sp.horde);
    assert.equal(hs.length, parts.length, `S${id} 겹 수`);
    const routes = routeChoices(st);
    const fw = crowdFFor(id, C.wave);
    assert.equal(st.crowdFloor.fWave, fw, `S${id} fWave`);
    let fSum = 0;
    for (const p of parts) {
      const sp = hs.find((h) => h.z === st.hordeZ + p.z && h.kind === p.kind);
      assert.ok(sp, `S${id} 겹 z+${p.z} ${p.kind}`);
      const baseN = Math.max(1, Math.round(p.n * sc));
      assert.equal(sp.n, Math.max(1, Math.round(p.n * C.waveCountMul * sc)), `S${id} 겹 z+${p.z}: 적 수 × 3`);
      assert.equal(sp.waveBaseN, baseN, `S${id} 겹 z+${p.z}: 배수 전 적 수`);
      assert.deepEqual([sp.xs.length, sp.zs.length], [sp.n, sp.n]);
      const rowsWant = Math.max(p.rows ?? 1, Math.ceil(sp.n / C.waveRowN));
      const rowIdx = new Set(sp.zs.map((z) => Math.floor((z - sp.z - BAL3.enterZ) / 40)));
      assert.equal(rowIdx.size, rowsWant, `S${id} 겹 z+${p.z}: 줄 수 ${rowsWant}`);
      const r = BAL3.enemies[sp.kind].r;
      assert.ok(sp.xs.every((x) => x >= ROAD.x0 + r - 0.01 && x <= ROAD.x1 - r + 0.01), `S${id} 겹 z+${p.z}: 도로 안`);
      const row = crowdRow(st, sp);
      const dps = crowdDpsAt(st, sp.z, routes), W = approachSec(sp.kind);
      const need = (fw / parts.length) * dps * W, old = baseN * row.before;
      assert.equal(sp.hp, Math.max(1, Math.ceil(Math.max(need, old) / sp.n)), `S${id} 겹 z+${p.z}: 체력`);
      assert.ok(sp.n * sp.hp >= old, `S${id} 겹 z+${p.z}: 웨이브 힘(적 수 × 체력)이 종전(${baseN} × ${row.before})보다 약해지지 않는다`);
      fSum += (sp.n * sp.hp) / (dps * W);
    }
    assert.ok(fSum >= fw - 1e-9, `S${id} 웨이브 f 합 ${fSum.toFixed(2)} ≥ ${fw}`);
  }
  assert.equal(n, 8, '웨이브 판 8개');
});

test('CROWD-4 그대로인 것: 배수 1 줄(검사용)은 내역·배수 칸이 없고 적 수도 그대로 · 보스·강적·현상금 적 체력은 이 계산 밖 · 판 끝 자리·판 길이 그대로', () => {
  for (const id of ALL_STAGE_IDS) {
    const nb = buildStage(id), br = B(id);
    assert.ok(!('crowdFloor' in nb), `S${id} 배수 1 줄에 내역 없음`);
    assert.ok(nb.spawns.every((sp) => !('waveBaseN' in sp)), `S${id} 배수 1 줄에 배수 칸 없음`);
    //  현상금 적은 내역에 없다(체력은 bountyFloor — V3-R47 BOUNTY 가 잠근다)
    for (const sp of br.spawns.filter((s) => s.kind === 'bounty')) assert.equal(crowdRow(br, sp), undefined, `S${id} 현상금 적은 계산 밖`);
    //  내역 행 수 = 현상금 적을 뺀 스폰 수
    assert.equal(br.crowdFloor.rows.length, br.spawns.filter((s) => s.kind !== 'bounty').length, `S${id} 내역 행 수`);
  }
});

test('CROWD-5 코인: 웨이브 적이 3배가 돼도 판의 적 몫 합계는 V(s) 그대로 — 한 마리 몫 = V ÷ 일정 스폰 총수(coins.perEnemy)', () => {
  for (const id of [1, 4, 10, 22]) {
    const st = B(id);
    const t = createTally(st);
    const total = scheduledEnemyCount(st);
    assert.ok(total > scheduledEnemyCount(buildStage(id)), `S${id} 게임 줄 적 수가 더 많다`);
    assert.ok(Math.abs(t.perEnemy * total - stageValue(id)) < 1e-9, `S${id} 적 몫 합계 = V(${id})`);
  }
});

test('CROWD-6 결정성·캐시: 같은 판을 여러 번 만들어도 체력·내역이 같다 · crowdFloor 캐시 사본을 고쳐도 다음 호출은 그대로', () => {
  for (const id of [1, 9, 10, 24]) {
    assert.deepEqual(B(id), B(id), `S${id} buildStage 결정적`);
    const st = B(id);
    const a = crowdFloor(st);
    a.hp[0] = -1; a.rows[0].hp = -1;
    const b = crowdFloor(st);
    assert.notEqual(b.hp[0], -1); assert.notEqual(b.rows[0].hp, -1);
  }
});
