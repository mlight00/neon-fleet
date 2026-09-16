# 스타포지 러시 v3 — 난이도 선택(보통/어려움/극한) 구현 보고 (2026-09-16)

저장소 `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar`(브랜치 `claude/starforge-v3`, HEAD a69423d 위 **미커밋** 작업). 기존 `rush/*`·`rush.html`·`tests/rush-*` 무수정(git diff 0줄). 커밋·푸시·배포 없음.

**한 줄 요약.** 타이틀에서 난이도(보통/어려움/극한)를 고르면 적 체력·적탄·접촉·정예·스폰 수만 배수로 오르고(성장 축은 그대로), 기록은 난이도별 칸에 따로 쌓인다. 배수는 출발값 표 그대로 두었고, **요구 5 의 봇 합격선(aim 이 hard 3스테이지·brutal S1 완주)은 이 표에서 성립하지 않아**(hard S2·brutal S1 정예전 전멸) 검사는 그 두 판을 '기록'으로 낮췄다 — 표를 바꾸거나 봇을 손보지 않고 사실을 적는 쪽을 택했다(§3).

---

## 1. 배수 표(출발값 — `rush3/balance.js` `BAL3.difficulty`, 변경 없음)

| id | 표기 | enemyHp | eshotDmg | touchDmg | eliteHp | spawnCount | eliteFireRate |
|---|---|---|---|---|---|---|---|
| normal | 보통(HUD 표기 없음) | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 |
| hard | 어려움 | ×1.5 | ×2 | ×2 | ×1.6 | ×1.4 | ×1.25 |
| brutal | 극한 | ×2.2 | ×3 | ×3 | ×2.4 | ×1.8 | ×1.5 |

실제 값(반올림): 잡졸 hp 2/3/4 · 돌격체 4/6/9 · 저격수 6/9/13 · 적탄 dmg 1/2/3(**어려움부터 1발 = 병사 1명**) · 접촉 잡졸 1/2/3 · 돌격체 2/4/6 · 정예 3/6/9 · 정예 hp S1 120/192/288 · S2 220/352/528 · S3 500/800/1200 · 정예 발사 주기 1.0/0.8/0.667 s · rows 스폰(S3 z8800 잡졸) 18/25/32. 게이트·보급·무기·병사 hp·armZ·coverZ·벽·시작 병력은 손대지 않았다.

**적용 시점.** `buildStage(id, { difficulty })` 가 `stage.difficulty`·rows 스폰 n·정예 hp 를 박고, `createRun(stage)` 가 `run.difficulty` 와 `run.enemyDefs`(BAL3.enemies 에 배수를 한 번 적용해 동결한 표)를 만든다. `stepRun` 이하는 `run.enemyDefs` 만 읽어 **STEP 안에 난이도 분기가 없다**(DIFF-6 정적 검사). normal 은 `buildStage(id)` 와 deepEqual — 기존 검사 174건이 무수정으로 통과한다.

**근거·검수 조항과의 관계(계약서 §3-8 에 기록).** 이사 실플레이 3회 소감 "가만히 있으면 손해는 나지만 난이도가 너무 낮아 완전 쉽다". 검수의 "적 HP 상향으로 F2 해결 금지·숨은 감쇠 금지"는 구조 문제를 수치로 덮거나 몰래 깎는 것을 막는 조항이고, 난이도 선택은 F2 구조 해결(r3) 위에 얹히는 **명시적 선택**(타이틀·HUD·결과·기록에 표기)이라 충돌하지 않는다.

## 2. 봇 결과표 — **봇 정책의 결과이지 사람의 성공률이 아니다**(1판 결정적 시뮬, 분포 아님)

`node --test tests/rush3-difficulty.test.mjs` 의 `V3-SIM-DIFF SD-0` 진단 출력 그대로(난이도 3 × 스테이지 3 × 정책 3 = 27판, 판당 상한 14,400 STEP). aim = 탐욕 봇(가까운 통·큰 칸으로 이동, 비키지 않음) · center = 무조작(x 240) · plan = 설계 경로 스크립트.

| 난이도 | 스테이지 | aim | center | plan |
|---|---|---|---|---|
| normal | S1 | **완주** 19명(peak 20, 42.3s) | **완주** 14명 | **완주** 14명 |
| normal | S2 | **완주** 13명(peak 23, 피격손실 10) | 실패 z1143 | **완주** 30명 |
| normal | S3 | **완주** 48명(peak 51) | 실패(정예 377 잔존) | **완주** 79명 |
| hard | S1 | **완주** 9명(peak 20, 피격손실 11, 48.8s) | **완주** 11명 | **완주** 11명 |
| hard | S2 | 실패 — 정예까지 도달, 정예전 전멸(정예 217/352 잔존, 피격손실 23) | 실패 z1143 | 실패(정예 97 잔존) |
| hard | S3 | **완주** 33명(peak 51, 피격손실 18, 71.3s) | 실패(정예 763 잔존) | **완주** 71명 |
| brutal | S1 | 실패 — 정예까지 도달, 정예전 전멸(정예 55/288 잔존, 피격손실 20) | 실패(정예 11 잔존) | 실패(정예 11 잔존) |
| brutal | S2 | 실패(정예 418/528 잔존) | 실패 z1143 | 실패(정예 308 잔존) |
| brutal | S3 | 실패(정예 36/1200 잔존, peak 51, 91.0s) | 실패(정예 1172 잔존) | **완주** 63명(peak 78) |

