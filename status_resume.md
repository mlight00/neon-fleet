# 네온 함대 — 작업 상태 (2026-08-01)

## 방금 완료: §G-1 아군 드론·순양함 3D (이사 확인 대기)
- 원본 스프라이트 A1.png(드론)·A2.png(순양함) 디지타이즈 → `js/chase3d-allies.js` 로프트.
  드론 180tri(단순 델타 셔틀) / 순양함 532tri(장갑함+포드+은 패널). 위계: 기함 금 > 순양함 은 > 드론 무패널.
- 실전 배선: 220% 이상에서 기함 옆 호위가 3D 로 교체(HP바·라벨은 2D 유지), 150% 이하는 기존 2D.
- 검증: 855/855 테스트, 실전 실측 droneCount 2·cruiserCount 1, dist 재빌드. 커밋 d57e0e2·6321d26(로컬만, 푸시 금지).
- **확인 방법(권장): `http://localhost:8346/?chase3d=1&fleetlab=1`** — 드론 60기·순양함 2척을 갖춘 채 즉시 전투 시작(220% 확대). 정상 플레이 초반은 드론이 적어 호위가 xN 라벨로만 표기되는 기존 규칙 때문에 아군 3D 를 볼 수 없음(회귀 아님, A/B 재현으로 확인).
  검사실: `?chase3d=1&chase3dLab=allies&labView=top`
- 캡처: docs/qa/chase3d-opus5-aurora/allies-lab-top.png · allies-play-final.png

## 다음(이사 승인 순서)
1. §G-2 무기 발사체 3종(발칸탄·레이저 3D 빔·유도미사일) 고품질 재구현
2. §G-3 배지·크리스탈·보급선
3. §G-4 남은 적(터렛·위버·B3·보스) 종별 순차
- §F 잔여: ①chase3dHeroTest 결정 장면 ⑤반응로 축소(이사 확인 후)

## 서버(백그라운드)
- `node scratch_nocache_srv.mjs "E:/workspace/claude/neon-fleet-worktrees/stage1-analytics"` (8346, 루트 인자 필수)
- `node scratch_capsrv2.mjs` (9098 캡처 저장)
- 외부 테스트 필요 시: `cloudflared tunnel --protocol http2 --url http://localhost:8346`
