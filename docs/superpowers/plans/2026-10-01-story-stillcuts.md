# 스토리 스틸컷 1단계(그림 없이 화면·흐름·저장) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보스 판을 이겼을 때(그 장면을 아직 안 봤으면) 결과 화면 앞에 스토리 스틸컷 한 장, 아직 안 봤으면 출격 직전에 프롤로그 한 장을 보여 준다 — 그림이 없어도 대사 화면이 나온다.

**Architecture:** 이야기 데이터는 순수 모듈 `rush3/story.js` 한 곳. 셸(`rush3/main.js`)에 상태 `'story'` 를 더해 finishRun(보스 승리)·startRun(프롤로그)에서 들어가고, 누르면(0.5초 잠금 뒤) 결과 화면 또는 원래 판으로. 렌더러(`rush3/render.js`)의 `drawStory` 가 그림(cover)·대사 띠·표시 이름·계속 안내를 그린다. 본 장면은 v3 저장의 `seenStory` 목록.

**Tech Stack:** 바닐라 JS(ES 모듈) · Canvas 2D · node:test · Playwright(글 폭 측정·캡처).

**Spec:** `docs/superpowers/specs/2026-10-01-story-stillcuts-design.md`

## Global Constraints

- 이사님께 보이는 글은 모두 한국어. 대사는 설계서 2장 표 그대로(글자 하나 바꾸지 않는다 — 폭이 넘치면 글자 크기를 줄인다, 최소 15px).
- 자동 줄바꿈 없음(어절 쪼개짐 금지). 대사 띠 안 폭 408px.
- 스토리는 실제 게임 진입점에서만 켠다(`boot(…, { story: true })`). `?dev=1` 이면 끈다(점검·캡처 도구가 그대로 돈다). 검사 셸(`bootApp`)은 기본 꺼짐, `story: true` 로 켠다.
- 저장: v3 키 그대로(스키마 v 3), 최상위 `seenStory`(본 id 목록, 정규화 = 아는 id·중복 제거·배열 아니면 []).
- 그림: `assets/rush3/story/<id>.webp`, 데이터 `art: false` 인 동안 불러오지 않는다(404 금지).
- 규칙 모듈(combat·stages·courses·balance 등)은 건드리지 않는다. 결과 화면·코인·기록 불변.
- 검사 두 묶음 전부 통과(`node --test tests/rush3-*.test.mjs` · `node --test tests/rush-*.test.mjs`). 커밋은 한국어 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 파일 쓰기 스크립트는 LF 만 넘기고 외톨이 CR 0 확인(관찰 40).

---

### Task 1: 이야기 데이터 + 저장 목록

**Files:**
- Create: `rush3/story.js`
- Modify: `rush3/save.js`(defaults · normalize · 머리 주석)
- Test: `tests/rush3-story.test.mjs`(STORY-1 · STORY-6)

**Interfaces:**
- Produces: `STORY`(얼린 배열 9개 `{ id, stage, label, art, lines: [2] }`) · `STORY_IDS` · `storyById(id) → entry|null` · `storyIdForStage(stageId) → 'S1'…'S8'|null` · `storyImagePath(id) → 'assets/rush3/story/<id>.webp'` · `normSeenStory(list) → string[]` · `STORY_INPUT_LOCK = 0.5` · `STORY_FADE = 0.3`. save: `get().seenStory`(배열), `patch({ seenStory })`.

