// rush3-r431-weapon — r4.31 무기 통 교체 규칙(이사님 결정 2026-10-01 '나') V3-R431 WEAPON.
//  이사님 실플레이: "11스테이지에서 관통탄을 먹은 상태에서 기관총을 습득했는데 탄환 변경이 이루어지지 않았다" — 종전 규칙은 지금 무기보다 등급이
//   높은 통만 교체해(관통탄 3 > 기관총 2) '같은 무기'만 떴다. 이제 다른 무기 통은 등급과 상관없이 언제나 그 무기로(Mk I), 같은 무기는 Mk 한 단계.
//  재현 조작: z 3000 까지 x 326(오른쪽 관통탄 통 차선) → 그 뒤 x 240(가운데 기관총 통 차선). 병사 무적·일반 적 체력 1(재현용 검사 도구 — 규칙 불변)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage } from '../rush3/stages.js';

function playRoute(id, xAt, untilZ) {
  const run = createRun(buildStage(id, { difficulty: 'brutal' }));
  const evs = [];
  let n = 0;
  while (!run.over && n++ < 14400 && run.z < untilZ) {
    for (const u of run.units) u.hp = 1e9;
    for (const e of run.enemies) if (!e.dead && e.hp > 1) e.hp = 1;
    stepRun(run, { pointerX: xAt(run.z), dragDx: 0, keyDir: 0 }, STEP);
    for (const ev of drainEvents(run)) if (ev.type === 'weaponSwap' || ev.type === 'weaponSame' || ev.type === 'weaponMk') evs.push([ev.type, ev.weapon]);
  }
  return { run, evs };
}

test('WEAPON-1: 11번(게임 줄) — 관통탄 통을 먹은 뒤 기관총 통을 열면 기관총으로 바뀐다(Mk I) · "같은 무기"가 뜨지 않는다(이사님 실플레이 재현)', () => {
  const { run, evs } = playRoute(11, (z) => (z < 3000 ? 326 : 240), 7200);
  assert.deepEqual(evs, [['weaponSwap', 'sniper'], ['weaponSwap', 'auto']]);
  assert.deepEqual([run.weapon, run.weaponMk], ['auto', 1]);
});

test('WEAPON-2: 24번 — 중화기(등급 3)를 든 채 같은 등급 관통탄 통(z 8400)을 열어도 관통탄으로 바뀐다', () => {
  const st = buildStage(24, { difficulty: 'brutal' });
  const crates = st.supplies.filter((s) => s.kind === 'weapon').map((s) => [s.z, s.x, s.payload.weapon]);
  const heavy = crates.find((c) => c[2] === 'heavy'), sniper = crates.find((c) => c[2] === 'sniper');
  assert.ok(heavy && sniper && heavy[0] < sniper[0], '24번 무기 통: ' + JSON.stringify(crates));
  //  중화기 통 차선 → 관통탄 통 차선(가운데 기관총 통은 피한다 — 중화기 통 앞 z 에서 오른쪽으로)
  const { run, evs } = playRoute(24, (z) => (z < heavy[0] + 300 ? heavy[1] : sniper[1]), sniper[0] + 400);
  const swaps = evs.filter((e) => e[0] === 'weaponSwap').map((e) => e[1]);
  assert.ok(swaps.includes('heavy') && swaps.at(-1) === 'sniper', '교체 순서: ' + JSON.stringify(evs));
  assert.equal(run.weapon, 'sniper');
  assert.equal(evs.filter((e) => e[0] === 'weaponSame').length, 0);
});
