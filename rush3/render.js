// rush3/render.js — 캔버스 그리기 전담(계약서 6장). 게임 판단은 하지 않고 view 를 그대로 그린다.
//  헬퍼(drawImgCentered/shadow/roundRect/drawParts/drawFloaters/drawButtons/흔들림/비네트/일시정지/적 폴백/적탄)는
//  rush/render.js 에서 복제. 게이트·보급·부대·벽·HUD·결과·타이틀은 신규. 시계는 view.now 만 쓴다.
//  화면 좌표는 r3.20 부터 원근 투영(rush3/project.js)이 만든다: (x, d = z − run.z) → { x, y, s }. 종전 평면 변환 y = LINE_Y − d 는 flat 모드(?flat=1)로 남는다.
import { BAL3 } from './balance.js';
import { PERSPECTIVE, projectorFor, projectorMode } from './project.js';
import { WEAPONS } from './weapons.js';
import { gateColor, gateLabel } from './gates.js';

const W = BAL3.view.w, H = BAL3.view.h, LINE_Y = BAL3.view.LINE_Y;
//  병력 수 글(부대 중심 마커 옆, 수정 라운드 2): 마커에서 COUNT_DX 떨어져 쓰고, 마커 x 가 COUNT_FLIP_X 를 넘으면 왼쪽에 쓴다(세 자리 26px ≈ 46px 가 화면 밖으로 안 나가게)
export const COUNT_DX = 14, COUNT_FLIP_X = W - 70;
const ROAD0 = BAL3.road.x0, ROAD1 = BAL3.road.x1;
const C = BAL3.colors;
const FX = BAL3.fx;
const FONT = 'system-ui, sans-serif';
const ENEMY_FALLBACK = C.enemy;
const ENEMY_SPRITE = { grunt: 'e_grunt', rusher: 'e_rusher', shooter: 'e_shooter' };
//  r3.26 3상태 그림: 적 → 그림 파일 이름(skin 이 있으면 그 파일). 이 이름에 'hit:'·'dmg:'·'dead:' 를 붙인 키가 3상태 그림이다
const ENEMY_ART_BASE = Object.freeze({ grunt: 'E1_scrapbit', rusher: 'E5_wheeler', shooter: 'E6_signaler', elite: 'B1_grader' });
export function artBase3(kind, skin) { return skin || ENEMY_ART_BASE[kind] || null; }
//  손상 그림으로 바꾸는 문턱 = 남은 체력이 스폰 체력의 절반 이하일 때(여러 발 맞는 적만 — 한두 방에 죽는 적은 볼 틈이 없다)
export const DMG_ART_AT = 0.5;
export function wantsDmgArt(hp, hpMax) { return (hpMax ?? 0) > 2 && hp > 0 && hp <= hpMax * DMG_ART_AT; }
const ENEMY_LABEL = { grunt: '잡졸', rusher: '돌격체', shooter: '저격수' };
//  사격 개시선 옆 안내(계약서 6장 N2-⑤). ⚠️선을 넘는 주체는 **게이트**다 — 플레이어가 넘는다는 뜻으로 읽히면
//   벽의 통로 확정선과 헷갈린다(2026-09-17 2차 검수 N2-④).
export const ARM_LINE_TEXT = '이 선 안으로 온 게이트를 쏠 수 있어요';
//  함정 게이트 = 랜덤 길 ⑤(BAL3.lottery.pool 의 good:false 이면서 maxValue === value). 모든 칸이 음수이고 상한이 자기 값 이하라
//   몇 발을 맞아도 값이 그대로다(gates.js 값 갱신 공식). 셸의 isFixedGateRow 가 이 함수를 그대로 쓴다 —
//   외형·꼬리표·짧은 글이 언제나 같은 행에서 같은 말을 하도록 판정식을 한 곳에만 둔다.
export function isTrapGateRow(row) {
  const cells = row && Array.isArray(row.cells) ? row.cells : null;
  if (!cells || cells.length === 0) return false;
  return cells.every((c) => c.value < 0 && c.maxValue != null && c.maxValue <= c.value);
}
//  함정 칸 옆 배지(2026-09-17 이사 결정 ③ 함정 외형 A) — 이 장치에는 사격이 안 먹힌다
export const TRAP_BADGE_TEXT = '쏴도 안 줄어듦';
//  결과 화면 [다시 도전] 아래 부연(2026-09-17 이사 결정 ①) — 랜덤 길은 재도전마다 새로 뽑는다
export const RETRY_LOTTERY_NOTE = '랜덤 길은 새로 추첨';
//  칸 위 짧은 글의 화면 상단 한계(HUD 아래). 행이 화면 밖에서 들어오는 동안에도 글이 보이게 여기에 붙인다
const TIP_MIN_Y = 96;
//  난이도 짧은 표기 색(HUD 태그·결과 제목). normal 은 표기 없음(BAL3.difficulty[id].short 가 빈 문자열)
const DIFF_COLOR = { hard: C.bulletHeavy, brutal: C.gateNeg };
const diffShort = (id) => BAL3.difficulty[id]?.short ?? '';

//  HUD 상단 줄의 **자리표 단일 출처**(2026-09-18 이사 소견: "난이도 칩·무기 칩·⏸ 버튼 크기가 제각각이고 높이가 안 맞는다").
//   세 조각(난이도 칩·무기 칩·⏸)은 같은 높이 h·같은 세로 중심선 cy·같은 모서리 반경 r·같은 글자 크기 fs 를 쓰고,
//   화면 오른쪽 끝에서 right 만큼 띄운 자리부터 gap 간격으로 왼쪽으로 줄을 선다. 왼쪽 STAGE 제목도 같은 cy 에 중심을 맞춘다.
//  ⚠️⏸ 의 **히트 영역**(main.js HUD_BTN)도 이 표에서 나온 상자를 그대로 받는다 — 그린 자리와 누르는 자리가 갈라지지 않게
//   좌표를 두 곳에 적지 않는다. main.js 는 render.js 를 이미 import 하므로 방향은 render → main 하나뿐이다(역방향은 순환).
const HUD_TOP = 16, HUD_H = 36, HUD_R = 18, HUD_FS = 15, HUD_GAP = 8, HUD_RIGHT = 14;
const hudBoxOf = (w, right) => Object.freeze({ x: right - w, y: HUD_TOP, w, h: HUD_H });
const HUD_PAUSE = hudBoxOf(44, W - HUD_RIGHT);
const HUD_WEAPON = hudBoxOf(122, HUD_PAUSE.x - HUD_GAP);
const HUD_DIFF = hudBoxOf(64, HUD_WEAPON.x - HUD_GAP);
//  무기 강화 단계 표기(r3.10). Mk I 은 표기 없음
export const MK_LABEL = Object.freeze(['', '', ' II', ' III']);
//  '가까이' 토글(r3.20 — r3.19 의 확대 보기(균일 k 배)를 **원근 강도 토글**로 대체): 화면 전용. 규칙은 모르는 값이다.
//  꺼짐 = 표준 원근(near 1.45·far 0.72) · 켜짐 = 가까이(near 1.8·far 0.6) — 앞은 그대로 보이고 부대만 더 크다(PERSPECTIVE, project.js).
//  chip = HUD 왼쪽 셋째 줄의 토글 상자(셸이 버튼으로 넘기고 drawButtons 가 그린다). 저장 필드 zoom(save.js)은 그대로 재사용(뜻만 바뀜).
export const ZOOM = Object.freeze({ chip: Object.freeze({ x: 16, y: 84, w: 70, h: 26 }), label: Object.freeze({ off: '가까이 ○', on: '가까이 ●' }) });

//  탄 그림의 화면 길이(px, Mk I 기준). 무기마다 실루엣이 달라 길이도 다르게: 저격 바늘이 가장 길고 산탄 펠릿 뭉치는 짧고 넓다
export const BULLET_LEN = Object.freeze({ rifle: 24, auto: 26, heavy: 34, scatter: 22, sniper: 48, arc: 34 });
//  탄의 진행 방향(라디안, 0 = 화면 위). vx 가 있는 탄(산탄 부채꼴·아레나 자동 조준)은 그 방향으로 그림을 돌린다
//  체력 숫자를 생략하는 화면 위 띠: HUD 줄(제목·남은 거리·난이도/무기/가까이 칩) 아래 선.
//  ⚠️원근에서는 그리는 y 가 곧 화면 y 다(균일 확대 변환 없음) — 되돌릴 배율이 없다
export const HP_TAG_MIN_Y = ZOOM.chip.y + ZOOM.chip.h + 18;

//  손맛(r3.24): 적 종류 → 피격·사망 반응 역할. skin(역할 그림)이 우선이고 없으면 kind. 정예·아레나 보스 = 'elite'.
//   셸(main.js)과 렌더가 같은 함수를 쓴다 — 셸이 만든 반응과 그리는 반응이 갈라지지 않게 판정식은 여기 한 곳
export function hitRole(kind, skin) {
  if (kind === 'elite') return 'elite';
  const bySkin = skin ? FX.hitRoleBySkin[skin] : null;
  if (bySkin) return bySkin;
  return kind === 'rusher' || kind === 'shooter' ? kind : 'grunt';
}
//  피격 번쩍임 색(검사 V3-HITFEEL 이 이 값으로 그리기 호출을 찾는다)
export const HIT_FLASH_FILL = '#FFFFFF';

export function bulletAngle(b) {
  const vx = b.vx || 0, vz = b.vz || 1;
  return vx === 0 ? 0 : Math.atan2(vx, vz);
}

export const HUD_ROW = Object.freeze({
  top: HUD_TOP, h: HUD_H, r: HUD_R, fs: HUD_FS, gap: HUD_GAP, right: HUD_RIGHT,
  cy: HUD_TOP + HUD_H / 2,
  //  왼쪽 두 줄: 제목은 세 칩과 같은 중심선, 남은 거리는 그 아래 한 줄
  left: 16, titleFs: 20, titleFsSmall: 17, distFs: 15, distCy: HUD_TOP + HUD_H / 2 + 28,
  box: Object.freeze({ diff: HUD_DIFF, weapon: HUD_WEAPON, pause: HUD_PAUSE }),
});

