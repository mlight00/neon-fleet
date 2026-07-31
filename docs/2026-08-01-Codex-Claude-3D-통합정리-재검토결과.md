# Claude 3D 통합 정리 재검토 결과

- 검토일: 2026-08-01
- 대상 브랜치: `claude/neon-fleet-analytics-stage1`
- 대상 HEAD: `d91ffcc`
- 검토 범위: 2026-07-31 Codex 종합 검토 반영 여부, 자동 회귀, CrazyGames 빌드, 실제 Chrome 실행
- 원칙: 게임 소스·Git 커밋·배포 상태는 바꾸지 않고 읽기·실행 검증만 했다.

## 1. 결론

**지난 검토에 대한 통합 정리 작업은 대체로 합격이다. 그러나 “출시 준비 완료”는 아니다.**

해결된 항목은 다음과 같다.

- 105개 이상으로 흩어졌던 변경을 8개 로컬 커밋으로 분류했고 검토 시작 시 작업 트리가 clean이었다.
- 게임 객체의 `_in3d` 필드를 `WeakMap` sidecar로 교체했다.
- B4와 소품 활성 수가 진단 정보에 추가됐다.
- 보기 좋지 않았던 탄환·픽업 3D가 화면상 기본 OFF로 바뀌었다.
- 구 완료보고서를 작업 일지로 격하하고 현재 상태만 담은 통합보고서를 만들었다.
- legacy 장면에는 최신 hero가 아니라는 경고가 실제로 표시된다.

다만 최신 hero 전용 결정 검증 장면은 아직 없고, 실제 모바일과 전체 CrazyGames 시나리오 QA도 남아 있다. 따라서 지금 상태는 **안전한 로컬 체크포인트 + 출시 전 후보**다.

## 2. 독립 재검증

| 항목 | 결과 |
|---|---|
| Git 작업 트리 | 검토 시작 시 clean(이후 본 검토 문서만 추가) |
| origin/master 대비 | 로컬 8커밋 ahead |
| 전체 자동 테스트 | **850/850 PASS** |
| `git diff --check` | PASS |
| CrazyGames 빌드 | PASS |
| 빌드 파일 수 | **217 / 1,500** |
| 압축 전 크기 | **45.53MB / 50MB** |
| ZIP | **44.19MB** |
| 기본 공개 경로 | HTTP 200, 오류 0, `#game3d` 없음 |
| 최신 hero 경로 | 전투·220% 전환 정상, 오류 0 |
| legacy 경고 | 실제 화면 첫 줄에 정상 표시 |
| CrazyGames dist | 영어 무기 선택→전투→220% 전환 정상, 콘솔 error 0, request failure 0 |

CrazyGames dist의 기본 hero 진단값은 programs 6, geometries 33, textures 28이며 완료보고서와 일치했다.

## 3. 발견사항

### P1 — 통합 정리는 끝났지만 출시 필수 검증은 끝나지 않았다

통합보고서도 정직하게 다음 항목을 미완료로 남겼다.

1. 최신 AURORA+B1+B2+B4용 결정 검증 장면
2. 중급 Android 실제 기기 10분 QA
3. CrazyGames dist의 B1/B2/B4, 사망, 재도전 전체 흐름
4. B1 다수전 크기와 소품 ON/OFF 가독성 A/B
5. AURORA 반응로 크기와 상판 무늬 조정 여부

이번 Codex 검증으로 CrazyGames dist의 **부팅·영문화·전투 진입·220% 전환·기본 자산 요청**은 통과했다. 하지만 사망·재도전과 각 3D 적 출현까지 확인한 것은 아니므로 전체 dist QA를 완료 처리하면 안 된다.

### P2 — 소품 3D “기본 OFF”는 표시만 OFF이고 자원은 계속 생성된다

`chase3dProps=1`이 없으면 main이 탄환·픽업을 수집하지 않으므로 화면은 2D로 돌아온다. 하지만 `createHero3D()`는 플래그와 무관하게 8종 소품 `InstancedMesh`, 지오메트리, 공용 재질을 모두 만든다.

실제 Chrome 비교:

| 구성 | programs | geometries | textures | 소품 활성 수 |
|---|---:|---:|---:|---|
| 소품 OFF | 6 | 33 | 28 | 전부 0 |
| 소품 ON | 6 | 33 | 28 | pbullet 13, pod 1 관측 |

