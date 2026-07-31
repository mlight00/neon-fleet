# Claude Opus 5 작업지시서
## Three.js + WebGL2 방식의 AURORA 실제 3D 재구현과 품질 검증

작성일: 2026-07-30  
대상 저장소: `E:\workspace\claude\neon-fleet-worktrees\stage1-analytics`  
작업 성격: 실패한 Phase 0의 3D 미술을 교체하는 **품질 수직 시제품**  
배포: 금지  

---

## 0. 이 문서를 Claude가 읽는 즉시 지켜야 할 원칙

이 작업은 “Three.js 기본 도형을 더 많이 붙이는 작업”이 아니다.

현재 `js/chase3d-models.js`의 AURORA, B1, B4, B8은 기술적으로는 3D이지만 시각적으로는 임시 도형 조립물이다. 사용자는 이 결과를 명확하게 거부했다. 이번 작업의 목적은 모델 수를 늘리는 것이 아니라 **AURORA 한 척이 원본 2D 기함의 정체성, 소유감, 함미 추적 시점의 위압감을 실제로 전달하는지 증명하는 것**이다.

다음 원칙은 예외가 없다.

1. 기본 공개 URL과 CrazyGames 빌드에는 이번 기능을 켜지 않는다.
2. 기존 2D 게임 로직·충돌·스폰·보상·밸런스는 단일 진실로 유지한다.
3. Three.js는 시각 표현만 담당한다.
4. 이번 작업에서는 AURORA 한 척만 최종 품질로 만든다.
5. B1/B4/B8 등 다른 모델을 새로 만드는 것은 사용자 승인 전 금지한다.
6. `BoxGeometry`, `CylinderGeometry`, `ConeGeometry`를 눈에 보이는 주 선체로 조립한 결과는 완료로 인정하지 않는다.
7. 렌더링 화면을 직접 캡처해 원본과 비교하지 않은 완료 보고는 인정하지 않는다.
8. commit, push, merge, GitHub Pages 배포, CrazyGames 업로드를 하지 않는다.

---

## 1. 참고 사례를 먼저 정확히 이해하라

### 1.1 사용자가 본 영상

- 영상: <https://youtu.be/q0QAjZiP1Ok>
- 영상에서 소개한 대표 사례: <https://github.com/mshumer/Claude-of-Duty>

이 사례의 핵심은 단순히 Three.js를 사용했다는 것이 아니다.

- Three.js r180 + WebGL2
- 약 55,000줄, 11개 하위 시스템
- 코드에서 메시·텍스처·애니메이션·사운드를 절차적으로 생성
- PBR 재질, 절차적 노멀/거칠기, 조명, 후처리, 이펙트
- 재현 가능한 캡처, 이미지 차이 검사, 실제 플레이 프로파일링
- 셰이더 사전 컴파일
- 가혹한 시각 비평과 반복 보정

반드시 아래 파일을 읽고 방식만 참고하라.

- `README.md`
- `ARCHITECTURE.md`
- `prompt.md`
- `src/weapons/geometry.js`
- `src/weapons/parts.js`
- `src/weapons/materials.js`
- `src/materials/generator.js`
- `src/materials/shader.js`
- `tools/capture.mjs`
- `tools/baseline.mjs`
- `tools/imagediff.mjs`
- `tools/profile.mjs`

참고 저장소는 임시 폴더에 읽기 전용으로 clone해도 된다. Neon Fleet 저장소 안에 복사하지 말고, 코드를 통째로 가져오지 마라. 코드를 일부 실제로 차용한다면 MIT 고지를 보존하고 `THIRD_PARTY_NOTICES.md`에 출처를 기록하라.

### 1.2 영상의 과장을 그대로 믿지 말 것

참고 저장소 자체 평가에는 다음 한계가 적혀 있다.

- 실제 Call of Duty와의 비교 점수는 최종 5.05/10
- 대부분 화면은 여전히 “AMATEUR” 평가
- Retina 해상도 실제 플레이는 최적화 후에도 28~30fps
- 손, 캐릭터, 재질은 절차적 생성의 한계가 드러남

