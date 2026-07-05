# 네온 함대 — AI 이미지 생성 디자인 지시서 (전체 에셋)

- 작성일: 2026-07-05
- 목적: 게임에 필요한 **모든 시각 에셋을 이미지 생성 AI로 신규 제작**한다.
  현재 게임에 적용된 코드 드로잉(네온 와이어프레임) 스타일은 **폐기 대상이며 참고하지 않는다.**
- 사용 도구: Midjourney / DALL-E / Stable Diffusion / Firefly 등 (프롬프트는 공용으로 작성)

---

## 1. 게임 정보 (프롬프트 맥락용)

세로형 모바일/PC 웹 슈팅 게임. 플레이어 함대가 화면 하단에서 위를 향해 자동 사격하며,
적과 아이템이 위에서 아래로 내려온다. 유닛은 화면에서 작게(24~100px) 표시된다.

**따라서 모든 유닛 에셋의 절대 규칙 3가지:**
1. **탑다운(정확히 수직으로 내려다본) 시점** — 사선/입체 구도 금지
2. **한 이미지에 오브젝트 1개만**, 화면 중앙, 여백 충분히
3. **작게 축소해도 읽히는 굵고 명확한 실루엣**

## 2. 공통 제작 규칙

- 해상도: 1024×1024 이상 (배경 제외)
- 배경: **단색 검정 배경으로 생성** 후 배경 제거해 투명 PNG로 납품
  (AI가 투명 배경을 직접 못 만드는 경우가 많음 — remove.bg, Photoshop 등 후처리 필수)
- 이미지 안에 글자·숫자·로고·워터마크·서명 **절대 금지** (숫자는 게임이 직접 그림)
- 그림자: 바닥 그림자 금지 (우주 공간이므로), 자체 발광 표현은 허용
- 시리즈 일관성 확보 방법 (중요):
  - 아래 §3의 **마스터 스타일 블록을 모든 프롬프트 맨 앞에 동일하게** 붙인다
  - 같은 도구·같은 모델·같은 세팅으로 한 세션에서 몰아서 생성
  - 지원 시: 시드 고정, 이미지 레퍼런스(첫 확정 이미지를 스타일 참조로 재사용)
  - 플레이어 함선 4종은 **한 프롬프트 안에서 4단계를 함께 생성**해 계보를 맞추는 방법도 시도 (§4-A 변형 프롬프트 참고)

### 공통 네거티브 프롬프트 (지원되는 도구에서 사용)

```
text, letters, numbers, watermark, signature, logo, blurry, low quality,
photo, realistic photograph, perspective view, side view, 3/4 view, isometric,
multiple objects, cropped, cut off, frame, border, drop shadow on ground
```

## 3. 마스터 스타일 (하나를 골라 전체 에셋에 동일 적용)

> 아래 3안 중 1개를 선택한다. 선택한 블록을 `[STYLE]` 자리에 넣는다.
> 소량 테스트(함선 1 + 적 1) 후 마음에 드는 스타일로 전체를 진행할 것.

**스타일 A — 세라믹 하이테크 (추천: 밝고 고급스러운 모바일 게임 느낌)**
```
glossy white ceramic and gunmetal sci-fi design, sleek rounded armor panels,
glowing accent lights, premium mobile game art style, crisp vector-like edges,
subtle gradients, vibrant but clean color palette
```

**스타일 B — 카툰 스티커 (캐주얼·대중적, 원작 러너 감성과 가까움)**
```
bold cartoon game art, thick dark outlines, cel shading, saturated colors,
chunky toy-like proportions, sticker style, playful and readable shapes,
casual mobile game aesthetic
```

**스타일 C — 리얼 메탈 SF (진지한 슈팅 게임 느낌)**
```
detailed hard-surface sci-fi concept art, painted metal hull with wear,
military spacecraft design, dramatic rim lighting, AAA space shooter style,
rich material detail, cinematic color grading
```

## 4. 에셋 목록 + 프롬프트

프롬프트 사용법: `[STYLE]` 에 §3 선택 블록을 넣고 그대로 생성.
모든 유닛 프롬프트에는 이미 공통 조건(탑다운/중앙/검정 배경)이 포함되어 있다.

