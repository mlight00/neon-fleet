// rush3/combat.js — 전투 STEP 통합(계약서 3-1·3-7·4장). 순수 규칙: 난수·화면·시계 없음(rng import 금지).
// 모든 좌표는 트랙 z(클수록 앞). 화면 y 변환은 렌더 몫. 규칙은 STEP = 1/60 단위로만 진행한다.
import { BAL3 } from './balance.js';
import { WEAPONS, weaponRank, makeBullet } from './weapons.js';
import { makeGateRow, sweepHitsGate, hitGateCell, passGateRow } from './gates.js';
import { makeSupply, sweepHitsSupply, hitSupply, passSupply, takePads, applySupplyReward } from './supply.js';
import { makeUnit, layoutUnits, compressUnits, clampCenter, hitUnit, overlappingUnits, frontmostUnit } from './squad.js';

export const STEP = BAL3.STEP;

const SQ = BAL3.squad, ROAD = BAL3.road, EN = BAL3.enemies, LINE_Y = BAL3.view.LINE_Y;
const NO_INPUT = Object.freeze({ pointerX: null, dragDx: 0, keyDir: 0 });
const DEG = Math.PI / 180;

// 3-1 run 생성. 게이트 행·통은 gates/supply 의 make 함수로 다시 만들어 규칙 모듈이 요구하는 내부 필드(rowId/idx·activated/queuedPads/padStart)를 보장한다.
// 벽·스폰·정예 정의는 stage 것을 그대로 보유(buildStage 가 매번 새 객체라 복사 불필요).
export function createRun(stage) {
  const weapon = WEAPONS[stage.startWeapon] ? stage.startWeapon : 'rifle';
  const run = {
    stageId: stage.id, stageVersion: stage.version ?? 1, title: stage.title ?? '', length: stage.length, eliteZ: stage.eliteZ ?? null,
    z: 0, prevZ: 0, x: ROAD.startX, tx: ROAD.startX,
    units: [], nextUnitId: 1,
    weapon,
    bullets: [],
    gateRows: (stage.gateRows || []).map(makeGateRow),
    supplies: (stage.supplies || []).map(makeSupply),
    walls: stage.walls || [],
    spawns: stage.spawns || [], spawnCursor: 0,
    elite: stage.elite || null, eliteSpawned: false, bossDefeated: false,
    events: [],
    enemies: [], nextEnemyId: 1,
    eshots: [],
    boss: null,
    wallSide: {},
    pendingRewards: [],
    time: 0, peak: 0, kills: 0, lossByTouch: 0, lossByShot: 0, lossByGate: 0, missedSupplies: 0, badGatesPassed: 0,
    over: false, won: false, wonAt: null,
  };
  const interval = WEAPONS[weapon].interval;
  for (let i = 0; i < (stage.startUnits | 0); i++) run.units.push(makeUnit(run.nextUnitId++, interval));
  layoutUnits(run.units);
  run.peak = run.units.length;
  return run;
}

// 누적 이벤트를 한 번에 비운다(프레임당 STEP 여러 번이어도 유실 없음)
export function drainEvents(run) {
  const ev = run.events;
  run.events = [];
  return ev;
}

// 4장 11단계를 순서 그대로. over 뒤에는 아무것도 하지 않는다.
export function stepRun(run, input, dt = STEP) {
  if (run.over) return run;
  const ev = run.events;
  const inp = input || NO_INPUT;
  steer(run, inp, dt);
  run.prevZ = run.z;
  if (!run.boss) run.z += BAL3.scroll * dt;
  run.time += dt;
  spawnDue(run, ev);
  fireUnits(run, ev, dt);
  moveBullets(run, ev, dt);
  moveEnemies(run, ev, dt);
  moveEshots(run, ev, dt);
  contacts(run, ev, dt);
  pruneDeadUnits(run, ev);
  applyRewards(run, ev);
  cleanup(run, ev);
  verdict(run, ev);
  return run;
}

// 1단계 조향: 지수 추종(followRate) + 속도 상한 → clampCenter(벽 진입 규칙·tx 클램프) → compressUnits
function steer(run, inp, dt) {
  const px = inp.pointerX;
  if (px !== null && px !== undefined && Number.isFinite(px)) run.tx = px;
  run.tx += Number.isFinite(inp.dragDx) ? inp.dragDx : 0;
  run.tx += (inp.keyDir || 0) * SQ.keySpeed * dt;
  const want = (run.tx - run.x) * (1 - Math.exp(-SQ.followRate * dt));
  const cap = SQ.moveMax * dt;
  run.x += Math.max(-cap, Math.min(cap, want));
  const c = clampCenter(run, run.walls);
  compressUnits(run.units, c.dxLo, c.dxHi);
}

