# 스타포지 러시 v3 — 검수 반영 [버그 팩] 작업 보고

작업일: 2026-09-10 · 대상: `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar` (브랜치 `claude/starforge-v3`)
근거 문서: `newmode/v3/review/01_GPT_1단계_검수결과.md` · `02_클로드코드_전달문.md` · 계약서 `newmode/v3/DESIGN_v3_stage1.md`

**범위**: 검수 지적 중 **F1(입력 전환)·F4(충돌 정렬)·후속개선(저장 기록의 코스 버전 분리)** 세 건만 고쳤다.
F2(경로 선택 재미)·F3(S2 양쪽 보상 동시 획득)은 **배치 개정 담당의 몫**이라 이번에 손대지 않았다.
기존 `rush/*` · `rush.html` · `tests/rush-*.test.mjs` 는 한 줄도 고치지 않았고, **커밋·푸시·배포는 하지 않았다**(조율자 몫).

---

## 0. 한눈에 보는 결과

| 항목 | 전 | 후 |
|---|---|---|
| 마우스 x240 뒤 오른쪽 키 2초의 최종 x | **247** (마우스 위치에 묶임) | **391** (마우스 없이 키만 썼을 때와 동일) |
| 검수자 nearest 재현: 통 내구 / 적 체력 | 통 9 / 적 2 (**앞의 적을 건너뜀**) | **통 10 / 적 1** (앞의 적이 먼저 맞음) |
| 스테이지 기록 저장 | `stages[id]` 하나 | `stages[id].versions[코스버전]` (구 저장은 버전 1로 귀속) |
| 자동 검사(rush3) | 117 통과 | **125 통과 · 0 실패** (신규 8개) |
| 기존 rush 회귀(core/sim/meta) | — | **32 통과 · 0 실패** |
| 3스테이지 × 7입력 정책 21판 | 기준값 | **21판 전부 동일**(결과·시간·생존·최고·무기·놓친 통까지 변화 0) |

21판이 전부 그대로라는 것은 **이번 수정이 난이도·배치를 건드리지 않았다**는 뜻이다(F4 배치는 현재 3스테이지에서 실제로 발생하지 않는다는 검수자 관찰과 일치). 따라서 F2·F3 의 재미 문제는 여전히 그대로 남아 있다.

---

## 1. F1 — 마우스→키보드 전환 조작 오류

### 무엇이 문제였나
`input.js` 가 마우스 호버 위치(`pointerX`)를 계속 들고 있어서, 키로 목표(`tx`)를 오른쪽으로 밀어도 **다음 STEP 첫 줄에서 옛 마우스 위치가 tx 를 다시 덮어썼다**. 결과적으로 방향키가 7px 정도밖에 듣지 않았다.

### 어떻게 고쳤나 — “마지막으로 쓴 장치가 이긴다”
`rush3/input.js` 에 **장치 우선순위**를 넣었다. 셋 중 하나만 살려 두므로 combat 1단계에서 서로 덮어쓸 일이 없다(`state.device` = `'mouse' | 'touch' | 'key' | null`).

| 방금 일어난 일 | 지우는 것 | 남는 것 |
|---|---|---|
| 키를 **누름** | `pointerX = null` | `keyDir` |
| 마우스를 **움직임**(호버·클릭) | 눌린 키 해제 · `keyDir = 0` | `pointerX` |
| 드래그 **시작** | `pointerX = null` · `keyDir = 0` | `dragDx` |
| 드래그 **중** 키 입력 | (방향에 반영 안 함 — 드래그 우선) | `dragDx` |

- (a) 키를 누르는 순간 마우스 목표 해제 ✔
- (b) 키를 놓아도 `pointerX` 는 null 그대로 → **옛 마우스 위치로 되돌아가지 않는다**(다음 마우스 이동 전까지) ✔
- (c) 마우스를 다시 움직이면 마우스 조작 재개(눌린 키는 해제되므로 키는 다시 눌러야 듣는다) ✔
- (d) **터치 드래그 규칙은 “드래그 우선”으로 확정**했다: 드래그가 시작되면 마우스·키 목표를 둘 다 지우고, 드래그 중 키는 방향에 반영하지 않는다(아는 키면 셸에는 `true` 로 알려 브라우저 기본 동작만 막는다). 드래그가 끝난 뒤 키를 다시 누르면 키 조작이 재개된다. → 계약서 6장에 명시.
- (e) `combat.stepRun` 1단계는 원래도 `pointerX === null` 이면 tx 를 덮어쓰지 않았다. 규칙을 못 박는 주석만 추가(로직 변경 없음).

### 실측
- 진단 스크립트(`probe-local.mjs` keyboard 블록, 마우스 x240 후 오른쪽 키 2초)
  - 전: 마우스 없음 391 / 마우스 먼저 **247**
  - 후: 마우스 없음 391 / 마우스 먼저 **391** (완전 일치)
