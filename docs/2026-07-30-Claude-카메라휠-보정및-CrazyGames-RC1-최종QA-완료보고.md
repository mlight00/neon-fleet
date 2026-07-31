# 카메라 휠 보정 및 CrazyGames RC1 최종 QA — 완료보고

- 작성: 2026-07-30
- 작업지시서: `docs/2026-07-30-Claude-카메라휠-보정및-CrazyGames-RC1-최종QA-작업지시서.md`
- 선행 검토: `docs/2026-07-30-Codex-전투카메라-검토결과.md`
- 워크트리: `E:\workspace\claude\neon-fleet-worktrees\stage1-analytics` (브랜치 `claude/neon-fleet-analytics-stage1`, 커밋 없음)

---

## 1. 한 줄 결론

Codex가 지적한 세 가지(가로 휠 오작동·정밀 터치패드 과민·입력 anchor 1프레임 지연)를 **렌더·입력에만** 보정했고, 게임 규칙은 건드리지 않았으며, 실이벤트 테스트 16개를 추가해 **자동 테스트 718개 전부 통과(0 실패)** + 실제 Chrome 4모드 QA + 전투요소 포함 스크린샷 + CrazyGames RC1 빌드(200파일·44.67MB·ZIP 43.94MB, 50MB 미만) 재검증까지 마쳤다. **커밋·푸시·머지·배포·업로드는 하지 않았다.**

---

## 2. 작업 전 기준선 (§1)

작업 착수 시 실행·기록:

```text
git status --branch : claude/neon-fleet-analytics-stage1
node --test tests/*.test.mjs → tests 702 / pass 702 / fail 0
node scripts/build-crazygames-basic.mjs → 199파일 / 44.66MB / ZIP 43.94MB
git diff --check → 화이트스페이스 오류 0 (LF/CRLF 안내 2건만)
```

작업지시서 기준값(702 pass·199파일·44.66MB·43.94MB)과 **정확히 일치** → 기준선 정상. Stage 1·Prolific·CrazyGames·카메라 미커밋 변경을 전부 보존하고 되돌리지 않았다.

---

## 3. 수정 파일과 이유

**신규**

| 파일 | 줄 수 | 이유 |
|---|---|---|
| `js/wheel-input.js` | 83 | 휠 정규화·누적·결정을 순수 함수로 분리(가로 휠·터치패드 보정). DOM·시간 전역 의존 0 → 실이벤트 테스트 가능 |
| `tests/wheel-input.test.mjs` | 12케이스 | 가로/수평·±1누적·deltaMode·Ctrl·오버레이·임계 검증(실이벤트) |
| `tests/camera-anchor-sync.test.mjs` | 4케이스 | 현재 프레임 anchor 역변환·첫 프레임·빠른 이동 + 배선 가드 |

**수정**

| 파일 | 이유 |
|---|---|
| `js/main.js` | 휠 리스너를 `resolveWheelZoom` 얇은 래퍼로 교체 + `syncCameraAnchor()` 신설·`update()`/`draw()` 배선(§3) |
| `tests/camera-zoom-wiring.test.mjs` | 리팩터 반영 — CW-02(draw는 syncCameraAnchor 사용), CW-07(휠은 resolveWheelZoom 위임). 로직은 wheel-input 테스트로 이관 |

`js/input.js`·`js/camera-zoom.js`는 이번 회차 변경 없음(역변환 계약 그대로 재사용). `git diff --check` 정상.

---

## 4. 가로 휠 수정 증거 (§2.1 버그1)

Codex 재현: `deltaX=40, deltaY=0` → 목표 배율 1.00 → **0.95**(축소 오작동).

보정: `resolveWheelZoom`에서 `deltaY===0` 또는 `|deltaX| >= |deltaY|`이면 변화 0 + `preventDefault` 미호출(정상 가로 스크롤 허용).

실제 Chrome(8343, 전투 중) 합성 이벤트 결과:

| 입력 | 배율 전→후 | preventDefault |
|---|---|---|
| `deltaX=40, deltaY=0` | 1.00 → **1.00** | **false** |
| `deltaX=40, deltaY=10`(수평 우세) | 1.00 → 1.00 | false |
| `deltaX=40, deltaY=-40`(동률) | 1.00 → 1.00 | false |

→ 가로/수평 우세 입력이 더 이상 카메라를 건드리지 않고, 페이지 가로 스크롤도 막지 않는다.

---

## 5. 정밀 터치패드 누적 로직과 수치 (§2.1 버그2)

Codex 재현: `deltaY=-1` 6회 → 1.00 → **1.30**(이벤트마다 5%씩 튐).

보정 로직(`js/wheel-input.js`):

