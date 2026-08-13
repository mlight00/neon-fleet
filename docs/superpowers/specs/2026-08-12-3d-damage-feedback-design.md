# 3D 함미모드 — 적 피해 상태 표시 & 피탄 반응 (§G-39)

- **작성**: 2026-08-12 · **개정 v3**(Codex 재검수 7개 보완 반영) + **§12 최종 안전조건 4건**
- **상태**: **Codex 최종 승인** — v4 재설계 없이 §12 를 구현 계약으로 지켜 구현한다.
- **요청**: 이사님 실기 관측
  1. "2D에서는 적이 내 발사체에 맞았을 때 에너지바가 주는 것으로 적의 상태를 파악할 수 있는데 3D에서는 아무것도 알 수 없다"
  2. "내 발사체 중 레이저와 발칸은 적이 피탄된 반응이 거의 보여지지 않는다"
- **이사님 결정**: 모델 자체가 변하는 방식(3D 체력바 없음) · 번쩍 + 명중 불꽃 · 2D에도 함께 적용 ·
  대형 적의 단계 변화는 색으로 통합

---

## 0. v1 에서 내가 틀린 것 (정정)

Codex 검수가 세 가지를 잡았고 **전부 코드로 사실 확인했다.** 감추지 않고 먼저 적는다.

### 0-1. [치명] 정보 통로를 죽은 코드로 잡았다

v1 은 `buildSnapshot()` 에 `hpFrac` 을 추가하자고 했다. 그런데:

```text
chase3d-renderer.js:45   createChase3D → opts.hero 면 createHero3D
main.js:371              hero: !CHASE3D_TEST  → 정상 플레이는 **항상 hero**
chase3d-renderer.js:1068 createLegacy3D 시작
chase3d-renderer.js:1117 buildSnapshot 호출  ← **legacy 안이다**
```

**`buildSnapshot()` 은 legacy 렌더러 전용이다.** 실플레이는 이 함수를 부르지 않는다.
v1 대로 구현했으면 "테스트는 통과하는데 실게임에서는 색이 안 변한다"가 됐다 —
이번 회차들에서 반복해 겪은 실패 유형 그대로다.

### 0-2. [치명] `hitByBullet()` 호출 ≠ HP 감소

`affixes.js:88 affixAbsorb()` 는 보호막이 있으면 **HP를 깎기 전에 `true` 로 빠져나간다.**
`hitByBullet` 이 불렸다는 이유로 번쩍이면, 막힌 타격에도 본체가 맞은 것처럼 보인다.

### 0-3. [중대] 색 쓰기 실패 = 3D 전체 종료

v1 은 "색만 원본으로 돌아간다"고 적었다. 실제로는 `chase3d-renderer.js:901` 에서
`frame()` 내부 예외가 `degraded = true; available = false` 로 이어져
**그 세션의 3D 전체가 꺼지고 2D 로 고정된다.**

---

## 1. 진단 (실측)

두 문제는 뿌리가 하나다. **3D 레이어에 "적의 피해 상태"라는 정보 통로가 없다.**

| | 2D | 3D(hero) |
|---|---|---|
| 적 체력바 | 상시 표시 | 없음 |
| 발칸·레이저 피격 이펙트 | **원래 없음** | 없음 |
| 미사일 피격 이펙트 | 폭발 버스트 | 있음(2D 이펙트가 투영됨) |

근거:

- `main.js:3055` — production 적 버퍼 슬롯은 `{ sx, sy, px, wob }` 넷뿐. **hp 채널이 없다.**
- `main.js:2723` — `if (b.kind === 'homing') w.effects.burst(...)`.
  **미사일에만** 피격 이펙트가 걸려 있다. 발칸·레이저는 2D에서도 이펙트가 없고
  체력바가 줄어드는 것으로 읽혔다. 3D는 그 체력바마저 없어 단서가 0이 된다.

### 이미 있는 재료

- 인스턴스별 색상 채널 — 현재 `ebullet`(적탄)만 `colored: true`
- **2D 이펙트가 3D 추적 시점에도 투영된다** — `chase-render.js:107`
  `r.effects.drawWorldProjected(ctx, projector, ...)`
- `reducedMotion` 개념이 이미 있다(`camera-zoom.js` · `chase-camera.js` 인자)

### 타당성 실험 (게임과 같은 톤매핑 · 단독 씬)

| 지정 색 | 화면 RGB |
|---|---|
| (1, 1, 1) | 146, 146, 146 |
| (1, 0.42, 0.34) | 142, 86, 75 — 붉다 |
| (2.6, 2.6, 2.6) | 206, 206, 206 — 밝다 |

