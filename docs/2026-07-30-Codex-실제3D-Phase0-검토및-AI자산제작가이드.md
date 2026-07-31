# Neon Fleet 실제 3D Phase 0 검토 및 AI 3D 자산 제작 가이드

- 작성일: 2026-07-30
- 검토 위치: `E:\workspace\claude\neon-fleet-worktrees\stage1-analytics`
- 검토 대상: `docs/2026-07-30-Claude-실제3D-함미추적모드-Phase0-완료보고.md`
- 결론: **기술 골격은 보존, 현재 절차적 3D 모델은 폐기·교체, 배포 금지**

---

## 1. 결론

사용자의 평가가 맞다.

현재 모델은 “실제 3D 면을 가진다”는 기술 조건만 충족했을 뿐, 원본 2D 기함과 적의 디자인·정체성·소유감을 거의 보존하지 못했다.

- 원본 AURORA는 흰 장갑판, 중앙 금색 척추, 원형 반응로, 6개 어두운 패널, 넓은 삼각형 함체가 핵심이다.
- 현재 3D AURORA는 원통·상자·구를 조립한 블록 모형이며 위 특징이 함미 화면에서 거의 읽히지 않는다.
- 현재 B1·B4·B8도 원본의 생체 장갑·칼날·발광 핵·거대한 낫 실루엣 대신 사면체·원통·토러스 조합으로 축약됐다.
- 약 16~860 triangles라는 숫자는 성능상 장점이지만, 이 게임의 대표 3D 모델로는 지나치게 낮다.

다만 다음 기술 골격은 재사용할 가치가 있다.

- `?chase3d=1` 기능 플래그
- Three.js 로컬 동적 로딩
- 2D 판정과 3D 렌더 분리
- 카메라·좌표 변환
- WebGL context-loss fallback
- HUD 분리 캔버스
- CrazyGames 용량 검사

따라서 지금 해야 할 일은 3D 기능 전체를 되돌리는 것이 아니라 다음 순서다.

1. 현재 모델 팩토리를 임시 모델로 표시하고 배포하지 않는다.
2. AURORA 한 종을 AI 도구로 제대로 만든다.
3. AURORA GLB를 실제 카메라에 넣어 시각 품질·용량·프레임을 재판정한다.
4. 만족할 때만 B1·B4·B8을 만든다.
5. 실게임 매핑 버그를 수정한 뒤 다시 검증한다.

---

## 2. 재검증 결과

Codex가 다시 실행한 결과:

```powershell
node --test tests/*.test.mjs
node scripts/build-crazygames-basic.mjs
git diff --check
```

- 자동 테스트: **787/787 PASS**
- CrazyGames Basic: **208파일**
- 압축 전: **45.39MB**
- ZIP: **44.13MB**
- `git diff --check`: 오류 0, 기존 `js/ui.js` 줄바꿈 경고 1

자동 테스트와 빌드는 정상이다. 그러나 아래 문제들은 기존 테스트가 잡지 못한다.

---

## 3. 코드 검토 발견사항

### P0 — 시각 목표 실패

근거:

- `js/chase3d-models.js:54-96`은 기본 도형을 생성한다.
- AURORA도 `js/chase3d-models.js:102-145`에서 원통·상자·원뿔을 조립한다.
- QA 이미지 `docs/qa/chase3d-phase0/phase0-flagship-rear-detail.png`에서 원본 A4의 디자인 정체성이 거의 보이지 않는다.

완료보고의 “평면이 아니라 실제 앞·뒤·옆이 있으므로 실패가 아니다”라는 판정은 제품 목표를 잘못 해석한 것이다. 이번 목표는 단순한 입체 면이 아니라 **원본 함선의 매력을 가까이서 확인하는 경험**이었다.

### P1 — 실게임에서는 드론 3D가 나타나지 않는다

`js/chase3d-mapping.js:152`는 `sq.drones` 배열을 읽는다.

하지만 실제 `Squad`는 `count`와 `_offsets`로 드론을 그리며 `drones` 배열을 보유하지 않는다. `js/entities.js:215-273`에서 이를 확인할 수 있다.

Claude의 전용 테스트 장면은 `js/main.js:232`에서만 임의의 `drones` 배열을 만들어 넣었다. 따라서 테스트 장면의 드론 성공은 실게임 드론 성공을 증명하지 않는다.

