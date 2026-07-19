// 진입점: 캔버스 관리 + 게임 루프 + 상태 머신 + 트랙 생성
import { BAL } from './balance.js';
import { createInput } from './input.js';
import { createStarfield, drawHUD, drawCoreLoopHud, COLORS, glow, WEAPON_LABELS, WEAPON_COLORS } from './render.js';
import { Squad, Crystal, DronePod, GatePair, TriGate, Capsule, Creature, Meteor, Debris, PowerModule, Sniper, Turret, Weaver, Charger, Mine, Bomber, Zapper, Orbiter, Shielder, BroodCarrier, Blinker, MidBoss, Boss, makeBoss, createEffects, Bullet, HomingMissile } from './entities.js';
import { bossDefById, preloadBossArt } from './sprites.js';
import { maybeAffix } from './affixes.js';
import { computeMfx, draftOptions, moduleSummary } from './modules.js';
import { evolutionOptions, superEvolutionOptions, evolutionDef } from './weapon-evolutions.js';
import { DOCTRINES, DOCTRINE_BY_ID, doctrineIcon } from './doctrines.js';
import { keystoneIcon, KEYSTONES, freshKeystoneState } from './keystones.js';
import { claimKill } from './kill-events.js';
import { PrismWarden, Scavenger, GateParasite } from './adaptive-enemies.js';
import { mulberry32, pickTier, pickChunk, isSafeChunk, isTutorialSafeChunk, chunkMinTier } from './chunks.js';
import { stageMods, hangarCost, scaleGate, generateSectorMap, failureReward, copyCount, progressionFor, nodeCoinReward, nodeModuleGrant, campaignBossId, progressPatch, bossCountFor } from './logic.js';
import { preloadStyle, setArtStyle, getArtStyle, STYLE_NAMES } from './sprites.js';
import { createSave } from './save.js';
import { ui } from './ui.js';
import { initAudio, unlockAudio, playBgm, setBgmIntensity, sfx, toggleMute, isMuted, setBgmVolume, setSfxVolume, getSettings } from './audio.js';
import { playIntro } from './intro.js';
import { createZoneBackdrop } from './zone-backdrop.js';
// ── Gate 1: 8분 핵심 재미 (전면개편 §5). ?coreLoopTest=1 하네스에서 전체 스택을 구동. ──
import { createRunMetrics } from './run-metrics.js';
import { createRunDirector, tickDirector, elapsed, nextEvent } from './run-director.js';
import { createResonanceState, setLoadout as resonSetLoadout, onHit as resonOnHit, tick as resonTick,
  tryProc as resonTryProc, onLaserMark as resonLaserMark, onEnemyRemoved as resonEnemyRemoved,
  isSeekerHit, chargeFrac as resonChargeFrac, shouldTelegraph as resonShouldTelegraph, RESONANCES } from './resonances.js';
import { createSurvivability, onTierUp as survTierUp, hullFrac, addShield } from './survivability.js';
import { createFrameState, setFrame as frameSet, frameOnKill, tickFrame, frameHud } from './command-frames.js';
import { createLoadout, equip as loadoutEquip } from './weapon-loadout.js';
import { CORE_LOOP_BUILDS, coreLoopBuild, eventAction, frameForBuild } from './core-loop.js';
import { regionAt as c25RegionAt, regionByIndex as c25Region, buildCampaign25Schedule, eventAction25 } from './campaign25.js';

const _clParams = new URLSearchParams(location.search);
const CORE_LOOP = _clParams.has('coreLoopTest');        // 사람 플레이(H0·내구도100·무기1·조작 가능)
const CORE_MEASURE = _clParams.has('coreLoopMeasure');  // 자동 측정 재생(autopilot+auto-select, 헤드리스 시뮬)
const CAMPAIGN25 = _clParams.has('campaign25');         // Gate 2: 25분 6지역 시간 캠페인(측정·개발용 진입)
const BOSSLAB = _clParams.has('bosslab');               // 보스 패턴 프리뷰: ?bosslab=1&boss=B14 (개발/테스트용)

const LOGICAL_W = BAL.logicalW;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Pretendard 즉시 로드 → 캔버스 텍스트가 폴백(Segoe UI) 대신 Pretendard로 렌더되게. 로드되면 매 프레임 재렌더가 반영.
try { document.fonts?.load('700 16px Pretendard').then(() => document.fonts.load('400 16px Pretendard')); } catch { /* 폰트 API 미지원 시 CSS 폴백 */ }

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
const zoneBackdrop = createZoneBackdrop(LOGICAL_W);
const save = createSave();

// 오디오: 첫 사용자 제스처(탭/클릭/키)에서 AudioContext 잠금 해제 후 타이틀 BGM 시작
initAudio(save);
function firstGestureUnlock() {
  unlockAudio();
  setBgmIntensity(0.2); playBgm('title');
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
      <label>🎵 배경음악 <input id="snd-bgm" type="range" min="0" max="100" value="${Math.round(snd.bgm * 100)}"></label>
      <label>🔊 효과음 <input id="snd-sfx" type="range" min="0" max="100" value="${Math.round(snd.sfx * 100)}"></label>
      <button id="snd-mute">${snd.mute ? '🔊 음소거 해제' : '🔇 음소거'}</button>
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
    muteToggle.textContent = muted ? '🔊 음소거 해제' : '🔇 음소거';
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
function newExpedition(mode = 'campaign') {
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
    notifyEnemyKilled(e) { onEnemyKilled(e, this); },   // 랜스·메아리·시즈 등 entities.js 킬 경로가 호출하는 중앙 알림
  };
  run = {
    world, squad, effects, rng,
    stage: 1, mods: world.stageMods,
    modules: [],                  // 뽑은 모듈 id 누적 (중복 = 스택)
    pending: [], traveled: 0, totalTrack: 0,
    phase: 'track', boss: null, bosses: [], endT: 0,
    maxPower: squad.power, scrollY: 0,
    sector: 1, map: null, node: null, done: [], isBossNode: false,   // 섹터 분기 맵
    mode,                                                            // 'campaign' | 'endless' (§6)
  };
  // 엔드리스는 캠페인 이후 섹터(7)부터 시작 → 보스 순환·변주·다중 보스가 자연히 강해진다.
  startSector(mode === 'endless' ? BAL.campaign.sectors + 1 : 1);
}

// ── 섹터 분기 맵 ─────────────────────────────────────────────
/** 섹터 시작: 맵 생성 → 맵 화면 */
function startSector(sector) {
  const r = run;
  r.sector = sector;
  r.map = generateSectorMap(sector, r.rng, BAL.sector.depth);
  r.node = null; r.done = [];
  // 최고 도달 섹터 기록 — 캠페인은 stage, 엔드리스는 endlessBest에만 (기록 완전 분리)
  const p = progressPatch(r.mode, sector, save.get());
  if (Object.keys(p).length) save.set(p);
  enterSectorMap();
}

/** 맵 화면(갈림길 선택). 게임 정지 상태(state='map'). */
function enterSectorMap() {
  const r = run;
  state = 'map';
  setBgmIntensity(0.2); playBgm('title');
  const d = save.get();
  // 첫 출격: 루트 노드(단일 선택지)는 자동 진입하되, 그 전에 조작 안내를 1회 표시 (지시서 A-4 §3.5).
  if (r.sector === 1 && r.done.length === 0 && !d.firstGuideSeen) {
    const root = r.map.cols[0][0];
    ui.showFirstGuide({ onStart: () => { save.set({ firstGuideSeen: true }); enterNode(root); } });
    return;
  }
  ui.showSectorMap({
    map: r.map, currentId: r.node ? r.node.id : null, doneIds: r.done,
    sector: r.sector, coins: r.world.coins, onPick: enterNode,
  });
}

/** 노드 진입: 타입별 인카운터로 분기 */
function enterNode(node) {
  const r = run;
  // 진행 3축 분리(지시서 §4.2): sector/contentTier/difficultyLevel/bossTier. 밸런스 계산은 이 값들을 쓴다.
  r.progression = progressionFor(r.sector, node.col, BAL.sector.depth);
  r.legacyStage = (r.sector - 1) * (BAL.sector.depth + 1) + node.col + 1;   // 과도기 호환용(신규 밸런스 계산엔 미사용)
  r.node = node;
  if (node.type === 'repair') { enterRepair(node); return; }
  buildEncounter(node);
  state = 'play'; drafting = false; ui.hide();
  setBgmIntensity(0.3); playBgm('battle1'); sfx('start');
  const label = { combat: '교전', elite: '정예 교전', hazard: '위험 지대', supply: '보급', boss: '섹터 보스' }[node.type] || '교전';
  r.effects.text(LOGICAL_W / 2, logicalH * 0.4, label, node.type === 'boss' ? COLORS.danger : COLORS.reward);
  r.effects.flash(0.3);
}

/** 정비 노드(트랙 없음): [긴급 수리] 드론 회복 vs [모듈 정비] 코인 지불→모듈 3택 (택1, §5.5) → 맵 복귀 */
function enterRepair(node) {
  const r = run;
  state = 'map';
  const cost = BAL.nodeReward.repairModuleCostPerSector * r.sector;              // 25 × sector
  const heal = Math.max(BAL.nodeReward.repairHealMin, Math.round(r.squad.count * BAL.nodeReward.repairHealPct));  // max(12, count×0.35)
  ui.showRepair({
    heal, cost, coins: r.world.coins, canAfford: r.world.coins >= cost,
    onHeal() { r.squad.applyDelta(heal, r.world); sfx('pickup'); completeNode(node); },
    onModule() {
      if (r.world.coins < cost) return;   // 방어: 부족 시 무시(버튼도 비활성)
      r.world.addCoins(-cost);
      const opts = draftOptions(r.modules, r.rng, 3);
      if (opts.length) {
        drafting = true;
        ui.showDraft({
          options: opts, owned: moduleSummary(r.modules),
          onPick(id) { r.modules.push(id); recomputeMfx(); drafting = false; sfx('buy'); completeNode(node); },
        });
      } else { completeNode(node); }
    },
  });
}

