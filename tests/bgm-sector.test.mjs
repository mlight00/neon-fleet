// 섹터별 전투 BGM: 트랙 6종 등록 + playBgmForSector 폴백 + 게임 배선(노드·캠페인 지역 진입).
// WebAudio는 노드에서 못 돌리므로 소스 배선을 검증한다(실제 재생은 브라우저 확인).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const audioSrc = readFileSync(join(root, 'js/audio.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'js/main.js'), 'utf8');

test('BGM-S1: 섹터마다 변주 2곡(a/b) 총 12트랙이 등록돼 있다', () => {
  for (let s = 1; s <= 6; s++) {
    for (const v of ['a', 'b']) {
      assert.ok(new RegExp(`battle_s${s}${v}: 'assets/sound/nf_bgm_sector${s}${v}'`).test(audioSrc), `battle_s${s}${v} 등록`);
    }
  }
});

test('BGM-S2: playBgmForSector가 변주 랜덤 + 파일 없으면 battle1 폴백', () => {
  assert.ok(/export async function playBgmForSector/.test(audioSrc), 'playBgmForSector export');
  assert.ok(/\['a', 'b'\]\.map/.test(audioSrc), '변주 a/b 후보 구성');
  assert.ok(/Math\.random\(\)/.test(audioSrc), '변주 랜덤 선택');
  assert.ok(/sectorPick/.test(audioSrc), '같은 섹터 내 곡 유지 캐시');
  assert.ok(/playBgm\('battle1'/.test(audioSrc), 'battle1 폴백 존재');
});

test('BGM-S3: 게임이 섹터별 BGM을 호출한다(노드 시작 + 캠페인 지역 진입)', () => {
  assert.ok(mainSrc.includes('playBgmForSector'), 'import·사용');
  assert.ok(/playBgmForSector\(r\.sector,/.test(mainSrc), '노드 시작에서 섹터 BGM(restart 옵션 포함)');
  assert.ok(/playBgmForSector\(region\.i\)/.test(mainSrc), '캠페인 지역 진입에서 섹터 BGM');
});

test('BGM-S4: 섹터별 보스곡 6트랙 + playBgmForBoss 폴백 + 게임 배선', () => {
  for (let s = 1; s <= 6; s++) {
    assert.ok(new RegExp(`boss_s${s}: 'assets/sound/nf_bgm_boss_sector${s}'`).test(audioSrc), `boss_s${s} 등록`);
  }
  assert.ok(/export async function playBgmForBoss/.test(audioSrc), 'playBgmForBoss export');
  assert.ok(/playBgm\('boss'/.test(audioSrc), '공용 보스곡 폴백');
  // 캠페인 보스(region.i) + classic 보스(r.sector) 배선
  assert.ok(/playBgmForBoss\(region\.i\)/.test(mainSrc), '캠페인 보스에서 섹터 보스곡');
  assert.ok(/playBgmForBoss\(r\.sector\)/.test(mainSrc), 'classic 보스에서 섹터 보스곡');
});
