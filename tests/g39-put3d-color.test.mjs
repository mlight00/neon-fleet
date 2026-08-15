// ── §G-39 / §G39-R1 — 적 3D 슬롯 기록 seam ────────────────────────────────────────────
//
//  §G39-R1 (Codex 구현검수 §5): 예전 이 파일은 `put3D()` 가 하는 계산을 **테스트 안에서 재현**했다.
//  그래서 production 의 색 기록 한 줄을 지워도 이 파일과 hero 파일이 둘 다 통과했다.
//
//  ⚠️구조로 막았다: 이제 위치(sx/sy/px/wob)와 색(cr/cg/cb)을 `writeEnemySlot` **한 호출**이 함께 쓴다.
//   `put3D()` 는 그 함수를 부르고, 이 테스트도 같은 함수를 부른다. "색 기록만 조용히 지우는" 변이는
//   더 이상 표현할 수 없다 — 지우면 위치도 같이 사라져 적이 화면 원점에 크기 0 으로 몰린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEEDBACK, recordDamageFeedback } from '../js/damage-feedback.js';
import { writeEnemySlot } from '../js/chase3d-collect.js';

//  §G-46: spark·hp 추가. 슬롯 모양은 main.js 사전 할당(3103)과 **같아야** 한다 —
//  다르면 이 테스트가 지키려는 히든클래스 계약이 실제 경로와 어긋난다.
const freshSlot = () => ({ sx: 0, sy: 0, px: 0, wob: 0, cr: 1, cg: 1, cb: 1, spark: 0, hp: 1 });
const PROJ = { x: 240, y: 500, scale: 1.5 };
const DEF = { len: 60, max: 120 };
const rgb = (s) => [s.cr, s.cg, s.cb].join();

test('G39-SLOT-SHAPE: 적 버퍼 슬롯이 색 채널을 갖는다', () => {
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(src, /sx: 0, sy: 0, px: 0, wob: 0, cr: 1, cg: 1, cb: 1/,
    '적 슬롯에 cr/cg/cb 초기값 1 이 있어야 한다(초기값 0 이면 검게 나온다)');
});

test('G39R1-SEAM-WRITES-BOTH: 한 호출이 위치와 색을 함께 쓴다(색만 지우는 변이가 성립하지 않는 근거)', () => {
  const slot = freshSlot();
  const enemy = { hp: 5, maxHp: 10, x: 100, y: 200 };
  writeEnemySlot(slot, enemy, PROJ, DEF, 0.7, 0, FEEDBACK.boost);

  assert.equal(slot.sx, PROJ.x, '화면 x');
  assert.equal(slot.sy, PROJ.y, '화면 y');
  assert.equal(slot.px, Math.min(DEF.max, DEF.len * PROJ.scale), '화면 크기(상한 클램프 포함)');
  assert.equal(slot.wob, 0.7, '흔들림 위상');
  assert.notEqual(rgb(slot), '1,1,1', '체력이 절반이면 색이 흰색에서 벗어나야 한다');
});

test('G39R1-SEAM-CLAMP: 화면 크기는 종별 상한을 넘지 않는다', () => {
  const slot = freshSlot();
  writeEnemySlot(slot, { hp: 1, maxHp: 1 }, { x: 0, y: 0, scale: 99 }, DEF, 0, 0, FEEDBACK.boost);
  assert.equal(slot.px, DEF.max, '먼 거리에서 스케일이 폭주해도 상한을 지켜야 한다');
});

test('G39R1-SEAM-NO-ALLOC: 새 객체를 만들지 않고 넘겨받은 슬롯을 그대로 돌려준다', () => {
  //  ⚠️적 수만큼 매 프레임 도는 경로다. 임시 객체가 생기면 GC 압력이 된다.
  const slot = freshSlot();
  const out = writeEnemySlot(slot, { hp: 1, maxHp: 1 }, PROJ, DEF, 0, 0, FEEDBACK.boost);
  assert.equal(out, slot, '같은 객체 정체성이어야 한다(새로 만들면 안 된다)');
  //  개수가 아니라 **키 집합**으로 고정한다 — 개수만 보면 이름이 바뀌어도 통과한다.
  assert.deepEqual(Object.keys(slot).sort(), ['cb','cg','cr','hp','px','spark','sx','sy','wob'],
    '슬롯 모양이 바뀌었다 — main.js 사전 할당(3103)과 함께 고쳐야 한다');
});