- [ ] **Step 1: 실패하는 검사 쓰기** — `tests/rush3-story.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY, STORY_IDS, storyById, storyIdForStage, storyImagePath, normSeenStory, STORY_INPUT_LOCK, STORY_FADE } from '../rush3/story.js';
import { ALL_STAGE_IDS, stageKindOf } from '../rush3/stages.js';
import { createSave3 } from '../rush3/save.js';
import { memStorage } from './lib/rush3-shell.mjs';

test('STORY-1: 9장 — S0 프롤로그(판 없음) + 게임 줄 보스 판 8개(판 종류 표 순서) · 대사 2줄 · 금지어 없음 · art 는 아직 false · 경로 · 얼림', () => {
  assert.deepEqual(STORY_IDS, ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']);
  const bossStages = ALL_STAGE_IDS.filter((id) => stageKindOf(id, 'brutal') === 'boss');
  assert.deepEqual(bossStages, [3, 6, 9, 12, 15, 18, 21, 24]);
  assert.equal(STORY[0].stage, null);
  assert.deepEqual(STORY.slice(1).map((s) => s.stage), bossStages);
  assert.deepEqual(STORY.map((s) => s.label), ['프롤로그', '이야기 1', '이야기 2', '이야기 3', '이야기 4', '이야기 5', '이야기 6', '이야기 7', '에필로그']);
  for (const s of STORY) {
    assert.equal(s.lines.length, 2, s.id);
    for (const l of s.lines) { assert.ok(typeof l === 'string' && l.trim().length > 0, s.id); assert.ok(!/중간 보스|대물결/.test(l), s.id + ' 금지어'); }
    assert.equal(s.art, false, s.id + ' 그림은 2단계');
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.lines));
  }
  assert.deepEqual(STORY[8].lines, ['스타 코어 회수. 스타포지 완전 가동.', '도시를 되찾았다. 첫 번째 로봇도 이제 우리 편이다.']);
  assert.deepEqual([storyIdForStage(3), storyIdForStage(24), storyIdForStage(4), storyIdForStage(2), storyIdForStage('proto3')], ['S1', 'S8', null, null, null]);
  assert.equal(storyById('S4').stage, 12); assert.equal(storyById('X'), null);
  assert.equal(storyImagePath('S3'), 'assets/rush3/story/S3.webp');
  assert.deepEqual([STORY_INPUT_LOCK, STORY_FADE], [0.5, 0.3]);
});

test('STORY-6: 저장 seenStory — 기본 [] · 정규화(아는 id 만 · 중복 제거 · 배열 아니면 []) · patch 로 더한다 · v 3 그대로', () => {
  assert.deepEqual(normSeenStory(['S1', 'S1', 'X', 3, 'S0']), ['S1', 'S0']);
  assert.deepEqual(normSeenStory('S1'), []); assert.deepEqual(normSeenStory(null), []);
  const sv = createSave3(memStorage());
  assert.deepEqual(sv.get().seenStory, []);
  sv.patch({ seenStory: ['S2', 'bad', 'S2'] });
  assert.deepEqual(sv.get().seenStory, ['S2']);
  assert.equal(sv.get().v, 3);
  const st = memStorage();
  st.setItem('starforgeRush.v3', JSON.stringify({ v: 3, stages: {}, seenStory: 'oops' }));
  assert.deepEqual(createSave3(st).get().seenStory, []);
});
```

- [ ] **Step 2: 실행해 실패 확인** — `node --test tests/rush3-story.test.mjs` → `Cannot find module '../rush3/story.js'`

- [ ] **Step 3: `rush3/story.js` 쓰기**

```js
// rush3/story.js — 스토리 스틸컷(이사님 결정 2026-10-01 — 설계서 docs/superpowers/specs/2026-10-01-story-stillcuts-design.md).
//  도시 탈환전 9장: S0 프롤로그(아직 안 봤으면 출격 직전) · S1~S7 보스 판 승리(3·6·9·12·15·18·21) · S8 에필로그(24 승리).
//  대사는 게임이 글자로 그린다(그림에 글자 없음 — 한글이 깨지거나 어절이 쪼개지지 않게). art = 그림 파일이 있는가 — 생기기 전에는 false(불러오지 않는다)
//  순수: 난수·시계·저장·화면 없음
const S = (id, stage, label, l1, l2) => Object.freeze({ id, stage, label, art: false, lines: Object.freeze([l1, l2]) });
export const STORY = Object.freeze([
  S('S0', null, '프롤로그', '도시가 고철 군단에게 넘어갔다.', '포지 게이트로 부대를 키워 도시를 되찾아라.'),
  S('S1', 3, '이야기 1', '모든 고철 기계에 같은 왕관 표식이 있다.', '누군가 이 군단을 지휘하고 있다.'),
  S('S2', 6, '이야기 2', '군단은 기계를 붙잡아 부품으로 쓰고 있었다.', '구출한 로봇들이 합류한다!'),
  S('S3', 9, '이야기 3', '이 열차는 고철을 실어 나르고 있었다.', '군단이 태어나는 곳은 저 용광로다.'),
  S('S4', 12, '이야기 4', '이 설계도는… 스타포지의 것이다.', '적이 우리 기술로 만들어지고 있었다.'),
  S('S5', 15, '이야기 5', '쓰러뜨린 보스가 다시 조립되어 돌아왔다.', '신호를 끊지 않으면 끝이 없다.'),
  S('S6', 18, '이야기 6', '신호의 근원은 도시 중심의 왕관 탑이다.', '마지막 길이 열린다.'),
  S('S7', 21, '이야기 7', '…나는 스타포지가 만든 첫 번째 로봇이었다.', '버려진 나를 이 도시가 왕으로 만들었다.'),
  S('S8', 24, '에필로그', '스타 코어 회수. 스타포지 완전 가동.', '도시를 되찾았다. 첫 번째 로봇도 이제 우리 편이다.'),
]);
export const STORY_IDS = Object.freeze(STORY.map((s) => s.id));
const BY_ID = new Map(STORY.map((s) => [s.id, s]));
const BY_STAGE = new Map(STORY.filter((s) => s.stage != null).map((s) => [s.stage, s.id]));
export const storyById = (id) => BY_ID.get(id) ?? null;
export const storyIdForStage = (stageId) => BY_STAGE.get(stageId) ?? null;
export const storyImagePath = (id) => 'assets/rush3/story/' + id + '.webp';
/** 본 장면 목록 정규화: 아는 id 만 · 처음 나온 차례 · 중복 없음 · 배열이 아니면 [] */
export function normSeenStory(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const id of list) if (BY_ID.has(id) && !out.includes(id)) out.push(id);
  return out;
}
//  나타난 뒤 입력을 받지 않는 시간(초 — 게임 중 누르던 손가락·연타로 바로 넘어가지 않게) · 나타나는 시간(초)
export const STORY_INPUT_LOCK = 0.5;
export const STORY_FADE = 0.3;
```

