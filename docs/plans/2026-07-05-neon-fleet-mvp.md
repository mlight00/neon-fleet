# 네온 함대 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 문서(docs/specs/2026-07-05-neon-fleet-design.md)의 MVP 범위 — 스테이지 1 한 판 전체가 폰/PC 브라우저에서 돌아가는 게임 — 를 완성한다.

**Architecture:** 빌드 도구 없는 ES 모듈 구성. 게임 규칙(게이트 연산, 크리스탈, 충돌, 청크 추첨, 저장)은 DOM 없는 순수 함수로 분리해 `node --test`로 검증하고, Canvas 렌더링·입력·게임 루프는 수동 검증 체크리스트로 확인한다.

**Tech Stack:** Vanilla JS (ES Modules), Canvas 2D, Node.js 내장 test runner (`node --test`), localStorage.

**실행 방식 주의:** 이 계획은 같은 세션에서 작성자가 직접 실행한다. 순수 로직 모듈은 계획에 테스트·구현 코드를 완전히 기재했고, 렌더링/루프 모듈은 인터페이스와 핵심 코드를 기재하되 세부 그리기 코드는 구현 시 완성한다 (수동 검증 단계에서 확인).

---

## 파일 구조

```
neon-fleet/
├── index.html            # Canvas + UI 오버레이 + main.js 로드
├── css/style.css         # 세로형 레이아웃, 오버레이, 네온 폰트 스타일
├── js/
│   ├── balance.js        # 모든 밸런스 수치 (데이터만, 로직 없음)
│   ├── logic.js          # 순수 함수: 게이트 연산, 크리스탈 피해, 폭풍 존 감쇠
│   ├── collision.js      # 순수 함수: 원-원, 원-사각 충돌
│   ├── chunks.js         # 청크 패턴 데이터 + 진행도별 추첨 (순수)
│   ├── save.js           # 저장 래퍼 (storage 주입식 → 테스트 가능)
│   ├── input.js          # 터치/마우스/키보드 → targetX
│   ├── entities.js       # 개체 클래스 (logic.js 호출, update/draw)
│   ├── render.js         # 스타필드, 글로우 헬퍼, HUD
│   ├── ui.js             # 타이틀/결과/실패 오버레이 (DOM)
│   └── main.js           # 게임 루프, 상태 머신, 스폰 통합
├── tests/
│   ├── logic.test.mjs
│   ├── collision.test.mjs
│   ├── chunks.test.mjs
│   └── save.test.mjs
└── docs/ (기존)
```

---

### Task 1: 프로젝트 뼈대 (index.html + css + 빈 루프)

**Files:** Create: `index.html`, `css/style.css`, `js/main.js`

- [ ] **Step 1:** index.html 작성 — `<canvas id="game">`, `#overlay` div, `<script type="module" src="js/main.js">`. viewport meta (`user-scalable=no`).
- [ ] **Step 2:** style.css 작성 — 배경 #05060f, canvas 중앙 배치(모바일 100%, PC는 세로 기둥 max-width 계산), overlay absolute 겹침, 버튼 네온 스타일.
- [ ] **Step 3:** main.js — 캔버스 리사이즈(논리 폭 480 고정 배율), requestAnimationFrame 루프 + dt 클램프(최대 50ms), 상태 머신 골격 `{state: 'title'|'play'|'result'}`, 임시로 배경색만 칠함.

```js
// main.js 핵심 골격
const LOGICAL_W = 480;
let last = 0;
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  update(dt); draw();
  requestAnimationFrame(frame);
}
```