읽는 법: 세 봇 모두 **코스는 끝까지 지나 정예에 도달**하고, 지는 판은 전부 **정예전**에서 진다(적탄 1발 = 병사 1명이 되면서 정예 부채꼴 3발/초를 그대로 받는 봇의 화력이 먼저 소진). 같은 봇이면 생존 병력이 normal ≥ hard ≥ brutal 로 줄고(SD-5), 최고 병력(peak)은 난이도로 늘지 않는다(성장 축 불변). 무조작은 hard·brutal 에서 S2·S3 실패가 유지된다(SD-4).

## 3. 요구 5 의 봇 합격선과 다른 점 — 왜 표를 그대로 두었나

요구: "aim 봇 normal·hard 3스테이지 완주, brutal S1 완주". 실측: **hard S2 실패, brutal S1 실패**(위 표). 배수 표를 지키면서 합격선을 맞출 수 있는지 **정예 배수만** 탐색했다(`elite-search.py` → `elite-search-log.json`, balance.js 를 임시로 바꿔 돌린 뒤 원문 복원):

- hard: eliteHp 1.6→1.0 × eliteFireRate 1.25→1.0 **28조합 전부 실패**(가장 낮은 1.0/1.0 에서도 aim 이 정예 56 잔존으로 전멸). 즉 정예 노브로는 해결이 안 되고, 원인은 **eshotDmg 2** 와 '옆으로 비키지 않는 봇' 의 조합이다(소총 21명 × 2 dps = 42 dps 로 시작해 1초에 3명씩 줄면 220 hp 도 못 깎는다 — 42t − 3t² 의 최대가 147). `plan` 봇도 같은 이유로 진다.
- brutal S1: eliteHp **1.8**(fireRate 1.5 유지)이면 aim 이 5명 남기고 완주(2.0 은 정예 7 잔존으로 실패). 2.4 는 55 잔존.

선택지(이사님 결정): ① **표 유지**(현재 구현) — 사람은 정예 부채꼴을 옆으로 비킬 수 있고 S2 우 통로(기관총)를 고를 수 있으므로 봇 실패 = 사람 실패가 아니다. 난이도 선택기의 목적이 "사람이 지점을 찾는 것"이라 이쪽을 택했다. ② hard 의 eshotDmg 를 1 로 — "어려움부터 1발 = 병사 1명" 의도가 사라진다. ③ brutal eliteHp 2.4 → 1.8 — 봇 한 판에 맞춘 값이라 권하지 않는다. 검사(`SD-2`·`SD-3`)는 ①에 맞춰 hard S2·brutal S1 을 "정예까지 도달하고, 지더라도 정예전에서만 진다" 로 잡아 두었다. 봇을 고쳐 합격시키는 것은 하지 않았다(검수의 '숨은 감쇠' 와 같은 은폐).

## 4. 테스트 수치(실제 출력)

```
node --test tests/rush3-*.test.mjs   → ℹ tests 192 · pass 192 · fail 0 (duration_ms 8520)   ← 기존 174 + 신규 18
node --test tests/rush-*.test.mjs    → ℹ tests 32 · pass 32 · fail 0                      ← 기존 게임 회귀(무수정)
```

신규 18건: `tests/rush3-difficulty.test.mjs` V3-DIFF DIFF-1~6(6) + V3-SIM-DIFF SD-0~5(6) · `tests/rush3-save.test.mjs` V3-SAVE-VERSION DIFF(5) · `tests/rush3-loop.test.mjs` 셸 결선(1). 기존 174건은 파일 무수정(save/loop 는 끝에 추가만).

- DIFF-2: `buildStage(id) ≡ buildStage(id,{normal})`(deepEqual) · `enemyDefsFor('normal') ≡ BAL3.enemies` · 성장 축이 세 난이도에서 deepEqual.
- DIFF-5: 실제 `stepRun` 으로 잡졸 hp·돌격체 접촉 n·저격수 적탄 n(어려움부터 `unitLost` 1발)·정예 6초 발사 횟수 6/7/9 확인.
- DIFF-6: `stepRun` 이후 소스에 `difficulty`·`BAL3.enemies` 참조 없음(정적) · 같은 난이도·입력열 결정성.
- SAVE DIFF: 키 `2`(normal)·`2:hard`·`2:brutal` 분리, 재로드·`patch({stages})` 뒤 유지, 옛 저장은 키 그대로, `':normal'` 접미·모르는 접미·잡키 손상 케이스.
- 셸 결선: 토글 클릭·키 1/2/3 → 저장 `difficulty`; hard 출격·결과가 `2:hard` 칸에만, normal 칸(도전 9회·최고 99명) 불변; HUD·결과에 '어려움', normal 에는 없음; 판 도중 숫자 키 무시; 다시 도전 같은 난이도; 새 boot 가 마지막 난이도 기억.

