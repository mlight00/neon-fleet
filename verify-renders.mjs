const THREE = await import('./js/vendor/three.module.js');
const { createChase3D } = await import('./js/chase3d-renderer.js');
const { makeCanvas, makeFakeRenderer } = await import('./tests/lib/frame-smoke-harness.mjs');

/** 실제 THREE 로 만든 얇은 적 파트 팩토리(파트 2개) */
function twoPartFactory() {
  return () => [0, 1].map(() => ({
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  }));
}

const ctl = createChase3D(makeCanvas(), {
  hero: true, profile: { mobile: false, lod: 0, pixelRatio: 1 },
  createRenderer: (T, c) => makeFakeRenderer(T, c),
  createEnemyParts: twoPartFactory(),
});

const mk = (cr, cg, cb) => ({ sx: 240, sy: 500, px: 60, wob: 0, cr, cg, cb });
const run = { squad: { x: 240, y: 670, dead: false, tier: 0, weapon: 'vulcan', weaponLv: 1,
  count: 8, cruisers: 0, hp: 100, maxHp: 100, charge: 0, chargeStage: 0, escortsFor3D: () => 0 },
  phase: 'track', world: { squad: {}, entities: [], bullets: [], enemyBullets: [] }, bosses: [] };
const swarms = { props: {}, drone: { buf: [], n: 0 }, cruiser: { buf: [], n: 0 } };

const paint = (slot) => { swarms.b1 = { buf: [slot], n: 1 };
  ctl.frame(run, 2.2, 480, 800, 480, 800, 1, 0, swarms); };

console.log('Before paint:');
console.log('  renders:', ctl.renderer.__state.renders);

paint(mk(1, 1, 1));
console.log('After paint 1 (HP100%):');
console.log('  renders:', ctl.renderer.__state.renders);

paint(mk(1, 0.35, 0.28));
console.log('After paint 2 (low health):');
console.log('  renders:', ctl.renderer.__state.renders);

paint(mk(2.4, 2.4, 2.4));
console.log('After paint 3 (hit flash):');
console.log('  renders:', ctl.renderer.__state.renders);

console.log('\nAssertion check (renders >= 3):', ctl.renderer.__state.renders >= 3);