공통 접두 블록 (모든 유닛 프롬프트 맨 앞에 붙임):
```
game sprite asset, strict top-down view from directly above, single object
centered on plain black background, symmetrical, facing up, clean bold
silhouette, [STYLE], no text, no watermark
```

### A. 플레이어 함선 — 진화 4단계 (필수 1순위)

같은 세력·같은 계보로 보여야 하며 단계가 오를수록 커지고 화려해진다.
색은 아군 공통 키컬러 1개(디자이너/AI 산출에서 가장 잘 나온 색)로 통일한다.

| # | 이름 | 프롬프트 뒷부분 (접두 블록 뒤에 붙임) |
| --- | --- | --- |
| A1 | 스카웃 (소형 드론) | `tiny scout drone spacecraft, minimal single-seat frame, one small engine, simple dart shape` |
| A2 | 인터셉터 (전투기) | `small agile interceptor starfighter, X-shaped four wings, twin wing cannons, one main engine, sleek dart fuselage` |
| A3 | 스트라이커 (중전투기) | `medium heavy strike fighter, twin engines, forward canards, four gun hardpoints, twin tail, aggressive silhouette` |
| A4 | 커리어 (전투 항공모함) | `large battle carrier spaceship, central command spine, two side flight decks with runway lines, four engines, six turret hardpoints, imposing capital ship` |

계보 일치용 변형(권장): 위 4개를 개별 생성하기 전에 아래로 "가족 사진"을 먼저 뽑아 방향을 확정한다.
```
(접두 블록) + evolution lineup of the same spacecraft faction, four ships side
by side from small scout drone to fighter to heavy fighter to battle carrier,
consistent design language, same color scheme, size progression
```

- 납품 추가 요건: 각 함선의 **엔진 위치·포탑 위치를 표시한 주석 사본 1장** (게임에서 그 좌표에 화염/탄환을 붙임)

### B. 적 세력 7종 (필수 2순위)

적은 하나의 외계 세력으로 통일감 있게. 아군과 명확히 다른 색·형태.
등급이 높을수록 크고 위협적으로. **모든 적에 공통 시그니처 1개**(예: 발광 코어)를 넣어 "같은 편"임을 표시.

| # | 이름 | 역할 | 프롬프트 뒷부분 |
| --- | --- | --- | --- |
| B1 | 샤드 | 최소형 잡몹, 떼로 등장 | `tiny alien attack pod, spiky dart shape, menacing glowing core, swarm unit` |
| B2 | 리퍼 | 중형 돌격 | `medium alien raider creature-ship hybrid, curved blade wings, predatory mantis silhouette, glowing core` |
| B3 | 브루드 캐리어 | 대형 장갑선, 잡몹 사출 | `large armored alien hive carrier, thick segmented shell, two glowing hatches releasing drones, dorsal spikes` |
| B3-2 | 브루드 파손 2종 | HP 66%/33% 변형 | B3 프롬프트 + `battle damaged, cracked shell with glowing fissures` (경미/심각 2장) |
| B4 | 저격 드론 | 공중 정지 + 조준 사격 | `small alien sniper drone, hovering gun platform, long under-mounted cannon, sinister eye sensor` |
| B5 | 고정 포탑 | 5방향 부채꼴탄 | `alien defense turret structure, organic armored base, multiple forward gun barrels in a fan` |
| B6 | 사이드 위버 | 가로 횡단 + 폭탄 | `small alien manta-ray shaped bomber, wide curved wings, bomb bay underneath` |
| B7 | 하이브 퀸 (보스) | 최종 보스, 화면 상단 점거 | `giant alien hive queen mothership, wide oval body, crown of spikes, three glowing egg sacs underneath, huge central eye, terrifying boss` |
| B7-2 | 하이브 퀸 광폭화 | HP 50% 이하 상태 | B7 프롬프트 + `enraged state, cracked armor, core burning brighter, aggressive red glow` |

### C. 아이템/오브젝트 (필수 3순위)

