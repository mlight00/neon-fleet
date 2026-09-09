# 02 — 자산 모듈 분석: rush/sprites.js · rush/audio.js · rush.html

작성일: 2026-09-09  
분석 기준 코드: 브랜치 `claude/starforge-v3`, HEAD `c11922f` (2026-09-07 14:29)  
분석 대상: `rush/sprites.js`(29줄) · `rush/audio.js`(91줄) · `rush.html`(16줄)  
비교 문서: `newmode/v3/spec/01_스타포지러시_재기획_v3.md`, `newmode/v3/spec/03_구현담당자_전달서.md`

이 문서는 코드에서 직접 확인한 사실만 적는다. 판단이 섞인 곳은 **[판단]**, 이 저장소에서 실측하지 않은 일반 지식은 **[미실측]**으로 표시한다. 기존 파일은 수정하지 않았다.

---

## 0. 요약 판정

| 파일 | 대표 판정 | 한 줄 이유 |
|---|---|---|
| rush/sprites.js | **손봐서 재사용** | 로더·폴백 구조는 그대로 쓸 수 있으나 키 목록이 함수 안에 고정돼 v3 신규 그림(통·컨테이너·벽·영웅)을 넣을 입구가 없다 |
| rush/audio.js | **손봐서 재사용** | unlock·음소거·음량·BGM 일시정지·덕킹·스로틀은 그대로. sfx 표·경로가 모듈 상수라 v3 이벤트를 밖에서 추가할 수 없고, 다수 발사음 밀도 제어와 풀이 없다 |
| rush.html | **교체** | 16줄짜리 진입 페이지. CSS 3줄과 캔버스 규격은 베끼되 v3 전용 페이지를 새로 만든다(main.js 자동 부팅 회피) |

세 파일 묶음의 대표 판정: **손봐서 재사용(adapt)**.

### 9/3 압축본과의 차이 (03 전달서 §0 주의 사항 대응)

| 파일 | 마지막 변경 | 9/3 압축본 대비 |
|---|---|---|
| rush/sprites.js | 4adee63 (9/2 20:29) | **동일** (9/3 이후 변경 없음) |
| rush/audio.js | 1adb59b (9/7 11:26) | **다름.** `pickupDrop` sfx 1종 추가(파일 `nf_sfx_pickup_1/2`, VOL 0.7). 그 직전 a2248ef(9/3 15:57)의 구간별 주행 BGM(`bgmZone` sector1a~5a)·보스곡 1:1·타이틀곡 변경은 압축본 채취 시각에 따라 포함 여부가 갈린다 |
| rush.html | 9aa0df8 (8/31 23:17) | **동일** |

---

## (a) export 목록과 시그니처·용도

### rush/sprites.js

| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `SPRITE_KEYS` | `const { [key: string]: string }` — 30개 | 논리 키 → PNG 파일명(확장자 제외) 대응표 | sprites.js:2-17 |
| `loadSprites` | `(base = 'assets/rush/') => Promise<{ get(k): HTMLImageElement\|null, ready: Set<string> }>` | 30장을 전부 병렬 로드한 뒤 조회 객체를 돌려준다. 없는 그림은 조용히 건너뛴다 | sprites.js:19-28 |

`SPRITE_KEYS` 30개 내역 (sprites.js:4-16):

- 아군 7: `m1~m5` → `M01~M05`(히어로 5단), `soldier` → `SOLDIER`, `mfront` → `M01_front`(타이틀 정면)
- 보급 2: `supply` → `SUPPLY`, `pow` → `POW`(버스터 드랍)
- 적 10: `e_scrapbit`(E1) `e_ramhound`(E2) `e_wallguard`(E3) `e_needleeye`(E4) `e_wheeler`(E5) `e_signaler`(E6) `e_cartyard`(E7) `e_manholejumper`(E8) `e_spawnpod`(E9) `e_magnethead`(E10)
- 보스 5: `b1~b5` → `B1_grader` `B2_gantrywidow` `B3_railleviathan` `B4_smelter` `B5_crownbreaker`
- 게이트 1: `gate` → `GATE`
- 배경 5: `bg1~bg5` → `BG1~BG5`

### rush/audio.js

| export | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `createAudio` | `() => AudioAPI` | 인수 없음. 클로저 상태를 가진 재생기 하나를 만든다 | audio.js:27 |

`AudioAPI` 메서드 (audio.js:44-90):

