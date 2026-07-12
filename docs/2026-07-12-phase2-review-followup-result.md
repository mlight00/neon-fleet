# NEON ADAPTATION Phase 2 — 코드리뷰 후속 수정 결과서

**날짜**: 2026-07-12
**작업 지시서**: `docs/2026-07-12-phase2-review-followup-work-order.md`
**목적**: Phase 2(`ceaefa4`) 재검토에서 재현된 4건(제거탄 같은 프레임 피해, 킬 이벤트 누락, B22 HUD 중첩, 공백·문서·배포 정합)을 수정.

---

## 1~3. 기준·구현·게시 커밋

- **기준 커밋**: `671b87a`
- **최종 구현 커밋**: `816b5b5`(→ amend `0610e6f`, HUD·지시서·EOF)
  | 커밋 | 해시 | 내용 |
  | --- | --- | --- |
  | F1 | `0140fca` | fix(phase2): 제거탄 같은 프레임 피해와 킬 이벤트 누락 수정 |
  | F2 | `0610e6f` | fix(ui): B22 HUD 중첩 해소와 Phase 2 지시서 반영 |
  | F3 | `1f09651` | docs(phase2): 코드리뷰 후속 수정과 실배포 검증 기록 |
- **결과서 게시 커밋**: `1f09651`(본 결과서 커밋)

## 4. 변경 파일 목록

- 신규: `js/kill-events.js`, `tests/kill-events.test.mjs`
- 수정: `js/entities.js`(EnemyShot dead 가드, 랜스·메아리·시즈 킬 알림), `js/main.js`(중앙 `onEnemyKilled`+`claimKill`, 적탄 루프 가드, `world.notifyEnemyKilled`), `js/render.js`(STAGGER/BREAK 좌표), `js/keystones.js`(EOF), `tests/flow.test.mjs`(dead 가드 6)
- 저장소 추가: `docs/2026-07-12-neon-adaptation-phase2-work-order.md`, `docs/2026-07-12-phase2-review-followup-work-order.md`
- 문서 정정: `docs/2026-07-12-neon-adaptation-phase2-result.md`

## 5. 제거탄 피해 재현 전·후 값

- **전(재현)**: 위상 잔상 세 번째 graze가 반경 탄을 `dead=true`로 표시해도, 메인 루프가 그 탄을 계속 `update()` → 같은 프레임 이동·충돌 → 드론 100 → 90.
- **후(수정)**: `EnemyShot.update()` 첫 줄 `if (this.dead) return;` + 메인 루프 `if (!b.dead) b.update()`. 두 방어 모두 적용. → 제거탄 update돼도 위치·피해·graze·STAGGER 없음. 회귀 테스트(실 Squad + 실 EnemyShot)로 드론 수 불변 확인.

## 6. 킬 경로 계측 (일반탄·차지·메아리·시즈·연쇄 폭발)

- 중앙 함수 `onEnemyKilled(e, w)` = `claimKill(e)`(순수, `isEnemy && dead && !_killHandled`, 개체당 1회) → 폭발 탄두(연쇄 재귀, 각 1회) → 전리 회수 → `squad.onEnemyKill`. `world.notifyEnemyKilled`로 노출.
- 연결된 처치 경로: 일반 아군 탄(기존 루프)·차지 랜스(`fireLance`)·메아리 랜스(`_fireEcho`)·시즈 광역(`Bullet.onHit` blast)·폭발 탄두 연쇄. 각 site는 `wasAlive→dead` 확인 후 `world.notifyEnemyKilled(e)` 호출.
- 실측(테스트): 일반 1킬, 중복 알림 1킬, **실 `Squad.fireLance(3단)` 9→10킬 시 `forgeT=8` 발동**, 시즈 광역 3마리 각 1회, 상호 폭발 연쇄 2마리 각 1회(무한 재귀 없음), 크리스탈·DronePod 0킬, 비군체 키스톤 부작용 0.

## 7. 군체 용광로 9→10킬 발동 결과

- 실 `Squad.fireLance(world, 3)`로 저체력 `Creature` 처치 → `world.notifyEnemyKilled` → `claimKill`(true) → `squad.onEnemyKill` → `forgeOnKill`: `kills 9→10→0(롤오버)`, `forgeT = 8`(유령 순양함 전개). 테스트 `kill-events.test.mjs`로 고정.

