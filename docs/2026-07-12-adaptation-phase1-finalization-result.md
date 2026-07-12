# NEON ADAPTATION Phase 1 — 마감(Finalization) 작업 결과

**날짜**: 2026-07-12
**작업 지시서**: `docs/2026-07-12-adaptation-phase1-finalization-work-order.md`
**범위**: 신규 시스템 추가 없음. 남은 3개 지적(패러사이트 방어 순수화 · 실제 클래스 회귀 테스트 · 문서 정합)만 마감. DPS/승격·강등/저장 스키마/청크 등은 손대지 않음(지시서 §0·§7 준수).

---

## 커밋 1 (FIN1) — 패러사이트 방어를 순수 함수로 확정

### 무엇을
게이트 패러사이트의 방어 외피를 **순수 함수 `parasiteDamageMult(ctx, armorReduce)`** 로 분리하고, 인라인 하드코딩(0.4)을 제거했다.

```js
// js/adaptive-logic.js
export function parasiteDamageMult(ctx, armorReduce) {
  const pierces = !!(ctx && ctx.lance && ctx.pierceDefense);   // 랜스 강습 3단+ 차지 랜스만
  return pierces ? 1 : 1 - Math.min(0.70, armorReduce || 0);   // 완전 면역 금지(70% 상한)
}
```

- `balance.js`: `gateParasite.armorReduce = 0.35` → **일반 공격은 65%만 적중**, 랜스 강습 3단+ 차지 랜스만 전액(관통).
- `GateParasite.hitByBullet(dmg, world, ctx)`: `if (this.dead) return;`(중복 처리 차단) → 배수 계산 → 관통 시 흰색 파열 이펙트 → `hp -= dmg*mult`.
- **완전 면역 없음**: 상한 0.70이라 어떤 값을 줘도 최소 30% 피해는 들어간다. 일반 공격만으로도 처치 가능(단, 관통보다 오래 걸림).

### 근거
"게이트를 통과당하면 손해"라는 위협을 유지하되, 특정 무기(랜스 강습)를 갖추면 즉시 무력화할 수 있는 **수단 전환 압박**을 만든다. 완전 면역이면 랜스 없는 빌드가 막히므로 상한을 뒀다.

---

## 커밋 2 (FIN2) — 실제 클래스 통합 회귀 테스트

### 핵심 전환: "node에서 못 한다"는 초판 주장은 틀렸다
초판 결과서는 스캐빈저 상태머신·게이트 부모자식 정리를 "DOM 의존이라 node 단위테스트 불가"로 적었다. **이는 사실이 아니었다.** 렌더/오디오/스프라이트가 전부 런타임 지연 로딩이라 node에서 모듈 임포트가 되고, 최소 world 스텁만 있으면 **실제 클래스**를 그대로 구동해 검증할 수 있다. 지시서가 요구한 "계산식만 복사한 가짜 테스트 금지"를 이 방식으로 충족했다.

### `tests/adaptive-enemies.test.mjs` (신규, 실제 클래스 사용)
최소 world 스텁 + 진짜 `Crystal / DronePod / Scavenger / GateParasite / GatePair`:

- **스캐빈저**: Crystal(100) 실수령 32 저장(원시 100 아님) · podRewardMult·군체 배수가 Crystal·DronePod에 동일 적용 · 처치 시 48(32×1.5) 1회 지급 · 중복 처치해도 한 번만 · 미강탈 처치는 코인만 · 보상 들고 화면 밖 도주 시 미지급 · 두 스캐빈저 동시 예약 차단(claimedBy) · 예약자 사망 시 예약 해제.
- **패러사이트/감염 게이트**: 생성 시 지정 레인 `corruptSide` 설정 · 생존 통과 시 연산 반전(×2→/2) · 처치 시 corruptSide null + 정화 10드론 1회 · 정화 후 통과는 원래 연산(×2→200) · 비감염 반대 레인은 원래 연산 유지(+40) · 부모 게이트 applied/dead면 자식이 다음 update에서 정리(보상 없음).

### `tests/bosses-import.test.mjs` (신규)
`entities.js`에서 재export한 `Boss`와 `bosses.js`에서 직접 import한 `Boss`가 **동일 클래스**임을 검증(순환 import 안전성 회귀 방지) + `new Boss` 기본값(dead=false, hp=maxHp, pattern·spriteId 존재).

### 결과
**총 106개 테스트 통과** (초판 88 → 마감 106, +18: 통합 14 + 보스 import 2 + parasiteDamageMult 관련 순수 테스트).

---

## 커밋 3 (FIN3) — 문서·주석 정합

| 위치 | 이전 | 이후 |
| --- | --- | --- |
| `main.js` 신규 적 주석 | "고정 스탯" | "완만한 스테이지 HP 스케일" (실제 `stageScale` 적용 반영) |
| `adaptive-enemies.js` 상단 주석 | `bullet=null` (탄환 전용) | `ctx=null` 계약 명시(탄환{x} \| 랜스{lance,pierceDefense} \| null) |
| `README.md` 패러사이트 | "일반 공격 40% 감소" | "35% 감소(65%만 적중), 랜스 강습 3단+만 무시, 일반 공격만으로도 처치 가능" |
| 초판 결과서 테스트 수 | "총 88개" + "node 불가" | "총 106개" + "실제 클래스로 node 검증 완료" 정정 |

---

## 검증 (지시서 §11)

- ✅ `node --test`: **106 passed / 0 failed**
- ✅ `node --check` 전체 JS·테스트: 문법 오류 없음
- ✅ `git diff --check`: 공백 오류 없음
- ✅ 모듈 임포트 스모크: `import('./js/entities.js') → typeof Boss === "function"`
- ✅ 브라우저(데스크톱 1280×720): 타이틀 UI 전체 정상, 콘솔 **에러·경고 0**, 180프레임 헤드리스 구동 무에러, `GateParasite.corruptSide='right'` · `Boss`(spriteId B7, hp 3500) · `Scavenger`(hp 35) 실제 인스턴스화 정상
- ✅ 브라우저(모바일 390×844): 가로 오버플로 없음(scrollWidth=390), 출격→플레이 60프레임 무에러
- 참고: 프리뷰 스크린샷 캡처는 무거운 캔버스 rAF로 타임아웃(비활성 탭 rAF 정지 아티팩트) → 텍스트 기반 도구(read_page·console·headless sim)로 대체 검증. 게임 결함 아님.

---

## 지시서 준수 확인 (§0·§7 금지 범위)

신규 보스/무기/교리/적 없음 · DPS 재조정 없음 · 뱅킹/승격/강등 로직 변경 없음 · 저장 스키마/마이그레이션 변경 없음 · 청크/노드 필터 변경 없음 · entities.js/bosses.js/main.js 추가 구조 리팩토링 없음. 변경은 방어 순수화·테스트·문서 3영역에 한정.
