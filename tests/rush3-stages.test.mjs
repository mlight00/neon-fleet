// rush3-stages — 스테이지 3개 고정 배치·무기 정의·수치 동결을 잠근다(계약서 5·3-4장, V3-STAGES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_IDS, buildStage, stageMeta } from '../rush3/stages.js';
import { WEAPONS, weaponRank, makeBullet } from '../rush3/weapons.js';
import { BAL3 } from '../rush3/balance.js';

const ROAD = [80, 400];

// 물체가 부대 줄에 도달하는 z(스폰은 zs 절대값, 정예는 z)
function firstObjectZ(st) {
  const zs = [];
  for (const g of st.gateRows) zs.push(g.z);
  for (const s of st.supplies) zs.push(s.z);
  for (const w of st.walls) zs.push(w.z0);
  for (const sp of st.spawns) zs.push(...sp.zs);
  if (st.elite) zs.push(st.elite.z);
  return Math.min(...zs);
}

test('V3-STAGES: STAGE_IDS 는 1·2·3 이고 stageMeta 가 계약서 표와 일치', () => {
  assert.deepEqual(STAGE_IDS, [1, 2, 3]);
  assert.deepEqual(stageMeta(1), { id: 1, title: '첫 진격', startUnits: 1, startWeapon: 'rifle', length: 7600, eliteZ: 7200 });
  assert.deepEqual(stageMeta(2), { id: 2, title: '갈림길', startUnits: 2, startWeapon: 'rifle', length: 8600, eliteZ: 8200 });
  assert.deepEqual(stageMeta(3), { id: 3, title: '군단', startUnits: 3, startWeapon: 'rifle', length: 11000, eliteZ: 10600 });
  assert.throws(() => buildStage(9));
});

test('V3-STAGES: bypass 아닌 행의 칸 합집합이 [80,400) 완전 피복·반열림·겹침 없음', () => {
  for (const id of STAGE_IDS) {
    const st = buildStage(id);
    assert.ok(st.gateRows.length >= 1, 'S' + id + ' 게이트 행 존재');
    for (const row of st.gateRows) {
      assert.equal(row.h, 24); assert.equal(row.passed, false);
      const cells = [...row.cells].sort((a, b) => a.x0 - b.x0);
      for (const c of cells) {
        assert.ok(c.x0 < c.x1 && c.x0 >= ROAD[0] && c.x1 <= ROAD[1], 'S' + id + ' ' + row.id + ' 칸이 도로 안');
        assert.ok(Number.isInteger(c.value) && Number.isInteger(c.maxValue) && c.flashT === 0);
        assert.ok(Math.abs(c.value) <= c.maxValue);
      }
      for (let i = 1; i < cells.length; i++) assert.ok(cells[i].x0 >= cells[i - 1].x1, '겹침 없음');
      if (row.bypass) { assert.equal(cells.length, 1); continue; }
      assert.equal(cells[0].x0, ROAD[0]);
      assert.equal(cells[cells.length - 1].x1, ROAD[1]);
      for (let i = 1; i < cells.length; i++) assert.equal(cells[i].x0, cells[i - 1].x1, '빈틈 없음(반열림 경계 공유)');
    }
  }
});

