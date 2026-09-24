// E_prior-review-check.mjs — v4 기획 검토 E 담당(이전 검수 항목): 2차 검수(review2/01_GPT_2차_검수결과.md)의
//  N1 첫 게이트 실패 안내 · N2 셔터 숫자 가독성 · N4 랜덤 길 결과 = 실제 적용량 이 **현재 HEAD 코드**에 남아 있는지 확인한다.
//  읽기 전용: 소스 파일을 읽기만 하고, 관련 검사만 골라 `node --test --test-name-pattern` 으로 돌린다(파일을 쓰지 않는 검사). 결과 = E_prior-review-check.json.
//  추가: v4 기본값(지옥 수치)에서도 N1 안내가 그대로 나오는지 S2 를 brutal 로 한 판 돌려 본다(봇 결과이지 사람 관찰이 아니다).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { playPolicy } from '../../../../tests/lib/rush3-policies.mjs';
import { adviceLine } from '../../../../rush3/advice.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');

function findLines(rel, patterns) {
  const lines = readFileSync(join(ROOT, rel), 'utf8').split(/\r?\n/);
  const out = {};
  for (const p of patterns) {
    const hits = [];
    lines.forEach((l, i) => { if (l.includes(p)) hits.push({ line: i + 1, text: l.trim().slice(0, 160) }); });
    out[p] = hits.slice(0, 4);
  }
  return out;
}

const codeEvidence = {
  N1_stages: findLines('rush3/stages.js', ['첫 갈림길은 왼쪽 +칸으로 통과하세요']),
  N1_advice: findLines('rush3/advice.js', ['gate: \'음수 게이트는 같은 줄의']),
  N2_render: findLines('rush3/render.js', ['셔터 판(회색 빗금) — 숫자보다 **먼저** 그린다', '잠김 표시(계약서 6장 N2-②)', 'const base = row.passed ? 0.32 : 0.92']),
  N4_main: findLines('rush3/main.js', ["'랜덤 길: 위험 게이트 무력화 · 손실 0'", "'랜덤 길: 함정 피해 −'", 'export function lotteryLine']),
  tests: {
    ...findLines('tests/rush3-advice.test.mjs', ['V3-HINT-N1']),
    ...findLines('tests/rush3-render.test.mjs', ['V3-RENDER-SHUTTER']),
    ...findLines('tests/rush3-lottery.test.mjs', ['LOT-11']),
    ...findLines('tests/rush3-loop.test.mjs', ['V3-SHELL-LOTTERY-OUT', 'V3-SHELL-SHUTTER']),
  },
};

//  관련 검사만 실행(node --test). 표준 출력의 요약 줄만 남긴다
let testRun;
try {
  const txt = execFileSync(process.execPath, ['--test', '--test-name-pattern=V3-HINT-N1|V3-RENDER-SHUTTER|LOT-11|LOT-7|V3-SHELL-LOTTERY-OUT|V3-SHELL-SHUTTER',
    'tests/rush3-advice.test.mjs', 'tests/rush3-render.test.mjs', 'tests/rush3-lottery.test.mjs', 'tests/rush3-loop.test.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 280000 });
  const pick = (k) => { const m = new RegExp('ℹ ' + k + ' (\\d+)').exec(txt); return m ? Number(m[1]) : null; };
  testRun = { tests: pick('tests'), pass: pick('pass'), fail: pick('fail'), names: txt.split(/\r?\n/).filter((l) => /^✔|^✖/.test(l.trim())).map((l) => l.trim().replace(/\s*\([\d.]+ms\)$/, '')) };
} catch (e) {
  testRun = { error: String(e.message).slice(0, 400), stdout: String(e.stdout || '').slice(-1500) };
}

//  v4 기본값(= 지금 지옥 수치)에서 N1 재현 조건(S2 우측 고정)과 evLead 판의 결과 안내
const s2 = {};
for (const [pol, diff] of [['right', 'normal'], ['right', 'brutal'], ['evLead', 'brutal']]) {
  const { run } = playPolicy(2, pol, 14400, diff);
  s2[pol + '_' + diff] = {
    won: run.won, time: Math.round(run.time * 100) / 100, lastBadGateId: run.lastBadGateId, lossByGate: run.lossByGate,
    lossByTouch: run.lossByTouch, lossByShot: run.lossByShot, peak: run.peak, advice: adviceLine(run, run),
  };
}

const out = {
  meta: { script: 'E_prior-review-check.mjs', date: new Date().toISOString(), headNote: 'HEAD 7e6872e(코드 = b43e4d1)에서 실행' },
  codeEvidence, testRun, s2AdviceUnderV4Values: s2,
};
writeFileSync(join(HERE, 'E_prior-review-check.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ testRun: { tests: testRun.tests, pass: testRun.pass, fail: testRun.fail, err: testRun.error }, s2 }, null, 1));
