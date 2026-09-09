# 04. 기존 모듈 분석 — core (rush/combat.js · rush/gates.js · rush/squad.js)

작성일: 2026-09-09  
분석 기준 코드: `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar` HEAD `c11922f` (2026-09-07 14:29 KST)  
기준 문서: `newmode/v3/spec/01_스타포지러시_재기획_v3.md`(5장·12장·13장), `03_구현담당자_전달서.md`(2·3·4·6장)  
검증: `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs` → 24개 통과(HEAD 기준, 2026-09-09 실측)

> 03 전달서의 기존 파일 비교는 2026-09-03 압축본(`cfa448b`) 기준이다. 그 뒤 9/6~9/7에 9개 커밋이 rush/ 에 들어갔다. 이 문서는 **HEAD 기준**으로 쓰고, 9/3 대비 달라진 점은 §0에 따로 적었다. `gates.js` 는 9/3 이후 변경 없음(diff 없음).

대표 판정: **교체(replace)** — 세 파일의 핵심 규칙(병력 count → 단일 화력, op/value 게이트 + HP 파괴, 히어로 중심 링 대형을 표시 전용으로 쓰고 판정은 반경 근사)이 v3 요구(병사별 사격·개별 체력, signed 게이트, 앞물체 우선 명중, 벽 제약)와 구조적으로 어긋난다. 다만 `combat.js` 의 적/보스 행동 블록(약 150줄)과 `squad.js` 의 링 배치 알고리즘은 **추출해서 손봐 쓸 가치**가 있다. 함수별 판정은 §3.

---

## 0. 9/3 압축본(03 전달서 기준) 대비 HEAD 차이

`git diff cfa448b HEAD -- rush/` 로 확인한 것만 적는다.

| 파일 | 9/3 → HEAD 변경 | v3 관점 의미 |
|---|---|---|
| combat.js | `spawnBoss` 보스 HP가 `baseHp + hpPerTroop×병력` → **구간 고정 `BAL.boss.hpByZone[zone]`** (combat.js:30-36, balance.js:42) | 12장 변경표 "병력에 비례한 보스 HP → 스테이지 기준 HP"의 절반은 이미 됨. `troopCount` 인자는 남아 있으나 미사용 |
| combat.js | 적탄 루프에 `if (s.dead) continue;` 추가 (combat.js:165) | 03 §4가 경고한 "버스터 소각 탄 피격 오류"는 HEAD에서 이미 수정됨 |
| combat.js | 접촉 판정에 상한 `e.y <= lineY + e.r + 30` 추가, 적탄 명중에 `s.y <= lineY + 46` 추가 (combat.js:141, 174) | "지나간 적/탄이 옆걸음에 맞는" 유령 접촉 수정 |
| combat.js | `spawnWave` 에 `lane`('L'/'R') 인자 추가, 차선 대역 [85,225]/[255,395] (combat.js:8, 14) | 2차선 하드코딩 — v3 가변 통로와 충돌 |
| combat.js | POW 드랍(`powCd`, `powDropRate`), 드랍 팝 `born.pop`, 갠트리 `hookAt` (combat.js:5, 49, 120, 221, 280-284, 305-314) | 버스터 관련 — v3에서는 선택적 지원 무기로 격하(5-6) |
| squad.js | `tierStep` 히스테리시스 신설, `BAL.demoteRatio: 0.75` (squad.js:32-38, balance.js:12) | v3 5-6이 티어 진화 자체를 핵심에서 내리므로 폐기 대상 |
| balance.js | `baseMoveMax: 250`, `moveSpeed` 업그레이드, `continueByZone` (balance.js:7, 53, 59) | 이동 상한은 v3 5-1 조작 규칙 설계 시 참고값 |
| gates.js | 변경 없음 | — |

---

## 1. export 목록 — 시그니처와 용도

### 1-1. rush/combat.js

| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `createCombat` | `() => st` | 전투 상태 초기 객체 | combat.js:4-6 |
| `spawnWave` | `(st, kind, n, rnd, hpMult=1, zone=0, lane=null) => void` | 적 n기를 화면 위(y −40~−210)에 균등 분산 배치. `hp = round(def.hp×hpMult)`, `vy = scroll + max(0, speed−scroll)×enemyAdvMult[zone]` | combat.js:8-28 |
| `spawnBoss` | `(st, troopCount, zone) => void` | 보스 1기 생성. HP는 `hpByZone[zone]` 고정, `troopCount` 미사용 | combat.js:30-36 |
| `stepCombat` | `(st, squad, dt, rnd) => { troopLoss, events }` | 한 프레임의 순수 전투 스텝(표시 무관, 난수는 주입 rnd만) | combat.js:46-326 |
| (내부) `shootFan` | `(st, x, y, tx, ty, fan, speed, dmg=1, shape='lamp')` | 부채꼴 적탄 발사 — export 아님 | combat.js:38-44 |

