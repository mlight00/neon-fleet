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
  //  §G-28 P0-3 초진화 2종. 3D 는 발광 파트를 런타임 색으로 물들여 초진화색을 자동 표현하는데
  //  2D 는 3종 고정이라 템페스트·랜스에서 색이 어긋났다 → 전용 스프라이트로 맞춘다.
  //  색은 제작기가 `EVO_PROJECTILE_COLOR` 를 직접 읽어 굽고, G28-EVOCOLOR 가 이미지↔상수를 대조한다.
  PROJ_VULCAN_TEMPEST: 'assets/art2-webp/weapons/projectiles/nf2_proj_vulcan_tempest.webp',
  PROJ_VULCAN_LANCE: 'assets/art2-webp/weapons/projectiles/nf2_proj_vulcan_lance.webp',
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
    C2: 'assets/styleC/C2.png',   // 캡슐(레거시 — 현 모드에서는 스폰되지 않는다)
    // §G-26 위험물·픽업 8종 = 이사 VARCO 실모델(h1~h4·p1~p4)을 게임 시점으로 렌더해 만든 스프라이트.
    //  2D 가 잔해·돌격기·기뢰·코인·파워를 코드 도형으로 그려 3D 와 전혀 다른 물체로 보였다 → 같은 모델로 통일.
    //  아래 4개는 기존 ID 를 **덮어써** 벡터/구 PNG 대신 실모델 렌더를 쓰게 한다(draw 코드는 그대로).
    C1: 'assets/art2-webp/props/nf2_prop_p1_crystal.webp',   // 크리스탈
    C3: 'assets/art2-webp/props/nf2_prop_p4_pow.webp',       // 파워업
    C4: 'assets/art2-webp/props/nf2_prop_h1_meteor.webp',    // 운석
    C5: 'assets/art2-webp/props/nf2_prop_p2_pod.webp',       // 보급 수송선
    //  아래 4개는 2D 에 스프라이트가 아예 없던 종 — ID 신설.
    PROP_COIN: 'assets/art2-webp/props/nf2_prop_p3_coin.webp',
    PROP_DEBRIS: 'assets/art2-webp/props/nf2_prop_h2_debris.webp',
    PROP_CHARGER: 'assets/art2-webp/props/nf2_prop_h3_charger.webp',
    PROP_MINE: 'assets/art2-webp/props/nf2_prop_h4_mine.webp',
    // 섹터 클리어 컷신 배경(전체화면 일러스트). 파일이 없으면 getSprite가 null → 인게임 연출로 자동 폴백.
    CUT_SECTOR_CLEAR: 'assets/art2-webp/story/nf2_cut_sector_clear.webp',
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

//  §G-35 P0-6(Codex 6차 §5): `BG_ART` / `getBackground()` / `loadBackground()` **삭제**.
//   `assets/styleC/bg1~3.png` 를 참조했지만 **호출부가 한 곳도 없었다**(전 소스 검색 0건).
//   빌드 자동수집이 이 경로를 못 봐서 dist 에 없었고, 코드를 다시 연결하면 즉시 404 가 났을 것이다.
//   ⚠️무작정 빌드에 넣으면 약 0.803MiB 가 늘어 49.467 → 50.270MiB 로 **50MiB 게이트를 넘는다.**
//   → 미사용 코드이므로 참조 자체를 제거하는 쪽이 맞다(Codex 판단과 동일).
//   배경이 다시 필요해지면 그때 `ASSET_FAMILIES` 에 선언형으로 등록하고 되살린다.

