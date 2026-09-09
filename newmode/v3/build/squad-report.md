# 스타포지 러시 v3 1단계 — 묶음 [부대] 구현 보고 (라운드 1, 2026-09-10)

## 만든 것

- `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\rush3\squad.js` — 계약서 3-5·3-6 구현. 순수 모듈(Math.random·rng·balance import 없음). 옵션 객체 `SQUAD_DEFAULTS`(unitR 9, unitHp 2, ringStart 26, ringGap 19, soldierSize 22, roadLo 80, roadHi 400, wallLead 60, wallMargin 6, freeHalfMax 60, unitCap 150)를 모든 함수의 마지막 인자 `opts`로 덮어쓸 수 있다.
- `E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\tests\rush3-squad.test.mjs` — V3-SQUAD 5건·V3-WALL 4건·V3-HIT 1건 = 10건.

### export 목록
| 함수 | 요약 |
|---|---|
| `formation(n, opts?)` | 히어로(0,0) 중심 동심 링, 전방 90° 개방. 기존 `rush/squad.js` 링 알고리즘을 옮겨 적음(drawCap 없음, n 그대로). 반환 `[{dx, dy}]`. 기본 옵션이면 n 별 캐시(결정적이라 결과 동일) |
| `formationHalfWidth(n, opts?)` | 오프셋 \|dx\| 최대 + unitR |
| `makeUnit(id, interval=0.5, opts?)` | `{ id, dx:0, dy:0, hp:2, fireT: ((id*7)%12)/12*interval }` |
| `layoutUnits(units, opts?)` | 배열 순서대로 formation 오프셋 재부여(id 유지) |
| `compressUnits(units, lo, hi, opts?)` | dx 를 상대 범위 [lo, hi] 로 좌·우 따로 비례 압축. **기준을 현재 dx 가 아니라 formation 오프셋으로 잡아** 범위가 넓어지면 원래 대형으로 복원된다(멱등). 압축 불필요 시 formation 값 그대로 |
| `clampCenter(run, walls, opts?)` | 벽 진입 규칙(진입 STEP `prevZ < z0-60 <= z` 에서 side 결정·`run.wallSide[id]` 기록·스냅), 활성 구간 `[z0-60, z1]` 에서 `hw = min(반폭, 통로폭/2 - 6)` 로 중심·tx 클램프, 벽 밖은 `hw' = min(반폭, 60)` 로 도로 클램프, `z > z1` 이면 wallSide 삭제 |
| `hitUnit(units, x, z, r, sweep?, origin?, opts?)` | 원 또는 스윕 선분 vs 유닛 원(r 9) 겹침 중 가장 가까운 1명, 없으면 null |
| `frontmostUnit(units, filterFn?)` | dy 최소 유닛 |
| `removeUnits(units, n, from='back')` | dy 큰 순(또는 작은 순) 제거, 제자리 변경, 제거 수 반환. layoutUnits 는 호출자 몫 |
| `addUnits(run, n, interval=0.5, cap?, opts?)` | `run.nextUnitId` 로 생성, cap(기본 150) 클램프, 끝에 layoutUnits. 추가 수 반환 |

## 테스트 결과(실제 실행 출력)

