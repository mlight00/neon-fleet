# NEON FLEET Stage 1 — 행동 계측·외부 테스트 준비 완료 보고

- 작성: Claude (구현) · 검증 요청: Codex
- 일자: 2026-07-26

---

## 1. 실제 기준 커밋
- `origin/master` = `3e178bc` (작업 시작 시 HEAD와 동일, `git merge-base --is-ancestor 3e178bc HEAD` 확인).

## 2. 작업 브랜치
- `claude/neon-fleet-analytics-stage1` (전용 worktree: `E:\workspace\claude\neon-fleet-worktrees\stage1-analytics`).

## 3. 커밋 목록
- **없음.** 지시대로 commit/push/merge/rebase/reset/clean/배포를 하지 않았다. 변경은 워킹 트리에만 있다. (Codex가 검토 후 커밋 여부 결정.)

## 4. 변경 파일

**신규(코드)**
- `js/analytics-config.js` — 설정 + 이벤트/속성 계약(스키마) + 검증 헬퍼(measurementId·dev URL·debug·viewport·shouldOfferConsent)
- `js/analytics.js` — 벤더 독립 코어(화이트리스트·정제·once·디버그 로그·installDebugGlobal)
- `js/analytics-consent.js` — 동의 저장(별도 키, granted/denied/unknown)
- `js/analytics-ga4.js` — 선택형 GA4 어댑터(동의 후 동적 로드·consent·config·revoke)
- `js/analytics-events.js` — 게임 파사드(공통 속성·세션·원정 단위 중복 방지)

**신규(테스트)**
- `tests/analytics.test.mjs`, `tests/analytics-consent.test.mjs`, `tests/analytics-ga4.test.mjs`, `tests/analytics-wiring.test.mjs`, `tests/consent-ui-listeners.test.mjs`

**수정**
- `js/main.js` — 분석 스택 구성 + 동의 UI 흐름 + 권위 있는 상태 전이 지점 계측 배선
- `js/ui.js` — 동의 배너 + 수집 항목 모달(overlay 패널이 아닌 `#stage` 별도 요소)
- `js/intro.js` — `playIntro`가 시작 콜백(`onStart`) + 종료 이유(`skip`/`complete_auto`/`complete_next`) 전달
- `css/style.css` — 동의 UI 스타일(비차단·safe-area)

**신규(문서/QA)**
- `docs/analytics/stage1-tracking-plan.md`, `docs/analytics/stage1-ga4-admin-setup.md`
- `docs/research/2026-07-26-Stage1-15명-플레이테스트-가이드.md`, `…-기록템플릿.csv`, `…-결과템플릿.md`
- `docs/qa/stage1-analytics-20260726/`: `results.md`, `qa-sim.mjs`, `event-sequence-sanitized.json`, `network-summary-sanitized.json`
- 본 보고서

> `index.html`은 손대지 않았다(gtag 고정 삽입 금지 준수).

## 5. 이벤트 계약 요약
19종 이벤트: `title_viewed`, `intro_started/skipped/completed`, `guide_viewed/completed`, `expedition_start_selected`, `expedition_started`, `combat_started`, `sector_started`, `route_selected`, `node_completed`, `build_choice_selected`, `progression_milestone_reached`, `free_upgrade_selected`, `expedition_ended`, `retry_selected`, `hangar_viewed`, `analytics_consent_updated`. 상세는 `docs/analytics/stage1-tracking-plan.md`. 필요 최소 세트에 더해 `progression_milestone_reached`(second_weapon·first_resonance·flagship_tier)를 저위험으로 함께 배선했다.

## 6. 동의 동작
- 저장 키 `neonFleet.analyticsConsent.v1`(게임 저장과 분리, `save.reset()`이 지우지 않음).
- 값: `granted`/`denied`, 없음/손상/저장불능 → `unknown`(= 전송 0).
- 저장소가 읽기·쓰기 도중 실패하면 메모리 폴백으로 즉시 전환하며 `available` 진단값도 실제 상태를 반영한다.
- UI: 측정 ID가 유효할 때만 첫 타이틀에 비차단 배너 + 설정(⚙) 패널에 상태·허용·거부·철회·수집 항목 보기. 전투 진입 시 숨김.
- 철회: `adapter.revoke()`로 `analytics_storage:denied` 업데이트 + 미래 전송 중단, 재로드 시 스크립트 로드 안 함. 동의 전 이벤트 버퍼링·소급 전송 없음.

## 7. GA4 설정 상태
- 어댑터·mock·로컬 QA 완성. `send_page_view:false`, `allow_google_signals:false`, `allow_ad_personalization_signals:false`, consent 기본 denied→granted, `user_id` 미사용, `debug_mode`는 `?analyticsDebug`일 때만.
- 관리자 설정·파생 이벤트·DebugView 절차는 `docs/analytics/stage1-ga4-admin-setup.md`.

## 8. 측정 ID 제공 여부
- **미제공.** `ANALYTICS_CONFIG.measurementId=''`, `enabled:false`(기본). 임의 값·회사 GA4 재사용 안 함.

