// tools/place-bounties.mjs — 현상금 적 배치 규칙(r4.7 (c), 계약서 r4.7 (c) ③)으로 판마다 발동 z·x 를 뽑는다.
//  판 정의에 적힌 값(stages.DEFS[2·3].bounties · courses.js BOUNTY_AT)이 이 규칙의 결과와 같은지 보는 도구 — 봇을 돌리지 않는다(판 정의만 본다).
//  규칙: 적이 나온 뒤 부대에 닿기까지 사선이 지나는 트랙 구간 [z, firepower.bountyWindow(z).b] 안에 게이트 행(±12)·보급 통(±반지름)·
//   연속 증원 발판·벽(통로 확정선 60 앞부터) 이 없고, 창 끝이 보스 z − 150 앞. 그런 z(50px 격자, 1,500 부터) 중
//   같은 때 나오는 다른 적 수(발동 z 가 [z − 600, 창 끝] 안인 일정 스폰의 n 합)가 가장 적은 곳(같으면 뒤쪽).
//   13번부터 2체 — 둘째는 첫째 창이 끝난 뒤, 두 수의 합이 가장 적은 짝(같으면 뒤쪽). x 는 1체 240 · 2체 170/310. 1번(튜토리얼)은 없다.
//  사용:  node tools/place-bounties.mjs          → 판별 결과와 판 정의 비교(다르면 종료 코드 1)
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { bountyWindow } from '../rush3/firepower.js';

const GRID = 50, START = 1500, SIGHT = 600, BOSS_GAP = 150, WALL_LEAD = 60, GATE_HALF = 12;

export function placeBounties(id) {
  if (id === 1) return [];
  const st = buildStage(id, { difficulty: 'brutal' });
  const blk = [];
  for (const r of st.gateRows) blk.push([r.z - GATE_HALF, r.z + GATE_HALF]);
  for (const s of st.supplies) {
    blk.push([s.z - s.r, s.z + s.r]);
    if (s.kind === 'chain') { const n = s.payload.maxPads ?? 0, p0 = s.z + (s.padStart ?? 60); blk.push([p0, p0 + (n - 1) * (s.padGap ?? 40)]); }
  }
  for (const w of st.walls) blk.push([w.z0 - WALL_LEAD, w.z1]);
  const endZ = (st.eliteZ ?? st.length) - BOSS_GAP;
  const cands = [];
  for (let z = START; ; z += GRID) {
    const w = bountyWindow(z);
    if (w.b > endZ) break;
    if (blk.some(([p, q]) => q >= z && p <= w.b)) continue;
    //  다른 적 수 — 현상금 적 자신(게임 줄 스폰에 이미 붙어 있다)은 뺀다
    const foes = st.spawns.filter((s) => s.kind !== 'bounty' && s.z >= z - SIGHT && s.z <= w.b).reduce((a, s) => a + s.n, 0);
    cands.push({ z, foes, end: w.b });
  }
  const need = id >= 13 ? 2 : 1;
  let pick = null;
  if (need === 1) {
    for (const c of cands) if (!pick || c.foes < pick[0].foes || (c.foes === pick[0].foes && c.z > pick[0].z)) pick = [c];
  } else {
    for (const c1 of cands) for (const c2 of cands) {
      if (c2.z < c1.end) continue;
      const s = c1.foes + c2.foes, ps = pick ? pick[0].foes + pick[1].foes : Infinity;
      if (s < ps || (s === ps && (c2.z > pick[1].z || (c2.z === pick[1].z && c1.z > pick[0].z)))) pick = [c1, c2];
    }
  }
  if (!pick) return null;
  const xs = need === 1 ? [240] : [170, 310];
  return pick.map((c, i) => ({ z: c.z, x: xs[i] }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let bad = 0;
  for (const id of ALL_STAGE_IDS) {
    const want = placeBounties(id);
    const have = (buildStage(id, { difficulty: 'brutal' }).bounties || []).map((b) => ({ z: b.z, x: b.x }));
    const same = JSON.stringify(want) === JSON.stringify(have);
    if (!same) bad++;
    console.log(`S${id} 규칙 ${JSON.stringify(want)} · 정의 ${JSON.stringify(have)}${same ? '' : '  ← 다르다'}`);
  }
  console.log(bad ? `다른 판 ${bad}` : '24판 모두 규칙 결과와 같다');
  process.exit(bad ? 1 : 0);
}