- [ ] **Step 4:** 브라우저(preview 서버 또는 file://)로 열어 검은 화면 + 콘솔 에러 0 확인.
- [ ] **Step 5:** Commit `feat: 프로젝트 뼈대 (캔버스, 루프, 리사이즈)`

### Task 2: balance.js (수치 단일 소스)

**Files:** Create: `js/balance.js`

- [ ] **Step 1:** 설계 §3.7 수치를 객체로 기재. 로직 없음.

```js
export const BAL = {
  logicalW: 480,
  scrollSpeed: 220, scrollSpeedLateBonus: 1.1,
  squad: { start: 3, fireRate: 2, damage: 1, drawCap: 60, radius: 7, laneMargin: 40 },
  bullet: { speed: 620, radius: 3, cap: 400 },
  powerModule: { duration: 10, multiplier: 2 },
  crystal: { small: [10, 20], mid: [40, 80], large: [150, 400] },
  creature: { small: 5, mid: 20, large: 60, speed: 70 },
  boss: { hp: 800, minionInterval: 3.5, shotInterval: 2.2, shotDamage: 5 },
  chunk: { heightPx: 900, perRun: 10 },
  stage1: { name: 'STAGE 1' },
};
```

- [ ] **Step 2:** Commit `feat: 밸런스 수치 단일 소스`

### Task 3: logic.js — 게이트/크리스탈/폭풍 순수 함수 (TDD)

**Files:** Create: `js/logic.js`, Test: `tests/logic.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, hitCrystal, stormDecay } from '../js/logic.js';

test('applyGate: add/mul/sub/div, 최소 0, 나눗셈 내림', () => {
  assert.equal(applyGate(10, { op: '+', value: 5 }), 15);
  assert.equal(applyGate(10, { op: 'x', value: 2 }), 20);
  assert.equal(applyGate(10, { op: '-', value: 50 }), 0);
  assert.equal(applyGate(7, { op: '/', value: 2 }), 3);
});

test('hitCrystal: 데미지 누적, 파괴 시 원래 값 보상', () => {
  const c = { hp: 20, reward: 20 };
  assert.deepEqual(hitCrystal(c, 6), { hp: 14, broken: false, reward: 0 });
  assert.deepEqual(hitCrystal({ hp: 3, reward: 20 }, 6), { hp: 0, broken: true, reward: 20 });
});

test('stormDecay: 초당 10% 감소, 최소 0, 소수 내림이지만 1기 이상 있으면 최소 1 감소 방지 아님', () => {
  // 100기가 0.5초 폭풍 통과 → 5% 감소 → 95기
  assert.equal(stormDecay(100, 0.5, 0.10), 95);
  assert.equal(stormDecay(0, 1, 0.10), 0);
});
```

- [ ] **Step 2:** `node --test tests/logic.test.mjs` → FAIL (모듈 없음) 확인
- [ ] **Step 3: 최소 구현**

```js
export function applyGate(count, gate) {
  let n = count;
  if (gate.op === '+') n = count + gate.value;
  else if (gate.op === '-') n = count - gate.value;
  else if (gate.op === 'x') n = count * gate.value;
  else if (gate.op === '/') n = Math.floor(count / gate.value);
  return Math.max(0, Math.round(n));
}
export function hitCrystal(c, dmg) {
  const hp = Math.max(0, c.hp - dmg);
  const broken = hp === 0;
  return { hp, broken, reward: broken ? c.reward : 0 };
}
export function stormDecay(count, dt, ratePerSec) {
  return Math.max(0, Math.floor(count * (1 - ratePerSec * dt)));
}
```

- [ ] **Step 4:** 테스트 PASS 확인
- [ ] **Step 5:** Commit `feat: 게이트/크리스탈/폭풍 순수 로직 + 테스트`

### Task 4: collision.js (TDD)

**Files:** Create: `js/collision.js`, Test: `tests/collision.test.mjs`

- [ ] **Step 1: 실패하는 테스트**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleHit, circleRectHit } from '../js/collision.js';

