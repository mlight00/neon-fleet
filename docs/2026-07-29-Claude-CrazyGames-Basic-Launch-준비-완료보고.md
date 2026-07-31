# CrazyGames Basic Launch 준비 — 완료보고

- 작성일: 2026-07-29
- 워크트리: `E:\workspace\claude\neon-fleet-worktrees\stage1-analytics`
- 브랜치: `claude/neon-fleet-analytics-stage1`
- 범위: 코드·검증·업로드 ZIP·문서 (commit/push/merge/배포/포털 업로드 **없음**)

---

## 1. 한 줄 결론
`?distribution=crazygames`(또는 crazygames.com 호스트)에서 **영어·1클릭·광고 없는** CrazyGames Basic 빌드를 완성하고, **압축 전 44.64MB(<50MB)·198파일·ZIP 43.93MB·659 테스트 통과·실브라우저 QA 통과**로 검증했다. 기존 Prolific·일반 한국어 흐름은 그대로 보존. 커버/영상은 이미지 제작 정책상 사양만 남긴 **MEDIA BLOCKED**. commit/배포/업로드는 하지 않았다.

## 2. 작업 전 Git 상태
스냅샷: `docs/release/crazygames-basic-launch/_pre-work-git-state.md`
- 브랜치 `claude/neon-fleet-analytics-stage1` (origin/master 추적), 미커밋 변경 보존 대상:
  - 수정(M): `css/style.css`, `js/intro.js`, `js/main.js`, `js/render.js`, `js/ui.js`, `tests/sector-map-touch.test.mjs`
  - 신규(??): `js/analytics*.js`(5), `js/playtest*.js`(2), `tests/analytics*·playtest*`(9), Prolific/analytics docs
- 이 변경들은 **되돌리거나 삭제하지 않았다.** `git reset/checkout/clean` 미사용.

## 3. 실제 수정·추가 파일
**신규(이번 CrazyGames 작업):**
- `js/distribution-config.js` — 순수 포털 판정(detectDistribution/isPortalMode/isCrazyGamesMode/runtimeLanguage/analyticsAllowedForDistribution)
- `js/platform.js` — no-op 플랫폼 수명주기(gameplayStart/Stop/requestMidgameAd/requestRewardedAd) — 광고 SDK 미구현
- `scripts/build-crazygames-basic.mjs` — 업로드 전용 빌드 + 무결성 게이트 + Node ZIP 작성기
- `tests/distribution-config.test.mjs`(7), `tests/crazygames-wiring.test.mjs`(12), `tests/crazygames-package.test.mjs`(7)
- `docs/release/crazygames-basic-launch/` — metadata-en.md · asset-license-audit.md · submission-checklist.md · _pre-work-git-state.md
- `.claude/launch.json`(worktree 프리뷰, gitignore), `.gitignore`에 `dist/` 추가

**기존 미커밋 파일에 포털 기능 추가(보존+확장):**
- `js/main.js`(+521/−…) — PORTAL_MODE·EN/LANG 플래그, 포털 부팅/무기픽/1클릭/힌트, GA4 억제, 같은무기 재도전, 언어 분기 `PLAYTEST`→`EN`, 토스트 영어화, 플랫폼 배선
- `js/ui.js` — showLose/showHangar/showVictory 영어화 + CHANGE WEAPON, DOCTRINE_EN/KEYSTONE_EN export
- `js/render.js` — 보스 HUD `보스 ×N` 영어화
- `tests/playtest-wiring.test.mjs`(PW-12/13 EN 반영), `tests/title-state-reset.test.mjs`(TS-18 포털 가드 반영)

