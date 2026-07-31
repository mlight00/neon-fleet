# NEON FLEET — Prolific 해외 15명·$1 첫인상 테스트 구현 완료 보고

- 작성: Claude
- 대상 브랜치: `claude/neon-fleet-analytics-stage1`
- worktree: `E:\workspace\claude\neon-fleet-worktrees\stage1-analytics`
- 기준 작업지시서: `docs/2026-07-26-Claude-Prolific-15명-첫인상-테스트-작업지시서.md`
- 상태: 구현·자동 테스트 완료 / 소유자 입력값 대기 / 실제 모집·결제·게시 없음
- 금지 항목 준수: commit·push·merge·rebase·reset·checkout·clean·배포 미수행

---

## 1. 무엇을 했나 (한 줄 요약)

`?playtest=prolific` 전용 URL에서만 켜지는 영어 첫인상 흐름(동의 → 무기 선택 → 영어 가이드 → 실제 전투 → 240초/첫 사망에서 5문항 설문 → 완료)을 기존 Stage 1 분석·동의 모델 위에 얹었다. 일반 한국어 게임과 개발/측정 URL의 화면·동작·저장·전송은 바꾸지 않았다.

이번 세션은 이전 Claude가 만들다 중단한 부분 구현을 **감사 → 미완성 배선 완성 → 테스트·문서 작성** 순으로 이어받아 마무리했다.

## 2. 이전 세션에서 비어 있던 핵심 배선 (이번에 채운 것)

이전 세션은 설정·흐름 로직·UI·분석 이벤트·영어 화면을 대부분 작성했으나, **실제로 흐름을 켜는 3개 연결이 비어 있어 동작하지 않는 상태**였다.

1. **부트스트랩 라우팅 없음** — `startPlaytestFlow()`가 정의만 되고 호출되지 않아, 전용 URL로 들어와도 일반 타이틀이 떴다. → 부트스트랩에서 `if (PLAYTEST) startPlaytestFlow()`로 진입.
2. **첫 사망 → 설문 미연결** — `triggerPlaytestSurvey()`가 정의만 되고 호출되지 않았다. → 패배 확정 지점에서 `PLAYTEST`이면 `endExpedition('death')` 대신 `triggerPlaytestSurvey('first_death')`.
3. **240초 타이머 미동작** — `playtest.timer.tick(dt)`가 어디에서도 호출되지 않았다. → 프레임 루프에 `playtestTick(dt)`를 두어 실제 전투 중에만 누적, 상한 도달 시 `triggerPlaytestSurvey('time_limit')`.

추가로 참가자 대면 영어 범위(§4.3)를 넓혔다: 시작 무기 이름·설명, 항로 선택 화면, HUD 핵심 정보, 일시정지 화면, 일시정지·차지·음소거 버튼의 접근 가능 이름(aria-label)을 `PLAYTEST`일 때 영어로 전환.

## 3. 변경·추가 파일

### 3.1 이번 세션에서 수정한 기존(미커밋) 파일

| 파일 | 이번 세션 변경 요지 |
|---|---|
| `js/main.js` | 부트스트랩 라우팅, 첫 사망→설문, `playtestTick` 프레임 훅, 시작 무기 픽 영어화, 항로 화면·일시정지·버튼 aria 영어화, HUD `en` 플래그 전달 |
| `js/render.js` | `drawHUD`·`drawSectorLoadoutHud`(및 공용 조각 hull/무기/공명 바)에 `en` 플래그 — 참가자용 HUD 핵심 정보 영어 표기 |

> 위 두 파일의 다른 부분(이전 세션의 Stage 1 분석 배선, 사용자·Codex의 리텐션 변경)은 되돌리지 않았다. 순수 추가·조건 분기만 넣었고 한국어 리터럴은 false 분기에 그대로 보존해 기존 소스 검증 테스트가 유지된다.

### 3.2 전용 로직 모듈(이전 세션 작성, 이번에 검토·활용)

- `js/playtest-config.js` — 모드 쿼리 키·값, 240초 제한, 500ms 전송창, 완료/거부 URL(빈 값·소유자 대기), 설정 누락 검사, `utm_content`→cohort 매핑. **Prolific PID·Study·Session은 읽지 않는다.**
- `js/playtest.js` — 전투 타이머(전투 시작 후에만 누적·상한 1회), 5문항 검증, 완료 계획(redirect|manual), 제출 세션(중복 차단·이벤트 순서·전송 실패에도 완료 보장).

