// 렌더 헬퍼: 네온 팔레트, 글로우, 스타필드, HUD
export const COLORS = {
  ally: '#3ff5e0',
  allyDim: 'rgba(63,245,224,0.35)',
  enemy: '#b44cff',      // 보이드 스웜 등급1
  enemyMid: '#d84cf0',   // 등급2
  enemyHigh: '#ff4cd2',  // 등급3
  enemyCore: '#7cff4c',  // 독성 녹색 코어 (스웜 시그니처)
  danger: '#ff3d71',
  reward: '#ffd93d',
  gateGood: '#3fd0f5',
  gateBad: '#ff4cd2',
  text: '#dff6ff',
};

// 무기 색: 적 팩션(보라~적색)과 절대 겹치지 않게 (부록 §2)
export const WEAPON_COLORS = {
  vulcan: '#3ff5e0',
  laser: '#a8f0ff',
  homing: '#ffd93d',
};
export const WEAPON_LABELS = { vulcan: '발칸', laser: '레이저', homing: '호밍' };

/** 글로우 상태를 감싸서 그리기 (shadowBlur 설정/복원) */
export function glow(ctx, color, blur, fn) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn(ctx);
  ctx.restore();
}

/**
 * 오프스크린 프리렌더: 글로우 포함 실루엣을 1회만 그려두고 매 프레임 drawImage.
 * shadowBlur를 실시간 루프에서 추방하는 핵심 성능 장치 (부록 §6).
 * drawFn은 캔버스 중앙 (0,0) 기준 로컬 좌표로 그린다. 2배 해상도로 렌더해 선명도 유지.
 */
export function makeSprite(w, h, drawFn) {
  const c = document.createElement('canvas');
  const S = 2;
  c.width = w * S;
  c.height = h * S;
  const cc = c.getContext('2d');
  cc.scale(S, S);
  cc.translate(w / 2, h / 2);
  drawFn(cc);
  c.logicalW = w;
  c.logicalH = h;
  return c;
}

/** 프리렌더 스프라이트를 (x,y) 중앙 정렬로 그리기 */
export function blit(ctx, sprite, x, y, scale = 1) {
  const w = sprite.logicalW * scale;
  const h = sprite.logicalH * scale;
  ctx.drawImage(sprite, x - w / 2, y - h / 2, w, h);
}

/** hex 색 → rgba 문자열 */
export function hexA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 게이트/선택지 박스 공통 디자인: 라운드 홀로 패널 + 좌우 에너지 포스트 + 스캔 시머 + 라벨
 * t: 애니메이션 시간(초), highlight: 방금 선택됨, dim: 이미 사용됨
 */
export function drawGateBox(ctx, x, y, w, h, color, label, { t = 0, highlight = false, dim = false, fontSize = 20 } = {}) {
  ctx.save();
  ctx.globalAlpha = dim ? 0.22 : 1;

  // 본체: 라운드 + 세로 그라데이션 (아래로 갈수록 짙게)
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, hexA(color, 0.06));
  grad.addColorStop(1, hexA(color, highlight ? 0.45 : 0.26));
  ctx.beginPath();
  ctx.roundRect(x + 4, y, w - 8, h, 9);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = hexA(color, 0.85);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 상단 하이라이트 라인
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 2.5);
  ctx.lineTo(x + w - 14, y + 2.5);
  ctx.stroke();

  // 좌우 에너지 포스트 (기둥 + 발광 코어)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y - 3, 5, h + 6, 2.5);
  ctx.roundRect(x + w - 5, y - 3, 5, h + 6, 2.5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  const pulse = 0.55 + 0.45 * Math.sin(t * 5);
  ctx.globalAlpha *= pulse;
  ctx.fillRect(x + 1.5, y + h / 2 - 4, 2, 8);
  ctx.fillRect(x + w - 3.5, y + h / 2 - 4, 2, 8);
  ctx.globalAlpha = dim ? 0.22 : 1;

  // 스캔 시머 (좌→우로 흐르는 빛줄기)
  if (!dim) {
    const sweepW = 22;
    const sx = x + 6 + ((t * 90) % (w + sweepW * 2)) - sweepW;
    const sg = ctx.createLinearGradient(sx, 0, sx + sweepW, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 4, y, w - 8, h, 9);
    ctx.clip();
    ctx.fillStyle = sg;
    ctx.fillRect(sx, y, sweepW, h);
    ctx.restore();
  }

  // 라벨: 그림자 + 본문 (선택 순간엔 글로우)
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  const cx = x + w / 2;
  const cy = y + h / 2 + fontSize * 0.36;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(label, cx + 1.5, cy + 1.5);
  if (highlight) {
    glow(ctx, color, 14, (c) => { c.fillStyle = '#ffffff'; c.fillText(label, cx, cy); });
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx, cy);
  }
  ctx.restore();
}

