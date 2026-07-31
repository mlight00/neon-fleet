# NEON FLEET — Prolific 해외 15명·$1 첫인상 테스트 작업지시서

- 작성: Codex
- 구현 대상: `E:\workspace\claude\neon-fleet-worktrees\stage1-analytics`
- 브랜치: `claude/neon-fleet-analytics-stage1`
- 기준: 현재 worktree의 Stage 1 미커밋 구현 전체
- 금지: commit, push, merge, GitHub Pages 배포, 실제 Prolific 게시·결제

## 1. 목적

Prolific에서 영어 사용 성인 15명을 모집해, 참가자당 `$1`로 **첫 4분의 재미·이해도·재도전 의향**을 측정한다.

이 실험은 기존 15명 장기 테스트를 대체하지 않는다. `$1` 보상에 맞춘 약 6분짜리 **첫인상 실험**이며 다음만 판단한다.

1. 4분 안에 전투의 재미를 느꼈는가
2. 조작과 선택을 이해했는가
3. 시간이 더 있었다면 한 판 더 하고 싶은가
4. 재미의 최고점과 가장 큰 방해 요소는 무엇인가

## 2. Prolific 운영 전제

- 참가자 보상: `$1`
- 예상 소요시간: 6분
- 절대 상한: 실제 평균 7분 30초 미만
- 인원: 파일럿 3명 → 이상 없으면 본 테스트 12명
- 첫 라운드 기기: 데스크톱·노트북만
- 언어: 영어
- 연령: 18세 이상
- 개인정보·자유서술·Prolific PID를 GA4로 전송하지 않는다.
- Prolific이 전달하는 `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID`는 읽거나 저장하거나 로그로 남기지 않는다.

## 3. 진입 URL과 모드

- 진입 예시:
  - `https://mlight00.github.io/neon-fleet/?playtest=prolific&utm_source=prolific&utm_medium=paid_playtest&utm_campaign=stage1_first_impression&utm_content=pilot`
  - 본 테스트는 `utm_content=main`
- `playtest=prolific`일 때만 전용 흐름을 활성화한다.
- 일반 URL과 기존 개발 URL의 화면·동작·저장·테스트를 바꾸지 않는다.
- `playtest=prolific`은 개발 모드가 아니며, 유효한 GA4 설정과 동의가 있을 때만 실제 전송한다.

## 4. 참가자 흐름

### 4.1 영어 테스트 시작 화면

한국어 타이틀 위에 임시 번역을 덧붙이는 방식은 금지한다. 전용 모드에서 아래 정보를 명확한 영어로 보여준다.

- 제목: `NEON FLEET — 4-Minute Playtest`
- 설명:
  - browser arcade roguelite
  - no download and no account required
  - play for up to 4 minutes, then answer 5 short questions
  - desktop/laptop keyboard or mouse
- 익명 데이터 동의:
  - gameplay progress, choices, device group, categorical survey answers
  - no name, email, typed free text, full URL, cookie, device fingerprint, or Prolific ID
- 버튼:
  - `I agree — Start`
  - `I do not agree`
- 거부해도 일반 게임을 막거나 저장을 손상시키지 않는다.
- Prolific용 no-consent 반환 URL은 설정값이 비어 있으면 안전한 안내만 보여주고 이동하지 않는다.

### 4.2 4분 게임

- 동의 후 기존 게임의 영어 핵심 경로로 진입한다.
- 스토리 인트로는 건너뛰고 영어 간이 가이드를 보여준다.
- 시작 무기 선택 → 실제 전투까지 정상 게임 로직을 사용한다.
- 전투 진입 시점부터 240초 타이머를 시작한다.
- 첫 사망이 먼저 발생하면 즉시 설문으로 간다.
- 240초가 먼저 끝나면 게임을 안전하게 일시정지하고 설문으로 간다.
- 4분 안에 사망 후 기존 재도전 버튼을 자발적으로 누른 경우는 정상 계측하되, 설문으로 가기 전 최대 총 전투시간은 240초를 넘기지 않는다.
- 일반 게임의 난이도·보상·적·무기 수치는 바꾸지 않는다.

### 4.3 영어 범위

Prolific 모드에서 참가자가 시작 화면부터 설문까지 볼 수 있는 모든 핵심 문구는 영어여야 한다.

- 간이 조작 가이드
- 시작 무기 이름·설명
- HUD의 핵심 정보
- 첫 4분 안에 나타나는 업그레이드·항로·결과 선택
- 일시정지·음소거·모바일 전용 버튼의 접근 가능 이름

일반 모드의 한국어는 그대로 보존한다. 영어화 때문에 게임 데이터의 ID나 로직을 복제하지 않는다.

