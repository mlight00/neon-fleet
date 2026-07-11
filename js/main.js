// 진입점: 캔버스 관리 + 게임 루프 + 상태 머신 + 트랙 생성
import { BAL } from './balance.js';
import { createInput } from './input.js';
import { createStarfield, drawHUD, COLORS, glow } from './render.js';
import { Squad, Crystal, DronePod, GatePair, TriGate, Capsule, Creature, Meteor, Debris, PowerModule, Sniper, Turret, Weaver, Charger, Mine, Bomber, Zapper, Orbiter, Shielder, BroodCarrier, Blinker, MidBoss, Boss, createEffects } from './entities.js';
import { maybeAffix } from './affixes.js';
import { computeMfx, draftOptions, moduleSummary } from './modules.js';
import { evolutionOptions, evolutionDef } from './weapon-evolutions.js';
import { mulberry32, pickTier, pickChunk, isSafeChunk, chunkMinStage } from './chunks.js';
import { stageMods, hangarCost, scaleGate, generateSectorMap } from './logic.js';
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
let betweenStages = false; // 스테이지 클리어 요약 표시 중(게임 일시 정지)

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
    phase: 'track', boss: null, bosses: [], endT: 0,
    maxPower: squad.power, scrollY: 0,
    sector: 1, map: null, node: null, done: [], isBossNode: false,   // 섹터 분기 맵
  };
  startSector(1);
}

// ── 섹터 분기 맵 ─────────────────────────────────────────────
/** 섹터 시작: 맵 생성 → 맵 화면 */
function startSector(sector) {
  const r = run;
  r.sector = sector;
  r.map = generateSectorMap(sector, r.rng, BAL.sector.depth);
  r.node = null; r.done = [];
  const d = save.get();
  if (sector > (d.stage || 0)) save.set({ stage: sector });   // 최고 도달 섹터 기록
  enterSectorMap();
}

/** 맵 화면(갈림길 선택). 게임 정지 상태(state='map'). */
function enterSectorMap() {
  const r = run;
  state = 'map';
  playBgm('title');
  ui.showSectorMap({
    map: r.map, currentId: r.node ? r.node.id : null, doneIds: r.done,
    sector: r.sector, coins: r.world.coins, onPick: enterNode,
  });
}

/** 노드 진입: 타입별 인카운터로 분기 */
function enterNode(node) {
  const r = run;
  r.stage = (r.sector - 1) * (BAL.sector.depth + 1) + node.col + 1;   // 난이도 카운터(기존 스케일 재활용)
  r.node = node;
  if (node.type === 'repair') { enterRepair(node); return; }
  buildEncounter(node);
  state = 'play'; drafting = false; ui.hide();
  playBgm('battle1'); sfx('start');
  const label = { combat: '교전', elite: '정예 교전', hazard: '위험 지대', supply: '보급', boss: '섹터 보스' }[node.type] || '교전';
  r.effects.text(LOGICAL_W / 2, logicalH * 0.4, label, node.type === 'boss' ? COLORS.danger : COLORS.reward);
  r.effects.flash(0.3);
}

/** 정비 노드: 드론 회복 + 무료 모듈 1장 (트랙 없음) → 맵 복귀 */
function enterRepair(node) {
  const r = run;
  const heal = Math.max(BAL.sector.repairMin, Math.round(r.squad.count * BAL.sector.repairPct));
  r.squad.applyDelta(heal, r.world);
  sfx('pickup');
  const opts = draftOptions(r.modules, r.rng, 3);
  if (opts.length) {
    drafting = true; state = 'map';
    ui.showDraft({
      options: opts, owned: moduleSummary(r.modules),
      onPick(id) { r.modules.push(id); recomputeMfx(); drafting = false; sfx('buy'); completeNode(node); },
    });
  } else { completeNode(node); }
}

