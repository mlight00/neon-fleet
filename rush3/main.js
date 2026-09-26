// rush3/main.js — 셸(계약서 6장). 규칙은 combat.js 가 전부 갖고 여기는 결선·연출·상태기계만.
//  ⚠️모듈 상단에서 DOM 을 만지지 않는다 — Node 테스트가 hitButton/makeLoop 를 그대로 import 한다.
//  rush/main.js 는 import 하지 않는다(자동 부트가 같은 캔버스에 붙는다). 골격(hitButton/toLogical/spawnBurst/
//  autoPause/오디오 unlock/ESC/음량 버튼/로드 후 루프 시작/#game3 가드)만 참고해 옮겨 적었다.
import { BAL3, PLAY_DIFFICULTY } from './balance.js';
import { STAGE_IDS, ALL_STAGE_IDS, PROTO_IDS, buildStage, stageMeta, stageVersion } from './stages.js';
import { WEAPONS } from './weapons.js';
import { createRun, stepRun, drainEvents, STEP } from './combat.js';
import { createInput, isSteerKey } from './input.js';
import { createRenderer3, isTrapGateRow, HUD_ROW, hitRole, HERO_RING_COLOR, UPGRADE_UI, upgradeBuyBox, ATK_LOOK, RAGE_COLOR } from './render.js';
import { UP_TRACKS, UP_MAX, UP_EFFECT, normUp, hasUp, nextCost, canBuy } from './meta.js';
import { projectorFor, projectorMode } from './project.js';
import { loadSprites3, sheetSec } from './sprites.js';
import { createAudio3 } from './audio.js';
import { createSave3 } from './save.js';
import { adviceLine, ADVICE_DEFAULT } from './advice.js';
import { createTally, addEvents, tallyTotal, mainCoins, bonusCoins } from './coins.js';
import { hashSeed } from '../rush/rng.js';

const W = BAL3.view.w, H = BAL3.view.h, LINE_Y = BAL3.view.LINE_Y;
const FX = BAL3.fx;
const C = BAL3.colors;
//  판 종료 뒤 결과 화면까지의 여운(초)
const OVER_DELAY = { won: 1.3, lost: 1.0 };
const BGM = { title: 'nf_bgm_title', stage: ['nf_bgm_sector1a', 'nf_bgm_sector2a', 'nf_bgm_sector3a'], boss: ['nf_bgm_boss_sector1', 'nf_bgm_boss_sector2', 'nf_bgm_boss_sector3'] };
//  r4.2(2026-09-25, 이사 지시 "보통, 어려움, 지옥으로 난이도 구성된 것들 삭제하고"): 타이틀 난이도 토글 3칸(종전 DIFF_TOGGLE,
//   스테이지 버튼 바로 위 y 382 줄 {x0 138, w 90, h 34, gap 6})과 1/2/3 키를 지웠다. r4.5(v4 ⑤단계): 그 줄에 [로봇 강화] 버튼(아래 TITLE_UPGRADE_BTN)과
//   그 왼쪽 보유 코인(render.drawTitle). 숫자 키는 여전히 아무 일도 하지 않는다
export const TITLE_UPGRADE_BTN = Object.freeze({ x: 250, y: 382, w: 170, h: 34 });
//  타이틀 스테이지 목록(24스테이지·B-2): 2열×4행 = 8칸/페이지, 첫 칸 x 60~236·y 446~500. 페이지 줄은 그 아래(694)
export const TITLE_GRID = Object.freeze({ y: 446, dy: 60, h: 54, pageY: 694, perPage: 8 });
//  ⏸(일시정지) 버튼 = HUD 상단 줄의 셋째 칸. 상자는 render 의 자리표(HUD_ROW.box.pause) 하나에서만 온다 —
//  이 객체가 **히트 영역이자 그려지는 상자**다(`hud: true` 라 drawButtons 는 건너뛰고 drawHud 가 같은 상자로 그린다).
//  ⚠️여기에 좌표를 직접 적지 말 것. 적는 순간 화면의 칩과 누르는 자리가 조용히 어긋난다(2026-09-18 HUD 정돈).
export const HUD_BTN = Object.freeze({ id: 'pause', ...HUD_ROW.box.pause, label: '❚❚', hud: true });
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
//  r4.10 대물결 판(게임 화면 줄 1·4·7·…): 대물결 첫 겹이 들어올 때 정예 경고와 같은 슬롯 A 붉은 띠 · 결승선을 넘는 순간 금색 띠(한 줄 — 줄바꿈 없음)
export const HORDE_BANNER_TEXT = '대물결 접근!';
export const FINISH_TEXT = '결승선 돌파!';
//  r4.10 판 끝 목표 이름(결과 화면 코인 내역 — 보스 몫 V × 0.5 를 받는 목표): 보스 판 '보스' · 중간 보스 판 '중간 보스' · 대물결 판 '돌파'
export const GOAL_NAME = Object.freeze({ boss: '보스', mid: '중간 보스', horde: '돌파' });
/** 판 끝 목표 종류(순수 — 판 정의만 본다): 결승선이 있으면 'horde' · 중간 보스(보스 정의의 mid 표시)면 'mid' · 그 밖(보스·배수 1 줄·시제품) 'boss' */
export function goalKind(stage) {
  if (!stage) return 'boss';
  if (stage.finishZ != null) return 'horde';
  return (stage.elites ?? []).some((e) => e.mid) ? 'mid' : 'boss';
}

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

//  r4.2: 저장값·외부 입력을 난이도 id 로 거르던 normDifficulty 는 지웠다 — 셸은 난이도를 고르지도, 저장에서 읽지도 않는다(늘 PLAY_DIFFICULTY)

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
  trimParts(fx);
}

//  ── 손맛(r3.24) ─────────────────────────────────────────────────────────────────────────────────────────────
//  이사 관찰(2026-09-23, 라스트워 30초): "여러 대 맞아야 터지는 애들은 숫자도 차감되지만 피탄될 때마다 반응이 그래픽으로 표현되어 손맛이 있다"
//   · "각 적들마다 특색 있는 반응과 병사 획득 시 이벤트도 그래픽으로". 전부 **셸 연출**이다 — 규칙 run 은 읽기만 하고 쓰지 않는다.
//  좌표 규약(r3.20): 파편·링·글은 만드는 시점에 투영한 화면 좌표, 부대로 날아가는 병사는 매 프레임 다시 투영한다(부대가 움직이므로).
//  sp(x, z) = 규칙 좌표 → 화면 { x, y, s } (셸의 투영기). 아래 함수들은 fx 만 고친다 — 검사 V3-HITFEEL 이 그대로 부른다
export { hitRole };
const FXH = FX.hit;

/** 파편 상한(BAL3.fx.partsCap): 넘치면 **오래된 것부터** 버린다(배열 앞이 오래된 것) */
export function trimParts(fx) {
  const cap = FX.partsCap;
  if (fx.parts.length > cap) fx.parts.splice(0, fx.parts.length - cap);
}

//  결정적 흩뿌림(전역 난수 금지): 카운터 burstSeed 로 각도·속도를 돌린다
function jit(fx, i, m) { return ((fx.burstSeed * 7 + i * 13) % m) / m; }

/** 피격 스파크: 명중점(화면)에서 쏜 쪽(아래)으로 튀는 무기색 파편 + 금속 역할이면 흰·노랑 스파크를 더한다 */
export function hitSparks(fx, x, y, s, weapon, role) {
  const W0 = FX.hitSparks[weapon] ?? FX.hitSparks.rifle;
  const R = FX.hitRoles[role] ?? FX.hitRoles.grunt;
  fx.burstSeed++;
  const n = W0.n + (R.sparks || 0);
  for (let i = 0; i < n; i++) {
    const metal = R.metal && i >= W0.n;
    //  아래(+y) 기준 ±75° 부채꼴 — 탄이 아래에서 올라와 맞았으니 파편은 쏜 쪽으로 튄다
    const a = Math.PI / 2 + (jit(fx, i, 11) - 0.5) * 2.6;
    const v = (metal ? W0.sp * 1.25 : W0.sp) * (0.55 + jit(fx, i + 3, 7) * 0.8) * s;
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: metal ? 0.22 : 0.26,
                    r: (metal ? 1.6 : W0.r) * s, color: metal ? (i % 2 ? '#FFFFFF' : '#FFE070') : W0.color, shape: metal ? 'line' : W0.shape });
  }
  trimParts(fx);
}

/** 적 1기 피격(enemyHit 이벤트) → 피격 상태 fx.hit[id] + 스파크 + (여러 대 맞는 적만) '-n' 숫자. 반환 = 역할 */
export function onEnemyHit(fx, ev, sp) {
  const role = hitRole(ev.kind, ev.skin);
  const q = sp(ev.bx ?? ev.x, ev.z);
  //  명중점: 몸 중심보다 조금 아래(탄이 들어온 쪽)
  const r = (ev.r ?? 14) * q.s;
  hitSparks(fx, q.x, q.y + r * 0.35, q.s, ev.weapon ?? 'rifle', role);
  const prev = fx.hit[ev.id];
  //  죽는 탄이면 피격 상태는 만들지 않는다(사망 연출 kill·bossKill 이 이어받는다) — '-n' 은 마지막 한 방도 보여 준다
  //  fa = 번쩍임 경과 초. 직전 번쩍임이 켜짐 + 쉼(flashSec + flashGap)을 다 채웠을 때만 새로 켠다(연사에도 깜빡임으로 보이게)
  const fa = prev && prev.fa < FXH.flashSec + FXH.flashGap ? prev.fa : 0;
  const h = ev.hp > 0 ? { t: 0, fa, dir: -1, role, n: prev ? prev.n + 1 : 1, dmgF: prev ? prev.dmgF : null } : null;
  if (h) fx.hit[ev.id] = h; else delete fx.hit[ev.id];
  const hpMax = ev.hpMax ?? 0;
  if (hpMax >= FXH.dmgFloatMinHp && ev.dmg > 0) {
    const f = prev ? prev.dmgF : null;
    if (f && f.t < FXH.dmgMergeSec && fx.floaters.includes(f)) { f.n += ev.dmg; f.text = '-' + dmgText(f.n); f.pop = 0; }
    else {
      const nf = { x: q.x + (((prev ? prev.n : 0) % 3) - 1) * 10 * q.s, y: q.y - r * 1.1, text: '-' + dmgText(ev.dmg), n: ev.dmg, color: '#FFFFFF',
                   t: 0, life: FXH.dmgFloatSec, big: false, px: Math.max(13, 16 * q.s), dmg: true, pop: 0 };
      fx.floaters.push(nf);
      if (h) h.dmgF = nf;
      //  '-n' 글자 상한 — 오래된 것부터 뺀다(장갑체 무리가 한꺼번에 맞아도 글자가 화면을 덮지 않게)
      const dm = fx.floaters.filter((o) => o.dmg);
      if (dm.length > FXH.dmgFloatCap) { const drop = new Set(dm.slice(0, dm.length - FXH.dmgFloatCap)); fx.floaters = fx.floaters.filter((o) => !drop.has(o)); }
    }
  }
  return role;
}

//  피해 숫자 '-n' 글자(r4.4 (b) 직격 화력 강화 — 피해 1.3·2.6 … 과 누적 부동소수 오차 '3.9000000000000004' 를 소수 한 자리로 반올림). 정수 피해는 종전 글자 그대로
export function dmgText(n) {
  return String(Math.round(n * 10) / 10);
}

/** 적 사망(kill·touch) → 종류별 연출(파편·링·흔들림) + 잔해. 잡졸만 사망 시트, 나머지는 도형 잔해(render.drawCorpses) */
export function onEnemyDeath(fx, ev, sp) {
  const role = hitRole(ev.kind, ev.skin);
  const q = sp(ev.x, ev.z);
  const r = (ev.r ?? BAL3.enemies[ev.kind]?.r ?? 14) * q.s;
  delete fx.hit[ev.id];
  if (role === 'grunt') {
    spawnBurst(fx, q.x, q.y, r, false);
  } else if (role === 'rusher') {
    spawnBurst(fx, q.x, q.y, r, false, '#5A5550');
    //  먼지: 느리게 퍼지며 커지는 회색 덩이
    for (let i = 0; i < 4; i++) fx.parts.push({ x: q.x + (i - 1.5) * r * 0.5, y: q.y + r * 0.6, vx: (i - 1.5) * 26 * q.s, vy: -14 * q.s, t: 0, life: 0.6, r: r * 0.45, color: 'rgba(170,160,140,0.8)', shape: 'smoke' });
  } else if (role === 'shooter') {
    spawnBurst(fx, q.x, q.y, r, false, C.eshot);
    //  마젠타 에너지 폭발 링 두 겹(바깥 진한 링 + 한 박자 늦은 밝은 링)
    fx.shocks.push({ x: q.x, y: q.y, r: r * 1.6, t: 0, life: 0.4, color: C.eshot });
    fx.shocks.push({ x: q.x, y: q.y, r: r * 1.0, t: -0.08, life: 0.4, color: '#FFB8E0' });
  } else if (role === 'armor') {
    fx.burstSeed++;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + fx.burstSeed * 0.9;
      const v = (110 + (i % 3) * 45) * q.s;
      fx.parts.push({ x: q.x, y: q.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60 * q.s, t: 0, life: 0.7, r: r * 0.32, color: i % 2 ? '#8E97A3' : '#C9D0DA', shape: 'plate', rot: a });
    }
    for (let i = 0; i < 3; i++) fx.parts.push({ x: q.x + (i - 1) * r * 0.4, y: q.y, vx: 0, vy: -30 * q.s, t: 0, life: 0.9, r: r * 0.55, color: 'rgba(60,60,66,0.7)', shape: 'smoke' });
    fx.parts.push({ x: q.x, y: q.y, vx: 0, vy: 0, t: 0, life: 0.25, r: r * 1.3, flash: true, big: false });
  } else if (role === 'cart') {
    spawnBurst(fx, q.x, q.y, r * 1.2, true);
    fx.shocks.push({ x: q.x, y: q.y, r: r * 2.2, t: 0, life: 0.5, color: C.bulletHeavy });
    for (let i = 0; i < 3; i++) fx.parts.push({ x: q.x + (i - 1) * r * 0.5, y: q.y - r * 0.2, vx: (i - 1) * 20 * q.s, vy: -40 * q.s, t: 0, life: 1.0, r: r * 0.6, color: 'rgba(50,48,52,0.7)', shape: 'smoke' });
    //  화면 흔들림 약하게(흔들림 세기 = shakeT / shakeDur 비례)
    fx.shakeT = Math.max(fx.shakeT, FX.shakeDur * 0.5);
  }
  addCorpse(fx, ev, role);
  trimParts(fx);
  return role;
}

