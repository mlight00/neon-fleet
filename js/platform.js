// 플랫폼 수명주기 인터페이스 — 향후 CrazyGames Full Launch SDK 연결을 쉽게 하기 위한 얇은 이음매.
//  ⚠️ 이번 Basic Launch 단계에서는 반드시 전부 로컬 no-op 이어야 한다(지시서 §1.3·§P0-1):
//     외부 스크립트를 로드하지 않고, 네트워크를 부르지 않으며, 광고 요청 함수는 UI에서 호출하지 않는다.
//  Full Launch 선정 시 이 파일 하나만 실제 SDK 어댑터로 교체하면 된다(호출부는 그대로).

/**
 * no-op 플랫폼 어댑터를 만든다. onLog가 주어지면(디버그) 호출만 기록하고 아무 부작용도 없다.
 * gameplayStart/Stop = 전투 시작/종료 신호(SDK의 광고 타이밍용), requestMidgameAd/RewardedAd = 광고 요청.
 * 이번 빌드에서는 모두 즉시 반환한다.
 */
export function createPlatform({ onLog = null } = {}) {
  const log = typeof onLog === 'function' ? onLog : () => {};
  return {
    /** 실제 전투(플레이) 시작 신호. Full Launch에서 SDK.gameplayStart()로 연결. */
    gameplayStart() { log('gameplayStart'); },
    /** 전투 종료/일시정지 신호. Full Launch에서 SDK.gameplayStop()로 연결. */
    gameplayStop() { log('gameplayStop'); },
    /** 중간 광고 요청(no-op). UI에서 호출하지 않는다. */
    requestMidgameAd() { log('requestMidgameAd'); return Promise.resolve({ shown: false, reason: 'noop' }); },
    /** 보상형 광고 요청(no-op). UI에서 호출하지 않는다. */
    requestRewardedAd() { log('requestRewardedAd'); return Promise.resolve({ rewarded: false, reason: 'noop' }); },
  };
}

/** 기본 no-op 플랫폼 싱글턴. */
export const platform = createPlatform();