## 9. 자동 테스트
- `node --test tests/*.test.mjs` → **tests 581, pass 581, fail 0** (기존 512 유지 + 신규 69).

## 10. 브라우저 QA 결과
- Codex 인앱 브라우저로 데스크톱 `1280×720`·모바일 `390×844`를 실제 조작했다. 설정 비활성, 미결정, 허용, 거부·새로고침, 철회·재허용, 개발 URL 5종, 분석 스크립트 404를 모두 PASS했다.
- 외부 Google 전송을 피하려고 임시 복사본의 스크립트만 로컬 스텁으로 교체했으며 저장소 코드·설정은 바꾸지 않았다.
- 스크린샷 3개와 정제 결과 `browser-qa-summary.json`을 `docs/qa/stage1-analytics-20260726/`에 저장했다. 시뮬레이션도 **19/19 PASS**다.

## 11. 동의 전·거부·철회 네트워크 결과(시뮬)
- 동의 전(unknown)·거부(denied): 스크립트 0, gtag 이벤트 0.
- 철회: 이후 전송 0, 재로드 시 스크립트 0.

## 12. 개발 모드 제외 결과
- dev 게이트로 전체 시퀀스 전송 0(시뮬 F) + `analytics-ga4.test.mjs`/`analytics-wiring.test.mjs`의 dev 파이프라인 0 검증.

## 13. PII 검사 결과
- 정제 이벤트 속성 스캔(이메일·쿠키·client_id·전화·URL·user_id 패턴) 히트 **0**. 값은 enum·정수·짧은 id뿐.

## 14. QA 증거 경로
- `docs/qa/stage1-analytics-20260726/results.md`, `browser-qa-summary.json`, 데스크톱·모바일 PNG 3개, `event-sequence-sanitized.json`(21개 순서), `network-summary-sanitized.json`, `qa-sim.mjs`.

## 15. 15명 테스트 준비 파일
- 가이드 + 빈 기록 CSV(P01~P15) + 빈 결과 템플릿(`docs/research/`). UTM 집단 규칙·개인정보 비수집 원칙 포함.

## 16. 실제 15명 테스트는 미실행
- 결과를 만들거나 추정하지 않았다. 실제 모집·플레이·기록은 소유자 진행.

## 17. 알려진 제한
- **측정 ID 미제공** → 실제 GA4 네트워크·DebugView는 검증 못 함(BLOCKED).
- `selection_method`는 `ui.showSectorMap`의 `onPick(node, method)`가 실제 입력 수단을 그대로 전달한다: 마우스=`pointer_confirm`, 터치=`touch_confirm`, 키보드=`keyboard_confirm`, 첫 섹터 단일 루트=`auto_root`. 이전의 `manual_confirm` 축소값은 제거됐다(추정 없음).
- `route_selected(auto_root)`는 기존 `enterNode(root)` 소스 배선(회귀 테스트 고정)을 보존하기 위해 항로 확정 감지 시점에 발생 — 가이드 화면보다 약간 앞서 기록될 수 있음(집계에는 영향 없음).

## 18. Codex 검증 요청
아래를 독립 확인 바랍니다(작업지시서 §28):
1. 최신 origin/master(3e178bc 포함) 기준 브랜치
2. 기존 512개 테스트 유지(현재 581/581)
3. 이벤트 계약과 실제 호출 일치
4. `expedition_ended` 중복 없음 / 5. `run_index_session=2` 재현
6. 동의 전 Google 요청 0 / 7. 거부·철회 뒤 전송 0
8. 개발 URL 4종 전송 0 / 9. PII·고카디널리티 속성 없음
10. GA4 ID 미제공 시 정확한 BLOCKED 보고
11. 데스크톱·모바일 동의 UI 비차단(실제 브라우저·스크린샷 PASS)
12. gtag 실패 시 게임 정상 / 13. 15명 결과 미조작
14. 게임 소스 외 광범위 변경 없음 / 15. master·Pages 미반영

---

## 게이트 요약

```
Gate A (코드)        PASS   — 581/581 테스트, dev 전송 0, run-metrics 불변
Gate B (개인정보)    PASS   — 동의 전/거부/철회 전송 0, PII 0, 동의·저장 분리, PC·모바일 브라우저 비차단
Gate C (GA4)         BLOCKED — NEON FLEET GA4 measurement ID 미제공(어댑터·mock·로컬 QA는 완료)
Gate D (테스트 준비) PASS   — 가이드·기록/결과 템플릿·UTM 규칙·비수집 원칙
Gate E (실제 외부 테스트) PENDING — 실제 15명 플레이 전
```

> **작업 완료의 정의(이번 범위):** 공개 사용자 행동을 동의 뒤에만 일관된 이벤트로 기록할 수 있고, 분석 실패에도 게임이 정상이며, 개발 모드 데이터가 섞이지 않고, 15명 테스트를 실제로 시작할 준비가 끝났다. **Stage 1 전체 완료(자발적 2회차·다음 빌드 가설·희열 순간 근거로 Stage 2 확정)는 실제 15명 테스트 이후다.** 두 상태를 구분해 보고한다.