test('circleHit: 겹치면 true, 접점 경계 포함', () => {
  assert.equal(circleHit(0, 0, 5, 8, 0, 4), true);   // 거리8 < 5+4
  assert.equal(circleHit(0, 0, 5, 10, 0, 4), false); // 거리10 > 9
});
test('circleRectHit: 사각형 내부/모서리/바깥', () => {
  assert.equal(circleRectHit(5, 5, 2, 0, 0, 10, 10), true);
  assert.equal(circleRectHit(12, 5, 3, 0, 0, 10, 10), true);  // 오른쪽 변에 걸침
  assert.equal(circleRectHit(15, 5, 3, 0, 0, 10, 10), false);
});
```

- [ ] **Step 2:** FAIL 확인 → **Step 3: 구현**

```js
export function circleHit(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2, dy = y1 - y2, r = r1 + r2;
  return dx * dx + dy * dy <= r * r;
}
export function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= cr * cr;
}
```

- [ ] **Step 4:** PASS → **Step 5:** Commit `feat: 충돌 판정 + 테스트`

### Task 5: chunks.js — 청크 데이터 + 추첨 (TDD)

**Files:** Create: `js/chunks.js`, Test: `tests/chunks.test.mjs`

청크 형식: `{ tier: 'easy'|'mid'|'hard', items: [{ type, x(0~1 비율), y(0~1 청크 내 비율), ...파라미터 }] }`
item type: `crystal {value}`, `gatePair {left:{op,value}, right:{op,value}}`, `creature {size}`, `meteor {hp}`, `power`, `storm {x,w,h}` (storm은 MVP 스테이지1에서 미사용이지만 형식만 정의).

- [ ] **Step 1: 실패하는 테스트** — 추첨 로직만 테스트 (데이터는 검사 함수로)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNKS, pickTier, pickChunk, mulberry32 } from '../js/chunks.js';

test('pickTier: 진행도에 따라 easy→mid→hard', () => {
  assert.equal(pickTier(0.0), 'easy');
  assert.equal(pickTier(0.35), 'mid');
  assert.equal(pickTier(0.8), 'hard');
});
test('청크 풀: easy≥5, mid≥6, hard≥4', () => {
  const c = (t) => CHUNKS.filter((k) => k.tier === t).length;
  assert.ok(c('easy') >= 5); assert.ok(c('mid') >= 6); assert.ok(c('hard') >= 4);
});
test('pickChunk: 시드 고정 시 재현 가능, 직전 청크 연속 회피', () => {
  const rng = mulberry32(42);
  const a = pickChunk('easy', rng, null);
  const b = pickChunk('easy', rng, a);
  assert.notEqual(a, b);
});
```

- [ ] **Step 2:** FAIL 확인 → **Step 3: 구현** — `mulberry32` 시드 RNG, `pickTier(progress)` (경계 0.3/0.65), `pickChunk(tier, rng, prev)` (prev 제외 추첨), CHUNKS 배열에 손 설계 패턴 15개 (easy 5: 크리스탈·+게이트 위주 / mid 6: 게이트 쌍 선택+크리처 / hard 4: 크리처 무리·리스크-리워드 배치 — 대형 크리스탈 옆 크리처).
- [ ] **Step 4:** PASS → **Step 5:** Commit `feat: 청크 15종 + 난이도 추첨 + 시드 RNG`

### Task 6: save.js (TDD, storage 주입)

**Files:** Create: `js/save.js`, Test: `tests/save.test.mjs`

- [ ] **Step 1: 실패하는 테스트**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../js/save.js';

test('저장/로드 왕복', () => {
  const mem = new Map();
  const fake = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = createSave(fake);
  s.set({ best: 120 });
  assert.equal(createSave(fake).get().best, 120);
});
test('storage 불능 시 메모리 폴백 + available=false', () => {
  const broken = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  const s = createSave(broken);
  assert.equal(s.available, false);
  s.set({ best: 5 });
  assert.equal(s.get().best, 5); // 세션 내 메모리 유지
});
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 (`createSave(storage = globalThis.localStorage)`, 키 `neonFleet.v1`, JSON parse 실패 시 기본값 `{best:0, coins:0}`)
- [ ] **Step 4:** PASS → **Step 5:** Commit `feat: 저장 래퍼 (폴백 안전) + 테스트`

### Task 7: input.js + render.js

**Files:** Create: `js/input.js`, `js/render.js`

- [ ] **Step 1:** input.js — `createInput(canvas, logicalW)` → `{ targetX, attach() }`. pointerdown/move 시 논리좌표 변환해 targetX 갱신, ←/→ 키는 초당 420px 이동 플래그. 터치 스크롤 방지(`touch-action: none`).
- [ ] **Step 2:** render.js — `glow(ctx, fn, color, blur)` 헬퍼(shadowBlur 설정/복원), 스타필드(고정 별 120개, 2층 패럴랙스), `drawHUD(ctx, {count, bossHp, progress})` (상단 진행바+보스HP, 편대 위 `xN` 라벨은 entities에서). 네온 팔레트 상수: 아군 #3ff5e0, 적 #b44cff/#7CFF4C, 위험 #ff3d71, 보상 #ffd93d.
- [ ] **Step 3:** main.js에 임시 연결: 스타필드가 흐르고 마우스/터치 따라 원 하나가 움직이는 화면 확인 (수동).
- [ ] **Step 4:** Commit `feat: 입력 통합 + 네온 렌더 헬퍼/스타필드/HUD`

### Task 8: entities.js — 개체 전부

**Files:** Create: `js/entities.js`

각 개체는 `{update(dt, world), draw(ctx), dead}` 형태. world = `{squad, bullets, spawns, effects, rng, bal}`.

