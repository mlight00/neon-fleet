import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateSectorMap } from '../js/logic.js';
import { affixChanceForSector, rollAffixes } from '../js/affixes.js';

// 섹터 원정 "무기 조합(공명)" 해금 경로 회귀 방지.
// 사건: POW(무기 강화 배지)를 정예 '변이몹'에만 붙였는데 변이 확률이 섹터 1에서 0%라
//       무기 조합이 영영 열리지 않았다(이사 지적: "무기 조합은 언제 나오는거야?").
// 고정: ① 미니보스가 POW를 확정 드롭  ② 보조 무기가 없으면 전투/보급 노드에도 미니보스 확정 배치.

const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

test('SC-01: 섹터 1은 정예 변이 확률이 0 — 변이몹만으론 POW가 절대 안 나온다(사건의 전제)', () => {
  assert.equal(affixChanceForSector(1), 0, '섹터 1 변이 확률은 설계상 0');
  let s = 987654321;
  const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let elites = 0;
  for (let i = 0; i < 5000; i++) if (rollAffixes('creature', 1, rng).includes('elite')) elites++;
  assert.equal(elites, 0, '섹터 1에서 정예 변이몹은 한 마리도 안 나온다');
});

test('SC-02: 정예 노드는 경로에 없을 수 있다 — 미니보스를 노드 타입에만 의존하면 안 된다', () => {
  let s = 24680;
  const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let withElite = 0;
  const RUNS = 2000;
  for (let i = 0; i < RUNS; i++) {
    const map = generateSectorMap(1, rng);
    const cols = map.cols || map;
    let node = cols[0][0], found = false;
    while (node?.next?.length) {
      const nxt = cols[node.col + 1];
      node = nxt[node.next[Math.floor(rng() * node.next.length)]] || nxt[0];
      if (node.type === 'elite') found = true;
    }
    if (found) withElite++;
  }
  const rate = withElite / RUNS;
  assert.ok(rate < 0.75, `정예 노드가 경로에 있을 확률이 ${(rate * 100).toFixed(0)}% — 보장 수단이 아니다`);
});

test('SC-03: 미니보스 처치가 POW를 확정 드롭한다', () => {
  const line = mainSrc.split('\n').find((l) => l.includes('new Pow(e.x, e.y)'));
  assert.ok(line, 'POW 드롭 지점이 존재');
  assert.ok(line.includes('e instanceof MidBoss'), '미니보스가 POW 드롭 대상');
  assert.ok(line.includes("includes('elite')"), '정예 변이몹도 보너스로 유지');
  assert.ok(line.includes('!run.campaign25') && line.includes('!run.coreLoop'), '25분·coreLoop은 자체 강화라 제외');
});

test('SC-04: 보조 무기가 없으면 전투·보급 노드에도 미니보스가 확정 배치된다', () => {
  assert.ok(/const needWing = .*r\.squad\.reson.*!r\.squad\.wing\?\.weaponId/.test(mainSrc), '보조 무기 미장착 판정');
  const guard = mainSrc.split('\n').find((l) => l.includes("node.type === 'elite' || (needWing"));
  assert.ok(guard, '미니보스 배치 조건에 needWing 분기');
  assert.ok(guard.includes("node.type === 'combat'") && guard.includes("node.type === 'supply'"), '전투·보급 노드 포함');
  assert.ok(mainSrc.includes("pending.push({ type: 'midboss'"), '미니보스가 스폰 목록에 들어간다');
});

test('SC-05: POW 수집 → 보조 무기 선택지가 붙은 무기 강화 카드가 열린다', () => {
  assert.ok(mainSrc.includes('onPowCollect() { sectorWeaponUpgrade(); }'), 'POW 수집 → 무기 강화 카드');
  const fn = mainSrc.slice(mainSrc.indexOf('function sectorWeaponUpgrade'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.ok(body.includes('!sq.wing.weaponId'), '보조 무기 미장착이면');
  assert.ok(body.includes('resonSetLoadout(sq.reson'), '보조 무기 선택 시 공명(무기 조합) 활성');
});