test('V3-STAGES: 스폰 ev.z 는 표 z(발동 지점), zs 는 ev.z+760 이상의 절대 z, xs 는 도로 안·벽 안 금지', () => {
  // 표 z 그대로 ev.z 에 들어간다(3-7 발동 = ev.z <= run.z, 0장 시드 = id:ev.z:i)
  const tableZ = { 1: [3800, 5300], 2: [3600, 3600, 4600, 7000], 3: [5200, 6300, 8000, 8800, 8800] };
  for (const id of STAGE_IDS) {
    const st = buildStage(id);
    assert.deepEqual(st.spawns.map(s => s.z), tableZ[id], 'S' + id + ' ev.z = 표 z');
    for (const sp of st.spawns) {
      const r = BAL3.enemies[sp.kind].r;
      assert.equal(sp.xs.length, sp.n); assert.equal(sp.zs.length, sp.n);
      for (let i = 0; i < sp.n; i++) {
        const x = sp.xs[i], z = sp.zs[i];
        assert.ok(x - r >= ROAD[0] && x + r <= ROAD[1], 'S' + id + ' ' + sp.kind + ' x 도로 안');
        // 발동 순간(run.z = ev.z) 화면 밖 위(진입 거리 760)에서 등장. 정예 스폰 run.z + 760 과 같은 규칙
        assert.ok(z >= sp.z + BAL3.enterZ && z < sp.z + BAL3.enterZ + 200, '스폰 z 는 발동 지점 + 진입 거리 근처: ' + z);
        for (const w of st.walls) {
          if (z < w.z0 || z > w.z1) continue;
          assert.ok(x + r <= w.x0 || x - r >= w.x1, 'S' + id + ' ' + sp.kind + ' 벽 안 금지 x=' + x);
        }
      }
    }
    for (const w of st.walls) { assert.equal(w.x0, 228); assert.equal(w.x1, 252); assert.ok(w.z0 < w.z1); }
  }
  // 표에 명시된 좌표는 그대로(xs 절대, zs +오프셋 = ev.z + 760 + 오프셋)
  const s2 = buildStage(2);
  const s2r = s2.spawns.find(s => s.kind === 'rusher'), s2s = s2.spawns.find(s => s.kind === 'shooter');
  assert.deepEqual([s2r.z, s2r.xs], [3600, [110, 215, 265, 370]]);
  assert.deepEqual([s2s.z, s2s.xs, s2s.zs], [4600, [150, 240, 330], [5360, 5360, 5360]]);
  const s1g = buildStage(1).spawns.find(s => s.kind === 'grunt');
  assert.equal(s1g.z, 3800);
  assert.deepEqual(s1g.xs, [120, 200, 280, 360]);
  assert.deepEqual(s1g.zs, [4560, 4600, 4640, 4680]);
  // 지터 좌표도 빌드마다 같다(시드 = id:ev.z:i, 저장된 ev.z 기준)
  const a = buildStage(3), b = buildStage(3);
  assert.deepEqual([a.spawns.map(s => s.xs), a.spawns.map(s => s.zs)], [b.spawns.map(s => s.xs), b.spawns.map(s => s.zs)]);
});

test('V3-STAGES: 첫 물체 z ≥ 1100, 정예 z < length, 시작 무기 rifle', () => {
  for (const id of STAGE_IDS) {
    const st = buildStage(id);
    assert.ok(firstObjectZ(st) >= 1100, 'S' + id + ' 첫 물체 ' + firstObjectZ(st));
    assert.ok(st.elite && st.elite.z < st.length && st.elite.z === st.eliteZ);
    assert.ok(st.elite.hp > 0);
    assert.equal(st.startWeapon, 'rifle');
    assert.equal(st.version, 1);
  }
  assert.equal(buildStage(1).elite.summon, false);
  assert.equal(buildStage(3).elite.summon, true);
  assert.deepEqual([1, 2, 3].map(id => buildStage(id).elite.hp), [120, 220, 500]);
});

test('V3-STAGES: 보급 통은 3-3 필드 전부 초기값·chain 은 S3 하나', () => {
  for (const id of STAGE_IDS) {
    for (const s of buildStage(id).supplies) {
      assert.equal(s.r, 30);
      assert.equal(s.durability, s.maxDurability);
      assert.ok(s.durability > 0);
      assert.deepEqual([s.opened, s.missed, s.locked], [false, false, false]);
      assert.deepEqual(s.pads, []);
      if (s.kind === 'soldier') assert.ok(s.payload.n > 0);
      else if (s.kind === 'weapon') assert.ok(weaponRank(s.payload.weapon) > 0);
      else { assert.equal(s.kind, 'chain'); assert.ok(s.payload.pads0 <= s.payload.maxPads); }
    }
  }
  const chain = buildStage(3).supplies.filter(s => s.kind === 'chain');
  assert.equal(chain.length, 1);
  assert.deepEqual(chain[0].payload, { pads0: 5, maxPads: 15 });
  assert.equal(chain[0].z, 2800);
});

