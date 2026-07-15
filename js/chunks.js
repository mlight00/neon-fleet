// 청크(구간 패턴) 데이터 + 난이도별 추첨. 좌표는 비율(x: 0~1 트랙 폭, y: 0~1 청크 내 위치).
// item type: crystal{value} / gatePair{left,right} / creature{size} / meteor / power / storm{w,h}(2차 예약)
//            sniper / turret / weaver / capsule{weapon|'random'}  (사격형 적 + 무기 캡슐, 부록 §3~4)
import { BAL } from './balance.js';

/** 시드 고정 난수 생성기 (재현 가능한 트랙) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 판 진행도(0~1) → 청크 난이도. bounds를 낮추면 어려운 청크가 더 일찍 나온다(스테이지 스케일). */
export function pickTier(progress, bounds = BAL.chunk.tierBounds) {
  const [a, b] = bounds;
  if (progress < a) return 'easy';
  if (progress < b) return 'mid';
  return 'hard';
}

/**
 * tier 풀에서 추첨. 직전 청크(prev)는 피한다. filterFn으로 풀을 좁힐 수 있다.
 * 노드 타입 신뢰: 현재 티어에 필터 통과 청크가 없으면 '조용히 일반 청크로 폴백'하지 않고
 * 인접 티어(easy/mid/hard)에서 같은 필터를 만족하는 청크를 찾는다. 정말 하나도 없을 때만 원 풀 사용.
 */
export function pickChunk(tier, rng, prev, filterFn) {
  const byTier = (t) => CHUNKS.filter((c) => c.tier === t);
  let pool = byTier(tier);
  if (filterFn) {
    let narrowed = pool.filter(filterFn);
    if (narrowed.length === 0) {
      for (const t of ['easy', 'mid', 'hard']) {
        const alt = byTier(t).filter(filterFn);
        if (alt.length) { narrowed = alt; break; }
      }
    }
    if (narrowed.length) pool = narrowed;   // 필터 만족 청크가 어딘가 있으면 반드시 그걸 쓴다
  }
  const candidates = pool.length > 1 ? pool.filter((c) => c !== prev) : pool;
  return candidates[Math.floor(rng() * candidates.length)];
}

// 위협 개체(초반 안전 구간에서 배제)
const THREAT_TYPES = new Set(['creature', 'splitter', 'sniper', 'turret', 'weaver', 'charger', 'mine', 'debris', 'bomber', 'zapper', 'orbiter', 'shielder', 'carrier', 'blinker', 'prismWarden', 'scavenger']);
/** 위협 적이 없는 안전 청크인지 (판 초반 보장용) */
export function isSafeChunk(chunk) {
  return chunk.items.every((it) => !THREAT_TYPES.has(it.type));
}

// 튜토리얼(첫 원정 첫 노드) 허용 아이템: 보급·성장만. 소형 생물·친화 게이트(+/×)는 별도 허용.
const TUTORIAL_ALLOWED = new Set(['crystal', 'capsule', 'power', 'dronePod', 'bonusGate', 'weaponGate']);
/** 게이트가 이득만 주는 친화형인지 (÷·− 감점, 감염 게이트 배제) */
function isFriendlyGate(g) { return !!g && (g.op === '+' || g.op === 'x'); }
/**
 * 첫 노드용 안전 청크: 소형 생물·크리스탈·보급·친화 게이트만.
 * 배제 대상 — 나쁜 게이트(−/÷)·감염 게이트, 중/대형·사격형·대응형 적, 기뢰/잔해/돌진병, 유성.
 * (지시서 A-2: 첫 노드는 조작을 배우는 곳이라 불리한 규칙·위협적 적을 넣지 않는다.)
 */
export function isTutorialSafeChunk(chunk) {
  return chunk.items.every((it) => {
    if (it.type === 'creature') return it.size === 'small';           // 소형 생물만 허용
    if (it.type === 'gatePair') return isFriendlyGate(it.left) && isFriendlyGate(it.right);
    return TUTORIAL_ALLOWED.has(it.type);                             // 그 외는 보급/성장류만
  });
}