즉 OFF는 draw/triangle은 줄이지만 생성·프리웜·메모리 비용은 그대로다.

권장:

- `createChase3D(canvas, { hero, propsEnabled })`처럼 플래그를 렌더러에 전달한다.
- `propsEnabled=false`면 소품 지오메트리와 재질을 만들지 않는다.
- OFF일 때 `propCounts:null`, geometries가 8개가량 감소하는 회귀 테스트와 브라우저 계측을 추가한다.

### P2 — 플래그 없는 공개 기본 경로에도 일부 3D 코드가 로드된다

통합보고서는 기본 URL에서 “three/모델 미로드”라고 적었다. Three.js와 hero 렌더러가 로드되지 않는 것은 맞지만, 실제 기본 URL은 다음 모듈을 읽었다.

- `chase3d-config.js`: 3,475 bytes
- `chase3d-props.js`: 4,513 bytes
- `chase3d-aurora-geometry.js`: 30,881 bytes

원인은 `main.js`가 소품 상수를 정적 import하고, `chase3d-props.js`가 geometry 병합 함수를 AURORA geometry에서 가져오기 때문이다. 약 38.9KB의 3D 코드가 플래그 없이도 해석된다. 큰 성능 문제는 아니지만 “3D 완전 미로드” 계약과는 다르다.

권장:

- `PROP_KEYS`, `PROP_CAPS` 같은 순수 상수를 작은 별도 모듈로 분리한다.
- 소품 지오메트리 모듈은 `chase3dProps=1`에서만 동적으로 불러온다.
- 기본 URL의 resource entry에 `chase3d-aurora-*`, `chase3d-props.js`, `three.module.js`가 0개인지 브라우저 테스트한다.

### P2 — 최신 커밋 메시지와 실제 diff 범위가 다르다

`d91ffcc` 메시지는 소품 게이트, WeakMap sidecar, 진단 확장을 모두 이 커밋의 변경처럼 설명한다. 실제 diff는 통합보고서와 `main.js`의 legacy 경고·진단 훅 2줄이다. sidecar와 소품 게이트는 `4ccc543`, B4/소품 진단은 `817cc4f`에 들어 있다.

기능에는 문제가 없지만 나중에 `git show d91ffcc`만 보고 원인을 추적하면 혼동된다. 후속부터는 커밋 메시지가 그 커밋의 실제 diff만 설명하도록 맞추는 것이 좋다.

### P3 — scratch 파일은 무시됐지만 삭제·이동되지는 않았다

루트의 `scratch_*.mjs` 네 개는 `.gitignore`에 들어가 Git 오염 위험은 사라졌다. 다만 “정리”를 삭제 또는 QA 도구 폴더 이동으로 해석하면 아직 남아 있다. 재사용하지 않는다면 별도 정리해도 된다.

## 4. 시각 판단

- 소품 기본 OFF 결정은 옳다. 2D 크리스탈·수송함·탄환이 정보 전달 면에서 더 명확하다.
- AURORA는 보존할 가치가 있지만 원형 반응로가 여전히 선체의 첫 인상을 과도하게 지배한다.
- B1 다수전과 B2/B4 실전 크기는 이번 정리 작업에서 바뀌지 않았다. 신규 모델 추가보다 동일 seed 비교 화면으로 가독성을 먼저 판단해야 한다.

## 5. 다음 권장 순서

1. 소품 OFF를 GPU 자원 OFF까지 연결하고 기본 URL의 불필요한 3D 정적 import를 제거한다.
2. `chase3dHeroTest=1`을 만들고 legacy는 별도 이름으로 분리한다.
3. CrazyGames dist 전체 흐름과 실제 Android 10분 QA를 수행한다.
4. B1 크기 두 안과 AURORA 반응로 두 안을 동일 seed로 비교한다.
5. 위 항목을 통과하기 전에는 신규 3D 모델을 추가하지 않는다.

## 6. 최종 판정표

| 판정 대상 | 결과 |
|---|---|
| 지난 Codex 검토 반영 작업 | **조건부 합격** |
| Git 체크포인트 안전성 | **합격** |
| 자동 회귀·빌드 | **합격** |
| CrazyGames 기본 런타임 | **기본 흐름 합격** |
| 실제 모바일·전체 포털 흐름 | **미완료** |
| 공개 기본 URL 3D 완전 격리 | **부분 미달** |
| 출시·기본 URL 3D 활성화 | **보류** |
