# NEON FLEET 전면 개편 아트 통합 작업지시서

작성일: 2026-07-17
제작: Codex
구현 담당: Claude

## 1. 목적과 고정 원칙

이번 패키지는 기함 진화, 무기 진화, 적 역할, B22/B7 보스 부위 파괴, 배경, 스토리, 강화 연출을 하나의 시각 체계로 교체하기 위한 승인 아트다.

- Claude는 아래 이미지를 **재생성하거나 임의로 다시 그리지 않는다**. 구현, 배치, 크기 조정, 애니메이션, 성능 최적화만 담당한다.
- 기본 런타임 자산은 `assets/art2-webp/`를 사용한다. PNG가 필요한 예외만 `assets/art2/`를 폴백으로 사용한다.
- `H2_FRAME_ALIGNMENT`, `B22_ALIGNMENT`, `B7_ALIGNMENT` 그룹은 같은 크기와 원점을 유지해야 한다. 개별 크롭·중앙 정렬을 다시 하면 안 된다.
- 스프라이트 교체로 충돌 판정, 무기 수치, 보스 피해 공식이 바뀌면 안 된다.
- 모든 통합은 로컬 검증 후 커밋한다. 이 작업지시서는 GitHub 푸시를 자동 승인하지 않는다.

## 2. 전달 자산과 승인 버전

| 구분 | 수량 | 위치 |
|---|---:|---|
| 고해상도 마스터 PNG | 68 | `source/masters/` |
| 런타임 PNG | 67 | `assets/art2/` |
| 권장 런타임 WebP | 67 | `assets/art2-webp/` |
| 기술 QA | 68개 PASS | `docs/qa/phase-b/technical-qa-codex-v01.json` |
| 전체 미리보기 | 1 | `docs/qa/phase-b/full-asset-board-codex-v01.png` |

승인본은 다음과 같다.

- B7 전체 및 부품: `codex_v02`
- 타이틀 락업: `nf2_brand_title_lockup_codex_v02.png`
- 그 외 전달 자산: 각 폴더의 최신 `codex_v01`
- `nf2_brand_title_lockup_codex_v01.png`은 태그라인 겹침이 있는 보존본이므로 사용 금지
- `nf2_boss_b7_queen_closed_codex_v01.png`은 청록색 생성 오류를 보존한 원본이므로 사용 금지

런타임 파일의 정확한 원본·출력·크기·SHA-256은 아래 매니페스트를 단일 기준으로 사용한다.

- PNG: `assets/art2/asset-manifest-codex-v01.json`
- WebP: `assets/art2-webp/asset-manifest-codex-v01.json`

## 3. 1순위 — 로더와 기함 계보

### 3.1 기존 슬롯 매핑

| 현재 슬롯 | 새 기함 | 권장 파일 |
|---|---|---|
| A1 | H0 Seed Scout | `assets/art2-webp/styleC/A1.webp` |
| A2 | H1 Interceptor | `assets/art2-webp/styleC/A2.webp` |
| A3 | H2 Striker | `assets/art2-webp/styleC/A3.webp` |
| A4 | H3 Carrier | `assets/art2-webp/styleC/A4.webp` |
| A5 | H4 Dreadnought | `assets/art2-webp/styleC/A5.webp` |
| A6 | H5 Titan | `assets/art2-webp/styleC/A6.webp` |

`js/sprites.js`의 `RASTER_ART.C.A1~A6`를 위 파일로 교체한다. 현재 `A{티어}{V/L/H}` 완성 함선 이미지를 선택하는 방식은 새 아트 체계와 맞지 않는다. 새 체계는 **기본 선체 + 무장 마운트 + 효과**의 합성 방식이다.

### 3.2 H2 커맨드 프레임

다음 세 파일은 533×768, 같은 원점이다.

- `assets/art2-webp/ships/frames/H2_base_aligned.webp`
- `assets/art2-webp/ships/frames/H2_assault.webp`
- `assets/art2-webp/ships/frames/H2_carrier.webp`

