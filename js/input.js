// 입력 통합: 터치 드래그 / 마우스 이동 / ←→ 키 → 논리좌표 targetX 하나로 수렴
export function createInput(canvas, logicalW) {
  const input = { targetX: logicalW / 2, active: false };
  let keyDir = 0;
  const KEY_SPEED = 420; // 초당 px

  function toLogicalX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, ratio)) * logicalW;
  }

  canvas.addEventListener('pointerdown', (e) => {
    input.active = true;
    input.targetX = toLogicalX(e.clientX);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    // 데스크톱은 누르지 않아도 마우스를 따라가게, 터치는 드래그 중에만
    if (e.pointerType === 'mouse' || input.active) {
      input.targetX = toLogicalX(e.clientX);
    }
  });
  canvas.addEventListener('pointerup', () => { input.active = false; });
  canvas.addEventListener('pointercancel', () => { input.active = false; });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') keyDir = -1;
    else if (e.key === 'ArrowRight') keyDir = 1;
  });
  window.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowLeft' && keyDir === -1) || (e.key === 'ArrowRight' && keyDir === 1)) keyDir = 0;
  });

  /** 매 프레임 호출: 키보드 입력을 targetX에 반영 */
  input.tick = function (dt) {
    if (keyDir !== 0) {
      input.targetX = Math.max(0, Math.min(logicalW, input.targetX + keyDir * KEY_SPEED * dt));
    }
  };

  return input;
}
