# 네온 함대 — 작업 상태 (2026-08-06)

## §G-5 실모델 기준 확정(이사 승인) — 2d01199
- 실모델 8종(b1~b6·b17·b18) + face 대면(항상 정면) + rotY π(얼굴 -z) + 얼굴 보조광. 남은 4종(b16/b19/b20/b21)=빌보드, 이사 결제 결정 대기.
- 확인: fleetlab(실전) / `chase3dLab=models&labView=front`(8종 진열장).
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
1. ~~§G-1 아군~~ ~~§G-2 무기 발사체~~ ~~§G-3 픽업~~ ~~§G-4-A 적탄·B 터렛·C 위버~~ 완료
2. §G-4 잔여: **B3(대형 크리처)·보스(B22·B7)** 종별 순차 — 다음 배치
3. §F 잔여: ①chase3dHeroTest 결정 장면 ⑤반응로 축소(이사 확인 후)

## 서버(백그라운드)
- `node scratch_nocache_srv.mjs "E:/workspace/claude/neon-fleet-worktrees/stage1-analytics"` (8346, 루트 인자 필수)
- `node scratch_capsrv2.mjs` (9098 캡처 저장)
- 외부 테스트 필요 시: `cloudflared tunnel --protocol http2 --url http://localhost:8346`

## QA 캡처 절차(pane 백그라운드)
- 검사실: `__NF3D.lab.step(1)` ×40 + `#game3d.toDataURL` 같은 태스크 → capsrv POST.
- 실전: `__NF.startPlay()` → world 준비 대기 → 필요 개체 주입(`hp=maxHp=999999`로 격추 방지) → `__NF.step(150)` → 3계층 합성(toDataURL).
