# 네온 함대 — 사운드 설계 + AI 제작 지시서

- 작성일: 2026-07-05
- 구성: §1~3 = 게임 쪽 설계(개발 참고), §4~6 = **AI에게 전달할 제작 지시서**

---

## 1. 설계 원칙

1. **템포 우선**: 한 판 50초 게임이라 사운드는 짧고 즉각적이어야 한다. 긴 이펙트·리버브 금지.
2. **소리 계층**: 항상 나는 소리(발사)는 작고 가볍게, 가끔 나는 소리(진화·보스)는 크고 화려하게.
   발사음이 크면 5분 만에 피로해진다.
3. **연사 스로틀**: 초당 25발 발사에 25번 소리를 내면 안 됨 → 같은 효과음은 **초당 최대 8회, 동시 3개**로 제한하고 피치를 ±10% 랜덤 변조해 기관총 느낌만 남긴다.
4. **모바일 정책**: 브라우저는 사용자 터치 전 소리 재생을 금지 → **[출격] 첫 탭에서 오디오 잠금 해제**.
5. **음소거 버튼** 필수(타이틀+인게임 HUD 구석). 설정은 저장.
6. 파일이 없거나 로드 실패해도 게임은 무음으로 정상 동작 (기존 아트 폴백과 동일한 철학).

## 2. 게임 쪽 아키텍처 (audio.js — 파일 도착 후 구현)

- WebAudio API 1개 컨텍스트. 채널 2개: `bgm`(GainNode, 크로스페이드용 2슬롯), `sfx`(GainNode).
- BGM: 상황 전환 시 1.2초 크로스페이드 (타이틀 ↔ 전투 ↔ 보스전 ↔ 승리/패배 징글).
- SFX: 버퍼 캐시 + 동시 재생 상한 + 이벤트별 쿨다운 테이블.
- 볼륨 기본값: BGM 0.5, SFX 0.8. localStorage 저장(save.js 확장: `snd: {bgm, sfx, mute}`).
- 훅 위치: entities.js의 이벤트 지점(발사/명중/폭발/게이트/진화 등)에서 `audio.play('id')` 한 줄씩.

## 3. BGM 상태 전이

```
[타이틀/격납고: title] → 출격 → [전투: battle(스테이지 구간별 1~3)] → 보스 등장 → [boss]
        ↑                                                            ↓
        └── 결과 화면: 승리 징글/패배 징글 (원샷) → 한 판 더 → battle ─┘
```

---

# ============ 이하 AI 제작 지시서 ============

## 4. 공통 제작 규격

| 항목 | BGM | 효과음(SFX) |
| --- | --- | --- |
| 포맷 | MP3 320kbps (또는 WAV로 주면 변환은 개발 쪽에서) | 동일 |
| 채널 | 스테레오 | 모노 권장 |
| 길이 | 60~120초 **완전 루프** | 0.1~1.5초 (징글만 3~5초) |
| 루프 조건 | **곡의 시작과 끝이 이어져야 함**: 페이드인/아웃 금지, 인트로·아우트로 없이 바로 본론, 끝 마디가 첫 마디로 자연스럽게 연결 | 해당 없음 |
| 음량 | 트랙 간 비슷한 크기(대략 -14 LUFS), 클리핑 금지 | 피크 -3dB 이하 |
| 파일명 | `nf_bgm_[이름].mp3` | `nf_sfx_[이름].mp3` |

**전체 무드 키워드**: dark space, metallic, synthwave + orchestral hybrid, tense but driving.
게임은 "낡은 금속 함대 vs 외계 군체"의 진지한 SF 슈팅 — 귀엽거나 칩튠(레트로 8bit) 느낌은 **아님**.

## 5. BGM 6트랙

| # | 파일명 | 용도 | 프롬프트 (영어로 입력) |
| --- | --- | --- | --- |
| M1 | nf_bgm_title | 타이틀·격납고 | `dark ambient space music, slow pulsing synth pads, distant metallic echoes, calm but mysterious, seamless loop, no intro no outro, 80 seconds, instrumental` |
| M2 | nf_bgm_battle1 | 스테이지 1~3 전투 | `driving mid-tempo synthwave battle music, 110 bpm, pulsing bass, metallic percussion, heroic determined mood, space combat, seamless loop, instrumental` |
| M3 | nf_bgm_battle2 | 스테이지 4~6 전투 | `intense synthwave battle music, 125 bpm, aggressive bass arpeggios, industrial percussion, rising tension, red nebula war zone, seamless loop, instrumental` |
| M4 | nf_bgm_battle3 | 스테이지 7+ 전투 | `dark relentless hybrid orchestral synth battle music, 135 bpm, ominous low brass, pounding drums, alien hive assault, desperate final war, seamless loop, instrumental` |
| M5 | nf_bgm_boss | 보스전 (전 스테이지 공용) | `epic boss battle music, heavy hybrid orchestral synth, 130 bpm, menacing choir-like pads, huge drums, alien queen confrontation, maximum tension, seamless loop, instrumental` |
| M6 | nf_bgm_jingle_win / _lose | 승리/패배 징글 (각 3~5초, 루프 아님) | 승리: `short 4 second victory fanfare, triumphant synth brass, space opera` / 패배: `short 4 second defeat sting, dark descending synth, somber` |

