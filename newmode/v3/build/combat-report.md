# 스타포지 러시 v3 1단계 — 묶음 [전투 STEP 통합] 구현 보고 (r1, 2026-09-10)

담당 파일: `rush3/combat.js`, `tests/rush3-combat.test.mjs`, `tests/rush3-sim.test.mjs`, `tests/rush3-pure.test.mjs`
계약서 `newmode/v3/DESIGN_v3_stage1.md`(r2) 3-1·3-7·4장 기준. Build-1 산출물(balance/weapons/stages/gates/supply/squad)은 **한 줄도 수정하지 않았고** export 를 그대로 썼다. 기존 `rush/*`·`rush.html`·`tests/rush-*.test.mjs` 도 손대지 않았다. import 는 `rush3/` 안의 순수 모듈뿐(rng·Math.random 없음, grep 0건).

## 만든 것

### rush3/combat.js — `STEP`, `createRun(stage)`, `stepRun(run, input, STEP)`, `drainEvents(run)`
- `createRun`: 계약서 3-1 run 필드 전부 + 진행용 필드(`spawnCursor`, `elite`, `eliteSpawned`, `bossDefeated`, `nextEnemyId`, `length`, `title`). 유닛은 `startUnits` 만큼 `makeUnit(id, 무기 interval)`, `weapon = startWeapon`, `peak = startUnits`.
- `stepRun`: 4장 11단계를 함수 하나씩(steer → z 전진/time → spawnDue → fireUnits → moveBullets → moveEnemies → moveEshots → contacts(+죽은 유닛 제거) → applyRewards → cleanup → verdict) 순서 그대로. `over` 뒤에는 아무것도 하지 않는다. `input` 은 `{ pointerX, dragDx, keyDir }`(없으면 무입력).
- 조향: `tx` 갱신 → 지수 추종(`1 - exp(-9·STEP)`) + 상한 250px/s → `clampCenter(run, walls)` → `compressUnits(units, c.dxLo, c.dxHi)`(squad 보고서 통보대로 dxLo/dxHi 사용).
- 아군 탄(5단계): 후보 = 벽 / `sweepHitsSupply`(미개봉·미missed·미locked 는 supply 가 판정) / `sweepHitsGate`(미통과 행) / `!dead` 적·보스(수직 스윕 vs 원, 반지름 = r + 탄폭/2). **접촉 z = max(물체 앞면 z, 스윕 시작 pz)** 가 가장 작은 1개만 처리, 동일 z 는 벽 > 통 > 게이트 > 적. 통 개봉·적 사망은 즉시 플래그(다음 탄 후보에서 제외). 보상은 `hitSupply(s, b, ev, run)` 이 `pendingRewards` 에 쌓는다.
- heavy: **적·보스 직격 시에만** 반경 28 폭발(`blast`), 폭발 dmg 2, 직격 적 제외, 벽 반대편(폭발 중심과 적 사이에 벽 x 범위·z 구간이 끼면) 제외. 통·게이트·벽 명중은 폭발 없음.
- 적 4종(6단계): grunt `run.x` 추종 90px/s, rusher 가속 260/s²·최대 420, shooter 도로 고정·1.6s 주기 예고(`aim` 이벤트) 0.5s 뒤 **발사 시점의 (run.x, run.z)** 조준 1발(vz 260·dmg 1·r 5), 부대 줄을 지나면 사격 정지. 정예 `run.boss`: 스폰 `run.z + 760`·x 240, `descend` 150/s → `run.z + 420` 에서 `hold` 좌우 60px/s 왕복(80+r~400−r), 1.0s 마다 부채꼴 3발(±18°, vz 230), S3 는 4s 마다 grunt 2 소환(x±40, z−40). 적탄은 `{x, z, px, pz, vx, vz, dmg, r, dead}`(`z -= vz·STEP; x += vx·STEP`).
- 적탄(7단계): 이동 → 선분-사각형(Liang–Barsky)로 벽 소멸 → `hitUnit(units, x, z, r, {x:px, z:pz}, run)` 가장 가까운 1명 hp −dmg.
- 접촉(8단계): grunt/rusher 스윕 `overlappingUnits(...)` → `frontmostUnit` 1명, 적 `touched = dead = true`(kills 제외), STEP당 1회. 정예는 원 겹침 + 0.5s 타이머로 앞줄 1명 hp −3. 이후 hp ≤ 0 유닛 제거(`unitLost`) → 재배치.
- 9단계: `pendingRewards` 순서대로 `applySupplyReward`(soldier→addUnits, weapon→rank 비교, chain→activateChain) → `passGateRow` → `passSupply` → `takePads` → **대형 재배치(clampCenter + compressUnits)**.
- 10단계: dead 적 중 `!touched` → `kills++`·`kill`, 보스 사망 → `kills++`·`bossDefeated`·`bossKill`·`boss = null`·**남은 적·적탄 소거**, 탄 `z > run.z + 780`·적/적탄 `z < run.z − 200` 정리, `peak`.
- 11단계: 승리 우선. 정예 스테이지 = `bossDefeated && 적 없음`, 아니면 `z >= length && 적 없음` → `won, over, wonAt`. 유닛 0 → `over`(`lose`).
- 이벤트(전부 x/z 동봉): `fire{count, weapon}`, `spawn`, `elite`, `aim`, `eshot{n}`, `wallHit`, `enemyHit{id, hp, blast?}`, `blast{r}`, `kill`, `bossKill`, `summon`, `touch`, `hurt{n, cause:'shot'|'touch'|'boss', unitId}`, `unitLost`, `win`, `lose` + gates/supply 가 내는 `gateHit/gateFlip/gatePass/supplyHit/supplyOpen/supplyMissed/padAdd/padTake/chainOn/joinMany/weaponSwap/weaponSame`.

