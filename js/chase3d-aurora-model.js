// ── AURORA 조립 + 애니메이션 훅 (Opus5 §11) — geometry 버킷 × materials, LOD, dispose ──
//  프레임 중 할당 금지(§10.1): 생성은 여기서 1회, update 는 기존 객체 값만 갱신.
import { createAuroraGeometry, disposeAurora, LENGTH, HALFW } from './chase3d-aurora-geometry.js';
import { createAuroraMaterials } from './chase3d-aurora-materials.js';

export { LENGTH, HALFW };

export function createAuroraModel(THREE, { seed = 7, mobile = false, lods = [0, 1, 2] } = {}) {
  const matlib = createAuroraMaterials(THREE, { seed, mobile });
  const group = new THREE.Group();
  group.name = 'AURORA';
  const lodGroups = new Map();
  const geos = [];
  let triByLod = {};
  for (const lod of lods) {
    const geo = createAuroraGeometry(THREE, { lod, seed });
    geos.push(geo);
    triByLod[lod] = geo.triangles;
    const g = new THREE.Group(); g.name = 'AURORA_LOD' + lod;
    for (const key in geo.buckets) {
      const mesh = new THREE.Mesh(geo.buckets[key], matlib.mats[key] || matlib.mats.dark);
      mesh.name = 'aurora_' + key;
      g.add(mesh);
    }
    g.visible = false;
    group.add(g);
    lodGroups.set(lod, g);
  }
  let activeLod = lods[0];
  lodGroups.get(activeLod).visible = true;
  const nodes = geos[0] ? createAuroraGeometry.nodes : null;   // 노드는 LOD0 기준(주입 없이 상수라 재계산 불필요)

  function setLOD(lod) {
    if (!lodGroups.has(lod) || lod === activeLod) return activeLod;
    lodGroups.get(activeLod).visible = false;
    lodGroups.get(lod).visible = true;
    activeLod = lod;
    return activeLod;
  }
  /** 시각 전용 애니메이션: bank(롤)·bob·엔진 펄스. 판정·게임 상태와 무관(§9.3). */
  function update(time, { bank = 0, charging = false, chargeFrac = 0 } = {}) {
    group.rotation.z = bank;
    group.position.y = Math.sin(time * 1.5) * 0.045;
    const pulse = 2.1 + Math.sin(time * 7) * 0.35 + (charging ? chargeFrac * 2.2 : 0);
    matlib.mats.glow.emissiveIntensity = pulse;
    matlib.mats.core.emissiveIntensity = 1.8 + Math.sin(time * 3.1) * 0.25 + (charging ? chargeFrac * 1.2 : 0);
  }
  function stats() { return { lod: activeLod, triangles: triByLod[activeLod], triByLod: { ...triByLod }, textureBytes: matlib.textureBytes }; }
  function dispose() {
    for (const geo of geos) disposeAurora(geo);
    matlib.dispose();
  }
  return { group, setLOD, update, stats, dispose, matlib, get lod() { return activeLod; } };
}
export default { createAuroraModel };
