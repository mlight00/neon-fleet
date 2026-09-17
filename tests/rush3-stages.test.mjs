// rush3-stages — 스테이지 3개 고정 배치·무기 정의·수치 동결을 잠근다(계약서 5·3-4장, V3-STAGES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_IDS, buildStage, stageMeta, stageVersion, coverZFor, VZ_MIN, MAX_DY, lotteryPick } from '../rush3/stages.js';
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
        //  maxValue = '쏴서 올릴 수 있는 천장'이다(시작값의 절대치 상한이 아니다).
        //   랜덤 길 −15 칸은 상한 0 = 무효화까지만 가능 — 그래서 |value| <= maxValue 가 아니라 아래 둘이 참이어야 한다.
        assert.ok(c.value <= c.maxValue, 'S' + id + ' ' + row.id + ' 칸 값이 상한을 넘었다');
        assert.ok(c.maxValue >= 0, 'S' + id + ' ' + row.id + ' 상한은 0 이상(최소 무효화까지)');
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
    //  코스 버전은 DEFS 의 값을 그대로 물고 온다(1 로 못 박지 않는다 — 배치 개정 담당이 올린다)
    assert.equal(st.version, stageVersion(id));
    assert.ok(Number.isInteger(st.version) && st.version >= 1, 'S' + id + ' version=' + st.version);
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
  // 개정 r3(2026-09-11): 잡졸 추종 35→0(스폰 열 직진). 비켜야 하는 위협은 돌격체, 사선 다툼은 저격수가 맡는다. hp 는 2 유지
  assert.equal(BAL3.enemies.grunt.track, 0);
  // 게이트 셔터 기본값(개정 r3 1장)
  assert.equal(BAL3.gate.armZ, 340);
  assert.deepEqual([BAL3.enemies.elite.holdAhead, BAL3.enemies.elite.patrolSpeed, BAL3.enemies.elite.summonEvery], [420, 60, 4]);
  assert.deepEqual([BAL3.supply.padGap, BAL3.supply.padOffset, BAL3.supply.padHalfW, BAL3.gate.h, BAL3.enterZ], [40, 60, 70, 24, 760]);
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-STAGES 갱신(개정 r3 §10 STG-1~9): 코스 버전 2 · armZ · 좌우 분산 · 배제 쌍 형식 · 표지 · 회피 통로 · 벽 사이 이동
// ─────────────────────────────────────────────────────────────────────────────

//  벽 활성(통로 확정) 선행 여유 — squad.clampCenter 와 같은 값
const LEAD = BAL3.squad.wallLead;
//  같은 z 에서 스폰한 적끼리 묶는다(2열 무리는 열마다 따로 본다)
function byRow(sp) {
  const rows = new Map();
  for (let i = 0; i < sp.n; i++) {
    const k = String(sp.zs[i]);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(sp.xs[i]);
  }
  return [...rows.values()].map((xs) => xs.slice().sort((a, b) => a - b));
}

test('V3-STAGES STG-1: 세 스테이지 코스 버전 = 2(배치 개정 r3)', () => {
  for (const id of STAGE_IDS) {
    assert.equal(stageVersion(id), 2, 'S' + id);
    assert.equal(buildStage(id).version, 2);
  }
});

test('V3-STAGES STG-2: 모든 게이트 행에 armZ 필드가 있고 number | null, armed 초기값이 그에 맞는다', () => {
  for (const id of STAGE_IDS) for (const row of buildStage(id).gateRows) {
    assert.ok(row.armZ === null || (typeof row.armZ === 'number' && row.armZ > 0), 'S' + id + ' ' + row.id + ' armZ=' + row.armZ);
    assert.equal(row.armed, row.armZ === null, 'S' + id + ' ' + row.id + ' armed 초기값');
    assert.ok('hint' in row);
  }
});

