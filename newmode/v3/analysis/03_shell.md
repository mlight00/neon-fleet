# 03 — 셸 모듈 분석: rush/main.js

작성일: 2026-09-09
대상: `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\rush\main.js` (466줄, HEAD `c11922f` 2026-09-07 기준)
기준 문서: `newmode/v3/spec/01_스타포지러시_재기획_v3.md`(5·12·13장), `newmode/v3/spec/03_구현담당자_전달서.md`(2·3·4·6장)
대표 판정: **손봐서 재사용(adapt)** — 입력·루프·일시정지·오디오 해제·뷰 계약의 골격은 살리고, 진행 규칙(`advance`·`newRun`·`finishRun`·게이트 좌우 판정·결과 화면)은 교체한다.

모든 인용은 `파일:줄` 형식이며, 추측 없이 현재 코드에서 확인한 내용만 적었다.

---

## 0. 03 전달서(9/3 압축본) 대비 최신 코드 차이

전달서는 2026-09-03 압축본 기준이라고 명시한다(03 전달서:9). 9/3 00:00 이전 마지막 커밋 `4e03fe5`와 HEAD의 `git diff`로 확인한 main.js 변경점은 아래와 같다(커밋 577aaf8·f256c82·1adb59b·8958838·72e8957, 모두 9/6~9/7).

| 항목 | 9/3 압축본 | 현재(HEAD) | 근거 |
|---|---|---|---|
| 티어(무기 단계) | 매 프레임 `tierFor(count)` 재계산 | `run.tier` 상태 보유 + `tierStep` 히스테리시스(오를 땐 즉시, 내릴 땐 75% 완충) | main.js:35, 141, 172 / squad.js:32-38 |
| 웨이브 스폰 난수 | 판 공용 `run.rnd` | 이벤트 위치로 시드한 `evRnd` (오늘의 도전 공정성) | main.js:93-96 |
| 게이트 호위 배치 | 없음 | `ev.data.escort` 로 게이트 앞뒤에 적 고정 배치 | main.js:97-105 |
| POW 드랍 연출 | 없음 | `powDrop` 이벤트 처리 | main.js:146-149 |
| 업그레이드 | 3종(x 60/185/310) | 4종(`moveSpeed` 추가, x 22/136/250/364) | main.js:24, 309-318 |
| 좌우 이동 | 부드러운 추종만 | 추종 + 초당 이동 상한(`baseMoveMax × moveMult`) | main.js:438-443 |
| 입력 견고화 | `pointerup`만 | `pointercancel`·`blur`·`visibilitychange` → `autoPause` | main.js:395-403 |
| 오디오 해제 | pointerdown만 | keydown 에서도 `au.unlock()` | main.js:405 |
| BGM | 항상 battle | 대기 화면 title / 주행 중 구간별 `bgmZone` / 종료 시 title | main.js:227, 381, 448-449 |
| `__rushDbg` | x/tx 없음 | x, tx 추가 | main.js:421-423 |

전달서 §4가 "9/3 압축본의 버스터 소각 탄 피격 오류"를 되살리지 말라고 한 건은 이미 combat.js:165(`if (s.dead) continue;`)에서 수정돼 있고 테스트 `COMBAT-BEAM-BURN`이 잠그고 있다(tests/rush-sim.test.mjs:228). 전달서 §6의 "화면 숨김·pointercancel·포커스 상실에서 일시정지와 입력 초기화" 요구도 현재 코드에 이미 구현돼 있다(main.js:395-403).

---

## (a) export 목록과 시그니처·용도

main.js가 실제로 내보내는 것은 4개뿐이고, 나머지는 전부 모듈 내부 함수 또는 `boot()` 안의 클로저다.

| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `hitButton` | `(buttons: Button[], x: number, y: number) → string \| null` | 논리 좌표(480×800)로 버튼 id 판정. 첫 매치 반환 | main.js:17-20 |
| `gateHitSide` | `(squadX: number) → 'left' \| 'right'` | 부대 중심 x가 240 미만이면 좌측 게이트 | main.js:22 |
| `nextBossZ` | `(run) → number` | 다음 보스 이벤트의 z. 보스전 중이면 `run.z`, 없으면 `Infinity`. HUD `bossDist` 계산용 | main.js:45-50, 282-285 |
| `boot` | `() → void` | DOM 진입점. `#game` 캔버스·저장·오디오·입력·루프를 결선 | main.js:213-464 |