// 3단계 스폰: ev.z <= z 인 이벤트를 커서 순서로 소비. 정예는 run.boss(스폰 z = run.z + 760)
function spawnDue(run, ev) {
  const sp = run.spawns;
  while (run.spawnCursor < sp.length && sp[run.spawnCursor].z <= run.z) {
    const e = sp[run.spawnCursor++];
    for (let i = 0; i < e.n; i++) spawnEnemy(run, e.kind, e.xs[i], e.zs[i], e.hp);
    ev.push({ type: 'spawn', kind: e.kind, n: e.n, x: e.xs[0], z: e.z });
  }
  if (run.elite && !run.eliteSpawned && run.elite.z <= run.z) {
    run.eliteSpawned = true;
    const E = EN.elite;
    const z = run.z + E.spawnAhead;
    run.boss = { kind: 'elite', x: ROAD.center, z, px: ROAD.center, pz: z, hp: run.elite.hp, max: run.elite.hp, r: E.r,
                 state: 'descend', dir: 1, shootT: E.shootEvery, touchT: 0, spawnT: E.summonEvery, summon: !!run.elite.summon, dead: false };
    ev.push({ type: 'elite', x: run.boss.x, z: run.boss.z, hp: run.boss.hp });
  }
}

// 적 1기 생성. hp 는 스테이지 정의 고정값(병력 무관)
function spawnEnemy(run, kind, x, z, hp) {
  const d = EN[kind];
  const e = { id: run.nextEnemyId++, kind, x, z, px: x, pz: z, vz: d.vz, hp: hp ?? d.hp, r: d.r, dead: false, touched: false };
  if (kind === 'shooter') { e.shootT = d.shootEvery; e.aimT = 0; }
  run.enemies.push(e);
  return e;
}

// 4단계 유닛 사격: 각자 자기 위치(run.x + dx, run.z - dy)에서 직진. 이벤트 fire {count} STEP당 1개
function fireUnits(run, ev, dt) {
  const w = WEAPONS[run.weapon] || WEAPONS.rifle;
  let count = 0;
  for (const u of run.units) {
    u.fireT -= dt;
    while (u.fireT <= 0) {
      run.bullets.push(makeBullet(w.id, run.x + u.dx, run.z - u.dy, u.id));
      u.fireT += w.interval;
      count++;
    }
  }
  if (count > 0) ev.push({ type: 'fire', count, weapon: w.id, x: run.x, z: run.z });
}

// 수직 스윕 [pz, z] × x 가 벽 사각형과 겹치는가
function bulletHitsWall(b, w) {
  return b.x >= w.x0 && b.x <= w.x1 && Math.max(b.pz, b.z) >= w.z0 && Math.min(b.pz, b.z) <= w.z1;
}

// 수직 스윕 [pz, z] 가 원(cx, cz, r)과 겹치는가
function sweepHitsCircle(b, cx, cz, r) {
  const dx = Math.abs(b.x - cx);
  if (dx > r) return false;
  const half = Math.sqrt(r * r - dx * dx);
  const lo = Math.min(b.pz, b.z), hi = Math.max(b.pz, b.z);
  return hi >= cz - half && lo <= cz + half;
}