### tests/rush3-combat.test.mjs (24건, 실제 stepRun)
V3-GATE-SCROLL 1 · V3-ORDER 4 · V3-FIRE 2 · V3-WEAPON 3 · V3-WALL 4(무조작 진입 스냅 S2 n=2/60 + 벽만 있는 스테이지 n=1/60, 아군탄·적탄 벽 소멸, 좌 shooter→우 통로 탄 소멸, 드래그 +500 뒤 −20) · V3-HIT 3 · V3-DEAD 1 · V3-HP 1 · V3-RETRY 1 · V3-WIN 2 · V3-CHAIN 1 · V3-HEAVY 1(계약서 8장에 없는 추가 — heavy 폭발 규칙).

### tests/rush3-sim.test.mjs (5건)
봇(가장 가까운 미개봉 통/미회수 발판/미통과 게이트의 최대값 칸 — 음수·bypass 면 빈 길 — 차선으로 pointerX) S1·S2·S3 완주 + 정예 격파와 같은 STEP 에 won, 무조작 봇(240 고정) S1 완주, 같은 입력열 두 판 최종 상태 동일(결정성).
실측(봇): S1 40.8s 병력 22·S2 43.9s 병력 50·S3 57.0s 병력 71, 세 판 모두 **유닛 손실 0**. 무조작 S1 38.2s 병력 16(통 2개 놓침, 나쁜 게이트 0). **stages.js 수치는 조정하지 않았다**(완주에 문제 없음).

### tests/rush3-pure.test.mjs (1건)
`combat/gates/supply/squad/weapons.js` 소스에 `Math.random`·`rng.js` import·`rng` 식별자 없음, `stages.js` 는 rng import 있음(허용). 소스 정적 대조는 이 1건뿐(ratchet 의 `assert.match(src…)` 패턴은 쓰지 않음).

## 계약서·지시와 다르게 했거나 해석한 것 (조율자 확인 요망)