// 적 종류별 첫 등장 스테이지 (점진적 도입)
const ENEMY_MIN_STAGE = {
  creature_small: 1, meteor: 1,
  creature_mid: 2, weaver: 2, mine: 2, debris: 2,
  sniper: 3, charger: 3, bomber: 3, orbiter: 3,
  creature_large: 4, turret: 4, zapper: 4, carrier: 4,
  splitter: 5, shielder: 5,
  blinker: 6,
  // 대응형 신규 적 (Phase 1)
  prismWarden: 2, scavenger: 2, corruptedGate: 3,
};

/**
 * 청크의 최소 해금 등급(콘텐츠 티어=섹터)을 내용에서 자동 추론 (지시서 §4.7).
 * - 단일 종류 적: 그 적의 도입 티어.
 * - 2종 섞임: +1 티어, 3종 이상(조합 청크): 6티어 이후 → "도입 끝난 뒤 조합의 재미".
 * 값 1~6은 섹터와 동일 척도라, 비교는 chunkMinTier(chunk) <= contentTier(=sector).
 */
export function chunkMinTier(chunk) {
  if (chunk.minStage) return chunk.minStage; // 명시값 우선 (데이터 필드명은 minStage 유지)
  let m = 1;
  const kinds = new Set();
  for (const it of chunk.items) {
    let key = it.type;
    if (it.type === 'creature') key = 'creature_' + it.size;
    if (ENEMY_MIN_STAGE[key]) { m = Math.max(m, ENEMY_MIN_STAGE[key]); kinds.add(key); }
  }
  if (kinds.size >= 3) m = Math.max(m, 6);
  else if (kinds.size === 2) m += 1;
  return m;
}
/** 하위 호환 별칭 (구 이름). 티어=섹터 척도로 의미는 동일. */
export const chunkMinStage = chunkMinTier;

