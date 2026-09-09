# 스타포지 러시 v3 1단계 — 묶음 [렌더·셸·루프] 구현 보고 (r1, 2026-09-10)

담당 파일: `rush3/input.js`, `rush3/main.js`, `rush3/render.js`, `rush3.html`, `tests/rush3-loop.test.mjs`
계약서 `newmode/v3/DESIGN_v3_stage1.md`(r2) 1·2·6·7장 + 8장 V3-DETERMINISM·V3-INPUT 기준. Build-1·2 산출물(balance/weapons/stages/gates/supply/squad/combat/sprites/audio/save)은 **한 줄도 수정하지 않았고** export 만 썼다. 기존 `rush/*`·`rush.html`·`tests/rush-*.test.mjs` 도 손대지 않았다(`git status`: 신규 파일만 `??`). `rush/` 에서 import 하는 파일은 여전히 `rush3/stages.js`(rng) 하나뿐 — 셸·렌더는 `rush/main.js`·`rush/render.js` 를 import 하지 않고 헬퍼·골격만 옮겨 적었다.

## 만든 것

### rush3/input.js — `createInput()`
- `{ state: { pointerX, dragDx, keyDir, dragging, … }, onPointerDown/Move(x, pointerType), onPointerUp(), onPointerCancel(), onKey(code, down), snapshot(), reset() }`.
- 마우스(pointerType 'mouse' 또는 미지정) = 호버 절대 x(`pointerX`). 터치·펜 = `pointerdown` 에서 **절대 위치를 쓰지 않고**(`pointerX = null`, 남아 있던 마우스 호버 값도 지움) 이후 이동량만 `dragDx` 에 누적. 드래그 중 마우스 이벤트가 섞여도 절대 x 로 튀지 않는다. 뗀 뒤(`onPointerUp`) 마지막 누적분은 한 번 전달되고 이후 터치 이동은 무시.
- `onKey`: ArrowLeft/ArrowRight(+ KeyA/KeyD) → `keyDir = right − left`(동시면 0). 모르는 키는 false 반환(셸이 Space/Enter 로 넘긴다).
- `snapshot()` 은 `{ pointerX, dragDx, keyDir }` 를 돌려주고 `dragDx = 0`(같은 프레임의 두 번째 STEP 부터는 0). `reset()` = pointerX null·dragDx 0·keyDir 0·dragging false·키 상태 해제. `onPointerCancel` = reset.

### rush3/main.js — `hitButton`, `makeLoop`, `boot(canvas, deps)` (+ 보조 `missedLine`, `timeText`)
- **`makeLoop({ step = STEP, onStep, maxSteps = 5 })`** → `{ start(now), stop(now), frame(now) → 실행한 STEP 수, isRunning(), getAcc() }`. `now` 는 초 단위 주입. `frame`: run 상태가 아니면 아무 갱신 없이 0. run 이면 `acc = min(acc + dt, maxSteps·step)` 뒤 `step` 만큼 `onStep(step, i)` 반복(프레임당 최대 maxSteps). `start/stop` = `acc 0, last = now`. 부동소수 잔여(1e-9 미만)는 0 으로 정리해 60Hz 600 프레임 = 정확히 600 STEP.
- **`boot(canvas, deps)`**: 상태기계 `title → run → paused → result`. `deps` 로 `win/doc/now/raf/save/storage/audio/input/sprites/spriteBase` 를 주입할 수 있어 Node 에서 가짜 캔버스로 부트 가능(테스트). 반환 `{ dbg, ready, startRun, pause, resume, toTitle, getState, getRun, loop, input }`.
  - 스프라이트 로드(`loadSprites3`) 후 `raf(frame)` 시작. DPR 반영: 백킹스토어 = CSS 크기 × min(devicePixelRatio, 2), `ctx.setTransform` 으로 논리 480×800 유지(초기 + resize).
  - 프레임: `loop.frame(now)` → `onStep` 마다 `stepRun(run, input.snapshot(), STEP)` → 프레임 끝 `drainEvents(run)` 1회 소비 → 연출 갱신 → `view` 조립 → `renderer.draw(view)`. 판 종료(`run.over`) 뒤 여운(성공 1.3s / 실패 1.0s) 후 `finishRun`.
  - 입력 결선: `pointerdown`(버튼이면 버튼만, 아니면 run 상태에서 `input.onPointerDown`), `pointermove` → `input.onPointerMove`, window `pointerup/pointercancel`, `keydown/keyup`(ESC 일시정지 토글, ←→ 조향, Space/Enter = 타이틀 출격(lastStage)·결과 재도전·일시정지 해제). `e.code` 가 비어 오는 환경은 `e.key` 로 대체.
  - 자동 일시정지: `blur`·`visibilitychange(hidden)`·`pointercancel` → `input.reset()` + `pause()`(loop.stop → acc 0, bgmPause). 재개 시 `loop.start(now)`.
  - 오디오: 첫 pointerdown/keydown 에서 `unlock`, 타이틀·결과 = `nf_bgm_title`, 스테이지 = `nf_bgm_sector{1,2,3}a`, 정예 등장 = `nf_bgm_boss_sector{n}`. 음소거·음량 ±20% 버튼(일시정지 화면), 저장(`save.patch`).
  - 이벤트→연출: `fire` 는 프레임 합산 1회 `fire_<weapon>` 볼륨 `min(1, 0.4 + count/40)`; `supplyHit`→crateHit, `supplyOpen`→crateBreak+파편+보상 팝(0.5s 떠오른 뒤 0.3s 동안 부대로 흡수), `gateHit`→gateTick, `gateFlip`→gateFlip+'반전!', `gatePass`→±n 플로터(음수 적용 시 흔들림·비네트·hurt), `joinMany`(n≥3 이면 joinMany 음), `padTake`→'+1', `chainOn`→'증원 설비 가동!', `weaponSwap`→음+'○○ 장착!', `hurt`→흔들림·비네트·'−n', `unitLost`→붉은 파편, `kill`→파편+kill, `touch`→흔들림, `blast`→주황 파편, `elite`→0.8s '정예 접근!' 배너+elite 음+보스 BGM, `bossKill`→큰 파편+win 음, `lose`→lose 음. 파편 각도는 카운터 기반(전역 난수 없음).
  - 첫 플레이 안내: 저장 기록의 attempts 합이 0 인 출격에서 3초.
  - 저장: 출격 때 `attempts +1`·`lastStage`, 종료 때 `cleared`(성공 시 true 유지)·`bestSurvivors`(최대)·`bestTime`(성공 판 최단). 결과 화면 `saveOk = save.ok`.
  - `window.__rush3Dbg()` → `{ state, stageId, z, x, units, weapon, boss, enemies, bullets }`. 자동 부트는 `document.getElementById('game3')` 가 있을 때만.