### 3.3 분석 스택(이전 세션 작성) 중 Prolific 관련

- `js/analytics-config.js` — `playtest_started·playtest_limit_reached·playtest_feedback_submitted·playtest_completed` 4종 스키마 추가. PII_KEYS에 `prolific_pid·study_id·session_id·completion_url·completion_code·utm_content` 포함(어떤 이벤트에도 전송 금지).
- `js/analytics-events.js` — 파사드에 위 4개 의미 메서드.
- `js/ui.js` — `showPlaytestIntro·showPlaytestSurvey·showPlaytestComplete` + 항로·가이드·일시정지 영어 분기(이전 세션 작성).

### 3.4 이번 세션에서 추가한 테스트

| 파일 | 성격 |
|---|---|
| `tests/playtest-config.test.mjs` | 설정·URL 게이팅(전용/일반/개발 구분·cohort·완료 URL 빈 값·설정 누락) |
| `tests/playtest.test.mjs` | 타이머·5문항 검증·완료 계획·제출 세션(중복·완료 보장) 순수 로직 |
| `tests/playtest-analytics.test.mjs` | 실제 코어+스키마+파사드+GA4 어댑터 조립 — 이벤트 속성·PID 제거·동의/개발 게이팅 |
| `tests/playtest-wiring.test.mjs` | main.js/ui.js 브라우저 결합 배선(부트스트랩·타이머·첫 사망·영어·버튼 aria) |

### 3.5 이번 세션에서 추가한 문서

- `docs/2026-07-26-Claude-Prolific-첫인상테스트-구현완료보고.md` (본 문서)
- `docs/2026-07-26-Prolific-등록값-복사용.md`
- `docs/2026-07-26-Prolific-결과집계템플릿.md`
- `docs/qa/prolific-playtest-20260726/browser-qa-checklist.md`

## 4. 참가자 흐름(구현된 실제 경로)

1. `?playtest=prolific&utm_content=pilot|main` 진입 → 전용 영어 시작 화면(제목·설명·익명 데이터 동의·`I agree — Start` / `I do not agree`).
2. 동의 → 동의 저장(granted)·GA4 grant → `playtest_started`(provider=prolific, cohort) → 시작 무기 선택(영어) → 영어 간이 가이드 → 실제 전투 진입(240초 타이머 시작).
3. 첫 사망이 먼저면 즉시 설문(`playtest_limit_reached` end_reason=first_death). 240초가 먼저면 안전 정지 후 설문(end_reason=time_limit, elapsed_sec ≤ 240).
4. 5문항 필수 설문(자유 입력 없음) → 제출 → `playtest_feedback_submitted` → `playtest_completed`(redirect|manual).
5. 완료 URL이 있으면 최대 500ms 전송 창 후 이동, 없으면 `Test complete — return to Prolific and enter the completion code shown in the study.` 안내.
6. 거부 시 전송 중단 + no-consent URL이 있으면 이동, 없으면 영어 안내만(일반 게임·저장 손상 없음).

## 5. 분석 계약 준수(§7)

- 추가 이벤트 4종만. 공통 속성 외 Prolific PID·Study·Session·IP·전체 URL·referrer·자유서술·completion URL/code·run ID·seed·원시 개발값은 어떤 이벤트에도 넣지 않는다.
- `utm_content`는 원문 미전송, `pilot|main|unknown`으로만 내부 매핑.
- 방어 2중화: (a) 파사드가 계약 속성만 전달, (b) 코어 화이트리스트+PII_KEYS가 오염 속성을 제거. `PT-A7` 테스트가 PID·Study·Session·completion·utm_content를 코어에 직접 밀어넣어도 제거됨을 확인.
- 동의 전·거부·개발 URL·측정 ID 미입력 중 하나라도면 GA4 전송 0(`PT-A9~A12`).

## 6. 자동 테스트 결과

- 실행: `node --test tests/*.test.mjs`
- 결과: **633 pass / 0 fail** (기존 581 + 신규 52).
  - 신규 52: playtest-config 8, playtest 17, playtest-analytics 13, playtest-wiring 14.
- 기존 581개 전부 유지(회귀 0). 프레임 루프 수정 후 `FZ-3`(프리즈 방지 소스 검증)가 500자 슬라이스 밖으로 밀리지 않도록 타이머 훅을 `playtestTick(dt)` 한 줄로 추출해 통과 유지.
- `git diff --check`: 추적 파일 공백/충돌 마커 오류 0. 신규 파일도 트레일링 공백·충돌 마커 0.

