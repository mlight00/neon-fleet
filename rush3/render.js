// rush3/render.js — 캔버스 그리기 전담(계약서 6장). 게임 판단은 하지 않고 view 를 그대로 그린다.
//  헬퍼(drawImgCentered/shadow/roundRect/drawParts/drawFloaters/drawButtons/흔들림/비네트/일시정지/적 폴백/적탄)는
//  rush/render.js 에서 복제. 게이트·보급·부대·벽·HUD·결과·타이틀은 신규. 시계는 view.now 만 쓴다.
//  화면 좌표는 r3.20 부터 원근 투영(rush3/project.js)이 만든다: (x, d = z − run.z) → { x, y, s }. 종전 평면 변환 y = LINE_Y − d 는 flat 모드(?flat=1)로 남는다.
import { BAL3 } from './balance.js';
import { PERSPECTIVE, projectorFor, projectorMode } from './project.js';
import { WEAPONS } from './weapons.js';
import { gateColor, gateLabel } from './gates.js';

const W = BAL3.view.w, H = BAL3.view.h, LINE_Y = BAL3.view.LINE_Y;
//  병력 수 글(부대 중심 마커 옆, 수정 라운드 2): 마커에서 COUNT_DX 떨어져 쓰고, 마커 x 가 COUNT_FLIP_X 를 넘으면 왼쪽에 쓴다(세 자리 26px ≈ 46px 가 화면 밖으로 안 나가게)
export const COUNT_DX = 14, COUNT_FLIP_X = W - 70;
const ROAD0 = BAL3.road.x0, ROAD1 = BAL3.road.x1;
const C = BAL3.colors;
const FX = BAL3.fx;
const FONT = 'system-ui, sans-serif';
const ENEMY_FALLBACK = C.enemy;
const ENEMY_SPRITE = { grunt: 'e_grunt', rusher: 'e_rusher', shooter: 'e_shooter' };
//  r3.26 3상태 그림: 적 → 그림 파일 이름(skin 이 있으면 그 파일). 이 이름에 'hit:'·'dmg:'·'dead:' 를 붙인 키가 3상태 그림이다
const ENEMY_ART_BASE = Object.freeze({ grunt: 'E1_scrapbit', rusher: 'E5_wheeler', shooter: 'E6_signaler', elite: 'B1_grader' });
export function artBase3(kind, skin) { return skin || ENEMY_ART_BASE[kind] || null; }
//  손상 그림으로 바꾸는 문턱 = 남은 체력이 스폰 체력의 절반 이하일 때(여러 발 맞는 적만 — 한두 방에 죽는 적은 볼 틈이 없다)
export const DMG_ART_AT = 0.5;
export function wantsDmgArt(hp, hpMax) { return (hpMax ?? 0) > 2 && hp > 0 && hp <= hpMax * DMG_ART_AT; }
const ENEMY_LABEL = { grunt: '잡졸', rusher: '돌격체', shooter: '저격수' };
//  r4.8 (라) 적 움직임 그림(이사님 지시 2026-09-26 "적들이 걸어서 내려오는 듯한 스프라이트도 추가하자. 굴러내려오는건 굴러내려오는 모양으로 보이게 하고").
//   걷기 동작 시트가 아직 없어(E1_scrapbit 등은 정지 그림 한 장) **코드로 움직임을 준다** — 규칙(run)은 읽기만 한다(그림만 — 규칙 불변, 두 줄 공통).
//   그림(art base = artBase3) → 움직임 종류:
//    walk  = 다리 달린 적(잡졸 E1 네 발 로봇 · 장갑체 E3 짧은 발 · 복병 E8 용수철 다리): 걸음마다 한 번 통통 튐 + 좌우로 번갈아 기울기(두 걸음에 한 주기) + 발 디딜 때 살짝 눌림
//    roll  = 바퀴(돌격체 E5): 바퀴 중심으로 계속 회전(각 = 화면 쪽으로 다가온 거리 ÷ 반지름 — 달려들며 빨라지면 회전도 빨라진다) + 작은 튐 + 뒤쪽 흙먼지 점
//    drive = 바퀴·궤도 달린 차(돌격 트럭 E2 · 카트 E7): 몸통을 통째로 돌리면 어색해 **돌리지 않고** 잔 떨림 + 흙먼지만
//    hover = 서 있거나 떠 있는 적(저격수 E6 · E9 · E10 · E4): 가벼운 숨쉬기(떠다님)
//   박자·회전은 화면에서 다가온 거리(d = e.z − run.z 가 줄어든 만큼)로 정한다 — 다가오는 빠르기에 비례하고, 같은 판·같은 입력이면 같은 그림(결정적). 위상은 적 id 로 어긋나게.
//   피격 반응 중에는 걷기 흔들림을 hitDamp 배로 줄이고(밀림·찌그러짐과 겹쳐 어색하지 않게), 전격 기절 중에는 멈춘다
export const ENEMY_MOTION = Object.freeze({
  E1_scrapbit: 'walk', E3_wallguard: 'walk', E8_manholejumper: 'walk',
  E5_wheeler: 'roll',
  E2_ramhound: 'drive', E7_cartyard: 'drive',
  E6_signaler: 'hover', E9_spawnpod: 'hover', E10_magnethead: 'hover', E4_needleeye: 'hover',
});
//  stride = 한 걸음 동안 화면 쪽으로 다가오는 거리(px) · bob = 튐 높이(px, 그 자리 배율을 곱한다) · tilt = 기울기(라디안 — 4°) · squash = 발 디딜 때 눌림 · hitDamp = 피격 중 흔들림 배수
export const WALK = Object.freeze({ stride: 60, bob: 2.6, tilt: 4 * Math.PI / 180, squash: 0.08, hitDamp: 0.25 });
//  bob = 바퀴 튐 높이(px) · dust = 흙먼지 점 수
export const ROLL = Object.freeze({ bob: 1.4, dust: 3 });
//  다가온 거리의 기준(그림 위상에만 쓰는 상수 — 양수로 두려고)
const MOTION_REF = 2000;

/** 적 한 기의 움직임 자세(순수 — 규칙 run·적 e 는 읽기만). hitK = 피격 반응 중이면 WALK.hitDamp(흔들림을 줄인다), 아니면 1.
 *  반환 { kind, steps(걸음 수), bob(px — 배율 전), tilt(라디안), sx·sy(눌림), spin(라디안 — 바퀴), dust(흙먼지 세기 0~1) } | null(움직임 없는 적·기절) */
export function enemyMotionPose(e, run, hitK = 1) {
  const kind = ENEMY_MOTION[artBase3(e.kind, e.skin)] ?? null;
  if (!kind || e.stunT > 0) return null;
  const travel = MOTION_REF - (e.z - run.z);
  const ph = (e.id * 0.37) % 2;
  if (kind === 'walk') {
    const steps = travel / WALK.stride + ph;
    const s = Math.sin(Math.PI * steps);
    const lift = Math.abs(s), land = Math.pow(1 - lift, 3);
    return { kind, steps, bob: WALK.bob * lift * hitK, tilt: WALK.tilt * s * hitK, sx: 1 + WALK.squash * land * hitK, sy: 1 - WALK.squash * land * hitK, spin: 0, dust: 0 };
  }
  if (kind === 'roll') {
    const spin = travel / e.r;
    return { kind, steps: 0, bob: ROLL.bob * Math.abs(Math.sin(spin * 2)), tilt: 0, sx: 1, sy: 1, spin, dust: 1 };
  }
  if (kind === 'drive') {
    const v = travel / 9 + ph;
    return { kind, steps: 0, bob: Math.abs(Math.sin(v)) * hitK, tilt: 0.022 * Math.sin(v * 0.5) * hitK, sx: 1, sy: 1, spin: 0, dust: 0.7 };
  }
  const t = (run.time || 0) * 2.2 + e.id * 0.9;
  return { kind, steps: 0, bob: 1.6 * (0.5 + 0.5 * Math.sin(t)), tilt: 0, sx: 1 - 0.015 * Math.sin(t), sy: 1 + 0.025 * Math.sin(t), spin: 0, dust: 0 };
}
//  사격 개시선 옆 안내(계약서 6장 N2-⑤). ⚠️선을 넘는 주체는 **게이트**다 — 플레이어가 넘는다는 뜻으로 읽히면
//   벽의 통로 확정선과 헷갈린다(2026-09-17 2차 검수 N2-④).
export const ARM_LINE_TEXT = '이 선 안으로 온 게이트를 쏠 수 있어요';
//  함정 게이트 = 랜덤 길 ⑤(BAL3.lottery.pool 의 good:false 이면서 maxValue === value). 모든 칸이 음수이고 상한이 자기 값 이하라
//   몇 발을 맞아도 값이 그대로다(gates.js 값 갱신 공식). 셸의 isFixedGateRow 가 이 함수를 그대로 쓴다 —
//   외형·꼬리표·짧은 글이 언제나 같은 행에서 같은 말을 하도록 판정식을 한 곳에만 둔다.
export function isTrapGateRow(row) {
  const cells = row && Array.isArray(row.cells) ? row.cells : null;
  if (!cells || cells.length === 0) return false;
  return cells.every((c) => c.value < 0 && c.maxValue != null && c.maxValue <= c.value);
}
//  함정 칸 옆 배지(2026-09-17 이사 결정 ③ 함정 외형 A) — 이 장치에는 사격이 안 먹힌다
export const TRAP_BADGE_TEXT = '쏴도 안 줄어듦';
//  결과 화면 [다시 도전] 아래 부연(2026-09-17 이사 결정 ①) — 랜덤 길은 재도전마다 새로 뽑는다
export const RETRY_LOTTERY_NOTE = '랜덤 길은 새로 추첨';
//  맨 아래 경고 한 줄(타이틀·결과, 종전 '기록 저장 안 됨' 자리 H−22). r4.3: 코인 저장 실패·차단 환경 경고와 읽기 전용 탭 안내가 더해졌다
export const SAVE_WARN = Object.freeze({
  readOnly: '다른 탭에서 게임이 열려 있어 이 탭은 저장하지 않습니다',
  both: '기록 저장 안 됨 · 코인이 저장되지 않습니다',
  coin: '코인이 저장되지 않습니다',
  record: '기록 저장 안 됨',
});
//  r4.5: 결과 화면 '획득 코인 +N'·'보유 코인 N' 뒤에 붙는 꼬리(코인이 저장소에 남지 않는 탭 — 읽기 전용·코인 저장 실패)
export const UNSAVED_TAG = '저장 안 됨';
//  칸 위 짧은 글의 화면 상단 한계(HUD 아래). 행이 화면 밖에서 들어오는 동안에도 글이 보이게 여기에 붙인다
const TIP_MIN_Y = 96;
//  r4.2(2026-09-25, 이사 지시 "보통, 어려움, 지옥으로 난이도 구성된 것들 삭제하고"): 난이도 짧은 표기(HUD 칩·결과 제목 옆 '어려움'/'지옥')와
//   그 색표(DIFF_COLOR)를 지웠다. run.difficulty·result.difficulty 는 기록 칸 키로만 남고 화면에는 나오지 않는다.

//  HUD 상단 줄의 **자리표 단일 출처**(2026-09-18 이사 소견: "난이도 칩·무기 칩·⏸ 버튼 크기가 제각각이고 높이가 안 맞는다").
//   조각(무기 칩·⏸ — r4.2 에서 난이도 칩 HUD_DIFF {w 64}를 지웠다)은 같은 높이 h·같은 세로 중심선 cy·같은 모서리 반경 r·같은 글자 크기 fs 를 쓰고,
//   화면 오른쪽 끝에서 right 만큼 띄운 자리부터 gap 간격으로 왼쪽으로 줄을 선다. 왼쪽 STAGE 제목도 같은 cy 에 중심을 맞춘다.
//  ⚠️⏸ 의 **히트 영역**(main.js HUD_BTN)도 이 표에서 나온 상자를 그대로 받는다 — 그린 자리와 누르는 자리가 갈라지지 않게
//   좌표를 두 곳에 적지 않는다. main.js 는 render.js 를 이미 import 하므로 방향은 render → main 하나뿐이다(역방향은 순환).
const HUD_TOP = 16, HUD_H = 36, HUD_R = 18, HUD_FS = 15, HUD_GAP = 8, HUD_RIGHT = 14;
const hudBoxOf = (w, right) => Object.freeze({ x: right - w, y: HUD_TOP, w, h: HUD_H });
const HUD_PAUSE = hudBoxOf(44, W - HUD_RIGHT);
//  r4.5(v4 ⑤단계): 무기 칩 폭 122 → 148 — 판 안 표기 'Mk'(기획 v4.1 3-4 (라), 떠오르는 글 '기관총 Mk II!' 와 같은 꼴)를 칩 안에 한 줄로 넣는다.
//   가장 긴 '기관총 Mk III'(bold 15px 실측 92.3px, Chromium)이 글자 시작(칩 x + 48)부터 오른쪽 여백 6px 안(글 폭 94px)에 들어가는 폭. 코인 칩·제목 끝선은 그만큼 왼쪽으로(아래 HUD_COIN)
const HUD_WEAPON = hudBoxOf(148, HUD_PAUSE.x - HUD_GAP);
//  r4.3 이번 판 코인 칩(v4 ③단계, 기획 v4.1 3-9 '출격 중 HUD'): 종전 난이도 칩(HUD_DIFF {w 64})이 있던 자리 — 무기 칩 왼쪽 같은 간격.
//   셸이 view.hud.coins(정산 전 누계)를 숫자로 넘길 때만 그린다(개발용 판 = null → 칩 없음, 제목 끝선은 무기 칩 왼쪽 그대로).
//   r4.5: 무기 칩이 넓어져 x 220 → 194(무기 칩 왼쪽 같은 간격 — 겹치지 않는다). 제목 끝선은 194 − 6(가장 긴 '24  크라운 브레이커' 17px 156.6px 도 들어간다)
const HUD_COIN = hudBoxOf(64, HUD_WEAPON.x - HUD_GAP);
//  무기 Mk 단계 표기(r3.10). Mk I 은 표기 없음. r4.5: 판 안 글(셸 떠오르는 글 '기관총 Mk II!'·랜덤 길 결과 '중화기 Mk II')과 같은 꼴 ' Mk II'
//   (종전 ' II' — 기획 v4.1 3-4 (라) "판 안 = '기관총 Mk II'"). '강화'라는 말은 판 밖 로봇 강화에만 쓴다
export const MK_LABEL = Object.freeze(['', '', ' Mk II', ' Mk III']);
//  r4.1(2026-09-25): '가까이 ○/●' 토글 칩(종전 ZOOM, HUD 왼쪽 셋째 줄 {x16, y84, w70, h26})을 지웠다 — 보기는 '가까이' 하나뿐(project.js).

//  탄 그림의 화면 길이(px, Mk I 기준). 무기마다 실루엣이 달라 길이도 다르게: 저격 바늘이 가장 길고 산탄 펠릿 뭉치는 짧고 넓다
//   r4.7: 산탄포는 그림(bullet_scatter)을 쓰지 않고 둥근 알갱이로 그린다(drawPellet) — scatter 값은 표를 무기 6종으로 채워 두는 몫만 남는다
export const BULLET_LEN = Object.freeze({ rifle: 24, auto: 26, heavy: 34, scatter: 22, sniper: 48, arc: 34 });
//  탄의 진행 방향(라디안, 0 = 화면 위). vx 가 있는 탄(산탄 부채꼴·아레나 자동 조준)은 그 방향으로 그림을 돌린다
//  체력 숫자를 생략하는 화면 위 띠: HUD 줄(제목·남은 거리·무기 칩) 아래 선.
//  r4.1: 종전에는 '가까이' 칩 아래(칩 y 84 + 높이 26 + 여백 18 = 128)로 계산했는데 칩이 없어져 **숫자 128 로 고정**한다(같은 값 — 생략 구간 불변).
//  ⚠️원근에서는 그리는 y 가 곧 화면 y 다(균일 확대 변환 없음) — 되돌릴 배율이 없다
export const HP_TAG_MIN_Y = 128;

//  손맛(r3.24): 적 종류 → 피격·사망 반응 역할. skin(역할 그림)이 우선이고 없으면 kind. 정예·아레나 보스 = 'elite'.
//   셸(main.js)과 렌더가 같은 함수를 쓴다 — 셸이 만든 반응과 그리는 반응이 갈라지지 않게 판정식은 여기 한 곳
export function hitRole(kind, skin) {
  if (kind === 'elite') return 'elite';
  //  r4.7 현상금 적 = 장갑 반응(거의 안 밀리고 금속 스파크 — 무겁고 단단한 적). 처치 연출은 셸이 보스 처치 방식을 더한다
  if (kind === 'bounty') return 'armor';
  const bySkin = skin ? FX.hitRoleBySkin[skin] : null;
  if (bySkin) return bySkin;
  return kind === 'rusher' || kind === 'shooter' ? kind : 'grunt';
}
//  r4.7 현상금 적 겉모습(검사가 이 값으로 그리기 호출을 찾는다): 금색 테(ring = C.gold)·어두운 청동 몸(body)·머리 위 이름표(label = BAL3.bounty.label)
export const BOUNTY_LOOK = Object.freeze({ ring: BAL3.colors.gold, body: '#3A2A12', label: BAL3.bounty.label });
//  피격 번쩍임 색(검사 V3-HITFEEL 이 이 값으로 그리기 호출을 찾는다)
export const HIT_FLASH_FILL = '#FFFFFF';
//  r4.4 메인 로봇 보호막 고리·피해 이전 빛줄기 색(검사가 이 값으로 그리기 호출을 찾는다). 광장 보스 보호막(C.gatePos 점선)과 다른 흰 하늘색
export const HERO_RING_COLOR = '#BFF6FF';
//  r4.4 (b) 로봇 다연발 **추가 탄**(extra — 게이트·증원 설비에 무효, 이사님 결정 N3)의 꼬리 색. 무기 6색·적탄 마젠타와 겹치지 않는 연보라 —
//   '게이트를 올리는 원래 탄'과 눈으로 구분되게(기획 v4.1 3-4 (다) ②). 검사가 이 값으로 그리기 호출을 찾는다
export const EXTRA_BULLET_COLOR = '#D9A6FF';
//  r4.5(v4 ⑤단계, 원본 v4 3-5 '메인 로봇' 줄): 로봇 강화가 1단계 이상인 판에서 **로봇의 탄**(원래 탄 + 추가 탄)에 두르는 옅은 테.
//   추가 탄 꼬리(EXTRA_BULLET_COLOR)와 같은 연보라 계열로 '로봇 탄 = 연보라'를 한 벌로 맞추고, 보호막 고리(HERO_RING_COLOR 흰 하늘색)와는 색이 달라
//   로봇 자리에서 탄이 나올 때 고리와 섞여 보이지 않는다. 병사 탄에는 두르지 않는다(병사도 강해졌다고 오해하지 않게, 기획 v4.1 3-4 (가)). 검사가 이 값으로 찾는다
export const HERO_BULLET_RIM = 'rgba(217,166,255,0.85)';
//  r4.7 산탄포 알갱이(이사님 지시 2026-09-26 "총알이 산탄해서 뻗어나가도록 변경, 현재는 나뭇잎 같음"): 스프라이트(bullet_scatter)를 쓰지 않고
//   코드로 그리는 **작고 둥근 알갱이** — 무기색 번짐 원 + 밝은 심 원 + 진행 반대쪽 짧은 꼬리(반지름의 tail 배). 길쭉한 모양 금지(꼬리는 짧고 반투명).
//   막 나온 알갱이(사거리 원점에서 flashPx 안)에는 총구 섬광(흰 노랑 원이 빠르게 줄어든다)을 겹친다 — 한 번에 나온 6발이 한자리에 겹쳐 한 번 번쩍인다.
//   검사(SCATTER)가 core·flash 색으로 그리기 호출을 찾는다
export const PELLET = Object.freeze({ core: '#F7FFE6', flash: '#FFF6C8', tail: 2.4, glow: 1.7, flashPx: 40 });
//  r4.8 보스 공격 패턴 예고(규칙 run.bossAtk.cur 를 읽기만 해서 그린다 — 이사님 지시 2026-09-26 "보스 탄을 피할 수 없다").
//  r4.9 (가) 안내 규칙(이사님 실플레이 4차 "날아오는 총알의 경우는 없애자. 광역 대미지가 있는 구역에 대한 경보만 주자"):
//   광역 공격만 붉은 경보 구역(ATK_DANGER — 차오르는 채움 + 깜빡이는 테)을 그린다. 탄 공격은 도로에 아무것도 그리지 않고 보스 몸에 장전 번쩍임(ATK_CHARGE)만.
//   초록 안전 구역 표시는 없앴다(색 상수도 지웠다 — 검사가 그 색이 어디에도 없음을 확인한다). 검사가 이 색으로 그리기 호출을 찾는다
export const ATK_DANGER = '#FF3040';
//  r4.10 결승선(대물결 판 — 규칙 run.finishZ 를 읽기만): 도로를 가로지르는 체크무늬 두 줄(밝은·어두운 칸 cells 개, 세계 깊이 depth px) +
//   양쪽 기둥과 그 위를 잇는 표지 띠, 가운데 '결승'(한 어절 — 줄바꿈 없음, BAL3.horde.label)
//  r4.10 중간 보스 겉모습: 머리 위 이름표(label = BAL3.midBoss.label '중간 보스' — 금빛 글) + 그 아래 체력 막대(주황 — 보스 막대 색과 다르게) · 막대 바탕
//  r4.10 타이틀 보스 판 표시: 스테이지 칸 왼쪽 위 모서리(칸 윗변에 걸친) 작은 금빛 왕관 — 어떤 판에 보스가 나오는지(색 + 모양, 글 없음)
export const BOSS_BADGE = Object.freeze({ color: '#F6C84A', edge: '#14233A', w: 18, h: 13, dx: 17, dy: 1 });
export const MID_LOOK = Object.freeze({ label: BAL3.midBoss.label, labelColor: '#FFD27A', bar: '#FF9A3D', back: 'rgba(20,35,58,0.85)' });
export const FINISH_LOOK = Object.freeze({ light: '#F3F1E8', dark: '#14233A', cells: 16, depth: 26, post: '#9AA1AC', board: 'rgba(20,35,58,0.9)', sign: '#F6C84A', label: BAL3.horde.label });
export const ATK_CHARGE = '#FFF1B8';
//  r4.9 (다) 광분(이사님 지시 2026-09-26 "보스 체력이 30% 남으면 광분 모드를 넣자" — 규칙 bo.rage 를 읽기만): 보스 둘레 붉게 달아오르는 오라(맥박 = 규칙 시계 run.time) ·
//   몸체 잔떨림 · 붉은 체력 막대 · 들어가는 순간 화면 가운데 '광분!' 배너(셸 fx.rageT). 검사가 이 색으로 그리기 호출을 찾는다
export const RAGE_COLOR = '#FF2A2A';
//  r4.9 보스 스킨별 탄 모양(look — balance.bossAtk.skins, 이사님 "각 보스마다 특색있는 패턴"): 잔해 덩어리(B1 회갈색 — 돌며 굴러온다) · 바늘(B2 보라) ·
//   객차(B3 — 어두운 몸에 붉은 창 불빛, 사슬로 이어진다) · 쇳물 덩이(B4 주황 + 분홍 발광) · 왕관 칼날(B5 금 — 돌며 날아온다).
//   고유 공격 탄(규칙 적탄의 look 칸)만 이 모양이고, 저격수 탄·배수 1 줄 보스 부채꼴은 종전 마젠타 구슬. 검사가 color 로 그리기 호출을 찾는다
export const ATK_LOOK = Object.freeze({
  debris: Object.freeze({ shape: 'debris', color: '#9A8266', core: '#D8C6A5', dark: '#4A3C2E' }),
  needle: Object.freeze({ shape: 'needle', color: '#C77DFF', core: '#F6E9FF' }),
  car:    Object.freeze({ shape: 'car', color: '#3B2226', core: '#FF4A3D', trim: '#7C2B2B' }),
  slag:   Object.freeze({ shape: 'slag', color: '#FF7A2A', core: '#FFE08A', glow: '#FF5FA8' }),
  crown:  Object.freeze({ shape: 'crown', color: '#FFD447', core: '#FFFBE0' }),
});
//  r4.9 광역 공격이 터질 때(셸 fx.atkBlasts) 보스 특색 연출 색: 매연(B1 회색 연기 + 주황 불꽃) · 갈고리(B2 강철) · 거미줄(B2 흰 줄) · 열차(B3 검붉은 몸 + 노란 창) ·
//   쇳물(B4 주황) · 철퇴·충격파(B5 금). 경보는 모두 ATK_DANGER 한 색(한눈에 '피해 구역')
export const ATK_FX = Object.freeze({
  smoke: '#5E5A57', flame: '#FF9A3D', steel: '#B9C2CC', web: '#F2F4FF', train: '#5A1E24', window: '#FFD27A', molten: '#FF7A2A', gold: '#FFD447',
});

