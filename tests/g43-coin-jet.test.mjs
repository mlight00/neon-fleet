// ── §G-43 — 코인 밝기 + 기함 추진 제트 ────────────────────────────────────────────────
//
//  이사님 제보(2026-08-13) 2건:
//   ① "코인이 너무 칙칙한 색상이다. 더 밝고 빛나는 금색으로 변환해줘."
//   ② "2D 에서는 함미에 추진 불꽃이 보이는데 함미모드에서 기함 뒤 분사구에 제트가 전혀 안 보인다."
//
//  ①의 원인: 스프라이트 원본이 실제로 어둡다(실측: 불투명 픽셀 평균 RGB(98,73,20) · 밝기 23%).
//   ⚠️이미지를 다시 굽지 않는다 — **그릴 때** 밝힌다(렌더 전용, 자산·판정 불변).
//  ②의 원인: 3D 기함에 추진 연출이 **아예 없었다**. 2D 는 `ships.js drawFlames()` 가 그리고 있었다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NOZZLE_POINTS, MOUNT_POINTS } from '../js/chase3d-prop-defs.js';
import { SHIP_DEFS } from '../js/ships.js';

// ── ② 노즐 좌표표 ─────────────────────────────────────────────────────────────────────

test('G43-NOZZLE-TIERS: 모든 기함 등급에 분사구 좌표가 있다', () => {
  assert.equal(NOZZLE_POINTS.length, SHIP_DEFS.length,
    `등급 수만큼 있어야 한다 — 노즐표 ${NOZZLE_POINTS.length} / 기함 ${SHIP_DEFS.length}`);
  NOZZLE_POINTS.forEach((pts, t) => {
    assert.ok(Array.isArray(pts) && pts.length > 0, `tier ${t}: 최소 1개`);
    for (const p of pts) {
      assert.equal(p.length, 3, `tier ${t}: [x, y, len] 세 값`);
      for (const v of p) assert.ok(Number.isFinite(v), `tier ${t}: 유한값이어야 한다`);
    }
  });
});

test('G43-NOZZLE-STERN: 분사구는 전부 2D 기준 함미(+y)에 있다', () => {
  //  ⚠️3D 배치가 z 를 뒤집어 쓴다(−y → 선미). 부호가 섞이면 제트가 기수에서 나온다.
  NOZZLE_POINTS.forEach((pts, t) => {
    for (const p of pts) assert.ok(p[1] > 0.2, `tier ${t}: y=${p[1]} — 함미(+y)여야 한다`);
    for (const p of pts) assert.ok(p[2] > 0, `tier ${t}: 화염 길이는 양수`);
  });
});

test('G43-NOZZLE-MIRROR: 분사구 배치가 좌우 대칭이다', () => {
  //  기함은 좌우 대칭이다 — 한쪽으로 치우친 추진은 그림이 어긋난다.
  NOZZLE_POINTS.forEach((pts, t) => {
    const xs = pts.map((p) => p[0]).sort((a, b) => a - b);
    for (let i = 0; i < xs.length; i++) {
      const mate = xs[xs.length - 1 - i];
      assert.ok(Math.abs(xs[i] + mate) < 1e-9, `tier ${t}: ${xs[i]} 의 짝이 ${mate} — 거울쌍이 아니다`);
    }
  });
});

test('G43-NOZZLE-MATCHES-2D: 좌표가 2D drawFlames 의 노즐과 같은 자리다', () => {
  //  ⭐2D 와 3D 가 **다른 자리**에서 불을 뿜으면 시점을 바꿀 때 어긋난다.
  //  ⚠️§G-48 전에는 이 검사가 `SHIP_DEFS_RAW` 를 정규식으로 읽었다. 그런데 게임이 실제로 그리는 노즐은
  //   RAW 가 아니라 **NORMALIZED_ENGINES 에서 유도된 SHIP_DEFS[t].nozzles** 다 —
  //   즉 아무도 안 보는 표를 지키느라, 3D 가 진짜 2D 와 어긋나도 통과하고 있었다. 이제 실물을 본다.
  assert.equal(SHIP_DEFS.length, NOZZLE_POINTS.length, `등급 수가 맞아야 한다 — 원본 ${SHIP_DEFS.length}`);
  SHIP_DEFS.forEach((d, t) => {
    const w = d.visualWidth, h = d.visualSize;
    const nz = d.nozzles;
    assert.equal(nz.length, NOZZLE_POINTS[t].length, `tier ${t}: 노즐 개수`);
    nz.forEach((n, i) => {
      const want = [n.x / w, n.y / h, n.len / h];
      const got = NOZZLE_POINTS[t][i];
      want.forEach((v, k) => assert.ok(Math.abs(v - got[k]) < 0.002,
        `tier ${t} 노즐 ${i} 성분 ${k}: 2D 환산 ${v.toFixed(3)} vs 표 ${got[k]}`));
    });
  });
});