- 결과 데이터: `{ won, survivors, peak, time, timeText, kills, missedLine, isBest, saveOk, nextId }`. `missedLine(run)` = 놓친 통 수·−게이트 통과 수·게이트/접촉/피격 손실을 ' · ' 로 이어 붙임(없으면 '놓친 것 없음').

### rush3/render.js — `createRenderer3(ctx, sprites) → { draw(view) }`
- `view.now` 만 쓴다(`performance.now` 없음, grep 0건). 화면 y = `LINE_Y − (z − run.z)`. 물체는 `run` 객체를 그대로 읽어 그린다(규칙 상태 변경 없음).
- 배경: BG1~3 세로 타일(스테이지별) + 그 위에 v3 도로 폭 80~400 밴드(알파 0.82) + 차선 2줄(대시 스크롤) + 도로 경계. 그림이 없으면 색 폴백.
- 벽: 회색 분리대(그림자·상단 하이라이트·줄무늬). 게이트 행: 칸 사각형(시각 높이 58, 판정 24 와 별개) + 부호 숫자(gateLabel: +3/−6/0) + 색(gateColor), 피격 시 흰 플래시·숫자 크기 튐(flashT), 통과 뒤 알파 0.32. bypass 행의 빈 길은 그리지 않는다.
- 보급: SUPPLY 스프라이트(폴백 상자) + 내용물(병사 실루엣 ≤6 + '+n' / 무기 아이콘+이름 / 파란 설비 '증원 설비') + 통 아래 주황 **내구 숫자**(병력 수와 구분). missed 는 알파 0.35. chain 발판 = 파란 발판 열 '+1'(회수 뒤 흐리게), 개봉 후 잠기기 전에는 '쏘면 +1' 안내.
- 적: `e_grunt/e_rusher/e_shooter` 스프라이트, 폴백 마름모/원/상자 + 마젠타 센서 점. HP 태그는 grunt 는 다쳤을 때만, 나머지는 항상. shooter 예고(aimT>0)는 부대 쪽 점선. 정예: `elite` 스프라이트(폴백 원), 하강 중 붉은 링 깜빡임, 발밑 HP 숫자, HUD 막대(90~390, y 76)+'정예 hp / max'.
- 부대: 실제 `units` 배열 — `units[0]` = 히어로(M01, 46px), 나머지 SOLDIER(22px). dy 순으로 그려 앞줄이 위에. 그림자·행진 바운스(`now` 기반)·hp 1 유닛 붉은 점·중심 삼각 마커(+위로 짧은 점선)·발밑 병력 수(피격 중 빨강).
- 탄: 무기별 색·폭(WEAPONS 참조)+흰 심. 적탄: 마젠타 구슬+흰 테(기존 램프탄 복제). 파편·플로터·보상 팝.
- HUD: 좌상 `STAGE n 제목` + `남은 거리 m`(정예 중 '정예 전투!', 격파 후 '작전 완료'), 우상 무기 칩(색 아이콘+이름) + 일시정지 버튼. 배너: 안내(3s, 마지막 0.5s 페이드)·'정예 접근!'(0.8s). 흔들림(shakeT)·피격 비네트(hurtT)·일시정지 오버레이·타이틀(워드마크·히어로·스테이지 3버튼 sub 에 기록)·결과 화면(성공/실패·생존·최고·시간·처치·놓친 것 한 줄·신기록·'기록 저장 안 됨').

