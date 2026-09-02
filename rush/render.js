// rush/render.js — 캔버스 그리기 전담. 게임 판단은 하나도 하지 않는다(view 를 그대로 그림).
import { BAL } from './balance.js';
import { formation, displayUnits } from './squad.js';
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

  //  접지 그림자 — 떠 보이는 느낌을 없앤다. 모든 유닛·적·보스 발밑 공통.
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
  //  걷기 애니메이션: 유닛마다 위상이 다른 행진 바운스(절차식 — 그림 추가 없이).
  function drawSquad(squad, now = 0) {
    const S = BAL.squad;
    const heroSize = S.heroSizes?.[squad.tier] ?? S.heroSize;    // 티어가 오르면 히어로 몸집도 큰다
    const pts = formation(displayUnits(squad.count));
    const recoil = (squad.fireFlash ?? 0) > 0.05 ? 2 : 0;        // 사격 반동 — 부대가 살짝 눌린다
    for (const p of pts) shadow(squad.x + p.x, S.y + p.y + (p.x === 0 && p.y === 0 ? heroSize : S.soldierSize) * 0.42, (p.x === 0 && p.y === 0 ? heroSize : S.soldierSize) * 0.42);
    for (let i = pts.length - 1; i >= 1; i--) {       // 병사들 — 뒷줄부터 그려 앞줄이 위에 오게
      const phase = now * 9 + i * 1.7;
      const bob = Math.sin(phase) * 1.6;              // 발걸음 상하
      const sway = Math.sin(phase * 0.5 + i) * 1.1;   // 좌우 뒤뚱
      const px = squad.x + pts[i].x + sway, py = S.y + pts[i].y + bob + recoil;   // 링 대형(히어로 중심 군집)
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
    const hx = squad.x + Math.sin(now * 4.5) * 0.8;   // 히어로(선두) — 묵직한 걸음
    const hy = S.y + Math.sin(now * 9) * 2 + recoil;
    drawImgCentered('m' + (squad.tier + 1), hx, hy, heroSize, () => {
      ctx.fillStyle = TIER_FALLBACK[squad.tier];
      ctx.beginPath();
      ctx.moveTo(hx, hy - heroSize / 2);
      ctx.lineTo(hx - heroSize / 3, hy + heroSize / 2);
      ctx.lineTo(hx + heroSize / 3, hy + heroSize / 2);
      ctx.closePath();
      ctx.fill();
    });
    //  사격 총구 섬광 — 발사 열 수만큼 부대 전방에서 번쩍인다.
    if ((squad.fireFlash ?? 0) > 0) {
      const k = squad.fireFlash / 0.09;
      const mz = squad.muzzles ?? 1;
      ctx.globalAlpha = Math.min(1, k);
      for (let m = 0; m < mz; m++) {
        const fx = squad.x + (m - (mz - 1) / 2) * 14;
        const fy = S.y - heroSize / 2 - 8;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(fx, fy, 3 + k * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(53,229,255,0.6)';
        ctx.beginPath(); ctx.arc(fx, fy, 6 + k * 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    //  부대 발밑 병력 수 = 체력 표시. 피격 중엔 빨갛게 — 맞았다는 것이 부대에서 바로 보인다.
    const ly = S.y + (squad.radius ?? 40) + 24;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#14233A';
    ctx.strokeText(String(squad.count), squad.x, ly);
    ctx.fillStyle = squad.hurt ? '#FF4A4A' : '#F3F1E8';
    ctx.fillText(String(squad.count), squad.x, ly);
  }

  const RECT_KINDS = new Set(['wallguard', 'cartyard', 'signaler', 'supply']);
  const ROUND_KINDS = new Set(['wheeler', 'manholejumper', 'magnethead', 'spawnpod']);

  function drawEnemy(e) {
    if (e.kind === 'supply') {                        // 보급 컨테이너 — 골드 상자 + 남은 내구도
      shadow(e.x, e.y + e.r * 0.95, e.r * 0.9);
      ctx.fillStyle = '#8A6D1F';
      roundRect(e.x - e.r, e.y - e.r * 0.8, e.r * 2, e.r * 1.6, 8); ctx.fill();
      ctx.strokeStyle = '#F6C84A'; ctx.lineWidth = 4;
      roundRect(e.x - e.r, e.y - e.r * 0.8, e.r * 2, e.r * 1.6, 8); ctx.stroke();
      ctx.fillStyle = '#F6C84A';
      ctx.fillRect(e.x - 3, e.y - e.r * 0.8, 6, e.r * 1.6);
      ctx.fillRect(e.x - e.r, e.y - 3, e.r * 2, 6);
      const reward = BAL.enemies.supply.rewardByZone[e.zone ?? 0] ?? 6;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = '#14233A';
      ctx.strokeText('+' + reward, e.x, e.y - 2);
      ctx.fillStyle = '#FFE9B8';
      ctx.fillText('+' + reward, e.x, e.y - 2);
      ctx.textBaseline = 'alphabetic';
      drawHpTag(e);
      return;
    }
    const key = 'e_' + e.kind;
    const h = e.r * 2.4;
    shadow(e.x, e.y + h * 0.4, e.r * 0.95);
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
    if (BAL.enemies[e.kind]?.showHp) drawHpTag(e);
  }

  /** 고체력 적 실시간 HP 숫자 — 깎이는 것이 눈에 보인다. */
  function drawHpTag(e) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#14233A';
    ctx.strokeText(Math.max(0, Math.ceil(e.hp)), e.x, e.y + e.r + 16);
    ctx.fillStyle = '#FF9A4A';
    ctx.fillText(Math.max(0, Math.ceil(e.hp)), e.x, e.y + e.r + 16);
  }

  function drawBoss(boss) {
    shadow(boss.x, boss.y + boss.r * 1.05, boss.r * 1.15);
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

  //  버튼 공통 스타일: 주 버튼 = 딥 네이비 + 시안 라인, 보조 = 반투명 네이비 패널.
  //  밝은 폐허 배경 위에서도 항상 읽히도록 어두운 판을 깐다. 텍스트는 세로 중앙 정렬.
  function drawButtons(buttons) {
    for (const b of buttons) {
      ctx.globalAlpha = b.disabled ? 0.45 : 1;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.primary) {
        ctx.fillStyle = '#14233A';
        roundRect(b.x, b.y, b.w, b.h, b.h / 2); ctx.fill();
        ctx.strokeStyle = '#35E5FF'; ctx.lineWidth = 2;
        roundRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, (b.h - 2) / 2); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(20,35,58,0.82)';
        roundRect(b.x, b.y, b.w, b.h, b.h / 2); ctx.fill();
        ctx.strokeStyle = 'rgba(246,200,74,0.65)'; ctx.lineWidth = 1.5;
        roundRect(b.x, b.y, b.w, b.h, b.h / 2); ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = b.primary ? '#FFFFFF' : '#F3F1E8';
      if (b.sub) {
        ctx.font = '700 17px system-ui, sans-serif';
        ctx.fillText(b.label, cx, cy - 10);
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = b.primary ? 'rgba(255,255,255,0.75)' : 'rgba(243,241,232,0.75)';
        ctx.fillText(b.sub, cx, cy + 12);
      } else {
        ctx.font = '700 19px system-ui, sans-serif';
        ctx.fillText(b.label, cx, cy);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle(view) {
    ctx.textAlign = 'center';
    //  워드마크: 밝은 배경 위 딥 네이비가 주인공, 골드는 포인트만
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillStyle = '#B98A1F';
    ctx.fillText('S T A R F O R G E   R U S H', W / 2, 118);
    ctx.font = '900 54px system-ui, sans-serif';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(243,241,232,0.9)';
    ctx.strokeText('스타포지 러시', W / 2, 172);
    ctx.fillStyle = '#14233A';
    ctx.fillText('스타포지 러시', W / 2, 172);
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(20,35,58,0.72)';
    ctx.fillText('병사들과 협력해, 도시를 되찾아라', W / 2, 204);
    //  히어로 정면 일러스트(도착 전엔 뒷모습 폴백)
    drawImgCentered('mfront', W / 2, 345, 210, () => {
      drawImgCentered('m1', W / 2, 345, 180, () => {
        ctx.fillStyle = TIER_FALLBACK[0];
        ctx.beginPath(); ctx.arc(W / 2, 345, 60, 0, Math.PI * 2); ctx.fill();
      });
    });
    if (view.best > 0) {
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(20,35,58,0.8)';
      ctx.fillText('최고 기록  ' + view.best, W / 2, 508);
    }
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

  function drawParts(parts) {
    for (const p of parts) {
      const k = 1 - p.t / p.life;
      if (p.flash) {                                   // 중심 섬광
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = p.big ? '#FFD9A0' : '#FFE9C8';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      } else {                                         // 파편
        ctx.globalAlpha = k;
        ctx.fillStyle = p.big ? '#FF9A4A' : '#FF6A3D';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k + 1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters(floaters) {
    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 0.9);
      ctx.font = 'bold ' + (f.big ? 34 : 22) + 'px system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#14233A';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function draw(view) {
    const shaking = (view.shakeT ?? 0) > 0;
    if (shaking) {                                     // 피탄·충돌 화면 흔들림
      const a = BAL.fx.shakeAmp * (view.shakeT / BAL.fx.shakeDur);
      ctx.save();
      ctx.translate(Math.sin(view.now * 71) * a, Math.cos(view.now * 89) * a * 0.7);
    }
    drawBackground((view.scroll ?? 0) * 0.6, view.zone ?? 0);   // 배경은 60% 속도(시차) — 접지감
    if (view.state === 'run' || view.state === 'over' || view.state === 'paused') {
      for (const g of view.gates) drawGatePair(g.y, g.pair);
      for (const e of view.enemies) drawEnemy(e);
      if (view.boss) drawBoss(view.boss);
      for (const b of view.bullets) {
        const w = b.w ?? 4, t = b.tier ?? 0;
        if (t >= 4) {                                  // 최종형: 플라즈마 글로우
          ctx.fillStyle = 'rgba(53,229,255,0.35)';
          ctx.beginPath(); ctx.arc(b.x, b.y, w * 1.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#8FF3FF';
        ctx.fillRect(b.x - w / 2, b.y - 7 - w, w, 14 + w);
        if (t >= 2) {                                  // 중반 이후: 흰 코어(더 뜨거운 탄)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(b.x - w / 6, b.y - 5 - w, w / 3, 10 + w);
        }
      }
      for (const s of view.eshots) {
        if (s.hook) {                                  // 갠트리 위도우 갈고리: 체인 + 클로
          ctx.strokeStyle = '#5A5A66'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(s.x, view.boss ? view.boss.y : s.y - 220); ctx.lineTo(s.x, s.y); ctx.stroke();
          ctx.fillStyle = '#8A8A96';
          ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, Math.PI); ctx.fill();
          ctx.fillStyle = '#FF3DA5';
          ctx.beginPath(); ctx.arc(s.x, s.y - 2, 5, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#FF3DA5';
          ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
        }
      }
      drawSquad(view.squad, view.now ?? 0);
      drawParts(view.parts ?? []);
      drawFloaters(view.floaters ?? []);
      if (view.dim > 0) {                              // 보스 앞 정적
        ctx.fillStyle = 'rgba(0,0,0,' + view.dim + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if ((view.hurtT ?? 0) > 0) {                     // 피격 빨간 비네트 — "왜 죽는지" 즉시 보이게
        const a = Math.min(0.45, view.hurtT / BAL.fx.hurtFlashDur * 0.45);
        const gr = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 470);
        gr.addColorStop(0, 'rgba(255,40,40,0)');
        gr.addColorStop(1, 'rgba(255,40,40,' + a + ')');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }
      drawHud(view.hud);
      if (view.state === 'over') drawOver(view);
      else if (view.state === 'paused') {              // ESC 일시 정지
        ctx.fillStyle = 'rgba(5,8,14,0.62)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px system-ui, sans-serif';
        ctx.fillStyle = '#F3F1E8';
        ctx.fillText('일시 정지', W / 2, 300);
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(243,241,232,0.7)';
        ctx.fillText('ESC 키로도 다시 시작할 수 있다', W / 2, 336);
      }
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
    if (shaking) ctx.restore();
  }

  return { draw };
}