- [ ] **Step 1:** Squad — `count`, `x`(targetX 추적, 반응속도 0.18s), 폭 = `min(120, 12*sqrt(count))`, 발사 타이머(드론 수·발사속도 비례로 초당 `count*fireRate`발을 편대 폭에서 분산 발사, 탄 상한 400), `applyDelta(n)` (crystal 보상/크리처 피해/게이트), count 표시(60기 초과 시 무리 고정+숫자).
- [ ] **Step 2:** Bullet(직진, 화면 밖 제거) / Crystal(hitCrystal 사용, 숫자 표시, 깨질 때 파티클+보상) / GatePair(통과 시 편대 중심 쪽 1회 적용, applyGate, 적용 순간 값 플래시) / Creature(하강+편대 방향 유도 약간, HP바, 접촉 시 `squad.applyDelta(-남은HP)` 후 소멸) / Meteor(정지·저속, 동일 접촉 규칙) / PowerModule(획득 시 10s 데미지 x2) / Boss(정지, HP, 3.5s마다 소형 크리처 2기 소환, 2.2s마다 조준탄 → 명중 시 -5).
- [ ] **Step 3:** main.js 임시 스폰으로 각 개체 1종씩 눈으로 확인 (수동: 크리스탈 깨짐/게이트 연산/크리처 접촉 감소).
- [ ] **Step 4:** Commit `feat: 게임 개체 전부 (편대/탄/크리스탈/게이트/크리처/운석/모듈/보스)`

### Task 9: main.js 통합 — 트랙 생성 + 상태 머신 + ui.js

**Files:** Modify: `js/main.js`, Create: `js/ui.js`

- [ ] **Step 1:** 트랙 생성 — 판 시작 시 `pickChunk` 10회로 청크 큐 구성, 스크롤 y가 청크 경계 넘을 때 items를 실좌표로 스폰. 마지막 청크 뒤 보스 구간.
- [ ] **Step 2:** 상태 머신 — title → play → (win|lose) → result → play. lose 시 0.5s 내 오버레이. progress = 스크롤량/총길이.
- [ ] **Step 3:** ui.js — 타이틀(게임명+시작 버튼+최고기록), 결과(성공: 남은 드론/코인/신기록 뱃지/가상 퍼센타일 문구, 실패: 진행도%+다시 도전), 버튼은 DOM. save.js로 최고기록 갱신.
- [ ] **Step 4:** 수동 플레이 3판 — 클리어 가능/실패 가능/재시작 1탭 확인.
- [ ] **Step 5:** Commit `feat: 한 판 전체 흐름 (트랙 생성→보스전→결과, 기록 저장)`

### Task 10: 검증 + 마무리

**Files:** Create: `README.md`, Modify: 밸런스 조정 대상 파일

- [ ] **Step 1:** `node --test tests/` 전체 PASS 확인.
- [ ] **Step 2:** 수동 체크리스트 (설계 §8): PC 크롬 — 60fps(개발자도구 성능탭), 드래그 추적, 게이트 값 적용 정확, 실패→재시작 1탭, 새로고침 후 기록 유지. 모바일은 사용자 실기기 테스트로 넘김.
- [ ] **Step 3:** 밸런스 1차 조정 — "강화 없이 3~5판 내 클리어 가능" 기준. 자동 시뮬(입력 중앙 고정)으로 극단 확인.
- [ ] **Step 4:** README.md — 게임 소개, 실행 방법(로컬 서버), 조작법, 폴더 구조.
- [ ] **Step 5:** Commit `docs: README + 밸런스 1차 조정` — MVP 완료.

---

## Self-Review 결과

- 스펙 커버리지: 설계 §3(코어 규칙) → Task 3/4/5/8/9, §4(화면 흐름) → Task 9, §6(아키텍처/에러 처리) → Task 1/6/7, §8(테스트) → 각 TDD Task + Task 10. 폭풍 존·강화 상점·스테이지 2+는 2차 범위로 의도적 제외 (storm은 데이터 형식만 예약).
- 타입 일관성: `applyGate(count, {op,value})`, `hitCrystal({hp,reward}, dmg)`, `createSave(storage)` 시그니처를 Task 간 통일 확인.
- 렌더/개체 Task(7~9)는 같은 세션 실행 전제로 핵심 코드+정확한 동작 명세로 기재 (본 계획 상단 주의 참조).
