// 진입점: 캔버스 관리 + 게임 루프 + 상태 머신 + 트랙 생성
import { BAL } from './balance.js';
import { createInput } from './input.js';
import { createStarfield, drawHUD, COLORS, glow } from './render.js';
import { Squad, Crystal, DronePod, GatePair, TriGate, Capsule, Creature, Meteor, PowerModule, Sniper, Turret, Weaver, Charger, Mine, MidBoss, Boss, createEffects } from './entities.js';
import { maybeAffix } from './affixes.js';
import { computeMfx, draftOptions, moduleSummary, MODULE_BY_ID } from './modules.js';
import { mulberry32, pickTier, pickChunk, isSafeChunk, chunkMinStage } from './chunks.js';
import { stageMods, hangarCost } from './logic.js';
import { preloadStyle, setArtStyle, getArtStyle, getBackground, STYLE_NAMES } from './sprites.js';
import { createSave } from './save.js';
import { ui } from './ui.js';
import { initAudio, unlockAudio, playBgm, sfx, toggleMute, isMuted, setBgmVolume, setSfxVolume, getSettings } from './audio.js';
import { playIntro } from './intro.js';

const LOGICAL_W = BAL.logicalW;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let scale = 1;
let logicalH = 800;

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.min(vw, vh * 0.62); // PC 와이드에선 세로 기둥
  scale = maxW / LOGICAL_W;
  logicalH = Math.round(vh / scale);
  canvas.width = Math.round(LOGICAL_W * scale);
  canvas.height = vh;
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
}
window.addEventListener('resize', resize);
resize();

const input = createInput(canvas, LOGICAL_W);
const starfield = createStarfield(LOGICAL_W);
const save = createSave();

// 오디오: 첫 사용자 제스처(탭/클릭/키)에서 AudioContext 잠금 해제 후 타이틀 BGM 시작
initAudio(save);
function firstGestureUnlock() {
  unlockAudio();
  playBgm('title');
  window.removeEventListener('pointerdown', firstGestureUnlock);
  window.removeEventListener('keydown', firstGestureUnlock);
}
window.addEventListener('pointerdown', firstGestureUnlock);
window.addEventListener('keydown', firstGestureUnlock);

// 사운드 설정 (우상단): ⚙ 버튼 → BGM/SFX 슬라이더 + 음소거 패널
(() => {
  const snd = save.get().snd;
  const wrap = document.createElement('div');
  wrap.id = 'snd-settings';
  wrap.innerHTML = `
    <button id="snd-gear" title="사운드 설정">${snd.mute ? '🔇' : '🔊'}</button>
    <div id="snd-panel" class="hidden">
      <label>🎵 BGM <input id="snd-bgm" type="range" min="0" max="100" value="${Math.round(snd.bgm * 100)}"></label>
      <label>🔊 효과음 <input id="snd-sfx" type="range" min="0" max="100" value="${Math.round(snd.sfx * 100)}"></label>
      <button id="snd-mute">${snd.mute ? '🔇 음소거 해제' : '🔇 음소거'}</button>
    </div>`;
  document.getElementById('stage').appendChild(wrap);

  const gear = wrap.querySelector('#snd-gear');
  const panel = wrap.querySelector('#snd-panel');
  const bgmSlider = wrap.querySelector('#snd-bgm');
  const sfxSlider = wrap.querySelector('#snd-sfx');
  const muteToggle = wrap.querySelector('#snd-mute');

  gear.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudio();
    panel.classList.toggle('hidden');
  });
  bgmSlider.addEventListener('input', () => { unlockAudio(); setBgmVolume(bgmSlider.value / 100); });
  sfxSlider.addEventListener('input', () => { unlockAudio(); setSfxVolume(sfxSlider.value / 100); });
  sfxSlider.addEventListener('change', () => sfx('vulcan')); // 조절 후 미리듣기
  muteToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const muted = toggleMute();
    gear.textContent = muted ? '🔇' : '🔊';
    muteToggle.textContent = muted ? '🔇 음소거 해제' : '🔇 음소거';
  });
  // 패널 밖 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) panel.classList.add('hidden');
  });
})();

