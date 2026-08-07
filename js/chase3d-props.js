// ── 함미 추적 3D 소품(이사: "각종 무기와 배지 3D") — 탄환·픽업·배지의 초경량 절차 지오메트리 ──
//  단순 형상(탄·보석·배지)이라 디지타이즈 없이 파라메트릭 프리미티브로 충분. 전 소품 공통 계약:
//   - 최대 치수(전장) 1.0 정규화 — placeSwarm 의 "화면 전장 px" 배치 파이프라인 그대로 재사용
//   - 종당 삼각형 ≤200(수십 개 인스턴스 전제), 재질은 공용 1개(자발광 basic + instanceColor 로 개체별 색)
//   - 결정적(난수 없음)·THREE 주입(Node 검증 가능)
import { mergeGeos } from './chase3d-aurora-geometry.js';
// 순수 상수는 chase3d-prop-defs.js 로 분리(Codex 재검토 P2 — 기본 URL 정적 로드 체인 절단). 여기서는 재수출만.
export { PROP_KEYS, PROP_CAPS, PROP_BASE_COLOR } from './chase3d-prop-defs.js';
import { PROP_KEYS } from './chase3d-prop-defs.js';

// ── §G-2(이사 승인 "이 방식으로"): 무기 발사체 3종은 원본 그림(nf2_proj_*.webp)을 그대로 입힌다 ──
//  형상 = 납작 방추 로프트(노즈 −z, 소품 placeSwarm 기본 yawBase π 계약과 일치), UV = (x,z)→그림 (u,v).
//  재질 = AdditiveBlending(2D 의 'lighter' 합성과 동일 감성 — 투명부는 가산 0 이라 알파 처리 불필요).
export const PROJ_TEX = {
  pbullet: { url: 'assets/art2-webp/weapons/projectiles/nf2_proj_vulcan_base.webp', aspect: 0.4469 },
  missile: { url: 'assets/art2-webp/weapons/projectiles/nf2_proj_homing_base.webp', aspect: 0.5125 },
  laser: { url: 'assets/art2-webp/weapons/projectiles/nf2_proj_laser_base.webp', aspect: 0.4094 },
};

