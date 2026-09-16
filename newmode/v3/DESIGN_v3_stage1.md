# 스타포지 러시 v3 — 1단계(기준 전투 3개) 설계 계약서 (r3)

작성 2026-09-09, r2 = 3렌즈 설계 검토(규칙/결정성/기획충실도) 반영판.
**r3(2026-09-11) = 외부 검수(F2·F3·Q1·Q2·Q4·후속개선) 반영 배치·규칙 개정.** 근거 문서 = `newmode/v3/DESIGN_r3_draft.md`(승인된 개정안 r3.2), 검수 = `newmode/v3/review/01_GPT_1단계_검수결과.md`.
r3 에서 새로 들어온 규칙: **게이트 사격 활성 구간(셔터 `armZ`)** · **보급 통 차폐(`coverZ`, 비행시간 보정선)와 배제 쌍(`pairId`)** · **구조적 획득 불가 집계(`skipped`)** · **잡졸 직진(`track 0`)** · **통로 안내 표지(`wall.signs`)·회피 통로 규격(`spawns[].corridorHw`)** · **결과 제안 한 줄(`rush3/advice.js`)** · 세 스테이지 **코스 버전 2**. 기준 문서: `newmode/v3/spec/01_스타포지러시_재기획_v3.md`, `03_구현담당자_전달서.md`. 기존 코드 분석: `newmode/v3/analysis/01~06`.
**r3.3(2026-09-16) = 난이도 선택(보통/어려움/극한) 추가** — §3-8(배수 표·근거·검수 금지 조항과의 관계), §6(타이틀 토글·HUD·결과 표기), §7(기록 칸 키 `버전:난이도`), §8(V3-DIFF·V3-SIM-DIFF·V3-SAVE-VERSION DIFF). 코스 배치·규칙 STEP 은 손대지 않았다(normal = r3 그대로).
이 문서는 구현 담당(사람·에이전트)이 공유하는 **모듈 경계와 규칙의 단일 진실**이다. 수치는 시제품 출발값이며 `rush3/balance.js`·`rush3/stages.js`가 최종 값을 가진다.

## 0. 범위와 원칙

- 범위 = 03 전달서 1단계: **사격형 게이트 · 병사/무기 통 · 병사별 실제 사격 · 분리벽 · 즉시 재도전**을 갖춘 스테이지 3개. 아레나·영웅·기지·드론·보너스전·3칸 게이트·원근 투영·코인은 2단계 이후.
- 기존 게임(`rush.html` + `rush/`)과 `tests/rush-*.test.mjs`는 **한 줄도 수정하지 않는다**. 신규는 `rush3.html`(루트) + `rush3/` + `tests/rush3-*.test.mjs`(ID 접두 `V3-`). 기존 코드는 `rush/rng.js`만 import하고, 나머지는 9장 결선표대로 복제·신규 작성.
- 게임 규칙은 순수 함수·순수 상태(`rush3/combat.js` 외 순수 모듈)로 두고 `node:test`로 잠근다. 화면(render)·입력·루프(main)는 규칙을 호출만 한다. **규칙 모듈은 `Math.random`·rng를 import하지 않는다**(정적 검사 테스트).
- **고정 시간 간격**: 규칙은 `STEP = 1/60`초 단위로만 진행한다. 30/60/120Hz 화면에서 같은 STEP별 입력열이면 같은 결과.
- 스테이지는 **고정 배치**. 스폰 좌표·지터까지 `buildStage(id)`가 `hashSeed(stageId + ':' + ev.z + ':' + i)`로 빌드 시점에 확정해 데이터에 박는다. 재도전 = `buildStage` 재호출(새 객체, 이전 판의 durability/value/passed/opened가 남지 않는다).
- 연출 난수(파편 각도 등)는 셸/렌더 전용 스트림이며 규칙 상태를 읽거나 쓰지 않는다. 시각 효과에 전역 `Math.random` 금지.

## 1. 좌표계

- 논리 화면 480×800. 부대 기준선 `LINE_Y = 640`. 도로 폭 x **80~400**(중앙 240). 시작 x = 240.
- **규칙 계층은 전부 트랙 좌표 z**를 쓴다: 부대 중심 `run.z`, 게이트·통·벽·발판(정지물)은 고정 z, 적·적탄·아군 탄도 z를 갖는다. 화면 y는 렌더에서만 `y = LINE_Y - (obj.z - run.z)`로 변환한다. z가 클수록 앞(화면 위).
- 세계 속도: 부대는 `scroll = 190`px/s로 전진(`run.z += scroll·STEP`, 보스전 중 0). 적의 `vz`는 세계 기준 부대 쪽 접근 속도(음수 방향으로 표기 없이 양수 = 부대 쪽으로 다가옴). 화면 체감 속도 = scroll + vz. 도로 고정형은 vz 0(보스전 중 자동 정지).
- 아군 탄: `vz`(세계 기준 전진 속도, 예: 700). 트랙 좌표에서 `z += vz·STEP`. 화면상 속도는 vz + scroll이 되지만 규칙에는 무관하다.
- 화면 진입은 `obj.z - run.z <= 760`(y ≥ −120)부터 그린다. 탄 정리: `z > run.z + LINE_Y + BAL3.cull.bulletAhead` = `z > run.z + 650`(`balance.js` `cull.bulletAhead: 10`, `combat.js` `moveBullets`). 그래서 **탄이 닿는 최대 전방거리는 실측 662px**이며, 게이트·통 배치와 사격창 계산은 전부 이 값을 기준으로 한다. 적 정리: `z < run.z - 200`(부대 뒤로 사라짐).

## 2. 모듈 구조(`rush3/`)와 export 계약

| 파일 | export | 순수 |
|---|---|---|
| `balance.js` | `BAL3` (동결된 객체, **`BAL3.difficulty` 배수 표 포함**), **`DIFFICULTY_IDS`**, **`DEFAULT_DIFFICULTY`**, **`difficultyMult(id)`**(표 한 줄, 모르는 id 는 throw) | 데이터 |
| `stages.js` | `STAGE_IDS`, `DEFS`, **`buildStage(id, { difficulty = 'normal' }) → stage`**(`stage.difficulty` 포함), `stageMeta(id)`, `stageVersion(id)`, **`coverZFor(wallZ0, supplyZ)`**, **`VZ_MIN`** | 순수 |
| `weapons.js` | `WEAPONS`, `weaponRank(id)`, `makeBullet(weaponId, x, z, ownerId)` | 순수 |
| `gates.js` | `makeGateRow(def) → row`, **`updateGateArm(row, run, events)`**, **`hitGateCell(row, cell, bullet, events)`**, `passGateRow(row, run, events)`, `cellAt(row, x)`, `gateColor(value)`, `gateLabel(value)`, `sweepContactGate(row, cell, bullet)`, `sweepHitsGate(row, cell, bullet)`, `GATE_ARM_Z` | 순수 |
| `supply.js` | `makeSupply(def)`, `hitSupply(s, bullet, events, run)`, `passSupply(s, run, events)`, `takePads(s, run, events)`, `supplyActive(s)`, **`supplyCovered(s, run)`**, **`structurallyLost(s, run)`**, `supplyReward(s)`, `sweepContactSupply(s, bullet)`, `sweepHitsSupply(s, bullet)`, `activateChain(s, events)`, `applySupplyReward(reward, run, events, opts)`, `WALL_LEAD` | 순수 |
| `squad.js` | `formation(n) → [{dx,dy}]`, `formationHalfWidth(n)`, `makeUnit(id)`, `layoutUnits(units)`, `compressUnits(units, lo, hi)`, `clampCenter(run, walls)`, `hitUnit(units, x, z, r) → unit|null`, `frontmostUnit(units)`, `removeUnits(units, n, from='back')` | 순수 |
| `combat.js` | **`createRun(stage, { difficulty }?) → run`**(기본 = `stage.difficulty`), `stepRun(run, input, STEP)`, `drainEvents(run) → events[]`, `STEP`, **`enemyDefsFor(difficulty)`**(배수 적용 적 정의 표, 동결) | 순수 |
| `render.js` | `createRenderer3(ctx, sprites) → { draw(view) }` | 화면 |
| `sprites.js` | `SPRITE_KEYS3`, `loadSprites3(base) → { get(key), ready }` | I/O |
| `audio.js` | `createAudio3({ dir }) → { unlock, sfx(name, opts), bgmPlay(name), bgmPause, bgmResume, setVolume, getVolume, setMuted, isMuted, duck }` | I/O |
| `save.js` | `createSave3(storage) → { get(), getStage(id, version, difficulty), updateStage(id, patch, version, difficulty), getStageVersions(id), patch(obj), ok }`, **`recordKey(version, difficulty)`**, **`BASE_DIFFICULTY`** | I/O |
| **`advice.js`(신규)** | **`adviceLine(run, stage) → string|null`**, `ADVICE_DEFAULT` | 순수 |
| `main.js` | `boot(canvas, deps)`(자동 부트는 `#game3`가 있을 때만), `hitButton`, `makeLoop`(누적기, 테스트 가능), `missedLine`, `timeText`, **`DIFF_TOGGLE`**(타이틀 토글 좌표), **`normDifficulty(d)`**(저장값 거르기) | 셸 |

## 3. 핵심 데이터

### 3-1. 전투 상태 `run`

```js
{
  stageId, stageVersion: 1,
  difficulty: 'normal'|'hard'|'brutal',    // 3-8. 생성 시점에 확정, 판 도중 불변
  enemyDefs: { grunt, rusher, shooter, elite },   // 3-8. BAL3.enemies 에 난이도 배수를 한 번 적용해 동결한 표 — 규칙은 이것만 읽는다
  z, prevZ, x, tx,
  units: [ { id, dx, dy, hp, fireT } ],     // dx/dy = 대형 오프셋(중심 기준). id는 1부터 증가(nextUnitId)
  nextUnitId,
  weapon: 'rifle'|'auto'|'heavy',           // 판 종료까지 유지, 강등 없음
  bullets: [ { x, z, pz, vz, dmg, w, kind, gateHit: 1, ownerId, dead } ],
  gateRows: [...], supplies: [...], walls: [...], events: [] (연출 이벤트 큐 — drainEvents 전까지 누적),
  enemies: [ { id, kind, x, z, pz, vz, hp, r, dead, touched, ... } ],
  eshots: [ { x, z, pz, vx, vz, dmg, r, dead } ],
  boss: null | { kind:'elite', x, z, hp, max, r, state:'descend'|'hold', dir, shootT, touchT, spawnT, dead },
  wallSide: {},                              // wallId → 'L'|'R'
  pendingRewards: [],                        // STEP 5에서 쌓고 9에서 적용
  time, peak, kills, lossByTouch, lossByShot, lossByGate,
  missedSupplies,          // 얻을 수 있었는데 못 얻은 통(실제 기회 손실)
  skippedSupplies,         // 구조적으로 얻을 수 없던 대안(의도된 선택 — '놓침'으로 세지 않는다)
  badGatesPassed, lastBadGateId,   // lastBadGateId = 마지막으로 통과한 음수 게이트 행 id(advice.js 가 읽는다)
  over: false, won: false, wonAt: null,
}
```

