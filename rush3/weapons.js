// rush3/weapons.js — 무기 6종 정의·강화(Mk)·탄 생성(계약서 3-4장 + r3.10). 순수, 난수 없음.
import { BAL3 } from './balance.js';

// id → 무기 정의(동결). rank 가 현재보다 클 때만 교체(적용은 supply.applySupplyReward)
export const WEAPONS = BAL3.weapons;
// 강화 표 [Mk I, Mk II, Mk III]
export const WEAPON_MK = BAL3.weaponMk;
export const MK_MAX = WEAPON_MK.length;

// 무기 순위(모르는 id 는 0)
export function weaponRank(id) {
  const w = WEAPONS[id];
  return w ? w.rank : 0;
}

// Mk 를 1..MK_MAX 로 클램프(비수는 1)
export function clampMk(mk) {
  const m = Math.floor(Number(mk) || 1);
  return Math.max(1, Math.min(MK_MAX, m));
}

// 강화 단계 적용 후 실효 수치. 발사 간격·피해·탄 폭만 Mk 를 타고, 나머지(vz·fan·pierce·chain·blast)는 정의 그대로
export function weaponStats(id, mk = 1) {
  const w = WEAPONS[id] ?? WEAPONS.rifle;
  const k = WEAPON_MK[clampMk(mk) - 1];
  return { id: w.id, interval: w.interval * k.intervalMul, dmg: w.dmg + k.dmgAdd, w: w.w * k.wMul, vz: w.vz,
           fan: w.fan ?? 1, spreadDeg: w.spreadDeg ?? 0, range: w.range ?? null, pierce: w.pierce ?? 0,
           chain: w.chain ?? 0, chainR: w.chainR ?? 0, chainDmg: w.chainDmg ?? 0, blastR: w.blastR ?? 0, blastDmg: w.blastDmg ?? 0 };
}

// 부채꼴 발사 각도(라디안) 목록: fan 1 → [0], fan 3 → [-s, 0, +s], fan 6 → -s … +s 를 5등분(가운데 0 없음)
export function fanAngles(id) {
  const w = WEAPONS[id] ?? WEAPONS.rifle;
  const n = w.fan ?? 1;
  if (n <= 1) return [0];
  const s = (w.spreadDeg ?? 0) * Math.PI / 180;
  const out = [];
  for (let i = 0; i < n; i++) out.push(-s + (2 * s * i) / (n - 1));
  return out;
}

// 부채꼴 발마다 속도 배수(r4.7 산탄포 — 이사님 지시 2026-09-26 "총알이 산탄해서 뻗어나가도록"): 정의의 pelletVz[i](발 번호 i, 결정적 — 난수 없음).
//  발마다 조금씩 빠르고 느려 한 번에 쏜 알갱이가 한 줄로 서지 않고 흩뿌려진다. 정의에 없으면 전부 1(= 종전 탄 그대로).
//  속도만 다르고 방향(각도)은 그대로라 탄이 지나는 선(x = x0 + tan(각)·거리)·사거리(z 거리)는 바뀌지 않는다
export function fanSpeeds(id) {
  const w = WEAPONS[id] ?? WEAPONS.rifle;
  const n = w.fan ?? 1;
  const p = w.pelletVz;
  const out = [];
  for (let i = 0; i < n; i++) out.push(p && Number.isFinite(p[i]) ? p[i] : 1);
  return out;
}

// 아군 탄 생성. z 는 트랙 좌표, pz = z(스윕 시작). 모든 탄 gateHit 1.
//  vx(부채꼴)·range/z0(사거리)·pierce/hit(관통)은 해당 무기일 때만 붙는다 — 기존 3종 Mk I 탄은 종전 모양 그대로
//  angle(r3.17 아레나 자동 조준, 라디안·0 = +z 정면·양수 = +x): 있으면 vz = s.vz·cos, vx = s.vz·sin, aimed true, x0 = x(사거리는 직선 거리로).
//   null 이면 종전 탄과 바이트 단위로 같다(도로 탄 무변화)
//  vzMul(r4.7) = 발마다 속도 배수(fanSpeeds). 1 이면 종전 탄과 바이트 단위로 같다. 도로 탄의 vx 는 부르는 쪽이 같은 배수로 만든 값을 넘긴다(tan(각)·vz·vzMul)
export function makeBullet(weaponId, x, z, ownerId, mk = 1, vx = 0, angle = null, vzMul = 1) {
  const s = weaponStats(weaponId, mk);
  const sp = vzMul === 1 ? s.vz : s.vz * vzMul;
  const b = { x, z, pz: z, vz: sp, dmg: s.dmg, w: s.w, kind: s.id, gateHit: 1, ownerId, dead: false };
  if (angle !== null && angle !== undefined) {
    b.vz = sp * Math.cos(angle);
    b.vx = sp * Math.sin(angle);
    b.aimed = true;
    b.x0 = x;
  } else if (vx) b.vx = vx;
  if (s.range) { b.range = s.range; b.z0 = z; }
  if (s.pierce) { b.pierce = s.pierce; b.hit = []; }
  return b;
}
