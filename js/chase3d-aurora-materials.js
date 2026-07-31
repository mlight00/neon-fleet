// ── AURORA 절차적 PBR 재질 (Opus5 §7) — 결정적 CPU TextureForge + Three.js r160 재질 세트 ──
//  포지는 순수 typed-array(브라우저·Node 동일 결과 → 픽셀 해시 테스트 가능). Math.random 금지 — mulberry32(seed).
//  채널 계약: albedo(sRGB) / normal(OpenGL +Y, linear) / ORM(r=AO, g=roughness, b=metalness, linear) / emissive(sRGB).
//  Nyquist 규율(참고사례): 노이즈 최소 파장 ≥ 6texel — "근접 사포·원거리 무텍스처" 방지.
//  UV: armorTop/under/gold/dark/panel = 선체 평면(plan) 공간(u=x/전폭+0.5, v=zFrac) → A4 배치 그대로 프레임·패널 도장.
import { mulberry32, samplePlanform } from './chase3d-aurora-geometry.js';

// A4 실측 팔레트(2026-07-30 추출 + 육안 보정)
export const PAL = {
  ivory: [207, 198, 186], ivoryHi: [222, 214, 203], ivoryLo: [176, 167, 155],
  frame: [58, 53, 46], frameDeep: [38, 34, 29],
  gold: [201, 155, 74], goldHi: [232, 192, 106], goldLo: [138, 106, 42],
  dark: [30, 29, 29], teal: [1, 182, 240], core: [254, 253, 253],
  under: [122, 116, 108], side: [156, 148, 138],
};

// ── 시드 격자 값-노이즈 + fbm(파장 하한 6texel) ──
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512); const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const hash = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;
  const sm = (t) => t * t * (3 - 2 * t);
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(noise, x, y, oct, base) {
  let s = 0, amp = 0.5, f = base;
  for (let o = 0; o < oct; o++) { s += amp * noise(x * f, y * f); amp *= 0.5; f *= 2; }
  return s;
}

/**
 * 결정적 텍스처 포지(순수). 반환 맵은 RGBA Uint8Array.
 * @returns { armorTop, armorSide, under, gold, dark } 각 { albedo, normal, orm, emissive, w, h }
 */
export function forgeAuroraTextures({ seed = 7, size = 512 } = {}) {
  const out = {};
  out.armorTop = forgePlan(seed, size, 'top');
  out.under = forgePlan(seed + 11, size >> 1, 'under');
  out.armorSide = forgeRibs(seed + 23, size >> 1);
  out.gold = forgeGold(seed + 31, size >> 1);
  out.dark = forgeDark(seed + 47, size >> 1);
  return out;
}