// ───────────────────────── 판(run) 상태
let state = 'title'; // title | play | done(오버레이 표시 중)
let run = null;
let drafting = false; // 모듈 드래프트 표시 중(게임 일시 정지)

// 원정(run) = 1스테이지부터 죽을 때까지 연속. 기함·드론·모듈이 누적된다.
function newExpedition() {
  const rng = mulberry32((Math.random() * 2 ** 31) | 0);
  const up = save.get().up;
  const H = BAL.hangar.upgrades;
  const stats = {
    startCount: BAL.squad.start + up.drones * H.drones.step,
    fireRate: BAL.squad.fireRate + up.rate * H.rate.step,
    damage: BAL.squad.damage + up.dmg * H.dmg.step,
    coinMult: 1 + up.coin * H.coin.step,
  };
  const squad = new Squad(LOGICAL_W, logicalH, stats.startCount);
  const effects = createEffects();
  const world = {
    bal: BAL, input, squad, effects,
    bullets: [], enemyBullets: [], entities: [],
    scrollSpeed: BAL.scrollSpeed,
    logicalW: LOGICAL_W,
    get logicalH() { return logicalH; },
    rng, coins: 0,
    phase: 'track', boss: null,
    stageMods: stageMods(1),
    stats,
    mfx: computeMfx([]),          // 모듈 효과 누적기 (빈 상태 = 중립)
    addCoins(n) { this.coins += n; },
    spawnEntity(e) { this.entities.push(e); },
    spawnEnemyBullet(b) { if (this.enemyBullets.length < this.stageMods.shotCap) this.enemyBullets.push(b); },
  };
  run = {
    world, squad, effects, rng,
    stage: 1, mods: world.stageMods,
    modules: [],                  // 뽑은 모듈 id 누적 (중복 = 스택)
    pending: [], traveled: 0, totalTrack: 0,
    phase: 'track', boss: null, endT: 0,
    maxPower: squad.power, scrollY: 0,
  };
  buildStage(1);
}

// 한 스테이지의 트랙을 (재)구성. 기함·드론·모듈·코인은 유지, 스테이지별 요소만 리셋.
function buildStage(stage) {
  const r = run, w = r.world;
  const mods = stageMods(stage);
  r.stage = stage; r.mods = mods; w.stageMods = mods;
  w.scrollSpeed = BAL.scrollSpeed;
  w.entities.length = 0; w.bullets.length = 0; w.enemyBullets.length = 0;
  r.boss = null; w.boss = null;
  r.phase = 'track'; w.phase = 'track';
  r.traveled = 0;
  const totalTrack = BAL.chunk.heightPx * BAL.chunk.perRun;
  r.totalTrack = totalTrack;
  const tb = BAL.chunk.tierBounds;
  const bounds = [Math.max(0.1, tb[0] - mods.tierShift), Math.max(0.35, tb[1] - mods.tierShift)];
  const rng = r.rng;
  const stageOk = (c) => chunkMinStage(c) <= stage;
  const pending = [];
  let prev = null;
  const safeCount = Math.min(4, 2 + Math.floor((stage - 1) / 3));
  for (let i = 0; i < BAL.chunk.perRun; i++) {
    const tier = pickTier(i / BAL.chunk.perRun, bounds);
    const filter = i < safeCount ? (c) => stageOk(c) && isSafeChunk(c) : stageOk;
    const chunk = pickChunk(tier, rng, prev, filter);
    prev = chunk;
    for (const it of chunk.items) {
      if (it.type === 'storm') continue;
      pending.push({ ...it, trackY: i * BAL.chunk.heightPx + it.y * BAL.chunk.heightPx });
    }
  }
  if (stage === 1) pending.push({ type: 'weaponGate', trackY: 380 }); // 무기는 원정당 1회 선택(이후 유지)
  pending.push({ type: 'bonusGate', trackY: totalTrack * BAL.bonusGate.progress });
  for (let i = 0; i < BAL.pod.perRun; i++) {
    const prog = (i + 0.6) / BAL.pod.perRun;
    const size = prog < bounds[0] ? 'small' : prog < bounds[1] ? 'mid' : 'large';
    pending.push({ type: 'dronePod', trackY: totalTrack * Math.min(0.96, prog), x: 0.18 + 0.64 * rng(), size });
  }
  if (stage >= 2) pending.push({ type: 'midboss', trackY: totalTrack * BAL.midboss.progress });
  pending.sort((a, b) => a.trackY - b.trackY);
  r.pending = pending;
  r.squad.y = logicalH - 130;    // 연속 스테이지 진입 시 편대를 아래에서 다시 시작
  r.squad.dead = false;
}

