# 스타포지 러시 v3 — 기본 난이도를 '극한'으로 (build4)

작성 2026-09-16 · 저장소 `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar`(브랜치 `claude/starforge-v3`) · 미커밋 워킹트리
계약서 = `newmode/v3/DESIGN_v3_stage1.md`(r3.3, 이 작업에서 같이 갱신)

## 1. 무엇을 결정했고 무엇만 바뀌었나

이사 결정(2026-09-16): **"극한으로 모든 스테이지를 격파했다 → 극한을 기본으로 한다."**

'기본값'이 두 곳에서 서로 다른 것을 가리켜서, 계약서에 두 이름으로 나눠 못 박았다.

| 이름 | 값 | 사는 곳 | 뜻 | 이번에 바뀜? |
|---|---|---|---|---|
| 규칙 기본 `DEFAULT_DIFFICULTY` | `normal` | `rush3/balance.js` | `buildStage(id)` 를 난이도 인자 없이 부를 때의 값 = 검사·봇 시뮬 기준선 | **아니오** |
| 타이틀 초기 선택 `DEFAULT_PICK_DIFFICULTY` | `brutal` | `rush3/balance.js`(셸이 읽음) | 저장에 난이도가 없을 때 타이틀이 처음 켜 두는 칸 | **예** |
| 기록 칸 접미 기준 `BASE_DIFFICULTY` | `normal` | `rush3/save.js` | 기록 칸 키에 접미를 붙이지 않는 난이도 | **아니오** |

즉 바뀐 것은 **플레이어가 타이틀에서 처음 보는 칸 하나**뿐이다. 배수 표·STEP 규칙·코스 배치·기록 칸 키 규칙은 그대로다.

## 2. 코드(조율자가 미리 적용한 변경, 이번 작업에서 확인만)

- `rush3/balance.js` — `DEFAULT_PICK_DIFFICULTY = 'brutal'` 신설(`DEFAULT_DIFFICULTY = 'normal'` 유지)
- `rush3/main.js` — `normDifficulty` 의 폴백을 `DEFAULT_PICK_DIFFICULTY` 로
- `rush3/save.js` — `defaults()` / `normalize()` 의 `difficulty` 폴백을 `PICK_DEFAULT = 'brutal'` 로(`BASE_DIFFICULTY` 는 `normal` 그대로)

규칙 모듈(combat/gates/supply/squad/weapons)은 손대지 않았다 — `V3-PURE` 정적 검사 통과.

## 3. 검사 갱신 — 단언을 약하게 만들지 않고 '새 의미'로

실패 5건은 전부 **옛 기본값(normal)을 전제로 쓴 단언**이었다. 약화(느슨한 비교·삭제) 없이, 바뀐 의미를 그대로 적은 단언으로 교체했다. 교체할 때마다 **없어질 뻔한 보장은 새 단언으로 되살렸다**(아래 '되살린 보장' 열).

