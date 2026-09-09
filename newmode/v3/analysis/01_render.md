# 기존 모듈 분석 01 — rush/render.js

작성일: 2026-09-09  
대상: `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\rush\render.js` (734줄, HEAD c11922f 기준)  
기준 문서: `newmode/v3/spec/01_스타포지러시_재기획_v3.md` 5장·11장·12장·13장, `03_구현담당자_전달서.md` 2장·3장·4장·6장  
원칙: 실제 코드에서 확인한 것만 적는다. 근거는 `render.js:줄` 형식. 기존 파일은 수정하지 않았다.

## 0. 한 줄 판정

**대표 판정 = 손봐서 재사용(adapt).**  
그리기 기초 도구(그림자·둥근 사각형·스프라이트 폴백·버튼·파편·플로터·HP 숫자·일반 적·보스 오라·흔들림/피격 오버레이)는 그대로 쓸 수 있다. 그러나 v3의 핵심 그림인 **게이트·보급 통·부대·도로/분리벽·HUD·결과 화면**은 현재 코드의 전제(고정 2칸 게이트, 병력 숫자 → 대형 자동 생성, 보급 = 적 종류, 티어 진화)가 v3 규칙과 정면으로 어긋나므로 새로 써야 한다. 게다가 이 파일은 **export가 `createRenderer` 하나뿐**이라, 재사용 가능한 내부 함수를 v3가 골라 가져올 방법이 지금은 없다(§5 참고).

### 9/3 압축본과의 차이

03 전달서의 파일 비교는 9/3 압축본(cfa448b) 기준이다. 그 이후 render.js에 들어간 변경은 커밋 1adb59b(9/7) 하나이며 내용은 두 곳뿐이다.

- 욕심 게이트(`gate.greed`)를 골드색으로 칠함 — `render.js:91`
- 욕심 게이트 위에 ★ 표시 — `render.js:133-137`

그 외 함수 구성·시그니처·view 계약은 9/3과 같다. 단, 같은 기간에 main.js(+65줄)·track.js(+44줄)·combat.js(+37줄)가 바뀌어 render가 받는 view 객체에 `gate.greed`, POW 드랍 팝(`e.kind==='pow'`, vy -240 팝) 등이 추가됐다. 03 전달서의 "rush/render.js — 도로 원근감·분리벽·보급 내용물·변하는 게이트·개별 체력·아레나 지원"은 **현재 있는 기능이 아니라 해야 할 방향**이다. 현재 render.js에는 원근감·분리벽·보급 내용물 그림·개별 체력·아레나 중 어느 것도 없다.

## (a) export 목록과 시그니처·용도

| 이름 | 시그니처 | 용도 | 근거 |
|---|---|---|---|
| `createRenderer` | `createRenderer(canvas, sprites) → { draw(view) }` | 캔버스 2D 컨텍스트를 잡고 그리기 클로저를 만든다. 반환 객체의 유일한 메서드가 `draw(view)`. | `render.js:22`, `render.js:733` |

export는 이것 하나다. 아래 모든 그리기 함수는 `createRenderer` 안의 클로저이며 밖에서 접근할 수 없다. 모듈 상수 `W=480, H=800`, `TIER_FALLBACK`, `ENEMY_FALLBACK`, `ZONE_PAL`도 export되지 않는다(`render.js:6-20`).

### 의존(import)

- `BAL` ← `balance.js` (`render.js:2`) — 아래 읽는 키: `BAL.gates.{gap,width,h}`(85-109), `BAL.squad.{heroSizes,heroSize,y,soldierSize}`(152-156, 680-686), `BAL.enemies[kind].{drawScale,showHp}`(295, 320), `BAL.enemies.supply.rewardByZone`(265, 283), `BAL.fx.{continueTroops,shakeAmp,shakeDur,hurtFlashDur,busterHalfW}`(531, 568, 675, 697).
- `formation`, `displayUnits` ← `squad.js` (`render.js:3`) — 부대 그림 위치를 render가 직접 계산(154).
- `gateColor`, `isGood` ← `gates.js` (`render.js:4`) — 게이트 색과 "나쁜 게이트일 때만 내구 표시" 판단(91, 138).
- `sprites.get(key)` — `sprites.js`의 `loadSprites()` 결과. 없으면 `null`이 오고 폴백 도형을 그린다(25-31).

### 내부 함수 일람 (호출 순서는 `draw`, `render.js:565-731`)

