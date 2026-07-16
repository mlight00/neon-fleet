// 전면 개편 Phase A — 스토리/구역/성장 연출의 단일 기준점.
// 수치 밸런스와 분리해, 연출을 바꿔도 전투 계산에는 영향을 주지 않는다.

export const STORY = Object.freeze({
  flagship: 'NF-0 LUMEN',
  ai: 'ECHO-7',
  enemy: 'THE CHORUS',
  core: 'NEON CORE',
  promise: '회수한 빛으로 함선을 다시 만들고, 다음 지배자를 돌파한다.',
});

export const ZONES = Object.freeze([
  { id: 'cold-wake', name: 'COLD WAKE', korName: '차가운 항적', start: '#040814', end: '#102746', glow: '#5de9ff', accent: '#a7c7ff', motif: 'moon' },
  { id: 'prism-grave', name: 'PRISM GRAVE', korName: '프리즘 묘역', start: '#09071b', end: '#32185a', glow: '#c46bff', accent: '#71f4ff', motif: 'prism' },
  { id: 'furnace-line', name: 'FURNACE LINE', korName: '용광로 전선', start: '#16070a', end: '#5a1c12', glow: '#ff8748', accent: '#ffd56a', motif: 'sun' },
  { id: 'broken-armada', name: 'BROKEN ARMADA', korName: '부서진 함대', start: '#050b13', end: '#19343a', glow: '#63d9c7', accent: '#ffb45f', motif: 'wreck' },
  { id: 'choir-veil', name: 'CHOIR VEIL', korName: '합창의 장막', start: '#080510', end: '#32103d', glow: '#ff4cd2', accent: '#b44cff', motif: 'veil' },
  { id: 'crown-core', name: 'CROWN CORE', korName: '왕관 핵', start: '#02050a', end: '#191126', glow: '#ffe17a', accent: '#ff4cd2', motif: 'crown' },
]);

export function zoneForSector(sector = 1) {
  const index = Math.min(ZONES.length - 1, Math.floor((Math.max(1, sector) - 1) / 2));
  return ZONES[index];
}

export const UPGRADE_DURATIONS = Object.freeze([0, 0.46, 0.64, 0.84, 1.08, 1.36]);

/** 연출 등급 U1~U5. 전투 수치는 건드리지 않고 시각적 중요도만 정한다. */
export function upgradeGrade(kind, level = 1) {
  if (kind === 'flagship') return 5;
  if (kind === 'super') return 5;
  if (kind === 'evolution') return 4;
  if (kind === 'switch') return 2;
  return Math.max(1, Math.min(3, Number(level) || 1));
}

export function flagshipProfile(tier = 0) {
  const safeTier = Math.max(0, Math.min(5, tier | 0));
  return {
    tier: safeTier,
    frameScale: 0.82 + safeTier * 0.075,
    commandLights: 2 + safeTier,
    mountPresence: 0.72 + safeTier * 0.08,
  };
}
