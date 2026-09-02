// rush/track.js — 시드 하나로 판 전체를 결정한다(오늘의 도전 재현성의 근거).
//  판 = 5구간. 구간마다 신규 적 2종이 풀에 합류(누적, 신규는 가중 2배)하고, 구간 끝에 그 구간의 보스.
import { BAL } from './balance.js';
import { mulberry32 } from './rng.js';
import { makeGatePair } from './gates.js';

//  구간 i 에 처음 등장하는 적(등장 순서 = 프롬프트 v4 배치표)
export const ZONE_NEW_KINDS = [
  ['scrapbit', 'wheeler'],
  ['ramhound', 'signaler'],
  ['wallguard', 'cartyard'],
  ['needleeye', 'manholejumper'],
  ['spawnpod', 'magnethead'],
];

export function zonePool(zone) {
  const pool = [];
  for (let i = 0; i <= zone && i < ZONE_NEW_KINDS.length; i++) {
    const w = i === zone ? 2 : 1;                    // 신규 종 가중 2배
    for (let k = 0; k < w; k++) pool.push(...ZONE_NEW_KINDS[i]);
  }
  return pool;
}

export function buildTrack(seed) {
  const rnd = mulberry32(seed);
  const T = BAL.track, events = [];
  for (let zi = 0; zi < T.zones; zi++) {
    const z0 = zi * T.zoneLen;
    const pool = zonePool(zi);
    for (let z = z0 + T.firstGateZ; z < z0 + T.zoneLen - 900; z += T.gateEvery) {   // 보스 앞 900은 게이트 없는 전투 구간
      const t = z / T.length;
      const isLastGateOfZone = z + T.gateEvery >= z0 + T.zoneLen - 900;
      events.push({ z: Math.round(z), type: 'gatepair', data: makeGatePair(rnd, t, isLastGateOfZone) });
      for (let w = z + 90; w < z + T.gateEvery - 60; w += T.waveEvery) {
        const roll = rnd();
        if (roll < 0.14) {                             // 보급 컨테이너 — 쏴서 깨면 병력(게이트 밖의 성장 축)
          events.push({ z: Math.round(w), type: 'wave', data: { kind: 'supply', n: 1 } });
          continue;
        }
        if (roll < 0.19) {                             // POW 뱃지 — 주우면 5초 버스터
          events.push({ z: Math.round(w), type: 'wave', data: { kind: 'pow', n: 1 } });
          continue;
        }
        const kind = pool[(rnd() * pool.length) | 0];
        const [lo, hi] = BAL.enemies[kind].count;
        events.push({ z: Math.round(w), type: 'wave', data: { kind, n: lo + ((rnd() * (hi - lo + 1)) | 0) } });
      }
    }
    events.push({ z: z0 + T.zoneLen, type: 'boss', data: { zone: zi } });
  }
  events.sort((a, b) => a.z - b.z || (a.type === 'boss' ? 1 : -1));
  return { events, length: T.length };
}