| 내부 함수 | 시그니처 | 역할 | 줄 |
|---|---|---|---|
| `drawImgCentered` | `(key, x, y, h, fallbackFn)` | 스프라이트를 높이 h로 중심 정렬 그리기, 없으면 폴백 | 25 |
| `shadow` | `(x, y, w)` | 발밑 타원 그림자 | 34 |
| `roundRect` | `(x, y, w, h, r)` | 둥근 사각형 경로만 만든다(fill/stroke는 호출부) | 41 |
| `drawBackground` | `(scroll, zone)` | bg1~5 세로 무한 타일 또는 구간 색조 폴백 도로(차선 x=170,310 / 갓길 x=32,448) | 51 |
| `gateLabel` | `(g) → string` | `{add:'+',mul:'×',sub:'−',div:'÷'}[g.op] + g.value` | 79 |
| `drawGatePair` | `(y, pair)` | 좌우 2칸 고정 게이트 | 84 |
| `drawSquad` | `(squad, now=0)` | 히어로 1 + 병사 링 대형 + 총구 섬광 + 진화 링 + 발밑 병력 숫자 | 151 |
| `drawEnemy` | `(e)` | `pow` / `supply` / 일반 적 3분기 | 228 |
| `drawHpTag` | `(e)` | 대상 아래 남은 HP 정수 | 324 |
| `drawBoss` | `(boss)` | 보스 스프라이트 + 광분 오라 + 상단 고정 HP 바 | 334 |
| `drawHud` | `(hud)` | 상단 병력 수·진행 바·보스 거리·첫 출격 2배·신기록 섬광 | 356 |
| `drawButtons` | `(buttons)` | 주/보조 버튼 공통 스타일 | 394 |
| `drawEvolveCutscene` | `(cs, now)` | M-0N 진화/강등 전면 컷인 | 428 |
| `drawTitle` | `(view)` | 타이틀 워드마크·히어로 정면·최고 기록 | 476 |
| `drawResults` | `(res)` | 결과 텍스트 5줄 | 504 |
| `drawOver` | `(view)` | '전멸...' + 이어하기 안내 | 522 |
| `drawParts` | `(parts)` | 파편·섬광 파티클 | 535 |
| `drawFloaters` | `(floaters)` | 떠오르는 글자 | 551 |
| `draw` | `(view)` | 상태별 오케스트레이터(아래 인라인 블록 포함) | 565 |

`draw` 안에 함수로 분리되지 않고 인라인으로 박힌 그림: 쇳물 장판(576-599), 보스 관통 경고선(601-606), 저격 조준선(608-615), **아군 탄**(619-637), **적탄 5종**(638-672), 버스터 빔(673-688), 보스 앞 어둠(692-695), 피격 비네트(696-703), 일시정지 오버레이(707-717), '오늘의 도전' 태그(724-729).

그리기 순서(565-731): 흔들림 변환 → 배경 → 게이트 → 장판 → 보스 경고선 → 적(조준선 포함) → 보스 → 아군 탄 → 적탄 → 버스터 → 부대 → 파편 → 플로터 → 어둠 → 피격 비네트 → 컷인 → HUD → over/paused → 버튼 → daily 태그.

## (b) 내부 데이터 형태 — `draw(view)`가 읽는 필드

view는 `main.js:249-328`의 `view()`가 매 프레임 새로 만든다. render는 아래 필드만 읽는다(읽지 않는 필드는 무시).

### view 최상위

| 필드 | 형 | 읽는 곳 |
|---|---|---|
| `state` | `'title'|'run'|'over'|'paused'|'results'` | 573, 706-707, 718, 720 |
| `mode` | `'normal'|'daily'` | 724 |
| `now` | 초 단위 시각(performance.now()/1000) | 570, 578, 594-595, 602, 662, 676, 689, 704 |
| `scroll`, `zone` | 스크롤 px, 구간 0~4 | 572 |
| `shakeT`, `hurtT`, `dim` | 연출 잔여 시간/농도 | 566-571, 692-703 |
| `gates[]` | `{ y, pair }` | 574 |
| `pools[]` | `{ x, y, warn }` | 576 |
| `boss` | 아래 | 601, 618, 641 |
| `enemies[]`, `bullets[]`, `eshots[]` | 아래 | 607, 619, 638 |
| `squad` | 아래 | 673, 689 |
| `parts[]`, `floaters[]` | 아래 | 690-691 |
| `cutscene` | `{ k, tier, down }` 또는 null | 704 |
| `hud` | 아래 | 705 |
| `buttons[]` | 아래 | 723 |
| `best` | 최고 기록 | 497 |
| `results` | 아래 | 721 |

### 게이트 `gates[i].pair.left / .right` (`drawGatePair`, 84-147)

