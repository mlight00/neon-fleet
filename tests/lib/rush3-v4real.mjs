// tests/lib/rush3-v4real.mjs — V4-REAL 기준값(r4.4, v4 ④단계). 셸이 실제로 쓰는 설정 = 기본 줄(brutal, 옛 지옥 수치) + 메인 로봇 보호(heroGuard) + 강화 0 으로
//  1~24 × evLead·aimLead·planBoss 한 판씩(랜덤 길 = 기본 시드, 상한 14,400 STEP) 돌린 결과를 한 파일(tests/fixtures/rush3-v4-real.json)로 잠근다.
//  배수 1 줄 규칙 검사와 따로 두는 '실제 설정 통합' 검사다(기획 v4.1 4-5, 검토 Q8). 봇 결과는 정해진 입력으로 한 판씩 돌린 값이다(사람의 성공률이 아니다).
//  기준값을 다시 만들 때(규칙이 바뀌어 값이 달라져야 할 때만):  node tests/lib/rush3-v4real.mjs --write  → 바뀐 값과 이유를 계약서(DESIGN_v3_stage1.md)에 남긴다
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { playPolicy } from './rush3-policies.mjs';
import { ALL_STAGE_IDS } from '../../rush3/stages.js';

export const V4_BOTS = Object.freeze(['evLead', 'aimLead', 'planBoss']);
//  셸 실제 설정의 createRun 옵션(강화 0 — 강화 효과가 들어간 뒤에도 0 이면 이 판과 같아야 한다)
export const V4_RUN_OPTS = Object.freeze({ heroGuard: true });
export const V4_FIXTURE = new URL('../fixtures/rush3-v4-real.json', import.meta.url);

/** 한 판 결과에서 잠글 값 */
export function v4RealPick(r) {
  const run = r.run;
  return {
    won: run.won, over: run.over, steps: r.steps, survivors: run.units.length, peak: run.peak, kills: run.kills, time: run.time,
    weapon: run.weapon, mk: run.weaponMk,
    loss: { gate: run.lossByGate, shot: run.lossByShot, touch: run.lossByTouch, shock: run.lossByShock },
    //  로봇이 판 끝까지 살아 있는가 · 피해 이전 횟수 · 보호막 켜짐/꺼짐 횟수
    hero: run.units.some((u) => u.hero), transfers: r.events.heroGuard || 0, shieldOn: r.events.heroGuardOn || 0, shieldOff: r.events.heroGuardOff || 0,
    gates: r.gates.map((g) => [g.id, g.value, g.applied]),
  };
}
/** 한 판(셸 실제 설정). runOpts 로 같은 판을 다른 옵션(예: 강화 0 을 명시)으로 돌려 비교할 수 있다 */
export function v4RealRun(id, bot, runOpts = V4_RUN_OPTS) {
  return v4RealPick(playPolicy(id, bot, 14400, 'brutal', undefined, runOpts));
}
/** 기준값 파일 내용 전체 */
export function v4RealFixture() {
  const runs = {};
  for (const bot of V4_BOTS) for (const id of ALL_STAGE_IDS) runs[bot + '/' + id] = v4RealRun(id, bot);
  const summary = {};
  for (const bot of V4_BOTS) {
    const rs = ALL_STAGE_IDS.map((id) => runs[bot + '/' + id]);
    summary[bot] = { wins: rs.filter((r) => r.won).length, won: ALL_STAGE_IDS.filter((id, i) => rs[i].won), heroAlive: rs.filter((r) => r.hero).length,
                     transfers: rs.reduce((n, r) => n + r.transfers, 0), shieldOff: rs.reduce((n, r) => n + r.shieldOff, 0) };
  }
  return {
    meta: { source: 'r4.4 — createRun(buildStage(id, { difficulty: "brutal" }), { heroGuard: true }), 강화 0, playPolicy 상한 14400 STEP, 랜덤 길 기본 시드',
            ids: [...ALL_STAGE_IDS], bots: [...V4_BOTS], summary },
    runs,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fx = v4RealFixture();
  console.log(JSON.stringify(fx.meta.summary));
  if (process.argv.includes('--write')) { writeFileSync(V4_FIXTURE, JSON.stringify(fx, null, 1) + '\n'); console.log('written', fileURLToPath(V4_FIXTURE)); }
}