⚠️**이 실험은 기술 가능성만 보인다.** 실제 적 재질(GLB `Standard`+`emissiveMap`,
빌보드 `MeshBasicMaterial`)에서 같게 보인다는 증거가 아니다 — §5 에서 실측한다.

---

## 2. 정보 통로 — production hero 경로

```text
충돌 처리
  → 실효 피해(hpBefore − hpAfter) 확인 → 사이드카 기록

main.js draw 의 put3D()
  → entity.hp / entity.maxHp 읽기
  → 같은 프레임 시간으로 flash 계산
  → writeDamageColor(slot, hpFrac, flash, maxBoost)   ← 슬롯에 직접 쓴다(무할당)

hero placeSwarm()
  → 활성 인스턴스의 **모든 mesh 파트**에 setColorAt()
```

- 적 버퍼 슬롯 확장: `{ sx, sy, px, wob }` → `{ sx, sy, px, wob, cr, cg, cb }`
- `put3D()` 에서 채운다. ⚠️프레임 중 새 배열·새 `THREE.Color` 를 만들지 않는다(스크래치 재사용).
- `placeSwarm()` 은 `setRGB()` 로 쓴다. ⚠️`setHex()` 는 24비트 색이라 **1 초과 채널을 전달할 수 없다.**
- ⚠️적 GLB 한 개체는 **여러 InstancedMesh 파트**다. 같은 인스턴스 번호의 전 파트에 동일 색을 써야 한다.
  한 파트만 칠하면 몸통만 붉어진다.
- ⚠️`instanceColor` 는 첫 `setColorAt` 때 지연 할당된다. **렌더되는 활성 슬롯(`0..count-1`)은
  첫 draw 전에 유효한 색을 가져야 한다.** 비활성 슬롯 사전 초기화는 필수가 아니라 선택
  (비동기 GLB attach 시점과 초기화 비용을 보고 정한다).

**`buildSnapshot()` 은 이번 작업의 대상이 아니다.** legacy 화면까지 같은 효과가 필요하다는
별도 요구가 생길 때만 확장한다. production 기능의 근거로 쓰지 않는다.

⚠️`put3D()` 는 `e.affixes.length` 가 있으면 2D 로 남긴다(변이 적). 이 적은 3D 색 대상이 아니다 —
2D 경로의 피격 표시로 커버된다.

---

## 3. 실효 피해 기준

**HP가 실제로 줄었을 때만** HP 피격으로 기록한다.

```js
const hpBefore = target.hp;
target.hitByBullet(dmg, world, ctx);
const effective = Math.max(0, hpBefore - target.hp);
```

| 상황 | HP 색 | 몸체 번쩍 | 별도 효과 |
|---|---|---|---|
| 실제 HP 감소 | 적용 | 적용 | 무기별 명중 불꽃 |
| 보호막·affix 전부 흡수 | 없음 | 없음 | **기존 보호막 링·버스트 유지**(`affixes.js:92-93`) |
| 감소 후 일부만 적용 | 적용 | 적용 | 보호막 효과 병행 |
| 무적·클램프로 0 피해 | 없음 | 없음 | — |
| Debris(파괴 불가) | 대상 아님 | 없음 | 기존 스파크 유지 |
| 사망 타격 | 다음 프레임 없음 | 불필요 | 사망 폭발이 전달 |

### 빠뜨리면 안 되는 피해 경로

일반 탄 / 보스 탄 / 관통 레이저 / 랜스 원본 / 랜스 메아리 / 시즈 폭발 / 연쇄 폭발 / APEX.

각 지점에 손으로 `noteHit()` 를 흩뿌리면 다시 누락된다. **단일 helper 를 통과하도록 하고
테스트로 강제한다**(§6-3).

⚠️게임 판정 함수가 렌더 상수를 읽지 않는다. **피해 결과를 관찰해 사이드카에 적는 단방향**이다.

### 시간축 계약

`recordDamageFeedback(entity, x, y, now, effective, sourceKind)` /
`readDamageFlash(entity, now)` 는 **같은 시간축**을 쓴다.

**현재 구조에는 공유 시간축이 없다**(Codex v2 §5, 코드 확인):

```text
main.js:3603  frame(t)      ← 절대 시각은 여기만 갖고 있다
main.js:2407  update(dt)    ← dt 만 받는다 (충돌·피해 기록이 여기서 난다)
main.js:3180  draw()        ← 인자 없음
main.js:3306  const _now = performance.now()   ← draw 안의 지역변수
```

### 확정: **게임 누적 시간**을 공유한다

```text
frame(t)  →  feedbackNow += dt        (게임이 진행한 만큼만 증가)
          →  update(dt, feedbackNow)
          →  draw(feedbackNow)
```