모듈 부수효과: `document`가 있고 `#game`이 존재하면 import 시점에 `boot()`를 자동 호출한다(main.js:466). 모듈 상단에서는 DOM을 만지지 않는다는 규칙이 주석으로 명시돼 있고(main.js:2), 테스트 `MAIN-HELPERS`가 Node에서 DOM 없이 import 가능함을 잠근다(tests/rush-sim.test.mjs:180-187). 이번 분석 중 `node --test tests/rush-sim.test.mjs` 실행으로 17/17 통과를 확인했다(Node v24.14.0).

내부(비export) 함수와 위치:

| 이름 | 위치 | 역할 |
|---|---|---|
| `UP_LABELS` | main.js:24 | 업그레이드 4종 한글 라벨 |
| `newRun(save, mode)` | main.js:26-43 | 판 상태 객체 생성(시드·트랙·효과·연출 상태) |
| `spawnBurst(run, x, y, r, big)` | main.js:53-63 | 파편 폭발. 각도는 `run.burstSeed` 카운터 기반(전역 난수 금지) |
| `advance(run, dt0)` | main.js:65-211 | **진행 규칙의 본체.** 스크롤·이벤트 소비·게이트 사격·전투 스텝·이벤트 반응·연출 타이머·승패 판정 |
| `startRun(mode)` | main.js:223 | `run = newRun(...)`, `state = 'run'` |
| `finishRun()` | main.js:225-247 | 코인 정산·기록 갱신·`resultData` 작성·`state = 'results'` |
| `view()` | main.js:249-328 | 렌더러에 넘길 평면 객체 조립 + `buttons` 갱신 |
| `onPress(x, y)` | main.js:330-372 | 버튼 id → 상태 전이 |
| `toLogical(e)` | main.js:374-377 | 클라이언트 좌표 → 480×800 논리 좌표 |
| `autoPause()` | main.js:397-401 | 입력 초기화 + run이면 paused |
| `frame(now)` | main.js:427-458 | rAF 루프 |
| `window.__rushDbg` | main.js:420-424 | 콘솔 관찰용 스냅샷 |

---

## (b) 내부 데이터 형태

### run 객체 (main.js:32-42, 이후 필드 추가 176-178, 242-245)

```
{
  mode: 'normal'|'daily', seedKey: 'YYYY-MM-DD', seed: uint32,
  track: { events: Event[], length: 57000 },          // buildTrack(seed) (track.js:90)
  rnd: () => number,                                   // mulberry32((seed ^ 0x9E37)>>>0)
  z: 0, ei: 0,                                         // 진행 거리·다음 이벤트 인덱스
  x: 240, tx: 240,                                     // 부대 중심·목표 x (80~400)
  count, dispCount, tier,                              // 실제 병력·표시 병력(지연 추종)·무기 단계
  eff: { startCount, fireRateMult, magnetMult, moveMult },   // upgrades.effects (upgrades.js:19-28)
  combat: { enemies, bullets, eshots, pools, boss, fireT, coins, kills, powCd },   // combat.js:5
  watcher, slowmo, cont,                               // fx-state.js: 기록 감시·슬로모·이어하기 토큰
  recordFlash, gold, dim, invulnT, busterT, curBossZone,
  parts: [], floaters: [], shakeT, hurtT, fireFlash, evolveT, evolveUp, burstSeed, sfxQueue: [],
  peak, over, won, firstX2,
  cutscene?: { t, total, tier, down? } | null,         // main.js:176-178, 431-433
  resultData?: { peak, kills, coins, x2, isRecord, won, shareBest },   // main.js:242-245
}
```

### 트랙 이벤트 (track.js:52-87, main.js에서 소비 76-114)

- `{ z, type: 'gatepair', data: { left: Gate, right: Gate } }`, `Gate = { op: 'add'|'sub'|'div', value, greed?, hp?, broken? }` — `hp`·`broken`은 main.js:125·134에서 **트랙 데이터에 직접 기록**되는 런타임 상태다.
- `{ z, type: 'wave', data: { kind, n, lane?: 'L'|'R', escort?: { gateZ, dy } } }`
- `{ z, type: 'boss', data: { zone } }`

### 버튼 (main.js:252-324)

