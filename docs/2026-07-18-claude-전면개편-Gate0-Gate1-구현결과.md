# NEON FLEET 전면 개편 — Gate 0 · Gate 1 구현 결과

작성: Claude (총비서) · 2026-07-18
작업 브랜치: `claude/neon-fleet-overhaul-phase-c-core-loop`
지시서: `docs/2026-07-18-claude-전면개편-통합-다음작업지시서.md`

> 이번 구현 범위는 **Gate 0(아트 통합·즉시 수정)** 과 **Gate 1(8분 핵심 재미 수직 슬라이스)** 이다.
> Gate 2~4는 다음 단계의 필수 계약으로 보존한다(삭제·축소하지 않음).
> **master 병합·배포는 하지 않았다.** 작업 브랜치만 push하고 Codex 검증을 요청한다.

---

## 1. 실제 수정·신규 파일과 역할

### Gate 0 (커밋 `1f8f238`)
| 파일 | 역할 |
|---|---|
| `js/zone-backdrop.js` | R1 배경 아래 방향 스크롤(순수 함수 `backdropTileY`/`backdropLayerY`) + R2 섹터 인덱스 |
| `js/creative-direction.js` | R2 섹터 1:1 구역 매핑(`zoneIndexForSector`) |
| `js/sprites.js` | R3 remodel-v2 적12·보스6 경로 override + `RASTER_ART` export, R4 `preloadBossArt` 죽은 레이어 제거 |
| `js/bosses.js` | R4 B22/B7 단일 베이스 렌더(구형 부품 레이어 합성 제거, B7_ESCAPE만 4단계 유지) |
| `assets/remodel-v2/` | Codex 신규 자산 24종(배경6·적12·보스6) |
| `dev/remodel-v2-lab.html` | 자산 검증 개발 랩 |
| `tests/{zone-backdrop,creative-direction,remodel-assets,boss-single-base}.test.mjs` | R1~R4 자동 검증 |

### Gate 1 (이번 커밋)
| 파일 | 역할 |
|---|---|
| `js/run-metrics.js` | 런 로그 계약(§6.1) — 사건 시각·무기/공명 피해·TTK·내구도 수집. `window.__nfRunMetrics` |
| `js/weapon-loadout.js` | R5 무기 2슬롯(main/wing) 순수 로직 + 구 단일 무기 호환 어댑터 |
| `js/resonances.js` | R6 공명 3종(쌍 매칭·발동·재귀 잠금·표식) |
| `js/survivability.js` | R8 기함 내구도·순양함 HP·보호막 피해 순서 해석기 |
| `js/run-director.js` | R7 8분 타임라인 사건 스케줄러(일시정지 인식 클록) |
| `js/command-frames.js` | R7 지휘 프레임 3종(교리 흡수 + 자동 스킬) |
| `js/core-loop.js` | 하네스 순수 오케스트레이션(빌드 정의·사건→행동 매핑) |
| `js/entities.js` | Squad: `_spawnWeaponShots`(슬롯 발사) + `installGate1`/`takeShot`(내구도 라우팅) |
| `js/main.js` | `?coreLoopTest=1` 하네스: 디렉터·공명·프레임·측정 배선, 8분 결과 |
| `js/render.js` | `drawCoreLoopHud`(내구도·두 무기·공명·프레임·타이머) |
| `js/ui.js` | `showCoreLoopResult`(8분 결과 화면 §5.9) |
| `js/save.js` | 세이브 v2 마이그레이션(§10) |
| `js/balance.js` | `BAL.gate1` 전 튜닝값 |
| `tests/{run-metrics,weapon-loadout,resonances,survivability,run-director,command-frames,save-migration,gate1-wiring}.test.mjs` | R5~R10·§6.4 검증 |

---

## 2. Gate 0 R1~R4 구현과 캡처

- **R1 배경 방향**: 타일·입자 레이어 이동 부호를 아래로 통일(미러 반전 제거). 순수 함수 테스트로 고정.
- **R2 섹터 1:1**: 구 `(sector-1)/2` 두 섹터 묶음 폐기 → 섹터 1~6 각각 다른 배경, 7+ 최종 구역 고정.
- **R3 적12·보스6**: remodel-v2 WebP로 교체. B12~B15(엔드리스)·무기/VFX는 범위 밖 불변.
- **R4 B22/B7 단일 베이스**: 모든 페이즈에서 하나의 연결 실루엣. 프리로드도 단일 베이스+파괴 VFX만.

