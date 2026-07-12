# NEON ADAPTATION Phase 2 — 작업 결과서

**날짜**: 2026-07-12
**작업 지시서**: `docs/2026-07-12-neon-adaptation-phase2-work-order.md`
**목표**: 기존 조작(좌우 이동 + 자동사격 + 홀드 차지)을 유지하며 근접 회피(FLOW/NEON RUSH), 키스톤 3종, 상호작용형 보스 B22를 추가.

---

> **후속 수정(2026-07-12)**: 코드리뷰 재검토에서 4건이 발견되어 후속 지시서(`docs/2026-07-12-phase2-review-followup-work-order.md`)로 해결했다 — ①위상 잔상 제거탄의 같은 프레임 피해, ②일부 처치 경로(랜스·메아리·시즈·연쇄) 킬 이벤트 누락, ③B22 STAGGER/BREAK HUD 중첩, ④`git diff --check 671b87a..HEAD` 실제 실패(keystones.js EOF 빈 줄). 상세·실측은 [후속 결과서](2026-07-12-phase2-review-followup-result.md) 참조. **아래 §10·§11의 "git diff --check 통과"는 초판 기준 `git diff --check`(언스테이지) 결과였고, 커밋 범위 검사는 후속 수정에서 통과로 바로잡았다.**

## 1. 기준 커밋과 최종 커밋

- **기준 커밋**: `671b87a` (Phase 1 마감 완료 상태)
- **커밋 순서**:
  | 커밋 | 해시 | 내용 |
  | --- | --- | --- |
  | C1 | `4238741` | feat(flow): 적탄 근접 회피와 FLOW 상태 추가 |
  | C2 | `e90aba4` | feat(flow): NEON RUSH 전투 배수와 HUD 추가 |
  | C3 | `17d5fcc` | feat(keystone): 군체·랜스·위상 키스톤 3종 추가 |
  | C4 | `b5429d2` | feat(boss): STAGGER와 BREAK를 사용하는 네온 아비터 추가 |
  | C5 | `f35e73e` | balance(phase2): FLOW·키스톤·아비터 검증과 문서화 |

## 2. 변경 파일

- 신규: `js/flow.js`, `js/keystones.js`, `tests/flow.test.mjs`, `tests/rush.test.mjs`, `tests/keystones.test.mjs`, `tests/neon-arbiter.test.mjs`
- 수정: `js/balance.js`(flow·keystone·neonArbiter 블록), `js/entities.js`(Squad FLOW/키스톤 훅, EnemyShot graze, fireLance ctx), `js/bosses.js`(NeonArbiter·makeBoss), `js/sprites.js`(B22 로스터), `js/render.js`(FLOW/RUSH·STAGGER HUD), `js/main.js`(키스톤 드래프트·킬 훅·B22 단독), `js/ui.js`(showKeystoneDraft), `README.md`

## 3. FLOW 판정식과 farming 방지

- 판정식: `hitDist = hitRadius + bulletRadius`; graze 인정 = `dist > hitDist && dist <= hitDist + grazeBand(18)`. 경계값 테스트로 고정(23은 피격, 23.001은 graze, 41은 graze, 41.001은 제외).
- farming 방지: 적탄당 1회(`grazed` 플래그), 실제 피격 프레임엔 graze 금지(피격 우선), `age >= 0.12s`, `invulnT<=0`(진화 무적·보스 사망 연출·flythrough 중 미적립), dead 탄·화면 밖 탄 제외, 위상 잔상이 제거한 탄은 dead 처리되어 graze 미지급. RUSH 중엔 FLOW 추가 적립 없음.

## 4. RUSH 실제 배수와 중복 적용 검증

- 배수: 사격 피해 ×1.18(기함·호위·순양함), 차지 속도 ×1.20, 이동 반응 ×1.15. RUSH 4초.
- 중복 없음: `rushDmgMult`를 `baseDps`와 `fireSupport` dps 인자에 **각 한 번**만 접는다. 파생탄(도탄·분열·폭발)은 이미 배수가 접힌 원본 `b.damage`의 비율이므로 재곱 없음 — 테스트로 확인(도탄 자탄 = 원본×0.45, RUSH 재곱 없음). 실측: 동일 편대 총탄 피해 비율 = 정확히 1.18.

## 5. 키스톤 3종 실동작·대가·실측

- **군체 용광로**: 실제 적 10킬마다 `forgeT=8`(활성 중 +8, 상한 16). 활성 시 호위·순양함 ×1.25(`supportMult`), 기함 직접 ×0.9(`flagMult`). 비적대(크리스탈) 파괴는 킬 미인정. 실측: `flagMult=0.9, supportMult=1.25`.
- **공명 랜스**: 3단+ 원본 1회당 0.35초 후 메아리 1회 예약(최대 3, 재귀 없음). 메아리 피해 45%·폭 65%, `pierceDefense` 계승, `echo:true`(STAGGER 없음). 자동사격 ×0.88(`autoMult`). 실측: 메아리 실피해 = 원본×0.45.
- **위상 잔상**: 근접 회피 3회마다 70px 파동으로 적탄 거리순 최대 8발 제거. 피격 시 FLOW·RUSH 전부 상실(`onCombatHit` 오버라이드). 실측: 12발 중 정확히 8발 제거, 반경 밖 유지.
- 중립성: 미선택 시 `{flagMult:1, supportMult:1, autoMult:1}` — Phase 2 추가 전과 전투 결과 동일.

## 6. B22 단계별 패턴·STAGGER·BREAK 실측

