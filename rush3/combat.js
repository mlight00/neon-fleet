// rush3/combat.js — 전투 STEP 통합(계약서 3-1·3-7·4장). 순수 규칙: 난수·화면·시계 없음(rng import 금지).
// 모든 좌표는 트랙 z(클수록 앞). 화면 y 변환은 렌더 몫. 규칙은 STEP = 1/60 단위로만 진행한다.
import { BAL3, DEFAULT_DIFFICULTY, difficultyMult } from './balance.js';
import { WEAPONS, weaponRank, makeBullet, weaponStats, fanAngles, clampMk, MK_MAX } from './weapons.js';
import { makeGateRow, sweepContactGate, hitGateCell, passGateRow, updateGateArm } from './gates.js';
import { makeSupply, sweepContactSupply, hitSupply, passSupply, takePads, applySupplyReward, moveSupply } from './supply.js';
import { makeUnit, layoutUnits, compressUnits, clampCenter, hitUnit, overlappingUnits, frontmostUnit } from './squad.js';
import { startBonus, moveTargets, hitBonusTarget, endBonusIfDue } from './bonus.js';

export const STEP = BAL3.STEP;

const SQ = BAL3.squad, ROAD = BAL3.road, EN = BAL3.enemies, LINE_Y = BAL3.view.LINE_Y;
const NO_INPUT = Object.freeze({ pointerX: null, dragDx: 0, keyDir: 0 });
const DEG = Math.PI / 180;

// 난이도별 적 정의 표(계약서 3-8). BAL3.enemies 에 배수를 **한 번** 적용한 새 객체 — run 이 이것만 읽으므로 stepRun 안에 난이도 분기가 없다.
//  enemyHp → grunt/rusher/shooter hp(반올림) · eshotDmg → shooter/elite shot.dmg · touchDmg → grunt/rusher/elite touchDmg
//  eliteFireRate → elite shootEvery ÷ 배수. r·vz·가속·예고·소환 등 나머지는 그대로. 정예 hp 는 stage.elite.hp(buildStage 가 eliteHp 배수 적용).
export function enemyDefsFor(difficulty = DEFAULT_DIFFICULTY) {
  const m = difficultyMult(difficulty);
  const out = {};
  for (const [kind, d] of Object.entries(EN)) {
    const e = { ...d };
    if (d.hp != null) e.hp = Math.round(d.hp * m.enemyHp);
    if (d.touchDmg) e.touchDmg = Math.round(d.touchDmg * m.touchDmg);
    if (d.shot) e.shot = Object.freeze({ ...d.shot, dmg: Math.round(d.shot.dmg * m.eshotDmg) });
    if (kind === 'elite') { e.shootEvery = d.shootEvery / m.eliteFireRate; e.summonEvery = d.summonEvery / (m.eliteSummonRate ?? 1); }
    out[kind] = Object.freeze(e);
  }
  return Object.freeze(out);
}

