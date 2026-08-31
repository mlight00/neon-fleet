// rush/track.js — 시드 하나로 판 전체를 결정한다(오늘의 도전 재현성의 근거).
import { BAL } from './balance.js';
import { mulberry32 } from './rng.js';
import { makeGatePair } from './gates.js';

const WAVE_KINDS = ['scrapbit', 'scrapbit', 'ramhound', 'needleeye', 'wallguard'];  // 잡졸 가중

export function buildTrack(seed) {
  const rnd = mulberry32(seed);
  const T = BAL.track, events = [];
  for (let z = T.firstGateZ; z < T.bossZ - 200; z += T.gateEvery) {
    const t = z / T.bossZ;
    events.push({ z: Math.round(z), type: 'gatepair', data: makeGatePair(rnd, t) });
    for (let w = z + 90; w < z + T.gateEvery - 60; w += T.waveEvery) {
      const kind = WAVE_KINDS[(rnd() * WAVE_KINDS.length) | 0];
      const [lo, hi] = BAL.enemies[kind].count;
      events.push({ z: Math.round(w), type: 'wave', data: { kind, n: lo + ((rnd() * (hi - lo + 1)) | 0) } });
    }
  }
  events.push({ z: T.bossZ, type: 'boss', data: {} });
  events.sort((a, b) => a.z - b.z);
  return { events, length: T.bossZ };
}