| 필드 | 의미 | 줄 |
|---|---|---|
| `op` | `'add'|'mul'|'sub'|'div'` — 색과 기호를 결정 | 80, 91, 138 |
| `value` | 표시 숫자(부호 없음, 기호가 op에서 옴) | 81 |
| `greed` | 골드 색 + ★ | 91, 133 |
| `broken` | 파괴됨 → 회색 숫자 + ✕ | 116-126 |
| `hp` | 남은 내구(나쁜 게이트만, `isGood(op)`가 false일 때만 표시) | 138-144 |

x 위치는 view에 없다. `W/2 ± BAL.gates.gap/2`에서 좌우 폭 `BAL.gates.width`로 **render가 고정 계산**한다(86-89). 왼쪽 게이트는 스프라이트를 좌우 반전(97-100), 세로는 0.55배 눌러 그린다(96). 피격 반응 필드는 없다.

### 부대 `squad` (`drawSquad`, 151-223; `main.js:271-273`에서 생성)

| 필드 | 의미 | 줄 |
|---|---|---|
| `x` | 부대 중심 x(y는 `BAL.squad.y`=640 고정) | 156, 161, 172 |
| `count` | 표시 병력(지연 추종된 정수) → `formation(displayUnits(count))`로 **위치를 render가 생성** | 154, 220 |
| `tier` | 0~4 → 히어로 스프라이트 `m1~m5`와 크기 | 153, 174 |
| `radius` | 숫자 라벨 y 위치 | 215 |
| `hurt` | 병력 숫자 빨강 | 221 |
| `fireFlash`, `muzzles` | 총구 섬광 잔여/열 수 | 155, 200-213 |
| `evolveT`, `evolveUp` | 진화 링 | 184-198 |
| `busterT` | 버스터 빔(draw에서 읽음) | 673-688 |

병사·히어로 개별 위치·체력은 view에 없다. 12명까지 1:1, 이후 7명당 1기, 최대 50기 축약(`squad.js:42-45`), 대형은 `formation()`(`squad.js:12-27`)이 만든 동심 링. 히어로 판별은 `p.x===0 && p.y===0` 휴리스틱(156).

### 적 `enemies[i]` (`drawEnemy`, 228-321; `combat.js:16-26`에서 생성)

| 필드 | 의미 | 줄 |
|---|---|---|
| `kind` | `'pow'`(229) / `'supply'`(260) / 그 외 → 스프라이트 `'e_'+kind`(294) | |
| `x, y, r` | 화면 좌표·반지름(화면 공간, 원근 없음) | 전역 |
| `zone` | supply 보상 표 인덱스 | 265, 283 |
| `hp` | `drawHpTag`(BAL의 `showHp`일 때 또는 supply) | 273, 291, 320, 329 |
| `aimT, aimX, aimY` | 저격 조준선(draw에서) | 608-615 |

**보급(supply)은 적 종류의 한 분기**다. 표시 텍스트 `'+N'`은 객체가 아니라 `BAL.enemies.supply.rewardByZone[e.zone]`에서 render가 조회한다(265, 283). 내구는 `e.hp`를 `drawHpTag`로 아래에 찍는다(273/291). 즉 "보상 텍스트 + 내구 숫자"를 동시에 보여주는 원형은 있으나, 보상이 **내용물 그림**이 아니라 **BAL 표 숫자**이고 객체에 payload가 없다.

### 보스 `boss` (`drawBoss`, 334-354)

`x, y, r, zone`(스프라이트 `'b'+(zone+1)`, 342), `hp, max`(HP 바, 353), `rage, phase2`(오라·바 색, 336-352), `sweepPhase, warnX`(경고선, 601-605), `y`(갈고리 체인 시작점, 641). HP 바는 `(90,24,300,14)` 한 개 고정(351-353). 보스 여러 마리·개별 숫자 표시는 없다.

### 아군 탄 `bullets[i]` (619-637; `combat.js:69`에서 생성)

`x, y`, `w`(굵기, 기본 4), `tier`(0~1 시안 막대 / 2~3 골드 막대+흰 심 / 4 플라즈마 구). 탄마다 `fillStyle`을 다시 지정하고 개별 `fillRect`/`arc` — 묶어 그리기 없음. `vx`가 있어도(마그넷 휘어짐, `combat.js:86`) **세로 막대로만** 그린다(630, 635): 방향 회전 없음.

### 적탄 `eshots[i]` (638-672)

`x, y, vx, vy`, `hook`(체인+클로), `shape: 'needle'|'shell'|'shard'|기타(lamp)`. needle만 `atan2(vy,vx)`로 회전(647).

