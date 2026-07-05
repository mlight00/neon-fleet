// 아트 스프라이트 래스터라이저: SVG 문자열 또는 페인티드 PNG → 오프스크린 캔버스
// 3가지 아트 스타일(A 세라믹 / B 카툰 / C 메탈)을 런타임에 전환할 수 있다.
// 로딩은 비동기 — 아직 로드 전이면 getSprite가 null을 반환하고, 각 개체는 기존 코드 드로잉으로 폴백한다.
import { SVG_DEFS, SVG_ART } from './svg-art.js';

export const STYLE_NAMES = { A: '세라믹', B: '카툰', C: '메탈' };

let artStyle = 'C';
export function getArtStyle() { return artStyle; }
export function setArtStyle(s) { if (SVG_DEFS[s]) artStyle = s; }

// 페인티드(AI 생성 이미지) 에셋: 있으면 SVG보다 우선 사용. 스타일 C 전용.
const RASTER_ART = {
  C: {
    A1: 'assets/styleC/A1.png', A2: 'assets/styleC/A2.png',
    A3: 'assets/styleC/A3.png', A4: 'assets/styleC/A4.png',
    A5: 'assets/styleC/A5.png', A6: 'assets/styleC/A6.png',
    B1: 'assets/styleC/B1.png', B2: 'assets/styleC/B2.png',
    B3: 'assets/styleC/B3.png', B5: 'assets/styleC/B5.png',
    B7: 'assets/styleC/B7.png',
    C1: 'assets/styleC/C1.png', C2: 'assets/styleC/C2.png',
    // B4/B6/운석/파워모듈은 벡터 메탈 아트 유지 (추가 생성 시 교체)
  },
};

// 스타일별 배경 이미지 배열 (스테이지 진행에 따라 전환. 없으면 스타필드만)
const BG_ART = { C: ['assets/styleC/bg1.png', 'assets/styleC/bg2.png', 'assets/styleC/bg3.png'] };
const bgCache = new Map();

/** 스테이지 1~3 → 배경1, 4~6 → 배경2, 7+ → 배경3 */
export function getBackground(style = artStyle, stage = 1) {
  const idx = Math.min(2, Math.floor((Math.max(1, stage) - 1) / 3));
  return bgCache.get(style + ':' + idx) || bgCache.get(style + ':0') || null;
}

function loadBackground(style) {
  const urls = BG_ART[style];
  if (!urls) return Promise.resolve();
  return Promise.all(urls.map((url, idx) => {
    const key = style + ':' + idx;
    if (bgCache.has(key)) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { bgCache.set(key, img); resolve(); };
      img.onerror = () => { bgCache.set(key, null); resolve(); };
      img.src = url;
    });
  }));
}

// 에셋별 인게임 크기(px, 논리 좌표) — viewBox 100 기준 전체가 이 크기로 스케일된다
export const SPRITE_SIZES = {
  A1: 34, A2: 60, A3: 78, A4: 104, A5: 132, A6: 172, // 플레이어 함선 6티어
  B1: 30, B2: 46, B3: 66,                      // 샤드/리퍼/브루드
  B4: 36, B5: 42, B6: 38,                      // 저격/포탑/위버
  B7: 150,                                     // 하이브 퀸 (보스) — 잘림 방지 위해 축소
  C1: 56, C2: 30, C3: 34, C4: 46,              // 크리스탈/캡슐/파워/운석
};

const cache = new Map(); // key: `${style}:${id}` → canvas | null(로드 실패)

export function getSprite(id, style = artStyle) {
  return cache.get(style + ':' + id) || null;
}

function loadSprite(id, style, px) {
  const key = style + ':' + id;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const S = 2; // 선명도용 2배 렌더
  const raster = RASTER_ART[style]?.[id];
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      if (raster) {
        // 페인티드 PNG: 원본 비율 유지, 긴 변을 px에 맞춤
        const scale = (px * S) / Math.max(img.width, img.height);
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      } else {
        c.width = px * S;
        c.height = px * S;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      }
      c.logicalW = c.width / S;
      c.logicalH = c.height / S;
      cache.set(key, c);
      resolve(c);
    };
    const svgSrc = () => {
      if (!SVG_ART[id]) return null; // A5/A6 등 벡터 없는 신규 에셋
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${px * S}" height="${px * S}">${SVG_DEFS[style]}${SVG_ART[id][style]}</svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };
    let triedSvg = !raster;
    img.onerror = () => {
      const fallback = !triedSvg && svgSrc();
      if (fallback) {
        // PNG 로드 실패(파일 이동 등) → SVG 벡터로 폴백
        triedSvg = true;
        img.src = fallback;
        return;
      }
      cache.set(key, null); // 최종 실패 → 코드 드로잉 폴백 유지
      resolve(null);
    };
    const first = raster || svgSrc();
    if (!first) { cache.set(key, null); resolve(null); return; }
    img.src = first;
  });
}

/** 한 스타일의 전체 에셋(+배경)을 미리 로드 (타이틀/스타일 전환 시 호출) */
export function preloadStyle(style = artStyle) {
  return Promise.all([
    ...Object.entries(SPRITE_SIZES).map(([id, px]) => loadSprite(id, style, px)),
    loadBackground(style),
  ]);
}