`squad` 입력 계약(호출부 main.js:143, 테스트 rush-sim.test.mjs:165): `{ x, count, fireRateMult, tier, radius, beam }`. **병사 개별 위치·체력은 입력에 없다.**

### 1-2. rush/gates.js

| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `GATE_OPS` | `['add','mul','sub','div']` | 연산 종류 상수 | gates.js:4 |
| `isGood` | `(op) => op==='add' \|\| op==='mul'` | 좋은 게이트 판별(색·소리·탄 흡수 분기) | gates.js:5 |
| `gateColor` | `(op) => BAL.gates.colors[op]` | op별 색 | gates.js:6 |
| `applyGate` | `(count, gate) => number` | 통과 시 병력 계산. add/mul/sub/`ceil(count/n)`, 결과 `[0, maxCount=999]` 클램프·반올림 | gates.js:8-16 |
| `makeGatePair` | `(rnd, t, guaranteeGood=false) => { left, right }` | 무작위 쌍 생성(좋+나쁨 55% / 좋+좋 15% / 나쁨+나쁨 30%; `t<0.08` 또는 guaranteeGood면 나쁨+나쁨 금지). 좋은 게이트는 add만(곱하기 폐지, 9/2 결정) | gates.js:20-43 |

주석(gates.js:32)은 "좋+좋 25% / 나쁨+나쁨 20%"라 쓰였지만 코드는 `roll<0.55 → 좋+나쁨, <0.7 → 좋+좋, 그 외 → 나쁨+나쁨`이므로 실제는 55/15/30이다(gates.js:36). 주석과 코드 불일치.

**게이트 HP 파괴 로직은 gates.js에 없다.** `main.js:115-140`(advance 내부)에 있다. 내구 `g.hp` 는 첫 사거리 진입 시 지연 부여: `div → round(30 + t×70)`, `sub → max(6, round(value×1.3))` (main.js:125). 나쁜 게이트만 대상(`isGood(g.op) || g.broken → continue`, main.js:124). 게이트 y ±26px 대역·게이트 폭 안의 아군 탄을 `b.dead=true` 로 흡수하고 `hp−=1`(main.js:128-132), 0 이하면 `g.broken=true` → 통과 시 `'무효'` 플로터만 띄우고 `continue`(main.js:80-83). 렌더는 `gate.hp`·`gate.broken` 을 직접 읽는다(render.js:116-126, 138-144).

### 1-3. rush/squad.js

| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `tierFor` | `(count) => 0..4` | `BAL.tiers=[1,60,180,360,700]` 임계로 M1~M5 티어 | squad.js:4-8, balance.js:11 |
| `formation` | `(count) => [{x,y},...]` | 히어로(0,0) 중심 동심 링 배치. `r = ringStart(26) + (k−1)×ringGap(19)`, 링당 슬롯 `max(3, round(1.5π·r/22))`, 전방 90° 비움(각도 π/4부터 1.5π 스윕). `drawCap(130)` 초과분은 자름 | squad.js:12-27 |
| `clampX` | `(x) => clamp(x, 80, 400)` | 도로 폭 = 게이트 총폭 320 고정 | squad.js:29, balance.js:17 |
| `tierStep` | `(curTier, count) => tier` | 오를 땐 즉시, 내릴 땐 `tiers[t]×demoteRatio(0.75)` 아래일 때만 강등 | squad.js:32-38 |
| `displayUnits` | `(count) => 0..50` | 12까지 1:1, 이후 7명당 1기, 최대 50 | squad.js:42-45 |
| `squadRadius` | `(count) => px` | `displayUnits(min(count, drawCap))` 로 링 수를 세어 반경 산출. 1명이면 `heroSize/2=23` | squad.js:48-58 |

`formation` 은 **렌더에서만** 호출된다(render.js:154 `formation(displayUnits(squad.count))`). 전투 판정에는 `squadRadius` 만 넘어간다(main.js:143). 즉 "그림 위치"와 "판정 범위"가 서로 다른 함수에서 나온다.

---

## 2. 내부 데이터 형태

### 2-1. 전투 상태 `st` (createCombat, combat.js:5)

```
{ enemies: [], bullets: [], eshots: [], pools: [], boss: null,
  fireT: 0, fireSeq?: number, coins: 0, kills: 0, powCd: 0 }
```