- `node --test tests/rush3-squad.test.mjs` → tests 10 / pass 10 / fail 0
- 기존 `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `grep -nE "Math\.random|rng" rush3/squad.js` → 매치 없음

## 계약서와 다르게 한 것·해석한 것(조율자·combat 담당 확인 요망)

1. **`clampCenter` 반환값 확장**: 계약서는 `{ lo, hi }` 만 말한다. 여기서 `lo/hi` 는 **중심 허용 범위**로 두었고, 추가로 `edgeLo/edgeHi`(통로·도로 가장자리), `hw`, `wallId`, 그리고 **`dxLo/dxHi`** 를 돌려준다. 계약서 3-5 의 "compressUnits 는 dx 를 `[lo - run.x, hi - run.x]` 로 압축" 에서 lo/hi 는 문맥상 통로 가장자리인데, 중심 범위 lo/hi 를 그대로 넣으면 대형이 hw 폭으로 뭉개진다. **combat 은 `compressUnits(run.units, c.dxLo, c.dxHi)` 를 쓰면 된다**(dxLo = edgeLo + unitR − run.x, dxHi = edgeHi − unitR − run.x). 테스트 V3-WALL 이 이 조합으로 n=1·n=60 유닛 전원이 통로 안(원 포함)임을 검증한다.
2. **정확히 중앙 진입의 side**: 계약서 식 `(tx < mid ? 'L' : 'R')` 은 tx==mid 일 때 'R' 이지만, 바로 뒤 괄호 "정확히 중앙이고 tx도 중앙이면 'L'" 을 따라 `tx <= mid → 'L'` 로 했다. V3-WALL "x 240 무조작 진입" 테스트(계약서 8장)는 어느 쪽이든 통과하지만 현재 구현은 'L' 로 스냅한다.
3. **`hitUnit` 시그니처**: 계약서 표는 `hitUnit(units, x, z, r)` 인데 유닛은 오프셋만 갖고 있어 부대 중심이 필요하다. `origin = { x, z }`(= run) 을 6번째 인자로 받고, 생략하면 (0,0) 기준 상대 좌표로 본다. `sweep = { x?, z }` 는 이동 전 위치(x 생략 시 현재 x). "가장 가까운" 은 스윕이면 진행 방향에서 먼저 닿는 유닛(선분 파라미터 t 최소, 동률이면 거리), 원만이면 거리 최소. hp ≤ 0 인 유닛은 후보에서 뺀다.
4. **`makeUnit(id, interval)`**: 계약서 표는 `makeUnit(id)` 이지만 위상 계산에 interval 이 필요해 지시대로 2번째 인자로 받는다(기본 0.5).
5. **`compressUnits` 기준**: 계약서는 "유닛 dx 를 압축" 이라고만 하지만, 현재 dx 를 기준으로 하면 한 번 압축된 대형이 벽을 지난 뒤 다시 펴지지 않는다(layoutUnits 는 병력 변화 때만 호출). 그래서 formation 오프셋을 기준으로 매번 계산한다. combat 이 매 STEP 호출해도 안전하다.
6. **활성 구간인데 wallSide 가 없는 경우**(예: 진입 STEP 을 건너뛴 시작 위치): 그 STEP 에 side 를 결정해 기록한다(방어적 처리, 계약서 미규정).
7. **여러 벽이 동시에 활성**이면 통로를 교집합으로 잡는다(1단계 스테이지에는 없음).
8. **캐시**: `formation` 은 기본 옵션일 때 n 별 배열을 캐시해 같은 배열 참조를 돌려준다. 호출자가 그 배열을 변형하면 안 된다(layoutUnits/compressUnits 는 값만 복사하므로 안전).

## 못 한 것·의심스러운 것

- 드래그 +500 뒤 −20 감소 테스트는 지시대로 combat 통합 몫으로 남겼다. 여기서는 tx 가 범위로 클램프됨만 검증.
- 아군 탄·적탄의 벽 소멸, 접촉 판정의 "앞줄 1명" 선택은 combat 에서 `hitUnit`/`frontmostUnit` 을 조합해야 한다(적 스윕 vs 유닛 원 겹침 → 겹친 유닛 중 dy 최소는 `hitUnit` 이 아니라 별도 필터가 필요할 수 있음: `hitUnit` 은 "가장 가까운 1명" 을 고르므로 앞줄 규칙과 다를 수 있다. combat 은 겹친 유닛 집합을 원하면 `frontmostUnit(units, u => 겹침(u))` 식으로 쓰면 된다).
- `formation` 의 전방 개방 검사는 `|dx| > -dy - 1`(반올림 오차 1px 허용) 로 잠갔다.

---

# 수정 라운드 1 (2026-09-10) — 검토 지적 3건 반영

## 고친 것

### 1. [major] V3-HIT 가 '가장 가까운 1명' 규칙을 후보 2명 이상에서 검사하지 않았다
- 기존 테스트의 주석 좌표(병사 18,-18)를 실측 `formation(2) = [{0,0},{24,-10}]` 로 고치고, 후보가 0~1명뿐임을 주석에 명시(제목도 "후보 0~1명"으로).
- 새 테스트 **`V3-HIT: 후보 2명 이상 — 스윕은 진행 방향에서 먼저 닿는 유닛, 원만이면 거리 최소 유닛(n=7 대형)`**:
  - 실측 `formation(7)`: id2 (24,−10)→(264,1010), id3 (24,10)→(264,990), id4 (10,24)→(250,976).
  - (a) 스윕 x=266, z 1600→900, r 5: id2·id3 둘 다 거리 2 로 후보(id4 는 16 > 14 로 제외) → 거리가 같아 **t(선분 파라미터)가 결정** → z 큰 id2. 반대 방향(900→1600)이면 id3.
  - (b) 원만 r 10: (266,993) → id2·id3 후보, 거리 최소 id3. (266,1007) → 같은 두 후보, 거리 최소 id2(배열 순서가 아니라 거리가 결정).
  - 수동 units 한 열(dy −30/0/30): 스윕은 앞줄 먼저, 원 중심이 히어로 쪽이면 히어로. hp 0 유닛은 후보 제외.

### 2. [major] compressUnits 의 lo/hi 의미 충돌 → **(A)안 확정**
- `compressUnits(units, dxLo, dxHi, opts)` 로 인자명 변경. JSDoc 에 "절대 좌표도, clampCenter 의 중심 허용 범위(lo/hi)도 아니다. `clampCenter().dxLo/dxHi` 를 그대로 넘긴다"를 명시. 동작(formation 기준 비례 압축)은 그대로.
- `clampCenter` JSDoc 에 반환 필드 세 뜻(lo/hi = 중심 범위 · edgeLo/edgeHi = 가장자리 · dxLo/dxHi = 상대 범위)을 경고와 함께 정리.
- 새 테스트 **`V3-WALL: compressUnits 는 상대 범위(dxLo/dxHi)를 받는다 — clampCenter 결과로 호출해도 대형이 뭉개지지 않음`**: n=60 진입에서 `c.hw = 68`, `c.hi − c.lo = 12`(= 2·wallMargin), `c.dxLo = 80 + 9 − run.x`, `c.dxHi = 228 − 9 − run.x`(계약서 문장의 "가장자리 − run.x" 에 유닛 반경 포함), 압축 뒤 전원 통로 안 + 대형 폭 ≥ 120(통로 안쪽 폭 130 을 거의 다 씀) + 좌·우 각각 50 이상 펼침. 벽 밖 n=5 는 formation 그대로.
- **combat 담당 통보(한 줄)**: `const c = clampCenter(run, run.walls); compressUnits(run.units, c.dxLo, c.dxHi);` — `c.lo/c.hi` 를 넣지 말 것.
- **계약서 r3 반영 요청(조율자)**: 계약서는 담당 파일이 아니라 수정하지 않았다. 3-5 문장을 `compressUnits(units, dxLo, dxHi)`: 유닛 dx 를 상대 범위 [dxLo, dxHi] = [통로 lo + unitR − run.x, 통로 hi − unitR − run.x] 로 비례 압축(clampCenter 가 dxLo/dxHi 를 돌려준다)" 로 바꿔 주시면 된다. 2장 export 표의 `compressUnits(units, lo, hi)` 도 같이.

### 3. [major] 접촉 규칙 '겹친 유닛 중 앞줄 1명' 을 구현할 export 부재
- 내부 `overlapHits()` 가 겹침 후보 `[{u, t, d2}]` 를 모으고, 그 위에
  - **`overlappingUnits(units, x, z, r, sweep?, origin?, opts?) → unit[]`** (신규 export, 겹치는 유닛 전부·입력 순서·hp ≤ 0 제외)
  - **`hitUnit(...)`** 은 같은 후보 중 가장 가까운 1명(t 최소 → d2 최소)을 고르도록 재구성. 시그니처·결과 불변.
- combat 은 접촉에 `frontmostUnit(overlappingUnits(run.units, e.x, e.z, e.r, { x: e.px ?? e.x, z: e.pz }, run))` 를, 적탄에는 `hitUnit(...)` 를 쓴다. 정예 접촉(원 겹침)은 sweep 없이 `overlappingUnits(units, boss.x, boss.z, boss.r, null, run)`.
- 새 테스트 **`V3-HIT: overlappingUnits 는 겹친 유닛 전부, frontmostUnit 과 조합하면 접촉 규칙(앞줄 1명)`**: 한 스윕이 앞줄 id2·뒷줄 id3 과 겹칠 때 길이 2, `frontmostUnit` = dy 최소 id2. 뒤에서 오는 스윕은 `hitUnit` 이 id3 을 고르지만 앞줄은 여전히 id2(가장 가까운 ≠ 앞줄 실증). 빈틈이면 `[]` 이고 `frontmostUnit([]) = null`. hp ≤ 0 제외.

## 테스트 결과(실제 실행 출력)
- `node --test tests/rush3-squad.test.mjs` → tests 13 / pass 13 / fail 0 (라운드 0 의 10건 + 신규 3건)
- 기존 `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `grep -nE "Math\.random|rng" rush3/squad.js` → 매치 없음
- `rush3/` 안에서 compressUnits/hitUnit 을 호출하는 다른 파일 없음(combat.js 미착수) → 시그니처 변경으로 깨지는 호출자 없음

## 남은 것·의심스러운 것
- 계약서 r3 수정(2장 export 표 `compressUnits(units, lo, hi)`·`hitUnit(units, x, z, r)` → `hitUnit(units, x, z, r, sweep?, origin?)`, `overlappingUnits` 추가)은 조율자 몫.
- `hitUnit` 의 스윕 '먼저 닿음' 은 유닛 원 진입 시점이 아니라 **선분 최근접점의 t** 로 판정한다. 같은 열에 두 유닛이 있으면 결과가 같지만, 비스듬한 스윕에서 큰 반경 원이 작은 t 의 유닛보다 먼저 스치는 극단 경우엔 다를 수 있다(1단계 적탄 r 5·유닛 r 9 에서는 실질 차이 없음). 필요하면 원-선분 진입 t 로 바꿀 수 있다.