캡처: `docs/qa/gate0/sector-backgrounds.png`, `docs/qa/gate0/b22-b7-phases.png`, `docs/qa/gate0/remodel-v2-lab.png`
검증: 자산 24종 네트워크 200(404 0), 콘솔 error 0, 배경 6종 시각 구분 확인.

---

## 3. Gate 1 R5~R10 구현

- **R5 다중 무기**: `Squad.weapon`/`weaponLv`(main) + `Squad.wing{weaponId,level}`(보조). `_spawnWeaponShots(weaponId, level, …)`가 슬롯마다 **독립 발사 누적기(`fireAcc`/`_wingAcc`)·레벨·진화·하드포인트**로 발사. 발사체에 `sourceWeaponId` 태그. 단일 값 토글이 아니라 두 파이프라인이 동시에 돈다.
- **R6 공명 3종**: 레일 스톰(발칸+레이저)·마이크로 미사일 포화(발칸+유도)·시커 빔(레이저+유도). 발동 조건·화면 모양·표적이 바뀐다(피해 배수만 아님). `fromResonance` 태그로 공명이 공명을 재귀 발동하지 않음. 공명 피해는 원래 무기와 **별도 집계**.
- **R7 런 디렉터·프레임**: 8분 타임라인 사건을 순수 스케줄러가 발화(일시정지·선택 중 시간 정지). 프레임 3종(어썰트/캐리어/페이즈)이 교리를 흡수하고 자동 스킬(전방 집중/호위 동기화/위상 돌파)을 최소 1회 발동.
- **R8 기함 내구도**: `hullIntegrity`가 실제 생존 체력. 피해 순서 = 보호막 → 순양함 HP → 기함 내구도. 드론은 공격 밀도이며 내구도를 대신 지불하지 않는다. 내구도 0이면 드론·순양함이 남아도 패배. 순양함 HP는 노드 전환 뒤 유지(만피 초기화 제거). 긴급 재건 출격당 1회.
- **R9 B22 전투**: 섹터 5 네온 아비터를 검증 보스로 등장, STAGGER/BREAK 상호작용 유지, TTK를 화력 비례로 보정(HP·탄수만 증가 아님).
- **R10 결과·측정**: 8분 결과 화면 + `window.__nfRunMetrics` 계약.

---

## 4. 무기 슬롯 데이터 구조와 구 구조 호환

```js
// 신규(런타임)
squad.weapon = 'vulcan'; squad.weaponLv = 1;      // main 슬롯(구 필드 그대로 = 호환)
squad.wing   = { weaponId: 'laser', level: 3 };    // 보조 슬롯
// 진화 상태는 무기 키 맵 공유: weaponEvolutions[weaponId] 등 → 슬롯이 달라도 무기별로 독립
```
- 구 캠페인·세이브·테스트가 쓰던 `weapon`/`weaponLv`는 **main 슬롯 그대로** 재사용 → 회귀 없음.
- 순수 모듈 `weapon-loadout.js`가 슬롯 규칙(빈 슬롯 장착 우선, 가득 차면 교체 확인)을 담당하고, `loadoutFromLegacy`/`legacyView`로 구조를 오간다.
- 보조 슬롯·내구도·공명·프레임은 **`?coreLoopTest=1` 하네스에서만 활성**. 공개 캠페인은 손대지 않았다(§5.2, §12.9).

---

## 5. 세 공명의 발동 조건·화면 변화·피해 집계

| 공명 | 발동 | 화면·표적 변화 | 집계 |
|---|---|---|---|
| 레일 스톰 | 발칸 명중 누적 임계 → 레이저 하드포인트 | 굵은 관통 레일(pierce 8)·충격 링 | `damageByResonance.railStorm` |
| 마이크로 미사일 포화 | 발칸 명중 누적 임계 | 소형 미사일 6발 분산 추적 | `damageByResonance.microMissile` |
| 시커 빔 | 레이저가 표적 지정(표식) | 미사일이 표식 우선 추적, 표적 파괴 시 표식 이동 | 표식 대상 명중분을 `seekerBeam`로 귀속 |

