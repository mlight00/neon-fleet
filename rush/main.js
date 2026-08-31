// rush/main.js — 셸. 게임 규칙은 전부 하위 모듈에 있고 여기는 결선만.
//  ⚠️모듈 상단에서 DOM 을 만지지 않는다 — Node 테스트가 이 파일을 그대로 import 한다.
import { BAL } from './balance.js';
import { mulberry32, dateSeed, hashSeed } from './rng.js';
import { buildTrack } from './track.js';
import { applyGate } from './gates.js';
import { tierFor, clampX } from './squad.js';
import { createCombat, spawnWave, spawnBoss, stepCombat } from './combat.js';
import { createSave } from './save.js';
import { upCost, buy, effects } from './upgrades.js';
import { todayKey, isFirstRunToday, shareText } from './daily.js';
import { recordWatcher, slowmoCtl, continueToken } from './fx-state.js';
import { loadSprites } from './sprites.js';
import { createRenderer } from './render.js';

export function hitButton(buttons, x, y) {
  for (const b of buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  return null;
}

export function gateHitSide(squadX) { return squadX < 240 ? 'left' : 'right'; }

const UP_LABELS = { startTroops: '시작 병력', fireRate: '연사 속도', magnet: '코인 자석' };

function newRun(save, mode) {
  const isDaily = mode === 'daily';
  const seedInfo = isDaily
    ? dateSeed()
    : { key: todayKey(), seed: hashSeed('r' + Date.now() + Math.random()) };  // 일반 판만 비결정 시드
  const eff = effects(save.get().up, isDaily);
  return {
    mode, seedKey: seedInfo.key,
    track: buildTrack(seedInfo.seed), rnd: mulberry32((seedInfo.seed ^ 0x9E37) >>> 0),
    z: 0, ei: 0, x: 240, tx: 240, count: eff.startCount, eff,
    combat: createCombat(),
    watcher: recordWatcher(save.get().best), slowmo: slowmoCtl(), cont: continueToken(isDaily),
    recordFlash: 0, gold: false, dim: 0, invulnT: 0, curBossZone: -1,
    peak: eff.startCount, over: false, won: false,
    firstX2: !isDaily && isFirstRunToday(save.get(), todayKey()),
  };
}

export function nextBossZ(run) {
  for (let i = run.ei; i < run.track.events.length; i++) {
    if (run.track.events[i].type === 'boss') return run.track.events[i].z;
  }
  return run.combat.boss ? run.z : Infinity;          // 싸우는 중이면 0m 로 표시
}

function advance(run, dt0) {
  const scale = run.slowmo.update(run.count, dt0);
  const dt = dt0 * scale;
  //  보스 앞 정적(A-3): 다음 보스 이벤트 1.5초 앞에서 화면이 어두워진다 — 구간마다 반복
  const next = run.track.events[run.ei];
  if (next && next.type === 'boss') {
    const eta = (next.z - run.z) / BAL.track.scrollSpeed;
    run.dim = eta < BAL.fx.bossHushSec ? Math.min(0.35, run.dim + dt0) : 0;
  }
  if (!run.combat.boss) run.z += BAL.track.scrollSpeed * dt;   // 보스전 동안은 제자리 전투
  while (run.ei < run.track.events.length && run.track.events[run.ei].z <= run.z) {
    const ev = run.track.events[run.ei++];
    if (ev.type === 'gatepair') {
      const gate = gateHitSide(run.x) === 'left' ? ev.data.left : ev.data.right;
      run.count = applyGate(run.count, gate);
    } else if (ev.type === 'wave') spawnWave(run.combat, ev.data.kind, ev.data.n, run.rnd);
    else { spawnBoss(run.combat, run.count, ev.data.zone); run.curBossZone = ev.data.zone; run.dim = 0; }
  }
  const r = stepCombat(run.combat, { x: run.x, count: run.count, fireRateMult: run.eff.fireRateMult }, dt, run.rnd);
  if (run.invulnT > 0) run.invulnT -= dt0; else run.count -= r.troopLoss;
  run.peak = Math.max(run.peak, run.count);
  if (run.watcher.update(run.count) === 'break') { run.recordFlash = 1.2; run.gold = true; }
  run.recordFlash = Math.max(0, run.recordFlash - dt0);
  if (run.count <= 0) run.over = true;
  else if (run.curBossZone >= 0 && !run.combat.boss) {         // 이번 구간 보스 격파
    if (run.curBossZone >= BAL.track.zones - 1) run.won = true;
    run.curBossZone = -1;
  }
  return scale;
}

export function boot() {
  const canvas = document.getElementById('game');
  const save = createSave();
  let state = 'title', run = null, renderer = null, buttons = [];
  const pointer = { down: false, x: 240 };
  const keys = {};

  function startRun(mode) { run = newRun(save, mode); state = 'run'; }

  function finishRun() {
    state = 'results';
    const d = save.get();
    const mult = run.firstX2 ? 2 : 1;
    const gained = Math.round((run.combat.coins + run.z * BAL.coins.perDistance) * run.eff.magnetMult) * mult;
    const patch = { coins: d.coins + gained };
    let isRecord = false, shareBest = run.peak;
    if (run.mode === 'daily') {
      const daily = { ...d.daily };
      daily[run.seedKey] = Math.max(daily[run.seedKey] ?? 0, run.peak);
      shareBest = daily[run.seedKey];
      patch.daily = daily;
    } else {
      patch.lastPlayDay = todayKey();                 // 첫판 2배는 "첫 일반 판" 기준(재미설계 C)
      if (run.peak > d.best) { patch.best = run.peak; isRecord = true; }
    }
    run.resultData = {
      peak: run.peak, kills: run.combat.kills, coins: gained, x2: run.firstX2,
      isRecord, won: run.won, shareBest,
    };
    save.patch(patch);
  }

  function view() {
    const v = { state, mode: run?.mode ?? 'normal', buttons: [], best: save.get().best, scroll: run?.z ?? 0 };
    if (state === 'title') {
      v.buttons = [
        { id: 'start', x: 140, y: 470, w: 200, h: 60, label: '출격', primary: true },
        { id: 'daily', x: 140, y: 550, w: 200, h: 48, label: '오늘의 도전' },
      ];
    } else if (state === 'run' || state === 'over') {
      v.gates = [];
      for (let i = run.ei; i < run.track.events.length; i++) {
        const ev = run.track.events[i];
        const y = BAL.squad.y - (ev.z - run.z);
        if (y < -100) break;
        if (ev.type === 'gatepair' && y < 720) v.gates.push({ y, pair: ev.data });
      }
      v.enemies = run.combat.enemies;
      v.bullets = run.combat.bullets;
      v.eshots = run.combat.eshots;
      v.boss = run.combat.boss;
      v.squad = { x: run.x, count: run.count, tier: tierFor(run.count) };
      v.dim = run.dim;
      v.zone = Math.min(BAL.track.zones - 1, Math.floor(run.z / BAL.track.zoneLen));
      const bz = nextBossZ(run);
      v.hud = {
        count: run.count, gold: run.gold, progress: Math.min(1, run.z / run.track.length),
        bossDist: (run.combat.boss || bz === Infinity) ? 0 : Math.max(0, Math.round((bz - run.z) / 10)),
        firstRunX2: run.firstX2, recordFlash: run.recordFlash,
      };
      if (state === 'over') {
        v.buttons = [
          { id: 'continue', x: 120, y: 430, w: 240, h: 56, label: '이어하기 (1회)', primary: true },
          { id: 'giveup', x: 120, y: 510, w: 240, h: 44, label: '그만하기' },
        ];
      }
    } else if (state === 'results') {
      v.results = { ...run.resultData, wallet: save.get().coins };
      v.buttons = [{ id: 'retry', x: 140, y: 400, w: 200, h: 56, label: '다시 출격', primary: true }];
      const d = save.get();
      const xs = [60, 185, 310];
      ['startTroops', 'fireRate', 'magnet'].forEach((track, i) => {
        const lvl = d.up[track], cost = upCost(track, lvl);
        v.buttons.push({
          id: 'up_' + track, x: xs[i], y: 500, w: 110, h: 64,
          label: UP_LABELS[track] + ' ' + lvl,
          sub: cost === null ? 'MAX' : cost + '💰',
          disabled: cost === null || d.coins < cost,
        });
      });
      if (run.mode === 'daily') {
        v.buttons.push({ id: 'share', x: 140, y: 600, w: 200, h: 40, label: '기록 복사' });
      } else {
        v.buttons.push({ id: 'daily', x: 140, y: 600, w: 200, h: 40, label: '오늘의 도전' });
      }
      v.buttons.push({ id: 'title', x: 140, y: 656, w: 200, h: 36, label: '처음으로' });
    }
    buttons = v.buttons;
    return v;
  }

  function onPress(x, y) {
    const id = hitButton(buttons, x, y);
    if (!id) return;
    if (state === 'title') {
      if (id === 'start') startRun('normal');
      else if (id === 'daily') startRun('daily');
    } else if (state === 'over') {
      if (id === 'continue' && run.cont.use()) {
        run.count = BAL.fx.continueTroops;
        run.invulnT = BAL.fx.continueInvulnSec;
        run.combat.eshots.length = 0;                 // 부활 직후 억울한 죽음 방지
        run.over = false;
        state = 'run';
      } else if (id === 'giveup') finishRun();
    } else if (state === 'results') {
      if (id === 'retry') startRun(run.mode);
      else if (id === 'daily') startRun('daily');
      else if (id === 'title') state = 'title';
      else if (id.startsWith('up_')) buy(save, id.slice(3));
      else if (id === 'share') {
        navigator.clipboard?.writeText(shareText(run.seedKey, run.resultData.shareBest)).catch(() => {});
      }
    }
  }

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * 480 / r.width, (e.clientY - r.top) * 800 / r.height];
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointer.down = true;
    const [x, y] = toLogical(e);
    pointer.x = x;
    onPress(x, y);
  });
  //  기존 네온함대 입력 방식(js/input.js): 마우스는 호버만으로 조향, 터치는 드래그 중에만
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || pointer.down) {
      pointer.x = toLogical(e)[0];
      if (state === 'run') run.tx = clampX(pointer.x);
    }
  });
  addEventListener('pointerup', () => { pointer.down = false; });
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'Enter') {
      if (state === 'title') startRun('normal');
      else if (state === 'results') startRun(run.mode);
    }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  //  개발 콘솔 관찰용(게임 동작에 영향 없음)
  if (typeof window !== 'undefined') {
    window.__rushDbg = () => run && ({ state, z: Math.round(run.z), count: run.count, ei: run.ei,
      enemies: run.combat.enemies.length, eshots: run.combat.eshots.length, boss: !!run.combat.boss });
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'run') {
      if (pointer.down) run.tx = clampX(pointer.x);
      if (keys.ArrowLeft) run.tx = clampX(run.tx - BAL.squad.moveSpeed * dt);
      if (keys.ArrowRight) run.tx = clampX(run.tx + BAL.squad.moveSpeed * dt);
      run.x += (run.tx - run.x) * Math.min(1, dt * BAL.squad.followRate);   // 부드러운 추종(뚝뚝 끊김 방지)
      advance(run, dt);
      if (run.over) {
        if (run.cont.canUse()) state = 'over';
        else finishRun();
      } else if (run.won && run.z >= run.track.length + 260) finishRun();   // 격파 뒤 잠깐 여운
    }
    renderer.draw(view());
    requestAnimationFrame(frame);
  }

  loadSprites().then((sp) => {
    renderer = createRenderer(canvas, sp);
    requestAnimationFrame(frame);
  });
}

if (typeof document !== 'undefined' && document.getElementById?.('game')) boot();