/** 노드 인카운터 트랙 구성 (타입별 청크 필터·길이·보스 게이트). r.progression은 enterNode에서 설정됨. */
function buildEncounter(node) {
  const r = run, w = r.world;
  const { contentTier, difficultyLevel } = r.progression;   // 해금=contentTier, 난이도=difficultyLevel
  const mods = stageMods(difficultyLevel);
  r.mods = mods; w.stageMods = mods;
  r.isBossNode = node.type === 'boss';
  r.tutorial = r.sector === 1 && node.col === 0;   // 첫 원정 첫 노드 = 조작 학습 구간(안전 청크·복제 제한)
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
  // 콘텐츠 해금은 노드 열과 무관하게 섹터(=contentTier)로만 결정 → 같은 섹터 내 해금이 일정(지시서 §4.7).
  const tierOk = (c) => chunkMinTier(c) <= contentTier;
  const has = (c, ...t) => c.items.some((it) => t.includes(it.type));
  const filt = node.type === 'supply' ? (c) => tierOk(c) && isSafeChunk(c) && has(c, 'crystal', 'capsule')
    : node.type === 'hazard' ? (c) => tierOk(c) && has(c, 'debris', 'mine')
      : tierOk;
  const pending = [];
  let prev = null;
  // 위험 노드는 debris/mine이 콘텐츠인데 안전-시작(isSafeChunk)을 강제하면 필터가 모순되어 일반 청크로 샘 → 0으로.
  const safeCount = node.type === 'boss' ? 1 : node.type === 'hazard' ? 0 : Math.min(3, 1 + Math.floor((difficultyLevel - 1) / 2));
  // 첫 노드: 모든 청크를 튜토리얼-안전으로 제한(나쁜 게이트·위협 적 배제). 그 외: 앞 safeCount칸만 안전.
  const tutFilt = (c) => filt(c) && isTutorialSafeChunk(c);
  for (let i = 0; i < perRun; i++) {
    const tier = pickTier(i / perRun, bounds);
    const f = r.tutorial ? tutFilt : (i < safeCount ? (c) => filt(c) && isSafeChunk(c) : filt);
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
  const GATE_TYPES = new Set(['gatePair', 'bonusGate', 'weaponGate', 'corruptedGate']);
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
  // 노드 시작: 키스톤 누적 카운터·타이머·예약 리셋 (선택한 키스톤 id는 유지) + FLOW 0
  r.squad.keystoneState = freshKeystoneState();
  r.squad.flow = 0; r.squad.rushT = 0; r.squad.grazeCombo = 0; r.squad.sinceGraze = Infinity;
  // §5.6: Gate 1 내구도 모델에선 순양함 HP를 장면 전환 뒤에도 유지한다(만피 초기화 금지). 구 모델은 기존대로.
  if (!r.squad.surv) { r.squad.cruiserHp = []; r.squad.cruiserFlash = []; }
}

/** 인카운터 클리어(트랙/보스 종료) → 코인 + 노드 완료 */
function onEncounterClear() {
  const r = run;
  // 노드 클리어 코인 = baseNodeCoins(sector,col) × 타입 배수 (§5.2)
  r.world.addCoins(nodeCoinReward(r.sector, r.node.col, r.node.type, BAL.nodeReward.coinMult));
  completeNode(r.node);
}

/** 노드 완료 → 맵 복귀, 보스 노드면 다음 섹터 */
function completeNode(node) {
  const r = run;
  if (node && !r.done.includes(node.id)) r.done.push(node.id);
  const proceed = () => {
    if (node && node.type === 'boss') {
      // 캠페인 최종 보스(섹터 6 하이브 퀸) 격파 → 승리 화면(자동 섹터 7 진행 안 함, §6.2/6.3)
      if (r.mode !== 'endless' && r.sector >= BAL.campaign.sectors) { winCampaign(); return; }
      r.effects.text(LOGICAL_W / 2, logicalH * 0.4, `섹터 ${r.sector} 클리어!`, COLORS.reward);
      const nextSector = () => startSector(r.sector + 1);
      // 첫 섹터 보스 격파 후 다음 섹터 맵 전에 키스톤 3택 (원정당 1개)
      if (r.sector === 1 && !r.squad.keystone) openKeystone(nextSector);
      else nextSector();
    } else {
      enterSectorMap();
    }
  };
  // 노드 타입별 모듈 지급 계약 (§5.3, logic.nodeModuleGrant): combat·hazard=일반 3택,
  // elite=4택(희귀 보장), supply=없음, repair=자체 UI, boss=다음 섹터/키스톤.
  const grant = node && nodeModuleGrant(node.type, BAL.nodeReward.eliteDraftCount);
  if (grant) {
    const opts = draftOptions(r.modules, r.rng, grant.count, !!grant.rare);
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
  if (BOSSLAB) { startBossLab(_clParams.get('boss') || 'B14'); return; }   // ?bosslab=1&boss=B14: 보스 패턴 프리뷰
  if (CAMPAIGN25) { startCampaign25({ mode: _clParams.has('play') ? 'play' : 'measure', buildId: 'railStorm' }); return; }  // ?campaign25=1 자동시연 / &play=1 사람 조작
  if (CORE_MEASURE) { startCoreLoop({ mode: 'measure', buildId: 'railStorm' }); return; }  // ?coreLoopMeasure=1: 자동 측정
  if (CORE_LOOP) { startCoreLoop({ mode: 'play' }); return; }   // ?coreLoopTest=1: 사람 플레이 8분 슬라이스
  newExpedition();   // → startSector(1) → enterSectorMap(): 섹터 맵 화면(state='map'). 노드 선택 시 전투 시작.
}

/** 보스 패턴 프리뷰(개발/테스트): 지정 보스를 즉시 등장시켜 패턴만 관찰·연습. 처치 시 재소환. */
function startBossLab(bossId = 'B14') {
  drafting = false; betweenStages = false;
  newExpedition('campaign');
  const r = run, sq = r.squad;
  sq.tier = 3; sq.count = 60; sq.banked = 200;   // 관찰용 중간 화력
  sq.weapon = 'vulcan'; sq.weaponLv = 3;
  r.maxPower = sq.power;
  enterNode(r.map.cols[0][0]);
  r.totalTrack = 1e12; r.pending = [];
  r.bossLab = bossId;
  spawnBossLabBoss(bossId);
}

/** 보스랩용 보스 즉시 등장(정상 HP — 패턴을 충분히 관찰하도록 클램프 없음). */
function spawnBossLabBoss(bossId) {
  const r = run, w = r.world;
  r.phase = 'boss'; w.phase = 'boss'; r.pending = [];
  const boss = makeBoss(LOGICAL_W, r.mods.enemyRate / BAL.difficulty.bossRateMult, 6, 1, bossId);
  boss.homeX = LOGICAL_W / 2; boss.x = boss.homeX;
  r.bosses = [boss]; w.bosses = [boss]; r.boss = boss; w.boss = boss;
  preloadBossArt(bossId);
  playBgm('boss'); setBgmIntensity(0.86); sfx('boss_in');
  r.effects.text(LOGICAL_W / 2, logicalH * 0.35, boss.korName || bossId, COLORS.danger, 20);
}

// ═══════════ Gate 1: 8분 핵심 재미 하네스 (전면개편 §5, ?coreLoopTest=1) ═══════════
// 기존 캠페인은 손대지 않는다. 이 하네스는 디렉터·무기 2슬롯·공명·기함 내구도·프레임·측정을
// 한 판에서 구동해 통과 수치와 화면을 만든다.

/**
 * Gate 1 8분 슬라이스 시작. 두 모드 (Codex G1-01/02 반영):
 *  play    — 사람이 조작·선택. H0·내구도 100·무기 1개(시작 선택)·소편대. 자동 운전 없음.
 *  measure — 자동 재생(autopilot + auto-select). 헤드리스 시뮬·TTK 측정 전용. 생존 보정 hullMax·완성빌드 화력.
 * 결과 화면은 이 시점에 기록한 실제 시작 스냅샷(startTier/startHull/startWeapon)을 쓴다.
 */
function startCoreLoop(opts = {}) {
  const mode = opts.mode === 'measure' ? 'measure' : 'play';
  const auto = mode === 'measure';
  const buildId = opts.buildId || 'railStorm';
  const build = coreLoopBuild(buildId);
  drafting = false; betweenStages = false;
  newExpedition('campaign');            // world/squad/run 생성
  const r = run, sq = r.squad, w = r.world;
  const surv = createSurvivability(BAL.gate1.survivability);
  const reson = createResonanceState();
  const frameState = createFrameState();
  // play: 시작 무기는 사람이 0:00에 선택(그때까지 vulcan 임시). measure: 빌드의 주무기 고정.
  const startMain = auto ? build.main : 'vulcan';
  sq.installGate1({ surv, reson, frameState, frameId: null, mainWeapon: startMain });
  const metrics = createRunMetrics({ runId: `coreLoop-${mode}-${buildId}`, seed: (Math.random() * 2 ** 31) | 0 });
  const director = createRunDirector(BAL.gate1.timeline);
  w.metrics = metrics;
  w.reson = reson;
  w.onHullDepleted = () => metrics.gameOver('hull', elapsed(director));
  r.coreLoop = {
    mode, auto, build, buildId, director, metrics,
    telegraph: false, resonActivated: false, bossSpawned: false, resultShown: false, picking: false,
    startTier: 0, startHull: surv.hull, startWeapon: null, awaitingStart: !auto,
  };
  if (auto) {
    if (build.stress) {
      // 무적 방지 검증: 타이탄+순양함 만석+드론 대량이어도 내구도 100 그대로(0 도달 가능).
      sq.tier = BAL.evolution.names.length - 1; sq.cruisers = BAL.escort.maxCruisers; sq.count = 400; sq.banked = 4000;
    } else {
      // 측정 전용 보정: 헤드리스 자동회피가 사람만큼 못 피하므로 타임라인·TTK를 끝까지 재려고 내구도 여유.
      surv.hullMax = surv.hull = BAL.gate1.survivability.measureHullMax;
      sq.count = 70; sq.banked = 260; sq.tier = 2;
    }
    r.maxPower = sq.power;
    r.coreLoop.startTier = sq.tier; r.coreLoop.startHull = surv.hull; r.coreLoop.startWeapon = build.main;
  } else {
    // play: 정직한 시작 — H0·내구도 100·소편대·무기 1개(선택 대기).
    sq.tier = 0; sq.banked = 0; sq.cruisers = 0;
    sq.count = w.stats?.startCount ?? BAL.squad.start;
    r.maxPower = sq.power;
    r.coreLoop.startTier = 0; r.coreLoop.startHull = surv.hull;
  }
  window.__nfRunMetrics = null;
  enterNode(r.map.cols[0][0]);           // 첫 전투 노드 직접 진입 (맵 스킵) → state='play'
  r.totalTrack = 1e12;                    // 트랙 종료로 인한 조기 클리어 방지(디렉터가 8분을 관리)
  r.pending = [];
  refillCoreLoopTrack();
  if (auto) resonSetLoadout(reson, [build.main, null]);   // 측정: 로드아웃 즉시 반영(공명은 4:30 활성)
  else openCoreLoopStartPick();                            // play: 0:00 시작 무기 선택(게임 정지)
  return r.coreLoop;
}

/** 코어루프 선택창 열기(§5.1). play 모드=게임 정지 + DOM 카드. measure 모드=자동으로 index 0 선택. */
function openCoreLoopPick({ title, subtitle, options, onPick, autoIdx = 0 }) {
  const cl = run.coreLoop;
  if (cl.auto) { onPick(options[autoIdx].id, autoIdx); return; }   // 측정: 자동 선택(정지 없음)
  drafting = true; cl.picking = true; state = 'play';
  ui.showCoreLoopPick({ title, subtitle, options, onPick: (id, idx) => { ui.hide(); drafting = false; cl.picking = false; sfx('buy'); onPick(id, idx); } });
}

/** 0:00 시작 무기 선택. */
function openCoreLoopStartPick() {
  const r = run, cl = r.coreLoop, sq = r.squad;
  openCoreLoopPick({
    title: '시작 무기 선택', subtitle: '이번 출격의 첫 정체성을 고르세요.',
    options: [
      { id: 'vulcan', label: WEAPON_LABELS.vulcan, desc: '넓게 퍼지는 연사', color: WEAPON_COLORS.vulcan, icon: '💥' },
      { id: 'laser', label: WEAPON_LABELS.laser, desc: '적을 관통하는 빔', color: WEAPON_COLORS.laser, icon: '⚡' },
      { id: 'homing', label: WEAPON_LABELS.homing, desc: '흩어진 적 자동 추적', color: WEAPON_COLORS.homing, icon: '🚀' },
    ],
    onPick(id) {
      sq.weapon = id; sq.weaponLv = 1;
      resonSetLoadout(sq.reson, [id, null]);
      cl.startWeapon = id; cl.awaitingStart = false;
      r.effects.text(sq.x, sq.y - 60, `시작 무기: ${WEAPON_LABELS[id]}`, WEAPON_COLORS[id], 15);
    },
  });
}

/** 현재 무기들의 '실제 행동 변화' 옵션(레벨업·진화·초진화). 없으면 빈 배열(→ 행동 변화로 기록 안 함). */
function coreLoopWeaponSteps(sq) {
  const steps = [];
  const slots = [['main', sq.weapon], ['wing', sq.wing.weaponId]].filter(([, w]) => w);
  for (const [slot, w] of slots) {
    const lv = slot === 'main' ? sq.weaponLv : sq.wing.level;
    const L = WEAPON_LABELS[w], C = WEAPON_COLORS[w];
    const setLv = (n) => { if (slot === 'main') sq.weaponLv = n; else sq.wing.level = n; };
    if (lv < 3) steps.push({ id: `lv-${slot}`, label: `${L} Lv${lv + 1}`, desc: '발사 수·확산·관통 강화', color: C, apply: () => setLv(lv + 1) });
    else if (!sq.weaponEvolutions[w]) for (const evo of evolutionOptions(w)) steps.push({ id: `evo-${evo.id}`, label: `${L} 진화: ${evo.short}`, desc: evo.shape, color: '#ffd93d', apply: () => { sq.weaponEvolutions[w] = evo.id; sq.evoLevels[w] = 1; } });
    else if ((sq.evoLevels[w] || 1) < 3) steps.push({ id: `evolv-${slot}`, label: `${L} 진화 Lv${(sq.evoLevels[w] || 1) + 1}`, desc: '진화 위력 상승', color: '#ffd93d', apply: () => { sq.evoLevels[w] = (sq.evoLevels[w] || 1) + 1; } });
    else if (!sq.weaponEvolutions2[w]) for (const s of superEvolutionOptions(w)) steps.push({ id: `super-${s.id}`, label: `${L} 초진화: ${s.short}`, desc: s.shape, color: '#ff5c2a', apply: () => { sq.weaponEvolutions2[w] = s.id; sq.superLevels[w] = 1; } });
    else if ((sq.superLevels[w] || 1) < 3) steps.push({ id: `superlv-${slot}`, label: `${L} 초진화 Lv${(sq.superLevels[w] || 1) + 1}`, desc: '초진화 위력 상승', color: '#ff5c2a', apply: () => { sq.superLevels[w] = (sq.superLevels[w] || 1) + 1; } });
  }
  return steps;
}

/** 0:30~ 행동 변화 카드. 실제 변화가 있을 때만 열고 기록(§G1-03). 반환: 열었으면 true. */
function openCoreLoopBehaviorPick(t) {
  const r = run, cl = r.coreLoop, sq = r.squad;
  const steps = coreLoopWeaponSteps(sq);
  if (!steps.length) return false;                       // 전 무기 최대 → 행동 변화 없음, 기록 안 함
  const options = steps.slice(0, 3);
  openCoreLoopPick({
    title: '행동 변화 강화', subtitle: '발사 형태가 눈에 띄게 달라집니다.',
    options,
    onPick(id, idx) {
      options[idx].apply();
      cl.metrics.choice(t, { behavior: true });          // 실제 변화가 적용된 경우만 기록
      r.effects.text(sq.x, sq.y - 64, options[idx].label, options[idx].color || COLORS.reward, 15);
      sq.invulnT = Math.max(sq.invulnT, 0.8);            // 강화 직후 짧은 무적(§5.5)
    },
  });
  return true;
}

/** 1:15 두 번째 무기 획득 — 미장착 무기 2종 중 선택해 wing 슬롯 장착. */
function openCoreLoopSecondWeaponPick(t) {
  const r = run, cl = r.coreLoop, sq = r.squad;
  if (sq.wing.weaponId) return;
  const cand = ['vulcan', 'laser', 'homing'].filter((w) => w !== sq.weapon);
  openCoreLoopPick({
    title: '두 번째 무기 획득', subtitle: '기존 무기를 유지한 채 두 무기가 동시에 발사됩니다.',
    options: cand.map((w) => ({ id: w, label: WEAPON_LABELS[w], desc: '보조 하드포인트에 장착', color: WEAPON_COLORS[w] })),
    autoIdx: Math.max(0, cand.indexOf(cl.build.wing)),   // 측정: 빌드의 보조 무기
    onPick(w) {
      sq.wing.weaponId = w; sq.wing.level = 1; sq._wingAcc = 0;
      cl.metrics.secondWeapon(t);
      r.effects.text(sq.x, sq.y - 74, `두 번째 무기: ${WEAPON_LABELS[w]}`, COLORS.reward, 15);
    },
  });
}

/** 5:30 지휘 프레임 선택. */
function openCoreLoopFramePick(t) {
  const r = run, cl = r.coreLoop, sq = r.squad;
  if (sq.frameId) return;
  const F = BAL.gate1.frames;
  openCoreLoopPick({
    title: '지휘 프레임 선택', subtitle: '함대 성격과 자동 스킬이 정해집니다.',
    options: ['assault', 'carrier', 'phase'].map((id) => ({ id, label: F[id].name, desc: F[id].auto.name, color: F[id].glow, icon: F[id].icon })),
    autoIdx: Math.max(0, ['assault', 'carrier', 'phase'].indexOf(frameForBuild(cl.buildId))),
    onPick(id) {
      frameSet(sq.frameState, id); sq.frameId = id; sq.doctrine = F[id].doctrine;
      cl.metrics.framePick(t);
      r.effects.text(sq.x, sq.y - 74, `지휘 프레임: ${F[id].name}`, F[id].glow, 15);
    },
  });
}

/** 하네스 자동 회피(측정 재생 전용, auto 모드에서만 호출). 가까운 적탄에서 가장 먼 x로 조향. */
function coreLoopAutopilot(sq, w) {
  const near = [];
  for (const b of w.enemyBullets) { if (!b.dead && b.y > sq.y - 220 && b.y < sq.y + 90) near.push(b); }
  for (const e of w.entities) { if (!e.dead && e.isEnemy && e.y > sq.y - 160 && e.y < sq.y + 90) near.push(e); }
  const m = BAL.squad.laneMargin + 20;
  let bestX = sq.x, bestGap = -1;
  for (let cx = m; cx <= LOGICAL_W - m; cx += 24) {
    let gap = 1e9;
    for (const t of near) { const d = Math.hypot(t.x - cx, (t.y - sq.y) * 0.5); if (d < gap) gap = d; }
    if (gap > bestGap) { bestGap = gap; bestX = cx; }
  }
  input.targetX = bestX;   // 실제 입력 채널로 조향 (squad.update가 따라감)
}

/** 공명 발사체 스폰(§5.4). fromResonance·resonanceId 태그로 재귀 방지·피해 별도 집계. */
function spawnResonance(spec, sq, w) {
  const shotBase = Math.max(4, sq.flagPower * (w.stats?.damage ?? 1) * 0.06) * (sq.resonPowerMult || 1);   // 한 발 기준 피해 근사(§7.3 T2+ 공명 증폭)
  if (spec.kind === 'rail') {
    const hx = BAL.gate1.loadout.hardpointX.wing;
    const b = new Bullet(sq.x + hx, sq.y - 10, shotBase * spec.dmgFrac, {
      vy: -BAL.weapons.laser.speed * 1.15, kind: 'laser', pierce: spec.pierce, beamW: spec.width, lv: 3, color: '#e9f7ff',
    });
    b.resonanceId = 'railStorm'; b.fromResonance = true; b.sourceWeaponId = null;
    w.bullets.push(b);
    w.effects.muzzle(sq.x + hx, sq.y - 12, '#e9f7ff', 12);
    w.effects.ring(sq.x + hx, sq.y - 10, '#9fe8ff');
    sfx('laser');
  } else if (spec.kind === 'missiles') {
    for (let k = 0; k < spec.count; k++) {
      const mis = new HomingMissile(sq.x, sq.y - 14, (Math.random() - 0.5) * 360, shotBase * spec.dmgFrac, 3, '#ffd36b', null);
      mis.wasp = true; mis.r *= 0.85; mis.resonanceId = 'microMissile'; mis.fromResonance = true; mis.sourceWeaponId = null;
      w.bullets.push(mis);
    }
    w.effects.muzzle(sq.x, sq.y - 14, '#ffd36b', 8);
    sfx('missile');
  }
}

// ── 보스 TTK 클램프(Gate 1에서 검증, Gate 2 지역 보스도 재사용) ─────────────────────
/** 보스 TTK 목표 범위 → 클램프 계수. B22 기준(중앙 52초·avgDpsMult 98)으로 지역별 목표에 비례 스케일. */
function ttkClampCfg(ttkRange) {
  const [lo, hi] = ttkRange, mid = (lo + hi) / 2;
  const minTTKSec = Math.max(1, Math.round(lo + 2));     // 하한(순삭 방지) = 목표 하한 +2
  return {
    hpMult: BAL.gate1.bossTtk.avgDpsMult * (mid / 52),   // 고정 HP 계수(목표 중앙 비례, B22 52초 기준)
    minTTKSec,
    enrageStartSec: minTTKSec,                           // 상한 램프 시작 = 하한(검증된 B22와 동일 구조)
    enrageRampPerSec: BAL.gate1.bossTtk.enrageRampPerSec, // 2.5
  };
}

/**
 * 보스에 양측 클램프(하한 dpsCap·상한 enrage)를 설치한다(Codex 검증 최종형).
 *  고정 HP = avgDps×hpMult, 클램프는 rawHit '이전' 입력에 적용해 STAGGER·사망·HP가 일관.
 *  BREAK 등 내부 배수는 damageTakenMult()로 사전 조회해 실손실 기준으로 예산을 건다.
 */
function installBossTtkClamp(boss, avgDps, ttkRange) {
  const c = ttkClampCfg(ttkRange);
  boss.hp = boss.maxHp = Math.round(Math.max(BAL.boss.hp * 0.25, avgDps * c.hpMult));  // 고정 HP(불변) → STAGGER 분모 안정
  boss.dpsCap = boss.maxHp / c.minTTKSec;                // 하한: 초당 피해 상한(TTK 하한)
  boss._age = 0; boss._dmgSec = 0; boss._secT = 0; boss._enrageMult = 1;
  boss._enrageStartSec = c.enrageStartSec; boss._enrageRampPerSec = c.enrageRampPerSec;
  const rawHit = boss.hitByBullet.bind(boss);
  boss.hitByBullet = (dmg, world, ctx) => {
    const mult = boss.damageTakenMult ? boss.damageTakenMult() : 1;   // 내부 배수 사전 조회
    let norm = dmg;
    if (boss.dpsCap) {                                                // 하한: 실손실(norm×mult)이 초당 예산 넘지 않게 입력을 깎음
      const budget = Math.max(0, boss.dpsCap - (boss._dmgSec || 0));
      const maxNorm = mult > 0 ? budget / mult : budget;
      if (norm > maxNorm) norm = maxNorm;
      boss._dmgSec = (boss._dmgSec || 0) + norm * mult;              // 수용된 정상 손실만 예산 차감
    }
    let input = norm;
    if (boss._enrageMult > 1) input += norm * (boss._enrageMult - 1); // 상한: enrage 추가 입력(예산 밖, 정상피해 비례)
    if (input <= 0) return;                                          // 예산 소진·enrage 없음 → 피해·부작용 모두 없음
    return rawHit(input, world, ctx);                               // 단일 호출: STAGGER·사망·HP 일관
  };
  return c;
}

/** 매 프레임 보스 클램프 갱신: 나이 적산 + 초당 예산 창 리셋(하한) + enrage 계수(상한). */
function updateBossClamp(boss, dt) {
  boss._age = (boss._age || 0) + dt;
  if (boss.dpsCap) { boss._secT = (boss._secT || 0) + dt; if (boss._secT >= 1) { boss._secT -= 1; boss._dmgSec = 0; } }
  const start = boss._enrageStartSec ?? BAL.gate1.bossTtk.enrageStartSec;
  const ramp = boss._enrageRampPerSec ?? BAL.gate1.bossTtk.enrageRampPerSec;
  const over = boss._age - start;
  boss._enrageMult = over > 0 ? 1 + over * ramp : 1;
}

/** 하네스 검증 보스(B22 네온 아비터) 등장 — TTK 측정용. */
function spawnCoreLoopBoss() {
  const r = run, w = r.world;
  r.phase = 'boss'; w.phase = 'boss';
  r.pending = [];
  // 보스 등장 = 섹터가 비워지는 피날레. 잔여 잡몹을 정리해 순수 단일표적 대결로 만든다.
  //  (railStorm처럼 관통 공명이 잔여 잡몹으로 충전을 과하게 벌어 보스 DPS 표본이 부풀려지는 것도 함께 차단 → TTK 수렴, Codex P1)
  //  정리 시 표적 해제 필수(Codex P2): dead 표식 → 유도 미사일이 재표적(this.target.dead), 시커 표식 해제.
  for (let i = w.entities.length - 1; i >= 0; i--) {
    const e = w.entities[i];
    if (!e.isEnemy) continue;
    e.dead = true;
    if (w.reson) resonEnemyRemoved(w.reson, e);   // 사라진 적을 시커 표식이 계속 가리키지 않게
    w.entities.splice(i, 1);
  }
  w.scrollSpeed = 40;
  const bossRate = r.mods.enemyRate / BAL.difficulty.bossRateMult;
  const boss = makeBoss(LOGICAL_W, bossRate, 5, 1, 'B22');   // 섹터 5 네온 아비터
  boss.homeX = LOGICAL_W / 2; boss.x = boss.homeX;
  // TTK 45~60초 수렴: 고정 HP + 양측 클램프(설치·갱신은 installBossTtkClamp/updateBossClamp 공용 헬퍼).
  const snap = r.coreLoop.metrics.snapshot(elapsed(r.coreLoop.director));
  const totalDmg = Object.values(snap.damageByWeapon).reduce((a, c) => a + c, 0) + Object.values(snap.damageByResonance).reduce((a, c) => a + c, 0);
  const avgDps = snap.durationSec > 5 ? totalDmg / snap.durationSec : 60;
  installBossTtkClamp(boss, avgDps, [BAL.gate1.bossTtk.b22Min, BAL.gate1.bossTtk.b22Max]);
  r.bosses = [boss]; w.bosses = [boss];
  r.boss = boss; w.boss = boss;
  preloadBossArt('B22');
  playBgm('boss'); setBgmIntensity(0.86); sfx('boss_in');
  r.effects.text(LOGICAL_W / 2, logicalH * 0.35, boss.korName || '네온 아비터', COLORS.danger, 20);
  r.effects.flash(0.4);
}

/** 하네스 종료: 8분 결과 요약 + 측정 확정 + window.__nfRunMetrics 노출. */
function finishCoreLoop(reason = 'clear') {
  const r = run, cl = r.coreLoop;
  if (!cl || cl.resultShown) return;
  cl.resultShown = true;
  const t = elapsed(cl.director);
  cl.metrics.gameOver(reason, t);
  const snap = cl.metrics.snapshot(t);
  window.__nfRunMetrics = snap;
  state = 'done';
  showCoreLoopResult(snap, r.squad, cl);
}

/** 하네스 per-frame 진행 (update에서 run.coreLoop일 때만). */
function coreLoopUpdate(dt) {
  const r = run, cl = r.coreLoop, w = r.world, sq = r.squad;
  if (!cl || cl.resultShown || cl.awaitingStart) return;   // 시작 무기 선택 전엔 진행 안 함(시간 정지)
  const RCFG = BAL.gate1.resonance;
  if (cl.auto) coreLoopAutopilot(sq, w);                    // 자동 회피는 측정 모드에서만(사람 플레이 조작 보존)
  const { t, events } = tickDirector(cl.director, dt, false);
  cl.metrics.setDuration(t);
  // 사람 플레이 초반 유예: 조작 학습 구간엔 기함 내구도 피해를 경감(측정 모드는 항상 1).
  sq._hullDmgMult = (!cl.auto && t < BAL.gate1.play.graceSec) ? BAL.gate1.play.graceDmgMult : 1;
  // 공명 타이머 + 프레임 자동 스킬(실전 발동 — RW-C)
  resonTick(sq.reson, dt);
  const rushStarted = (cl._prevRushT ?? 0) <= 0 && (sq.rushT || 0) > 0;   // 이번 프레임 RUSH 시작(페이즈 프레임 트리거)
  cl._prevRushT = sq.rushT || 0;
  const fr = tickFrame(sq.frameState, BAL.gate1.frames, dt, { flow: sq.flow || 0, rushStarted });
  applyFrameAuto(fr, sq, w);
  // 공명 발동 (활성 후): 충전형 발사 or 첫 발동 시각 기록
  if (cl.resonActivated) {
    const spec = resonTryProc(sq.reson, RCFG, t);
    if (spec) { spawnResonance(spec, sq, w); recordFirstResonance(cl, t); }
    if (sq.reson.markId != null) recordFirstResonance(cl, t);   // 시커: 표식 성립도 완성으로 인정
  }
  // 보스 양측 클램프 갱신(공용 헬퍼: 나이·초당 예산 리셋·enrage 계수). HP는 고정(재보정 없음).
  const bo0 = r.bosses && r.bosses[0];
  if (bo0) {
    updateBossClamp(bo0, dt);
  }
  // 8분 내내 전투가 이어지도록 트랙 재보충
  if (r.phase === 'track' && r.pending.length < 2 && w.entities.filter((e) => e.isEnemy).length < 6 && !cl.bossSpawned) refillCoreLoopTrack();
  // 디렉터 사건 처리 (play=선택창, measure=자동)
  for (const ev of events) {
    const act = eventAction(ev.type);
    if (!act) continue;
    if (act.kind === 'equipWing') openCoreLoopSecondWeaponPick(ev.t);
    else if (act.kind === 'hullTier') {
      survTierUp(sq.surv, BAL.gate1.survivability);
      sq.tier = Math.min(BAL.evolution.names.length - 1, sq.tier + 1);   // H0→H1 (자동 성장 + 외형·내구도 최대치 변화)
      cl.metrics.hullTier(ev.t);
      w.effects.halo(sq.x, sq.y, COLORS.reward);
      w.effects.text(sq.x, sq.y - 74, `기함 승급 ${BAL.evolution.names[sq.tier]} · 내구도 최대치 ↑`, COLORS.reward, 15);
    } else if (act.kind === 'behavior') openCoreLoopBehaviorPick(ev.t);   // 실제 변화 있을 때만 열고 기록
    else if (act.kind === 'telegraph') cl.telegraph = true;
    else if (act.kind === 'resonanceReady') {
      // 공명 활성화(§5.4). 이후는 실제 플레이(발칸 명중 충전/레이저 표식)로 완성 → firstResonance는 실제 발동 시 기록.
      if (sq.wing.weaponId) {
        resonSetLoadout(sq.reson, [sq.weapon, sq.wing.weaponId]);
        cl.resonActivated = true;
        if (cl.auto) { const res = RESONANCES[sq.reson.activeId]; if (res?.trigger === 'charge') sq.reson.charge = RCFG[sq.reson.activeId].threshold; }
        w.effects.text(sq.x, sq.y - 74, `공명 회로 활성: ${RESONANCES[sq.reson.activeId]?.name || ''}`, '#9fe8ff', 16);
      }
    } else if (act.kind === 'framePick') openCoreLoopFramePick(ev.t);
    else if (act.kind === 'eliteWave') refillCoreLoopTrack(true);
    else if (act.kind === 'bossStart') { if (!cl.bossSpawned) { cl.bossSpawned = true; spawnCoreLoopBoss(); cl.metrics.bossStart(ev.t, 'B22'); } }
    else if (act.kind === 'result') cl.resultPending = true;   // 보스 TTK 측정 위해 처치까지 대기(하드캡)
  }
  // 보스 처치 → TTK 확정
  if (cl.bossSpawned && !cl.bossEnded && r.bosses.length && r.bosses.every((b) => b.dead)) { cl.bossEnded = true; cl.metrics.bossEnd(t); }
  if (cl.resultPending && (cl.bossEnded || !cl.bossSpawned || t > BAL.gate1.timeline.resultAt + 100)) {
    finishCoreLoop(cl.bossEnded || !cl.bossSpawned ? 'clear' : 'timeout');
  }
}

/** 첫 공명 완성 시각을 실제 발동/표식 성립 시점에 1회 기록(§5.4, 사건 시각 아님). */
function recordFirstResonance(cl, t) {
  if (cl.firstResonanceRecorded) return;
  cl.firstResonanceRecorded = true;
  cl.metrics.firstResonance(t);
}

// ═══════════ Gate 2: 25분 6지역 시간 캠페인 (?campaign25=1, 전면개편 §7) ═══════════
// Gate 1 하네스의 검증된 시스템(로드아웃·공명·내구도·프레임·보스 클램프)을 25분 실전 캠페인으로 승격한다.
// 노드형 캠페인은 폴백으로 보존(newExpedition 경로 그대로). 여기선 시간축 디렉터가 6지역·지역보스·성장을 몬다.

/** 25분 캠페인 시작. startCoreLoop과 같은 설치에 25분 디렉터를 얹는다. mode: measure(자동)·play. */
function startCampaign25(opts = {}) {
  const mode = opts.mode === 'measure' ? 'measure' : 'play';
  const auto = mode === 'measure';
  const build = coreLoopBuild(opts.buildId || 'railStorm');
  drafting = false; betweenStages = false;
  newExpedition('campaign');
  const r = run, sq = r.squad, w = r.world;
  const surv = createSurvivability(BAL.gate1.survivability);
  const reson = createResonanceState();
  const frameState = createFrameState();
  const startMain = auto ? build.main : (opts.startWeapon || build.main);
  sq.installGate1({ surv, reson, frameState, frameId: null, mainWeapon: startMain });
  sq.weapon = startMain; sq.weaponLv = 1;
  const G2 = BAL.gate2;
  const metrics = createRunMetrics({ runId: `campaign25-${mode}-${build.id}`, seed: (Math.random() * 2 ** 31) | 0 });
  const director = createRunDirector(G2, buildCampaign25Schedule(G2));
  w.metrics = metrics; w.reson = reson;
  w.onHullDepleted = () => finishCampaign25('hull');   // 내구도 소진 → 25분 결과 종료(regionResults 첨부, Codex P2)
  r.campaign25 = {
    mode, auto, build, buildId: build.id, cfg: G2, director, metrics,
    region: 0, bossActive: false, bossSpawnT: 0, bossQueue: [], resonActivated: false, resultShown: false, resultPending: false,
    regionResults: [],        // [{ region, boss, ttk, killed }]
    bossesKilled: 0, deferredEvents: [],
    startHull: surv.hull, startTier: 0,   // 결과 화면용 실제 시작 스냅샷
  };
  // H0에서 시작 → H1~H5 승급 5회가 정확히 T1~T5를 만든다(측정도 동일, Codex P2). 측정은 생존/화력만 보정.
  sq.tier = 0; sq.cruisers = 0;
  if (auto) {
    surv.hullMax = surv.hull = BAL.gate1.survivability.measureHullMax;   // 헤드리스 자동회피 보정(측정 전용, tier와 무관)
    sq.count = 70; sq.banked = 260;
  } else {
    sq.banked = 0;
    sq.count = w.stats?.startCount ?? BAL.squad.start;
  }
  resonSetLoadout(reson, [startMain, null]);
  applyCampaignHullFn(sq, r.campaign25);   // T0 기본 기능 적용(§7.3)
  r.maxPower = sq.power;
  window.__nfRunMetrics = null;
  enterNode(r.map.cols[0][0]);   // 첫 전투 진입
  r.totalTrack = 1e12;           // 디렉터가 25분 관리(트랙 종료 조기 클리어 방지)
  r.pending = [];
  // 첫 1분(introSec)은 사격 적 없이 조작 학습(§7.1) → 여기서 스트림을 미리 채우지 않는다. campaign25Update가 intro 후 채운다.
  return r.campaign25;
}

/** 지역 진입: 배경 전환 + 지역 컨텍스트. (지역별 적 구성 정교화는 G2-E) */
function enterCampaignRegion(i, t) {
  const r = run, cl = r.campaign25;
  const region = c25Region(cl.cfg, i);
  if (!region) return;
  cl.region = i;
  r.sector = region.backdrop;                 // 배경 전환(Gate 0 R2 섹터 1:1 매핑)
  r.stage = region.i;                          // 난이도·기록용 진행 카운터(임시: 지역 인덱스)
  r.effects.text(LOGICAL_W / 2, logicalH * 0.28, `${region.i}. ${region.name}`, COLORS.reward, 20);
}

/** 지역 보스 등장: 잔여 정리 + 지역 TTK 목표로 양측 클램프 설치(공용 헬퍼). */
function spawnCampaignBoss(i, bossId, t) {
  const r = run, w = r.world, cl = r.campaign25;
  const region = c25Region(cl.cfg, i);
  if (!region || cl.bossActive) return;
  r.phase = 'boss'; w.phase = 'boss'; r.pending = [];
  for (let k = w.entities.length - 1; k >= 0; k--) {   // 잔여 잡몹 정리 + 표적 해제(Codex P2)
    const e = w.entities[k]; if (!e.isEnemy) continue;
    e.dead = true; if (w.reson) resonEnemyRemoved(w.reson, e); w.entities.splice(k, 1);
  }
  w.scrollSpeed = 40;
  const boss = makeBoss(LOGICAL_W, r.mods.enemyRate / BAL.difficulty.bossRateMult, region.backdrop, 1, bossId);
  boss.homeX = LOGICAL_W / 2; boss.x = boss.homeX;
  const snap = cl.metrics.snapshot(t);
  const totalDmg = Object.values(snap.damageByWeapon).reduce((a, c) => a + c, 0) + Object.values(snap.damageByResonance).reduce((a, c) => a + c, 0);
  const avgDps = snap.durationSec > 5 ? totalDmg / snap.durationSec : 60;
  installBossTtkClamp(boss, avgDps, region.bossTtk);   // 고정 HP + 지역 TTK 목표 클램프(하한·상한)
  r.bosses = [boss]; w.bosses = [boss]; r.boss = boss; w.boss = boss;
  preloadBossArt(bossId);
  cl.bossActive = true; cl.bossSpawnT = t;
  cl.regionResults.push({ region: i, boss: bossId, ttk: null, killed: false });
  playBgm('boss'); setBgmIntensity(0.86); sfx('boss_in');
  r.effects.text(LOGICAL_W / 2, logicalH * 0.35, boss.korName || bossId, COLORS.danger, 20);
  r.effects.flash(0.4);
}

/** 함체 승급: 내구도 최대치 + 발사 개성(shipTraits) + §7.3 등급별 기능(이동·공명·측면포대·Apex)을 함께 바꾼다(G2-B). */
function campaignHullTier(tier, t) {
  const r = run, sq = r.squad, w = r.world, cl = r.campaign25;
  survTierUp(sq.surv, BAL.gate1.survivability);
  sq.tier = Math.min(BAL.evolution.names.length - 1, sq.tier + 1);
  applyCampaignHullFn(sq, cl);   // 등급별 기능 갱신
  cl.metrics.hullTier(t);
  w.effects.halo(sq.x, sq.y, COLORS.reward);
  const fn = BAL.gate2.hullFn[Math.min(sq.tier, BAL.gate2.hullFn.length - 1)];
  w.effects.text(sq.x, sq.y - 74, `기함 승급 ${BAL.evolution.names[sq.tier]} · ${fn.label}`, COLORS.reward, 15);
}

/** 현재 tier의 §7.3 기능을 편대에 반영(누적형). campaignHullTier·startCampaign25에서 호출.
 *  ※ Apex(T5)는 여기서 켜지 않는다 — 디렉터의 apex 사건(1290s)이 발동을 게이트한다(Codex P2). fn.apex는 라벨용. */
function applyCampaignHullFn(sq, cl) {
  const fn = BAL.gate2.hullFn[Math.min(sq.tier, BAL.gate2.hullFn.length - 1)];
  sq.moveResponseMult = fn.move;       // 이동 반응(entities.js 팔로우에서 읽음)
  sq.resonPowerMult = fn.resonPower;   // 공명 증폭(spawnResonance·시커 충돌에서 읽음)
  sq.sideGuns = fn.sideGuns;           // 측면 포대 문수(campaign25Update에서 발사)
}

/** 두 번째 무기 장착(측정=빌드 wing 자동, play=향후 선택 UI G2-B). */
function equipCampaignWing(t) {
  const r = run, sq = r.squad, cl = r.campaign25;
  if (sq.wing.weaponId) return;
  sq.wing.weaponId = cl.build.wing; sq.wing.level = 1; sq._wingAcc = 0;
  cl.metrics.secondWeapon(t);   // 마일스톤 기록(Codex P2)
  r.world.effects.text(sq.x, sq.y - 60, `보조 무기: ${WEAPON_LABELS[cl.build.wing]}`, WEAPON_COLORS[cl.build.wing], 15);
}

/** 공명 회로 활성(두 무기 장착 후). */
function activateCampaignResonance(t) {
  const r = run, sq = r.squad, cl = r.campaign25;
  if (!sq.wing.weaponId) return;
  resonSetLoadout(sq.reson, [sq.weapon, sq.wing.weaponId]);
  cl.resonActivated = true;
  cl.metrics.firstResonance(t);   // 첫 공명(활성 시각) 기록(Codex P2)
  if (cl.auto) { const res = RESONANCES[sq.reson.activeId]; if (res?.trigger === 'charge') sq.reson.charge = BAL.gate1.resonance[sq.reson.activeId].threshold; }
  r.world.effects.text(sq.x, sq.y - 74, `공명 회로 활성: ${RESONANCES[sq.reson.activeId]?.name || ''}`, '#9fe8ff', 16);
}

/** 지휘 프레임 자동 스킬(측정=빌드별 고정). */
function pickCampaignFrame(t) {
  const r = run, sq = r.squad, cl = r.campaign25;
  if (sq.frameId) return;
  const id = frameForBuild(cl.buildId);
  frameSet(sq.frameState, id); sq.frameId = id; sq.doctrine = BAL.gate1.frames[id].doctrine;
  cl.metrics.framePick(t);   // 마일스톤 기록(Codex P2)
  r.world.effects.text(sq.x, sq.y - 74, `지휘 프레임: ${BAL.gate1.frames[id].name}`, BAL.gate1.frames[id].glow, 16);
}

/** 행동 변화: 무기 레벨업/진화(측정=자동 첫 옵션). 25분에 걸쳐 화력이 성장한다(§1.3). play 선택 UI는 향후. */
function campaignBehavior(t) {
  const sq = run.squad, cl = run.campaign25;
  const steps = coreLoopWeaponSteps(sq);
  if (!steps.length) return;
  if (cl.auto) { steps[0].apply(); cl.metrics.choice(t, { behavior: true }); }
}

/** §7.3 등급 기능 per-frame: 등급 기능 동기화 + 측면 포대(T4+) 발사 + Apex(T5) 주기 발동. */
function campaignHullFnTick(dt) {
  const r = run, cl = r.campaign25, sq = r.squad, w = r.world, G2 = BAL.gate2;
  applyCampaignHullFn(sq, cl);   // 매 프레임 현재 sq.tier에서 재적용 → 진화/강등 등 유기적 tier 변화와 항상 동기(Codex 2차 P2)
  if (sq.sideGuns > 0) {   // 대형 측면 포대: 좌우로 비스듬히 추가 사격
    cl._sideT = (cl._sideT || 0) - dt;
    if (cl._sideT <= 0) {
      cl._sideT = G2.sideGunIntervalSec;
      const dmg = Math.max(6, sq.flagPower * (w.stats?.damage ?? 1) * 0.06) * G2.sideGunDmgFrac;
      for (let k = 0; k < sq.sideGuns; k++) {
        const dir = k % 2 === 0 ? -1 : 1;
        const b = new Bullet(sq.x + dir * 15, sq.y - 6, dmg, { vy: -BAL.weapons.vulcan.speed * 0.9, vx: dir * 130, kind: 'vulcan', lv: 2, color: '#ffd36b' });
        b.sourceWeaponId = 'sideGun'; w.bullets.push(b);   // 별도 소스: 공명 충전·무기 피해 통계에 섞이지 않게(Codex 2차 P2)
      }
    }
  }
  // 타이탄 Apex: 주기적 화면 지배(적탄 소거 + 광역 펄스). 게이트 = 사건 해금 + 현재 함체 T5 적격.
  // 강등(onDronesDepleted 등)으로 tier가 T5 밑이면 다른 T5 기능처럼 Apex도 멈춘다(hullFn이 Apex=T5 전용, Codex 4차 P2).
  const apexEligible = G2.hullFn[Math.min(sq.tier, G2.hullFn.length - 1)]?.apex;
  if (cl.apexUnlocked && apexEligible) {
    cl._apexT = (cl._apexT ?? G2.apexIntervalSec) - dt;
    if (cl._apexT <= 0) { cl._apexT = G2.apexIntervalSec; triggerApex(); }
  }
}

/** Apex 발동: 적탄 전소 + 잡몹 즉사(즉시 제거) + 보스 광역 펄스(보스는 클램프가 상한 → TTK 유지). */
function triggerApex() {
  const r = run, w = r.world, sq = r.squad, G2 = BAL.gate2;
  for (const b of w.enemyBullets) b.dead = true;
  for (let i = w.entities.length - 1; i >= 0; i--) {
    const e = w.entities[i];
    if (!e.isEnemy || e.dead || !e.hitByBullet || e.indestructible) continue;
    e.shieldCharges = 0;                    // 보호막 변이 무시 → 확정 소거(1발이 보호막만 까고 생존하던 문제, Codex 3차 P2)
    const before = e.hp || 0;
    e.hitByBullet(99999, w);
    if (e.dead) {
      w.metrics?.weaponDamage('apex', Math.max(0, before));   // 소거한 실효 HP를 apex 기여로 기록(overkill 원값 아님 → avgDps/B7 스케일 정직, Codex 3차 P2)
      w.notifyEnemyKilled?.(e); w.entities.splice(i, 1);       // 중앙 킬 처리 + 즉시 제거(사망 후 접촉·발사 방지, Codex 2차 P2)
    }
  }
  for (const bo of (r.bosses || [])) {
    if (bo.dead) continue;
    const before = bo.hp;
    bo.hitByBullet((bo.maxHp || 3000) * G2.apexDamageFrac, w);
    w.metrics?.weaponDamage('apex', Math.max(0, before - bo.hp));   // 실제 적용 Apex 피해 기록(Codex 2차 P2)
  }
  w.effects.flash(0.5); w.effects.halo(sq.x, sq.y, '#ffe17a'); w.effects.ring(LOGICAL_W / 2, logicalH * 0.4, '#ffe17a');
  w.effects.text(sq.x, sq.y - 92, 'APEX', '#ffe17a', 24);
  sfx('evolve');
}

/** 25분 캠페인 per-frame 진행. */
function campaign25Update(dt) {
  const r = run, cl = r.campaign25, w = r.world, sq = r.squad;
  if (!cl || cl.resultShown) return;
  if (cl.auto) coreLoopAutopilot(sq, w);
  const { t, events } = tickDirector(cl.director, dt, false);
  cl.metrics.setDuration(t);
  resonTick(sq.reson, dt);
  const rushStarted = (cl._prevRushT ?? 0) <= 0 && (sq.rushT || 0) > 0;
  cl._prevRushT = sq.rushT || 0;
  const fr = tickFrame(sq.frameState, BAL.gate1.frames, dt, { flow: sq.flow || 0, rushStarted });
  applyFrameAuto(fr, sq, w);
  if (cl.resonActivated) { const spec = resonTryProc(sq.reson, BAL.gate1.resonance, t); if (spec) spawnResonance(spec, sq, w); }
  const bo0 = r.bosses && r.bosses[0];
  if (bo0) updateBossClamp(bo0, dt);
  campaignHullFnTick(dt);   // §7.3 등급 기능(측면 포대·Apex)
  // 지역 전투 스트림 재보충(보스 없을 때 25분 내내 전투 유지). intro(첫 1분)엔 사격 적 스폰 금지(§7.1).
  if (t >= cl.cfg.introSec && r.phase === 'track' && r.pending.length < 2 && w.entities.filter((e) => e.isEnemy).length < 6 && !cl.bossActive) refillCoreLoopTrack();
  // 디렉터 사건 처리
  for (const ev of events) {
    const act = eventAction25(ev.type);
    if (!act) continue;
    switch (act.kind) {
      case 'regionEnter': enterCampaignRegion(ev.region, t); break;
      // 보스 사건이 이미 다른 보스 교전 중에 오면 버리지 않고 FIFO 큐에 담아 순서대로 등장(Codex P1: 겹침 다수여도 보스 누락 없음).
      case 'bossStart': if (cl.bossActive) cl.bossQueue.push({ region: ev.region, boss: ev.boss }); else spawnCampaignBoss(ev.region, ev.boss, t); break;
      case 'hullTier': campaignHullTier(ev.tier, t); break;
      case 'equipWing': equipCampaignWing(t); break;
      case 'resonanceReady': activateCampaignResonance(t); break;
      case 'framePick': pickCampaignFrame(t); break;
      case 'behavior': campaignBehavior(t); break;   // 무기 레벨업 → 25분 힘 성장(§1.3)
      case 'apex': cl.apexUnlocked = true; cl._apexT = 0.1; break;   // §7.3 T5 Apex 해금(즉시 첫 발동)
      case 'result': cl.resultPending = true; break;
      default: cl.deferredEvents.push({ kind: act.kind, t: Math.round(t) }); break;   // fleet/path/apex 등 = G2-B~D 실배선
    }
  }
  // 지역 보스 처치 → TTK 확정 + 스트림 재개(다음 지역까지). B7 처치 = 25분 완결점.
  if (cl.bossActive && r.bosses.length && r.bosses.every((b) => b.dead)) {
    const res = cl.regionResults[cl.regionResults.length - 1];
    if (res && res.ttk == null) { res.ttk = Math.round((t - cl.bossSpawnT) * 10) / 10; res.killed = true; cl.bossesKilled += 1; }
    cl.bossActive = false; r.phase = 'track'; w.phase = 'track';
    r.bosses = []; w.bosses = []; r.boss = null; w.boss = null;
    if (res && res.boss === 'B7') { finishCampaign25('clear'); return; }
    if (cl.bossQueue.length) { const pb = cl.bossQueue.shift(); spawnCampaignBoss(pb.region, pb.boss, t); }   // 대기 큐의 다음 지역 보스 등장(P1 FIFO)
    else refillCoreLoopTrack();
  }
  if (cl.resultPending && ((!cl.bossActive && cl.bossQueue.length === 0) || t > cl.cfg.totalSec + 120)) {
    finishCampaign25(cl.bossesKilled >= 6 ? 'clear' : 'timeout');
  }
}

/** 25분 캠페인 종료: 결과 스냅샷 + 지역별 보스 TTK 노출. */
function finishCampaign25(reason = 'clear') {
  const r = run, cl = r.campaign25;
  if (!cl || cl.resultShown) return;
  cl.resultShown = true;
  const t = elapsed(cl.director);
  cl.metrics.gameOver(reason, t);
  const snap = cl.metrics.snapshot(t);
  snap.regionResults = cl.regionResults;
  snap.bossesKilled = cl.bossesKilled;
  snap.campaignReason = reason;
  window.__nfRunMetrics = snap;
  state = 'done';
  // play 결과: 재시작은 25분 캠페인으로(Gate 1로 벗어나지 않게, Codex P2). 지역별 TTK 6종 패널은 G2-F에서 전용 화면.
  if (cl.mode === 'play') showCoreLoopResult(snap, r.squad, cl, (mode) => { ui.hide(); startCampaign25({ mode, buildId: cl.buildId }); });
}

/** 지휘 프레임 자동 스킬을 실제 전투 행동으로 발동(RW-C, G1-05). */
function applyFrameAuto(fr, sq, w) {
  if (!fr) return;
  if (run.coreLoop) { if (fr.type === 'dash') run.coreLoop.sawDash = true; if (fr.type === 'volley') run.coreLoop.sawVolley = true; }   // 통합 검증 플래그
  if (fr.type === 'dash') { sq.invulnT = Math.max(sq.invulnT, fr.invuln); w.effects.ring(sq.x, sq.y, BAL.gate1.frames.phase.glow); }
  else if (fr.type === 'volley') {
    // 캐리어 호위 동기화: 실제 일제사격(전방 부채꼴 탄) — 연출만이 아니라 피해 발생.
    const dmg = Math.max(6, sq.flagPower * (w.stats?.damage ?? 1) * 0.05) * fr.volleyMult;
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.12;
      const b = new Bullet(sq.x, sq.y - 12, dmg, { vx: Math.sin(a) * 520, vy: -Math.cos(a) * 520, kind: 'vulcan', pierce: 1, lv: 3, color: BAL.gate1.frames.carrier.glow });
      b.sourceWeaponId = null; b.frameVolley = true;
      w.bullets.push(b);
    }
    w.effects.ring(sq.x, sq.y, BAL.gate1.frames.carrier.glow); sfx('vulcan');
  }
}

/** 하네스 경량 적 스트림: 자동 회피로 8분 생존 가능하되 피격(내구도 감소)은 받는 밀도.
 *  램밍(크리처/차저)은 접촉 22피해로 헤드리스 회피가 어려워 제외하고, 회피 가능한 슈터만 쓴다. */
function refillCoreLoopTrack(elite = false) {
  const r = run, cl = r.coreLoop || r.campaign25, base = r.traveled + 340;   // Gate 2 캠페인도 이 스트림을 쓴다(play=램프·measure=밀집, Codex P2)
  // 측정 모드=밀집 군집(공명이 여러 표적을 맞혀 기여도 산출). 사람 플레이=완만+시간 램프(초반 경량→후반 증가).
  const dense = !cl || cl.auto;
  const P = BAL.gate1.play, t = cl ? elapsed(cl.director) : 0;
  const playPer = t < P.rampMidSec ? 1 : t < P.rampLateSec ? 2 : 3;   // 사람 플레이: 초반 1기 → 중반 2기 → 후반 3기
  const rows = elite ? 2 : (dense ? 2 : 1), per = elite ? 4 : (dense ? 5 : playPer);
  const skipShooters = !dense && t < P.introSec;   // 사람 플레이 첫 구간: 사격 적 없이 이동·수집만
  // 사람 플레이 스트림은 튜토리얼 미러 복제를 끄고(noDup) per가 정확한 적 수가 되게 한다(Codex P2).
  //  측정 스트림은 weaver 고정(Codex 승인 TTK·밀도 보존). 사람 플레이는 램밍 제외 슈터를 시간 따라 다양화(테스터: 단조로움).
  const SHOOTERS = ['weaver', 'turret', 'sniper', 'zapper', 'orbiter', 'blinker'];
  const poolN = Math.min(SHOOTERS.length, 2 + Math.floor(t / 80));   // 시간 지날수록 등장 종류 확대
  if (!skipShooters) for (let row = 0; row < rows; row++) {
    for (let i = 0; i < per; i++) {
      const frac = per > 1 ? i / (per - 1) : 0.5;   // 1기일 때 0/0(NaN) 방지 — 중앙 배치
      const type = elite ? 'turret' : (dense ? 'weaver' : SHOOTERS[(row * per + i + Math.floor(t / 18)) % poolN]);
      r.pending.push({ type, size: 'small', noDup: !dense,
        x: 0.18 + 0.64 * frac, trackY: base + row * (dense ? 360 : 460) });
    }
  }
  // 생존 스트레스: 램밍(접촉 22피해) 크리처 다수 → 최강 함대도 회피 못한 접촉으로 내구도 0 도달(무적 방지 증명).
  if (cl?.build?.stress) {
    for (let i = 0; i < 7; i++) r.pending.push({ type: 'creature', size: i % 2 ? 'large' : 'mid', x: 0.15 + 0.7 * r.rng(), trackY: base + 60 + i * 150 });
  }
  // 사람 플레이: 드론 크리스탈로 함대가 자라 보스 무렵 '완성 빌드'가 되게(무기 캡슐은 제외 — 빌드 정체성 유지).
  if (cl && !cl.auto && !cl.build?.stress) {
    for (let i = 0; i < 2; i++) r.pending.push({ type: 'crystal', value: 26, x: 0.2 + 0.6 * r.rng(), trackY: base + 200 + i * 300 });
  }
  r.pending.sort((a, b) => a.trackY - b.trackY);
}

/** Gate 1: 아군 탄이 표적을 맞힌 순간 — 무기/공명 피해 집계 + 공명 충전·표식(§5.4/§6.1). */
function tallyBulletDamage(w, b, dealt, target) {
  const m = w.metrics, reson = w.reson;
  const nowT = run.coreLoop ? elapsed(run.coreLoop.director) : 0;
  if (b.resonanceId) { m.resonanceDamage(b.resonanceId, dealt); return; }   // 공명 발사체 = 공명 피해
  // 시커 빔: 표식 대상을 맞힌 유도 미사일은 공명 피해로 귀속(우선추적 보상)
  if (reson && b.sourceWeaponId === 'homing' && isSeekerHit(reson, target)) { m.resonanceDamage('seekerBeam', dealt); }
  else m.weaponDamage(b.sourceWeaponId, dealt);
  // 공명 충전: 쌍의 두 무기 명중 모두 전달(모듈의 pair 검사가 필터). 시커 표식: 레이저 명중.
  if (reson && reson.activeId) {
    resonOnHit(reson, BAL.gate1.resonance, { sourceWeaponId: b.sourceWeaponId, fromResonance: b.fromResonance });
    if (b.sourceWeaponId === 'laser' && reson.activeId === 'seekerBeam') resonLaserMark(reson, BAL.gate1.resonance, target, nowT);
  }
}

/** 8분 결과 화면(§5.9). 실제 시작(startTier/startHull)→최종 상태, 무기 2·공명, 피해 비율, 내구도. */
function showCoreLoopResult(snap, sq, cl, restartFn) {
  const build = cl.build;
  const activeResonName = sq.reson.activeId ? RESONANCES[sq.reson.activeId]?.name : (RESONANCES[build.resonance]?.name || '');
  // 재시작 콜백은 모드별로 다르다: Gate 1=startCoreLoop, Gate 2 캠페인=startCampaign25(버튼이 캠페인을 벗어나지 않게, Codex P2).
  const restart = restartFn || ((mode) => { ui.hide(); startCoreLoop({ mode, buildId: cl.buildId }); });
  ui.showCoreLoopResult({
    snap, build,
    startHull: cl.startHull, hull: sq.surv.hull, hullMax: sq.surv.hullMax,
    startTier: cl.startTier, tier: sq.tier, tierNames: BAL.evolution.names,   // 실제 시작 티어(하드코딩 제거)
    mainWeapon: sq.weapon, wingWeapon: sq.wing.weaponId,
    weaponLabels: WEAPON_LABELS,
    resonanceName: activeResonName,
    onSame: () => restart(cl.mode),
    onNew: () => restart('play'),   // 새 조합: 사람 플레이로 시작 무기부터 다시 선택
  });
}

// HUD용 무기 진화 라벨: 초진화 > 진화 우선, 강화 레벨 병기 (예: "템페스트2", "폭풍3")
function weaponEvoLabel(sq) {
  const w = sq.weapon;
  const superId = sq.weaponEvolutions2[w], evoId = sq.weaponEvolutions[w];
  if (superId) return `${evolutionDef(superId)?.short || ''}${sq.superLevels[w] || 1}`;
  if (evoId) return `${evolutionDef(evoId)?.short || ''}${sq.evoLevels[w] || 1}`;
  return undefined;
}

// 모듈 효과 누적기 재계산 (모듈 획득 시)
function recomputeMfx() {
  run.world.mfx = computeMfx(run.modules);
  run.squad.swarmPerDrone = run.world.mfx.swarmPerDrone;
}

// 중앙 킬 이벤트: "플레이어 공격으로 살아있던 적이 죽은 순간"을 개체당 정확히 한 번 처리.
// 모든 처치 경로(일반탄·파생탄·차지/메아리 랜스·시즈 광역·폭발 탄두 연쇄)가 이 함수로 모인다.
//   집계 대상: e.isEnemy (크리스탈·수송선·캡슐·보스·화면 밖 소멸 제외)
//   멱등: e._killHandled 플래그로 중복/재귀 안전. 폭발 처리 전에 플래그를 먼저 세워 재귀 이중 처리 차단.
function onEnemyKilled(e, w) {
  if (!claimKill(e)) return;   // 비적대·미사망·중복 차단 (개체당 1회, 폭발 재귀 안전)
  const mfx = w.mfx; if (!mfx) { w.squad.onEnemyKill(w, e); return; }
  if (mfx.explodeRadius > 0) {
    const dmg = Math.max(2, (e.maxHp || 20) * mfx.explodeDmgFrac);
    const rr = mfx.explodeRadius;
    // 시각 효과를 실제 폭발 반경에 맞춤 (링·파편이 데미지 범위보다 크게 보이던 문제)
    w.effects.burst(e.x, e.y, '#ff9c41', 8, rr * 1.6);
    w.effects.ring(e.x, e.y, '#ff9c41', 0, rr);
    for (const o of w.entities) {
      if (o === e || o.dead || !o.hitByBullet) continue;
      const dx = o.x - e.x, dy = o.y - e.y;
      if (dx * dx + dy * dy <= (rr + (o.r || 0)) ** 2) {
        o.hitByBullet(dmg, w);
        if (o.dead) onEnemyKilled(o, w);   // 연쇄 처치도 집계 (각 1회, _killHandled로 재귀 안전)
      }
    }
  }
  if (mfx.killDroneChance > 0 && Math.random() < mfx.killDroneChance) {
    w.squad.applyDelta(mfx.killDroneAmt, w);
  }
  w.squad.onEnemyKill(w, e);   // 키스톤(군체 용광로) 실제 적 처치 카운터
  // Gate 1: 공명 표식 이동(대상 파괴) + 지휘 프레임 처치 자동 스킬
  if (w.reson) resonEnemyRemoved(w.reson, e);
  if (w.squad.frameState) {
    const fp = frameOnKill(w.squad.frameState, BAL.gate1.frames);
    if (fp?.type === 'focus') { w.effects.ring(w.squad.x, w.squad.y, BAL.gate1.frames.assault.glow); if (run.coreLoop) run.coreLoop.frameFocusFired = true; }
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
  if (r.coreLoop) coreLoopUpdate(dt);   // Gate 1 하네스: 디렉터·공명·프레임·측정 진행
  if (r.campaign25) campaign25Update(dt);   // Gate 2: 25분 6지역 시간 캠페인 진행
  // 트랙 후반·보스·NEON RUSH일수록 BGM의 고역과 속도가 열리는 적응형 강도.
  const travelIntensity = r.totalTrack ? Math.min(1, r.traveled / r.totalTrack) : 0;
  const musicIntensity = r.phase === 'boss' ? 0.86 : r.phase === 'bossDeath' ? 0.35 : 0.3 + travelIntensity * 0.38;
  setBgmIntensity(Math.min(1, musicIntensity + (r.squad.inRush ? 0.2 : 0)));
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
      const { contentTier, difficultyLevel } = r.progression;   // 해금·변이=contentTier, 난이도스케일=difficultyLevel
      const supplyMult = r.node.type === 'supply' ? BAL.nodeReward.supplyPayoutMult : 1;   // 보급 노드 payout ×1.4 (§5.4)
      // 난이도 스케일: 적은 단단하고 빨라지고, 크리스탈은 소폭 커진다
      // 적 HP = 기본 × 난이도배수 × 화력비례(상한 있음: 강해질수록 DPS가 앞서 쓸어버리는 손맛 — A2)
      // 화력 비례 HP 상한을 난이도에 따라 올려 깊은 판에선 즉사(방치 클리어) 방지
      const hpCapS = BAL.economy.enemyHpPowerCap + BAL.economy.enemyHpCapPerStage * (difficultyLevel - 1);
      const pf = 1 + Math.min(hpCapS, Math.max(0, r.maxPower) / BAL.economy.enemyHpPowerScale);
      const gMul = BAL.difficulty.globalMult;   // 전체 난이도 배수(사용자 조정): 체력 ×gMul, 발사 주기 ÷gMul(더 빠름)
      const scaleEnemy = (e) => { e.hp = e.maxHp = Math.round(e.hp * mods.enemyHp * pf * (e.hpScaleMul ?? 1) * gMul); if (e.fireInterval) e.fireInterval *= mods.enemyRate / gMul; return e; };
      // 적 스폰 헬퍼: 난이도 스케일 + 변이(어픽스=섹터 확률) 롤 + 등록
      const spawnEnemy = (e, kind) => { scaleEnemy(e); maybeAffix(e, kind, contentTier, r.rng); w.entities.push(e); };
      // 적 항목은 난이도 비례 복제 스폰(§4.5): 복제본은 좌우 미러 + 세로로 살짝 시차.
      const dup = it.noDup ? 1 : copyCount(difficultyLevel, r.tutorial);   // 첫 노드는 최대 2로 제한. 코어루프 정밀 스트림은 noDup(정확한 수).
      if (it.type === 'crystal') w.entities.push(new Crystal(x, -60, Math.round(it.value * mods.crystal), w, supplyMult));
      else if (it.type === 'gatePair') {
        const gs = (g) => scaleGate(g, difficultyLevel, BAL.gate.flatScalePerStage, BAL.gate.flatScaleMax);
        w.entities.push(new GatePair(LOGICAL_W, -60, gs(it.left), gs(it.right)));
      }
      else if (it.type === 'creature') for (let k = 0; k < dup; k++) spawnEnemy(new Creature(k ? LOGICAL_W - x : x, -60 - 70 * k, it.size), 'creature');
      else if (it.type === 'splitter') for (let k = 0; k < dup; k++) spawnEnemy(new Creature(k ? LOGICAL_W - x : x, -60 - 70 * k, 'mid', { splits: 3 }), 'creature');
      else if (it.type === 'meteor') w.entities.push(new Meteor(x, -60, r.rng));
      else if (it.type === 'debris') w.entities.push(new Debris(x, -90, it.size));
      else if (it.type === 'power') {
        // 절반은 무기 캡슐(무기 선택/강화)로 교체 — 10초 임시 파워업만 반복되지 않게 (사용자 요청)
        if (r.rng() < 0.5) w.entities.push(new PowerModule(x, -60));
        else w.entities.push(new Capsule(x, -60, ['vulcan', 'laser', 'homing'][Math.floor(r.rng() * 3)]));
      }
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
      else if (it.type === 'dronePod') w.entities.push(new DronePod(x, -60, it.size, w, supplyMult));
      else if (it.type === 'midboss') w.entities.push(new MidBoss(LOGICAL_W, contentTier, r.maxPower));
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
      // 대응형 신규 적 (완만한 스테이지 HP 스케일 — 체력벽이 아니라 조준·수단 전환을 요구)
      else if (it.type === 'prismWarden') w.entities.push(new PrismWarden(x, difficultyLevel));
      else if (it.type === 'scavenger') w.entities.push(new Scavenger(x, difficultyLevel));
      else if (it.type === 'corruptedGate') {
        const gs = (g) => scaleGate(g, difficultyLevel, BAL.gate.flatScalePerStage, BAL.gate.flatScaleMax);
        const gate = new GatePair(LOGICAL_W, -60, gs(it.left), gs(it.right));
        w.entities.push(gate);
        w.entities.push(new GateParasite(gate, it.infectedLane ?? 0, difficultyLevel));
      }
    }

    if (r.traveled >= r.totalTrack && r.pending.length === 0 && !r.isBossNode) {
      // 비보스 노드: 보스 없이 통과 연출 → 맵 복귀
      r.phase = 'flythrough'; r.flyV = BAL.flythrough.startV; r.clearShown = true;
    } else if (r.traveled >= r.totalTrack && r.pending.length === 0) {
      r.phase = 'boss';
      w.scrollSpeed = 40; // 보스전: 트랙 거의 정지, 별만 천천히
      sfx('boss_in');
      setBgmIntensity(0.86); playBgm('boss'); // 보스 BGM으로 크로스페이드
      // 보스 정체성 = 캠페인/엔드리스 순서(§6.2). 서사형 보스 B7/B22는 항상 단독.
      const { bossTier } = r.progression;
      const bossId = campaignBossId(r.sector, r.mode, BAL.campaign.bosses, BAL.campaign.endlessBosses);
      const resolvedBossId = bossDefById(bossId).id;
      preloadBossArt(resolvedBossId); // 등장 이동 시간 동안 전용 레이어를 지연 로드
      const bossN = bossCountFor(resolvedBossId, bossTier, BAL.boss);
      const hpCap = Math.max(BAL.boss.hp, r.maxPower * BAL.boss.hpPerPowerCap); // A4: 화력 대비 상한 → 처치시간 상한
      const totalMult = bossN > 1 ? BAL.boss.multiTotalMult : 1;                 // 다중 총 HP 배수(각=이/보스수)
      r.bosses = [];
      // 보스 발사 주기: 보스는 scaleEnemy를 안 거쳐 globalMult 버프를 못 받으므로 여기서 bossRateMult로 보정(나눌수록 빠름)
      const bossRate = r.mods.enemyRate / BAL.difficulty.bossRateMult;
      for (let i = 0; i < bossN; i++) {
        const b = makeBoss(LOGICAL_W, bossRate, bossTier, bossN > 1 ? 0.72 : 1, bossId);
        b.homeX = LOGICAL_W * (i + 1) / (bossN + 1);   // 가로 슬롯
        b.x = b.homeX;
        b.swayScale = 1 / bossN;                        // 좌우 폭 축소 → 겹침 방지
        const variantHp = 1 + BAL.bossVariant.hpPerLoop * b.variantLevel;
        const rawHp = Math.max(BAL.boss.hp, r.maxPower * BAL.boss.hpPerPower) * r.mods.boss * (b.pattern.tanky ?? 1) * variantHp;
        // 전체 난이도 배수 × 보스 전용 배수 (상한 이후에 곱해 '체력 상한' 자체를 함께 끌어올린다)
        b.hp = b.maxHp = Math.round(Math.min(rawHp * totalMult / bossN, hpCap) * BAL.difficulty.globalMult * BAL.difficulty.bossHpMult);
        r.bosses.push(b);
      }
      r.boss = r.bosses[0];   // 연출·클리어 배너 앵커용 선두
    }
  } else if (r.phase === 'boss') {
    r.scrollY += 30 * dt;
    for (const b of r.bosses) { if (b.dead) b.deathT += dt; else b.update(dt, w); }  // 죽은 보스는 페이드, 산 보스는 교전 지속
    w.boss = r.bosses.find((b) => !b.dead) || r.bosses[0];   // 호밍 표적 = 살아있는 선두
    if (r.bossLab && r.bosses.every((b) => b.dead)) {   // 보스랩: 처치하면 잠시 뒤 재소환(패턴 반복 관찰)
      r._labRespawnT = (r._labRespawnT || 0) + dt;
      if (r._labRespawnT > 1.2) { r._labRespawnT = 0; spawnBossLabBoss(r.bossLab); }
    }
    if (r.bosses.every((b) => b.dead) && !r.coreLoop && !r.campaign25 && !r.bossLab) {   // 코어루프·25분캠페인·보스랩은 자체 종료/재개 처리(캠페인 연출 미진입)
      // 전원 격파 → 파괴 연출 시작
      r.phase = 'bossDeath';
      r.seqT = 0;
      r.chainT = 0;
      sfx('boss_die');
      setBgmIntensity(0.24); playBgm('title'); // 승리 여운 BGM으로 전환
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
      r.effects.text(LOGICAL_W / 2, logicalH * 0.42, '전투 완료!', COLORS.ally);
      r.effects.ring(LOGICAL_W / 2, logicalH * 0.42, COLORS.ally);
      r.effects.flash(0.4);
      sfx('evolve');
    }
    if (r.squad.y < BAL.flythrough.exitY) { onEncounterClear(); return; }
  }

  // 개체 업데이트
  for (const e of w.entities) e.update(dt, w);
  for (const b of w.bullets) b.update(dt, w);
  for (const b of w.enemyBullets) if (!b.dead) b.update(dt, w);   // 같은 프레임에 제거된 탄(위상 잔상)은 업데이트 안 함
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
          let bossDmg = b.damage * (w.mfx?.bossDmgMult ?? 1) * siegeBonus;
          if (w.reson && b.sourceWeaponId === 'homing' && isSeekerHit(w.reson, bo)) bossDmg *= BAL.gate1.resonance.seekerBeam.missileBonus * (w.squad?.resonPowerMult || 1);  // 시커 증폭(+§7.3 공명 증폭)
          // 코어루프 B22 양측 클램프(dpsCap 하한·enrage 상한)는 보스 hitByBullet 래퍼가 '모든' 경로에 적용한다(§5.8, Codex P1).
          const hpBefore = bo.hp;
          bo.hitByBullet(bossDmg, w, b);
          if (w.metrics) tallyBulletDamage(w, b, Math.max(0, hpBefore - bo.hp), bo);   // Gate 1: 실제 적용 피해(HP 감소) 집계(G1-07)
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
        let dealt = e.def ? b.damage * (w.mfx?.bossDmgMult ?? 1) : b.damage;
        // 시커 빔(G1-06): 표식 대상을 맞힌 유도 미사일은 실제 피해가 증폭된다(우선추적 + 증폭).
        if (w.reson && b.sourceWeaponId === 'homing' && isSeekerHit(w.reson, e)) dealt *= BAL.gate1.resonance.seekerBeam.missileBonus * (w.squad?.resonPowerMult || 1);   // 시커 증폭(+§7.3 공명 증폭)
        const hpBefore = e.hp ?? 0;
        e.hitByBullet(dealt, w, b); // 탄환 문맥 전달(프리즘 코어 등)
        if (w.metrics) tallyBulletDamage(w, b, Math.max(0, hpBefore - (e.hp ?? 0)), e);   // 실제 적용 피해(HP 감소) 집계(G1-07)
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
    if (r.coreLoop) { finishCoreLoop('hull'); return; }        // Gate 1 하네스: 내구도 소진 → 결과 화면
    if (r.campaign25) { finishCampaign25('hull'); return; }    // Gate 2: 내구도 소진 → 25분 결과(regionResults 첨부)
    endExpedition('death');
  }

  // 선택 요청 소비 (우선순위: 교리 > 무기 진화). 보스·연출 중엔 열지 않는다. 동시에 둘이 열리지 않음.
  if (r.phase === 'track' && !drafting && !r.coreLoop && !r.campaign25) {
    if (r.squad.pendingDoctrine) openDoctrine();
    else if (r.squad.pendingWeaponEvolution) openWeaponEvolution(r.squad.pendingWeaponEvolution);
  }
}