- 벽시계(`t`·`performance.now()`)가 **아니라** dt 누적이다.
- 내부에서 `performance.now()` 를 읽지 않는다. 테스트는 시간을 인자로 주입한다.

### 일시정지 정책 — **플래시 수명도 멈춘다**

일시정지 중 루프는 update 를 건너뛰고 draw 만 돈다. 누적 시간을 쓰면 `feedbackNow` 가
증가하지 않으므로 **플래시가 정지 화면에 그대로 멈춘다.**

⚠️벽시계를 썼다면 일시정지 화면에서 플래시가 혼자 사라진다 — 정지했는데 화면이 변하는 것은
"멈췄다"는 약속을 깬다. 그래서 누적 시간을 고른다. 이 동작을 테스트로 잠근다.

---

## 4. 색 규칙 — 순수 함수

- **체력**: 1 → (1,1,1) 원본. 낮아질수록 green·blue 감쇠 → 붉게.
  ⚠️0.66 이하부터 본격적으로 붙인다 — 초반부터 붉으면 적이 몰릴 때 화면이 붉어진다.
- **번쩍**: flash 1 → 전 채널 배수. 0 → 영향 없음.
- 두 효과는 **곱해 합성**한다. 반쯤 죽은 적이 맞으면 "붉은 채로 번쩍"이어야 한다.
  ⚠️ACES 는 채널별로 압축하므로 저체력 붉은 색에 큰 배수를 곱하면 회색으로 뭉갤 수 있다 —
  §5 실측에서 확인하고, 안 되면 번쩍을 별도 수단으로 분리한다.

### API — 프레임 무할당

```js
writeDamageColor(slot, hpFrac, flash, maxBoost)   // slot.cr/cg/cb 에 직접 쓴다
```

⚠️`damageColor(...) → { r, g, b }` 처럼 **새 객체를 반환하지 않는다.** 적 수만큼 매 프레임
임시 객체가 생겨 "프레임 중 무할당" 계약과 정면으로 충돌한다(Codex v2 §4).
호출자가 준 슬롯(또는 스크래치)에 직접 쓴다.

### 접근성·연사 보호 — 확정 수치

| 항목 | 값 | 근거 |
|---|---|---|
| 플래시 유지 시간 | **0.10초** | 짧아야 연사에서 개별 타격으로 읽힌다 |
| 같은 대상 재발동 최소 간격 | **0.34초** | **초당 3회 이하** — 광과민 안전 기준(WCAG 3회/초) |
| 일반 최대 밝기 배수 | **2.4×** | 실측 2.6× → 화면 +41%. 그보다 약간 아래 |
| reduced-motion 최대 밝기 | **1.4×** | 끄지 않고 약하게 — 정보는 남긴다 |
| 밝기 곡선 | 0.10초 동안 선형 감쇠 | 계산이 단순하고 테스트로 잠그기 쉽다 |

⚠️0.10초 켜짐 + 0.24초 꺼짐 = **약 3Hz 맥동**. 발칸을 계속 퍼부어도 "계속 하얀 적"이 되지 않고
"맞고 있는 중"으로 읽힌다. 재발동 간격을 줄이면 스트로브가 되어 광과민 위험이 생긴다.

⚠️`reducedMotion` 은 **프레임당 한 번** 계산해 `put3D()`·색 함수에 넘긴다.
적마다 `matchMedia()` 를 부르지 않는다(Codex v2 §4).

순수 함수이므로 값 격자를 테스트로 잠근다. ⚠️밸런스·충돌 모듈은 이 함수를 읽지 않는다.

---

## 5. 실제 재질 실측 (구현 전 게이트)

단독 씬 실험은 근거로 쓰지 않는다. **실제 production 렌더러 + 실제 자산**으로 캡처한다.

```text
재질:  GLB(Standard + emissiveMap, emissive 0x2e2e2e) / 빌보드(MeshBasicMaterial, 조명 무시)
HP:    100% / 66% / 33% / 10%
flash: 0 / 최대
배경:  밝은 구간 / 어두운 구간
모델:  단일 파트 / 다중 파트
거리:  가까운 적 / 먼 적
```

육안 판정 항목:

- 적 종류를 여전히 구별할 수 있는가
- 저체력이 거리 변화 중에도 읽히는가
- 저체력 적이 맞을 때 플래시가 회색으로 뭉개지지 않는가
- emissive 파트와 비발광 파트가 따로 놀지 않는가
- 빌보드와 GLB 의 피드백 강도가 과도하게 다르지 않은가