/** 정예·아레나 보스 사망 → 다단 폭발 예약(span 초에 n 번, 반지름 안 자리를 돌아가며). 실제 폭발은 tickHitFx 가 시간에 맞춰 터뜨린다 */
export function onBossDeath(fx, ev) {
  const M = FX.bossMultiBoom;
  delete fx.hit[ev.id];
  for (let i = 1; i <= M.n; i++) {
    const a = i * 2.4;
    fx.booms.push({ x: ev.x + Math.cos(a) * ev.r * 0.6, z: ev.z + Math.sin(a) * ev.r * 0.5, r: ev.r * (0.5 + 0.12 * (i % 3)), at: (i / M.n) * M.span, t: 0, done: false });
  }
}

/** 병사 합류(이사 ②): 통 자리(규칙 좌표 x, z)에서 병사 n 명이 튀어나와 부대로 날아간다. 그림은 최대 joinFly.max 명, 다 도착하면 부대 위 반짝임 + label */
export function onJoin(fx, x, z, n, label) {
  const J = FX.joinFly;
  const k = Math.max(1, Math.min(n, J.max));
  const g = { n, label, left: k };
  for (let i = 0; i < k; i++) fx.recruits.push({ x0: x, z0: z, i, k, t: -i * 0.035, life: J.sec, g, sx: 0, sy: 0, s: 1, done: false });
}

/** 매 프레임: 피격 상태·다단 폭발·날아가는 병사. sp = 투영, squad = 부대 중심 화면점 함수, burstAt = 규칙 좌표 폭발 */
export function tickHitFx(fx, dt, { sp, squad, burstAt }) {
  const life = Math.max(FXH.flashSec, FXH.knockSec, FXH.squashSec, FXH.hpPopSec);
  for (const k of Object.keys(fx.hit)) {
    const h = fx.hit[k];
    h.t += dt;
    h.fa = (h.fa ?? h.t - dt) + dt;
    //  반응이 끝나도 '-n' 이 아직 떠 있으면 묶음 대상으로 남긴다(글자 수명까지)
    if (h.t >= life && (!h.dmgF || h.t >= FXH.dmgFloatSec)) delete fx.hit[k];
  }
  for (const b of fx.booms) {
    b.t += dt;
    if (!b.done && b.t >= b.at) {
      b.done = true;
      burstAt(b.x, b.z, b.r, true);
      const q = sp(b.x, b.z);
      fx.shocks.push({ x: q.x, y: q.y, r: b.r * 1.5 * q.s, t: 0, life: 0.35, color: C.bulletHeavy });
      fx.shakeT = Math.max(fx.shakeT, FX.shakeDur * 0.6);
    }
  }
  fx.booms = fx.booms.filter((b) => !b.done);
  const J = FX.joinFly;
  const sq = squad ? squad() : null;
  for (const p of fx.recruits) {
    p.t += dt;
    if (p.t < 0 || !sq) continue;
    const u = Math.min(1, p.t / p.life);
    const a = sp(p.x0, p.z0);
    //  대형 안 자리로 흩어져 들어간다(한 점에 모이지 않게)
    const tx = sq.x + ((p.i % 5) - 2) * 9 * sq.s, ty = sq.y + (Math.floor(p.i / 5) - 0.5) * 8 * sq.s;
    const e = u * u * (3 - 2 * u);
    p.sx = a.x + (tx - a.x) * e;
    p.sy = a.y + (ty - a.y) * e - Math.sin(Math.PI * u) * J.hop * sq.s;
    p.s = a.s + (sq.s - a.s) * e;
    if (u >= 1 && !p.done) {
      p.done = true;
      //  도착 반짝임(금색 별 조각) — 한 명마다 작게
      for (let j = 0; j < 3; j++) { const an = -Math.PI / 2 + (j - 1) * 0.9; fx.parts.push({ x: tx, y: ty - 10 * sq.s, vx: Math.cos(an) * 90 * sq.s, vy: Math.sin(an) * 90 * sq.s, t: 0, life: J.sparkleSec, r: 3.2 * sq.s, color: C.gold, shape: 'star' }); }
      p.g.left--;
      if (p.g.left === 0 && p.g.label) floater(fx, sq.x, sq.y - 90, p.g.label, C.gold, true);
    }
  }
  fx.recruits = fx.recruits.filter((p) => !p.done);
  trimParts(fx);
}

//  게이트 피격 플래시(초): 규칙의 cell.flashT 는 감소되지 않으므로(계약서 4장 STEP 순서에 없음) 연출 타이머는 셸이 갖는다
const GATE_FLASH_SEC = BAL3.gate.flashT;
//  판 안 무기 Mk 단계 글자(플로터·랜덤 길 결과용 — 앞에 ' Mk '를 붙여 쓴다. HUD 칩은 render.MK_LABEL). '강화'는 판 밖 로봇 강화에만 쓰는 말
const MK_LABEL = ['', 'I', 'II', 'III'];

export function makeFx() {
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
           //  rageT/rageText(r4.9 (다)) = 보스 광분 배너 '광분!'(화면 가운데 — bossRage 이벤트가 세우고 updateFx 가 줄인다)
           rageT: 0, rageText: null,
           //  아레나(r3.17): arenaOpen = 광장 열림 연출 남은 초 · arenaT/arenaText = '드래그로 피하세요' 배너 · shocks = 착지 충격 링 [{ x, y, r, t, life }](화면 좌표)
           arenaOpen: 0, arenaT: 0, arenaText: null, shocks: [],
           //  동작 시트 타이머(6장): heroFire = 사격 시트 남은 초 · heroWalk = 마지막 사격 뒤 걸은 초 · enemyHit = { id: 피격 시트 남은 초 } · corpses = 쓰러진 잡졸
           heroFire: 0, heroWalk: 0, enemyHit: {}, corpses: [],
           //  손맛(r3.24): hit = { 적 id: { t 경과 초, dir, role, n 연속 피격 수, dmgF 떠 있는 '-n' } } · booms = 보스 다단 폭발 예약(규칙 좌표) ·
           //   recruits = 부대로 날아가는 병사(규칙 좌표 출발점 + 이번 프레임 화면점 sx/sy/s)
           hit: {}, booms: [], recruits: [],
           //  r4.4 메인 로봇 보호: beams = 피해 이전 빛줄기 [{ x0, y0, x1, y1, t, life }](만드는 시점에 투영한 화면 좌표, 로봇 → 대신 맞은 호위)
           beams: [],
           //  r4.8 보스 공격 폭발: atkBlasts = [{ kind 'pillar'|'burst', xs, w, x, z, R, color, t, life }](규칙 좌표 — 보스전은 카메라가 멈춰 있어 그릴 때 투영한다)
           atkBlasts: [] };
}

//  r4.4 피해 이전 빛줄기 수명(초)·보호막이 깨질 때 조각 수
const BEAM_SEC = 0.3, SHIELD_SHARDS = 10;
//  r4.9 (다) 광분 배너 글(한 어절 — 줄바꿈 없음)
export const RAGE_TEXT = '광분!';
//  r4.9 보스 광역 공격이 터지는 연출 길이(초 — render.drawAtkBlasts 가 이 동안 그린다). 열차 질주·철퇴 휩쓸기는 짧고 굵게, 매연·거미줄은 조금 오래
const ATK_BLAST_SEC = Object.freeze({ smoke: 0.55, hook: 0.4, web: 0.6, rail: 0.32, crossrail: 0.32, pour: 0.4, rain: 0.3, mace: 0.3, quake: 0.4 });