| 배열 원소 | 필드 | 근거 |
|---|---|---|
| enemy | `kind, zone, hp, r, x, y, vx, vy, shootT?, hopT?, hopDur, hopVx?, emitT?, aimT?, aimX?, aimY?, touched?, picked?` | combat.js:16-26, 100, 111, 133-134, 143, 147 |
| bullet(아군 탄) | `x, y, vy, vx?(자기장), w, tier, dead?` | combat.js:69, 87, 130(main), 266 |
| eshot(적탄) | `x, y, vx, vy, dmg, shape, dead?` + 갈고리 `hook, baseX, swing, t` | combat.js:42, 225, 167-168 |
| boss | `zone, hp, max, x, y, r, dir, shootT, touchT, spawnT` + 패턴별 `rage, phase2, ramT, ramPhase, sweepPhase, sweepWarnT, warnX, diveHit, sweepT, poolT, hookT` | combat.js:34-35, 182-227 |
| pool(쇳물 장판) | `x, y, warn, life, tick` | combat.js:218 |

`born` 은 프레임 내부 임시 배열(`{kind, n, x, y, pop?}`, combat.js:274, 282, 290) — 정리 단계에서 생긴 적(분열·POW 드랍)을 필터 뒤에 push 한다(combat.js:305-314).

`stepCombat` 반환 `events[]` 의 type: `fire`(발사 1회당), `pow`, `powDrop`, `kill{x,y,r,kind,touched}`, `supply{x,y,n}`, `steal{n}`, `bossKill`, `hurt{n}` (combat.js:73, 144, 283, 285, 288, 299, 318, 324). **보급 보상 `n` 은 여기서 `rewardByZone[zone]` 으로 결정**되고(combat.js:288, balance.js:39) 병력 가산은 main.js:156 에서 한다.

### 2-2. 게이트 객체

gates.js 가 만드는 것: `{ op: 'add'|'mul'|'sub'|'div', value: 양의 정수 }` (gates.js:24, 28-29).  
track.js 가 덧붙이는 것: `greed: true`(욕심 라인 골드 표시, track.js:51, 60).  
main.js 가 런타임에 덧붙이는 것: `hp`(main.js:125), `broken`(main.js:134).  
트랙 이벤트: `{ z, type: 'gatepair', data: { left, right } }` (track.js:52, 74). **항상 2칸 쌍**이고 좌/우는 `gateHitSide(run.x)` = `x<240 ? left : right` 로 고른다(main.js:22, 79).

### 2-3. 대형

`formation(n)` 출력은 히어로 기준 상대 좌표 `[{x:0,y:0}, {x,y}, ...]`(정수 px). 렌더가 `squad.x + p.x`, `BAL.squad.y + p.y` 로 그린다(render.js:161). 이 좌표는 어디에도 저장되지 않으며 매 프레임 재계산된다.

---

## 3. v3 요구 대비 함수별 판정

판정 기호: **A 그대로 재사용** / **B 손봐서 재사용** / **C 교체(또는 폐기)**

### 3-1. combat.js