| 메서드 | 시그니처 | 동작 | 근거 |
|---|---|---|---|
| `unlock` | `() => void` | 첫 입력에서 호출. 플래그를 켜고 대기 중 BGM을 재생 | :45-49 |
| `isMuted` | `() => boolean` | | :50 |
| `getVolume` | `() => number` (0~1) | 사용자 음량 배수 `volMult` | :51 |
| `setVolume` | `(v) => void` | 0~1 클램프, BGM 볼륨 즉시 반영 | :52-55 |
| `setMuted` | `(v) => void` | 켜면 BGM pause, 끄면 unlock 상태일 때 재생 | :56-59 |
| `bgmPause` / `bgmResume` | `() => void` | 일시정지·복귀(resume은 unlocked·bgmName·!muted 조건) | :60-61 |
| `bgmTitle` | `() => void` | `nf_bgm_title` | :62 |
| `bgmZone` | `(zone = 0) => void` | `sector1a~5a[zone]`, 범위 밖이면 `nf_bgm_battle1` | :64-66 |
| `bgmBattle` | `() => void` | `nf_bgm_battle1`. **rush/ 안에 호출부 없음**(grep 확인) | :67 |
| `bgmBoss` | `(zone = 4) => void` | `boss_sector1~4[zone]`, 그 외 `nf_bgm_boss` | :69-72 |
| `duck` | `(mult) => void` | BGM 볼륨 배수(0~1). sfx에는 적용되지 않음 | :74-77 |
| `sfx` | `(name) => void` | 이름표에서 파일을 골라 `new Audio()`로 1회 재생 | :78-89 |

`sfx` 이름 목록 15개와 파일·스로틀·볼륨 (audio.js:6-25):

| 이름 | 파일(라운드로빈) | 스로틀(초) | 볼륨 | 현재 호출 시점(main.js) |
|---|---|---|---|---|
| `fire` | vulcan_1~3 | 0.045 | 0.11 | 티어<2 발사 :167 |
| `fireL` | laser_1~3 | 0.045 | 0.11 | 티어 2~3 발사 :167 |
| `fireM` | missile_1~2 | 0.06 | 0.14 | 티어≥4 발사 :167 |
| `demote` | demote_1 | — | 0.75 | 티어 하락 :180 |
| `kill` | explode_s_1~3 | 0.08 | 0.4 | 적 격파 :137,:145 |
| `bossDie` | explode_l_1~2 | — | 0.8 | 보스 격파 :160 |
| `hurt` | damage_1~2 | 0.25 | 0.55 | 피격 :165 |
| `gateGood` | gate_good_1~2 | — | 0.6 | 좋은 게이트 통과 :88, 보급 획득 :158 |
| `gateBad` | gate_bad_1~2 | — | 0.6 | 나쁜 게이트 통과 :88 |
| `bossIn` | boss_in_1 | — | 0.8 | 보스 등장 :112 |
| `evolve` | evolve_1 | — | 0.8 | 티어 상승 :180 |
| `buy` | buy_1 | — | 0.6 | 업그레이드 구매 :367 |
| `click` | click_1 | — | 0.5 | 버튼 :343,:346 |
| `record` | charge_full_1 | — | 0.7 | 최고기록 갱신 :153,:203 |
| `pickupDrop` | pickup_1~2 | — | 0.7 | POW 드랍 획득 :148 (9/7 추가) |

스로틀이 없는 이름은 호출 즉시 매번 재생된다. 이름표에 없는 이름은 아무 일도 하지 않는다(:81).

### rush.html

export 없음. 내용 전부 (rush.html:1-16):

- `<meta viewport>`: `width=device-width, initial-scale=1, user-scalable=no` (:5)
- `html,body`: 여백 0·높이 100%·배경 `#05080E`·flex 중앙 정렬 (:8)
- `canvas`: `max-height:100vh; max-width:100vw; aspect-ratio:480/800; touch-action:none` (:9)
- `<canvas id="game" width="480" height="800">` — 논리 해상도 고정 (:13)
- `<script type="module" src="rush/main.js">` — 페이지 위치(저장소 루트) 기준 상대경로 (:14)

---

## (b) 내부 데이터 형태

### sprites.js — `loadSprites` 반환 객체

```
{ get: (key) => HTMLImageElement | null,   // Map 조회, 없으면 null (sprites.js:27)
  ready: Set<string> }                      // onload 성공한 키만 (sprites.js:23)
```