### 파편 `parts[i]` (535-549): `x, y, t, life, r, flash, big`.  
### 플로터 `floaters[i]` (551-563): `x, y, t, text, color, big`. 수명 0.9초가 render에 하드코딩(554) — `main.js:193`의 0.9와 손으로 맞춰 둔 값.
### HUD `hud` (356-390): `count, gold, progress, bossDist, firstRunX2, recordFlash`. 좌표 전부 고정(84/104/136).
### 버튼 `buttons[i]` (394-425): `x, y, w, h, label, primary, sub, disabled`. 히트 판정은 `main.js:17`의 `hitButton`이 같은 사각형을 쓴다.
### 결과 `results` (504-520): `isRecord, won, peak, kills, coins, x2, wallet`.
### 컷인 `cutscene` (428-474): `k`(0→1), `tier`, `down`.

## (c) v3 요구 대비 판정 — 함수 단위

판정 기준: v3 기획 5-2(병사별 사격), 5-3(사격형 게이트), 5-4(내용물+내구 통), 5-5(연속 증원), 5-6(무기 3단), 5-8(보스 2종), 11장(HUD·연출), 12장 변경표, 13장 1단계(게이트·통·군단 사격·분리벽·재도전), 03 전달서 3장 데이터 구분.

| 함수/블록 | 판정 | 이유(근거 줄) | v3에서 해야 할 일 |
|---|---|---|---|
| `drawImgCentered` (25) | **그대로 재사용** | 키→스프라이트+폴백. 게임 규칙 없음 | 새 키(무기 실루엣·영웅 초상·통 종류·벽)만 sprites.js에 추가 |
| `shadow` (34) | **그대로 재사용** | 순수 도형 | 150명 군단이면 `beginPath` 한 번에 타원 다 넣고 fill 1회로 묶는 편이 안전(현재는 유닛마다 fill, 156) |
| `roundRect` (41) | **그대로 재사용** | 순수 도형 | — |
| `drawBackground` (51) | **교체** | 세로 타일 스크롤 + 고정 도로 밴드(30~450)·차선 2줄(68)뿐. 분리벽·2차선/3갈래·좁은 다리·합류·원근(기획 5-1) 개념이 없다 | 스테이지 정의(통로 폭·분리벽 좌표)를 받아 그리는 `drawRoad(stageGeom, scroll)` 신규. bg 타일 루프(53-57)는 뒤 배경층으로 재사용 가능. 572줄 주석의 교훈(도로와 물체는 같은 속도, 시차 금지)은 유지 |
| `gateLabel` (79) | **교체** | 기호를 `op`에서 뽑는다(80). v3 게이트는 `signedValue` 하나이고 부호는 값의 부호(기획 5-3, 03 §3) | `(v)=> (v>0?'+':v<0?'−':'') + Math.abs(v)` 수준의 새 함수. `mul/div`는 실험용이라 기본 경로에서 제외 |
| `drawGatePair` (84) | **교체** | ① 좌우 2칸 고정(86-89) — v3는 1/2/3칸·연속 행·분리벽 반대편(기획 5-3). ② 색이 `op`에서 옴(91) — v3는 값 부호로 빨강↔파랑 전환. ③ `broken`+✕(116-126)와 `hp` 내구(138-144)는 v3가 폐지한 'HP 0 파괴' 규칙(기획 12장 3행). ④ 피격 반응 필드 없음(기획 5-3 "탄을 받으면 짧게 반응") | `drawGate(g)` 신규: `g={x,y,w,h,value,hitFlash,passed}` 화면 좌표를 view가 준다. 스프라이트 반전·눌림(95-102)과 외곽선 폴백(104-110)은 옮겨 쓸 수 있음. 색 전환은 값 부호 기준, 0은 중립색. hitFlash는 숫자 가독성을 해치지 않게 테두리·스케일만 |
| `drawSquad` (151) | **손봐서 재사용** | 걸음 바운스(158-161)·그림자·병사 스프라이트·발밑 병력 숫자(214-222, 기획 11장 "일반 병력 수는 부대 가까이"와 일치)는 유용. 그러나 위치를 `formation(displayUnits(count))`로 **render가 생성**(154) — v3는 `squadUnits`의 실제 위치·체력(03 §3)을 그려야 하고 병력 증가가 그림에 즉시 드러나야 한다(기획 13장 완료 기준). 축약 표시(7명당 1기)는 v3의 "병사 1명당 1개 사격 주체"와 충돌. 히어로를 `tier`로 고르고(174) 진화 링(184-198)·티어별 총구 수(202)는 폐지 대상(기획 5-6, 12장) | `drawUnits(units, now)` 신규: `units=[{x,y,type:'soldier'|'hero',heroId,hp,maxHp,hit}]`를 그대로 그림. 바운스/스웨이 수식·그림자·병력 숫자 라벨은 이식. 총구 섬광은 유닛별 `fireFlash`로 |
| `drawEnemy` 일반 분기 (294-321) | **그대로 재사용** | `'e_'+kind` 스프라이트 + 상자/원/마름모 폴백 + `showHp` 숫자. v3 적 6종(잡졸·돌격·원거리·장갑·정예·차량)도 같은 형태로 표현 가능 | `drawScale`·`showHp`를 `BAL.enemies`가 아니라 view 객체 필드로 받게 바꾸면 balance 재편(03 §2)과 분리된다 |
| `drawEnemy` `'pow'` 분기 (229-259) | **분리 보관** | 버스터는 v3에서 선택적 지원 무기(기획 5-6, 12장) | 픽업 그리기로 따로 떼어 두고 기본 경로에서는 호출 안 함 |
| `drawEnemy` `'supply'` 분기 (260-293) | **교체** | 03 §2 "보급물을 적 종류에 끼워 넣지 않는다"와 정면 충돌(적 배열 안의 kind). 보상 텍스트가 `BAL.rewardByZone` 조회(265, 283) = render 안의 규칙 판단. 내용물 그림 없음. 병사/무기/영웅/연속증원/구출 5종 구분 없음(기획 5-4 표) | `drawSupply(s)` 신규: `s={x,y,r,kind,durability,payload:{icon,count},hitFlash,opened}`. 내용물 실루엣(위) + 내구 숫자(아래)를 동시에. `drawHpTag` 재사용해 내구 표시. 연속 증원 컨테이너는 활성화 후 발판 열(기획 5-5)까지 그려야 하므로 별도 `drawReinforceLane(lane)` |
| `drawHpTag` (324) | **그대로 재사용** | 대상 아래 정수 HP. 보급 내구·정예 큰 체력(기획 5-7)에 그대로 | 글자 크기를 인자로 받으면 정예용 큰 숫자에 재사용 가능 |
| `drawBoss` (334) | **손봐서 재사용** | 스프라이트 키가 `zone`(342)·HP 바가 상단 1개 고정(351-353). v3 도로 보스 1~3마리 개별 체력·아레나 보스(기획 5-8) | 스프라이트 키를 `boss.spriteKey`로, HP 바를 보스별(머리 위 또는 상단 n칸)로. 광분 오라(336-341)·폴백(343-348)은 유지 |
| `drawHud` (356) | **교체** | 최고 병력·진행 바·보스 거리 고정 규칙은 v3가 내려놓음(기획 11장 "기존 최고 병력·보스까지 거리 HUD 고정 규칙은 내려놓는다"). 상단은 스테이지/목표 + 남은 적/보스 상태 | 신규 `drawHud({stageLabel, objective, remaining, bossHp[]})`. 신기록 섬광(377-389)은 필요하면 결과 화면으로 이동 |
| `drawButtons` (394) | **그대로 재사용** | 순수 UI | 아레나 "드래그로 피하세요" 안내나 드론 버튼도 같은 버튼 배열로 |
| `drawEvolveCutscene` (428) | **폐기(미사용)** | M-0N 진화/강등 자체가 사라짐(기획 12장). "큰 전면 컷인으로 반복 정지하지 않는다"(11장) | 첫 영웅 구출·지역 개방 축하 연출에만 골격(광선·링·확대 팝) 재활용 검토 |
| `drawTitle` (476) | **손봐서 재사용** | 문구·히어로 정면 그림·최고 기록. 규칙 없음 | 모드 3종 버튼은 main이 주므로 문구만 조정 |
| `drawResults` (504) | **교체** | 최고 병력·격파·코인·지갑 5줄. v3는 작전 결과·보상·기여도·재도전 경로·실패 원인 문장(기획 6장 "앞줄이 먼저 무너짐…", 12장 마지막 행) | 신규. 어두운 판(505-506)과 텍스트 스타일은 재사용 |
| `drawOver` (522) | **교체** | `'병력 N기로 그 자리에서 다시 싸운다'`가 `BAL.fx.continueTroops`에서 옴(531). v3 순수 모드는 재시작, 캠페인은 편성/성장 후 재시도(12장 "부활 10명 고정" 행) | 실패 안내 + 재도전/강화 버튼 화면으로 |
| `drawParts` (535) | **그대로 재사용** | 순수 파티클 | 통 파괴·게이트 양수 전환 연출에 그대로 |
| `drawFloaters` (551) | **그대로 재사용** | 순수 텍스트 | 수명 0.9 하드코딩(554)을 `f.life`로 받게 하면 main 쪽 상수와 이중 관리 해소 |
| 아군 탄 블록 (619-637) | **손봐서 재사용** | 티어 5단 색(시안/골드/플라즈마)이 v3 무기 3단(노랑 가는/파랑 빠른/주황 굵은+폭발, 기획 5-6)과 다름. 탄마다 fillStyle 재설정·개별 fillRect — 병사별 사격으로 탄 수가 늘면 부담. `vx`가 있어도 세로 막대(630, 635) | 무기 키 → 스타일 표로 바꾸고, **스타일별로 묶어 한 path에 그린다**(fillStyle 1회). 각도 탄은 `atan2(vy,vx)` 회전(needle 방식 647-654 참고). 명중량·분배는 combat 몫이고 render는 묶어 그리기만(기획 5-2 "탄 그림은 묶어도 총 명중량 유지") |
| 적탄 블록 (638-672) | **그대로 재사용** | 5종 모양 다 순수 그림 | v3 원거리 적 "예고 후 탄"(5-7)은 조준선(608-615)+needle 조합으로 이미 표현 가능 |
| 버스터 빔 (673-688) | **분리 보관** | 선택적 지원 무기 | 기본 경로에서 제외, 함수로 분리 |
| 장판·경고선·조준선 (576-615) | **그대로 재사용(선택)** | 보스 개별 패턴 연출. 스멜터·레일 리바이어던이 v3에 남으면 그대로 | 함수로 떼어 내야 골라 쓸 수 있음 |
| 흔들림·어둠·피격 비네트 (566-571, 692-703) | **그대로 재사용** | 연출 오버레이 | `BAL.fx` 상수만 새 balance로 연결 |
| 일시정지 오버레이 (707-717) | **그대로 재사용** | — | 03 §6 "화면 숨김·pointercancel 시 일시정지"와 맞물림 |
| `draw` 오케스트레이터 (565) | **교체** | `state` 4종·gates→pair·squad 단일 객체 등 옛 view 계약에 묶임. v3는 phase(도로/아레나/보너스/결과)와 벽·게이트 배열·유닛 배열이 필요 | v3 전용 `drawV3(view)` 신규. 위 표의 "그대로 재사용" 항목을 호출만 한다 |