- 재귀 방지: 공명 발사체는 `fromResonance=true` → 충전 계산에서 제외 + `cooldown`·`lockT`.
- 첫 공명은 디렉터 `firstResonance`(4:30) 시점에 확정 완성(§5.4).

---

## 6. 기함 내구도·드론·순양함 HP·보호막 피해 흐름

`survivability.resolveHit(surv, { amount, onCruiserIndex })`:
1. 보호막 있으면 소비(무효) → `absorbedBy:'shield'`
2. 순양함 히트박스면 그 순양함 HP 감소 → `absorbedBy:'cruiser'`
3. 아니면 기함 내구도 감소 → `absorbedBy:'hull'`, 0이면 `dead`
- 드론(count)은 어떤 경우에도 내구도를 대신 지불하지 않는다. 드론 회수로 내구도를 올리는 공개 경로 없음(수리·승급만).
- 내구도 피격 후 짧은 무적(0.6s)으로 밀집 피격 순삭 방지.

---

## 7. 8분 타임라인 실제 측정값 (`railStorm` 빌드, 헤드리스 자동회피 재생)

| 사건 | 목표 | 실측 |
|---|---|---|
| 첫 행동 변화 | 25~45s | **30s** (이후 40s 간격 ×10, 75s 이상 공백 0) |
| 두 번째 무기 | 60~90s | **75s** |
| H1 승급 | 8분 내 | **135s** |
| 첫 공명 | 255~285s | **270s** |
| 지휘 프레임 | — | **330s** |
| 검증 보스 | — | **430s** 등장 |
| 결과 | 480s | 보스 처치 후 결과(§5.9) |

---

## 8. 네 고정 시드 시뮬레이션 결과 (`window.__nfCoreLoop.run`)

| 빌드 | 8분 사건(w2/res/frame/hull/행동) | 공명 기여도 | B22 TTK | 결과 |
|---|---|---:|---:|---|
| 발칸+레이저 / 레일 스톰 | 75 / 270 / 330 / 135 / 10회 | 4.7% | ~57~72s | clear |
| 발칸+유도 / 마이크로 미사일 포화 | 75 / 270 / 330 / 135 / 10회 | **10.9%** | **~59s** | clear |
| 레이저+유도 / 시커 빔 | 75 / 270 / 330 / 135 / 10회 | **10.8%** | **~54s** | clear |
| 타이탄+순양함12+드론400 생존 스트레스 | 75 / 270 / — / 135 / — | — | — | **내구도 0 사망** |

- **무적 방지(§6.2) 검증**: 스트레스 빌드가 타이탄·순양함 만석·드론 대량이어도 기함 내구도가 실제로 0에 도달해 패배 → 드론/순양함 회수로 무적이 되지 않음이 수치로 증명됨.
- **공명 기여도**: 마이크로·시커는 통과창(8~30%) 안. 레일 스톰은 4.7%로 하회 — 원인은 하네스가 헤드리스 생존을 위해 적을 **희소하게** 스폰해 관통-8 레일이 여러 표적을 못 맞히기 때문(밀집 실플레이에선 상승). §15 보완점 참조.
- **측정 하네스 주의**: 비-스트레스 빌드는 헤드리스 자동회피가 인간만큼 못 피하므로 타임라인·TTK를 끝까지 측정하려고 내구도 여유(`measureHullMax`)를 크게 뒀다. **실제 플레이 내구도는 `hullMax=100`.** 내구도 감소(hullDamageTaken 120~240)는 여전히 실측이다.

---

## 9. B22 TTK와 패턴

- 하네스 검증 보스 = 섹터 5 네온 아비터(B22), STAGGER/BREAK 상호작용 유지.
- TTK: 마이크로 59s·시커 54s(목표 45~60 통과), 레일 스톰 57~72s(하네스 화력 편차).
- 보스 HP는 함대 화력 비례(`bossTtk.hpPerPower`)로 보정 — 단순 HP 벽이 아니라 화력 성장에 맞춰 처치시간을 유지.
- 캡처: 코어루프 HUD `docs/qa/gate1/coreloop-hud.png`(보스 전 단계 두 무기·공명·내구도).

