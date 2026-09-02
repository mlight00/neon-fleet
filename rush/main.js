// rush/main.js — 셸. 게임 규칙은 전부 하위 모듈에 있고 여기는 결선만.
//  ⚠️모듈 상단에서 DOM 을 만지지 않는다 — Node 테스트가 이 파일을 그대로 import 한다.
import { BAL } from './balance.js';
import { mulberry32, dateSeed, hashSeed } from './rng.js';
import { buildTrack } from './track.js';
import { applyGate, isGood, gateColor } from './gates.js';
import { createAudio } from './audio.js';
import { tierFor, clampX, squadRadius } from './squad.js';
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
    z: 0, ei: 0, x: 240, tx: 240, count: eff.startCount, dispCount: eff.startCount, eff,
    combat: createCombat(),
    watcher: recordWatcher(save.get().best), slowmo: slowmoCtl(), cont: continueToken(isDaily),
    recordFlash: 0, gold: false, dim: 0, invulnT: 0, curBossZone: -1,
    parts: [], floaters: [], shakeT: 0, hurtT: 0, fireFlash: 0, evolveT: 0, evolveUp: true, burstSeed: 0, sfxQueue: [],
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

/** 파편 폭발 — 각도는 카운터 기반(전역 난수 금지). big=보스급. */
function spawnBurst(run, x, y, r, big) {
  run.burstSeed++;
  const n = big ? 16 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + run.burstSeed * 0.7;
    const sp = (big ? 210 : 130) * (0.6 + ((i + run.burstSeed) % 3) * 0.25);
    run.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                     t: 0, life: big ? 0.7 : 0.42, r: big ? 7 : 4, big: !!big });
  }
  run.parts.push({ x, y, vx: 0, vy: 0, t: 0, life: big ? 0.5 : 0.3, r: r * (big ? 1.6 : 1.2), flash: true });
}

