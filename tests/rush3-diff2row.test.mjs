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
import { BAL3 } from '../rush3/balance.js';

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

//  r4.7(이사님 지시 2026-09-26 — 결정 D2′ '지옥 값 그대로'를 **보스 체력·보스 탄 피해·현상금 적에 한해** 푼다): 기본 줄에서 그 몫만 되돌리면
//   옛 지옥 판과 바이트 단위로 같아야 한다(그 밖의 판 수치 — 일반 적 체력·스폰·게이트·보급은 그대로라는 잠금).
//   되돌리는 몫: 보스 체력(stage.bossFloor.base 로 — 바닥 계산 내역 칸도 뺀다) · 현상금 적 스폰(kind 'bounty') · 정예 탄 dmg(bossShotDmg 전 = round(1 × eshotDmg)) · 적 표의 bounty 칸
//  r4.8(이사님 실플레이 3차 — 보스 공격을 피할 수 있게): 같은 방식으로 **보스전 밀집 대형 칸(stage.bossHw)** 과 **보스 패턴 배정(보스 정의의 atk)** 도 되돌린다.
//   보스 체력은 r4.7 과 같은 자리(bossFloor.base)로 되돌아가므로 새 대형으로 다시 잰 체력도 이 한 줄로 함께 되돌려진다
function undoR47Stage(st) {
  if (st.bossFloor) { st.elites.forEach((e, i) => { e.hp = st.bossFloor.base[i]; }); delete st.bossFloor; }
  st.spawns = st.spawns.filter((sp) => sp.kind !== 'bounty');
  delete st.bounties;
  delete st.bossHw;
  for (const e of st.elites) delete e.atk;
  return st;
}
function undoR47Run(rp, row) {
  const { bounty, ...defs } = rp.enemyDefs;
  const E = defs.elite;
  return { ...rp, enemyDefs: { ...defs, elite: { ...E, shot: { ...E.shot, dmg: Math.round(1 * row.eshotDmg) } } } };
}

test("V3-DIFF2ROW 기본 줄: buildStage(id, { difficulty: 'brutal' }) 가 옛 지옥 판과 — r4.7 의 보스 체력·보스 탄·현상금 적 몫과 r4.8 의 밀집 대형·보스 패턴 칸만 되돌리면 — 바이트 단위로 같다(1~24, 추가 배치 S1·S5·S8 포함) · createRun 파생값도 같다", () => {
  const row = BAL3.difficulty.brutal;
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    //  r4.7 몫이 실제로 들어 있다: 보스 체력 바닥(옛 값 이상) · 보스 탄 1 · r4.8 보스전 밀집 대형 64
    assert.ok(st.bossFloor && st.elites.every((e, i) => e.hp >= st.bossFloor.base[i]), `S${id} 보스 체력 바닥`);
    assert.equal(st.bossHw, 64, `S${id} 보스전 밀집 대형(r4.8)`);
    assert.ok(st.elites.every((e) => e.atk && e.atk.seq.length >= 3), `S${id} 보스 패턴 배정(r4.8)`);
    assert.equal(S(undoR47Stage(st)), S(SNAP.brutal[id]), `S${id} 기본 줄(옛 지옥) buildStage`);
    const rp = runPart(createRun(buildStage(id, { difficulty: 'brutal' })));
    assert.equal(rp.enemyDefs.elite.shot.dmg, 1, `S${id} 보스 탄 1`);
    assert.equal(rp.enemyDefs.shooter.shot.dmg, 3, `S${id} 저격수 탄 3 그대로`);
    assert.equal(S(undoR47Run(rp, row)), S(SNAP.run_brutal[id]), `S${id} 기본 줄(옛 지옥) createRun`);
  }
});

test("V3-DIFF2ROW 검사용 배수 1 줄: buildStage(id, { difficulty: 'normal' }) 와 인자 생략 buildStage(id) 가 옛 보통 판과 바이트 단위로 같다(1~24) — 규칙 모듈의 기본값은 여전히 배수 1 줄", () => {
  for (const id of ALL_STAGE_IDS) {
    assert.equal(S(buildStage(id, { difficulty: 'normal' })), S(SNAP.normal[id]), `S${id} 배수 1 줄(옛 보통) buildStage`);
    assert.equal(S(buildStage(id)), S(SNAP.normal[id]), `S${id} 인자 생략 = 배수 1 줄`);
    assert.equal(S(runPart(createRun(buildStage(id)))), S(SNAP.run_normal[id]), `S${id} 배수 1 줄(옛 보통) createRun`);
  }
});