## 5. 브라우저 확인(Playwright Chromium, `newmode/v3/build3/browser-verify.py` → `browser-verify.json`)

8단계 전부 ok · **pageerror 0 · console error 0 · HTTP 4xx/5xx 0**.

| 단계 | 결과 |
|---|---|
| load | title · difficulty normal |
| clickHard(토글 둘째 칸) | difficulty hard · localStorage `difficulty: "hard"` |
| keys123 | 키 3 → brutal · 1 → normal · 2 → hard |
| startS1hard | run · stageId 1 · difficulty hard · 저장 `stages.1.versions` = `{ "2:hard": { attempts: 1 } }`(normal 칸 `2` 없음) |
| reachResultHard(무조작 x 240) | result · 11명 · `2:hard` = cleared true · bestSurvivors 11 · bestTime 42.67 |
| reloadRemembersHard(page.reload) | title · difficulty hard(기억) |
| clickBrutal | difficulty brutal |
| startS1brutal | run · difficulty brutal · 키 `["2:brutal", "2:hard"]` |

스크린샷: `bv3-01-title-normal.png` · `bv3-02-title-hard.png`(토글 '어려움' 선택) · `bv3-03-hud-hard.png`(무기 칩 왼쪽 '어려움' 태그) · `bv3-04-result-hard.png`(제목 "STAGE 1 첫 진격 · 어려움") · `bv3-05-title-brutal.png` · `bv3-06-hud-brutal.png`('극한' 태그). 어절 중간 줄바꿈 없음(육안).

## 6. 변경 파일

| 파일 | 내용 |
|---|---|
| `rush3/balance.js` | `BAL3.difficulty` 표 · `DIFFICULTY_IDS`·`DEFAULT_DIFFICULTY`·`difficultyMult` |
| `rush3/stages.js` | `buildStage(id, { difficulty })` — `stage.difficulty`, rows 스폰 n, 정예 hp |
| `rush3/combat.js` | `enemyDefsFor(difficulty)` · `createRun(stage, { difficulty }?)` → `run.difficulty`·`run.enemyDefs` · 규칙은 `run.enemyDefs` 만 읽음 |
| `rush3/save.js` | 기록 칸 키 `버전` / `버전:난이도` · `recordKey` · `getStage/updateStage(id, …, version, difficulty)` · 최상위 `difficulty` |
| `rush3/main.js` | 타이틀 토글(`DIFF_TOGGLE`)·키 1/2/3 · `normDifficulty` · 출격/결과 저장에 난이도 · `dbg.difficulty` · `getDifficulty/setDifficulty` |
| `rush3/render.js` | 타이틀 토글 줄(히어로 y 282, 라벨 '난이도', 캡션 y 430) · HUD 태그 · 결과 제목 옆 표기 · 적 HP 태그 기준 = `run.enemyDefs` |
| `tests/lib/rush3-policies.mjs` | `playPolicy(id, policy, maxSteps, difficulty = 'normal')` |
| `tests/rush3-difficulty.test.mjs`(신규) · `tests/rush3-save.test.mjs`·`tests/rush3-loop.test.mjs`(끝에 추가) | §4 |
| `newmode/v3/DESIGN_v3_stage1.md` | r3.3: §3-8 난이도(표·근거·검수 조항·적용 시점·봇 실측) · §2 export 표 · §3-1 run 필드 · §6 토글/HUD/결과/dbg · §7 저장 키·API · §8 V3-DIFF/V3-SIM-DIFF/V3-SAVE-VERSION DIFF |
| `newmode/v3/build3/` | 이 보고서 · `browser-verify.py/.json` · 스크린샷 6장 · `elite-search.py`·`probe_one.mjs`·`elite-search-log.json`(§3 탐색 증거) |

## 7. 이사님이 확인할 것(3줄)

1. **어려움으로 S1 → S2 를 직접 플레이**해 보세요. 봇은 S2 정예전에서 전멸했지만 사람은 부채꼴을 옆으로 비키고 벽 우 통로(기관총)를 고를 수 있습니다 — "손해는 나는데 쉽다" 가 "긴장되는데 이길 수 있다" 로 바뀌는지가 관건입니다.
2. **극한 S1** 이 "억울하게 어렵다"(적탄 1발 = 병사 1명, 정예 hp 2.4배) 인지 "도전할 맛이 난다" 인지 — 너무하면 §3 의 ③(정예 hp 2.4 → 1.8)이 가장 작은 손질입니다.
3. 타이틀 토글 위치·크기(스테이지 버튼 위 한 줄)와 HUD '어려움/극한' 태그가 눈에 걸리지 않는지 — 위치는 `main.js DIFF_TOGGLE` 한 곳에서 바꿉니다.