export const CHUNKS = [
  // ─── EASY (성장 위주) ───
  {
    tier: 'easy', name: 'e-twin-crystals',
    items: [
      { type: 'crystal', x: 0.28, y: 0.25, value: 15 },
      { type: 'crystal', x: 0.72, y: 0.25, value: 12 },
      { type: 'crystal', x: 0.5, y: 0.7, value: 22 },
    ],
  },
  {
    tier: 'easy', name: 'e-center-mid',
    items: [
      { type: 'crystal', x: 0.5, y: 0.3, value: 50 },
      { type: 'creature', x: 0.2, y: 0.65, size: 'small' },
    ],
  },
  {
    tier: 'easy', name: 'e-double-or-half',
    items: [
      // 두 배 아니면 절반 — 감점도 비율(÷2)이라 어느 판에서든 아프다 (x2 vs ÷2)
      { type: 'gatePair', y: 0.35, left: { op: 'x', value: 2 }, right: { op: '/', value: 2 } },
      { type: 'crystal', x: 0.35, y: 0.75, value: 16 },
    ],
  },
  {
    tier: 'easy', name: 'e-meteor-power',
    items: [
      { type: 'meteor', x: 0.3, y: 0.3 },
      { type: 'meteor', x: 0.7, y: 0.3 },
      { type: 'power', x: 0.5, y: 0.68 },
    ],
  },
  {
    tier: 'easy', name: 'e-zigzag',
    items: [
      { type: 'crystal', x: 0.25, y: 0.2, value: 10 },
      { type: 'crystal', x: 0.75, y: 0.5, value: 14 },
      { type: 'crystal', x: 0.3, y: 0.8, value: 12 },
    ],
  },

  // ─── MID (선택과 위협) ───
  {
    tier: 'mid', name: 'm-plus-or-minus',
    items: [
      // 평평한 증감(+30 vs -25, 스테이지 스케일). 이득(+, 왼쪽) 바 앞을 적이 지킨다 → 공짜 아님
      { type: 'gatePair', y: 0.55, left: { op: '+', value: 30 }, right: { op: '-', value: 25 } },
      { type: 'creature', x: 0.25, y: 0.2, size: 'small' },
      { type: 'creature', x: 0.28, y: 0.38, size: 'small' },
    ],
  },
  {
    tier: 'mid', name: 'm-risky-large',
    items: [
      // 리스크-리워드: 대형 크리스탈 옆에 크리처 배치, 반대편은 안전한 소형
      { type: 'crystal', x: 0.28, y: 0.3, value: 160 },
      { type: 'creature', x: 0.28, y: 0.55, size: 'mid' },
      { type: 'crystal', x: 0.75, y: 0.4, value: 20 },
    ],
  },
  {
    tier: 'mid', name: 'm-gain-or-halve',
    items: [
      // 평평한 획득 vs 절반 상실(+45 vs ÷2). 이득(+45, 왼쪽) 바 앞을 중형 적이 막는다
      { type: 'gatePair', y: 0.55, left: { op: '+', value: 45 }, right: { op: '/', value: 2 } },
      { type: 'creature', x: 0.25, y: 0.3, size: 'mid' },
    ],
  },
  {
    tier: 'mid', name: 'm-lesser-evil',
    items: [
      // 차악(次惡) — 양쪽 다 감점(절반 ÷2 vs 정액 -30). 편대 적으면 정액이, 많으면 절반이 더 손해
      { type: 'gatePair', y: 0.32, left: { op: '/', value: 2 }, right: { op: '-', value: 30 } },
      { type: 'creature', x: 0.5, y: 0.75, size: 'mid' },
    ],
  },
  {
    tier: 'mid', name: 'm-meteor-wall',
    items: [
      { type: 'meteor', x: 0.2, y: 0.35 },
      { type: 'meteor', x: 0.5, y: 0.35 },
      { type: 'meteor', x: 0.8, y: 0.35 },
      { type: 'power', x: 0.65, y: 0.72 },
    ],
  },
  {
    tier: 'mid', name: 'm-swarm-gate',
    items: [
      { type: 'creature', x: 0.25, y: 0.2, size: 'small' },
      { type: 'creature', x: 0.45, y: 0.28, size: 'small' },
      { type: 'creature', x: 0.65, y: 0.2, size: 'small' },
      { type: 'creature', x: 0.85, y: 0.28, size: 'small' },
      { type: 'crystal', x: 0.5, y: 0.72, value: 40 },
    ],
  },
  {
    tier: 'mid', name: 'm-twin-mid-crystals',
    items: [
      { type: 'crystal', x: 0.25, y: 0.3, value: 60 },
      { type: 'crystal', x: 0.75, y: 0.3, value: 45 },
      { type: 'creature', x: 0.5, y: 0.68, size: 'mid' },
    ],
  },
  {
    tier: 'mid', name: 'm-sniper-crystal',
    items: [
      // 저격 드론이 버티는 동안 대형 크리스탈을 깰 것인가 — 딜 분배 선택
      { type: 'sniper', x: 0.5, y: 0.15 },
      { type: 'crystal', x: 0.25, y: 0.45, value: 160 },
      { type: 'crystal', x: 0.8, y: 0.6, value: 20 },
    ],
  },
  {
    tier: 'mid', name: 'm-weaver-crystal',
    items: [
      // 탄 커튼 사이로 크리스탈 확보
      { type: 'weaver', x: 0, y: 0.15 },
      { type: 'crystal', x: 0.5, y: 0.7, value: 45 },
    ],
  },
  {
    tier: 'mid', name: 'm-capsule-risk',
    items: [
      // 캡슐은 위험 요소 옆에 (리스크-리워드 §3.5)
      { type: 'capsule', x: 0.7, y: 0.35, weapon: 'random' },
      { type: 'creature', x: 0.6, y: 0.6, size: 'mid' },
      { type: 'crystal', x: 0.2, y: 0.5, value: 30 },
    ],
  },

  // ─── HARD (위협 위주 + 큰 보상은 위험 옆에) ───
  {
    tier: 'hard', name: 'h-guarded-jackpot',
    items: [
      { type: 'crystal', x: 0.5, y: 0.28, value: 300 },
      { type: 'creature', x: 0.3, y: 0.5, size: 'mid' },
      { type: 'creature', x: 0.7, y: 0.5, size: 'mid' },
    ],
  },
  {
    tier: 'hard', name: 'h-triple-or-third',
    items: [
      // 대박 도박 ×3 vs ÷3. 이득(×3, 왼쪽) 바 앞을 대형 적 + 기뢰가 지킨다 → 공짜 대박 없음
      { type: 'gatePair', y: 0.6, left: { op: 'x', value: 3 }, right: { op: '/', value: 3 } },
      { type: 'creature', x: 0.25, y: 0.32, size: 'large' },
      { type: 'mine', x: 0.28, y: 0.12 },
    ],
  },
  {
    tier: 'hard', name: 'h-lesser-evil',
    items: [
      // 후반 차악 — 둘 다 큰 손해(절반 ÷2 vs 정액 -60·스테이지 스케일). 현재 편대수 보고 덜 나쁜 쪽
      { type: 'gatePair', y: 0.3, left: { op: '/', value: 2 }, right: { op: '-', value: 60 } },
      { type: 'creature', x: 0.5, y: 0.72, size: 'large' },
    ],
  },
  {
    tier: 'hard', name: 'h-swarm',
    items: [
      { type: 'creature', x: 0.2, y: 0.2, size: 'small' },
      { type: 'creature', x: 0.5, y: 0.25, size: 'small' },
      { type: 'creature', x: 0.8, y: 0.2, size: 'small' },
      { type: 'creature', x: 0.35, y: 0.55, size: 'small' },
      { type: 'creature', x: 0.65, y: 0.55, size: 'small' },
      { type: 'creature', x: 0.5, y: 0.82, size: 'small' },
    ],
  },
  {
    tier: 'hard', name: 'h-wall-and-power',
    items: [
      { type: 'meteor', x: 0.25, y: 0.25 },
      { type: 'meteor', x: 0.55, y: 0.25 },
      { type: 'meteor', x: 0.85, y: 0.25 },
      { type: 'creature', x: 0.35, y: 0.55, size: 'mid' },
      { type: 'creature', x: 0.75, y: 0.6, size: 'mid' },
      { type: 'power', x: 0.15, y: 0.55 },
    ],
  },
  {
    tier: 'hard', name: 'h-turret-jackpot',
    items: [
      // 포탑 바로 아래가 대박 — 부채꼴탄을 뚫고 들어갈 것인가
      { type: 'turret', x: 0.5, y: 0.25 },
      { type: 'crystal', x: 0.5, y: 0.62, value: 300 },
    ],
  },
  {
    tier: 'hard', name: 'h-twin-snipers',
    items: [
      // 교차 조준탄 사이에서 캡슐 줍기
      { type: 'sniper', x: 0.3, y: 0.1 },
      { type: 'sniper', x: 0.7, y: 0.2 },
      { type: 'capsule', x: 0.5, y: 0.6, weapon: 'random' },
    ],
  },

  // ─── 분열 적 (splitter) 도입: 스테이지 5+ ───
  {
    tier: 'mid', name: 'm-splitter-single',
    items: [
      { type: 'splitter', x: 0.5, y: 0.3 },
      { type: 'crystal', x: 0.25, y: 0.6, value: 40 },
    ],
  },
  {
    tier: 'hard', name: 'h-splitter-pair',
    items: [
      { type: 'splitter', x: 0.3, y: 0.25 },
      { type: 'splitter', x: 0.7, y: 0.4 },
      { type: 'crystal', x: 0.5, y: 0.7, value: 120 },
    ],
  },

  // ─── 대형 적 밀집 (스테이지 4+ 자동) ───
  {
    tier: 'hard', name: 'h-brood-wall',
    items: [
      { type: 'creature', x: 0.3, y: 0.25, size: 'large' },
      { type: 'creature', x: 0.7, y: 0.35, size: 'large' },
      { type: 'crystal', x: 0.5, y: 0.7, value: 250 },
    ],
  },

  // ─── 조합 청크 (여러 적 종류 섞임 → 자동으로 스테이지 6+) ───
  {
    tier: 'hard', name: 'h-combo-siege',
    items: [
      // 포탑 + 저격 + 크리처: 원거리 압박 속 돌파
      { type: 'turret', x: 0.5, y: 0.2 },
      { type: 'sniper', x: 0.2, y: 0.35 },
      { type: 'creature', x: 0.75, y: 0.5, size: 'mid' },
      { type: 'crystal', x: 0.4, y: 0.75, value: 150 },
    ],
  },
  {
    tier: 'hard', name: 'h-combo-swarmfire',
    items: [
      // 위버 커튼 + 샤드 떼 + 저격
      { type: 'weaver', x: 0, y: 0.15 },
      { type: 'creature', x: 0.3, y: 0.4, size: 'small' },
      { type: 'creature', x: 0.5, y: 0.45, size: 'small' },
      { type: 'creature', x: 0.7, y: 0.4, size: 'small' },
      { type: 'sniper', x: 0.5, y: 0.7 },
    ],
  },
  {
    tier: 'hard', name: 'h-combo-elite',
    items: [
      // 대형 + 분열 + 포탑: 후반 종합 시험
      { type: 'creature', x: 0.5, y: 0.2, size: 'large' },
      { type: 'splitter', x: 0.25, y: 0.45 },
      { type: 'splitter', x: 0.75, y: 0.45 },
      { type: 'turret', x: 0.5, y: 0.68 },
      { type: 'capsule', x: 0.15, y: 0.6, weapon: 'random' },
    ],
  },
  {
    tier: 'hard', name: 'h-combo-gauntlet',
    items: [
      // 저격 + 포탑 + 위버 + 대형: 최종 관문
      { type: 'sniper', x: 0.25, y: 0.15 },
      { type: 'turret', x: 0.75, y: 0.25 },
      { type: 'weaver', x: 1, y: 0.45 },
      { type: 'creature', x: 0.5, y: 0.6, size: 'large' },
      { type: 'crystal', x: 0.5, y: 0.85, value: 300 },
    ],
  },

  // ─── 신규 적: 돌진병 (스테이지 3+) ───
  {
    tier: 'mid', name: 'm-charger-bait',
    items: [
      // 대박 크리스탈이 미끼 — 줍는 사이 돌진병이 급강하
      { type: 'crystal', x: 0.5, y: 0.55, value: 70 },
      { type: 'charger', x: 0.5, y: 0.15 },
    ],
  },
  {
    tier: 'hard', name: 'h-charger-pair',
    items: [
      { type: 'charger', x: 0.3, y: 0.15 },
      { type: 'charger', x: 0.7, y: 0.28 },
      { type: 'crystal', x: 0.5, y: 0.7, value: 120 },
    ],
  },
  // ─── 신규 적: 기뢰 (스테이지 2+) ───
  {
    tier: 'mid', name: 'm-minefield',
    items: [
      { type: 'mine', x: 0.3, y: 0.25 },
      { type: 'mine', x: 0.62, y: 0.35 },
      { type: 'crystal', x: 0.82, y: 0.6, value: 40 },
    ],
  },
  {
    tier: 'hard', name: 'h-mine-jackpot',
    items: [
      // 기뢰밭 한가운데 대박 — 조심히 뚫고 들어갈 것인가
      { type: 'mine', x: 0.25, y: 0.25 },
      { type: 'mine', x: 0.5, y: 0.2 },
      { type: 'mine', x: 0.75, y: 0.25 },
      { type: 'crystal', x: 0.5, y: 0.62, value: 250 },
    ],
  },
  // ─── 신규 조합 (2종 이상 → 자동으로 상위 스테이지) ───
  {
    tier: 'hard', name: 'h-combo-charge-turret',
    items: [
      { type: 'turret', x: 0.5, y: 0.2 },
      { type: 'charger', x: 0.25, y: 0.35 },
      { type: 'charger', x: 0.75, y: 0.35 },
      { type: 'crystal', x: 0.5, y: 0.72, value: 150 },
    ],
  },
  {
    tier: 'hard', name: 'h-combo-mine-sniper',
    items: [
      { type: 'sniper', x: 0.5, y: 0.12 },
      { type: 'mine', x: 0.3, y: 0.4 },
      { type: 'mine', x: 0.7, y: 0.4 },
      { type: 'capsule', x: 0.5, y: 0.66, weapon: 'random' },
    ],
  },

  // ─── 파괴 불가 장애물 (잔해/소행성) 도입: 스테이지 2+. 쏴도 안 부서짐 → 오직 회피 ───
  {
    tier: 'mid', name: 'm-debris-drift',
    items: [
      { type: 'debris', x: 0.3, y: 0.2, size: 'big' },
      { type: 'debris', x: 0.7, y: 0.5, size: 'big' },
      { type: 'crystal', x: 0.5, y: 0.82, value: 45 },
    ],
  },
  {
    tier: 'hard', name: 'h-debris-field',
    items: [
      { type: 'debris', x: 0.22, y: 0.15, size: 'big' },
      { type: 'debris', x: 0.6, y: 0.32, size: 'huge' },
      { type: 'debris', x: 0.38, y: 0.55, size: 'big' },
      { type: 'debris', x: 0.78, y: 0.72, size: 'big' },
    ],
  },
  {
    tier: 'hard', name: 'h-debris-gauntlet',
    items: [
      // 지그재그로 표류 — 좌우로 피하며 통과, 가운데 보상
      { type: 'debris', x: 0.25, y: 0.15, size: 'big' },
      { type: 'debris', x: 0.75, y: 0.35, size: 'big' },
      { type: 'debris', x: 0.3, y: 0.58, size: 'big' },
      { type: 'debris', x: 0.72, y: 0.78, size: 'big' },
      { type: 'crystal', x: 0.5, y: 0.46, value: 60 },
    ],
  },

  // ─── 신규 적 6종 도입 청크 (봄버·전격·궤도·방패·모선·점멸) ───
  {
    tier: 'mid', name: 'm-bomber-run',
    items: [
      { type: 'bomber', x: 0.35, y: 0.18 },
      { type: 'crystal', x: 0.72, y: 0.62, value: 40 },
    ],
  },
  {
    tier: 'mid', name: 'm-orbiter-spin',
    items: [
      { type: 'orbiter', x: 0.4, y: 0.2 },
      { type: 'crystal', x: 0.5, y: 0.72, value: 45 },
    ],
  },
  {
    tier: 'hard', name: 'h-zapper-lanes',
    items: [
      { type: 'zapper', x: 0.3, y: 0.2 },
      { type: 'zapper', x: 0.7, y: 0.34 },
      { type: 'crystal', x: 0.5, y: 0.74, value: 60 },
    ],
  },
  {
    tier: 'hard', name: 'h-carrier-nest',
    items: [
      { type: 'carrier', x: 0.5, y: 0.18 },
      { type: 'crystal', x: 0.2, y: 0.6, value: 40 },
    ],
  },
  {
    tier: 'hard', name: 'h-shielder-guard',
    items: [
      // 방패병이 대박 크리스탈을 지킨다 — 방패 내려갈 때만 뚫림
      { type: 'shielder', x: 0.5, y: 0.24 },
      { type: 'crystal', x: 0.5, y: 0.62, value: 200 },
    ],
  },
  {
    tier: 'hard', name: 'h-blinker-ambush',
    items: [
      { type: 'blinker', x: 0.4, y: 0.2 },
      { type: 'blinker', x: 0.6, y: 0.4 },
      { type: 'capsule', x: 0.5, y: 0.68, weapon: 'random' },
    ],
  },

  // ─── 대응형 신규 적 (Phase 1) ───
  {
    // 프리즘 워든: 정면 방어막 → 좌우 코어를 측면 이동으로 조준 (양측 보상)
    tier: 'mid', name: 'm-prism-lane-choice',
    items: [
      { type: 'prismWarden', x: 0.5, y: 0.25 },
      { type: 'crystal', x: 0.18, y: 0.6, value: 40 },
      { type: 'crystal', x: 0.82, y: 0.6, value: 40 },
    ],
  },
  {
    // 스캐빈저 추격: 크리스탈을 훔치기 전에 잡을 것인가
    tier: 'mid', name: 'm-scavenger-chase',
    items: [
      { type: 'crystal', x: 0.35, y: 0.35, value: 60 },
      { type: 'crystal', x: 0.65, y: 0.4, value: 60 },
      { type: 'scavenger', x: 0.5, y: 0.15 },
    ],
  },
  {
    // 감염 게이트 도입: 통과 전에 패러사이트를 정화할 것인가 (주변 위협 최소)
    tier: 'mid', name: 'm-corrupted-gate-intro', minStage: 3,
    items: [
      { type: 'corruptedGate', y: 0.4, left: { op: '+', value: 40 }, right: { op: 'x', value: 2 }, infectedLane: 1 },
    ],
  },
  {
    // 프리즘 + 스캐빈저 혼합 (stage 5+)
    tier: 'hard', name: 'h-prism-scavenger-mix', minStage: 5,
    items: [
      { type: 'prismWarden', x: 0.5, y: 0.2 },
      { type: 'scavenger', x: 0.3, y: 0.1 },
      { type: 'crystal', x: 0.2, y: 0.55, value: 80 },
      { type: 'crystal', x: 0.8, y: 0.55, value: 80 },
    ],
  },
  {
    // 감염 게이트 + 수비 적 (stage 6+)
    tier: 'hard', name: 'h-corrupted-gate-guard', minStage: 6,
    items: [
      { type: 'corruptedGate', y: 0.35, left: { op: 'x', value: 2 }, right: { op: '+', value: 50 }, infectedLane: 0 },
      { type: 'sniper', x: 0.5, y: 0.7 },
    ],
  },
];
