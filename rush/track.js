// rush/track.js — 시드 하나로 판 전체를 결정한다(오늘의 도전 재현성의 근거).
//  판 = 5구간. 구간마다 신규 적 2종이 풀에 합류(누적, 신규는 가중 2배)하고, 구간 끝에 그 구간의 보스.
import { BAL } from './balance.js';
import { mulberry32 } from './rng.js';
import { makeGatePair } from './gates.js';

const lerp = (a, b, t) => a + (b - a) * t;

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
    const zStart = z0 + (zi === 0 ? T.firstGateZ : 1000);   // 보스 격파 직후엔 숨돌릴 여유
    for (let z = zStart; z < z0 + T.zoneLen - 900; z += T.gateEvery) {   // 보스 앞 900은 게이트 없는 전투 구간
      const t = z / T.length;
      const isLastGateOfZone = z + T.gateEvery >= z0 + T.zoneLen - 900;
      //  손제작 장면(약 30%): 숫자 비교가 아니라 '경로의 위험'이 다른 선택 — 안전 vs 욕심
      const sceneRoll = rnd();
      if (!isLastGateOfZone && sceneRoll < 0.4) {
        const g = BAL.gates;
        const base = Math.max(3, Math.round(lerp(g.addMin, g.addMax, t)));
        const flip = rnd() < 0.5;                      // 좌우 무작위 배치
        const greedLane = flip ? 'L' : 'R';            // 보상(큰 게이트·보급·POW)이 있는 욕심 라인
        const scene = (rnd() * 3) | 0;
        if (scene === 0) {
          //  S1 편한 소 vs 지키는 대: 큰 +게이트 라인에 적 무리가 버틴다
          const small = { op: 'add', value: Math.round(base * 0.6) || 1 };
          const big = { op: 'add', value: Math.round(base * 1.5) + 2 };
          events.push({ z: Math.round(z), type: 'gatepair', data: flip ? { left: big, right: small } : { left: small, right: big } });
          const kind = pool[(rnd() * pool.length) | 0];
          const [lo, hi] = BAL.enemies[kind].count;
          events.push({ z: Math.round(z + 80), type: 'wave', data: { kind, n: hi, lane: greedLane } });
          events.push({ z: Math.round(z + 240), type: 'wave', data: { kind, n: Math.max(1, hi - 1), lane: greedLane } });
        } else if (scene === 1) {
          //  S2 즉시 증원 vs 큰 보급: -게이트 라인 뒤에 큰 보급이 숨어 있다(부수면 역전)
          const plus = { op: 'add', value: base };
          const minus = { op: 'sub', value: Math.round(base * 0.7) || 1 };
          events.push({ z: Math.round(z), type: 'gatepair', data: flip ? { left: minus, right: plus } : { left: plus, right: minus } });
          events.push({ z: Math.round(z + 200), type: 'wave', data: { kind: 'supply', n: 1, lane: greedLane } });
        } else {
          //  S3 지키는 보급: 적 러시 두 겹 뒤에 큰 보급 — 뚫어낸 자에게 병력
          events.push({ z: Math.round(z), type: 'gatepair', data: makeGatePair(rnd, t, true) });
          const kind = pool[(rnd() * pool.length) | 0];
          const [lo, hi] = BAL.enemies[kind].count;
          events.push({ z: Math.round(z + 120), type: 'wave', data: { kind, n: hi, lane: greedLane } });
          events.push({ z: Math.round(z + 260), type: 'wave', data: { kind, n: hi, lane: greedLane } });
          events.push({ z: Math.round(z + 420), type: 'wave', data: { kind: 'supply', n: 1, lane: greedLane } });
        }
        continue;
      }
      events.push({ z: Math.round(z), type: 'gatepair', data: makeGatePair(rnd, t, isLastGateOfZone) });
      for (let w = z + 90; w < z + T.gateEvery - 60; w += T.waveEvery) {
        const roll = rnd();
        if (roll < 0.14) {                             // 보급 컨테이너 — 쏴서 깨면 병력(게이트 밖의 성장 축)
          events.push({ z: Math.round(w), type: 'wave', data: { kind: 'supply', n: 1 } });
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
