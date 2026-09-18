# 스타포지 러시 v3 — 1단계(기준 전투 3개) 설계 계약서 (r3)

작성 2026-09-09, r2 = 3렌즈 설계 검토(규칙/결정성/기획충실도) 반영판.
**r3(2026-09-11) = 외부 검수(F2·F3·Q1·Q2·Q4·후속개선) 반영 배치·규칙 개정.** 근거 문서 = `newmode/v3/DESIGN_r3_draft.md`(승인된 개정안 r3.2), 검수 = `newmode/v3/review/01_GPT_1단계_검수결과.md`.
r3 에서 새로 들어온 규칙: **게이트 사격 활성 구간(셔터 `armZ`)** · **보급 통 차폐(`coverZ`, 비행시간 보정선)와 배제 쌍(`pairId`)** · **구조적 획득 불가 집계(`skipped`)** · **잡졸 직진(`track 0`)** · **통로 안내 표지(`wall.signs`)·회피 통로 규격(`spawns[].corridorHw`)** · **결과 제안 한 줄(`rush3/advice.js`)** · 세 스테이지 **코스 버전 2**. 기준 문서: `newmode/v3/spec/01_스타포지러시_재기획_v3.md`, `03_구현담당자_전달서.md`. 기존 코드 분석: `newmode/v3/analysis/01~06`.
**r3.3(2026-09-16) = 난이도 선택(보통/어려움/극한) 추가** — §3-8(배수 표·근거·검수 금지 조항과의 관계), §6(타이틀 토글·HUD·결과 표기), §7(기록 칸 키 `버전:난이도`), §8(V3-DIFF·V3-SIM-DIFF·V3-SAVE-VERSION DIFF). 코스 배치·규칙 STEP 은 손대지 않았다(normal = r3 그대로).
**r3.4(2026-09-17, 이사 지시) = S3 빈 길 → 랜덤 길(로또)** — §3-9 신설(풀·시드·결정성 예외), §5 S3 표 선택 D, §6(‘?’ 표지·가림 상자·결과 한 줄), §8 `V3-LOTTERY`. 근거 = 이사 지시(2026-09-16) **"3스테이지에 빈 길은 무의미하다. 당연히 그 길로 안 간다. 빈 길이 아니라 랜덤 길을 만들어서 진입 시마다 로또처럼 좋거나 꽝인 선택이 랜덤으로 나오게 해 주자."** 보고서 = `newmode/v3/build4/lottery-report.md`. **수정 라운드 1(2026-09-17)**: S3 좌 통 `hint` 를 랜덤 길 기준으로 고치고(빈 길 시절 문구 잔류), 셸 시드 조립 결선 검사 `V3-SHELL-LOTTERY` 와 문구 회귀 검사 `LOT-10`·`LOT-10b` 를 추가했다. **수정 라운드 2(2026-09-17)**: 풀 ⑤ 를 `rusher4`(돌격체 4 — 이 지점 병력 68~69 에 접촉 전 전멸해 세 난이도 모두 손실 0 이었다 = 꽝이 아니었다)에서 **`trapGate`(−10 확정 손실 게이트)** 로 바꾸고, `coverZFor` 비행시간 보정선에 **1 STEP 지연 + 대형 깊이** 두 항을 더했다(§3-3 — 네 지점 `coverZ` 갱신, 랜덤 길 게이트의 셔터도 같은 선으로). 배치가 바뀐 곳은 여전히 **S3 분리벽 `w3` 우측 통로 하나**다. 다만 `coverZ` 는 규칙 공식이라 **배제 쌍 네 지점이 함께 갱신**됐다(S2 w1 1904→1953 · S3 p1 2475→2524 · p2 3210→3259 · S3 c9/랜덤 길 6046→6094). 통·게이트·무기·병사 hp·난이도 표는 그대로다.
**r3.5(2026-09-17, 2차 검수 Q3 반영) = 성공 경로 봇 `planBoss` 와 검사 `SD-7~9`** — §3-8 '봇 실측' 에 성공 경로 표를 덧붙이고, §8 `V3-SIM-DIFF` 검증 항목에 SD-7(잠금: hard S1·S2·S3 + brutal S1 완주)·SD-8(기록: brutal S2·S3)·SD-9(보스 등장 전 plan 과 동일)을 추가했다. **규칙·배치·배수 표·기본 난이도는 한 줄도 바뀌지 않았다** — 바뀐 것은 `tests/lib/rush3-policies.mjs` 의 봇 정책 하나와 검사뿐이다. 근거 = `newmode/v3/review2/01_GPT_2차_검수결과.md` §4 Q3, 보고서 = `newmode/v3/build5/bot-report.md`.
**r3.6(2026-09-17, 2차 검수 N1·N2·N4 반영) = 안내·셔터 표현·결과 문구** — §3-2(닫힌 셔터도 숫자를 가리지 않는다·잠김 아이콘)·§3-9(결과 한 줄 = 추첨 이름이 아니라 **실제 적용 결과**)·§6(짧은 안내 글·첫 조우 배너·개시선 옆 글·`gateClang`/`lotWarn` 효과음)·§7(저장 `seenShutter`)·§8(`V3-RENDER-SHUTTER`·`V3-SHELL-SHUTTER`·`V3-SHELL-LOTTERY-OUT`·`LOT-11`·`V3-HINT-N1`). **규칙 STEP·배치 좌표·난이도 배수·랜덤 풀은 한 줄도 바뀌지 않았다** — 바뀐 것은 표현(render)·셸(main)·문구(stages.hint·advice)·저장 한 칸이다. 근거 = `newmode/v3/review2/01_GPT_2차_검수결과.md` N1·N2·N4, 보고서 = `newmode/v3/build5/ux-report.md`. **수정 라운드 1(2026-09-17)**: 열림 문구를 **행 종류에 따라** 고르게 했다 — 쏴도 값이 오르지 않는 **확정 손실 행**(랜덤 길 ⑤ `trapGate` · 상한 = 자기 값)에는 '지금 쏘면 +1' 대신 **'쏴도 그대로예요'**(`main.GATE_TIP_OPEN_FIXED`)를 띄운다. 옛 서술은 무조건 '지금 쏘면 +1' 이라, 같은 화면의 '확정' 꼬리표와 서로를 부정했다(§6 · §3-2 · §8). 판정은 셸 `main.isFixedGateRow(row)` 하나에 모았고 **규칙·배치·풀은 그대로**다.
**r3.3 후속(2026-09-16, 이사 결정) = 타이틀 초기 선택을 `brutal`(극한)로** — "극한으로 모든 스테이지 격파 → 극한을 기본으로". **규칙 계층 기본은 `normal` 그대로**이고 바뀐 것은 셸이 처음 보여 주는 칸뿐이다. §3-8 '두 가지 기본값', §6 토글, §7 저장 참조.
**r3.7(2026-09-17, 이사 결정 3건) = 함정 외형·재도전 부연·기본 난이도 재확인** — §3-8(결정 ② 극한 유지 / 검수자 권고 병기)·§3-9(결정 ① 재추첨 유지 + 버튼 부연, 결정 ③ 함정 외형)·§6(함정 외형·`trapHit`·[다시 도전] 부연)·§8(`V3-RENDER-TRAP`·`V3-SHELL-TRAP`·`LOT-6c`). **규칙(값·`maxValue`·`armZ`·시드 정책)은 한 줄도 바뀌지 않았다** — 바뀐 것은 표현·문구·문서다. **수정 라운드 1(2026-09-17)**: 함정 전용 피드백(붉은 스파크 + `trapHit`)이 **'?' 상자가 걷히기 전에도 나서** 통로 확정 약 300px(≈1.6초) 전에 '이번 판은 함정'임이 소리·색으로 샜다(§3-9 '확정 전에 내용이 새지 않는다' 위반). 공개 전에는 꽝 게이트와 똑같은 `gateClang` + 회색 스파크로 되돌리고(`main.trapShown`), 검사 `V3-SHELL-TRAP` 를 **공개 전/후 두 창으로 나눠** 다시 잠갔다 — 옛 검사는 공개 전 이벤트만으로도 통과해 이 누출을 덮고 있었다. **수정 라운드 2(2026-09-17)**: 계약서 §8 은 `V3-AUDIO` 가 `trapHit` 을 지킨다고 적어 두었는데 **검사의 이름 목록에 `trapHit` 이 빠져 있었다** — `rush3/audio.js` 의 `trapHit` 한 줄을 지워도 241건이 전부 통과했다(실측). 파일 존재 검사는 `SFX_NAMES3` 를 순회하므로 이름이 사라지면 함께 사라지고, 셸 검사의 가짜 오디오는 모르는 이름에도 `true` 를 돌려주기 때문이다. 이름 목록에 `trapHit` 을 넣어 서술과 검사를 일치시켰다(§8 `V3-AUDIO`).
이 문서는 구현 담당(사람·에이전트)이 공유하는 **모듈 경계와 규칙의 단일 진실**이다. 수치는 시제품 출발값이며 `rush3/balance.js`·`rush3/stages.js`가 최종 값을 가진다.

**r3.8(2026-09-18, 이사 소견 2건) = 난이도 표시 이름 '극한' → '지옥' · HUD 상단 줄 정돈** — ① 이사 소감 **"'극한'은 '어려움' 다음 표현으로 부적당"** 에 따라 세 칸의 **화면 이름을 보통 / 어려움 / 지옥**으로 바꿨다. **바뀐 것은 `BAL3.difficulty[*].label`·`short` 두 글자뿐이고 id(`normal`·`hard`·`brutal`)·배수·시드·기록 칸 키 접미(`2:brutal`)는 한 글자도 바뀌지 않았다** — 옛 저장의 기록은 그대로 이어진다(§3-8). ② 이사 스크린샷 소견 **"상단의 난이도 칩·무기 칩·⏸ 버튼 크기가 제각각이고 높이가 안 맞는다"** 에 따라 HUD 상단 세 조각을 **같은 높이 36 · 같은 중심선 y 34 · 같은 반경 18 · 같은 글자 15px · 같은 간격 8px** 로 통일하고, ⏸ 의 **히트 영역과 그리는 상자를 한 출처**(`render.HUD_ROW` → `main.HUD_BTN`)로 묶었다(§6). **규칙·배치·배수·저장은 손대지 않았다.** 검사 = `V3-RENDER-HUD` 2건, 보고서 = `newmode/v3/build7/hud-report.md`.

## 0. 범위와 원칙