### 3-2. 게이트 행(`gates.js`)

```js
row  = { id, z, h: 24, cells: [ cell... ], passed: false, bypass: false,
         armZ: number|null, armed: boolean, hint: string|null }
cell = { x0, x1, value, maxValue, flashT: 0 }      // [x0, x1) 반열림, value는 정수. maxValue는 칸마다 다를 수 있다
```

**사격 활성 구간(셔터) `armZ` — r3 신규.** 전투 전체 사거리는 그대로 두고 **게이트에만** 적용되는 사격 가능 구간이다. 기본 규칙 **유효탄 1발 = +1 은 그대로**이고 **병력 수에 비례한 숨은 감쇠는 넣지 않는다.**
- `armZ`: 부대 중심 기준 전방 거리(px). 기본값 `BAL3.gate.armZ = 340`. **`null` = 항상 열림(학습용 게이트)**. `makeGateRow`는 `def.armZ`가 없으면 340, 명시적 `null`이면 항상 열림으로 만든다.
- `armed`: 판 시작 시 `armZ === null`. 매 STEP `row.z - run.z <= row.armZ`가 처음 성립하는 STEP에 `true`가 되고 되돌아가지 않는다(`run.z`는 감소하지 않는다 — 보스전 중에는 멈출 뿐).
- **닫힌 셔터(`armed === false`)에 닿은 탄은 흡수한다(통과가 아니다). 값·`flashT`는 변하지 않고 이벤트 `gateBlock {id, idx, x, z}`.** 벽·미개봉 통·미통과 게이트가 이미 전부 흡수이므로 충돌 규칙이 한 갈래로 유지된다.
- 열리는 STEP에 `updateGateArm(row, run, events)`이 이벤트 `gateArm {id, z, x}`를 **정확히 1회** 낸다.
- **⚠ 셔터 검사는 `hitGateCell` 안에만 둔다.** `sweepContactGate`에 넣어 `null`을 돌려주면 행이 충돌 후보에서 빠져 탄이 **통과**해 버린다(흡수 결정과 반대). 통의 차폐(3-3)도 같은 이유로 `hitSupply` 안에 둔다.
- 실측(`review/armz-probe.mjs`): 탄이 닿는 최대 전방거리는 662px이므로 현재는 사실상 `armZ ≈ 665`였고, **340은 그것을 약 절반으로 줄인다.** `armZ 340`의 유효탄 = 소총 1명 5발 / 기관총 1명 9발(1인당 4.85 / 9.3). 그래서 "5명만 넘으면 어떤 음수 칸도 상한"이 성립하지 않는다.
- 선택 행은 도로를 **빈틈 없이** 덮는다: 두 칸 = 좌 `[80,240)` / 우 `[240,400)`. 한 칸 행은 그 칸만 존재하며 `bypass: true`(옆은 우회로). `stages` 테스트가 `bypass`가 아닌 행의 칸 합집합이 80~400을 완전히 덮는지 검사한다.
- `hitGateCell(row, cell, bullet, events)`: **`armed`일 때만** `value = min(maxValue, value + bullet.gateHit)`(gateHit는 모든 무기 1, heavy 폭발도 게이트에는 직격 1회만). 탄 흡수(`dead`). 음수→0 이상으로 넘어가면 이벤트 `gateFlip`, 그 외 `gateHit {id, value}`. `flashT = 0.12`.
- 판정 형상: z 구간 `[row.z - h/2, row.z + h/2]` × 칸 x 범위. 탄 스윕 `[pz, z]`가 이 구간과 겹치고 x가 칸 안이면 명중.
- `passGateRow(row, run, events)`: `prevZ < row.z <= z`인 STEP에 `cellAt(row, run.x)`를 적용(없으면 우회, 적용 없음). `value > 0` → 유닛 `value`명 추가(`pendingRewards`가 아니라 9단계에서 직접), `< 0` → `removeUnits(|value|, 'back')`, `lossByGate += 제거 수`, `badGatesPassed++`, `0` → 무효과. **행 단위로 `passed = true`**(옆 칸도 이후 탄 무시). 이벤트 `gatePass {id, value, applied}`.
- `passed` 행은 충돌 후보에서 제외(흡수도 없음).
- 색: `value > 0` 파랑(#35E5FF), `< 0` 빨강(#FF6A3D), `0` 회색(#9AA1AC). 부호를 항상 표기(+3 / −6 / 0).

### 3-3. 보급 통(`supply.js`)

```js
{ id, z, x, r: 30, kind: 'soldier'|'weapon'|'chain', durability, maxDurability,
  payload: { n } | { weapon } | { pads0, maxPads },
  opened: false, missed: false, locked: false, skipped: false,
  coverZ: number|null,             // 차폐 개방선(비행시간 보정선). run.z < coverZ 이면 탄 흡수·내구 불변
  pairId: string|null,             // 벽으로 배제되는 쌍의 이름. 한 판에서 같은 pairId 는 최대 1개만 열린다
  hint: string|null,               // 결과 화면 제안 문구(advice.js). 배치와 함께 관리한다
  pads: [ { z, x, taken } ] }      // chain 전용
```

**차폐 `coverZ` — r3 신규.** `coverZ != null && run.z < s.coverZ`이면 탄을 **흡수**하고 내구는 줄지 않는다(이벤트 `supplyBlock`). `supplyActive(s)`는 차폐를 보지 않는다 — 차폐된 통도 충돌 후보로 남아야 흡수가 성립한다.

**`coverZ`는 통로 확정선이 아니라 '비행시간 보정선'이다.**

```
coverZ = ceil( commitZ + (s.z − commitZ) × scroll / vzMin )      commitZ = wall.z0 − 60
scroll = 190 (balance.js)   ·   vzMin = 650 (가장 느린 탄 = heavy.vz)
```

확정선(`wall.z0 − 60`)에 두면 **확정 직전에 발사돼 아직 비행 중인 탄**이 차폐가 걷힌 뒤 반대편 통에 도착해 배제가 뚫린다(검수 F3 계열). 확정 직전에 쏜 가장 느린 탄이 통에 닿는 순간의 `run.z`까지 차폐를 유지하면 **확정 전에 발사된 탄은 하나도 반대편 통에 닿지 못한다.** 값은 `stages.coverZFor(wallZ0, supplyZ)`가 계산하고 `V3-SUPPLY-PAIR PAIR-4c`·`V3-STAGES STG-4 ④`가 잠근다.
**⚠ `vzMin`보다 느린 무기·투사체를 추가하면 네 지점의 `coverZ`가 전부 부족해져 배제가 다시 열린다.** `PAIR-4c`가 먼저 실패하도록 걸어 두었다.

**배제는 벽 + `coverZ` 가 한 세트다.** 벽만 두면 확정 **전에** 사거리로 양쪽을 다 먹고, `coverZ`만 두면 확정 뒤에 반대편으로 옮겨 먹는다. **같은 z에 좌·우를 놓는 것만으로는 배제가 아니다**(사거리 662px = 3.48초 동안 좌↔우 이동은 0.72초).
**⚠ 통은 벽 끝(`wall.z1`)보다 최소 1 STEP(≈3.2px) 앞에 둔다.** `clampCenter`는 `run.z > wall.z1`인 STEP에 `run.wallSide[w.id]`를 지우고 `passSupply`는 같은 STEP의 뒤쪽에서 돌기 때문이다.
- `hitSupply(s, bullet, events, run)`: `run.pendingRewards` 배열이 없으면 `TypeError`(보상 경로를 하나로 고정). `(opened && kind !== 'chain') || missed || locked`면 무시(충돌 후보에서도 제외). `durability -= bullet.dmg`(heavy 폭발은 통에 직격만). `<= 0`이 되는 첫 탄에서 `opened = true` → `pendingRewards.push({ kind, payload, x, z })` **정확히 1회** + 이벤트 `supplyOpen`. chain은 `opened` 이후 유효탄 1발(무기 무관) = 발판 +1(`maxPads`까지), 이벤트 `padAdd`. 통은 탄을 흡수한다. 그 외 탄은 이벤트 `supplyHit {id, durability}`.
- 보상 적용(9단계): soldier → 유닛 `n`명 추가. weapon → `weaponRank(payload.weapon) > weaponRank(run.weapon)`일 때만 교체(동급·하급은 무시, 이벤트 `weaponSame`). chain → `pads`를 `s.z + 60 + i*40`, x = s.x(같은 차선)에 `pads0`개 생성, 이벤트 `chainOn`.
- `passSupply(s, run, events)` **판정 순서(r3)**:

  ```
  0.   s.missed || s.skipped || (s.opened && s.kind !== 'chain')   → return false
  0-b. !(run.prevZ < s.z && s.z <= run.z)                          → return false   ← z 창(이걸 빼면 파트너가 열리는 STEP 에 곧바로 skipped 가 켜진다)
  1.   s.opened (chain)                  → locked 처리만
  2.   미개봉 + structurallyLost(s, run) → skipped = true, run.skippedSupplies++, 이벤트 supplySkipped
  3.   그 외 미개봉                      → missed  = true, run.missedSupplies++,  이벤트 supplyMissed
  공통. kind === 'chain' && !locked      → locked = true      ← ⚠ 2·3 분기에서도 반드시 돈다(V3-CHAIN 계약)
  ```

  `structurallyLost(s, run)` = **지나는 시점에 구조적으로 획득 불가능했는가**
  ```
  (a) 벽 배제   : 어떤 벽 w 에 대해 (w.z0 − 60) <= s.z <= w.z1 이고 run.wallSide[w.id] 가 정해져 있으며
                  통 원이 그 통로와 전혀 겹치지 않는다 (side 'L' → s.x − s.r > w.x0 , 'R' → s.x + s.r < w.x1)
  (b) 차폐 미개방 : s.coverZ != null && run.z < s.coverZ
  (c) 쌍 배제   : s.pairId != null 이고 같은 pairId 의 다른 통 중 하나가 opened
  ```
  `skipped`는 **의도된 선택**이므로 결과 화면의 '놓친 것'에 세지 않고 제안(`adviceLine`) 후보에서도 빠진다. `supplyActive(s)`는 `skipped`를 `missed`와 같이 제외한다.
  이 구분이 없으면 ① 짝이 없는 통(빈 통로 반대편)이 '놓침'으로 세어지고 ② 한쪽 통로를 골랐을 때 좌·우 **둘 다** '놓침'이 되어 실패 안내가 거짓말을 한다.
- `takePads(s, run, events)`: `prevZ < pad.z <= z`이고 `|run.x - pad.x| <= 70`인 발판 → `taken = true`, 유닛 +1(발판당 1회), 이벤트 `padTake`. 발판 간격 40 > STEP당 스크롤 3.2이므로 한 STEP에 두 발판을 지나는 일은 없다(그래도 루프로 처리).
- 표시: 통 그림 + 내용물(병사 실루엣 n / 무기 아이콘 / 파란 설비) + 남은 내구 숫자. **내구 숫자는 병력 수가 아니다.**

### 3-4. 무기(`weapons.js`, 값은 balance)

| id | rank | 발사 간격 | 탄 dmg | vz | 탄 폭 | 색 | 특성 |
|---|---|---|---|---|---|---|---|
| rifle | 1 | 0.5s | 1 | 700 | 4 | 노랑 | 1열 직사 |
| auto | 2 | 0.25s | 1 | 800 | 5 | 파랑 | 빠른 집중 |
| heavy | 3 | 0.6s | 3 | 650 | 8 | 주황 | **적**에 직격하면 반경 28 폭발(폭발 dmg 2, 직격 적은 직격 3만, 벽 반대편 적 제외). 통·게이트·벽 명중 시 폭발 없음 |

- 모든 탄 `gateHit = 1`. 무기 통은 rank가 현재보다 클 때만 교체.

### 3-5. 병사 유닛(`squad.js`)

- 유닛 `{ id, dx, dy, hp: 2, fireT }`. 판정 반경 `unitR = 9`(그림보다 작게).
- `formation(n)`: 히어로(0,0) 중심 링 군집(기존 링 알고리즘을 옮겨 적음, 전방 90° 개방). `layoutUnits(units)`는 배열 순서대로 `formation(units.length)` 오프셋을 재부여한다(유닛이 빠지거나 늘 때마다 호출; id는 유지). "뒤쪽" = dy 큰 순, "앞줄" = dy 작은 순.
- `makeUnit(id)`: `fireT = ((id * 7) % 12) / 12 * interval`(결정적 위상 분산).
- 사격: 각 유닛이 자기 화면 위치 `(run.x + dx, LINE_Y + dy)`에서 위로 직진. 탄 시작 z = `run.z - dy`, x = `run.x + dx`. 병사 30명 = 탄 30열. 정면 사격이 한 점으로 모이지 않는다.
- 통로 제약: `clampCenter(run, walls)` — 벽 활성 구간(`wall.z0 - 60 <= run.z <= wall.z1`)에서 `hw = min(formationHalfWidth(n), corridorWidth/2 - 6)`로 중심을 `[통로 lo + hw, 통로 hi - hw]`에 클램프하고 `tx`도 같은 범위로 클램프. 벽 밖에서는 `[80 + hw', 400 - hw']`(hw' = min(formationHalfWidth, 60)). `compressUnits(units, lo, hi)`는 유닛 dx를 `[lo - run.x, hi - run.x]`로 압축(비례 축소).
- **벽 진입 규칙**: 진입 STEP = `prevZ < wall.z0 - 60 <= z`. `side = x < (x0+x1)/2 ? 'L' : (x > mid ? 'R' : (tx < mid ? 'L' : 'R'))`(정확히 중앙이고 tx도 중앙이면 'L'). `run.wallSide[wall.id] = side`로 저장, 그 STEP에 중심을 통로 안으로 스냅. `z > wall.z1`이면 삭제.
- 피해 판정은 **유닛 원 단위**: 적탄/적 본체의 이동 구간(스윕)이 유닛 원(중심 `(run.x+dx, run.z - dy)`, r 9)과 겹치는 유닛 중 가장 가까운 1명에 명중. 겹치는 유닛이 없으면 명중 없음(대형 빈틈을 지나는 탄은 아무도 안 맞는다). 유닛 hp ≤ 0 → 제거 → `layoutUnits`.
- 패배: `units.length === 0`(11단계에서 판정).
- 상한 `unitCap = 150`(추가 시 클램프).

### 3-6. 벽

```js
{ id, z0, z1, x0, x1,
  signs: { L: {kind, n?, weapon?}, R: {kind, n?, weapon?} } }   // 통로 안내 표지(kind 'none' = 빈 통로)
```
- 중앙 분리벽 예: x0 228, x1 252 → 좌 통로 [80,228], 우 통로 [252,400].
- **통로 안내 표지 `signs`(r3 신규)**: 벽 앞머리(`z0`)에 좌/우 통로 내용물을 아이콘+숫자로 그린다. 벽은 `run.z = z0 − 760`부터 보이므로 확정(`z0 − 60`)까지 **700px = 3.7초**의 판단 시간이 생긴다. **표지는 연출이 아니라 계약 데이터**이며, 표지와 실제 통 내용이 어긋나면 `V3-STAGES STG-5`가 실패한다.
- **배제 쌍은 벽 + `coverZ`가 한 세트이고, `coverZ`는 확정선이 아니라 비행시간 보정선이다**(3-3).
- 부대 중심 제약(3-5). **모든 탄(아군·적)**은 스윕 구간이 벽 사각형(`z0..z1` × `x0..x1`)과 겹치면 소멸(`dead`), 다른 명중보다 먼저. 적은 벽 안에 스폰하지 않는다(정의 책임). heavy 폭발은 벽 반대편 적에 적용하지 않는다(폭발 중심과 적 x가 벽 x 범위를 사이에 두면 제외).

### 3-7. 적

| kind | hp | r | vz(세계) | 행동 | 접촉 |
|---|---|---|---|---|---|
| grunt | 2 | 14 | 60 | **스폰한 열을 그대로 직진(`track 0`, r3: 35 → 0)**. 추종이 조작의 의미를 흐렸다 — 비켜야 하는 위협은 돌격체, 사선을 다투는 위협은 저격수, 길을 막는 것은 벽이 맡는다 | 유닛 hp −1, 적 소모 |
| rusher | 4 | 18 | 90 → 가속 260/s², 최대 420 | 스폰 x 직진(비켜야 한다) | 유닛 hp −2, 적 소모 |
| shooter | 6 | 22 | 0(도로 고정) | 1.6s마다 예고 0.5s 후 탄 1발(적탄 vz 260, dmg 1, r 5), 조준 = 발사 시점 `(run.x, run.z)` | 없음(부대 줄 지나면 소멸) |
| elite(정예) | 스테이지 고정 | 48 | — | `run.boss`. 스폰 z = run.z + 760, `descend`: z가 `run.z + 420`(화면 y 220)까지 150/s로 하강 후 `hold`: 좌우 60px/s 왕복(80+r~400−r). 1.0s마다 부채꼴 3발(적탄 vz 230, dmg 1, 각도 ±18°). S3 정예는 4s마다 잡졸 2(정예 x±40, z = 정예 z −40)에 소환 | 정예 원과 유닛 원이 겹치면 0.5s마다 겹친 유닛 중 앞줄 1명 hp −3 |

- 적 HP는 **스테이지 정의 고정값**. 등장 시 병력에 비례시키지 않는다.
- 적·보스는 hp ≤ 0이 되는 **즉시 `dead = true`**가 되어 같은 STEP의 이후 처리(이동·발사·접촉·충돌 후보)에서 제외된다(탄과 같은 원칙). 제거는 10단계.
- 접촉(잡졸·돌격체): 적 스윕 `[pz, z]`(부대 쪽으로 이동하므로 z 감소)가 유닛 원과 겹치면 겹친 유닛 중 앞줄(dy 최소) 1명에 피해, 적 `touched = true, dead = true`(kills에 세지 않음, `lossByTouch`). STEP당 1회.
- **회피 통로 규격(r3 신규)**: 스폰 정의에 `corridorHw`(그 구간 예상 부대 반폭, `null` = 통로 없음 = 탄막 무리)를 둔다. 통로가 성립하려면
  ```
  가장자리 간격 = |x(i+1) − x(i)| − 2 × 적 반지름     (도로 끝과는 도로 끝 − (x ± r))
  필요 폭       = 2 × formationHalfWidth(그 구간 예상 병력) + 10
  통로 성립     ⟺ 가장자리 간격 ≥ 필요 폭
  ```
  중심 간 간격이 아니라 **가장자리 사이 폭**이고, 반폭은 상한 60이 아니라 그 구간의 실제 `formationHalfWidth(n)`이다(벽 밖에서는 압축이 없다). `V3-STAGES STG-6`이 문서가 아니라 데이터로 검사한다.
- 적 스폰: 스테이지 이벤트 `{ z, kind, n, xs: [..], zs: [..], corridorHw }` — 좌표는 buildStage가 확정(차선 대역 균등 분산 + 지터, 벽 안 금지). 발동 = `ev.z <= run.z`(정예는 `run.boss` 배정). **보스가 있는 동안 z가 멈추므로 스폰·통과 판정도 멈춘다.**

### 3-8. 난이도(r3.3, 2026-09-16)

**근거.** 배치·구조 개정(r3, 검수 반영)을 거친 뒤 이사 실플레이 3회 소감: **"가만히 있으면 손해는 나지만 난이도가 너무 낮아 완전 쉽다."** 원인은 위협의 실질 화력 — 잡졸 hp 2(두 발), 적탄 dmg 1(병사 hp 2 라 한 발로 안 죽음), 접촉 손실 1~2, 정예가 대군에 순삭. 봇 시뮬 합격선(V3-SIM·V3-SIM-POLICY)은 사람 기준과 어긋났다. 그래서 수치를 한 점으로 다시 맞추는 대신 **사람이 직접 지점을 고르는 난이도 선택**을 둔다.

**검수 금지 조항과의 관계.** 검수(`newmode/v3/review/01_GPT_1단계_검수결과.md`)의 금지 = "적 HP 상향으로 F2 를 해결하지 말 것 · 숨은 감쇠 금지"는 **구조 문제(F2)를 수치로 덮는 것**과 **플레이어 모르게 깎는 것**을 막는 조항이다. 난이도 선택은 ① F2 구조 해결(r3 배치·셔터·차폐·배제 쌍)과 별개로 그 **위에** 얹히고 ② 타이틀에서 **플레이어가 명시적으로 고르며** HUD·결과·기록에 표기되므로 숨은 감쇠가 아니다. `normal` 은 배수 전부 ×1 = r3 그대로(기존 검사 174건 무수정 통과, V3-DIFF DIFF-2).

**배수 표(출발값 — `BAL3.difficulty`).** 위협만 올린다. 게이트·보급·무기·병사 hp·armZ·coverZ·벽·시작 병력(성장 축)은 난이도와 무관.

| id | 표기 | enemyHp | eshotDmg | touchDmg | eliteHp | spawnCount | eliteFireRate |
|---|---|---|---|---|---|---|---|
| `normal` | 보통(HUD·결과 표기 없음) | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 |
| `hard` | 어려움 | ×1.5 | ×2 | ×2 | ×1.6 | ×1.4 | ×1.25 |
| `brutal` | 극한 | ×2.2 | ×3 | ×3 | ×2.4 | ×1.8 | ×1.5 |

- `enemyHp`: grunt/rusher/shooter hp(반올림) → 2/3/4 · 4/6/9 · 6/9/13. `eshotDmg`: shooter·elite 적탄 dmg → 1/2/3(**어려움부터 적탄 1발 = 병사 1명**). `touchDmg`: grunt/rusher/elite 접촉 → 1/2/3 · 2/4/6 · 3/6/9. `eliteHp`: 정예 hp(반올림) → S1 120/192/288 · S2 220/352/528 · S3 500/800/1200. `spawnCount`: **xs 없이 `rows` 로 뿌리는 무리만** n × 배수(반올림) — 1단계에서는 S3 z8800 잡졸 18 → 25 → 32 하나뿐(xs 명시 무리는 회피 통로 규격 STG-6 을 지키려 좌표까지 그대로). `eliteFireRate`: 정예 `shootEvery` ÷ 배수 → 1.0/0.8/0.667 s(저격수 주기는 그대로). 스폰 정의에 `hp` 가 명시된 적은 그 값 그대로(스테이지 고정값 원칙).

**적용 시점(V3-PURE·결정성).** 배수는 **빌드/생성 시점에 한 번**만 적용된다. `buildStage(id, { difficulty })` 가 `stage.difficulty`·rows 스폰 n·정예 hp 를 박고, `createRun(stage)` 가 `stage.difficulty` 를 읽어 `run.difficulty` 와 **`run.enemyDefs`**(`BAL3.enemies` 에 배수를 적용해 동결한 표)를 만든다. `stepRun` 이하 규칙은 `BAL3.enemies` 를 직접 읽지 않고 `run.enemyDefs` 만 읽으므로 **STEP 안에 난이도 분기가 없다**(V3-DIFF DIFF-6 정적 검사). `createRun(stage, { difficulty })` 의 옵션은 합성 스테이지(검사)용 덮어쓰기이고 셸은 항상 `buildStage` 경로만 쓴다. 모르는 id 는 규칙 모듈이 throw — 저장값을 거르는 곳은 셸 `normDifficulty` 하나.

**봇 실측(출발값 표, 2026-09-16).** 이 표는 **봇 결과이지 사람의 성공률이 아니다.** `aim`: normal S1~S3 완주 · hard S1·S3 완주, **S2 는 정예전 전멸**(정예 217/352 잔존) · brutal S1 정예전 전멸(55/288 잔존), S3 전멸(36/1200). `plan`: hard S1·S3, brutal S3 완주. `center`: hard S1 완주, hard·brutal S2·S3 실패. hard S2 는 정예 배수(eliteHp·eliteFireRate)를 ×1.0 까지 내려도 `aim` 이 못 이긴다(잔존 56) — 원인은 적탄 dmg 2 와 옆으로 비키지 않는 봇의 조합(소총 21명이 정예 3발/초를 그대로 받아 화력이 먼저 소진). **표는 출발값으로 두고 사람 플레이로 지점을 찾는다**(보고서 `newmode/v3/build3/difficulty-report.md`, 탐색 기록 포함).

## 4. STEP 처리 순서(`combat.stepRun(run, input, STEP)`)

`input = { pointerX: number|null, dragDx: number, keyDir: -1|0|1 }`(셸이 STEP 직전에 스냅샷, 호출 후 `dragDx = 0`).

1. 조향: `pointerX !== null`이면 `tx = pointerX`(**null이면 tx를 덮어쓰지 않는다** — 키·드래그로 옮긴 목표가 옛 마우스 위치로 되돌아가지 않게); `tx += dragDx`; `tx += keyDir * 420 * STEP`. 부대 중심 이동(지수 추종 followRate 9 + 속도 상한 250px/s) → `clampCenter`(벽 진입 규칙 포함, tx도 클램프) → `compressUnits`. 세 값은 입력 모듈이 **마지막으로 쓴 장치 하나만 살려서** 주므로(6장) 서로 덮어쓰지 않는다.
2. `prevZ = z`; `boss`가 없으면 `z += scroll·STEP`; `time += STEP`.
3. 스폰 이벤트(`ev.z <= z`, 커서 소비) — 정예는 `run.boss`.
3-b. **게이트 셔터 갱신**: 행마다 `updateGateArm(row, run, events)`. `run.z` 갱신(2단계) **뒤**·사격(4단계) **앞**이어야 그 STEP의 탄 충돌(5단계)이 올바른 셔터 상태를 본다.
4. 유닛 사격: `fireT -= STEP`; ≤ 0이면 탄 생성 + `fireT += interval`. 이벤트 `fire {count}`(STEP당 1개).
5. 아군 탄: `pz = z; z += vz·STEP`. 각 탄에 대해 후보(벽, 미개봉·미missed 통, 미통과 게이트 행, `!dead` 적·보스) 중 **실제 최초 교차 z가 가장 작은(먼저 닿는) 것 1개**만 처리. 동일 교차 z일 때만 벽 > 통 > 게이트 > 적.
   - **최초 교차 z의 정의**: 탄 스윕 선분 `[pz, z]`가 그 물체에 처음 들어가는 z. 원은 `중심z − √(r² − dx²)`(dx = |탄x − 중심x|), 사각형·게이트 행은 `앞면 z`. 어느 쪽이든 `max(그 값, pz)`로 잘라 스윕 시작보다 앞이 되지 않게 한다. 물체 앞면(원의 `중심z − r`)으로 정렬하지 않는다 — 비스듬히 스치는 통이 정면의 적보다 먼저 맞는 오류가 난다.
   - **탄 폭 처리 기준**: 벽·통·게이트는 탄 **중심 x**로 판정한다(폭 미반영). 적·보스만 반지름에 **탄 반폭(w/2)**을 더해 판정한다(`r + w/2`). 교차 z도 그 반지름으로 계산한다.
   - **셔터(`armed`)·차폐(`coverZ`) 검사는 교차 함수가 아니라 `hitGateCell`·`hitSupply` 안에 있다.** 교차 함수에서 걸러 내면 후보에서 빠져 흡수가 통과로 뒤집힌다.
   - 교차 함수는 모듈마다 하나로 통일한다: `combat.wallContactZ` / `supply.sweepContactSupply` / `gates.sweepContactGate` / `combat.circleContactZ`. 모두 교차 z 또는 `null`을 돌려주며, `sweepHitsSupply`·`sweepHitsGate`는 그 결과가 null인지만 보는 얇은 껍데기다. 통 개봉·적 사망은 이 단계에서 즉시 `opened`/`dead`가 되어 다음 탄의 후보에서 빠진다(예: hp 2 잡졸에 30발 → 2발만 소모, 28발은 뒤로). 보상은 `pendingRewards`에만 쌓는다.
6. 적 이동·행동(`!dead`만): grunt 추종·전진, rusher 가속, shooter 예고/발사, 보스 하강/왕복/사격/소환. `pz = z; z -= vz·STEP`.
7. 적 탄: `pz = z; z -= vz·STEP; x += vx·STEP`. 벽 → 소멸. 유닛 원 스윕 명중(가장 가까운 유닛) → hp −dmg, `lossByShot`. `dead` 탄은 이후 제외.
8. 접촉(`!dead` 잡졸·돌격체 스윕 vs 유닛 원; 보스 타이머 접촉).
9. **보상·통과 적용**: (a) `pendingRewards` 순서대로 적용(병사 추가·무기·chain 활성) (b) `passGateRow`(행마다) (c) `passSupply` (d) `takePads`. 유닛 수 변화 후 `layoutUnits`.
10. 정리: `dead` 적 중 `!touched`는 `kills++`(이벤트 `kill`), 보스 사망 → `bossKill`, `dead` 탄·적탄 제거, 범위 밖 정리. `peak = max(peak, units.length)`.
11. 승패: `units.length === 0` → `over = true`. 승리: 정예가 있는 스테이지는 `boss가 격파됨 && enemies에 살아 있는 적 없음`, 정예가 없는 스테이지는 `z >= stage.length && 적 없음`. 승리 시 `won = true, wonAt = time`. 같은 STEP에 둘 다 성립하면 승리 우선(보상이 사망보다 먼저 적용되므로 병사가 남아 있다).

셸은 프레임 끝에 `drainEvents(run)`으로 누적 이벤트를 한 번에 소비한다(프레임당 STEP이 여러 번이어도 유실 없음). 발사음은 프레임 내 `fire.count` 합으로 1회 재생.

## 5. 스테이지 3개(고정 배치, z 단위 = px, scroll 190px/s) — **r3 개정, 세 스테이지 `version: 2`**

시간 = 물체가 **부대 줄에 도달하는 시각**(z/190). 화면에 보이는 시간은 그 전 4.0초(y −120)·3.4초(y 0). 소총 1명이 초당 2발이므로 내구 4는 2초면 연다. 첫 물체는 z ≥ 1100(안내 문구를 읽을 시간). 정예가 있으면 정예 격파 즉시 승리(빈 도로 없음).

**코스 버전.** r3 에서 세 스테이지 배치·규칙이 모두 바뀌었으므로 `DEFS[1|2|3].version` 을 **1 → 2** 로 올렸다. S1 은 통·게이트 배치를 바꾸지 않았지만 **잡졸 `track 0`·게이트 셔터·z5300 스폰 `xs` 재지정**으로 진행 결과가 달라지므로 함께 올린다. 기록은 버전별로 따로 쌓이고 옛 기록은 저장에 그대로 남는다(7장).

### S1 「첫 진격」 (시작 1명·rifle, 정예 z 7200, `version: 2`)
| z | 도달 | 내용 | r3 |
|---|---|---|---|
| 1140 | 6.0s | 게이트 행: 우 `[240,400)` +1, `bypass`(좌는 빈 길). maxValue 15 | **`armZ: null`(항상 열림 — 학습용 첫 게이트)** |
| 2100 | 11.0s | 병사 통 x 240, 내구 4, 병사 2 | `hint` |
| 3040 | 16.0s | 게이트 행: 좌 `[80,240)` −9, `bypass`(우는 빈 길). maxValue 15 | **`armZ 340`(첫 도전 게이트)**, `hint` |
| 3800 | 20.0s | grunt 4 (xs 120/200/280/360, zs +0/+40/+80/+120) | `corridorHw: null`(탄막 무리) |
| 4180 | 22.0s | 무기 통 auto, x 240, 내구 8 | `hint` |
| 5300 | 27.9s | grunt 6 (2열) — **xs 재지정 94/136/330/372(1열) · 115/351(2열, dz 40)** | **`corridorHw: 53`** — 1열 가운데 166px · 2열 208px ≥ 필요 폭 116 |
| 5890 | 31.0s | 병사 통 좌 x 150 내구 6 병사 2 / 우 x 330 내구 10 병사 4 | `hint` |
| 7200 | 37.9s | 정예 hp 120 (부채꼴 3발, 소환 없음) | |
| length 7600 | | | |

> z5300 `xs` 를 다시 지정한 이유: 잡졸이 직진(`track 0`)으로 바뀌면 무리 사이의 빈 틈이 그대로 회피 통로가 된다. 기존 균등 분산은 무조작 부대와의 여유가 **2.2px** 뿐이라 배치를 조금만 건드려도 뒤집혔고, 새 `xs` 는 그 여유를 **22.4px** 로 넓힌다(개정안 §2-3).

### S2 「갈림길」 (시작 2명·rifle, 정예 z 8200, `version: 2`)
| z | 도달 | 내용 | r3 |
|---|---|---|---|
| 1140 | 6.0s | 게이트 행: 좌 `[80,240)` **+1(칸 상한 3)** / 우 `[240,400)` **−20(칸 상한 20)** | **`armZ 340`**, `hint`. 검수 의견대로 **양쪽 모두 음수인 행을 늘리지 않고** '안전한 작은 확정 보상 vs 도전 큰 음수'로 바꿨다 |
| 1800~3000 | | **분리벽** x 228~252 + **통로 안내 표지**(좌: 병사 3 / 우: 기관총) | **`signs`** |
| 2300 | 12.1s | 좌 병사 통 x 120 내구 6 병사 3 / 우 무기 통 x 326 `auto` 내구 12 | **둘 다 `coverZ 1904`(= 확정선 1740 + 비행 보정 164) · `pairId 'w1'`**, `hint` |
| 3600 | 18.9s | grunt **4**(xs 95/137/179/221) + rusher 4 (xs 110/215/265/370) | grunt **`corridorHw: 61`** — 오른쪽 도로 끝까지 165px ≥ 필요 폭 132. 돌격체는 통로 규격 대상이 아니다(비켜야 하는 위협) |
| 4600 | 24.2s | shooter 3 (x 150, 240, 330; 도로 고정) | |
| 5400 | 28.4s | 게이트 행: 좌 **+2(칸 상한 12)** / 우 **−20(칸 상한 40)** | **`armZ 340`**, `hint` |
| 5800 | 30.5s | 병사 통 **x 150** 내구 15 병사 5 | 우 게이트를 고른 쪽은 **옮겨야** 얻는다 |
| 7000 | 36.8s | grunt 8 (2열, xs 94/136/178/220 · 262/304/346/386) | `corridorHw: null` |
| 8200 | 43.2s | 정예 hp 220 | |
| length 8600 | | | |

**의미 있는 경로 변경 2회** — ① 벽 통로(병력 3 vs 기관총) ② 두 번째 게이트(좌 안전 +12 vs 우 도전 상한 40). 시작 2명 소총 = `armZ 340` 유효탄 9발이라 첫 행의 우 `−20` 은 뒤집히지 않는다(무조작 실패 유지).

### S3 「군단」 (시작 3명·rifle, 정예 z 10600, `version: 2`)
| z | 좌 | 우 | 성격 / r3 |
|---:|---|---|---|
| 1100 | 병사 통 x160 내구 4 병사 2 | — | 좌로 |
| 1500 | — | 병사 통 x320 내구 5 병사 2 | 우로(이동 학습) |
| 1900 | 병사 통 x160 내구 6 병사 3 | — | 좌로 |
| **2400~2900** | **차폐벽 `w1` x228~252 + 표지**(좌: 연속증원 / 우: 병사 5) | | **선택 A 확정선 `run.z 2340`** |
| **2800** | **연속증원 x150** 내구 10 · 발판 5 · 최대 15 | **병사 통 x330** 내구 10 병사 5 | **선택 A** `pairId 'p1'` · 둘 다 **`coverZ 2475`** |
| **3150~3550** | **차폐벽 `w2` + 표지**(좌: 기관총 / 우: 중화기) | | **선택 B 확정선 `run.z 3090`** |
| **3500** | 무기 통 **`auto`** x150 내구 12 | 무기 통 **`heavy`** x330 내구 **24** | **선택 B** `pairId 'p2'` · 둘 다 **`coverZ 3210`** |
| 3900 | 병사 통 x150 내구 **24** 병사 4 · **`coverZ 3660`** | — | **선택 C 의 저울**(게이트 사격창과 겹친다 — 벽 배제가 아니다) |
| **4000** | 게이트 좌 **+3(칸 상한 12)** | 게이트 우 **−25(칸 상한 40)** | **선택 C** `armZ 340`, `hint` |
| 5200 | grunt 14 (2열, 통로 없음) | | 탄막 |
| 6000~7200 | 분리벽 `w3` x228~252 + 표지(좌: 병사 10 / 우: 없음) | | **선택 D 확정선 `run.z 5940`** |
| **6300** | 병사 통 x150 내구 20 **병사 10** · **`coverZ 6046`** + shooter 2 (x120 / 190) | (빈 통로 = 안전) | **선택 D** — 오른쪽 고정은 여기서 보상 0 |
| 8000 | rusher 6 (xs 100/160/210/270/320/380) | | |
| 8800 | grunt 18 (2열) + shooter 3 (130/240/350) | | |
| 10600 | 정예 hp 500 · 4s 마다 잡졸 2 소환 | | |
| length 11000 | | | |

**구조적으로 배타적인 경로 변경 = 3회**(A·B·D, 벽 + `coverZ`) **+ 사격창 저울 1회**(C). 검수가 요구한 "S3 최소 2회"를 넘긴다.

**선택 C 는 배제가 아니라 저울이다.** 통(z3900)의 `coverZ 3660` 은 게이트 셔터 개방선(`4000 − 340`)과 같은 값이라, 통과 게이트 우 칸이 **같은 사격창을 나눠 쓴다**. 다만 이 저울은 **병력 상한 안에서만** 성립한다 — 소총 30 / 기관총 12 / 중화기 25 를 넘는 대군은 창 안에서도 탄이 남아 **통과 +40 을 둘 다 가져간다**. "1발 = +1, 숨은 감쇠 없음"을 지키는 한 피할 수 없으므로 감추지 않고 적는다(`V3-SIM-POLICY POL-9` 는 이 경우를 실패시키지 않고 기록한다).

**난이도 튜닝(r3, 2026-09-11).** r2 의 튜닝 문단(사거리 662 전제)을 셔터 기준으로 다시 쓴다.
1. **게이트 사격창을 절반으로 줄였다**(`armZ 340`, 실측 662 → 340). 전투 전체 사거리·통·적·정예 사거리는 건드리지 않았다.
2. **음수 칸의 상한을 칸마다 따로 준다**(S2 우 −20/상한 40, S3 우 −25/상한 40). 큰 성장 보상은 남기되 병력이 모여야만 닿는다.
3. **잡졸을 직진으로 바꾸고**(`track 0`) 회피 통로를 **데이터로 선언**했다(`corridorHw`). 손해분은 배치와 돌격체·저격수로 상쇄하며 **적 HP 상향·병력 비례 숨은 감쇠는 쓰지 않는다.**
4. S1 은 그대로 무조작 완주 보장(첫 스테이지 성공 경로). 검증 = `V3-SIM-POLICY POL-2`.
5. 검증 = `V3-SIM-POLICY POL-1~9`(8정책 × 3스테이지 = 24판) + `V3-SIM-NOOP`.

## 6. 화면(`render.js`)과 셸(`main.js`)

- 렌더는 `view.now`(셸 시계)만 쓰고 `performance.now()`를 직접 읽지 않는다. DPR 반영(백킹스토어 = CSS 크기 × min(devicePixelRatio, 2)).
- HUD 상단: `STAGE n 제목` + 목표(남은 거리 m, 정예 등장 후 정예 HP 막대+숫자). 부대 발밑: 병력 수. 우상단: 무기 아이콘·이름. **무기 칩 왼쪽 옆(x 222~286)에 난이도 태그 — 어려움·극한만**(`BAL3.difficulty[id].short`, normal 은 빈 문자열이라 안 그린다). 부대 중심 표시(작은 삼각 마커 — 게이트 칸 판정 기준). 적 HP 태그의 기준 hp(잡졸은 다쳤을 때만 표시)는 `run.enemyDefs` 를 읽는다.
- 첫 플레이 안내: 출격 후 3초간 "좌우로 드래그 · 쏴서 숫자를 키우세요" 한 줄(모든 코스 버전·난이도 칸의 attempts 합이 0 일 때만).
- **타이틀 난이도 토글(r3.3)**: 스테이지 버튼(y 436~) 바로 위 한 줄 — 라벨 "난이도" + 칸 3개(보통/어려움/극한, `main.DIFF_TOGGLE`: x 138 + i×96, y 382, 90×34, 버튼 id `diff_<id>`). 고른 칸 = primary. **클릭 또는 키 1/2/3**(타이틀에서만 — 판 도중 숫자 키는 무시). 선택은 저장 최상위 `difficulty` 에 기억되고, 스테이지 버튼의 기록(sub: 완료·최고·도전 횟수)은 **그 난이도 칸의 기록**이다. 출격은 `buildStage(id, { difficulty })` 로, 그 뒤로는 `run.difficulty` 가 진실(재도전·다음 작전도 같은 난이도).
- 게이트: 칸 사각형 + 부호 숫자(큰 글씨) + 색. 피격 시 흰 플래시·숫자 튐. 통과 뒤 흐리게.
- **게이트 셔터(r3)**: `armed === false`인 행은 칸 위에 **회색 빗금 셔터 판**을 덮고 숫자를 **보이되 흐리게** 그린다(무엇이 걸린 판인지 미리 읽게 한다). 도로 위 `run.z + armZ` 위치에 **사격 개시선**(행 색 점선 1줄)을 그려 "여기서부터 쏠 수 있다"를 가르친다. `gateArm` 이벤트 → 셔터 판이 `BAL3.gate.openT`(0.25초) 동안 위로 걷히는 연출 + 효과음 `gateOpen` **1회**. `gateBlock` → 셔터 표면에 작은 **회색** 튐(피격 흰 플래시와 구분). 셔터 연출 타이머는 규칙이 아니라 셸 `fx.gateOpen[rowId]` 가 갖는다(`fx.gateFlash` 와 같은 방식).
- **보급 차폐·통로 표지(r3)**: `run.z < s.coverZ` 인 통은 회색 막을 덮고, 도로 위 `coverZ` 위치에 **개방선**(청록 점선)을 그린다. 벽의 **확정선**(`z0 − 60`)은 회색 실선으로 따로 그려 **"통로가 정해지고 잠시 뒤에 차폐가 걷힌다"**를 화면에 남긴다(두 줄의 색이 다르다). 벽 앞머리(`z0`)에는 `wall.signs` 를 좌·우 아이콘+숫자로 그린다.
- **`skipped` 통(r3)**: '밀려나며 사라지는' `missed` 연출과 달리 **흐려지며 뒤로 빠진다**(실수가 아니라는 신호). 떠오르는 문구도 '놓침'이 아니라 '다른 길'.
- 보급: 통 그림(기존 SUPPLY 스프라이트 재사용) 위에 내용물(병사 실루엣 n / 무기 아이콘 / 파란 설비) + 내구 숫자. 파괴 시 보상 팝(0.5초 떠오른 뒤 부대로 흡수). chain 발판은 파란 발판 열 + 각 발판 "+1".
- 벽: 도로 위 회색 분리대(상단 하이라이트). 정예 등장: 0.8초 "정예 접근!" 경고 배너 + 효과음.
- 탄: 무기별 색·폭. 유닛마다 그린다(150명 이하). 적탄 5종 그리기는 기존 헬퍼 복제.
- 상태: `title → run → paused → result(won|lost)`. result: 성공/실패, **제목 `STAGE n 제목 · 어려움`(난이도 짧은 표기를 제목 옆에, normal 은 없음)**, 생존 병력, 최고 병력, 시간, 처치 + **제안 한 줄(`adviceLine`)** + 실패 시 놓친 것 한 줄(`missedSupplies`·`badGatesPassed`·`lossByTouch/lossByShot`로 생성: 예 "병사 통 2개를 놓침 · −게이트 1회 통과") + 버튼 [다시 도전] [다음 작전(성공 시)] [스테이지 선택]. 저장 실패 시 "기록 저장 안 됨" 한 줄.
- **제안 한 줄(r3, `rush3/advice.js`)**: 있으면 **그것을 크게**, 놓친 것 요약은 그 아래 작게 그린다. 순수 함수 `adviceLine(run, stage)` 가 아래 순위로 **결정적으로**(무작위 없이) 고른다.

  | 순위 | 조건 | 문구 |
  |---:|---|---|
  | 1 | `lossByGate > 0` | 마지막으로 통과한 음수 게이트 행(`run.lastBadGateId`)의 `hint` |
  | 2 | `missedSupplies > 0` | **놓친(`missed`)** 통 중 z 가 가장 작은 통의 `hint` |
  | 3 | `lossByShot >= lossByTouch && lossByShot > 0` | "저격수는 예고선이 보일 때 옆으로 한 번만 비키면 됩니다" |
  | 4 | `lossByTouch > 0` | "돌격체는 쏘는 것보다 비키는 게 빠릅니다" |
  | 5 | 그 외 | 성공 판 "다음엔 반대쪽 보급을 골라 보세요" / 실패 판 `null`(셸이 `missedLine` 을 쓴다) |

  **`skipped` 통은 어느 순위에도 들어가지 않는다**(의도된 선택이므로). 문구(`hint`)는 **배치와 함께 관리**한다 — `stages.js` 의 `supplies[].hint`·`gates[].hint`.
- 결과 문구는 **어절(공백) 경계에서만 줄바꿈**한다(단어 중간에서 줄이 갈라지지 않게).
- 입력: 마우스 호버 = 절대 x(`pointerX`), 터치 = 드래그 상대 이동(`dragDx` 누적, 손가락 댄 위치로 튀지 않음), 좌우 키(`keyDir`). ESC/⏸ 일시정지. blur·visibilitychange·pointercancel → 자동 일시정지 + 드래그 상태 해제 + `dragDx = 0`.
- **장치 우선순위 = 마지막으로 쓴 장치가 이긴다**(`input.state.device` = `'mouse' | 'touch' | 'key' | null`). 세 입력이 동시에 살아 있지 않도록 **이벤트가 나는 순간 다른 장치의 목표를 지운다**.
  - 키를 **누르는 순간** `pointerX = null`. 키를 놓아도 `pointerX`는 null 그대로라 **옛 마우스 위치로 되돌아가지 않는다**(다음 마우스 이동 전까지).
  - **마우스를 움직이면**(호버·클릭) 눌린 키 상태와 `keyDir`을 해제한다 → 마우스 조작 재개. 키로 다시 움직이려면 키를 다시 눌러야 한다.
  - **자동반복 keydown은 입력이 아니다**: 브라우저가 키를 누르고 있는 동안 보내는 `e.repeat` keydown은 셸(`main.js`)이 걸러 `input.onKey`로 넘기지 않는다(조향 키면 브라우저 기본 동작만 계속 막는다). 최초 1회만 `pointerX`를 해제하므로 **"키를 누른 채 마우스를 움직이면 마우스가 이긴다"가 실제 브라우저에서도 성립한다**(반복까지 넘기면 초당 수십 회 `pointerX`가 다시 지워져 이 규칙이 깨진다). ESC·Space·Enter의 반복도 같은 자리에서 걸러져 동작을 다시 일으키지 않는다.
  - **드래그 우선**: 드래그가 시작되면 `pointerX = null` + `keyDir = 0`(눌린 키 해제)이고, **드래그 중 키 입력은 방향에 반영하지 않는다**(아는 키면 셸에는 `true`로 알려 기본 동작만 막는다). 드래그 중 마우스 이동·둘째 손가락은 기존대로 무시. 드래그가 끝난 뒤 키를 다시 누르면 키 조작이 재개된다.
- 루프(`makeLoop`): `acc = min(acc + dt, 5·STEP)`(초과 폐기), 일시정지 진입·해제 시 `acc = 0, last = now`, run 상태가 아닌 프레임은 acc 갱신 없음. 프레임당 최대 5 STEP. `window.__rush3Dbg()`로 `{state, stageId, difficulty, z, x, units, weapon, boss, enemies, bullets}` 노출(`difficulty` = 판 중이면 `run.difficulty`, 타이틀이면 고른 값).
- 오디오 이벤트: fire(무기별, 프레임 1회, 볼륨 = min(1, 0.4 + count/40)), crateHit, crateBreak, gateTick, gateFlip, **gateOpen(셔터 열림, 행마다 1회)**, joinMany(3명 이상 합류), weaponSwap, hurt, kill, elite, win, lose. `gateBlock`·`supplyBlock` 은 **소리 없이** 화면 튐만.

## 7. 저장(`save.js`)

- 키 `starforgeRush.v3`: `{ v: 3, stages: { [id]: { versions: { [key]: { cleared, attempts, bestSurvivors, bestTime } } } }, lastStage, difficulty, volume, mute }`. **기록 칸 키 `key`(r3.3) = `${stageVersion}`(normal — 접미 없음, 옛 기록 칸 그대로) | `${stageVersion}:${difficulty}`(어려움 `2:hard`·극한 `2:brutal`)**. `recordKey(version, difficulty)` 가 단일 조립점. 최상위 `difficulty` = 타이틀에서 마지막으로 고른 난이도(문자열이면 그대로 저장, id 판정은 셸 `normDifficulty`).
- **기록은 stageId + 코스 버전(stageVersion) + 난이도로 묶는다.** 코스 버전은 `stages.js`의 `DEFS[id].version`이 단일 출처이고 `buildStage(id).version` · `stageVersion(id)` · `run.stageVersion`으로 흐른다. 배치를 고치면 그 값을 올린다 → 새 버전 기록은 새 칸에 쌓이고 옛 기록은 그대로 남는다. **r3 현재 코스 버전 = 세 스테이지 모두 2**(저장 구조 자체는 바뀌지 않았다).
- **마이그레이션**: 구 저장(`stages[id]`에 기록이 바로 있던 형식)은 **지우지 않고 버전 1로 귀속**한다. `versions`가 없거나 그 안에 `1`이 없는데 옛 필드가 남아 있으면 그 값이 버전 1이 된다. 버전 키는 1 이상의 정수만 인정하고 그 밖(문자열·0·소수·NaN)은 1로 본다 — **단, 이미 있는 버전 1 기록을 덮지 않는다.**
- **귀속 우선순위(먼저 채운 칸은 덮지 않는다)**: ① `versions` 안의 정규 버전 키(`'1'`,`'2'`,…) ② 구 저장의 옛 필드 ③ 정규가 아닌 잡키(1로 봄). 잡키는 **비어 있는 칸에만** 들어가므로, 진짜 버전 1 기록과 잡키가 한 칸에 함께 있어도 진짜 기록이 남는다(원문 키 순서와 무관). 귀속할 자리가 없는 잡키의 값은 버려지되 **실재하는 기록은 절대 지우지 않는다**(무음 데이터 손실 금지 — 이 경로는 `.bak`도 남기지 않으므로 되돌릴 방법이 없다).
- API: `getStage(id, version = 1, difficulty = 'normal')` · `updateStage(id, patch, version = 1, difficulty = 'normal')`(그 버전·난이도 칸만 깊은 병합, 다른 칸·다른 스테이지 불변) · `getStageVersions(id)`(모든 칸 사본 — `'2'`, `'2:hard'` …). `patch({ stages })`의 조각이 버전 없이 오면 버전 1 갱신으로 본다.
- **정규 칸 키(r3.3)** = `^[1-9][0-9]*(:[a-z][a-z0-9_-]*)?$`. `':normal'` 접미는 정규지만 접미 없는 칸과 같은 칸으로 본다(이미 찬 칸을 덮지 않는다). **모르는 난이도 접미(`'2:nightmare'`)도 실재 기록이므로 제 칸에 보존**한다(지우지 않는다). 대소문자·그 밖 잡키는 종전대로 1 로 보되 찬 칸을 덮지 않는다.
- **결과 화면의 신기록 비교·attempts 증가는 같은 버전·같은 난이도 칸 안에서만.** 스테이지 선택 화면은 `stageVersion(id)` + 고른 난이도 칸의 기록을 보여 준다(다른 버전·다른 난이도 기록은 저장에 남되 화면에는 안 나온다). 첫 플레이 안내 판정만 모든 칸의 attempts 합을 쓴다.
- load: `v === 3 && stages가 plain object`가 아니면 원문을 `starforgeRush.v3.bak`에 보존(가능할 때) 후 기본값. 기록 필드는 `Number.isFinite`로 강제. localStorage 접근·setItem·stringify 예외 전부 try, `ok` 플래그.
- `starforgeRush.v1`은 읽지도 쓰지도 않는다.

## 8. 검증(`tests/rush3-*.test.mjs`, ID 접두 `V3-`)

- V3-GATE: −2에 유효탄 3발 → +1; 통과 시 1명 증가; 통과 뒤 탄 5발 → 값·병력 불변; maxValue 클램프; 0 통과 무효과; 두 칸 행에서 중심 240 → 우 칸 적용(반열림); 중심 기준 1칸만; 행 단위 passed.
- V3-GATE-SCROLL: 스크롤 켠 상태에서 탄 위상을 STEP 안 0~1 전 구간(20분할)으로 훑어 게이트 명중 100%, 게이트 뒤 통 내구 불변.
- V3-SUPPLY: 내구 10·병사 2 통에 dmg 1 탄 10발 → 정확히 2명 합류, 11발째 무효; 내구 4 통에 한 STEP 10발 → 4발 소모 + 6발은 뒤 물체로; missed 뒤 탄 20발 → 불변; weapon 동급·하급 무시.
- V3-CHAIN: 활성화 → 발판 5; 유효탄 3발 → 8; maxPads 클램프; 통과 시 발판당 1회; locked 뒤 히트 무효.
- V3-ORDER-CONTACT: 탄 x240 z90→101.67(w 4) · 통 (269,105) r30 내구 10 · 적 (240,108) r14 hp 2 → 적 접점 92 < 통 접점 97.319 이므로 **적 hp 1 · 통 내구 10 불변**; 반대 배치(통 접점이 더 앞)면 통이 맞고 적은 무사.
- V3-ORDER: 한 발이 앞의 통과 뒤의 게이트를 동시에 처리하지 않음; 동일 STEP에 hp 2 잡졸에 30발 → 2발 소모·kills 1·28발 관통; STEP 5에서 격파된 잡졸이 같은 STEP 8에서 유닛을 깎지 않음(touched=false, kills+1); 유닛 1명 hp 1인 STEP에 통 개봉 +2와 접촉 −1이 겹쳐도 over=false.
- V3-FIRE: 병사 1/10/30명에서 1초 누적 탄 수 비례; 30명 탄의 x 열 수 ≥ 20(한 점으로 모이지 않음).
- V3-INPUT-SWITCH: 마우스를 x240에 둔 뒤 오른쪽 키 2초 = 마우스 없이 오른쪽 키 2초와 최종 x 동일(≈391); 키를 놓아도 옛 마우스 위치로 복귀 없음; 키를 누른 채 마우스를 움직이면 마우스가 이김(keyDir 해제·마우스 위치 추종); 드래그 시작이 마우스·키 목표를 지우고 드래그 중 키는 무시, 드래그 종료 뒤 키 재개. **셸 결선**: 마우스가 이긴 뒤 자동반복 keydown(`e.repeat`) 30회가 와도 `pointerX`가 지워지지 않고(조향 키의 기본 동작은 계속 막음) 부대는 마우스 위치를 따라가며, 자동반복 ESC로 일시정지가 뒤집히지 않는다.
- **V3-DIFF(r3.3, `DIFF-1~6`, `tests/rush3-difficulty.test.mjs`)**: ① 배수 표가 3-8 표 그대로·id 순서·모르는 id 는 `difficultyMult`/`buildStage`/`createRun` 전부 throw ② **normal 은 종전과 완전히 같다** — `buildStage(id) ≡ buildStage(id,{normal})`(deepEqual), `enemyDefsFor('normal') ≡ BAL3.enemies`, 성장 축(게이트·통·벽·시작 병력·무기·길이·armZ)이 세 난이도에서 deepEqual, 병사 hp 2·armZ 340 불변 ③ `enemyDefsFor` — hp 2/3/4·4/6/9·6/9/13, 접촉 1/2/3·2/4/6·3/6/9, 적탄 dmg 1/2/3, 정예 주기 1/0.8/0.667, 그 밖 필드 그대로, 동결 ④ `buildStage` — 정예 hp 120/192/288·220/352/528·500/800/1200, S3 z8800 잡졸 n 18/25/32(두 열·도로 안), xs 명시 스폰은 좌표까지 normal 과 deepEqual, 난이도별로도 호출마다 새 객체 ⑤ **실제 `stepRun`** — 스폰 잡졸 hp, `ev.hp` 명시는 배수 무관, 돌격체 접촉 `hurt.n`, 저격수 적탄 `hurt.n`(어려움부터 `unitLost` 1발), 정예 6초 발사 횟수 6/7/9 ⑥ `stepRun` 이후 소스에 `difficulty`·`BAL3.enemies` 참조 없음(정적), `run.enemyDefs` 동결, 같은 난이도·입력열 결정성.
- **V3-SIM-DIFF(r3.3, `SD-0~5`)**: 난이도 3 × 스테이지 3 × 정책(aim·center·plan) = **27판**, 결과표를 `t.diagnostic` 으로 출력(보고서가 그 출력을 인용). ⓪ 전부 상한 안 종료 ① normal 종전 그대로(aim 3완주·center S1 만) ② hard: aim S1·S3 완주, **S2 는 정예 등장까지 도달하고 지더라도 정예전에서만 진다(기록)** ③ brutal: aim S1 정예 도달(정예전 결과는 기록), S2·S3 결과만 기록 ④ center 는 hard·brutal S2·S3 실패 유지 ⑤ 같은 봇이면 생존 normal ≥ hard ≥ brutal·손실 반대·peak 은 난이도로 늘지 않는다. **원래 합격선(aim 이 hard 3스테이지·brutal S1 완주)은 출발값 표에서 성립하지 않아**(3-8 봇 실측) ②③ 을 '기록' 으로 낮췄다 — 표를 바꾸지 않고 사실을 적는 쪽을 택했다.
- **V3-SAVE-VERSION DIFF(r3.3)**: `recordKey` 조립 규칙; hard/brutal 기록이 normal 칸을 덮지 않고 재로드·`patch({stages})` 뒤에도 칸 유지; 옛 저장(난이도 없음)은 키 그대로 normal 칸·hard 는 빈 기록; 손상 케이스(`':normal'` 접미는 찬 칸을 덮지 않음·모르는 접미 보존·대소문자 잡키는 1); 최상위 `difficulty` 기본 normal·기억·형식 아니면 normal. **셸 결선(`rush3-loop`)**: 토글 클릭·키 1/2/3 → 저장 `difficulty`; hard 출격 attempts·결과가 `${ver}:hard` 칸에만, normal 칸(도전 9회·최고 99명) 불변·화면에서만 빠짐; HUD·결과 화면에 '어려움' 표기, normal 에는 없음; 판 도중 숫자 키 무시; 다시 도전도 같은 난이도; 새 boot 가 마지막 난이도를 읽는다.
- V3-SAVE-VERSION: 구 저장(`stages[id]` 직접 기록) 로드 → 버전 1 귀속·값 보존·bak 없음; v2 기록이 v1 최고 기록을 덮지 않음(양방향); `buildStage(id).version`이 그대로 기록 버전; `versions`가 객체가 아니거나 버전 키가 이상해도 기본값으로 진행(손상 케이스 기존 유지); **유효한 버전 1 기록과 잡키가 한 칸에 함께 있으면 버전 1 기록이 보존된다**(원문에서 잡키가 앞에 와도 동일, `.bak` 없음, 재로드·`updateStage` 뒤에도 유지). **셸 결선**: `DEFS[1].version`을 2로 둔 채 boot → 출격 attempts·결과 기록이 버전 2 칸에만 쌓이고, 버전 1 기록(도전 9회·최고 99명)은 저장에 그대로 남되 스테이지 선택 화면에는 나오지 않는다. **검사는 코스 버전을 1로 못 박지 않는다** — 기록을 읽을 때 `stageVersion(id)`를 쓴다(그러지 않으면 배치 개정으로 version이 올라가는 순간 관련 없는 단언이 터진다).
- V3-WEAPON: auto 통 파괴 → `weapon='auto'`; 병력 30→1 감소 후에도 유지; rifle 통은 무시.
- V3-WALL: x 240 무조작 진입 → 한쪽 통로로 스냅(벽 안에 남지 않음, lo ≤ hi); n=1·n=60 모두 유닛 dx 통로 안; 벽 끝 뒤 해제; 아군 탄·적탄 모두 벽에서 소멸; 좌측 shooter가 우측 통로 부대를 쏜 탄이 벽에서 소멸; 드래그 +500 누적 뒤 −20 → 그 STEP에 tx 감소(클램프).
- V3-HIT: 대형 빈틈(간격 > 2r+탄 r)을 지나는 적탄은 피해 0; rusher가 어느 위상으로 와도 정확히 1회 접촉; 유닛 hp가 개별로 깎임.
- V3-DEAD: 소각/흡수 탄과 dead 적이 같은 STEP 뒤 처리에서 제외.
- V3-HP: 적·정예 HP가 등장 시 병력과 무관.
- V3-RETRY: 한 판에서 통 파괴·게이트 피격·통과 후 `buildStage` 재호출 → 모든 durability/value/passed/opened 초기값, 이전 run과 참조 공유 없음; `buildStage` 두 번 deep-equal.
- V3-DETERMINISM: STEP 인덱스별 입력열 하나를 30/60/120Hz dt 열에 얹어 `makeLoop`로 돌려 STEP 수·최종 상태 동일; dt 3초 프레임 1개 → 정확히 5 STEP, 이어지는 16.7ms → 1 STEP.
- V3-PURE: `rush3/{combat,gates,supply,squad,weapons,**advice**,stages}.js` 소스에 `Math.random`·`rng` import가 없다(정적 검사 — 소스 정규식 대조는 이 1건뿐). `stages.js` 만 빌드 시점 좌표 확정용 rng 를 쓴다.
- V3-STAGES: 행별 칸 합집합(bypass 아닌 행 80~400 완전 피복), 적 스폰 좌표가 벽 안에 없음, 첫 물체 z ≥ 1100, 정예 z < length.
- **V3-GATE-ARM(r3, `ARM-1~7`)**: 닫힌 셔터(전방 341px)에 탄 10발 → 값 불변·탄 전부 흡수·`gateBlock` 10 / `gateHit` 0; `row.z − run.z <= 340`이 되는 STEP에 `gateArm` **정확히 1회**; `armed` 뒤에는 1발 = +1(상한·`gateFlip` 그대로); `armZ: null` 행은 생성 직후 `armed`이고 `gateArm` 없음; 스테이지별 지정(S1 g1 = null, 나머지 340); **실측 회귀** 소총 1명 5발·기관총 1명 9발(±1); 셔터가 닫힌 동안 셔터보다 **먼** 적은 안 맞고 가까운 적은 정상 피격.
- **V3-SIM-POLICY(r3, `POL-1~9`)**: 8정책(center·center±1·left·right·sway·**aim**(탐욕)·**plan**(계획)) × 3스테이지 = **24판**을 `createRun/stepRun` 으로 돌린다(입력은 `{pointerX}` 만, 한 판 상한 14,400 STEP). ① 24판 전부 상한 안 종료 ② S1 `center` 성공 유지 ③ S2 `center` 실패·`plan`·`aim` 성공 ④ S2 `aim` 은 벽 쌍 중 정확히 1개만 `opened`·나머지 `skipped` ⑤ S3 `plan.peak >= 1.25 × max(left, right)` ⑥ 화력 지수(생존 × 무기 초당 dmg: rifle 2 / auto 4 / heavy 5)에서도 같은 배수 ⑦ **조합 금지**(고정 정책 5종은 연속증원 + 우 칸 상한, 중화기 + z6300 통을 동시에 못 얻는다 — 개수 상한이 아니다) ⑧ `plan.peak > sway.peak` 이고 `plan.peak >= aim.peak`, 구분 축은 **z4000 게이트 칸 선택**(탐욕 봇은 값이 큰 좌 +3, 계획 봇은 상한이 큰 우 −25 → +40) ⑨ **선택 C 저울**(3900 통을 열고도 우 칸 상한을 채운 판은 병력 상한 초과 예외로 기록만).
  > 이 표는 **봇 정책의 결과**다. **자동 시뮬 결과를 사람의 성공률로 옮겨 적지 않는다.** 1판 결정적 시뮬이라 분포도 아니다.
- **V3-SUPPLY-PAIR / COVER(r3)**: `PAIR-1` 쌍 중 하나를 열고 다른 하나를 지나면 `skipped`(파트너를 연 STEP이 아니라 **통 z를 지나는 STEP에만 1회**, 지나간 chain은 `locked`); `PAIR-2` 벽·차폐 없는 쌍은 둘 다 `missed`; `PAIR-3` 짝도 벽도 없으면 종전대로; `PAIR-4` 실제 S3 의 `p1`·`p2` 가 8정책 전부에서 최대 1개 + 합성 쌍(병력 5·10·15·25·40)도 최대 1개이고 **벽을 빼면 둘 다 열린다(대조군)**; `PAIR-4b` **확정 직전 대시 정책**(구간별 목표 x 스크립트를 `T = commitZ − 400 … commitZ` 로 훑고 좌→우·우→좌 양방향)에서도 동시 개봉 0건; `PAIR-4c` 배제 쌍의 `coverZ` 가 비행시간 보정선 공식과 정확히 같다(무기가 추가돼 `vzMin` 이 내려가면 **이 검사가 먼저 실패한다**); `PAIR-5` 우 통로를 고르고 우 통을 못 깨면 좌 `skipped` · 우 `missed`; `COVER-1` 차폐 앞 탄 20발 → 내구 불변·전부 흡수·`supplyBlock` 20; `COVER-2` 개방 뒤 정상 개봉; `COVER-3` `coverZ` 가 null 이면 현행과 동일.
- **V3-STAGES 갱신(r3, `STG-1~9`)**: 세 스테이지 `version === 2`; 모든 게이트 행에 `armZ`(number|null)·`armed` 초기값; **좌우 분산**(통·칸 x 가 양쪽에 존재); **배제 쌍의 형식**(같은 `pairId` 정확히 2개·좌우 1개씩·둘 다 벽 활성 구간 안·`coverZ` 가 **공식 값**(확정선이 아니다)·통 z ≤ `wall.z1 − 4`·`coverZ < s.z`·한쪽 통로에서만 닿는 형상); **표지와 내용 일치**; **회피 통로**(`corridorHw != null` 인 무리는 가장자리 간격 ≥ `2 × corridorHw + 10` 인 틈이 열마다 1개 이상); 스폰마다 `corridorHw` 필드; **인접한 두 벽 사이 이동 여유 ≥ 137px**.
- **V3-GRUNT-STRAIGHT(r3)**: `grunt.track === 0`이고, 부대가 좌우로 크게 움직여도 잡졸 `x` 가 변하지 않는다.
- **V3-HINT(r3, `tests/rush3-advice.test.mjs`)**: `adviceLine(run, stage)` 이 6장 우선순위대로 결정적으로 고르고, **`skipped` 통은 후보에서 제외**되며, 실제 배치의 통·게이트가 `hint` 문구를 갖는다.
- V3-SIM: 봇(가장 가까운 통/양수 칸 차선으로 tx 이동) S1·S2·S3 완주; 무조작 봇(tx 240 고정) S1 완주; 정예 격파 후 1 STEP 안에 won.
- V3-SIM-NOOP: 무조작 봇(tx 240 고정)은 S2·S3 에서 실패(units 0 → over, won 아님, 실패 z < length, peak 는 조준 봇 peak 의 1/4 미만).
- V3-WIN: 정예 격파 즉시 won; 정예 없는 스테이지는 length 도달·적 없음.
- V3-SAVE: 새 저장/`"abc"`/`{v:1,best:3}`/`{v:3,stages:null}`/`{v:3,stages:{1:{attempts:"x"}}}`/setItem 예외 → 전부 진행 가능, ok 플래그.
- V3-INPUT: 순수 입력 상태 모듈로 pointercancel/blur 시 drag=false·dragDx=0.

## 9. 기존 코드 재사용 결선표(분석 결과 반영, 근거 = `newmode/v3/analysis/01~06`)

**대원칙: 기존 `rush/` 파일과 `tests/rush-*.test.mjs`는 한 줄도 수정하지 않는다.** 기존 게임은 `rush.html`에서 그대로 동작해야 한다.

| 기존 | v3 처리 | 이유 |
|---|---|---|
| `rush/rng.js` (mulberry32, hashSeed) | **import 그대로** (buildStage의 좌표 확정·셸 연출 스트림) | 순수 함수 |
| `rush/sprites.js` | **복제 → `rush3/sprites.js`** (v3 키: M01, SOLDIER, SUPPLY, GATE, BG1~3, E1_scrapbit(grunt), E5_wheeler(rusher), E4_signaler(shooter), B1_grader(elite). `loadSprites3(base)`) | 키 목록 상수·30장 전부 로드·SPRITES-KEYS 테스트 개수 고정 |
| `rush/audio.js` | **복제 → `rush3/audio.js`** (v3 SFX 맵 6장 참조. fire 3종 = 기존 fire/fireL/fireM 파일. `bgmPlay(name)` 공개. 발사음 프레임 1회 + 볼륨 상한) | 경로·맵 상수, bgm 5구간 전제 |
| `rush/render.js` | **헬퍼만 복제 → `rush3/render.js`**: drawImgCentered/shadow/roundRect/drawParts/drawFloaters/drawButtons/흔들림·비네트·일시정지 오버레이/적 스프라이트 폴백/적탄 그리기. 게이트·보급·부대·벽·HUD·결과는 신규 | createRenderer 클로저 하나만 export, 폐지 규칙 결합 |
| `rush/main.js` | **골격만 참고**: hitButton/toLogical/spawnBurst/autoPause/오디오 unlock/ESC/음량 버튼/sfxQueue/로드 후 루프 시작/`#game3` 가드. **`rush/main.js` import 금지**(자동 부트가 같은 캔버스에 붙음) | 진행 규칙 전부 다름 |
| `rush/combat.js` | **신규**. 적 행동(가속·조준 예고·부채꼴·보스 왕복/소환)만 옮겨 적음 | count 단일 화력·부대 원 판정 |
| `rush/gates.js`, `squad.js`, `track.js` | **import 금지, 신규**. squad의 링 대형 알고리즘만 옮겨 적음 | 폐지 규칙 |
| `rush/balance.js` | **값만 옮김**(색·부대 크기·연출 상수·적 파라미터). 참조 공유 금지 | mutable export, 폐지 상수 혼재 |
| `rush/save.js` | **복제 → `rush3/save.js`**(7장) | 키 상수·얕은 병합 |
| `rush/upgrades.js`, `daily.js`, `fx-state.js` | 1단계 미사용 | 순수 모드에 성장 유입 금지 |
| `tests/rush-*.test.mjs` | 존치·통과 유지. v3는 `rush3-*`, 소스 정규식 대조는 V3-PURE 1건만(test-quality-ratchet 상한 102 안) | 레거시 잠금 |
| `rush.html` | **복제 → `rush3.html`(루트)**: `<canvas id="game3">`, `<script type="module" src="rush3/main.js">` | 자산 상대경로 |
