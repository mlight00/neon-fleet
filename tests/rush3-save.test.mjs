// rush3-save — 계약서 8장 V3-SAVE + 자산 모듈 Node 스모크
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createSave3, KEY3, BAK3, recordKey, BASE_DIFFICULTY } from '../rush3/save.js';
import { STAGE_IDS, buildStage, stageVersion } from '../rush3/stages.js';
import { createRun } from '../rush3/combat.js';
import { SPRITE_KEYS3, loadSprites3 } from '../rush3/sprites.js';
import { createAudio3, SFX_NAMES3, SFX_FILES3 } from '../rush3/audio.js';

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
  assert.equal(JSON.parse(st.getItem(KEY3)).stages['1'].versions['1'].attempts, 1, '기록은 stageId + 코스 버전으로 저장');
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

test('V3-SAVE-VERSION: 구 저장(stages[id] 에 바로 기록) → 버전 1 로 귀속, 데이터 보존(삭제 없음)', () => {
  const raw = JSON.stringify({ v: 3, stages: { 1: { cleared: true, attempts: 4, bestSurvivors: 12, bestTime: 41.2 }, 2: { attempts: 2 } },
    lastStage: 1, volume: 0.5, mute: true });
  const st = memStorage({ [KEY3]: raw });
  const s = createSave3(st);
  assert.equal(st.getItem(BAK3), null, '형식이 맞으므로 bak 없음(구 기록을 버리지 않는다)');
  const rec1 = { cleared: true, attempts: 4, bestSurvivors: 12, bestTime: 41.2 };
  assert.deepEqual(s.getStage(1, 1), rec1);
  assert.deepEqual(s.getStage(1), rec1, '버전을 생략하면 1');
  assert.deepEqual(s.getStageVersions(1), { 1: rec1 });
  assert.deepEqual(s.getStage(2, 1), { cleared: false, attempts: 2, bestSurvivors: 0, bestTime: 0 });
  assert.deepEqual(s.getStage(1, 2), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 }, '새 코스 버전은 빈 기록에서 시작');
  assert.equal(s.get().volume, 0.5);
  assert.equal(s.get().mute, true);
  //  저장 원문도 versions 형식으로 옮겨 적힌다(옛 값 그대로)
  s.patch({ lastStage: 2 });
  assert.deepEqual(JSON.parse(st.getItem(KEY3)).stages['1'], { versions: { 1: rec1 } });
});

test('V3-SAVE-VERSION: v2 기록은 v1 최고 기록을 덮지 않는다(신기록 비교는 같은 버전 안에서만)', () => {
  const st = memStorage();
  const s = createSave3(st);
  s.updateStage(3, { attempts: 1 }, 1);
  s.updateStage(3, { cleared: true, bestSurvivors: 30, bestTime: 60.5 }, 1);
  //  코스 개정 뒤 같은 스테이지를 v2 로 도전 — 더 나쁜 기록이라도 v1 을 건드리지 않는다
  s.updateStage(3, { attempts: 1 }, 2);
  s.updateStage(3, { cleared: true, bestSurvivors: 8, bestTime: 90.0 }, 2);
  assert.deepEqual(s.getStage(3, 1), { cleared: true, attempts: 1, bestSurvivors: 30, bestTime: 60.5 });
  assert.deepEqual(s.getStage(3, 2), { cleared: true, attempts: 1, bestSurvivors: 8, bestTime: 90 });
  //  v1 의 신기록도 v2 와 무관하게 갱신된다
  s.updateStage(3, { bestSurvivors: 33 }, 1);
  assert.equal(s.getStage(3, 1).bestSurvivors, 33);
  assert.equal(s.getStage(3, 2).bestSurvivors, 8);
  assert.deepEqual(Object.keys(s.getStageVersions(3)), ['1', '2']);
  //  재로드 후에도 동일
  const s2 = createSave3(st);
  assert.deepEqual(s2.getStage(3, 1), { cleared: true, attempts: 1, bestSurvivors: 33, bestTime: 60.5 });
  assert.deepEqual(s2.getStage(3, 2), { cleared: true, attempts: 1, bestSurvivors: 8, bestTime: 90 });
});

