# 스타포지 러시 핵심 루프 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라스트워식 게이트 러너(즉시 시작·좌우 이동·게이트 선택·부대 증식)를 기존 저장소 안의 독립 페이지 `rush.html`로 구현한다.

**Architecture:** 순수 로직 모듈(rng·게이트·트랙·부대·전투·저장·업그레이드·일일·연출 상태)을 Node 테스트로 잠그고, 그 위에 얇은 캔버스 셸(render/main)을 얹는다. 기존 네온함대 코드는 **일절 import 하지 않는다**(클린룸). 스프라이트는 매니페스트-폴백 구조라 그림이 없어도 도형 플레이스홀더로 완주 가능하다.

**Tech Stack:** 바닐라 JS ES 모듈, Canvas 2D, localStorage, node:test. 외부 의존성 0.

**Spec:** `E:\workspace\claude\neon-fleet\newmode\GPT기획_v1.md` + `E:\workspace\claude\neon-fleet\newmode\재미설계_v1.md` (충돌 시 재미설계가 우선)

## Global Constraints

- 화면 480×800 논리 좌표. 세로 러너. 아군은 아래(y≈640)에서 위를 향해 사격, 적은 위에서 아래로.
- HUD는 **병력 수·진행 바·보스 거리 3요소만**. 판 도중 새 UI 금지.
- 게이트 숫자·연산자는 이미지가 아니라 **Canvas 텍스트**로 그린다. `×3`·`÷2` 수학 기호 사용.
- 게이트 색 규칙: `+`=시안 `#35E5FF`, `×`=골드 `#F6C84A`, `−`=주황적 `#FF6A3D`, `÷`=마젠타 `#FF3DA5`.
- 승급 임계(병력 수): M1=1, M2=25, M3=75, M4=150, M5=300.
- 트랙 생성은 **시드형 RNG 필수**(오늘의 도전 = 날짜 시드, 일반 판 = 랜덤 시드).
- 오늘의 도전에서는 업그레이드 효과 **미적용**, 이어하기 **불가**.
- 이어하기는 판당 1회, 병력 10기 부활 + 2초 무적.
- 슬로모는 병력 ≤5 진입 순간 0.5초·배율 0.4, 판당 최대 2회.
- 업그레이드는 시작 병력·연사 속도·코인 자석 **3트랙에서 증식 금지**.
- 에너지·광고·과금 없음. 저장은 localStorage 키 `starforgeRush.v1` 하나.
- 기존 게임 파일(js/, tests/의 기존 파일) 수정 금지. ⚠️`scripts/build-crazygames-basic.mjs`(포털 빌드)에 rush 자산을 **추가하지 않는다** — 포털 50MB 한계와 무관하게 유지.
- 테스트는 `tests/rush-*.test.mjs` 명명으로 기존 러너(`node --test "tests/*.test.mjs"`)에 합류. DOM·canvas 사용 금지(순수 로직만).

## File Structure

```text
rush.html                 진입 페이지 (캔버스 + 모듈 로드)
rush/balance.js           모든 수치 (순수 데이터)
rush/rng.js               mulberry32 + 문자열 해시 + 날짜 시드
rush/gates.js             게이트 연산·쌍 생성
rush/track.js             시드 → 거리순 이벤트 목록(게이트쌍·적 웨이브·보스)
rush/squad.js             병력 수·승급 판정·쐐기 대형 좌표
rush/combat.js            적·탄 스텝, 충돌, 보스 (순수 함수)
rush/upgrades.js          3트랙 정의·비용·효과
rush/save.js              localStorage 래퍼(주입식 — 테스트는 가짜 storage)
rush/daily.js             날짜 키·첫판 2배·기록 복사 문구
rush/fx-state.js          신기록 감지·슬로모·이어하기 토큰 (순수 상태기계)
rush/sprites.js           스프라이트 로더 + 도형 플레이스홀더
rush/render.js            캔버스 그리기 전담
rush/main.js              상태기계(title/run/over/results/daily)·입력·rAF 루프
assets/rush/              게임용 스프라이트 (도착분만; 없어도 동작)
tools/rush-import-sprites.py   newmode\sprites → assets/rush 변환(배경 제거+축소)
tests/rush-core.test.mjs  rng·gates·track
tests/rush-sim.test.mjs   squad·combat·완주 시뮬레이션
tests/rush-meta.test.mjs  save·upgrades·daily·fx-state
```

---

### Task 1: rng + balance + gates

**Files:**
- Create: `rush/rng.js`, `rush/balance.js`, `rush/gates.js`
- Test: `tests/rush-core.test.mjs`

**Interfaces:**
- Produces: `mulberry32(seed:int)->()=>float`, `hashSeed(str)->int`, `dateSeed(d?:Date)->{key:'YYYY-MM-DD', seed:int}`
- Produces: `BAL` (아래 값 그대로), `GATE_OPS=['add','mul','sub','div']`, `applyGate(count:int, {op,value})->int`, `makeGatePair(rnd, t:0..1)->{left:{op,value},right:{op,value}}`, `gateColor(op)->str`, `isGood(op)->bool`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/rush-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashSeed, dateSeed } from '../rush/rng.js';
import { applyGate, makeGatePair, isGood, GATE_OPS } from '../rush/gates.js';
import { BAL } from '../rush/balance.js';

