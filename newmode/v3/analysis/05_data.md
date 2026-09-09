# 05. 데이터 모듈 분석 — track / balance / save / upgrades / daily / rng / fx-state

작성일: 2026-09-09
분석 기준 코드: 워크트리 `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar`, 브랜치 `claude/starforge-v3`, HEAD `c11922f` (2026-09-07)
대상 파일: `rush/track.js`, `rush/balance.js`, `rush/save.js`, `rush/upgrades.js`, `rush/daily.js`, `rush/rng.js`, `rush/fx-state.js` (참고로 `rush/gates.js`의 `makeGatePair`와 `rush/main.js`·`rush/combat.js`의 소비 지점을 함께 읽었다)

확인 방법
- 7개 파일 전문 정독 + 소비처(main.js, combat.js, render.js, squad.js) 교차 확인.
- `node --test tests/rush-core.test.mjs tests/rush-meta.test.mjs tests/rush-sim.test.mjs tests/rush.test.mjs` — 38건 통과(HEAD 기준 실행). `rush.test.mjs`는 본게임의 RUSH 어픽스 테스트라 이 모드와 무관하고, 실제로 이 7개 파일을 잠그는 것은 `rush-core`(rng·track), `rush-meta`(save·upgrades·daily·fx-state), `rush-sim`(track+combat 봇 완주) 세 파일이다.
- 프로브 스크립트로 `buildTrack` 통계(시드 5개 + 시드 1..200 스캔)와 `BAL` 키 사용처를 실측했다.
- 대표 판정: **adapt(손봐서 재사용)**. 순수 유틸(rng·daily·save 골격·fx-state 일부)은 그대로 쓸 수 있고, 트랙 생성기와 밸런스 표의 러너 전용 부분은 v3 규칙과 정면으로 충돌하므로 교체한다.

---

## 0. 03 전달서(9/3 압축본)와 최신 코드의 차이

03 전달서는 2026-09-03 압축본 기준이라고 명시했다. `git diff 6155b30~1..HEAD`(9/3 첫 커밋 직전 → HEAD)로 확인한 이 7개 파일의 실제 차이는 다음과 같다. `daily.js`, `rng.js`, `fx-state.js`는 변경 없음.

| 항목 | 9/3 압축본 | HEAD(c11922f) | v3 기획과의 관계 |
|---|---|---|---|
| 보스 체력 | `boss.baseHp:160, hpPerTroop:3.4` (병력 비례) | `boss.hpByZone:[560,1250,2400,3600,5200]` 구간 고정 (`balance.js:42`, 소비 `combat.js:33`) | 01 §12 "병력에 비례한 보스 HP → 스테이지 기준 HP" 행은 **이미 HEAD에서 해소**됨. 다만 `bosses[].hpMult`(`balance.js:45-49`)는 이제 아무 데서도 읽지 않는 죽은 필드다(`combat.js:33`은 hpByZone만 사용). |
| 강등 | 즉시 강등 | `demoteRatio:0.75` 히스테리시스 (`balance.js:12`, 소비 `squad.js:36`) | 01 §12 "병력 상실 시 즉시 강등"은 이미 완충됐지만, v3는 병력 기준 무기 진화 자체를 폐지하므로 어차피 교체 대상. |
| 영구 성장 | 3트랙(startTroops·fireRate·magnet) | **4트랙** — `upgrades.moveSpeed` 추가 (`balance.js:59`), `save DEFAULTS.up.moveSpeed` (`save.js:3`), `effects().moveMult` (`upgrades.js:26`), 소비 `main.js:441` | 03 §2 "영구 성장 3버튼" 표현은 4버튼이 됐다. `rush-meta.test.mjs:38-39`도 `moveMult`를 deepEqual로 잠근다. |
| POW(버스터) | 트랙 이벤트(`roll<0.19`로 wave kind 'pow') | 트랙에서 제거, 적 처치 드랍으로 이동 (`combat.js:280-281`, `fx.powDropRate/powDropCd` `balance.js:52`) | 트랙 이벤트 종류가 gatepair/wave(kind 포함 supply)/boss 3종으로 정리됨. `rush-core.test.mjs:63`은 여전히 'pow'를 허용 목록에 두고 있다(무해). |
| 트랙 장면 | 무작위 게이트쌍 + 웨이브 | **손제작 장면 3종(S1/S2/S3)** + 호위(escort) 배치 + `lane` 필드 (`track.js:37-73`) | 이벤트 data에 `lane`, `escort:{gateZ,dy}`, 게이트에 `greed` 필드가 늘었다. 03 §2의 "무작위 단일 buildTrack" 설명은 여전히 맞지만 데이터 형태가 달라졌다. |
| 이어하기 | `continueTroops:10` | `continueByZone:[10,25,45,70,100]` 추가됐으나 **미배선** — `main.js:357`, `render.js:531`은 여전히 `continueTroops`(10)만 읽는다 | 01 §12 "부활 10명 고정"은 HEAD 실동작과 일치. 커밋 5028f06 메시지("이어하기 구간 비례 복구")와 코드가 어긋난 상태. |
| 잡졸 체력 | scrapbit 2 / wheeler 3 | 1 / 1 (`balance.js:21-22`) | 수치만. |
| 갠트리 위도우 | — | `hookAt:0.6` (`balance.js:46`) | 수치만. |

