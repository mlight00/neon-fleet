// §G-46 — 적 피격·격파 3D 파편.
//
// 이사님 요청: "3D 에서 적 피탄이 빨간 번쩍뿐이라 밋밋하다" → 파편, 그리고 "터질 때도".
// 여기서 지키는 것: 상승 에지 1회성 · 품질 사다리 연동 · 전역 RNG 미소비 · 예산 상한 · 배선.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordDamageFeedback, consumeHitSpark, readDamageFlash, FEEDBACK } from '../js/damage-feedback.js';
import { writeEnemySlot } from '../js/chase3d-collect.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const enemy = (hp = 10, maxHp = 10) => ({ hp, maxHp, x: 0, y: 0 });
const DEF = { len: 150, max: 300 };

test('consumeHitSpark: 한 번 맞으면 한 번만 나온다', () => {
  const e = enemy();
  assert.equal(consumeHitSpark(e), false, '맞은 적 없는데 파편이 나온다');

  recordDamageFeedback(e, 0, 0, 0, 3);
  assert.equal(consumeHitSpark(e), true, '피격 직후 1회분이 안 나온다');
  assert.equal(consumeHitSpark(e), false, '같은 피격으로 두 번 나온다');
  assert.equal(consumeHitSpark(e), false);

  //  쿨다운(0.34s) 뒤 새 피격 → 다시 한 번
  recordDamageFeedback(e, 0, 0, FEEDBACK.flashCooldown + 0.01, 3);
  assert.equal(consumeHitSpark(e), true, '새 피격인데 안 나온다');
  assert.equal(consumeHitSpark(e), false);
});

test('감쇠값(flash)으로 판정하면 안 되는 이유 — 여러 프레임 0이 아니다', () => {
  //  이 테스트가 설계 근거다. flash>0 으로 방출하면 한 번 맞을 때마다 프레임 수만큼 쏟아진다.
  const e = enemy();
  recordDamageFeedback(e, 0, 0, 0, 3);
  let framesNonZero = 0;
  for (let t = 0; t < FEEDBACK.flashDur; t += 1 / 60) if (readDamageFlash(e, t) > 0) framesNonZero++;
  assert.ok(framesNonZero >= 2, `flash>0 인 프레임이 ${framesNonZero}개뿐 — 전제가 바뀌었다`);
  //  반면 spark 는 정확히 1회
  let sparks = 0;
  for (let t = 0; t < FEEDBACK.flashDur; t += 1 / 60) if (consumeHitSpark(e)) sparks++;
  assert.equal(sparks, 1, 'spark 가 1회가 아니다');
});

test('writeEnemySlot 이 spark·hp 를 슬롯에 기록한다', () => {
  const e = enemy(3, 10);
  const slot = {};
  const p = { x: 100, y: 200, scale: 1 };

  writeEnemySlot(slot, e, p, DEF, 0, 0, FEEDBACK.boost);
  assert.equal(slot.spark, 0, '맞지도 않았는데 spark 가 섰다');
  assert.ok(Math.abs(slot.hp - 0.3) < 1e-9, 'hp 비율이 슬롯에 안 들어온다');

  recordDamageFeedback(e, 0, 0, 1, 2);
  writeEnemySlot(slot, e, p, DEF, 0, 1, FEEDBACK.boost);
  assert.equal(slot.spark, 1, '피격 후 spark 가 안 선다');
  writeEnemySlot(slot, e, p, DEF, 0, 1, FEEDBACK.boost);
  assert.equal(slot.spark, 0, '같은 피격으로 다음 프레임에도 spark 가 선다');
});

