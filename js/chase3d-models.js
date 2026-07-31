// ── Neon Fleet 실제 3D — 모듈식 모델 팩토리 + 재질 (작업지시서 §4·§9.1) ──
//  기본 지오메트리(Box/Cylinder/Cone/Lathe) 조합으로 진짜 앞·뒤·옆 표면과 깊이를 만든다.
//  평면 스프라이트/빌보드/얇은 2D 압출 금지(§4.2·§16). 부품과 색을 분리해 H0~H5 확장 대비(§4.3).
//  이 모듈은 `?chase3d=1`에서 동적 import되는 renderer/scene 을 통해서만 로드된다(§3.2).
import * as THREE from './vendor/three.module.js';

// FORGED LIGHT 팔레트 — 어두운 도장 금속 + 금색 지휘 테두리 + 청록/마젠타 무장·엔진 발광(§4.2).
export const PALETTE = {
  hull: 0x2a3146, hullDark: 0x1b2030, panel: 0x39415c,
  gold: 0xe6c169, goldEmis: 0x7a5a12,
  teal: 0x3ff5e0, magenta: 0xff54c8, amber: 0xffb454,
  enemyHull: 0x3a2140, enemyEdge: 0xff54c8,
  sniperHull: 0x14314a, sniperEdge: 0x63d6ff,
  bossHull: 0x2c1030, bossCore: 0xff3aa0, bossGold: 0xe6c169,
  cruiser: 0x243a4a,
};

/**
 * 공유 지오메트리·재질 키트를 1회 생성한다(§9.2: 프레임마다 새로 만들지 않음).
 * factory 들은 이 공유 자원을 참조하는 Group/Mesh 를 반환한다. teardown 시 kit.dispose() 로 일괄 해제.
 */