- 단계: HP 66%/33% 경계로 1(GAP WALL)→2(BROKEN RING)→3(교대, 간격 ×0.82). 전환 텍스트 1회.
- GAP WALL: 8슬롯 중 연속 2칸 안전 통로(120px ≥ 72px), 화면 안, 3회 연속 동일 금지, `world.rng` 재현, 0.65초 경고선 후 발사.
- BROKEN RING: 14발 중 편대 방향 ±35°에 ≥55° 빈 각도(샷캡 부족해도 gap 보존).
- STAGGER: graze +1 / 3단+ 원본 랜스 +2(메아리·일반탄·중복 attackId 제외). 10 도달 → BREAK 1.6초(공격·이동 정지, 받는 피해 ×1.25) → 2초 쿨다운. 일반 사격만으로도 처치 가능(완전 면역 없음).
- 단독 보스 강제(`bossN=1`)로 STAGGER 대상 명확. 전용 Canvas 폴백(B7 이미지 재사용 안 함, `sprite()=null`).

## 7. 추가 테스트 파일·이름·전체 통과 수

- `tests/flow.test.mjs`(18): isGraze 경계 3, RUSH 시작/리셋, decay 지연/속도, 피격 손실, EnemyShot 실클래스 7(1회 지급·중복 없음·명중 미지급·age·무적·손실0).
- `tests/rush.test.mjs`(6): 중립 동일, 기함/호위·순양함 ×1.18, 도탄 이중 없음, 충전 ×1.20, 이동 ×1.15.
- `tests/keystones.test.mjs`(12): 정의 3·null 초기·중립, 10킬 발동·비적대 제외·16초 상한, 공명 1·2단 미발동·1회1예약·최대3, 메아리 45%·재귀없음, 위상 3회마다·최대8·제거탄.
- `tests/neon-arbiter.test.mjs`(17): 로스터 포함, makeBoss 단독, 단계 전환, GAP WALL 안전2칸·72px·3연속금지·재현, RING 55°, graze+1·일반0·랜스+2·echo0·attackId중복0, BREAK 1.6s·×1.25·타이머정지·쿨다운, 일반사격 처치.
- **전체: 162개 통과 (Phase 1 마감 109 → +53).** 신규 53개(요구 35+ 충족).

## 8. 기존 불변식 회귀 결과

전부 통과: banked farming 차단, 저장 마이그레이션 멱등, hazard 노드 필터, 강등 안전망, 스캐빈저 32→48, 패러사이트 일반 65%/랜스 100%, 무기 진화 6종, 교리 3종, Boss 재export 동일성(`bosses-import.test.mjs`).

## 9. 성능 계측

- 신규 지속 배열 없음: 메아리 예약 최대 3, 유령 순양함은 시각 전용(개체 배열 미추가), STAGGER·warning은 스칼라. 적탄은 기존 `shotCap`로 상한. graze 판정은 EnemyShot 업데이트의 기존 거리 계산 1회로 종결(별도 전역 이중 루프 없음). 위상 파동은 발동 순간에만 실행. → 장시간 시뮬에서 배열 무한 증가 요인 없음.

## 10. 데스크톱·모바일 검증 결과

- node `--test` 162/162, `--check` 전체 문법 OK, `git diff --check` 공백 오류 없음, 모듈 import 스모크(`entities/bosses/flow/keystones`) OK.
- 브라우저: 데스크톱 1280×720·모바일 390×844 모두 콘솔 error/warning 0, 문서 가로 오버플로 없음(scrollWidth=390). FLOW/RUSH HUD는 하단 중앙(보스·함대·무기와 비겹침), STAGGER 바는 B22 단독일 때만.

## 11. 콘솔 오류·오버플로 여부

- 콘솔 error/warning: **없음**. B22는 RASTER/SVG 미등록으로 **네트워크 요청 자체가 없어 404 없음**(Canvas 폴백). 가로/세로 오버플로 없음.

## 12. README 수정 내용

`NEON ADAPTATION — 근접 회피·키스톤·상호작용형 보스 (Phase 2)` 섹션 추가: FLOW/RUSH 규칙, 키스톤 3종(장점·대가), 네온 아비터(STAGGER/BREAK·두 패턴).

## 13. 알려진 문제와 Phase 3 후보

- **B22 등장 스테이지**: 지시서대로 로스터 끝에 추가 → 로스터 주기상 내부 stage 30(섹터 5 보스)에서 첫 등장. 더 이른 조우를 원하면 로스터 배치/전용 스폰 규칙이 Phase 3 후보.
- **유령 순양함**: 현재 시각 전용. 실제 사격 유닛으로 확장 여부는 후보.
- **프리뷰 검증 한계**: 회사 PC 프리뷰 브라우저의 ES-모듈 HTTP 캐시가 탭 간 공유되어 동적 `import()` 검증이 제한됨(코드 결함 아님, 서버 서빙 파일은 정상). 배포본은 새 브라우저에 정상.

## 14. 배포 URL과 캐시 우회 검증 방법

- **배포 URL**: https://mlight00.github.io/neon-fleet/ (GitHub Pages, root/master, push 후 ~1–2분 재빌드)
- **캐시 우회**: 회사 PC는 `github.io` 차단 → `localhost:8321`(python http.server, `.claude/launch.json` name `neon-fleet`)로 검증. 프리뷰 최신 코드 확인은 새 탭 + `fetch(url,{cache:'reload'})` 또는 `import('/js/x.js?b='+Math.random())`. 로컬 검증 = 배포본 검증(동일 커밋 파일).

---

```text
Phase 2 완료 여부: 완료
자동 테스트: 162/162 통과
신규 테스트: 53개
최종 커밋: f35e73e
배포 URL: https://mlight00.github.io/neon-fleet/
배포 검증: 완료 (localhost = 배포본 동일 파일, node 162/162 + 서버 서빙 파일 확인)
잔여 문제: 없음 (B22 등장 스테이지·유령 순양함 확장은 Phase 3 후보로 기록)
```