- [ ] **Step 4: `rush3/save.js` — import · defaults · normalize**

```js
import { normSeenStory } from './story.js';
// defaults(): …, seenUpHint: false, seenUpRec: false, seenStory: [] }
// normalize(d): out.seenUpRec = d.seenUpRec === true; 다음 줄에
//  스토리 스틸컷(2026-10-01): 본 장면 id 목록(rush3/story.js normSeenStory)
out.seenStory = normSeenStory(d.seenStory);
```
머리 주석의 최상위 필드 목록에 `seenStory(본 스토리 컷 id 목록, 2026-10-01)` 를 더한다.

- [ ] **Step 5: 실행해 통과 확인** — `node --test tests/rush3-story.test.mjs` → STORY-1 · STORY-6 통과

- [ ] **Step 6: 커밋** — `feat(v3): 스토리 1/3 — 이야기 데이터(rush3/story.js) · 저장 seenStory`

### Task 2: 셸 흐름(상태 'story')

**Files:**
- Modify: `rush3/main.js`(import · storyOn · story 변수 · prefetchStory/showStory/endStory · startRun 앞 프롤로그 · finishRun 끝 보스 컷 · view · pointerdown · keydown · api · 진입점)
- Modify: `tests/lib/rush3-shell.mjs`(bootApp `story` 인자)
- Test: `tests/rush3-story.test.mjs`(STORY-2 · STORY-3 · STORY-4)

**Interfaces:**
- Consumes: Task 1 의 `storyById · storyIdForStage · storyImagePath · STORY_INPUT_LOCK`, save `seenStory`.
- Produces: 상태 `'story'` · view `v.story = { id, label, lines, img, t, ready }` · api `showStory(id)`(개발 미리보기, 저장 안 함) · `getStory() → { id, next, preview, t0 } | null`.

- [ ] **Step 1: 실패하는 검사 쓰기**(STORY-2·3·4 — 아래 코드를 같은 파일에 덧붙인다)

