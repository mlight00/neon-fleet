import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  framesFrom, frameById, createFrameState, setFrame, frameOnKill, tickFrame,
  frameDamageMult, frameInvulnActive, frameHud,
} from '../js/command-frames.js';
import { BAL } from '../js/balance.js';

const CFG = BAL.gate1.frames;

// Gate 1 §5.7 — 세 프레임 데이터 구조 + 최소 한 번의 자동 발동 검증.

test('세 프레임이 교리를 흡수하고 각기 다른 자동 스킬·발광색을 가진다', () => {
  const frames = framesFrom(CFG);
  assert.equal(frames.length, 3);
  assert.deepEqual(frames.map((f) => f.id), ['assault', 'carrier', 'phase']);
  // 교리 흡수(중복 적용 방지용 매핑)
  assert.equal(frameById(CFG, 'assault').doctrine, 'lance');
  assert.equal(frameById(CFG, 'carrier').doctrine, 'swarm');
  assert.equal(frameById(CFG, 'phase').doctrine, 'phase');
  // 발광색이 서로 다르다(단순 배수 하나가 아님)
  const glows = frames.map((f) => f.glow);
  assert.equal(new Set(glows).size, 3);
});

test('어썰트: 처치 누적 → 전방 집중 자동 발동(피해 창)', () => {
  const s = createFrameState();
  setFrame(s, 'assault');
  const per = CFG.assault.auto.killsPerProc;
  let proc = null;
  for (let i = 0; i < per; i++) proc = frameOnKill(s, CFG);
  assert.ok(proc && proc.type === 'focus');
  assert.equal(proc.dmgMult, CFG.assault.auto.focusDmgMult);
  // 집중 창 동안 피해 배수 적용
  assert.equal(frameDamageMult(s, CFG), CFG.assault.auto.focusDmgMult);
  // 창이 끝나면 1로 복귀
  tickFrame(s, CFG, CFG.assault.auto.focusDuration + 0.1);
  assert.equal(frameDamageMult(s, CFG), 1);
});

test('캐리어: 주기마다 호위 동기화 일제사격 자동 발동', () => {
  const s = createFrameState();
  setFrame(s, 'carrier');
  const iv = CFG.carrier.auto.intervalSec;
  let fired = 0;
  for (let t = 0; t < iv * 2 + 0.5; t += 0.5) { const r = tickFrame(s, CFG, 0.5); if (r?.type === 'volley') fired++; }
  assert.equal(fired, 2);   // 두 주기 동안 2회
});

test('페이즈: RUSH 시작 신호에서 위상 돌파(무적) 자동 발동 (G1-05)', () => {
  const s = createFrameState();
  setFrame(s, 'phase');
  // FLOW는 max 도달 즉시 0이 되므로 임계값이 아니라 RUSH 시작 신호로 발동한다.
  const noRush = tickFrame(s, CFG, 0.5, { flow: 0, rushStarted: false });
  assert.equal(noRush, null);
  const proc = tickFrame(s, CFG, 0.5, { flow: 0, rushStarted: true });
  assert.ok(proc && proc.type === 'dash');
  assert.equal(frameInvulnActive(s), true);         // 위상 돌파 무적
});

test('페이즈: rushStarted 미제공 시 flowThreshold 폴백(단위 호환)', () => {
  const s = createFrameState();
  setFrame(s, 'phase');
  assert.equal(tickFrame(s, CFG, 0.5, { flow: CFG.phase.auto.flowThreshold - 1 }), null);
  assert.ok(tickFrame(s, CFG, 0.5, { flow: CFG.phase.auto.flowThreshold })?.type === 'dash');
});

test('프레임 미선택이면 자동 스킬·배수 중립', () => {
  const s = createFrameState();
  assert.equal(frameOnKill(s, CFG), null);
  assert.equal(tickFrame(s, CFG, 1, { flow: 999 }), null);
  assert.equal(frameDamageMult(s, CFG), 1);
  assert.equal(frameInvulnActive(s), false);
});

test('frameHud: 아이콘·발광색 노출, 미선택은 중립', () => {
  assert.equal(frameHud(CFG, 'assault').icon, CFG.assault.icon);
  assert.equal(frameHud(CFG, null).icon, '');
});