test('RNG-DET: 같은 시드는 같은 수열, 다른 시드는 다른 수열', () => {
  const a = mulberry32(123), b = mulberry32(123), c = mulberry32(124);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('RNG-DATE: 날짜 시드는 날짜에만 의존한다', () => {
  const d1 = dateSeed(new Date(2026, 8, 1, 3, 0)), d2 = dateSeed(new Date(2026, 8, 1, 23, 59));
  assert.equal(d1.key, '2026-09-01');
  assert.equal(d1.seed, d2.seed);
  assert.notEqual(d1.seed, dateSeed(new Date(2026, 8, 2)).seed);
  assert.equal(hashSeed('x'), hashSeed('x'));
});

test('GATE-APPLY: 사칙 적용·하한 0·나눗셈 올림', () => {
  assert.equal(applyGate(10, { op: 'add', value: 20 }), 30);
  assert.equal(applyGate(10, { op: 'mul', value: 3 }), 30);
  assert.equal(applyGate(10, { op: 'sub', value: 15 }), 0);   // 음수 금지
  assert.equal(applyGate(11, { op: 'div', value: 2 }), 6);    // ceil(11/2)
});

test('GATE-PAIR: 쌍은 항상 두 연산이 다르고 값이 양수·진행도에 따라 커진다', () => {
  const rnd = mulberry32(7);
  let early = 0, late = 0;
  for (let i = 0; i < 200; i++) {
    const p0 = makeGatePair(mulberry32(i), 0.05), p1 = makeGatePair(mulberry32(i), 0.95);
    for (const p of [p0, p1]) {
      assert.ok(GATE_OPS.includes(p.left.op) && GATE_OPS.includes(p.right.op));
      assert.ok(p.left.value > 0 && p.right.value > 0);
      assert.notEqual(isGood(p.left.op) + ':' + p.left.value, isGood(p.right.op) + ':' + p.right.value,
        '완전 동일 쌍 금지');
    }
    early += p0.left.value + p0.right.value; late += p1.left.value + p1.right.value;
  }
  assert.ok(late > early, '후반 게이트 값이 더 크다');
  void rnd;
});

test('BAL-SHAPE: 계획이 쓰는 키가 전부 있다', () => {
  for (const k of ['track', 'squad', 'tiers', 'gates', 'enemies', 'boss', 'coins', 'fx']) {
    assert.ok(BAL[k], 'BAL.' + k + ' 누락');
  }
  assert.deepEqual(BAL.tiers, [1, 25, 75, 150, 300]);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rush-core.test.mjs` → ERR_MODULE_NOT_FOUND 로 실패해야 정상

- [ ] **Step 3: 구현**

```js
// rush/rng.js — 시드형 RNG. ⚠️전역 Math.random 을 게임 로직에 쓰지 않는다(오늘의 도전 재현성).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(str) {           // FNV-1a
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function dateSeed(d = new Date()) {
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { key, seed: hashSeed('rush-daily-' + key) };
}
```

```js
// rush/balance.js — 스타포지 러시 수치 단일 진실. 로직 없음.
export const BAL = {
  track: { length: 2600, scrollSpeed: 190, gateEvery: 300, firstGateZ: 260, waveEvery: 150, bossZ: 2600 },
  squad: { y: 640, moveSpeed: 420, unitSpacingX: 22, unitSpacingY: 18, drawCap: 130, startCount: 1,
           fireInterval: 0.5, bulletSpeed: 560, bulletDmg: 1, touchLossPerHit: 1 },
  tiers: [1, 25, 75, 150, 300],          // M1~M5 병력 임계
  gates: {
    colors: { add: '#35E5FF', mul: '#F6C84A', sub: '#FF6A3D', div: '#FF3DA5' },
    // 진행도 t(0..1)에 따른 값 범위
    addMin: 4, addMax: 40, mulVals: [2, 3], subMin: 5, subMax: 60, divVals: [2, 3],
    width: 190, gap: 26, h: 64,
  },
  enemies: {
    scrapbit:  { hp: 2,  r: 12, speed: 120, count: [4, 10], coin: 1 },
    ramhound:  { hp: 6,  r: 16, speed: 260, count: [1, 2],  coin: 3, rush: true, touchLoss: 3 },
    wallguard: { hp: 30, r: 24, speed: 45,  count: [1, 1],  coin: 5 },
    needleeye: { hp: 5,  r: 14, speed: 60,  count: [1, 2],  coin: 4, shootEvery: 1.4, shotSpeed: 240 },
  },
  boss: { baseHp: 120, hpPerTroop: 2.2, r: 55, speed: 90, shootEvery: 0.9, fan: 3, shotSpeed: 210,
          touchLossPerSec: 12, coin: 40 },
  coins: { perDistance: 0.01 },          // 거리 보정 코인(주 수입은 격파)
  fx: { slowmoAt: 5, slowmoDur: 0.5, slowmoScale: 0.4, slowmoMax: 2,
        continueTroops: 10, continueInvulnSec: 2, bossHushSec: 1.5 },
  upgrades: {
    startTroops: { max: 9, effect: 1,    costs: [30, 80, 160, 280, 450, 680, 980, 1350, 1800] },
    fireRate:    { max: 5, effect: 0.05, costs: [40, 100, 200, 350, 550] },
    magnet:      { max: 5, effect: 0.10, costs: [25, 60, 120, 220, 380] },
  },
};
```

```js
// rush/gates.js — 게이트 수학. 표시는 render 가, 여기는 순수 계산만.
import { BAL } from './balance.js';
export const GATE_OPS = ['add', 'mul', 'sub', 'div'];
export const isGood = (op) => op === 'add' || op === 'mul';
export const gateColor = (op) => BAL.gates.colors[op];

export function applyGate(count, gate) {
  const n = gate.value;
  let r;
  if (gate.op === 'add') r = count + n;
  else if (gate.op === 'mul') r = count * n;
  else if (gate.op === 'sub') r = count - n;
  else r = Math.ceil(count / n);
  return Math.max(0, Math.round(r));
}

const lerp = (a, b, t) => a + (b - a) * t;
function makeGate(rnd, t, good) {
  const g = BAL.gates;
  if (good) {
    return rnd() < 0.6
      ? { op: 'add', value: Math.round(lerp(g.addMin, g.addMax, t) * (0.7 + rnd() * 0.6)) || 1 }
      : { op: 'mul', value: g.mulVals[(rnd() * g.mulVals.length) | 0] };
  }
  return rnd() < 0.6
    ? { op: 'sub', value: Math.round(lerp(g.subMin, g.subMax, t) * (0.7 + rnd() * 0.6)) || 1 }
    : { op: 'div', value: g.divVals[(rnd() * g.divVals.length) | 0] };
}

/** 쌍 패턴: 좋+나쁨 55% / 좋+좋 25% / 나쁨+나쁨 20% — 라스트워식 "덜 나쁜 쪽 고르기" 포함. */
export function makeGatePair(rnd, t) {
  const roll = rnd();
  const kinds = roll < 0.55 ? [true, false] : roll < 0.8 ? [true, true] : [false, false];
  if (rnd() < 0.5) kinds.reverse();
  let left = makeGate(rnd, t, kinds[0]);
  let right = makeGate(rnd, t, kinds[1]);
  if (left.op === right.op && left.value === right.value) right = makeGate(rnd, t, !kinds[1]);
  return { left, right };
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test tests/rush-core.test.mjs` → 전부 PASS
- [ ] **Step 5: Commit** — `git add rush tests/rush-core.test.mjs && git commit -m "feat(rush): 시드 RNG·수치표·게이트 수학"`

---

### Task 2: track — 시드 → 거리순 이벤트

**Files:**
- Create: `rush/track.js`
- Test: `tests/rush-core.test.mjs` 에 추가

**Interfaces:**
- Consumes: `mulberry32`, `makeGatePair`, `BAL`
- Produces: `buildTrack(seed:int)->{events:[{z:number,type:'gatepair'|'wave'|'boss',data}], length:number}` — z 오름차순. gatepair.data={left,right}. wave.data={kind:'scrapbit'|..., n:int}. 마지막 이벤트는 반드시 boss.

- [ ] **Step 1: 실패하는 테스트 작성** (rush-core.test.mjs 에 추가)

```js
import { buildTrack } from '../rush/track.js';

test('TRACK-DET: 같은 시드는 같은 트랙, 정렬·보스 보장', () => {
  const a = buildTrack(42), b = buildTrack(42), c = buildTrack(43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.events, c.events);
  for (let i = 1; i < a.events.length; i++) assert.ok(a.events[i].z >= a.events[i - 1].z, 'z 정렬');
  assert.equal(a.events[a.events.length - 1].type, 'boss');
  assert.equal(a.length, 2600);
  const gates = a.events.filter((e) => e.type === 'gatepair');
  assert.ok(gates.length >= 6, '게이트쌍이 최소 6개: ' + gates.length);
  const kinds = new Set(a.events.filter((e) => e.type === 'wave').map((e) => e.data.kind));
  assert.ok(kinds.size >= 3, '적 종류가 3종 이상 섞인다');
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rush-core.test.mjs`

- [ ] **Step 3: 구현**

```js
// rush/track.js — 시드 하나로 판 전체를 결정한다(오늘의 도전 재현성의 근거).
import { BAL } from './balance.js';
import { mulberry32 } from './rng.js';
import { makeGatePair } from './gates.js';

const WAVE_KINDS = ['scrapbit', 'scrapbit', 'ramhound', 'needleeye', 'wallguard'];  // 잡졸 가중

export function buildTrack(seed) {
  const rnd = mulberry32(seed);
  const T = BAL.track, events = [];
  for (let z = T.firstGateZ; z < T.bossZ - 200; z += T.gateEvery) {
    const t = z / T.bossZ;
    events.push({ z: Math.round(z), type: 'gatepair', data: makeGatePair(rnd, t) });
    for (let w = z + 90; w < z + T.gateEvery - 60; w += T.waveEvery) {
      const kind = WAVE_KINDS[(rnd() * WAVE_KINDS.length) | 0];
      const [lo, hi] = BAL.enemies[kind].count;
      events.push({ z: Math.round(w), type: 'wave', data: { kind, n: lo + ((rnd() * (hi - lo + 1)) | 0) } });
    }
  }
  events.push({ z: T.bossZ, type: 'boss', data: {} });
  events.sort((a, b) => a.z - b.z);
  return { events, length: T.bossZ };
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test tests/rush-core.test.mjs`
- [ ] **Step 5: Commit** — `git commit -am "feat(rush): 시드형 트랙 생성기"`

---

### Task 3: squad — 병력·승급·대형

**Files:**
- Create: `rush/squad.js`
- Test: `tests/rush-sim.test.mjs` (새 파일)

**Interfaces:**
- Consumes: `BAL`
- Produces: `tierFor(count)->0..4`, `formation(count)->[{x,y}]`(부대 중심 기준 오프셋, 최대 drawCap 개, 쐐기·행 진행), `clampX(x)->x`(부대 중심 이동 한계)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/rush-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFor, formation, clampX } from '../rush/squad.js';
import { BAL } from '../rush/balance.js';

test('SQUAD-TIER: 임계 1/25/75/150/300', () => {
  const cases = [[1, 0], [24, 0], [25, 1], [74, 1], [75, 2], [149, 2], [150, 3], [299, 3], [300, 4], [999, 4]];
  for (const [n, t] of cases) assert.equal(tierFor(n), t, n + '기');
});

test('SQUAD-FORM: 개수 상한·쐐기(뒤로 갈수록 넓다)·중복 없음', () => {
  assert.equal(formation(1).length, 1);
  assert.equal(formation(10).length, 10);
  assert.equal(formation(500).length, BAL.squad.drawCap);
  const f = formation(60);
  const rows = new Map();
  for (const p of f) {
    const key = Math.round(p.y);
    rows.set(key, Math.max(rows.get(key) ?? 0, Math.abs(p.x)));
  }
  const ys = [...rows.keys()].sort((a, b) => a - b);
  assert.ok(rows.get(ys[ys.length - 1]) >= rows.get(ys[0]), '뒷줄이 앞줄보다 넓거나 같다');
  const set = new Set(f.map((p) => Math.round(p.x) + ',' + Math.round(p.y)));
  assert.equal(set.size, f.length, '겹치는 자리 없음');
});

test('SQUAD-CLAMP: 중심 x 는 화면 안', () => {
  assert.equal(clampX(-999), 40);
  assert.equal(clampX(999), 440);
  assert.equal(clampX(240), 240);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rush-sim.test.mjs`

- [ ] **Step 3: 구현**

```js
// rush/squad.js — 병력 수가 곧 화력이고 곧 그림이다. 대형은 위가 뾰족한 쐐기.
import { BAL } from './balance.js';

export function tierFor(count) {
  const t = BAL.tiers;
  for (let i = t.length - 1; i >= 0; i--) if (count >= t[i]) return i;
  return 0;
}

/** 행 r(0=선두)에 r+1 자리, 행마다 뒤로. drawCap 초과분은 그리지 않는다(숫자 라벨이 담당). */
export function formation(count) {
  const n = Math.min(count, BAL.squad.drawCap);
  const sx = BAL.squad.unitSpacingX, sy = BAL.squad.unitSpacingY;
  const out = [];
  let r = 0, placed = 0;
  while (placed < n) {
    const cols = Math.min(r + 1, 13);                    // 한 행 최대 13 — 화면 폭 보호
    const take = Math.min(cols, n - placed);
    for (let k = 0; k < take; k++) {
      out.push({ x: (k - (take - 1) / 2) * sx, y: r * sy });
    }
    placed += take; r++;
  }
  return out;
}

export function clampX(x) { return Math.max(40, Math.min(440, x)); }
```

- [ ] **Step 4: 통과 확인** — Run: `node --test tests/rush-sim.test.mjs`
- [ ] **Step 5: Commit** — `git commit -am "feat(rush): 병력 승급·쐐기 대형"`

---

### Task 4: combat — 적·탄·보스 스텝

**Files:**
- Create: `rush/combat.js`
- Test: `tests/rush-sim.test.mjs` 에 추가

**Interfaces:**
- Consumes: `BAL`, `mulberry32`
- Produces:
  - `createCombat(rnd)->state` (state={enemies:[],bullets:[],eshots:[],boss:null,fireT:0,coins:0,kills:0})
  - `spawnWave(state, kind, n, rnd)` — 화면 위(y=-40~-160, x 60~420)에 적 생성
  - `spawnBoss(state, troopCount)` — hp = baseHp + hpPerTroop×troopCount
  - `stepCombat(state, squad:{x,count,fireRateMult}, dt, rnd)->{troopLoss:int}` — 이동·사격·충돌을 한 틱 진행. 격파 코인·kills 는 state 에 누적. 적/탄은 화면 밖에서 제거.
  - 적 스키마: `{kind,x,y,hp,r,vx,vy,shootT?}` / 탄: `{x,y,vy}` / 적탄: `{x,y,vx,vy}`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { createCombat, spawnWave, spawnBoss, stepCombat } from '../rush/combat.js';
import { mulberry32 } from '../rush/rng.js';

test('COMBAT-KILL: 사격이 적을 잡고 코인·격파가 쌓인다', () => {
  const rnd = mulberry32(1);
  const st = createCombat();
  spawnWave(st, 'scrapbit', 3, rnd);
  for (const e of st.enemies) { e.x = 240; e.y = 400; e.vy = 0; }   // 사선에 고정
  const squad = { x: 240, count: 30, fireRateMult: 1 };
  for (let i = 0; i < 600; i++) stepCombat(st, squad, 1 / 60, rnd);
  assert.equal(st.enemies.length, 0, '전멸해야 한다');
  assert.equal(st.kills, 3);
  assert.ok(st.coins >= 3);
});

test('COMBAT-TOUCH: 적이 부대 줄에 닿으면 병력이 깎이고 적도 소모된다', () => {
  const rnd = mulberry32(2);
  const st = createCombat();
  spawnWave(st, 'scrapbit', 1, rnd);
  st.enemies[0].x = 240; st.enemies[0].y = 630; st.enemies[0].vy = 200;
  const r = stepCombat(st, { x: 240, count: 10, fireRateMult: 0 }, 1 / 30, rnd);
  assert.ok(r.troopLoss >= 1, '접촉 손실');
  assert.equal(st.enemies.length, 0, '자폭 소모');
});

test('COMBAT-BOSS: 보스 HP 는 병력 비례, 격파 시 코인 지급', () => {
  const rnd = mulberry32(3);
  const st = createCombat();
  spawnBoss(st, 100);
  assert.equal(st.boss.hp, Math.round(120 + 2.2 * 100));
  st.boss.hp = 1;
  st.boss.x = 240; st.boss.y = 200;
  for (let i = 0; i < 240 && st.boss; i++) stepCombat(st, { x: 240, count: 50, fireRateMult: 1 }, 1 / 60, rnd);
  assert.equal(st.boss, null, '보스 격파');
  assert.ok(st.coins >= 40);
});

test('COMBAT-ESHOT: 니들아이 탄이 부대에 닿으면 병력 1 손실', () => {
  const rnd = mulberry32(4);
  const st = createCombat();
  st.eshots.push({ x: 240, y: 632, vx: 0, vy: 200 });
  const r = stepCombat(st, { x: 240, count: 10, fireRateMult: 0 }, 1 / 30, rnd);
  assert.equal(r.troopLoss, 1);
  assert.equal(st.eshots.length, 0);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rush-sim.test.mjs`

- [ ] **Step 3: 구현**

```js
// rush/combat.js — 표시와 무관한 순수 전투 스텝. 모든 난수는 주입된 rnd 만 쓴다.
import { BAL } from './balance.js';

export function createCombat() {
  return { enemies: [], bullets: [], eshots: [], boss: null, fireT: 0, coins: 0, kills: 0 };
}

export function spawnWave(st, kind, n, rnd) {
  const def = BAL.enemies[kind];
  for (let i = 0; i < n; i++) {
    st.enemies.push({
      kind, hp: def.hp, r: def.r,
      x: 60 + rnd() * 360, y: -40 - rnd() * 120,
      vx: (rnd() - 0.5) * 30, vy: def.speed,
      shootT: def.shootEvery ? def.shootEvery * (0.5 + rnd() * 0.8) : undefined,
    });
  }
}

export function spawnBoss(st, troopCount) {
  const B = BAL.boss;
  st.boss = { hp: Math.round(B.baseHp + B.hpPerTroop * troopCount), max: 0, x: 240, y: -80, r: B.r,
              dir: 1, shootT: B.shootEvery, touchT: 0 };
  st.boss.max = st.boss.hp;
}

export function stepCombat(st, squad, dt, rnd) {
  const S = BAL.squad, lineY = S.y - 8;
  let troopLoss = 0;

  //  아군 사격 — count 비례 발사(틱당 묶음). fireRateMult 0 이면 사격 없음(테스트용).
  if (squad.fireRateMult > 0) {
    st.fireT -= dt;
    const interval = S.fireInterval / (squad.fireRateMult * Math.max(1, Math.sqrt(squad.count)));
    while (st.fireT <= 0) {
      st.fireT += Math.max(0.02, interval);
      st.bullets.push({ x: squad.x + (rnd() - 0.5) * 60, y: S.y - 20, vy: -S.bulletSpeed });
    }
  }
  for (const b of st.bullets) b.y += b.vy * dt;

  //  적 이동·사격·접촉
  for (const e of st.enemies) {
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.x < 30 || e.x > 450) e.vx *= -1;
    if (e.shootT !== undefined) {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = BAL.enemies[e.kind].shootEvery;
        const dx = squad.x - e.x, dy = lineY - e.y, len = Math.hypot(dx, dy) || 1;
        const sp = BAL.enemies[e.kind].shotSpeed;
        st.eshots.push({ x: e.x, y: e.y, vx: (dx / len) * sp, vy: (dy / len) * sp });
      }
    }
    if (e.y >= lineY - e.r && Math.abs(e.x - squad.x) < 90) {
      troopLoss += BAL.enemies[e.kind].touchLoss ?? S.touchLossPerHit;
      e.hp = 0;                                            // 접촉 = 자폭 소모(기획 4-1)
    }
  }

  //  적탄 이동·명중
  for (const s of st.eshots) {
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.y >= lineY && Math.abs(s.x - squad.x) < 80) { troopLoss += 1; s.dead = true; }
  }

  //  보스
  if (st.boss) {
    const B = BAL.boss, bo = st.boss;
    if (bo.y < 140) bo.y += 60 * dt;
    bo.x += bo.dir * B.speed * dt;
    if (bo.x < 90 || bo.x > 390) bo.dir *= -1;
    bo.shootT -= dt;
    if (bo.shootT <= 0) {
      bo.shootT = B.shootEvery;
      for (let k = 0; k < B.fan; k++) {
        const a = Math.PI / 2 + (k - (B.fan - 1) / 2) * 0.28;   // 아래 부채꼴
        st.eshots.push({ x: bo.x, y: bo.y + bo.r, vx: Math.cos(a) * B.shotSpeed, vy: Math.sin(a) * B.shotSpeed });
      }
    }
    bo.touchT -= dt;
    if (bo.y + bo.r >= lineY && Math.abs(bo.x - squad.x) < 110 && bo.touchT <= 0) {
      bo.touchT = 1 / B.touchLossPerSec * 4;                   // 초당 상한을 4틱으로 분할
      troopLoss += Math.max(1, Math.round(B.touchLossPerSec / 4));
    }
  }

  //  탄 명중 판정
  for (const b of st.bullets) {
    if (b.dead) continue;
    if (st.boss && Math.hypot(b.x - st.boss.x, b.y - st.boss.y) < st.boss.r) {
      st.boss.hp -= S.bulletDmg; b.dead = true; continue;
    }
    for (const e of st.enemies) {
      if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) { e.hp -= S.bulletDmg; b.dead = true; break; }
    }
  }

  //  정리(격파 보상 포함)
  st.enemies = st.enemies.filter((e) => {
    if (e.hp <= 0) {
      if (e.y < lineY - e.r) { st.coins += BAL.enemies[e.kind].coin; st.kills++; }   // 접촉 자폭은 보상 없음
      else { st.kills++; }
      return false;
    }
    return e.y < 830;
  });
  if (st.boss && st.boss.hp <= 0) { st.coins += BAL.boss.coin; st.kills++; st.boss = null; }
  st.bullets = st.bullets.filter((b) => !b.dead && b.y > -40);
  st.eshots = st.eshots.filter((s) => !s.dead && s.y < 830 && s.x > -40 && s.x < 520);

  return { troopLoss };
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test tests/rush-sim.test.mjs`
- [ ] **Step 5: 완주 시뮬레이션 테스트 추가 후 통과 확인**

```js
import { buildTrack } from '../rush/track.js';
import { applyGate, isGood } from '../rush/gates.js';

test('SIM-FULLRUN: "좋은 쪽만 고르는" 봇이 시드 5개에서 보스까지 도달한다', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const track = buildTrack(seed);
    let count = 10;                                   // 업그레이드 몇 개 한 상태 가정
    const rnd = mulberry32(seed * 7 + 1);
    const st = createCombat();
    let z = 0, ei = 0, dead = false;
    const dt = 1 / 30;
    while (z < track.length && !dead) {
      z += 190 * dt;
      while (ei < track.events.length && track.events[ei].z <= z) {
        const ev = track.events[ei++];
        if (ev.type === 'gatepair') {
          const { left, right } = ev.data;
          const better = applyGate(count, left) >= applyGate(count, right) ? left : right;
          count = applyGate(count, better);
        } else if (ev.type === 'wave') spawnWave(st, ev.data.kind, ev.data.n, rnd);
        else spawnBoss(st, count);
      }
      const r = stepCombat(st, { x: 240, count, fireRateMult: 1 }, dt, rnd);
      count -= r.troopLoss;
      if (count <= 0) dead = true;
    }
    assert.ok(!dead, 'seed ' + seed + ' 에서 보스 전에 전멸');
    assert.ok(count > 10, 'seed ' + seed + ' 성장 실패: ' + count);
    void isGood;
  }
});
```

Run: `node --test tests/rush-sim.test.mjs` → 전부 PASS (밸런스가 안 맞아 죽으면 BAL 의 적 수·속도를 낮춰 통과시키고 커밋 메시지에 조정치 기록)
- [ ] **Step 6: Commit** — `git commit -am "feat(rush): 전투 스텝·보스·완주 시뮬레이션"`

---

### Task 5: save + upgrades + daily + fx-state

**Files:**
- Create: `rush/save.js`, `rush/upgrades.js`, `rush/daily.js`, `rush/fx-state.js`
- Test: `tests/rush-meta.test.mjs` (새 파일)

**Interfaces:**
- Produces(save): `createSave(storage?)->{get()->data, patch(obj)}` — 기본 `{best:0, coins:0, up:{startTroops:0,fireRate:0,magnet:0}, daily:{}, lastPlayDay:''}` / storage 미주입 시 globalThis.localStorage, 접근 실패는 메모리 폴백. 키 `starforgeRush.v1`.
- Produces(upgrades): `upCost(track, lvl)->int|null`, `buy(save, track)->bool`, `effects(up, isDaily)->{startCount:int, fireRateMult:float, magnetMult:float}` — **isDaily=true 면 전부 기본값**(재미설계 C).
- Produces(daily): `todayKey()->'YYYY-MM-DD'`, `isFirstRunToday(data, key)->bool`, `shareText(key, best)->string` (`스타포지 러시 M/D 도전 — 병력 N!`).
- Produces(fx-state): `recordWatcher(best)->{update(count)->'break'|null}`(최초 1회만 break), `slowmoCtl()->{update(count,dt)->scale}`(≤5 진입 시 0.5초 0.4배, 최대 2회), `continueToken(isDaily)->{canUse()->bool, use()->bool}`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/rush-meta.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../rush/save.js';
import { upCost, buy, effects } from '../rush/upgrades.js';
import { todayKey, isFirstRunToday, shareText } from '../rush/daily.js';
import { recordWatcher, slowmoCtl, continueToken } from '../rush/fx-state.js';

const memStorage = () => { const m = new Map(); return {
  getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('SAVE-ROUNDTRIP: 저장·복원·부분 갱신', () => {
  const st = memStorage();
  const s1 = createSave(st);
  s1.patch({ coins: 120, best: 88 });
  const s2 = createSave(st);
  assert.equal(s2.get().coins, 120);
  assert.equal(s2.get().best, 88);
  assert.equal(s2.get().up.startTroops, 0);
});

test('UP-BUY: 비용 차감·상한·잔액 부족', () => {
  const s = createSave(memStorage());
  s.patch({ coins: 35 });
  assert.equal(upCost('startTroops', 0), 30);
  assert.equal(buy(s, 'startTroops'), true);
  assert.equal(s.get().coins, 5);
  assert.equal(s.get().up.startTroops, 1);
  assert.equal(buy(s, 'startTroops'), false, '잔액 부족');
  s.patch({ up: { ...s.get().up, fireRate: 5 } });
  assert.equal(upCost('fireRate', 5), null, '상한 도달');
  assert.equal(buy(s, 'fireRate'), false);
});

test('UP-EFFECT: 효과 환산과 오늘의 도전 미적용', () => {
  const up = { startTroops: 3, fireRate: 2, magnet: 1 };
  assert.deepEqual(effects(up, false), { startCount: 4, fireRateMult: 1.1, magnetMult: 1.1 });
  assert.deepEqual(effects(up, true), { startCount: 1, fireRateMult: 1, magnetMult: 1 });
});

test('DAILY: 첫판 판정과 자랑 문구', () => {
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(isFirstRunToday({ lastPlayDay: '2026-08-31' }, '2026-09-01'), true);
  assert.equal(isFirstRunToday({ lastPlayDay: '2026-09-01' }, '2026-09-01'), false);
  assert.equal(shareText('2026-09-01', 312), '스타포지 러시 9/1 도전 — 병력 312!');
});

test('FX-RECORD: 갱신 순간 1회만 break', () => {
  const w = recordWatcher(50);
  assert.equal(w.update(49), null);
  assert.equal(w.update(51), 'break');
  assert.equal(w.update(60), null, '두 번째는 연출 없음');
});

test('FX-SLOWMO: ≤5 진입 시 0.4배 0.5초, 최대 2회', () => {
  const s = slowmoCtl();
  assert.equal(s.update(10, 1 / 60), 1);
  assert.equal(s.update(5, 1 / 60), 0.4);         // 진입
  let t = 0; let scale = 0.4;
  while (scale !== 1 && t < 2) { scale = s.update(5, 1 / 60); t += 1 / 60; }
  assert.ok(t >= 0.45 && t <= 0.6, '지속 0.5초 안팎: ' + t.toFixed(2));
  s.update(10, 1 / 60);
  assert.equal(s.update(4, 1 / 60), 0.4, '2회차');
  s.update(10, 1 / 60);
  for (let i = 0; i < 60; i++) s.update(10, 1 / 60);
  assert.equal(s.update(3, 1 / 60), 1, '3회차는 없음');
});

test('FX-CONTINUE: 판당 1회, 오늘의 도전 불가', () => {
  const c = continueToken(false);
  assert.equal(c.canUse(), true);
  assert.equal(c.use(), true);
  assert.equal(c.canUse(), false);
  assert.equal(continueToken(true).canUse(), false);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rush-meta.test.mjs`

- [ ] **Step 3: 구현**

```js
// rush/save.js — 단일 키 localStorage. storage 주입으로 Node 테스트 가능.
const KEY = 'starforgeRush.v1';
const DEFAULTS = { best: 0, coins: 0, up: { startTroops: 0, fireRate: 0, magnet: 0 }, daily: {}, lastPlayDay: '' };

export function createSave(storage) {
  let store = storage;
  if (!store) { try { store = globalThis.localStorage; store.getItem(KEY); } catch { store = null; } }
  const mem = new Map();
  const read = () => {
    try { const raw = store ? store.getItem(KEY) : mem.get(KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  };
  let data = { ...DEFAULTS, ...(read() || {}) };
  data.up = { ...DEFAULTS.up, ...(data.up || {}) };
  const write = () => {
    const raw = JSON.stringify(data);
    try { if (store) store.setItem(KEY, raw); else mem.set(KEY, raw); } catch { mem.set(KEY, raw); }
  };
  return {
    get: () => data,
    patch: (obj) => { data = { ...data, ...obj }; write(); },
  };
}
```

```js
// rush/upgrades.js — 3트랙 고정(재미설계 B — 증식 금지).
import { BAL } from './balance.js';

export function upCost(track, lvl) {
  const def = BAL.upgrades[track];
  if (!def || lvl >= def.max) return null;
  return def.costs[lvl];
}
export function buy(save, track) {
  const d = save.get();
  const lvl = d.up[track] ?? 0;
  const cost = upCost(track, lvl);
  if (cost === null || d.coins < cost) return false;
  save.patch({ coins: d.coins - cost, up: { ...d.up, [track]: lvl + 1 } });
  return true;
}
export function effects(up, isDaily) {
  if (isDaily) return { startCount: 1, fireRateMult: 1, magnetMult: 1 };   // 순수 실력 판
  const U = BAL.upgrades;
  return {
    startCount: 1 + (up.startTroops ?? 0) * U.startTroops.effect,
    fireRateMult: 1 + (up.fireRate ?? 0) * U.fireRate.effect,
    magnetMult: 1 + (up.magnet ?? 0) * U.magnet.effect,
  };
}
```

```js
// rush/daily.js — 날짜는 기기 로컬 기준(재미설계 C).
export function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function isFirstRunToday(data, key) { return data.lastPlayDay !== key; }
export function shareText(key, best) {
  const [, m, d] = key.split('-');
  return '스타포지 러시 ' + Number(m) + '/' + Number(d) + ' 도전 — 병력 ' + best + '!';
}
```

```js
// rush/fx-state.js — 연출의 "판정"만 순수하게. 그리기·소리는 render/main 이 담당.
import { BAL } from './balance.js';

export function recordWatcher(best) {
  let broken = false;
  return { update(count) {
    if (!broken && best > 0 && count > best) { broken = true; return 'break'; }
    if (!broken && best === 0 && count > 1) { broken = true; return 'break'; }   // 첫 판도 축하
    return null;
  } };
}

export function slowmoCtl() {
  let uses = 0, t = 0, above = true;
  return { update(count, dt) {
    if (t > 0) { t -= dt; return t > 0 ? BAL.fx.slowmoScale : 1; }
    if (count > BAL.fx.slowmoAt) { above = true; return 1; }
    if (above && uses < BAL.fx.slowmoMax) { above = false; uses++; t = BAL.fx.slowmoDur; return BAL.fx.slowmoScale; }
    return 1;
  } };
}

export function continueToken(isDaily) {
  let used = false;
  return {
    canUse: () => !isDaily && !used,
    use() { if (isDaily || used) return false; used = true; return true; },
  };
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test tests/rush-meta.test.mjs`
- [ ] **Step 5: Commit** — `git commit -am "feat(rush): 저장·업그레이드 3트랙·일일·연출 상태기계"`

---

### Task 6: sprites 로더 + 자산 반입 도구

**Files:**
- Create: `rush/sprites.js`, `tools/rush-import-sprites.py`
- Test: `tests/rush-meta.test.mjs` 에 매핑 표 검사만 추가(로더 자체는 브라우저 전용)

**Interfaces:**
- Produces: `SPRITE_KEYS = { m1:'M01', m2:'M02', m3:'M03', m4:'M04', m5:'M05', e_scrapbit:'E1_scrapbit', e_ramhound:'E2_ramhound', e_wallguard:'E3_wallguard', e_needleeye:'E4_needleeye', e_boss:'E5_crownbreaker', gate:'GATE' }`, `loadSprites(base='assets/rush/')->Promise<{get(key)->Image|null, ready:Set}>` — 없는 파일은 조용히 null(플레이스홀더 경로).

- [ ] **Step 1: 테스트 추가** (rush-meta.test.mjs)

```js
import { SPRITE_KEYS } from '../rush/sprites.js';
test('SPRITES-KEYS: 11종 키가 파일명 규약과 일치한다', () => {
  assert.equal(Object.keys(SPRITE_KEYS).length, 11);
  assert.equal(SPRITE_KEYS.m1, 'M01');
  assert.equal(SPRITE_KEYS.e_boss, 'E5_crownbreaker');
  assert.equal(SPRITE_KEYS.gate, 'GATE');
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rush-meta.test.mjs`

- [ ] **Step 3: 구현**

```js
// rush/sprites.js — 있으면 그림, 없으면 null(호출부가 도형 폴백). 게임은 그림 0장으로도 완주 가능해야 한다.
export const SPRITE_KEYS = {
  m1: 'M01', m2: 'M02', m3: 'M03', m4: 'M04', m5: 'M05',
  e_scrapbit: 'E1_scrapbit', e_ramhound: 'E2_ramhound', e_wallguard: 'E3_wallguard',
  e_needleeye: 'E4_needleeye', e_boss: 'E5_crownbreaker', gate: 'GATE',
};
export function loadSprites(base = 'assets/rush/') {
  const imgs = new Map(), ready = new Set();
  const jobs = Object.entries(SPRITE_KEYS).map(([key, name]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { imgs.set(key, im); ready.add(key); res(); };
    im.onerror = () => res();                       // 없는 그림은 조용히 폴백
    im.src = base + name + '.png';
  }));
  return Promise.all(jobs).then(() => ({ get: (k) => imgs.get(k) ?? null, ready }));
}
```

```python
# tools/rush-import-sprites.py — newmode\sprites 의 생성 원본을 게임 규격으로 반입한다.
#  · 체크무늬/흰 배경이 구워진 PNG 도 자동 투명화(무채색·밝음 외곽 채우기 — M01 실측 방식)
#  · 알파 경계로 잘라 세로 512px 로 축소 → assets/rush/<이름>.png
#   python tools/rush-import-sprites.py            (전체)
#   python tools/rush-import-sprites.py M01        (한 장)
import sys, os
from collections import deque
from PIL import Image

SRC = r'E:\workspace\claude\neon-fleet\newmode\sprites'
DST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'rush')
NAMES = ['M01', 'M02', 'M03', 'M04', 'M05',
         'E1_scrapbit', 'E2_ramhound', 'E3_wallguard', 'E4_needleeye', 'E5_crownbreaker', 'GATE']

def is_bg(p):
    r, g, b, a = p
    mx, mn = max(r, g, b), min(r, g, b)
    return a > 0 and (mx - mn) <= 6 and mn >= 190

def strip_bg(im):
    im = im.convert('RGBA')
    if im.getextrema()[3][0] < 255:      # 이미 투명 알파가 있으면 그대로
        return im
    w, h = im.size; px = im.load()
    seen = bytearray(w * h); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]: seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]: seen[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft(); px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(px[nx, ny]):
                seen[ny * w + nx] = 1; q.append((nx, ny))
    return im

def run(only=None):
    os.makedirs(DST, exist_ok=True)
    for name in NAMES:
        if only and name != only: continue
        # M-01.png / M01.png 같은 변형 이름도 받아준다
        cands = [name, name.replace('M0', 'M-0'), name + '_clean']
        src = next((os.path.join(SRC, c + '.png') for c in cands if os.path.exists(os.path.join(SRC, c + '.png'))), None)
        if not src:
            print('  없음(건너뜀):', name); continue
        im = strip_bg(Image.open(src))
        bb = im.split()[3].getbbox()
        if bb: im = im.crop(bb)
        r = 512 / im.size[1]
        im = im.resize((max(1, int(im.size[0] * r)), 512), Image.LANCZOS)
        out = os.path.join(DST, name + '.png')
        im.save(out, optimize=True)
        print('  반입:', name, im.size, '->', out)

if __name__ == '__main__':
    run(sys.argv[1] if len(sys.argv) > 1 else None)
```

- [ ] **Step 4: 통과 확인** — `node --test tests/rush-meta.test.mjs` PASS, 이어서 `python tools/rush-import-sprites.py M01` 실행해 `assets/rush/M01.png` 생성 확인
- [ ] **Step 5: Commit** — `git add rush/sprites.js tools/rush-import-sprites.py assets/rush && git commit -m "feat(rush): 스프라이트 로더·자산 반입 도구"`

---

### Task 7: render — 캔버스 그리기

**Files:**
- Create: `rush/render.js`, `rush.html`

**Interfaces:**
- Consumes: `formation`, `tierFor`, `gateColor`, `BAL`, sprites `{get}`
- Produces: `createRenderer(canvas, sprites)->{draw(view)}` — view 는 main 이 만드는 순수 데이터:
  `{state:'title'|'run'|'over'|'results', mode:'normal'|'daily', squad:{x,count,tier}, gates:[{y,left,right}], enemies, eshots, bullets, boss, progress:0..1, bossDist, hud:{count,best,recordFlash,firstRunX2}, results:{best,kills,coins,isRecord,shareKey}, up:{rows:[{track,lvl,cost,can}]}, continueOffer:bool, dim:0..1}`
- rush.html 은 480×800 캔버스 + `<script type="module" src="rush/main.js">` 만. 문서 배경 #05080E.

- [ ] **Step 1: rush.html 작성** (테스트는 Task 8 스모크로 대체 — DOM 전용 계층)

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>스타포지 러시</title>
<style>
  html,body{margin:0;height:100%;background:#05080E;display:flex;align-items:center;justify-content:center}
  canvas{max-height:100vh;max-width:100vw;aspect-ratio:480/800;touch-action:none}
</style>
</head>
<body>
<canvas id="game" width="480" height="800"></canvas>
<script type="module" src="rush/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: render.js 구현** — 전 상태를 그린다. 핵심 규칙:
  - 배경: 밝은 청회색 활주로(#2A3644 중앙 밴드 + #10161F 사이드 + 흰 안내선 2줄, 스크롤 오프셋 = progress×length%40).
  - 게이트: 스프라이트 있으면 `gate` 그림, 없으면 둥근 프레임 도형. **가운데는 항상 뚫림**. 좌우 폭 190·간격 26. 숫자는 `bold 42px system-ui` 흰색 + 남색 외곽선(strokeText 6px), 연산자는 게이트 주색(`gateColor`), `×`·`÷` 기호.
  - 부대: `formation(count)` 좌표에 티어 스프라이트(m1~m5, 세로 26px 기준 스케일) 또는 폴백(티어색 삼각형 — m1 #F3F1E8 / m2 #DFE6F5 / m3 #C9E9FF / m4 #FFE9B8 / m5 #FFD34D). drawCap 초과분은 부대 위 `x{count}` 라벨이 담당.
  - 적: 스프라이트(e_*) 또는 폴백(kind 별 색 도형 — scrapbit 마름모 #B3402F / ramhound 쐐기 #D14A20 / wallguard 사각 #3A2C3F+#C2273B 테두리 / needleeye 삼각 #2B2F36+#FF3DA5 렌즈). 보스는 e_boss 또는 왕관 링 원형 폴백, 상단에 HP바.
  - HUD 3요소: 상단 중앙 병력 수(신기록 후엔 금색), 그 아래 진행 바(폭 200), 보스 거리 `▲ {m}`.
  - 연출: recordFlash>0 이면 금색 비네트+"신기록!" 배지, firstRunX2 면 좌상단 "오늘 첫 출격! 코인 2배" 배지, dim>0 이면 화면 어둡게(보스 앞 정적), continueOffer 면 중앙 [이어하기 (1회)] / [그만하기] 버튼, results 면 종료 카드(기록·격파·코인·[다시 출격]·업그레이드 3버튼·[기록 복사]·[오늘의 도전]).
  - 모든 버튼은 `view.buttons=[{id,x,y,w,h,label}]` 로 main 이 내려주고 render 는 그리기만, 히트 판정은 main 이 한다.

- [ ] **Step 3: 눈 확인** — `python tools/nocache-server.py 8777` 후 `http://localhost:8777/rush.html` 에서 타이틀이 뜨는지(다음 Task 의 main 과 함께 확인해도 됨)
- [ ] **Step 4: Commit** — `git add rush.html rush/render.js && git commit -m "feat(rush): 캔버스 렌더러·진입 페이지"`

---

### Task 8: main — 상태기계·입력·루프 결선

**Files:**
- Create: `rush/main.js`
- Test: `tests/rush-sim.test.mjs` 에 순수 헬퍼 테스트 추가

**Interfaces:**
- Consumes: 앞의 전 모듈.
- Produces(순수, main.js 에서 export — 테스트 대상): `hitButton(buttons, x, y)->id|null`, `gateHitSide(squadX, pair)->'left'|'right'` (게이트 y 도달 시 중심 x<240 → left), `advance(run, dt)` 는 main 내부.

- [ ] **Step 1: 실패하는 테스트 작성** (rush-sim.test.mjs)

```js
import { hitButton, gateHitSide } from '../rush/main.js';

test('MAIN-HIT: 버튼 히트 판정', () => {
  const btns = [{ id: 'retry', x: 140, y: 600, w: 200, h: 56 }];
  assert.equal(hitButton(btns, 240, 628), 'retry');
  assert.equal(hitButton(btns, 60, 628), null);
});
test('MAIN-GATE-SIDE: 중심 x 로 좌우 판정', () => {
  assert.equal(gateHitSide(120, {}), 'left');
  assert.equal(gateHitSide(360, {}), 'right');
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rush-sim.test.mjs` (main.js 가 DOM 없이도 import 가능해야 한다 — **모듈 상단에서 document 접근 금지**, `boot()` 안에서만)

- [ ] **Step 3: 구현** — main.js 구조(전문):

```js
// rush/main.js — 셸. 게임 규칙은 전부 하위 모듈에 있고 여기는 결선만.
import { BAL } from './balance.js';
import { mulberry32, dateSeed, hashSeed } from './rng.js';
import { buildTrack } from './track.js';
import { applyGate } from './gates.js';
import { tierFor, formation, clampX } from './squad.js';
import { createCombat, spawnWave, spawnBoss, stepCombat } from './combat.js';
import { createSave } from './save.js';
import { upCost, buy, effects } from './upgrades.js';
import { todayKey, isFirstRunToday, shareText } from './daily.js';
import { recordWatcher, slowmoCtl, continueToken } from './fx-state.js';
import { loadSprites } from './sprites.js';
import { createRenderer } from './render.js';

export function hitButton(buttons, x, y) {
  for (const b of buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  return null;
}
export function gateHitSide(squadX) { return squadX < 240 ? 'left' : 'right'; }

function newRun(save, mode) {
  const isDaily = mode === 'daily';
  const seedInfo = isDaily ? dateSeed() : { key: null, seed: hashSeed('r' + performance.now() + Math.random()) };
  const eff = effects(save.get().up, isDaily);
  return {
    mode, seedKey: seedInfo.key,
    track: buildTrack(seedInfo.seed), rnd: mulberry32(seedInfo.seed ^ 0x9E37),
    z: 0, ei: 0, x: 240, count: eff.startCount, eff,
    combat: createCombat(),
    watcher: recordWatcher(save.get().best), slowmo: slowmoCtl(), cont: continueToken(isDaily),
    recordFlash: 0, dim: 0, hushT: 0, invulnT: 0, bossSeen: false,
    kills: 0, coins: 0, peak: eff.startCount, over: false,
    firstX2: !isDaily && isFirstRunToday(save.get(), todayKey()),
  };
}

function advance(run, dt0) {
  const scale = run.slowmo.update(run.count, dt0);
  const dt = dt0 * scale;
  //  보스 앞 정적: 보스 이벤트 1.5초 거리 앞에서 dim 상승
  const next = run.track.events[run.ei];
  if (next && next.type === 'boss' && !run.bossSeen) {
    const eta = (next.z - run.z) / BAL.track.scrollSpeed;
    run.dim = eta < BAL.fx.bossHushSec ? Math.min(0.35, run.dim + dt0) : 0;
  }
  run.z += BAL.track.scrollSpeed * dt;
  while (run.ei < run.track.events.length && run.track.events[run.ei].z <= run.z) {
    const ev = run.track.events[run.ei++];
    if (ev.type === 'gatepair') {
      const gate = gateHitSide(run.x) === 'left' ? ev.data.left : ev.data.right;
      run.count = applyGate(run.count, gate);
    } else if (ev.type === 'wave') spawnWave(run.combat, ev.data.kind, ev.data.n, run.rnd);
    else { spawnBoss(run.combat, run.count); run.bossSeen = true; run.dim = 0; }
  }
  const r = stepCombat(run.combat, { x: run.x, count: run.count, fireRateMult: run.eff.fireRateMult }, dt, run.rnd);
  if (run.invulnT > 0) run.invulnT -= dt0; else run.count -= r.troopLoss;
  run.peak = Math.max(run.peak, run.count);
  if (run.watcher.update(run.count) === 'break') run.recordFlash = 1.2;
  run.recordFlash = Math.max(0, run.recordFlash - dt0);
  if (run.count <= 0) run.over = true;
  if (run.bossSeen && !run.combat.boss && run.z >= run.track.length) run.won = true;
  return scale;
}

export function boot() {
  const canvas = document.getElementById('game');
  const save = createSave();
  let state = 'title', run = null, sprites = null, renderer = null, buttons = [];
  const pointer = { down: false, x: 240 };

  function finishRun() {
    state = 'results';
    const d = save.get();
    const mult = run.firstX2 ? 2 : 1;
    const gained = Math.round((run.combat.coins + run.z * BAL.coins.perDistance) * run.eff.magnetMult) * mult;
    const patch = { coins: d.coins + gained, lastPlayDay: todayKey() };
    if (run.mode === 'daily') {
      const daily = { ...d.daily }; const key = run.seedKey;
      daily[key] = Math.max(daily[key] ?? 0, run.peak);
      patch.daily = daily;
    } else if (run.peak > d.best) patch.best = run.peak;
    run.gainedCoins = gained;
    save.patch(patch);
  }

  function view() { /* 상태별로 render 가 먹는 순수 데이터 + buttons 갱신 — 아래 규칙 */ }
  //  buttons 규칙: title=[start(140,470,200,60), daily(140,550,200,48)]
  //  over(이어하기 제안)=[continue(120,430,240,56), giveup(120,510,240,44)]
  //  results=[retry(140,420,200,56), up_startTroops(60,540,110,64), up_fireRate(185,540,110,64),
  //           up_magnet(310,540,110,64), share(140,630,200,40)(daily만), daily(140,690,200,40)]

  function onPress(x, y) {
    const id = hitButton(buttons, x, y);
    if (state === 'title') {
      if (id === 'start') { run = newRun(save, 'normal'); state = 'run'; }
      else if (id === 'daily') { run = newRun(save, 'daily'); state = 'run'; }
    } else if (state === 'over') {
      if (id === 'continue' && run.cont.use()) { run.count = BAL.fx.continueTroops; run.invulnT = BAL.fx.continueInvulnSec; run.over = false; state = 'run'; }
      else if (id === 'giveup') finishRun();
    } else if (state === 'results') {
      if (id === 'retry') { run = newRun(save, run.mode); state = 'run'; }
      else if (id === 'daily') { run = newRun(save, 'daily'); state = 'run'; }
      else if (id && id.startsWith('up_')) buy(save, id.slice(3));
      else if (id === 'share') navigator.clipboard?.writeText(shareText(run.seedKey ?? todayKey(), run.peak)).catch(() => {});
    }
  }

  //  입력: 포인터 드래그 + ←→ 키. 부대 중심만 움직인다.
  canvas.addEventListener('pointerdown', (e) => { pointer.down = true; onPress(...toLogical(e)); });
  canvas.addEventListener('pointermove', (e) => { if (pointer.down) pointer.x = toLogical(e)[0]; });
  addEventListener('pointerup', () => { pointer.down = false; });
  const keys = {};
  addEventListener('keydown', (e) => { keys[e.key] = true; if (state !== 'run' && (e.key === ' ' || e.key === 'Enter')) onPress(240, 448); });
  addEventListener('keyup', (e) => { keys[e.key] = false; });
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * 480 / r.width, (e.clientY - r.top) * 800 / r.height];
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'run') {
      if (pointer.down) run.x = clampX(pointer.x);
      if (keys.ArrowLeft) run.x = clampX(run.x - BAL.squad.moveSpeed * dt);
      if (keys.ArrowRight) run.x = clampX(run.x + BAL.squad.moveSpeed * dt);
      advance(run, dt);
      if (run.over) state = run.cont.canUse() ? 'over' : (finishRun(), 'results');
      if (run.won) finishRun();
    }
    renderer.draw(view());
    requestAnimationFrame(frame);
  }

  loadSprites().then((sp) => { sprites = sp; renderer = createRenderer(canvas, sprites); requestAnimationFrame(frame); });
}

if (typeof document !== 'undefined' && document.getElementById?.('game')) boot();
```

(view() 는 위 buttons 규칙과 run 필드를 그대로 담아 render 로 넘기는 순수 조립 — 구현 시 render.js 의 view 계약과 필드명을 일치시킨다.)

- [ ] **Step 4: 통과 확인** — `node --test tests/rush-sim.test.mjs` PASS(모듈이 DOM 없이 import 됨을 겸사 확인)
- [ ] **Step 5: 실기 확인** — 서버에서 `rush.html` 열어 (플레이스홀더 도형으로라도) 타이틀→출격→게이트 통과→병력 증감→보스→결과→[다시 출격] 전체 흐름 확인. `?`
- [ ] **Step 6: 기존 스위트 무손상 확인** — `node --test "tests/*.test.mjs"` 전부 PASS (기존 1175 + rush 신규)
- [ ] **Step 7: Commit** — `git commit -am "feat(rush): 상태기계·입력·루프 결선 — 첫 완주 가능"`

---

### Task 9: 마감 — 자산 반입·판독 확인·배포

**Files:**
- Modify: `assets/rush/` (도착분 반입), 없음(코드 변경 없어야 정상)

- [ ] **Step 1: 도착한 스프라이트 전체 반입** — `python tools/rush-import-sprites.py` → 반입 목록 출력 확인
- [ ] **Step 2: 실기 확인** — rush.html 에서 그림이 붙은 유닛·적·게이트 확인, 미도착분은 플레이스홀더 유지 확인
- [ ] **Step 3: 포털 빌드 무영향 확인** — `node scripts/build-crazygames-basic.mjs` 가 여전히 성공하고 크기가 이전과 같은지(assets/rush 는 매니페스트 밖)
- [ ] **Step 4: 전체 테스트** — `node --test "tests/*.test.mjs"` 전부 PASS
- [ ] **Step 5: Commit + 배포** — `git add -A && git commit -m "feat(rush): 스프라이트 반입" && git push origin HEAD:master` → 60~100초 후 `https://mlight00.github.io/neon-fleet/rush.html` 라이브 확인(`Ctrl+Shift+R`)

---

## Self-Review 결과

- **사양 커버리지**: 게이트 루프(T1·T2·T8) · 병력=화력(T3·T4) · 5단 승급(T3 tierFor, 렌더 T7) · A-1 신기록(T5 recordWatcher + T7) · A-3 정적(T8 dim) · A-4 슬로모(T5) · A-5 이어하기(T5·T8) · A-6 종료화면(T7·T8) · B 3트랙(T5·T8 buy) · C 오늘의 도전/첫판2배/기록복사(T5·T8) · 시드 재현(T1·T2) · 플레이스홀더(T6·T7). A-2 는 기각이라 없음 — 의도된 공백.
- **placeholder 스캔**: render.js·view() 는 규칙 서술+계약 명시로 대체(캔버스 그리기의 픽셀 명세는 코드보다 규칙이 정확) — 구현 재량 허용 범위를 명시했으므로 통과.
- **타입 일관성**: `applyGate(count,{op,value})`·`stepCombat(state,{x,count,fireRateMult},dt,rnd)`·`effects(up,isDaily)` 시그니처를 태스크 간 대조 완료. BAL 키(fx.slowmoAt 등)와 테스트 기대값 일치 확인.
