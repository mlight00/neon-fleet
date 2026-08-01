# Claude 3D 자원 격리 수정 재검토 결과

- 검토일: 2026-08-01
- 검토 대상: `59bc607`, `992749a`
- 검토 브랜치: `claude/neon-fleet-analytics-stage1`
- 판정: **수정 합격 — 새 코드 결함 없음**

## 1. 결론

직전 Codex 검토에서 지적한 두 가지 P2 문제는 모두 해결됐다.

1. `chase3dProps`가 OFF일 때 소품을 화면에서만 숨기던 문제
   - 이제 소품용 geometry, material, `InstancedMesh`, `instanceColor`를 만들지 않는다.
   - 실제 Chrome 계측에서 OFF는 `programs 5 / geometries 25 / propCounts null`, ON은 `programs 6 / geometries 33 / propCounts 활성`으로 분리됐다.

2. 기본 URL에서도 3D geometry 모듈이 정적으로 따라오던 문제
   - 상수만 담은 `chase3d-prop-defs.js`로 의존성을 분리했다.
   - 기본 URL에서는 `chase3d-config.js`와 작은 상수 파일만 로드되고, Three.js·renderer·models·props factory·AURORA geometry는 로드되지 않았다.

따라서 이번 변경에는 추가 수정 작업지시서를 만들 만한 코드 결함이 없다. 같은 부분을 더 손보는 것보다 실제 기기와 플레이 장면 검증으로 넘어가는 편이 낫다.

## 2. 코드 검토

### 합격한 구현

- `createChase3D(canvas, opts)`가 `propsEnabled`를 hero renderer까지 전달한다.
- `createHero3D(canvas, opts = {})`가 소품 GPU 자원 생성 자체를 조건문으로 차단한다.
- 상수 정의와 무거운 geometry factory를 분리해 기본 URL의 정적 import 체인을 끊었다.
- OFF 상태의 `info().propCounts`는 `null`이라서 “기능 비활성”과 “활성이나 개수 0”을 구분할 수 있다.
- `chase3dProps=1`은 `chase3d=1`이 함께 있을 때만 활성화된다.
- 새 커밋 메시지는 실제 변경 범위와 일치한다.

### 경미한 기록상 주의

이전 Codex 재검토 문서의 `217개 파일`은 새 `chase3d-prop-defs.js`가 추가되기 전 수치다. 현재 새로 빌드한 배포본은 **218개 파일**이다. 이는 제품 결함이 아니라 시점이 다른 기록이다.

## 3. 자동 검증

| 항목 | 결과 |
|---|---:|
| Node 자동 테스트 | **850 / 850 PASS** |
| `git diff --check` | **PASS** |
| CrazyGames Basic 빌드 | **PASS** |
| 배포 파일 수 | **218 / 1,500** |
| 압축 전 크기 | **45.54MB / 50MB** |
| ZIP 크기 | **44.19MB** |
| Git 상태(검토 문서 작성 전) | **clean** |
| `origin/master` 대비 | **로컬 10커밋 ahead** |

## 4. 실제 Chrome 재현 결과

390×844 headless Chrome에서 소스와 방금 만든 CrazyGames 배포본을 확인했다.

| 경로 | 핵심 결과 | 오류 |
|---|---|---:|
| 기본 URL | Three.js·renderer·models·AURORA geometry 미로드 | 0 |
| `?chase3d=1` | 220%, hero 렌더, `5 programs / 25 geometries / propCounts null` | 0 |
| `?chase3d=1&chase3dProps=1` | `6 programs / 33 geometries / propCounts 활성` | 0 |
| `dist/crazygames-basic/?distribution=crazygames&chase3d=1` | 220%, hero 렌더, OFF 자원 수 동일 | 0 |

배포본에서도 console error, page error, request failure가 발생하지 않았다.

## 5. 아직 남은 것은 코드 결함이 아니라 출시 전 검증

이번 수정과 무관하게 통합 상태보고서에 남겨 둔 다음 항목은 아직 필요하다.

1. `chase3dHeroTest=1` 최신 hero 결정 장면과 legacy 명칭 분리
2. 중급 Android 실기기 10분 플레이 및 FPS·발열·입력 지연 확인
3. CrazyGames 배포본의 B1/B2/B4 등장, 사망·재시도까지 전체 흐름 확인
4. AURORA와 B1 3D의 실제 가독성 A/B 판정

이 중 우선순위는 **실제 Android 플레이 → 배포본 전체 흐름 → hero 비교 장면** 순서가 적절하다. 새 3D 모델을 더 추가하는 일은 가독성 판정 뒤로 미룬다.

## 6. 최종 판정

**이번 Claude 수정은 승인한다.** 직전 두 P2는 코드와 실제 브라우저 양쪽에서 해결됐고, 새 회귀는 발견되지 않았다. 다음 작업은 추가 리팩터링이 아니라 실제 플레이 QA다.