- `normalizeWheelDelta(event, viewportHeight)` — `deltaMode` 정규화: `PIXEL(0)` 그대로, `LINE(1)` × **33px**(3줄≈99px≈전통 한 칸 100px), `PAGE(2)` × 뷰포트 높이. 브라우저 상수 없어도 숫자 0/1/2 안전 처리.
- `createWheelStepAccumulator({thresholdPx:60, idleResetMs:200})` — 수직 delta 픽셀 누적, **임계 60px** 도달 시에만 한 단계(-1 축소/+1 확대), **한 이벤트 최대 한 단계**(초과분 폐기), **방향 전환·idle 200ms 초과 시 잔여 초기화**.
- `resolveWheelZoom` 순서: Ctrl/Cmd 가드 → 전투/오버레이 가드 → 수평 우세 가드 → 정규화·누적. 유효 수직이면 임계 미도달이라도 `preventDefault`(캔버스 위 페이지 스크롤 차단).

실제 Chrome 결과:

| 입력 | 결과 | 판정 |
|---|---|---|
| `deltaY=-1` × 6 | 1.00 유지, preventDefault ×6 = true | 임계(60px) 미달 → 무변화 ✅ |
| `deltaY=-20` × 3 | 1.00 → 1.00 → **1.05** | 누적 60px 도달 시 정확히 1단계 ✅ |
| 전통 휠 `deltaY=-100` | 1.00 → **1.05** | 한 이벤트 = 한 단계 ✅ |
| 전통 휠 `deltaY=+100` | 1.00 → **0.95** | 아래 = 축소 ✅ |
| `deltaY=-1000` | +1 (잔여 0) | 최대 한 단계, 이월 없음 ✅ |

---

## 6. 현재 프레임 anchor 동기화 (§3)

기존 순서에서 `input.tick()`이 직전 프레임 `draw()`가 갱신한 anchor를 사용 → 고배율·빠른 이동·전투 첫 프레임에 마우스-함선 목표가 한 프레임 어긋날 수 있었다.

보정: `syncCameraAnchor()` 신설(전투 아님·run/squad 없음 방어). 순서 보장:

```text
camera.current 보간(frame)
syncCameraAnchor()      ← update()의 input.tick 직전
input.tick(dt)
squad.update(dt)
draw() (그릴 시점 syncCameraAnchor 재호출)
```

카메라 값은 렌더/좌표 변환 전용 — 규칙 계산에 들어가지 않는다.

실제 Chrome 측정: 매 프레임 `camera.anchorX`가 `squad.x`와 **정확히 일치**(예: 253.85·266.09·276.93·286.51·294.99 연속), 프레임 시작 anchor로 역변환 시 **오차 0px**(S0=294.99, 화면 X=360, zoom 1.30 → targetX 345 = 기대 345).

---

## 7. 신규 테스트와 전체 테스트 수 (§4)

- 신규 **16개**: `wheel-input.test.mjs` 12(WI-01~11 필수 + WI-th 임계 가드), `camera-anchor-sync.test.mjs` 4(AS-01~03 필수 + AS-04 배선 가드).
- 작업지시서 §4 필수 14항목 매핑: 1→WI-01, 2→WI-02, 3→WI-03, 4→WI-04, 5→WI-05, 6→WI-06, 7→WI-07, 8→WI-08, 9→WI-09, 10→WI-10, 11→WI-11, 12→AS-01, 13→AS-02, 14→AS-03. (보강 2: WI-th, AS-04)
- 소스 정규식이 아닌 **실제 이벤트 형태 객체·실제 input.js 배선**으로 검증.

```text
node --test tests/*.test.mjs
tests 718 / pass 718 / fail 0   (기준 702 + 신규 16)
git diff --check → 화이트스페이스 오류 0 (LF→CRLF 안내 2건만; 실제 오류와 구분됨)
```

---

## 8. 실제 Chrome 휠·좌표 QA (§5)

포트 **8343**(신선 서버, 모듈 캐시 회피), 4개 URL 로드.

**휠**(합성 이벤트, 전투 중):
- 실 마우스 위/아래 한 칸 → +5%/−5% (§5 물리 마우스 항목)
- 합성 `deltaY=-1` 연속 → 무변화(임계 누적)
- 합성 수평 `deltaX=40, deltaY=0` → 무변화·preventDefault 안 함
- 빠른 방향 전환 → 잔여 초기화(WI-07)
- Ctrl/Cmd+휠 → 배율 1.10 유지, preventDefault false(브라우저 확대 보존)
- 물리 정밀 터치패드는 이 환경에 없어 **합성 이벤트 검증**으로 명시(작업지시서 §5 단서 준수)

**입력 좌표**(역변환 오차):

| 배율 | 화면 좌(15%)·중(50%)·우(85%) 최대 오차 |
|---|---|
| 85% | **0.00px** |
| 100% | **0.00px** |
| 130% | **0.00px** |

