# 네온 함대 — AI 디자인 지시서 3차: 진화 확장 + 무기 투사체 + 배경 리메이크

- 작성일: 2026-07-05
- 전제: **스타일은 이미 확정됨** — 기존 생성 시트의 "STYLE C — REAL METAL SF" (페인티드 메탈).
  이번 지시서의 모든 에셋은 그 스타일과 완벽히 톤이 맞아야 한다.

## 0. 반드시 지킬 것 — 스타일 고정

- **매 생성마다 기존 시트 이미지(스타일 C 부분)를 레퍼런스 이미지로 첨부**하고,
  프롬프트에 "same art style, same series, same lighting and material as the reference"를 포함할 것.
- 공통 접두 프롬프트 (모든 유닛에 사용):
```
game sprite asset, strict top-down view from directly above, single object
centered on plain black background, painted metal sci-fi style matching the
reference image, weathered armor plates, cyan engine glow, dramatic lighting,
no text, no watermark, no ground shadow
```
- 공통 네거티브: `text, letters, watermark, perspective view, side view, isometric, multiple objects, cropped, frame`

---

## 1. 함선 진화 확장 — A5, A6 (신규 2단계)

플레이어의 "다음 단계를 보고 싶은 욕구"가 목적. 기존 A1→A4 계보(첨부 시트)를 이어
**더 크고 위압적인 2단계**를 추가한다. 게임에서는 드론 700기에 A5, 1,400기에 A6으로 진화 예정.

| # | 이름 | 컨셉 | 필수 요소 | 프롬프트 뒷부분 |
| --- | --- | --- | --- | --- |
| A5 | 드레드노트 | A4(항모)보다 한 체급 위의 중전함. 두꺼운 장갑, 다층 함체 | 엔진 5, 주포 6문, 측면 회전 포탑 2 | `massive dreadnought battleship, same lineage as reference carrier, layered thick armor hull, six forward cannons, two side turrets, five engines` |
| A6 | 타이탄 (최종) | 함대의 기함. 쌍동선 구조 + 중앙 거대 주포. 화면을 압도하는 최종 진화 | 엔진 6+, 주포 8문, 중앙 스파인 대구경포, 발광 코어 | `colossal flagship titan, twin-hull catamaran structure with a giant central spinal cannon, eight gun hardpoints, glowing power core, ultimate final evolution of the reference ship series` |

- 각 함선: 단독 1024px 이상 + **엔진/포탑 위치 주석 사본 1장** (게임이 그 좌표에 화염·탄을 붙임)
- 계보 확인용: A3→A4→A5→A6 4척을 한 장에 나란히 놓은 라인업 컷 1장 (크기 비율 확인)

## 2. 무기 투사체·이펙트 세트 (신규 — 업그레이드 체감의 핵심)

무기가 레벨업/함선 진화할 때 **탄부터 달라 보여야** 한다. 각 무기 3레벨 = 총 9종 + 이펙트.
투사체는 **위(12시)를 향하게**, 각 256px 이상, 검정 배경.

| 무기 | Lv1 | Lv2 | Lv3 | 색 |
| --- | --- | --- | --- | --- |
| 발칸 (확산탄) | 가는 단발 예광탄 | 굵은 이중 탄두 | 대구경 작열탄 + 꼬리 화염 | 청록+흰 코어 |
| 레이저 (관통볼트) | 얇은 에너지 볼트 | 이중 코어 장볼트 | 극태 빔 기둥 조각 (지속빔 느낌) | 하늘+흰 코어 |
| 호밍 (유도 미사일) | 소형 로켓 | 날개 달린 중형 미사일 | 대형 어뢰 + 강한 추진 화염 | 금색+주황 배기 |

프롬프트 예 (발칸 Lv3): `single projectile sprite, large-caliber incandescent tracer round with flame trail, pointing up, cyan energy with white hot core, painted metal sci-fi style matching reference`

추가 이펙트:
- 머즐 플래시 3종 (무기별 색, 128px)
- 명중 폭발 2종 (소형 히트 스파크 / 대형 폭발, 256px, 주황+흰)
- 진화(승급) 순간 광륜 이펙트 1종 (청록 링, 512px, 중앙 투명)

## 3. 배경 리메이크 3종 (현재 배경의 문제 해결)