test('V3-STAGES STG-3: 좌우 분산 — 스테이지마다 통·게이트 칸이 좌(<240)·우(>=240) 양쪽에 모두 있다', () => {
  for (const id of STAGE_IDS) {
    const st = buildStage(id);
    const xs = st.supplies.map((s) => s.x);
    for (const row of st.gateRows) for (const c of row.cells) xs.push((c.x0 + c.x1) / 2);
    assert.ok(xs.some((x) => x < 240), 'S' + id + ' 좌측 대상 없음');
    assert.ok(xs.some((x) => x >= 240), 'S' + id + ' 우측 대상 없음');
  }
});

//  랜덤 길(3-9) 통이 나오는 시드. 기본 시드의 랜덤 길은 **게이트**라 buildStage(3) 만 보면 랜덤 길 통을 한 번도 검사하지 못한다.
//   정수 시드를 앞에서부터 훑어 풀의 통 종류마다 첫 시드를 고른다(결정적이고 파일 밖 의존이 없다).
function lotterySupplySeeds() {
  const want = new Set(BAL3.lottery.pool.filter((p) => p.kind !== 'gate').map((p) => p.id));
  const out = new Map();
  for (let seed = 1; seed <= 20000 && out.size < want.size; seed++) {
    const { entry } = lotteryPick(seed);
    if (want.has(entry.id) && !out.has(entry.id)) out.set(entry.id, seed);
  }
  assert.equal(out.size, want.size, '랜덤 길 통 시드를 못 찾았다: ' + JSON.stringify([...out.keys()]));
  return [...out];
}

