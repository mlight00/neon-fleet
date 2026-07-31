# Claude Code 작업지시서 — 카메라 휠 보정 및 CrazyGames RC1 최종 QA

- 작성일: 2026-07-30
- 작업 디렉터리: `E:\workspace\claude\neon-fleet-worktrees\stage1-analytics`
- 현재 브랜치: `claude/neon-fleet-analytics-stage1`
- 검토 근거: `docs/2026-07-30-Codex-전투카메라-검토결과.md`
- 기준 완료보고: `docs/2026-07-29-Claude-전투카메라-휠확대축소-완료보고.md`
- 금지: commit, push, merge, 배포, CrazyGames 업로드

---

## 0. 목표

카메라 확대·축소의 핵심 구현은 유지하고 다음 세 가지만 보완한다.

1. 가로 휠과 정밀 터치패드에서 확대율이 급격히 튀는 문제 수정
2. 입력 역변환이 항상 현재 프레임의 함대 위치를 기준으로 하도록 순서 보정
3. 실제 전투 요소가 함께 확대되는 시각 증거와 CrazyGames 출시 후보 회귀 자료 완성

새 게임 기능, 밸런스 변경, 광고 SDK, 새 에셋은 추가하지 않는다.

---

## 1. 시작 기준선

작업 전 반드시 실행하고 결과를 기록한다.

```powershell
git status --short --branch
git diff --stat
node --test tests/*.test.mjs
node scripts/build-crazygames-basic.mjs
```

기준값:

```text
자동 테스트: 702 pass / 0 fail
CrazyGames: 199파일 / 압축 전 44.66MB / ZIP 43.94MB
```

기준선이 깨져 있으면 새 수정부터 시작하지 말고 원인을 먼저 보고한다.

현재의 Stage 1·Prolific·CrazyGames·카메라 미커밋 변경을 전부 보존한다.

---

## 2. P0 — 휠 입력 정규화

## 2.1 현재 재현되는 문제

Codex의 실제 Chrome 검증값:

```text
가로 입력 deltaX=40, deltaY=0
100% → 95%

작은 수직 입력 deltaY=-1 × 6회
100% → 130%
```

두 결과 모두 수정 대상이다.

## 2.2 요구 동작

### 수평 입력

- `deltaY === 0`: 줌 변경 0
- `abs(deltaX) >= abs(deltaY)`: 줌 변경 0
- 수평 우세 입력에는 `preventDefault()`를 호출하지 않음

### 일반 마우스 휠

- 위 한 칸: +5%
- 아래 한 칸: -5%
- `deltaY≈±100` 한 이벤트는 정확히 한 단계
- 한 이벤트에서 두 단계 이상 변경 금지

### 정밀 터치패드

- 작은 delta를 누적한 뒤 임계값을 넘을 때만 한 단계 변경
- 권장 픽셀 임계값: 50~70px
- 방향이 바뀌면 이전 방향 잔여값 초기화
- 180~250ms 동안 새 입력이 없으면 잔여값 초기화
- `deltaY=-1` 6회만으로는 배율이 바뀌지 않아야 함
- 충분한 누적 제스처는 한 단계씩 자연스럽게 반응해야 함

### `deltaMode`

다음을 공통 픽셀값으로 정규화한다.

- `DOM_DELTA_PIXEL`
- `DOM_DELTA_LINE`
- `DOM_DELTA_PAGE`

브라우저 상수가 없는 테스트 환경에서도 동작하도록 숫자값 `0/1/2`를 안전하게 처리한다.

## 2.3 권장 구조

휠 누적·정규화 로직을 `main.js`의 즉석 분기로 만들지 말고 테스트 가능한 작은 모듈 또는 함수로 분리한다.

예시 책임:

```js
normalizeWheelDelta(event, viewportHeight)
createWheelStepAccumulator({ thresholdPx, idleResetMs })
accumulator.push({ deltaX, deltaY, deltaMode, now })
// 반환: -1 | 0 | +1
```

함수명은 현재 코드 스타일에 맞게 조정해도 된다.

휠 핸들러 순서:

```text
Ctrl/Cmd 가드
전투·오버레이 상태 가드
수평 우세 입력 가드
수직 delta 정규화·누적
임계값 미도달이면 게임 내 페이지 스크롤만 차단하고 배율은 유지
임계값 도달 시 preventDefault + 한 단계 적용
```

