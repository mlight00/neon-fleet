// 입력 통합: 이동(터치 드래그 / 마우스 위치 / ←→ 키) → targetX,  충전(좌클릭·충전버튼) → charging
export function createInput(canvas, logicalW) {
  const input = { targetX: logicalW / 2, active: false, charging: false };
  let keyDir = 0;
  const KEY_SPEED = 420; // 초당 px

  function toLogicalX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, ratio)) * logicalW;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      // 데스크톱: 좌클릭 홀드 = 충전. 이동은 마우스 위치로(아래 pointermove) — 클릭이 함선을 점프시키지 않음.
      if (e.button === 0) input.charging = true;
    } else {
      // 터치/펜: 드래그로 이동 (충전은 별도 화면 버튼)
      input.active = true;
      input.targetX = toLogicalX(e.clientX);
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    // 데스크톱은 누르지 않아도 마우스를 따라가게, 터치는 드래그 중에만
    if (e.pointerType === 'mouse' || input.active) input.targetX = toLogicalX(e.clientX);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') input.charging = false;
    input.active = false;
  });
  canvas.addEventListener('pointercancel', () => { input.active = false; input.charging = false; });
  // 캔버스 밖에서 마우스를 놓아도 충전 해제 (버튼이 눌린 채 남는 것 방지)
  window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') input.charging = false; });
  window.addEventListener('blur', () => { input.charging = false; });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keyDir = -1;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keyDir = 1;
    else if (e.key === ' ' || e.code === 'Space') { input.charging = true; e.preventDefault(); } // 스페이스바 홀드 = 차지 랜스 (키보드 플레이)
  });
  window.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && keyDir === -1) keyDir = 0;
    else if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && keyDir === 1) keyDir = 0;
    else if (e.key === ' ' || e.code === 'Space') input.charging = false; // 놓으면 랜스 발사
  });

  /** 매 프레임 호출: 키보드 입력을 targetX에 반영 */
  input.tick = function (dt) {
    if (keyDir !== 0) {
      input.targetX = Math.max(0, Math.min(logicalW, input.targetX + keyDir * KEY_SPEED * dt));
    }
  };

  return input;
}