그러므로 대형 FPS의 렌더 파이프라인을 통째로 복제하지 마라. Neon Fleet은 화면과 대상 수가 훨씬 작다. 우리는 그 사례의 **절차적 메시, 재질 풍부도, 품질 검증 도구, 성능 측정 방식**만 작게 가져온다.

### 1.3 기술 용어 정정

브라우저에서 네이티브 OpenGL을 직접 쓰는 것이 아니다.

- Three.js의 `WebGLRenderer`
- 브라우저의 WebGL2
- GLSL 셰이더

를 사용한다. 구현·보고서에도 “OpenGL로 구현했다”라고 쓰지 말고 “Three.js + WebGL2”라고 정확히 쓴다.

---

## 2. 현재 프로젝트에서 반드시 먼저 읽을 파일

### 기존 검토와 지시

- `docs/2026-07-30-Codex-실제3D-Phase0-검토및-AI자산제작가이드.md`
- `docs/2026-07-30-Claude-실제3D-함미추적모드-Phase0-수직시제품-작업지시서.md`
- `docs/2026-07-30-Claude-실제3D-함미추적모드-Phase0-완료보고.md`
- `docs/2026-07-30-Codex-2.5D-함미추적시점-검토결과.md`

### 현재 3D 구현

- `js/chase3d-config.js`
- `js/chase3d-mapping.js`
- `js/chase3d-models.js`
- `js/chase3d-scene.js`
- `js/chase3d-renderer.js`
- `js/chase-camera.js`
- `js/chase-render.js`
- `js/main.js`

### 실제 게임 데이터

- `js/entities.js`
- `js/bosses.js`
- `js/ships.js`
- `js/balance.js`
- `js/render.js`

### 원본 미술과 비교 화면

- 원본 AURORA: `assets/art2-webp/styleC/A4.webp`
- 실패한 3D 확대: `docs/qa/chase3d-phase0/phase0-flagship-rear-detail.png`
- 실패한 3D 게임 화면: `docs/qa/chase3d-phase0/phase0-3d-220-desktop.png`
- 기존 RC2 추적 화면: `docs/qa/chase-camera-rc2/rc2-220-pursuit.png`
- 기존 RC2 모바일: `docs/qa/chase-camera-rc2/rc2-220-mobile-390x844.png`

---

## 3. 작업 시작 전 기준선

작업 전에 다음을 실행하고 실제 결과를 완료 보고서에 적는다.

1. `git status --short`
2. `node --test tests/*.test.mjs`
3. `node scripts/build-crazygames-basic.mjs`
4. `git diff --check`
5. CrazyGames 결과물의 파일 수, 압축 전 크기, ZIP 크기

이전 Codex 재검증 값은 참고만 한다.

- 테스트: 787/787 통과
- CrazyGames: 208개 파일
- 압축 전: 약 45.39MB
- ZIP: 약 44.13MB

현재 값이 다르면 현재 값을 기준선으로 삼고 이유를 기록한다. 사용자의 기존 변경사항을 되돌리거나 정리하지 마라.

---

## 4. 이번 작업의 최종 산출물

### 반드시 구현할 것

1. AURORA 전용 절차적 고품질 메시 생성기
2. AURORA 전용 절차적 PBR 재질 생성기
3. 고정 시점으로 재현 가능한 AURORA 모델 검사실
4. 게임 내 함미 추적 시점에서 AURORA만 새 모델로 표시하는 하이브리드 모드
5. 현재 3D 스냅샷의 드론 누락과 개체 오분류 수정
6. 실전 프레임 시간 측정과 셰이더 사전 준비
7. 원본·기존 실패작·신규 결과 비교 화면
8. 자동 테스트와 완료 보고서

### 이번에 하지 않을 것

- B1/B4/B8 및 전체 적 함선 재제작
- 모든 화면의 완전 3D 전환
- 게임 규칙 또는 밸런스 변경
- 외부 유료 3D 생성 서비스 호출
- Blender 설치 또는 GLB 수작업 파이프라인
- 온라인 CDN 추가
- 대형 HDRI·이미지·오디오 다운로드
- 기본 공개 모드 활성화

