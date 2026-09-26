// rush3-brutal — r3.22 지옥 강화(이사 소감 2026-09-22 "지옥 난이도도 아직 너무 쉽다") V3-BRUTAL.
//  판별 지표 = **잘하는 봇(aimLead·evLead)이 병력을 하나도 잃지 않고(end === peak) 이기는 판의 수**.
//   그런 판이 '잘하는 사람이 여유 있게 흘러가는 판' 이다. 지옥은 0 판이어야 하고, 보통 > 어려움 ≥ 지옥 으로 계단이 져야 한다.
//  ⚠️전체 레버(체력·물결·게이트 상한)를 올리면 이미 어려운 판만 더 어려워지고 쉬운 판은 그대로였다(스윕 2026-09-22) —
//   그래서 쉬운 판(S1·S5·S8)에만 지옥 전용 추가 배치(brutalSpawns)를 넣었다. 이 검사가 그 분포를 잠근다.
//  r4.2(2026-09-25, 난이도 단일화 — 두 줄 표): '지옥' = 게임 화면의 **기본 줄**(brutal), '보통' = 화면에 없는 **검사용 배수 1 줄**(normal).
//   어려움 줄을 지워 계단은 '배수 1 > 기본' 두 칸 비교가 됐고, 기본 줄 0 판 단언은 그대로다. 추가 배치는 이름만 extraSpawns 로 바뀌었다.
//  ⚠️봇 결과는 사람 성공률이 아니다(결정적 1판).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_STAGE_IDS, DEFS, buildStage } from '../rush3/stages.js';
import { playPolicy } from './lib/rush3-policies.mjs';

const STRONG = ['aimLead', 'evLead'];
function cruiseStages(difficulty) {
  const out = [];
  for (const id of ALL_STAGE_IDS) {
    for (const p of STRONG) {
      const r = playPolicy(id, p, 14400, difficulty);
      if (r.run.won && r.run.units.length === r.run.peak) { out.push(`S${id} ${p} ${r.run.peak}/${r.run.units.length}`); break; }
    }
  }
  return out;
}

test('V3-BRUTAL 무손실 승리: 기본 줄(brutal, 옛 지옥)에서는 잘하는 봇도 병력을 잃지 않고 이기는 판이 없다(0 판), 배수 1 줄(normal) > 기본 줄 로 계단이 진다(r4.2: 어려움 칸 삭제)', (t) => {
  const byDiff = {};
  for (const d of ['normal', 'brutal']) {
    byDiff[d] = cruiseStages(d);
    t.diagnostic(`CRUISE ${d} ${byDiff[d].length}판: ${byDiff[d].join(' · ') || '-'}`);
  }
  assert.equal(byDiff.brutal.length, 0, '기본 줄(지옥) 무손실 승리 판: ' + byDiff.brutal.join(' · '));
  assert.ok(byDiff.normal.length > byDiff.brutal.length, `배수 1 줄 ${byDiff.normal.length} > 기본 줄 ${byDiff.brutal.length}`);
});

test('V3-BRUTAL 지옥 전용 추가 배치: extraSpawns(옛 brutalSpawns)는 기본 줄(brutal)에서만 스폰 목록에 들어가고, 배수 1 줄(normal) 판은 추가 전과 같다', () => {
  const withExtra = [1, 5, 8];
  for (const id of withExtra) {
    const def = id <= 3 ? DEFS[id] : null;
    const extraN = buildStage(id, { difficulty: 'brutal' }).spawns.length - buildStage(id, { difficulty: 'normal' }).spawns.length;
    assert.ok(extraN > 0, `S${id} 기본 줄에 추가 무리`);
    if (def) assert.equal(extraN, def.extraSpawns.length, `S${id} 추가 무리 수 = 정의`);
    if (def) assert.equal(def.brutalSpawns, undefined, `S${id} 옛 키 이름(brutalSpawns)은 남지 않는다`);
    //  배수 1 줄은 인자 생략(규칙 기본값)과 같은 무리 수(추가 배치 필드를 읽지 않는다)
    assert.equal(buildStage(id, { difficulty: 'normal' }).spawns.length, buildStage(id).spawns.length, `S${id} 배수 1 줄 = 규칙 기본값`);
  }
  //  추가 무리는 저격수 중심(원거리에서 병력을 깎는다 — 체력만으로는 부대에 닿기 전에 녹았다)
  for (const id of withExtra) {
    const base = buildStage(id, { difficulty: 'normal' }).spawns, brutal = buildStage(id, { difficulty: 'brutal' }).spawns.filter((s) => s.kind !== 'bounty');
    const added = brutal.filter((b) => !base.some((h) => h.z === b.z && h.kind === b.kind));
    assert.ok(added.some((s) => s.kind === 'shooter'), `S${id} 추가 무리에 저격수`);
  }
  //  나머지 21판은 추가 배치가 없다(이미 어려운 판을 더 올리지 않는다). r4.7 현상금 적(kind 'bounty' — 게임 줄 전용, V3-R47 BOUNTY)은 따로 센다
  const noBounty = (list) => list.filter((s) => s.kind !== 'bounty');
  for (const id of ALL_STAGE_IDS) {
    if (withExtra.includes(id)) continue;
    assert.equal(noBounty(buildStage(id, { difficulty: 'brutal' }).spawns).length, buildStage(id, { difficulty: 'normal' }).spawns.length, `S${id} 추가 배치 없음`);
  }
});
