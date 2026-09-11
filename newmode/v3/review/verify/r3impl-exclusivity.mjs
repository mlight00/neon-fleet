// r3impl-exclusivity — 구현된 규칙(armZ·coverZ·벽)에서 배제가 실제로 닫혔는지 전수 확인.
//  r31-*-verify.mjs 는 규칙이 없던 시점의 '에뮬레이션'이었다. 이 스크립트는 **실제 stepRun** 으로 다시 잰다.
//  정책 = "확정선 직전 T 까지 한쪽에 붙어 사격 → T 에서 반대편으로 대시". T 를 1px 간격·양방향으로 훑는다.
//  게임 코드는 고치지 않는다(읽기 전용). 결과 = r3impl-exclusivity.json
import { createRun, stepRun, drainEvents, STEP } from '../../../../rush3/combat.js';
import { coverZFor } from '../../../../rush3/stages.js';
import { writeFileSync } from 'node:fs';

const LEAD = 60;

// 벽 1개 + 배제 쌍 1개만 있는 합성 스테이지(실제 배치와 같은 기하)
function pairStage(o) {
  const cover = coverZFor(o.wallZ0, o.z);
  const mk = (id, x, d) => ({ id, z: o.z, x, r: 30, kind: 'soldier', durability: d, maxDurability: d,
    payload: { n: 1 }, opened: false, missed: false, locked: false, skipped: false, pads: [],
    coverZ: cover, pairId: 'p', hint: null });
  return {
    id: 'p', version: 2, title: 'pair', startUnits: o.n, startWeapon: o.weapon ?? 'rifle',
    length: o.z + 2000, eliteZ: null, gateRows: [], spawns: [], elite: null,
    walls: [{ id: 'w1', z0: o.wallZ0, z1: o.wallZ1, x0: 228, x1: 252 }],
    supplies: [mk('L', o.lx, o.ld), mk('R', o.rx, o.rd)],
  };
}

function runScript(stage, pick, untilZ) {
  const run = createRun(stage);
  for (let i = 0; i < 20000 && !run.over && run.z <= untilZ; i++) {
    stepRun(run, { pointerX: pick(run), dragDx: 0, keyDir: 0 }, STEP);
    drainEvents(run);
  }
  return run.supplies.filter((s) => s.opened).map((s) => s.id);
}

const SPOTS = [
  { name: 'S2 w1', wallZ0: 1800, wallZ1: 3000, z: 2300, lx: 120, rx: 326, ld: 6, rd: 12, ns: [4, 5, 6, 7, 8, 12] },
  { name: 'S3 p1', wallZ0: 2400, wallZ1: 2900, z: 2800, lx: 150, rx: 330, ld: 10, rd: 10, ns: [8, 9, 10, 11, 12, 15, 25] },
  { name: 'S3 p2', wallZ0: 3150, wallZ1: 3550, z: 3500, lx: 150, rx: 330, ld: 12, rd: 24, ns: [10, 25, 30, 40] },
  { name: 'S3 wD', wallZ0: 6000, wallZ1: 7200, z: 6300, lx: 150, rx: 330, ld: 20, rd: 20, ns: [40] },
];

const out = [];
for (const sp of SPOTS) {
  const commitZ = sp.wallZ0 - LEAD;
  for (const n of sp.ns) {
    for (const dir of ['LR', 'RL']) {
      const a = dir === 'LR' ? sp.lx : sp.rx, b = dir === 'LR' ? sp.rx : sp.lx;
      let both = 0, none = 0, one = 0, runs = 0;
      for (let T = commitZ - 400; T <= commitZ; T += 1) {
        const opened = runScript(pairStage({ ...sp, n }), (r) => (r.z < T ? a : b), sp.z + 60);
        runs++;
        if (opened.length === 2) both++;
        else if (opened.length === 1) one++;
        else none++;
      }
      out.push({ spot: sp.name, n, dir, coverZ: coverZFor(sp.wallZ0, sp.z), commitZ, runs, both, one, none });
      console.log(`${sp.name} n=${n} ${dir}  runs=${runs}  둘 다=${both}  하나=${one}  없음=${none}`);
    }
  }
}
const totalBoth = out.reduce((s, r) => s + r.both, 0);
console.log('\n총 시행 ' + out.reduce((s, r) => s + r.runs, 0) + '판 · 양쪽 동시 획득 ' + totalBoth + '건');
writeFileSync(new URL('./r3impl-exclusivity.json', import.meta.url), JSON.stringify({ totalBoth, rows: out }, null, 2));