---

## 10. 자동 테스트 총수·통과·실패

- **363개 전체 통과 · 0 실패** (Gate 0 이후 302 → Gate 1에서 +61).
- 신규: run-metrics(9)·weapon-loadout(9)·resonances(10)·survivability(8)·run-director(6)·command-frames(6)·save-migration(6)·gate1-wiring(7).
- §6.4 필수 규칙(두 슬롯 독립·슬롯 추가 비교체·세 공명 매칭·공명 재귀 방지·무기/공명 피해 집계·내구도 감소·드론 미회복·순양함 HP 유지·긴급 재건 1회·내구도 0 패배·디렉터 순서·시간 정지·B22/B7 단일 베이스·세이브 마이그레이션)을 순수 유닛 + 소스 정적 검증으로 커버.

실행: `node --test tests/*.test.mjs`

---

## 11. 1280×720 · 390×844 브라우저 QA

- **1280×720(데스크톱)**: 코어루프 HUD가 내구도 바·두 무기 칩·공명 예고·8분 타이머를 표시, 두 무기가 실제로 동시 발사됨(`docs/qa/gate1/coreloop-hud.png`).
- **390×844(모바일)**: 동일 요소가 겹침·잘림 없이 표시, **가로 오버플로 0**, 페이즈 프레임 아이콘·시커 빔 공명 표시(`docs/qa/gate1/coreloop-hud-mobile.png`).
- 8분 결과 화면: 시작→최종 함체, 무기 2·공명, 무기별/공명별 피해 %, 받은/잔여 내구도, 순양함 격침·긴급 재건, B22 TTK, 다음 설계도 실루엣, 같은/새 조합 버튼 — 전 항목 렌더 확인.

---

## 12. 콘솔 error · 네트워크 404 · 가로 오버플로

- 콘솔 error **0** (캠페인·코어루프 양쪽).
- 필수 자산 404 **0**.
- 가로 오버플로 **0** (390×844 `documentElement.scrollWidth === clientWidth`).

---

## 13. 세이브 마이그레이션 검증

- `saveVersion` 2로 상향, 새 필드(`unlocks`·`blueprints`·`threatLevel`·`discoveredEnemies`·`bossMemories`·`runHistorySummary`) 안전 기본값 백필.
- 구 저장(코인·최고 섹터·클리어·엔드리스·사운드) 보존, 멱등(여러 번 로드해도 해금·설계도 중복 생성 없음).
- `tests/save-migration.test.mjs` 6개 통과.

---

## 14. 커밋 해시와 push 브랜치

- Gate 0: `1f8f238` `feat: integrate sector enemy and boss remodel assets`
- Gate 1: (이 커밋) `feat: add eight minute multi-weapon core loop`
- 브랜치: `claude/neon-fleet-overhaul-phase-c-core-loop` — **작업 브랜치만 push. master 미병합·미배포.**

---

## 15. 알려진 문제와 Gate 2 시작 전 보완점

1. **레일 스톰 공명 기여도(4.7%)가 하네스에서 하회.** 원인=희소 스폰. 실플레이(밀집)에선 관통-8이 상승하나, 계수(dmgFrac/threshold) 재조정 또는 하네스 밀도 상향으로 8%+ 재확인 필요.
2. **측정 하네스 내구도 여유(`measureHullMax`)** 는 헤드리스 자동회피 보정용. 실제 플레이(hullMax=100)에서 사람 플레이 기준 8분 생존 곡선은 별도 플레이테스트 필요.
3. **공개 캠페인은 아직 구 모델**(드론=체력). Gate 2에서 시간 기반 6지역으로 재구성하며 내구도 모델을 캠페인에 정식 통합.
4. B7 하이브 퀸의 하네스 TTK 측정은 이번엔 B22만 수행(§5.8 B7 60~90 목표는 Gate 2 캠페인 결전에서 측정).
5. 지휘 프레임 자동 스킬은 데이터 구조 + 최소 1회 발동만 검증(§5.7 Gate 1 범위). 밸런스·연출 강화는 Gate 2~4.

**Gate 2~4는 삭제·축소 없이 다음 단계 필수 계약으로 보존.** Codex 검증 후 같은 기준으로 이어서 수행한다.
