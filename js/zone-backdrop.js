// 6구역 절차적 배경. 각 구역을 원경/중경/근경 3층으로 그려 패널 이음새 없이 패럴랙스를 만든다.
import { zoneForSector } from './creative-direction.js';

const BACKDROP_URLS = {
  heliosFar: 'assets/art2-webp/backgrounds/nf2_bg01_helios_far.webp',
  heliosMid: 'assets/art2-webp/backgrounds/nf2_bg01_helios_mid.webp',
  hiveFar: 'assets/art2-webp/backgrounds/nf2_bg02_hive_far.webp',
  hiveMid: 'assets/art2-webp/backgrounds/nf2_bg02_hive_mid.webp',
};
const backdropImages = new Map();

function loadBackdrop(key) {
  if (backdropImages.has(key) || typeof Image === 'undefined') return;
  backdropImages.set(key, null);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => backdropImages.set(key, img);
  img.onerror = () => backdropImages.set(key, false);
  img.src = BACKDROP_URLS[key];
}

export function preloadBackdropArt() { Object.keys(BACKDROP_URLS).forEach(loadBackdrop); }

function drawVerticalArt(ctx, img, w, h, scroll, speed, alpha = 1) {
  if (!img || !img.width) return false;
  const tileH = img.height * (w / img.width);
  const offset = wrap(scroll * speed, tileH);
  ctx.save(); ctx.globalAlpha = alpha;
  for (let i = -1; i <= Math.ceil(h / tileH) + 1; i++) {
    const y = i * tileH - offset;
    // 매 두 번째 타일을 상하 반전해 경계에서 동일 방향 특징이 반복되는 느낌을 줄인다.
    if (i % 2) {
      ctx.save(); ctx.translate(0, y + tileH); ctx.scale(1, -1); ctx.drawImage(img, 0, 0, w, tileH); ctx.restore();
    } else ctx.drawImage(img, 0, y, w, tileH);
  }
  ctx.restore();
  return true;
}

function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function wrap(value, size) { return ((value % size) + size) % size; }

function buildField(seed, logicalW) {
  const rand = mulberry32(seed);
  return {
    dust: Array.from({ length: 34 }, () => ({ x: rand() * logicalW, y: rand(), r: 0.5 + rand() * 1.8, a: 0.12 + rand() * 0.34 })),
    shards: Array.from({ length: 14 }, () => ({ x: rand() * logicalW, y: rand(), s: 5 + rand() * 16, rot: rand() * Math.PI, a: 0.08 + rand() * 0.18 })),
    streaks: Array.from({ length: 10 }, () => ({ x: rand() * logicalW, y: rand(), len: 14 + rand() * 54, a: 0.06 + rand() * 0.12 })),
  };
}

