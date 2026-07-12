# NEON ADAPTATION Phase 2 — 코드리뷰 후속 수정 작업 지시서

- 작성일: 2026-07-12
- 기준 커밋: `ceaefa4`
- 대상 저장소: `mlight00/neon-fleet`
- 대상 브랜치: `master`
- 작업 대상: Claude Code
- 목적: Phase 2 재검토에서 재현된 제거탄 피해, 군체 용광로 킬 누락, B22 HUD 중첩, 검증·문서 불일치를 수정하고 Phase 2를 최종 승인 상태로 만든다.
- 현재 기준: 자동 테스트 162개 통과, JS 문법·모듈 import 정상, `git diff --check` 실패 1건

---

## 0. 작업 범위와 원칙

이번 작업은 신규 콘텐츠 개발이 아니라 **Phase 2 회귀 수정**이다.

다음 네 영역만 수정한다.

1. 위상 잔상으로 제거된 적탄의 같은 프레임 피해 차단
2. 모든 플레이어 처치 경로를 군체 용광로 킬 이벤트에 연결
3. 네온 아비터 STAGGER/BREAK HUD 중첩 해소
4. 공백 검사·작업 지시서·결과서·실배포 검증 정합성

금지 사항:

- FLOW·RUSH·키스톤·B22 신규 기능 추가
- 현재 밸런스 수치 변경
- 신규 보스·적·무기·모듈 추가
- 저장 스키마 변경
- 승급·강등·`bankStack` 변경
- 청크·노드 생성 규칙 변경
- `entities.js`·`bosses.js` 추가 분할
- 기존 162개 테스트 삭제 또는 완화

---

## 1. 완료 목표

다음 조건을 모두 만족해야 완료로 판정한다.

1. `dead=true`인 적탄은 이동·피격·graze·FLOW·STAGGER를 전혀 발생시키지 않는다.
2. 위상 잔상으로 제거된 탄은 같은 프레임에도 플레이어에게 피해를 주지 않는다.
3. 일반탄, 차지 랜스, 메아리 랜스, 시즈 광역, 폭발 탄두 연쇄 처치가 모두 실제 적 킬로 정확히 한 번 집계된다.
4. 비적대 개체와 화면 밖 자연 소멸은 군체 용광로 킬로 집계되지 않는다.
5. B22 보스 이름·HP·STAGGER/BREAK·모듈 줄이 겹치지 않는다.
6. `git diff --check`가 실제로 통과한다.
7. Phase 2 작업 지시서와 본 후속 지시서가 저장소에 커밋된다.
8. 실제 GitHub Pages 배포 URL을 새 탭·캐시 우회로 검증한다.
9. 전체 테스트·문법·import·브라우저 검증이 통과한다.

---

## 2. P1 — 위상 잔상 제거탄의 같은 프레임 피해 차단

### 2.1 재현된 현상

`Squad._phaseWave()`는 반경 안의 적탄을 다음처럼 제거한다.

```js
bullet.dead = true;
```

그러나 메인 루프는 배열에 남아 있는 모든 적탄에 `update()`를 호출하고, `EnemyShot.update()` 시작부에도 `dead` 조기 반환이 없다.

따라서 한 탄의 세 번째 graze가 위상 잔상을 발동해 주변 탄을 제거해도, 뒤에 있는 제거탄은 같은 프레임에 계속 이동·충돌한다.

실제 재현값:

```text
위상 잔상 발동 직후:
  cleared.dead = true
  드론 = 100

같은 프레임 cleared.update() 실행 후:
  cleared.dead = true
  드론 = 90
```

### 2.2 대상 파일

- `js/entities.js`
- `js/main.js`
- `tests/flow.test.mjs`
- 필요 시 `tests/keystones.test.mjs`

### 2.3 필수 수정

`EnemyShot.update()`의 첫 줄에 조기 반환을 추가한다.

```js
update(dt, world) {
  if (this.dead) return;
  // 기존 로직
}
```

메인 적탄 반복문에도 방어적으로 살아 있는 탄만 업데이트한다.

