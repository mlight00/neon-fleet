// rush/upgrades.js — 3트랙 고정(재미설계 B — 증식 금지).
import { BAL } from './balance.js';

export function upCost(track, lvl) {
  const def = BAL.upgrades[track];
  if (!def || lvl >= def.max) return null;
  return def.costs[lvl];
}

export function buy(save, track) {
  const d = save.get();
  const lvl = d.up[track] ?? 0;
  const cost = upCost(track, lvl);
  if (cost === null || d.coins < cost) return false;
  save.patch({ coins: d.coins - cost, up: { ...d.up, [track]: lvl + 1 } });
  return true;
}

export function effects(up, isDaily) {
  if (isDaily) return { startCount: 1, fireRateMult: 1, magnetMult: 1 };   // 순수 실력 판
  const U = BAL.upgrades;
  return {
    startCount: 1 + (up.startTroops ?? 0) * U.startTroops.effect,
    fireRateMult: 1 + (up.fireRate ?? 0) * U.fireRate.effect,
    magnetMult: 1 + (up.magnet ?? 0) * U.magnet.effect,
  };
}