function advance(run, dt0) {
  const startTier = tierFor(run.count);               // 프레임 전체의 티어 변화를 본다(게이트 승급 포함)
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
      if (gate.broken) {                               // 부숴 둔 게이트 — 효력 없음
        run.floaters.push({ x: run.x, y: 560, text: '무효', color: '#9AA1AC', t: 0 });
        continue;
      }
      const before = run.count;
      run.count = applyGate(run.count, gate);
      const sym = { add: '+', mul: '×', sub: '−', div: '÷' }[gate.op];
      run.floaters.push({ x: run.x, y: 560, text: sym + gate.value, color: gateColor(gate.op), t: 0, big: true });
      run.sfxQueue.push(isGood(gate.op) ? 'gateGood' : 'gateBad');
      if (run.count < before && run.count <= 5) { run.shakeT = BAL.fx.shakeDur; run.hurtT = BAL.fx.hurtFlashDur; }
    } else if (ev.type === 'wave') {
      const zn = Math.min(BAL.track.zones - 1, Math.floor(ev.z / BAL.track.zoneLen));
      spawnWave(run.combat, ev.data.kind, ev.data.n, run.rnd, BAL.track.enemyHpMult[zn], zn);
    }
    else {
      for (const e of run.combat.enemies) spawnBurst(run, e.x, e.y, e.r, false);   // 보스전은 1:1 — 잡졸 일괄 정리
      run.combat.enemies.length = 0;
      run.combat.eshots.length = 0;
      spawnBoss(run.combat, run.count, ev.data.zone);
      run.curBossZone = ev.data.zone; run.dim = 0; run.sfxQueue.push('bossIn');
    }
  }
  //  나쁜 게이트는 쏴서 부술 수 있다(부수면 효력 무효). 탄은 게이트에 흡수된다 — 사선 관리의 대가.
  for (let gi = run.ei; gi < run.track.events.length; gi++) {
    const gev = run.track.events[gi];
    const dy = gev.z - run.z;
    if (dy > 760) break;
    if (gev.type !== 'gatepair' || dy < -20) continue;
    const gy = BAL.squad.y - dy;
    for (const side of ['left', 'right']) {
      const g = gev.data[side];
      if (isGood(g.op) || g.broken) continue;
      if (g.hp === undefined) g.hp = g.op === 'div' ? Math.round(30 + (gev.z / run.track.length) * 70) : Math.max(6, Math.round(g.value * 1.3));   // 내구도 = 게이트 숫자 비례(÷는 고정 상향)
      const gx = side === 'left' ? 240 - BAL.gates.gap / 2 - BAL.gates.width / 2
                                 : 240 + BAL.gates.gap / 2 + BAL.gates.width / 2;
      for (const b of run.combat.bullets) {
        if (b.dead || b.y > gy + 26 || b.y < gy - 26 || Math.abs(b.x - gx) > BAL.gates.width / 2) continue;
        b.dead = true;
        g.hp -= 1;
      }
      if (g.hp <= 0) {
        g.broken = true;
        spawnBurst(run, gx, gy, 34, false);
        run.floaters.push({ x: gx, y: gy - 20, text: '파괴!', color: '#F6C84A', t: 0, big: true });
        run.sfxQueue.push('kill');
      }
    }
  }
  const prevTier = tierFor(run.count);
  const r = stepCombat(run.combat, { x: run.x, count: run.count, fireRateMult: run.eff.fireRateMult, tier: prevTier, radius: squadRadius(run.count) }, dt, run.rnd);
  for (const ev of r.events) {
    if (ev.type === 'kill') { spawnBurst(run, ev.x, ev.y, ev.r, false); if (!ev.touched) run.sfxQueue.push('kill'); }
    else if (ev.type === 'supply') {                  // 보급 컨테이너 격파 = 병력 획득
      run.count = Math.min(BAL.squad.maxCount, run.count + ev.n);
      run.floaters.push({ x: ev.x, y: ev.y, text: '+' + ev.n, color: '#F6C84A', t: 0, big: true });
      run.sfxQueue.push('gateGood');
    }
    else if (ev.type === 'bossKill') { spawnBurst(run, ev.x, ev.y, ev.r, true); run.sfxQueue.push('bossDie'); run.shakeT = BAL.fx.shakeDur; }
    else if (ev.type === 'hurt' && run.invulnT <= 0) {
      run.shakeT = BAL.fx.shakeDur;
      run.hurtT = BAL.fx.hurtFlashDur;
      run.floaters.push({ x: run.x, y: BAL.squad.y - 40, text: '−' + ev.n, color: '#FF4A4A', t: 0 });
      run.sfxQueue.push('hurt');
    } else if (ev.type === 'fire') {
      run.sfxQueue.push(prevTier >= 4 ? 'fireM' : prevTier >= 2 ? 'fireL' : 'fire');   // 무기 진화 = 소리도 진화
      run.fireFlash = 0.09;
    }
  }
  if (run.invulnT > 0) run.invulnT -= dt0; else run.count -= r.troopLoss;
  const nowTier = tierFor(run.count);
  if (nowTier !== startTier) {                         // 승급/강등 이펙트 + 사운드
    run.evolveT = 0.8;
    run.cutscene = nowTier > startTier
      ? { t: 1.1, total: 1.1, tier: nowTier }                 // 진화 컷인(히트스톱)
      : { t: 0.6, total: 0.6, tier: nowTier, down: true };    // 강등 — 짧은 이펙트
    run.evolveUp = nowTier > startTier;
    run.sfxQueue.push(nowTier > startTier ? 'evolve' : 'demote');
    run.floaters.push({ x: run.x, y: BAL.squad.y - 60, color: nowTier > startTier ? '#F6C84A' : '#FF6A3D',
                        text: nowTier > startTier ? '진화!' : '강등...', t: 0, big: true });
  }
  //  연출 상태 갱신
  run.shakeT = Math.max(0, run.shakeT - dt0);
  run.hurtT = Math.max(0, run.hurtT - dt0);
  run.fireFlash = Math.max(0, run.fireFlash - dt0);
  run.evolveT = Math.max(0, run.evolveT - dt0);
  for (const p of run.parts) { p.t += dt0; p.x += p.vx * dt0; p.y += p.vy * dt0; }
  run.parts = run.parts.filter((p) => p.t < p.life);
  for (const f of run.floaters) { f.t += dt0; f.y -= 44 * dt0; }
  run.floaters = run.floaters.filter((f) => f.t < 0.9);
  //  표시 병력은 실제 병력을 지연 추종 — 늘 때는 촤르륵(차이의 3배/초), 줄 때는 즉각적으로(12배/초)
  {
    const gap = run.count - run.dispCount;
    const rate = gap > 0 ? Math.max(8, gap * 3) : Math.max(30, -gap * 12);
    const step = Math.min(Math.abs(gap), rate * dt0);
    run.dispCount += Math.sign(gap) * step;
    if (Math.abs(run.count - run.dispCount) < 0.05) run.dispCount = run.count;
  }
  run.peak = Math.max(run.peak, run.count);
  if (run.watcher.update(run.count) === 'break') { run.recordFlash = 1.2; run.gold = true; run.sfxQueue.push('record'); }
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
  const au = createAudio();
  au.setMuted(!!save.get().mute);
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
        { id: 'start', x: 140, y: 545, w: 200, h: 60, label: '출격', primary: true },
        { id: 'daily', x: 140, y: 625, w: 200, h: 48, label: '오늘의 도전' },
        { id: 'mute', x: 422, y: 14, w: 44, h: 44, label: au.isMuted() ? '🔇' : '🔊' },
      ];
    } else if (state === 'run' || state === 'over' || state === 'paused') {
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
      v.pools = run.combat.pools;
      const disp = Math.round(run.dispCount);
      v.squad = { x: run.x, count: disp, tier: tierFor(run.count), radius: squadRadius(run.count), hurt: run.hurtT > 0,
                  fireFlash: run.fireFlash, muzzles: BAL.squad.muzzles[tierFor(run.count)] ?? 1,
                  evolveT: run.evolveT, evolveUp: run.evolveUp };
      v.dim = run.dim;
      v.parts = run.parts;
      v.cutscene = run.cutscene ? { k: 1 - run.cutscene.t / run.cutscene.total, tier: run.cutscene.tier, down: run.cutscene.down } : null;
      v.floaters = run.floaters;
      v.shakeT = state === 'paused' ? 0 : run.shakeT;   // 일시정지 중엔 흔들림·피격 연출 정지
      v.hurtT = state === 'paused' ? 0 : run.hurtT;
      v.now = performance.now() / 1000;
      v.zone = Math.min(BAL.track.zones - 1, Math.floor(run.z / BAL.track.zoneLen));
      const bz = nextBossZ(run);
      v.hud = {
        count: Math.round(run.dispCount), gold: run.gold, progress: Math.min(1, run.z / run.track.length),
        bossDist: (run.combat.boss || bz === Infinity) ? 0 : Math.max(0, Math.round((bz - run.z) / 10)),
        firstRunX2: run.firstX2, recordFlash: run.recordFlash,
      };
      if (state === 'run') {
        v.buttons = [{ id: 'pause', x: 422, y: 14, w: 44, h: 44, label: '❚❚' }];
      } else if (state === 'over') {
        v.buttons = [
          { id: 'continue', x: 120, y: 430, w: 240, h: 56, label: '이어하기 (1회)', primary: true },
          { id: 'giveup', x: 120, y: 510, w: 240, h: 44, label: '그만하기' },
        ];
      } else if (state === 'paused') {
        v.buttons = [
          { id: 'resume', x: 120, y: 400, w: 240, h: 56, label: '계속하기', primary: true },
          { id: 'giveup', x: 120, y: 480, w: 240, h: 44, label: '그만하기' },
          { id: 'mute', x: 120, y: 548, w: 240, h: 44, label: au.isMuted() ? '소리 켜기 🔇' : '소리 끄기 🔊' },
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
    if (id === 'mute') {                              // 어느 화면에서든 음소거 토글
      au.setMuted(!au.isMuted());
      save.patch({ mute: au.isMuted() });
      return;
    }
    au.sfx('click');
    if (state === 'run') {
      if (id === 'pause') { state = 'paused'; au.bgmPause(); }
    } else if (state === 'title') {
      if (id === 'start') startRun('normal');
      else if (id === 'daily') startRun('daily');
    } else if (state === 'paused') {
      if (id === 'resume') { state = 'run'; au.bgmResume(); }
      else if (id === 'giveup') finishRun();
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
      else if (id.startsWith('up_')) { if (buy(save, id.slice(3))) au.sfx('buy'); }
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
    au.unlock();
    au.bgmBattle();
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
    if (e.code === 'Escape') {                        // ESC = 일시 정지 토글
      if (state === 'run') { state = 'paused'; au.bgmPause(); }
      else if (state === 'paused') { state = 'run'; au.bgmResume(); }
      return;
    }
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
      if (run.cutscene) {                              // 진화 컷인: 세계가 잠깐 멈춘다
        run.cutscene.t -= dt;
        if (run.cutscene.t <= 0) run.cutscene = null;
      } else {
      if (pointer.down) run.tx = clampX(pointer.x);
      if (keys.ArrowLeft) run.tx = clampX(run.tx - BAL.squad.moveSpeed * dt);
      if (keys.ArrowRight) run.tx = clampX(run.tx + BAL.squad.moveSpeed * dt);
      run.x += (run.tx - run.x) * Math.min(1, dt * BAL.squad.followRate);   // 부드러운 추종(뚝뚝 끊김 방지)
      advance(run, dt);
      }
      for (const s of run.sfxQueue) au.sfx(s);
      run.sfxQueue.length = 0;
      if (run.combat.boss) au.bgmBoss(run.combat.boss.zone); else au.bgmBattle();
      au.duck(state === 'run' ? Math.max(0.35, 1 - run.dim * 1.8) : 1);     // A-3 보스 앞 정적
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
