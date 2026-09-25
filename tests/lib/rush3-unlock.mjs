// tests/lib/rush3-unlock.mjs — 셸 검사 하네스용 옛 기록 시드(r4.3 순차 해금, 이사님 결정 N2 = (나) 순차 해금 + 기존 기록 엄격 인정).
//  r4.3 부터 startRun 이 잠긴 판을 거부하므로, 빈 저장에서 뒤 판(2~24)으로 곧장 출격하던 셸 검사는 '옛 저장에 1~n 번을 이긴 기록이 있는 사용자'로 시작한다.
//  기록은 **코스 버전 1 칸('1')** 에 cleared 만 쓴다 — 지금 모든 판의 코스 버전은 2 이상이라 늘 '옛 버전' 칸이다. 그래서
//   · 스테이지 선택 화면(현재 버전·출격 줄 칸만 보여 줌)·첫 플레이 안내(attempts 합)·신기록 비교(현재 칸)에 영향이 없고
//   · v4 첫 클리어 코인(지갑의 첫 클리어 표식으로만 판정)에도 영향이 없다 — 해금 범위만 1~n+1 로 열린다.
export function seedOldClears(save, throughId) {
  for (let id = 1; id <= throughId; id++) save.updateStage(id, { cleared: true }, 1);
  return save;
}
