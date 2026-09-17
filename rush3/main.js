// rush3/main.js — 셸(계약서 6장). 규칙은 combat.js 가 전부 갖고 여기는 결선·연출·상태기계만.
//  ⚠️모듈 상단에서 DOM 을 만지지 않는다 — Node 테스트가 hitButton/makeLoop 를 그대로 import 한다.
//  rush/main.js 는 import 하지 않는다(자동 부트가 같은 캔버스에 붙는다). 골격(hitButton/toLogical/spawnBurst/
//  autoPause/오디오 unlock/ESC/음량 버튼/로드 후 루프 시작/#game3 가드)만 참고해 옮겨 적었다.
import { BAL3, DIFFICULTY_IDS, DEFAULT_PICK_DIFFICULTY } from './balance.js';
import { STAGE_IDS, buildStage, stageMeta, stageVersion } from './stages.js';
import { WEAPONS } from './weapons.js';
import { createRun, stepRun, drainEvents, STEP } from './combat.js';
import { createInput, isSteerKey } from './input.js';
import { createRenderer3 } from './render.js';
import { loadSprites3 } from './sprites.js';
import { createAudio3 } from './audio.js';
import { createSave3 } from './save.js';
import { adviceLine } from './advice.js';
import { hashSeed } from '../rush/rng.js';

const W = BAL3.view.w, H = BAL3.view.h, LINE_Y = BAL3.view.LINE_Y;
const FX = BAL3.fx;
const C = BAL3.colors;
//  판 종료 뒤 결과 화면까지의 여운(초)
const OVER_DELAY = { won: 1.3, lost: 1.0 };
const BGM = { title: 'nf_bgm_title', stage: ['nf_bgm_sector1a', 'nf_bgm_sector2a', 'nf_bgm_sector3a'], boss: ['nf_bgm_boss_sector1', 'nf_bgm_boss_sector2', 'nf_bgm_boss_sector3'] };
//  타이틀 난이도 토글(계약서 3-8·6장): 스테이지 버튼(y 436~) 바로 위 한 줄. 버튼 id = 'diff_' + 난이도 id
export const DIFF_TOGGLE = Object.freeze({ x0: 138, y: 382, w: 90, h: 34, gap: 6 });
//  키 1/2/3 = 보통/어려움/극한(타이틀에서만). code 가 비어 오는 환경은 key 로 대신하므로 둘 다 받는다
const DIFF_KEYS = Object.freeze({ Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2, 1: 0, 2: 1, 3: 2 });

//  저장값·외부 입력을 난이도 id 로 거른다(모르는 값 → normal). 규칙 모듈(buildStage/createRun)은 모르는 값에 throw 하므로 거르는 곳은 셸뿐이다
export function normDifficulty(d) {
  return DIFFICULTY_IDS.includes(d) ? d : DEFAULT_PICK_DIFFICULTY;
}

export function hitButton(buttons, x, y) {
  for (const b of buttons) if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  return null;
}

/** 고정 시간 누적기(계약서 6장 루프). now 는 초 단위로 주입.
 *  frame(now): run 상태면 acc = min(acc + dt, maxSteps·step) 뒤 step 만큼 onStep(step, i) 반복(프레임당 최대 maxSteps).
 *  start(now)/stop(now): 일시정지 진입·해제 = acc 0, last = now. run 상태가 아니면 frame 은 아무것도 갱신하지 않는다. */
export function makeLoop({ step = STEP, onStep, maxSteps = 5 } = {}) {
  let acc = 0, last = null, running = false;
  const EPS = 1e-9;
  return {
    start(now) { running = true; acc = 0; last = now; },
    stop(now) { running = false; acc = 0; last = now; },
    isRunning() { return running; },
    getAcc() { return acc; },
    frame(now) {
      if (!running) return 0;
      if (last === null) last = now;
      const dt = Math.max(0, now - last);
      last = now;
      acc = Math.min(acc + dt, maxSteps * step);
      let n = 0;
      while (acc + EPS >= step && n < maxSteps) {
        acc -= step;
        if (onStep) onStep(step, n);
        n++;
      }
      if (acc < EPS) acc = 0;
      return n;
    },
  };
}