//  r4.5 강화 화면(새 상태 'upgrade', 원본 v4 3-5 '강화 화면')의 **자리표 단일 출처** — 셸(main.js)의 [구매]·[돌아가기] 히트 상자가 이 표에서 나온다
//   (HUD_ROW 와 같은 원칙: 그리는 자리와 누르는 자리가 갈라지지 않게 좌표를 두 곳에 적지 않는다). 480×800 기준.
//   위 머리(제목 · 설명 두 줄 · 보유 코인 · 구매 막힘 이유) → 트랙 카드 3장(직격 화력 · 연사 · 다연발) → [돌아가기].
//   카드 안: 이름 + 단계 막대(■■■□□) · '지금 → 다음' 효과 한 줄 · 보조 한 줄 · 짧은 설명 한 줄 · 오른쪽 아래 [구매](비용은 버튼 아랫줄)
export const UPGRADE_UI = Object.freeze({
  titleY: 76, headY: [104, 124], coinY: 162, blockY: 192,
  cardX: 20, cardW: 440, cardY0: 208, cardH: 144, cardGap: 12,
  textX: 38, textMaxW: 290,
  buy: Object.freeze({ w: 104, h: 54, padR: 14, padB: 14 }),
  back: Object.freeze({ x: 150, y: 686, w: 180, h: 48 }),
});
/** 트랙 카드 i(0·1·2)의 상자 */
export function upgradeCard(i) {
  const U = UPGRADE_UI;
  return { x: U.cardX, y: U.cardY0 + i * (U.cardH + U.cardGap), w: U.cardW, h: U.cardH };
}
/** 트랙 카드 i 의 [구매] 버튼 상자(카드 오른쪽 아래) */
export function upgradeBuyBox(i) {
  const c = upgradeCard(i), B = UPGRADE_UI.buy;
  return { x: c.x + c.w - B.padR - B.w, y: c.y + c.h - B.padB - B.h, w: B.w, h: B.h };
}

export function bulletAngle(b) {
  const vx = b.vx || 0, vz = b.vz || 1;
  return vx === 0 ? 0 : Math.atan2(vx, vz);
}

export const HUD_ROW = Object.freeze({
  top: HUD_TOP, h: HUD_H, r: HUD_R, fs: HUD_FS, gap: HUD_GAP, right: HUD_RIGHT,
  cy: HUD_TOP + HUD_H / 2,
  //  왼쪽 두 줄: 제목은 칩들과 같은 중심선, 남은 거리는 그 아래 한 줄
  left: 16, titleFs: 20, titleFsSmall: 17, distFs: 15, distCy: HUD_TOP + HUD_H / 2 + 28,
  //  r4.2: 난이도 칩 자리(diff)를 지웠다 — 무기 칩·⏸ 둘. r4.3: 그 자리에 이번 판 코인 칩(coin — 코인 값이 있을 때만 그린다)
  box: Object.freeze({ coin: HUD_COIN, weapon: HUD_WEAPON, pause: HUD_PAUSE }),
});