`{ id, x, y, w, h, label, primary?, sub?, disabled? }`. 좌표는 480×800 논리 좌표. `view()`가 `buttons` 클로저 변수를 매 프레임 갱신하고(main.js:326) `onPress`가 그것을 `hitButton`에 넘긴다(main.js:331).

### view() 조립 필드 (main.js:249-328)

| 상태 | 필드 |
|---|---|
| 공통 | `state, mode, buttons, best, scroll` (250) |
| run/over/paused | `gates: [{ y, pair }]` (258-264, 보스전 중엔 빈 배열), `enemies, bullets, eshots, boss, pools` (265-269, combat 배열을 **참조 그대로** 전달), `squad: { x, count(표시값), tier, radius, hurt, fireFlash, muzzles, evolveT, evolveUp, busterT }` (271-273), `dim, parts, cutscene: { k, tier, down } \| null, floaters` (274-277), `shakeT, hurtT` (paused면 0, 278-279), `now = performance.now()/1000` (280), `zone` (281), `hud: { count, gold, progress, bossDist, firstRunX2, recordFlash }` (283-287) |
| results | `results: { ...resultData, wallet }` (306) |

렌더러가 실제로 읽는 필드는 정확히 이 집합이다: `best, shakeT, now, scroll, zone, state, gates, pools, boss, enemies, bullets, eshots, squad, parts, floaters, dim, hurtT, cutscene, hud, results, buttons, mode` (render.js:565 이하 `view.*` 전수 확인). 셸→렌더러 계약은 닫혀 있고 누락·잉여가 없다.

### 저장 데이터 (save.js:3 + main.js에서 추가하는 키)

`{ best, coins, up: { startTroops, fireRate, magnet, moveSpeed }, daily: { [seedKey]: peak }, lastPlayDay, mute?, volume? }` — `mute`·`volume`은 main.js:335·342에서 patch로 추가된다. 저장 키는 단일 `'starforgeRush.v1'`(save.js:2).

### 입력 상태

- `pointer = { down: boolean, x: number }` (main.js:220) — **y는 저장하지 않는다.**
- `keys = { [e.code]: boolean }` (main.js:221)

### `__rushDbg()` 반환 (main.js:421-423)

`{ state, z, count, ei, x, tx, enemies, eshots, boss }` — `run`이 없으면 `null`/`undefined`. `window`가 있을 때만 설치된다.

---

## (b′) 동작 흐름 — 상태 기계·입력·advance 순서·루프

### 상태 기계 (문자열 `state`, main.js:219)

| 현재 | 트리거 | 다음 | 근거 |
|---|---|---|---|
| title | `start` 버튼 / Space·Enter | run(normal) | 350, 413 |
| title | `daily` 버튼 | run(daily) | 351 |
| run | `pause` 버튼 / ESC / blur / 화면 숨김 | paused | 348, 407, 397-403 |
| paused | `resume` / ESC | run | 353, 408 |
| paused | `giveup` | results (`finishRun`) | 354 |
| run | `run.over && cont.canUse()` | over | 451-452 |
| run | `run.over && !cont.canUse()` | results | 453 |
| run | `run.won && z ≥ length+260` | results | 454 |
| over | `continue` (토큰 성공) | run (병력 10·무적 2초·적탄 제거) | 356-361 |
| over | `giveup` | results | 362 |
| results | `retry` / Space·Enter | run(같은 mode) | 364, 414 |
| results | `daily` | run(daily) | 365 |
| results | `title` | title | 366 |
| results | `up_*` / `share` | 상태 유지(구매·클립보드) | 367-370 |
| 어디서나 | `mute` / `vol_down` / `vol_up` | 상태 유지 | 333-345 |

`frame()`은 `state === 'run'`일 때만 세계를 진행하고(430-455), 그 외 상태에서도 `renderer.draw(view())`는 매 프레임 호출된다(456). `over`는 별도 상태라 세계가 멈춘 채 오버레이만 그려진다.

### boot의 입력 처리