H2 티어에서만 기본 선체 위에 프레임을 같은 좌표로 합성한다.

- 활성 무기가 `homing`이면 Carrier 프레임
- 활성 무기가 `vulcan` 또는 `laser`이면 Assault 프레임
- 무기 교체 때 180ms 알파 교차 전환
- 충돌 반경은 기존 H2 값 유지

## 4. 2순위 — 무장 마운트와 발사체

### 4.1 진화 매핑

| 계열 | 기본 | 진화 A | 진화 B |
|---|---|---|---|
| Vulcan | `nf2_mount_vulcan_base.webp` / `nf2_proj_vulcan_base.webp` | `vulcan_needle` → needle | `vulcan_storm` → storm |
| Laser | `nf2_mount_laser_base.webp` / `nf2_proj_laser_base.webp` | `laser_cutter` → cutter | `laser_prism` → prism |
| Homing | `nf2_mount_homing_base.webp` / `nf2_proj_homing_base.webp` | `homing_wasp` → wasp | `homing_siege` → siege |

파일 위치:

- 마운트: `assets/art2-webp/weapons/mounts/`
- 발사체: `assets/art2-webp/weapons/projectiles/`

2단계 초진화는 1단계 분기 마운트를 유지하되 기존 초진화 색·수치 효과와 `weapon_evolution` VFX를 강화해 표시한다. 새 그림이 없는 초진화를 임의의 다른 분기 그림으로 바꾸지 않는다.

### 4.2 렌더 규칙

- 마운트의 하단 원형 소켓을 기함 하드포인트에 맞춘다.
- H0/H1은 중앙 1개, H2/H3은 좌우 2개, H4/H5는 중앙 주포와 좌우 보조포가 읽히도록 배치한다.
- 마운트가 선체 실루엣을 전부 덮지 않도록 기함 긴 변의 약 28~42% 범위에서 조정한다.
- 실제 캡처를 보고 티어별 하드포인트 좌표를 데이터 상수로 분리한다. 렌더 함수 안에 좌표를 흩어 놓지 않는다.
- `Bullet.draw()`와 `HomingMissile.draw()`는 새 발사체를 우선 사용하고, 로드 실패 시 기존 Canvas 도형을 폴백한다.
- 이미지 크기가 바뀌어도 기존 `r`, 관통, 회전, 유도, 피해 판정은 유지한다.
- Needle은 48px에서 매우 얇은 것이 의도다. 짧은 잔상과 외곽 명암을 런타임에서 추가하되 폭을 과하게 키우지 않는다.

## 5. 3순위 — 일반 적 6종

| 슬롯 | 파일 | 시각 역할 |
|---|---|---|
| B16 | `assets/art2-webp/styleC/B16.webp` | 열린 폭탄창과 주황 탄두 |
| B17 | `assets/art2-webp/styleC/B17.webp` | 긴 전극 두 개와 전기 장기 |
| B18 | `assets/art2-webp/styleC/B18.webp` | 회전 링과 중앙 외눈 |
| B19 | `assets/art2-webp/styleC/B19.webp` | 전면 주황 방패 |
| B20 | `assets/art2-webp/styleC/B20.webp` | 좌우 산란 격납고 |
| B21 | `assets/art2-webp/styleC/B21.webp` | 분절된 점멸 실루엣 |

`RASTER_ART.C.B16~B21` 경로만 교체하고 현재 행동·충돌·보상 수치는 바꾸지 않는다. 40~52px 실측 판독은 `docs/qa/phase-b/enemy-roles-codex-v01.png`를 기준으로 한다.

## 6. 4순위 — B22 네온 아비터

정렬 그룹은 768×705다.

- `B22_chassis.webp`
- `B22_ring.webp`
- `B22_arm_left.webp`
- `B22_arm_right.webp`
- `B22_core.webp`
- `B22_crack_mask.webp`

`js/sprites.js`에 B22 전용 래스터 슬롯을 등록하고, `NeonArbiter.draw()`에서 한 장짜리 B7 폴백 대신 위 레이어를 같은 원점에 합성한다.