test('V3-SAVE-VERSION: 셸 경로 — buildStage 의 version 이 그대로 기록 버전이 된다', () => {
  for (const id of STAGE_IDS) {
    const stage = buildStage(id);
    const run = createRun(stage);
    assert.equal(run.stageVersion, stageVersion(id), 'stages.js 의 version 을 읽어 쓴다');
    const s = createSave3(memStorage());
    s.updateStage(id, { attempts: 1, cleared: true, bestSurvivors: 5 }, run.stageVersion);
    assert.equal(s.getStage(id, stageVersion(id)).bestSurvivors, 5);
    assert.deepEqual(Object.keys(s.getStageVersions(id)), [String(stageVersion(id))]);
  }
});

test('V3-SAVE-VERSION: 손상 케이스 — versions 가 객체가 아니거나 버전 키가 이상해도 진행 가능', () => {
  const st = memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: { 1: { versions: 'x' }, 2: { versions: { abc: { attempts: 3 } } },
    3: { versions: { 2: { attempts: 'x', bestTime: Infinity } } } } }) });
  const s = createSave3(st);
  assert.equal(st.getItem(BAK3), null, '최상위 형식은 맞으니 bak 없음');
  assert.deepEqual(s.getStage(1), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 });
  assert.deepEqual(s.getStage(2, 1), { cleared: false, attempts: 3, bestSurvivors: 0, bestTime: 0 }, '이상한 버전 키는 1 로 본다');
  assert.deepEqual(s.getStage(3, 2), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 }, '숫자 필드는 Number.isFinite 강제');
  runsFine(s);
});

test('V3-SAVE-VERSION: 손상 케이스 — 잡키가 실재하는 버전 1 기록을 덮지 않는다(무음 손실 금지)', () => {
  const rec1 = { cleared: true, attempts: 9, bestSurvivors: 99, bestTime: 12.5 };
  const old2 = { cleared: true, attempts: 4, bestSurvivors: 12, bestTime: 41.2 };
  const st = memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: {
    //  진짜 v1 기록 + 잡키가 함께 있는 칸(잡키도 verKey 로는 '1' 이 된다)
    1: { versions: { 1: rec1, abc: { attempts: 0, bestSurvivors: 1 } } },
    //  구 저장의 옛 필드 + 잡키 — 옛 필드가 버전 1 이고 잡키는 그것을 못 덮는다
    2: { ...old2, versions: { abc: { attempts: 0 } } },
    //  잡키만 있으면 종전대로 버전 1 로 귀속(기존 동작 유지)
    3: { versions: { xyz: { attempts: 3 } } },
  } }) });
  const s = createSave3(st);
  assert.equal(st.getItem(BAK3), null, '최상위 형식은 맞으니 bak 없음(기존 저장 삭제 금지)');
  assert.deepEqual(s.getStage(1, 1), rec1, '잡키가 진짜 v1 기록을 지우면 안 된다');
  assert.deepEqual(s.getStageVersions(1), { 1: rec1 });
  assert.deepEqual(s.getStage(2, 1), old2, '구 저장의 옛 필드가 버전 1 로 살아남는다');
  assert.deepEqual(s.getStage(3, 1), { cleared: false, attempts: 3, bestSurvivors: 0, bestTime: 0 }, '잡키만 있으면 1 로 본다');
  //  저장 원문에 다시 적힐 때도 보존된다
  s.patch({ lastStage: 1 });
  assert.deepEqual(JSON.parse(st.getItem(KEY3)).stages['1'], { versions: { 1: rec1 } });
  //  갱신 경로(updateStage)도 잡키 때문에 옛 기록을 잃지 않는다
  s.updateStage(1, { attempts: 10 }, 1);
  assert.deepEqual(s.getStage(1, 1), { ...rec1, attempts: 10 });
  //  재로드해도 그대로(진행 가능)
  const s2 = createSave3(st);
  assert.equal(s2.get().v, 3);
  assert.equal(s2.get().lastStage, 1);
  assert.deepEqual(s2.getStage(1, 1), { ...rec1, attempts: 10 });
  assert.deepEqual(s2.getStage(2, 1), old2);
});

