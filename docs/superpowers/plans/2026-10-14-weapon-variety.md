# 무기 늘리기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 간결판(2026-10-14 — 이사님이 계획서 확인을 생략하고 바로 만들기로 결정, 작성자가 이 세션에서 직접 실행). 코드 전문은 각 커밋에 있다.

**Goal:** 새 무기 2종(유도 미사일 · 화염방사기)을 넣고, 24판 중 19판의 무기 통 종류를 바꿔 판마다 다른 무기를 만나게 한다.

**Architecture:** 무기 표(balance) → 수치·탄 생성(weapons) → 유도 조향(combat.moveBullets 직전) → 상한 계산(firepower, 유도 = 모두 맞음) → 그림·소리(render 코드 그림, audio 재사용) → 판 배치(stages 1~3 · courses 4~24, version +1).

**Tech Stack:** 바닐라 JS(ES 모듈) · Canvas 2D · node:test · Playwright(Python).

**Spec:** `docs/superpowers/specs/2026-10-14-weapon-variety-design.md`

## Global Constraints
- missile: rank 3 · interval 0.9 · dmg 3 · vz 650 · w 6 · color `#E86BFF` · 이름 `유도 미사일` · blastR 20 · blastDmg 1 · homing { turn 3.5, seekR 520, minFwd 0.35 }.
- flame: rank 2 · interval 0.25 · dmg 1 · vz 520 · w 22 · color `#FF4A2E` · 이름 `화염방사기` · range 400 · pierce 2(= 적 2마리까지 — 종전 관통 규칙: 맞힌 수가 pierce 가 되면 사라짐).
- 기존 6종 수치 불변 · 판 배치 최저 탄속(VZ_MIN = 650) 불변 · 무작위 없음.
- 판 배치표·version +1 대상 19판은 설계서 표 그대로. 랜덤 길 목록 불변.
- 보이는 글 한국어 · 파이썬 스크립트는 Write 로 · 파일 고치기는 LF 만(외톨이 CR 0) · 커밋 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
- 유도탄의 목표가 같은 STEP 에 죽었을 때 → 다음 STEP 에 다른 목표를 고르고, 목표가 없으면 곧게 난다(멈추거나 뒤로 돌지 않는다).
- 아레나(광장) 판의 조준탄(aimed)에도 유도가 함께 붙어도 사거리·소멸이 깨지지 않는다(유도탄은 range 없음).
- 화염방사기 탄이 게이트·통·벽에 닿으면 관통 없이 사라진다(관통은 적·보스만 — 종전 관통탄과 같다).
- 새 무기의 아이콘 이미지가 없어도 통·상단 칩이 오류 없이 그려진다(로켓·불꽃 폴백).
- 바뀐 판의 옛 기록이 지워지지 않고, 판 열림(해금)이 그대로다.

---

### Task 1: 무기 표 · 유도 규칙
**Files:** Modify `rush3/balance.js`(weapons) · `rush3/weapons.js`(weaponStats · makeBullet) · `rush3/combat.js`(steerHoming) · Test `tests/rush3-weapons2.test.mjs`(새)
**Produces:** `WEAPONS.missile` · `WEAPONS.flame` · weaponStats(...).homing = { turn, seekR, minFwd } | null · 유도탄 b.homing · b.spd · b.tid
- [ ] 검사 WPN2-1(표·수치) · WPN2-2(유도: 옆 적으로 휘어 맞힘 · 뒤로 안 돔 · 목표 사망 시 재선택 · 적 없으면 곧게 · 결정적) · WPN2-3(화염: 400 에서 소멸 · 적 2마리 · 게이트 +1) 먼저 쓰고 실패 확인
- [ ] 구현 → 통과 → 커밋

### Task 2: 상한 계산
**Files:** Modify `rush3/firepower.js`(bossDpsFor · bountyDamageFor) · Test 같은 파일에 WPN2-4
- [ ] 유도 무기는 맞는 발 수 = n × 발 수(보스·현상금 적) · 기존 무기 결과 불변 · 24판 보스 체력이 새 무기 때문에 오르지 않음(배치 전후 비교는 Task 4)
- [ ] 통과 → 커밋

### Task 3: 그림 · 소리
**Files:** Modify `rush3/render.js`(BULLET_LEN · drawMissile · drawFlameBlob · 아이콘 폴백 drawWeaponGlyph — 통·상단 칩) · `rush3/audio.js`(fire_missile · fire_flame) · Test `tests/rush3-bullets.test.mjs`(코드 그림 무기는 그림 키 예외) · WPN2-5(그리기 호출 오류 없음)
- [ ] 통과 → 커밋

### Task 4: 판 배치
**Files:** Modify `rush3/stages.js`(2·3판 무기·표지·안내 글·version) · `rush3/courses.js`(4~24판 중 17판 무기·표지·version) · 깨지는 기존 검사(판 내용 단정) 갱신 · V4-REAL 자료 다시 만들기(`node tests/lib/rush3-v4real.mjs --write`)
- [ ] WPN2-6: 판별 무기 목록 = 설계서 표 · 바뀐 판 version +1 · 표지 = 통 무기 · 보스 체력 상한 전후 비교(새 무기 탓 상승 없음)
- [ ] 전체 검사 통과 → 커밋

### Task 5: 확인 · 배포 · 기록
- [ ] `node --test tests/rush3-*.test.mjs` · `tests/rush-*.test.mjs` 통과
- [ ] 휴대폰 크기 캡처: `?dev=1&weapon=missile` · `flame`(탄 · 통 · 상단 칩) · 콘솔 오류 0
- [ ] `rush3/review.js` REVIEW_GAME_VER = 'r4.35' → 커밋 → `git push origin HEAD:master` → 실제 주소 확인
- [ ] CHANGELOG r4.35 · DESIGN 문단 · INBOX(10/14 지시) · BACKLOG · status_resume · 메모리