// 평면(plan) 공간 장갑 도장: 플레이트 그리드 + 외곽 다크 프레임 + 심 그루브 + 그라임
function forgePlan(seed, S, kind) {
  const N = makeNoise(seed);
  const albedo = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4), emis = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  const base = kind === 'top' ? PAL.ivory : PAL.under;
  const minWave = 6;                        // Nyquist: 최소 파장 6texel
  const cellsMax = Math.max(4, S / minWave);
  const plateW = 0.19, plateH = 0.088;      // 큰 플레이트(A4 상판 스케일) — 타일 과밀 방지
  for (let r = 0; r < S; r++) {
    const v = (r + 0.5) / S;                // zFrac
    const pf = samplePlanform(Math.min(0.999, v));
    for (let c = 0; c < S; c++) {
      const u = (c + 0.5) / S;
      const hx = Math.abs(u - 0.5) * 2;     // 반폭 정규 x
      const i4 = (r * S + c) * 4, i1 = r * S + c;
      // 플레이트 인덱스(벽돌 오프셋·미러 대칭) + 지터
      const py = Math.floor(v / plateH);
      const bx = hx + (py % 2) * plateW * 0.5;
      const px = Math.floor(bx / plateW);
      const jitter = (N(px * 13.7 + 1, py * 7.3 + 2) - 0.5) * (kind === 'top' ? 0.10 : 0.07);
      // 심(플레이트 경계) 그루브 — 주 심 + 절반 간격 보조 심(약)
      const fx = (bx / plateW) % 1, fy = (v / plateH) % 1;
      const seam = Math.min(fx, 1 - fx, fy, 1 - fy);
      const sub = Math.min(Math.abs(fx - 0.5), Math.abs(fy - 0.5));
      const seamK = Math.max(0, 1 - seam / 0.032) + Math.max(0, 1 - sub / 0.02) * 0.3;
      // 외곽 프레임 밴드: 실루엣 경계 안쪽 — 폭은 지역 외곽에 비례(좁은 노즈가 통째로 검어지지 않게)
      const bandW = Math.min(0.042, pf.outline * 0.22);
      const edge = pf.outline - hx;
      const frameK = edge < bandW * 1.6 ? Math.max(0, 1 - Math.abs(edge - bandW * 0.55) / bandW) : 0;
      // 선체·주익 경계(어깨) 프레임 라인
      const shoulder = Math.abs(hx - pf.hull) < 0.018 && pf.outline - pf.hull > 0.04 ? 1 : 0;
      const grime = Math.max(0, fbm(N, u * cellsMax * 0.18, v * cellsMax * 0.18, 3, 1) - 0.62) * 1.7;
      const micro = (fbm(N, u * cellsMax * 0.9, v * cellsMax * 0.9, 2, 1) - 0.5) * 0.05;
      let rr = base[0], gg = base[1], bb = base[2];
      const mul = 1 + jitter + micro - grime * 0.16 - Math.min(1, seamK) * 0.075;
      rr *= mul; gg *= mul; bb *= mul;
      const fk = Math.max(frameK, shoulder * 0.9);
      rr = rr + (PAL.frame[0] - rr) * fk; gg = gg + (PAL.frame[1] - gg) * fk; bb = bb + (PAL.frame[2] - bb) * fk;
      albedo[i4] = rr; albedo[i4 + 1] = gg; albedo[i4 + 2] = bb; albedo[i4 + 3] = 255;
      height[i1] = -seamK * 0.7 - fk * 0.5 + jitter * 0.6 + micro * 2;
      const ao = 1 - seamK * 0.35 - fk * 0.25 - grime * 0.15;
      const rough = (kind === 'top' ? 0.58 : 0.66) + jitter * 0.5 + seamK * 0.14 + grime * 0.2;
      orm[i4] = Math.max(0, Math.min(255, ao * 255));
      orm[i4 + 1] = Math.max(25, Math.min(255, rough * 255));
      orm[i4 + 2] = kind === 'top' ? 66 : 92;    // metalness 0.26 / 0.36 (도장 금속)
      orm[i4 + 3] = 255;
      emis[i4] = 0; emis[i4 + 1] = 0; emis[i4 + 2] = 0; emis[i4 + 3] = 255;
    }
  }
  return { albedo, normal: normalFromHeight(height, S, 2.2), orm, emissive: emis, w: S, h: S };
}
// 측벽: 수평 리브(구조 프레임 띠)
function forgeRibs(seed, S) {
  const N = makeNoise(seed);
  const albedo = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    const v = (r + 0.5) / S, u = (c + 0.5) / S;
    const i4 = (r * S + c) * 4, i1 = r * S + c;
    const rib = Math.abs(((v * 26) % 1) - 0.5) < 0.16 ? 1 : 0;
    const jit = (N(u * 9, v * 40) - 0.5) * 0.10;
    const baseC = PAL.side;
    let k = 1 + jit - rib * 0.28;
    albedo[i4] = baseC[0] * k; albedo[i4 + 1] = baseC[1] * k; albedo[i4 + 2] = baseC[2] * k; albedo[i4 + 3] = 255;
    height[i1] = -rib * 0.8 + jit;
    orm[i4] = 255 * (1 - rib * 0.3); orm[i4 + 1] = 150 + jit * 200; orm[i4 + 2] = 120; orm[i4 + 3] = 255;
  }
  return { albedo, normal: normalFromHeight(height, S, 2.0), orm, emissive: null, w: S, h: S };
}
// 금색: 브러시드 스트릭(진행방향) + 세그먼트 밴드
function forgeGold(seed, S) {
  const N = makeNoise(seed);
  const albedo = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4), emis = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    const v = (r + 0.5) / S, u = (c + 0.5) / S;
    const i4 = (r * S + c) * 4, i1 = r * S + c;
    const streak = (N(u * 60, v * 6) - 0.5) * 0.12;                       // 세로 브러시
    const seg = Math.abs(((v * 34) % 1) - 0.5) < 0.07 ? 1 : 0;           // 척추 세그먼트 조인트
    const k = 1 + streak - seg * 0.22;
    albedo[i4] = PAL.gold[0] * k; albedo[i4 + 1] = PAL.gold[1] * k; albedo[i4 + 2] = PAL.gold[2] * k; albedo[i4 + 3] = 255;
    height[i1] = streak * 0.8 - seg * 0.6;
    orm[i4] = 255 * (1 - seg * 0.25); orm[i4 + 1] = 78 + streak * 220 + seg * 40; orm[i4 + 2] = 242; orm[i4 + 3] = 255;
    emis[i4] = PAL.goldLo[0] * 0.25; emis[i4 + 1] = PAL.goldLo[1] * 0.25; emis[i4 + 2] = PAL.goldLo[2] * 0.25; emis[i4 + 3] = 255;
  }
  return { albedo, normal: normalFromHeight(height, S, 1.6), orm, emissive: emis, w: S, h: S };
}
// 다크 구조: 근검정 금속 + 마모 하이라이트
function forgeDark(seed, S) {
  const N = makeNoise(seed);
  const albedo = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    const v = (r + 0.5) / S, u = (c + 0.5) / S;
    const i4 = (r * S + c) * 4, i1 = r * S + c;
    const n = fbm(N, u * 22, v * 22, 3, 1);
    const wear = Math.max(0, n - 0.66) * 2.2;
    const k = 1 + (n - 0.5) * 0.18 + wear * 0.5;
    albedo[i4] = Math.min(255, PAL.dark[0] * k + wear * 26);
    albedo[i4 + 1] = Math.min(255, PAL.dark[1] * k + wear * 24);
    albedo[i4 + 2] = Math.min(255, PAL.dark[2] * k + wear * 22);
    albedo[i4 + 3] = 255;
    height[i1] = (n - 0.5) * 0.6;
    orm[i4] = 235; orm[i4 + 1] = 118 + (n - 0.5) * 120 - wear * 50; orm[i4 + 2] = 205; orm[i4 + 3] = 255;
  }
  return { albedo, normal: normalFromHeight(height, S, 1.4), orm, emissive: null, w: S, h: S };
}
// 높이 → OpenGL 노멀(+Y up), 강도 상수
export function normalFromHeight(h, S, strength) {
  const nrm = new Uint8Array(S * S * 4);
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const inv = 1 / Math.hypot(dx, dy, 1);
    const i4 = (y * S + x) * 4;
    nrm[i4] = (-dx * inv * 0.5 + 0.5) * 255;
    nrm[i4 + 1] = (dy * inv * 0.5 + 0.5) * 255;   // v가 zFrac(노즈→함미)이라 +Y 유지
    nrm[i4 + 2] = (inv * 0.5 + 0.5) * 255;
    nrm[i4 + 3] = 255;
  }
  return nrm;
}
// 절차적 환경맵(equirect 64×32, 순수) — 금속이 검게 죽는 문제 해결(무IBL 금속=흑색).
//  우주 톤: 상부 차가운 남색, 수평선 옅은 청록, 하부 근흑 + 웜 키 블롭 1개. 시드 고정.
export function forgeEnvEquirect(seed = 7) {
  const W = 64, H = 32, d = new Uint8Array(W * H * 4);
  const N = makeNoise(seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = y / (H - 1), u = x / (W - 1);
    const i4 = (y * W + x) * 4;
    // 세로 그라데이션(위=밝은 남색 하늘, 아래=근흑)
    let r = 30 + (1 - v) * 44, g = 40 + (1 - v) * 62, b = 62 + (1 - v) * 108;
    // 수평선 청록 띠(절제 — 장갑이 청록으로 물들지 않게)
    const hz = Math.exp(-Math.pow((v - 0.55) / 0.10, 2));
    r += hz * 6; g += hz * 22; b += hz * 30;
    // 웜 키 블롭(태양 대용) — 좌상
    const kb = Math.exp(-((u - 0.30) * (u - 0.30) * 42 + (v - 0.22) * (v - 0.22) * 60));
    r += kb * 165; g += kb * 132; b += kb * 78;
    const n = (N(u * 10, v * 10) - 0.5) * 6;
    d[i4] = Math.max(0, Math.min(255, r + n));
    d[i4 + 1] = Math.max(0, Math.min(255, g + n));
    d[i4 + 2] = Math.max(0, Math.min(255, b + n));
    d[i4 + 3] = 255;
  }
  return { data: d, w: W, h: H };
}

