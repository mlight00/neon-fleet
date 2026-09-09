# 스타포지 러시 v3 1단계 — 최종 검증 보고서

- 작성 2026-09-10 · 저장소 `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar` (worktree, 브랜치 `claude/starforge-v3`, HEAD `e9dd173`)
- 기준 문서: `newmode/v3/DESIGN_v3_stage1.md` (계약서 r2), `newmode/v3/spec/03_구현담당자_전달서.md` §6
- 검증 도구: `node --test`(Node v24.14.0), Playwright Chromium 148(실브라우저 스모크), 육안 스크린샷

## 1. 테스트 수치(실제 출력)

| 묶음 | 명령 | tests | pass | fail |
|---|---|---|---|---|
| v3 신규 | `node --test tests/rush3-*.test.mjs` | **115** | **115** | **0** |
| 기존 러시 | `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` | 32 | 32 | 0 |
| 전체(레거시 네온함대 포함) | `node --test tests/*.test.mjs` | 1314 | 1309 | **5** (아래 §3, 전부 v3 무관·기존 커밋 상태부터 실패) |
| 래칫 | `node --test tests/test-quality-ratchet.test.mjs` | 2 | 2 | 0 (TEST-RATCHET 상한 102 안) |
| import 스모크 | `node -e "import('./rush3/main.js')"` | — | OK (`boot, hitButton, makeLoop, missedLine, timeText`) | — |

v3 115건 내역(ID 접두 `V3-`): GATE 16 · GATE-SCROLL 2 · SUPPLY 12 · CHAIN 11 · ORDER 4 · FIRE 2 · WEAPON 3 · WALL 9 · HIT 6 · DEAD 1 · HP 1 · RETRY 1 · WIN 2 · HEAVY 2 · DETERMINISM 2 · INPUT 3 · SHELL 4 · PURE 1 · SAVE 9 · SPRITES 1 · AUDIO 5 · SIM 5(S1·S2·S3 봇 완주 + 무조작 S1 + 결정성) · SQUAD 5 · STAGES 8.

### 기존 코드 무수정 확인

`git status --short` 결과는 신규 파일만(`?? rush3.html`, `?? rush3/`, `?? tests/rush3-*.test.mjs`, `?? newmode/v3/build/`). `git diff HEAD --stat` = 빈 출력(추적 파일 변경 0). 즉 `rush/`·`rush.html`·`tests/rush-*`·`js/`·`index.html`은 한 줄도 바뀌지 않았다.

## 2. 브라우저 실측(Playwright Chromium, `rush3.html`)

스크립트: `newmode/v3/build/browser-smoke.py` (정적 서버 스레드 + Chromium; 결과 JSON `browser-smoke.json`, 스크린샷 `shot-*.png`). 마우스(DPR 2)·터치(DPR 1) 두 컨텍스트, 25단계 전부 OK, **pageerror 0 · console error/warning 0 · HTTP 4xx/5xx 0**(스프라이트 11장·BGM·SFX 전부 실존 경로).

| 확인 | 결과 |
|---|---|
| 자동 부트(`#game3` 가드) · 타이틀 렌더 | state `title`, 버튼 3개 + 음량 버튼, 스프라이트(M01·BG1) 표시 |
| DPR 반영 | DPR 2: canvas 960×1600 / CSS 480×800 (= CSS × min(dpr,2)) · DPR 1: 480×800 |
| 스테이지 버튼 클릭 → 출격 | 0.3초 뒤 state `run`, stageId 1, units 1, weapon rifle |
| 3초 진행 | z 627~630(190px/s), 탄 생성 |
| ESC 일시정지 / 재개 | paused 1초 동안 z 불변(633→633), ESC 로 run 복귀 |
| `blur` → 자동 일시정지 | paused |
| `visibilitychange`(hidden) → 자동 일시정지 | paused |
| 터치 드래그(PointerEvent pointerType:'touch') | down 만으로 x 불변(240→240), +100 CSS px 이동 후 x 338 (댄 위치로 튀지 않음) |
| 봇(마우스 호버/터치 드래그) S1 완주 | 34.9~35.9초 뒤 state `result`, 승리, 생존 20명, 무기 auto, 정예 격파 |
| localStorage `starforgeRush.v3` | `{"v":3,"stages":{"1":{"cleared":true,"attempts":1,"bestSurvivors":20,"bestTime":38.23}},"lastStage":1,...}` |
| 결과 화면 [다시 도전] → 재출격 | state run, stageId 1, z 초기화(54~57), units 1 |
| 일시정지 [스테이지 선택] → 타이틀 | state title, stageId null |
| 결정성(부수 확인) | 마우스·터치 두 판의 bestTime 이 38.2333…초로 완전히 같다 |