- **pointerdown(캔버스)**: `au.unlock()` → title/results면 `bgmTitle()` → `pointer.down = true` → `toLogical` → `pointer.x` → `onPress` (379-386). 즉 **터치가 닿은 절대 x가 곧 조향 목표**가 되고, 다음 프레임에 `run.tx = clampX(pointer.x)`가 적용된다(435).
- **pointermove**: 마우스는 호버만으로, 터치는 드래그 중에만 `pointer.x` 갱신 + run이면 `run.tx` 갱신 (388-393). 절대 좌표 매핑.
- **pointerup / pointercancel(window)**: `pointer.down = false` (394-395).
- **blur / visibilitychange(hidden)**: `autoPause` — 포인터·키 초기화, run이면 paused + `bgmPause` (397-403). 다시 보일 때 자동 재개는 없다(의도적).
- **keydown**: `au.unlock()` → ESC는 일시정지 토글 후 return → `keys[code] = true` → Space/Enter는 title/results에서 출격 (404-416). **keyup**은 `keys[code] = false` (417).
- 프레임에서 키 적용: ArrowLeft/Right만 `run.tx`를 `BAL.squad.moveSpeed × dt`로 이동(436-437). 상하 키·A/D 없음.
- **오디오 unlock**: pointerdown·keydown 양쪽(380, 405). BGM 선택은 프레임마다 boss/zone으로 갱신(448-449), 보스 앞 정적 덕킹(450).

### advance(run, dt0)의 처리 순서 (main.js:65-211)

1. `startTier = run.tier` 스냅샷 (66)
2. 슬로모 배율 → `dt = dt0 × scale` (67-68). 이후 전투·버스터 타이머는 `dt`, 연출 타이머·파편·표시 병력은 `dt0`를 쓴다 — **시계가 둘이다.**
3. 다음 이벤트가 boss면 1.5초 전부터 `dim` 상승 (70-74)
4. 보스전이 아니면 `z += scrollSpeed × dt` (75)
5. `events[ei].z <= z`인 이벤트를 **한 프레임에 전부** 소비 (76-114)
   - gatepair: `gateHitSide(run.x)`로 한쪽 선택 → `broken`이면 '무효' 플로터, 아니면 `applyGate` → 플로터·SFX·피격 연출 (78-89)
   - wave: 이벤트 시드 난수로 `spawnWave` → escort면 방금 push된 적 n개를 **배열 끝에서 역순 인덱스로** 골라 y·vy·vx 덮어쓰기 (90-106)
   - boss: 잡졸·적탄 일괄 제거 + 파편 → `spawnBoss` → `curBossZone` 설정·dim 0·SFX (107-113)
6. 나쁜 게이트 사격 파괴: 화면 안(−20 < dy ≤ 760) gatepair마다, 나쁜 쪽에 `hp`를 지연 초기화(125, 값 비례 또는 ÷는 진행도 비례) → 게이트 사각형에 든 탄을 `dead` 처리하고 hp −1 → 0이면 `broken` + 연출 (116-140)
7. `run.tier = tierStep(run.tier, run.count)` (141)
8. `stepCombat(run.combat, { x, count, fireRateMult, tier, radius, beam }, dt, run.rnd)` (143)
9. 전투 이벤트 반응: `kill`(파편·SFX) / `powDrop` / `pow`(버스터 5초) / `supply`(병력 +n, 상한 999) / `bossKill` / `hurt`(무적 아닐 때만 연출) / `fire`(티어별 발사음·머즐 플래시) (144-170)
10. 무적이면 `invulnT` 감소, 아니면 `count -= troopLoss` (171)
11. `tierStep` 재적용 → `startTier`와 다르면 진화/강등 컷신·플로터·SFX (172-183)
12. 연출 타이머 감쇠, 파편·플로터 이동/수명 필터 (185-193)
13. `dispCount` 지연 추종(늘 땐 3배/초·줄 땐 12배/초) (195-201)
14. `peak` 갱신, 기록 돌파 감시 (202-204)
15. `count ≤ 0 → over` / 보스 격파 후 `curBossZone` 정리, 마지막 구간이면 `won` (205-209)
16. `scale` 반환 (211) — 호출부 `frame`은 반환값을 쓰지 않는다(444).

### 게임 루프 (main.js:426-458)

- `dt = min(0.05, (now − last)/1000)` — **가변 dt, 상한 50ms** (428). 고정 스텝·누적기 없음.
- 컷신 중이면 `cutscene.t`만 감소하고 세계 정지 (431-433).
- 입력 반영 → 이동(추종 × 상한 캡) → `advance` (435-444).
- `sfxQueue` 비우기 → BGM 선택 → 덕킹 → over/won 전이 (446-454).
- `renderer.draw(view())` → rAF (456-457).
- 스프라이트 로드 완료 후에야 렌더러 생성·루프 시작 (460-463). 스프라이트는 없어도 폴백(sprites.js:24).

