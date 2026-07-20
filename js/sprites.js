// 아트 스프라이트 래스터라이저: SVG 문자열 또는 페인티드 PNG → 오프스크린 캔버스
// 3가지 아트 스타일(A 세라믹 / B 카툰 / C 메탈)을 런타임에 전환할 수 있다.
// 로딩은 비동기 — 아직 로드 전이면 getSprite가 null을 반환하고, 각 개체는 기존 코드 드로잉으로 폴백한다.
import { SVG_DEFS, SVG_ART } from './svg-art.js';

export const STYLE_NAMES = { A: '세라믹', B: '카툰', C: '메탈' };

let artStyle = 'C';
export function getArtStyle() { return artStyle; }
export function setArtStyle(s) { if (SVG_DEFS[s]) artStyle = s; }

// Phase B FORGED LIGHT 런타임 자산. WebP가 실패하면 기존 SVG/Canvas 드로잉으로 폴백한다.
// PNG 30MB 세트는 저장소/네트워크 부담 때문에 런타임에서 이중 요청하지 않는다.
export const ART_PATHS = Object.freeze({
  A1: 'assets/art2-webp/styleC/A1.webp', A2: 'assets/art2-webp/styleC/A2.webp',
  A3: 'assets/art2-webp/styleC/A3.webp', A4: 'assets/art2-webp/styleC/A4.webp',
  A5: 'assets/art2-webp/styleC/A5.webp', A6: 'assets/art2-webp/styleC/A6.webp',
  B16: 'assets/art2-webp/styleC/B16.webp', B17: 'assets/art2-webp/styleC/B17.webp',
  B18: 'assets/art2-webp/styleC/B18.webp', B19: 'assets/art2-webp/styleC/B19.webp',
  B20: 'assets/art2-webp/styleC/B20.webp', B21: 'assets/art2-webp/styleC/B21.webp',
  H2_BASE_FRAME: 'assets/art2-webp/ships/frames/H2_base_aligned.webp',
  H2_ASSAULT: 'assets/art2-webp/ships/frames/H2_assault.webp',
  H2_CARRIER: 'assets/art2-webp/ships/frames/H2_carrier.webp',
  MOUNT_VULCAN_BASE: 'assets/art2-webp/weapons/mounts/nf2_mount_vulcan_base.webp',
  MOUNT_VULCAN_NEEDLE: 'assets/art2-webp/weapons/mounts/nf2_mount_vulcan_needle.webp',
  MOUNT_VULCAN_STORM: 'assets/art2-webp/weapons/mounts/nf2_mount_vulcan_storm.webp',
  MOUNT_LASER_BASE: 'assets/art2-webp/weapons/mounts/nf2_mount_laser_base.webp',
  MOUNT_LASER_CUTTER: 'assets/art2-webp/weapons/mounts/nf2_mount_laser_cutter.webp',
  MOUNT_LASER_PRISM: 'assets/art2-webp/weapons/mounts/nf2_mount_laser_prism.webp',
  MOUNT_HOMING_BASE: 'assets/art2-webp/weapons/mounts/nf2_mount_homing_base.webp',
  MOUNT_HOMING_WASP: 'assets/art2-webp/weapons/mounts/nf2_mount_homing_wasp.webp',
  MOUNT_HOMING_SIEGE: 'assets/art2-webp/weapons/mounts/nf2_mount_homing_siege.webp',
  PROJ_VULCAN_BASE: 'assets/art2-webp/weapons/projectiles/nf2_proj_vulcan_base.webp',
  PROJ_VULCAN_NEEDLE: 'assets/art2-webp/weapons/projectiles/nf2_proj_vulcan_needle.webp',
  PROJ_VULCAN_STORM: 'assets/art2-webp/weapons/projectiles/nf2_proj_vulcan_storm.webp',
  PROJ_LASER_BASE: 'assets/art2-webp/weapons/projectiles/nf2_proj_laser_base.webp',
  PROJ_LASER_CUTTER: 'assets/art2-webp/weapons/projectiles/nf2_proj_laser_cutter.webp',
  PROJ_LASER_PRISM: 'assets/art2-webp/weapons/projectiles/nf2_proj_laser_prism.webp',
  PROJ_HOMING_BASE: 'assets/art2-webp/weapons/projectiles/nf2_proj_homing_base.webp',
  PROJ_HOMING_WASP: 'assets/art2-webp/weapons/projectiles/nf2_proj_homing_wasp.webp',
  PROJ_HOMING_SIEGE: 'assets/art2-webp/weapons/projectiles/nf2_proj_homing_siege.webp',
  B22: 'assets/art2-webp/bosses/b22/B22.webp',
  B22_CHASSIS: 'assets/art2-webp/bosses/b22/B22_chassis.webp',
  B22_RING: 'assets/art2-webp/bosses/b22/B22_ring.webp',
  B22_ARM_LEFT: 'assets/art2-webp/bosses/b22/B22_arm_left.webp',
  B22_ARM_RIGHT: 'assets/art2-webp/bosses/b22/B22_arm_right.webp',
  B22_CORE: 'assets/art2-webp/bosses/b22/B22_core.webp',
  B22_CRACK: 'assets/art2-webp/bosses/b22/B22_crack_mask.webp',
  B7: 'assets/art2-webp/bosses/b7/B7.webp',
  B7_BODY: 'assets/art2-webp/bosses/b7/B7_body.webp',
  B7_EGG_LEFT: 'assets/art2-webp/bosses/b7/B7_egg_left.webp',
  B7_EGG_RIGHT: 'assets/art2-webp/bosses/b7/B7_egg_right.webp',
  B7_CROWN: 'assets/art2-webp/bosses/b7/B7_crown.webp',
  B7_HEART: 'assets/art2-webp/bosses/b7/B7_heart.webp',
  B7_ESCAPE: 'assets/art2-webp/bosses/b7/B7_escape_core.webp',
  B7_DEBRIS: 'assets/art2-webp/bosses/b7/B7_debris_sheet.webp',
  VFX_CORE: 'assets/art2-webp/vfx/nf2_vfx_core_ignition.webp',
  VFX_ARMOR: 'assets/art2-webp/vfx/nf2_vfx_armor_lock.webp',
  VFX_WEAPON: 'assets/art2-webp/vfx/nf2_vfx_weapon_evolution.webp',
  VFX_TIER: 'assets/art2-webp/vfx/nf2_vfx_tier_ascension.webp',
  VFX_BOSS_BREAK: 'assets/art2-webp/vfx/nf2_vfx_boss_armor_break.webp',
});