스크린샷 육안: 타이틀(워드마크·히어로·3버튼·STAGE 1 강조), 진행(HUD "STAGE 1 첫 진격 / 남은 거리 558m", 무기 칩 "소총", 병력 16, 중심 삼각 마커, 유닛별 탄 열), 결과("작전 성공! / 생존 20명 / 최고 20명 / 38.2초 / 처치 11 / 보급 통 1개를 놓침 / 신기록!" + 버튼 3개).

## 3. 고친 것

1. **`rush3/main.js` — 저장의 `lastStage` 를 실제 스테이지 id 로만 사용** (`lastStageId()` 헬퍼 추가). `save.js` 의 normalize 는 `lastStage` 를 문자열·임의 숫자까지 허용하므로, 손으로 고친 localStorage(예 `"lastStage":"abc"` 또는 `9`)에서 타이틀 Space/Enter 가 `buildStage('abc')` 를 불러 `unknown stage` 예외를 던졌다. 타이틀 강조(primary) 판정도 같은 헬퍼로 통일. 계약서 8장·V3 테스트 115건 재실행 전부 통과, import 스모크 OK.

그 외 `main.js` 정독 결과(이벤트 리스너·상태 전이 `title→run→paused→result`·result 저장·자동 부트 가드·DPR·`__rush3Dbg`) 정의되지 않은 식별자·잘못된 import 경로·누락 export **없음**. 셸이 소비하는 이벤트 필드(`gateHit.idx`, `supplyOpen.id/x/z`, `joinMany.n`, `weaponSwap.weapon`, `hurt.n`, `blast.r`, `bossKill.r`, `fire.count/weapon`)는 전부 `combat/gates/supply.js` 가 실제로 넣는 필드와 대조해 일치. 오디오 이름(`fire_rifle/auto/heavy`·`crateHit`…`lose`·`click`)도 `audio.js` SFX 맵과 일치.

### 전체 스위트 실패 5건은 v3 와 무관(기존 커밋 상태부터 실패)

| 실패 테스트 | 원인 | v3 무관 근거 |
|---|---|---|
| `tests/g34-transition-cam.test.mjs` (파일 로드 실패) | `js/chase3d-mapping.js` 에 `CHASE_PULLBACK` export 없음 | `git show c11922f:js/chase3d-mapping.js \| grep -c CHASE_PULLBACK` → **0**. 형제 worktree(stage1-analytics)에서 통과하는 이유는 그쪽의 **미커밋** 수정(`M js/chase3d-mapping.js` 등 9파일) 때문 |
| `G49-FACING` | `assets/3d/a1_model.glb` POSITION 이 float32 아님(5123) — 커밋된 GLB 와 테스트 불일치 | 3D 자산·파서, rush3 미참조 |
| `G22-URL` | `?fleetlab=1` 판정 기대값 불일치 | `js/chase3d-config.js`(3D) |
| `HW-14`, `HW-15` | `js/chase3d-renderer.js` 소스 정규식 대조(T0 배율·`DECK_TURRETS` 스위치) | 3D 렌더러 소스 대조 |

이 5건은 `js/`(레거시 3D) 영역이며 rush3 는 `rush/rng.js` 외 어떤 기존 모듈도 import 하지 않는다. 계약서 0장 "기존 코드 수정 금지" 원칙과 작업 범위 밖이라 **수정하지 않았다**. 해결하려면 stage1-analytics worktree 의 미커밋 3D 작업을 별도로 커밋·병합해야 한다(별건).