// 기함 교리 3택 (첫 업그레이드 1회). 게임 일시 정지.
function openDoctrine() {
  const r = run;
  drafting = true;
  sfx('evolve');
  ui.showDoctrineDraft({
    options: DOCTRINES,
    onPick(id) {
      r.squad.doctrine = id;
      r.squad.pendingDoctrine = false;
      drafting = false;
      ui.hide();
      sfx('buy');
      r.effects.flash(0.7);
      r.effects.text(r.squad.x, r.squad.y - 60, `전투 스타일 선택: ${DOCTRINE_BY_ID[id].icon} ${DOCTRINE_BY_ID[id].name}`, COLORS.reward, 18);
    },
  });
}

// 키스톤 3택 (첫 섹터 보스 후 1회, 원정당 1개). 게임 일시 정지. after=선택 완료 후 진행.
function openKeystone(after) {
  const r = run;
  drafting = true; state = 'map';
  input.charging = false;   // 선택 중 차지 초기화
  paused = false;
  sfx('evolve');
  ui.showKeystoneDraft({
    options: KEYSTONES, sector: r.sector,
    onPick(id) {
      r.squad.keystone = id;
      r.squad.keystoneState = freshKeystoneState();   // 누적 카운터 0에서 시작
      drafting = false;
      ui.hide();
      sfx('buy');
      r.effects.flash(0.7);
      after();
    },
  });
}