// 보스 격파 → 다음 스테이지로 연속 진행 (기함·모듈 유지)
function advanceStage() {
  const r = run;
  r.world.addCoins(BAL.run.coinPerClear * r.stage); // 클리어 코인 누적
  const next = r.stage + 1;
  const data = save.get();
  if (next > data.stage) save.set({ stage: next });  // 최고 도달 스테이지 기록
  buildStage(next);
  playBgm('battle1');
  r.effects.text(LOGICAL_W / 2, logicalH * 0.4, `STAGE ${next}`, COLORS.reward);
  r.effects.flash(0.3);
}

function startPlay() {
  newExpedition();
  state = 'play';
  drafting = false;
  ui.hide();
  sfx('start');
  playBgm('battle1'); // 전투 BGM으로 크로스페이드
}

// 모듈 효과 누적기 재계산 (모듈 획득 시)
function recomputeMfx() {
  run.world.mfx = computeMfx(run.modules);
  run.squad.swarmPerDrone = run.world.mfx.swarmPerDrone;
}

// 진화·모듈 선택 직후: 화면 섬광 + 충격파 링 + 적탄 정화 + 기함 펄스 (업그레이드 손맛)
function evolutionNova(r, moduleId) {
  const w = r.world, sq = r.squad;
  w.effects.flash(0.85);
  for (let k = 0; k < 3; k++) w.effects.ring(sq.x, sq.y, k === 1 ? COLORS.reward : COLORS.ally, k * 0.07);
  w.effects.burst(sq.x, sq.y, COLORS.ally, 48, 460);
  w.effects.burst(sq.x, sq.y, '#ffffff', 26, 320);
  for (const b of w.enemyBullets) b.dead = true;   // 화면의 적탄 전부 소멸 = 진화 정화
  sq.evolvePunch = Math.max(sq.evolvePunch || 0, 0.7);
  const m = MODULE_BY_ID[moduleId];
  if (m) w.effects.text(sq.x, sq.y - 60, `${m.icon} ${m.name}!`, COLORS.reward);
  sfx('evolve');
}

// 진화/오버로드 시 모듈 드래프트 3장 표시 (게임 일시 정지)
function openDraft() {
  const r = run;
  const opts = draftOptions(r.modules, r.rng, 3);
  if (opts.length === 0) return; // 모든 모듈 만렙
  drafting = true;
  sfx('evolve');
  ui.showDraft({
    options: opts,
    owned: moduleSummary(r.modules),
    onPick(id) {
      r.modules.push(id);
      recomputeMfx();
      drafting = false;
      ui.hide();
      sfx('buy');
      evolutionNova(r, id);   // 선택 직후 노바 폭발 (업그레이드 손맛)
    },
  });
}