function drawLandmark(ctx, w, h, zone, scroll) {
  ctx.save();
  if (zone.motif === 'moon') {
    const x = w * 0.78, y = h * 0.2 + Math.sin(scroll * 0.0004) * 5, r = w * 0.23;
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.22, r * 0.08, x, y, r);
    g.addColorStop(0, 'rgba(220,240,255,.42)'); g.addColorStop(0.56, 'rgba(70,105,145,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(111,220,255,.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0.2, 4.9); ctx.stroke();
  } else if (zone.motif === 'prism') {
    ctx.translate(w * 0.72, h * 0.22); ctx.rotate(-0.28);
    const g = ctx.createLinearGradient(-60, -100, 60, 100); g.addColorStop(0, 'rgba(113,244,255,.04)'); g.addColorStop(0.5, 'rgba(196,107,255,.24)'); g.addColorStop(1, 'rgba(255,255,255,.02)');
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(196,107,255,.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -120); ctx.lineTo(58, 48); ctx.lineTo(0, 94); ctx.lineTo(-54, 38); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (zone.motif === 'sun') {
    const x = w * 0.22, y = h * 0.08, r = w * 0.25;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, 'rgba(255,245,190,.62)'); g.addColorStop(0.2, 'rgba(255,135,72,.36)'); g.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  } else if (zone.motif === 'wreck') {
    ctx.translate(w * 0.72, h * 0.24); ctx.rotate(0.32);
    ctx.fillStyle = 'rgba(38,65,72,.42)'; ctx.strokeStyle = 'rgba(99,217,199,.16)';
    ctx.beginPath(); ctx.moveTo(-85, -12); ctx.lineTo(30, -34); ctx.lineTo(92, 4); ctx.lineTo(14, 25); ctx.lineTo(-48, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,180,95,.15)'; ctx.fillRect(8, -5, 52, 4);
  } else if (zone.motif === 'veil') {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(255,76,210,${0.05 + i * 0.018})`; ctx.lineWidth = 18 - i * 3; ctx.beginPath();
      for (let y = -20; y < h + 40; y += 32) {
        const x = w * (0.35 + i * 0.13) + Math.sin(y * 0.012 + scroll * 0.001 + i) * 42;
        if (y < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (zone.motif === 'crown') {
    ctx.translate(w * 0.5, h * 0.14); ctx.strokeStyle = 'rgba(255,225,122,.24)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-92, 38); ctx.lineTo(-70, -50); ctx.lineTo(-28, 2); ctx.lineTo(0, -86); ctx.lineTo(28, 2); ctx.lineTo(70, -50); ctx.lineTo(92, 38); ctx.stroke();
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 90); g.addColorStop(0, 'rgba(255,225,122,.32)'); g.addColorStop(1, 'rgba(255,76,210,0)'); ctx.fillStyle = g; ctx.fillRect(-100, -100, 200, 200);
  }
  ctx.restore();
}

export function createZoneBackdrop(logicalW) {
  preloadBackdropArt();
  const fields = Array.from({ length: 6 }, (_, i) => buildField(7429 + i * 1777, logicalW));
  return {
    draw(ctx, logicalH, scroll = 0, sector = 1) {
      const zone = zoneForSector(sector);
      const zi = Math.min(5, Math.floor((Math.max(1, sector) - 1) / 2));
      const field = fields[zi];
      const bg = ctx.createLinearGradient(0, 0, 0, logicalH);
      bg.addColorStop(0, zone.start); bg.addColorStop(0.56, zone.end); bg.addColorStop(1, '#02040a');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, logicalW, logicalH);

      const late = sector >= 5;
      const far = backdropImages.get(late ? 'hiveFar' : 'heliosFar');
      const mid = backdropImages.get(late ? 'hiveMid' : 'heliosMid');
      // 새 원경이 로드되기 전/실패한 경우에만 기존 절차적 랜드마크를 폴백으로 사용한다.
      if (!drawVerticalArt(ctx, far, logicalW, logicalH, scroll, 0.025, 0.92)) drawLandmark(ctx, logicalW, logicalH, zone, scroll);
      drawVerticalArt(ctx, mid, logicalW, logicalH, scroll, 0.085, 0.72);

      // 중경: 작은 파편과 먼지. 속도 0.12.
      ctx.save();
      for (const d of field.dust) {
        const y = wrap(d.y * logicalH + scroll * 0.12, logicalH);
        ctx.globalAlpha = d.a; ctx.fillStyle = zone.accent; ctx.fillRect(d.x, y, d.r, d.r);
      }
      for (const s of field.shards) {
        const y = wrap(s.y * (logicalH + 100) + scroll * 0.2, logicalH + 100) - 50;
        ctx.save(); ctx.translate(s.x, y); ctx.rotate(s.rot + scroll * 0.00035); ctx.globalAlpha = s.a; ctx.strokeStyle = zone.glow; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -s.s); ctx.lineTo(s.s * 0.36, s.s * 0.4); ctx.lineTo(-s.s * 0.22, s.s); ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();

      // 근경: 빠른 항적. 전투 오브젝트보다 어둡게 유지해 가독성을 해치지 않는다.
      ctx.save(); ctx.lineWidth = 1;
      for (const s of field.streaks) {
        const y = wrap(s.y * (logicalH + 160) + scroll * 0.48, logicalH + 160) - 80;
        const g = ctx.createLinearGradient(s.x, y, s.x, y + s.len); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, zone.glow);
        ctx.globalAlpha = s.a; ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x, y + s.len); ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    },
  };
}