---

## 5. 먼저 고쳐야 하는 현재 구현의 정확성 문제

미술 작업 전에 아래 문제를 고친다.

### 5.1 실게임 드론 누락

현재 `buildSnapshot()`은 존재하지 않는 `sq.drones` 배열을 읽는다. 실제 `Squad`는 다음 구조다.

- `count`
- `_offsets`
- `width`
- `t`
- `bank`
- `tier`

실제 2D 드론 위치는 `Squad.draw()`의 계산식을 따른다.

```text
n = min(count, BAL.squad.drawCap)
ox = offset.x * squad.width
worldX = squad.x + ox
worldY = squad.y + offset.y * squad.width * 0.8
         + sin(squad.t * 3 + offset.phase) * 2
```

`BAL.squad.drawCap`과 `SHIP_DEFS[tier].clearR`까지 포함해 실제 화면에 그리는 드론과 같은 수·위치를 스냅샷에 넣어라. 게임 상태는 수정하지 않는다.

### 5.2 모든 `world.entities`를 적으로 취급하는 오류

현재는 게이트, 크리스탈, 픽업, 장애물, 미지원 개체까지 `enemies`에 들어가고 알 수 없는 종류가 B1로 바뀐다.

다음 규칙으로 고친다.

- 일반 적은 `e.isEnemy === true`인 살아 있는 개체만
- 픽업은 별도 분류
- 게이트는 별도 분류
- 장애물은 별도 분류 또는 이번 모드에서 기존 2D 유지
- 미지원 적은 B1로 위장하지 말고 `unsupported`로 표시
- 실제 Boss는 `spriteId`
- MidBoss는 `def.id`
- B8만 B8 모델로 표시
- 나머지 보스는 B8로 위장하지 말고 기존 2D 표현을 유지

### 5.3 가짜 결정성 테스트 금지

합성 `makeWorld()`와 자체 `advance()`만 돌려 “실게임 600프레임 동일”이라고 보고하지 마라.

가능하면 테스트에서 `Math.random`을 고정 시드 생성기로 바꾸고 실제 게임 초기화·업데이트 경로를 두 번 실행한다.

- A: 3D frame 호출 없음
- B: 같은 입력·같은 dt로 3D frame 호출

600프레임 동안 핵심 게임 상태를 직렬화해 프레임별로 비교한다. 실제 루프 자동화가 불가능하면 그 사실을 명확히 쓰고, 최소한 실제 `Squad` 인스턴스와 실제 entity 클래스에서 `buildSnapshot()` 전후 깊은 상태 비교를 수행하라. 검증 범위를 과장하지 마라.

---

## 6. AURORA의 시각 계약

### 6.1 원본에서 반드시 보존할 정체성

| 원본 특징 | 3D에서의 필수 구현 |
|---|---|
| 뾰족한 전방과 넓게 퍼지는 델타/가오리형 외곽선 | 직접 정의한 좌우 대칭 planform과 다단 loft 선체 |
| 중앙의 긴 금색 지휘 척추 | 선체 위로 솟은 연속 곡선/베벨 메시 |
| 함미 중앙의 대형 원형 반응로 | 여러 겹의 금속 링, 밝은 코어, 방사형 세부 구조 |
| 좌우의 어두운 육각형 갑판 패널 6개 | 단순 검은 사각형이 아닌 함몰된 패널과 프레임 |
| 양쪽 대형 주익과 끝단 청록 포인트 | 실제 두께·베벨·아랫면을 가진 후퇴익 |
| 함미의 갈라진 꼬리와 추진 구조 | 후면에서 분명히 보이는 쌍발/다중 엔진과 보조 추진기 |
| 밝은 아이보리 장갑과 어두운 구조 프레임 | 재질·높이·거칠기가 다른 다층 장갑 |
| 금색, 청록색의 제한된 발광 | emissive mask로 위치를 통제한 절제된 발광 |

### 6.2 방향과 좌표

- 현재 계약을 유지해 전방은 `+Z`
- 함미 카메라는 `-Z`에서 전방을 바라봄
- 상단은 `+Y`
- 원본 이미지의 위쪽 뾰족한 부분이 `+Z`
- 좌우 대칭은 X축 기준