// 적 격파 시: 폭발 탄두(광역) + 전리 회수(드론) 모듈
function onEnemyKilled(e, w) {
  const mfx = w.mfx; if (!mfx) return;
  if (mfx.explodeRadius > 0) {
    w.effects.burst(e.x, e.y, '#ff9c41', 12, 180);
    w.effects.ring(e.x, e.y, '#ff9c41');
    const dmg = Math.max(6, (e.maxHp || 20) * mfx.explodeDmgFrac);
    const rr = mfx.explodeRadius;
    for (const o of w.entities) {
      if (o === e || o.dead || !o.hitByBullet) continue;
      const dx = o.x - e.x, dy = o.y - e.y;
      if (dx * dx + dy * dy <= (rr + (o.r || 0)) ** 2) o.hitByBullet(dmg, w);
    }
  }
  if (mfx.killDroneChance > 0 && Math.random() < mfx.killDroneChance) {
    w.squad.applyDelta(mfx.killDroneAmt, w);
  }
}

// ───────────────────────── 업데이트
function update(dt) {
  if (state !== 'play' || drafting) return; // 드래프트 중엔 게임 정지
  const r = run;
  const w = r.world;

  input.tick(dt);
  w.phase = r.phase;
  w.boss = r.boss;
  r.squad.update(dt, w);
  r.maxPower = Math.max(r.maxPower, r.squad.power);

  // 진행/스폰
  if (r.phase === 'track') {
    const late = r.traveled / r.totalTrack > 0.7 ? BAL.scrollSpeedLateBonus : 1;
    w.scrollSpeed = BAL.scrollSpeed * late;
    r.traveled += w.scrollSpeed * dt;
    r.scrollY += w.scrollSpeed * dt;

    while (r.pending.length && r.pending[0].trackY <= r.traveled) {
      const it = r.pending.shift();
      const x = (it.x ?? 0.5) * LOGICAL_W;
      const mods = r.mods;
      // 스테이지 스케일: 적은 단단하고 빨라지고, 크리스탈은 소폭 커진다
      // 적 HP = 기본 × 스테이지배수 × 화력비례(함대가 강할수록 적도 단단 → 즉사 방지, 늘 긴장)
      const pf = 1 + Math.max(0, r.maxPower) / BAL.economy.enemyHpPowerScale;
      const scaleEnemy = (e) => { e.hp = e.maxHp = Math.round(e.hp * mods.enemyHp * pf); if (e.fireInterval) e.fireInterval *= mods.enemyRate; return e; };
      // 적 스폰 헬퍼: 스테이지 스케일 + 변이(어픽스) 롤 + 등록
      const spawnEnemy = (e, kind) => { scaleEnemy(e); maybeAffix(e, kind, r.stage, r.rng); w.entities.push(e); };
      // 적 항목은 enemyMult 배수만큼 복제 스폰: 복제본은 좌우 미러 + 세로로 살짝 시차
      const dup = BAL.spawn.enemyMult;
      if (it.type === 'crystal') w.entities.push(new Crystal(x, -60, Math.round(it.value * mods.crystal)));
      else if (it.type === 'gatePair') w.entities.push(new GatePair(LOGICAL_W, -60, it.left, it.right));
      else if (it.type === 'creature') for (let k = 0; k < dup; k++) spawnEnemy(new Creature(k ? LOGICAL_W - x : x, -60 - 70 * k, it.size), 'creature');
      else if (it.type === 'splitter') for (let k = 0; k < dup; k++) spawnEnemy(new Creature(k ? LOGICAL_W - x : x, -60 - 70 * k, 'mid', { splits: 3 }), 'creature');
      else if (it.type === 'meteor') w.entities.push(new Meteor(x, -60, r.rng));
      else if (it.type === 'power') w.entities.push(new PowerModule(x, -60));
      else if (it.type === 'sniper') for (let k = 0; k < dup; k++) spawnEnemy(new Sniper(k ? LOGICAL_W - x : x), 'sniper');
      else if (it.type === 'turret') for (let k = 0; k < dup; k++) spawnEnemy(new Turret(k ? LOGICAL_W - x : x, -60 - 90 * k), 'turret');
      else if (it.type === 'weaver') for (let k = 0; k < dup; k++) spawnEnemy(new Weaver(k ? !(it.x < 0.5) : it.x < 0.5, LOGICAL_W), 'weaver');
      else if (it.type === 'charger') for (let k = 0; k < dup; k++) spawnEnemy(new Charger(k ? LOGICAL_W - x : x), 'charger');
      else if (it.type === 'mine') for (let k = 0; k < dup; k++) spawnEnemy(new Mine(k ? LOGICAL_W - x : x), 'mine');
      else if (it.type === 'dronePod') w.entities.push(new DronePod(x, -60, it.size));
      else if (it.type === 'midboss') w.entities.push(new MidBoss(LOGICAL_W, r.stage, r.maxPower));
      else if (it.type === 'capsule') {
        const weapon = it.weapon === 'random'
          ? ['vulcan', 'laser', 'homing'][Math.floor(r.rng() * 3)]
          : it.weapon;
        w.entities.push(new Capsule(x, -60, weapon));
      }
      else if (it.type === 'weaponGate') {
        w.entities.push(new TriGate(LOGICAL_W, -70, [
          { kind: 'weapon', weapon: 'vulcan' },
          { kind: 'weapon', weapon: 'laser' },
          { kind: 'weapon', weapon: 'homing' },
        ]));
      }
      else if (it.type === 'bonusGate') {
        w.entities.push(new TriGate(LOGICAL_W, -70, [
          { kind: 'drones', value: BAL.bonusGate.drones },
          { kind: 'weaponLv' },
          { kind: 'shield' },
        ]));
      }
    }

    if (r.traveled >= r.totalTrack && r.pending.length === 0) {
      r.phase = 'boss';
      w.scrollSpeed = 40; // 보스전: 트랙 거의 정지, 별만 천천히
      sfx('boss_in');
      playBgm('boss'); // 보스 BGM으로 크로스페이드
      r.boss = new Boss(LOGICAL_W, r.mods.enemyRate, r.stage);
      // 함대가 강할수록 + 스테이지가 높을수록 보스도 강하게 (부록 §5) + 패턴별 몸 보정(tanky) + 변주판 HP
      const variantHp = 1 + BAL.bossVariant.hpPerLoop * r.boss.variantLevel;
      r.boss.hp = r.boss.maxHp = Math.round(Math.max(BAL.boss.hp, r.maxPower * BAL.boss.hpPerPower) * r.mods.boss * (r.boss.pattern.tanky ?? 1) * variantHp);
    }
  } else if (r.phase === 'boss') {
    r.scrollY += 30 * dt;
    r.boss.update(dt, w);
    if (r.boss.dead) {
      // 파괴 연출 시작
      r.phase = 'bossDeath';
      r.seqT = 0;
      r.chainT = 0;
      sfx('boss_die');
      playBgm('title'); // 승리 여운 BGM으로 전환
    }
  } else if (r.phase === 'bossDeath') {
    // 보스 위에서 연쇄 폭발이 터지며 파괴
    r.seqT += dt;
    r.boss.deathT = r.seqT;
    r.scrollY += 30 * dt;
    r.chainT -= dt;
    if (r.chainT <= 0) {
      r.chainT = BAL.bossDeath.chainInterval;
      const bx = r.boss.x + (Math.random() - 0.5) * r.boss.r * 2.4;
      const by = r.boss.y + (Math.random() - 0.5) * r.boss.r * 1.4;
      r.effects.burst(bx, by, COLORS.danger, 18, 220);
      r.effects.burst(bx, by, COLORS.reward, 10, 160);
      r.effects.ring(bx, by, Math.random() < 0.5 ? COLORS.reward : COLORS.danger);
      r.effects.flash(0.22);
      sfx(Math.random() < 0.5 ? 'explode_s' : 'explode_l');
    }
    r.squad.update(dt, w); // 우주선은 사격하며 대기
    if (r.seqT >= BAL.bossDeath.duration) {
      // 마지막 대폭발 → 통과 시작
      r.effects.burst(r.boss.x, r.boss.y, COLORS.reward, 60, 320);
      r.effects.burst(r.boss.x, r.boss.y, '#ffffff', 30, 260);
      r.effects.ring(r.boss.x, r.boss.y, COLORS.reward);
      r.effects.flash(0.6);
      sfx('explode_l');
      r.phase = 'flythrough';
      r.flyV = BAL.flythrough.startV;
      r.clearShown = false;
    }
  } else if (r.phase === 'flythrough') {
    // 우주선이 가속하며 보스 잔해를 뚫고 화면 위로 통과
    r.flyV += BAL.flythrough.accel * dt;
    r.squad.y -= r.flyV * dt;
    r.scrollY += r.flyV * dt * 0.6; // 별이 빠르게 흐름
    r.boss.deathT += dt;
    r.squad.update(dt, w);
    // 보스 위치를 지나는 순간 "STAGE CLEAR" 배너
    if (!r.clearShown && r.squad.y < r.boss.y + 30) {
      r.clearShown = true;
      r.effects.text(LOGICAL_W / 2, logicalH * 0.42, 'STAGE CLEAR!', COLORS.ally);
      r.effects.ring(LOGICAL_W / 2, logicalH * 0.42, COLORS.ally);
      r.effects.flash(0.4);
      sfx('evolve');
    }
    if (r.squad.y < BAL.flythrough.exitY) { advanceStage(); return; }
  }

  // 개체 업데이트
  for (const e of w.entities) e.update(dt, w);
  for (const b of w.bullets) b.update(dt, w);
  for (const b of w.enemyBullets) b.update(dt, w);
  r.effects.update(dt);

  // 아군 탄 vs 표적 (크리스탈/크리처/운석/보스). 레이저는 관통(횟수 차감 + 감쇠).
  for (const b of w.bullets) {
    if (b.dead) continue;
    if (r.boss && !r.boss.dead && r.phase === 'boss') {
      const dx = b.x - r.boss.x, dy = b.y - r.boss.y;
      if (dx * dx + dy * dy <= (r.boss.r * 1.4) ** 2) {
        r.boss.hitByBullet(b.damage * (w.mfx?.bossDmgMult ?? 1), w); // 사냥꾼 표식 모듈
        b.dead = true; // 보스는 관통 불가 (거대 표적)
        continue;
      }
    }
    for (const e of w.entities) {
      if (e.dead || !e.hitByBullet) continue;
      if (b.hitSet && b.hitSet.has(e)) continue;
      const rr = (e.r ?? 20) + b.r;
      const dx = b.x - e.x, dy = b.y - e.y;
      if (dx * dx + dy * dy <= rr * rr) {
        const wasAlive = !e.dead;
        e.hitByBullet(e.def ? b.damage * (w.mfx?.bossDmgMult ?? 1) : b.damage, w); // 중간보스도 표식 적용
        if (wasAlive && e.dead) onEnemyKilled(e, w);
        if (b.kind === 'homing') w.effects.burst(b.x, b.y, '#ff9c41', 8, 120); // 미사일 폭발
        if (b.pierce > 1) {
          b.pierce--;
          b.damage *= BAL.weapons.laser.decay;
          b.hitSet.add(e);
        } else {
          b.dead = true;
          break;
        }
      }
    }
  }

  // 정리
  w.entities = w.entities.filter((e) => !e.dead);
  w.bullets = w.bullets.filter((b) => !b.dead);
  w.enemyBullets = w.enemyBullets.filter((b) => !b.dead);

  // 패배 판정 (승리 연출 중에는 무시 — 이미 이겼음)
  if ((r.phase === 'track' || r.phase === 'boss') && r.squad.dead) {
    r.phase = 'lose';
    r.endT = BAL.run.failOverlayDelay;
  }
  if (r.phase === 'lose' && (r.endT -= dt) <= 0) {
    endExpedition();
  }

  // 진화/오버로드 발생 → 모듈 드래프트 (게임 일시 정지)
  if (r.squad.pendingDraft) { r.squad.pendingDraft = false; openDraft(); }
}

