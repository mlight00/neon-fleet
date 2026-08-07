# 네온 함대 — 작업 상태 (2026-08-06)

## 방금 완료: §G-11 차지 연출 3D + 무기 VARCO 프롬프트 (cbe654b, 865/865)
- **차지 연출 3D**(이사 "차지 이펙트도 3D"): 기수 앞 집속 코어+후광(chargeFrac 비례) → 발사 순간 빔 0.34s(3단 충전=금색·굵기 1.5배). **⚠회귀 수정 겸** — 실모델 스왈(§G-8) 이후 절차 AURORA 의 emissive 펄스가 model.group 숨김으로 사라졌던 것을 flagRig 별도 연출로 재구성(기함 종류 무관). 실측 g11-charge/g11-lance.png.
- **무기 VARCO 프롬프트 전달**(이사 "varco3d 에서 만들 수 있으면"): `E:/workspace/claude/neon-fleet/assets/3d/프롬프트_무기_5종.md` — W1 발칸·W2 레이저·W3 유도발사대 포탑 + W4 미사일 탄체 + W5 차지 포구. **이사 생성 대기**.
  - **VARCO 가능/불가 구분**: 단단한 물체(포탑·탄체·포구)=가능 / 빛·빔·폭발·화염=불가(코드 담당, 이미 완성).
  - 필요 이유: 3D 함미 시점은 2D 기함을 통째로 안 그려(flagshipAlpha 0) **무기를 바꿔도 기함 겉모습이 동일**. 포탑이 생기면 무기 선택이 보인다.
- ⚠**테스트 함정**: dist 서버(8347)가 폴더를 잡고 있으면 빌드 게이트 테스트 7건이 EPERM 으로 실패 — 코드 문제 아니다. 서버 정지 후 재실행.
- 참고(이사 질문): **fleetlab 은 개발 직행(devDirect) 이라 경로 선택 화면을 건너뛴다**(enterSectorMap 조기 반환) — 정상 플레이(타이틀→출격)에서는 그대로 나온다.

