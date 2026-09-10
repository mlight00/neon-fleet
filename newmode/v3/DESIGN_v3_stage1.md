# 스타포지 러시 v3 — 1단계(기준 전투 3개) 설계 계약서 (r2)

작성 2026-09-09, r2 = 3렌즈 설계 검토(규칙/결정성/기획충실도) 반영판. 기준 문서: `newmode/v3/spec/01_스타포지러시_재기획_v3.md`, `03_구현담당자_전달서.md`. 기존 코드 분석: `newmode/v3/analysis/01~06`.
이 문서는 구현 담당(사람·에이전트)이 공유하는 **모듈 경계와 규칙의 단일 진실**이다. 수치는 시제품 출발값이며 `rush3/balance.js`·`rush3/stages.js`가 최종 값을 가진다.

## 0. 범위와 원칙

- 범위 = 03 전달서 1단계: **사격형 게이트 · 병사/무기 통 · 병사별 실제 사격 · 분리벽 · 즉시 재도전**을 갖춘 스테이지 3개. 아레나·영웅·기지·드론·보너스전·3칸 게이트·원근 투영·코인은 2단계 이후.
- 기존 게임(`rush.html` + `rush/`)과 `tests/rush-*.test.mjs`는 **한 줄도 수정하지 않는다**. 신규는 `rush3.html`(루트) + `rush3/` + `tests/rush3-*.test.mjs`(ID 접두 `V3-`). 기존 코드는 `rush/rng.js`만 import하고, 나머지는 9장 결선표대로 복제·신규 작성.
- 게임 규칙은 순수 함수·순수 상태(`rush3/combat.js` 외 순수 모듈)로 두고 `node:test`로 잠근다. 화면(render)·입력·루프(main)는 규칙을 호출만 한다. **규칙 모듈은 `Math.random`·rng를 import하지 않는다**(정적 검사 테스트).
- **고정 시간 간격**: 규칙은 `STEP = 1/60`초 단위로만 진행한다. 30/60/120Hz 화면에서 같은 STEP별 입력열이면 같은 결과.
- 스테이지는 **고정 배치**. 스폰 좌표·지터까지 `buildStage(id)`가 `hashSeed(stageId + ':' + ev.z + ':' + i)`로 빌드 시점에 확정해 데이터에 박는다. 재도전 = `buildStage` 재호출(새 객체, 이전 판의 durability/value/passed/opened가 남지 않는다).
- 연출 난수(파편 각도 등)는 셸/렌더 전용 스트림이며 규칙 상태를 읽거나 쓰지 않는다. 시각 효과에 전역 `Math.random` 금지.

## 1. 좌표계

- 논리 화면 480×800. 부대 기준선 `LINE_Y = 640`. 도로 폭 x **80~400**(중앙 240). 시작 x = 240.
- **규칙 계층은 전부 트랙 좌표 z**를 쓴다: 부대 중심 `run.z`, 게이트·통·벽·발판(정지물)은 고정 z, 적·적탄·아군 탄도 z를 갖는다. 화면 y는 렌더에서만 `y = LINE_Y - (obj.z - run.z)`로 변환한다. z가 클수록 앞(화면 위).
- 세계 속도: 부대는 `scroll = 190`px/s로 전진(`run.z += scroll·STEP`, 보스전 중 0). 적의 `vz`는 세계 기준 부대 쪽 접근 속도(음수 방향으로 표기 없이 양수 = 부대 쪽으로 다가옴). 화면 체감 속도 = scroll + vz. 도로 고정형은 vz 0(보스전 중 자동 정지).
- 아군 탄: `vz`(세계 기준 전진 속도, 예: 700). 트랙 좌표에서 `z += vz·STEP`. 화면상 속도는 vz + scroll이 되지만 규칙에는 무관하다.
- 화면 진입은 `obj.z - run.z <= 760`(y ≥ −120)부터 그린다. 탄 정리: `z > run.z + LINE_Y + 140`. 적 정리: `z < run.z - 200`(부대 뒤로 사라짐).

## 2. 모듈 구조(`rush3/`)와 export 계약