| # | 이름 | 게임 기능 | 프롬프트 뒷부분 |
| --- | --- | --- | --- |
| C1 | 에너지 크리스탈 | 파괴 시 아군 증가 (중앙에 게임이 숫자 표시 → **중앙부는 단순하게**) | `floating energy crystal, faceted gem, warm inviting glow, treasure item, simple flat center area` |
| C2 | 무기 캡슐 ×3 | 무기 교체/강화 아이템 (3종 색만 다르게) | `small weapon power-up capsule, hexagonal container with glowing core, collectible item` (색 3변형: 무기별) |
| C3 | 화력 모듈 | 10초 화력 2배 | `star-shaped power-up item, radiant golden energy, spinning collectible` |
| C4 | 운석 | 중립 장애물 (적 세력과 확실히 구분) | `asteroid space rock, cratered rough surface, neutral gray-brown stone, no glow` |
| C5 | 실드 아이콘 | HUD/게이트 표기용 | `energy shield icon, simple bold emblem, game UI icon` |
| C6 | 코인 | 재화 아이콘 | `game currency coin icon, simple bold emblem` |

- 워프 게이트(+/×/−/÷ 반투명 필드)와 탄환·폭발 이펙트는 **게임 코드가 그리는 것을 유지**한다
  (숫자 표시·색 변화·투명도 등 동적 요소라 이미지로 대체 시 오히려 품질 저하).
  단, 원하면 옵션: 게이트 기둥(좌우 프레임) 장식용 이미지 2종.

### D. 배경 (필수 4순위)

세로로 끊김 없이 스크롤되므로 **위아래가 이어지는(seamless vertical tiling)** 이미지가 필요.
AI 생성 후 이음새는 후처리로 보정한다. 유닛보다 훨씬 어둡고 채도 낮게 (유닛 가독성 최우선).

| # | 용도 | 프롬프트 |
| --- | --- | --- |
| D1 | 스테이지 1~3 | `dark deep space background for vertical scrolling shooter, sparse dim stars, subtle nebula, very dark, low contrast, no planets, seamless vertical tile, portrait orientation` |
| D2 | 스테이지 4~6 | D1 + `distant purple nebula tint` |
| D3 | 스테이지 7+ | D1 + `ominous dark red nebula tint, tension` |

- 규격: 세로형 1024×1820 이상

### E. 타이틀/마케팅 (선택)

| # | 이름 | 프롬프트 |
| --- | --- | --- |
| E1 | 타이틀 로고 | `game logo design for "NEON FLEET", bold sci-fi typography, spacecraft motif, transparent-ready on black` — 로고는 글자가 필요한 유일한 항목. 실패율 높으므로 AI 초안 → 사람이 다듬는 것을 권장 |
| E2 | 키 비주얼 | `epic vertical key art, small spacecraft fleet charging toward a giant alien mothership, dramatic space battle, mobile game store artwork` |

## 5. 납품 형식

- 유닛/아이템: 배경 제거된 투명 PNG, 원본(검정 배경 원화) 함께 보관
- 파일명: `nf_[분류]_[이름]_v[버전].png` (예: `nf_enemy_b2_reaper_v1.png`)
- 스타일 확정에 사용한 **프롬프트·시드·도구 버전 기록 문서** 1부 (추가 생성·수정 시 재현용)
- 전체 에셋을 한 장에 모은 **축소 시트** (인게임 크기: 아군 32~100px, 적 24~90px, 아이템 24~48px) — 실루엣 가독성 검수용

## 6. 검수 체크리스트

- [ ] 전 유닛이 정확한 탑다운 시점인가 (사선 아님)
- [ ] 인게임 크기로 축소했을 때 아군/적/아이템이 즉시 구분되는가
- [ ] 적 7종이 한 세력으로 보이는가 (공통 시그니처 확인)
- [ ] 플레이어 4단계가 같은 계보로 보이고 크기·위엄이 단계적으로 상승하는가
- [ ] 이미지 안에 글자/워터마크/바닥 그림자가 없는가
- [ ] 크리스탈 중앙이 숫자를 얹을 수 있게 단순한가
- [ ] 배경이 유닛보다 확실히 어둡고 채도가 낮은가

## 7. 진행 순서 (권장)

1. **스타일 테스트**: §3의 A/B/C 스타일로 각각 A2(인터셉터) + B2(리퍼) 1장씩 생성 → 스타일 확정
2. 확정 스타일로 A(플레이어 4종) 생성 → 계보 확인
3. B(적 7종) → C(아이템) → D(배경) → E(선택)
4. 배경 제거·축소 시트 제작 → §6 체크리스트 검수
5. 게임 적용 (개발 측에서 스프라이트 교체 — 코드 구조상 준비되어 있음)