// 원정 종료 (사망 또는 끝내기): 코인·기록 정산 → 결과 화면
function endExpedition({ toTitle = false } = {}) {
  state = 'done';
  drafting = false;
  playBgm('title');
  const r = run;
  const data = save.get();
  const isRecord = r.maxPower > data.best;
  const best = Math.max(data.best, r.maxPower);
  const coins = Math.round(r.world.coins * r.world.stats.coinMult);
  save.set({ best, coins: data.coins + coins, stage: Math.max(data.stage, r.stage) });
  if (toTitle) { showTitleScreen(); return; }
  ui.showLose({ stage: r.stage, maxPower: r.maxPower, coins, best, isRecord, modules: moduleSummary(r.modules), onRetry: startPlay, onHangar: showHangar });
}

// ───────────────────────── 격납고 (영구 강화 상점)
function showHangar() {
  ui.showHangar({
    data: save.get(),
    hangar: BAL.hangar,
    squadBase: BAL.squad,
    onBuy(key) {
      const d = save.get();
      const def = BAL.hangar.upgrades[key];
      const lv = d.up[key];
      if (lv >= BAL.hangar.maxLv) return;
      const cost = hangarCost(def.base, lv, BAL.hangar.costGrowth);
      if (d.coins < cost) return;
      save.set({ coins: d.coins - cost, up: { ...d.up, [key]: lv + 1 } });
      sfx('buy');
      showHangar(); // 갱신
    },
    onBack: showTitleScreen,
  });
}

