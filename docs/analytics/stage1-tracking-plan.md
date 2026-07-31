# NEON FLEET Stage 1 — 이벤트 계측 계획(Tracking Plan)

- 작성: Claude (구현) · 검증: Codex
- 기준 커밋: origin/master `3e178bc`
- 브랜치: `claude/neon-fleet-analytics-stage1`
- 스키마 버전: `1`
- 단일 출처: `js/analytics-config.js`(이 문서와 코드가 어긋나면 코드가 우선)

이 계측의 목적은 이벤트를 많이 쌓는 것이 아니라, 첫 사용자에게서 **어디서 이탈하는가 · 첫 사망 뒤 다시 출격하는가 · 어떤 선택이 다음 판의 가설을 만드는가**를 개인정보에 안전하게 측정하는 것이다.

---

## 1. 아키텍처

```
게임 상태 전이(main.js)
  └─ track.*()  ← 파사드 (js/analytics-events.js): 공통 속성·세션·원정 단위 중복 방지
       └─ analytics.emit/once (js/analytics.js): 이벤트/속성 화이트리스트 + 정제
            └─ ga4Sink → GA4 어댑터 (js/analytics-ga4.js): 동의 후에만 동적 로드·전송
```

- `main.js`·`ui.js`는 **gtag를 직접 부르지 않는다.** 파사드(`track`)만 호출한다.
- 개발/측정 진입(`coreLoopTest·campaign25·bosslab` 등)과 `run.devDirect`는 GA4 전송 0(어댑터 dev 게이트 + 파사드 `isPublicRun()`).
- `run-metrics.js`(개발 측정기)는 그대로 보존한다. 분석 코어는 그 내부 상태를 읽지 않는다.

---

## 2. 공통 속성

이벤트별로 허용된 것만 붙는다(나머지는 정제 단계에서 제거).

| 속성 | 형식 | 값 |
|---|---|---|
| `analytics_schema_version` | enum | `1` |
| `player_type` | enum | `new`, `returning` — 페이지 로드 시 저장 상태로 1회 판정, 세션 내 불변 |
| `viewport_group` | enum | `mobile`, `desktop` — emit 시점 계산(coarse 포인터/≤820px = mobile) |
| `game_mode` | enum | `campaign`, `endless` |
| `run_index_session` | int(1~999) | `expedition_started`에서 증가. `sessionStorage`(새 탭=1). 영구 ID 아님 |
| `sector` | int(1~99) | 현재 섹터 |

---

## 3. 이벤트 계약

트리거는 **UI 클릭 순간이 아니라 실제 상태가 바뀌는 권위 있는 지점**이다(작업지시서 §15).

### 3.1 화면·온보딩

| 이벤트 | 트리거(main.js) | 고유 속성 | 답하는 질문 |
|---|---|---|---|
| `title_viewed` | `showTitleScreen()` → `ui.showTitle` 뒤, 전환당 1회 | — | 타이틀 복귀·세션 흐름 |
| `intro_started` | `playIntroTracked` → intro.js `onStart` | — | 신규 진입 마찰 |
| `intro_skipped` | 프롤로그 건너뛰기 | `panel_reached`, `duration_sec` | 프롤로그 길이 |
| `intro_completed` | 자동/다음으로 마지막 패널 완료 | `completion_method`(`complete_auto`/`complete_next`), `duration_sec` | 프롤로그 소비 |
| `guide_viewed` | `enterSectorMap` soloRoot에서 첫 안내 표시 | `guide_type`(`combo`/`standard`) | 튜토리얼 진입 |
| `guide_completed` | 안내 `출격 시작` | `guide_type`, `duration_sec` | 안내 마찰 |

`intro_skipped` 뒤 `intro_completed`는 발생하지 않는다(파사드 `introEnded` 1회 가드).

### 3.2 원정 진입

| 이벤트 | 트리거 | 고유 속성 | 질문 |
|---|---|---|---|
| `expedition_start_selected` | 타이틀 캠페인/엔드리스 시작 버튼 | `game_mode` | 시작 의도 |
| `expedition_started` | `newExpedition` `begin()` — 시작 무기 선택 후 첫 섹터 진입 직전 1회 | `game_mode`, `run_index_session` | 세션당 원정 수·2회차 |
| `combat_started` | `enterNode` `state='play'` 직후, 원정당 1회 | `sector`, `time_to_combat_sec` | 첫 재미까지 시간 |
| `sector_started` | `startSector()` | `sector`, `game_mode` | 진행 퍼널 |

`expedition_start_selected`와 `expedition_started`는 분리한다(무기 선택 UI 이탈·오류 구분).

### 3.3 항로·노드

| 이벤트 | 트리거 | 고유 속성 | 질문 |
|---|---|---|---|
| `route_selected` | 진입 노드 확정 순간(자동 루트 = 확정 시, 수동 = onPick) | `node_type`, `node_col`, `selection_method` | 위험·보상 선택 |
| `node_completed` | `completeNode`에서 노드가 done에 처음 추가된 뒤 | `node_type`, `elapsed_sec` | 노드 이탈 |

