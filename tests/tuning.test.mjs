import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAL } from '../js/balance.js';
import { SPRITE_SIZES } from '../js/sprites.js';
import { GROUPS, coreCount, coreKeySet } from '../js/tuner-spec.js';
import { flatten, getPath, setPath, applyFlat, pruneToChanged, emptyPatch } from '../js/tuning.js';

// 밸런스 튜너(tuner.html) — 오버라이드 엔진과 항목표 검증.
// 핵심 안전 요건: 오타 경로로 조용히 새 키를 만들지 않을 것, 원본 대비 변경분만 저장할 것.

const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const sprSrc = readFileSync(new URL('../js/sprites.js', import.meta.url), 'utf8');

test('TU-01: 평면화는 숫자·숫자배열만 대상으로 한다', () => {
  const f = flatten({ a: 1, b: { c: 2 }, arr: [1, 2], txt: '글자', mixed: [1, '글자'], col: '#fff' });
  assert.deepEqual(Object.keys(f).sort(), ['a', 'arr', 'b.c']);
  assert.deepEqual(f.arr, [1, 2]);
});

test('TU-02: 존재하지 않는 경로에는 쓰지 않는다 (오타로 새 키가 생기면 안 된다)', () => {
  const o = { w: { coef: 1 } };
  assert.equal(setPath(o, 'w.오타', 5), false);
  assert.equal('오타' in o.w, false, '새 키가 생기면 조용히 무시되는 설정이 된다');
  assert.equal(setPath(o, '없는.가지.끝', 5), false);
  assert.equal(setPath(o, 'w.coef', 2), true);
  assert.equal(o.w.coef, 2);
});

test('TU-03: 타입이 맞아야 쓴다 (숫자↔배열 혼동 차단)', () => {
  const o = { n: 1, arr: [1, 2, 3] };
  assert.equal(setPath(o, 'n', '문자'), false);
  assert.equal(setPath(o, 'n', NaN), false);
  assert.equal(setPath(o, 'n', Infinity), false);
  assert.equal(setPath(o, 'arr', 5), false);
  assert.equal(setPath(o, 'arr', [9, 9, 9]), true);
  assert.deepEqual(o.arr, [9, 9, 9]);
  assert.equal(o.n, 1, '실패한 쓰기는 값을 안 바꾼다');
});

test('TU-04: 배열은 복사해서 저장한다 (원본과 참조 공유 금지)', () => {
  const o = { arr: [1, 2] };
  const src = [7, 8];
  setPath(o, 'arr', src);
  src[0] = 99;
  assert.equal(o.arr[0], 7, '패치 배열을 나중에 고쳐도 적용된 값이 바뀌면 안 된다');
});

test('TU-05: 적용 결과가 성공·실패를 구분해 보고한다', () => {
  const o = { a: 1, b: 2 };
  const r = applyFlat(o, { a: 10, 'x.y': 3 });
  assert.equal(r.applied, 1);
  assert.deepEqual(r.skipped, ['x.y']);
  assert.equal(o.a, 10);
});

test('TU-06: 원본과 같은 값은 저장하지 않는다 (기본값이 바뀌면 자동으로 따라간다)', () => {
  const base = { a: 1, arr: [1, 2] };
  const pruned = pruneToChanged({ a: 1, arr: [1, 2] }, base);
  assert.deepEqual(pruned, {}, '변경이 없으면 빈 패치');
  const pruned2 = pruneToChanged({ a: 5, arr: [1, 3] }, base);
  assert.deepEqual(pruned2, { a: 5, arr: [1, 3] });
});

test('TU-07: 핵심 항목표의 모든 경로가 실제로 존재하고 조정 가능한 타입이다', () => {
  const src = { bal: BAL, sprite: SPRITE_SIZES };
  const bad = [];
  for (const g of GROUPS) {
    for (const it of g.items) {
      const v = getPath(src[it.ns], it.path);
      if (v === undefined) bad.push(`${it.ns}:${it.path} (${it.name}) — 경로 없음`);
      else if (typeof v !== 'number' && !Array.isArray(v)) bad.push(`${it.ns}:${it.path} — 타입 ${typeof v}`);
      if (it.min !== undefined && !(it.min < it.max)) bad.push(`${it.ns}:${it.path} — 범위 뒤집힘`);
    }
  }
  assert.deepEqual(bad, [], '항목표가 실제 밸런스 구조와 어긋나면 튜너에서 조용히 안 먹는다');
  assert.ok(coreCount() >= 60, `핵심 항목 ${coreCount()}개`);
  assert.equal(coreKeySet().size, coreCount(), '경로 중복 없음');
});

test('TU-08: 이사가 요청한 항목이 핵심에 모두 들어 있다', () => {
  const keys = coreKeySet();
  const must = [
    ['sprite:A6', '기함 크기'],
    ['bal:weapons.vulcan.coef', '무기 DPS'],
    ['bal:weapons.laser.coef', '무기 DPS'],
    ['bal:weapons.homing.coef', '무기 DPS'],
    ['bal:squad.escortShare', '드론 발사체 비중'],
    ['bal:squad.fireRate', '드론 발사 속도'],
    ['sprite:B1', '적 크기'],
    ['bal:creature.small', '적 체력'],
    ['bal:spawn.enemyMult', '등장 빈도'],
    ['bal:boss.hp', '보스 체력'],
  ];
  for (const [k, why] of must) assert.ok(keys.has(k), `${why}(${k})가 핵심 항목에 없다`);
});

