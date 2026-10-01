// rush3-story — 스토리 스틸컷(이사님 결정 2026-10-01 — 설계서 docs/superpowers/specs/2026-10-01-story-stillcuts-design.md) V3-STORY.
//  도시 탈환전 9장: S0 프롤로그(아직 안 봤으면 출격 직전) · S1~S8 게임 줄 보스 판 승리(그 장면을 아직 안 봤으면 결과 화면 앞).
//  스토리는 실제 게임 진입점에서만 켠다(boot(…, { story: true }) · ?dev=1 이면 꺼짐). 검사 셸은 bootApp({ story: true }) 로 켠다
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

// ─────────────────────────────── 셸 흐름(상태 'story') ───────────────────────────────
import { bootApp } from './lib/rush3-shell.mjs';
import { pickInput, weakenBosses, weakenCrowd, weakenBounties, wipeSquad } from './lib/rush3-policies.mjs';

const enter = (h) => h.win.fire('keydown', { code: 'Enter' });
//  판을 끝까지(검사 도구 — 보스·일반 적·현상금 적 체력 1, 이길 때는 병사 무적 · 질 때는 부대 전멸). 상태가 'run' 인 동안만(승리 여운 포함)
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
