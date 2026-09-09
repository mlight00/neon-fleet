// rush3-save — 계약서 8장 V3-SAVE + 자산 모듈 Node 스모크
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave3, KEY3, BAK3 } from '../rush3/save.js';
import { SPRITE_KEYS3, loadSprites3 } from '../rush3/sprites.js';
import { createAudio3, SFX_NAMES3 } from '../rush3/audio.js';

const memStorage = (init = {}) => { const m = new Map(Object.entries(init)); return {
  m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

//  어떤 저장 상태에서도 진행 가능해야 한다: getStage/updateStage/patch 가 예외 없이 동작
function runsFine(s) {
  assert.equal(s.get().v, 3);
  assert.ok(s.get().stages && typeof s.get().stages === 'object');
  assert.deepEqual(s.getStage(1), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 });
  s.updateStage(1, { attempts: 1 });
  s.patch({ lastStage: 1 });
  assert.equal(s.getStage(1).attempts, 1);
  assert.equal(s.get().lastStage, 1);
}

test('V3-SAVE: 새 저장 → 기본값·진행 가능·ok=true', () => {
  const st = memStorage();
  const s = createSave3(st);
  runsFine(s);
  assert.equal(s.ok, true);
  assert.equal(JSON.parse(st.getItem(KEY3)).stages['1'].attempts, 1);
  assert.equal(st.getItem(BAK3), null, '정상 원문은 bak 없음');
  assert.equal(st.getItem('starforgeRush.v1'), null, 'v1 키는 건드리지 않음');
});

test('V3-SAVE: 손상 원문 "abc" → bak 보존 후 기본값', () => {
  const st = memStorage({ [KEY3]: 'abc' });
  const s = createSave3(st);
  runsFine(s);
  assert.equal(st.getItem(BAK3), 'abc');
  assert.equal(s.ok, true);
});

test('V3-SAVE: 구버전 {v:1,best:3} → bak 보존 후 기본값(best 무시)', () => {
  const raw = JSON.stringify({ v: 1, best: 3 });
  const st = memStorage({ [KEY3]: raw });
  const s = createSave3(st);
  runsFine(s);
  assert.equal(st.getItem(BAK3), raw);
  assert.equal(s.get().best, undefined);
});

test('V3-SAVE: {v:3,stages:null} → bak 보존 후 기본값', () => {
  const raw = JSON.stringify({ v: 3, stages: null });
  const st = memStorage({ [KEY3]: raw });
  const s = createSave3(st);
  runsFine(s);
  assert.equal(st.getItem(BAK3), raw);
});

test('V3-SAVE: {v:3,stages:{1:{attempts:"x"}}} → 필드 타입 강제(Number.isFinite)', () => {
  const st = memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: { 1: { attempts: 'x', cleared: 'yes', bestTime: Infinity } } }) });
  const s = createSave3(st);
  assert.deepEqual(s.getStage(1), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 });
  assert.equal(st.getItem(BAK3), null, '형식은 맞으니 bak 없음');
  runsFine(s);
});

test('V3-SAVE: setItem 예외 → 메모리로 계속 진행, ok=false', () => {
  const st = memStorage();
  st.setItem = () => { throw new Error('QuotaExceeded'); };
  const s = createSave3(st);
  assert.equal(s.ok, true, '읽기는 성공');
  runsFine(s);
  assert.equal(s.ok, false);
  assert.equal(s.getStage(1).attempts, 1, '메모리 상태는 유지');
  s.updateStage(1, { cleared: true, bestSurvivors: 7 });
  assert.equal(s.getStage(1).cleared, true);
});

test('V3-SAVE: getItem 자체가 throw 하는 storage → 기본값·ok=false·진행 가능', () => {
  const st = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {}, removeItem: () => {} };
  const s = createSave3(st);
  assert.equal(s.ok, false);
  runsFine(s);
});

test('V3-SAVE: updateStage 깊은 병합 — 다른 스테이지·다른 필드를 지우지 않음', () => {
  const st = memStorage();
  const s = createSave3(st);
  s.updateStage(1, { cleared: true, bestSurvivors: 12, bestTime: 40.5 });
  s.updateStage(2, { attempts: 3 });
  s.updateStage(1, { attempts: 5 });
  assert.deepEqual(s.getStage(1), { cleared: true, attempts: 5, bestSurvivors: 12, bestTime: 40.5 });
  assert.deepEqual(s.getStage(2), { cleared: false, attempts: 3, bestSurvivors: 0, bestTime: 0 });
  s.patch({ volume: 0.3, mute: true, stages: { 2: { cleared: true } } });
  assert.equal(s.get().volume, 0.3);
  assert.equal(s.get().mute, true);
  assert.deepEqual(s.getStage(2), { cleared: true, attempts: 3, bestSurvivors: 0, bestTime: 0 });
  assert.deepEqual(s.getStage(1), { cleared: true, attempts: 5, bestSurvivors: 12, bestTime: 40.5 });
  //  재로드 후에도 동일
  const s2 = createSave3(st);
  assert.deepEqual(s2.getStage(1), { cleared: true, attempts: 5, bestSurvivors: 12, bestTime: 40.5 });
  assert.equal(s2.get().v, 3);
});