| # | 검사 | 옛 의미 | 새 의미 | 되살린 보장 |
|---|---|---|---|---|
| 1 | `V3-SHELL` boot 스모크 (`rush3-loop`) | 기록 칸 = `${ver}`(normal) | 첫 부팅 선택 = `brutal`, 기록 칸 = `${ver}:brutal` | `save.getStage(1, ver).attempts === 0` 을 **추가** — 극한 판이 normal 칸을 건드리지 않음 |
| 2 | `V3-SAVE-VERSION` 코스 버전≠1 셸 기록 | v1 기록을 normal 칸에 두고 v2 칸과 비교 | v1 기록도 **같은 난이도 칸**(`1:brutal`)에 두고 `2:brutal` 과 비교 | 화면에서 옛 기록이 빠지는 이유가 **버전 때문**임이 유지된다(난이도 차이로 빠진 게 아님). 칸 목록 단언 `['1','2']` → `['1:brutal','2:brutal']` |
| 3 | `V3-SAVE-VERSION DIFF` 셸 결선 | boot 직후 `getDifficulty() === 'normal'` | boot 직후 `'brutal'`, 키 1 로 '보통' 선택 후 기존 시나리오 그대로 | `normDifficulty('zzz') === 'brutal'`(폴백도 초기 선택과 같음). 이후 hard 결선·HUD·결과·재로드 단언은 **한 줄도 지우지 않음** |
| 4 | `V3-SAVE-VERSION DIFF` 옛 저장(난이도 없음) | `get().difficulty === 'normal'` | `=== 'brutal'`(초기 선택) | 같은 검사 안의 `getStage(1,2) === 옛 기록` · 저장 원문 키 `{versions:{2:...}}` 불변 단언이 그대로 남아 **옛 normal 칸 보존**을 계속 지킨다 |
| 5 | `V3-SAVE-VERSION DIFF` 마지막 난이도 | 기본 `normal`, 형식 오류 → `normal` | 기본 `brutal`, 형식 오류(`5/null/''/{}`) → `brutal` | `assert.equal(BASE_DIFFICULTY, 'normal')` 을 **추가** — 접미 기준은 안 바뀌었음을 같은 자리에서 못 박음 |

### 새로 넣은 검사 1건 (요구사항 2)

`V3-SAVE-VERSION DIFF 새 사용자: 저장이 없으면 타이틀 초기 선택은 극한 — 토글로 보통을 고르면 접미 없는 칸에 기록된다` (`tests/rush3-loop.test.mjs`)

- 저장 원문(`starforgeRush.v3`)이 아예 없는 상태 확인 → `getDifficulty() === 'brutal'`, `dbg().difficulty === 'brutal'`
- `DIFF_TOGGLE` 첫 칸('보통') **실제 클릭 좌표**로 `pointerdown` → 타이틀 유지(출격 아님)·`'normal'`·저장에 기억
- 출격 → `run.difficulty === 'normal'`, `getStage(1, ver).attempts === 1`, `getStage(1, ver, 'brutal').attempts === 0`
- 저장 **원문 키**가 `['2']` — 접미가 붙지 않음
- normal HUD 에 난이도 표기 없음

## 4. 계약서 갱신 (요구사항 3)

`newmode/v3/DESIGN_v3_stage1.md`

- 머리말 개정 이력에 `r3.3 후속(2026-09-16, 이사 결정)` 한 줄
- **§3-8** — '두 가지 기본값' 표 신설(규칙 기본 `normal` / 타이틀 초기 선택 `brutal`, 근거 = 이사 결정)
- **§6** — 타이틀 난이도 토글: 저장에 난이도가 없으면 처음 켜진 칸은 '극한', `normDifficulty` 폴백도 같은 값
- **§7** — 저장 최상위 `difficulty` 기본값 `brutal`, **기록 칸 접미 기준 `BASE_DIFFICULTY = 'normal'` 은 그대로**임을 명시
- §8 — `V3-SAVE-VERSION DIFF` 항목에 새 사용자 경로와 스모크 기록 칸(`${ver}:brutal`) 반영

## 5. 실행 결과 (요구사항 4, 실제 출력)

```
cd /e/workspace/claude/neon-fleet/worktrees/v3-lastwar && node --test tests/rush3-*.test.mjs
ℹ tests 193
ℹ pass 193
ℹ fail 0
ℹ duration_ms 8289.3954
```

```
cd /e/workspace/claude/neon-fleet/worktrees/v3-lastwar && node --test tests/rush-*.test.mjs
ℹ tests 32
ℹ pass 32
ℹ fail 0
ℹ duration_ms 1052.9242
```

193 = 기존 192 + 새 사용자 경로 1건. 기존 `rush-*` 3파일 32건 회귀 이상 없음.

## 6. 손댄 파일