// 무기 진화 2택 선택창 (게임 일시 정지). 단계별: 1=1단계 진화, 2/재선택=2단계 초진화.
function openWeaponEvolution(weapon) {
  const r = run;
  const stage = r.squad.pendingEvoStage || 'pick1';
  const isSuper = stage === 'pick2' || stage === 're';
  const opts = isSuper ? superEvolutionOptions(weapon) : evolutionOptions(weapon);
  if (!opts.length) { r.squad.pendingWeaponEvolution = null; r.squad.pendingEvoStage = null; return; }
  drafting = true;
  sfx('evolve');
  ui.showWeaponEvolution({
    weapon, options: opts, tier: isSuper ? 2 : 1, repick: stage === 're',
    onPick(id) {
      if (isSuper) {
        r.squad.weaponEvolutions2[weapon] = id;              // 2단계 초진화(재선택 포함)
        if (stage === 'pick2') r.squad.superLevels[weapon] = 1;   // 초진화 Lv1부터
      } else {
        r.squad.weaponEvolutions[weapon] = id;               // 1단계 진화
        r.squad.evoLevels[weapon] = 1;                        // 진화 Lv1부터
      }
      r.squad.pendingWeaponEvolution = null;
      r.squad.pendingEvoStage = null;
      drafting = false;
      ui.hide();
      sfx('buy');
      r.effects.flash(0.6);
      r.effects.text(r.squad.x, r.squad.y - 60, `${opts.find((o) => o.id === id).name}!`, COLORS.reward, 18);
      r.squad.triggerUpgradeFx(r.world, isSuper ? 'super' : 'evolution');
    },
  });
}

