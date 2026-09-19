// rush3-pure — 규칙 모듈의 난수 부재(계약서 0장·8장 V3-PURE). 소스 정적 대조는 이 1건뿐.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../rush3/' + f, import.meta.url), 'utf8');
const RNG_IMPORT = /import[^;]*from\s*['"][^'"]*rng\.js['"]/;

test('V3-PURE: combat/gates/supply/squad/weapons/advice/bonus/motion 소스에 Math.random·rng import 가 없다(stages.js 는 rng 허용)', () => {
  for (const f of ['combat.js', 'gates.js', 'supply.js', 'squad.js', 'weapons.js', 'advice.js', 'bonus.js', 'motion.js']) {
    const code = read(f);
    assert.ok(!code.includes('Math.random'), f + ': Math.random 사용');
    assert.doesNotMatch(code, RNG_IMPORT, f + ': rng import');
    assert.ok(!/\brng\b/.test(code.replace(/\/\/.*$/gm, '')), f + ': rng 식별자 사용');
  }
  const stages = read('stages.js');
  assert.ok(!stages.includes('Math.random'));
  assert.match(stages, RNG_IMPORT, 'stages.js 는 빌드 시점 좌표 확정용 rng 를 import 한다');
});
