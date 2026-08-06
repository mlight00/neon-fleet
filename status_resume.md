# 네온 함대 — 작업 상태 (2026-08-06)

## 방금 완료: §G-6 보스 6종+아군 2종 실모델 = 게임 전 개체 실 3D 완성 (66a6ac8→16fee12, 이사 확인 진행 중)
- **적 12 + 보스 6(b7/b22 len 414·b8~b11 len 371, cap 1) + 아군 드론 60·순양함 10(ALLY3D)** 전부 VARCO 리메시 50K 실모델.
- main Boss/MidBoss 수집 분기(spriteId→ENEMY3D 키, 로스터 밖=2D 유지) + 보스 이름 라벨 HUD 보존. makeGlbSwarm(key,def,fallback)=아군 로드 실패 시 디지타이즈 조형 폴백.
- **아군 방향 규약(실측 확정): rotX -π/2 + rotY π** — 이사 지적(8/6) "드론 위아래 반전" 교정: rotY π 로 기수만 180°(+z 소실점), ⚠️rotX 부호 반전은 배 밑면 노출이라 금지. 실측 `g7-drone-fixed-crop.png`.
- **기함 가림 교정(8/6 이사 "적·수송선이 정면에 부딪히는 게 아니라 위로 지나감", 2445459)**: 근접 깊이 클램프 6 < 기함 시선깊이 11.2 가 원인 — placeSwarm behindFlag 로 적·픽업 깊이를 기함 기수 뒤([6,FB)→[FB,FB+1.5) 단조 리매핑, 화면 위치·크기 불변)로 밀어 겹침 구간에서 기함이 가림. 아군·탄은 기함 앞 유지. HW-13, 864/864. 실측 `g7-occl-final-crop.png`. 이사 판정(8/6): "아까보다는 괜찮다" — 수용, 추가 미세조정 여지.
- **충돌 섬광(8/6 이사 요청, 9d12d40)**: 적 몸체 충돌·적탄 명중(내구도 지불) 순간 기함 기수에 백열+주황 충격파+스파크 0.32s — 신호=squad.flash 상승 에지(로직 무수정), 3D HUD 계층 전용, 보호막 방어·reduced-motion 미발화. 실측 `g7-impact-crop.png`(내구도 100→78 충돌 프레임).
- **§G-7 픽업 4종 실모델 투입(8/6, 742341c)**: 이사 VARCO 5종 수령 → PICKUP3D(crystal/pod/coin/pow, cap=PROP_CAPS) — renderer 픽업 생성 GLB 우선·조형 폴백, capsule 레거시 제외. 실측 `g7-pickups-real.png`(실전 4종 동시). ⚠️진열장 1종 함정: createGlbShowcase 격자가 3열 고정이라 단독 진열이 화면 밖(x=-1.5·scale 2) — 종 수 기준 중앙 정렬로 수정.
- **기함 VARCO A/B 대기(8/6)**: `chase3dLab=a0`(VARCO, 아군 규약 rotX -π/2+rotY π) vs `chase3dLab=aurora`(현행) — 비교판 `g7-flagship-ab.png` 이사 전송, **판정 대기**(승인 시 hero 기함 교체 배선).
- **기함 등급 구조 확인**: 기함=6등급(T0 EMBER~T5 QUASAR, balance.js names). 3D는 현재 등급 무관 AURORA 단일 → **티어 스왑 배선 필요**. T0/T1=드론(a1)·순양함(a2)과 동일 아트라 재사용, 신규 제작=T2 ARCLIGHT·T4 ZENITH·T5 QUASAR — **프롬프트 전달** `E:\workspace\claude\neon-fleet\assets\3d\프롬프트_기함티어_3종.md`(참고 3장 변환 완료, 완성명 t2/t4/t5_50k.glb). **이사 생성 대기** → 도착 시 티어 스왑 구현.
- 864/864, 포털 빌드 46.6MB(GLB 제외→빌보드 폴백). 보스 페이즈 연출은 실전 보스전에서 이사 확인 후 조정.

## (기록) §G-5 실모델 기준 확정(이사 승인) — 2d01199
- 실모델 8종(b1~b6·b17·b18) + face 대면(항상 정면) + rotY π(얼굴 -z) + 얼굴 보조광. → 이후 b16(1d42212)·b19~b21(90c9611)로 적 12종 완성.
- 확인: fleetlab(실전) / `chase3dLab=models&labView=front`(진열장 — 일반 적만, 보스·아군 제외).
- ⚠️양자화 GLB=r160 getX 변환 필수(파편·로드실패 함정 2건 — 통합 보고서 §G-5).