- **실제 브라우저**(localhost:8779/rush3.html, 실제 클릭·실제 마우스 호버 + 키 이벤트)
  - 마우스가 x240 위에 있는 상태에서 오른쪽 키 → x **240 → 323 → 383** (전에는 247 부근에서 멈췄다)
  - 키를 뗀 뒤 → x **383 유지**(240 으로 되돌아가지 않음)
  - 마우스를 왼쪽(논리 x≈120)으로 옮김 → x **383 → 305** (마우스 조작 재개)

### 검사
`V3-INPUT-SWITCH` 2건 신규(`tests/rush3-loop.test.mjs`)
1. 마우스→키(두 판의 최종 x 동일·380<x<400) · 키 해제 뒤 복귀 없음 · 키를 누른 채 마우스를 움직이면 마우스가 이김(180 STEP 뒤 |x−160|<2)
2. 터치↔키(드래그 시작이 키 방향 해제 · 드래그 중 키 무시 · 드래그 후 키 재개 · 마우스→터치 목표 해제)

기존 `V3-INPUT` 3건, `V3-WALL`(드래그 +500 뒤 −20) 포함 전부 유지. 상태 객체에 `device` 필드가 하나 늘어 `V3-INPUT` 의 `deepEqual` 한 줄만 갱신했다.

---

## 2. F4 — 충돌 후보 정렬을 실제 최초 교차점으로

### 무엇이 문제였나
후보 비교값이 **원의 앞면 z(`중심z − r`)** 였다. 비스듬히 스치는 통은 앞면이 실제 접점보다 훨씬 앞이라, 같은 STEP 에 겹친 **정면의 적을 건너뛰고 통을 맞히는** 일이 생겼다.

### 어떻게 고쳤나
교차 함수를 **최초 교차 z 를 돌려주는 형태로 통일**하고 그 값으로 정렬한다.

| 대상 | 함수(모듈) | 최초 교차 z | 탄 폭 |
|---|---|---|---|
| 벽 | `wallContactZ` (combat) | `max(w.z0, 스윕시작)` | 탄 **중심 x** |
| 통 | `sweepContactSupply` (supply) | `max(s.z − √(r²−dx²), 스윕시작)` | 탄 **중심 x** |
| 게이트 행 | `sweepContactGate` (gates) | `max(row.z − h/2, 스윕시작)` | 탄 **중심 x** |
| 적·보스 | `circleContactZ` (combat) | `max(e.z − √((r+w/2)²−dx²), 스윕시작)` | **반지름 + 탄 반폭** |

- 벽 > 통 > 게이트 > 적 우선순위는 **교차 z 가 정확히 같을 때만** 적용한다.
- 기존 `sweepHitsSupply` · `sweepHitsGate`(불리언)는 계약을 깨지 않게 남기되 **교차 함수의 결과가 null 인지 보는 얇은 껍데기**로 바꿨다(판정 로직 이중화 제거).
- 규칙 모듈에 `Math.random`·`rng`·`balance` 를 새로 들이지 않았다(`V3-PURE` 통과 유지).

### 실측(검수자 재현 그대로)
탄 x240 z90→101.67(w4) · 통 (269,105) r30 내구 10 · 적 (240,108) r14 hp 2
접점 = 적 **92** < 통 **97.319**

| | 통 내구 | 적 체력 | 이벤트 |
|---|---:|---:|---|
| 전 | 9 | 2 | `supplyHit` |
| 후 | **10** | **1** | **`enemyHit`** |

### 검사
`V3-ORDER-CONTACT` 2건 신규(`tests/rush3-combat.test.mjs`): 위 재현 1건 + **반대 배치**(통 (240,100)·적 (240,110) → 통 내구 9·적 hp 2) 1건. 기존 `V3-ORDER` 4건·`V3-GATE-SCROLL` 유지.

---

## 3. 저장 기록의 코스 버전 분리

### 스키마(계약서 7장에 명시)
```
starforgeRush.v3 = {
  v: 3,
  stages: { [id]: { versions: { [stageVersion]: { cleared, attempts, bestSurvivors, bestTime } } } },
  lastStage, volume, mute
}
```
- 코스 버전의 **단일 출처는 `stages.js` 의 `DEFS[id].version`** 이다. `buildStage(id).version` → `run.stageVersion` → 저장 키로 흐르고, 화면(스테이지 선택)은 `stageVersion(id)` 를 읽는다. 이번 작업에서 값은 **전부 1 그대로**(올리는 것은 배치 개정 담당 몫). 세 스테이지 정의에 `version: 1` 을 명시해 두어 고칠 자리를 분명히 했다.
- **마이그레이션**: 구 저장(`stages[id]` 에 기록이 바로 있던 형식)은 **지우지 않고 버전 1 로 귀속**한다. `versions` 가 있는데 그 안에 `1` 이 없고 옛 필드가 남아 있으면 그것도 버전 1 로 본다. 버전 키는 1 이상의 정수만(그 밖은 1 로 간주).
- **API**: `getStage(id, version = 1)` · `updateStage(id, patch, version = 1)`(그 버전만 깊은 병합) · `getStageVersions(id)`(모든 버전 사본). `patch({stages})` 조각이 버전 없이 오면 버전 1 갱신으로 본다.
- **셸(`main.js`)**: 출격의 `attempts` +1, 결과 화면의 `cleared`·`bestSurvivors`·`bestTime` 비교를 **전부 `run.stageVersion` 안에서만** 한다. 스테이지 선택 화면은 현재 코스 버전의 기록을 보여 준다(옛 버전 기록은 저장에 남되 화면에는 안 나온다). 첫 플레이 안내 판정만 **모든 버전의 attempts 합**을 써서, 코스 버전이 올라가도 초보 안내가 되살아나지 않게 했다.

