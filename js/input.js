// 입력 통합: 이동(터치 드래그 / 마우스 위치 / ←→ 키) → targetX,  충전(좌클릭·충전버튼) → charging
export function createInput(canvas, logicalW, opts = {}) {
  const input = { targetX: logicalW / 2, active: false, charging: false, skipRequested: false };
  // 카메라 역변환 콜백(주입 — input이 카메라 모듈을 직접 import하지 않게). 없으면 항등(줌 미적용).
  const s2w = typeof opts.screenToWorldX === 'function' ? opts.screenToWorldX : (x) => x;
  const clampWorld = (x) => Math.max(0, Math.min(logicalW, x));
  let lastScreenX = logicalW / 2;   // 마지막 마우스/터치의 '화면 논리 X'(카메라가 변해도 이 값을 다시 역변환)
  let lastPointerType = '';         // 'mouse' | 'touch' | 'key' — 매 프레임 재계산 대상 판별
  /** 연출(컷신) 건너뛰기 래치. 읽으면 소진된다 — 시작 시 clearSkip()으로 먼저 비운 뒤 쓴다. */
  input.consumeSkip = function () { const v = input.skipRequested; input.skipRequested = false; return v; };
  input.clearSkip = function () { input.skipRequested = false; };
  let keyDir = 0;
  const KEY_SPEED = 420; // 초당 px

  function toLogicalX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, ratio)) * logicalW;
  }

  /** 화면 논리 X를 기억하고 카메라 역변환 → 월드 목표 X. 마우스·터치 공용. zoom=1이면 항등(기존 동작). */
  function applyScreenX(clientX, type) {
    lastScreenX = toLogicalX(clientX);
    lastPointerType = type;
    input.targetX = clampWorld(s2w(lastScreenX));
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') input.skipRequested = true;   // 마우스 좌클릭=차지라 제외, 터치 탭만 건너뛰기
    if (e.pointerType === 'mouse') {
      // 데스크톱: 좌클릭 홀드 = 충전. 이동은 마우스 위치로(아래 pointermove) — 클릭이 함선을 점프시키지 않음.
      if (e.button === 0) input.charging = true;
    } else {
      // 터치/펜: 드래그로 이동 (충전은 별도 화면 버튼). 확대 배율만 역변환(§6.8, 기존 조작 유지).
      input.active = true;
      applyScreenX(e.clientX, 'touch');
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    // 데스크톱은 누르지 않아도 마우스를 따라가게, 터치는 드래그 중에만. 화면 X를 카메라로 역변환(§6).
    if (e.pointerType === 'mouse') applyScreenX(e.clientX, 'mouse');
    else if (input.active) applyScreenX(e.clientX, 'touch');
  });
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') input.charging = false;
    input.active = false;
  });
  canvas.addEventListener('pointercancel', () => { input.active = false; input.charging = false; });
  // 캔버스 밖에서 마우스를 놓아도 충전 해제 (버튼이 눌린 채 남는 것 방지)
  window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') input.charging = false; });
  window.addEventListener('blur', () => { input.charging = false; });

  // 연출 건너뛰기는 '조작에 안 쓰는 키'의 새 입력만 인정한다.
  // 이동(←→·A·D)·차지(Space)는 전투 중 계속 눌려 있고 키 반복까지 발생해서,
  // 그대로 두면 보스를 잡자마자 컷신이 즉시 스킵된다(이사: "컷신이 반짝하고 사라졌다").
  const PLAY_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', ' ']);
  window.addEventListener('keydown', (e) => {
    if (!e.repeat && !PLAY_KEYS.has(e.key) && e.code !== 'Space') input.skipRequested = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keyDir = -1; lastPointerType = 'key'; }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keyDir = 1; lastPointerType = 'key'; }
    else if (e.key === ' ' || e.code === 'Space') { input.charging = true; e.preventDefault(); } // 스페이스바 홀드 = 차지 랜스 (키보드 플레이)
  });
  window.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && keyDir === -1) keyDir = 0;
    else if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && keyDir === 1) keyDir = 0;
    else if (e.key === ' ' || e.code === 'Space') input.charging = false; // 놓으면 랜스 발사
  });

  /** 매 프레임 호출: 키보드 이동 반영 + (마우스/터치 제어 시) 화면 X를 현재 카메라로 다시 역변환 */
  input.tick = function (dt) {
    if (keyDir !== 0) {
      input.targetX = clampWorld(input.targetX + keyDir * KEY_SPEED * dt);   // 키보드: 기존 속도·월드 경계 그대로
      return;
    }
    // 마우스 호버 또는 터치 드래그 중이면 기억한 화면 X를 '현재' 카메라로 다시 역변환한다.
    //  → 줌이 부드럽게 변하는 중(마우스 정지)에도 함선 목표가 화면상 마우스에 정합되어 튀지 않는다(§6.5·§6.6).
    if (lastPointerType === 'mouse' || (lastPointerType === 'touch' && input.active)) {
      input.targetX = clampWorld(s2w(lastScreenX));
    }
  };

  //  §G-35 P0-2/P0-3: 카메라 정책이 **입력 수단**에 따라 갈린다(Codex 6차 §2).
  //   포인터(마우스·터치 드래그)는 카메라 목표를 화면 포인터 위치에서 정해 폐루프를 끊고,
  //   키보드는 화면 정합 문제가 없으므로 기함 기반 데드존을 쓴다.
  //  ⚠️읽기 전용 스냅샷이다 — 카메라 쪽이 input 내부 상태를 직접 만지지 않게 한다.
  input.controlState = () => ({
    mode: lastPointerType || 'key',          // 'mouse' | 'touch' | 'key'
    screenX: lastScreenX,                    // 마지막 논리 화면 x
    touchActive: lastPointerType === 'touch' && !!input.active,
    //  포인터 정합을 적용해야 하는 상태인가 — 마우스는 항상, 터치는 드래그 중에만.
    pointerDriven: lastPointerType === 'mouse' || (lastPointerType === 'touch' && !!input.active),
  });

  return input;
}
