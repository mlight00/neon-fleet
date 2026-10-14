// r4.35 무기 늘리기(이사님 결정 2026-10-14 — 설계서 docs/superpowers/specs/2026-10-14-weapon-variety-design.md) 검사 도우미.
//  ① undoR435Stage: 무기 배치를 바꾼 16판을 옛 판으로 되돌린다(바꾼 통의 무기 = hpWeapon · hpWeapon 칸 삭제 · 갈림길 표지 · 2판 안내 글 · 코스 version −1).
//     옛 판 자료(DIFF2ROW SNAP)와 바이트 단위로 대조하는 검사가 다른 개정의 undo 와 함께 쓴다(무기 배치 밖의 칸은 건드리지 않는다).
//  ② 체력 기준 'max'(이사님 결정 '가'): 바꾼 판의 체력 바닥은 바뀐 무기 · 바꾸기 전 무기 두 계산 중 높은 쪽 — 기대값도 두 판(stage · hpRefStage)으로 만든다.
import { hpRefStage } from '../../rush3/stages.js';

export const R435_STAGES = Object.freeze([2, 4, 5, 8, 10, 11, 13, 15, 16, 17, 18, 19, 20, 22, 23, 24]);
const SIGN_BACK = Object.freeze({ 2: { flame: 'auto' }, 11: { arc: 'sniper' }, 20: { sniper: 'arc' } });
const HINT_BACK = Object.freeze({ '분리벽 오른쪽 화염방사기를 확보하면 몰려오는 무리를 한꺼번에 태울 수 있어요': '분리벽 오른쪽 기관총을 확보하면 다음 무리를 빨리 정리할 수 있어요' });

export function undoR435Stage(st, id) {
  if (!R435_STAGES.includes(id)) return st;
  const out = { ...st, version: st.version - 1 };
  out.supplies = st.supplies.map((s) => {
    if (!s.hpWeapon) return s;
    const { hpWeapon, ...rest } = s;
    return { ...rest, payload: { ...s.payload, weapon: hpWeapon }, hint: HINT_BACK[s.hint] ?? s.hint };
  });
  const sb = SIGN_BACK[id];
  if (sb) {
    out.walls = st.walls.map((w) => (w.signs
      ? { ...w, signs: Object.fromEntries(Object.entries(w.signs).map(([k, v]) => [k, v && v.kind === 'weapon' && sb[v.weapon] ? { ...v, weapon: sb[v.weapon] } : v])) }
      : w));
  }
  return out;
}

/** 체력 기대값용 두 판: [지금 판, 기준 판(바꾼 통이 없으면 null)] */
export const hpPair = (st) => [st, hpRefStage(st)];
