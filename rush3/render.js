// rush3/render.js — 캔버스 그리기 전담(계약서 6장). 게임 판단은 하지 않고 view 를 그대로 그린다.
//  헬퍼(drawImgCentered/shadow/roundRect/drawParts/drawFloaters/drawButtons/흔들림/비네트/일시정지/적 폴백/적탄)는
//  rush/render.js 에서 복제. 게이트·보급·부대·벽·HUD·결과·타이틀은 신규. 시계는 view.now 만 쓴다.
//  화면 y = LINE_Y - (z - run.z). z 가 클수록 앞(화면 위).
import { BAL3 } from './balance.js';
import { WEAPONS } from './weapons.js';
import { gateColor, gateLabel } from './gates.js';

const W = BAL3.view.w, H = BAL3.view.h, LINE_Y = BAL3.view.LINE_Y;
const ROAD0 = BAL3.road.x0, ROAD1 = BAL3.road.x1;
const C = BAL3.colors;
const FX = BAL3.fx;
const FONT = 'system-ui, sans-serif';
const ENEMY_FALLBACK = C.enemy;
const ENEMY_SPRITE = { grunt: 'e_grunt', rusher: 'e_rusher', shooter: 'e_shooter' };
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
export const HUD_ROW = Object.freeze({
  top: HUD_TOP, h: HUD_H, r: HUD_R, fs: HUD_FS, gap: HUD_GAP, right: HUD_RIGHT,
  cy: HUD_TOP + HUD_H / 2,
  //  왼쪽 두 줄: 제목은 세 칩과 같은 중심선, 남은 거리는 그 아래 한 줄
  left: 16, titleFs: 20, distFs: 15, distCy: HUD_TOP + HUD_H / 2 + 28,
  box: Object.freeze({ diff: HUD_DIFF, weapon: HUD_WEAPON, pause: HUD_PAUSE }),
});

