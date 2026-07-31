# NEON FLEET Stage 1 — 분석 계측 QA 결과

- 일자: 2026-07-26
- 기준 커밋: origin/master `3e178bc` / 브랜치 `claude/neon-fleet-analytics-stage1`
- 측정 ID 상태: **미제공** — 실제 GA4 네트워크·DebugView 검증은 `BLOCKED`

---

## 0. 검증 환경과 한계

- Claude 구현 뒤 Codex 인앱 브라우저로 데스크톱 `1280×720`, 모바일 `390×844`를 실제 조작했다.
- 전용 GA4 측정 ID가 없으므로 저장소 기본값(`enabled:false`, 빈 ID)은 그대로 유지했다.
- 동의 UI를 검증할 때만 저장소 밖 임시 복사본에 목 ID를 넣고 Google 스크립트 주소를 **로컬 스텁**으로 바꿨다. 외부 Google 전송은 발생시키지 않았다.
- 실제 GA4 네트워크·DebugView 확인만 측정 ID 미제공으로 `BLOCKED`다.

---

## 1. 자동 테스트

```
node --test tests/*.test.mjs
→ tests 581, pass 581, fail 0
   (기존 512 + Stage 1 신규 69: analytics/consent/ga4/wiring + 동의 UI 리스너)
```

## 2. 시뮬레이션 QA (실제 모듈 + fake DOM)

실행: `node docs/qa/stage1-analytics-20260726/qa-sim.mjs` → **19/19 PASS**

| 시나리오 | 검증 내용 | 결과 |
|---|---|---|
| A 설정 비활성 | `shouldOfferConsent=false` → 동의 UI 미표시 | PASS |
| B 미결정(unknown) | 스크립트 0 · gtag 이벤트 0 · 소급 전송 없음 | PASS |
| C 허용 | 스크립트 정확히 1 · 파사드 이벤트 = 실제 전송 · `combat_started` 1회 · `expedition_ended` 1회(재렌더 무시, `duration_sec` 포함) · 2회차 `run_index_session=2` · `route_selected` `auto_root`+`pointer_confirm` · `progression_milestone_reached` `elapsed_sec` 포함 · `analytics_consent_updated` 선행 | PASS |
| D 거부 | 네트워크 0 | PASS |
| E 철회 | 철회 후 이벤트 0 · '재로드'(새 어댑터·denied) 스크립트 0·전송 0 | PASS |
| F 개발 모드 | dev 게이트 → 스크립트 0·전송 0(전체 시퀀스) | PASS |
| G 실패 환경 | gtag throw / storage throw에도 예외 전파 없음 | PASS |
| PII 스캔 | 정제 이벤트 속성에 이메일·쿠키·client_id·전화·URL·user_id 패턴 0 | PASS |

증거 파일:
- `event-sequence-sanitized.json` — 시나리오 C의 정제 이벤트 순서(21개, 값은 enum·정수·짧은 id뿐).
- `network-summary-sanitized.json` — 시나리오별 요청 도메인·이벤트명·속성 키·응답 상태·중복 여부(HAR 원본 미저장).
- `qa-sim.mjs` — 재현 가능한 하네스(자기검증 포함).

## 3. 실제 브라우저 시나리오(§21)

| 작업지시서 시나리오 | 실제 브라우저 결과 |
|---|---|
| A 설정 비활성 | 기본 저장소 설정에서 동의 UI 0, 분석 스크립트 0, 콘솔 오류 0 — PASS |
| B 미결정 | 배너 표시, 분석 스크립트 0, 타이틀 시작 버튼 1개 유지 — PASS |
| C 허용 | 로컬 스텁 스크립트 정확히 1개, 설정 상태 `허용됨`, 재허용에도 중복 스크립트 0 — PASS |
| D 거부 | 배너·모달 닫힘, 새로고침 뒤 분석 스크립트 0, 설정 상태 `거부됨` — PASS |
| E 철회·재허용 | 같은 페이지에서 `거부됨 → 허용됨` 전환, 스크립트는 계속 1개. 이후 전송 중단·재개 계약은 자동 테스트 58·59와 시뮬 E로 함께 검증 — PASS |
| F 개발 모드 | `coreLoopTest`, `coreLoopMeasure`, `campaign25`, `campaign25&play`, `bosslab` 5개 주소 모두 분석 스크립트 0·콘솔 오류 0 — PASS |
| G 실패 환경 | 분석 스크립트 404를 실제 발생시켜도 타이틀·시작 버튼 정상, 콘솔 JS 오류 0. 저장 실패는 테스트 21·21b·21c로 검증 — PASS |

모바일 `390×844`에서도 미결정 배너가 타이틀 버튼을 가리지 않았고, 실제 `출격하기` 클릭이 시작 무기 선택 화면까지 도달했다.

증거:

- `browser-qa-summary.json`
- `desktop-consent-unknown-1280x720.png`
- `desktop-consent-details-1280x720.png`
- `mobile-consent-unknown-390x844.png`

## 4. 네트워크·개인정보

- **동의 전**: 브라우저에서 분석 스크립트 0, 시뮬 B/D에서 gtag 이벤트 0.
- **동의 뒤**: 로컬 브라우저 스텁 스크립트 1회, 자동 테스트·시뮬레이션에서 이벤트 중복 없음과 허용 속성만 확인.
- **HAR 원본**: 저장하지 않음(GA client id·쿠키 유출 방지). 정제 요약만 보관.

## 5. 남은 실제 검증(소유자 환경)

전용 측정 ID 입력 후 공개 URL + `?analyticsDebug=1`에서 실제 GA4 DebugView 순서를 확인해야 한다. 데스크톱·모바일 비차단과 개발 URL 차단 검증은 완료됐다.