// 3-1 run 생성. 게이트 행·통은 gates/supply 의 make 함수로 다시 만들어 규칙 모듈이 요구하는 내부 필드(rowId/idx·activated/queuedPads/padStart)를 보장한다.
// 벽·스폰·정예 정의는 stage 것을 그대로 보유(buildStage 가 매번 새 객체라 복사 불필요).
//  난이도: 기본은 stage.difficulty(buildStage 가 박는다). opts.difficulty 는 합성 스테이지(검사)용 덮어쓰기 — 셸은 항상 buildStage 경로만 쓴다.
//  startWeapon/startMk(r3.10): 합성 스테이지·개발 확인용 시작 무기 덮어쓰기. 셸은 URL ?weapon= 로만 넘긴다(기록 저장 제외)
export function createRun(stage, { difficulty, startWeapon, startMk } = {}) {
  const weapon = WEAPONS[startWeapon] ? startWeapon : (WEAPONS[stage.startWeapon] ? stage.startWeapon : 'rifle');
  const weaponMk = clampMk(startMk ?? 1);
  const diff = difficulty ?? stage.difficulty ?? DEFAULT_DIFFICULTY;
  const run = {
    stageId: stage.id, stageVersion: stage.version ?? 1, title: stage.title ?? '', length: stage.length, eliteZ: stage.eliteZ ?? null, bg: stage.bg ?? 1,
    difficulty: diff, enemyDefs: enemyDefsFor(diff),
    z: 0, prevZ: 0, x: ROAD.startX, tx: ROAD.startX,
    units: [], nextUnitId: 1,
    weapon, weaponMk,
    bullets: [],
    gateRows: (stage.gateRows || []).map(makeGateRow),
    supplies: (stage.supplies || []).map(makeSupply),
    //  r3.11: 차폐물(kind 'cover')은 이동·통로 판정에서 빼고(walls) 탄·적탄·폭발/연쇄 사선만 막는다(covers)
    walls: (stage.walls || []).filter((w) => w.kind !== 'cover'),
    covers: (stage.walls || []).filter((w) => w.kind === 'cover'),
    spawns: stage.spawns || [], spawnCursor: 0,
    elite: stage.elite || null, eliteSpawned: false, bossDefeated: false,
    events: [],
    enemies: [], nextEnemyId: 1,
    eshots: [],
    boss: null,
    wallSide: {},
    //  지나온 벽의 통로 선택 기록(지워지지 않는다). wallSide 는 벽을 빠져나가면 삭제되므로 결과 화면이 읽을 수 없다
    wallSideLog: {},
    //  랜덤 길 추첨 결과(stages.buildStage 가 판마다 박는다). 규칙은 읽지 않고 셸의 결과 문구·'?' 연출만 쓴다
    lottery: stage.lottery ?? null,
    //  판 목표(r3.14 구출 캡슐): stage.objective 가 있으면 { kind, supplyId, done, missed, n }. done·missed 는 동시에 true 가 되지 않는다.
    //   supply.applySupplyReward(개봉)·passSupply(지나침)만 쓴다. 승패(verdict)는 이 칸을 읽지 않는다 — 놓쳐도 실패가 아니다
    objective: stage.objective ? { kind: stage.objective.kind, supplyId: stage.objective.supplyId, done: false, missed: false, n: 0 } : null,
    //  단계(r3.15): 'main'(도로 본전투) | 'bonus'(승리 확정 뒤 표적전). 단방향 전이, 종료 플래그는 over 하나뿐.
    //   bonusDef = stage.bonus { sec, tiers, targets } | null · bonus = { t, sec, score, tier, hits } | null · bonusTargets = 표적 런타임(본전투 중엔 빈 배열)
    //   mainResult = 본전투 승리 확정 시점의 { wonAt, survivors, peak, kills }(보너스 유무와 무관하게 모든 승리에서 기록 — 기록 저장은 이 값으로)
    phase: 'main', bonusDef: stage.bonus ?? null, bonus: null, bonusTargets: [], mainResult: null,
    pendingRewards: [],
    time: 0, peak: 0, kills: 0, lossByTouch: 0, lossByShot: 0, lossByGate: 0, missedSupplies: 0, skippedSupplies: 0, badGatesPassed: 0, lastBadGateId: null,
    over: false, won: false, wonAt: null,
  };
  const interval = weaponStats(weapon, weaponMk).interval;
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

// 4장 11단계를 순서 그대로. over 뒤에는 아무것도 하지 않는다. 보너스 단계(r3.15)는 첫머리 한 곳에서 stepBonus 로 갈라진다
export function stepRun(run, input, dt = STEP) {
  if (run.over) return run;
  if (run.phase === 'bonus') return stepBonus(run, input, dt);
  const ev = run.events;
  const inp = input || NO_INPUT;
  steer(run, inp, dt);
  run.prevZ = run.z;
  if (!run.boss) run.z += BAL3.scroll * dt;
  run.time += dt;
  spawnDue(run, ev);
  armGates(run, ev);
  moveSupplies(run, dt);
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

/** 보너스 STEP(r3.15): 승리는 이미 확정됐고 피해원이 없다. 조향(1) → 전진·시계(2) → 표적 이동 → 사격(4) → 아군 탄(5, 표적 후보 포함) →
 *  탄 정리 → 시간 소진이면 over + bonusEnd. 스폰·셔터·적·적탄·접촉·보상·승패는 부르지 않는다(병력 불변 — 보너스 구간엔 게이트·통이 없다는
 *  스테이지 불변식은 V3-BONUS B-1 이 잠근다). dt 는 STEP 고정 간격이다 */
function stepBonus(run, input, dt) {
  const ev = run.events;
  const inp = input || NO_INPUT;
  steer(run, inp, dt);
  run.prevZ = run.z;
  run.z += BAL3.scroll * dt;
  run.time += dt;
  run.bonus.t += dt;
  moveTargets(run, dt, ev);
  fireUnits(run, ev, dt);
  moveBullets(run, ev, dt);
  const ahead = run.z + LINE_Y + BAL3.cull.bulletAhead;
  run.bullets = run.bullets.filter((b) => !b.dead && b.z <= ahead);
  endBonusIfDue(run, ev);
  return run;
}

// 1단계 조향: 지수 추종(followRate) + 속도 상한 → clampCenter(벽 진입 규칙·tx 클램프) → compressUnits
function steer(run, inp, dt) {
  const px = inp.pointerX;
  //  pointerX 가 null 이면 tx 를 덮어쓰지 않는다(키·드래그로 옮긴 목표가 옛 마우스 위치로 되돌아가지 않게 — 계약서 6장 장치 우선순위)
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
    for (let i = 0; i < e.n; i++) spawnEnemy(run, e.kind, e.xs[i], e.zs[i], e.hp, e.skin);
    ev.push({ type: 'spawn', kind: e.kind, n: e.n, x: e.xs[0], z: e.z });
  }
  if (run.elite && !run.eliteSpawned && run.elite.z <= run.z) {
    run.eliteSpawned = true;
    const E = run.enemyDefs.elite;
    const z = run.z + E.spawnAhead;
    run.boss = { kind: 'elite', x: ROAD.center, z, px: ROAD.center, pz: z, hp: run.elite.hp, max: run.elite.hp, r: E.r,
                 state: 'descend', dir: 1, shootT: E.shootEvery, touchT: 0, spawnT: E.summonEvery, summon: !!run.elite.summon, dead: false };
    if (run.elite.skin) run.boss.skin = run.elite.skin;
    ev.push({ type: 'elite', x: run.boss.x, z: run.boss.z, hp: run.boss.hp });
  }
}

// 3-b 단계 게이트 셔터 갱신: run.z 갱신(2단계) 뒤·사격(4단계) 앞. 그 STEP 의 탄 충돌(5단계)이 올바른 셔터 상태를 보게 한다
function armGates(run, ev) {
  for (const row of run.gateRows) updateGateArm(row, run, ev);
}

// 3-c 단계 차량 통 이동(r3.13): 셔터와 같은 자리 — 갱신된 run.z 로 진입을 판단하고, 그 STEP 의 탄 충돌(5단계)이 갱신된 x·prevX 를 본다.
//  규칙은 supply.moveSupply 가 갖고 여기서는 순서만 정한다(정지 통도 매 STEP prevX = x 갱신)
function moveSupplies(run, dt) {
  for (const s of run.supplies) moveSupply(s, run, dt);
}

// 적 1기 생성. hp 는 스테이지 정의 고정값(병력 무관) — 난이도 배수는 run.enemyDefs 에 이미 들어 있다
function spawnEnemy(run, kind, x, z, hp, skin) {
  const d = run.enemyDefs[kind];
  const e = { id: run.nextEnemyId++, kind, x, z, px: x, pz: z, vz: d.vz, hp: hp ?? d.hp, r: d.r, dead: false, touched: false };
  if (skin) e.skin = skin;
  if (kind === 'shooter') { e.shootT = d.shootEvery; e.aimT = 0; }
  run.enemies.push(e);
  return e;
}

// 4단계 유닛 사격: 각자 자기 위치(run.x + dx, run.z - dy)에서 직진. 이벤트 fire {count} STEP당 1개
function fireUnits(run, ev, dt) {
  const mk = run.weaponMk || 1;
  const w = weaponStats(run.weapon, mk);
  const angles = fanAngles(w.id);
  let count = 0;
  for (const u of run.units) {
    u.fireT -= dt;
    while (u.fireT <= 0) {
      //  부채꼴(산탄포): 각도마다 1발, vx = tan(각)·vz. 나머지 무기는 각도 [0] 한 발
      for (const a of angles) run.bullets.push(makeBullet(w.id, run.x + u.dx, run.z - u.dy, u.id, mk, a ? Math.tan(a) * w.vz : 0));
      u.fireT += w.interval;
      count++;
    }
  }
  if (count > 0) ev.push({ type: 'fire', count, weapon: w.id, x: run.x, z: run.z });
}

// 수직 스윕 [pz, z] × x(중심, 탄 폭 미반영) 와 벽 사각형의 최초 교차 z. 겹치지 않으면 null
function wallContactZ(b, w) {
  if (!(b.x >= w.x0 && b.x <= w.x1)) return null;
  const lo = Math.min(b.pz, b.z), hi = Math.max(b.pz, b.z);
  if (!(hi >= w.z0 && lo <= w.z1)) return null;
  return Math.max(w.z0, lo);
}

// 수직 스윕 [pz, z] 와 원(cx, cz, r)의 최초 교차 z. 겹치지 않으면 null
// 적·보스는 r 에 탄 반폭을 더해 부르므로 비스듬히 스치는 접점 z 가 그대로 나온다
function circleContactZ(b, cx, cz, r) {
  const dx = Math.abs(b.x - cx);
  if (dx > r) return null;
  const half = Math.sqrt(r * r - dx * dx);
  const lo = Math.min(b.pz, b.z), hi = Math.max(b.pz, b.z);
  if (!(hi >= cz - half && lo <= cz + half)) return null;
  return Math.max(cz - half, lo);
}

// 5단계 아군 탄: 후보(벽·통·게이트·적·보스) 중 **실제 최초 교차 z** 가 가장 작은 1개만.
// 교차 z 는 물체 앞면이 아니라 스윕이 그 물체에 처음 닿는 점이다(원은 중심 x 차이에 따른 반현 반영).
// 동일 교차 z 일 때만 벽(0) > 통(1) > 게이트(2) > 적(3) 우선순위를 쓴다.
// 탄 폭: 벽·통·게이트는 탄 중심 x(폭 미반영), 적·보스는 반지름에 탄 반폭을 더한다(계약서 4장 5단계).
function moveBullets(run, ev, dt) {
  const bullets = run.bullets;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (b.dead) continue;
    b.pz = b.z;
    b.z += b.vz * dt;
    if (b.vx) b.x += b.vx * dt;
    //  사거리(산탄포): range 를 넘긴 탄은 이번 STEP 에 닿는 것 없이 소멸
    if (b.range != null && b.z - b.z0 > b.range) { b.dead = true; continue; }
    let bestZ = Infinity, bestP = 9, kind = -1, obj = null, cell = null;
    // 후보 등록: cz = 교차 함수가 돌려준 최초 교차 z(이미 스윕 시작 이상으로 잘려 있다)
    const consider = (cz, p, k, o, c) => {
      if (cz === null) return;
      if (cz < bestZ || (cz === bestZ && p < bestP)) { bestZ = cz; bestP = p; kind = k; obj = o; cell = c; }
    };
    for (const w of run.walls) consider(wallContactZ(b, w), 0, 0, w, null);
    for (const w of run.covers) consider(wallContactZ(b, w), 0, 0, w, null);
    for (const s of run.supplies) consider(sweepContactSupply(s, b), 1, 1, s, null);
    for (const row of run.gateRows) {
      if (row.passed) continue;
      for (const c of row.cells) consider(sweepContactGate(row, c, b), 2, 2, row, c);
    }
    const halfW = b.w / 2;
    //  관통탄(저격총)이 이미 맞힌 적은 후보에서 뺀다(같은 적을 STEP 마다 다시 맞히지 않게)
    const hitAlready = (id) => !!(b.hit && b.hit.includes(id));
    for (const e of run.enemies) if (!e.dead && !hitAlready(e.id)) consider(circleContactZ(b, e.x, e.z, e.r + halfW), 3, 3, e, null);
    const bo = run.boss;
    if (bo && !bo.dead && !hitAlready('boss')) consider(circleContactZ(b, bo.x, bo.z, bo.r + halfW), 3, 3, bo, null);
    //  보너스 표적(r3.15): 적과 같은 층(우선순위 3, 동시엔 적이 앞). 본전투 중엔 bonusTargets 가 빈 배열이라 종전 판정이 한 줄도 바뀌지 않는다
    for (const t of run.bonusTargets) if (t.alive && !hitAlready(t.id)) consider(circleContactZ(b, t.x, t.z, t.r + halfW), 3, 4, t, null);
    if (kind === 0) { b.dead = true; ev.push({ type: obj.kind === 'cover' ? 'coverHit' : 'wallHit', x: b.x, z: bestZ }); }
    else if (kind === 1) hitSupply(obj, b, ev, run);
    else if (kind === 2) hitGateCell(obj, cell, b, ev);
    else if (kind === 3) hitEnemy(run, obj, b, ev);
    else if (kind === 4) hitBonusTarget(run, obj, b, ev);
  }
}