### 결과 화면 버튼 배치 (main.js:305-325)

| id | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| retry | 140 | 400 | 200 | 56 | primary, '다시 출격' |
| up_startTroops / up_fireRate / up_magnet / up_moveSpeed | 22 / 136 / 250 / 364 | 500 | 106 | 64 | `sub`에 비용 또는 MAX, 코인 부족·MAX면 `disabled` |
| share(daily) 또는 daily(normal) | 140 | 600 | 200 | 40 | |
| title | 140 | 656 | 200 | 36 | '처음으로' |

over 화면(291-294): continue(120,430,240×56)·giveup(120,510,240×44). paused(296-303): resume·giveup·vol_down(120,548,64)·mute(192,548,96)·vol_up(296,548,64). title(252-256): start(140,545,200×60)·daily(140,625,200×48)·mute(422,14,44×44). run(289): pause(422,14,44×44).

### 이어하기

`continueToken(isDaily)`는 일반 판 1회만 허용(fx-state.js:23-28). 사용 시 `count = BAL.fx.continueTroops`(=10), `invulnT = 2`, 적탄만 제거(적·보스는 유지), `over = false` (main.js:356-361). balance.js:53에는 `continueByZone: [10,25,45,70,100]`("이어하기 복구는 구간 비례")이 있지만 **main.js는 이를 읽지 않는다**(357은 고정 10; render.js:531 안내문도 고정 10). 커밋 5028f06("이어하기 구간 비례 복구")은 balance/combat/tests만 바꾸고 main.js는 건드리지 않았다(`git show --stat` 확인). 수치 주석과 셸 동작이 어긋난 상태다.

---

## (c) v3 요구 대비 판정 — 함수 단위

판정 기준: 01 기획 5장(전투 규칙)·12장(변경표)·13장(1단계), 03 전달서 2장(main.js = "상태 전환·입력·화면 결선과 규칙 진행을 분리, 진행 함수를 브라우저와 테스트가 공유")·3장(데이터)·4장(프레임)·6장(검증).