### 검사
`V3-SAVE-VERSION` 4건 신규(`tests/rush3-save.test.mjs`)
1. 구 저장 로드 → 버전 1 귀속·값 보존·`.bak` 없음·저장 원문도 `versions` 형식으로 이관
2. v2 기록이 v1 최고 기록을 덮지 않음(양방향 확인·재로드 후에도 동일)
3. 셸 경로 — `buildStage(id).version` 이 그대로 기록 버전(세 스테이지 전부)
4. 손상 케이스 — `versions` 가 객체가 아님 / 이상한 버전 키 / 숫자 아닌 필드에서도 기본값으로 진행

기존 손상 케이스(`abc` · `{v:1}` · `stages:null` · setItem 예외 · getItem throw)는 그대로 통과. 저장 원문 형태를 검사하던 기존 한 줄(`stages['1'].attempts`)만 `stages['1'].versions['1'].attempts` 로 갱신했다.

---

## 4. 계약서(`DESIGN_v3_stage1.md`) 갱신 부분

| 장 | 갱신 내용 |
|---|---|
| 4장 1단계 | `pointerX === null` 이면 tx 를 덮어쓰지 않는다는 규칙 명문화 + “입력 모듈이 마지막 장치 하나만 살려서 준다” 연결 |
| 4장 5단계 | **최초 교차 z 정의**(원 = `중심z − √(r²−dx²)`, 사각형·게이트 = 앞면, 둘 다 스윕 시작으로 자름) · 동일 교차 z 일 때만 우선순위 · **대상별 탄 폭 처리 기준** · 교차 함수 4개 이름 |
| 6장 | **장치 우선순위 규칙 전체**(키↔마우스↔드래그, 드래그 우선으로 확정) |
| 7장 | 저장 스키마(versions) · 코스 버전 단일 출처 · 마이그레이션 · API · “신기록 비교·attempts 는 같은 버전 안에서만” |
| 8장 | 검사 ID 3개 추가: `V3-ORDER-CONTACT` · `V3-INPUT-SWITCH` · `V3-SAVE-VERSION` |

---

## 5. 검사 수치

```
node --test tests/rush3-*.test.mjs      → tests 125 / pass 125 / fail 0   (전 117, 신규 8)
node --test tests/rush-core|sim|meta    → tests  32 / pass  32 / fail 0   (기존 rush 회귀)
node newmode/v3/review/probe-local.mjs  → 21판 중 결과 변화 0
```
신규 8건 = `V3-INPUT-SWITCH` 2 · `V3-ORDER-CONTACT` 2 · `V3-SAVE-VERSION` 4

### 3스테이지 × 7입력 정책(전 → 후, 전부 동일)

| 스테이지 | center | center−1 | center+1 | left | right | sway | aim |
|---|---|---|---|---|---|---|---|
| S1 | 승 40.0s 14/14 | 패 46.6s 0/4 | 승 40.0s 14/14 | 패 46.6s 0/4 | 승 49.6s 12/16 | 패 16.0s 0/1 | 승 42.3s 19/20 |
| S2 | 패 20.5s 0/2 | 승 49.4s 24/26 | 패 20.5s 0/2 | 승 51.6s 35/38 | 패 27.1s 0/2 | 승 55.7s 21/25 | 승 47.2s 41/43 |
| S3 | 패 66.5s 0/7 | 패 85.5s 0/16 | 패 68.6s 0/7 | 승 72.5s 39/48 | **승 59.5s 64/66** | 승 70.4s 54/58 | 승 59.2s 70/71 |

(생존/최고 병력. 봇 정책의 결과이며 **사람의 성공률이 아니다**.) S3 오른쪽 고정이 적극 조준(59.2s 70명)과 거의 같은 **59.5s 64명**이라는 F3/F2 문제는 이번 범위 밖이라 그대로다.

원자료: `newmode/v3/review/probe-results-local-before.json` / `-after.json`
(검수자 원본 `probe.mjs` 는 수정하지 않았다. 사본 `probe-local.mjs` 의 import 만 `../../../rush3/...` 로 바꾸고, 출력 파일명을 인자로 받게 했다 — `node newmode/v3/review/probe-local.mjs before|after`.)

---

## 6. 고친 파일