---

## 1. export 목록과 시그니처·용도

### rush/track.js
| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `ZONE_NEW_KINDS` | `string[5][2]` | 구간 i에 처음 합류하는 적 2종 | `track.js:10-16` |
| `zonePool(zone)` | `(zone:number) => string[]` | 0..zone 구간의 적을 누적한 풀. 해당 구간 신규 종은 2번 넣어 가중 2배 | `track.js:18-25` |
| `buildTrack(seed)` | `(seed:number) => { events: Event[], length: 57000 }` | 시드 하나로 5구간 판 전체의 이벤트 배열 생성 | `track.js:27-91` |

### rush/balance.js
| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `BAL` | 중첩 객체(동결 아님) | 수치 단일 진실. 그룹: `track, squad, tiers, demoteRatio, gates, enemies, boss, bosses, coins, fx, upgrades` | `balance.js:2-61` |

### rush/save.js
| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `createSave(storage?)` | `(storage?: {getItem,setItem}) => { get(): Data, patch(obj): void }` | 단일 키 JSON 저장소. storage 미주입 시 `globalThis.localStorage`, 접근 예외 시 메모리 Map 폴백 | `save.js:5-23` |
| (비export) `KEY` | `'starforgeRush.v1'` 모듈 상수 | 저장 키. 외부에서 바꿀 수 없다 | `save.js:2` |
| (비export) `DEFAULTS` | 아래 §2-3 | 기본값 | `save.js:3` |

### rush/upgrades.js
| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `upCost(track, lvl)` | `(track:string, lvl:number) => number \| null` | 다음 레벨 비용. 트랙 없음/상한이면 null | `upgrades.js:4-8` |
| `buy(save, track)` | `(save, track) => boolean` | 코인 차감 + `up[track]+1`을 `save.patch`로 기록 | `upgrades.js:10-17` |
| `effects(up, isDaily)` | `(up, isDaily:boolean) => { startCount, fireRateMult, magnetMult, moveMult }` | 레벨 → 배율 환산. `isDaily`면 전부 중립값 | `upgrades.js:19-28` |

### rush/daily.js
| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `todayKey(d = new Date())` | `=> 'YYYY-MM-DD'` | 기기 로컬 날짜 키 | `daily.js:2-4` |
| `isFirstRunToday(data, key)` | `=> boolean` | `data.lastPlayDay !== key` | `daily.js:6` |
| `shareText(key, best)` | `=> string` | "스타포지 러시 M/D 도전 — 병력 N!" 고정 문구 | `daily.js:8-11` |

### rush/rng.js
| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `mulberry32(seed)` | `(seed:number) => () => number` | 시드형 PRNG, [0,1) | `rng.js:2-11` |
| `hashSeed(str)` | `(str:string) => uint32` | FNV-1a 해시 | `rng.js:13-17` |
| `dateSeed(d = new Date())` | `=> { key:'YYYY-MM-DD', seed: hashSeed('rush-daily-' + key) }` | 오늘의 도전 시드. 접두어 `'rush-daily-'` 고정, 버전 없음 | `rng.js:19-22` |

### rush/fx-state.js
| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `recordWatcher(best)` | `=> { update(count) => 'break' \| null }` | 기록 갱신 순간 1회 신호. `best===0`이면 `count>1`에 1회 | `fx-state.js:4-11` |
| `slowmoCtl()` | `=> { update(count, dt) => timeScale }` | 병력 ≤ `BAL.fx.slowmoAt`(5) 진입 시 0.4배 0.5초, 판당 최대 2회, 다시 5 초과로 올라가야 재무장 | `fx-state.js:13-21` |
| `continueToken(isDaily)` | `=> { canUse(), use() }` | 이어하기 판당 1회, 오늘의 도전 불가 | `fx-state.js:23-29` |

---

## 2. 내부 데이터 형태

### 2-1. 트랙 이벤트 (`buildTrack` 반환)

```
Track = { events: Event[], length: 57000 }        // track.js:90, BAL.track.length
Event = { z: number, type: 'gatepair' | 'wave' | 'boss', data: ... }
```