export function createRenderer3(ctx, sprites) {
  const get = (k) => (sprites && typeof sprites.get === 'function' ? sprites.get(k) : null);
  //  동작 시트(sprites.sheet(key) → { img, cols, frames, fw, fh, fps, loop, refH } 또는 null → 정지 그림/폴백)
  const sheet = (k) => (sprites && typeof sprites.sheet === 'function' ? sprites.sheet(k) : null);
  //  무기 아이콘(옆모습, 총구 오른쪽). 없으면 null → 호출부가 종전 도형을 그린다
  const icon = (id, mk = 1) => (sprites && typeof sprites.icon === 'function' ? sprites.icon(id, mk) : null);
  //  아이콘을 (x, y) 중심·높이 h 로. 폭은 그림 비율(가로로 긴 옆모습) — 칩·통 안에서 maxW 를 넘지 않게 줄인다
  function drawIconCentered(im, x, y, h, maxW) {
    let w = h * (im.width / im.height);
    if (maxW && w > maxW) { h *= maxW / w; w = maxW; }
    ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
  }
  //  시트의 한 칸을 (x, y) 중심에 그린다. bodyH = 몸통 높이(px). 배율은 칸 높이가 아니라 refH 기준 —
  //  칸이 큰 시트(사격 섬광·사망 파편)와 작은 시트 사이에서 몸 크기가 같게 보인다
  function drawSheetFrame(sh, frame, x, y, bodyH, alt = null) {
    const f = Math.max(0, Math.min(sh.frames - 1, Math.floor(frame)));
    const sx = (f % sh.cols) * sh.fw, sy0 = Math.floor(f / sh.cols) * sh.fh;
    const k = bodyH / sh.refH, dw = sh.fw * k, dh = sh.fh * k;
    //  alt = 같은 시트의 흰 실루엣(whiteOf) — 원본 대비 축척 a.k 로 같은 칸을 잘라 같은 자리에 찍는다
    if (alt) ctx.drawImage(alt.c, sx * alt.k, sy0 * alt.k, sh.fw * alt.k, sh.fh * alt.k, x - dw / 2, y - dh / 2, dw, dh);
    else ctx.drawImage(sh.img, sx, sy0, sh.fw, sh.fh, x - dw / 2, y - dh / 2, dw, dh);
  }
  //  피격 번쩍임용 흰 실루엣(r3.24): 그림 모양 그대로 흰색으로 칠한 사본을 그림마다 한 번만 만든다(작업 캔버스에 그림 → source-in 흰 채움).
  //   ⚠️본 캔버스에서 source-atop 을 쓰면 배경이 불투명이라 도로까지 하얘진다 — 그래서 사본을 만든다. 긴 변 maxPx 로 줄여 메모리를 아낀다.
  //   DOM 이 없는 환경(Node 검사)·그림이 아직 없으면 null → 호출부가 도형 폴백에 흰 채움으로 번쩍인다
  const whiteCache = new Map();
  function whiteOf(img, maxPx = 256) {
    if (!img || typeof document === 'undefined' || !document.createElement || !(img.width > 0)) return null;
    const hit = whiteCache.get(img);
    if (hit !== undefined) return hit;
    let out = null;
    try {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = HIT_FLASH_FILL;
      g.fillRect(0, 0, c.width, c.height);
      out = { c, k };
    } catch { out = null; }
    whiteCache.set(img, out);
    return out;
  }
  //  경과 시간 t(초) → 칸 번호. loop 면 순환, 아니면 마지막 칸에 머문다
  function sheetFrameAt(sh, t) {
    const f = Math.floor(Math.max(0, t) * sh.fps);
    return sh.loop ? f % sh.frames : Math.min(sh.frames - 1, f);
  }

  function drawImgCentered(key, x, y, h, fallbackFn) {
    const im = get(key);
    if (im) {
      const w = h * (im.width / im.height);
      ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
    } else if (fallbackFn) fallbackFn();
  }

  //  접지 그림자 — 유닛·적·통 발밑 공통
  function shadow(x, y, w) {
    ctx.fillStyle = 'rgba(20,25,35,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  //  외곽선 글자(밝은 배경 위에서도 읽히게)
  function outlinedText(text, x, y, px, color, weight = 'bold', lw = 5, maxWidth) {
    ctx.font = weight + ' ' + px + 'px ' + FONT;
    ctx.lineWidth = lw;
    ctx.strokeStyle = C.outline;
    if (maxWidth > 0) { ctx.strokeText(text, x, y, maxWidth); ctx.fillStyle = color; ctx.fillText(text, x, y, maxWidth); return; }
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  //  ── 원근 투영(r3.20) ─────────────────────────────────────────────────────────────────────────────────────────
  //  P = 이번 프레임의 투영기(draw 가 view.flat 으로 고른다 — 기본 '가까이', r4.1). 세계 물체는 전부 P.project(x, d) 한 곳을 지나 화면에 오른다.
  //   d = z − run.z(부대 기준선 앞 거리). 규칙 좌표(x, z)는 한 줄도 바뀌지 않는다 — 바뀌는 것은 화면에 찍히는 자리와 크기뿐.
  let P = projectorFor('close');
  const pj = (x, d) => P.project(x, d);
  //  화면 밖 판정은 **평면 기준 d** 로 한다(y < −m ⇔ d > LINE_Y + m, y > H + m ⇔ d < LINE_Y − H − m) —
  //   원근에서도 같은 물체 집합을 그려 평면과 그리기 호출 수가 같다(검사 V3-PROJECT 렌더). 원근에서 조금 더 밖에 있는 것을 그려도 해가 없다
  const offscreen = (d, m) => d > LINE_Y + m || d < LINE_Y - H - m;
  //  글자 크기: 배율을 곱하되 하한. 게이트 값·통 내구·표지 글은 PERSPECTIVE.minFont(15) — 01 §11 "멀리 있는 물체도 선택에 필요한 큰 숫자"
  const fsMin = (px, s) => Math.max(PERSPECTIVE.minFont, px * s);
  const fs = (px, s, min = 11) => Math.max(min, px * s);
  //  네 꼭짓점 경로(사다리꼴). 벽·차폐물·도로처럼 z 로 긴 물체는 앞뒤 가장자리를 따로 투영한다
  function quad(a, b, c, d) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }
  //  배경 그림·도로를 세로로 나누는 조각 수. 배경 그림은 조각마다 **세로만** 원근으로 샘플링한다(먼 곳 행이 위로 몰린다).
  //   ⚠️가로 배율은 걸지 않는다(2026-09-22 이사 지적 "우측 배경이 계단현상"): 조각마다 가운데 배율 하나로 폭을 줄이면 조각 경계마다
  //   가장자리가 (Δs/조각수)·(W/2) ≈ 5.6px 씩 점프해 세로선(기둥·창틀)이 톱니로 끊겼고, 그 빈 자리를 메우던 거울상이 위쪽 대칭 복제로 보였다.
  //   조각 수로 1px 아래까지 줄이려면 약 180조각(프레임 저하). 가로로 좁아지는 원근감은 도로 사다리꼴·차선·물체 크기가 담당한다
  const BG_STRIPS = 32;
  //  ARENA 그림의 검은 테두리 폭(논리 px) — 전폭으로 그릴 때도 화면 가장자리에 검은 띠가 보이지 않게 잘라 낸다
  const ARENA_CROP = 16;

  //  배경: 옆 땅 + BG 타일(있으면, 세로 32조각·가로 전폭) + 도로(사다리꼴) + 차선(세계 좌표의 대시를 투영) + 도로 경계.
  //  도로와 물체는 같은 속도로 흐른다(세계 고정): 그림 v = (LINE_Y − z) mod h 라 평면에서는 종전 타일 스크롤과 같은 그림이 나온다.
  //  아레나(r3.17): 셋째 인자 arena = { w, depth, k }(k 0 → 1 = 열리는 정도). k > 0 이면 도로 x 를 80~400 에서 w0~w1 로 보간하고
  //   차선 대시는 (1 − k) 로 사라지며, 그 위에 광장 그림(ARENA1/2, 조각마다 가로 배율) 또는 어두운 타원 바닥을 덧그린다. run.z 가 멈추므로 스크롤은 자동 정지
  function drawBackground(scroll, stageIdx, arena = null) {
    const pal = C.bg[Math.min(stageIdx, C.bg.length - 1)] ?? C.bg[0];
    const im = get('bg' + (stageIdx + 1));
    const k = arena ? Math.max(0, Math.min(1, arena.k ?? 1)) : 0;
    const w0 = arena && arena.w ? arena.w[0] : ROAD0, w1 = arena && arena.w ? arena.w[1] : ROAD1;
    const x0 = ROAD0 + (w0 - ROAD0) * k, x1 = ROAD1 + (w1 - ROAD1) * k;
    ctx.fillStyle = pal.side;
    ctx.fillRect(0, 0, W, H);
    if (im) {
      const h = Math.round(im.height * (W / im.width));   // 타일 한 장의 세계 길이(px)
      const ipp = im.width / W;                            // 논리 px 당 그림 px
      for (let i = 0; i < BG_STRIPS; i++) {
        const ya = (H * i) / BG_STRIPS, yb = (H * (i + 1)) / BG_STRIPS;
        const da = P.dOf(ya), db = P.dOf(yb);              // da > db(위쪽이 멀다)
        //  이 조각이 덮는 세계 구간 [db, da] → 그림 v 구간 [LINE_Y − da − scroll, +(da − db)). 타일 경계를 넘으면 두 번에 나눠 그린다.
        //   가로는 전폭(0~W) — 조각 경계에서 가장자리가 끊기지 않는다(위 BG_STRIPS 주석)
        let u = ((LINE_Y - da - scroll) % h + h) % h, left = da - db, dy = ya;
        while (left > 1e-6) {
          const seg = Math.min(left, h - u);
          const dh = (yb - ya) * seg / (da - db);
          ctx.drawImage(im, 0, u * ipp, im.width, seg * ipp, 0, dy, W, dh);
          u = (u + seg) % h; left -= seg; dy += dh;
        }
      }
    }
    //  도로: 화면 위 −10 부터 아래 H+10 까지 BG_STRIPS 등분 점으로 양 가장자리를 잇는 다각형(멀수록 좁아진다 = 사다리꼴)
    const yT = -10, yB = H + 10;
    const edge = (x, i) => { const y = yT + (yB - yT) * i / BG_STRIPS; return { x: pj(x, P.dOf(y)).x, y }; };
    const L = [], R = [];
    for (let i = 0; i <= BG_STRIPS; i++) { L.push(edge(x0, i)); R.push(edge(x1, i)); }
    ctx.globalAlpha = im ? 0.82 : 1;
    ctx.fillStyle = pal.road;
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i <= BG_STRIPS; i++) ctx.lineTo(L[i].x, L[i].y);
    for (let i = BG_STRIPS; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    //  광장 그림(2026-09-19 Gemini ARENA1=산업지대·ARENA2=적 공장): 있으면 열림 정도 k 만큼 겹쳐 그린다(세로만 조각, 가로 전폭). 없으면 종전 어두운 타원
    const arenaIm = k > 0 ? get(stageIdx >= 4 ? 'arena2' : 'arena1') : null;
    if (arenaIm) {
      ctx.globalAlpha = k;
      //  한 장을 전폭으로 편다(광장은 run.z 가 멈추므로 세로 원근 샘플링도 없다 — 조각으로 나눌 이유가 없다).
      //   그림의 검은 테두리(ARENA_CROP)만 잘라 내 화면 가장자리에 검은 띠가 보이지 않게 한다
      const c0 = ARENA_CROP * (arenaIm.width / W);
      ctx.drawImage(arenaIm, c0, 0, arenaIm.width - 2 * c0, arenaIm.height, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (k > 0 && !arenaIm) {
      //  광장 바닥: 보스 등장 자리(y 140)부터 화면 아래까지 덮는 어두운 타원 + 옅은 테두리(가로 반지름은 그 높이의 투영 폭)
      const yTop = 130, ym = (yTop + H) / 2, dm = P.dOf(ym);
      ctx.fillStyle = 'rgba(18,22,30,' + (0.6 * k).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(W / 2, ym, (pj(x1, dm).x - pj(x0, dm).x) / 2, (H - yTop) / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.18 * k).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    //  차선 2줄: 세계 좌표의 대시(주기 40 · 길이 18)를 앞뒤 끝점 투영으로 그린다 — 멀수록 짧고 가늘다. 광장에서는 차선이 사라진다
    if (k < 1) {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = pal.line;
      const lanes = [ROAD0 + (ROAD1 - ROAD0) / 3, ROAD0 + (ROAD1 - ROAD0) * 2 / 3];
      //  대시 범위는 평면 기준 d(−200~680)로 잡는다 — 원근에서도 같은 개수를 그려 flat 과 호출 수가 같다(화면 밖 대시는 무해)
      const dBot = LINE_Y - H - 40, dTop = LINE_Y + 40;
      const k0 = Math.floor((scroll + dBot) / 40), k1 = Math.ceil((scroll + dTop) / 40);
      for (let n = k0; n <= k1; n++) {
        const d0 = n * 40 - scroll, d1 = d0 + 18;
        ctx.lineWidth = 3 * P.s(d0);
        ctx.beginPath();
        for (const x of lanes) { const a = pj(x, d0), b = pj(x, d1); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(20,35,58,' + (arenaIm ? (0.35 * (1 - k)).toFixed(3) : '0.35') + ')';
    ctx.lineWidth = 4;
    for (const E of [L, R]) {
      ctx.beginPath(); ctx.moveTo(E[0].x, E[0].y);
      for (let i = 1; i <= BG_STRIPS; i++) ctx.lineTo(E[i].x, E[i].y);
      ctx.stroke();
    }
  }

  //  차폐물(r3.11): 낮은 모래주머니 둔덕 — 탄만 막고 통로는 막지 않는다. 벽과 달리 도로 폭 일부만 차지하고 색이 어둡다. 앞(z1)·뒤(z0) 가장자리를 따로 투영한 사다리꼴
  function drawCovers(run) {
    for (const w of run.covers || []) {
      const d0 = w.z0 - run.z, d1 = w.z1 - run.z;
      if (d0 > LINE_Y + 10 || d1 < LINE_Y - H - 10) continue;
      const tl = pj(w.x0, d1), tr = pj(w.x1, d1), bl = pj(w.x0, d0), br = pj(w.x1, d0);
      const s0 = bl.s, hh = Math.max(8 * s0, bl.y - tl.y);
      ctx.fillStyle = 'rgba(20,25,35,0.28)';
      quad({ x: tl.x - 2 * s0, y: tl.y + 5 * s0 }, { x: tr.x + 2 * s0, y: tr.y + 5 * s0 }, { x: br.x + 2 * s0, y: br.y + 5 * s0 }, { x: bl.x - 2 * s0, y: bl.y + 5 * s0 }); ctx.fill();
      ctx.fillStyle = '#5B5347';
      quad(tl, tr, br, bl); ctx.fill();
      //  윗면(앞쪽 45%)
      const m = 0.45, ml = { x: tl.x + (bl.x - tl.x) * m, y: tl.y + (bl.y - tl.y) * m }, mr = { x: tr.x + (br.x - tr.x) * m, y: tr.y + (br.y - tr.y) * m };
      ctx.fillStyle = '#8A7B62';
      quad({ x: tl.x + 3 * s0, y: tl.y + 2 * s0 }, { x: tr.x - 3 * s0, y: tr.y + 2 * s0 }, { x: mr.x - 3 * s0, y: mr.y }, { x: ml.x + 3 * s0, y: ml.y }); ctx.fill();
      //  사선 줄무늬 = '탄 막힘' 표시(뒤 가장자리 위)
      ctx.fillStyle = 'rgba(255,214,90,0.55)';
      for (let x = w.x0 + 6; x < w.x1 - 10; x += 22) ctx.fillRect(pj(x, d0).x, bl.y - 7 * s0, 12 * s0, 4 * s0);
    }
  }

  //  벽: 도로 위 회색 분리대(상단 하이라이트). 앞(z1)·뒤(z0)를 화면 −10~H+10 에 해당하는 d 로 자른 뒤 네 꼭짓점을 투영한다
  function drawWalls(run) {
    //  자르는 범위도 평면 기준 d(화면 −10~H+10 에 해당) — 줄무늬 개수가 투영 모드와 무관하게 같다
    const dTop = LINE_Y + 10, dBot = LINE_Y - H - 10;
    for (const w of run.walls) {
      const d0 = w.z0 - run.z, d1 = w.z1 - run.z;
      if (d0 > LINE_Y + 10 || d1 < LINE_Y - H - 10) continue;
      const dn = Math.max(dBot, d0), df = Math.min(dTop, d1);
      const tl = pj(w.x0, df), tr = pj(w.x1, df), bl = pj(w.x0, dn), br = pj(w.x1, dn);
      const s0 = bl.s;
      ctx.fillStyle = 'rgba(20,25,35,0.25)';
      quad({ x: tl.x - 3 * tl.s, y: tl.y + 4 * tl.s }, { x: tr.x + 3 * tr.s, y: tr.y + 4 * tr.s }, { x: br.x + 3 * s0, y: br.y + 4 * s0 }, { x: bl.x - 3 * s0, y: bl.y + 4 * s0 }); ctx.fill();
      ctx.fillStyle = C.wall;
      quad(tl, tr, br, bl); ctx.fill();
      ctx.fillStyle = C.wallTop;
      quad({ x: tl.x + 3 * tl.s, y: tl.y }, { x: tr.x - 3 * tr.s, y: tr.y }, { x: br.x - 3 * s0, y: br.y }, { x: bl.x + 3 * s0, y: bl.y }); ctx.fill();
      //  분리대 줄무늬(세계 간격 36, 앞에서부터 12 뒤)
      ctx.fillStyle = 'rgba(20,35,58,0.35)';
      for (let d = df - 12; d > dn; d -= 36) { const a = pj(w.x0 + 3, d), b = pj(w.x1 - 3, d); ctx.fillRect(a.x, a.y, b.x - a.x, 6 * a.s); }
      //  통로 안내 표지: 벽 앞머리(z0)에 좌·우 통로 내용물. 확정선(z0-60)까지 700px = 3.7초의 판단 시간을 준다
      if (w.signs) {
        //   화면 위 끝에서 들어올 때 HUD 줄에 가려지지 않게 표지 상자 위 변을 HUD 아래(TIP_MIN_Y)로 클램프한다(gateTip·목표 표지와 같은 규칙,
        //   검수 반영 2026-09-20 — 원근에선 y ≈ 3 까지 올라가 '+3·기관총' 이 HUD 제목에 가려졌고 완독 시점이 0.25초 늦었다)
        if (!offscreen(d0, 40)) {
          const sl = pj((ROAD0 + w.x0) / 2, d0), sr = pj((w.x1 + ROAD1) / 2, d0);
          drawSign(w.signs.L, sl.x, Math.max(TIP_MIN_Y + 20 * sl.s, sl.y + 26 * sl.s), sl.s);
          drawSign(w.signs.R, sr.x, Math.max(TIP_MIN_Y + 20 * sr.s, sr.y + 26 * sr.s), sr.s);
        }
        //  통로 확정선(여기서 통로가 정해진다) — 벽과 같은 회색 실선
        const dc = d0 - BAL3.squad.wallLead;
        if (!offscreen(dc, 10)) {
          const a = pj(ROAD0, dc), b = pj(ROAD1, dc);
          ctx.strokeStyle = 'rgba(154,161,172,0.75)';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
  }

  //  통로 안내 표지 1개(아이콘 + 숫자). kind 'none' = 빈 통로. s = 그 자리의 배율(상자·아이콘은 s 배, 글은 하한 15px)
  function drawSign(sg, x, y, s = 1) {
    if (!sg) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(16,22,31,0.72)';
    roundRect(x - 44 * s, y - 20 * s, 88 * s, 40 * s, 8 * s);
    ctx.fill();
    if (sg.kind === 'soldier') {
      ctx.fillStyle = C.soldier;
      for (let i = 0; i < 3; i++) {
        const px = x - (28 - i * 11) * s;
        ctx.beginPath(); ctx.arc(px, y - 8 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(px - 3 * s, y - 4 * s, 6 * s, 9 * s);
      }
      outlinedText('+' + (sg.n ?? 0), x + 16 * s, y, fsMin(20, s), C.supplyBody, 'bold', 4);
    } else if (sg.kind === 'weapon') {
      const wp = WEAPONS[sg.weapon] ?? WEAPONS.rifle;
      ctx.fillStyle = wp.color;
      roundRect(x - 34 * s, y - 6 * s, 28 * s, 9 * s, 3 * s); ctx.fill();
      outlinedText(wp.name, x + 12 * s, y, fsMin(16, s), wp.color, 'bold', 4);
    } else if (sg.kind === 'chain') {
      ctx.fillStyle = C.chainPad;
      roundRect(x - 34 * s, y - 10 * s, 22 * s, 18 * s, 4 * s); ctx.fill();
      outlinedText('증원', x + 10 * s, y, fsMin(16, s), C.chainPad, 'bold', 4);
    } else if (sg.kind === 'lottery') {
      //  랜덤 길: 무엇이 걸릴지 모른다는 표시. 확정선을 지나야 실제 물체가 드러난다(계약서 3-9)
      outlinedText('?', x - 22 * s, y, fsMin(26, s), C.gold, 'bold', 5);
      outlinedText('랜덤', x + 16 * s, y, fsMin(17, s), C.gold, 'bold', 4);
    } else if (sg.kind === 'capsule') {
      //  구출 캡슐(r3.14): 작은 유리 캡슐 아이콘 + '구출'. 뒤 회차의 분리벽 안 캡슐에 대비한 표지(C[7] 에는 벽이 없다)
      ctx.fillStyle = C.capsuleGlass;
      roundRect(x - 34 * s, y - 13 * s, 16 * s, 26 * s, 8 * s); ctx.fill();
      ctx.strokeStyle = C.capsule; ctx.lineWidth = 2;
      roundRect(x - 34 * s, y - 13 * s, 16 * s, 26 * s, 8 * s); ctx.stroke();
      outlinedText('구출', x + 12 * s, y, fsMin(16, s), C.capsule, 'bold', 4);
    } else {
      outlinedText('빈 길', x, y, fsMin(17, s), C.gateZero, 'bold', 4);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  잠김 표시(계약서 6장 N2-②): 숫자를 가리지 않는 칸 모서리의 작은 자물쇠. 색만으로 구분하지 않기 위한 형태 신호다.
  //  scale 을 주면 같은 모양을 그 배율로 키워 그린다(함정 칸의 큰 자물쇠 — 2026-09-17 이사 결정 ③ · 원근 배율도 여기로 곱해 들어온다).
  function drawLockBadge(x, y, scale = 1) {
    ctx.save();
    //  배율 1 이어도 같은 변환을 거친다 — 투영 모드와 무관하게 그리기 호출 수가 같도록(V3-PROJECT)
    ctx.translate(x, y); ctx.scale(scale, scale); x = 0; y = 0;
    //  고리(열린 반원) → 몸통 순서. 회색 판 위에서도 보이게 어두운 테두리를 먼저 깐다
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y - 4, 5, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = C.wallTop;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y - 4, 5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = C.outline;
    roundRect(x - 8, y - 2, 16, 13, 3);
    ctx.fill();
    ctx.fillStyle = C.wallTop;
    roundRect(x - 6.5, y - 0.5, 13, 10, 2.5);
    ctx.fill();
    ctx.restore();
  }

  //  r4.10 보스 판 왕관(타이틀 스테이지 칸): 가운데 (x, y) · 폭 BOSS_BADGE.w — 뾰족한 세 봉우리 + 받침. 어두운 테두리를 먼저 깔아 어느 바탕에서도 보이게
  function drawCrownBadge(x, y) {
    const B = BOSS_BADGE, hw = B.w / 2, hh = B.h / 2;
    const pts = [[-hw, hh], [-hw, -hh + 3], [-hw / 2, 0], [0, -hh], [hw / 2, 0], [hw, -hh + 3], [hw, hh]];
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5; ctx.strokeStyle = B.edge; ctx.stroke();
    ctx.fillStyle = B.color; ctx.fill();
    ctx.fillStyle = B.edge;
    ctx.fillRect(-hw + 2, hh - 3.5, B.w - 4, 1.5);
    ctx.restore();
  }

  //  함정 칸의 붉은 봉쇄 바: 칸 폭(화면 x0~x1)을 가로지르는 굵은 붉은 바 + 대각 줄무늬. 숫자보다 **먼저** 그려 숫자를 가리지 않는다.
  //  ⚠️셔터(회색 빗금)와 달리 걷히지 않는다 — 통과한 뒤에도 행 기본 불투명도(0.32)로 흐리게 남아 '여기서 잃었다'가 화면에 남는다
  function drawTrapBar(x0c, x1c, y, s) {
    const x0 = x0c + 3 * s, w = x1c - x0c - 6 * s;
    const bh = 30 * s, by = y - bh / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, by, w, bh);
    ctx.clip();
    ctx.fillStyle = 'rgba(122,26,34,0.92)';
    ctx.fillRect(x0, by, w, bh);
    ctx.strokeStyle = 'rgba(255,106,61,0.85)';
    ctx.lineWidth = 7 * s;
    ctx.beginPath();
    for (let k = -bh; k < w + bh; k += 18 * s) {
      ctx.moveTo(x0 + k, by + bh);
      ctx.lineTo(x0 + k + bh, by);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = C.warn;
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, by, w, bh);
  }

  //  함정 배지('쏴도 안 줄어듦'): 칸 **위**에 표지판처럼 띄운다(화면 고정 크기 — 주석 계열).
  //  ⚠️옆 차선에 두면 반대편 통로의 보급 통·벽에 가려진다(2026-09-17 렌더 실측 — 왼쪽 통이 배지를 덮었다).
  //   칸 위 짧은 글(y-hh/2-34 부터 26px)보다 더 위에 두어 둘이 겹치지 않게 한다
  function drawTrapBadge(bx, y, hh) {
    const bw = 118, bh = 24;
    const by = Math.max(TIP_MIN_Y + 40, y - hh / 2 - 48);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(60,10,16,0.88)';
    roundRect(bx - bw / 2, by - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = C.warn;
    ctx.lineWidth = 2;
    roundRect(bx - bw / 2, by - bh / 2, bw, bh, 8);
    ctx.stroke();
    outlinedText(TRAP_BADGE_TEXT, bx, by, 13, C.hud, 'bold', 3);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  게이트 행: 칸 사각형 + 부호 숫자 + 색. 피격 흰 플래시·숫자 튐(셸 fx.gateFlash 타이머, 규칙의 cell.flashT 는 읽지 않는다). 통과 뒤 흐리게
  //  원근(r3.20): 칸 x0·x1 을 행 z 에서 투영(사다리꼴 도로 위의 칸), 칸 높이 = 58·s(하한 18), 숫자 = 38·s(하한 15) — 멀어도 읽힌다
  //  셔터(armZ): 아직 안 열린 행은 회색 빗금 판을 덮되 **숫자·부호는 판 위에 선명하게** 그리고(2026-09-17 검수 N2-①),
  //   잠김은 칸 모서리의 작은 자물쇠로 따로 알린다(N2-②). 열리는 순간(fx.gateOpen)에는 판이 위로 걷힌다.
  //  ⚠️함정 행(isTrapGateRow)은 셔터 표현을 **하나도** 쓰지 않는다 — 개시선·회색 빗금·작은 자물쇠·닫힘 안내를 전부 건너뛴다.
  //   '가까워지면 열림'을 배운 사람에게 열려도 안 오르는 칸을 셔터 모양으로 보여주면 규칙을 두 번 가르치는 셈이다.
  //   대신 붉은 봉쇄 바 + 큰 자물쇠 + 배지로 '사격이 안 먹히는 장치'를 즉시 알린다(2026-09-17 이사 결정 ③ 함정 외형 A).
  //   ⚠️armZ·armed 규칙 자체는 건드리지 않는다 — 바뀌는 것은 그리기뿐이다.
  //  r4.10 결승선(대물결 판): 체크무늬 두 줄이 도로를 가로지르고, 도로 양 끝 기둥 위를 잇는 표지 띠 가운데에 '결승'.
  //   세계 좌표로 그려 원근을 따른다(가까워질수록 커진다 — 멀리서도 보이게 글자는 하한). 규칙 run.finishZ 를 읽기만 한다
  function drawFinishLine(run) {
    if (run.finishZ == null) return;
    const d = run.finishZ - run.z;
    if (offscreen(d, 90)) return;
    const L = FINISH_LOOK, n = L.cells, half = L.depth / 2;
    ctx.save();
    ctx.globalAlpha = 1;
    for (let r = 0; r < 2; r++) {
      const za = d - half + r * half, zb = za + half;
      for (let i = 0; i < n; i++) {
        const xa = ROAD0 + (ROAD1 - ROAD0) * i / n, xb = ROAD0 + (ROAD1 - ROAD0) * (i + 1) / n;
        quad(pj(xa, za), pj(xb, za), pj(xb, zb), pj(xa, zb));
        ctx.fillStyle = (i + r) % 2 ? L.dark : L.light;
        ctx.fill();
      }
    }
    //  기둥 두 개(도로 양 끝) + 그 꼭대기를 잇는 표지 띠
    const a = pj(ROAD0 + 4, d + half), b = pj(ROAD1 - 4, d + half), k = (a.s + b.s) / 2;
    const ph = 62 * k, bh = Math.max(20, 24 * k);
    ctx.fillStyle = L.post;
    for (const p of [a, b]) ctx.fillRect(p.x - 3 * k, p.y - ph, 6 * k, ph);
    ctx.fillStyle = L.board;
    roundRect(a.x - 4 * k, a.y - ph - bh / 2, b.x - a.x + 8 * k, bh, 6 * k); ctx.fill();
    ctx.strokeStyle = L.sign; ctx.lineWidth = 2;
    roundRect(a.x - 4 * k, a.y - ph - bh / 2, b.x - a.x + 8 * k, bh, 6 * k); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlinedText(L.label, (a.x + b.x) / 2, a.y - ph + 1, fs(18, k, 14), L.sign, '900', 4);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function drawGateRow(row, fx, runZ) {
    const d = row.z - runZ;
    if (offscreen(d, 60)) return;
    const s = P.s(d), y = P.y(d);
    const hh = Math.max(PERSPECTIVE.minGateH, 58 * s);
    const trap = isTrapGateRow(row);
    const flashMap = fx && fx.gateFlash ? fx.gateFlash : null;
    //  0 = 완전히 닫힘 · 1 = 완전히 열림
    const openLeft = fx && fx.gateOpen ? (fx.gateOpen[row.id] ?? 0) : 0;
    const openT = BAL3.gate.openT || 0.25;
    const shut = trap || row.passed ? 0 : row.armed ? (openLeft > 0 ? openLeft / openT : 0) : 1;
    //  사격 개시선: 아직 닫힌 행이면 도로 위 run.z + armZ 위치에 점선 1줄("여기서부터 쏠 수 있다")
    if (!trap && !row.armed && !row.passed && row.armZ != null && runZ != null) {
      if (!offscreen(row.armZ, 10)) {
        const a = pj(ROAD0, row.armZ), b = pj(ROAD1, row.armZ);
        ctx.save();
        ctx.strokeStyle = gateColor(row.cells[0] ? row.cells[0].value : 0);
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        //  선 옆 작은 글(N2-⑤). ⚠️주체는 게이트다 — "플레이어가 선을 넘는다"로 읽히면 통로 확정선과 헷갈린다
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 0.92;
        outlinedText(ARM_LINE_TEXT, a.x + 6, a.y - 7, 12, C.hud, '600', 3);
        ctx.restore();
      }
    }
    const base = row.passed ? 0.32 : 0.92;
    ctx.globalAlpha = base;
    for (const c of row.cells) {
      const col = gateColor(c.value);
      const left = flashMap ? (flashMap[row.id + ':' + c.idx] ?? 0) : 0;
      const flash = left > 0 ? Math.min(1, left / BAL3.gate.flashT) : 0;
      const x0c = pj(c.x0, d).x, x1c = pj(c.x1, d).x;
      const bx = x0c + 3 * s, bw = x1c - x0c - 6 * s;
      ctx.fillStyle = flash > 0 ? 'rgba(255,255,255,' + (0.35 + flash * 0.5) + ')' : 'rgba(16,22,31,0.66)';
      roundRect(bx, y - hh / 2, bw, hh, 10 * s);
      ctx.fill();
      ctx.strokeStyle = trap ? C.warn : col;
      ctx.lineWidth = 4;
      roundRect(bx, y - hh / 2, bw, hh, 10 * s);
      ctx.stroke();
      const cx = (x0c + x1c) / 2;
      //  함정 칸: 붉은 봉쇄 바(숫자 아래). 셔터 판은 그리지 않는다
      if (trap) drawTrapBar(x0c, x1c, y, s);
      //  셔터 판(회색 빗금) — 숫자보다 **먼저** 그린다. 열리는 동안 남은 판이 위쪽으로 줄어든다(문이 위로 걷히는 동작)
      if (shut > 0) {
        const ph = hh * shut;
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, y - hh / 2, bw, ph);
        ctx.clip();
        ctx.fillStyle = 'rgba(120,128,140,0.82)';
        ctx.fillRect(bx, y - hh / 2, bw, hh);
        ctx.strokeStyle = 'rgba(30,38,50,0.55)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let k = -hh; k < bw + hh; k += 12 * s) {
          ctx.moveTo(bx + k, y + hh / 2);
          ctx.lineTo(bx + k + hh, y - hh / 2);
        }
        ctx.stroke();
        ctx.restore();
      }
      //  숫자: 피격 직후 살짝 튄다. **셔터·봉쇄 바 위에 같은 불투명도로** 그린다(가려도 무엇이 걸린 판인지 그대로 읽힌다). 하한 15px
      const px = fsMin(38, s) + Math.round(flash * 8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = base;
      outlinedText(gateLabel(c.value), cx, y, px, flash > 0.5 ? C.gateFlash : col, 'bold', 6);
      //  확정 칸(값이 상한 = 쏴도 오르지 않는다): 칸 아래에 '확정' 꼬리표를 붙여 '안 먹히는 이유'를 화면에 남긴다.
      //   r3.30: 함정(음수) 칸만이 아니라 **쏴서 상한까지 올린 칸**에도 붙인다 — 그 칸은 이제 탄을 통과시키므로(gates.isGateCellFixed)
      //   '왜 총알이 지나가는지'가 화면에 보여야 한다
      //  ⚠️숫자와 겹치지 않게 칸 **바깥**(아래)에 그린다 — 숫자가 38px 라 칸 안에서는 밑줄이 물린다
      if (c.maxValue != null && c.value >= c.maxValue) {
        outlinedText('확정', cx, y + hh / 2 + fs(13, s, 10), fsMin(16, s), col, 'bold', 4);
      }
      ctx.textBaseline = 'alphabetic';
      //  자물쇠: 함정 칸은 **크게**(봉쇄 장치의 일부) · 닫힌 셔터 칸은 왼쪽 위 모서리에 작게(숫자 자리를 비켜 간다).
      //  ⚠️셔터가 걷히는 중(armed 직후)에는 이미 잠김이 풀렸으므로 그리지 않는다 — 셔터 판만 남아 걷힌다
      if (trap) drawLockBadge(x0c + 20 * s, y, 1.4 * s);
      else if (!row.armed && !row.passed) drawLockBadge(x0c + 20 * s, y - hh / 2 + 15 * s, s);
      ctx.globalAlpha = base;
    }
    //  함정 배지는 아직 안 지난 행에만(지난 뒤에는 봉쇄 바만 흐리게 남는다)
    const rx = pj((row.cells[0].x0 + row.cells[row.cells.length - 1].x1) / 2, d).x;
    if (trap && !row.passed) drawTrapBadge(rx, y, hh);
    //  짧은 안내 글(N2-③): 닫힌 동안 '가까워지면 열림' · 처음 열릴 때 '지금 쏘면 +1'. 각 BAL3.fx.gateTipSec 초, 칸 위(화면 고정 크기)
    //  ⚠️함정 행이 아직 안 열렸을 때는 셸이 무엇을 넣어 두었든 그리지 않는다 — '가까워지면 열림'은 이 행에 맞지 않는 약속이다
    const tip = fx && fx.gateTip ? fx.gateTip[row.id] : null;
    if (tip && tip.t > 0 && !(trap && !row.armed)) {
      const tipSec = BAL3.fx.gateTipSec || 1.2;
      //  ⚠️행이 화면 위쪽 끝에서 들어올 때는 칸 위가 화면 밖이다 — 그 동안에는 HUD 아래(y 96)에 붙여 두고,
      //   행이 내려오면 자연스럽게 칸 위로 따라 붙는다. 안 그러면 1.2초 내내 화면 밖에 그려진다(2026-09-17 렌더 실측).
      const top = Math.max(TIP_MIN_Y, y - hh / 2 - 34);
      ctx.save();
      ctx.globalAlpha = Math.min(1, tip.t / (tipSec * 0.4));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(20,35,58,0.82)';
      const tw = Math.max(96, tip.text.length * 15 + 20);
      roundRect(rx - tw / 2, top, tw, 26, 8);
      ctx.fill();
      outlinedText(tip.text, rx, top + 13, 15, C.hud, 'bold', 4);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  //  보급 통 내용물: 병사 실루엣 n / 무기 아이콘 / 파란 설비. k = 그 자리의 배율(아이콘 k 배, 글은 하한 15px)
  function drawSupplyContents(s, x, y, k = 1) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s.kind === 'soldier') {
      const n = s.payload.n ?? 0;
      //  병사 수 아이콘(2026-09-19 Gemini ICON_soldiers_1~3): 1·2·3명은 그 그림, 4명 이상은 3명 그림 + 숫자. 없으면 종전 실루엣
      drawImgCentered('soldiers_' + Math.max(1, Math.min(3, n)), x, y - 8 * k, 30 * k, () => {
        const show = Math.min(n, 6);
        for (let i = 0; i < show; i++) {
          const px = x + (i - (show - 1) / 2) * 9 * k, py = y - 6 * k;
          ctx.fillStyle = C.soldier;
          ctx.beginPath();
          ctx.arc(px, py - 5 * k, 3 * k, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(px - 3 * k, py - 1 * k, 6 * k, 8 * k);
        }
      });
      outlinedText('+' + n, x, y + 16 * k, fsMin(18, k), C.supplyBody, 'bold', 4);
    } else if (s.kind === 'weapon') {
      const w = WEAPONS[s.payload.weapon] ?? WEAPONS.rifle;
      const im = icon(w.id);
      if (im) drawIconCentered(im, x, y - 7 * k, 22 * k, 40 * k);
      else {
        ctx.fillStyle = w.color;
        roundRect(x - 16 * k, y - 12 * k, 32 * k, 10 * k, 3 * k);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - 12 * k, y - 10 * k, 8 * k, 6 * k);
      }
      outlinedText(w.name, x, y + 14 * k, fsMin(15, k), w.color, 'bold', 4);
    } else if (s.kind === 'capsule') {
      //  구출 캡슐(r3.14): 유리 안의 사람 실루엣(머리 원 + 몸통, 그림자 없음) + 합류 수. 몸체(유리·받침)는 drawCapsuleBody 가 먼저 그린다
      const r = s.r * k;
      if (!get('capsule')) {
        ctx.fillStyle = C.soldier;
        ctx.beginPath(); ctx.arc(x, y - r * 0.5, r * 0.22, 0, Math.PI * 2); ctx.fill();
        roundRect(x - r * 0.26, y - r * 0.24, r * 0.52, r * 0.58, r * 0.12); ctx.fill();
      }
      outlinedText('+' + (s.payload.n ?? 0), x, y + r * 0.45, fsMin(14, k), C.supplyBody, 'bold', 4);
    } else {
      ctx.fillStyle = C.chainPad;
      roundRect(x - 14 * k, y - 14 * k, 28 * k, 20 * k, 4 * k);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x - 9 * k, y - 9 * k, 18 * k, 3 * k);
      ctx.fillRect(x - 9 * k, y - 3 * k, 18 * k, 3 * k);
      outlinedText('증원 설비', x, y + 16 * k, fs(13, k), C.chainPad, 'bold', 4);
    }
    ctx.textBaseline = 'alphabetic';
  }

  //  차량 통 몸체(r3.13): 궤도 점선 + 그림자 + 둥근 상자 + 바퀴 4 + 앞유리 + 진행 방향 화살표. 새 그림 없음(캔버스 도형만).
  //   나머지(내용물·내구 숫자·차폐 막·missed/skipped 알파)는 정지 통과 같은 경로를 그대로 공유한다.
  //   방향은 렌더 안에서만 셈한다(규칙 필드 추가 없음): 이번 STEP 에 움직인 쪽, 진입 전이면 '갈 방향', 멈춘 뒤(opened/missed)엔 화살표 없음
  //   x·y·r = 투영된 중심과 반지름, k = 배율, d = 행 거리(궤도 양 끝 x0·x1 을 같은 d 에서 투영)
  function drawVehicleBody(s, x, y, r, k, d) {
    const m = s.move;
    const px = s.prevX ?? s.x;
    const dir = s.x !== px ? Math.sign(s.x - px) : (s.moveT === null ? (s.homeX === m.x0 ? 1 : -1) : 0);
    const mx0 = pj(m.x0, d).x, mx1 = pj(m.x1, d).x;
    //  궤도선: 이 통이 왕복하는 구간(x0~x1)을 미리 알린다 — '앞을 보고 쏘라'는 장치의 핵심 정보. 양 끝에 짧은 눈금
    ctx.save();
    ctx.strokeStyle = C.supplyDark;
    ctx.globalAlpha = ctx.globalAlpha * 0.35;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(mx0, y); ctx.lineTo(mx1, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(mx0, y - 6 * k); ctx.lineTo(mx0, y + 6 * k);
    ctx.moveTo(mx1, y - 6 * k); ctx.lineTo(mx1, y + 6 * k);
    ctx.stroke();
    ctx.restore();
    shadow(x, y + r * 0.95, r * 1.05);
    //  차량 그림(2026-09-19 Gemini D_vehicle, 뒤·위 3/4 시점)이 있으면 그것을, 없으면 종전 도형(바퀴 4 + 상자 + 앞유리)
    drawImgCentered('vehicle', x, y - r * 0.15, r * 2.5, () => {
      //  바퀴 4개(반지름 6·k, 외곽선 색)는 몸체보다 먼저 — 위아래 가장자리에서 반쯤 내다보여 위에서 본 차로 읽힌다
      ctx.fillStyle = C.outline;
      for (const kx of [-1, 1]) for (const ky of [-1, 1]) {
        ctx.beginPath(); ctx.arc(x + kx * (r - 8 * k), y + ky * (r * 0.7 + 2 * k), 6 * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = C.supplyDark;
      roundRect(x - r - 4 * k, y - r * 0.7, r * 2 + 8 * k, r * 1.4, 8 * k); ctx.fill();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 4;
      roundRect(x - r - 4 * k, y - r * 0.7, r * 2 + 8 * k, r * 1.4, 8 * k); ctx.stroke();
      //  앞유리: 진행 방향 쪽 가장자리 안쪽(방향이 없으면 오른쪽)
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(dir < 0 ? x - r - 4 * k + 5 * k : x + r + 4 * k - 11 * k, y - r * 0.45, 6 * k, r * 0.9);
    });
    //  방향 화살표: 몸체 밖 진행 방향 쪽 작은 삼각형(꼭짓점 x = x + dir·(r + 22·k))
    if (dir !== 0) {
      ctx.save();
      ctx.fillStyle = C.gold;
      ctx.globalAlpha = ctx.globalAlpha * 0.9;
      const ax = x + dir * (r + 12 * k);
      ctx.beginPath(); ctx.moveTo(ax + dir * 10 * k, y); ctx.lineTo(ax, y - 6 * k); ctx.lineTo(ax, y + 6 * k); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  //  구출 캡슐 몸체(r3.14): 그림자 + 받침(어두운 받침 + 청록 윗선) + 연한 청록 반투명 유리 캡슐 + 왼쪽 위 흰 하이라이트. 새 그림 없음(캔버스 도형만).
  //   sprites 에 'capsule' 그림이 들어오면 drawImgCentered 폴백 한 줄로 교체할 수 있게 폴백 함수 꼴로 둔다.
  //   내용물(실루엣)·'목표' 표지·내구 숫자·차폐 막·missed/skipped 알파는 정지 통과 같은 경로를 그대로 공유한다. x·y·r = 투영값
  function drawCapsuleBody(x, y, r, k) {
    shadow(x, y + r * 0.95, r * 0.9);
    drawImgCentered('capsule', x, y, r * 2.2, () => {
      //  받침: 폭 1.8r(크레이트 폴백 2r 과 다른 크기 — 검사가 폭으로 구분한다)
      ctx.fillStyle = C.supplyDark;
      roundRect(x - r * 0.9, y + r * 0.55, r * 1.8, r * 0.5, 6 * k); ctx.fill();
      ctx.strokeStyle = C.capsule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + r * 0.55); ctx.lineTo(x + r * 0.9, y + r * 0.55); ctx.stroke();
      //  유리
      ctx.fillStyle = C.capsuleGlass;
      roundRect(x - r * 0.75, y - r * 1.05, r * 1.5, r * 2.0, r * 0.75); ctx.fill();
      ctx.strokeStyle = C.capsule; ctx.lineWidth = 3;
      roundRect(x - r * 0.75, y - r * 1.05, r * 1.5, r * 2.0, r * 0.75); ctx.stroke();
      //  하이라이트(왼쪽 위 세로 선)
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * 0.5;
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - r * 0.45, y - r * 0.6); ctx.lineTo(x - r * 0.45, y + r * 0.25); ctx.stroke();
      ctx.restore();
    });
  }

  //  '목표' 표지(r3.14): 캡슐 유리 위 금색 알약(화면 고정 크기). 화면 위 끝에서 들어올 때 잘리지 않게 HUD 아래(TIP_MIN_Y)로 클램프(gateTip 과 같은 규칙)
  function drawObjectiveBadge(x, y, r) {
    const bw = 44, bh = 18;
    const by = Math.max(TIP_MIN_Y, y - r * 1.05 - 16);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    roundRect(x - bw / 2, by - bh / 2, bw, bh, 9); ctx.fill();
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = C.outline;
    ctx.fillText('목표', x, by);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  보급 통: 그림 + 내용물 + 남은 내구 숫자(병력 수가 아니다, 하한 15px). chain 발판 열은 '+1'. 위치·반지름은 통 z 에서 투영
  function drawSupply(s, runZ) {
    //  발판(통보다 앞 z = 화면 위쪽)
    for (const p of s.pads) {
      const dp = p.z - runZ;
      if (offscreen(dp, 30)) continue;
      const q = pj(p.x, dp), k = q.s;
      ctx.globalAlpha = p.taken ? 0.25 : 0.85;
      ctx.fillStyle = C.chainPad;
      roundRect(q.x - 34 * k, q.y - 12 * k, 68 * k, 24 * k, 8 * k);
      ctx.fill();
      if (!p.taken) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        outlinedText('+1', q.x, q.y, fsMin(18, k), '#FFFFFF', 'bold', 4);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.globalAlpha = 1;
    }
    if (s.opened && s.kind !== 'chain') return;
    const d = s.z - runZ;
    if (offscreen(d, 60)) return;
    const q = pj(s.x, d), x = q.x, y = q.y, k = q.s;
    const r = s.r * k;
    //  차폐(coverZ): 통로가 정해지고 잠시 뒤에 걷힌다. 걷히기 전에는 통 위에 회색 막이 덮여 있다
    const covered = s.coverZ != null && runZ != null && runZ < s.coverZ;
    //  skipped = 구조적으로 얻을 수 없던 대안. '밀려나며 사라지는' missed 연출과 달리 흐려지며 뒤로 빠진다
    ctx.globalAlpha = s.skipped ? 0.22 : s.missed ? 0.35 : 1;
    //  차량(r3.13)·캡슐(r3.14)은 몸체 그리기만 갈아 끼운다 — 정지 통 경로는 한 줄도 바뀌지 않는다
    if (s.move) drawVehicleBody(s, x, y, r, k, d);
    else if (s.kind === 'capsule') drawCapsuleBody(x, y, r, k);
    else {
      shadow(x, y + r * 0.95, r * 0.9);
      drawImgCentered('supply', x, y, r * 2.1, () => {
        ctx.fillStyle = C.supplyDark;
        roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 8 * k); ctx.fill();
        ctx.strokeStyle = C.gold; ctx.lineWidth = 4;
        roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 8 * k); ctx.stroke();
      });
    }
    if (!s.opened) drawSupplyContents(s, x, y, k);
    //  판 목표 표지(r3.14): 아직 얻을 수 있는 캡슐에만(놓친 뒤엔 흐린 몸체만 남는다)
    if (s.kind === 'capsule' && !s.opened && !s.missed && !s.skipped) drawObjectiveBadge(x, y, r);
    //  피격 활성 전(armZ, r3.18): 통 둘레 회색 점선 링 + 모서리 자물쇠(셔터 잠김과 같은 형태 신호). 내구 숫자는 회색
    const unarmed = s.armZ != null && runZ != null && !s.opened && s.z - runZ > s.armZ;
    if (unarmed) {
      ctx.save();
      ctx.strokeStyle = C.wallTop; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(x, y, r + 8 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawLockBadge(x + r - 2 * k, y - r + 4 * k, k);
    }
    //  남은 내구 숫자(주황) — 내용물과 구분되는 위치(통 아래)
    ctx.textAlign = 'center';
    if (!s.opened) outlinedText(String(Math.max(0, Math.ceil(s.durability))), x, y + r + 18 * k, fsMin(16, k), unarmed ? C.gateZero : C.bulletHeavy, 'bold', 4);
    else if (!s.locked) outlinedText('쏘면 +1', x, y + r + 18 * k, fs(13, k), C.chainPad, 'bold', 4);
    if (covered && !s.opened) {
      //  차폐 막 + 개방선(도로 위 가로선). 확정선(벽 회색 실선)과 다른 색으로 그려 '확정 뒤에도 잠깐 못 쏘는 이유'를 남긴다
      ctx.fillStyle = 'rgba(120,128,140,0.55)';
      roundRect(x - r - 2 * k, y - r - 2 * k, r * 2 + 4 * k, r * 2 + 4 * k, 8 * k);
      ctx.fill();
      const dc = s.coverZ - runZ;
      if (!offscreen(dc, 10)) {
        const a = pj(ROAD0, dc), b = pj(ROAD1, dc);
        ctx.save();
        ctx.strokeStyle = C.chainPad;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  //  적 도형 폴백(상자/원/마름모). white = 피격 번쩍임(흰 채움만, 테두리·눈 없음)
  function enemyShape(kind, x, y, r, white) {
    ctx.fillStyle = white ? HIT_FLASH_FILL : (ENEMY_FALLBACK[kind] ?? '#B3402F');
    if (kind === 'shooter') {
      ctx.fillRect(x - r * 1.1, y - r, r * 2.2, r * 2);
      if (!white) { ctx.strokeStyle = C.warn; ctx.lineWidth = 3; ctx.strokeRect(x - r * 1.1, y - r, r * 2.2, r * 2); }
    } else if (kind === 'rusher') {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (!white) { ctx.strokeStyle = C.warn; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
    if (white) return;
    ctx.fillStyle = C.eshot;
    ctx.beginPath(); ctx.arc(x, y, Math.max(3, r * 0.28), 0, Math.PI * 2); ctx.fill();
  }

  //  피격 자세(r3.24): 셸 fx.hit[id] 의 경과 초 t 로 넉백(위로 밀렸다 복귀)·흔들림·스쿼시·번쩍임·HP 튐을 계산한다. 반응 중이 아니면 null.
  //   세기는 역할표(BAL3.fx.hitRoles)에서 — 장갑체는 거의 안 밀리고(무겁다) 돌격체는 크게 밀리며 흔들린다. k = 그 자리 원근 배율
  function hitPose(fx, id, role, k) {
    const h = fx && fx.hit ? fx.hit[id] : null;
    if (!h) return null;
    const H = FX.hit, R = FX.hitRoles[role] ?? FX.hitRoles.grunt;
    const t = h.t;
    const kb = t < H.knockSec ? Math.sin(Math.PI * t / H.knockSec) : 0;
    const sq = t < H.squashSec ? Math.sin(Math.PI * t / H.squashSec) : 0;
    const shake = R.shake && t < H.knockSec ? Math.sin(t * 95 + (h.n || 0) * 1.7) * R.shake * k * (1 - t / H.knockSec) : 0;
    return {
      dx: shake, dy: (h.dir ?? -1) * R.knock * k * kb,
      sx: 1 + R.squash * sq, sy: 1 - R.squash * sq,
      //  번쩍임은 fa(번쩍임 경과 초 — 연사 중에는 쉼을 두고 다시 켜진다)로. 옛 꼴(fa 없음)은 t
      flash: (h.fa ?? t) < H.flashSec ? R.flash * (1 - 0.4 * (h.fa ?? t) / H.flashSec) : 0,
      pop: t < H.hpPopSec ? Math.sin(Math.PI * t / H.hpPopSec) : 0,
    };
  }
  //  자세 적용: 발밑(ax, ay)을 기준점으로 밀고·눌러 그린다(호출부가 save/restore)
  function poseAt(hr, ax, ay) {
    ctx.translate(ax + hr.dx, ay + hr.dy);
    if (hr.sx !== 1 || hr.sy !== 1) ctx.scale(hr.sx, hr.sy);
    ctx.translate(-ax, -ay);
  }
  //  r4.8 움직임 자세 적용(호출부가 save/restore): 바퀴 = 그림 가운데를 축으로 spin 만큼 돌리고 bob 만큼 튄다 ·
  //   그 밖 = 발밑(그림 아래쪽 0.4h)을 축으로 bob 만큼 들어 올리고 tilt 만큼 기울이고 발 디딤 눌림(sx·sy). bob 은 그 자리 배율 k 를 곱한다
  function motionPose(mo, x, y, h, k) {
    if (mo.spin) {
      ctx.translate(x, y - mo.bob * k);
      ctx.rotate(mo.spin);
      ctx.translate(-x, -y);
      return;
    }
    const fy = y + h * 0.4;
    ctx.translate(x, fy - mo.bob * k);
    if (mo.tilt) ctx.rotate(mo.tilt);
    if (mo.sx !== 1 || mo.sy !== 1) ctx.scale(mo.sx, mo.sy);
    ctx.translate(-x, -fy);
  }
  //  r4.8 흙먼지(굴러오는 바퀴·차): 적 뒤쪽(화면 위 — 내려오는 반대쪽) 작은 흙빛 점. 자리·크기는 다가온 거리로 돌아간다(결정적)
  function drawDust(mo, x, y, h, k, id) {
    const n = ROLL.dust, ph = (mo.spin || mo.bob * 3 + id) * 0.9;
    ctx.save();
    ctx.fillStyle = 'rgba(140,122,98,1)';
    for (let i = 0; i < n; i++) {
      const a = ph + i * 2.1, u = (i + 1) / n;
      ctx.globalAlpha = 0.32 * mo.dust * (1 - 0.5 * u) * (0.6 + 0.4 * Math.abs(Math.sin(a)));
      ctx.beginPath();
      ctx.arc(x + Math.sin(a) * h * 0.28, y - h * (0.42 + 0.22 * u), (2.2 + 1.6 * u) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  //  r4.7 현상금 적 몸통: 바깥 맥박 금색 고리(t = run.time — 결정적) + 어두운 청동 팔각 방패 + 두꺼운 금색 테 + 가운데 코인 그림.
  //   white = 피격 번쩍임(흰 팔각만 — 호출부가 불투명도를 건다)
  function drawBountyBody(x, y, r, k, t, white) {
    if (!white) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * pulse;
      ctx.strokeStyle = BOUNTY_LOOK.ring; ctx.lineWidth = Math.max(2, 3 * k);
      ctx.beginPath(); ctx.arc(x, y, r * (1.2 + 0.1 * pulse), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = white ? HIT_FLASH_FILL : BOUNTY_LOOK.body;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    if (white) return;
    ctx.strokeStyle = BOUNTY_LOOK.ring; ctx.lineWidth = Math.max(3, 5 * k); ctx.stroke();
    drawCoinIcon(x, y, r * 1.15);
  }
  //  r4.7 현상금 적: 잡졸과 확실히 구별(판정 r 34 — 잡졸 14 의 두 배 넘게 크다 · 금색 테 · 코인 · 머리 위 '현상금' 금색 글).
  //   피격 반응(넉백·번쩍임)은 다른 적과 같은 hitPose, 체력 숫자는 공통 규칙(스폰 체력 3 이상 — 적 아래, HUD 띠에서는 생략)
  function drawBounty(e, run, fx, x, y, k, r) {
    shadow(x, y + r * 0.95, r * 1.05);
    const hr = hitPose(fx, e.id, hitRole(e.kind, e.skin), k);
    if (hr) { ctx.save(); poseAt(hr, x, y + r); }
    drawBountyBody(x, y, r, k, run.time || 0, false);
    if (hr && hr.flash > 0) { ctx.globalAlpha = hr.flash; drawBountyBody(x, y, r, k, 0, true); ctx.globalAlpha = 1; }
    if (hr) ctx.restore();
    const ly = y - r * 1.35 - 4 * k;
    ctx.textAlign = 'center';
    if (ly >= HP_TAG_MIN_Y) outlinedText(BOUNTY_LOOK.label, x, ly, fs(15, k, 12), BOUNTY_LOOK.ring, 'bold', 4);
    if ((e.hpMax ?? e.hp) > 2 && e.z >= run.z) {
      const ty = y + r + 16 * k;
      if (ty >= HP_TAG_MIN_Y) drawHpTag(x, ty, e.hp, k, hr ? hr.pop : 0);
    }
  }

  //  적: 스프라이트 폴백(상자/원/마름모) + HP 태그. 저격 예고선은 부대 쪽으로(부대 중심 = (run.x, d −ay) 투영)
  function drawEnemy(e, run, fx) {
    const d = e.z - run.z;
    if (offscreen(d, 80)) return;
    const q = pj(e.x, d), x = q.x, y = q.y, k = q.s;
    const r = e.r * k;
    if (e.kind === 'bounty') { drawBounty(e, run, fx, x, y, k, r); return; }
    //  저격 예고선 — 맞는 순간(넉백 동안)은 끊긴다(r3.24 저격수 특색: '조준이 흔들렸다')
    const aimCut = !!(fx && fx.hit && fx.hit[e.id] && fx.hit[e.id].t < FX.hit.knockSec);
    if (e.kind === 'shooter' && e.aimT > 0 && !aimCut) {
      const sq = pj(run.x, -(run.ay || 0));
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = C.eshot; ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sq.x, sq.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    //  그림 배율(r3.31 FX.artScale): 바리케이드·신호등처럼 같은 r 에서 작아 보이는 그림만 키운다(판정 r 은 그대로)
    const h = r * 2.4 * ((FX.artScale && FX.artScale[artBase3(e.kind, e.skin)]) || 1);
    shadow(x, y + h * 0.4, r * 0.95);
    //  피격 반응(r3.24 손맛, 셸 fx.hit[id]): 넉백·흔들림·스쿼시는 **그림에만** 건다(그림자·HP 숫자·규칙 위치는 그대로)
    const hr = hitPose(fx, e.id, hitRole(e.kind, e.skin), k);
    //  r4.8 움직임(걷기·굴러오기·차 떨림·숨쉬기 — enemyMotionPose): 역시 그림에만. 피격 반응 중이면 걷기 흔들림을 줄인다
    const mo = enemyMotionPose(e, run, hr ? WALK.hitDamp : 1);
    if (mo && mo.dust) drawDust(mo, x, y, h, k, e.id);
    //  피격 중인 잡졸(셸 fx.enemyHit[id] 남은 초)은 피격 시트를 한 번 재생한다
    const hitLeft = fx && fx.enemyHit ? (fx.enemyHit[e.id] ?? 0) : 0;
    const hitSh = e.kind === 'grunt' && hitLeft > 0 ? sheet('e_grunt_hit') : null;
    //  r4.8 걷기 동작 시트 자리(SHEETS3 e_grunt_walk — 파일이 들어오면 코드 움직임 대신 이 시트를 쓴다): 그림이 E1 인 잡졸, 피격 시트가 없을 때.
    //   칸 = 걸음 박자(두 걸음에 시트 한 바퀴 — 다가오는 빠르기에 비례). 파일이 없으면 null → 코드 움직임
    const walkSh = mo && mo.kind === 'walk' && e.kind === 'grunt' && !e.skin && !hitSh ? sheet('e_grunt_walk') : null;
    if (mo && !walkSh) { ctx.save(); motionPose(mo, x, y, h, k); }
    if (hr) { ctx.save(); poseAt(hr, x, y + h * 0.4); }
    //  r3.26 3상태 그림: 맞는 동안 'hit:' · 체력 절반 이하이면 'dmg:'. 없는 그림은 정지 그림으로 조용히 되돌아간다
    //   (잡졸은 피격 시트가 있으면 시트가 먼저 — 12칸 동작이 한 장보다 낫다)
    const artB = artBase3(e.kind, e.skin);
    const baseKey = e.skin ? 'skin:' + e.skin : ENEMY_SPRITE[e.kind];
    let key = baseKey;
    if (artB && !hitSh && hitLeft > 0 && get('hit:' + artB)) key = 'hit:' + artB;
    else if (artB && wantsDmgArt(e.hp, e.hpMax ?? e.hp) && get('dmg:' + artB)) key = 'dmg:' + artB;
    const sh = hitSh || walkSh;
    const shFrame = hitSh ? sheetFrameAt(hitSh, hitSh.frames / hitSh.fps - hitLeft)
      : walkSh ? Math.floor((((mo.steps / 2) % 1) + 1) % 1 * walkSh.frames) : 0;
    if (sh) drawSheetFrame(sh, shFrame, x, y, h);
    else drawImgCentered(key, x, y, h, () => enemyShape(e.kind, x, y, r, false));
    //  흰색 번쩍임: 그림 모양의 흰 실루엣(없으면 도형에 흰 채움)을 반응 불투명도로 덮는다
    if (hr && hr.flash > 0) {
      ctx.globalAlpha = hr.flash;
      const im = sh ? null : get(key);
      const wsh = sh ? whiteOf(sh.img, 1024) : null;
      const wim = im ? whiteOf(im) : null;
      if (wsh) drawSheetFrame(sh, shFrame, x, y, h, wsh);
      else if (wim) ctx.drawImage(wim.c, x - h * (im.width / im.height) / 2, y - h / 2, h * (im.width / im.height), h);
      else enemyShape(e.kind, x, y, r, true);
      ctx.globalAlpha = 1;
    }
    if (hr) ctx.restore();
    if (mo && !walkSh) ctx.restore();
    //  전격 기절(r3.31): 멈춘 동안 청보라 고리 + 번개 조각 3개(시간에 따라 돌아간다). 규칙 e.stunT 를 그대로 읽는다
    if (e.stunT > 0) {
      const t = run.time || 0, a = Math.min(1, e.stunT / 0.25);
      ctx.save();
      ctx.globalAlpha = 0.85 * a;
      ctx.strokeStyle = FX.stunColor || '#9FB4FF';
      ctx.lineWidth = Math.max(2, 2.5 * k);
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.25, r * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const ang = t * 6 + i * 2.09, rx = x + Math.cos(ang) * r * 1.25, ry = y + Math.sin(ang) * r * 0.9;
        ctx.beginPath(); ctx.moveTo(rx - 4 * k, ry - 5 * k); ctx.lineTo(rx + 2 * k, ry - 1 * k); ctx.lineTo(rx - 2 * k, ry + 1 * k); ctx.lineTo(rx + 4 * k, ry + 5 * k); ctx.stroke();
      }
      ctx.restore();
    }
    //  체력 숫자(r3.21 B안 ③ × r3.20 원근 화해): **스폰 체력(hpMax)이 2 를 넘는 적만** 남은 체력 정수를 보여 준다
    //   (체력 1~2 잡졸 = 1~3 스테이지는 숫자 없음 — 이사 결정 "한두 방에 죽는지 몇 방 맞는지 보이게").
    //   자리는 종전 HP 태그 그대로 **적 아래**(투영 x·배율 k, 글자 12px 하한) — 머리 위에 두면 화면 위로 들어오는 동안
    //   HUD 줄(제목·거리·칩)과 겹친다(B안 대항 검수 Important #1). 아래 두기가 그 겹침을 구조적으로 없앤다.
    //   hpMax 가 없는 적(검사 합성)은 hp 로 대신 본다
    //   ⚠️부대를 지나친 적(e.z < run.z — 멈춰 선 저격수 등)은 숫자를 그리지 않는다: 부대 발밑 병력 수 옆에 뜬다(B안 대항 검수 ① 덤)
    //   ⚠️아래에 두어도 **먼 구간**(가까이 dz 469~646 실측 · r4.1 에서 지운 표준은 491~647)에서는 숫자가 HUD 띠에 들어온다 → 그 띠에서는 생략한다.
    //    클램프가 아니라 생략인 이유: 끌어내리면 숫자가 다른 적 그림 위에 얹힌다(B안 대항 검수 ① 처방 그대로, 판정만 투영 y 로 재유도)
    if ((e.hpMax ?? e.hp) > 2 && e.z >= run.z) {
      const ty = y + r + 16 * k;
      if (ty >= HP_TAG_MIN_Y) drawHpTag(x, ty, e.hp, k, hr ? hr.pop : 0);
    }
  }

  //  쓰러진 잡졸(셸 fx.corpses — 규칙의 enemies 에는 이미 없다): 사망 시트를 한 번 재생하고 corpseLingerSec 머문 뒤 흐려진다
  //  r3.24: 잡졸(역할 grunt·옛 꼴 role 없음)만 사망 시트, 나머지는 역할별 도형 잔해를 짧게(c.life 초, 마지막 corpseFadeSec 에 흐려진다)
  //   tumble(돌격체) = 제 그림이 앞(아래)으로 굴러 넘어지며 미끄러진다 · ring(저격수) = 마젠타 그을음 · plates(장갑체) = 장갑판 조각 + 그을음 · boom(카트) = 큰 그을음
  function drawCorpses(fx, runZ) {
    const list = fx && fx.corpses;
    if (!list || !list.length) return;
    const sh = sheet('e_grunt_death');
    for (const c of list) {
      const d = c.z - runZ;
      if (offscreen(d, 80)) continue;
      const q = pj(c.x, d);
      const role = c.role ?? 'grunt';
      if (role === 'grunt' && sh) {
        const total = sh.frames / sh.fps + FX.corpseLingerSec;
        ctx.globalAlpha = Math.max(0, Math.min(1, (total - c.t) / FX.corpseFadeSec));
        drawSheetFrame(sh, sheetFrameAt(sh, c.t), q.x, q.y, c.h * q.s);
        continue;
      }
      const life = c.life || 0.8;
      const fade = Math.max(0, Math.min(1, (life - c.t) / FX.corpseFadeSec));
      const r = (c.r || 16) * q.s;
      //  r3.26 파괴 그림: 'dead:<그림>' 이 있으면 조각이 흩어진 그 그림을 짧게 키우며 흐린다(없으면 아래 도형 잔해)
      const deadB = artBase3(c.kind, c.skin);
      const deadIm = deadB ? get('dead:' + deadB) : null;
      if (deadIm) {
        const u = Math.min(1, c.t / Math.max(0.01, life));
        const hh = (c.h || r * 2.4) * q.s * (1 + 0.28 * u);
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = 'rgba(25,22,24,1)';
        ctx.beginPath(); ctx.ellipse(q.x, q.y + r * 0.6, r * 1.05, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = fade;
        const w = hh * (deadIm.width / deadIm.height);
        ctx.drawImage(deadIm, q.x - w / 2, q.y - hh / 2, w, hh);
        ctx.globalAlpha = 1;
        continue;
      }
      //  그을음(바닥 타원) — 모든 비잡졸 공통, 역할마다 색·크기
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = role === 'ring' || role === 'shooter' ? 'rgba(90,20,60,1)' : 'rgba(25,22,24,1)';
      const sr = role === 'cart' ? r * 1.7 : role === 'armor' ? r * 1.25 : r * 1.05;
      ctx.beginPath(); ctx.ellipse(q.x, q.y + r * 0.6, sr, sr * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      if (role === 'rusher') {
        //  앞으로 굴러 넘어짐: 0.35초에 걸쳐 100° 기울며 아래로 미끄러진 뒤 머문다
        const u = Math.min(1, c.t / 0.35);
        const ang = u * 1.75 * (c.id % 2 ? 1 : -1), slide = u * 18 * q.s;
        const hh = c.h * q.s;
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(q.x, q.y + slide + hh * 0.2);
        ctx.rotate(ang);
        drawImgCentered(c.skin ? 'skin:' + c.skin : ENEMY_SPRITE[c.kind], 0, -hh * 0.2, hh, () => {
          ctx.fillStyle = ENEMY_FALLBACK[c.kind] ?? '#3A3A3A';
          ctx.beginPath(); ctx.arc(0, -hh * 0.2, r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      } else if (role === 'armor') {
        //  장갑판 조각 4장이 흩어져 누워 있다(자리는 id 로 결정)
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#8E97A3';
        for (let i = 0; i < 4; i++) {
          const a = i * 1.57 + (c.id % 5) * 0.4;
          ctx.save();
          ctx.translate(q.x + Math.cos(a) * r * 0.9, q.y + r * 0.5 + Math.sin(a) * r * 0.3);
          ctx.rotate(a);
          ctx.fillRect(-r * 0.3, -r * 0.12, r * 0.6, r * 0.24);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  //  pop(0~1, r3.24) = 맞은 순간 숫자가 커졌다 작아지는 정도(최대 +45%)이고 그동안 흰색으로 번쩍인다
  function drawHpTag(x, y, hp, k = 1, pop = 0) {
    ctx.textAlign = 'center';
    outlinedText(String(Math.max(0, Math.ceil(hp))), x, y, fs(16, k, 12) * (1 + 0.45 * pop), pop > 0.5 ? HIT_FLASH_FILL : C.bulletHeavy, 'bold', 4);
  }

  //  보너스전 표적(r3.15): 노란 선물 상자(roundRect) + 붉은 리본(세로·가로 띠 + 매듭 원 2개) + 그림자 + 위 '+value' 금색 소자 + 아래 내구 숫자(통과 같은 자리 규약).
  //   새 그림 없이 도형으로만. 살아 있는 표적만 그린다(파괴된 것은 respawn 뒤 같은 궤적에 다시 나타난다)
  function drawBonusTargets(run) {
    const list = run.bonusTargets ?? [];
    if (!list.length) return;
    for (const t of list) {
      if (!t.alive) continue;
      const d = t.z - run.z;
      if (offscreen(d, 60)) continue;
      const q = pj(t.x, d), x = q.x, y = q.y, k = q.s;
      const r = t.r * k;
      shadow(x, y + r * 0.95, r * 0.9);
      //  표적 그림(2026-09-19 Gemini): 짝수 id = 선물 상자, 홀수 id = 별 코인. 없으면 종전 도형(노란 상자 + 리본)
      drawImgCentered((t.id ?? 0) % 2 === 1 ? 'bonus_coin' : 'bonus_gift', x, y, r * 2.2, () => {
        ctx.fillStyle = C.bonusBox;
        roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 6 * k); ctx.fill();
        ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
        roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 6 * k); ctx.stroke();
        ctx.fillStyle = C.bonusRibbon;
        ctx.fillRect(x - r * 0.18, y - r * 0.8, r * 0.36, r * 1.6);
        ctx.fillRect(x - r, y - r * 0.16, r * 2, r * 0.32);
        ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.92, r * 0.24, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.32, y - r * 0.92, r * 0.24, 0, Math.PI * 2); ctx.fill();
      });
      ctx.textAlign = 'center';
      outlinedText('+' + t.value, x, y - r * 1.15, fs(13, k), C.gold, 'bold', 4);
      outlinedText(String(Math.max(0, Math.ceil(t.hp))), x, y + r + 18 * k, fsMin(16, k), C.bulletHeavy, 'bold', 4);
    }
  }

  //  정예: 스프라이트(skin 우선 → 'elite' 키 → 폴백 원) + 발밑 HP 숫자. 막대는 HUD 에서.
  //   r3.16 복수 정예: 역할이 'elite' 가 아니면 HP 숫자 아래 역할 이름('포격'·'소환'·'장갑') 한 줄. 장갑형 폴백 원은 테두리를 두껍게(새 그림 없이 도형으로만)
  //   r3.17 아레나: 예고(warn)·돌진(dash) 중이면 목표 지점에 붉은 원(반지름 = 충격 r × 그 자리 배율, 깜빡임)과 보스→목표 점선을 **보스보다 먼저** 그린다. shockR 은 run.arena.boss.shock.r
  //   r4.9 (가) charge(0 → 1 | null) = 탄 공격 장전 진행: 보스 **몸에만** 밝은 번쩍임(ATK_CHARGE — 몸 위 밝은 원 + 고리가 조여 든다). 도로에는 아무것도 그리지 않는다
  //   r4.9 (다) t = 규칙 시계(run.time): 광분 보스(b.rage)의 오라 맥박·몸체 잔떨림(결정적 — 같은 규칙 시각이면 같은 그림)
  function drawBoss(b, runZ, now, shockR = null, fx = null, charge = null, t = null) {
    const q0 = pj(b.x, b.z - runZ), k = q0.s;
    const rage = !!(b.rage && t != null);
    const x = q0.x + (rage ? Math.sin(t * 73) * 1.8 * k : 0), y = q0.y + (rage ? Math.cos(t * 61) * 1.2 * k : 0);
    //  피격 반응(r3.24): 짧은 번쩍임·작은 흔들림·HP 숫자 튐(정예는 무겁다 — 넉백 작게)
    const hr = hitPose(fx, b.id, 'elite', k);
    const r = b.r * k;
    const role = b.role ?? 'elite';
    if (b.arena && (b.state === 'warn' || b.state === 'dash') && b.dashTx != null) {
      const t = pj(b.dashTx, b.dashTz - runZ), tr = (shockR ?? 70) * t.s;
      ctx.save();
      ctx.strokeStyle = C.warn; ctx.fillStyle = C.warn; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.12;
      ctx.beginPath(); ctx.arc(t.x, t.y, tr, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(now * 14));
      ctx.beginPath(); ctx.arc(t.x, t.y, tr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    shadow(x, y + r * 1.05, r * 1.15);
    if (rage) {
      //  광분 오라: 붉은 원 세 겹이 맥박에 맞춰 부풀었다 줄었다(안쪽이 진하다) + 몸 둘레 붉은 테
      const pulse = 0.5 + 0.5 * Math.sin(t * 9);
      ctx.save();
      ctx.fillStyle = RAGE_COLOR;
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = (0.1 + 0.1 * pulse) * (4 - i) / 3;
        ctx.beginPath(); ctx.arc(x, y, r * (0.95 + 0.22 * i + 0.12 * pulse), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.55 + 0.4 * pulse; ctx.strokeStyle = RAGE_COLOR; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * (1.08 + 0.08 * pulse), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const bkey = b.skin ? 'skin:' + b.skin : 'elite';
    if (hr) { ctx.save(); poseAt(hr, x, y + r * 1.05); }
    drawImgCentered(bkey, x, y, r * 2.6, () => {
      ctx.fillStyle = ENEMY_FALLBACK.elite;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.warn; ctx.lineWidth = role === 'tank' ? 9 : 6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.eshot;
      ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill();
    });
    if (hr && hr.flash > 0) {
      ctx.globalAlpha = hr.flash;
      const im = get(bkey), wim = im ? whiteOf(im, 320) : null;
      if (wim) { const bh = r * 2.6, bw = bh * (im.width / im.height); ctx.drawImage(wim.c, x - bw / 2, y - bh / 2, bw, bh); }
      else { ctx.fillStyle = HIT_FLASH_FILL; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (hr) ctx.restore();
    if (charge != null) {
      //  r4.9 (가) 장전 번쩍임(보스 그림에만): 흰 실루엣(그림이 없으면 몸 원)을 빠르게 깜빡이며 점점 밝게 + 몸 둘레 고리가 안쪽으로 조여 든다
      const f = 0.5 + 0.5 * Math.sin(now * 42);
      ctx.save();
      ctx.globalAlpha = (0.22 + 0.4 * charge) * (0.55 + 0.45 * f);
      const im = get(bkey), wim = im ? whiteOf(im, 320) : null;
      if (wim) { const bh = r * 2.6, bw = bh * (im.width / im.height); ctx.drawImage(wim.c, x - bw / 2, y - bh / 2, bw, bh); }
      ctx.fillStyle = ATK_CHARGE;
      ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.strokeStyle = ATK_CHARGE; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * (1.55 - 0.55 * charge), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (b.state === 'descend' || b.state === 'warn') {
      ctx.globalAlpha = 0.5 + Math.sin(now * 12) * 0.3;
      ctx.strokeStyle = C.warn; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 10 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    //  보호막(r3.18 아레나): 첫 착지 충격까지 피격 무효 — 하늘색 점선 링(r+16) + '보호막' 글자. 새 그림 없이 도형으로
    if (b.guard) {
      ctx.save();
      ctx.strokeStyle = C.gatePos; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55 + Math.sin(now * 6) * 0.2;
      ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.arc(x, y, r + 16 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.textAlign = 'center';
      outlinedText('보호막', x, y - r - 22 * k, fs(14, k), C.gatePos, 'bold', 4);
    }
    drawHpTag(x, y + r + 20 * k, b.hp, k, hr ? hr.pop : 0);
    const rl = role !== 'elite' ? (BAL3.elites?.roles?.[role]?.label ?? null) : null;
    if (rl) { ctx.textAlign = 'center'; outlinedText(rl, x, y + r + 36 * k, fs(12, k), C.hud, 'bold', 4); }
  }

  //  r4.10 중간 보스(규칙 bo.mid — 읽기만): 그 판 일반 적 그림(look kind·skin)을 크게 — 반지름 bo.r, 그림 높이 = r × 2.4 × 그림 배율(일반 적 그리기 규칙 그대로라
  //   일반 적 그림의 2.2~2.6배) · 3상태 그림(맞는 순간 hit: · 절반 아래 dmg:)·피격 반응(번쩍임·흔들림 — 보스처럼 무겁게)은 일반 적과 같은 규칙 ·
  //   머리 위 이름표 '중간 보스' + 체력 막대(남은 체력 비율) · 몸 아래 체력 숫자(보스와 같은 자리)
  function drawMidBoss(b, run, fx) {
    const q = pj(b.x, b.z - run.z), k = q.s, x = q.x, y = q.y;
    const r = b.r * k;
    const look = b.look || { kind: 'grunt' };
    const artB = artBase3(look.kind, look.skin);
    const h = r * 2.4 * ((FX.artScale && FX.artScale[artB]) || 1);
    shadow(x, y + h * 0.4, r * 0.95);
    const hr = hitPose(fx, b.id, 'elite', k);
    if (hr) { ctx.save(); poseAt(hr, x, y + h * 0.4); }
    const baseKey = look.skin ? 'skin:' + look.skin : ENEMY_SPRITE[look.kind];
    let key = baseKey;
    if (artB && hr && hr.flash > 0 && get('hit:' + artB)) key = 'hit:' + artB;
    else if (artB && wantsDmgArt(b.hp, b.max) && get('dmg:' + artB)) key = 'dmg:' + artB;
    drawImgCentered(key, x, y, h, () => enemyShape(look.kind, x, y, r, false));
    if (hr && hr.flash > 0) {
      ctx.globalAlpha = hr.flash;
      const im = get(key), wim = im ? whiteOf(im) : null;
      if (wim) ctx.drawImage(wim.c, x - h * (im.width / im.height) / 2, y - h / 2, h * (im.width / im.height), h);
      else enemyShape(look.kind, x, y, r, true);
      ctx.globalAlpha = 1;
    }
    if (hr) ctx.restore();
    //  머리 위: 체력 막대(바탕 + 남은 비율) → 그 위 이름표
    const bw = Math.max(64, r * 2.3), bh = Math.max(7, 9 * k), by = y - h / 2 - 8 * k - bh;
    ctx.fillStyle = MID_LOOK.back;
    roundRect(x - bw / 2, by, bw, bh, bh / 2); ctx.fill();
    const f = Math.max(0, Math.min(1, b.hp / (b.max || 1)));
    if (f > 0) { ctx.fillStyle = MID_LOOK.bar; roundRect(x - bw / 2, by, bw * f, bh, bh / 2); ctx.fill(); }
    ctx.textAlign = 'center';
    outlinedText(MID_LOOK.label, x, by - 7 * k, fs(15, k, 13), MID_LOOK.labelColor, 'bold', 4);
    drawHpTag(x, y + r + 20 * k, b.hp, k, hr ? hr.pop : 0);
  }
  //  r4.10 중간 보스 돌진 경보(규칙 bo.charge — 읽기만): 경보 동안(그리고 돌진해 치기 전까지) 돌진할 줄(몸 폭)을 붉은 경보 구역으로 — 보스 광역 경보와 같은 그리기(warnShape)
  function drawMidCharge(run, now) {
    const rz = run.z, blink = 0.72 + 0.28 * Math.sin(now * 16);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const b of run.bosses ?? []) {
      const c = b.mid && !b.dead ? b.charge : null;
      if (!c || c.hit) continue;
      warnShape(c.zones[0].shape, Math.max(0, Math.min(1, c.t / (c.tele || 0.8))), blink, rz);
    }
    ctx.restore();
  }

  //  부대: 실제 units 배열 — 히어로(hero 표시 유닛, M01 — r4.4 전에는 units[0]) + 병사(SOLDIER). 그림자·행진 바운스·병력 수·중심 마커
  //   원근(r3.20): 병사마다 부대 중심 + (dx, dz) 로 각각 투영한다 — 앞줄(d 큰 쪽)은 작게, 뒷줄(d < 0)은 부대 줄 배율 near 그대로·간격은 평면(수정 라운드 2
  //   2026-09-20 — 처음엔 뒷줄이 자라 s 1.9 → 1.5 상한, 그래도 59/40명부터 뒷줄이 화면 아래로 넘쳐 project.js 뒤쪽 갈래를 바꿨다). 아레나 ay 는 d 오프셋(−ay)
  //   병력 수는 종전 '가장 뒷줄 아래(H − 14 클램프)' 에서 **부대 중심 마커 옆**으로 옮겼다(수정 라운드 2): 뒷줄이 화면 밖일 때 병사 위에 겹치던 것을 없앤다.
  //   마커 위 전방 ±45° 는 대형이 비어 있어 병사와 겹치지 않는다. 마커가 화면 오른쪽 끝에 가까우면 왼쪽에 쓴다(COUNT_FLIP_X)
  function drawSquad(run, fx, now) {
    const S = BAL3.squad;
    const units = run.units;
    if (!units.length) return;
    const ay = run.ay || 0;
    const order = units.map((u, i) => ({ u, i })).sort((a, b) => a.u.dy - b.u.dy || a.i - b.i);
    //  r4.4: 메인 로봇 그림은 **hero 표시**(규칙 createRun 이 첫 유닛에 붙인다)를 보고 그린다 — 종전 '배열 0번'은 로봇이 쓰러지면
    //   다음 병사에게 그림이 넘어갔다. 이제 로봇이 쓰러지면(보호 규칙을 끈 판에서만 생기는 일) 그림 없이 병사만 남는다
    for (const { u } of order) {
      const hero = !!u.hero;
      const q = pj(run.x + u.dx, -(ay + u.dy));
      const size = (hero ? S.heroSize : S.soldierSize) * q.s;
      shadow(q.x, q.y + size * 0.42, size * 0.42);
    }
    for (const { u, i } of order) {
      const hero = !!u.hero;
      const phase = now * 9 + i * 1.7;
      const bob = hero ? Math.sin(now * 9) * 2 : Math.sin(phase) * 1.6;
      const sway = hero ? Math.sin(now * 4.5) * 0.8 : Math.sin(phase * 0.5 + i) * 1.1;
      const q = pj(run.x + u.dx + sway, -(ay + u.dy));
      const size = (hero ? S.heroSize : S.soldierSize) * q.s;
      const px = q.x, py = q.y + bob * q.s;
      const hurt = u.hp < S.unitHp;
      //  히어로 동작 시트: 사격 중(fx.heroFire 남은 초)이면 사격 시트, 아니면 걷기 루프(now 기준). 시트가 없으면 정지 그림
      //  heroFireAlways: 출격 중엔 사격 시트를 now 기준으로 계속 돌린다. 아니면 fx.heroFire 창에서만 사격, 나머지는 걷기
      const always = !!FX.heroFireAlways;
      const firing = always || !!(fx && fx.heroFire > 0);
      //  사격 시트는 무기별(m1_fire_rifle 등, 2026-09-19 장착 그림 기반)이 있으면 그것을, 없으면 공용 사격 시트를 쓴다
      const wid = run.weapon || 'rifle';
      const unitSh = hero
        ? (firing ? (sheet('m1_fire_' + wid) || sheet('m1_fire')) : sheet('m1_walk'))
        : (firing ? (sheet('soldier_fire_' + wid) || sheet('soldier_fire')) : sheet('soldier_walk'));
      if (unitSh) {
        //  병사는 i 마다 위상을 0.13초씩 어긋나게 — 부대가 한 몸처럼 딱딱 맞지 않게(사격 시트는 루프라 위상만 돈다)
        const animT = (firing && !always ? unitSh.frames / unitSh.fps - fx.heroFire : now) + (hero ? 0 : i * 0.13);
        drawSheetFrame(unitSh, sheetFrameAt(unitSh, animT), px, py, size);
      } else drawImgCentered(hero ? 'm1' : 'soldier', px, py, size, () => {
        ctx.fillStyle = hero ? C.hero : C.soldier;
        ctx.beginPath();
        ctx.moveTo(px, py - size / 2);
        ctx.lineTo(px - size / 3, py + size / 2);
        ctx.lineTo(px + size / 3, py + size / 2);
        ctx.closePath();
        ctx.fill();
      });
      //  다친 유닛 표시(hp 1): 붉은 점
      if (hurt) {
        ctx.fillStyle = C.heroHurt;
        ctx.beginPath(); ctx.arc(px, py - size / 2 - 4 * q.s, 3 * q.s, 0, Math.PI * 2); ctx.fill();
      }
      //  r4.4 보호막(heroGuard): 켜진 동안(run.heroShield — 규칙이 STEP 끝에 hp > 0 호위 수로 정한다) 로봇 둘레 얇은 고리. 새 그림 없이 도형으로
      if (hero && run.heroShield) {
        ctx.save();
        ctx.strokeStyle = HERO_RING_COLOR; ctx.lineWidth = 2;
        ctx.globalAlpha = 0.55 + Math.sin(now * 5) * 0.15;
        ctx.beginPath(); ctx.ellipse(px, py + size * 0.08, size * 0.62, size * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    //  부대 중심 마커(삼각) — 게이트 칸 판정 기준. 중심(run.x, d −ay)의 투영점 위
    const sq = pj(run.x, -ay), ks = sq.s;
    const my = sq.y - S.heroSize * ks / 2 - 14 * ks;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(sq.x, my - 8);
    ctx.lineTo(sq.x - 6, my + 2);
    ctx.lineTo(sq.x + 6, my + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(sq.x, my - 10); ctx.lineTo(sq.x, my - 120); ctx.stroke();
    ctx.setLineDash([]);
    //  병력 수(피격 중 빨강): 부대 중심 마커(삼각) 옆. 오른쪽 기본, 마커가 COUNT_FLIP_X 를 넘으면 왼쪽
    const right = sq.x <= COUNT_FLIP_X;
    ctx.textAlign = right ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    outlinedText(String(units.length), sq.x + (right ? COUNT_DX : -COUNT_DX), my - 3, 26, fx.hurtT > 0 ? C.heroHurt : C.hero, 'bold', 6);
    ctx.textBaseline = 'alphabetic';
  }

  //  착지 충격 링(r3.17 아레나, 셸 fx.shocks — 셸이 투영해 둔 화면 좌표·반지름): 반지름 r·(0.5 + 0.9k) 로 퍼지며 (1 − k) 로 옅어진다. 새 그림 없음
  function drawShocks(list) {
    for (const s of list) {
      if (s.t < 0) continue;   // r3.24: 한 박자 늦게 퍼지는 링(t 음수 = 대기)
      const k = Math.max(0, Math.min(1, s.t / (s.life || 0.45)));
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = s.color ?? C.warn;
      ctx.lineWidth = 2 + 6 * (1 - k);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.5 + 0.9 * k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  //  피해 이전 빛줄기(r4.4 heroGuard, 셸 fx.beams — 셸이 이벤트 heroGuard 를 받은 순간 투영한 화면 좌표): 로봇 → 대신 맞은 호위로 짧은 선.
  //   (1 − k) 로 옅어지고 끝(호위 쪽)에 작은 점. 새 그림 없음
  function drawBeams(list) {
    for (const b of list) {
      const k = Math.max(0, Math.min(1, b.t / (b.life || 0.3)));
      ctx.globalAlpha = 0.9 * (1 - k);
      ctx.strokeStyle = HERO_RING_COLOR;
      ctx.lineWidth = 3 * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.fillStyle = HERO_RING_COLOR;
      ctx.beginPath(); ctx.arc(b.x1, b.y1, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  //  아군 탄: 무기별 **그림**(bullet_<weapon>, 위를 향한 자세)을 진행 방향(bulletAngle)으로 돌려 그리고
  //   뒤에 무기색 꼬리(알파 그라디언트)를 깐다. 위치·크기는 그 자리 배율(q.s)을 곱해 원근을 따른다.
  //   Mk 강화의 탄 폭(b.w)이 그림 크기에도 반영된다. 그림이 없으면 종전 막대 폴백(같은 색·같은 자리).
  function drawBullets(run) {
    //  r4.5 로봇 탄 테: 강화가 1단계 이상인 판(run.heroUp — 강화 0 이면 null)에서만, 로봇(hero 표시 유닛)이 쏜 탄(ownerId)에만.
    //   규칙은 건드리지 않는다(탄에 새 칸을 싣지 않고 ownerId 로 가린다). 로봇이 쓰러진 뒤(보호를 끈 판)는 테가 없다
    const heroU = run.heroUp ? (run.units || []).find((u) => u.hero) : null;
    const heroId = heroU ? heroU.id : null;
    for (const b of run.bullets) {
      if (b.dead) continue;
      const d = b.z - run.z;
      if (offscreen(d, 40)) continue;
      const q = pj(b.x, d), k = q.s;
      const w = WEAPONS[b.kind] ?? WEAPONS.rifle;
      //  꼬리·폴백 막대 색: 무기색. 로봇 다연발 추가 탄(b.extra)만 EXTRA_BULLET_COLOR(r4.4 — 원래 탄과 구분)
      const tint = b.extra ? EXTRA_BULLET_COLOR : w.color;
      const rim = heroId !== null && b.ownerId === heroId;
      const bw0 = b.w ?? w.w;        // Mk 로 탄 폭이 커진다(트랙 기준)
      //  r4.7 산탄포 = 둥근 알갱이(스프라이트 없이 — 그림이 있어도 쓰지 않는다)
      if (w.id === 'scatter') { drawPellet(b, q, k, bw0, tint, rim); continue; }
      const bw = bw0 * k;
      const len = (10 + bw0 * 1.5) * k;
      const im = get('bullet_' + w.id);
      if (im) {
        const hh = (BULLET_LEN[w.id] ?? 26) * (1 + (bw0 - w.w) * 0.12) * k;
        const iw = hh * (im.width / im.height);
        const ang = bulletAngle(b);
        ctx.save();
        ctx.translate(q.x, q.y);
        if (ang !== 0) ctx.rotate(ang);
        //  꼬리: 탄 뒤쪽(아래)으로 무기색이 옅어지는 띠
        const tail = hh * 0.9;
        const gr = ctx.createLinearGradient(0, 0, 0, tail);
        gr.addColorStop(0, tint); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = gr;
        ctx.fillRect(-Math.max(2, bw * 0.4), 0, Math.max(4, bw * 0.8), tail);
        ctx.globalAlpha = 1;
        ctx.drawImage(im, -iw / 2, -hh * 0.75, iw, hh);
        //  로봇 탄 테(r4.5): 탄 그림을 감싸는 옅은 연보라 타원 한 줄
        if (rim) {
          ctx.strokeStyle = HERO_BULLET_RIM; ctx.lineWidth = Math.max(1, 1.6 * k);
          ctx.beginPath(); ctx.ellipse(0, -hh * 0.25, iw / 2 + 2.5 * k, hh * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      ctx.fillStyle = tint;
      ctx.fillRect(q.x - bw / 2, q.y - len, bw, len);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(q.x - bw / 6, q.y - len + 2 * k, bw / 3, len * 0.5);
      //  로봇 탄 테(r4.5, 그림이 없는 폴백): 막대를 감싸는 옅은 연보라 테
      if (rim) {
        const p = 2 * k;
        ctx.strokeStyle = HERO_BULLET_RIM; ctx.lineWidth = Math.max(1, 1.4 * k);
        ctx.strokeRect(q.x - bw / 2 - p, q.y - len - p, bw + p * 2, len + p * 2);
      }
    }
  }

  //  산탄포 알갱이 한 발(r4.7, PELLET). 반지름 = Mk 탄 폭(4·5·6)에 비례(그 자리 배율 k). 꼬리 방향 = 진행 반대쪽(bulletAngle 로 돌린 화면 아래)
  //   총구 섬광: 사거리 원점(z0 · 조준탄은 x0 도)에서 지나온 거리가 PELLET.flashPx 안이면 섬광 원(지나온 만큼 작아진다)
  function drawPellet(b, q, k, bw0, tint, rim) {
    const r = Math.max(1.6, (0.45 * bw0 + 0.9) * k);
    const ang = bulletAngle(b);
    const tx = -Math.sin(ang), ty = Math.cos(ang);
    const tail = r * PELLET.tail;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = tint; ctx.lineWidth = r * 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + tx * tail, q.y + ty * tail); ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = tint;
    ctx.beginPath(); ctx.arc(q.x, q.y, r * PELLET.glow, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = PELLET.core;
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    const trav = b.z0 == null ? Infinity : (b.aimed ? Math.hypot(b.z - b.z0, b.x - (b.x0 ?? b.x)) : b.z - b.z0);
    if (trav < PELLET.flashPx) {
      const f = 1 - Math.max(0, trav) / PELLET.flashPx;
      ctx.globalAlpha = 0.65 * f;
      ctx.fillStyle = PELLET.flash;
      ctx.beginPath(); ctx.arc(q.x, q.y, r * (2 + 2.6 * f), 0, Math.PI * 2); ctx.fill();
    }
    if (rim) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = HERO_BULLET_RIM; ctx.lineWidth = Math.max(1, 1.4 * k);
      ctx.beginPath(); ctx.arc(q.x, q.y, r * (PELLET.glow + 0.4), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  //  적탄: 마젠타 구슬 + 흰 테(기존 램프탄 복제). r4.8 보스 패턴 탄(look 칸)은 보스 스킨별 모양(ATK_LOOK — drawAtkShot)
  function drawEshots(run) {
    for (const s of run.eshots) {
      if (s.dead) continue;
      const d = s.z - run.z;
      if (offscreen(d, 20)) continue;
      const q = pj(s.x, d);
      const L = s.look ? ATK_LOOK[s.look] : null;
      if (L) { drawAtkShot(s, q, L); continue; }
      const r = 5.5 * q.s;
      ctx.fillStyle = C.eshot;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  //  r4.9 보스 고유 공격 탄 한 발: 크기 = 판정 반지름 × 그 자리 배율, 진행 방향(화면: vx 오른쪽 · vz 아래)으로 돌려 그린다(바늘·객차가 날아가는 쪽을 향한다).
  //   잔해·왕관 칼날은 날아간 시간(규칙 age — 결정적)으로 돈다
  function drawAtkShot(s, q, L) {
    const r = Math.max(3, s.r * q.s * 1.1);
    const ang = Math.atan2(s.vz || 0, s.vx || 0);
    const age = s.age || 0;
    ctx.save();
    ctx.translate(q.x, q.y);
    if (L.shape === 'debris') {
      //  잔해 덩어리: 모난 오각 돌(회갈색) + 어두운 테 + 밝은 면 하나, 굴러가며 돈다
      ctx.rotate(age * 7 + (s.x % 7));
      ctx.fillStyle = L.color;
      ctx.beginPath();
      const k = [1.05, 0.82, 1.12, 0.9, 1.0];
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const x = Math.cos(a) * r * k[i], y = Math.sin(a) * r * k[i]; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = L.dark; ctx.lineWidth = Math.max(1.2, r * 0.22); ctx.stroke();
      ctx.fillStyle = L.core;
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.55); ctx.lineTo(r * 0.45, -r * 0.4); ctx.lineTo(r * 0.1, r * 0.05); ctx.closePath(); ctx.fill();
    } else if (L.shape === 'needle') {
      ctx.rotate(ang);
      ctx.globalAlpha = 0.4; ctx.strokeStyle = L.color; ctx.lineWidth = r * 0.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 3.2, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = L.color;
      ctx.beginPath(); ctx.moveTo(r * 2.2, 0); ctx.lineTo(-r * 1.4, r * 0.62); ctx.lineTo(-r * 1.4, -r * 0.62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = L.core;
      ctx.beginPath(); ctx.ellipse(r * 0.2, 0, r * 1.1, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    } else if (L.shape === 'car') {
      //  객차: 진행 방향으로 긴 어두운 몸 + 테 + 창 두 칸(붉은 불빛 번짐)
      ctx.rotate(ang);
      const hl = r * 1.55, hw = r * 0.95;
      ctx.fillStyle = L.color;
      roundRect(-hl, -hw, hl * 2, hw * 2, r * 0.35); ctx.fill();
      ctx.strokeStyle = L.trim; ctx.lineWidth = Math.max(1.2, r * 0.2); ctx.stroke();
      for (const wx of [-hl * 0.45, hl * 0.35]) {
        ctx.globalAlpha = 0.45; ctx.fillStyle = L.core;
        ctx.beginPath(); ctx.arc(wx, 0, r * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = L.core;
        ctx.fillRect(wx - r * 0.32, -r * 0.42, r * 0.64, r * 0.84);
      }
    } else if (L.shape === 'slag') {
      //  쇳물 덩이: 분홍 발광 번짐 + 주황 몸 + 노란 심, 뒤로 흐린 방울 꼬리
      ctx.rotate(ang);
      ctx.globalAlpha = 0.35; ctx.fillStyle = L.glow;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.75, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 1.5, 0, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = L.color;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = L.core;
      ctx.beginPath(); ctx.arc(r * 0.2, -r * 0.15, r * 0.45, 0, Math.PI * 2); ctx.fill();
    } else {
      //  왕관 칼날: 금빛 네 갈래 칼날(돈다) + 번짐 + 밝은 심
      ctx.rotate(age * 12 * (s.spin || 1));
      ctx.globalAlpha = 0.3; ctx.fillStyle = L.color;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = L.color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rr = i % 2 ? r * 0.45 : r * 1.55; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = L.core;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }


  //  세계 사각(x0~x1 × z0~z1)을 화면 경로로 — 원근에서 세로 가장자리는 곡선이라 n 조각으로 나눠 잇는다
  function worldBoxPath(x0, x1, z0, z1, rz, n = 8) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const q = pj(x0, z0 + (z1 - z0) * i / n - rz); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
    for (let i = n; i >= 0; i--) { const q = pj(x1, z0 + (z1 - z0) * i / n - rz); ctx.lineTo(q.x, q.y); }
    ctx.closePath();
  }
  //  세계 선분(x0,z0)→(x1,z1)을 화면 경로로(n 조각)
  function worldLinePath(x0, z0, x1, z1, rz, n = 10) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const t = i / n, q = pj(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t - rz); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
  }
  //  세계 원(가운데 (x, z), 반지름 R)을 화면 경로로
  function worldCirclePath(x, z, R, rz, n = 28) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, q = pj(x + Math.cos(a) * R, z + Math.sin(a) * R - rz); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
    ctx.closePath();
  }

  //  세계 다각형(점 목록 [x, z])을 화면 경로로 — 긴 변은 원근 곡선이 되게 n 조각으로 나눈다
  function worldPolyPath(pts, rz, n = 6) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      for (let j = 0; j < n; j++) {
        const t = j / n, q = pj(ax + (bx - ax) * t, az + (bz - az) * t - rz);
        if (i === 0 && j === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
    }
    ctx.closePath();
  }
  //  선분을 화면에 보이는 z 범위로 자른다(레일·교차 레일은 화면 밖 멀리까지 뻗는다 — 먼 점을 투영하지 않게). 반환 [ax, az, bx, bz] | null
  function clipSegZ(ax, az, bx, bz, zlo, zhi) {
    const dz = bz - az;
    if (Math.abs(dz) < 1e-9) return az < zlo || az > zhi ? null : [ax, az, bx, bz];
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dz, az - zlo], [dz, zhi - az]]) {
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [ax + (bx - ax) * t0, az + dz * t0, ax + (bx - ax) * t1, az + dz * t1];
  }
  //  선분 띠(반폭 r)의 네 꼭짓점
  function stripPts(ax, az, bx, bz, r) {
    const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L * r, nz = (bx - ax) / L * r;
    return [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
  }
  //  끊긴 고리(원판에서 끊긴 틈 쐐기를 뺀 곳)의 점 목록 — 반지름 R
  function ringPts(s, R) {
    const pts = [[s.x, s.z]], a0 = s.ang + s.half, a1 = s.ang - s.half + Math.PI * 2;
    for (let i = 0; i <= 36; i++) { const a = a0 + (a1 - a0) * i / 36; pts.push([s.x + Math.cos(a) * R, s.z + Math.sin(a) * R]); }
    return pts;
  }
  //  광역 경보 한 구역(모두 ATK_DANGER 한 색): 흐린 바탕 + 차오르는 채움(진행 p) + 깜빡이는 테.
  //   원 = 안쪽에서 · 사각 = 아래에서 · 줄(레일) = 달려올 쪽 끝에서 · 부채꼴 = 한쪽 끝에서 쓸며 · 끊긴 고리 = 가운데에서 퍼지며 찬다
  function warnShape(s, p, blink, rz) {
    ctx.fillStyle = ATK_DANGER; ctx.strokeStyle = ATK_DANGER;
    let full = null, part = null;
    if (s.t === 'circ') { full = () => worldCirclePath(s.x, s.z, s.R, rz); part = () => worldCirclePath(s.x, s.z, Math.max(2, s.R * p), rz); }
    else if (s.t === 'rect') { full = () => worldBoxPath(s.x0, s.x1, s.z0, s.z1, rz); part = () => worldBoxPath(s.x0, s.x1, s.z0, s.z0 + (s.z1 - s.z0) * p, rz); }
    else if (s.t === 'seg') {
      const c = clipSegZ(s.ax, s.az, s.bx, s.bz, rz - 240, rz + 780);
      if (!c) return;
      //  달려올 쪽(앞 = z 큰 끝, 가로면 왼쪽 끝)에서 찬다
      const [ax, az, bx, bz] = c[1] >= c[3] ? c : [c[2], c[3], c[0], c[1]];
      full = () => worldPolyPath(stripPts(ax, az, bx, bz, s.r), rz, 8);
      part = () => worldPolyPath(stripPts(ax, az, ax + (bx - ax) * p, az + (bz - az) * p, s.r), rz, 8);
    } else if (s.t === 'poly') {
      const arc = s.pts.slice(1), m = Math.max(1, Math.round((arc.length - 1) * p));
      full = () => worldPolyPath(s.pts, rz, 3); part = () => worldPolyPath([s.pts[0], ...arc.slice(0, m + 1)], rz, 3);
    } else if (s.t === 'ring') { full = () => worldPolyPath(ringPts(s, s.R + s.th), rz, 2); part = () => worldPolyPath(ringPts(s, Math.max(4, (s.R + s.th) * p)), rz, 2); }
    if (!full) return;
    ctx.globalAlpha = 0.12 * blink; full(); ctx.fill();
    ctx.globalAlpha = 0.34; part(); ctx.fill();
    ctx.globalAlpha = 0.9 * blink; ctx.lineWidth = 3; full(); ctx.stroke();
  }
  //  거미줄 무늬(사각 안 — 가운데에서 여덟 갈래 + 사각 두 겹)
  function webLines(s, rz) {
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, hx = (s.x1 - s.x0) / 2, hz = (s.z1 - s.z0) / 2;
    const c = pj(cx, cz - rz);
    ctx.beginPath();
    for (const [dx, dz] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) { const q = pj(cx + dx * hx, cz + dz * hz - rz); ctx.moveTo(c.x, c.y); ctx.lineTo(q.x, q.y); }
    ctx.stroke();
    for (const f of [0.35, 0.7]) { worldBoxPath(cx - hx * f, cx + hx * f, cz - hz * f, cz + hz * f, rz, 3); ctx.stroke(); }
  }
  //  열차 몸통 질주(교차 레일·레일이 터질 때): 앞(z 큰 끝, 가로면 왼쪽)에서 반대 끝으로 k(0 → 1) — 검붉은 몸 + 노란 창 + 뒤로 흐린 바람 줄
  function trainDash(s, k, rz) {
    const c = clipSegZ(s.ax, s.az, s.bx, s.bz, rz - 240, rz + 780);
    if (!c) return;
    const [ax, az, bx, bz] = c[1] >= c[3] ? c : [c[2], c[3], c[0], c[1]];
    const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L, len = 190;
    const head = k * (L + len), s0 = Math.max(0, head - len), s1 = Math.min(L, head);
    if (s1 <= s0) return;
    const P0 = [ax + ux * s0, az + uz * s0], P1 = [ax + ux * s1, az + uz * s1];
    ctx.globalAlpha = 0.35; ctx.strokeStyle = ATK_FX.train; ctx.lineWidth = 2;
    worldPolyPath(stripPts(ax + ux * Math.max(0, s0 - 120), az + uz * Math.max(0, s0 - 120), P0[0], P0[1], s.r * 0.5), rz, 4); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = ATK_FX.train;
    worldPolyPath(stripPts(P0[0], P0[1], P1[0], P1[1], s.r * 0.8), rz, 6); ctx.fill();
    ctx.strokeStyle = '#1C0B0E'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = ATK_FX.window;
    for (let d = s0 + 14; d < s1 - 8; d += 26) { const q = pj(ax + ux * d, az + uz * d - rz); ctx.beginPath(); ctx.arc(q.x, q.y, 3.4 * q.s, 0, Math.PI * 2); ctx.fill(); }
  }

  //  r4.8 보스 공격 예고 → r4.9 (가)·(나): **광역 공격만** 붉은 경보 구역(규칙 run.bossAtk.cur.zones — 읽기만. 진행 p = 경보 시작부터 그 구역이 터지기까지).
  //   탄 공격은 도로에 아무것도 그리지 않는다(장전 번쩍임은 drawBoss). 초록 안전 구역은 어디에도 없다.
  //   보스 특색 곁들임(경보 중): 굴뚝 매연탄이 포물선으로 날아옴(B1) · 크레인 줄에 매달린 갈고리가 내려옴 · 거미줄 무늬(B2) · 레일 침목(B3) ·
  //   도가니에서 쏟아지는 쇳물 줄기 · 떨어지는 쇳물 방울(B4) · 치켜든 철퇴(B5). 터진 뒤 남는 쇳물(붓기)은 식을 때까지 웅덩이로
  function drawBossAtk(run, now) {
    const cur = run.bossAtk && run.bossAtk.cur;
    if (!cur || cur.type !== 'aoe' || !cur.zones) return;
    const rz = run.z, blink = 0.72 + 0.28 * Math.sin(now * 16);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const z of cur.zones) if (!z.done) warnShape(z.shape, Math.max(0, Math.min(1, cur.age / z.at)), blink, rz);
    drawAtkProps(run, cur, now);
    for (const z of cur.zones) if (z.done && z.until > cur.age) drawPool(z.shape, z.until - cur.age, now, rz);
    ctx.restore();
  }
  function drawAtkProps(run, cur, now) {
    const rz = run.z;
    const bo = (run.bosses ?? []).find((b) => b.id === cur.boss && !b.dead) ?? null;
    for (const z of cur.zones) {
      if (z.done) continue;
      const p = Math.max(0, Math.min(1, cur.age / z.at)), s = z.shape;
      if (cur.kind === 'smoke' && cur.from0) {
        const gx = cur.from0.x + (s.x - cur.from0.x) * p, gz = cur.from0.z + (s.z - cur.from0.z) * p;
        const g = pj(gx, gz - rz), h = 170 * 4 * p * (1 - p) * g.s;
        ctx.globalAlpha = 0.3; ctx.fillStyle = 'rgba(20,25,35,1)';
        ctx.beginPath(); ctx.ellipse(g.x, g.y, 9 * g.s, 3.5 * g.s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.45; ctx.fillStyle = ATK_FX.smoke;
        ctx.beginPath(); ctx.arc(g.x - 7 * g.s, g.y - h + 9 * g.s, 6 * g.s, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = '#2E2B2A';
        ctx.beginPath(); ctx.arc(g.x, g.y - h, 8 * g.s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ATK_FX.flame;
        ctx.beginPath(); ctx.arc(g.x + 3 * g.s, g.y - h - 5 * g.s, 2.6 * g.s, 0, Math.PI * 2); ctx.fill();
      } else if (cur.kind === 'hook' && bo) {
        const g = pj(s.x, s.z - rz), top = pj(bo.x, bo.z - rz), hy = g.y - (1 - p) * 190 * g.s;
        ctx.globalAlpha = 0.9; ctx.strokeStyle = ATK_FX.steel; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(g.x, hy - 16 * g.s); ctx.stroke();
        ctx.lineWidth = Math.max(2, 4 * g.s);
        ctx.beginPath(); ctx.moveTo(g.x, hy - 16 * g.s); ctx.lineTo(g.x, hy); ctx.arc(g.x - 8 * g.s, hy, 8 * g.s, 0, Math.PI * 0.95); ctx.stroke();
      } else if (cur.kind === 'web') {
        ctx.globalAlpha = 0.3 + 0.3 * p; ctx.strokeStyle = ATK_FX.web; ctx.lineWidth = 1.2;
        webLines(s, rz);
      } else if (cur.kind === 'rail' || cur.kind === 'crossrail') {
        const c = clipSegZ(s.ax, s.az, s.bx, s.bz, rz - 240, rz + 780);
        if (!c) continue;
        const [ax, az, bx, bz] = c, L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
        ctx.globalAlpha = 0.45; ctx.strokeStyle = '#3A3530'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let d = 18; d < L; d += 40) {
          const cx = ax + ux * d, cz = az + uz * d, a = pj(cx - uz * s.r * 0.9, cz + ux * s.r * 0.9 - rz), b = pj(cx + uz * s.r * 0.9, cz - ux * s.r * 0.9 - rz);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      } else if (cur.kind === 'pour' && cur.from0 && bo) {
        const a = pj(bo.x + bo.r * 0.5, bo.z - bo.r * 0.2 - rz), g = pj(s.x, s.z - rz);
        ctx.globalAlpha = 0.85; ctx.strokeStyle = ATK_FX.molten; ctx.lineWidth = (3 + 8 * p) * g.s;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + g.x) / 2, a.y - 40, g.x, g.y); ctx.stroke();
      } else if (cur.kind === 'rain') {
        const g = pj(s.x, s.z - rz), h = (1 - p) * 210 * g.s;
        ctx.globalAlpha = 0.9; ctx.fillStyle = ATK_FX.molten;
        ctx.beginPath(); ctx.arc(g.x, g.y - h, 5 * g.s, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(g.x, g.y - h - 9 * g.s, 3 * g.s, 0, Math.PI * 2); ctx.fill();
      } else if (cur.kind === 'mace' && cur.apex) {
        const a = cur.phi - cur.half * (cur.swing || 1), R = cur.R * 0.88;
        const o = pj(cur.apex[0], cur.apex[1] - rz), h = pj(cur.apex[0] + Math.cos(a) * R, cur.apex[1] + Math.sin(a) * R - rz);
        ctx.globalAlpha = 0.95; ctx.strokeStyle = ATK_FX.gold; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.fillStyle = ATK_FX.gold;
        ctx.beginPath(); ctx.arc(h.x, h.y, (9 + 3 * Math.sin(now * 18)) * h.s, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  //  남은 쇳물 웅덩이(붓기 — 식을 때까지 들어가면 피해): 주황·분홍 발광 원 + 노란 거품(시각 now 로 끓는다). 마지막 0.5초에 흐려진다
  function drawPool(s, left, now, rz) {
    const fade = Math.min(1, left / 0.5);
    ctx.globalAlpha = 0.55 * fade; ctx.fillStyle = ATK_FX.molten; worldCirclePath(s.x, s.z, s.R, rz); ctx.fill();
    ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = '#FFB347'; worldCirclePath(s.x, s.z, s.R * 0.62, rz); ctx.fill();
    ctx.globalAlpha = 0.65 * fade; ctx.fillStyle = '#FFE08A';
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + now * 0.8, rr = s.R * (0.2 + 0.12 * i), q = pj(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr - rz);
      ctx.beginPath(); ctx.arc(q.x, q.y, ((1 + Math.sin(now * 5 + i * 2)) * 2 + 1) * q.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = '#FF5FA8'; ctx.lineWidth = 2.5; worldCirclePath(s.x, s.z, s.R, rz); ctx.stroke();
  }
  //  그물에 걸린 부대(규칙 run.slowT — 읽기만): 부대 위에 흰 거미줄(느려진 동안, 끝나 갈수록 흐려진다)
  function drawSlowWeb(run) {
    if (!(run.slowT > 0) || !run.units.length) return;
    const zc = run.z - (run.ay || 0), c = pj(run.x, zc - run.z), R = 70;
    ctx.save();
    ctx.globalAlpha = Math.min(1, run.slowT / 0.6) * 0.75; ctx.strokeStyle = ATK_FX.web; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, q = pj(run.x + Math.cos(a) * R, zc + Math.sin(a) * R - run.z); ctx.moveTo(c.x, c.y); ctx.lineTo(q.x, q.y); }
    ctx.stroke();
    for (const f of [0.4, 0.75]) { worldCirclePath(run.x, zc, R * f, run.z, 16); ctx.stroke(); }
    ctx.restore();
  }

  //  r4.9 보스 고유 공격이 터질 때(셸 fx.atkBlasts — 규칙 좌표, 이벤트 bossBoom 이 넣는다) 보스 특색 연출:
  //   매연(주황 불꽃 + 부푸는 회색 연기) · 갈고리(강철 번쩍 + 먼지 고리) · 거미줄(흰 줄 무늬) · 레일(열차 몸통 질주) · 쇳물(주황 튀김 고리) ·
  //   철퇴(금빛 팔이 부채꼴을 쓸고 지나간 자리 잔상) · 충격파(끊긴 금빛 고리가 퍼진다)
  function drawAtkBlasts(list, rz) {
    if (!list || !list.length) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const b of list) {
      const k = Math.max(0, Math.min(1, b.t / (b.life || 0.35))), s = b.shape;
      if (!s) continue;
      if (b.kind === 'smoke') {
        if (k < 0.35) { ctx.globalAlpha = 0.7 * (1 - k / 0.35); ctx.fillStyle = ATK_FX.flame; worldCirclePath(s.x, s.z, s.R * (0.5 + k), rz); ctx.fill(); }
        ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = ATK_FX.smoke;
        for (let i = 0; i < 5; i++) { const a = i * 1.2566, d = s.R * 0.45 * (0.6 + k); worldCirclePath(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, s.R * (0.35 + 0.35 * k), rz, 16); ctx.fill(); }
      } else if (b.kind === 'hook') {
        ctx.globalAlpha = 0.85 * (1 - k); ctx.strokeStyle = ATK_FX.steel; ctx.lineWidth = 5 * (1 - k) + 1;
        worldCirclePath(s.x, s.z, s.R * (0.3 + 0.8 * k), rz); ctx.stroke();
        if (k < 0.3) { ctx.globalAlpha = 0.6 * (1 - k / 0.3); ctx.fillStyle = '#FFFFFF'; worldCirclePath(s.x, s.z, s.R * 0.35, rz); ctx.fill(); }
      } else if (b.kind === 'web') {
        ctx.globalAlpha = 0.9 * (1 - k); ctx.strokeStyle = ATK_FX.web; ctx.lineWidth = 1.8;
        webLines(s, rz);
      } else if (b.kind === 'rail' || b.kind === 'crossrail') {
        trainDash(s, k, rz);
      } else if (b.kind === 'pour' || b.kind === 'rain') {
        ctx.globalAlpha = 0.85 * (1 - k); ctx.strokeStyle = ATK_FX.molten; ctx.lineWidth = 4 * (1 - k) + 1;
        worldCirclePath(s.x, s.z, s.R * (0.4 + 0.8 * k), rz); ctx.stroke();
      } else if (b.kind === 'mace' && s.pts) {
        const apex = s.pts[0], arc = s.pts.slice(1), m = Math.max(1, Math.round((arc.length - 1) * k));
        const sweep = arc;
        ctx.globalAlpha = 0.35 * (1 - 0.5 * k); ctx.fillStyle = ATK_FX.gold; worldPolyPath([apex, ...sweep.slice(0, m + 1)], rz, 3); ctx.fill();
        const a = pj(apex[0], apex[1] - rz), h = pj(sweep[m][0], sweep[m][1] - rz);
        ctx.globalAlpha = 1; ctx.strokeStyle = ATK_FX.gold; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.fillStyle = ATK_FX.gold; ctx.beginPath(); ctx.arc(h.x, h.y, 11 * h.s, 0, Math.PI * 2); ctx.fill();
      } else if (b.kind === 'quake' && s.t === 'ring') {
        const R = Math.max(4, (s.R + s.th) * k);
        ctx.globalAlpha = 0.9 * (1 - 0.6 * k); ctx.strokeStyle = ATK_FX.gold; ctx.lineWidth = 6;
        ctx.beginPath();
        for (let i = 0; i <= 36; i++) { const a = s.ang + s.half + (Math.PI * 2 - 2 * s.half) * i / 36, q = pj(s.x + Math.cos(a) * R, s.z + Math.sin(a) * R - rz); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }


  //  파편·플로터·팝은 셸이 만드는 시점에 투영한 **화면 좌표**를 들고 있다(main.js) — 여기서는 그대로 찍는다
  function drawParts(parts) {
    for (const p of parts) {
      const k = 1 - p.t / p.life;
      if (p.flash) {
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = p.big ? '#FFD9A0' : '#FFE9C8';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'line') {
        //  가는 선(저격 은백·금속 스파크): 진행 방향으로 늘어진 짧은 선
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.r);
        const L = 0.045;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * L, p.y - p.vy * L); ctx.stroke();
      } else if (p.shape === 'bolt') {
        //  번개 조각(전격 청보라): 세 마디 지그재그
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.2, p.r * 0.8);
        const ux = p.vx * 0.03, uy = p.vy * 0.03;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * 0.5 + uy * 0.5, p.y - uy * 0.5 - ux * 0.5);
        ctx.lineTo(p.x - ux + -uy * 0.3, p.y - uy + ux * 0.3);
        ctx.stroke();
      } else if (p.shape === 'plate') {
        //  장갑판 조각: 돌며 날아가는 납작한 판
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + p.t * 9);
        ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        ctx.restore();
      } else if (p.shape === 'smoke') {
        //  연기·먼지: 커지며 옅어지는 덩이
        ctx.globalAlpha = k * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - k * 0.8), 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'star') {
        //  반짝임(합류·게이트 양수): 네 갈래 별
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        const a = p.r * (0.6 + k), b2 = a * 0.3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - a); ctx.lineTo(p.x + b2, p.y - b2); ctx.lineTo(p.x + a, p.y); ctx.lineTo(p.x + b2, p.y + b2);
        ctx.lineTo(p.x, p.y + a); ctx.lineTo(p.x - b2, p.y + b2); ctx.lineTo(p.x - a, p.y); ctx.lineTo(p.x - b2, p.y - b2);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color ?? (p.big ? C.bulletHeavy : C.gateNeg);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k + 1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  //  부대로 날아가는 병사(r3.24 합류 연출, 셸 fx.recruits — 셸이 매 프레임 투영해 둔 화면점 sx/sy/s): 병사 그림(없으면 삼각) + 금색 테
  function drawRecruits(list) {
    if (!list || !list.length) return;
    const S = BAL3.squad;
    const walk = sheet('soldier_walk');
    for (const p of list) {
      if (p.t < 0) continue;
      //  실제 병사보다 조금 크게(1.3배) — 먼 통에서 출발하면 원근 배율이 작아 캡처에서 점처럼 보였다
      const size = S.soldierSize * (p.s || 1) * 1.3;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(246,200,74,0.35)';
      ctx.beginPath(); ctx.arc(p.sx, p.sy, size * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (walk) drawSheetFrame(walk, sheetFrameAt(walk, p.t * 1.6 + p.i * 0.13), p.sx, p.sy, size);
      else drawImgCentered('soldier', p.sx, p.sy, size, () => {
        ctx.fillStyle = C.soldier;
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy - size / 2);
        ctx.lineTo(p.sx - size / 3, p.sy + size / 2);
        ctx.lineTo(p.sx + size / 3, p.sy + size / 2);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  function drawFloaters(floaters) {
    ctx.textAlign = 'center';
    for (const f of floaters) {
      //  '-n' 은 HUD 띠(HP 숫자와 같은 문턱)에 들어오면 그리지 않는다 — 먼 곳에서 맞는 적의 숫자가 제목·칩 위에 겹친다(캡처 실측)
      if (f.dmg && f.y < HP_TAG_MIN_Y) continue;
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
      //  '-n'(r3.24 피격 숫자): 작은 글자(px) — 숫자가 묶여 커질 때(pop 0 → 0.12초) 잠깐 부푼다
      const px = f.px ? f.px * (f.pop !== undefined && f.pop < 0.12 ? 1.35 - f.pop * 2.9 : 1) : (f.big ? 34 : 22);
      outlinedText(f.text, f.x, f.y, px, f.color, 'bold', f.px ? 4 : 5);
    }
    ctx.globalAlpha = 1;
  }

  //  보상 팝: 떠오른 뒤 부대로 흡수되는 글자(위치는 셸이 움직인다)
  function drawPops(pops) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of pops) {
      const k = p.t / p.life;
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      outlinedText(p.text, p.x, p.y, 26, p.color, 'bold', 6);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  /** 랜덤 길 가림(계약서 3-9): 통로 확정선(lot.revealZ) 전에는 우측 통로 물체를 '?' 상자로 덮는다.
   *  0 = 다 걷힘 · 1 = 완전히 덮임. 확정 직후 0.25초(fx.lotOpen)에 걸쳐 걷힌다. */
  function lotteryMask(run, fx) {
    const lot = run.lottery;
    if (!lot) return 0;
    if (run.z < lot.revealZ) return 1;
    const left = fx && fx.lotOpen ? fx.lotOpen : 0;
    const openT = BAL3.lottery.openT || 0.25;
    return left > 0 ? Math.max(0, Math.min(1, left / openT)) : 0;
  }

  //  '?' 상자(가림 판). 회색 판 + 금색 물음표. 걷히는 동안 위로 줄어들며 사라진다. 자리·크기는 lot.z 에서 투영(글은 하한 15px)
  function drawLotteryBox(run, mask) {
    const lot = run.lottery;
    if (!lot || mask <= 0) return;
    const d = lot.z - run.z;
    if (offscreen(d, 70)) return;
    const q = pj(lot.x, d), x = q.x, y = q.y, k = q.s;
    const bw = 88 * k, bh = 76 * k;
    ctx.save();
    ctx.globalAlpha = mask;
    shadow(x, y + bh * 0.46, 34 * k);
    ctx.fillStyle = 'rgba(120,128,140,0.92)';
    roundRect(x - bw / 2, y - bh / 2, bw, bh, 12 * k);
    ctx.fill();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 4;
    roundRect(x - bw / 2, y - bh / 2, bw, bh, 12 * k);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlinedText('?', x, y - 4 * k, fsMin(44, k), C.gold, 'bold', 6);
    outlinedText('랜덤 길', x, y + 26 * k, fsMin(14, k), C.supplyBody, 'bold', 4);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  //  HUD 칩 바탕(무기·⏸ 공통 — r4.2 에서 난이도 칩 삭제) — 같은 높이·같은 모서리 반경·같은 바탕색을 한 함수에서만 그린다
  function hudChip(b) {
    ctx.fillStyle = 'rgba(20,35,58,0.82)';
    roundRect(b.x, b.y, b.w, b.h, HUD_ROW.r);
    ctx.fill();
  }

  //  HUD: 좌상 STAGE n 제목 + 남은 거리 m / 우상 한 줄(무기 칩 · ⏸ — r4.2 에서 난이도 칩 삭제) / 정예 HP 막대+숫자
  //  ⚠️우상 조각의 자리는 HUD_ROW 한 곳에서 온다. ⏸ 만은 **셸이 넘긴 버튼 상자 그대로** 그린다 —
  //   그 상자가 곧 히트 영역이라, 그리는 자리와 누르는 자리가 구조적으로 같아진다(drawButtons 는 이 버튼을 건너뛴다).
  function drawHud(view) {
    const run = view.run, hud = view.hud;
    const cy = HUD_ROW.cy;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    //  제목은 무기 칩 앞에서 끝나야 한다(24스테이지 제목 중 '크라운 브레이커' 같은 긴 것). r4.2: 종전 끝선은 난이도 칩 왼쪽(x 220)이었다 — 칩이 없어져 무기 칩 왼쪽(x 292)까지
    //  순서: 기본 크기 → 한 단계 작게(17px) → 그래도 넘치면 'STAGE ' 접두 제거 → 마지막 안전망 maxWidth
    //  r4.3: 코인 칩이 있으면 그 왼쪽까지(r4.5: 무기 칩이 넓어져 x 194 — 제목 최대 폭 172px — Chromium 실측 15개 판은 20px 그대로, 8개 판은 17px, 24번은 'STAGE' 접두 없이)
    const coinN = hud && Number.isFinite(hud.coins) ? hud.coins : null;
    const titleMaxW = (coinN !== null ? HUD_ROW.box.coin.x : HUD_ROW.box.weapon.x) - HUD_ROW.left - 6;
    const fits = (t, fs) => { ctx.font = '900 ' + fs + 'px ' + FONT; return ctx.measureText(t).width <= titleMaxW; };
    const full = 'STAGE ' + run.stageId + '  ' + run.title, short = run.stageId + '  ' + run.title;
    let titleText = full, titleFs = HUD_ROW.titleFs;
    if (!fits(full, titleFs)) { titleFs = HUD_ROW.titleFsSmall; if (!fits(full, titleFs)) titleText = short; }
    outlinedText(titleText, HUD_ROW.left, cy, titleFs, C.hud, '900', 6, titleMaxW);
    //  보너스전(r3.15): 목표 줄에 남은 초·점수·단계(금색). 비보너스 경로('정예 전투!'/'작전 완료'/'남은 거리')는 한 줄도 바뀌지 않는다
    const bo = run.bonus ?? null;
    if (bo) {
      const left = Math.max(0, Math.ceil(bo.sec - bo.t));
      outlinedText('보너스 ' + left + '초 · ' + bo.score + '점 · 단계 ' + bo.tier, HUD_ROW.left, HUD_ROW.distCy, HUD_ROW.distFs, C.gold, 'bold', 5);
    } else {
      //  r3.16 복수 정예: 보스가 둘 이상이면 '정예 전투! 남은 목표 N/M'. 단수는 종전 문구 그대로
      const bTotal = (run.bosses ?? []).length, bLeft = (run.bosses ?? []).filter((b) => !b.dead).length;
      //  r3.17 아레나: 광장 보스전은 '아레나 전투!'(도로 정예 문구는 그대로)
      //  r4.10 대물결 판(결승선 run.finishZ): '결승선까지 Nm'(판 길이 = 결승선) → 넘으면 '작전 완료'
      //  r4.10 중간 보스: '중간 보스 전투!'
      const goal = run.boss ? (run.boss.mid ? '중간 보스 전투!' : run.phase === 'arena' ? '아레나 전투!' : bTotal > 1 ? '정예 전투! 남은 목표 ' + bLeft + '/' + bTotal : '정예 전투!')
        : (run.bossDefeated || (run.finishZ != null && run.won)) ? '작전 완료' : run.finishZ != null ? '결승선까지 ' + hud.distM + 'm' : '남은 거리 ' + hud.distM + 'm';
      outlinedText(goal, HUD_ROW.left, HUD_ROW.distCy, HUD_ROW.distFs, run.boss ? C.gateNeg : C.hero, 'bold', 5);
    }
    //  무기 칩
    const wb = HUD_ROW.box.weapon;
    const w = WEAPONS[run.weapon] ?? WEAPONS.rifle;
    hudChip(wb);
    const mk = run.weaponMk || 1;
    const wim = icon(w.id, mk) || icon(w.id);
    if (wim) drawIconCentered(wim, wb.x + 26, cy, 24, 34);
    else {
      ctx.fillStyle = w.color;
      roundRect(wb.x + 12, cy - 5, 26, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(wb.x + 16, cy - 3, 7, 6);
    }
    //  r4.5: '기관총 Mk II' 꼴 한 줄(어절 사이에서도 줄을 나누지 않는다). 칩 폭 148 은 Chromium 실측으로 15px 에 들어가는 폭이고,
    //   글꼴이 더 넓은 기기에서 넘치면 글자 크기를 한 단계씩(최소 12px) 줄인다 — 칩 밖으로 나가거나 ⏸ 에 겹치지 않게. maxWidth 는 마지막 안전망
    const wLabel = w.name + (MK_LABEL[mk] ?? ''), wAvail = wb.w - 54;
    let wfs = HUD_ROW.fs;
    ctx.font = 'bold ' + wfs + 'px ' + FONT;
    while (wfs > 12 && ctx.measureText(wLabel).width > wAvail) { wfs--; ctx.font = 'bold ' + wfs + 'px ' + FONT; }
    ctx.fillStyle = w.color;
    ctx.fillText(wLabel, wb.x + 48, cy, wAvail);
    //  r4.2: 무기 칩 왼쪽의 난이도 태그('어려움'·'지옥')를 지웠다
    //  r4.3 코인 칩: 금색 동전 + 이번 판 누계(정산 전). 같은 칩 바탕·높이·글자 크기(HUD_ROW 한 곳)
    if (coinN !== null) {
      const cb = HUD_ROW.box.coin;
      hudChip(cb);
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.arc(cb.x + 17, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cb.x + 17, cy, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.font = 'bold ' + HUD_ROW.fs + 'px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText(String(coinN), cb.x + 29, cy, cb.w - 33);
    }
    //  ⏸(일시정지) — 셸이 hud:true 로 넘긴 버튼만. 없는 상태(일시정지 중·결과)에서는 그리지 않는다
    const pb = (view.buttons ?? []).find((b) => b.hud);
    if (pb) {
      hudChip(pb);
      ctx.textAlign = 'center';
      ctx.font = '700 ' + HUD_ROW.fs + 'px ' + FONT;
      ctx.fillStyle = C.hero;
      ctx.fillText(pb.label, pb.x + pb.w / 2, pb.y + pb.h / 2);
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'alphabetic';
    //  정예 HP 막대. r3.16 복수 정예: 보스가 둘 이상이면 300px 를 gap 6 으로 등분해 칸마다 '역할 hp/max'(격파된 칸은 회색 '격파'). 단수는 종전 그리기 그대로
    //   r4.10 중간 보스는 HUD 막대 대신 머리 위 이름표·체력 막대(drawMidBoss)
    if (run.boss && !run.boss.mid) {
      const bosses = run.bosses ?? [run.boss];
      //  r3.24: 보스가 맞는 동안 막대가 좌우로 떨린다(떨림은 캔버스 이동으로만 — 막대 좌표는 그대로)
      const bfx = view.fx && view.fx.hit;
      const barShake = (b) => { const h = bfx ? bfx[b.id] : null; return h && h.t < FX.hit.knockSec ? Math.sin(h.t * 110) * 3 * (1 - h.t / FX.hit.knockSec) : 0; };
      if (bosses.length <= 1) {
        const bs = barShake(run.boss);
        if (bs) { ctx.save(); ctx.translate(bs, 0); }
        ctx.fillStyle = 'rgba(20,35,58,0.85)';
        roundRect(90, 76, 300, 16, 8); ctx.fill();
        //  r4.9 (다) 광분 중 체력 막대는 붉게
        ctx.fillStyle = run.boss.rage ? RAGE_COLOR : C.eshot;
        roundRect(90, 76, 300 * Math.max(0, run.boss.hp / run.boss.max), 16, 8); ctx.fill();
        ctx.textAlign = 'center';
        outlinedText('정예 ' + Math.max(0, Math.ceil(run.boss.hp)) + ' / ' + run.boss.max, W / 2, 111, 15, C.hud, 'bold', 4);
        if (bs) ctx.restore();
      } else {
        const n = bosses.length, gap = 6, segW = (300 - gap * (n - 1)) / n, fs = n >= 3 ? 12 : 13;
        ctx.textAlign = 'center';
        for (let i = 0; i < n; i++) {
          const b = bosses[i], x = 90 + i * (segW + gap);
          const bs = b.dead ? 0 : barShake(b);
          if (bs) { ctx.save(); ctx.translate(bs, 0); }
          ctx.fillStyle = 'rgba(20,35,58,0.85)';
          roundRect(x, 76, segW, 16, 8); ctx.fill();
          if (!b.dead) {
            ctx.fillStyle = b.rage ? RAGE_COLOR : C.eshot;
            roundRect(x, 76, segW * Math.max(0, Math.min(1, b.hp / b.max)), 16, 8); ctx.fill();
          }
          const label = BAL3.elites?.roles?.[b.role ?? 'elite']?.label ?? '정예';
          outlinedText(b.dead ? '격파' : label + ' ' + Math.max(0, Math.ceil(b.hp)) + '/' + b.max, x + segW / 2, 111, fs, b.dead ? C.gateZero : C.hud, 'bold', 4);
          if (bs) ctx.restore();
        }
      }
    }
    //  보너스전 진행 막대(r3.15): 정예 HP 막대 자리(y 76, 300×16)를 재사용 — 다음 단계 문턱까지 score/next(만렙이면 가득) + 아래 글.
    //   run·paused 상태에서만(검수 반영): 결과 화면은 run 장면 위에 덮이는 규약이라 이 글(y111)이 '작전 성공!' 바로 위에 비쳐 겹쳐 읽혔다
    if (bo && !run.boss && (view.state === 'run' || view.state === 'paused')) {
      const tiers = (run.bonusDef && run.bonusDef.tiers) || [];
      const next = tiers[bo.tier] ?? null;
      const prev = bo.tier > 0 ? tiers[bo.tier - 1] : 0;
      const k = next == null ? 1 : Math.max(0, Math.min(1, (bo.score - prev) / Math.max(1, next - prev)));
      ctx.fillStyle = 'rgba(20,35,58,0.85)';
      roundRect(90, 76, 300, 16, 8); ctx.fill();
      ctx.fillStyle = C.gold;
      roundRect(90, 76, 300 * k, 16, 8); ctx.fill();
      ctx.textAlign = 'center';
      outlinedText(next == null ? '최고 단계' : '다음 단계까지 ' + Math.max(0, next - bo.score) + '점', W / 2, 111, 15, C.hud, 'bold', 4);
    }
  }

  //  배너 상자 1개(셔터 배너·목표 배너 공용): 문구는 줄 배열로 받는다(한 줄로 쓰면 480px 화면에서 양끝이 잘린다 — 줄은 어절 경계에서만 나눈다).
  //   반환 = 상자 높이(다음 배너를 그 아래에 쌓기 위해)
  function bannerBox(text, y, alpha) {
    const lines = Array.isArray(text) ? text : [text];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20,35,58,0.86)';
    const bh = 22 + lines.length * 24;
    roundRect(28, y, W - 56, bh, 14); ctx.fill();
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = C.hud;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, y + 23 + i * 24);
    ctx.globalAlpha = 1;
    return bh;
  }

  //  안내·경고 배너
  function drawBanners(fx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (fx.guideT > 0) {
      ctx.globalAlpha = Math.min(1, fx.guideT / 0.5);
      ctx.fillStyle = 'rgba(20,35,58,0.82)';
      roundRect(40, 268, W - 80, 52, 14); ctx.fill();
      ctx.font = 'bold 18px ' + FONT;
      ctx.fillStyle = C.hud;
      ctx.fillText('좌우로 드래그 · 쏴서 숫자를 키우세요', W / 2, 294);
      ctx.globalAlpha = 1;
    }
    //  슬롯 C(y 332): 첫 플레이 안내(y 268)·정예 경고(y 196)와 겹치지 않는 자리. 여러 배너가 동시에 살아 있으면 셔터 → 목표 순으로 아래로 쌓는다(+bh+8)
    let slotY = 332;
    //  첫 셔터 조우 배너(N2-⑥): 셔터가 걸린 행이 처음 화면에 들어온 그 시점에 1회. 문구는 셸이 넘긴다
    if (fx.shutterT > 0 && fx.shutterText) {
      slotY += bannerBox(fx.shutterText, slotY, Math.min(1, fx.shutterT / 0.5)) + 8;
    }
    //  작전 목표 배너(r3.14 구출 캡슐): 출격 직후 판당 1회. fx 새 칸은 ?? 로 관용(옛 fx 꼴에도 그린다)
    if ((fx.objT ?? 0) > 0 && fx.objText) {
      slotY += bannerBox(fx.objText, slotY, Math.min(1, fx.objT / 0.5)) + 8;
    }
    //  아레나 안내 배너(r3.17): 광장 전환 시 판마다 1회 '드래그로 피하세요'(두 줄). 같은 슬롯 C 에 셔터 → 목표 → 아레나 순으로 쌓인다. fx 새 칸은 ?? 로 관용
    if ((fx.arenaT ?? 0) > 0 && fx.arenaText) {
      slotY += bannerBox(fx.arenaText, slotY, Math.min(1, fx.arenaT / 0.5)) + 8;
    }
    if (fx.eliteT > 0) {
      const k = fx.eliteT / FX.eliteBannerSec;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(194,39,59,0.85)';
      ctx.fillRect(0, 196, W, 56);
      ctx.font = '900 30px ' + FONT;
      ctx.fillStyle = '#FFFFFF';
      //  r3.16 복수 정예: 셸이 '정예 2체 접근!' 처럼 문구를 넘기면 그것을, 없으면(옛 fx 꼴) 종전 문구
      ctx.fillText(fx.eliteText ?? '정예 접근!', W / 2, 224);
      ctx.globalAlpha = 1;
    }
    //  정예 처치 배너(r3.16 복수 정예): 하나를 잡았는데 목표가 남았을 때 같은 슬롯 A(y196 h56)에 붉은 띠로 '정예 N 격파 — 남은 목표 M'. fx 새 칸은 ?? 로 관용
    if ((fx.bossBannerT ?? 0) > 0 && fx.bossBannerText) {
      const k = fx.bossBannerT / (FX.bossKillBannerSec || 1.2);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(194,39,59,0.85)';
      ctx.fillRect(0, 196, W, 56);
      ctx.font = '900 26px ' + FONT;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(fx.bossBannerText, W / 2, 224);
      ctx.globalAlpha = 1;
    }
    //  보너스전 시작 배너(r3.15): 정예 경고와 같은 슬롯 A(y196 h56) 를 금색 띠로 — 시간상 배타(정예 배너는 보스 등장 때 0.8초로 이미 끝났다). fx 새 칸은 ?? 로 관용
    if ((fx.bonusT ?? 0) > 0 && fx.bonusText) {
      const k = fx.bonusT / (BAL3.bonus.bannerSec || 1.5);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(246,200,74,0.9)';
      ctx.fillRect(0, 196, W, 56);
      ctx.font = '900 30px ' + FONT;
      ctx.fillStyle = C.outline;
      ctx.fillText(fx.bonusText, W / 2, 224);
      ctx.globalAlpha = 1;
    }
    //  r4.10 결승선 돌파 배너(대물결 판 — 결승선을 넘은 STEP 에 셸이 세운다): 보너스전 배너와 같은 슬롯 A(y196 h56) 금색 띠. fx 새 칸은 ?? 로 관용
    if ((fx.finishT ?? 0) > 0 && fx.finishText) {
      const k = fx.finishT / (FX.finishBannerSec || 1.2);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(246,200,74,0.9)';
      ctx.fillRect(0, 196, W, 56);
      ctx.font = '900 30px ' + FONT;
      ctx.fillStyle = C.outline;
      ctx.fillText(fx.finishText, W / 2, 224);
      ctx.globalAlpha = 1;
    }
    //  r4.9 (다) 광분 배너: 화면 가운데 검붉은 띠 + 붉은 테 + '광분!'(한 어절 — 줄바꿈 없음). 들어올 때 크게 튀었다 제 크기로, 끝날 때 흐려진다
    if ((fx.rageT ?? 0) > 0 && fx.rageText) {
      const k = fx.rageT / (FX.rageBannerSec || 1);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(120,8,16,0.9)';
      ctx.fillRect(0, 362, W, 76);
      ctx.fillStyle = RAGE_COLOR;
      ctx.fillRect(0, 362, W, 4); ctx.fillRect(0, 434, W, 4);
      const pop = 1 + 0.3 * Math.max(0, (k - 0.8) / 0.2);
      ctx.font = '900 ' + Math.round(48 * pop) + 'px ' + FONT;
      ctx.lineWidth = 6; ctx.strokeStyle = C.outline;
      ctx.strokeText(fx.rageText, W / 2, 400);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(fx.rageText, W / 2, 400);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  //  버튼 공통(기존 복제): 주 버튼 = 딥 네이비 + 시안 라인, 보조 = 반투명 네이비 패널
  function drawButtons(buttons) {
    for (const b of buttons) {
      //  HUD 줄에 얹히는 버튼(⏸)은 drawHud 가 같은 칩으로 그린다 — 여기서 또 그리면 두 겹이 되고 모양이 갈라진다
      if (b.hud) continue;
      ctx.globalAlpha = b.disabled ? 0.45 : 1;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.primary) {
        ctx.fillStyle = C.outline;
        roundRect(b.x, b.y, b.w, b.h, Math.min(b.h / 2, 16)); ctx.fill();
        ctx.strokeStyle = C.gatePos; ctx.lineWidth = 2;
        roundRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, Math.min((b.h - 2) / 2, 15)); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(20,35,58,0.82)';
        roundRect(b.x, b.y, b.w, b.h, Math.min(b.h / 2, 16)); ctx.fill();
        ctx.strokeStyle = 'rgba(246,200,74,0.65)'; ctx.lineWidth = 1.5;
        roundRect(b.x, b.y, b.w, b.h, Math.min(b.h / 2, 16)); ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = b.primary ? '#FFFFFF' : C.hero;
      if (b.sub) {
        //  r4.4(D9′): 옛 지옥 기록 줄(prev)이 있는 스테이지 칸은 세 줄 — 이름·v4 기록을 조금 올리고 맨 아래에 작고 흐리게 '이전 기록 …'.
        //   prev 가 없는 버튼은 종전 두 줄 자리 그대로
        const up = b.prev ? 4 : 0;
        ctx.font = '700 17px ' + FONT;
        ctx.fillText(b.label, cx, cy - 10 - up);
        ctx.font = '13px ' + FONT;
        ctx.fillStyle = b.primary ? 'rgba(255,255,255,0.75)' : 'rgba(243,241,232,0.75)';
        //  maxWidth: '완료 · 63명 · 0:47 · 구출✓'(r3.14) 처럼 긴 sub 가 칸을 넘치면 가로로 조금 압축, 안 넘치면 무변화
        ctx.fillText(b.sub, cx, cy + 12 - up * 2, b.w - 12);
        if (b.prev) {
          ctx.font = '11px ' + FONT;
          ctx.fillStyle = b.primary ? 'rgba(255,255,255,0.45)' : 'rgba(243,241,232,0.45)';
          ctx.fillText(b.prev, cx, cy + 19, b.w - 12);
        }
      } else {
        ctx.font = '700 ' + (b.small ? 15 : 19) + 'px ' + FONT;
        ctx.fillText(b.label, cx, cy);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
      //  r4.3 순차 해금: 잠긴 스테이지 버튼은 흐린 버튼(disabled 알파) 위 오른쪽 위 모서리에 자물쇠 — 색만으로 구분하지 않는 형태 신호(셔터 자물쇠와 같은 모양)
      if (b.locked) drawLockBadge(b.x + b.w - 14, b.y + 16, 0.9);
      //  r4.10 보스 판(게임 화면 줄 3·6·9·…·24): 왼쪽 위 모서리 — 칸 윗변에 걸쳐 이름 글과 겹치지 않는다
      if (b.boss) drawCrownBadge(b.x + BOSS_BADGE.dx, b.y + BOSS_BADGE.dy);
    }
  }

  //  맨 아래 경고 한 줄(타이틀·결과 공통, 종전 '기록 저장 안 됨' 자리 H−22). r4.3: 읽기 전용 탭 안내 > 기록·코인 저장 실패 순으로 하나만
  function drawSaveWarn(v) {
    let text = null;
    if (v.readOnly) text = SAVE_WARN.readOnly;
    else if (v.saveOk === false && v.coinSaveOk === false) text = SAVE_WARN.both;
    else if (v.coinSaveOk === false) text = SAVE_WARN.coin;
    else if (v.saveOk === false) text = SAVE_WARN.record;
    if (!text) return;
    ctx.textAlign = 'center';
    ctx.font = '600 13px ' + FONT;
    ctx.fillStyle = C.gateNeg;
    ctx.fillText(text, W / 2, H - 22);
  }

  //  타이틀: 워드마크 + 히어로 + 스테이지 선택 3버튼(기록은 버튼 sub)
  function drawTitle(view) {
    drawBackground(view.now * 60, 0);
    ctx.textAlign = 'center';
    ctx.font = '700 15px ' + FONT;
    ctx.fillStyle = '#B98A1F';
    ctx.fillText('S T A R F O R G E   R U S H   v3', W / 2, 96);
    ctx.font = '900 50px ' + FONT;
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(243,241,232,0.9)';
    ctx.strokeText('스타포지 러시', W / 2, 150);
    ctx.fillStyle = C.outline;
    ctx.fillText('스타포지 러시', W / 2, 150);
    ctx.font = '600 16px ' + FONT;
    ctx.fillStyle = 'rgba(20,35,58,0.72)';
    ctx.fillText('쏴서 숫자를 키우고, 부대를 불려라', W / 2, 182);
    drawImgCentered('m1', W / 2, 282, 170, () => {
      ctx.fillStyle = C.hero;
      ctx.beginPath(); ctx.arc(W / 2, 282, 55, 0, Math.PI * 2); ctx.fill();
    });
    //  r4.5(v4 ⑤단계): 종전 난이도 토글 줄(y 382~416)에 [로봇 강화] 버튼(셸 main.TITLE_UPGRADE_BTN — drawButtons 가 그린다)과
    //   그 왼쪽 보유 코인(코인 그림 bonus_coin 재사용, 그림이 없으면 금색 동전 도형). 코인이 저장되지 않는 탭(읽기 전용·저장 실패)은 흐리게 — 맨 아래 경고가 이유를 말한다
    const ub = (view.buttons ?? []).find((b) => b.id === 'upgrade');
    if (ub && Number.isFinite(view.coins)) {
      const cy = ub.y + ub.h / 2;
      ctx.globalAlpha = view.coinSaveOk === false ? 0.5 : 1;
      drawCoinIcon(78, cy, 26);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 16px ' + FONT;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,35,58,0.85)';
      const ct = '보유 코인 ' + fmtInt(view.coins);
      ctx.strokeText(ct, 96, cy, ub.x - 104);
      ctx.fillStyle = C.gold;
      ctx.fillText(ct, 96, cy, ub.x - 104);
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    //  r4.3 순차 해금 안내('앞 판을 먼저 깨야 합니다'): 잠긴 판을 불렀을 때 잠깐. r4.5: y 382 줄에 [로봇 강화]가 들어와서
    //   '작전을 고르세요' 글 자리(y 418~442 — 버튼 줄 아래·스테이지 칸 위)를 그동안 이 안내가 대신 쓴다(버튼 위에 덮이지 않게)
    if (view.notice) {
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillStyle = 'rgba(20,35,58,0.88)';
      roundRect(W / 2 - 140, 419, 280, 24, 12); ctx.fill();
      ctx.fillStyle = C.gold;
      ctx.textBaseline = 'middle';
      ctx.fillText(view.notice, W / 2, 431);
      ctx.textBaseline = 'alphabetic';
    } else {
      ctx.font = '700 15px ' + FONT;
      ctx.fillStyle = 'rgba(20,35,58,0.8)';
      ctx.fillText('작전을 고르세요', W / 2, 430);
    }
    drawSaveWarn({ saveOk: view.saveOk, coinSaveOk: view.coinSaveOk, readOnly: view.readOnly });
  }

  //  코인 그림(r4.5 — 타이틀·강화 화면 공용): 보너스 표적의 bonus_coin 그림을 높이 h 로. 그림이 없으면(Node·로딩 전) 금색 동전 도형
  function drawCoinIcon(x, y, h) {
    drawImgCentered('bonus_coin', x, y, h, () => {
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.arc(x, y, h * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, h * 0.24, 0, Math.PI * 2); ctx.stroke();
    });
  }

  //  결과: 성공/실패·생존·최고·시간·처치·놓친 것 한 줄·저장 실패 안내(버튼은 drawButtons)
  //  정수 세 자리 쉼표(보유 코인 999,999 까지)
  function fmtInt(n) { return String(Math.max(0, Math.trunc(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  //  어절(공백) 경계에서만 끊는 줄바꿈 — 단어 중간에서 줄이 갈라지지 않게 한다
  function splitWrap(text, maxW) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function wrapLines(text, maxW, font) {
    const prev = ctx.font;
    if (font) ctx.font = font;
    const n = splitWrap(text, maxW).length;
    ctx.font = prev;
    return n;
  }
  function wrapText(text, cx, y, maxW, lh) {
    const lines = splitWrap(text, maxW);
    lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
    return lines.length;
  }

  function drawResult(view) {
    const r = view.result;
    ctx.fillStyle = 'rgba(5,8,14,0.8)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    //  r4.3(기획 v4.1 3-9) 맨 위: '작전 성공/실패/중단' + '획득 코인 +N'(정산 뒤 값) + 작은 글씨 내역(적 · 보스 · 첫 클리어/재클리어 · 보너스) + 보유 코인.
    //   종전 제목 y150·스테이지 y184 를 위로 올려(92·120) 코인 세 줄(156·178·196)을 넣었다 — 아래 추가 줄(212~)·통계(246~)·버튼(480~) 자리는 그대로
    ctx.font = '900 38px ' + FONT;
    ctx.fillStyle = r.won ? C.gold : r.aborted ? C.bulletHeavy : C.gateNeg;
    ctx.fillText(r.won ? '작전 성공!' : r.aborted ? '작전 중단' : '작전 실패', W / 2, 92);
    ctx.font = '700 15px ' + FONT;
    ctx.fillStyle = 'rgba(243,241,232,0.75)';
    //  r4.2: 제목 옆 난이도 표기('  ·  어려움'/'  ·  지옥', 색 따로)를 지웠다 — 제목 한 줄만
    ctx.fillText('STAGE ' + r.stageId + '  ' + r.title, W / 2, 120);
    if (r.coins) {
      if (r.coins.dev) {
        ctx.font = '600 14px ' + FONT;
        ctx.fillStyle = 'rgba(243,241,232,0.6)';
        ctx.fillText(r.coinLine ?? '개발용 판 — 코인 없음', W / 2, 160);
      } else {
        //  r4.5: 코인이 저장소에 남지 않는 탭(읽기 전용 탭·코인 저장 실패)은 획득·보유 코인 두 줄에 '저장 안 됨'을 붙이고 흐리게 —
        //   종전엔 저장되지 않는 금액이 보통 판과 똑같이 보였다(맨 아래 경고 한 줄만). 보통 판의 글자는 한 글자도 바뀌지 않는다
        const unsaved = r.readOnly === true || r.coinSaveOk === false;
        const tail = unsaved ? ' · ' + UNSAVED_TAG : '';
        if (unsaved) ctx.globalAlpha = 0.55;
        ctx.font = '900 24px ' + FONT;
        ctx.fillStyle = C.gold;
        ctx.fillText('획득 코인 +' + fmtInt(r.coins.gained) + tail, W / 2, 156, W - 40);
        if (r.coinLine) {
          ctx.font = '600 13px ' + FONT;
          ctx.fillStyle = 'rgba(243,241,232,0.8)';
          ctx.fillText(r.coinLine, W / 2, 178, W - 40);
        }
        ctx.font = '600 13px ' + FONT;
        ctx.fillStyle = 'rgba(246,200,74,0.85)';
        ctx.fillText('보유 코인 ' + fmtInt(r.coins.balance) + tail, W / 2, 196);
        ctx.globalAlpha = 1;
      }
    }
    //  제목 아래 추가 줄(y 212 부터 18px 씩 쌓는다 — 통계 첫 줄 246 과 겹치지 않는 최소 간격): 랜덤 길 → 작전 목표 순
    let extraY = 212;
    //  랜덤 길 한 줄(계약서 3-9): 고른 판은 결과, 안 고른 판은 이번 판에 무엇이었는지 공개
    if (r.lottery) {
      ctx.font = '700 14px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText(r.lottery, W / 2, extraY);
      extraY += 18;
    }
    //  작전 목표 한 줄(r3.14 구출 캡슐): 승리 여부와 별개 — 성공은 청록, 실패는 주황
    if (r.objectiveLine) {
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = r.objective && r.objective.done ? C.chainPad : C.bulletHeavy;
      ctx.fillText(r.objectiveLine, W / 2, extraY);
      extraY += 18;
    }
    //  보너스전 한 줄(r3.15): '보너스 N점 · 단계 K(· 신기록)' 금색 — 추가 줄 순서 랜덤 길 → 목표 → 보너스(y 212 부터 18px 스택)
    if (r.bonusLine) {
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText(r.bonusLine, W / 2, extraY);
      extraY += 18;
    }
    //  r4.3: 24번(마지막 판) 승리 = [다음 작전] 대신 '모든 작전 완료' 안내 문구(셸 main.ALL_CLEAR_LINE — 24번에는 랜덤 길·목표·보너스 줄이 없어 늘 y212)
    if (r.allClear) {
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText(String(r.allClear), W / 2, extraY);
      extraY += 18;
    }
    const lines = [
      ['생존 병력', r.survivors + '명'],
      ['최고 병력', r.peak + '명'],
      ['시간', r.timeText],
      ['처치', r.kills],
    ];
    let y = 246;
    for (const [k, v] of lines) {
      ctx.textAlign = 'right';
      ctx.font = '600 19px ' + FONT;
      ctx.fillStyle = 'rgba(243,241,232,0.8)';
      ctx.fillText(k, W / 2 - 16, y);
      ctx.textAlign = 'left';
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillStyle = C.hero;
      ctx.fillText(String(v), W / 2 + 16, y);
      y += 40;
    }
    ctx.textAlign = 'center';
    //  r4.3(3-9) 원인 → 다음 행동 순: 패배·포기는 원인 한 줄(인원 손실 + 놓친 통, 주황 작게)을 먼저, 그 아래 제안(advice) 한 줄.
    //   원인 줄이 있는 결과(셸 r4.3 이후)는 종전의 '놓친 것' 요약을 따로 그리지 않는다(원인 줄이 같은 내용을 더 정확히 담는다)
    if (!r.won && r.causeLine) {
      ctx.font = '600 14px ' + FONT;
      ctx.fillStyle = 'rgba(255,154,74,0.9)';
      const n = wrapText(r.causeLine, W / 2, y - 2, W - 56, 18);
      if (r.advice) {
        ctx.font = 'bold 16px ' + FONT;
        ctx.fillStyle = C.gatePos;
        wrapText(r.advice, W / 2, y - 2 + 18 * n + 8, W - 56, 20);
      }
    } else if (r.advice) {
    //  제안 한 줄(advice)이 있으면 그것을 크게, 놓친 것 요약은 그 아래 작게(계약서 6장 · 개정 r3 §6-2)
      ctx.font = 'bold 17px ' + FONT;
      ctx.fillStyle = C.gatePos;
      wrapText(r.advice, W / 2, y + 4, W - 56, 22);
      if (!r.won && r.missedLine) {
        ctx.font = '600 13px ' + FONT;
        ctx.fillStyle = 'rgba(255,154,74,0.8)';
        ctx.fillText(r.missedLine, W / 2, y + 4 + 22 * wrapLines(r.advice, W - 56, 'bold 17px ' + FONT) + 6);
      }
    } else if (!r.won && r.missedLine) {                // 놓친 것 안내는 실패 판에만
      ctx.font = '600 15px ' + FONT;
      ctx.fillStyle = C.bulletHeavy;
      ctx.fillText(r.missedLine, W / 2, y + 6);
    }
    if (r.isBest) {
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = C.gold;
      ctx.fillText('신기록!', W / 2, y + 68);
    }
    //  [다시 도전] 바로 아래 작은 부연(2026-09-17 이사 결정 ①): 랜덤 길이 있는 스테이지는 **재도전마다 길을 새로 뽑는다**.
    //  ⚠️결과 한 줄(r.lottery)이 있는 판 = 그 스테이지에 랜덤 길이 있는 판이다. 버튼 자리는 셸(main.js)이 잡고,
    //   셸은 이 한 줄이 들어갈 만큼 아래 버튼을 내려 둔다(겹치면 글이 버튼에 깔린다).
    if (r.lottery) {
      const retry = (view.buttons ?? []).find((b) => b.id === 'retry');
      if (retry) {
        ctx.textAlign = 'center';
        ctx.font = '600 13px ' + FONT;
        ctx.fillStyle = 'rgba(246,200,74,0.85)';
        ctx.fillText(RETRY_LOTTERY_NOTE, retry.x + retry.w / 2, retry.y + retry.h + 16);
      }
    }
    //  r4.5 첫 구매 안내(기획 v4.1 3-4 (나)·3-9): 처음으로 살 수 있게 된 **승리** 결과 화면에서만 한 번 — 보조 버튼 [로봇 강화] 바로 아래 금색 한 줄.
    //   버튼은 강조하지 않는다(보조 버튼 그대로). 문구는 셸이 넘긴다(result.upHint)
    if (r.upHint) {
      const ub = (view.buttons ?? []).find((b) => b.id === 'upgrade');
      if (ub) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px ' + FONT;
        ctx.fillStyle = C.gold;
        ctx.fillText(String(r.upHint), ub.x + ub.w / 2, ub.y + ub.h + 18, W - 40);
      }
    }
    drawSaveWarn({ saveOk: r.saveOk, coinSaveOk: r.coinSaveOk, readOnly: r.readOnly });
  }

  //  ── r4.5 강화 화면(원본 v4 3-5 '강화 화면', 기획 v4.1 3-4 (가)(나)) ──────────────────────────────────────────────
  //  view.upgrade = { head: [줄, 줄], coins, coinSaveOk, blocked: 이유 | null, rows: [{ track, name, level, max, lines: [효과, 보조, 설명], rec }], flash: { i, k } | null }
  //  버튼([구매]×3 · [돌아가기])은 셸이 UPGRADE_UI 에서 만든 상자 그대로 drawButtons 가 그린다. 여기서는 바탕·머리·카드·글만
  function drawUpgrade(view) {
    const U = UPGRADE_UI, u = view.upgrade || {};
    drawBackground(view.now * 30, 0);
    ctx.fillStyle = 'rgba(5,8,14,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = '900 34px ' + FONT;
    ctx.fillStyle = C.gold;
    ctx.fillText('로봇 강화', W / 2, U.titleY);
    ctx.font = '600 14px ' + FONT;
    ctx.fillStyle = 'rgba(243,241,232,0.85)';
    (u.head || []).forEach((t, i) => ctx.fillText(t, W / 2, U.headY[i] ?? U.headY[0] + i * 20, W - 40));
    //  보유 코인: 코인 그림 + 금색 글(가운데 정렬 — 그림은 글 왼쪽)
    if (Number.isFinite(u.coins)) {
      const t = '보유 코인 ' + fmtInt(u.coins);
      ctx.font = '900 22px ' + FONT;
      const tw = ctx.measureText(t).width;
      if (u.coinSaveOk === false) ctx.globalAlpha = 0.55;
      drawCoinIcon(W / 2 - tw / 2 - 18, U.coinY - 8, 26);
      ctx.fillStyle = C.gold;
      ctx.fillText(t, W / 2 + 4, U.coinY);
      ctx.globalAlpha = 1;
    }
    //  구매 막힘 이유(읽기 전용 탭·코인 저장 실패) — 한 줄, 붉은 글
    if (u.blocked) {
      ctx.font = '600 13px ' + FONT;
      ctx.fillStyle = C.gateNeg;
      ctx.fillText(u.blocked, W / 2, U.blockY, W - 40);
    }
    const rows = u.rows || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], c = upgradeCard(i);
      //  카드 바탕 + 테(추천 줄은 금색 테, 방금 산 줄은 잠깐 밝은 금색)
      ctx.fillStyle = 'rgba(20,35,58,0.9)';
      roundRect(c.x, c.y, c.w, c.h, 16); ctx.fill();
      ctx.strokeStyle = row.rec ? 'rgba(246,200,74,0.9)' : 'rgba(243,241,232,0.22)';
      ctx.lineWidth = row.rec ? 2 : 1.5;
      roundRect(c.x, c.y, c.w, c.h, 16); ctx.stroke();
      if (u.flash && u.flash.i === i && u.flash.k > 0) {
        ctx.globalAlpha = Math.min(1, u.flash.k);
        ctx.strokeStyle = '#FFE070'; ctx.lineWidth = 4;
        roundRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2, 15); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      //  이름 + 단계 막대(■ = 산 단계, □ = 남은 단계) + 'k/최대'
      const x0 = U.textX;
      ctx.textAlign = 'left';
      ctx.font = '900 20px ' + FONT;
      ctx.fillStyle = C.hero;
      ctx.fillText(row.name, x0, c.y + 32);
      let bx = x0 + ctx.measureText(row.name).width + 12;
      for (let k = 0; k < row.max; k++) {
        if (k < row.level) { ctx.fillStyle = C.gold; ctx.fillRect(bx, c.y + 19, 12, 12); }
        else { ctx.strokeStyle = 'rgba(243,241,232,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(bx + 0.75, c.y + 19.75, 10.5, 10.5); }
        bx += 16;
      }
      ctx.font = '600 13px ' + FONT;
      ctx.fillStyle = 'rgba(243,241,232,0.7)';
      ctx.fillText(row.level + '/' + row.max + '단계', bx + 4, c.y + 30);
      //  '추천'(첫 구매 주 가설 = 다연발, 한 번만): 카드 오른쪽 위 금색 꼬리표
      if (row.rec) {
        const tw = 52, tx = c.x + c.w - 14 - tw, ty = c.y + 14;
        ctx.fillStyle = C.gold;
        roundRect(tx, ty, tw, 24, 12); ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 14px ' + FONT;
        ctx.fillStyle = C.outline;
        ctx.fillText(row.recText || '추천', tx + tw / 2, ty + 12);
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      }
      //  효과 세 줄(지금 → 다음 · 보조 · 짧은 설명). 줄은 셸이 어절 단위로 끊어 넘긴다 — 여기서는 줄을 나누지 않는다(maxWidth 는 안전망)
      const [l1, l2, l3] = row.lines || [];
      if (l1) { ctx.font = 'bold 16px ' + FONT; ctx.fillStyle = C.hero; ctx.fillText(l1, x0, c.y + 64, U.textMaxW); }
      if (l2) { ctx.font = '600 14px ' + FONT; ctx.fillStyle = 'rgba(246,200,74,0.95)'; ctx.fillText(l2, x0, c.y + 90, U.textMaxW); }
      if (l3) { ctx.font = '13px ' + FONT; ctx.fillStyle = 'rgba(243,241,232,0.62)'; ctx.fillText(l3, x0, c.y + 114, U.textMaxW); }
    }
    ctx.textAlign = 'center';
    drawSaveWarn({ saveOk: view.saveOk, coinSaveOk: view.coinSaveOk, readOnly: view.readOnly });
  }

  function drawScene(view) {
    const run = view.run, fx = view.fx, now = view.now;
    const mask = lotteryMask(run, fx);
    //  가려진 동안에는 실제 물체를 아예 그리지 않는다('?' 상자가 그 자리를 대신한다)
    const hidden = (id) => mask >= 1 && id != null && run.lottery && (run.lottery.supplyId === id || run.lottery.rowId === id);
    //  아레나(r3.17): 광장 단계면 배경에 { w, depth, k } — k = 열림 정도(셸 fx.arenaOpen 이 줄어들며 0 → 1, fx 에 칸이 없으면 1)
    const arena = run.phase === 'arena' && run.arena
      ? { w: run.arena.w, depth: run.arena.depth, k: 1 - Math.max(0, Math.min(1, (fx.arenaOpen ?? 0) / (FX.arenaOpenSec || 0.6))) }
      : null;
    //  원근(r3.20): 세계 그리기(배경~연출)는 전부 P(draw 가 view.flat 으로 골라 둔 투영기)를 지난다. 캔버스 변환(translate/scale)은 쓰지 않는다 —
    //   HUD·배너·버튼은 종전대로 마지막에 화면 좌표로. 그리기 순서(가림)는 r3.19 와 같다
    drawBackground(run.z, Math.max(0, (run.bg || 1) - 1), arena);
    //  r4.10 결승선(대물결 판)은 도로 바닥 — 벽·게이트·적보다 먼저(아래에) 그린다
    drawFinishLine(run);
    drawWalls(run);
    drawCovers(run);
    for (const row of run.gateRows) if (!hidden(row.id)) drawGateRow(row, fx, run.z);
    for (const s of run.supplies) if (!hidden(s.id)) drawSupply(s, run.z);
    drawLotteryBox(run, mask);
    drawBonusTargets(run);
    drawCorpses(fx, run.z);
    for (const e of run.enemies) if (!e.dead) drawEnemy(e, run, fx);
    //  보스(r3.16 복수 정예): 살아 있는 것만, 먼 것(z 큰 것)을 먼저 그려 가까운 것이 위에 오게. 죽은 보스는 배열에 남아 있으므로 반드시 거른다
    const shockR = run.arena && run.arena.boss && run.arena.boss.shock ? run.arena.boss.shock.r : null;
    //  r4.9 (가) 탄 공격 장전 중인 보스(규칙 run.bossAtk.cur.state 'charge' — 읽기만): 진행 0 → 1
    const ac = run.bossAtk && run.bossAtk.cur && run.bossAtk.cur.state === 'charge' ? run.bossAtk.cur : null;
    const chargeOf = (b) => (ac && ac.boss === b.id ? Math.max(0, Math.min(1, 1 - ac.t / (ac.charge || 0.3))) : null);
    //  r4.10 중간 보스는 돌진 경보(붉은 줄)를 몸 아래에 먼저, 몸은 일반 적 그림을 키워서(drawMidBoss)
    drawMidCharge(run, now);
    for (const b of (run.bosses ?? []).filter((b) => !b.dead).sort((a, b) => b.z - a.z)) { if (b.mid) drawMidBoss(b, run, fx); else drawBoss(b, run.z, now, shockR, fx, chargeOf(b), run.time); }
    //  r4.8 보스 공격 예고(r4.9 — 광역의 붉은 경보 구역만) — 보스 위, 탄·부대 아래
    drawBossAtk(run, now);
    drawBullets(run);
    drawEshots(run);
    drawSquad(run, fx, now);
    //  r4.9 거미줄 그물에 걸린 부대(느려진 동안)
    drawSlowWeb(run);
    drawBeams(fx.beams ?? []);
    drawRecruits(fx.recruits);
    drawShocks(fx.shocks ?? []);
    drawAtkBlasts(fx.atkBlasts ?? [], run.z);
    drawParts(fx.parts);
    drawFloaters(fx.floaters);
    drawPops(fx.pops);
    if (fx.hurtT > 0) {
      const a = Math.min(0.45, fx.hurtT / FX.hurtFlashDur * 0.45);
      const gr = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 470);
      gr.addColorStop(0, 'rgba(255,40,40,0)');
      gr.addColorStop(1, 'rgba(255,40,40,' + a + ')');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
    drawHud(view);
    //  r4.5 보정: 결과 화면 밑으로는 안내·경고 배너를 그리지 않는다 — 출격 직후 [작전 중단]이면 첫 플레이 안내(y 268)가
    //   반투명 결과 오버레이 너머로 '최고 병력' 줄과 겹쳐 비쳤다(2026-09-25 캡처 06·09)
    if (view.state !== 'result') drawBanners(fx);
  }

  function draw(view) {
    const fx = view.fx;
    //  이번 프레임의 투영기: ?flat=1(개발 대조) > 기본 '가까이'(r4.1 — 표준·토글 삭제). 타이틀 배경도 같은 투영으로 그린다
    P = projectorFor(projectorMode({ flat: !!view.flat }));
    const shaking = view.state === 'run' && fx && fx.shakeT > 0;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (shaking) {
      const a = FX.shakeAmp * (fx.shakeT / FX.shakeDur);
      ctx.translate(Math.sin(view.now * 71) * a, Math.cos(view.now * 89) * a * 0.7);
    }
    if (view.state === 'title') {
      drawTitle(view);
    } else if (view.state === 'upgrade') {
      //  r4.5 강화 화면: 결과 화면에서 들어와도(셸에 run 이 남아 있어도) 판 장면을 그리지 않고 강화 화면만 — view.run 검사보다 먼저
      drawUpgrade(view);
    } else if (view.run) {
      drawScene(view);
      if (view.state === 'paused') {
        ctx.fillStyle = 'rgba(5,8,14,0.62)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px ' + FONT;
        ctx.fillStyle = C.hero;
        ctx.fillText('일시 정지', W / 2, 300);
        ctx.font = '14px ' + FONT;
        ctx.fillStyle = 'rgba(243,241,232,0.7)';
        ctx.fillText('ESC 키로도 다시 시작할 수 있다', W / 2, 336);
      } else if (view.state === 'result') {
        drawResult(view);
      }
    }
    drawButtons(view.buttons ?? []);
    ctx.restore();
  }

  return { draw };
}
