# Codex 검증 요청 — 전면개편 Gate 0 · Gate 1

의뢰: Claude(총비서) → Codex · 2026-07-18
지시서: `docs/2026-07-18-claude-전면개편-통합-다음작업지시서.md` (§15 검증 체크리스트 기준)
결과서: `docs/2026-07-18-claude-전면개편-Gate0-Gate1-구현결과.md`

---

## 0. 검증 대상

- **브랜치**: `claude/neon-fleet-overhaul-phase-c-core-loop` (origin push 완료)
- **커밋**:
  - Gate 0 `1f8f238` `feat: integrate sector enemy and boss remodel assets`
  - Gate 1 `79707c3` `feat: add eight minute multi-weapon core loop`
- **base**: `975e586` (Codex FORGED LIGHT 아트 런타임)
- **master 상태**: 미병합·미배포 (master는 여전히 975e586). Pages 배포 없음.

```bash
git fetch origin
git checkout claude/neon-fleet-overhaul-phase-c-core-loop
git log --oneline 975e586..HEAD      # 커밋 2개 확인
```

---

## 1. 검증 환경

```bash
# 자동 테스트 (기대: 363 pass / 0 fail)
node --test tests/*.test.mjs

# 문법
for f in js/*.js; do node --check "$f"; done

# 프리뷰(브라우저 QA): launch.json name "neon-fleet" (python http.server 8321)
#  - 일반 캠페인:   http://localhost:8321/
#  - Gate 1 하네스: http://localhost:8321/?coreLoopTest=1
#  - 자산 검증 랩:  http://localhost:8321/dev/remodel-v2-lab.html
```

헤드리스 훅:
- `window.__NF` = `{ state, run, startPlay(), step(frames, dt) }` (step = N프레임 update + 1 draw)
- `window.__nfCoreLoop.run(buildId, maxSeconds)` = 하네스를 결과까지 재생하고 측정 스냅샷 반환
  - buildId: `'railStorm'` | `'microMissile'` | `'seekerBeam'` | `'tankStress'`
  - **반환 필드명 주의**: `bossTtkSec`(TTK), `durationSec`, `resonanceShare`, `damageByWeapon`, `damageByResonance`, `hullDamageTaken`, `secondWeaponSec`, `firstResonanceSec`, `framePickSec`, `hullTierTimes`, `behaviorUpgradeTimes`, `gameOverReason`
- `window.__nfRunMetrics` = 마지막 완료 런의 스냅샷

---

## 2. Gate 0 체크리스트 (§15)

| 항목 | 확인 방법 | 참고 파일 |
|---|---|---|
| 배경이 위→아래로 이동 | `?coreLoopTest=1` 또는 캠페인 플레이 → 배경 스크롤 방향. 순수함수 테스트 `tests/zone-backdrop.test.mjs` (R1 부호 동일) | `js/zone-backdrop.js` `backdropTileY`/`backdropLayerY` |
| 섹터 1~6이 서로 다른 6배경 | `dev/remodel-v2-lab.html` ① 구획 6장 상이. 테스트 `tests/creative-direction.test.mjs`(1:1)·`zone-backdrop.test.mjs` | `js/creative-direction.js` `zoneIndexForSector` |
| 적 12·보스 6이 신규 자산 | `dev/remodel-v2-lab.html` ②③. 테스트 `tests/remodel-assets.test.mjs`. 네트워크 `assets/remodel-v2/**` 200 | `js/sprites.js` REMODEL_V2 override |
| B22 단계 전환 시 몸체 안 쪼개짐 | `dev/remodel-v2-lab.html` ④(P1~파괴). 테스트 `tests/boss-single-base.test.mjs` | `js/bosses.js` NeonArbiter.draw |
| B7 구형 부품 미겹침 | `dev/remodel-v2-lab.html` ⑤(P1~4). 같은 테스트 | `js/bosses.js` HiveQueen.draw |

캡처(참고): `docs/qa/gate0/{sector-backgrounds,b22-b7-phases,remodel-v2-lab}.png`

---

## 3. Gate 1 체크리스트 (§15)

> Gate 1 기능은 **`?coreLoopTest=1` 하네스에서만 활성**입니다(공개 캠페인은 구 모델 유지 — §5.2 지시).

| 항목 | 확인 방법 (기대값) |
|---|---|
| 두 무기 독립 동시 발사 | 하네스 75초 후 화면에 두 종류 발사체 + HUD "주무기/보조". `snapshot.damageByWeapon`에 두 무기 모두 >0. 소스: `js/entities.js` `_spawnWeaponShots`(accKey `fireAcc`/`_wingAcc`). 테스트 `tests/weapon-loadout.test.mjs`·`gate1-wiring.test.mjs` |
| 세 쌍이 각기 다른 공명 | `resonanceForPair` 매칭. 세 빌드 `snapshot.damageByResonance`에 각각 railStorm/microMissile/seekerBeam. 테스트 `tests/resonances.test.mjs` |
| 공명이 피해배수만이 아님 | railStorm=관통 레일(pierce 8)·micro=미사일 6발·seeker=표식 추적. 발동조건·모양·표적 변화. `js/resonances.js`, `js/main.js` `spawnResonance` |
| 30~50초마다 행동 변화 | `snapshot.behaviorUpgradeTimes` = [30,70,110,…390] (중앙값 40, 75초 이상 공백 0). 테스트 `tests/run-director.test.mjs` |
| H1~H2 승급이 외형+기능 | `hullTierTimes`=[135], 승급 시 내구도 최대치↑(`survivability.onTierUp`) + 티어 상승(외형). |
| 기함 내구도가 드론과 독립 감소 | 하네스 `hullDamageTaken`>0인데 드론 수는 피격으로 안 줄음. `js/entities.js` `takeShot`→`resolveHit`. 테스트 `tests/survivability.test.mjs` |
| 순양함 HP 장면 전환 뒤 유지 | `js/main.js` buildEncounter: `if (!r.squad.surv) cruiserHp=[]` (내구도 모드는 유지). 테스트 `gate1-wiring.test.mjs` |
| **무적 빌드 방지** | `__nfCoreLoop.run('tankStress')` → `gameOverReason:'hull'` (타이탄+순양함12+드론400도 내구도 0 사망) |
| B22 섹터1~4보다 강함·TTK 45~60 | `run('microMissile').bossTtkSec≈59`, `run('seekerBeam').bossTtkSec≈54`. ⚠️`railStorm`은 57~72(§6 보완점) |
| B7 단일·부위 선택 | Gate 0에서 단일 개체 확정(`boss-single-base`). 하네스 TTK 측정은 B22만(§15 보완점 4 — B7 결전은 Gate 2) |
| 8분 뒤 다음 출격 이유 | 결과 화면에 "다음 설계도 실루엣"+"같은/새 조합" 버튼. `js/ui.js` `showCoreLoopResult` |

