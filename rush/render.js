// rush/render.js — 캔버스 그리기 전담. 게임 판단은 하나도 하지 않는다(view 를 그대로 그림).
import { BAL } from './balance.js';
import { formation } from './squad.js';
import { gateColor } from './gates.js';

const W = 480, H = 800;
const TIER_FALLBACK = ['#F3F1E8', '#DFE6F5', '#C9E9FF', '#FFE9B8', '#FFD34D'];
const ENEMY_FALLBACK = {
  scrapbit: '#B3402F', wheeler: '#3A3A3A', ramhound: '#D14A20', signaler: '#2B2F36',
  wallguard: '#3A2C3F', cartyard: '#4A3B33', needleeye: '#2B2F36', manholejumper: '#5A5A5A',
  spawnpod: '#37262B', magnethead: '#7A1F2B',
};
//  구간별 폴백 배경 색조 — 밝은 외곽에서 어두운 공장으로. BG1~5 이미지가 오면 그림이 대신한다.
const ZONE_PAL = [
  { road: '#B7B1A2', side: '#857F6F', line: 'rgba(255,255,255,0.55)' },
  { road: '#A8A296', side: '#7A746A', line: 'rgba(255,255,255,0.5)' },
  { road: '#948F86', side: '#6A655D', line: 'rgba(255,255,255,0.42)' },
  { road: '#7E756B', side: '#5E5044', line: 'rgba(255,255,255,0.34)' },
  { road: '#464C56', side: '#31353C', line: 'rgba(255,255,255,0.26)' },
];

