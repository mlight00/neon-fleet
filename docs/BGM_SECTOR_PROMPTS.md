# 섹터별 전투 BGM — AI 생성 프롬프트

25분 캠페인의 6개 섹터마다 **다른 전투 BGM**을 깔아 색다른 느낌을 준다.
기존처럼 AI 음악 도구(ElevenLabs Music 등)에 아래 영어 프롬프트를 그대로 붙여넣어 만들면 된다.

## 파일 규칙 (중요)
- 파일명: `nf_bgm_sector1a` / `nf_bgm_sector1b` … `nf_bgm_sector6a` / `nf_bgm_sector6b`
  - **섹터마다 변주 2곡(a·b)** 을 두면 진입 때마다 게임이 **랜덤으로 하나**를 튼다(색다름 ↑). 1곡만 만들면 `…1a`만 넣어도 됨.
  - 같은 섹터 안에서 노드를 넘어가도 곡은 유지되고, **섹터가 바뀔 때만 새로 추첨**된다.
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

---

# 섹터별 보스곡 — AI 생성 프롬프트

각 섹터 보스전에 전용 곡을 깐다. 공통 규칙은 위와 동일(완전 루프·instrumental·BPM 상승).
- 파일명: `nf_bgm_boss_sector1` … `nf_bgm_boss_sector6` (보스는 섹터당 1곡)
- 위치: `assets/sound/` · 형식 `.ogg`/`.mp3`
- **넣기 전까지는 기존 공용 보스곡(`nf_bgm_boss`)이 나온다** — 무음/오류 없음. 게임 연결 완료(`playBgmForBoss`).
- 톤: 기존 보스곡(130bpm 하이브리드 오케스트라)과 같은 계열, 섹터가 오를수록 웅장·긴박.

## 섹터 1 보스 · 리퍼 로드 (낫의 군주)
> epic boss battle music, hybrid orchestral synth, 126 bpm, cold ominous strings, scything metallic stabs, heavy war drums, a bladed reaper warlord rising from frozen space, menacing and grand, seamless loop, no intro no outro, instrumental, 90 seconds

## 섹터 2 보스 · 볼텍스 마우 (소용돌이 아가리)
> epic boss battle music, hybrid orchestral synth, 128 bpm, swirling arpeggios, crystalline glassy stabs, deep spiraling bass, huge drums, a devouring vortex maw amid shattered prisms, hypnotic and threatening, seamless loop, no intro no outro, instrumental, 90 seconds

## 섹터 3 보스 · 옵시디언 클로 (흑요석 발톱)
> epic boss battle music, heavy industrial hybrid orchestral synth, 130 bpm, molten distorted bass, clanging metal percussion, pounding drums, ominous brass, an obsidian-clawed juggernaut in a burning furnace, brutal and heavy, seamless loop, no intro no outro, instrumental, 92 seconds

## 섹터 4 보스 · 보이드 세라프 (공허의 천사)
> epic boss battle music, hybrid orchestral synth, 132 bpm, soaring tragic strings, ethereal choir accents, ringing bell tones, thunderous drums, a colossal void seraph over a broken armada, sorrowful yet overwhelming, seamless loop, no intro no outro, instrumental, 95 seconds

## 섹터 5 보스 · 네온 아비터 (네온 심판자)
> epic boss battle music, dark-choir hybrid orchestral synth, 134 bpm, thunderous angelic choir, crackling electric arpeggios, massive drums, sacred neon cathedral judgment, the Neon Arbiter passing sentence, sacred and terrifying, maximum tension, seamless loop, no intro no outro, instrumental, 96 seconds

## 섹터 6 보스 · 하이브 퀸 (최종 · 벌집 여왕)
> climactic final boss battle music, dark relentless hybrid orchestral synth, 138 bpm, pounding war drums, monstrous low brass, swarming aggressive arpeggios, menacing choir, the alien Hive Queen at the crown core, desperate epic final confrontation, overwhelming grandeur, seamless loop, no intro no outro, instrumental, 100 seconds

---

## 변주를 원하면
- 보스곡도 스테이지처럼 변주 2곡(a/b) 랜덤을 원하면 알려주세요 — 지금은 보스당 1곡(`nf_bgm_boss_sectorN`)입니다.
- wav로 주시면 스테이지곡처럼 제가 루프 가공+ogg/mp3 변환해서 넣겠습니다.
