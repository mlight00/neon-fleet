import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ART_PATHS, SPRITE_SIZES } from '../js/sprites.js';
import { weaponMountSpriteId, weaponProjectileSpriteId } from '../js/ships.js';
import { HiveQueen, makeBoss } from '../js/bosses.js';
import { bossCountFor } from '../js/logic.js';

const root = new URL('../', import.meta.url);
const disk = (relative) => new URL(relative, root);

test('FORGED LIGHT 런타임 경로가 모두 실제 파일을 가리킨다', () => {
  const missing = Object.entries(ART_PATHS)
    .filter(([, path]) => !existsSync(disk(path)))
    .map(([id, path]) => `${id}:${path}`);
  assert.deepEqual(missing, []);
});

test('기함은 긴 변 34→140 계약이고 구 무기별 완성 함선 슬롯은 등록하지 않는다', () => {
  assert.deepEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((id) => SPRITE_SIZES[id]), [34, 50, 68, 88, 112, 140]);
  for (let tier = 1; tier <= 6; tier++) for (const suffix of ['V', 'L', 'H']) {
    assert.equal(SPRITE_SIZES[`A${tier}${suffix}`], undefined);
  }
});

test('무기 분기 6종이 마운트와 발사체에 같은 계보로 매핑된다', () => {
  const cases = [
    ['vulcan', null, 'VULCAN_BASE'], ['vulcan', 'vulcan_needle', 'VULCAN_NEEDLE'], ['vulcan', 'vulcan_storm', 'VULCAN_STORM'],
    ['laser', null, 'LASER_BASE'], ['laser', 'laser_cutter', 'LASER_CUTTER'], ['laser', 'laser_prism', 'LASER_PRISM'],
    ['homing', null, 'HOMING_BASE'], ['homing', 'homing_wasp', 'HOMING_WASP'], ['homing', 'homing_siege', 'HOMING_SIEGE'],
  ];
  for (const [weapon, evo, suffix] of cases) {
    assert.equal(weaponMountSpriteId(weapon, evo), `MOUNT_${suffix}`);
    assert.equal(weaponProjectileSpriteId(weapon, evo), `PROJ_${suffix}`);
  }
});

test('H2/B22/B7 오버레이 그룹의 원본 캔버스 정렬 계약이 유지된다', () => {
  const manifest = JSON.parse(readFileSync(disk('assets/art2-webp/asset-manifest-codex-v01.json'), 'utf8'));
  const sizes = new Map(manifest.assets.map((a) => [a.webp.replaceAll('\\', '/'), a.size]));
  const group = (paths, expected) => paths.forEach((path) => assert.deepEqual(sizes.get(path), expected, path));
  group([
    'assets/art2-webp/ships/frames/H2_base_aligned.webp',
    'assets/art2-webp/ships/frames/H2_assault.webp',
    'assets/art2-webp/ships/frames/H2_carrier.webp',
  ], [533, 768]);
  group(Object.values(ART_PATHS).filter((p) => /bosses\/b22\/B22_(?:chassis|ring|arm_left|arm_right|core|crack_mask)\.webp$/.test(p)), [768, 705]);
  group(Object.values(ART_PATHS).filter((p) => /bosses\/b7\/B7_(?:body|egg_left|egg_right|crown|heart)\.webp$/.test(p)), [768, 582]);
});

test('B7 생성은 일반 Boss 복제가 아니라 단일 부위형 HiveQueen 클래스다', () => {
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  assert.ok(boss instanceof HiveQueen);
  assert.equal(boss.hivePhase, 1);
  assert.equal(boss.spriteId, 'B7');
});

test('B7 하이브 퀸과 B22 아비터는 후반 섹터에서도 한 기만 등장한다', () => {
  const cfg = { multiFromSector2: 2, multiFromSector3: 3 };
  assert.equal(bossCountFor('B7', 6, cfg), 1);
  assert.equal(bossCountFor('B22', 22, cfg), 1);
  assert.equal(bossCountFor('B6', 6, cfg), 3);
});