export function createRenderer(canvas, sprites) {
  const ctx = canvas.getContext('2d');

  function drawImgCentered(key, x, y, h, fallbackFn) {
    const im = sprites.get(key);
    if (im) {
      const w = h * (im.width / im.height);
      ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
    } else fallbackFn();
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

  function drawBackground(scroll, zone) {
    const im = sprites.get('bg' + (zone + 1));
    if (im) {                                         // 구간 배경 이미지: 세로 무한 타일
      const h = Math.round(im.height * (W / im.width));
      const off = ((scroll % h) + h) % h;
      for (let y = off - h; y < H; y += h) ctx.drawImage(im, 0, y, W, h);
      return;
    }
    const pal = ZONE_PAL[zone] ?? ZONE_PAL[0];        // 이미지가 없으면 구간 색조 폴백
    ctx.fillStyle = pal.side;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = pal.road;                         // 도로 중앙 밴드
    ctx.fillRect(30, 0, W - 60, H);
    ctx.strokeStyle = pal.line;                       // 차선 2줄(대시 스크롤)
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 22]);
    ctx.lineDashOffset = -(scroll % 40);
    for (const x of [170, 310]) {
      ctx.beginPath(); ctx.moveTo(x, -40); ctx.lineTo(x, H + 40); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(20,35,58,0.3)';           // 갓길 경계
    ctx.lineWidth = 4;
    for (const x of [32, W - 32]) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  function gateLabel(g) {
    const sym = { add: '+', mul: '×', sub: '−', div: '÷' }[g.op];
    return sym + g.value;
  }

  function drawGatePair(y, pair) {
    const g = BAL.gates;
    const boxes = [
      { x: W / 2 - g.gap / 2 - g.width, gate: pair.left },
      { x: W / 2 + g.gap / 2, gate: pair.right },
    ];
    for (const b of boxes) {
      const col = gateColor(b.gate.op);
      ctx.globalAlpha = 0.88;
      const im = sprites.get('gate');
      if (im) {
        //  그림 비율 유지(살짝 눌러 원근감), 왼쪽 게이트는 좌우 반전해 대칭 구도로
        const h = Math.round(g.width * (im.height / im.width) * 0.72);
        const mirror = b.x < W / 2;
        ctx.save();
        ctx.translate(b.x + g.width / 2, y);
        if (mirror) ctx.scale(-1, 1);
        ctx.drawImage(im, -g.width / 2, -h / 2, g.width, h);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(16,22,31,0.72)';
        roundRect(b.x, y - g.h / 2, g.width, g.h, 12);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        roundRect(b.x, y - g.h / 2, g.width, g.h, 12);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#14233A';
      ctx.strokeText(gateLabel(b.gate), b.x + g.width / 2, y);
      ctx.fillStyle = col;
      ctx.fillText(gateLabel(b.gate), b.x + g.width / 2, y);
    }
  }

  //  선두 1기 = 히어로(크게, 티어에 따라 진화) / 뒤따르는 병력 = 병사 스프라이트(작게)
  function drawSquad(squad) {
    const S = BAL.squad;
    const pts = formation(squad.count);
    for (let i = pts.length - 1; i >= 1; i--) {       // 병사들 — 뒷줄부터 그려 앞줄이 위에 오게
      const px = squad.x + pts[i].x, py = S.y + pts[i].y + 16;   // 히어로 뒤로 살짝 밀어 겹침 방지
      drawImgCentered('soldier', px, py, S.soldierSize, () => {
        ctx.fillStyle = '#DFE6F5';
        ctx.beginPath();
        ctx.moveTo(px, py - S.soldierSize / 2);
        ctx.lineTo(px - S.soldierSize / 3, py + S.soldierSize / 2);
        ctx.lineTo(px + S.soldierSize / 3, py + S.soldierSize / 2);
        ctx.closePath();
        ctx.fill();
      });
    }
    const hx = squad.x, hy = S.y;                     // 히어로(선두)
    drawImgCentered('m' + (squad.tier + 1), hx, hy, S.heroSize, () => {
      ctx.fillStyle = TIER_FALLBACK[squad.tier];
      ctx.beginPath();
      ctx.moveTo(hx, hy - S.heroSize / 2);
      ctx.lineTo(hx - S.heroSize / 3, hy + S.heroSize / 2);
      ctx.lineTo(hx + S.heroSize / 3, hy + S.heroSize / 2);
      ctx.closePath();
      ctx.fill();
    });
    if (squad.count > S.drawCap) {                    // 상한 초과분은 숫자 라벨이 담당
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#F3F1E8';
      ctx.fillText('x' + squad.count, squad.x, S.y - 34);
    }
  }

  const RECT_KINDS = new Set(['wallguard', 'cartyard', 'signaler']);
  const ROUND_KINDS = new Set(['wheeler', 'manholejumper', 'magnethead', 'spawnpod']);

  function drawEnemy(e) {
    const key = 'e_' + e.kind;
    const h = e.r * 2.4;
    drawImgCentered(key, e.x, e.y, h, () => {
      ctx.fillStyle = ENEMY_FALLBACK[e.kind] ?? '#B3402F';
      if (RECT_KINDS.has(e.kind)) {                   // 방벽·수레·신호등 = 상자
        const tall = e.kind === 'signaler' ? 1.4 : 0.8;
        ctx.fillRect(e.x - e.r * 1.2, e.y - e.r * tall, e.r * 2.4, e.r * tall * 2);
        ctx.strokeStyle = '#C2273B'; ctx.lineWidth = 3;
        ctx.strokeRect(e.x - e.r * 1.2, e.y - e.r * tall, e.r * 2.4, e.r * tall * 2);
      } else if (ROUND_KINDS.has(e.kind)) {           // 바퀴·맨홀·자석·고치 = 원
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#C2273B'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
      } else {                                        // 그 외 = 마름모
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - e.r);
        ctx.lineTo(e.x + e.r, e.y);
        ctx.lineTo(e.x, e.y + e.r);
        ctx.lineTo(e.x - e.r, e.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#FF3DA5';                      // 공통 마젠타 센서 점
      ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(3, e.r * 0.28), 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawBoss(boss) {
    drawImgCentered('b' + (boss.zone + 1), boss.x, boss.y, boss.r * 2.6, () => {
      ctx.fillStyle = '#2B1420';
      ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#C2273B'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#FF3DA5';
      ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r * 0.35, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = 'rgba(20,35,58,0.85)';            // 보스 HP 바
    roundRect(90, 24, 300, 14, 7); ctx.fill();
    ctx.fillStyle = '#FF3DA5';
    roundRect(90, 24, 300 * Math.max(0, boss.hp / boss.max), 14, 7); ctx.fill();
  }

  function drawHud(hud) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, sans-serif';     // ① 병력 수
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#14233A';
    ctx.strokeText(String(hud.count), W / 2, 84);
    ctx.fillStyle = hud.gold ? '#F6C84A' : '#F3F1E8';
    ctx.fillText(String(hud.count), W / 2, 84);
    ctx.fillStyle = 'rgba(20,35,58,0.8)';             // ② 진행 바
    roundRect(140, 104, 200, 10, 5); ctx.fill();
    ctx.fillStyle = '#35E5FF';
    roundRect(140, 104, 200 * Math.min(1, hud.progress), 10, 5); ctx.fill();
    ctx.font = 'bold 16px system-ui, sans-serif';     // ③ 보스 거리
    ctx.fillStyle = '#F3F1E8';
    ctx.fillText(hud.bossDist > 0 ? '▲ ' + hud.bossDist + 'm' : '▲ BOSS', W / 2, 136);
    if (hud.firstRunX2) {
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#F6C84A';
      ctx.fillText('오늘 첫 출격! 코인 2배', 44, 30);
    }
    if (hud.recordFlash > 0) {
      ctx.globalAlpha = Math.min(0.5, hud.recordFlash);
      const grad = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, 480);
      grad.addColorStop(0, 'rgba(246,200,74,0)');
      grad.addColorStop(1, 'rgba(246,200,74,0.9)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#F6C84A';
      ctx.fillText('신기록!', W / 2 + 92, 72);
    }
  }

  function drawButtons(buttons) {
    for (const b of buttons) {
      ctx.globalAlpha = b.disabled ? 0.4 : 1;
      ctx.fillStyle = b.primary ? '#35E5FF' : 'rgba(243,241,232,0.12)';
      roundRect(b.x, b.y, b.w, b.h, 12); ctx.fill();
      if (!b.primary) {
        ctx.strokeStyle = 'rgba(243,241,232,0.5)'; ctx.lineWidth = 2;
        roundRect(b.x, b.y, b.w, b.h, 12); ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = b.primary ? '#0A1420' : '#F3F1E8';
      if (b.sub) {
        ctx.font = 'bold 17px system-ui, sans-serif';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - 8);
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(b.sub, b.x + b.w / 2, b.y + b.h / 2 + 14);
      } else {
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle(view) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.fillStyle = '#F3F1E8';
    ctx.fillText('스타포지 러시', W / 2, 170);
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = '#35E5FF';
    ctx.fillText('게이트를 골라 군단을 키워라', W / 2, 208);
    drawImgCentered('m1', W / 2, 340, 170, () => {
      ctx.fillStyle = TIER_FALLBACK[0];
      ctx.beginPath(); ctx.arc(W / 2, 340, 60, 0, Math.PI * 2); ctx.fill();
    });
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(243,241,232,0.75)';
    ctx.fillText('최고 기록  ' + view.best, W / 2, 442);
  }

  function drawResults(res) {
    ctx.fillStyle = 'rgba(5,8,14,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillStyle = res.isRecord ? '#F6C84A' : '#F3F1E8';
    ctx.fillText(res.isRecord ? '신기록!' : (res.won ? '보스 격파!' : '출격 종료'), W / 2, 160);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#F3F1E8';
    ctx.fillText('최고 병력  ' + res.peak, W / 2, 226);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(243,241,232,0.8)';
    ctx.fillText('격파 ' + res.kills + '   코인 +' + res.coins + (res.x2 ? ' (2배!)' : ''), W / 2, 262);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = '#F6C84A';
    ctx.fillText('보유 코인  ' + res.wallet, W / 2, 314);
  }

  function drawOver(view) {
    ctx.fillStyle = 'rgba(5,8,14,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillStyle = '#FF6A3D';
    ctx.fillText('전멸...', W / 2, 330);
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#F3F1E8';
    ctx.fillText('병력 ' + BAL.fx.continueTroops + '기로 그 자리에서 다시 싸운다', W / 2, 372);
    void view;
  }

  function draw(view) {
    drawBackground(view.scroll ?? 0, view.zone ?? 0);
    if (view.state === 'run' || view.state === 'over') {
      for (const g of view.gates) drawGatePair(g.y, g.pair);
      for (const e of view.enemies) drawEnemy(e);
      if (view.boss) drawBoss(view.boss);
      ctx.fillStyle = '#8FF3FF';
      for (const b of view.bullets) ctx.fillRect(b.x - 2, b.y - 7, 4, 14);
      ctx.fillStyle = '#FF3DA5';
      for (const s of view.eshots) { ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill(); }
      drawSquad(view.squad);
      if (view.dim > 0) {                              // 보스 앞 정적
        ctx.fillStyle = 'rgba(0,0,0,' + view.dim + ')';
        ctx.fillRect(0, 0, W, H);
      }
      drawHud(view.hud);
      if (view.state === 'over') drawOver(view);
    } else if (view.state === 'title') {
      drawTitle(view);
    } else if (view.state === 'results') {
      drawResults(view.results);
    }
    drawButtons(view.buttons ?? []);
    if (view.mode === 'daily' && view.state !== 'title') {
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#F6C84A';
      ctx.fillText('오늘의 도전', W - 44, 30);
    }
  }

  return { draw };
}
