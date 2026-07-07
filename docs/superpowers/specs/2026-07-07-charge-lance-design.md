# 차지 랜스 (공통 기함 무기) — 설계 기록

능동적 손맛 추가. 홀드로 자동사격을 멈추고 에너지를 모아 정면 관통 랜스를 발사. ④ 기함 해금 전, 모든 기함 공통 기능으로 먼저.

## 동작
- **홀드**(데스크톱 좌클릭 / 모바일 '충전' 버튼) → 평소 자동사격 정지, 에너지 충전.
- **3단계 충전**(단계당 `stageTime`초): 홀드할수록 단계↑, 링·발광·라벨(⚡n)로 표시. 상승음.
- **놓으면** 그 단계의 **랜스**(정면 세로 관통 빔) 발사 → 앞의 적 컬럼 전멸 + 경로 적탄 소멸 + 충격파·섬광·반동. 1단 미만이면 발사 안 함(오클릭 안전) — 자동사격 재개.

## 위력 / 업그레이드마다 강해짐
- 랜스 피해 = `squad.power × charge.blastCoef × stageMult[stage] × mfx.dmgMult × mfx.chargeMult`.
  → 진화·모듈로 강해질수록 랜스도 자동으로 훨씬 강력(적도 화력비례라 늘 "한 방으로 뚫는" 손맛).
- 차지 전용 모듈 3종(드래프트): **충전 증폭**(chargeMult↑), **신속 충전**(chargeSpeed↑), **과부하**(chargeMaxBonus +1 = 4단 해금).

## 트레이드오프 (균형)
- 충전 중 DPS 0 → 적이 쌓임. "언제 모을지" 판단이 실력. 랜스는 손해를 보상할 만큼 강력(특히 보스·엘리트 처형용).

## 조작 (input.js 분리)
- 데스크톱: 마우스 위치로 이동(유지) + 좌클릭 홀드=충전(클릭이 이동을 점프시키지 않게 분리). 캔버스 밖 릴리즈 대비 window pointerup도 처리.
- 모바일: 우하단 '충전' 버튼 홀드(다른 손 드래그 이동). `input.charging` 노출.

## 구조
- `input.js`: `charging` 플래그, 이동/충전 입력 분리.
- `balance.js` `charge{stageTime,maxStage,blastCoef,stageMult[],width[],minStageToFire}`.
- `logic.js` `chargeStageFor(charge,stageTime,maxStage)` 순수함수(테스트).
- `entities.js` Squad: 충전 상태·`fireLance()`·충전 VFX. 신규 `ChargeLance`(관통 빔 비주얼).
- `modules.js`: 차지 모듈 3종 + mfx(chargeMult/chargeSpeed/chargeMaxBonus).
- `main.js`: 모바일 충전 버튼 DOM.

## 안 하는 것
- 기함별 차지 특성(관통/광역/연사 변형)은 ④ 기함 해금 때. 지금은 공통 랜스 하나.

## 검증
- 단위테스트(chargeStageFor). 헤드리스: 충전→발사, 컬럼 피해, 모듈 효과. 스크린샷: 충전 중·랜스 발사.
- 사운드는 기존 효과음 재사용 + 전용 충전/발사음 AI 프롬프트 별도 제공.