test('죽은 적은 spark 를 내지 않는다 — 격파 연출이 담당한다', () => {
  const e = enemy();
  recordDamageFeedback(e, 0, 0, 0, 3);
  e.dead = true;
  const slot = {};
  writeEnemySlot(slot, e, { x: 0, y: 0, scale: 1 }, DEF, 0, 0, FEEDBACK.boost);
  //  isDamageFlashTarget 이 dead 를 막으므로 flash 는 0. spark 는 기록 자체가 남아 있어 1회는 나올 수 있으나
  //  main 은 죽은 적을 3D 목록에 넣지 않는다. 여기서는 flash 가 0 인 것만 고정한다(§G39-R2 계약).
  assert.equal(readDamageFlash(e, 0), 0, '죽은 적의 flash 가 0 이 아니다 — G39-R2 회귀');
});

// ── 렌더러 배선 (main.js·renderer 는 export 가 없어 정적 검사) ──────────────────────────

const R = readFileSync(join(ROOT, 'js/chase3d-renderer.js'), 'utf8');
const M = readFileSync(join(ROOT, 'js/main.js'), 'utf8');

test('파편 버퍼가 적까지 감당하도록 늘었다', () => {
  const m = R.match(/const DEBRIS_MAX\s*=\s*(\d+)/);
  assert.ok(m, 'DEBRIS_MAX 를 찾지 못했다');
  assert.ok(+m[1] >= 48, `DEBRIS_MAX 가 ${m[1]} — 적 피격까지 쓰려면 48 이상이어야 한다`);
});

