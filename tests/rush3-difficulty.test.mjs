// rush3-difficulty — 난이도 선택(계약서 3-8) V3-DIFF + V3-SIM-DIFF.
//  V3-DIFF: 배수 표가 적 hp·적탄·접촉·정예·스폰 수에 정확히 반영되고, normal 은 종전과 완전히 같다(기존 검사 174건은 그대로 통과).
//  V3-SIM-DIFF: 봇 정책 결과표(난이도 × 스테이지 × aim/center/plan). **봇 결과이지 사람의 성공률이 아니다.**
//  SD-7: 위 결과표와 별개로 '성공 경로가 존재하는가'만 보는 검사(planBoss 봇 · 2차 검수 §4 Q3).
//  r4.2(2026-09-25, 이사 지시 "보통, 어려움, 지옥으로 난이도 구성된 것들 삭제하고" · 결정 D2′ 지옥 값 그대로) = **두 줄 표**:
//   'normal'(검사용 배수 1 줄 = 옛 보통, 규칙 기본값) · 'brutal'(기본 줄 = 옛 지옥, 게임 화면이 늘 쓴다). 옛 '어려움'(hard) 줄은 지웠다.
//   그래서 이 파일은 어려움 칸만 뺐다 — 어려움만 보던 SD-2 는 삭제, 세 칸 비교(SD-5 등)는 두 칸 비교, SD-7 의 어려움 단언 삭제. 나머지 기대값은 그대로다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAL3, DIFFICULTY_IDS, DEFAULT_DIFFICULTY, PLAY_DIFFICULTY, difficultyMult } from '../rush3/balance.js';
import { buildStage, STAGE_IDS, DEFS } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, enemyDefsFor, STEP } from '../rush3/combat.js';
import { playPolicy } from './lib/rush3-policies.mjs';

const DIFFS = ['normal', 'brutal'];

//  합성 스테이지(게이트·통·벽 없음). spawns 의 hp 는 ev.hp(스폰 정의 고정값) 경로
function synth(over = {}) {
  return { id: 'd', version: 2, title: 'diff', startUnits: 5, startWeapon: 'rifle', length: 100000, eliteZ: null,
           gateRows: [], supplies: [], walls: [], spawns: [], elite: null, ...over };
}
function play(run, sec, x = 240) {
  const ev = [];
  for (let i = 0; i < Math.round(sec / STEP) && !run.over; i++) {
    stepRun(run, { pointerX: x, dragDx: 0, keyDir: 0 }, STEP);
    ev.push(...drainEvents(run));
  }
  return ev;
}

// ─────────────────────────────────────────────────────────────────────────────
// V3-DIFF
// ─────────────────────────────────────────────────────────────────────────────
test('V3-DIFF DIFF-1: 배수 표 = 계약서 3-8 표 그대로(r4.2 두 줄 표: 배수 1 줄 normal · 기본 줄 brutal 2/1.5 — 수치 불변) · id 목록 순서 · 규칙 기본 = normal · 셸 출격 = brutal · 지운 hard·모르는 id 는 throw', () => {
  assert.deepEqual(DIFFICULTY_IDS, DIFFS, 'r4.2: 어려움 줄을 지워 두 줄만');
  assert.equal(DEFAULT_DIFFICULTY, 'normal', '규칙 모듈 기본값 = 검사용 배수 1 줄(그대로)');
  assert.equal(PLAY_DIFFICULTY, 'brutal', '게임 화면이 늘 넘기는 줄 = 기본 줄(옛 지옥)');
  const pick = (m) => [m.enemyHp, m.eshotDmg, m.touchDmg, m.eliteHp, m.spawnCount, m.eliteFireRate, m.waves, m.waveGap, m.eliteSummonRate];
  assert.deepEqual(pick(BAL3.difficulty.normal), [1, 1, 1, 1, 1, 1, 1, 0, 1]);
  assert.deepEqual(pick(BAL3.difficulty.brutal), [2, 3, 3, 1.5, 1.8, 1.5, 2, 360, 2]);
  //  r3.22 추가 배치(extraSpawns — 옛 이름 brutalSpawns)는 기본 줄에서만 붙는다
  assert.deepEqual(DIFFS.map((d) => BAL3.difficulty[d].extraSpawns), [false, true]);
  //  r3.21(이사 결정 2026-09-20 B안): r3.9 의 '체력 배수 1 고정'을 뒤집었다 — 체력 배수는 기본 줄이 배수 1 줄보다 크다
  for (let i = 1; i < DIFFS.length; i++) {
    assert.ok(BAL3.difficulty[DIFFS[i]].enemyHp > BAL3.difficulty[DIFFS[i - 1]].enemyHp, DIFFS[i] + ' enemyHp 단조 증가');
    assert.ok(BAL3.difficulty[DIFFS[i]].eliteHp > BAL3.difficulty[DIFFS[i - 1]].eliteHp, DIFFS[i] + ' eliteHp 단조 증가');
  }
  //  r4.2: 화면 이름(label·short)은 어디에도 표시하지 않아 표에서 지웠다
  for (const d of DIFFS) assert.ok(!('label' in BAL3.difficulty[d]) && !('short' in BAL3.difficulty[d]), d + ' 화면 이름 없음');
  assert.ok(Object.isFrozen(BAL3.difficulty) && Object.isFrozen(BAL3.difficulty.brutal));
  assert.equal(difficultyMult('brutal'), BAL3.difficulty.brutal);
  assert.equal(BAL3.difficulty.hard, undefined, '어려움 줄 없음');
  assert.throws(() => difficultyMult('hard'), /unknown difficulty/, '지운 어려움 id 는 throw');
  assert.throws(() => buildStage(2, { difficulty: 'hard' }), /unknown difficulty/);
  assert.throws(() => difficultyMult('nope'), /unknown difficulty/);
  assert.throws(() => buildStage(1, { difficulty: 'nope' }), /unknown difficulty/);
  assert.throws(() => createRun(synth(), { difficulty: 'nope' }), /unknown difficulty/);
});