집계: 그대로 재사용 12개 블록 / 손봐서 재사용 5개 / 교체 8개 / 폐기·분리 보관 3개. 규칙에 닿는 그림(게이트·통·부대·HUD·결과)이 모두 교체 쪽이라 "그대로 import해서 쓴다"는 성립하지 않고, 기초 도구는 살릴 수 있으므로 대표 판정은 **adapt**.

### v3 1단계(기준 전투 3개)에 당장 필요한 것과 현재 코드의 거리

| v3 1단계 요구 | 현재 render.js | 거리 |
|---|---|---|
| 사격으로 값이 변하는 게이트(부호·색 전환·피격 반응) | op 기반 색·기호, 파괴 ✕, 내구 숫자(84-147) | **새로 작성**. 스프라이트/폴백 도형만 이식 |
| 내용물 그림 + 내구 숫자 통(병사/무기/연속증원) | `'+N'` 텍스트(BAL 조회) + hp 숫자(260-293) | **새로 작성**. `drawHpTag`·그림자 이식 |
| 병사별 개별 사격 탄막(묶어 그리기) | 탄별 개별 그리기, 티어색(619-637) | **개조**. 스타일별 배치 |
| 실제 군단(유닛 위치 그대로) | count → formation 자동 생성(154) | **새로 작성**. 바운스 수식 이식 |
| 분리벽 | 없음 | **새로 작성** |
| 결과 화면(재도전 경로) | 5줄 텍스트(504-520) | **새로 작성** |
| 파편·플로터·버튼·적·보스·오버레이 | 있음 | **그대로** |