```js
for (const b of w.enemyBullets) {
  if (!b.dead) b.update(dt, w);
}
```

두 방어를 모두 적용한다.

이유:

- `EnemyShot`이 다른 호출부에서 직접 업데이트되어도 안전해야 한다.
- 한 적탄 업데이트 중 다른 적탄이 제거되는 같은 프레임 상황을 메인 루프에서도 차단해야 한다.

### 2.4 필수 테스트

1. `dead=true`인 EnemyShot에 `update()`를 호출해도 위치가 변하지 않는다.
2. `dead=true`인 EnemyShot이 플레이어와 겹쳐도 드론 피해가 없다.
3. `dead=true`인 EnemyShot이 graze 거리여도 FLOW가 증가하지 않는다.
4. 위상 잔상 세 번째 graze로 주변 탄을 제거한 뒤, 제거탄의 차례가 와도 피해가 없다.
5. 제거탄은 B22 STAGGER를 증가시키지 않는다.
6. 살아 있는 일반 적탄의 기존 이동·피격·graze 동작은 유지된다.

테스트 4번은 다음 순서를 실제 클래스와 world 스텁으로 재현한다.

```text
phase_afterimage 선택
grazeCount = 2
triggerShot.update() → 세 번째 graze → clearShot.dead=true
clearShot.update()
드론 수와 FLOW가 변하지 않음
```

계산식만 복사한 테스트는 금지한다.

---

## 3. P2 — 모든 플레이어 처치 경로의 킬 이벤트 통합

### 3.1 재현된 현상

현재 군체 용광로 킬 카운터는 `main.js`의 일반 아군 탄환 충돌 경로에서만 `onEnemyKilled()`를 호출한다.

따라서 다음 처치는 집계되지 않는다.

- 차지 랜스 직격
- 공명 메아리 랜스
- 시즈 토피도 광역 폭발
- 폭발 탄두 모듈의 연쇄 폭발

실제 재현값:

```text
키스톤 = swarm_forge
kills = 9
3단 차지 랜스로 적 처치

결과:
  enemy.dead = true
  kills = 9
  forgeT = 0
```

### 3.2 목표 계약

“플레이어 공격으로 실제 적이 살아 있음 → 죽음으로 전환된 순간”을 킬 이벤트로 정의한다.

다음은 집계한다.

- 일반 아군 탄환
- 도탄·분열 같은 파생탄의 직접 적중
- 차지 랜스
- 메아리 랜스
- 시즈 토피도 직접·광역 피해
- 폭발 탄두 연쇄 피해
- 널 커터 등 실제 피해로 적을 죽인 경우

다음은 집계하지 않는다.

- 크리스탈·수송선·캡슐
- 화면 밖 자연 소멸
- 스캐빈저 도주
- 적의 자폭 또는 게이트 통과로 사라진 개체
- 이미 처리한 죽은 적의 중복 호출
- 보스 자체

### 3.3 대상 파일

- `js/main.js`
- `js/entities.js`
- 필요 시 `js/adaptive-enemies.js`
- `tests/keystones.test.mjs`
- 신규 `tests/kill-events.test.mjs` 권장

### 3.4 구현 지침

world에 단일 킬 알림 경로를 둔다.

권장 계약:

```js
world.notifyEnemyKilled(entity, source)
```

또는 동일 목적의 명확한 이름을 사용할 수 있다.

중앙 처리 함수는 반드시 멱등이어야 한다.

```js
function notifyEnemyKilled(e, source, world) {
  if (!e?.isEnemy || !e.dead || e._killHandled) return false;
  e._killHandled = true;

  // 기존 폭발 탄두·드론 회수 모듈
  // 군체 용광로 squad.onEnemyKill
  return true;
}
```

세부 원칙:

1. `_killHandled` 또는 동등한 플래그로 개체당 한 번만 처리한다.
2. 기존 일반 탄환 경로도 새 중앙 함수로 연결한다.
3. 차지 랜스와 메아리 랜스는 각 대상 타격 전후 `wasAlive && target.dead`를 확인해 중앙 함수에 알린다.
4. 시즈 광역과 폭발 탄두 연쇄 피해도 새로 죽은 대상마다 중앙 함수에 알린다.
5. 연쇄 폭발이 다시 연쇄 처치를 만들 수 있지만 각 적은 한 번만 처리한다.
6. 보스·크리스탈·보상 개체는 `isEnemy` 계약으로 제외한다.
7. 화면 밖 `dead=true` 처리에는 중앙 킬 함수를 호출하지 않는다.
8. 기존 코인 지급은 각 적의 사망 로직을 유지한다. 중앙 킬 이벤트에서 코인을 다시 지급하지 않는다.
9. 기존 `onEnemyKilled()`와 새 경로가 동시에 호출되어 보상·폭발·킬이 두 배가 되지 않게 한다.

### 3.5 주의할 재귀

폭발 탄두 처리 중 다른 적이 죽으면 중앙 킬 함수가 재귀적으로 호출될 수 있다.

반드시 대상의 `_killHandled`를 **폭발 처리 전에 먼저 설정**한다.

```text
적 A 처리 시작
→ A._killHandled=true
→ A 폭발
→ B 사망
→ B 처리
→ B 폭발
→ A가 범위에 있어도 A는 이미 처리됨
```

재귀 깊이는 실제 적 수를 넘지 않아야 하며 무한 루프가 없어야 한다.

### 3.6 필수 테스트

1. 일반 탄환 처치가 1킬로 집계된다.
2. 동일 적에 중앙 알림을 두 번 호출해도 1킬이다.
3. `kills=9`에서 차지 랜스 처치 시 `forgeT=8`이 된다.
4. 메아리 랜스 처치도 1킬로 집계된다.
5. 시즈 토피도 광역으로 죽은 주변 적도 집계된다.
6. 폭발 탄두로 연쇄 사망한 적 각각이 한 번씩 집계된다.
7. 연쇄 폭발 중 같은 적이 중복 처리되지 않는다.
8. 크리스탈·DronePod는 집계되지 않는다.
9. 화면 밖 자연 소멸은 집계되지 않는다.
10. 보스는 군체 용광로 10킬에 포함되지 않는다.
11. 기존 `killDroneChance`와 폭발 탄두가 중복 발동하지 않는다.
12. 군체 용광로가 아닌 키스톤에서는 킬 이벤트가 부작용을 만들지 않는다.

최소 한 테스트는 실제 `Squad.fireLance()`를 사용해 앞서 재현한 9→10킬 발동을 검증한다.

---

## 4. P2 — 네온 아비터 HUD 중첩 해소

### 4.1 현재 문제

현재 좌표:

```text
보스 이름·HP 수치 baseline: y=51
STAGGER bar: y=44~49
BREAK 문구 baseline: y=52
```

STAGGER 바가 보스 이름 글자 영역과 겹치며 BREAK 문구는 이름·HP와 거의 같은 baseline에 그려진다.

### 4.2 대상 파일

- `js/render.js`
- 필요 시 HUD 좌표 테스트 파일
- 브라우저 검증 결과 스크린샷 또는 계측

### 4.3 권장 좌표

보스 이름·HP는 기존 `y=51`을 유지한다.

```text
STAGGER label baseline: y=64
STAGGER bar: y=68~73
BREAK baseline: y=70
모듈 줄: y=83 유지
```

실제 폰트 높이를 확인해 최소 간격을 확보한다. 위 숫자는 권장안이며 시각 검증 후 소폭 조정할 수 있다.

규칙:

- 보스 이름/HP와 STAGGER/BREAK가 겹치지 않는다.
- STAGGER/BREAK와 모듈 아이콘 줄이 겹치지 않는다.
- 다중 보스 HUD에는 STAGGER 바가 나타나지 않는다.
- 일반 보스 HUD 위치는 변경하지 않는다.
- 모바일 390×844와 데스크톱 1280×720 모두 확인한다.

### 4.4 필수 검증

1. B22 일반 상태 스크린샷 또는 픽셀·좌표 계측
2. B22 BREAK 상태 스크린샷 또는 픽셀·좌표 계측
3. 모듈 아이콘이 5개 이상일 때 중첩 없음
4. 기함 이름·보스 HP·FLOW HUD와 중첩 없음