/** 발사체 방추 로프트 — 반폭 프로파일 half(t), 전장 1.0(z −0.5 노즈 → +0.5 꼬리), planform UV. */
function loftProjectile(THREE, aspect, half, segs = 8, thRel = 0.30) {
  const N = 4;   // 단면 다이아 4점(납작) — 인스턴스 수십 발 전제 초경량
  const pos = [], idx = [], uv = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const z = -0.5 + t;
    const hw = Math.max(0.01, half(t)) * aspect * 0.5;
    const th = Math.max(0.006, hw * thRel * 2);
    const ring = [[hw, 0], [0, th], [-hw, 0], [0, -th]];
    for (let i = 0; i <= N; i++) {
      const [x, y] = ring[i % N];
      pos.push(x, y, z);
      uv.push(Math.min(1, Math.max(0, (x / aspect) * 0.97 + 0.5)), Math.min(1, Math.max(0, 0.5 - z)));   // 노즈(−z)=그림 상단(v=1)
    }
  }
  const C = N + 1;
  for (let s = 0; s < segs; s++) for (let i = 0; i < N; i++) { const a = s * C + i, b = a + 1, d = a + C, e = d + 1; idx.push(a, d, b, b, d, e); }
  const capAt = (s, front) => {
    const base = pos.length / 3;
    let cz = 0; for (let i = 0; i < N; i++) cz += pos[(s * C + i) * 3 + 2] / N;
    pos.push(0, 0, cz); uv.push(0.5, front ? 1 : 0);
    for (let i = 0; i < N; i++) { const a = s * C + i, b = s * C + ((i + 1) % N); if (front) idx.push(base, a, b); else idx.push(base, b, a); }
  };
  capAt(0, true); capAt(segs, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ── §G-3 재설계(이사 8/2: "2D 를 이어붙이지 말고 3D 디자인을 완전히 다시") ──
//  픽업은 그림 텍스처를 전면 폐기 — 크리처·AURORA 처럼 지오메트리(결정면·리브·챔퍼)와
//  재질(금속·발광)만으로 조형한다. 원본에서는 "색·정체성"만 계승(청록 보석·장갑 컨테이너·금화·노랑 배지).
//  구조 = 파트 목록(파트별 지오+재질) — renderer 가 파트마다 InstancedMesh 를 만들고
//  placeSwarm 은 sw.meshes 전체에 같은 행렬을 쓰므로 파트들이 한 몸처럼 움직인다.

/** 결정적 의사난수(시드 격자) — Math.random 금지 계약 준수. */
const jr = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/** 세로(y) 회전체 로프트 — prof=[[반경, t(0=위)]...], N각 단면 + 정점 지터(결정면) + 원통 UV(u=둘레, v=t). */
function latheY(THREE, prof, N = 8, jitter = 0, twist = 0) {
  const pos = [], uv = [], idx = [];
  for (let s = 0; s < prof.length; s++) {
    const [r, t] = prof[s];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2 + s * twist;
      const j = jitter && r > 0.01 ? 1 + (jr(s, i % N) - 0.5) * jitter : 1;
      pos.push(Math.cos(a) * r * j, 0.5 - t, Math.sin(a) * r * j);
      uv.push(i / N, 1 - t);
    }
  }
  const C = N + 1;
  for (let s = 0; s < prof.length - 1; s++) for (let i = 0; i < N; i++) { const a = s * C + i, b = a + 1, d = a + C, e = d + 1; idx.push(a, b, d, b, e, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ── 소품용 절차 텍스처 포지(크리처 파이프라인 축소판 — 표면 디테일이 "2000년대 초반 룩" 탈출의 핵심) ──
function mul32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function propNoise(seed) {
  const rnd = mul32(seed); const p = new Uint8Array(512);
  const b = new Uint8Array(256); for (let i = 0; i < 256; i++) b[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = b[i]; b[i] = b[j]; b[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = b[i & 255];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (X, Y) => p[(p[X & 255] + Y) & 255] / 255;
    const a = h(xi, yi), c = h(xi + 1, yi), d = h(xi, yi + 1), e = h(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (c - a) * u + (d - a) * v + (a - c - d + e) * u * v;
  };
}
const propFbm = (nz, x, y, oct = 4, f0 = 3) => { let s = 0, amp = 0.5, f = f0; for (let o = 0; o < oct; o++) { s += amp * nz(x * f, y * f); amp *= 0.5; f *= 2; } return s; };
function heightToNormal(h, S, k) {
  const n = new Uint8Array(S * S * 4);
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
    const inv = 1 / Math.hypot(dx, dy, 1), i4 = (y * S + x) * 4;
    n[i4] = (-dx * inv * 0.5 + 0.5) * 255; n[i4 + 1] = (dy * inv * 0.5 + 0.5) * 255; n[i4 + 2] = (inv * 0.5 + 0.5) * 255; n[i4 + 3] = 255;
  }
  return n;
}
/** 소품 텍스처 3종 세트(64×64, 결정적). kind: 'crystal' | 'armor' | 'coin' */
export function forgePropTex(kind, seed = 7, S = 64) {
  const nz = propNoise(seed + (kind === 'crystal' ? 11 : kind === 'coin' ? 23 : 5));
  const albedo = new Uint8Array(S * S * 4), emissive = new Uint8Array(S * S * 4), height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i4 = (y * S + x) * 4;
    if (kind === 'crystal') {
      // 보석 색 분산(이사): 파셋 u 방향 hue 시프트(아쿠아→틸→연보라) + 내부 결 + 중심 백열 그라데이션
      const vein = propFbm(nz, u * 2.2, v * 0.7, 4, 3);
      const centerGlow = Math.pow(Math.max(0, 1 - Math.abs(v - 0.5) * 2.1), 1.6);
      const g = Math.min(1, centerGlow * 0.95 + vein * 0.28);
      const hue = Math.sin(u * Math.PI * 2 + vein * 2.5) * 0.5 + 0.5;   // 0=아쿠아 → 1=연보라(둘레 따라 분산)
      albedo[i4] = 18 + hue * 36 + vein * 26; albedo[i4 + 1] = 96 - hue * 16 + vein * 56; albedo[i4 + 2] = 122 + hue * 30 + vein * 60; albedo[i4 + 3] = 255;
      emissive[i4] = 20 + g * 130 + hue * 24; emissive[i4 + 1] = 88 + g * 140 - hue * 14; emissive[i4 + 2] = 112 + g * 122 + hue * 18; emissive[i4 + 3] = 255;
      height[y * S + x] = vein;
    } else if (kind === 'armor') {
      // 팔각 패널 그리드(u 8분할·v 3밴드 홈) + 마모 노이즈 + 리벳 점
      const pu = Math.abs(((u * 8) % 1) - 0.5), pv = Math.abs(((v * 3) % 1) - 0.5);
      const seam = Math.min(1, Math.max(0, (0.5 - Math.min(pu, pv)) * 14));   // 패널 경계 어두운 홈
      const wear = propFbm(nz, u, v, 4, 5);
      const rivet = (pu < 0.045 && ((v * 16) % 1) < 0.10) ? 1 : 0;
      const base = 118 + wear * 44 - seam * 34 + rivet * 48;   // 이사 "너무 어두워 안 보임" → 베이스 상향
      albedo[i4] = base * 0.92; albedo[i4 + 1] = base * 0.98; albedo[i4 + 2] = base * 1.02; albedo[i4 + 3] = 255;
      emissive[i4] = 16; emissive[i4 + 1] = 26; emissive[i4 + 2] = 34; emissive[i4 + 3] = 255;
      height[y * S + x] = wear * 0.5 - seam * 0.8 + rivet * 0.9;
    } else if (kind === 'cargo') {
      // 밝은 우주 화물 컨테이너(이사 "구속구 같다" 재디자인): 흰 패널 + 중앙 주황 스트라이프 + 옅은 seam
      const pu = Math.abs(((u * 6) % 1) - 0.5);
      const seam = Math.min(1, Math.max(0, (0.5 - pu) * 10)) * 0.5 + (Math.abs(v - 0.5) > 0.44 ? 0.6 : 0);
      const wear = propFbm(nz, u, v, 3, 4);
      const stripe = Math.abs(v - 0.5) < 0.10 ? 1 : 0;   // 중앙 주황 밴드
      const base = 208 + wear * 26 - seam * 40;
      if (stripe) { albedo[i4] = 236; albedo[i4 + 1] = 128 + wear * 30; albedo[i4 + 2] = 38; }
      else { albedo[i4] = base * 0.99; albedo[i4 + 1] = base; albedo[i4 + 2] = base * 1.01; }
      albedo[i4 + 3] = 255;
      emissive[i4] = stripe ? 60 : 22; emissive[i4 + 1] = stripe ? 30 : 26; emissive[i4 + 2] = stripe ? 8 : 30; emissive[i4 + 3] = 255;
      height[y * S + x] = wear * 0.3 - seam * 0.7;
    } else {
      // 금화: 테두리 세레이션 링 + 중앙 원 문양 양각 + 브러시드 결
      const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
      const ang = Math.atan2(dy, dx);
      const serr = r > 0.86 && r < 1.0 ? (Math.sin(ang * 24) * 0.5 + 0.5) : 0;
      const emblem = r < 0.46 ? Math.pow(Math.max(0, Math.cos(r * 6.8)), 0.7) : 0;
      const ring = (r > 0.55 && r < 0.64) ? 1 : 0;
      const brush = propFbm(nz, u * 0.6, v * 6, 3, 4) * 0.3;
      const lum = 205 + emblem * 40 + ring * 18 + serr * 22 + brush * 22;   // 이사 "너무 어둡다" → 밝은 금
      albedo[i4] = Math.min(255, lum * 1.04); albedo[i4 + 1] = Math.min(255, lum * 0.86); albedo[i4 + 2] = lum * 0.38; albedo[i4 + 3] = 255;
      emissive[i4] = 66 + emblem * 60; emissive[i4 + 1] = 48 + emblem * 44; emissive[i4 + 2] = 12; emissive[i4 + 3] = 255;
      height[y * S + x] = emblem * 0.9 + ring * 0.6 + serr * 0.7 + brush * 0.2;
    }
  }
  return { albedo, emissive, normal: heightToNormal(height, S, kind === 'crystal' ? 1.4 : 2.4), w: S, h: S };
}
function texOf(THREE, data, S, srgb = true) {
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}

/**
 * 픽업 파트 팩토리 — [{ geo, mat }...]. 전 파트 통합 bbox 로 전장 1.0 정규화(상대 위치 보존).
 * 전부 flatShading 조형 + 발광 코어 — 그림 텍스처 없음.
 */
/**
 * §G-4 적 발사체(이사 승인 자유 디자인) — 플라즈마 탄 3파트: 백열 코어 + 반투명 화염 외피 + 꼬리 불꽃.
 * 전 파트 color 흰색 — placeSwarm 의 instanceColor(적 종별 탄색 틴트)가 그대로 물든다.
 */
export function createEnemyBulletParts(THREE) {
  const parts = [];
  const core = new THREE.SphereGeometry(0.22, 8, 6);
  parts.push({ geo: core, mat: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) });
  const shell = new THREE.SphereGeometry(0.34, 10, 7); shell.scale(1, 1, 1.35);
  parts.push({ geo: shell, mat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }) });
  const tail = new THREE.ConeGeometry(0.18, 0.55, 7); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, 0.46);
  parts.push({ geo: tail, mat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }) });
  // 전장 1.0 정규화(파트 통합 bbox)
  let span = 0;
  for (const p of parts) { p.geo.computeBoundingBox(); const bb = p.geo.boundingBox; span = Math.max(span, bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z); }
  const k = 1 / (span || 1);
  for (const p of parts) p.geo.scale(k, k, k);
  return parts;
}