## 4. 03 전달서 §6 ↔ 1단계 자동 검사 대응표

| 03 §6 항목 | 1단계 범위 | 잠근 테스트(ID) | 상태 |
|---|---|---|---|
| 게이트 −2 에 유효탄 3발 → +1, 통과 후 1명, 통과 뒤 재보상 없음 | ○ | V3-GATE(−2→+1·gateFlip / 통과 +1 / 통과 뒤 5발 불변 / squad 실제 결합) + V3-GATE-SCROLL 2건(스크롤 중 탄 위상 20분할 100% 명중) | 잠김 |
| 내구 10·보상 2 통 → 정확히 2명, 통 숫자를 병력에 더하지 않음 | ○ | V3-SUPPLY(10발 → 보상 1회·2명 / 11발째 무효 / squad 실제 결합 / 내구 4 통 한 STEP 10발 → 4발 소모) | 잠김(표시 분리는 §5 육안 항목) |
| 한 발이 앞의 통과 뒤의 게이트를 동시에 처리하지 않음 / 관통 무기 명세 | ○ / 관통 무기는 1단계 없음 | V3-ORDER(통이 흡수·게이트 불변 / 30발 → 2발 소모·28발 관통 / 격파된 잡졸은 같은 STEP 접촉 없음 / 보상이 사망보다 먼저) + V3-HEAVY 2건(폭발은 적 직격만·벽 반대편 제외) | 잠김 |
| 병사 1/10/30명에서 사격량·명중 분배 증가 | ○ | V3-FIRE 2건(2초 누적 탄 수 비례 / 30명 탄 x 열 ≥ 20·유닛 자기 위치) | 잠김 |
| 무기 보급 후 병사 무기 변경, 병력 손실로 강등 없음 | ○ | V3-WEAPON 3건(auto 교체·발사 간격 변경 / 30→1 뒤 유지 / 동급·하급 무시·heavy 교체) | 잠김 |
| 연속 증원: 활성화·발판 생성·발판당 1회·최대 생성량 | ○ | V3-CHAIN 11건(개봉→발판 5 / 유효탄 → +1 / maxPads 15 클램프 / 통과 시 발판당 1회 / locked / 다른 차선 불가 / 실제 사격 결합) | 잠김 |
| 벽 충돌·벽 끝 합류·가변 통로 | ○(고정 폭 분리벽) | V3-WALL 9건(x 240 무조작 진입 스냅·n=1/60 통로 안·벽 끝 해제(S2 실제) / 아군·적탄 벽 소멸 / 좌 shooter → 우 통로 탄 소멸 / 드래그 클램프 / compressUnits 상대 범위) | 잠김. "가변 통로"는 1단계에 없음(폭 고정) |
| 아레나 전환·상하좌우·자동 조준·보스 추격·복귀 | ✕ 2단계 | — | 범위 밖 |
| 보너스 종료/실패와 무관한 본전투 보상 유지 | ✕ 2단계 | — | 범위 밖 |
| 영웅 앞뒤·스킬·사망·기여도·드론 기여도 | ✕ 2단계 | — | 범위 밖 |
| 실패→강화→재도전 동일 스테이지·편성 복귀 | △ 강화 없음, 즉시 재도전만 | V3-RETRY(buildStage 재호출 초기값·참조 비공유) + V3-SHELL boot(결과 → 다음 작전 출격) + 브라우저 `retryClick`(결과 → 다시 도전 → z 초기화) | 재도전 부분 잠김, 강화 복귀는 범위 밖 |
| 새 저장/기존 저장/손상 저장/저장 권한 불가 | ○ | V3-SAVE 9건(새 저장·"abc"·{v:1}·stages:null·타입 강제·setItem 예외·getItem throw·깊은 병합·미주입) + V3-SHELL(저장 실패 → saveOk=false·결과 표시) + 브라우저 localStorage 실측 | 잠김 |
| 화면 숨김·pointercancel·포커스 상실 → 일시정지·입력 초기화 | ○ | V3-INPUT 2건(reset → dragging=false·dragDx=0) + V3-SHELL boot(blur → paused·드래그 해제, ESC) + 브라우저(blur·visibilitychange → paused) | 잠김. pointercancel 은 순수 입력 모듈까지만 자동 검사(실기기 항목 §5) |
| 30/60/120Hz 동일 규칙 결과 | ○ | V3-DETERMINISM 2건(dt 3초 → 5 STEP·16.7ms → 1 STEP / 30·60·120Hz + 불규칙 dt 동일 상태) + V3-SIM 결정성 | 잠김 |
| 실제 모바일 가독성(전방 숫자·내용물·적 범위)·후반 군단 성능 | ○ | 자동화 불가 | **사람 확인**(§5) |