- 확대 보간 중 마우스 정지 → 목표 재계산 정합(AS-01/CI-04)
- 함대 빠른 좌우 이동 → 매 프레임 오차 ≤0.01px(AS-03)
- 첫 전투 프레임 → 초기 anchor(0,0) 미사용(AS-02)
- 터치 드래그 → 확대 배율 역변환(CI-06)

---

## 9. 85/100/130 전투 스크린샷 (§6)

같은 전투 상태(섹터 1, 함대 하단중앙, `step(0)` 렌더-only로 동일 프레임)에서 배율만 바꿔 저장.

```text
docs/qa/camera-zoom-rc1/camera-combat-085pct.jpg  (14,067 B)
docs/qa/camera-zoom-rc1/camera-combat-100pct.jpg  (14,973 B)
docs/qa/camera-zoom-rc1/camera-combat-130pct.jpg  (16,331 B)
docs/qa/camera-zoom-rc1/camera-pause-mobile-390x844.jpg  (68,616 B)
```

**포함 요소(육안 확인):** 플레이어 기함·드론(x11)·적 2기(Creature, 체력바)·플레이어 탄환 다수(cyan)·아이템(크리스탈)·고정 HUD. 파일 크기가 배율에 따라 단조 증가(14→15→16KB) = 실제 확대 방증.

**판정:**
- 월드 요소(함대·적·탄환·아이템)가 배율에 비례해 확대, 함대 기준 거리 유지 ✅
- 함대의 화면상 기준 위치 유지(130%에서 화면 밖 이탈 없음) ✅
- **HUD 픽셀 크기·위치 불변**: 동일 프레임 0.85↔1.30 상단 HUD 스트립 픽셀 비교 — 좌측 텍스트 차이 2%(월드 탄환이 상단 살짝 침범), **우측(미니맵 A3 배지) 차이 0%** → HUD는 배율과 무관하게 고정 ✅
- 85%에서 검은 가장자리 없음(배경은 카메라 밖 고정 렌더) ✅

**한계(정직 고지):** 섹터 1 개막 적(Creature)은 근접형이라 **적 탄환(enemyBullets)이 자연 발생하지 않아** 스크린샷에 포함되지 않았다. 소스 구조상 적 탄환은 `world.enemyBullets`로 다른 월드 요소와 **동일한 `drawWorld` 카메라 변환 안**에서 렌더되며(테스트 CW-12), 등장 시 동일하게 확대됨이 보장된다.

---

## 10. 접근성 QA (§5)

390×844에서 일시정지 카메라 버튼 실측:

| 버튼 | 크기 | aria-label(한국어) | aria-label(영어·포털) |
|---|---|---|---|
| 축소 `−` | **44×44px** | 축소 | Zoom out |
| 리셋 `100%` | **74×44px** | 배율 100%로 초기화 | Reset zoom to 100% |
| 확대 `+` | **44×44px** | 확대 | Zoom in |

- 버튼 간격: **8px**(out→reset), **8px**(reset→in) — 모두 ≥8px ✅
- Tab 포커스: `tabIndex=0`, `focus()` 시 activeElement로 확인 ✅ (focus-visible 아웃라인은 CSS로 배선)
- 영어·한국어 aria-label 양쪽 확인(한국어=일반 모드, 영어=CrazyGames 포털) ✅
- reduced-motion 즉시 배율: 이 환경은 OS reduced-motion이 off라 라이브 에뮬 미수행. `frame()`이 `prefersReducedMotion()`을 `advanceZoom`에 매 프레임 전달하고, reduced=true면 즉시 목표를 반환하는 것은 단위 테스트(CW-06 + camera-zoom 순수 로직)로 보장.

---

## 11. 네 모드 회귀 (§7)

| 모드 | URL | 제목/언어 | 카메라·휠 | 결과 |
|---|---|---|---|---|
| 일반 | `/` | 네온 함대(한국어) | 로드 | 휠 보정 동작, 콘솔 0 ✅ |
| Prolific | `/?playtest=prolific&utm_content=pilot` | NEON FLEET — 4-Minute Playtest(영어) | 로드 | 콘솔 0 ✅ |
| 개발 | `/?coreLoopTest=1` | 네온 함대 | 로드 | 콘솔 0 ✅ |
| CrazyGames | `/?distribution=crazygames` | Neon Fleet(영어) | 로드 | 무기 선택→전투, DOM 한글 0, 영어 aria-label, 휠 보정 동작 ✅ |

- 사망·재도전·일시정지·결과 흐름 정상(무기 선택 드래프트→출격→전투 진입 실동작 확인).
- 배율 저장·새로고침 복원·진행 초기화 후 보존은 카메라 스택 기존 검증 유지(save `view.zoom`).

---

## 12. 콘솔·404·외부 요청 (§7 공통)