// ───────────────────────── 그리기
function draw() {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // 배경
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, LOGICAL_W, logicalH);
  const scroll = run ? run.scrollY : performance.now() * 0.02;
  const bgImg = getBackground(getArtStyle(), run ? run.stage : save.get().stage);
  if (bgImg) {
    // 성운 배경: 느린 패럴랙스 스크롤 (이미지 자체를 심리스 처리했으므로 단순 타일)
    const bgH = Math.round(bgImg.height * (LOGICAL_W / bgImg.width));
    const off = ((scroll * 0.25) % bgH + bgH) % bgH;
    ctx.globalAlpha = 0.75;
    for (let y = off - bgH; y < logicalH; y += bgH) {
      ctx.drawImage(bgImg, 0, y, LOGICAL_W, bgH);
    }
    ctx.globalAlpha = 1;
  }
  starfield.draw(ctx, logicalH, scroll);

  // 트랙 레인 가이드 (희미한 세로선)
  ctx.strokeStyle = 'rgba(63,245,224,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LOGICAL_W / 2, 0);
  ctx.lineTo(LOGICAL_W / 2, logicalH);
  ctx.stroke();

  if (run) {
    const r = run;
    for (const e of r.world.entities) e.draw(ctx);
    if (r.boss && r.phase !== 'track') r.boss.draw(ctx);
    for (const b of r.world.bullets) b.draw(ctx);
    for (const b of r.world.enemyBullets) b.draw(ctx);
    if (!r.squad.dead) r.squad.draw(ctx);
    r.effects.draw(ctx, LOGICAL_W, logicalH);

    const evc = r.world.mfx?.evolveCostMult ?? 1;
    const rawNext = BAL.evolution.costs[r.squad.tier + 1] ?? BAL.evolution.overloadCost;
    drawHUD(ctx, LOGICAL_W, {
      progress: Math.min(1, r.traveled / r.totalTrack),
      bossHp: r.boss ? Math.max(0, r.boss.hp) : 0,
      bossMax: r.boss && r.phase === 'boss' ? r.boss.maxHp : 0,
      bossName: r.boss ? r.boss.name : '',
      count: r.squad.count,
      tierName: BAL.evolution.names[r.squad.tier],
      tierPower: BAL.evolution.shipPower[r.squad.tier] + (r.squad.overloadPower || 0),
      nextCost: Math.round(rawNext * evc),
      stage: r.stage,
      weapon: r.squad.weapon,
      weaponLv: r.squad.weaponLv,
      shield: r.squad.shield,
      modules: moduleSummary(r.modules),
    });
  }

  ctx.restore();
}

