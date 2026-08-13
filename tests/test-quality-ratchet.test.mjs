// ── 테스트 품질 래칫 — "소스 코드 한 줄을 통째로 박는 대조"를 더 늘리지 않는다 ──
//
//  왜 이 파일이 있나: 2026-08-11 한 세션에서만 **여덟 번** 같은 일이 났다.
//   §G-27(vulcan import) · §G-30(SHOT_LEN/W) · §G-34 HW-16(shotDepth) · AS-04(호출 인접)
//   · CW2-27 경계 · C3D-visual-layers · CW-01 · G22-CINE3 · HW-14.
//  매번 **계약은 멀쩡한데** 주석을 넣거나 조건을 하나 더한 것만으로 정규식이 깨졌다.
//  깨진 테스트를 고치는 비용보다 나쁜 것은, 그때마다 "제품이 잘못됐나?" 를 의심하며 시간을 쓰는 것이다.
//
//  판별 기준: `assert.match(<소스문자열>, /…/)` 중 **연산자가 2개 이상**이거나 **70자를 넘는** 정규식.
//   그런 패턴은 코드의 *형태*(줄 배치·변수명·조건 순서)를 박아 둔 것이라 리팩터링에 그대로 깨진다.
//   반대로 값·상수·URL·식별자 하나를 확인하는 짧은 대조는 잘 깨지지 않아 여기서 세지 않는다.
//
//  ⚠️이 숫자는 **줄어들기만 해야 한다**(래칫). 교체할 때마다 상한을 함께 낮춰라.
//   늘려야 할 이유가 생겼다면 그건 거의 항상 "실행 기반으로 바꿀 수 있는데 안 바꾼 것"이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
//  현재 실측치(2026-08-11). 교체할 때마다 이 값을 낮춘다.
//   104 → 102: `CW-09`(canWheelZoom 한 줄), `CW-02`(변환 3줄 배치) 를 조건·순서 확인으로 교체.
const BUDGET = 102;

/** 소스 문자열을 정규식으로 대조하는 줄 중 "코드 형태를 박은" 것만 센다. */
export function countBrittle() {
  const rx = /assert\.match\(\s*(main|src|renderer|hero|mainSrc|defs)\s*,\s*\/(.+?)\/[a-z]*\s*[,)]/;
  const OPS = ['===', '&&', '||', '=>', '\\?', ';'];
  const hits = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.test.mjs') || f === 'test-quality-ratchet.test.mjs') continue;
    const lines = readFileSync(new URL(f, import.meta.url), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = rx.exec(line);
      if (!m) return;
      const pat = m[2];
      const score = OPS.reduce((n, t) => n + pat.split(t).length - 1, 0);
      if (score >= 2 || pat.length > 70) hits.push({ file: f, line: i + 1, len: pat.length, score });
    });
  }
  return hits;
}

test('TEST-RATCHET: 코드 형태를 박는 대조를 더 늘리지 않는다', () => {
  const hits = countBrittle();
  assert.ok(hits.length <= BUDGET,
    `취약한 소스 대조가 ${hits.length}건 — 상한 ${BUDGET}건을 넘었다.\n`
    + '새로 추가하지 말고 **실행 기반**으로 써라(기록 ctx 로 draw 실행, 제품 함수 호출, 값 비교).\n'
    + `가장 최근 추가분: ${JSON.stringify(hits.slice(-3))}`);
  //  ⚠️상한을 낮추라는 알림 — 실제로 줄었으면 BUDGET 도 함께 내려야 래칫이 작동한다.
  assert.ok(hits.length >= BUDGET - 5,
    `취약 대조가 ${hits.length}건으로 줄었다(상한 ${BUDGET}). 잘한 일이다 — **BUDGET 을 ${hits.length} 로 낮춰라.**`);
});

test('TEST-RATCHET-NEWFILES: 이번 세션에 만든 g34 테스트에는 취약 대조가 없다', () => {
  //  새로 쓰는 테스트만이라도 실행 기반을 지킨다 — 여기서 늘어나면 습관이 그대로 굳는다.
  const hits = countBrittle().filter((h) => h.file.startsWith('g34-'));
  assert.equal(hits.length, 0,
    `g34-* 는 전부 실행 기반이어야 한다 — 실측 ${JSON.stringify(hits)}`);
});
