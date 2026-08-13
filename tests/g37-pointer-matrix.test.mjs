// ── §G-37 §2·§3 — 포인터 전수 매트릭스 & 연속 안전앵커 경계 ─────────────────────────────
//
//  Codex 8차 §3: G36 은 포인터를 **5지점 · tier 0 · zoom 2.2** 만 봤다. 그런데 실기에서 문제가 난
//  조합(상위 tier · 낮은 배율)은 그 표에 없었다. "표본이 통과했다"를 "전 조합이 안전하다"로 읽은 것이
//  G34 의 87.27 오독과 같은 종류의 실수다.
//  → zoom 2 × tier 3 × 포인터 9 × 시각 3 = **162 조합을 전부** 돌린다.
//
//  Codex 8차 §4: 안전 앵커 구간도 "몇 개 찍어보고 통과"가 아니라 **경계를 계산**해서
//  그 ±0.1px 양쪽 거동이 실제로 갈리는지 본다. 경계는 lane margin 에서 따라 나오므로
//  기함이 넓어지면(상위 tier) 자동으로 좁아진다 — 손으로 적은 표는 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { PROJECTION } from '../js/chase-camera.js';
import { LW, VIS, BOUNDS, laneFor, runPointerHold, settledWorldTarget, safeAnchorRange } from './lib/pointer-sim.mjs';

const ZOOMS = [2.0, 2.2];
const TIERS = [0, 3, 5];
//  9지점: 양 끝(0, 480) · 안전구간 밖(20, 460) · 안쪽(120, 200, 240, 280, 360)
const POINTS = [0, 20, 120, 200, 240, 280, 360, 460, 480];
const MARKS = [2, 6, 10];

test('G37-POINTER-MATRIX: zoom 2 × tier 3 × 포인터 9 × 시각 3 = 162 조합 전수', () => {
  const failures = [];
  let cases = 0, anchored = 0, clamped = 0;

  for (const zoom of ZOOMS) {
    for (const tier of TIERS) {
      const { lo, hi } = safeAnchorRange(tier, zoom);
      const lane = laneFor(tier);
      for (const sx of POINTS) {
        cases++;
        const r = runPointerHold(sx, 10, { tier, zoom, marks: MARKS });
        const tag = `zoom=${zoom} tier=${tier} sx=${sx}`;
        const push = (msg) => failures.push(`${tag}: ${msg} — trace ${JSON.stringify(r.trace)}`);

        //  ① 유한값 · 시각별 체크포인트가 다 잡혔는지
        if (!Number.isFinite(r.camX) || !Number.isFinite(r.sqX)) push('발산(비유한)');
        if (r.trace.length !== MARKS.length) push(`체크포인트 ${r.trace.length}/${MARKS.length}`);
        const [t2, t6, t10] = r.trace;

        //  ② 정착 — 2→6초 2px 미만, 6→10초 1px 미만(진동하면 여기서 걸린다)
        if (Math.abs(t6.sqX - t2.sqX) >= 2) push(`2→6초 ${Math.abs(t6.sqX - t2.sqX).toFixed(2)}px 이동`);
        if (Math.abs(t10.sqX - t6.sqX) >= 1) push(`6→10초 ${Math.abs(t10.sqX - t6.sqX).toFixed(2)}px 이동`);

        //  ③ 카메라는 **트랙 밖을 비추지 않는다**(C안: overscan 0) — 모든 체크포인트에서.
        for (const m of r.trace) {
          if (m.camX < BOUNDS.min - 1e-6 || m.camX > BOUNDS.max + 1e-6) {
            push(`t=${m.t}s 카메라 ${m.camX} 가 [${BOUNDS.min}, ${BOUNDS.max}] 밖`);
          }
        }

        //  ④ 기함은 트랙 여백 안에 있다
        if (r.sqX < lane - 1e-6 || r.sqX > LW - lane + 1e-6) push(`기함 ${r.sqX.toFixed(2)} 가 여백 밖(lane ${lane})`);

        //  ⑤ 앵커: 안전구간 **안**이면 포인터와 2px 이내. **밖**이면 여백에 붙되 진동하지 않는다.
        const inSafe = sx >= lo && sx <= hi;
        const err = Math.abs(r.shipScreenX - sx);
        if (inSafe) {
          anchored++;
          if (err > 2) push(`안전구간 안인데 앵커 오차 ${err.toFixed(2)}px (>2)`);
        } else {
          clamped++;
          const pinned = Math.abs(r.sqX - lane) < 0.01 || Math.abs(r.sqX - (LW - lane)) < 0.01;
          if (!pinned) push(`안전구간 밖인데 여백에 붙지 않았다(sqX ${r.sqX.toFixed(2)}, lane ${lane})`);
          //  붙은 뒤 흔들리면 이사님이 본 "튕김"이다.
          if (Math.abs(t10.sqX - t6.sqX) > 1e-6) push(`여백에서 ${Math.abs(t10.sqX - t6.sqX)}px 진동`);
        }
      }
    }
  }

  assert.equal(cases, ZOOMS.length * TIERS.length * POINTS.length, '54 조합 × 시각 3 = 162 체크포인트');
  assert.deepEqual(failures, [], `전수 매트릭스 실패 ${failures.length}건:\n  ${failures.join('\n  ')}`);
  //  ⭐표본이 한쪽으로 쏠려 "전부 통과"가 공허해지는 것을 막는다 — 두 거동이 모두 관측돼야 한다.
  assert.ok(anchored > 0 && clamped > 0,
    `앵커 성공 ${anchored} · 여백 클램프 ${clamped} — 두 거동이 다 나와야 매트릭스가 의미 있다`);
});

