# 스타포지 러시 v3 1단계 — 묶음 [게이트·보급] 구현 보고 (r1, 2026-09-10)

계약서 `newmode/v3/DESIGN_v3_stage1.md`(r2) 3-2·3-3 기준. 기존 `rush/*`·`rush.html`·`tests/rush-*.test.mjs`는 손대지 않았다.

## 만든 파일
- `rush3/gates.js` — makeGateRow / cellAt / gateColor / gateLabel / sweepHitsGate / hitGateCell / passGateRow (+ 상수 GATE_H 24, GATE_MAX_VALUE 15, GATE_FLASH 0.12, GATE_COLORS)
- `rush3/supply.js` — makeSupply / supplyActive / supplyReward / sweepHitsSupply / activateChain / hitSupply / passSupply / takePads / applySupplyReward (+ 상수 SUPPLY_R 30, PAD_START 60, PAD_GAP 40, PAD_REACH 70)
- `tests/rush3-gates.test.mjs` — V3-GATE 14건 + V3-GATE-SCROLL 1건
- `tests/rush3-supply.test.mjs` — V3-SUPPLY 10건 + V3-CHAIN 7건

## 테스트 결과(실제 실행 출력)
- `node --test tests/rush3-gates.test.mjs tests/rush3-supply.test.mjs` → tests 32 / pass 32 / fail 0
- `node --test tests/rush3-*.test.mjs`(다른 묶음 파일 포함) → tests 61 / pass 61 / fail 0
- 기존 `rush-core / rush-sim / rush-meta` → tests 32 / pass 32 / fail 0
- `test-quality-ratchet` → pass 2 / fail 0 (소스 정규식 대조는 내 테스트에 없음)
- 순수성: 두 모듈에 `Math.random`·`rng`·balance import 없음(grep 0건).

## 계약서와 같게 한 것
- 게이트: [x0,x1) 반열림, h 24, gateHit 기본 1·maxValue 클램프, 탄 흡수, 음수→0 이상은 `gateFlip` 그 외 `gateHit {id, value}`, flashT 0.12, `prevZ < row.z <= z`에 중심 칸 1개만 적용, 없으면 우회, 행 단위 passed(passed 행은 sweepHitsGate가 false → 후보 제외), 음수는 `removeUnits(n,'back')` + lossByGate + badGatesPassed, 색 3종.
- 보급: r 30, `(opened && !chain) || missed || locked` 무시(sweepHitsSupply도 false), durability -= dmg, 0 이하가 되는 첫 탄에서 opened + 보상 1회 + `supplyOpen`, 그 외 `supplyHit {id, durability}`, chain 개봉 후 유효탄 1발 = 발판 +1(maxPads까지, `padAdd`), 통과 시 미개봉 missed/missedSupplies/`supplyMissed`, chain은 통과 시 locked, takePads는 `|run.x - pad.x| <= 70`·발판당 1회·`padTake`, 발판 좌표 `s.z + 60 + i*40`, x = s.x, `chainOn`.