test('V3-STAGES STG-4: 배제 쌍의 형식(같은 pairId 2개·좌우 1개씩) + 차폐를 가진 모든 통(c9·랜덤 길 통 포함)의 벽·coverZ 공식·여유·통로 배타', () => {
  const vzMin = Math.min(...Object.values(WEAPONS).map((w) => w.vz));
  //  ⚠ 옛 ③④는 'pairId 있는 통만' 돌아 S3 좌 통 c9(z6300, coverZ 6094)와 랜덤 길 통이 빠져 있었다
  //   (c9 를 옛 값 6046 으로 되돌려도 검사 전건이 통과했다 — 2026-09-17 변이 검사). 이제 coverZ 가 있으면 전부 본다.
  const stages = STAGE_IDS.map((id) => ({ id, st: buildStage(id), tag: 'S' + id }));
  for (const [pick, seed] of lotterySupplySeeds()) stages.push({ id: 3, st: buildStage(3, { lotterySeed: seed }), tag: 'S3(랜덤 길=' + pick + ')' });

  for (const { id, st, tag } of stages) {
    //  ①② 배제 쌍의 형식 — 같은 pairId 가 정확히 2개, 좌·우 1개씩. ③ 쌍은 차폐 + 벽을 함께 갖는다
    const pairs = {};
    for (const s of st.supplies) if (s.pairId) (pairs[s.pairId] ??= []).push(s);
    for (const [pid, list] of Object.entries(pairs)) {
      assert.equal(list.length, 2, tag + ' ' + pid + ' 은 정확히 2개');                          // ①
      assert.equal(list.filter((s) => s.x < 240).length, 1, tag + ' ' + pid + ' 좌 1개');         // ②
      assert.equal(list.filter((s) => s.x >= 240).length, 1, tag + ' ' + pid + ' 우 1개');
      for (const s of list) {
        assert.ok(s.coverZ != null, tag + ' ' + s.id + ' 배제 쌍에 coverZ 가 없다');              // ③
        assert.ok(st.walls.some((w) => w.z0 - LEAD <= s.z && s.z <= w.z1), tag + ' ' + s.id + ' 이 벽 활성 구간 안에 있어야 한다');
      }
    }
    //  ④~⑦ 차폐(coverZ)를 가진 **모든** 통 — pairId 가 없어도(c9·랜덤 길 통) 같은 공식·여유·통로 배타를 지킨다
    let covered = 0;
    for (const s of st.supplies) {
      if (s.coverZ == null) continue;
      const wall = st.walls.find((w) => w.z0 - LEAD <= s.z && s.z <= w.z1);
      if (!wall) {
        //  예외 1건 — 선택 C 의 z3900 통(S3 c8)은 벽이 아니라 **게이트(z4000)와 사격창을 나눠 쓰는 '저울'** 이다.
        //   차폐선 = 그 게이트의 셔터 개시선(4000 − BAL3.gate.armZ = 3660). 다른 통이 벽 밖에서 coverZ 를 갖는 것은 허용하지 않는다.
        assert.equal(id, 3, tag + ' ' + s.id + ': 벽 밖 coverZ 는 S3 에만 있다');
        assert.equal(s.id, 'c8', tag + ' ' + s.id + ': 벽 밖 coverZ 예외는 S3 c8(저울) 하나뿐이다');
        assert.equal(s.coverZ, 4000 - BAL3.gate.armZ, tag + ' c8 의 차폐선은 게이트 z4000 셔터 개시선');
        covered++;
        continue;
      }
      //  ④ 비행시간 보정선: 확정선이 아니라 ①1 STEP 지연(확정 판정이 직전 STEP z 로 이뤄진다) + ②대형 깊이(탄 출발 z = run.z - dy)까지 얹은 값
      const commitZ = wall.z0 - LEAD + BAL3.scroll * BAL3.STEP;
      assert.equal(s.coverZ, Math.ceil(commitZ + (s.z + MAX_DY - commitZ) * BAL3.scroll / vzMin),
        tag + ' ' + s.id + ' coverZ 는 비행시간 보정선(확정선 ' + (wall.z0 - LEAD) + ' 이 아니다)');
      assert.equal(s.coverZ, coverZFor(wall.z0, s.z), tag + ' ' + s.id + ' coverZ 는 stages.coverZFor 과 같다');
      assert.ok(s.z <= wall.z1 - 4, tag + ' ' + s.id + ' 은 벽 끝보다 최소 1 STEP 앞');            // ⑤
      assert.ok(s.coverZ < s.z, tag + ' ' + s.id + ' coverZ 는 통보다 앞');                        // ⑥
      //  ⑦ 통 원이 좌·우 통로 중 정확히 한쪽에서만 닿는다(벽 배제가 실제로 성립하는 형상)
      const inL = s.x - s.r <= wall.x0, inR = s.x + s.r >= wall.x1;
      assert.ok(inL !== inR, tag + ' ' + s.id + ' 은 한쪽 통로에서만 닿아야 한다');
      covered++;
    }
    //  검사 대상 개수를 못 박는다 — 통에서 coverZ 를 떼어 내 검사를 빠져나가는 변경을 여기서 잡는다
    const wantCovered = id === 1 ? 0 : id === 2 ? 2 : (st.lottery && st.lottery.supplyId ? 7 : 6);
    assert.equal(covered, wantCovered, tag + ': 차폐(coverZ) 통 개수');
  }
  //  S2 는 1쌍, S3 는 2쌍
  assert.equal(new Set(buildStage(2).supplies.filter((s) => s.pairId).map((s) => s.pairId)).size, 1);
  assert.equal(new Set(buildStage(3).supplies.filter((s) => s.pairId).map((s) => s.pairId)).size, 2);
});