| type | data | 생성 지점 | 소비 지점 |
|---|---|---|---|
| `gatepair` | `{ left: Gate, right: Gate }` / `Gate = { op:'add'\|'sub'\|'div', value:number, greed?:true }` (`'mul'`은 `GATE_OPS`에만 남고 생성되지 않음 — `gates.js:23-24`) | `track.js:52,61,65,74`, `gates.js:34-43` | 통과 판정 `main.js:78-89`, 피격 파괴 `main.js:116-140` |
| `wave` | `{ kind: 적키 \| 'supply', n:number, lane?:'L'\|'R', escort?:{ gateZ:number, dy:number } }` | `track.js:55-56,62,68-70,78,84` | `main.js:90-106` → `spawnWave(st, kind, n, rnd, hpMult, zone, lane)` (`combat.js:8`) |
| `boss` | `{ zone: 0..4 }` | `track.js:87` | `main.js:107-113` → `spawnBoss` |

구조 상수(`balance.js:4`): 5구간 × `zoneLen 11400` = 57000. 게이트 간격 `gateEvery 780`, 첫 게이트 `firstGateZ 300`, 구간 시작 후 1000 여유(`track.js:33`), 보스 앞 900은 게이트 없음(`track.js:34`). 웨이브는 게이트 뒤 z+90부터 `waveEvery 200` 간격으로 z+720 직전까지(`track.js:75`), 14%는 보급(`track.js:77`).

장면(scene) 분기(`track.js:39`): 구간 마지막 게이트가 아니고 `sceneRoll < 0.4`이면 손제작 장면 3종 중 하나. 주석은 "약 30%"(`track.js:37`)라고 적혀 있으나 문턱은 0.4다. 호위 웨이브는 `z = gateZ − 660`(`track.js:47`)에 붙는다.
- S1(`track.js:48-56`): 작은 +게이트 vs 큰 +게이트(`greed`), 큰 쪽 라인에 적 두 겹(dy 80/170).
- S2(`track.js:57-62`): +게이트 vs −게이트(`greed`), −쪽 라인 뒤에 보급 1개(dy −60).
- S3(`track.js:63-71`): `makeGatePair(rnd, t, true)` + 적 두 겹 + 보급.

정렬(`track.js:89`): `a.z - b.z || (a.type === 'boss' ? 1 : -1)`. 같은 z에서 boss만 뒤로 보내고, 둘 다 non-boss면 항상 −1을 돌려주는 **비대칭 비교자**다. V8의 안정 정렬 덕에 현재는 결정적이지만 비교자 규약 위반이라 엔진에 따라 순서가 달라질 수 있다.

실측(프로브, 시드 1/42/43/1000/오늘): 게이트쌍은 시드와 무관하게 **66개 고정**, 장면 게이트 21~28개, 이벤트 총 276~297개, 웨이브 205~226개, 보스 5개. 시드 1..200 중 **81개(40.5%)는 첫 게이트(z=300)가 장면**이라 호위 웨이브의 z가 **−360**이 되고, 이는 시작 즉시(run.z=0) 발화한다. `main.js:98`의 배치식 `gy = 640 − (300 − 0) = 340`에 dy를 더하면 y≈420~510, 즉 부대(y 640) 바로 앞에 적 3~4마리가 시작과 동시에 놓인다. 버그인지 의도인지는 코드만으로 단정하지 않는다(§4 위험 8).

런타임 오염: `main.js:125,131,134`가 트랙 안의 Gate 객체에 `hp`, `broken`을 **제자리(in-place)로 추가**한다. 따라서 한 번 진행한 Track 객체는 재사용할 수 없고, 현재 코드는 `newRun`마다 `buildTrack`을 다시 호출해 회피한다(`main.js:34`).

### 2-2. BAL 구조와 실제 소비처

프로브(부분 문자열 검색, `rush/*.js` 중 balance.js 제외)로 확인한 **아무도 읽지 않는 키**: `squad.unitSpacingX`, `squad.unitSpacingY`, `gates.mulVals`(9/2 곱셈 게이트 폐지 후 잔존), `fx.continueByZone`(§0). 여기에 `bosses[].hpMult`(§0)도 죽은 필드다.