⚠️**한 채널로 두 효과가 안 되면** HP 틴트는 `instanceColor`, 순간 명중은 별도 impact
스프라이트/오버레이로 분리한다. 이 분기를 미리 허용한다.

산출물은 `docs/qa/g39/` 에 URL·뷰포트·설정과 함께 저장한다.

---

## 6. 명중 불꽃과 성능 상한

### 6-1. 현재 상태

`createEffects()`(entities.js) 의 `parts.push` 에 **전역 상한이 없다.** 각 입자는 약 0.5초 산다.
발칸은 고연사, 레이저는 한 발이 여러 적을 관통하므로 모든 적중에 입자를 만들면
① 객체 생성 ② 매 update 계산 ③ 3D 에서 각 입자의 2.5D 투영 ④ Canvas2D 개별 draw 가 겹친다.

v1 의 "적탄이 매 프레임 하는 방식과 동일"은 **색 버퍼 비용만** 다뤘다. 파티클 비용을 포함하지 않았다.

### 6-2. 성능 계약 (설계 수치로 명시)

| 무기 | 기본 효과 | 제한 |
|---|---|---|
| 발칸 | 작은 스파크 1~2개 | 같은 대상 재발동 최소 간격 |
| 레이저 | 얇고 밝은 스파크 1~2개 | 프레임당 대표 적중 수 제한 |
| 미사일 | **현행 폭발 유지** | 중복 폭발 금지 |
| 랜스·메아리 | 경로 연출 유지 | 적마다 큰 burst 금지 |
| 시즈 | 현행 범위 폭발 유지 | 범위 내 전원에 추가 burst 금지 |

### 확정 수치

| 항목 | 값 |
|---|---|
| 발칸 한 적중당 입자 | **2개** |
| 레이저 한 적중당 입자 | **2개** |
| 미사일 | **현행 8개 유지**(변경 없음) |
| 같은 대상 스파크 재생성 최소 간격 | **0.34초**(플래시와 동일 — 한 판정으로 묶는다) |
| 프레임당 신규 hit-spark 상한 | **24개** |
| 동시 활성 hit-spark 상한 | **120개** |
| 전체 effects `parts` 안전 상한 | **600개** |

입자 수명은 기존과 같은 0.5초다. 최악 가정(활성 120 × 0.5초)에서 hit-spark 는
전체 상한의 20% 만 쓴다 — 나머지는 기존 연출 몫이다.

### 우선순위 — hit-spark 가 중요 연출을 밀어내면 안 된다

`parts` 에는 피격 스파크뿐 아니라 **보스 폭발·진화·보상 연출**도 함께 들어간다.
단순 hard cap 에서 오래된 것을 무조건 지우면 보스 폭발이 발칸 스파크에 밀려 사라진다.

```text
높음   보스·진화·보상 연출   → 예약 슬롯. 밀려나지 않는다
중간   일반 폭발·사망         → 통상 예산
낮음   hit-spark             → 상한 도달 시 **신규 생략**(기존 입자를 지우지 않는다)
전체   parts 600             → 최후 안전선
```

⚠️**cap 도달 시 정책 = 신규 생략.** 오래된 입자를 지우는 방식은 쓰지 않는다 —
중요한 연출이 조용히 사라지는 쪽이 훨씬 나쁘다.

⚠️무기 분류는 `b.kind` 하나에 의존하지 않는다. `sourceWeaponId`·진화형·lance/echo/siege 문맥을
함께 정규화한다.

### 6-3. 적용 지점 — **두 분기가 같은 helper 를 쓴다**

⚠️v2 의 "한 곳만 고치면 된다"는 **부정확했다**(Codex v2 §7). 실제로 탄–표적 충돌은 두 갈래다:

```text
main.js:2685  r.phase === 'boss' → r.bosses 루프    ← 보스 분기
main.js:2705  w.entities 루프                        ← 일반 적 분기
```

일반 적 분기만 고치면 **보스를 맞힌 발칸·레이저의 불꽃이 빠진다.** v3 적용 범위는 보스의
피격 번쩍·명중 불꽃을 포함하므로 두 분기가 같은 helper 를 부른다.

```js
emitProjectileImpactFeedback(target, projectile, hitX, hitY, effective, world, now)
```

⭐**두 분기 모두 이미 `hpBefore` 를 계산하고 있다**(`tallyBulletDamage` 용) — 실효 피해 재료가
이미 그 자리에 있으므로 새 계산을 만들지 않는다.

helper 보장 사항:

- `effective > 0` 또는 명시적으로 허용한 `blocked` 종류만 처리
- `sourceWeaponId`·`kind`·진화형을 정규화
- 미사일 현행 폭발과 **중복 생성 금지**
- 레이저 관통의 프레임당 예산 적용 · 발칸의 같은 대상 쿨다운 적용
- 2D effects 에 **한 번만** 생성 — 3D 전용 불꽃을 따로 만들지 않는다

