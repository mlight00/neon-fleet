// rush3-r47 — r4.7(2026-09-26 이사님 실플레이 뒤 지시) 검사 묶음.
//  이사님 원문: "산탄총: 이름에 맞게 총알이 산탄해서 뻗어나가도록 변경, 현재는 나뭇잎 같음 · 저격총: 관통탄으로 이름 변경"
//  SCATTER(산탄포 6발·퍼짐·간격·초당 피해·초당 게이트 +1 이 종전과 비슷·그림은 둥근 알갱이) · NAME(화면 글 '관통탄', 적 '저격수'는 그대로)
//  ⚠️봇·합성 판 실측은 정해진 입력으로 한 판씩 돌린 값이다(사람의 성공률이 아니다). 난이도 판단에 쓰지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BAL3 } from '../rush3/balance.js';
import { WEAPONS, weaponStats, fanAngles, fanSpeeds } from '../rush3/weapons.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { createRenderer3, PELLET } from '../rush3/render.js';
import { gateRate, bossDps } from './lib/rush3-scatter.mjs';
import { bootApp } from './lib/rush3-shell.mjs';

// ═══════════════════════════════ SCATTER ═══════════════════════════════
//  변경 전(04689c8 — 3발 ±14°/0.55초) 실측값. tests/lib/rush3-scatter.mjs 의 같은 함수로 잰 값이다(결정적 — 합성 판 한 판씩).
//   게이트 = 셔터가 열린 1.79초 동안 **자기 칸**이 오른 값(2칸 행 = 왼쪽 칸·부대 x 160 · 3칸 행 = 가운데 칸·부대 x 240)
//   보스 = 도로 정예(사격·소환 끔)가 정지 거리에 선 뒤 10초 동안의 초당 피해(보스에 실제로 닿는 몫)
//   병력 1명 칸은 뺐다 — 발사 간격(0.55 → 1.1초)이 1.79초 창에 몇 번 들어가느냐로 ±20% 가 흔들리는 양자화 칸이다(비교 뜻이 없다)
const BEFORE_GATE = {
  'mk1/n10/L2': 100, 'mk1/n10/L3': 80, 'mk1/n40/L2': 340, 'mk1/n40/L3': 240, 'mk1/n100/L2': 705, 'mk1/n100/L3': 410,
  'mk2/n10/L2': 120, 'mk2/n10/L3': 98, 'mk2/n40/L2': 403, 'mk2/n40/L3': 285, 'mk2/n100/L2': 827, 'mk2/n100/L3': 484,
  'mk3/n10/L2': 134, 'mk3/n10/L3': 109, 'mk3/n40/L2': 450, 'mk3/n40/L3': 324, 'mk3/n100/L2': 929, 'mk3/n100/L3': 549,
};
const BEFORE_BOSS = {
  'mk1/n10/h420': 15.5, 'mk1/n10/h360': 21.6, 'mk1/n40/h420': 47.8, 'mk1/n40/h360': 81.7, 'mk1/n100/h420': 104.7, 'mk1/n100/h360': 170,
  'mk3/n10/h420': 44.2, 'mk3/n10/h360': 58.4, 'mk3/n40/h420': 135, 'mk3/n40/h360': 221.8, 'mk3/n100/h420': 285.6, 'mk3/n100/h360': 466.2,
};
//  '비슷' 허용 폭(±10%)
const NEAR = 0.1;