- 로드 절차: 키마다 `new Image()` → `onload`에 Map/Set 등록, `onerror`는 **조용히 resolve** (:22-25). `src = base + name + '.png'` (:25).
- `Promise.all`이므로 30장이 **전부 끝나야** 첫 프레임이 시작된다(:27, main.js:460-463). 진행률·부분 시작·타임아웃·재시도 없음.
- 아틀라스·프레임 애니메이션·`decode()`·캐시버스팅 없음. 키 1개 = PNG 1장.
- Node에서 `new Image()`가 없어 **`loadSprites`는 브라우저 전용**. 반면 `sprites.get()` 계약만 맞추면 테스트에서 스텁(`{ get: () => null, ready: new Set() }`)으로 대체 가능.

렌더러가 이 객체를 소비하는 계약 (render.js):

- `drawImgCentered(key, x, y, h, fallbackFn)` — 그림이 있으면 **높이 기준**으로 원본 비율 유지 그리기, 없으면 폴백 도형 (:25-31).
- 키 조합 규칙: 병사 `'soldier'`(:162), 히어로 `'m'+(tier+1)`(:174, :462), 적 `'e_'+kind`(:294), 보스 `'b'+(zone+1)`(:342), 배경 `'bg'+(zone+1)` 세로 무한 타일(:52-57), 게이트 `'gate'`(:93), 보급 `'supply'`(:262-264), 버스터 `'pow'`(:248), 타이틀 `'mfront'`→`'m1'` 2단 폴백(:491-492).
- 게이트는 **GATE.png 한 장을 좋은/나쁜 게이트에 공용**하고, 왼쪽은 좌우 반전(:97-101). 색 구분은 그림이 없을 때의 폴백 테두리(:91, :107)와 글자에서만 이뤄진다. 즉 그림 자체에 빨강/파랑 상태가 없다.

실제 파일 (assets/rush/, 30장 전부 존재 확인):

| 그룹 | 크기 | 용량 |
|---|---|---|
| M01~M05, M01_front, SOLDIER, SUPPLY | 폭 414~481 × 높이 512 | 205~392KB |
| E1~E10 | 폭 316~569 × 512 | 156~420KB |
| B1~B5 | 폭 468~533 × 512 | 299~457KB |
| GATE | 512×512 | 226KB |
| BG1~BG5 | 480×812 (캔버스 폭과 일치) | 525~632KB |
| POW | 264×256 | 101KB |
| **합계** | | **약 10.6MB** |

### audio.js — 클로저 상태

```
unlocked: boolean          // 첫 입력 전엔 sfx 전부 무시 (:28, :79)
muted: boolean             // (:29)
rr: { [name]: number }     // 라운드로빈 인덱스 (:30, :85)
lastAt: { [name]: number } // 스로틀용 마지막 재생 시각, performance.now()/1000 (:31, :82-84)
bgmEl: HTMLAudioElement|null  // loop=true 1개. Audio 미정의(Node)면 null (:32-33)
bgmName: string|null       // 같은 이름이면 playBgm no-op (:34, :37)
baseVol 0.45 · duckMult 1 · volMult 1   // BGM 볼륨 = 셋의 곱 (:34, :40)
```

- BGM: `bgmEl.src = 'assets/sound/' + name + '.ogg'` (:39). `.ogg`만 쓴다(mp3 짝은 폴더에 있으나 미사용).
- SFX: 호출마다 `new Audio(경로)` 생성 후 `play()` (:86-88). **풀 없음**, 동시 재생 상한 없음, WebAudio 미사용. 볼륨 = `VOL[name] ?? 0.5` × `volMult` (:87) — 덕킹 미적용.
- `unlock` 이전 sfx 호출은 큐에 쌓이지 않고 버려진다(:79).
- BGM 정지·페이드·크로스페이드 API 없음. `playBgm`(:36-42)은 모듈 내부 함수라 임의 곡명을 밖에서 틀 수 없다.
- `SFX`·`THROTTLE`·`VOL`·`DIR`은 모듈 상수(:3, :6-25) → `createAudio()`에 인수가 없어 밖에서 확장·경로 변경 불가.
- Node 안전: `typeof Audio` 가드(:32, :79)로 DOM 없이 `createAudio()` 생성·메서드 호출 가능(소리는 안 남).

호출부의 소리 이벤트 전달 방식 (main.js): 규칙 진행부가 `run.sfxQueue.push('이름')`으로 문자열만 쌓고(:39, :88 등 12곳), 프레임 끝에 `for (const s of run.sfxQueue) au.sfx(s)`로 비운다(:446-447). BGM은 매 프레임 `bgmBoss`/`bgmZone`을 호출하되 `playBgm`의 같은-이름 no-op으로 중복을 막고(:448-449), 덕킹도 매 프레임 갱신(:450). 음소거·음량은 save에 보존(:217-218, :334-341).

사운드 폴더 실제 파일 (assets/sound/, `nf_sfx_*`/`nf_bgm_*`만):