// 적·보스 직격. hp <= 0 즉시 dead(같은 STEP 이후 처리에서 제외). heavy 는 적 직격 시에만 폭발
function hitEnemy(run, e, b, ev) {
  //  관통(저격총): 맞힌 적 id 를 기억하고, 맞힌 수가 pierce 미만이면 탄은 살아서 계속 간다(pierce 2 = 적 2체까지)
  if (b.pierce) { b.hit.push(e.id ?? 'boss'); if (b.hit.length >= b.pierce) b.dead = true; }
  else b.dead = true;
  e.hp -= b.dmg;
  ev.push({ type: 'enemyHit', id: e.id, kind: e.kind, hp: e.hp, x: e.x, z: e.z });
  if (e.hp <= 0) e.dead = true;
  const w = WEAPONS[b.kind];
  if (w && w.blastR) blast(run, e, w.blastR, w.blastDmg, ev);
  if (w && w.chain) chainArc(run, e, w.chain, w.chainR, w.chainDmg, ev);
}

// 전격포 연쇄(r3.10): 직격한 적에서 chainR 안(원 겹침 기준)의 다른 !dead 적·보스 중 가까운 순 n 체에 dmg. 벽 너머 제외.
//  같은 거리면 id 순 — 결정성. 이벤트 arc {x,z,tx,tz} 는 연출 전용
function chainArc(run, from, n, r, dmg, ev) {
  const pool = run.boss ? run.enemies.concat([run.boss]) : run.enemies;
  const cand = [];
  for (const t of pool) {
    if (t === from || t.dead) continue;
    const d = Math.hypot(t.x - from.x, t.z - from.z);
    if (d > r + t.r) continue;
    if (wallBetween(run.walls.concat(run.covers), from.x, from.z, t.x, t.z)) continue;
    cand.push({ t, d, id: t.id ?? Number.MAX_SAFE_INTEGER });
  }
  cand.sort((a, b) => a.d - b.d || a.id - b.id);
  for (const { t } of cand.slice(0, n)) {
    t.hp -= dmg;
    ev.push({ type: 'enemyHit', id: t.id, kind: t.kind, hp: t.hp, x: t.x, z: t.z, arc: true });
    ev.push({ type: 'arc', x: from.x, z: from.z, tx: t.x, tz: t.z });
    if (t.hp <= 0) t.dead = true;
  }
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
    if (wallBetween(run.walls.concat(run.covers), center.x, center.z, t.x, t.z)) continue;
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
    const d = run.enemyDefs[e.kind];
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
  const E = run.enemyDefs.elite;
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
      const r = run.enemyDefs[E.summonKind].r;
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
    if (!wall) for (const w of run.covers) if (segHitsRect(s.px, s.pz, s.x, s.z, w)) { wall = true; break; }
    if (wall) { s.dead = true; continue; }
    const u = hitUnit(run.units, s.x, s.z, s.r, { x: s.px, z: s.pz }, run);
    if (u) { s.dead = true; damageUnit(run, u, s.dmg, 'shot', ev, s.x, s.z); }
  }
}