| 그룹 | 핵심 필드 | 읽는 곳 | v3 관점 |
|---|---|---|---|
| `track` | length, zoneLen, zones, scrollSpeed 190, gateEvery, firstGateZ, waveEvery, enemyHpMult[5], enemyAdvMult[5], eshotDmg[5], enemySizeMult[5] | `track.js`, `main.js:72,75,92,96`, `combat.js:10-17,237` | 5구간 러너 전용. 구간 배율 5종은 "스테이지 기준 고정값"으로 대체 |
| `squad` | y 640, maxCount 999, moveSpeed 420(키보드 `main.js:436`), baseMoveMax 250(`main.js:441`), followRate, drawCap 130, startCount(주의: `main.js:35`는 `eff.startCount`를 쓴다), heroSize/heroSizes[5]/soldierSize/ringGap/ringStart(그리기), muzzles[5]/bulletW[5]/tierDmgMult[5]/bulletSpeeds[5](티어별 무기), fireInterval 0.5, fireRateCap 7, bulletDmg 1, dmgPerTroop 0.012, touchLossPerHit | `combat.js:53-69,146`, `render.js:153`, `squad.js` | 그리기·이동 상수는 재사용 가능. `muzzles/tierDmgMult/dmgPerTroop`는 "병력 숫자 → 단일 탄 위력"(01 §5-2가 벗어나려는 방식) 그 자체 |
| `tiers` / `demoteRatio` | [1,60,180,360,700] / 0.75 | `squad.js:5,36` | 병력 기준 M1~M5 진화 = v3 §5-6에서 폐지 |
| `gates` | colors{add,mul,sub,div}, addMin 3/addMax 62, mulVals, subMin 5/subMax 90, divVals[2,3], width 150, gap 20, h 64 | `gates.js`, `track.js:40-41`, `main.js:126-129`, render | 색·폭·높이는 재사용 후보. 값 범위는 무작위 생성용이라 폐지. mul/div는 v3 §5-3 "실험용" |
| `enemies[kind]` | 공통 `hp, r, speed, count:[lo,hi], coin` + 선택 `zigzag, accel, maxSpeed, touchLoss, straight, shootEvery, shotSpeed, fan, drawScale, shot, showHp, shieldReduce, deathBurst, aimTime, hopEvery, hopSpeed, hopShock, spawns, spawnN, emitEvery, stealCoins, magnetR, magnetPull, pickup, rewardByZone` | `combat.js` 전반, `render.js:265,283` | 적 10종 정의는 재사용 가치 높음. **`supply`는 `hp 26`(×구간 배율 `combat.js:17`)과 `rewardByZone[zone]`(`combat.js:288`)으로 내구와 보상이 이미 별개 값이지만, 둘 다 '구간'에서 파생돼 이벤트별로 지정할 수 없다** |
| `boss` / `bosses[5]` | hpByZone, touchLossPerSec, shotBonus, phase2At/rageAt/phase2Rate/rageRate/rageSpeed / key,name,hpMult(죽음),r,speed,shootEvery,fan,shotSpeed,coin,ram/hook/sweep/spawn/pool 패턴 | `combat.js:30-36,180-240,316` | 패턴 필드는 도로 보스 재료로 재사용 가능. 체력은 스테이지 정의로 이동 |
| `coins.perDistance` | 0.0015 | `main.js:230` | 러너 전용 |
| `fx` | buster*(3), powDropRate/Cd, slowmo*(4), continueTroops/continueByZone(죽음)/continueInvulnSec, bossHushSec, shakeDur/shakeAmp/hurtFlashDur | `fx-state.js:16-18`, `main.js:73,89,151,171,357`, `combat.js:154,280`, `render.js:531,675` | shake/hurt/hush/slowmo는 재사용. buster·pow는 "선택적 지원 무기"(01 §5-6). continue는 순수 모드 폐지(01 §12) |
| `upgrades` | 4트랙 `{ max, effect, costs[] }` | `upgrades.js`, `main.js:24,310` | 순수 모드에 유입 금지(03 §5) |

주석 부패: `balance.js:3` "판 = 5구간 × 900"은 실제 `zoneLen 11400`과 다르다(900은 초기 값의 흔적).

### 2-3. 저장 스키마 (`starforgeRush.v1`)

```
Data = {
  best: number,                 // 일반 판 최고 병력 (main.js:240)
  coins: number,                // 누적 코인 (main.js:231, upgrades.js:15)
  up: { startTroops, fireRate, magnet, moveSpeed },   // 각 0.. (save.js:3)
  daily: { [ 'YYYY-MM-DD' ]: number },                // 날짜별 오늘의 도전 최고 병력 (main.js:234-237)
  lastPlayDay: 'YYYY-MM-DD' | '',                     // 마지막 일반 판 날짜, 첫판 2배 판정 (main.js:239, daily.js:6)
  mute?: boolean, volume?: number(0..100)             // DEFAULTS에 없음. main.js:217-218,335,342 가 직접 씀
}
```

동작(`save.js`):
- 읽기: 파싱 실패·없음 → `null` → `{...DEFAULTS, ...{}}`(`save.js:9-13`). `up`만 깊이 1 병합(`save.js:14`), `daily`는 통째 대체.
- 쓰기: `patch`는 **얕은 병합**(`save.js:21`) 후 전체 JSON을 한 키에 저장. 그래서 `main.js:234`처럼 호출자가 `daily`를 복사해 통째로 넘긴다.
- 스토리지: 인자 없으면 `localStorage`를 `getItem`으로 한 번 찔러 보고 예외 시 `null`(`save.js:7`), `setItem` 예외 시 메모리 Map으로 조용히 폴백(`save.js:17`). **저장이 실제로 됐는지 외부에서 알 방법이 없다.**
- 없음: 버전 필드, 마이그레이션 훅, 백업, 내보내기/가져오기, 키 파라미터.