### 3.1 4시드 시뮬 재생 (권장)
```js
for (const b of ['railStorm','microMissile','seekerBeam','tankStress'])
  console.log(b, window.__nfCoreLoop.run(b, 640));
```
기대(재생 편차 ±수%):

| 빌드 | 2nd무기 | 공명 | B22 TTK | 공명기여 | 결과 |
|---|---|---|---|---|---|
| railStorm | 75 | 270 | 57~72 | 4.7% | clear |
| microMissile | 75 | 270 | ~59 | 10.9% | clear |
| seekerBeam | 75 | 270 | ~54 | 10.8% | clear |
| tankStress | 75 | — | — | — | **hull 사망** |

---

## 4. 회귀·품질 체크리스트 (§15)

| 항목 | 확인 |
|---|---|
| 기존 포함 전체 테스트 통과 | `node --test tests/*.test.mjs` → **363 pass / 0 fail** (Gate 0 후 302 → +61) |
| 새 테스트가 R1~R10 직접 검증 | 신규 8파일(run-metrics·weapon-loadout·resonances·survivability·run-director·command-frames·save-migration·gate1-wiring) + Gate 0 4파일 |
| 1280×720·390×844 플레이 가능 | 캡처 `docs/qa/gate1/coreloop-hud.png`(데스크톱)·`coreloop-hud-mobile.png`(모바일). 가로 오버플로 0 |
| 콘솔 error 0 · 자산 404 0 | 캠페인·하네스 양쪽 확인 |
| 기존 저장 보존 | 세이브 v2 마이그레이션 멱등. 테스트 `tests/save-migration.test.mjs` |
| master 미병합·미배포 | master=975e586 유지, origin에 브랜치만 존재 |

---

## 5. Claude가 표시한 보완점 — 비판적으로 봐 주세요 (§15)

1. **레일 스톰 공명 기여도 4.7% (통과선 8~30% 하회)**
   - 원인 판단: 측정 하네스가 헤드리스 자동회피 생존을 위해 적을 **희소하게** 스폰 → 관통-8 레일이 여러 표적을 못 맞힘. 밀집 실플레이에선 오를 것으로 봄.
   - **Codex 판정 요청**: (a) 이 진단이 맞는지, (b) `BAL.gate1.resonance.railStorm`(dmgFrac/threshold/cooldown) 재조정 또는 하네스 밀도 상향 중 무엇이 옳은지.
2. **측정 하네스 내구도 여유 `measureHullMax=1400`** — 헤드리스 자동회피가 사람만큼 못 피해 8분 타임라인·TTK를 끝까지 측정하려는 보정. **실제 플레이 값은 `hullMax=100`.** 내구도 감소(hullDamageTaken 120~240)는 실측.
   - **판정 요청**: 이 측정 방식이 "무적 방지" 증명(tankStress hull 사망)과 모순되지 않는지, 실플레이 100 내구도 곡선은 별도 플레이테스트가 필요한지.
3. **공개 캠페인은 아직 구 모델(드론=체력)** — 내구도 모델의 캠페인 정식 통합은 Gate 2 범위(§5.2 "Gate 1 통과 전 기존 캠페인 제거 금지" 준수).
4. **B7 하네스 TTK 미측정** — 이번은 B22만. B7 60~90 목표는 Gate 2 캠페인 결전에서 측정.
5. **지휘 프레임 자동 스킬** — 데이터 구조 + 최소 1회 발동만 검증(§5.7 Gate 1 범위). 밸런스·연출은 Gate 2~4.

---

## 6. 파일 지도 (변경·신규)

- **순수 로직(테스트 있음)**: `js/{run-metrics,weapon-loadout,resonances,survivability,run-director,command-frames,core-loop}.js`
- **배선**: `js/entities.js`(`_spawnWeaponShots`/`installGate1`/`takeShot`) · `js/main.js`(하네스 `startCoreLoop`/`coreLoopUpdate`) · `js/render.js`(`drawCoreLoopHud`) · `js/ui.js`(`showCoreLoopResult`)
- **데이터**: `js/balance.js` `BAL.gate1`
- **세이브**: `js/save.js` (`SAVE_VERSION=2`)
- **Gate 0**: `js/{zone-backdrop,creative-direction,sprites,bosses}.js`, `assets/remodel-v2/`, `dev/remodel-v2-lab.html`

---

## 7. 검증 후

- Gate 0·Gate 1 승인 시 → **Gate 2(25분 6지역 캠페인 + 내구도 캠페인 통합)** 착수.
- 수정 요청 시 → 같은 브랜치에서 반영 후 재검증(master 병합·배포는 최종 승인 후).
