// rush3/main.js — 셸(계약서 6장). 규칙은 combat.js 가 전부 갖고 여기는 결선·연출·상태기계만.
//  ⚠️모듈 상단에서 DOM 을 만지지 않는다 — Node 테스트가 hitButton/makeLoop 를 그대로 import 한다.
//  rush/main.js 는 import 하지 않는다(자동 부트가 같은 캔버스에 붙는다). 골격(hitButton/toLogical/spawnBurst/
//  autoPause/오디오 unlock/ESC/음량 버튼/로드 후 루프 시작/#game3 가드)만 참고해 옮겨 적었다.
import { BAL3, DIFFICULTY_IDS, DEFAULT_PICK_DIFFICULTY } from './balance.js';
import { STAGE_IDS, ALL_STAGE_IDS, PROTO_IDS, buildStage, stageMeta, stageVersion } from './stages.js';
import { WEAPONS } from './weapons.js';
import { createRun, stepRun, drainEvents, STEP } from './combat.js';
import { createInput, isSteerKey } from './input.js';
import { createRenderer3, isTrapGateRow, HUD_ROW, ZOOM } from './render.js';
import { loadSprites3, sheetSec } from './sprites.js';
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
//  타이틀 스테이지 목록(24스테이지·B-2): 2열×4행 = 8칸/페이지, 첫 칸 x 60~236·y 446~500. 페이지 줄은 그 아래(694)
export const TITLE_GRID = Object.freeze({ y: 446, dy: 60, h: 54, pageY: 694, perPage: 8 });
//  ⏸(일시정지) 버튼 = HUD 상단 줄의 셋째 칸. 상자는 render 의 자리표(HUD_ROW.box.pause) 하나에서만 온다 —
//  이 객체가 **히트 영역이자 그려지는 상자**다(`hud: true` 라 drawButtons 는 건너뛰고 drawHud 가 같은 상자로 그린다).
//  ⚠️여기에 좌표를 직접 적지 말 것. 적는 순간 화면의 칩과 누르는 자리가 조용히 어긋난다(2026-09-18 HUD 정돈).
export const HUD_BTN = Object.freeze({ id: 'pause', ...HUD_ROW.box.pause, label: '❚❚', hud: true });
//  키 1/2/3 = 보통/어려움/지옥(타이틀에서만). code 가 비어 오는 환경은 key 로 대신하므로 둘 다 받는다
const DIFF_KEYS = Object.freeze({ Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2, 1: 0, 2: 1, 3: 2 });
//  셔터 안내 문구(계약서 6장 N2-③⑥ · 2026-09-17 2차 검수). 닫힌 동안 → 처음 열릴 때 → 첫 조우 배너 순으로 이어진다
export const GATE_TIP_CLOSED = '가까워지면 열림';
export const GATE_TIP_OPEN = '지금 쏘면 +1';
//  확정 손실 행은 열려도 값이 오르지 않는다 — 같은 화면의 '확정' 꼬리표와 어긋나지 않게 전용 문구를 쓴다(2026-09-17 수정 라운드 1)
export const GATE_TIP_OPEN_FIXED = '쏴도 그대로예요';
//  배너는 두 줄이다 — 한 줄로 쓰면 480px 화면을 넘어 양끝이 잘린다(2026-09-17 렌더 실측). 줄은 **어절 경계**에서만 나눈다
export const SHUTTER_GUIDE_TEXT = Object.freeze(['회색 셔터는 잠긴 게이트예요', '가까워지면 열리고 그때부터 숫자가 오릅니다']);
//  첫 차량 통 조우 배너(r3.13). 셔터 배너와 같은 슬롯(fx.shutterText/shutterT)을 쓰고 사용자당 1회(저장 seenVehicle). 줄은 어절 경계에서만 나눈다
export const VEHICLE_GUIDE_TEXT = Object.freeze(['움직이는 통은 앞을 보고 쏘세요', '통이 갈 자리에 미리 서면 탄이 거기서 만납니다']);
//  작전 목표 배너(r3.14 구출 캡슐): 출격 직후 판당 1회(fx.objText/objT, BAL3.fx.objectiveBannerSec). 셔터 배너 아래 슬롯에 쌓인다. 줄은 어절 경계에서만 나눈다
export const OBJECTIVE_BANNER_TEXT = Object.freeze(['작전 목표: 캡슐 구출', '놓쳐도 실패는 아닙니다']);
//  아레나 안내 배너(r3.17): 광장 전환 시 판마다 1회(fx.arenaText/arenaT, BAL3.fx.arenaGuideSec). 슬롯 C(셔터·목표 아래). 줄은 어절 경계에서만 나눈다
export const ARENA_GUIDE_TEXT = Object.freeze(['드래그로 피하세요', '광장에서는 위아래로도 움직입니다']);

/** 결과 화면의 작전 목표 한 줄(r3.14). 순수 — run.objective 만 읽는다. 목표가 없는 판은 null.
 *  성공 = 실제 합류 수(n) · 그 밖(놓쳤든 닿기 전에 끝났든)은 '열지 못했다'. 승패(run.won)와는 별개다 */
export function objectiveLine(run) {
  const o = run && run.objective;
  if (!o || o.kind !== 'capsule') return null;
  return o.done ? '구출 성공 · +' + (o.n || 0) + '명' : '구출 실패 — 캡슐을 열지 못했습니다';
}

/** 결과 화면의 보너스전 한 줄(r3.15). 순수 — result.bonus { score, tier, hits, isBestBonus } 만 읽는다. 보너스가 없던 판은 null.
 *  승리·기록은 본전투 확정값이고 이 줄은 그 아래 덧붙는 별개 점수다(bestBonus 신기록은 생존 신기록 '신기록!' 과 따로 소자 표기) */
export function bonusLine(bonus) {
  if (!bonus) return null;
  return '보너스 ' + (bonus.score | 0) + '점 · 단계 ' + (bonus.tier | 0) + (bonus.isBestBonus ? ' · 신기록' : '');
}

/** 쏴도 값이 오르지 않는 행인가 = 모든 칸이 음수이고 상한이 자기 값 이하(확정 손실).
 *  랜덤 길 ⑤ `trapGate`(−10 · 상한 −10)가 여기에 해당한다 — 몇 발을 맞아도 −10 그대로다(gates.js 값 갱신 공식).
 *  ⚠️이런 행에 '지금 쏘면 +1' 을 띄우면 같은 화면에 이미 붙어 있는 '확정' 꼬리표와 정면으로 어긋나,
 *   N2 가 없애려던 '맞고 있는데 왜 숫자가 안 변하지?' 를 바로 그 행에서 새로 만든다(2026-09-17 수정 라운드 1).
 *  판정 조건은 render.js 의 '확정' 꼬리표와 같은 식이다 — 글과 꼬리표가 언제나 같은 행에 함께 뜬다. */