## (d) 갭과 위험

1. **export 단일 진입점.** 재사용하고 싶은 도구가 전부 `createRenderer` 클로저 안에 있어(22-733) `ctx`를 공유한다. v3가 `drawHpTag` 하나만 가져올 수 없다. 복사하거나 render.js를 리팩터해 도구 팩토리를 export해야 한다(§5).
2. **render 안의 규칙 판단.** 파일 머리에 "게임 판단은 하나도 하지 않는다"(1)고 적혀 있지만, 보급 보상은 `BAL.enemies.supply.rewardByZone[zone]`을 render가 직접 조회하고(265, 283), 게이트 내구 표시 여부를 `isGood(op)`로 결정한다(138). 03 §3 "통의 내구 100과 병사 100명은 다른 데이터, 렌더러도 두 값을 구별"을 지키려면 보상·내구가 **객체 필드**로 와야 한다.
3. **BAL 결합 15곳.** balance.js가 무기·보급·스테이지·영웅·드론별로 재편되면(03 §2) `BAL.gates.width`(85)·`BAL.squad.y`(680)·`BAL.enemies[kind].showHp`(320)·`BAL.fx.*`(531/568/675/697) 등이 전부 깨진다. gates.js에서 `gateColor`/`isGood`이 사라져도(03 §2 "HP 0 파괴형 제거") import(4)가 깨진다.
4. **화면 공간 고정, 원근 없음.** 부대 y는 `BAL.squad.y`=640 고정(156, 173, 215), 적·탄은 화면 좌표(`combat.js:17-22`), 크기는 `e.r` 그대로. 기획 5-1 원근감을 넣으려면 투영이 필요한데, 03 §4 "그림과 판정을 일치"·기획 10장 "그림과 판정을 일치시킨다"에 따라 **투영 함수를 combat과 render가 공유**해야 한다. render만 원근을 흉내 내면 판정과 어긋난다. 1단계에서는 원근을 미루고 2D 평면 좌표로 시작하는 것을 권한다(결정 필요).
5. **캔버스 480×800 논리 고정**(6, `rush.html:13`, `main.js:376`). 아레나 "넓어진 화면"(기획 5-1)은 뷰포트 변환이 없으면 못 만든다. 아레나는 카메라 이동/줌 변환을 `draw`에 추가하거나, 아레나 좌표계를 480×800 안에 맞춰 설계해야 한다.
6. **시간원 불일치.** `pow`(230)와 보스 오라(337)는 `view.now`가 아니라 `performance.now()`를 직접 읽는다. 일시정지 중에도 움직이고, 헤드리스 렌더 검증(03 §6 30/60/120Hz 동일 결과)에서 결정성이 깨진다. v3 도구로 옮길 때 전부 `view.now`로 통일.
7. **군단 150명 성능 미측정.** 현재는 최대 50기 축약(`squad.js:44`)이라 유닛마다 그림자 fill + drawImage를 해도 버텼다. v3 "초기 150명 실제 시뮬레이션"(기획 10장)에서는 유닛 150 × (그림자 + 스프라이트) + 병사별 탄. 그림자 묶기·탄 스타일별 묶기 없이는 모바일 확인이 안 된 상태로 남는다.
8. **탄 방향 미표현.** `vx`가 있는 탄을 세로 막대로 그린다(630, 635). v3 아레나 자동 조준·병사별 사선(정면 사격이 한 점으로 모이지 않게, 기획 5-2)에서 그림이 실제 궤적과 어긋난다.
9. **히어로 판별 휴리스틱.** `p.x===0 && p.y===0`으로 히어로를 찾는다(156). 영웅 여러 명(최대 5, 기획 6장)에서는 성립하지 않는다.
10. **플로터 수명 이중 상수.** render 0.9(554)와 main 0.9(`main.js:193`)를 손으로 맞춘 상태.
11. **문구 하드코딩.** '진화!', '강등...', '전멸...', '보스 격파!', '최고 병력', '오늘의 도전' 등이 render에 박혀 있어(466, 510, 513, 528, 728) v3 문구(작전 성공/실패, 목표)로 바꾸려면 코드 수정.
12. **테스트 부재.** `tests/rush-*.test.mjs` 어디도 render.js를 import하지 않는다. 지금 render를 손대도 자동으로 잡히는 회귀가 없다. v3 렌더러는 최소한 "view 한 장을 넣으면 예외 없이 그려진다"·"묶어 그린 탄 수 = view 탄 수" 정도의 Node 캔버스 스텁 검사를 붙일 것.

