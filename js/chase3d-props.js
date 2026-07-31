// ── 함미 추적 3D 소품(이사: "각종 무기와 배지 3D") — 탄환·픽업·배지의 초경량 절차 지오메트리 ──
//  단순 형상(탄·보석·배지)이라 디지타이즈 없이 파라메트릭 프리미티브로 충분. 전 소품 공통 계약:
//   - 최대 치수(전장) 1.0 정규화 — placeSwarm 의 "화면 전장 px" 배치 파이프라인 그대로 재사용
//   - 종당 삼각형 ≤200(수십 개 인스턴스 전제), 재질은 공용 1개(자발광 basic + instanceColor 로 개체별 색)
//   - 결정적(난수 없음)·THREE 주입(Node 검증 가능)
import { mergeGeos } from './chase3d-aurora-geometry.js';
// 순수 상수는 chase3d-prop-defs.js 로 분리(Codex 재검토 P2 — 기본 URL 정적 로드 체인 절단). 여기서는 재수출만.
export { PROP_KEYS, PROP_CAPS, PROP_BASE_COLOR } from './chase3d-prop-defs.js';
import { PROP_KEYS } from './chase3d-prop-defs.js';

/** 소품별 지오메트리(단일 BufferGeometry, 전장 1.0). 카메라 구도(위+뒤)에서 판독되는 형태 우선. */
export function createPropGeometry(THREE, key) {
  const g = (() => {
    switch (key) {
      case 'pbullet': {   // 플레이어 점형탄: 길쭉한 발광 샤드(옥타 늘림)
        const s = new THREE.OctahedronGeometry(0.5, 0);
        s.scale(0.30, 0.30, 1.0);
        return s;
      }
      case 'ebullet': {   // 적탄: 구체 + 짧은 꼬리(다가오는 위협 판독)
        const b = new THREE.SphereGeometry(0.30, 8, 6); b.scale(1, 1, 1.15);
        const tail = new THREE.ConeGeometry(0.16, 0.42, 6); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, 0.42);
        return mergeGeos(THREE, [b, tail]);
      }
      case 'missile': {   // 유도 미사일: 원뿔 탄두 + 몸통 + 십자핀
        const nose = new THREE.ConeGeometry(0.13, 0.34, 6); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 0.33);
        const body = new THREE.CylinderGeometry(0.11, 0.13, 0.62, 6); body.rotateX(Math.PI / 2); body.translate(0, 0, -0.03);
        const finA = new THREE.BoxGeometry(0.42, 0.02, 0.16); finA.translate(0, 0, -0.38);
        const finB = new THREE.BoxGeometry(0.02, 0.42, 0.16); finB.translate(0, 0, -0.38);
        return mergeGeos(THREE, [nose, body, finA, finB]);
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
