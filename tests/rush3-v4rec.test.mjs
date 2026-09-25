// rush3-v4rec — r4.4(v4 ④단계) v4 기록 칸. 이사님 결정 D9′ = (가) "새 기록은 '버전:v4' 칸에 쌓고, 옛 지옥 기록은 '이전 기록'으로 흐리게 병기합니다.
//  최다 생존·최단 시간 기록마다 그때의 강화 단계 {power, rate, multi} 와 규칙 버전을 함께 저장합니다(3-6)."
//  묶음: SAVE-V4(셸 출격 기록 = 새 칸, 옛 칸 보존, v 3·.bak 없음) · SAVE-SNAP(생존·시간 스냅샷 왕복, 더 나쁜 기록이 스냅샷을 덮지 않음).
//  셸 검사는 실제 boot() 결선(가짜 캔버스·저장·오디오·rAF)을 두드린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave3, KEY3, BAK3 } from '../rush3/save.js';
import { stageVersion } from '../rush3/stages.js';
import { addUnits } from '../rush3/squad.js';
import { boot, REC_SLOT_V4, PREV_REC_SLOT, REC_RULE, upSnapshot, prevRecordLine } from '../rush3/main.js';

// ─────────────────────────────── 셸 하네스 ───────────────────────────────
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  const writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}
function fakeCanvas(texts) {
  const grad = { addColorStop() {} };
  const listeners = {};
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'fillText') texts.push(String(args[0]));
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: String(args[0]).length * 8 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return {
    width: 480, height: 800, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }),
    addEventListener: (n, f) => { (listeners[n] ??= []).push(f); },
    fire: (n, e) => { for (const f of listeners[n] ?? []) f(e); },
  };
}
function fakeAudio() {
  return { unlock() {}, sfx() { return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} };
}
async function bootV4({ storage = memStorage() } = {}) {
  const texts = [];
  const canvas = fakeCanvas(texts);
  const win = { devicePixelRatio: 1, location: { search: '' }, addEventListener() {} };
  const queue = [];
  let nowMs = 1000;
  const save = createSave3(storage);
  const app = boot(canvas, { win, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio: fakeAudio(), dateNow: () => 1_700_000_000_000,
                             sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n = 1) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  const textNow = () => { texts.length = 0; frames(1); return [...texts]; };
  return { app, save, storage, frames, textNow };
}
//  출격한 판을 셸의 정상 경로(run.over → 여운 → finishRun → commitMain)로 이긴다. 생존 = survivors 명, 본전투 시각 = time, 강화 단계 = up(스냅샷 원천 run.up)
function winAs(h, { survivors, time, up = null }) {
  const run = h.app.getRun();
  h.frames(2);
  run.units.length = 1;
  addUnits(run, survivors - 1);
  if (up) run.up = { ...up };
  run.won = true; run.wonAt = time; run.over = true;
  let n = 0;
  while (h.app.getState() === 'run' && n++ < 300) h.frames(1);
  assert.equal(h.app.getState(), 'result');
  return run;
}
const snap = (power, rate, multi) => ({ power, rate, multi, rule: 'v4' });

// ─────────────────────────────── SAVE-V4 ───────────────────────────────

test('SAVE-V4: 셸 출격 기록은 새 칸 `${버전}:v4` 에 쌓이고 옛 `:brutal`·보통 칸은 지워지지 않는다 — 저장 형식 v 3 그대로·.bak 없음·재로드 뒤에도 유지', async () => {
  assert.equal(REC_SLOT_V4, 'v4'); assert.equal(PREV_REC_SLOT, 'brutal'); assert.equal(REC_RULE, 'v4');
  const ver = stageVersion(1);
  //  옛 v3 저장 원문: 1번 옛 지옥 칸 기록 + 보통 칸 기록(지갑 키 없음)
  const raw = { v: 3, stages: { 1: { versions: { [ver + ':brutal']: { cleared: true, attempts: 4, bestSurvivors: 7, bestTime: 70 }, [String(ver)]: { cleared: true, attempts: 2, bestSurvivors: 30, bestTime: 50 } } } },
                lastStage: 1, difficulty: 'brutal', volume: 1, mute: false, seenShutter: true, seenVehicle: false, zoom: false };
  const storage = memStorage({ [KEY3]: JSON.stringify(raw) });
  const h = await bootV4({ storage });
  //  타이틀: v4 칸은 아직 없음(미도전) + 옛 지옥 기록은 '이전 기록'
  const t0 = h.textNow();
  assert.ok(t0.includes('미도전'), '1번 칸 = v4 칸 기록(없음)');
  assert.ok(t0.includes(prevRecordLine({ cleared: true, bestSurvivors: 7, bestTime: 70 })), '옛 지옥 기록 = 이전 기록: ' + JSON.stringify(t0.filter((s) => s.includes('기록'))));
  assert.ok(!t0.some((s) => s.includes('30명')), '옛 보통 칸 기록은 화면에 나오지 않는다');
  h.app.startRun(1);
  assert.equal(h.save.getStage(1, ver, 'v4').attempts, 1, '출격 attempts = v4 칸');
  winAs(h, { survivors: 9, time: 44.25 });
  const s = JSON.parse(storage.getItem(KEY3));
  assert.equal(s.v, 3, '저장 형식 v 3 유지');
  assert.equal(storage.getItem(BAK3), null, '.bak 없음(옛 저장이 밀려나지 않았다)');
  assert.deepEqual(Object.keys(s.stages['1'].versions).sort(), [String(ver), ver + ':brutal', ver + ':v4'].sort());
  assert.deepEqual(s.stages['1'].versions[ver + ':brutal'], { cleared: true, attempts: 4, bestSurvivors: 7, bestTime: 70 }, '옛 지옥 칸 그대로');
  assert.deepEqual(s.stages['1'].versions[String(ver)], { cleared: true, attempts: 2, bestSurvivors: 30, bestTime: 50 }, '옛 보통 칸 그대로');
  assert.deepEqual(s.stages['1'].versions[ver + ':v4'], { cleared: true, attempts: 1, bestSurvivors: 9, bestTime: 44.25, survUp: snap(0, 0, 0), timeUp: snap(0, 0, 0) }, 'v4 칸 = 새 기록 + 강화 스냅샷');
  //  재로드: 새 저장 객체로 읽어도 칸·스냅샷이 그대로
  const again = createSave3(storage);
  assert.deepEqual(again.getStage(1, ver, 'v4'), { cleared: true, attempts: 1, bestSurvivors: 9, bestTime: 44.25, survUp: snap(0, 0, 0), timeUp: snap(0, 0, 0) });
  assert.deepEqual(again.getStage(1, ver, 'brutal'), { cleared: true, attempts: 4, bestSurvivors: 7, bestTime: 70 });
  //  결과 → 타이틀: 1번 칸 = v4 기록(크게) + 이전 기록(흐리게)
  h.app.toTitle();
  const t1 = h.textNow();
  assert.ok(t1.includes('완료 · 9명 · 44.3초') || t1.some((x) => x.startsWith('완료 · 9명')), 'v4 기록: ' + JSON.stringify(t1.filter((x) => x.includes('명'))));
  assert.ok(t1.includes(prevRecordLine({ cleared: true, bestSurvivors: 7, bestTime: 70 })));
  //  옛 지옥 칸을 이긴 적이 없으면 '이전 기록' 줄도 없다
  assert.equal(prevRecordLine({ cleared: false, attempts: 3, bestSurvivors: 0, bestTime: 0 }), null);
  assert.equal(prevRecordLine(null), null);
});

// ─────────────────────────────── SAVE-SNAP ───────────────────────────────

test('SAVE-SNAP: 저장 계층 — survUp·timeUp 은 희소 필드(없으면 키 없음)로 왕복하고, 정규화(정수·0~최대·rule 식별자)되며, 자기 기록이 좋아질 때만 바뀐다', () => {
  const st = memStorage();
  const s = createSave3(st);
  s.updateStage(2, { cleared: true, attempts: 1, bestSurvivors: 10, bestTime: 60, survUp: snap(1, 0, 0), timeUp: snap(1, 0, 0) }, 3, 'v4');
  assert.deepEqual(createSave3(st).getStage(2, 3, 'v4'), { cleared: true, attempts: 1, bestSurvivors: 10, bestTime: 60, survUp: snap(1, 0, 0), timeUp: snap(1, 0, 0) }, '재로드 왕복');
  //  스냅샷 없는 옛 기록 칸에는 키가 없다(희소)
  s.updateStage(2, { cleared: true, attempts: 1, bestSurvivors: 3, bestTime: 90 }, 3, 'brutal');
  assert.ok(!('survUp' in s.getStage(2, 3, 'brutal')) && !('timeUp' in s.getStage(2, 3, 'brutal')));
  //  기록 없이 스냅샷만 보낸 조각은 스냅샷을 바꾸지 못한다
  s.updateStage(2, { survUp: snap(5, 5, 3), timeUp: snap(5, 5, 3) }, 3, 'v4');
  assert.deepEqual([s.getStage(2, 3, 'v4').survUp, s.getStage(2, 3, 'v4').timeUp], [snap(1, 0, 0), snap(1, 0, 0)]);
  //  생존만 좋아진 조각 → survUp 만 바뀌고 timeUp 은 그 기록(60초)의 것 그대로
  s.updateStage(2, { bestSurvivors: 12, survUp: snap(2, 1, 0) }, 3, 'v4');
  assert.deepEqual([s.getStage(2, 3, 'v4').survUp, s.getStage(2, 3, 'v4').timeUp], [snap(2, 1, 0), snap(1, 0, 0)]);
  //  시간만 좋아진 조각 → timeUp 만
  s.updateStage(2, { bestTime: 55, timeUp: snap(3, 1, 1) }, 3, 'v4');
  assert.deepEqual([s.getStage(2, 3, 'v4').survUp, s.getStage(2, 3, 'v4').timeUp], [snap(2, 1, 0), snap(3, 1, 1)]);
  //  더 나쁜 시간(58 > 55)을 실은 조각의 스냅샷은 받지 않는다(스냅샷이 다른 판의 기록에 붙지 않게)
  s.updateStage(2, { bestTime: 58, timeUp: snap(0, 0, 0) }, 3, 'v4');
  assert.deepEqual(s.getStage(2, 3, 'v4').timeUp, snap(3, 1, 1), '더 나쁜 기록의 스냅샷은 버린다');
  //  정규화: 정수(버림)·트랙별 0~최대(5·5·3)·rule 은 짧은 소문자 식별자, 객체가 아니면 버림
  s.updateStage(4, { cleared: true, bestSurvivors: 1, bestTime: 9, survUp: { power: 9.7, rate: -2, multi: 2.9, rule: 'V4!' }, timeUp: 'x' }, 1, 'v4');
  const r = s.getStage(4, 1, 'v4');
  assert.deepEqual(r.survUp, { power: 5, rate: 0, multi: 2, rule: 'v4' });
  assert.ok(!('timeUp' in r), '객체가 아닌 스냅샷은 버린다');
  //  손상 원문(스냅샷이 배열·숫자)도 진행 가능, 키 없이 읽힌다
  const bad = memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: { 1: { versions: { '2:v4': { cleared: true, attempts: 1, bestSurvivors: 2, bestTime: 30, survUp: [1, 2], timeUp: 7 } } } } }) });
  const rb = createSave3(bad).getStage(1, 2, 'v4');
  assert.deepEqual(rb, { cleared: true, attempts: 1, bestSurvivors: 2, bestTime: 30 });
});

