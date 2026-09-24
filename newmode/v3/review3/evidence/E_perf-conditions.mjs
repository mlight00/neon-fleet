// E_perf-conditions.mjs — v4 기획 검토 E 담당(성능 증거): 기획 1-3 '광장 S24 38.6fps'의 측정 조건을 원자료에서 읽어 정리하고,
//  그 측정 장면(보통 난이도·무입력·S24 광장 진입 1초 뒤)의 병력 수를 **현재 코드**로 재현해 추정한다.
//  읽기 전용: 저장소 밖 E:\workspace\claude\neon-fleet\newmode\v3\research\{hitfeel-20260923, perspective-20260920} 의 스크립트·로그를 읽기만 한다.
//  ⚠️병력 수는 측정 당시 코드(r3.24, 2026-09-23 02시)가 아니라 현재 코드(b43e4d1)로 돌린 값이다 — r3.25~r3.31 에서 적·보스 값이 바뀌었으므로 '추정'이다.
//  결과 = E_perf-conditions.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRun, stepRun, drainEvents, STEP } from '../../../../rush3/combat.js';
import { buildStage } from '../../../../rush3/stages.js';
import { pickInput } from '../../../../tests/lib/rush3-policies.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RES = 'E:/workspace/claude/neon-fleet/newmode/v3/research';
const rd = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const lineOf = (txt, needle) => { if (!txt) return null; const ls = txt.split(/\r?\n/); const i = ls.findIndex((l) => l.includes(needle)); return i < 0 ? null : { line: i + 1, text: ls[i].trim().slice(0, 200) }; };

//  1) hitfeel-20260923 (r3.24) — 38.6fps 의 출처
const hf = `${RES}/hitfeel-20260923`;
const fpsPy = rd(`${hf}/fps.py`), fpsLog = rd(`${hf}/fps_log.txt`), fpsFixLog = rd(`${hf}/fps_log_fix.txt`), report = rd(`${hf}/report.md`);
const auditFps = rd(`${hf}/audit/fps2_050623.json`), auditPy = rd(`${hf}/audit/fps2.py`);
const hitfeel = {
  files: { fpsPy: !!fpsPy, fpsLog: !!fpsLog, fpsFixLog: !!fpsFixLog, report: !!report, auditFps2Json: !!auditFps },
  conditionLines: fpsPy && {
    headlessChromium: lineOf(fpsPy, 'br = p.chromium.launch()'),
    viewportDpr: lineOf(fpsPy, "viewport={'width': 480, 'height': 800}, device_scale_factor=2"),
    localStorageClear: lineOf(fpsPy, 'localStorage.clear()'),
    difficultyKey: lineOf(fpsPy, "pg.keyboard.press('Digit1'); pg.keyboard.press('Space')"),
    arenaWait: lineOf(fpsPy, 'return d.arena || d.state !== "run"'),
    count5s: lineOf(fpsPy, 'performance.now() - t0 < 5000'),
    serverNewBase: lineOf(fpsPy, 'new = 8782'),
    noKeyZ: fpsPy.includes('KeyZ') ? 'KeyZ 있음' : 'KeyZ 누름 없음 → zoom false(표준 보기)',
    infoFields: lineOf(fpsPy, "return n / 5, {'state'"),
  },
  fpsLog: fpsLog && fpsLog.trim().split(/\r?\n/),
  fpsFixLog: fpsFixLog && fpsFixLog.trim().split(/\r?\n/),
  reportLine: lineOf(report, '광장 S24(아레나 진입 1초 뒤)'),
  audit: auditFps && (() => { const j = JSON.parse(auditFps); const pick = (a) => a.map((s) => ({ fps: s.fps, p95_ms: s.p95_ms, max_ms: s.max_ms, over33ms: s.over33ms, over50ms: s.over50ms, parts: s.parts })); return { S24_arena_normal: pick(j.S24_arena), S10_arena_normal: pick(j.S10_arena), S13_road_normal: pick(j.S13_road_normal), S13_road_brutal: pick(j.S13_road_brutal) }; })(),
  auditScenarioLine: lineOf(auditPy, "('S24_arena', 24, True, 'Digit1')"),
};

