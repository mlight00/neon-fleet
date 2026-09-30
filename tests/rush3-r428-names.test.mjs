// rush3-r428-names — r4.28 보스·강적 이름 · '웨이브' 표기(이사님 지시 2026-09-30 "보스들의 이름을 각각 정해주자. 중간보스 이런건 너무 하잖아?" ·
//  "대물결 이런 제목도 웨이브라고 표시하고"). 이름은 rush3/names.js 한 곳 — 같은 그림 = 같은 이름. 화면 글은 모두 bossName·stageBossName 을 거친다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStage, stageKindOf } from '../rush3/stages.js';
import { BOSS_NAMES, MID_NAMES, bossName, stageBossName } from '../rush3/names.js';
import { HORDE_BANNER_TEXT, KIND_BANNER_TEXT, MID_BANNER_TEXT, GOAL_NAME, kindBannerLine, upgradeLines } from '../rush3/main.js';

const NAMES = new Set([...Object.values(BOSS_NAMES), ...Object.values(MID_NAMES)]);

test('NAMES-1: 게임 줄 보스·강적 16판 모두 표의 이름(대신 글 "보스"·"강적"이 아니다) · 같은 그림 = 같은 이름 · 이름은 8자 이하·서로 다르다 · 웨이브 판은 이름 없음', () => {
  const byArt = new Map();
  let named = 0;
  for (let id = 1; id <= 24; id++) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const kind = stageKindOf(id, 'brutal');
    if (kind === 'horde') { assert.equal(stageBossName(st), null, `S${id} 웨이브 판`); continue; }
    for (const e of st.elites) {
      const nm = bossName(e);
      assert.ok(NAMES.has(nm), `S${id} 표의 이름: ${nm}`);
      const art = e.mid ? 'mid:' + (e.look.skin || e.look.kind) : 'boss:' + (e.skin || 'B1_grader');
      if (byArt.has(art)) assert.equal(byArt.get(art), nm, `${art} 같은 그림 = 같은 이름`);
      byArt.set(art, nm);
      named++;
    }
  }
  assert.equal(named, 17, '보스 판 8(18번은 둘) + 강적 판 8');
  for (const nm of NAMES) assert.ok(nm.length <= 8, `${nm} ${nm.length}자`);
  assert.equal(NAMES.size, Object.keys(BOSS_NAMES).length + Object.keys(MID_NAMES).length, '이름이 겹치지 않는다');
});

test("NAMES-2: 화면 글 — 판 시작 줄 '보스 출현: 이름'·'강적 출현: 이름'·'웨이브 — 결승선까지 돌파' · 경고 '웨이브 접근!' · 강화 줄 'N번 이름: A발 → B발' · 화면 글에 '대물결'·'중간 보스'가 없다", () => {
  assert.equal(kindBannerLine('boss', '폭주 기관차'), '보스 출현: 폭주 기관차');
  assert.equal(kindBannerLine('mid', '돌격 사냥개'), '강적 출현: 돌격 사냥개');
  assert.equal(kindBannerLine('horde', '무시'), '웨이브 — 결승선까지 돌파');
  assert.equal(kindBannerLine('boss', null), '보스 출현');
  assert.equal(HORDE_BANNER_TEXT, '웨이브 접근!');
  const shown = [HORDE_BANNER_TEXT, MID_BANNER_TEXT, ...Object.values(KIND_BANNER_TEXT), ...Object.values(GOAL_NAME)];
  for (const t of shown) assert.ok(!/대물결|중간 보스|정예/.test(t), '옛 이름: ' + t);
  const st = buildStage(24, { difficulty: 'brutal' });
  const e = st.elites[0];
  const line = upgradeLines({ power: 0, rate: 0, multi: 0 }, 'power', { stageId: 24, bossHp: e.hp, name: bossName(e) }).lines[1];
  assert.match(line, /^24번 크라운 브레이커: \d+발 → \d+발$/);
});