test('V3-DIFF DIFF-2: normal 은 종전과 완전히 같다 — buildStage(id) ≡ buildStage(id,{normal}), enemyDefs ≡ BAL3.enemies, run.difficulty=normal', () => {
  for (const id of STAGE_IDS) {
    const a = buildStage(id), b = buildStage(id, { difficulty: 'normal' });
    assert.deepEqual(a, b);
    assert.equal(a.difficulty, 'normal');
    assert.equal(createRun(a).difficulty, 'normal');
  }
  const en = enemyDefsFor('normal');
  for (const kind of Object.keys(BAL3.enemies)) assert.deepEqual(en[kind], BAL3.enemies[kind], kind + ' 은 배수 1 이면 원표와 같다');
  assert.deepEqual(enemyDefsFor(), en, '인자 생략 = normal');
  //  성장 축은 난이도와 무관: 게이트·통·벽·시작 병력·무기·길이·armZ·coverZ 가 두 줄에서 deepEqual
  for (const id of STAGE_IDS) {
    const n = buildStage(id);
    for (const d of ['brutal']) {
      const s = buildStage(id, { difficulty: d });
      assert.equal(s.difficulty, d);
      assert.deepEqual([s.gateRows, s.supplies, s.walls, s.startUnits, s.startWeapon, s.length, s.eliteZ, s.version],
                       [n.gateRows, n.supplies, n.walls, n.startUnits, n.startWeapon, n.length, n.eliteZ, n.version], `S${id} ${d}: 성장 축 불변`);
    }
  }
  assert.deepEqual([BAL3.squad.unitHp, BAL3.gate.armZ], [2, 340], '병사 hp·armZ 는 표에 없다(손대지 않는다)');
});

test('V3-DIFF DIFF-3: enemyDefsFor — hp(반올림)·접촉·적탄 dmg·정예 발사 주기가 배수대로, 나머지 필드는 그대로', () => {
  const rows = { normal: enemyDefsFor('normal'), brutal: enemyDefsFor('brutal') };
  const hp = (k) => DIFFS.map((d) => rows[d][k].hp);
  const touch = (k) => DIFFS.map((d) => rows[d][k].touchDmg);
  //  r3.21 B안: 체력 = round(표 hp × enemyHp). hpMul(스테이지 구간 배율) 생략 = 1 — 그 경로는 V3-DIFFB 가 잠근다
  //  r4.2: 두 줄(배수 1 · 기본) — 옛 세 칸의 가운데(어려움) 값만 빠졌고 두 칸 값은 그대로다
  assert.deepEqual(hp('grunt'), [2, 4]);
  assert.deepEqual(hp('rusher'), [4, 8]);
  assert.deepEqual(hp('shooter'), [6, 12]);
  assert.deepEqual(DIFFS.map((d) => +rows[d].elite.summonEvery.toFixed(4)), [4, 2], '정예 소환 주기 ÷ eliteSummonRate');
  assert.deepEqual(touch('grunt'), [1, 3]);
  assert.deepEqual(touch('rusher'), [2, 6]);
  assert.deepEqual(touch('elite'), [3, 9]);
  assert.deepEqual(DIFFS.map((d) => rows[d].shooter.shot.dmg), [1, 3], '기본 줄은 적탄 1발 = 병사 1명 이상(hp 2)');
  assert.deepEqual(DIFFS.map((d) => rows[d].elite.shot.dmg), [1, 3]);
  assert.deepEqual(DIFFS.map((d) => +rows[d].elite.shootEvery.toFixed(4)), [1, 0.6667]);
  assert.deepEqual(DIFFS.map((d) => rows[d].shooter.shootEvery), [1.6, 1.6], '저격수 주기는 표에 없다(정예만)');
  for (const d of DIFFS) {
    const e = rows[d];
    assert.deepEqual([e.grunt.r, e.grunt.vz, e.grunt.track, e.rusher.accel, e.rusher.maxVz, e.shooter.aimTime, e.shooter.shot.vz, e.elite.fan, e.elite.fanDeg, e.elite.r, e.elite.summonN],
                     [14, 24, 0, 180, 290, 0.5, 260, 3, 18, 48, 2], d + ': 배수 대상이 아닌 필드는 그대로(vz 는 r3.27 에서 60 → 24 · 돌격체 가속/최대는 r3.31 에서 260/420 → 180/290, 난이도 배수 대상이 아님)');
    assert.ok(Object.isFrozen(e) && Object.isFrozen(e.elite) && Object.isFrozen(e.elite.shot));
  }
  assert.equal(rows.brutal.elite.hp, undefined, '정예 hp 는 스테이지 값(buildStage)이라 표에 없다');
});