test('G43-NOZZLE-NOT-MOUNTS: 분사구와 무기 장착점은 서로 다른 표다', () => {
  //  ⚠️둘 다 정규화 2D 좌표라 헷갈리기 쉽다. 장착점은 −y(기수), 노즐은 +y(함미)다.
  MOUNT_POINTS.forEach((pts, t) => {
    for (const p of pts) assert.ok(p[1] <= 0, `tier ${t}: 장착점 y=${p[1]} — 기수(−y)여야 한다`);
  });
});

// ── ② 렌더러 배선 ─────────────────────────────────────────────────────────────────────
//  ⚠️`placeJets` 는 renderer 클로저 안이라 Node 로 직접 실행할 수 없다(§G39-R2 와 같은 제약).
//   실제 렌더 결과는 브라우저 WebGL 로 확인했다(docs/qa/g43). 여기서는 배선이 살아 있는지만 본다.

test('G43-JET-WIRED: 제트가 실제 프레임 경로에 배선돼 있다', () => {
  const src = readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*\bNOZZLE_POINTS\b[^}]*\}/, '노즐표를 import 해야 한다');
  assert.match(src, /jetRig\.visible = useGlb && placeJets\(/,
    '프레임에서 placeJets 를 불러야 한다 — 이 줄이 빠지면 제트가 통째로 사라진다');
  assert.match(src, /flagRig\.add\(jetRig\)/, '제트는 flagRig 에 붙어야 흔들림·롤을 따라온다');
  //  코드에서 전역 난수를 쓰면 안 된다(§G39-R1 계약) — 주석은 걷어내고 본다.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const jet = code.slice(code.indexOf('function placeJets'), code.indexOf('function placeJets') + 2000);
  assert.ok(jet.length > 100, 'placeJets 를 찾지 못했다');
  assert.ok(!/Math\.random\(\)/.test(jet), '제트 맥동은 결정적 LCG(_rnd) 여야 한다');
});

// ── ① 코인 밝기 ───────────────────────────────────────────────────────────────────────

test('G43-COIN-BRIGHTEN: 코인을 그릴 때 가산 합성으로 밝힌다(원본 자산은 그대로)', () => {
  //  ⚠️스프라이트를 다시 굽는 방식이면 자산이 바뀌어 다른 화면에도 영향이 간다.
  //   렌더 시점 보정이라 코인이 나오는 곳만 밝아진다. 실측: 본체 밝기 23% → 42%.
  const src = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
  const at = src.indexOf("lockedSprite(this, 'PROP_COIN')");
  assert.ok(at > 0, '코인 스프라이트 경로를 찾지 못했다');
  const body = src.slice(at, at + 1200);
  assert.match(body, /globalCompositeOperation = 'lighter'/, '가산 합성으로 밝혀야 한다');
  assert.match(body, /glow\(ctx, '#\w{6}'/, '금색 후광이 있어야 "빛나는" 느낌이 난다');
  assert.match(body, /finally \{ ctx\.restore\(\)/, '캔버스 상태를 반드시 복구해야 한다(다음 개체 오염 방지)');
});

test('G43-COIN-STATE-SAFE: 코인 그리기가 캔버스 상태를 남기지 않는다', async () => {
  //  ⚠️`globalCompositeOperation` 을 되돌리지 않으면 **그 뒤 그려지는 모든 것**이 가산 합성이 된다.
  const { Coin } = await import('../js/entities.js');
  const log = [];
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', shadowColor: '', shadowBlur: 0, fillStyle: '',
    save() { log.push('save'); }, restore() { log.push('restore'); },
    beginPath() {}, arc() {}, fill() {}, stroke() {}, drawImage() {}, translate() {}, scale() {}, rotate() {},
  };
  const c = new Coin(50, 50, 3);
  c.draw(ctx);   // 스프라이트가 없는 Node 환경 = 도형 폴백 경로
  assert.equal(ctx.globalCompositeOperation, 'source-over', '합성 모드가 원복돼야 한다');
  assert.equal(ctx.globalAlpha, 1, '알파가 원복돼야 한다');
  assert.equal(log.filter((x) => x === 'save').length, log.filter((x) => x === 'restore').length,
    `save/restore 짝이 맞아야 한다 — ${log.join(',')}`);
});