1. **`run.addUnits/removeUnits` 콜백 주입 없음.** 지시문에는 있으나 gates/supply 보고서 r1 에서 콜백 규약이 폐기되고 squad.js 직접 호출로 바뀌었으므로 콜백을 넣지 않았다(넣어도 아무도 부르지 않는다).
2. **게이트 행·통은 `makeGateRow`/`makeSupply` 로 다시 만든다**(지시 "복사 불필요"와 다름). buildStage 의 통에는 supply.js 가 요구하는 `activated/queuedPads/padStart/padGap` 이 없어 chain 발판 z 가 NaN 이 되고, 칸에는 `rowId/idx` 가 없어 `gateHit` 이벤트 id 가 빈다. 벽·스폰·정예 정의는 stage 것을 그대로 보유. 값은 동일하므로 V3-RETRY 는 그대로 성립한다.
3. **정예 격파 = 즉시 승리(5장)** 를 위해 `bossKill` 시 남은 적·적탄을 소거한다. 11단계 조건 `bossDefeated && 적 없음` 은 그대로 두었으므로 두 문구가 동시에 만족된다(S3 소환 잡졸이 남아도 승리가 늦어지지 않음). 소거된 적은 kills 에 세지 않는다.
4. **9단계 끝 재배치를 `layoutUnits` 대신 `clampCenter + compressUnits`** 로 했다. squad.addUnits/removeUnits/passGateRow 가 내부에서 `layoutUnits` 를 불러 압축을 풀어 버리므로, 통로 안에서 병력이 바뀐 STEP 에 화면으로 나가는 상태가 벽 안에 걸쳤다(테스트로 실증: 유닛 x 221 > 228−9). compressUnits 는 formation 기준이라 layoutUnits 를 포함한다. 부수 효과: 벽 진입 STEP(prevZ < z0−60 ≤ z)의 스냅이 **그 STEP 안**에서 일어난다(1단계만으로는 다음 STEP 이었음).
5. **탄의 접촉 z** 는 물체 중심이 아니라 **앞면 z(max(앞면, pz))** 로 비교했다("가장 가까운 것" 의 물리적 의미). 우선순위(벽>통>게이트>적)는 동일 접촉 z 에서만 작동한다.
6. **heavy 폭발 범위** = 폭발 원(r 28)과 적 원이 겹치면(중심 거리 ≤ 28 + 적 r). 중심 거리 ≤ 28 로 읽을 수도 있으나 그러면 2열 잡졸(간격 40)에 폭발이 거의 안 닿는다. 폭발 중심 = 직격 적의 중심. 보스도 폭발 대상.
7. **shooter 주기**: `shootT` 는 예고 중에도 흐른다 → 1.6s 주기(예고 0.5s 포함). 기존 rush/combat.js 는 발사 후 재장전이라 2.1s 였다. 발사 시점 조준(계약서 문구)·부대 줄 지난 뒤 사격 정지는 자체 결정.
8. **정예 사격 시작점** = 정예 중심(z, x). 하강 중에도 쏜다(계약서 미규정, 기존 코드 동일).
9. **`lossByShot`/`lossByTouch`** = 원인별 **유닛 손실 수**(hp 가 0 이 된 유닛). hp 1 깎임은 `hurt{n}` 이벤트로만. 정예 접촉 손실은 lossByTouch 에 넣었다(`cause:'boss'`).
10. **적탄 `px`**, 적 `px`(스윕 x 시작), 보스 `px/pz/summon` 필드를 계약서 형태에 덧붙였다(벽 판정·스윕용).
11. **탄 정리선(run.z + 780)** 때문에 부대에서 780px 보다 먼 물체는 맞힐 수 없다(계약서 1장 그대로). V3-GATE-SCROLL 을 처음에 계약서 5장 z 1140 으로 짰더니 탄이 규칙대로 정리돼 실패 → 게이트를 700 으로 두고 검증. 실제 게임에서도 게이트 사격은 물체가 화면에 들어온 뒤(760) 부터 유효하다는 뜻이라 설계 의도와 일치한다.
12. **합류 유닛의 fireT 위상**은 squad.addUnits 기본 interval 0.5(rifle) 기준(gates/supply 보고서 지적 그대로). 결정성엔 영향 없음.

## 하지 못한 것 · 의심스러운 것

- **밸런스 관찰(수정 안 함)**: 봇 3판·무조작 S1 전부 손실 0 으로 완주. 시작 1명 소총이 첫 게이트(+1)에 도달 전 약 12발을 넣어 +13 이 되는 등 게이트 값이 쉽게 maxValue 에 닿고, S2 첫 게이트(−8/−3)도 무조작 240 고정으로 −3 → +20 이 된다. "비켜야 하는" 긴장이 약할 수 있다 — 계약서 5장 표는 그대로 두었으니 기획 쪽 판단 필요.
- V3-DETERMINISM(makeLoop·dt 열)은 main.js 담당이라 만들지 않았다. 대신 V3-SIM 에 같은 입력열 두 판 deepEqual 을 넣었다.
- 접촉 판정에서 `overlappingUnits` 는 hp ≤ 0 유닛을 이미 빼므로, 같은 STEP 에 적탄으로 hp 0 이 된 유닛은 접촉 대상에서도 빠진다(제거는 8단계 뒤).
- 여러 벽이 겹치는 스테이지는 없어서 `wallBetween` 의 다중 벽 조합은 미검증.
- 계약서 r3 반영 권고: (a) 3-1 run 에 `spawnCursor/eliteSpawned/bossDefeated/px` 류 진행 필드, (b) 4장 9단계 "layoutUnits" → "clampCenter+compressUnits", (c) 10단계 보스 사망 시 잔여 적 소거, (d) heavy 폭발 겹침 규칙·shooter 1.6s 주기 정의.

