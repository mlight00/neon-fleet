# §G-22 Codex 재검수 결함 수정 — 완료 보고서

- 작성일: 2026-08-09
- 작업 트리: `E:/workspace/claude/neon-fleet-worktrees/stage1-analytics` (브랜치 `claude/neon-fleet-analytics-stage1`)
- 기준: `클로드에게_줄_G22_수정작업지시서.md` (Codex 2차 독립 검수)
- 기준 HEAD `d987c27` — **commit / push / merge / 배포 없음.** G21 + G22 변경이 모두 미커밋 워킹 트리에 있다.

---

## 1. 수정 파일

| 파일 | 변경 |
|---|---|
| `js/projectile-visual-spec.js` | **신규 60줄.** 발사체 시각 사양의 단일 진실(2D `entities.js` 와 3D 어댑터가 함께 import) |
| `js/chase3d-config.js` | `shouldInit3D`/`INIT_ZOOM`(200% 트리거), `performanceProfileForViewport`(기기 프로필 통합), FPS 가드 `interrupted` 계약, 게이트에 zoomTarget |
| `js/chase3d-renderer.js` | `ctl.ready.{enemy,pickup,shot,ally,weapon}` 네임스페이스 + 중복 등록 진단, 갑판 포탑 절차 폴백 **즉시 부착 → GLB 교체+dispose**, tracer 코어 억제(`corePart`/`_sMHidden`), dispose best-effort, legacy context loss 계약 통일, `ENEMY_KEYS`/`PICKUP_KEYS` 고정 |
| `js/main.js` | 상태 0~4 + `_pendingChase3D` 프리웜 승격, 200% 트리거, 표본 제외 확장 + visibilitychange, 손실 renderer 다음 프레임 해제, 수집 헬퍼 모듈 스코프 이관, 스탬프/컬 분리, 아군 종류별 숨김, 보스 HUD 뷰 재사용 |
| `js/entities.js` | 중립 모듈 사용(색·크기 수식), 드론/순양함 숨김 분리 |
| `js/chase-render.js` | `hideDroneBody`/`hideCruiserBody` 전달(구 `hideEscorts` 호환) |
| `js/render.js` | `bossHudView`(풀 재사용) + `NO_BOSSES` 공유 빈 배열 |
| `js/chase3d-glb.js` | 진열 `stats()` 실제 삼각형·textureBytes + `revision`, 로드 실패 경고 |
| `js/chase3d-lab.js` | `revision` 우선 감지(개수 비교 폴백) |
| `js/chase3d-props.js` / `chase3d-shot-spec.js` / `chase3d-shot-place.js` | 중립 모듈 연동·코어 플래그 |
| `tests/` | G21 하드닝 테스트 폐기 → **`chase3d-g22-hardening.test.mjs` 신규 20종**, 기존 6파일 앵커 갱신 |

합계 `+742 / −268`(신규 파일 제외), 신규 4파일.

---

## 2. P0/P1/P2 항목별 해결 근거

### P0 §3.1 — 종류를 명시하는 준비 API
`chase3d-renderer.js:707-726`
```js
ctl.ready = {
  enemy: (k) => _hasMeshes(eswarm[k]),
  pickup: (k) => !!props && _hasMeshes(props[k]),
  shot: (k) => !!shots && _hasMeshes(shots[k]),
  ally: (k) => (k === 'a1' ? _hasMeshes(drone) : k === 'a2' ? _hasMeshes(cruiser) : false),
  weapon: (k) => !!(mounts3[k] && mounts3[k].ok && mounts3[k].meshes.length),
};
```
`ebullet` 처럼 이름이 여러 목록에 있어도 **잘못된 swarm 을 고를 수 없다**(호출부가 종류를 지정). 생성 직후 등록표를 훑어 같은 키가 두 종류에 등록되면 `console.error` 로 즉시 알린다(실측: 중복 0건).

### P0 §3.2 — 아군 준비 상태를 실제 2D 숨김에 연결
- `main.js:3096-3106` — 드론/순양함을 **따로** 판정해 준비된 종만 수집.
- `main.js:3213-3218` — `hideDroneBody: in3D && _c3dAllyDrone`, `hideCruiserBody: in3D && _c3dAllyCruiser`.
- `chase-render.js:86-92`, `entities.js:1216-1219, 1259` — 종류별 플래그로 분기.

