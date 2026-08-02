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

// ── §G-3(이사 승인 "같은 방식"): 픽업류(크리스탈·보급선·캡슐·배지·코인)도 원본 그림을 그대로 ──
//  파일이 있는 3종(C1/C5/C2)은 그 파일, 절차 벡터 2종(POW·코인)은 2D draw 와 동일한 모양·색을
//  오프스크린 캔버스에 구워 텍스처로. 지오=세로 카드 프리즘(placeSwarm 'spin'이 y 축 회전) + 알파 컷아웃.
export const PICKUP_TEX = {
  crystal: { url: 'assets/styleC/C1.png', additive: true },    // 발광 보석 — 가산(부드러운 halo 보존)
  pod: { url: 'assets/styleC/C5.png', additive: false },       // 팔각 장갑 보급 컨테이너
  capsule: { url: 'assets/styleC/C2.png', additive: false },   // 무기·전력 캡슐 묶음
  pow: { bake: 'pow', additive: false },                       // 절차: 노랑 육각 배지(원본 Pow.draw 동일)
  coin: { bake: 'coin', additive: false },                     // 절차: 노랑 동전(원본 Coin.draw 동일)
};

/** 절차 픽업 굽기 — entities 의 2D draw 와 같은 모양·색(글로우 여백 포함 128px). */
function bakePickup(kind) {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), cx = S / 2, cy = S / 2;
  if (kind === 'pow') {
    const r = S * 0.36;
    c.shadowColor = '#ffd93d'; c.shadowBlur = S * 0.09;
    c.fillStyle = 'rgba(255,217,61,0.92)'; c.strokeStyle = '#fff4c6'; c.lineWidth = S * 0.03;
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath(); c.fill(); c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = '#2a2000'; c.font = `bold ${Math.round(S * 0.22)}px Pretendard, sans-serif`; c.textAlign = 'center';
    c.fillText('POW', cx, cy + S * 0.08);
  } else {   // coin
    const r = S * 0.34;
    c.shadowColor = '#ffd93d'; c.shadowBlur = S * 0.07;
    c.fillStyle = '#ffd93d';
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#fff4b0';
    c.beginPath(); c.arc(cx - r * 0.28, cy - r * 0.3, r * 0.34, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(150,105,15,0.9)'; c.lineWidth = S * 0.02;
    c.beginPath(); c.arc(cx, cy, r * 0.6, 0, Math.PI * 2); c.stroke();
  }
  return cv;
}

/** 픽업 재질 — 원본 그림(파일 또는 절차 굽기) + 알파 컷아웃(크리스탈만 가산). Node 폴백=단색. */
export function createPickupMaterial(THREE, key) {
  const def = PICKUP_TEX[key];
  let map = null;
  if (def && typeof document !== 'undefined') {
    try {
      if (def.bake) { map = new THREE.CanvasTexture(bakePickup(def.bake)); }
      else if (THREE.TextureLoader) { map = new THREE.TextureLoader().load(def.url); }
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; }
    } catch (e) { map = null; }
  }
  if (def && def.additive) {
    return new THREE.MeshBasicMaterial({ map, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
  }
  return new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, alphaTest: map ? 0.35 : 0, toneMapped: false });
}

/** 발사체 전용 재질 — 원본 webp albedo + 가산 발광(instanceColor 로 진화색 틴트). Node/실패 시 단색 폴백. */
export function createProjMaterial(THREE, key) {
  let map = null;
  const def = PROJ_TEX[key];
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
      // §G-3 재조형(이사: "2D 이미지 회전은 3D 가 아니다") — 픽업도 진짜 입체.
      case 'crystal': {   // 크리스탈: 팔각 쌍뿔 보석 커트(위 첨점→어깨→몸통→아래 첨점), 원본 발광 그림을 원통 UV 로 감음
        const prof = [[0, 0.02], [0.20, 0.14], [0.33, 0.32], [0.36, 0.52], [0.30, 0.72], [0.16, 0.90], [0, 0.99]];   // [반경, y(0=위)] — 원본 C1 처럼 세로 길쭉한 랜스형 커트
        const N = 8, pos = [], uv = [], idx = [];
        for (const [r, t] of prof) {
          for (let i = 0; i <= N; i++) {
            const a = (i / N) * Math.PI * 2;
            pos.push(Math.cos(a) * r, 0.5 - t, Math.sin(a) * r);
            uv.push(i / N, 1 - t);   // u=둘레(그림 가로 감기), v=높이(그림 세로)
          }
        }
        const C = N + 1;
        for (let s = 0; s < prof.length - 1; s++) for (let i = 0; i < N; i++) { const a = s * C + i, b = a + 1, d = a + C, e = d + 1; idx.push(a, b, d, b, e, d); }
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
        g2.setIndex(idx); g2.computeVertexNormals();
        return g2;
      }
      case 'pod': {       // 수송/보급 컨테이너: 두툼한 팔각 프리즘(앞뒤 팔각면=원본 그림, 옆 8면=장갑 테두리 톤)
        const c = new THREE.CylinderGeometry(0.5, 0.5, 0.55, 8, 1, false);
        c.rotateZ(Math.PI / 8);    // 팔각 평변이 위로(원본 그림 방향)
        c.rotateX(Math.PI / 2);    // 앞뒤 캡이 ±z(카메라 쪽) — spin(y 회전)에서 그림면↔옆 장갑 순환
        return c;
      }
      case 'coin': {      // 코인: 도톰한 원반(앞뒤=동전 그림, 옆=금색 테)
        const c = new THREE.CylinderGeometry(0.5, 0.5, 0.16, 14, 1, false);
        c.rotateX(Math.PI / 2);
        return c;
      }
      case 'pow': {       // POW 배지: 육각 프리즘(원본 draw 와 같은 육각)
        const c = new THREE.CylinderGeometry(0.5, 0.5, 0.20, 6, 1, false);
        c.rotateZ(Math.PI / 2); c.rotateX(Math.PI / 2);
        return c;
      }
      case 'capsule':     // 무기·전력 캡슐: 낮은 팔각 프리즘(원본 캡슐 묶음 그림 + 두께)
      default: {
        const c = new THREE.CylinderGeometry(0.5, 0.5, 0.30, 8, 1, false);
        c.rotateX(Math.PI / 2);
        return c;
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
