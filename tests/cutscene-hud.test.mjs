import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCutscene, bossPose, shipPose, CUT } from '../js/cutscene.js';
import { BAL } from '../js/balance.js';

// 2026-07-22 이사 피드백: ①섹터 클리어 컷신을 전체화면 이미지 방식으로 ②무기 표기 좌/우 중복 제거.

const renderSrc = readFileSync(new URL('../js/render.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const cutSrc = readFileSync(new URL('../js/cutscene.js', import.meta.url), 'utf8');
const sprSrc = readFileSync(new URL('../js/sprites.js', import.meta.url), 'utf8');
const inputSrc = readFileSync(new URL('../js/input.js', import.meta.url), 'utf8');

const W = BAL.logicalW, H = 776;
const mk = () => createCutscene({ sector: 3, bossId: 'B10', bossName: '옵시디언 클로', tier: 2, weapon: 'laser' });

test('CS-01: 보스가 시간에 따라 아래로 침몰하며 기울고 사라진다', () => {
  const c = mk();
  const at = (t) => { c.t = t; return bossPose(c, W, H); };
  const a = at(0), b = at(2), d = at(CUT.sinkTo);
  assert.ok(b.y > a.y && d.y > b.y, '단조적으로 내려간다');
  assert.ok(b.roll > a.roll && d.roll > b.roll, '점점 기운다');
  assert.equal(a.alpha, 1, '처음엔 선명');
  assert.ok(d.alpha <= 0.01, '끝에는 사라진다');
  assert.ok(d.y < H * 1.2, '화면 밖으로 과하게 벗어나지 않는다');
});

test('CS-02: 기함은 늦게 등장해 위로 빠져나간다', () => {
  const c = mk();
  const at = (t) => { c.t = t; return shipPose(c, W, H); };
  assert.equal(at(0).visible, false, '보스 격침 직후엔 아직 없음');
  assert.equal(at(CUT.shipFrom + 0.01).visible, true, '지정 시각에 등장');
  const mid = at((CUT.shipFrom + CUT.shipTo) / 2), end = at(CUT.shipTo);
  assert.ok(mid.y < H * 1.2 && mid.y > 0, '중간엔 화면 안');
  assert.ok(end.y < 0, '끝엔 화면 위로 이탈');
});

test('CS-03: 타임라인 순서가 어긋나지 않는다', () => {
  assert.ok(CUT.fadeIn < CUT.shipFrom, '페이드인 후 기함 등장');
  assert.ok(CUT.shipFrom < CUT.titleAt, '기함이 먼저, 타이틀은 뒤');
  assert.ok(CUT.titleAt < CUT.outStart, '타이틀을 읽을 시간이 있다');
  assert.ok(CUT.outStart - CUT.titleAt >= 1.0, '타이틀 노출 1초 이상');
  assert.ok(CUT.outStart < CUT.outEnd, '페이드아웃 구간 존재');
  assert.ok(CUT.outEnd >= 4 && CUT.outEnd <= 8, '컷신 길이 4~8초');
});

test('CS-03b: 타이틀이 뜰 때 기함은 이미 화면 밖 (글자를 뚫고 지나가면 안 된다)', () => {
  const c = mk();
  c.t = CUT.titleAt;
  const s = shipPose(c, W, H);
  // 기함 스프라이트 반높이를 넉넉히 잡아도 타이틀 밴드(상단 0.2H 부근)에 닿지 않아야 한다
  assert.ok(s.y < -40, `타이틀 시점 기함 y=${s.y.toFixed(0)} — 화면 위로 완전히 빠져나가 있어야 한다`);
});

test('CS-04: 배경 이미지가 없으면 인게임 연출로 폴백한다 (게임이 멈추면 안 됨)', () => {
  assert.ok(cutSrc.includes('if (!bg) return false;'), '이미지 없으면 draw가 false');
  assert.ok(mainSrc.includes('r.isBossNode && cutsceneReady()'), '준비됐을 때만 컷신 진입');
  assert.ok(mainSrc.includes("run.cut = null;   // 배경 이미지가 없으면"), 'draw 실패 시 폴백');
  assert.ok(sprSrc.includes('CUT_SECTOR_CLEAR'), '배경 스프라이트 등록');
  assert.ok(mainSrc.includes("preloadSprites(['CUT_SECTOR_CLEAR'])"), '보스 노드에서 지연 로드');
});

test('CS-05: 컷신은 보스 아트를 이미지에 굽지 않고 런타임에 얹는다', () => {
  // 보스 정체가 섹터마다 다르므로 배경에 그려 넣으면 안 된다
  assert.ok(cutSrc.includes('getSprite(c.bossId)'), '실제 보스 스프라이트 사용');
  assert.ok(mainSrc.includes('bossId: lead?.def?.id'), '격파된 보스 id 전달');
});

test('CS-06: 컷신 건너뛰기 — 래치를 소비하고 초반엔 무시한다', () => {
  assert.ok(inputSrc.includes('input.consumeSkip'), '소비형 래치');
  assert.ok(inputSrc.includes('skipRequested = true'), '입력이 래치를 세운다');
  assert.ok(mainSrc.includes('r.cut.t > 0.8 && input.consumeSkip()'),
    '초반 0.8초는 무시 — 보스를 잡은 클릭이 그대로 이어져 컷신이 즉사하면 안 된다');
});

test('CS-07: 무기 표기 중복 제거 — 좌측 슬롯이 뜨면 우상단은 생략', () => {
  assert.ok(/loadoutHud = false \}/.test(renderSrc), 'drawHUD에 loadoutHud 인자');
  assert.ok(renderSrc.includes('if (weapon && !loadoutHud)'), '좌측 HUD면 우상단 무기 미표기');
  assert.ok(renderSrc.includes('} else if (shield) {'), '보호막 표시는 남긴다');
  assert.ok(mainSrc.includes('loadoutHud: !!r.squad.surv'), '적재 HUD가 뜨는 모드에서만 생략');
});

test('CS-08: 진화명이 좌측 슬롯에 표시된다 (주무기·보조 각각)', () => {
  assert.ok(renderSrc.includes('const text = label + (evo ? ` · ${evo}` : \'\')'), '슬롯 라벨에 진화명 결합');
  assert.ok(mainSrc.includes('function weaponEvoLabelFor(sq, w)'), '무기별 진화 표기 함수');
  assert.equal((mainSrc.match(/mainEvo: weaponEvoLabelFor\(sq, sq\.weapon\)/g) || []).length, 2,
    '섹터·25분 두 HUD 모두 배선');
  assert.ok(mainSrc.includes('wingEvo: weaponEvoLabelFor(sq, sq.wing.weaponId)'), '보조 무기 진화명도');
});