test('V3-SAVE: storage 미주입(Node) → 메모리 저장으로 진행', () => {
  const s = createSave3();
  runsFine(s);
});

test('V3-SPRITES: 키 목록 11개 고정·Node 에서 loadSprites3 는 전부 null 폴백', async () => {
  assert.deepEqual(Object.keys(SPRITE_KEYS3), ['m1', 'soldier', 'supply', 'gate', 'bg1', 'bg2', 'bg3', 'e_grunt', 'e_rusher', 'e_shooter', 'elite']);
  assert.equal(SPRITE_KEYS3.m1, 'M01');
  assert.equal(SPRITE_KEYS3.elite, 'B1_grader');
  const sp = await loadSprites3('assets/rush/');
  assert.equal(sp.get('m1'), null);
  assert.equal(sp.ready.size, 0);
});

test('V3-AUDIO: Node 에서 createAudio3 는 예외 없이 no-op, 이름 목록 고정', () => {
  const need = ['fire_rifle', 'fire_auto', 'fire_heavy', 'crateHit', 'crateBreak', 'gateTick', 'gateFlip', 'joinMany', 'weaponSwap', 'hurt', 'kill', 'elite', 'win', 'lose', 'click'];
  for (const n of need) assert.ok(SFX_NAMES3.includes(n), n);
  const a = createAudio3({ dir: 'assets/sound/' });
  a.unlock();
  assert.equal(a.sfx('fire_rifle', { vol: 0.5 }), false, 'Audio 없으면 재생 안 함');
  assert.equal(a.sfx('nope'), false);
  a.bgmPlay('nf_bgm_battle1'); a.bgmPause(); a.bgmResume(); a.duck(0.5);
  a.setVolume(0.7); assert.equal(a.getVolume(), 0.7);
  a.setMuted(true); assert.equal(a.isMuted(), true);
  for (const k of ['unlock', 'sfx', 'bgmPlay', 'bgmPause', 'bgmResume', 'setVolume', 'getVolume', 'setMuted', 'isMuted', 'duck']) assert.equal(typeof a[k], 'function', k);
});