//  ⚠️판정식은 render.isTrapGateRow 한 곳에만 둔다 — 화면의 함정 외형과 셸의 문구가 갈라지지 않게 같은 함수를 쓴다
export const isFixedGateRow = isTrapGateRow;

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
//  무기 강화 단계 표기(HUD·플로터 공용, render.MK_LABEL 과 같은 값)
const MK_LABEL = ['', 'I', 'II', 'III'];

function makeFx() {
  //  gateFlash: { 'rowId:idx': 남은 초 } · gateOpen: { rowId: 남은 초 }(셔터가 걷히는 연출) — 렌더가 이것만 읽는다
  //  gateTip: { rowId: { text, t } } 짧은 안내 글 · gateTipSeen: 닫힘 안내를 이미 띄운 행 · shutterT/shutterText = 첫 조우 배너
  //  lotOpen = 랜덤 길 '?' 상자가 걷히는 연출 타이머 · lotSeen = 공개 효과음 1회 · lotSame = 랜덤 길 무기가 동급이라 교체 안 된 판
  return { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, gateTipSeen: {},
           shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, burstSeed: 0, sfx: [], fireCount: 0, fireWeapon: null,
           lotOpen: 0, lotSeen: false, lotSame: false,
           //  vehicleTipSeen(r3.13) = 이 판에서 차량 통이 처음 화면에 들어온 것을 이미 처리했는가(배너는 저장 seenVehicle 로 사용자당 1회)
           vehicleTipSeen: false,
           //  objT/objText(r3.14) = 출격 직후 작전 목표 배너(startRun 이 판당 1회 세우고 updateFx 가 줄인다 — 다른 곳은 켜지지 않는다)
           objT: 0, objText: null,
           //  bonusT/bonusText(r3.15) = 보너스전 시작 배너 '보너스전! N초'(bonusStart 이벤트가 세우고 updateFx 가 줄인다). 슬롯 A(y196)
           bonusT: 0, bonusText: null,
           //  eliteText(r3.16 복수 정예) = 정예 경고 배너 문구('정예 접근!' / '정예 2체 접근!') · bossBannerT/bossBannerText = 처치 배너
           //   '정예 N 격파 — 남은 목표 M'(bossesLeft 이벤트가 left > 0 일 때 세우고 updateFx 가 줄인다). 슬롯 A(y196)
           eliteText: null, bossBannerT: 0, bossBannerText: null,
           //  아레나(r3.17): arenaOpen = 광장 열림 연출 남은 초 · arenaT/arenaText = '드래그로 피하세요' 배너 · shocks = 착지 충격 링 [{ x, y, r, t, life }](화면 좌표)
           arenaOpen: 0, arenaT: 0, arenaText: null, shocks: [],
           //  동작 시트 타이머(6장): heroFire = 사격 시트 남은 초 · heroWalk = 마지막 사격 뒤 걸은 초 · enemyHit = { id: 피격 시트 남은 초 } · corpses = 쓰러진 잡졸
           heroFire: 0, heroWalk: 0, enemyHit: {}, corpses: [] };
}

//  쓰러진 잡졸 등록(kill·touch 공통). 규칙은 이미 enemies 에서 뺐으므로 위치만 셸이 기억한다
function addCorpse(fx, ev) {
  if (ev.kind !== 'grunt') return;
  delete fx.enemyHit[ev.id];
  fx.corpses.push({ x: ev.x, z: ev.z, t: 0, h: BAL3.enemies.grunt.r * 2.4 });
  if (fx.corpses.length > FX.corpseCap) fx.corpses.shift();
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
  if ((run.lossByShock || 0) > 0) parts.push('충격 손실 ' + run.lossByShock);
  return parts.length ? parts.join(' · ') : '놓친 것 없음';
}

/** 랜덤 길 **실제 결과** 집계용 빈 그릇(계약서 3-9 · 2026-09-17 2차 검수 N4).
 *  추첨 종류의 이름(label)만으로는 "−15 게이트를 0 으로 막아 손실 0" 인 판과 "10명을 잃은" 판이 같은 문구로 나온다.
 *  그래서 규칙 계층이 이미 내는 이벤트(gatePass·joinMany·padTake·weaponSwap·weaponSame)를 셸이 모아 둔다. */
export function emptyLotteryOutcome() {
  return { passed: false, value: 0, applied: 0, soldiers: 0, pads: 0, padsTotal: 0, swapped: false, same: false, mk: 0 };
}

/** 이벤트 한 묶음을 랜덤 길 결과에 누적한다(순수 — out 을 고쳐 돌려준다).
 *  ⚠️규칙 모듈은 lottery 를 모른다(V3-LOTTERY LOT-8 정적 검사). 어느 이벤트가 랜덤 길의 것인지는 여기서 id 로 가린다.
 *  무기 통은 이벤트에 id 가 없으므로 '랜덤 길이 무기 통이고 이미 공개된 뒤'라는 조건으로 가린다(fx.lotSame 과 같은 규칙). */
export function collectLotteryOutcome(out, events, run) {
  const lot = run && run.lottery;
  if (!out || !lot) return out;
  const weaponHere = () => lot.kind === 'weapon' && run.z >= lot.revealZ;
  for (const ev of events) {
    if (ev.type === 'gatePass' && ev.id === lot.rowId) {
      out.passed = true;
      out.value = ev.value;
      out.applied = ev.applied;
    } else if (ev.type === 'joinMany' && ev.id === lot.supplyId) {
      out.soldiers += ev.n;
    } else if (ev.type === 'chainOn' && ev.id === lot.supplyId) {
      //  깔린 발판 수는 활성화(pads0) 뒤에도 유효탄 1발마다 늘어난다(padAdd, maxPads 까지) — 둘을 함께 세야 '몇 개 중 몇 개'가 맞는다
      out.padsTotal = ev.pads;
    } else if (ev.type === 'padAdd' && ev.id === lot.supplyId) {
      out.padsTotal += 1;
    } else if (ev.type === 'padTake' && ev.id === lot.supplyId) {
      out.pads += 1;
    } else if (ev.type === 'weaponSwap' && weaponHere()) {
      out.swapped = true;
    } else if (ev.type === 'weaponSame' && weaponHere()) {
      out.same = true;
    } else if (ev.type === 'weaponMk' && weaponHere()) {
      //  r3.10: 같은 무기 통 = 강화. 결과 문구는 '중복'이 아니라 '강화 · Mk n'
      out.mk = ev.mk;
    }
  }
  return out;
}

