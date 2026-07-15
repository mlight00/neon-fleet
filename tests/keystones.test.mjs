import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYSTONES, KEYSTONE_BY_ID, keystoneEffects, freshKeystoneState, forgeOnKill } from '../js/keystones.js';
import { Squad } from '../js/entities.js';
import { BAL } from '../js/balance.js';

const noop = () => {};
function makeWorld(squad) {
  return {
    squad, logicalW: 480, logicalH: 776, bullets: [], enemyBullets: [], entities: [], bosses: [], mfx: {},
    spawnEntity(e) { this.entities.push(e); },
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop },
  };
}
function sq() { const s = new Squad(480, 776, 100); s.x = 240; s.y = 640; return s; }

// ── 8.4 키스톤 ─────────────────────────────────────────────
test('키스톤 정의는 정확히 3종이고 id가 유일하다', () => {
  assert.equal(KEYSTONES.length, 3);
  assert.equal(new Set(KEYSTONES.map((k) => k.id)).size, 3);
  for (const k of KEYSTONES) { assert.ok(k.change && k.pro && k.con, `${k.id} 카드 필드`); }
});

test('새 원정(new Squad)에서 keystone은 null이다', () => {
  assert.equal(sq().keystone, null);
});

test('키스톤 미선택 상태는 모든 전투 배수가 중립(1)', () => {
  const e = keystoneEffects(null, {});
  assert.deepEqual(e, { flagMult: 1, supportMult: 1, autoMult: 1 });
});

test('군체 용광로는 정확히 killsPerProc에서 발동(procced)', () => {
  const S = BAL.keystone.swarmForge;
  let st = freshKeystoneState();
  for (let i = 0; i < S.killsPerProc - 1; i++) { const r = forgeOnKill(st, S); st = { ...st, ...r }; assert.equal(r.procced, false); }
  const rp = forgeOnKill(st, S);
  assert.equal(rp.procced, true);
  assert.equal(rp.forgeT, S.ghostDuration);
});

test('비적대 보상 개체 파괴는 킬로 세지 않는다', () => {
  const s = sq(); s.keystone = 'swarm_forge'; s.keystoneState = freshKeystoneState();
  const w = makeWorld(s);
  for (let i = 0; i < 12; i++) s.onEnemyKill(w, { isEnemy: false, reward: 10 });   // 크리스탈류
  assert.equal(s.keystoneState.kills, 0);
  assert.equal(s.keystoneState.forgeT, 0);
});

test('군체 용광로 활성 시간은 최대 16초(재적립 상한)', () => {
  const S = BAL.keystone.swarmForge;
  let st = { kills: 0, forgeT: 12, grazeCount: 0, pendingEchoes: [] };
  // 이미 12초 활성 중 10킬 → +8 = 20이지만 16 상한
  for (let i = 0; i < 10; i++) { const r = forgeOnKill(st, S); st = { ...st, ...r }; }
  assert.equal(st.forgeT, S.ghostDurationMax);
});

test('군체 용광로 활성 중 supportMult 보너스, 대가 flagMult 페널티 (balance 반영)', () => {
  const S = BAL.keystone.swarmForge;
  const active = keystoneEffects('swarm_forge', { forgeT: 3 });
  assert.ok(Math.abs(active.supportMult - (1 + S.supportBonus)) < 1e-9);
  assert.ok(Math.abs(active.flagMult - (1 - S.flagPenalty)) < 1e-9);
  const idle = keystoneEffects('swarm_forge', { forgeT: 0 });
  assert.equal(idle.supportMult, 1);           // 유령 비활성 → 보너스 없음
});

test('공명 랜스는 1·2단에서 발동하지 않는다', () => {
  const s = sq(); s.keystone = 'lance_echo'; s.keystoneState = freshKeystoneState();
  const w = makeWorld(s);
  s.scheduleLanceEcho(w, { x: 240, halfW: 40, dmg: 100, pierceDefense: false, stage: 1 });
  s.scheduleLanceEcho(w, { x: 240, halfW: 40, dmg: 100, pierceDefense: false, stage: 2 });
  assert.equal(s.keystoneState.pendingEchoes.length, 0);
});