### 6.3 메시 제작 방식

주 선체는 `BoxGeometry` 여러 개가 아니라 아래 구조로 만든다.

1. 원본 외곽선을 수치화한 좌우 대칭 planform
2. Z 위치별 폭과 Y 위치별 높이가 달라지는 다단 cross-section
3. cross-section 사이를 연결하는 indexed `BufferGeometry`
4. 상부 장갑, 측면 장갑, 하부 선체가 서로 다른 각도와 높이를 갖는 loft
5. 정상적인 UV, vertex normal, tangent가 가능한 토폴로지
6. 날개와 꼬리도 평평한 박스가 아닌 polygon/extrude 또는 전용 loft
7. 모서리는 실제 bevel 또는 chamfer 형상
8. 반복 패널·볼트·벤트는 instancing 또는 병합된 geometry 사용

`ExtrudeGeometry`는 부품 제작에는 사용할 수 있지만, 원본 실루엣을 얇게 한 번 압출한 것만으로 완성했다고 하지 마라. 최소 상부·중앙·하부 체적이 분리된 다층 선체여야 한다.

### 6.4 기본 도형 사용 허용 범위

다음에는 기본 도형을 사용할 수 있다.

- 반응로 내부 링
- 엔진 노즐
- 작은 센서
- 작은 볼트·벤트·그리블
- 보이지 않는 충돌/디버그 도형

다음에는 사용할 수 없다.

- 주 선체
- 주익
- 대형 꼬리
- 대형 갑판 패널
- 카메라에 크게 보이는 함미 구조

### 6.5 권장 삼각형 예산

- AURORA LOD0: 18,000~45,000 triangles
- AURORA LOD1: 6,000~15,000 triangles
- AURORA LOD2: 1,500~5,000 triangles

삼각형 수를 채우기 위해 의미 없는 세분화를 하지 않는다. 실루엣, 베벨, 반응로, 함미 세부에 우선 사용한다.

---

## 7. 절차적 PBR 재질

현재처럼 단색 `MeshStandardMaterial`만 만드는 것은 금지한다.

### 7.1 필요한 맵

최소 다음을 코드에서 결정적으로 생성한다.

- albedo/base color
- normal 또는 bump
- roughness
- metalness
- ambient occlusion 또는 이에 준하는 baked cavity
- emissive mask

`CanvasTexture`, `DataTexture`, 또는 typed array 기반 생성기를 사용할 수 있다. 생성기는 고정 seed를 사용해야 하며 같은 seed에서 픽셀 해시가 같아야 한다. `Math.random()`을 직접 쓰지 마라.

### 7.2 원본 A4 이미지 사용

Neon Fleet이 보유한 `assets/art2-webp/styleC/A4.webp`는 외부 에셋이 아니므로 다음 목적으로 사용할 수 있다.

- 색상과 패널 위치의 기준
- 상부 장갑용 albedo/decal의 일부
- 자동 실루엣 비교의 정답 이미지

다만 이미지를 선체 전체에 한 장 늘려 붙여 옆면까지 왜곡시키지 마라.

- 상부 face 그룹: 원본 좌표에 맞춘 UV
- 측면 face 그룹: 별도 절차적 금속 재질
- 하부 face 그룹: 더 어둡고 구조적인 별도 재질
- 금색 척추·반응로·엔진: 별도 재질/마스크

원본 이미지 로딩에 실패해도 절차적 기본 재질로 모델이 보이고, 기능 플래그를 끄면 기존 RC2로 정상 복귀해야 한다.

### 7.3 색 관리와 조명

Three.js 버전에 맞는 정확한 API를 사용한다.

- `renderer.outputColorSpace = THREE.SRGBColorSpace`
- `renderer.toneMapping = THREE.ACESFilmicToneMapping`
- `renderer.toneMappingExposure`를 화면 캡처 기준으로 조정
- 색상 텍스처만 sRGB
- normal/roughness/metalness/AO는 non-color data
- key/fill/rim이 명확히 분리된 조명
- 함미에서 엔진과 하부 구조가 검게 뭉개지지 않도록 보조광