test('G37-HVIEW-ZOOM-INVARIANT: 매트릭스 전 조합에서 가시 폭·카메라 범위가 zoom 과 무관', () => {
  //  C안의 근거 자체 — 가로에 zoom 을 곱하면 확대할수록 시야가 좁아진다(G34 의 87.27).
  //  매트릭스가 zoom 2종을 도는 이유가 이것이므로, 그 전제를 여기서 못 박는다.
  for (const sx of POINTS) {
    const a = settledWorldTarget(sx, 2.0), b = settledWorldTarget(sx, 2.2);
    assert.ok(Math.abs(a.worldX - b.worldX) < 1e-9,
      `sx=${sx}: zoom 2.0 → ${a.worldX} vs 2.2 → ${b.worldX} — 가로는 zoom 에 반응하면 안 된다`);
    assert.ok(Math.abs(a.camX - b.camX) < 1e-9, `sx=${sx}: 카메라도 zoom 무관이어야 한다`);
  }
  assert.equal(VIS, LW / (2 * PROJECTION.nearLateral), '가시 반폭 = W/(2·nearLateral)');
  assert.deepEqual({ min: BOUNDS.min, max: BOUNDS.max }, { min: VIS, max: LW - VIS },
    'overscan 0 → 카메라 범위는 정확히 [VIS, W−VIS]');
});

test('G37-SAFE-ANCHOR-CONTINUOUS: 안전앵커 경계를 제품 함수에서 연속 계산한다', () => {
  //  경계는 **lane margin 에서 따라 나온다** — 기함이 넓어지면 좁아져야 한다(단조성).
  const table = TIERS.map((tier) => {
    const { lane, lo, hi } = safeAnchorRange(tier);
    return { tier, lane: +lane.toFixed(2), lo: +lo.toFixed(2), hi: +hi.toFixed(2), width: +(hi - lo).toFixed(2) };
  });

  //  ① 좌우 대칭 — 트랙도 투영도 좌우 대칭이므로 경계도 대칭이어야 한다.
  for (const row of table) {
    assert.ok(Math.abs((row.lo - 0) - (LW - row.hi)) < 0.02,
      `tier ${row.tier}: 좌 ${row.lo} / 우 ${row.hi} 가 비대칭 — ${JSON.stringify(table)}`);
  }
  //  ② 단조성 — tier 가 오르면(기함이 넓어지면) 안전구간이 좁아진다.
  for (let i = 1; i < table.length; i++) {
    assert.ok(table[i].width < table[i - 1].width,
      `tier ${table[i].tier} 의 안전폭 ${table[i].width} 가 tier ${table[i - 1].tier} 의 ${table[i - 1].width} 보다 좁아야 한다`);
  }
  //  ③ 실측 기록(회귀 감시용). ⚠️이 숫자는 **계약이 아니라 관측치**다 — lane margin 이 바뀌면
  //   위 ①②는 그대로 통과하고 이 값만 갱신하면 된다. 계약은 ①②와 아래 ±0.1px 프로브다.
  assert.deepEqual(table.map((r) => [r.tier, r.lo, r.hi]),
    [[0, 32.71, 447.29], [3, 48.36, 431.64], [5, 59.38, 420.62]],
    `안전앵커 실측표가 바뀌었다 — lane margin 변경이 의도된 것인지 확인하라: ${JSON.stringify(table)}`);
});

test('G37-SAFE-ANCHOR-PROBE: 경계 ±0.1px 에서 거동이 실제로 갈린다', () => {
  //  ⚠️경계값을 "계산했다"로 끝내면 아무것도 증명하지 못한다 — 양쪽에서 **다르게 동작**해야 경계다.
  const EPS = 0.1;
  for (const tier of TIERS) {
    const { lane, lo, hi } = safeAnchorRange(tier);
    for (const [label, inside, outside] of [['좌', lo + EPS, lo - EPS], ['우', hi - EPS, hi + EPS]]) {
      const rIn = runPointerHold(inside, 10, { tier });
      assert.ok(Math.abs(rIn.shipScreenX - inside) <= 2,
        `tier ${tier} ${label} 경계 안(${inside.toFixed(2)}): 앵커 오차 ${Math.abs(rIn.shipScreenX - inside).toFixed(3)}px`);
      assert.equal(rIn.laneClamps, 0,
        `tier ${tier} ${label} 경계 안에서는 여백 clamp 가 걸리면 안 된다 — 실측 ${rIn.laneClamps} 프레임`);

      const rOut = runPointerHold(outside, 10, { tier });
      assert.ok(rOut.laneClamps > 0,
        `tier ${tier} ${label} 경계 밖(${outside.toFixed(2)}): 여백 clamp 가 걸려야 한다 — 실측 0`);
      const pinned = Math.abs(rOut.sqX - lane) < 0.01 || Math.abs(rOut.sqX - (LW - lane)) < 0.01;
      assert.ok(pinned, `tier ${tier} ${label} 경계 밖: 기함이 여백에 붙어야 한다 — 실측 ${rOut.sqX.toFixed(3)}`);
    }
  }
});
