// E_screen-calc.mjs — v4 기획 검토 E 담당(화면): 광장 맨 아래(ay +40)·맨 위(ay −280)에서 100명 부대의 뒷줄 밑변 y 와 부대 배율 계산.
//  읽기 전용: project.js(projectorFor)·squad.js(formation)·balance.js(BAL3) 를 import 만 한다. 결과 = E_screen-calc.json.
//  계산 규약은 저장소 검사 tests/rush3-project.test.mjs 'V3-PROJECT 뒷줄 문턱'(L188-201)과 같다:
//   뒷줄 밑변 = P.project(중앙 x, d).y + 병사크기(BAL3.squad.soldierSize)·s/2, d = −(ay + dy)  ← render.js drawSquad L1127·L1137 의 pj(run.x + u.dx, −(ay + u.dy))
//  ⚠️그리기 연출의 bob(±1.6·s px, render.js L1134)은 넣지 않았다(검사와 같은 정지 좌표).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { projectorFor, PERSPECTIVE } from '../../../../rush3/project.js';
import { formation } from '../../../../rush3/squad.js';
import { BAL3 } from '../../../../rush3/balance.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = BAL3.view.h, LINE_Y = BAL3.view.LINE_Y, CX = BAL3.road.center;
const SOLDIER = BAL3.squad.soldierSize, HERO = BAL3.squad.heroSize;
const [AY_TOP, AY_BOTTOM] = BAL3.arena.depth; // [-280, 40]
const r2 = (v) => Math.round(v * 100) / 100;

function squadGeom(mode, n, ay) {
  const P = projectorFor(mode);
  const f = formation(n);
  let maxDy = -Infinity, minDy = Infinity;
  for (const u of f) { if (u.dy > maxDy) maxDy = u.dy; if (u.dy < minDy) minDy = u.dy; }
  const back = P.project(CX, -(ay + maxDy));
  const center = P.project(CX, -ay); // 히어로(dy 0) = 부대 중심
  const front = P.project(CX, -(ay + minDy));
  return {
    mode, n, ay, near: P.near, far: P.far, D: r2(P.D),
    maxDy, minDy,
    backRowD: -(ay + maxDy), backRowY: r2(back.y), backRowScale: r2(back.s), backRowBottomY: r2(back.y + SOLDIER * back.s / 2),
    backRowBottomOverScreenPx: r2(back.y + SOLDIER * back.s / 2 - H),
    heroCenterD: -ay, heroScale: Math.round(center.s * 1000) / 1000, heroY: r2(center.y), heroTopY: r2(center.y - HERO * center.s / 2),
    frontRowScale: r2(front.s),
    heroScaleVsLine: Math.round(center.s / P.near * 1000) / 1000,
  };
}
//  광장 맨 아래(ay +40)에서 뒷줄 밑변이 화면(H)을 넘기 시작하는 최소 인원(2~200)
function thresholdAt(mode, ay) {
  const P = projectorFor(mode);
  for (let n = 2; n <= 200; n++) {
    let maxDy = 0;
    for (const u of formation(n)) if (u.dy > maxDy) maxDy = u.dy;
    const q = P.project(CX, -(ay + maxDy));
    if (q.y + SOLDIER * q.s / 2 > H) return { n, maxDy, bottomY: r2(q.y + SOLDIER * q.s / 2) };
  }
  return null;
}

const rows = [];
for (const mode of ['close', 'standard', 'flat']) for (const ay of [AY_BOTTOM, 0, AY_TOP]) rows.push(squadGeom(mode, 100, ay));
const plan = {
  claimBottomClose: 821, claimBottomStandard: 817, claimTopScaleClose: '1.8 → 1.0', claimTopScaleStandard: '1.45 → 1.03', claimMaxDy100: 121,
};
const get = (mode, ay) => rows.find((r) => r.mode === mode && r.ay === ay);
const check = {
  maxDy100: get('close', AY_BOTTOM).maxDy,
  closeBottomAtAy40: get('close', AY_BOTTOM).backRowBottomY,
  standardBottomAtAy40: get('standard', AY_BOTTOM).backRowBottomY,
  closeHeroScaleAtTop: get('close', AY_TOP).heroScale,
  standardHeroScaleAtTop: get('standard', AY_TOP).heroScale,
  closeBackRowBottomAtTop: get('close', AY_TOP).backRowBottomY,
};
check.matches = {
  maxDy: check.maxDy100 === plan.claimMaxDy100,
  close821: Math.round(check.closeBottomAtAy40) === plan.claimBottomClose,
  standard817: Math.round(check.standardBottomAtAy40) === plan.claimBottomStandard,
  closeTop1_0: Math.round(check.closeHeroScaleAtTop * 100) / 100 === 1.0,
  standardTop1_03: Math.round(check.standardHeroScaleAtTop * 100) / 100 === 1.03,
};
const out = {
  meta: {
    script: 'E_screen-calc.mjs', date: new Date().toISOString(),
    constants: { H, LINE_Y, CX, SOLDIER, HERO, arenaDepth: BAL3.arena.depth, PERSPECTIVE_close: PERSPECTIVE.close, PERSPECTIVE_standard: PERSPECTIVE.standard },
    rule: '뒷줄 밑변 = project(240, −(ay+maxDy)).y + soldierSize·s/2 (tests/rush3-project.test.mjs L188-201 과 같은 식). bob 연출 제외.',
  },
  n100: rows,
  thresholdsAtAyBottom: { close: thresholdAt('close', AY_BOTTOM), standard: thresholdAt('standard', AY_BOTTOM), flat: thresholdAt('flat', AY_BOTTOM) },
  thresholdsAtAy0: { close: thresholdAt('close', 0), standard: thresholdAt('standard', 0), flat: thresholdAt('flat', 0) },
  planClaims: plan,
  check,
};
writeFileSync(join(HERE, 'E_screen-calc.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(check, null, 1));
console.log('thresholds ay+40', JSON.stringify(out.thresholdsAtAyBottom), 'ay0', JSON.stringify(out.thresholdsAtAy0));
for (const r of rows) console.log(r.mode, 'ay', r.ay, 'backBottom', r.backRowBottomY, 'backS', r.backRowScale, 'heroS', r.heroScale, 'heroTopY', r.heroTopY);