// 8단계 접촉: 잡졸·돌격체 스윕 vs 유닛 원 → 겹친 유닛 중 앞줄 1명, 적 소모(touched, kills 제외). 보스는 0.5s 타이머 접촉
function contacts(run, ev, dt) {
  for (const e of run.enemies) {
    if (e.dead) continue;
    const d = run.enemyDefs[e.kind];
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
    const E = run.enemyDefs.elite;
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
  for (const r of pend) applySupplyReward(r, run, ev, { weaponRank, mkMax: MK_MAX, supplies: run.supplies });
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
//  r3.15: 승리는 여기서 **확정**(won·wonAt·mainResult·win 이벤트). over 는 보너스가 없을 때만 여기서 — 있으면 startBonus 로 넘어가고
//   bonusEnd(시간 소진)가 over 를 세운다. 보너스를 다 못 깼다고 이미 확정한 승리·기록(mainResult)은 되돌리지 않는다
function verdict(run, ev) {
  const noEnemies = run.enemies.length === 0;
  const win = run.elite ? (run.bossDefeated && noEnemies) : (run.z >= run.length && noEnemies);
  if (win) {
    run.won = true; run.wonAt = run.time;
    run.mainResult = { wonAt: run.time, survivors: run.units.length, peak: run.peak, kills: run.kills };
    ev.push({ type: 'win', time: run.time, units: run.units.length, x: run.x, z: run.z });
    if (run.bonusDef) startBonus(run, ev);
    else run.over = true;
    return;
  }
  if (run.units.length === 0) {
    run.over = true;
    ev.push({ type: 'lose', time: run.time, x: run.x, z: run.z });
  }
}