test('V3-STAGES STG-5: 통로 안내 표지가 그 벽 구간 안 좌/우 통의 실제 내용과 같다', () => {
  for (const id of STAGE_IDS) {
    const st = buildStage(id);
    for (const w of st.walls) {
      assert.ok(w.signs, 'S' + id + ' ' + w.id + ' 표지 없음');
      for (const side of ['L', 'R']) {
        const sg = w.signs[side];
        const inWall = st.supplies.filter((s) => w.z0 - LEAD <= s.z && s.z <= w.z1
          && (side === 'L' ? s.x - s.r <= w.x0 : s.x + s.r >= w.x1));
        if (sg.kind === 'none') { assert.equal(inWall.length, 0, 'S' + id + ' ' + w.id + ' ' + side + ' 은 빈 통로여야 한다'); continue; }
        //  '?' 표지(랜덤 길, 계약서 3-9): 내용이 판마다 바뀌므로 표지는 '무엇인지 모른다'는 사실만 약속한다.
        //   대신 그 통로의 실제 물체가 이번 판 추첨 결과(stage.lottery)와 일치하는지 검사한다.
        if (sg.kind === 'lottery') {
          const lot = st.lottery;
          assert.ok(lot, 'S' + id + ' ' + w.id + ' 랜덤 길 표지인데 stage.lottery 가 없다');
          assert.equal(lot.wallId, w.id, '랜덤 길은 그 벽의 통로다');
          if (lot.supplyId) {
            assert.equal(inWall.length, 1, 'S' + id + ' ' + w.id + ' ' + side + ' 통 1개(추첨이 통일 때)');
            assert.equal(inWall[0].id, lot.supplyId);
            assert.equal(inWall[0].kind, lot.kind);
          } else {
            assert.equal(inWall.length, 0, 'S' + id + ' ' + w.id + ' ' + side + ' 추첨이 통이 아니면 통은 없다');
          }
          continue;
        }
        assert.equal(inWall.length, 1, 'S' + id + ' ' + w.id + ' ' + side + ' 통이 정확히 1개');
        const s = inWall[0];
        assert.equal(sg.kind, s.kind, 'S' + id + ' ' + w.id + ' ' + side + ' 표지 종류');
        if (sg.kind === 'soldier') assert.equal(sg.n, s.payload.n, '표지 병사 수');
        if (sg.kind === 'weapon') assert.equal(sg.weapon, s.payload.weapon, '표지 무기');
      }
    }
  }
});

test('V3-STAGES STG-6: 회피 통로 — corridorHw 가 있는 무리는 가장자리 간격 >= 2×corridorHw + 10 인 틈이 있다', () => {
  let checked = 0;
  for (const id of STAGE_IDS) for (const sp of buildStage(id).spawns) {
    if (sp.corridorHw == null) continue;
    checked++;
    const r = BAL3.enemies[sp.kind].r;
    const need = 2 * sp.corridorHw + 10;
    for (const xs of byRow(sp)) {
      //  적 사이 + 도로 양 끝과의 간격
      const gaps = [xs[0] - r - ROAD[0], ROAD[1] - (xs[xs.length - 1] + r)];
      for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1] - 2 * r);
      assert.ok(Math.max(...gaps) >= need,
        `S${id} ${sp.kind} z${sp.z} 열 [${xs}] 최대 틈 ${Math.max(...gaps)} < 필요 ${need}`);
    }
  }
  assert.ok(checked >= 2, '통로 규격 대상 무리가 있다: ' + checked);
});

test('V3-STAGES STG-7: 기존 유지 — 스폰마다 corridorHw 필드가 있다(number | null)', () => {
  for (const id of STAGE_IDS) for (const sp of buildStage(id).spawns) {
    assert.ok(sp.corridorHw === null || typeof sp.corridorHw === 'number', 'S' + id + ' ' + sp.kind + ' z' + sp.z);
  }
});

test('V3-STAGES STG-9: 인접한 두 벽 사이에 좌↔우 이동 여유(>= 137px)가 있다', () => {
  for (const id of STAGE_IDS) {
    const walls = buildStage(id).walls.slice().sort((a, b) => a.z0 - b.z0);
    for (let i = 1; i < walls.length; i++) {
      const gap = (walls[i].z0 - LEAD) - walls[i - 1].z1;
      assert.ok(gap >= 137, `S${id} ${walls[i - 1].id} → ${walls[i].id} 사이 ${gap}px < 137`);
    }
  }
});

test('V3-STAGES: 통에 coverZ·pairId·hint 필드가 전부 있고 초기 skipped 는 false', () => {
  for (const id of STAGE_IDS) for (const s of buildStage(id).supplies) {
    assert.ok('coverZ' in s && 'pairId' in s && 'hint' in s, 'S' + id + ' ' + s.id);
    assert.equal(s.skipped, false);
    assert.ok(s.coverZ === null || typeof s.coverZ === 'number');
  }
  //  coverZFor 는 계약서 §3-3 공식 그대로
  assert.equal(coverZFor(1800, 2300), 1953);
  assert.equal(coverZFor(2400, 2800), 2524);
  assert.equal(coverZFor(3150, 3500), 3259);
  assert.equal(coverZFor(6000, 6300), 6094);
  assert.equal(VZ_MIN, 650);
});