### rush3.html
- Build-1 것에 `overscroll-behavior:none`·`user-select:none`·`canvas{display:block}`·`<noscript>` 만 추가. `<canvas id="game3">` + `rush3/main.js` 모듈 그대로.

### tests/rush3-loop.test.mjs — 7건
- **V3-DETERMINISM(1)**: `makeLoop` — start 전 frame 0 / dt 3초 → 정확히 5 STEP(onStep 인덱스 0~4, acc 0) / 이어지는 16.7ms → 1 STEP / stop 뒤 프레임 0·start 직후 dt 0 → 0·STEP×2 → 2 / 60Hz 600 프레임 = 600 STEP.
- **V3-DETERMINISM(2)**: STEP 인덱스별 입력열(호버 사인파·드래그·키 조향 혼합)을 30/60/120Hz dt 열(30초)에 얹어 실제 `stepRun` 으로 S1 진행 → STEP 수 1800 동일, 최종 상태(units·id 목록·z·x·weapon·kills·time·peak·bullets·enemies) deepEqual. 불규칙 dt(24/60/144/90Hz 섞임)도 STEP 수가 같으면 동일 상태.
- **V3-INPUT(1)**: 마우스 호버 절대 x / 터치 시작 시 pointerX null(튀지 않음)·dragging true / 이동 +20−10 → dragDx 10 / snapshot 이 dragDx 소비 / 뗀 뒤 마지막 누적 1회 전달·이후 무시 / keyDir 좌우 동시 0.
- **V3-INPUT(2)**: pointercancel/reset → dragging false·dragDx 0·keyDir 0·pointerX null / 드래그 중 마우스 이벤트가 섞여도 절대 x 로 튀지 않음.
- **V3-SHELL(1)**: DOM 없이 `main.js` import(boot/makeLoop 함수), `hitButton` 사각형 안·경계·disabled, `missedLine`·`timeText`.
- **V3-SHELL(2) boot 스모크**: 가짜 캔버스(Proxy 기록 ctx)·가짜 시계·rAF 큐·가짜 오디오·Map 저장소로 부트 → 타이틀 렌더(그림 없이 폴백) → 스테이지 1 버튼 클릭(CSS 240×400 → 논리 변환) → attempts 1·lastStage 1 → 60프레임에 z 150~200 전진·탄 발생 → `pause()` 중 30프레임 z 불변·렌더 지속 → resume → 발사음 볼륨 0.4~1 → 봇(V3-SIM 규칙)으로 완주 → `result`·cleared·bestSurvivors·bestTime 저장·elite/win 음 → '다음 작전' 클릭 → S2 출격·attempts 1 → 터치 pointerdown 만으로 tx 불변, 드래그 +30 CSS px → tx +60 논리 px → pause → toTitle.
- **V3-SHELL(3)**: setItem 이 throw 하는 저장소로 부트 → S2 13.3초 진행(첫 게이트 통과·우측 무기 통 놓침) → 전 유닛 hp 0 → 규칙 경로(prune → lose)로 전멸 → `result`, won false, missedSupplies ≥ 1, `save.ok === false`, cleared false, 결과 화면 렌더 예외 없음.

## 테스트 실행 결과(실제 실행 출력)
- `node --test tests/rush3-loop.test.mjs` → tests 7 / pass 7 / fail 0
- `node --test tests/rush3-*.test.mjs` → tests 113 / pass 113 / fail 0 (기존 106 + 신규 7)
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `node --test tests/test-quality-ratchet.test.mjs` → tests 2 / pass 2 / fail 0 (신규 테스트에 소스 정규식 대조 없음)
- `grep Math.random rush3/{main,render,input}.js` → 0건. `grep performance rush3/render.js` → 0건.