/** POW 텍스트 굽기(이사: 'POW' 가 잘 보이도록) — 밝은 노랑 바탕에 두꺼운 진갈색 글자+흰 테두리. */
function bakePowFace() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const grd = c.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
  grd.addColorStop(0, '#fff6c8'); grd.addColorStop(0.55, '#ffd23a'); grd.addColorStop(1, '#f59a1a');
  c.fillStyle = grd; c.fillRect(0, 0, S, S);
  c.font = `900 ${Math.round(S * 0.34)}px Arial, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = S * 0.07; c.strokeStyle = '#ffffff'; c.strokeText('POW', S / 2, S / 2 + S * 0.02);
  c.fillStyle = '#5a2e00'; c.fillText('POW', S / 2, S / 2 + S * 0.02);
  return cv;
}

export function createPickupParts(THREE, key) {
  const parts = [];
  if (key === 'crystal') {
    // 모던 크리스탈(이사 "최근 3D 크리스탈처럼"): 진짜 유리 굴절 — MeshPhysicalMaterial
    //  transmission(투과)+ior(굴절률 1.9)+attenuation(내부 청록 깊이)+clearcoat. 조사 근거: three 공식
    //  transmission 문서·Codrops 유리 튜토리얼(§보고서 링크). 셸(굴절)+백열 코어+가장자리 오라 3파트.
    const shell = latheY(THREE, [[0, 0.02], [0.17, 0.18], [0.23, 0.36], [0.23, 0.64], [0.17, 0.82], [0, 0.98]], 6, 0.10, 0.22);
    parts.push({
      geo: shell, mat: new THREE.MeshPhysicalMaterial({
        color: 0xd9f4ff, metalness: 0, roughness: 0.04, transmission: 1, ior: 1.9, thickness: 0.55,
        attenuationColor: new THREE.Color(0x2fd4ff), attenuationDistance: 0.65,
        clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 2.4, flatShading: true,
      }),
    });
    const core = latheY(THREE, [[0, 0.16], [0.06, 0.34], [0.08, 0.52], [0.05, 0.70], [0, 0.86]], 6, 0.2, 0.4);
    parts.push({ geo: core, mat: new THREE.MeshBasicMaterial({ color: 0xdffaff, toneMapped: false }) });
    const aura = latheY(THREE, [[0, 0.0], [0.19, 0.18], [0.255, 0.36], [0.255, 0.64], [0.19, 0.82], [0, 1.0]], 6, 0.10, 0.22);
    parts.push({ geo: aura, mat: new THREE.MeshBasicMaterial({ color: 0x35d8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, toneMapped: false }) });
  } else if (key === 'pod') {
    // 밝은 우주 화물 컨테이너(이사 "구속구 같다" 재디자인): 흰 캡슐 드럼 + 주황 스트라이프 + 발광 창 + 핸들
    const fx = forgePropTex('cargo');
    const shell = latheY(THREE, [[0.26, 0.02], [0.42, 0.10], [0.47, 0.28], [0.47, 0.72], [0.42, 0.90], [0.26, 0.98]], 12, 0, 0);
    shell.rotateX(Math.PI / 2);   // 부드러운 12각 캡슐 드럼(창살 리브 제거)
    const handleT = new THREE.BoxGeometry(0.30, 0.05, 0.08); handleT.translate(0, 0.50, 0);
    const handleB = handleT.clone(); handleB.translate(0, -1.0, 0);
    const hull = mergeGeos(THREE, [shell, handleT, handleB]);
    parts.push({
      geo: hull, mat: new THREE.MeshStandardMaterial({
        map: texOf(THREE, fx.albedo, fx.w), normalMap: texOf(THREE, fx.normal, fx.w, false), emissiveMap: texOf(THREE, fx.emissive, fx.w),
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.42, envMapIntensity: 0.8,
      }),
    });
    const winFrame = new THREE.CylinderGeometry(0.26, 0.26, 0.58, 12, 1, false); winFrame.rotateX(Math.PI / 2);
    parts.push({ geo: winFrame, mat: new THREE.MeshStandardMaterial({ color: 0xdfe8ee, metalness: 0.5, roughness: 0.35 }) });
    const win = new THREE.CylinderGeometry(0.20, 0.20, 0.60, 12, 1, false); win.rotateX(Math.PI / 2);
    parts.push({ geo: win, mat: new THREE.MeshBasicMaterial({ color: 0x49f2e4, toneMapped: false }) });
  } else if (key === 'coin') {
    // 밝은 금화(이사): 고휘도 금 + 강한 자체발광 — 어두운 환경에서도 반짝
    const fx = forgePropTex('coin');
    const body = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 24, 1, false); body.rotateX(Math.PI / 2);
    parts.push({
      geo: body, mat: new THREE.MeshStandardMaterial({
        map: texOf(THREE, fx.albedo, fx.w), normalMap: texOf(THREE, fx.normal, fx.w, false), emissiveMap: texOf(THREE, fx.emissive, fx.w),
        color: 0xffffff, emissive: 0xffdf7a, emissiveIntensity: 1.0, metalness: 0.75, roughness: 0.28, envMapIntensity: 0.9,
      }),
    });
  } else if (key === 'pow') {
    // POW 배지(이사 "먹으면 강해질 느낌 + POW 잘 보이게"): 스타버스트 링 + 텍스트 원판 + 후광
    const spikes = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sp = new THREE.ConeGeometry(0.09, 0.30, 4);
      sp.rotateZ(-Math.PI / 2); sp.rotateZ(a + Math.PI / 2);   // 콘 축을 방사 방향으로
      sp.translate(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
      spikes.push(sp);
    }
    const ringBase = new THREE.CylinderGeometry(0.36, 0.36, 0.16, 12, 1, false); ringBase.rotateX(Math.PI / 2);
    parts.push({ geo: mergeGeos(THREE, [ringBase, ...spikes]), mat: new THREE.MeshStandardMaterial({ color: 0xffc21e, metalness: 0.45, roughness: 0.28, envMapIntensity: 1.0, emissive: 0xff8a12, emissiveIntensity: 0.85, flatShading: true }) });
    let faceMat;
    if (typeof document !== 'undefined') {
      const t = new THREE.CanvasTexture(bakePowFace()); t.colorSpace = THREE.SRGBColorSpace;
      faceMat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    } else faceMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false });
    const face = new THREE.CylinderGeometry(0.30, 0.30, 0.19, 24, 1, false); face.rotateX(Math.PI / 2);
    parts.push({ geo: face, mat: faceMat });   // 앞뒤 캡의 원형 UV 에 'POW' 텍스트
    const halo = new THREE.CylinderGeometry(0.52, 0.52, 0.02, 24, 1, false); halo.rotateX(Math.PI / 2);
    parts.push({ geo: halo, mat: new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }) });
  } else {
    // 캡슐: 금속 캡 2 + 반투명 유리 몸통 + 내부 발광 코어(전력/무기 코어가 비쳐 보이는 앰플)
    const capL = new THREE.SphereGeometry(0.20, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); capL.rotateZ(Math.PI / 2); capL.translate(-0.26, 0, 0);
    const capR = new THREE.SphereGeometry(0.20, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); capR.rotateZ(-Math.PI / 2); capR.translate(0.26, 0, 0);
    const collarL = new THREE.CylinderGeometry(0.205, 0.205, 0.06, 10, 1, false); collarL.rotateZ(Math.PI / 2); collarL.translate(-0.24, 0, 0);
    const collarR = collarL.clone(); collarR.translate(0.48, 0, 0);
    parts.push({ geo: mergeGeos(THREE, [capL, capR, collarL, collarR]), mat: new THREE.MeshStandardMaterial({ color: 0x8a97a6, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.2 }) });
    const glass = new THREE.CylinderGeometry(0.19, 0.19, 0.50, 12, 1, true); glass.rotateZ(Math.PI / 2);
    parts.push({ geo: glass, mat: new THREE.MeshStandardMaterial({ color: 0xbfe4ff, metalness: 0.05, roughness: 0.1, envMapIntensity: 1.5, transparent: true, opacity: 0.4, side: THREE.DoubleSide }) });
    const core = new THREE.CylinderGeometry(0.10, 0.10, 0.44, 8, 1, false); core.rotateZ(Math.PI / 2);
    parts.push({ geo: core, mat: new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false }) });
  }
  // 전 파트 통합 bbox → 전장 1.0 정규화(상대 위치 보존)
  let span = 0;
  for (const p of parts) { p.geo.computeBoundingBox(); const bb = p.geo.boundingBox; span = Math.max(span, bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z); }
  const k = 1 / (span || 1);
  for (const p of parts) { p.geo.scale(k, k, k); p.geo.computeVertexNormals(); }
  return parts;
}

/** 발사체 전용 재질 — 원본 webp albedo + 가산 발광(instanceColor 로 진화색 틴트). Node/실패 시 단색 폴백. */
/** textured=false 면 원본 그림을 입히지 않는다(§G-15 이사 "발칸 색이 2D 와 다르다").
 *  2D 발칸은 진화색 + 백열 코어의 단색 예광탄이고 레이저는 단색 광선이라, 주황 로켓 그림을 입히면 색이 어긋난다.
 *  대신 instanceColor 로 2D 와 같은 탄색을 그대로 받는다. 미사일만 원본 그림을 유지한다(실모델 폴백). */
export function createProjMaterial(THREE, key, textured = true) {
  let map = null;
  const def = textured ? PROJ_TEX[key] : null;
  if (def && typeof document !== 'undefined' && THREE.TextureLoader) {
    try {
      map = new THREE.TextureLoader().load(def.url);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    } catch (e) { map = null; }
  }
  return new THREE.MeshBasicMaterial({ map, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
}

/** 소품별 지오메트리(단일 BufferGeometry, 전장 1.0). 카메라 구도(위+뒤)에서 판독되는 형태 우선. */
export function createPropGeometry(THREE, key) {
  const g = (() => {
    switch (key) {
      case 'pbullet': {   // 발칸탄(원본: 주황 탄두 로켓) — 방추(탄두 뾰족·몸통·꼬리핀 살짝)
        return loftProjectile(THREE, PROJ_TEX.pbullet.aspect, (t) => (t < 0.28 ? 0.15 + 0.85 * Math.pow(t / 0.28, 0.8) : t < 0.78 ? 1.0 : 0.94), 8, 0.30);
      }
      case 'laser': {     // 레이저 랜스(원본: 청록 크리스탈) — 가는 마름모 방추. 반폭 0.55 캡 = 그림 중앙(크리스탈)만 입힘(캔버스 여백 제외)
        return loftProjectile(THREE, PROJ_TEX.laser.aspect, (t) => 0.55 * (0.15 + 0.85 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)))), 8, 0.26);
      }
      case 'ebullet': {   // 적탄: 구체 + 짧은 꼬리(다가오는 위협 판독)
        const b = new THREE.SphereGeometry(0.30, 8, 6); b.scale(1, 1, 1.15);
        const tail = new THREE.ConeGeometry(0.16, 0.42, 6); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, 0.42);
        return mergeGeos(THREE, [b, tail]);
      }
      case 'missile': {   // 유도 미사일(원본: 은색 4핀 미사일) — 방추(탄두·금띠·핀 벌어짐은 그림이 전달)
        return loftProjectile(THREE, PROJ_TEX.missile.aspect, (t) => (t < 0.30 ? 0.18 + 0.82 * Math.pow(t / 0.30, 0.85) : t < 0.66 ? 0.92 : 1.0), 8, 0.34);
      }
      // 픽업 5종은 createPickupParts(멀티 파트 순수 조형)가 담당 — 여기 오면 안 됨(방어적 폴백만).
      default: {
        const s = new THREE.OctahedronGeometry(0.5, 0);
        return s;
      }
    }
  })();
  // 전장(최대 치수) 1.0 정규화 — placeSwarm 계약
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
  g.scale(1 / span, 1 / span, 1 / span);
  g.computeVertexNormals();
  return g;
}

/** 공용 자발광 재질 1개 — instanceColor 가 개체별 색을 입힌다(네온 톤 유지 위해 toneMapped 끔). */
export function createPropMaterial(THREE) {
  return new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
}

/** 검사실 전시(§G-3 평가용, 이사 "수송선이 빨리 터져 평가 불가") — 픽업 5종을 나란히 회전 진열. */
export function createPickupsShowcase(THREE) {
  const group = new THREE.Group(); group.name = 'PICKUPS';
  const keys = ['crystal', 'pod', 'coin', 'pow', 'capsule'];
  const items = [];
  let tris = 0;
  keys.forEach((k, i) => {
    const item = new THREE.Group();
    for (const part of createPickupParts(THREE, k)) {
      item.add(new THREE.Mesh(part.geo, part.mat));
      tris += (part.geo.index ? part.geo.index.count : part.geo.attributes.position.count) / 3;
    }
    item.position.set((i - (keys.length - 1) / 2) * 1.5, 0, 0);
    item.scale.setScalar(1.35);
    group.add(item); items.push(item);
  });
  function setLOD() { return 0; }
  function update(time) { for (let i = 0; i < items.length; i++) { items[i].rotation.y = time * 0.9 + i * 0.7; items[i].rotation.x = -0.12; } }
  function stats() { return { lod: 0, triangles: Math.round(tris) }; }
  function dispose() { group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
  return { group, setLOD, update, stats, dispose, matlib: { mats: {}, dispose() {} }, get lod() { return 0; } };
}
