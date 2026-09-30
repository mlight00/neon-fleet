// r4.29 무리 체력 바닥(게임 줄 — stage.crowdFloor) 검사 도우미.
//  makeSpawn 이 공식(정의 hp × 구간 배율 × enemyHp)으로 낸 체력은 내역의 before, 실제 체력은 내역의 hp 다.
//  공식을 대조하는 옛 검사(DB-2·DIFF-4 등)는 before 로 보고, 바닥이 올린 값은 V3-R429 CROWD 검사가 따로 잠근다.
//  무리는 (z · 종류 · 수 · 웨이브 겹) 로 찾는다 — 내역 행의 순서는 스폰 배열 순서와 다를 수 있다(스폰은 뒤에서 z 순으로 다시 정렬된다)

/** 스폰 sp 의 무리 체력 바닥 내역 행(없으면 undefined — 배수 1 줄·현상금 적) */
export function crowdRow(stage, sp) {
  const rows = (stage && stage.crowdFloor && stage.crowdFloor.rows) || [];
  return rows.find((r) => r.z === sp.z && r.kind === sp.kind && r.n === sp.n && r.horde === !!sp.horde);
}

/** 공식 체력(바닥 전) — 내역이 있으면 before, 없으면 스폰 체력 그대로 */
export function formulaHp(stage, sp) {
  const r = crowdRow(stage, sp);
  return r ? r.before : sp.hp;
}