test('V3-SAVE-VERSION: 손상 케이스 — 정규 키 1 자리가 비객체·빈 객체·null 이어도 옛 필드가 버전 1 로 귀속된다(무음 손실 금지)', () => {
  const old = { cleared: true, attempts: 5, bestSurvivors: 9, bestTime: 40 };
  for (const bad of ['junk', {}, null, 3]) {
    const st = memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: { 1: { ...old, versions: { 1: bad } } } }) });
    const s = createSave3(st);
    assert.deepEqual(s.getStage(1, 1), old, '1 자리 ' + JSON.stringify(bad) + ' 은 빈 칸으로 보고 옛 필드를 살린다');
    assert.equal(st.getItem(BAK3), null);
  }
  //  잡키가 옛 필드보다 먼저 와도, 정규 칸이 손상돼도 잡키가 옛 기록을 덮지 않는다
  const st = memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: { 1: { versions: { x: { attempts: 7 }, 1: 'junk' }, ...old } } }) });
  assert.deepEqual(createSave3(st).getStage(1, 1), old);
});

test('V3-SAVE-VERSION: 잡키가 원문에서 앞에 와도 결과가 같다(키 순서 무관)', () => {
  const rec = { cleared: true, attempts: 7, bestSurvivors: 55, bestTime: 33.3 };
  //  JSON 원문에서 잡키를 먼저 적어도 정규 키가 이긴다
  const raw = '{"v":3,"stages":{"1":{"versions":{"abc":{"attempts":0},"1":' + JSON.stringify(rec) + '}}}}';
  const s = createSave3(memStorage({ [KEY3]: raw }));
  assert.deepEqual(s.getStage(1, 1), rec);
  //  잡키가 비어 있는 다른 버전 칸을 침범하지도 않는다
  assert.deepEqual(Object.keys(s.getStageVersions(1)), ['1']);
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
  const need = ['fire_rifle', 'fire_auto', 'fire_heavy', 'crateHit', 'crateBreak', 'gateTick', 'gateFlip', 'joinMany', 'weaponSwap', 'hurt', 'kill', 'elite', 'win', 'lose', 'click',
    //  2026-09-17 2차 검수: 셔터에 막힌 탄(금속 튕김) · 랜덤 길 위험 공개(중립 경고음) — 색·이름만이 아니라 소리로도 구분한다
    'gateOpen', 'gateClang', 'lotWarn'];
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

test('V3-AUDIO: 풀은 이름·파일별 4개까지, src 는 생성 때 고정(재생마다 재요청 없음), 재사용 반복해도 상한이 막히지 않는다', () => withFakeAudio((clock) => {
  const a = createAudio3({ dir: 'assets/sound/' });
  a.unlock();
  //  fire_rifle 은 파일 3종 라운드로빈 → 6회면 파일마다 2개씩 6개
  for (let i = 0; i < 6; i++) { assert.equal(a.sfx('fire_rifle'), true, `${i + 1}번째`); clock.tick(100); }
  const six = sfxCreated();
  assert.equal(six.length, 6);
  assert.deepEqual(six.slice(0, 3).map((el) => el.src),
    ['assets/sound/nf_sfx_vulcan_1.ogg', 'assets/sound/nf_sfx_vulcan_2.ogg', 'assets/sound/nf_sfx_vulcan_3.ogg']);
  assert.equal(six[3].src, six[0].src, '4번째는 다시 1번 파일의 새 객체');
  //  이름당 총 4개를 파일 3종이 나눠 갖는다(파일당 ceil(4/3)=2 → 6개). 그 뒤는 재사용 — 객체 수 불변, src 불변
  for (let i = 6; i < 30; i++) { assert.equal(a.sfx('fire_rifle'), true); clock.tick(100); }
  const pool = sfxCreated();
  assert.equal(pool.length, 6, '파일당 2개 × 파일 3종');
  assert.deepEqual(pool.map((el) => el.src), six.map((el) => el.src), '재사용 객체의 src 는 생성 때 그대로');
  assert.equal(pool[0].paused, false, '재사용 객체는 재생 중');
  assert.equal(a.sfx('kill'), true, '동시 상한 12 미만이라 다른 음도 재생');
}));

// ─────────────────────────────────────────────────────────────────────────────
// V3-SAVE-VERSION 난이도(계약서 7장·3-8): 기록 칸 키 `${version}`(normal) | `${version}:${difficulty}`
// ─────────────────────────────────────────────────────────────────────────────
test('V3-SAVE-VERSION DIFF: recordKey — normal 은 접미 없음(옛 칸 그대로), 그 밖은 version:difficulty, 버전은 1 이상 정수로 정규화', () => {
  assert.equal(BASE_DIFFICULTY, 'normal');
  assert.equal(recordKey(2), '2');
  assert.equal(recordKey(2, 'normal'), '2');
  assert.equal(recordKey(2, null), '2');
  assert.equal(recordKey(2, undefined), '2');
  assert.equal(recordKey(2, 'hard'), '2:hard');
  assert.equal(recordKey('2', 'brutal'), '2:brutal');
  assert.equal(recordKey(undefined, 'hard'), '1:hard');
  assert.equal(recordKey(0, 'hard'), '1:hard');
  assert.equal(recordKey('x'), '1');
  assert.equal(recordKey(2.7, 'hard'), '2:hard');
});

test('V3-SAVE-VERSION DIFF: 난이도별 기록 분리 — hard/brutal 기록이 normal 칸을 덮지 않고 재로드 뒤에도 칸이 유지된다(신기록 비교는 같은 난이도 안에서만)', () => {
  const st = memStorage();
  const s = createSave3(st);
  s.updateStage(2, { attempts: 1 }, 2);
  s.updateStage(2, { cleared: true, bestSurvivors: 30, bestTime: 50 }, 2);
  s.updateStage(2, { attempts: 1 }, 2, 'hard');
  s.updateStage(2, { cleared: true, bestSurvivors: 8, bestTime: 70 }, 2, 'hard');
  s.updateStage(2, { attempts: 2 }, 2, 'brutal');
  const normal = { cleared: true, attempts: 1, bestSurvivors: 30, bestTime: 50 };
  const hard = { cleared: true, attempts: 1, bestSurvivors: 8, bestTime: 70 };
  const brutal = { cleared: false, attempts: 2, bestSurvivors: 0, bestTime: 0 };
  const check = (sv) => {
    assert.deepEqual(sv.getStage(2, 2), normal);
    assert.deepEqual(sv.getStage(2, 2, 'normal'), normal, "'normal' 을 명시해도 같은 칸");
    assert.deepEqual(sv.getStage(2, 2, 'hard'), hard);
    assert.deepEqual(sv.getStage(2, 2, 'brutal'), brutal);
    assert.deepEqual(sv.getStage(2, 1, 'hard'), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 }, '다른 버전의 hard 는 빈 칸');
    assert.deepEqual(Object.keys(sv.getStageVersions(2)).sort(), ['2', '2:brutal', '2:hard']);
  };
  check(s);
  //  원문 키도 그대로
  assert.deepEqual(Object.keys(JSON.parse(st.getItem(KEY3)).stages['2'].versions).sort(), ['2', '2:brutal', '2:hard']);
  const s2 = createSave3(st);
  check(s2);
  assert.equal(st.getItem(BAK3), null);
  //  hard 의 신기록은 normal 을 건드리지 않고, normal 의 갱신도 hard 를 건드리지 않는다
  s2.updateStage(2, { bestSurvivors: 40 }, 2, 'hard');
  assert.equal(s2.getStage(2, 2, 'hard').bestSurvivors, 40);
  assert.equal(s2.getStage(2, 2).bestSurvivors, 30);
  s2.updateStage(2, { bestSurvivors: 31 }, 2);
  assert.equal(s2.getStage(2, 2).bestSurvivors, 31);
  assert.equal(s2.getStage(2, 2, 'hard').bestSurvivors, 40);
  //  patch({stages}) 조각도 난이도 칸을 지킨다
  s2.patch({ stages: { 2: { versions: { '2:brutal': { cleared: true } } } } });
  assert.deepEqual(s2.getStage(2, 2, 'brutal'), { ...brutal, cleared: true });
  assert.equal(s2.getStage(2, 2, 'hard').bestSurvivors, 40);
});

test('V3-SAVE-VERSION DIFF: 옛 저장(난이도 없음)은 그대로 normal 칸 — 로드해도 키가 바뀌지 않고 hard 는 빈 기록에서 시작', () => {
  const rec = { cleared: true, attempts: 4, bestSurvivors: 12, bestTime: 41.2 };
  const raw = JSON.stringify({ v: 3, stages: { 1: { versions: { 2: rec } } }, lastStage: 1, volume: 0.5, mute: false });
  const st = memStorage({ [KEY3]: raw });
  const s = createSave3(st);
  assert.equal(st.getItem(BAK3), null);
  assert.deepEqual(s.getStage(1, 2), rec);
  assert.deepEqual(s.getStage(1, 2, 'hard'), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 });
  //  옛 저장에는 난이도 필드가 없다 → 초기 선택은 극한(2026-09-16 이사 결정). 기록 칸은 위에서 본 대로 normal 그대로다
  assert.equal(s.get().difficulty, 'brutal', '난이도 필드가 없던 저장의 초기 선택은 극한');
  s.patch({ lastStage: 1 });
  assert.deepEqual(JSON.parse(st.getItem(KEY3)).stages['1'], { versions: { 2: rec } }, '옛 칸 키 그대로');
});