## 5. 설문

자유 입력란은 만들지 않는다. 다음 5개 질문은 모두 필수이며 영어로 표시한다.

1. `How fun was the game during these few minutes?`
   - 1~5
2. `How clear were the controls and choices?`
   - 1~5
3. `If you had more time, how likely would you be to start another run?`
   - 1~5
4. `What felt most exciting?`
   - `dodging`, `weapon_power`, `build_choice`, `progression`, `boss_or_elite`, `nothing_yet`, `other`
5. `What got in the way the most?`
   - `controls`, `visual_clarity`, `choice_clarity`, `difficulty`, `performance`, `nothing`, `other`

제출 버튼: `Submit and return to Prolific`

- 중복 제출 방지
- 누락 응답 표시
- 분석 전송 실패가 게임·완료 흐름을 막지 않음
- 제출 후 최대 500ms만 전송 기회를 주고 완료 URL로 이동
- 완료 URL이 비어 있으면 `Test complete — return to Prolific and enter the completion code shown in the study.`를 표시

## 6. 설정

별도 설정 파일을 추가하고 다음 값을 한곳에서 관리한다.

- 모드 쿼리 키·값
- 게임 제한시간(기본 240초)
- Prolific 성공 완료 URL
- Prolific no-consent 반환 URL
- 설정 누락 여부 검사

실제 완료 URL은 Prolific 연구 생성 후 소유자가 입력한다. 임의 코드나 가짜 URL을 넣지 않는다.

## 7. 분석 계약

기존 화이트리스트 방식과 동의 모델을 유지한다. 아래 이벤트만 추가한다.

- `playtest_started`
  - `playtest_provider=prolific`
  - `playtest_cohort=pilot|main`
- `playtest_limit_reached`
  - `end_reason=first_death|time_limit`
  - `elapsed_sec`
- `playtest_feedback_submitted`
  - `fun_rating=1..5`
  - `clarity_rating=1..5`
  - `replay_intent=1..5`
  - `peak_moment` enum
  - `friction_area` enum
- `playtest_completed`
  - `completion_method=redirect|manual`

공통 속성 외 다음은 절대 전송하지 않는다.

- Prolific PID·Study ID·Session ID
- 참가자 IP·전체 URL·referrer
- 자유서술
- completion URL·completion code
- run ID·seed·원시 개발 측정값

`utm_content`는 원문을 전송하지 않고 `pilot|main|unknown`으로만 내부 매핑한다.

## 8. 테스트

### 8.1 자동 테스트

- 일반 URL에서 Prolific UI·타이머·설문이 0개
- 전용 URL에서 영어 시작 화면 1개
- 동의 전·거부 후 GA4 전송 0
- Prolific 쿼리의 PID·Study ID·Session ID가 이벤트·디버그 로그에 없음
- 전투 시작 전 타이머 미동작
- 240초에 1회만 설문 진입
- 첫 사망에 1회만 설문 진입
- 설문 5문항 누락 시 제출 거부
- 정상 제출 이벤트 속성이 enum·1~5 범위 안
- 중복 제출 차단
- 분석 sink 오류·완료 URL 누락 시에도 완료 안내
- 개발 URL은 계속 외부 전송 0
- 기존 581개 테스트 전부 유지

### 8.2 브라우저 QA

- PC 1280×720
- 전용 영어 시작 화면
- 동의 → 무기 선택 → 전투
- 첫 사망 경로와 시간 제한 경로
- 설문 키보드 조작·포커스·누락 오류
- 완료 URL mock 리디렉션
- 일반 한국어 URL 회귀 없음
- 콘솔 오류 0

## 9. 문서

다음을 작성한다.

1. 구현 완료 보고서
2. Prolific 등록값 복사본
   - 연구 제목
   - 설명
   - 예상 6분
   - 보상 `$1`
   - 파일럿 3명·본 테스트 12명
   - 기기·연령·영어 필터
   - 외부 URL·완료 URL 입력 위치
3. 결과 집계 템플릿
   - 15명 분포
   - 평균·중앙값
   - `fun_rating >= 4`
   - `replay_intent >= 4`
   - 최고점·방해 요소 빈도
   - 파일럿과 본 테스트 구분

## 10. 완료 보고 기준

- 실제 구현 파일 목록
- 추가·변경 테스트 수
- 전체 테스트 결과
- 브라우저 QA 증거
- 미입력 소유자 값:
  - GA4 measurement ID
  - Prolific 성공 완료 URL
  - Prolific no-consent 반환 URL
- 실제 참가자 모집·결제·결과는 수행했다고 쓰지 않는다.
- commit·push·merge·배포하지 않는다.
