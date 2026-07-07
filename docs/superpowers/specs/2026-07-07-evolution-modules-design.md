# ② 진화 모듈(빌드) 시스템 — 설계 기록

로그라이크 재개편 로드맵 **2단계**. 우리 시그니처(드론 희생 진화)를 로그라이크의 심장으로.

## 원정 구조 (정통 연속 원정)
- 한 원정 = 1스테이지부터 죽을 때까지 연속. 기함·드론·모듈·무기가 누적된다.
- 보스 격파 → 다음 스테이지로 이어짐(`advanceStage`), 클리어 코인 누적, 최고 도달 스테이지 기록.
- 죽으면 원정 종료(`endExpedition`) → 코인·기록 정산 → 1스테이지부터 새 원정. (죽어도 남는 성장 = 코인→격납고)
- `newExpedition`/`buildStage`로 분리: 원정 객체(squad·modules·coins·maxPower)는 유지, 스테이지별 트랙만 재구성.

## 진화 = 모듈 드래프트
- 진화(드론 희생)마다 `pendingDraft` 플래그 → main이 감지해 게임 정지 + 카드 3장(`openDraft`→`ui.showDraft`).
- 고른 모듈은 `run.modules`에 누적(중복=스택), `computeMfx`로 효과 누적기(`world.mfx`) 재계산.
- 최고 티어 후 **오버로드**: `overloadCost`만큼 더 모아 바치면 모듈 1개 더 + 기함 파워 → 무한 성장(→ ③ 무한 심연 연결).

## 모듈 13종 (modules.js, "쉽지만 깊게")
화력코어·연사장치·관통탄심·폭발탄두·치명회로 / 사냥꾼표식(rare) / 수확드론·신속진화·잔존편대·전리회수·위상장갑 / 반응실드(rare)·군체의지(rare). 각 효과는 `world.mfx` 필드로 표현되어 Squad.fire·checkEvolution·contactDamage·보상·전투에서 읽힌다.

## 효과 훅 (entities.js/main.js)
- fire: dmgMult·fireRateMult·pierceBonus·crit / power getter: swarmPerDrone·overloadPower
- checkEvolution: evolveCostMult·retainBonus + 오버로드
- contactDamage: contactCapMult / update: shieldRegen
- 보상: Crystal·DronePod ×podRewardMult
- 전투: 보스·중간보스 ×bossDmgMult / onEnemyKilled: 폭발 광역 + 전리 드론

## 검증
- 단위 테스트 47종(modules 7 + 기존). 
- 헤드리스 연속 원정: 오류 0, 드래프트 48회, STAGE 2→10 연속, 13종 모듈 전부 획득, mfx 누적(화력 ×3.81 등) 확인. 드래프트 화면 실렌더 스크린샷 확인.
- ⚠️ 로컬 프리뷰 ES모듈 캐시가 완강 → `dev-server.py`(no-cache·no-304) 도입. 배포엔 무관.

## 다음
③ 무한 심연 + 난이도 등급, ④ 기함 해금. 밸런스: 전 모듈 획득 시 다소 쉬움 → 난이도 등급(③)에서 조이기.