| 함수 | 판정 | 이유·근거 |
|---|---|---|
| `hitButton` | **그대로 재사용** | 순수 함수, 테스트 보유(tests/rush-sim.test.mjs:180-187). 위치만 옮기면 된다(§e 참조). |
| `gateHitSide` | **교체** | 240 중앙선 기준 2칸 전제(main.js:22). v3는 1/2/3칸 게이트·분리벽 반대편 게이트를 두고 "부대 중심 기준 1칸" 판정(01:92). 칸 배치는 스테이지 정의에서 오므로 게이트/스테이지 모듈이 `cellAt(x)`류로 담당해야 한다. |
| `nextBossZ` | **교체(폐기)** | v3는 "보스까지 거리 HUD 고정 규칙을 내려놓는다"(01:282). `track.events` 형태에도 종속(45-49). 상단 HUD는 스테이지/목표·남은 적/보스 상태로 바뀐다. |
| `newRun` | **교체** | `buildTrack(seed)` 무작위 트랙 + `count` 단일 병력(34-35). v3 전투 상태는 `mode/stageId/stageVersion/seed/phase/squadUnits/heroes/squadWeapon/drone/objective/rewardState`(03:43-53). **패턴은 유지**: 평면 객체 팩토리, 시드 난수 주입, `watcher/slowmo/cont` 같은 작은 상태기를 조립하는 방식(37), 일일 코스의 `dateSeed` 사용(28-29)에 `stageVersion`을 더한다(03:104). |
| `spawnBurst` | **그대로 재사용** | 전역 난수 없이 카운터 각도(53-63). 셸이 아니라 FX 모듈로 옮기는 편이 낫다. |
| `advance` | **교체** | 본문 전체가 v3에서 폐기되는 규칙이다: 좌/우 한쪽 게이트 적용(79-89)·나쁜 게이트 HP 파괴(115-140, 01:78 "기본 규칙에서 제외")·보급 = 병력 +N(155-159, 01:297 분리)·병력 기준 진화/강등(172-183, 01:298-299 폐지)·`curBossZone`로 승리(206-209). **건질 조각**: 보스 앞 정적 dim 패턴(70-74), 연출 타이머 감쇠 블록(185-193), `dispCount` 지연 추종(195-201), 기록 감시(203), 이벤트 시드 난수(95). 새 진행 함수는 **export 되는 순수 함수**여야 한다(03:27). |
| `boot` | **손봐서 재사용** | 골격(저장·오디오 초기화 217-218, `state/run/renderer/buttons` 클로저, 리스너 결선, 스프라이트 로드 후 루프 시작 460-463)은 그대로 쓸 수 있다. 내부 클로저는 아래 항목별로 손본다. 캔버스 id·`document` 직접 참조(214)는 주입 가능하게 바꾸면 테스트가 쉬워진다. |
| `startRun` | **손봐서** | `mode` 한 개 인자(223) → `(mode, stageId, 편성)`. |
| `finishRun` | **교체** | 코인 = 격파+거리×배율×첫판2배(230), best/daily 갱신(233-241), `resultData`(242-245)가 모두 v3 결과 정의(01:303 "작전 결과·보상·기여도·재도전 경로")와 다르다. 최초 클리어 보상 `stageId+rewardVersion` 1회 지급·재진입 중복 방지(03:100)가 새로 필요. **단일 종료점 패턴**(paused·over·frame 세 곳이 모두 `finishRun` 호출: 354, 362, 453-454)은 유지. |
| `view` | **손봐서 재사용** | "셸이 평면 객체를 만들고 렌더러가 그것만 읽는다"는 계약은 닫혀 있어(§b) 유지 가치가 크다. 바꿀 필드: `gates`(pair → 칸 목록 + signedValue), `squad`(count/tier → units·heroes·weapon), `hud`(bossDist/progress → 스테이지·목표·남은 적), `results`. title/paused 버튼 배치(252-256, 296-303)는 그대로, results/over 버튼(291-294, 307-324)은 교체. `performance.now()` 직접 호출(280)은 시계 주입으로 바꾸면 Node에서 view를 검증할 수 있다. |
| `onPress` | **손봐서** | mute/volume 처리(333-345)와 title/paused 전이(349-354)는 그대로. over/continue 분기(355-362)는 v3 §12 "순수 모드는 재시작, 캠페인은 실패 후 편성/성장·재시도"에 맞춰 교체. results 분기(363-371)의 `up_*`는 upgrades 분리 방침(03:35)에 따라 재정의. `daily`는 v3 §4C 특수 작전으로 유지. |
| `toLogical` | **그대로 재사용** | 480×800 논리 좌표 변환(374-377). 아레나에서 "넓어진 화면"(01:64)을 캔버스 크기 변경으로 구현한다면 상수를 매개변수화. |
| pointer 리스너 | **손봐서** | 절대 좌표 조향(383-384, 391, 435)은 v3 §5-1 "손가락을 대는 순간 부대가 그 위치로 튀지 않게"(01:58) 위반 → 드래그 시작점 대비 **상대 이동**으로 교체. 마우스 호버 조향은 PC 규칙(마우스+좌우 키)과 맞으므로 유지. `pointer.y`가 없어(220) 아레나 상하 이동(01:64) 불가 → y 추가. |
| `autoPause`·pointercancel·blur·visibilitychange | **그대로 재사용** | 03 §6 검증 항목(120줄)을 이미 충족(395-403). |
| keydown/keyup | **손봐서** | ESC 토글·unlock·keys 맵은 유지. ArrowUp/Down 추가(아레나). Space가 title/results 출격에 묶여 있어(412-415) v3 드론 지원 폭격 "터치 1회/Space"(01:192)와 충돌 → 상태별로 분기. |
| `__rushDbg` | **손봐서** | 클로저 상태 스냅샷 방식(420-424)은 유지하되 `stageId/phase/units/heroes/weapon`을 추가. 콘솔 관찰 외 영향 없음(419). |
| `frame` | **손봐서 → 핵심은 교체** | rAF·dt 상한(427-429)·sfx 비우기(446-447)·`renderer.draw(view())`(456)는 유지. **가변 dt 직접 적용(428, 444)은 03 §4 "고정 시간 간격으로 규칙 처리"와 §6 "30/60/120Hz 동일 결과"에 맞지 않아 누적기 기반 고정 스텝으로 교체.** 이동 블록(435-443)은 벽 제약(03:88 "입력 → 이동/벽 제약")과 아레나 2D를 받도록 교체. 컷신 정지(431-433)는 v3가 "큰 전면 컷인 반복 정지"를 배제(01:286)하므로 축소 또는 제거. BGM 선택(448-449)은 zone → stage/phase. 승패 전이(451-454)는 objective 기반으로. |
| 자동 부트 가드(466) | **그대로 재사용(주의 있음)** | 방식은 좋지만 v3 페이지가 `#game`을 쓰면서 이 파일을 import하면 레거시 `boot()`가 같은 캔버스에 붙는다(§e). |