```js
import { bootApp } from './lib/rush3-shell.mjs';
import { pickInput, weakenBosses, weakenCrowd, weakenBounties, wipeSquad } from './lib/rush3-policies.mjs';

const enter = (h) => h.win.fire('keydown', { code: 'Enter' });
function driveToEnd(h, { lose = false } = {}) {
  let n = 0;
  while (h.app.getState() === 'run' && n++ < 30000) {
    const run = h.app.getRun();
    weakenBosses(run); weakenCrowd(run); weakenBounties(run);
    if (lose) wipeSquad(run); else for (const u of run.units) u.hp = 1e9;
    h.app.input.state.pointerX = pickInput('evLead', run).pointerX;
    h.frames(1);
  }
  return n;
}

test('STORY-2: 프롤로그 — 새 저장으로 출격하면 판 대신 S0 · 0.5초 안의 누르기는 무시 · 누르면 그 판 시작 · 다음 출격엔 없음 · ?dev=1 · story 꺼짐이면 없음', async () => {
  const h = await bootApp({ story: true });
  h.app.startRun(1);
  assert.equal(h.app.getState(), 'story');
  assert.equal(h.app.getStory().id, 'S0');
  h.frames(10); h.tap(240, 400);
  assert.equal(h.app.getState(), 'story', '0.5초 안에는 넘어가지 않는다');
  h.frames(30); h.tap(240, 400);
  assert.equal(h.app.getState(), 'run');
  assert.equal(h.app.getRun().stageId, 1);
  assert.deepEqual(h.save.get().seenStory, ['S0']);
  h.app.toTitle(); h.app.startRun(1);
  assert.equal(h.app.getState(), 'run', '본 프롤로그는 다시 나오지 않는다');
  for (const opts of [{ story: true, search: '?dev=1' }, {}]) {
    const d = await bootApp(opts);
    d.app.startRun(1);
    assert.equal(d.app.getState(), 'run', JSON.stringify(opts));
  }
});

test('STORY-3: 보스 판 승리 — 여운 뒤 결과 화면 대신 S1 · Enter(0.5초 뒤) → 결과 화면(같은 결과) · 본 목록에 S1 · 다시 이기면 바로 결과 화면', async () => {
  const h = await bootApp({ story: true, unlockThrough: 2 });
  h.save.patch({ seenStory: ['S0'] });
  h.app.startRun(3);
  driveToEnd(h);
  assert.equal(h.app.getState(), 'story');
  assert.equal(h.app.getStory().id, 'S1');
  const r = h.app.getResult();
  assert.equal(r.won, true);
  enter(h); assert.equal(h.app.getState(), 'story');
  h.frames(31); enter(h);
  assert.equal(h.app.getState(), 'result');
  assert.equal(h.app.getResult(), r, '결과는 컷 전에 만든 그대로');
  assert.deepEqual(h.save.get().seenStory, ['S0', 'S1']);
  h.app.startRun(3);
  driveToEnd(h);
  assert.equal(h.app.getState(), 'result', '본 컷은 다시 나오지 않는다');
});

test('STORY-4: 컷이 없는 경우 — 진 보스 판 · 포기 · 웨이브 판 승리', async () => {
  const lose = await bootApp({ story: true, unlockThrough: 2 });
  lose.save.patch({ seenStory: ['S0'] });
  lose.app.startRun(3); driveToEnd(lose, { lose: true });
  assert.equal(lose.app.getState(), 'result'); assert.equal(lose.app.getResult().won, false);
  const quit = await bootApp({ story: true, unlockThrough: 2 });
  quit.save.patch({ seenStory: ['S0'] });
  quit.app.startRun(3); quit.frames(30); quit.app.giveUp();
  assert.equal(quit.app.getState(), 'result');
  const wave = await bootApp({ story: true });
  wave.save.patch({ seenStory: ['S0'] });
  wave.app.startRun(1); driveToEnd(wave);
  assert.equal(wave.app.getState(), 'result'); assert.equal(wave.app.getResult().won, true);
  assert.deepEqual(wave.save.get().seenStory, ['S0']);
});
```

- [ ] **Step 2: 실행해 실패 확인** — `node --test tests/rush3-story.test.mjs` → STORY-2 `'run' !== 'story'`

- [ ] **Step 3: `tests/lib/rush3-shell.mjs`** — bootApp 인자에 `story = false`, deps 에 `story`

```js
export async function bootApp({ storage = memStorage(), search = '', dateNow = () => 1_700_000_000_000, save, withOps = false, unlockThrough = 0, story = false } = {}) {
// const deps = { win, doc: null, raf: …, now: …, save: sv, audio, dateNow, sprites: …, story };
```

- [ ] **Step 4: `rush3/main.js`**