/** 스타필드: 고정 별 2층 패럴랙스. scrollY가 커질수록 아래로 흐른다. */
export function createStarfield(logicalW, count = 120) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * logicalW,
      y: Math.random(),           // 0~1 (화면 높이 비율 시드)
      layer: i % 2 === 0 ? 0.25 : 0.55, // 패럴랙스 배율
      size: i % 3 === 0 ? 2 : 1.2,
    });
  }
  return {
    draw(ctx, logicalH, scrollY) {
      ctx.save();
      for (const s of stars) {
        const y = ((s.y * logicalH + scrollY * s.layer) % logicalH + logicalH) % logicalH;
        ctx.globalAlpha = s.layer + 0.2;
        ctx.fillStyle = '#9fd8ff';
        ctx.fillRect(s.x, y, s.size, s.size);
      }
      ctx.restore();
    },
  };
}

/** 상단 HUD: 진행 바 + 보스 HP + 티어/진화 게이지/무기 상태 */
export function drawHUD(ctx, logicalW, { progress, bossHp, bossMax, bossName, count, tierName, tierPower, nextCost, stage, weapon, weaponLv, shield }) {
  ctx.save();
  // 진행 바
  const barW = logicalW - 80;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(40, 14, barW, 6);
  ctx.fillStyle = COLORS.ally;
  ctx.fillRect(40, 14, barW * Math.min(1, progress), 6);

  // 보스 HP (숫자는 정수 — 깎이는 게 바로 읽히게)
  if (bossMax > 0) {
    ctx.fillStyle = 'rgba(255,61,113,0.25)';
    ctx.fillRect(60, 30, logicalW - 120, 10);
    ctx.fillStyle = COLORS.danger;
    ctx.fillRect(60, 30, (logicalW - 120) * Math.max(0, bossHp / bossMax), 10);
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(bossName || 'BOSS', 60, 51);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff8080';
    ctx.fillText(`${Math.ceil(Math.max(0, bossHp)).toLocaleString()} / ${bossMax.toLocaleString()}`, logicalW - 60, 51);
  }

  // 좌상단: 편대 수 + 티어(기함 화력) + 진화 게이지 + 스테이지
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`▲ x${count}`, 12, 20);
  if (tierName) {
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = COLORS.ally;
    ctx.fillText(tierPower > 0 ? `${tierName} · 기함 +${tierPower}` : tierName, 12, 34);
  }
  // 다음 진화 게이지: 드론을 모아 비용을 채우면 기함에 흡수·승급 (최고 티어면 MAX)
  if (nextCost > 0) {
    const gw = 86;
    ctx.fillStyle = 'rgba(255,217,61,0.18)';
    ctx.fillRect(12, 40, gw, 5);
    ctx.fillStyle = COLORS.reward;
    ctx.fillRect(12, 40, gw * Math.min(1, count / nextCost), 5);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(`진화 ${count}/${nextCost}`, 12 + gw + 6, 45);
  } else if (tierName) {
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = COLORS.reward;
    ctx.fillText('최종 진화 MAX', 12, 45);
  }
  if (stage) {
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = COLORS.reward;
    ctx.fillText(`STAGE ${stage}`, 12, 59);
  }

  // 우상단: 무기 + 레벨 점 + 실드
  if (weapon) {
    const color = WEAPON_COLORS[weapon];
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(WEAPON_LABELS[weapon] + (shield ? ' ⛨' : ''), logicalW - 12, 34);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < weaponLv ? 1 : 0.25;
      ctx.fillStyle = color;
      ctx.fillRect(logicalW - 12 - (2 - i) * 10 - 6, 40, 6, 3);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