| 함수/블록 | 판정 | 이유(v3 요구 ↔ 현재 코드) |
|---|---|---|
| `createCombat` | B | 상태 골격(enemies/bullets/eshots/boss)은 유지 가능. v3 03 §3 의 `squadUnits`·`heroes`·`squadWeapon`·`phase`·`objective` 가 없고, `fireT` 가 부대 단일 타이머라 병사별 사격 타이머로 바꿔야 한다(combat.js:5, 59) |
| `spawnWave` | B | 화면 위 스폰·구간 배율·균등 분산은 쓸 만하다. 그러나 (1) 차선 대역 `[85,225]/[255,395]/[85,395]` 하드코딩(combat.js:14) → 가변 통로 불가, (2) x 지터·y 오프셋이 rnd 의존(combat.js:19-20) → 03 §3 "동일 스테이지 재도전 = 동일 위치" 는 시드 고정으로만 보장. 스테이지 정의 좌표를 직접 받는 입력 경로가 필요 |
| `spawnBoss` | B | 구간 고정 HP는 v3 5-8 과 이미 일치(combat.js:33). `troopCount` 인자 제거, HP를 스테이지 정의에서 받도록 시그니처 변경. `x:240,y:−80` 고정 등장(combat.js:34)은 도로 보스 1~3마리·아레나 보스에 맞게 위치 입력 필요 |
| `stepCombat` — 아군 사격 (combat.js:50-74) | **C** | 핵심 불일치. 화력 = `(bulletDmg + count×dmgPerTroop) × tierDmgMult[tier] / muzzles`(combat.js:53), 발사 간격 = `fireInterval / (fireRateMult × min(7, max(1, √count)))`(combat.js:60). 실측 환산: 1명 → 0.5s 간격·탄당 1.012, 30명 → 0.091s·1.36, 49명 이상 → 0.071s 상한. 즉 "병력 숫자 → 연사 속도 √배율 + 탄 위력 미세 가산"이며 발사 주체는 부대 1개(`squad.x` 중심 ±spread 산개, combat.js:61, 67). v3 5-2 "병사 1명당 1개 논리적 사격 주체" 와 정반대. 사선 spread 가 `24 + radius×1.4`(combat.js:61) 로 "대형 폭"을 흉내낼 뿐 실제 병사 위치가 아니다 |
| `stepCombat` — 탄 이동·자기장 (combat.js:75-90) | B | 단순 오일러 이동. 벽 충돌 없음(탄은 `y>−40` 필터만, combat.js:321). v3 5-1 "탄이 벽을 통과하지 않게" 에 맞춰 벽 판정 추가 필요. 자기장(마그넷헤드) 블록은 그대로 옮길 수 있음 |
| `stepCombat` — 적 행동 (combat.js:93-140) | B | 점프(hop)·고치 산란(emit)·가속(accel)·조준 사격(aimTime)·부채꼴 사격은 적 종류별 데이터 구동이라 v3 5-7 적 6종(잡졸·돌격체·원거리·장갑·정예·차량)의 재료로 쓸 수 있다. 단 목표점이 전부 `squad.x, lineY`(부대 중심 한 점, combat.js:106, 134, 137) → 병사/영웅 개별 조준으로 대상 인터페이스 교체. 벽 반사 `80/400` 고정(combat.js:122) 교체 |
| `stepCombat` — 접촉 판정 (combat.js:141-149) | **C** | `e.y ∈ [lineY−r, lineY+r+30]` 이고 `|e.x−squad.x| < rad + e.r` 이면 접촉. 부대를 **하나의 원(반경 rad)** 으로 보고 `troopLoss += touchLoss`(1~5) 를 count 에서 뺀다. v3 5-2 "실제로 노출된 구성원이 피해" 와 구조 불일치. 접촉한 적이 즉시 `hp=0`(자폭) 되는 규칙(combat.js:147)은 v3에서 적 종류별로 재정의 |
| `stepCombat` — 버스터 빔 (combat.js:153-161) | B(선택) | v3 5-6 "버스터는 선택적 지원 무기". 폭 `busterHalfW` 관통·적탄 소각 로직은 관통 무기 명세(03 §3 "관통탄이 게이트를 여러 번 올리는지 명시")를 정한 뒤 재사용 여부 결정 |
| `stepCombat` — 적탄 명중 (combat.js:164-175) | **C** | `s.y ∈ [lineY, lineY+46]` 대역 × `|s.x−squad.x| < rad+5` 사각 대역 판정. 병사 개별 피격 없음. v3 5-2 "그림보다 약간 작은 범위" 로 구성원별 판정 필요 |
| `stepCombat` — 보스 패턴 (combat.js:178-248) | B | 램·스윕·장판·갈고리·페이즈2/광분은 도로 보스(5-8)의 패턴 재료로 유효. 접촉·낙하 명중이 `rad×0.5 + bo.r×0.7` 등 부대-원 근사(combat.js:205, 244) → 개별 판정으로 교체. 아레나 보스(자유 이동·추격)는 없음 → 신규 |
| `stepCombat` — 탄 명중 (combat.js:263-271) | **C** | (1) 보스 먼저, 그다음 `st.enemies` **배열 순서**로 첫 겹침에 `break`(combat.js:265-270) — "가장 가까운 대상" 이 아니다. (2) 이동 후 위치의 점-원 판정(`hypot < r+4`)만 있고 이전→현재 경로(swept) 판정이 없다 → 03 §4 "빠른 탄이 물체를 건너뛰는 것을 막는다" 미충족. 탄속 700~880px/s(balance.js:10) 이고 잡졸(scrapbit) 판정 지름은 `(r 14 + 4)×2 = 36px`(balance.js:21, combat.js:269) 이므로, 한 프레임 이동이 36px를 넘는 dt(700px/s 기준 0.052s ≈ 19fps, 880px/s 기준 0.041s ≈ 24fps)부터 탄이 잡졸을 건너뛸 수 있다. 슬로모 배율·탭 전환 후 큰 dt 에서 재현 가능. (3) 게이트 흡수는 main.js:128-132 에서 **이전 프레임 위치**로 먼저 처리되므로, 같은 프레임에 "앞의 통 vs 뒤의 게이트" 우선순위가 정의되지 않는다(03 §6 "한 발이 앞의 통과 뒤의 게이트를 동시에 처리하지 않음") |
| `stepCombat` — 정리·born·보스 격파 (combat.js:274-320) | B | 격파 보상·분열·드랍·`touched` 구분(접촉 소멸 vs 사격 격파, 03 §4 요구와 일치)은 재사용 가능. 단 보급(`kind==='supply'`)이 **적 종류**로 끼어 있다(combat.js:280, 287-289, balance.js:38) → 03 §2 "보급물·벽·게이트를 적 종류에 끼워 넣는 방식은 피한다" 위반. 보급 파괴 보상은 별도 객체 유형으로 분리 |
| 반환 `{ troopLoss, events }` | **C** | 손실이 정수 합계 하나로 뭉쳐 나오고 main.js:171 이 `run.count −= troopLoss`(무적 중이면 무시) 한다. v3에서는 "누가 얼마나" 가 필요하므로 unit/hero 별 피해 이벤트로 바꿔야 한다 |