```js
import { storyById, storyIdForStage, storyImagePath, STORY_INPUT_LOCK } from './story.js';
// boot 안, let state … 다음 줄:
  //  스토리 스틸컷(2026-10-01 이사님 결정): 진입점이 story: true 로 켠다 · ?dev=1(점검·캡처)이면 끈다 · 검사 셸은 기본 꺼짐
  const storyOn = deps.story === true && !devFlag();
  let story = null;
  const storyImgs = new Map();
  const storySeen = (id) => save.get().seenStory.includes(id);
  function prefetchStory(id) {
    const s = storyById(id);
    if (!s || !s.art || storyImgs.has(id) || typeof Image === 'undefined') return;
    const im = new Image();
    im.decoding = 'async';
    im.src = storyImagePath(id);
    storyImgs.set(id, im);
  }
  const storyImg = (id) => { const im = storyImgs.get(id); return im && im.complete && im.naturalWidth > 0 ? im : null; };
  /** next = { kind: 'result' } | { kind: 'start', id } | { kind: 'title' } · preview = 개발 미리보기(저장 안 함) */
  function showStory(id, next, { preview = false } = {}) {
    prefetchStory(id);
    story = { id, t0: nowSec(), next, preview };
    state = 'story';
    au.bgmPlay(BGM.title);
    return true;
  }
  function endStory() {
    if (state !== 'story' || !story || nowSec() - story.t0 < STORY_INPUT_LOCK) return false;
    const { id, next, preview } = story;
    story = null;
    if (!preview && !storySeen(id)) save.patch({ seenStory: [...save.get().seenStory, id] });
    if (next.kind === 'result') state = 'result';
    else if (next.kind === 'start') startRun(next.id);
    else toTitle();
    return true;
  }
```
startRun — 잠금 거절(`return false`) 바로 뒤:
```js
    //  스토리 프롤로그(S0): 아직 안 봤으면 출격 직전에 한 번(개발용 판 제외) — 누르면 이 판을 시작한다(endStory → startRun)
    const devRun = devPass || PROTO_IDS.includes(id) || !!devStartWeapon().startWeapon;
    if (storyOn && !devRun && !storySeen('S0')) return showStory('S0', { kind: 'start', id });
    //  이 판의 보스 컷(아직 안 봤으면) 그림만 미리 — 첫 화면을 느리게 하지 않는다
    if (storyOn && storyIdForStage(id) && !storySeen(storyIdForStage(id))) prefetchStory(storyIdForStage(id));
```
finishRun — 끝의 `au.bgmPlay(BGM.title);` 다음:
```js
    //  스토리 스틸컷: 보스 판 승리(포기·개발용 판 제외)에서 그 장면을 아직 안 봤으면 결과 화면 앞에 한 장 — 정산·기록은 이미 끝났다
    const sid = won && !aborted && !run.devWeapon ? storyIdForStage(id) : null;
    if (storyOn && sid && !storySeen(sid)) showStory(sid, { kind: 'result' });
```
view(now) — 상태 분기에:
```js
    } else if (state === 'story' && story) {
      const s = storyById(story.id), t = Math.max(0, now - story.t0);
      v.story = { id: story.id, label: s.label, lines: s.lines, img: storyImg(story.id), t, ready: t >= STORY_INPUT_LOCK };
```
pointerdown — `au.unlock();` 다음: `if (state === 'story') { endStory(); return; }` · keydown — Escape 분기에 `else if (state === 'story') endStory();`, Enter/Space 분기에 `else if (state === 'story') endStory();` · toTitle 첫 줄에 `story = null;` · api 에 `showStory: (id) => (storyById(id) ? showStory(id, { kind: 'title' }, { preview: true }) : false), getStory: () => story` · boot 끝(return api 앞)에 `if (storyOn && !storySeen('S0')) prefetchStory('S0');` · 진입점 `boot(document.getElementById('game3'), { story: true });`

- [ ] **Step 5: 실행해 통과 확인** — `node --test tests/rush3-story.test.mjs` → STORY-1~4·6 통과. 이어 두 묶음 전체 통과.

- [ ] **Step 6: 커밋** — `feat(v3): 스토리 2/3 — 상태 story(보스 승리 컷 · 프롤로그 · 0.5초 잠금)`

### Task 3: 화면(drawStory)

**Files:**
- Modify: `rush3/render.js`(import · STORY_UI · fitPx · drawStory · draw 분기)
- Test: `tests/rush3-story.test.mjs`(STORY-5)

**Interfaces:**
- Consumes: view `v.story`(Task 2), `STORY_FADE`(Task 1).
- Produces: `export const STORY_UI`(띠 자리·글 크기·색·안내 글).

- [ ] **Step 1: 실패하는 검사**

```js
import { STORY_UI } from '../rush3/render.js';
test('STORY-5: 화면 — 표시 이름 · 대사 두 줄 · 0.5초 뒤 계속 안내 · 그림이 없으면 대사 화면만(그림 그리기 없음)', async () => {
  const h = await bootApp({ story: true, withOps: true });
  h.app.startRun(1);
  let t = h.textNow();
  assert.ok(t.includes('프롤로그') && t.includes('도시가 고철 군단에게 넘어갔다.') && t.includes('포지 게이트로 부대를 키워 도시를 되찾아라.'), JSON.stringify(t));
  assert.ok(!t.includes(STORY_UI.hint), '잠금 동안 계속 안내 없음');
  h.frames(31);
  t = h.textNow();
  assert.ok(t.includes(STORY_UI.hint));
  assert.equal(h.ops.filter((o) => o.op === 'drawImage').length, 0, '그림이 없으면 그리지 않는다');
});
```

