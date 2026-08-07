// ── §G-9 3D 실모델 → 2D 스프라이트 렌더 도구(이사 "3D 이미지들도 2D 에 적용해 일관성 유지") ──
//  게임에는 포함되지 않는 개발 전용 페이지(tools/ 는 배포 빌드 매니페스트 밖).
//  구도 계약: 2D 원본과 같은 시점·같은 캔버스 비율로 뽑아야 히트박스·blit 배율(SHIP_ART_ASPECT 등)이 그대로 맞는다.
//   - 적·보스·픽업 = front(정면, 화면 위=+y) — 2D 원본이 "뿔 위·부리 아래" 정면 실루엣이다.
//   - 기함·아군    = top(위에서 내려봄, 화면 위=+z 노즈) — 2D 원본이 위에서 본 함선이다.
//  알파 배경 그대로 저장 → 파이썬이 트림·리사이즈·webp 변환해 실제 아트를 교체한다.
import * as THREE from '../js/vendor/three.module.js';
import { loadEnemyGlbParts } from '../js/chase3d-glb.js';
import { forgeEnvEquirect } from '../js/chase3d-aurora-materials.js';
import { ENEMY3D, ALLY3D, PICKUP3D, FLAG3D } from '../js/chase3d-prop-defs.js';

const CAP = 'http://127.0.0.1:9098/save?name=';
const log = (m) => { document.getElementById('log').textContent += '\n' + m; };

// 대상 = { out: 저장 이름, glb, rot(모델 로컬 보정), view: 'front'|'top' }
//  ⚠️캔버스는 여기서 원본 규격에 맞추지 않는다 — 정사각 SQ 에 개체만 타이트하게 뽑고,
//   원본 캔버스 규격·채움비 정합은 scripts/sprite_finalize.py 가 맡는다(원본 종횡비가 종마다 달라
//   여기서 맞추려다 20종 규격이 어긋났던 실측 사고 재발 방지 — 게임 blit 배율이 원본 비율에 묶여 있다).
const SQ = 768;
const TARGETS = [];
for (const [k, def] of Object.entries(ENEMY3D)) {
  if (!def.glb) continue;
  TARGETS.push({ out: `sprite_${k.toUpperCase()}`, glb: def.glb, rot: { rotX: def.rotX, rotY: def.rotY }, view: 'front' });
}
// 기함 6등급 → A1..A6 (게임 2D 는 A1=드론/T0, A2=순양함/T1, A3=T2, A4=T3, A5=T4, A6=T5)
[['A1', 0], ['A2', 1], ['A3', 2], ['A4', 3], ['A5', 4], ['A6', 5]].forEach(([name, tier]) => {
  const d = FLAG3D[tier];
  TARGETS.push({ out: `sprite_${name}`, glb: d.glb, rot: { rotX: d.rotX, rotY: d.rotY }, view: 'top' });
});
// 픽업(정면) — C1 크리스탈 / C5 보급 수송선
TARGETS.push({ out: 'sprite_C1', glb: PICKUP3D.crystal.glb, rot: {}, view: 'front' });
TARGETS.push({ out: 'sprite_C5', glb: PICKUP3D.pod.glb, rot: {}, view: 'front' });
for (const t of TARGETS) { t.w = SQ; t.h = SQ; }

const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
// 검사실과 같은 IBL + 조명(실전 3D 와 톤을 맞춰야 "일관성"이 성립)
const envRaw = forgeEnvEquirect(7);
const envTex = new THREE.DataTexture(envRaw.data, envRaw.w, envRaw.h, THREE.RGBAFormat, THREE.UnsignedByteType);
envTex.colorSpace = THREE.SRGBColorSpace; envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.needsUpdate = true;
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromEquirectangular(envTex);
scene.environment = envRT.texture;
pmrem.dispose(); envTex.dispose();
const key = new THREE.DirectionalLight(0xffe9cf, 2.5); key.position.set(-4.5, 6.5, 5.5);
const fill = new THREE.DirectionalLight(0x9fc2ff, 0.9); fill.position.set(5, 2.5, 3.5);
const rim = new THREE.DirectionalLight(0x8fe8ff, 1.0); rim.position.set(2.5, 3.2, -6.5);
const hemi = new THREE.HemisphereLight(0x2a3038, 0x0c0e12, 0.6);
const facing = new THREE.DirectionalLight(0xffe8dc, 1.25); facing.position.set(0, 2.0, 9);   // 카메라 쪽 정면광(실전 faceLight 대응)
scene.add(key, fill, rim, hemi, facing);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 400);

async function renderOne(t) {
  const holder = new THREE.Group();
  const parts = await loadEnemyGlbParts(THREE, '../' + t.glb, t.rot);
  for (const p of parts) holder.add(new THREE.Mesh(p.geo, p.mat));
  scene.add(holder);

  canvas.width = t.w; canvas.height = t.h;
  renderer.setPixelRatio(1); renderer.setSize(t.w, t.h, false);

  const box = new THREE.Box3().setFromObject(holder);
  const c = new THREE.Vector3(); box.getCenter(c);
  const s = new THREE.Vector3(); box.getSize(s);
  // 시점별 카메라 축과 화면 가로/세로에 대응하는 모델 치수
  //  top 은 순수 직하방이 아니라 앞으로 18° 기울인다 — 완전 평면은 함선이 뭉툭해 보여 원본의 날렵함이 죽는다(실측).
  const TILT = 18 * Math.PI / 180;
  let spanX, spanY;
  if (t.view === 'top') {
    camera.position.set(c.x, c.y + 50 * Math.cos(TILT), c.z + 50 * Math.sin(TILT));
    camera.up.set(0, Math.sin(TILT), Math.cos(TILT));                  // 화면 위 = +z(노즈)
    spanX = s.x; spanY = s.z * Math.cos(TILT) + s.y * Math.sin(TILT);
  } else {
    camera.position.set(c.x, c.y, c.z + 50); camera.up.set(0, 1, 0);   // 화면 위 = +y
    spanX = s.x; spanY = s.y;
  }
  camera.lookAt(c);
  // 정사각 캔버스에 개체를 타이트하게(여백 2%) — 규격·채움비 정합은 파이썬 마감 단계가 맡는다
  const margin = 1.02;
  const halfW = Math.max(spanX * margin / 2, (spanY * margin / 2) * (t.w / t.h));
  const halfH = halfW * (t.h / t.w);
  camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const data = canvas.toDataURL('image/png');
  await fetch(CAP + t.out + '.png', { method: 'POST', body: data });

  // 화면 미리보기(작게)
  const prev = document.createElement('canvas');
  prev.width = Math.round(t.w * 0.28); prev.height = Math.round(t.h * 0.28);
  prev.getContext('2d').drawImage(canvas, 0, 0, prev.width, prev.height);
  prev.title = t.out; document.getElementById('out').appendChild(prev);

  scene.remove(holder);
  holder.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  return `${t.out} ${t.w}x${t.h} span=${spanX.toFixed(2)}x${spanY.toFixed(2)}`;
}

const q = new URLSearchParams(location.search).get('run');
if (q) {
  const list = q === '1' ? TARGETS : TARGETS.filter((t) => t.out.toLowerCase().endsWith('_' + q.toLowerCase()));
  log(`대상 ${list.length}종 렌더 시작`);
  (async () => {
    for (const t of list) { try { log(await renderOne(t)); } catch (e) { log(`${t.out} 실패: ${e && e.message}`); } }
    log('DONE');
    window.__SPRITE_DONE = true;
  })();
}
window.__SPRITE_TARGETS = TARGETS;
