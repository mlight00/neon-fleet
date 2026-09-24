// E_save-probe.mjs — v4 기획 검토 E 담당(6번 기록 칸): 지금 save.js 가 'v4 기록 칸(새 접미)'·'옛 brutal 칸 보존'·'기록마다 강화 스냅샷'을
//  **고치지 않은 상태에서** 어떻게 다루는지 실제로 돌려 본다. 구현이 아니라 현 동작 확인이다.
//  읽기 전용: rush3/save.js 를 import 만 하고, 저장소는 메모리 가짜 storage(Map)를 주입한다(localStorage·파일을 건드리지 않음). 결과 = E_save-probe.json.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSave3, recordKey, KEY3 } from '../../../../rush3/save.js';

const HERE = dirname(fileURLToPath(import.meta.url));
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k), _m: m };
}

const results = {};

//  A. 기록 칸 키: 새 접미 'v4' 가 정규 키로 받아들여지는가
results.A_recordKey = {
  normal: recordKey(2, 'normal'), brutal: recordKey(2, 'brutal'), v4: recordKey(2, 'v4'), v4rule: recordKey(2, 'v4r1'),
};

//  B. 옛 저장(2:brutal 기록이 있는 v:3)을 읽고 새 칸 '2:v4' 에 기록을 쓰면, 옛 칸이 남는가 · v 가 3 인가
const oldSave = {
  v: 3, lastStage: 2, difficulty: 'brutal', volume: 1, mute: false, seenShutter: true, seenVehicle: true, zoom: true,
  stages: { 2: { versions: { '2': { cleared: true, attempts: 3, bestSurvivors: 40, bestTime: 50 }, '2:brutal': { cleared: true, attempts: 9, bestSurvivors: 12, bestTime: 70 } } } },
};
{
  const st = memStorage({ [KEY3]: JSON.stringify(oldSave) });
  const s = createSave3(st);
  const before = s.getStageVersions(2);
  const ret = s.updateStage(2, { cleared: true, attempts: 1, bestSurvivors: 20, bestTime: 61 }, 2, 'v4');
  const after = s.getStageVersions(2);
  const raw = JSON.parse(st.getItem(KEY3));
  results.B_newSuffixCell = {
    before, returned: ret, after,
    oldBrutalKept: JSON.stringify(after['2:brutal']) === JSON.stringify(before['2:brutal']),
    v4CellWritten: !!after['2:v4'] && after['2:v4'].bestSurvivors === 20,
    savedV: raw.v, bakCreated: st.getItem(KEY3 + '.bak') !== null,
  };
}

//  C. 기록 칸에 강화 스냅샷 필드를 붙여 쓰면(지금 코드 그대로) 저장에 남는가
{
  const st = memStorage();
  const s = createSave3(st);
  const snap = { cleared: true, attempts: 1, bestSurvivors: 20, bestTime: 61, survUp: { power: 1, rate: 0, multi: 0 }, timeUp: { power: 1, rate: 0, multi: 0 }, rule: 'v4' };
  const ret = s.updateStage(2, snap, 2, 'v4');
  const raw = JSON.parse(st.getItem(KEY3));
  results.C_snapshotFieldInRecord = {
    sent: snap, returned: ret, stored: raw.stages['2'].versions['2:v4'],
    snapshotDropped: !('survUp' in raw.stages['2'].versions['2:v4']) && !('timeUp' in raw.stages['2'].versions['2:v4']) && !('rule' in raw.stages['2'].versions['2:v4']),
  };
  //  C2. 스냅샷 필드'만' 있는 조각(기록 4필드 없음)은 칸 자체가 '빈 칸'으로 취급되는가(hasRecFields L33 → rawVersions L63)
  const st2 = memStorage();
  const s2 = createSave3(st2);
  const ret2 = s2.updateStage(3, { survUp: { power: 2, rate: 0, multi: 0 } }, 2, 'v4');
  results.C2_snapshotOnlyPatch = { returned: ret2, versions: s2.getStageVersions(3) };
}

//  D. mergeStage 의 병합 규칙: 새 조각이 옛 값을 그대로 덮는가(최대·최소 판정 없음 — 신기록 판정은 셸 책임)
{
  const st = memStorage();
  const s = createSave3(st);
  s.updateStage(4, { cleared: true, attempts: 1, bestSurvivors: 30, bestTime: 40 }, 1, 'v4');
  const ret = s.updateStage(4, { bestSurvivors: 10, bestTime: 90 }, 1, 'v4');
  results.D_mergeOverwrites = { afterWorseRun: ret, overwritten: ret.bestSurvivors === 10 && ret.bestTime === 90 };
}

//  E. 최상위 coins·up: patch 로 넣으면 남는가(defaults·normalize 미수정 상태)
{
  const st = memStorage();
  const s = createSave3(st);
  const ret = s.patch({ coins: 150, up: { power: 1, rate: 0, multi: 0 } });
  const raw = JSON.parse(st.getItem(KEY3));
  results.E_topLevelCoins = { returnedHasCoins: 'coins' in ret, storedHasCoins: 'coins' in raw, storedHasUp: 'up' in raw, v: raw.v };
}

const out = {
  meta: { script: 'E_save-probe.mjs', date: new Date().toISOString(), note: '현 save.js(수정 없음)를 메모리 storage 로 돌린 결과. 구현 제안이 아니라 현 동작 확인.' },
  results,
};
writeFileSync(join(HERE, 'E_save-probe.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(results, null, 1));
