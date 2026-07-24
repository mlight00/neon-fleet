// 난이도 곡선: 무기 강화(레벨·진화·초진화)가 적 체력에 반영되는지 검증.
// 배경 — 무기를 키우면 실DPS가 몇 배가 되는데 적 체력은 드론수·격납고만 따라와, 후반에 플레이어가 적을 압도한다는
// 피드백(이사). Squad.weaponPowerMult()가 그 성장 배수를 돌려주고 main.js가 적 체력(pf)에 곱한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BAL } from '../js/balance.js';
import { Squad } from '../js/entities.js';

const mainSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../js/main.js'), 'utf8');

function freshSquad() { return new Squad(480, 776, 100); }

test('DC-01: 시작(Lv1·미진화)은 정확히 1.0 — 초반 난이도 불변', () => {
  const s = freshSquad();
  assert.equal(s.weaponPowerMult(), 1, '시작 무기 배수는 1이어야 초반이 그대로다');
});

test('DC-02: 무기 레벨을 올리면 배수가 커진다', () => {
  const s = freshSquad();
  const lv1 = s.weaponPowerMult();
  s.weaponLv = BAL.weapons.maxLv;
  assert.ok(s.weaponPowerMult() > lv1, '레벨↑ → 배수↑');
  assert.ok(Math.abs(s.weaponPowerMult() - BAL.weapons.lvCoef[BAL.weapons.maxLv - 1] / BAL.weapons.lvCoef[0]) < 1e-9, 'lvCoef 비율과 일치');
});

test('DC-03: 진화 → 초진화로 갈수록 단조 증가', () => {
  const s = freshSquad();
  s.weaponLv = BAL.weapons.maxLv;
  const base = s.weaponPowerMult();
  s.weaponEvolutions[s.weapon] = 'vulcan_storm'; s.evoLevels[s.weapon] = 1;
  const evo1 = s.weaponPowerMult();
  s.evoLevels[s.weapon] = 3;
  const evo3 = s.weaponPowerMult();
  s.weaponEvolutions2[s.weapon] = 'vulcan_tempest'; s.superLevels[s.weapon] = 1;
  const sup1 = s.weaponPowerMult();
  s.superLevels[s.weapon] = 3;
  const sup3 = s.weaponPowerMult();
  assert.ok(evo1 > base, '진화 > 미진화');
  assert.ok(evo3 > evo1, '진화강화 > 진화');
  assert.ok(sup1 > evo3, '초진화 > 진화');
  assert.ok(sup3 > sup1, '초진화강화 > 초진화');
  // 진화하면 실효 보정(evoEffectiveMult)만큼은 최소 뛴다
  assert.ok(evo1 >= base * BAL.weaponEvolution.evoEffectiveMult - 1e-9, '진화 실효 보정 반영');
});

test('DC-04: 난이도 곡선 knob이 존재하고 초반 중립(=시작 1.0 보장)', () => {
  assert.equal(typeof BAL.economy.weaponHpWeight, 'number', 'weaponHpWeight 존재');
  assert.ok(BAL.economy.weaponHpWeight >= 0, '음수 아님');
  assert.ok(BAL.weaponEvolution.evoEffectiveMult >= 1, '진화 보정 ≥1');
  assert.ok(BAL.weaponEvolution.superEffectiveMult >= 1, '초진화 보정 ≥1');
});

test('DC-05: main.js가 무기 배수를 적 체력에 곱한다(상한 바깥)', () => {
  // pf = (1 + min(cap, ...)) * weaponPf → 캡은 드론화력에만, 무기 배수는 캡 밖에서 곱해 실DPS를 따라간다
  assert.ok(mainSrc.includes('r.squad.weaponPowerMult()'), '무기 배수 호출');
  assert.ok(mainSrc.includes('BAL.economy.weaponHpWeight'), '가중치 적용');
  assert.ok(/\)\) \* weaponPf/.test(mainSrc), 'pf가 weaponPf로 곱해진다(상한 바깥)');
  // 중간보스·엔드리스 보스도 동일 추종 (캠페인 섹터 보스는 실측 avgDps라 제외)
  assert.ok(mainSrc.includes('r.maxPower * weaponPf'), '중간보스 추종');
  assert.ok(/effectiveFirepower\(r\.maxPower[^)]*\) \* weaponPf/.test(mainSrc), '엔드리스 보스 추종');
});