test('TU-09: 게임이 부팅 시 오버라이드를 적용하고 실시간 구독한다', () => {
  assert.ok(mainSrc.includes("from './tuning.js'"), '튜닝 모듈 import');
  assert.ok(mainSrc.includes('applyFlat(BAL, patch.bal)'), '밸런스 적용');
  assert.ok(mainSrc.includes('applyFlat(SPRITE_SIZES, patch.sprite)'), '크기 적용');
  assert.ok(mainSrc.includes('subscribePatch('), '다른 탭 저장 감지 → 새로고침 없이 반영');
  assert.ok(mainSrc.includes('invalidateSpriteCache(); preloadStyle();'), '크기 변경 시 그림 다시 로드');
  // 적용은 preloadStyle 전에 일어나야 첫 로드부터 새 크기로 그려진다
  assert.ok(mainSrc.indexOf('const _tuning = applyTuning(loadPatch())') < mainSrc.lastIndexOf('preloadStyle();'),
    '부팅 적용이 최초 스프라이트 로드보다 먼저');
  assert.ok(sprSrc.includes('export function invalidateSpriteCache'), '캐시 무효화 함수');
});

test('TU-10: 빈 패치는 아무것도 바꾸지 않는다 (튜너를 안 써도 게임은 원본 그대로)', () => {
  const snapshot = JSON.stringify({ b: BAL.weapons, s: SPRITE_SIZES.A1 });
  const p = emptyPatch();
  applyFlat(BAL, p.bal);
  applyFlat(SPRITE_SIZES, p.sprite);
  assert.equal(JSON.stringify({ b: BAL.weapons, s: SPRITE_SIZES.A1 }), snapshot);
});

test('TU-11: 드론 발사 지분이 값으로 분리돼 조정 가능하다', () => {
  const entSrc = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
  assert.equal(typeof BAL.squad.escortShare, 'number');
  assert.ok(entSrc.includes('BAL.squad.escortShare + dEff.escortShareBonus'), '코드에 박힌 0.3을 값으로 뺐다');
  assert.ok(!/this\.count > 1 \? 0\.3 \+/.test(entSrc), '옛 하드코딩이 남아 있으면 안 된다');
});

// ── 썸네일 (이사: 이름만으론 어느 적인지 매칭이 안 된다) ──────────
import { artFor } from '../js/tuner-spec.js';

test('TU-12: 적 관련 밸런스 경로에 썸네일이 매칭된다', () => {
  const must = [
    ['creature.small', 'B1'], ['creature.mid', 'B2'], ['creature.large', 'B3'],
    ['creature.radius.small', 'B1'], ['creature.radius.large', 'B3'],
    ['sniper.hp', 'B4'], ['turret.hp', 'B5'], ['weaver.hp', 'B6'],
    ['newEnemies.bomber.hp', 'B16'], ['newEnemies.zapper.hp', 'B17'],
    ['newEnemies.orbiter.hp', 'B18'], ['newEnemies.shielder.hp', 'B19'],
    ['newEnemies.carrier.hp', 'B20'], ['newEnemies.blinker.hp', 'B21'],
    ['boss.hp', 'B8'], ['midboss.hpMin', 'B8'], ['neonArbiter.staggerMax', 'B22'],
    ['pod.large.reward', 'C5'], ['weapons.homing.coef', 'PROJ_HOMING_BASE'],
  ];
  for (const [path, art] of must) {
    assert.equal(artFor('bal', path), art, `${path} 의 썸네일이 ${art} 여야 한다`);
  }
});

test('TU-13: 그림 파일이 없는 적은 코드 렌더로 표시한다', () => {
  // 돌진병·기뢰·잔해는 스프라이트가 없어 게임의 draw()를 그대로 호출한다
  for (const p of ['charger.hp', 'mine.hp', 'debris.rBig']) {
    const a = artFor('bal', p);
    assert.ok(a && a.startsWith('VEC:'), `${p} 는 코드 렌더 대상이어야 한다 (지금 ${a})`);
  }
  const tunerSrc = readFileSync(new URL('../js/tuner.js', import.meta.url), 'utf8');
  assert.ok(tunerSrc.includes('const VECTOR_THUMB'), '코드 렌더 표');
  assert.ok(tunerSrc.includes("import { Charger, Mine, Debris } from './entities.js'"), '실제 게임 클래스 사용');
  assert.ok(tunerSrc.includes('e.draw(g)'), '게임의 draw()를 그대로 호출 — 그림이 바뀌면 썸네일도 따라간다');
});

test('TU-14: 크기 항목은 그 스프라이트 자신을 보여준다', () => {
  assert.equal(artFor('sprite', 'B1'), 'B1');
  assert.equal(artFor('sprite', 'A6'), 'A6');
});

test('TU-15: 추상 수치에는 억지로 그림을 붙이지 않는다', () => {
  // 난이도 배수·타임라인 같은 값에 엉뚱한 그림이 붙으면 오히려 헷갈린다
  for (const p of ['difficulty.globalMult', 'gate1.timeline.bossStart', 'nodeReward.eliteDraftCount']) {
    assert.equal(artFor('bal', p), null, `${p} 에는 썸네일이 없어야 한다`);
  }
});