수정 방향:

- 실제 `Squad.formationOffsets()` 또는 현재 2D 드론 배치 계산을 공용 순수 함수로 분리한다.
- `sq.count`를 기준으로 동일한 드론 위치를 3D에 생성한다.
- 합성 QA 객체가 아니라 실제 `Squad` 인스턴스로 검증한다.

### P1 — 게이트·픽업·비전투 개체가 B1 적으로 중복 표시된다

`js/chase3d-mapping.js:154`는 살아 있는 `world.entities` 전체를 적 목록으로 넣는다.

그 후 같은 개체에서 게이트는 `:158-159`, 픽업은 `:160`에서 다시 별도 목록에 넣는다.

`classifyEnemy()`는 모르는 개체를 모두 B1로 반환한다(`:131-137`). 결과적으로:

- 게이트 = B1 적 + 게이트 기둥
- 크리스탈/코인/POW = B1 적 + 픽업
- 운석·잔해·캡슐 등 = B1 적
- 미지원 적 10종 이상 = 전부 B1
- B8 이외 보스 = 전부 Reaper Lord

현재 220% 전체 3D 화면은 실제 게임 개체 정체성을 보존하지 않는다.

수정 방향:

- `isEnemy`와 명시적 `spriteId/entityKind`만 적으로 분류한다.
- 게이트·픽업·장애물·수송선은 상호 배타적 분류를 사용한다.
- 지원되지 않은 개체가 있으면 B1로 바꾸지 말고 해당 개체만 2D fallback 또는 전체 RC2 fallback을 사용한다.

### P1 — 600프레임 테스트는 실제 게임 결정성 테스트가 아니다

`tests/chase3d-determinism.test.mjs:11-31`은 실제 게임을 시작하지 않고 작은 합성 객체와 자체 `advance()` 함수를 만든다.

이 테스트가 증명하는 것:

- `buildSnapshot()`과 `computeSceneModel()`이 제공된 객체를 직접 수정하지 않는다.

이 테스트가 증명하지 못하는 것:

- 실제 게임 `update()` 600프레임
- 실제 적 스폰·충돌·보상·RNG
- 실제 Squad·World·Boss 클래스 상태 동일성
- 실제 3D on/off A/B 전체 경로

완료보고의 “대체 객체 추정이 아니라 실제 상태” 표현은 과장이다.

### P1 — 완전 3D에서 핵심 전투 시각 정보가 사라진다

`js/main.js:2809-2833`은 `t3d >= 0.999`에서 기존 2D 월드 렌더를 전부 생략한다.

3D 쪽에는 다음 표현이 충분히 구현되지 않았다.

- 폭발·피격·처치 파티클
- 데미지 텍스트와 링
- 유도 미사일 고유 형상
- 여러 적의 공격 예고
- 화면 밖 위험 경고
- 적 affix와 상태 표시
- 원본 스프라이트 기반 적 구분

`drawEdgeWarnings()`도 `chaseProj`가 있을 때만 호출되므로 완전 3D에서는 사라진다.

이 문제는 단순 미관이 아니라 위험 인지와 조작 피드백 문제다.

### P2 — 160~200%는 진짜 교차 페이드가 아니다

작업 계약은 2D alpha=`1-t`, 3D alpha=`t`였다.

현재는 2D 월드를 완전 불투명하게 그린 뒤 그 위에 3D 캔버스만 `opacity=t`로 올린다. 완료보고도 “근사”라고 인정했다.

따라서 전환 중 함선과 적이 두 겹으로 겹쳐 보일 수 있다.

### P2 — 데스크톱도 모바일 픽셀비율로 분류될 수 있다

`js/chase3d-renderer.js:29-32`는 전달받은 렌더 폭이 820 이하이면 모바일로 간주한다.

Neon Fleet는 PC에서도 세로 게임 기둥 폭을 사용한다. 완료보고의 1920×1080 측정에서도 렌더 폭은 670px이므로 데스크톱 GTX 1060 환경이 모바일 pixel ratio 1.0 경로에 들어간다.

이는 기기 판정이 아니라 게임 캔버스 폭 판정이며, 큰 모니터에서도 모델이 흐릿하거나 계단져 보일 수 있다.

