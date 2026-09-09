# 스타포지 러시 v3 1단계 — 묶음 [자산·저장·HTML] 구현 보고 (r1, 2026-09-09)

기준: `newmode/v3/DESIGN_v3_stage1.md` 2장(export 계약)·7장(저장)·8장(V3-SAVE)·9장(결선표).
기존 `rush/*`·`rush.html`·`tests/rush-*.test.mjs` 는 수정하지 않음(`git status`: 신규 파일만 `??`).

## 만든 것

| 파일 | 내용 |
|---|---|
| `rush3/sprites.js` | `rush/sprites.js` 복제. `SPRITE_KEYS3`(11키: m1·soldier·supply·gate·bg1~3·e_grunt·e_rusher·e_shooter·elite), `loadSprites3(base='assets/rush/') → Promise<{get(key), ready}>`. 없는 그림은 `null` 폴백. `Image` 가 없는 환경(Node)은 즉시 빈 결과 반환. |
| `rush3/audio.js` | `rush/audio.js` 복제. `createAudio3({ dir='assets/sound/' })` → `unlock, sfx(name,{vol,throttle}), bgmPlay(name), bgmPause, bgmResume, setVolume, getVolume, setMuted, isMuted, duck` (+ `isUnlocked`, `bgmName` 보조). SFX 맵 15종(fire_rifle/fire_auto/fire_heavy = 기존 vulcan/laser/missile, crateHit, crateBreak, gateTick, gateFlip, joinMany, weaponSwap, hurt, kill, elite, win, lose, click). 이름별 스로틀 기본 0.045초, 이름별 Audio 풀 4개 순환, 전체 동시 재생 상한 12. `Audio` 없으면 전부 no-op. `SFX_NAMES3` 도 export(테스트용). |
| `rush3/save.js` | 계약서 7장. 키 `starforgeRush.v3`, 손상·버전 불일치·stages 비객체 → 원문 `starforgeRush.v3.bak` 보존 후 기본값. 스테이지 필드 `Number.isFinite` 강제, `cleared` 는 boolean 강제. `getStage/updateStage/patch` 깊은 병합. getItem·setItem·stringify 예외 전부 try, `ok` getter. v1 키는 읽지도 쓰지도 않음. |
| `rush3.html` | `rush.html` 복제. `<canvas id="game3">`, `<script type="module" src="rush3/main.js">`, 제목 '스타포지 러시 v3'. |
| `tests/rush3-save.test.mjs` | V3-SAVE 9건(계약서 6케이스 + getItem throw + updateStage 깊은 병합 + storage 미주입) + V3-SPRITES 1건 + V3-AUDIO 1건. |

## 테스트 실행 결과(실제 출력)

- `node --test tests/rush3-*.test.mjs` → tests 11 / pass 11 / fail 0
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0 (기존 미파손)
- `node --test tests/test-quality-ratchet.test.mjs` → pass 2 / fail 0 (새 테스트에 소스 정규식 대조 없음)

## 계약서와 다르게 한 것

1. **e_shooter 스프라이트 파일명**: 계약서·지시는 `E4_signaler` 인데 `assets/rush/` 에는 `E4_needleeye.png` 와 `E6_signaler.png` 만 있다. "signaler" 이름을 우선해 `E6_signaler` 로 매핑했다(코드 주석에 명시). 조율자가 `E4_needleeye` 를 원하면 한 줄 수정.
2. `SPRITE_KEYS3` 는 11키(계약서 9장 목록 그대로). 기존 "30장 전부 로드" 는 구 게임 얘기이므로 v3에는 적용하지 않았다.
3. 음원 파일이 v3 이벤트와 1:1 로 없어서 유사음 재사용: crateHit=hit_1~3, crateBreak=pickup_1~2, gateTick=crystal_1~2, gateFlip=gate_good_1~2, joinMany=evolve_1, weaponSwap=buy_1, elite=boss_in_1, win=explode_l_1~2, lose=demote_1. 모든 참조 파일 실존을 스크립트로 확인함(누락 0).
4. `sfx()` 가 boolean(재생 여부)을 반환한다(계약서는 반환값 미정의). 스로틀·상한 판단을 테스트/디버그에서 볼 수 있게 한 것.
5. `save.patch()` 에서 `volume` 은 0~1 클램프, `lastStage` 는 문자열/유한수만 허용(그 외 null). 계약서에 없는 정규화이나 손상 방지 목적.

## 못 한 것 · 의심스러운 것

