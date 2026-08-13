// ── §G-35/§G-39 공용 — 실제 3D `frame()` 스모크에 쓰는 최소 스텁 2종 ──
//
//  원래 `tests/g35-frame-smoke.test.mjs` 안에 있던 `makeFakeRenderer`·`makeCanvas` 를 그대로 옮긴 것이다
//  (§G-39 Task 8). ⚠️로직을 복사하지 말 것 — 사본이 갈리면 한쪽만 통과하는 상태가 생긴다(G35 교훈,
//  task-8-brief.md 참고). 이 파일을 **유일한 원본**으로 삼고, g35·g39 등 모든 스모크 테스트가 여기서 import 한다.
//
//  ⚠️여기서 흉내 내는 것은 renderer 한 겹뿐이다(GPU 가 없는 헤드리스 Node 환경 대응) — 씬·카메라·
//   지오메트리·행렬 수학은 전부 진짜 THREE / 진짜 제품 코드가 돈다. THREE API 전체 mock 금지 원칙은
//   이 파일을 쓰는 모든 테스트에 동일하게 적용된다.

/** GPU 없이 THREE 가 요구하는 최소 표면만 갖춘 renderer. 렌더 호출을 세어 도달을 증명한다. */
export function makeFakeRenderer(THREE, canvas) {
  const state = { renders: 0, lastScene: null, lastCamera: null };
  const rt = { texture: { dispose() {} }, dispose() {} };
  const r = {
    __state: state,
    domElement: canvas,
    //  ── 실제로 호출되는 것들 ──
    render(scene, camera) { state.renders++; state.lastScene = scene; state.lastCamera = camera; },
    setSize() {}, setPixelRatio() {}, setViewport() {}, setScissor() {}, setScissorTest() {},
    setClearColor() {}, setClearAlpha() {}, clear() {}, clearDepth() {},
    compile() {}, dispose() {}, forceContextLoss() {},
    getContext: () => ({ getExtension: () => null, getParameter: () => 0 }),
    getPixelRatio: () => 1,
    getSize: (v) => (v && v.set ? v.set(canvas.width, canvas.height) : { width: canvas.width, height: canvas.height }),
    getRenderTarget: () => null, setRenderTarget() {},
    initTexture() {}, resetState() {},
    //  ── 속성(대입만 되고 읽히기도 한다) ──
    outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1,
    shadowMap: { enabled: false, type: 0 },
    capabilities: { isWebGL2: true, getMaxAnisotropy: () => 1, precision: 'highp' },
    extensions: { get: () => null, has: () => false },
    properties: { get: () => ({}), remove() {} },
    info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, programs: [], autoReset: true, reset() {} },
    xr: { enabled: false, isPresenting: false, addEventListener() {} },
    //  PMREM 은 제품 코드가 주입 모드에서 건너뛰지만, 혹시 불려도 죽지 않게 한다.
    _pmrem: rt,
  };
  return r;
}

/** 최소 canvas 스텁 — DOM 없이 `frame()` 이 읽는 속성만. */
export function makeCanvas(w = 480, h = 800) {
  return {
    width: w, height: h, clientWidth: w, clientHeight: h,
    style: { width: `${w}px`, height: `${h}px`, opacity: '0', visibility: 'hidden', display: 'block' },
    addEventListener() {}, removeEventListener() {},
    getContext: () => null,
  };
}