// 원정 종료 (사망 또는 끝내기): 코인·기록 정산 → 결과 화면
// reason: 'death'(실제 사망) | 'quit'(자발적 종료) | 'campaignClear'(캠페인 완료).
//  death만 기본·진행도 보상을 더한다. quit은 전투 중 획득 코인만 저장.
function endExpedition(reason = 'death', { toTitle = false } = {}) {
  state = 'done';
  drafting = false;
  betweenStages = false;
  setBgmIntensity(0.2); playBgm('title');
  const r = run;
  const data = save.get();
  const isRecord = r.maxPower > data.best;
  const best = Math.max(data.best, r.maxPower);
  const earned = Math.round(r.world.coins * r.world.stats.coinMult);   // 전투 중 획득 코인
  // 진행도(0~1): 완료 섹터 + 현재 섹터 내 노드 진행 / 캠페인 섹터 수.
  const progress = ((r.sector - 1) + (r.done.length / (BAL.sector.depth + 1))) / BAL.campaign.sectors;
  const total = reason === 'death'
    ? failureReward({ earned, progress, base: BAL.run.failBaseCoins, perProgress: BAL.run.coinPerProgress })
    : earned;   // quit·기타: 획득분만
  const bonus = total - earned;   // UI 분할 표시용 (원정 진행 보상)
  if (!r.settled) {   // 중복 정산 차단 (같은 원정을 두 번 저장하지 않음)
    r.settled = true;
    // 진행 기록은 모드별로 분리 저장(캠페인=stage, 엔드리스=endlessBest). 코인·최고화력은 공용.
    save.set({ best, coins: data.coins + total, ...progressPatch(r.mode, r.sector, data) });
  }
  if (toTitle) { showTitleScreen(); return; }
  ui.showLose({ stage: r.sector, maxPower: r.maxPower, coins: earned, bonus, best, isRecord, modules: moduleSummary(r.modules), onRetry: startPlay, onHangar: showHangar });
}