/** 파편 폭발 — 각도는 카운터 기반(전역 난수 금지). big = 정예급. */
function spawnBurst(fx, x, y, r, big, color) {
  fx.burstSeed++;
  const n = big ? 16 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + fx.burstSeed * 0.7;
    const sp = (big ? 210 : 130) * (0.6 + ((i + fx.burstSeed) % 3) * 0.25);
    fx.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: big ? 0.7 : 0.42, r: big ? 7 : 4, big: !!big, color });
  }
  fx.parts.push({ x, y, vx: 0, vy: 0, t: 0, life: big ? 0.5 : 0.3, r: r * (big ? 1.6 : 1.2), flash: true, big: !!big });
}

//  게이트 피격 플래시(초): 규칙의 cell.flashT 는 감소되지 않으므로(계약서 4장 STEP 순서에 없음) 연출 타이머는 셸이 갖는다
const GATE_FLASH_SEC = BAL3.gate.flashT;

function makeFx() {
  //  gateFlash: { 'rowId:idx': 남은 초 } · gateOpen: { rowId: 남은 초 }(셔터가 걷히는 연출) — 렌더가 이것만 읽는다
  //  lotOpen = 랜덤 길 '?' 상자가 걷히는 연출 타이머 · lotSeen = 공개 효과음 1회 · lotSame = 랜덤 길 무기가 동급이라 교체 안 된 판
  return { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, burstSeed: 0, sfx: [], fireCount: 0, fireWeapon: null,
           lotOpen: 0, lotSeen: false, lotSame: false };
}

function floater(fx, x, y, text, color, big = false) {
  fx.floaters.push({ x, y, text, color, t: 0, life: 0.9, big });
}

//  실패 시 놓친 것 한 줄(계약서 6장). skipped(구조적으로 얻을 수 없던 대안)는 '놓침'이 아니므로 세지 않는다
export function missedLine(run) {
  const parts = [];
  if (run.missedSupplies > 0) parts.push('보급 통 ' + run.missedSupplies + '개를 놓침');
  if (run.badGatesPassed > 0) parts.push('−게이트 ' + run.badGatesPassed + '회 통과');
  if (run.lossByGate > 0) parts.push('게이트 손실 ' + run.lossByGate);
  if (run.lossByTouch > 0) parts.push('접촉 손실 ' + run.lossByTouch);
  if (run.lossByShot > 0) parts.push('피격 손실 ' + run.lossByShot);
  return parts.length ? parts.join(' · ') : '놓친 것 없음';
}

/** 결과 화면의 랜덤 길 한 줄(계약서 3-9·6장). 순수 함수 — run 상태와 stage.lottery 만 읽는다.
 *  고른 판(우측 통로) = 무엇이 걸렸고 어떻게 됐는지 · 안 고른 판 = 이번 판에 무엇이었는지 공개(놓친 보상을 감추지 않는다). */
export function lotteryLine(run, opts = {}) {
  const lot = run && run.lottery;
  if (!lot) return null;
  const chosen = ((run.wallSideLog || {})[lot.wallId] || null) === 'R';
  if (!chosen) {
    return lot.good ? '오른쪽 랜덤 길은 이번 판엔 ' + lot.label + ' 이었습니다'
                    : '오른쪽 랜덤 길은 이번 판엔 꽝(' + lot.label + ')이었습니다';
  }
  if (!lot.good) return '랜덤 길: 꽝 ' + lot.label;
  const s = lot.supplyId ? (run.supplies || []).find((c) => c.id === lot.supplyId) : null;
  if (s && !s.opened) return '랜덤 길: ' + lot.label + ' — 열지 못했습니다';
  if (opts.weaponSame) return '랜덤 길: ' + lot.label + ' — 이미 같은 무기였습니다';
  return '랜덤 길: ' + lot.label + ' 획득';
}