금속이 밝은 회색 플라스틱처럼 보이거나, 발광이 선체 형태를 삼키면 실패다.

### 7.4 후처리

후처리는 작은 효과부터 검증한다.

- 발광에 한정된 약한 bloom은 허용
- 모바일에서는 bloom을 끄거나 저품질로 전환
- 색수차, 강한 motion blur, 과도한 vignette 금지
- 후처리 없이도 모델 형태가 읽혀야 함

참고 FPS의 복잡한 TAA/GTAO/SSR 파이프라인을 이번 작업에 통째로 넣지 마라.

### 7.5 Three.js 버전

참고 프로젝트가 r180을 썼다는 이유만으로 현재 로컬 r160을 즉시 교체하지 마라. 먼저 이번 작업에 필요한 API가 현재 고정 버전에 있는지 확인한다.

- r160으로 목표를 달성할 수 있으면 그대로 유지
- 업그레이드가 꼭 필요하면 이유, 영향 파일, 회귀 위험, 빌드 크기 차이를 먼저 문서화
- core와 addons는 반드시 같은 revision
- 한 화면에서 서로 다른 Three.js revision을 중복 로드하지 않음
- 어떤 revision이든 로컬 고정 파일만 사용하고 CDN은 사용하지 않음

---

## 8. AURORA 모델 검사실

게임을 매번 플레이하지 않아도 품질을 고칠 수 있도록 별도 검사 모드를 만든다.

권장 URL:

```text
?chase3d=1&chase3dLab=aurora
```

### 검사실 필수 기능

- 중립 회색 또는 어두운 스튜디오 배경
- 자동 회전 on/off
- 다음 고정 시점 버튼 또는 query parameter
  - top
  - front
  - rear
  - rear-high
  - left
  - right
  - bottom
  - gameplay
- wireframe on/off
- albedo/normal/roughness/metalness/emissive 단독 보기
- LOD0/LOD1/LOD2 전환
- 조명 on/off
- bloom on/off
- triangles, draw calls, textures, geometries, GPU program 수 표시
- 고정 seed
- 고정 camera transform
- 캡처마다 같은 픽셀이 나오도록 시간 정지 옵션

검사실은 기본 URL에서 로드되거나 실행되면 안 된다.

---

## 9. 게임 통합 방식

### 9.1 이번 단계는 하이브리드

이번 단계에서 완전 3D 전장을 다시 주장하지 마라.

- 신규 Three.js 레이어: AURORA 기함만
- 기존 RC2 2.5D 레이어: 적, 보스, 게이트, 픽업, 총알, 폭발, 경고, 드론
- HUD: 기존 2D

AURORA가 고품질로 승인되기 전까지 다른 임시 3D 모델을 화면에 섞지 않는다. 기존 임시 모델 코드는 즉시 삭제하지 말고 개발 fallback으로 남기되 신규 hero mode에서는 숨긴다.

### 9.2 전환

- 100~160%: 기존 RC2
- 160~200%: 기존 기함 sprite의 alpha는 감소하고 신규 AURORA의 alpha는 증가
- 200~220%: 신규 AURORA 완전 표시
- 적과 이펙트는 이번 단계에서 RC2 투영을 계속 사용

현재처럼 3D 캔버스 opacity만 올리고 2D 기함을 그대로 남기는 가짜 교차 전환을 하지 마라. 기함만 정확히 분리해 `1-t`와 `t`로 교차시킨다.

### 9.3 입력과 판정

- 마우스/터치 입력은 기존 논리 좌표 유지
- 기함의 3D visual bank/roll은 판정에 반영하지 않음
- hit core는 기존 위치와 반경 유지
- 기함 모델이 커 보여도 판정이 커지면 안 됨

---

## 10. 성능 구조

### 10.1 프레임 중 할당 금지

`update`, `apply`, `render` 안에서 다음을 새로 만들지 않는다.

- `Vector2/3/4`
- `Matrix4`
- `Quaternion`
- 배열
- geometry
- material
- texture

초기화 때 만들고 재사용한다.