## (e) v3 신규 모듈이 이 파일을 import할 때의 권장 방식

**결론: `createRenderer`를 그대로 import하지 않는다.** `draw(view)`는 옛 view 계약(gates→pair, squad 단일 객체, state 4종)에 묶여 있어 v3 view를 넣으면 게이트·부대에서 바로 어긋난다. 대신 다음 두 단계.

### 1) render.js에서 "도구 팩토리"를 분리해 export (기존 파일에 대한 최소 수정)

```js
// rush/render-prims.js (신규) — ctx·sprites만 알고 게임 규칙을 모른다
export const VIEW = { W: 480, H: 800 };
export function createPrims(ctx, sprites) {
  return { drawImgCentered, shadow, roundRect, drawHpTag, drawButtons,
           drawParts, drawFloaters, drawEnemyGeneric, drawBossBody,
           drawShake, drawHurtVignette, drawDim, drawPauseOverlay };
}
```

- 옮길 본문: `render.js:25-49`(3개 도구), `324-332`, `394-425`, `535-563`, 일반 적 분기 `294-321`, 보스 몸체 `335-349`, 오버레이 `566-571`·`692-717`.
- `drawEnemyGeneric`은 `BAL.enemies[kind].drawScale/showHp`(295, 320) 대신 `e.drawScale`, `e.showHp`를 읽게 바꾼다. `drawHpTag`는 글자 크기 인자를 받는다.
- 기존 `createRenderer`는 이 팩토리를 호출하도록 바꿔 옛 모드가 그대로 돌게 둔다(기획 13장 "기존 코드를 한 번에 폐기하지 않는다"). 이 단계는 실제 구현 시 손댈 부분이고, **이번 분석에서는 수정하지 않았다.**