export function timeText(sec) {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return (m > 0 ? m + '분 ' : '') + s.toFixed(1) + '초';
}

export function boot(canvas, deps = {}) {
  const win = deps.win ?? (typeof window !== 'undefined' ? window : null);
  const doc = deps.doc ?? (typeof document !== 'undefined' ? document : null);
  const nowFn = deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  //  랜덤 길 시드용 벽시계(검사에서 고정할 수 있게 주입 가능). 게임 진행에는 쓰지 않는다
  const dateNow = deps.dateNow ?? (() => Date.now());
  const raf = deps.raf ?? ((fn) => (win && win.requestAnimationFrame ? win.requestAnimationFrame(fn) : setTimeout(() => fn(nowFn()), 16)));
  const save = deps.save ?? createSave3(deps.storage);
  const au = deps.audio ?? createAudio3({});
  const input = deps.input ?? createInput();
  au.setMuted(!!save.get().mute);
  au.setVolume(save.get().volume ?? 1);

  const ctx = canvas.getContext('2d');
  let state = 'title', run = null, renderer = null, buttons = [], fx = makeFx();
  //  overT: 판 종료 뒤 결과 화면까지 남은 여운(초). -1 = 아직 종료를 보지 못함
  let overT = -1, result = null;
  //  타이틀에서 고른 난이도(저장에 기억). 출격 때 buildStage 에 넘기고, 그 뒤로는 run.difficulty 가 진실
  let difficulty = normDifficulty(save.get().difficulty);
  function setDifficulty(d) {
    const nd = normDifficulty(d);
    if (nd === difficulty) return false;
    difficulty = nd;
    save.patch({ difficulty: nd });
    return true;
  }
  const loop = makeLoop({ step: STEP, onStep: () => { stepRun(run, input.snapshot(), STEP); } });

  //  DPR 반영: 백킹스토어 = CSS 크기 × min(devicePixelRatio, 2)
  function fitCanvas() {
    const dpr = Math.min(win && win.devicePixelRatio ? win.devicePixelRatio : 1, BAL3.view.dprMax);
    const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: W, height: H };
    const cw = Math.max(1, Math.round((r.width || W) * dpr)), ch = Math.max(1, Math.round((r.height || H) * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.setTransform(cw / W, 0, 0, ch / H, 0, 0);
  }

  function nowSec() { return nowFn() / 1000; }
  function sy(z) { return LINE_Y - (z - run.z); }
  //  저장의 lastStage 는 형식만 검사되므로(문자열·범위 밖 숫자 가능) 실제 스테이지 id 로만 쓴다
  function lastStageId() {
    const id = save.get().lastStage;
    return STAGE_IDS.includes(id) ? id : STAGE_IDS[0];
  }

  function startRun(id) {
    //  랜덤 길 시드는 **판마다** 다르다(계약서 3-9 = '재도전 동일 배치' 원칙의 명시적 예외).
    //   시계는 셸에만 둔다 — 규칙 계층(stages.buildStage)은 인자로 받은 시드로 mulberry32 를 한 번 돌릴 뿐이다.
    const tries = save.getStage(id, stageVersion(id), difficulty).attempts || 0;
    const lotterySeed = hashSeed('lot:' + id + ':' + tries + ':' + dateNow());
    const stage = buildStage(id, { difficulty, lotterySeed });
    run = createRun(stage);
    //  기록은 stageId + 코스 버전 + 난이도로 묶는다(run.stageVersion = stage.version, run.difficulty = stage.difficulty)
    const ver = run.stageVersion, diff = run.difficulty;
    fx = makeFx();
    result = null;
    overT = -1;
    input.reset();
    //  첫 플레이 안내: 지금까지 출격 기록이 없을 때 3초
    const total = STAGE_IDS.reduce((n, s) => n + totalAttempts(s), 0);
    fx.guideT = total === 0 ? FX.guideSec : 0;
    save.updateStage(id, { attempts: (save.getStage(id, ver, diff).attempts || 0) + 1 }, ver, diff);
    save.patch({ lastStage: id });
    state = 'run';
    loop.start(nowSec());
    au.bgmPlay(BGM.stage[Math.max(0, Math.min(2, id - 1))]);
  }

  function pause() {
    if (state !== 'run') return;
    state = 'paused';
    loop.stop(nowSec());
    input.reset();
    au.bgmPause();
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'run';
    loop.start(nowSec());
    au.bgmResume();
  }
  function toTitle() {
    state = 'title';
    loop.stop(nowSec());
    run = null;
    au.bgmPlay(BGM.title);
  }

  //  어느 버전·난이도로 몇 번 도전했는지(첫 플레이 안내 판정용 — 코스 버전이 올라가거나 난이도를 바꿔도 초보 안내가 되살아나지 않게)
  function totalAttempts(id) {
    return Object.values(save.getStageVersions(id)).reduce((n, r) => n + (r.attempts || 0), 0);
  }

  //  결과 확정 + 저장(attempts 는 출격 때, cleared/best 는 여기서). 신기록 비교는 같은 코스 버전·같은 난이도 안에서만
  function finishRun() {
    const id = run.stageId, ver = run.stageVersion, diff = run.difficulty;
    const cur = save.getStage(id, ver, diff);
    const won = !!run.won;
    const survivors = run.units.length;
    const time = won ? run.wonAt ?? run.time : run.time;
    //  best = 성공 판의 최다 생존·최단 시간(각각 독립)
    const isBest = won && survivors > (cur.bestSurvivors || 0);
    const patch = { cleared: cur.cleared || won };
    if (won) {
      patch.bestSurvivors = Math.max(cur.bestSurvivors || 0, survivors);
      patch.bestTime = cur.bestTime > 0 ? Math.min(cur.bestTime, time) : time;
    }
    save.updateStage(id, patch, ver, diff);
    result = {
      stageId: id, stageVersion: ver, difficulty: diff, title: run.title, won, survivors, peak: run.peak, time, timeText: timeText(time), kills: run.kills,
      missedLine: missedLine(run), advice: adviceLine(run, run), lottery: lotteryLine(run, { weaponSame: fx.lotSame }), isBest, saveOk: save.ok,
      nextId: won && STAGE_IDS.includes(id + 1) ? id + 1 : null,
    };
    state = 'result';
    loop.stop(nowSec());
    au.bgmPlay(BGM.title);
  }

  //  연출 이벤트 소비(프레임 1회, drainEvents). 규칙 상태는 읽기만 한다
  function handleEvents(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'fire': fx.fireCount += ev.count; fx.fireWeapon = ev.weapon; break;
        case 'supplyHit': fx.sfx.push(['crateHit']); break;
        case 'supplyOpen': {
          const y = sy(ev.z);
          spawnBurst(fx, ev.x, y, 30, false, C.gold);
          fx.sfx.push(['crateBreak']);
          const s = run.supplies.find((c) => c.id === ev.id);
          const text = !s ? '보급' : s.kind === 'soldier' ? '+' + (s.payload.n ?? 0) + '명' : s.kind === 'weapon' ? (WEAPONS[s.payload.weapon]?.name ?? '무기') : '증원 설비';
          fx.pops.push({ x: ev.x, y, x0: ev.x, y0: y, t: 0, life: FX.rewardPopSec + 0.3, text, color: C.gold });
          break;
        }
        case 'supplyMissed': floater(fx, ev.x, sy(ev.z) - 20, '놓침', C.gateZero); break;
        //  구조적으로 얻을 수 없던 대안 — '놓침'이 아니라 '다른 길'로 알린다(흐려지며 뒤로 빠진다)
        case 'supplySkipped': floater(fx, ev.x, sy(ev.z) - 20, '다른 길', C.wall); break;
        case 'supplyBlock': break;
        //  셔터 열림: 0.25초 걷히는 연출 + 효과음 1회. 막힌 탄은 회색 튐(소리 없음)
        case 'gateArm': fx.gateOpen[ev.id] = BAL3.gate.openT; fx.sfx.push(['gateOpen']); break;
        case 'gateBlock': spawnBurst(fx, ev.x, sy(ev.z), 6, false, C.wall); break;
        case 'gateHit': fx.gateFlash[ev.id + ':' + ev.idx] = GATE_FLASH_SEC; fx.sfx.push(['gateTick']); break;
        case 'gateFlip': fx.gateFlash[ev.id + ':' + ev.idx] = GATE_FLASH_SEC; fx.sfx.push(['gateFlip']); floater(fx, ev.x, sy(run.gateRows.find((r) => r.id === ev.id)?.z ?? run.z) - 40, '반전!', C.gatePos, true); break;
        case 'gatePass': {
          if (ev.idx < 0) { floater(fx, run.x, LINE_Y - 90, '우회', C.gateZero); break; }
          const txt = ev.value > 0 ? '+' + ev.applied : ev.value < 0 ? '−' + (-ev.applied) : '0';
          floater(fx, run.x, LINE_Y - 90, txt, ev.value > 0 ? C.gatePos : ev.value < 0 ? C.gateNeg : C.gateZero, true);
          if (ev.value < 0 && ev.applied < 0) { fx.shakeT = FX.shakeDur; fx.hurtT = FX.hurtFlashDur; fx.sfx.push(['hurt']); }
          else if (ev.value > 0) fx.sfx.push(['gateFlip']);
          break;
        }
        case 'joinMany':
          if (ev.n >= FX.joinManyAt) fx.sfx.push(['joinMany']);
          floater(fx, run.x, LINE_Y - 90, '+' + ev.n + '명 합류', C.gold, ev.n >= FX.joinManyAt);
          break;
        case 'padTake': floater(fx, ev.x, LINE_Y - 70, '+1', C.chainPad); break;
        case 'chainOn': floater(fx, ev.x, sy(ev.z) - 40, '증원 설비 가동!', C.chainPad, true); break;
        case 'weaponSwap': fx.sfx.push(['weaponSwap']); floater(fx, run.x, LINE_Y - 110, (WEAPONS[ev.weapon]?.name ?? ev.weapon) + ' 장착!', WEAPONS[ev.weapon]?.color ?? C.gold, true); break;
        case 'weaponSame':
          //  랜덤 길 무기 통이 동급이라 교체되지 않은 경우 — 결과 한 줄이 '획득'이라 거짓말하지 않게 표식을 남긴다
          if (run.lottery && run.lottery.kind === 'weapon' && run.z >= run.lottery.revealZ) fx.lotSame = true;
          floater(fx, run.x, LINE_Y - 90, '같은 무기', C.gateZero);
          break;
        case 'hurt': fx.shakeT = FX.shakeDur; fx.hurtT = FX.hurtFlashDur; fx.sfx.push(['hurt']); floater(fx, ev.x, sy(ev.z) - 10, '−' + ev.n, C.heroHurt); break;
        case 'unitLost': spawnBurst(fx, ev.x, sy(ev.z), 9, false, C.heroHurt); break;
        case 'kill': spawnBurst(fx, ev.x, sy(ev.z), BAL3.enemies[ev.kind]?.r ?? 14, false); fx.sfx.push(['kill']); break;
        case 'touch': fx.shakeT = FX.shakeDur; spawnBurst(fx, ev.x, sy(ev.z), 12, false); break;
        case 'blast': spawnBurst(fx, ev.x, sy(ev.z), ev.r, false, C.bulletHeavy); break;
        case 'elite': fx.eliteT = FX.eliteBannerSec; fx.sfx.push(['elite']); au.bgmPlay(BGM.boss[Math.max(0, Math.min(2, run.stageId - 1))]); break;
        case 'bossKill': spawnBurst(fx, ev.x, sy(ev.z), ev.r, true); fx.shakeT = FX.shakeDur; fx.sfx.push(['win']); break;
        case 'win': break;
        case 'lose': fx.sfx.push(['lose']); break;
        default: break;
      }
    }
    //  발사음: 프레임 1회, 볼륨 = min(1, 0.4 + count/40)
    if (fx.fireCount > 0) {
      au.sfx('fire_' + (fx.fireWeapon ?? run.weapon), { vol: Math.min(1, FX.fireVolBase + fx.fireCount / FX.fireVolPer) });
      fx.fireCount = 0;
    }
    for (const [name, opts] of fx.sfx) au.sfx(name, opts);
    fx.sfx.length = 0;
  }

  function updateFx(dt) {
    fx.shakeT = Math.max(0, fx.shakeT - dt);
    fx.hurtT = Math.max(0, fx.hurtT - dt);
    fx.guideT = Math.max(0, fx.guideT - dt);
    fx.eliteT = Math.max(0, fx.eliteT - dt);
    fx.lotOpen = Math.max(0, fx.lotOpen - dt);
    //  게이트 플래시: 감소 후 0 이하는 삭제(칸이 원래 색으로 돌아간다)
    for (const k of Object.keys(fx.gateFlash)) {
      fx.gateFlash[k] -= dt;
      if (fx.gateFlash[k] <= 0) delete fx.gateFlash[k];
    }
    //  셔터가 걷히는 연출 타이머(행 단위)
    for (const k of Object.keys(fx.gateOpen)) {
      fx.gateOpen[k] -= dt;
      if (fx.gateOpen[k] <= 0) delete fx.gateOpen[k];
    }
    for (const p of fx.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    fx.parts = fx.parts.filter((p) => p.t < p.life);
    for (const f of fx.floaters) { f.t += dt; f.y -= 44 * dt; }
    fx.floaters = fx.floaters.filter((f) => f.t < f.life);
    //  보상 팝: 0.5초 떠오른 뒤 부대로 흡수
    for (const p of fx.pops) {
      p.t += dt;
      const rise = Math.min(1, p.t / FX.rewardPopSec);
      const ry = p.y0 - 46 * rise;
      if (p.t <= FX.rewardPopSec) { p.x = p.x0; p.y = ry; }
      else {
        const k = Math.min(1, (p.t - FX.rewardPopSec) / 0.3);
        p.x = p.x0 + (run.x - p.x0) * k;
        p.y = ry + (LINE_Y - ry) * k;
      }
    }
    fx.pops = fx.pops.filter((p) => p.t < p.life);
  }

  function view(now) {
    const v = { state, now, buttons: [], saveOk: save.ok };
    if (state === 'title') {
      const last = lastStageId();
      v.difficulty = difficulty;
      //  난이도 토글 3칸(고른 칸 = primary). 스테이지 버튼의 기록(sub)도 그 난이도 칸의 기록이다
      const T = DIFF_TOGGLE;
      v.buttons = DIFFICULTY_IDS.map((d, i) => ({ id: 'diff_' + d, x: T.x0 + i * (T.w + T.gap), y: T.y, w: T.w, h: T.h, label: BAL3.difficulty[d].label, primary: d === difficulty, small: true }));
      for (let i = 0; i < STAGE_IDS.length; i++) {
        const id = STAGE_IDS[i];
        const m = stageMeta(id), st = save.getStage(id, stageVersion(id), difficulty);
        const sub = st.cleared ? '완료 · 최고 ' + st.bestSurvivors + '명 · ' + timeText(st.bestTime) : st.attempts > 0 ? '도전 ' + st.attempts + '회' : '미도전';
        v.buttons.push({ id: 'stage' + id, x: 60, y: 436 + i * 76, w: 360, h: 62, label: 'STAGE ' + id + '  ' + m.title, sub, primary: last === id });
      }
      v.buttons.push({ id: 'mute', x: 422, y: 14, w: 44, h: 44, label: au.isMuted() ? '🔇' : '🔊' });
    } else if (run) {
      v.run = run;
      const paused = state === 'paused';
      v.fx = paused ? { ...fx, gateFlash: { ...fx.gateFlash }, gateOpen: { ...fx.gateOpen }, shakeT: 0, hurtT: 0 } : fx;
      v.hud = { distM: Math.max(0, Math.round((run.length - run.z) / 10)) };
      if (state === 'run') {
        v.buttons = [{ id: 'pause', x: 422, y: 14, w: 44, h: 44, label: '❚❚' }];
      } else if (state === 'paused') {
        v.buttons = [
          { id: 'resume', x: 120, y: 400, w: 240, h: 56, label: '계속하기', primary: true },
          { id: 'giveup', x: 120, y: 480, w: 240, h: 44, label: '스테이지 선택' },
          { id: 'vol_down', x: 120, y: 548, w: 64, h: 44, label: '−' },
          { id: 'mute', x: 192, y: 548, w: 96, h: 44, label: au.isMuted() ? '🔇' : '음량 ' + Math.round(au.getVolume() * 100) + '%' },
          { id: 'vol_up', x: 296, y: 548, w: 64, h: 44, label: '+' },
        ];
      } else if (state === 'result') {
        v.result = result;
        const bs = [{ id: 'retry', x: 120, y: 480, w: 240, h: 56, label: '다시 도전', primary: !result.nextId }];
        if (result.nextId) bs.push({ id: 'next', x: 120, y: 548, w: 240, h: 56, label: '다음 작전', sub: 'STAGE ' + result.nextId + '  ' + stageMeta(result.nextId).title, primary: true });
        bs.push({ id: 'title', x: 120, y: result.nextId ? 620 : 552, w: 240, h: 44, label: '스테이지 선택' });
        v.buttons = bs;
      }
    }
    buttons = v.buttons;
    return v;
  }

  //  버튼 처리. 눌린 버튼이 있으면 true(조향 입력으로 넘기지 않는다)
  function onPress(x, y) {
    const id = hitButton(buttons, x, y);
    if (!id) return false;
    if (id === 'mute') {
      au.setMuted(!au.isMuted());
      save.patch({ mute: au.isMuted() });
      return true;
    }
    if (id === 'vol_down' || id === 'vol_up') {
      const v = Math.max(0, Math.min(1, au.getVolume() + (id === 'vol_up' ? 0.2 : -0.2)));
      au.setVolume(v);
      if (au.isMuted() && v > 0) { au.setMuted(false); save.patch({ mute: false }); }
      save.patch({ volume: v });
      au.sfx('click');
      return true;
    }
    au.sfx('click');
    if (state === 'title') {
      if (id.startsWith('diff_')) setDifficulty(id.slice(5));
      else if (id.startsWith('stage')) startRun(Number(id.slice(5)));
    } else if (state === 'run') {
      if (id === 'pause') pause();
    } else if (state === 'paused') {
      if (id === 'resume') resume();
      else if (id === 'giveup') toTitle();
    } else if (state === 'result') {
      if (id === 'retry') startRun(result.stageId);
      else if (id === 'next' && result.nextId) startRun(result.nextId);
      else if (id === 'title') toTitle();
    }
    return true;
  }

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  }

  //  앱 전환·창 이탈·포인터 취소: 입력 해제 + 자동 일시정지
  const autoPause = () => { input.reset(); pause(); };

  canvas.addEventListener('pointerdown', (e) => {
    au.unlock();
    if (state === 'title' || state === 'result') au.bgmPlay(BGM.title);
    const [x, y] = toLogical(e);
    if (onPress(x, y)) return;
    if (state === 'run') input.onPointerDown(x, e.pointerType, e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    input.onPointerMove(toLogical(e)[0], e.pointerType, e.pointerId);
  });
  if (win) {
    //  pointerId 를 넘겨 드래그 중인 손가락의 up 만 드래그를 끝낸다
    win.addEventListener('pointerup', (e) => input.onPointerUp(e.pointerId));
    win.addEventListener('pointercancel', () => { input.onPointerCancel(); autoPause(); });
    win.addEventListener('blur', autoPause);
    win.addEventListener('resize', fitCanvas);
    //  code 가 비어 오는 환경(일부 가상 키 입력)은 key 로 대신한다
    const keyCode = (e) => e.code || (e.key === ' ' ? 'Space' : e.key);
    win.addEventListener('keydown', (e) => {
      au.unlock();
      const code = keyCode(e);
      //  브라우저 자동반복 keydown(키를 누르고 있는 동안 초당 수십 회)은 입력으로 보지 않는다 — 계약서 6장.
      //  반복까지 input.onKey 로 넘기면 매 반복이 pointerX 를 지워, "키를 누른 채 마우스를 움직이면 마우스가 이긴다"가 깨진다.
      //  (조향 키는 브라우저 기본 스크롤만 계속 막고, ESC·Space·Enter 의 반복은 동작을 다시 일으키지 않는다)
      if (e.repeat) { if (isSteerKey(code) && e.preventDefault) e.preventDefault(); return; }
      if (code === 'Escape') {
        if (state === 'run') pause();
        else if (state === 'paused') resume();
        return;
      }
      if (input.onKey(code, true)) { if (e.preventDefault) e.preventDefault(); return; }
      //  타이틀에서 1/2/3 = 난이도 선택(클릭과 같은 경로)
      if (state === 'title' && DIFF_KEYS[code] !== undefined) {
        if (setDifficulty(DIFFICULTY_IDS[DIFF_KEYS[code]])) au.sfx('click');
        return;
      }
      if (code === 'Space' || code === 'Enter') {
        if (state === 'title') startRun(lastStageId());
        else if (state === 'result') startRun(result.stageId);
        else if (state === 'paused') resume();
      }
    });
    win.addEventListener('keyup', (e) => { input.onKey(keyCode(e), false); });
  }
  if (doc) doc.addEventListener('visibilitychange', () => { if (doc.hidden) autoPause(); });

  //  개발 콘솔 관찰용(게임 동작에 영향 없음)
  const dbg = () => ({
    state, stageId: run ? run.stageId : null, difficulty: run ? run.difficulty : difficulty,
    z: run ? Math.round(run.z) : 0, x: run ? Math.round(run.x) : 0,
    units: run ? run.units.length : 0, weapon: run ? run.weapon : null, boss: run ? !!run.boss : false,
    enemies: run ? run.enemies.length : 0, bullets: run ? run.bullets.length : 0,
  });
  if (win) win.__rush3Dbg = dbg;

  let lastFx = null;
  function frame(nowMs) {
    const now = nowMs / 1000;
    const dt = lastFx === null ? 0 : Math.min(0.05, Math.max(0, now - lastFx));
    lastFx = now;
    if (state === 'run') {
      loop.frame(now);
      //  랜덤 길 공개: 통로 확정선을 넘는 프레임에 '?' 상자를 걷고 효과음 1회(좋음 gateFlip / 꽝 hurt 재사용)
      if (run.lottery && !fx.lotSeen && run.z >= run.lottery.revealZ) {
        fx.lotSeen = true;
        fx.lotOpen = BAL3.lottery.openT;
        fx.sfx.push([run.lottery.good ? 'gateFlip' : 'hurt']);
      }
      handleEvents(drainEvents(run));
      updateFx(dt);
      if (run.over) {
        if (overT < 0) overT = run.won ? OVER_DELAY.won : OVER_DELAY.lost;
        overT -= dt;
        if (overT <= 0) finishRun();
      }
    }
    renderer.draw(view(now));
    raf(frame);
  }

  fitCanvas();
  const base = deps.spriteBase ?? 'assets/rush/';
  const ready = Promise.resolve(deps.sprites ?? loadSprites3(base)).then((sp) => {
    renderer = createRenderer3(ctx, sp);
    raf(frame);
  });

  return { dbg, ready, startRun, pause, resume, toTitle, getState: () => state, getRun: () => run, getFx: () => fx, loop, input,
           getDifficulty: () => difficulty, setDifficulty };
}

if (typeof document !== 'undefined' && document.getElementById?.('game3')) boot(document.getElementById('game3'));