| 파일 | 내용 |
|---|---|
| `rush3/input.js` | 장치 우선순위(F1). `state.device` 추가 |
| `rush3/combat.js` | `wallContactZ`·`circleContactZ` 신설, `moveBullets` 정렬을 최초 교차 z 로(F4). 1단계 주석 |
| `rush3/supply.js` | `sweepContactSupply` 신설, `sweepHitsSupply` 는 껍데기로 |
| `rush3/gates.js` | `sweepContactGate` 신설, `sweepHitsGate` 는 껍데기로 |
| `rush3/save.js` | 버전별 기록 스키마·마이그레이션·`getStageVersions` |
| `rush3/main.js` | 출격/결과/스테이지선택이 `run.stageVersion` 기준으로 동작 |
| `rush3/stages.js` | `DEFS[id].version` 명시, `stageVersion(id)` export, `buildStage` 가 그 값을 읽음 |
| `newmode/v3/DESIGN_v3_stage1.md` | 4·6·7·8장 갱신 |
| `tests/rush3-loop.test.mjs` · `rush3-combat.test.mjs` · `rush3-save.test.mjs` | 신규 8건 + 기존 2줄 갱신 |

---

## 7. 남은 불확실성 · 하지 않은 것

- **자동 검사 통과 ≠ 재미 검증 완료.** 이번 것은 조작·판정·기록의 정확성 수정이다. 검수자가 지적한 **F2(경로 선택의 이유)·F3(S2 필수 선택 지점)** 은 손대지 않았으므로 1단계 재미 판정은 아직 열려 있다.
- **스마트폰 실기 미실시.** 터치 드래그 규칙(드래그 우선)은 Node 검사와 데스크톱 브라우저 합성 이벤트로만 확인했다. 실제 손가락·기종·회전·중단복귀·후반 병력 성능은 미확인.
- 브라우저 실측은 **미리보기 창이 가려지면 rAF 가 멈춰** 프레임을 스크린샷으로 밀어 넣어 확인했다. 초당 프레임 감각·조작 손맛은 이사님 실플레이가 필요하다.
- `stageVersion` 을 2 로 올렸을 때의 화면 흐름(기록이 “미도전”으로 보이는 것)은 **의도된 동작**이며, 배치 개정 담당이 버전을 올린 뒤 눈으로 한 번 확인하는 것이 좋다.
- 커밋·푸시·배포는 하지 않았다. 작업 트리에만 남아 있다.

---

# 수정 라운드 1 — 검수 지적 2건 반영 (2026-09-10)

지적 2건([major] 2)을 고치고 검사를 다시 통과시켰다. 파일·규칙은 아래 두 항목 외에는 손대지 않았고, `rush/*` · `rush.html` · `tests/rush-*.test.mjs` 는 여전히 무수정, 커밋·푸시·배포도 하지 않았다.

| 항목 | 전 | 후 |
|---|---|---|
| `DEFS[1].version = 2` 로 두고 rush3 검사 | **1건 실패**(loop 322 등 버전 없이 읽는 단언) | **127 전부 통과** |
| 자동반복 keydown 30~60회 중 마우스 이동(실브라우저) | 반복이 `pointerX` 를 계속 지움(규칙 성립 불가) | **x 161 유지**(마우스가 이김) |
| rush3 자동 검사 | 125 통과 | **127 통과 · 0 실패**(신규 2) |
| 기존 rush 회귀(core/sim/meta) | 32 통과 | **32 통과 · 0 실패** |
| 3스테이지 × 7입력 정책 21판 | 라운드 0 결과 | **완전 동일**(JSON 전량 일치) |

---

## 지적 1 — 셸 스모크 테스트가 버전 없이 `save.getStage(id)` 로 읽는다 [major]

### 무엇이 문제였나
지적대로다. 기록은 `stageId + 코스 버전`으로 쌓는데(라운드 0에서 넣은 기능) **검사만 버전을 모르고 있었다.** 배치 개정 담당이 `DEFS[id].version` 을 2로 올리는 순간 — 그 기능의 존재 이유인 바로 그 동작 — 제품은 멀쩡한데 관련 없는 단언이 빨갛게 터진다. 재현해 보니 실패는 지적된 4곳뿐이 아니었다.

- `tests/rush3-loop.test.mjs:322·349·358·460` — `save.getStage(1)` / `getStage(2)`
- `tests/rush3-stages.test.mjs:93` — `assert.equal(st.version, 1)` (**검수자가 언급하지 않은 5번째 지점.** 코스 버전을 아예 1로 못 박아 두어, 버전을 올리면 여기서도 터진다)

### 어떻게 고쳤나
- 기록을 읽는 4곳을 `save.getStage(1, stageVersion(1))` · `save.getStage(2, stageVersion(2))` 로 바꾸고 `stages.js` 에서 `stageVersion` 을 import 했다(왜 버전을 붙여 읽어야 하는지 한 줄 주석 동반).
- `rush3-stages.test.mjs` 의 `st.version === 1` 은 **`st.version === stageVersion(id)` + "1 이상의 정수"** 로 바꿨다. `buildStage` 가 `DEFS` 의 값을 그대로 물고 온다는 원래 의도는 그대로 지키면서, 값을 1로 얼리지 않는다.
- 셸(startRun/finishRun/스테이지 선택)을 **버전 2로 실제로 돌려 보는 검사**를 `V3-SAVE-VERSION` 에 1건 추가했다(아래).
- 이를 위해 `rush3/stages.js` 의 `DEFS` 를 `export` 했다(주석: 배치 개정 담당이 고치는 표이며, 검사가 코스 버전을 임시로 바꿔 셸 경로를 확인한다). 검사는 `try/finally` 로 원래 값(1)을 되돌린다.