/** 캠페인 최종 보스(하이브 퀸) 격파 → 정산 + 무한 원정 해금 + 승리 화면 (§6.3). */
function winCampaign() {
  const r = run;
  state = 'done'; drafting = false; betweenStages = false; setBgmIntensity(0.2); playBgm('title');
  const data = save.get();
  const best = Math.max(data.best, r.maxPower);
  const earned = Math.round(r.world.coins * r.world.stats.coinMult);
  if (!r.settled) {
    r.settled = true;
    // 캠페인 완주 정산 (이 경로는 캠페인 전용) → stage 갱신 + 완주·해금 플래그
    save.set({ best, coins: data.coins + earned, ...progressPatch('campaign', r.sector, data), campaignCleared: true, endlessUnlocked: true });
  }
  ui.showVictory({ coins: earned, best, onTitle: showTitleScreen, onEndless: startEndless, onRestart: startPlay });
}

/** 무한 원정 시작(캠페인 클리어 후 해금). 캠페인 이후 섹터부터 보스 순환·변주가 강해진다. */
function startEndless() {
  drafting = false; betweenStages = false; sfx('start');
  newExpedition('endless');
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

  // 6구역 × 3층 절차적 배경: 해상도·화면비에 무관하고 이미지 타일 이음새가 없다.
  const scroll = run ? run.scrollY : performance.now() * 0.02;
  zoneBackdrop.draw(ctx, logicalH, scroll, run ? run.sector : save.get().stage);
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
      bosses: r.phase === 'boss' ? r.bosses.map((b) => ({ hp: Math.max(0, b.hp), maxHp: b.maxHp, name: b.korName, dead: b.dead, stagger: b.stagger, staggerMax: BAL.neonArbiter.staggerMax, breakT: b.breakT })) : [],
      count: r.squad.count,
      cruisers: r.squad.cruisers || 0,
      tierName: BAL.shipTraits[Math.min(r.squad.tier, BAL.shipTraits.length - 1)].tag,
      shipName: BAL.evolution.names[Math.min(r.squad.tier, BAL.evolution.names.length - 1)],
      doctrine: doctrineIcon(r.squad.doctrine),
      tierPower: Math.round(r.squad.banked || 0),
      upgradeCur: r.squad.cruisers || 0,   // 기함 업그레이드까지 모은 순양함
      upgradeMax: needCruisers,            // 필요한 순양함 (0 = 최종 티어)
      stage: r.sector,
      weapon: r.squad.weapon,
      weaponLv: r.squad.weaponLv,
      weaponEvo: weaponEvoLabel(r.squad),
      shield: r.squad.shield,
      modules: moduleSummary(r.modules),
      logicalH,
      flow: r.squad.flow || 0,
      flowMax: BAL.flow.max,
      rushT: r.squad.rushT || 0,
      keystoneIcon: keystoneIcon(r.squad.keystone),
    });
    // Gate 1 코어루프 / Gate 2 25분 캠페인 HUD (내구도·두 무기·공명·프레임·타이머). 둘 다 surv·director를 가진다.
    const cl = r.coreLoop || r.campaign25;
    if (cl && r.squad.surv) {
      const sq = r.squad;
      const nx = nextEvent(cl.director);
      const evLabel = { behaviorUpgrade: '행동 변화', secondWeapon: '보조 무기', hullTier: '함체 승급', resonanceTelegraph: '공명 예고', firstResonance: '공명 완성', framePick: '지휘 프레임', eliteWave: '정예 웨이브', bossStart: '지역 보스', result: '결과',
        regionEnter: '지역 진입', fleetTelegraph: '슬롯 예고', fleetSlot: '함대 슬롯', secondResonance: '두번째 공명', finalWeaponEvo: '최종 진화', apex: 'Apex', pathChoice: '경로 선택' };
      const fh = sq.frameId ? frameHud(BAL.gate1.frames, sq.frameId) : null;
      drawCoreLoopHud(ctx, LOGICAL_W, logicalH, {
        hullFrac: hullFrac(sq.surv), hull: sq.surv.hull, hullMax: sq.surv.hullMax,
        mainWeapon: sq.weapon, mainLv: sq.weaponLv, wingWeapon: sq.wing.weaponId, wingLv: sq.wing.level,
        resonanceName: sq.reson.activeId ? RESONANCES[sq.reson.activeId].name : (cl.telegraph ? RESONANCES[cl.build.resonance]?.name : ''),
        resonanceFrac: resonChargeFrac(sq.reson, BAL.gate1.resonance),
        telegraph: resonShouldTelegraph(sq.reson, BAL.gate1.resonance) || (cl.telegraph && !sq.reson.activeId),
        frameIcon: fh?.icon || '', frameGlow: fh?.glow || '', frameName: fh?.name || '',
        dirT: elapsed(cl.director),
        nextEventLabel: nx ? evLabel[nx.type] || '' : '', nextEventIn: nx ? nx.inSec : 0,
      });
    }
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
  endExpedition('quit', { toTitle: true });
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
chargeBtn.title = '차지 샷 (길게 누르기)';
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
    endlessUnlocked: d.endlessUnlocked,      // 무한 원정 해금 시에만 버튼 표시(§6.5)
    endlessBest: d.endlessBest,
    onStart: startPlay,
    onEndless: d.endlessUnlocked ? startEndless : null,
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