## 계약서와 다르게 했거나 덧붙인 것(조율자 확인 요망)
1. **hitSupply 의 보상 push 경로**: 계약서 시그니처 `hitSupply(s, bullet, events)`에는 run이 없어 `pendingRewards.push`를 할 수 없다. 그래서 **선택 4번째 인자 `run`** 을 받아 있으면 `run.pendingRewards`에 push하고, 없으면 `supplyOpen` 이벤트의 `reward` 필드로만 알린다. combat 담당은 **둘 중 한 가지만** 써야 한다(run을 넘기고 이벤트 reward도 push하면 2회가 된다). 권장 = `hitSupply(s, b, run.events, run)`.
2. pendingRewards 항목에 계약서 `{kind, payload, x, z}` 외에 **`id`** 를 덧붙였다(chain 활성화 때 어느 통에 발판을 만들지 찾기 위해). 필드가 늘어난 것뿐 계약 필드는 그대로.
3. 9단계 보상 적용 헬퍼 **`applySupplyReward(reward, run, events, { weaponRank, supplies })`** 와 **`activateChain(s, events)`** 를 추가로 export했다(계약서엔 없음). weapons.js를 import하지 않으려고 rank 비교 함수는 옵션으로 받는다. combat이 직접 구현해도 무방하며, 그 경우 안 써도 된다.
4. 유닛 증감은 `run.addUnits(n)` / `run.removeUnits(n,'back')` 콜백만 호출한다. 콜백 반환값이 숫자면 그것을 실제 적용 수로 쓰고(unitCap 클램프 반영), 아니면 요청 수(제거는 units.length로 클램프)로 본다. 콜백이 없으면 units 배열을 건드리지 않고 applied 0 으로 이벤트만 낸다.
5. `gatePass` 이벤트에 `idx`(칸 번호, 우회면 -1)·`x`·`z`, `gateHit`에 `idx`·`x` 를 덧붙였다(연출용). `gateLabel(value)` 는 부호 표기(`+3 / −6 / 0`, U+2212) 헬퍼로 추가.
6. 통 판정을 **수직 선분 vs 원**(정확 계산)으로 했다. 계약서는 "r: 30"만 말하고 형상을 명시하지 않아 원으로 해석. 사각형이 의도였다면 `sweepHitsSupply` 한 곳만 바꾸면 된다.
7. makeGateRow 는 `def.maxValue`(행 단위) 또는 `cell.maxValue` 를 받고 둘 다 없으면 15. makeSupply 는 `def.r / padStart / padGap / maxDurability` 를 선택으로 받는다(기본값 = 계약서 값). `cell.value`는 `Math.trunc`로 정수 강제.
8. passSupply: 이미 열린 non-chain 통을 지나면 false(무효). 열린 chain을 지나면 missed 없이 locked만 true. locked 뒤에도 **이미 생성된 발판은 takePads로 계속 가져갈 수 있다**(계약서 "더 이상 발판이 늘지 않는다"만 규정 — 발판 회수는 유지가 맞다고 봄).

## 못 한 것·의심스러운 것
- V3-GATE-SCROLL 은 combat 없이 sweepHitsGate/sweepHitsSupply + "가장 가까운 z 1개" 규칙을 테스트 안에서 흉내 내어 검증했다(스크롤 190·탄 700·위상 20분할 전부 명중, 뒤 통 내구 4 불변). combat 완성 후 실제 stepRun 으로 한 번 더 도는 것이 안전하다.
- hitGateCell 은 `bullet.gateHit` 가 0 이하면 값을 올리지 않지만 탄은 흡수한다(계약서에 없는 경계, 실제로는 모든 무기 1이라 발생하지 않음).
- heavy 폭발 "통·게이트에는 직격만" 은 combat 쪽 책임(여기서는 dmg만 받는다).

---

# 수정 라운드 1 (2026-09-10) — 검토 지적 3건 반영

## 고친 것
1. **[blocker] chain 개봉→활성화 사이 후속탄이 발판을 미리 만들어 activateChain 이 막히던 문제** (`rush3/supply.js`)
   - `makeSupply` 에 `activated: false`, `queuedPads: 0` 추가. `activateChain` 가드를 `pads.length > 0` 에서 **`s.activated` 플래그**로 교체.
   - `hitSupply`: `opened && !activated` 상태의 유효탄은 발판을 만들지 않고 `queuedPads++`(단 `pads0 + queuedPads < maxPads` 일 때만 셈, 탄은 그래도 흡수). `activated` 뒤에는 종전처럼 즉시 `addPad`(padAdd).
   - `activateChain`: `min(pads0, maxPads)` 개 생성 + `chainOn` 1회, 이어서 queued 분만큼 `addPad`(padAdd 는 queued 분만 발행, maxPads 클램프) 후 `queuedPads = 0`.
   - 테스트 추가: 한 STEP 12발(sweepHitsSupply→hitSupply 12발 전부 소모) → 활성화 전 pads 0·queued 2 → 활성화 뒤 **pads 7·chainOn 1·padAdd 2**, 재활성화 false. 30발 → **pads 15·chainOn 1·padAdd 10**, 탄 30발 전부 dead, 활성화 뒤 추가탄도 15 유지.
