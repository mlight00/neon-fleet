# NEON FLEET Stage 1 — GA4 관리자 설정 안내서

- 대상: 프로젝트 소유자(측정 ID를 결정·입력하는 사람)
- 전제: 코드는 완성됨. 아래는 **소유자 입력이 필요한 부분**과 GA4 콘솔 설정이다.

> ⚠️ **회사(메디컬에스테틱코리아) GA4 속성·GTM 컨테이너·서비스 계정을 절대 재사용하지 않는다.** NEON FLEET 전용 속성을 새로 만든다. 측정 ID 자체는 비밀이 아니지만 *어떤 속성을 쓸지*는 소유자의 결정이므로 Claude가 임의 선택하지 않았다.

---

## 1. 속성·데이터 스트림 만들기

1. Google Analytics → 관리 → **속성 만들기** → 이름 `NEON FLEET`(회사 운영 사이트 속성과 분리).
2. 데이터 스트림 → **웹** → URL `https://mlight00.github.io/neon-fleet/`.
3. 생성된 **측정 ID `G-XXXXXXXXXX`**를 복사.

## 2. 측정 ID 입력(코드)

`js/analytics-config.js`의 `ANALYTICS_CONFIG`를 수정한다.

```js
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: true,                 // false → true
  provider: 'ga4',
  measurementId: 'G-XXXXXXXXXX', // 실제 측정 ID
  schemaVersion: '1',
  debugQuery: 'analyticsDebug',
});
```

- `enabled:false` 또는 `measurementId:''`면 동의 UI가 뜨지 않고 네트워크 0(현재 기본값 = 안전).
- 형식이 `G-`로 시작하지 않으면 스크립트를 로드하지 않는다.

## 3. 권장 GA4 설정

- **데이터 보관**: 14개월 검토(관리 → 데이터 설정 → 데이터 보관).
- **Google 신호(Signals)**: **사용 안 함**(광고·인구통계 목적 아님).
- **Google Ads 연결**: 하지 않음.
- **광고 개인화**: 사용 안 함(코드가 `allow_ad_personalization_signals:false`로 이미 전송).
- **자동 page_view**: 코드가 `send_page_view:false`이므로, 향상된 측정(Enhanced measurement)에서 게임에 불필요한 항목(스크롤·이탈 클릭·사이트 검색 등)을 검토·정리.
- **IP 익명화**: GA4는 IP를 저장하지 않으므로 별도 설정 불필요.

## 4. 맞춤 정의(Custom definitions)

모든 속성을 등록하지 말고, **보고서에서 분류·합계가 필요한 값만** 등록한다.

### 이벤트 범위 측정기준(dimension) 후보
`player_type`, `viewport_group`, `game_mode`, `outcome`, `choice_type`, `choice_id`, `node_type`, `primary_weapon`, `doctrine_id`, `keystone_id`, `milestone_type`, `selection_method`, `first_defeat_upgrade_state`, `guide_type`, `completion_method`, `upgrade_key`, `result_type`, `entry_point`

### 측정항목(metric) 후보
`run_index_session`, `time_to_combat_sec`, `duration_sec`, `sector_reached`, `max_tier`, `max_cruisers`, `node_progress`, `panel_reached`, `milestone_value`, `elapsed_sec`

## 5. 파생 이벤트(Modify/Create event)

### 5.1 두 번째 출격 — Stage 1 핵심 지표
- 조건: `event_name = expedition_started` **AND** `run_index_session = 2`
- 새 이벤트명: `second_expedition_started`

### 5.2 캠페인 완주
- 조건: `event_name = expedition_ended` **AND** `outcome = campaign_clear`
- 새 이벤트명: `campaign_cleared`

## 6. DebugView 검증(측정 ID 입력 후)

1. **일반 공개 진입 URL**에 `?analyticsDebug=1`을 붙여 접속(개발 URL 사용 금지).
   - 예: `https://mlight00.github.io/neon-fleet/?analyticsDebug=1`
2. 동의 배너에서 **익명 데이터 허용**.
3. GA4 → DebugView에서 순서 확인:
   `analytics_consent_updated → expedition_start_selected → expedition_started → sector_started → guide_viewed/completed → route_selected → combat_started → … → expedition_ended → free_upgrade_selected → retry_selected → expedition_started(run_index_session=2)`
4. 파라미터가 반영되기까지 수십 초 지연될 수 있다.
5. 개발 URL(`?coreLoopTest=1` 등)에서는 이벤트가 **하나도** 보이면 안 된다(정상).

## 7. 탐색 보고서 예시(제안)

- **온보딩 퍼널(자유형 퍼널)**: `title_viewed → expedition_start_selected → expedition_started → combat_started`. 이탈 지점 = 첫 마찰.
- **재출격율**: `second_expedition_started` 사용자 수 ÷ `expedition_started`(run 1) 사용자 수.
- **사망 분포(표)**: 차원 `sector_reached`·`outcome`, 측정항목 이벤트 수 → 어느 섹터에서 죽는가.
- **빌드 분포(표)**: 차원 `choice_type`·`choice_id` → 무엇을 고르는가.
- **모바일 대비**: 위 퍼널을 `viewport_group`으로 분할.
- **무료 개조 효과**: `free_upgrade_selected` 사용자 중 이후 `retry_selected` 비율.

## 8. UTM 테스트 링크(15명)

표준 UTM만 사용한다(개인 식별 금지).

```
https://mlight00.github.io/neon-fleet/?utm_source=direct_invite&utm_medium=playtest&utm_campaign=stage1_alpha&utm_content=cohort_a
```

- 전부 소문자, 참여자 이름·이메일을 UTM에 넣지 않음.
- 집단만 구분: `cohort_a`, `cohort_b`. 개인별 추적 링크 금지.
- URL 쿼리를 커스텀 이벤트 속성으로 복제하지 않는다(GA4 기본 유입 보고서가 처리).
- `analyticsDebug`는 테스트 링크에 넣지 않는다(디버그 트래픽 혼입 방지).