//  ---- 가짜 Audio 로 풀 재사용·음량 상한·스로틀·동시 상한을 실제 호출로 검증 ----
//  브라우저 HTMLAudioElement 흉내: paused/ended/volume/src/play()→Promise/addEventListener('ended')
class FakeAudio {
  constructor() {
    this.paused = true; this.ended = false; this.volume = 1; this.loop = false; this.currentTime = 0;
    this._src = ''; this._l = {}; FakeAudio.created.push(this);
  }
  get src() { return this._src; }
  //  src 재설정 = 이전 재생 중단(브라우저의 AbortError 상황)
  set src(v) { this._src = v; this.paused = true; this.ended = false; }
  addEventListener(ev, fn) { (this._l[ev] ??= []).push(fn); }
  play() { this.paused = false; this.ended = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  //  재생 종료를 흉내(ended 이벤트 발화)
  end() { if (this.paused && !this.ended) return; this.paused = true; this.ended = true; for (const f of this._l.ended ?? []) f(); }
}
FakeAudio.created = [];

//  가짜 Audio + 가짜 시계를 주입하고 fn 실행, 끝나면 반드시 복원
function withFakeAudio(fn) {
  const perf = globalThis.performance;
  const origNow = perf && Object.getOwnPropertyDescriptor(perf, 'now');
  let t = 1000;
  const clock = { now: () => t, tick: (ms) => { t += ms; } };
  FakeAudio.created = [];
  globalThis.Audio = FakeAudio;
  perf.now = () => clock.now();
  try { fn(clock); }
  finally {
    delete globalThis.Audio;
    if (origNow) Object.defineProperty(perf, 'now', origNow); else delete perf.now;
  }
}

//  bgm 용 첫 객체를 뺀, sfx 풀에 생성된 객체만
const sfxCreated = () => FakeAudio.created.filter((a) => !a.loop);

test('V3-AUDIO: 같은 이름 연속 2회 → 두 번째는 스로틀로 false, 시각 진행 후 true', () => withFakeAudio((clock) => {
  const a = createAudio3({ dir: 'assets/sound/' });
  assert.equal(a.sfx('fire_rifle'), false, 'unlock 전엔 재생 안 함');
  a.unlock();
  assert.equal(a.sfx('fire_rifle'), true);
  assert.equal(a.sfx('fire_rifle'), false, '0.045초 안 두 번째는 막힘');
  clock.tick(30);
  assert.equal(a.sfx('fire_rifle'), false, '30ms 뒤에도 막힘');
  clock.tick(20);
  assert.equal(a.sfx('fire_rifle'), true, '50ms 누적이면 통과');
  //  이름이 다르면 서로 스로틀 안 걸림
  assert.equal(a.sfx('fire_auto'), true);
  //  throttle 옵션 덮어쓰기(0 = 스로틀 없음)
  assert.equal(a.sfx('click', { throttle: 0 }), true);
  assert.equal(a.sfx('click', { throttle: 0 }), true);
}));

test('V3-AUDIO: vol 5 → element.volume ≤ 1, 기본 음량과 동일(클램프)·volMult 반영', () => withFakeAudio((clock) => {
  const a = createAudio3({ dir: 'assets/sound/' });
  a.unlock();
  assert.equal(a.sfx('gateTick', { vol: 1 }), true);
  const base = sfxCreated().at(-1).volume;
  assert.ok(base > 0 && base <= 1, '기본 음량 0~1');
  clock.tick(100);
  assert.equal(a.sfx('gateTick', { vol: 5 }), true);
  const el = sfxCreated().at(-1);
  assert.ok(el.volume <= 1, 'vol 5 여도 1 을 넘지 않음');
  assert.equal(el.volume, base, 'vol 은 1 로 클램프 → VOL[name]*volMult 와 동일');
  //  setVolume 배율 반영
  a.setVolume(0.5);
  clock.tick(100);
  assert.equal(a.sfx('gateTick', { vol: 5 }), true);
  assert.ok(Math.abs(sfxCreated().at(-1).volume - base * 0.5) < 1e-9, 'volMult 0.5 배');
  //  vol 음수 → 0
  clock.tick(100);
  assert.equal(a.sfx('gateTick', { vol: -3 }), true);
  assert.equal(sfxCreated().at(-1).volume, 0);
}));

test('V3-AUDIO: 서로 다른 이름 13개 → 12개만 true(동시 상한), 전부 ended 후 다시 true', () => withFakeAudio((clock) => {
  const a = createAudio3({ dir: 'assets/sound/' });
  a.unlock();
  const names = SFX_NAMES3.slice(0, 13);
  assert.equal(names.length, 13);
  const results = names.map((n) => a.sfx(n));
  assert.equal(results.filter(Boolean).length, 12, '12개만 재생');
  assert.equal(results[12], false, '13번째는 상한에 막힘');
  clock.tick(100);
  assert.equal(a.sfx(names[12]), false, '시간이 지나도 상한은 그대로');
  //  전부 종료 → 카운터 감소 → 다시 재생 가능
  for (const el of sfxCreated()) el.end();
  clock.tick(100);
  assert.equal(a.sfx(names[12]), true);
  assert.equal(a.sfx(names[0]), true);
}));

test('V3-AUDIO: 같은 이름 6회(스로틀 간격) → Audio 객체 4개(풀), 재사용 시 src 가 새 파일·상한 안 막힘', () => withFakeAudio((clock) => {
  const a = createAudio3({ dir: 'assets/sound/' });
  a.unlock();
  const srcs = [];
  for (let i = 0; i < 6; i++) {
    assert.equal(a.sfx('fire_rifle'), true, `${i + 1}번째`);
    srcs.push(sfxCreated().map((el) => el.src));
    clock.tick(100);
  }
  const pool = sfxCreated();
  assert.equal(pool.length, 4, '이름별 풀은 4개까지만 생성');
  //  5번째 호출은 첫 객체를 재사용하며 라운드로빈으로 파일이 바뀐다(vulcan_1 → vulcan_2)
  assert.equal(srcs[0][0], 'assets/sound/nf_sfx_vulcan_1.ogg');
  assert.equal(srcs[4][0], 'assets/sound/nf_sfx_vulcan_2.ogg');
  assert.equal(srcs[5][1], 'assets/sound/nf_sfx_vulcan_3.ogg');
  assert.equal(pool[0].src, srcs[4][0]);
  assert.equal(pool[0].paused, false, '재사용 객체는 재생 중');
  //  ended 없이 재사용만 반복해도 카운터가 4를 넘지 않아 다른 음이 막히지 않는다
  for (let i = 0; i < 20; i++) { assert.equal(a.sfx('fire_rifle'), true); clock.tick(100); }
  assert.equal(sfxCreated().length, 4);
  assert.equal(a.sfx('kill'), true, '동시 상한 12 미만이라 다른 음도 재생');
}));