## 브라우저 실기 확인(로컬 nocache-server 8779, Chrome 페인, DPR 1, 콘솔 오류 0)
- 타이틀 → STAGE 1 클릭 → 마우스 호버 조향 → 게이트(+1 → +15 파랑)·병사 통·무기 통 → 정예 → **결과(성공 38.6s·22명·처치 11·'보급 통 1개를 놓침'·신기록)** → '다음 작전' → S2: 두 칸 게이트(−8 빨강 / +11 파랑 표시)·벽(회색 분리대)·좌 통로 병사 통 '+3·내구 6'·기관총 전환(시안 탄·칩 '기관총')·저격수 2(스프라이트+HP 태그)·+2/−10 게이트 통과 '+20' 플로터 → 결과(성공 44.0s·47명). localStorage 에 `starforgeRush.v3` 기록 확인.
- 저장 기록을 비우고 재로드 → 첫 출격 3초 안내 배너 표시 확인.
- ESC: `window.dispatchEvent(KeyboardEvent 'Escape')` 로 paused 전환·오버레이·계속하기/스테이지 선택/음량 버튼 표시 확인. (페인의 `key` 동작 자체는 페이지에 닿지 않아 실제 키보드는 미확인 — 아래 목록.)
- 탐침(콘솔에서 `boot()` 를 별도 캔버스에 띄워 정예 hp 를 100000 으로): '정예 접근!' 배너·정예 스프라이트(B1_grader)·HUD HP 막대+숫자·부채꼴 마젠타 탄·유닛 피격 '−1'·전멸 → **실패 결과('피격 손실 1', 버튼 2개)** 확인. S3 탐침: 증원 설비 개봉 → 파란 발판 열 '+1' 15개·'쏘면 +1'·회수되며 병력 3→9, 중화기(주황 굵은 탄·칩 '중화기')·잡졸 접촉 '−1'+붉은 병력 수.

## 계약서·지시와 다르게 했거나 해석한 것(조율자 확인 요망)
1. **`makeLoop` 의 인터페이스**: 계약서는 "누적기, 테스트 가능" 이라고만 해서 `{ start, stop, frame(now) → n, isRunning, getAcc }` 로 정했다. `pause/resume` 이름 대신 `stop/start`(둘 다 acc 0·last = now). 부동소수 잔여(<1e-9) 를 0 으로 정리하는 보정을 넣었다(계약서 미규정, 60Hz 누적 오차 방지).
2. **입력 스냅샷은 STEP 마다** 찍는다(계약서 4장 "셸이 STEP 직전에 스냅샷"). 한 프레임에 STEP 이 여러 번이면 dragDx 는 첫 STEP 이 전부 소비하고 나머지 STEP 은 0 — 계약서 문구 그대로이나, 30Hz 에서 드래그가 2 STEP 중 1 STEP 에만 실리는 셈이다(결과는 결정적).
3. **`reset()` 이 마우스 호버 `pointerX` 도 지운다**(계약서는 드래그 해제·dragDx 0 만). blur 뒤 오래된 호버 값으로 부대가 움직이는 것을 막기 위함. 다음 pointermove 에서 곧바로 복구된다.
4. **터치 pointerdown 이 마우스 호버 값을 지운다**: 마우스로 호버한 뒤 터치로 드래그하면 계약서 1단계 조향식(`tx = pointerX` 뒤 `+= dragDx`)에서 pointerX 가 매 STEP 드래그를 덮어쓰므로, 터치 시작에 pointerX 를 null 로 둔다(계약서 미규정).
5. **키 조향은 ArrowLeft/Right 외 KeyA/KeyD 도 받는다**(추가). `e.code` 가 빈 환경은 `e.key` 로 대체.
6. **버튼 sub 기록 표기·타이틀 레이아웃**: 계약서 "스테이지 선택 3버튼·기록" 을 버튼 sub('완료 · 최고 n명 · 시간' / '도전 n회' / '미도전') 로 넣었다. 잠금(이전 스테이지 클리어 조건)은 계약서에 없어 넣지 않았다 — 세 스테이지 전부 바로 고를 수 있다.
7. **bestTime** = 성공 판의 최단 시간(생존 수와 독립). 계약서 7장은 필드만 정의하고 규칙이 없다. `isBest`(신기록 표시) = 성공 && 생존 > 이전 bestSurvivors.
8. **결과 화면 지연**: `run.over` 뒤 성공 1.3s / 실패 1.0s 여운을 두고 결과로 넘어간다(파편 연출용, 계약서 미규정). 그 사이 `loop` 는 돌지만 `stepRun` 은 over 라 즉시 반환.
9. **배경 도로**: BG1~3 그림은 구 게임 도로 폭(30~450) 기준이라 그 위에 v3 도로 밴드(80~400, 알파 0.82)를 얹었다. 그림의 도로와 v3 도로가 겹쳐 보이는 것은 의도(게이트·벽 폭과 일치).
10. **게이트 시각 높이 58**(판정 24 와 다름) — 숫자가 읽히게. 판정은 combat 그대로.
11. **음량 저장값**은 0~1(save3 계약)로 저장한다(구 게임은 0~100).
12. `boot` 가 `deps` 주입(win/doc/now/raf/save/audio/input/sprites)과 반환 객체(`getRun` 등)를 갖는다 — 계약서 시그니처 `boot(canvas, deps)` 를 넓게 해석. 자동 부트 경로는 deps 없이 호출.

