# 섹터별 전투 BGM — AI 생성 프롬프트

25분 캠페인의 6개 섹터마다 **다른 전투 BGM**을 깔아 색다른 느낌을 준다.
기존처럼 AI 음악 도구(ElevenLabs Music 등)에 아래 영어 프롬프트를 그대로 붙여넣어 만들면 된다.

## 파일 규칙 (중요)
- 파일명: `nf_bgm_sector1` … `nf_bgm_sector6`
- 위치: `assets/sound/` (기존 `nf_bgm_battle1.ogg`와 같은 폴더)
- 형식: `.ogg` **또는** `.mp3` (게임이 .ogg 먼저, 없으면 .mp3 시도). 둘 다 넣으면 가장 안전.
  - AI가 .wav로 주면 변환 필요: `ffmpeg -i nf_bgm_sector1.wav -c:a libvorbis -q:a 5 nf_bgm_sector1.ogg`
- **넣기 전까지는 자동으로 기존 전투곡(battle1)이 나온다** — 무음/오류 없음. 하나씩 만들어 넣어도 됨.
- 게임 연결은 이미 완료(`playBgmForSector`). 파일만 위 이름으로 넣으면 그 섹터부터 새 곡이 재생된다.

## 공통 규칙 (모든 트랙 동일 — 루프 필수)
- **완전 루프**: 인트로/아우트로·페이드인/아웃 **금지**. 끝 마디가 첫 마디로 자연스럽게 이어질 것.
- 길이 **80~100초**, `instrumental`(가사 없음), 스테레오.
- 톤 통일: 신스웨이브 + 하이브리드 오케스트라(기존 battle1/boss와 같은 계열). 섹터가 오를수록 **BPM·긴장감 상승**.
- 검수: 곡을 두 번 이어 붙여 들어 이음새에서 박자·음이 튀지 않으면 OK.

---

## 섹터 1 · COLD WAKE — 리퍼 로드
차가운 각성, 여정의 시작. 위협: 경량 군집(이동·광역). 담담하지만 결의가 실린 출항.

> driving mid-tempo synthwave space-combat music, 108 bpm, steady pulsing bassline, cold analog synth arpeggio, light metallic percussion, hopeful and determined, drifting through a frozen wake of starlight, restrained but building, seamless loop, no intro no outro, instrumental, 90 seconds

## 섹터 2 · PRISM GRAVE — 볼텍스 마우
프리즘 무덤. 깨진 크리스탈·유리 파편. 위협: 저격·포탑(우선 표적). 날카롭고 반짝이는 긴장.

> crystalline synthwave battle music, 116 bpm, glassy bell-like synth plucks, sharp staccato arpeggios, prism reflections and shimmer, precise and tense, navigating a graveyard of shattered crystal, cool blue-violet mood, seamless loop, no intro no outro, instrumental, 90 seconds

## 섹터 3 · FURNACE LINE — 옵시디언 클로
용광로 전선. 산업·열·장갑. 위협: 장갑·방패(관통/순서). 무겁고 뜨거운 산업 리듬.

> heavy industrial synthwave battle music, 124 bpm, distorted metallic percussion, molten low bass, clanking factory rhythms, forge heat and glowing embers, relentless and heavy, breaking through armored furnace lines, orange-black mood, seamless loop, no intro no outro, instrumental, 90 seconds

## 섹터 4 · BROKEN ARMADA — 보이드 세라프
부서진 함대의 잔해 지대. 위협: 모선·궤도(광역/전개). 광활하고 비장한 전장.

> epic hybrid orchestral synth battle music, 128 bpm, sweeping strings over pulsing bass, distant brass swells, drifting through a vast graveyard of broken warships, mournful yet heroic, wide and cinematic, rising tension, seamless loop, no intro no outro, instrumental, 95 seconds

## 섹터 5 · CHOIR VEIL — 네온 아비터
성가대의 장막. 신성·전기·네온. 위협: 전격·점멸(위치 선정). 성스럽고 불온한 합창.

> ethereal dark-choir synthwave battle music, 132 bpm, angelic wordless choir pads, crackling electric arpeggios, neon cathedral atmosphere, sacred and ominous, shimmering high tension, a veil of glowing voices, seamless loop, no intro no outro, instrumental, 95 seconds

## 섹터 6 · CROWN CORE — 하이브 퀸
왕관의 핵. 최종 결전 직전. 위협: 총력 혼성(모든 시험). 압도적·절정의 총력전.

> dark relentless hybrid orchestral synth battle music, 140 bpm, pounding war drums, ominous low brass, aggressive bass arpeggios, alien hive core assault, desperate all-out final war, maximum drive and grandeur, seamless loop, no intro no outro, instrumental, 100 seconds

---

## (선택) 나중에 더 하고 싶으면
- **섹터별 보스곡**도 같은 방식으로 확장 가능(현재는 보스곡 `nf_bgm_boss` 1개 공용). 원하면 `nf_bgm_boss_sN` 규칙으로 배선해줄 수 있음 — 지금은 스테이지 6곡에 집중.
- 각 곡을 만들어 넣을 때마다 이어붙여 루프만 확인하면 됨.