/** 노드 인카운터 트랙 구성 (타입별 청크 필터·길이·보스 게이트). r.stage는 enterNode에서 설정됨. */
function buildEncounter(node) {
  const r = run, w = r.world;
  const stage = r.stage;
  const mods = stageMods(stage);
  r.mods = mods; w.stageMods = mods;
  r.isBossNode = node.type === 'boss';
  w.scrollSpeed = BAL.scrollSpeed;
  w.entities.length = 0; w.bullets.length = 0; w.enemyBullets.length = 0;
  r.boss = null; w.boss = null; r.bosses = []; w.bosses = [];
  r.phase = 'track'; w.phase = 'track';
  r.traveled = 0; r.clearShown = false;
  const perRun = (node.type === 'hazard' || node.type === 'supply' || node.type === 'boss') ? BAL.sector.shortLen : BAL.sector.combatLen;
  const totalTrack = BAL.chunk.heightPx * perRun;
  r.totalTrack = totalTrack;
  const tb = BAL.chunk.tierBounds;
  const bounds = [Math.max(0.1, tb[0] - mods.tierShift), Math.max(0.35, tb[1] - mods.tierShift)];
  const rng = r.rng;
  const stageOk = (c) => chunkMinStage(c) <= stage;
  const has = (c, ...t) => c.items.some((it) => t.includes(it.type));
  const filt = node.type === 'supply' ? (c) => stageOk(c) && isSafeChunk(c) && has(c, 'crystal', 'capsule')
    : node.type === 'hazard' ? (c) => stageOk(c) && has(c, 'debris', 'mine')
      : stageOk;
  const pending = [];
  let prev = null;
  // 위험 노드는 debris/mine이 콘텐츠인데 안전-시작(isSafeChunk)을 강제하면 필터가 모순되어 일반 청크로 샘 → 0으로.
  const safeCount = node.type === 'boss' ? 1 : node.type === 'hazard' ? 0 : Math.min(3, 1 + Math.floor((stage - 1) / 4));
  for (let i = 0; i < perRun; i++) {
    const tier = pickTier(i / perRun, bounds);
    const f = i < safeCount ? (c) => filt(c) && isSafeChunk(c) : filt;
    const chunk = pickChunk(tier, rng, prev, f);
    prev = chunk;
    for (const it of chunk.items) {
      if (it.type === 'storm') continue;
      pending.push({ ...it, trackY: i * BAL.chunk.heightPx + it.y * BAL.chunk.heightPx });
    }
  }
  if (r.sector === 1 && node.col === 0) pending.push({ type: 'weaponGate', trackY: 380 }); // 무기 선택 1회(첫 노드)
  if (node.type === 'combat' || node.type === 'elite' || node.type === 'supply') {
    pending.push({ type: 'bonusGate', trackY: totalTrack * BAL.bonusGate.progress });
    for (let i = 0; i < BAL.pod.perRun; i++) {
      const prog = (i + 0.6) / BAL.pod.perRun;
      const size = prog < bounds[0] ? 'small' : prog < bounds[1] ? 'mid' : 'large';
      pending.push({ type: 'dronePod', trackY: totalTrack * Math.min(0.96, prog), x: 0.18 + 0.64 * rng(), size });
    }
  }
  if (node.type === 'elite') pending.push({ type: 'midboss', trackY: totalTrack * BAL.midboss.progress }); // 정예=미니보스
  pending.sort((a, b) => a.trackY - b.trackY);
  // 게이트류(전체폭 막대)가 화면에서 겹쳐 보이지 않게 최소 세로 간격 확보
  const GATE_TYPES = new Set(['gatePair', 'bonusGate', 'weaponGate']);
  const minGap = BAL.chunk.heightPx * 1.1;
  let lastGateY = -Infinity;
  for (const it of pending) {
    if (!GATE_TYPES.has(it.type)) continue;
    if (it.trackY - lastGateY < minGap) it.trackY = lastGateY + minGap;
    lastGateY = it.trackY;
  }
  pending.sort((a, b) => a.trackY - b.trackY);   // 간격 조정 후 재정렬
  r.pending = pending;
  r.squad.y = logicalH - 130;
  r.squad.dead = false;
}

/** 인카운터 클리어(트랙/보스 종료) → 코인 + 노드 완료 */
function onEncounterClear() {
  run.world.addCoins(BAL.run.coinPerClear * run.stage);
  completeNode(run.node);
}