- **이름표에 매핑된 것**: 위 표 15종 전부 존재 확인.
- **존재하지만 미매핑(v3에서 새 파일 없이 쓸 수 있는 후보)**: `nf_sfx_hit_1~3`, `nf_sfx_telegraph_1`, `nf_sfx_shield_on_1`, `nf_sfx_shield_pop_1~2`, `nf_sfx_crystal_1~2`, `nf_sfx_lance_fire_1~4`, `nf_sfx_charge_up_1~4`, `nf_sfx_charge_full_2~4`, `nf_sfx_boss_die_1` / BGM `sector1b~5b`, `sector6a`, `sector6b`, `boss_sector5`, `boss_sector6`. 이름만 확인했고 음색은 청취하지 않았다.

### rush.html — 캔버스·좌표 계약

- 백킹스토어 480×800 고정, CSS가 `max-width/max-height + aspect-ratio`로 확대·축소한다(:9, :13). `devicePixelRatio` 처리 없음(main.js grep 결과 없음).
- 포인터 좌표 변환은 main.js가 `getBoundingClientRect` 비율로 논리 좌표(480×800)로 환산(main.js:375-376). 페이지가 아니라 부팅 코드의 책임이다.
- `rush/main.js`는 `#game`이 있으면 **자동으로 `boot()`** 한다(main.js:466). 창 단위 리스너(`pointerup/cancel`, `blur`, `visibilitychange`, `keydown/up`)도 부팅 시 등록된다(main.js:394-417).
- 안전영역(`env(safe-area-inset-*)`), `100dvh`, 방향 고정, 로딩 표시 없음.

---

## (c) v3 요구 대비 판정 — 함수 단위

기준: 01 기획 §5-2(병사별 사격), §5-3(사격형 게이트), §5-4(통), §5-5(연속 증원), §5-6(무기 3종), §5-8(보스), §11(연출·사운드), 03 전달서 §2(audio.js 방향: "사격·게이트·통·무기 획득 이벤트 구분. 풀 재사용·음량 상한").

### sprites.js

| 대상 | 판정 | 이유 |
|---|---|---|
| `SPRITE_KEYS` | **그대로 두고 v3는 별도 표** | v3에는 병사 통/무기 통/영웅 통/증원 컨테이너/구출 캡슐(01 §5-4 표), 분리벽·다리·교차로(§5-1), 영웅 6명(§6), 새 적(§5-7), 도시·교량·산업지대·협곡 배경(§11)이 필요하다. 이 표에 키를 추가하면 `tests/rush-meta.test.mjs:79`의 `length === 30` 단정이 깨진다. v3는 자기 표(`V3_SPRITE_KEYS`)를 만들고 필요한 기존 키(M01~M05·SOLDIER·SUPPLY·GATE·적·보스)를 골라 담는다 |
| `loadSprites(base)` | **손봐서 재사용** | 로드·폴백·`get/ready` 구조는 v3에도 그대로 맞는다(01 §11 "현재의 메카 미술은 … 재사용"). 다만 키 목록이 `SPRITE_KEYS`로 고정(sprites.js:21)이라 두 번째 인수 `keys = SPRITE_KEYS`를 추가해야 v3 표를 넘길 수 있다. 하위 호환 1줄 변경. 스테이지 단위로 필요한 그림만 먼저 받는 우선순위·진행률은 별도 갭(아래 d-3) |
| `get(k)` / `ready` | **그대로 재사용** | 계약이 단순해 렌더러·테스트 스텁 모두 맞추기 쉽다 |
| 게이트 그림 계약(GATE 1장) | **교체(렌더러 쪽 과제)** | v3 게이트는 −10→0→+3처럼 값과 색이 실시간으로 바뀐다(01 §5-3). 그림 1장에 상태가 없으므로 렌더러에서 색 오버레이/2장(적·청) 중 하나로 처리해야 한다. 이 파일의 문제라기보다 자산 추가 항목 |

### audio.js

