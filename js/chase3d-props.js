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
      case 'crystal': {   // 크리스탈(+N 보석): 겹 옥타 — 겉(색) + 속(밝은 심)
        const outer = new THREE.OctahedronGeometry(0.5, 0); outer.scale(0.52, 0.52, 1.0);
        const inner = new THREE.OctahedronGeometry(0.5, 0); inner.scale(0.26, 0.26, 0.55);
        return mergeGeos(THREE, [outer, inner]);
      }
      case 'coin': {      // 코인: 도톰한 원반(위에서 원이 보이게 눕힘)
        const c = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 12);
        return c;
      }
      case 'pow': {       // POW 배지: 팔각 프리즘 + 상단 링
        const base = new THREE.CylinderGeometry(0.5, 0.5, 0.18, 8);
        const ring = new THREE.TorusGeometry(0.30, 0.06, 6, 8); ring.rotateX(Math.PI / 2); ring.translate(0, 0.14, 0);
        return mergeGeos(THREE, [base, ring]);
      }
      case 'pod': {       // 보급선(드론 포드): 세로 캡슐 + 허리 링
        const body = new THREE.CapsuleGeometry(0.24, 0.46, 2, 7);
        const ring = new THREE.TorusGeometry(0.30, 0.05, 4, 8); ring.rotateX(Math.PI / 2);
        return mergeGeos(THREE, [body, ring]);
      }
      case 'capsule':     // 무기 캡슐·전력 모듈: 가로 캡슐(알약)
      default: {
        const body = new THREE.CapsuleGeometry(0.22, 0.5, 2, 8); body.rotateZ(Math.PI / 2);
        return body;
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