### 2) v3 렌더러는 팩토리만 import

```js
// newmode/v3/src/render-v3.js (신규)
import { createPrims, VIEW } from '../../../rush/render-prims.js';
export function createRendererV3(canvas, sprites) {
  const ctx = canvas.getContext('2d');
  const P = createPrims(ctx, sprites);
  function drawRoad(geom, scroll) { /* 통로·분리벽 */ }
  function drawGate(g) { /* signedValue 부호색·hitFlash */ }
  function drawSupply(s) { /* payload 실루엣 + P.drawHpTag(durability) */ }
  function drawUnits(units, now) { /* 실제 위치, 바운스 수식 이식 */ }
  function drawBulletsBatched(bullets) { /* 스타일별 1 path */ }
  function drawHudV3(hud) { /* 스테이지/목표/남은 적 */ }
  function drawResultV3(res) { /* 결과·기여도·재도전 */ }
  return { draw(view) { /* phase 별 순서 */ } };
}
```

### v3 view 계약(권장) — render가 BAL을 보지 않도록 "그릴 값"만 담는다

- `phase: 'road'|'arena'|'bonus'|'result'`, `now`, `shakeT`, `hurtT`
- `road: { scroll, bgKey, lanes:[{x0,x1}], walls:[{x0,x1,y0,y1}] }` — 화면 좌표
- `gates: [{ x, y, w, h, value, hitFlash, passed }]` — 색·기호는 value 부호로 render가 결정(유일한 판단)
- `supplies: [{ x, y, r, kind, durability, payload:{ iconKey, count }, hitFlash }]`
- `reinforceLanes: [{ x, y0, y1, pads:[{y, taken}] }]`
- `units: [{ x, y, type, spriteKey, hp, maxHp, hit, fireFlash }]`, `squadLabel: { x, y, count }`
- `bullets: [{ x, y, vx, vy, style }]` — style은 무기 키(`rifle|auto|heavy`), render는 style별로 묶는다
- `enemies: [{ x, y, r, spriteKey, hp, showHp, drawScale, aim? }]`, `bosses: [{ x, y, r, spriteKey, hp, max, rage, phase2 }]`
- `eshots`, `parts`, `floaters(life 포함)`, `buttons`, `hud`, `result`

이렇게 하면 03 §3 "통의 내구 100과 병사 100명은 다른 데이터"가 view 단계에서 강제되고, balance.js 재편이 render를 깨지 않는다.

### 하지 말 것

- `createRenderer(...).draw(v3view)` 호출 — 게이트(`pair.left/right` 접근, 87-88)와 부대(`formation(displayUnits(count))`, 154)에서 바로 틀린 그림이 나온다.
- render 안에서 `BAL`을 다시 import해 보상·내구를 계산하는 것(현재 265·283의 반복).
- `performance.now()` 직접 호출(230, 337의 반복).

## 참고: 스프라이트 키 (sprites.js, render가 쓰는 이름)

`m1~m5`(히어로 티어), `soldier`, `mfront`, `supply`, `pow`, `e_scrapbit … e_magnethead`(10종), `b1~b5`, `gate`, `bg1~bg5` (`sprites.js:2-17`). `assets/rush/`에 대응 PNG 30장이 실제로 있다. v3는 무기 실루엣 3종·통 종류별 그림·벽 타일·영웅 초상 키가 추가로 필요하며, 이는 sprites.js 담당 분석에서 다룬다.
