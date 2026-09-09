// rush3/weapons.js — 무기 3종 정의·탄 생성(계약서 3-4장). 순수, 난수 없음.
import { BAL3 } from './balance.js';

// id → 무기 정의(동결). rank 가 현재보다 클 때만 교체(적용은 combat)
export const WEAPONS = BAL3.weapons;

// 무기 순위(모르는 id 는 0)
export function weaponRank(id) {
  const w = WEAPONS[id];
  return w ? w.rank : 0;
}

// 아군 탄 생성. z 는 트랙 좌표, pz = z(스윕 시작). 모든 탄 gateHit 1
export function makeBullet(weaponId, x, z, ownerId) {
  const w = WEAPONS[weaponId] ?? WEAPONS.rifle;
  return { x, z, pz: z, vz: w.vz, dmg: w.dmg, w: w.w, kind: w.id, gateHit: 1, ownerId, dead: false };
}
