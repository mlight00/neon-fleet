# 06 — 기존 테스트 3종 분석 (rush-core / rush-sim / rush-meta)

작성일: 2026-09-09
분석 기준 코드: 브랜치 `claude/starforge-v3`, HEAD `c11922f` (2026-09-07)
대상 파일:
- `tests/rush-core.test.mjs` (78줄, 7 테스트)
- `tests/rush-sim.test.mjs` (256줄, 17 테스트)
- `tests/rush-meta.test.mjs` (91줄, 8 테스트)

실행 확인: `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → **32/32 통과, 2.16초** (Node v24.14.0). SIM-FULLRUN 한 건이 1.7초로 거의 전부를 차지한다.

대표 판정: **손봐서 재사용(adapt)**. 결정성·저장·연출 상태기계·헬퍼 패턴은 그대로 가져가고, 게이트 사칙·트랙 생성·티어 진화·병력=화력 모델을 잠근 테스트는 v3 규칙과 정면으로 충돌하므로 해당 모듈과 함께 교체한다.

---

## 0. 실행 명령과 테스트 스타일

| 항목 | 내용 | 근거 |
|---|---|---|
| 전체 실행 | `node --test tests/*.test.mjs` | README.md:151 |
| 부분 실행 | `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` | 본 분석에서 실측 |
| package.json | **없음** (`git ls-files`에 package.json 0건) → `npm test` 불가, node 직접 호출 | 실측 |
| 러너 | `node:test`의 `test()`만 사용, `describe`/suite 없음(suites 0) | 각 파일 2행 |
| 단언 | `node:assert/strict` (`assert.equal/deepEqual/ok/match`) | 각 파일 3행 |
| 제목 규약 | `'ID-태그: 한국어 설명'` (예 `RNG-DET:`, `COMBAT-BEAM-BURN:`) — ID로 검색·인용 | 전 파일 |
| 난수 | 전부 `mulberry32(seed)` 주입. 전역 Math.random 금지 | rng.js:1, combat.js:1 |
| 헬퍼 | 인라인 클로저만. `memStorage()`(Map 기반 localStorage 대체) | rush-meta.test.mjs:10-11 |
| 공용 lib | `tests/lib/`(frame-smoke-harness, pointer-sim)·`tests/fixtures/`는 **rush 3종이 사용하지 않음** | 실측 |
| 상태 조작 | 상태 객체를 직접 변형해 장면을 만든다(`st.enemies[0].x = 240; …hp = 0`) | rush-sim.test.mjs:44, 98 |
| 동적 import | DOM 없이 import 가능함을 검증할 때 `await import()` | rush-sim.test.mjs:47, 181 |
| 시간 | `dt`를 1/30 또는 1/60으로 임의 지정, 프레임률 등가성 검증 없음 | rush-sim.test.mjs:46, 57 |
| 취약대조 래칫 | `tests/test-quality-ratchet.test.mjs`가 소스 문자열 정규식 대조를 상한 102로 잠금(하한 97). rush 3종은 이런 대조가 **0건**(전부 실행 기반) | test-quality-ratchet.test.mjs:23, 27, 46-52 |

**주의 — 이름 충돌:** `tests/rush.test.mjs`는 스타포지 러시가 아니라 구 네온함대의 "NEON RUSH" 배수 테스트(`js/entities.js`, 2026-07-12 e90aba4)다. v3 테스트 파일명은 `rush-*`와 구분되는 접두(예 `sfr3-*`)를 쓰는 편이 안전하다.

---

## 1. (a) export 목록과 시그니처·용도

테스트 파일 3종은 **아무것도 export하지 않는다.** 이 절은 "테스트가 잠그는 모듈 표면", 즉 테스트가 import하는 함수의 실제 시그니처를 소스에서 확인해 적는다.

### rush-core가 잠그는 표면

| import | 시그니처 (소스) | 용도 |
|---|---|---|
| `mulberry32(seed)` | → `() => number[0,1)` | rng.js:2 |
| `hashSeed(str)` | → uint32 (FNV-1a) | rng.js:13 |
| `dateSeed(d = new Date())` | → `{ key:'YYYY-MM-DD', seed }` | rng.js:19 |
| `applyGate(count, gate)` | → `clamp(0, 999, round(op 결과))` | gates.js:8-16 |
| `makeGatePair(rnd, t, guaranteeGood=false)` | → `{ left, right }` | gates.js:34 |
| `isGood(op)` | add/mul이면 true | gates.js:5 |
| `GATE_OPS` | `['add','mul','sub','div']` | gates.js:4 |
| `BAL` | 수치 단일 진실 객체 | balance.js:2 |
| `buildTrack(seed)` (동적) | → `{ events, length }` | track.js:27, 90 |
| `zonePool(zone)` (동적) | → 적 kind 배열(신규종 가중 2배) | track.js:18 |

### rush-sim이 잠그는 표면

| import | 시그니처 (소스) | 용도 |
|---|---|---|
| `tierFor(count)` | → 0..4 | squad.js:4 |
| `tierStep(curTier, count)` | 상승 즉시, 하강은 `tiers[t]*demoteRatio` 미만일 때 | squad.js:32 |
| `formation(count)` | → `[{x,y}]`, index 0 = 히어로, drawCap 상한 | squad.js:12 |
| `clampX(x)` | → 80..400 | squad.js:29 |
| `displayUnits(count)` (동적) | 12까지 1:1, 이후 7:1, 최대 50 | squad.js:42 |
| `squadRadius(count)` | → px, 혼자면 heroSize/2 | squad.js:48 |
| `createCombat()` | → 전투 상태 객체 | combat.js:4 |
| `spawnWave(st, kind, n, rnd, hpMult=1, zone=0, lane=null)` | 적 n기 push | combat.js:8 |
| `spawnBoss(st, troopCount, zone)` | `hp = hpByZone[zone]` (troopCount **미사용**) | combat.js:30-33 |
| `stepCombat(st, squad, dt, rnd)` | → `{ troopLoss, events }` | combat.js:46, 325 |
| `hitButton(buttons, x, y)` (동적) | → 버튼 id \| null | main.js:17 |
| `gateHitSide(squadX)` (동적) | `x < 240 ? 'left' : 'right'` | main.js:22 |

### rush-meta가 잠그는 표면

| import | 시그니처 (소스) | 용도 |
|---|---|---|
| `createSave(storage)` | → `{ get(), patch(obj) }`; 키 `'starforgeRush.v1'` | save.js:2, 5, 19-22 |
| `upCost(track, lvl)` | → 비용 \| null(상한) | upgrades.js:4 |
| `buy(save, track)` | → boolean, 코인 차감+레벨 +1 | upgrades.js:10 |
| `effects(up, isDaily)` | → `{ startCount, fireRateMult, magnetMult, moveMult }` | upgrades.js:19-27 |
| `todayKey(d)` / `isFirstRunToday(data, key)` / `shareText(key, best)` | 날짜키·첫판·자랑문구 | daily.js:2, 6, 8 |
| `recordWatcher(best)` | `.update(count)` → `'break'` 1회 \| null | fx-state.js:4 |
| `slowmoCtl()` | `.update(count, dt)` → 시간배율 | fx-state.js:13 |
| `continueToken(isDaily)` | `.canUse()` / `.use()` | fx-state.js:23 |
| `SPRITE_KEYS` | 30개 키→파일명 | sprites.js:2-17 |

---

## 2. (b) 내부 데이터 형태 (테스트가 만지는 객체 필드)

### 전투 상태 `createCombat()` — combat.js:5
```
{ enemies:[], bullets:[], eshots:[], pools:[], boss:null, fireT:0, coins:0, kills:0, powCd:0 }
```
`fireSeq`는 첫 발사 때 지연 생성(combat.js:65).

- **적** (combat.js:16-26): `{ kind, zone, hp, r, x, y, vx, vy, shootT?, hopT?, hopDur }` + 실행 중 추가 `touched, picked, emitT, aimT, aimX, aimY, hopVx`.
- **보스** (combat.js:34-35): `{ zone, hp, max, x, y, r, dir, shootT, touchT, spawnT }` + `rage, phase2, ramT, ramPhase, sweepPhase, sweepWarnT, warnX, diveHit, poolT, hookT`.
- **아군 탄** (combat.js:69): `{ x, y, vy, w, tier }` + `vx`(자기장, :87) + `dead`.
- **적탄** (combat.js:42): `{ x, y, vx, vy, dmg, shape }`; 갈고리형(:225) `{ x, y, baseX, vx, vy, hook:true, swing }`; 소각 시 `dead:true`(:160).
- **장판** (combat.js:218): `{ x, y, warn, life, tick }`.

### `stepCombat`의 squad 입력 — 단일 count 모델
테스트는 **평범한 객체**를 넘긴다: `{ x, count, fireRateMult, tier?, radius?, beam? }` (rush-sim.test.mjs:45, 165, 232). combat.js가 읽는 필드: `x`(:67), `count`(:53, :60), `fireRateMult`(:58), `tier`(:51), `radius`(:50, 기본 60), `beam`(:153).
화력 공식(combat.js:53, 60): `bulletDmg = (1 + count×0.012) × tierDmgMult[tier] / muzzles`, 발사 간격 `= 0.5 / (fireRateMult × min(7, sqrt(count)))`. 즉 **병력 수가 한 자루 탄의 위력·연사로 환산**된다 — v3 5-2가 바꾸겠다고 명시한 바로 그 구조.

### `stepCombat` 반환 — combat.js:325
`{ troopLoss:number, events:[] }`. 이벤트 타입: `fire`(:73) · `pow`(:144) · `powDrop`(:283) · `kill {x,y,r,kind,touched}`(:285) · `supply {x,y,n}`(:288) · `steal {n}`(:299) · `bossKill`(:318) · `hurt {n}`(:324).

### 트랙 `buildTrack(seed)` — track.js:90
`{ events:[{ z, type:'gatepair'|'wave'|'boss', data }], length:57000 }`
- gatepair data: `{ left:{op,value,greed?}, right:{…} }` (track.js:52, 61, 74)
- wave data: `{ kind, n, lane?:'L'|'R', escort?:{ gateZ, dy } }` (track.js:55, 62, 84)
- boss data: `{ zone }` (track.js:87)
- **게이트 HP/파괴 플래그는 트랙이 아니라 main.js가 실행 중 심는다**: `g.hp`(main.js:125), `g.broken`(main.js:134).

### 게이트 — gates.js:24-29
`{ op:'add'|'sub'|'div', value }`. `mul`은 `GATE_OPS`·`applyGate`에는 남아 있지만 생성기는 **더 이상 만들지 않는다**(gates.js:23-24 "곱하기 게이트 폐지 2026-09-02"). 값은 항상 양수, 부호는 `op`가 담당 — v3의 signed value와 표현이 다르다.

### 저장 — save.js:2-3
키 `'starforgeRush.v1'`, 기본값 `{ best:0, coins:0, up:{ startTroops, fireRate, magnet, moveSpeed }, daily:{}, lastPlayDay:'' }`. `patch`는 얕은 병합(save.js:21) — 중첩 `up`은 호출자가 통째로 넘겨야 한다(rush-meta.test.mjs:31이 그 관행을 보여준다).

### BAL 키 (BAL-SHAPE가 요구) — balance.js
`track`(:4) `squad`(:7-10) `tiers`(:11) `demoteRatio`(:12) `gates`(:13-18) `enemies`(:19-40) `boss`(:42-43) `bosses`(:44-50) `coins`(:51) `fx`(:52-54) `upgrades`(:55-60).

### 스프라이트 키 — sprites.js:2-17
정확히 30개: 아군 `m1..m5, soldier, mfront` · `supply, pow` · 적 10 · 보스 5 · `gate` · `bg1..bg5`.

---

## 3. 테스트별 잠금 규칙과 v3 판정 (c)

판정 기호: **유지**=그대로 재사용 / **손봄**=원칙은 유지하되 단언·입력을 v3에 맞게 고침 / **교체**=v3 규칙과 충돌, 모듈과 함께 폐기하고 새로 씀.

### rush-core.test.mjs

| # | 테스트 (줄) | 잠그는 규칙 한 줄 | v3 판정 | 근거 |
|---|---|---|---|---|
| 1 | RNG-DET (8-14) | 같은 시드=같은 수열, 다른 시드=다른 수열, 값 ∈ [0,1) | **유지** | v3 4C 일일 코스·재도전 동일 배치(03 §3) |
| 2 | RNG-DATE (16-22) | dateSeed는 날짜에만 의존, key='YYYY-MM-DD', hashSeed 결정적 | **유지** (+추가) | 03 §5 "일일 코스에 stageVersion+날짜/시드" → 시드 입력에 버전을 섞는 테스트를 **추가** |
| 3 | GATE-APPLY (24-29) | add/mul/sub/div 사칙, 하한 0, div 올림 | **교체** | v3 5-3: signed value의 피격 +1·통과 시 적용. mul/div는 "검증 전 실험용" |
| 4 | GATE-PAIR (31-44) | 쌍은 두 연산이 다르고 값>0, 후반일수록 큼 | **교체** | v3 5-3 "고정 2개 쌍으로만 생성하지 않는다", 12장 "직접 설계한 1/2/3칸" |
| 5 | TRACK-DET (46-66) | 시드→동일 트랙, z 정렬, 길이 57000, 보스 5, 게이트쌍≥6, 적 종류≥6, 구간1 침범 금지, zonePool 누적 | **교체** (결정성 원칙만 계승) | 03 §2 track.js "스테이지 정의를 읽는 생성기", 8장 "무작위 생성으로 채우지 않는다". "같은 입력→deepEqual" 형태의 단언은 새 생성기에도 그대로 옮긴다 |
| 6 | BAL-SHAPE (68-73) | BAL 9개 키 존재, `tiers=[1,60,180,360,700]` | **손봄** | 키 존재 검사는 유지(03 §2 balance.js "무기·보급·스테이지·영웅·드론별"로 키 목록 갱신). `tiers` 단언은 5-6 폐지 → 삭제 |
| 7 | GATE-CAP (75-78) | 병력 상한 999, 상한에서도 감소 적용 | **교체** | 10장 "성능 측정 없이 999명을 약속하지 않는다", 초기 150명 실측 |

### rush-sim.test.mjs

| # | 테스트 (줄) | 잠그는 규칙 한 줄 | v3 판정 | 근거 |
|---|---|---|---|---|
| 1 | SQUAD-TIER (11-14) | 티어 임계 1/60/180/360/700 | **교체(폐기)** | 5-6 "병력 기준 M1~M5 자동 진화를 핵심 성장 규칙에서 내린다" |
| 2 | SQUAD-FORM (16-30) | 링 군집, 히어로 (0,0), 전방 ±36° 개방, 중복 없음, drawCap 상한 | **손봄** | 5-1 "통로 폭에 맞춰 대형을 줄인다", 6장 전방 2·후방 3 편성. "겹치는 자리 없음"·상한은 유지, 링·전방 개방은 폐기 |
| 3 | SQUAD-CLAMP (32-38) | 중심 x는 80..400, 게이트 총폭=이동폭 320 | **교체** | 5-1 분리벽·2차선·3갈래·좁은 다리 → 고정 폭 전제 붕괴 |
| 4 | COMBAT-KILL (40-50) | 30명이 사선 고정 적 3기를 10초 안에 전멸, kills=3, coins≥3 | **손봄** | 원칙(사격→격파→통계) 유지. 입력이 `{count:30}` 단일 객체 → 5-2 "병사 1명당 1개의 논리적 사격 주체"로 바뀌면 `squadUnits` 입력으로 재작성. 03 §6 "1/10/30명에서 유효 사격량 증가" 검사로 확장 |
| 5 | COMBAT-TOUCH (52-60) | 적이 부대 줄에 닿으면 손실≥1, 적은 자폭 소모 | **손봄** | 5-2 "실제로 노출된 구성원이 피해". 접촉=자폭은 5-7 돌격체 규칙과 재정의 필요 |
| 6 | COMBAT-BOSS (62-79) | 보스 HP=hpByZone[zone], **병력 무관**, 구간1<구간5, 격파 코인 | **손봄** | 5-8·12장 "스테이지 기준 고정 HP"와 **이미 일치**(9/6 5028f06). zone→stageId 매핑만 교체. ※03 전달서는 9/3 압축본 기준이라 "병력 비례"가 현행이라고 전제하지만 HEAD는 이미 고정 HP |
| 7 | BOSS-HOOK-GATE (81-91) | b2 갈고리는 HP 60% 이하부터 | **손봄(조건부)** | 5-8 도로 보스 "역할별 패턴". 갠트리 위도우를 v3 보스로 남기면 유지, 아니면 폐기 |
| 8 | COMBAT-NEW (93-109) | 스폰포드 사망→스크랩비트 3, 마그넷헤드 도주→코인 5 도난 | **손봄(조건부)** | 5-7 적 6분류에 직접 대응 없음. 11장 "미술은 역할이 읽히면 재사용" → 적 명단 확정 후 결정 |
| 9 | COMBAT-ESHOT (111-118) | 적탄이 줄에 닿으면 손실 1, 탄 제거 | **손봄** | 5-2 구성원별 피격, 5-7 "탄과 충격 범위 구분" |
| 10 | SIM-FULLRUN (120-178) | 봇이 10시드 중 ≥3 완주; main.advance 규칙을 **테스트 안에서 복제**(z 전진·게이트 선택·웨이브/호위·보스 1:1·이동 상한·히스테리시스·보급 합류·이어하기 1회) | **교체** | 03 §2 main.js "진행 함수를 브라우저와 테스트가 공유", §6 "실제 게임 진행 함수를 사용". v3는 3개 고정 스테이지 각각 "시작→결과→재시작 완주"(03 §1)로 바뀜 |
| 11 | MAIN-HELPERS (180-187) | main.js는 DOM 없이 import 가능; hitButton 히트; gateHitSide x<240=left | **손봄** | DOM-free import 원칙(main.js:2)·hitButton 유지. gateHitSide는 5-3 "부대 중심 기준 1칸"(1/2/3칸)으로 교체 |
| 12 | SQUAD-RADIUS (189-199) | 반경 ∝ 병력, 혼자면 heroSize/2, 60px 옆 탄은 빗나감 | **손봄** | "그림과 판정 일치"(10장)는 유지. 단일 반경 → 5-2 구성원별 판정("그림보다 약간 작은 범위")으로 재정의 |
| 13 | SQUAD-DISPLAY (201-208) | 표시 축약 12→7:1→최대 50 | **교체** | 999 상한·숫자=화력 모델에 묶인 수치. 10장 150명 실측 후 재설정 |
| 14 | COMBAT-BOSS-TOUCH (210-226) | 보스 접촉은 `rad·0.5 + r·0.7` 안에서만 | **손봄** | 원칙 유지, 구성원별 판정으로 이관. 아레나 보스(5-8)는 상하좌우 이동이라 별도 |
| 15 | COMBAT-BEAM-BURN (228-234) | 소각(dead) 적탄은 같은 프레임에 명중 불가 | **손봄** | 03 §4가 명시 계승("삭제/소각된 탄은 같은 프레임 나머지 처리에서도 제외"). 트리거가 버스터(`beam:true`)인데 5-6에서 버스터는 선택적 → 트리거만 바꾸고 단언은 유지 |
| 16 | COMBAT-STALE (236-244) | 줄을 이미 지난 탄·적은 옆걸음에 맞지 않음 | **손봄** | 03 §4 "이전 위치와 현재 위치 사이의 이동 경로" 판정으로 확장 |
| 17 | TIER-HYST (246-256) | 강등 완충 75% | **교체(폐기)** | 5-6·12장 "병력 상실 시 즉시 강등 → 획득 무기는 판 끝까지 유지" → 히스테리시스 자체가 무의미 |

### rush-meta.test.mjs

| # | 테스트 (줄) | 잠그는 규칙 한 줄 | v3 판정 | 근거 |
|---|---|---|---|---|
| 1 | SAVE-ROUNDTRIP (13-21) | patch→새 createSave가 읽음, up 기본값 채움 | **유지** (+추가) | 03 §5 "best·coins·up 레거시 보존". 손상 JSON·storage 예외·새 버전 키·백업값(03 §5, §6)은 **추가 테스트** |
| 2 | UP-BUY (23-34) | 비용표, 차감, 잔액 부족 false, 상한 null/false | **손봄** | 레거시 데이터 보존 대상. 03 §2 upgrades.js "순수/캠페인 성장 분리·기존 업그레이드 처리 방침 명시" 결정 후 유지 여부 확정. upgrades.js:1 주석 "3트랙 고정"은 이미 4트랙(moveSpeed)이라 낡음 |
| 3 | UP-EFFECT (36-40) | 효과 환산, 오늘의 도전은 중립(startCount 1 등) | **손봄** | `isDaily` 중립 분기를 "순수 모드 전체"로 일반화(01 4A, 03 §5 "순수 전투에 성장 효과 유입 금지") |
| 4 | DAILY (42-47) | todayKey 형식, 첫판 판정, 자랑문구 정확 일치 | **손봄** | todayKey/isFirstRunToday 유지. `shareText` 정확 문자열은 12장 "결과=작전 결과·보상·기여도"로 문구 변경 예정 |
| 5 | FX-RECORD (49-54) | best 갱신 순간 1회만 'break' | **손봄** | 4A "최고 생존 병력 기록"은 남되 11장 "최고 병력 HUD 고정 규칙 내려놓음" → 스테이지별 best로 의미 재정의 |
| 6 | FX-SLOWMO (56-68) | ≤5 진입 시 0.4배 0.5초, 판당 2회 | **유지(보류 가능)** | v3와 충돌 없음. 5-2 구성원별 사망에서도 "생존 ≤5" 판정은 성립 |
| 7 | FX-CONTINUE (70-76) | 판당 1회, 도전 불가 | **교체(폐기)** | 12장 "부활 10명 고정 → 순수는 재시작, 캠페인은 편성/성장·재시도" |
| 8 | SPRITES-KEYS (78-91) | 정확히 30키, 파일명 규약 | **손봄** | 규약(키→파일명) 검사는 유지. `length===30` 정확 일치는 무기·통·벽·영웅 자산 추가 즉시 깨짐 → 필수 키 포함 검사로 완화. m1~m5는 5-6 진화 폐지와 함께 의미 재검토 |

### 요약 집계

| 판정 | core | sim | meta | 합계 |
|---|---|---|---|---|
| 유지 | 2 | 0 | 2 | 4 |
| 손봄 | 1 | 11 | 5 | 17 |
| 교체/폐기 | 4 | 6 | 1 | 11 |

---

## 4. 9/3 압축본 대비 최신 코드 차이 (03 전달서 보정)

03 전달서 §0은 "2026-09-03 검토 압축본" 기준이라고 못 박았다. 9/3 마지막 커밋 `6155b30` → HEAD 사이의 실제 diff(`git diff 6155b30..HEAD -- tests/rush-*.test.mjs`):

| 파일 | 변경 | 커밋 | 03 문서에 미치는 영향 |
|---|---|---|---|
| rush-core | **변경 없음** | — | — |
| rush-meta | UP-EFFECT 기대값에 `moveMult:1` 추가 | 8958838 (9/7) | 업그레이드 4트랙. 03 §2 upgrades.js 항목의 "기존 업그레이드" 범위에 moveSpeed 포함 |
| rush-sim | COMBAT-BOSS: `baseHp+hpPerTroop×count` → `hpByZone[zone]`, 999명이어도 같음 | 5028f06 (9/6) | **12장 "병력 비례 보스 HP → 고정" 항목은 이미 반영됨.** 남는 일은 zone→stage 매핑뿐 |
| rush-sim | COMBAT-BEAM-BURN 신설(소각탄 같은 프레임 명중 금지) | 577aaf8 (9/6) | **03 §4 "9/3 압축본의 버스터 소각 탄 피격 오류"는 이미 수정·잠금됨**(combat.js:165 `if (s.dead) continue`) |
| rush-sim | COMBAT-STALE 신설 | 577aaf8 (9/6) | 03 §4 "통과 후 뒤늦게 맞음" 방지의 부분 구현 |
| rush-sim | TIER-HYST 신설, SIM-FULLRUN에 tierStep 적용 | f256c82 (9/6) | v3에서 폐기 대상이 9/6에 새로 추가된 셈 |
| rush-sim | SIM-FULLRUN에 이동 상한(baseMoveMax)·followRate·lane·escort 복제 | 8958838, 72e8957 (9/7) | 봇이 main.advance를 복제하는 범위가 더 커짐 → 공유 진행 함수 필요성 증가 |
| rush-sim | BOSS-HOOK-GATE 신설 | c11922f (9/7) | — |

---

## 5. (d) 갭과 위험

1. **게이트 HP 파괴 규칙은 세 파일 어디에도 잠겨 있지 않다.** 구현은 `main.js` `advance()` 내부(main.js:115-140, 비export)에만 있고, SIM-FULLRUN 봇은 게이트를 쏘지 않는다(rush-sim.test.mjs:137-138은 `applyGate` 비교로 좋은 쪽을 고를 뿐). 따라서 폐기할 테스트는 없지만, v3 signed 게이트 검사(03 §6 첫 항목 "−2에 3발 → +1, 통과 후 추가 탄 무효")는 **처음부터 새로 써야** 한다.
2. **SIM-FULLRUN은 main.advance의 사본이다.** "main.advance 와 동일 규칙" 주석이 5곳(rush-sim.test.mjs:132, 142-143, 151, 161, 168)인데 이미 어긋난 곳이 있다: main.js:95는 이벤트별 시드 `evRnd`로 스폰하지만 봇은 판 공용 `rnd`를 쓴다(rush-sim.test.mjs:142). 버스터·POW·장판도 봇에는 없다. 사본이 통과해도 게임이 다를 수 있다 — 03 §2·§6이 요구하는 "공유 진행 함수"로 바꿔야 해소된다.
3. **격파 통계가 접촉 소멸을 구분하지 않는다.** combat.js:278 `if (!e.picked) st.kills++`는 `touched`여도 kills를 올린다(코인만 :286에서 제외). 03 §4 "적 접촉 소멸과 사격 격파를 통계에서 구분"은 현행 코드도 테스트도 보장하지 않는다.
4. **하드코딩 상수가 여러 테스트에 걸쳐 있다.** 57000(TRACK-DET), 999(GATE-CAP), 80..400(SQUAD-CLAMP), 30(SPRITES-KEYS), tiers(BAL-SHAPE·SQUAD-TIER). BAL 한 곳을 바꾸면 여러 파일이 동시에 깨진다. v3에서 BAL을 재편할 때 "테스트에 맞추려고 옛 규칙을 남기지 않는다"(03 §6)를 지키려면 해당 테스트를 모듈과 **같은 커밋**에서 정리해야 한다.
5. **프레임률 등가성 검증이 없다.** 03 §6 "30/60/120Hz 동일 결과" 요구에 대해 현행 테스트는 dt를 1/30·1/60으로 섞어 쓸 뿐 등가를 단언하지 않는다. combat.js:60-64의 발사 루프(`Math.max(0.02, interval)`)와 접촉 판정 창(:141 `lineY + e.r + 30`, :174 `lineY + 46`)은 dt에 민감하다.
6. **저장 실패 경로 미검증.** save.js:10-11(손상 JSON→null), :17(setItem 예외→메모리 폴백)은 코드가 있으나 테스트가 없다. 03 §6 "새 저장/기존 저장/손상 저장/저장 권한 불가"가 그대로 갭이다.
7. **죽은 규칙 잠금.** GATE-APPLY·GATE-CAP은 `mul`을 검증하지만 생성기는 mul을 만들지 않는다(gates.js:23-24). v3 5-3도 곱셈은 실험용 — 지금 삭제해도 잃는 것이 없다.
8. **좌표계가 논리에 스며 있다.** `BAL.squad.y=640`을 줄 위치로, 830을 소멸선으로 쓰는 판정(combat.js:47, 296, 322)이 테스트 장면 세팅(rush-sim.test.mjs:56, 105, 114)에 그대로 박혀 있다. 5-1 원근 도로·아레나 자유 이동으로 좌표 모델이 바뀌면 장면 세팅부터 다시 써야 한다.
9. **적·보스 고유 패턴 테스트의 운명이 미정.** BOSS-HOOK-GATE, COMBAT-NEW, COMBAT-BOSS-TOUCH는 v3 5-7/5-8의 역할 분류(잡졸·돌격체·원거리·장갑·정예·차량 / 도로·아레나 보스)에 1:1 대응이 없다. 적 명단 확정 전에는 손댈 수 없고, 확정 후 일괄 판정해야 한다.
10. **실행 시간.** SIM-FULLRUN 1.7초(40000스텝 가드 × 10시드). v3에서 병사별 사격 주체로 바꾸면 스텝 비용이 N배가 되므로 완주 시뮬 길이(스테이지 30~60초)와 병력 상한(150)을 같이 잡아야 CI 시간이 유지된다.
11. **ID 접두 충돌 가능성.** 기존 `COMBAT-*`, `SQUAD-*`, `GATE-*` 접두를 v3 테스트가 재사용하면 검색·인용이 섞인다. v3용 접두(예 `V3-GATE-*`)를 정한다.

---

## 6. (e) v3 신규 모듈·테스트가 이 파일들을 활용할 때의 권장 방식

테스트 파일은 import 대상이 아니므로, 여기서는 (1) v3 테스트가 **어떤 기존 모듈 표면을 그대로 import해도 되는지**, (2) **어떤 패턴을 물려받을지**, (3) **레거시 3파일을 어떻게 다룰지**를 적는다.

### 6-1. 그대로 import해도 되는 표면
- `rush/rng.js` — `mulberry32`, `hashSeed`, `dateSeed`. v3 스테이지 재도전 결정성·일일 코스의 근거. 03 §2 "스테이지와 산개/연출 난수 분리"는 **시드를 둘로 나눠 mulberry32를 두 번 만드는 것**으로 충족되며 모듈 수정이 필요 없다(main.js:34가 이미 `seed ^ 0x9E37`로 파생 시드를 쓴다).
- `rush/save.js` — `createSave(storage)`의 주입 패턴과 `memStorage()` 헬퍼. v3 저장 스키마는 **새 키**(예 `starforgeRush.v3`)로 별도 인스턴스를 만들고, `.v1`은 읽기 전용 레거시로 남긴다(03 §5).
- `rush/main.js` — `hitButton`. `gateHitSide`는 쓰지 않는다.
- `rush/daily.js` — `todayKey`, `isFirstRunToday`.
- `rush/fx-state.js` — `slowmoCtl`, `recordWatcher`(의미 재정의 후).

### 6-2. import하지 말 것 (v3 규칙과 충돌)
- `rush/gates.js` `applyGate`/`makeGatePair`/`GATE_OPS` — signed value 게이트 모듈을 새로 만든다. `isGood(op)` 대신 `value >= 0`이 색을 결정한다(5-3).
- `rush/track.js` `buildTrack`/`zonePool` — 스테이지 정의 기반 생성기로 교체.
- `rush/squad.js` `tierFor`/`tierStep`/`clampX` — 티어 폐지, 도로 폭 가변.
- `rush/combat.js` `stepCombat`의 `{count}` 단일 객체 입력 — 03 §3 `squadUnits`·`heroes` 배열 입력으로 새 전투 스텝을 만든다. `events` 배열 반환 형태와 `createCombat()`의 풀 구조(enemies/bullets/eshots/pools)는 참고할 만하다.

### 6-3. 물려받을 테스트 패턴
1. `node:test` 평면 `test()` + `assert/strict`, **ID 접두 제목**(v3 전용 접두).
2. 모든 난수 `mulberry32` 주입, 시드는 테스트 상단에 상수로.
3. 헬퍼는 인라인 클로저 우선. 3파일 이상이 공유하게 되면 `tests/lib/`로 승격(`memStorage`가 첫 후보).
4. 장면 세팅은 상태 객체 직접 변형(현행 방식) — 단, v3에서는 좌표를 `BAL`/스테이지 정의에서 읽어 상수 박기를 피한다.
5. "DOM 없이 import 가능" 검사를 v3 셸 모듈에도 유지(`await import()`).
6. 소스 문자열 정규식 대조 금지 — 래칫(test-quality-ratchet.test.mjs)이 늘어남을 막는다. rush 3종은 0건이라는 선례를 지킨다.
7. 완주 시뮬은 **공유 진행 함수**를 호출한다. 봇이 규칙을 복제하지 않는다(03 §6 마지막 문단).
8. 신규로 추가할 표준 헬퍼: `dt` 스윕(1/30, 1/60, 1/120)으로 같은 입력의 결과가 같은지 비교하는 `assertFrameInvariant(runFn)`.

### 6-4. 레거시 3파일 처리 원칙
- **단언을 약화해 억지로 통과시키지 않는다**(03 §6 "기존 테스트에 맞추려고 옛 규칙을 남기지 않는다").
- 레거시 모듈(gates/track/squad 티어)을 남겨 두는 동안은 그대로 실행되게 두고, 해당 모듈을 제거·교체하는 **같은 커밋**에서 잠금 테스트도 제거한다. 부분 삭제 대상은 §3 표의 "교체" 행 11건.
- "유지"·"손봄" 행은 v3 파일로 옮겨 적되, 원 테스트 ID를 주석으로 남겨 추적 가능하게 한다(예 `// from rush-sim COMBAT-BEAM-BURN`).
- 첫 단계(03 §1 기준 스테이지 3개) 착수 전 최소 확보 목록: signed 게이트 5종 검사(03 §6 1행), 통 내구≠병력(2행), 관통 분리(3행), 1/10/30명 화력 증가(4행), 무기 유지(5행), 저장 4상황(12행), 프레임률 등가(14행).

---

## 부록 — 확인 명령 기록

```
git rev-parse --abbrev-ref HEAD                 → claude/starforge-v3
git log -1 --format='%h %ad'                    → c11922f 2026-09-07
git diff --stat 6155b30..HEAD -- tests/rush-*   → meta +2/-2, sim +67/-9, core 0
node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs
                                                → 32 pass / 0 fail / 2163ms
```