test('방출이 공용 함수 하나로 모였다 — 기함도 같은 경로를 쓴다', () => {
  assert.ok(/function emitDebris\(/.test(R), 'emitDebris 공용 방출기가 없다');
  //  기함 피격이 옛날처럼 _deb.push 를 직접 하지 않는지
  const flagBlock = R.slice(R.indexOf('_prevFlash + 0.1'), R.indexOf('_prevFlash = fl'));
  assert.ok(/emitDebris\(/.test(flagBlock), '기함 피격이 공용 방출기를 안 쓴다');
  assert.ok(!/_deb\.push\(/.test(flagBlock), '기함 피격이 아직 _deb.push 를 직접 한다');
});

test('품질 사다리에 물려 있다 — 프레임이 모자라면 파편이 먼저 준다', () => {
  assert.ok(/function debrisBudget\(/.test(R), 'debrisBudget 이 없다');
  const b = R.slice(R.indexOf('function debrisBudget('), R.indexOf('function debrisBudget(') + 600);
  assert.ok(/qualityStep/.test(b), '품질 단계(qualityStep)를 안 본다 — §G-45 사다리와 무관해진다');
  assert.ok(/prefersReducedMotion3D\(\)/.test(b), 'reduced-motion 을 존중하지 않는다');
});

test('프레임당 방출 상한이 있다 — 적 60기 동시 피격에도 폭주하지 않는다', () => {
  assert.ok(/DEBRIS_PER_FRAME/.test(R), '프레임 예산 상수가 없다');
  //  ⚠️`_debFrameBudget = DEBRIS_PER_FRAME` 한 번만 세면 **선언문**에도 걸려, 프레임 초기화를
  //   통째로 지워도 통과한다(돌연변이 M3 로 실제 확인). 선언 + 초기화 = 최소 2회여야 한다.
  const assigns = (R.match(/_debFrameBudget\s*=\s*DEBRIS_PER_FRAME/g) || []).length;
  assert.ok(assigns >= 2,
    `_debFrameBudget 대입이 ${assigns}곳 — 선언만 있고 프레임 초기화가 없다. 예산이 한 번 소진되면 영영 안 돌아온다`);
  //  차감도 실제로 하는가 (예산을 세기만 하고 안 쓰면 무의미)
  assert.ok(/_debFrameBudget\s*-=/.test(R), '예산을 차감하지 않는다');
});

test('격파는 큐를 거친다 — 적이 사라진 뒤엔 좌표를 알 수 없기 때문', () => {
  assert.ok(/ctl\.killBurst\s*=/.test(R), 'killBurst 진입점이 없다');
  assert.ok(/KILL_Q_MAX/.test(R), '킬 큐 상한이 없다 — 3D 가 꺼져 있으면 무한히 쌓인다');
  //  main 이 중앙 킬 알림에서 부르는가
  const kill = M.slice(M.indexOf('function onEnemyKilled('), M.indexOf('function onEnemyKilled(') + 1200);
  assert.ok(/chase3d\.killBurst\(/.test(kill), 'onEnemyKilled 이 killBurst 를 부르지 않는다');
  assert.ok(/try\s*\{/.test(kill), '연출 호출이 try 로 감싸이지 않았다 — 실패가 킬 처리를 막는다');
});

test('⚠️전역 Math.random 을 쓰지 않는다 — 쓰면 전투 결과가 달라진다', () => {
  //  주석 속 언급은 제외하고 실제 호출만 센다.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const code = strip(R);
  const start = code.indexOf('function emitDebris(');
  const end = code.indexOf('function debrisBudget(') + 700;
  const region = code.slice(start, end);
  assert.ok(!/Math\.random\s*\(/.test(region), '파편 방출·예산 경로가 전역 Math.random 을 쓴다');
  //  killBurst 경로(main)도
  const killCode = strip(M).slice(M.indexOf('function onEnemyKilled('), M.indexOf('function onEnemyKilled(') + 1200);
  assert.ok(!/Math\.random\s*\(/.test(killCode), '격파 연출 경로가 전역 Math.random 을 쓴다');
});

test('색 쓰기 실패가 3D 전체를 끄지 않는다 — 국소 격리', () => {
  const i = R.indexOf('_debColored');
  assert.notEqual(i, -1, '_debColored 플래그가 없다');
  const region = R.slice(R.indexOf('debris.setColorAt'), R.indexOf('debris.setColorAt') + 300);
  assert.ok(/catch/.test(region), 'setColorAt 이 try/catch 로 감싸이지 않았다');
  assert.ok(/_debColored\s*=\s*false/.test(region), '실패 시 색만 포기하고 계속 가는 경로가 없다');
});

// ── §G-46 2차 — 이사 실기 지적 3건 ────────────────────────────────────────────────────

test('파편이 생체처럼 보인다 — 둥근 지오메트리 + 붉은 팔레트', () => {
  //  ⚠️1차는 상자(BoxGeometry) + 적 슬롯 색이었다. 슬롯 색은 **체력 틴트**라 만피면 (1,1,1) 흰색이고
  //   피격 순간엔 전 채널 같은 배수라 여전히 무채색 — 화면에서 흰 사각 조각으로 보였다(이사 실기).
  assert.ok(!/new THREE\.BoxGeometry\([^)]*\),\s*\n\s*new THREE\.MeshStandardMaterial\(\{ color: 0xe3e6ea/.test(R),
    '파편이 아직 세라믹 상자다');
  const dbg = R.slice(R.indexOf('const DEBRIS_MAX'), R.indexOf('const DEBRIS_MAX') + 700);
  assert.ok(/IcosahedronGeometry|SphereGeometry/.test(dbg), '파편 지오메트리가 둥글지 않다');
  assert.ok(/metalness:\s*0(\.0)?\b/.test(dbg), '금속기가 남아 있으면 장갑판 조각으로 읽힌다');
  assert.ok(/function bioDebrisColor\(/.test(R), '생체 파편 색 함수가 없다');
  //  슬롯 색을 다시 쓰지 않는지 — 회귀 방지
  assert.ok(!/o\.cr \* 0\.7/.test(R), '파편이 다시 적 슬롯 틴트를 쓴다(무채색이 된다)');
});

test('bioDebrisColor: 항상 붉다 — 적 채널이 가장 크다', async () => {
  //  런타임 함수라 직접 못 부른다 → 소스에서 계약만 고정한다.
  const f = R.slice(R.indexOf('function bioDebrisColor('), R.indexOf('function bioDebrisColor(') + 700);
  assert.ok(/out\[0\]/.test(f) && /out\[1\]/.test(f) && /out\[2\]/.test(f), 'rgb 3채널을 안 쓴다');
  //  적(0)에 0.8 이상 계수, 녹·청(1·2)은 0.4 미만 계수여야 붉게 보인다
  const r0 = f.match(/out\[0\]\s*=\s*\(([\d.]+)/);
  const g0 = f.match(/out\[1\]\s*=\s*\(([\d.]+)/);
  assert.ok(r0 && +r0[1] >= 0.8, `적 채널 기저가 ${r0 && r0[1]} — 너무 낮으면 회색이 된다`);
  assert.ok(g0 && +g0[1] <= 0.4, `녹 채널 기저가 ${g0 && g0[1]} — 높으면 흰색으로 간다`);
});

test('파편이 조각마다 다른 비율로 눌린다 — 구슬이 아니라 살점', () => {
  assert.ok(/ex:\s|ey:\s|ez:\s/.test(R), '조각별 축 비율(ex/ey/ez)이 없다');
  assert.ok(!/_sScl\.setScalar\(d\.s \*/.test(R), '아직 균일 배율이라 완벽한 구로 보인다');
});

test('피격 가능한 소품(크리스탈·보급선)도 파편을 낸다', () => {
  //  운석·기뢰는 적 경로(put3D)라 이미 되고, 이 둘은 소품 경로(putProp)다.
  const pp = M.slice(M.indexOf('function putProp('), M.indexOf('function putProp(') + 900);
  assert.ok(/consumeHitSpark\(e\)/.test(pp), 'putProp 이 상승 에지를 안 본다 — 소품은 파편이 안 나온다');
  assert.ok(/o\.hp\s*=/.test(pp), '소품 슬롯에 체력 비율이 안 들어간다');
  //  사전 할당에도 자리가 있어야 히든클래스가 안 바뀐다(G39R1-SEAM-NO-ALLOC 과 같은 계약)
  const alloc = M.slice(M.indexOf('props: Object.fromEntries'), M.indexOf('props: Object.fromEntries') + 400);
  assert.ok(/spark:\s*0/.test(alloc) && /hp:\s*1/.test(alloc), '소품 슬롯 사전 할당에 spark/hp 가 없다');
});

test('⚠️제트가 선체에서 높이를 뽑는다 — 보정식이 아니다', () => {
  //  이사 실기: "분사구와 전혀 다른 엉뚱한 위치에서 로켓추진 효과가 나타난다".
  //  원인은 y 를 모델과 무관한 카메라 기울기 보정식으로만 잡은 것(§G-43).
  assert.ok(!/JET_PITCH_COMP/.test(R), '카메라 보정식이 아직 남아 있다 — 선체와 어긋난다');
  assert.ok(!/JET_Y_BASE/.test(R), '고정 높이 상수가 아직 남아 있다');
  //  ⚠️슬라이스 창을 넉넉히 잡는다 — 주석이 길어 2000자로는 실제 `_sPos.set` 줄에 못 닿아
  //   코드가 맞는데도 실패했다(1차 작성 시 실제 발생).
  const pjStart = R.indexOf('function placeJets(');
  const pj = R.slice(pjStart, R.indexOf('function ', pjStart + 10) > 0 ? R.indexOf('jetShell.setMatrixAt') + 200 : pjStart + 4000);
  assert.ok(/box\.min\.y/.test(pj) && /box\.max\.y/.test(pj), '제트 높이가 모델 박스에서 오지 않는다');
  //  포탑과 같은 방식인가 — x 보정 계수가 같아야 좌우 정렬이 맞는다
  assert.ok(/p\[0\] \* sx \* S \* 0\.88/.test(pj), '제트 x 가 포탑(0.88)과 다른 기준을 쓴다');
});
