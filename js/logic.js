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

/**
 * 원정 실패(사망) 정산 보상: 전투 획득 + 기본 + 진행도 비례. 순수 함수(테스트 가능).
 * 자발적 종료(quit)에는 base·perProgress를 0으로 넘겨 전투 획득만 남긴다.
 * 계약: progress=clamp(0~1) → round(earned + base + floor(progress*perProgress)).
 */
export function failureReward({ earned = 0, progress = 0, base = 0, perProgress = 0 }) {
  const p = Math.max(0, Math.min(1, progress));
  return Math.round(earned + base + Math.floor(p * perProgress));
}

/**
 * 진행 상태 순수 함수 (지시서 §4.2). 섹터·노드 열·맵 깊이로부터 세 축을 분리해 낸다.
 *  - sector/nodeCol : 위치 (화면 표시·기록·노드 코인)
 *  - contentTier    : 콘텐츠 해금 등급(=섹터). 노드 열과 무관 → 같은 섹터 내 해금이 일정.
 *  - difficultyLevel: 난이도(소수). 섹터마다 +1.25, 노드 열마다 +col/depth 로 완만·단조 상승.
 *  - bossTier       : 보스 정체성/순서(=섹터).
 * 입력 최소값 보정: sector>=1, nodeCol>=0, depth>=1.
 */
export function progressionFor(sector, nodeCol, depth) {
  const s = Math.max(1, Math.floor(sector));
  const c = Math.max(0, Math.floor(nodeCol));
  const d = Math.max(1, Math.floor(depth));
  return {
    sector: s,
    nodeCol: c,
    contentTier: s,
    difficultyLevel: 1 + (s - 1) * 1.25 + c / d,
    bossTier: s,
  };
}

/**
 * 노드 기본 코인 (순수 함수, 지시서 §5.2). 섹터·노드 열에 따라 단조 증가.
 * 실지급 = baseNodeCoins × 노드 타입 배수(nodeCoinReward).
 */
export function baseNodeCoins(sector, nodeCol) {
  return 40 + 10 * Math.max(1, sector) + 5 * Math.max(0, nodeCol);
}

/** 노드 클리어 코인 = 기본 코인 × 타입 배수 (combat 1.0/supply 0.5/hazard 1.2/elite 1.8/repair 0/boss 별도). 순수. */
export function nodeCoinReward(sector, nodeCol, type, coinMult) {
  return Math.round(baseNodeCoins(sector, nodeCol) * (coinMult[type] ?? 1));
}

/**
 * 모드별 진행 기록 저장 패치 (순수 함수). 캠페인과 무한 원정 기록을 완전히 분리한다.
 *  - campaign: 최고 도달 섹터를 `stage`에만 기록
 *  - endless : 최고 도달 섹터를 `endlessBest`에만 기록 (캠페인 `stage`는 절대 건드리지 않음)
 * 기존 기록보다 크지 않으면 빈 객체(=저장 변경 없음)를 돌려준다.
 */
export function progressPatch(mode, sector, data = {}) {
  const s = Math.max(1, Math.floor(sector));
  if (mode === 'endless') {
    const best = data.endlessBest || 0;
    return s > best ? { endlessBest: s } : {};
  }
  const stage = data.stage || 0;
  return s > stage ? { stage: s } : {};
}

/**
 * 섹터·모드에 따른 보스 ID (순수, 지시서 §6.2). 순수 함수라 테스트 가능.
 * 캠페인: campaignBosses[sector-1] (섹터 1~6). 엔드리스: 캠페인 이후 섹터부터 endlessBosses를 순환.
 */
export function campaignBossId(sector, mode, campaignBosses, endlessBosses) {
  if (mode === 'endless') {
    const i = Math.max(0, sector - (campaignBosses.length + 1));   // 섹터 7 → endless[0]
    return endlessBosses[i % endlessBosses.length];
  }
  const s = Math.min(Math.max(1, sector), campaignBosses.length);
  return campaignBosses[s - 1];
}

/**
 * 한 전투에 동시에 등장하는 보스 수를 결정한다.
 * 서사형 보스(B7 하이브 퀸, B22 아비터)는 단계별 부위 파괴가 핵심이므로
 * 난이도 단계와 무관하게 반드시 단독으로 등장한다.
 */
export function bossCountFor(bossId, bossTier, bossConfig) {
  if (bossId === 'B7' || bossId === 'B22') return 1;
  if (bossTier >= bossConfig.multiFromSector3) return 3;
  if (bossTier >= bossConfig.multiFromSector2) return 2;
  return 1;
}

/**
 * 노드 완료 시 모듈 드래프트 계약 (순수, 지시서 §5.3).
 * combat·hazard=일반 3택, elite=eliteCount택(희귀 보장), 그 외(supply·repair·boss)=없음(null).
 */
export function nodeModuleGrant(type, eliteCount = 4) {
  if (type === 'combat' || type === 'hazard') return { count: 3, rare: false };
  if (type === 'elite') return { count: eliteCount, rare: true };
  return null;
}

