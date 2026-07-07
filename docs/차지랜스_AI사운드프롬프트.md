# 차지 랜스 — AI 사운드 프롬프트 (선택 폴리시)

지금은 기존 효과음(단계상승=shield_on, 발사=laser)을 재사용합니다. 전용 사운드를 원하면 텍스트→오디오 AI(예: ElevenLabs SFX)로 아래 문구를 생성해 `assets/sound/`에 `nf_sfx_<이름>.ogg`로 넣어 주시면 `js/audio.js`에 연결하겠습니다. 없어도 완전히 작동합니다.

- **충전 단계 상승** (`charge_up`): `short rising energy whoosh, synth pitch climbing one step, sci-fi power-up tick, clean, 0.35s`
- **최대 충전 도달** (`charge_full`): `bright shimmering hum reaching a peak, electric charged loop settling, tense ready tone, 0.6s`
- **랜스 발사** (`lance_fire`): `massive sci-fi energy lance blast, deep bass punch with a searing beam sweep and crackle, powerful and satisfying, 0.9s`

> 단계별로 발사음을 다르게 하고 싶으면 `lance_fire_1/2/3`(1단 가늘게 → 3단 압도적으로)로 3종 만들어 주셔도 됩니다. 코드에서 단계에 맞춰 재생하겠습니다.