export function createRenderer3(ctx, sprites) {
  const get = (k) => (sprites && typeof sprites.get === 'function' ? sprites.get(k) : null);
  //  동작 시트(sprites.sheet(key) → { img, cols, frames, fw, fh, fps, loop, refH } 또는 null → 정지 그림/폴백)
  const sheet = (k) => (sprites && typeof sprites.sheet === 'function' ? sprites.sheet(k) : null);
  //  무기 아이콘(옆모습, 총구 오른쪽). 없으면 null → 호출부가 종전 도형을 그린다
  const icon = (id, mk = 1) => (sprites && typeof sprites.icon === 'function' ? sprites.icon(id, mk) : null);
  //  아이콘을 (x, y) 중심·높이 h 로. 폭은 그림 비율(가로로 긴 옆모습) — 칩·통 안에서 maxW 를 넘지 않게 줄인다
  function drawIconCentered(im, x, y, h, maxW) {
    let w = h * (im.width / im.height);
    if (maxW && w > maxW) { h *= maxW / w; w = maxW; }
    ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
  }
  //  시트의 한 칸을 (x, y) 중심에 그린다. bodyH = 몸통 높이(px). 배율은 칸 높이가 아니라 refH 기준 —
  //  칸이 큰 시트(사격 섬광·사망 파편)와 작은 시트 사이에서 몸 크기가 같게 보인다
  function drawSheetFrame(sh, frame, x, y, bodyH, alt = null) {
    const f = Math.max(0, Math.min(sh.frames - 1, Math.floor(frame)));
    const sx = (f % sh.cols) * sh.fw, sy0 = Math.floor(f / sh.cols) * sh.fh;
    const k = bodyH / sh.refH, dw = sh.fw * k, dh = sh.fh * k;
    //  alt = 같은 시트의 흰 실루엣(whiteOf) — 원본 대비 축척 a.k 로 같은 칸을 잘라 같은 자리에 찍는다
    if (alt) ctx.drawImage(alt.c, sx * alt.k, sy0 * alt.k, sh.fw * alt.k, sh.fh * alt.k, x - dw / 2, y - dh / 2, dw, dh);
    else ctx.drawImage(sh.img, sx, sy0, sh.fw, sh.fh, x - dw / 2, y - dh / 2, dw, dh);
  }
  //  피격 번쩍임용 흰 실루엣(r3.24): 그림 모양 그대로 흰색으로 칠한 사본을 그림마다 한 번만 만든다(작업 캔버스에 그림 → source-in 흰 채움).
  //   ⚠️본 캔버스에서 source-atop 을 쓰면 배경이 불투명이라 도로까지 하얘진다 — 그래서 사본을 만든다. 긴 변 maxPx 로 줄여 메모리를 아낀다.
  //   DOM 이 없는 환경(Node 검사)·그림이 아직 없으면 null → 호출부가 도형 폴백에 흰 채움으로 번쩍인다
  const whiteCache = new Map();
  function whiteOf(img, maxPx = 256) {
    if (!img || typeof document === 'undefined' || !document.createElement || !(img.width > 0)) return null;
    const hit = whiteCache.get(img);
    if (hit !== undefined) return hit;
    let out = null;
    try {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = HIT_FLASH_FILL;
      g.fillRect(0, 0, c.width, c.height);
      out = { c, k };
    } catch { out = null; }
    whiteCache.set(img, out);
    return out;
  }
  //  경과 시간 t(초) → 칸 번호. loop 면 순환, 아니면 마지막 칸에 머문다
  function sheetFrameAt(sh, t) {
    const f = Math.floor(Math.max(0, t) * sh.fps);
    return sh.loop ? f % sh.frames : Math.min(sh.frames - 1, f);
  }

  function drawImgCentered(key, x, y, h, fallbackFn) {
    const im = get(key);
    if (im) {
      const w = h * (im.width / im.height);
      ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
    } else if (fallbackFn) fallbackFn();
  }

  //  접지 그림자 — 유닛·적·통 발밑 공통
  function shadow(x, y, w) {
    ctx.fillStyle = 'rgba(20,25,35,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  //  외곽선 글자(밝은 배경 위에서도 읽히게)
  function outlinedText(text, x, y, px, color, weight = 'bold', lw = 5, maxWidth) {
    ctx.font = weight + ' ' + px + 'px ' + FONT;
    ctx.lineWidth = lw;
    ctx.strokeStyle = C.outline;
    if (maxWidth > 0) { ctx.strokeText(text, x, y, maxWidth); ctx.fillStyle = color; ctx.fillText(text, x, y, maxWidth); return; }
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  //  ── 원근 투영(r3.20) ─────────────────────────────────────────────────────────────────────────────────────────
  //  P = 이번 프레임의 투영기(draw 가 view.flat/view.zoom 으로 고른다). 세계 물체는 전부 P.project(x, d) 한 곳을 지나 화면에 오른다.
  //   d = z − run.z(부대 기준선 앞 거리). 규칙 좌표(x, z)는 한 줄도 바뀌지 않는다 — 바뀌는 것은 화면에 찍히는 자리와 크기뿐.
  let P = projectorFor('standard');
  const pj = (x, d) => P.project(x, d);
  //  화면 밖 판정은 **평면 기준 d** 로 한다(y < −m ⇔ d > LINE_Y + m, y > H + m ⇔ d < LINE_Y − H − m) —
  //   원근에서도 같은 물체 집합을 그려 평면과 그리기 호출 수가 같다(검사 V3-PROJECT 렌더). 원근에서 조금 더 밖에 있는 것을 그려도 해가 없다
  const offscreen = (d, m) => d > LINE_Y + m || d < LINE_Y - H - m;
  //  글자 크기: 배율을 곱하되 하한. 게이트 값·통 내구·표지 글은 PERSPECTIVE.minFont(15) — 01 §11 "멀리 있는 물체도 선택에 필요한 큰 숫자"
  const fsMin = (px, s) => Math.max(PERSPECTIVE.minFont, px * s);
  const fs = (px, s, min = 11) => Math.max(min, px * s);
  //  네 꼭짓점 경로(사다리꼴). 벽·차폐물·도로처럼 z 로 긴 물체는 앞뒤 가장자리를 따로 투영한다
  function quad(a, b, c, d) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }
  //  배경 그림·도로를 세로로 나누는 조각 수. 배경 그림은 조각마다 **세로만** 원근으로 샘플링한다(먼 곳 행이 위로 몰린다).
  //   ⚠️가로 배율은 걸지 않는다(2026-09-22 이사 지적 "우측 배경이 계단현상"): 조각마다 가운데 배율 하나로 폭을 줄이면 조각 경계마다
  //   가장자리가 (Δs/조각수)·(W/2) ≈ 5.6px 씩 점프해 세로선(기둥·창틀)이 톱니로 끊겼고, 그 빈 자리를 메우던 거울상이 위쪽 대칭 복제로 보였다.
  //   조각 수로 1px 아래까지 줄이려면 약 180조각(프레임 저하). 가로로 좁아지는 원근감은 도로 사다리꼴·차선·물체 크기가 담당한다
  const BG_STRIPS = 32;
  //  ARENA 그림의 검은 테두리 폭(논리 px) — 전폭으로 그릴 때도 화면 가장자리에 검은 띠가 보이지 않게 잘라 낸다
  const ARENA_CROP = 16;

  //  배경: 옆 땅 + BG 타일(있으면, 세로 32조각·가로 전폭) + 도로(사다리꼴) + 차선(세계 좌표의 대시를 투영) + 도로 경계.
  //  도로와 물체는 같은 속도로 흐른다(세계 고정): 그림 v = (LINE_Y − z) mod h 라 평면에서는 종전 타일 스크롤과 같은 그림이 나온다.
  //  아레나(r3.17): 셋째 인자 arena = { w, depth, k }(k 0 → 1 = 열리는 정도). k > 0 이면 도로 x 를 80~400 에서 w0~w1 로 보간하고
  //   차선 대시는 (1 − k) 로 사라지며, 그 위에 광장 그림(ARENA1/2, 조각마다 가로 배율) 또는 어두운 타원 바닥을 덧그린다. run.z 가 멈추므로 스크롤은 자동 정지
  function drawBackground(scroll, stageIdx, arena = null) {
    const pal = C.bg[Math.min(stageIdx, C.bg.length - 1)] ?? C.bg[0];
    const im = get('bg' + (stageIdx + 1));
    const k = arena ? Math.max(0, Math.min(1, arena.k ?? 1)) : 0;
    const w0 = arena && arena.w ? arena.w[0] : ROAD0, w1 = arena && arena.w ? arena.w[1] : ROAD1;
    const x0 = ROAD0 + (w0 - ROAD0) * k, x1 = ROAD1 + (w1 - ROAD1) * k;
    ctx.fillStyle = pal.side;
    ctx.fillRect(0, 0, W, H);
    if (im) {
      const h = Math.round(im.height * (W / im.width));   // 타일 한 장의 세계 길이(px)
      const ipp = im.width / W;                            // 논리 px 당 그림 px
      for (let i = 0; i < BG_STRIPS; i++) {
        const ya = (H * i) / BG_STRIPS, yb = (H * (i + 1)) / BG_STRIPS;
        const da = P.dOf(ya), db = P.dOf(yb);              // da > db(위쪽이 멀다)
        //  이 조각이 덮는 세계 구간 [db, da] → 그림 v 구간 [LINE_Y − da − scroll, +(da − db)). 타일 경계를 넘으면 두 번에 나눠 그린다.
        //   가로는 전폭(0~W) — 조각 경계에서 가장자리가 끊기지 않는다(위 BG_STRIPS 주석)
        let u = ((LINE_Y - da - scroll) % h + h) % h, left = da - db, dy = ya;
        while (left > 1e-6) {
          const seg = Math.min(left, h - u);
          const dh = (yb - ya) * seg / (da - db);
          ctx.drawImage(im, 0, u * ipp, im.width, seg * ipp, 0, dy, W, dh);
          u = (u + seg) % h; left -= seg; dy += dh;
        }
      }
    }
    //  도로: 화면 위 −10 부터 아래 H+10 까지 BG_STRIPS 등분 점으로 양 가장자리를 잇는 다각형(멀수록 좁아진다 = 사다리꼴)
    const yT = -10, yB = H + 10;
    const edge = (x, i) => { const y = yT + (yB - yT) * i / BG_STRIPS; return { x: pj(x, P.dOf(y)).x, y }; };
    const L = [], R = [];
    for (let i = 0; i <= BG_STRIPS; i++) { L.push(edge(x0, i)); R.push(edge(x1, i)); }
    ctx.globalAlpha = im ? 0.82 : 1;
    ctx.fillStyle = pal.road;
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i <= BG_STRIPS; i++) ctx.lineTo(L[i].x, L[i].y);
    for (let i = BG_STRIPS; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    //  광장 그림(2026-09-19 Gemini ARENA1=산업지대·ARENA2=적 공장): 있으면 열림 정도 k 만큼 겹쳐 그린다(세로만 조각, 가로 전폭). 없으면 종전 어두운 타원
    const arenaIm = k > 0 ? get(stageIdx >= 4 ? 'arena2' : 'arena1') : null;
    if (arenaIm) {
      ctx.globalAlpha = k;
      //  한 장을 전폭으로 편다(광장은 run.z 가 멈추므로 세로 원근 샘플링도 없다 — 조각으로 나눌 이유가 없다).
      //   그림의 검은 테두리(ARENA_CROP)만 잘라 내 화면 가장자리에 검은 띠가 보이지 않게 한다
      const c0 = ARENA_CROP * (arenaIm.width / W);
      ctx.drawImage(arenaIm, c0, 0, arenaIm.width - 2 * c0, arenaIm.height, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (k > 0 && !arenaIm) {
      //  광장 바닥: 보스 등장 자리(y 140)부터 화면 아래까지 덮는 어두운 타원 + 옅은 테두리(가로 반지름은 그 높이의 투영 폭)
      const yTop = 130, ym = (yTop + H) / 2, dm = P.dOf(ym);
      ctx.fillStyle = 'rgba(18,22,30,' + (0.6 * k).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(W / 2, ym, (pj(x1, dm).x - pj(x0, dm).x) / 2, (H - yTop) / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.18 * k).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    //  차선 2줄: 세계 좌표의 대시(주기 40 · 길이 18)를 앞뒤 끝점 투영으로 그린다 — 멀수록 짧고 가늘다. 광장에서는 차선이 사라진다
    if (k < 1) {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = pal.line;
      const lanes = [ROAD0 + (ROAD1 - ROAD0) / 3, ROAD0 + (ROAD1 - ROAD0) * 2 / 3];
      //  대시 범위는 평면 기준 d(−200~680)로 잡는다 — 원근에서도 같은 개수를 그려 flat 과 호출 수가 같다(화면 밖 대시는 무해)
      const dBot = LINE_Y - H - 40, dTop = LINE_Y + 40;
      const k0 = Math.floor((scroll + dBot) / 40), k1 = Math.ceil((scroll + dTop) / 40);
      for (let n = k0; n <= k1; n++) {
        const d0 = n * 40 - scroll, d1 = d0 + 18;
        ctx.lineWidth = 3 * P.s(d0);
        ctx.beginPath();
        for (const x of lanes) { const a = pj(x, d0), b = pj(x, d1); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(20,35,58,' + (arenaIm ? (0.35 * (1 - k)).toFixed(3) : '0.35') + ')';
    ctx.lineWidth = 4;
    for (const E of [L, R]) {
      ctx.beginPath(); ctx.moveTo(E[0].x, E[0].y);
      for (let i = 1; i <= BG_STRIPS; i++) ctx.lineTo(E[i].x, E[i].y);
      ctx.stroke();
    }
  }

  //  차폐물(r3.11): 낮은 모래주머니 둔덕 — 탄만 막고 통로는 막지 않는다. 벽과 달리 도로 폭 일부만 차지하고 색이 어둡다. 앞(z1)·뒤(z0) 가장자리를 따로 투영한 사다리꼴
  function drawCovers(run) {
    for (const w of run.covers || []) {
      const d0 = w.z0 - run.z, d1 = w.z1 - run.z;
      if (d0 > LINE_Y + 10 || d1 < LINE_Y - H - 10) continue;
      const tl = pj(w.x0, d1), tr = pj(w.x1, d1), bl = pj(w.x0, d0), br = pj(w.x1, d0);
      const s0 = bl.s, hh = Math.max(8 * s0, bl.y - tl.y);
      ctx.fillStyle = 'rgba(20,25,35,0.28)';
      quad({ x: tl.x - 2 * s0, y: tl.y + 5 * s0 }, { x: tr.x + 2 * s0, y: tr.y + 5 * s0 }, { x: br.x + 2 * s0, y: br.y + 5 * s0 }, { x: bl.x - 2 * s0, y: bl.y + 5 * s0 }); ctx.fill();
      ctx.fillStyle = '#5B5347';
      quad(tl, tr, br, bl); ctx.fill();
      //  윗면(앞쪽 45%)
      const m = 0.45, ml = { x: tl.x + (bl.x - tl.x) * m, y: tl.y + (bl.y - tl.y) * m }, mr = { x: tr.x + (br.x - tr.x) * m, y: tr.y + (br.y - tr.y) * m };
      ctx.fillStyle = '#8A7B62';
      quad({ x: tl.x + 3 * s0, y: tl.y + 2 * s0 }, { x: tr.x - 3 * s0, y: tr.y + 2 * s0 }, { x: mr.x - 3 * s0, y: mr.y }, { x: ml.x + 3 * s0, y: ml.y }); ctx.fill();
      //  사선 줄무늬 = '탄 막힘' 표시(뒤 가장자리 위)
      ctx.fillStyle = 'rgba(255,214,90,0.55)';
      for (let x = w.x0 + 6; x < w.x1 - 10; x += 22) ctx.fillRect(pj(x, d0).x, bl.y - 7 * s0, 12 * s0, 4 * s0);
    }
  }

  //  벽: 도로 위 회색 분리대(상단 하이라이트). 앞(z1)·뒤(z0)를 화면 −10~H+10 에 해당하는 d 로 자른 뒤 네 꼭짓점을 투영한다
  function drawWalls(run) {
    //  자르는 범위도 평면 기준 d(화면 −10~H+10 에 해당) — 줄무늬 개수가 투영 모드와 무관하게 같다
    const dTop = LINE_Y + 10, dBot = LINE_Y - H - 10;
    for (const w of run.walls) {
      const d0 = w.z0 - run.z, d1 = w.z1 - run.z;
      if (d0 > LINE_Y + 10 || d1 < LINE_Y - H - 10) continue;
      const dn = Math.max(dBot, d0), df = Math.min(dTop, d1);
      const tl = pj(w.x0, df), tr = pj(w.x1, df), bl = pj(w.x0, dn), br = pj(w.x1, dn);
      const s0 = bl.s;
      ctx.fillStyle = 'rgba(20,25,35,0.25)';
      quad({ x: tl.x - 3 * tl.s, y: tl.y + 4 * tl.s }, { x: tr.x + 3 * tr.s, y: tr.y + 4 * tr.s }, { x: br.x + 3 * s0, y: br.y + 4 * s0 }, { x: bl.x - 3 * s0, y: bl.y + 4 * s0 }); ctx.fill();
      ctx.fillStyle = C.wall;
      quad(tl, tr, br, bl); ctx.fill();
      ctx.fillStyle = C.wallTop;
      quad({ x: tl.x + 3 * tl.s, y: tl.y }, { x: tr.x - 3 * tr.s, y: tr.y }, { x: br.x - 3 * s0, y: br.y }, { x: bl.x + 3 * s0, y: bl.y }); ctx.fill();
      //  분리대 줄무늬(세계 간격 36, 앞에서부터 12 뒤)
      ctx.fillStyle = 'rgba(20,35,58,0.35)';
      for (let d = df - 12; d > dn; d -= 36) { const a = pj(w.x0 + 3, d), b = pj(w.x1 - 3, d); ctx.fillRect(a.x, a.y, b.x - a.x, 6 * a.s); }
      //  통로 안내 표지: 벽 앞머리(z0)에 좌·우 통로 내용물. 확정선(z0-60)까지 700px = 3.7초의 판단 시간을 준다
      if (w.signs) {
        //   화면 위 끝에서 들어올 때 HUD 줄에 가려지지 않게 표지 상자 위 변을 HUD 아래(TIP_MIN_Y)로 클램프한다(gateTip·목표 표지와 같은 규칙,
        //   검수 반영 2026-09-20 — 원근에선 y ≈ 3 까지 올라가 '+3·기관총' 이 HUD 제목에 가려졌고 완독 시점이 0.25초 늦었다)
        if (!offscreen(d0, 40)) {
          const sl = pj((ROAD0 + w.x0) / 2, d0), sr = pj((w.x1 + ROAD1) / 2, d0);
          drawSign(w.signs.L, sl.x, Math.max(TIP_MIN_Y + 20 * sl.s, sl.y + 26 * sl.s), sl.s);
          drawSign(w.signs.R, sr.x, Math.max(TIP_MIN_Y + 20 * sr.s, sr.y + 26 * sr.s), sr.s);
        }
        //  통로 확정선(여기서 통로가 정해진다) — 벽과 같은 회색 실선
        const dc = d0 - BAL3.squad.wallLead;
        if (!offscreen(dc, 10)) {
          const a = pj(ROAD0, dc), b = pj(ROAD1, dc);
          ctx.strokeStyle = 'rgba(154,161,172,0.75)';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
  }

  //  통로 안내 표지 1개(아이콘 + 숫자). kind 'none' = 빈 통로. s = 그 자리의 배율(상자·아이콘은 s 배, 글은 하한 15px)
  function drawSign(sg, x, y, s = 1) {
    if (!sg) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(16,22,31,0.72)';
    roundRect(x - 44 * s, y - 20 * s, 88 * s, 40 * s, 8 * s);
    ctx.fill();
    if (sg.kind === 'soldier') {
      ctx.fillStyle = C.soldier;
      for (let i = 0; i < 3; i++) {
        const px = x - (28 - i * 11) * s;
        ctx.beginPath(); ctx.arc(px, y - 8 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(px - 3 * s, y - 4 * s, 6 * s, 9 * s);
      }
      outlinedText('+' + (sg.n ?? 0), x + 16 * s, y, fsMin(20, s), C.supplyBody, 'bold', 4);
    } else if (sg.kind === 'weapon') {
      const wp = WEAPONS[sg.weapon] ?? WEAPONS.rifle;
      ctx.fillStyle = wp.color;
      roundRect(x - 34 * s, y - 6 * s, 28 * s, 9 * s, 3 * s); ctx.fill();
      outlinedText(wp.name, x + 12 * s, y, fsMin(16, s), wp.color, 'bold', 4);
    } else if (sg.kind === 'chain') {
      ctx.fillStyle = C.chainPad;
      roundRect(x - 34 * s, y - 10 * s, 22 * s, 18 * s, 4 * s); ctx.fill();
      outlinedText('증원', x + 10 * s, y, fsMin(16, s), C.chainPad, 'bold', 4);
    } else if (sg.kind === 'lottery') {
      //  랜덤 길: 무엇이 걸릴지 모른다는 표시. 확정선을 지나야 실제 물체가 드러난다(계약서 3-9)
      outlinedText('?', x - 22 * s, y, fsMin(26, s), C.gold, 'bold', 5);
      outlinedText('랜덤', x + 16 * s, y, fsMin(17, s), C.gold, 'bold', 4);
    } else if (sg.kind === 'capsule') {
      //  구출 캡슐(r3.14): 작은 유리 캡슐 아이콘 + '구출'. 뒤 회차의 분리벽 안 캡슐에 대비한 표지(C[7] 에는 벽이 없다)
      ctx.fillStyle = C.capsuleGlass;
      roundRect(x - 34 * s, y - 13 * s, 16 * s, 26 * s, 8 * s); ctx.fill();
      ctx.strokeStyle = C.capsule; ctx.lineWidth = 2;
      roundRect(x - 34 * s, y - 13 * s, 16 * s, 26 * s, 8 * s); ctx.stroke();
      outlinedText('구출', x + 12 * s, y, fsMin(16, s), C.capsule, 'bold', 4);
    } else {
      outlinedText('빈 길', x, y, fsMin(17, s), C.gateZero, 'bold', 4);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  잠김 표시(계약서 6장 N2-②): 숫자를 가리지 않는 칸 모서리의 작은 자물쇠. 색만으로 구분하지 않기 위한 형태 신호다.
  //  scale 을 주면 같은 모양을 그 배율로 키워 그린다(함정 칸의 큰 자물쇠 — 2026-09-17 이사 결정 ③ · 원근 배율도 여기로 곱해 들어온다).
  function drawLockBadge(x, y, scale = 1) {
    ctx.save();
    //  배율 1 이어도 같은 변환을 거친다 — 투영 모드와 무관하게 그리기 호출 수가 같도록(V3-PROJECT)
    ctx.translate(x, y); ctx.scale(scale, scale); x = 0; y = 0;
    //  고리(열린 반원) → 몸통 순서. 회색 판 위에서도 보이게 어두운 테두리를 먼저 깐다
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y - 4, 5, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = C.wallTop;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y - 4, 5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = C.outline;
    roundRect(x - 8, y - 2, 16, 13, 3);
    ctx.fill();
    ctx.fillStyle = C.wallTop;
    roundRect(x - 6.5, y - 0.5, 13, 10, 2.5);
    ctx.fill();
    ctx.restore();
  }

  //  함정 칸의 붉은 봉쇄 바: 칸 폭(화면 x0~x1)을 가로지르는 굵은 붉은 바 + 대각 줄무늬. 숫자보다 **먼저** 그려 숫자를 가리지 않는다.
  //  ⚠️셔터(회색 빗금)와 달리 걷히지 않는다 — 통과한 뒤에도 행 기본 불투명도(0.32)로 흐리게 남아 '여기서 잃었다'가 화면에 남는다
  function drawTrapBar(x0c, x1c, y, s) {
    const x0 = x0c + 3 * s, w = x1c - x0c - 6 * s;
    const bh = 30 * s, by = y - bh / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, by, w, bh);
    ctx.clip();
    ctx.fillStyle = 'rgba(122,26,34,0.92)';
    ctx.fillRect(x0, by, w, bh);
    ctx.strokeStyle = 'rgba(255,106,61,0.85)';
    ctx.lineWidth = 7 * s;
    ctx.beginPath();
    for (let k = -bh; k < w + bh; k += 18 * s) {
      ctx.moveTo(x0 + k, by + bh);
      ctx.lineTo(x0 + k + bh, by);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = C.warn;
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, by, w, bh);
  }

  //  함정 배지('쏴도 안 줄어듦'): 칸 **위**에 표지판처럼 띄운다(화면 고정 크기 — 주석 계열).
  //  ⚠️옆 차선에 두면 반대편 통로의 보급 통·벽에 가려진다(2026-09-17 렌더 실측 — 왼쪽 통이 배지를 덮었다).
  //   칸 위 짧은 글(y-hh/2-34 부터 26px)보다 더 위에 두어 둘이 겹치지 않게 한다
  function drawTrapBadge(bx, y, hh) {
    const bw = 118, bh = 24;
    const by = Math.max(TIP_MIN_Y + 40, y - hh / 2 - 48);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(60,10,16,0.88)';
    roundRect(bx - bw / 2, by - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = C.warn;
    ctx.lineWidth = 2;
    roundRect(bx - bw / 2, by - bh / 2, bw, bh, 8);
    ctx.stroke();
    outlinedText(TRAP_BADGE_TEXT, bx, by, 13, C.hud, 'bold', 3);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  게이트 행: 칸 사각형 + 부호 숫자 + 색. 피격 흰 플래시·숫자 튐(셸 fx.gateFlash 타이머, 규칙의 cell.flashT 는 읽지 않는다). 통과 뒤 흐리게
  //  원근(r3.20): 칸 x0·x1 을 행 z 에서 투영(사다리꼴 도로 위의 칸), 칸 높이 = 58·s(하한 18), 숫자 = 38·s(하한 15) — 멀어도 읽힌다
  //  셔터(armZ): 아직 안 열린 행은 회색 빗금 판을 덮되 **숫자·부호는 판 위에 선명하게** 그리고(2026-09-17 검수 N2-①),
  //   잠김은 칸 모서리의 작은 자물쇠로 따로 알린다(N2-②). 열리는 순간(fx.gateOpen)에는 판이 위로 걷힌다.
  //  ⚠️함정 행(isTrapGateRow)은 셔터 표현을 **하나도** 쓰지 않는다 — 개시선·회색 빗금·작은 자물쇠·닫힘 안내를 전부 건너뛴다.
  //   '가까워지면 열림'을 배운 사람에게 열려도 안 오르는 칸을 셔터 모양으로 보여주면 규칙을 두 번 가르치는 셈이다.
  //   대신 붉은 봉쇄 바 + 큰 자물쇠 + 배지로 '사격이 안 먹히는 장치'를 즉시 알린다(2026-09-17 이사 결정 ③ 함정 외형 A).
  //   ⚠️armZ·armed 규칙 자체는 건드리지 않는다 — 바뀌는 것은 그리기뿐이다.
  function drawGateRow(row, fx, runZ) {
    const d = row.z - runZ;
    if (offscreen(d, 60)) return;
    const s = P.s(d), y = P.y(d);
    const hh = Math.max(PERSPECTIVE.minGateH, 58 * s);
    const trap = isTrapGateRow(row);
    const flashMap = fx && fx.gateFlash ? fx.gateFlash : null;
    //  0 = 완전히 닫힘 · 1 = 완전히 열림
    const openLeft = fx && fx.gateOpen ? (fx.gateOpen[row.id] ?? 0) : 0;
    const openT = BAL3.gate.openT || 0.25;
    const shut = trap || row.passed ? 0 : row.armed ? (openLeft > 0 ? openLeft / openT : 0) : 1;
    //  사격 개시선: 아직 닫힌 행이면 도로 위 run.z + armZ 위치에 점선 1줄("여기서부터 쏠 수 있다")
    if (!trap && !row.armed && !row.passed && row.armZ != null && runZ != null) {
      if (!offscreen(row.armZ, 10)) {
        const a = pj(ROAD0, row.armZ), b = pj(ROAD1, row.armZ);
        ctx.save();
        ctx.strokeStyle = gateColor(row.cells[0] ? row.cells[0].value : 0);
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        //  선 옆 작은 글(N2-⑤). ⚠️주체는 게이트다 — "플레이어가 선을 넘는다"로 읽히면 통로 확정선과 헷갈린다
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 0.92;
        outlinedText(ARM_LINE_TEXT, a.x + 6, a.y - 7, 12, C.hud, '600', 3);
        ctx.restore();
      }
    }
    const base = row.passed ? 0.32 : 0.92;
    ctx.globalAlpha = base;
    for (const c of row.cells) {
      const col = gateColor(c.value);
      const left = flashMap ? (flashMap[row.id + ':' + c.idx] ?? 0) : 0;
      const flash = left > 0 ? Math.min(1, left / BAL3.gate.flashT) : 0;
      const x0c = pj(c.x0, d).x, x1c = pj(c.x1, d).x;
      const bx = x0c + 3 * s, bw = x1c - x0c - 6 * s;
      ctx.fillStyle = flash > 0 ? 'rgba(255,255,255,' + (0.35 + flash * 0.5) + ')' : 'rgba(16,22,31,0.66)';
      roundRect(bx, y - hh / 2, bw, hh, 10 * s);
      ctx.fill();
      ctx.strokeStyle = trap ? C.warn : col;
      ctx.lineWidth = 4;
      roundRect(bx, y - hh / 2, bw, hh, 10 * s);
      ctx.stroke();
      const cx = (x0c + x1c) / 2;
      //  함정 칸: 붉은 봉쇄 바(숫자 아래). 셔터 판은 그리지 않는다
      if (trap) drawTrapBar(x0c, x1c, y, s);
      //  셔터 판(회색 빗금) — 숫자보다 **먼저** 그린다. 열리는 동안 남은 판이 위쪽으로 줄어든다(문이 위로 걷히는 동작)
      if (shut > 0) {
        const ph = hh * shut;
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, y - hh / 2, bw, ph);
        ctx.clip();
        ctx.fillStyle = 'rgba(120,128,140,0.82)';
        ctx.fillRect(bx, y - hh / 2, bw, hh);
        ctx.strokeStyle = 'rgba(30,38,50,0.55)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let k = -hh; k < bw + hh; k += 12 * s) {
          ctx.moveTo(bx + k, y + hh / 2);
          ctx.lineTo(bx + k + hh, y - hh / 2);
        }
        ctx.stroke();
        ctx.restore();
      }
      //  숫자: 피격 직후 살짝 튄다. **셔터·봉쇄 바 위에 같은 불투명도로** 그린다(가려도 무엇이 걸린 판인지 그대로 읽힌다). 하한 15px
      const px = fsMin(38, s) + Math.round(flash * 8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = base;
      outlinedText(gateLabel(c.value), cx, y, px, flash > 0.5 ? C.gateFlash : col, 'bold', 6);
      //  확정 손실 칸(상한이 자기 값 = 쏴도 오르지 않는다, 랜덤 길 ⑤): 칸 아래에 '확정' 꼬리표를 붙여 '안 먹히는 이유'를 화면에 남긴다
      //  ⚠️숫자와 겹치지 않게 칸 **바깥**(아래)에 그린다 — 숫자가 38px 라 칸 안에서는 밑줄이 물린다
      if (c.value < 0 && c.maxValue != null && c.maxValue <= c.value) {
        outlinedText('확정', cx, y + hh / 2 + fs(13, s, 10), fsMin(16, s), col, 'bold', 4);
      }
      ctx.textBaseline = 'alphabetic';
      //  자물쇠: 함정 칸은 **크게**(봉쇄 장치의 일부) · 닫힌 셔터 칸은 왼쪽 위 모서리에 작게(숫자 자리를 비켜 간다).
      //  ⚠️셔터가 걷히는 중(armed 직후)에는 이미 잠김이 풀렸으므로 그리지 않는다 — 셔터 판만 남아 걷힌다
      if (trap) drawLockBadge(x0c + 20 * s, y, 1.4 * s);
      else if (!row.armed && !row.passed) drawLockBadge(x0c + 20 * s, y - hh / 2 + 15 * s, s);
      ctx.globalAlpha = base;
    }
    //  함정 배지는 아직 안 지난 행에만(지난 뒤에는 봉쇄 바만 흐리게 남는다)
    const rx = pj((row.cells[0].x0 + row.cells[row.cells.length - 1].x1) / 2, d).x;
    if (trap && !row.passed) drawTrapBadge(rx, y, hh);
    //  짧은 안내 글(N2-③): 닫힌 동안 '가까워지면 열림' · 처음 열릴 때 '지금 쏘면 +1'. 각 BAL3.fx.gateTipSec 초, 칸 위(화면 고정 크기)
    //  ⚠️함정 행이 아직 안 열렸을 때는 셸이 무엇을 넣어 두었든 그리지 않는다 — '가까워지면 열림'은 이 행에 맞지 않는 약속이다
    const tip = fx && fx.gateTip ? fx.gateTip[row.id] : null;
    if (tip && tip.t > 0 && !(trap && !row.armed)) {
      const tipSec = BAL3.fx.gateTipSec || 1.2;
      //  ⚠️행이 화면 위쪽 끝에서 들어올 때는 칸 위가 화면 밖이다 — 그 동안에는 HUD 아래(y 96)에 붙여 두고,
      //   행이 내려오면 자연스럽게 칸 위로 따라 붙는다. 안 그러면 1.2초 내내 화면 밖에 그려진다(2026-09-17 렌더 실측).
      const top = Math.max(TIP_MIN_Y, y - hh / 2 - 34);
      ctx.save();
      ctx.globalAlpha = Math.min(1, tip.t / (tipSec * 0.4));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(20,35,58,0.82)';
      const tw = Math.max(96, tip.text.length * 15 + 20);
      roundRect(rx - tw / 2, top, tw, 26, 8);
      ctx.fill();
      outlinedText(tip.text, rx, top + 13, 15, C.hud, 'bold', 4);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  //  보급 통 내용물: 병사 실루엣 n / 무기 아이콘 / 파란 설비. k = 그 자리의 배율(아이콘 k 배, 글은 하한 15px)
  function drawSupplyContents(s, x, y, k = 1) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s.kind === 'soldier') {
      const n = s.payload.n ?? 0;
      //  병사 수 아이콘(2026-09-19 Gemini ICON_soldiers_1~3): 1·2·3명은 그 그림, 4명 이상은 3명 그림 + 숫자. 없으면 종전 실루엣
      drawImgCentered('soldiers_' + Math.max(1, Math.min(3, n)), x, y - 8 * k, 30 * k, () => {
        const show = Math.min(n, 6);
        for (let i = 0; i < show; i++) {
          const px = x + (i - (show - 1) / 2) * 9 * k, py = y - 6 * k;
          ctx.fillStyle = C.soldier;
          ctx.beginPath();
          ctx.arc(px, py - 5 * k, 3 * k, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(px - 3 * k, py - 1 * k, 6 * k, 8 * k);
        }
      });
      outlinedText('+' + n, x, y + 16 * k, fsMin(18, k), C.supplyBody, 'bold', 4);
    } else if (s.kind === 'weapon') {
      const w = WEAPONS[s.payload.weapon] ?? WEAPONS.rifle;
      const im = icon(w.id);
      if (im) drawIconCentered(im, x, y - 7 * k, 22 * k, 40 * k);
      else {
        ctx.fillStyle = w.color;
        roundRect(x - 16 * k, y - 12 * k, 32 * k, 10 * k, 3 * k);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - 12 * k, y - 10 * k, 8 * k, 6 * k);
      }
      outlinedText(w.name, x, y + 14 * k, fsMin(15, k), w.color, 'bold', 4);
    } else if (s.kind === 'capsule') {
      //  구출 캡슐(r3.14): 유리 안의 사람 실루엣(머리 원 + 몸통, 그림자 없음) + 합류 수. 몸체(유리·받침)는 drawCapsuleBody 가 먼저 그린다
      const r = s.r * k;
      if (!get('capsule')) {
        ctx.fillStyle = C.soldier;
        ctx.beginPath(); ctx.arc(x, y - r * 0.5, r * 0.22, 0, Math.PI * 2); ctx.fill();
        roundRect(x - r * 0.26, y - r * 0.24, r * 0.52, r * 0.58, r * 0.12); ctx.fill();
      }
      outlinedText('+' + (s.payload.n ?? 0), x, y + r * 0.45, fsMin(14, k), C.supplyBody, 'bold', 4);
    } else {
      ctx.fillStyle = C.chainPad;
      roundRect(x - 14 * k, y - 14 * k, 28 * k, 20 * k, 4 * k);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x - 9 * k, y - 9 * k, 18 * k, 3 * k);
      ctx.fillRect(x - 9 * k, y - 3 * k, 18 * k, 3 * k);
      outlinedText('증원 설비', x, y + 16 * k, fs(13, k), C.chainPad, 'bold', 4);
    }
    ctx.textBaseline = 'alphabetic';
  }

  //  차량 통 몸체(r3.13): 궤도 점선 + 그림자 + 둥근 상자 + 바퀴 4 + 앞유리 + 진행 방향 화살표. 새 그림 없음(캔버스 도형만).
  //   나머지(내용물·내구 숫자·차폐 막·missed/skipped 알파)는 정지 통과 같은 경로를 그대로 공유한다.
  //   방향은 렌더 안에서만 셈한다(규칙 필드 추가 없음): 이번 STEP 에 움직인 쪽, 진입 전이면 '갈 방향', 멈춘 뒤(opened/missed)엔 화살표 없음
  //   x·y·r = 투영된 중심과 반지름, k = 배율, d = 행 거리(궤도 양 끝 x0·x1 을 같은 d 에서 투영)
  function drawVehicleBody(s, x, y, r, k, d) {
    const m = s.move;
    const px = s.prevX ?? s.x;
    const dir = s.x !== px ? Math.sign(s.x - px) : (s.moveT === null ? (s.homeX === m.x0 ? 1 : -1) : 0);
    const mx0 = pj(m.x0, d).x, mx1 = pj(m.x1, d).x;
    //  궤도선: 이 통이 왕복하는 구간(x0~x1)을 미리 알린다 — '앞을 보고 쏘라'는 장치의 핵심 정보. 양 끝에 짧은 눈금
    ctx.save();
    ctx.strokeStyle = C.supplyDark;
    ctx.globalAlpha = ctx.globalAlpha * 0.35;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(mx0, y); ctx.lineTo(mx1, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(mx0, y - 6 * k); ctx.lineTo(mx0, y + 6 * k);
    ctx.moveTo(mx1, y - 6 * k); ctx.lineTo(mx1, y + 6 * k);
    ctx.stroke();
    ctx.restore();
    shadow(x, y + r * 0.95, r * 1.05);
    //  차량 그림(2026-09-19 Gemini D_vehicle, 뒤·위 3/4 시점)이 있으면 그것을, 없으면 종전 도형(바퀴 4 + 상자 + 앞유리)
    drawImgCentered('vehicle', x, y - r * 0.15, r * 2.5, () => {
      //  바퀴 4개(반지름 6·k, 외곽선 색)는 몸체보다 먼저 — 위아래 가장자리에서 반쯤 내다보여 위에서 본 차로 읽힌다
      ctx.fillStyle = C.outline;
      for (const kx of [-1, 1]) for (const ky of [-1, 1]) {
        ctx.beginPath(); ctx.arc(x + kx * (r - 8 * k), y + ky * (r * 0.7 + 2 * k), 6 * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = C.supplyDark;
      roundRect(x - r - 4 * k, y - r * 0.7, r * 2 + 8 * k, r * 1.4, 8 * k); ctx.fill();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 4;
      roundRect(x - r - 4 * k, y - r * 0.7, r * 2 + 8 * k, r * 1.4, 8 * k); ctx.stroke();
      //  앞유리: 진행 방향 쪽 가장자리 안쪽(방향이 없으면 오른쪽)
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(dir < 0 ? x - r - 4 * k + 5 * k : x + r + 4 * k - 11 * k, y - r * 0.45, 6 * k, r * 0.9);
    });
    //  방향 화살표: 몸체 밖 진행 방향 쪽 작은 삼각형(꼭짓점 x = x + dir·(r + 22·k))
    if (dir !== 0) {
      ctx.save();
      ctx.fillStyle = C.gold;
      ctx.globalAlpha = ctx.globalAlpha * 0.9;
      const ax = x + dir * (r + 12 * k);
      ctx.beginPath(); ctx.moveTo(ax + dir * 10 * k, y); ctx.lineTo(ax, y - 6 * k); ctx.lineTo(ax, y + 6 * k); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  //  구출 캡슐 몸체(r3.14): 그림자 + 받침(어두운 받침 + 청록 윗선) + 연한 청록 반투명 유리 캡슐 + 왼쪽 위 흰 하이라이트. 새 그림 없음(캔버스 도형만).
  //   sprites 에 'capsule' 그림이 들어오면 drawImgCentered 폴백 한 줄로 교체할 수 있게 폴백 함수 꼴로 둔다.
  //   내용물(실루엣)·'목표' 표지·내구 숫자·차폐 막·missed/skipped 알파는 정지 통과 같은 경로를 그대로 공유한다. x·y·r = 투영값
  function drawCapsuleBody(x, y, r, k) {
    shadow(x, y + r * 0.95, r * 0.9);
    drawImgCentered('capsule', x, y, r * 2.2, () => {
      //  받침: 폭 1.8r(크레이트 폴백 2r 과 다른 크기 — 검사가 폭으로 구분한다)
      ctx.fillStyle = C.supplyDark;
      roundRect(x - r * 0.9, y + r * 0.55, r * 1.8, r * 0.5, 6 * k); ctx.fill();
      ctx.strokeStyle = C.capsule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + r * 0.55); ctx.lineTo(x + r * 0.9, y + r * 0.55); ctx.stroke();
      //  유리
      ctx.fillStyle = C.capsuleGlass;
      roundRect(x - r * 0.75, y - r * 1.05, r * 1.5, r * 2.0, r * 0.75); ctx.fill();
      ctx.strokeStyle = C.capsule; ctx.lineWidth = 3;
      roundRect(x - r * 0.75, y - r * 1.05, r * 1.5, r * 2.0, r * 0.75); ctx.stroke();
      //  하이라이트(왼쪽 위 세로 선)
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * 0.5;
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - r * 0.45, y - r * 0.6); ctx.lineTo(x - r * 0.45, y + r * 0.25); ctx.stroke();
      ctx.restore();
    });
  }

  //  '목표' 표지(r3.14): 캡슐 유리 위 금색 알약(화면 고정 크기). 화면 위 끝에서 들어올 때 잘리지 않게 HUD 아래(TIP_MIN_Y)로 클램프(gateTip 과 같은 규칙)
  function drawObjectiveBadge(x, y, r) {
    const bw = 44, bh = 18;
    const by = Math.max(TIP_MIN_Y, y - r * 1.05 - 16);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    roundRect(x - bw / 2, by - bh / 2, bw, bh, 9); ctx.fill();
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = C.outline;
    ctx.fillText('목표', x, by);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  보급 통: 그림 + 내용물 + 남은 내구 숫자(병력 수가 아니다, 하한 15px). chain 발판 열은 '+1'. 위치·반지름은 통 z 에서 투영
  function drawSupply(s, runZ) {
    //  발판(통보다 앞 z = 화면 위쪽)
    for (const p of s.pads) {
      const dp = p.z - runZ;
      if (offscreen(dp, 30)) continue;
      const q = pj(p.x, dp), k = q.s;
      ctx.globalAlpha = p.taken ? 0.25 : 0.85;
      ctx.fillStyle = C.chainPad;
      roundRect(q.x - 34 * k, q.y - 12 * k, 68 * k, 24 * k, 8 * k);
      ctx.fill();
      if (!p.taken) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        outlinedText('+1', q.x, q.y, fsMin(18, k), '#FFFFFF', 'bold', 4);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.globalAlpha = 1;
    }
    if (s.opened && s.kind !== 'chain') return;
    const d = s.z - runZ;
    if (offscreen(d, 60)) return;
    const q = pj(s.x, d), x = q.x, y = q.y, k = q.s;
    const r = s.r * k;
    //  차폐(coverZ): 통로가 정해지고 잠시 뒤에 걷힌다. 걷히기 전에는 통 위에 회색 막이 덮여 있다
    const covered = s.coverZ != null && runZ != null && runZ < s.coverZ;
    //  skipped = 구조적으로 얻을 수 없던 대안. '밀려나며 사라지는' missed 연출과 달리 흐려지며 뒤로 빠진다
    ctx.globalAlpha = s.skipped ? 0.22 : s.missed ? 0.35 : 1;
    //  차량(r3.13)·캡슐(r3.14)은 몸체 그리기만 갈아 끼운다 — 정지 통 경로는 한 줄도 바뀌지 않는다
    if (s.move) drawVehicleBody(s, x, y, r, k, d);
    else if (s.kind === 'capsule') drawCapsuleBody(x, y, r, k);
    else {
      shadow(x, y + r * 0.95, r * 0.9);
      drawImgCentered('supply', x, y, r * 2.1, () => {
        ctx.fillStyle = C.supplyDark;
        roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 8 * k); ctx.fill();
        ctx.strokeStyle = C.gold; ctx.lineWidth = 4;
        roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 8 * k); ctx.stroke();
      });
    }
    if (!s.opened) drawSupplyContents(s, x, y, k);
    //  판 목표 표지(r3.14): 아직 얻을 수 있는 캡슐에만(놓친 뒤엔 흐린 몸체만 남는다)
    if (s.kind === 'capsule' && !s.opened && !s.missed && !s.skipped) drawObjectiveBadge(x, y, r);
    //  피격 활성 전(armZ, r3.18): 통 둘레 회색 점선 링 + 모서리 자물쇠(셔터 잠김과 같은 형태 신호). 내구 숫자는 회색
    const unarmed = s.armZ != null && runZ != null && !s.opened && s.z - runZ > s.armZ;
    if (unarmed) {
      ctx.save();
      ctx.strokeStyle = C.wallTop; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(x, y, r + 8 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawLockBadge(x + r - 2 * k, y - r + 4 * k, k);
    }
    //  남은 내구 숫자(주황) — 내용물과 구분되는 위치(통 아래)
    ctx.textAlign = 'center';
    if (!s.opened) outlinedText(String(Math.max(0, Math.ceil(s.durability))), x, y + r + 18 * k, fsMin(16, k), unarmed ? C.gateZero : C.bulletHeavy, 'bold', 4);
    else if (!s.locked) outlinedText('쏘면 +1', x, y + r + 18 * k, fs(13, k), C.chainPad, 'bold', 4);
    if (covered && !s.opened) {
      //  차폐 막 + 개방선(도로 위 가로선). 확정선(벽 회색 실선)과 다른 색으로 그려 '확정 뒤에도 잠깐 못 쏘는 이유'를 남긴다
      ctx.fillStyle = 'rgba(120,128,140,0.55)';
      roundRect(x - r - 2 * k, y - r - 2 * k, r * 2 + 4 * k, r * 2 + 4 * k, 8 * k);
      ctx.fill();
      const dc = s.coverZ - runZ;
      if (!offscreen(dc, 10)) {
        const a = pj(ROAD0, dc), b = pj(ROAD1, dc);
        ctx.save();
        ctx.strokeStyle = C.chainPad;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  //  적 도형 폴백(상자/원/마름모). white = 피격 번쩍임(흰 채움만, 테두리·눈 없음)
  function enemyShape(kind, x, y, r, white) {
    ctx.fillStyle = white ? HIT_FLASH_FILL : (ENEMY_FALLBACK[kind] ?? '#B3402F');
    if (kind === 'shooter') {
      ctx.fillRect(x - r * 1.1, y - r, r * 2.2, r * 2);
      if (!white) { ctx.strokeStyle = C.warn; ctx.lineWidth = 3; ctx.strokeRect(x - r * 1.1, y - r, r * 2.2, r * 2); }
    } else if (kind === 'rusher') {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (!white) { ctx.strokeStyle = C.warn; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
    if (white) return;
    ctx.fillStyle = C.eshot;
    ctx.beginPath(); ctx.arc(x, y, Math.max(3, r * 0.28), 0, Math.PI * 2); ctx.fill();
  }

  //  피격 자세(r3.24): 셸 fx.hit[id] 의 경과 초 t 로 넉백(위로 밀렸다 복귀)·흔들림·스쿼시·번쩍임·HP 튐을 계산한다. 반응 중이 아니면 null.
  //   세기는 역할표(BAL3.fx.hitRoles)에서 — 장갑체는 거의 안 밀리고(무겁다) 돌격체는 크게 밀리며 흔들린다. k = 그 자리 원근 배율
  function hitPose(fx, id, role, k) {
    const h = fx && fx.hit ? fx.hit[id] : null;
    if (!h) return null;
    const H = FX.hit, R = FX.hitRoles[role] ?? FX.hitRoles.grunt;
    const t = h.t;
    const kb = t < H.knockSec ? Math.sin(Math.PI * t / H.knockSec) : 0;
    const sq = t < H.squashSec ? Math.sin(Math.PI * t / H.squashSec) : 0;
    const shake = R.shake && t < H.knockSec ? Math.sin(t * 95 + (h.n || 0) * 1.7) * R.shake * k * (1 - t / H.knockSec) : 0;
    return {
      dx: shake, dy: (h.dir ?? -1) * R.knock * k * kb,
      sx: 1 + R.squash * sq, sy: 1 - R.squash * sq,
      //  번쩍임은 fa(번쩍임 경과 초 — 연사 중에는 쉼을 두고 다시 켜진다)로. 옛 꼴(fa 없음)은 t
      flash: (h.fa ?? t) < H.flashSec ? R.flash * (1 - 0.4 * (h.fa ?? t) / H.flashSec) : 0,
      pop: t < H.hpPopSec ? Math.sin(Math.PI * t / H.hpPopSec) : 0,
    };
  }
  //  자세 적용: 발밑(ax, ay)을 기준점으로 밀고·눌러 그린다(호출부가 save/restore)
  function poseAt(hr, ax, ay) {
    ctx.translate(ax + hr.dx, ay + hr.dy);
    if (hr.sx !== 1 || hr.sy !== 1) ctx.scale(hr.sx, hr.sy);
    ctx.translate(-ax, -ay);
  }

  //  적: 스프라이트 폴백(상자/원/마름모) + HP 태그. 저격 예고선은 부대 쪽으로(부대 중심 = (run.x, d −ay) 투영)
  function drawEnemy(e, run, fx) {
    const d = e.z - run.z;
    if (offscreen(d, 80)) return;
    const q = pj(e.x, d), x = q.x, y = q.y, k = q.s;
    const r = e.r * k;
    //  저격 예고선 — 맞는 순간(넉백 동안)은 끊긴다(r3.24 저격수 특색: '조준이 흔들렸다')
    const aimCut = !!(fx && fx.hit && fx.hit[e.id] && fx.hit[e.id].t < FX.hit.knockSec);
    if (e.kind === 'shooter' && e.aimT > 0 && !aimCut) {
      const sq = pj(run.x, -(run.ay || 0));
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = C.eshot; ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sq.x, sq.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    const h = r * 2.4;
    shadow(x, y + h * 0.4, r * 0.95);
    //  피격 반응(r3.24 손맛, 셸 fx.hit[id]): 넉백·흔들림·스쿼시는 **그림에만** 건다(그림자·HP 숫자·규칙 위치는 그대로)
    const hr = hitPose(fx, e.id, hitRole(e.kind, e.skin), k);
    if (hr) { ctx.save(); poseAt(hr, x, y + h * 0.4); }
    //  피격 중인 잡졸(셸 fx.enemyHit[id] 남은 초)은 피격 시트를 한 번 재생한다
    const hitLeft = fx && fx.enemyHit ? (fx.enemyHit[e.id] ?? 0) : 0;
    const hitSh = e.kind === 'grunt' && hitLeft > 0 ? sheet('e_grunt_hit') : null;
    //  r3.26 3상태 그림: 맞는 동안 'hit:' · 체력 절반 이하이면 'dmg:'. 없는 그림은 정지 그림으로 조용히 되돌아간다
    //   (잡졸은 피격 시트가 있으면 시트가 먼저 — 12칸 동작이 한 장보다 낫다)
    const artB = artBase3(e.kind, e.skin);
    const baseKey = e.skin ? 'skin:' + e.skin : ENEMY_SPRITE[e.kind];
    let key = baseKey;
    if (artB && !hitSh && hitLeft > 0 && get('hit:' + artB)) key = 'hit:' + artB;
    else if (artB && wantsDmgArt(e.hp, e.hpMax ?? e.hp) && get('dmg:' + artB)) key = 'dmg:' + artB;
    const hitFrame = hitSh ? sheetFrameAt(hitSh, hitSh.frames / hitSh.fps - hitLeft) : 0;
    if (hitSh) drawSheetFrame(hitSh, hitFrame, x, y, h);
    else drawImgCentered(key, x, y, h, () => enemyShape(e.kind, x, y, r, false));
    //  흰색 번쩍임: 그림 모양의 흰 실루엣(없으면 도형에 흰 채움)을 반응 불투명도로 덮는다
    if (hr && hr.flash > 0) {
      ctx.globalAlpha = hr.flash;
      const im = hitSh ? null : get(key);
      const wsh = hitSh ? whiteOf(hitSh.img, 1024) : null;
      const wim = im ? whiteOf(im) : null;
      if (wsh) drawSheetFrame(hitSh, hitFrame, x, y, h, wsh);
      else if (wim) ctx.drawImage(wim.c, x - h * (im.width / im.height) / 2, y - h / 2, h * (im.width / im.height), h);
      else enemyShape(e.kind, x, y, r, true);
      ctx.globalAlpha = 1;
    }
    if (hr) ctx.restore();
    //  체력 숫자(r3.21 B안 ③ × r3.20 원근 화해): **스폰 체력(hpMax)이 2 를 넘는 적만** 남은 체력 정수를 보여 준다
    //   (체력 1~2 잡졸 = 1~3 스테이지는 숫자 없음 — 이사 결정 "한두 방에 죽는지 몇 방 맞는지 보이게").
    //   자리는 종전 HP 태그 그대로 **적 아래**(투영 x·배율 k, 글자 12px 하한) — 머리 위에 두면 화면 위로 들어오는 동안
    //   HUD 줄(제목·거리·칩)과 겹친다(B안 대항 검수 Important #1). 아래 두기가 그 겹침을 구조적으로 없앤다.
    //   hpMax 가 없는 적(검사 합성)은 hp 로 대신 본다
    //   ⚠️부대를 지나친 적(e.z < run.z — 멈춰 선 저격수 등)은 숫자를 그리지 않는다: 부대 발밑 병력 수 옆에 뜬다(B안 대항 검수 ① 덤)
    //   ⚠️아래에 두어도 **먼 구간**(표준 dz 491~647 · 가까이 469~646 실측)에서는 숫자가 HUD 띠에 들어온다 → 그 띠에서는 생략한다.
    //    클램프가 아니라 생략인 이유: 끌어내리면 숫자가 다른 적 그림 위에 얹힌다(B안 대항 검수 ① 처방 그대로, 판정만 투영 y 로 재유도)
    if ((e.hpMax ?? e.hp) > 2 && e.z >= run.z) {
      const ty = y + r + 16 * k;
      if (ty >= HP_TAG_MIN_Y) drawHpTag(x, ty, e.hp, k, hr ? hr.pop : 0);
    }
  }

  //  쓰러진 잡졸(셸 fx.corpses — 규칙의 enemies 에는 이미 없다): 사망 시트를 한 번 재생하고 corpseLingerSec 머문 뒤 흐려진다
  //  r3.24: 잡졸(역할 grunt·옛 꼴 role 없음)만 사망 시트, 나머지는 역할별 도형 잔해를 짧게(c.life 초, 마지막 corpseFadeSec 에 흐려진다)
  //   tumble(돌격체) = 제 그림이 앞(아래)으로 굴러 넘어지며 미끄러진다 · ring(저격수) = 마젠타 그을음 · plates(장갑체) = 장갑판 조각 + 그을음 · boom(카트) = 큰 그을음
  function drawCorpses(fx, runZ) {
    const list = fx && fx.corpses;
    if (!list || !list.length) return;
    const sh = sheet('e_grunt_death');
    for (const c of list) {
      const d = c.z - runZ;
      if (offscreen(d, 80)) continue;
      const q = pj(c.x, d);
      const role = c.role ?? 'grunt';
      if (role === 'grunt' && sh) {
        const total = sh.frames / sh.fps + FX.corpseLingerSec;
        ctx.globalAlpha = Math.max(0, Math.min(1, (total - c.t) / FX.corpseFadeSec));
        drawSheetFrame(sh, sheetFrameAt(sh, c.t), q.x, q.y, c.h * q.s);
        continue;
      }
      const life = c.life || 0.8;
      const fade = Math.max(0, Math.min(1, (life - c.t) / FX.corpseFadeSec));
      const r = (c.r || 16) * q.s;
      //  r3.26 파괴 그림: 'dead:<그림>' 이 있으면 조각이 흩어진 그 그림을 짧게 키우며 흐린다(없으면 아래 도형 잔해)
      const deadB = artBase3(c.kind, c.skin);
      const deadIm = deadB ? get('dead:' + deadB) : null;
      if (deadIm) {
        const u = Math.min(1, c.t / Math.max(0.01, life));
        const hh = (c.h || r * 2.4) * q.s * (1 + 0.28 * u);
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = 'rgba(25,22,24,1)';
        ctx.beginPath(); ctx.ellipse(q.x, q.y + r * 0.6, r * 1.05, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = fade;
        const w = hh * (deadIm.width / deadIm.height);
        ctx.drawImage(deadIm, q.x - w / 2, q.y - hh / 2, w, hh);
        ctx.globalAlpha = 1;
        continue;
      }
      //  그을음(바닥 타원) — 모든 비잡졸 공통, 역할마다 색·크기
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = role === 'ring' || role === 'shooter' ? 'rgba(90,20,60,1)' : 'rgba(25,22,24,1)';
      const sr = role === 'cart' ? r * 1.7 : role === 'armor' ? r * 1.25 : r * 1.05;
      ctx.beginPath(); ctx.ellipse(q.x, q.y + r * 0.6, sr, sr * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      if (role === 'rusher') {
        //  앞으로 굴러 넘어짐: 0.35초에 걸쳐 100° 기울며 아래로 미끄러진 뒤 머문다
        const u = Math.min(1, c.t / 0.35);
        const ang = u * 1.75 * (c.id % 2 ? 1 : -1), slide = u * 18 * q.s;
        const hh = c.h * q.s;
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(q.x, q.y + slide + hh * 0.2);
        ctx.rotate(ang);
        drawImgCentered(c.skin ? 'skin:' + c.skin : ENEMY_SPRITE[c.kind], 0, -hh * 0.2, hh, () => {
          ctx.fillStyle = ENEMY_FALLBACK[c.kind] ?? '#3A3A3A';
          ctx.beginPath(); ctx.arc(0, -hh * 0.2, r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      } else if (role === 'armor') {
        //  장갑판 조각 4장이 흩어져 누워 있다(자리는 id 로 결정)
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#8E97A3';
        for (let i = 0; i < 4; i++) {
          const a = i * 1.57 + (c.id % 5) * 0.4;
          ctx.save();
          ctx.translate(q.x + Math.cos(a) * r * 0.9, q.y + r * 0.5 + Math.sin(a) * r * 0.3);
          ctx.rotate(a);
          ctx.fillRect(-r * 0.3, -r * 0.12, r * 0.6, r * 0.24);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  //  pop(0~1, r3.24) = 맞은 순간 숫자가 커졌다 작아지는 정도(최대 +45%)이고 그동안 흰색으로 번쩍인다
  function drawHpTag(x, y, hp, k = 1, pop = 0) {
    ctx.textAlign = 'center';
    outlinedText(String(Math.max(0, Math.ceil(hp))), x, y, fs(16, k, 12) * (1 + 0.45 * pop), pop > 0.5 ? HIT_FLASH_FILL : C.bulletHeavy, 'bold', 4);
  }

  //  보너스전 표적(r3.15): 노란 선물 상자(roundRect) + 붉은 리본(세로·가로 띠 + 매듭 원 2개) + 그림자 + 위 '+value' 금색 소자 + 아래 내구 숫자(통과 같은 자리 규약).
  //   새 그림 없이 도형으로만. 살아 있는 표적만 그린다(파괴된 것은 respawn 뒤 같은 궤적에 다시 나타난다)
  function drawBonusTargets(run) {
    const list = run.bonusTargets ?? [];
    if (!list.length) return;
    for (const t of list) {
      if (!t.alive) continue;
      const d = t.z - run.z;
      if (offscreen(d, 60)) continue;
      const q = pj(t.x, d), x = q.x, y = q.y, k = q.s;
      const r = t.r * k;
      shadow(x, y + r * 0.95, r * 0.9);
      //  표적 그림(2026-09-19 Gemini): 짝수 id = 선물 상자, 홀수 id = 별 코인. 없으면 종전 도형(노란 상자 + 리본)
      drawImgCentered((t.id ?? 0) % 2 === 1 ? 'bonus_coin' : 'bonus_gift', x, y, r * 2.2, () => {
        ctx.fillStyle = C.bonusBox;
        roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 6 * k); ctx.fill();
        ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
        roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 6 * k); ctx.stroke();
        ctx.fillStyle = C.bonusRibbon;
        ctx.fillRect(x - r * 0.18, y - r * 0.8, r * 0.36, r * 1.6);
        ctx.fillRect(x - r, y - r * 0.16, r * 2, r * 0.32);
        ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.92, r * 0.24, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.32, y - r * 0.92, r * 0.24, 0, Math.PI * 2); ctx.fill();
      });
      ctx.textAlign = 'center';
      outlinedText('+' + t.value, x, y - r * 1.15, fs(13, k), C.gold, 'bold', 4);
      outlinedText(String(Math.max(0, Math.ceil(t.hp))), x, y + r + 18 * k, fsMin(16, k), C.bulletHeavy, 'bold', 4);
    }
  }

  //  정예: 스프라이트(skin 우선 → 'elite' 키 → 폴백 원) + 발밑 HP 숫자. 막대는 HUD 에서.
  //   r3.16 복수 정예: 역할이 'elite' 가 아니면 HP 숫자 아래 역할 이름('포격'·'소환'·'장갑') 한 줄. 장갑형 폴백 원은 테두리를 두껍게(새 그림 없이 도형으로만)
  //   r3.17 아레나: 예고(warn)·돌진(dash) 중이면 목표 지점에 붉은 원(반지름 = 충격 r × 그 자리 배율, 깜빡임)과 보스→목표 점선을 **보스보다 먼저** 그린다. shockR 은 run.arena.boss.shock.r
  function drawBoss(b, runZ, now, shockR = null, fx = null) {
    const q = pj(b.x, b.z - runZ), x = q.x, y = q.y, k = q.s;
    //  피격 반응(r3.24): 짧은 번쩍임·작은 흔들림·HP 숫자 튐(정예는 무겁다 — 넉백 작게)
    const hr = hitPose(fx, b.id, 'elite', k);
    const r = b.r * k;
    const role = b.role ?? 'elite';
    if (b.arena && (b.state === 'warn' || b.state === 'dash') && b.dashTx != null) {
      const t = pj(b.dashTx, b.dashTz - runZ), tr = (shockR ?? 70) * t.s;
      ctx.save();
      ctx.strokeStyle = C.warn; ctx.fillStyle = C.warn; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.12;
      ctx.beginPath(); ctx.arc(t.x, t.y, tr, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(now * 14));
      ctx.beginPath(); ctx.arc(t.x, t.y, tr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    shadow(x, y + r * 1.05, r * 1.15);
    const bkey = b.skin ? 'skin:' + b.skin : 'elite';
    if (hr) { ctx.save(); poseAt(hr, x, y + r * 1.05); }
    drawImgCentered(bkey, x, y, r * 2.6, () => {
      ctx.fillStyle = ENEMY_FALLBACK.elite;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.warn; ctx.lineWidth = role === 'tank' ? 9 : 6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.eshot;
      ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill();
    });
    if (hr && hr.flash > 0) {
      ctx.globalAlpha = hr.flash;
      const im = get(bkey), wim = im ? whiteOf(im, 320) : null;
      if (wim) { const bh = r * 2.6, bw = bh * (im.width / im.height); ctx.drawImage(wim.c, x - bw / 2, y - bh / 2, bw, bh); }
      else { ctx.fillStyle = HIT_FLASH_FILL; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (hr) ctx.restore();
    if (b.state === 'descend' || b.state === 'warn') {
      ctx.globalAlpha = 0.5 + Math.sin(now * 12) * 0.3;
      ctx.strokeStyle = C.warn; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 10 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    //  보호막(r3.18 아레나): 첫 착지 충격까지 피격 무효 — 하늘색 점선 링(r+16) + '보호막' 글자. 새 그림 없이 도형으로
    if (b.guard) {
      ctx.save();
      ctx.strokeStyle = C.gatePos; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55 + Math.sin(now * 6) * 0.2;
      ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.arc(x, y, r + 16 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.textAlign = 'center';
      outlinedText('보호막', x, y - r - 22 * k, fs(14, k), C.gatePos, 'bold', 4);
    }
    drawHpTag(x, y + r + 20 * k, b.hp, k, hr ? hr.pop : 0);
    const rl = role !== 'elite' ? (BAL3.elites?.roles?.[role]?.label ?? null) : null;
    if (rl) { ctx.textAlign = 'center'; outlinedText(rl, x, y + r + 36 * k, fs(12, k), C.hud, 'bold', 4); }
  }

  //  부대: 실제 units 배열 — 히어로(units[0], M01) + 병사(SOLDIER). 그림자·행진 바운스·병력 수·중심 마커
  //   원근(r3.20): 병사마다 부대 중심 + (dx, dz) 로 각각 투영한다 — 앞줄(d 큰 쪽)은 작게, 뒷줄(d < 0)은 부대 줄 배율 near 그대로·간격은 평면(수정 라운드 2
  //   2026-09-20 — 처음엔 뒷줄이 자라 s 1.9 → 1.5 상한, 그래도 59/40명부터 뒷줄이 화면 아래로 넘쳐 project.js 뒤쪽 갈래를 바꿨다). 아레나 ay 는 d 오프셋(−ay)
  //   병력 수는 종전 '가장 뒷줄 아래(H − 14 클램프)' 에서 **부대 중심 마커 옆**으로 옮겼다(수정 라운드 2): 뒷줄이 화면 밖일 때 병사 위에 겹치던 것을 없앤다.
  //   마커 위 전방 ±45° 는 대형이 비어 있어 병사와 겹치지 않는다. 마커가 화면 오른쪽 끝에 가까우면 왼쪽에 쓴다(COUNT_FLIP_X)
  function drawSquad(run, fx, now) {
    const S = BAL3.squad;
    const units = run.units;
    if (!units.length) return;
    const ay = run.ay || 0;
    const order = units.map((u, i) => ({ u, i })).sort((a, b) => a.u.dy - b.u.dy || a.i - b.i);
    for (const { u, i } of order) {
      const hero = i === 0;
      const q = pj(run.x + u.dx, -(ay + u.dy));
      const size = (hero ? S.heroSize : S.soldierSize) * q.s;
      shadow(q.x, q.y + size * 0.42, size * 0.42);
    }
    for (const { u, i } of order) {
      const hero = i === 0;
      const phase = now * 9 + i * 1.7;
      const bob = hero ? Math.sin(now * 9) * 2 : Math.sin(phase) * 1.6;
      const sway = hero ? Math.sin(now * 4.5) * 0.8 : Math.sin(phase * 0.5 + i) * 1.1;
      const q = pj(run.x + u.dx + sway, -(ay + u.dy));
      const size = (hero ? S.heroSize : S.soldierSize) * q.s;
      const px = q.x, py = q.y + bob * q.s;
      const hurt = u.hp < S.unitHp;
      //  히어로 동작 시트: 사격 중(fx.heroFire 남은 초)이면 사격 시트, 아니면 걷기 루프(now 기준). 시트가 없으면 정지 그림
      //  heroFireAlways: 출격 중엔 사격 시트를 now 기준으로 계속 돌린다. 아니면 fx.heroFire 창에서만 사격, 나머지는 걷기
      const always = !!FX.heroFireAlways;
      const firing = always || !!(fx && fx.heroFire > 0);
      //  사격 시트는 무기별(m1_fire_rifle 등, 2026-09-19 장착 그림 기반)이 있으면 그것을, 없으면 공용 사격 시트를 쓴다
      const wid = run.weapon || 'rifle';
      const unitSh = hero
        ? (firing ? (sheet('m1_fire_' + wid) || sheet('m1_fire')) : sheet('m1_walk'))
        : (firing ? (sheet('soldier_fire_' + wid) || sheet('soldier_fire')) : sheet('soldier_walk'));
      if (unitSh) {
        //  병사는 i 마다 위상을 0.13초씩 어긋나게 — 부대가 한 몸처럼 딱딱 맞지 않게(사격 시트는 루프라 위상만 돈다)
        const animT = (firing && !always ? unitSh.frames / unitSh.fps - fx.heroFire : now) + (hero ? 0 : i * 0.13);
        drawSheetFrame(unitSh, sheetFrameAt(unitSh, animT), px, py, size);
      } else drawImgCentered(hero ? 'm1' : 'soldier', px, py, size, () => {
        ctx.fillStyle = hero ? C.hero : C.soldier;
        ctx.beginPath();
        ctx.moveTo(px, py - size / 2);
        ctx.lineTo(px - size / 3, py + size / 2);
        ctx.lineTo(px + size / 3, py + size / 2);
        ctx.closePath();
        ctx.fill();
      });
      //  다친 유닛 표시(hp 1): 붉은 점
      if (hurt) {
        ctx.fillStyle = C.heroHurt;
        ctx.beginPath(); ctx.arc(px, py - size / 2 - 4 * q.s, 3 * q.s, 0, Math.PI * 2); ctx.fill();
      }
    }
    //  부대 중심 마커(삼각) — 게이트 칸 판정 기준. 중심(run.x, d −ay)의 투영점 위
    const sq = pj(run.x, -ay), ks = sq.s;
    const my = sq.y - S.heroSize * ks / 2 - 14 * ks;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(sq.x, my - 8);
    ctx.lineTo(sq.x - 6, my + 2);
    ctx.lineTo(sq.x + 6, my + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(sq.x, my - 10); ctx.lineTo(sq.x, my - 120); ctx.stroke();
    ctx.setLineDash([]);
    //  병력 수(피격 중 빨강): 부대 중심 마커(삼각) 옆. 오른쪽 기본, 마커가 COUNT_FLIP_X 를 넘으면 왼쪽
    const right = sq.x <= COUNT_FLIP_X;
    ctx.textAlign = right ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    outlinedText(String(units.length), sq.x + (right ? COUNT_DX : -COUNT_DX), my - 3, 26, fx.hurtT > 0 ? C.heroHurt : C.hero, 'bold', 6);
    ctx.textBaseline = 'alphabetic';
  }

  //  착지 충격 링(r3.17 아레나, 셸 fx.shocks — 셸이 투영해 둔 화면 좌표·반지름): 반지름 r·(0.5 + 0.9k) 로 퍼지며 (1 − k) 로 옅어진다. 새 그림 없음
  function drawShocks(list) {
    for (const s of list) {
      if (s.t < 0) continue;   // r3.24: 한 박자 늦게 퍼지는 링(t 음수 = 대기)
      const k = Math.max(0, Math.min(1, s.t / (s.life || 0.45)));
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = s.color ?? C.warn;
      ctx.lineWidth = 2 + 6 * (1 - k);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.5 + 0.9 * k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  //  아군 탄: 무기별 **그림**(bullet_<weapon>, 위를 향한 자세)을 진행 방향(bulletAngle)으로 돌려 그리고
  //   뒤에 무기색 꼬리(알파 그라디언트)를 깐다. 위치·크기는 그 자리 배율(q.s)을 곱해 원근을 따른다.
  //   Mk 강화의 탄 폭(b.w)이 그림 크기에도 반영된다. 그림이 없으면 종전 막대 폴백(같은 색·같은 자리).
  function drawBullets(run) {
    for (const b of run.bullets) {
      if (b.dead) continue;
      const d = b.z - run.z;
      if (offscreen(d, 40)) continue;
      const q = pj(b.x, d), k = q.s;
      const w = WEAPONS[b.kind] ?? WEAPONS.rifle;
      const bw0 = b.w ?? w.w;        // Mk 강화로 탄 폭이 커진다(트랙 기준)
      const bw = bw0 * k;
      const len = (10 + bw0 * 1.5) * k;
      const im = get('bullet_' + w.id);
      if (im) {
        const hh = (BULLET_LEN[w.id] ?? 26) * (1 + (bw0 - w.w) * 0.12) * k;
        const iw = hh * (im.width / im.height);
        const ang = bulletAngle(b);
        ctx.save();
        ctx.translate(q.x, q.y);
        if (ang !== 0) ctx.rotate(ang);
        //  꼬리: 탄 뒤쪽(아래)으로 무기색이 옅어지는 띠
        const tail = hh * 0.9;
        const gr = ctx.createLinearGradient(0, 0, 0, tail);
        gr.addColorStop(0, w.color); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = gr;
        ctx.fillRect(-Math.max(2, bw * 0.4), 0, Math.max(4, bw * 0.8), tail);
        ctx.globalAlpha = 1;
        ctx.drawImage(im, -iw / 2, -hh * 0.75, iw, hh);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = w.color;
      ctx.fillRect(q.x - bw / 2, q.y - len, bw, len);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(q.x - bw / 6, q.y - len + 2 * k, bw / 3, len * 0.5);
    }
  }

  //  적탄: 마젠타 구슬 + 흰 테(기존 램프탄 복제)
  function drawEshots(run) {
    for (const s of run.eshots) {
      if (s.dead) continue;
      const d = s.z - run.z;
      if (offscreen(d, 20)) continue;
      const q = pj(s.x, d), r = 5.5 * q.s;
      ctx.fillStyle = C.eshot;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  //  파편·플로터·팝은 셸이 만드는 시점에 투영한 **화면 좌표**를 들고 있다(main.js) — 여기서는 그대로 찍는다
  function drawParts(parts) {
    for (const p of parts) {
      const k = 1 - p.t / p.life;
      if (p.flash) {
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = p.big ? '#FFD9A0' : '#FFE9C8';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'line') {
        //  가는 선(저격 은백·금속 스파크): 진행 방향으로 늘어진 짧은 선
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.r);
        const L = 0.045;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * L, p.y - p.vy * L); ctx.stroke();
      } else if (p.shape === 'bolt') {
        //  번개 조각(전격 청보라): 세 마디 지그재그
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.2, p.r * 0.8);
        const ux = p.vx * 0.03, uy = p.vy * 0.03;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * 0.5 + uy * 0.5, p.y - uy * 0.5 - ux * 0.5);
        ctx.lineTo(p.x - ux + -uy * 0.3, p.y - uy + ux * 0.3);
        ctx.stroke();
      } else if (p.shape === 'plate') {
        //  장갑판 조각: 돌며 날아가는 납작한 판
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + p.t * 9);
        ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        ctx.restore();
      } else if (p.shape === 'smoke') {
        //  연기·먼지: 커지며 옅어지는 덩이
        ctx.globalAlpha = k * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - k * 0.8), 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'star') {
        //  반짝임(합류·게이트 양수): 네 갈래 별
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        const a = p.r * (0.6 + k), b2 = a * 0.3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - a); ctx.lineTo(p.x + b2, p.y - b2); ctx.lineTo(p.x + a, p.y); ctx.lineTo(p.x + b2, p.y + b2);
        ctx.lineTo(p.x, p.y + a); ctx.lineTo(p.x - b2, p.y + b2); ctx.lineTo(p.x - a, p.y); ctx.lineTo(p.x - b2, p.y - b2);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color ?? (p.big ? C.bulletHeavy : C.gateNeg);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k + 1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  //  부대로 날아가는 병사(r3.24 합류 연출, 셸 fx.recruits — 셸이 매 프레임 투영해 둔 화면점 sx/sy/s): 병사 그림(없으면 삼각) + 금색 테
  function drawRecruits(list) {
    if (!list || !list.length) return;
    const S = BAL3.squad;
    const walk = sheet('soldier_walk');
    for (const p of list) {
      if (p.t < 0) continue;
      //  실제 병사보다 조금 크게(1.3배) — 먼 통에서 출발하면 원근 배율이 작아 캡처에서 점처럼 보였다
      const size = S.soldierSize * (p.s || 1) * 1.3;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(246,200,74,0.35)';
      ctx.beginPath(); ctx.arc(p.sx, p.sy, size * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (walk) drawSheetFrame(walk, sheetFrameAt(walk, p.t * 1.6 + p.i * 0.13), p.sx, p.sy, size);
      else drawImgCentered('soldier', p.sx, p.sy, size, () => {
        ctx.fillStyle = C.soldier;
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy - size / 2);
        ctx.lineTo(p.sx - size / 3, p.sy + size / 2);
        ctx.lineTo(p.sx + size / 3, p.sy + size / 2);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  function drawFloaters(floaters) {
    ctx.textAlign = 'center';
    for (const f of floaters) {
      //  '-n' 은 HUD 띠(HP 숫자와 같은 문턱)에 들어오면 그리지 않는다 — 먼 곳에서 맞는 적의 숫자가 제목·칩 위에 겹친다(캡처 실측)
      if (f.dmg && f.y < HP_TAG_MIN_Y) continue;
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
      //  '-n'(r3.24 피격 숫자): 작은 글자(px) — 숫자가 묶여 커질 때(pop 0 → 0.12초) 잠깐 부푼다
      const px = f.px ? f.px * (f.pop !== undefined && f.pop < 0.12 ? 1.35 - f.pop * 2.9 : 1) : (f.big ? 34 : 22);
      outlinedText(f.text, f.x, f.y, px, f.color, 'bold', f.px ? 4 : 5);
    }
    ctx.globalAlpha = 1;
  }

  //  보상 팝: 떠오른 뒤 부대로 흡수되는 글자(위치는 셸이 움직인다)
  function drawPops(pops) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of pops) {
      const k = p.t / p.life;
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      outlinedText(p.text, p.x, p.y, 26, p.color, 'bold', 6);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  /** 랜덤 길 가림(계약서 3-9): 통로 확정선(lot.revealZ) 전에는 우측 통로 물체를 '?' 상자로 덮는다.
   *  0 = 다 걷힘 · 1 = 완전히 덮임. 확정 직후 0.25초(fx.lotOpen)에 걸쳐 걷힌다. */
  function lotteryMask(run, fx) {
    const lot = run.lottery;
    if (!lot) return 0;
    if (run.z < lot.revealZ) return 1;
    const left = fx && fx.lotOpen ? fx.lotOpen : 0;
    const openT = BAL3.lottery.openT || 0.25;
    return left > 0 ? Math.max(0, Math.min(1, left / openT)) : 0;
  }

  //  '?' 상자(가림 판). 회색 판 + 금색 물음표. 걷히는 동안 위로 줄어들며 사라진다. 자리·크기는 lot.z 에서 투영(글은 하한 15px)
  function drawLotteryBox(run, mask) {
    const lot = run.lottery;
    if (!lot || mask <= 0) return;
    const d = lot.z - run.z;
    if (offscreen(d, 70)) return;
    const q = pj(lot.x, d), x = q.x, y = q.y, k = q.s;
    const bw = 88 * k, bh = 76 * k;
    ctx.save();
    ctx.globalAlpha = mask;
    shadow(x, y + bh * 0.46, 34 * k);
    ctx.fillStyle = 'rgba(120,128,140,0.92)';
    roundRect(x - bw / 2, y - bh / 2, bw, bh, 12 * k);
    ctx.fill();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 4;
    roundRect(x - bw / 2, y - bh / 2, bw, bh, 12 * k);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlinedText('?', x, y - 4 * k, fsMin(44, k), C.gold, 'bold', 6);
    outlinedText('랜덤 길', x, y + 26 * k, fsMin(14, k), C.supplyBody, 'bold', 4);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  HUD 칩 바탕(난이도·무기·⏸ 공통) — 같은 높이·같은 모서리 반경·같은 바탕색을 한 함수에서만 그린다
  function hudChip(b) {
    ctx.fillStyle = 'rgba(20,35,58,0.82)';
    roundRect(b.x, b.y, b.w, b.h, HUD_ROW.r);
    ctx.fill();
  }

  //  HUD: 좌상 STAGE n 제목 + 남은 거리 m / 우상 한 줄(난이도 칩 · 무기 칩 · ⏸) / 정예 HP 막대+숫자
  //  ⚠️우상 세 조각의 자리는 HUD_ROW 한 곳에서 온다. ⏸ 만은 **셸이 넘긴 버튼 상자 그대로** 그린다 —
  //   그 상자가 곧 히트 영역이라, 그리는 자리와 누르는 자리가 구조적으로 같아진다(drawButtons 는 이 버튼을 건너뛴다).
  function drawHud(view) {
    const run = view.run, hud = view.hud;
    const cy = HUD_ROW.cy;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    //  제목은 난이도 칩 앞에서 끝나야 한다(24스테이지 제목 중 '크라운 브레이커' 같은 긴 것).
    //  순서: 기본 크기 → 한 단계 작게(17px) → 그래도 넘치면 'STAGE ' 접두 제거 → 마지막 안전망 maxWidth
    const titleMaxW = HUD_ROW.box.diff.x - HUD_ROW.left - 6;
    const fits = (t, fs) => { ctx.font = '900 ' + fs + 'px ' + FONT; return ctx.measureText(t).width <= titleMaxW; };
    const full = 'STAGE ' + run.stageId + '  ' + run.title, short = run.stageId + '  ' + run.title;
    let titleText = full, titleFs = HUD_ROW.titleFs;
    if (!fits(full, titleFs)) { titleFs = HUD_ROW.titleFsSmall; if (!fits(full, titleFs)) titleText = short; }
    outlinedText(titleText, HUD_ROW.left, cy, titleFs, C.hud, '900', 6, titleMaxW);
    //  보너스전(r3.15): 목표 줄에 남은 초·점수·단계(금색). 비보너스 경로('정예 전투!'/'작전 완료'/'남은 거리')는 한 줄도 바뀌지 않는다
    const bo = run.bonus ?? null;
    if (bo) {
      const left = Math.max(0, Math.ceil(bo.sec - bo.t));
      outlinedText('보너스 ' + left + '초 · ' + bo.score + '점 · 단계 ' + bo.tier, HUD_ROW.left, HUD_ROW.distCy, HUD_ROW.distFs, C.gold, 'bold', 5);
    } else {
      //  r3.16 복수 정예: 보스가 둘 이상이면 '정예 전투! 남은 목표 N/M'. 단수는 종전 문구 그대로
      const bTotal = (run.bosses ?? []).length, bLeft = (run.bosses ?? []).filter((b) => !b.dead).length;
      //  r3.17 아레나: 광장 보스전은 '아레나 전투!'(도로 정예 문구는 그대로)
      const goal = run.boss ? (run.phase === 'arena' ? '아레나 전투!' : bTotal > 1 ? '정예 전투! 남은 목표 ' + bLeft + '/' + bTotal : '정예 전투!') : (run.bossDefeated ? '작전 완료' : '남은 거리 ' + hud.distM + 'm');
      outlinedText(goal, HUD_ROW.left, HUD_ROW.distCy, HUD_ROW.distFs, run.boss ? C.gateNeg : C.hero, 'bold', 5);
    }
    //  무기 칩
    const wb = HUD_ROW.box.weapon;
    const w = WEAPONS[run.weapon] ?? WEAPONS.rifle;
    hudChip(wb);
    const mk = run.weaponMk || 1;
    const wim = icon(w.id, mk) || icon(w.id);
    if (wim) drawIconCentered(wim, wb.x + 26, cy, 24, 34);
    else {
      ctx.fillStyle = w.color;
      roundRect(wb.x + 12, cy - 5, 26, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(wb.x + 16, cy - 3, 7, 6);
    }
    ctx.font = 'bold ' + HUD_ROW.fs + 'px ' + FONT;
    ctx.fillStyle = w.color;
    ctx.fillText(w.name + (MK_LABEL[mk] ?? ''), wb.x + 48, cy);
    //  난이도 태그(어려움·지옥만): 무기 칩 왼쪽 옆. 보통은 short 가 빈 문자열이라 칩 자체를 그리지 않는다
    const ds = diffShort(run.difficulty);
    if (ds) {
      const db = HUD_ROW.box.diff;
      hudChip(db);
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + HUD_ROW.fs + 'px ' + FONT;
      ctx.fillStyle = DIFF_COLOR[run.difficulty] ?? C.hud;
      ctx.fillText(ds, db.x + db.w / 2, cy);
      ctx.textAlign = 'left';
    }
    //  ⏸(일시정지) — 셸이 hud:true 로 넘긴 버튼만. 없는 상태(일시정지 중·결과)에서는 그리지 않는다
    const pb = (view.buttons ?? []).find((b) => b.hud);
    if (pb) {
      hudChip(pb);
      ctx.textAlign = 'center';
      ctx.font = '700 ' + HUD_ROW.fs + 'px ' + FONT;
      ctx.fillStyle = C.hero;
      ctx.fillText(pb.label, pb.x + pb.w / 2, pb.y + pb.h / 2);
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'alphabetic';
    //  정예 HP 막대. r3.16 복수 정예: 보스가 둘 이상이면 300px 를 gap 6 으로 등분해 칸마다 '역할 hp/max'(격파된 칸은 회색 '격파'). 단수는 종전 그리기 그대로
    if (run.boss) {
      const bosses = run.bosses ?? [run.boss];
      //  r3.24: 보스가 맞는 동안 막대가 좌우로 떨린다(떨림은 캔버스 이동으로만 — 막대 좌표는 그대로)
      const bfx = view.fx && view.fx.hit;
      const barShake = (b) => { const h = bfx ? bfx[b.id] : null; return h && h.t < FX.hit.knockSec ? Math.sin(h.t * 110) * 3 * (1 - h.t / FX.hit.knockSec) : 0; };
      if (bosses.length <= 1) {
        const bs = barShake(run.boss);
        if (bs) { ctx.save(); ctx.translate(bs, 0); }
        ctx.fillStyle = 'rgba(20,35,58,0.85)';
        roundRect(90, 76, 300, 16, 8); ctx.fill();
        ctx.fillStyle = C.eshot;
        roundRect(90, 76, 300 * Math.max(0, run.boss.hp / run.boss.max), 16, 8); ctx.fill();
        ctx.textAlign = 'center';
        outlinedText('정예 ' + Math.max(0, Math.ceil(run.boss.hp)) + ' / ' + run.boss.max, W / 2, 111, 15, C.hud, 'bold', 4);
        if (bs) ctx.restore();
      } else {
        const n = bosses.length, gap = 6, segW = (300 - gap * (n - 1)) / n, fs = n >= 3 ? 12 : 13;
        ctx.textAlign = 'center';
        for (let i = 0; i < n; i++) {
          const b = bosses[i], x = 90 + i * (segW + gap);
          const bs = b.dead ? 0 : barShake(b);
          if (bs) { ctx.save(); ctx.translate(bs, 0); }
          ctx.fillStyle = 'rgba(20,35,58,0.85)';
          roundRect(x, 76, segW, 16, 8); ctx.fill();
          if (!b.dead) {
            ctx.fillStyle = C.eshot;
            roundRect(x, 76, segW * Math.max(0, Math.min(1, b.hp / b.max)), 16, 8); ctx.fill();
          }
          const label = BAL3.elites?.roles?.[b.role ?? 'elite']?.label ?? '정예';
          outlinedText(b.dead ? '격파' : label + ' ' + Math.max(0, Math.ceil(b.hp)) + '/' + b.max, x + segW / 2, 111, fs, b.dead ? C.gateZero : C.hud, 'bold', 4);
          if (bs) ctx.restore();
        }
      }
    }
    //  보너스전 진행 막대(r3.15): 정예 HP 막대 자리(y 76, 300×16)를 재사용 — 다음 단계 문턱까지 score/next(만렙이면 가득) + 아래 글.
    //   run·paused 상태에서만(검수 반영): 결과 화면은 run 장면 위에 덮이는 규약이라 이 글(y111)이 '작전 성공!' 바로 위에 비쳐 겹쳐 읽혔다
    if (bo && !run.boss && (view.state === 'run' || view.state === 'paused')) {
      const tiers = (run.bonusDef && run.bonusDef.tiers) || [];
      const next = tiers[bo.tier] ?? null;
      const prev = bo.tier > 0 ? tiers[bo.tier - 1] : 0;
      const k = next == null ? 1 : Math.max(0, Math.min(1, (bo.score - prev) / Math.max(1, next - prev)));
      ctx.fillStyle = 'rgba(20,35,58,0.85)';
      roundRect(90, 76, 300, 16, 8); ctx.fill();
      ctx.fillStyle = C.gold;
      roundRect(90, 76, 300 * k, 16, 8); ctx.fill();
      ctx.textAlign = 'center';
      outlinedText(next == null ? '최고 단계' : '다음 단계까지 ' + Math.max(0, next - bo.score) + '점', W / 2, 111, 15, C.hud, 'bold', 4);
    }
  }

  //  배너 상자 1개(셔터 배너·목표 배너 공용): 문구는 줄 배열로 받는다(한 줄로 쓰면 480px 화면에서 양끝이 잘린다 — 줄은 어절 경계에서만 나눈다).
  //   반환 = 상자 높이(다음 배너를 그 아래에 쌓기 위해)
  function bannerBox(text, y, alpha) {
    const lines = Array.isArray(text) ? text : [text];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20,35,58,0.86)';
    const bh = 22 + lines.length * 24;
    roundRect(28, y, W - 56, bh, 14); ctx.fill();
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = C.hud;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, y + 23 + i * 24);
    ctx.globalAlpha = 1;
    return bh;
  }

  //  안내·경고 배너
  function drawBanners(fx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (fx.guideT > 0) {
      ctx.globalAlpha = Math.min(1, fx.guideT / 0.5);
      ctx.fillStyle = 'rgba(20,35,58,0.82)';
      roundRect(40, 268, W - 80, 52, 14); ctx.fill();
      ctx.font = 'bold 18px ' + FONT;
      ctx.fillStyle = C.hud;
      ctx.fillText('좌우로 드래그 · 쏴서 숫자를 키우세요', W / 2, 294);
      ctx.globalAlpha = 1;
    }
    //  슬롯 C(y 332): 첫 플레이 안내(y 268)·정예 경고(y 196)와 겹치지 않는 자리. 여러 배너가 동시에 살아 있으면 셔터 → 목표 순으로 아래로 쌓는다(+bh+8)
    let slotY = 332;
    //  첫 셔터 조우 배너(N2-⑥): 셔터가 걸린 행이 처음 화면에 들어온 그 시점에 1회. 문구는 셸이 넘긴다
    if (fx.shutterT > 0 && fx.shutterText) {
      slotY += bannerBox(fx.shutterText, slotY, Math.min(1, fx.shutterT / 0.5)) + 8;
    }
    //  작전 목표 배너(r3.14 구출 캡슐): 출격 직후 판당 1회. fx 새 칸은 ?? 로 관용(옛 fx 꼴에도 그린다)
    if ((fx.objT ?? 0) > 0 && fx.objText) {
      slotY += bannerBox(fx.objText, slotY, Math.min(1, fx.objT / 0.5)) + 8;
    }
    //  아레나 안내 배너(r3.17): 광장 전환 시 판마다 1회 '드래그로 피하세요'(두 줄). 같은 슬롯 C 에 셔터 → 목표 → 아레나 순으로 쌓인다. fx 새 칸은 ?? 로 관용
    if ((fx.arenaT ?? 0) > 0 && fx.arenaText) {
      slotY += bannerBox(fx.arenaText, slotY, Math.min(1, fx.arenaT / 0.5)) + 8;
    }
    if (fx.eliteT > 0) {
      const k = fx.eliteT / FX.eliteBannerSec;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(194,39,59,0.85)';
      ctx.fillRect(0, 196, W, 56);
      ctx.font = '900 30px ' + FONT;
      ctx.fillStyle = '#FFFFFF';
      //  r3.16 복수 정예: 셸이 '정예 2체 접근!' 처럼 문구를 넘기면 그것을, 없으면(옛 fx 꼴) 종전 문구
      ctx.fillText(fx.eliteText ?? '정예 접근!', W / 2, 224);
      ctx.globalAlpha = 1;
    }
    //  정예 처치 배너(r3.16 복수 정예): 하나를 잡았는데 목표가 남았을 때 같은 슬롯 A(y196 h56)에 붉은 띠로 '정예 N 격파 — 남은 목표 M'. fx 새 칸은 ?? 로 관용
    if ((fx.bossBannerT ?? 0) > 0 && fx.bossBannerText) {
      const k = fx.bossBannerT / (FX.bossKillBannerSec || 1.2);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(194,39,59,0.85)';
      ctx.fillRect(0, 196, W, 56);
      ctx.font = '900 26px ' + FONT;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(fx.bossBannerText, W / 2, 224);
      ctx.globalAlpha = 1;
    }
    //  보너스전 시작 배너(r3.15): 정예 경고와 같은 슬롯 A(y196 h56) 를 금색 띠로 — 시간상 배타(정예 배너는 보스 등장 때 0.8초로 이미 끝났다). fx 새 칸은 ?? 로 관용
    if ((fx.bonusT ?? 0) > 0 && fx.bonusText) {
      const k = fx.bonusT / (BAL3.bonus.bannerSec || 1.5);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(246,200,74,0.9)';
      ctx.fillRect(0, 196, W, 56);
      ctx.font = '900 30px ' + FONT;
      ctx.fillStyle = C.outline;
      ctx.fillText(fx.bonusText, W / 2, 224);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  //  버튼 공통(기존 복제): 주 버튼 = 딥 네이비 + 시안 라인, 보조 = 반투명 네이비 패널
  function drawButtons(buttons) {
    for (const b of buttons) {
      //  HUD 줄에 얹히는 버튼(⏸)은 drawHud 가 같은 칩으로 그린다 — 여기서 또 그리면 두 겹이 되고 모양이 갈라진다
      if (b.hud) continue;
      ctx.globalAlpha = b.disabled ? 0.45 : 1;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.primary) {
        ctx.fillStyle = C.outline;
        roundRect(b.x, b.y, b.w, b.h, Math.min(b.h / 2, 16)); ctx.fill();
        ctx.strokeStyle = C.gatePos; ctx.lineWidth = 2;
        roundRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, Math.min((b.h - 2) / 2, 15)); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(20,35,58,0.82)';
        roundRect(b.x, b.y, b.w, b.h, Math.min(b.h / 2, 16)); ctx.fill();
        ctx.strokeStyle = 'rgba(246,200,74,0.65)'; ctx.lineWidth = 1.5;
        roundRect(b.x, b.y, b.w, b.h, Math.min(b.h / 2, 16)); ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = b.primary ? '#FFFFFF' : C.hero;
      if (b.sub) {
        ctx.font = '700 17px ' + FONT;
        ctx.fillText(b.label, cx, cy - 10);
        ctx.font = '13px ' + FONT;
        ctx.fillStyle = b.primary ? 'rgba(255,255,255,0.75)' : 'rgba(243,241,232,0.75)';
        //  maxWidth: '완료 · 63명 · 0:47 · 구출✓'(r3.14) 처럼 긴 sub 가 칸을 넘치면 가로로 조금 압축, 안 넘치면 무변화
        ctx.fillText(b.sub, cx, cy + 12, b.w - 12);
      } else {
        ctx.font = '700 ' + (b.small ? 15 : 19) + 'px ' + FONT;
        ctx.fillText(b.label, cx, cy);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }
  }

  //  타이틀: 워드마크 + 히어로 + 스테이지 선택 3버튼(기록은 버튼 sub)
  function drawTitle(view) {
    drawBackground(view.now * 60, 0);
    ctx.textAlign = 'center';
    ctx.font = '700 15px ' + FONT;
    ctx.fillStyle = '#B98A1F';
    ctx.fillText('S T A R F O R G E   R U S H   v3', W / 2, 96);
    ctx.font = '900 50px ' + FONT;
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(243,241,232,0.9)';
    ctx.strokeText('스타포지 러시', W / 2, 150);
    ctx.fillStyle = C.outline;
    ctx.fillText('스타포지 러시', W / 2, 150);
    ctx.font = '600 16px ' + FONT;
    ctx.fillStyle = 'rgba(20,35,58,0.72)';
    ctx.fillText('쏴서 숫자를 키우고, 부대를 불려라', W / 2, 182);
    drawImgCentered('m1', W / 2, 282, 170, () => {
      ctx.fillStyle = C.hero;
      ctx.beginPath(); ctx.arc(W / 2, 282, 55, 0, Math.PI * 2); ctx.fill();
    });
    //  난이도 토글 줄(버튼은 drawButtons — 여기서는 왼쪽 라벨만). 위치는 main.DIFF_TOGGLE(y 382, h 34)
    ctx.textAlign = 'left';
    ctx.font = '700 15px ' + FONT;
    ctx.fillStyle = 'rgba(20,35,58,0.8)';
    ctx.fillText('난이도', 64, 404);
    ctx.textAlign = 'center';
    ctx.font = '700 15px ' + FONT;
    ctx.fillStyle = 'rgba(20,35,58,0.8)';
    ctx.fillText('작전을 고르세요', W / 2, 430);
    if (view.saveOk === false) {
      ctx.font = '600 13px ' + FONT;
      ctx.fillStyle = C.gateNeg;
      ctx.fillText('기록 저장 안 됨', W / 2, H - 22);
    }
  }

  //  결과: 성공/실패·생존·최고·시간·처치·놓친 것 한 줄·저장 실패 안내(버튼은 drawButtons)
  //  어절(공백) 경계에서만 끊는 줄바꿈 — 단어 중간에서 줄이 갈라지지 않게 한다
  function splitWrap(text, maxW) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function wrapLines(text, maxW, font) {
    const prev = ctx.font;
    if (font) ctx.font = font;
    const n = splitWrap(text, maxW).length;
    ctx.font = prev;
    return n;
  }
  function wrapText(text, cx, y, maxW, lh) {
    const lines = splitWrap(text, maxW);
    lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
    return lines.length;
  }

  function drawResult(view) {
    const r = view.result;
    ctx.fillStyle = 'rgba(5,8,14,0.8)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = '900 38px ' + FONT;
    ctx.fillStyle = r.won ? C.gold : C.gateNeg;
    ctx.fillText(r.won ? '작전 성공!' : '작전 실패', W / 2, 150);
    ctx.font = '700 16px ' + FONT;
    ctx.fillStyle = 'rgba(243,241,232,0.75)';
    const rds = diffShort(r.difficulty);
    const head = 'STAGE ' + r.stageId + '  ' + r.title + (rds ? '  ·  ' : '');
    ctx.fillText(head + rds, W / 2, 184);
    if (rds) {
      //  난이도 표기만 색을 달리해 한 번 더 그린다(제목 오른쪽 끝 위치는 measureText 로)
      const x0 = W / 2 - ctx.measureText(head + rds).width / 2 + ctx.measureText(head).width;
      ctx.textAlign = 'left';
      ctx.fillStyle = DIFF_COLOR[r.difficulty] ?? C.hud;
      ctx.fillText(rds, x0, 184);
      ctx.textAlign = 'center';
    }
    //  제목 아래 추가 줄(y 212 부터 18px 씩 쌓는다 — 통계 첫 줄 246 과 겹치지 않는 최소 간격): 랜덤 길 → 작전 목표 순
    let extraY = 212;
    //  랜덤 길 한 줄(계약서 3-9): 고른 판은 결과, 안 고른 판은 이번 판에 무엇이었는지 공개
    if (r.lottery) {
      ctx.font = '700 14px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText(r.lottery, W / 2, extraY);
      extraY += 18;
    }
    //  작전 목표 한 줄(r3.14 구출 캡슐): 승리 여부와 별개 — 성공은 청록, 실패는 주황
    if (r.objectiveLine) {
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = r.objective && r.objective.done ? C.chainPad : C.bulletHeavy;
      ctx.fillText(r.objectiveLine, W / 2, extraY);
      extraY += 18;
    }
    //  보너스전 한 줄(r3.15): '보너스 N점 · 단계 K(· 신기록)' 금색 — 추가 줄 순서 랜덤 길 → 목표 → 보너스(y 212 부터 18px 스택)
    if (r.bonusLine) {
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText(r.bonusLine, W / 2, extraY);
      extraY += 18;
    }
    const lines = [
      ['생존 병력', r.survivors + '명'],
      ['최고 병력', r.peak + '명'],
      ['시간', r.timeText],
      ['처치', r.kills],
    ];
    let y = 246;
    for (const [k, v] of lines) {
      ctx.textAlign = 'right';
      ctx.font = '600 19px ' + FONT;
      ctx.fillStyle = 'rgba(243,241,232,0.8)';
      ctx.fillText(k, W / 2 - 16, y);
      ctx.textAlign = 'left';
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillStyle = C.hero;
      ctx.fillText(String(v), W / 2 + 16, y);
      y += 40;
    }
    ctx.textAlign = 'center';
    //  제안 한 줄(advice)이 있으면 그것을 크게, 놓친 것 요약은 그 아래 작게(계약서 6장 · 개정 r3 §6-2)
    if (r.advice) {
      ctx.font = 'bold 17px ' + FONT;
      ctx.fillStyle = C.gatePos;
      wrapText(r.advice, W / 2, y + 4, W - 56, 22);
      if (!r.won && r.missedLine) {
        ctx.font = '600 13px ' + FONT;
        ctx.fillStyle = 'rgba(255,154,74,0.8)';
        ctx.fillText(r.missedLine, W / 2, y + 4 + 22 * wrapLines(r.advice, W - 56, 'bold 17px ' + FONT) + 6);
      }
    } else if (!r.won && r.missedLine) {                // 놓친 것 안내는 실패 판에만
      ctx.font = '600 15px ' + FONT;
      ctx.fillStyle = C.bulletHeavy;
      ctx.fillText(r.missedLine, W / 2, y + 6);
    }
    if (r.isBest) {
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText('신기록!', W / 2, y + 68);
    }
    //  [다시 도전] 바로 아래 작은 부연(2026-09-17 이사 결정 ①): 랜덤 길이 있는 스테이지는 **재도전마다 길을 새로 뽑는다**.
    //  ⚠️결과 한 줄(r.lottery)이 있는 판 = 그 스테이지에 랜덤 길이 있는 판이다. 버튼 자리는 셸(main.js)이 잡고,
    //   셸은 이 한 줄이 들어갈 만큼 아래 버튼을 내려 둔다(겹치면 글이 버튼에 깔린다).
    if (r.lottery) {
      const retry = (view.buttons ?? []).find((b) => b.id === 'retry');
      if (retry) {
        ctx.textAlign = 'center';
        ctx.font = '600 13px ' + FONT;
        ctx.fillStyle = 'rgba(246,200,74,0.85)';
        ctx.fillText(RETRY_LOTTERY_NOTE, retry.x + retry.w / 2, retry.y + retry.h + 16);
      }
    }
    if (r.saveOk === false) {
      ctx.font = '600 13px ' + FONT;
      ctx.fillStyle = C.gateNeg;
      ctx.fillText('기록 저장 안 됨', W / 2, H - 22);
    }
  }

  function drawScene(view) {
    const run = view.run, fx = view.fx, now = view.now;
    const mask = lotteryMask(run, fx);
    //  가려진 동안에는 실제 물체를 아예 그리지 않는다('?' 상자가 그 자리를 대신한다)
    const hidden = (id) => mask >= 1 && id != null && run.lottery && (run.lottery.supplyId === id || run.lottery.rowId === id);
    //  아레나(r3.17): 광장 단계면 배경에 { w, depth, k } — k = 열림 정도(셸 fx.arenaOpen 이 줄어들며 0 → 1, fx 에 칸이 없으면 1)
    const arena = run.phase === 'arena' && run.arena
      ? { w: run.arena.w, depth: run.arena.depth, k: 1 - Math.max(0, Math.min(1, (fx.arenaOpen ?? 0) / (FX.arenaOpenSec || 0.6))) }
      : null;
    //  원근(r3.20): 세계 그리기(배경~연출)는 전부 P(draw 가 view.flat/zoom 으로 골라 둔 투영기)를 지난다. 캔버스 변환(translate/scale)은 쓰지 않는다 —
    //   HUD·배너·버튼은 종전대로 마지막에 화면 좌표로. 그리기 순서(가림)는 r3.19 와 같다
    drawBackground(run.z, Math.max(0, (run.bg || 1) - 1), arena);
    drawWalls(run);
    drawCovers(run);
    for (const row of run.gateRows) if (!hidden(row.id)) drawGateRow(row, fx, run.z);
    for (const s of run.supplies) if (!hidden(s.id)) drawSupply(s, run.z);
    drawLotteryBox(run, mask);
    drawBonusTargets(run);
    drawCorpses(fx, run.z);
    for (const e of run.enemies) if (!e.dead) drawEnemy(e, run, fx);
    //  보스(r3.16 복수 정예): 살아 있는 것만, 먼 것(z 큰 것)을 먼저 그려 가까운 것이 위에 오게. 죽은 보스는 배열에 남아 있으므로 반드시 거른다
    const shockR = run.arena && run.arena.boss && run.arena.boss.shock ? run.arena.boss.shock.r : null;
    for (const b of (run.bosses ?? []).filter((b) => !b.dead).sort((a, b) => b.z - a.z)) drawBoss(b, run.z, now, shockR, fx);
    drawBullets(run);
    drawEshots(run);
    drawSquad(run, fx, now);
    drawRecruits(fx.recruits);
    drawShocks(fx.shocks ?? []);
    drawParts(fx.parts);
    drawFloaters(fx.floaters);
    drawPops(fx.pops);
    if (fx.hurtT > 0) {
      const a = Math.min(0.45, fx.hurtT / FX.hurtFlashDur * 0.45);
      const gr = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 470);
      gr.addColorStop(0, 'rgba(255,40,40,0)');
      gr.addColorStop(1, 'rgba(255,40,40,' + a + ')');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
    drawHud(view);
    drawBanners(fx);
  }

  function draw(view) {
    const fx = view.fx;
    //  이번 프레임의 투영기: ?flat=1(개발 대조) > 가까이 토글(view.zoom) > 표준. 타이틀 배경도 같은 투영으로 그린다
    P = projectorFor(projectorMode({ flat: !!view.flat, zoom: !!view.zoom }));
    const shaking = view.state === 'run' && fx && fx.shakeT > 0;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (shaking) {
      const a = FX.shakeAmp * (fx.shakeT / FX.shakeDur);
      ctx.translate(Math.sin(view.now * 71) * a, Math.cos(view.now * 89) * a * 0.7);
    }
    if (view.state === 'title') {
      drawTitle(view);
    } else if (view.run) {
      drawScene(view);
      if (view.state === 'paused') {
        ctx.fillStyle = 'rgba(5,8,14,0.62)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px ' + FONT;
        ctx.fillStyle = C.hero;
        ctx.fillText('일시 정지', W / 2, 300);
        ctx.font = '14px ' + FONT;
        ctx.fillStyle = 'rgba(243,241,232,0.7)';
        ctx.fillText('ESC 키로도 다시 시작할 수 있다', W / 2, 336);
      } else if (view.state === 'result') {
        drawResult(view);
      }
    }
    drawButtons(view.buttons ?? []);
    ctx.restore();
  }

  return { draw };
}
