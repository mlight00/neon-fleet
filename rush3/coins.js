// rush3/coins.js — 코인 공식 P2(r4.3, 기획 v4.1 3-3 (라)). 순수 함수: 난수·시계·화면·저장·balance 없음.
//  이사 지시(원문) "스테이지에 획득된 코인을 누적해서". 이사님 결정 N2 = (나) 순차 해금(해금은 셸 몫 — 여기는 공식만).
//  규칙 모듈(combat.js 등)은 코인을 모른다 — kill 이벤트에 hpMax·summoned 만 싣고, 합산·지급은 셸(main.js)과 save.js 가 한다(V3-PURE).
//  셸의 판 안 누계(HUD)·결과 정산과 검사·봇 측정이 **같은 함수**를 쓰므로 측정값과 실제 게임이 어긋나지 않는다.
//
//  공식 P2(판 번호 s 하나로 정한다 — 적 체력·적 수를 바꿔도 그 판의 최대치는 그대로):
//   판 가치          V(s) = 24 + 2s  (1번 26 · 12번 48 · 24번 72)
//   일정 스폰 적 1마리 = V(s) ÷ 그 판의 일정 스폰 총수(buildStage 의 spawns — 물결·무리 수·extraSpawns 포함). 소수로 누적
//   보스 1체          = V(s) × 0.5 ÷ 보스 수(r4.10: 판 끝 목표 몫 — 보스 판 = 보스 처치 · 중간 보스 판 = 중간 보스 처치 · 대물결 판 = 결승선 돌파)
//   정산 단위(본전투) = round(적 소수 합 + 보스 소수 합) — 한 단위마다 **한 번만** 반올림
//   첫 클리어        = V(s)(판마다 한 번 — 판정은 셸이 지갑의 첫 클리어 표식으로) · 재클리어 = 5
//   8번 보너스전      = 보상 단계 K × round(V(s) × 0.25)(8번이면 10) — 보너스 종료 때 한 번
//   현상금 적 1체     = round(V(s) × 0.4)(r4.7 — 따로 둔 몫. 일정 스폰 적 총수·적 소수 합·첫 클리어와 섞지 않는다. 정수라 반올림 단위에 들어가지 않는다)
//   0 코인           = 보스 소환 적(summoned) · 부딪혀 사라진 적(kill 이벤트가 없다 — 현상금 적도 같다) · 개발용 판(devWeapon·proto3)
//   패배·포기        = 그때까지의 적·보스분(클리어 보너스 없음)

export const COIN = Object.freeze({
  base: 24, perStage: 2,     // V(s) = base + perStage × s
  bossShare: 0.5,            // 보스 몫 = V × 0.5(여럿이면 나눔)
  replayClear: 5,            // 재클리어
  bonusTierShare: 0.25,      // 보너스 단계 하나 = round(V × 0.25)
  //  r4.7 현상금 적 1체 = round(V × 0.4)(이사님 지시 2026-09-26 "대신 코인 같은 보상을 주자" — 1체만 잡아도 체감되게: 2번 11 · 12번 19 · 24번 29)
  bountyShare: 0.4,
});

/** 판 가치 V(s). 공개 판 번호가 아니면(시제품 문자열 등) 0 */
export function stageValue(s) {
  return Number.isInteger(s) && s >= 1 ? COIN.base + COIN.perStage * s : 0;
}

/** 그 판의 일정 스폰 적 총수 = Σ spawns[i].n(buildStage 결과 — 물결·무리 수·extraSpawns 가 이미 들어 있다). 보스·소환 적·현상금 적(r4.7 — 따로 둔 몫) 제외 */
export function scheduledEnemyCount(stage) {
  return ((stage && stage.spawns) || []).reduce((a, sp) => a + (sp.kind !== 'bounty' && Number.isFinite(sp.n) ? sp.n : 0), 0);
}

/** 현상금 적 1체의 코인 = round(V(s) × 0.4)(r4.7). 개발용 판·공개 판 번호가 아니면 0 */
export function bountyCoins(stageId, { dev = false } = {}) {
  return dev ? 0 : Math.round(stageValue(stageId) * COIN.bountyShare);
}

/** 그 판의 보스 수(도로 정예 배열 · 광장은 1). 없으면 0.
 *  r4.10: 보스 몫(V × 0.5)은 **판 끝 목표**에 준다 — 보스 판 = 보스 처치(여럿이면 나눔) · 중간 보스 판 = 중간 보스 처치 · 대물결 판(보스 없음, 결승선 finishZ) = 결승선 돌파 1건.
 *   판 종류와 상관없이 합계(적 V + 목표 V × 0.5 + 클리어)가 같은 꼴이다 */
export function bossCount(stage) {
  if (!stage) return 0;
  const n = (stage.elites ?? (stage.elite ? [stage.elite] : [])).length;
  return n || (stage.finishZ != null ? 1 : 0);
}