계약서 8장 항목 중 테스트로 안 잠긴 것: 없음(8장 21묶음 전부 대응 테스트 존재. V3-SIM 은 S1·S2·S3 봇 완주 + 무조작 S1 + 결정성 5건).

## 5. 브라우저에서 사람이 확인할 항목(계약서 6장 기준)

파일: `rush3.html` 을 `python tools/nocache-server.py` 류 정적 서버로 열기(모듈 스크립트라 file:// 불가). 콘솔에서 `__rush3Dbg()` 로 상태 확인 가능.

- [ ] **HUD**: 좌상 `STAGE n 제목` + 남은 거리 m, 정예 등장 후 HP 막대+숫자(`정예 40 / 40`), 우상 무기 칩(소총/기관총/중화기 색·이름), 부대 발밑 병력 수, 중심 삼각 마커가 게이트 칸 판정 기준으로 보이는가
- [ ] **첫 플레이 안내**: 기록이 없는 상태(시크릿 창)에서 출격 후 3초 "좌우로 드래그 · 쏴서 숫자를 키우세요", 두 번째 출격부터는 안 뜸
- [ ] **게이트**: 칸 사각형 + 부호 숫자(+3 / −6 / 0) + 색(파랑/빨강/회색), 피격 시 흰 플래시·숫자 튐, 통과 뒤 흐림, 음수 통과 시 흔들림+빨간 비네트
- [ ] **보급 통**: 통 그림 위 내용물(병사 실루엣 n / 무기 아이콘 / 파란 설비) + **통 아래 주황 내구 숫자가 병력 수와 혼동되지 않는가**, 파괴 시 보상 팝(0.5초 떠오른 뒤 부대로 흡수), 미개봉 통과 시 "놓침"
- [ ] **연속 증원(S3 z 2800)**: 개봉 후 파란 발판 열 + "+1", 쏠 때마다 발판 추가(최대 15), 통과하며 발판당 +1
- [ ] **벽(S2 1800~3000, S3 6000~7200)**: 회색 분리대(상단 하이라이트), 무조작 진입 시 한쪽 통로 스냅, 대형이 통로 안으로 압축, 탄이 벽에서 사라짐
- [ ] **정예**: "정예 접근!" 0.8초 배너 + 효과음 + 보스 BGM 전환, 부채꼴 3발, S3 는 4초마다 잡졸 2 소환, 격파 즉시 승리 → 1.3초 뒤 결과
- [ ] **탄**: 무기별 색·폭(노랑/파랑/주황), 병사마다 자기 자리에서 나가는 탄 열, 적탄(마젠타 구슬)·저격 예고선
- [ ] **상태 전이**: title → run → paused(⏸ 버튼·ESC) → result(won/lost). result 에 성공/실패·생존·최고·시간·처치·놓친 것 한 줄·버튼 [다시 도전][다음 작전(성공 시)][스테이지 선택], 신기록 표시
- [ ] **저장 실패 문구**: 시크릿 창에서 localStorage 를 막고(DevTools → Application → Storage 차단 또는 쿼터 소진) "기록 저장 안 됨" 이 타이틀·결과에 뜨는가
- [ ] **입력**: 마우스 호버 = 절대 x(클릭 없이 따라옴), 터치 = 드래그 상대 이동(손가락 댄 자리로 부대가 튀지 않음), 두 손가락 혼입 시 첫 손가락만, ←→/A·D 키, ESC/⏸ 일시정지
- [ ] **자동 일시정지**: 탭 전환(visibilitychange)·창 이탈(blur)·pointercancel(모바일에서 드래그 중 알림 배너/홈 제스처) → 일시정지 + 드래그 해제. 복귀 후 재개 시 부대가 점프하지 않는가(acc 5 STEP 상한)
- [ ] **오디오**: 첫 터치 뒤 BGM 시작(타이틀/스테이지/보스), 발사음이 프레임당 1회·병력 많을수록 커짐(상한), crateHit/crateBreak/gateTick/gateFlip/joinMany(3명 이상)/weaponSwap/hurt/kill/elite/win/lose, 음량 −/+·음소거가 저장되는가
- [ ] **모바일 실기(03 §6 마지막)**: 세로 화면에서 전방 게이트 숫자·통 내용물·적 범위가 읽히는가, S3 후반(잡졸 12 + 저격수 2 + 정예 소환, 병력 100+)에서 프레임 유지 여부, DPR 3 기기에서 흐림 없음(백킹스토어 상한 2)
- [ ] **리사이즈/회전**: 창 크기 변경·가로↔세로 회전 후 캔버스가 다시 맞춰지고 클릭 좌표가 어긋나지 않는가

## 6. 남은 위험

1. **정예가 순간 격파된다(밸런스)**: 브라우저 실측에서 S1 정예(hp 40)가 등장 0.33초 만에 죽었다(도달 37.9s → 승리 38.23s; 기관총 20명 = 초당 80 피해 + 비행 중인 탄 84발). "정예 접근!" 배너(0.8초)와 HP 막대를 볼 시간이 없고 보스 컷 스크린샷도 못 찍혔다. 규칙 위반은 아니지만 계약서 5장 "정예 전투"의 체감이 없다. `balance.js`/`stages.js` 의 정예 hp 또는 등장 z(+760) 재조정 후보 — 결정은 이사님·기획.
2. **결과 화면 "놓친 것 한 줄"이 성공 시에도 표시**된다(계약서 6장은 "실패 시"). 성공 판에서는 흐린 색으로 "보급 통 1개를 놓침"이 나온다. 의도(복기 정보)일 수 있어 그대로 두었다 — 확인 필요.
3. **pointercancel 실기 검증 없음**: 자동 검사는 입력 모듈 reset 과 blur 경로까지. 실제 모바일에서 드래그 중 OS 제스처로 pointercancel 이 올 때 일시정지·드래그 해제를 눈으로 확인해야 한다.
4. **레거시 전체 스위트 5건 실패가 브랜치에 남아 있다**(§3). v3 와 무관하지만 CI 를 `tests/*.test.mjs` 전체로 돌리면 빨갛다. 3D 미커밋 작업(stage1-analytics worktree) 정리와 함께 별건으로 닫아야 한다.
5. **03 전달서 §7 요소별 완료 기록(V01~V54 표)** 은 이 검증 범위에 없어 만들지 않았다. 1단계 완료 보고 전에 02 문서 V 번호 ↔ 스테이지 대응표가 필요하다.
6. **오디오 자동재생**: 첫 pointerdown 에서 unlock 하므로 키보드만으로 시작한 판(Space)은 keydown 에서도 unlock 하도록 결선돼 있으나, 브라우저 정책상 keydown 이 사용자 제스처로 인정되지 않는 환경이 있을 수 있다(실기 확인 항목).

## 7. 산출물

- 이 보고서: `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\newmode\v3\build\verify-report.md`
- 브라우저 스모크 스크립트·결과: 같은 폴더 `browser-smoke.py`, `browser-smoke.json`, `shot-{title,run,paused,boss,result}-dpr{1,2}.png`
- 수정 파일: `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\rush3\main.js` (`lastStageId()` 가드, 3곳)
