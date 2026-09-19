// rush3/input.js — 순수 입력 상태(계약서 6장 입력). DOM 없음: 셸이 이벤트를 논리 좌표로 바꿔 넘긴다.
//  마우스 = 호버 절대 x(pointerX). 터치·펜 = 드래그 상대 이동(dragDx 누적, 손가락 댄 위치로 튀지 않는다).
//  드래그는 처음 댄 손가락(pointerId) 하나만 따라간다: 다른 손가락·마우스 이벤트는 드래그 중 무시(누적 금지).
//  좌우 키 = keyDir(-1/0/1). pointercancel·blur → reset(드래그 해제 + dragDx 0).
//  snapshot() 이 STEP 직전 입력 { pointerX, dragDx, keyDir, dragDy, keyDirY } 을 주고 dragDx·dragDy 를 소비한다.
//
//  세로 입력(r3.17 아레나): dragDy = 터치 드래그·마우스 이동의 **상대** y 누적(소비 뒤 0) · keyDirY = ↓·S(+1) − ↑·W(−1).
//   마우스는 x 가 절대(호버)인데 y 는 상대다 — 아레나 진입 순간 마우스 위치로 부대가 위아래로 튀지 않게(01 §5-1 을 상하에도 적용).
//   첫 이동은 lastY 가 null 이라 0. onPointerDown/onPointerMove 의 y 는 **뒤에 붙는 선택 인자**(기존 호출 무변경, 없으면 세로는 0).
//   아레나 밖(도로)에서는 combat 이 dragDy·keyDirY 를 읽지 않는다.
//
//  장치 우선순위(계약서 6장) = 마지막으로 쓴 장치가 이긴다. state.device 에 'mouse'|'touch'|'key' 로 남는다.
//   - 키를 누르는 순간 마우스 목표를 지운다(pointerX = null). 키를 놓아도 pointerX 는 null 그대로라
//     옛 마우스 위치로 되돌아가지 않는다(다음 마우스 이동 전까지).
//   - 마우스를 움직이면 눌린 키 상태·keyDir·keyDirY 를 지운다 → 마우스 조작 재개(키는 다시 눌러야 듣는다).
//   - 드래그가 시작되면 마우스 목표와 키 방향을 둘 다 지우고, 드래그 중 키 입력은 방향에 반영하지 않는다(드래그 우선).
//  즉 셋 중 하나만 살아 있으므로 combat 1단계에서 서로 덮어쓰는 일이 없다.

//  조향 키 판정. 셸의 자동반복 가드(main.js keydown)가 같은 판정을 써야 해서 밖으로 뺀다(계약서 6장).
//  r3.17: 위/아래·W/S 도 조향 키(아레나 상하 이동). 셸이 preventDefault 하므로 화살표의 페이지 스크롤도 함께 막힌다
export function isSteerKey(code) {
  return code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD'
      || code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowDown' || code === 'KeyS';
}

export function createInput() {
  const state = { pointerX: null, dragDx: 0, keyDir: 0, dragging: false, pointerId: null, lastX: null, left: false, right: false, device: null,
                  dragDy: 0, lastY: null, up: false, down: false, keyDirY: 0 };
  const isMouse = (pointerType) => pointerType === 'mouse' || pointerType === undefined || pointerType === null;
  //  id 가 없는 호출(테스트·구형 환경)은 드래그 중인 손가락으로 간주한다
  const isDragPointer = (id) => id === undefined || id === null || state.pointerId === null || id === state.pointerId;
  //  눌린 키 상태까지 해제한다(놓을 때의 keyup 이 와도 방향이 되살아나지 않게). 네 방향 모두
  function clearKeys() { state.left = false; state.right = false; state.keyDir = 0; state.up = false; state.down = false; state.keyDirY = 0; }
  //  세로 상대 이동 누적(마우스·드래그 공용). y 가 없으면 아무것도 하지 않는다(종전 호출)
  function accY(y) {
    if (!Number.isFinite(y)) return;
    if (state.lastY !== null) state.dragDy += y - state.lastY;
    state.lastY = y;
  }

  function onPointerDown(x, pointerType, id, y) {
    //  드래그 중에는 어떤 down 도 받지 않는다(둘째 손가락·마우스 클릭이 lastX 를 덮어쓰지 않게)
    if (state.dragging) return;
    if (isMouse(pointerType)) { state.pointerX = x; state.device = 'mouse'; clearKeys(); if (Number.isFinite(y)) state.lastY = y; return; }
    //  터치: 절대 위치를 쓰지 않는다(이후 이동량만 누적). 마우스 호버 값·키 방향은 여기서 해제
    state.pointerX = null;
    clearKeys();
    state.dragging = true;
    state.device = 'touch';
    state.pointerId = id === undefined ? null : id;
    state.lastX = x;
    state.lastY = Number.isFinite(y) ? y : null;
  }
  function onPointerMove(x, pointerType, id, y) {
    if (!state.dragging) {
      if (isMouse(pointerType)) { state.pointerX = x; state.device = 'mouse'; clearKeys(); accY(y); }
      return;
    }
    //  드래그 중: 마우스·다른 손가락의 이동은 누적하지 않는다
    if (isMouse(pointerType) || !isDragPointer(id)) return;
    if (state.lastX !== null) state.dragDx += x - state.lastX;
    state.lastX = x;
    accY(y);
    state.device = 'touch';
  }
  function onPointerUp(id) {
    //  드래그 중인 손가락이 아닌 up(둘째 손가락·마우스)은 드래그를 끝내지 않는다
    if (state.dragging && !isDragPointer(id)) return;
    state.dragging = false;
    state.pointerId = null;
    state.lastX = null;
    state.lastY = null;
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
    state.device = null;
    state.dragDy = 0;
    state.lastY = null;
    state.up = false;
    state.down = false;
    state.keyDirY = 0;
  }
  function onPointerCancel() { reset(); }
  //  아는 키면 true(셸이 preventDefault 한다). 드래그 중에는 방향에 반영하지 않되 키로는 인정한다.
  function onKey(code, down) {
    if (!isSteerKey(code)) return false;
    const left = code === 'ArrowLeft' || code === 'KeyA';
    const right = code === 'ArrowRight' || code === 'KeyD';
    const up = code === 'ArrowUp' || code === 'KeyW';
    const dn = code === 'ArrowDown' || code === 'KeyS';
    if (state.dragging) return true;
    if (left) state.left = !!down; else if (right) state.right = !!down; else if (up) state.up = !!down; else if (dn) state.down = !!down;
    state.keyDir = (state.right ? 1 : 0) - (state.left ? 1 : 0);
    state.keyDirY = (state.down ? 1 : 0) - (state.up ? 1 : 0);
    //  누르는 순간 마우스 목표 해제 = 이후 STEP 이 옛 마우스 위치로 tx 를 덮어쓰지 않는다
    if (down) { state.pointerX = null; state.device = 'key'; }
    return true;
  }
  //  STEP 직전 스냅샷. dragDx·dragDy 는 여기서 소비(같은 프레임의 두 번째 STEP 부터는 0)
  function snapshot() {
    const out = { pointerX: state.pointerX, dragDx: state.dragDx, keyDir: state.keyDir, dragDy: state.dragDy, keyDirY: state.keyDirY };
    state.dragDx = 0;
    state.dragDy = 0;
    return out;
  }
  return { state, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKey, snapshot, reset };
}