### 10.2 셰이더 사전 준비

첫 전투 중 shader compile hitch가 발생하지 않게, 지원 Three.js 버전에서 가능한 경우 `renderer.compileAsync(scene, camera)` 또는 동등한 사전 렌더 경로를 사용한다.

다음 변형을 실제로 사전 준비한다.

- LOD별 재질
- 발광 on/off
- bloom on/off
- 모바일/데스크톱 품질
- 게임 카메라

사전 준비 전후에 `renderer.info.programs`와 프레임 hitch를 기록한다.

### 10.3 성능 측정은 정지 화면 금지

정지한 모델 검사실의 평균 FPS만 보고하지 마라. 실제 게임에서 다음 조건으로 측정한다.

- 함대 좌우 이동
- 연속 사격
- 적과 투사체 존재
- 120프레임 warm-up
- 이후 최소 900프레임
- p50, p95, p99 frame time
- worst frame
- shader program 수 변화
- draw calls
- triangles
- texture/geometry 수

목표:

| 환경 | 목표 |
|---|---|
| 데스크톱 800×450 | p50 16.7ms 이하, p95 22ms 이하 |
| 모바일 390×844, DPR 제한 적용 | p50 20ms 이하, p95 33ms 이하 |
| warm-up 후 shader program | 실제 플레이 중 증가 0 |
| AURORA 단독 draw calls | 25 이하 권장 |
| 전체 hero hybrid draw calls | 80 이하 권장 |

목표 미달이면 숨기지 말고 원인을 분석하고 LOD·DPR·bloom을 낮춰라.

### 10.4 수명주기

- zoom 160% 미만에서는 3D 렌더 휴면
- context loss 시 즉시 RC2 fallback
- dispose에서 geometry/material/texture/render target/listener 해제
- 모드 진입/이탈 20회 후 `renderer.info.memory`가 계속 증가하면 실패

---

## 11. 권장 파일 구조

현재 구조를 먼저 검토하고 더 적절한 이름이 있으면 조정해도 된다. 단일 거대 파일로 만들지 마라.

```text
js/
  chase3d-aurora-geometry.js     # planform, loft, detail geometry, LOD
  chase3d-aurora-materials.js    # 결정적 texture forge, PBR material
  chase3d-aurora-model.js        # AURORA 조립과 animation hook
  chase3d-lab.js                 # 검사실
  chase3d-models.js              # 기존 kit와 신규 AURORA 연결
  chase3d-scene.js               # 조명, color management, prewarm
  chase3d-mapping.js             # 실제 드론/적 분류 수정
  chase3d-renderer.js            # hybrid mode와 lifecycle

tests/
  chase3d-aurora-geometry.test.mjs
  chase3d-aurora-determinism.test.mjs
  chase3d-real-snapshot.test.mjs
  chase3d-hero-wiring.test.mjs

docs/qa/chase3d-opus5-aurora/
  reference-A4.png
  old-phase0.png
  new-top.png
  new-front.png
  new-rear.png
  new-rear-high.png
  new-left.png
  new-right.png
  new-bottom.png
  new-gameplay-desktop.png
  new-gameplay-mobile.png
  comparison-board.png
  profile.json
```

원본 WebP를 QA용 PNG로 복제할 필요가 없다면 경로 링크만 사용해도 된다.

---

## 12. 자동 테스트

### 12.1 geometry

- 모든 vertex/normal/UV가 finite
- index 범위 정상
- degenerate triangle 비율 측정
- bounding box가 합리적
- 전방이 +Z
- 좌우 대칭 오차 허용치 이내
- LOD별 triangles 예산
- 동일 seed의 position/index/UV hash 동일
- 서로 다른 seed는 구조를 망가뜨리지 않고 작은 표면 변화만 만듦

### 12.2 material

- map 크기와 포맷 확인
- 같은 seed에서 픽셀 hash 동일
- albedo, normal, roughness, metalness, emissive가 서로 다른 데이터
- color map과 non-color map의 colorSpace 설정 확인
- texture dispose 확인

### 12.3 실제 snapshot