export function createRenderer3(ctx, sprites) {
  const get = (k) => (sprites && typeof sprites.get === 'function' ? sprites.get(k) : null);
  //  동작 시트(sprites.sheet(key) → { img, cols, frames, fw, fh, fps, loop, refH } 또는 null → 정지 그림/폴백)
  const sheet = (k) => (sprites && typeof sprites.sheet === 'function' ? sprites.sheet(k) : null);
  //  시트의 한 칸을 (x, y) 중심에 그린다. bodyH = 몸통 높이(px). 배율은 칸 높이가 아니라 refH 기준 —
  //  칸이 큰 시트(사격 섬광·사망 파편)와 작은 시트 사이에서 몸 크기가 같게 보인다
  function drawSheetFrame(sh, frame, x, y, bodyH) {
    const f = Math.max(0, Math.min(sh.frames - 1, Math.floor(frame)));
    const sx = (f % sh.cols) * sh.fw, sy0 = Math.floor(f / sh.cols) * sh.fh;
    const k = bodyH / sh.refH, dw = sh.fw * k, dh = sh.fh * k;
    ctx.drawImage(sh.img, sx, sy0, sh.fw, sh.fh, x - dw / 2, y - dh / 2, dw, dh);
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
  function outlinedText(text, x, y, px, color, weight = 'bold', lw = 5) {
    ctx.font = weight + ' ' + px + 'px ' + FONT;
    ctx.lineWidth = lw;
    ctx.strokeStyle = C.outline;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  //  배경: BG 타일(있으면) + 도로 80~400 + 차선. 도로와 물체는 같은 속도로 흐른다(세계 고정)
  function drawBackground(scroll, stageIdx) {
    const pal = C.bg[stageIdx] ?? C.bg[0];
    const im = get('bg' + (stageIdx + 1));
    if (im) {
      const h = Math.round(im.height * (W / im.width));
      const off = ((scroll % h) + h) % h;
      for (let y = off - h; y < H; y += h) ctx.drawImage(im, 0, y, W, h);
      //  그림 위에 v3 도로 폭(80~400)을 얹는다 — 게이트·벽과 같은 폭
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = pal.road;
      ctx.fillRect(ROAD0, 0, ROAD1 - ROAD0, H);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = pal.side;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = pal.road;
      ctx.fillRect(ROAD0, 0, ROAD1 - ROAD0, H);
    }
    //  차선 2줄(대시 스크롤) + 도로 경계
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 22]);
    ctx.lineDashOffset = -(((scroll % 40) + 40) % 40);
    for (const x of [ROAD0 + (ROAD1 - ROAD0) / 3, ROAD0 + (ROAD1 - ROAD0) * 2 / 3]) {
      ctx.beginPath(); ctx.moveTo(x, -40); ctx.lineTo(x, H + 40); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(20,35,58,0.35)';
    ctx.lineWidth = 4;
    for (const x of [ROAD0, ROAD1]) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  //  벽: 도로 위 회색 분리대(상단 하이라이트)
  function drawWalls(run, sy) {
    for (const w of run.walls) {
      const yTop = sy(w.z1), yBot = sy(w.z0);
      if (yBot < -10 || yTop > H + 10) continue;
      const y0 = Math.max(-10, yTop), y1 = Math.min(H + 10, yBot);
      ctx.fillStyle = 'rgba(20,25,35,0.25)';
      ctx.fillRect(w.x0 - 3, y0 + 4, w.x1 - w.x0 + 6, y1 - y0);
      ctx.fillStyle = C.wall;
      ctx.fillRect(w.x0, y0, w.x1 - w.x0, y1 - y0);
      ctx.fillStyle = C.wallTop;
      ctx.fillRect(w.x0 + 3, y0, w.x1 - w.x0 - 6, y1 - y0);
      //  분리대 줄무늬
      ctx.fillStyle = 'rgba(20,35,58,0.35)';
      for (let y = y0 + 12; y < y1; y += 36) ctx.fillRect(w.x0 + 3, y, w.x1 - w.x0 - 6, 6);
      //  통로 안내 표지: 벽 앞머리(z0)에 좌·우 통로 내용물. 확정선(z0-60)까지 700px = 3.7초의 판단 시간을 준다
      if (w.signs) {
        const sYbot = sy(w.z0);
        if (sYbot > -40 && sYbot < H + 40) {
          drawSign(w.signs.L, (ROAD0 + w.x0) / 2, sYbot + 26);
          drawSign(w.signs.R, (w.x1 + ROAD1) / 2, sYbot + 26);
        }
        //  통로 확정선(여기서 통로가 정해진다) — 벽과 같은 회색 실선
        const cy = sy(w.z0 - BAL3.squad.wallLead);
        if (cy > -10 && cy < H + 10) {
          ctx.strokeStyle = 'rgba(154,161,172,0.75)';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(ROAD0, cy); ctx.lineTo(ROAD1, cy); ctx.stroke();
        }
      }
    }
  }

  //  통로 안내 표지 1개(아이콘 + 숫자). kind 'none' = 빈 통로
  function drawSign(sg, x, y) {
    if (!sg) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(16,22,31,0.72)';
    roundRect(x - 44, y - 20, 88, 40, 8);
    ctx.fill();
    if (sg.kind === 'soldier') {
      ctx.fillStyle = C.soldier;
      for (let i = 0; i < 3; i++) {
        const px = x - 28 + i * 11;
        ctx.beginPath(); ctx.arc(px, y - 8, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(px - 3, y - 4, 6, 9);
      }
      outlinedText('+' + (sg.n ?? 0), x + 16, y, 20, C.supplyBody, 'bold', 4);
    } else if (sg.kind === 'weapon') {
      const wp = WEAPONS[sg.weapon] ?? WEAPONS.rifle;
      ctx.fillStyle = wp.color;
      roundRect(x - 34, y - 6, 28, 9, 3); ctx.fill();
      outlinedText(wp.name, x + 12, y, 16, wp.color, 'bold', 4);
    } else if (sg.kind === 'chain') {
      ctx.fillStyle = C.chainPad;
      roundRect(x - 34, y - 10, 22, 18, 4); ctx.fill();
      outlinedText('증원', x + 10, y, 16, C.chainPad, 'bold', 4);
    } else if (sg.kind === 'lottery') {
      //  랜덤 길: 무엇이 걸릴지 모른다는 표시. 확정선을 지나야 실제 물체가 드러난다(계약서 3-9)
      outlinedText('?', x - 22, y, 26, C.gold, 'bold', 5);
      outlinedText('랜덤', x + 16, y, 17, C.gold, 'bold', 4);
    } else {
      outlinedText('빈 길', x, y, 17, C.gateZero, 'bold', 4);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  잠김 표시(계약서 6장 N2-②): 숫자를 가리지 않는 칸 모서리의 작은 자물쇠. 색만으로 구분하지 않기 위한 형태 신호다.
  //  scale 을 주면 같은 모양을 그 배율로 키워 그린다(함정 칸의 큰 자물쇠 — 2026-09-17 이사 결정 ③).
  function drawLockBadge(x, y, scale = 1) {
    ctx.save();
    if (scale !== 1) { ctx.translate(x, y); ctx.scale(scale, scale); x = 0; y = 0; }
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

  //  함정 칸의 붉은 봉쇄 바: 칸 폭을 가로지르는 굵은 붉은 바 + 대각 줄무늬. 숫자보다 **먼저** 그려 숫자를 가리지 않는다.
  //  ⚠️셔터(회색 빗금)와 달리 걷히지 않는다 — 통과한 뒤에도 행 기본 불투명도(0.32)로 흐리게 남아 '여기서 잃었다'가 화면에 남는다
  function drawTrapBar(c, y) {
    const x0 = c.x0 + 3, w = c.x1 - c.x0 - 6;
    const bh = 30, by = y - bh / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, by, w, bh);
    ctx.clip();
    ctx.fillStyle = 'rgba(122,26,34,0.92)';
    ctx.fillRect(x0, by, w, bh);
    ctx.strokeStyle = 'rgba(255,106,61,0.85)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let k = -bh; k < w + bh; k += 18) {
      ctx.moveTo(x0 + k, by + bh);
      ctx.lineTo(x0 + k + bh, by);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = C.warn;
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, by, w, bh);
  }

  //  함정 배지('쏴도 안 줄어듦'): 칸 **위**에 표지판처럼 띄운다.
  //  ⚠️옆 차선에 두면 반대편 통로의 보급 통·벽에 가려진다(2026-09-17 렌더 실측 — 왼쪽 통이 배지를 덮었다).
  //   칸 위 짧은 글(y-vis/2-34 부터 26px)보다 더 위에 두어 둘이 겹치지 않게 한다
  function drawTrapBadge(row, y, vis) {
    const cells = row.cells;
    const x0 = cells[0].x0, x1 = cells[cells.length - 1].x1;
    const bw = 118, bh = 24;
    const bx = (x0 + x1) / 2;
    const by = Math.max(TIP_MIN_Y + 40, y - vis / 2 - 48);
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
  //  셔터(armZ): 아직 안 열린 행은 회색 빗금 판을 덮되 **숫자·부호는 판 위에 선명하게** 그리고(2026-09-17 검수 N2-①),
  //   잠김은 칸 모서리의 작은 자물쇠로 따로 알린다(N2-②). 열리는 순간(fx.gateOpen)에는 판이 위로 걷힌다.
  //  ⚠️함정 행(isTrapGateRow)은 셔터 표현을 **하나도** 쓰지 않는다 — 개시선·회색 빗금·작은 자물쇠·닫힘 안내를 전부 건너뛴다.
  //   '가까워지면 열림'을 배운 사람에게 열려도 안 오르는 칸을 셔터 모양으로 보여주면 규칙을 두 번 가르치는 셈이다.
  //   대신 붉은 봉쇄 바 + 큰 자물쇠 + 배지로 '사격이 안 먹히는 장치'를 즉시 알린다(2026-09-17 이사 결정 ③ 함정 외형 A).
  //   ⚠️armZ·armed 규칙 자체는 건드리지 않는다 — 바뀌는 것은 그리기뿐이다.
  function drawGateRow(row, sy, fx, runZ) {
    const y = sy(row.z);
    if (y < -60 || y > H + 60) return;
    const vis = 58;
    const trap = isTrapGateRow(row);
    const flashMap = fx && fx.gateFlash ? fx.gateFlash : null;
    //  0 = 완전히 닫힘 · 1 = 완전히 열림
    const openLeft = fx && fx.gateOpen ? (fx.gateOpen[row.id] ?? 0) : 0;
    const openT = BAL3.gate.openT || 0.25;
    const shut = trap || row.passed ? 0 : row.armed ? (openLeft > 0 ? openLeft / openT : 0) : 1;
    //  사격 개시선: 아직 닫힌 행이면 도로 위 run.z + armZ 위치에 점선 1줄("여기서부터 쏠 수 있다")
    if (!trap && !row.armed && !row.passed && row.armZ != null && runZ != null) {
      const ay = LINE_Y - row.armZ;
      if (ay > -10 && ay < H + 10) {
        ctx.save();
        ctx.strokeStyle = gateColor(row.cells[0] ? row.cells[0].value : 0);
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(ROAD0, ay); ctx.lineTo(ROAD1, ay); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        //  선 옆 작은 글(N2-⑤). ⚠️주체는 게이트다 — "플레이어가 선을 넘는다"로 읽히면 통로 확정선과 헷갈린다
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 0.92;
        outlinedText(ARM_LINE_TEXT, ROAD0 + 6, ay - 7, 12, C.hud, '600', 3);
        ctx.restore();
      }
    }
    const base = row.passed ? 0.32 : 0.92;
    ctx.globalAlpha = base;
    for (const c of row.cells) {
      const col = gateColor(c.value);
      const left = flashMap ? (flashMap[row.id + ':' + c.idx] ?? 0) : 0;
      const flash = left > 0 ? Math.min(1, left / BAL3.gate.flashT) : 0;
      ctx.fillStyle = flash > 0 ? 'rgba(255,255,255,' + (0.35 + flash * 0.5) + ')' : 'rgba(16,22,31,0.66)';
      roundRect(c.x0 + 3, y - vis / 2, c.x1 - c.x0 - 6, vis, 10);
      ctx.fill();
      ctx.strokeStyle = trap ? C.warn : col;
      ctx.lineWidth = 4;
      roundRect(c.x0 + 3, y - vis / 2, c.x1 - c.x0 - 6, vis, 10);
      ctx.stroke();
      const cx = (c.x0 + c.x1) / 2;
      //  함정 칸: 붉은 봉쇄 바(숫자 아래). 셔터 판은 그리지 않는다
      if (trap) drawTrapBar(c, y);
      //  셔터 판(회색 빗금) — 숫자보다 **먼저** 그린다. 열리는 동안 남은 판이 위쪽으로 줄어든다(문이 위로 걷히는 동작)
      if (shut > 0) {
        const hh = vis * shut;
        ctx.save();
        ctx.beginPath();
        ctx.rect(c.x0 + 3, y - vis / 2, c.x1 - c.x0 - 6, hh);
        ctx.clip();
        ctx.fillStyle = 'rgba(120,128,140,0.82)';
        ctx.fillRect(c.x0 + 3, y - vis / 2, c.x1 - c.x0 - 6, vis);
        ctx.strokeStyle = 'rgba(30,38,50,0.55)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let k = -vis; k < c.x1 - c.x0 + vis; k += 12) {
          ctx.moveTo(c.x0 + 3 + k, y + vis / 2);
          ctx.lineTo(c.x0 + 3 + k + vis, y - vis / 2);
        }
        ctx.stroke();
        ctx.restore();
      }
      //  숫자: 피격 직후 살짝 튄다. **셔터·봉쇄 바 위에 같은 불투명도로** 그린다(가려도 무엇이 걸린 판인지 그대로 읽힌다)
      const px = 38 + Math.round(flash * 8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = base;
      outlinedText(gateLabel(c.value), cx, y, px, flash > 0.5 ? C.gateFlash : col, 'bold', 6);
      //  확정 손실 칸(상한이 자기 값 = 쏴도 오르지 않는다, 랜덤 길 ⑤): 칸 아래에 '확정' 꼬리표를 붙여 '안 먹히는 이유'를 화면에 남긴다
      //  ⚠️숫자와 겹치지 않게 칸 **바깥**(아래)에 그린다 — 숫자가 38px 라 칸 안에서는 밑줄이 물린다
      if (c.value < 0 && c.maxValue != null && c.maxValue <= c.value) {
        outlinedText('확정', cx, y + vis / 2 + 13, 16, col, 'bold', 4);
      }
      ctx.textBaseline = 'alphabetic';
      //  자물쇠: 함정 칸은 **크게**(봉쇄 장치의 일부) · 닫힌 셔터 칸은 왼쪽 위 모서리에 작게(숫자 자리를 비켜 간다).
      //  ⚠️셔터가 걷히는 중(armed 직후)에는 이미 잠김이 풀렸으므로 그리지 않는다 — 셔터 판만 남아 걷힌다
      if (trap) drawLockBadge(c.x0 + 20, y, 1.4);
      else if (!row.armed && !row.passed) drawLockBadge(c.x0 + 20, y - vis / 2 + 15);
      ctx.globalAlpha = base;
    }
    //  함정 배지는 아직 안 지난 행에만(지난 뒤에는 봉쇄 바만 흐리게 남는다)
    if (trap && !row.passed) drawTrapBadge(row, y, vis);
    //  짧은 안내 글(N2-③): 닫힌 동안 '가까워지면 열림' · 처음 열릴 때 '지금 쏘면 +1'. 각 BAL3.fx.gateTipSec 초, 칸 위
    //  ⚠️함정 행이 아직 안 열렸을 때는 셸이 무엇을 넣어 두었든 그리지 않는다 — '가까워지면 열림'은 이 행에 맞지 않는 약속이다
    const tip = fx && fx.gateTip ? fx.gateTip[row.id] : null;
    if (tip && tip.t > 0 && !(trap && !row.armed)) {
      const tipSec = BAL3.fx.gateTipSec || 1.2;
      const rx = (row.cells[0].x0 + row.cells[row.cells.length - 1].x1) / 2;
      //  ⚠️행이 화면 위쪽 끝에서 들어올 때는 칸 위가 화면 밖이다 — 그 동안에는 HUD 아래(y 96)에 붙여 두고,
      //   행이 내려오면 자연스럽게 칸 위로 따라 붙는다. 안 그러면 1.2초 내내 화면 밖에 그려진다(2026-09-17 렌더 실측).
      const top = Math.max(TIP_MIN_Y, y - vis / 2 - 34);
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

  //  보급 통 내용물: 병사 실루엣 n / 무기 아이콘 / 파란 설비
  function drawSupplyContents(s, x, y) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s.kind === 'soldier') {
      const n = s.payload.n ?? 0;
      const show = Math.min(n, 6);
      for (let i = 0; i < show; i++) {
        const px = x + (i - (show - 1) / 2) * 9, py = y - 6;
        ctx.fillStyle = C.soldier;
        ctx.beginPath();
        ctx.arc(px, py - 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(px - 3, py - 1, 6, 8);
      }
      outlinedText('+' + n, x, y + 16, 18, C.supplyBody, 'bold', 4);
    } else if (s.kind === 'weapon') {
      const w = WEAPONS[s.payload.weapon] ?? WEAPONS.rifle;
      ctx.fillStyle = w.color;
      roundRect(x - 16, y - 12, 32, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x - 12, y - 10, 8, 6);
      outlinedText(w.name, x, y + 14, 15, w.color, 'bold', 4);
    } else {
      ctx.fillStyle = C.chainPad;
      roundRect(x - 14, y - 14, 28, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x - 9, y - 9, 18, 3);
      ctx.fillRect(x - 9, y - 3, 18, 3);
      outlinedText('증원 설비', x, y + 16, 13, C.chainPad, 'bold', 4);
    }
    ctx.textBaseline = 'alphabetic';
  }

  //  보급 통: 그림 + 내용물 + 남은 내구 숫자(병력 수가 아니다). chain 발판 열은 '+1'
  function drawSupply(s, sy, runZ) {
    //  발판(통보다 앞 z = 화면 위쪽)
    for (const p of s.pads) {
      const py = sy(p.z);
      if (py < -30 || py > H + 30) continue;
      ctx.globalAlpha = p.taken ? 0.25 : 0.85;
      ctx.fillStyle = C.chainPad;
      roundRect(p.x - 34, py - 12, 68, 24, 8);
      ctx.fill();
      if (!p.taken) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        outlinedText('+1', p.x, py, 18, '#FFFFFF', 'bold', 4);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.globalAlpha = 1;
    }
    if (s.opened && s.kind !== 'chain') return;
    const y = sy(s.z);
    if (y < -60 || y > H + 60) return;
    const r = s.r;
    //  차폐(coverZ): 통로가 정해지고 잠시 뒤에 걷힌다. 걷히기 전에는 통 위에 회색 막이 덮여 있다
    const covered = s.coverZ != null && runZ != null && runZ < s.coverZ;
    //  skipped = 구조적으로 얻을 수 없던 대안. '밀려나며 사라지는' missed 연출과 달리 흐려지며 뒤로 빠진다
    ctx.globalAlpha = s.skipped ? 0.22 : s.missed ? 0.35 : 1;
    shadow(s.x, y + r * 0.95, r * 0.9);
    drawImgCentered('supply', s.x, y, r * 2.1, () => {
      ctx.fillStyle = C.supplyDark;
      roundRect(s.x - r, y - r * 0.8, r * 2, r * 1.6, 8); ctx.fill();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 4;
      roundRect(s.x - r, y - r * 0.8, r * 2, r * 1.6, 8); ctx.stroke();
    });
    if (!s.opened) drawSupplyContents(s, s.x, y);
    //  남은 내구 숫자(주황) — 내용물과 구분되는 위치(통 아래)
    ctx.textAlign = 'center';
    if (!s.opened) outlinedText(String(Math.max(0, Math.ceil(s.durability))), s.x, y + r + 18, 16, C.bulletHeavy, 'bold', 4);
    else if (!s.locked) outlinedText('쏘면 +1', s.x, y + r + 18, 13, C.chainPad, 'bold', 4);
    if (covered && !s.opened) {
      //  차폐 막 + 개방선(도로 위 가로선). 확정선(벽 회색 실선)과 다른 색으로 그려 '확정 뒤에도 잠깐 못 쏘는 이유'를 남긴다
      ctx.fillStyle = 'rgba(120,128,140,0.55)';
      roundRect(s.x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4, 8);
      ctx.fill();
      const oy = LINE_Y - (s.coverZ - runZ);
      if (oy > -10 && oy < H + 10) {
        ctx.save();
        ctx.strokeStyle = C.chainPad;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(ROAD0, oy); ctx.lineTo(ROAD1, oy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  //  적: 스프라이트 폴백(상자/원/마름모) + HP 태그. 저격 예고선은 부대 쪽으로
  function drawEnemy(e, run, sy, fx) {
    const y = sy(e.z);
    if (y < -80 || y > H + 80) return;
    if (e.kind === 'shooter' && e.aimT > 0) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = C.eshot; ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(e.x, y); ctx.lineTo(run.x, LINE_Y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    const h = e.r * 2.4;
    shadow(e.x, y + h * 0.4, e.r * 0.95);
    //  피격 중인 잡졸(셸 fx.enemyHit[id] 남은 초)은 피격 시트를 한 번 재생한다
    const hitLeft = fx && fx.enemyHit ? (fx.enemyHit[e.id] ?? 0) : 0;
    const hitSh = e.kind === 'grunt' && hitLeft > 0 ? sheet('e_grunt_hit') : null;
    if (hitSh) drawSheetFrame(hitSh, sheetFrameAt(hitSh, hitSh.frames / hitSh.fps - hitLeft), e.x, y, h);
    else drawImgCentered(ENEMY_SPRITE[e.kind], e.x, y, h, () => {
      ctx.fillStyle = ENEMY_FALLBACK[e.kind] ?? '#B3402F';
      if (e.kind === 'shooter') {
        ctx.fillRect(e.x - e.r * 1.1, y - e.r, e.r * 2.2, e.r * 2);
        ctx.strokeStyle = C.warn; ctx.lineWidth = 3;
        ctx.strokeRect(e.x - e.r * 1.1, y - e.r, e.r * 2.2, e.r * 2);
      } else if (e.kind === 'rusher') {
        ctx.beginPath(); ctx.arc(e.x, y, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.warn; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, y, e.r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(e.x, y - e.r);
        ctx.lineTo(e.x + e.r, y);
        ctx.lineTo(e.x, y + e.r);
        ctx.lineTo(e.x - e.r, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = C.eshot;
      ctx.beginPath(); ctx.arc(e.x, y, Math.max(3, e.r * 0.28), 0, Math.PI * 2); ctx.fill();
    });
    //  HP 태그: 잡졸은 다쳤을 때만, 나머지는 항상. 기준 hp 는 그 판의 난이도 표(run.enemyDefs)
    const base = run.enemyDefs?.[e.kind]?.hp ?? BAL3.enemies[e.kind]?.hp ?? 0;
    if (e.kind !== 'grunt' || e.hp < base) drawHpTag(e.x, y + e.r + 16, e.hp);
  }

  //  쓰러진 잡졸(셸 fx.corpses — 규칙의 enemies 에는 이미 없다): 사망 시트를 한 번 재생하고 corpseLingerSec 머문 뒤 흐려진다
  function drawCorpses(fx, sy) {
    const list = fx && fx.corpses;
    if (!list || !list.length) return;
    const sh = sheet('e_grunt_death');
    if (!sh) return;
    const total = sh.frames / sh.fps + FX.corpseLingerSec;
    for (const c of list) {
      const y = sy(c.z);
      if (y < -80 || y > H + 80) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, (total - c.t) / FX.corpseFadeSec));
      drawSheetFrame(sh, sheetFrameAt(sh, c.t), c.x, y, c.h);
    }
    ctx.globalAlpha = 1;
  }

  function drawHpTag(x, y, hp) {
    ctx.textAlign = 'center';
    outlinedText(String(Math.max(0, Math.ceil(hp))), x, y, 16, C.bulletHeavy, 'bold', 4);
  }

  //  정예: 스프라이트(폴백 원) + 발밑 HP 숫자. 막대는 HUD 에서
  function drawBoss(b, sy, now) {
    const y = sy(b.z);
    shadow(b.x, y + b.r * 1.05, b.r * 1.15);
    drawImgCentered('elite', b.x, y, b.r * 2.6, () => {
      ctx.fillStyle = ENEMY_FALLBACK.elite;
      ctx.beginPath(); ctx.arc(b.x, y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.warn; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(b.x, y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.eshot;
      ctx.beginPath(); ctx.arc(b.x, y, b.r * 0.35, 0, Math.PI * 2); ctx.fill();
    });
    if (b.state === 'descend') {
      ctx.globalAlpha = 0.5 + Math.sin(now * 12) * 0.3;
      ctx.strokeStyle = C.warn; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, y, b.r + 10, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawHpTag(b.x, y + b.r + 20, b.hp);
  }

  //  부대: 실제 units 배열 — 히어로(units[0], M01) + 병사(SOLDIER). 그림자·행진 바운스·발밑 병력 수·중심 마커
  function drawSquad(run, fx, now) {
    const S = BAL3.squad;
    const units = run.units;
    if (!units.length) return;
    const order = units.map((u, i) => ({ u, i })).sort((a, b) => a.u.dy - b.u.dy || a.i - b.i);
    let maxDy = 0;
    for (const u of units) if (u.dy > maxDy) maxDy = u.dy;
    for (const { u, i } of order) {
      const hero = i === 0;
      const size = hero ? S.heroSize : S.soldierSize;
      shadow(run.x + u.dx, LINE_Y + u.dy + size * 0.42, size * 0.42);
    }
    for (const { u, i } of order) {
      const hero = i === 0;
      const size = hero ? S.heroSize : S.soldierSize;
      const phase = now * 9 + i * 1.7;
      const bob = hero ? Math.sin(now * 9) * 2 : Math.sin(phase) * 1.6;
      const sway = hero ? Math.sin(now * 4.5) * 0.8 : Math.sin(phase * 0.5 + i) * 1.1;
      const px = run.x + u.dx + sway, py = LINE_Y + u.dy + bob;
      const hurt = u.hp < S.unitHp;
      //  히어로 동작 시트: 사격 중(fx.heroFire 남은 초)이면 사격 시트, 아니면 걷기 루프(now 기준). 시트가 없으면 정지 그림
      const firing = !!(fx && fx.heroFire > 0);
      const heroSh = hero ? (firing ? sheet('m1_fire') : sheet('m1_walk')) : null;
      if (heroSh) drawSheetFrame(heroSh, sheetFrameAt(heroSh, firing ? heroSh.frames / heroSh.fps - fx.heroFire : now), px, py, size);
      else drawImgCentered(hero ? 'm1' : 'soldier', px, py, size, () => {
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
        ctx.beginPath(); ctx.arc(px, py - size / 2 - 4, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    //  부대 중심 마커(삼각) — 게이트 칸 판정 기준
    const my = LINE_Y - S.heroSize / 2 - 14;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(run.x, my - 8);
    ctx.lineTo(run.x - 6, my + 2);
    ctx.lineTo(run.x + 6, my + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(run.x, my - 10); ctx.lineTo(run.x, my - 120); ctx.stroke();
    ctx.setLineDash([]);
    //  발밑 병력 수(피격 중 빨강)
    ctx.textAlign = 'center';
    outlinedText(String(units.length), run.x, LINE_Y + maxDy + 34, 26, fx.hurtT > 0 ? C.heroHurt : C.hero, 'bold', 6);
  }

  //  아군 탄: 무기별 색·폭
  function drawBullets(run, sy) {
    for (const b of run.bullets) {
      if (b.dead) continue;
      const y = sy(b.z);
      if (y < -20 || y > H + 20) continue;
      const w = WEAPONS[b.kind] ?? WEAPONS.rifle;
      const len = 10 + w.w * 1.5;
      ctx.fillStyle = w.color;
      ctx.fillRect(b.x - w.w / 2, y - len, w.w, len);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(b.x - w.w / 6, y - len + 2, w.w / 3, len * 0.5);
    }
  }

  //  적탄: 마젠타 구슬 + 흰 테(기존 램프탄 복제)
  function drawEshots(run, sy) {
    for (const s of run.eshots) {
      if (s.dead) continue;
      const y = sy(s.z);
      if (y < -20 || y > H + 20) continue;
      ctx.fillStyle = C.eshot;
      ctx.beginPath(); ctx.arc(s.x, y, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, y, 5.5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawParts(parts) {
    for (const p of parts) {
      const k = 1 - p.t / p.life;
      if (p.flash) {
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = p.big ? '#FFD9A0' : '#FFE9C8';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color ?? (p.big ? C.bulletHeavy : C.gateNeg);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k + 1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters(floaters) {
    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
      outlinedText(f.text, f.x, f.y, f.big ? 34 : 22, f.color, 'bold', 5);
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
    outlinedText('STAGE ' + run.stageId + '  ' + run.title, HUD_ROW.left, cy, HUD_ROW.titleFs, C.hud, '900', 6);
    const goal = run.boss ? '정예 전투!' : (run.bossDefeated ? '작전 완료' : '남은 거리 ' + hud.distM + 'm');
    outlinedText(goal, HUD_ROW.left, HUD_ROW.distCy, HUD_ROW.distFs, run.boss ? C.gateNeg : C.hero, 'bold', 5);
    //  무기 칩
    const wb = HUD_ROW.box.weapon;
    const w = WEAPONS[run.weapon] ?? WEAPONS.rifle;
    hudChip(wb);
    ctx.fillStyle = w.color;
    roundRect(wb.x + 12, cy - 5, 26, 10, 3);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(wb.x + 16, cy - 3, 7, 6);
    ctx.font = 'bold ' + HUD_ROW.fs + 'px ' + FONT;
    ctx.fillStyle = w.color;
    ctx.fillText(w.name, wb.x + 48, cy);
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
    //  정예 HP 막대
    if (run.boss) {
      ctx.fillStyle = 'rgba(20,35,58,0.85)';
      roundRect(90, 76, 300, 16, 8); ctx.fill();
      ctx.fillStyle = C.eshot;
      roundRect(90, 76, 300 * Math.max(0, run.boss.hp / run.boss.max), 16, 8); ctx.fill();
      ctx.textAlign = 'center';
      outlinedText('정예 ' + Math.max(0, Math.ceil(run.boss.hp)) + ' / ' + run.boss.max, W / 2, 111, 15, C.hud, 'bold', 4);
    }
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
    //  첫 셔터 조우 배너(N2-⑥): 셔터가 걸린 행이 처음 화면에 들어온 그 시점에 1회. 문구는 셸이 넘긴다
    if (fx.shutterT > 0 && fx.shutterText) {
      //  문구는 줄 배열로 받는다(한 줄로 쓰면 480px 화면에서 양끝이 잘린다 — 줄은 어절 경계에서만 나눈다)
      const lines = Array.isArray(fx.shutterText) ? fx.shutterText : [fx.shutterText];
      ctx.globalAlpha = Math.min(1, fx.shutterT / 0.5);
      ctx.fillStyle = 'rgba(20,35,58,0.86)';
      //  첫 플레이 안내(y 268)·정예 경고(y 196)와 겹치지 않는 자리
      const bh = 22 + lines.length * 24;
      roundRect(28, 332, W - 56, bh, 14); ctx.fill();
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = C.hud;
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, 332 + 23 + i * 24);
      ctx.globalAlpha = 1;
    }
    if (fx.eliteT > 0) {
      const k = fx.eliteT / FX.eliteBannerSec;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(194,39,59,0.85)';
      ctx.fillRect(0, 196, W, 56);
      ctx.font = '900 30px ' + FONT;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('정예 접근!', W / 2, 224);
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
        ctx.fillText(b.sub, cx, cy + 12);
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
    //  랜덤 길 한 줄(계약서 3-9): 고른 판은 결과, 안 고른 판은 이번 판에 무엇이었는지 공개
    if (r.lottery) {
      ctx.font = '700 14px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText(r.lottery, W / 2, 212);
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

  //  '?' 상자(가림 판). 회색 판 + 금색 물음표. 걷히는 동안 위로 줄어들며 사라진다
  function drawLotteryBox(run, sy, mask) {
    const lot = run.lottery;
    if (!lot || mask <= 0) return;
    const y = sy(lot.z);
    if (y < -70 || y > H + 70) return;
    const bw = 88, bh = 76;
    ctx.save();
    ctx.globalAlpha = mask;
    shadow(lot.x, y + bh * 0.46, 34);
    ctx.fillStyle = 'rgba(120,128,140,0.92)';
    roundRect(lot.x - bw / 2, y - bh / 2, bw, bh, 12);
    ctx.fill();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 4;
    roundRect(lot.x - bw / 2, y - bh / 2, bw, bh, 12);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlinedText('?', lot.x, y - 4, 44, C.gold, 'bold', 6);
    outlinedText('랜덤 길', lot.x, y + 26, 14, C.supplyBody, 'bold', 4);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function drawScene(view) {
    const run = view.run, fx = view.fx, now = view.now;
    const sy = (z) => LINE_Y - (z - run.z);
    const mask = lotteryMask(run, fx);
    //  가려진 동안에는 실제 물체를 아예 그리지 않는다('?' 상자가 그 자리를 대신한다)
    const hidden = (id) => mask >= 1 && id != null && run.lottery && (run.lottery.supplyId === id || run.lottery.rowId === id);
    drawBackground(run.z, Math.max(0, Math.min(2, run.stageId - 1)));
    drawWalls(run, sy);
    for (const row of run.gateRows) if (!hidden(row.id)) drawGateRow(row, sy, fx, run.z);
    for (const s of run.supplies) if (!hidden(s.id)) drawSupply(s, sy, run.z);
    drawLotteryBox(run, sy, mask);
    drawCorpses(fx, sy);
    for (const e of run.enemies) if (!e.dead) drawEnemy(e, run, sy, fx);
    if (run.boss && !run.boss.dead) drawBoss(run.boss, sy, now);
    drawBullets(run, sy);
    drawEshots(run, sy);
    drawSquad(run, fx, now);
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