| 파일 | export | 순수 |
|---|---|---|
| `balance.js` | `BAL3` (동결된 객체) | 데이터 |
| `stages.js` | `STAGE_IDS`, `buildStage(id) → stage`, `stageMeta(id)` | 순수 |
| `weapons.js` | `WEAPONS`, `weaponRank(id)`, `makeBullet(weaponId, x, z, ownerId)` | 순수 |
| `gates.js` | `makeGateRow(def) → row`, `hitGateCell(cell, bullet, events)`, `passGateRow(row, run, events)`, `cellAt(row, x)`, `gateColor(value)` | 순수 |
| `supply.js` | `makeSupply(def)`, `hitSupply(s, bullet, events)`, `passSupply(s, run, events)`, `takePads(s, run, events)` | 순수 |
| `squad.js` | `formation(n) → [{dx,dy}]`, `formationHalfWidth(n)`, `makeUnit(id)`, `layoutUnits(units)`, `compressUnits(units, lo, hi)`, `clampCenter(run, walls)`, `hitUnit(units, x, z, r) → unit|null`, `frontmostUnit(units)`, `removeUnits(units, n, from='back')` | 순수 |
| `combat.js` | `createRun(stage) → run`, `stepRun(run, input, STEP)`, `drainEvents(run) → events[]`, `STEP` | 순수 |
| `render.js` | `createRenderer3(ctx, sprites) → { draw(view) }` | 화면 |
| `sprites.js` | `SPRITE_KEYS3`, `loadSprites3(base) → { get(key), ready }` | I/O |
| `audio.js` | `createAudio3({ dir }) → { unlock, sfx(name, opts), bgmPlay(name), bgmPause, bgmResume, setVolume, getVolume, setMuted, isMuted, duck }` | I/O |
| `save.js` | `createSave3(storage) → { get(), getStage(id), updateStage(id, patch), patch(obj), ok }` | I/O |
| `main.js` | `boot(canvas, deps)`(자동 부트는 `#game3`가 있을 때만), `hitButton`, `makeLoop`(누적기, 테스트 가능) | 셸 |

## 3. 핵심 데이터

### 3-1. 전투 상태 `run`

```js
{
  stageId, stageVersion: 1,
  z, prevZ, x, tx,
  units: [ { id, dx, dy, hp, fireT } ],     // dx/dy = 대형 오프셋(중심 기준). id는 1부터 증가(nextUnitId)
  nextUnitId,
  weapon: 'rifle'|'auto'|'heavy',           // 판 종료까지 유지, 강등 없음
  bullets: [ { x, z, pz, vz, dmg, w, kind, gateHit: 1, ownerId, dead } ],
  gateRows: [...], supplies: [...], walls: [...], events: [] (연출 이벤트 큐 — drainEvents 전까지 누적),
  enemies: [ { id, kind, x, z, pz, vz, hp, r, dead, touched, ... } ],
  eshots: [ { x, z, pz, vx, vz, dmg, r, dead } ],
  boss: null | { kind:'elite', x, z, hp, max, r, state:'descend'|'hold', dir, shootT, touchT, spawnT, dead },
  wallSide: {},                              // wallId → 'L'|'R'
  pendingRewards: [],                        // STEP 5에서 쌓고 9에서 적용
  time, peak, kills, lossByTouch, lossByShot, lossByGate, missedSupplies, badGatesPassed,
  over: false, won: false, wonAt: null,
}
```

### 3-2. 게이트 행(`gates.js`)