//  우측(랜덤 길)을 고른 판의 결과 문구. 집계가 없으면(옛 경로·규칙 계층 검사) 추첨 이름으로 되돌아간다
function chosenLine(run, lot, out, weaponSame) {
  const s = lot.supplyId ? (run.supplies || []).find((c) => c.id === lot.supplyId) : null;
  if (lot.kind === 'gate') {
    if (!out || !out.passed) return '랜덤 길: 꽝 ' + lot.label;
    //  쏴서 0 까지 올린 판 = 위험을 막아낸 판이다. '꽝'으로 적으면 잘한 것을 잘못 전한다
    return out.applied === 0 ? '랜덤 길: 위험 게이트 무력화 · 손실 0'
                             : '랜덤 길: 함정 피해 −' + (-out.applied) + '명';
  }
  if (s && !s.opened) return '랜덤 길: ' + lot.label + ' — 열지 못했습니다';
  if (lot.kind === 'chain') {
    //  최대치는 발판이 실제로 깔린 수(chainOn). 연속 증원은 밟아야 이득이라 '몇/몇 개'로 적는다
    const total = out && out.padsTotal ? out.padsTotal : (s ? s.pads.length : 0);
    const got = out ? out.pads : (s ? s.pads.filter((p) => p.taken).length : 0);
    return '랜덤 길: 증원 발판 ' + got + '/' + total + '개 확보';
  }
  if (lot.kind === 'weapon') {
    if (weaponSame || (out && out.same && !out.swapped)) return '랜덤 길: ' + lot.label + ' 중복 · 교체 없음';
    if (out && out.mk > 1 && !out.swapped) return '랜덤 길: ' + lot.label + ' 강화 · Mk ' + MK_LABEL[out.mk];
    return '랜덤 길: ' + lot.label + ' 획득';
  }
  const n = out && out.soldiers ? out.soldiers : null;
  return '랜덤 길: 병사 ' + (n ?? (s ? s.payload.n ?? 0 : 0)) + ' 획득';
}

/** 결과 화면의 랜덤 길 한 줄(계약서 3-9·6장). 순수 함수 — run 상태와 stage.lottery 만 읽는다.
 *  고른 판(우측 통로) = **실제로 일어난 일**(막아낸 손실·실제 피해·밟은 발판·교체 여부) · 안 고른 판 = 이번 판에 무엇이었는지 공개. */