/** 보너스 단계 K 의 코인 = K × round(V(s) × 0.25) */
export function bonusCoins(stageId, tier, { dev = false } = {}) {
  if (dev) return 0;
  const k = Number.isFinite(tier) && tier > 0 ? Math.floor(tier) : 0;
  return k * Math.round(stageValue(stageId) * COIN.bonusTierShare);
}

/** 클리어 보너스: 이긴 판만. 첫 클리어 = V(s), 재클리어 = 5. 개발용 판·진 판 = 0 */
export function clearCoins(stageId, { cleared = false, firstClear = false, dev = false } = {}) {
  if (dev || !cleared) return 0;
  return firstClear ? stageValue(stageId) : COIN.replayClear;
}

/** 판 안 누계 그릇. stage = buildStage 결과(또는 id·spawns·elites 를 가진 합성 스테이지). dev = 개발용 판(전부 0) */
export function createTally(stage, { dev = false } = {}) {
  const id = stage ? stage.id : null;
  const V = dev ? 0 : stageValue(id);
  const n = scheduledEnemyCount(stage), b = bossCount(stage);
  return {
    stageId: id, dev: !!dev, V,
    perEnemy: n > 0 ? V / n : 0,
    perBoss: b > 0 ? (V * COIN.bossShare) / b : 0,
    //  r4.7 현상금 적 1체 몫(정수) · 잡은 수 · 합(정수 — 반올림 단위 밖)
    perBounty: dev ? 0 : bountyCoins(id),
    enemyRaw: 0, bossRaw: 0, kills: 0, bossKills: 0, summonedKills: 0, bountyKills: 0, bounty: 0,
  };
}

/** 이벤트 묶음을 누계에 더한다(셸은 프레임마다 drainEvents 결과를 그대로 넘긴다). 일정 스폰 적 kill 과 bossKill 만 센다.
 *  r4.7: 현상금 적 kill(bounty: true)은 적 몫에 넣지 않고 현상금 몫에만 더한다 */
export function addEvents(t, events) {
  for (const e of events || []) {
    if (e.type === 'kill') {
      if (e.bounty) { t.bountyKills = (t.bountyKills || 0) + 1; t.bounty = (t.bounty || 0) + (t.perBounty || 0); continue; }
      if (e.summoned) { t.summonedKills++; continue; }
      t.kills++;
      t.enemyRaw += t.perEnemy;
    } else if (e.type === 'bossKill' || e.type === 'finish') {
      //  r4.10: 판 끝 목표 = 보스·중간 보스 처치(bossKill) 또는 결승선 돌파(finish — 대물결 판). 몫은 같은 보스 몫
      t.bossKills++;
      t.bossRaw += t.perBoss;
    }
  }
  return t;
}

/** 지금까지의 본전투 코인(한 번 반올림) — 출격 중 HUD 의 '정산 전 누계'. r4.7: + 현상금 몫(정수) */
export function tallyTotal(t) {
  return Math.round(t.enemyRaw + t.bossRaw) + (t.bounty || 0);
}

/** 본전투 정산 한 단위: { enemy, boss, bounty, clear, bonus 0, total }. enemy + boss = round(소수 합)이 되도록 boss 를 먼저 반올림하고 나머지를 enemy 에 둔다
 *  (반올림이 단조라 enemy ≥ 0). 현상금 몫(r4.7, 정수)·클리어 보너스는 따로 더한다 */
export function mainCoins(t, { cleared = false, firstClear = false } = {}) {
  const main = t.dev ? 0 : Math.round(t.enemyRaw + t.bossRaw);
  const boss = t.dev ? 0 : Math.min(main, Math.round(t.bossRaw));
  const bounty = t.dev ? 0 : (t.bounty || 0);
  const clear = clearCoins(t.stageId, { cleared, firstClear, dev: t.dev });
  return { enemy: main - boss, boss, bounty, clear, bonus: 0, total: main + bounty + clear };
}

/** 한 판 전체를 한 번에(검사·봇 측정용): stage = buildStage 결과, events = 그 판의 이벤트 전부.
 *  opts = { cleared, firstClear, dev, bonusTier }(bonusTier = 보너스 종료 때의 단계 — 보너스가 끝나지 않았으면 넘기지 않는다)
 *  → { enemy, boss, bounty, clear, bonus, total } */
export function runCoins(stage, events, { cleared = false, firstClear = false, dev = false, bonusTier = 0 } = {}) {
  const t = addEvents(createTally(stage, { dev }), events);
  const m = mainCoins(t, { cleared, firstClear });
  const bonus = bonusCoins(t.stageId, bonusTier, { dev });
  return { ...m, bonus, total: m.total + bonus };
}
