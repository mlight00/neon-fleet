// 게임 규칙 순수 함수 — DOM/Canvas 의존 없음 (node --test로 검증)

/** 게이트 통과: 편대 수에 연산 적용. 결과는 0 미만이 될 수 없다. */
export function applyGate(count, gate) {
  let n = count;
  if (gate.op === '+') n = count + gate.value;
  else if (gate.op === '-') n = count - gate.value;
  else if (gate.op === 'x') n = count * gate.value;
  else if (gate.op === '/') n = Math.floor(count / gate.value);
  return Math.max(0, Math.round(n));
}

/**
 * 게이트 값 스테이지 스케일: 평평한 +/− 는 스테이지가 깊을수록 값이 커진다.
 * 비율(×/÷)은 자기 스케일(편대수에 비례)이라 원본 그대로 둔다.
 * → 스테이지마다 게이트가 편대에 주는 체감이 비슷하게 유지된다. 순수 함수(테스트 가능).
 */
export function scaleGate(gate, stage, scalePerStage = 0.6, scaleMax = 6) {
  if (gate.op === 'x' || gate.op === '/') return gate;
  const f = Math.min(scaleMax, 1 + scalePerStage * Math.max(0, stage - 1));
  return { op: gate.op, value: Math.max(1, Math.round(gate.value * f)) };
}

/** 크리스탈 피격: hp 감소, 0이 되면 broken과 함께 원래 보상 지급. */
export function hitCrystal(crystal, damage) {
  const hp = Math.max(0, crystal.hp - damage);
  const broken = hp === 0;
  return { hp, broken, reward: broken ? crystal.reward : 0 };
}

/** 전자기 폭풍: dt초 동안 초당 ratePerSec 비율로 드론 소실 (내림, 최소 0). */
export function stormDecay(count, dt, ratePerSec) {
  return Math.max(0, Math.floor(count * (1 - ratePerSec * dt)));
}

/** 격납고 강화 비용: 기본가 x 성장배수^레벨 (반올림 정수) */
export function hangarCost(base, lv, growth) {
  return Math.round(base * Math.pow(growth, lv));
}

/** 차지 랜스 단계: 누적 충전 시간 → 단계(0=미충전, maxStage 상한). */
export function chargeStageFor(charge, stageTime, maxStage) {
  if (charge <= 0 || stageTime <= 0) return 0;
  return Math.min(maxStage, Math.floor(charge / stageTime));
}

/**
 * 스테이지별 난이도 배수 (스테이지 1 = 기본).
 * 적은 단단하고 빨라지고, 보상(크리스탈)도 소폭 올라 성장이 완전히 뒤처지진 않는다.
 */
export function stageMods(stage) {
  const g = Math.max(1, stage) - 1;
  return {
    enemyHp: 1 + 0.7 * g,                       // 적 HP 스테이지 배수 (주 난이도는 화력 비례 스케일 — main.js). 무한 상승: 소폭 상향
    enemyRate: Math.max(0.6, 1 - 0.08 * g),    // 적 발사 주기 배수 (작을수록 빠름)
    crystal: 1 + 0.5 * g,                      // 크리스탈 값 (스테이지↑ → 드론 획득↑, 상위 티어 도달)
    boss: 1 + 0.35 * g,                        // 보스 HP (완만하게 — 진화 화력 스파이크로 이미 커지므로)
    tierShift: Math.min(0.2, 0.05 * g),        // hard 청크가 더 일찍 나옴
    shotCap: Math.min(20, 12 + 2 * g),         // 동시 적탄 상한
  };
}

/**
 * 드론 소모형 진화 판정.
 * 다음 티어 비용(costs[tier+1])에 도달하면 모은 드론이 기함의 재료로 흡수되고 1티어 승급.
 * 진화 후에는 흡수량의 retainRatio만큼(최소 retainBase)이 새 호위대로 재사출되고,
 * 나머지는 소멸 — 다음 진화는 처음부터 다시 모은다. 연쇄 승급·강등 없음.
 * 반환: { tier, count, consumed } — 진화가 없으면 입력 그대로, consumed 0.
 */
export function evolveStep(count, tier, costs, retainBase, retainRatio = 0) {
  const cost = costs[tier + 1];
  if (cost === undefined || count < cost) return { tier, count, consumed: 0 };
  const kept = Math.min(count, Math.max(retainBase, Math.round(count * retainRatio)));
  return { tier: tier + 1, count: kept, consumed: count - kept };
}

/**
 * 섹터 분기 맵 생성 (순수 함수, 시드 재현 가능).
 * 반환 { sector, depth, cols }. cols=열 배열, 각 열=노드 배열.
 * node = { id, col, row, type, next:[다음 열의 row 인덱스] }.
 * col 0=진입(combat 1), col 1..depth-1=선택 노드 2~3, col depth=boss 1.
 * type ∈ combat/elite/hazard/supply/repair/boss.
 */
export function generateSectorMap(sector, rng, depth = 5) {
  const cols = [[{ col: 0, row: 0, type: 'combat' }]];
  for (let c = 1; c < depth; c++) {
    const n = 2 + (rng() < 0.5 ? 1 : 0);              // 2~3 노드
    cols.push(Array.from({ length: n }, (_, r) => ({ col: c, row: r, type: null })));
  }
  cols.push([{ col: depth, row: 0, type: 'boss' }]);

  // 타입 배정 (중간 열)
  for (let c = 1; c < depth; c++) for (const node of cols[c]) {
    const roll = rng();
    node.type = roll < 0.12 ? 'hazard' : roll < 0.28 ? 'supply' : roll < 0.42 ? 'elite' : roll < 0.52 ? 'repair' : 'combat';
  }
  // 1열은 완만하게 (repair/elite 금지)
  for (const node of cols[1]) if (node.type === 'repair' || node.type === 'elite') node.type = 'combat';
  // 보스 직전 열엔 정비(repair) 최소 1개 보장
  const pre = cols[depth - 1];
  if (!pre.some((n) => n.type === 'repair')) pre[Math.floor(rng() * pre.length)].type = 'repair';

  // 분기 엣지: 각 노드 → 다음 열 인접 row 1~2개
  for (let c = 0; c < cols.length - 1; c++) {
    const cur = cols[c], nxt = cols[c + 1];
    for (let i = 0; i < cur.length; i++) {
      const base = nxt.length === 1 ? 0 : Math.round((i / Math.max(1, cur.length - 1)) * (nxt.length - 1));
      const t = new Set([base]);
      if (nxt.length > 1 && rng() < 0.6) t.add(Math.max(0, Math.min(nxt.length - 1, base + (rng() < 0.5 ? -1 : 1))));
      cur[i].next = [...t].sort((a, b) => a - b);
    }
    // 역연결 보장: 다음 열 모든 노드가 최소 1개 incoming
    for (let j = 0; j < nxt.length; j++) if (!cur.some((n) => n.next.includes(j))) {
      const near = Math.min(cur.length - 1, Math.round((j / Math.max(1, nxt.length - 1)) * (cur.length - 1)));
      cur[near].next = [...new Set([...cur[near].next, j])].sort((a, b) => a - b);
    }
  }
  let id = 0;
  for (const col of cols) for (const node of col) node.id = id++;
  return { sector, depth, cols };
}