**G21 결함**: `hideEscorts: t3d >= 0.5` 하나로 둘 다 숨겨, a1/a2 GLB 로딩 수 초 동안 드론·순양함이 2D·3D 어디에도 없었다.

### P0 §3.3 — 갑판 무기 준비 전 표시 보장
`chase3d-renderer.js:196-233` — **절차 포탑을 먼저 붙이고**(`attachMounts(rec, createTurretFallbackParts(...), false)`), GLB 도착 시 `swapMounts()` 로 교체하며 옛 인스턴스의 geometry/material/InstancedMesh 를 정확히 dispose. 실패 시 절차 포탑 유지. `info().weaponGlb` 로 절차/실모델을 구분해 진단.

### P0 §3.4 — sidecar 스탬프 위치 통일
`main.js:2925-2963`
- `passGate()` 에서 `_in3dMap.set()` **제거**. 화면 밖 컬은 별도 sidecar `_cullMap` + `cullPassed()` 로 분리, 2D 스킵은 `_skip2D`(3D 포함 ∪ 컬)로 합성.
- `putProp`/`put3D` 모두 **①종류·키 등록 → ②모델/폴백 준비 → ③버퍼 용량 → ④슬롯 기록** 이 전부 성공한 **직후에만** 스탬프.

**G21 결함**: 기함을 통과했지만 아직 화면 안인 개체가 3D 수집에 실패하면(모델 미준비·버퍼 초과) 이미 스탬프가 찍혀 있어 2D 도 스킵 → 통째로 사라졌다.

### P0 §4.1 — 150% 선로딩 제거
`chase3d-config.js:33-41`, `main.js:3017-3023`
```js
export const INIT_ZOOM = CHASE3D.FULL_ZOOM;                       // 2.00
export function shouldInit3D(zoomTarget) { return zoomTarget >= INIT_ZOOM - 1e-6; }
if (state === 'play' && run && !_c3dFps.tripped && shouldInit3D(camera.target)) requestChase3D();
```
**현재 배율이 아니라 줌 목표**를 본다 — 200% 로 보간되는 동안이 곧 로딩 여유다.

### P0 §4.2 — 초기화 상태 세분화 + 프리웜 승격
`main.js:226-266` — 0 idle / 1 module-loading / 2 renderer-created·prewarming / 3 ready / 4 failed.
renderer 는 `_pendingChase3D` 에 담고 **프리웜 완료 후에만** `chase3d` 로 승격한다. 프리웜 중에는 main frame 이 그 renderer 를 호출하지 않는다. 프리웜 실패는 `dispose()` 후 2D 유지(`reason='prewarm-failed'`). 자동 재시도 없음.
`chase3dFrameGate(..., camera.target)` 에 200% 조건을 넣어 "준비돼도 200% 미만이면 안 그린다"를 한 곳에 명시했다.

### P0 §5.1 — 기기 프로필 통합
`chase3d-config.js:150-171` — `performanceProfileForViewport(w, h)` → `{mobile, pixelRatioCap, minFps, lod}`.
기준을 renderer 가 이미 쓰던 **820px 하나**로 통일했고(G21 은 픽셀비율 820 / LOD·FPS "세로 && ≤500" 로 갈라져 있었다), main 이 세션 시작 시 1회 계산해 renderer 에 넘긴다(`opts.profile`). **고정 정책**: 리사이즈·회전으로 등급이 바뀌지 않는다(픽셀비율 요동·표본 기준선 혼입 방지). 등급 변경 경계는 새로고침.

### P0 §5.2 — 표본 제외 완성
`main.js:3196-3200` — `chase3dT > 0 && state==='play' && !paused && !drafting && !betweenStages && !cinematic && !document.hidden`.

### P0 §5.3 — visible 극저FPS를 버리지 않는다
`chase3d-config.js:186-215` — `maxDtMs` 폐기. 중단은 `visibilitychange` → `interrupted` 플래그로만 판단.
**G21 결함**: `dt > 500ms` 를 전부 탭 정지로 간주해 버렸고, 그 결과 **화면이 보이는 채로 1~2fps 로 기어가는 진짜 저성능**(프레임 간격 500~1000ms)이 영원히 트립되지 않았다 — 가드가 가장 필요한 상황을 정확히 놓쳤다.