// Gate 1 하네스 개발 훅 (?coreLoopTest=1 전용). 4시드 시뮬·측정 재생용.
window.__nfCoreLoop = {
  // 사람 플레이(H0·내구도100·무기1·선택창). 브라우저에서 직접 조작·검증용.
  startPlay() { startCoreLoop({ mode: 'play' }); return run.coreLoop; },
  // 자동 측정 시작(autopilot+auto-select). 헤드리스 재생용.
  startMeasure(buildId = 'railStorm') { startCoreLoop({ mode: 'measure', buildId }); return run.coreLoop; },
  builds: () => Object.keys(CORE_LOOP_BUILDS),
  /** 헤드리스 측정: 한 빌드를 결과까지 빠르게 재생(렌더 없음). 반환: 측정 스냅샷. */
  run(buildId = 'railStorm', maxSeconds = 640, dt = 1 / 60) {
    startCoreLoop({ mode: 'measure', buildId });
    const steps = Math.ceil(maxSeconds / dt);
    for (let i = 0; i < steps; i++) {
      update(dt);
      if (run.coreLoop?.resultShown) break;
    }
    return window.__nfRunMetrics || run.coreLoop?.metrics.snapshot();
  },
  metrics: () => window.__nfRunMetrics,
  /**
   * 런타임 통합 검증(Codex 재검증 §5: 소스 문자열이 아니라 실제 게임 루프를 돌려 확인).
   * 각 빌드를 measure 모드로 완주시켜 다음을 단언한다:
   *  두 무기 실피해 · 공명 실피해(8~30%) · 프레임 자동 스킬 실발동 · 긴급 재건(스트레스) · TTK 45~60 · 내구도 감소.
   * 반환: { pass, checks: [...] }.
   */
  integrationCheck() {
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
    for (const b of ['railStorm', 'microMissile', 'seekerBeam']) {
      startCoreLoop({ mode: 'measure', buildId: b });
      const steps = Math.ceil(700 / (1 / 60));
      for (let i = 0; i < steps; i++) { update(1 / 60); if (run.coreLoop?.resultShown) break; }
      const s = window.__nfRunMetrics, cl = run.coreLoop, build = CORE_LOOP_BUILDS[b];
      const dmgW = Object.keys(s.damageByWeapon);
      add(`${b}: 두 무기 실피해`, dmgW.includes(build.main) && dmgW.includes(build.wing), dmgW);
      add(`${b}: 공명 실피해 8~30%`, s.resonanceShare >= 0.08 && s.resonanceShare <= 0.30, +(s.resonanceShare * 100).toFixed(1) + '%');
      const frameFired = { assault: cl.frameFocusFired, carrier: cl.sawVolley, phase: cl.sawDash }[frameForBuild(b)];
      add(`${b}: ${frameForBuild(b)} 프레임 자동 스킬 실발동`, frameFired, { volley: !!cl.sawVolley, dash: !!cl.sawDash, focus: !!cl.frameFocusFired });
      add(`${b}: B22 TTK 45~60`, s.bossTtkSec >= 45 && s.bossTtkSec <= 60, s.bossTtkSec);
      add(`${b}: 내구도 감소`, s.hullDamageTaken > 0, s.hullDamageTaken);
    }
    // 무적 방지: 스트레스 빌드는 내구도 0 사망 + 긴급 재건 발동
    startCoreLoop({ mode: 'measure', buildId: 'tankStress' });
    for (let i = 0, n = Math.ceil(700 * 60); i < n; i++) { update(1 / 60); if (run.coreLoop?.resultShown) break; }
    const st = window.__nfRunMetrics;
    add('tankStress: 무적 아님(내구도 0 사망)', st.gameOverReason === 'hull', st.gameOverReason);
    add('긴급 재건 실런타임 발동', st.emergencyRebuilds >= 1, st.emergencyRebuilds);
    const pass = checks.every((c) => c.ok);
    return { pass, failed: checks.filter((c) => !c.ok).map((c) => c.name), checks };
  },
};