- 기본: chassis + ring + 양팔 + core
- STAGGER 상승: crack mask를 `lighter` 또는 `screen`으로 점진 표시
- BREAK: 고리 4분면을 클립 영역으로 나누어 순차 소거·흔들림 처리하고 core 노출 강화
- 좌우 팔의 패턴이 무력화되면 해당 팔을 숨기거나 파괴 흔들림으로 전환
- 부품 파괴 순간 `nf2_vfx_boss_armor_break.webp` 사용
- 보스 충돌·피해 판정은 기존 B22 로직 유지

## 7. 5순위 — B7 하이브 퀸 단일 보스 재구성

정렬 그룹은 768×582다.

- `B7_body.webp`
- `B7_egg_left.webp`
- `B7_egg_right.webp`
- `B7_crown.webp`
- `B7_heart.webp`
- `B7_escape_core.webp`
- `B7_debris_sheet.webp`

하이브 퀸을 3기의 일반 보스처럼 생성하면 안 된다. 화면에는 **한 개체**만 존재하고, 내부 부위 상태만 분리한다.

권장 페이즈:

1. 좌우 산란낭 활성: 소환 패턴, 산란낭별 보조 HP
2. 산란낭 파괴 후 왕관 방어: 중앙 패턴 변화, crown 균열
3. crown 파괴 후 heart 노출: 탄 수 증가가 아니라 추적·돌진·안전지대 이동 패턴
4. heart 임계치에서 `B7_escape_core` 분리: 짧고 빠른 최종 추격

파괴된 부품은 숨기고 `B7_debris_sheet`의 파편을 사용한다. 레이어를 전부 합쳤을 때 승인 원본과 픽셀 차이 0으로 검증되어 있으므로, 위치를 개별 보정하지 않는다.

## 8. 6순위 — 배경 패럴랙스

| 장소 | FAR | MID |
|---|---|---|
| Helios Graveyard | `nf2_bg01_helios_far.webp` | `nf2_bg01_helios_mid.webp` |
| Crimson Hive Rift | `nf2_bg02_hive_far.webp` | `nf2_bg02_hive_mid.webp` |

위치: `assets/art2-webp/backgrounds/`

- 섹터 1~4는 Helios를 구역 색상으로 약하게 틴트하고, 섹터 5~6은 Hive를 사용한다.
- FAR은 저속, MID는 약 2배 속도로 이동한다.
- 중앙 전투 레인은 원본에서 비워 두었으므로 추가 밝기·성운을 중앙에 넣지 않는다.
- 이미지 경계가 보이지 않도록 두 장 교차 반복 또는 상하 미러 반복을 사용하고 10~15% 구간에서 알파 교차한다.
- 기존 `zone-backdrop.js`의 먼지·항적은 저강도로 유지하되 랜드마크 도형은 새 FAR와 중복되면 비활성화한다.

## 9. 7순위 — 스토리와 통신 초상

인트로 5장:

1. `nf2_story_intro_01_cold_wake.webp`
2. `nf2_story_intro_02_lumen_boot.webp`
3. `nf2_story_intro_03_core_rewrite.webp`
4. `nf2_story_intro_04_chorus.webp`
5. `nf2_story_intro_05_launch.webp`

통신 초상:

- `nf2_portrait_echo7.webp`
- `nf2_portrait_hive_queen.webp`

위치: `assets/art2-webp/story/`

`js/intro.js`의 5개 `tone`과 순서대로 연결한다. 이미지는 하단 32%를 어둡게 비운 상태이므로 기존 텍스트를 그 위에 올린다. CSS로 별도 우주선 도형을 중복 표시하지 않는다. `prefers-reduced-motion`에서는 패닝과 줌을 제거하고 크로스페이드만 유지한다.

## 10. 8순위 — 업그레이드·파괴 VFX

위치: `assets/art2-webp/vfx/`