## (기록): §G-10 배포판(포털)에 실모델 3D 포함 (673e745, 865/865, 47.96MB/50MB)
- 이사 결정 "사운드 재인코딩해서 3D 넣어줘" → **BGM 21곡 Vorbis q1 재인코딩**(120→71kbps): 사운드 28.50 → **17.09MB**(-11.4MB). ⚠️효과음 48개는 0.55MB뿐 — 용량은 전부 BGM이었다(실측 후 대상 확정).
- **포털 전용 경량 GLB 28종**(`assets/3d/portal/`, 17.83MB): 텍스처 512·JPEG q84~85·메시 15~20K. **개발본(assets/3d/*.glb ~2MB)은 품질 그대로 — 두 벌 운영.**
- ⚠️`gltfpack -sa` 금지(`--noaggr`): 리메시 균일 토폴로지는 일반 단순화로 형태 유지, -sa 는 UV 아일랜드 무시로 "녹은 무늬"를 만든 전력(§G-5).
- 빌드 배선: 매니페스트 **remap** 도입 — `assets/3d/portal/x.glb` → dist 의 `assets/3d/x.glb`. 런타임 코드·경로 수정 0, 경량본 없으면 404→빌보드 폴백(기존 동작).
- **타이틀 엠블럼 404 수정**(기존 누락): ui.js 가 `<img>` 로 직접 참조하는데 매니페스트에 없었다 — dist 실서빙 QA로 발견.
- 검증: dist 실서빙 GLB 28종 200 OK·404 0건·3D 렌더 정상(기함 T2+드론 49+순양함 2), ZIP 43.24MB. 실측 `g10-dist3d.png`.
- ⚠️백업: BGM 원본 `E:/workspace/claude/neon-fleet-audio-backup-20260807/`. ⚠️dist 서버가 폴더를 잡고 있으면 재빌드가 EPERM — 서버 먼저 정지.

## (기록) §G-9 2D 스프라이트 26종 → 3D 실모델 렌더 교체 (c875478, 865/865)
- 이사 지시 "3D 이미지들도 2D 에 적용해 일관성 유지" → **적 12 + 보스 6 + 기함/아군 6(A1~A6) + 픽업 2** 전부 3D 모델 렌더로 교체. 원본 백업=`E:\workspace\claude\neon-fleet-2d-art-backup-20260807\`.
- 파이프라인: `tools/sprite-render.html?run=1`(정사각 768 타이트 렌더, 실전과 같은 IBL·조명) → `scripts/sprite_finalize.py`(채도·밝기 보정 + 외곽 발광 + **원본 캔버스 규격·채움비·중심 재현**).
- **⚠️규격 계약**: 게임 blit 배율이 원본 종횡비에 묶여 있다(SHIP_ART_ASPECT 등) — 캔버스 크기를 추정으로 넣었다가 20종이 어긋난 사고 1회. 렌더는 정사각, 규격 정합은 파이썬(fit_to_reference)이 전담하는 구조로 확정.
- **⚠️3D 렌더는 그대로 쓰면 안 된다**: 사실적 PBR 이라 2D 아트(발광·채도 과장)보다 어두워 "예쁘지만 안 보이는" 스프라이트가 됨 → 마감 단계 필수.
- 기함(A1~A6)은 무기 리그·프레임 오버레이가 본체를 덮어 화면상 차이가 거의 없다(실측 g9-flag-ab.png) — 부작용 없어 일관성 목적으로 교체 유지.
- **⚠️외곽 발광 폐기(이사 실기 "이상한데?", 83b42e7)**: 어두운 배경 식별성을 노려 실루엣 외곽에 후광을 깔았는데 **작게 그려지는 개체(드론 18px)는 후광이 본체를 덮어** 뿌옇게 뭉갬. 원본 2D 도 halo 없이 그림 자체 발광으로 식별 — 채도·밝기만이 정답. 26종 재마감(glow=None). 실측 g9-glow-fix.png.
- **⚠️T2 기함만 교체가 안 먹던 함정(이사 "기함 3d 이미지 적용이 안된다", 819bdda)**: T2(ARCLIGHT)는 `shipSprite` 가 A3 가 아니라 **`H2_BASE_FRAME`**(assets/art2-webp/ships/frames/H2_base_aligned.webp, 533×768)을 쓰고 A3 는 폴백일 뿐 — 게다가 그 위에 무기별 외장 `H2_ASSAULT/H2_CARRIER` 가 덮인다. → ①H2_base_aligned 를 t2 실모델 렌더로 교체 ②`drawHullFrame` 외장 오버레이 폐지(`HULL_FRAME_OVERLAY=false`, 6등급 중 T2 특례라 통일). ⚠️무기별 함체 외장 변화 연출은 사라짐(구분은 포대 마운트·HUD 유지). **교훈: 아트 교체 전 스프라이트를 실제로 고르는 코드 경로(shipSprite/오버레이)를 먼저 읽을 것 — 파일명 추정 금지.**
- 포털 빌드 46.62 → **41.40MB**(새 스프라이트가 더 가벼움). 실측 g9-sample-final·g9-play2d·g9-h2-final-ab.png.

## (기록) §G-8 기함 실모델 6등급 스왑 + 피격 파편·흔들림 (c5fc1b1, 865/865)
- **기함 6등급 전부 실모델**(이사 "B 로 하자"): T0/T1=a1/a2 재사용, T2 ARCLIGHT·T4 ZENITH·T5 QUASAR 신규, T3 AURORA=a0. `FLAG3D` 테이블 + flagRig(홀더 6 + 절차 AURORA 폴백).
- **⚠️회전 규약(실측 확정)**: 서 있는 원본(a1/a2/a0)=rotX -π/2, **누운 원본(t2/t4/t5)=rotX 금지**(적용하면 전장 1.67·높이 5.04 세워진 벽). 바운딩박스 최대축으로 판별할 것.
- TIER_SCALE [0.62..1.26] = 2D SHIP_VISUAL_SIZE 비의 √ 압축(원비 1.59배는 T5 화면 초과). 검사실 `chase3dLab=flags`(6등급 격자, **labView=front 필수** — top 은 행이 깊이로 겹침).
- **피격 연출 교체**(이사 "충돌 이펙트는 정말 별로다"): 섬광 완전 제거 → **파편 16(결정적 LCG)+함체 감쇠 진동 0.42s**. 파편은 기수 앞·갑판 위 스폰(함체 내부 스폰=가려서 안 보임 — 실측 교정). 카메라는 안 흔든다(멀미 방지).
- 실측 `g8-tier-grid.png`(6등급)·`g8-tier-scale.png`(위엄 차등)·`g8-debris2-crop.png`(파편). 포털 빌드 46.62MB.

## (기록) §G-6 보스 6종+아군 2종 실모델 = 게임 전 개체 실 3D 완성 (66a6ac8→16fee12)
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