```js
row  = { id, z, h: 24, cells: [ cell... ], passed: false, bypass: false }
cell = { x0, x1, value, maxValue, flashT: 0 }      // [x0, x1) 반열림, value는 정수
```
- 선택 행은 도로를 **빈틈 없이** 덮는다: 두 칸 = 좌 `[80,240)` / 우 `[240,400)`. 한 칸 행은 그 칸만 존재하며 `bypass: true`(옆은 우회로). `stages` 테스트가 `bypass`가 아닌 행의 칸 합집합이 80~400을 완전히 덮는지 검사한다.
- `hitGateCell(cell, bullet, events)`: `value = min(maxValue, value + bullet.gateHit)`(gateHit는 모든 무기 1, heavy 폭발도 게이트에는 직격 1회만). 탄 흡수(`dead`). 음수→0 이상으로 넘어가면 이벤트 `gateFlip`, 그 외 `gateHit {id, value}`. `flashT = 0.12`.
- 판정 형상: z 구간 `[row.z - h/2, row.z + h/2]` × 칸 x 범위. 탄 스윕 `[pz, z]`가 이 구간과 겹치고 x가 칸 안이면 명중.
- `passGateRow(row, run, events)`: `prevZ < row.z <= z`인 STEP에 `cellAt(row, run.x)`를 적용(없으면 우회, 적용 없음). `value > 0` → 유닛 `value`명 추가(`pendingRewards`가 아니라 9단계에서 직접), `< 0` → `removeUnits(|value|, 'back')`, `lossByGate += 제거 수`, `badGatesPassed++`, `0` → 무효과. **행 단위로 `passed = true`**(옆 칸도 이후 탄 무시). 이벤트 `gatePass {id, value, applied}`.
- `passed` 행은 충돌 후보에서 제외(흡수도 없음).
- 색: `value > 0` 파랑(#35E5FF), `< 0` 빨강(#FF6A3D), `0` 회색(#9AA1AC). 부호를 항상 표기(+3 / −6 / 0).

### 3-3. 보급 통(`supply.js`)

```js
{ id, z, x, r: 30, kind: 'soldier'|'weapon'|'chain', durability, maxDurability,
  payload: { n } | { weapon } | { pads0, maxPads },
  opened: false, missed: false, locked: false,
  pads: [ { z, x, taken } ] }      // chain 전용
```
- `hitSupply(s, bullet, events)`: `(opened && kind !== 'chain') || missed || locked`면 무시(충돌 후보에서도 제외). `durability -= bullet.dmg`(heavy 폭발은 통에 직격만). `<= 0`이 되는 첫 탄에서 `opened = true` → `pendingRewards.push({ kind, payload, x, z })` **정확히 1회** + 이벤트 `supplyOpen`. chain은 `opened` 이후 유효탄 1발(무기 무관) = 발판 +1(`maxPads`까지), 이벤트 `padAdd`. 통은 탄을 흡수한다. 그 외 탄은 이벤트 `supplyHit {id, durability}`.
- 보상 적용(9단계): soldier → 유닛 `n`명 추가. weapon → `weaponRank(payload.weapon) > weaponRank(run.weapon)`일 때만 교체(동급·하급은 무시, 이벤트 `weaponSame`). chain → `pads`를 `s.z + 60 + i*40`, x = s.x(같은 차선)에 `pads0`개 생성, 이벤트 `chainOn`.
- `passSupply(s, run, events)`: `prevZ < s.z <= z`에 미개봉이면 `missed = true`, `missedSupplies++`, 이벤트 `supplyMissed`(밀려나며 사라지는 연출; 피해 없음). chain은 이 시점에 `locked = true`(더 이상 발판이 늘지 않는다).
- `takePads(s, run, events)`: `prevZ < pad.z <= z`이고 `|run.x - pad.x| <= 70`인 발판 → `taken = true`, 유닛 +1(발판당 1회), 이벤트 `padTake`. 발판 간격 40 > STEP당 스크롤 3.2이므로 한 STEP에 두 발판을 지나는 일은 없다(그래도 루프로 처리).
- 표시: 통 그림 + 내용물(병사 실루엣 n / 무기 아이콘 / 파란 설비) + 남은 내구 숫자. **내구 숫자는 병력 수가 아니다.**

### 3-4. 무기(`weapons.js`, 값은 balance)

| id | rank | 발사 간격 | 탄 dmg | vz | 탄 폭 | 색 | 특성 |
|---|---|---|---|---|---|---|---|
| rifle | 1 | 0.5s | 1 | 700 | 4 | 노랑 | 1열 직사 |
| auto | 2 | 0.25s | 1 | 800 | 5 | 파랑 | 빠른 집중 |
| heavy | 3 | 0.6s | 3 | 650 | 8 | 주황 | **적**에 직격하면 반경 28 폭발(폭발 dmg 2, 직격 적은 직격 3만, 벽 반대편 적 제외). 통·게이트·벽 명중 시 폭발 없음 |

- 모든 탄 `gateHit = 1`. 무기 통은 rank가 현재보다 클 때만 교체.

### 3-5. 병사 유닛(`squad.js`)

- 유닛 `{ id, dx, dy, hp: 2, fireT }`. 판정 반경 `unitR = 9`(그림보다 작게).
- `formation(n)`: 히어로(0,0) 중심 링 군집(기존 링 알고리즘을 옮겨 적음, 전방 90° 개방). `layoutUnits(units)`는 배열 순서대로 `formation(units.length)` 오프셋을 재부여한다(유닛이 빠지거나 늘 때마다 호출; id는 유지). "뒤쪽" = dy 큰 순, "앞줄" = dy 작은 순.
- `makeUnit(id)`: `fireT = ((id * 7) % 12) / 12 * interval`(결정적 위상 분산).
- 사격: 각 유닛이 자기 화면 위치 `(run.x + dx, LINE_Y + dy)`에서 위로 직진. 탄 시작 z = `run.z - dy`, x = `run.x + dx`. 병사 30명 = 탄 30열. 정면 사격이 한 점으로 모이지 않는다.
- 통로 제약: `clampCenter(run, walls)` — 벽 활성 구간(`wall.z0 - 60 <= run.z <= wall.z1`)에서 `hw = min(formationHalfWidth(n), corridorWidth/2 - 6)`로 중심을 `[통로 lo + hw, 통로 hi - hw]`에 클램프하고 `tx`도 같은 범위로 클램프. 벽 밖에서는 `[80 + hw', 400 - hw']`(hw' = min(formationHalfWidth, 60)). `compressUnits(units, lo, hi)`는 유닛 dx를 `[lo - run.x, hi - run.x]`로 압축(비례 축소).
- **벽 진입 규칙**: 진입 STEP = `prevZ < wall.z0 - 60 <= z`. `side = x < (x0+x1)/2 ? 'L' : (x > mid ? 'R' : (tx < mid ? 'L' : 'R'))`(정확히 중앙이고 tx도 중앙이면 'L'). `run.wallSide[wall.id] = side`로 저장, 그 STEP에 중심을 통로 안으로 스냅. `z > wall.z1`이면 삭제.
- 피해 판정은 **유닛 원 단위**: 적탄/적 본체의 이동 구간(스윕)이 유닛 원(중심 `(run.x+dx, run.z - dy)`, r 9)과 겹치는 유닛 중 가장 가까운 1명에 명중. 겹치는 유닛이 없으면 명중 없음(대형 빈틈을 지나는 탄은 아무도 안 맞는다). 유닛 hp ≤ 0 → 제거 → `layoutUnits`.
- 패배: `units.length === 0`(11단계에서 판정).
- 상한 `unitCap = 150`(추가 시 클램프).

### 3-6. 벽

```js
{ id, z0, z1, x0, x1 }     // 중앙 분리벽 예: x0 228, x1 252 → 좌 통로 [80,228], 우 통로 [252,400]
```
- 부대 중심 제약(3-5). **모든 탄(아군·적)**은 스윕 구간이 벽 사각형(`z0..z1` × `x0..x1`)과 겹치면 소멸(`dead`), 다른 명중보다 먼저. 적은 벽 안에 스폰하지 않는다(정의 책임). heavy 폭발은 벽 반대편 적에 적용하지 않는다(폭발 중심과 적 x가 벽 x 범위를 사이에 두면 제외).

### 3-7. 적

| kind | hp | r | vz(세계) | 행동 | 접촉 |
|---|---|---|---|---|---|
| grunt | 2 | 14 | 60 | x를 `run.x` 쪽으로 35px/s 추종(2026-09-10 90→35: 무조작이어도 사선에 들어와 죽던 것을 완화 — 옆에서 오는 잡졸은 조준해야 잡힌다) | 유닛 hp −1, 적 소모 |
| rusher | 4 | 18 | 90 → 가속 260/s², 최대 420 | 스폰 x 직진(비켜야 한다) | 유닛 hp −2, 적 소모 |
| shooter | 6 | 22 | 0(도로 고정) | 1.6s마다 예고 0.5s 후 탄 1발(적탄 vz 260, dmg 1, r 5), 조준 = 발사 시점 `(run.x, run.z)` | 없음(부대 줄 지나면 소멸) |
| elite(정예) | 스테이지 고정 | 48 | — | `run.boss`. 스폰 z = run.z + 760, `descend`: z가 `run.z + 420`(화면 y 220)까지 150/s로 하강 후 `hold`: 좌우 60px/s 왕복(80+r~400−r). 1.0s마다 부채꼴 3발(적탄 vz 230, dmg 1, 각도 ±18°). S3 정예는 4s마다 잡졸 2(정예 x±40, z = 정예 z −40)에 소환 | 정예 원과 유닛 원이 겹치면 0.5s마다 겹친 유닛 중 앞줄 1명 hp −3 |

- 적 HP는 **스테이지 정의 고정값**. 등장 시 병력에 비례시키지 않는다.
- 적·보스는 hp ≤ 0이 되는 **즉시 `dead = true`**가 되어 같은 STEP의 이후 처리(이동·발사·접촉·충돌 후보)에서 제외된다(탄과 같은 원칙). 제거는 10단계.
- 접촉(잡졸·돌격체): 적 스윕 `[pz, z]`(부대 쪽으로 이동하므로 z 감소)가 유닛 원과 겹치면 겹친 유닛 중 앞줄(dy 최소) 1명에 피해, 적 `touched = true, dead = true`(kills에 세지 않음, `lossByTouch`). STEP당 1회.
- 적 스폰: 스테이지 이벤트 `{ z, kind, n, xs: [..], zs: [..] }` — 좌표는 buildStage가 확정(차선 대역 균등 분산 + 지터, 벽 안 금지). 발동 = `ev.z <= run.z`(정예는 `run.boss` 배정). **보스가 있는 동안 z가 멈추므로 스폰·통과 판정도 멈춘다.**

## 4. STEP 처리 순서(`combat.stepRun(run, input, STEP)`)

`input = { pointerX: number|null, dragDx: number, keyDir: -1|0|1 }`(셸이 STEP 직전에 스냅샷, 호출 후 `dragDx = 0`).

1. 조향: `pointerX !== null`이면 `tx = pointerX`; `tx += dragDx`; `tx += keyDir * 420 * STEP`. 부대 중심 이동(지수 추종 followRate 9 + 속도 상한 250px/s) → `clampCenter`(벽 진입 규칙 포함, tx도 클램프) → `compressUnits`.
2. `prevZ = z`; `boss`가 없으면 `z += scroll·STEP`; `time += STEP`.
3. 스폰 이벤트(`ev.z <= z`, 커서 소비) — 정예는 `run.boss`.
4. 유닛 사격: `fireT -= STEP`; ≤ 0이면 탄 생성 + `fireT += interval`. 이벤트 `fire {count}`(STEP당 1개).
5. 아군 탄: `pz = z; z += vz·STEP`. 각 탄에 대해 후보(벽, 미개봉·미missed 통, 미통과 게이트 행, `!dead` 적·보스) 중 **스윕 구간 안에서 z가 가장 작은(가장 가까운) 것 1개**만 처리. 동일 z면 벽 > 통 > 게이트 > 적. 통 개봉·적 사망은 이 단계에서 즉시 `opened`/`dead`가 되어 다음 탄의 후보에서 빠진다(예: hp 2 잡졸에 30발 → 2발만 소모, 28발은 뒤로). 보상은 `pendingRewards`에만 쌓는다.
6. 적 이동·행동(`!dead`만): grunt 추종·전진, rusher 가속, shooter 예고/발사, 보스 하강/왕복/사격/소환. `pz = z; z -= vz·STEP`.
7. 적 탄: `pz = z; z -= vz·STEP; x += vx·STEP`. 벽 → 소멸. 유닛 원 스윕 명중(가장 가까운 유닛) → hp −dmg, `lossByShot`. `dead` 탄은 이후 제외.
8. 접촉(`!dead` 잡졸·돌격체 스윕 vs 유닛 원; 보스 타이머 접촉).
9. **보상·통과 적용**: (a) `pendingRewards` 순서대로 적용(병사 추가·무기·chain 활성) (b) `passGateRow`(행마다) (c) `passSupply` (d) `takePads`. 유닛 수 변화 후 `layoutUnits`.
10. 정리: `dead` 적 중 `!touched`는 `kills++`(이벤트 `kill`), 보스 사망 → `bossKill`, `dead` 탄·적탄 제거, 범위 밖 정리. `peak = max(peak, units.length)`.
11. 승패: `units.length === 0` → `over = true`. 승리: 정예가 있는 스테이지는 `boss가 격파됨 && enemies에 살아 있는 적 없음`, 정예가 없는 스테이지는 `z >= stage.length && 적 없음`. 승리 시 `won = true, wonAt = time`. 같은 STEP에 둘 다 성립하면 승리 우선(보상이 사망보다 먼저 적용되므로 병사가 남아 있다).

셸은 프레임 끝에 `drainEvents(run)`으로 누적 이벤트를 한 번에 소비한다(프레임당 STEP이 여러 번이어도 유실 없음). 발사음은 프레임 내 `fire.count` 합으로 1회 재생.

## 5. 스테이지 3개(고정 배치, z 단위 = px, scroll 190px/s)

시간 = 물체가 **부대 줄에 도달하는 시각**(z/190). 화면에 보이는 시간은 그 전 4.0초(y −120)·3.4초(y 0). 소총 1명이 초당 2발이므로 내구 4는 2초면 연다. 첫 물체는 z ≥ 1100(안내 문구를 읽을 시간). 정예가 있으면 정예 격파 즉시 승리(빈 도로 없음).

### S1 「첫 진격」 (시작 1명·rifle, 정예 z 7200)
| z | 도달 | 내용 |
|---|---|---|
| 1140 | 6.0s | 게이트 행: 우 `[240,400)` +1, `bypass`(좌는 빈 길). maxValue 15 |
| 2100 | 11.0s | 병사 통 x 240, 내구 4, 병사 2 |
| 3040 | 16.0s | 게이트 행: 좌 `[80,240)` −9, `bypass`(우는 빈 길). maxValue 15 |
| 3800 | 20.0s | grunt 4 (xs 120/200/280/360, zs +0/+40/+80/+120) |
| 4180 | 22.0s | 무기 통 auto, x 240, 내구 8 |
| 5300 | 27.9s | grunt 6 (2열) |
| 5890 | 31.0s | 병사 통 좌 x 150 내구 6 병사 2 / 우 x 330 내구 10 병사 4 |
| 7200 | 37.9s | 정예 hp 120 (부채꼴 3발, 소환 없음) |
| length 7600 | | |

### S2 「갈림길」 (시작 2명·rifle, 정예 z 8200)
| z | 도달 | 내용 |
|---|---|---|
| 1140 | 6.0s | 게이트 행: 좌 `[80,240)` −6 / 우 `[240,400)` −20 (완전 피복, 둘 다 음수 — 우 칸은 2명 소총 약 19발로 못 뒤집는다(−1). 좌로 옮겨 쏘면 +13). maxValue 20 |
| 1800~3000 | | **분리벽** x 228~252 |
| 2300 | 12.1s | 좌 병사 통 x 120 내구 6 병사 3 (좌 통로 중심 154 의 1명 사선 밖) / 우 무기 통 x 326 auto 내구 12 |
| 3600 | 18.9s | grunt 5 + rusher 4 (xs 110/215/265/370 — 215/265 는 중앙 1명 사선(±20) 밖·접촉 반경(27) 안: 비켜야 한다) |
| 4600 | 24.2s | shooter 3 (x 150, 240, 330; 도로 고정) |
| 5400 | 28.4s | 게이트 행: 좌 +2 / 우 −20 (완전 피복) |
| 5800 | 30.5s | 병사 통 x 330 내구 15 병사 5 (−20 뒤의 보상) |
| 7000 | 36.8s | grunt 8 |
| 8200 | 43.2s | 정예 hp 220 |
| length 8600 | | |

### S3 「군단」 (시작 3명·rifle, 정예 z 10600)
| z | 도달 | 내용 |
|---|---|---|
| 1100 / 1500 / 1900 | 5.8/7.9/10.0s | 병사 통 x 160 / 320 / 160 내구 4·5·6, 병사 2·2·3 (좌우 번갈아 — x 240 고정 사격은 닿지 않는다) |
| 2800 | 14.7s | **연속 증원 컨테이너** x 320 내구 10, 발판 5, 최대 15 |
| 4000 | 21.1s | 게이트 행: 좌 +3 / 우 −25 (완전 피복). maxValue 40 |
| 4400 | 23.2s | 무기 통 heavy x 330 내구 24 (−25 뒤의 보상) |
| 5200 | 27.4s | grunt 14 (2열) |
| 6000~7200 | | **분리벽** x 228~252 |
| 6300 | 33.2s | 좌 shooter 2 (x 120, 190) / 우 병사 통 x 326 내구 12 병사 6 |
| 8000 | 42.1s | rusher 6 (xs 100/160/210/270/320/380) |
| 8800 | 46.3s | grunt 18 + shooter 3 (x 130, 240, 350) |
| 10600 | 55.8s | 정예 hp 500, 4s마다 grunt 2 소환 |
| length 11000 | | |

시간 표기는 정예 전투 시간 제외. `stageMeta(id)` = `{ id, title, startUnits, startWeapon, length, eliteZ }`.

**난이도 튜닝(2026-09-10, 기획 §10):** 소총 1명이 한 게이트에 넣을 수 있는 탄은 화면 안 약 9발(탄 정리선 run.z+650, 비행 포함 ≈ 893px ÷ 190px/s ≈ 4.7s × 2발/s)이라 병력 5명만 넘어도 어떤 음수 칸이든 상한까지 뒤집힌다. 그래서 좋은 칸의 maxValue 는 건드리지 않고, (1) 무조작이 서 있는 우 칸 `[240,400)` 의 음수를 초기 병력으로 못 뒤집는 값(S2 −20 / S3 −25)으로 내리고, (2) S2·S3 의 초반 병사 통·컨테이너를 x 240 사선 밖(120 / 160·320)에 두어 조작 없이는 병력이 늘지 않게 하고, (3) 돌격체를 중앙 부근(215/265·210/270)에 추가해 비켜야 하는 위협을 만들었다. S1 은 그대로 무조작 완주 보장(첫 스테이지 성공 경로). 검증 = V3-SIM(조준 봇 3스테이지 완주) + V3-SIM-NOOP(무조작 S2·S3 실패).

## 6. 화면(`render.js`)과 셸(`main.js`)

- 렌더는 `view.now`(셸 시계)만 쓰고 `performance.now()`를 직접 읽지 않는다. DPR 반영(백킹스토어 = CSS 크기 × min(devicePixelRatio, 2)).
- HUD 상단: `STAGE n 제목` + 목표(남은 거리 m, 정예 등장 후 정예 HP 막대+숫자). 부대 발밑: 병력 수. 우상단: 무기 아이콘·이름. 부대 중심 표시(작은 삼각 마커 — 게이트 칸 판정 기준).
- 첫 플레이 안내: 출격 후 3초간 "좌우로 드래그 · 쏴서 숫자를 키우세요" 한 줄.
- 게이트: 칸 사각형 + 부호 숫자(큰 글씨) + 색. 피격 시 흰 플래시·숫자 튐. 통과 뒤 흐리게.
- 보급: 통 그림(기존 SUPPLY 스프라이트 재사용) 위에 내용물(병사 실루엣 n / 무기 아이콘 / 파란 설비) + 내구 숫자. 파괴 시 보상 팝(0.5초 떠오른 뒤 부대로 흡수). chain 발판은 파란 발판 열 + 각 발판 "+1".
- 벽: 도로 위 회색 분리대(상단 하이라이트). 정예 등장: 0.8초 "정예 접근!" 경고 배너 + 효과음.
- 탄: 무기별 색·폭. 유닛마다 그린다(150명 이하). 적탄 5종 그리기는 기존 헬퍼 복제.
- 상태: `title → run → paused → result(won|lost)`. result: 성공/실패, 생존 병력, 최고 병력, 시간, 처치 + 실패 시 놓친 것 한 줄(`missedSupplies`·`badGatesPassed`·`lossByTouch/lossByShot`로 생성: 예 "병사 통 2개를 놓침 · −게이트 1회 통과") + 버튼 [다시 도전] [다음 작전(성공 시)] [스테이지 선택]. 저장 실패 시 "기록 저장 안 됨" 한 줄.
- 입력: 마우스 호버 = 절대 x(`pointerX`), 터치 = 드래그 상대 이동(`dragDx` 누적, 손가락 댄 위치로 튀지 않음), 좌우 키(`keyDir`). ESC/⏸ 일시정지. blur·visibilitychange·pointercancel → 자동 일시정지 + 드래그 상태 해제 + `dragDx = 0`.
- 루프(`makeLoop`): `acc = min(acc + dt, 5·STEP)`(초과 폐기), 일시정지 진입·해제 시 `acc = 0, last = now`, run 상태가 아닌 프레임은 acc 갱신 없음. 프레임당 최대 5 STEP. `window.__rush3Dbg()`로 `{state, stageId, z, x, units, weapon, boss, enemies, bullets}` 노출.
- 오디오 이벤트: fire(무기별, 프레임 1회, 볼륨 = min(1, 0.4 + count/40)), crateHit, crateBreak, gateTick, gateFlip, joinMany(3명 이상 합류), weaponSwap, hurt, kill, elite, win, lose.

## 7. 저장(`save.js`)

- 키 `starforgeRush.v3`: `{ v: 3, stages: { [id]: { cleared, attempts, bestSurvivors, bestTime } }, lastStage, volume, mute }`.
- load: `v === 3 && stages가 plain object`가 아니면 원문을 `starforgeRush.v3.bak`에 보존(가능할 때) 후 기본값. 스테이지 필드는 `Number.isFinite`로 강제. `getStage/updateStage`는 깊은 병합. localStorage 접근·setItem·stringify 예외 전부 try, `ok` 플래그.
- `starforgeRush.v1`은 읽지도 쓰지도 않는다.

## 8. 검증(`tests/rush3-*.test.mjs`, ID 접두 `V3-`)

- V3-GATE: −2에 유효탄 3발 → +1; 통과 시 1명 증가; 통과 뒤 탄 5발 → 값·병력 불변; maxValue 클램프; 0 통과 무효과; 두 칸 행에서 중심 240 → 우 칸 적용(반열림); 중심 기준 1칸만; 행 단위 passed.
- V3-GATE-SCROLL: 스크롤 켠 상태에서 탄 위상을 STEP 안 0~1 전 구간(20분할)으로 훑어 게이트 명중 100%, 게이트 뒤 통 내구 불변.
- V3-SUPPLY: 내구 10·병사 2 통에 dmg 1 탄 10발 → 정확히 2명 합류, 11발째 무효; 내구 4 통에 한 STEP 10발 → 4발 소모 + 6발은 뒤 물체로; missed 뒤 탄 20발 → 불변; weapon 동급·하급 무시.
- V3-CHAIN: 활성화 → 발판 5; 유효탄 3발 → 8; maxPads 클램프; 통과 시 발판당 1회; locked 뒤 히트 무효.
- V3-ORDER: 한 발이 앞의 통과 뒤의 게이트를 동시에 처리하지 않음; 동일 STEP에 hp 2 잡졸에 30발 → 2발 소모·kills 1·28발 관통; STEP 5에서 격파된 잡졸이 같은 STEP 8에서 유닛을 깎지 않음(touched=false, kills+1); 유닛 1명 hp 1인 STEP에 통 개봉 +2와 접촉 −1이 겹쳐도 over=false.
- V3-FIRE: 병사 1/10/30명에서 1초 누적 탄 수 비례; 30명 탄의 x 열 수 ≥ 20(한 점으로 모이지 않음).
- V3-WEAPON: auto 통 파괴 → `weapon='auto'`; 병력 30→1 감소 후에도 유지; rifle 통은 무시.
- V3-WALL: x 240 무조작 진입 → 한쪽 통로로 스냅(벽 안에 남지 않음, lo ≤ hi); n=1·n=60 모두 유닛 dx 통로 안; 벽 끝 뒤 해제; 아군 탄·적탄 모두 벽에서 소멸; 좌측 shooter가 우측 통로 부대를 쏜 탄이 벽에서 소멸; 드래그 +500 누적 뒤 −20 → 그 STEP에 tx 감소(클램프).
- V3-HIT: 대형 빈틈(간격 > 2r+탄 r)을 지나는 적탄은 피해 0; rusher가 어느 위상으로 와도 정확히 1회 접촉; 유닛 hp가 개별로 깎임.
- V3-DEAD: 소각/흡수 탄과 dead 적이 같은 STEP 뒤 처리에서 제외.
- V3-HP: 적·정예 HP가 등장 시 병력과 무관.
- V3-RETRY: 한 판에서 통 파괴·게이트 피격·통과 후 `buildStage` 재호출 → 모든 durability/value/passed/opened 초기값, 이전 run과 참조 공유 없음; `buildStage` 두 번 deep-equal.
- V3-DETERMINISM: STEP 인덱스별 입력열 하나를 30/60/120Hz dt 열에 얹어 `makeLoop`로 돌려 STEP 수·최종 상태 동일; dt 3초 프레임 1개 → 정확히 5 STEP, 이어지는 16.7ms → 1 STEP.
- V3-PURE: `rush3/{combat,gates,supply,squad,weapons,stages}.js` 소스에 `Math.random`·`rng` import가 없다(정적 검사 — 소스 정규식 대조는 이 1건뿐).
- V3-STAGES: 행별 칸 합집합(bypass 아닌 행 80~400 완전 피복), 적 스폰 좌표가 벽 안에 없음, 첫 물체 z ≥ 1100, 정예 z < length.
- V3-SIM: 봇(가장 가까운 통/양수 칸 차선으로 tx 이동) S1·S2·S3 완주; 무조작 봇(tx 240 고정) S1 완주; 정예 격파 후 1 STEP 안에 won.
- V3-SIM-NOOP: 무조작 봇(tx 240 고정)은 S2·S3 에서 실패(units 0 → over, won 아님, 실패 z < length, peak 는 조준 봇 peak 의 1/4 미만).
- V3-WIN: 정예 격파 즉시 won; 정예 없는 스테이지는 length 도달·적 없음.
- V3-SAVE: 새 저장/`"abc"`/`{v:1,best:3}`/`{v:3,stages:null}`/`{v:3,stages:{1:{attempts:"x"}}}`/setItem 예외 → 전부 진행 가능, ok 플래그.
- V3-INPUT: 순수 입력 상태 모듈로 pointercancel/blur 시 drag=false·dragDx=0.

## 9. 기존 코드 재사용 결선표(분석 결과 반영, 근거 = `newmode/v3/analysis/01~06`)

**대원칙: 기존 `rush/` 파일과 `tests/rush-*.test.mjs`는 한 줄도 수정하지 않는다.** 기존 게임은 `rush.html`에서 그대로 동작해야 한다.

| 기존 | v3 처리 | 이유 |
|---|---|---|
| `rush/rng.js` (mulberry32, hashSeed) | **import 그대로** (buildStage의 좌표 확정·셸 연출 스트림) | 순수 함수 |
| `rush/sprites.js` | **복제 → `rush3/sprites.js`** (v3 키: M01, SOLDIER, SUPPLY, GATE, BG1~3, E1_scrapbit(grunt), E5_wheeler(rusher), E4_signaler(shooter), B1_grader(elite). `loadSprites3(base)`) | 키 목록 상수·30장 전부 로드·SPRITES-KEYS 테스트 개수 고정 |
| `rush/audio.js` | **복제 → `rush3/audio.js`** (v3 SFX 맵 6장 참조. fire 3종 = 기존 fire/fireL/fireM 파일. `bgmPlay(name)` 공개. 발사음 프레임 1회 + 볼륨 상한) | 경로·맵 상수, bgm 5구간 전제 |
| `rush/render.js` | **헬퍼만 복제 → `rush3/render.js`**: drawImgCentered/shadow/roundRect/drawParts/drawFloaters/drawButtons/흔들림·비네트·일시정지 오버레이/적 스프라이트 폴백/적탄 그리기. 게이트·보급·부대·벽·HUD·결과는 신규 | createRenderer 클로저 하나만 export, 폐지 규칙 결합 |
| `rush/main.js` | **골격만 참고**: hitButton/toLogical/spawnBurst/autoPause/오디오 unlock/ESC/음량 버튼/sfxQueue/로드 후 루프 시작/`#game3` 가드. **`rush/main.js` import 금지**(자동 부트가 같은 캔버스에 붙음) | 진행 규칙 전부 다름 |
| `rush/combat.js` | **신규**. 적 행동(가속·조준 예고·부채꼴·보스 왕복/소환)만 옮겨 적음 | count 단일 화력·부대 원 판정 |
| `rush/gates.js`, `squad.js`, `track.js` | **import 금지, 신규**. squad의 링 대형 알고리즘만 옮겨 적음 | 폐지 규칙 |
| `rush/balance.js` | **값만 옮김**(색·부대 크기·연출 상수·적 파라미터). 참조 공유 금지 | mutable export, 폐지 상수 혼재 |
| `rush/save.js` | **복제 → `rush3/save.js`**(7장) | 키 상수·얕은 병합 |
| `rush/upgrades.js`, `daily.js`, `fx-state.js` | 1단계 미사용 | 순수 모드에 성장 유입 금지 |
| `tests/rush-*.test.mjs` | 존치·통과 유지. v3는 `rush3-*`, 소스 정규식 대조는 V3-PURE 1건만(test-quality-ratchet 상한 102 안) | 레거시 잠금 |
| `rush.html` | **복제 → `rush3.html`(루트)**: `<canvas id="game3">`, `<script type="module" src="rush3/main.js">` | 자산 상대경로 |