- 실제 `Squad`에서 `count > 0`이면 드론 snapshot이 비어 있지 않음
- `BAL.squad.drawCap` 초과하지 않음
- Gate/Crystal/Pickup이 enemies에 들어가지 않음
- `isEnemy !== true`인 객체가 enemies에 들어가지 않음
- 미지원 적이 B1로 바뀌지 않음
- B8만 B8
- MidBoss는 `def.id` 사용
- snapshot 전후 실제 객체 deep state 동일

### 12.4 wiring

- 기본 URL에서 신규 lab/hero 모듈이 실행되지 않음
- `?chase3d=1`에서도 명시한 hero 플래그 정책대로만 실행
- WebGL 실패 시 RC2
- context loss 시 RC2
- zoom 전환 시 기함 2D/3D alpha 합이 약 1
- teardown 후 listener 중복 없음

---

## 13. 시각 품질 검사

### 13.1 원본 실루엣 자동 비교

top view를 원본 A4 alpha silhouette와 같은 크기로 정규화한다.

- 중심 정렬
- 비율 유지
- 앞 방향 정렬
- binary mask 생성
- Intersection over Union 계산

목표:

- top silhouette IoU 0.82 이상

수치만 맞추기 위해 디테일을 망가뜨리면 안 된다. 원본의 주익, 전방, 함미 갈라짐이 육안으로도 일치해야 한다.

### 13.2 필수 비교판

한 장의 `comparison-board.png`에 같은 화면 크기로 배치한다.

1. 원본 A4
2. 기존 실패한 Phase 0
3. 신규 top
4. 신규 rear-high
5. 신규 실제 gameplay

각 이미지 아래에 다음을 적는다.

- triangles
- draw calls
- frame time p50/p95
- 해당 시점

### 13.3 완료로 인정하지 않는 상태

- 기본 도형의 원형·사각형 실루엣이 그대로 보임
- 선체 부품이 서로 관통하거나 떠 있음
- 원본의 반응로와 금색 척추가 사라짐
- 뒤에서 봤을 때 엔진 두 개와 회색 날개만 보임
- 모든 표면 거칠기와 반사가 같음
- 밝은 발광으로 형태를 숨김
- top view만 비슷하고 rear/side가 장난감처럼 보임
- 게임 화면 크기에서 세부가 뭉개짐
- 검사실 화면만 좋고 실제 gameplay는 검게 보임

---

## 14. 작업 순서

### Pass 1 — 읽기와 계약

1. 기준선 측정
2. 참고 저장소의 geometry/material/QA 구조 조사
3. `docs/2026-07-30-Claude-Opus5-AURORA-ARCHITECTURE.md` 작성
4. 수정 대상과 소유 파일 명시

### Pass 2 — 정확성

1. 실게임 드론 위치 snapshot
2. 적/게이트/픽업/보스 분류 수정
3. 실제 클래스 기반 테스트
4. 기존 테스트 전체 통과

### Pass 3 — 모델 검사실

1. 재현 가능한 lab
2. 고정 카메라와 진단 모드
3. 자동 캡처가 가능한 query state

### Pass 4 — AURORA geometry

1. silhouette/landmark 수치화
2. LOD0 주 선체 loft
3. 주익·함미·반응로·척추·패널
4. side/bottom 완성
5. LOD1/LOD2
6. geometry tests

### Pass 5 — material과 lighting

1. deterministic texture forge
2. PBR map 연결
3. color management
4. key/fill/rim
5. 약한 bloom A/B
6. shader prewarm

### Pass 6 — 실제 게임 통합

1. AURORA만 신규 3D
2. 나머지는 기존 RC2
3. 진짜 기함 crossfade
4. bank, bob, engine pulse
5. hit core/입력/판정 동일

### Pass 7 — 가혹한 시각 비평

아래 질문에 각각 증거 화면으로 답한다.

- 원본 A4를 모르는 사람이 같은 함선이라고 판단하는가?
- 함미에서 반응로·엔진·주익이 서로 구분되는가?
- 기함이 “내가 성장시킨 대형 함선”처럼 보이는가?
- 기존 RC2와 실패한 Phase 0보다 명백히 좋은가?
- 모바일 실제 크기에서도 실루엣이 읽히는가?