### 신규 검사 — `V3-SAVE-VERSION: 코스 버전이 1 이 아니면 셸이 그 버전 칸에 기록하고 옛 버전 기록은 화면에서만 빠진다`
`tests/rush3-loop.test.mjs`, boot 경로(가짜 캔버스·시계·rAF 큐)로:
1. `DEFS[1].version = 2` 로 두고 boot → `stageVersion(1) === 2`
2. 개정 전 기록 `{cleared:true, attempts:9, bestSurvivors:99, bestTime:12.5}` 을 버전 1에 심는다
3. 스테이지 선택 화면에 실제로 찍힌 글자를 보고 — `'미도전'` 이 있고 `'99명'` 은 **없다**(옛 버전 기록은 화면에서 빠진다). 이를 위해 검사용 가짜 캔버스가 `fillText` 의 글자를 모으게 했다(`texts`).
4. 출격 클릭 → `run.stageVersion === 2` · `getStage(1,2).attempts === 1` · `getStage(1,1).attempts === 9`(v1 불변)
5. 승리 판을 셸의 정상 경로(`run.over` → 여운 → `finishRun`)로 끝내고 → `getStage(1,2) = {cleared:true, attempts:1, bestSurvivors:생존수, bestTime:55.5}` · `getStage(1,1)` 은 `{…, bestSurvivors:99, bestTime:12.5}` 그대로 · `getStageVersions(1)` 의 키가 `['1','2']`(**저장에는 남는다**)

### 실측
```
DEFS[1].version = 2                 → node --test tests/rush3-*.test.mjs : 127/127 통과
DEFS = {1:2, 2:3, 3:5} (세 개 동시)  → 127/127 통과
DEFS 전부 1 로 되돌림                → 127/127 통과
```
(고치기 전 같은 조건: `V3-STAGES`·loop 단언이 `actual 2 / expected 1` 로 실패)

---

## 지적 2 — keydown 핸들러가 `e.repeat` 를 거르지 않는다 [major]

### 무엇이 문제였나
지적대로다. 방향키를 **누르고 있는 동안** 브라우저가 보내는 자동반복 keydown이 그대로 `input.onKey(code, true)` 로 들어가고, `onKey` 는 down 이면 무조건 `pointerX = null` 로 만든다. 그래서 계약서 6장의 "키를 누른 채 마우스를 움직이면 마우스가 이긴다"는 **실제 브라우저에서는 성립할 수 없는 규칙**이었고, `V3-INPUT-SWITCH (3)` 은 자동반복이 없는 세계(=`onKey` 를 한 번만 부르는 단위 검사)만 보고 있었다. 라운드 0의 브라우저 실측(383 → 305)은 **키를 뗀 뒤**라 이 경계를 덮지 않았다.

### 어떻게 고쳤나 — 가드를 넣는 쪽(수정안 첫째 안)
계약서 문구를 후퇴시키지 않고 코드를 고쳤다.
- `rush3/input.js`: 조향 키 판정을 `export function isSteerKey(code)` 로 빼고 `onKey` 도 그것을 쓴다(셸과 같은 판정을 쓰기 위함).
- `rush3/main.js` keydown 리스너 **첫 줄**(ESC 처리보다 앞):
  ```js
  if (e.repeat) { if (isSteerKey(code) && e.preventDefault) e.preventDefault(); return; }
  ```
  → 자동반복은 최초 1회 뒤로는 입력으로 보지 않는다. 조향 키의 브라우저 기본 동작(스크롤)은 반복에서도 계속 막고, **ESC·Space·Enter 의 반복도 같은 자리에서 걸러져** 일시정지가 뒤집히거나 판이 다시 시작되지 않는다(덤으로 고쳐진 것).

### 실측 — 실제 브라우저(localhost:8779/rush3.html, 실제 모듈 그대로)
| 단계 | 부대 x |
|---|---|
| 출격 직후 | 240 |
| 마우스 x240 → `ArrowRight` 최초 keydown + 반복 10회 | 240(키가 이김, `pointerX` 해제) |
| **마우스를 x160 으로 이동한 뒤 반복 keydown 40회** | **167** (마우스가 이김) |
| **반복 keydown 60회 추가** | **161** (계속 마우스 위치 유지) |
| 그 뒤 `repeat:false` keydown 1회 | **197** (키가 다시 이김 — 규칙이 양방향으로 산다) |

가드가 없으면 같은 자리에서 `pointerX` 가 매 반복 지워져 부대가 오른쪽으로 끌려간다.

### 신규 검사 — `V3-INPUT-SWITCH: 브라우저 자동반복 keydown 은 마우스 목표를 다시 지우지 않는다(셸 결선)`
`tests/rush3-loop.test.mjs`, boot 결선(가짜 window 의 실제 keydown 리스너)으로:
마우스 x240 → 최초 keydown(`pointerX` null·`keyDir` 1) → 마우스 x160(`pointerX` 160·`keyDir` 0) → **반복 keydown 30회** → `pointerX` 160 유지·`keyDir` 0·`preventDefault` 30회 호출 → 3초 뒤 `|x − 160| < 2` → ESC 로 일시정지 뒤 **반복 ESC** 로는 재개되지 않음.