캔버스 위 실제 전투 중 수직 터치패드 제스처는 페이지를 움직이지 않게 해야 하므로, 임계값 도달 전이라도 유효한 수직 입력이면 `preventDefault()`는 허용한다.

---

## 3. P0 — 현재 프레임 카메라 기준점 동기화

현재 `input.tick()`보다 `draw()`의 anchor 갱신이 늦다.

다음 순서를 보장한다.

```text
camera.current 보간
현재 run.squad.x/y를 camera.anchorX/Y에 반영
input.tick(dt)
squad.update(dt)
draw()
```

구현 기준:

- `update()`의 `input.tick()` 직전에 현재 함대 좌표를 동기화한다.
- `draw()`에서도 그릴 시점의 최신 함대 좌표를 사용한다.
- 중복 코드가 불명확해지면 `syncCameraAnchor()` 같은 작은 함수를 사용한다.
- run 없음·전투 아님·squad 없음에서 예외가 나지 않게 한다.
- 카메라 값이 게임 규칙 계산에 들어가면 안 된다.

---

## 4. 자동 테스트

기존 702개를 모두 유지하고 실제 동작 테스트를 추가한다. 소스 정규식만으로 끝내지 않는다.

필수 테스트:

```text
1. deltaY=0 수평 휠 → 줌 변화 0, preventDefault 0
2. abs(deltaX)>=abs(deltaY) → 줌 변화 0
3. deltaY=-1 × 6 → 줌 변화 0
4. 누적값이 임계값을 넘으면 +5% 정확히 1회
5. 전통 휠 deltaY=-100 → +5% 정확히 1회
6. 한 이벤트에서 최대 한 단계
7. 방향 전환 시 잔여 누적 초기화
8. idle 시간 초과 시 잔여 누적 초기화
9. deltaMode 0/1/2 정규화
10. Ctrl/Cmd+휠 → 줌 변화 0, preventDefault 0
11. 전투 밖·일시정지·드래프트·결과 화면 → 줌 변화 0
12. 현재 프레임 squad anchor로 screen→world 역변환
13. 첫 전투 프레임에서 초기 anchor(0,0)를 사용하지 않음
14. 130%에서 빠른 좌우 이동 중 역변환 오차 ≤0.01
```

다음도 다시 실행한다.

```powershell
node --test tests/*.test.mjs
git diff --check
```

합격 조건:

- 기존 702개 포함 전체 0 fail
- 새 테스트 수와 총 테스트 수를 완료보고에 명시
- LF/CRLF 안내와 실제 화이트스페이스 오류를 구분

---

## 5. 실제 Chrome QA

새 포트를 사용한다.

```powershell
python -m http.server 8343
```

검증 URL:

```text
http://localhost:8343/
http://localhost:8343/?distribution=crazygames
http://localhost:8343/?playtest=prolific&utm_content=pilot
http://localhost:8343/?coreLoopTest=1
```

### 휠

- 실제 마우스 휠 위/아래 한 칸
- 합성 `deltaY=-1` 연속 입력
- 합성 수평 입력 `deltaX=40, deltaY=0`
- 빠른 방향 전환
- Ctrl/Cmd+휠 브라우저 확대
- 캔버스 밖 페이지 스크롤

물리적인 정밀 터치패드가 없는 환경이면 실제로 확인했다고 쓰지 말고 합성 이벤트 검증이라고 명시한다.

### 입력 좌표

- 85/100/130% 각각 왼쪽·중앙·오른쪽 마우스 이동
- 확대 보간 중 마우스를 멈춘 상태
- 함대가 빠르게 좌우 이동하는 상태
- 터치 드래그
- 첫 전투 프레임

### 접근성

- 390×844에서 버튼 크기 44px 이상
- 버튼 간격 8px 이상
- Tab 포커스 링
- 영어·한국어 `aria-label`
- Chrome의 reduced-motion 에뮬레이션에서 즉시 목표 배율

---

## 6. 전투 비교 스크린샷

같은 seed·같은 전투 상태·같은 함대 좌표를 고정한 뒤 배율만 바꿔 저장한다.

출력 폴더:

```text
docs/qa/camera-zoom-rc1/
```

필수 파일:

```text
camera-combat-085pct.jpg
camera-combat-100pct.jpg
camera-combat-130pct.jpg
camera-pause-mobile-390x844.jpg
```

85/100/130 비교 화면에 모두 포함:

- 플레이어 기함·드론·순양함
- 일반 적 또는 보스
- 플레이어 탄환
- 적 탄환
- 코인·크리스탈 등 아이템
- 파티클·링 또는 데미지 텍스트
- 고정 HUD

판정:

- 월드 요소의 크기와 함대 기준 거리가 배율에 비례
- 함대의 화면상 기준 위치 유지
- HUD 픽셀 크기·위치 불변
- 85%에서 검은 가장자리 없음
- 130%에서 플레이어가 화면 밖으로 밀리지 않음

---

## 7. 네 모드 회귀

| 모드 | 합격 조건 |
|---|---|
| 일반 | 한국어, 기존 인트로·타이틀·저장 정상 |
| Prolific | 영어, 4분 타이머·설문 정상 |
| 개발 | 측정 하네스 정상 |
| CrazyGames | 영어, 무기 선택→전투, GA4·광고·Prolific 요청 0 |

공통:

- 콘솔 오류 0
- 404 0
- 신규 외부 요청 0
- 사망·재도전·일시정지·결과 화면 정상
- 배율 저장·새로고침 복원·진행 초기화 후 보존

---

## 8. CrazyGames RC1 빌드

```powershell
node scripts/build-crazygames-basic.mjs
```

합격 조건:

- ZIP 루트에 `index.html`
- 파일 1,500개 미만
- 압축 전 50MB 미만
- 카메라 및 휠 모듈 누락 0
- MP3 중복·docs·tests·개발 파일 포함 0
- GA4 측정 ID·Prolific URL·비밀값 포함 0
- 신규 광고·SDK 요청 0

이번 작업은 새 에셋이 없으므로 기준 44.66MB에서 의미 있게 증가하면 원인을 조사한다.

---

## 9. 금지사항

- 게임 밸런스·충돌·속도·스폰·보상·난이도 변경 금지
- 자동 승급 줌·보스 줌·화면 흔들림·핀치 추가 금지
- 광고 SDK·GA4 ID·Prolific 실URL 추가 금지
- 에셋 삭제·재인코딩 금지
- 기존 미커밋 작업 되돌리기 금지
- `git reset --hard`, `git checkout --`, `git clean` 금지
- commit, push, merge, 배포, CrazyGames 업로드 금지

---

## 10. 완료보고

다음 파일을 작성한다.

```text
docs/2026-07-30-Claude-카메라휠-보정및-CrazyGames-RC1-최종QA-완료보고.md
```

보고 순서:

1. 한 줄 결론
2. 작업 전 기준선
3. 수정 파일과 이유
4. 가로 휠 수정 증거
5. 정밀 터치패드 누적 로직과 수치
6. 현재 프레임 anchor 동기화
7. 신규 테스트와 전체 테스트 수
8. 실제 Chrome 휠·좌표 QA
9. 85/100/130 전투 스크린샷
10. 접근성 QA
11. 네 모드 회귀
12. 콘솔·404·외부 요청
13. CrazyGames 파일 수·용량·ZIP
14. 알려진 한계
15. 최종 `git status --short`

“정상”만 쓰지 말고 입력 delta, 배율 전후값, 좌표 오차, 버튼 실측 크기, 테스트 수, 빌드 용량으로 증명한다.

---

## 11. Claude Code에 전달할 실행 문구

```text
E:\workspace\claude\neon-fleet-worktrees\stage1-analytics\docs\2026-07-30-Claude-카메라휠-보정및-CrazyGames-RC1-최종QA-작업지시서.md

이 작업지시서와 선행 검토 보고서 docs/2026-07-30-Codex-전투카메라-검토결과.md를 처음부터 끝까지 읽고 순서대로 작업해줘.
현재 미커밋 Stage 1·Prolific·CrazyGames·카메라 변경을 모두 보존하고 되돌리지 마.
가로 휠 오작동, 정밀 터치패드 과민 반응, 입력 anchor 1프레임 지연만 수정하고 새 기능이나 밸런스 변경은 하지 마.
기존 702개 테스트를 전부 유지하면서 실제 이벤트 기반 테스트를 추가하고, 적·탄환·아이템·파티클이 함께 보이는 85/100/130 전투 비교 스크린샷을 만들어.
네 모드 회귀와 CrazyGames ZIP을 다시 검증해.
commit, push, merge, 배포, CrazyGames 업로드는 하지 말고 완료보고서를 작성한 뒤 멈춰.
```