---

## (d) 갭과 위험

1. **진행 함수가 export 되지 않는다.** `advance`(65)·`newRun`(26)은 내부 함수이고 `boot()` 클로저가 호출한다. 그래서 완주 시뮬 테스트가 진행 규칙을 손으로 복제한다(tests/rush-sim.test.mjs:120-175, 주석 "main.advance 와 동일 규칙"이 5곳). 규칙이 바뀌면 두 곳을 같이 고쳐야 하고, 어긋나도 테스트가 잡지 못한다. 03 §2의 "진행 함수를 브라우저와 테스트가 공유"는 이 파일에서 가장 큰 구조 변경이다.
2. **고정 스텝이 아니다.** `dt = min(0.05, elapsed)`(428)를 그대로 규칙에 넣는다. 슬로모 배율은 전투 dt에만 곱하고 연출은 dt0를 써서(67-68, 185-201) 시계가 둘이다. 03 §6 "30/60/120Hz 동일 규칙 결과"는 현 구조로 보장되지 않는다.
3. **절대 좌표 터치 조향.** pointerdown이 곧 목표 x가 된다(383-384, 435). 이동 상한(441)이 있어 순간이동은 아니지만 "누르는 순간 그쪽으로 이동 시작"은 v3 §5-1의 상대 드래그 요구와 다르다.
4. **상하 입력이 없다.** `pointer`에 y가 없고(220) 키는 ArrowLeft/Right만 본다(436-437). 아레나(01:64, 03:115) 구현 시 입력 계층 확장 필수.
5. **런타임 상태가 트랙 정의에 기록된다.** 게이트 `hp`·`broken`을 `run.track.events[..].data.left/right`에 직접 쓴다(125, 134). 지금은 판마다 `buildTrack`을 새로 만들어 문제가 없지만, v3처럼 스테이지 정의를 재사용하면 "같은 스테이지 재도전은 동일한 배치"(03:82)가 깨진다. 정의(불변)와 판 상태(가변)를 분리해야 한다.
6. **호위 배치가 push 순서에 의존한다.** `spawnWave` 직후 `enemies` 끝에서 n개를 역순으로 골라 덮어쓴다(99-104). `spawnWave`가 push 순서를 바꾸거나 다른 곳이 중간에 push하면 조용히 엉뚱한 적을 옮긴다. v3에서 보급·게이트를 별도 객체로 두면(03:39) 이 결합은 자연히 사라진다.
7. **이어하기 수치 불일치.** balance.js:53 `continueByZone`은 어디서도 읽히지 않고 main.js:357은 고정 10을 쓴다. v3는 이어하기 자체를 재정의(01:304)하므로 새 코드에서 이 상수를 참조하지 않도록 정리한다.
8. **Space 키 충돌.** Space/Enter = 출격(412-415). v3 드론 수동 발동 후보가 Space(01:192).
9. **보상 멱등성 없음.** `finishRun`이 즉시 `save.patch`로 코인·기록을 쓴다(246). v3의 최초 클리어 보상 1회 지급·재진입 중복 방지(03:100)는 별도 설계가 필요하다.
10. **한 프레임에 이벤트 다중 소비.** `while (events[ei].z <= z)`(76)는 프레임이 길면(50ms 상한) 게이트·웨이브·보스가 같은 프레임에 겹쳐 처리될 수 있다. 03 §4 "같은 순간 보급 획득과 사망이 겹칠 때 우선순위"를 정의하려면 고정 스텝과 함께 이벤트 순서를 명시해야 한다.
11. **`view()`가 시계를 직접 읽는다.** `performance.now()`(280) 때문에 view를 Node 테스트로 끌어내려면 시계 주입이 필요하다.
12. 소소한 것: `au.duck(state === 'run' ? … : 1)`(450)은 `if (state === 'run')` 블록 안에 있어 `: 1` 분기가 실행되지 않는다. 일시정지 중 덕킹이 복원되지 않지만 `bgmPause`가 곡을 멈추므로 체감 영향은 없다. 새 셸에서는 덕킹 복원을 상태 전이 시점에 두면 된다.
13. 자동 부트 가드(466)와 캔버스 id 충돌 — §e 참조.