| 대상 | 판정 | 이유 |
|---|---|---|
| `createAudio()` 골격(unlock·mute·volume·rr·throttle) | **그대로 재사용** | 브라우저 자동재생 정책·저장 연동·라운드로빈이 검증돼 있고 Node 안전 |
| `SFX/THROTTLE/VOL` 상수 | **손봐서 재사용** | v3 신규 이벤트(통 내구 감소·통 파괴·게이트 틱·게이트 양수 전환·다수 합류·무기 교체·돌진 예고)를 넣을 입구가 없다. `createAudio({ dir, sfx, throttle, vol })`로 기본표에 병합하는 옵션을 추가하면 기존 호출(`createAudio()`)은 그대로 동작한다 |
| `DIR` 상수 | **손봐서 재사용** | `'assets/sound/'`가 페이지 위치 기준 상대경로로 고정(:3). v3 페이지가 저장소 루트가 아니면 소리가 전부 실패한다. 위 옵션의 `dir`로 해결 |
| `sfx(name)` — `new Audio()` 매회 생성 | **손봐서 재사용** | 03 §2 "풀 재사용·음량 상한", 01 §11 "후반 수십 발 발사음을 그대로 겹쳐 재생하지 않는다"와 정면으로 어긋난다. 이름별 스로틀만 있고 총 동시 재생 상한·밀도 기반 볼륨 조절이 없다. 1단계(스테이지 3개)에서는 스로틀만으로 버틸 수 있으나(**[판단]**), 병사 30명 × 초당 2발(01 §9) 구간부터는 발사 1회당이 아니라 '일제사격 1회당 1음 + 인원 비례 볼륨' 같은 정책이 필요하다 |
| `fire/fireL/fireM` | **그대로 재사용(이름만 재해석)** | 01 §5-6 무기 3종(기본 소총·강화 자동화기·중화기)과 1:1로 맞아떨어진다. 다만 현재 호출은 '티어'에 묶여 있으므로(main.js:167) v3는 `weapon → sfx이름` 대응표를 규칙 쪽에 둔다 |
| `gateGood/gateBad` | **손봐서 재사용** | 현재는 '통과 순간'만 울린다(main.js:88). v3는 (1) 유효탄마다 값 변화 반응(01 §5-3 "탄을 받으면 짧게 반응"), (2) 음수→양수 전환 순간(§11), (3) 통과 적용 3단계가 필요하다. 파일은 재사용하되 `gateTick`(스로틀 필수)·`gateFlip` 이름을 추가한다 |
| `kill/bossDie/hurt/bossIn/click/buy` | **그대로 재사용** | v3에도 같은 의미로 필요 |
| `evolve/demote` | **손봐서 재사용** | v3는 병력 기준 자동 진화·강등을 없앤다(01 §5-6, §12). `evolve` 파일은 '무기 교체'음으로, `demote`는 호출부를 없앤다 |
| `record/pickupDrop` | **그대로 재사용** | pickupDrop은 통 파괴 후 보상 합류(§5-4 "짧게 떠오른 뒤 부대로 합류")에 그대로 맞는다 |
| `bgmZone(zone)` / `bgmBoss(zone)` | **교체** | 5구간 러너 전제(zone 0~4 → sector1a~5a)다. v3는 스테이지·단계(도로/아레나/보너스/결과, 03 §3)로 곡을 고른다. 내부 `playBgm`을 `bgmPlay(name)`으로 공개하고 v3는 스테이지 정의에 곡명을 둔다. 기존 두 함수는 레거시 모드용으로 남긴다 |
| `bgmBattle()` | **제거 또는 방치** | 호출부 없음 |
| `duck(mult)` | **그대로 재사용** | 보스 경고·아레나 전환 정적에 그대로 쓸 수 있다 |
| `bgmPause/Resume` | **그대로 재사용** | 03 §6 "화면 숨김·pointercancel·포커스 상실에서 일시정지" 요구에 이미 main.js:397-403이 이 API로 대응한다 |

### rush.html

| 대상 | 판정 | 이유 |
|---|---|---|
| viewport·body·canvas CSS 3줄 | **그대로 베껴 쓰기** | `touch-action:none`, `aspect-ratio`, `user-scalable=no`는 v3 좌우 드래그·아레나 자유 이동(01 §5-1)에도 필요 |
| `<canvas 480×800>` | **손봐서 재사용** | 논리 좌표계 480×800은 기존 렌더러·좌표 변환과 맞물려 있어 유지가 유리하다(**[판단]**). 단 백킹스토어를 DPR에 맞춰 키우는 처리는 v3 부팅 코드에서 추가한다(03 §6 "실제 모바일에서 전방 숫자·내용물·적의 범위가 읽히는지") |
| `<script src="rush/main.js">` | **교체** | v3 전용 진입 모듈로 바꾼다. `rush/main.js`를 v3 페이지에서 import하면 `#game` 감지 즉시 자동 부팅(main.js:466)되어 두 게임이 한 캔버스에 겹친다 |

---

## (d) 갭과 위험

### d-1. 경로 결합 — v3 페이지 위치가 곧 자산 경로다