//  2) perspective-20260920 (r3.20) — '가까이' 로 잰 기록이 있는가
const pv = `${RES}/perspective-20260920`;
const pvLog = rd(`${pv}/fps_log.txt`), pvRunC = rd(`${pv}/audit/run_c.log`), pvAuditJson = rd(`${pv}/audit/audit_log_fps_iphone_shell_steer_touch.json`), pvFps2 = rd(`${pv}/audit/fps2.py`);
const perspective = {
  fpsProbeLog: pvLog && pvLog.trim().split(/\r?\n/), // S6(도로) flat/std/close
  auditRunC: pvRunC && pvRunC.split(/\r?\n/).filter((l) => l.startsWith('fps ')),
  auditJsonFps: pvAuditJson && JSON.parse(pvAuditJson).fps,
  fps2PairsLine: lineOf(pvFps2, 'pairs = ['),
  fps2OutputSaved: false, // fps2.py 는 print 만 하고 파일을 남기지 않는다(같은 폴더에 결과 파일 없음) — (24,'close') 결과는 기록이 없다
};
//  S24 를 '가까이' 로 잰 기록 검색(두 폴더의 텍스트 로그·JSON 전체)
//   구조별로 본다: perspective 감사 JSON fps 항목(stage·mode) · run_c.log 'fps <판> <모드> …' 줄 · fps_probe 로그(S6 전용) ·
//   hitfeel fps.py/fps2.py 는 KeyZ 를 누르지 않고 localStorage 를 비우므로 전부 표준 보기(모드 칸이 없다)
const s24CloseInAuditJson = (perspective.auditJsonFps || []).some((f) => f.stage === 24 && f.mode === 'close');
const s24CloseInRunC = (perspective.auditRunC || []).some((l) => /^fps 24 close /.test(l));
const hitfeelUsesKeyZ = [fpsPy, auditPy].some((t) => t && t.includes('KeyZ'));
const fpsProbeStage = lineOf(rd(`${pv}/fps_probe.py`), "rush3.html?stage=6");
const s24CloseRecord = { s24CloseInAuditJson, s24CloseInRunC, hitfeelUsesKeyZ, fpsProbeIsStage6Only: fpsProbeStage, found: s24CloseInAuditJson || s24CloseInRunC };

//  3) 측정 장면 병력 수 재현(현재 코드): S24, 무입력(NO_INPUT = stepRun(run, null)), 광장 진입 + 1초(60 STEP)
function arenaUnits(difficulty, policy) {
  const run = createRun(buildStage(24, { difficulty }));
  let steps = 0, enterStep = null, atEnter = null, after1s = null;
  while (!run.over && steps < 14400) {
    stepRun(run, policy ? pickInput(policy, run) : null, STEP);
    drainEvents(run);
    steps++;
    if (enterStep === null && run.phase === 'arena') { enterStep = steps; atEnter = run.units.length; }
    if (enterStep !== null && steps === enterStep + 60) { after1s = run.units.length; break; }
  }
  return { difficulty, policy: policy ?? 'noInput', arenaEntered: enterStep !== null, unitsAtArenaEnter: atEnter, unitsAfter1s: after1s, timeAtEnterSec: enterStep === null ? null : Math.round(enterStep * STEP * 100) / 100, over: run.over, won: run.won };
}
const unitsScene = [arenaUnits('normal', null), arenaUnits('brutal', null), arenaUnits('brutal', 'evLead')];

const out = {
  meta: { script: 'E_perf-conditions.mjs', date: new Date().toISOString(), note: '원자료 읽기 + 현재 코드 병력 재현. fps 를 새로 재지 않았다(개발 서버 실행 금지 조건).' },
  hitfeel, perspective, s24CloseRecordFound: s24CloseRecord, unitsScene,
};
writeFileSync(join(HERE, 'E_perf-conditions.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ cond: hitfeel.conditionLines, fpsLog: hitfeel.fpsLog, fix: hitfeel.fpsFixLog, audit: hitfeel.audit && hitfeel.audit.S24_arena_normal, pv: perspective.auditRunC, pvLog: perspective.fpsProbeLog, s24CloseRecord, unitsScene }, null, 1));