현재 배경 문제: ① 흐리고 특징 없음 ② 반복 경계선. 요구사항:

1. **규격**: 세로형 1024×1820 이상 (9:16). 클수록 좋음.
2. **루프**: 세로로 무한 반복되므로 **이미지의 맨 위 가장자리와 맨 아래 가장자리가 같은 톤의
   "조용한 어두운 우주"**여야 한다 (성운·행성 등 포인트 요소를 상하 끝에서 15% 안쪽에만 배치).
   → 이렇게만 해주면 이음새는 개발 쪽 후처리로 완벽하게 잇는다.
3. **흐리멍텅 방지**: 뚜렷한 형태의 성운(붓터치가 보이는), 별 밀도의 강약, 그리고 스테이지마다
   1개의 **원경 포인트 실루엣**(부서진 행성 / 거대 잔해 / 어두운 함대 그림자)을 넣어 "장소"가 느껴지게.
4. **가독성 한계**: 화면 중앙 세로 밴드(플레이 영역)는 명도·채도를 낮게 유지. 포인트 요소는
   좌우 가장자리 쪽에. 전체적으로 어둡게 (유닛·탄이 항상 배경보다 밝아야 함).

| # | 스테이지 | 무드 | 프롬프트 |
| --- | --- | --- | --- |
| D1 | 1~3 | 차가운 출정 | `dark deep space vertical background, indigo and violet nebula with defined painterly shapes, varying star density, a distant shattered planet silhouette near the left edge, very dark center corridor, painted sci-fi style, portrait 9:16` |
| D2 | 4~6 | 적진 진입 | D1 교체: `crimson and magenta nebula, wreckage debris field silhouettes near edges` |
| D3 | 7+ | 최심부 | D1 교체: `ominous dark red nebula, colossal alien hive structure silhouette in far distance` |

## 4. 스타일 C 완전체 (기존 시트 누락분 — 함께 생성 권장)

| # | 항목 | 비고 |
| --- | --- | --- |
| B7-HD | 하이브 퀸 고해상도 리메이크 | 단독 1024px (현재 시트 크롭이 124px라 확대 시 흐림). + 광폭화 버전(균열·붉은 발광) 1장 |
| B2 | 리퍼 (중형 돌격, 낫팔 실루엣) | 스타일 C로 |
| B4 | 저격 드론 (호버 포격기, 하방 총신) | 스타일 C로 |
| B6 | 사이드 위버 (가오리형 폭격기) | 스타일 C로 |
| C1~C4 | 크리스탈(중앙 단순), 무기 캡슐(청록/하늘/금 3색), 화력 모듈, 운석 | 스타일 C로 |

## 5. 납품 규격 (공통)

- 유닛/투사체: 검정 배경 원본 + 가능하면 배경 제거본. 어려우면 원본만 — 투명화는 개발 쪽에서 처리
- 파일명: `nf2_[분류]_[이름]_lv[레벨].png` (예: `nf2_proj_vulcan_lv3.png`, `nf2_ship_a5_dreadnought.png`)
- 사용한 프롬프트/시드 기록 1부 (재현·추가 생성용)

## 6. 검수 체크리스트

- [ ] A5·A6이 기존 A1~A4와 같은 시리즈로 보이는가 (재질·라이팅·계보)
- [ ] A4→A5→A6 크기·위압감이 단계적으로 상승하는가
- [ ] 투사체 9종이 무기별(색)·레벨별(크기/화려함)로 즉시 구분되는가
- [ ] 배경: 상하 끝 15%가 조용한 우주인가 / 중앙 밴드가 어두운가 / 포인트 실루엣이 있는가
- [ ] 전 에셋 탑다운 시점, 글자·워터마크 없음

## 부록: 게임 쪽 반영 계획 (개발 메모)

- 진화 6티어 확장: 임계값 [8, 50, 150, 350, 700, 1400], DPS 배수 [1.0, 1.2, 1.45, 1.75, 2.05, 2.4],
  주포 문수 1/2/4/5/6/8 — 아트 도착 시 즉시 반영
- 배경: 스테이지 구간별 D1/D2/D3 자동 전환 + 후처리 심리스화(이미 파이프라인 있음)
- 투사체: 레벨별 스프라이트 교체 (현재 코드 드로잉 → 이미지)
