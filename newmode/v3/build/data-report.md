# v3 1단계 묶음 [데이터·정의] 구현 보고 (r1, 2026-09-10)

담당 파일: `rush3/balance.js`, `rush3/weapons.js`, `rush3/stages.js`, `tests/rush3-stages.test.mjs`
기존 `rush/*`·`rush.html`·`tests/rush-*.test.mjs` 는 건드리지 않았다. import 는 `rush/rng.js`(hashSeed·mulberry32, stages.js 만) 뿐.

## 만든 것

### rush3/balance.js — `BAL3`
- 깊은 동결(중첩 객체·배열까지 `Object.isFrozen`). 로직 없음.
- 키 구성: `STEP`(1/60) · `scroll`(190) · `view`(480×800, LINE_Y 640) · `road`(80~400, 중앙 240) · `enterZ`(760) · `cull`(탄 +140, 적 −200) · `squad`(unitR 9, unitHp 2, unitCap 150, followRate 9, moveMax 250, keySpeed 420, hwMax 60, corridorMargin 6, wallLead 60 + 기존 대형 그리기 상수) · `weapons`(rifle/auto/heavy 표 그대로, heavy 폭발 반경 28·dmg 2) · `gate`(h 24, flashT 0.12, 색) · `supply`(r 30, padOffset 60, padGap 40, padHalfW 70) · `wall`(228~252) · `enemies`(grunt/rusher/shooter/elite 표 그대로: 하강 150, 정지 오프셋 420, 왕복 60, 부채꼴 3발 ±18°, 소환 4s·2·±40/−40) · `fx` · `colors`.
- 기존 `rush/balance.js`·`rush/render.js` 의 색·연출 상수(shake 0.25/7, hurtFlash 0.35, 도로색 3단, 외곽선 #14233A 등)는 **값만** 옮겼다.

### rush3/weapons.js
- `WEAPONS` = `BAL3.weapons`(동결 객체), `weaponRank(id)`(모르는 id → 0), `makeBullet(weaponId, x, z, ownerId)` → `{ x, z, pz: z, vz, dmg, w, kind, gateHit: 1, ownerId, dead: false }`. 모르는 무기 id 는 rifle 로 폴백.

### rush3/stages.js
- `STAGE_IDS = [1,2,3]`, `stageMeta(id)`, `buildStage(id)`. 계약서 5장 표를 `DEFS` 데이터로 그대로 적음(S1 첫 진격 / S2 갈림길 / S3 군단, 길이 7600/8600/11000, 정예 hp 40/70/150, S3 만 소환).
- 반환 형태: `{ id, version: 1, title, startUnits, startWeapon, length, eliteZ, gateRows, supplies, walls, spawns, elite }`.
  - gateRows: `{ id, z, h: 24, cells: [{ x0, x1, value, maxValue, flashT: 0 }], passed: false, bypass }` — 3-2 필드 전부 초기값.
  - supplies: `{ id, z, x, r: 30, kind, durability, maxDurability, payload, opened: false, missed: false, locked: false, pads: [] }` — 3-3 필드 전부 초기값. gates.js/supply.js 의 make 함수 없이도 완전한 객체.
  - walls: `{ id, z0, z1, x0: 228, x1: 252 }`.
  - spawns: `{ z, kind, n, xs, zs }` (z 오름차순, 같은 z 는 표 순서 유지). 표에 좌표가 명시된 스폰(S1 grunt 4, rusher, shooter)은 그 값 그대로. 명시가 없는 것은 `hashSeed(id + ':' + 표z + ':' + i)` 시드의 mulberry32 로 차선 대역 균등 분산(열 수 = ceil(n/rows)) + x 지터(대역폭의 ±30%) + z 지터(0~12)를 빌드 시점에 확정. 벽 z 구간과 겹치면 통로 안으로 밀어낸다(`keepOutOfWalls`).
  - elite: `{ z, hp, summon }`.
- 호출마다 전부 새 객체(map 으로 조립, 상수 참조 없음). 테스트에서 값 오염 뒤 재빌드 deepEqual 확인.

### tests/rush3-stages.test.mjs — V3-STAGES 8건
- STAGE_IDS·stageMeta 표 일치, 미지 id throw
- bypass 아닌 행 [80,400) 완전 피복·반열림 경계 공유·겹침 없음, bypass 행은 1칸
- 스폰 xs 도로 안(반경 포함)·벽 안 금지, zs ≥ ev.z + 760, 명시 좌표 그대로
- 첫 물체 z ≥ 1100, 정예 z < length, 정예 hp/summon
- 보급 통 초기 필드 전부, S3 chain 1개(pads0 5·max 15)
- buildStage 두 번 deepEqual·참조 전부 다름·오염 뒤 재빌드 초기값
- 무기 rank 순서·간격/dmg 표·makeBullet 정확한 형태·gateHit 1
- BAL3 깊은 동결·핵심 수치 계약서 대조

## 계약서와 다르게 했거나 해석이 필요한 것 (조율자 확인 요청)

1. **스폰 이벤트 `z` 의 의미(가장 중요).** 표의 z(예: S2 shooter 4600, "도달 24.2s = 4600/190")는 물체가 **부대 줄에 도달하는 위치**다. 도로 고정 shooter 가 그 z 에 있으려면 절대 트랙 좌표여야 하므로 `zs` 를 **절대 트랙 z** 로 두고(shooter zs [4600, 4600]), 이벤트 `z` 는 **발동 지점 = 표 z − 760**(화면 진입 거리)로 잡았다. 즉 combat 은 `ev.z <= run.z` 에 `zs[i]` 위치에 그대로 스폰하면 된다(그 순간 `zs[i] - run.z ≥ 760` 이라 화면 밖 위에서 등장). `zs` 를 오프셋으로 보고 `run.z + 760 + zs[i]` 에 스폰하면 위치가 두 배로 밀리니 combat 담당과 반드시 맞출 것. 정예는 계약서대로 `elite.z = eliteZ`(표 z 그대로)이며 스폰 z 는 combat 이 `run.z + 760` 으로 잡는다 — 잡졸과 정예의 z 의미가 다른 점을 명시해 둔다.
2. **S2 두 번째 게이트(5400) maxValue** 는 표에 없어 같은 스테이지 첫 행과 같은 20 으로 두었다.
3. **정예 적탄 반경 r** 이 표에 없어 shooter 와 같은 5 로 두었다(`BAL3.enemies.elite.shot.r`).
4. **지터 폭**(x ±30% 대역, z 0~12)은 계약서에 수치가 없어 자체 결정. 표에 좌표가 명시된 스폰에는 지터를 넣지 않았다(표 값 그대로가 검증에 유리).
5. "grunt 6 (2열)"·"grunt 8"·"grunt 10 (2열)"·"grunt 12" 는 2열(S2 3600 grunt 5 만 1열)로 배치했다. 열 간격 40.
6. `spawns[].hp` 는 정의에 hp 오버라이드가 있을 때만 붙는다(현재 3개 스테이지 전부 없음 → 필드 부재).

## 하지 못한 것 / 의심스러운 것
- V3-PURE(소스 정규식 1건)는 이 묶음 담당이 아니라 만들지 않았다. stages.js 는 계약서 허용대로 `rush/rng.js` 를 import 하므로 그 테스트가 stages.js 를 대상에 넣는다면 "rng import 금지" 규칙에서 stages.js 는 예외 처리해야 한다(계약서 공통 규칙 문구와 8장 V3-PURE 목록이 서로 다름 — 8장 목록에는 stages 가 들어 있음).
- 병행 작업자가 만든 `rush3/gates.js`·`supply.js`·`squad.js` 는 `balance.js` 를 import 하지 않고 자체 기본값을 쓴다. 수치를 바꿀 때 두 곳이 어긋날 수 있다(현재 값은 계약서와 일치).

## 테스트 실행 결과(실측)
- `node --test tests/rush3-*.test.mjs` → tests 44 / pass 44 / fail 0 (이 중 V3-STAGES 8건. 나머지는 병행 묶음의 gates·save·squad·sprites·audio 테스트)
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0 (기존 테스트 무손상)

---

# 수정 라운드 1 (r1→r2, 2026-09-10)

## 지적 1 [major] 스폰 이벤트 z 의미·시드 공식 불일치 → 수정 완료

**선택: 검토자 수정안 (A).** 계약서는 내 담당 파일이 아니라 고칠 수 없으므로, 계약서 문구를 그대로 두고 데이터가 문구에 맞게 바꾸는 쪽(A)을 택했다. A 는 계약서 0장 시드 공식·3-7 정예 `스폰 z = run.z + 760`·`발동 = ev.z <= run.z`·5장 S1 `zs +0/+40/…` 네 문구와 모두 맞아떨어지고, 잡졸과 정예의 z 의미가 같아진다.

- `rush3/stages.js` `makeSpawn`
  - `ev.z = 표 z` (이전: 표 z − 760). combat 은 `ev.z <= run.z` 에 발동.
  - `zs[i] = ev.z + 760 + 행 오프셋(명시 dz 또는 2열 40) + z 지터` — **절대 트랙 z**. combat 은 `zs[i]` 에 그대로 놓는다(`run.z` 를 더하지 않는다). 발동 순간 `zs[i] - run.z >= 760` 이라 화면 밖 위에서 등장한다.
  - 시드 `hashSeed(id + ':' + ev.z + ':' + i)` — 저장되는 ev.z 와 같은 값(계약서 0장 문구 그대로).
  - 벽 회피(`keepOutOfWalls`)는 절대 zs 로 판정.
- 실측 결과(빌드 출력): S1 grunt4 `{z:3800, zs:[4560,4600,4640,4680]}`, S2 shooter `{z:4600, zs:[5360,5360]}`, S3 shooter(벽 구간) `{z:6300, zs:[7060,7060]}`, 정예 `{z:7200|8200|10600}` — 전부 "표 z = 발동 지점, 실제 위치 = +760" 한 가지 규칙.
- `tests/rush3-stages.test.mjs` 3번째 테스트 갱신: 세 스테이지 `spawns.map(z)` 가 표 z 와 정확히 일치, `zs[i] ∈ [ev.z+760, ev.z+960)`, S1/S2 명시 좌표는 `zs` 를 `[4560,4600,4640,4680]`·`[5360,5360]` 으로 고정, 지터 좌표 빌드 간 동일.

### 조율자가 알아 둘 것(계약서 문구 보완 권고 — 내가 고치지 않음)
- 5장 표의 "도달(z/190)" 열은 정지물(게이트·통·벽)에는 그대로 맞지만, 적 스폰 행은 이제 **발동 시각**이다(실제로 부대 줄에 닿는 건 그보다 760px, 즉 4.0초 뒤 + 접근 속도만큼 빠르게). 정예도 애초에 `run.z + 760` 에 뜨므로 같은 의미다. 3-7 에 `ev.z = 표 z(발동), zs 절대(= ev.z + 760 + 오프셋 + 지터)` 한 줄을 넣어 두면 combat 담당 오해가 사라진다.
- S3 shooter(6300)는 벽 구간 6000~7200 안에 실제로 놓인다(zs 7060, xs 120/190 = 좌 통로). 계약서 "좌 shooter 2" 의도와 일치.

## 테스트 실행 결과(실측, r2)
- `node --test tests/rush3-*.test.mjs` → tests 65 / pass 65 / fail 0 (V3-STAGES 8건 포함, 나머지는 병행 묶음)
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
