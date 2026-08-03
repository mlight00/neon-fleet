// ── §G-4 이미지 빌보드 — 이사 제작(Gemini) 고품질 렌더를 3D 씬의 카메라 대면 판에 표시 ──
//  대상: 회전·측면 노출이 없는 적(터렛=고정 자세, 위버=좌우 누빔·정면 유지) — 옆면이 없어 "2D 판" 티가 나지 않는다.
//  이미지 계약: assets/3d/*.webp — 사전 처리(검정 배경 제거·본체 코어 불투명+발광 luminance 페이드·정사각 크롭) 완료본.
//  재질=Basic(조명 무관 — 이미지에 조명이 구워져 있음), 알파 블렌드, depthWrite off(글로우 페더 겹침 안전).
export const BILLBOARD_TEX = {
  b5: 'assets/3d/b5_gen.webp',   // 터렛(탑다운 3/4 렌더 — 추적 카메라 시점과 일치)
  b6: 'assets/3d/b6_gen.webp',   // 위버(정면 별 렌더)
};

/** 파트 배열 반환(픽업 파트 계약과 동일) — renderer 가 InstancedMesh 로 감싼다. 전장 1.0 평면. */
export function createBillboardParts(THREE, key) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateY(Math.PI);   // placeSwarm yawBase π(전면=카메라)와 상쇄 — 이미지 좌우 원본 유지
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const tex = new THREE.TextureLoader().load(BILLBOARD_TEX[key], (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    mat.opacity = 1;   // 로드 완료 전 프레임은 투명(하드 팝 방지)
    mat.needsUpdate = true;
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  mat.map = tex;
  return [{ geo, mat }];
}

/** 검사실 모델(chase3dLab=b5|b6) — 실전과 같은 빌보드를 단독 진열(lab 인터페이스: group/setLOD/update/stats/dispose). */
export function createBillboardModel(THREE, key) {
  const parts = createBillboardParts(THREE, key);
  const group = new THREE.Group(); group.name = key.toUpperCase() + '_BILLBOARD';
  for (const p of parts) group.add(new THREE.Mesh(p.geo, p.mat));
  function update(time) { group.position.y = Math.sin(time * 0.9) * 0.05; }   // 미세 부유(정지 화면 방지)
  return {
    group,
    setLOD() { return 0; },
    update,
    stats() { return { lod: 0, triangles: 2, triByLod: { 0: 2 } }; },
    dispose() { for (const p of parts) { p.geo.dispose(); if (p.mat.map) p.mat.map.dispose(); p.mat.dispose(); } },
    get lod() { return 0; },
  };
}

export default { BILLBOARD_TEX, createBillboardParts, createBillboardModel };