### P0 §5.4 — dispose best-effort
`chase3d-renderer.js:769-802` — 자원별 `step()` try/catch, 순서 고정(리스너 → 모델 → 스웜 → 기함 홀더 → 파편 → 환경맵 → renderer), `finally` 에서 `available=false` · 캔버스 숨김 · 참조 해제를 보장. 오류는 최초 1회만 진단하고 게임으로 throw 하지 않는다.

### P0 §6 — tracer 코어 회귀
`chase3d-renderer.js:389-401`(생성, `corePart: 1`), `:557-566`(배치)
```js
if (sw.corePart === j && !o.core) im.setMatrixAt(i, _sMHidden);   // 0 스케일 = 이 인스턴스만 끈다
else im.setMatrixAt(i, _sM);
```
`_sMHidden` 은 1회 생성한 0-스케일 행렬(프레임 할당 0). `sp.core` 는 shot-spec 이 준다(tracer 0 / 발칸 1).
**G21 결함**: 발칸탄 스웜을 외곽+코어 2파트로 만들면서, 같은 스웜에 들어오는 드론 예광탄에도 흰 코어가 그려졌다(2D 예광탄에는 심이 없다).

### P1 §7 — context loss 계약 통일
- hero: 손실 즉시 `available=false` + `degraded=true` + `reason`, 캔버스 숨김(`chase3d-renderer.js:436-446`).
- **다음 안전 프레임에** main 이 dispose + 참조 해제(`main.js:3208-3214`) — 그리는 도중에 풀지 않는다.
- legacy 검증장면도 같은 계약(`chase3d-renderer.js:873-877`) — 개발 장면이라는 이유로 자동 복구를 남기지 않는다.

### P1 §8 — 발사체 단일 진실
- §8.1 기본 레이저색을 2D 실제 값 `#a8f0ff` 로 통일(G21 3D 는 `0x8fe8ff` 로 어긋나 있었다).
- §8.2 `js/projectile-visual-spec.js` 신설 — `entities.js`(2D)와 `chase3d-shot-spec.js`(3D)가 **같은 모듈**을 읽는다. 공유: 기본 탄색·발칸 레벨 배율·레이저 길이/폭·beamW 기준·코어 규격·예광탄 상자. 3D 전용 원근 압축만 어댑터에 남겼다.
- §8.3 `WIDTH_MUL_MAX=2.0` 근거를 수치로 고정: 가장 굵은 절단탄의 **월드 폭 1.066 unit** = §G-18 반려 폭(3.4×0.5=1.70)의 **63%**. 테스트가 `< 반려 폭의 70%` 를 잠근다.

### P1 §9 — 프레임 할당 제거
- `r.bosses.map()` → `bossHudView(r.bosses, _bossHudBuf, _bossHudName, ...)`(배열·엔트리 풀 재사용), 비보스 프레임은 공유 `NO_BOSSES`.
- renderer frame 의 `Object.keys(ENEMY3D)` → 모듈 상수 `ENEMY_KEYS`/`PICKUP_KEYS`.
- `draw()` 안 `passGate`/`putProp`/`putLabel`/`put3D` 클로저를 **모듈 스코프 함수로 이관**(참조 대상이 전부 모듈 변수라 동작 동일).

### P2 §10 — 검사실 통계·메시 등록
- `createGlbShowcase().stats()` 가 실제 삼각형 수와 `textureBytes` 를 센다(G21 은 `triangles: 0` 고정 + textureBytes 누락 → `texMB NaN`).
- UI 도 `Number.isFinite` 가드로 `n/a` 표기.
- `revision` 을 제공해 검사실이 개수 비교가 아니라 개정 번호로 새 메시를 감지한다(같은 수의 메시 교체도 잡힌다). 개정 번호가 없으면 개수 폴백.

---

## 3. 자동 테스트

**890 통과 / 0 실패.** G21 하드닝 19종을 폐기하고 `tests/chase3d-g22-hardening.test.mjs` **20종**으로 재작성했다.