// Gate 0 리모델링 v2 (지시서 §5·§6): 일반 적 12종 + 캠페인 보스 6종을 신규 WebP로 교체.
// FORGED LIGHT(ART_PATHS)의 B16~B21·B22·B7 경로를 이 블록이 덮어써 단일 톤으로 통일한다.
const REMODEL_V2_ENEMIES = Object.fromEntries(
  ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B16', 'B17', 'B18', 'B19', 'B20', 'B21']
    .map((id) => [id, `assets/remodel-v2/enemies/${id}.webp`]),
);
const REMODEL_V2_BOSSES = Object.fromEntries(
  ['B8', 'B9', 'B10', 'B11', 'B22', 'B7'].map((id) => [id, `assets/remodel-v2/bosses/${id}.webp`]),
);

export const RASTER_ART = {
  C: {
    ...ART_PATHS,
    C1: 'assets/styleC/C1.png', C2: 'assets/styleC/C2.png', C5: 'assets/styleC/C5.png',
    ...REMODEL_V2_ENEMIES,     // B1~B6, B16~B21 (B4/B6 포함 — 벡터 폴백 해제)
    ...REMODEL_V2_BOSSES,      // B8~B11, B22, B7 (구 카툰 PNG·레이어 합본 대체)
    // 운석/파워모듈은 벡터 메탈 아트 유지. B12~B15(엔드리스)는 이번 범위 밖.
  },
};