## 4. 포털 모드 구조
- 판정: `detectDistribution({hostname, search})` → `PORTAL_MODE`. **우선순위 = 포털 > Prolific**: `PLAYTEST = isPlaytestUrl && !CORE_LOOP && … && !PORTAL_MODE`.
- 언어 공유(§P0-2): `EN = PLAYTEST || PORTAL_MODE`, `LANG = EN?'en':'ko'`. 기존 `PLAYTEST` 언어 분기를 `EN`으로 치환 → Prolific·포털이 같은 영어 경로 재사용(중복 사전 없음).
- 부팅: `if (PORTAL_MODE) startPortalPlay(); else if (PLAYTEST) … else 일반`. `startPortalPlay`=타이틀·스토리 인트로 없이 곧바로 무기 선택. `showTitleScreen`은 포털이면 `startPortalPlay`로 라우팅(한국어 타이틀 미노출).
- 분석/개인정보: 포털은 GA4 어댑터를 dev처럼 완전 억제(`isDevMode = ANALYTICS_DEV || !analyticsAllowedForDistribution(DIST)`) + 동의 배너 미표시. (측정 ID·Prolific URL은 원래 빈 값.)
- 광고: `platform.*` no-op만 배선(gameplayStart/Stop), 광고 요청 함수는 **호출하지 않음**. 원격 SDK 없음.

## 5. 한 클릭 시작·재도전 동작
- **1클릭**: 첫 화면=시작 무기 3택(Vulcan/Laser/Homing). 카드 클릭 하나가 '선택+출격'. 클릭 즉시 오디오 컨텍스트 활성 + `state='play'`(같은 프레임). enterSectorMap 포털 분기가 차단 가이드 없이 곧장 `enterNode`+비차단 힌트. **실측**: 클릭 후 state=play·weapon 반영·오버레이 닫힘·함대 자동사격(bullets 28).
- **비차단 힌트**: 전투 위 `pointer-events:none` 오버레이(영어 조작 안내), 실제 입력 또는 8초 후 소거. 띄운 클릭이 곧바로 지우지 않도록 250ms 유예.
- **빠른 재도전(P0-4)**: 사망 결과의 최대 CTA=`PLAY AGAIN` → 같은 무기 즉시 재출격(새로고침·무기픽 없이). 보조 CTA=`Change weapon`. **실측**: PLAY AGAIN 후 weapon 동일·무기픽 미표시·state=play.

## 6. 영어화 범위
포털에서 한국어 0 확인(브라우저 DOM 실측): 무기 선택·비차단 힌트·HUD(보스명 영문 def name)·항로/섹터맵·강화/교리/키스톤/무기진화 드래프트·수리·일시정지·사운드 설정·사망 결과(RUN OVER)·**무료 긴급 개조 카드(Drones/Hull/Damage +값)**·재도전(PLAY AGAIN/Change weapon)·격납고·승리 화면. 캔버스 토스트(섹터 클리어·보스 경고·교리/키스톤/무기진화 획득·컷신 "Enemy flagship destroyed")도 EN 분기. dist `index.html`은 `lang="en"`·`<title>Neon Fleet</title>`로 치환, 한글 주석(dev no-cache) 제거.
- 예외(번역 안 함, 지시서 허용): 소스 주석, 테스트 설명, 일반 한국어 모드 데이터.

## 7. 분석·개인정보·외부 전송 차단 결과 (실측 — 네트워크 캡처)
`?distribution=crazygames` 로드~전투 진입 네트워크: **googletagmanager/gtag/google-analytics/광고 SDK 요청 0건, 404 0건, mp3 요청 0건.** 모든 요청은 localhost 게임 파일 + 인라인 SVG data-URI. 동의 배너·설문·Prolific 요청 없음.