**검사에 이빨이 있는지 확인**: `main.js` 의 가드 한 줄만 지우고 돌리면 이 검사가 `AssertionError: 자동반복이 마우스 목표를 지우면 안 된다` 로 실패한다(가드 복원 후 재통과 확인).

---

## 계약서(`DESIGN_v3_stage1.md`) 갱신 부분 — 라운드 1

| 장 | 갱신 내용 |
|---|---|
| 6장 (장치 우선순위) | **"자동반복 keydown은 입력이 아니다"** 항목 신설 — `e.repeat` 는 셸이 걸러 `onKey` 로 넘기지 않고 조향 키의 기본 동작만 막는다, 그래서 "키를 누른 채 마우스를 움직이면 마우스가 이긴다"가 실제 브라우저에서도 성립한다, ESC·Space·Enter 반복도 동작을 다시 일으키지 않는다 |
| 8장 `V3-INPUT-SWITCH` | 셸 결선 항목 추가(반복 keydown 30회에도 `pointerX` 불변·기본 동작은 계속 차단·반복 ESC 무효) |
| 8장 `V3-SAVE-VERSION` | 셸 결선 항목 추가(version 2 로 boot → 버전 2 칸에만 기록·버전 1 은 저장에 남고 화면에서만 빠짐) + **"검사는 코스 버전을 1로 못 박지 않는다 — `stageVersion(id)` 로 읽는다"** 를 규칙으로 명시 |

---

## 라운드 1 검사 수치

```
node --test tests/rush3-*.test.mjs                    → tests 127 / pass 127 / fail 0   (라운드 0: 125, 신규 2)
node --test tests/rush-core|sim|meta .test.mjs        → tests  32 / pass  32 / fail 0
DEFS 버전 2·3·5 로 올린 상태에서 rush3 전량            → tests 127 / pass 127 / fail 0
node newmode/v3/review/probe-local.mjs                → 라운드 0 'after' JSON 과 전량 일치(21판 결과 변화 0)
  · keyboard 블록: 마우스 없음 x 391 / 마우스 먼저 x 391 (동일 유지)
```
신규 2건 = `V3-INPUT-SWITCH`(자동반복 셸 결선) 1 · `V3-SAVE-VERSION`(코스 버전 2 셸 결선) 1

## 라운드 1에서 고친 파일

| 파일 | 내용 |
|---|---|
| `rush3/main.js` | keydown 자동반복 가드 1줄 + `isSteerKey` import(그 외 무변경) |
| `rush3/input.js` | `isSteerKey` export 로 분리, `onKey` 가 그것을 사용(동작 동일) |
| `rush3/stages.js` | `DEFS` export(검사가 코스 버전을 임시로 바꾸기 위함) |
| `tests/rush3-loop.test.mjs` | 버전 없이 읽던 4곳 수정 · 가짜 캔버스가 `fillText` 글자 수집 · 신규 검사 2건 |
| `tests/rush3-stages.test.mjs` | `st.version === 1` → `stageVersion(id)` 기준 + 정수 검사 |
| `newmode/v3/DESIGN_v3_stage1.md` | 6장·8장 갱신(위 표) |

## 라운드 1에서 남는 불확실성

- **스마트폰 실기 여전히 미실시.** 자동반복은 데스크톱 키보드 문제라 이번 수정과 터치는 무관하지만, 터치 드래그 규칙 전반은 아직 실기 확인 전이다.
- 브라우저 실측은 미리보기 창이 가려져 rAF 가 멈추므로 스크린샷으로 프레임을 밀어 넣어 확인했다. 값(161·197)은 실제 모듈이 계산한 것이지만 **연속 조작의 손맛은 이사님 실플레이가 필요하다**.
- `DEFS` 를 export 한 것은 검사 편의를 위한 것이다. 제품 코드에서 `DEFS` 를 직접 만지는 곳은 없다(`def()` 를 통해서만 읽는다).
- F2(경로 선택의 이유)·F3(S2 필수 선택 지점)은 이번에도 범위 밖 — 1단계 재미 판정은 여전히 열려 있다.

---

# 수정 라운드 2 — 검수 지적 1건 반영 (2026-09-10)

지적 1건([major] 저장 마이그레이션의 무음 데이터 손실)을 고치고 검사를 다시 통과시켰다.
이번에 손댄 것은 `rush3/save.js` 의 `rawVersions` 하나와 검사·계약서뿐이다. `rush/*` · `rush.html` · `tests/rush-*.test.mjs` 는 여전히 무수정, 커밋·푸시·배포도 하지 않았다.