### 2-4. 업그레이드 효과 (`effects`)

| 트랙 | 공식 | 상한 | 소비처 |
|---|---|---|---|
| startTroops | `1 + lvl×1` | lvl 9 → 10명 | `main.js:35,40` |
| fireRate | `1 + lvl×0.05` | 1.25 | `combat.js:60` (발사 간격 = 0.5 / (mult × min(7, √count))) |
| magnet | `1 + lvl×0.10` | 1.5 | `main.js:230` 코인 배율 |
| moveSpeed | `1 + lvl×0.08` | 1.4 | `main.js:441` 횡이동 상한 |

`isDaily === true`면 `{1,1,1,1}`(`upgrades.js:20`). 즉 이 플래그가 사실상 "순수 실력 모드" 스위치다.

### 2-5. 일일 시드와 난수 스트림 분리 (현재 main.js가 쓰는 방식)

| 스트림 | 생성 | 용도 | 근거 |
|---|---|---|---|
| 판 시드 | daily: `dateSeed()` / 일반: `hashSeed('r' + Date.now() + Math.random())` | 아래 모든 파생의 루트 | `main.js:28-30` |
| 트랙 | `mulberry32(seed)` | 이벤트 배치 | `track.js:28` |
| 전투 | `mulberry32((seed ^ 0x9E37) >>> 0)` | `stepCombat`의 적탄·드랍 등 | `main.js:34,143` |
| 이벤트별 스폰 | `mulberry32((seed ^ imul(z + 1 + escort.dy, 2654435761)) >>> 0)` | `spawnWave` 위치 지터 | `main.js:95` |
| 파편 | 카운터(`burstSeed`) | 연출 | `main.js:52-63` |

이벤트별 스폰 난수를 z로 재파생하는 방식 덕에 **플레이어의 사격·피해가 이후 스폰 배치를 바꾸지 못한다**(03 §3 "플레이어의 사격 횟수나 피해로 이후 적 배치가 바뀌지 않게"와 같은 목표). 이 패턴은 v3에서 그대로 가져갈 가치가 있다. 반면 `daily` 기록 키는 날짜 문자열뿐이라 03 §5의 "stageVersion + 날짜/시드"를 만족하지 못한다. `dateSeed`의 날짜 키 생성(`rng.js:20`)은 `todayKey`(`daily.js:3`)와 같은 코드가 중복돼 있다.

### 2-6. fx-state 상태기계

- `recordWatcher(best)`: `best>0`이면 `count>best` 순간, `best===0`이면 `count>1` 순간에 각 1회 `'break'`(`fx-state.js:6-9`). 비교 대상이 "병력 수"로 고정.
- `slowmoCtl()`: `BAL.fx.slowmoAt/Dur/Scale/Max`를 직접 참조(`fx-state.js:16-18`). 유일한 BAL 의존.
- `continueToken(isDaily)`: 순수 상태 토큰. 병력 복구값은 여기 없고 `main.js:357`에 있다.

---

## 3. v3 요구 대비 판정 (함수 단위)

판정 기준: 01 §5(전투 규칙)·§12(변경표)·§13(1단계), 03 §2(모듈 방향)·§3(데이터 구분)·§5(저장).