## 하지 못한 것·의심스러운 것
- **[규칙/밸런스, 내 담당 아님 — 가장 중요] 정예가 화면에 들어오기 전에 죽는다.** 정예 스폰 z = run.z + 760(화면 y −120), 아군 탄 정리선 = run.z + 780 이라 스폰 직후 탄이 닿는다. S1(hp 40, 병사 22 소총) 은 스폰 후 ~0.8s, S2(hp 70, 47명 기관총)도 ~0.8s 에 격파돼 '정예 접근!' 배너·HP 막대·부채꼴 탄이 실제 판에서 **한 번도 보이지 않았다**(탐침으로만 확인). 잡졸도 같은 이유로 대개 화면 위 가장자리에서 죽어 중화기 폭발이 잘 안 보인다. 조치 후보: 정예 하강 중 무적, 또는 탄 정리선을 스폰 z 보다 낮게(예: run.z + 700), 또는 정예 hp 상향. combat 보고서의 "게이트 값이 쉽게 maxValue 에 닿는다" 관찰과 같은 계열이다.
- 실제 키보드(ESC/←→/Space)는 페인의 키 입력이 페이지에 닿지 않아 dispatchEvent 로만 확인했다. 아래 목록 참조.
- 오디오는 가짜 객체로 호출 순서·볼륨만 검증(실기 소리 미확인). BGM 파일 선택(sector1a/2a/3a·boss_sector1~3)은 임의.
- 터치 드래그·blur·visibilitychange 자동 일시정지는 Node 가짜 이벤트와 API 호출로만 검증(실기 모바일 미확인).
- 렌더의 그리기 호출은 Proxy ctx 로 "예외 없이 돈다" 만 잠갔다(픽셀 검증 없음). 육안 확인은 위 스크린샷 기준.
- `fitCanvas` 는 초기·resize 때만 돈다. CSS 크기가 레이아웃 뒤에 바뀌는 환경(주소창 접힘 등)에서는 resize 이벤트에 의존.

## 브라우저에서 확인해야 할 것(조율자·이사님)
1. **실제 키보드**: ESC 일시정지/해제, ←→ 조향(마우스가 캔버스 위에 있으면 호버가 우선해 키가 안 먹는다 — 계약서 1단계 조향식 그대로), Space/Enter 출격·재도전.
2. **터치(모바일)**: 손가락을 댄 위치로 부대가 튀지 않는지, 드래그 감도(CSS px 1 = 논리 px 2 근처), 손을 뗀 뒤 정지, 두 손가락·화면 회전.
3. **자동 일시정지**: 다른 탭으로 전환·홈 화면·전화 수신 뒤 돌아왔을 때 paused 화면 + 드래그 상태 해제, 재개 뒤 튐 없음.
4. **DPR 2~3 기기**: 글자·스프라이트 선명도, `setTransform` 뒤 버튼 히트 위치 일치.
5. **정예 전투**: 위 "화면에 들어오기 전에 죽는" 문제를 실기에서 재확인(규칙 조정 필요).
6. **오디오**: 첫 터치 뒤 BGM 시작, 발사음 볼륨이 병력에 따라 커지는지(0.4→1), 음소거·음량 버튼 저장 유지, iOS Safari 자동재생.
7. **성능**: 병력 100+ 에서 60fps 유지(유닛마다 그림자·바운스·탄 그리기), 저사양 안드로이드.
8. **가독성**: 배경 그림 위 도로 밴드가 어색하지 않은지, 통과한 게이트(흐림)가 부대 병력 수와 겹칠 때, 결과 화면 뒤에 HUD 가 비쳐 보이는 것.
9. **localStorage 차단(시크릿·쿠키 차단)**: 타이틀·결과 하단 '기록 저장 안 됨' 표시.

---

# 수정 라운드 1 (2026-09-10) — 검토 지적 2건(터치 드래그 입력) 반영

담당 파일 중 손댄 것: `rush3/input.js`(재작성), `rush3/main.js`(포인터 결선 3줄), `tests/rush3-loop.test.mjs`(단언 강화 + 테스트 1건 추가 + 스모크 보강). `rush3/render.js`·`rush3.html` 은 변경 없음. 기존 `rush/*`·`rush.html`·`tests/rush-*.test.mjs` 는 여전히 미수정(`git status`: 신규 파일만 `??`).