| 항목 | 전 | 후 |
|---|---|---|
| 진짜 v1 기록 + 잡키가 한 칸에 있을 때 `getStage(1,1)` | `{cleared:false, attempts:0, bestSurvivors:0, bestTime:0}` (**기록 증발**) | `{cleared:true, attempts:9, bestSurvivors:99, bestTime:12.5}` (**보존**) |
| 같은 상황의 `getStageVersions(1)` | `{'1': 전부 0}` | `{'1': {…99, 12.5}}` |
| 그때 `.bak` | `null` (되돌릴 방법 없음) | `null` — 애초에 잃지 않으므로 문제 없음 |
| rush3 자동 검사 | 127 통과 | **129 통과 · 0 실패**(신규 2) |
| 기존 rush 회귀(core/sim/meta) | 32 통과 | **32 통과 · 0 실패** |
| `DEFS` 버전 2·3·5 로 올린 상태 | 127 통과 | **129 통과 · 0 실패** |
| 3스테이지 × 7입력 정책 21판 | 라운드 1 결과 | **JSON 전량 일치**(변화 0) |

---

## 지적 — 잡키가 실재하는 버전 1 기록을 덮어 지운다 [major]

### 무엇이 문제였나
지적대로다. 그리고 지적된 재현을 그대로 돌려 **눈으로 확인**했다.

```
원문: {v:3, stages:{1:{versions:{'1':{cleared:true,attempts:9,bestSurvivors:99,bestTime:12.5},
                                 'abc':{attempts:0}}}}}
전: getStage(1,1)       = {"cleared":false,"attempts":0,"bestSurvivors":0,"bestTime":0}
    getStageVersions(1) = {"1":{"cleared":false,"attempts":0,"bestSurvivors":0,"bestTime":0}}
    .bak                = null
```

원인은 `save.js:36` 의 한 줄이었다.
```js
for (const [v, rec] of Object.entries(s.versions)) out[verKey(v)] = isPlainObject(rec) ? rec : {};
```
`verKey('abc')` 는 `'1'` 이라, 뒤에 오는 잡키가 **앞서 채운 진짜 '1' 칸을 그대로 덮는다**. 최상위 형식(`v:3` · `stages` 객체)은 멀쩡하므로 `.bak` 도 남지 않는다 — 조용히 사라지고 되돌릴 방법이 없다. 검수 요구 "기존 저장 삭제 금지"와 정면으로 어긋난다.

기존 손상 케이스 검사(`tests/rush3-save.test.mjs`, `versions:{abc:{attempts:3}}`)는 **진짜 v1 기록이 없는 배치**여서 이 충돌을 잡을 수 없었다. 지적 그대로다.

### 어떻게 고쳤나 — 귀속 우선순위(먼저 채운 칸은 덮지 않는다)
`rawVersions` 를 **3단계**로 나눴다. 수정안대로 "이미 채워진 키를 덮지 않게" 하되, `Object.entries` 의 키 순서(정수형 키가 먼저 나오는 JS 규칙)에 기대지 않도록 **정규 키를 먼저 채우는 2패스**로 만들어 원문 키 순서와 무관하게 같은 결과가 나오게 했다.

| 순서 | 무엇 | 규칙 |
|---|---|---|
| ① | `versions` 안의 **정규 버전 키**(`'1'`,`'2'`,…) | 자기 자리에 그대로 |
| ② | 구 저장의 **옛 필드**(`stages[id]` 에 바로 있던 기록) | `'1'` 칸이 **비어 있을 때만** 버전 1 로 |
| ③ | **정규가 아닌 잡키**(`'abc'`,`'0'`,`'1.5'` …) | 1 로 보되 **빈 칸에만** — 이미 찼으면 무시 |

```js
const isCanonVerKey = (v) => typeof v === 'string' && /^[1-9][0-9]*$/.test(v);
...
for (const [v, rec] of Object.entries(s.versions)) {
  const val = isPlainObject(rec) ? rec : {};
  if (isCanonVerKey(v)) out[v] = val; else junk.push([verKey(v), val]);
}
if (!('1' in out) && hasRecFields(s)) out['1'] = s;
for (const [k, val] of junk) if (!(k in out)) out[k] = val;
```

- ②의 판정을 `!out['1']` 에서 `!('1' in out)` 으로 바꿨다. 잡키가 넣어 둔 **빈 객체도 "칸이 찼다"로 세던** 기존 판정으로는 `{versions:{abc:{}}, attempts:5}` 같은 원문에서 옛 필드가 묻힌다.
- 잡키가 들고 있던 값은 귀속할 자리가 없으면 버려진다(진짜 기록을 밀어내지 않는 유일한 선택). **실재하는 기록은 지우지 않는다**가 규칙이다.
- `mergeStage`(`updateStage`·`patch` 경로)도 같은 `rawVersions` 를 쓰므로 갱신할 때도 함께 보호된다.

### 실측 (같은 원문, 같은 스크립트)
```
후: getStage(1,1)       = {"cleared":true,"attempts":9,"bestSurvivors":99,"bestTime":12.5}
    getStageVersions(1) = {"1":{"cleared":true,"attempts":9,"bestSurvivors":99,"bestTime":12.5}}
    .bak                = null
```