| 파일.export | 판정 | 근거·조치 |
|---|---|---|
| `track.ZONE_NEW_KINDS` | **교체** | 적 등장 순서는 스테이지 정의가 갖는다(03 §3 "적 전체 생성 계획"). 적 키 이름 자체(`scrapbit` 등)는 `BAL.enemies`와 함께 재사용 가능 |
| `track.zonePool` | **교체** | 누적 풀 무작위 추첨 = "처음부터 무작위 생성으로 채우지 않는다"(01 §8)와 충돌 |
| `track.buildTrack` | **교체** (형태만 계승) | 무작위 러너 전용. v3는 `stageDef → Event[]` 컴파일러를 새로 쓴다. 계승할 것: `{z,type,data}` 정렬 배열 + `ei` 커서 소비(`main.js:76-77`), 호위(escort)처럼 "게이트와 나란히 내려오는 배치" 아이디어, `lane` 대역 개념(`combat.js:14`). 버릴 것: gatepair 고정 2칸(→1/2/3칸), wave kind에 'supply'를 끼워 넣는 방식(03 §2 "보급물·벽·게이트를 적 종류에 끼워 넣지 않는다"), 비대칭 정렬 비교자 |
| `balance.BAL` (객체 전체) | **손봐서 재사용(분할)** | 03 §2 "무기·보급·스테이지·영웅·드론별 수치로 구분". 아래 세부 |
| `BAL.squad` 그리기·이동 상수 (y, heroSize(s), soldierSize, ringGap, ringStart, drawCap, followRate, baseMoveMax, bulletW, bulletSpeeds, fireInterval) | 그대로 재사용(값 복사) | 시각·조작 규격. 단 `muzzles/tierDmgMult/dmgPerTroop/fireRateCap`은 병력→위력 환산이라 **교체** (01 §5-2 "병사 1명당 1개의 논리적 사격 주체") |
| `BAL.tiers`, `BAL.demoteRatio` | **교체(폐기)** | 01 §5-6 "병력 기준 M1~M5 자동 진화를 핵심 성장 규칙에서 내린다" |
| `BAL.gates.colors/width/gap/h` | 그대로 재사용 | 표시 규격. 단 1/2/3칸 배치면 `width 150 × 2 + gap 20 = 320` 총폭 가정(`balance.js:17` 주석)을 칸 수별로 다시 정한다 |
| `BAL.gates.addMin..divVals` | **교체(폐기)** | 무작위 값 범위. v3 게이트는 스테이지가 `signedValue/hitIncrement/maxValue`를 직접 지정(03 §3) |
| `BAL.enemies[*]` (supply 제외) | 손봐서 재사용 | 10종 스탯·패턴 필드는 v3 §5-7의 잡졸/돌격체/원거리/장갑 역할에 대부분 대응(ramhound=돌격, signaler/needleeye=원거리, wallguard=장갑). 다만 `count:[lo,hi]`(무작위 수)와 `coin`은 스테이지 정의 쪽으로 |
| `BAL.enemies.supply` | **교체** | 03 §3 파괴형 보급 `{kind, durability, rewardPayload}`. 현재는 내구가 `hp 26 × 구간배율`, 보상이 `rewardByZone[zone]`로 이벤트별 지정 불가 |
| `BAL.boss.*`, `BAL.bosses[*]` | 손봐서 재사용 | 페이즈/광분 임계와 5종 패턴은 도로 보스 재료. `hpByZone`은 스테이지 정의로, `hpMult`는 삭제 |
| `BAL.fx.shake*/hurtFlash*/bossHush*/slowmo*` | 그대로 재사용 | 연출 판정 상수 |
| `BAL.fx.buster*/pow*` | 보류 | 01 §5-6 "버스터는 선택적 지원 무기". 1단계 범위 밖 |
| `BAL.fx.continue*` | **교체(폐기)** | 01 §12 "순수 모드는 재시작". `continueByZone`은 어차피 미배선 |
| `BAL.coins.perDistance`, `BAL.upgrades` | 레거시 전용 | 순수 모드 유입 금지(03 §5) |
| `save.createSave` | **손봐서 재사용** | 골격(주입 스토리지·JSON 1키·메모리 폴백)은 v3에도 맞다. 필요한 손질: (1) 키를 인자로 받게(`createSave(storage, key = KEY)`) — 기존 호출 무영향, rush-meta 통과 유지, (2) 기본값을 인자로 받거나 v3 전용 팩토리, (3) 저장 성공 여부를 노출(03 §6 "저장 권한 불가 상황 대응"), (4) `patch` 얕은 병합 규칙을 문서화하고 v3 중첩 데이터는 상위 키 통째 교체로 통일 |
| `upgrades.upCost/buy/effects` | 레거시 유지 시 그대로 / **v3 순수 모드에서는 호출 금지** | `effects(up, true)`가 중립값을 돌려주므로 순수 모드 스위치로 쓸 수는 있지만, 03 §5 "순수 전투 모드에는 기지 성장·영웅 육성 효과가 유입되지 않는다"를 가장 확실히 지키는 방법은 아예 import하지 않는 것이다. 캠페인 성장(영웅·기지·드론)은 형태가 달라 신규 모듈 |
| `daily.todayKey` | 그대로 재사용 | |
| `daily.isFirstRunToday` | 레거시 전용 | 첫판 코인 2배(`main.js:229`)에만 쓰인다. v3 경제에 첫판 보너스가 없으면 불필요 |
| `daily.shareText` | **교체** | 결과가 병력 수 하나가 아니라 "최고 생존 병력·클리어·시간"(01 §4-A)이며 문구가 하드코딩 |
| `rng.mulberry32`, `rng.hashSeed` | 그대로 재사용 | 결정적 난수의 근간. `rush-core.test.mjs:8-22`가 잠근다 |
| `rng.dateSeed` | **손봐서 재사용** | 03 §2/§5 "일일 코스에 버전 포함". `dailySeed(key, stageVersion)` = `hashSeed('rush-daily-v3-' + stageVersion + '-' + key)` 같은 신규 함수를 v3 쪽에 두고, 기존 `dateSeed`는 레거시 기록 재현용으로 남긴다 |
| `fx-state.recordWatcher` | 손봐서 재사용 | 비교값이 병력 하나로 고정. 스테이지별 기록(최고 생존 병력)에는 그대로 쓸 수 있고, 시간 기록에는 `(value, best, higherIsBetter)`로 일반화 |
| `fx-state.slowmoCtl` | 그대로 재사용 가능 | 병력 ≤5 위기 슬로모는 v3에서도 유효. BAL 직접 참조가 걸리면 상수 주입형으로 |
| `fx-state.continueToken` | **교체(폐기)** | 01 §12 |