// ───────────────────────── 일시정지 (ESC)
let paused = false;
function togglePause() {
  if (state !== 'play' || drafting) return;   // 플레이 중 + 드래프트 아닐 때만
  paused = !paused;
  if (paused) ui.showPause({ onResume: togglePause, onQuit: quitRun });
  else ui.hide();
}

/** 일시정지에서 '끝내기': 원정을 포기하고 타이틀로. 모은 코인·최고 기록은 정산해 저장 */
function quitRun() {
  paused = false;
  endExpedition({ toTitle: true });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
});
// 모바일용 일시정지 버튼 (좌상단)
const pauseBtn = document.createElement('button');
pauseBtn.id = 'pause-btn';
pauseBtn.textContent = '⏸';
pauseBtn.title = '일시정지 (ESC)';
pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
document.getElementById('stage').appendChild(pauseBtn);

// 차지 버튼 (모바일: 홀드로 충전. 데스크톱은 마우스 좌클릭으로도 충전 가능)
const chargeBtn = document.createElement('button');
chargeBtn.id = 'charge-btn';
chargeBtn.textContent = '⚡';
chargeBtn.title = '차지 (홀드)';
chargeBtn.style.cssText = 'position:fixed;right:18px;bottom:26px;width:66px;height:66px;border-radius:50%;font-size:30px;background:rgba(63,245,224,0.15);border:2px solid #3ff5e0;color:#3ff5e0;z-index:15;touch-action:none;user-select:none;cursor:pointer';
const setCharge = (v) => (e) => { e.preventDefault(); e.stopPropagation(); input.charging = v; };
chargeBtn.addEventListener('pointerdown', setCharge(true));
chargeBtn.addEventListener('pointerup', setCharge(false));
chargeBtn.addEventListener('pointerleave', setCharge(false));
chargeBtn.addEventListener('pointercancel', setCharge(false));
document.getElementById('stage').appendChild(chargeBtn);