`loadSprites`의 기본 base `'assets/rush/'`(sprites.js:19)와 audio의 `DIR = 'assets/sound/'`(audio.js:3)는 모두 **HTML 페이지 URL 기준 상대경로**다. 스프라이트는 인수로 바꿀 수 있지만 오디오는 바꿀 수 없다. v3 진입 HTML을 `newmode/v3/` 아래에 두면 소리가 전부 무음이 되고, `onerror`가 조용히 넘어가는 구조(sprites.js:24, audio.js:88의 `.catch(() => {})`)라 **에러 로그도 남지 않는다**.

### d-2. 테스트 결합 — `SPRITE_KEYS` 수정 금지

`tests/rush-meta.test.mjs:79-90`이 키 개수 30과 대표 키 12개의 파일명을 단정한다. 키를 추가·개명하면 레거시 테스트가 깨진다. v3는 별도 표를 쓴다.

### d-3. 일괄 선로딩 10.6MB, 진행률 없음

30장 전부를 `Promise.all`로 기다린 뒤 첫 프레임(sprites.js:27, main.js:460-463). v3 1스테이지(01 §9)에 필요한 그림은 병사·게이트·통·잡졸·배경 정도인데 보스 5장·적 10장까지 받아야 시작된다. 스테이지 정의에 필요한 키 목록을 두고 그 묶음만 먼저 받거나, 로더에 `onProgress`를 추가해 로딩 화면을 그릴 수 있어야 한다. 실패 그림은 `ready`에서만 알 수 있으니 **개발 중에는 `Object.keys(keys).filter(k => !ready.has(k))`를 콘솔에 남기는 것**을 권한다.

### d-4. 소리 밀도 — 이름별 스로틀만으로는 v3 요구를 못 채운다

- 현재 fire 스로틀 0.045초 → 이름당 초당 최대 약 22회. 병사 30명이 각자 쏘면(01 §5-2 "병사 1명당 1개의 논리적 사격 주체") 초당 60발이라 스로틀이 절반을 버려도 여전히 22개의 `Audio` 객체가 매초 생성된다.
- `gateGood/gateBad/pickupDrop/evolve` 등은 스로틀이 없다. v3의 '유효탄마다 게이트 반응음', '발판마다 병사 합류음'(01 §5-5)을 이 이름들로 그대로 울리면 초당 수십 회 재생된다. 신규 이름에는 반드시 스로틀을 붙이고, 다수 합류는 '연속 합류 중 1회 + 마지막 1회'처럼 묶는 정책이 필요하다.
- `new Audio()` 매회 생성(audio.js:86)이라 풀이 없다. **[미실측]** 모바일 브라우저의 동시 HTMLAudio 개수 제한·지연은 이 저장소에서 측정한 적이 없다. 03 §6의 "후반 군단 성능 실측" 항목에 소리도 포함해야 한다.

### d-5. 게이트 그림에 상태가 없다

GATE.png 1장·반전 그리기(render.js:93-101). v3 게이트는 값이 −에서 +로 바뀌는 순간 색이 바뀌어야 하고(01 §5-3, §11 "+/− 기호와 반응"), 1·2·3칸 배치(§5-3)도 필요하다. 그림 2장(적/청) 또는 단색 실루엣 + 렌더러 색 오버레이 중 하나를 자산 목록에 추가해야 한다.

### d-6. 통 그림이 1종뿐

`SUPPLY.png` 1장이 '보급 = 병력 +N'에 대응한다(render.js:262-264, 숫자 오버레이 :287). v3는 통 위에 **내용물 실루엣(병사 1/2/3명·총·기관포·중화기·영웅 초상)** 과 **잔여 내구 숫자**가 동시에 읽혀야 한다(01 §5-4, §11). 통 본체 1장 + 내용물 아이콘 N장 구조가 필요하고, 03 §3 "통의 '내구 100'과 '병사 100명'은 전혀 다른 데이터 … 렌더러도 두 값을 구별"에 맞춰 키를 나눠야 한다.

### d-7. 고정 백킹스토어 480×800

`devicePixelRatio` 처리가 없어 물리 픽셀이 더 많은 화면에서는 CSS가 캔버스를 확대한다(rush.html:9,:13 + main.js 처리 없음). **[판단]** 01 §11 "멀리 있는 물체도 선택에 필요한 큰 실루엣은 보여준다", §5-4 "내구 숫자가 동시에 읽혀야" 요구에서 원근으로 작아진 숫자의 가독성이 떨어질 수 있다. v3 부팅에서 `canvas.width = 480*dpr` + `ctx.scale(dpr,dpr)`로 논리 좌표계는 유지한 채 해상도만 올리는 것이 렌더러 변경을 최소화한다.

