// 보스 없이 '보스 격파'로 오판하던 회귀 방지.
// 원인: weaponPf가 while(r.pending) 루프 안에서 선언되어 보스 스폰(루프 밖)에서 ReferenceError →
//  프레임 try/catch가 삼켜 r.bosses가 빈 채 phase='boss' → 다음 프레임 [].every()=true로 오격파.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mainSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../js/main.js'), 'utf8');

test('BS-1: weaponPf가 while(r.pending) 루프 밖에서 선언된다(보스 스폰 스코프)', () => {
  const decl = mainSrc.indexOf('const weaponPf =');
  const loop = mainSrc.indexOf('while (r.pending.length');
  assert.ok(decl !== -1 && loop !== -1, 'weaponPf 선언·while 존재');
  assert.ok(decl < loop, 'weaponPf는 while 루프보다 먼저 선언(루프 밖 스코프)');
  // 루프 안에서 재선언되면 안 된다(보스 스폰이 참조하는 바깥 것과 충돌·섀도잉)
  assert.equal((mainSrc.match(/const weaponPf =/g) || []).length, 1, 'weaponPf 선언은 1곳뿐');
});

test('BS-2: 섹터 보스 격파 판정에 .length 가드가 있다(빈 배열 오격파 차단)', () => {
  // 빈 배열의 every()는 true → 보스 없이 격파로 오판. campaign25처럼 .length 선행 검사.
  assert.ok(/r\.bosses\.length && r\.bosses\.every\(\(b\) => b\.dead\) && !r\.coreLoop/.test(mainSrc),
    '섹터 보스 격파 if에 r.bosses.length 가드');
  assert.ok(/r\.bossLab && r\.bosses\.length && r\.bosses\.every/.test(mainSrc), '보스랩도 .length 가드');
});
