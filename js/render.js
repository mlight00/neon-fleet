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
export function drawHUD(ctx, logicalW, { progress, bosses = [], count, cruisers = 0, tierName, shipName, doctrine = '', tierPower, upgradeCur = 0, upgradeMax = 0, stage, weapon, weaponLv, weaponEvo, shield, modules = [], logicalH = 776, flow = 0, flowMax = 100, rushT = 0, keystoneIcon = '' }) {
  ctx.save();
  // 진행 바 (최상단 — 아래 텍스트와 겹치지 않게 y=8)
  const barW = logicalW - 80;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(40, 8, barW, 5);
  ctx.fillStyle = COLORS.ally;
  ctx.fillRect(40, 8, barW * Math.min(1, progress), 5);

  // 보스 HP — 다중 보스면 상단에 나란히 (각 보스 HP바), 1기면 이름·수치까지 표시
  if (bosses.length) {
    const n = bosses.length;
    const totalW = logicalW - 120, gap = 6;
    const bw = (totalW - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const bo = bosses[i], bx = 60 + i * (bw + gap);
      ctx.fillStyle = 'rgba(255,61,113,0.25)';
      ctx.fillRect(bx, 30, bw, 10);
      ctx.fillStyle = bo.dead ? 'rgba(150,150,170,0.5)' : COLORS.danger;
      ctx.fillRect(bx, 30, bw * Math.max(0, bo.hp / bo.maxHp), 10);
    }
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = COLORS.text;
    if (n === 1) {
      ctx.textAlign = 'left';
      ctx.fillText(bosses[0].name || 'BOSS', 60, 51);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ff8080';
      ctx.fillText(`${Math.ceil(bosses[0].hp).toLocaleString()} / ${bosses[0].maxHp.toLocaleString()}`, logicalW - 60, 51);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(`보스 ${n}기 · ${bosses[0].name}`, logicalW / 2, 51);
    }
    // 네온 아비터 전용 STAGGER/BREAK 보조 바 (다른 보스엔 표시 안 함)
    // 보스 이름·HP(y=51)와 모듈 줄(y=83) 사이에 배치 — 라벨 y=64, 바 y=68~73, BREAK y=70 (중첩 방지)
    const bo = bosses[0];
    if (n === 1 && bo.stagger !== undefined && bo.staggerMax) {
      const sbw = logicalW - 120;
      if (bo.breakT > 0) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`붕괴 ${bo.breakT.toFixed(1)}초 · 받는 피해 ×1.25`, logicalW / 2, 70);
      } else {
        ctx.textAlign = 'left';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#8affff';
        ctx.fillText(`균열 ${bo.stagger}/${bo.staggerMax}`, 60, 64);
        ctx.fillStyle = 'rgba(138,255,255,0.18)';
        ctx.fillRect(60, 68, sbw, 5);
        ctx.fillStyle = '#8affff';
        ctx.fillRect(60, 68, sbw * Math.min(1, bo.stagger / bo.staggerMax), 5);
      }
    }
    ctx.textAlign = 'left';
  }

  // 좌상단(진행바 아래): 함대 구성 + 기함 + 기함강화 게이지 + 섹터
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  // 보스전에는 기함 상세줄이 보스 HP바·이름과 겹치므로, 함대 줄(보스 HP바보다 위)에 기함 이름만 짧게 붙인다.
  const bossShip = bosses.length && shipName ? ` · 기함 ${shipName}${doctrine ? ' ' + doctrine : ''}` : '';
  ctx.fillText(`드론 ${count}기 · 순양함 ${cruisers}${bossShip}`, 12, 28);
  // 상세줄(트레잇·화력·게이지·섹터)은 보스전엔 숨김 (겹침 방지)
  if (!bosses.length) {
    if (tierName) {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = COLORS.ally;
      const dTag = doctrine ? ` ${doctrine}` : '';
    ctx.fillText((tierPower > 0 ? `기함 ${tierName} · 화력 ${tierPower}` : `기함 ${tierName}`) + dTag, 12, 42);
    }
    // 기함 업그레이드 게이지: 순양함을 모아 임계치를 채우면 기함 1단계 업그레이드
    if (upgradeMax > 0) {
      const gw = 86;
      ctx.fillStyle = 'rgba(255,217,61,0.18)';
      ctx.fillRect(12, 48, gw, 5);
      ctx.fillStyle = COLORS.reward;
      ctx.fillRect(12, 48, gw * Math.min(1, upgradeCur / upgradeMax), 5);
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`기함 강화까지 순양함 ${upgradeCur}/${upgradeMax}`, 12 + gw + 6, 53);
    } else if (tierName) {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = COLORS.reward;
      ctx.fillText('기함 최종단계 (MAX)', 12, 53);
    }
    if (stage) {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = COLORS.reward;
      ctx.fillText(`섹터 ${stage}`, 12, 67);
    }
  }
  // 보유 모듈 아이콘 줄 (빌드가 커지는 게 보인다)
  if (modules && modules.length) {
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    let mx = 12;
    for (const m of modules) {
      const label = m.count > 1 ? `${m.icon}${m.count}` : m.icon;
      ctx.fillText(label, mx, 83);
      mx += ctx.measureText(label).width + 6;
      if (mx > logicalW - 24) break;
    }
  }

  // 우상단: 무기(+진화) + 레벨 점 + 실드
  if (weapon) {
    const color = WEAPON_COLORS[weapon];
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = color;
    const evoTag = weaponEvo ? ` · ${weaponEvo}` : '';
    ctx.fillText(WEAPON_LABELS[weapon] + evoTag + (shield ? ' ⛨' : ''), logicalW - 12, 34);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < weaponLv ? 1 : 0.25;
      ctx.fillStyle = color;
      ctx.fillRect(logicalW - 12 - (2 - i) * 10 - 6, 40, 6, 3);
    }
    ctx.globalAlpha = 1;
  }

  // ── FLOW / NEON RUSH HUD (하단 중앙, 보스·함대·무기와 겹치지 않음) ──
  {
    const bw = 128, bh = 7;
    const bx = (logicalW - bw) / 2, by = logicalH - 30;
    const inRush = rushT > 0;
    ctx.textAlign = 'center';
    if (inRush) {
      // RUSH: 텍스트 + 청록/자홍 게이지 (색상만이 아니라 RUSH 텍스트 병행)
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#ff4cd2';
      ctx.fillText(`폭주! ${rushT.toFixed(1)}초`, logicalW / 2, by - 4);
      ctx.fillStyle = 'rgba(87,224,255,0.18)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#57e0ff';
      ctx.fillRect(bx, by, bw * Math.min(1, rushT / 4), bh);
    } else {
      // FLOW: 0일 땐 흐리게(시스템 존재 표시), 값 있으면 밝게. FLOW 텍스트 병행.
      const frac = Math.max(0, Math.min(1, flow / flowMax));
      ctx.globalAlpha = flow > 0 ? 1 : 0.4;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = COLORS.gateGood;
      ctx.fillText(`집중 ${Math.round(flow)}`, logicalW / 2, by - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = COLORS.gateGood;
      ctx.fillRect(bx, by, bw * frac, bh);
      ctx.globalAlpha = 1;
    }
    // 선택한 키스톤 아이콘 (하나만, FLOW 바 오른쪽에 짧게 — C3)
    if (keystoneIcon) {
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.reward;
      ctx.fillText(keystoneIcon, bx + bw + 8, by + bh);
    }
  }
  ctx.textAlign = 'left';
  ctx.restore();
}
