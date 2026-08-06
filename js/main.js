// 진입점: 캔버스 관리 + 게임 루프 + 상태 머신 + 트랙 생성
import { BAL } from './balance.js';
import { createInput } from './input.js';
import { createStarfield, drawHUD, drawCoreLoopHud, drawSectorLoadoutHud, COLORS, glow, WEAPON_LABELS, WEAPON_LABELS_EN, WEAPON_COLORS } from './render.js';
import { Squad, Crystal, Coin, DronePod, GatePair, TriGate, Capsule, Pow, Creature, Meteor, Debris, PowerModule, Sniper, Turret, Weaver, Charger, Mine, Bomber, Zapper, Orbiter, Shielder, BroodCarrier, Blinker, MidBoss, Boss, makeBoss, createEffects, Bullet, HomingMissile, setEntityLang } from './entities.js';
import { bossDefById, preloadBossArt, preloadSprites } from './sprites.js';
import { createCutscene, tickCutscene, drawCutscene, drawCutsceneBackdrop, cutsceneReady, CUT } from './cutscene.js';
import { maybeAffix, applyAffixes } from './affixes.js';
import { computeMfx, draftOptions, moduleSummary } from './modules.js';
import { evolutionOptions, superEvolutionOptions, evolutionDef } from './weapon-evolutions.js';
import { DOCTRINES, DOCTRINE_BY_ID, doctrineIcon } from './doctrines.js';
import { keystoneIcon, KEYSTONES, freshKeystoneState } from './keystones.js';
import { claimKill } from './kill-events.js';
import { PrismWarden, Scavenger, GateParasite } from './adaptive-enemies.js';
import { mulberry32, pickTier, pickChunk, isSafeChunk, isTutorialSafeChunk, chunkMinTier } from './chunks.js';
import { stageMods, hangarCost, scaleGate, generateSectorMap, failureReward, copyCount, progressionFor, nodeCoinReward, nodeModuleGrant, campaignBossId, cruisersNeededForTier, effectiveFirepower, progressPatch, bossCountFor, invertGateOp, firstDefeatUpgradeOptions, FIRST_DEFEAT_KEYS } from './logic.js';
import { preloadStyle, setArtStyle, getArtStyle, STYLE_NAMES, SPRITE_SIZES, invalidateSpriteCache } from './sprites.js';
import { loadPatch, applyFlat, subscribePatch } from './tuning.js';
import { createSave } from './save.js';
import { ui, DOCTRINE_EN, KEYSTONE_EN } from './ui.js';
import { initAudio, unlockAudio, playBgm, playBgmForSector, playBgmForBoss, setBgmIntensity, sfx, toggleMute, isMuted, setBgmVolume, setSfxVolume, getSettings } from './audio.js';
import { playIntro } from './intro.js';
import { createZoneBackdrop } from './zone-backdrop.js';
// 전투 카메라 줌(작업지시서). 렌더·입력 좌표에만 쓰는 시각 배율 — 게임 규칙 불변.
import { createCamera, advanceZoom, stepZoom, safeZoom, screenToWorldX, DEFAULT_ZOOM, MAX_ZOOM } from './camera-zoom.js';
// 휠 입력 정규화·누적(RC1 보정): 가로 휠 오인·정밀 터치패드 과민 방지. 순수 모듈로 분리해 실이벤트 테스트.
import { createWheelStepAccumulator, resolveWheelZoom } from './wheel-input.js';
// 2.5D 함미 추적 시점(작업지시서): 순수 투영 + 개체별 렌더. 렌더·입력 좌표에만 적용, 게임 규칙 불변.
import { createChaseProjection, chaseBlendForZoom, advanceChaseBlend, screenToWorldXAtPlayer, projectPoint, projectObject, CHASE_FULL_ZOOM } from './chase-camera.js';
import { drawWorldProjected, collectEdgeWarnings } from './chase-render.js';
import { drawWarpField } from './chase-backdrop.js';
import { PROP_KEYS, PROP_CAPS, ENEMY3D } from './chase3d-prop-defs.js';   // 순수 상수 전용 모듈(의존 0) — 지오메트리·팩토리는 플래그 뒤 renderer 만 로드(Codex 재검토 P2)
// 실제 3D 함미 추적(Phase 0, ?chase3d=1 전용). config/mapping은 순수(Three.js 미의존)라 정적 import 안전.
//  renderer(Three.js 로드)는 플래그가 있을 때만 아래에서 동적 import 한다(§3.2: 플래그 없으면 three 미로드).
import { chase3dEnabled, chase3dTestEnabled, chase3dLabTarget, chase3dPropsEnabled, transitionT } from './chase3d-config.js';
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
import { regionAt as c25RegionAt, regionByIndex as c25Region, buildCampaign25Schedule, eventAction25, pathChoicePair } from './campaign25.js';
// ── Stage 1 행동 계측(작업지시서). 벤더 독립 코어 + 동의 + 선택형 GA4 어댑터 + 게임 파사드. ──
import { ANALYTICS_CONFIG, SCHEMA, shouldOfferConsent, isDevUrl, isDebugUrl, viewportGroup } from './analytics-config.js';
import { createAnalytics, installDebugGlobal } from './analytics.js';
import { createConsent } from './analytics-consent.js';
import { createGa4Adapter, ga4Sink } from './analytics-ga4.js';
import { createGameAnalytics } from './analytics-events.js';
// ── Prolific 첫인상 테스트(작업지시서). 전용 모드 흐름·타이머·설문. PID/Study/Session은 읽지 않는다. ──
import { isPlaytestUrl, playtestCohort, playtestConfigStatus, PLAYTEST_CONFIG, PLAYTEST_TIME_LIMIT_SEC } from './playtest-config.js';
import { createPlaytestTimer, createPlaytestSubmission } from './playtest.js';
// ── CrazyGames 포털 배포 분리(지시서). 순수 판정 + no-op 플랫폼 이음매(광고 SDK는 이번 단계 미구현). ──
import { detectDistribution, isPortalMode, analyticsAllowedForDistribution } from './distribution-config.js';
import { platform } from './platform.js';

const _clParams = new URLSearchParams(location.search);
const CORE_LOOP = _clParams.has('coreLoopTest');        // 사람 플레이(H0·내구도100·무기1·조작 가능)
const CORE_MEASURE = _clParams.has('coreLoopMeasure');  // 자동 측정 재생(autopilot+auto-select, 헤드리스 시뮬)
const CAMPAIGN25 = _clParams.has('campaign25');         // Gate 2: 25분 6지역 시간 캠페인(측정·개발용 진입)
const BOSSLAB = _clParams.has('bosslab');               // 보스 패턴 프리뷰: ?bosslab=1&boss=B14 (개발/테스트용)
const FLEETLAB = _clParams.has('fleetlab') && !BOSSLAB; // 함대 프리뷰: ?fleetlab=1 — 드론·순양함을 갖춘 채 즉시 전투(§G-1 아군 3D 확인용, 개발/테스트 전용)
// CrazyGames 포털 배포(?distribution=crazygames 또는 crazygames.com 호스트). Prolific·개발보다 우선(§3.2).
const DIST = detectDistribution({ hostname: location.hostname, search: location.search });
const PORTAL_MODE = isPortalMode(DIST);                 // 포털: 영어·빠른 시작·GA4/동의/Prolific UI 없음(§3)
// Prolific 전용 흐름: ?playtest=prolific 이고 개발·포털 URL이 아닐 때만. 포털이 이기면 Prolific 비활성(§3.2).
const PLAYTEST = isPlaytestUrl(location.search) && !CORE_LOOP && !CORE_MEASURE && !CAMPAIGN25 && !BOSSLAB && !PORTAL_MODE;
const PLAYTEST_COHORT = PLAYTEST ? playtestCohort(location.search) : 'unknown';
// 영어 런타임 경로: Prolific과 포털이 공유한다(중복 사전 없이 같은 EN/LANG 분기 재사용, §P0-2).
const EN = PLAYTEST || PORTAL_MODE;
const LANG = EN ? 'en' : 'ko';
const tx = (en, ko) => (EN ? en : ko);   // 런타임 토스트/문구용 간이 선택자(영어=포털·Prolific, 한국어=일반)
let lastWeapon = null;   // P0-4: 직전 출격 주무기(같은 무기 즉시 재도전용, sectorStartWeaponPick/newExpedition에서 기록)
setEntityLang(EN);   // 캔버스 라벨(entities.js) 언어 1회 설정 — 포털·Prolific=영어
// Prolific 참가자에게만 쓰는 표시용 번역. ID·수치·적용 로직은 기존 데이터를 그대로 사용한다.
const PLAYTEST_SHIP_TRAITS_EN = [
  'EMBER · Balanced', 'FLARE · Rapid Fire', 'ARCLIGHT · Focused Fire',
  'AURORA · Wide Barrage', 'ZENITH · Piercing Artillery', 'QUASAR · Maximum Pierce',
];
const PLAYTEST_RESONANCE_EN = {
  railStorm: 'Rail Storm',
  microMissile: 'Micro-Missile Barrage',
  seekerBeam: 'Seeker Beam',
};
const PLAYTEST_EVOLUTION_EN = {
  vulcan_storm: ['Storm Vulcan', 'Wide shots ricochet to nearby enemies'],
  vulcan_needle: ['Needle Gatling', 'Rapid piercing shots in a tight line'],
  laser_prism: ['Prism Array', 'The piercing beam splits sideways'],
  laser_cutter: ['Null Cutter', 'Occasional heavy beams clear enemy shots'],
  homing_wasp: ['Wasp Swarm', 'Launches five small homing missiles'],
  homing_siege: ['Siege Torpedo', 'A slow torpedo creates a huge explosion'],
  vulcan_tempest: ['Tempest', 'Faster barrages cover a wider area'],
  vulcan_lance: ['Lance Vulcan', 'Piercing shots focus on one point'],
  laser_nova: ['Nova Beam', 'A thicker, stronger piercing beam'],
  laser_reaper: ['Reaper Beam', 'Rapid cutting beams with lower damage per hit'],
  homing_legion: ['Legion', 'Continuously launches many homing missiles'],
  homing_nova: ['Nova Torpedo', 'A decisive torpedo with a massive blast'],
};

function playtestWeaponStepLabel(step, sq) {
  if (!EN) return step;
  const slot = step.id.endsWith('-wing') ? 'wing' : 'main';
  const weapon = step.id.includes('vulcan') ? 'vulcan'
    : step.id.includes('laser') ? 'laser'
      : step.id.includes('homing') ? 'homing'
        : slot === 'wing' ? sq.wing.weaponId : sq.weapon;
  const weaponLabel = WEAPON_LABELS_EN[weapon] || weapon || 'Weapon';
  const level = step.label.match(/Lv(\d+)/)?.[1];
  if (step.id.startsWith('lv-')) return { ...step, label: `${weaponLabel} Lv${level || ''}`, desc: 'More projectiles, spread, and piercing' };
  if (step.id.startsWith('evo-') || step.id.startsWith('super-')) {
    const evoId = step.id.replace(/^(evo|super)-/, '');
    const en = PLAYTEST_EVOLUTION_EN[evoId];
    return en ? { ...step, label: `${weaponLabel}: ${en[0]}`, desc: en[1] } : { ...step, label: `${weaponLabel} evolution`, desc: 'Changes the attack pattern' };
  }
  if (step.id.startsWith('evolv-')) return { ...step, label: `${weaponLabel} Evolution Lv${level || ''}`, desc: 'Evolution power increased' };
  if (step.id.startsWith('superlv-')) return { ...step, label: `${weaponLabel} Super Evolution Lv${level || ''}`, desc: 'Super-evolution power increased' };
  return step;
}

// 타이틀에 25분 캠페인 진입 버튼을 노출할지. 섹터 원정으로 일원화하며 숨김(이사 결정).
//  ⚠️ 기능을 지운 게 아니라 '입구'만 닫았다 — campaign25 코드·데이터·테스트는 전부 그대로다.
//  되돌리려면 이 값만 true. 그동안에도 ?campaign25=1&play=1 로는 계속 들어갈 수 있어
//  개발·검증(integrationCheck 15항목)에는 지장이 없다.
const SHOW_CAMPAIGN25_ENTRY = false;

const LOGICAL_W = BAL.logicalW;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// 실제 3D 계층(§6). 플래그가 있을 때만 아래에서 생성 — 없으면 null(RC2와 동일한 화면).
let canvas3d = null, hudCanvas = null, hudCtx = null, chase3dOverlay = null;
let chase3d = null;      // renderer 컨트롤러(동적 import 성공 시). 실패·미지원이면 계속 null → RC2 유지(§3.3).
let chase3dT = 0;        // 현재 전환 t(0~1). draw가 2D 월드 표시/HUD 계층 라우팅에 사용.

// Pretendard 즉시 로드 → 캔버스 텍스트가 폴백(Segoe UI) 대신 Pretendard로 렌더되게. 로드되면 매 프레임 재렌더가 반영.
try { document.fonts?.load('700 16px Pretendard').then(() => document.fonts.load('400 16px Pretendard')); } catch { /* 폰트 API 미지원 시 CSS 폴백 */ }

let scale = 1;
let logicalH = 800;

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 뷰포트가 0(모바일 백그라운드·앱 전환·URL바 전환 중 resize)일 때 그대로 계산하면
  //  scale=0 → logicalH=NaN → 다음 draw의 createLinearGradient가 예외 → rAF 중단 → 영구 프리즈.
  //  이런 퇴화 resize는 무시하고 직전 유효 치수를 유지한다.
  if (!vw || !vh) return;
  const maxW = Math.min(vw, vh * 0.62); // PC 와이드에선 세로 기둥
  scale = maxW / LOGICAL_W;
  logicalH = Math.round(vh / scale);
  canvas.width = Math.round(LOGICAL_W * scale);
  canvas.height = vh;
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
  sizeChase3DCanvases();   // 3캔버스 동일 CSS 크기·논리 viewport 유지(§6). canvas3d 없으면 no-op.
}
// #game3d·#game-hud 를 #game 과 정확히 같은 크기·위치로 맞춘다(§6). 함수 선언(호이스팅)이라 resize에서 먼저 호출돼도 안전.
function sizeChase3DCanvases() {
  if (!canvas3d) return;
  // #game 은 flex 로 #stage 가운데 정렬 → 오버레이도 #game 의 실제 위치·크기에 정확히 맞춘다(§6 동일 viewport).
  for (const c of [canvas3d, hudCanvas]) {
    c.width = canvas.width; c.height = canvas.height;
    c.style.width = canvas.style.width; c.style.height = canvas.style.height;
    c.style.left = canvas.offsetLeft + 'px'; c.style.top = canvas.offsetTop + 'px';
  }
  chase3d && (chase3d._lastW = 0);   // 다음 프레임 renderer가 setViewport 다시 하도록
}
window.addEventListener('resize', resize);
resize();

const starfield = createStarfield(LOGICAL_W);
const zoneBackdrop = createZoneBackdrop(LOGICAL_W);
const save = createSave();

// 전투 카메라(시각 배율). 저장된 view.zoom을 안전하게 백필해 시작. anchor는 매 프레임 함대 위치로 갱신(draw).
const camera = createCamera(save.get().view?.zoom);
// 2.5D 추적 시점 blend(0=전술 .. 1=완전 추적). 줌과 별도로 350~500ms ease-out 보간(§3.3).
const chase = { current: chaseBlendForZoom(camera.current), target: chaseBlendForZoom(camera.current) };
let chaseProjection = null;   // 매 프레임(update) 최신 함대·줌·blend로 재생성. 입력 역변환·렌더가 공유.
const prefersReducedMotion = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };
/** 현재 프레임 투영 기준 마우스 화면 X → 플레이어 근거리 월드 X. blend=0이면 기존 전술 역변환과 완전 동일.
 *  Opus5 §9.3: hero 하이브리드에선 월드가 RC2 투영이므로 입력도 "항상" 기존 RC2 역변환 — 3D는 표시 전용. */
function currentScreenToWorldX(sx) {
  return chaseProjection ? screenToWorldXAtPlayer(sx, chaseProjection) : screenToWorldX(sx, camera);
}
/** update()에서 input.tick 직전 호출: 최신 함대·줌·blend로 투영을 만든다(§3 anchor 동기화와 같은 프레임). */
function rebuildChaseProjection() {
  if (state !== 'play' || !run || !run.squad) { chaseProjection = null; return; }
  chaseProjection = createChaseProjection({
    zoom: camera.current, chaseBlend: chase.current,
    squadX: run.squad.x, squadY: run.squad.y, logicalW: LOGICAL_W, logicalH,
  });
}
// 입력: 마우스/터치 화면 X를 카메라로 역변환해 월드 목표 X를 얻는다(§6). input이 카메라 모듈을 직접 import하지 않도록 콜백 주입.
const input = createInput(canvas, LOGICAL_W, { screenToWorldX: (sx) => currentScreenToWorldX(sx) });

// ── 실제 3D 함미 추적(Phase 0) 부트스트랩 — ?chase3d=1 전용, 폴백 안전(§3·§6) ──
const CHASE3D_ON = chase3dEnabled(location.search);
const CHASE3D_TEST = chase3dTestEnabled(location.search);
const CHASE3D_LAB = chase3dLabTarget(location.search);   // 'aurora' = 모델 검사실(Opus5 §8)
// 소품(탄·픽업) 3D 는 기본 OFF(이사 실기 "엉망" + Codex 가독성 판정) — 기존 2D 스트릭·스프라이트가 기본.
//  ?chase3d=1&chase3dProps=1 로만 켜서 가독성 A/B 비교에 사용한다. 크리처(B1/B2/B4)·기함 3D 는 영향 없음.
const CHASE3D_PROPS = chase3dPropsEnabled(location.search) || FLEETLAB;   // §G-2: 함대 프리뷰는 무기 3D 까지 켠 관찰 장면
if (CHASE3D_ON) {
  const stage = document.getElementById('stage');
  canvas3d = document.createElement('canvas'); canvas3d.id = 'game3d';
  hudCanvas = document.createElement('canvas'); hudCanvas.id = 'game-hud';
  // #game 위에 얹되 입력은 #game이 계속 처리(§6: pointer-events:none). 크기·위치는 sizeChase3DCanvases가 #game과 동일하게.
  canvas3d.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:2;opacity:0;visibility:hidden';
  hudCanvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:3';
  canvas.style.zIndex = '1';   // ⚠️ #stage 는 flex — flex 자식은 static 이어도 z-index 가 적용된다(불투명 캔버스가 메뉴를 가릴 수 있음)
  const _ovz = document.getElementById('overlay'); if (_ovz) _ovz.style.zIndex = '5';   // §6: DOM 메뉴·선택창은 항상 캔버스 계층 위
  if (stage) { canvas.after(canvas3d); canvas3d.after(hudCanvas); }
  hudCtx = hudCanvas.getContext('2d');
  sizeChase3DCanvases();
  if (['aurora', 'a0', 'b1', 'b2', 'b4', 'b5', 'b6', 'models', 'allies', 'pickups', 'swarm'].includes(CHASE3D_LAB)) {
    // ── 모델 검사실(Opus5 §8: aurora / B1 단독 / swarm=기함+B1 12) — 게임 렌더 대신 스튜디오. 기본 URL 미로드. ──
    canvas.style.visibility = 'hidden';
    const _ov = document.getElementById('overlay'); if (_ov) _ov.style.display = 'none';
    // 타이틀 state 진입이 overlay·title-screen 패널을 되살려 검사 대상을 덮는다 → 3D 캔버스 외 전부 고정 숨김(검사실 전용 경로)
    const _labSt = document.createElement('style');
    _labSt.textContent = '#stage>*:not(#game3d){display:none!important}';
    document.head.appendChild(_labSt);
    canvas3d.style.opacity = '1'; canvas3d.style.visibility = 'visible';
    import('./chase3d-lab.js').then((m) => {
      const lab = m.createAuroraLab(canvas3d, { target: CHASE3D_LAB });
      const fit = () => { sizeChase3DCanvases(); lab.setSize(canvas3d.width, canvas3d.height, Math.min(window.devicePixelRatio || 1, 1.5)); };
      fit(); window.addEventListener('resize', fit);
      buildAuroraLabUI(lab);
      window.__NF3D = window.__NF3D || {}; window.__NF3D.lab = lab;
      const loop = () => { lab.step(1); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      console.info('[chase3d-lab] AURORA 검사실 시작');
    }).catch((e) => console.warn('[chase3d-lab] 로드 실패:', e));
  } else {
    // 동적 import — 여기서만 Three.js가 로드된다(§3.2). 실패/미지원이면 chase3d=null 유지 → RC2 화면 그대로.
    //  Opus5 hero(기본): 3D 는 AURORA 기함만(§9.1). chase3dTest 레거시 장면만 구 전체-3D dev fallback.
    import('./chase3d-renderer.js').then((m) => {
      try {
        const c = m.createChase3D(canvas3d, { hero: !CHASE3D_TEST, propsEnabled: CHASE3D_PROPS });
        if (c && c.available) {
          chase3d = c;
          if (c.prewarmRun) c.prewarmRun(LOGICAL_W, logicalH, canvas.width, canvas.height).then((p) => console.info('[chase3d] 프리웜', p));   // §10.2 셰이더 사전 준비
          if (CHASE3D_TEST) buildChase3DOverlay();
          console.info('[chase3d] 실제 3D 사용 가능(hero=' + !CHASE3D_TEST + ')');
        } else { console.warn('[chase3d] 사용 불가 → RC2 유지:', c && c.reason); }
      } catch (e) { console.warn('[chase3d] 초기화 예외 → RC2 유지:', e); }
    }).catch((e) => console.warn('[chase3d] 모듈 로드 실패 → RC2 유지:', e));
  }
}

// 검사실 UI(§8): 시점·모드·LOD·조명·글로우·프리즈 + 통계. chase3dLab 에서만 생성.
function buildAuroraLabUI(lab) {
  const bar = document.createElement('div');
  bar.id = 'aurora-lab-controls';
  bar.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:60;display:flex;gap:5px;flex-wrap:wrap;max-width:96vw;pointer-events:auto';
  const stats = document.createElement('div');
  stats.id = 'aurora-lab-stats';
  stats.style.cssText = 'position:fixed;left:8px;top:8px;z-index:60;font:12px/1.5 monospace;color:#9ffdf0;background:rgba(4,8,16,0.85);border:1px solid #1c6;border-radius:6px;padding:8px 10px;white-space:pre;user-select:none';
  document.body.appendChild(stats);
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'font:11px monospace;padding:5px 8px;background:#0c2030;color:#3ff5e0;border:1px solid #2a8;border-radius:5px;cursor:pointer'; b.onclick = () => { fn(); refresh(); }; bar.appendChild(b); return b; };
  for (const v of Object.keys(lab.VIEWS)) mk(v, () => lab.set({ view: v }));
  mk('와이어', () => lab.set({ mode: lab.state.mode === 'wireframe' ? 'lit' : 'wireframe' }));
  for (const m of ['albedo', 'normal', 'orm', 'emissive']) mk(m, () => lab.set({ mode: lab.state.mode === m ? 'lit' : m }));
  mk('LOD', () => lab.set({ lod: (lab.state.lod + 1) % 3 }));
  mk('조명', () => lab.set({ light: !lab.state.light }));
  mk('글로우', () => lab.set({ glow: !lab.state.glow }));
  mk('⏸', () => lab.set({ freeze: !lab.state.freeze }));
  mk('회전', () => lab.set({ rotate: !lab.state.rotate }));
  document.body.appendChild(bar);
  function refresh() {
    const i = lab.info();
    stats.textContent = `AURORA lab  ${i.view}  [${i.mode}]  LOD${i.stats.lod}\n` +
      `tris ${i.triangles}  draws ${i.calls}  progs ${i.programs}\n` +
      `geo ${i.geometries}  tex ${i.textures}  texMB ${(i.stats.textureBytes / 1048576).toFixed(1)}\n` +
      `build ${i.buildMs}ms  freeze ${i.freeze ? 'ON' : 'off'}`;
  }
  lab._refreshUI = refresh; refresh();
  setInterval(refresh, 800);
}