/**
 * 적 복제 스폰 수 (순수 함수, 지시서 §4.5). 난이도(difficultyLevel)에 따라 2→최대 8.
 * 첫 노드(tutorial=true)는 최대 2로 제한 → 조작 학습 구간의 밀집도를 낮춘다(지시서 A-3).
 * difficultyLevel = progressionFor가 돌려주는 소수 난이도.
 */
export function copyCount(difficultyLevel, tutorial = false) {
  let copies = Math.min(8, 2 + Math.floor((Math.max(1, difficultyLevel) - 1) / 2));
  if (tutorial) copies = Math.min(copies, 2);
  return copies;
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

/**
 * 드론 → 순양함 자동 합체 (순수, 선택 없음). 가능한 만큼 한 번에 뭉친다.
 * cfg: { dronesPerCruiser, maxCruisers }
 * 반환: { count, cruisers, merged } — merged = 이번에 새로 만든 순양함 수.
 */
export function dronesToCruisers(count, cruisers, cfg) {
  let c = count, cr = cruisers, merged = 0;
  while (c >= cfg.dronesPerCruiser && cr < cfg.maxCruisers) {
    c -= cfg.dronesPerCruiser; cr += 1; merged += 1;
  }
  return { count: c, cruisers: cr, merged };
}

/**
 * 기함 업그레이드 가능 여부 (순수). 순양함이 임계치 이상이고 최고 티어 미만이면 true.
 * cfg: { cruisersPerFlagship }
 */
export function canUpgradeFlagship(cruisers, tier, maxTier, cfg) {
  return tier < maxTier && cruisers >= cfg.cruisersPerFlagship;
}

/**
 * 현재 등급에서 다음 등급까지 필요한 순양함 수 (순수).
 * 등급별 표(cruisersPerFlagshipByTier)가 있으면 그 값을, 없거나 범위를 넘으면 기본값을 쓴다.
 * 초반 승급이 너무 오래 걸린다는 피드백으로 앞 단계만 싸게 만든 장치(이사).
 */
export function cruisersNeededForTier(tier, cfg) {
  const table = cfg.cruisersPerFlagshipByTier;
  const v = Array.isArray(table) && table[tier] != null ? table[tier] : cfg.cruisersPerFlagship;
  return Math.max(1, v);
}

/** 기함 업그레이드 시 흡수 화력을 은행에 적립 + 롤백용 스택에 기록 (순수). */
export function bankUpgrade(banked, stack, gain) {
  return { banked: banked + gain, stack: [...stack, gain] };
}

/** 강등 시 마지막 적립분을 정확히 롤백 (순수). 스택이 비면 무변, banked는 0 미만 불가. */
export function bankDemote(banked, stack) {
  if (!stack.length) return { banked, stack: stack.slice() };
  const s = stack.slice();
  const g = s.pop();
  return { banked: Math.max(0, banked - g), stack: s };
}

/**
 * 게이트 패러사이트 감염: 통과 시 게이트 연산 반전 (순수).
 *  +N → -ceil(N/2) (이득이 손실로), ×N → /N, -N·/N 은 유지(나쁜 건 그대로).
 */
export function invertGateOp(gate) {
  if (gate.op === '+') return { op: '-', value: Math.max(1, Math.ceil(gate.value / 2)) };
  if (gate.op === 'x') return { op: '/', value: gate.value };
  return { op: gate.op, value: gate.value };
}

/** 차지 랜스 단계: 누적 충전 시간 → 단계(0=미충전, maxStage 상한). */
export function chargeStageFor(charge, stageTime, maxStage) {
  if (charge <= 0 || stageTime <= 0) return 0;
  return Math.min(maxStage, Math.floor(charge / stageTime));
}

/**
 * 스테이지별 난이도 배수 (스테이지 1 = 기본). 뱀서류식 준지수 스케일.
 * 핵심: 후반 난이도는 '적 체력'이 아니라 '밀도 + 적탄'으로 온다(main.js spawn·shotCap).
 * 체력은 준지수(선형+제곱)로 올려 적이 화면 상단에서 즉사하지 않고 내려오게 하고,
 * 크리스탈(드론 보상)은 완만히 올려 진화가 너무 빨리 끝나지 않게 한다.
 */
export function stageMods(stage) {
  const g = Math.max(1, stage) - 1;
  return {
    // 시작값(g=0)만 약 30% 낮추고 성장 계수(g·g² 항)는 유지 → 난이도 곡선은 그대로, 초반만 완만
    enemyHp: 1.4 + 0.9 * g + 0.1 * g * g,       // 시작 적 체력 2→1.4 (−30%), 곡선은 유지
    enemyRate: Math.max(0.4, 0.8 - 0.08 * g),  // 적 발사 주기 배수 (작을수록 빠름) — 시작 0.72→0.8 (초반 발사 완화)
    crystal: 1 + 0.18 * g,                     // 드론 보상 완만 상승 (진화 감속)
    boss: 1 + 0.5 * g + 0.04 * g * g,          // 보스 HP 준지수
    tierShift: Math.min(0.3, 0.06 * g),        // hard 청크가 더 일찍 나옴
    shotCap: Math.min(40, 16 + 3 * g),         // 동시 적탄 상한 — 시작 22→16 (−27%), 상한·기울기 유지
  };
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
