import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAL } from '../js/balance.js';
import { cruisersNeededForTier } from '../js/logic.js';
import { RESONANCES } from '../js/resonances.js';

// 2026-07-22 이사 피드백 5건 회귀 방지.

const cssSrc = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const entSrc = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
const renderSrc = readFileSync(new URL('../js/render.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const bossSrc = readFileSync(new URL('../js/bosses.js', import.meta.url), 'utf8');

test('FB-01: 타이틀 워드마크 가운데 정렬', () => {
  const block = cssSrc.slice(cssSrc.indexOf('#overlay .title-words'));
  const decl = block.slice(0, block.indexOf('}'));
  assert.ok(decl.includes('align-items:center'), '세로축 가운데');
  assert.ok(decl.includes('text-align:center'), '글자 가운데');
});

test('FB-02: 레이저 스프라이트 굵기가 beamW를 따른다 (커터 초진화가 얇아지지 않게)', () => {
  assert.ok(entSrc.includes('const wantW = this.beamW * 2'), 'beamW 기준 목표 폭');
  assert.ok(/if \(artW > 0 && artW < wantW\) ctx\.scale\(wantW \/ artW, 1\)/.test(entSrc), '좁으면 가로만 확대');
  assert.ok(entSrc.includes('if (this.cutter) {'), '절단탄 전용 백열 심');
  // 아트 자체가 얇은 게 사건의 원인이었다 — 커터 아트는 기본 아트보다 좁다는 사실을 고정
  const cutterW = 39 / 320, baseW = 131 / 320;
  assert.ok(cutterW < baseW / 2, '커터 발사체 원본이 기본보다 절반 이상 얇다(그래서 보정이 필요)');
});

test('FB-03: 커터 굵은탄 배수가 실제로 반영될 여지가 있다', () => {
  const c = BAL.weaponEvolution.laser_cutter;
  assert.ok(c.widthMult > 1.5, '굵은 절단탄 배수');
  assert.ok(c.every >= 2, '주기적으로만 발사');
});

test('FB-04: 공명 HUD가 내부 용어 대신 상태 + 행동 안내를 보여준다', () => {
  for (const r of Object.values(RESONANCES)) {
    assert.ok(r.hint && r.hint.length > 5, `${r.id}에 플레이어용 안내문(hint)`);
  }
  assert.ok(!renderSrc.includes("'공명 예고: '"), '의미 없는 "공명 예고" 문구 제거');
  assert.ok(renderSrc.includes("'표적 지정됨'") && renderSrc.includes("'표적 대기'"), '표식형은 표적 상태로 표기');
  assert.ok(renderSrc.includes('d.resonanceHint'), '안내문 렌더');
  assert.ok(mainSrc.includes('resonanceHint: sq.reson?.activeId'), '섹터 HUD 배선');
  assert.equal(RESONANCES.seekerBeam.trigger, 'mark', '시커 빔은 충전형이 아니라 표식형');
});

test('FB-05: 섹터 클리어 컷신 — 보스가 침몰하고 시네마 띠가 뜬다', () => {
  const BD = BAL.bossDeath;
  assert.ok(BD.sectorDuration > BD.duration, '섹터 보스는 더 길게');
  assert.ok(BD.sinkDrift > 0 && BD.sinkRoll > 0 && BD.letterbox > 0, '침몰·기울기·시네마 띠 설정');
  assert.ok(bossSrc.includes('blit(ctx, gem, 0, 0, this.drawScale || 1)'), '격침 중에도 실제 보스 아트를 그린다');
  assert.ok(bossSrc.includes('this.sinkRoll'), '기울어짐 적용');
  assert.ok(mainSrc.includes('b.y += BD.sinkDrift * dt'), '아래로 가라앉음');
  assert.ok(mainSrc.includes('r.cinemaT'), '시네마 띠 진행값');
  assert.ok(mainSrc.includes('`섹터 ${r.sector} 돌파`'), '섹터 돌파 배너');
  assert.ok(mainSrc.includes('r.cinemaT = 0;'), '노드마다 초기화');
});

test('FB-06b: 기함 등급 이름 = 세계관(빛의 단계) 영문 함급명, 특성 태그와 1:1', () => {
  const names = BAL.evolution.names, traits = BAL.shipTraits;
  assert.deepEqual(names, ['EMBER', 'FLARE', 'ARCLIGHT', 'AURORA', 'ZENITH', 'QUASAR']);
  assert.equal(traits.length, names.length, '이름과 특성 개수 일치');
  names.forEach((n, i) => assert.ok(traits[i].tag.startsWith(n + ' ·'), `T${i} 태그가 '${n}'로 시작`));
  // 옛 이름(전투기 등급·위계 역전 / '-광' 돌림)이 플레이어에게 다시 노출되면 안 된다
  for (const old of ['스카우트', '인터셉터', '스트라이커', '캐리어', '드레드노트', '타이탄', '잔광', '섬광', '집광', '극광', '백야', '초신성']) {
    assert.ok(!names.includes(old), `옛 이름 ${old} 잔존`);
    assert.ok(!traits.some((t) => t.tag.includes(old)), `옛 이름 ${old}가 특성 태그에 잔존`);
  }
  // 기존 세계관 고유명사(보스·구역·무기 진화)와 겹치면 플레이어가 혼동한다
  const taken = ['NOVA', 'PRISM', 'REAPER', 'STORM', 'LANCE', 'ARBITER', 'SERAPH', 'VORTEX', 'TIDAL', 'OPTIC', 'CROWN', 'CORE', 'LUMEN', 'CHORUS', 'WAKE', 'ARMADA', 'VEIL', 'FURNACE'];
  for (const n of names) assert.ok(!taken.includes(n), `${n}은 이미 다른 곳에서 쓰는 이름`);
});

test('FB-06: 초기 기함 승급이 빨라지고 후반은 유지된다', () => {
  const E = BAL.escort;
  assert.ok(Array.isArray(E.cruisersPerFlagshipByTier), '등급별 비용표');
  assert.equal(cruisersNeededForTier(0, E), 4, 'T0→T1은 4척');
  assert.ok(cruisersNeededForTier(0, E) < cruisersNeededForTier(2, E), '초반이 후반보다 싸다');
  assert.equal(cruisersNeededForTier(3, E), E.cruisersPerFlagship, '후반은 기존과 동일');
  assert.equal(cruisersNeededForTier(99, E), E.cruisersPerFlagship, '표 밖은 기본값 폴백');
  assert.equal(cruisersNeededForTier(0, { cruisersPerFlagship: 9 }), 9, '표가 없으면 기본값');
  assert.ok(entSrc.includes('cruisersNeededForTier(this.tier, E)'), '승급 판정 배선');
  assert.ok(mainSrc.includes('cruisersNeededForTier(r.squad.tier, BAL.escort)'), 'HUD 게이지도 같은 값');
});

// ── 2026-07-22 (2) 경제·난이도 조정 ────────────────────────────────
import { nodeCoinReward, generateSectorMap as genMap } from '../js/logic.js';

test('FB-07: 격납고 적립 코인이 절반 — 모든 코인 경로가 한 지점을 지난다', () => {
  assert.equal(BAL.economy.coinBankMult, 0.5, '적립 배수 0.5');
  // 정산 두 곳(사망·완주) 모두 배수를 적용해야 한다 — 한쪽만 하면 완주 보상만 후해진다
  assert.equal((mainSrc.match(/\* BAL\.economy\.coinBankMult\)/g) || []).length, 2,
    'endExpedition·winCampaign 양쪽 적용');
  // 인게임 소비(정비 모듈 구매)는 world.coins를 그대로 쓰므로 영향 없어야 한다
  assert.ok(mainSrc.includes('r.world.addCoins(-cost);'), '소비는 배수와 무관');
});

test('FB-08: 노드 코인 자체는 그대로 — 줄어드는 건 적립 단계뿐', () => {
  // 인게임 정비 비용과의 균형이 깨지지 않도록 노드 보상 공식은 손대지 않았다
  const NR = BAL.nodeReward.coinMult;
  assert.equal(nodeCoinReward(1, 0, 'combat', NR), 50);
  assert.equal(nodeCoinReward(5, 5, 'boss', NR), Math.round((40 + 50 + 25) * 2.5));
});

test('FB-09: 보조 무기용 미니보스는 첫 노드에 안 나온다', () => {
  assert.equal(BAL.midboss.wingUnlockMinCol, 2, '3번째 노드부터');
  assert.ok(mainSrc.includes('node.col >= BAL.midboss.wingUnlockMinCol'), '열 게이트 배선');
  assert.ok(mainSrc.includes("node.type === 'hazard'"), 'hazard도 포함 — 경로에서 완전히 놓치는 것 방지');
});

test('FB-10: 그래도 대부분의 경로에서 미니보스를 만난다 (해금이 막히면 안 된다)', () => {
  let s = 4242;
  const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const OK = new Set(['combat', 'supply', 'hazard']);
  let miss = 0;
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const map = genMap(1, rng); const cols = map.cols || map;
    let node = cols[0][0], found = false;
    while (node?.next?.length) {
      const nx = cols[node.col + 1];
      node = nx[node.next[Math.floor(rng() * node.next.length)]] || nx[0];
      if (node.type === 'elite' || (node.col >= BAL.midboss.wingUnlockMinCol && OK.has(node.type))) found = true;
    }
    if (!found) miss++;
  }
  assert.ok(miss / N < 0.05, `미니보스를 못 만나는 경로 ${(miss / N * 100).toFixed(1)}% — 5% 미만이어야 한다`);
});