test('G39R1-SEAM-PIPELINE: 체력·피격이 슬롯 색으로 이어진다', () => {
  const slot = freshSlot();
  const enemy = { hp: 10, maxHp: 10, x: 0, y: 0 };
  const paint = (now) => { writeEnemySlot(slot, enemy, PROJ, DEF, 0, now, FEEDBACK.boost); return rgb(slot); };

  const full = paint(1);
  enemy.hp = 2;
  const low = paint(1);
  assert.notEqual(full, low, '체력이 줄면 색이 달라야 한다');

  recordDamageFeedback(enemy, 0, 0, 5, 3);
  const hit = paint(5);
  assert.notEqual(low, hit, '피격 직후 색이 달라야 한다');
  assert.ok(slot.cr > 1, `피격 중 R 이 1 을 넘어야 한다(번쩍) — 실측 ${slot.cr}`);
  assert.equal(paint(5 + FEEDBACK.flashDur), low, '플래시가 끝나면 체력 색으로 돌아온다');
});

test('G39R1-SEAM-BOOST-PARAM: 밝기 배수를 인자로 받는다(하드코딩이 아니다)', () => {
  //  reduced-motion 경로가 실제로 약한 값을 쓰는지 — 상수를 테스트에 베끼지 않고 두 값을 비교한다.
  const enemy = { hp: 10, maxHp: 10, x: 0, y: 0 };
  recordDamageFeedback(enemy, 0, 0, 0, 1);
  const a = freshSlot(), b = freshSlot();
  writeEnemySlot(a, enemy, PROJ, DEF, 0, 0, FEEDBACK.boost);
  writeEnemySlot(b, enemy, PROJ, DEF, 0, 0, FEEDBACK.boostReduced);
  assert.ok(a.cr > b.cr, `본값이 reduced 보다 밝아야 한다 — ${a.cr} vs ${b.cr}`);
  assert.ok(Math.abs(a.cr - FEEDBACK.boost) < 1e-9, 'R 채널은 정확히 boost 다(체력 틴트가 R 을 1 로 유지)');
  assert.ok(Math.abs(b.cr - FEEDBACK.boostReduced) < 1e-9, 'reduced 경로도 같은 규칙');
});

test('G39R1-SEAM-NO-MAXHP: maxHp 가 없는 개체는 무염색(흰색)으로 남는다', () => {
  //  위험물 일부는 maxHp 가 없다. 0 나눗셈으로 NaN 이 GPU 로 가면 그 인스턴스가 사라진다.
  const slot = freshSlot();
  writeEnemySlot(slot, { x: 0, y: 0 }, PROJ, DEF, 0, 0, FEEDBACK.boost);
  assert.equal(rgb(slot), '1,1,1', 'maxHp 없는 개체는 흰색');
  for (const v of [slot.cr, slot.cg, slot.cb]) assert.ok(Number.isFinite(v), 'NaN 이 나오면 안 된다');
});

test('G39R2-PUT3D-WIRED: production put3D 가 실제로 seam 을 호출한다(링크 제거 감지)', () => {
  //  §G39-R2 (Codex R1 재검수 P1): seam 실행 테스트와 hero renderer 테스트가 있어도
  //  **put3D 안의 호출 한 줄**을 지우면 둘 다 통과한다 — main.js 는 export 가 0개라 그 줄을 실행할 수 없다.
  //  코덱스가 제시한 방법: 이 파일이 이미 put3D 본문을 읽고 있으니 여기에 링크 단언을 더한다.
  //  ⚠️"문자열이 있다"가 아니라 **연결이 살아 있다**를 본다 — 슬롯(o)과 개체(e)를 그 함수에 넘기는지.
  //   실행 seam 테스트(위 6개) + 실제 THREE renderer 테스트와 **결합**해야 의미가 있다. 이것만으로는 부족하다.
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const at = src.indexOf('function put3D');
  assert.ok(at > 0, 'put3D 를 찾지 못했다 — 함수명이 바뀌었으면 이 테스트부터 고쳐라');
  const body = src.slice(at, at + 1400);
  assert.match(body, /writeEnemySlot\s*\(\s*o\s*,\s*e\s*,/,
    'put3D 가 수집한 슬롯(o)과 개체(e)를 writeEnemySlot 에 넘겨야 한다 — 이 줄이 사라지면 3D 색이 통째로 죽는다');
  assert.match(src, /import \{ writeEnemySlot \} from '\.\/chase3d-collect\.js'/,
    'seam 을 실제로 import 해야 한다');
});

test('G39-SLOT-NO-ALLOC: put3D 경로에 객체·배열 생성이 없다', () => {
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function put3D'), src.indexOf('function put3D') + 1400);
  assert.ok(!/=\s*\{[^}]/.test(fn.replace(/\/\/[^\n]*/g, '')), 'put3D 안에서 객체 리터럴 생성 금지');
  assert.ok(!/new (Array|THREE\.Color)/.test(fn), 'put3D 안에서 new Array/Color 금지');
});