// 5단계 아군 탄: 후보(벽·통·게이트·적·보스) 중 접촉 z 가 가장 작은 1개만. 동일 z 는 벽(0) > 통(1) > 게이트(2) > 적(3)
function moveBullets(run, ev, dt) {
  const bullets = run.bullets;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (b.dead) continue;
    b.pz = b.z;
    b.z += b.vz * dt;
    let bestZ = Infinity, bestP = 9, kind = -1, obj = null, cell = null;
    // 후보 등록: 접촉 z = max(물체 앞면 z, 스윕 시작)
    const consider = (front, p, k, o, c) => {
      const cz = Math.max(front, b.pz);
      if (cz < bestZ || (cz === bestZ && p < bestP)) { bestZ = cz; bestP = p; kind = k; obj = o; cell = c; }
    };
    for (const w of run.walls) if (bulletHitsWall(b, w)) consider(w.z0, 0, 0, w, null);
    for (const s of run.supplies) if (sweepHitsSupply(s, b)) consider(s.z - s.r, 1, 1, s, null);
    for (const row of run.gateRows) {
      if (row.passed) continue;
      for (const c of row.cells) if (sweepHitsGate(row, c, b)) consider(row.z - row.h / 2, 2, 2, row, c);
    }
    const halfW = b.w / 2;
    for (const e of run.enemies) if (!e.dead && sweepHitsCircle(b, e.x, e.z, e.r + halfW)) consider(e.z - e.r, 3, 3, e, null);
    const bo = run.boss;
    if (bo && !bo.dead && sweepHitsCircle(b, bo.x, bo.z, bo.r + halfW)) consider(bo.z - bo.r, 3, 3, bo, null);
    if (kind === 0) { b.dead = true; ev.push({ type: 'wallHit', x: b.x, z: bestZ }); }
    else if (kind === 1) hitSupply(obj, b, ev, run);
    else if (kind === 2) hitGateCell(cell, b, ev);
    else if (kind === 3) hitEnemy(run, obj, b, ev);
  }
}

// 적·보스 직격. hp <= 0 즉시 dead(같은 STEP 이후 처리에서 제외). heavy 는 적 직격 시에만 폭발
function hitEnemy(run, e, b, ev) {
  b.dead = true;
  e.hp -= b.dmg;
  ev.push({ type: 'enemyHit', id: e.id, kind: e.kind, hp: e.hp, x: e.x, z: e.z });
  if (e.hp <= 0) e.dead = true;
  const w = WEAPONS[b.kind];
  if (w && w.blastR) blast(run, e, w.blastR, w.blastDmg, ev);
}

// 폭발 중심과 적 사이에 벽 x 범위가 끼면(벽 z 구간 안) 제외
function wallBetween(walls, ax, az, bx, bz) {
  for (const w of walls) {
    if (Math.max(az, bz) < w.z0 || Math.min(az, bz) > w.z1) continue;
    if ((ax < w.x0 && bx > w.x1) || (ax > w.x1 && bx < w.x0)) return true;
  }
  return false;
}

// heavy 폭발: 직격 적은 제외, 반경 r 원과 적 원이 겹치는 !dead 적·보스에 dmg
function blast(run, center, r, dmg, ev) {
  ev.push({ type: 'blast', x: center.x, z: center.z, r });
  const targets = run.boss ? run.enemies.concat([run.boss]) : run.enemies;
  for (const t of targets) {
    if (t === center || t.dead) continue;
    const d = Math.hypot(t.x - center.x, t.z - center.z);
    if (d > r + t.r) continue;
    if (wallBetween(run.walls, center.x, center.z, t.x, t.z)) continue;
    t.hp -= dmg;
    ev.push({ type: 'enemyHit', id: t.id, kind: t.kind, hp: t.hp, x: t.x, z: t.z, blast: true });
    if (t.hp <= 0) t.dead = true;
  }
}

// 적탄 발사: (x, z)에서 목표 (tx, tz) 방향, 부채꼴 fan 발(각도 간격 spreadRad). vz 양수 = 부대 쪽(z 감소)
function fireAt(run, x, z, tx, tz, shot, fan, spreadRad, ev) {
  const base = Math.atan2(tx - x, z - tz);
  for (let k = 0; k < fan; k++) {
    const a = base + (k - (fan - 1) / 2) * spreadRad;
    run.eshots.push({ x, z, px: x, pz: z, vx: Math.sin(a) * shot.vz, vz: Math.cos(a) * shot.vz, dmg: shot.dmg, r: shot.r, dead: false });
  }
  ev.push({ type: 'eshot', n: fan, x, z });
}

// 6단계 적 이동·행동(!dead 만). grunt 추종·rusher 가속·shooter 예고/발사·보스 하강/왕복/사격/소환
function moveEnemies(run, ev, dt) {
  for (const e of run.enemies) {
    if (e.dead) continue;
    const d = EN[e.kind];
    e.px = e.x; e.pz = e.z;
    if (e.kind === 'grunt') {
      const want = run.x - e.x, mv = d.track * dt;
      e.x += Math.abs(want) <= mv ? want : Math.sign(want) * mv;
    } else if (e.kind === 'rusher') {
      e.vz = Math.min(d.maxVz, e.vz + d.accel * dt);
    } else if (e.kind === 'shooter') {
      shooterAct(run, e, d, ev, dt);
    }
    e.z -= e.vz * dt;
  }
  if (run.boss && !run.boss.dead) bossAct(run, run.boss, ev, dt);
}