test('SCATTER-1: 산탄포 = 6발 · 퍼짐 전체 36°(30~36° 안) · 간격 1.1초 · 사거리 420 — 초당 발 수(= 초당 총 피해)는 종전 3발/0.55초와 같다(Mk I~III)', () => {
  const W = WEAPONS.scatter;
  assert.equal(W.fan, 6);
  assert.ok(2 * W.spreadDeg >= 30 && 2 * W.spreadDeg <= 36, '전체 퍼짐 ' + 2 * W.spreadDeg + '°');
  assert.equal(W.interval, 1.1);
  assert.equal(W.range, 420, '사거리 유지');
  assert.equal(W.dmg, 1);
  const a = fanAngles('scatter');
  assert.ok(Math.abs((a[a.length - 1] - a[0]) * 180 / Math.PI - 2 * W.spreadDeg) < 1e-9, '가장 바깥 두 발 사이 = 전체 퍼짐');
  //  종전(04689c8) 3발 · 0.55초 · 피해 1 — Mk 표는 그대로라 Mk II·III 도 같은 비율
  for (let mk = 1; mk <= 3; mk++) {
    const s = weaponStats('scatter', mk);
    const k = BAL3.weaponMk[mk - 1];
    const before = 3 * (1 + k.dmgAdd) / (0.55 * k.intervalMul);
    const now = s.fan * s.dmg / s.interval;
    assert.ok(Math.abs(now / before - 1) < 0.01, `Mk ${mk}: 초당 총 피해 ${now.toFixed(3)} ≈ 종전 ${before.toFixed(3)}`);
  }
  //  발마다 속도가 다르다(결정적 — 정의의 발 번호 표) · 모든 발이 게이트를 +1 한다
  const sp = fanSpeeds('scatter');
  assert.equal(new Set(sp).size, 6);
  const run = createRun({ id: 't', version: 1, title: 't', startUnits: 1, startWeapon: 'scatter', length: 1e6, eliteZ: null, gateRows: [], supplies: [], walls: [], spawns: [], elites: [], elite: null, difficulty: 'normal' });
  run.units[0].fireT = 0;
  stepRun(run, { pointerX: null, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run);
  assert.equal(run.bullets.length, 6);
  assert.ok(run.bullets.every((b) => b.gateHit === 1 && b.kind === 'scatter'));
  assert.equal(new Set(run.bullets.map((b) => b.vz)).size, 6, '발마다 속도가 다르다');
});

test('SCATTER-2: 초당 게이트 +1(자기 칸) — 병력 10·40·100 × 2칸·3칸 행 × Mk I~III 가 종전 실측(04689c8)의 ±10% 안', () => {
  const rows = [];
  for (const [key, before] of Object.entries(BEFORE_GATE)) {
    const [mk, n, L] = key.split('/').map((s) => Number(s.slice(s.search(/\d/))));
    const g = gateRate('scatter', n, L, mk);
    rows.push(`${key} ${before}→${g.own}`);
    assert.ok(Math.abs(g.own / before - 1) <= NEAR, `${key}: 종전 ${before} → 지금 ${g.own} (${(g.own / before).toFixed(3)})`);
  }
});

test('SCATTER-3: 보스에 실제로 닿는 초당 피해 — 병력 10·40·100 × 정지 거리 420·360 × Mk I·III 가 종전 실측(04689c8)의 ±10% 안', () => {
  for (const [key, before] of Object.entries(BEFORE_BOSS)) {
    const [mk, n, h] = key.split('/').map((s) => Number(s.slice(s.search(/\d/))));
    const v = bossDps('scatter', n, h, mk);
    assert.ok(Math.abs(v / before - 1) <= NEAR, `${key}: 종전 ${before} → 지금 ${v.toFixed(1)} (${(v / before).toFixed(3)})`);
  }
});

//  기록 ctx(호출 순서·색)
function recCtx() {
  const ops = []; const grad = { addColorStop() {} }; const stack = [];
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, fill: t.fillStyle, stroke: t.strokeStyle, alpha: t.globalAlpha });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const fxLike = () => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false });