---

## (e) v3 신규 모듈이 이 파일을 import할 때의 권장 방식

**결론: v3 페이지·모듈은 `rush/main.js`를 import하지 않는다.** 이유는 두 가지다.

- main.js:466은 `document.getElementById('game')`이 있으면 무조건 `boot()`를 실행한다. v3 페이지가 같은 id의 캔버스를 쓰면서 `hitButton` 하나를 얻으려고 이 파일을 import하면 **레거시 게임이 같은 캔버스에 붙어 두 루프가 동시에 그린다.**
- import 한 번에 track/gates/combat/render/audio 등 레거시 모듈 전체가 함께 로드된다(main.js:3-15). 필요한 것은 4~10줄짜리 순수 함수뿐이다.

권장 구조:

1. **순수 UI 헬퍼 분리**: `hitButton`(17-20)과 `toLogical`(374-377)을 `rush/ui.js`(또는 `rush/v3/ui.js`) 같은 DOM 비의존 소형 모듈로 옮기고, 레거시 main.js도 거기서 import하게 바꾼다(기존 파일 수정은 이번 작업 범위 밖이므로 v3 착수 시 결정). 당장은 4줄 복제도 허용 범위다.
2. **진행 규칙을 별도 순수 모듈로**: `rush/v3/run.js`에 `createRun(stageDef, opts) → run`, `step(run, input, STEP) → events`, `buildView(run, clock) → view`를 export한다. 이 세 함수만으로 Node 테스트가 03 §6 항목을 실제 진행 함수로 검증한다. 현 `advance`에서 건질 조각(dim 패턴 70-74, 연출 감쇠 185-193, `dispCount` 195-201, 기록 감시 203, 이벤트 시드 난수 95)은 여기로 옮긴다.
3. **셸은 결선만**: `rush/v3/shell.js`의 `boot(canvas, deps)`에 `{ save, audio, renderer, now }`를 주입한다. 현 `boot()`에서 그대로 가져올 것: 오디오 unlock(380, 405), mute/volume 버튼(333-345), ESC 토글(406-410), `autoPause` 3종(395-403), `sfxQueue` 비우기(446-447), `renderer.draw(view())`(456), 스프라이트 로드 후 시작(460-463), 자동 부트 가드 방식(466, 단 캔버스 id는 v3 전용으로).
4. **루프는 고정 스텝 누적기**: `acc += min(0.05, elapsed); while (acc >= STEP) { step(run, input, STEP); acc -= STEP; }` 형태로 바꾸고, 그림은 매 rAF에서 최신 상태(필요하면 보간)로 그린다. 슬로모는 `STEP`을 바꾸지 말고 `run` 내부 배율로 처리해 시계를 하나로 유지한다.
5. **입력 계층**: `pointer = { down, x, y, startX, startY, baseX, baseY }`로 확장해 상대 드래그를 계산하고, 도로/아레나 phase에 따라 `input = { dx, dy, drone }`을 `step`에 넘긴다. 키는 ArrowUp/Down을 더하고 Space는 상태별로 분기한다.
6. **저장**: `createSave`(save.js:5)는 storage 주입이 가능해 그대로 재사용 가능하다. 단 v3 스키마는 새 키(03:98 "별도 버전 키")로 두고 기존 `starforgeRush.v1`은 읽기 전용 레거시로 보존한다.

이 방식이면 레거시 `rush.html`(rush/main.js)과 v3 페이지가 같은 저장소에서 서로 간섭 없이 공존하고, 03 전달서 §2의 "진행 함수를 브라우저와 테스트가 공유" 요구를 이 파일 수정 없이 충족한다.

---

## 부록 — 검증 기록

- `git diff 4e03fe5 HEAD -- rush/main.js`로 9/3 이후 변경 71줄(추가 위주) 확인.
- `git show --stat 5028f06`으로 main.js 미변경 확인(continueByZone 미결선 근거).
- `node --test tests/rush-sim.test.mjs` → 17 pass / 0 fail (Node v24.14.0). `MAIN-HELPERS`가 DOM 없이 `../rush/main.js` import에 성공.
- render.js의 `view.*` 참조 전수 추출로 셸→렌더러 계약 필드 22개 확인.
- 기존 파일은 수정하지 않았다. 워크트리 변경은 `newmode/`(미추적) 뿐.