랜스·메아리·시즈는 기존 경로·범위 연출을 유지하되, **몸체 플래시 기록만** 공통 helper 를 쓴다.

2D 이펙트가 3D 로 투영되므로 helper 한 번 호출이 두 모드를 덮는다.

---

## 6-4. 2D 몸체 플래시 — draw 경로 확정

⚠️엔티티 클래스마다 손대지 않는다. **공통 경계 두 곳**에서 처리한다(Codex v2 §3, 코드 확인):

```text
main.js:2992  drawEntityFaded(ctx, e)   ← 전술 화면·2.5D 투영 화면이 모두 경유
main.js:2997  drawBossFaded(ctx, b)
```

두 함수는 이미 상단 진입 페이드를 위해 `ctx.save() → globalAlpha = a → e.draw() → restore()`
구조를 갖고 있다. 여기에 플래시를 얹는다.

### 합성 방식 — **제한된 additive 재그리기**

```text
1. 본체를 평소대로 그린다                      (기존 동작 그대로)
2. flash > 0 이면  save()
3.   globalCompositeOperation = 'lighter'
4.   globalAlpha = fadeAlpha × flashStrength   ← 페이드와 **곱한다**
5.   같은 본체를 한 번 더 그린다                (스프라이트의 알파 안에서만 밝아진다)
6. restore()
```

- **왜 재그리기인가**: `source-atop` 이나 전체 사각형 덮기는 **이미 그려진 다른 개체·배경까지**
  영향을 준다. 본체를 자기 알파로 한 번 더 그리면 그 개체 픽셀에만 더해진다.
- **절차 생성 폴백에서도 안전**하다 — `e.draw()` 를 그대로 재사용하므로 스프라이트든
  코드 도형이든 같은 방식이 먹는다.
- **페이드와의 순서**: 곱한다. 화면 위로 절반만 들어온 적이 전체 밝기로 번쩍이면 안 된다.
- **비용**: 플래시 중인 개체당 draw 1회 추가. 재발동 간격 0.34초라 동시 발광 개체 수가 제한된다.

### 지켜야 할 계약

- 모든 합성 상태 변경은 `save()/restore()` 안에서만 한다.
  ⚠️`globalCompositeOperation`·`filter`·`globalAlpha` 가 **다음 개체와 HUD 로 새면 안 된다.**
- hero 3D 로 올라가 `skipEntity` 된 적은 2D 몸체 플래시를 **다시 그리지 않는다**(이중 표시 금지).
- 2D 명중 불꽃은 공용 effects 에 **한 번만** 생성한다(3D 전용 불꽃 별도 생성 금지).
- 일반 적과 보스가 **같은 wrapper** 를 쓴다.

---

## 7. 국소 폴백

색 쓰기 실패가 **3D 전체를 죽이면 안 된다**(현재는 죽는다 — §0-3).

1. 스웜 준비 단계에서 instance color 기능을 **probe** 하고, 실패한 스웜은 `colored=false` 고정
2. 색 갱신을 국소적으로 격리 — 실패 시 그 스웜의 **색 기능만** 끄고 모델은 유지
3. `setColorAt` 지원과 `instanceColor` 할당을 확인한 뒤에만 매 프레임 갱신

검증을 두 종류로 분리한다:

- **배선 회귀**: 정상 환경에서 색 기능을 제거하면 **실패해야** 한다
- **장애 허용**: capability 없음·색 쓰기 실패에도 hero 3D 는 **유지**되고 적은 원래 색으로 보인다

---

## 8. 적용 범위 (확정)

| 대상 | HP 색 틴트 | 피격 번쩍 | 명중 불꽃 |
|---|---|---|---|
| 일반 파괴 가능 적 | ○ | ○ | ○ |
| 운석(Meteor, 파괴 가능) | ○ | ○ | ○ |
| 잔해(Debris, 파괴 불가) | ✗ | ✗ | 기존 스파크 유지 |
| 변이(affix) 적 | 2D 유지(put3D 제외) | 2D 경로 | ○ |
| 보스 | **1차 보류** | ○ | ○ |

### 2D 체력바 — **유지한다**

이사님 제기는 "3D 에 정보가 없다"였다. 2D 체력바는 **이미 작동하는 정보 수단**이므로
없애지 않는다. 2D 에는 **피격 번쩍과 명중 불꽃만 추가**한다.

### 대형 적 3단계 스프라이트 — 논점이 없다 (코드로 확인)

