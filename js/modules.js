// 진화 모듈(빌드) 시스템: 진화(드론 희생)마다 3장 중 택1, 원정 내내 누적·스택.
// "쉽지만 깊게" — 모듈 하나는 한 줄로 이해, 조합에서 깊이가 나온다.
// 순수 로직(드래프트·효과 합산)이라 DOM/게임 개체 의존 없음 → 테스트 가능.

// 각 모듈: apply(mfx)가 효과 누적기를 변형(스택마다 1회 호출). rarity: common(흔함)/rare(귀함).
export const MODULE_DEFS = [
  { id: 'dmg',    name: '화력 코어',   icon: '🔥', desc: '화력 +25%',              rarity: 'common', max: 6, apply: (m) => { m.dmgMult *= 1.25; } },
  { id: 'rate',   name: '연사 장치',   icon: '⚡', desc: '발사 속도 +25%',         rarity: 'common', max: 5, apply: (m) => { m.fireRateMult *= 1.25; } },
  { id: 'pierce', name: '관통 탄심',   icon: '🎯', desc: '탄이 적을 1기 더 관통',   rarity: 'common', max: 3, apply: (m) => { m.pierceBonus += 1; } },
  { id: 'explode',name: '폭발 탄두',   icon: '💥', desc: '적 파괴 시 주변 폭발',     rarity: 'common', max: 3, apply: (m) => { m.explodeRadius += 46; m.explodeDmgFrac += 0.5; } },
  { id: 'crit',   name: '치명 회로',   icon: '✴️', desc: '15% 확률 치명타 ×2',      rarity: 'common', max: 4, apply: (m) => { m.crit += 0.15; } },
  { id: 'boss',   name: '사냥꾼 표식', icon: '☠️', desc: '보스·중간보스 피해 +35%', rarity: 'rare',   max: 3, apply: (m) => { m.bossDmgMult *= 1.35; } },
  { id: 'harvest',name: '수확 드론',   icon: '💠', desc: '크리스탈·수송선 보상 +30%',rarity: 'common', max: 4, apply: (m) => { m.podRewardMult *= 1.3; } },
  { id: 'evolve', name: '신속 진화',   icon: '🌀', desc: '진화 비용 −15%',          rarity: 'common', max: 3, apply: (m) => { m.evolveCostMult *= 0.85; } },
  { id: 'retain', name: '잔존 편대',   icon: '♻️', desc: '진화 후 남는 드론 대폭↑', rarity: 'common', max: 3, apply: (m) => { m.retainBonus += 0.15; } },
  { id: 'scavenge',name: '전리 회수',  icon: '🧲', desc: '적 처치 시 드론 획득 확률',rarity: 'common', max: 4, apply: (m) => { m.killDroneChance += 0.12; } },
  { id: 'armor',  name: '위상 장갑',   icon: '🧊', desc: '접촉 피해 −25%',          rarity: 'common', max: 2, apply: (m) => { m.contactCapMult *= 0.7; } },
  { id: 'shieldregen', name: '반응 실드', icon: '🔵', desc: '주기적으로 보호막 생성', rarity: 'rare', max: 3, apply: (m) => { m.shieldRegen = m.shieldRegen ? m.shieldRegen * 0.7 : 9; } },
  { id: 'swarm',  name: '군체 의지',   icon: '🐝', desc: '드론 1기당 화력 +0.4',    rarity: 'rare',   max: 5, apply: (m) => { m.swarmPerDrone += 0.4; } },
];

export const MODULE_BY_ID = Object.fromEntries(MODULE_DEFS.map((m) => [m.id, m]));

/** 효과 누적기 기본값 (모듈 없으면 전부 중립 → 게임에 영향 없음) */
export function baseMfx() {
  return {
    dmgMult: 1, fireRateMult: 1, pierceBonus: 0, crit: 0, critMult: 2, bossDmgMult: 1,
    podRewardMult: 1, evolveCostMult: 1, retainBonus: 0, killDroneChance: 0, killDroneAmt: 2,
    contactCapMult: 1, shieldRegen: 0, swarmPerDrone: 0, explodeRadius: 0, explodeDmgFrac: 0,
  };
}

function tally(picks) {
  const c = {};
  for (const id of picks) c[id] = (c[id] || 0) + 1;
  return c;
}

/** 보유 모듈 배열(id, 중복=스택)로 효과 누적기 계산. 순수 함수. */
export function computeMfx(picks) {
  const m = baseMfx();
  for (const id of picks) MODULE_BY_ID[id]?.apply(m);
  return m;
}

/**
 * 드래프트 후보 count개 추첨 (서로 다름). 스택 상한에 도달한 모듈은 제외.
 * common은 rare보다 3배 자주. rng 주입 → 테스트 가능.
 */
export function draftOptions(picks, rng, count = 3) {
  const counts = tally(picks);
  const pool = [];
  for (const m of MODULE_DEFS) {
    if ((counts[m.id] || 0) >= m.max) continue;
    const w = m.rarity === 'rare' ? 1 : 3;
    for (let i = 0; i < w; i++) pool.push(m.id);
  }
  const distinct = new Set(pool).size;
  const chosen = [];
  const used = new Set();
  let guard = 0;
  while (chosen.length < count && used.size < distinct && guard++ < 500) {
    const id = pool[Math.floor(rng() * pool.length) % pool.length];
    if (used.has(id)) continue;
    used.add(id);
    chosen.push(id);
  }
  return chosen;
}

/** HUD용 보유 모듈 요약: [{id, icon, name, count}] (스택 수 포함, 정의 순서) */
export function moduleSummary(picks) {
  const counts = tally(picks);
  return MODULE_DEFS.filter((m) => counts[m.id]).map((m) => ({ id: m.id, icon: m.icon, name: m.name, count: counts[m.id] }));
}
