import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backdropTileY, backdropLayerY, SECTOR_BACKDROP, sectorBackdropIndex, LAYER_SPEEDS } from '../js/zone-backdrop.js';
import { zoneForSector, ZONES } from '../js/creative-direction.js';

// Gate 0 §11 — 배경 방향·섹터 매핑 자동 검증 (지시서 리모델링 §4)

// ─── R1: scroll 증가 시 모든 레이어의 화면 y가 증가한다 (위→아래 전진감) ─────
test('배경 타일 y는 scroll이 증가하면 아래로 이동한다 (backdropTileY 순수 함수)', () => {
  const tileH = 300;
  const y0 = backdropTileY(0, 0, tileH, 0.1);
  const y1 = backdropTileY(0, 1000, tileH, 0.1);
  assert.ok(y1 > y0, `scroll 1000의 y(${y1}) > scroll 0의 y(${y0}) — 아래로 이동`);
});

test('배경 타일 y는 tileH 주기로 순환한다 (이음매 없는 무한 반복)', () => {
  const tileH = 300, speed = 0.1;
  // scroll이 tileH/speed 만큼 증가하면 정확히 한 타일 이동 → 같은 위상
  const a = backdropTileY(0, 0, tileH, speed);
  const b = backdropTileY(0, tileH / speed, tileH, speed);
  assert.ok(Math.abs(a - b) < 1e-6, `한 주기 후 위상 복귀 (${a} ≈ ${b})`);
});

test('입자 레이어 y도 scroll 증가 시 아래로 이동한다 (backdropLayerY)', () => {
  const y0 = backdropLayerY(0.5, 0, 800, 0.2);
  const y1 = backdropLayerY(0.5, 500, 800, 0.2);
  assert.ok(y1 > y0 || (y1 < y0 && y0 - y1 > 400), '아래로 이동(순환 경계 제외 시 증가)');
  // 순환이라 직접 비교 대신, 미소 증가로 확인
  const ya = backdropLayerY(0.5, 100, 800, 0.2);
  const yb = backdropLayerY(0.5, 101, 800, 0.2);
  assert.ok(yb > ya, `scroll +1에 y 증가 (${ya} → ${yb})`);
});

test('R1 핵심: 배경 타일과 입자 레이어의 이동 부호가 동일하다 (반대로 안 흐름)', () => {
  const tileD = backdropTileY(0, 101, 300, 0.1) - backdropTileY(0, 100, 300, 0.1);
  const partD = backdropLayerY(0.5, 101, 800, 0.2) - backdropLayerY(0.5, 100, 800, 0.2);
  assert.ok(tileD > 0 && partD > 0, `타일 Δ${tileD.toFixed(3)} · 입자 Δ${partD.toFixed(3)} 둘 다 양수(아래)`);
});

// ─── FAR < MID < NEAR 속도 순서 ──────────────────────────────
test('레이어 속도는 FAR < MID < NEAR 순으로 커진다', () => {
  assert.ok(LAYER_SPEEDS.far < LAYER_SPEEDS.mid, `far ${LAYER_SPEEDS.far} < mid ${LAYER_SPEEDS.mid}`);
  assert.ok(LAYER_SPEEDS.mid < LAYER_SPEEDS.near, `mid ${LAYER_SPEEDS.mid} < near ${LAYER_SPEEDS.near}`);
});

// ─── R2: 섹터 1~6이 배경 S1~S6에 1:1 대응 ────────────────────
test('sectorBackdropIndex: 섹터 1~6 → 인덱스 0~5, 7+ → 5 고정', () => {
  for (let s = 1; s <= 6; s++) assert.equal(sectorBackdropIndex(s), s - 1, `섹터 ${s} → ${s - 1}`);
  assert.equal(sectorBackdropIndex(7), 5, '섹터 7 → 5 고정');
  assert.equal(sectorBackdropIndex(99), 5);
  assert.equal(sectorBackdropIndex(0), 0);   // 하한 보정
});

test('배경 S1~S6이 서로 다른 6개 파일로 등록된다', () => {
  assert.equal(SECTOR_BACKDROP.length, 6, '6개 섹터 배경');
  const files = SECTOR_BACKDROP.map((b) => b.url);
  assert.equal(new Set(files).size, 6, '전부 서로 다른 파일');
  files.forEach((u, i) => assert.match(u, new RegExp(`remodel-v2/backgrounds/s${i + 1}\\.webp$`), `S${i + 1} 경로`));
});

test('구 (sector-1)/2 묶음이 아니다 — 섹터 3과 4가 다른 배경', () => {
  assert.notEqual(sectorBackdropIndex(3), sectorBackdropIndex(4), '섹터 3≠4 배경');
  assert.notEqual(sectorBackdropIndex(1), sectorBackdropIndex(2), '섹터 1≠2 배경');
  assert.notEqual(sectorBackdropIndex(5), sectorBackdropIndex(6), '섹터 5≠6 배경');
});

// ─── 구역(zone) 매핑도 같은 1:1 인덱스 ───────────────────────
test('zoneForSector도 섹터 1~6에 서로 다른 구역을 준다 (창의방향 6구역)', () => {
  assert.ok(ZONES.length >= 6, '구역 6개 이상 정의');
  const zones = [1, 2, 3, 4, 5, 6].map((s) => zoneForSector(s).id ?? zoneForSector(s).name);
  assert.equal(new Set(zones).size, 6, `섹터 1~6 구역이 전부 다름: ${zones}`);
});