test("V3-SAVE-VERSION DIFF: 손상 케이스 — ':normal' 접미는 접미 없는 칸으로 보되 찬 칸을 덮지 않는다 · 모르는 난이도 접미는 제 칸에 보존 · 대소문자·잡키는 1", () => {
  const recA = { cleared: true, attempts: 9, bestSurvivors: 99, bestTime: 12.5 };
  const recB = { cleared: false, attempts: 1, bestSurvivors: 1, bestTime: 1 };
  const recC = { cleared: true, attempts: 2, bestSurvivors: 7, bestTime: 80 };
  const recD = { cleared: true, attempts: 5, bestSurvivors: 3, bestTime: 90 };
  const st = memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: {
    1: { versions: { '2': recA, '2:normal': recB, '2:hard': recC, '2:nightmare': recD, 'abc': { attempts: 3 }, '2:Hard': { attempts: 8 } } },
    2: { versions: { '2:normal': recB } },
  } }) });
  const s = createSave3(st);
  assert.equal(st.getItem(BAK3), null, '최상위 형식은 맞으니 bak 없음');
  assert.deepEqual(s.getStage(1, 2), recA, "':normal' 이 실재하는 '2' 칸을 덮지 않는다");
  assert.deepEqual(s.getStage(1, 2, 'hard'), recC);
  assert.deepEqual(s.getStage(1, 2, 'nightmare'), recD, '모르는 난이도 접미도 실재 기록이므로 지우지 않는다');
  assert.deepEqual(s.getStage(1, 1), { cleared: false, attempts: 3, bestSurvivors: 0, bestTime: 0 }, "잡키('abc')는 1 로 본다");
  assert.deepEqual(Object.keys(s.getStageVersions(1)).sort(), ['1', '2', '2:hard', '2:nightmare']);
  assert.deepEqual(s.getStage(2, 2), recB, "'2' 칸이 비어 있으면 ':normal' 접미 기록이 그 칸이 된다");
  //  진행 가능: 갱신·최상위 패치가 예외 없이 되고 다른 칸을 건드리지 않는다
  s.updateStage(1, { attempts: 10 }, 2, 'hard');
  s.patch({ lastStage: 1 });
  assert.equal(s.getStage(1, 2, 'hard').attempts, 10);
  assert.deepEqual(s.getStage(1, 2), recA);
  assert.deepEqual(s.getStage(1, 2, 'nightmare'), recD);
  assert.equal(s.get().lastStage, 1);
});