export function createModelKit() {
  const geos = [];
  const mats = [];
  const G = (g) => { geos.push(g); return g; };
  const M = (m) => { mats.push(m); return m; };

  // 재질(절제된 metal/rough + emissive)
  const matHull = M(new THREE.MeshStandardMaterial({ color: PALETTE.hull, metalness: 0.62, roughness: 0.46 }));
  const matHullDark = M(new THREE.MeshStandardMaterial({ color: PALETTE.hullDark, metalness: 0.7, roughness: 0.5 }));
  const matPanel = M(new THREE.MeshStandardMaterial({ color: PALETTE.panel, metalness: 0.5, roughness: 0.55 }));
  const matGold = M(new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.85, roughness: 0.3, emissive: PALETTE.goldEmis, emissiveIntensity: 0.5 }));
  const matTeal = M(new THREE.MeshStandardMaterial({ color: 0x0a2b2b, metalness: 0.3, roughness: 0.4, emissive: PALETTE.teal, emissiveIntensity: 1.4 }));
  const matMagenta = M(new THREE.MeshStandardMaterial({ color: 0x2b0a22, metalness: 0.3, roughness: 0.4, emissive: PALETTE.magenta, emissiveIntensity: 1.3 }));
  const matEngine = M(new THREE.MeshStandardMaterial({ color: 0x001a1a, metalness: 0.2, roughness: 0.3, emissive: PALETTE.teal, emissiveIntensity: 2.2 }));
  const matEnemy = M(new THREE.MeshStandardMaterial({ color: PALETTE.enemyHull, metalness: 0.5, roughness: 0.5, emissive: PALETTE.enemyEdge, emissiveIntensity: 0.25 }));
  const matEnemyEdge = M(new THREE.MeshStandardMaterial({ color: 0x2a0a24, metalness: 0.4, roughness: 0.4, emissive: PALETTE.enemyEdge, emissiveIntensity: 1.1 }));
  const matSniper = M(new THREE.MeshStandardMaterial({ color: PALETTE.sniperHull, metalness: 0.55, roughness: 0.45 }));
  const matSniperEdge = M(new THREE.MeshStandardMaterial({ color: 0x08202e, metalness: 0.4, roughness: 0.4, emissive: PALETTE.sniperEdge, emissiveIntensity: 1.0 }));
  const matBoss = M(new THREE.MeshStandardMaterial({ color: PALETTE.bossHull, metalness: 0.68, roughness: 0.42 }));
  const matBossCore = M(new THREE.MeshStandardMaterial({ color: 0x2a0018, metalness: 0.2, roughness: 0.3, emissive: PALETTE.bossCore, emissiveIntensity: 1.8 }));
  const matCruiser = M(new THREE.MeshStandardMaterial({ color: PALETTE.cruiser, metalness: 0.6, roughness: 0.5, emissive: PALETTE.teal, emissiveIntensity: 0.2 }));
  const matGate = M(new THREE.MeshStandardMaterial({ color: 0x0c1830, metalness: 0.4, roughness: 0.5, emissive: PALETTE.teal, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
  const matLaser = M(new THREE.MeshStandardMaterial({ color: 0x0a3333, emissive: PALETTE.teal, emissiveIntensity: 2.6, metalness: 0, roughness: 0.2 }));
  const matEBullet = M(new THREE.MeshStandardMaterial({ color: 0x331020, emissive: PALETTE.magenta, emissiveIntensity: 2.2, metalness: 0, roughness: 0.2 }));
  const matLance = M(new THREE.MeshStandardMaterial({ color: 0x113333, emissive: PALETTE.teal, emissiveIntensity: 3.2, metalness: 0, roughness: 0.15, transparent: true, opacity: 0.9 }));
  const matPickup = M(new THREE.MeshStandardMaterial({ color: 0x2a2410, metalness: 0.7, roughness: 0.3, emissive: PALETTE.amber, emissiveIntensity: 1.2 }));
  // 기함 고급화 재질: 콕핏 발광 유리, 밝은 선체 액센트, 어두운 그리블, 함미 금속
  const matCockpit = M(new THREE.MeshStandardMaterial({ color: 0x081826, metalness: 0.4, roughness: 0.15, emissive: 0x2fd8ff, emissiveIntensity: 1.6 }));
  const matHullLit = M(new THREE.MeshStandardMaterial({ color: 0x3a4560, metalness: 0.66, roughness: 0.4 }));
  const matGreeble = M(new THREE.MeshStandardMaterial({ color: 0x171c2b, metalness: 0.75, roughness: 0.55 }));
  const matEngineRing = M(new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.85, roughness: 0.35 }));

  // 공유 지오메트리
  const gHullBody = G(new THREE.CylinderGeometry(0.42, 0.62, 2.6, 10));     // 함체(끝이 좁아지는 통) — 세로로 눕혀 Z축 정렬
  const gNose = G(new THREE.ConeGeometry(0.42, 1.2, 10));
  const gWing = G(new THREE.BoxGeometry(1.7, 0.12, 1.0));
  const gWingTip = G(new THREE.BoxGeometry(0.3, 0.1, 0.7));
  const gEngine = G(new THREE.CylinderGeometry(0.24, 0.28, 0.7, 10));
  const gEngineCore = G(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 10));
  const gBridge = G(new THREE.BoxGeometry(0.5, 0.34, 0.8));
  const gCannon = G(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8));
  const gTrim = G(new THREE.BoxGeometry(0.16, 0.06, 1.9));
  const gGlow = G(new THREE.SphereGeometry(0.34, 10, 8));
  // ── 기함 AURORA 고급 부품 ──
  const gKeel = G(new THREE.CylinderGeometry(0.30, 0.16, 2.9, 8));          // 하부 용골(함체 아래 세로 능선)
  const gSpine = G(new THREE.BoxGeometry(0.24, 0.22, 2.2));                  // 상부 척추 능선
  const gNoseTip = G(new THREE.ConeGeometry(0.12, 0.7, 8));                 // 센서 침
  const gCanopy = G(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));  // 콕핏 캐노피(반구)
  const gWingRoot = G(new THREE.BoxGeometry(0.5, 0.2, 1.3));                // 날개 뿌리(두꺼움)
  const gWingBlade = G(new THREE.BoxGeometry(1.5, 0.09, 0.8));             // 날개 본판(얇음)
  const gWingEdge = G(new THREE.BoxGeometry(1.5, 0.05, 0.12));             // 날개 앞전 발광
  const gHardpoint = G(new THREE.BoxGeometry(0.16, 0.16, 0.5));           // 무장 하드포인트
  const gMissile = G(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6));      // 미사일 포드
  const gNacelle = G(new THREE.CylinderGeometry(0.26, 0.3, 1.0, 12));      // 엔진 나셀(큰 통)
  const gIntake = G(new THREE.TorusGeometry(0.26, 0.06, 6, 12));          // 흡기 링
  const gExhaust = G(new THREE.CylinderGeometry(0.2, 0.24, 0.28, 12, 1, true)); // 배기구(열린 통)
  const gVernier = G(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 6));      // 보조 추진기
  const gPanel = G(new THREE.BoxGeometry(0.3, 0.06, 0.5));                 // 선체 패널 그리블
  const gPanelS = G(new THREE.BoxGeometry(0.16, 0.05, 0.3));               // 작은 그리블

  const gDrone = G(new THREE.OctahedronGeometry(0.32, 0));                  // 드론(작고 날카로움) — InstancedMesh 용
  const gCreatureBody = G(new THREE.TetrahedronGeometry(0.6, 0));           // B1 소형 크리처(날카로운 실루엣)
  const gCreatureFin = G(new THREE.ConeGeometry(0.22, 0.7, 4));
  const gSniperBody = G(new THREE.CylinderGeometry(0.18, 0.32, 1.6, 8));    // B4 저격형(긴 포신 실루엣)
  const gSniperBarrel = G(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8));
  const gSniperPod = G(new THREE.BoxGeometry(0.7, 0.3, 0.5));
  const gBossCore = G(new THREE.IcosahedronGeometry(1.1, 0));               // B8 리퍼로드 핵심부
  const gBossArmor = G(new THREE.TorusGeometry(1.7, 0.34, 8, 16));
  const gBossClaw = G(new THREE.ConeGeometry(0.4, 2.0, 6));
  const gCruiserBody = G(new THREE.CylinderGeometry(0.22, 0.34, 1.4, 8));
  const gLaser = G(new THREE.CylinderGeometry(0.09, 0.09, 1, 6));           // 세로 1 → 길이 스케일로 조절
  const gEBullet = G(new THREE.SphereGeometry(0.16, 8, 6));
  const gLance = G(new THREE.CylinderGeometry(0.28, 0.14, 1, 10));
  const gPickup = G(new THREE.OctahedronGeometry(0.4, 0));
  const gGateBar = G(new THREE.BoxGeometry(0.12, 2.0, 0.12));

  const rotZ = (mesh) => { mesh.rotation.x = Math.PI / 2; return mesh; };   // Y축 통을 Z축(진행)으로 눕힘

  // ── 기함 AURORA (H3) 고급화: 다층 함체·용골·척추 / 후퇴익+앞전발광+하드포인트 / 대형 나셀 엔진·흡기·배기·보조추진 / 콕핏 캐노피 / 그리블. ──
  //  앞(+Z)을 향함 → 카메라(뒤)에서 함미·엔진·날개가 크게 보인다.
  function flagship() {
    const g = new THREE.Group();
    const add = (geo, mat, pos, rot, scl) => { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(pos[0], pos[1], pos[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); if (scl) m.scale.set(scl[0], scl[1], scl[2]); g.add(m); return m; };
    const P = Math.PI / 2;
    // 함체: 주 통 + 하부 용골 + 상부 척추(3층으로 두께감)
    add(gHullBody, matHull, [0, 0, 0.1], [P, 0, 0]);
    add(gKeel, matHullDark, [0, -0.24, 0.0], [P, 0, 0]);
    add(gSpine, matHullLit, [0, 0.2, -0.1]);
    // 노즈 + 센서 침
    add(gNose, matPanel, [0, 0, 1.9], [-P, 0, 0]);
    add(gNoseTip, matGold, [0, 0.02, 2.55], [-P, 0, 0]);
    // 콕핏 캐노피(발광 유리) — 척추 앞쪽
    add(gCanopy, matCockpit, [0, 0.3, 0.55], [-0.25, 0, 0]);
    // 좌우 날개: 뿌리(두꺼움)+본판(후퇴)+앞전 발광+팁+하드포인트 2·미사일
    for (const s of [-1, 1]) {
      add(gWingRoot, matHullLit, [s * 0.55, 0.0, -0.05], [0, 0, s * 0.1]);
      add(gWingBlade, matPanel, [s * 1.15, 0.03, -0.15], [0, s * 0.32, s * 0.14]);   // 뒤로 후퇴(sweep)
      add(gWingEdge, s < 0 ? matTeal : matMagenta, [s * 1.15, 0.06, 0.2], [0, s * 0.32, s * 0.14]);
      add(gWingTip, s < 0 ? matTeal : matMagenta, [s * 1.9, 0.06, -0.25], [0, s * 0.3, 0], [0.7, 1, 1]);
      // 무장 하드포인트 + 미사일 포드(날개 아래)
      add(gHardpoint, matGreeble, [s * 1.0, -0.08, 0.15], [0, s * 0.32, 0]);
      add(gMissile, matGold, [s * 1.0, -0.16, 0.35], [P, 0, 0]);
      add(gCannon, matGold, [s * 0.62, 0.04, 0.75], [P, 0, 0]);   // 주 포신
    }
    // 엔진 2기(함미 −Z): 대형 나셀 + 흡기 링 + 배기구 + 발광 코어 + 추진광
    for (const s of [-1, 1]) {
      add(gNacelle, matEngineRing, [s * 0.36, -0.03, -1.35], [P, 0, 0]);
      add(gIntake, matGold, [s * 0.36, -0.03, -0.82], [0, 0, 0]);
      add(gExhaust, matGreeble, [s * 0.36, -0.03, -1.86], [P, 0, 0]);
      add(gEngineCore, matEngine, [s * 0.36, -0.03, -1.78], [P, 0, 0]);
      add(gGlow, matEngine, [s * 0.36, -0.03, -2.0], null, [0.62, 0.62, 0.45]);
      // 보조 추진기(안쪽 위)
      add(gVernier, matEngine, [s * 0.14, 0.14, -1.6], [P, 0, 0]);
    }
    // 지휘 함교 + 금색 척추 테두리 + 상부 그리블 패널
    add(gBridge, matHullLit, [0, 0.42, -0.25], null, [0.9, 0.8, 1]);
    add(gTrim, matGold, [0, 0.32, -0.1]);
    add(gPanel, matGreeble, [0.22, 0.16, -0.7]);
    add(gPanel, matGreeble, [-0.22, 0.16, -0.7]);
    add(gPanelS, matGreeble, [0, 0.16, 0.95]);
    add(gPanelS, matTeal, [0.3, -0.02, -1.05]);   // 측면 러닝 라이트
    add(gPanelS, matMagenta, [-0.3, -0.02, -1.05]);
    g.userData.parts = { engines: g.children.filter((c) => c.material === matEngine) };
    return g;
  }

  function drone() { return new THREE.Mesh(gDrone, matTeal); }             // 단품(참고). 실제 대량은 InstancedMesh.
  function droneInstanced(count) {
    const im = new THREE.InstancedMesh(gDrone, matCruiser, Math.max(1, count));
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return im;
  }

  function cruiser() {
    const g = new THREE.Group();
    const body = rotZ(new THREE.Mesh(gCruiserBody, matCruiser)); g.add(body);
    const fin = new THREE.Mesh(gWingTip, matTeal); fin.position.set(0, 0.18, -0.5); g.add(fin);
    return g;
  }

  // ── B1 소형 크리처: 날카로운 사면체 본체 + 전방 핀(전·후 구분). AURORA와 혼동되지 않는 실루엣. ──
  function creatureB1() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(gCreatureBody, matEnemy); g.add(body);
    const fin = new THREE.Mesh(gCreatureFin, matEnemyEdge); fin.rotation.x = -Math.PI / 2; fin.position.z = 0.5; g.add(fin);
    return g;
  }

  // ── B4 Sniper: 긴 포신을 암시하는 좁고 긴 실루엣 + 발사점 포드. B1과 형태가 확실히 다름. ──
  function sniperB4() {
    const g = new THREE.Group();
    const body = rotZ(new THREE.Mesh(gSniperBody, matSniper)); g.add(body);
    const barrel = rotZ(new THREE.Mesh(gSniperBarrel, matSniperEdge)); barrel.position.z = 1.2; g.add(barrel);
    const pod = new THREE.Mesh(gSniperPod, matSniper); pod.position.z = -0.5; g.add(pod);
    const eye = new THREE.Mesh(gEBullet, matSniperEdge); eye.position.z = 1.9; g.add(eye);
    return g;
  }

  // ── B8 Reaper Lord: 명백히 큰 체급. 핵심부 + 장갑 링 + 좌우 클로(주무장). 실루엣이 공격 판독을 막지 않게 개방형. ──
  function reaperB8() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(gBossCore, matBossCore); g.add(core);
    const armor = new THREE.Mesh(gBossArmor, matBoss); armor.rotation.x = Math.PI / 2; g.add(armor);
    const armor2 = new THREE.Mesh(gBossArmor, matBoss); armor2.rotation.y = Math.PI / 2; armor2.scale.set(0.8, 0.8, 0.8); g.add(armor2);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(gBossClaw, matBoss); claw.rotation.x = -Math.PI / 2; claw.position.set(s * 1.6, 0, 0.8); g.add(claw);
      const tip = new THREE.Mesh(gGlow, matBossCore); tip.scale.set(0.5, 0.5, 0.5); tip.position.set(s * 1.6, 0, 1.7); g.add(tip);
    }
    const crown = new THREE.Mesh(gTrim, matBossCore); crown.scale.set(2, 2, 1.2); crown.position.y = 1.1; g.add(crown);
    return g;
  }

  function laser() { const m = new THREE.Mesh(gLaser, matLaser); return m; }         // scale.y 로 길이 조절
  function enemyBullet() { return new THREE.Mesh(gEBullet, matEBullet); }
  function lance() { const m = new THREE.Mesh(gLance, matLance); return m; }
  function pickup() { return new THREE.Mesh(gPickup, matPickup); }

  // ── 3레인 게이트: 원근상 실제 통과 지점과 판정 위치가 일치해야(§8). 레인 경계 기둥 + 바닥 바. ──
  function gate() { return new THREE.Group(); }   // 레인은 renderer 가 좌표로 배치(가변) → 여기선 부품 제공
  function gateBar() { return new THREE.Mesh(gGateBar, matGate); }

  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    geos.length = 0; mats.length = 0;
  }

  return {
    materials: { matEngine, matTeal, matMagenta, matGate },
    flagship, drone, droneInstanced, cruiser, creatureB1, sniperB4, reaperB8,
    laser, enemyBullet, lance, pickup, gate, gateBar, dispose,
    _counts: { geos: geos.length, mats: mats.length },
  };
}

export default { createModelKit, PALETTE };