/** 노드 완료 → 맵 복귀, 보스 노드면 다음 섹터 */
function completeNode(node) {
  const r = run;
  if (node && !r.done.includes(node.id)) r.done.push(node.id);
  const proceed = () => {
    if (node && node.type === 'boss') {
      r.effects.text(LOGICAL_W / 2, logicalH * 0.4, `섹터 ${r.sector} 클리어!`, COLORS.reward);
      startSector(r.sector + 1);
    } else {
      enterSectorMap();
    }
  };
  // 전투류 노드 완료 시 모듈 드래프트 1장 → 빌드를 초반부터 쌓게 (첫 전투 직후 첫 모듈)
  // 정비 노드(자체 드래프트)·보스(다음 섹터로) 제외
  const isEncounter = node && ['combat', 'elite', 'hazard', 'supply'].includes(node.type);
  if (isEncounter) {
    const opts = draftOptions(r.modules, r.rng, 3);
    if (opts.length) {
      drafting = true; state = 'map';
      ui.showDraft({
        options: opts, owned: moduleSummary(r.modules),
        onPick(id) { r.modules.push(id); recomputeMfx(); drafting = false; sfx('buy'); proceed(); },
      });
      return;
    }
  }
  proceed();
}

// (구 advanceStage 제거 — 섹터 맵의 onEncounterClear/completeNode가 진행을 담당)

function startPlay() {
  drafting = false;
  betweenStages = false;
  sfx('start');
  newExpedition();   // → startSector(1) → enterSectorMap(): 섹터 맵 화면(state='map'). 노드 선택 시 전투 시작.
}

// 모듈 효과 누적기 재계산 (모듈 획득 시)
function recomputeMfx() {
  run.world.mfx = computeMfx(run.modules);
  run.squad.swarmPerDrone = run.world.mfx.swarmPerDrone;
}