### 3-2. gates.js

| 함수 | 판정 | 이유 |
|---|---|---|
| `applyGate` | **C** | op/value 4연산 + `[0,999]` 클램프(gates.js:8-16). v3 5-3 은 signed 단일값 `count + signedValue`(0이면 무변화). mul/div 는 "검증 전 실험용" 이므로 새 함수 뒤에 옵션으로만 남긴다. 클램프 상한 999는 v3 10장 "150명 실측 후 결정" 과 충돌 — 스테이지/성능 값으로 이동 |
| `makeGatePair` / `makeGate` | **C(폐기)** | 무작위 2칸 쌍 생성기. v3 12장 "직접 설계한 1/2/3칸 게이트", 8장 "처음부터 무작위 생성으로 채우지 않는다" 이므로 v3 스테이지에는 쓰지 않는다. 일일 코스가 무작위를 유지한다면 레거시 전용으로 보관 |
| `isGood` | **C** | op 기반 → v3는 `signedValue >= 0` 기반. 함수 이름·역할은 유지 가능하나 시그니처가 `(gate)` 로 바뀐다 |
| `gateColor` | **C** | op별 4색 → v3는 부호 2색(+파랑/−빨강) + 0 상태. `BAL.gates.colors` 의 add/sub 색 값은 재사용 가능 |
| `GATE_OPS` | C(레거시) | 테스트·레거시 모드에서만 의미 |
| (main.js) 게이트 HP 파괴 | **C** | v3 5-3 "HP 0 파괴형은 기본 규칙에서 제외". 현재는 나쁜 게이트만 탄을 흡수하고(main.js:124) 좋은 게이트는 탄이 그냥 통과한다 → v3 "+게이트도 계속 키운다" 를 위해 **모든** 게이트가 흡수·증가해야 한다. 현재 화면엔 `−10` 과 별도의 잔여내구 `13` 두 숫자가 뜬다(render.js:130, 141) → v3 는 하나의 변하는 숫자 |

**v3 signed 게이트에 필요한 데이터가 현재 게이트 객체에 없다:** `signedValue, hitIncrement, maxValue, lane, width, z, passed`(03 §3). 현재는 `op, value, greed, hp, broken` 이고 `passed` 대신 이벤트 인덱스 `run.ei` 전진으로 "지나갔음" 을 표현한다(main.js:76-77). 통과 후 추가 탄이 다시 보상되지 않게 하려면(03 §6 첫 항목) `passed` 플래그가 게이트 객체에 있어야 한다 — 현재는 `dy < −20` 이면 흡수 루프에서 제외(main.js:120)하는 것으로 대체하고 있다.

### 3-3. squad.js