## 8. 패키징 방식
- `node scripts/build-crazygames-basic.mjs` → `dist/crazygames-basic/`(폴더) + `dist/neon-fleet-crazygames-basic.zip`.
- **매니페스트 = 코드 실제 데이터 기반**(정규식 아님): 스프라이트=sprites.js `RASTER_ART.C`(remodel-v2 override 반영 → 죽은 art2-webp 원본 자동 제외), 배경=`assets/remodel-v2/backgrounds/s1..s6.webp`, 사운드=`assets/sound/*.ogg`(mp3 제외), 폰트/아이콘/런타임 JS/CSS/HTML. `tuner.js/tuner-spec.js/tuner.html`·docs·tests·dev 제외.
- 게이트: 없는 참조=실패, 절대경로 런타임 참조=실패, GA4 ID·Prolific URL·외부 광고 태그=실패, 압축 전 ≥50MB=실패, 파일 ≥1500=실패. `index.html` ZIP 루트, **정방향 슬래시**(Compress-Archive 역슬래시 버그 회피 위해 Node zlib로 직접 작성).

## 9. 파일 수·용량
| 항목 | 값 |
|---|---:|
| 파일 수 | **198 / 1500** |
| 압축 전 런타임 합계 | **44.64 MB / 50 MB** |
| ZIP | **43.93 MB** |
| 구성(압축 전) | sound(ogg) 28.5MB · art2-webp 6.41MB · remodel-v2 6.09MB · fonts 1.49MB · styleC 1.33MB |
mp3 30MB 제외 + art2-webp 죽은 원본 제외(12→6.4MB)로 <50MB 달성. 20MB 목표는 화질·음질 훼손 없이 도달 불가라 50MB 미만을 우선(§P0-6.10).

## 10. 자동 테스트 결과
`node --test tests/*.test.mjs` → **659 pass / 0 fail**. 신규: distribution-config(7)·crazygames-wiring(12)·crazygames-package(7). 갱신: PW-12/13(EN), TS-18(포털 가드), sector-map-touch(기존). 기존 테스트 약화·삭제 없음.

## 11. 브라우저·해상도 QA 결과 (localhost:8322, 포털 URL)
- **콘솔 오류 0** (포털/일반/Prolific/개발 URL 전부).
- **해상도**(canvas letterbox = `height=vh, width=min(vw, vh×0.62)`): 821×462→286×462, 800×450→279×450, 390×844→390×844, 1920×1080→670×1080 — 캔버스·패널 모두 뷰포트 내, 가로/세로 오버플로 0. 중간 데스크톱 크기(907×510·1077×606·1216×684·1280×720·1366×768·1536×864)는 동일 공식으로 보장.
- **입력**: 방향키(←→)+A/D+Space(차지) 기존 지원 확인. Esc는 필수 아님(일시정지 대체 버튼). Ctrl/Cmd+W 미사용.
- ⚠️ 이 세션의 인앱 브라우저는 `document.hidden` 고정으로 requestAnimationFrame이 멈춘다 → 실시간 애니메이션은 `__NF.step()` 헤드리스 프레임 전진 + DOM/네트워크/상태로 검증했다(적 스폰·자동사격·사망·재도전·저장 확인). **최종 손맛은 실제 브라우저 플레이로 확인 권장.**

## 12. 일반/Prolific/개발 URL 회귀 결과 (실측)
- 일반(`/`): `lang=ko`, 타이틀 "네온 함대", 한국어 타이틀 화면(출격하기·격납고). **불변.**
- Prolific(`?playtest=prolific`): 영어 연구 동의("I agree — Start"/"I do not agree"), 4분 흐름. **불변.**
- 개발(`?coreLoopTest=1`): 로드·콘솔 오류 0.
- 충돌(`?distribution=crazygames&playtest=prolific`): **포털 우선** — 무기픽 표시, 동의 화면 없음.
- 후반 섹터/보스 에셋: 매니페스트가 remodel-v2 보스(B8~B11·B22·B7)를 포함하며 초기 로드 404 0건. 보스별 아트는 보스 등장 시 lazy-load. **대표 후반 진입 시각 검증은 실제 브라우저 플레이로 권장.**