// ── 2026-07-22 (3) 크리스탈 vs 수송선 리스크-보상 순서 ──────────────
import { Crystal } from '../js/entities.js';
import { CHUNKS } from '../js/chunks.js';
import { droneReward } from '../js/adaptive-logic.js';

const podPayout = (raw) => droneReward(raw, 1, BAL.economy.droneGainMult, 1);
const CONTACT_WORLD = { squad: { reson: {} } };   // 접촉 자동 수집 모드
const SHOOT_WORLD = { squad: {} };                // 구 모델(쏴서 파괴)

test('FB-11: 접촉 수집 크리스탈은 부숴야 하는 수송선보다 보상이 작다', () => {
  // 사건: 크리스탈이 원래 '쏴서 부수는' 개체라 보상값(최대 300)이 그 전제였는데
  //       접촉 자동 수집으로 바꾸며 무위험이 됐다 → 공짜 +66 > 대형 수송선 +19 역전.
  const allValues = CHUNKS.flatMap((c) => c.items.filter((i) => i.type === 'crystal').map((i) => i.value));
  assert.ok(allValues.length > 10, '청크에서 크리스탈 값을 읽었다');
  const maxCrystal = Math.max(...allValues.map((v) => new Crystal(0, 0, v, CONTACT_WORLD).payout));
  const large = podPayout(BAL.pod.large.reward);
  assert.ok(maxCrystal < large,
    `가장 큰 크리스탈 +${maxCrystal} 이 대형 수송선 +${large} 보다 작아야 한다 (무위험 < 리스크)`);
});