//  쓰러진 적 등록(kill·touch 공통). 규칙은 이미 enemies 에서 뺐으므로 위치만 셸이 기억한다.
//  r3.24: 잡졸만이 아니라 모든 적 — kind·skin·r·역할(role)과 머무는 시간(life)을 싣는다. 잡졸 = 사망 시트 + 머묾, 나머지 = 역할별 deathSec
export function addCorpse(fx, ev, role = hitRole(ev.kind, ev.skin)) {
  if (ev.kind === 'elite') return;
  delete fx.enemyHit[ev.id];
  const R = FX.hitRoles[role] ?? FX.hitRoles.grunt;
  const r = ev.r ?? BAL3.enemies[ev.kind]?.r ?? BAL3.enemies.grunt.r;
  const life = role === 'grunt' ? sheetSec('e_grunt_death') + FX.corpseLingerSec : R.deathSec;
  fx.corpses.push({ x: ev.x, z: ev.z, t: 0, h: r * 2.4, kind: ev.kind, skin: ev.skin ?? null, r, role, life, id: ev.id ?? 0 });
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
      //  r3.10: 같은 무기 통 = Mk 상승. 결과 문구는 '중복'이 아니라 'Mk n'(r4.4: '강화'라는 말은 판 밖 로봇 강화에만)
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
    //  r4.4 메인 로봇 보호(D4′-a): 로봇 혼자 음수 칸을 지나면 빠지는 병사가 없어 applied 0 이지만 칸 값은 음수다 — '무력화'가 아니다
    //   (같은 STEP 에 적 피해로 로봇까지 쓰러져 병력 0 이면 applied 0 이어도 '로봇은 빠지지 않음'이 아니다 — r4.4 검토 보정)
    if (out.applied === 0 && out.value < 0) return (run.units || []).some((u) => u.hero) ? '랜덤 길: 함정 통과 · 로봇은 빠지지 않음' : '랜덤 길: 함정 통과';
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
    //  r4.4 표기(기획 v4.1 3-4 (라)): 판 안 무기 단계는 'Mk' 로만 — '강화'는 판 밖 로봇 강화에만 쓴다
    if (out && out.mk > 1 && !out.swapped) return '랜덤 길: ' + lot.label + ' Mk ' + MK_LABEL[out.mk];
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

//  ── r4.3 코인·순차 해금(기획 v4.1 3-3 (사)·3-7·3-9, 이사님 결정 N2 = (나) 순차 해금 + 기존 기록 엄격 인정) ─────────────────
//  잠긴 판을 부를 때의 안내(스테이지 선택 화면에 잠깐 뜬다)
export const LOCK_NOTICE = '앞 판을 먼저 깨야 합니다';
//  24번(마지막 공개 판)을 이긴 결과 화면 — [다음 작전] 자리 대신
export const ALL_CLEAR_LINE = '모든 작전 완료 — 24개 작전을 전부 이겼습니다';
//  결과·타이틀 맨 아래 경고(코인 저장 실패·읽기 전용 탭)의 문구는 render.SAVE_WARN 한 곳 — 셸은 saveOk·coinSaveOk·readOnly 만 넘긴다
//  결과 화면 보조 버튼 [로봇 강화](r4.5, 기획 v4.1 3-9): [스테이지 선택] 바로 아래(dy 52) — 승리 y 672 · 패배·포기 y 604(랜덤 길 판은 부연 22px 만큼 더 아래).
//   **살 수 있는 단계가 있을 때만**(그리고 코인이 저장되는 탭일 때만) 작게(180×40, 15px) 보조 버튼으로 — 강조하지 않는다(패배·포기에서 구매로 몰지 않는다).
//   ③단계의 자리(240×44)를 작게 줄였다. 화면 높이 800 안이다(랜덤 길 승리 판 최저 734, 첫 구매 안내 글 752, 맨 아래 경고 778)
export const RESULT_UPGRADE_SLOT = Object.freeze({ x: 150, dy: 52, w: 180, h: 40 });

//  ── r4.5 로봇 강화 화면(v4 ⑤단계, 원본 v4 3-5 '강화 화면' · 기획 v4.1 3-4 (가)(나) · 3-9) ─────────────────────────────────────
//  새 상태 'upgrade'. 들어오는 곳 = 타이틀 [로봇 강화] · 결과 화면 보조 버튼 [로봇 강화]. [돌아가기]는 **들어온 화면으로 복귀**한다(결과에서 왔으면
//   방금 판 결과 화면 그대로 — 기본 버튼 [다시 도전]/[다음 작전] 유지, CLAUDE.md '다른 화면으로 이동시키는 기능은 원래 화면으로 복귀').
//  구매 = 지갑 buy(meta.buy 비용표·최대 단계 + 잔액·단계를 setItem 한 번). 같은 프레임 연타는 한 번만(프레임 번호 표식 + 누른 즉시 버튼 다시 계산).
//  코인이 저장되지 않는 탭(읽기 전용·코인 저장 실패·저장소 차단 = save.wallet.ok false)은 [구매]를 흐리게 하고 이유 한 줄을 띄운다
export const UP_TRACK_NAME = Object.freeze({ power: '직격 화력', rate: '연사', multi: '다연발' });
//  머리 두 줄(로봇만 강해진다 · 판 밖 성장)
export const UPGRADE_HEAD = Object.freeze(['메인 로봇 한 대만 강해집니다 · 병사는 그대로', '판이 끝나도, 무기를 바꿔도 계속 유지됩니다']);
export const UP_BLOCK_TEXT = Object.freeze({
  readOnly: '다른 탭에서 게임이 열려 있어 이 탭에서는 살 수 없습니다',
  unsaved: '코인이 저장되지 않는 상태라 지금은 살 수 없습니다',
});
//  첫 구매 안내(기획 v4.1 3-4 (나) — 첫 구매 주 가설 = 다연발 1): 처음 살 수 있게 된 승리 결과 화면에서 한 번(저장 seenUpHint) ·
//   강화 화면 다연발 줄 '추천' 한 번(저장 seenUpRec — 처음 살 수 있는 상태로 강화 화면을 연 방문 동안 보인다)
export const UP_HINT_LINE = '로봇 강화 가능 — 모은 코인으로 로봇을 강하게';
export const UP_REC_TEXT = '추천';
//  미리보기 기준 무기 = 기본 소총(모든 판이 소총으로 시작 — 판 밖이라 '지금 든 무기'는 늘 소총, Mk I)
const UP_REF_WEAPON = 'rifle';
//  규칙 combat.HP_EPS 와 같은 여유값(소수 피해 잔량 ≤ 이 값이면 0 — 처치 탄 수 계산을 규칙과 똑같이)
const UP_HP_EPS = 1e-9;
const fix1 = (v) => (Math.round(v * 10 + 1e-9) / 10).toFixed(1);
const fix2 = (v) => (Math.round(v * 100 + 1e-9) / 100).toFixed(2);

/** 체력 hp 를 피해 dmg 탄으로 잡는 데 드는 발 수(순수) — 규칙(combat.hitEnemy)처럼 한 발씩 빼고 잔량이 여유값 이하면 처치 */
export function shotsToKill(hp, dmg) {
  if (!(hp > 0) || !(dmg > 0)) return 0;
  let h = hp, n = 0;
  do { h -= dmg; n++; } while (h > UP_HP_EPS && n < 1e6);
  return n;
}

/** 살 수 있는 트랙이 하나라도 있는가(순수) — 지갑 { coins, up } */
export function canBuyAny(wallet) {
  return UP_TRACKS.some((t) => canBuy(wallet, t));
}

/** 강화 화면 한 줄의 글(순수). up = 지금 단계, track, ref = { stageId, bossHp }(직격 화력 미리보기의 기준 보스 — 없으면 보스 줄 없음).
 *  → { name, level, max, cost(다음 단계 비용 | null = 최대), lines: [효과 '지금 → 다음', 보조, 짧은 설명] }. 글은 모두 기본 소총(Mk I) 기준.
 *  줄은 어절 경계에서만 나눠 세 줄로 넘긴다(렌더는 줄을 더 나누지 않는다) — 480 화면 카드 글 폭 290px 안(Chromium 실측) */
export function upgradeLines(up, track, ref = null) {
  const u = normUp(up);
  const k = u[track] ?? 0, max = UP_MAX[track] ?? 0, cost = nextCost(u, track), top = cost === null;
  const w = WEAPONS[UP_REF_WEAPON];
  const lines = [];
  if (track === 'power') {
    const dmg = (j) => w.dmg * (1 + UP_EFFECT.powerStep * j);
    lines.push(top ? '최대 단계 · 로봇 직격 피해 ' + fix1(dmg(k)) : '로봇 직격 피해 ' + fix1(dmg(k)) + ' → ' + fix1(dmg(k + 1)));
    const hp = ref && ref.bossHp > 0 ? ref.bossHp : null;
    lines.push(hp ? (ref.stageId + '번 보스(체력 ' + hp + '): ' + shotsToKill(hp, dmg(k)) + '발' + (top ? '' : ' → ' + shotsToKill(hp, dmg(k + 1)) + '발')) : null);
    lines.push('소총 기준 · 폭발·연쇄에는 적용 안 됨');
  } else if (track === 'rate') {
    const iv = (j) => w.interval * Math.pow(UP_EFFECT.rateMul, j);
    lines.push(top ? '최대 단계 · 로봇 발사 간격 ' + fix2(iv(k)) + '초' : '로봇 발사 간격 ' + fix2(iv(k)) + '초 → ' + fix2(iv(k + 1)) + '초');
    lines.push('1초에 ' + fix1(1 / iv(k)) + '발' + (top ? '' : ' → ' + fix1(1 / iv(k + 1)) + '발'));
    lines.push('소총 기준 · 게이트 숫자도 더 빨리 오름');
  } else if (track === 'multi') {
    lines.push(top ? '최대 단계 · 로봇이 한 번에 ' + (1 + k) + '발' : '로봇이 한 번에 ' + (1 + k) + '발 → ' + (2 + k) + '발');
    lines.push('게이트는 원래 1발만 오름');
    lines.push('추가 탄(연보라)은 적·보급 통에만 맞음');
  }
  return { name: UP_TRACK_NAME[track] ?? track, level: k, max, cost, lines };
}

//  ── r4.4 v4 기록 칸(이사님 결정 D9′ = (가) v4 기록 칸 신설, 기획 v4.1 3-6) ─────────────────────────────────────────
//  v4 판(셸 출격 — 메인 로봇 보호·강화가 켜진 판)의 기록은 새 접미 칸 `${버전}:v4` 에 쌓는다(save.js KEY_RE 가 이미 받는다).
//   옛 지옥 칸 `${버전}:brutal` 은 지우지 않고 스테이지 선택 화면에 '이전 기록'으로 흐리게 병기한다. 해금 계산(모든 칸의 cleared)은 v4 칸도 저절로 센다
export const REC_SLOT_V4 = 'v4';
export const PREV_REC_SLOT = 'brutal';
//  기록마다 붙이는 강화 스냅샷의 규칙 버전(3-6 '규칙 버전을 함께 저장')
export const REC_RULE = 'v4';
/** 이 판의 강화 스냅샷 { power, rate, multi, rule } — 규칙 run 이 판을 만들 때 받은 단계(run.up, 없으면 0). 셸은 run 을 읽기만 한다 */
export function upSnapshot(run) {
  const u = (run && run.up) || {};
  const lv = (v) => (Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
  return { power: lv(u.power), rate: lv(u.rate), multi: lv(u.multi), rule: REC_RULE };
}
/** 스테이지 선택 칸의 '이전 기록' 한 줄(옛 지옥 칸을 이긴 적이 있을 때만, 순수). 없으면 null */
export function prevRecordLine(st) {
  if (!st || st.cleared !== true) return null;
  return '이전 기록 ' + (st.bestSurvivors | 0) + '명 · ' + timeText(st.bestTime || 0);
}

/** 해금 범위 = 1번부터 **연속으로** 이긴 판 수 + 1(순수). wonIds = 이긴 판 번호 집합, ids = 공개 판 번호 목록(ALL_STAGE_IDS 순서).
 *  중간에 빈 판이 있으면 그 앞까지만 열린다(N2 '엄격'). 새 저장 = 1. 반환 = 열린 마지막 판 번호(ids 범위 안) */
export function unlockedThrough(wonIds, ids = ALL_STAGE_IDS) {
  const won = wonIds instanceof Set ? wonIds : new Set(wonIds || []);
  let n = 0;
  for (const id of ids) { if (won.has(id)) n++; else break; }
  return ids[Math.min(ids.length - 1, n)];
}

/** 결과 화면 '원인' 한 줄(패배·포기, 3-9): 인원 손실(게이트·피격·충격·접촉 — 보스 겹침은 접촉에 합산) + 놓친 통 수. 순수.
 *  이름과 숫자 사이는 줄바꿈 없는 공백(U+00A0) — 결과 화면이 어절 경계에서 줄을 나눌 때 '게이트' 와 '3' 이 갈라지지 않게 */
export function causeLine(run) {
  const NB = ' ';
  const parts = [['게이트', run.lossByGate], ['피격', run.lossByShot], ['충격', run.lossByShock], ['접촉', run.lossByTouch]]
    .filter(([, n]) => (n || 0) > 0).map(([k, n]) => k + NB + n);
  const loss = parts.length ? '인원 손실 ' + parts.join(' · ') : '인원 손실 없음';
  const missed = (run.missedSupplies || 0) > 0 ? '놓친' + NB + '통' + NB + run.missedSupplies + '개' : '놓친' + NB + '통' + NB + '없음';
  return loss + ' · ' + missed;
}

/** 결과 화면 코인 내역 한 줄(3-9, 작은 글씨): 적 · 보스 · 현상금 · 첫 클리어/재클리어 · 보너스(0 인 항목은 적만 남기고 뺀다). 순수.
 *  r4.7 현상금(현상금 적을 잡은 몫 — 명세 (다)5 '현상금 +N')은 더하기 표시를 붙여 '현상금 +N' — 판 기본 몫(적·보스·클리어)과 따로 얹힌 보상임이 보이게 */
export function coinBreakdown(c) {
  if (!c) return null;
  if (c.dev) return '개발용 판 — 코인 없음';
  const NB = ' ';
  const parts = ['적' + NB + (c.enemy | 0)];
  //  r4.10: 판 끝 목표 몫의 이름 = 판 종류(c.goal — '보스' · '중간 보스' · '돌파' — 이름 안의 띄어쓰기도 줄바꿈 없는 공백). 칸이 없는 옛 꼴은 '보스'
  if (c.boss > 0) parts.push((GOAL_NAME[c.goal] ?? GOAL_NAME.boss).replace(/ /g, NB) + NB + c.boss);
  if (c.bounty > 0) parts.push('현상금' + NB + '+' + c.bounty);
  if (c.clear > 0) parts.push((c.clearKind === 'first' ? '첫' + NB + '클리어' : '재클리어') + NB + c.clear);
  if (c.bonus > 0) parts.push('보너스' + NB + c.bonus);
  return parts.join(' · ');
}

export function boot(canvas, deps = {}) {
  const win = deps.win ?? (typeof window !== 'undefined' ? window : null);
  const doc = deps.doc ?? (typeof document !== 'undefined' ? document : null);
  const nowFn = deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  //  랜덤 길 시드용 벽시계(검사에서 고정할 수 있게 주입 가능). 게임 진행에는 쓰지 않는다
  const dateNow = deps.dateNow ?? (() => Date.now());
  const raf = deps.raf ?? ((fn) => (win && win.requestAnimationFrame ? win.requestAnimationFrame(fn) : setTimeout(() => fn(nowFn()), 16)));
  const save = deps.save ?? createSave3(deps.storage);
  //  r4.3 복수 탭(기획 v4.1 3-7 ⑥): 먼저 열린 탭이 살아 있으면 이 탭은 읽기 전용(기록·지갑 쓰기 안 함 + 화면 안내).
  //   채널은 window 의 BroadcastChannel 만 쓴다(검사는 deps.BroadcastChannel 로 가짜 채널을 넣는다) — Node 전역 채널을 잡으면 검사끼리 서로 읽기 전용으로 만든다
  const BCtor = deps.BroadcastChannel !== undefined ? deps.BroadcastChannel : (win && typeof win.BroadcastChannel === 'function' ? win.BroadcastChannel : null);
  const tab = save.claimTab(BCtor, { now: dateNow, perf: nowFn });
  //  보기(r4.1, 이사 지시 2026-09-25 "줌 확대모드를 기본 모드로 하고 일반 모드를 삭제하자"): '가까이'(near 1.8) 하나뿐이다.
  //   종전 '가까이 ○/●' 토글(Z 키·HUD 칩·저장 zoom 필드·getZoom/setZoom)은 지웠다. 저장의 zoom 칸은 읽지 않는다(save.js)
  //  개발 대조용 평면 변환(계획서 §4-6 "같은 스테이지를 두 방식으로 그리는 비교"): rush3.html?flat=1 → 종전 y = LINE_Y − d 로 그린다
  //   판정은 값 '1' 만(검수 반영 2026-09-20: `!!get('flat')` 은 ?flat=0 도 참이었다)
  const flat = (() => { try { return !!(win && win.location) && new URLSearchParams(win.location.search).get('flat') === '1'; } catch { return false; } })();
  //  이번 프레임의 투영기 — 렌더(그리기)와 셸(연출 좌표·마우스 역투영)이 같은 것을 쓴다(project.js 의 모드별 단일 인스턴스)
  const proj = () => projectorFor(projectorMode({ flat }));
  const au = deps.audio ?? createAudio3({});
  const input = deps.input ?? createInput();
  au.setMuted(!!save.get().mute);
  au.setVolume(save.get().volume ?? 1);

  const ctx = canvas.getContext('2d');
  let state = 'title', run = null, renderer = null, buttons = [], fx = makeFx();
  //  overT: 판 종료 뒤 결과 화면까지 남은 여운(초). -1 = 아직 종료를 보지 못함
  let overT = -1, result = null;
  //  notice(r4.3) = 스테이지 선택 화면에 잠깐 뜨는 안내 { text, t 남은 초 } | null — 잠긴 판을 불렀을 때 '앞 판을 먼저 깨야 합니다'
  let notice = null;
  const NOTICE_SEC = 2.5;
  //  coin(r4.3) = 이번 판의 코인 상태 { runNo, tally, settled: { main, bonus } } | null. **run 객체에 두지 않는다** — 셸의 이벤트 처리는
  //   규칙 run 을 한 글자도 고치지 않는다(V3-HITFEEL HF-9). 출격 때 만들고 타이틀로 나가면 지운다
  let coin = null;
  //  r4.5 강화 화면: upgradeFrom = 들어온 화면('title' | 'result' — [돌아가기]가 그리로 복귀) · upRec = 이번 방문에 다연발 '추천'을 보이는가 ·
  //   upFlash = 방금 산 줄의 금색 테 { track, t 남은 초 } · frameNo = 프레임 번호(frame 마다 +1) · buyFrame = 마지막 구매가 일어난 프레임(같은 프레임 연타는 1회만)
  let upgradeFrom = 'title', upRec = false, upFlash = null, frameNo = 0, buyFrame = -1;
  const UP_FLASH_SEC = 0.6;
  //  직격 화력 미리보기의 기준 보스 체력(판 번호 → 첫 보스 체력, 한 번 계산해 둔다)
  const bossHpCache = new Map();
  //  출격 줄(r4.2 난이도 단일화): 게임 화면은 **늘** 기본 줄(PLAY_DIFFICULTY = 'brutal', 옛 지옥 수치)로 buildStage 를 부른다.
  //   고르는 곳(타이틀 토글·1/2/3 키)·바꾸는 곳(setDifficulty)·저장에서 읽는 곳(save.difficulty)이 없다. 그 뒤로는 run.difficulty 가 진실(기록 칸 키 `버전:brutal`).
  //   deps.difficulty 는 **검사 전용 주입**이다(save·audio·sprites 주입과 같은 결 — 실제 페이지의 boot(#game3)는 넘기지 않는다).
  //   종전 app.setDifficulty('normal') 로 배수 1 줄 판을 돌리던 셸 검사(보너스·캡슐·광장·복수 정예·손맛)의 기대값이 바뀌지 않게 남긴 자리다
  const difficulty = deps.difficulty ?? PLAY_DIFFICULTY;
  //  r4.4 기록 칸(D9′): 게임 화면의 출격은 늘 v4 칸(`버전:v4`)에 쓴다. deps.difficulty(검사 전용 주입 — 배수 1 줄 판을 돌리던 셸 검사)를 넘긴 경우만
  //   종전처럼 그 줄의 칸에 쓴다(그 검사들의 '옛 칸' 기대값을 바꾸지 않게 — 실제 페이지의 boot(#game3)는 넘기지 않는다)
  const recSlot = deps.difficulty !== undefined ? difficulty : REC_SLOT_V4;
  //  r4.4 메인 로봇 보호(D4′-a·D4′-b): 게임 화면은 늘 켠다. deps.heroGuard 는 검사 전용 주입(끈 판의 셸 동작을 볼 때)
  const heroGuard = deps.heroGuard ?? true;
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
  //  연출(파편·플로터·팝·충격 링)은 **만드는 시점에 투영한 화면 좌표**를 들고 있다(r3.20). 규칙 좌표 (x, z) → 화면 { x, y, s }
  function sp(x, z) { return proj().project(x, z - run.z); }
  //  부대 중심의 화면점(아레나에서는 ay 만큼 앞 — combat: 부대 중심 z = run.z − run.ay)
  function squadPt() { return sp(run.x, run.z - (run.ay || 0)); }
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
    //  r4.3 보정: 옛 저장의 마지막 판이 순차 해금으로 잠겨 있으면 열린 마지막 판을 고른다
    //   (그대로 두면 옛 기록을 가진 사용자는 타이틀 Enter 가 매번 '앞 판을 먼저 깨야 합니다'로 막힌다)
    if (ALL_STAGE_IDS.includes(id)) return isLocked(id) ? unlockedMax() : id;
    return ALL_STAGE_IDS[0];
  }
  //  타이틀 스테이지 목록 페이지(8칸 = 2열×4행). -1 = 마지막으로 한 스테이지가 있는 쪽
  const TITLE_PAGE = TITLE_GRID.perPage;
  let titlePage = -1;
  const titlePages = () => Math.ceil(ALL_STAGE_IDS.length / TITLE_PAGE);
  function curTitlePage() {
    if (titlePage < 0) titlePage = Math.max(0, Math.floor(ALL_STAGE_IDS.indexOf(lastStageId()) / TITLE_PAGE));
    return Math.max(0, Math.min(titlePages() - 1, titlePage));
  }

  //  ── r4.3 순차 해금(이사님 결정 N2 = (나) 엄격) ──
  //  '이긴 판' = v3 저장의 **모든 난이도·버전 칸** 중 하나라도 cleared 인 판(옛 기록 인정) ∪ 지갑의 v4 첫 클리어 표식. 공개 판 번호만 센다
  //   (지갑은 별도 키라 옛 코드 탭이 v3 키를 덮어써도 v4 에서 이긴 판은 남는다)
  function wonStageIds() {
    const won = new Set(save.wallet.get().firstClears);
    for (const id of ALL_STAGE_IDS) if (Object.values(save.getStageVersions(id)).some((r) => r.cleared === true)) won.add(id);
    return won;
  }
  const unlockedMax = () => unlockedThrough(wonStageIds());
  //  잠긴 판 = 공개 판 중 해금 범위 밖. 시제품(proto3)은 진행 순서 밖이라 잠그지 않는다(개발용 판 — 코인·기록 없음)
  const isLocked = (id) => ALL_STAGE_IDS.includes(id) && id > unlockedMax();
  //  ?dev=1(개발 확인 표시). ?stage=N 의 잠금 예외는 이 표시가 **함께** 있을 때만
  function devFlag() {
    try { return !!(win && win.location) && typeof URLSearchParams === 'function' && new URLSearchParams(win.location.search).get('dev') === '1'; } catch { return false; }
  }
  //  잠긴 판 요청: 안내 + 스테이지 선택 화면(열린 마지막 판이 있는 쪽으로)
  function refuseLocked() {
    notice = { text: LOCK_NOTICE, t: NOTICE_SEC };
    titlePage = Math.max(0, Math.floor(ALL_STAGE_IDS.indexOf(unlockedMax()) / TITLE_PAGE));
    if (state !== 'title') toTitle();
  }

  function startRun(id) {
    //  r4.3 순차 해금: **모든 출격 경로**(스테이지 버튼·타이틀 Enter·?stage=N·결과 [다음 작전]·[다시 도전])가 여기를 지난다 — 막는 곳은 여기 한 곳.
    //   개발 확인용 ?stage=N 은 ?dev=1 이 함께 있을 때만 **그 판에 한해** 예외이고, 그렇게 연 잠긴 판은 개발용 판(코인·기록 없음)이다
    const locked = isLocked(id);
    const devPass = locked && devFlag() && devStageId() === id;
    if (locked && !devPass) { refuseLocked(); return false; }
    notice = null;
    //  랜덤 길 시드는 **판마다** 다르다(계약서 3-9 = '재도전 동일 배치' 원칙의 명시적 예외).
    //   시계는 셸에만 둔다 — 규칙 계층(stages.buildStage)은 인자로 받은 시드로 mulberry32 를 한 번 돌릴 뿐이다.
    const tries = save.getStage(id, stageVersion(id), recSlot).attempts || 0;
    const lotterySeed = hashSeed('lot:' + id + ':' + tries + ':' + dateNow());
    const stage = buildStage(id, { difficulty, lotterySeed });
    //  개발 확인용 시작 무기(r3.10): rush3.html?weapon=scatter&mk=2 — 규칙엔 startWeapon/startMk 로만 들어가고, 이 판은 기록에 남기지 않는다
    const devStart = devStartWeapon();
    //  r4.4: 메인 로봇 보호 규칙(heroGuard)과 지갑의 로봇 강화 단계(up)는 셸만 넘긴다 — 규칙 모듈 기본값은 꺼짐·0(옵션 없이 부르는 검사·봇은 종전 판)
    run = createRun(stage, { ...devStart, heroGuard, up: save.wallet.get().up });
    run.devWeapon = !!devStart.startWeapon || PROTO_IDS.includes(id) || devPass;
    //  랜덤 길 실제 결과 집계(계약서 3-9 결과 문구). 규칙이 아니라 셸이 갖는 칸이다 — 규칙 모듈은 lottery 를 모른다
    run.lotteryOutcome = run.lottery ? emptyLotteryOutcome() : null;
    //  기록은 stageId + 코스 버전 + 기록 칸(r4.4 — v4 칸 `버전:v4`, 검사 주입 줄이면 그 줄 칸)으로 묶는다
    const ver = run.stageVersion, diff = recSlot;
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
    //  r4.3 코인: 출격 번호(지갑 runNo +1, 출격 시작 쓰기와 함께 — 지갑은 별도 키라 쓰기 1회 더) → 지급 식별자 `${runNo}:main`·`${runNo}:bonus`.
    //   판 안 누계(tally)는 셸 변수 coin 에 둔다(규칙 모듈은 모른다). settled = 정산 결과(판당 kind 마다 1회)
    //  r4.10 goal = 판 끝 목표 종류(결과 화면 내역 이름 '보스'·'중간 보스'·'돌파' — goalKind)
    coin = { runNo: save.wallet.startRun(), tally: createTally(stage, { dev: run.devWeapon }), settled: { main: null, bonus: null }, goal: goalKind(stage) };
    state = 'run';
    loop.start(nowSec());
    au.bgmPlay(BGM.stage[Math.max(0, Math.min(2, id - 1))]);
    return true;
  }

  /** 정산(r4.3, 기획 v4.1 3-7): **지갑에 코인을 더하는 곳은 이 함수 하나.** 부르는 곳 네 곳 — 승리 이벤트(본전투분, commitMain 보다 먼저) ·
   *  보너스 종료(보너스분) · 패배 이벤트(여운 전) · 포기 버튼(결과 화면을 띄우기 전). toTitle 은 부르지 않는다(commitMain 안전망만).
   *  kind = 'main' | 'bonus'. 판당 kind 마다 1회(coin.settled 표식) + 지갑의 지급 식별자로 한 번 더 막는다(새로고침·다른 경로로 다시 불려도 중복 없음).
   *  첫 클리어 판정은 **지갑의 첫 클리어 표식만** 본다 — 승리 프레임에 commitMain 이 cleared 를 먼저 써도 흔들리지 않는다(옛 지옥 칸 클리어도 v4 첫 클리어 1회) */
  function settleRun(kind) {
    const c = run ? coin : null;
    if (!c) return null;
    if (c.settled[kind]) return c.settled[kind];
    const dev = !!run.devWeapon;
    let parts, firstClear = null;
    if (kind === 'main') {
      const won = !!run.won;
      const first = won && !dev && ALL_STAGE_IDS.includes(run.stageId) && !save.wallet.peek().firstClears.includes(run.stageId);
      parts = { ...mainCoins(c.tally, { cleared: won, firstClear: first }), clearKind: null };
      if (parts.clear > 0) parts.clearKind = first ? 'first' : 'replay';
      if (first) firstClear = run.stageId;
    } else {
      const bonus = bonusCoins(run.stageId, run.bonus ? run.bonus.tier : 0, { dev });
      parts = { enemy: 0, boss: 0, bounty: 0, clear: 0, clearKind: null, bonus, total: bonus };
    }
    //  개발용 판은 지갑을 건드리지 않는다(0 코인 — 식별자도 남기지 않는다)
    const res = dev ? { paid: false, coins: save.wallet.get().coins, saved: false }
                    : save.wallet.pay({ id: c.runNo + ':' + kind, amount: parts.total, firstClear });
    c.settled[kind] = { ...parts, paid: res.paid, balance: res.coins };
    return c.settled[kind];
  }

  /** 출격 중 이번 판 코인(정산 전 누계 — HUD): 본전투 적·보스 소수 합의 반올림 + 보너스전이면 지금 단계의 보너스분. 개발용 판 = null(표시 안 함) */
  function liveCoins() {
    const c = run ? coin : null;
    if (!c || run.devWeapon) return null;
    return tallyTotal(c.tally) + (run.bonus ? bonusCoins(run.stageId, run.bonus.tier) : 0);
  }

  /** ⏸ → [작전 중단](giveup, r4.3): 종전엔 곧장 타이틀이었다. 이제 정산 → '작전 중단' 결과 화면 → 선택.
   *  승리·패배 여운(1.3·1.0초) 중이면 원래 결과(승리·패배) 화면 — 정산은 그 이벤트에서 이미 했다.
   *  8번 보너스 도중이면 승리 결과 화면(본전투분만 — 보너스 점수·보너스 코인은 버려진다, 보너스 끝까지 가야 받는다) */
  function giveUp() {
    if (!run) { toTitle(); return; }
    if (run.over) { finishRun(); return; }
    if (run.won) { finishRun({ bonusCut: true }); return; }
    settleRun('main');
    finishRun({ aborted: true });
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
    coin = null;
    au.bgmPlay(BGM.title);
  }

  //  ── r4.5 로봇 강화 화면 ──
  //  살 수 있는 탭인가 = 코인이 저장소에 남는가(읽기 전용 탭·코인 저장 실패·저장소 차단이면 false — 사도 저장되지 않는다)
  const buyAllowed = () => save.wallet.ok;
  //  직격 화력 미리보기의 기준 판 = 곧 할 판: 결과에서 왔으면 승리 = 다음 작전 · 패배·포기 = 방금 판, 타이틀에서 왔으면 타이틀 기본 선택(마지막 판)
  function upgradeRef() {
    let id = upgradeFrom === 'result' && result ? (result.won && result.nextId ? result.nextId : result.stageId) : lastStageId();
    if (!ALL_STAGE_IDS.includes(id)) id = ALL_STAGE_IDS[0];
    if (!bossHpCache.has(id)) {
      let hp = null;
      try { const st = buildStage(id, { difficulty, lotterySeed: 0 }); hp = (st.elites && st.elites[0] && st.elites[0].hp) || null; } catch { hp = null; }
      bossHpCache.set(id, hp);
    }
    return { stageId: id, bossHp: bossHpCache.get(id) };
  }
  /** 강화 화면 열기(from = 'title' | 'result'). 처음 살 수 있는 상태로 연 방문이면 다연발 '추천'(사용자당 1회 — 저장 seenUpRec) */
  function openUpgrade(from) {
    if (from === 'result' && !(state === 'result' && result && run)) return false;
    if (from !== 'result' && state !== 'title') return false;
    upgradeFrom = from === 'result' ? 'result' : 'title';
    const w = save.wallet.get();
    upRec = !save.get().seenUpRec && !hasUp(w.up) && buyAllowed() && canBuy(w, 'multi');
    if (upRec) save.patch({ seenUpRec: true });
    upFlash = null;
    state = 'upgrade';
    return true;
  }
  /** [돌아가기]: 들어온 화면으로. 결과에서 왔으면 **방금 판 결과 화면 그대로**(result·run 유지 → 기본 버튼 그대로), 보유 코인만 새 값으로 */
  function closeUpgrade() {
    if (state !== 'upgrade') return;
    upRec = false; upFlash = null;
    if (upgradeFrom === 'result' && result && run) {
      state = 'result';
      if (result.coins) result.coins.balance = save.wallet.get().coins;
      //  첫 구매 안내는 한 번 봤으니 내린다(돌아온 결과 화면에 다시 띄우지 않는다)
      result.upHint = null;
    } else state = 'title';
  }
  /** [구매]: 같은 프레임에 이미 한 번 샀으면 무시(연타 1회만). 코인이 저장되지 않는 탭은 사지 않는다. 산 뒤 곧바로 버튼을 다시 계산한다 */
  function buyTrack(track) {
    if (state !== 'upgrade' || buyFrame === frameNo || !buyAllowed()) return null;
    const r = save.wallet.buy(track);
    buyFrame = frameNo;
    if (r.ok) {
      upFlash = { track, t: UP_FLASH_SEC };
      //  추천은 첫 구매를 위한 것 — 무엇이든 사면 내린다
      upRec = false;
      au.sfx('weaponSwap');
    }
    view(nowSec());
    return r;
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
    const id = run.stageId, ver = run.stageVersion, diff = recSlot;
    const cur = save.getStage(id, ver, diff);
    //  생존·시간은 **본전투 확정값**(run.mainResult·wonAt — 보너스 구간은 기록에 섞지 않는다). 없으면(옛 run·검사가 won 만 세운 판) 지금 run 값
    const mr = run.mainResult;
    const survivors = mr ? mr.survivors : run.units.length;
    const time = run.wonAt ?? run.time;
    //  best = 성공 판의 최다 생존·최단 시간(각각 독립)
    const isBest = survivors > (cur.bestSurvivors || 0);
    const isBestTime = !(cur.bestTime > 0) || time < cur.bestTime;
    const patch = { cleared: true, bestSurvivors: Math.max(cur.bestSurvivors || 0, survivors), bestTime: cur.bestTime > 0 ? Math.min(cur.bestTime, time) : time };
    //  r4.4 강화 스냅샷(D9′, 3-6): 최다 생존 신기록이면 survUp, 최단 시간 신기록이면 timeUp 을 **각각** 그 기록과 함께 보낸다(그때의 강화 단계 + 규칙 버전).
    //   신기록이 아닌 쪽은 보내지 않는다 — save.mergeStage 도 자기 기록이 좋아질 때만 스냅샷을 바꾼다
    if (isBest) patch.survUp = upSnapshot(run);
    if (isBestTime) patch.timeUp = upSnapshot(run);
    //  구출 기록(r3.14): true 일 때만 쓴다(희소 필드 — false 는 절대 쓰지 않는다). 본전투 안에서 정해지므로 승리 확정과 함께 쓴다
    if (run.objective && run.objective.done) patch.rescued = true;
    if (!run.devWeapon) save.updateStage(id, patch, ver, diff);
    run.mainRecord = { isBest, survivors, time };
    return run.mainRecord;
  }

  //  opts(r4.3): aborted = 포기(작전 중단 — 승패 없음, 코인은 giveUp 이 먼저 정산) · bonusCut = 보너스 도중 포기(보너스 점수·bestBonus 를 버린다)
  function finishRun(opts = {}) {
    const id = run.stageId, ver = run.stageVersion, diff = recSlot;
    const won = !!run.won;
    const aborted = !!opts.aborted;
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
    //   r4.3: 보너스 도중 포기(bonusCut)면 미완 점수는 버린다(종전 toTitle 경로와 같은 규칙 — B-8)
    const bo = opts.bonusCut ? null : run.bonus;
    const isBestBonus = !!bo && bo.score > (cur.bestBonus || 0);
    if (bo) patch.bestBonus = Math.max(cur.bestBonus || 0, bo.score);
    if (!run.devWeapon) save.updateStage(id, patch, ver, diff);
    const o = run.objective;
    const bonus = bo ? { score: bo.score, tier: bo.tier, hits: bo.hits, isBestBonus } : null;
    //  코인(r4.3, 3-9): 정산은 이미 끝났다(settleRun — 승리·패배 이벤트, 보너스 종료, 포기). 여기서는 읽기만 한다
    const c = coin, sm = c && c.settled.main, sb = c && c.settled.bonus;
    const coins = c ? {
      gained: (sm ? sm.total : 0) + (sb ? sb.total : 0),
      enemy: sm ? sm.enemy : 0, boss: sm ? sm.boss : 0, goal: c.goal ?? 'boss', bounty: sm ? (sm.bounty || 0) : 0, clear: sm ? sm.clear : 0, clearKind: sm ? sm.clearKind : null, bonus: sb ? sb.bonus : 0,
      balance: save.wallet.get().coins, dev: !!run.devWeapon,
    } : null;
    const nextId = won && ALL_STAGE_IDS.includes(id + 1) ? id + 1 : null;
    //  r4.5 첫 구매 안내(기획 v4.1 3-4 (나)·3-9): 지갑 잔액이 **처음으로** 가장 싼 1단계 비용 이상이 된 **승리** 결과 화면에서 한 번.
    //   아직 아무것도 사지 않았고(첫 구매) 코인이 저장되는 탭일 때만. 본 적 있음 = 저장 seenUpHint(seenShutter 와 같은 꼴, 사용자당 1회)
    const wNow = save.wallet.get();
    const upHint = won && !run.devWeapon && !save.get().seenUpHint && !hasUp(wNow.up) && buyAllowed() && canBuyAny(wNow);
    if (upHint) save.patch({ seenUpHint: true });
    result = {
      stageId: id, stageVersion: ver, difficulty: run.difficulty, recordSlot: diff, title: run.title, won, survivors, peak, time, timeText: timeText(time), kills,
      //  다음 행동(3-9): 패배·포기 = adviceLine(가장 고칠 만한 원인), 승리 = advice.js 의 승리 문구
      missedLine: missedLine(run), advice: won ? ADVICE_DEFAULT.won : adviceLine(run, run), lottery: lotteryLine(run, { weaponSame: fx.lotSame }), isBest, saveOk: save.ok,
      nextId,
      //  작전 목표(r3.14): 결과 한 줄 + 성공/실패 색 분기용 사본. 목표가 없는 판은 둘 다 null
      objective: o ? { kind: o.kind, done: o.done, missed: o.missed, n: o.n } : null,
      objectiveLine: objectiveLine(run),
      //  보너스전(r3.15): 점수 사본 + 결과 한 줄 '보너스 N점 · 단계 K'. 보너스가 없던 판은 둘 다 null
      bonus, bonusLine: bonusLine(bonus),
      //  r4.3: 작전 중단(포기) · 코인(획득·내역·보유) · 원인 한 줄(패배·포기) · 24번 승리 = 모든 작전 완료 · 코인 저장 여부 · 읽기 전용 탭
      aborted, coins, coinLine: coinBreakdown(coins), causeLine: won ? null : causeLine(run),
      allClear: won && !run.devWeapon && id === ALL_STAGE_IDS[ALL_STAGE_IDS.length - 1] ? ALL_CLEAR_LINE : null,
      coinSaveOk: save.wallet.ok, readOnly: save.readOnly,
      //  r4.5: 첫 구매 안내 한 줄(보조 버튼 [로봇 강화] 아래) | null
      upHint: upHint ? UP_HINT_LINE : null,
    };
    state = 'result';
    loop.stop(nowSec());
    au.bgmPlay(BGM.title);
  }

  //  연출 이벤트 소비(프레임 1회, drainEvents). 규칙 상태는 읽기만 한다
  const rowById = (id) => run.gateRows.find((r) => r.id === id) ?? null;
  //  규칙 좌표에서 연출을 만드는 세 도우미(r3.20): 파편(반지름도 그 자리 배율) · 물체 위 글(dy 는 화면 px) · 부대 위 글(부대 중심 투영점 기준)
  const burstAt = (x, z, r, big, color) => { const q = sp(x, z); spawnBurst(fx, q.x, q.y, r * q.s, big, color); };
  const floaterAt = (x, z, dy, text, color, big = false) => { const q = sp(x, z); floater(fx, q.x, q.y + dy, text, color, big); };
  const floaterSquad = (dy, text, color, big = false) => { const q = squadPt(); floater(fx, q.x, q.y + dy, text, color, big); };
  //  부대 위 반짝임(r3.24): 게이트 양수 통과 — 합류 도착과 같은 별 조각이 위로 튄다
  const squadSparkle = (color) => {
    const q = squadPt();
    for (let j = 0; j < 6; j++) { const an = -Math.PI / 2 + (j - 2.5) * 0.45; fx.parts.push({ x: q.x, y: q.y - 30 * q.s, vx: Math.cos(an) * 120 * q.s, vy: Math.sin(an) * 120 * q.s, t: 0, life: FX.joinFly.sparkleSec, r: 3.4 * q.s, color, shape: 'star' }); }
    trimParts(fx);
  };
  //  '?' 상자가 아직 덮고 있는 랜덤 길 물체인가(통로 확정선 전) — 계약서 3-9 '확정 전에 내용이 새지 않는다'.
  //  ⚠️확정선 전에도 비행 중인 탄은 막힌다(gateBlock). 그 막힘에 함정 전용 표현(붉은 스파크·trapHit)을 쓰면
  //   플레이어가 통로를 고르기 전에 '이번 판은 함정'임을 소리·색으로 알아낸다 — 공개 전에는 종전 셔터 표현으로 되돌린다.
  const hiddenRow = (id) => { const lot = run.lottery; return !!(lot && lot.rowId === id && run.z < lot.revealZ); };
  //  공개된 함정 행인가 = 그리는 쪽(render.isTrapGateRow)이 봉쇄 외형을 쓰는 바로 그 시점부터만 참
  const trapShown = (id) => !hiddenRow(id) && isFixedGateRow(rowById(id));
  function handleEvents(events) {
    collectLotteryOutcome(run.lotteryOutcome, events, run);
    //  r4.3 코인 누계: 이 묶음의 kill(일정 스폰만)·bossKill 을 **먼저** 센다 — 같은 STEP 의 win·lose 를 처리할 때 누계가 이미 완전하다
    if (coin) addEvents(coin.tally, events);
    let guardSfx = false;
    for (const ev of events) {
      switch (ev.type) {
        case 'fire':
          fx.fireCount += ev.count; fx.fireWeapon = ev.weapon;
          //  히어로 사격 시트: 걷기가 heroWalkMinSec 이상 이어진 뒤 오는 발사에 1회(연속 사격이라 매번 재생하면 걷기가 안 보인다)
          if (fx.heroFire <= 0 && fx.heroWalk >= FX.heroWalkMinSec) fx.heroFire = sheetSec('m1_fire');
          break;
        //  피격(r3.24 손맛): 모든 적 — 피격 상태(번쩍임·넉백·스쿼시·HP 튐)·무기별 스파크·'-n'.
        //   잡졸 피격 시트(e_grunt_hit)는 종전대로 **그림이 잡졸(E1)인 잡졸**에만 겹친다(살아남은 경우만 — 죽으면 사망 시트가 대신한다)
        case 'enemyHit':
          onEnemyHit(fx, ev, sp);
          if (ev.kind === 'grunt' && !ev.skin && ev.hp > 0) fx.enemyHit[ev.id] = sheetSec('e_grunt_hit');
          break;
        case 'supplyHit': fx.sfx.push(['crateHit']); break;
        case 'supplyOpen': {
          const q = sp(ev.x, ev.z), y = q.y;
          spawnBurst(fx, q.x, y, 30 * q.s, false, C.gold);
          fx.sfx.push(['crateBreak']);
          const s = run.supplies.find((c) => c.id === ev.id);
          //  캡슐(r3.14)은 깨지는 연출(스파크 + crateBreak)을 그대로 쓰고 팝 문구만 '구출!'
          const text = !s ? '보급' : s.kind === 'soldier' ? '+' + (s.payload.n ?? 0) + '명' : s.kind === 'weapon' ? (WEAPONS[s.payload.weapon]?.name ?? '무기') : s.kind === 'capsule' ? '구출!' : '증원 설비';
          fx.pops.push({ x: q.x, y, x0: q.x, y0: y, t: 0, life: FX.rewardPopSec + 0.3, text, color: C.gold });
          break;
        }
        //  캡슐은 capsuleMissed 가 '캡슐 놓침'을 띄우므로 '놓침'을 겹쳐 그리지 않는다(supplySkipped 의 '다른 길'은 그대로)
        case 'supplyMissed': if (ev.kind !== 'capsule') floaterAt(ev.x, ev.z, -20, '놓침', C.gateZero); break;
        //  구출 캡슐(r3.14): 합류 플로터·효과음은 같은 STEP 의 joinMany 가 이미 낸다 — 여기서는 목표 달성 글 하나만 더 띄운다.
        //   ⚠️캡슐 자리(ev.z)가 아니라 부대 위에 띄운다 — 병력이 많으면 캡슐이 화면 위 끝에 들어오자마자 열려 그 자리 글은 화면 밖이다(2026-09-19 캡처 실측)
        case 'capsuleRescue': floaterSquad(-130, '구출 성공!', C.gold, true); break;
        case 'capsuleMissed': floaterAt(ev.x, ev.z, -20, '캡슐 놓침', C.gateZero); break;
        //  구조적으로 얻을 수 없던 대안 — '놓침'이 아니라 '다른 길'로 알린다(흐려지며 뒤로 빠진다)
        case 'supplySkipped': floaterAt(ev.x, ev.z, -20, '다른 길', C.wall); break;
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
        case 'coverHit': burstAt(ev.x, ev.z, 5, false, C.wall); fx.sfx.push(['gateClang']); break;
        case 'gateBlock': {
          const trap = trapShown(ev.id);
          burstAt(ev.x, ev.z, 6, false, trap ? C.warn : C.wall);
          fx.sfx.push([trap ? 'trapHit' : 'gateClang']);
          break;
        }
        //  열린 행에 맞은 탄: 값이 올라 흰 플래시 + 숫자음. 함정 행은 값이 그대로라 같은 차단 표현을 쓴다(플래시·숫자음 없음)
        case 'gateHit': {
          const hitRow = rowById(ev.id);
          if (trapShown(ev.id)) {
            burstAt(ev.x, hitRow ? hitRow.z : run.z, 6, false, C.warn);
            fx.sfx.push(['trapHit']);
            break;
          }
          //  r4.4 (b) 로봇 다연발의 추가 탄(gateHit 0, 이사님 결정 N3)은 수치를 올리지 않는다(gain 0) — 번쩍임·숫자음 없이 사라진다
          if (ev.gain === 0) break;
          fx.gateFlash[ev.id + ':' + ev.idx] = GATE_FLASH_SEC;
          fx.sfx.push(['gateTick']);
          break;
        }
        case 'gateFlip': fx.gateFlash[ev.id + ':' + ev.idx] = GATE_FLASH_SEC; fx.sfx.push(['gateFlip']); floaterAt(ev.x, run.gateRows.find((r) => r.id === ev.id)?.z ?? run.z, -40, '반전!', C.gatePos, true); break;
        case 'gatePass': {
          if (ev.idx < 0) { floaterSquad(-90, '우회', C.gateZero); break; }
          //  r4.4 메인 로봇 보호(D4′-a): 로봇 혼자 음수 칸을 지나면 빠지는 병사가 없다(applied 0) — '−0' 대신 '로봇 보호'
          //   로봇이 같은 STEP 에 쓰러져 병력 0 이면(applied 0) '로봇 보호'가 사실과 반대다 — 종전처럼 '−0'(r4.4 검토 보정)
          const heroUp = run.units.some((u) => u.hero);
          const txt = ev.value > 0 ? '+' + ev.applied : ev.value < 0 ? (ev.applied === 0 ? (heroUp ? '로봇 보호' : '−0') : '−' + (-ev.applied)) : '0';
          floaterSquad(-90, txt, ev.value > 0 ? C.gatePos : ev.value < 0 ? C.gateNeg : C.gateZero, true);
          //  양수 통과(r3.24): 병사 합류와 같은 꼴 — 부대 위 반짝임
          if (ev.value > 0 && ev.applied > 0) squadSparkle(C.gatePos);
          if (ev.value < 0 && ev.applied < 0) { fx.shakeT = FX.shakeDur; fx.hurtT = FX.hurtFlashDur; fx.sfx.push(['hurt']); }
          else if (ev.value > 0) fx.sfx.push(['gateFlip']);
          break;
        }
        //  병사 합류(r3.24 이사 ②): 통 자리에서 병사들이 튀어나와 부대로 날아가고, **다 도착하는 순간** 부대 위에 '+n명 합류'(크게)와 반짝임
        case 'joinMany':
          if (ev.n >= FX.joinManyAt) fx.sfx.push(['joinMany']);
          onJoin(fx, ev.x, ev.z, ev.n, '+' + ev.n + '명 합류');
          break;
        //  발판(연속 증원): 발판 자리 '+1' 은 종전대로, 병사 한 명이 발판에서 부대로 뛰어든다
        case 'padTake': floaterAt(ev.x, run.z, -70, '+1', C.chainPad); onJoin(fx, ev.x, ev.z ?? run.z, 1, null); break;
        case 'chainOn': floaterAt(ev.x, ev.z, -40, '증원 설비 가동!', C.chainPad, true); break;
        case 'weaponSwap': fx.sfx.push(['weaponSwap']); floaterSquad(-110, (WEAPONS[ev.weapon]?.name ?? ev.weapon) + ' 장착!', WEAPONS[ev.weapon]?.color ?? C.gold, true); break;
        //  r3.10: 같은 무기 통 → Mk 상승 표시. r4.4 표기 '기관총 Mk II!'(종전 '기관총 II 강화!' — '강화'는 판 밖 로봇 강화에만, 기획 v4.1 3-4 (라))
        case 'weaponMk': fx.sfx.push(['weaponSwap']); floaterSquad(-110, (WEAPONS[ev.weapon]?.name ?? ev.weapon) + ' Mk ' + MK_LABEL[ev.mk] + '!', WEAPONS[ev.weapon]?.color ?? C.gold, true); break;
        //  전격포 연쇄: 맞은 쪽에 작은 청보라 스파크
        case 'arc': burstAt(ev.tx, ev.tz, 8, false, WEAPONS.arc.color); break;
        case 'weaponSame':
          //  랜덤 길 무기 통이 동급이라 교체되지 않은 경우 — 결과 한 줄이 '획득'이라 거짓말하지 않게 표식을 남긴다
          if (run.lottery && run.lottery.kind === 'weapon' && run.z >= run.lottery.revealZ) fx.lotSame = true;
          floaterSquad(-90, '같은 무기', C.gateZero);
          break;
        case 'hurt': fx.shakeT = FX.shakeDur; fx.hurtT = FX.hurtFlashDur; fx.sfx.push(['hurt']); floaterAt(ev.x, ev.z, -10, '−' + ev.n, C.heroHurt); break;
        //  r4.4 피해 이전(heroGuard): 로봇 → 대신 맞은 호위로 짧은 빛줄기(효과음은 같은 STEP 의 hurt 가 낸다 — 겹쳐 울리지 않게 따로 내지 않는다)
        case 'heroGuard': {
          const a = sp(ev.x, ev.z), b = sp(ev.tx, ev.tz);
          fx.beams.push({ x0: a.x, y0: a.y - 14 * a.s, x1: b.x, y1: b.y - 6 * b.s, t: 0, life: BEAM_SEC });
          break;
        }
        //  보호막이 꺼진 STEP(마지막 호위가 쓰러지거나 게이트로 빠짐): 로봇 둘레 고리가 깨진다 — 같은 색 링이 퍼지며 사라지고 조각이 흩어진다
        case 'heroGuardOff': {
          const q = sp(ev.x, ev.z);
          fx.shocks.push({ x: q.x, y: q.y, r: 30 * q.s, t: 0, life: 0.35, color: HERO_RING_COLOR });
          fx.burstSeed++;
          for (let i = 0; i < SHIELD_SHARDS; i++) {
            const an = (i / SHIELD_SHARDS) * Math.PI * 2 + fx.burstSeed * 0.5, v = 140 * q.s;
            fx.parts.push({ x: q.x + Math.cos(an) * 24 * q.s, y: q.y + Math.sin(an) * 20 * q.s, vx: Math.cos(an) * v, vy: Math.sin(an) * v, t: 0, life: 0.4, r: 2.4 * q.s, color: HERO_RING_COLOR, shape: 'line' });
          }
          trimParts(fx);
          fx.sfx.push(['gateClang']);
          break;
        }
        case 'heroGuardOn': break;
        case 'unitLost': burstAt(ev.x, ev.z, 9, false, C.heroHurt); break;
        //  사망(r3.24): 종류별 연출(잡졸 파편 · 돌격체 굴러 넘어짐+먼지 · 저격수 마젠타 링 · 장갑체 장갑판+연기 · 카트 큰 폭발+약한 흔들림) + 잔해
        case 'kill':
          onEnemyDeath(fx, ev, sp); fx.sfx.push(['kill']);
          //  r4.7 현상금 적 처치: 보스 처치와 같은 방식 — 큰 폭발 + 다단 폭발 + 흔들림 + '+N 코인'(현상금 1체 몫) 글자
          if (ev.bounty) {
            burstAt(ev.x, ev.z, ev.r, true, C.gold); onBossDeath(fx, ev); fx.shakeT = FX.shakeDur;
            if (coin && !run.devWeapon && coin.tally.perBounty > 0) floaterAt(ev.x, ev.z, -60, '+' + coin.tally.perBounty + ' 코인', C.gold, true);
          }
          break;
        case 'touch':
          fx.shakeT = FX.shakeDur;
          if (ev.kind === 'elite') burstAt(ev.x, ev.z, 12, false);
          else onEnemyDeath(fx, ev, sp);
          //  r4.7 현상금 적 충돌: 붉은 큰 폭발 — 여러 명이 한꺼번에 쓰러지는 자리가 보이게
          if (ev.kind === 'bounty') burstAt(ev.x, ev.z, ev.r, true, C.heroHurt);
          break;
        //  중화기 폭발(r3.24 재조정): 종전 흰 섬광 원(spawnBurst flash)이 맞는 적을 통째로 덮어 피격 반응이 안 보였다(S21 카트 캡처) —
        //   섬광 대신 폭발 반경의 주황 링 + 주황 파편 몇 개. 적 그림 위 번쩍임·스파크는 enemyHit 이 맡는다
        case 'blast': {
          const q = sp(ev.x, ev.z);
          fx.shocks.push({ x: q.x, y: q.y, r: ev.r * q.s, t: 0, life: 0.22, color: C.bulletHeavy });
          fx.burstSeed++;
          for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + fx.burstSeed * 0.7; const v = 150 * q.s; fx.parts.push({ x: q.x, y: q.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.28, r: 3.4 * q.s, color: C.bulletHeavy }); }
          trimParts(fx);
          break;
        }
        //  r4.10 대물결 첫 겹(게임 화면 줄 대물결 판 — 스폰 이벤트의 horde 표시): 판당 1회 정예 경고 슬롯에 '대물결 접근!' + 경고음 + 보스 BGM(판 끝 긴장)
        case 'spawn':
          if (ev.horde && !fx.hordeSeen) {
            fx.hordeSeen = true;
            fx.eliteT = FX.eliteBannerSec; fx.eliteText = HORDE_BANNER_TEXT;
            fx.sfx.push(['elite']); au.bgmPlay(BGM.boss[Math.max(0, Math.min(2, run.stageId - 1))]);
          }
          break;
        //  r4.10 결승선 돌파(대물결 판 — 같은 STEP 에 win 이 뒤따른다): 금색 띠 '결승선 돌파!' + 승리음 + 부대 위 '+N 코인'(판 끝 목표 몫 — 보스 처치와 같은 값)
        case 'finish':
          fx.finishT = FX.finishBannerSec; fx.finishText = FINISH_TEXT;
          fx.sfx.push(['win']);
          if (coin && !run.devWeapon && coin.tally.perBoss > 0) floaterSquad(-150, '+' + Math.round(coin.tally.perBoss) + ' 코인', C.gold, true);
          break;
        //  정예 등장(r3.16 복수 정예): 2~3체가 같은 프레임에 나오므로 index 0 에서만 배너·효과음·BGM(소리가 겹치지 않게). 문구는 체 수를 붙인다
        case 'elite':
          if ((ev.index ?? 0) > 0) break;
          fx.eliteT = FX.eliteBannerSec; fx.eliteText = (ev.total ?? 1) > 1 ? '정예 ' + ev.total + '체 접근!' : '정예 접근!';
          fx.sfx.push(['elite']); au.bgmPlay(BGM.boss[Math.max(0, Math.min(2, run.stageId - 1))]);
          break;
        //  정예 처치: 파편·흔들림은 매번, 효과음은 마지막(left 0)이면 승리음, 아니면 처치음. 남은 목표 배너는 bossesLeft 가 세운다
        //  r3.24: 처치 순간 큰 폭발 + 0.6초에 걸친 다단 폭발(onBossDeath 예약 → tickHitFx)
        case 'bossKill':
          burstAt(ev.x, ev.z, ev.r, true); onBossDeath(fx, ev); fx.shakeT = FX.shakeDur; fx.sfx.push([(ev.left ?? 0) === 0 ? 'win' : 'kill']);
          //  r4.3: 보스 처치 때만 '+코인' 글자(일반 적 처치마다는 띄우지 않는다). 값 = 보스 1체 몫(V × 0.5 ÷ 보스 수)의 반올림
          if (coin && !run.devWeapon && coin.tally.perBoss > 0) floaterAt(ev.x, ev.z, -60, '+' + Math.round(coin.tally.perBoss) + ' 코인', C.gold, true);
          break;
        case 'bossesLeft':
          if (ev.left > 0) { fx.bossBannerText = '정예 ' + (ev.index + 1) + ' 격파 — 남은 목표 ' + ev.left; fx.bossBannerT = FX.bossKillBannerSec; }
          break;
        //  승리 확정 프레임(r3.15 검수 반영): 본전투 기록을 지금 쓴다 — 보너스전·여운 중 나가도 확정된 승리가 남는다
        //   r4.3: 본전투 코인 정산을 commitMain **보다 먼저**(여운·보너스 중에 나가도 지급은 이미 끝났다)
        case 'win': settleRun('main'); commitMain(run); break;
        //  보너스전(r3.15): 시작 배너(슬롯 A) + 합류음 재사용. 정예가 있던 판만 보스 BGM 을 스테이지 BGM 으로 되돌린다
        //   (정예 없는 스테이지에 bonus 를 붙이면 스테이지 BGM 이 이미 흐르고 있어 다시 틀면 처음부터 재시작된다). 승리는 이미 확정 — 결과 화면은 over 로만
        case 'bonusStart':
          fx.bonusT = BAL3.bonus.bannerSec; fx.bonusText = '보너스전! ' + ev.sec + '초';
          fx.sfx.push(['joinMany']);
          if (run.elite) au.bgmPlay(BGM.stage[Math.max(0, Math.min(2, run.stageId - 1))]);
          break;
        case 'bonusTargetHit': fx.sfx.push(['crateHit']); break;
        case 'bonusHit': burstAt(ev.x, ev.z, BAL3.bonus.targetR, false, C.bonusBox); floaterAt(ev.x, ev.z, -30, '+' + ev.value, C.gold); fx.sfx.push(['crateBreak']); break;
        case 'bonusTier': floaterSquad(-130, '보상 단계 ' + ev.tier + '!', C.gold, true); fx.sfx.push(['weaponSwap']); break;
        //  r4.3: 보너스 종료 = 보너스분 정산(단계 K × round(V × 0.25)). 도중에 나가면 이 이벤트가 없어 보너스분은 없다
        case 'bonusEnd': fx.sfx.push(['gateFlip']); settleRun('bonus'); break;
        case 'bonusRespawn': break;
        //  아레나(r3.17): 광장 열림 연출 + 안내 배너(판마다 진입 시 1회). 정예 배너·효과음·BGM 은 같은 STEP 의 elite 이벤트가 맡는다
        case 'arenaEnter': fx.arenaOpen = FX.arenaOpenSec; fx.arenaT = FX.arenaGuideSec; fx.arenaText = ARENA_GUIDE_TEXT; break;
        //  돌진 예고 = 중립 경고음(lotWarn 재사용). 화면의 붉은 원·점선은 이벤트가 아니라 run.boss.state 를 렌더가 직접 읽는다
        case 'bossDashWarn': fx.sfx.push(['lotWarn']); break;
        //  r4.8 보스 공격 예고 → r4.9 (가) **광역 경보만**: 경보음(돌진 예고와 같은 lotWarn). 붉은 경보 구역 그림은 렌더가 run.bossAtk.cur 를 직접 읽는다
        case 'bossTele': fx.sfx.push(['lotWarn']); break;
        //  r4.9 (가) 탄 공격 장전: 장전음만(도로에 안내 없음 — 번쩍임은 렌더가 보스 몸에만 그린다)
        case 'bossCharge': fx.sfx.push(['bossCharge']); break;
        //  발사: 기둥 포격 = 기둥마다 번쩍 + 흔들림 + 폭발음 · 산개탄 = 떨어진 자리 폭발 · 조준 대포·벽·쓸기 = 금속 발사음
        //  r4.9 탄 공격 발사: 발사음(금속 발사 — 탄은 이 순간부터 보인다)
        case 'bossFire': fx.sfx.push(['gateClang']); break;
        //  r4.9 광역 구역이 터짐: 보스 특색 연출(render.drawAtkBlasts — 매연·갈고리·거미줄·열차 질주·쇳물·철퇴·충격파) + 폭발음 + 흔들림(구역 안에 병사가 있으면 크게).
        //   파편은 구역 가운데에 그 보스 탄 색으로
        case 'bossBoom': {
          const s = ev.shape;
          fx.atkBlasts.push({ kind: ev.kind, shape: s, look: ev.look, t: 0, life: ATK_BLAST_SEC[ev.kind] ?? 0.4 });
          const col = (ATK_LOOK[ev.look] ?? ATK_LOOK.debris).color;
          const c = s.t === 'circ' || s.t === 'ring' ? [s.x, s.z] : s.t === 'rect' ? [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2] : null;
          if (c) burstAt(c[0], c[1], 14, ev.kind !== 'rain', col);
          fx.shakeT = Math.max(fx.shakeT, FX.shakeDur * (ev.hits > 0 ? 1 : 0.5));
          fx.sfx.push(['kill']);
          break;
        }
        case 'bossAtkEnd': break;
        case 'bossDash': fx.sfx.push(['gateClang']); break;
        //  보호막(r3.18): 흡수된 탄마다 회색 스파크(차폐물 흡수와 같은 표현), 효과음은 프레임당 1회. 해제는 반전음 + 보스 위 글자
        case 'bossGuard': burstAt(ev.x, ev.z, 4, false, C.wall); if (!guardSfx) { guardSfx = true; fx.sfx.push(['gateClang']); } break;
        case 'bossGuardOff': fx.sfx.push(['gateFlip']); floaterAt(ev.x, ev.z, -70, '보호막 해제!', C.gatePos, true); break;
        //  보스 페이즈(r3.27): 체력이 절반·1/5 아래로 떨어져 보스가 빨라진 순간. 붉은 글 + 흔들림 + 피격 번쩍임 한 번(무슨 일이 일어났는지 보이게)
        case 'bossPhase': {
          //  r4.9 (다) 광분하는 보스(게임 줄)의 두 번째 페이즈는 광분과 같은 STEP(체력 30%) — 글자·소리는 광분 배너(bossRage)가 맡는다(두 번 알리지 않는다)
          const pb = (run.bosses ?? []).find((b) => b.id === ev.id);
          if (ev.phase >= 2 && pb && pb.atk && pb.atk.rage) break;
          fx.sfx.push(['elite']);
          floaterAt(ev.x, ev.z, -70, ev.phase >= 2 ? '보스 광분!' : '보스 각성!', C.gateNeg, true);
          fx.shakeT = FX.shakeDur;
          fx.hit[ev.id] = { t: 0, fa: 0, dir: -1, role: 'elite', n: 1, dmgF: null };   // 피격과 같은 번쩍임 한 번
          break;
        }
        //  r4.9 (다) 보스 광분(체력 30% — 게임 줄): 화면 가운데 '광분!' 배너(약 1초) + 경고음 + 짧은 흔들림 + 보스 번쩍임 한 번.
        //   붉은 오라·맥박·잔떨림·붉은 체력 막대는 렌더가 규칙 bo.rage 를 읽어 계속 그린다
        case 'bossRage':
          fx.rageT = FX.rageBannerSec; fx.rageText = RAGE_TEXT;
          fx.sfx.push(['bossRage']);
          fx.shakeT = Math.max(fx.shakeT, FX.shakeDur * 1.4);
          fx.hit[ev.id] = { t: 0, fa: 0, dir: -1, role: 'elite', n: 1, dmgF: null };
          burstAt(ev.x, ev.z, ev.r, true, RAGE_COLOR);
          break;
        //  착지 충격: 확장 링(화면 좌표·반지름 × 그 자리 배율) + 흔들림. hits > 0 이면 hurt 이벤트가 따로 나므로 피격 플래시·hurt 음은 그쪽이 맡는다
        case 'bossShock': { const q = sp(ev.x, ev.z); fx.shocks.push({ x: q.x, y: q.y, r: ev.r * q.s, t: 0, life: FX.shockRingSec }); fx.shakeT = FX.shakeDur; break; }
        //  r4.3: 패배 = 그때까지의 적·보스분 정산(여운 1.0초 **전** — 여운 중에 나가도 받는다)
        case 'lose': fx.sfx.push(['lose']); settleRun('main'); break;
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
    fx.rageT = Math.max(0, (fx.rageT ?? 0) - dt);
    fx.finishT = Math.max(0, (fx.finishT ?? 0) - dt);
    fx.arenaOpen = Math.max(0, (fx.arenaOpen ?? 0) - dt);
    fx.arenaT = Math.max(0, (fx.arenaT ?? 0) - dt);
    for (const s of fx.shocks) s.t += dt;
    fx.shocks = fx.shocks.filter((s) => s.t < s.life);
    for (const b of fx.beams) b.t += dt;
    fx.beams = fx.beams.filter((b) => b.t < b.life);
    if (fx.atkBlasts) { for (const b of fx.atkBlasts) b.t += dt; fx.atkBlasts = fx.atkBlasts.filter((b) => b.t < b.life); }
    fx.lotOpen = Math.max(0, fx.lotOpen - dt);
    //  동작 시트 타이머: 사격이 끝나면 걷기 시간을 다시 센다 · 피격은 0 이하 삭제 · 쓰러진 잡졸은 재생+머묾이 끝나면 지운다
    fx.heroFire = Math.max(0, fx.heroFire - dt);
    fx.heroWalk = fx.heroFire > 0 ? 0 : fx.heroWalk + dt;
    for (const k of Object.keys(fx.enemyHit)) {
      fx.enemyHit[k] -= dt;
      if (fx.enemyHit[k] <= 0) delete fx.enemyHit[k];
    }
    //  잔해는 저마다 머무는 시간(life, r3.24)이 있다. 옛 꼴(life 없음 = 잡졸)은 사망 시트 + 머묾
    const corpseSec = sheetSec('e_grunt_death') + FX.corpseLingerSec;
    for (const c of fx.corpses) c.t += dt;
    fx.corpses = fx.corpses.filter((c) => c.t < (c.life ?? corpseSec));
    tickHitFx(fx, dt, { sp, squad: squadPt, burstAt });
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
    for (const f of fx.floaters) { f.t += dt; f.y -= (f.dmg ? 60 : 44) * dt; if (f.pop !== undefined) f.pop += dt; }
    fx.floaters = fx.floaters.filter((f) => f.t < f.life);
    //  보상 팝: 0.5초 떠오른 뒤 부대로 흡수
    for (const p of fx.pops) {
      p.t += dt;
      const rise = Math.min(1, p.t / FX.rewardPopSec);
      const ry = p.y0 - 46 * rise;
      if (p.t <= FX.rewardPopSec) { p.x = p.x0; p.y = ry; }
      else {
        const k = Math.min(1, (p.t - FX.rewardPopSec) / 0.3);
        const q = squadPt();   // 부대 중심의 화면점(원근)
        p.x = p.x0 + (q.x - p.x0) * k;
        p.y = ry + (q.y - ry) * k;
      }
    }
    fx.pops = fx.pops.filter((p) => p.t < p.life);
  }

  function view(now) {
    //  r4.3: coinSaveOk = 코인이 저장소에 남는가(쓰기 실패·차단 환경이면 경고) · readOnly = 다른 탭이 먼저 열려 이 탭은 저장하지 않음
    const v = { state, now, buttons: [], saveOk: save.ok, coinSaveOk: save.wallet.ok, readOnly: save.readOnly };
    if (state === 'title') {
      const last = lastStageId();
      //  r4.3 순차 해금: 잠긴 판은 자물쇠·흐린 버튼(disabled — hitButton 이 건너뛴다). 안내('앞 판을 먼저 깨야 합니다')는 잠깐
      const lim = unlockedMax();
      v.notice = notice && notice.t > 0 ? notice.text : null;
      //  r4.2: 난이도 토글 3칸을 지웠다(r4.5: 그 y 382 줄 = [로봇 강화] + 보유 코인 — 아래). r4.4: 스테이지 버튼의 기록(sub)은 v4 칸(`버전:v4`)의 기록이고,
      //   옛 지옥 칸(`버전:brutal`)의 기록은 지우지 않고 '이전 기록'으로 흐리게 병기한다(prev)
      //  24스테이지(B-2): 한 페이지 8칸(2열×4행) + 페이지 넘김
      const pg = curTitlePage(), pages = titlePages();
      for (let i = 0; i < TITLE_PAGE; i++) {
        const id = ALL_STAGE_IDS[pg * TITLE_PAGE + i];
        if (id === undefined) break;
        //  r4.4(D9′): 칸 기록(sub) = v4 칸(검사 주입 줄이면 그 줄 칸). 옛 지옥 칸을 이긴 기록이 있으면 그 아래 작고 흐리게 '이전 기록'(prev)
        const m = stageMeta(id), st = save.getStage(id, stageVersion(id), recSlot);
        const prev = recSlot !== PREV_REC_SLOT ? prevRecordLine(save.getStage(id, stageVersion(id), PREV_REC_SLOT)) : null;
        //  구출 기록(r3.14)은 그 기록 칸에서 한 번이라도 구출했으면 어느 상태에든 덧붙인다(없던 필드는 false 로 읽힌다)
        const sub = (st.cleared ? '완료 · ' + st.bestSurvivors + '명 · ' + timeText(st.bestTime) : st.attempts > 0 ? '도전 ' + st.attempts + '회' : '미도전')
          + (st.rescued === true ? ' · 구출✓' : '');
        const col = i % 2, row = Math.floor(i / 2);
        const locked = id > lim;
        v.buttons.push({ id: 'stage' + id, x: 60 + col * 184, y: TITLE_GRID.y + row * TITLE_GRID.dy, w: 176, h: TITLE_GRID.h, label: id + ' ' + m.title,
          sub: locked ? '잠김' : sub, primary: last === id && !locked, small: true, ...(locked ? { disabled: true, locked: true } : {}),
          ...(prev && !locked ? { prev } : {}) });
      }
      v.buttons.push({ id: 'pageL', x: 60, y: TITLE_GRID.pageY, w: 100, h: 40, label: '◀ 이전', small: true, primary: false, disabled: pg === 0 });
      v.buttons.push({ id: 'pageInfo', x: 168, y: TITLE_GRID.pageY, w: 144, h: 40, label: (pg + 1) + ' / ' + pages, small: true, primary: false });
      v.buttons.push({ id: 'pageR', x: 320, y: TITLE_GRID.pageY, w: 100, h: 40, label: '다음 ▶', small: true, primary: false, disabled: pg >= pages - 1 });
      //  r4.5: 종전 난이도 토글 줄(y 382)에 [로봇 강화] + 보유 코인(v.coins — render 가 버튼 왼쪽에 코인 그림과 함께 그린다). 코인이 없어도 들어가 볼 수 있다
      v.buttons.push({ id: 'upgrade', ...TITLE_UPGRADE_BTN, label: '로봇 강화', small: true });
      v.coins = save.wallet.get().coins;
      v.buttons.push({ id: 'mute', x: 422, y: 14, w: 44, h: 44, label: au.isMuted() ? '🔇' : '🔊' });
    } else if (state === 'upgrade') {
      //  r4.5 강화 화면 — 결과에서 들어와 run 이 남아 있어도 판 장면(v.run)은 넘기지 않는다(render 가 강화 화면만 그린다)
      const w = save.wallet.get(), allowed = buyAllowed(), ref = upgradeRef();
      const rows = UP_TRACKS.map((t) => ({ track: t, ...upgradeLines(w.up, t, ref), rec: t === 'multi' && upRec, recText: UP_REC_TEXT }));
      v.upgrade = {
        head: UPGRADE_HEAD, coins: w.coins, coinSaveOk: save.wallet.ok,
        blocked: allowed ? null : (save.readOnly ? UP_BLOCK_TEXT.readOnly : UP_BLOCK_TEXT.unsaved),
        rows, flash: upFlash ? { i: UP_TRACKS.indexOf(upFlash.track), k: upFlash.t / UP_FLASH_SEC } : null,
      };
      //  [구매]: 트랙 카드마다 오른쪽 아래(render.upgradeBuyBox — 그리는 상자 = 누르는 상자). 코인 부족·최대 단계·저장 안 되는 탭 = 흐리게(disabled — hitButton 이 건너뛴다).
      //   같은 프레임에 이미 산 뒤에도 흐리게(연타 1회만 — 누른 즉시 반영)
      const lock = buyFrame === frameNo;
      v.buttons = rows.map((row, i) => {
        const box = upgradeBuyBox(i);
        if (row.cost === null) return { id: 'buy_' + row.track, ...box, label: '최대 단계', small: true, disabled: true };
        const ok = allowed && !lock && canBuy(w, row.track);
        return { id: 'buy_' + row.track, ...box, label: '구매', sub: row.cost + ' 코인', primary: ok, disabled: !ok };
      });
      v.buttons.push({ id: 'back', ...UPGRADE_UI.back, label: '돌아가기' });
    } else if (run) {
      v.run = run;
      const paused = state === 'paused';
      v.fx = paused ? { ...fx, gateFlash: { ...fx.gateFlash }, gateOpen: { ...fx.gateOpen }, shakeT: 0, hurtT: 0 } : fx;
      //  r4.3: coins = 이번 판 코인(정산 전 누계 — 종전 난이도 칩 자리에 작게). 개발용 판은 null(칩 없음)
      v.hud = { distM: Math.max(0, Math.round((run.length - run.z) / 10)), coins: liveCoins() };
      v.flat = flat;
      if (state === 'run') {
        v.buttons = [{ ...HUD_BTN }];
      } else if (state === 'paused') {
        v.buttons = [
          { id: 'resume', x: 120, y: 400, w: 240, h: 56, label: '계속하기', primary: true },
          //  r4.3: 종전 [스테이지 선택](곧장 타이틀) → 정산 → 결과 화면. 판이 끝난 뒤(여운·보너스)엔 그 판의 결과 화면이라 '결과 보기'
          { id: 'giveup', x: 120, y: 480, w: 240, h: 44, label: run.over || run.won ? '결과 보기' : '작전 중단' },
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
        const titleY = (result.nextId ? 620 : 552) + noteGap;
        bs.push({ id: 'title', x: 120, y: titleY, w: 240, h: 44, label: '스테이지 선택' });
        //  r4.5 보조 버튼 [로봇 강화](3-9): 살 수 있는 단계가 있을 때만(코인이 저장되는 탭), 작게·강조 없이 [스테이지 선택] 아래. 기본 버튼(Enter)은 그대로
        if (buyAllowed() && canBuyAny(save.wallet.get())) {
          const S = RESULT_UPGRADE_SLOT;
          bs.push({ id: 'upgrade', x: S.x, y: titleY + S.dy, w: S.w, h: S.h, label: '로봇 강화', small: true });
        }
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
      if (id === 'pageL') { titlePage = Math.max(0, curTitlePage() - 1); }
      else if (id === 'pageR') { titlePage = Math.min(titlePages() - 1, curTitlePage() + 1); }
      else if (id === 'pageInfo') { /* 표시 전용 */ }
      else if (id === 'upgrade') openUpgrade('title');
      else if (id.startsWith('stage')) startRun(Number(id.slice(5)));
    } else if (state === 'upgrade') {
      if (id === 'back') closeUpgrade();
      else if (id.startsWith('buy_')) buyTrack(id.slice(4));
    } else if (state === 'run') {
      if (id === 'pause') pause();
    } else if (state === 'paused') {
      if (id === 'resume') resume();
      else if (id === 'giveup') giveUp();
    } else if (state === 'result') {
      if (id === 'retry') startRun(result.stageId);
      else if (id === 'next' && result.nextId) startRun(result.nextId);
      else if (id === 'title') toTitle();
      else if (id === 'upgrade') openUpgrade('result');
    }
    return true;
  }

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  }

  //  앱 전환·창 이탈·포인터 취소: 입력 해제 + 자동 일시정지
  const autoPause = () => { input.reset(); pause(); };
  //  화면 좌표 → 트랙 좌표(r3.20). 마우스 절대 위치(pointerX)는 부대 줄(d 0, 배율 near)의 역투영. 터치·펜 드래그도 같은 역투영을 거친다
  //   (검수 반영 2026-09-20 — 처음엔 상대 이동이라 그대로 넘겼는데 손가락 100px 에 부대가 화면 145px(가까이 180px) 움직여 손가락과 부대가
  //   어긋났다. 역투영이 선형이라 이동량이 1/near 로 줄어 손가락 1:1 이 된다). 세로(dragDy, 아레나)도 같은 이유로 부대 줄 기울기 near
  //   (d 0 에서 dy/dd = s(0))로 나눈다 — 상대 이동만 쓰므로 나누기만으로 충분하다
  const trackX = (sx) => proj().unproject(sx);
  const trackY = (sy) => sy / proj().near;

  canvas.addEventListener('pointerdown', (e) => {
    au.unlock();
    if (state === 'title' || state === 'result' || state === 'upgrade') au.bgmPlay(BGM.title);
    const [x, y] = toLogical(e);
    if (onPress(x, y)) return;
    //  y(r3.17 아레나 세로 입력)는 뒤에 붙는 선택 인자 — 도로에서는 규칙이 읽지 않는다
    if (state === 'run') input.onPointerDown(trackX(x), e.pointerType, e.pointerId, trackY(y));
  });
  //  r3.18 대항 검수 반영: 출격 중(state 'run')에만 넘긴다. 정지 화면에서 ⏸ → [계속하기]로 마우스를 옮긴 만큼 dragDy 가 쌓여
  //   재개 첫 STEP 에 부대가 광장 아래로 튀던 문제(tay −242 → +40). pause() 의 input.reset() 뒤 정지 중 이동은 버리고, 재개 뒤 첫 이동은 lastY 기준만 잡는다
  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'run') return;
    const [x, y] = toLogical(e);
    input.onPointerMove(trackX(x), e.pointerType, e.pointerId, trackY(y));
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
        //  r4.5: 강화 화면의 ESC = [돌아가기](들어온 화면으로). Enter·Space 는 강화 화면에서 아무 일도 하지 않는다(실수로 사지 않게)
        else if (state === 'upgrade') closeUpgrade();
        return;
      }
      if (input.onKey(code, true)) { if (e.preventDefault) e.preventDefault(); return; }
      //  r4.2: 타이틀의 1/2/3(난이도 선택) 분기를 지웠다 — 숫자 키는 이제 아무 일도 하지 않는다
      if (code === 'Space' || code === 'Enter') {
        if (state === 'title') startRun(lastStageId());
        //  r4.3 결과 화면 기본 버튼(3-9): 승리 = [다음 작전], 패배·포기 = [다시 도전](종전엔 승패와 상관없이 재도전). 24번 승리(다음 없음)는 [다시 도전]
        else if (state === 'result') startRun(result.won && result.nextId ? result.nextId : result.stageId);
        else if (state === 'paused') resume();
      }
    });
    win.addEventListener('keyup', (e) => { input.onKey(keyCode(e), false); });
  }
  if (doc) doc.addEventListener('visibilitychange', () => { if (doc.hidden) autoPause(); });

  //  개발 콘솔 관찰용(게임 동작에 영향 없음). r4.2: 난이도 관찰값(difficulty)은 지웠다 — 출격 줄은 늘 하나(run.difficulty 로만 남는다)
  const dbg = () => ({
    state, stageId: run ? run.stageId : null,
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
    flat, perspective: projectorMode({ flat }),
    //  손맛(r3.24) 관찰: 지금 피격 반응 중인 적의 역할 목록 · 날아가는 병사 수 · 잔해 역할 목록 · 파편 수 — 캡처 스크립트가 '맞는 순간'을 잡는다
    hitRoles: Object.values(fx.hit).filter((h) => h.t < FX.hit.knockSec).map((h) => h.role),
    //  화면 안(부대 앞 거리 d 80~520)에서 반응 중인 적만 — 먼 곳(화면 위 밖)에서 맞기 시작하는 적을 캡처가 기다리지 않게
    hitSeen: run ? run.enemies.concat(run.bosses).filter((e) => !e.dead && fx.hit[e.id] && fx.hit[e.id].t < FX.hit.knockSec && e.z - run.z > 80 && e.z - run.z < 520).map((e) => fx.hit[e.id].role) : [],
    recruits: fx.recruits.length, corpseRoles: fx.corpses.map((c) => c.role ?? 'grunt'), parts: fx.parts.length, booms: fx.booms.length,
    //  r4.3 코인·해금 관찰: 이번 판 누계(HUD 값)·보유 코인·열린 마지막 판·읽기 전용 탭·탭 id
    coins: run ? liveCoins() : null, wallet: save.wallet.get().coins, unlocked: unlockedMax(), readOnly: save.readOnly, tabId: tab.id,
    //  r4.4 메인 로봇 관찰: hero(로봇이 살아 있는가) · heroShield(보호막 켜짐) · heroGuard(보호 규칙 켬)
    hero: !!(run && run.units.some((u) => u.hero)), heroShield: !!(run && run.heroShield), heroGuard: !!(run && run.heroGuard),
    //  r4.5 로봇 강화 관찰: 지갑의 강화 단계 · 강화 화면을 어디서 열었는가(state 'upgrade' 일 때) · 이번 판 로봇 강화 단계(run.up)
    up: save.wallet.get().up, upgradeFrom: state === 'upgrade' ? upgradeFrom : null, runUp: run ? { ...run.up } : null,
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
    //  r4.5: 프레임 번호(같은 프레임 [구매] 연타 판정) · 방금 산 줄의 금색 테 타이머
    frameNo++;
    if (upFlash) { upFlash.t -= dt; if (upFlash.t <= 0) upFlash = null; }
    if (notice) { notice.t -= dt; if (notice.t <= 0) notice = null; }
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

  //  r4.2: 외부 API 의 getDifficulty/setDifficulty 는 지웠다(난이도 선택 삭제)
  //  r4.3: giveUp(⏸ → [작전 중단] 과 같은 경로) · getResult(결과 화면 값) · getNotice(스테이지 선택 안내)
  //  r4.5: openUpgrade('title' | 'result') · closeUpgrade([돌아가기]와 같은 경로) · buyTrack(트랙 — [구매]와 같은 경로) · getButtons(지금 화면의 버튼 — 검사·캡처용)
  const api = { dbg, ready, startRun, pause, resume, toTitle, giveUp, getState: () => state, getRun: () => run, getFx: () => fx, getResult: () => result,
                getNotice: () => (notice ? notice.text : null), openUpgrade, closeUpgrade, buyTrack, getButtons: () => buttons, loop, input };
  //  r4.5 개발 확인용(?dev=1 일 때만): 캡처 스크립트가 결과 화면·강화 화면을 부를 수 있게 앱 손잡이를 창에 둔다(게임 동작에는 영향 없음 — __rush3Dbg 와 같은 결)
  if (win && devFlag()) win.__rush3App = api;
  return api;
}

if (typeof document !== 'undefined' && document.getElementById?.('game3')) boot(document.getElementById('game3'));