## 13. 제출 메타데이터·커버·영상 상태
- 메타데이터/라이선스/체크리스트: `docs/release/crazygames-basic-launch/` 3종 작성 완료.
- **커버 이미지 = MEDIA BLOCKED**: 이미지 제작은 이사님 주도(상시 정책). 사양(1920×1080·800×1200·800×800, 테두리·플랫폼로고·홍보문구 금지, 사용 가능한 기존 에셋=배경 s1~s6+함대/보스 아트)을 체크리스트에 명시.
- **미리보기 영상 = MEDIA BLOCKED**: 영상 도구 미사용. 사양(15~20초·≤50MB·1080p 16:9/2:3·무음·커서 숨김) + 촬영 샷리스트를 체크리스트에 명시.

## 14. 라이선스 불명확 항목
`asset-license-audit.md` 참조. **OK**: Pretendard 폰트(OFL·상업 가능), 게임 코드, 인라인 SVG. **UNKNOWN(이사 확인 필요)**: AI 생성 **사운드**(ElevenLabs SFX + BGM)·AI 생성 **이미지 아트**(Gemini/nanobanana) — 프로젝트용으로 제작됐으나 생성 도구의 상업 이용 약관이 리포에 없음. 공개 출시 전 이사 확인 필요.

## 15. 남은 수동 작업 (이사)
1. 사운드·이미지 아트 상업 라이선스 확인(UNKNOWN 항목).
2. 커버 3종 + 미리보기 영상 제작(사양 제공됨).
3. 실제 Chrome+Edge+폰 스팟체크(인앱 브라우저 rAF 정지 한계 보완).
4. CrazyGames 스테이징에서 첫 로딩 시간 측정(<10초).
5. CrazyGames 계정 생성 + `dist/neon-fleet-crazygames-basic.zip` 업로드(정책상 미수행).

## 16. 알려진 위험
- 첫 로딩 <10초는 CrazyGames CDN에서 43.9MB 전송에 달림 → 스테이징 실측 필요(로컬은 즉시).
- Edge는 별도 실행 미검증(Chromium 동일 엔진, 통과 예상).
- 사운드/아트 라이선스 UNKNOWN이 공개 출시의 실질 블로커.
- 인앱 브라우저 rAF 정지로 실시간 플레이 육안 검증은 헤드리스·DOM으로 대체 — 실기기 최종 확인 권장.
- ZIP에 휴면 first-party 분석 어댑터(`js/analytics-ga4.js`, googletagmanager URL 문자열 보유)가 포함되나 포털에서 완전 억제되어 네트워크 0건(캡처로 확인). 광고 SDK 아님.

## 17. `git status --short` 최종 상태
```
 M .gitignore
 M css/style.css
 M js/intro.js
 M js/main.js
 M js/render.js
 M js/ui.js
 M tests/sector-map-touch.test.mjs
 M tests/title-state-reset.test.mjs
?? (Prolific/analytics 신규 — 보존)  js/analytics*.js, js/playtest*.js, tests/analytics*·playtest*, docs/{analytics,research,qa/*,*Prolific*,*Stage1*}
?? (CrazyGames 신규)  js/distribution-config.js, js/platform.js, scripts/, tests/crazygames-*.test.mjs, tests/distribution-config.test.mjs, docs/release/
```
`git diff --check` = clean(공백/충돌 마커 없음). commit/push/merge/배포/업로드 미수행.

---