### P2 — 완료보고 표현이 실제 증거보다 강하다

- “플래그 off = RC2 바이트 동일”: `main.js`는 이미 변경됐고 config/mapping을 정적으로 import하므로 바이트 동일이 아니다. Three.js 미로드·동작 fallback이 정확한 표현이다.
- “실제 600프레임 A/B”: 합성 상태와 자체 advance다.
- Prolific·reduced-motion은 실제 실행하지 않고 회귀 없음으로 처리했다.
- sustained FPS는 실제 측정하지 않았다.
- 3D 전용 캡처는 투명 배경·HUD 통합 장면이 아니라 검은 배경의 WebGL 캔버스 단독 이미지다.

---

## 4. AI 2D→3D 도구 조사 결과

조사 기준일은 2026-07-30이며 가격·약관은 결제 전에 다시 확인한다.

### 1순위 — Tripo Studio Pro

공식:

- 제품·가격: https://www.tripo3d.ai/pricing
- 멀티뷰·P1 Smart Mesh 기술 문서: https://platform.tripo3d.ai/docs/generation
- 이용약관: https://www.tripo3d.ai/terms

장점:

- 단일 이미지에서 멀티뷰 이미지를 만드는 흐름 지원
- 멀티뷰→3D 지원
- 최신 P1 Smart Mesh가 저폴리·게임 자산을 명시적으로 목표
- `face_limit` 48~20,000 범위
- GLB 출력
- PBR·UV 지원
- Pro에 private models와 commercial use 포함

공식 가격 페이지 기준:

- Free: 월 200 credits, public CC BY 4.0
- Pro: 월 결제 $19.90, 연 결제 환산 $13.93/월, 3,000 credits

Tripo의 무료 요금제 상업 이용 설명은 공식 페이지들 사이에 표현 차이가 있다. 따라서 무료 계정은 형태 시험에만 쓰고, 게임에 실제 넣을 최종 파일은 **Pro 사용 중 다시 생성·다운로드**하는 것이 안전하다.

Neon Fleet 추천 설정:

- 모델: `P1 Smart Mesh`
- 입력: 멀티뷰
- face limit:
  - AURORA 8,000~12,000
  - B1/B4 2,500~4,000
  - B8 12,000~18,000
- texture: on
- PBR: on
- Smart Low Poly: on
- export: GLB

### 2순위 — Meshy 6

공식:

- 시작 방법: https://docs.meshy.ai/en/webapp/getting-started
- Multi-Image to 3D: https://docs.meshy.ai/en/api/multi-image-to-3d
- 가격·라이선스: https://docs.meshy.ai/en/webapp/pricing
- 출력 형식: https://docs.meshy.ai/en/webapp/guides/platform/export-formats

장점:

- 같은 물체의 이미지 1~4장 입력
- GLB·FBX·OBJ 등 출력
- 목표 polycount 지정 가능
- triangle/quad remesh 가능
- PBR의 metallic·roughness·normal과 emission map 생성 가능
- `remove_lighting`으로 원본 그림의 조명을 base color에서 줄일 수 있음

공식 문서 기준:

- Free: 월 100 credits, 결과물 CC BY 4.0과 출처 표시 조건
- 유료: private·full commercial, 사용자 output 소유
- Meshy 6 Multi-Image textured 작업은 API 가격표 기준 30 credits

Neon Fleet처럼 발광 엔진과 네온 핵이 중요한 게임에는 emission map 지원이 유리하다.

권장 설정:

- Meshy 6
- Multi-Image to 3D
- `image_enhancement=false`로 먼저 원본 디자인 보존
- `remove_lighting=true`
- PBR on
- 2K가 아니라 최종은 1K 또는 후처리로 1K 축소
- target polycount는 위 Tripo와 같은 범위
- GLB 출력

### 3순위 — Hyper3D Rodin

공식:

- Image/Multi-View to 3D: https://hyper3d.ai/features/image-to-3d
- 가격: https://hyper3d.ai/pricing

장점:

- 단일·멀티 이미지 모두 지원
- Rodin Gen-2.5
- Smart Low-Poly
- 고해상도→low-poly normal bake
- GLB·FBX·OBJ 등 지원
- 결과 확인 후 결제하는 흐름