- `nf2_vfx_core_ignition.webp`: 기함 코어 점화
- `nf2_vfx_armor_lock.webp`: 장갑 결합
- `nf2_vfx_weapon_evolution.webp`: 무기 진화
- `nf2_vfx_tier_ascension.webp`: 기함 티어 상승
- `nf2_vfx_boss_armor_break.webp`: 보스 부품 파괴

기함 티어 상승 권장 타임라인:

1. 0~120ms: 50~70ms 히트스톱 후 core ignition
2. 90~280ms: armor lock, 기존 선체 0.65 알파
3. 220~520ms: 새 선체 교차 등장 + tier ascension
4. 520~800ms: 신규 실루엣 고정, 짧은 화면 흔들림과 사운드

무기 진화는 마운트 교체 180ms, `weapon_evolution` 350ms, 신규 발사체 즉시 적용 순서로 한다. 일반 레벨업에는 전체 연출을 재생하지 않고 코어 펄스만 축소 사용한다.

## 11. 브랜딩

- 타이틀: `assets/art2-webp/branding/title_lockup.webp`
- 앱 아이콘: `assets/art2-webp/branding/app_icon.webp`
- 심볼 단독: `assets/art2-webp/branding/emblem.webp`

타이틀 문자열은 이미지에 정확히 `NEON FLEET`로 조판되어 있다. CSS 텍스트를 같은 위치에 중복 출력하지 않는다.

## 12. 성능과 로딩

- PNG 런타임 세트: 29.79MB
- 권장 WebP 세트: 10.87MB
- 투명 WebP: 보이는 RGB와 알파가 PNG와 동일
- 불투명 WebP 최소 PSNR: 38.01dB

모든 자산 67개를 첫 화면에서 한꺼번에 요청하지 않는다.

- 타이틀: 브랜딩 + 필요한 인트로 첫 장만
- 전투 시작: A1~A6, 현재 무기 계열, 현재 구역 배경, 현재 적 슬롯
- 보스: 등장 예고 때 해당 보스 레이어 지연 로드
- 스토리 나머지 패널: 인트로 시작 직후 순차 프리로드

## 13. 필수 검증

### 자동 검증

1. `node --test tests/*.test.mjs`
2. 신규 WebP 전 파일 디코드 성공
3. 존재하지 않는 PNG/WebP 요청 0
4. `H2_FRAME_ALIGNMENT` 전 파일 533×768
5. `B22_ALIGNMENT` 전 파일 768×705
6. `B7_ALIGNMENT` 전 파일 768×582
7. B22·B7 전체 레이어 재합성 시 위치 어긋남 0

### 브라우저 검증

- 데스크톱 1280×720, 모바일 390×844
- 콘솔 error/warning 0, 404 0, 가로 오버플로 0
- A1→A6 강제 진화 캡처: 크기와 실루엣이 단계별로 커짐
- 세 무기 기본·분기 6종 강제 선택: 마운트와 발사체가 즉시 달라짐
- B16~B21 동시 스폰: 1초 안에 역할을 구분할 수 있음
- B22 STAGGER/BREAK: 고리·양팔·코어 레이어가 겹치지 않음
- B7: 단일 보스, 좌우 산란낭→왕관→심장→탈출 코어 순서 확인
- 배경에서 플레이어·적탄·적 실루엣이 중앙에서 묻히지 않음
- 인트로 5장 하단 텍스트가 주요 피사체를 가리지 않음
- 업그레이드 연출 중 조작 잠금·무적 시간은 기존 게임 규칙과 일치

## 14. 완료 보고 형식

Claude는 완료 후 다음을 한 문서에 남긴다.

1. 수정 파일과 커밋 해시
2. 자산 슬롯 매핑 최종표
3. 자동 테스트 결과
4. 데스크톱·모바일 캡처 경로
5. B22/B7 페이즈 캡처 경로
6. 네트워크 총 전송량과 404 여부
7. 남은 문제와 의도적으로 보류한 항목

Codex가 이 결과와 실제 런타임을 다시 검증한 뒤 최종 승인한다.
