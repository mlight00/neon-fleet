// rush3/names.js — 보스·강적 이름(r4.28, 이사님 지시 2026-09-30 "보스들의 이름을 각각 정해주자. 중간보스 이런건 너무 하잖아?").
//  같은 그림 = 같은 이름(판이 달라도 — B1 은 3·18번, B2 는 6·18번, B3 은 9·15번, B4 는 12·21번). **이름은 이 파일 한 곳에서만 고친다.**
//  보스 = 몸 그림(skin, 없으면 기본 B1 — render 의 ENEMY_ART_BASE.elite 와 같다) · 강적(옛 '중간 보스') = 크게 키운 일반 적 그림(look.skin, 없으면 kind 의 기본 그림).
//  화면(체력 막대 · 머리 위 이름표 · 등장/전투/격파 배너 · 판 시작 줄 · 결과 코인 줄 · 강화 화면 줄)은 모두 bossName·stageBossName 을 거친다.
//  순수 모듈 — 다른 rush3 모듈을 가져오지 않는다(main·render 가 함께 가져와도 순환이 없다)

//  보스 5종: 생김새·공격으로 지은 이름(24번 판 제목 '크라운 브레이커'는 그대로 이름으로)
export const BOSS_NAMES = Object.freeze({
  B1_grader: '매연 불도저',         // 굴뚝 매연탄을 쏘는 불도저
  B2_gantrywidow: '철거미 여왕',    // 갈고리·쇠줄 그물을 쓰는 거미 크레인
  B3_railleviathan: '폭주 기관차',  // 레일 위로 돌진하는 기관차
  B4_smelter: '용광로 거인',        // 쇳물 웅덩이·쇳물 비
  B5_crownbreaker: '크라운 브레이커', // 왕관 쓴 철퇴 왕
});
//  강적 8종(그 판에 나오는 일반 적을 크게 키운 한 체)
export const MID_NAMES = Object.freeze({
  E5_wheeler: '가시바퀴',       // 2번 — 가시 바퀴 로봇
  E1_scrapbit: '고철 대장',     // 5번 — 네 발 고철 로봇
  E2_ramhound: '돌격 사냥개',   // 8번 — 들이받는 사냥개 차량
  E10_magnethead: '자석 두목',  // 11번 — 자석 머리
  E3_wallguard: '철벽 수문장',  // 14번 — 장갑 벽
  E9_spawnpod: '어미 포드',     // 17번 — 적을 낳는 포드
  E6_signaler: '경보탑',        // 20번 — 신호등 로봇
  E7_cartyard: '수레 대왕',     // 23번 — 고철 수레
});
const BOSS_DEFAULT_ART = 'B1_grader';
const KIND_ART = Object.freeze({ grunt: 'E1_scrapbit', rusher: 'E5_wheeler', shooter: 'E6_signaler' });

/** 보스·강적 한 체의 이름 — 규칙의 보스 객체·판 정의의 elite·arena 모두(skin · mid · look 만 읽는다). 표에 없으면 '보스'·'강적' */
export function bossName(b) {
  if (!b) return '보스';
  if (b.mid) {
    const look = b.look || {};
    return MID_NAMES[look.skin || KIND_ART[look.kind] || KIND_ART.grunt] || '강적';
  }
  return BOSS_NAMES[b.skin || BOSS_DEFAULT_ART] || '보스';
}

/** 판 끝 목표의 이름(판 정의 buildStage 결과 — 광장 보스 · 보스 여럿이면 '·'로 잇는다). 보스·강적이 없는 판(웨이브)은 null */
export function stageBossName(stage) {
  const list = stage && stage.elites && stage.elites.length ? stage.elites : stage && stage.arena ? [stage.arena] : [];
  if (!list.length) return null;
  return list.map(bossName).join('·');
}