test('V3-SAVE-VERSION DIFF: 마지막 난이도(difficulty) — 기본은 타이틀 초기 선택 brutal, patch 로 기억, 재로드 유지, 형식이 아니면 brutal', () => {
  const st = memStorage();
  const s = createSave3(st);
  //  기록 접미 규칙의 기준(BASE_DIFFICULTY='normal')과 타이틀 초기 선택은 다른 값이다(계약서 3-8·7)
  assert.equal(BASE_DIFFICULTY, 'normal');
  assert.equal(s.get().difficulty, 'brutal');
  s.patch({ difficulty: 'hard' });
  assert.equal(s.get().difficulty, 'hard');
  assert.equal(JSON.parse(st.getItem(KEY3)).difficulty, 'hard');
  assert.equal(createSave3(st).get().difficulty, 'hard');
  for (const bad of [5, null, '', {}]) {
    const s2 = createSave3(memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: {}, difficulty: bad }) }));
    assert.equal(s2.get().difficulty, 'brutal', JSON.stringify(bad));
  }
  //  save 는 난이도 id 를 판정하지 않는다(그건 셸 normDifficulty 의 몫) — 문자열이면 그대로 둔다
  assert.equal(createSave3(memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: {}, difficulty: 'zzz' }) })).get().difficulty, 'zzz');
});

