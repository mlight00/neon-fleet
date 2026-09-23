// rush3/combat.js — 전투 STEP 통합(계약서 3-1·3-7·4장). 순수 규칙: 난수·화면·시계 없음(rng import 금지).
// 모든 좌표는 트랙 z(클수록 앞). 화면 y 변환은 렌더 몫. 규칙은 STEP = 1/60 단위로만 진행한다.
import { BAL3, DEFAULT_DIFFICULTY, difficultyMult } from './balance.js';
import { WEAPONS, weaponRank, makeBullet, weaponStats, fanAngles, clampMk, MK_MAX } from './weapons.js';
import { makeGateRow, sweepContactGate, hitGateCell, passGateRow, updateGateArm, isGateCellFixed } from './gates.js';
import { makeSupply, sweepContactSupply, hitSupply, passSupply, takePads, applySupplyReward, moveSupply } from './supply.js';
import { makeUnit, layoutUnits, compressUnits, clampCenter, hitUnit, overlappingUnits, frontmostUnit } from './squad.js';
import { startBonus, moveTargets, hitBonusTarget, endBonusIfDue } from './bonus.js';

export const STEP = BAL3.STEP;

const SQ = BAL3.squad, ROAD = BAL3.road, EN = BAL3.enemies, LINE_Y = BAL3.view.LINE_Y;
//  복수 정예(r3.16) 역할 표·순찰 반폭. 파일 상단 상수로 잡아 stepRun 이후 소스가 BAL3.enemies 를 직접 읽지 않는 규약(DIFF-6)을 지킨다
const ELITES = BAL3.elites;
//  아레나(r3.17) 보스 z 허용 범위(run.z 기준). 파일 상단 상수 — stepRun 이후는 run.arena 만 읽는다
const ARENA_BOSS_Z = BAL3.arena.bossZ;
//  체력 비례 크기(r3.31) 표. 파일 상단 상수 — stepRun 이후 소스가 BAL3 를 직접 읽지 않는 규약(DIFF-6)을 지킨다
const SIZE_BY_HP = BAL3.sizeByHp;
const HP_BASE = Object.freeze(Object.fromEntries(Object.entries(BAL3.enemies).filter(([, d]) => d.hp != null).map(([k, d]) => [k, d.hp])));
const NO_INPUT = Object.freeze({ pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
const DEG = Math.PI / 180;

//  아레나(r3.17) 공통 헬퍼. 부대 중심은 (run.x, run.z − run.ay) 2차원 — ay 는 LINE_Y 기준 세로 오프셋(음수 = 화면 위 = z 큰 쪽).
//   도로에서는 ay 가 항상 0 이라 squadZ === run.z, squadOrigin 은 **같은 run 객체**를 돌려줘 종전 판정과 바이트 단위로 같다
const inArena = (run) => run.phase === 'arena';
const squadZ = (run) => run.z - (run.ay || 0);
const squadOrigin = (run) => (run.ay ? { x: run.x, z: run.z - run.ay } : run);
//  광장에서는 clampCenter 의 도로 가장자리를 광장 폭(40~440)으로 넓힌다. 도로에서는 undefined(= SQUAD_DEFAULTS 그대로)
const squadOpts = (run) => (inArena(run) ? run.arena.squadOpts : undefined);
const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 난이도별 적 정의 표(계약서 3-8). BAL3.enemies 에 배수를 **한 번** 적용한 새 객체 — run 이 이것만 읽으므로 stepRun 안에 난이도 분기가 없다.
//  enemyHp → grunt/rusher/shooter hp(반올림) · eshotDmg → shooter/elite shot.dmg · touchDmg → grunt/rusher/elite touchDmg
//  eliteFireRate → elite shootEvery ÷ 배수. r·vz·가속·예고·소환 등 나머지는 그대로. 정예 hp 는 stage.elite.hp(buildStage 가 eliteHp 배수 적용).
//  hpMul(r3.21) = 스테이지 구간 배율(stage.enemyHpMul, balance.enemyHpMulFor). hp = round(표 hp × hpMul × enemyHp) — stages.makeSpawn 과 같은 식이라
//   정예·아레나 보스가 **소환하는 잡졸**(ev.hp 없이 spawnEnemy)도 그 스테이지의 도로 잡졸과 같은 체력이다. 생략 = 1(검사 합성·1~3).
//  difficultyHp(r3.21 대항 검수 반영) = 난이도 체력 배수 enemyHp 적용 여부(stage.difficultyHp, balance.difficultyHpFor). 1~3 기준 코스는 false → 소환 잡졸도 표 hp 그대로.
//   생략 = true(검사 합성·4~24). 적탄·접촉·발사/소환 빈도 배수는 이 플래그와 무관하게 걸린다
export function enemyDefsFor(difficulty = DEFAULT_DIFFICULTY, hpMul = 1, difficultyHp = true) {
  const m = difficultyMult(difficulty);
  const out = {};
  for (const [kind, d] of Object.entries(EN)) {
    const e = { ...d };
    if (d.hp != null) e.hp = Math.round(d.hp * hpMul * (difficultyHp ? m.enemyHp : 1));
    if (d.touchDmg) e.touchDmg = Math.round(d.touchDmg * m.touchDmg);
    if (d.shot) e.shot = Object.freeze({ ...d.shot, dmg: Math.round(d.shot.dmg * m.eshotDmg) });
    if (kind === 'elite') { e.shootEvery = d.shootEvery / m.eliteFireRate; e.summonEvery = d.summonEvery / (m.eliteSummonRate ?? 1); }
    //  r3.22 지옥 강화 손잡이: 저격수 발사 주기 ÷ shooterFireRate(기본 1 = 불변)
    if (kind === 'shooter' && (m.shooterFireRate ?? 1) !== 1) e.shootEvery = d.shootEvery / m.shooterFireRate;
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
  //  정예 정의(r3.16 복수 정예): stage.elites 배열이 진실, 없으면 단수 stage.elite 를 배열 1개로(검사 합성 스테이지는 buildStage 를 거치지 않는다).
  //   role 은 여기서 검증만 한다(모르는 역할 = 데이터 오류 → throw. STEP 도중에 터지지 않게 생성 시점에)
  const elites = stage.elites ?? (stage.elite ? [stage.elite] : []);
  for (const e of elites) if (e.role != null && !ELITES.roles[e.role]) throw new Error('unknown elite role ' + e.role);
  //  아레나(r3.17): stage.arena 정의의 사본에 난이도 배수를 **여기서 한 번** 적용(접촉·충격 피해 × touchDmg 반올림, 돌진·사격 주기 ÷ eliteFireRate, 소환 주기 ÷ eliteSummonRate).
  //   hp 는 elites[0].hp(buildStage 파생값)가 진실. squadOpts = clampCenter 에 넘길 광장 폭. 아레나가 없는 스테이지는 null
  const m = difficultyMult(diff);
  const A = stage.arena;
  const arena = A ? {
    z: A.z, w: [...A.w], depth: [...A.depth], bossZ: [...ARENA_BOSS_Z], squadOpts: Object.freeze({ roadLo: A.w[0], roadHi: A.w[1] }),
    boss: {
      ...A.boss,
      touchDmg: Math.round(A.boss.touchDmg * m.touchDmg),
      dash: { ...A.boss.dash, every: A.boss.dash.every / m.eliteFireRate },
      shock: { ...A.boss.shock, dmg: Math.round(A.boss.shock.dmg * m.touchDmg) },
      summon: A.boss.summon ? { ...A.boss.summon, every: A.boss.summon.every / (m.eliteSummonRate ?? 1) } : null,
      shoot: A.boss.shoot ? { ...A.boss.shoot, every: A.boss.shoot.every / m.eliteFireRate } : null,
    },
  } : null;
  const run = {
    stageId: stage.id, stageVersion: stage.version ?? 1, title: stage.title ?? '', length: stage.length, eliteZ: stage.eliteZ ?? null, bg: stage.bg ?? 1,
    difficulty: diff, enemyDefs: enemyDefsFor(diff, stage.enemyHpMul ?? 1, stage.difficultyHp ?? true),
    //  r3.31 표 체력(배수 전) — 스폰 크기(sizeByHp)의 기준. stepRun 이후 소스는 BAL3.enemies 를 읽지 않으므로(DIFF-6) 생성 시점에 싣는다
    hpBase: HP_BASE,
    //  r3.27 보스 페이즈 적용 여부(stage.bossPhases — 합성 스테이지는 켬)
    bossPhases: stage.bossPhases ?? true,
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
    //  elites = 정예 정의 배열(진실) · elite = 첫 원소 별칭(종전 읽기용) · eliteSpawned = 전원 같은 STEP 에 등장 · bossDefeated = 전원 격파
    elites, elite: elites[0] ?? null, eliteSpawned: false, bossDefeated: false,
    events: [],
    enemies: [], nextEnemyId: 1,
    eshots: [],
    //  bosses = 살아 있는 보스와 죽은 보스(dead·reaped) 전부(index 고정 — HUD 칸·이벤트 index 가 흔들리지 않는다). makeBoss 가 만든다.
    //  boss = **살아 있는 첫 보스(index 순)의 별칭**, 없으면 null. 갱신은 spawnDue(등장 직후)·cleanup(매 STEP 끝) 두 곳뿐 —
    //   그 사이 단계(5~9)는 bosses 를 !dead 로 순회하므로 별칭의 STEP 중간 값은 아무도 읽지 않는다. 셸·HUD·봇·2단계(z 정지)는 STEP 경계에서만 읽는다
    bosses: [], boss: null,
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
    //   'arena'(r3.17) = 광장 보스전(spawnDue 의 enterArena 가 main → arena 로 세운다. run.z 정지·상하 조향·자동 조준). 아레나 뒤 보너스는 verdict 승리에서 같은 경로
    phase: 'main', bonusDef: stage.bonus ?? null, bonus: null, bonusTargets: [], mainResult: null,
    //  아레나(r3.17): ay/tay = 부대 중심 세로 오프셋·목표(LINE_Y 기준, 광장 밖에서는 항상 0). arena = 설정 사본(위) | null. lossByShock = 착지 충격 손실 집계(hurt cause 'shock')
    ay: 0, tay: 0, arena, lossByShock: 0,
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
  //  2단계 전진: 보스전·광장(r3.17)에서는 멈춘다(아레나 보스가 run.boss 라 종전 조건만으로도 멈추지만 뜻을 드러내기 위해 명시)
  if (!run.boss && !inArena(run)) run.z += BAL3.scroll * dt;
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
//  아레나(r3.17): 광장 안에서만 dragDy·keyDirY 로 세로 목표 tay 를 옮기고 ay 가 같은 추종·상한(축별 독립)으로 따라간다. depth 로 클램프.
//   광장 밖에서는 dragDy·keyDirY 를 **읽지 않는다**(회귀 없음). x 범위는 squadOpts 로 광장 폭(40~440 → 중심 100~380)까지 넓어진다
function steer(run, inp, dt) {
  const px = inp.pointerX;
  //  pointerX 가 null 이면 tx 를 덮어쓰지 않는다(키·드래그로 옮긴 목표가 옛 마우스 위치로 되돌아가지 않게 — 계약서 6장 장치 우선순위)
  if (px !== null && px !== undefined && Number.isFinite(px)) run.tx = px;
  run.tx += Number.isFinite(inp.dragDx) ? inp.dragDx : 0;
  run.tx += (inp.keyDir || 0) * SQ.keySpeed * dt;
  const want = (run.tx - run.x) * (1 - Math.exp(-SQ.followRate * dt));
  const cap = SQ.moveMax * dt;
  run.x += Math.max(-cap, Math.min(cap, want));
  if (inArena(run)) {
    const [d0, d1] = run.arena.depth;
    run.tay += Number.isFinite(inp.dragDy) ? inp.dragDy : 0;
    run.tay += (inp.keyDirY || 0) * SQ.keySpeed * dt;
    run.tay = clampNum(run.tay, d0, d1);
    const wantY = (run.tay - run.ay) * (1 - Math.exp(-SQ.followRate * dt));
    run.ay = clampNum(run.ay + Math.max(-cap, Math.min(cap, wantY)), d0, d1);
  }
  const c = clampCenter(run, run.walls, squadOpts(run));
  compressUnits(run.units, c.dxLo, c.dxHi);
}

// 3단계 스폰: ev.z <= z 인 이벤트를 커서 순서로 소비. 정예는 run.bosses(전원 스폰 z = run.z + 760, 별칭 run.boss = 첫 보스)
function spawnDue(run, ev) {
  const sp = run.spawns;
  while (run.spawnCursor < sp.length && sp[run.spawnCursor].z <= run.z) {
    const e = sp[run.spawnCursor++];
    for (let i = 0; i < e.n; i++) spawnEnemy(run, e.kind, e.xs[i], e.zs[i], e.hp, e.skin);
    ev.push({ type: 'spawn', kind: e.kind, n: e.n, x: e.xs[0], z: e.z });
  }
  //  정예(r3.16 복수 정예): 정의 배열 전원이 **같은 STEP** 에 등장(z 는 전원 run.z + spawnAhead, x 는 정의 x ?? 도로 중앙). 이벤트 elite 는 index 순으로 하나씩
  //   아레나(r3.17): 같은 발동 조건에서 광장 전환 + 아레나 보스 1체(enterArena)
  if (run.elites.length && !run.eliteSpawned && run.elites[0].z <= run.z) {
    run.eliteSpawned = true;
    if (run.arena) { enterArena(run, ev); return; }
    const total = run.elites.length;
    run.elites.forEach((d, i) => {
      const bo = makeBoss(run, d, i);
      run.bosses.push(bo);
      ev.push({ type: 'elite', id: bo.id, index: i, total, role: bo.role, x: bo.x, z: bo.z, hp: bo.hp });
    });
    run.boss = run.bosses[0];
  }
}

/** 보스 1체 생성(r3.16). 역할 표(ELITES.roles)가 사격·소환 유무, 정지 거리, 하강·순찰 속도 배수를 정하고 나머지 수치는 run.enemyDefs.elite 그대로.
 *  차선: 정의에 x 가 없으면 종전대로 도로 전체([x0+r, x1−r])를 왕복, 있으면 [x−patrol, x+patrol](patrol 기본 ELITES.laneHw, 0 = 제자리)을 도로 안으로 클램프.
 *  dir 은 index 짝수 1·홀수 −1(단수 = 종전 1). summon 은 역할 표가 null(elite)이면 정의 플래그를 따른다(종전과 같음).
 *  단수 정예(role 없음·x 없음)가 만드는 객체는 종전 객체에 필드 몇 개가 더 붙은 것이고 값은 같다. 아레나(다음 장치)도 이 함수로 만든 뒤 전용 필드를 덧붙인다 */
export function makeBoss(run, def, index) {
  const E = run.enemyDefs.elite;
  const role = def.role ?? 'elite';
  const rd = ELITES.roles[role];
  const r = E.r;
  const x = def.x ?? ROAD.center;
  const roadLo = ROAD.x0 + r, roadHi = ROAD.x1 - r;
  const patrol = def.patrol ?? ELITES.laneHw;
  const clampRoad = (v) => Math.max(roadLo, Math.min(roadHi, v));
  const laneLo = def.x == null ? roadLo : clampRoad(x - patrol);
  const laneHi = def.x == null ? roadHi : clampRoad(x + patrol);
  const z = run.z + E.spawnAhead;
  const bo = { id: 'b' + (index + 1), index, kind: 'elite', role, x, z, px: x, pz: z, hp: def.hp, max: def.hp, r,
               state: 'descend', dir: index % 2 === 0 ? 1 : -1, shootT: E.shootEvery, touchT: 0, spawnT: E.summonEvery,
               shoot: !!rd.shoot, summon: rd.summon == null ? !!def.summon : !!rd.summon,
               laneLo, laneHi, holdAhead: rd.holdAhead, descendSpeed: E.descendSpeed * rd.descendMul, patrolSpeed: E.patrolSpeed * rd.patrolMul,
               phase: 0, dead: false, reaped: false };
  if (def.skin) bo.skin = def.skin;
  return bo;
}

/** 광장 전환(r3.17 아레나, spawnDue 에서 1회). phase main → arena(단방향), ay/tay 0, 아레나 보스 = makeBoss(run, elites[0], 0) 에 전용 필드를 덧붙인 것을
 *  run.bosses 에 넣고 별칭 run.boss 갱신. 이벤트 arenaEnter 뒤 종전 elite { id, index 0, total 1, role, x, z, hp }(배너·BGM 결선 재사용).
 *  보스 전용 필드: arena true · state 'chase'|'warn'|'dash'|'recover' · dashT(다음 예고까지, 처음은 dash.first) · warnT · recoverT ·
 *   dashTx/dashTz(예고 시점의 부대 중심 = 돌진 목표) · dashUx/dashUz(돌진 단위벡터) · dashLeft(남은 돌진 px) · summon/shoot 는 아레나 설정의 유무 */
function enterArena(run, ev) {
  const A = run.arena, B = A.boss;
  run.phase = 'arena';
  run.ay = 0; run.tay = 0;
  ev.push({ type: 'arenaEnter', z: run.z, x: run.x, w: [A.w[0], A.w[1]], depth: [A.depth[0], A.depth[1]] });
  const bo = makeBoss(run, run.elites[0], 0);
  Object.assign(bo, {
    arena: true, r: B.r, x: ROAD.center, z: run.z + B.spawnAhead, state: 'chase', touchT: 0,
    dashT: B.dash.first, warnT: 0, recoverT: 0, dashTx: null, dashTz: null, dashUx: 0, dashUz: 0, dashLeft: 0,
    summon: !!B.summon, spawnT: B.summon ? B.summon.every : 0, shoot: !!B.shoot, shootT: B.shoot ? B.shoot.every : 0,
    //  보호막(r3.18 대항 검수 반영): 첫 착지 충격까지 피격 무효. 탄은 흡수(bossGuard)·폭발·연쇄 무효. arenaShock 의 첫 호출이 내린다(bossGuardOff)
    guard: !!B.guard,
  });
  if (B.skin) bo.skin = B.skin;
  bo.px = bo.x; bo.pz = bo.z;
  run.bosses.push(bo);
  ev.push({ type: 'elite', id: bo.id, index: 0, total: 1, role: bo.role, x: bo.x, z: bo.z, hp: bo.hp });
  run.boss = bo;
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

// 적 1기 생성. hp 는 스폰 정의값(stages.makeSpawn 이 구간·난이도 배율까지 박아 항상 명시) — 없으면(소환) run.enemyDefs 의 같은 배율 표.
//  hpMax(r3.21) = 스폰 시점 체력. render 가 '체력 3 이상인 적'에만 남은 체력 숫자를 그리는 기준(규칙은 읽지 않는다)
//  체력 비례 크기 배율(r3.31). baseHp = 표 체력(run.hpBase[kind]). 표 체력이 없는 종류(정예)는 1
export function sizeByHp(baseHp, hp, S = SIZE_BY_HP) {
  if (!baseHp || !(hp > baseHp)) return 1;
  return Math.min(S.cap, 1 + S.k * Math.log2(hp / baseHp));
}
function spawnEnemy(run, kind, x, z, hp, skin) {
  const d = run.enemyDefs[kind];
  const h = hp ?? d.hp;
  //  r3.31 크기 = 체력 비례(이사 지시 "체력이 올라간 적들은 비례해서 크기도 키워주자"): 표 체력(run.hpBase[kind]) 대비 배수 m 의 로그로 키운다.
  //   판정 반지름 r 도 같이 커진다(그림만 키우면 맞은 것처럼 보이는 탄이 빗나간다). 상한 BAL3.sizeByHp.cap
  const e = { id: run.nextEnemyId++, kind, x, z, px: x, pz: z, vz: d.vz, hp: h, hpMax: h, r: d.r * sizeByHp(run.hpBase ? run.hpBase[kind] : null, h), dead: false, touched: false };
  if (skin) e.skin = skin;
  if (kind === 'shooter') { e.shootT = d.shootEvery; e.aimT = 0; }
  run.enemies.push(e);
  return e;
}

// 4단계 유닛 사격: 각자 자기 위치(run.x + dx, squadZ - dy)에서 직진. 이벤트 fire {count} STEP당 1개
//  아레나(r3.17) 자동 조준: 광장에서 보스가 살아 있으면 유닛마다 부대→보스 각도(atan2, 0 = +z 정면)로 makeBullet(…, angle) — 부채꼴은 각도 오프셋을 진짜 회전으로 더한다
//   (도로의 tan 방식과 다름). 보스가 없으면(격파 직후 같은 STEP) 종전 직진
function fireUnits(run, ev, dt) {
  const mk = run.weaponMk || 1;
  const w = weaponStats(run.weapon, mk);
  const angles = fanAngles(w.id);
  const oz = squadZ(run);
  const aim = inArena(run) && run.boss && !run.boss.dead ? run.boss : null;
  let count = 0;
  for (const u of run.units) {
    u.fireT -= dt;
    while (u.fireT <= 0) {
      const ox = run.x + u.dx, uz = oz - u.dy;
      if (aim) {
        const base = Math.atan2(aim.x - ox, aim.z - uz);
        for (const a of angles) run.bullets.push(makeBullet(w.id, ox, uz, u.id, mk, 0, base + a));
      } else {
        //  부채꼴(산탄포): 각도마다 1발, vx = tan(각)·vz. 나머지 무기는 각도 [0] 한 발
        for (const a of angles) run.bullets.push(makeBullet(w.id, ox, uz, u.id, mk, a ? Math.tan(a) * w.vz : 0));
      }
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
    //  사거리(산탄포): range 를 넘긴 탄은 이번 STEP 에 닿는 것 없이 소멸. 조준탄(r3.17)은 직선 거리, 도로 탄은 종전대로 z 차이
    if (b.range != null && (b.aimed ? Math.hypot(b.z - b.z0, b.x - b.x0) : b.z - b.z0) > b.range) { b.dead = true; continue; }
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
      //  r3.30 확정 칸(열린 셔터 + 값이 상한)은 후보에서 뺀다 = 탄이 통과해 뒤의 적·통을 맞힌다
      for (const c of row.cells) if (!isGateCellFixed(row, c)) consider(sweepContactGate(row, c, b), 2, 2, row, c);
    }
    const halfW = b.w / 2;
    //  관통탄(저격총)이 이미 맞힌 적은 후보에서 뺀다(같은 적을 STEP 마다 다시 맞히지 않게)
    const hitAlready = (id) => !!(b.hit && b.hit.includes(id));
    for (const e of run.enemies) if (!e.dead && !hitAlready(e.id)) consider(circleContactZ(b, e.x, e.z, e.r + halfW), 3, 3, e, null);
    //  보스(r3.16 복수 정예): 살아 있는 전부가 후보. 같은 교차 z 면 배열 순(index 순)이 먼저 — 결정적. 관통탄은 보스마다 1회(id 'b1'…)
    for (const bo of run.bosses) if (!bo.dead && !hitAlready(bo.id)) consider(circleContactZ(b, bo.x, bo.z, bo.r + halfW), 3, 3, bo, null);
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
//  보호막(r3.18): guard 인 아레나 보스에 닿은 탄은 관통탄이라도 흡수되고(hp 불변·폭발/연쇄 없음) 이벤트 bossGuard 만 낸다 — 셔터·차폐와 같은 '흡수' 계열
function hitEnemy(run, e, b, ev) {
  if (e.guard) { b.dead = true; ev.push({ type: 'bossGuard', id: e.id, x: b.x, z: e.z }); return; }
  //  관통(저격총): 맞힌 적 id 를 기억하고, 맞힌 수가 pierce 미만이면 탄은 살아서 계속 간다(pierce 2 = 적 2체까지)
  if (b.pierce) { b.hit.push(e.id ?? 'boss'); if (b.hit.length >= b.pierce) b.dead = true; }
  else b.dead = true;
  e.hp -= b.dmg;
  ev.push({ type: 'enemyHit', id: e.id, kind: e.kind, hp: e.hp, x: e.x, z: e.z, ...hitLook(e), dmg: b.dmg, weapon: b.kind, bx: b.x });
  if (e.hp <= 0) e.dead = true;
  const w = WEAPONS[b.kind];
  if (w && w.stunSec) stun(e, w.stunSec, ev);
  if (w && w.blastR) blast(run, e, w.blastR, w.blastDmg, ev);
  if (w && w.chain) chainArc(run, e, w.chain, w.chainR, w.chainDmg, ev, w.stunSec);
}

// 연출용 겉모습(r3.24 손맛): 셸이 적 종류별 피격·사망 반응을 고르는 데 쓰는 필드만 이벤트에 **덧붙인다**(값 계산·판정 불변).
//  skin = 역할 그림(장갑체·카트 등) · r = 반지름 · hpMax = 스폰 체력(보스는 max) — 없으면 null
function hitLook(t) {
  return { skin: t.skin ?? null, r: t.r, hpMax: t.hpMax ?? t.max ?? null };
}

// 전격포 연쇄(r3.10): 직격한 적에서 chainR 안(원 겹침 기준)의 다른 !dead 적·보스 중 가까운 순 n 체에 dmg. 벽 너머 제외.
//  같은 거리면 id 순 — 결정성. 보스(r3.16 복수 정예)는 id 가 문자열('b1')이라 정렬 열쇠를 MAX_SAFE_INTEGER − index 로 둔다(적 뒤·index 순).
//  이벤트 arc {x,z,tx,tz} 는 연출 전용
//  전격 기절(r3.31): 일반 적만(보스 kind 'elite' 제외). 남은 시간은 긴 쪽으로 — 연속으로 맞으면 계속 묶인다
function stun(t, sec, ev) {
  if (!sec || t.kind === 'elite' || t.dead) return;
  const was = t.stunT > 0;
  t.stunT = Math.max(t.stunT || 0, sec);
  if (!was) ev.push({ type: 'stun', id: t.id, x: t.x, z: t.z, sec });
}
function chainArc(run, from, n, r, dmg, ev, stunSec = 0) {
  const pool = run.enemies.concat(run.bosses);
  const cand = [];
  for (const t of pool) {
    if (t === from || t.dead || t.guard) continue;
    const d = Math.hypot(t.x - from.x, t.z - from.z);
    if (d > r + t.r) continue;
    if (wallBetween(run.walls.concat(run.covers), from.x, from.z, t.x, t.z)) continue;
    cand.push({ t, d, id: t.kind === 'elite' ? Number.MAX_SAFE_INTEGER - t.index : t.id });
  }
  cand.sort((a, b) => a.d - b.d || a.id - b.id);
  for (const { t } of cand.slice(0, n)) {
    t.hp -= dmg;
    ev.push({ type: 'enemyHit', id: t.id, kind: t.kind, hp: t.hp, x: t.x, z: t.z, arc: true, ...hitLook(t), dmg, weapon: 'arc' });
    ev.push({ type: 'arc', x: from.x, z: from.z, tx: t.x, tz: t.z });
    if (t.hp <= 0) t.dead = true;
    else stun(t, stunSec, ev);
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
  const targets = run.enemies.concat(run.bosses);
  for (const t of targets) {
    if (t === center || t.dead || t.guard) continue;
    const d = Math.hypot(t.x - center.x, t.z - center.z);
    if (d > r + t.r) continue;
    if (wallBetween(run.walls.concat(run.covers), center.x, center.z, t.x, t.z)) continue;
    t.hp -= dmg;
    ev.push({ type: 'enemyHit', id: t.id, kind: t.kind, hp: t.hp, x: t.x, z: t.z, blast: true, ...hitLook(t), dmg, weapon: 'heavy' });
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

// 6단계 적 이동·행동(!dead 만). grunt 추종·rusher 가속·shooter 예고/발사·보스(전원) 하강/왕복/사격/소환
//  아레나(r3.17): chase 적(광장 소환)은 부대 중심 (run.x, squadZ) 로 d.vz 등속 양축 추격(직진 e.z −= vz 를 건너뛴다). 아레나 보스는 arenaBossAct
function moveEnemies(run, ev, dt) {
  for (const e of run.enemies) {
    if (e.dead) continue;
    const d = run.enemyDefs[e.kind];
    e.px = e.x; e.pz = e.z;
    //  기절(r3.31 전격): 이동·가속·저격 예고/발사 전부 멈춘다(타이머도 흐르지 않는다)
    if (e.stunT > 0) { e.stunT = Math.max(0, e.stunT - dt); continue; }
    if (e.chase) {
      const dx = run.x - e.x, dz = squadZ(run) - e.z, dist = Math.hypot(dx, dz), mv = d.vz * dt;
      if (dist > 1e-9) { const k = Math.min(1, mv / dist); e.x += dx * k; e.z += dz * k; }
      continue;
    }
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
  for (const bo of run.bosses) if (!bo.dead) { if (bo.arena) arenaBossAct(run, bo, ev, dt); else bossAct(run, bo, ev, dt); }
}

/** 아레나 보스 상태기계(r3.17, 전부 STEP 타이머·난수 0). 목표 = 부대 중심 (run.x, squadZ).
 *   chase   : 목표로 speed 등속(도착하면 정지). dashT −= dt ≤ 0 → 목표 지점 = 부대 중심 **지금 위치**(dashTx/dashTz), warn, 이벤트 bossDashWarn
 *   warn    : 정지. warnT −= dt ≤ 0 → 단위벡터·dashLeft = min(거리, dash.range), dash, 이벤트 bossDash
 *   dash    : min(dashLeft, dash.speed·dt) 만큼 직선 전진. 0 이 되면 착지 충격(arenaShock) → recover
 *   recover : recoverT −= dt ≤ 0 → chase, dashT = dash.every
 *  모든 상태에서 x 는 [w0+r, w1−r]·z 는 run.z + bossZ 로 클램프(목표가 그 안이라 돌진 착지점은 바뀌지 않는다), summon·shoot 타이머는 상태와 무관하게 돈다.
 *  소환 적은 e.chase = true(양축 추격), x 는 bo.x + 균등 오프셋(n 2 = ±dx, n 3 = −dx/0/+dx)을 광장 안으로 클램프. 사격은 fireAt(360° 지원) 재사용 */
function arenaBossAct(run, bo, ev, dt) {
  const A = run.arena, B = A.boss, D = B.dash;
  const ph = updateBossPhase(run, bo, ev);   // r3.27 페이즈: 추격이 빨라지고 돌진 간격이 줄어든다
  bo.px = bo.x; bo.pz = bo.z;
  const tx = run.x, tz = squadZ(run);
  if (bo.state === 'chase') {
    const dx = tx - bo.x, dz = tz - bo.z, dist = Math.hypot(dx, dz), mv = B.speed * ph.speed * dt;
    if (dist > 1e-9) { const k = Math.min(1, mv / dist); bo.x += dx * k; bo.z += dz * k; }
    bo.dashT -= dt;
    if (bo.dashT <= 0) {
      bo.state = 'warn'; bo.warnT = D.warn; bo.dashTx = tx; bo.dashTz = tz;
      ev.push({ type: 'bossDashWarn', x: bo.x, z: bo.z, tx, tz, warn: D.warn });
    }
  } else if (bo.state === 'warn') {
    bo.warnT -= dt;
    if (bo.warnT <= 0) {
      const dx = bo.dashTx - bo.x, dz = bo.dashTz - bo.z, dist = Math.hypot(dx, dz);
      bo.dashUx = dist > 1e-9 ? dx / dist : 0; bo.dashUz = dist > 1e-9 ? dz / dist : 0;
      bo.dashLeft = Math.min(dist, D.range);
      bo.state = 'dash';
      ev.push({ type: 'bossDash', x: bo.x, z: bo.z, tx: bo.dashTx, tz: bo.dashTz, range: bo.dashLeft });
    }
  } else if (bo.state === 'dash') {
    const mv = Math.min(bo.dashLeft, D.speed * dt);
    bo.x += bo.dashUx * mv; bo.z += bo.dashUz * mv; bo.dashLeft -= mv;
    if (bo.dashLeft <= 1e-9) { bo.dashLeft = 0; arenaShock(run, bo, ev); bo.state = 'recover'; bo.recoverT = D.recover; }
  } else {
    bo.recoverT -= dt;
    if (bo.recoverT <= 0) { bo.state = 'chase'; bo.dashT = D.every * ph.dashEvery; }
  }
  bo.x = clampNum(bo.x, A.w[0] + bo.r, A.w[1] - bo.r);
  bo.z = clampNum(bo.z, run.z + A.bossZ[0], run.z + A.bossZ[1]);
  if (bo.summon) {
    const SM = B.summon;
    bo.spawnT -= dt;
    if (bo.spawnT <= 0) {
      bo.spawnT += SM.every * ph.rate;
      const r = run.enemyDefs[SM.kind].r;
      for (let k = 0; k < SM.n; k++) {
        const off = SM.n > 1 ? (k / (SM.n - 1) * 2 - 1) * SM.dx : 0;
        const e = spawnEnemy(run, SM.kind, clampNum(bo.x + off, A.w[0] + r, A.w[1] - r), bo.z + SM.dz);
        e.chase = true;
      }
      ev.push({ type: 'summon', kind: SM.kind, n: SM.n, x: bo.x, z: bo.z + SM.dz });
    }
  }
  if (bo.shoot) {
    const SH = B.shoot;
    bo.shootT -= dt;
    if (bo.shootT <= 0) {
      bo.shootT += SH.every * ph.rate;
      fireAt(run, bo.x, bo.z, tx, tz, run.enemyDefs.elite.shot, SH.fan, SH.fanDeg * DEG, ev);
    }
  }
}

//  착지 충격(r3.17): 충격 원(bo.x, bo.z, shock.r)과 겹치는 유닛 전부 hp −dmg(cause 'shock'). 이벤트 bossShock { x, z, r, hits }
//  r3.18: 첫 충격 STEP 에 보호막 해제(bossShock 뒤 bossGuardOff 1회) — 그 STEP 의 탄(5단계)은 이미 흡수됐고 다음 STEP 부터 맞는다
function arenaShock(run, bo, ev) {
  const S = run.arena.boss.shock;
  const hits = overlappingUnits(run.units, bo.x, bo.z, S.r, null, squadOrigin(run));
  for (const u of hits) damageUnit(run, u, S.dmg, 'shock', ev, bo.x, bo.z);
  ev.push({ type: 'bossShock', x: bo.x, z: bo.z, r: S.r, hits: hits.length });
  if (bo.guard) { bo.guard = false; ev.push({ type: 'bossGuardOff', id: bo.id, x: bo.x, z: bo.z }); }
}

// 저격수: shootEvery 주기로 예고(aim) 시작, aimTime 뒤 발사 시점의 (run.x, run.z)를 조준해 1발. 부대 줄을 지나면 쏘지 않는다
function shooterAct(run, e, d, ev, dt) {
  if (e.z <= run.z) return;
  e.shootT -= dt;
  if (e.aimT > 0) {
    e.aimT -= dt;
    if (e.aimT <= 0) { e.aimT = 0; fireAt(run, e.x, e.z, run.x, squadZ(run), d.shot, 1, 0, ev); }
  }
  if (e.shootT <= 0) {
    e.shootT += d.shootEvery;
    e.aimT = d.aimTime;
    ev.push({ type: 'aim', id: e.id, x: e.x, z: e.z });
  }
}

// 정예: descend(descendSpeed, run.z + holdAhead 까지) → hold(차선 [laneLo, laneHi] 안에서 patrolSpeed 로 왕복). shoot 이면 shootEvery 마다 부채꼴 3발,
//  summon 이면 summonEvery 마다 잡졸 2 소환. 정지 거리·속도·차선·행동 유무는 보스 객체(makeBoss 가 역할 표에서 채운 것)에서 읽는다 —
//  단수 정예는 종전 값(150/s · 420 · 60/s · 도로 전체 · 사격 + 정의 summon)과 같다. shoot 이 없는 보스는 shootT 를 건드리지 않는다(결정적)
//  보스 페이즈(r3.27): 남은 체력 비율로 단계를 정하고, 올라간 STEP 에 이벤트 bossPhase 를 한 번 낸다(셸이 연출).
//   단계는 되돌아가지 않는다(bo.phase 는 최댓값 유지 — 회복이 없으므로 실제로도 내려갈 일은 없다).
//   보스 종류에 상관없이 이 한 곳에서만 계산한다 — 도로 정예와 아레나 보스가 서로 다른 기준을 갖지 않게
export function bossPhaseOf(hp, max, P = BAL3.bossPhases) {
  const ratio = max > 0 ? hp / max : 1;
  let p = 0;
  for (const at of P.at) if (ratio <= at) p++;
  return p;
}
function updateBossPhase(run, bo, ev) {
  const P = BAL3.bossPhases;
  if (run.bossPhases === false) return { rate: 1, speed: 1, dashEvery: 1 };
  const p = Math.max(bo.phase ?? 0, bossPhaseOf(bo.hp, bo.max, P));
  if (p !== (bo.phase ?? 0)) {
    bo.phase = p;
    ev.push({ type: 'bossPhase', id: bo.id, phase: p, x: bo.x, z: bo.z, skin: bo.skin ?? null, r: bo.r });
  }
  return { rate: P.rate[p] ?? 1, speed: P.speed[p] ?? 1, dashEvery: P.dashEvery[p] ?? 1 };
}

function bossAct(run, bo, ev, dt) {
  const E = run.enemyDefs.elite;
  const ph = updateBossPhase(run, bo, ev);
  bo.px = bo.x; bo.pz = bo.z;
  if (bo.state === 'descend') {
    bo.z -= bo.descendSpeed * dt;
    if (bo.z <= run.z + bo.holdAhead) { bo.z = run.z + bo.holdAhead; bo.state = 'hold'; }
  } else {
    bo.x += bo.dir * bo.patrolSpeed * ph.speed * dt;
    if (bo.x <= bo.laneLo) { bo.x = bo.laneLo; bo.dir = 1; } else if (bo.x >= bo.laneHi) { bo.x = bo.laneHi; bo.dir = -1; }
  }
  if (bo.shoot) {
    bo.shootT -= dt;
    if (bo.shootT <= 0) {
      bo.shootT += E.shootEvery * ph.rate;
      fireAt(run, bo.x, bo.z, run.x, run.z, E.shot, E.fan, E.fanDeg * DEG, ev);
    }
  }
  if (bo.summon) {
    bo.spawnT -= dt;
    if (bo.spawnT <= 0) {
      bo.spawnT += E.summonEvery * ph.rate;
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
    else if (cause === 'shock') run.lossByShock++;   // r3.17 아레나 착지 충격 — 접촉 손실과 따로 센다
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
    const u = hitUnit(run.units, s.x, s.z, s.r, { x: s.px, z: s.pz }, squadOrigin(run));
    if (u) { s.dead = true; damageUnit(run, u, s.dmg, 'shot', ev, s.x, s.z); }
  }
}

// 8단계 접촉: 잡졸·돌격체 스윕 vs 유닛 원 → 겹친 유닛 중 앞줄 1명, 적 소모(touched, kills 제외). 보스는 0.5s 타이머 접촉
function contacts(run, ev, dt) {
  for (const e of run.enemies) {
    if (e.dead) continue;
    const d = run.enemyDefs[e.kind];
    if (!d.touchDmg) continue;
    const hits = overlappingUnits(run.units, e.x, e.z, e.r, { x: e.px, z: e.pz }, squadOrigin(run));
    if (!hits.length) continue;
    const u = frontmostUnit(hits);
    e.touched = true; e.dead = true;
    damageUnit(run, u, d.touchDmg, 'touch', ev, e.x, e.z);
    ev.push({ type: 'touch', id: e.id, kind: e.kind, x: e.x, z: e.z, skin: e.skin ?? null, r: e.r });
  }
  const E = run.enemyDefs.elite;
  for (const bo of run.bosses) {
    if (bo.dead) continue;
    //  아레나 보스(r3.17)는 접촉 상수를 아레나 설정에서(돌진 경로에 선 유닛도 이 타이머 접촉으로 맞는다). 도로 정예는 종전 표
    const T = bo.arena ? run.arena.boss : E;
    bo.touchT = Math.max(0, bo.touchT - dt);
    if (bo.touchT <= 0) {
      const hits = overlappingUnits(run.units, bo.x, bo.z, bo.r, null, squadOrigin(run));
      if (hits.length) {
        bo.touchT = T.touchEvery;
        damageUnit(run, frontmostUnit(hits), T.touchDmg, 'boss', ev, bo.x, bo.z);
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
    else { lost++; ev.push({ type: 'unitLost', id: u.id, x: run.x + u.dx, z: squadZ(run) - u.dy }); }
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
  //  광장(r3.17)에서도 같은 폭(squadOpts)을 쓴다 — 여기서 빼먹으면 매 STEP 도로 폭(80~400)으로 되돌아간다
  const c = clampCenter(run, run.walls, squadOpts(run));
  compressUnits(run.units, c.dxLo, c.dxHi);
}

// 10단계 정리: dead 적 중 !touched 는 kills(이벤트 kill), 보스 사망 bossKill·bossesLeft(마지막 보스면 남은 적·적탄 소거 = 정예 격파 즉시 승리), 범위 밖 정리, peak
function cleanup(run, ev) {
  const behind = run.z - BAL3.cull.enemyBehind, ahead = run.z + LINE_Y + BAL3.cull.bulletAhead;
  run.enemies = run.enemies.filter((e) => {
    if (e.dead) {
      if (!e.touched) { run.kills++; ev.push({ type: 'kill', id: e.id, kind: e.kind, x: e.x, z: e.z, skin: e.skin ?? null, r: e.r }); }
      return false;
    }
    return e.z >= behind;
  });
  //  보스(r3.16 복수 정예): 이번 STEP 에 죽은 보스마다 kills+1·bossKill·bossesLeft(left = 이 처치 뒤 남은 수, 같은 STEP 에 둘이 죽어도 1 → 0 단조).
  //   죽은 보스는 배열에 남긴다(dead·reaped — index 고정). 별칭 boss 는 살아 있는 첫 보스로 옮기고,
  //   **남은 적·적탄 소거(정예 격파 즉시 승리)는 마지막 보스가 죽을 때만** — 소환형을 먼저 잡으면 그가 낳은 잡졸은 남아서 처리해야 한다(순서 선택의 결과).
  //   단수 정예는 종전과 같은 한 번의 경로(kills+1·bossKill·소거·별칭 null)
  const total = run.bosses.length;
  for (const bo of run.bosses) {
    if (!bo.dead || bo.reaped) continue;
    bo.reaped = true;
    run.kills++;
    const left = run.bosses.filter((b) => !b.reaped).length;
    ev.push({ type: 'bossKill', id: bo.id, index: bo.index, role: bo.role, left, total, x: bo.x, z: bo.z, r: bo.r, skin: bo.skin ?? null });
    ev.push({ type: 'bossesLeft', left, total, index: bo.index });
  }
  run.boss = run.bosses.find((b) => !b.dead) ?? null;
  if (total && !run.boss && !run.bossDefeated) {
    run.bossDefeated = true;
    run.enemies.length = 0;
    run.eshots.length = 0;
  }
  //  탄 정리(r3.17): 아래·옆으로 조준된 탄이 영원히 남지 않게 behind·x 범위를 더한다. 도로 탄은 출발 z ≥ run.z − 159 에서 +z 로만 가고
  //   카메라 3.2px/STEP < 최저 탄속 8.7px/STEP 이라 behind 에 결코 걸리지 않고, 산탄포 x 드리프트(±104)도 −40~520 안이다. 위로 나는 적탄(광장 사격)도 ahead 로 정리
  run.bullets = run.bullets.filter((b) => !b.dead && b.z <= ahead && b.z >= behind && b.x > -40 && b.x < 520);
  //   ⚠️적탄의 ahead 정리는 **위로 나는 탄(vz < 0)** 에만 — 도로 저격수는 화면 밖 위(z ≤ run.z + 760)에서 아래로 쏘므로 종전 조건 그대로 둬야 한다
  run.eshots = run.eshots.filter((s) => !s.dead && s.z >= behind && (s.vz >= 0 || s.z <= ahead) && s.x > -40 && s.x < 520);
  if (run.units.length > run.peak) run.peak = run.units.length;
}

// 11단계 승패: 승리 우선. 정예 스테이지 = 정예 격파 && 적 없음, 아니면 z >= length && 적 없음. 패배 = 유닛 0
//  r3.15: 승리는 여기서 **확정**(won·wonAt·mainResult·win 이벤트). over 는 보너스가 없을 때만 여기서 — 있으면 startBonus 로 넘어가고
//   bonusEnd(시간 소진)가 over 를 세운다. 보너스를 다 못 깼다고 이미 확정한 승리·기록(mainResult)은 되돌리지 않는다
function verdict(run, ev) {
  const noEnemies = run.enemies.length === 0;
  const win = run.elites.length ? (run.bossDefeated && noEnemies) : (run.z >= run.length && noEnemies);
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