test('V3-DIFF DIFF-4: buildStage — 1~3 기준 코스는 정예 hp·잡졸 hp 가 난이도와 무관(r3.21 대항 검수 반영: difficultyHp false = r3.9 와 같음)·rows 스폰 n(spawnCount 반올림)·xs 명시 스폰은 같은 xs 로 waves 번(waveGap 뒤) 반복', () => {
  //  r3.22: 1~3 은 지옥(기본 줄)에서만 × eliteHp(1.5) — 배수 1 줄은 r3.9 그대로
  assert.deepEqual(DIFFS.map((d) => STAGE_IDS.map((id) => buildStage(id, { difficulty: d }).elite.hp)),
                   [[120, 220, 500], [180, 330, 750]]);
  for (const id of STAGE_IDS) for (const d of DIFFS) assert.equal(buildStage(id, { difficulty: d }).difficultyHp, d === 'brutal', `S${id} ${d} difficultyHp`);
  //  4~24 는 여전히 × eliteHp(V3-DIFFB DB-2 가 전부 대조) — 여기서는 경계 표본만
  assert.deepEqual(DIFFS.map((d) => buildStage(4, { difficulty: d }).elite.hp), [160, 240]);
  //  rows 스폰은 S3 z8800 잡졸(n 18, rows 2) 하나뿐
  const rowsN = DIFFS.map((d) => buildStage(3, { difficulty: d }).spawns.find((s) => s.z === 8800 && s.kind === 'grunt').n);
  assert.deepEqual(rowsN, [18, 32]);   // 18×1.8 = 32.4 → 32
  for (const d of DIFFS) {
    const sp = buildStage(3, { difficulty: d }).spawns.find((s) => s.z === 8800 && s.kind === 'grunt');
    assert.equal(sp.xs.length, sp.n); assert.equal(sp.zs.length, sp.n);
    for (let i = 0; i < sp.n; i++) {
      assert.ok(sp.xs[i] >= 80 + 14 && sp.xs[i] <= 400 - 14, `${d} xs[${i}]=${sp.xs[i]} 도로 안`);
      assert.ok(sp.zs[i] >= 8800 + 760, `${d} zs[${i}] 화면 밖 위`);
    }
    //  rows 2 → 두 열(z 8800+760 / +800)에 나뉘고 앞 열이 ceil(n/2)
    const rowsZ = new Set(sp.zs.map((z) => Math.floor((z - 8800 - 760) / 40)));
    assert.deepEqual([...rowsZ].sort(), [0, 1], d + ' 두 열');
    assert.equal(sp.zs.filter((z) => z < 8800 + 760 + 40).length, Math.ceil(sp.n / 2), d + ' 앞 열 수');
  }
  //  xs 명시 스폰(회피 통로 규격의 대상): r3.9 — 첫 물결은 normal 과 좌표까지 같고, 그 뒤 waveGap 씩 뒤에 같은 xs 로 waves−1 번 더 들어온다.
  //  corridorHw·z(이벤트)·kind·hp 는 그대로(통로 규격 불변). hp: 1~3 은 구간 배율 1 + 난이도 체력 배수 미적용(difficultyHp false)이라 세 난이도 모두 표 hp
  for (const id of STAGE_IDS) {
    const base = buildStage(id).spawns.filter((s) => !(id === 3 && s.z === 8800 && s.kind === 'grunt'));
    for (const d of ['brutal']) {
      const m = BAL3.difficulty[d];
      //  r3.22 지옥 전용 추가 무리(DEFS[id].extraSpawns — r4.2 에서 brutalSpawns 이름만 바꿈)는 짝 비교에서 뺀다 — 이벤트 z·종류로 식별
      const extra = d === 'brutal' ? (DEFS[id].extraSpawns ?? []) : [];
      const isExtra = (x) => extra.some((e) => e.z === x.z && e.kind === x.kind);
      const s = buildStage(id, { difficulty: d }).spawns.filter((x) => !(id === 3 && x.z === 8800 && x.kind === 'grunt') && !isExtra(x));
      assert.equal(s.length, base.length, `S${id} ${d}: 무리 수 같음(지옥 전용 추가 무리 제외)`);
      assert.equal(buildStage(id, { difficulty: d }).spawns.filter(isExtra).length, extra.length, `S${id} ${d}: 지옥 전용 추가 무리 수`);
      for (let k = 0; k < base.length; k++) {
        const a = base[k], b = s[k];
        assert.deepEqual([b.z, b.kind, b.corridorHw], [a.z, a.kind, a.corridorHw], `S${id} ${d} 무리 ${k}: 이벤트 z·종류·통로 불변`);
        assert.equal(a.hp, BAL3.enemies[a.kind].hp, `S${id} normal 무리 ${k}: hp = 표 hp(구간 배율 1)`);
        assert.equal(b.hp, d === 'brutal' ? Math.round(a.hp * m.enemyHp) : a.hp, `S${id} ${d} 무리 ${k}: hp(1~3 은 지옥에서만 × enemyHp — r3.22)`);
        assert.equal(b.n, a.n * m.waves, `S${id} ${d} 무리 ${k}: n = 원래 n × waves`);
        const walls = buildStage(id, { difficulty: d }).walls;
        for (let w = 0; w < m.waves; w++) for (let i = 0; i < a.n; i++) {
          const z = b.zs[w * a.n + i];
          assert.equal(+(z - a.zs[i]).toFixed(2), w * m.waveGap, `S${id} ${d} 무리 ${k} 물결 ${w}: zs = 원래 + w×waveGap`);
          //  뒤 물결이 분리벽 z 구간에 걸리면 keepOutOfWalls 가 x 를 벽 밖으로 민다(규칙 그대로) — 그 경우만 등호 대신 '벽 밖·도로 안'을 본다
          const wall = walls.find((wl) => z >= wl.z0 && z <= wl.z1);
          if (!wall) assert.equal(b.xs[w * a.n + i], a.xs[i], `S${id} ${d} 무리 ${k} 물결 ${w}: xs 동일`);
          else {
            const x = b.xs[w * a.n + i], r = BAL3.enemies[a.kind].r;
            assert.ok(x <= wall.x0 - r + 0.01 || x >= wall.x1 + r - 0.01, `S${id} ${d} 무리 ${k} 물결 ${w}: 벽 밖`);
            assert.ok(x >= 80 + r && x <= 400 - r, `S${id} ${d} 무리 ${k} 물결 ${w}: 도로 안`);
          }
        }
      }
    }
  }
  //  buildStage 는 난이도별로도 호출마다 새 객체·결정적
  assert.deepEqual(buildStage(3, { difficulty: 'brutal' }), buildStage(3, { difficulty: 'brutal' }));
  assert.notEqual(buildStage(3, { difficulty: 'brutal' }).spawns, buildStage(3, { difficulty: 'brutal' }).spawns);
});