- [ ] **Step 2: 실패 확인** — `STORY_UI` 가 없다

- [ ] **Step 3: `rush3/render.js`**

```js
import { STORY_FADE } from './story.js';
//  스토리 스틸컷 화면(2026-10-01): 아래 대사 띠(x 14 ~ 466) · 대사는 줄마다 띠 안 폭에 맞는 크기(19 → 최소 15px, 자동 줄바꿈 없음)
export const STORY_UI = Object.freeze({ x: 14, y: 600, w: 452, h: 176, pad: 22, textW: 408, line1: 52, lineGap: 46, fs: 19, fsMin: 15,
  bg: '#0B1220', box: 'rgba(8,12,22,0.80)', labelFs: 16, hintFs: 14, hint: '화면을 누르면 계속 ▶' });
// createRenderer3 안:
  function fitPx(text, maxW, start, min, weight = 'bold') {
    for (let px = start; px > min; px--) { ctx.font = weight + ' ' + px + 'px ' + FONT; if (ctx.measureText(text).width <= maxW) return px; }
    return min;
  }
  function drawStory(view) {
    const s = view.story, U = STORY_UI;
    ctx.fillStyle = U.bg; ctx.fillRect(0, 0, W, H);
    if (!s) return;
    const a = Math.min(1, s.t / STORY_FADE);
    if (s.img) {
      const k = Math.max(W / s.img.width, H / s.img.height), dw = s.img.width * k, dh = s.img.height * k;
      ctx.globalAlpha = a; ctx.drawImage(s.img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = U.box; roundRect(U.x, U.y, U.w, U.h, 14); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    outlinedText(s.label, 18, 34, U.labelFs, C.gold, 'bold', 4);
    s.lines.forEach((line, i) => outlinedText(line, U.x + U.pad, U.y + U.line1 + i * U.lineGap, fitPx(line, U.textW, U.fs, U.fsMin), C.hero, 'bold', 4));
    if (s.ready) {
      ctx.textAlign = 'right';
      ctx.globalAlpha = a * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(s.t * 4)));
      outlinedText(U.hint, U.x + U.w - U.pad, U.y + U.h - 24, U.hintFs, C.hud, 'bold', 3);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
// draw(view): `} else if (view.state === 'upgrade') { … }` 다음, `} else if (view.run) {` 앞에
    } else if (view.state === 'story') {
      drawStory(view);
```

- [ ] **Step 4: 통과 확인 + 글 폭 측정** — STORY-5 통과 · Chromium 으로 18줄을 `bold 19px system-ui` 부터 재어 줄마다 쓰일 크기와 폭 기록(`E:\workspace\claude\neon-fleet\review\20261001_story\measure_lines.py`) — 모두 15px 이상에서 408px 이하

- [ ] **Step 5: 커밋** — `feat(v3): 스토리 3/3 — 스틸컷 화면(대사 띠 · 줄마다 맞춤 크기 · 계속 안내)`

### Task 4: 확인·기록·반영

- [ ] 두 묶음 전체 통과 · 24판 점검(`python tools/health_sweep.py --stages 1,3,12` — ?dev=1 이라 스토리 꺼짐, 회귀만) 오류 0
- [ ] 캡처: 개발 미리보기(`__rush3App.showStory('S0'…'S8')`)로 9장 화면(폴백) + 실제 흐름(새 저장 · ?dev 없이) 프롤로그 1장 — `E:\workspace\claude\neon-fleet\review\20261001_story\`
- [ ] 커밋 → `git push origin HEAD:master` → 라이브 새 브라우저: 새 저장으로 출격 → 프롤로그 → 누르면 판 시작(콘솔 오류 0)
- [ ] 기록: CHANGELOG r4.32 · 설계 계약서 r4.32 문단 · INBOX(10/1 스토리 지시 ✅ 1단계) · BACKLOG(2단계 그림 9장 — Gemini 탭 필요) · LOOP 도구 줄(?dev=1 이면 스토리 꺼짐 · showStory) · 메모리
