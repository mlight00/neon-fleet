import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAL } from '../js/balance.js';
import { campaignBossId } from '../js/logic.js';
import { MidBoss, Squad } from '../js/entities.js';
import { createSurvivability, hullFrac } from '../js/survivability.js';
import { createResonanceState } from '../js/resonances.js';

// 2026-07-21 이사 피드백 4건 회귀 방지: BGM 볼륨/재시작, 중간보스 정체, 타이틀 박스, 섹터 내구도·무기 슬롯.

const audioSrc = readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const uiSrc = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const cssSrc = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const renderSrc = readFileSync(new URL('../js/render.js', import.meta.url), 'utf8');

test('SP-01: BGM 마스터 트림 0.5 — 슬라이더 저장값과 무관하게 절반', () => {
  assert.ok(/const BGM_MASTER = 0\.5/.test(audioSrc), 'BGM_MASTER 상수');
  assert.ok(audioSrc.includes('settings.bgm * BGM_MASTER'), '실제 출력에 트림 적용');
  assert.equal((audioSrc.match(/settings\.bgm \* BGM_MASTER/g) || []).length, 2, '초기값·볼륨변경 두 경로 모두');
});

test('SP-02: 볼륨 최소 = 완전 무음 (지수 접근이 아니라 선형 램프)', () => {
  assert.ok(!/masterBgm\.gain\.setTargetAtTime/.test(audioSrc), 'setTargetAtTime은 0에 도달 못 함 — 쓰면 안 됨');
  assert.ok(audioSrc.includes('linearRampToValueAtTime(target'), '목표값에 정확히 안착하는 램프');
  assert.ok(/function rampTo\(param, target\)/.test(audioSrc), '공용 램프 헬퍼');
});

test('SP-03: 섹터 전환 시 배경음악 재시작', () => {
  assert.ok(/playBgm\(name, \{ fade = 1\.2, restart = false \}/.test(audioSrc), 'restart 옵션');
  assert.ok(audioSrc.includes('if (!restart && bgmSlot && bgmSlot.name === name) return'), 'restart면 같은 곡도 다시 시작');
  assert.ok(mainSrc.includes('r.bgmRestart = true'), 'startSector가 재시작 예약');
  assert.ok(mainSrc.includes("playBgm('title', { restart: !!r.bgmRestart })"), '맵 진입이 예약 소비');
  assert.ok(mainSrc.includes('r.bgmRestart = false'), '1회만 재시작(노드 복귀는 이어서)');
});

test('SP-04: 중간보스는 최종 보스(하이브 퀸)가 아니라 직전 섹터 보스', () => {
  const C = BAL.campaign;
  const midFor = (s) => new MidBoss(540, s, 300, campaignBossId(Math.max(1, s - 1), 'campaign', C.bosses, C.endlessBosses)).def.id;
  for (const s of [1, 2, 3, 4, 5, 6]) {
    assert.notEqual(midFor(s), 'B7', `섹터 ${s} 중간보스가 하이브 퀸이면 안 된다`);
  }
  assert.equal(midFor(1), 'B8', '섹터 1 = 리퍼 로드');
  assert.equal(midFor(3), 'B9', '섹터 3 = 직전 섹터(2) 보스');
  assert.equal(C.bosses[C.bosses.length - 1], 'B7', '하이브 퀸은 최종 보스 자리 유지');
  assert.ok(mainSrc.includes('new MidBoss(LOGICAL_W, contentTier, r.maxPower, midId)'), '스폰이 bossId 전달');
});

test('SP-05: 타이틀 로고 배경 박스 제거 — 통짜 이미지 대신 엠블럼 + 텍스트', () => {
  assert.ok(!uiSrc.includes('title_lockup.webp'), '박스가 구워진 통짜 이미지 미사용');
  assert.ok(uiSrc.includes('branding/emblem.webp'), '엠블럼만 이미지');
  assert.ok(uiSrc.includes('tw-neon') && uiSrc.includes('tw-fleet'), '워드마크는 텍스트');
  assert.ok(cssSrc.includes('#overlay .title-mark'), '타이틀 마크 스타일');
  assert.ok(!/\.title-mark[^}]*background(?!-clip)/.test(cssSrc), '마크에 배경 박스 없음');
});

test('SP-06: 섹터 원정도 기함 내구도 모델을 설치한다', () => {
  assert.ok(/squad\.installGate1\(\{ surv: createSurvivability/.test(mainSrc), '섹터 출격 시 surv 설치');
  assert.ok(mainSrc.includes('onFlagshipTierUp(sq)'), '기함 등급 상승 훅');
  assert.ok(mainSrc.includes('sq.surv.hull = sq.surv.hullMax'), '승급 시 내구도 완충');

  // 실제 동작: 설치 후 피격이 드론이 아니라 내구도로 간다
  const sq = new Squad(540, 960, 10);
  sq.installGate1({ surv: createSurvivability(BAL.gate1.survivability), reson: createResonanceState(), mainWeapon: 'vulcan' });
  const drones = sq.count, hull0 = sq.surv.hull;
  sq.takeShot({ squad: sq, effects: { burst() {}, ring() {}, flash() {}, text() {} }, metrics: null },
    { legacyDmg: 3, hullAmount: BAL.gate1.survivability.dmgNormalShot });
  assert.equal(sq.count, drones, '드론은 줄지 않는다');
  assert.ok(sq.surv.hull < hull0, '내구도가 줄어든다');
  assert.ok(hullFrac(sq.surv) < 1);
});

test('SP-07: 섹터 HUD가 내구도 바 + 빈 보조 슬롯을 표시한다', () => {
  assert.ok(renderSrc.includes('export function drawSectorLoadoutHud'), '섹터 전용 HUD');
  assert.ok(renderSrc.includes('function hudHullBar') && renderSrc.includes('function hudWeaponSlots'), '25분 HUD와 공용 조각');
  assert.ok(renderSrc.includes("'보조 무기 슬롯 (정예 POW로 장착)'"), '섹터는 POW 안내로 빈 슬롯 표기');
  assert.ok(mainSrc.includes('drawSectorLoadoutHud(ctx, LOGICAL_W, logicalH, {'), 'draw 루프 배선');
  assert.ok(/if \(!r\.coreLoop && !r\.campaign25 && r\.squad\.surv\)/.test(mainSrc), '섹터에서만(25분은 자체 HUD)');
});
