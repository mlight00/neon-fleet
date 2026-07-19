// 섹터별 리모델 배경(Gate 0). 섹터 1~6 → S1~S6 베이스 플레이트 1장 + 절제된 먼지/파편/항적 3층.
// 모든 레이어가 화면 위에서 들어와 아래로 빠져 "함대가 위로 전진"하는 느낌을 준다.
import { zoneForSector, zoneIndexForSector } from './creative-direction.js';

/** 섹터별 배경 플레이트 (지시서 §4.1). 인덱스 0~5 = 섹터 1~6. */
export const SECTOR_BACKDROP = Object.freeze(
  Array.from({ length: 6 }, (_, i) => ({ key: `s${i + 1}`, url: `assets/remodel-v2/backgrounds/s${i + 1}.webp` })),
);

/** 레이어 속도 (아래 방향). FAR < MID < NEAR (§4.4). base=원경 플레이트. 배경이 확실히 전진하도록 상향(테스터 피드백). */
export const LAYER_SPEEDS = Object.freeze({ base: 0.13, far: 0.13, dust: 0.2, mid: 0.32, near: 0.62 });

/** 섹터 → 배경 인덱스 (1:1, 7+는 5 고정) */
export function sectorBackdropIndex(sector = 1) { return zoneIndexForSector(sector); }

const backdropImages = new Map();

function loadBackdropIndex(i) {
  const { key, url } = SECTOR_BACKDROP[i];
  if (backdropImages.has(key) || typeof Image === 'undefined') return;
  backdropImages.set(key, null);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => backdropImages.set(key, img);
  img.onerror = () => backdropImages.set(key, false);
  img.src = url;
}

/** 현재 섹터 배경만 필수 로드, 다음 섹터를 미리 로드 (§9). */
export function preloadBackdropArt(sector = 1) {
  const i = sectorBackdropIndex(sector);
  loadBackdropIndex(i);
  if (i + 1 < SECTOR_BACKDROP.length) loadBackdropIndex(i + 1);
}

/**
 * 배경 타일의 화면 y (순수 함수, 지시서 §4.3). scroll이 증가하면 y도 증가한다 = 아래로 흐른다.
 *  y = i*tileH + wrap(scroll*speed, tileH) - tileH
 * 미러 반전(scale(1,-1)) 없이 같은 방향 두 장을 겹쳐 순환한다.
 */
export function backdropTileY(i, scroll, tileH, speed) {
  return i * tileH + wrap(scroll * speed, tileH) - tileH;
}

/** 입자 레이어 y (순수). base=정규화(0~1) 초기 위치. 배경과 같은 방향(+scroll*speed)으로 순환. */
export function backdropLayerY(base, scroll, span, speed) {
  return wrap(base * span + scroll * speed, span);
}

function drawVerticalArt(ctx, img, w, h, scroll, speed, alpha = 1) {
  if (!img || !img.width) return false;
  const tileH = img.height * (w / img.width);
  ctx.save(); ctx.globalAlpha = alpha;
  // 배경은 세로 심리스(상하 12%가 동일한 근흑색 #03050C로 감쇠)라 그냥 반복해도 이음매가 없다(Codex 재생성 v03).
  for (let i = -1; i <= Math.ceil(h / tileH) + 1; i++) {
    ctx.drawImage(img, 0, backdropTileY(i, scroll, tileH, speed), w, tileH);
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
  preloadBackdropArt(1);
  const fields = Array.from({ length: 6 }, (_, i) => buildField(7429 + i * 1777, logicalW));
  let lastSector = 1;
  return {
    draw(ctx, logicalH, scroll = 0, sector = 1) {
      if (sector !== lastSector) { preloadBackdropArt(sector); lastSector = sector; }
      const zone = zoneForSector(sector);
      const zi = sectorBackdropIndex(sector);   // 섹터 1~6 → 0~5 (1:1, R2)
      const field = fields[zi];
      const bg = ctx.createLinearGradient(0, 0, 0, logicalH);
      bg.addColorStop(0, zone.start); bg.addColorStop(0.56, zone.end); bg.addColorStop(1, '#02040a');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, logicalW, logicalH);

      // 섹터별 베이스 플레이트 1장. 로드 전/실패 시에만 절차적 랜드마크 폴백.
      const plate = backdropImages.get(SECTOR_BACKDROP[zi].key);
      if (!drawVerticalArt(ctx, plate, logicalW, logicalH, scroll, LAYER_SPEEDS.base, 0.94)) {
        drawLandmark(ctx, logicalW, logicalH, zone, scroll);
      }

      // 중경: 먼지·파편. 배경과 같은 방향(아래)으로 순환 — backdropLayerY.
      ctx.save();
      for (const d of field.dust) {
        const y = backdropLayerY(d.y, scroll, logicalH, LAYER_SPEEDS.dust);
        ctx.globalAlpha = d.a; ctx.fillStyle = zone.accent; ctx.fillRect(d.x, y, d.r, d.r);
      }
      for (const s of field.shards) {
        const y = backdropLayerY(s.y, scroll, logicalH + 100, LAYER_SPEEDS.mid) - 50;
        ctx.save(); ctx.translate(s.x, y); ctx.rotate(s.rot + scroll * 0.00035); ctx.globalAlpha = s.a; ctx.strokeStyle = zone.glow; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -s.s); ctx.lineTo(s.s * 0.36, s.s * 0.4); ctx.lineTo(-s.s * 0.22, s.s); ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();

      // 근경: 빠른 항적. 아래로 흐르는 꼬리(위→아래 전진감). 전투 오브젝트보다 어둡게.
      ctx.save(); ctx.lineWidth = 1;
      for (const s of field.streaks) {
        const y = backdropLayerY(s.y, scroll, logicalH + 160, LAYER_SPEEDS.near) - 80;
        const g = ctx.createLinearGradient(s.x, y, s.x, y + s.len); g.addColorStop(0, zone.glow); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = s.a; ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x, y + s.len); ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    },
  };
}
