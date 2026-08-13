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
            if (!a || (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute)) continue;
            // 양자화 출력은 정수형 + interleaved 일 수 있다 — 배열 직접 순회는 타 속성 데이터가 섞여
            //  파편 형상이 된다(실측). getX/Y/Z/W 가 stride·역정규화를 모두 처리한다(r160).
            const f = new Float32Array(a.count * a.itemSize);
            for (let i = 0; i < a.count; i++) {
              f[i * a.itemSize] = a.getX(i);
              if (a.itemSize > 1) f[i * a.itemSize + 1] = a.getY(i);
              if (a.itemSize > 2) f[i * a.itemSize + 2] = a.getZ(i);
              if (a.itemSize > 3) f[i * a.itemSize + 3] = a.getW(i);
            }
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

/** 검사실 진열장(chase3dLab=models): 실모델 전 종을 격자 진열 — 게임 진행 없이 한 화면 평가(이사 요청).
 *  lab 인터페이스(group/setLOD/update/stats/dispose). 각 모델 천천히 자전. */
export function createGlbShowcase(THREE, defs) {
  const group = new THREE.Group(); group.name = 'GLB_SHOWCASE';
  const keys = Object.keys(defs).filter((k) => defs[k].glb);
  const spinners = [];
  const GAP = 1.5, COLS = Math.min(3, keys.length || 1);   // 종 수 기준 중앙 정렬 — 1종 진열(a0)이 왼쪽 칸(화면 밖)에 놓이던 함정
  keys.forEach((k, i) => {
    const holder = new THREE.Group();
    const col = i % COLS, row = Math.floor(i / COLS);
    holder.position.set((col - (COLS - 1) / 2) * GAP, ((Math.ceil(keys.length / COLS) - 1) / 2 - row) * GAP, 0);
    group.add(holder); spinners.push(holder);
    loadEnemyGlbParts(THREE, defs[k].glb, defs[k]).then((parts) => {
      for (const p of parts) holder.add(new THREE.Mesh(p.geo, p.mat));
      revision++;
    }).catch((e) => { try { console.warn('[chase3d-lab] 진열 GLB 로드 실패:', defs[k].glb, (e && e.message) || e); } catch (x) {} });
  });
  //  §G-22 §10: 메시가 붙을 때마다 올라가는 개정 번호 — 검사실이 "새 메시가 생겼다"를 개수 비교가 아니라
  //  이 값으로 알 수 있다(같은 수의 메시가 교체되는 미래 경로도 잡힌다).
  let revision = 0;
  function update(time) { for (let i = 0; i < spinners.length; i++) spinners[i].rotation.y = Math.PI + Math.sin(time * 0.6 + i * 0.5) * 0.6; }   // 얼굴(-z)이 진열 카메라(+z)를 향하게 π 오프셋 + 좌우 흔들 ±34°
  /** §G-22 §10: 실제 삼각형 수와 텍스처 바이트를 센다. G21 은 `triangles: 0` 고정 + textureBytes 누락이라
   *  검사실 통계가 `texMB NaN` 으로 떴다(0 도 거짓말이었다). 진열은 개발 전용이라 호출 시점에만 센다. */
  function stats() {
    let triangles = 0, textureBytes = 0;
    const seenTex = new Set();
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const idx = o.geometry.index;
      const pos = o.geometry.attributes && o.geometry.attributes.position;
      triangles += idx ? idx.count / 3 : (pos ? pos.count / 3 : 0);
      const m = o.material;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
        const t = m && m[key];
        if (!t || seenTex.has(t)) continue;
        seenTex.add(t);
        const img = t.image;
        if (img && img.width && img.height) textureBytes += img.width * img.height * 4;   // RGBA8 기준 근사
      }
    });
    return { lod: 0, triangles: Math.round(triangles), triByLod: { 0: Math.round(triangles) }, textureBytes, revision };
  }
  return {
    group,
    setLOD() { return 0; },
    update,
    stats,
    dispose() { for (const h of spinners) h.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); },
    get lod() { return 0; },
  };
}

export default { loadEnemyGlbParts, createGlbShowcase };