// 스테이지별 보스 로스터: 스테이지 s → ROSTER[(s-1) % 길이] 순환.
// PNG가 아직 없는 보스는 자동으로 하이브 퀸 벡터 드로잉으로 폴백된다 (게임 안 깨짐).
export const BOSS_ROSTER = [
  { id: 'B7', name: 'HIVE QUEEN', korName: '하이브 퀸' },
  { id: 'B8', name: 'REAPER LORD', korName: '리퍼 로드' },
  { id: 'B9', name: 'VORTEX MAW', korName: '볼텍스 마우' },
  { id: 'B10', name: 'OBSIDIAN CLAW', korName: '옵시디언 클로' },
  { id: 'B11', name: 'VOID SERAPH', korName: '보이드 세라프' },
  // 신규 보스 4종 (PNG 없으면 하이브 퀸 벡터로 폴백, 공격 패턴은 balance.bossPatterns)
  { id: 'B12', name: 'PRISM TYRANT', korName: '프리즘 타이런트' },
  { id: 'B13', name: 'TIDAL LEVIATHAN', korName: '타이달 리바이어던' },
  { id: 'B14', name: 'STORMBRINGER', korName: '스톰브링어' },
  { id: 'B15', name: 'OPTIC WARDEN', korName: '옵틱 워든' },
  // 상호작용형 보스 (NEON ADAPTATION Phase 2). 전용 Canvas 폴백 외형 — B7 이미지 재사용 안 함.
  { id: 'B22', name: 'NEON ARBITER', korName: '네온 아비터' },
];
export function bossDefFor(stage) {
  return BOSS_ROSTER[(Math.max(1, stage) - 1) % BOSS_ROSTER.length];
}
/** 보스 ID로 정의 조회 (캠페인 보스 순서용, 지시서 §6.2). 없으면 하이브 퀸 폴백. */
export function bossDefById(id) {
  return BOSS_ROSTER.find((b) => b.id === id) || BOSS_ROSTER[0];
}

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
  // 기함은 원본 종횡비가 다르므로 폭이 아닌 긴 변 기준이다. 면적과 긴 변이 H0→H5 단조 증가한다.
  A1: 34, A2: 50, A3: 68, A4: 88, A5: 112, A6: 140,
  B1: 150, B2: 165, B3: 185,                   // 샤드/리퍼/브루드(크리처 small/mid/large) — 위→아래 하강 적 너무 작아 안 보임 → small 5배 확대(순서 유지, 이사)
  B4: 46, B5: 46, B6: 96,                      // 저격/포탑/위버 — 위버(우→좌 횡단) 2배 확대(48→96, 이사)
  B7: 190, B8: 150, B9: 150, B10: 150, B11: 150, // 하이브 퀸은 단일 최종 보스로 더 크게 표시
  B12: 150, B13: 150, B14: 150, B15: 150,      // 신규 보스 4종
  B22: 190,
  B16: 46, B17: 50, B18: 46, B19: 48, B20: 52, B21: 48, // 신규 일반 적 6종 — 전격/궤도/점멸 확대(작아서 안 보임, 이사)
  C1: 56, C2: 30, C3: 34, C4: 46, C5: 56,      // 크리스탈/캡슐/파워/운석/보급수송선
  H2_BASE_FRAME: 68, H2_ASSAULT: 68, H2_CARRIER: 68,
  MOUNT_VULCAN_BASE: 42, MOUNT_VULCAN_NEEDLE: 42, MOUNT_VULCAN_STORM: 42,
  MOUNT_LASER_BASE: 42, MOUNT_LASER_CUTTER: 42, MOUNT_LASER_PRISM: 42,
  MOUNT_HOMING_BASE: 42, MOUNT_HOMING_WASP: 42, MOUNT_HOMING_SIEGE: 42,
  PROJ_VULCAN_BASE: 32, PROJ_VULCAN_NEEDLE: 34, PROJ_VULCAN_STORM: 32,
  PROJ_LASER_BASE: 40, PROJ_LASER_CUTTER: 40, PROJ_LASER_PRISM: 40,
  PROJ_HOMING_BASE: 30, PROJ_HOMING_WASP: 30, PROJ_HOMING_SIEGE: 34,
  B22_CHASSIS: 190, B22_RING: 190, B22_ARM_LEFT: 190, B22_ARM_RIGHT: 190, B22_CORE: 190, B22_CRACK: 190,
  B7_BODY: 190, B7_EGG_LEFT: 190, B7_EGG_RIGHT: 190, B7_CROWN: 190, B7_HEART: 190,
  B7_ESCAPE: 76, B7_DEBRIS: 190,
  VFX_CORE: 150, VFX_ARMOR: 160, VFX_WEAPON: 140, VFX_TIER: 180, VFX_BOSS_BREAK: 190,
};

// 구 A{티어}{무기} 완성 함선은 새 조립식 체계에서 사용하지 않는다.
// 파일은 보존하되 로더 등록을 제거해 불필요한 18개 요청을 막는다.
for (const id of ['B12', 'B13', 'B14', 'B15', 'B16', 'B17', 'B18', 'B19', 'B20', 'B21']) {
  if (!RASTER_ART.C[id]) RASTER_ART.C[id] = `assets/styleC/${id}.png`;
}

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

export function preloadSprites(ids, style = artStyle) {
  return Promise.all(ids.map((id) => loadSprite(id, style, SPRITE_SIZES[id] || 64)));
}

const CORE_PRELOAD = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'C1', 'C2', 'C3', 'C4', 'C5',
  'B16', 'B17', 'B18', 'B19', 'B20', 'B21',
  'H2_BASE_FRAME', 'H2_ASSAULT', 'H2_CARRIER',
  ...Object.keys(SPRITE_SIZES).filter((id) => id.startsWith('MOUNT_') || id.startsWith('PROJ_') || id.startsWith('VFX_')),
];

/** 타이틀에서는 전투 공통 자산만 로드한다. 보스 레이어는 등장 예고 시 별도 지연 로드한다. */
export function preloadStyle(style = artStyle) {
  return preloadSprites(CORE_PRELOAD, style);
}

export function preloadBossArt(id, style = artStyle) {
  // Gate 0 §11: B22/B7은 단일 베이스(remodel-v2) + 파괴 VFX만 렌더한다.
  // 구형 부품 레이어(chassis/ring/arm/core/crack, body/egg/crown/heart/debris)는
  // 더 이상 합성하지 않으므로 프리로드에서 제외한다. B7_ESCAPE만 4단계 전용으로 유지.
  const ids = id === 'B22'
    ? ['B22', 'VFX_BOSS_BREAK']
    : id === 'B7'
      ? ['B7', 'B7_ESCAPE', 'VFX_BOSS_BREAK']
      : [id];
  return preloadSprites(ids, style);
}