§8.1 자동 테스트 항목 대응:

| §8.1 항목 | 대응 테스트 |
|---|---|
| 일반 URL Prolific UI·타이머·설문 0 | PT-C2, PW-1/2 |
| 전용 URL 영어 시작 화면 1 | PW-2/3 |
| 동의 전·거부 후 GA4 0 | PT-A9, PT-A10 |
| PID·Study·Session이 이벤트·로그에 없음 | PT-A7 |
| 전투 시작 전 타이머 미동작 | PT-T1, PW-5 |
| 240초에 1회만 설문 | PT-T2, PW-6 |
| 첫 사망에 1회만 설문 | PT-T3, PW-7/8 |
| 5문항 누락 시 제출 거부 | PT-S2, PT-U2 |
| 정상 제출 enum·1~5 범위 | PT-S1/3/4, PT-A4 |
| 중복 제출 차단 | PT-U3 |
| sink 오류·완료 URL 누락에도 완료 안내 | PT-U4/5/6, PW-9/10 |
| 개발 URL 외부 전송 0 | PT-C3, PT-A11 |
| 기존 581개 유지 | 전체 633 pass |

## 7. 브라우저 수동 QA(Codex 1차 완료)

2026-07-26 Codex가 Windows 인앱 Chromium 1280×720에서 로컬 정적 서버로 실제 흐름을 실행했다. 영어 시작→무기→가이드→전투→항로→정예 강화→교리→수리→보스 전투 중 240초 도달→5문항 설문→필수 검증→수동 완료 안내까지 확인했다. 동의 거부, 일반 한국어 URL, 개발 URL, Prolific ID 부가 파라미터 진입도 확인했다.

실제 플레이에서 발견된 한국어 잔존(기함 특성·맵 툴팁·정예 강화·교리·수리·사운드 패널)을 Prolific 전용 표시 번역으로 보완했고, 일시정지의 `End run`이 설문을 우회하지 않도록 전용 모드에서는 숨겼다. 일반 한국어 모드의 데이터 ID·수치·효과 로직은 바꾸지 않았다.

남은 수동 항목은 첫 사망 경로, 설문 키보드만 사용, 실제 Prolific 완료 URL 리디렉션, 배포 환경 콘솔, GA4 DebugView이다. 상세 결과와 증거 이미지: `docs/qa/prolific-playtest-20260726/browser-qa-checklist.md`.

## 8. 미입력 소유자 값 (실운영 전 필수)

아래 3개는 임의 값을 넣지 않았다. 실제 값이 없으면 안전 폴백(전송 0·안내만)으로 동작한다.

1. **GA4 measurement ID** — `js/analytics-config.js`의 `ANALYTICS_CONFIG.measurementId`(빈 값). 유효 `G-XXXXXXX`가 있고 `enabled: true`여야 실제 전송·동의 UI가 켜진다.
2. **Prolific 성공 완료 URL** — `js/playtest-config.js`의 `PROLIFIC_COMPLETION_URL`(빈 값). 비면 설문 제출 후 완료 코드 안내만 표시.
3. **Prolific no-consent 반환 URL** — `js/playtest-config.js`의 `PROLIFIC_NO_CONSENT_URL`(빈 값). 비면 거부 시 이동 없이 안내만 표시.

## 9. 알려진 범위·한계(정직 보고)

- **참가자 대면 영어 범위**: 시작·동의·가이드·무기·항로·HUD·정예 강화·모듈·무기 진화·교리·키스톤·수리·사운드·일시정지·설문·완료 화면을 전용 URL에서 영어로 표시한다. 번역은 표시 사전만 추가했으며 원본 게임 데이터의 ID·수치·효과 로직은 복제하거나 변경하지 않았다.
- 실제 참가자 모집·결제·결과 집계는 수행하지 않았다(문서 템플릿만 제공).
- commit·push·merge·배포는 하지 않았다.

## 10. 재현 방법(로컬)

- 전용 흐름: 정적 서버로 `index.html`을 띄우고 `?playtest=prolific&utm_content=pilot` 접속.
- 완료 리디렉션 확인: `js/playtest-config.js`의 `PROLIFIC_COMPLETION_URL`에 mock URL을 임시로 넣고 확인(실 커밋 전 되돌린다).
- 테스트: `node --test tests/*.test.mjs`.