```js
const gem = getSprite('B3');          // 대형
let key = ...;                         // large0/1/2
blit(ctx, gem || getSwarmSprite(key), ...)   // ← gem 이 없을 때만 key 사용
```

`large0/1/2` 는 `getSwarmSprite()` = **절차 생성 폴백**이고, `gem`(B3)이 없을 때만 쓰인다.
B3 는 선로딩 대상이고 경로도 있으므로 **정상 플레이에서는 이 3단계가 실행되지 않는다.**
→ 지킬 실루엣 정보가 애초에 없다. 폴백 경로는 그대로 둔다(아트 로드 실패 시 보험).

### 보스 — 지속 HP 틴트는 1차 보류

보스는 HUD 에 HP 바·숫자가 이미 있고, STAGGER/BREAK·보호막·페이즈 고유 색 연출이 있다.
전부 붉게 만들면 고유 상태색과 충돌한다.
→ **1차는 피격 번쩍·명중 불꽃만.** 지속 틴트는 실기 QA 뒤 별도 결정.

---

## 9. 검증 게이트

| # | 항목 | 방법 |
|---|---|---|
| 9-1 | 순수 단위 | `damageColor` HP×flash 격자 · `hpFrac` clamp · maxHp 없음 · flash 시작/중간/끝 · 실효피해 0이면 기록 없음 · Debris 제외 |
| 9-2 | **production hero 배선** | 아래 §9-2 seam 참조 |
| 9-3 | 피해 경로 | 일반탄/보스탄/관통/lance/echo/siege/연쇄/APEX 각각 — HP 감소 시에만 기록. 반대 사례로 보호막 완전흡수·0피해·Debris |
| 9-4 | 실제 WebGL 시각 | §5 격자 캡처 → `docs/qa/g39/` |
| 9-5 | 성능 | 2D·3D before/after · 최대 적 밀집+발칸 연사 · 관통 다중적중 · 활성 파티클 최고치 · frame time · 저사양 프로필. **색 버퍼 비용과 파티클 비용을 분리 보고** |
| 9-6 | 폴백 | 색 배선 제거 → 실패 / capability 없음 → 원래 색·3D 유지 / `setColorAt` 장애 주입 → 색만 비활성·degraded 금지 / 빌보드 폴백에서도 안전 |
| 9-7 | 2D 회귀 | 체력바 유지 확인 · Canvas 상태 오염 없음(`save/restore`) · **같은 타격이 2D·3D 중복 불꽃으로 안 보임** |

### 9-2. hero 적 스모크를 실행할 seam

현재 `tests/g35-frame-smoke.test.mjs` 가 주입할 수 있는 것은 `WebGLRenderer` 한 겹뿐이다.
적 스웜은 `loadEnemyGlbParts()` 로 **비동기 로드**되고, Node headless 에서는 상대 asset URL 과
TextureLoader 를 그대로 준비하기 어렵다. meshes 가 비면 `ready.enemy()` 가 거짓이라
main 이 적을 3D 버퍼에 넣지 않는다 — 기존 스모크가 발사체만 넣는 이유가 이것이다.

**확정: 얇은 enemy-parts factory 를 주입한다**(Codex 권장 2번).

```text
createChase3D(canvas, { hero: true, createRenderer, createEnemyParts })
                                                   ↑ 테스트만 주입
```

- `createEnemyParts` 는 **실제 THREE** 의 간단한 geometry/material 을 돌려준다.
  `InstancedMesh`·`Color`·`Matrix4`·`setColorAt()` 은 전부 진짜 라이브러리를 쓴다.
- **다중 파트 검증용으로 파트 2개**를 돌려주는 변형을 함께 제공한다.

검증 항목:

- 적 1기 이상이 실제로 배치된다(`b1Count >= 1`)
- HP 100% 와 저체력의 `instanceColor` 값이 **다르다**
- 피격 직후와 0.10초 뒤의 값이 **다르다**
- **같은 인스턴스 번호의 전 파트 색이 같다**
- `instanceColor` 가 실제로 생성되고 `needsUpdate` 가 섰다
- `renderer.render()` 까지 도달했다

⚠️금지: THREE 전체 mock · meshes 가 빈 채로 "예외 없음"만 확인 · 소스에서 `setColorAt`
문자열 존재 여부만 확인 · legacy `buildSnapshot()` 테스트를 배선 근거로 사용.

⚠️실제 GLB 재질·emissiveMap·톤매핑 결과는 headless 로 증명하지 않는다 —
**브라우저 WebGL 게이트(§5)** 가 담당한다. 두 게이트의 책임을 섞지 않는다.

