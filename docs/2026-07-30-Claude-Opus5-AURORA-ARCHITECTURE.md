# Opus5 AURORA 재구현 — 아키텍처 계약 (Pass 1)

- 작성일: 2026-07-30 · 기준 지시서: `docs/2026-07-30-Claude-Opus5-ThreeJS-WebGL2-AURORA-재구현-작업지시서.md`
- 기술: **Three.js r160(로컬 고정) + WebGL2**. OpenGL 직접 사용 아님(§1.3). 코어 three만 사용(애드온 미벤더링 — 필요 유틸은 자체 구현).
- 기준선 실측(§3): 테스트 **787/787** · CrazyGames **208파일 / 45.39MB / ZIP 44.13MB** · `git diff --check` clean · 미커밋 93경로 보존.

## 1. 참고사례(Claude-of-Duty)에서 가져오는 것 / 버리는 것

**가져옴(방법만, 코드 이식 없음):**
1. **전면 챔퍼 규율** — 넓은 정면 평면은 스페큘러 로브를 통째로 받아 장난감이 됨 → 모든 주요 에지에 실제 chamfer/bevel 형상. lathe 프로파일·extrude+bevel을 부품 표준으로.
2. **Assembly 버킷 병합** — 재질 키별로 geometry를 병합해 AURORA 전체를 draw call 한 자릿수~십수로. 명명 노드(엔진 플룸·포인트) 유지. 병합 유틸은 자체 구현(코어 three만).
3. **결정적 텍스처 포지** — 시드 고정, **ORM 채널 패킹**(r=AO/g=rough/b=metal 한 장), height→Sobel normal(`강도=relief/worldSize`), **Nyquist 규율**(텍셀 대비 노이즈 주파수 상한 — "근접 사포, 원거리 무텍스처" 방지), 샘플할 맵만 굽기.
4. **재현 캡처 규율** — 시간 정지 + 고정 카메라 + 고정 seed로 같은 픽셀 보장(lockstep 개념), 실플레이 프로파일은 분포(p50/p95/p99)+히치 원인귀속(프로그램 수 점프=컴파일 스톨).
5. **프리웜 함정 2가지** — compileAsync는 현재 씬 변형만 커버 → 대표 프레임 실렌더 병행; 렌더타깃/톤매핑 상태가 프로그램 캐시 키에 접힘.

**버림:** 병렬 팬아웃 오케스트레이션(저자 실측 순손실), TAA/GTAO/SSR/모션블러/뷰모델 리그(자인한 고장), 월드 Y 웨더링. 참고 저장소는 스크래치에 읽기전용 클론(저장소 내 복사·코드 차용 없음 → THIRD_PARTY_NOTICES 불요).

## 2. 소유 파일과 책임 (§11)

| 파일 | 책임 |
|---|---|
| `js/chase3d-aurora-geometry.js` (신규) | A4 디지타이즈 planform(96행 런 테이블 내장) → 중앙 선체 다단 loft(indexed BufferGeometry, 상/중/하 체적 분리, 크리스=정점 분리) + 주익 beveled loft + 쌍꼬리 붐 + 반응로 링(원시도형 허용부) + 금색 척추 loft + 함몰 육각 패널 + 그리블. LOD0/1/2. 재질 버킷별 병합 + 명명 노드. **THREE 인자 주입(순수 함수) — Node 테스트 가능** |
| `js/chase3d-aurora-materials.js` (신규) | 시드 고정 CPU TextureForge(**typed array → Node 픽셀해시 테스트 가능**) → albedo(sRGB)/normal/ORM/emissive DataTexture + MeshStandardMaterial 세트(armorTop/armorSide/under/gold/reactor/engine/panel). 색관리 상수 |
| `js/chase3d-aurora-model.js` (신규) | 조립(지오메트리×재질), bank/bob/엔진 펄스 훅, LOD 선택, dispose |
| `js/chase3d-lab.js` (신규) | `?chase3d=1&chase3dLab=aurora` 검사실: 스튜디오, 8시점, 와이어프레임, 맵 단독, LOD, 조명/글로우 토글, 통계, 시간정지·고정 카메라·캡처 훅. 기본 URL 미로드 |
| `js/chase3d-mapping.js` (수정) | §5.1 실드론 공식(_offsets·width·t·drawCap·clearR), §5.2 분류(isEnemy·unsupported·B8만 B8·MidBoss def.id) |
| `js/chase3d-scene.js` (수정) | 색관리(SRGBColorSpace+ACESFilmic), key/fill/rim+함미 보조광, hero 씬(AURORA만), compileAsync 프리웜, 분류 소비 갱신 |
| `js/chase3d-renderer.js` (수정) | hero 하이브리드 수명주기(§9): 3D=AURORA만, 휴면·context loss·dispose 기존 유지 |
| `js/main.js` (수정) | hero 모드 배선: 기함 2D alpha `1-t` ↔ 3D `t` 진짜 교차(적·이펙트·드론은 전 구간 RC2), 입력은 기존 RC2 역변환 유지, lab 진입 |
| `js/entities.js` (최소 수정) | Squad.draw에 기함 전용 alpha 파라미터(드론·링은 불변) |
| tests | `chase3d-aurora-geometry` `chase3d-aurora-determinism` `chase3d-real-snapshot` `chase3d-hero-wiring` (+기존 chase3d 테스트를 §5 규칙에 맞게 갱신) |