| 이름 | 검증 대상 |
|---|---|
| G22-URL | URL 15행 우선순위 |
| G22-INIT | **150% 미로드 / 200% 요청에서만 초기화** |
| G22-PROFILE | 7개 뷰포트에서 renderer·가드 프로필 일치(820px 단일 기준) |
| G22-FPS1 | 60fps 20초 미트립 |
| G22-FPS2 | 35fps — 모바일 미트립 / 데스크톱 트립 |
| G22-FPS3 | **visible 1fps·2fps 트립**(G21 회귀 잠금) |
| G22-FPS4 | hidden 4초 복귀 미트립(interrupted 계약) |
| G22-FPS5 | 드래프트 20초 warm-up 미진행 |
| G22-2D1 | **실제 `Bullet.draw()`** — 예광탄 2×8 청록, **흰 코어 없음** + 3D `core=0` |
| G22-2D2 | 실제 draw — 발칸 진화색 외곽 + 백열 코어 + 3D `core=1` |
| G22-2D3 | 실제 draw — 레이저 폭=beamW×2, 길이=34+lv×8, 기본색 2D=3D |
| G22-2D4 | 중립 모듈이 `COLORS.ally` 와 일치 |
| G22-SIZE | 5개 깊이 크기·굵기 위계 + 상한 근거 수치 |
| G22-PLACE | **production 2.5D 투영 → 3D 배치 → 재투영 오차 ≤ 2px**(다른 두 모듈의 좌표 규약 일치) |
| G22-DEPTH | 깊이 클램프·단조성·진행각 부호 |
| G22-ALLOC1 | `bossHudView` 600프레임 배열·엔트리 재사용 |
| G22-ALLOC2 | `drawHUD` 에 filter/map/slice 접근 시 throw 하는 Proxy |
| G22-CINE1 | 게이트 10조합(200% 미만 미표시 포함) |
| G22-CINE2 | 상태 전이 48프레임 기함 정확히 1척 |
| G22-CINE3 | **production main 이 `flagshipLayer`·`chase3dFrameGate` 를 실제 호출** |

G21-PLACE 의 자명함(unproject→project 항등) 지적은 **다른 모듈 간 일치 검사**로 교체해 해소했다.

---

## 4. URL·줌별 renderer/GLB 요청 수 (실측 · localhost:8345)

| URL | GLB | three.js | renderer | lab | `#game3d` |
|---|---:|---:|---:|---:|---|
| (쿼리 없음) | **0** | 0 | 0 | 0 | 없음 |
| `?chase3d=0` | 0 | 0 | 0 | 0 | 없음 |
| `?playtest=prolific` | 0 | 0 | 0 | 0 | 없음 |
| `?coreLoopMeasure=1` | 0 | 0 | 0 | 0 | 없음 |
| `?campaign25=1` | 0 | 0 | 0 | 0 | 없음 |
| `?fleetlab=1` | 0 | 0 | 0 | 0 | 없음 |
| `?bosslab=1&boss=B14` | 0 | 0 | 0 | 0 | 없음 |
| `?chase3dTest=1` 단독 | 0 | 0 | 0 | 0 | 없음 |
| `?chase3dLab=hazards` 단독 | 0 | 0 | 0 | 0 | 없음 |
| `?chase3d=1&chase3dLab=hazards` | 4 | 1 | 0 | 1 | 있음 |

**줌 단계별(§4.3 합격 조건)**

| 상태 | cur/target | renderer JS | GLB | three | `#game3d` | phase |
|---|---|---:|---:|---:|---|---|
| 타이틀 | 1.00 / 1.00 | 0 | **0** | 0 | 없음 | 0 idle |
| 100% 플레이 | 1.00 / 1.00 | 0 | **0** | 0 | 없음 | 0 |
| **150% 요청** | 1.50 / 1.50 | 0 | **0** | 0 | 없음 | 0 |
| **150% 2초 유지** | 1.50 / 1.50 | 0 | **0** | 0 | 없음 | 0 |
| 200% 요청 직후 | 1.50 / 2.00 | 로드 시작 | 0 | 0 | 생성 | 1 module-loading |
| 200% 준비 완료 | 2.00 / 2.00 | 1회 | 37 | 1 | 있음 | **3 ready**(prewarm done) |
| 220% | 2.20 / 2.20 | 재사용 | 37(중복 0) | 1 | 있음 | 3 |