2. **[major] 보상 전달 경로 2개 → 1개로 고정** (`rush3/supply.js`)
   - `hitSupply(s, bullet, events, run)`: `run.pendingRewards` 배열이 없으면 **`TypeError` throw**(상태 변경 전에 검사). 보상은 `run.pendingRewards.push` 로만.
   - `supplyOpen` 이벤트에서 `reward` 필드 **삭제**(연출용 `id, kind, x, z` 만).
   - 'run 없이 호출' 테스트를 throw 검사로 교체(`run` 누락·`pendingRewards` 누락 둘 다 throw, 상태·이벤트 불변). V3-GATE-SCROLL 의 run 에 `pendingRewards: []` 추가.
   - **계약서 개정 요청(r3)**: 3-3 시그니처 `hitSupply(s, bullet, events)` → `hitSupply(s, bullet, events, run)`. 2장 export 표도 같이.
3. **[major] 콜백(run.addUnits/removeUnits) 의존 → squad.js 직접 호출** (`rush3/gates.js`, `rush3/supply.js`)
   - 두 모듈 모두 `import { addUnits, removeUnits, layoutUnits } from './squad.js'`(supply 는 addUnits 만). 콜백 분기(addVia/removeVia, `typeof run.addUnits === 'function'`) 전부 삭제.
   - `passGateRow`: 양수 = `addUnits(run, value)`(unitCap 150 클램프·layoutUnits 포함, 반환값 = applied), 음수 = `removeUnits(run.units, |value|, 'back')` 뒤 `layoutUnits(run.units)`.
   - `applySupplyReward` soldier: `addUnits(run, n)`, `joinMany.n` = 실제 추가 수.
   - `takePads`: 발판은 소모(`taken = true`)하되 `padTake` 이벤트에 **`applied`**(실제 추가 수, cap 이면 0)를 싣는다. 발판은 `prevZ < pad.z <= z` 가 한 번뿐이라 미소모로 두어도 재판정이 없어, "소모 + applied" 쪽을 택했다.
   - 테스트: 두 테스트 파일의 `makeRun` 이 mock 콜백 대신 **squad.js `makeUnit` + `layoutUnits`** 로 실제 유닛을 만든다. 추가로 계약서 문자 그대로의 run `{ units:[makeUnit(1)], nextUnitId:2, … }` 로 **+1 / −6(2명뿐이면 2명) / 병사 통 +2** 결합 검사, unitCap 150 클램프(게이트 +9 → applied 2, 병사 통 +5 → n 1, 발판 → applied 0·taken), 제거 후 `formation(3)` 재배치·추가 후 `formation(2)`/`formation(6)` 재배치 검사. "뒤쪽부터 제거" 검사는 id 순 가정을 버리고 **dy 큰 순 2명**이 빠졌는지로 바꿨다(링 대형에서는 id 순 = dy 순이 아님).

## 테스트 결과(실제 실행 출력)
- `node --test tests/rush3-gates.test.mjs tests/rush3-supply.test.mjs` → tests 39 / pass 39 / fail 0 (V3-GATE 17 + V3-GATE-SCROLL 1 + V3-SUPPLY 12 + V3-CHAIN 9)
- `node --test tests/rush3-*.test.mjs` → tests 75 / pass 75 / fail 0
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `node --test tests/test-quality-ratchet.test.mjs` → pass 2 / fail 0

## 남은 의심·조율자 확인 요망
- `addUnits(run, n)` 을 기본 interval 0.5(rifle)·cap 150 으로 부른다. 유닛 `fireT` 위상은 `makeUnit(id, interval)` 이 무기 발사 간격을 받는 구조인데 run 에는 interval 이 없어 **auto/heavy 상태에서 합류한 유닛의 초기 fireT 위상이 rifle 기준**이 된다(결정성에는 영향 없음, 위상 분산만 살짝 다름). combat 이 무기별 위상을 원하면 gates/supply 가 `run.fireInterval` 같은 필드를 읽도록 한 줄 추가하면 된다 — 계약서에 없는 필드라 지금은 넣지 않았다.
- 계약서 r3 반영 필요 항목: (a) `hitSupply` 4번째 인자 run 필수, (b) `supplyOpen` 이벤트에 reward 없음, (c) supply 상태 필드 `activated`·`queuedPads` 추가, (d) `padTake` 이벤트 `applied` 필드, (e) gates.js·supply.js 가 squad.js 를 import(순수 모듈끼리라 0장 위반 아님).
- 이전 보고서 항목 1(둘 중 한 경로만 쓰라는 경고)과 항목 4(콜백 규약)는 이 라운드로 **폐기**. combat 은 `hitSupply(s, b, run.events, run)` 한 가지로 호출하면 된다.