- 콘솔 오류: **0건**(4모드 전부).
- 404: **0건**.
- 신규 외부 요청: **0건**. CrazyGames 포털에서 `google-analytics`·`googletagmanager`·`gtag`·`doubleclick`·`prolific`·`ads`·`sdk`·`crazygames` 패턴 요청 **0**(네트워크 로그 확인).

---

## 13. CrazyGames RC1 빌드 (§8)

```text
node scripts/build-crazygames-basic.mjs
파일 수 : 200 / 1500
압축 전 : 44.67 MB / 50 MB
ZIP     : dist/neon-fleet-crazygames-basic.zip = 43.94 MB
```

ZIP 무결성(중앙디렉터리 파싱):
- 엔트리 200, **백슬래시 경로 0(정슬래시 준수)**
- `index.html` 루트 존재 ✅
- **`js/wheel-input.js` 포함, `js/camera-zoom.js` 포함**(모듈 누락 0) ✅
- `tests/` 0, `docs/` 0, `.test.mjs` 0, `.md` 0 ✅ (개발/문서/테스트 미포함)
- 기준 44.66MB 대비 **+1파일(wheel-input.js)·+0.01MB** — 새 에셋 없음, 의미 있는 증가 아님(§8 예상대로)

---

## 14. 알려진 한계

- **적 탄환 스크린샷 부재:** 섹터 1 개막 적은 근접형(Creature)이라 적 탄환이 자연 발생하지 않아 전투 스크린샷에 없음. 구조·테스트로 동일 확대 보장(§9).
- **모바일 일시정지 이미지:** 일시정지 카메라 버튼 행은 **DOM 오버레이**여서 `canvas.toDataURL`에 담기지 않고, 이 세션은 Browser pane 비표시라 컴포지트 스크린샷도 불가. `camera-pause-mobile-390x844.jpg`는 390×844 캔버스 레이어(전투+HUD)이며, 버튼 기하는 §10 실측표로 증명.
- **reduced-motion 라이브 에뮬:** OS 토글 off 환경이라 미수행. 배선+단위테스트로 보장(§10).
- **정밀 터치패드 물리 검증:** 하드웨어 부재로 합성 이벤트 검증(§8 단서대로 명시).

이상은 모두 검증 환경의 제약이며 구현 결함이 아니다.

---

## 15. 최종 `git status --short`

```text
 M .gitignore
 M css/style.css
 M js/cutscene.js
 M js/entities.js
 M js/input.js
 M js/intro.js
 M js/main.js               ← RC1: 휠 리스너 + syncCameraAnchor
 M js/render.js
 M js/save.js
 M js/ui.js
 M tests/freeze-guard.test.mjs
 M tests/sector-map-touch.test.mjs
 M tests/title-state-reset.test.mjs
?? js/wheel-input.js                          ← RC1 신규(휠 정규화·누적 순수 모듈)
?? tests/wheel-input.test.mjs                 ← RC1 신규(12케이스)
?? tests/camera-anchor-sync.test.mjs          ← RC1 신규(4케이스)
?? tests/camera-zoom*.test.mjs                ← 카메라 회차(수정 포함)
?? docs/qa/camera-zoom-rc1/                   ← RC1 스크린샷 4장
?? docs/2026-07-30-...-완료보고.md             ← 본 문서
(그 외 CrazyGames·Prolific·analytics 미커밋 파일 다수 — 모두 보존, 되돌림 0)
```

- **커밋·푸시·머지·배포·CrazyGames 업로드: 없음.** 요청대로 완료보고서 작성 후 정지.
- `git diff --check`: 정상(LF/CRLF 안내 2건 외 화이트스페이스 오류 0).

---

## 완료 기준 체크

- [x] 기준선 702 pass·199파일·44.66MB 확인 후 착수
- [x] 가로 휠(deltaY=0·수평우세) 무변화·preventDefault 미호출
- [x] 정밀 터치패드 픽셀 누적(임계 60px·idle 200ms·방향/최대1단계)
- [x] deltaMode 0/1/2 정규화 · 전통 휠 한 칸 = 한 단계
- [x] 현재 프레임 anchor 동기화(input.tick 직전 + draw) · 첫 프레임 (0,0) 회피
- [x] 실이벤트 테스트 16개 추가 · 전체 718 pass / 0 fail
- [x] 85/100/130 실좌표 역변환 오차 0px · 4모드 회귀 · 콘솔·404·외부요청 0
- [x] 전투요소 포함 스크린샷 4장 · 접근성 44px·8px·aria(EN/KO)·포커스
- [x] CrazyGames RC1 50MB 미만(44.67MB) · 휠·카메라 모듈 포함 · docs/tests/비밀값 0
- [x] `git diff --check` 정상 · commit·push·merge·배포·업로드 없음