## 테스트 실행 결과(실제 실행 출력)
- `node --test tests/rush3-combat.test.mjs tests/rush3-sim.test.mjs tests/rush3-pure.test.mjs` → tests 30 / pass 30 / fail 0
- `node --test tests/rush3-*.test.mjs` → tests 105 / pass 105 / fail 0 (기존 75 + 신규 30)
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `node --test tests/test-quality-ratchet.test.mjs` → tests 2 / pass 2 / fail 0
- `grep -nE "Math\.random|rng" rush3/combat.js` → 주석 1줄("rng import 금지")만, 코드 없음

---

# 수정 라운드 1 (2026-09-10) — 검토 지적 반영

## 지적 1 [major] V3-HEAVY '벽 반대편 잡졸은 폭발 제외' 가 형식적 검사였음 → 수정 완료

**인정.** 기존 배치(xs [200, 216, 264], 직격 x 200)에서 id 3(x 264)까지 거리 64 는 `blast()` 의 사거리 검사(`d > 28 + 14 = 42`)에서 먼저 걸러지므로 `wallBetween` 분기가 실행되지 않았다. 검토자 실측대로 walls=[] 로 돌려도 결과가 같았다. 보고서 '하지 못한 것'에도 이 공백을 적지 않았던 것은 내 누락이다.

### 바꾼 것 — `tests/rush3-combat.test.mjs` 만 수정(combat.js 는 변경 없음)
- V3-HEAVY 1건 → **2건**으로 분리하고 실험대 `heavyBlastRun(walls, ez)` 를 추가. 잡졸 3기(x **196 · 220 · 262**, 같은 z)에 x 220 heavy 직격탄 1발. 벽 x 228~252, z 1800~3000.
  - 220↔262 거리 **42 = 폭발 반경 28 + 잡졸 r 14(사거리 경계 안, `d > 42` 가 false)** 이므로 id 3 의 제외 여부는 **오직 벽 판정**에 달린다. 196 은 같은 편(거리 24)이라 폭발 2 를 받는 대조군.
  - 스폰(3단계)과 탄 이동(5단계)이 같은 STEP 이라 폭발 시점 좌표 = 스폰 좌표 그대로(grunt 추종 드리프트 없음). heavy 탄폭 8 → 직격 반경 18 이라 x 196·262 는 직격 후보가 아님(dx 24·42).
- **V3-HEAVY(1)**: 통 명중 폭발 없음 + 벽 없는 실험대에서 `enemyHit` 이 `[[2,-1,직격],[1,0,폭발],[3,0,폭발]]`·kills 3·잔존 0.
- **V3-HEAVY(2)** 세 경우를 한 테스트에 순서대로:
  - (a) 벽 있음·z 2400(벽 구간 안): `enemyHit` 에 id 3 없음, `enemies = [[3, 2]]`(hp 그대로), kills 2
  - (b) 같은 배치 벽 없음: id 3 도 폭발로 hp 0, 잔존 0
  - (c) 벽 있음·z **1700**(벽 z0 1800 밖): 벽이 있어도 id 3 죽음, kills 3 → `wallBetween` 의 z 조건까지 잠금

### 변이 검증(형식적 검사가 아님을 실증)
- `wallBetween` 을 `return false` 로 바꾸면 → `tests 25 / pass 24 / fail 1`(V3-HEAVY(2) 실패, (a) 단언에서). 
- z 구간 `continue` 줄을 주석 처리하면 → `tests 25 / pass 24 / fail 1`(실패 메시지 "벽 z 구간 밖에서는 wallBetween 미적용", (c) 단언에서).
- 두 번 모두 백업본으로 복원 후 `cmp` 로 바이트 동일 확인. combat.js 의 실제 변경은 0.

## 테스트 실행 결과(실제 실행 출력)
- `node --test tests/rush3-combat.test.mjs` → tests 25 / pass 25 / fail 0 (24 → 25, V3-HEAVY 1건 → 2건)
- `node --test tests/rush3-*.test.mjs` → tests 106 / pass 106 / fail 0
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `node --test tests/test-quality-ratchet.test.mjs` → tests 2 / pass 2 / fail 0

## 남은 의심(변경 없음)
- 벽 사이 판정은 여전히 "폭발 중심과 적 중심의 x 가 벽 x 범위의 양쪽에 있고, 둘 중 어느 z 라도 벽 z 구간과 겹침" 의 근사(선분-사각형 교차가 아님). 벽 끝 모서리 근처에서 대각선으로 벽을 스치는 경우는 실제 교차와 다를 수 있으나 게임 배치(벽 길이 1200, 폭발 반경 28)에선 체감 차이 없음. 계약서 r3 에 규칙 문구로 확정해 주면 그대로 잠그겠다.