// 결정성 검증용 픽셀 해시(FNV-1a)
export function hashPixels(arr) {
  let h = 0x811c9dc5;
  for (let i = 0; i < arr.length; i += 7) { h ^= arr[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

// ── THREE 재질 세트 ──
export function createAuroraMaterials(THREE, { seed = 7, mobile = false } = {}) {
  const size = mobile ? 256 : 512;
  const forged = forgeAuroraTextures({ seed, size });
  const textures = [];
  const mk = (f, { srgb = false } = {}) => {
    if (!f) return null;
    const t = new THREE.DataTexture(f.data, f.w, f.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.channel = 0;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    textures.push(t);
    return t;
  };
  const setFor = (f) => ({
    map: mk({ data: f.albedo, w: f.w, h: f.h }, { srgb: true }),
    normal: mk({ data: f.normal, w: f.w, h: f.h }),
    orm: mk({ data: f.orm, w: f.w, h: f.h }),
    emis: f.emissive ? mk({ data: f.emissive, w: f.w, h: f.h }, { srgb: true }) : null,
  });
  const std = (f, opts = {}) => {
    const s = setFor(f);
    const m = new THREE.MeshStandardMaterial({
      map: s.map, normalMap: s.normal, normalScale: new THREE.Vector2(0.9, 0.9),
      aoMap: s.orm, roughnessMap: s.orm, metalnessMap: s.orm,
      roughness: 1, metalness: 1, aoMapIntensity: 1,
      emissiveMap: s.emis || null, emissive: s.emis ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), emissiveIntensity: s.emis ? 1 : 0,
      ...opts,
    });
    return m;
  };
  const mats = {
    armorTop: std(forged.armorTop, { envMapIntensity: 0.35 }),
    armorSide: std(forged.armorSide, { envMapIntensity: 0.4 }),
    under: std(forged.under, { envMapIntensity: 0.35 }),
    gold: std(forged.gold, { envMapIntensity: 1.05 }),
    dark: std(forged.dark, { envMapIntensity: 0.65 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x17161a, metalness: 0.55, roughness: 0.42, envMapIntensity: 0.6 }),
    core: new THREE.MeshStandardMaterial({ color: 0xf2fbff, metalness: 0.1, roughness: 0.25, emissive: 0xbfeaff, emissiveIntensity: 2.0 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x022530, metalness: 0.1, roughness: 0.3, emissive: 0x01b6f0, emissiveIntensity: 2.4 }),
  };
  const materials = Object.values(mats);
  let textureBytes = 0;
  for (const t of textures) textureBytes += t.image.data.length * 1.333;   // +mips 근사
  return {
    mats, textures, textureBytes: Math.round(textureBytes),
    dispose() { for (const t of textures) t.dispose(); for (const m of materials) m.dispose(); },
  };
}
export default { forgeAuroraTextures, createAuroraMaterials, normalFromHeight, hashPixels, PAL };