## 8. B22 HUD 좌표와 데스크톱·모바일 검증

- 변경: STAGGER 라벨 `y=64`, 바 `y=68~73`, BREAK `y=70`. 보스 이름·HP `y=51`, 모듈 줄 `y=83` 유지.
- **데스크톱 1280 실측**(render.drawHUD를 실 캔버스 계측): 네온 아비터 이름 `y=51` · STAGGER `y=64` · 모듈 `y=83` · FLOW `y=743` — 전부 분리, 겹침 없음. BREAK 상태도 `y=70`(이름 51/모듈 83 사이). 다중 보스에는 STAGGER 바 미표시.
- **모바일 390×844**: 문서 오버플로 없음(scrollWidth=390), 콘솔 error/warning 0.

## 9. 추가 테스트 목록과 전체 테스트 수

- `tests/flow.test.mjs` +6: dead update 위치 불변·겹침 무피해·graze 무증가·위상 제거탄 무피해(실클래스)·B22 STAGGER 미증가·살아있는 탄 회귀.
- `tests/kill-events.test.mjs` +9: claimKill 계약 2, 일반 1킬·중복 1킬·**실 fireLance 9→10**·시즈 연쇄 3·상호 폭발 2·크리스탈/pod 제외·비군체 무부작용.
- **전체: 177개 통과 (Phase 2 162 → +15).**

## 10. 문법·import·git diff --check 결과와 exit code

- `node --test`: 177/177.
- `node --check` 전체 JS: 문법 오류 없음.
- 모듈 import 스모크(`entities/bosses/flow/keystones`): ok.
- `git diff --check 671b87a..HEAD`: **exit 0**(초판은 `keystones.js:71` + 복사한 지시서 2개 EOF 빈 줄로 exit 2였고, EOF 정리로 통과). 각 명령 exit code를 개별 확인.

## 11. 두 작업 지시서 커밋 여부

- `docs/2026-07-12-neon-adaptation-phase2-work-order.md`, `docs/2026-07-12-phase2-review-followup-work-order.md` 둘 다 커밋(F2). 원격 push 후 GitHub에서 링크 확인 대상.

## 12. 배포 URL·캐시 우회·실배포 검증

- **배포 URL**: https://mlight00.github.io/neon-fleet/ (GitHub Pages, root/master).
- **캐시 우회**: 새 탭 + `?v=<커밋>` 쿼리 + `import('/js/x.js?v=<커밋>')` + `fetch(...,{cache:'reload'})`. 일반 새로고침을 최신이라 단정하지 않음.
- **localhost 검증(배포본과 동일 커밋 파일)**: 최신 코드 구동 확인(`__NF.run.squad.flow`·`onEnemyKill` 존재), 180프레임 무에러, B22 HUD 좌표 실측 분리, 모바일 오버플로 없음, 콘솔 무결.
- **GitHub Pages 실배포 검증**: 회사 PC는 `github.io` 접근이 차단되어 배포 도메인 직접 계측 불가 → **실배포 검증: 미완료(네트워크 정책 차단)**. localhost를 배포 검증이라 표현하지 않는다. 배포본은 로컬 검증과 동일 커밋 파일이 GitHub Pages에서 서빙된다.

## 13. 잔여 문제

- 없음(기능). GitHub Pages 도메인 직접 계측은 회사 PC 네트워크 차단으로 불가 — 접근 가능한 환경에서 `?v=` 새 탭으로 최종 확인 권장.
- Phase 3 후보(유지): B22 첫 등장 스테이지(로스터 끝 배치), 유령 순양함 실사격 유닛화.

---

```text
Phase 2 후속 수정 완료 여부: 완료
자동 테스트: 177/177 통과
신규 회귀 테스트: 15개
git diff --check: 통과 (671b87a..HEAD exit 0)
최종 구현 커밋: 0610e6f
결과서 게시 커밋: 1f09651
배포 URL: https://mlight00.github.io/neon-fleet/
실배포 검증: 미완료 (회사 PC github.io 접근 차단 — localhost=동일 커밋 파일로 검증)
잔여 문제: 없음 (Phase 3 후보만 기록)
```