## 지적 1 — 터치 드래그 중 마우스 pointermove 가 dragDx 에 누적됨 [major] → 수정
- 원인: `onPointerMove` 가 `dragging` 이면 pointerType 을 보지 않고 `dragDx += x − lastX` 를 실행했다.
- 수정(`rush3/input.js`): 드래그 중이면 `isMouse(pointerType)` 인 move 는 **return(누적 금지, lastX 도 갱신 안 함)**. 드래그 중의 **마우스 pointerdown 도 무시**(lastX 덮어쓰기 방지). 드래그 중이 아닐 때만 마우스 move 가 `pointerX` 를 갱신.
- 실측(수정 후): `onPointerDown(100,'touch'); onPointerMove(150,'mouse'); snapshot()` → `{ pointerX: null, dragDx: 0, keyDir: 0 }`(수정 전 dragDx 50).
- 테스트: V3-INPUT(2) 의 해당 단언을 `assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0 })` 로 강화하고, 이어서 손가락 +10 → dragDx 10 / 드래그 중 마우스 down(300) 뒤 손가락 +10 → dragDx 10(lastX 미오염) 을 추가.

## 지적 2 — pointerId 미추적(둘째 손가락이 lastX 를 덮어써 dragDx 점프, window pointerup 이 어느 포인터든 드래그 종료) [major] → 수정
- 수정(`rush3/input.js`): `state.pointerId` 추가. 시그니처 `onPointerDown(x, pointerType, id)` / `onPointerMove(x, pointerType, id)` / `onPointerUp(id)`.
  - down: 드래그 중이면 어떤 down 도 무시(둘째 손가락 포함). 터치 down 이 드래그를 시작하며 `pointerId = id`.
  - move: 드래그 중 마우스 또는 `id !== pointerId` 인 move 는 무시.
  - up: 드래그 중 `id !== pointerId` 인 up 은 드래그를 끝내지 않음. 주인 손가락 up → `dragging=false, pointerId=null, lastX=null`.
  - `id` 가 없는 호출(undefined/null)은 드래그 주인으로 간주(테스트·구형 환경 호환). `onPointerCancel` 은 손가락과 무관하게 `reset()`(셸이 어차피 자동 일시정지).
- 수정(`rush3/main.js` 341~352행): `input.onPointerDown(x, e.pointerType, e.pointerId)` / `onPointerMove(x, e.pointerType, e.pointerId)` / window `pointerup` → `input.onPointerUp(e.pointerId)`.
- 실측(수정 후): `down(100,'touch',1); move(110,'touch',1); down(300,'touch',2); move(120,'touch',1); snapshot()` → `dragDx: 20`(= 첫 손가락 이동 10+10 만, 수정 전 −170).
- 테스트 추가: **V3-INPUT(3) '두 손가락'** — 둘째 down 뒤 첫 손가락 move → dragDx 가 첫 손가락 이동량만 / 둘째 손가락 move 무시 / 둘째 up 은 드래그를 끝내지 않음 / 첫 up 뒤 둘째 손가락이 새로 down 하면 그 손가락이 새 드래그(댄 위치로 튀지 않음) / pointercancel 은 전체 reset.
- 스모크(V3-SHELL 2) 보강: 가짜 `win`(addEventListener/fire) 을 주입해 **실제 결선 경로**로 검증 — canvas `pointerdown/pointermove` 에 `pointerId`·`pointerType` 을 실어 둘째 손가락 down + 마우스 move + 둘째 손가락 move 뒤 `tx` 불변(정확히 같음) → 첫 손가락 +10 CSS px → `tx` +20 논리 px → window `pointerup(id 2)` 뒤 dragging 유지 → `pointerup(id 1)` 로 종료 → window `keydown Escape` 로 일시정지/재개 → 터치 드래그 중 window `blur` → paused + dragging false. (이전 라운드는 `win: null` 이라 window 리스너·키·blur 결선이 스모크에서 실행되지 않았다 — 이번에 결선까지 잠갔다.)

## 테스트 실행 결과(실제 실행 출력)
- `node --test tests/rush3-loop.test.mjs` → tests 8 / pass 8 / fail 0 (이전 7 + 두 손가락 1)
- `node --test tests/rush3-*.test.mjs` → tests 114 / pass 114 / fail 0
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `node --test tests/test-quality-ratchet.test.mjs` → tests 2 / pass 2 / fail 0

## 브라우저 실기 확인(로컬 nocache-server 8779, Chrome 페인, DPR 1, `PointerEvent` dispatch 로 손가락 2개 흉내)
- 타이틀 → STAGE 1 → 터치 down(부대 x 변화 0) → 드래그 +20 논리 px(x +19, 추종 중) → **둘째 손가락 down(멀리 420) + 마우스 move + 둘째 손가락 move → x +1(직전 목표 잔여분만, 튐 없음)** → 첫 손가락 +10 → 누적 +30 → 둘째 up 뒤 첫 손가락 +10 → 누적 +40 → 첫 up 뒤 이동 → 변화 없음. 상태 run 유지.
- 콘솔: 게임 자원 오류 없음(`ERR_CONNECTION_REFUSED` 1건은 서버 기동 직후 페인이 첫 내비게이션을 거부한 흔적으로 판단, 게임 자원 요청은 전부 200).