---

## 5. GLB 지연/404 전후 표시 결과 (fetch 주입)

주입: `a1_model`·`a2_model`·`w1_model` **5초 지연**, `w2_model` **404**.

| 경과 | a1 준비 | a2 준비 | 발칸 포탑 | 레이저 포탑 |
|---|---|---|---|---|
| 919ms | **false** | **false** | **true (절차 폴백)** | **true (절차 폴백)** |
| 2.3s ~ 5.0s | false | false | true (절차) | true (절차) |
| **5.9s** | **true** | **true** | **true (GLB 교체)** | true (절차 유지 — 404) |
| 11.5s | true | true | true (GLB) | true (절차) |

- 아군: 지연 동안 준비 false → **2D 드론·순양함이 계속 보인다**(3D 수집 대상에서 빠짐). 준비되면 3D 로 1회 교체.
- 갑판 무기: **로딩 첫 프레임부터 절차 포탑이 서 있다**(G21 은 5초 내내 비었다). GLB 도착 시 교체, 404 는 절차 유지 — 영구 공백 없음.
- 훅 계수: delayed 3, failed 1.

**tracer 코어 실제 표시(§6 필수 — 실제 instance matrix 검사)**
실플레이 41발(예광탄 13 / 발칸 28) 상태에서 씬의 InstancedMesh 를 직접 읽었다.

| 메시 | count | 0-스케일 인스턴스 |
|---|---:|---:|
| 발칸탄 외곽 | 41 | **0** |
| 발칸탄 코어 | 41 | **13** |

0-스케일 13 = 예광탄 13발과 정확히 일치 → **예광탄에는 흰 코어가 그려지지 않고, 기함 발칸에는 그려진다.**

---

## 6. FPS 프로필별 하한과 트립 결과 (실행 테스트)

| 뷰포트 | 프로필 | 하한 | renderer·가드 일치 |
|---|---|---:|---|
| 390×844 | mobile | 30 | ✅ |
| 500×900 | mobile | 30 | ✅ |
| 600×900 | mobile | 30 | ✅ (G21 은 데스크톱으로 오분류) |
| 800×450 | mobile | 30 | ✅ |
| 820×600 | mobile | 30 | ✅ |
| 821×600 | desktop | 45 | ✅ |
| 1280×800 | desktop | 45 | ✅ |

| 시나리오 | 결과 |
|---|---|
| 60fps 20초 | 미트립 |
| 35fps 모바일(하한 30) | 미트립 |
| 35fps 데스크톱(하한 45) | 트립 |
| **visible 2fps** | **트립**(경과 ≥ warm-up + 창 2개) |
| **visible 1fps** | **트립** |
| hidden 4초 후 복귀 | 미트립, strike 0 |
| drafting 20초 | warm-up 미진행 |

브라우저 실측: pane 이 숨김이라 `document.hidden === true` → 표본에서 제외되어 strike 0 유지(제외 계약 자체는 실측 확인).

---

## 7. context loss 와 dispose 결과 (실측)

| | available/ctl | phase | reason | canvas | 게임 |
|---|---|---|---|---|---|
| 손실 전 | available=true | 3 ready | `''` | visible | 진행 |
| 손실 후 첫 안전 프레임 | **ctl=null(해제 완료)** | **4** | `context-lost` | hidden, opacity 0, t3d 0 | **계속 진행**(탄 40) |
| 60프레임 뒤 | ctl=null | 4 | — | hidden | 진행 |

**dispose 중간 throw**: 씬의 InstancedMesh 2개의 `geometry.dispose` 를 강제로 throw 하게 만든 뒤 손실 유발 →
`ctl=null`, `phase=4`, 캔버스 hidden, **게임 정상 진행(탄 28)**. 나머지 자원 정리와 상태 마감이 계속됐다(§5.4 `finally`).

---

## 8. console / 요청 실패

