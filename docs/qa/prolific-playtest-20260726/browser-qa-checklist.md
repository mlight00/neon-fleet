# Prolific 첫인상 테스트 — 브라우저 수동 QA 체크리스트

- 기준 작업지시서 §8.2
- 실행 환경: PC 1280×720, 최신 Chrome/Edge (데스크톱)
- 준비: 정적 서버로 `index.html` 서빙(예: `npx serve` 또는 `python -m http.server`), 콘솔 열기
- 상태 표기: [ ] 미확인 / [x] 확인 / [!] 문제

> 자동 테스트(`node --test tests/*.test.mjs`, **633 pass**)로 로직·게이팅·PID 제거·중복/완료 보장은 검증됨. 아래는 실제 화면·입력·리디렉션 등 브라우저에서만 확인 가능한 항목이다.
>
> 2026-07-26 Codex 로컬 QA: Windows · 인앱 Chromium · 1280×720 · `http://127.0.0.1:8324/`. 실제 Prolific 완료 URL과 GA4 측정 ID가 필요한 항목은 미확인으로 남겼다.

---

## A. 전용 영어 시작 화면 (§4.1)

접속: `?playtest=prolific&utm_content=pilot`

- [x] A1. 한국어 타이틀이 뜨지 않고 영어 시작 화면이 바로 나온다(한국어 위 임시 번역 아님).
- [x] A2. 제목 `NEON FLEET — 4-Minute Playtest`, 설명 4항목(browser arcade roguelite / no download·account / up to 4 min then 5 questions / desktop·laptop) 표시.
- [x] A3. 익명 데이터 동의 문구: 수집(gameplay progress·choices·device group·categorical survey) / 미수집(name·email·free text·full URL·cookie·fingerprint·Prolific ID) 명시.
- [x] A4. 버튼 `I agree — Start` / `I do not agree` 두 개.

## B. 동의 → 무기 → 가이드 → 전투 (§4.2·§4.3)

- [x] B1. `I agree — Start` → 시작 무기 선택 화면이 **영어**(Choose your starting weapon, Vulcan/Laser/Homing Missiles + 영어 설명).
- [x] B2. 무기 선택 후 영어 간이 가이드(How to play: 이동·자동사격·청록/자홍 항로·POW/크리스탈·차지) → `Start ▶`.
- [x] B3. 전투 진입. HUD 핵심 정보가 영어(Hull, Main/Sub 무기, Drones·Cruisers, Sector N, Focus/Overdrive 등).
- [x] B4. 항로 선택 화면(다음 노드)이 영어(Sector N · Choose your route, 노드 라벨·범례·안내·Advance/Coins).
- [x] B5. 정예 POW 보상 화면이 영어(wing weapon·resonance·weapon level-up).
- [x] B6. 기함 교리 선택 화면이 영어(Drone Command / Charge Assault / Evasive Tactics).
- [x] B7. 정비·긴급 수리 화면이 영어이고 선택 후 항로로 정상 복귀.

## C. 종료 경로 — 첫 사망 (§4.2)

- [ ] C1. 일부러 빠르게 사망 → 결과(한국어 패배 화면)로 가지 않고 **영어 설문**으로 직행.
- [ ] C2. 설문 진입은 1회만(연출 반복·재진입 없음).

## D. 종료 경로 — 240초 시간 제한 (§4.2)

- [x] D1. 사망하지 않고 버티면 전투 시작 후 총 전투시간 240초 도달 시 게임이 안전 정지하고 설문으로 이동.
- [x] D2. (참고) 맵·메뉴 등 비전투 화면 시간은 누적되지 않는다(총 "전투시간" 기준). 설문 진입은 1회만.

## E. 설문 (§5)

- [x] E1. 5문항 모두 표시(Q1~Q3 1~5, Q4 peak_moment 7택, Q5 friction_area 7택), 자유 입력란 없음.
- [ ] E2. 키보드로 옵션 포커스·선택 가능(각 버튼 min 44×44).
- [x] E3. 일부만 고르고 `Submit and return to Prolific` → 누락 오류(빨간 테두리 + "Please answer all 5 questions") 표시, 제출 안 됨.
- [x] E4. 5개 다 고르고 제출 → 완료 안내로 1회 전환. 중복 제출 방지는 자동 테스트에서 별도 확인.

## F. 완료 (§5·§6)

- [x] F1. (완료 URL 빈 값 기본) 제출 후 `Test complete — return to Prolific and enter the completion code shown in the study.` 안내.
- [ ] F2. (mock 검증) `js/playtest-config.js`의 `PROLIFIC_COMPLETION_URL`에 임시 mock URL을 넣고 재접속·제출 → 약 500ms 후 그 URL로 리디렉션. **확인 후 mock 값 되돌리기.**

## G. 동의 거부 (§4.1)

- [x] G1. 시작 화면에서 `I do not agree` → (no-consent URL 빈 값 기본) 이동 없이 영어 안내만.
- [x] G2. 이후 일반 URL(`/` 또는 기존 개발 URL)에서 한국어 프롤로그·게임 진입이 정상.

## H. 접근성·버튼 이름 (§4.3)

- [x] H1. 일시정지(ESC 또는 ⏸) 화면이 영어(Paused / Resume). 테스트 설문을 우회하는 `End run`은 전용 모드에서 숨김.
- [x] H2. ⏸·⚡·🔊 버튼의 접근 가능 이름과 사운드 패널 문구가 영어(Pause / Charge shot (hold) / Sound settings·Mute/Unmute / Music / Sound effects).

## I. 회귀·비전송 (§8)

- [x] I1. 일반 한국어 URL(`/` 파라미터 없음)에서 Prolific 시작 화면·타이머·설문이 전혀 없고, 게임이 평소와 동일.
- [x] I2. 개발 URL(예: `?coreLoopTest=1`)에서 Prolific 흐름이 켜지지 않는다. 외부 전송 0은 자동 테스트에서 확인.
- [ ] I3. 전 과정 콘솔 오류 0.
- [x] I4. (측정 ID 미입력 상태 기준) Resource Timing에 googletagmanager·google-analytics 요청 0. 측정 ID·enabled 설정 후 실전 전송은 별도 확인 필요.

## J. PID 비수집 확인 (§2·§7)

- [x] J1. `?playtest=prolific&PROLIFIC_PID=abc&STUDY_ID=s&SESSION_ID=x` 로 접속해도 흐름 정상.
- [ ] J2. (측정 활성 시) GA4 DebugView/Network payload에 PID·Study·Session·완료 코드·utm_content 원문이 없음. `playtest_cohort`만 pilot/main/unknown으로 존재.

---

## 증거 첨부(권장)

- [x] 영어 시작 화면: `desktop-intro-en-1280x720.png`
- [x] 영어 항로·HUD: `desktop-sector-map-en-1280x720.png`
- [x] 영어 정예 보상: `desktop-weapon-upgrade-en-1280x720.png`
- [x] 영어 설문: `desktop-survey-en-1280x720.png`
- Network·DebugView 캡처(측정 ID 설정 후): playtest 이벤트 속성에 PID·완료정보·utm_content 원문 없음.
- 콘솔 오류 없음 캡처.

> 남은 수동 확인: C1~C2(첫 사망), E2(키보드만으로 설문), F2(실제 완료 URL 리디렉션), I3(배포 환경 콘솔), J2(GA4 DebugView). 실제 값 연결·배포 후 마무리한다.