`selection_method`: `auto_root`(첫 섹터 단일 루트, 확정 시 자동), `pointer_confirm`(마우스 클릭 확정), `touch_confirm`(터치 2단 확정 또는 확정 버튼), `keyboard_confirm`(키보드 Enter/Space 확정). `ui.showSectorMap`의 `onPick(node, method)`가 실제 입력 수단을 그대로 전달한다(추정 없음). 이전의 `manual_confirm` 축소값은 제거됐다.

### 3.4 빌드 선택

| 이벤트 | 트리거 | 고유 속성 | 질문 |
|---|---|---|---|
| `build_choice_selected` | 선택이 실제 런 상태에 적용된 직후 | `choice_type`, `choice_id`, `weapon_id`, `elapsed_sec` | 빌드 다양성 |
| `progression_milestone_reached` | 성장 이정표 최초 달성 | `milestone_type`, `milestone_value`, `elapsed_sec` | 성장 속도 |
| `free_upgrade_selected` | 무료 첫 개조 저장 성공 뒤 | `upgrade_key` | 첫 실패 보상 효과 |

`choice_type`: `start_weapon`, `module`, `doctrine`, `keystone`, `weapon_evolution`, `weapon_super_evolution`, `repair`.
`milestone_type`: `second_weapon`, `first_resonance`, `flagship_tier`(원정 내 각 1회).
`elapsed_sec`: 명시값이 있으면 그 값, 없으면 원정 시작(`expStartMs`) 기준 경과초를 **항상** 포함(성장 속도 결측 방지).
`upgrade_key`: `drones`, `hull`, `dmg`(`FIRST_DEFEAT_KEYS`).

### 3.5 결과·반복

| 이벤트 | 트리거 | 고유 속성 |
|---|---|---|
| `expedition_ended` | `endExpedition`/`winCampaign` 정산 1회 뒤, 원정당 1회 | 아래 |
| `retry_selected` | 결과/승리 화면 다시 출격 | `result_type` |
| `hangar_viewed` | 격납고 진입(구매 후 재렌더 제외) | `entry_point`(`title`/`result`) |
| `analytics_consent_updated` | 허용 저장 + GA4 활성 뒤 | `consent_state=granted` |

`expedition_ended` 속성: `outcome`(`death`/`quit`/`campaign_clear`), `duration_sec`, `sector_reached`, `node_progress`, `primary_weapon`, `doctrine_id`, `keystone_id`, `max_tier`, `max_cruisers`, `first_defeat_upgrade_state`(`available`/`claimed`/`already_owned`/`not_eligible`). `duration_sec`는 명시값이 없으면 원정 시작 기준 경과초로 **항상** 포함한다(원정 길이 결측 방지).

무료 개조 선택 후 결과를 다시 그려도 `expedition_ended`는 재발생하지 않는다(파사드 `expeditionEnded` 1회 가드 + `r.settled`).

---

## 4. 보내지 않는 데이터(정제)

- **직접 식별**: name·email·phone·address·user_id·account_id·callsign
- **고카디널리티·개발 내부**: run_id·seed·전체 URL/referrer/query·cookie·`damageByWeapon`/`damageByResonance`·선택 시각 배열·FPS 원시 배열·스택 트레이스
- **값 정제**: 객체·배열 거부 / 비유한 숫자 거부 / enum 밖 값 거부 / 문자열 40자 초과 거부 / `null`·`undefined`·빈 문자열 제거 / 정수 범위 클램프

정제로 제거된 속성은 디버그 로그에도 **값 없이 키·이유만** 남는다.

---

## 5. 개발 모드 제외

URL(`coreLoopTest`·`coreLoopMeasure`·`campaign25`·`bosslab`) 또는 런 플래그(`devDirect`·`coreLoop`·`campaign25`)면 GA4 전송 0. 로컬 디버그 로그에는 `blocked_reason: dev_mode`, `sent: false`로 남는다.

---

## 6. 디버그

- 일반 공개 진입 URL에 `?analyticsDebug=1` → `window.__NFAnalytics`(읽기 전용 로그, 최대 500) + GA4 이벤트에 `debug_mode:true`.
- 개발 URL 자체는 GA4 제외이므로, DebugView 검증은 **공개 URL + `analyticsDebug=1`**로 한다.
- `window.__NFAnalytics`는 GA client id·쿠키·전체 URL을 담지 않는다.

---

## 7. 자동 테스트

- `tests/analytics.test.mjs` — 코어(화이트리스트·정제·PII·once·디버그 상한)
- `tests/analytics-consent.test.mjs` — 동의(unknown/granted/denied·철회·초기화 분리·storage 실패·**setItem/getItem 실패 시 메모리 폴백 전환**)
- `tests/analytics-ga4.test.mjs` — GA4 어댑터(스크립트 1회·consent 기본 denied→granted·send_page_view false·Signals/광고개인화 off·debug_mode·user_id 없음·dev 0·예외 안전·**실제 gtag 없어도 shim 성공·grant로 denied→granted / 철회→재허용 재개**)
- `tests/analytics-wiring.test.mjs` — 파사드(이벤트 이름·속성·원정 단위 중복 방지·run_index=2·dev 파이프라인 0·**pointer/touch/keyboard confirm 전달·milestone elapsed_sec·expedition_ended duration_sec 기본값**)
- `tests/consent-ui-listeners.test.mjs` — 동의 배너·모달 반복 표시 시 확정 클릭 리스너 중복 없음(실제 `ui.js` + 최소 fake DOM)