### d-8. 그림당 512px PNG를 매 프레임 축소 그리기

병사 SOLDIER.png는 417×512인데 화면에서는 수십 px로 그린다(render.js:162). 01 §10 "군단 규모 상한은 초기 150명의 실제 시뮬레이션으로 시험"에 맞춰 150명 × drawImage 축소 비용은 측정해야 한다. **[판단]** 필요하면 로더에서 한 번 축소한 오프스크린 캔버스를 캐시하는 옵션을 붙일 수 있다(현재 없음).

### d-9. `unlock` 이전 사운드 유실

첫 입력 전 sfx는 버려진다(audio.js:79). v3 첫 스테이지는 "0초: 자동 사격"(01 §9)이므로 시작 버튼을 누른 입력이 unlock을 겸하면 문제없다. 키보드 시작도 unlock한다(main.js:405). 자동 시작(입력 없이 스테이지 진입)을 넣는다면 발사음이 무음으로 시작된다.

### d-10. **[미실측·일반지식]** iOS Safari의 HTMLMediaElement `volume`

`setVolume`·`duck`은 `bgmEl.volume`에 의존한다(audio.js:40,:54,:76). iOS Safari는 미디어 요소 볼륨 설정을 무시하는 것으로 널리 알려져 있으나 이 저장소에서 실측하지 않았다. 03 §6 모바일 확인 항목에 '음량 단계·덕킹이 실제로 들리는가'를 추가하기를 권한다.

---

## (e) v3 신규 모듈이 이 파일을 import할 때의 권장 방식

### e-1. 진입 페이지 위치

v3 진입 HTML은 **저장소 루트**(예: `rush-v3.html`)에 둔다. 그래야 `assets/rush/`·`assets/sound/` 상대경로가 기존 그대로 맞고(d-1), `index.html`·`rush.html`·`tuner.html`과 같은 층에서 배포된다. `rush/main.js`는 import하지 않는다(자동 부팅, main.js:466).

```html
<!-- rush-v3.html (루트) — rush.html:5-9,13의 CSS·캔버스 규격을 그대로 복사 -->
<canvas id="game" width="480" height="800"></canvas>
<script type="module" src="newmode/v3/src/main.js"></script>
```

### e-2. sprites.js — 최소 패치 + v3 전용 키표

기존 파일 1줄 패치(하위 호환):

```js
// rush/sprites.js:19
export function loadSprites(base = 'assets/rush/', keys = SPRITE_KEYS) {
  const jobs = Object.entries(keys).map(...)   // :21의 SPRITE_KEYS → keys
```

v3 쪽:

```js
// newmode/v3/src/sprite-keys.js
import { SPRITE_KEYS as L } from '../../../rush/sprites.js';
export const V3_SPRITE_KEYS = {
  soldier: L.soldier, hero1: L.m1, hero2: L.m2, /* 필요한 것만 선별 */
  gateRed: 'GATE_RED', gateBlue: 'GATE_BLUE',          // 신규(또는 GATE 1장 + 오버레이)
  crate: L.supply, crateSoldier1: 'CRATE_SOLDIER1', crateWeapon2: 'CRATE_WEAPON2',
  reinforce: 'REINFORCE', wall: 'WALL', /* ... */
};
// newmode/v3/src/main.js
import { loadSprites } from '../../../rush/sprites.js';
const sp = await loadSprites('assets/rush/', V3_SPRITE_KEYS);
```

- `rush-meta.test.mjs`는 `SPRITE_KEYS`를 건드리지 않으므로 그대로 통과한다.
- v3 테스트에는 **키 → 파일 존재** 검사를 추가한다(현재 rush-meta는 이름만 검사하고 파일 유무는 검사하지 않는다). `fs.existsSync('assets/rush/' + name + '.png')`를 `V3_SPRITE_KEYS` 전체에 돌리면 d-1·d-3의 조용한 실패를 CI에서 잡는다.
- 시뮬 테스트(Node)에서는 `loadSprites`를 호출하지 말고 `{ get: () => null, ready: new Set() }` 스텁을 렌더러에 넣는다(sprites.js:22 `new Image()`가 Node에 없음).

### e-3. audio.js — 옵션 인수 + `bgmPlay` 공개

기존 파일 패치(기존 `createAudio()` 호출은 동일 동작):

```js
export function createAudio({ dir = 'assets/sound/', sfx = {}, throttle = {}, vol = {} } = {}) {
  const DIR = dir;
  const SFX_T = { ...SFX, ...sfx }, THR = { ...THROTTLE, ...throttle }, VOL_T = { ...VOL, ...vol };
  ...
  return { ..., bgmPlay(name) { playBgm(name); }, ... };
}
```