// 적 격파 시: 폭발 탄두(광역) + 전리 회수(드론) 모듈
function onEnemyKilled(e, w) {
  const mfx = w.mfx; if (!mfx) return;
  if (mfx.explodeRadius > 0) {
    w.effects.burst(e.x, e.y, '#ff9c41', 12, 180);
    w.effects.ring(e.x, e.y, '#ff9c41');
    const dmg = Math.max(2, (e.maxHp || 20) * mfx.explodeDmgFrac);
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
  if (state !== 'play' || drafting || betweenStages) return; // 드래프트·스테이지요약 중엔 게임 정지
  const r = run;
  const w = r.world;

  input.tick(dt);
  w.phase = r.phase;
  w.boss = r.boss; w.bosses = r.bosses;
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
      // 적 HP = 기본 × 스테이지배수 × 화력비례(상한 있음: 강해질수록 DPS가 앞서 쓸어버리는 손맛 — A2)
      // 무한 상승: 화력 비례 HP 상한을 스테이지마다 올려 깊은 판에선 즉사(방치 클리어) 방지
      const hpCapS = BAL.economy.enemyHpPowerCap + BAL.economy.enemyHpCapPerStage * (r.stage - 1);
      const pf = 1 + Math.min(hpCapS, Math.max(0, r.maxPower) / BAL.economy.enemyHpPowerScale);
      const scaleEnemy = (e) => { e.hp = e.maxHp = Math.round(e.hp * mods.enemyHp * pf); if (e.fireInterval) e.fireInterval *= mods.enemyRate; return e; };
      // 적 스폰 헬퍼: 스테이지 스케일 + 변이(어픽스) 롤 + 등록
      const spawnEnemy = (e, kind) => { scaleEnemy(e); maybeAffix(e, kind, r.stage, r.rng); w.entities.push(e); };
      // 적 항목은 enemyMult 배수만큼 복제 스폰: 복제본은 좌우 미러 + 세로로 살짝 시차.
      // 무한 상승: 스테이지가 깊을수록 복제 수↑ → 적이 많아 움직여야 생존
      const dup = Math.min(BAL.spawn.enemyMultMax, BAL.spawn.enemyMult + Math.floor((r.stage - 1) / BAL.spawn.enemyMultStageStep));
      if (it.type === 'crystal') w.entities.push(new Crystal(x, -60, Math.round(it.value * mods.crystal)));
      else if (it.type === 'gatePair') {
        const gs = (g) => scaleGate(g, r.stage, BAL.gate.flatScalePerStage, BAL.gate.flatScaleMax);
        w.entities.push(new GatePair(LOGICAL_W, -60, gs(it.left), gs(it.right)));
      }
      else if (it.type === 'creature') for (let k = 0; k < dup; k++) spawnEnemy(new Creature(k ? LOGICAL_W - x : x, -60 - 70 * k, it.size), 'creature');
      else if (it.type === 'splitter') for (let k = 0; k < dup; k++) spawnEnemy(new Creature(k ? LOGICAL_W - x : x, -60 - 70 * k, 'mid', { splits: 3 }), 'creature');
      else if (it.type === 'meteor') w.entities.push(new Meteor(x, -60, r.rng));
      else if (it.type === 'debris') w.entities.push(new Debris(x, -90, it.size));
      else if (it.type === 'power') w.entities.push(new PowerModule(x, -60));
      else if (it.type === 'sniper') for (let k = 0; k < dup; k++) spawnEnemy(new Sniper(k ? LOGICAL_W - x : x), 'sniper');
      else if (it.type === 'turret') for (let k = 0; k < dup; k++) spawnEnemy(new Turret(k ? LOGICAL_W - x : x, -60 - 90 * k), 'turret');
      else if (it.type === 'weaver') for (let k = 0; k < dup; k++) spawnEnemy(new Weaver(k ? !(it.x < 0.5) : it.x < 0.5, LOGICAL_W), 'weaver');
      else if (it.type === 'charger') for (let k = 0; k < dup; k++) spawnEnemy(new Charger(k ? LOGICAL_W - x : x), 'charger');
      else if (it.type === 'mine') for (let k = 0; k < dup; k++) spawnEnemy(new Mine(k ? LOGICAL_W - x : x), 'mine');
      else if (it.type === 'bomber') for (let k = 0; k < dup; k++) spawnEnemy(new Bomber(k ? LOGICAL_W - x : x), 'bomber');
      else if (it.type === 'zapper') for (let k = 0; k < dup; k++) spawnEnemy(new Zapper(k ? LOGICAL_W - x : x), 'zapper');
      else if (it.type === 'orbiter') for (let k = 0; k < dup; k++) spawnEnemy(new Orbiter(k ? LOGICAL_W - x : x), 'orbiter');
      else if (it.type === 'shielder') spawnEnemy(new Shielder(x), 'shielder');       // 단일(주기 방패)
      else if (it.type === 'carrier') spawnEnemy(new BroodCarrier(x), 'carrier');      // 단일(드론 사출)
      else if (it.type === 'blinker') for (let k = 0; k < dup; k++) spawnEnemy(new Blinker(k ? LOGICAL_W - x : x, LOGICAL_W), 'blinker');
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

    if (r.traveled >= r.totalTrack && r.pending.length === 0 && !r.isBossNode) {
      // 비보스 노드: 보스 없이 통과 연출 → 맵 복귀
      r.phase = 'flythrough'; r.flyV = BAL.flythrough.startV; r.clearShown = true;
    } else if (r.traveled >= r.totalTrack && r.pending.length === 0) {
      r.phase = 'boss';
      w.scrollSpeed = 40; // 보스전: 트랙 거의 정지, 별만 천천히
      sfx('boss_in');
      playBgm('boss'); // 보스 BGM으로 크로스페이드
      // 무한 상승: 스테이지가 깊을수록 보스 2~3기 동시 등장 (가로 슬롯 배치)
      const bossN = r.stage >= BAL.boss.multiFromStage3 ? 3 : r.stage >= BAL.boss.multiFromStage2 ? 2 : 1;
      const hpCap = Math.max(BAL.boss.hp, r.maxPower * BAL.boss.hpPerPowerCap); // A4: 화력 대비 상한 → 처치시간 상한
      const totalMult = bossN > 1 ? BAL.boss.multiTotalMult : 1;                 // 다중 총 HP 배수(각=이/보스수)
      r.bosses = [];
      for (let i = 0; i < bossN; i++) {
        const b = new Boss(LOGICAL_W, r.mods.enemyRate, r.stage, bossN > 1 ? 0.72 : 1);
        b.homeX = LOGICAL_W * (i + 1) / (bossN + 1);   // 가로 슬롯
        b.x = b.homeX;
        b.swayScale = 1 / bossN;                        // 좌우 폭 축소 → 겹침 방지
        const variantHp = 1 + BAL.bossVariant.hpPerLoop * b.variantLevel;
        const rawHp = Math.max(BAL.boss.hp, r.maxPower * BAL.boss.hpPerPower) * r.mods.boss * (b.pattern.tanky ?? 1) * variantHp;
        b.hp = b.maxHp = Math.round(Math.min(rawHp * totalMult / bossN, hpCap));
        r.bosses.push(b);
      }
      r.boss = r.bosses[0];   // 연출·클리어 배너 앵커용 선두
    }
  } else if (r.phase === 'boss') {
    r.scrollY += 30 * dt;
    for (const b of r.bosses) { if (b.dead) b.deathT += dt; else b.update(dt, w); }  // 죽은 보스는 페이드, 산 보스는 교전 지속
    w.boss = r.bosses.find((b) => !b.dead) || r.bosses[0];   // 호밍 표적 = 살아있는 선두
    if (r.bosses.every((b) => b.dead)) {
      // 전원 격파 → 파괴 연출 시작
      r.phase = 'bossDeath';
      r.seqT = 0;
      r.chainT = 0;
      sfx('boss_die');
      playBgm('title'); // 승리 여운 BGM으로 전환
    }
  } else if (r.phase === 'bossDeath') {
    // 보스 위에서 연쇄 폭발이 터지며 파괴
    r.squad.invulnT = Math.max(r.squad.invulnT, BAL.flythrough.invuln);   // 클리어 연출 중 무적 (잔여 적 충돌 방지)
    r.seqT += dt;
    for (const b of r.bosses) b.deathT = r.seqT;
    r.scrollY += 30 * dt;
    r.chainT -= dt;
    if (r.chainT <= 0) {
      r.chainT = BAL.bossDeath.chainInterval;
      const ab = r.bosses[Math.floor(Math.random() * r.bosses.length)];  // 여러 보스 위로 폭발 분산
      const bx = ab.x + (Math.random() - 0.5) * ab.r * 2.4;
      const by = ab.y + (Math.random() - 0.5) * ab.r * 1.4;
      r.effects.burst(bx, by, COLORS.danger, 18, 220);
      r.effects.burst(bx, by, COLORS.reward, 10, 160);
      r.effects.ring(bx, by, Math.random() < 0.5 ? COLORS.reward : COLORS.danger);
      r.effects.flash(0.22);
      sfx(Math.random() < 0.5 ? 'explode_s' : 'explode_l');
    }
    r.squad.update(dt, w); // 우주선은 사격하며 대기
    if (r.seqT >= BAL.bossDeath.duration) {
      // 마지막 대폭발 → 통과 시작
      for (const b of r.bosses) { r.effects.burst(b.x, b.y, COLORS.reward, 40, 320); r.effects.burst(b.x, b.y, '#ffffff', 20, 260); r.effects.ring(b.x, b.y, COLORS.reward); }
      r.effects.flash(0.6);
      sfx('explode_l');
      r.phase = 'flythrough';
      r.flyV = BAL.flythrough.startV;
      r.clearShown = false;
    }
  } else if (r.phase === 'flythrough') {
    // 우주선이 가속하며 보스 잔해를 뚫고 화면 위로 통과
    r.squad.invulnT = Math.max(r.squad.invulnT, BAL.flythrough.invuln);   // 상단 통과 중 무적 유지 (남은 적과 충돌 피해 방지)
    r.flyV += BAL.flythrough.accel * dt;
    r.squad.y -= r.flyV * dt;
    r.scrollY += r.flyV * dt * 0.6; // 별이 빠르게 흐름
    for (const b of r.bosses) b.deathT += dt;
    r.squad.update(dt, w);
    // 보스 위치를 지나는 순간 "STAGE CLEAR" 배너
    if (!r.clearShown && r.boss && r.squad.y < r.boss.y + 30) {
      r.clearShown = true;
      r.effects.text(LOGICAL_W / 2, logicalH * 0.42, 'STAGE CLEAR!', COLORS.ally);
      r.effects.ring(LOGICAL_W / 2, logicalH * 0.42, COLORS.ally);
      r.effects.flash(0.4);
      sfx('evolve');
    }
    if (r.squad.y < BAL.flythrough.exitY) { onEncounterClear(); return; }
  }

  // 개체 업데이트
  for (const e of w.entities) e.update(dt, w);
  for (const b of w.bullets) b.update(dt, w);
  for (const b of w.enemyBullets) b.update(dt, w);
  r.effects.update(dt);

  // 아군 탄 vs 표적 (크리스탈/크리처/운석/보스). 레이저는 관통(횟수 차감 + 감쇠).
  for (const b of w.bullets) {
    if (b.dead) continue;
    if (r.phase === 'boss') {
      let hitBoss = false;
      for (const bo of r.bosses) {
        if (bo.dead) continue;
        const dx = b.x - bo.x, dy = b.y - bo.y;
        if (dx * dx + dy * dy <= (bo.r * 1.4) ** 2) {
          const siegeBonus = b.blast ? (1 + b.blast.bossBonus) : 1;  // 시즈 토피도 보스 직격 +15%
          bo.hitByBullet(b.damage * (w.mfx?.bossDmgMult ?? 1) * siegeBonus, w, b);
          b.onHit?.(bo, w);            // 시즈 폭발(도탄/분열은 보스전에서 대상 없음)
          b.dead = true; hitBoss = true; // 보스는 관통 불가 (거대 표적)
          break;
        }
      }
      if (hitBoss) continue;
    }
    for (const e of w.entities) {
      if (e.dead || !e.hitByBullet) continue;
      if (b.hitSet && b.hitSet.has(e)) continue;
      const rr = (e.r ?? 20) + b.r;
      const dx = b.x - e.x, dy = b.y - e.y;
      if (dx * dx + dy * dy <= rr * rr) {
        const wasAlive = !e.dead;
        e.hitByBullet(e.def ? b.damage * (w.mfx?.bossDmgMult ?? 1) : b.damage, w, b); // 탄환 문맥 전달(프리즘 코어 등)
        b.onHit?.(e, w);   // 진화 온-히트(도탄/분열/폭발) — 각 1회, 비재귀
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
  // 널 커터 강화탄: 경로 반경 안의 적탄 제거
  for (const b of w.bullets) if (b.cutter) for (const eb of w.enemyBullets) if (!eb.dead && Math.hypot(eb.x - b.x, eb.y - b.y) <= b.cutter) eb.dead = true;

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

  // 선택 요청 소비 (우선순위: 교리 > 무기 진화). 보스·연출 중엔 열지 않는다.
  if (r.phase === 'track' && !drafting) {
    if (r.squad.pendingWeaponEvolution) openWeaponEvolution(r.squad.pendingWeaponEvolution);
  }
}

// 무기 진화 2택 선택창 (게임 일시 정지). 선택 시 해당 무기의 진화 확정.
function openWeaponEvolution(weapon) {
  const r = run;
  const opts = evolutionOptions(weapon);
  if (!opts.length) { r.squad.pendingWeaponEvolution = null; return; }
  drafting = true;
  sfx('evolve');
  ui.showWeaponEvolution({
    weapon, options: opts,
    onPick(id) {
      r.squad.weaponEvolutions[weapon] = id;
      r.squad.pendingWeaponEvolution = null;
      drafting = false;
      ui.hide();
      sfx('buy');
      r.effects.flash(0.6);
      r.effects.text(r.squad.x, r.squad.y - 60, `${opts.find((o) => o.id === id).name}!`, COLORS.reward, 18);
    },
  });
}

// 원정 종료 (사망 또는 끝내기): 코인·기록 정산 → 결과 화면
function endExpedition({ toTitle = false } = {}) {
  state = 'done';
  drafting = false;
  betweenStages = false;
  playBgm('title');
  const r = run;
  const data = save.get();
  const isRecord = r.maxPower > data.best;
  const best = Math.max(data.best, r.maxPower);
  const coins = Math.round(r.world.coins * r.world.stats.coinMult);
  // 기록 저장: '최고 도달 섹터'는 r.sector (표시용). r.stage는 내부 난이도 카운터라 저장하면 안 됨(오표시 원인).
  save.set({ best, coins: data.coins + coins, stage: Math.max(data.stage, r.sector) });
  if (toTitle) { showTitleScreen(); return; }
  ui.showLose({ stage: r.sector, maxPower: r.maxPower, coins, best, isRecord, modules: moduleSummary(r.modules), onRetry: startPlay, onHangar: showHangar });
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
  syncPlayButtons();   // 상태에 따라 일시정지·차지 버튼 표시/숨김 (draw는 headless step에서도 호출됨)
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
    // 상단 진입 페이드: 개체가 화면 위 경계(y=0)를 넘어 들어올 때 딱딱하게 '잘려' 보이지 않도록
    // 경계에서 투명 → 스프라이트가 완전히 들어오면 불투명. (스프라이트 자체는 정상, 경계 클리핑이 원인)
    for (const e of r.world.entities) {
      const fz = (e.r || 24) * 2;                 // 페이드 구간 ≈ 스프라이트 상단이 경계를 통과할 때까지
      if (e.y < fz) {
        const a = e.y / fz;                       // y=0 → 0, y=fz → 1
        if (a <= 0.02) continue;                  // 아직 화면 밖 → 그리지 않음
        ctx.save(); ctx.globalAlpha = a; e.draw(ctx); ctx.restore();
      } else e.draw(ctx);
    }
    if (r.bosses && r.bosses.length && r.phase !== 'track') {
      for (const b of r.bosses) {
        const fz = (b.r || 40) * 2;
        if (b.y > 0 && b.y < fz) { ctx.save(); ctx.globalAlpha = Math.max(0.05, b.y / fz); b.draw(ctx); ctx.restore(); }
        else b.draw(ctx);
      }
    }
    for (const b of r.world.bullets) b.draw(ctx);
    for (const b of r.world.enemyBullets) b.draw(ctx);
    if (!r.squad.dead) r.squad.draw(ctx);
    r.effects.draw(ctx, LOGICAL_W, logicalH);

    const evc = r.world.mfx?.evolveCostMult ?? 1;
    const maxTier = BAL.evolution.names.length - 1;
    const needCruisers = r.squad.tier < maxTier ? Math.max(1, Math.round(BAL.escort.cruisersPerFlagship * evc)) : 0;
    drawHUD(ctx, LOGICAL_W, {
      progress: Math.min(1, r.traveled / r.totalTrack),
      bosses: r.phase === 'boss' ? r.bosses.map((b) => ({ hp: Math.max(0, b.hp), maxHp: b.maxHp, name: b.korName, dead: b.dead })) : [],
      count: r.squad.count,
      cruisers: r.squad.cruisers || 0,
      tierName: BAL.shipTraits[Math.min(r.squad.tier, BAL.shipTraits.length - 1)].tag,
      shipName: BAL.evolution.names[Math.min(r.squad.tier, BAL.evolution.names.length - 1)],
      tierPower: Math.round(r.squad.banked || 0),
      upgradeCur: r.squad.cruisers || 0,   // 기함 업그레이드까지 모은 순양함
      upgradeMax: needCruisers,            // 필요한 순양함 (0 = 최종 티어)
      stage: r.sector,
      weapon: r.squad.weapon,
      weaponLv: r.squad.weaponLv,
      weaponEvo: evolutionDef(r.squad.weaponEvolutions[r.squad.weapon])?.short,
      shield: r.squad.shield,
      modules: moduleSummary(r.modules),
    });
  }

  ctx.restore();
}

// ───────────────────────── 일시정지 (ESC)
let paused = false;
function togglePause() {
  if (state !== 'play' || drafting || betweenStages) return;   // 플레이 중 + 드래프트·요약 아닐 때만
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

// 일시정지·차지 버튼은 실제 플레이 중(state='play')에만 표시 — 결과/맵/격납고 화면에선 숨김
function syncPlayButtons() {
  const d = (state === 'play' && !paused && !drafting) ? '' : 'none';
  if (pauseBtn.style.display !== d) pauseBtn.style.display = d;
  if (chargeBtn.style.display !== d) chargeBtn.style.display = d;
}

// ───────────────────────── 루프
let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  if (!paused && !drafting && !betweenStages) update(dt);   // 일시정지·드래프트·요약 중엔 화면만 유지
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