브라우저에서 B22 상태를 재현하기 위한 임시 테스트 훅을 만들었다면 커밋 전에 제거한다.

---

## 5. P2 — 검증·문서·저장소 정합성

### 5.1 `git diff --check` 실제 실패

현재 재현:

```text
js/keystones.js:71: new blank line at EOF.
```

EOF 여분 빈 줄을 제거하고 실제 명령이 exit code 0인지 확인한다.

테스트 명령을 `;`로 이어 마지막 명령의 성공만 보는 방식은 금지한다. 각 명령 실패 시 전체 검증이 실패하도록 실행한다.

PowerShell 권장:

```powershell
git diff --check 671b87a..HEAD
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

### 5.2 작업 지시서 커밋

현재 Phase 2 결과서는 다음 파일을 참조하지만 해당 파일은 원격 저장소에 없다.

```text
docs/2026-07-12-neon-adaptation-phase2-work-order.md
```

다음 두 지시서를 이번 후속 작업에 커밋한다.

```text
docs/2026-07-12-neon-adaptation-phase2-work-order.md
docs/2026-07-12-phase2-review-followup-work-order.md
```

원격 GitHub에서 두 파일 링크가 실제로 열리는지 확인한다.

### 5.3 결과서 수정

기존 결과서:

```text
docs/2026-07-12-neon-adaptation-phase2-result.md
```

다음을 수정한다.

- `git diff --check`가 초판에서는 실패했음을 숨기지 않고 후속 수정으로 해결했다고 기록
- 위상 잔상 제거탄의 같은 프레임 피해 원인·수정·회귀 테스트
- 모든 킬 경로 중앙화 방식과 실측
- B22 HUD 좌표 변경과 모바일·데스크톱 결과
- 실제 전체 테스트 수
- 실제 최종 구현 커밋과 결과서 게시 커밋을 구분
- localhost 검증과 GitHub Pages 실배포 검증을 구분

신규 후속 결과서도 작성한다.

```text
docs/2026-07-12-phase2-review-followup-result.md
```

### 5.4 실제 배포 검증

배포 URL:

```text
https://mlight00.github.io/neon-fleet/
```

검증 조건:

- push 후 GitHub Pages 반영 대기
- 새 탭 사용
- `?v=<최종커밋>` 쿼리 사용
- 일반 새로고침만으로 최신 모듈이라고 단정하지 않음
- 모바일 390×844에서 타이틀→출격→맵→전투 진입
- 콘솔 error/warning 0
- 문서 scrollWidth가 viewport width를 넘지 않음

가능하면 B22·키스톤을 실제 배포판에서 계측한다. 네트워크 정책으로 GitHub Pages 접근이 불가능하면 `배포 검증: 미완료(접근 차단)`로 정확히 보고하고 localhost를 배포 검증이라고 표현하지 않는다.

---

## 6. 필수 검증 명령

전체 자동 테스트:

```bash
node --test tests/*.test.mjs
```

Windows PowerShell 문법 검사:

```powershell
Get-ChildItem js -Filter *.js | ForEach-Object {
  node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

모듈 import:

```bash
node -e "Promise.all([import('./js/entities.js'),import('./js/bosses.js'),import('./js/flow.js'),import('./js/keystones.js')]).then(() => console.log('imports ok'))"
```

공백 검사:

```bash
git diff --check 671b87a..HEAD
```

각 명령의 exit code를 개별 확인한다.

---

## 7. 필수 브라우저·플레이 시나리오

### 데스크톱 1280×720

1. FLOW 적립·RUSH 발동
2. 위상 잔상 세 번째 graze로 제거한 탄이 같은 프레임 피해를 주지 않음
3. 군체 용광로 9킬 → 차지 랜스 처치 → 즉시 유령 순양함 발동
4. 시즈 또는 폭발 연쇄 처치가 킬 카운터에 포함됨
5. B22 STAGGER HUD 중첩 없음
6. B22 BREAK HUD 중첩 없음

### 모바일 390×844

1. 타이틀→출격→맵→전투 진입
2. FLOW HUD와 차지 버튼 중첩 없음
3. 키스톤 카드 3장 선택 가능
4. B22 이름·HP·STAGGER/BREAK·모듈 줄 중첩 없음
5. 가로·세로 문서 오버플로 없음
6. 콘솔 error/warning 없음

---

## 8. 권장 커밋 구성

### 커밋 1 — 제거탄·킬 이벤트 수정

```text
fix(phase2): 제거탄 같은 프레임 피해와 킬 이벤트 누락 수정
```

- EnemyShot dead guard
- 메인 적탄 반복 guard
- 중앙 킬 이벤트
- 차지·메아리·광역·연쇄 연결
- 자동 테스트

### 커밋 2 — HUD·공백·지시서

```text
fix(ui): B22 HUD 중첩 해소와 Phase 2 지시서 반영
```

- STAGGER/BREAK 좌표
- `keystones.js` EOF
- Phase 2 지시서 2개 커밋
- 브라우저 검증

### 커밋 3 — 결과서·배포

```text
docs(phase2): 코드리뷰 후속 수정과 실배포 검증 기록
```

- 기존 결과서 정정
- 후속 결과서 신규 작성
- 최종 테스트·배포 정보

---

## 9. 최종 완료 조건

- [ ] dead 적탄은 update·피격·graze·STAGGER를 발생시키지 않음
- [ ] 위상 잔상 제거탄의 같은 프레임 피해 재현이 차단됨
- [ ] 일반탄 처치가 정확히 1회 집계됨
- [ ] 차지 랜스 처치가 정확히 1회 집계됨
- [ ] 메아리 랜스 처치가 정확히 1회 집계됨
- [ ] 시즈 광역 처치가 정확히 1회 집계됨
- [ ] 폭발 탄두 연쇄 처치가 적마다 정확히 1회 집계됨
- [ ] 비적대·자연 소멸·보스는 군체 용광로 킬에서 제외됨
- [ ] 군체 용광로 9→10킬 실발동 확인
- [ ] B22 이름·HP·STAGGER/BREAK·모듈 HUD 중첩 없음
- [ ] 기존 162개 테스트 전부 유지
- [ ] 신규 회귀 테스트를 포함한 전체 테스트 통과
- [ ] 모든 JS 문법 검사 통과
- [ ] 모듈 import 통과
- [ ] `git diff --check` exit code 0
- [ ] Phase 2 지시서 2개가 커밋·푸시됨
- [ ] 기존 결과서와 후속 결과서가 구현과 일치
- [ ] 실제 GitHub Pages 배포 상태를 정확히 보고
- [ ] 모바일·데스크톱 콘솔 error/warning 0
- [ ] 금지 범위 밖의 변경 없음

하나라도 미충족이면 완료라고 보고하지 않는다.

---

## 10. 후속 결과서 형식

결과서 경로:

```text
docs/2026-07-12-phase2-review-followup-result.md
```

반드시 포함할 항목:

1. 기준 커밋
2. 최종 구현 커밋
3. 결과서 게시 커밋
4. 변경 파일 목록
5. 제거탄 피해 재현 전·후 값
6. 일반탄·차지·메아리·시즈·연쇄 폭발 킬 계측
7. 군체 용광로 9→10킬 발동 결과
8. B22 HUD 좌표와 데스크톱·모바일 검증
9. 추가 테스트 목록과 전체 테스트 수
10. 문법·import·`git diff --check` 결과와 exit code
11. 두 작업 지시서 커밋 여부
12. 배포 URL·캐시 우회 방식·실배포 검증 여부
13. 잔여 문제

마지막 형식:

```text
Phase 2 후속 수정 완료 여부: 완료 / 미완료
자동 테스트: N/N 통과
신규 회귀 테스트: N개
git diff --check: 통과 / 실패
최종 구현 커밋: <hash>
결과서 게시 커밋: <hash 또는 게시 후 후속 해시>
배포 URL: <url>
실배포 검증: 완료 / 미완료(사유)
잔여 문제: 없음 / 항목 나열
```