```
newmode/v3/DESIGN_v3_stage1.md | 16 +++++++++---
rush3/balance.js               |  3 +++     (조율자 기존 변경)
rush3/main.js                  |  4 +--     (조율자 기존 변경)
rush3/save.js                  |  6 +++--   (조율자 기존 변경)
tests/rush3-loop.test.mjs      | 56 +++++++++++++++++++++++++++++++++---------
tests/rush3-save.test.mjs      | 11 ++++++---
```

새 파일(추적 안 됨): `newmode/v3/build4/default-report.md`(이 보고서) · `newmode/v3/build4/_probe_brutal_s1.mjs`(§7-1 확인용 일회용 스크립트, 검사 아님).

`rush/*` · `rush.html` · `tests/rush-*.test.mjs` 무수정. 커밋·푸시·배포 없음(조율자 몫).

## 7. 남는 판단거리 (이사 확인 필요)

### 7-1. 계약서 §3-8 봇 실측표의 "brutal S1 `aim` 전멸"은 **봇이 가운데로 돌아오지 않아서**였다

셸 boot 스모크의 봇은 극한 S1 을 **완주한다**(생존 14명). 계약서 §3-8 표에는 `aim` 이 brutal S1 에서 전멸(정예 55/288 잔존)이라고 적혀 있어 서로 어긋나 보이므로, 원인을 실제로 돌려 확인했다(스크립트 `newmode/v3/build4/_probe_brutal_s1.mjs`, 검사가 아닌 일회용 확인용).

```
brutal aim(null 그대로)                  {"won":false,"peak":20,"units":0}
brutal aim(?? 240)                       {"won":true,"peak":20,"units":14}
brutal smoke botX(null 그대로)           {"won":false,"peak":20,"units":0}
brutal smoke botX(?? 240)                {"won":true,"peak":20,"units":14}
brutal smoke botX(?? 240, 앞 90STEP 무조작) {"won":true,"peak":20,"units":14}
normal  (위 5가지 전부)                   won=true
```

두 봇의 규칙은 사실상 같고(스모크 쪽이 `skipped` 통을 거르지 않는 차이뿐, S1 에는 해당 통이 없다), **갈리는 지점은 딱 한 줄**이다. 노릴 것이 다 떨어졌을 때(= 정예전) 스모크 봇은 `?? 240` 으로 **가운데로 복귀**하고, 시뮬의 `aim` 은 `null` 을 그대로 둬서 **마지막에 비켜 섰던 자리에 그대로 선 채** 정예 탄을 정면으로 받는다. 극한은 적탄 dmg ×3 이라 그 차이가 전멸/완주로 갈린다.

**판단거리**: §3-8 의 봇 실측표는 "극한 S1 은 봇도 못 깬다"로 읽히는데, 실제로는 **정예전에서 중앙 복귀만 하면 깬다**. 표에 이 단서를 덧붙일지(또는 `aim` 정책에 중앙 복귀를 넣어 표를 다시 뜰지) 결정이 필요하다. 표·정책을 고치는 것은 이번 작업 범위 밖이라 손대지 않았다.

### 7-2. 새 플레이어의 첫 판이 극한이 된다

초기 선택이 극한이므로 처음 오는 사람도 극한으로 시작한다. §3-8 봇 실측표상 S2·S3 은 정책 봇 대부분이 극한에서 실패한다. 이사님은 이미 전 스테이지를 격파하셨지만, **처음 오는 사람 기준**으로도 이 첫인상이 의도한 바인지 실플레이로 한 번 확인하시길 권한다(`localhost:8779/rush3.html`).

### 7-3. 옛 저장을 가진 사람은 기존 기록이 '미도전'으로 보인다

화면이 극한 칸을 먼저 보여 주므로, 기존 normal 기록은 **저장에 그대로 남아 있는데도** 타이틀에서는 '미도전'으로 보인다('보통'을 고르면 즉시 다시 보인다 — 검사로 잠가 두었다). 이 첫인상을 그대로 둘지, 아니면 "기록이 있는 저장이면 마지막에 고른 난이도를 우선" 같은 예외를 둘지는 이사 판단 사항이다(현재는 예외 없음 = 결정 그대로).