## 18. 후속 수정 — 캔버스 한글 누출(이사 지적) 2026-07-29
**증상**: 포털에 캔버스로 그려지는 텍스트에 한글이 남아 있었다 — ①수송선 파괴 '보급 획득' ②정예/중간보스 이름 '리퍼' ③처치 후 '긴급 재건·순양함·구조 수리' ④기타 팝업 다수.
**원인(중요)**: 첫 QA가 **DOM(오버레이)만 스캔**했는데, 이 텍스트들은 **캔버스에 직접 그려지는 라벨/토스트**(entities.js `world.effects.text`·MidBoss `fillText`, render.js HUD)라 DOM에 없어 놓쳤다.
**수정**:
- entities.js에 `setEntityLang(EN)`(모듈 언어 플래그 `LANG_EN`) + `ek()`/`wl()`/`evName()`/`traitTag()` 헬퍼 도입, 무기 강화·기함 승급·기함 특성·순양함 합체/격침·긴급 재건·강등 rescue·보급 획득·보호막·폭주·PowerModule·게이트·**MidBoss 이름(리퍼→REAPER LORD)**·격파 라벨 전수 영어화. main.js가 로드 시 `setEntityLang(EN)` 1회 호출 + `world.en` 설치.
- render.js HUD 잔여 한글(NeonArbiter 무방비/무력화 게이지, 함대 슬롯, 다음 이벤트) `en`/`d.en` 분기.
- 기함 등급 영문명 = EMBER·FLARE·ARCLIGHT·AURORA·ZENITH·QUASAR.
**검증**:
- 소스 정적 가드 테스트 `portal-no-korean-canvas.test.mjs`(3건): entities.js·render.js 캔버스 텍스트에 미분기 한글 0.
- 런타임 실증(포털, effects 버퍼 캡처): 기함 승급 "Flagship rank up: FLARE"·특성 "Rapid Fire"·rescue "⚠ 1 cruiser lost · fleet rebuilt"/"8 drones deployed"/"⚠ Demoted to FLARE" — **anyKorean=false**. `setEntityLang(EN)` 작동 확인.
- 전체 **662 테스트 통과**, dist 재빌드(44.64MB) 동일.
**교훈**: 캔버스 게임의 '영어화 0 한글' 검증은 DOM 스캔만으로 불충분 — 캔버스 텍스트는 (a)소스 정적 검사 (b)effects 버퍼/그리기 호출 런타임 캡처로 확인해야 한다. 이 두 가지를 회귀 테스트·QA에 포함했다.
> ⚠️ 로컬 검증 시 `python -m http.server`는 ES 모듈을 캐시(304)해 편집한 모듈을 안 물어올 수 있다(setEntityLang 미검출로 초기 오검). 새 포트 또는 no-cache 서버로 재확인. **dist 빌드·CrazyGames 신규 로드는 영향 없음.**

### 18-b. 섹터 클리어 컷신 한글(이사 2차 지적)
**증상**: 섹터 1 보스 격파 후 컷신에 "리퍼로드 격침 확인" 한글.
**원인**: `js/cutscene.js`(전체화면 섹터 클리어 컷신)를 캔버스-텍스트 감사에서 빠뜨렸다. 컷신이 `${c.bossName} 격침 확인`(보스 한글명)·`'Enter 키로 건너뛰기'`를 그렸다.
**수정**: cutscene.js에 `en` 플래그 추가 → 보스명 영문(`REAPER LORD destroyed`)·건너뛰기 안내(`Press Enter to skip`) 영어화. main.js가 `createCutscene({ en: EN, bossName: EN ? bossDefById(spriteId).name : korName })`로 호출. 가드 테스트에 cutscene.js 추가(PK-KO-2b).
**검증(실측)**: 포털에서 `createCutscene(en:true)` → cutEn=true·bossName="REAPER LORD"; `bossDefById('B8').name`="REAPER LORD"·`B22`="NEON ARBITER"·`B7`="HIVE QUEEN"(한글 0). 컷신 텍스트는 `c.en` 분기라 en=true면 "SECTOR 1 CLEAR / REAPER LORD destroyed / Press Enter to skip". 전체 **663 테스트 통과**, dist 재빌드(44.64MB) 동일.
**교훈 보강**: 캔버스-텍스트 감사 대상은 entities.js·render.js **+ cutscene.js**(그리고 향후 추가되는 모든 캔버스 렌더 파일). 가드 테스트가 이제 세 파일 모두 스캔.