---

## 4. 갭과 위험

1. **저장 키·버전 고정** (`save.js:2`): v3 별도 버전 키(03 §5)를 현재 API로는 만들 수 없다. 마이그레이션 훅·백업도 없다.
2. **얕은 `patch`** (`save.js:21`): 중첩 객체를 부분 갱신하면 통째 덮어쓴다. v3 캠페인 데이터(영웅·기지·보상 지급 상태)는 중첩이 깊어 실수 위험이 크다.
3. **저장 실패가 조용함** (`save.js:7,17`): 메모리 폴백이라 "저장이 안 되는 기기"에서 사용자 안내를 띄울 근거가 없다. 03 §6 검증 항목과 충돌.
4. **일일 기록에 버전 없음** (`main.js:234-237`, `rng.js:21`): 규칙이 바뀐 뒤 같은 날짜 기록이 섞인다(03 §5).
5. **최초 클리어 보상 상태 구조 없음**: `stageId + rewardVersion` 1회 지급, 반복 보상표(03 §5)는 전부 신규.
6. **트랙 객체 런타임 오염** (`main.js:125,131,134`): 고정 스테이지 정의를 불변 데이터로 두고 판마다 `compileStage()`로 새 이벤트 배열을 만들어야 "같은 스테이지 재도전"이 성립한다.
7. **비대칭 정렬 비교자** (`track.js:89`): 같은 z 이벤트 순서가 엔진 구현에 의존. v3 컴파일러는 명시적 `seq`(또는 z 뒤 type 우선순위 표)로 전순서를 보장한다.
8. **첫 게이트 장면의 시작 즉시 스폰** (§2-1 실측, 200시드 중 81): 레거시 러너를 v3와 나란히 유지할 경우 확인이 필요하다. v3에는 무관(생성기 교체).
9. **죽은 키·미배선**: `fx.continueByZone`(커밋 의도와 불일치), `bosses[].hpMult`, `gates.mulVals`, `squad.unitSpacingX/Y`. 03 §2 "숨은 상수 최소화"의 대상.
10. **주석 부패**: `balance.js:3` "5구간 × 900", `track.js:37` "약 30%"(실제 0.4).
11. **보급 내구/보상의 구간 파생** (`combat.js:17,288`): 03 §3의 이벤트별 `durability/rewardPayload`를 표현할 자리가 없다.
12. **`BAL`이 동결되지 않은 mutable export**: v3 모듈이 값을 공유하면 한쪽의 수정이 다른 쪽에 번진다.
13. **테스트 결합**: `rush-meta.test.mjs:38-39`는 `effects` 반환 형태를 deepEqual로 고정(필드 추가 시 실패), `rush-core.test.mjs:46-66`은 57000·보스 5·66게이트 규칙을, `rush-sim.test.mjs:120-154`는 트랙+전투 봇 완주를 잠근다. 03 §6 "기존 테스트에 맞추려고 옛 규칙을 남기지 않는다"에 따라 v3 검사는 별도 파일로 두고, 위 세 파일은 레거시 러너를 유지하는 동안만 살린다.
14. **일반 판 시드에 `Math.random`** (`main.js:30`): 시드 생성 한 곳에만 쓰이고 그 뒤는 전부 결정적이므로 재현성 원칙 위반은 아니다. v3 순수 모드는 스테이지가 고정이므로 `seed = hashSeed(stageId + '@' + stageVersion)`으로 시드 자체를 고정하면 "같은 스테이지 = 같은 배치"가 자동으로 성립한다.
15. **03 전달서와의 어긋남**: 4번째 업그레이드, 보스 고정 HP 반영 완료, POW 드랍화, 장면·escort 필드(§0). 03의 표현을 최신 코드에 맞춰 갱신하지 않으면 구현자가 없는 필드를 찾거나 이미 해결된 항목을 다시 만든다.

---

## 5. v3 신규 모듈이 이 파일들을 import할 때의 권장 방식

원칙: 기존 7개 파일은 v3 작업 중 수정하지 않는다(유일한 예외 후보는 `save.js`의 키 인자 추가 — 기존 호출에 영향이 없고 rush-meta가 그대로 통과한다). v3 모듈은 별도 디렉토리(예: `rush/v3/`)에 둔다.