v3 쪽 이벤트 이름 제안(파일은 전부 폴더에 존재 확인, 음색은 미청취):

| v3 사운드 이벤트(01 §11) | 이름 | 파일 후보 | 스로틀 |
|---|---|---|---|
| 사격 — 기본 소총 | `fire` | (기존) vulcan_1~3 | 0.045 유지 + 밀도 정책(d-4) |
| 사격 — 강화 자동화기 | `fireL` | (기존) laser_1~3 | 〃 |
| 사격 — 중화기 | `fireM` | (기존) missile_1~2 | 〃 |
| 통 잔여 내구 감소 | `crateHit` | nf_sfx_hit_1~3 (미매핑) | 0.08 이상 |
| 통 파괴 | `crateBreak` | explode_s_1~3 (kill과 파일 공유, 이름 분리) | — |
| 게이트 피격 틱(값 변화) | `gateTick` | nf_sfx_crystal_1~2 또는 hit | 0.06 이상 |
| 게이트 음수→양수 전환 | `gateFlip` | gate_good_1~2 | — |
| 게이트 통과(양수/음수) | `gateGood` / `gateBad` | (기존) | — |
| 병사 합류(단건) | `pickupDrop` | (기존) pickup_1~2 | 0.1 |
| 다수 합류(연속 증원 발판) | `joinMany` | pickup + charge_up_1~4 단계음 | 묶음 정책(d-4) |
| 무기 교체 | `weaponSwap` | evolve_1 | — |
| 보스 경고 | `bossIn` | (기존) boss_in_1 | — |
| 돌진 예고 | `telegraph` | nf_sfx_telegraph_1 (미매핑) | — |
| 영웅 보호막 | `shieldOn` / `shieldPop` | shield_on_1 / shield_pop_1~2 (미매핑) | — |

BGM은 스테이지 정의에 `bgm: 'nf_bgm_sector1a'`, `bossBgm: 'nf_bgm_boss_sector1'`처럼 곡명을 두고 v3 진행부가 `bgmPlay(name)`을 부른다. 미매핑 곡(`sector1b~5b`, `sector6a/b`, `boss_sector5/6`)을 스테이지·아레나·보너스 구분에 쓸 수 있다.

### e-4. 이벤트 전달 패턴은 기존 `sfxQueue` 방식을 유지

규칙 진행부는 소리를 직접 내지 않고 문자열 이름만 큐에 쌓고(main.js:39, :88 등), 페이지 층이 프레임 끝에 비운다(:446-447). 03 §2 main.js 방향("진행 함수를 브라우저와 테스트가 공유")과 맞고, 03 §6 "동일 코스의 30/60/120Hz … 동일 규칙 결과"를 검증할 때 소리 부작용이 규칙에 섞이지 않는다. v3에서는 큐 원소를 `{ name, count }`로 확장해 밀도 정책(d-4)을 페이지 층에서 처리하는 것을 권한다.

### e-5. 페이지 부팅에서 v3가 새로 해야 할 것

- DPR 반영(d-7): `canvas.width = 480 * dpr; canvas.height = 800 * dpr; ctx.scale(dpr, dpr)` — 논리 좌표계는 480×800 유지.
- 좌표 변환은 main.js:375-376 방식(`getBoundingClientRect` 비율)을 그대로 옮긴다.
- `pointercancel`·`blur`·`visibilitychange` → 입력 초기화 + `bgmPause`(main.js:394-403 패턴 이식).
- 로딩 화면: `loadSprites` 완료 전에도 캔버스에 진행 표시를 그리려면 `onProgress` 옵션이 필요하다(현재 없음, d-3).

---

## 부록 — 확인에 사용한 명령·근거

- 파일 본문: `rush/sprites.js` 1-29, `rush/audio.js` 1-91, `rush.html` 1-16 전체 정독.
- 호출부: `rush/main.js` 7,14,39,88-203(큐 push),213-218,375-417,426-466 / `rush/render.js` 22-31,51-57,86-115,162,174,248,262-264,294-297,342,462,491-492.
- 테스트: `tests/rush-meta.test.mjs` 8,79-90.
- 자산: `assets/rush/*.png` 30장 크기·용량(PNG IHDR 판독), `assets/sound/nf_*` 파일 목록.
- 이력: `git log -- rush/sprites.js rush/audio.js rush.html`, `git show 1adb59b -- rush/audio.js`.
- 호출 없음 확인: `grep -rn bgmBattle rush/` → 정의부 외 0건.