## 이번 라운드에 해석·추가한 것(조율자 확인 요망)
1. **드래그 중 마우스 pointerdown 도 무시**한다(지적은 move 만). 마우스 down 이 lastX 를 덮어쓰면 같은 점프가 나므로 함께 막았다.
2. **드래그 중 둘째 손가락 down 은 통째로 무시**(주인 교체 없음). 첫 손가락을 떼면 그때부터 둘째 손가락이 새로 down 해야 드래그가 시작된다 — 즉 첫 손가락을 뗀 뒤 둘째 손가락을 그냥 움직여도 부대는 안 움직인다(둘째 손가락의 down 이 이미 무시됐으므로). 라스트워식 한 손가락 조작에는 맞지만, '손가락 교대' 를 자연스럽게 잇고 싶으면 up 때 살아 있는 다른 포인터로 주인을 넘기는 방식이 필요(현재 미구현, 계약서 미규정).
3. `id` 없는 호출은 주인으로 간주 — 테스트 편의·pointerId 가 없는 환경 대비. 브라우저 셸은 항상 `e.pointerId` 를 넘기므로 실기에서는 항상 id 로 판별된다.

## 의심스러운 것(담당 외)
- nocache 서버에서 **발사음마다 `nf_sfx_vulcan_*.ogg` GET 이 다시 나간다**(네트워크 로그에 수백 건). 캐시가 켜진 배포 환경에서는 캐시가 받겠지만, 오디오 모듈(Build-2 `rush3/audio.js`)이 재생마다 새 `Audio`/fetch 를 만드는 구조라면 모바일에서 지연·배터리 문제가 될 수 있다. 확인 요망.
- 이전 라운드의 '정예가 화면에 들어오기 전에 죽는다' 문제는 이번 라운드 범위 밖이라 그대로다.

## 브라우저에서 확인해야 할 것(추가분)
- **실기 모바일 두 손가락**: 첫 손가락 드래그 중 둘째 손가락을 댔다 떼도 부대가 튀지 않는지, 첫 손가락을 뗀 뒤 둘째 손가락으로는 새로 대야 움직이는지(위 해석 2).
- 펜(pointerType 'pen')은 터치와 같은 드래그 경로 — 태블릿에서 확인.
- 이전 목록 1~9 는 그대로 유효.

---

# 수정 라운드 2 (2026-09-10) — 검토 지적 1건(게이트 피격 플래시 영구 고정) 반영

담당 파일 중 손댄 것: `rush3/main.js`(fx 플래시 타이머), `rush3/render.js`(drawGateRow 가 fx 만 읽음), `tests/rush3-loop.test.mjs`(테스트 1건 추가). `rush3/input.js`·`rush3.html` 은 변경 없음. 규칙 모듈(combat/gates 등)·기존 `rush/*`·`rush.html`·`tests/rush-*.test.mjs` 는 미수정(`git status`: 신규 파일만 `??`).

## 지적 1 — 게이트 칸 피격 플래시가 영구 고정 [major] → 수정
- 원인(지적 그대로): `render.js` 가 규칙 상태 `cell.flashT` 를 직접 읽었는데, 계약서 4장 STEP 순서에 flashT 감소 단계가 없어 `gates.js` 가 0.12 로 설정만 하고 아무도 줄이지 않았다. 첫 탄 이후 칸 배경이 흰색(알파 0.85)·숫자 46px 흰색으로 판 끝까지 남아 3-2장 부호색·6장 '피격 시(일시적) 흰 플래시' 를 어겼다.
- 수정(수정안 A, 셸 책임):
  - `rush3/main.js`: `makeFx()` 에 `gateFlash: {}` 추가. `handleEvents` 의 `gateHit`/`gateFlip` 에서 `fx.gateFlash[ev.id + ':' + ev.idx] = GATE_FLASH_SEC`(= `BAL3.gate.flashT` 0.12; balance.js 는 담당 밖이라 `FX.gateFlashSec` 를 새로 넣지 않고 기존 `BAL3.gate.flashT` 를 그대로 참조). `updateFx(dt)` 에서 항목마다 `-= dt`, 0 이하는 `delete`. paused 뷰의 `{...fx}` 복사에 `gateFlash: { ...fx.gateFlash }` 포함. 테스트용으로 반환 객체에 `getFx()` 추가.
  - `rush3/render.js`: `drawGateRow(row, sy, fx)` — `flash = (fx.gateFlash[row.id + ':' + c.idx] ?? 0) / BAL3.gate.flashT`(상한 1). `cell.flashT` 는 더 이상 읽지 않는다(`grep flashT rush3/render.js` → 주석 1줄 + `BAL3.gate.flashT` 참조 1줄뿐).