// Gate 2 25분 캠페인 개발/측정 훅 (?campaign25=1). 헤드리스 완주 재생 + 지역별 보스 TTK.
window.__nfCampaign25 = {
  start(buildId = 'railStorm', mode = 'measure') { startCampaign25({ mode, buildId }); return run.campaign25; },
  /** 헤드리스: 25분 캠페인을 결과까지 빠르게 재생(렌더 없음). 반환: 스냅샷(regionResults 포함). */
  run(buildId = 'railStorm', maxSeconds = 1560, dt = 1 / 60) {
    startCampaign25({ mode: 'measure', buildId });
    const steps = Math.ceil(maxSeconds / dt);
    for (let i = 0; i < steps; i++) { update(dt); if (run.campaign25?.resultShown) break; }
    return window.__nfRunMetrics || run.campaign25?.metrics.snapshot();
  },
  metrics: () => window.__nfRunMetrics,
  /** 25분 구조 검증: 6지역 보스 전부 처치 + 각 지역 TTK가 목표창 근사 + 완주. */
  integrationCheck() {
    const s = this.run('railStorm', 1560);
    const rr = s.regionResults || [];
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
    add('6지역 보스 전부 등장', rr.length === 6, rr.map((x) => x.boss).join(','));
    add('6지역 보스 전부 처치', rr.filter((x) => x.killed).length === 6, rr.filter((x) => x.killed).length);
    add('B7 최종 처치로 완주(clear)', s.campaignReason === 'clear', s.campaignReason);
    for (const x of rr) {
      const region = BAL.gate2.regions.find((g) => g.i === x.region);
      const [lo, hi] = region ? region.bossTtk : [0, 999];
      add(`${x.boss} TTK ${lo}~${hi} 근사`, x.ttk != null && x.ttk >= lo - 5 && x.ttk <= hi + 8, x.ttk);
    }
    const pass = checks.every((c) => c.ok);
    return { pass, failed: checks.filter((c) => !c.ok).map((c) => c.name), checks };
  },
};