⚠️legacy `buildSnapshot()` 테스트는 production 배선 근거로 인정하지 않는다.

---

## 10. 하지 않는 것

- 3D 체력바·숫자 등 UI 요소 (이사님 결정)
- 피격 반동/넉백 연출 (선택지에서 제외)
- 2D 체력바 제거 (별도 제품 변경 — 명시 승인 없이 하지 않는다)
- 보스 지속 HP 틴트 (1차 보류)
- `buildSnapshot()`/legacy 렌더러 확장

## 11. 위험

- **번쩍이 약할 수 있다.** 톤매핑이 1 초과를 눌러 2.6배가 화면상 1.41배였다.
  → §5 실측 후 조정. 부족하면 불꽃 쪽을 키우거나 별도 오버레이로 분리.
- **저체력 붉은 색 + 큰 배수 = 회색 뭉개짐** 가능. §5 에서 확인.
- **적 밀집 시 붉은 화면.** 곡선을 0.66 이하부터 붙여 완화.
- **다중 파트 모델**에서 한 파트만 칠하는 실수 → 9-2 로 잠근다.
- **파티클 비용**이 저사양에서 체감될 수 있다 → 상한과 9-5 측정으로 관리.


---

## 12. 최종 안전조건 (Codex v3 검수 — 구현 계약)

설계를 다시 뒤집는 문제가 아니라 **실제 코드에서만 드러나는 경계조건**이다. 넷 다 코드로 확인했다.

### 12-1. [치명] hit-spark 가 전역 `Math.random()` 을 쓰면 **전투 결과가 바뀐다**

```js
// entities.js:44-48  burst() — 입자 1개당 Math.random() 3회
const a = Math.random() * Math.PI * 2;
const v = speed * (0.4 + Math.random() * 0.6);
parts.push({ ..., size: 2 + Math.random() * 3 });

// entities.js:910, 956  — **같은 전역 RNG** 로 치명타를 판정한다
const crit = (d) => (critP && Math.random() < critP ? d * (mfx.critMult || 2) : d) * phaseMul;
```

발칸·레이저 적중마다 `burst()` 를 추가로 부르면 **난수 순서가 밀려** 이후 치명타·분산·스폰이
달라진다. 분포가 같아도 **같은 입력에서 같은 결과가 안 나온다** — 렌더 전용 경계가 깨진다.

**계약**: 신규 hit-spark 는 전역 RNG 를 **한 번도** 소비하지 않는다.

```text
effects.hitSpark(x, y, color, count, speed, visualSeed)   ← 전용 visual RNG(LCG)
```

- 발칸·레이저 신규 스파크는 `hitSpark()` 만 쓴다.
- **미사일 폭발은 현행 `burst()` 를 정확히 한 번 유지**한다 — helper 통합 때문에 두 번 불리거나
  RNG 호출 수가 늘면 안 된다.
- 기존 `burst()` 의 RNG 는 이번 범위에서 건드리지 않는다(신규 소비부터 차단).

**테스트**: 전역 `Math.random` 을 감싸 호출 횟수를 세고, hit-spark 생성 전후로 **증가가 0** 인지
확인한다. hit-spark ON/OFF 에서 HP·피해·치명타·스폰 상태가 동일한지 비교한다.
visual RNG 는 같은 seed 에서 같은 배치를 내는지 단위 테스트한다.

### 12-2. [치명] `e.draw()` 전체 재호출은 **체력바까지 번쩍인다**

적 `draw()` 는 몸체만 그리지 않는다:

| 클래스 | draw() 가 함께 그리는 것 |
|---|---|
| `Creature` (2663-2692) | 몸체 + **HP 바** + affix 표식 |
| `Bomber` (3708-3713) | 몸체 + 사격 예고 + HP + affix |
| `Zapper` (3732-3737) | 몸체 + **충전 예고선** + HP + affix |
| `Shielder` (3777-3782) | 몸체 + **보호막 호** + HP + affix |

§6-4 문구대로 `e.draw()` 를 그대로 재호출하면 **체력바·보호막·예고선까지 밝아진다.**
"몸체 플래시"라는 계약과 출력이 달라지고, 체력 판독이 순간 왜곡된다.

**계약**: 두 번째 pass 에 **body clip** 을 건다.

```text
1. e.draw()  평소대로 한 번           (기존 동작 불변)
2. flash > 0 이면 save()
3.   중심·hit radius 기준 body clip    ← HP 바·외부 예고선·큰 링을 배제
4.   lighter + fadeAlpha × flashStrength
5.   e.draw() 재호출
6. restore()
```