| 기존 export | v3에서의 사용 | 방식 |
|---|---|---|
| `rng.mulberry32`, `rng.hashSeed` | 스테이지 시드·스트림 파생 | `import { mulberry32, hashSeed } from '../rng.js'` 그대로. 스트림은 `main.js:34,95`처럼 `seed ^ 상수`·`seed ^ imul(eventSeq, 2654435761)`로 파생해 "스테이지 배치 / 산개·연출" 난수를 분리(03 §2) |
| `rng.dateSeed` | 쓰지 않음 | v3 전용 `dailySeed(key, stageVersion)` 신설. 레거시 일일 기록 재현에만 기존 함수 유지 |
| `daily.todayKey` | 일일 코스 키 | 그대로 import |
| `daily.isFirstRunToday/shareText` | 쓰지 않음 | 결과 공유 문구는 v3 결과 형식으로 신규 |
| `save.createSave` | v3 저장소 + 레거시 읽기 | (a) `save.js`에 `key` 인자를 추가한 뒤 `createSave(storage, 'starforgeRush.v3')`로 v3 저장소, `createSave(storage)`로 v1 읽기 전용 로드. (b) 수정 불가 방침이면 `save.js`를 본떠 `save3.js`를 새로 쓰고 v1은 `createSave()`로만 읽는다. 어느 쪽이든 **v1 키에는 쓰지 않는다** |
| 레거시 보존 절차 | 부팅 1회 | v3 데이터에 `legacy`가 없고 v1이 있으면 `{ best, coins, up, daily, lastPlayDay, capturedAt }`를 복사해 `legacy`로 저장(03 §5 "마이그레이션 전 백업"). 이미 있으면 덮지 않는다. v1 삭제·수정 금지 |
| `balance.BAL` | 시각·연출 상수만 | `import { BAL as LEGACY_BAL }`로 받아 **필요한 값을 v3 `BAL3`에 복사**하고 참조를 공유하지 않는다(위험 12). `BAL3`는 03 §2대로 `weapons / crates / gates / stages / heroes / drones / fx / view` 네임스페이스로 나누고 `Object.freeze`(깊이) |
| `balance.BAL.enemies[*]` | 적 정의 초안 | 값 복사 후 `count`·`coin`·`rewardByZone`을 떼고, 역할 태그(잡졸/돌격/원거리/장갑/정예)를 붙여 v3 적 표로 |
| `track.*` | import 금지 | 스테이지 정의 → 이벤트 컴파일러를 신규 작성. 이벤트 형태는 `{ z, seq, type, id, data }`, type은 `gate / crate / wall / enemy / reinforce / rescue / boss / arena / bonus`처럼 목적별로 분리(03 §2). 소비는 `main.js:76-77`의 커서 방식을 v3 진행 함수에 재현하되 브라우저와 테스트가 같은 함수를 쓴다(03 §2 main.js 행) |
| `upgrades.*` | 순수 모드 import 금지 | 캠페인 성장은 신규 모듈. 레거시 러너 화면에서만 기존 import 유지 |
| `fx-state.slowmoCtl`, `fx-state.recordWatcher` | 재사용 가능 | 그대로 import 가능. `slowmoCtl`은 `BAL.fx.slowmo*`를 공유하므로 v3 값이 다르면 상수 주입형 사본을 v3에 둔다 |
| `fx-state.continueToken` | import 금지 | 01 §12 |

순수 모드 분리 규칙(요약): 진입 시그니처를 `newSession({ mode: 'pure' | 'campaign' | 'daily', stageId, stageVersion, seed? })`로 두고, `pure`에서는 `effects()`·캠페인 저장 데이터·`legacy`를 전혀 읽지 않는다. 시작 병력·무기·허용 영웅·드론은 스테이지 정의에서만 온다(01 §4-A, 03 §3). `daily`는 `pure` 규칙 + `dailySeed(key, stageVersion)` + 기록 키 `${stageVersion}:${key}`.

---

## 6. 1단계(기준 전투 3개)에 바로 필요한 최소 작업

1. `rush/v3/stages.js`: 스테이지 3개 정의(01 §9 예시 + 03 §1 범위). 불변 데이터, `version` 필드 포함.
2. `rush/v3/stage-compile.js`: 정의 → 정렬된 이벤트 배열. 명시적 `seq`, 이벤트별 `id`.
3. `rush/v3/bal3.js`: 무기 3단계(01 §5-6)·보급 내구·게이트 `hitIncrement/maxValue`·연출 상수. `LEGACY_BAL`에서 시각 상수 복사.
4. `rush/v3/save3.js` 또는 `save.js` 키 인자화: `starforgeRush.v3` + `legacy` 스냅샷.
5. `rng.js`·`daily.js`는 그대로 import. `dailySeed`는 2단계(일일 코스)에서 추가.
6. 검증(03 §6): "게이트 −2에 유효탄 3발 → +1", "내구 10·보상 2명 통 → 정확히 2명", "같은 스테이지 재도전 = 동일 배치"는 위 1~3만으로 단위 검사 가능. 저장 관련 4항목("새/기존/손상/권한 불가")은 4에서.
