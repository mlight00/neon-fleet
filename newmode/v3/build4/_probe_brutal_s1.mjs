// 일회용 확인 스크립트(검사 아님): 극한 S1 을 여러 봇 변형으로 돌려 차이의 원인을 찾는다
import { createRun, stepRun, STEP } from '../../../rush3/combat.js';
import { buildStage } from '../../../rush3/stages.js';
import { botAim } from '../../../tests/lib/rush3-policies.mjs';

//  셸 스모크(tests/rush3-loop.test.mjs)의 botX — skipped 를 거르지 않는다
function botX(run) {
  let best = null, bz = Infinity;
  for (const s of run.supplies) {
    if (s.missed) continue;
    for (const p of s.pads) if (!p.taken && p.z > run.z && p.z < bz) { bz = p.z; best = p.x; }
    if ((s.opened && s.kind !== 'chain') || s.locked) continue;
    if (s.z > run.z && s.z < bz) { bz = s.z; best = s.x; }
  }
  for (const row of run.gateRows) {
    if (row.passed || row.z <= run.z || row.z >= bz) continue;
    let c = null;
    for (const k of row.cells) if (!c || k.value > c.value) c = k;
    bz = row.z;
    best = c.value < 0 && row.bypass ? (c.x0 === 80 ? 320 : 160) : (c.x0 + c.x1) / 2;
  }
  return best;
}

function play(pick, diff) {
  const run = createRun(buildStage(1, { difficulty: diff }));
  let n = 0;
  while (!run.over && n++ < 14400) stepRun(run, { pointerX: pick(run, n), dragDx: 0, keyDir: 0 }, STEP);
  return { won: run.won, peak: run.peak, units: run.units.length };
}
const cases = {
  'aim(null 그대로)': (r) => botAim(r),
  'aim(?? 240)': (r) => botAim(r) ?? 240,
  'smoke botX(null 그대로)': (r) => botX(r),
  'smoke botX(?? 240)': (r) => botX(r) ?? 240,
  //  스모크는 앞 90 STEP(60 프레임 + 일시정지 30) 동안 조작이 없다
  'smoke botX(?? 240, 앞 90STEP 무조작)': (r, n) => (n <= 90 ? null : botX(r) ?? 240),
};
for (const d of ['normal', 'brutal']) for (const [k, f] of Object.entries(cases)) console.log(d, k, JSON.stringify(play(f, d)));