하나라도 “아니오”이면 완료 보고 전에 수정한다.

### Pass 8 — 성능과 회귀

1. 실제 이동·사격 900프레임 프로파일
2. desktop/mobile
3. 수명주기 20회
4. 전체 테스트
5. CrazyGames 빌드 크기
6. diff check

---

## 15. Claude Code의 에이전트 사용 원칙

Claude Code에서 sub-agent를 사용할 수 있다면 다음처럼 **순차적 단일 소유자 방식**으로 사용한다.

1. 참고 사례 조사 agent — 읽기 전용
2. geometry owner — geometry 파일만
3. material/render owner — geometry 승인 후 작업
4. visual critic — 코드 수정 없이 캡처만 평가
5. performance/QA owner — 프로파일과 테스트
6. lead agent — 최종 통합

geometry, material, tone mapping, lighting을 여러 agent가 동시에 같은 파일에서 수정하지 마라. 참고 사례도 병렬 fan-out보다 결합된 시각 시스템의 순차적 단일 소유자 작업이 더 좋은 결과였다고 보고했다.

sub-agent 기능을 사용할 수 없으면 같은 순서를 별도 pass로 수행한다.

---

## 16. 용량 제한

코드에서 절차적으로 생성하므로 신규 대형 이미지·GLB를 넣지 않는다.

목표:

- 신규 shipped 코드/소형 자산 합계: 압축 전 1.0MB 이하
- CrazyGames 전체: 47.0MB 이하 목표
- 절대 제한: 50MB 미만
- 절차적 texture GPU 메모리: 데스크톱 16MB 이하, 모바일 8MB 이하 목표
- AURORA 생성 시간: 데스크톱 1초 이하, 모바일 1.8초 이하 목표

초과하면 이유와 최적화 결과를 보고한다.

---

## 17. 완료 보고서

다음 문서를 작성한다.

```text
docs/2026-07-30-Claude-Opus5-ThreeJS-WebGL2-AURORA-재구현-완료보고.md
```

반드시 포함할 내용:

1. 한 문장 결론
2. 기준선과 최종 테스트 수
3. 변경 파일 전체 목록
4. 기존 Phase 0에서 버린 것과 보존한 것
5. AURORA geometry 구조
6. PBR map 생성 방식
7. silhouette IoU
8. LOD별 triangles
9. 실제 gameplay p50/p95/p99/worst
10. draw calls, texture, geometry, program 수
11. desktop/mobile 캡처 경로
12. comparison board 경로
13. CrazyGames 크기 전후
14. 남은 한계
15. 검증하지 못한 항목
16. commit/push/deploy를 하지 않았다는 확인

보고서 마지막에는 사용자에게 아래 질문만 한다.

> 신규 AURORA가 원본과 같은 기함으로 느껴지고, 기존 RC2 및 실패한 Phase 0보다 소유감과 함미 시점의 위압감이 명백히 좋아졌습니까? 승인되면 같은 파이프라인으로 B1 한 종만 다음 품질 기준으로 제작하겠습니다.

---

## 18. 최종 금지사항

- “테스트 통과”만으로 시각 품질 완료 선언
- 기본 도형 수를 늘린 것을 디테일 향상이라고 보고
- 원본과 비교하지 않은 3D 모델
- 검사실 정지 화면 FPS를 실제 플레이 FPS라고 보고
- 모든 미지원 적을 B1로 표시
- 모든 미지원 보스를 B8로 표시
- 가짜 `sq.drones` 데이터로만 테스트
- 합성 루프를 실제 600프레임 결정성이라고 보고
- 외부 CDN
- 게임 규칙 변경
- 기본 URL 활성화
- 사용자 승인 전 B1/B4/B8 양산
- commit, push, merge, 배포, 업로드

이번 작업의 성공 기준은 코드량이 아니라 단 하나다.

**사용자가 확대했을 때 AURORA를 더 오래 보고 싶을 만큼, 원본의 정체성과 실제 3D의 깊이가 동시에 느껴져야 한다.**