공식 가격 페이지 기준:

- Free: 생성 결과 확인 후 확정 결제, direct credit $1.5
- Creator: 월 $30, 약 60 models, multi-image·Smart Low-Poly·unlimited export and any use

비용이 Tripo보다 높지만 AURORA 하나를 Tripo 결과와 비교하는 후보로 좋다.

### 제외 — Kaedim

공식 가격: https://www.kaedim3d.com/plans

- 7일 trial $50
- Indie $400/월

사람이 개입하는 제작 파이프라인이라 품질은 기대할 수 있지만, 현재 무료 웹게임 목표에는 비용이 지나치게 크다.

### 사용 금지 권고 — 로컬 Hunyuan3D-2

공식 라이선스:

https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE

해당 라이선스의 Territory 정의는 한국을 명시적으로 제외한다. 현재 사용 위치가 한국이므로 이 프로젝트에는 권하지 않는다.

---

## 5. 가장 좋은 제작 방법

### 핵심 원칙

한 장짜리 탑뷰를 바로 3D에 넣으면 AI는 보이지 않는 함미·측면·바닥을 임의로 만든다.

따라서:

> 원본 한 장 → 일관된 멀티뷰 4장 → 멀티뷰 3D 생성 → GLB 검사

순서로 진행한다.

### 1단계 — AURORA 한 종만 시험

원본:

`E:\workspace\claude\neon-fleet-worktrees\stage1-analytics\assets\art2-webp\styleC\A4.webp`

이 파일을 1024×1024 투명 PNG로 준비한다.

- 함선 전체가 잘리지 않아야 함
- 중앙 정렬
- 그림자·우주 배경·텍스트 없음
- 원본 비율 유지
- 억지로 가로세로를 늘리지 않음

### 2단계 — 멀티뷰 이미지 4장 만들기

권장 뷰:

1. Top — 현재 원본과 같은 탑뷰
2. Left side — 좌측 측면
3. Rear 3/4 — 엔진과 함미가 보이는 게임 카메라용 핵심 뷰
4. Front 3/4 — 기수와 상부 장갑이 함께 보이는 뷰

모든 뷰에서:

- 같은 함선
- 같은 부품 수
- 같은 색
- 같은 비율
- 같은 중립 조명
- 무배경
- 다른 함선을 새로 디자인하지 않음

Tripo의 멀티뷰 이미지 생성 기능을 먼저 사용하되, rear 3/4가 원본 디자인을 크게 바꾸면 그 뷰만 편집·재생성한다.

### 멀티뷰 생성 프롬프트

```text
Create four consistent orthographic reference views of the exact same sci-fi flagship from the uploaded canonical top view: top, left side, rear three-quarter, and front three-quarter.

Preserve the original identity exactly:
- broad white triangular armored hull
- central gold command spine
- large circular reactor ring near the rear center
- six dark recessed deck panels
- symmetric swept wings and twin lower tail fins
- small cyan navigation lights
- two clearly visible rear engine exhausts

Do not redesign the ship. Do not add extra wings, weapons, logos, text, landing gear, background, stars, smoke, motion blur, or dramatic perspective.
Neutral studio lighting, centered object, same scale in every view, clean hard-surface game-asset concept sheet.
```

### 3단계 — 3D 생성

우선 Tripo P1로 만든다.

1. 멀티뷰 4장 업로드
2. Smart Mesh/P1 선택
3. AURORA face limit 8,000부터 시작
4. PBR texture 활성화
5. 3~4개 결과 생성
6. 탑뷰와 rear 3/4를 가장 잘 보존한 한 개 선택
7. GLB 다운로드

첫 결과부터 20,000면을 쓰지 않는다. 실루엣이 잘못되면 폴리곤 수를 올려도 해결되지 않는다. 멀티뷰를 먼저 고친다.

### 4단계 — 합격 여부 확인

AURORA는 다음을 모두 통과해야 한다.

- 탑뷰 실루엣이 원본 A4와 거의 같다.
- 중앙 금색 척추와 원형 반응로가 남아 있다.
- rear 3/4에서 엔진 2개와 함미 구조가 자연스럽다.
- 날개가 녹거나 붙거나 비대칭이 아니다.
- 바닥이 종이처럼 완전히 평평하지 않다.
- 측면 높이는 폭의 약 15~25%로, 전투기보다 기함처럼 묵직하다.
- 텍스처에 원본 배경이나 가짜 그림자가 구워져 있지 않다.
- 회전시켰을 때 뒤쪽이 무의미한 덩어리가 아니다.