- `rush3.html` 은 `rush3/main.js` 가 아직 없어 브라우저에서 열면 모듈 404(빈 화면). 스크립트 태그만 넣는 지시대로 둠.
- 오디오의 동시 재생 카운트는 `ended` 이벤트·play() 실패로만 감소한다. 풀 순환으로 객체를 재사용할 때 이전 재생을 끝난 것으로 셈해 보정하지만, 브라우저에서 `ended` 가 안 오는 예외 상황(소스 오류)에서는 카운트가 상한 12에 걸려 음이 안 날 수 있다. 브라우저 실기 확인 필요(이 묶음은 Node 스모크만).
- `loadSprites3` 의 `Image` 부재 폴백은 Node 전용 편의이며 계약서에는 없다.

---

# 수정 라운드 1 (2026-09-10)

## 지적 1 [major] — V3-AUDIO 가 형식 검사뿐이라 풀 재사용·음량 상한이 실제 호출로 검증되지 않음

**처리:** `tests/rush3-save.test.mjs` 에 가짜 `Audio` 클래스(`FakeAudio`: paused/ended/volume/src setter/play()→Promise/addEventListener('ended')/end() 로 ended 이벤트 발화)와 가짜 시계(`performance.now` 를 제어 가능한 함수로 교체, `tick(ms)`)를 주입하는 헬퍼 `withFakeAudio(fn)` 을 만들고, V3-AUDIO 케이스 4개를 추가했다. 헬퍼는 `finally` 에서 `delete globalThis.Audio` 와 `performance.now` 원본 descriptor 복원을 항상 수행한다. `rush3/audio.js` 는 손대지 않았다(탐침 결과 로직은 정상이었고 테스트만 부재).

| 케이스 | 검증 내용(실제 호출) |
|---|---|
| 같은 이름 연속 2회 | unlock 전 false → 첫 호출 true → 즉시 재호출 false → +30ms false → +50ms 누적 true. 다른 이름은 독립. `{throttle:0}` 이면 연속 true |
| vol 5 클램프 | `gateTick` vol 1 의 element.volume(기본)과 vol 5 의 volume 이 같고 ≤ 1. `setVolume(0.5)` 후 volume = 기본×0.5(volMult 반영). vol -3 → 0 |
| 동시 상한 12 | 서로 다른 이름 13개 → true 12개, 13번째 false. 시간이 지나도 false. 풀 객체 전부 `end()`(ended 이벤트) 후 다시 true |
| 풀 4개 재사용 | `fire_rifle` 6회(100ms 간격) → 생성된 sfx Audio 객체 4개. 5번째 호출이 0번 객체를 재사용하며 src 가 `nf_sfx_vulcan_1` → `nf_sfx_vulcan_2` 로 바뀜, 6번째는 1번 객체가 `vulcan_3`. ended 없이 20회 더 재사용해도 객체 4개 유지·`kill` 재생 가능(카운터가 상한을 잘못 막지 않음) |

VOL 표는 export 하지 않으므로 "VOL[name]*volMult 와 일치" 는 vol 1 호출의 volume 을 기준값으로 삼아 vol 5 와 같은지, `setVolume(0.5)` 후 절반이 되는지로 검증했다(수치 하드코딩 없음).

## 테스트 실행 결과(실제 출력)

- `node --test tests/rush3-save.test.mjs` → tests 15 / pass 15 / fail 0 (V3-AUDIO 5건 포함)
- `node --test tests/rush3-*.test.mjs` → tests 65 / pass 65 / fail 0 (다른 묶음 파일 gates·squad·stages·supply 포함)
- `node --test tests/rush-core.test.mjs tests/rush-sim.test.mjs tests/rush-meta.test.mjs` → tests 32 / pass 32 / fail 0
- `node --test tests/test-quality-ratchet.test.mjs` → pass 2 / fail 0

## 남는 의심

- r1 에서 적은 "브라우저에서 `ended` 가 안 오는 예외 상황" 은 여전히 실기 미확인이다. 다만 이번 4번째 케이스가 ended 없이 풀만 순환해도 카운터가 상한을 막지 않음을 실제 호출로 보였으므로, 남는 위험은 서로 다른 이름 12종 이상이 ended 없이 동시에 걸리는 극단 상황뿐이다.
- 가짜 시계는 `performance.now` 를 덮어쓰는 방식이라 Node 가 `performance` 를 동결하는 버전이 나오면 헬퍼 수정이 필요하다(Node 24 에서는 정상).
