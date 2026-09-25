// rush3-diff2row — r4.2 난이도 단일화(두 줄 표) V3-DIFF2ROW 동일성 검사.
//  이사님 지시(2026-09-24) "보통, 어려움, 지옥으로 난이도 구성된 것들 삭제하고" → 결정 D2′(2026-09-25) = 지옥 값 그대로, 2번 판 조정 없음.
//  배수 표는 두 줄만 남았다: 'brutal'(= 옛 지옥 = 게임 화면이 늘 쓰는 기본 줄) · 'normal'(= 옛 보통 = 화면에 없는 검사용 배수 1 줄, 규칙 모듈 기본값).
//  이 검사는 "어느 줄의 판도 한 글자도 바뀌지 않았다"를 잠근다 — 고치기 전(git 00be4e3, r4.1) 코드로 찍은 스냅숏
//  tests/fixtures/rush3-stages-pre-r4.2.json 과 지금 코드의 buildStage 결과(+ createRun 이 난이도로 파생하는 값)를 **문자열(바이트) 단위**로 비교한다.
//  ⚠️스냅숏은 다시 만들지 않는다(다시 만들면 새 코드와 새 코드를 비교하게 된다). 두 줄의 수치를 일부러 바꾸는 개정은 이 검사를 함께 개정한다.
//  키 이름 정규화: 지옥 전용 추가 배치의 정의 키가 brutalSpawns → extraSpawns 로 바뀌었다. buildStage 출력에는 이 키가 들어가지 않으므로
//   (추가 배치는 spawns 에 합쳐져 나온다) 정규화는 실제로는 아무것도 바꾸지 않지만, 정의 사본이 출력에 섞이는 개정이 생겨도 이름 차이만은 같게 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { createRun } from '../rush3/combat.js';

const SNAP = JSON.parse(readFileSync(new URL('./fixtures/rush3-stages-pre-r4.2.json', import.meta.url), 'utf8'));
//  스냅숏을 찍을 때와 같은 인코더(-0·비유한수는 문자열로 남겨 JSON 이 지우지 못하게)
const enc = (k, v) => (Object.is(v, -0) ? '-0' : typeof v === 'number' && !Number.isFinite(v) ? String(v) : v);
//  키 순서를 지키며 extraSpawns → brutalSpawns 로만 이름을 바꾼 사본
function renameKeys(o) {
  if (Array.isArray(o)) return o.map(renameKeys);
  if (o === null || typeof o !== 'object') return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k === 'extraSpawns' ? 'brutalSpawns' : k] = renameKeys(v);
  return out;
}
const S = (o) => JSON.stringify(renameKeys(o), enc);
//  createRun 이 난이도 줄로 파생하는 값(적 표·광장 보스 배수·보스 페이즈·표 체력)
const runPart = (r) => ({ difficulty: r.difficulty, enemyDefs: r.enemyDefs, arena: r.arena, bossPhases: r.bossPhases, hpBase: r.hpBase });

test('V3-DIFF2ROW 스냅숏 형식: 고치기 전 코드(00be4e3)로 찍은 1~24 × {normal, brutal} 두 벌(buildStage · createRun 파생값)', () => {
  assert.deepEqual(SNAP.meta.ids, ALL_STAGE_IDS, '24판 전부');
  assert.equal(ALL_STAGE_IDS.length, 24);
  for (const k of ['normal', 'brutal', 'run_normal', 'run_brutal']) assert.deepEqual(Object.keys(SNAP[k]).map(Number), ALL_STAGE_IDS, k);
  assert.match(SNAP.meta.source, /00be4e3/);
});

test("V3-DIFF2ROW 기본 줄: buildStage(id, { difficulty: 'brutal' }) 가 옛 지옥 판과 바이트 단위로 같다(1~24, 추가 배치 S1·S5·S8 포함) — createRun 파생값도 같다", () => {
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    assert.equal(S(st), S(SNAP.brutal[id]), `S${id} 기본 줄(옛 지옥) buildStage`);
    assert.equal(S(runPart(createRun(buildStage(id, { difficulty: 'brutal' })))), S(SNAP.run_brutal[id]), `S${id} 기본 줄(옛 지옥) createRun`);
  }
});

test("V3-DIFF2ROW 검사용 배수 1 줄: buildStage(id, { difficulty: 'normal' }) 와 인자 생략 buildStage(id) 가 옛 보통 판과 바이트 단위로 같다(1~24) — 규칙 모듈의 기본값은 여전히 배수 1 줄", () => {
  for (const id of ALL_STAGE_IDS) {
    assert.equal(S(buildStage(id, { difficulty: 'normal' })), S(SNAP.normal[id]), `S${id} 배수 1 줄(옛 보통) buildStage`);
    assert.equal(S(buildStage(id)), S(SNAP.normal[id]), `S${id} 인자 생략 = 배수 1 줄`);
    assert.equal(S(runPart(createRun(buildStage(id)))), S(SNAP.run_normal[id]), `S${id} 배수 1 줄(옛 보통) createRun`);
  }
});