// ───────────────────────── 루프
let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  if (!paused && !drafting) update(dt);   // 일시정지·드래프트 중엔 화면만 유지
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 아트 스타일: 페인티드 메탈(C)로 고정. 세라믹/카툰은 디자인 확정 전까지 숨김
// (스타일 인프라는 유지 — 새 스타일이 생기면 styleNames를 다시 넘겨 선택 UI 복원)
setArtStyle('C');
preloadStyle();

function showTitleScreen() {
  const d = save.get();
  ui.showTitle({
    best: d.best,
    stage: d.stage,
    coins: d.coins,
    saveOk: save.available,
    onStart: startPlay,
    onHangar: showHangar,
    onIntro: () => playIntro(showTitleScreen),
    onReset: () => ui.showResetConfirm({
      onConfirm: () => { save.reset(); showTitleScreen(); },
      onCancel: showTitleScreen,
    }),
  });
}

// 첫 접속이면 인트로 크롤 재생 후 타이틀, 그 외엔 바로 타이틀
if (save.get().introSeen) {
  showTitleScreen();
} else {
  save.set({ introSeen: true });
  playIntro(showTitleScreen);
}

// 개발/검증용 훅 (게임 동작에는 영향 없음)
window.__NF = {
  get state() { return state; },
  get run() { return run; },
  input,
  startPlay,
  // 헤드리스 검증용: rAF 없이 시뮬레이션을 n프레임 전진 (탭이 hidden이어도 동작)
  step(frames = 1, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) update(dt);
    draw();
  },
};