이 중 하나라도 크게 실패하면 B1·B4·B8을 만들지 말고 AURORA 멀티뷰부터 수정한다.

---

## 6. Codex에 가져올 파일 규격

최종 파일명:

```text
NF_A4_AURORA_v01.glb
NF_B1_SHARD_v01.glb
NF_B4_SNIPER_v01.glb
NF_B8_REAPER_LORD_v01.glb
```

방향과 좌표:

- Y축 = 위
- 기수 = +Z
- 엔진 = -Z
- 좌우 = X
- 원점 = 모델 중심
- 회전·스케일 transform 적용
- negative scale 없음

권장 삼각형 수:

| 모델 | 권장 triangles |
|---|---:|
| AURORA | 8,000~12,000 |
| B1 | 2,500~4,000 |
| B4 | 2,500~4,000 |
| B8 | 12,000~18,000 |

권장 파일 크기:

| 모델 | 목표 GLB |
|---|---:|
| AURORA | 700KB 이하 |
| B1 | 300KB 이하 |
| B4 | 350KB 이하 |
| B8 | 900KB 이하 |
| 합계 | 2.25MB 이하 목표 |

텍스처:

- AURORA·B8: 최대 1024×1024
- B1·B4: 최대 512×512
- 8K·4K 금지
- base color 필수
- emissive 권장
- metallic/roughness 선택
- normal은 실제 효과가 분명할 때만
- 모델당 material 2~4개 이하 권장

포함하지 않을 것:

- 카메라
- 조명
- 배경
- 리깅
- 애니메이션
- 이름 없는 여러 중복 mesh
- 사용하지 않는 4K 텍스처

같이 가져올 자료:

```text
A4_top.png
A4_side.png
A4_rear3q.png
A4_front3q.png
A4_GLBrender_top.png
A4_GLBrender_rear3q.png
A4_prompt.txt
A4_generation-info.txt
```

`generation-info.txt`에는 다음을 기록한다.

- 사용 도구와 모델 버전
- 생성일
- 사용 요금제
- 상업 이용 권한
- 생성 설정
- 원본 파일명

---

## 7. 사용자에게 권하는 실제 선택

가장 비용을 적게 쓰는 순서:

1. Tripo Free에서 AURORA 형태 시험
2. 만족할 가능성이 보이면 Pro 1개월 결제
3. Pro에서 멀티뷰와 AURORA 최종 GLB 생성
4. GLB와 4방향 캡처를 Codex에 전달
5. Codex가 현재 함미 카메라에 시험 장착하고 용량·방향·프레임 검사
6. 성공할 때만 B1·B4·B8 생성

비교가 필요하면 AURORA만 Hyper3D Rodin에서도 한 번 만들어 본다. 처음부터 4개 모델과 전체 28종을 만들지 않는다.

현재 Claude의 모델을 “수정”하는 것보다 원본 2D를 멀티뷰 기반 AI 3D로 새로 만드는 편이 빠르고 품질도 높다.

---

## 8. 다음 소스 작업에서 반드시 고칠 것

사용자가 AURORA GLB를 가져온 다음 Claude에게 별도 작업지시서를 준다.

그 작업은 다음으로 제한한다.

1. `GLTFLoader` 또는 적절한 로컬 GLB 로더 추가
2. 임시 `flagship()` 절차적 모델을 AURORA GLB로 교체
3. 모델 방향·크기·원점 보정
4. 로딩 중/실패 시 RC2 fallback
5. 모델을 매 프레임 다시 로드하지 않고 1회 캐시·복제
6. 실제 Squad 드론 배치 수정
7. 게이트·픽업·적 상호 배타적 분류
8. 미지원 개체를 B1/B8로 위장하지 않는 fallback
9. 완전 3D의 위험 경고·피격·폭발 가독성 보존
10. 실제 게임 인스턴스 기반 A/B 테스트

그 전에는 현재 Phase 0을 배포하거나 전체 3D 확장을 승인하지 않는다.
