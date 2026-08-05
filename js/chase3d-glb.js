// ── §G-5 실모델(GLB) 로더 — 이사 제작 파이프라인 3단계: Gemini 이미지 → VARCO 3D 화 → 게임 ──
//  전처리 계약: gltfpack -si -sa 로 ≤1만 tri + 1K 텍스처(파이썬 재패킹) — 원본 50만 tri/51MB 는 금지.
//  빌보드와 달리 진짜 입체라 카메라 각도·다이빙 pitch 가 실제로 적용된다(§G-4 각도 문제의 근본 해결).
//  파트 계약: [{geo, mat}] — makeSwarm/placeSwarm 이 InstancedMesh 로 감싼다. 전장 1.0·중심 원점 정규화.
import { GLTFLoader } from './vendor/GLTFLoader.js';

/** GLB 를 로드해 게임 계약 지오로 정규화. opts.rotX/rotY/rotZ = 모델 축 → 게임 축(노즈 -z·등 +y) 보정. */
export function loadEnemyGlbParts(THREE, url, opts = {}) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      try {
        const parts = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
        if (!parts.length) return reject(new Error('no mesh in ' + url));
        // 다중 메시면 첫 메시 기준(현 파이프라인은 단일 메시 출력)
        const out = [];
        // 공통 정규화 기준: 전체 바운딩
        const box = new THREE.Box3();
        for (const m of parts) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
        const c = new THREE.Vector3(); box.getCenter(c);
        const size = new THREE.Vector3(); box.getSize(size);
        const k = 1 / (Math.max(size.x, size.y, size.z) || 1);
        // 양자화(KHR_mesh_quantization) GLB: attribute 가 정수형 — 행렬 적용 전에 float 변환 필수
        //  (정수 배열에 applyMatrix4 하면 결과가 다시 정수로 뭉개져 지오가 붕괴한다 — 실측)
        const toFloat = (g) => {
          for (const name of ['position', 'normal', 'uv']) {
            const a = g.attributes[name];
            if (!a || a.array instanceof Float32Array) continue;
            const f = new Float32Array(a.count * a.itemSize);
            for (let i = 0; i < a.count; i++)
              for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
            g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
          }
          return g;
        };
        for (const m of parts) {
          const geo = toFloat(m.geometry.clone()).applyMatrix4(m.matrixWorld);
          geo.translate(-c.x, -c.y, -c.z);
          geo.scale(k, k, k);
          if (opts.rotX) geo.rotateX(opts.rotX);
          if (opts.rotY) geo.rotateY(opts.rotY);
          if (opts.rotZ) geo.rotateZ(opts.rotZ);
          geo.computeVertexNormals();
          // 재질은 통제된 Standard 로 재구성 — glTF 의 KHR_specular(Physical) 회색 반사와
          //  과한 자발광(0x6f6f6f)이 채도를 죽였다(이사 원본 대비 실측). map+normal 만 취하고
          //  자발광은 실루엣 유지용 최소만.
          const src = m.material || {};
          if (src.map) src.map.colorSpace = THREE.SRGBColorSpace;
          const mat = new THREE.MeshStandardMaterial({
            map: src.map || null,
            normalMap: src.normalMap || null,
            roughness: 0.62,
            metalness: 0.05,
            envMapIntensity: 1.0,
            emissive: new THREE.Color(0x2e2e2e),
            emissiveMap: src.map || null,
          });
          out.push({ geo, mat });
        }
        resolve(out);
      } catch (e) { reject(e); }
    }, undefined, reject);
  });
}

export default { loadEnemyGlbParts };