- console **error 0건**, page error 0건, 네트워크 실패 0건(404 는 fetch 훅이 만든 합성 응답).
- 경고는 의도된 것만: `GLB 로드 실패 → 폴백: w1/w2/w4_model.glb`(파일당 **1회**), `WebGL 컨텍스트 손실 → 2D 고정`(1회).
- **준비표 키 중복 등록 진단은 한 번도 발화하지 않았다**(등록 충돌 없음).
- 로그 순서로 프리웜 승격이 확인된다: `프리웜 {done:true}` → `실제 3D 사용 가능`.

---

## 9. 포털 빌드

```
파일 수 : 278 / 1500
압축 전 : 47.65 MB / 50 MB
ZIP     : 43.24 MB
```

---

## 10. 남은 미검증 사항

1. **스크린샷 A/B 미수행** — Browser pane 이 숨김 상태(`document.hidden=true`)라 컴포지팅이 멈춰 캡처가 타임아웃된다. tracer 코어·레이저 lv1/lv3/cutter 굵기는 **인스턴스 행렬·수치로만** 확인했다. 육안 확인은 이사님 실기가 필요하다.
2. **실브라우저 저FPS 트립 미수행** — 같은 이유로 rAF·GPU 부하를 만들 수 없었다. 가드 로직은 실행 테스트 5종으로 검증했고, 배선(표본 조건·트립 후 dispose)은 코드 경로로만 확인했다.
3. **절차 포탑의 형태** — 준비 상태·교체·dispose 는 실측했으나 생김새는 검사실에서 따로 봐야 한다.
4. **프로필 고정 정책의 영향** — 픽셀비율 기준을 캔버스 폭에서 뷰포트 폭으로 옮겼다. 데스크톱(뷰포트 >820px)에서 픽셀비율 상한이 1.0 → 1.5 로 올라가 GPU 부하가 늘어난다. 의도한 통합이지만 저사양 데스크톱 실측이 없다.
5. **`800×450` 가 모바일 프로필** — 820px 단일 기준의 결과다. 작은 가로 데스크톱 창이 LOD1·30fps 하한을 받는다. 지시서는 "renderer 와 가드가 같을 것"만 요구했고 그 조건은 만족하나, 등급 자체가 적절한지는 판단이 필요하다.

---

## 11. Git 상태 · 발행 여부

```
$ git status --short
 M js/chase-render.js
 M js/chase3d-config.js
 M js/chase3d-glb.js
 M js/chase3d-lab.js
 M js/chase3d-prop-defs.js
 M js/chase3d-props.js
 M js/chase3d-renderer.js
 M js/entities.js
 M js/main.js
 M js/render.js
 M tests/chase3d-allies.test.mjs
 M tests/chase3d-b1.test.mjs
 M tests/chase3d-b2.test.mjs
 M tests/chase3d-b5b6.test.mjs
 M tests/chase3d-hero-wiring.test.mjs
 M tests/chase3d-lifecycle.test.mjs
 M tests/feedback-0722.test.mjs
?? docs/2026-08-08-Claude-G21-Codex수정-완료보고서.md
?? docs/2026-08-09-Claude-G22-Codex수정-완료보고서.md
?? js/chase3d-shot-place.js
?? js/chase3d-shot-spec.js
?? js/projectile-visual-spec.js
?? tests/chase3d-g22-hardening.test.mjs
```
`git diff --check` 통과. **commit / push / merge / 배포 전부 하지 않았다.** HEAD 는 `d987c27` 그대로.

---

## 12. 게임 규칙 불변 확인

- `balance.js`·`logic.js`·`chunks.js`·`collision.js`·`affixes.js` 등 규칙·판정·스폰·보상 파일 **무변경**.
- `entities.js` 변경은 **그리는 값의 출처만** 중립 모듈로 옮긴 것이다. 값 자체는 동일:
  `beamW = squadLaserBeamW(level)` = `3 + level*1.5`, 예광탄 `(x-1, y-5, 2, 8)`, 코어 `(-1.4, -h*0.46, 2.8, h*0.92)`.
  beamW 는 판정에 쓰이지 않는다(충돌 반경은 `BAL.bullet.radius`).
- 3D 경로에 `Math.random()` 추가 없음(결정적 LCG 유지). 게임 객체에 렌더 필드 추가 없음(`WeakMap` sidecar 2종).
- 890개 테스트에 게임 규칙 회귀 없음.