// 저격수: shootEvery 주기로 예고(aim) 시작, aimTime 뒤 발사 시점의 (run.x, run.z)를 조준해 1발. 부대 줄을 지나면 쏘지 않는다
function shooterAct(run, e, d, ev, dt) {
  if (e.z <= run.z) return;
  e.shootT -= dt;
  if (e.aimT > 0) {
    e.aimT -= dt;
    if (e.aimT <= 0) { e.aimT = 0; fireAt(run, e.x, e.z, run.x, run.z, d.shot, 1, 0, ev); }
  }
  if (e.shootT <= 0) {
    e.shootT += d.shootEvery;
    e.aimT = d.aimTime;
    ev.push({ type: 'aim', id: e.id, x: e.x, z: e.z });
  }
}

// 정예: descend(150/s, run.z + 420 까지) → hold(좌우 60/s 왕복). 1.0s 부채꼴 3발, S3 는 4s 마다 잡졸 2 소환
function bossAct(run, bo, ev, dt) {
  const E = EN.elite;
  bo.px = bo.x; bo.pz = bo.z;
  if (bo.state === 'descend') {
    bo.z -= E.descendSpeed * dt;
    if (bo.z <= run.z + E.holdAhead) { bo.z = run.z + E.holdAhead; bo.state = 'hold'; }
  } else {
    bo.x += bo.dir * E.patrolSpeed * dt;
    const lo = ROAD.x0 + bo.r, hi = ROAD.x1 - bo.r;
    if (bo.x <= lo) { bo.x = lo; bo.dir = 1; } else if (bo.x >= hi) { bo.x = hi; bo.dir = -1; }
  }
  bo.shootT -= dt;
  if (bo.shootT <= 0) {
    bo.shootT += E.shootEvery;
    fireAt(run, bo.x, bo.z, run.x, run.z, E.shot, E.fan, E.fanDeg * DEG, ev);
  }
  if (bo.summon) {
    bo.spawnT -= dt;
    if (bo.spawnT <= 0) {
      bo.spawnT += E.summonEvery;
      const r = EN[E.summonKind].r;
      for (let k = 0; k < E.summonN; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const x = Math.max(ROAD.x0 + r, Math.min(ROAD.x1 - r, bo.x + side * E.summonDx));
        spawnEnemy(run, E.summonKind, x, bo.z + E.summonDz);
      }
      ev.push({ type: 'summon', kind: E.summonKind, n: E.summonN, x: bo.x, z: bo.z + E.summonDz });
    }
  }
}

// 선분 (ax,az)→(bx,bz) 가 사각형 w(x0..x1 × z0..z1)와 겹치는가(Liang–Barsky)
function segHitsRect(ax, az, bx, bz, w) {
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz], q = [ax - w.x0, w.x1 - ax, az - w.z0, w.z1 - az];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

// 유닛 피해. hp <= 0 이면 원인별 손실 집계(제거는 pruneDeadUnits)
function damageUnit(run, u, dmg, cause, ev, x, z) {
  u.hp -= dmg;
  ev.push({ type: 'hurt', n: dmg, cause, unitId: u.id, x, z });
  if (u.hp <= 0) {
    if (cause === 'shot') run.lossByShot++;
    else run.lossByTouch++;
  }
}

// 7단계 적탄: 이동 → 벽 소멸 → 유닛 원 스윕 명중(가장 가까운 1명)
function moveEshots(run, ev, dt) {
  for (const s of run.eshots) {
    if (s.dead) continue;
    s.px = s.x; s.pz = s.z;
    s.z -= s.vz * dt;
    s.x += s.vx * dt;
    let wall = false;
    for (const w of run.walls) if (segHitsRect(s.px, s.pz, s.x, s.z, w)) { wall = true; break; }
    if (wall) { s.dead = true; continue; }
    const u = hitUnit(run.units, s.x, s.z, s.r, { x: s.px, z: s.pz }, run);
    if (u) { s.dead = true; damageUnit(run, u, s.dmg, 'shot', ev, s.x, s.z); }
  }
}