// 에셋별 인게임 크기(px, 논리 좌표) — viewBox 100 기준 전체가 이 크기로 스케일된다
export const SPRITE_SIZES = {
  CUT_SECTOR_CLEAR: 800,   // 섹터 클리어 컷신 배경 — 전체화면이라 긴 변(세로)을 캔버스 높이 이상으로
  // 기함은 원본 종횡비가 다르므로 폭이 아닌 긴 변 기준이다. 면적과 긴 변이 H0→H5 단조 증가한다.
  A1: 34, A2: 50, A3: 68, A4: 88, A5: 112, A6: 140,
  B1: 150, B2: 165, B3: 185,                   // 샤드/리퍼/브루드(크리처 small/mid/large) — 위→아래 하강 적 너무 작아 안 보임 → small 5배 확대(순서 유지, 이사)
  B4: 96, B5: 96, B6: 96,                      // 저격/포탑/위버 — 슈터 전반 위버 수준으로 통일 확대(지역2~6이 크리처보다 훨씬 작아 안 보임, 이사)
  B7: 380, B8: 340, B9: 340, B10: 340, B11: 340, // 보스는 편대(기함+순양함+드론) 전체보다 크게 — 위압감(이사). 하이브퀸 최종 최대
  B12: 340, B13: 340, B14: 340, B15: 340,      // 신규 보스 4종 — 위압감 확대
  B22: 380,
  B16: 92, B17: 96, B18: 92, B19: 96, B20: 96, B21: 92, // 신규 일반 적 6종(봄버/전격/궤도/방패/모선/점멸) — 슈터 전반 통일 확대(이사)
  C1: 56, C2: 30, C3: 36, C4: 48, C5: 56,      // 크리스탈/캡슐/파워/운석/보급수송선(§G-26 실모델 — 발광 여백만큼 +2)
  //  §G-26 신설. 논리 긴 변 = 개체 반경×2 + 발광 여백. 반경은 balance.js 가 진실이다.
  //   코인 r 10~19 / 잔해 rBig 44 / 돌격기 r 24(세로로 긴 쐐기) / 기뢰 r 13(가시 포함)
  PROP_COIN: 30, PROP_DEBRIS: 96, PROP_CHARGER: 60, PROP_MINE: 36,
  H2_BASE_FRAME: 68, H2_ASSAULT: 68, H2_CARRIER: 68,
  MOUNT_VULCAN_BASE: 42, MOUNT_VULCAN_NEEDLE: 42, MOUNT_VULCAN_STORM: 42,
  MOUNT_LASER_BASE: 42, MOUNT_LASER_CUTTER: 42, MOUNT_LASER_PRISM: 42,
  MOUNT_HOMING_BASE: 42, MOUNT_HOMING_WASP: 42, MOUNT_HOMING_SIEGE: 42,
  PROJ_VULCAN_BASE: 32, PROJ_VULCAN_NEEDLE: 34, PROJ_VULCAN_STORM: 32,
  PROJ_VULCAN_TEMPEST: 32, PROJ_VULCAN_LANCE: 34,   // §G-28 P0-3 (광역=storm 급 / 관통=needle 급)
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

//  §G-38: 선로딩을 **2파로 나눈다.**
//
//  왜: 예전엔 43개를 `Promise.all` 로 한꺼번에 던졌다. 브라우저는 호스트당 6개만 동시에 받으므로
//  나머지는 **큐에서 대기**한다. 그 결과 픽업 크리스탈(4.5KB)이 **1,618ms** 걸렸다 —
//  전송 시간이 아니라 순번 대기다. 그 사이에 출격하면 스프라이트가 없어 폴백(코드 도형)이 그려지고,
//  이사님이 "시작할 때 5각형 크리스탈"로 보신 것이 정확히 이 상태다.
//
//  → 출격 직후 **몇 초 안에 화면에 뜨는 것**을 1파로 먼저 받는다(6슬롯을 이들이 쓴다).
//    1파가 끝난 뒤 2파를 받는다. 총 로드량은 같고 순서만 바뀐다.
//  ⚠️게임 로직·스폰·밸런스는 건드리지 않는다. 이건 **받는 순서**만의 문제다.

/** 출격 직후 **몇 초 안에** 반드시 필요한 최소 집합.
 *  index.html 이 `<link rel="preload">` 로 HTML 파싱 단계에서 직접 받는다 —
 *  JS 가 요청하는 것보다 빠르고 우선순위도 높다. 그래서 여기는 **작게 유지**한다(6개).
 *  ⚠️여기에 많이 넣으면 preload 끼리 슬롯을 다퉈 효과가 사라진다. */
export const INSTANT_ART = [
  'H2_BASE_FRAME',                                        // 2D 기함 선체 — 출격 순간부터 화면에 있다
  //  §G-41(이사님 제보 2026-08-13): "레이저 무기 선택하고 출격하면 레이저가 예전 형태로 나온다".
  //   §G-38 에서 이 목록에 **발사체를 빠뜨렸다.** 출격하면 바로 쏘는데 정작 탄 아트가 없었다.
  //   실측: 크리스탈(preload 걸림) 664ms 완료 vs 레이저 볼트 **7,199ms** — 그 사이 폴백 도형이 그려진다.
  //   시작 무기 3종의 **기본 볼트만** 넣는다(진화형은 나중에 얻으므로 2파로 충분).
  'PROJ_VULCAN_BASE', 'PROJ_LASER_BASE', 'PROJ_HOMING_BASE',
  'C1', 'C5',                                             // 픽업(크리스탈) · 보급 수송선
  //  ⚠️A1~A3(적)은 여기서 뺐다 — preload 는 6개 안팎을 넘으면 서로 슬롯을 다퉈 효과가 사라진다.
  //   적은 출격 직후 몇 초 뒤에 나오지만 발사체는 **첫 프레임부터** 나온다. 우선순위가 다르다.
  //   적은 1파(FIRST_CONTACT)에 그대로 있어 곧바로 이어서 받는다.
];

/** 1파 — 출격 직후 즉시 보이는 것: 기함 선체·무기 마운트·아군 발사체·초기 적·픽업. */
const FIRST_CONTACT = [
  'H2_BASE_FRAME',                       // 2D 기함 선체 — 출격 순간부터 화면에 있다
  'A1', 'A2', 'A3',                      // 섹터 1 초반 적
  'C1', 'C5',                            // 픽업(크리스탈) · 보급 수송선 ← 이번 제보 대상
  ...Object.keys(SPRITE_SIZES).filter((id) => id.startsWith('MOUNT_') || id.startsWith('PROJ_')),
];

/** 2파 — 조금 뒤에 등장하는 것. 1파가 끝난 뒤 받는다. */
const REST_PRELOAD = [
  'A4', 'A5', 'A6',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'C2', 'C3', 'C4',
  'B16', 'B17', 'B18', 'B19', 'B20', 'B21',
  'H2_ASSAULT', 'H2_CARRIER',
  //  §G-26: PROP_ 도 선로딩에 포함해야 한다 — 위험물·픽업은 전투 중 갑자기 나타나므로
  //  그때 로드하면 첫 개체가 폴백(코드 도형)으로 한 번 그려졌다가 바뀐다.
  ...Object.keys(SPRITE_SIZES).filter((id) => id.startsWith('VFX_') || id.startsWith('PROP_')),
];

/** 두 파를 합친 전체 — 커버리지 테스트가 "빠진 id 가 없는지" 볼 때 쓴다. */
const CORE_PRELOAD = [...FIRST_CONTACT, ...REST_PRELOAD];

/** 스프라이트 캐시 비우기 — SPRITE_SIZES를 바꾼 뒤 다시 로드해야 새 크기로 그려진다(밸런스 튜너). */
export function invalidateSpriteCache() {
  cache.clear();
}

/** 타이틀에서는 전투 공통 자산만 로드한다. 보스 레이어는 등장 예고 시 별도 지연 로드한다.
 *  1파(즉시 보이는 것) → 2파 순서로 받는다. 반환 Promise 는 **둘 다** 끝나야 resolve 된다. */
export function preloadStyle(style = artStyle) {
  return preloadSprites(FIRST_CONTACT, style)
    .then((first) => preloadSprites(REST_PRELOAD, style).then((rest) => [...first, ...rest]));
}

/** 1파만 기다리고 싶을 때(출격 직전 확인용). 실패해도 게임을 막지 않는다 — 폴백 도형이 있다. */
export function preloadFirstContact(style = artStyle) {
  return preloadSprites(FIRST_CONTACT, style);
}

/** 선로딩 구성 조회 — 테스트가 목록을 **다시 적지 않고** 검증하기 위한 것. */
export function preloadWaves() {
  return { first: [...FIRST_CONTACT], rest: [...REST_PRELOAD], all: [...CORE_PRELOAD] };
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