### 신규 검사 2건 (`tests/rush3-save.test.mjs`, `V3-SAVE-VERSION` 손상 케이스)
1. **`잡키가 실재하는 버전 1 기록을 덮지 않는다(무음 손실 금지)`** — 한 원문 안에 세 배치를 같이 넣었다.
   - 스테이지 1 = 진짜 v1 기록(`도전 9회·최고 99명·12.5초`) + 잡키 `abc` → **v1 그대로**
   - 스테이지 2 = 구 저장의 옛 필드 + 잡키 `abc` → **옛 필드가 v1 로 살아남음**
   - 스테이지 3 = 잡키만(`xyz`) → 종전대로 **버전 1 로 귀속**(기존 동작 유지)
   - `.bak` 없음 · `patch` 로 다시 적힌 저장 원문도 `{versions:{1:{…99}}}` · `updateStage(1,{attempts:10},1)` 뒤 `{…99, attempts:10}` · 재로드 후에도 동일
2. **`잡키가 원문에서 앞에 와도 결과가 같다(키 순서 무관)`** — JSON 문자열에 `"abc"` 를 `"1"` 보다 먼저 적은 원문으로 로드해도 v1 기록이 이기고, 잡키가 다른 버전 칸을 침범하지 않는다(`키 = ['1']`).

**검사에 이빨이 있는지 확인**: `rawVersions` 를 고치기 전 한 줄로 되돌리면 위 2건이 정확히 실패한다(`tests 21 / pass 19 / fail 2`). 복원 후 21/21 재통과 확인.

---

## 계약서(`DESIGN_v3_stage1.md`) 갱신 부분 — 라운드 2

| 장 | 갱신 내용 |
|---|---|
| 7장 (저장) | "버전 키는 1 이상의 정수만, 그 밖은 1로 본다" 뒤에 **"단, 이미 있는 버전 1 기록을 덮지 않는다"** 를 명시. **귀속 우선순위 항목 신설**(정규 버전 키 > 구 저장의 옛 필드 > 잡키, 잡키는 빈 칸에만·원문 키 순서 무관, 귀속할 자리 없는 잡키 값은 버리되 실재 기록은 절대 삭제 금지 — 이 경로는 `.bak` 도 남지 않는다는 이유 병기) |
| 8장 `V3-SAVE-VERSION` | 손상 케이스에 **"유효한 버전 1 기록과 잡키가 한 칸에 함께 있으면 버전 1 기록이 보존된다"** 추가(잡키가 앞에 와도 동일·`.bak` 없음·재로드 및 `updateStage` 뒤에도 유지) |

---

## 라운드 2 검사 수치

```
node --test tests/rush3-*.test.mjs                     → tests 129 / pass 129 / fail 0   (라운드 1: 127, 신규 2)
node --test tests/rush3-save.test.mjs                  → tests  21 / pass  21 / fail 0
  · rawVersions 만 되돌린 상태                          → tests  21 / pass  19 / fail 2  (신규 2건이 정확히 실패)
node --test tests/rush-core|sim|meta .test.mjs         → tests  32 / pass  32 / fail 0
DEFS 버전 2·3·5 로 올린 상태에서 rush3 전량             → tests 129 / pass 129 / fail 0  (되돌린 뒤 재확인 129/129)
node newmode/v3/review/probe-local.mjs round2          → 라운드 1 'after' JSON 과 전량 일치(21판 변화 0)
  · keyboard 블록: 마우스 없음 x 391 / 마우스 먼저 x 391
```
원자료: `newmode/v3/review/probe-results-local-round2.json`(라운드 1 `-after.json` 과 정렬 후 diff 0)

## 라운드 2에서 고친 파일

| 파일 | 내용 |
|---|---|
| `rush3/save.js` | `rawVersions` 귀속 우선순위 3단계 + `isCanonVerKey` 신설(그 외 무변경) |
| `tests/rush3-save.test.mjs` | `V3-SAVE-VERSION` 손상 케이스 신규 2건 |
| `newmode/v3/DESIGN_v3_stage1.md` | 7장·8장 갱신(위 표) |

## 라운드 2에서 남는 불확실성

- **귀속할 자리가 없는 잡키의 값은 버려진다.** 정규 버전 칸을 밀어내지 않으려면 다른 수가 없다(임의의 빈 버전 번호에 옮겨 담으면 없던 기록을 만들어 내는 셈이다). 실재하는 기록은 잃지 않으므로 검수 요구는 충족하지만, "모든 바이트 보존"은 아니다.
- 이 경로는 최상위 형식이 멀쩡한 원문이라 **`.bak` 이 남지 않는다.** 라운드 2는 잃지 않도록 고친 것이지, 잃었을 때 되돌리는 장치를 넣은 것이 아니다.
- 실제 브라우저 `localStorage` 에서의 재현·확인은 하지 않았다(원문을 손으로 오염시켜야 하는 상황이라 Node 검사로만 확인). 저장 모듈은 storage 주입 구조라 경로가 같다.
- F2(경로 선택의 이유)·F3(S2 필수 선택 지점)은 이번에도 범위 밖 — 1단계 재미 판정은 여전히 열려 있다.