| 함수 | 판정 | 이유 |
|---|---|---|
| `formation` | **B** | 링 배치 알고리즘 자체는 "군단이 커 보이는 그림" 에 유효(v3 10장 "원근·간격으로 충분히 커 보이게"). 손볼 점: (1) 출력을 **저장되는 병사 객체 위치**로 승격시켜 전투가 같은 좌표를 쓴다(03 §2 squad.js 항목 "실제 판정과 표시의 기준 통합"), (2) 통로 폭 인자를 받아 대형을 좁힌다(v3 5-1 "구성원은 통로 폭에 맞춰 대형을 줄인다"), (3) 영웅 전방 2·후방 3 슬롯(v3 6장)이 링 구조에 없다 → 영웅 슬롯 좌표를 별도 계층으로 |
| `squadRadius` | **C** | `displayUnits` 기반 근사 반경. 병사 개별 위치가 있으면 파생값(바운딩)으로 대체된다. 현재는 이 값이 접촉·피탄·보스 판정의 유일한 폭이라(combat.js:50, 141, 174, 205, 244, 255) 대체 시 combat 쪽과 동시에 바꿔야 한다 |
| `displayUnits` | B(렌더 전용) | "12까지 1:1, 이후 7:1, 최대 50" 축약은 v3 5-2 "병력 증가가 그림·탄막에 즉시 드러남"(13장 완료 기준) 과 13명 이상 구간에서 충돌한다. 논리에는 절대 쓰지 말고, 성능 실측 후 렌더 축약이 필요할 때만 사용. `drawCap 130` 과 `displayUnits` 상한 50 이 따로 놀고 있다(squad.js:13 vs 44) |
| `clampX` | **C** | `[80,400]` 고정 도로. v3 5-1 분리벽·2차선·3갈래·좁은 다리 → 스테이지 z 에 따른 허용 구간 함수 `clampToCorridor(x, z, stage)` 로 교체. 적의 벽 반사(combat.js:122)와 게이트 x 좌표(main.js:126-127)도 같은 상수에 묶여 있다 |
| `tierFor` / `tierStep` | **C(폐기)** | v3 5-6 "병력 기준 M1~M5 자동 진화를 핵심 성장에서 내린다", 12장 "병력 상실 시 즉시 강등 → 획득 무기 유지". 히스테리시스 로직은 범용이지만 v3 무기는 보급으로만 바뀌므로 필요 없다. `BAL.squad.muzzles/bulletW/tierDmgMult/bulletSpeeds`(balance.js:9-10) 도 티어 인덱스 기반 → 무기 정의(3단계, v3 5-6)로 재편 |

---

## 4. 처리 순서 비교 — 현재 프레임 vs v3 §4 요구

현재 한 프레임(main.js `advance` + combat.js `stepCombat`):

