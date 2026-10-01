// rush3/story.js — 스토리 스틸컷(이사님 결정 2026-10-01 — 설계서 docs/superpowers/specs/2026-10-01-story-stillcuts-design.md).
//  도시 탈환전 9장: S0 프롤로그(아직 안 봤으면 출격 직전) · S1~S7 보스 판 승리(3·6·9·12·15·18·21) · S8 에필로그(24 승리).
//  대사는 게임이 글자로 그린다(그림에 글자 없음 — 한글이 깨지거나 어절이 쪼개지지 않게). art = 그림 파일이 있는가 — 생기기 전에는 false(불러오지 않는다).
//   2026-10-01 그림 9장 완료(BACKLOG 3-18 — 크롬 Gemini, 카툰풍 · 글자 없음 · 표식 거꾸로 빼기 · 3:5 960×1600 WebP, 원본 newmode/sprites/story/raw) → 모두 true
//  순수: 난수·시계·저장·화면 없음
const S = (id, stage, label, l1, l2) => Object.freeze({ id, stage, label, art: true, lines: Object.freeze([l1, l2]) });
export const STORY = Object.freeze([
  S('S0', null, '프롤로그', '도시가 고철 군단에게 넘어갔다.', '포지 게이트로 부대를 키워 도시를 되찾아라.'),
  S('S1', 3, '이야기 1', '모든 고철 기계에 같은 왕관 표식이 있다.', '누군가 이 군단을 지휘하고 있다.'),
  S('S2', 6, '이야기 2', '군단은 기계를 붙잡아 부품으로 쓰고 있었다.', '구출한 로봇들이 합류한다!'),
  S('S3', 9, '이야기 3', '이 열차는 고철을 실어 나르고 있었다.', '군단이 태어나는 곳은 저 용광로다.'),
  S('S4', 12, '이야기 4', '이 설계도는… 스타포지의 것이다.', '적이 우리 기술로 만들어지고 있었다.'),
  S('S5', 15, '이야기 5', '쓰러뜨린 보스가 다시 조립되어 돌아왔다.', '신호를 끊지 않으면 끝이 없다.'),
  S('S6', 18, '이야기 6', '신호의 근원은 도시 중심의 왕관 탑이다.', '마지막 길이 열린다.'),
  S('S7', 21, '이야기 7', '…나는 스타포지가 만든 첫 번째 로봇이었다.', '버려진 나를 이 도시가 왕으로 만들었다.'),
  S('S8', 24, '에필로그', '스타 코어 회수. 스타포지 완전 가동.', '도시를 되찾았다. 첫 번째 로봇도 이제 우리 편이다.'),
]);
export const STORY_IDS = Object.freeze(STORY.map((s) => s.id));
const BY_ID = new Map(STORY.map((s) => [s.id, s]));
const BY_STAGE = new Map(STORY.filter((s) => s.stage != null).map((s) => [s.stage, s.id]));
export const storyById = (id) => BY_ID.get(id) ?? null;
export const storyIdForStage = (stageId) => BY_STAGE.get(stageId) ?? null;
export const storyImagePath = (id) => 'assets/rush3/story/' + id + '.webp';
/** 본 장면 목록 정규화: 아는 id 만 · 처음 나온 차례 · 중복 없음 · 배열이 아니면 [] */
export function normSeenStory(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const id of list) if (BY_ID.has(id) && !out.includes(id)) out.push(id);
  return out;
}
//  나타난 뒤 입력을 받지 않는 시간(초 — 게임 중 누르던 손가락·연타로 바로 넘어가지 않게) · 나타나는 시간(초)
export const STORY_INPUT_LOCK = 0.5;
export const STORY_FADE = 0.3;