// ── chase3dTest=1 결정적 검증 장면(§11) — 실캠페인 없이 모든 필수 대상을 한 화면에 고정 배치 ──
let _t3dZoom = 2.2, _t3dPaused = false, _t3dTime = 0, _t3dRun = null, _t3dLastFps = 0, _t3dFrameEwma = 16.7;
function buildChase3DTestRun() {   // 난수 없음 → 결정적. worldX/worldY 는 기존 좌표계 그대로. §5 수정 후: 실게임 필드 형태(isEnemy·_offsets·spriteId).
  const sx = LOGICAL_W / 2, sy = 660;
  const ents = [];
  for (let i = 0; i < 5; i++) ents.push({ constructor: { name: 'Creature' }, isEnemy: true, x: 96 + i * 68, y: 380 - (i % 2) * 44, r: 14, dead: false });
  for (let i = 0; i < 3; i++) ents.push({ constructor: { name: 'Sniper' }, isEnemy: true, spriteId: 'B4', x: 150 + i * 95, y: 250 - i * 16, r: 16, dead: false });
  ents.push({ constructor: { name: 'TriGate' }, y: 300, dead: false, laneRect: (i) => ({ x: i * (LOGICAL_W / 3), y: 290, w: LOGICAL_W / 3, h: 24 }) });
  ents.push({ constructor: { name: 'Crystal' }, x: sx, y: 470, r: 10, dead: false });
  return {
    // 드론은 §5.1 실공식(_offsets·width·t)이 만든다 — count 60 × width 93 이면 clearR(48) 밖 다수 표시.
    squad: { x: sx, y: sy, tier: 3, count: 60, cruisers: 2, vx: -70, bank: -0.3, dead: false, charging: true, chargeFrac: 0.6, t: 0.6, width: 93, _offsets: Squad.formationOffsets(60) },
    bosses: [{ spriteId: 'B8', x: sx, y: 120, hp: 640, maxHp: 1000, r: 64, dead: false }],
    world: {
      entities: ents,
      bullets: [{ x: sx - 24, y: 520, prevY: 600, r: 3, dead: false }, { x: sx + 24, y: 510, prevY: 590, r: 3, dead: false },
        { constructor: { name: 'ChargeLance' }, x: sx, y: 430, prevY: 640, r: 14, dead: false }],
      enemyBullets: [{ x: 320, y: 280, r: 6, dead: false }, { x: 150, y: 240, r: 6, dead: false }, { x: 360, y: 190, r: 6, dead: false }],
    },
  };
}
function buildChase3DOverlay() {
  _t3dRun = buildChase3DTestRun();
  canvas.style.visibility = 'hidden';   // 검증 장면은 3D만 본다(2D 게임 캔버스 숨김)
  const _ov = document.getElementById('overlay'); if (_ov) _ov.style.display = 'none';   // 타이틀·메뉴 DOM 도 숨김(3D 위 겹침 방지)
  canvas3d.style.opacity = '1'; canvas3d.style.visibility = 'visible';
  const ov = document.createElement('div'); ov.id = 'chase3d-overlay';
  ov.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;font:12px/1.5 monospace;color:#9ffdf0;background:rgba(4,8,16,0.82);border:1px solid #1c6;border-radius:6px;padding:8px 10px;pointer-events:auto;white-space:pre;user-select:none';
  document.body.appendChild(ov); chase3dOverlay = ov;
  const ctr = document.createElement('div'); ctr.id = 'chase3d-controls';
  ctr.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;display:flex;gap:6px;flex-wrap:wrap;pointer-events:auto';
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'font:12px monospace;padding:6px 9px;background:#0c2030;color:#3ff5e0;border:1px solid #2a8;border-radius:5px;cursor:pointer'; b.onclick = fn; ctr.appendChild(b); return b; };
  mk('100%', () => { _t3dZoom = 1.0; }); mk('180%', () => { _t3dZoom = 1.8; }); mk('220%', () => { _t3dZoom = 2.2; });
  mk('⏸/▶', () => { _t3dPaused = !_t3dPaused; }); mk('▶|', () => { _t3dPaused = true; _t3dTime += 0.016; });
  mk('A/B', () => { const on = canvas3d.style.opacity !== '0'; canvas3d.style.opacity = on ? '0' : String(transitionT(_t3dZoom)); });
  mk('ctx-loss', () => { chase3d && chase3d.forceContextLoss(); });
  document.body.appendChild(ctr);
  requestAnimationFrame(chase3dTestFrame);
}
function chase3dTestFrame(ts) {
  if (chase3d && _t3dRun) {
    if (!_t3dPaused) _t3dTime += 0.016;
    const t = chase3d.frame(_t3dRun, _t3dZoom, LOGICAL_W, logicalH, canvas.width, canvas.height, _t3dTime);
    if (canvas3d.style.opacity !== '0') { canvas3d.style.opacity = String(t); canvas3d.style.visibility = 'visible'; }
    if (chase3dOverlay) { const now = ts || 0; if (_t3dPrevTs) { const dt = now - _t3dPrevTs; _t3dFrameEwma = _t3dFrameEwma * 0.9 + dt * 0.1; _t3dLastFps = 1000 / Math.max(1, _t3dFrameEwma); } _t3dPrevTs = now; updateChase3DOverlay(); }
  }
  requestAnimationFrame(chase3dTestFrame);
}
let _t3dPrevTs = 0;
function updateChase3DOverlay() {
  if (!chase3dOverlay || !chase3d) return;
  const i = chase3d.info();
  chase3dOverlay.textContent =
    `⚠ LEGACY 장면 — 최신 hero(AURORA/B1/B2/B4) 아님. 최신 QA 는 ?chase3d=1 실게임으로.\n` +   // Codex P1: 잘못된 장면 기준 QA 방지
    `chase3d  ${i.available ? (i.degraded ? 'DEGRADED(RC2)' : 'ON') : 'OFF'}\n` +
    `zoom ${(_t3dZoom * 100).toFixed(0)}%   t ${i.t}\n` +
    `fps ~${_t3dLastFps.toFixed(0)}   frame ~${_t3dFrameEwma.toFixed(1)}ms\n` +
    `draws ${i.calls}   tris ${i.triangles}\n` +
    `models ${i.models}   drones ${i.instances}\n` +
    `geo ${i.geometries}  tex ${i.textures}` + (i.reason ? `\n${i.reason}` : '');
}

// 테스트/QA 훅 — 헤드리스에서 프레임을 수동 구동·측정(§9.5는 실측, rAF 정지 환경 대비).
if (CHASE3D_ON) window.__NF3D = {
  ctl: () => chase3d,
  info: () => chase3d && chase3d.info(),
  setZoom: (z) => { _t3dZoom = z; },
  run: () => _t3dRun || (_t3dRun = buildChase3DTestRun()),
  step: (n = 1, zoom) => { const z = zoom ?? _t3dZoom; const r = _t3dRun || (_t3dRun = buildChase3DTestRun()); for (let k = 0; k < n; k++) chase3d && chase3d.frame(r, z, LOGICAL_W, logicalH, canvas.width, canvas.height, _t3dTime += 0.016); return chase3d && chase3d.info(); },
  bench: (n = 120, zoom) => {   // 렌더 비용 마이크로벤치: frame n회 시간 측정(실 GPU 비용). 실 rAF FPS와 구분해 보고.
    const z = zoom ?? 2.2; const r = _t3dRun || (_t3dRun = buildChase3DTestRun()); const times = [];
    for (let k = 0; k < n; k++) { const a = performance.now(); chase3d.frame(r, z, LOGICAL_W, logicalH, canvas.width, canvas.height, _t3dTime += 0.016); times.push(performance.now() - a); }
    times.sort((a, b) => a - b); const mean = times.reduce((s, x) => s + x, 0) / n;
    return { n, meanMs: +mean.toFixed(3), p50Ms: +times[Math.floor(n * 0.5)].toFixed(3), p95Ms: +times[Math.floor(n * 0.95)].toFixed(3), maxMs: +times[n - 1].toFixed(3), info: chase3d.info() };
  },
  forceLoss: () => chase3d && chase3d.forceContextLoss(),
  capture: (name) => { canvas3d && fetch('http://localhost:9099/save?name=' + encodeURIComponent(name), { method: 'POST', body: canvas3d.toDataURL('image/jpeg', 0.85) }); },
};

// ── 전투 카메라 줌 컨트롤(휠·키보드·일시정지 버튼 공용) ──────────
let _zoomSaveTimer = null;
function persistZoom() {   // 연속 입력마다 저장하지 않고 300ms debounce 후 '목표값'만 저장(§7). 진행도·코인·해금·사운드는 불변.
  if (_zoomSaveTimer) clearTimeout(_zoomSaveTimer);
  _zoomSaveTimer = setTimeout(() => { save.set({ view: { ...(save.get().view || {}), zoom: safeZoom(camera.target) } }); }, 300);
}
let _zoomIndEl = null, _zoomIndTimer = null;
function showZoomIndicator() {   // 하단 안전영역에 'Zoom N% / 확대 N%'를 700~900ms(§3.4). pointer-events:none·레이아웃 불변, 빠른 휠에도 마지막 값만.
  const stage = document.getElementById('stage');
  if (!stage) return;
  if (!_zoomIndEl) { _zoomIndEl = document.createElement('div'); _zoomIndEl.id = 'zoom-indicator'; _zoomIndEl.setAttribute('aria-live', 'polite'); stage.appendChild(_zoomIndEl); }
  const pct = Math.round(camera.target * 100);
  _zoomIndEl.textContent = EN ? `Zoom ${pct}%` : `확대 ${pct}%`;
  _zoomIndEl.style.opacity = '1';
  if (_zoomIndTimer) clearTimeout(_zoomIndTimer);
  _zoomIndTimer = setTimeout(() => { if (_zoomIndEl) _zoomIndEl.style.opacity = '0'; }, 800);
}
let _pursuitEl = null, _pursuitTimer = null;
/** 함미 추적 시점에 처음 완전히 진입할 때 700~900ms 안내(§3.3). pointer-events:none·레이아웃 불변. */
function showPursuitIndicator() {
  const stage = document.getElementById('stage');
  if (!stage) return;
  if (!_pursuitEl) { _pursuitEl = document.createElement('div'); _pursuitEl.id = 'pursuit-indicator'; _pursuitEl.setAttribute('aria-live', 'polite'); stage.appendChild(_pursuitEl); }
  _pursuitEl.textContent = EN ? 'Pursuit View' : '함미 추적 시점';
  _pursuitEl.style.opacity = '1';
  if (_pursuitTimer) clearTimeout(_pursuitTimer);
  _pursuitTimer = setTimeout(() => { if (_pursuitEl) _pursuitEl.style.opacity = '0'; }, 850);
}
let updatePauseCameraUI = () => {};   // showPause가 열려 있으면 퍼센트를 갱신하는 함수로 대체(P0-4)
/** 카메라 목표 배율 변경. dir: +1 확대 / -1 축소 / 0 초기화(100%). 휠·키보드·일시정지 버튼이 공용으로 호출. */
function applyZoom(dir) {
  camera.target = dir === 0 ? DEFAULT_ZOOM : stepZoom(camera.target, dir);
  showZoomIndicator();
  persistZoom();
  updatePauseCameraUI();
}
/** 전술 시점(100%) ↔ 완전 함미 추적 시점(220%) 토글. C키·일시정지 버튼·모바일 버튼 공용(§8.2). */
function toggleChaseView() {
  camera.target = camera.target >= CHASE_FULL_ZOOM ? DEFAULT_ZOOM : MAX_ZOOM;
  showZoomIndicator();
  persistZoom();
  updatePauseCameraUI();
}
/** 현재 목표가 추적 시점(≥200%)인가 — 버튼 문구 전환용. */
function isChaseTargetView() { return camera.target >= CHASE_FULL_ZOOM; }
/** 휠/키보드로 줌을 바꿀 수 있는 상태인가(§3.2): 실제 전투 + 일시정지·드래프트·요약 오버레이가 아님. */
function canWheelZoom() { return state === 'play' && !paused && !drafting && !betweenStages; }

/** 현재 프레임의 함대 좌표를 카메라 기준점에 반영(RC1 §3). 입력 역변환(input.tick)과 렌더(draw)가
 *  같은 최신 anchor를 쓰게 해 고배율·빠른 이동·전투 첫 프레임에서 1프레임 어긋남을 없앤다.
 *  전투가 아니거나 run/squad가 없으면 아무것도 하지 않는다(예외 방지). 이 값은 렌더/좌표 변환 전용이며 게임 규칙 계산에 쓰이지 않는다. */
function syncCameraAnchor() {
  if (state !== 'play' || !run || !run.squad) return;
  camera.anchorX = run.squad.x;
  camera.anchorY = run.squad.y;
}

// 마우스 휠(§3.2 + RC1 보정): 결정은 순수 resolveWheelZoom에 위임한다.
//  - Ctrl/Cmd 휠(브라우저 확대)·전투 밖·수평 우세 입력은 손대지 않음(preventDefault 안 함).
//  - 정밀 터치패드의 작은 delta는 픽셀 임계(≈60px)까지 누적해 한 단계씩만. 전통 휠 한 칸(≈100px)은 한 단계.
const wheelAccumulator = createWheelStepAccumulator({ viewportHeight: () => (typeof window !== 'undefined' && window.innerHeight) || 800 });
const _wheelNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : 0);
canvas.addEventListener('wheel', (e) => {
  const { step, preventDefault } = resolveWheelZoom(e, {
    canZoom: canWheelZoom(),
    accumulator: wheelAccumulator,
    now: _wheelNow(),
    viewportHeight: (typeof window !== 'undefined' && window.innerHeight) || 800,
  });
  if (preventDefault) e.preventDefault();   // 유효 수직 입력이면 임계 미도달이라도 페이지 스크롤 차단
  if (step !== 0) applyZoom(step);          // 위로=확대(+1) / 아래로=축소(-1)
}, { passive: false });

// 키보드(§3.3): -=축소 / +,= =확대 / 0=초기화. 입력창 포커스·Ctrl/Cmd·전투 아님·키반복이면 무시(과도한 연속 변경 방지).
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const el = document.activeElement, tag = (el && el.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
  if (!canWheelZoom()) return;
  if (e.key === '-' || e.key === '_') { applyZoom(-1); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') { applyZoom(+1); e.preventDefault(); }
  else if (e.key === '0') { applyZoom(0); e.preventDefault(); }
  else if (e.key === 'c' || e.key === 'C') { toggleChaseView(); e.preventDefault(); }   // §8.2: 100% ↔ 220% 함미 추적 토글
});

// ── Stage 1 분석 스택 ─────────────────────────────────────────
// 개발/측정 진입(coreLoopTest·campaign25·bosslab 등)이면 GA4 전송 0(어댑터 dev 게이트). analyticsDebug면 로컬 디버그.
const ANALYTICS_DEV = isDevUrl(location.search);
const ANALYTICS_DEBUG = isDebugUrl(location.search);
let _analyticsSession = null;
try { _analyticsSession = window.sessionStorage; } catch { _analyticsSession = null; }
const analyticsConsent = createConsent();
const ga4Adapter = createGa4Adapter({
  config: ANALYTICS_CONFIG, consent: analyticsConsent, win: window, doc: document,
  // 포털 배포는 GA4를 dev처럼 완전 억제한다 — 측정 ID가 미래에 채워져도 포털에선 전송 0(§P0-1).
  isDevMode: () => ANALYTICS_DEV || !analyticsAllowedForDistribution(DIST), isDebug: () => ANALYTICS_DEBUG,
});
const analyticsCore = createAnalytics({ schema: SCHEMA, sink: ga4Sink(ga4Adapter), debug: ANALYTICS_DEBUG });
installDebugGlobal(analyticsCore, { enabled: ANALYTICS_DEBUG, globalObj: window });   // ?analyticsDebug=1일 때만 window.__NFAnalytics
const track = createGameAnalytics({
  analytics: analyticsCore, save, sessionStorage: _analyticsSession, viewport: () => viewportGroup(window),
});
/** 공개 사용자 런에서만 계측(개발/측정 하네스·devDirect 제외). GA4 어댑터도 dev를 막지만 파사드 단계에서 한 번 더 거른다. */
function isPublicRun() { return !!run && !run.devDirect && !run.coreLoop && !run.campaign25; }

// 동의 흐름(작업지시서 §9). 설정에 유효 측정 ID가 있을 때만 UI를 띄운다. 없으면 로컬 디버그만.
let updateAnalyticsSettingsUI = () => {};
function analyticsAllow() {
  const already = analyticsConsent.get() === 'granted';
  analyticsConsent.set('granted');
  ga4Adapter.grant();                  // 이전 거부(revoke) 상태를 해제 — 같은 페이지에서 재허용 시 전송 재개
  ui.hideConsentBanner(); ui.hideConsentDetails();
  updateAnalyticsSettingsUI();
  if (!already && !ANALYTICS_DEV) track.consentUpdated();   // 허용이 저장되고 GA4가 활성화된 뒤 1회
}
function analyticsDeny() {
  analyticsConsent.set('denied');
  ga4Adapter.revoke();                 // 이미 로드됐다면 analytics_storage denied 업데이트 + 미래 전송 중단
  ui.hideConsentBanner(); ui.hideConsentDetails();
  updateAnalyticsSettingsUI();
}
function analyticsDetails() {
  ui.showConsentDetails({ onAllow: analyticsAllow, onDeny: analyticsDeny, onClose: () => ui.hideConsentDetails() });
}
function maybeShowConsentBanner() {
  if (!analyticsAllowedForDistribution(DIST)) return;   // 포털: 게임 내 GA4·동의 UI 없음(자체 대시보드 사용, §P0-1)
  if (!shouldOfferConsent(ANALYTICS_CONFIG)) return;   // 측정 ID 없음 → 동의 UI 미표시
  if (analyticsConsent.isDecided()) return;            // 이미 선택함
  ui.showConsentBanner({ onAllow: analyticsAllow, onDeny: analyticsDeny, onDetails: analyticsDetails });
}
function hideConsentUI() { ui.hideConsentBanner(); ui.hideConsentDetails(); }

// ── Prolific 첫인상 테스트 흐름(작업지시서 §4·§5) ──────────────
// 전용 런타임 상태. 전투 시작 후 240초 타이머 + 첫 사망 시 설문. 분석 실패가 게임·완료를 막지 않는다.
let playtest = null;   // { timer, done }
const playtestSubmission = createPlaytestSubmission({
  track,
  completionUrl: PLAYTEST_CONFIG.completionUrl,
  transmitWindowMs: PLAYTEST_CONFIG.transmitWindowMs,
  redirect: (url) => { try { location.assign(url); } catch { /* 이동 실패해도 완료 안내는 유지 */ } },
  showManualComplete: () => ui.showPlaytestComplete(),
});

/** 전용 영어 시작(동의) 화면. 동의 여부를 여기서 결정한다(§4.1). */
function startPlaytestFlow() {
  resetToTitleState();
  document.documentElement.lang = 'en';
  document.title = 'NEON FLEET — 4-Minute Playtest';
  ui.showPlaytestIntro({ onAgree: playtestAgree, onDecline: playtestDecline });
}
function playtestAgree() {
  const already = analyticsConsent.get() === 'granted';
  analyticsConsent.set('granted');
  ga4Adapter.grant();
  if (!already) track.consentUpdated();          // GA4 활성·동의 뒤 1회(측정 ID 없으면 어댑터가 no-op)
  track.expeditionStartSelected('campaign');     // 퍼널 일관성(캠페인 시작 의도)
  track.playtestStarted(PLAYTEST_COHORT);        // 전용 흐름 시작(provider=prolific·cohort)
  playtest = { timer: createPlaytestTimer(PLAYTEST_TIME_LIMIT_SEC), done: false };
  newExpedition('campaign', { pickWeapon: true });   // 일반 게임 영어 핵심 경로(스토리 인트로 없이 영어 가이드→무기→전투)
}
function playtestDecline() {
  analyticsConsent.set('denied');
  ga4Adapter.revoke();                            // 전송 중단(거부해도 일반 게임·저장은 손상시키지 않음)
  const st = playtestConfigStatus();
  if (st.hasNoConsentUrl) { try { location.assign(st.noConsentUrl); } catch { /* 이동 실패 시 안내로 폴백 */ ui.showPlaytestComplete({ message: 'You chose not to share anonymous data. You can close this tab.' }); } }
  else ui.showPlaytestComplete({ message: 'You chose not to share anonymous data. You can close this tab. No data was collected.' });
}
/** Prolific 전투시간 누적(§4.2): 실제 전투(state='play') 중에만 dt를 타이머에 넣고, 상한(240초) 최초 도달 시 1회 설문. 타이머 오류가 프레임 루프를 멈추지 않게 방어한다. */
function playtestTick(dt) {
  if (!PLAYTEST || !playtest || playtest.done) return;
  if (state !== 'play' || paused || drafting || betweenStages) return;
  try { if (playtest.timer.tick(dt)) triggerPlaytestSurvey('time_limit'); } catch { /* 삼킴: 게임·완료를 막지 않는다 */ }
}