test('SAVE-SNAP: 셸 경로(commitMain) — 생존 신기록이면 survUp, 시간 신기록이면 timeUp 을 **각각** 그 판의 강화 단계로, 신기록이 아닌 쪽은 스냅샷을 덮지 않는다', async () => {
  const ver = stageVersion(1);
  const h = await bootV4();
  const rec = () => h.save.getStage(1, ver, 'v4');
  //  1판: 첫 승리 = 둘 다 신기록
  h.app.startRun(1);
  const r1 = winAs(h, { survivors: 10, time: 60, up: { power: 1, rate: 0, multi: 0 } });
  assert.deepEqual(upSnapshot(r1), snap(1, 0, 0), 'upSnapshot = run.up + 규칙 버전');
  assert.deepEqual(rec(), { cleared: true, attempts: 1, bestSurvivors: 10, bestTime: 60, survUp: snap(1, 0, 0), timeUp: snap(1, 0, 0) });
  //  2판: 생존만 신기록(12 > 10, 시간 70 > 60)
  h.app.startRun(1);
  winAs(h, { survivors: 12, time: 70, up: { power: 2, rate: 1, multi: 0 } });
  assert.deepEqual(rec(), { cleared: true, attempts: 2, bestSurvivors: 12, bestTime: 60, survUp: snap(2, 1, 0), timeUp: snap(1, 0, 0) });
  //  3판: 시간만 신기록(50 < 60, 생존 5 < 12)
  h.app.startRun(1);
  winAs(h, { survivors: 5, time: 50, up: { power: 3, rate: 1, multi: 1 } });
  assert.deepEqual(rec(), { cleared: true, attempts: 3, bestSurvivors: 12, bestTime: 50, survUp: snap(2, 1, 0), timeUp: snap(3, 1, 1) });
  //  4판: 둘 다 신기록이 아니다 → 기록·스냅샷 모두 그대로(더 나쁜 기록이 스냅샷을 덮지 않는다)
  h.app.startRun(1);
  winAs(h, { survivors: 4, time: 80, up: { power: 5, rate: 5, multi: 3 } });
  assert.deepEqual(rec(), { cleared: true, attempts: 4, bestSurvivors: 12, bestTime: 50, survUp: snap(2, 1, 0), timeUp: snap(3, 1, 1) });
  //  같은 기록(동률)은 신기록이 아니다 — 스냅샷을 옮기지 않는다
  h.app.startRun(1);
  winAs(h, { survivors: 12, time: 50, up: { power: 4, rate: 4, multi: 2 } });
  assert.deepEqual(rec(), { cleared: true, attempts: 5, bestSurvivors: 12, bestTime: 50, survUp: snap(2, 1, 0), timeUp: snap(3, 1, 1) });
  //  패배 판은 스냅샷을 쓰지 않는다
  h.app.startRun(1);
  const run = h.app.getRun();
  h.frames(2);
  run.up = { power: 5, rate: 5, multi: 3 };
  run.units.length = 0; run.over = true;
  let n = 0;
  while (h.app.getState() === 'run' && n++ < 300) h.frames(1);
  assert.deepEqual(rec(), { cleared: true, attempts: 6, bestSurvivors: 12, bestTime: 50, survUp: snap(2, 1, 0), timeUp: snap(3, 1, 1) });
});