// 8단계 접촉: 잡졸·돌격체 스윕 vs 유닛 원 → 겹친 유닛 중 앞줄 1명, 적 소모(touched, kills 제외). 보스는 0.5s 타이머 접촉
function contacts(run, ev, dt) {
  for (const e of run.enemies) {
    if (e.dead) continue;
    const d = EN[e.kind];
    if (!d.touchDmg) continue;
    const hits = overlappingUnits(run.units, e.x, e.z, e.r, { x: e.px, z: e.pz }, run);
    if (!hits.length) continue;
    const u = frontmostUnit(hits);
    e.touched = true; e.dead = true;
    damageUnit(run, u, d.touchDmg, 'touch', ev, e.x, e.z);
    ev.push({ type: 'touch', id: e.id, kind: e.kind, x: e.x, z: e.z });
  }
  const bo = run.boss;
  if (bo && !bo.dead) {
    const E = EN.elite;
    bo.touchT = Math.max(0, bo.touchT - dt);
    if (bo.touchT <= 0) {
      const hits = overlappingUnits(run.units, bo.x, bo.z, bo.r, null, run);
      if (hits.length) {
        bo.touchT = E.touchEvery;
        damageUnit(run, frontmostUnit(hits), E.touchDmg, 'boss', ev, bo.x, bo.z);
        ev.push({ type: 'touch', kind: 'elite', x: bo.x, z: bo.z });
      }
    }
  }
}

// hp <= 0 유닛 제거 → layoutUnits
function pruneDeadUnits(run, ev) {
  const units = run.units;
  let w = 0, lost = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.hp > 0) units[w++] = u;
    else { lost++; ev.push({ type: 'unitLost', id: u.id, x: run.x + u.dx, z: run.z - u.dy }); }
  }
  if (lost) { units.length = w; layoutUnits(units); }
}

// 9단계 보상·통과: pendingRewards → passGateRow → passSupply → takePads → 대형 재배치
// 재배치 = clampCenter + compressUnits(formation 기준이라 layoutUnits 를 포함). squad.addUnits/removeUnits 가 호출하는
// layoutUnits 는 압축을 풀어 버리므로, 통로 안에서 병력이 바뀐 STEP 에도 화면에 나가기 전 통로 안으로 되돌린다.
function applyRewards(run, ev) {
  const pend = run.pendingRewards;
  run.pendingRewards = [];
  for (const r of pend) applySupplyReward(r, run, ev, { weaponRank, supplies: run.supplies });
  for (const row of run.gateRows) passGateRow(row, run, ev);
  for (const s of run.supplies) passSupply(s, run, ev);
  for (const s of run.supplies) if (s.kind === 'chain' && s.pads.length) takePads(s, run, ev);
  const c = clampCenter(run, run.walls);
  compressUnits(run.units, c.dxLo, c.dxHi);
}

// 10단계 정리: dead 적 중 !touched 는 kills(이벤트 kill), 보스 사망 bossKill(남은 적·적탄 소거 = 정예 격파 즉시 승리), 범위 밖 정리, peak
function cleanup(run, ev) {
  const behind = run.z - BAL3.cull.enemyBehind, ahead = run.z + LINE_Y + BAL3.cull.bulletAhead;
  run.enemies = run.enemies.filter((e) => {
    if (e.dead) {
      if (!e.touched) { run.kills++; ev.push({ type: 'kill', id: e.id, kind: e.kind, x: e.x, z: e.z }); }
      return false;
    }
    return e.z >= behind;
  });
  const bo = run.boss;
  if (bo && bo.dead) {
    run.kills++;
    run.bossDefeated = true;
    run.boss = null;
    ev.push({ type: 'bossKill', x: bo.x, z: bo.z, r: bo.r });
    run.enemies.length = 0;
    run.eshots.length = 0;
  }
  run.bullets = run.bullets.filter((b) => !b.dead && b.z <= ahead);
  run.eshots = run.eshots.filter((s) => !s.dead && s.z >= behind && s.x > -40 && s.x < 520);
  if (run.units.length > run.peak) run.peak = run.units.length;
}

// 11단계 승패: 승리 우선. 정예 스테이지 = 정예 격파 && 적 없음, 아니면 z >= length && 적 없음. 패배 = 유닛 0
function verdict(run, ev) {
  const noEnemies = run.enemies.length === 0;
  const win = run.elite ? (run.bossDefeated && noEnemies) : (run.z >= run.length && noEnemies);
  if (win) {
    run.won = true; run.over = true; run.wonAt = run.time;
    ev.push({ type: 'win', time: run.time, units: run.units.length, x: run.x, z: run.z });
    return;
  }
  if (run.units.length === 0) {
    run.over = true;
    ev.push({ type: 'lose', time: run.time, x: run.x, z: run.z });
  }
}
