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

/** 세로(y) 회전체 로프트 — prof=[[반경, t(0=위)]...], 팔각 단면 + 정점 지터(결정면). */
function latheY(THREE, prof, N = 8, jitter = 0) {
  const pos = [], idx = [];
  for (let s = 0; s < prof.length; s++) {
    const [r, t] = prof[s];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const j = jitter && r > 0.01 ? 1 + (jr(s, i % N) - 0.5) * jitter : 1;
      pos.push(Math.cos(a) * r * j, 0.5 - t, Math.sin(a) * r * j);
    }
  }
  const C = N + 1;
  for (let s = 0; s < prof.length - 1; s++) for (let i = 0; i < N; i++) { const a = s * C + i, b = a + 1, d = a + C, e = d + 1; idx.push(a, b, d, b, e, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2).fill(0.5), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/**
 * 픽업 파트 팩토리 — [{ geo, mat }...]. 전 파트 통합 bbox 로 전장 1.0 정규화(상대 위치 보존).
 * 전부 flatShading 조형 + 발광 코어 — 그림 텍스처 없음.
 */
export function createPickupParts(THREE, key) {
  const M = (o) => new THREE.MeshStandardMaterial(Object.assign({ flatShading: true }, o));
  const parts = [];
  if (key === 'crystal') {
    // 결정면이 살아있는 청록 보석: 팔각 쌍뿔(지터 결정면) + 백열 코어(원본 "중심이 빛나는" 정체성)
    const outer = latheY(THREE, [[0, 0.02], [0.16, 0.15], [0.24, 0.34], [0.26, 0.52], [0.22, 0.72], [0.11, 0.90], [0, 0.99]], 8, 0.16);   // 원본 C1 비율의 세로 랜스
    parts.push({ geo: outer, mat: M({ color: 0x0e3c4e, emissive: 0x2fd4ff, emissiveIntensity: 1.15, transparent: true, opacity: 0.9 }) });
    const core = new THREE.OctahedronGeometry(0.16, 0); core.scale(0.75, 1.9, 0.75);
    parts.push({ geo: core, mat: new THREE.MeshBasicMaterial({ color: 0xeaffff, toneMapped: false }) });
  } else if (key === 'pod') {
    // 장갑 보급 컨테이너: 팔각 드럼 + 세로 리브 8 + 중앙 발광 창(관통 원기둥이 앞뒤로 노출)
    const drum = new THREE.CylinderGeometry(0.46, 0.46, 0.5, 8, 1, false); drum.rotateX(Math.PI / 2);
    const ribs = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const rb = new THREE.BoxGeometry(0.10, 0.07, 0.58);
      rb.rotateZ(a); rb.translate(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0);
      ribs.push(rb);
    }
    parts.push({ geo: mergeGeos(THREE, [drum, ...ribs]), mat: M({ color: 0x46525e, metalness: 0.72, roughness: 0.45, emissive: 0x1a2430, emissiveIntensity: 0.5 }) });
    const win = new THREE.CylinderGeometry(0.24, 0.24, 0.56, 8, 1, false); win.rotateX(Math.PI / 2);
    parts.push({ geo: win, mat: new THREE.MeshBasicMaterial({ color: 0x35e0d8, toneMapped: false }) });
  } else if (key === 'coin') {
    // 금화: 도톰한 원반(금속) + 중앙 돌출 코어(밝은 금)
    const body = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 14, 1, false); body.rotateX(Math.PI / 2);
    parts.push({ geo: body, mat: M({ color: 0xd9a92c, metalness: 0.85, roughness: 0.3, emissive: 0x6a4c08, emissiveIntensity: 0.55 }) });
    const inner = new THREE.CylinderGeometry(0.30, 0.30, 0.17, 12, 1, false); inner.rotateX(Math.PI / 2);
    parts.push({ geo: inner, mat: new THREE.MeshBasicMaterial({ color: 0xffe98a, toneMapped: false }) });
  } else if (key === 'pow') {
    // POW 배지: 노랑 육각 프리즘 + 중앙 버튼 돌출(글자는 HUD 라벨 'POW' 가 담당)
    const hexa = new THREE.CylinderGeometry(0.5, 0.5, 0.18, 6, 1, false); hexa.rotateZ(Math.PI / 2); hexa.rotateX(Math.PI / 2);
    parts.push({ geo: hexa, mat: M({ color: 0xd9b32c, metalness: 0.5, roughness: 0.4, emissive: 0xaa7d10, emissiveIntensity: 0.7 }) });
    const btn = new THREE.CylinderGeometry(0.26, 0.26, 0.22, 6, 1, false); btn.rotateZ(Math.PI / 2); btn.rotateX(Math.PI / 2);
    parts.push({ geo: btn, mat: new THREE.MeshBasicMaterial({ color: 0xfff0a8, toneMapped: false }) });
  } else {
    // 캡슐(무기·전력): 가로 알약(몸통+반구 캡) + 중앙 발광 밴드
    const body = new THREE.CapsuleGeometry(0.20, 0.52, 2, 7); body.rotateZ(Math.PI / 2);
    parts.push({ geo: body, mat: M({ color: 0x77879a, metalness: 0.65, roughness: 0.4, emissive: 0x222d3a, emissiveIntensity: 0.5 }) });
    const band = new THREE.CylinderGeometry(0.225, 0.225, 0.14, 10, 1, false); band.rotateZ(Math.PI / 2);
    parts.push({ geo: band, mat: new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false }) });
  }
  // 전 파트 통합 bbox → 전장 1.0 정규화(상대 위치 보존)
  let span = 0;
  for (const p of parts) { p.geo.computeBoundingBox(); const bb = p.geo.boundingBox; span = Math.max(span, bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z); }
  const k = 1 / (span || 1);
  for (const p of parts) { p.geo.scale(k, k, k); p.geo.computeVertexNormals(); }
  return parts;
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
