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

test('BGM-S1: 섹터 전투 트랙 6종이 등록돼 있다', () => {
  for (let s = 1; s <= 6; s++) {
    assert.ok(new RegExp(`battle_s${s}: 'assets/sound/nf_bgm_sector${s}'`).test(audioSrc), `battle_s${s} 등록`);
  }
});

test('BGM-S2: playBgmForSector가 있고 파일 없으면 battle1로 폴백', () => {
  assert.ok(/export async function playBgmForSector/.test(audioSrc), 'playBgmForSector export');
  // 폴백 경로: 섹터 곡이 없거나 로드 실패 시 battle1
  assert.ok(/playBgm\('battle1'/.test(audioSrc), 'battle1 폴백 존재');
});

test('BGM-S3: 게임이 섹터별 BGM을 호출한다(노드 시작 + 캠페인 지역 진입)', () => {
  assert.ok(mainSrc.includes('playBgmForSector'), 'import·사용');
  assert.ok(/playBgmForSector\(r\.sector\)/.test(mainSrc), '노드 시작에서 섹터 BGM');
  assert.ok(/playBgmForSector\(region\.i\)/.test(mainSrc), '캠페인 지역 진입에서 섹터 BGM');
});