기존 임시 모델(`chase3d-models.js`)은 삭제하지 않고 dev fallback(`chase3dTest=1` 구장면)으로 유지, hero 모드에선 미사용(§9.1).

## 3. AURORA 형상 계약 (§6 이행 방법)

- **단일 진실 = A4 알파 디지타이즈**: `tests/fixtures/a4-planform.json`(96행 반폭 런, 함미 3분할 포함, aspect 0.6885). 지오메트리는 이 테이블로 외곽을 **구성적으로** 재현 → top IoU는 설계상 보장, 목표 ≥0.82.
- 분해: 중앙 선체(행0→95 첫 런) loft + 주익 쌍(행≈28~77 플레어 영역, 두께·베벨·하면 있는 후퇴익) + 측면 꼬리붐 쌍(행78~89 둘째 런) + 반응로(행≈65~78 중앙, 다층 금속 링+밝은 코어+방사 세부) + 금색 척추(노즈→반응로→함미 팁 연속 loft) + 함몰 육각 패널 6(내부 다크+프레임+청록 틱) + 함미 엔진(붐 후단 쌍발+중앙 보조 추진기 — 원시도형 허용부).
- 좌표: 전방 +Z, 상단 +Y, X 대칭(§6.2). 크리스(챔퍼 경계)는 정점 분리로 하드 노멀.
- 예산: LOD0 18k~45k(목표 ~22k), LOD1 6k~15k, LOD2 1.5k~5k. 의미 없는 세분화 금지 — 베벨·반응로·함미 우선.

## 4. 재질·조명 계약 (§7)

- CPU TextureForge(시드 mulberry32): armorTop 512²(albedo+normal+ORM+emissive), armorSide/under·gold·reactor·panel 256². 총 GPU 텍스처 ≈8~10MB(모바일 절반 해상도 ≤8MB). `Math.random()` 금지.
- A4는 팔레트·패널 배치 근거 + IoU 정답으로만 사용(전체 스트레치 데칼 금지, §7.2). 이미지 로딩 실패와 무관하게 절차 재질로 동작.
- `outputColorSpace=SRGBColorSpace`, `toneMapping=ACESFilmicToneMapping`(§7.3 지정), albedo/emissive만 sRGB. key(웜)/fill(쿨)/rim+**함미 보조광**(엔진·하부가 검게 뭉개지지 않게).
- 후처리: 통짜 파이프라인 금지. 발광 한정 약한 글로우(에미시브 스프라이트 레이어)로 시작, 필요시 저해상 에미시브 블러 1패스만 검토. 없이도 형태가 읽혀야 함.

## 5. 하이브리드·성능·검증 계약 (§9·§10·§12·§13)

- hero 모드(기본 `?chase3d=1`): 3D 캔버스=**AURORA 1척만**. 적·보스·게이트·픽업·총알·경고·드론 = 기존 RC2 2.5D 전 구간 유지. 기함만 2D `1-t` ↔ 3D `t` 진짜 교차(§9.2). 입력·판정 = 기존 RC2 경로 그대로(§9.3) — Phase0의 3D 입력 역변환은 hero 모드에서 미사용.
- 프레임 중 할당 0(§10.1), compileAsync+대표 프레임 프리웜(§10.2), 실플레이 프로파일은 `?chase3d=1&coreLoopTest=1` 실전투를 수동 펌프로 120+900프레임(p50/p95/p99/worst, programs 증가 0 확인)(§10.3), 수명 20회 왕복 memory 불변(§10.4).
- 결정성(§5.3 정직): Node=실클래스(Squad·Creature·Sniper·Boss…) 스냅샷 전후 deep 비교. 브라우저=`Math.random` 시드 고정 후 실게임 600프레임 A/B(3D on/off) 상태 직렬화 비교. 불가 항목은 보고서에 명시.
- 시각(§13): top IoU≥0.82(A4 정답 그리드), 8시점+gameplay 캡처, §13.3 실패조건 전수 점검, comparison-board.png(원본/실패작/신규 3종+수치 주석).