test('FB-12: 배수는 접촉 수집 모드에만 걸린다 (쏴서 부수는 구 모델은 원래 값)', () => {
  const v = 300;
  const shot = new Crystal(0, 0, v, SHOOT_WORLD).payout;
  const contact = new Crystal(0, 0, v, CONTACT_WORLD).payout;
  assert.ok(contact < shot, '접촉 수집이 더 적다');
  assert.equal(shot, podPayout(v), '구 모델은 배수 없이 원래 보상');
  assert.equal(BAL.economy.crystalContactMult, 0.25);
});

test('FB-13: 크기는 여전히 지급 숫자에 비례한다 (작은 보상 = 작은 크리스탈)', () => {
  const small = new Crystal(0, 0, 10, CONTACT_WORLD);
  const big = new Crystal(0, 0, 300, CONTACT_WORLD);
  assert.ok(big.payout > small.payout && big.r > small.r, '보상이 크면 크리스탈도 크다');
});

test('FB-14: 섹터별 보스 HP 배수표 — 지정한 섹터에만 걸린다', () => {
  const T = BAL.boss.sectorHpMult;
  assert.ok(T && typeof T === 'object', '섹터별 배수표 존재');
  assert.equal(T[1], 2, '섹터 1 보스 2배(이사 요청)');
  // 표에 없는 섹터는 손대지 않는다 — 기본 곡선(1+(섹터-1)×0.22)만 적용돼야 한다
  for (const s of [2, 3, 4, 5, 6]) {
    assert.equal(T[s] ?? 1, 1, `섹터 ${s}는 배수 없음`);
  }
  assert.ok(mainSrc.includes('BAL.boss.sectorHpMult?.[r.sector] ?? 1'), '없으면 1로 폴백');
  assert.ok(/sectorBossScale \* sectorHpMult\)/.test(mainSrc), 'HP 계산에 곱해진다');
});

import { effectiveFirepower } from '../js/logic.js';

test('FB-15: 보스 HP가 격납고 영구 강화를 반영한다', () => {
  const base = BAL.squad;
  const plain = { damage: base.damage, fireRate: base.fireRate };
  const upgraded = { damage: base.damage + 6 * BAL.hangar.upgrades.dmg.step,
                     fireRate: base.fireRate + 6 * BAL.hangar.upgrades.rate.step };
  assert.equal(effectiveFirepower(200, plain, base, 1), 200, '강화 0이면 화력 그대로');
  assert.ok(effectiveFirepower(200, upgraded, base, 1) > 200 * 2, '강화 6렙이면 2배 이상');
  assert.equal(effectiveFirepower(200, upgraded, base, 0), 200, 'weight 0 = 옛 동작');
  // 강화는 DPS를 곱으로 올리므로 HP도 같은 비율로 따라와야 처치 시간이 유지된다
  const gain = (upgraded.damage / base.damage) * (upgraded.fireRate / base.fireRate);
  assert.ok(Math.abs(effectiveFirepower(200, upgraded, base, 1) - 200 * gain) < 0.001, '배수가 정확히 곱해진다');
  assert.equal(BAL.boss.hangarWeight, 1, '현재 완전 반영');
  assert.ok(mainSrc.includes('effectiveFirepower(r.maxPower, r.world.stats, BAL.squad, BAL.boss.hangarWeight)'), '보스 스폰 배선');
  assert.ok(!/r\.maxPower \* BAL\.boss\.hpPer/.test(mainSrc), '옛 계산(원시 화력)이 남아 있으면 안 된다');
});