## 방금 완료: 적 12종 전부 Gemini 렌더 빌보드 통합 (f163667, 이사 확인 대기)
- 이사가 10종 렌더 제공(`E:\workspace\claude\neon-fleet\assets\3d\B*.png`) → 일괄 전처리(b19 워터마크 스팟 제거 포함) → **적 12종 전체**(b1~b6·b16~b21)가 이사 제작 렌더로 표시.
- 구조: ENEMY3D 단일 진실 테이블(chase3d-prop-defs) — renderer eswarm 루프·main put3D 헬퍼. 조형 스웜(b1/b2/b4) 퇴역. Blinker 는 appearT≥0.9 만 3D(텔레포트 페이드=2D 연출 유지).
- 검증: 863/863, fleetlab 실측 9종 동시(`docs/qa/chase3d-opus5-aurora/g4-all-batch1.png`·`batch2.png`), dist 12종 포함. 로컬 커밋만(푸시 금지).
- **이사 확인: fleetlab 정상 진행만으로 전 종 등장** — 터널 URL 은 세션마다 갱신(status 최신 참고).

## (기록 2026-08-03) 터렛·위버 = 이사 제작(Gemini) 렌더 빌보드 교체 (a3a199e)
- 이사가 절차 조형 기각("정말 별로다") → **Gemini 프롬프트 제작 → 이사가 렌더 생성 → 게임 반영** 새 파이프라인 확립.
- 원본: `E:\workspace\claude\neon-fleet\assets\3d\터렛.png·위버.png` → 전처리(검정 배경 제거=본체 코어 불투명+발광 luminance 페이드, 워터마크 자동 제거, 512² webp) → `assets/3d/b5_gen.webp·b6_gen.webp`.
- `js/chase3d-billboards.js` 신규: 카메라 대면 판(빌보드) — 터렛·위버는 회전·측면 노출이 없어 판 티 없음. renderer b5/b6 스웜 교체(placeSwarm 계약 유지). 빌드 매니페스트 자동 동기. 863/863.
- 실측: fleetlab 220% b5:2·b6:2, `docs/qa/chase3d-opus5-aurora/g4-billboard-play.png`.
- ⚠️QA 교훈: pane rAF 정지 상태에선 카메라 보간이 안 돎 → `__NF.setZoomTarget(2.2)+stepCamera(300)` 수동 펌프 필수(zoom 1이면 3D 수집 자체가 0).

## (기록) §G-4 절차 조형판 — 빌보드로 대체됨
- **G-4-A 적탄**(cc00584+0967eb8): 플라즈마 3파트 순수 조형(백열 코어+화염 외피+꼬리), instanceColor 로 적 종별 탄색.
- **G-4-B 터렛**(330beea, `js/chase3d-b5.js`): 자유 디자인 — 팔각 요새 로프트+2연장 포신+**돔 꼭대기 용광로**+발광 링·슬릿·머즐. 512tri.
  전용 재질 포지: B1 키틴 텍스처 재사용 + 고정 러프 0.72·반사 0.3·자주 틴트(평면 반사 뭉침 교정 — 실측 교훈).
- **G-4-C 위버**(330beea, `js/chase3d-b6.js`): **xy 평면 6방 낫 별**+전면 눈(정면 카메라에 별 실루엣이 활짝 — xz 수평 1차안은 엣지만 보여 폐기). 402tri.
- 배선: renderer 스웜 cap 8·main 수집(비변이만, LEN 105)·검사실 b5/b6 타깃(배율 2.8). 테스트 +6 → **862/862**. dist 재빌드. 커밋 로컬만(푸시 금지).
- 캡처: docs/qa/chase3d-opus5-aurora/g4-b5-lab-final.png · g4-b6-lab-final.png · g4-b5b6-play.png · g4-ebullet-220.png

## 이사 확인 방법
- **실전: `http://localhost:8346/?chase3d=1&fleetlab=1`** — 220% 추적. 적탄은 상시, 터렛·위버는 후반 노드에 자연 등장(진행하며 확인).
- 검사실: `?chase3d=1&chase3dLab=b5`(터렛) / `?chase3dLab=b6`(위버) / `chase3dLab=pickups`(픽업 진열) / `chase3dLab=allies`(아군)

## 다음(이사 승인 순서)
1. ~~§G-1 아군~~ ~~§G-2 발사체~~ ~~§G-3 픽업~~ ~~§G-4 적탄·터렛·위버~~ ~~§G-5 적 12종 실모델~~ ~~§G-6 보스 6종+아군 2종~~ 완료
2. 남은 제작 후보(이사 여유 토큰): **픽업류**(크리스탈·보급 수송선 — Gemini 프롬프트 우선)·**기함 AURORA**(선택, 현행도 승인작)
3. §F 잔여: ①chase3dHeroTest 결정 장면 ⑤반응로 축소(이사 확인 후) / 포털 실모델 포함 여부(예산 재확보 시)

## 서버(백그라운드)
- `node scratch_nocache_srv.mjs "E:/workspace/claude/neon-fleet-worktrees/stage1-analytics"` (8346, 루트 인자 필수)
- `node scratch_capsrv2.mjs` (9098 캡처 저장)
- 외부 테스트 필요 시: `cloudflared tunnel --protocol http2 --url http://localhost:8346`

## QA 캡처 절차(pane 백그라운드)
- 검사실: `__NF3D.lab.step(1)` ×40 + `#game3d.toDataURL` 같은 태스크 → capsrv POST.
- 실전: `__NF.startPlay()` → world 준비 대기 → 필요 개체 주입(`hp=maxHp=999999`로 격추 방지) → `__NF.step(150)` → 3계층 합성(toDataURL).