test('SCATTER-4: 그림 = 코드로 그린 둥근 알갱이(탄 그림 bullet_scatter 를 쓰지 않는다) + 짧은 꼬리 + 막 나온 알갱이에 총구 섬광 · 다른 무기는 종전 그림', () => {
  const synth = (w) => ({ id: 't', version: 1, title: 't', startUnits: 3, startWeapon: w, length: 1e6, eliteZ: null, gateRows: [], supplies: [], walls: [], spawns: [], elites: [], elite: null, difficulty: 'normal' });
  const run = createRun(synth('scatter'));
  for (const u of run.units) u.fireT = 0;
  stepRun(run, { pointerX: null, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run);
  const live = run.bullets.filter((b) => !b.dead);
  assert.equal(live.length, 18, '3명 × 6발');
  //  그림이 **있어도**(브라우저) 산탄포 알갱이는 그림을 쓰지 않는다
  const fake = { width: 48, height: 256 };
  const sprites = { get: (k) => (k.startsWith('bullet_') ? fake : null), sheet: () => null, icon: () => null, ready: new Set() };
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, sprites).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
  assert.equal(ops.filter((o) => o.op === 'drawImage' && o.args[0] === fake).length, 0, '탄 그림(나뭇잎처럼 보이던 bullet_scatter) 미사용');
  const cores = ops.filter((o) => o.op === 'arc' && ops[ops.indexOf(o) + 1]?.op === 'fill' && ops[ops.indexOf(o) + 1].fill === PELLET.core);
  assert.equal(cores.length, live.length, '알갱이마다 밝은 둥근 심 하나');
  //  원형 = arc(…, 0, 2π) — 반지름이 작다(가까이 배율에서도 8px 미만: 점)
  for (const c of cores) { assert.equal(c.args[3], 0); assert.ok(Math.abs(c.args[4] - Math.PI * 2) < 1e-12); assert.ok(c.args[2] > 0 && c.args[2] < 8, '작은 점 r ' + c.args[2]); }
  //  꼬리 = 짧은 선(길이 = 반지름 × PELLET.tail) — 길쭉한 그림이 아니다
  const tails = ops.filter((o) => o.op === 'lineTo');
  assert.ok(tails.length >= live.length);
  assert.ok(PELLET.tail <= 3, '꼬리는 반지름의 3배 이하');
  //  막 나온 알갱이(한 STEP 비행)에는 총구 섬광
  assert.ok(ops.filter((o) => o.op === 'fill' && o.fill === PELLET.flash).length >= 1, '총구 섬광');
  //  멀리 날아간 뒤에는 섬광이 없다
  for (let i = 0; i < 20; i++) { stepRun(run, { pointerX: null, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  const b2 = recCtx();
  createRenderer3(b2.ctx, sprites).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
  assert.equal(b2.ops.filter((o) => o.op === 'fill' && o.fill === PELLET.flash).length, 0, '날아가는 중에는 섬광 없음');
  //  다른 무기(소총)는 종전 그림 경로
  const rr = createRun(synth('rifle'));
  for (const u of rr.units) u.fireT = 0;
  stepRun(rr, { pointerX: null, dragDx: 0, keyDir: 0 }, STEP); drainEvents(rr);
  const c3 = recCtx();
  createRenderer3(c3.ctx, sprites).draw({ state: 'run', now: 1, run: rr, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
  assert.equal(c3.ops.filter((o) => o.op === 'drawImage' && o.args[0] === fake).length, rr.bullets.length, '소총은 탄 그림');
});

// ═══════════════════════════════ NAME ═══════════════════════════════
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test("NAME-1: 무기 'sniper' 의 화면 이름 = '관통탄'(내부 id·그림 키 그대로) · 게임 소스의 화면 글에 '저격총'이 없다 · 적 '저격수'는 그대로", () => {
  assert.equal(WEAPONS.sniper.id, 'sniper');
  assert.equal(WEAPONS.sniper.name, '관통탄');
  for (const f of readdirSync(new URL('../rush3/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    const code = stripComments(readFileSync(new URL('../rush3/' + f, import.meta.url), 'utf8'));
    assert.ok(!code.includes('저격총'), f + ': 화면 글에 옛 이름 저격총');
  }
  assert.ok(!readFileSync(new URL('../rush3.html', import.meta.url), 'utf8').includes('저격총'), 'rush3.html');
  //  적 '저격수'는 다른 대상 — 이름 표·안내 문구에 그대로
  assert.match(readFileSync(new URL('../rush3/render.js', import.meta.url), 'utf8'), /shooter: '저격수'/);
  assert.match(readFileSync(new URL('../rush3/advice.js', import.meta.url), 'utf8'), /저격수는 예고선이/);
});

test("NAME-2: 셸 화면 — HUD 무기 칩 '관통탄 Mk II' · 획득 글 '관통탄 장착!' · 강화 글 '관통탄 Mk III!' · 분리벽 표지 '관통탄'(9번)", async () => {
  const h = await bootApp({ unlockThrough: 23 });
  assert.equal(h.app.startRun(9), true);
  h.frames(2);
  const run = h.app.getRun();
  run.weapon = 'sniper'; run.weaponMk = 2;
  assert.ok(h.textNow().includes('관통탄 Mk II'), 'HUD 무기 칩');
  run.events.push({ type: 'weaponSwap', weapon: 'sniper', x: run.x, z: run.z });
  assert.ok(h.textNow().includes('관통탄 장착!'), '획득 글');
  run.events.push({ type: 'weaponMk', weapon: 'sniper', mk: 3, x: run.x, z: run.z });
  assert.ok(h.textNow().includes('관통탄 Mk III!'), '강화 글');
  //  9번 분리벽 오른쪽 표지(무기 = sniper)가 화면에 들어올 때까지
  let seen = false;
  for (let i = 0; i < 900 && !seen; i++) { run.x = 240; seen = h.textNow().includes('관통탄') && run.z > 1500; }
  assert.ok(seen, '분리벽 표지');
});