test('V3-AUDIO: SFX 맵의 모든 이름이 실존 음원 파일로 간다(없는 파일을 적으면 소리가 조용히 사라진다)', () => {
  const dir = new URL('../assets/sound/', import.meta.url);
  for (const name of SFX_NAMES3) {
    const files = SFX_FILES3[name];
    assert.ok(Array.isArray(files) && files.length > 0, name + ': 파일 목록이 있어야 한다');
    for (const f of files) {
      assert.equal(existsSync(new URL(f + '.ogg', dir)), true, name + ' → ' + f + '.ogg 가 없다');
    }
  }
});

test('V3-SAVE: seenShutter — 새 저장은 false, true 로 저장되면 재로드 뒤에도 남는다(첫 셔터 안내는 사용자당 1회)', () => {
  const st = memStorage();
  const a = createSave3(st);
  assert.equal(a.get().seenShutter, false, '새 사용자는 셔터 안내를 본 적이 없다');
  a.patch({ seenShutter: true });
  assert.equal(a.get().seenShutter, true);
  assert.equal(createSave3(st).get().seenShutter, true, '재로드 뒤에도 남는다');
  //  다른 필드를 고쳐도 지워지지 않고, 형식이 아니면(문자열·숫자) false 로 본다
  a.patch({ volume: 0.5 });
  assert.equal(a.get().seenShutter, true);
  a.patch({ seenShutter: 'yes' });
  assert.equal(a.get().seenShutter, false);
  //  옛 저장(필드 없음)은 false — 그 사용자에게는 안내가 한 번 더 뜬다(없던 안내를 본 것으로 치지 않는다)
  const old = memStorage();
  old.setItem('starforgeRush.v3', JSON.stringify({ v: 3, stages: {}, volume: 1, mute: false }));
  assert.equal(createSave3(old).get().seenShutter, false);
});