test('공명 랜스는 3단+ 원본 1회당 메아리 1회, 최대 3개 예약', () => {
  const s = sq(); s.keystone = 'lance_echo'; s.keystoneState = freshKeystoneState();
  const w = makeWorld(s);
  for (let i = 0; i < 5; i++) s.scheduleLanceEcho(w, { x: 240, halfW: 40, dmg: 100, pierceDefense: false, stage: 3 });
  assert.equal(s.keystoneState.pendingEchoes.length, BAL.keystone.lanceEcho.maxPending);  // 3 상한
});

test('메아리 피해 45%·폭 65%, 재귀 없음(메아리가 메아리 못 만듦)', () => {
  const s = sq(); s.keystone = 'lance_echo'; s.keystoneState = freshKeystoneState();
  const w = makeWorld(s);
  let hitDmg = 0;
  const inCol = { x: 240, y: 300, r: 5, dead: false, hitByBullet(d) { hitDmg = d; } };  // 폭 26 안(240±)
  const outCol = { x: 240 + 30, y: 300, r: 2, dead: false, hitByBullet() { throw new Error('폭 밖 적중'); } }; // 26 밖
  w.entities.push(inCol, outCol);
  s.scheduleLanceEcho(w, { x: 240, halfW: 40, dmg: 100, pierceDefense: false, stage: 3 });
  s._updateEchoes(0.4, w);   // delay 0.35 경과 → 발사
  assert.ok(Math.abs(hitDmg - 45) < 1e-9, `메아리 피해 ${hitDmg}, 기대 45`);
  assert.equal(s.keystoneState.pendingEchoes.length, 0);  // 발사 후 비었고, 재예약 없음(재귀 금지)
});

test('위상 잔상은 killsPerProc번째 처치마다 발동하고 반경 내 거리순 최대 8발만 제거', () => {
  const s = sq(); s.keystone = 'phase_afterimage'; s.keystoneState = freshKeystoneState();
  const w = makeWorld(s);
  // 반경 70 안에 12발(거리 다양) + 밖에 2발
  for (let i = 0; i < 12; i++) w.enemyBullets.push({ x: s.x + (i - 6) * 4, y: s.y - 10 - i, r: 6, dead: false });
  for (let i = 0; i < 2; i++) w.enemyBullets.push({ x: s.x + 200, y: s.y, r: 6, dead: false });
  const N = BAL.keystone.phaseAfterimage.killsPerProc;
  for (let i = 0; i < N - 1; i++) s.onEnemyKill(w, { isEnemy: true });   // N-1회 → 발동 안 함
  assert.equal(w.enemyBullets.filter((b) => b.dead).length, 0);
  s.onEnemyKill(w, { isEnemy: true });                                   // N회 → 파동
  const cleared = w.enemyBullets.filter((b) => b.dead).length;
  assert.equal(cleared, BAL.keystone.phaseAfterimage.maxClear);   // 정확히 8발
  // 반경 밖 2발은 살아있음
  assert.equal(w.enemyBullets.filter((b) => b.x === s.x + 200 && !b.dead).length, 2);
});

test('위상 잔상이 제거한 탄은 dead 처리된다', () => {
  const s = sq(); s.keystone = 'phase_afterimage'; s.keystoneState = freshKeystoneState();
  const w = makeWorld(s);
  for (let i = 0; i < 5; i++) w.enemyBullets.push({ x: s.x + i, y: s.y - 10, r: 6, dead: false });
  const N = BAL.keystone.phaseAfterimage.killsPerProc;
  for (let i = 0; i < N; i++) s.onEnemyKill(w, { isEnemy: true });   // N회 → 파동
  assert.ok(w.enemyBullets.every((b) => b.dead), '반경 내 5발 모두 제거(dead)');
});