우선순위: **M2 → M5 → M1** 3개만 있어도 게임이 성립. M3/M4/M6은 2차.

## 6. 효과음 21종

> 효과음은 음악 AI보다 전용 SFX AI(ElevenLabs SFX 등)가 잘 만든다.
> **AI 생성이 어려우면 이 목록의 ①~⑳은 개발 쪽에서 WebAudio 합성음으로 직접 만들 수 있으니,
> BGM만 AI로 받아와도 된다.** (그 경우 이 표는 합성음 스펙으로 사용)

### 플레이어 무기 (연사 스로틀 적용 대상 — 짧고 가볍게)

| # | 파일명 | 상황 | 묘사 프롬프트 |
| --- | --- | --- | --- |
| S1 | nf_sfx_vulcan | 발칸 발사 | `single short sci-fi pulse cannon shot, light metallic snap, 0.15s` |
| S2 | nf_sfx_laser | 레이저 발사 | `short high-energy laser bolt zap, clean and sharp, 0.2s` |
| S3 | nf_sfx_missile | 호밍 발사 | `small missile launch whoosh with brief rocket hiss, 0.4s` |

### 타격/파괴

| # | 파일명 | 상황 | 묘사 |
| --- | --- | --- | --- |
| S4 | nf_sfx_hit | 적 피격 틱 | `tiny metallic impact tick, soft, 0.1s` |
| S5 | nf_sfx_explode_s | 소형 적 폭발 | `small quick sci-fi explosion pop with metal debris, 0.4s` |
| S6 | nf_sfx_explode_l | 대형 적/포탑 폭발 | `heavy deep explosion with metallic shrapnel, 0.8s` |
| S7 | nf_sfx_crystal | 크리스탈 파괴(드론 획득) | `bright crystalline shatter followed by a short ascending sparkle, rewarding, 0.7s` |

### 선택/성장 (기분 좋은 소리 — 이 게임의 도파민 담당)

| # | 파일명 | 상황 | 묘사 |
| --- | --- | --- | --- |
| S8 | nf_sfx_gate_good | 이득 게이트 통과 | `quick ascending warp chime, positive, energizing, 0.5s` |
| S9 | nf_sfx_gate_bad | 손해 게이트 통과 | `quick descending warp tone, negative warning, 0.5s` |
| S10 | nf_sfx_pickup | 캡슐/파워 획득 | `short tech pickup blip, satisfying click and hum, 0.3s` |
| S11 | nf_sfx_evolve | 함선 진화 | `powerful transformation surge, rising metallic charge into a bright burst, heroic, 1.5s` |
| S12 | nf_sfx_demote | 강등 | `short power-down descending tone, warning, 0.8s` |
| S13 | nf_sfx_shield_on | 실드 획득 | `energy shield activation hum, protective, 0.5s` |
| S14 | nf_sfx_shield_pop | 실드로 피해 무효 | `energy shield deflection zap and shatter, 0.5s` |

### 피해/위협

| # | 파일명 | 상황 | 묘사 |
| --- | --- | --- | --- |
| S15 | nf_sfx_damage | 드론 손실(접촉/피격) | `dull metallic crunch impact with brief alarm undertone, 0.4s` |
| S16 | nf_sfx_telegraph | 적 발사 예고 | `short menacing charge-up beep, alien, 0.3s` |
| S17 | nf_sfx_boss_in | 보스 등장 | `massive alien horn roar with deep metallic rumble, intimidating, 2s` |
| S18 | nf_sfx_boss_die | 보스 격파 | `huge chain explosion with deep boom and debris, victorious, 2s` |

### UI

| # | 파일명 | 상황 | 묘사 |
| --- | --- | --- | --- |
| S19 | nf_sfx_click | 버튼 클릭 | `soft sci-fi interface click, 0.1s` |
| S20 | nf_sfx_buy | 격납고 구매 | `metallic upgrade clank with coin chime, satisfying, 0.6s` |
| S21 | nf_sfx_start | 출격 | `fleet launch swoosh with engine ignition, 1s` |

## 7. 납품·검수

- 폴더: `assets/sound/` 에 파일명 그대로.
- BGM 루프 검수법: 곡을 두 번 이어 붙여 들었을 때 이음새에서 박자·음이 튀지 않아야 함.
- 우선 납품 순서: ① M2(전투1) ② M5(보스) ③ M1(타이틀) ④ S7/S8/S11(도파민 3종) → 이후 나머지.
- 파일이 오면 개발 쪽에서 audio.js(로더+채널+스로틀+크로스페이드)와 이벤트 훅을 붙인다.
