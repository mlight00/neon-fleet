// rush3/input.js — 순수 입력 상태(계약서 6장 입력). DOM 없음: 셸이 이벤트를 논리 좌표로 바꿔 넘긴다.
//  마우스 = 호버 절대 x(pointerX). 터치·펜 = 드래그 상대 이동(dragDx 누적, 손가락 댄 위치로 튀지 않는다).
//  드래그는 처음 댄 손가락(pointerId) 하나만 따라간다: 다른 손가락·마우스 이벤트는 드래그 중 무시(누적 금지).
//  좌우 키 = keyDir(-1/0/1). pointercancel·blur → reset(드래그 해제 + dragDx 0).
//  snapshot() 이 STEP 직전 입력 { pointerX, dragDx, keyDir } 을 주고 dragDx 를 소비한다.

export function createInput() {
  const state = { pointerX: null, dragDx: 0, keyDir: 0, dragging: false, pointerId: null, lastX: null, left: false, right: false };
  const isMouse = (pointerType) => pointerType === 'mouse' || pointerType === undefined || pointerType === null;
  //  id 가 없는 호출(테스트·구형 환경)은 드래그 중인 손가락으로 간주한다
  const isDragPointer = (id) => id === undefined || id === null || state.pointerId === null || id === state.pointerId;

  function onPointerDown(x, pointerType, id) {
    //  드래그 중에는 어떤 down 도 받지 않는다(둘째 손가락·마우스 클릭이 lastX 를 덮어쓰지 않게)
    if (state.dragging) return;
    if (isMouse(pointerType)) { state.pointerX = x; return; }
    //  터치: 절대 위치를 쓰지 않는다(이후 이동량만 누적). 마우스 호버 값이 남아 있으면 지운다
    state.pointerX = null;
    state.dragging = true;
    state.pointerId = id === undefined ? null : id;
    state.lastX = x;
  }
  function onPointerMove(x, pointerType, id) {
    if (!state.dragging) {
      if (isMouse(pointerType)) state.pointerX = x;
      return;
    }
    //  드래그 중: 마우스·다른 손가락의 이동은 누적하지 않는다
    if (isMouse(pointerType) || !isDragPointer(id)) return;
    if (state.lastX !== null) state.dragDx += x - state.lastX;
    state.lastX = x;
  }
  function onPointerUp(id) {
    //  드래그 중인 손가락이 아닌 up(둘째 손가락·마우스)은 드래그를 끝내지 않는다
    if (state.dragging && !isDragPointer(id)) return;
    state.dragging = false;
    state.pointerId = null;
    state.lastX = null;
  }
  function reset() {
    state.pointerX = null;
    state.dragDx = 0;
    state.keyDir = 0;
    state.dragging = false;
    state.pointerId = null;
    state.lastX = null;
    state.left = false;
    state.right = false;
  }
  function onPointerCancel() { reset(); }
  function onKey(code, down) {
    if (code === 'ArrowLeft' || code === 'KeyA') state.left = !!down;
    else if (code === 'ArrowRight' || code === 'KeyD') state.right = !!down;
    else return false;
    state.keyDir = (state.right ? 1 : 0) - (state.left ? 1 : 0);
    return true;
  }
  //  STEP 직전 스냅샷. dragDx 는 여기서 소비(같은 프레임의 두 번째 STEP 부터는 0)
  function snapshot() {
    const out = { pointerX: state.pointerX, dragDx: state.dragDx, keyDir: state.keyDir };
    state.dragDx = 0;
    return out;
  }
  return { state, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKey, snapshot, reset };
}