test('V3-DIFF DIFF-5: 실제 stepRun — 스폰된 잡졸 hp·돌격체 접촉 피해·저격수 적탄 피해·정예 발사 횟수가 배수대로 (createRun 의 난이도 덮어쓰기 경로)', () => {
  for (const d of DIFFS) {
    const m = BAL3.difficulty[d];
    //  잡졸 3기 스폰(ev.hp 없음 → enemyDefs 의 hp)
    const g = createRun(synth({ spawns: [{ z: 0, kind: 'grunt', n: 3, xs: [120, 240, 360], zs: [3000, 3000, 3000] }] }), { difficulty: d });
    assert.equal(g.difficulty, d);
    play(g, STEP);
    assert.deepEqual(g.enemies.map((e) => e.hp), Array(3).fill(Math.round(2 * m.enemyHp)), d + ' 잡졸 hp');
    //  ev.hp 가 명시된 스폰은 그 값 그대로(스테이지 정의 고정값 원칙)
    const gh = createRun(synth({ spawns: [{ z: 0, kind: 'grunt', n: 1, xs: [240], zs: [3000], hp: 7 }] }), { difficulty: d });
    play(gh, STEP);
    assert.equal(gh.enemies[0].hp, 7, d + ' ev.hp 명시는 배수와 무관');
    //  돌격체(hp 99999 로 안 죽게) 접촉 → hurt n = touchDmg
    const r = createRun(synth({ startUnits: 20, spawns: [{ z: 0, kind: 'rusher', n: 1, xs: [240], zs: [900], hp: 99999 }] }), { difficulty: d });
    const rev = play(r, 6);
    const touch = rev.find((e) => e.type === 'hurt' && e.cause === 'touch');
    assert.ok(touch, d + ' 돌격체 접촉이 났다');
    assert.equal(touch.n, Math.round(2 * m.touchDmg), d + ' 접촉 피해');
    //  저격수(hp 99999) 적탄 → hurt n = eshotDmg. 부대가 지나치기 전에 맞도록 멀리(z 1900) 둔다
    const s = createRun(synth({ startUnits: 20, spawns: [{ z: 0, kind: 'shooter', n: 1, xs: [240], zs: [1900], hp: 99999 }] }), { difficulty: d });
    const sev = play(s, 8);
    const shot = sev.find((e) => e.type === 'hurt' && e.cause === 'shot');
    assert.ok(shot, d + ' 저격수 탄이 맞았다');
    assert.equal(shot.n, Math.round(1 * m.eshotDmg), d + ' 적탄 피해(기본 줄은 1발 = 병사 1명 이상)');
    if (d !== 'normal') assert.ok(sev.some((e) => e.type === 'unitLost'), d + ' 적탄 1발에 병사 1명이 죽는다');
    //  정예(hp 100000) 부채꼴 발사 횟수: 6초 동안 floor(6 / shootEvery) 회(첫 발은 spawn 뒤 shootEvery 초)
    const b = createRun(synth({ startUnits: 30, elite: { z: 0, hp: 100000, summon: false } }), { difficulty: d });
    const bev = play(b, 6 + STEP / 2);
    const volleys = bev.filter((e) => e.type === 'eshot' && e.n === 3).length;
    assert.equal(volleys, Math.floor(6 / (1 / m.eliteFireRate) + 1e-9), d + ' 정예 발사 횟수');
    assert.equal(b.boss.max, 100000, '정예 hp 는 stage.elite.hp 그대로(배수는 buildStage 몫)');
  }
});