/** 4분 종료(시간 제한 또는 첫 사망) → 게임 안전 정지 + 영어 설문(§4.2·§5). 원정당 1회. */
function triggerPlaytestSurvey(endReason) {
  if (!playtest || playtest.done) return;
  playtest.done = true;
  playtest.timer.markReached();
  track.playtestLimitReached(endReason, playtest.timer.elapsed());
  state = 'done'; drafting = false; betweenStages = false; paused = false;
  if (input) { input.active = false; input.charging = false; }
  setBgmIntensity(0.2); playBgm('title');
  ui.showPlaytestSurvey({ onSubmit: (answers) => playtestSubmission.submit(answers) });
}

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
  const soundText = EN
    ? { music: '🎵 Music', sfx: '🔊 Sound effects', mute: '🔇 Mute', unmute: '🔊 Unmute' }
    : { music: '🎵 배경음악', sfx: '🔊 효과음', mute: '🔇 음소거', unmute: '🔊 음소거 해제' };
  wrap.innerHTML = `
    <button id="snd-gear" title="${EN ? 'Sound settings' : '사운드 설정'}" aria-label="${EN ? 'Sound settings' : '사운드 설정'}">${snd.mute ? '🔇' : '🔊'}</button>
    <div id="snd-panel" class="hidden">
      <label>${soundText.music} <input id="snd-bgm" type="range" min="0" max="100" value="${Math.round(snd.bgm * 100)}"></label>
      <label>${soundText.sfx} <input id="snd-sfx" type="range" min="0" max="100" value="${Math.round(snd.sfx * 100)}"></label>
      <button id="snd-mute" aria-label="${snd.mute ? (EN ? 'Unmute' : '음소거 해제') : (EN ? 'Mute' : '음소거')}">${snd.mute ? soundText.unmute : soundText.mute}</button>
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
    muteToggle.textContent = muted ? soundText.unmute : soundText.mute;
    muteToggle.setAttribute('aria-label', EN ? (muted ? 'Unmute' : 'Mute') : (muted ? '음소거 해제' : '음소거'));
  });
  // 패널 밖 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) panel.classList.add('hidden');
  });
})();

// 분석 설정(작업지시서 §9.3): 사운드 패널에 동의 상태 표시 + 허용/거부·철회/수집 항목 보기.
//  측정 ID가 없으면(shouldOfferConsent=false) 아예 추가하지 않는다.
if (shouldOfferConsent(ANALYTICS_CONFIG)) {
  const sndPanel = document.getElementById('snd-panel');
  if (sndPanel) {
    const sec = document.createElement('div');
    sec.id = 'analytics-settings';
    sec.innerHTML = `
      <hr>
      <div class="an-state">익명 데이터: <b id="an-state-val">—</b></div>
      <div class="an-btns">
        <button id="an-allow">허용</button>
        <button id="an-deny">거부·철회</button>
      </div>
      <button id="an-details" class="an-link">수집 항목 보기</button>`;
    sndPanel.appendChild(sec);
    const val = sec.querySelector('#an-state-val');
    updateAnalyticsSettingsUI = () => {
      const s = analyticsConsent.get();
      val.textContent = s === 'granted' ? '허용됨' : s === 'denied' ? '거부됨' : '미선택';
    };
    sec.querySelector('#an-allow').addEventListener('click', (e) => { e.stopPropagation(); analyticsAllow(); });
    sec.querySelector('#an-deny').addEventListener('click', (e) => { e.stopPropagation(); analyticsDeny(); });
    sec.querySelector('#an-details').addEventListener('click', (e) => { e.stopPropagation(); analyticsDetails(); });
    updateAnalyticsSettingsUI();
  }
}

// ───────────────────────── 판(run) 상태
let state = 'title'; // title | play | done(오버레이 표시 중)
let run = null;
let drafting = false; // 모듈 드래프트 표시 중(게임 일시 정지)
let betweenStages = false; // 스테이지 클리어 요약 표시 중(게임 일시 정지)

// 원정(run) = 1스테이지부터 죽을 때까지 연속. 기함·드론·모듈이 누적된다.
function newExpedition(mode = 'campaign', opts = {}) {
  const rng = mulberry32((Math.random() * 2 ** 31) | 0);
  const up = save.get().up;
  const H = BAL.hangar.upgrades;
  const stats = {
    startCount: BAL.squad.start + up.drones * H.drones.step,
    fireRate: BAL.squad.fireRate + up.rate * H.rate.step,
    damage: BAL.squad.damage + up.dmg * H.dmg.step,
    coinMult: 1 + up.coin * H.coin.step,
    pickupRange: BAL.coin.pickupBase + (up.magnet || 0) * H.magnet.step,   // 코인 수거 반경(격납고 magnet)
  };
  const squad = new Squad(LOGICAL_W, logicalH, stats.startCount);
  squad.cruiserBonus = (up.cruiser || 0) * H.cruiser.step;   // 격납고: 순양함 1척 화력 +
  squad.hullBonus = (up.hull || 0) * H.hull.step;            // 격납고: 기함 내구도 + (installGate1에서 surv에 반영)
  const effects = createEffects();
  const world = {
    bal: BAL, input, squad, effects,
    en: EN,   // 캔버스 라벨/토스트 언어(포털·Prolific=영어). entities.js 등 world를 받는 렌더가 이 값으로 분기(§P0-2).
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
    // 코인 드롭: 큰 값은 unit 단위로 쪼개 여러 코인으로 흩뿌린다(수거 손맛). 일반 적(값<unit)은 1개.
    spawnCoin(x, y, value) {
      const v = Math.max(1, Math.round(value));
      const n = Math.max(1, Math.round(v / BAL.coin.unit));
      const each = v / n;
      for (let i = 0; i < n; i++) this.entities.push(new Coin(x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 14, each));
    },
    spawnEntity(e) { this.entities.push(e); },
    spawnEnemyBullet(b) { if (this.enemyBullets.length < this.stageMods.shotCap) this.enemyBullets.push(b); },
    notifyEnemyKilled(e) { onEnemyKilled(e, this); },   // 랜스·메아리·시즈 등 entities.js 킬 경로가 호출하는 중앙 알림
    onPowCollect() { sectorWeaponUpgrade(); },          // 섹터 POW 수집 → 무기 강화 카드(S4)
    // 기함 등급 상승 → 함체 내구도 등급업 + 완전 재충전. 25분은 스케줄(campaignHullTier)이 담당하고,
    // 섹터는 순양함 흡수로 유기적으로 오르므로 여기서 받는다(이사: 25분 체력 시스템을 섹터에도).
    onFlagshipTierUp(sq) {
      if (!sq.surv) return;
      survTierUp(sq.surv, BAL.gate1.survivability);
      sq.surv.hull = sq.surv.hullMax;
      if (isPublicRun()) track.milestone({ milestoneType: 'flagship_tier', milestoneValue: sq.tier, sector: run.sector });   // 분석: 첫 기함 승급 1회
    },
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
    // 개발/측정 부트스트랩(coreLoopTest·campaign25·bosslab)은 맵을 만든 뒤 자기가 곧바로 enterNode를 부른다.
    // enterSectorMap의 자동 루트 진입(P0-B)이 겹치면 첫 노드가 두 번 초기화되어 청크 RNG·mfx·측정이 오염된다
    // → devDirect면 enterSectorMap이 항로/자동진입을 건너뛴다(Codex P3).
    devDirect: !!opts.devDirect,
  };
  // 엔드리스는 캠페인 이후 섹터(7)부터 시작 → 보스 순환·변주·다중 보스가 자연히 강해진다.
  // 분석: 필수 시작 선택을 마치고 첫 섹터로 넘어가기 직전 expedition_started 1회(공개 런만). run 할당 직후엔 보내지 않는다.
  const begin = () => {
    if (isPublicRun()) track.expeditionStarted(mode);
    startSector(mode === 'endless' ? BAL.campaign.sectors + 1 : 1);
  };
  if (opts.pickWeapon) {
    // 섹터 무기 조합 이식(S2~): 공명 + **기함 내구도**(25분과 동일 모델, 이사 요청) 동시 설치.
    // installGate1이 wing 슬롯도 비워 초기화하므로, 시작 무기 선택 전에 한 번만 부른다.
    squad.installGate1({ surv: createSurvivability(BAL.gate1.survivability), reson: createResonanceState(), mainWeapon: squad.weapon });
    world.reson = squad.reson;
    if (opts.weapon) {
      // P0-4: 같은 무기 즉시 재출격 — 선택창(첫 화면) 재노출 없이 주무기 지정 후 시작.
      squad.weapon = opts.weapon; squad.weaponLv = 1; lastWeapon = opts.weapon;
      if (squad.reson) resonSetLoadout(squad.reson, [opts.weapon, null]);
      if (isPublicRun()) track.buildChoice({ choiceType: 'start_weapon', choiceId: opts.weapon, weaponId: opts.weapon, sector: 1 });
      begin();
    } else sectorStartWeaponPick(begin);
  } else begin();
}

// ── 섹터 분기 맵 ─────────────────────────────────────────────
/** 섹터 시작: 맵 생성 → 맵 화면 */
function startSector(sector) {
  const r = run;
  r.sector = sector;
  r.map = generateSectorMap(sector, r.rng, BAL.sector.depth);
  r.node = null; r.done = [];
  r.bgmRestart = true;   // 새 섹터 = 새 장 → 배경음악도 처음부터 다시(이사)
  // 최고 도달 섹터 기록 — 캠페인은 stage, 엔드리스는 endlessBest에만 (기록 완전 분리)
  const p = progressPatch(r.mode, sector, save.get());
  if (Object.keys(p).length) save.set(p);
  if (isPublicRun()) track.sectorStarted(sector, r.mode);   // 분석: 공개 런 섹터 시작 1회
  enterSectorMap();
}

/** 맵 화면(갈림길 선택). 게임 정지 상태(state='map'). */
function enterSectorMap() {
  const r = run;
  if (r.devDirect) return;   // 개발/측정 부트스트랩(bosslab·coreLoop·campaign25)은 맵만 만들고 곧바로 enterNode를 부른다 → 자동 루트 진입 생략(Codex P3)
  state = 'map';
  setBgmIntensity(0.2); playBgm('title', { restart: !!r.bgmRestart });
  r.bgmRestart = false;   // 섹터 전환 1회만 재시작(노드 사이 복귀는 이어서)
  const d = save.get();
  // P0-B: 섹터 1 첫 진입은 루트가 정확히 1개뿐이라 항로 화면이 '선택'이 아니라 '확인 클릭'일 뿐이다.
  //  → 항로 화면을 생략하고 루트로 자동 진입한다. 첫 노드 이후(done>0)·섹터 2+·루트가 여럿인 비정상 입력은 제외.
  const soloRoot = r.sector === 1 && r.done.length === 0 && !r.node
    && r.map.cols[0] && r.map.cols[0].length === 1;
  if (soloRoot) {
    const root = r.map.cols[0][0];
    // 분석: 루트가 하나뿐인 첫 항로는 확정 순간(자동)에 route_selected(auto_root) 1회. enterNode 호출은 그대로 둔다.
    trackRoute(root, 'auto_root');
    if (PORTAL_MODE) {
      // P0-3: 포털은 무기 카드 클릭(유일한 시작 클릭) 뒤 곧바로 전투로 — 전체화면 차단 가이드 없이
      //  전투 위에 비차단 조작 힌트만 띄우고(실제 입력 또는 8초 후 사라짐) 즉시 진입한다.
      enterNode(root);
      showPortalHint();
      return;
    }
    if (PLAYTEST) {
      // Prolific: 스토리 인트로 없이 영어 간이 가이드 → 같은 루트로 진입. 일반 게임 저장(firstGuideSeen)은 건드리지 않는다.
      const guideType = r.squad.reson ? 'combo' : 'standard';
      track.guideViewed(guideType);
      ui.showFirstGuide({ lang: 'en', combo: !!r.squad.reson, onStart: () => { track.guideCompleted(guideType); enterNode(root); } });
      return;
    }
    if (!d.firstGuideSeen) {
      // 최초 사용자: 조작 안내를 1회 보여주고, 안내의 '전투 시작'에서 같은 루트로 진입.
      const guideType = r.squad.reson ? 'combo' : 'standard';
      if (isPublicRun()) track.guideViewed(guideType);
      ui.showFirstGuide({ combo: !!r.squad.reson, onStart: () => { if (isPublicRun()) track.guideCompleted(guideType); save.set({ firstGuideSeen: true }); enterNode(root); } });
    } else {
      enterNode(root);   // 안내를 이미 본 사용자: 선택지 하나뿐인 첫 항로 클릭 없이 즉시 진입
    }
    return;
  }
  ui.showSectorMap({
    map: r.map, currentId: r.node ? r.node.id : null, doneIds: r.done,
    sector: r.sector, coins: r.world.coins,
    lang: LANG,   // Prolific: 항로 선택 화면도 영어(§4.3)
    // 입력 수단별 확정: showSectorMap이 pointer_confirm / touch_confirm / keyboard_confirm을 실제 입력에서 전달한다.
    onPick: (node, method) => { trackRoute(node, method || 'pointer_confirm'); enterNode(node); },
  });
}

/** 항로 확정 → route_selected(auto_root / pointer_confirm·touch_confirm·keyboard_confirm) 1회(공개 런만). enterNode 호출과 분리해 기존 배선을 보존. */
function trackRoute(node, selectionMethod) {
  if (node && isPublicRun()) {
    track.routeSelected({ sector: run.sector, nodeType: node.type, nodeCol: node.col, selectionMethod, nodeKey: node.id });
  }
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
  platform.gameplayStart();   // 플랫폼 수명주기(no-op — 향후 Full Launch SDK 광고 타이밍용, 이번 단계 미연결)
  if (isPublicRun()) track.combatStarted(r.sector);   // 분석: 해당 원정 첫 실제 전투 진입 1회(time_to_combat)
  if (PLAYTEST && playtest) playtest.timer.startCombat();   // Prolific: 전투 진입 시점부터 240초 타이머 시작(§4.2)
  // 섹터별 전투 BGM(없으면 battle1 폴백). r.bgmRestart는 보통 enterSectorMap이 소비하지만, 개발/측정 부트스트랩은
  // 그 화면을 건너뛰므로(devDirect) 여기서 소비한다 — 개발 런 재시작 시 전투곡이 처음부터 재생되도록(Codex P3 후속).
  setBgmIntensity(0.3); playBgmForSector(r.sector, { restart: !!r.bgmRestart }); r.bgmRestart = false; sfx('start');
  const label = (EN
    ? { combat: 'ENGAGEMENT', elite: 'ELITE ENCOUNTER', hazard: 'HAZARD ZONE', supply: 'SUPPLY RUN', boss: 'SECTOR BOSS' }
    : { combat: '교전', elite: '정예 교전', hazard: '위험 지대', supply: '보급', boss: '섹터 보스' })[node.type] || (EN ? 'ENGAGEMENT' : '교전');
  r.effects.text(LOGICAL_W / 2, logicalH * 0.4, label, node.type === 'boss' ? COLORS.danger : COLORS.reward);
  r.effects.flash(0.3);
}

/** 정비 노드(트랙 없음): [긴급 수리] vs [모듈 정비] 택1 (§5.5). 긴급 수리는 내구도 손상 시 수리/드론 재선택 → 맵 복귀 */
function enterRepair(node) {
  const r = run;
  state = 'map';
  const cost = BAL.nodeReward.repairModuleCostPerSector * r.sector;              // 25 × sector
  const heal = Math.max(BAL.nodeReward.repairHealMin, Math.round(r.squad.count * BAL.nodeReward.repairHealPct));  // max(12, count×0.35)
  const surv = r.squad.surv;
  const hullDamaged = () => surv && surv.hull < surv.hullMax;                    // 기함 내구도 손상 여부
  const doDrone = () => { r.squad.applyDelta(heal, r.world); sfx('pickup'); if (isPublicRun()) track.buildChoice({ choiceType: 'repair', choiceId: 'drone', sector: r.sector }); completeNode(node); };
  const doHull = () => { surv.hull = surv.hullMax; sfx('pickup'); if (isPublicRun()) track.buildChoice({ choiceType: 'repair', choiceId: 'hull', sector: r.sector }); completeNode(node); };   // 내구도 완전 수리
  const doModule = () => {
    if (r.world.coins < cost) return;   // 방어: 부족 시 무시(버튼도 비활성)
    r.world.addCoins(-cost);
    const opts = draftOptions(r.modules, r.rng, 3);
    if (opts.length) {
      drafting = true;
      ui.showDraft({
        options: opts, owned: moduleSummary(r.modules), lang: LANG,
        onPick(id) { r.modules.push(id); recomputeMfx(); drafting = false; sfx('buy'); if (isPublicRun()) track.buildChoice({ choiceType: 'module', choiceId: id, sector: r.sector }); completeNode(node); },
      });
    } else { completeNode(node); }
  };
  function openMenu() {
    ui.showRepair({
      cost, coins: r.world.coins, canAfford: r.world.coins >= cost, lang: LANG,
      onHeal() {
        // 긴급 수리: 내구도가 손상됐으면 [내구도 수리] vs [드론 보충] 재선택, 온전하면 바로 드론 보충
        if (hullDamaged()) ui.showEmergencyRepair({ hullPct: Math.round(hullFrac(surv) * 100), drones: heal, onHull: doHull, onDrone: doDrone, onBack: openMenu, lang: LANG });
        else doDrone();
      },
      onModule: doModule,
    });
  }
  openMenu();
}

/** 노드 인카운터 트랙 구성 (타입별 청크 필터·길이·보스 게이트). r.progression은 enterNode에서 설정됨. */
function buildEncounter(node) {
  const r = run, w = r.world;
  const { contentTier, difficultyLevel } = r.progression;   // 해금=contentTier, 난이도=difficultyLevel
  const mods = stageMods(difficultyLevel);
  r.mods = mods; w.stageMods = mods;
  r.isBossNode = node.type === 'boss';
  r.clearBackdrop = false;   // 새 노드 시작 = 컷신 배경 해제
  if (r.isBossNode) preloadSprites(['CUT_SECTOR_CLEAR']);   // 섹터 클리어 컷신 배경(보스 노드에서만 로드)
  r.cinemaT = 0;                                   // 컷신 시네마 띠 초기화(노드마다)
  r.tutorial = r.sector === 1 && node.col === 0;   // 첫 원정 첫 노드 = 조작 학습 구간(안전 청크·복제 제한)
  w.scrollSpeed = BAL.scrollSpeed;
  w.entities.length = 0; w.bullets.length = 0; w.enemyBullets.length = 0;
  r.boss = null; w.boss = null; r.bosses = []; w.bosses = [];
  r.phase = 'track'; w.phase = 'track';
  r.traveled = 0; r.clearShown = false;
  const perRun = (node.type === 'hazard' || node.type === 'supply' || node.type === 'boss') ? BAL.sector.shortLen : BAL.sector.combatLen;
  const baseTrack = BAL.chunk.heightPx * perRun;
  const padPx = (BAL.sector.extraSeconds || 0) * BAL.scrollSpeed;   // 각 노드 +N초(보스 노드는 보스 출현이 그만큼 늦춰짐)
  const totalTrack = baseTrack + padPx;
  const trackScale = totalTrack / baseTrack;                        // 청크 콘텐츠를 늘어난 트랙에 고르게 펼침(빈 구간 방지)
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
      pending.push({ ...it, trackY: (i * BAL.chunk.heightPx + it.y * BAL.chunk.heightPx) * trackScale });
    }
  }
  if (r.sector === 1 && node.col === 0 && !r.squad.reson) pending.push({ type: 'weaponGate', trackY: 380 }); // 무기 선택 게이트 — 섹터 무기 조합(reson)이면 제거(시작무기+POW로 충분, 이사: 무기선택 또 나옴)
  if (node.type === 'combat' || node.type === 'elite' || node.type === 'supply') {
    if (!r.squad.reson) pending.push({ type: 'bonusGate', trackY: totalTrack * BAL.bonusGate.progress }); // 이득 게이트(드론/LvUp/실드) — 섹터 무기 조합이면 제거(이득은 POW로, 이사: 막대바 삭제)
    for (let i = 0; i < BAL.pod.perRun; i++) {
      const prog = (i + 0.6) / BAL.pod.perRun;
      const size = prog < bounds[0] ? 'small' : prog < bounds[1] ? 'mid' : 'large';
      pending.push({ type: 'dronePod', trackY: totalTrack * Math.min(0.96, prog), x: 0.18 + 0.64 * rng(), size });
    }
  }
  // 정예 노드 = 미니보스(기존). 추가로, 섹터 무기 조합에서 보조 무기가 아직 없으면 전투/보급 노드에도 미니보스를 확정 배치한다.
  // 미니보스 POW가 보조 무기(=공명 조합)의 입구인데 정예 변이몹은 섹터 1에서 등장 확률 0%라 조합이 영영 안 나왔다(이사 지적).
  // 보조 무기가 없으면 미니보스를 확정 배치하되, 앞 두 노드는 비워 화력을 불릴 시간을 준다(이사).
  // hazard도 포함 — 경로가 전부 hazard/repair라 미니보스를 한 번도 못 만나는 상황 방지.
  const needWing = !!r.squad.reson && !r.squad.wing?.weaponId && node.col >= BAL.midboss.wingUnlockMinCol;
  if (node.type === 'elite' || (needWing && (node.type === 'combat' || node.type === 'supply' || node.type === 'hazard'))) {
    pending.push({ type: 'midboss', trackY: totalTrack * BAL.midboss.progress });
  }
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

/** 섹터 원정 보조 무기 선택(전투 노드 클리어 시 1회) → 주+보조 조합 공명 활성. pickCard 공용. */
function sectorWingPick(done) {
  const r = run, sq = r.squad;
  const opts = ['vulcan', 'laser', 'homing'].filter((w) => w !== sq.weapon).map((w) => ({
    id: w,
    label: EN ? WEAPON_LABELS_EN[w] : WEAPON_LABELS[w],
    desc: EN
      ? `Resonance: ${PLAYTEST_RESONANCE_EN[buildForPair(sq.weapon, w).resonance] || ''}`
      : `공명: ${RESONANCES[buildForPair(sq.weapon, w).resonance]?.name || ''}`,
    color: WEAPON_COLORS[w], icon: WEAPON_ICON[w],
  }));
  pickCard({
    title: EN ? 'Choose a wing weapon' : '보조 무기 선택',
    subtitle: EN ? 'Pair it with your main weapon to unlock a resonance.' : '주무기와 짝지어 공명이 결정됩니다.',
    autoId: opts[0].id, options: opts,
    onPick: (id) => {
      sq.wing.weaponId = id; sq.wing.level = 1; sq._wingAcc = 0;
      resonSetLoadout(sq.reson, [sq.weapon, id]);   // 조합 → 공명 활성(update가 tick/발동)
      r.effects.text(sq.x, sq.y - 60, tx(`Wing: ${WEAPON_LABELS_EN[id]} · Resonance ${PLAYTEST_RESONANCE_EN[sq.reson.activeId] || ''}`, `보조 무기: ${WEAPON_LABELS[id]} · 공명 ${RESONANCES[sq.reson.activeId]?.name || ''}`), WEAPON_COLORS[id], 15);
      if (isPublicRun()) { track.milestone({ milestoneType: 'second_weapon', sector: r.sector }); track.milestone({ milestoneType: 'first_resonance', sector: r.sector }); }
      done && done();
    },
  });
}

/** 섹터 정예몹 처치 보상 = POW 수집 → 무기 강화 카드. 보조 무기 미장착이면 '보조 무기 장착'(공명) 옵션도 포함(이사: 5초 선택창 대신 정예 보상으로 통합). */
function sectorWeaponUpgrade() {
  const r = run, sq = r.squad;
  let steps = coreLoopWeaponSteps(sq);
  if (!sq.wing.weaponId) {   // 보조 무기 없음 → 이번 POW에 보조 무기 장착 선택지(주무기와 조합→공명) 우선 노출
    const wingOpts = ['vulcan', 'laser', 'homing'].filter((w) => w !== sq.weapon).map((w) => ({
      id: `wing-${w}`,
      label: EN ? `Wing: ${WEAPON_LABELS_EN[w]}` : `보조: ${WEAPON_LABELS[w]}`,
      desc: EN
        ? `Resonance: ${PLAYTEST_RESONANCE_EN[buildForPair(sq.weapon, w).resonance] || ''}`
        : `공명 ${RESONANCES[buildForPair(sq.weapon, w).resonance]?.name || ''}`,
      color: WEAPON_COLORS[w], icon: WEAPON_ICON[w],
      apply: () => { sq.wing.weaponId = w; sq.wing.level = 1; sq._wingAcc = 0; resonSetLoadout(sq.reson, [sq.weapon, w]); r.effects.text(sq.x, sq.y - 60, tx(`Wing: ${WEAPON_LABELS_EN[w]} · Resonance ${PLAYTEST_RESONANCE_EN[sq.reson.activeId] || ''}`, `보조 무기: ${WEAPON_LABELS[w]} · 공명 ${RESONANCES[sq.reson.activeId]?.name || ''}`), WEAPON_COLORS[w], 15); if (isPublicRun()) { track.milestone({ milestoneType: 'second_weapon', sector: r.sector }); track.milestone({ milestoneType: 'first_resonance', sector: r.sector }); } },
    }));
    steps = [...wingOpts, ...steps];
  }
  if (!steps.length) { sq.banked = (sq.banked || 0) + 55; r.effects.text(sq.x, sq.y - 60, tx('Firepower +', '화력 강화 +'), COLORS.reward, 15); return; }
  const opts = steps.slice(0, 3).map((s) => {
    const shown = playtestWeaponStepLabel(s, sq);
    return { id: s.id, label: shown.label, desc: shown.desc, color: s.color || '#ffd93d', icon: s.icon || '🔧' };
  });
  pickCard({ title: EN ? 'Choose a weapon upgrade' : '무기 강화 선택', subtitle: EN ? 'Elite defeat reward' : '정예 격파 보상', autoId: steps[0].id, options: opts,
    onPick: (id) => { const s = steps.find((x) => x.id === id); if (s) s.apply(); } });
}

/** 인카운터 클리어(트랙/보스 종료) → 코인 + 노드 완료. 보조 무기는 정예 POW 강화에 통합(이사: 출격 직후 5초 선택창 삭제). */
function onEncounterClear() {
  const r = run, node = r.node;
  r.world.addCoins(nodeCoinReward(r.sector, node.col, node.type, BAL.nodeReward.coinMult));   // 노드 클리어 코인(§5.2)
  completeNode(node);
}

/** 노드 완료 → 맵 복귀, 보스 노드면 다음 섹터 */
function completeNode(node) {
  const r = run;
  if (node && !r.done.includes(node.id)) {
    r.done.push(node.id);
    if (isPublicRun()) track.nodeCompleted({ sector: r.sector, nodeType: node.type, nodeKey: node.id });   // 분석: 노드 정산 뒤 1회
  }
  const proceed = () => {
    if (node && node.type === 'boss') {
      // 캠페인 최종 보스(섹터 6 하이브 퀸) 격파 → 승리 화면(자동 섹터 7 진행 안 함, §6.2/6.3)
      if (r.mode !== 'endless' && r.sector >= BAL.campaign.sectors) { winCampaign(); return; }
      r.effects.text(LOGICAL_W / 2, logicalH * 0.4, tx(`SECTOR ${r.sector} CLEAR!`, `섹터 ${r.sector} 클리어!`), COLORS.reward);
      const nextSector = () => startSector(r.sector + 1);
      // 첫 섹터 보스 격파 후 다음 섹터 맵 전에 키스톤 3택 (원정당 1개)
      if (r.sector === 1 && !r.squad.keystone) openKeystone(nextSector);
      else nextSector();
    } else if (r.devDirect) {
      // 개발 직행(fleetlab·bosslab): 항로 맵 화면이 없다(enterSectorMap 은 devDirect 조기 반환, FR-16).
      //  그대로 두면 flythrough 가 매 프레임 완료 처리를 재시도하는 무한 정지(이사 "못 넘어감") — 다음 열 노드로 계속 전투.
      const nextCol = node ? Math.min(node.col + 1, r.map.cols.length - 1) : 0;
      enterNode(r.map.cols[nextCol][0]);
    } else {
      enterSectorMap();
    }
  };
  // 노드 타입별 모듈 지급 계약 (§5.3, logic.nodeModuleGrant): combat·hazard=일반 3택,
  // elite=4택(희귀 보장), supply=없음, repair=자체 UI, boss=다음 섹터/키스톤.
  // S5: 섹터 무기 조합(reson 설치)이면 진화 모듈 드래프트 대신 무기 강화(정예 POW)로 성장 — 모듈 스킵.
  const grant = node && !r.squad.reson && nodeModuleGrant(node.type, BAL.nodeReward.eliteDraftCount);
  if (grant) {
    const opts = draftOptions(r.modules, r.rng, grant.count, !!grant.rare);
    if (opts.length) {
      drafting = true; state = 'map';
      ui.showDraft({
        options: opts, owned: moduleSummary(r.modules), lang: LANG,
        onPick(id) { r.modules.push(id); recomputeMfx(); drafting = false; sfx('buy'); if (isPublicRun()) track.buildChoice({ choiceType: 'module', choiceId: id, sector: r.sector }); proceed(); },
      });
      return;
    }
  }
  proceed();
}

// (구 advanceStage 제거 — 섹터 맵의 onEncounterClear/completeNode가 진행을 담당)

function startPlay(sameWeapon) {
  drafting = false;
  betweenStages = false;
  hideConsentUI();
  sfx('start');
  if (BOSSLAB) { startBossLab(_clParams.get('boss') || 'B14'); return; }   // ?bosslab=1&boss=B14: 보스 패턴 프리뷰
  if (FLEETLAB) { startFleetLab(); return; }   // ?fleetlab=1: 함대 프리뷰(§G-1)
  if (CAMPAIGN25) { const play = _clParams.has('play'); startCampaign25({ mode: play ? 'play' : 'measure', buildId: 'railStorm', pick: play }); return; }  // ?campaign25=1 자동시연 / &play=1 사람 조작(무기 완전 선택제)
  if (CORE_MEASURE) { startCoreLoop({ mode: 'measure', buildId: 'railStorm' }); return; }  // ?coreLoopMeasure=1: 자동 측정
  if (CORE_LOOP) { startCoreLoop({ mode: 'play' }); return; }   // ?coreLoopTest=1: 사람 플레이 8분 슬라이스
  newExpedition('campaign', { pickWeapon: true, weapon: sameWeapon });   // 섹터 원정: 시작 무기 선택(또는 P0-4 같은 무기 재도전) → 섹터 맵 → 전투.
}

/** 보스 패턴 프리뷰(개발/테스트): 지정 보스를 즉시 등장시켜 패턴만 관찰·연습. 처치 시 재소환. */
function startBossLab(bossId = 'B14') {
  drafting = false; betweenStages = false;
  newExpedition('campaign', { devDirect: true });   // 개발 진입: 맵만 만들고 아래 enterNode로 직접 진입(자동 루트 진입 생략)
  const r = run, sq = r.squad;
  sq.tier = 3; sq.count = 60; sq.banked = 200;   // 관찰용 중간 화력
  sq.weapon = 'vulcan'; sq.weaponLv = 3;
  r.maxPower = sq.power;
  enterNode(r.map.cols[0][0]);
  r.totalTrack = 1e12; r.pending = [];
  r.bossLab = bossId;
  spawnBossLabBoss(bossId);
}

/** 함대 프리뷰(개발/테스트): 드론·순양함을 갖춘 상태로 즉시 일반 전투 — §G-1 아군 3D 를 기다림 없이 확인. */
function startFleetLab() {
  drafting = false; betweenStages = false;
  newExpedition('campaign', { devDirect: true });
  const r = run, sq = r.squad;
  // 정상 플레이(pickWeapon 경로)와 동일한 현행 상태를 설치 — 공명(섹터 무기 조합)+내구도.
  //  이게 없으면 구형 규칙이 부활한다: 막대 게이트·무기 캡슐 스폰(이사 "게이트가 다시 생겼네"),
  //  노드 클리어 후 구형 모듈 드래프트가 떠서 진행 불능(이사 제보). installGate1 은 wing 슬롯을
  //  초기화하므로 무기 지정보다 먼저 부른다(정상 경로와 같은 순서).
  sq.installGate1({ surv: createSurvivability(BAL.gate1.survivability), reson: createResonanceState(), mainWeapon: sq.weapon });
  r.world.reson = sq.reson;
  sq.tier = 2; sq.count = 60; sq.cruisers = 2; sq.banked = 120;   // 관찰용: 드론 링이 기함 밖까지 + 순양함 2척
  const w = _clParams.get('weapon');   // &weapon=laser|homing 으로 무기 3D 관찰 대상 선택(기본 vulcan)
  sq.weapon = (w === 'laser' || w === 'homing') ? w : 'vulcan'; sq.weaponLv = 2;
  if (sq.reson) resonSetLoadout(sq.reson, [sq.weapon, null]);
  r.maxPower = sq.power;
  enterNode(r.map.cols[0][0]);
  sq._syncCruiserHp();   // 순양함 체력·피탄 배열을 척수에 동기(만피 보충) — enterNode 초기화 뒤에
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
  newExpedition('campaign', { devDirect: true });   // world/squad/run 생성(개발 진입: 자동 루트 진입 생략)
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
    title: '무기 강화', subtitle: '발사 형태가 눈에 띄게 달라집니다.',
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
  const shotBase = Math.max(4, sq.flagPower * (w.stats?.damage ?? 1) * 0.06) * (sq.resonPowerMult || 1) * (run.campaign25?.resonBonus || 1);   // 한 발 기준 피해 근사(§7.3 T2+ 공명 증폭 + §7.1 두 번째 공명)
  if (spec.kind === 'rail') {
    const hx = BAL.gate1.loadout.hardpointX.wing;
    const b = new Bullet(sq.x + hx, sq.y - 10, shotBase * spec.dmgFrac, {
      vy: -BAL.weapons.laser.speed * 1.15, kind: 'laser', pierce: spec.pierce, beamW: 9, lv: 3, color: '#79ecff',   // 레일 스톰 전용 렌더(drawResonanceRail)가 resonanceId로 분기 — 흰 네모박스 대신 시안 레일포. 관통 판정은 pierce
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
  // 보스별 체력 튜너(hp 배수): 목표 처치시간(TTK) 범위에 곱해 오래 버티게 → 체력 체감↑ (HP·dpsCap 동반 상승)
  const hpMul = BAL.bossTune?.[boss.spriteId]?.hp ?? 1;
  if (hpMul !== 1) ttkRange = [ttkRange[0] * hpMul, ttkRange[1] * hpMul];
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
  newExpedition('campaign', { devDirect: true });   // 개발/측정 진입: 아래 enterNode로 직접 진입(자동 루트 진입 생략)
  const r = run, sq = r.squad, w = r.world;
  const surv = createSurvivability(BAL.gate1.survivability);
  const reson = createResonanceState();
  const frameState = createFrameState();
  const startMain = auto ? build.main : (opts.startWeapon || build.main);
  const startWing = opts.wing || build.wing;   // 재시작('같은 조합')은 선택 슬롯 순서 그대로 복원(Codex G2-G)
  sq.installGate1({ surv, reson, frameState, frameId: null, mainWeapon: startMain });
  sq.weapon = startMain; sq.weaponLv = 1;
  sq.fleet = { active: false, systemId: null, ships: [] };   // §7.2 세 번째 슬롯(함대) — fleetSlot 사건에서 해금
  const G2 = BAL.gate2;
  const metrics = createRunMetrics({ runId: `campaign25-${mode}-${build.id}`, seed: (Math.random() * 2 ** 31) | 0 });
  const director = createRunDirector(G2, buildCampaign25Schedule(G2));
  w.metrics = metrics; w.reson = reson;
  w.noFlagshipEvolve = true;   // 함체 등급은 디렉터 스케줄(H1~H5)만 — 드론 유기 진화 비활성(Codex 홀리스틱)
  w.onHullDepleted = () => finishCampaign25('hull');   // 내구도 소진 → 25분 결과 종료(regionResults 첨부, Codex P2)
  r.campaign25 = {
    // 라벨도 실제 슬롯(startMain/startWing)에서 재구성 — '같은 조합' 복원 시 뒤집힌 순서가 결과에 정확히 표기(Codex G2-G 5차).
    mode, auto, build: { ...build, main: startMain, wing: startWing, label: `${WEAPON_LABELS[startMain]}+${WEAPON_LABELS[startWing]} / ${RESONANCES[build.resonance]?.name || ''}` }, buildId: build.id, cfg: G2, director, metrics,
    pickedMain: opts.startWeapon || null, pickedWing: opts.wing || null,   // 플레이어 실제 선택 추적(재시작 슬롯 보존·조기사망 표시, Codex G2-G)
    region: 0, bossActive: false, bossSpawnT: 0, bossQueue: [], resonActivated: false, resultShown: false, resultPending: false,
    regionResults: [],        // [{ region, boss, ttk, killed }]
    bossesKilled: 0, deferredEvents: [],
    pathMods: { enemyRateMult: 1 }, pathChoicesMade: 0, eliteWavesFired: 0,   // §7.4 경로 선택·§7.5 정예 웨이브 집계(G2-F 통합 검증용)
    resonBonus: 1,   // §7.1 두 번째 공명(840s) 증폭 배수(spawnResonance·시커에서 읽음)
    pickWeapons: !auto && !!opts.pick,   // play 완전 선택제(이사 요청): 시작 무기·보조·강화를 플레이어가 선택. 측정은 자동.
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
  if (r.campaign25.pickWeapons) campaignStartWeaponPick();   // play 완전 선택제: 출격 시 시작 무기 선택(게임 정지, 이사 요청)
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
  // 지역별 난이도 갱신(Codex 홀리스틱 P1): 진행도·스테이지 모드를 지역 기준으로 재계산 →
  //  적 HP·발사 주기·변이 확률·보스 공격률이 지역마다 상승(안 하면 전 지역이 1지역 난이도로 고정).
  r.progression = progressionFor(region.i, 0, BAL.sector.depth);
  const mods = stageMods(r.progression.difficultyLevel);
  r.mods = mods; r.world.stageMods = mods;
  r.effects.text(LOGICAL_W / 2, logicalH * 0.28, `${region.i}. ${region.name}`, COLORS.reward, 20);
  const rt = BAL.gate2.regionThreat[region.i - 1];   // §7.5 지역별 위협 테마 안내(무엇을 시험하는지 한 줄)
  if (rt) { cl.regionThreatLabel = rt.label; r.effects.text(LOGICAL_W / 2, logicalH * 0.28 + 26, rt.label, '#8fb4d8', 13); }
  playBgmForSector(region.i);   // 섹터별 전투 BGM으로 전환(없으면 battle1 폴백) — 지역마다 색다른 느낌
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
  playBgmForBoss(region.i); setBgmIntensity(0.86); sfx('boss_in');   // 섹터별 보스곡(없으면 공용 boss 폴백)
  r.effects.text(LOGICAL_W / 2, logicalH * 0.35, boss.korName || bossId, COLORS.danger, 20);
  r.effects.flash(0.4);
}

/** 함체 승급: 내구도 최대치 + 발사 개성(shipTraits) + §7.3 등급별 기능(이동·공명·측면포대·Apex)을 함께 바꾼다(G2-B). */
function campaignHullTier(tier, t) {
  const r = run, sq = r.squad, w = r.world, cl = r.campaign25;
  survTierUp(sq.surv, BAL.gate1.survivability);
  sq.tier = Math.min(BAL.evolution.names.length - 1, tier);   // 스케줄된 tier를 '설정'(유기 진화 비활성이므로 스케줄이 유일 권한, Codex 홀리스틱)
  sq.surv.hull = sq.surv.hullMax;   // 상위 등급으로 강화 = 새 함체 → 내구도 완전 재충전(이사 피드백: 승급 동기부여·직관성). 승급은 25분에 T1~T5 5회로 드물어 밸런스 안전.
  applyCampaignHullFn(sq, cl);   // 등급별 기능 갱신(파워는 tier의 shipPower + 행동변화 무기성장 + 드론/순양함에서 — 별도 은행 없음)
  cl.metrics.hullTier(t);
  w.effects.halo(sq.x, sq.y, COLORS.reward);
  const fn = BAL.gate2.hullFn[Math.min(sq.tier, BAL.gate2.hullFn.length - 1)];
  w.effects.text(sq.x, sq.y - 74, `기함 승급 ${BAL.evolution.names[sq.tier]} · 내구도 완충 · ${fn.label}`, COLORS.reward, 15);
}

/** 현재 tier의 §7.3 기능을 편대에 반영(누적형). campaignHullTier·startCampaign25에서 호출.
 *  ※ Apex(T5)는 여기서 켜지 않는다 — 디렉터의 apex 사건(1290s)이 발동을 게이트한다(Codex P2). fn.apex는 라벨용. */
function applyCampaignHullFn(sq, cl) {
  const fn = BAL.gate2.hullFn[Math.min(sq.tier, BAL.gate2.hullFn.length - 1)];
  sq.moveResponseMult = fn.move;       // 이동 반응(entities.js 팔로우에서 읽음)
  sq.resonPowerMult = fn.resonPower;   // 공명 증폭(spawnResonance·시커 충돌에서 읽음)
  sq.sideGuns = fn.sideGuns;           // 측면 포대 문수(campaign25Update에서 발사)
}

/** 무기 2개 조합 → 매칭 빌드(공명·프레임 파생). 스트레스 빌드 제외, 못 찾으면 railStorm. */
function buildForPair(a, b) {
  const match = (bd) => bd.main !== bd.wing && ((bd.main === a && bd.wing === b) || (bd.main === b && bd.wing === a));
  return Object.values(CORE_LOOP_BUILDS).find((bd) => !bd.stress && match(bd)) || CORE_LOOP_BUILDS.railStorm;
}

/** 선택된 주/보조 무기로 빌드(공명·프레임)·buildId·메트릭 라벨을 파생하되 슬롯 순서는 선택 그대로 유지(Codex G2-G).
 *  주무기만 선택된 상태(90s 전 사망 대비)에서도 cl.build.main을 갱신해 결과·재시작이 실제 선택을 반영한다. */
function deriveCampaignBuild() {
  const cl = run.campaign25, main = cl.pickedMain || cl.build.main, wing = cl.pickedWing;
  if (!wing) {   // 주무기만 선택(보조 선택 전) — 완성 빌드/공명/메트릭에 귀속하지 않고 '미완성' 정체성 유지(Codex G2-G 3차)
    cl.build = { id: `main-${main}`, main, wing: null, resonance: null, label: `${WEAPON_LABELS[main]} + ?` };
    cl.buildId = `main-${main}`;
    cl.metrics.relabel(`campaign25-${cl.mode}-${main}`);   // 주무기만 = 미완성 표기(레일스톰 오귀속 방지)
    return;
  }
  const base = buildForPair(main, wing);   // 조합 확정 → 공명·프레임 빌드 파생. 슬롯 순서는 선택 그대로.
  cl.build = { ...base, main, wing, label: `${WEAPON_LABELS[main]}+${WEAPON_LABELS[wing]} / ${RESONANCES[base.resonance]?.name || ''}` };
  cl.buildId = base.id;
  cl.metrics.relabel(`campaign25-${cl.mode}-${base.id}`);
}

/** 캠페인 선택창(게임 정지). 측정=자동(autoId) 선택. play=drafting 정지 + showCoreLoopPick 카드. */
/** 무기/경로 선택 카드(공용 — 섹터·25분 무관). auto=true면 즉시 자동 선택(측정), 아니면 게임 정지 후 카드.
 *  drafting 플래그로 update()를 멈추고, 여는·재개 프레임에 짧은 무적을 준다. cl(campaign25) 없어도 동작(섹터). */
function pickCard({ title, subtitle, options, autoId, onPick, auto = false }) {
  if (auto) { onPick(autoId != null ? autoId : (options[0] && options[0].id)); return; }
  const cl = run.campaign25;
  drafting = true; if (cl) cl.picking = true; state = 'play';
  if (run.squad) run.squad.invulnT = Math.max(run.squad.invulnT || 0, BAL.squad.evolveInvuln);   // 여는 프레임도 보호(남은 적탄 충돌 방지, Codex G2-G 4차)
  ui.showCoreLoopPick({ title, subtitle, options, onPick: (id) => {
    ui.hide(); drafting = false; if (cl) cl.picking = false;
    if (run.squad) run.squad.invulnT = Math.max(run.squad.invulnT || 0, BAL.squad.evolveInvuln);   // 전투 재개 시 짧은 무적(겹친 적탄 불가피 피해 방지, Codex G2-G 2차)
    sfx('buy'); onPick(id);
  } });
}
/** 섹터 원정 출격 시 시작 무기 선택(사람). pickCard 공용 사용 → 완료 후 done()으로 섹터 시작. */
function sectorStartWeaponPick(done) {
  const r = run, sq = r.squad;
  // 포털·Prolific(EN)에서는 무기 이름·설명·안내를 영어로(§4.3·§P0-2). 일반 모드는 한국어 그대로.
  const en = EN;
  const options = en ? [
    { id: 'vulcan', label: WEAPON_LABELS_EN.vulcan, desc: 'Wide rapid fire', color: WEAPON_COLORS.vulcan, icon: WEAPON_ICON.vulcan },
    { id: 'laser', label: WEAPON_LABELS_EN.laser, desc: 'Piercing beam', color: WEAPON_COLORS.laser, icon: WEAPON_ICON.laser },
    { id: 'homing', label: WEAPON_LABELS_EN.homing, desc: 'Auto-tracking missiles', color: WEAPON_COLORS.homing, icon: WEAPON_ICON.homing },
  ] : [
    { id: 'vulcan', label: WEAPON_LABELS.vulcan, desc: '넓게 퍼지는 연사', color: WEAPON_COLORS.vulcan, icon: WEAPON_ICON.vulcan },
    { id: 'laser', label: WEAPON_LABELS.laser, desc: '적을 관통하는 빔', color: WEAPON_COLORS.laser, icon: WEAPON_ICON.laser },
    { id: 'homing', label: WEAPON_LABELS.homing, desc: '흩어진 적 자동 추적', color: WEAPON_COLORS.homing, icon: WEAPON_ICON.homing },
  ];
  pickCard({
    title: en ? 'Choose your starting weapon' : '시작 무기 선택',
    subtitle: en ? 'Pick the main weapon for this run.' : '이번 원정의 주무기를 고르세요.',
    autoId: sq.weapon,
    options,
    onPick: (id) => {
      sq.weapon = id; sq.weaponLv = 1; lastWeapon = id;   // P0-4: 같은 무기 재도전용 기록
      if (sq.reson) resonSetLoadout(sq.reson, [id, null]);
      const label = en ? WEAPON_LABELS_EN[id] : WEAPON_LABELS[id];
      r.effects.text(sq.x, sq.y - 60, `${en ? 'Weapon' : '시작 무기'}: ${label}`, WEAPON_COLORS[id], 15);
      if (isPublicRun()) track.buildChoice({ choiceType: 'start_weapon', choiceId: id, weaponId: id, sector: r.sector });
      done && done();
    },
  });
}
/** 25분 캠페인 무기 픽 — 측정(cl.auto)·cl 부재면 자동. (pickCard 래퍼: 기존 호출부 시그니처 보존) */
function campaignPick(opts) {
  const cl = run.campaign25;
  pickCard({ ...opts, auto: !cl || cl.auto });
}

const WEAPON_ICON = { vulcan: '💥', laser: '⚡', homing: '🚀' };

/** 출격 시 시작 무기 선택(발칸/레이저/유도). play 완전 선택제. */
function campaignStartWeaponPick() {
  const r = run, sq = r.squad, cl = r.campaign25;
  campaignPick({
    title: '시작 무기 선택', subtitle: '이번 25분 출격의 주무기를 고르세요.',
    autoId: cl.build.main,
    options: [
      { id: 'vulcan', label: WEAPON_LABELS.vulcan, desc: '넓게 퍼지는 연사', color: WEAPON_COLORS.vulcan, icon: WEAPON_ICON.vulcan },
      { id: 'laser', label: WEAPON_LABELS.laser, desc: '적을 관통하는 빔', color: WEAPON_COLORS.laser, icon: WEAPON_ICON.laser },
      { id: 'homing', label: WEAPON_LABELS.homing, desc: '흩어진 적 자동 추적', color: WEAPON_COLORS.homing, icon: WEAPON_ICON.homing },
    ],
    onPick: (id) => {
      sq.weapon = id; sq.weaponLv = 1;
      resonSetLoadout(sq.reson, [id, null]);
      cl.pickedMain = id; deriveCampaignBuild();   // 시작 무기를 즉시 빌드에 반영(조기 사망·재시작 대비, Codex G2-G #2)
      r.effects.text(sq.x, sq.y - 60, `시작 무기: ${WEAPON_LABELS[id]}`, WEAPON_COLORS[id], 15);
    },
  });
}

/** 두 번째 무기: 측정=빌드 wing 자동, play 완전 선택제=주무기 아닌 2종 중 선택(조합→공명 빌드 파생). */
function equipCampaignWing(t) {
  const r = run, sq = r.squad, cl = r.campaign25;
  if (sq.wing.weaponId) return;
  const setWing = (id) => {
    sq.wing.weaponId = id; sq.wing.level = 1; sq._wingAcc = 0;
    if (cl.pickWeapons) { cl.pickedWing = id; deriveCampaignBuild(); }   // 선택 조합 → 공명·프레임·라벨·메트릭 파생(슬롯 순서 보존, Codex G2-G)
    cl.metrics.secondWeapon(t);   // 마일스톤 기록(Codex P2)
    r.world.effects.text(sq.x, sq.y - 60, `보조 무기: ${WEAPON_LABELS[id]}`, WEAPON_COLORS[id], 15);
  };
  if (!cl.pickWeapons) { setWing(cl.build.wing); return; }   // 측정/자동
  const opts = ['vulcan', 'laser', 'homing'].filter((w) => w !== sq.weapon).map((w) => ({
    id: w, label: WEAPON_LABELS[w], desc: `공명: ${RESONANCES[buildForPair(sq.weapon, w).resonance]?.name || ''}`, color: WEAPON_COLORS[w], icon: WEAPON_ICON[w],
  }));
  campaignPick({ title: '보조 무기 선택', subtitle: '주무기와 짝지어 공명이 결정됩니다.', autoId: cl.build.wing, options: opts, onPick: setWing });
}

/** §7.2 세 번째 슬롯 = 함대 시스템(전투기 편대) 해금. 기함 앞 편대 대형·자율 조준 독립 사격(주포 복제 아님). */
function equipCampaignFleet(t) {
  const r = run, sq = r.squad, cl = r.campaign25, F = BAL.gate2.fleet;
  if (sq.fleet && sq.fleet.active) return;   // 멱등(중복 해금 방지)
  const ships = [];
  for (let i = 0; i < F.count; i++) {
    const [ox, oy] = F.formation[Math.min(i, F.formation.length - 1)];
    ships.push({ ox, oy, x: sq.x + ox, y: sq.y + oy, fireT: F.fireInterval * (i / Math.max(1, F.count)), phase: i * 1.7 });
  }
  sq.fleet = { active: true, systemId: F.systemId, ships };
  cl.metrics.fleetSlot(t);   // 세 번째 슬롯 마일스톤(§7.2)
  r.world.effects.text(sq.x, sq.y - 88, `함대 시스템 전개: ${F.label} ×${F.count}`, F.color, 16);
  r.world.effects.halo(sq.x, sq.y, F.color);
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
  // 스텝 소진(후반) → 자동 소폭 화력 성장(측정·play 공통, 25분 내내 성장 유지, Codex 홀리스틱 2차).
  if (!steps.length) { sq.banked = (sq.banked || 0) + BAL.gate2.behaviorOverflowPower; cl.metrics.choice(t, { behavior: true }); return; }
  // 측정/자동: 첫 스텝 자동 적용(과소 파워 방지). play 완전 선택제: 강화 카드로 선택.
  if (!cl.pickWeapons) { steps[0].apply(); cl.metrics.choice(t, { behavior: true }); return; }
  const opts = steps.slice(0, 3).map((s) => ({ id: s.id, label: s.label, desc: s.desc, color: s.color || '#ffd93d', icon: '🔧' }));
  campaignPick({ title: '무기 강화 선택', subtitle: '', autoId: steps[0].id, options: opts, onPick: (id) => { const s = steps.find((x) => x.id === id); if (s) s.apply(); cl.metrics.choice(t, { behavior: true }); } });
}

/** §7.1 최종 무기 진화(1050s): 주무기 최종 레벨 + 미진화면 진화 1단계 부여(Codex 홀리스틱 — 미배선 사건 실동작). */
function campaignFinalWeaponEvo(t) {
  const sq = run.squad, cl = run.campaign25, w = run.world, wp = sq.weapon, max = BAL.weapons.lvCoef.length;
  sq.weaponLv = max;   // 최종 레벨(측정·play 공통)
  const opts = sq.weaponEvolutions[wp] ? [] : (evolutionOptions(wp) || []);   // 이미 진화했으면 레벨만
  if (!opts.length) { w.effects.text(sq.x, sq.y - 78, `최종 강화: ${WEAPON_LABELS[wp] || wp}`, COLORS.reward, 16); return; }
  const applyEvo = (id) => { sq.weaponEvolutions[wp] = id; sq.evoLevels[wp] = 1; w.effects.text(sq.x, sq.y - 78, `최종 무기 진화: ${WEAPON_LABELS[wp] || wp}`, COLORS.reward, 16); };
  if (!cl.pickWeapons) { applyEvo(opts[0].id); return; }   // 측정/자동: 첫 진화
  // play 완전 선택제: 최종 진화도 선택 카드(Codex G2-G 3차)
  campaignPick({ title: '최종 무기 진화 선택', subtitle: `${WEAPON_LABELS[wp] || wp}의 진화 경로를 고르세요.`, autoId: opts[0].id,
    options: opts.map((e) => ({ id: e.id, label: e.short, desc: e.shape, color: '#ffd93d', icon: '✴️' })), onPick: applyEvo });
}

/** §7.4 큰 경로 선택(~4분마다). 측정=결정론적 자동선택, play=게임 정지 + 2택 카드(showCoreLoopPick 재사용). */
function presentPathChoice(index, t) {
  const cl = run.campaign25;
  const pair = pathChoicePair(cl.cfg, index);
  if (!pair) return;
  if (cl.auto) { applyPathChoice(index % 2 === 0 ? pair.a : pair.b, t); return; }   // 측정: 교대 선택(양 옵션 다 검증)
  drafting = true; cl.picking = true; state = 'play';   // play: 게임 정지 + 카드
  run.squad.invulnT = Math.max(run.squad.invulnT || 0, BAL.squad.evolveInvuln);   // 여는 프레임도 보호(Codex G2-G 4차)
  ui.showCoreLoopPick({
    title: '경로 선택', subtitle: '4분마다의 큰 갈림길 — 항로를 정하세요.',
    options: [
      { id: 'a', label: pair.a.label, desc: pair.a.desc, color: '#c9b8ff', icon: '🜂' },
      { id: 'b', label: pair.b.label, desc: pair.b.desc, color: '#8fd4ff', icon: '🜄' },
    ],
    onPick: (id) => { ui.hide(); drafting = false; cl.picking = false; run.squad.invulnT = Math.max(run.squad.invulnT || 0, BAL.squad.evolveInvuln); sfx('buy'); applyPathChoice(id === 'a' ? pair.a : pair.b, t); },   // 재개 무적(Codex G2-G 2차)
  });
}

/** 선택 항로 효과 적용(각 옵션 ≥2축 실효과 — 가짜 분기 없음). 밀도 배수는 다음 선택까지 지속.
 *  상한(만피·최대레벨·공명 무대상 등)으로 무효화된 mod는 대체 혜택(호위 편대)으로 보전해 2축 계약 유지(Codex 2차 P2). */
function applyPathChoice(opt, t) {
  const r = run, cl = r.campaign25, sq = r.squad, w = r.world, m = opt.mods || {};
  cl.pathMods = { enemyRateMult: m.enemyRateMult || 1 };   // 다음 구간(다음 선택까지) 적 밀도 — 위험/보상 축(항상 리셋)
  let capped = 0;                                          // 상한으로 무효화된 mod 수
  if (m.hullHeal) {                                        // 수리 축
    const before = sq.surv.hull;
    sq.surv.hull = Math.min(sq.surv.hullMax, sq.surv.hull + m.hullHeal * sq.surv.hullMax);
    if (sq.surv.hull > before) cl.metrics.hullRepair(); else capped++;   // 실제 회복 시에만 기록, 만피면 폴백
  }
  if (m.weaponLv) {                                        // 무기 강화 축
    const max = BAL.weapons.lvCoef.length;
    if (sq.weaponLv < max) sq.weaponLv = Math.min(max, sq.weaponLv + m.weaponLv); else capped++;   // 최대면 폴백
  }
  if (m.resonCharge && !applyResonBoost(sq, w, m.resonCharge, t)) capped++;   // 공명 무효(무대상/미활성) → 폴백
  if (m.droneGain) sq.applyDelta(m.droneGain, w);         // 호위 편대 — 보상 축(항상 유효)
  if (m.shield) addShield(sq.surv, 1);                    // 방어 축: 단일 일회성 보호막(surv=접촉+투사체 모두 takeShot 경유, Codex P2)
  if (capped > 0) {   // 상한 무효화된 mod → 옵션에 '없는' 항상유효 축(보호막/호위)으로 대체 → 중복 축 붕괴 방지·2축 보존(Codex 4차 P2)
    const pool = [];
    if (!m.shield) pool.push('shield');
    if (!m.droneGain) pool.push('drone');
    for (let i = 0; i < capped; i++) {
      if ((pool[i] || 'drone') === 'shield') addShield(sq.surv, 1);
      else sq.applyDelta(BAL.gate2.pathFallbackDrones, w);
    }
  }
  cl.pathChoicesMade = (cl.pathChoicesMade || 0) + 1;
  cl.metrics.choice(t);
  w.effects.text(sq.x, sq.y - 80, `경로: ${opt.label}`, '#c9b8ff', 16);
}

/** 공명 가속: 빌드 트리거별 호환(Codex P2). 충전형=즉시 충전, mark형(시커 빔)=기함 최근접 적 표식. 실효과 있으면 true. */
function applyResonBoost(sq, w, frac, t) {
  const rid = sq.reson.activeId, def = RESONANCES[rid];
  if (!def) return false;
  if (def.trigger === 'charge') {
    const thr = BAL.gate1.resonance[rid]?.threshold || 100;
    sq.reson.charge = (sq.reson.charge || 0) + thr * frac;   // 충전형: charge 적립(tryProc이 읽음)
    return true;
  }
  if (def.trigger === 'mark') {   // 시커 빔: mark은 threshold가 없어 charge 무효 → 기함 기준 최근접(즉각 위협) 적 표식(Codex 2차 P2)
    let near = null, nd = Infinity;
    for (const e of w.entities) {
      if (!e.isEnemy || e.dead) continue;
      const dx = e.x - sq.x, dy = e.y - sq.y, d = dx * dx + dy * dy;
      if (d < nd) { nd = d; near = e; }
    }
    for (const b of (w.bosses || [])) {   // 보스전 중엔 잡몹이 없다(spawnCampaignBoss가 w.entities 비움) → 살아있는 보스도 표적(Codex 3차 P2)
      if (b.dead) continue;
      const dx = b.x - sq.x, dy = b.y - sq.y, d = dx * dx + dy * dy;
      if (d < nd) { nd = d; near = b; }
    }
    if (near) { resonLaserMark(sq.reson, BAL.gate1.resonance, near, t); return true; }
  }
  return false;
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

/** §7.2 전투기 편대: 편대 대형 추종(+상하 부유) + 사거리 내 적 자율 조준 사격. 볼트=sourceWeaponId 'fleet'(별도 집계·공명 미충전). */
function fleetTick(dt) {
  const r = run, sq = r.squad, w = r.world, F = BAL.gate2.fleet;
  const fl = sq.fleet;
  if (!fl || !fl.active) return;
  const dmg = Math.max(4, sq.flagPower * (w.stats?.damage ?? 1) * F.dmgFrac);
  for (const s of fl.ships) {
    s.phase += dt * 2.2;
    const tx = sq.x + s.ox, ty = sq.y + s.oy + Math.sin(s.phase) * F.bob;
    const k = Math.min(1, F.followLerp * dt);
    s.x += (tx - s.x) * k; s.y += (ty - s.y) * k;
    s.fireT -= dt;
    if (s.fireT <= 0) {
      const target = nearestEnemyForFleet(w, s.x, s.y, F.range);
      if (target) {
        s.fireT = F.fireInterval;
        const dx = target.x - s.x, dy = target.y - s.y, d = Math.hypot(dx, dy) || 1;
        const b = new Bullet(s.x, s.y - 4, dmg, { vx: (dx / d) * F.boltSpeed, vy: (dy / d) * F.boltSpeed, kind: 'vulcan', lv: 1, color: F.color });
        b.sourceWeaponId = 'fleet'; w.bullets.push(b);   // 세 번째 슬롯 구분 소스(§7.2): 통계 'fleet' 버킷·공명 미충전
      } else {
        s.fireT = 0.15;   // 표적 없음: 짧게 재확인(볼트 낭비 방지)
      }
    }
  }
}

/** 전투기 자율 조준: 사거리 내 '위쪽'(앞) 잡몹 최근접 우선, 없으면 위쪽 보스.
 *  표적을 위쪽으로 한정하는 이유: 아래로 쏜 볼트는 Bullet.update가 화면 하단 이탈을 제거하지 않아
 *  25분 동안 w.bullets에 무한 잔류한다(Codex G2-C P2). 위쪽 표적만 → 볼트는 항상 상향 → 상단서 소멸. */
function nearestEnemyForFleet(w, x, y, range) {
  let best = null, bestD = range * range;
  for (const e of w.entities) {
    if (!e.isEnemy || e.dead || e.indestructible || !e.hitByBullet) continue;
    if (e.y >= y) continue;   // 위쪽 적만(하향 볼트 잔류 방지)
    const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = e; }
  }
  for (const b of (w.bosses || [])) {   // 보스도 표적(클램프 경유라 TTK 유지). 위쪽일 때만.
    if (b.dead || b.y >= y) continue;
    const dx = b.x - x, dy = b.y - y, d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = b; }
  }
  return best;
}

/** 전투기 편대 렌더(작은 삼각 아군기 + 코어 글로우). */
function drawCampaignFleet(ctx) {
  const sq = run.squad, fl = sq && sq.fleet;
  if (!fl || !fl.active) return;
  const F = BAL.gate2.fleet;
  ctx.save();
  for (const s of fl.ships) {
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.fillStyle = F.color; ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#eafff6';
    ctx.beginPath(); ctx.arc(0, -1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
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
  fleetTick(dt);            // §7.2 세 번째 슬롯 전투기 편대(자율 조준 사격)
  // 지역 전투 스트림 재보충(보스 없을 때 25분 내내 전투 유지). intro(첫 1분)엔 사격 적 스폰 금지(§7.1).
  const densityCap = Math.round(6 * (cl.pathMods?.enemyRateMult || 1));   // §7.4 경로 선택 = 다음 구간 적 밀도(위험/보상)
  // intro(첫 60초): play는 사격 적 없이 크리스탈 수집 스트림(빈 화면 방지·조작 학습, refill이 skipShooters로 크리스탈만 스폰).
  //  측정은 헤드리스라 도입부 공백 유지(검증된 TTK 보존). intro 후엔 두 모드 정상 전투 재보충.
  const introSpawnOK = t >= cl.cfg.introSec || !cl.auto;
  if (introSpawnOK && r.phase === 'track' && r.pending.length < 2 && w.entities.filter((e) => e.isEnemy).length < densityCap && !cl.bossActive) refillCoreLoopTrack();
  // §7.5 지역 정예 웨이브(주기): 현재 지역 elite 타입을 정예 변이(★)로 스폰 → 4~8초 처치 역할(intro 후·track·비보스 한정).
  cl._eliteWaveT = (cl._eliteWaveT ?? cl.cfg.eliteWaveSec) - dt;
  if (cl._eliteWaveT <= 0) {
    cl._eliteWaveT = cl.cfg.eliteWaveSec;
    if (t >= cl.cfg.introSec && r.phase === 'track' && !cl.bossActive) { refillCoreLoopTrack(true); cl.eliteWavesFired += 1; }
  }
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
      case 'fleetTelegraph': cl.fleetTelegraph = true; r.world.effects.text(sq.x, sq.y - 70, `함대 시스템 준비 — ${BAL.gate2.fleet.label} 곧 전개`, BAL.gate2.fleet.color, 14); break;   // §7.2 슬롯 예고
      case 'fleetSlot': equipCampaignFleet(t); break;   // §7.2 세 번째 슬롯 해금
      case 'resonanceReady': activateCampaignResonance(t); break;
      case 'framePick': pickCampaignFrame(t); break;
      case 'behavior': campaignBehavior(t); break;   // 무기 레벨업 → 25분 힘 성장(§1.3)
      case 'apex': cl.apexUnlocked = true; cl._apexT = 0.1; break;   // §7.3 T5 Apex 해금(즉시 첫 발동)
      case 'pathChoice': presentPathChoice(ev.choice, t); break;   // §7.4 ~4분마다 큰 경로 선택
      case 'secondResonance': cl.resonBonus = (cl.resonBonus || 1) * 1.4; if (sq.reson.activeId) applyResonBoost(sq, w, 1.0, t); w.effects.text(sq.x, sq.y - 74, '공명 증폭 회로', '#9fe8ff', 15); break;   // §7.1 두 번째 공명(840s)
      case 'finalWeaponEvo': campaignFinalWeaponEvo(t); break;   // §7.1 최종 무기 진화(1050s)
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
  snap.pathChoicesMade = cl.pathChoicesMade;      // §7.4 경로 선택 횟수(G2-F 통합 검증)
  snap.eliteWavesFired = cl.eliteWavesFired;       // §7.5 정예 웨이브 횟수
  snap.fleetActive = !!(r.squad.fleet && r.squad.fleet.active);  // §7.2 세 번째 슬롯 해금 여부
  snap.finalTier = r.squad.tier;                   // §7.3 최종 함체 등급(T5 도달 확인)
  window.__nfRunMetrics = snap;
  state = 'done';
  // play 결과: 25분 6지역 전용 결과 패널. 재시작은 25분 캠페인으로(Gate 1 이탈 방지).
  //  '같은 조합 다시'=같은 빌드 자동, '새 조합 시도'=무기 재선택(완전 선택제) → 실제로 구분(Codex 홀리스틱 + 이사 선택제).
  if (cl.mode === 'play') showCampaign25Result(snap, r.squad, cl, (mode, which) => {
    ui.hide();
    if (which === 'new') startCampaign25({ mode: 'play', pick: true });
    else if (cl.pickedMain && cl.pickedWing) startCampaign25({ mode, buildId: cl.buildId, startWeapon: cl.pickedMain, wing: cl.pickedWing, pick: false });   // 완성 조합 → 선택 슬롯 순서 그대로 복원(Codex G2-G #1)
    else startCampaign25({ mode: 'play', pick: true });   // 보조 무기 선택 전 종료(미완성 조합) → 재선택(Codex G2-G 2차)
  });
}

/** 25분 캠페인 전용 결과: 6지역 보스 TTK 표 + Gate 2 시스템(함체 T5·함대·경로·정예·공명) 요약(§7.1 §7.6). */
function showCampaign25Result(snap, sq, cl, restartFn) {
  const build = cl.build;
  const activeResonName = sq.reson.activeId ? RESONANCES[sq.reson.activeId]?.name : (RESONANCES[build.resonance]?.name || '');
  ui.showCampaign25Result({
    reason: snap.campaignReason,
    regionResults: snap.regionResults || [],
    regions: BAL.gate2.regions,
    build,
    finalTier: snap.finalTier, tierNames: BAL.evolution.names,
    fleetActive: snap.fleetActive, fleetLabel: BAL.gate2.fleet.label,
    pathChoicesMade: snap.pathChoicesMade, eliteWavesFired: snap.eliteWavesFired,
    resonanceName: activeResonName,
    hull: sq.surv.hull, hullMax: sq.surv.hullMax,
    damageByWeapon: snap.damageByWeapon, damageByResonance: snap.damageByResonance,
    weaponLabels: WEAPON_LABELS,
    onSame: () => restartFn(cl.mode, 'same'),
    onNew: () => restartFn('play', 'new'),   // 다른 조합(빌드 회전)으로 재시작
  });
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
  const introGate = r.campaign25 ? cl.cfg.introSec : P.introSec;   // 캠페인은 gate2.introSec(60s) 기준
  const skipShooters = !dense && t < introGate;   // 사람 플레이 첫 구간: 사격 적 없이 이동·크리스탈 수집만(사격 적 X, 크리스탈은 스폰)
  // 사람 플레이 스트림은 튜토리얼 미러 복제를 끄고(noDup) per가 정확한 적 수가 되게 한다(Codex P2).
  //  측정 스트림은 weaver 고정(Codex 승인 TTK·밀도 보존). 사람 플레이는 램밍 제외 슈터를 시간 따라 다양화(테스터: 단조로움).
  // §7.5 지역별 적 구성: 캠페인이면 현재 지역 조합(역할=빌드 시험), Gate 1은 기존 그대로(측정=weaver 고정, play=기본 6종).
  const DEFAULT_POOL = ['weaver', 'turret', 'sniper', 'zapper', 'orbiter', 'blinker'];
  const isCampaign = !!r.campaign25;
  let pool = DEFAULT_POOL, eliteType = 'turret';
  if (isCampaign) {
    const reg = c25RegionAt(cl.cfg, t);
    const rt = reg ? BAL.gate2.regionThreat[reg.i - 1] : null;
    if (rt) { pool = rt.pool; eliteType = rt.elite || 'turret'; }
  }
  const poolN = Math.min(pool.length, 2 + Math.floor(t / 80));   // 시간 지날수록 등장 종류 확대
  if (!skipShooters) for (let row = 0; row < rows; row++) {
    for (let i = 0; i < per; i++) {
      const frac = per > 1 ? i / (per - 1) : 0.5;   // 1기일 때 0/0(NaN) 방지 — 중앙 배치
      const idx = row * per + i;
      const type = elite ? eliteType
        : dense ? (isCampaign ? pool[idx % pool.length] : 'weaver')   // 측정: 캠페인=지역 조합 결정론 순환 / Gate1=weaver 고정(불변)
        : pool[(idx + Math.floor(t / 18)) % poolN];                   // play: 조합 시간 순환·점증(캠페인=지역, Gate1=기본)
      r.pending.push({ type, size: 'small', noDup: !dense, elite: elite && isCampaign,   // 캠페인 정예 웨이브만 정예 변이 강제(Gate1 정예는 기존 확률 유지)
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
  const m = w.metrics, reson = w.reson;   // m 없음=섹터(피해 집계 생략, 공명 충전은 유지)
  const nowT = run.coreLoop ? elapsed(run.coreLoop.director) : 0;
  if (b.resonanceId) { if (m) m.resonanceDamage(b.resonanceId, dealt); return; }   // 공명 발사체 = 공명 피해(집계만·재충전 안 함)
  if (m) {   // 피해 집계는 측정/캠페인만(섹터는 metrics 없음)
    if (reson && b.sourceWeaponId === 'homing' && isSeekerHit(reson, target)) m.resonanceDamage('seekerBeam', dealt);   // 시커 표식 명중=공명 피해 귀속
    else m.weaponDamage(b.sourceWeaponId, dealt);
  }
  // 공명 충전(모드 무관 — 섹터 포함): 쌍의 두 무기 명중 모두 전달(모듈 pair 검사가 필터). 시커 표식=레이저 명중.
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
/** 무기 하나의 진화 표기(예: '커터3'). 슬롯별로 필요해서 무기 id를 받는다(주무기·보조 공용). */
function weaponEvoLabelFor(sq, w) {
  if (!w) return '';
  const superId = sq.weaponEvolutions2?.[w], evoId = sq.weaponEvolutions?.[w];
  if (superId) return `${evolutionDef(superId)?.short || ''}${sq.superLevels[w] || 1}`;
  if (evoId) return `${evolutionDef(evoId)?.short || ''}${sq.evoLevels[w] || 1}`;
  return '';
}
function weaponEvoLabel(sq) {
  return weaponEvoLabelFor(sq, sq.weapon) || undefined;
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
  // 섹터 무기 조합(S4): 중간 정예몹 처치 → POW 배지 드롭 → 수집 시 무기 강화(이사). 25분·coreLoop 제외(자체 강화).
  //  대상 = 미니보스(=이사가 말한 '중간 정예몹', 확정) + 정예 변이몹(★, 보너스).
  //  미니보스를 빼먹어서 섹터 1(변이 확률 0%)에선 POW가 하나도 안 나왔다 → 무기 조합이 영영 안 열림.
  if (!run.campaign25 && !run.coreLoop && (e instanceof MidBoss || (e.affixes && e.affixes.includes('elite')))) w.spawnEntity(new Pow(e.x, e.y));
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

  syncCameraAnchor();          // §3: input.tick 직전에 현재 함대 좌표를 카메라 anchor에 반영(1프레임 지연 제거)
  rebuildChaseProjection();    // 2.5D: 같은 프레임의 함대·줌·blend로 투영 갱신 → 마우스 역변환이 현재 시점 기준
  input.tick(dt);
  w.phase = r.phase;
  w.boss = r.boss; w.bosses = r.bosses;
  r.squad.update(dt, w);
  if (r.coreLoop) coreLoopUpdate(dt);   // Gate 1 하네스: 디렉터·공명·프레임·측정 진행
  if (r.campaign25) campaign25Update(dt);   // Gate 2: 25분 6지역 시간 캠페인 진행
  else if (!r.coreLoop && r.squad.reson?.activeId) {   // 섹터 무기 조합 이식(S3): 공명 tick/발동(coreLoop·campaign25는 자체 update에서 처리)
    resonTick(r.squad.reson, dt);
    const spec = resonTryProc(r.squad.reson, BAL.gate1.resonance, 0);
    if (spec) spawnResonance(spec, r.squad, w);
  }
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
    // 무기 강화(레벨·진화·초진화) 추종 배수 — while 루프 밖(트랙 분기 최상위)에 둔다.
    //  잡몹 pf·중간보스뿐 아니라 트랙 종료 후 '보스 스폰'(while 밖)에서도 써야 하므로 여기서 1회 계산.
    //  (이전엔 while 안에서 선언 → 보스 스폰 지점에서 ReferenceError → 보스 스폰 중단 → 빈 bosses로 오격파)
    const weaponPf = 1 + BAL.economy.weaponHpWeight * (r.squad.weaponPowerMult() - 1);

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
      // 적 HP 기준 화력에도 격납고 강화를 반영(보스와 동일 원리, 이사). 상한 hpCapS는 그대로 적용된다.
      const enemyPower = effectiveFirepower(Math.max(0, r.maxPower), r.world.stats, BAL.squad, BAL.economy.enemyHangarWeight);
      // 무기 강화 추종 배수(weaponPf)는 while 루프 밖에서 이미 계산됨. 캡(드론수 폭주 방지)은 드론 화력에만, 무기 배수는 캡 밖에서 곱해 실DPS 추종.
      const pf = (1 + Math.min(hpCapS, enemyPower / BAL.economy.enemyHpPowerScale)) * weaponPf;
      const gMul = BAL.difficulty.globalMult;   // 전체 난이도 배수(사용자 조정): 체력 ×gMul, 발사 주기 ÷gMul(더 빠름)
      const scaleEnemy = (e) => { e.hp = e.maxHp = Math.round(e.hp * mods.enemyHp * pf * (e.hpScaleMul ?? 1) * gMul * BAL.difficulty.enemyHpMult); if (e.fireInterval) e.fireInterval *= mods.enemyRate / gMul; return e; };
      // 적 스폰 헬퍼: 난이도 스케일 + 변이(어픽스=섹터 확률) 롤 + 등록
      // §7.5 정예 웨이브=정예 변이 강제(★ 3.2×HP). 단, 정예 스케일을 '1회만' 렌더하는 타입만(creature·turret)
      //  — sniper 등은 spriteScale 무시(2차), charger는 this.r+캔버스 이중 스케일(3차)이라 제외 → 그 외는 일반 변이로 폴백.
      const ELITE_KINDS = new Set(['creature', 'turret']);
      const spawnEnemy = (e, kind) => { scaleEnemy(e); if (it.elite && ELITE_KINDS.has(kind)) applyAffixes(e, ['elite']); else maybeAffix(e, kind, contentTier, r.rng); w.entities.push(e); };
      // 적 항목은 난이도 비례 복제 스폰(§4.5): 복제본은 좌우 미러 + 세로로 살짝 시차.
      const dup = it.noDup ? 1 : copyCount(difficultyLevel, r.tutorial);   // 첫 노드는 최대 2로 제한. 코어루프 정밀 스트림은 noDup(정확한 수).
      if (it.type === 'crystal') w.entities.push(new Crystal(x, -60, Math.round(it.value * mods.crystal), w, supplyMult));
      else if (it.type === 'gatePair') {
        // 섹터 무기 조합: 막대 게이트 전면 제거 — ÷2 vs ÷2·-27 vs -32처럼 선택에 의미가 없다(이사). 성장은 크리스탈·수송선·정예 POW로.
        if (!r.squad.reson) {
          const gs = (g) => scaleGate(g, difficultyLevel, BAL.gate.flatScalePerStage, BAL.gate.flatScaleMax);
          w.entities.push(new GatePair(LOGICAL_W, -60, gs(it.left), gs(it.right)));
        }
      }
      else if (it.type === 'creature') for (let k = 0; k < dup; k++) spawnEnemy(new Creature(k ? LOGICAL_W - x : x, -60 - 70 * k, it.size), 'creature');
      else if (it.type === 'splitter') for (let k = 0; k < dup; k++) spawnEnemy(new Creature(k ? LOGICAL_W - x : x, -60 - 70 * k, 'mid', { splits: 3 }), 'creature');
      else if (it.type === 'meteor') w.entities.push(new Meteor(x, -60, r.rng));
      else if (it.type === 'debris') w.entities.push(new Debris(x, -90, it.size));
      else if (it.type === 'power') {
        // 섹터 무기 조합(reson)이면 무기 캡슐·파워업 미스폰 — 무기는 정예 POW 강화로만(이사: 보조무기 충돌·드론/보호막 획득 정리).
        if (!r.squad.reson) {
          if (r.rng() < 0.5) w.entities.push(new PowerModule(x, -60));
          else w.entities.push(new Capsule(x, -60, ['vulcan', 'laser', 'homing'][Math.floor(r.rng() * 3)]));
        }
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
      else if (it.type === 'midboss') {
        // 중간보스 정체 = 캠페인 순서상 '직전 섹터의 보스'(섹터 1은 그 섹터 보스의 축소판).
        // 이전엔 bossDefFor(sector-1)이라 섹터 1에서 로스터 0번 = B7 하이브 퀸(섹터 6 최종 보스)이 나왔다(이사 지적).
        const midId = campaignBossId(Math.max(1, r.sector - 1), r.mode, BAL.campaign.bosses, BAL.campaign.endlessBosses);
        const mb = new MidBoss(LOGICAL_W, contentTier, r.maxPower * weaponPf, midId);   // 무기 강화 추종(잡몹과 동일)
        preloadBossArt(mb.def.id);   // 중간보스 아트 지연 로드 — 없으면 붉은 타원 폴백+텍스트만 보임(이사 지적)
        w.entities.push(mb);
      }
      else if (it.type === 'capsule') {
        if (!r.squad.reson) {   // 섹터 무기 조합이면 무기 캡슐 미스폰(보조무기 충돌 방지 — 이사)
          const weapon = it.weapon === 'random' ? ['vulcan', 'laser', 'homing'][Math.floor(r.rng() * 3)] : it.weapon;
          w.entities.push(new Capsule(x, -60, weapon));
        }
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
        if (!r.squad.reson) {   // 섹터 무기 조합: 막대 게이트 전면 제거(감염 게이트도 동일 — 이사)
          const gs = (g) => scaleGate(g, difficultyLevel, BAL.gate.flatScalePerStage, BAL.gate.flatScaleMax);
          const gate = new GatePair(LOGICAL_W, -60, gs(it.left), gs(it.right));
          w.entities.push(gate);
          w.entities.push(new GateParasite(gate, it.infectedLane ?? 0, difficultyLevel));
        }
      }
    }

    if (r.traveled >= r.totalTrack && r.pending.length === 0 && !r.isBossNode) {
      // 비보스 노드: 보스 없이 통과 연출 → 맵 복귀
      r.phase = 'flythrough'; r.flyV = BAL.flythrough.startV; r.clearShown = true;
    } else if (r.traveled >= r.totalTrack && r.pending.length === 0) {
      r.phase = 'boss';
      w.scrollSpeed = 40; // 보스전: 트랙 거의 정지, 별만 천천히
      sfx('boss_in');
      setBgmIntensity(0.86); playBgmForBoss(r.sector); // 섹터별 보스곡(없으면 공용 boss 폴백)
      // 보스 정체성 = 캠페인/엔드리스 순서(§6.2). 서사형 보스 B7/B22는 항상 단독.
      const { bossTier } = r.progression;
      const bossId = campaignBossId(r.sector, r.mode, BAL.campaign.bosses, BAL.campaign.endlessBosses);
      const resolvedBossId = bossDefById(bossId).id;
      preloadBossArt(resolvedBossId); // 등장 이동 시간 동안 전용 레이어를 지연 로드
      const bossN = bossCountFor(resolvedBossId, bossTier, BAL.boss);
      // 보스 HP 기준 화력 = 함대 화력 × 격납고 강화 배수. 격납고를 빼면 강화할수록 보스가 물러진다(이사).
      const bossPower = effectiveFirepower(r.maxPower, r.world.stats, BAL.squad, BAL.boss.hangarWeight) * weaponPf;   // 무기 강화 추종(엔드리스/클래식 보스; 캠페인 섹터 보스는 실측 avgDps)
      const hpCap = Math.max(BAL.boss.hp, bossPower * BAL.boss.hpPerPowerCap); // A4: 화력 대비 상한 → 처치시간 상한
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
        const rawHp = Math.max(BAL.boss.hp, bossPower * BAL.boss.hpPerPower) * r.mods.boss * (b.pattern.tanky ?? 1) * variantHp;
        // 전체 난이도 배수 × 보스 전용 배수 (상한 이후에 곱해 '체력 상한' 자체를 함께 끌어올린다)
        const sectorBossScale = 1 + Math.max(0, r.sector - 1) * 0.22;   // 섹터 깊을수록 보스 단단(섹터5≈1.9배·섹터6≈2.1배) — 후반 보스 너무 쉽게 죽는 문제 해결(이사)
        const sectorHpMult = BAL.boss.sectorHpMult?.[r.sector] ?? 1;    // 특정 섹터만 따로 조정(섹터 1=2배, 이사)
        b.hp = b.maxHp = Math.round(Math.min(rawHp * totalMult / bossN, hpCap) * BAL.difficulty.globalMult * BAL.difficulty.bossHpMult * sectorBossScale * sectorHpMult);
        r.bosses.push(b);
      }
      r.boss = r.bosses[0];   // 연출·클리어 배너 앵커용 선두
    }
  } else if (r.phase === 'boss') {
    r.scrollY += 30 * dt;
    for (const b of r.bosses) { if (b.dead) b.deathT += dt; else b.update(dt, w); }  // 죽은 보스는 페이드, 산 보스는 교전 지속
    w.boss = r.bosses.find((b) => !b.dead) || r.bosses[0];   // 호밍 표적 = 살아있는 선두
    if (r.bossLab && r.bosses.length && r.bosses.every((b) => b.dead)) {   // 보스랩: 처치하면 잠시 뒤 재소환(패턴 반복 관찰)
      r._labRespawnT = (r._labRespawnT || 0) + dt;
      if (r._labRespawnT > 1.2) { r._labRespawnT = 0; spawnBossLabBoss(r.bossLab); }
    }
    if (r.bosses.length && r.bosses.every((b) => b.dead) && !r.coreLoop && !r.campaign25 && !r.bossLab) {   // .length: 빈 배열의 every()=true로 인한 보스 없는 오격파 차단(campaign25와 동일 가드)
      sfx('boss_die');
      // 섹터 보스 = 대량 코인. 사망 직후 컷신 전환이라 수거가 불가능하므로 직접 지급(이 블록은 phase 전환으로 단일 발동).
      const bc = Math.round(BAL.coin.sectorBoss);
      w.addCoins(bc);
      const bl = r.bosses[0]; if (bl) r.effects.text(bl.x, bl.y - 30, `🪙 +${bc.toLocaleString()}`, '#ffd93d', 24);
      setBgmIntensity(0.24); playBgm('title'); // 승리 여운 BGM으로 전환
      // 섹터 보스 = 전체화면 컷신(배경 일러스트 + 침몰하는 보스 + 이탈하는 기함).
      // 배경 이미지가 아직 없으면 cutsceneReady()가 false → 기존 인게임 연출로 폴백한다.
      if (r.isBossNode && cutsceneReady()) {
        const lead = r.bosses[0];
        // 보스 아트 id: Boss 클래스는 spriteId, MidBoss는 def.id를 쓴다.
        // 예전엔 def.id만 읽어 섹터 보스에서 undefined가 되면서 컷신에 보스가 아예 안 그려졌다(이사 지적).
        r.cut = createCutscene({
          sector: r.sector, bossId: lead?.spriteId || lead?.def?.id, en: EN,
          // 포털·Prolific(EN)=영문 보스명, 그 외=한국어. lead(Boss)는 spriteId로 def 조회.
          bossName: EN ? (bossDefById(lead?.spriteId || lead?.def?.id)?.name || 'Enemy flagship') : lead?.korName,
          tier: r.squad.tier, weapon: r.squad.weapon,
        });
        r.phase = 'cutscene';
        input.clearSkip();   // 보스전에서 누르고 있던 키가 남아 컷신이 즉시 스킵되던 문제
        r.effects.clear?.();
        return;
      }
      // 전원 격파 → 파괴 연출 시작
      r.phase = 'bossDeath';
      r.seqT = 0;
      r.chainT = 0;
    }
  } else if (r.phase === 'cutscene') {
    // 전체화면 컷신 — 게임 로직은 전부 멈추고 연출만 진행.
    // 초반 0.8초는 건너뛰기를 막는다(보스를 잡은 클릭·스페이스가 그대로 이어져 컷신이 즉사하는 것 방지).
    if (r.cut.t > 0.8 && input.consumeSkip()) r.cut.t = Math.max(r.cut.t, CUT.outStart);
    r.effects.update(dt);
    tickCutscene(r.cut, dt, { ...r.effects, logicalH }, sfx);
    if (r.cut.done) { r.cut = null; r.clearBackdrop = true; onEncounterClear(); }
    return;
  } else if (r.phase === 'bossDeath') {
    // 보스 위에서 연쇄 폭발이 터지며 파괴 → 함체가 기울며 아래로 침몰(섹터 클리어 컷신)
    r.squad.invulnT = Math.max(r.squad.invulnT, BAL.flythrough.invuln);   // 클리어 연출 중 무적 (잔여 적 충돌 방지)
    r.seqT += dt;
    const BD = BAL.bossDeath;
    for (const b of r.bosses) {
      b.deathT = r.seqT;
      b.y += BD.sinkDrift * dt;                                   // 아래로 가라앉는다
      b.sinkRoll = (b.sinkRoll || 0) + BD.sinkRoll * dt * (b._rollDir || (b._rollDir = Math.random() < 0.5 ? -1 : 1));
    }
    r.cinemaT = Math.min(1, (r.cinemaT || 0) + dt * 3);            // 시네마 띠 등장
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
    if (r.seqT >= (r.isBossNode ? BD.sectorDuration : BD.duration)) {
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
    // 침몰은 통과 중에도 계속 — 화면에 남은 보스가 아래로 멀어지며 뒤로 밀린다
    for (const b of r.bosses) { b.deathT += dt; b.y += BAL.bossDeath.sinkDrift * 0.6 * dt; }
    r.squad.update(dt, w);
    // 보스 위치를 지나는 순간 배너 (섹터 보스면 섹터 돌파 컷신 문구)
    if (!r.clearShown && r.boss && r.squad.y < r.boss.y + 30) {
      r.clearShown = true;
      const label = r.isBossNode ? tx(`SECTOR ${r.sector} BREACH`, `섹터 ${r.sector} 돌파`) : tx('COMBAT COMPLETE!', '전투 완료!');
      r.effects.text(LOGICAL_W / 2, logicalH * 0.42, label, COLORS.ally, r.isBossNode ? 26 : 18);
      if (r.isBossNode) r.effects.text(LOGICAL_W / 2, logicalH * 0.42 + 30, tx('Enemy flagship destroyed', '적 기함 격침 확인'), COLORS.reward, 13);
      r.effects.ring(LOGICAL_W / 2, logicalH * 0.42, COLORS.ally);
      r.effects.flash(0.4);
      sfx('evolve');
    }
    if (r.squad.y < BAL.flythrough.exitY) { r.cinemaT = 0; onEncounterClear(); return; }
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
          if (w.reson && b.sourceWeaponId === 'homing' && isSeekerHit(w.reson, bo)) bossDmg *= BAL.gate1.resonance.seekerBeam.missileBonus * (w.squad?.resonPowerMult || 1) * (run.campaign25?.resonBonus || 1);  // 시커 증폭(+§7.3 공명 증폭 +§7.1 두 번째 공명)
          // 코어루프 B22 양측 클램프(dpsCap 하한·enrage 상한)는 보스 hitByBullet 래퍼가 '모든' 경로에 적용한다(§5.8, Codex P1).
          const hpBefore = bo.hp;
          bo.hitByBullet(bossDmg, w, b);
          if (w.metrics || w.reson?.activeId) tallyBulletDamage(w, b, Math.max(0, hpBefore - bo.hp), bo);   // 피해 집계(측정/캠페인) + 공명 충전(섹터 포함)
          b.onHit?.(bo, w);            // 시즈 폭발(도탄/분열은 보스전에서 대상 없음)
          b.dead = true; hitBoss = true; // 보스는 관통 불가 (거대 표적)
          break;
        }
      }
      if (hitBoss) continue;
    }
    for (const e of w.entities) {
      // bulletPhantom = 아군 탄이 그대로 통과(섹터 무기 조합의 수집 전용 크리스탈). 충돌 자체를 안 잡아야 탄이 소멸하지 않는다.
      if (e.dead || !e.hitByBullet || e.bulletPhantom?.(w)) continue;
      if (b.hitSet && b.hitSet.has(e)) continue;
      const rr = (e.r ?? 20) + b.r;
      const dx = b.x - e.x, dy = b.y - e.y;
      if (dx * dx + dy * dy <= rr * rr) {
        const wasAlive = !e.dead;
        let dealt = e.def ? b.damage * (w.mfx?.bossDmgMult ?? 1) : b.damage;
        // 시커 빔(G1-06): 표식 대상을 맞힌 유도 미사일은 실제 피해가 증폭된다(우선추적 + 증폭).
        if (w.reson && b.sourceWeaponId === 'homing' && isSeekerHit(w.reson, e)) dealt *= BAL.gate1.resonance.seekerBeam.missileBonus * (w.squad?.resonPowerMult || 1) * (run.campaign25?.resonBonus || 1);   // 시커 증폭(+§7.3 공명 증폭 +§7.1 두 번째 공명)
        const hpBefore = e.hp ?? 0;
        e.hitByBullet(dealt, w, b); // 탄환 문맥 전달(프리즘 코어 등)
        if (w.metrics || w.reson?.activeId) tallyBulletDamage(w, b, Math.max(0, hpBefore - (e.hp ?? 0)), e);   // 피해 집계(측정/캠페인) + 공명 충전(섹터 포함)
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
    if (PLAYTEST && playtest && !playtest.done) { triggerPlaytestSurvey('first_death'); return; }   // Prolific: 첫 사망이 먼저면 즉시 설문(§4.2)
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
    options: DOCTRINES, lang: LANG,
    onPick(id) {
      r.squad.doctrine = id;
      r.squad.pendingDoctrine = false;
      drafting = false;
      ui.hide();
      sfx('buy');
      r.effects.flash(0.7);
      r.effects.text(r.squad.x, r.squad.y - 60, tx(`Combat style: ${DOCTRINE_BY_ID[id].icon} ${DOCTRINE_EN[id]?.[0] || DOCTRINE_BY_ID[id].name}`, `전투 스타일 선택: ${DOCTRINE_BY_ID[id].icon} ${DOCTRINE_BY_ID[id].name}`), COLORS.reward, 18);
      if (isPublicRun()) track.buildChoice({ choiceType: 'doctrine', choiceId: id, sector: r.sector });   // 분석: 적용 뒤 1회
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
    options: KEYSTONES, sector: r.sector, lang: LANG,
    onPick(id) {
      r.squad.keystone = id;
      r.squad.keystoneState = freshKeystoneState();   // 누적 카운터 0에서 시작
      drafting = false;
      ui.hide();
      sfx('buy');
      r.effects.flash(0.7);
      if (isPublicRun()) track.buildChoice({ choiceType: 'keystone', choiceId: id, sector: r.sector });   // 분석: 적용 뒤 1회
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
    weapon, options: opts, tier: isSuper ? 2 : 1, repick: stage === 're', lang: LANG,
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
      r.effects.text(r.squad.x, r.squad.y - 60, tx(`${PLAYTEST_EVOLUTION_EN[id]?.[0] || opts.find((o) => o.id === id).name}!`, `${opts.find((o) => o.id === id).name}!`), COLORS.reward, 18);
      if (isPublicRun()) track.buildChoice({ choiceType: isSuper ? 'weapon_super_evolution' : 'weapon_evolution', choiceId: id, weaponId: weapon, sector: r.sector });   // 분석: 진화/초진화 구분
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
  platform.gameplayStop();   // 플랫폼 수명주기(no-op)
  setBgmIntensity(0.2); playBgm('title');
  const r = run;
  const data = save.get();
  const isRecord = r.maxPower > data.best;
  const best = Math.max(data.best, r.maxPower);
  const earned = Math.round(r.world.coins * r.world.stats.coinMult * BAL.economy.coinBankMult);   // 전투 중 획득 코인(격납고 적립 배수 적용)
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
  // P0-A: 첫 실제 사망(death)에서만 무료 긴급 개조 자격을 계산한다. quit·캠페인 완료·개발 종료는 제외.
  const freeKeys = reason === 'death' && !r.bossLab
    ? firstDefeatUpgradeOptions(save.get(), BAL.hangar.upgrades, BAL.hangar.maxLv)
    : [];
  const isDeath = reason === 'death';
  // 분석: 정산 1회 뒤 expedition_ended(공개 런). 파사드가 원정당 1회 보장 → 결과 재렌더에도 재발생 없음.
  if (isPublicRun()) {
    const d2 = save.get();
    const upgradeState = !isDeath ? 'not_eligible'
      : (freeKeys.length ? 'available' : (d2.firstDefeatUpgrade != null ? 'already_owned' : 'not_eligible'));
    track.expeditionEnded({
      outcome: isDeath ? 'death' : 'quit',
      sectorReached: r.sector, nodeProgress: r.done.length,
      primaryWeapon: r.squad.weapon, doctrineId: r.squad.doctrine, keystoneId: r.squad.keystone,
      maxTier: r.squad.tier, maxCruisers: r.squad.cruisers || 0,
      firstDefeatUpgradeState: upgradeState,
    });
  }
  if (toTitle) { showTitleScreen(); return; }
  const resultSnap = { stage: r.sector, maxPower: r.maxPower, coins: earned, bonus, best, isRecord, modules: moduleSummary(r.modules) };
  showLoseResult(resultSnap, freeKeys);
}

/**
 * 결과 화면 렌더 (정산과 분리 — 무료 개조 선택 후 UI만 다시 그린다).
 *  freeKeys 있음 → 무료 개조 선택 카드. 선택하면 save에 1회 기록 후 같은 스냅샷으로 완료 상태 재렌더.
 *  justClaimed=true(선택 직후 재렌더)일 때만 완료 문구를 보여준다 — 이미 받은 사용자의 이후 사망마다
 *  '완료' 문구가 반복 노출되지 않게(그 death엔 카드도 문구도 없이 일반 결과 화면).
 */
function showLoseResult(snap, freeKeys, justClaimed = false) {
  const FREE_EN = { drones: 'Drones', hull: 'Hull', dmg: 'Damage' };   // P0-2: 무료 개조 카드 영어명(포털·Prolific). 단위 '기'는 영어에서 생략.
  const options = freeKeys.map((k) => {
    const def = BAL.hangar.upgrades[k];
    return { key: k, name: EN ? (FREE_EN[k] || def.name) : def.name, delta: `+${def.step}${EN ? '' : (def.unit || '')}`, desc: def.desc };
  });
  let freeUpgrade = null;
  if (options.length) {
    freeUpgrade = {
      options,
      onPick(key) {
        const d = save.get();
        if (d.firstDefeatUpgrade != null) return;              // 이미 받음(연속 클릭·재호출 방어)
        if (!FIRST_DEFEAT_KEYS.includes(key)) return;          // 화이트리스트
        const def = BAL.hangar.upgrades[key];
        const lv = d.up[key] || 0;
        if (!def || lv >= BAL.hangar.maxLv) return;            // 최대 레벨 방어
        // 코인 차감 없음. 강화 레벨 +1과 지급 완료 상태를 한 번의 set으로(어긋남 방지).
        save.set({ up: { ...d.up, [key]: lv + 1 }, firstDefeatUpgrade: key });
        if (isPublicRun()) track.freeUpgrade(key);             // 분석: 저장 성공 뒤 1회
        sfx('buy');
        showLoseResult(snap, [], true);                        // 완료 상태로 다시 그림(카드 사라지고 완료 문구)
      },
    };
  } else if (justClaimed) {
    const chosenKey = save.get().firstDefeatUpgrade;
    freeUpgrade = chosenKey ? { chosenName: BAL.hangar.upgrades[chosenKey]?.name || '' } : null;
  }
  ui.showLose({
    ...snap,
    lang: LANG,
    // P0-4 빠른 재도전: 포털은 PLAY AGAIN이 '같은 무기' 즉시 재출격(선택창 없이). 일반 모드는 기존대로 startPlay()=무기 재선택.
    onRetry: () => { if (isPublicRun()) track.retrySelected('death'); startPlay(PORTAL_MODE ? lastWeapon : undefined); },
    onChangeWeapon: PORTAL_MODE ? () => { if (isPublicRun()) track.retrySelected('death'); startPlay(); } : null,   // 포털 보조 선택지: 무기 변경 재출격
    onHangar: () => showHangar('result'),
    freeUpgrade,
  });
}

/** 캠페인 최종 보스(하이브 퀸) 격파 → 정산 + 무한 원정 해금 + 승리 화면 (§6.3). */
function winCampaign() {
  const r = run;
  state = 'done'; drafting = false; betweenStages = false; platform.gameplayStop(); setBgmIntensity(0.2); playBgm('title');
  const data = save.get();
  const best = Math.max(data.best, r.maxPower);
  const earned = Math.round(r.world.coins * r.world.stats.coinMult * BAL.economy.coinBankMult);
  if (!r.settled) {
    r.settled = true;
    // 캠페인 완주 정산 (이 경로는 캠페인 전용) → stage 갱신 + 완주·해금 플래그
    save.set({ best, coins: data.coins + earned, ...progressPatch('campaign', r.sector, data), campaignCleared: true, endlessUnlocked: true });
  }
  if (isPublicRun()) {   // 분석: 캠페인 완주 = campaign_clear(일반 사망과 구분)
    track.expeditionEnded({
      outcome: 'campaign_clear', sectorReached: r.sector, nodeProgress: r.done.length,
      primaryWeapon: r.squad.weapon, doctrineId: r.squad.doctrine, keystoneId: r.squad.keystone,
      maxTier: r.squad.tier, maxCruisers: r.squad.cruisers || 0, firstDefeatUpgradeState: 'not_eligible',
    });
  }
  ui.showVictory({
    coins: earned, best, onTitle: showTitleScreen, onEndless: startEndless, lang: LANG,
    onRestart: () => { if (isPublicRun()) track.retrySelected('campaign_clear'); startPlay(); },
  });
}

/** 무한 원정 시작(캠페인 클리어 후 해금). 캠페인 이후 섹터부터 보스 순환·변주가 강해진다. */
function startEndless() {
  drafting = false; betweenStages = false; hideConsentUI(); sfx('start');
  newExpedition('endless');
}

// ───────────────────────── 격납고 (영구 강화 상점)
// entryPoint('title'|'result')가 있을 때만 hangar_viewed 발생 — 구매 후 재렌더(showHangar())는 재발생 안 함.
function showHangar(entryPoint) {
  if (entryPoint && !ANALYTICS_DEV) track.hangarViewed(entryPoint);
  ui.showHangar({
    data: save.get(),
    hangar: BAL.hangar,
    squadBase: BAL.squad,
    lang: LANG,
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
// 상단 진입 페이드(전술·추적 공용): y≈0 경계로 들어오는 개체가 딱딱하게 잘려 보이지 않게.
function drawEntityFaded(ctx, e) {
  const fz = (e.r || 24) * 2;
  if (e.y < fz) { const a = e.y / fz; if (a <= 0.02) return; ctx.save(); ctx.globalAlpha = a; e.draw(ctx); ctx.restore(); }
  else e.draw(ctx);
}
function drawBossFaded(ctx, b) {
  const fz = (b.r || 40) * 2;
  if (b.y > 0 && b.y < fz) { ctx.save(); ctx.globalAlpha = Math.max(0.05, b.y / fz); b.draw(ctx); ctx.restore(); }
  else b.draw(ctx);
}
// 추적 시점 배경 전진감(§7): 소실점 글로우 + 항로선. chaseBlend 비례로만 강해지고 랜덤 없음(고정 레인 → 매 프레임 객체 생성 없음).
const CHASE_LANES = [0.14, 0.32, 0.5, 0.68, 0.86];
function drawChaseBackdrop(ctx, proj, intensity) {
  if (intensity <= 0.01) return;
  const cx = proj.centerX, hy = proj.horizonY, ny = proj.nearY, R = proj.logicalW * 0.6;
  ctx.save();
  ctx.globalAlpha = 0.22 * intensity;
  const g = ctx.createRadialGradient(cx, hy, 4, cx, hy, R);
  g.addColorStop(0, 'rgba(120,180,255,0.85)'); g.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, hy, R, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.12 * intensity;
  ctx.strokeStyle = 'rgba(150,200,255,0.7)'; ctx.lineWidth = 1;
  for (const f of CHASE_LANES) { ctx.beginPath(); ctx.moveTo(cx, hy); ctx.lineTo(f * proj.logicalW, ny); ctx.stroke(); }
  ctx.restore();
  ctx.globalAlpha = 1;
}
// 화면 밖 위험 경고(§9): 색+모양 둘 다로 구분(색맹 배려). HUD 아래·월드 위. 개체 위치·충돌은 불변.
function drawEdgeWarnings(ctx, r, proj) {
  const warns = collectEdgeWarnings(r, proj, { w: LOGICAL_W, h: logicalH });
  for (const w of warns) {
    const color = w.danger === 'boss' ? '#ff5a6a' : w.danger === 'enemyBullet' ? '#ff8a3c' : '#ffb020';
    ctx.save();
    ctx.globalAlpha = 0.92; ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.translate(w.edgeX, w.edgeY);
    ctx.beginPath();
    if (w.danger === 'boss') { ctx.moveTo(0, -8); ctx.lineTo(7, 6); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill(); }        // 삼각형
    else if (w.danger === 'enemyBullet') { ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke(); }                                 // 원
    else { ctx.rect(-5, -5, 10, 10); ctx.stroke(); }                                                                         // 사각
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ── B1 실전 스웜 수집 버퍼(이사 승인) — 프레임 중 할당 0(고정 슬롯 재사용). ──
//  적 12종 화면 전장(len/max)·상한(cap)은 ENEMY3D(chase3d-prop-defs) 단일 진실 — 이력: B1 163=이사 실기 +30% 확정.
//  아군 호위(§G-1): 드론=단순 다트(2D 시각 18px 계승), 순양함=미니 전함(2D 30px — 위계상 드론보다 확실히 큼).
const DRONE_SCREEN_LEN = 22, DRONE_SCREEN_MAX = 44;
const CRUISER_SCREEN_LEN = 42, CRUISER_SCREEN_MAX = 84;
const _droneBuf = Array.from({ length: 60 }, () => ({ sx: 0, sy: 0, px: 0, wob: 0 }));
const _cruBuf = Array.from({ length: 10 }, () => ({ sx: 0, sy: 0, px: 0, wob: 0 }));
const _escBuf = Array.from({ length: 72 }, () => ({ x: 0, y: 0, kind: 0, roll: 0 }));   // escortsFor3D 작업 버퍼
let _b1Stamp = 0;
// 3D 포함 여부는 게임 객체에 쓰지 않고 sidecar(WeakMap)로 관리(Codex P2) — 저장·직렬화·디버깅과의 결합 원천 차단.
const _in3dMap = new WeakMap();
// ── 소품 3D(이사: "무기·배지") — 종별 화면 전장(논리px)·상한과 수집 버퍼. 레이저 빔·공명은 2D 스트릭 유지. ──
const PROP_LEN = { pbullet: [24, 60], ebullet: [20, 56], missile: [30, 76], laser: [64, 150], crystal: [88, 200], coin: [22, 56], pow: [40, 92], pod: [64, 160], capsule: [44, 110] };
const _sw = {
  ...Object.fromEntries(Object.keys(ENEMY3D).map((k) => [k, { buf: Array.from({ length: ENEMY3D[k].cap }, () => ({ sx: 0, sy: 0, px: 0, wob: 0 })), n: 0 }])),
  drone: { buf: _droneBuf, n: 0 }, cruiser: { buf: _cruBuf, n: 0 },
  props: Object.fromEntries(PROP_KEYS.map((k) => [k, { buf: Array.from({ length: PROP_CAPS[k] }, () => ({ sx: 0, sy: 0, px: 0, wob: 0, col: -1 })), n: 0 }])),
};
// 픽업 정보 라벨(+N·▲N·무기명·POW)은 3D 위 HUD 계층에 유지 — 시각만 3D 로 바꾸고 게임 정보는 잃지 않는다.
const _propLabels = Array.from({ length: 24 }, () => ({ x: 0, y: 0, str: '', col: '#eaf6ff', size: 15 }));
let _propLabelN = 0;
const _colCache = new Map();   // '#rrggbb' → int (탄 진화색 instanceColor)
function colInt(hex, fallback) {
  if (!hex || typeof hex !== 'string') return fallback;
  let v = _colCache.get(hex);
  if (v === undefined) { v = parseInt(hex.replace('#', ''), 16); if (!Number.isFinite(v)) v = fallback; _colCache.set(hex, v); }
  return v;
}
// 이번 프레임 3D 로 올라간 바로 그 개체만 2D 스킵(초과·변이 개체는 2D 유지) — 개체에 프레임 스탬프를 찍어 집합을 정확히 일치.
//  sidecar 라 게임 객체·저장·직렬화에 절대 나타나지 않는다(§0.2 규칙 불변).
const _isB13D = (e) => _in3dMap.get(e) === _b1Stamp;

// ── 기함 2D↔3D 스왑 워프 플래시(이사 3회 지적의 마감): 하드 컷의 형태 교체 순간을 "위상 전환" 섬광으로 가린다. ──
//  규칙·판정·저장 불변 — 화면 연출 전용. reduced-motion 이면 발화하지 않는다(즉시 컷만).
let _swapSide = -1, _swapFxAt = 0, _swapFxX = 0, _swapFxY = 0;
function noteSwap(t3d, r, proj) {
  const side = t3d >= 0.5 ? 1 : 0;
  if (_swapSide === -1) { _swapSide = side; return; }   // 첫 관측은 기준만 잡고 발화 없음
  if (side === _swapSide) return;
  _swapSide = side;
  if (!proj || !r || !r.squad || r.squad.dead || prefersReducedMotion()) return;
  const p = projectPoint({ x: r.squad.x, y: r.squad.y }, proj);
  _swapFxAt = performance.now(); _swapFxX = p.x; _swapFxY = p.y;
}
/** 픽업 정보 라벨(+N·▲N·무기명·POW) — 본체는 3D, 숫자·이름은 HUD 계층(3D 위)에 그대로. 2D draw 와 같은 윤곽 스타일. */
function drawPropLabels(c) {
  if (!_propLabelN) return;
  c.save();
  c.textAlign = 'center';
  for (let i = 0; i < _propLabelN; i++) {
    const L = _propLabels[i];
    c.font = `bold ${L.size}px Pretendard, sans-serif`;
    c.lineWidth = 3; c.strokeStyle = 'rgba(5,6,15,0.85)';
    c.strokeText(L.str, L.x, L.y + 5);
    c.fillStyle = L.col;
    c.fillText(L.str, L.x, L.y + 5);
  }
  c.restore();
}

function drawSwapFlash(c) {
  if (!_swapFxAt) return;
  const el = (performance.now() - _swapFxAt) / 300;   // 0.3초
  if (el >= 1) { _swapFxAt = 0; return; }
  const a = (1 - el) * (1 - el);                       // 빠른 감쇠(섬광답게)
  const R = 30 + el * 120;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(_swapFxX, _swapFxY, 2, _swapFxX, _swapFxY, R);
  g.addColorStop(0, `rgba(215,246,255,${0.85 * a})`);
  g.addColorStop(0.35, `rgba(125,220,255,${0.5 * a})`);
  g.addColorStop(1, 'rgba(80,180,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(_swapFxX, _swapFxY, R, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 0.9 * a; c.strokeStyle = '#bfeaff'; c.lineWidth = 2.5;
  c.beginPath(); c.arc(_swapFxX, _swapFxY, R * 0.72, 0, Math.PI * 2); c.stroke();
  c.globalAlpha = 0.55 * a; c.lineWidth = 1.5;        // 수평 섬광선(워프 감)
  c.beginPath(); c.moveTo(_swapFxX - R * 1.6, _swapFxY); c.lineTo(_swapFxX + R * 1.6, _swapFxY); c.stroke();
  c.restore();
  c.globalAlpha = 1;
}

// ── 기함 충돌 섬광(이사 "정면에 부딪히는 느낌"): 적 몸체 충돌·적탄 명중(내구도 지불) 순간을 기수 섬광으로. ──
//  신호 = squad.flash 상승 에지(takeShot 이 0.25 세트 — 보호막 방어 시엔 미발화) → 로직 무수정, 표시 전용.
//  3D(t≥0.5) HUD 계층 전용: 2D 는 기존 링·burst 연출 유지. reduced-motion 이면 발화하지 않는다.
let _impactFxAt = 0, _impactFxX = 0, _impactFxY = 0, _prevSquadFlash = 0;
function noteImpact(t3d, r, proj) {
  const fl = (r.squad && !r.squad.dead) ? (r.squad.flash || 0) : 0;
  const rising = fl > _prevSquadFlash + 0.1;
  _prevSquadFlash = fl;
  if (!rising || t3d < 0.5 || !proj || prefersReducedMotion()) return;
  const p = projectPoint({ x: r.squad.x, y: r.squad.y }, proj);
  _impactFxAt = performance.now(); _impactFxX = p.x; _impactFxY = p.y - 34;   // 기함 투영점보다 기수 쪽
}
function drawImpactFlash(c) {
  if (!_impactFxAt) return;
  const el = (performance.now() - _impactFxAt) / 320;   // 0.32초
  if (el >= 1) { _impactFxAt = 0; return; }
  const a = (1 - el) * (1 - el);
  const R = 26 + el * 96;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(_impactFxX, _impactFxY, 2, _impactFxX, _impactFxY, R);
  g.addColorStop(0, `rgba(255,244,214,${0.9 * a})`);    // 백열 코어
  g.addColorStop(0.3, `rgba(255,170,90,${0.55 * a})`);  // 화염 주황(위험색 계열 — 워프 청백과 구분)
  g.addColorStop(1, 'rgba(255,90,60,0)');
  c.fillStyle = g; c.beginPath(); c.arc(_impactFxX, _impactFxY, R, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 0.85 * a; c.strokeStyle = '#ffd2a0'; c.lineWidth = 2.5;   // 확장 충격파 링
  c.beginPath(); c.arc(_impactFxX, _impactFxY, R * 0.66, 0, Math.PI * 2); c.stroke();
  c.globalAlpha = 0.6 * a; c.lineWidth = 1.5;           // 위쪽 부채꼴 파편 스파크(부딪힌 방향)
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i - 2.5) * 0.5, r0 = R * 0.5, r1 = R * (1.05 + (i % 2) * 0.25);
    c.beginPath(); c.moveTo(_impactFxX + Math.cos(ang) * r0, _impactFxY + Math.sin(ang) * r0);
    c.lineTo(_impactFxX + Math.cos(ang) * r1, _impactFxY + Math.sin(ang) * r1); c.stroke();
  }
  c.restore();
  c.globalAlpha = 1;
}

function draw() {
  syncPlayButtons();   // 상태에 따라 일시정지·차지 버튼 표시/숨김 (draw는 headless step에서도 호출됨)
  // 방어: 치수가 비정상(NaN·0·음수)이면 렌더를 건너뛴다 — createLinearGradient 등이 비유한값에 예외를 던져 프리즈되는 것을 차단.
  if (!Number.isFinite(logicalH) || logicalH <= 0 || !Number.isFinite(scale) || scale <= 0) return;
  // 실제 3D(선택): 살아있는 상태를 읽어 #game3d에 렌더하고 전환 t를 얻는다(§7·§8). 미지원/휴면/실패면 0 → RC2 화면 그대로.
  let t3d = 0;
  if (CHASE3D_ON && !CHASE3D_TEST && !CHASE3D_LAB) {   // 검증 장면·검사실은 별도 루프가 #game3d를 직접 구동 → 메인 draw가 캔버스를 만지면 안 됨(실 rAF에서 매 프레임 숨김 충돌)
    // followX = 2D 기함의 화면 중앙 이탈(논리 px, 부분 추종) → 3D 카메라 트럭 이동으로 2D·3D 기함 화면 X 정합
    const followX = chaseProjection ? chaseProjection.C0 - chaseProjection.centerX : 0;
    // 실전 3D 스웜 수집(이사 승인): 크리처(B1·B2) + 소품(탄·픽업·배지) — 2.5D 투영 화면좌표·크기로 3D 인스턴스와 정합.
    //  변이(엘리트) 크리처는 제외(링·표식 유지), large(B3)·레이저 빔·공명 탄은 2D 유지. 버퍼 초과분도 2D 폴백.
    for (const k in ENEMY3D) _sw[k].n = 0;
    _propLabelN = 0; _b1Stamp++;
    for (const k of PROP_KEYS) _sw.props[k].n = 0;
    if (chase3d && state === 'play' && run && chaseProjection) {
      const passGate = (e, p) => {   // 기함 통과: 투영이 아래로 외삽(depth 1.6 공통) — 화면 밖이면 어디에도 안 그림
        if (e.y > chaseProjection.squadY) { _in3dMap.set(e, _b1Stamp); if (p.y > logicalH + 60) return false; }
        return true;
      };
      const putProp = (key, e, p, col, wob) => {
        const s = _sw.props[key];
        if (s.n >= s.buf.length) return false;
        const [len, max] = PROP_LEN[key];
        const o = s.buf[s.n++];
        o.sx = p.x; o.sy = p.y; o.px = Math.min(max, len * p.scale); o.wob = wob; o.col = col;
        _in3dMap.set(e, _b1Stamp);
        return true;
      };
      const putLabel = (p, str, col, size) => {
        if (_propLabelN >= _propLabels.length || !str) return;
        const L = _propLabels[_propLabelN++];
        L.x = p.x; L.y = p.y; L.str = str; L.col = col; L.size = size;
      };
      // §G-4 적 12종 공용 수집(이사 제작 렌더 빌보드) — 비변이만(변이=2D 유지로 링·표식 보존), 초과분 2D 폴백.
      const put3D = (key, e, wob) => {
        if (e.affixes && e.affixes.length) return null;
        const s3 = _sw[key];
        if (!s3 || s3.n >= s3.buf.length) return null;   // 로스터 밖 보스 등 — 2D 유지
        const p = projectObject(e, 'enemy', chaseProjection);
        if (!passGate(e, p)) return null;
        const d = ENEMY3D[key];
        const o = s3.buf[s3.n++];
        o.sx = p.x; o.sy = p.y; o.px = Math.min(d.max, d.len * p.scale); o.wob = wob;
        _in3dMap.set(e, _b1Stamp);
        return p;
      };
      for (const e of run.world.entities) {
        if (e.dead) continue;
        if (e instanceof Creature) { put3D(e.size === 'small' ? 'b1' : e.size === 'mid' ? 'b2' : 'b3', e, e.wob || 0); continue; }
        if (e instanceof Sniper) { put3D('b4', e, e.wob || 0); continue; }
        if (e instanceof Turret) { put3D('b5', e, e.wob || 0); continue; }
        if (e instanceof Weaver) { put3D('b6', e, (e.t || 0) * 1.7); continue; }   // 좌우 누빔 — 살랑 롤은 t 기반
        if (e instanceof Bomber) { put3D('b16', e, 0); continue; }
        if (e instanceof Zapper) { put3D('b17', e, 0); continue; }
        if (e instanceof Orbiter) { put3D('b18', e, 0); continue; }
        if (e instanceof Shielder) { put3D('b19', e, 0); continue; }
        if (e instanceof BroodCarrier) { put3D('b20', e, 0); continue; }
        if (e instanceof Blinker) { if (e.appearT >= 0.9) put3D('b21', e, 0); continue; }   // 텔레포트 페이드는 2D 연출 유지 — 완전 등장만 3D
        if (e instanceof Boss || e instanceof MidBoss) {   // §G-6 보스 — 대형 단일 개체(cap 1), 이름 라벨은 HUD 계층으로 보존
          const bid = String(e.spriteId || (e.def && e.def.id) || '').toLowerCase();
          const bp = ENEMY3D[bid] ? put3D(bid, e, 0) : null;
          if (bp && e.def && (e.def.korName || e.def.name)) putLabel(bp, EN ? e.def.name : (e.def.korName || e.def.name), '#ffd166', 13);
          continue;
        }
        // 픽업·배지: 소품 3D 는 개발 플래그(chase3dProps=1) 전용 — 기본은 기존 2D(이사 "엉망" 판정, Codex A/B 권고)
        if (!CHASE3D_PROPS) continue;
        let key = null, label = '', lcol = '#eaf6ff';
        if (e instanceof Crystal) { key = 'crystal'; label = `+${e.payout}`; }
        else if (e instanceof Coin) key = 'coin';
        else if (e instanceof Pow) { key = 'pow'; label = 'POW'; lcol = '#ffe066'; }
        else if (e instanceof DronePod) { key = 'pod'; label = `▲${e.payout}`; lcol = '#8ff5e0'; }
        else if (e instanceof Capsule) { key = 'capsule'; label = WEAPON_LABELS[e.weapon] || ''; lcol = WEAPON_COLORS[e.weapon] || '#9fd4ff'; }
        else if (e instanceof PowerModule) key = 'capsule';
        if (!key) continue;
        const p = projectObject(e, 'pickup', chaseProjection);
        if (!passGate(e, p)) continue;
        if (putProp(key, e, p, -1, 0) && label) putLabel(p, label, lcol, key === 'crystal' ? 16 : 13);
      }
      // 탄환 3D 도 같은 개발 플래그 뒤 — 기본은 기존 2D 탄·스트릭.
      if (CHASE3D_PROPS) {
        for (const b of run.world.bullets) {
          if (b.dead || b.resonanceId) continue;   // §G-2: 레이저 랜스도 3D(공명 레일만 2D 전용 렌더 유지)
          const p = projectObject(b, 'playerBullet', chaseProjection);
          if (!passGate(b, p)) continue;
          const key = b.kind === 'laser' ? 'laser' : b instanceof HomingMissile ? 'missile' : 'pbullet';
          // §G-2: 원본 그림 자체가 색을 가짐(2D 도 원색 blit) — 틴트 없이 흰색(진화 구분은 후속: 진화별 텍스처)
          putProp(key, b, p, 0xffffff, Math.atan2(b.vx || 0, -(b.vy || -1)));
        }
        for (const b of run.world.enemyBullets) {
          if (b.dead || b.kind === 'laser' || b.resonanceId) continue;
          const p = projectObject(b, 'enemyBullet', chaseProjection);
          if (!passGate(b, p)) continue;
          putProp('ebullet', b, p, colInt(b.color, 0xff7a5a), Math.atan2(b.vx || 0, -(b.vy || 1)));
        }
      }
      // 아군 호위(§G-1): Squad 의 드론·순양함·호위기 위치(draw 와 동일 수식의 escortsFor3D)를 3D 인스턴스로.
      //  피격핵·HP바·플래시 링은 2D 유지(정보 보존) — 함선 본체만 3D 대체.
      _sw.drone.n = 0; _sw.cruiser.n = 0;
      if (!run.squad.dead && typeof run.squad.escortsFor3D === 'function') {
        const en = run.squad.escortsFor3D(_escBuf);
        for (let i = 0; i < en; i++) {
          const e = _escBuf[i];
          const cru = e.kind === 1;
          const s = cru ? _sw.cruiser : _sw.drone;
          if (s.n >= s.buf.length) continue;
          const p = projectPoint({ x: e.x, y: e.y }, chaseProjection);
          const o = s.buf[s.n++];
          o.sx = p.x; o.sy = p.y;
          o.px = cru ? Math.min(CRUISER_SCREEN_MAX, CRUISER_SCREEN_LEN * p.scale) : Math.min(DRONE_SCREEN_MAX, DRONE_SCREEN_LEN * p.scale);
          o.wob = e.roll;
        }
      }
    }
    if (chase3d && state === 'play' && run) t3d = chase3d.frame(run, camera.current, LOGICAL_W, logicalH, canvas.width, canvas.height, performance.now() * 0.001, followX, _sw);
    else if (canvas3d) { canvas3d.style.opacity = '0'; canvas3d.style.visibility = 'hidden'; }
  }
  chase3dT = t3d;
  if (state === 'play' && run) noteSwap(t3d, run, chaseProjection);   // 기함 2D↔3D 스왑 교차 감지 → 워프 플래시
  if (state === 'play' && run) noteImpact(t3d, run, chaseProjection); // 기함 피격(충돌·명중) 상승 에지 → 충돌 섬광
  // HUD 계층(§6): 3D 활성 시 #game-hud(3D 위)로, 아니면 #game(ctx). 매 프레임 #game-hud를 지워 잔상 방지.
  const hctx = (t3d > 0 && hudCtx) ? hudCtx : ctx;
  if (hudCtx) { hudCtx.setTransform(1, 0, 0, 1, 0, 0); hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height); if (hctx !== ctx) hudCtx.setTransform(scale, 0, 0, scale, 0, 0); }
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // 섹터 클리어 직후의 선택 화면(키스톤·항로)도 컷신 배경 위에서 진행한다(이사).
  //  선택창이 전투 화면 위에 뜨면 컷신의 여운이 끊긴다. 살짝 어둡게 눌러 카드 글자 가독성 확보.
  if (run && run.clearBackdrop && state === 'map') {
    if (drawCutsceneBackdrop(ctx, LOGICAL_W, logicalH, 0.22)) { ctx.restore(); return; }
    run.clearBackdrop = false;
  }
  // 섹터 클리어 컷신 = 전체화면 일러스트. 게임 화면·HUD를 전부 대체한다(이사).
  if (run && run.phase === 'cutscene' && run.cut) {
    if (drawCutscene(ctx, run.cut, LOGICAL_W, logicalH, run.effects)) { ctx.restore(); return; }
    run.cut = null;   // 배경 이미지가 없으면 컷신 포기 → 아래 인게임 렌더로 폴백
  }

  // 6구역 × 3층 절차적 배경: 해상도·화면비에 무관하고 이미지 타일 이음새가 없다.
  const scroll = run ? run.scrollY : performance.now() * 0.02;
  // 추적 시점 전진감(이사): "아래로 흐르는" 층(세로 별 + 배경 먼지·삼각 파편·항적)은 blend 비례로 소등하고
  //  소실점 방사 워프 별로 교체(drawChaseBackdrop 옆). 성운 플레이트는 원경이라 유지.
  const warpB = state === 'play' && run ? chase.current : 0;
  zoneBackdrop.draw(ctx, logicalH, scroll, run ? run.sector : save.get().stage, 1 - warpB);
  if (warpB < 0.999) {
    if (warpB > 0.001) ctx.globalAlpha = 1 - warpB * 0.9;
    starfield.draw(ctx, logicalH, scroll);
    if (warpB > 0.001) ctx.globalAlpha = 1;
  }

  // 트랙 레인 가이드 (희미한 세로선)
  ctx.strokeStyle = 'rgba(63,245,224,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LOGICAL_W / 2, 0);
  ctx.lineTo(LOGICAL_W / 2, logicalH);
  ctx.stroke();

  if (run) {
    const r = run;
    // ── 전투 카메라 변환 시작 ──: state==='play'일 때만 함대(anchor)를 중심으로 확대/축소한다.
    //  배경·HUD·컷신·시네마 띠·전체 화면 플래시는 이 변환 밖(고정). 게임 좌표·규칙은 그대로.
    const camActive = state === 'play' && camera.current !== 1;
    syncCameraAnchor();   // §3: 그릴 시점의 최신 함대 좌표로 카메라 기준점 재동기화(방어적)
    // 2.5D: chaseBlend>0이면 개체별 원근 투영 경로, 아니면 기존 전술(global transform) 경로(100%~160% 픽셀 동일).
    const useChase = state === 'play' && chase.current > 0.001;
    let chaseProj = null;
    // Opus5 하이브리드(§9): 적·보스·게이트·픽업·총알·이펙트·드론은 "전 구간" RC2 로 계속 그린다.
    //  3D 는 AURORA 기함 1척만 — 기함 본체는 2D alpha 1-t ↔ 3D alpha t 로 진짜 교차(§9.2). t=0 이면 기존 RC2 와 동일.
    if (useChase) {
      chaseProj = createChaseProjection({ zoom: camera.current, chaseBlend: chase.current, squadX: r.squad.x, squadY: r.squad.y, logicalW: LOGICAL_W, logicalH });
      // 소실점 방사 워프 별(전진 3D 감, 이사) — 항로선·글로우(drawChaseBackdrop)보다 아래 층에.
      drawWarpField(ctx, { W: LOGICAL_W, H: logicalH, cx: chaseProj.centerX, cy: chaseProj.horizonY, blend: chase.current, travel: scroll * 0.00115 });
      drawChaseBackdrop(ctx, chaseProj, chase.current);   // 배경 전진감(chaseBlend 비례)
      // 기함 스왑 최종형(이사 3회 지적): "겹침 0·공백 0" 하드 컷 — 2D 는 t<0.5 에서 완전 불투명, t≥0.5 에서 완전 소등.
      //  페이드 금지: 중간 반투명이 "함선 소멸 계곡"과 "반투명 두 척"을 만들었다. 스왑 팝은 워프 플래시(noteSwap)가 가린다.
      //  B1 실전(이사 승인): 3D 로 올라간 소형 B1(비변이)은 같은 하드 컷 규칙으로 2D 를 스킵 — 변이·초과분은 2D 유지.
      drawWorldProjected(ctx, r, chaseProj, {
        drawEntity: drawEntityFaded, drawBoss: drawBossFaded, drawCampaignFleet,
        flagshipAlpha: t3d < 0.5 ? 1 : 0,
        hideEscorts: t3d >= 0.5,                   // §G-1: 드론·순양함 본체는 3D 로(HP바·플래시 링은 2D 유지)
        skipEntity: t3d >= 0.5 ? _isB13D : null,   // 크리처·픽업·탄 — 이번 프레임 3D 로 올라간 개체만 스킵(스탬프)
      });
    } else {
      if (camActive) {
        ctx.save();
        ctx.translate(camera.anchorX, camera.anchorY);
        ctx.scale(camera.current, camera.current);
        ctx.translate(-camera.anchorX, -camera.anchorY);
      }
      // 상단 진입 페이드: 개체가 화면 위 경계(y=0)를 넘어 들어올 때 딱딱하게 '잘려' 보이지 않도록(전술 경로).
      for (const e of r.world.entities) drawEntityFaded(ctx, e);
      if (r.bosses && r.bosses.length && r.phase !== 'track') {
        for (const b of r.bosses) drawBossFaded(ctx, b);
      }
      for (const b of r.world.bullets) b.draw(ctx);
      for (const b of r.world.enemyBullets) b.draw(ctx);
      if (!r.squad.dead) r.squad.draw(ctx);
      if (r.campaign25) drawCampaignFleet(ctx);   // §7.2 전투기 편대(기함 위에 렌더)
      r.effects.drawWorld(ctx);                   // 월드 이펙트(파티클·텍스트·링·섬광·후광)는 카메라 안에서 함께 확대
      if (camActive) ctx.restore();               // ── 전투 카메라 변환 종료 ──
    }
    r.effects.drawScreen(hctx, LOGICAL_W, logicalH);   // 전체 화면 흰색 플래시는 카메라 '밖'(고정). 3D 활성 시 HUD 계층(#game-hud)로.
    if (chaseProj) drawEdgeWarnings(hctx, r, chaseProj);   // §9: 화면 밖 위험 경고(월드 위·HUD 아래)
    drawSwapFlash(hctx);   // 기함 2D↔3D 스왑 워프 플래시(월드 위·HUD 아래) — 형태 교체 순간을 섬광으로 은폐
    drawImpactFlash(hctx); // 기함 충돌 섬광(적 몸체·적탄이 내구도를 지불한 순간 — 기수 충격파)
    if (t3d >= 0.5) drawPropLabels(hctx);   // 3D 픽업의 정보 라벨(+N·▲N·무기명) — 게임 정보는 잃지 않는다

    // 섹터 클리어 컷신: 위아래 시네마 띠. 격침되는 보스를 두고 기함이 빠져나가는 구간을
    // 전투 화면과 다르게 보이게 한다(이사 요청). HUD보다 먼저 그려 HUD가 띠 위에 남게.
    if (r.cinemaT > 0) {
      const bh = logicalH * BAL.bossDeath.letterbox * Math.min(1, r.cinemaT);
      hctx.save(); hctx.fillStyle = 'rgba(2,4,10,0.92)';
      hctx.fillRect(0, 0, LOGICAL_W, bh);
      hctx.fillRect(0, logicalH - bh, LOGICAL_W, bh);
      hctx.restore();
    }

    const evc = r.world.mfx?.evolveCostMult ?? 1;
    const maxTier = BAL.evolution.names.length - 1;
    const needCruisers = r.squad.tier < maxTier ? Math.max(1, Math.round(cruisersNeededForTier(r.squad.tier, BAL.escort) * evc)) : 0;   // 등급별 필요 순양함(초반 저렴)
    drawHUD(hctx, LOGICAL_W, {
      progress: Math.min(1, r.traveled / r.totalTrack),
      bosses: r.phase === 'boss' ? r.bosses.map((b) => ({ hp: Math.max(0, b.hp), maxHp: b.maxHp, name: EN ? (bossDefById(b.spriteId)?.name || b.korName) : b.korName, dead: b.dead, stagger: b.stagger, staggerMax: BAL.neonArbiter.staggerMax, breakT: b.breakT })) : [],
      count: r.squad.count,
      cruisers: r.squad.cruisers || 0,
      tierName: EN
        ? PLAYTEST_SHIP_TRAITS_EN[Math.min(r.squad.tier, PLAYTEST_SHIP_TRAITS_EN.length - 1)]
        : BAL.shipTraits[Math.min(r.squad.tier, BAL.shipTraits.length - 1)].tag,
      shipName: BAL.evolution.names[Math.min(r.squad.tier, BAL.evolution.names.length - 1)],
      doctrine: doctrineIcon(r.squad.doctrine),
      tierPower: Math.round(r.squad.banked || 0),
      upgradeCur: r.squad.cruisers || 0,   // 기함 업그레이드까지 모은 순양함
      upgradeMax: needCruisers,            // 필요한 순양함 (0 = 최종 티어)
      scheduledTier: !!r.campaign25,       // 캠페인=시간 스케줄 승급 → 순양함 게이지 숨김(오해 방지)
      stage: r.sector,
      coins: Math.round(r.world.coins),    // 이번 출격에서 수거한 코인(HUD 표시)
      weapon: r.squad.weapon,
      weaponLv: r.squad.weaponLv,
      weaponEvo: weaponEvoLabel(r.squad),
      shield: r.squad.shield || (r.squad.surv && r.squad.surv.shield > 0),   // ⛨ 표시: surv.shield(경로 보호막)도 반영(Codex G2-D P2)
      modules: moduleSummary(r.modules),
      logicalH,
      flow: r.squad.flow || 0,
      flowMax: BAL.flow.max,
      rushT: r.squad.rushT || 0,
      keystoneIcon: keystoneIcon(r.squad.keystone),
      loadoutHud: !!r.squad.surv,   // 좌측 무기 2슬롯이 뜨는 모드 = 우상단 무기 표기 중복 → 생략(이사)
      en: EN,                 // Prolific: HUD 핵심 정보를 영어로(§4.3). 일반 모드는 false → 한국어 그대로.
    });
    // 섹터 원정 적재 HUD — 25분과 같은 내구도 바 + 무기 2슬롯(빈 보조 슬롯 표시) + 공명(이사 요청).
    //  섹터엔 디렉터 타이머·함대·프레임이 없으므로 전용 함수로 그 셋만 뺀다.
    if (!r.coreLoop && !r.campaign25 && r.squad.surv) {
      const sq = r.squad;
      drawSectorLoadoutHud(hctx, LOGICAL_W, logicalH, {
        hullFrac: hullFrac(sq.surv), hull: sq.surv.hull, hullMax: sq.surv.hullMax,
        mainWeapon: sq.weapon, mainLv: sq.weaponLv, wingWeapon: sq.wing.weaponId, wingLv: sq.wing.level,
        mainEvo: weaponEvoLabelFor(sq, sq.weapon), wingEvo: weaponEvoLabelFor(sq, sq.wing.weaponId),
        resonanceName: sq.reson?.activeId ? RESONANCES[sq.reson.activeId].name : '',
        resonanceHint: sq.reson?.activeId ? RESONANCES[sq.reson.activeId].hint : '',
        markType: sq.reson?.activeId ? RESONANCES[sq.reson.activeId].trigger === 'mark' : false,
        resonanceFrac: sq.reson ? resonChargeFrac(sq.reson, BAL.gate1.resonance) : 0,
        en: EN,   // Prolific: 섹터 적재 HUD(내구도·무기 슬롯·공명)를 영어로(§4.3)
      });
    }
    // Gate 1 코어루프 / Gate 2 25분 캠페인 HUD (내구도·두 무기·공명·프레임·타이머). 둘 다 surv·director를 가진다.
    const cl = r.coreLoop || r.campaign25;
    if (cl && r.squad.surv) {
      const sq = r.squad;
      const nx = nextEvent(cl.director);
      const evLabel = { behaviorUpgrade: '무기 강화', secondWeapon: '보조 무기', hullTier: '함체 승급', resonanceTelegraph: '공명 예고', firstResonance: '공명 완성', framePick: '지휘 프레임', eliteWave: '정예 웨이브', bossStart: '지역 보스', result: '결과',
        regionEnter: '지역 진입', fleetTelegraph: '슬롯 예고', fleetSlot: '함대 슬롯', secondResonance: '두번째 공명', finalWeaponEvo: '최종 진화', apex: 'Apex', pathChoice: '경로 선택' };
      const fh = sq.frameId ? frameHud(BAL.gate1.frames, sq.frameId) : null;
      drawCoreLoopHud(hctx, LOGICAL_W, logicalH, {
        hullFrac: hullFrac(sq.surv), hull: sq.surv.hull, hullMax: sq.surv.hullMax,
        mainWeapon: sq.weapon, mainLv: sq.weaponLv, wingWeapon: sq.wing.weaponId, wingLv: sq.wing.level,
        mainEvo: weaponEvoLabelFor(sq, sq.weapon), wingEvo: weaponEvoLabelFor(sq, sq.wing.weaponId),
        fleetSupported: !!r.campaign25,   // 함대 슬롯은 Gate 2 캠페인 전용 — Gate 1 공유 HUD엔 표시 안 함(Codex P3)
        fleetActive: !!(sq.fleet && sq.fleet.active), fleetLabel: BAL.gate2.fleet.label, fleetCount: sq.fleet?.ships?.length || 0,
        fleetColor: BAL.gate2.fleet.color, fleetTelegraph: !!cl.fleetTelegraph,   // §7.2 세 번째 슬롯 HUD 구분
        resonanceName: sq.reson.activeId ? RESONANCES[sq.reson.activeId].name : (cl.telegraph ? RESONANCES[cl.build.resonance]?.name : ''),
        pending: !sq.reson.activeId && !!cl.telegraph,   // 아직 해금 전 예고 — 충전 0%가 아니라 '곧 해금'으로 표기
        resonanceFrac: resonChargeFrac(sq.reson, BAL.gate1.resonance),
        resonanceHint: sq.reson.activeId ? RESONANCES[sq.reson.activeId].hint : '',
        markType: sq.reson.activeId ? RESONANCES[sq.reson.activeId].trigger === 'mark' : false,
        frameIcon: fh?.icon || '', frameGlow: fh?.glow || '', frameName: fh?.name || '',
        dirT: elapsed(cl.director), totalSec: r.campaign25 ? BAL.gate2.totalSec : 480,   // 캠페인=25:00, Gate 1=8:00(Codex 홀리스틱)
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
  if (paused) {
    ui.showPause({
      onResume: togglePause, onQuit: PLAYTEST ? null : quitRun, lang: LANG,
      cameraZoom: camera.target,                          // §8: 카메라 배율 행(−[100%]+)
      onZoomOut: () => applyZoom(-1), onZoomReset: () => applyZoom(0), onZoomIn: () => applyZoom(+1),
      chaseView: isChaseTargetView(),                     // §8.2: 함미 추적 시점 토글 버튼(모바일 진입/복귀)
      onToggleChase: () => toggleChaseView(),
    });
    // 일시정지 열려 있는 동안 배율%·추적 버튼 문구를 즉시 갱신(닫히면 no-op로 복귀).
    updatePauseCameraUI = () => {
      const el = document.getElementById('btn-zoom-reset'); if (el) el.textContent = `${Math.round(camera.target * 100)}%`;
      const cb = document.getElementById('btn-chase-view');
      if (cb) { const on = isChaseTargetView(); cb.textContent = on ? (EN ? 'Tactical View' : '전술 시점') : (EN ? 'Pursuit View' : '함미 추적 시점'); cb.setAttribute('aria-label', on ? (EN ? 'Switch to tactical view' : '전술 시점으로 전환') : (EN ? 'Switch to pursuit view' : '함미 추적 시점으로 전환')); }
    };
  } else { ui.hide(); updatePauseCameraUI = () => {}; }
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
pauseBtn.title = EN ? 'Pause (ESC)' : '일시정지 (ESC)';
pauseBtn.setAttribute('aria-label', EN ? 'Pause' : '일시정지');   // 접근 가능 이름(§4.3): 이모지 버튼은 aria-label로 이름을 준다
pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
document.getElementById('stage').appendChild(pauseBtn);

// 차지 버튼 (모바일: 홀드로 충전. 데스크톱은 마우스 좌클릭으로도 충전 가능)
const chargeBtn = document.createElement('button');
chargeBtn.id = 'charge-btn';
chargeBtn.textContent = '⚡';
chargeBtn.title = EN ? 'Charge shot (hold)' : '차지 샷 (길게 누르기)';
chargeBtn.setAttribute('aria-label', EN ? 'Charge shot (hold)' : '차지 샷');   // 모바일 전용 버튼 접근 가능 이름(§4.3)
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
let _frameErrLogged = false;
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  // 카메라 배율 보간(매 프레임 — 일시정지 중에도 애니메이션되어 뒤 월드가 미리보기됨). reduced-motion이면 즉시.
  camera.current = advanceZoom(camera.current, camera.target, dt, prefersReducedMotion());
  // 2.5D 추적 blend는 현재 줌 기준으로 별도 ease-out(§3.3). 줌과 정렬돼 튀지 않음. 처음 완전 진입 시 안내.
  chase.target = chaseBlendForZoom(camera.current);
  const _prevChase = chase.current;
  chase.current = advanceChaseBlend(chase.current, chase.target, dt, prefersReducedMotion());
  if (_prevChase < 0.99 && chase.current >= 0.99) showPursuitIndicator();
  playtestTick(dt);   // Prolific 240초 전투시간(§4.2)
  // update/draw에서 예외가 나도 rAF 재예약은 반드시 한다 → 한 프레임 오류가 게임을 영구 정지시키지 않게(회복형 루프).
  try {
    if (!paused && !drafting && !betweenStages) update(dt);   // 일시정지·드래프트·요약 중엔 화면만 유지
    draw();
  } catch (e) {
    if (!_frameErrLogged) { console.error('[네온 함대] 프레임 처리 중 예외 — 무시하고 계속:', e); _frameErrLogged = true; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 아트 스타일: 페인티드 메탈(C)로 고정. 세라믹/카툰은 디자인 확정 전까지 숨김
// (스타일 인프라는 유지 — 새 스타일이 생기면 styleNames를 다시 넘겨 선택 UI 복원)
setArtStyle('C');
// ── 밸런스 튜너 오버라이드 (tuner.html에서 저장한 값) ──
// 원본 balance.js/sprites.js는 그대로 두고 값만 덮어쓴다. 게임 코드가 BAL을 읽을 때마다
// 참조하므로 다음 스폰·다음 발사부터 바로 먹는다. 크기(SPRITE_SIZES)만 캐시를 비우고 다시 로드해야 한다.
function applyTuning(patch, { reloadArt = false } = {}) {
  const a = applyFlat(BAL, patch.bal);
  const b = applyFlat(SPRITE_SIZES, patch.sprite);
  const changedArt = b.applied > 0;
  if (changedArt && reloadArt) { invalidateSpriteCache(); preloadStyle(); }
  return { bal: a.applied, sprite: b.applied, skipped: [...a.skipped, ...b.skipped], changedArt };
}
const _tuning = applyTuning(loadPatch());
if (_tuning.bal || _tuning.sprite) console.info(`[튜너] 적용 ${_tuning.bal}개(밸런스)·${_tuning.sprite}개(크기)`);
// 튜너 탭에서 저장하면 새로고침 없이 즉시 반영 (같은 출처라 storage 이벤트가 온다)
subscribePatch((p) => {
  const r = applyTuning(p, { reloadArt: true });
  run?.effects?.text?.(LOGICAL_W / 2, 90, `튜너 적용 · ${r.bal + r.sprite}개`, COLORS.reward, 14);
  console.info('[튜너] 실시간 적용', r);
});

preloadStyle();

/**
 * P0-C: 타이틀로 돌아갈 때 이전 전투 상태를 완전히 종료한다.
 *  draw()의 전투 개체·보스·HUD는 전부 `if (run)` 안에 있으므로 run=null이면 잔상이 남지 않는다
 *  (CSS로 가리거나 캔버스를 숨기지 않는다 — 상태를 실제로 비운다).
 *  코인 정산은 하지 않는다: 이미 endExpedition/winCampaign에서 r.settled로 1회 끝났다.
 *  여러 진입 경로(첫 로드·인트로 후·결과→격납고→뒤로·타이틀→격납고→뒤로·일시정지 끝내기·초기화)가
 *  같은 정리를 공유하도록 한 곳에 모은다.
 */
function resetToTitleState() {
  state = 'title';
  run = null;
  drafting = false;
  betweenStages = false;
  paused = false;
  if (input) { input.active = false; input.charging = false; input.clearSkip?.(); }
}

/** 프롤로그 재생 + 분석 배선(intro_started·intro_skipped/completed). intro.js는 콜백만 받는다. */
function playIntroTracked(after) {
  playIntro(
    (reason, meta) => { track.introEnded(reason, meta); after(); },
    { onStart: () => track.introStarted() },
  );
}

/** P0-3: 포털 전투 진입 시 비차단 조작 힌트(전투 위 오버레이). 실제 입력(키/클릭/탭) 또는 8초 후 사라진다.
 *  전체화면 차단 가이드를 대체 — 포털 방문자는 즉시 플레이하러 온다. */
let _portalHintShown = false;
function showPortalHint() {
  if (_portalHintShown) return;   // 원정당 1회(재도전마다 반복 표시 안 함)
  _portalHintShown = true;
  const stage = document.getElementById('stage');
  if (!stage) return;
  const el = document.createElement('div');
  el.id = 'portal-hint';
  el.setAttribute('role', 'status');
  el.textContent = 'Move: Mouse · ◀ ▶ · A / D      Fire: Auto      Charge: Hold Click / Space';
  el.style.cssText = 'position:absolute;left:50%;bottom:12%;transform:translateX(-50%);'
    + 'padding:8px 16px;border-radius:8px;z-index:40;pointer-events:none;white-space:nowrap;'
    + 'font:600 14px Pretendard,sans-serif;color:#dbeafe;background:rgba(8,12,24,0.72);'
    + 'border:1px solid rgba(120,180,255,0.35);box-shadow:0 2px 18px rgba(0,0,0,0.5);'
    + 'transition:opacity .5s;opacity:1;max-width:92vw;overflow:hidden;text-overflow:ellipsis;';
  stage.appendChild(el);
  let done = false;
  const remove = () => {
    if (done) return; done = true;
    clearTimeout(timer);
    window.removeEventListener('keydown', remove, true);
    window.removeEventListener('pointerdown', remove, true);
    window.removeEventListener('touchstart', remove, true);
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 520);
  };
  const timer = setTimeout(remove, 8000);   // 실제 입력이 없어도 8초 후 사라짐
  // 힌트를 띄운 그 클릭/탭이 곧바로 힌트를 지우지 않도록 잠깐(250ms) 뒤부터 입력을 감지 → 다음 실제 입력에 소거.
  setTimeout(() => {
    if (done) return;
    window.addEventListener('keydown', remove, true);
    window.addEventListener('pointerdown', remove, true);
    window.addEventListener('touchstart', remove, true);
  }, 250);
}

/** P0-3: 포털 시작 흐름 — 타이틀·스토리 인트로 없이 곧바로 시작 무기 3택(첫 화면). 카드 클릭 하나가
 *  '선택 + 출격'이고 enterSectorMap 포털 분기가 즉시 전투로 넣는다. 포털의 '홈'은 이 무기 선택 화면이다. */
function startPortalPlay() {
  resetToTitleState();
  _portalHintShown = false;   // 새 출격(첫 진입·이탈 복귀)마다 힌트 자격 초기화 — 재도전엔 재노출 안 함
  document.documentElement.lang = 'en';
  document.title = 'Neon Fleet';
  startPlay();
}

function showTitleScreen() {
  if (PORTAL_MODE) { startPortalPlay(); return; }   // 포털엔 한국어 타이틀 없음 — 모든 '타이틀 복귀'는 포털 홈(무기 선택)으로
  resetToTitleState();
  const d = save.get();
  ui.showTitle({
    best: d.best,
    stage: d.stage,
    coins: d.coins,
    saveOk: save.available,
    endlessUnlocked: d.endlessUnlocked,      // 무한 원정 해금 시에만 버튼 표시(§6.5)
    endlessBest: d.endlessBest,
    onStart: () => { if (!ANALYTICS_DEV) track.expeditionStartSelected('campaign'); startPlay(); },
    // 이 값만 true로 되돌리면 25분 캠페인 버튼이 다시 나온다(아래 SHOW_CAMPAIGN25_ENTRY 참고).
    onCampaign25: SHOW_CAMPAIGN25_ENTRY ? () => startCampaign25({ mode: 'play', pick: true }) : null,
    onEndless: d.endlessUnlocked ? () => { if (!ANALYTICS_DEV) track.expeditionStartSelected('endless'); startEndless(); } : null,
    onHangar: () => showHangar('title'),
    onIntro: () => playIntroTracked(showTitleScreen),
    onReset: () => ui.showResetConfirm({
      onConfirm: () => { save.reset(); showTitleScreen(); },
      onCancel: showTitleScreen,
    }),
  });
  track.titleViewed();          // 분석: 타이틀 전환당 1회
  maybeShowConsentBanner();     // 미결정이고 측정 ID가 있으면 동의 배너(비차단)
}

// 포털이면 곧바로 무기 선택(첫 화면). Prolific이면 영어 동의 화면. 그 외 일반 게임은 첫 접속 인트로/저장 그대로(§3·§4.1).
if (PORTAL_MODE) {
  startPortalPlay();
} else if (PLAYTEST) {
  startPlaytestFlow();
} else if (save.get().introSeen) {
  // 첫 접속이면 인트로 크롤 재생 후 타이틀, 그 외엔 바로 타이틀
  showTitleScreen();
} else {
  save.set({ introSeen: true });
  playIntroTracked(showTitleScreen);
}

// 개발/검증용 훅 (게임 동작에는 영향 없음)
window.__NF = {
  get state() { return state; },
  get run() { return run; },
  input,
  startPlay,
  camera,                                   // 카메라 상태(current/target/anchor) — QA 관측용
  chase,                                     // 2.5D 추적 blend 상태(current/target) — QA 관측용
  get chaseProjection() { return chaseProjection; },   // 현재 프레임 투영(입력 역변환·렌더 공유)
  zoom: applyZoom,                          // dir: +1 확대 / -1 축소 / 0 초기화
  toggleChase: toggleChaseView,             // QA: 100% ↔ 220% 함미 추적 토글
  setZoomTarget(v) { camera.target = safeZoom(v); },   // QA: 목표 배율 직접 지정(보간은 frame이 진행)
  // 헤드리스 검증용: rAF 없이 시뮬레이션을 n프레임 전진 (탭이 hidden이어도 동작)
  step(frames = 1, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) update(dt);
    draw();
  },
  chase3dInfo: () => (chase3d && chase3d.info ? chase3d.info() : null),   // Codex 4단계: 최신 통합 계측용(실게임 hero 진단)
  // QA: 카메라·chaseBlend 보간을 rAF 없이 n프레임 전진(frame 루프 재현)
  stepCamera(frames = 1, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) {
      camera.current = advanceZoom(camera.current, camera.target, dt, prefersReducedMotion());
      chase.target = chaseBlendForZoom(camera.current);
      chase.current = advanceChaseBlend(chase.current, chase.target, dt, prefersReducedMotion());
    }
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
    // G2-F 전체 파이프라인 통합: B(함체 T5)·C(함대)·D(경로)·E(정예/지역) 전부 25분 안에 실동작.
    const dw = s.damageByWeapon || {};
    add('§7.3 함체 T5 도달(H1~H5 5회 승급)', (s.hullTierTimes || []).length === 5 && s.finalTier >= 5, `tier ${s.finalTier}, 승급 ${(s.hullTierTimes || []).length}`);
    add('§7.3 T4 측면 포대 실피해', dw.sideGun > 0, Math.round(dw.sideGun || 0));
    add('§7.3 T5 Apex 실피해', dw.apex > 0, Math.round(dw.apex || 0));
    add('§7.2 세 번째 슬롯 해금 + 함대 실피해', s.fleetSlotSec != null && dw.fleet > 0, `@${s.fleetSlotSec}s · ${Math.round(dw.fleet || 0)}`);
    add('§7.4 경로 선택 5회 적용', s.pathChoicesMade === 5, s.pathChoicesMade);
    add('§7.5 정예 웨이브 발동', s.eliteWavesFired >= 1, s.eliteWavesFired);
    const pass = checks.every((c) => c.ok);
    return { pass, failed: checks.filter((c) => !c.ok).map((c) => c.name), checks };
  },
};