- 규칙 상태는 그대로: `cell.flashT` 는 gates.js 가 0.12 로 두고 셸은 읽지도 쓰지도 않는다(테스트에서 단언).
- 테스트 추가(`tests/rush3-loop.test.mjs`): **V3-SHELL '게이트 피격 플래시는 셸 fx 타이머'** — S1 에서 pointerX 320 으로 진행 → 첫 `gateTick` 시점에 `fx.gateFlash` 항목 정확히 1개(키 `rowId:idx`, 0 < v ≤ 0.12) / `cell.flashT` 는 0.12 그대로 / 행 통과까지 계속 맞히는 동안 값이 0.12 를 넘지 않음(재피격은 갱신만) / 행 통과 뒤 12프레임(0.2s) 지나면 그 행의 항목이 전부 사라짐.

## 테스트 실행 결과(실제 실행 출력)
- `node --test tests/rush3-loop.test.mjs` → tests 9 / pass 9 / fail 0 (이전 8 + 플래시 1)
- `node --test tests/rush3-*.test.mjs` → tests 115 / pass 115 / fail 0
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `node --test tests/test-quality-ratchet.test.mjs` → tests 2 / pass 2 / fail 0

## 브라우저 실기 확인(로컬 nocache-server 8779, Chrome 페인, DPR 1)
- 콘솔 탐침(별도 캔버스에 `boot()`, S1 pointerX 320): 첫 게이트 피격 = **프레임 108**(검토자 실측과 동일) 에 `fx.gateFlash = {"g1:0": 0.103}` → 행 통과 시점 `{}` → 12프레임 뒤 `{}`. `cell.flashT` 는 0.12 그대로(셸 미접촉).
- 실제 플레이(타이틀 → STAGE 1 → 마우스 호버 x≈320) 스크린샷 3장(3s·4s·5s): 게이트 칸이 **+5 → +8 → +11** 로 커지는 동안 숫자는 **시안(파랑)**, 칸 배경은 **어두운 색**, 테두리 시안 — 흰색 고정 없음(수정 전엔 첫 탄 뒤 계속 흰색).
- 픽셀 단위 탐침(getImageData)은 내가 만든 탐침 캔버스의 CSS 높이가 767 로 잘려 변환이 걸리는 바람에 좌표가 어긋나 판독 불가 → 스크린샷 육안으로 대체. 플래시 '순간'(0.12s = 7프레임) 자체는 스크린샷 타이밍상 잡지 못했고 fx 값·테스트로만 확인.

## 이번 라운드에 해석·추가한 것(조율자 확인 요망)
1. `FX.gateFlashSec` 를 balance.js 에 새로 넣지 않고 `BAL3.gate.flashT`(0.12) 를 셸이 그대로 참조했다(balance.js 는 이 묶음 담당이 아님). 조율자가 balance 에 `fx.gateFlashSec` 를 두고 싶다면 main.js 69행 한 줄만 바꾸면 된다.
2. `boot()` 반환 객체에 `getFx()` 를 추가했다(테스트·콘솔 관찰용, 게임 동작 영향 없음).
3. 대안 B(combat.js 5단계 뒤 `flashT -= STEP`)는 쓰지 않았다 — 규칙 모듈 미수정. 규칙 상태의 `cell.flashT` 는 이제 아무도 읽지 않는 필드가 됐다(계약서 3-2 데이터 형태 유지를 위해 남겨 둠).

## 관찰(담당 외, 참고)
- 첫 게이트 피격(프레임 108)은 게이트가 아직 화면 위(y ≈ −220)에 있을 때 일어난다 — 탄 정리선 `run.z + 780` 이 화면 상단(`run.z + 560`)보다 멀어서다. 그래서 게이트 값이 화면에 들어올 때 이미 +5 안팎이고, 플레이어는 '0 에서부터 키우는' 첫 몇 발의 플래시를 보지 못한다. r1 보고서의 '정예가 화면에 들어오기 전에 죽는다' 와 같은 원인(탄 사거리 > 화면). 규칙/밸런스 결정 사항.

## 브라우저에서 확인해야 할 것(추가분)
- 실기에서 탄이 게이트에 맞는 순간 칸이 **잠깐(0.12s)** 하얗게 번쩍이고 숫자가 튀었다가 곧 파랑/빨강으로 돌아오는지(스크린샷으로는 순간을 못 잡았다). 음수 칸(S2 −8)이 맞을 때 빨강 → 플래시 → 빨강, 0 을 넘는 순간 '반전!' 과 함께 파랑으로 바뀌는지.
- 이전 목록(r1 1~9, 수정 라운드 1 추가분)은 그대로 유효.