1. 슬로모 배율 적용 `dt = dt0×scale` (main.js:67-68) — **가변 dt, 고정 스텝 없음**
2. `run.z += scrollSpeed×dt` (보스전 제외) (main.js:75)
3. z 도달 이벤트 처리: **게이트 통과 → applyGate 즉시 적용**, 웨이브 스폰, 보스 스폰 (main.js:76-114)
4. 나쁜 게이트 탄 흡수·HP 감소·파괴 — **지난 프레임 탄 위치** 기준 (main.js:115-140)
5. `tierStep` (main.js:141)
6. `stepCombat`: 사격 → 탄 이동·자기장 → 적 이동/행동/**접촉** → 버스터 → 적탄 이동/명중 → 보스 → 장판 → **탄 명중** → 정리/born → 보스 격파 → 탄·적탄 필터 (combat.js:58-322)
7. `count −= troopLoss` (무적 아닐 때), `tierStep` 재실행, 진화 연출 (main.js:171-183)
8. `count<=0 → over`, 보스 없음 → 구간 클리어/승리 (main.js:205-209)

v3 §4 요구 순서: 입력 → 이동/벽 제약 → 발사/스킬 → **투사체 가장 가까운 충돌** → 피해/게이트 변화 → 보급 파괴/보상 → **부대 통과 판정** → 승패.

구조적 차이:
- **게이트 통과(3)가 이번 프레임의 탄 처리(4·6)보다 먼저** 온다. v3는 "쏜 결과가 반영된 뒤 통과값 적용". 프레임 하나 차이지만 03 §3 "프레임률에 따라 보상이 달라지면 안 된다" 를 지키려면 순서를 명시적으로 뒤집어야 한다.
- 게이트 명중(4)과 적/보급 명중(6-끝)이 **다른 함수·다른 시점·다른 위치 기준**(이전 프레임 vs 이동 후)으로 갈라져 있어 "가장 가까운 충돌 하나" 를 고를 수 없다. v3 5-4 "앞에 다른 물체가 있으면 뒤의 통을 동시에 맞힐 수 없다" 는 이 구조로는 보장 불가.
- 접촉 손실(6-적 이동)과 탄 명중(6-탄 명중) 사이에 적이 이동하므로, 접촉으로 `hp=0` 된 적은 같은 프레임 탄 판정에서 제외된다(combat.js:269 `e.hp>0`). 03 §4 "같은 순간 보급 획득과 사망이 겹칠 때 우선순위" 는 정의되어 있지 않다(보급은 적 종류이므로 접촉 시 `touched` 로 보상 없이 소멸, combat.js:146-147, 287).
- 고정 시간 간격이 없다. 사격은 `while (st.fireT <= 0)` 누적으로 프레임률 무관하게 발수를 맞추지만(combat.js:63-64) 이동·명중은 프레임당 1회 오일러라 03 §6 "30/60/120Hz 동일 결과" 를 보장하지 않는다.

---

## 5. 갭과 위험

### 5-1. v3 기능 기준 갭(현재 세 파일에 아예 없는 것)

| v3 요구 | 현재 | 위치 |
|---|---|---|
| 병사별 위치·체력·사격 타이머 | 없음. `count` 정수 하나 | combat.js:53, 60; main.js:35 |
| 영웅(고정 ID·슬롯·스킬) | 없음. "히어로" 는 `formation()[0]` 그림 자리일 뿐 | squad.js:14 |
| 무기 축(보급으로 교체) | 없음. 티어 인덱스로 muzzles/bulletW/dmgMult 선택 | combat.js:52-53, balance.js:9 |
| signed 게이트·피격 증가·1/2/3칸 | 없음. op/value 2칸 쌍 + HP 파괴 | gates.js:8-43, main.js:115-140 |
| 보급 통 kind/durability/rewardPayload | 없음. `supply` 는 적 종류, 보상은 `rewardByZone[zone]` | balance.js:38-39, combat.js:288 |
| 연속 증원 장치(발판) | 없음 | — |
| 벽·통로 형상, 탄-벽 충돌 | 없음. `[80,400]` 상수 3곳 | squad.js:29, combat.js:122, main.js:126 |
| 아레나(자유 이동·추격 보스) | 없음. `squad.y` 고정 640, 보스는 y 140까지 내려와 좌우 왕복 | balance.js:7, combat.js:228-231 |
| swept 충돌·최근접 대상 선택 | 없음. 점-원 + 배열 순서 | combat.js:263-271 |
| 고정 타임스텝 | 없음 | main.js:67-68 |
| 통과 후 재보상 방지 플래그 | 없음. `dy<−20` 제외로 대체 | main.js:120 |

### 5-2. 재사용 시 위험

1. **`squadRadius` 의존 사슬**: 접촉·피탄·보스 낙하·장판 5곳이 이 한 값을 쓴다. 병사 개별 판정으로 바꿀 때 한 곳만 고치면 나머지가 "부대 원" 규칙으로 남아 03 §4 의 "그림과 판정 일치" 가 깨진다. 한 번에 바꾸고 테스트로 묶어야 한다.
2. **보급 = 적 종류**: `kind==='supply'` 분기가 combat.js:280, 287 두 곳에 흩어져 있고 `touchLoss:0`·`showHp` 같은 특수 플래그로 버틴다. 이 위에 병사/무기/영웅/증원/구출 5종을 얹으면 03 §2 가 금지한 구조가 굳어진다.
3. **게이트 HP 로직이 main.js 에 있다**: gates.js 만 교체하면 main.js:115-140 이 그대로 남아 `g.hp`/`g.broken` 을 계속 만든다. render.js:116-144 도 같은 필드를 읽는다. 세 파일을 동시에 바꿔야 한다.
4. **`applyGate` 의 `Math.round`·클램프**: signed 값을 그대로 더하는 v3 규칙에서는 반올림이 필요 없지만, mul/div 실험 옵션을 남기면 `ceil`(div)·`round` 정책을 명시해야 한다(현재 테스트 rush-core.test.mjs:28 은 `ceil(11/2)=6` 을 고정).
5. **기존 테스트 24개**가 op 게이트·count 화력·tierStep·displayUnits 를 고정하고 있다(tests/rush-core.test.mjs, rush-sim.test.mjs). v3 규칙으로 바꾸면 대부분 깨진다. 03 §6 "옛 규칙을 테스트 때문에 남기지 않는다" 에 따라 레거시 모드를 유지할 때만 그 테스트를 레거시 경로에 묶고, v3 는 새 진행 함수 기준 테스트로 시작한다.
6. **주석·코드 불일치**: makeGatePair 확률(gates.js:32 vs 36). 레거시 유지 시 문서화 필요. v3 에서는 폐기되므로 실질 영향 없음.
7. **9/3 압축본 기준 03 전달서와의 차이**: 보스 고정 HP·버스터 소각 탄 버그는 이미 반영됨(§0). 03 §2 의 combat.js 방향("단일 count 기반 → unit/hero별")은 HEAD 에서도 그대로 유효하다.

---

## 6. v3 신규 모듈이 이 파일들을 import 할 때의 권장 방식

원칙: **v3 전투 진행 함수는 `stepCombat`·`applyGate`·`clampX`·`squadRadius`·`tierStep` 을 import 하지 않는다.** 이 다섯은 count 단일 화력·op 게이트·고정 도로 전제를 함수 시그니처 자체에 담고 있어, 감싸서 쓰면 v3 규칙이 아니라 옛 규칙이 남는다.

권장 구조(파일명은 제안):

```
rush/v3/combat.js      — v3 stepBattle(state, input, fixedDt): 고정 스텝, 병사/영웅 단위
rush/v3/gates.js       — applyGateValue(count, gate), hitGate(gate, shot) : signed
rush/v3/supply.js      — 파괴형 보급(kind/durability/rewardPayload) + 연속 증원 발판
rush/v3/corridor.js    — clampToCorridor(x, z, stage), 탄-벽 충돌
rush/v3/formation.js   — 기존 formation 을 통로 폭 인자로 확장, 병사 객체에 좌표 저장
rush/v3/enemy-ai.js    — combat.js:93-140, 178-248 의 행동 블록을 "대상 인터페이스" 로 추출
```

import 지침:

| 대상 | 방식 |
|---|---|
| `combat.js` `createCombat` | import 하지 말고 v3 상태 팩토리를 새로 쓴다(필드가 03 §3 과 다름). 이름만 참고 |
| `combat.js` `spawnWave` | 1단계(3스테이지)에서는 스테이지 정의 좌표로 직접 push 하므로 불필요. 2단계에서 웨이브형 스폰이 필요하면 `lane` 대역 대신 `[x0,x1]` 구간을 받는 형태로 복사·수정(원본 시그니처 유지 금지) |
| `combat.js` `spawnBoss` | 도로 보스용으로 복사 후 `(st, def, hp, x, y)` 형태로 변경. `hpByZone` 대신 스테이지 값 |
| `combat.js` 적/보스 행동 블록 | **함수가 아니라 코드 블록**이라 import 불가. `enemy-ai.js` 로 추출하되 목표점 `(squad.x, lineY)` 를 `target = pickTarget(units, heroes, e)` 로 바꾼 뒤에만 옮긴다. 추출 전에는 참조만 |
| `gates.js` | `BAL.gates.colors.add/sub` 색 값만 참고. 함수는 하나도 import 하지 않는다. mul/div 실험은 v3 `applyGateValue` 의 옵션 인자로 |
| `squad.js` `formation` | 링 알고리즘을 복사해 `formation(n, {maxWidth, heroSlots})` 로 확장한다. 원본 import 후 결과를 좁히는 방식(후처리 스케일)은 병사 간격이 무너지므로 피한다 |
| `squad.js` `displayUnits` | 렌더 계층에서만, 성능 실측 후 필요 시. 전투 로직 파일에서 import 금지 |
| `balance.js` `BAL` | v3 는 별도 `balance-v3.js`(03 §2 "무기·보급·스테이지·영웅·드론별 수치 구분"). 기존 `BAL` 은 레거시 모드 전용으로 남기고 v3 파일에서 import 하지 않는다. `enemies.*` 표의 행동 파라미터(hopEvery, aimTime, fan 등)는 값을 옮겨 적는다 |
| `main.js` | v3 모듈이 main.js 를 import 하는 일은 없어야 한다. 게이트 HP 로직(main.js:115-140)은 참고만 하고 재사용하지 않는다 |

레거시 공존: 현재 `rush/*` 는 그대로 두고(이번 분석에서 수정하지 않음) v3 모듈은 별도 경로에 만든다. 기존 24개 테스트는 레거시 경로에서 계속 통과하게 두고, v3 는 03 §6 항목을 실제 진행 함수로 검사하는 새 테스트 파일(`tests/rush-v3-*.test.mjs`)에서 시작한다. 두 경로가 안정된 뒤 레거시를 걷어낼지 결정한다(01 §13 "기존 코드를 한 번에 폐기하지 않는다").

---

## 7. 한 줄 요약

세 파일은 "병력 숫자 하나가 곧 화력·그림·판정 폭" 이라는 전제로 짜여 있다(squad.js:1 주석 그대로). v3 는 그 전제를 버리는 기획이므로 핵심 함수는 교체하고, 적/보스 행동 블록과 링 배치 알고리즘만 대상 인터페이스를 바꿔 추출해 쓴다. 게이트 HP 파괴는 gates.js 가 아니라 main.js 에 있으니 교체 범위에 main.js:115-140 과 render.js:116-144 를 반드시 포함한다.