export function lotteryLine(run, opts = {}) {
  const lot = run && run.lottery;
  if (!lot) return null;
  const chosen = ((run.wallSideLog || {})[lot.wallId] || null) === 'R';
  if (!chosen) {
    return lot.good ? '오른쪽 랜덤 길은 이번 판엔 ' + lot.label + ' 이었습니다'
                    : '오른쪽 랜덤 길은 이번 판엔 꽝(' + lot.label + ')이었습니다';
  }
  return chosenLine(run, lot, opts.outcome ?? run.lotteryOutcome ?? null, opts.weaponSame);
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
  //  확대 보기(화면 전용). 저장에 기억하고, 출격 중·일시정지·결과 화면에서 Z 키 또는 HUD '확대' 칩으로 토글
  let zoom = save.get().zoom === true;
  function setZoom(on) { zoom = !!on; save.patch({ zoom }); return zoom; }
  const zoomButton = () => ({ id: 'zoom', ...ZOOM.chip, label: zoom ? '확대 ●' : '확대 ○', small: true, primary: zoom });
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
  //  격리 시제품(r3.11): rush3.html?stage=proto3 — 타이틀 기본 선택이 그 시제품이 되고, 그 판은 기록에 남기지 않는다
  function devStageId() {
    try {
      const q = win && win.location && typeof URLSearchParams === 'function' ? new URLSearchParams(win.location.search) : null;
      const s = q && q.get('stage');
      if (!s) return null;
      //  시제품 id(문자) 또는 공개 스테이지 번호(4~24 포함) — 개발 확인용. 번호는 진짜 스테이지라 기록도 정상 저장된다
      if (PROTO_IDS.includes(s)) return s;
      const n = Number(s);
      return ALL_STAGE_IDS.includes(n) ? n : null;
    } catch { return null; }
  }
  function lastStageId() {
    const dev = devStageId();
    if (dev) return dev;
    const id = save.get().lastStage;
    return ALL_STAGE_IDS.includes(id) ? id : ALL_STAGE_IDS[0];
  }
  //  타이틀 스테이지 목록 페이지(8칸 = 2열×4행). -1 = 마지막으로 한 스테이지가 있는 쪽
  const TITLE_PAGE = TITLE_GRID.perPage;
  let titlePage = -1;
  const titlePages = () => Math.ceil(ALL_STAGE_IDS.length / TITLE_PAGE);
  function curTitlePage() {
    if (titlePage < 0) titlePage = Math.max(0, Math.floor(ALL_STAGE_IDS.indexOf(lastStageId()) / TITLE_PAGE));
    return Math.max(0, Math.min(titlePages() - 1, titlePage));
  }

  function startRun(id) {
    //  랜덤 길 시드는 **판마다** 다르다(계약서 3-9 = '재도전 동일 배치' 원칙의 명시적 예외).
    //   시계는 셸에만 둔다 — 규칙 계층(stages.buildStage)은 인자로 받은 시드로 mulberry32 를 한 번 돌릴 뿐이다.
    const tries = save.getStage(id, stageVersion(id), difficulty).attempts || 0;
    const lotterySeed = hashSeed('lot:' + id + ':' + tries + ':' + dateNow());
    const stage = buildStage(id, { difficulty, lotterySeed });
    //  개발 확인용 시작 무기(r3.10): rush3.html?weapon=scatter&mk=2 — 규칙엔 startWeapon/startMk 로만 들어가고, 이 판은 기록에 남기지 않는다
    const devStart = devStartWeapon();
    run = createRun(stage, devStart);
    run.devWeapon = !!devStart.startWeapon || PROTO_IDS.includes(id);
    //  랜덤 길 실제 결과 집계(계약서 3-9 결과 문구). 규칙이 아니라 셸이 갖는 칸이다 — 규칙 모듈은 lottery 를 모른다
    run.lotteryOutcome = run.lottery ? emptyLotteryOutcome() : null;
    //  기록은 stageId + 코스 버전 + 난이도로 묶는다(run.stageVersion = stage.version, run.difficulty = stage.difficulty)
    const ver = run.stageVersion, diff = run.difficulty;
    fx = makeFx();
    result = null;
    overT = -1;
    input.reset();
    //  첫 플레이 안내: 지금까지 출격 기록이 없을 때 3초
    const total = STAGE_IDS.reduce((n, s) => n + totalAttempts(s), 0);
    fx.guideT = total === 0 ? FX.guideSec : 0;
    //  작전 목표 배너(r3.14): 목표가 있는 판은 출격 직후 3초, 판당 1회. 첫 플레이 안내(y268)와 자리가 다르다
    if (run.objective && run.objective.kind === 'capsule') { fx.objText = OBJECTIVE_BANNER_TEXT; fx.objT = FX.objectiveBannerSec; }
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
    //  r3.15 검수 반영: 승리가 확정됐는데 결과 화면 전(보너스 20초 창·여운)에 ⏸→[스테이지 선택]으로 나가면 finishRun 을 거치지 않는다.
    //   본전투 기록은 'win' 프레임에 commitMain 이 이미 썼고(판당 1회), 여기서는 안전망으로 한 번 더 부른다(표식이 있으면 즉시 반환)
    if (run && run.won && !run.over) commitMain(run);
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
  function devStartWeapon() {
    try {
      const q = win && win.location && typeof URLSearchParams === 'function' ? new URLSearchParams(win.location.search) : null;
      const w = q && q.get('weapon');
      if (!w || !WEAPONS[w]) return {};
      return { startWeapon: w, startMk: Number(q.get('mk') || 1) };
    } catch { return {}; }
  }

  //  본전투 기록 확정 저장(r3.15 검수 반영): cleared·bestSurvivors·bestTime(·rescued)을 승리가 **확정되는 프레임('win' 이벤트)에 즉시** 쓴다.
  //   종전엔 결과 화면 직전 finishRun 에서만 썼는데, 보너스전이 생기면서 승리 확정 뒤 ⏸→[스테이지 선택]으로 나갈 수 있는 20초 창이 생겼고
  //   그 경로는 finishRun 없이 run = null 이라 확정된 승리가 통째로 지워졌다 — 01 §5-9 '본전투 완료는 이 시점에 확정한다'.
  //   판당 1회(run.mainRecord 가 표식 = 셸 전용 칸, devWeapon·lotteryOutcome 과 같은 계열). 신기록 판정(isBest)은 쓰기 전 기록과 비교해 표식에 남기고
  //   finishRun 은 그 표식을 읽어 결과 화면에 쓴다(쓴 뒤 다시 비교하면 자기 기록과 같아져 '신기록!' 이 사라진다). devWeapon 판은 종전대로 저장하지 않는다
  function commitMain(run) {
    if (run.mainRecord) return run.mainRecord;
    const id = run.stageId, ver = run.stageVersion, diff = run.difficulty;
    const cur = save.getStage(id, ver, diff);
    //  생존·시간은 **본전투 확정값**(run.mainResult·wonAt — 보너스 구간은 기록에 섞지 않는다). 없으면(옛 run·검사가 won 만 세운 판) 지금 run 값
    const mr = run.mainResult;
    const survivors = mr ? mr.survivors : run.units.length;
    const time = run.wonAt ?? run.time;
    //  best = 성공 판의 최다 생존·최단 시간(각각 독립)
    const isBest = survivors > (cur.bestSurvivors || 0);
    const patch = { cleared: true, bestSurvivors: Math.max(cur.bestSurvivors || 0, survivors), bestTime: cur.bestTime > 0 ? Math.min(cur.bestTime, time) : time };
    //  구출 기록(r3.14): true 일 때만 쓴다(희소 필드 — false 는 절대 쓰지 않는다). 본전투 안에서 정해지므로 승리 확정과 함께 쓴다
    if (run.objective && run.objective.done) patch.rescued = true;
    if (!run.devWeapon) save.updateStage(id, patch, ver, diff);
    run.mainRecord = { isBest, survivors, time };
    return run.mainRecord;
  }

  function finishRun() {
    const id = run.stageId, ver = run.stageVersion, diff = run.difficulty;
    const won = !!run.won;
    //  승리 판의 본전투 기록은 'win' 프레임에 commitMain 이 이미 썼다(표식이 없으면 — 검사가 won/over 만 세운 판 — 여기서 쓴다). 패배 판은 cleared 유지·rescued 만
    const rec = won ? commitMain(run) : null;
    const cur = save.getStage(id, ver, diff);
    const mr = run.mainResult;
    const survivors = mr ? mr.survivors : run.units.length;
    const peak = mr ? mr.peak : run.peak, kills = mr ? mr.kills : run.kills;
    const time = won ? run.wonAt ?? run.time : run.time;
    const isBest = !!rec && rec.isBest;
    const patch = { cleared: cur.cleared || won };
    //  구출 기록(r3.14): 승패와 무관하게 구출했으면 남는다(승리 판은 commitMain 이 이미 썼다 — OR 병합이라 다시 써도 같다)
    if (run.objective && run.objective.done) patch.rescued = true;
    //  보너스 점수(r3.15): 보너스가 있던 판만(희소 필드 bestBonus, 병합은 max). 신기록 여부는 생존 신기록과 별개 — 여기서만 쓴다(보너스는 over 에서 끝난다)
    const bo = run.bonus;
    const isBestBonus = !!bo && bo.score > (cur.bestBonus || 0);
    if (bo) patch.bestBonus = Math.max(cur.bestBonus || 0, bo.score);
    if (!run.devWeapon) save.updateStage(id, patch, ver, diff);
    const o = run.objective;
    const bonus = bo ? { score: bo.score, tier: bo.tier, hits: bo.hits, isBestBonus } : null;
    result = {
      stageId: id, stageVersion: ver, difficulty: diff, title: run.title, won, survivors, peak, time, timeText: timeText(time), kills,
      missedLine: missedLine(run), advice: adviceLine(run, run), lottery: lotteryLine(run, { weaponSame: fx.lotSame }), isBest, saveOk: save.ok,
      nextId: won && ALL_STAGE_IDS.includes(id + 1) ? id + 1 : null,
      //  작전 목표(r3.14): 결과 한 줄 + 성공/실패 색 분기용 사본. 목표가 없는 판은 둘 다 null
      objective: o ? { kind: o.kind, done: o.done, missed: o.missed, n: o.n } : null,
      objectiveLine: objectiveLine(run),
      //  보너스전(r3.15): 점수 사본 + 결과 한 줄 '보너스 N점 · 단계 K'. 보너스가 없던 판은 둘 다 null
      bonus, bonusLine: bonusLine(bonus),
    };
    state = 'result';
    loop.stop(nowSec());
    au.bgmPlay(BGM.title);
  }

  //  연출 이벤트 소비(프레임 1회, drainEvents). 규칙 상태는 읽기만 한다
  const rowById = (id) => run.gateRows.find((r) => r.id === id) ?? null;
  //  '?' 상자가 아직 덮고 있는 랜덤 길 물체인가(통로 확정선 전) — 계약서 3-9 '확정 전에 내용이 새지 않는다'.
  //  ⚠️확정선 전에도 비행 중인 탄은 막힌다(gateBlock). 그 막힘에 함정 전용 표현(붉은 스파크·trapHit)을 쓰면
  //   플레이어가 통로를 고르기 전에 '이번 판은 함정'임을 소리·색으로 알아낸다 — 공개 전에는 종전 셔터 표현으로 되돌린다.
  const hiddenRow = (id) => { const lot = run.lottery; return !!(lot && lot.rowId === id && run.z < lot.revealZ); };
  //  공개된 함정 행인가 = 그리는 쪽(render.isTrapGateRow)이 봉쇄 외형을 쓰는 바로 그 시점부터만 참
  const trapShown = (id) => !hiddenRow(id) && isFixedGateRow(rowById(id));
  function handleEvents(events) {
    collectLotteryOutcome(run.lotteryOutcome, events, run);
    let guardSfx = false;
    for (const ev of events) {
      switch (ev.type) {
        case 'fire':
          fx.fireCount += ev.count; fx.fireWeapon = ev.weapon;
          //  히어로 사격 시트: 걷기가 heroWalkMinSec 이상 이어진 뒤 오는 발사에 1회(연속 사격이라 매번 재생하면 걷기가 안 보인다)
          if (fx.heroFire <= 0 && fx.heroWalk >= FX.heroWalkMinSec) fx.heroFire = sheetSec('m1_fire');
          break;
        //  잡졸 피격(살아남은 경우만 — 죽으면 사망 시트가 대신한다)
        case 'enemyHit': if (ev.kind === 'grunt' && ev.hp > 0) fx.enemyHit[ev.id] = sheetSec('e_grunt_hit'); break;
        case 'supplyHit': fx.sfx.push(['crateHit']); break;
        case 'supplyOpen': {
          const y = sy(ev.z);
          spawnBurst(fx, ev.x, y, 30, false, C.gold);
          fx.sfx.push(['crateBreak']);
          const s = run.supplies.find((c) => c.id === ev.id);
          //  캡슐(r3.14)은 깨지는 연출(스파크 + crateBreak)을 그대로 쓰고 팝 문구만 '구출!'
          const text = !s ? '보급' : s.kind === 'soldier' ? '+' + (s.payload.n ?? 0) + '명' : s.kind === 'weapon' ? (WEAPONS[s.payload.weapon]?.name ?? '무기') : s.kind === 'capsule' ? '구출!' : '증원 설비';
          fx.pops.push({ x: ev.x, y, x0: ev.x, y0: y, t: 0, life: FX.rewardPopSec + 0.3, text, color: C.gold });
          break;
        }
        //  캡슐은 capsuleMissed 가 '캡슐 놓침'을 띄우므로 '놓침'을 겹쳐 그리지 않는다(supplySkipped 의 '다른 길'은 그대로)
        case 'supplyMissed': if (ev.kind !== 'capsule') floater(fx, ev.x, sy(ev.z) - 20, '놓침', C.gateZero); break;
        //  구출 캡슐(r3.14): 합류 플로터·효과음은 같은 STEP 의 joinMany 가 이미 낸다 — 여기서는 목표 달성 글 하나만 더 띄운다.
        //   ⚠️캡슐 자리(ev.z)가 아니라 부대 위에 띄운다 — 병력이 많으면 캡슐이 화면 위 끝에 들어오자마자 열려 그 자리 글은 화면 밖이다(2026-09-19 캡처 실측)
        case 'capsuleRescue': floater(fx, run.x, LINE_Y - 130, '구출 성공!', C.gold, true); break;
        case 'capsuleMissed': floater(fx, ev.x, sy(ev.z) - 20, '캡슐 놓침', C.gateZero); break;
        //  구조적으로 얻을 수 없던 대안 — '놓침'이 아니라 '다른 길'로 알린다(흐려지며 뒤로 빠진다)
        case 'supplySkipped': floater(fx, ev.x, sy(ev.z) - 20, '다른 길', C.wall); break;
        case 'supplyBlock': break;
        //  셔터 열림: 0.25초 걷히는 연출(판이 위로) + 효과음 1회 + 짧은 글(행 종류에 따라 '지금 쏘면 +1' / '쏴도 그대로예요')
        case 'gateArm': {
          //  첫 조우 배너('회색 셔터는 잠긴 게이트예요')가 아직 떠 있으면 내린다 — 열림 안내와 겹쳐 두 줄이 포개진다(시제품 캡처에서 실측)
          fx.shutterT = 0;
          fx.gateOpen[ev.id] = BAL3.gate.openT;
          //  확정 손실 행에는 '지금 쏘면 +1' 대신 '쏴도 그대로예요' — 칸 아래 '확정' 꼬리표와 같은 말을 한다
          const armed = run.gateRows.find((r) => r.id === ev.id);
          fx.gateTip[ev.id] = { text: isFixedGateRow(armed) ? GATE_TIP_OPEN_FIXED : GATE_TIP_OPEN, t: FX.gateTipSec };
          fx.sfx.push(['gateOpen']);
          break;
        }
        //  막힌 탄: 작은 회색 스파크 + 금속 튕김(색만으로 구분하지 않는다 — 2026-09-17 2차 검수 N2-④).
        //  ⚠️함정 행(붉은 봉쇄 장치)은 셔터가 아니다 — 둔탁한 차단음 + 붉은 스파크로 '이 장치에는 사격이 안 먹힌다'를 알린다(이사 결정 ③).
        //   단 **'?' 상자가 걷힌 뒤부터**다(trapShown) — 공개 전에는 함정도 꽝 게이트도 똑같이 gateClang + 회색이어야 내용이 새지 않는다
        //  차폐물 흡수(r3.11): 셔터와 같은 회색 스파크 + 금속 튕김 — '여기서는 안 뚫린다'
        case 'coverHit': spawnBurst(fx, ev.x, sy(ev.z), 5, false, C.wall); fx.sfx.push(['gateClang']); break;
        case 'gateBlock': {
          const trap = trapShown(ev.id);
          spawnBurst(fx, ev.x, sy(ev.z), 6, false, trap ? C.warn : C.wall);
          fx.sfx.push([trap ? 'trapHit' : 'gateClang']);
          break;
        }
        //  열린 행에 맞은 탄: 값이 올라 흰 플래시 + 숫자음. 함정 행은 값이 그대로라 같은 차단 표현을 쓴다(플래시·숫자음 없음)
        case 'gateHit': {
          const hitRow = rowById(ev.id);
          if (trapShown(ev.id)) {
            spawnBurst(fx, ev.x, sy(hitRow ? hitRow.z : run.z), 6, false, C.warn);
            fx.sfx.push(['trapHit']);
            break;
          }
          fx.gateFlash[ev.id + ':' + ev.idx] = GATE_FLASH_SEC;
          fx.sfx.push(['gateTick']);
          break;
        }
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
        //  r3.10 강화: 같은 무기 통 → Mk 상승 표시
        case 'weaponMk': fx.sfx.push(['weaponSwap']); floater(fx, run.x, LINE_Y - 110, (WEAPONS[ev.weapon]?.name ?? ev.weapon) + ' ' + MK_LABEL[ev.mk] + ' 강화!', WEAPONS[ev.weapon]?.color ?? C.gold, true); break;
        //  전격포 연쇄: 맞은 쪽에 작은 청보라 스파크
        case 'arc': spawnBurst(fx, ev.tx, sy(ev.tz), 8, false, WEAPONS.arc.color); break;
        case 'weaponSame':
          //  랜덤 길 무기 통이 동급이라 교체되지 않은 경우 — 결과 한 줄이 '획득'이라 거짓말하지 않게 표식을 남긴다
          if (run.lottery && run.lottery.kind === 'weapon' && run.z >= run.lottery.revealZ) fx.lotSame = true;
          floater(fx, run.x, LINE_Y - 90, '같은 무기', C.gateZero);
          break;
        case 'hurt': fx.shakeT = FX.shakeDur; fx.hurtT = FX.hurtFlashDur; fx.sfx.push(['hurt']); floater(fx, ev.x, sy(ev.z) - 10, '−' + ev.n, C.heroHurt); break;
        case 'unitLost': spawnBurst(fx, ev.x, sy(ev.z), 9, false, C.heroHurt); break;
        case 'kill': spawnBurst(fx, ev.x, sy(ev.z), BAL3.enemies[ev.kind]?.r ?? 14, false); fx.sfx.push(['kill']); addCorpse(fx, ev); break;
        case 'touch': fx.shakeT = FX.shakeDur; spawnBurst(fx, ev.x, sy(ev.z), 12, false); addCorpse(fx, ev); break;
        case 'blast': spawnBurst(fx, ev.x, sy(ev.z), ev.r, false, C.bulletHeavy); break;
        //  정예 등장(r3.16 복수 정예): 2~3체가 같은 프레임에 나오므로 index 0 에서만 배너·효과음·BGM(소리가 겹치지 않게). 문구는 체 수를 붙인다
        case 'elite':
          if ((ev.index ?? 0) > 0) break;
          fx.eliteT = FX.eliteBannerSec; fx.eliteText = (ev.total ?? 1) > 1 ? '정예 ' + ev.total + '체 접근!' : '정예 접근!';
          fx.sfx.push(['elite']); au.bgmPlay(BGM.boss[Math.max(0, Math.min(2, run.stageId - 1))]);
          break;
        //  정예 처치: 파편·흔들림은 매번, 효과음은 마지막(left 0)이면 승리음, 아니면 처치음. 남은 목표 배너는 bossesLeft 가 세운다
        case 'bossKill': spawnBurst(fx, ev.x, sy(ev.z), ev.r, true); fx.shakeT = FX.shakeDur; fx.sfx.push([(ev.left ?? 0) === 0 ? 'win' : 'kill']); break;
        case 'bossesLeft':
          if (ev.left > 0) { fx.bossBannerText = '정예 ' + (ev.index + 1) + ' 격파 — 남은 목표 ' + ev.left; fx.bossBannerT = FX.bossKillBannerSec; }
          break;
        //  승리 확정 프레임(r3.15 검수 반영): 본전투 기록을 지금 쓴다 — 보너스전·여운 중 나가도 확정된 승리가 남는다
        case 'win': commitMain(run); break;
        //  보너스전(r3.15): 시작 배너(슬롯 A) + 합류음 재사용. 정예가 있던 판만 보스 BGM 을 스테이지 BGM 으로 되돌린다
        //   (정예 없는 스테이지에 bonus 를 붙이면 스테이지 BGM 이 이미 흐르고 있어 다시 틀면 처음부터 재시작된다). 승리는 이미 확정 — 결과 화면은 over 로만
        case 'bonusStart':
          fx.bonusT = BAL3.bonus.bannerSec; fx.bonusText = '보너스전! ' + ev.sec + '초';
          fx.sfx.push(['joinMany']);
          if (run.elite) au.bgmPlay(BGM.stage[Math.max(0, Math.min(2, run.stageId - 1))]);
          break;
        case 'bonusTargetHit': fx.sfx.push(['crateHit']); break;
        case 'bonusHit': spawnBurst(fx, ev.x, sy(ev.z), BAL3.bonus.targetR, false, C.bonusBox); floater(fx, ev.x, sy(ev.z) - 30, '+' + ev.value, C.gold); fx.sfx.push(['crateBreak']); break;
        case 'bonusTier': floater(fx, run.x, LINE_Y - 130, '보상 단계 ' + ev.tier + '!', C.gold, true); fx.sfx.push(['weaponSwap']); break;
        case 'bonusEnd': fx.sfx.push(['gateFlip']); break;
        case 'bonusRespawn': break;
        //  아레나(r3.17): 광장 열림 연출 + 안내 배너(판마다 진입 시 1회). 정예 배너·효과음·BGM 은 같은 STEP 의 elite 이벤트가 맡는다
        case 'arenaEnter': fx.arenaOpen = FX.arenaOpenSec; fx.arenaT = FX.arenaGuideSec; fx.arenaText = ARENA_GUIDE_TEXT; break;
        //  돌진 예고 = 중립 경고음(lotWarn 재사용). 화면의 붉은 원·점선은 이벤트가 아니라 run.boss.state 를 렌더가 직접 읽는다
        case 'bossDashWarn': fx.sfx.push(['lotWarn']); break;
        case 'bossDash': fx.sfx.push(['gateClang']); break;
        //  보호막(r3.18): 흡수된 탄마다 회색 스파크(차폐물 흡수와 같은 표현), 효과음은 프레임당 1회. 해제는 반전음 + 보스 위 글자
        case 'bossGuard': spawnBurst(fx, ev.x, sy(ev.z), 4, false, C.wall); if (!guardSfx) { guardSfx = true; fx.sfx.push(['gateClang']); } break;
        case 'bossGuardOff': fx.sfx.push(['gateFlip']); floater(fx, ev.x, sy(ev.z) - 70, '보호막 해제!', C.gatePos, true); break;
        //  착지 충격: 확장 링 + 흔들림. hits > 0 이면 hurt 이벤트가 따로 나므로 피격 플래시·hurt 음은 그쪽이 맡는다
        case 'bossShock': fx.shocks.push({ x: ev.x, y: sy(ev.z), r: ev.r, t: 0, life: FX.shockRingSec }); fx.shakeT = FX.shakeDur; break;
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
    fx.shutterT = Math.max(0, fx.shutterT - dt);
    fx.objT = Math.max(0, fx.objT - dt);
    fx.bonusT = Math.max(0, fx.bonusT - dt);
    fx.bossBannerT = Math.max(0, (fx.bossBannerT ?? 0) - dt);
    fx.arenaOpen = Math.max(0, (fx.arenaOpen ?? 0) - dt);
    fx.arenaT = Math.max(0, (fx.arenaT ?? 0) - dt);
    for (const s of fx.shocks) s.t += dt;
    fx.shocks = fx.shocks.filter((s) => s.t < s.life);
    fx.lotOpen = Math.max(0, fx.lotOpen - dt);
    //  동작 시트 타이머: 사격이 끝나면 걷기 시간을 다시 센다 · 피격은 0 이하 삭제 · 쓰러진 잡졸은 재생+머묾이 끝나면 지운다
    fx.heroFire = Math.max(0, fx.heroFire - dt);
    fx.heroWalk = fx.heroFire > 0 ? 0 : fx.heroWalk + dt;
    for (const k of Object.keys(fx.enemyHit)) {
      fx.enemyHit[k] -= dt;
      if (fx.enemyHit[k] <= 0) delete fx.enemyHit[k];
    }
    const corpseSec = sheetSec('e_grunt_death') + FX.corpseLingerSec;
    for (const c of fx.corpses) c.t += dt;
    fx.corpses = fx.corpses.filter((c) => c.t < corpseSec);
    //  셔터 짧은 안내 글(행 단위): 다 지나면 칸 위에서 사라진다
    for (const k of Object.keys(fx.gateTip)) {
      fx.gateTip[k].t -= dt;
      if (fx.gateTip[k].t <= 0) delete fx.gateTip[k];
    }
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
      //  24스테이지(B-2): 한 페이지 8칸(2열×4행) + 페이지 넘김
      const pg = curTitlePage(), pages = titlePages();
      for (let i = 0; i < TITLE_PAGE; i++) {
        const id = ALL_STAGE_IDS[pg * TITLE_PAGE + i];
        if (id === undefined) break;
        const m = stageMeta(id), st = save.getStage(id, stageVersion(id), difficulty);
        //  구출 기록(r3.14)은 그 난이도 칸에서 한 번이라도 구출했으면 어느 상태에든 덧붙인다(없던 필드는 false 로 읽힌다)
        const sub = (st.cleared ? '완료 · ' + st.bestSurvivors + '명 · ' + timeText(st.bestTime) : st.attempts > 0 ? '도전 ' + st.attempts + '회' : '미도전')
          + (st.rescued === true ? ' · 구출✓' : '');
        const col = i % 2, row = Math.floor(i / 2);
        v.buttons.push({ id: 'stage' + id, x: 60 + col * 184, y: TITLE_GRID.y + row * TITLE_GRID.dy, w: 176, h: TITLE_GRID.h, label: id + ' ' + m.title, sub, primary: last === id, small: true });
      }
      v.buttons.push({ id: 'pageL', x: 60, y: TITLE_GRID.pageY, w: 100, h: 40, label: '◀ 이전', small: true, primary: false, disabled: pg === 0 });
      v.buttons.push({ id: 'pageInfo', x: 168, y: TITLE_GRID.pageY, w: 144, h: 40, label: (pg + 1) + ' / ' + pages, small: true, primary: false });
      v.buttons.push({ id: 'pageR', x: 320, y: TITLE_GRID.pageY, w: 100, h: 40, label: '다음 ▶', small: true, primary: false, disabled: pg >= pages - 1 });
      v.buttons.push({ id: 'mute', x: 422, y: 14, w: 44, h: 44, label: au.isMuted() ? '🔇' : '🔊' });
    } else if (run) {
      v.run = run;
      const paused = state === 'paused';
      v.fx = paused ? { ...fx, gateFlash: { ...fx.gateFlash }, gateOpen: { ...fx.gateOpen }, shakeT: 0, hurtT: 0 } : fx;
      v.hud = { distM: Math.max(0, Math.round((run.length - run.z) / 10)) };
      v.zoom = zoom;
      if (state === 'run') {
        v.buttons = [{ ...HUD_BTN }, zoomButton()];
      } else if (state === 'paused') {
        v.buttons = [
          zoomButton(),
          { id: 'resume', x: 120, y: 400, w: 240, h: 56, label: '계속하기', primary: true },
          { id: 'giveup', x: 120, y: 480, w: 240, h: 44, label: '스테이지 선택' },
          { id: 'vol_down', x: 120, y: 548, w: 64, h: 44, label: '−' },
          { id: 'mute', x: 192, y: 548, w: 96, h: 44, label: au.isMuted() ? '🔇' : '음량 ' + Math.round(au.getVolume() * 100) + '%' },
          { id: 'vol_up', x: 296, y: 548, w: 64, h: 44, label: '+' },
        ];
      } else if (state === 'result') {
        v.result = result;
        //  랜덤 길이 있는 판(결과 한 줄이 있는 판)은 [다시 도전] 아래에 부연 한 줄이 들어간다(render.RETRY_LOTTERY_NOTE).
        //  그 글 자리(22px)만큼 아래 버튼을 내린다 — 안 내리면 글이 다음 버튼에 깔린다
        const noteGap = result.lottery ? 22 : 0;
        const bs = [{ id: 'retry', x: 120, y: 480, w: 240, h: 56, label: '다시 도전', primary: !result.nextId }];
        if (result.nextId) bs.push({ id: 'next', x: 120, y: 548 + noteGap, w: 240, h: 56, label: '다음 작전', sub: 'STAGE ' + result.nextId + '  ' + stageMeta(result.nextId).title, primary: true });
        bs.push({ id: 'title', x: 120, y: (result.nextId ? 620 : 552) + noteGap, w: 240, h: 44, label: '스테이지 선택' });
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
    if (id === 'zoom') { setZoom(!zoom); au.sfx('click'); return true; }
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
      else if (id === 'pageL') { titlePage = Math.max(0, curTitlePage() - 1); }
      else if (id === 'pageR') { titlePage = Math.min(titlePages() - 1, curTitlePage() + 1); }
      else if (id === 'pageInfo') { /* 표시 전용 */ }
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
    //  y(r3.17 아레나 세로 입력)는 뒤에 붙는 선택 인자 — 도로에서는 규칙이 읽지 않는다
    if (state === 'run') input.onPointerDown(x, e.pointerType, e.pointerId, y);
  });
  //  r3.18 대항 검수 반영: 출격 중(state 'run')에만 넘긴다. 정지 화면에서 ⏸ → [계속하기]로 마우스를 옮긴 만큼 dragDy 가 쌓여
  //   재개 첫 STEP 에 부대가 광장 아래로 튀던 문제(tay −242 → +40). pause() 의 input.reset() 뒤 정지 중 이동은 버리고, 재개 뒤 첫 이동은 lastY 기준만 잡는다
  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'run') return;
    const [x, y] = toLogical(e);
    input.onPointerMove(x, e.pointerType, e.pointerId, y);
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
      //  Z = 확대 보기 토글(출격 중·일시정지·결과). 조향 키보다 먼저 보되 타이틀에서는 무시
      if (code === 'KeyZ' && (state === 'run' || state === 'paused' || state === 'result')) { setZoom(!zoom); return; }
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
    units: run ? run.units.length : 0, weapon: run ? run.weapon : null, weaponMk: run ? run.weaponMk : null, boss: run ? !!run.boss : false,
    enemies: run ? run.enemies.length : 0, bullets: run ? run.bullets.length : 0,
    //  차량 통(r3.13) 관찰: Playwright 가 이동을 읽는다
    vehicles: run ? run.supplies.filter((s) => s.move).map((s) => ({ id: s.id, x: Math.round(s.x), moveT: s.moveT, opened: s.opened, missed: s.missed })) : [],
    //  판 목표(r3.14 구출 캡슐) 관찰: { kind, supplyId, done, missed, n } | null
    objective: run ? run.objective : null,
    //  보너스전(r3.15) 관찰: phase·bonus { t, sec, score, tier, hits }·bossX(봇이 마우스를 보스로 옮기는 데 쓴다)·targets(살아 있는 표적 x)
    phase: run ? run.phase : null,
    bonus: run && run.bonus ? { t: Math.round(run.bonus.t * 10) / 10, sec: run.bonus.sec, score: run.bonus.score, tier: run.bonus.tier, hits: run.bonus.hits } : null,
    bossX: run && run.boss ? Math.round(run.boss.x) : null,
    targets: run ? run.bonusTargets.filter((t) => t.alive).map((t) => ({ id: t.id, x: Math.round(t.x), hp: t.hp })) : [],
    //  복수 정예(r3.16) 관찰: bosses(죽은 것도 dead 로 남는다)·bossesLeft(살아 있는 수 — 캡처 스크립트가 '한 마리 격파 뒤' 시점을 잡는다)
    bosses: run ? run.bosses.map((b) => ({ id: b.id, role: b.role, hp: Math.ceil(b.hp), x: Math.round(b.x), z: Math.round(b.z), dead: b.dead })) : [],
    bossesLeft: run ? run.bosses.filter((b) => !b.dead).length : 0,
    //  아레나(r3.17) 관찰: arena(광장 단계인가)·ay/tay(세로 오프셋·목표)·bossState('chase'|'warn'|'dash'|'recover')·bossZ·dashTx/dashTz(돌진 목표)·bossHp — Playwright 시간 검증용
    arena: !!(run && run.phase === 'arena'), ay: run ? Math.round(run.ay) : 0, tay: run ? Math.round(run.tay) : 0,
    bossState: run && run.boss ? (run.boss.state ?? null) : null, bossZ: run && run.boss ? Math.round(run.boss.z) : null,
    dashTx: run && run.boss && run.boss.dashTx != null ? Math.round(run.boss.dashTx) : null,
    dashTz: run && run.boss && run.boss.dashTz != null ? Math.round(run.boss.dashTz) : null,
    bossHp: run && run.boss ? Math.ceil(run.boss.hp) : null, lossByShock: run ? run.lossByShock : 0,
    //  r3.18: bossGuard(보호막 남아 있는가) · supplyArmed(피격 활성 구간에 든 통 id 목록 — armZ 가 있는 통만)
    bossGuard: !!(run && run.boss && run.boss.guard),
    supplyArmed: run ? run.supplies.filter((s) => s.armZ != null && !s.opened && s.z - run.z <= s.armZ).map((s) => s.id) : [],
    zoom,
  });
  if (win) win.__rush3Dbg = dbg;

  /** 셔터 안내(계약서 6장 N2-③⑥ · 2026-09-17 2차 검수). 셔터가 걸린 행이 **처음 화면에 들어온 시점**에
   *  칸 위 짧은 글 '가까워지면 열림'을 1회, 그리고 이 사용자의 첫 셔터라면 초보 배너를 1회 띄운다.
   *  ⚠️S1 첫 게이트는 `armZ === null`(항상 열림)이라 여기에 걸리지 않는다 — 셔터를 본 적이 없는데 셔터를 배웠다고 치지 않는다.
   *  ⚠️랜덤 길 게이트는 통로 확정선 전에는 '?' 상자 뒤에 있으므로 공개된 뒤에만 센다. */
  function updateShutterGuide() {
    const lot = run.lottery;
    for (const row of run.gateRows) {
      if (row.armZ == null || row.armed || row.passed) continue;
      if (fx.gateTipSeen[row.id]) continue;
      if (row.z - run.z > BAL3.enterZ) continue;
      //  ⚠️공개 판정이 함정 판정보다 **먼저**다 — '?' 상자 뒤의 행은 함정인지 아닌지를 여기서도 보지 않는다(계약서 3-9)
      if (lot && lot.rowId === row.id && run.z < lot.revealZ) continue;
      //  ⚠️공개된 함정 행(확정 손실)은 셔터 수업이 아니다 — '가까워지면 열림'은 이 행에서 지킬 수 없는 약속이라 띄우지 않는다(이사 결정 ③).
      //   화면도 같은 판단을 한다(render.isTrapGateRow → 봉쇄 외형). 첫 셔터 배너도 여기서 소진하지 않는다
      if (isFixedGateRow(row)) continue;
      fx.gateTipSeen[row.id] = true;
      fx.gateTip[row.id] = { text: GATE_TIP_CLOSED, t: FX.gateTipSec };
      if (!save.get().seenShutter) {
        save.patch({ seenShutter: true });
        fx.shutterText = SHUTTER_GUIDE_TEXT;
        fx.shutterT = FX.shutterGuideSec;
      }
    }
  }

  /** 차량 통 안내(r3.13). 규칙이 '화면 진입'을 이미 판정(s.moveT !== null)했으므로 셸은 enterZ 를 다시 계산하지 않는다.
   *  이 판에서 차량 통이 처음 들어온 프레임에 fx.vehicleTipSeen 을 세우고, 이 사용자의 첫 차량이면 배너 1회
   *  (저장 seenVehicle — seenShutter 와 같은 꼴, 셔터 배너와 같은 슬롯·같은 시간 FX.shutterGuideSec). 캠페인 순서상 6번 첫 통이다. */
  function updateVehicleGuide() {
    if (fx.vehicleTipSeen) return;
    if (!run.supplies.some((s) => s.move && s.moveT !== null)) return;
    fx.vehicleTipSeen = true;
    if (!save.get().seenVehicle) {
      save.patch({ seenVehicle: true });
      fx.shutterText = VEHICLE_GUIDE_TEXT;
      fx.shutterT = FX.shutterGuideSec;
    }
  }

  let lastFx = null;
  function frame(nowMs) {
    const now = nowMs / 1000;
    const dt = lastFx === null ? 0 : Math.min(0.05, Math.max(0, now - lastFx));
    lastFx = now;
    if (state === 'run') {
      loop.frame(now);
      //  랜덤 길 공개: 통로 확정선을 넘는 프레임에 '?' 상자를 걷고 효과음 1회(좋음 gateFlip / 꽝 hurt 재사용)
      //  ⚠️위험 항목 공개는 **중립 경고음**(lotWarn)이다. 여기서 피격음을 내면 −15 를 0 으로 막아낸 판까지
      //   '맞았다'로 들려 무력화 성공을 흐린다(2026-09-17 2차 검수 N4). 피격음은 실제 손실이 날 때(gatePass)만 난다.
      if (run.lottery && !fx.lotSeen && run.z >= run.lottery.revealZ) {
        fx.lotSeen = true;
        fx.lotOpen = BAL3.lottery.openT;
        fx.sfx.push([run.lottery.good ? 'gateFlip' : 'lotWarn']);
      }
      updateShutterGuide();
      updateVehicleGuide();
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
           getDifficulty: () => difficulty, setDifficulty, getZoom: () => zoom, setZoom };
}

if (typeof document !== 'undefined' && document.getElementById?.('game3')) boot(document.getElementById('game3'));
