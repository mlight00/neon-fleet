// tests/lib/rush3-bountyfight.mjs — 현상금 적 실측(r4.7 (c), 동작 확인 — 난이도 판단 아님).
//  게임 줄(brutal) 판의 현상금 적 1체를 **계산의 상한 부대**(stage.bounties[i] 의 병력·무기·Mk — 그 z 까지 가장 잘 했을 때의 부대)로 맞는다.
//  조작 = 부대 중심을 현상금 적 x 에 맞춘다(따라오는 적을 정면으로 쏜다). 게이트·보급 통·다른 적은 뺀다(병력을 계산값에 고정 —
//   '계산이 실제 stepRun 과 맞는가'를 보는 것이다. 다른 적이 탄을 받아 내는 몫은 계산에 없다(상한)).
//  holdX(선택) = 부대를 이 x 에 세워 두고 쏜다(현상금 적이 따라와 그 앞에 선다) — 자리마다 잡히는지 보는 용도(가운데 240 등)
//  반환 { killed, left(부딪힐 때 남은 체력 — 잡으면 0), hp, dealtPct(준 피해 ÷ 체력), sec(나온 뒤 끝날 때까지), inSec(사거리에 든 뒤 끝날 때까지), lost(잃은 병사), units, weapon, mk, z }
import { createRun, stepRun, drainEvents, STEP } from '../../rush3/combat.js';
import { buildStage } from '../../rush3/stages.js';

export function bountyFight(id, idx = 0, { maxSteps = 3600, holdX = null } = {}) {
  const st = buildStage(id, { difficulty: 'brutal' });
  const b = st.bounties[idx];
  const lead = 60;
  const keep = (sp) => sp.kind === 'bounty' && sp.z === b.z;
  const stage = { ...st, startUnits: b.units, gateRows: [], supplies: [], walls: st.walls.filter((w) => w.kind === 'cover'), lottery: null,
                  spawns: st.spawns.filter(keep), elites: [], elite: null, eliteZ: null, arena: null, bonus: null, objective: null, length: b.z + 20000 };
  const run = createRun(stage, { startWeapon: b.weapon, startMk: b.mk, heroGuard: true });
  run.z = run.prevZ = b.z - lead;
  if (holdX != null) run.x = run.tx = holdX;
  const units0 = run.units.length;
  let steps = 0, bounty = null, t0 = null, tIn = null, done = null;
  while (!run.over && steps < maxSteps && !done) {
    const tgt = run.enemies.find((e) => e.kind === 'bounty' && !e.dead);
    stepRun(run, { pointerX: holdX ?? (tgt ? tgt.x : 240), dragDx: 0, keyDir: 0 }, STEP);
    const ev = drainEvents(run);
    steps++;
    if (!bounty) { bounty = run.enemies.find((e) => e.kind === 'bounty') ?? null; if (bounty) t0 = run.time; }
    //  사거리에 든 때 = 적 앞면이 탄 정리선(부대 앞 LINE_Y + bulletAhead = 650) 안
    if (bounty && tIn === null && bounty.z - bounty.r - run.z <= 650) tIn = run.time;
    for (const e of ev) {
      if (e.type === 'kill' && e.bounty) done = { killed: true, left: 0 };
      if (e.type === 'touch' && e.kind === 'bounty') done = { killed: false, left: Math.max(0, bounty.hp) };
    }
  }
  if (!done) done = { killed: false, left: bounty ? Math.max(0, bounty.hp) : null };
  const hp = bounty ? bounty.hpMax : b.hp;
  return { ...done, hp, dealtPct: bounty ? (hp - done.left) / hp : 0, sec: t0 == null ? null : run.time - t0, inSec: tIn == null ? null : run.time - tIn,
           lost: units0 - run.units.length, units: b.units, weapon: b.weapon, mk: b.mk, z: b.z };
}
