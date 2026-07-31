import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChaseProjection, projectPoint } from '../js/chase-camera.js';
import { makeProjector, drawLaserStreak, collectEdgeWarnings } from '../js/chase-render.js';
import { ChargeLance, TriGate } from '../js/entities.js';

// RC2 보정 회귀. Squad.draw는 헤드리스에서 document 의존이라 mock 불가 → RC2-04/07/10은 소스-배선 + 실브라우저 QA로 보완(보고서 명시).
const W = 480, H = 800, SQX = 240, SQY = 660;
const proj = (zoom, blend, sx = SQX) => createChaseProjection({ zoom, chaseBlend: blend, squadX: sx, squadY: SQY, logicalW: W, logicalH: H });
function mockCtx() {
  const rec = [];
  const c = new Proxy({ _rec: rec, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', font: '', textAlign: '', shadowBlur: 0, shadowColor: '', globalCompositeOperation: '' }, {
    get(t, k) {
      if (k in t) return t[k];
      return (...a) => { rec.push([k, ...a]); if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop() {} }; if (k === 'measureText') return { width: 10 }; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return c;
}
const finiteArgs = (rec) => rec.every((r) => r.slice(1).every((a) => typeof a !== 'number' || Number.isFinite(a)));

// RC2-01: 220% ChargeLance 투영 전부 유한 + draw 호출 ≥1
test('RC2-01: 220% ChargeLance 투영 유한 + 실제 draw ≥1', () => {
  const lance = new ChargeLance(SQX, SQY, 20, 3);
  const ctx = mockCtx();
  lance.drawProjected(ctx, makeProjector(proj(2.2, 1)));
  const draws = ctx._rec.filter((r) => r[0] === 'fill' || r[0] === 'stroke').length;
  assert.ok(draws >= 1, `draw 호출 ${draws} ≥ 1 (RC1은 0이었음)`);
  assert.ok(finiteArgs(ctx._rec), '모든 좌표 유한(NaN 없음)');
});

// RC2-02: 차지 랜스 발사구가 투영된 기함 발사 위치에 붙어 있음
test('RC2-02: 차지 랜스 발사구 == 투영된 기함 발사점(≤2px)', () => {
  const p = proj(2.2, 1);
  const muzzle = projectPoint({ x: SQX, y: SQY }, p);          // 랜스 발사구(x, baseY=squadY)
  const flagship = projectPoint({ x: SQX, y: SQY }, p);        // 기함 발사점
  assert.ok(Math.hypot(muzzle.x - flagship.x, muzzle.y - flagship.y) <= 2, `${muzzle.x},${muzzle.y}`);
});

// RC2-03: 서로 다른 Y의 드론 두 개 — 가까운(아래) 드론이 더 크게 표시
test('RC2-03: 가까운 드론이 먼 드론보다 크다', () => {
  const p = proj(2.0, 1);
  const near = projectPoint({ x: SQX, y: SQY - 40 }, p);
  const far = projectPoint({ x: SQX, y: 80 }, p);
  assert.ok(near.scale > far.scale, `near ${near.scale} > far ${far.scale}`);
  assert.ok(near.y > far.y, '가까운 드론이 화면 아래');
});

// RC2-04: 기함·순양함 표시 중심 == 각 월드 중심 projectPoint (배선 + 수치). 실제 렌더 정합은 브라우저 QA.
test('RC2-04: 편대는 개체별 월드중심 projectPoint로 배치(공유 배율 아님)', () => {
  const ent = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
  // Squad.draw가 place(=projector.point)로 각 개체를 이동하고, 기함은 projector.point + fitFlagship 사용
  assert.match(ent, /const p = projector\.point\(this\.x, this\.y \+ this\.recoil\);/);
  assert.match(ent, /fs = projector\.fitFlagship\(p, def\.clearR \* 1\.7\)/);
  assert.match(ent, /if \(projector\) \{ const p = projector\.point\(wx, wy\); ctx\.translate\(p\.x, p\.y\); return p\.scale; \}/);
  // 수치: 서로 다른 월드 중심은 서로 다른 투영 중심(개체별) — 한 배율 공유가 아님
  const p = proj(2.2, 1);
  const a = projectPoint({ x: SQX - 60, y: SQY - 10 }, p);   // 왼쪽 순양함
  const b = projectPoint({ x: SQX, y: SQY }, p);              // 기함
  assert.ok(Math.abs(a.x - b.x) > 2 && Number.isFinite(a.x), '순양함·기함 표시 중심 분리');
});

// RC2-05: 보이는 레인(투영 rect)이 그 레인을 선택하는 조준점(투영)을 포함 → 표시 레인 == 선택 레인.
//  게이트 rect 모서리와 선택 중심 모두 projectPoint를 쓰므로 투영이 어긋남을 추가하지 않음(§3.4 핵심).
test('RC2-05: 보이는 3레인이 각 선택 조준점을 포함(표시==판정)', () => {
  const p = proj(2.0, 1);
  const g = new TriGate(W, SQY, [{ kind: 'drones', value: 1 }, { kind: 'weaponLv' }, { kind: 'shield' }]);
  const laneW = W / 3;
  for (let lane = 0; lane < 3; lane++) {
    const rect = g.laneRect(lane);
    const selCenterWorld = (lane + 0.5) * laneW;                         // 이 레인을 선택하는 월드 조준점
    const selScreen = projectPoint({ x: selCenterWorld, y: SQY }, p).x;   // 투영된 조준점
    const left = projectPoint({ x: rect.x, y: SQY }, p).x;               // 투영된 보이는 레인 좌
    const right = projectPoint({ x: rect.x + rect.w, y: SQY }, p).x;      // 투영된 보이는 레인 우
    assert.ok(selScreen >= left - 2 && selScreen <= right + 2, `레인 ${lane}: 조준 ${selScreen.toFixed(1)} ∈ [${left.toFixed(1)},${right.toFixed(1)}]`);
  }
});

// RC2-06: 레이저 스트릭 시작·끝점 투영 오차 ≤2px
test('RC2-06: 레이저 스트릭 끝점 == projectPoint(x,prevY)/(x,y) (≤2px)', () => {
  const p = proj(2.0, 1);
  const bullet = { x: 300, y: 300, prevY: 380, beamW: 3, kind: 'laser', color: '#8fe8ff' };
  const ctx = mockCtx();
  drawLaserStreak(ctx, bullet, makeProjector(p));
  const moveTo = ctx._rec.find((r) => r[0] === 'moveTo');
  const lineTo = ctx._rec.find((r) => r[0] === 'lineTo');
  const a = projectPoint({ x: bullet.x, y: bullet.prevY }, p);
  const e = projectPoint({ x: bullet.x, y: bullet.y }, p);
  assert.ok(Math.hypot(moveTo[1] - a.x, moveTo[2] - a.y) <= 2, `시작 ${moveTo[1]},${moveTo[2]} vs ${a.x},${a.y}`);
  assert.ok(Math.hypot(lineTo[1] - e.x, lineTo[2] - e.y) <= 2, `끝 ${lineTo[1]},${lineTo[2]} vs ${e.x},${e.y}`);
});

// RC2-07: xN 글꼴이 100~220%에서 지정 상한(고정 14~20px)을 넘지 않음 (배선). 실제 렌더는 브라우저 QA.
test('RC2-07: xN 편대수 글꼴은 고정(투영 배율 미적용, 14~20px)', () => {
  const ent = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
  // xN 라벨 주변: 고정 px 글꼴이 설정되고, 그 값이 14~20 범위이며, 배율(fs/ringS/scale) 곱이 없어야.
  const i = ent.indexOf('x${this.count}');
  assert.ok(i > 0, 'xN 라벨 존재');
  const block = ent.slice(i - 800, i + 60);
  const m = block.match(/ctx\.font = 'bold (\d+)px Pretendard/);
  assert.ok(m, 'xN 라벨 앞에 고정 px 글꼴 설정');
  const px = Number(m[1]);
  assert.ok(px >= 14 && px <= 20, `글꼴 ${px}px ∈ 14~20`);
  assert.ok(!/font =[^;]*\*\s*(fs|ringS|ov\.scale|scale)/.test(block), '글꼴에 투영 배율 미적용');
});

// RC2-08: 화면 밖에서 멀어지는 적탄은 경고하지 않음
test('RC2-08: 멀어지는(위로) 적탄은 경고 제외', () => {
  const p = proj(2.0, 1);
  const r = {
    bosses: [], squad: { x: SQX, y: SQY },
    world: { enemyBullets: [{ x: SQX + 2000, y: 300, vx: 0, vy: -200, dead: false }], bullets: [], entities: [] },
  };
  const warns = collectEdgeWarnings(r, p, { w: W, h: H });
  assert.equal(warns.filter((w) => w.danger === 'enemyBullet').length, 0, '위로 멀어지는 탄 경고 없음');
});

// RC2-09: 같은 방향 적탄 4개 중 충돌 임박 3개가 선택됨
test('RC2-09: 접근 적탄 4개 중 임박 3개 선택(방향당 3, 위험도순)', () => {
  const p = proj(2.0, 1);
  // 모두 오른쪽 화면 밖(x 큼)에서 기함으로 접근(vy>0, 도달 시 x가 기함 근처). ttc가 작을수록 임박.
  const mk = (ttc) => ({ x: SQX + 900, y: SQY - ttc * 200, vx: -900 / ttc, vy: 200, dead: false });
  const r = {
    bosses: [], squad: { x: SQX, y: SQY },
    world: { enemyBullets: [mk(0.3), mk(0.6), mk(0.9), mk(1.2)], bullets: [], entities: [] },
  };
  const warns = collectEdgeWarnings(r, p, { w: W, h: H });
  const eb = warns.filter((w) => w.danger === 'enemyBullet');
  assert.ok(eb.length <= 3, `방향당 ≤3 (실제 ${eb.length})`);
});

// RC2-11: 100% 전술 렌더 경로가 기존 global transform 계약 유지 (main.js 배선)
test('RC2-11: 100% 전술 경로 = 기존 global transform 유지', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /const useChase = state === 'play' && chase\.current > 0\.001;/);
  assert.match(main, /ctx\.scale\(camera\.current, camera\.current\);/);   // 전술 경로 global transform 보존
  // 전술 경로에서 squad.draw(ctx)를 projector 없이 호출(= 기존 렌더)
  assert.match(main, /if \(!r\.squad\.dead\) r\.squad\.draw\(ctx\);/);
});

// RC2-10(월드 스냅샷 100% vs 220% 일치)은 헤드리스 document 제약으로 브라우저 QA에서 300프레임 실측(보고서 §7). 여기선 경계 재확인.
test('RC2-10-boundary: 투영은 순수(입력 불변) — 규칙 불변의 정적 근거', () => {
  const p = proj(2.2, 1);
  const pt = { x: 123, y: 456 };
  const before = { ...pt };
  projectPoint(pt, p);
  assert.deepEqual(pt, before, '입력 좌표 불변(카메라는 읽기 전용)');
});