- 범위 = 03 전달서 1단계: **사격형 게이트 · 병사/무기 통 · 병사별 실제 사격 · 분리벽 · 즉시 재도전**을 갖춘 스테이지 3개. 아레나·영웅·기지·드론·보너스전·3칸 게이트·원근 투영·코인은 2단계 이후.
- 기존 게임(`rush.html` + `rush/`)과 `tests/rush-*.test.mjs`는 **한 줄도 수정하지 않는다**. 신규는 `rush3.html`(루트) + `rush3/` + `tests/rush3-*.test.mjs`(ID 접두 `V3-`). 기존 코드는 `rush/rng.js`만 import하고, 나머지는 9장 결선표대로 복제·신규 작성.
- 게임 규칙은 순수 함수·순수 상태(`rush3/combat.js` 외 순수 모듈)로 두고 `node:test`로 잠근다. 화면(render)·입력·루프(main)는 규칙을 호출만 한다. **규칙 모듈은 `Math.random`·rng를 import하지 않는다**(정적 검사 테스트).
- **고정 시간 간격**: 규칙은 `STEP = 1/60`초 단위로만 진행한다. 30/60/120Hz 화면에서 같은 STEP별 입력열이면 같은 결과.
- 스테이지는 **고정 배치**. 스폰 좌표·지터까지 `buildStage(id)`가 `hashSeed(stageId + ':' + ev.z + ':' + i)`로 빌드 시점에 확정해 데이터에 박는다. 재도전 = `buildStage` 재호출(새 객체, 이전 판의 durability/value/passed/opened가 남지 않는다).
- **명시적 예외 하나 = 랜덤 길(§3-9).** S3 분리벽 `w3` 우측 통로만 **판마다 내용이 바뀐다**(셸이 넘기는 `lotterySeed`). 근거 = 이사 지시(2026-09-16) "빈 길이 아니라 랜덤 길". 그래도 **한 판 안에서는 여전히 고정 배치**다 — 추첨은 `buildStage` 시점에 한 번이고 `stepRun` 안에는 난수도 분기도 없다. 시드를 주지 않으면 `LOTTERY_DEFAULT_SEED`로 결정적(검사·봇 시뮬의 기준선).
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
| `balance.js` | `BAL3` (동결된 객체, **`BAL3.difficulty` 배수 표·`BAL3.lottery` 랜덤 길 풀 포함**), **`DIFFICULTY_IDS`**, **`DEFAULT_DIFFICULTY`**, **`difficultyMult(id)`**(표 한 줄, 모르는 id 는 throw) | 데이터 |
| `stages.js` | `STAGE_IDS`, `DEFS`, **`buildStage(id, { difficulty = 'normal', lotterySeed }) → stage`**(`stage.difficulty`·**`stage.lottery`** 포함), `stageMeta(id)`, `stageVersion(id)`, **`coverZFor(wallZ0, supplyZ)`**, **`VZ_MIN`**, **`MAX_DY`**, **`lotteryPick(seed)`**, **`LOTTERY_DEFAULT_SEED`** | 순수 |
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
| `main.js` | `boot(canvas, deps)`(자동 부트는 `#game3`가 있을 때만), `hitButton`, `makeLoop`(누적기, 테스트 가능), `missedLine`, `timeText`, **`DIFF_TOGGLE`**(타이틀 토글 좌표), **`normDifficulty(d)`**(저장값 거르기), **`lotteryLine(run, { weaponSame })`**(랜덤 길 결과 한 줄, 순수) | 셸 |

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
  wallSide: {},                              // wallId → 'L'|'R' (벽을 빠져나가면 삭제)
  wallSideLog: {},                           // 지나온 벽의 통로 선택(지워지지 않는다 — 결과 화면이 읽는다)
  lottery: null | { pick, idx, seed, good, label, kind, z, x, revealZ, openZ, wallId, supplyId, rowId },  // 3-9. buildStage 가 박는다. 규칙은 읽지 않는다
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
- **화면 표현(r3.6, §6).** 닫힌 셔터는 **사격 가능 시간만 제한**한다 — **선택 정보(칸 숫자·부호)는 가리지 않는다.** 셔터 판은 숫자보다 **먼저** 그리고 숫자는 그 위에 통과 전 행과 같은 불투명도로 얹는다. 잠김은 숫자를 대신하는 것이 아니라 칸 모서리의 **작은 자물쇠**로 따로 알린다(색만으로 구분하지 않는다). 근거 = 2026-09-17 2차 검수 N2 "셔터가 숫자와 사격 규칙을 함께 가린다" — 흐린 숫자는 '맞고 있는데 왜 안 변하지'와 '무엇을 고를까'를 동시에 만들었다.
- **열려도 오르지 않는 행이 있다(r3.6 수정 라운드 1).** `cells` 가 **모두** `value < 0 && maxValue <= value` 인 행은 셔터가 열려도 값이 오르지 않는다(`hitGateCell` 의 `min(maxValue, value + gain)` 이 곧 자기 값). 현재 이런 행은 **랜덤 길 ⑤ `trapGate`(−10 · 상한 −10) 하나뿐**이며, 세 스테이지의 코스 게이트에는 하나도 없다(실측 스캔). 셸 판정 `main.isFixedGateRow(row)` 가 이 조건을 갖고, §6 의 열림 문구와 `render.js` 의 '확정' 꼬리표가 **같은 조건**을 쓴다 — 두 표시가 어긋나면 안내가 서로를 부정한다.
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
coverZ = ceil( C + (s.z + MAX_DY − C) × scroll / vzMin )      C = wall.z0 − 60 + scroll × STEP
scroll = 190 (balance.js)   ·   vzMin = 650 (가장 느린 탄 = heavy.vz)   ·   STEP = 1/60
MAX_DY = 159 = 유닛 상한(150명)까지 채운 대형의 dy 최대 (stages.MAX_DY, squad.formation 에서 계산)
```

확정선(`wall.z0 − 60`)에 두면 **확정 직전에 발사돼 아직 비행 중인 탄**이 차폐가 걷힌 뒤 반대편 통에 도착해 배제가 뚫린다(검수 F3 계열). 확정 직전에 쏜 가장 느린 탄이 통에 닿는 순간의 `run.z`까지 차폐를 유지하면 **확정 전에 발사된 탄은 하나도 반대편 통에 닿지 못한다.**

**보정 두 항(2026-09-17 수정 라운드 2).** r3 의 공식은 `commitZ`(=`wall.z0 − 60`)에서 **부대 중심**이 쏜 탄만 셈해 두 가지를 놓쳤다.
1. **1 STEP 지연** — `clampCenter`는 `stepRun` 1단계에서 **직전 STEP의 `run.z`** 로 통로를 판정한다(4장 순서). 그래서 아직 통로 제약을 받지 않은 대형이 쏘는 마지막 STEP 은 `commitZ`가 아니라 `commitZ + scroll × STEP`(≈ +3.17px)이다.
2. **대형 깊이** — 탄은 부대 중심이 아니라 **`run.z − dy`** 에서 출발한다(4장 4단계). 뒷줄 유닛이 쏜 탄은 `dy`만큼 더 날아가야 해서 **가장 늦게** 도착한다.

⚠️**두 항이 빠져 있으면 대형이 커질수록 뚫린다.** 실측(2026-09-17): 확정 직전까지 `x 239`에서 중화기로 쏘다가 좌측으로 확정한 판에서, 옛 공식의 `coverZ 6046` 을 쓰면 `run.z 6051.50`에 탄 1발이 도착해 랜덤 길 통의 내구가 **14 → 11** 로 줄었다(병력 80). 새 공식(`6094`)에서는 같은 판에서 도달 0 이다. 값은 `stages.coverZFor(wallZ0, supplyZ)`가 계산한다.

**검사 범위(2026-09-17 검수 지적 2 반영).** `PAIR-4c`·`STG-4 ④`는 원래 **`pairId` 가 있는 통만** 돌아서, 짝이 없는 S3 좌 통 `c9`(z6300, `coverZ` 6094)와 **판마다 바뀌는 랜덤 길 통**이 공식 검사에서 통째로 빠져 있었다(`c9` 를 옛 값 `6046` 으로 되돌려도 검사 전건이 통과했다 — 변이 검사로 확인). 지금은 두 검사 모두 **`coverZ` 를 가진 모든 통**을 돈다: 벽 활성 구간(`wall.z0 − 60 … wall.z1`) 안에 있으면 공식 일치를 보고, 기본 시드의 랜덤 길은 게이트라 통이 안 나오므로 **통이 나오는 시드로 S3 판을 더 만들어** 랜덤 길 통까지 함께 본다. 스테이지마다 검사한 통 개수(`S1 0 · S2 2 · S3 6`, 랜덤 길이 통이면 7)도 함께 못 박아 두어, 통에서 `coverZ` 를 떼어 내 검사를 빠져나가는 변경도 실패한다.
**벽 밖에서 `coverZ` 를 갖는 통은 선택 C 의 z3900 통(`c8`) 하나뿐인 예외다.** 이 통은 벽이 아니라 **게이트(z4000)와 사격창을 나눠 쓰는 '저울'** 이라 차폐선이 그 게이트의 셔터 개시선(`4000 − gate.armZ = 3660`)이다. 두 검사가 이 예외를 `c8` 이라는 이름으로 못 박아 두었으므로, 다른 통이 벽 밖에서 `coverZ` 를 가지면 실패한다.
실사격 쪽은 `V3-LOTTERY LOT-3b` 가 **양방향**으로 잠근다: 좌측 확정 → 우측 랜덤 길 도달 0(대조군 = 옛 공식), 우측 확정 → **좌 통 `c9`** 도달 0(대조군 = `c9.coverZ` 만 6046 으로 되돌린 같은 판, 대형을 상한 150 까지 채우면 시드 5종 전부에서 뚫린다).
**⚠ `vzMin`보다 느린 무기·투사체를 추가하거나 `squad.unitCap`(대형 깊이)을 올리면 차폐를 쓰는 모든 지점(배제 쌍 4 + 좌 통 `c9` + 랜덤 길 통)의 `coverZ`가 전부 부족해져 배제가 다시 열린다.** `PAIR-4c`·`STG-4 ④`가 먼저 실패하도록 걸어 두었다.

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
| `brutal` | 지옥 | ×2.2 | ×3 | ×3 | ×2.4 | ×1.8 | ×1.5 |

- `enemyHp`: grunt/rusher/shooter hp(반올림) → 2/3/4 · 4/6/9 · 6/9/13. `eshotDmg`: shooter·elite 적탄 dmg → 1/2/3(**어려움부터 적탄 1발 = 병사 1명**). `touchDmg`: grunt/rusher/elite 접촉 → 1/2/3 · 2/4/6 · 3/6/9. `eliteHp`: 정예 hp(반올림) → S1 120/192/288 · S2 220/352/528 · S3 500/800/1200. `spawnCount`: **xs 없이 `rows` 로 뿌리는 무리만** n × 배수(반올림) — 1단계에서는 S3 z8800 잡졸 18 → 25 → 32 하나뿐(xs 명시 무리는 회피 통로 규격 STG-6 을 지키려 좌표까지 그대로). `eliteFireRate`: 정예 `shootEvery` ÷ 배수 → 1.0/0.8/0.667 s(저격수 주기는 그대로). 스폰 정의에 `hp` 가 명시된 적은 그 값 그대로(스테이지 고정값 원칙).

**표시 이름(2026-09-18 이사 결정).** 화면에 나오는 세 칸의 이름은 **보통 / 어려움 / 지옥**이다. 근거 = 이사 소감 **"'극한'은 '어려움' 다음 표현으로 부적당"**. **id 는 `normal`·`hard`·`brutal` 그대로 유지한다** — 표시 이름과 id 는 다른 것이고, 바뀐 것은 `BAL3.difficulty[*].label`·`short` 뿐이다. 따라서 **배수 표·시드·저장 기록 칸 키의 접미(`2:hard`·`2:brutal`)·`DEFAULT_PICK_DIFFICULTY = 'brutal'` 은 전부 그대로**이고, 이 문서와 옛 보고서에서 '극한'이라 적힌 칸은 모두 지금의 '지옥'(= `brutal`)을 가리킨다. HUD 태그·타이틀 토글·결과 제목은 모두 이 한 표를 읽으므로 이름은 한 곳에서만 바뀐다.

**두 가지 기본값(2026-09-16 이사 결정).** '기본값'이라는 말이 두 곳에서 서로 다른 것을 가리키므로 나눠 적는다.

| 이름 | 값 | 사는 곳 | 뜻 |
|---|---|---|---|
| **규칙 기본** `DEFAULT_DIFFICULTY` | `normal` | `rush3/balance.js` | `buildStage(id)`·`createRun(stage)` 를 **난이도 인자 없이** 부를 때의 값. 검사·봇 시뮬의 기준선이고 r3 배치 그대로를 뜻한다. **바뀌지 않는다.** |
| **타이틀 초기 선택** `DEFAULT_PICK_DIFFICULTY` | `brutal` | `rush3/balance.js`(셸이 읽음) | 저장에 난이도가 없을 때 타이틀이 **처음 켜 두는 칸**. 셸 `normDifficulty` 의 폴백(`rush3/main.js`)과 저장 기본값(`rush3/save.js` `PICK_DEFAULT`)이 같은 값을 쓴다. |

근거 = 이사 결정(2026-09-16): **"극한으로 모든 스테이지를 격파했다 → 극한을 기본으로 한다."**(그때의 '극한' = 지금의 '지옥' — 같은 칸 `brutal`, 2026-09-18 에 이름만 바뀌었다) 그러므로 바뀐 것은 **처음 보여 주는 칸 하나**뿐이고, 규칙·배수 표·기록 칸 키 규칙(§7, 접미 기준 `BASE_DIFFICULTY = normal`)은 그대로다. 플레이어는 토글로 언제든 보통으로 되돌릴 수 있고, 그때 기록은 접미 없는 칸으로 돌아간다.

**초기 선택 재확인(2026-09-17) — 이사 결정과 검수자 권고가 갈린다. 둘을 나란히 남긴다.**

| 구분 | 내용 |
|---|---|
| **이사 결정(적용)** | **가장 높은 칸 유지.** 타이틀 초기 선택 `DEFAULT_PICK_DIFFICULTY = 'brutal'`(표시 이름 '지옥', 2026-09-18 전에는 '극한') 을 그대로 둔다. 이 제품은 처음부터 도전 게임으로 세운다. |
| **검수자 권고(미채택·기록만)** | 2차 검수 §4 Q1: 첫 방문에만 짧은 **보통 체험**을 주고 이후 고른 난이도를 기억하라(또는 "처음 플레이 / 바로 극한 도전" 두 칸). 근거 = 만든 사람의 완주가 신규 이용자의 학습 가능성을 증명하지는 않는다. |

권고를 받지 않았으므로 **입문 성공 경로와 초보 실패율 목표는 이 문서 안에서 따로 맞춰야 한다**(검수자가 붙인 조건). 그 자리는 §3-8 성공 경로 봇(`planBoss`) 실측과 2단계의 초보 관찰이다. 코드·저장·검사는 이 재확인으로 바뀌지 않았다.

**적용 시점(V3-PURE·결정성).** 배수는 **빌드/생성 시점에 한 번**만 적용된다. `buildStage(id, { difficulty })` 가 `stage.difficulty`·rows 스폰 n·정예 hp 를 박고, `createRun(stage)` 가 `stage.difficulty` 를 읽어 `run.difficulty` 와 **`run.enemyDefs`**(`BAL3.enemies` 에 배수를 적용해 동결한 표)를 만든다. `stepRun` 이하 규칙은 `BAL3.enemies` 를 직접 읽지 않고 `run.enemyDefs` 만 읽으므로 **STEP 안에 난이도 분기가 없다**(V3-DIFF DIFF-6 정적 검사). `createRun(stage, { difficulty })` 의 옵션은 합성 스테이지(검사)용 덮어쓰기이고 셸은 항상 `buildStage` 경로만 쓴다. 모르는 id 는 규칙 모듈이 throw — 저장값을 거르는 곳은 셸 `normDifficulty` 하나.

**봇 실측(출발값 표, 2026-09-16).** 이 표는 **봇 결과이지 사람의 성공률이 아니다.** `aim`: normal S1~S3 완주 · hard S1·S3 완주, **S2 는 정예전 전멸**(정예 217/352 잔존) · brutal S1 정예전 전멸(55/288 잔존), S3 전멸(36/1200). `plan`: hard S1·S3, brutal S3 완주. `center`: hard S1 완주, hard·brutal S2·S3 실패. hard S2 는 정예 배수(eliteHp·eliteFireRate)를 ×1.0 까지 내려도 `aim` 이 못 이긴다(잔존 56) — 원인은 적탄 dmg 2 와 옆으로 비키지 않는 봇의 조합(소총 21명이 정예 3발/초를 그대로 받아 화력이 먼저 소진). **표는 출발값으로 두고 사람 플레이로 지점을 찾는다**(보고서 `newmode/v3/build3/difficulty-report.md`, 탐색 기록 포함).

**성공 경로 봇(`planBoss`, r3.5 · 2026-09-17).** 위 표는 *'서 있는 봇이 이기는가'* 를 묻는다. 2차 검수(§4 Q3)의 지적대로 그것만으로는 **이길 수 있는 조작이 있는지**를 말할 수 없어, 보스 등장 전은 계획 봇 그대로이고 **정예가 나오면 정예의 현재 x 를 따라 조준**하는 봇(`planBoss`)을 하나 더 둔다. 이동은 실제 STEP 의 이동 속도 제한을 그대로 받고 탄 회피는 하지 않는다(회피 최적화 봇이 아니다). 실측(2026-09-17): **hard S1 14명 · hard S2 5명 · hard S3 70명 · brutal S1 10명 · brutal S3 57명 완주**, **brutal S2 만 실패**(정예 hp 201/528 잔존). 검수의 독립 실험(어려움 S2 5명 · 극한 S1 10명 생존)과 생존 수까지 같다. 따라서 **어려움 3스테이지와 극한 S1·S3 은 '불가능한 코스' 가 아니다.** 극한 S2 는 이 단순 조준 변형으로는 성공을 입증하지 못했으므로 잠그지 않고 기록만 한다. 배수 표·배치·기본 난이도는 이 발견으로 바꾸지 않았다(보고서 `newmode/v3/build5/bot-report.md`).

### 3-9. 랜덤 길(r3.4, 2026-09-17)

**근거.** 이사 지시(2026-09-16): **"3스테이지에 빈 길은 무의미하다. 당연히 그 길로 안 간다. 빈 길이 아니라 랜덤 길을 만들어서 진입 시마다 로또처럼 좋거나 꽝인 선택이 랜덤으로 나오게 해 주자."** r3 의 S3 선택 D 는 좌(병사 10 + 저격수 2) vs 우(빈 통로, 보상 0)였다. 빈 쪽은 **고르지 않는 것이 항상 옳아** 선택이 아니었다. 대상은 **S3 분리벽 `w3` 우측 통로 하나**이고 다른 선택(A·B·C)·S1·S2·난이도 표의 **배치**는 손대지 않았다(§3-3 `coverZ` 공식 보정만 네 지점에 함께 반영됐다).

**표지.** 벽 `w3` 의 `signs.R = { kind: 'lottery' }` → 벽 앞머리에 **'?'** 로 그린다. 좌측 표지(병사 10)는 그대로라 **"아는 쪽 vs 모르는 쪽"** 의 저울이 된다.

**풀(출발값 — `BAL3.lottery.pool`). 균등 1/5, 좋음 3 : 꽝 2.**

| # | id | 좋음 | 종류 | 내용 | 배치 |
|---:|---|---|---|---|---|
| ① | `soldier8` | 좋음 | 통 `soldier` | 내구 14 · 병사 8 | z 6300 · x 330 · `coverZ 6094` |
| ② | `heavy` | 좋음 | 통 `weapon` | 내구 24 · 중화기(이미 heavy 면 `weaponSame`) | 〃 |
| ③ | `chain6` | 좋음 | 통 `chain` | 내구 8 · 발판 6 · 최대 12(발판은 **우측 차선 x 330**) | 〃 |
| ④ | `badGate` | 꽝 | 게이트 한 칸 | `[252,400)` 값 **−15 · 상한 0**(쏘면 0 까지 무효화 가능) | z 6300 · `bypass` · `armZ = z − openZ`(=206) |
| ⑤ | `trapGate` | 꽝 | 게이트 한 칸 | `[252,400)` 값 **−10 · 상한 −10**(= 자기 값, **쏴도 오르지 않는 확정 손실**) | 〃 |

- 통 3종의 `coverZ`는 **좌측 통(z6300)과 같은 비행시간 보정선** `coverZFor(6000, 6300) = 6094`이다(§3-3 공식 그대로).
- ④ 는 한 칸 행(`bypass: true`)이라 **좌측 통로로 가면 걸리지 않는다**. 상한 0 = "쏘는 만큼 무효로 만들 수는 있어도 이득으로 뒤집을 수는 없다".
- ⑤ 도 한 칸 행이다. **상한이 자기 값**이라 `hitGateCell`의 `min(maxValue, value + 1)`이 값을 움직이지 못한다 — 탄은 흡수되고 `gateHit` 신호는 나지만 숫자는 그대로다. 화면에는 숫자 아래 **'확정' 꼬리표**를 붙여 "안 먹히는 이유"를 남긴다(§6).
- **⑤ 의 외형 = 게이트가 아니라 함정·봉쇄 장치(2026-09-17 이사 결정 ③ · 검수자 권고 그대로 채택).** 검수 N3 의 지적 — "쏴도 늘지 않는데 일반 사격형 게이트와 모양이 같다. 유지하려면 함정·봉쇄 장치처럼 별도 외형을 써서 기본 규칙의 예외를 즉시 알게 해야 한다" — 을 **A안(함정 외형)** 으로 받는다. '?' 가 걷히면 붉은 봉쇄 바 + 큰 자물쇠 + 배지 "쏴도 안 줄어듦" 으로 보이고, **셔터 계열 표현(회색 빗금 판·사격 개시선·'가까워지면 열림')은 이 행에 하나도 쓰지 않는다**(§6). **규칙은 그대로다** — `armZ`·`armed`·값 갱신 공식·풀 값·시드 정책 어느 것도 바꾸지 않았고, 바뀐 것은 그리기와 소리뿐이다. 결과 문구는 이미 실제 적용량으로 나온다(**"함정 피해 −10명"**, r3.6 · 아래 표) — 유지 확인했다.
- **⚠️꽝은 '병력이 실제로 줄어드는 것'이어야 한다.** r3.4 초안의 ⑤ 는 돌격체 4(`kind: 'enemy'`)였는데, 이 지점의 병력은 68~69 라 돌격체가 **접촉 전에 전멸**했다. 2026-09-17 실측: 우측 통로를 고른 판이 보통 69→69(`lossByTouch` 0, `kills` +4) · 어려움 68→68 · 극한 68→68 — 세 난이도 모두 **손실 0 + 공짜 처치**였고, 결과 한 줄만 '꽝'이라고 적는 상태였다. 배치를 당기거나(전방 200px) 수를 늘려도(8·12기) 결과가 같았다(비행 중인 아군 탄이 스폰 즉시 지운다). 그래서 ⑤ 를 **확정 손실 게이트**로 바꿨고, 풀에 `kind: 'enemy'` 는 더 이상 없다. `LOT-6b` 가 난이도 3종에서 '우측 선택 = 확정 손실 10 · 좌측보다 병력 15 이상 적다'를 잠근다.

**시드 = 판마다 다르다.** `buildStage(id, { difficulty, lotterySeed })`. 셸(`main.js startRun`)이 `hashSeed('lot:' + stageId + ':' + attempts + ':' + dateNow())`를 넘긴다. **시계는 셸에만 있고**(`deps.dateNow` 로 주입 가능 — 셸 결선 검사 `V3-SHELL-LOTTERY`(`tests/rush3-loop.test.mjs`)가 이 조립을 고정한다: 같은 시각·같은 `attempts` 면 재현, 시각이나 `attempts` 가 바뀌면 시드가 바뀐다, 기본 시드로 고정되지 않는다) 규칙 계층은 받은 시드로 `mulberry32`를 **한 번** 돌린다. 그래서 **규칙 난수는 여전히 0**이고 V3-PURE 도 그대로다(추첨은 `stages.js` 안, `stepRun` 밖).
- `lotterySeed`를 주지 않으면 `LOTTERY_DEFAULT_SEED`(= `hashSeed('rush3:lottery:default')`). 검사·봇 시뮬의 기준선이며 이 경로에서는 `buildStage(3)` 두 번이 deepEqual 이다.
- **재도전 버튼도 새 시드**다(`attempts` 와 시계가 모두 바뀐다). §0 '재도전 동일 배치' 원칙의 **명시적 예외**이며 근거는 위 이사 지시다. 같은 시각으로 두 번 출격해도 시드가 달라지는 것을 `V3-SHELL-LOTTERY` 가 잠근다.
- **재도전 시드 정책 재확인(2026-09-17) — 이사 결정과 검수자 권고가 갈린다.**

  | 구분 | 내용 |
  |---|---|
  | **이사 결정(적용)** | **재도전마다 새 추첨을 유지한다**("랜덤은 랜덤"). 대신 결과 화면 **[다시 도전] 버튼 아래에 작은 부연 "랜덤 길은 새로 추첨"**(`render.RETRY_LOTTERY_NOTE`)을 랜덤 길이 있는 판에만 띄워, 배치가 같은데 길만 달라진다는 것을 버튼 옆에서 알린다(§6). |
  | **검수자 권고(미채택·기록만)** | 2차 검수 N3·§4 Q2: **[다시 도전]은 같은 시드**, 스테이지 선택에서의 새 출격만 새 시드. 근거 = 결과가 매번 바뀌면 '내가 더 잘한 것'과 '운이 달라진 것'을 구별하기 어렵다. 매번 추첨이 중요하면 버튼 이름을 '새 판'으로 구분하라. |

  셸 코드(`startRun` 의 `hashSeed('lot:' + id + ':' + attempts + ':' + dateNow())`)는 이 결정으로 **바뀌지 않았다**. 바뀐 것은 결과 화면의 한 줄과 버튼 자리뿐이다.
- 결과는 `stage.lottery` → `run.lottery` 로 흐른다: `{ pick, idx, seed, good, label, kind, trap, z, x, revealZ, openZ, wallId, supplyId, rowId }`. `trap` = ⑤ 확정 손실(게이트이고 `good: false` 이고 `maxValue === value`)인가 — **뽑는 쪽의 표식**이고, 그리는 쪽은 같은 조건을 행에서 직접 본다(`render.isTrapGateRow`). 둘이 어긋나면 함정 외형이 엉뚱한 칸에 붙으므로 `LOT-6b` 가 두 판정을 같은 판에서 맞대어 본다. **규칙은 이 필드를 읽지 않는다**(셸의 결과 한 줄·'?' 연출 전용, `V3-LOTTERY LOT-8` 정적 검사).

**안내 문구.** 좌측 통(c9)의 `hint` 와 벽 표지 `signs.R` 는 **같은 말을 해야 한다** — 우측은 '없음'이 아니라 **'판마다 달라지는 랜덤 길'**이다. 이 문구는 결과 화면 제안 한 줄(§6-2 우선순위 2 '놓친 통')로 실제 출력되므로, 빈 길 시절 표현('빈 길'·'아무것도 없'·'보상 0'·'안전하지만')이 `w3` 구간(z 5400~7200)의 통·게이트 `hint` 에 남아 있으면 안 된다(`V3-LOTTERY LOT-10`·`LOT-10b` 가 잠근다).

**가림과 공개.** 통로 확정선 `revealZ = wall.z0 − 60`(=5940) 전에는 우측 통로의 실제 물체를 그리지 않고 **'?' 상자**로 덮는다. 사격은 기존 두 장치가 그대로 막는다 — 통이면 `coverZ`(흡수·내구 불변, `supplyBlock`), 게이트면 셔터(흡수·값 불변, `gateBlock`). **두 개방선은 같은 z `openZ = coverZFor(6000, 6300) = 6094`** 다: 게이트도 기본 `armZ 340`(개방선 5960)이 아니라 `armZ = z − openZ`(=206)를 쓴다. 기본 340 이면 셔터가 확정선 20px 뒤에 열려 **확정 전에 쏜 비행 중인 탄**이 도착해 값을 바꾸기 때문이다(통 쪽 누출과 같은 계열 — §3-3 보정 두 항). **`openZ > revealZ`** 라 확정 전에 내용이 새지 않는다. 확정을 넘는 프레임에 상자가 0.25초(`BAL3.lottery.openT`)에 걸쳐 걷히고 효과음 1회(좋음 `gateFlip` / 꽝 `hurt` 재사용).

**⚠️'새지 않는다'는 그림만이 아니라 소리·색까지다(r3.7 수정 라운드 1).** 확정선 전에도 막힘 자체는 일어난다 — 통이면 `supplyBlock`(무음·연출 없음), 게이트면 `gateBlock`. 이때 **어느 종류의 게이트인지 알 수 있는 표현을 쓰면 안 된다.** 셸은 공개 전 `gateBlock` 에 **꽝 게이트와 똑같은** `gateClang` + 회색 스파크만 내고, 함정 전용 `trapHit` + 붉은 스파크는 `run.z >= revealZ` 뒤에만 쓴다(`main.trapShown`). 같은 이유로 셔터 안내(`'가까워지면 열림'`·첫 조우 배너)도 **공개 판정을 함정 판정보다 먼저** 본다. 검사 `V3-SHELL-TRAP`(두 번째 건)이 함정 판과 꽝 판의 **확정선 전 소리 집합이 같음**을 잠근다. (남은 누출: 게이트 두 종은 `gateClang` 을 내고 통 3종은 무음이라 **'게이트냐 통이냐'는 여전히 소리로 샌다** — 이 판의 설계상 통로 표지(`signs.R`)가 '랜덤 길'이라는 것 이상은 알리지 않기로 했으므로, 이 한 단계 누출은 미해결로 기록해 둔다.)

**결과 한 줄(`main.lotteryLine(run, { outcome, weaponSame })`, 순수) — r3.6 개정.** 우측을 골랐으면 **그 판에서 실제로 일어난 일**, 좌측을 골랐으면 **놓친 내용을 공개**한다(감추지 않는다).

**⚠️문구는 추첨 종류의 이름(`label`)이 아니라 적용 결과다(2026-09-17 2차 검수 N4).** 같은 `−15 게이트`가 쏴서 0 으로 막은 판에서는 **손실 0**, 안 쏜 판에서는 **−15** 로 끝난다. 이름만 적으면 **플레이어가 잘해서 막아낸 판까지 '꽝'** 이라고 전한다(검수 실측: 보통·우측 접근과 계획 접근 모두 −15 를 0 으로 만들어 실제 손실 0 이었는데 화면 문구는 둘 다 '꽝 −15 게이트'였다).

**집계 `run.lotteryOutcome`(셸이 갖는다).** `main.emptyLotteryOutcome()` = `{ passed, value, applied, soldiers, pads, padsTotal, swapped, same }`. 셸이 프레임마다 `main.collectLotteryOutcome(out, events, run)` 으로 **규칙 계층이 이미 내는 이벤트**만 골라 담는다 — `gatePass`(id = `lot.rowId`) → `passed`·`value`·`applied`, `joinMany`(id = `lot.supplyId`) → `soldiers`, `chainOn`+`padAdd` → `padsTotal`, `padTake` → `pads`, `weaponSwap`/`weaponSame`(랜덤 길이 무기 통이고 공개선을 넘은 뒤) → `swapped`/`same`. **규칙 모듈은 여전히 `lottery` 를 모른다**(`LOT-8` 정적 검사) — 어느 이벤트가 랜덤 길의 것인지는 **셸이 id 로 가린다**. 집계가 없으면(규칙 계층 단독 검사 경로) 추첨 이름으로 되돌아간다.

| 상황 | 문구 |
|---|---|
| 좌측 선택 · 좋음 | `오른쪽 랜덤 길은 이번 판엔 병사 8 이었습니다` |
| 좌측 선택 · 꽝 | `오른쪽 랜덤 길은 이번 판엔 꽝(−10 확정 게이트)이었습니다` |
| 우측 · 게이트를 0 까지 올려 통과(`applied === 0`) | `랜덤 길: 위험 게이트 무력화 · 손실 0` |
| 우측 · 게이트에서 실제 손실(`applied < 0`) | `랜덤 길: 함정 피해 −10명` |
| 우측 · 병사 통 | `랜덤 길: 병사 8 획득` (실제 합류 수) |
| 우측 · 연속 증원 | `랜덤 길: 증원 발판 9/12개 확보` (밟은 수 / 깔린 수) |
| 우측 · 무기 교체됨 | `랜덤 길: 중화기 획득` |
| 우측 · 무기가 동급(교체 없음) | `랜덤 길: 중화기 중복 · 교체 없음` |
| 우측 · 통을 못 열었음 | `랜덤 길: 병사 8 — 열지 못했습니다` |

**공개 효과음(r3.6).** 위험 항목이 드러나는 순간은 **중립 경고음 `lotWarn`** 이다(좋음은 `gateFlip` 그대로). **피격음(`hurt`)은 실제로 병력이 줄어드는 순간(`gatePass` 의 `value < 0 && applied < 0`)에만** 난다 — 공개만으로 피격음을 내면 무력화 성공이 흐려진다(2026-09-17 2차 검수 N4).

좌측을 고른 판에서 우측 통은 `structurallyLost`(벽 배제)로 **`skipped`** 가 된다 — '놓침'으로 세지 않고 `adviceLine` 후보에서도 빠진다(§3-3). 랜덤 길 한 줄은 그것과 **별도 줄**이라 제안 문구를 밀어내지 않는다.

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
| 2300 | 12.1s | 좌 병사 통 x 120 내구 6 병사 3 / 우 무기 통 x 326 `auto` 내구 12 | **둘 다 `coverZ 1953`(= 확정선 1740 + 비행 보정 213) · `pairId 'w1'`**, `hint` |
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
| **2800** | **연속증원 x150** 내구 10 · 발판 5 · 최대 15 | **병사 통 x330** 내구 10 병사 5 | **선택 A** `pairId 'p1'` · 둘 다 **`coverZ 2524`** |
| **3150~3550** | **차폐벽 `w2` + 표지**(좌: 기관총 / 우: 중화기) | | **선택 B 확정선 `run.z 3090`** |
| **3500** | 무기 통 **`auto`** x150 내구 12 | 무기 통 **`heavy`** x330 내구 **24** | **선택 B** `pairId 'p2'` · 둘 다 **`coverZ 3259`** |
| 3900 | 병사 통 x150 내구 **24** 병사 4 · **`coverZ 3660`** | — | **선택 C 의 저울**(게이트 사격창과 겹친다 — 벽 배제가 아니다) |
| **4000** | 게이트 좌 **+3(칸 상한 12)** | 게이트 우 **−25(칸 상한 40)** | **선택 C** `armZ 340`, `hint` |
| 5200 | grunt 14 (2열, 통로 없음) | | 탄막 |
| 6000~7200 | 분리벽 `w3` x228~252 + 표지(좌: 병사 10 / 우: **'?' 랜덤 길**) | | **선택 D 확정선 `run.z 5940`** |
| **6300** | 병사 통 x150 내구 20 **병사 10** · **`coverZ 6094`** + shooter 2 (x120 / 190) | **랜덤 길(3-9)** — 판마다 5종 중 1개(병사 8 / 중화기 / 연속 증원 / −15 게이트 / **−10 확정 게이트**) | **선택 D** — r3.4 이사 지시로 '빈 길' → '아는 쪽 vs 로또' |
| 8000 | rusher 6 (xs 100/160/210/270/320/380) | | |
| 8800 | grunt 18 (2열) + shooter 3 (130/240/350) | | |
| 10600 | 정예 hp 500 · 4s 마다 잡졸 2 소환 | | |
| length 11000 | | | |

**구조적으로 배타적인 경로 변경 = 3회**(A·B·D, 벽 + `coverZ`) **+ 사격창 저울 1회**(C). 검수가 요구한 "S3 최소 2회"를 넘긴다.

**선택 D 는 r3.4 에서 '랜덤 길'이 됐다(§3-9).** 이전의 우측 빈 통로는 보상 0 이라 **고르지 않는 것이 항상 옳았고**, 그래서 선택이 아니었다(이사 지시 2026-09-16). 지금은 좌 = **아는 보상**(병사 10, 대신 저격수 2), 우 = **모르는 보상**(균등 1/5 로 좋음 3 : 꽝 2)이다. 배제 구조(벽 `w3` + `coverZ 6094`)는 그대로라 **한쪽만 얻는다**는 성질도 그대로다. 꽝 2 는 둘 다 실제 손해다 — ④ 는 화력으로 0 까지 막을 수 있고, ⑤ 는 **막을 수 없는 −10**이다(실측: 벽을 빠져나온 자리에서 좌 79 vs 우 59, 세 난이도 모두 게이트 손실 10).

**선택 C 는 배제가 아니라 저울이다.** 통(z3900)의 `coverZ 3660` 은 게이트 셔터 개방선(`4000 − 340`)과 같은 값이라, 통과 게이트 우 칸이 **같은 사격창을 나눠 쓴다**. 다만 이 저울은 **병력 상한 안에서만** 성립한다 — 소총 30 / 기관총 12 / 중화기 25 를 넘는 대군은 창 안에서도 탄이 남아 **통과 +40 을 둘 다 가져간다**. "1발 = +1, 숨은 감쇠 없음"을 지키는 한 피할 수 없으므로 감추지 않고 적는다(`V3-SIM-POLICY POL-9` 는 이 경우를 실패시키지 않고 기록한다).

**난이도 튜닝(r3, 2026-09-11).** r2 의 튜닝 문단(사거리 662 전제)을 셔터 기준으로 다시 쓴다.
1. **게이트 사격창을 절반으로 줄였다**(`armZ 340`, 실측 662 → 340). 전투 전체 사거리·통·적·정예 사거리는 건드리지 않았다.
2. **음수 칸의 상한을 칸마다 따로 준다**(S2 우 −20/상한 40, S3 우 −25/상한 40). 큰 성장 보상은 남기되 병력이 모여야만 닿는다.
3. **잡졸을 직진으로 바꾸고**(`track 0`) 회피 통로를 **데이터로 선언**했다(`corridorHw`). 손해분은 배치와 돌격체·저격수로 상쇄하며 **적 HP 상향·병력 비례 숨은 감쇠는 쓰지 않는다.**
4. S1 은 그대로 무조작 완주 보장(첫 스테이지 성공 경로). 검증 = `V3-SIM-POLICY POL-2`.
5. 검증 = `V3-SIM-POLICY POL-1~9`(8정책 × 3스테이지 = 24판) + `V3-SIM-NOOP`.

## 6. 화면(`render.js`)과 셸(`main.js`)

- 렌더는 `view.now`(셸 시계)만 쓰고 `performance.now()`를 직접 읽지 않는다. DPR 반영(백킹스토어 = CSS 크기 × min(devicePixelRatio, 2)).
- HUD 상단: `STAGE n 제목` + 목표(남은 거리 m, 정예 등장 후 정예 HP 막대+숫자). 부대 발밑: 병력 수. 우상단 한 줄: **난이도 태그 · 무기 칩 · ⏸**. 난이도 태그는 **어려움·지옥만**(`BAL3.difficulty[id].short`, normal 은 빈 문자열이라 칩 자체를 안 그린다). 부대 중심 표시(작은 삼각 마커 — 게이트 칸 판정 기준). 적 HP 태그의 기준 hp(잡졸은 다쳤을 때만 표시)는 `run.enemyDefs` 를 읽는다.
- **HUD 상단 줄의 자리표(r3.8, `render.HUD_ROW` — 좌표 단일 출처)**: 근거 = 이사 스크린샷 소견(2026-09-18) **"상단의 난이도 칩·무기 칩·⏸ 버튼 크기가 제각각이고 높이가 안 맞는다"**(고치기 전: 높이 30/44/44 · 위 경계 21/14/14 · 반경 15/22/16 · 글자 14/16/19px). 세 조각은 **같은 높이 36 · 같은 위 경계 y 16 · 같은 세로 중심선 y 34 · 같은 모서리 반경 18 · 같은 글자 15px** 를 쓰고, 화면 오른쪽에서 **14px 띄운 자리부터 8px 간격**으로 왼쪽으로 선다 — 난이도 `x 220~284` · 무기 `x 292~414` · ⏸ `x 422~466`. 왼쪽 `STAGE n 제목`도 **같은 중심선 y 34**(중심 기준으로 찍는다), `남은 거리`는 그 아래 줄 y 62.
  - **⏸ 는 히트 영역과 그리는 상자가 같은 객체다.** 셸이 `main.HUD_BTN`(= `HUD_ROW.box.pause` 그대로 + `hud: true`)을 `view.buttons` 에 넣으면 `drawButtons` 는 그 버튼을 **건너뛰고** `drawHud` 가 **넘어온 상자 그대로** 칩을 그린다. 좌표를 셸과 렌더 두 곳에 적지 않으므로 "그린 자리와 누르는 자리"가 구조적으로 갈라질 수 없다. 검사 `V3-RENDER-HUD`(§8)가 이 둘을 함께 잠근다.
  - 일시정지 중·결과 화면에서는 셸이 ⏸ 를 안 넘기므로 칩도 그려지지 않는다(종전 동작 그대로).
- 첫 플레이 안내: 출격 후 3초간 "좌우로 드래그 · 쏴서 숫자를 키우세요" 한 줄(모든 코스 버전·난이도 칸의 attempts 합이 0 일 때만).
- **타이틀 난이도 토글(r3.3)**: 스테이지 버튼(y 436~) 바로 위 한 줄 — 라벨 "난이도" + 칸 3개(보통/어려움/지옥, `main.DIFF_TOGGLE`: x 138 + i×96, y 382, 90×34, 버튼 id `diff_<id>`). 고른 칸 = primary. **클릭 또는 키 1/2/3**(타이틀에서만 — 판 도중 숫자 키는 무시). **저장에 난이도가 없으면(첫 방문·옛 저장) 처음 켜져 있는 칸은 '지옥'**(id `brutal`)(`DEFAULT_PICK_DIFFICULTY`, 2026-09-16 이사 결정 — §3-8 '두 가지 기본값'). 규칙 기본 `DEFAULT_DIFFICULTY = normal` 과는 다른 값이며, 셸 `normDifficulty` 는 모르는 값도 이 초기 선택으로 떨어뜨린다. 선택은 저장 최상위 `difficulty` 에 기억되고, 스테이지 버튼의 기록(sub: 완료·최고·도전 횟수)은 **그 난이도 칸의 기록**이다. 출격은 `buildStage(id, { difficulty, lotterySeed })` 로, 그 뒤로는 `run.difficulty` 가 진실(재도전·다음 작전도 같은 난이도). **`lotterySeed = hashSeed('lot:' + id + ':' + attempts + ':' + dateNow())`** — 판마다 다르다(§3-9, `deps.dateNow` 로 주입 가능).
- 게이트: 칸 사각형 + 부호 숫자(큰 글씨) + 색. 피격 시 흰 플래시·숫자 튐. 통과 뒤 흐리게.
- **게이트 셔터(r3 · r3.6 개정)**: `armed === false`인 행은 칸 위에 **회색 빗금 셔터 판**을 덮되, **칸 숫자·부호는 그 판 위에 통과 전 행과 같은 불투명도(0.92)로 선명하게** 그린다(그리기 순서 = 칸 바탕 → 셔터 판 → 숫자 → 자물쇠). **r3 의 '보이되 흐리게'(흐림 0.45배)는 폐기한다** — 숫자를 가리면 선택 정보를 함께 가린다(§3-2 · 2026-09-17 2차 검수 N2-①).
  - **잠김 아이콘(r3.6)**: 닫힌 칸마다 **왼쪽 위 모서리에 작은 자물쇠**(`drawLockBadge`, 숫자 자리를 비켜 간다). 색이 아니라 **형태**로 잠김을 알린다 — `armed` 가 되는 순간 사라지고(판이 걷히는 0.25초 동안에는 이미 잠김이 풀렸다) 셔터 판만 남아 걷힌다.
  - **짧은 안내 글(r3.6)**: 칸 위 한 줄. 닫힌 행이 처음 화면에 들어오면 **"가까워지면 열림"**, 그 행이 열리는 순간(`gateArm`) **"지금 쏘면 +1"** — 각 `BAL3.fx.gateTipSec`(1.2초). **⚠️열림 문구는 행 종류에 따라 갈린다(r3.6 수정 라운드 1)**: `main.isFixedGateRow(row)` 가 참인 **확정 손실 행**(모든 칸이 `value < 0 && maxValue <= value`)에는 `GATE_TIP_OPEN` 대신 **`GATE_TIP_OPEN_FIXED` = "쏴도 그대로예요"** 를 띄운다. 그 행은 몇 발을 맞아도 값이 그대로라, '+1' 을 약속하면 **같은 화면의 '확정' 꼬리표와 정면으로 어긋나** N2 가 없애려던 '맞고 있는데 왜 숫자가 안 변하지?' 를 바로 그 행에서 새로 만든다(2026-09-17 렌더 실측: z 6096 한 화면에 `["−10","확정","지금 쏘면 +1"]`). 닫힘 문구("가까워지면 열림")는 확정 행에서도 참이므로 그대로 쓴다. 타이머는 셸 `fx.gateTip[rowId] = { text, t }`. ⚠️행이 화면 위 끝(`enterZ` = 760 → y −120)에서 들어오는 동안에는 '칸 위'가 화면 밖이므로 글의 y 를 **HUD 아래 96px 로 클램프**한다(행이 내려오면 자연히 칸 위로 붙는다). 클램프가 없으면 1.2초 내내 화면 밖에 그려진다(2026-09-17 렌더 실측).
  - **사격 개시선**: 도로 위 `run.z + armZ` 위치에 행 색 점선 1줄. 옆에 작은 글 **"이 선 안으로 온 게이트를 쏠 수 있어요"**(`render.ARM_LINE_TEXT`). ⚠️**선 안으로 들어오는 주체는 게이트다** — "선을 넘으세요"처럼 플레이어를 주체로 쓰면 벽의 **통로 확정선**과 헷갈린다(2차 검수 N2-④).
  - **열림 연출**: `gateArm` → 셔터 판이 `BAL3.gate.openT`(0.25초) 동안 **위로 걷힌다**(남는 판이 칸 **위쪽**에 붙어 줄어든다 — r3 구현은 아래쪽에 남아 반대로 걷혔다) + 효과음 `gateOpen` **1회**.
  - **막힘 연출**: `gateBlock` → 셔터 표면에 작은 **회색** 튐(피격 흰 플래시와 구분) **+ 금속 튕김 효과음 `gateClang`**(r3.6 — 색만으로 구분하지 않는다).
  - 셔터 연출 타이머는 규칙이 아니라 셸 `fx.gateOpen[rowId]` 가 갖는다(`fx.gateFlash` 와 같은 방식).
  - **⚠️함정 행은 위 셔터 표현을 하나도 쓰지 않는다(r3.7, 아래 '함정 외형' 항).**
- **함정 외형(r3.7 · 2026-09-17 이사 결정 ③ — 랜덤 길 ⑤)**: `render.isTrapGateRow(row)`(= 셸 `main.isFixedGateRow`, 판정식은 `render.js` 한 곳에만 둔다)가 참인 행은 **일반 게이트가 아니라 붉은 봉쇄 장치**로 그린다.
  - **그리는 것**: 칸 폭을 가로지르는 **굵은 붉은 봉쇄 바 + 대각 줄무늬**(`drawTrapBar`, 칸 테두리도 경고색 `C.warn`) · 칸 왼쪽의 **큰 자물쇠**(`drawLockBadge(x, y, 1.4)`) · 칸 **위**의 배지 **"쏴도 안 줄어듦"**(`render.TRAP_BADGE_TEXT`) · 숫자 **−10 은 바 위에 통과 전 불투명도(0.92)로 선명하게** · 칸 아래 **'확정' 꼬리표**(종전 그대로).
  - **그리지 않는 것**: 회색 빗금 셔터 판 · 사격 개시선과 그 옆 글 · 작은 잠김 자물쇠 · **닫힌 동안의 '가까워지면 열림'**(셸이 애초에 띄우지 않고, 렌더도 `armed` 전에는 이 행의 짧은 글을 그리지 않는다). '가까워지면 열린다'는 이 행에서 지킬 수 없는 약속이라, 셔터를 배운 사람이 같은 모양에 다시 속는다.
  - **배지 자리**: 칸 **위**(짧은 글보다 더 위). ⚠️옆 차선에 두면 반대편 통로의 보급 통·벽에 가려진다(2026-09-17 렌더 실측).
  - **통과 뒤**: 배지는 떼고 **봉쇄 바는 행 기본 불투명도(0.32)로 흐리게 남는다** — '여기서 잃었다'가 화면에 남는다.
  - **소리·튐**: 탄이 맞으면(`gateBlock`·`gateHit` 모두) **붉은 스파크 + 둔탁한 차단음 `trapHit`**. 셔터의 금속 튕김(`gateClang`)·숫자 증가음(`gateTick`)·흰 플래시는 쓰지 않는다 — 값이 오르지 않는 칸에 '올랐다'는 신호를 내지 않기 위해서다.
  - **⚠️단, 이 전용 표현은 '?' 상자가 걷힌 뒤부터다(r3.7 수정 라운드 1).** 확정선 전에도 비행 중인 탄은 막히므로(`gateBlock`), 그 막힘에 붉은 스파크·`trapHit` 를 쓰면 **플레이어가 통로를 고르기 약 300px(≈1.6초) 전에 '이번 판은 함정'임을 소리·색으로 알아낸다**(실측: 확정선 5940 인 판의 첫 `gateBlock` 이 `run.z` 5637). 그것은 §3-9 '확정 전에 내용이 새지 않는다'와 정면으로 어긋나고, 결정 ③ 이 지키려던 '아는 쪽 vs 모르는 쪽' 저울을 무너뜨린다. 그래서 셸은 공개 전에는 **함정도 꽝 게이트와 똑같이** `gateClang` + 회색 스파크를 쓴다(`main.trapShown(id)` = `!hiddenRow(id) && isFixedGateRow(row)`). 화면도 같다 — 행 자체가 '?' 상자 뒤에 가려 그려지지 않는다.
  - **열릴 때**: 규칙상 `armed` 는 그대로 바뀌므로 짧은 글 **"쏴도 그대로예요"**(`GATE_TIP_OPEN_FIXED`)와 `gateOpen` 소리는 종전대로 난다(배지와 같은 말을 한다).
  - 검사: `V3-RENDER-TRAP`(그리기 호출로 셔터 경로를 타지 않음·봉쇄 표현·통과 뒤 잔상·대조군 −15) · `V3-SHELL-TRAP`(차단음·닫힘 안내 제외) · `V3-LOTTERY LOT-6b`(뽑는 쪽 `trap` 과 그리는 쪽 판정 일치). 육안 = `newmode/v3/build6/shot-trap-*.png`.
- **첫 셔터 조우 안내(r3.6, N2-⑥)**: `armZ` 가 있는 행이 **처음 화면에 들어온 그 시점**에 배너 1회(`main.SHUTTER_GUIDE_TEXT`, `BAL3.fx.shutterGuideSec` 3초, y 332). **문구는 줄 배열(2줄)**이다 — 한 줄로 쓰면 480px 화면에서 양끝이 잘린다(2026-09-17 렌더 실측). 줄은 **어절 경계에서만** 나눈다. **판당이 아니라 사용자당 1회** — 저장 `seenShutter`(§7)에 기억한다. ⚠️**S1 첫 게이트(`armZ: null`)는 항상 열려 있어 셔터가 아니다** — 그 행으로는 뜨지 않는다(그 안내만 보고 셔터를 배울 수 없다). 랜덤 길 게이트는 '?' 상자가 걷힌 뒤에만 센다.
- **보급 차폐·통로 표지(r3)**: `run.z < s.coverZ` 인 통은 회색 막을 덮고, 도로 위 `coverZ` 위치에 **개방선**(청록 점선)을 그린다. 벽의 **확정선**(`z0 − 60`)은 회색 실선으로 따로 그려 **"통로가 정해지고 잠시 뒤에 차폐가 걷힌다"**를 화면에 남긴다(두 줄의 색이 다르다). 벽 앞머리(`z0`)에는 `wall.signs` 를 좌·우 아이콘+숫자로 그린다.
- **확정 손실 칸(r3.4 수정 라운드 2)**: 칸의 `maxValue`가 자기 값 이하이고 값이 음수면(= 쏴도 오르지 않는 칸, 랜덤 길 ⑤) 숫자 아래에 같은 색 **'확정' 꼬리표**를 붙인다. 흰 플래시는 그대로 나되 숫자가 안 움직이는 이유를 화면에 남기기 위한 것이다. **행 전체가 이런 칸이면(`main.isFixedGateRow`) 열림 안내도 '쏴도 그대로예요' 로 바뀐다(r3.6 수정 라운드 1)** — 꼬리표와 안내가 같은 말을 한다.
- **랜덤 길(r3.4, §3-9)**: 벽 `w3` 앞머리의 우측 표지는 금색 **'?' + '랜덤'**. 확정선(`run.lottery.revealZ`) 전에는 우측 통로의 실제 물체(통 또는 게이트 행)를 **그리지 않고** 금색 테두리의 회색 **'?' 상자**로 덮는다(`drawLotteryBox`). 확정을 넘는 프레임에 셸이 `fx.lotOpen = BAL3.lottery.openT`(0.25s)를 켜고 상자가 옅어지며 걷힌다. 같은 프레임에 효과음 **1회** — 좋음 `gateFlip` / 꽝 `hurt` 재사용(`fx.lotSeen` 으로 한 번만). 결과 화면에는 제목 아래(y 212)에 금색 **랜덤 길 한 줄**(`lotteryLine`)을 제안 한 줄과 **별도 줄**로 그린다. 무기 통이 동급이라 교체되지 않은 판은 셸이 `fx.lotSame` 을 켜 문구가 '획득'이라 거짓말하지 않게 한다.
- **[다시 도전] 아래 부연(r3.7 · 이사 결정 ①)**: 랜덤 길이 있는 판(= 결과에 랜덤 길 한 줄이 있는 판)에서만 [다시 도전] 버튼 **아래**에 작은 금색 한 줄 **"랜덤 길은 새로 추첨"**(`render.RETRY_LOTTERY_NOTE`, 버튼 가운데 정렬 · 버튼 아래 16px). 재도전은 **배치는 같고 랜덤 길만 다시 뽑힌다**는 뜻이다(§3-9 시드 정책 — 이사 결정으로 유지). 셸은 이 한 줄이 들어갈 자리(22px)만큼 **아래 버튼([다음 작전]·[스테이지 선택])을 내린다** — 안 내리면 글이 다음 버튼에 깔린다. 검사 **`V3-SHELL-RESULT-LAYOUT`**(셸의 자리 계산 — 실제로 한 판을 굴려 그린 결과 화면에서 부연의 글 y 와 아래 버튼 상자의 top 을 꺼내 비교 · 대조군은 기본 자리 548·620). 부연이 [다시 도전] 아래·가운데에 그려지는 **표현** 쪽은 `V3-RENDER-TRAP`. ⚠️`V3-RENDER-TRAP` 는 `buttons` 를 **직접 만들어 넣어** 그리므로 셸의 자리 계산을 밟지 않는다 — 옛 계약서가 이 문단 전체를 그 검사로 잠근다고 적은 것은 틀렸다(2026-09-17 수정 라운드 3: `noteGap` 을 0 으로 지워도 241건이 전부 통과했다, 실측).
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
- 오디오 이벤트: fire(무기별, 프레임 1회, 볼륨 = min(1, 0.4 + count/40)), crateHit, crateBreak, gateTick, gateFlip, **gateOpen(셔터 열림, 행마다 1회)**, **gateClang(닫힌 셔터에 막힌 탄, r3.6)**, joinMany(3명 이상 합류), weaponSwap, hurt, kill, elite, win, lose. `supplyBlock` 은 **소리 없이** 화면 튐만. **랜덤 길 공개(r3.4 · r3.6 개정)는 판당 1회** — 좋음이면 `gateFlip`, **꽝이면 중립 경고음 `lotWarn`**(r3.6: 이전에는 `hurt` 를 재사용해 무력화 성공까지 '맞았다'로 들렸다). **함정 게이트에 막힌 탄은 둔탁한 차단음 `trapHit`**(r3.7 — 셔터의 `gateClang` 과 다른 계열이라 '잠깐 막힌 것'과 '아예 안 먹히는 장치'가 소리로도 구분된다). 새 이름은 모두 `rush3/audio.js` 의 `SFX` 맵에서 **실존 파일**로 간다(`gateClang` = `nf_sfx_shield_pop_1·2` · `lotWarn` = `nf_sfx_telegraph_1` · `trapHit` = `nf_sfx_hit_1·2`, 새 음원 파일 없음).

## 7. 저장(`save.js`)

- 키 `starforgeRush.v3`: `{ v: 3, stages: { [id]: { versions: { [key]: { cleared, attempts, bestSurvivors, bestTime } } } }, lastStage, difficulty, volume, mute, seenShutter }`. **`seenShutter`(r3.6, boolean)** = 첫 셔터 조우 배너를 이미 본 적이 있는가(§6). 형식이 아니면 `false` 이고, 옛 저장(이 필드가 없는 저장)도 `false` 라 **안내가 한 번 더 뜬다**(본 적 없는 안내를 본 것으로 치지 않는다). **기록 칸 키 `key`(r3.3) = `${stageVersion}`(normal — 접미 없음, 옛 기록 칸 그대로) | `${stageVersion}:${difficulty}`(어려움 `2:hard`·지옥 `2:brutal`)**. `recordKey(version, difficulty)` 가 단일 조립점. 최상위 `difficulty` = 타이틀에서 마지막으로 고른 난이도(문자열이면 그대로 저장, id 판정은 셸 `normDifficulty`). **이 값이 없거나 문자열이 아니면 `brutal`(타이틀 초기 선택, `save.js` 의 `PICK_DEFAULT`)** — 2026-09-16 이사 결정. **기록 칸 키의 접미 기준(`BASE_DIFFICULTY = 'normal'`)은 그대로다**: 초기 선택이 지옥(`brutal`)이어도 옛 저장의 접미 없는 칸(normal 기록)은 손대지 않고 그대로 남고, 플레이어가 '보통'을 고르면 다시 그 칸에 쌓인다.
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
- **V3-SIM-DIFF(r3.3, `SD-0~5`)**: 난이도 3 × 스테이지 3 × 정책(aim·center·plan) = **27판**, 결과표를 `t.diagnostic` 으로 출력(보고서가 그 출력을 인용). ⓪ 전부 상한 안 종료 ① normal 종전 그대로(aim 3완주·center S1 만) ② hard: aim S1·S3 완주, **S2 는 정예 등장까지 도달하고 지더라도 정예전에서만 진다(기록)** ③ brutal: aim S1 정예 도달(정예전 결과는 기록), S2·S3 결과만 기록 ④ center 는 hard·brutal S2·S3 실패 유지 ⑤ 같은 봇이면 생존 normal ≥ hard ≥ brutal·손실 반대·peak 은 난이도로 늘지 않는다. **원래 합격선(aim 이 hard 3스테이지·brutal S1 완주)은 출발값 표에서 성립하지 않아**(3-8 봇 실측) ②③ 을 '기록' 으로 낮췄다 — 표를 바꾸지 않고 사실을 적는 쪽을 택했다. **SD-2·SD-3 의 '도달' 검사는 이름·목적 그대로 둔다**(경로 진행 확인용).
- **V3-SIM-DIFF 성공 경로(r3.5, `SD-7~9`)**: 위 27판 표와 **목적이 다른** 검사 — '이길 수 있는 조작이 하나라도 있는가'. 봇 = `planBoss`(`tests/lib/rush3-policies.mjs` `botPlanBoss`: 보스 등장 전 = `botPlan`, 보스가 있으면 `pointerX = run.boss.x`. 이동은 실제 STEP 속도 제한, 탄 회피 없음. `POLICIES` 목록에는 넣지 않아 24판·27판 표의 판 수는 그대로다). ⑦ **잠금** — hard S1·S2·S3 와 brutal S1 을 `won === true`·생존 병력 > 0 으로 완주하고, hard S2 생존 5명·brutal S1 생존 10명이 **2차 검수 표와 일치**한다 ⑧ **기록** — brutal S2·S3 는 실패를 허용하되 상한 안 종료·정예 등장 도달·지더라도 정예전에서만 진다를 확인하고 결과(완주 여부·정예 잔여 hp)를 `t.diagnostic` 으로 남긴다 ⑨ planBoss 는 보스 등장 전까지 `plan` 과 같은 판이다 — normal S1 은 판 전체가 같고, 여섯 판(hard·brutal × S1~S3) 모두 `peak` 이 `plan` 과 같다(정예전 조작은 성장 축을 바꾸지 않는다) + 결정성. ⚠️ 이 표도 **봇 1판의 결정적 결과**이지 사람의 성공률이 아니다.
- **V3-SAVE-VERSION DIFF(r3.3)**: `recordKey` 조립 규칙; hard/brutal 기록이 normal 칸을 덮지 않고 재로드·`patch({stages})` 뒤에도 칸 유지; 옛 저장(난이도 없음)은 키 그대로 normal 칸·hard 는 빈 기록이되 **초기 선택은 `brutal`**; 손상 케이스(`':normal'` 접미는 찬 칸을 덮지 않음·모르는 접미 보존·대소문자 잡키는 1); 최상위 `difficulty` **기본 `brutal`(타이틀 초기 선택)**·기억·형식 아니면 `brutal`(접미 기준 `BASE_DIFFICULTY` 는 `normal` 그대로). **셸 결선(`rush3-loop`)**: 토글 클릭·키 1/2/3 → 저장 `difficulty`; hard 출격 attempts·결과가 `${ver}:hard` 칸에만, normal 칸(도전 9회·최고 99명) 불변·화면에서만 빠짐; HUD·결과 화면에 '어려움' 표기, normal 에는 없음; 판 도중 숫자 키 무시; 다시 도전도 같은 난이도; 새 boot 가 마지막 난이도를 읽는다. **새 사용자 경로**: 저장 원문이 없으면 초기 선택·`dbg().difficulty` 가 `brutal`, 토글로 '보통'을 고르면 출격 기록이 **접미 없는 칸**(`${ver}`)에만 쌓이고 지옥 칸은 비어 있다(저장 원문 키에도 접미 없음). 셸 boot 스모크의 기록 칸도 같은 이유로 `${ver}:brutal`.
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
- **V3-GATE-ARM(r3, `ARM-1~7`)**: 닫힌 셔터(전방 341px)에 탄 10발 → 값 불변·탄 전부 흡수·`gateBlock` 10 / `gateHit` 0; `row.z − run.z <= 340`이 되는 STEP에 `gateArm` **정확히 1회**; `armed` 뒤에는 1발 = +1(상한·`gateFlip` 그대로); `armZ: null` 행은 생성 직후 `armed`이고 `gateArm` 없음; 스테이지별 지정(S1 g1 = null, 코스 행은 전부 340, **랜덤 길이 뽑은 게이트 행만 `z − openZ`**); **실측 회귀** 소총 1명 5발·기관총 1명 9발(±1); 셔터가 닫힌 동안 셔터보다 **먼** 적은 안 맞고 가까운 적은 정상 피격.
- **V3-SIM-POLICY(r3, `POL-1~9`)**: 8정책(center·center±1·left·right·sway·**aim**(탐욕)·**plan**(계획)) × 3스테이지 = **24판**을 `createRun/stepRun` 으로 돌린다(입력은 `{pointerX}` 만, 한 판 상한 14,400 STEP). ① 24판 전부 상한 안 종료 ② S1 `center` 성공 유지 ③ S2 `center` 실패·`plan`·`aim` 성공 ④ S2 `aim` 은 벽 쌍 중 정확히 1개만 `opened`·나머지 `skipped` ⑤ S3 `plan.peak >= 1.25 × max(left, right)` ⑥ 화력 지수(생존 × 무기 초당 dmg: rifle 2 / auto 4 / heavy 5)에서도 같은 배수 ⑦ **조합 금지**(고정 정책 5종은 연속증원 + 우 칸 상한, 중화기 + z6300 통을 동시에 못 얻는다 — 개수 상한이 아니다) ⑧ `plan.peak > sway.peak` 이고 `plan.peak >= aim.peak`, 구분 축은 **z4000 게이트 칸 선택**(탐욕 봇은 값이 큰 좌 +3, 계획 봇은 상한이 큰 우 −25 → +40) ⑨ **선택 C 저울**(3900 통을 열고도 우 칸 상한을 채운 판은 병력 상한 초과 예외로 기록만).
  > 이 표는 **봇 정책의 결과**다. **자동 시뮬 결과를 사람의 성공률로 옮겨 적지 않는다.** 1판 결정적 시뮬이라 분포도 아니다.
- **V3-SUPPLY-PAIR / COVER(r3)**: `PAIR-1` 쌍 중 하나를 열고 다른 하나를 지나면 `skipped`(파트너를 연 STEP이 아니라 **통 z를 지나는 STEP에만 1회**, 지나간 chain은 `locked`); `PAIR-2` 벽·차폐 없는 쌍은 둘 다 `missed`; `PAIR-3` 짝도 벽도 없으면 종전대로; `PAIR-4` 실제 S3 의 `p1`·`p2` 가 8정책 전부에서 최대 1개 + 합성 쌍(병력 5·10·15·25·40)도 최대 1개이고 **벽을 빼면 둘 다 열린다(대조군)**; `PAIR-4b` **확정 직전 대시 정책**(구간별 목표 x 스크립트를 `T = commitZ − 400 … commitZ` 로 훑고 좌→우·우→좌 양방향)에서도 동시 개봉 0건; `PAIR-4c` **`coverZ` 를 가진 모든 통**(배제 쌍 4 + 짝 없는 좌 통 `c9` + 랜덤 길 통 — 통이 나오는 시드로 S3 판을 더 만들어 함께 본다)의 `coverZ` 가 비행시간 보정선 공식(**1 STEP 지연 + 대형 깊이 `MAX_DY` 포함**)과 정확히 같고 검사한 통 개수까지 고정한다. **벽 밖 `coverZ` 는 선택 C 의 z3900 통(`c8`, 게이트 z4000 과 사격창을 나눠 쓰는 '저울' → 차폐선 = `4000 − gate.armZ` = 3660) 하나만 예외**로 허용한다(무기가 추가돼 `vzMin` 이 내려가거나 `unitCap` 이 올라가면 **이 검사가 먼저 실패한다**); `PAIR-5` 우 통로를 고르고 우 통을 못 깨면 좌 `skipped` · 우 `missed`; `COVER-1` 차폐 앞 탄 20발 → 내구 불변·전부 흡수·`supplyBlock` 20; `COVER-2` 개방 뒤 정상 개봉; `COVER-3` `coverZ` 가 null 이면 현행과 동일.
- **V3-STAGES 갱신(r3, `STG-1~9`)**: 세 스테이지 `version === 2`; 모든 게이트 행에 `armZ`(number|null)·`armed` 초기값; **좌우 분산**(통·칸 x 가 양쪽에 존재); **배제 쌍의 형식**(같은 `pairId` 정확히 2개·좌우 1개씩·둘 다 `coverZ` 와 벽 활성 구간을 함께 가짐) + **`coverZ` 를 가진 모든 통**(`pairId` 가 없는 `c9`·랜덤 길 통 포함)이 `coverZ` 가 **공식 값**(확정선이 아니다 — 1 STEP 지연·대형 깊이 포함)·통 z ≤ `wall.z1 − 4`·`coverZ < s.z`·한쪽 통로에서만 닿는 형상을 지킴(벽 밖 예외는 `c8` 하나, 검사한 통 개수도 고정); **표지와 내용 일치**; **회피 통로**(`corridorHw != null` 인 무리는 가장자리 간격 ≥ `2 × corridorHw + 10` 인 틈이 열마다 1개 이상); 스폰마다 `corridorHw` 필드; **인접한 두 벽 사이 이동 여유 ≥ 137px**.
- **V3-RENDER-HUD(r3.8, `tests/rush3-render.test.mjs`)**: HUD 상단 줄을 **실제 그리기 경로**로 한 프레임 그린 뒤, 캔버스에 찍힌 둥근 상자의 네 모서리(`arcTo`)에서 세 칩을 되살려 잰다. ① 난이도·무기·⏸ 의 **위 경계·아래 경계·높이·세로 중심·모서리 반경이 서로 같다**(자리표 `HUD_ROW` 의 값과도 같다) ② 칩 사이 간격과 오른쪽 여백이 일정하다(8 · 8 · 14) ③ 세 칸의 **글자 크기가 같고**(15px) 전부 칩 중심선에 찍힌다 ④ 왼쪽 `STAGE` 제목도 같은 중심선이고 `남은 거리` 는 아래 줄이다 ⑤ **⏸ 의 그려진 상자 네 변이 셸의 히트 영역(`main.HUD_BTN`)과 같고**, 그 값이 `HUD_ROW.box.pause` 와 deepEqual 이며, 상자가 **두 겹으로 그려지지 않는다**(⑥ 셸이 ⏸ 를 안 넘기는 상태에서는 칩도 글자도 없다). ⚠️자리표 상수만 읽는 정적 검사로는 못 잡는다 — 표를 그대로 두고 `drawHud` 안에서 y 를 하나만 손대도 통과하기 때문이다(돌연변이 확인: 난이도 칩만 y −5·h −6 → ① 실패 / 셸이 좌표를 직접 적음 → ①⑤ 실패).
- **V3-LOTTERY(r3.4, `LOT-1~10b`, `tests/rush3-lottery.test.mjs`)**: `LOT-1` 시드를 고정하면 `buildStage(3,{lotterySeed})` 두 번이 deepEqual(호출마다 새 객체)·시드를 생략하면 `LOTTERY_DEFAULT_SEED` 기준선·S1·S2 는 `stage.lottery === null`·시드 20개에서 서로 다른 결과가 나온다; `LOT-2` **시드 20개에서 풀 5종이 전부 최소 1회** 등장하고 풀 밖 결과가 없다(`idx` = 풀 인덱스, 좋음 3 : 꽝 2); `LOT-2b` **검사용 대표 시드 표 `SEED_OF` 의 키가 풀 id 와 정확히 일치**하고 각 시드가 실제로 그 항목을 뽑는다 + 좋음 3 / 꽝 2 의 **id 목록**을 고정한다 — 풀에서 항목을 빼거나 이름을 바꾸면 `SEED_OF[없는 id]` 가 `undefined` 가 되어 `buildStage` 가 **기본 시드로 조용히 폴백**하고, 그 루프는 다른 판을 한 번 더 검사하면서 통과해 버린다(2026-09-17 검수 지적 1: 삭제된 `rusher4` 를 돌던 꽝 2종 루프가 `badGate` 를 두 번 보고 `trapGate` 를 한 번도 안 봤다). `stageFor`·`LOT-7` 에도 `assert.ok(SEED_OF[id])` 가 붙어 있다; `LOT-3` **확정선 전 사격은 흡수**되고 내구·게이트 값이 불변(`supplyBlock` 20 / `gateBlock` 10, `supplyHit`·`gateHit` 0)이며 차폐·셔터가 열린 뒤에는 정상 처리(`gateArm` 정확히 1회) — 통 3종의 `coverZ`·게이트의 셔터 개방선이 **둘 다 `revealZ` 보다 뒤**임을 함께 잠근다; `LOT-4` 좋음 3종 보상(병사 통 내구 14 → 정확히 +8 · 중화기 내구 24 → 교체, 이미 heavy 면 `weaponSame` · 연속 증원 내구 8 → 발판 6 에서 최대 12 까지, 발판 x 330 = 우측 차선); `LOT-5` 꽝 게이트 `[252,400)` −15·상한 0 — 유효탄 15발에 0(gateFlip 1회)·그 뒤로 0 고정·0 통과는 무효과, 안 쏘고 통과하면 `|value| = 15` 손실(`badGatesPassed` 1); `LOT-3b` **실사격 회귀(양방향)** — ① 확정 직전까지 `x 239`에서 중화기로 쏘다가 **좌측**으로 확정하는 판(대형 80)을 시드 5종에서 돌려 반대편 랜덤 길에 `supplyHit`·`supplyOpen`·`gateHit` 가 **0건**임을 확인한다(**대조군**: 같은 판의 차폐선을 옛 공식으로 되돌리면 3건 이상 뚫린다). ② `x 241`에서 쏘다가 **우측(랜덤 길)** 으로 확정하는 판에서 **좌 통 `c9`** 에 `supplyHit`·`supplyOpen` 이 **0건**이다 — 대형을 상한(`squad.unitCap` 150)까지 채워야 공식이 전제한 `MAX_DY` 깊이가 나오고, **대조군**으로 `run` 객체의 `c9.coverZ` 만 옛 값 `6046` 으로 바꾸면 시드 5종 **전부**에서 뚫린다(내구 20 → 11). 공식 일치만 보는 검사로는 못 잡는 경로다; `LOT-6` 꽝 ⑤ 확정 손실 게이트 `[252,400)` −10·상한 −10 — 셔터가 열린 뒤 40발을 넣어도 값이 그대로이고(`gateFlip` 0 · `gateHit` 40) 통과하면 정확히 10 을 잃는다, `LOT-6b` **난이도 3종(보통·어려움·지옥) 전부** 우측 통로를 고른 판은 `lossByGate === 10`·좌측 선택보다 벽 끝(z 7200) 병력이 **15 이상 적다**·그래도 완주는 된다(결과표는 `t.diagnostic`); `LOT-7` **좌측 통로를 고르면 랜덤 길 통은 `skipped`(`missed` 아님)** 이고 결과 한 줄이 이번 판 내용을 공개, `LOT-7b` 우측을 고르면 획득/꽝/동급 무기 문구가 그대로 나오고 좌 통(c9)이 `skipped` 가 된다; `LOT-8` **`stepRun` 이후 소스에 `lottery`·'랜덤 길' 참조 없음**(정적) + 규칙 모듈 6개에 `Math.random`·rng import 없음; `LOT-9` **봇 회귀** — S3(normal) 시드 5종에서 `plan`·`aim` 완주 유지, `center` 실패 유지, `plan` 은 매번 w3 좌측이고 생존·최고·무기가 시드와 무관하게 같다(결과표는 `t.diagnostic`); `LOT-10` **`w3` 구간(z 5400~7200) 통·게이트의 `hint` 에 빈 길 시절 표현이 없다**(`빈 길`·`아무것도 없`·`보상 0`·`안전하지만`) + 표지 `signs.R.kind === 'lottery'` 와 좌 통 `hint` 의 '랜덤 길' 이 함께 있다, `LOT-10b` 좌 통을 놓친 판의 `adviceLine` 이 그 `hint` 를 그대로 내보낸다(문구가 죽은 데이터가 아님을 실제 출력 경로로 확인); **`LOT-11`(r3.6)** 우측 통로를 고른 판을 풀 5종 전부 실제로 굴려 **문구가 적용 결과와 일치**함을 잠근다 — `badGate` = `위험 게이트 무력화 · 손실 0`(쏴서 0 으로 만든 뒤 통과, `lossByGate === 0`), `trapGate` = `함정 피해 −10명`, `chain6` = `증원 발판 n/m개 확보`, `soldier8` = `병사 8 획득`, `heavy` = `중화기 획득`, 그리고 **어느 문구도 `랜덤 길: 꽝 …` 으로 끝나지 않는다**(결과표는 `t.diagnostic`); **`LOT-6c`(r3.7)** 뽑는 쪽의 표식(`stage.lottery.trap`)과 그리는 쪽의 판정(`render.isTrapGateRow`)이 풀 5종 전부에서 일치하고 **확정 손실은 `trapGate` 하나뿐**이다(둘이 갈라지면 함정 외형이 엉뚱한 칸에 붙는다); `LOT-11b` `collectLotteryOutcome` 은 **id 가 랜덤 길 것인 이벤트만** 센다(좌 통 `c9`·코스 게이트 `g1` 의 같은 종류 이벤트는 집계되지 않는다)·랜덤 길이 없는 판은 집계 자체가 없다. `LOT-7b` 도 같은 경로로 바뀌었다 — 이제 **실제 결과 문구**를 단언한다(중화기 중복 판은 선택 B 우측에서 중화기를 먼저 든 실제 노선으로 만든다).
- **V3-SHELL-LOTTERY(r3.4, `tests/rush3-loop.test.mjs`)**: 셸의 시드 조립 결선. `deps.dateNow` 를 고정해 ① 같은 시각·같은 `attempts` 면 시드·추첨·결과 한 줄이 재현되고 ② 시각이 다르면 시드가 달라지며 ③ **재도전(같은 시각, `attempts` +1)도 새 시드**를 받고 ④ 시각 12개에서 시드 12개·추첨 2종 이상이 나오며 어느 판도 `LOTTERY_DEFAULT_SEED` 로 고정되지 않는다. **규칙 계층 검사(V3-LOTTERY)는 시드를 직접 넣으므로 이 결선이 빠지면 `main.js` 에서 `lotterySeed` 인자를 지워도 전부 통과한다** — '판마다 다르다'를 잠그는 것은 이 검사뿐이다.
- **V3-RENDER-SHUTTER(r3.6, `tests/rush3-render.test.mjs`)**: 표현 검사. 캔버스 호출을 **순서·불투명도까지 기록**하는 ctx 로 실제 `createRenderer3().draw()` 를 돌린다(정적 검사로는 '무엇이 무엇 위에 그려지는가'를 못 잡는다 — 그리기 순서가 곧 가림이다). ① 닫힌 셔터 프레임에 두 칸 숫자(`+1`·`−20`)가 **셔터 판 fillRect 보다 뒤에**(= 위에) `globalAlpha 0.92` 로 그려진다 ② 잠금 아이콘(`arc`)이 닫힌 칸마다 있고 열린 프레임에는 0 ③ 걷히는 중(`fx.gateOpen` = openT/2)의 클립 사각형이 **칸 위쪽 모서리에서 시작해 높이 절반** 이다(아래로 걷히면 이 단언이 깨진다) ④ 개시선 옆 글이 그려지고 `ARM_LINE_TEXT` 에 '넘으세요' 계열 표현이 없다 ⑤ `fx.gateTip`·`fx.shutterT` 가 시키는 대로만 짧은 글·배너를 그린다(타이머 0 이면 안 그린다) ⑥ **(수정 라운드 1)** 확정 −10 행이 열린 한 화면에 `'확정'` 과 `'지금 쏘면 +1'` 이 **함께 있지 않다** — 실제 랜덤 길 판(`trapGate` 시드)을 우측 통로로 굴려 셔터가 열린 프레임을 그리고, 문구는 `isFixedGateRow` 가 고른 값을 그대로 쓴다(대조군 `badGate` = 꼬리표 없음 · '지금 쏘면 +1' 유지).
- **V3-SHELL-SHUTTER(r3.6, `tests/rush3-loop.test.mjs`)**: 셔터 안내의 셸 결선. 규칙은 `gateArm`·`gateBlock` 만 알리므로 **언제 무슨 글·무슨 소리인가는 전부 셸**이다 — 이 결선이 빠지면 V3-RENDER-SHUTTER 가 다 통과해도 화면에는 아무 안내가 안 뜬다. ① S2 첫 게이트가 화면에 들어오면 `fx.gateTip.g1 = '가까워지면 열림'` + 첫 조우 배너 + 저장 `seenShutter === true` ② 닫힌 셔터에 막힌 탄이 `gateClang` 을 낸다 ③ 열리는 순간 `gateOpen` 효과음 + `'지금 쏘면 +1'` ④ **같은 사용자의 다음 판에는 배너가 다시 뜨지 않는다**(짧은 글은 그대로) ⑤ **S1 첫 게이트(`armZ: null`)를 지나도 `seenShutter` 는 `false`** 이고, 셔터가 걸린 S1 둘째 게이트에서 비로소 뜬다 ⑥ **(수정 라운드 1)** 랜덤 길 확정 −10 행이 열릴 때의 글은 `GATE_TIP_OPEN` 이 **아니고** `GATE_TIP_OPEN_FIXED` 다(같은 코드 경로의 대조군 = 상한 0 인 `badGate` 행은 종전 문구 유지) ⑦ `isFixedGateRow` 단위 검사 — 빈 행·혼합 행·양수 행은 거짓.
- **V3-SHELL-LOTTERY-OUT(r3.6, `tests/rush3-loop.test.mjs`)**: 결과 문구가 실제 결과를 읽는 결선. ① 출격이 `run.lotteryOutcome` 을 만들고(S1 은 `null`) ② 확정 −10 이 걸리는 시각을 골라 우측 통로로 가서, **공개 프레임에 난 소리만 따로 보아** `lotWarn` 이 있고 `hurt` 는 없음을 확인하고 ③ 게이트를 통과하는 프레임에 `hurt` 가 나며 `applied === -10`·문구가 `랜덤 길: 함정 피해 −10명` 임을 확인한다. **셸이 집계를 걸지 않으면 문구는 추첨 이름으로 조용히 되돌아간다** — 그것을 잡는 검사는 이것뿐이다.
- **V3-RENDER-TRAP(r3.7, `tests/rush3-render.test.mjs`)**: 함정 외형(§6). 같은 기록 ctx 로 **실제 랜덤 길 판**(`trapGate` 시드)을 우측 통로로 굴려 세 시점의 프레임을 그린다. ① **공개 뒤·개시선 전** — 셔터 판 fillRect 0건·개시선 글 없음·셸이 넣어 둔 `'가까워지면 열림'` 도 안 그림, 대신 붉은 봉쇄 바(경고색 `strokeRect`)·자물쇠 배율(`scale > 1`)·배지 `'쏴도 안 줄어듦'`·`'−10'`·`'확정'` 이 있고 숫자는 `globalAlpha 0.92` 로 **바보다 뒤에**(= 위에) 그려진다 ② **대조군 `badGate`** — 셔터 판·개시선 글·`'가까워지면 열림'` 이 종전대로 있고 봉쇄 바·배지는 0건 ③ **통과 뒤** — 봉쇄 바가 `globalAlpha 0.32` 로 남고 배지는 사라진다 ④ **결과 화면** — 랜덤 길 한 줄이 있는 판에만 `[다시 도전]` 버튼 **아래**(y > 버튼 아래끝, 버튼 가운데 정렬)에 `'랜덤 길은 새로 추첨'` 이 그려진다.
- **V3-SHELL-TRAP(r3.7, `tests/rush3-loop.test.mjs`, 2건)**: 함정의 셸 결선. 확정 −10 이 걸리는 시각을 고정해 실제로 굴리되, 소리를 **'?' 가 걷히기 전 / 걷힌 뒤·개시선 전** 두 창으로 나눠 모은다(`trapWindows` 헬퍼 — 창을 나누는 기준은 셸이 실제로 보는 값, 즉 **프레임을 돌린 뒤의 `run.z`**).
  - **① 함정의 표현**: **공개 뒤·개시선 전** 창에서 막힌 탄이 **`trapHit`** 를 내고 `gateClang` 은 나지 않는다 ② 공개된 뒤에도 닫힘 안내(`'가까워지면 열림'`)를 **띄우지 않는다**(`fx.gateTip[rowId]` 가 열릴 때까지 비어 있다) ③ 열린 뒤 맞는 탄도 `trapHit` 이고 `gateTick` 이 없으며 `fx.gateFlash` 가 비어 있다.
  - **② 공개 전 누출 금지(수정 라운드 1)**: 같은 판을 `trapGate`·`badGate` 두 시드로 굴려 **확정선 전 창의 소리 집합이 두 판에서 같고**(`gateClang` 만 있고 `trapHit` 0건), 갈라지는 것은 공개 뒤부터임을 잠근다. **창이 비면 공짜로 통과**하므로 '확정선 전에 들린 소리가 있다'를 먼저 단언한다.
  - ⚠️소리·안내는 규칙이 아니라 셸이 고르므로 렌더 검사만으로는 잡히지 않는다. ⚠️**창을 나누지 않은 옛 ① 은 공개 전 이벤트만으로도 통과했다** — 바로 그 통과가 이번 누출을 덮고 있었다(2026-09-17 수정 라운드 1 지적 1).
- **V3-SHELL-RESULT-LAYOUT(r3.7 수정 라운드 3, `tests/rush3-loop.test.mjs`, 2건)**: 결과 화면 버튼 자리의 셸 결선(§6 · [다시 도전] 아래 부연). 봇으로 **S3(랜덤 길이 있는 판)** 를 결과 화면까지 굴린 뒤 한 프레임을 좌표까지 기록해, 찍힌 `RETRY_LOTTERY_NOTE` 의 y 와 그 아래 버튼([스테이지 선택]) 상자의 top 을 그리기 호출에서 되살려 `글 y + 4 <= 버튼 top` 과 **내려온 양 = 22px**(552 → 574)을 단언한다. 대조군은 랜덤 길이 없는 **S1** — 부연이 없고 버튼이 기본 자리(480·548·620) 그대로다.
  - ⚠️표현 검사(`V3-RENDER-TRAP`)는 `buttons` 를 직접 만들어 넣으므로 **셸의 `noteGap` 을 한 줄도 밟지 않는다**. 이 검사가 없던 동안 `noteGap` 을 0 으로 바꿔도 241건이 전부 통과했다(실측) — 실게임에서만 부연이 아래 버튼에 깔린다.
  - 버튼 상자는 `drawButtons` 가 글자 **앞에** 그리는 둥근 상자 두 겹(`roundRect` = `moveTo` + `arcTo`×4)에서 되살린다(주 버튼은 안쪽이 1px 작으므로 바깥쪽이 셸이 정한 자리). 좌표 기록은 **그 한 프레임만** 켠다(수천 프레임을 도는 다른 검사의 메모리 보호).
- **V3-GRUNT-STRAIGHT(r3)**: `grunt.track === 0`이고, 부대가 좌우로 크게 움직여도 잡졸 `x` 가 변하지 않는다.
- **V3-HINT(r3, `tests/rush3-advice.test.mjs`)**: `adviceLine(run, stage)` 이 6장 우선순위대로 결정적으로 고르고, **`skipped` 통은 후보에서 제외**되며, 실제 배치의 통·게이트가 `hint` 문구를 갖는다.
- **V3-HINT-N1(r3.6)**: 안내는 **그 판에서 실제로 할 수 있는 행동**이어야 한다. 우측 고정 봇으로 S2 를 굴려 검수가 재현한 실패(첫 게이트 −20 칸 통과 · `lossByGate 2` · 약 6초 종료)를 만든 뒤, 제안 한 줄이 배치의 새 문구(`첫 갈림길은 왼쪽 +칸으로 통과하세요…`)로 나오고 **옛 표현('병력이 더 모인 뒤')이 배치에도 기본 문구에도 없음**을 확인한다. 기본 문구(`ADVICE_DEFAULT.gate`)도 같은 기준으로 바뀌었고, 행에 `hint` 가 있으면 언제나 그것이 이긴다(우선순위 1의 뜻).
- V3-SIM: 봇(가장 가까운 통/양수 칸 차선으로 tx 이동) S1·S2·S3 완주; 무조작 봇(tx 240 고정) S1 완주; 정예 격파 후 1 STEP 안에 won.
- V3-SIM-NOOP: 무조작 봇(tx 240 고정)은 S2·S3 에서 실패(units 0 → over, won 아님, 실패 z < length, peak 는 조준 봇 peak 의 1/4 미만).
- V3-WIN: 정예 격파 즉시 won; 정예 없는 스테이지는 length 도달·적 없음.
- V3-SAVE: 새 저장/`"abc"`/`{v:1,best:3}`/`{v:3,stages:null}`/`{v:3,stages:{1:{attempts:"x"}}}`/setItem 예외 → 전부 진행 가능, ok 플래그. **`seenShutter`(r3.6)**: 새 저장은 `false`, `true` 로 쓰면 재로드·다른 필드 patch 뒤에도 남고, 형식이 아니면(`'yes'`) `false`, 옛 저장(필드 없음)도 `false`.
- **V3-AUDIO(r3.6 보강 · r3.7 수정 라운드 2)**: `SFX_NAMES3` 에 `gateOpen`·`gateClang`·`lotWarn`·**`trapHit`**(r3.7) 이 있고, **`SFX_FILES3` 의 모든 파일이 `assets/sound/` 에 실제로 존재**한다(없는 파일을 매핑하면 소리가 조용히 사라진다 — 브라우저에서만 드러난다).
  - **⚠️이름 목록은 이 소리들의 유일한 안전망이다(수정 라운드 2).** 소리 이름이 `SFX` 맵에서 통째로 사라지는 사고는 **다른 어떤 검사도 잡지 못한다** — 파일 존재 검사는 `SFX_NAMES3` 를 순회하므로 이름과 함께 사라지고, 셸 검사(`V3-SHELL-*`)의 가짜 오디오는 `sfx(n)` 에 모르는 이름이 와도 `true` 를 돌려준다. 그래서 새 소리를 추가할 때는 **반드시 이 `need` 목록에도 이름을 적는다.**
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