test('V3-STAGES: buildStage 두 번은 deepEqual 이고 참조는 다르다(구조 공유 없음)', () => {
  for (const id of STAGE_IDS) {
    const a = buildStage(id), b = buildStage(id);
    assert.deepEqual(a, b);
    assert.equal(a === b, false);
    assert.equal(a.gateRows === b.gateRows, false);
    assert.equal(a.gateRows[0] === b.gateRows[0], false);
    assert.equal(a.gateRows[0].cells[0] === b.gateRows[0].cells[0], false);
    assert.equal(a.supplies[0] === b.supplies[0], false);
    assert.equal(a.supplies[0].payload === b.supplies[0].payload, false);
    assert.equal(a.spawns[0] === b.spawns[0], false);
    assert.equal(a.spawns[0].xs === b.spawns[0].xs, false);
    assert.equal(a.elite === b.elite, false);
    if (a.walls.length) assert.equal(a.walls[0] === b.walls[0], false);
    // 한 판에서 값을 바꿔도 다음 빌드에 남지 않는다
    a.gateRows[0].cells[0].value = 99; a.gateRows[0].passed = true; a.supplies[0].durability = 0; a.supplies[0].opened = true;
    const c = buildStage(id);
    assert.deepEqual(c, b);
  }
});

test('V3-STAGES: 무기 rank 순서 rifle<auto<heavy, makeBullet gateHit 1', () => {
  assert.ok(weaponRank('rifle') < weaponRank('auto') && weaponRank('auto') < weaponRank('heavy'));
  assert.equal(weaponRank('nope'), 0);
  assert.deepEqual([WEAPONS.rifle.interval, WEAPONS.auto.interval, WEAPONS.heavy.interval], [0.5, 0.25, 0.6]);
  assert.deepEqual([WEAPONS.rifle.dmg, WEAPONS.auto.dmg, WEAPONS.heavy.dmg], [1, 1, 3]);
  const b = makeBullet('heavy', 123, 456, 7);
  assert.deepEqual(b, { x: 123, z: 456, pz: 456, vz: 650, dmg: 3, w: 8, kind: 'heavy', gateHit: 1, ownerId: 7, dead: false });
  for (const id of ['rifle', 'auto', 'heavy']) assert.equal(makeBullet(id, 0, 0, 1).gateHit, 1);
  assert.equal(makeBullet('rifle', 0, 0, 1) === makeBullet('rifle', 0, 0, 1), false);
});

test('V3-STAGES: BAL3 는 깊게 동결되어 있고 핵심 수치가 계약서와 같다', () => {
  assert.ok(Object.isFrozen(BAL3) && Object.isFrozen(BAL3.enemies.elite.shot) && Object.isFrozen(BAL3.colors.bg[0]));
  assert.throws(() => { 'use strict'; BAL3.scroll = 1; });
  assert.equal(BAL3.scroll, 190); assert.equal(BAL3.view.LINE_Y, 640); assert.equal(BAL3.STEP, 1 / 60);
  assert.deepEqual([BAL3.squad.unitR, BAL3.squad.unitHp, BAL3.squad.unitCap, BAL3.squad.followRate, BAL3.squad.moveMax, BAL3.squad.keySpeed],
    [9, 2, 150, 9, 250, 420]);
  assert.deepEqual([BAL3.enemies.grunt.hp, BAL3.enemies.rusher.hp, BAL3.enemies.shooter.hp], [2, 4, 6]);
  // 난이도 튜닝(2026-09-10): 잡졸 추종 90→35(무조작이어도 사선에 들어와 죽지 않게), hp 는 2 유지(heavy 폭발 2 로 잡졸 격파 규칙 보존)
  assert.equal(BAL3.enemies.grunt.track, 35);
  assert.deepEqual([BAL3.enemies.elite.holdAhead, BAL3.enemies.elite.patrolSpeed, BAL3.enemies.elite.summonEvery], [420, 60, 4]);
  assert.deepEqual([BAL3.supply.padGap, BAL3.supply.padOffset, BAL3.supply.padHalfW, BAL3.gate.h, BAL3.enterZ], [40, 60, 70, 24, 760]);
});