- 실루엣이 `r` 보다 큰 종은 렌더 전용 선택값 `damageFlashRadius` 를 허용한다.
- ⚠️**모든 적 클래스를 `drawBody()/drawOverlay()` 로 분해하지 않는다.** clip 으로 범위를 제한하고
  픽셀 회귀로 확인한다. 공통 clip 으로 몸체가 잘리는 종만 개별 `drawDamageBody()` 를 추가한다.

**테스트·QA**: flash 전후 **HP 바 픽셀 불변** · Shielder 보호막 호 · Zapper 충전선 ·
Bomber telegraph · affix 링이 함께 밝아지지 않음 · 진입 fade 중 flash 가 fade 를 넘지 않음 ·
`globalCompositeOperation`·`globalAlpha`·clip 이 다음 개체와 HUD 로 새지 않음.

### 12-3. [중대] `feedbackNow` 증가 위치 — **update guard 안이어야 한다**

```js
// main.js:3616  — pause 중 update 만 건너뛰고 draw 는 계속 돈다
if (!paused && !drafting && !betweenStages) update(dt);
draw();
```

§3 다이어그램처럼 `frame()` 상단에서 더하면 **일시정지 중에도 rAF·dt 가 계속 와서 시간이 흐른다.**
"플래시 수명도 멈춘다"는 정책과 정반대가 된다.

**계약**: 시간 증가를 실제 update guard **안에** 둔다.

```text
if (state === 'play' && !paused && !drafting && !betweenStages) {
  feedbackNow += dt;
  update(dt, feedbackNow);
}
draw(feedbackNow);
```

제목·맵·결과화면·일시정지·드래프트·스테이지 요약 중에는 증가하지 않는다.

**테스트**: 정상 0.05초 → +0.05 · pause 1초 여러 프레임 → 불변 · drafting/betweenStages/state≠play
→ 불변 · pause 해제 후 1프레임 → dt 만큼 재개 · pause 중 draw 반복해도 flash 값 동일.

### 12-4. [중대] 예약 슬롯을 **숫자로** 나눈다

v3 는 "보스·진화·보상은 예약 슬롯"이라고만 적었다. 그러면 `parts` 가 이미 600이면
**새 보스 폭발도 "신규 생략" 대상**이 되어 계약과 충돌한다.

**계약 — 초기 partition**:

```text
전체 parts 안전 상한        600
├ 낮음·보통 사용선          480
│   └ hit-spark 별도 상한   120
└ 높은 우선순위 예약        120
```

집행 규칙:

- hit-spark 는 **120 또는 일반 pool 480** 중 하나에 닿으면 신규 생략
- 일반 폭발은 일반 pool 범위에서 생성
- 보스·진화·보상은 **예약 120** 을 쓸 수 있다
- 높은 우선순위가 자기 예약까지 다 쓴 뒤에만 신규 생략
- ⚠️**낮은 우선순위가 예약을 선점하지 못한다**
- ⚠️**hit-spark 때문에 기존 입자를 제거하지 않는다**

API 구분(현재 `burst()` 에는 우선순위 인자가 없다):

```text
burst(..., { priority: 'high' | 'normal', kind })
hitSpark(...)                                  ← 항상 낮은 우선순위
```

**테스트**: hit-spark 120 도달 → 신규 생략 · 일반 pool 480 도달 → 정책 확인 ·
일반이 가득 차도 high 는 예약에서 생성 · total 600 초과 없음 ·
high 예약이 low 에 소비되지 않음 · cap 상황에서 기존 보스·진화 입자 제거 없음.

### 12-5. [경미] `instanceColor` 검증은 `version` 으로

`BufferAttribute.needsUpdate` 는 저장 필드가 아니라 **`true` 대입 시 내부 `version` 을 올리는
setter** 다. `needsUpdate === true` 를 읽으면 거짓 통과·거짓 실패가 난다.

**계약**: `instanceColor` 가 실제 생성되고, 색 갱신 **전후 `version` 이 증가**했는지 비교한다.

---

## 13. 완료보고서 필수 산출물 (Codex 지정)

- 전체 자동 테스트 결과
- 실제 hero frame 적 `instanceColor` 실행 테스트
- **전역 RNG 비소비** 테스트
- **pause 중 feedback clock 정지** 테스트
- 2D HP 바·Shielder·Zapper·affix flash **회귀 캡처**
- GLB/빌보드 HP×flash **WebGL 캡처**
- 다중 GLB 파트 **동일 색 증거**
- hit-spark / 일반 / high priority **cap 테스트**
- 색 기능 **장애 주입** 후 hero 3D 유지 결과
- 저사양 2D·3D **before/after frame time** 과 활성 파티클 최고치
- `docs/qa/g39/` 산출물 목록