test('V3-DIFF DIFF-6: run.difficulty·run.enemyDefs 는 생성 시점에 확정되고 stepRun 소스에는 난이도 분기가 없다(V3-PURE 계열 정적 검사)', () => {
  const src = readFileSync(new URL('../rush3/combat.js', import.meta.url), 'utf8');
  const after = src.slice(src.indexOf('export function stepRun'));
  assert.ok(!/difficult/i.test(after), 'stepRun 이후 소스에 difficulty 참조가 없다');
  assert.ok(!/BAL3\.enemies|\bEN\[|\bEN\./.test(after), 'stepRun 이후에는 BAL3.enemies 를 직접 읽지 않는다(run.enemyDefs 만)');
  //  stage.difficulty 가 기본, opts.difficulty 가 덮어쓴다(r4.2: 두 줄 사이에서)
  assert.equal(createRun(buildStage(2, { difficulty: 'brutal' })).difficulty, 'brutal');
  assert.equal(createRun(buildStage(2, { difficulty: 'brutal' }), { difficulty: 'normal' }).difficulty, 'normal');
  assert.equal(createRun(synth()).difficulty, 'normal');
  assert.throws(() => createRun(synth(), { difficulty: 'hard' }), /unknown difficulty/, '지운 어려움 줄로 덮어쓸 수 없다');
  const run = createRun(buildStage(2, { difficulty: 'brutal' }));
  assert.ok(Object.isFrozen(run.enemyDefs));
  assert.deepEqual(run.enemyDefs, enemyDefsFor('brutal', 1, true), '1~3 기본 줄(지옥)은 difficultyHp true 로 만든 표(r3.22)');
  assert.deepEqual(createRun(buildStage(2, { difficulty: 'normal' })).enemyDefs, enemyDefsFor('normal', 1, false), '1~3 배수 1 줄은 종전 그대로 false');
  assert.deepEqual(createRun(buildStage(4, { difficulty: 'brutal' })).enemyDefs, enemyDefsFor('brutal', 2, true), '4~24 는 구간 배율 × enemyHp');
  //  같은 난이도·같은 입력열이면 결정적
  const pick = (r) => ({ z: r.z, x: r.x, units: r.units.map((u) => [u.id, u.hp]), kills: r.kills, time: r.time, weapon: r.weapon, peak: r.peak, won: r.won });
  assert.deepEqual(pick(playPolicy(2, 'aim', 14400, 'brutal').run), pick(playPolicy(2, 'aim', 14400, 'brutal').run));
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SIM-DIFF — 봇 결과표. 줄 2(r4.2 — 종전 난이도 3 에서 어려움을 뺐다) × 스테이지 3 × 정책(aim·center·plan) = 18판(각 판 상한 14,400 STEP).
//  ⚠️ 이 표는 **봇 정책의 결과**다. 사람의 성공률이 아니며 1판 결정적 시뮬이라 분포도 아니다.
//  실측(2026-09-16, 출발값 표): aim 은 normal S1~S3·hard S1·S3 완주, hard S2 와 brutal S1 은 정예전에서 전멸(코스는 끝까지 감).
//   hard S2 는 eliteHp 1.0·eliteFireRate 1.0 까지 내려도 aim 이 못 이긴다(정예 hp 56 잔존) — 원인은 적탄 dmg 2(1발 = 병사 1명) 와
//   옆으로 비키지 않는 봇의 조합(소총 21명 vs 정예 3발/초). 그래서 아래 검사는 그 두 판을 '기록'으로만 잡는다(보고서 §3).
// ─────────────────────────────────────────────────────────────────────────────
const SIM_POLICIES = ['aim', 'center', 'plan'];
const RUNS = {};
for (const d of DIFFS) for (const id of STAGE_IDS) for (const p of SIM_POLICIES) RUNS[d + ':' + id + ':' + p] = playPolicy(id, p, 14400, d);
const R = (d, id, p) => RUNS[d + ':' + id + ':' + p];
const row = (d, id, p) => {
  const r = R(d, id, p), run = r.run;
  return { difficulty: d, stage: id, policy: p, won: run.won, units: run.units.length, peak: run.peak, kills: run.kills, lossByShot: run.lossByShot, lossByTouch: run.lossByTouch,
           weapon: run.weapon, eliteReached: r.events.elite === 1, bossHpLeft: run.boss ? Math.ceil(run.boss.hp) : 0, time: +run.time.toFixed(1), steps: r.steps };
};
export const SIM_TABLE = [];
for (const d of DIFFS) for (const id of STAGE_IDS) for (const p of SIM_POLICIES) SIM_TABLE.push(row(d, id, p));

test('V3-SIM-DIFF SD-0: 18판(r4.2 — 종전 27판에서 어려움 9판을 뺐다) 전부 상한 안에서 끝난다 · 결과표 출력(봇 결과 — 사람 성공률 아님)', (t) => {
  assert.equal(SIM_TABLE.length, 18);
  for (const r of SIM_TABLE) {
    assert.equal(R(r.difficulty, r.stage, r.policy).run.over, true, `${r.difficulty} S${r.stage} ${r.policy} 가 끝나지 않음`);
    assert.ok(r.steps < 14400);
  }
  for (const r of SIM_TABLE) t.diagnostic('SIM-DIFF ' + JSON.stringify(r));
});

test('V3-SIM-DIFF SD-1: normal 은 종전 그대로 — aim 3스테이지 완주, center 는 S1 만 완주', () => {
  for (const id of STAGE_IDS) assert.equal(R('normal', id, 'aim').run.won, true, `normal S${id} aim`);
  assert.equal(R('normal', 1, 'center').run.won, true);
  assert.equal(R('normal', 2, 'center').run.won, false);
  assert.equal(R('normal', 3, 'center').run.won, false);
});

//  r4.2: SD-2(어려움 aim S1·S3 완주 · S2 정예전 기록)는 어려움 줄을 지워 삭제했다.

test('V3-SIM-DIFF SD-3: brutal — aim S1 은 정예까지 도달(정예전 결과는 기록), S2·S3 는 결과만 기록', () => {
  const s1 = R('brutal', 1, 'aim');
  assert.equal(s1.events.elite, 1, 'brutal S1 aim: 정예 등장까지 도달');
  if (!s1.run.won) assert.ok(s1.run.boss && s1.run.units.length === 0, 'brutal S1 aim: 지더라도 정예전에서만 진다');
  for (const id of [2, 3]) assert.equal(R('brutal', id, 'aim').run.over, true);
});

test('V3-SIM-DIFF SD-4: 무조작(center)은 brutal(기본 줄)에서 S2·S3 실패 유지(units 0 → over, won 아님) — r4.2 어려움 칸 제거', () => {
  for (const d of ['brutal']) for (const id of [2, 3]) {
    const run = R(d, id, 'center').run;
    assert.equal(run.over, true);
    assert.equal(run.won, false, `${d} S${id} center 가 완주됨`);
    assert.equal(run.units.length, 0);
  }
});

test('V3-SIM-DIFF SD-5: 두 줄의 순서가 결과에 실린다 — 같은 스테이지·같은 봇이면 생존 병력 배수 1(normal) ≥ 기본(brutal), 손실은 그 반대(r4.2: 종전 세 칸 비교에서 어려움을 뺐다)', () => {
  for (const id of STAGE_IDS) for (const p of ['aim', 'plan']) {
    const u = DIFFS.map((d) => R(d, id, p).run.units.length);
    assert.ok(u[0] >= u[1], `S${id} ${p} 생존 ${u.join(' ≥ ')}`);
    //  r3.22: '손실 수' 가 아니라 **손실 비율(손실 ÷ 최대 병력)** — 지옥은 병력이 덜 커져(게이트·통을 덜 얻고 일찍 전멸) 잃을 수 있는 수 자체가 작다
    const loss = DIFFS.map((d) => { const r = R(d, id, p).run; return r.peak ? (r.lossByShot + r.lossByTouch) / r.peak : 0; });
    assert.ok(loss[0] <= loss[1], `S${id} ${p} 손실 비율 ${loss.map((v) => v.toFixed(2)).join(' ≤ ')}`);
  }
  //  성장 축은 그대로: 같은 봇의 최고 병력(peak)은 기본 줄에서 늘지 않는다
  for (const id of STAGE_IDS) for (const p of SIM_POLICIES) {
    const pk = DIFFS.map((d) => R(d, id, p).run.peak);
    assert.ok(pk[1] <= pk[0], `S${id} ${p} peak ${pk.join('/')}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SIM-DIFF SD-7 — 성공 경로 검사. 위 18판 결과표(SD-0~SD-6)와 **목적이 다르다**.
//  SD-3 는 '정예까지 코스가 이어지는가'(도달)를 보고, 여기서는 '이길 수 있는 조작이 하나라도 있는가'를 본다.
//  봇 = planBoss: 보스 등장 전은 계획 봇 그대로, 보스가 나오면 보스 x 를 따라 조준한다(이동은 실제 STEP 속도 제한).
//  ⚠️ 이것은 **봇 1판의 결정적 결과**이지 사람의 성공률이 아니다. 탄 회피를 최적화한 봇도 아니다.
//  실측(2026-09-17): hard S1·S2·S3 와 brutal S1·S3 완주. brutal S2 만 실패(정예 hp 201 잔존) —
//   2차 검수도 "지옥 S2 는 단순 조준 변형으로 성공을 입증하지 못했다"고 적었다. 그래서 지옥 S2·S3 는 기록만 하고 잠그지 않는다.
//  r4.2(2026-09-25): 어려움 줄을 지워 어려움 S1~S3 완주·S2 4명·S3 70명 단언을 뺐다. 기본 줄(brutal)의 단언은 그대로 — 결정 D2′ 로 2번은 조정하지 않는다
// ─────────────────────────────────────────────────────────────────────────────
const BOSS_RUNS = {};
for (const d of ['brutal']) for (const id of STAGE_IDS) BOSS_RUNS[d + ':' + id] = playPolicy(id, 'planBoss', 14400, d);
const BR = (d, id) => BOSS_RUNS[d + ':' + id];
const bossRow = (d, id) => {
  const r = BR(d, id), run = r.run;
  return { difficulty: d, stage: id, policy: 'planBoss', won: run.won, units: run.units.length, peak: run.peak, kills: run.kills,
           lossByShot: run.lossByShot, lossByTouch: run.lossByTouch, weapon: run.weapon, eliteReached: r.events.elite === 1,
           bossHpLeft: run.boss ? Math.ceil(run.boss.hp) : 0, time: +run.time.toFixed(1), steps: r.steps };
};
export const BOSS_TABLE = [];
for (const d of ['brutal']) for (const id of STAGE_IDS) BOSS_TABLE.push(bossRow(d, id));

//  r3.21 1차 구현은 체력 배수(hard 1.5/1.25)를 1~3 에도 걸어 **hard S2 의 봇 성공 경로가 사라졌었다**(정예 잔여 163/275, 병력 최고 10 → SD-7 잠금에서 빼고 SD-8 기록으로 옮김).
//   대항 검수 반영(2026-09-20): 1~3 기준 코스는 구간 배율 ×1 과 같은 원칙으로 난이도 체력 배수도 ×1(BAL3.enemyHpByStage difficultyHp: false) →
//   세 난이도의 1~3 이 r3.9(33568b2)와 완전히 같아져 **hard S1·S2·S3 + brutal S1 잠금**을 되살렸다. 대조점도 r3.9 값(hard S2 4명 · brutal S1 14명) 그대로.
//  r4.2: 어려움 줄 삭제 — 남는 잠금은 기본 줄(brutal) 1번의 두 단언(planBoss 패배 · evLead 승리 26명)이다
test('V3-SIM-DIFF SD-7 성공 경로: 기본 줄(brutal) S1 — planBoss 는 지고 evLead 는 병력을 잃으며 26명으로 이긴다(봇 결과 — 사람 성공률 아님, r4.2 어려움 단언 삭제)', (t) => {
  for (const r of BOSS_TABLE) t.diagnostic('SIM-BOSS ' + JSON.stringify(r));
  //  r3.22 지옥 강화(이사 소감 2026-09-22 "지옥도 아직 너무 쉽다"): 지옥 S1 에 저격수·돌격체를 더해 단순 조준 봇(planBoss)은 더 못 이긴다.
  //   성공 경로는 게이트 칸을 예상 최종값으로 고르는 evLead 로 잠근다 — '이길 수 있는 조작이 존재한다' 는 뜻은 그대로다
  assert.equal(BR('brutal', 1).run.won, false, 'brutal S1 planBoss 는 이제 진다(지옥 강화 확인)');
  const b1 = playPolicy(1, 'evLead', 14400, 'brutal');
  assert.equal(b1.run.won, true, `brutal S1 evLead 미완주(정예 잔여 hp ${b1.run.boss ? Math.ceil(b1.run.boss.hp) : 0})`);
  assert.ok(b1.run.units.length > 0, 'brutal S1 evLead 생존 병력 0');
  assert.ok(b1.run.units.length < b1.run.peak, 'brutal S1 evLead 도 병력을 잃는다(무손실 승리 없음)');
  //  r3.30(확정 칸 통과): 상한에 닿은 게이트에 헛발로 흡수되던 탄이 뒤의 적을 맞히게 되어 21 → 24명(최대 29 그대로, 여전히 손실 있음)
  //  r3.31(적 크기 체력 비례·돌격체 감속·중화기 조정): 24 → 26명(최대 29 그대로, 여전히 손실 있음)
  assert.equal(b1.run.units.length, 26, 'brutal S1 evLead 생존 병력 = r3.31 실측 26명(최대 29명)');
});

test('V3-SIM-DIFF SD-8 기록: brutal S2·S3 는 실패를 허용하고 결과만 남긴다 — 다만 지더라도 정예전에서만 진다', (t) => {
  for (const id of [2, 3]) {
    const r = BR('brutal', id), run = r.run;
    assert.equal(run.over, true, `brutal S${id} planBoss 가 끝나지 않음`);
    assert.ok(r.steps < 14400);
    assert.equal(r.events.elite, 1, `brutal S${id} planBoss: 정예 등장까지 도달`);
    if (!run.won) assert.ok(run.boss && run.units.length === 0, `brutal S${id} planBoss: 지더라도 정예전에서만 진다`);
    t.diagnostic(`SIM-BOSS-RECORD brutal S${id} won=${run.won} units=${run.units.length} 정예잔여hp=${run.boss ? Math.ceil(run.boss.hp) : 0}`);
  }
  //  2026-09-20 재실측(r3.21 대항 검수 반영 = r3.9 와 같은 판): brutal S2 실패(정예 hp 1 잔존) · brutal S3 완주(66명). 완주 사실도 감추지 않고 기록한다.
  const b2 = BR('brutal', 2), b3 = BR('brutal', 3);
  t.diagnostic(`SIM-BOSS-RECORD 요약: brutal S2 ${b2.run.won ? '완주' : '실패'} · brutal S3 ${b3.run.won ? '완주' : '실패'}`);
});

test('V3-SIM-DIFF SD-9: planBoss 는 보스 등장 전까지 plan 과 완전히 같은 판이다(달라지는 지점은 정예전뿐)', () => {
  //  S1 normal 은 정예전에서도 둘 다 무손실이라 판 전체가 같아야 한다
  const pick = (r) => ({ z: r.z, peak: r.peak, weapon: r.weapon, won: r.won, units: r.units.length });
  assert.deepEqual(pick(playPolicy(1, 'planBoss', 14400, 'normal').run), pick(playPolicy(1, 'plan', 14400, 'normal').run));
  //  성장 축(최고 병력)은 정예전 조작으로 바뀌지 않는다 — 보스는 코스 끝에 나오기 때문(r4.2: 어려움 칸을 뺐다)
  for (const d of ['brutal']) for (const id of STAGE_IDS) {
    assert.equal(BR(d, id).run.peak, playPolicy(id, 'plan', 14400, d).run.peak, `${d} S${id}: peak 는 plan 과 같다`);
  }
  //  같은 입력열이면 결정적(r4.2: 종전 어려움 S2 → 기본 줄 S2)
  assert.equal(playPolicy(2, 'planBoss', 14400, 'brutal').run.units.length, BR('brutal', 2).run.units.length);
});
