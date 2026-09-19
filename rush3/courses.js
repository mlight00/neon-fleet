// rush3/courses.js — 4~24 스테이지 정의(묶음 B-2·B-3, 2026-09-19 1차 배치). 순수 데이터 + 작은 조립 헬퍼, 난수 없음.
//  1~3 은 stages.DEFS 그대로(코스 버전 2, 기록 보존). 여기 21개는 실게임 구현계획 B-2 설계표·B-3 역할표·C-1~C-3 자산표를 따른다.
//  ⚠️1차 배치의 한계(계획서에 적어 둔 그대로): 복수 정예(9·23)·아레나(10·11·24)는
//   장치가 아직 없어 **기존 장치로 그 자리의 '배우는 것'을 근사**한다. 13~22 의 새 역할(장갑체·복병·생성기·방해형·카트)은
//   기존 행동(잡졸·돌격체·저격수)에 **체력·그림(skin)만 바꿔** 근사한다 — 행동 자체는 다음 회차.
//  공통 규칙: 길이 30~60초(z = 초 × 190) · 게이트 행은 도로 80~400 완전 피복 · 배제 쌍은 coverZ = coverZFor(벽 z0, 통 z) · 초반엔 명확한 성공 경로.
const ROAD = { x0: 80, x1: 400 };
const T3 = [80, 80 + 320 / 3, 80 + 640 / 3, 400];

//  2칸 행 [좌, 우] · 3칸 행 [좌, 중, 우]. maxValue 는 행 상한(칸별 상한은 배열 4번째 값)
const g2 = (z, l, r, o = {}) => ({ z, maxValue: o.max ?? 15, bypass: !!o.bypass, ...(o.armZ !== undefined ? { armZ: o.armZ } : {}),
  cells: [[ROAD.x0, 240, l, o.lMax], [240, ROAD.x1, r, o.rMax]], ...(o.hint ? { hint: o.hint } : {}) });
const g3 = (z, a, b, c, o = {}) => ({ z, maxValue: o.max ?? 15, bypass: !!o.bypass, ...(o.armZ !== undefined ? { armZ: o.armZ } : {}),
  cells: [[T3[0], T3[1], a], [T3[1], T3[2], b], [T3[2], T3[3], c]], ...(o.hint ? { hint: o.hint } : {}) });
const soldier = (z, x, n, durability, o = {}) => ({ z, x, kind: 'soldier', n, durability, ...o });
const weapon = (z, x, w, durability, o = {}) => ({ z, x, kind: 'weapon', weapon: w, durability, ...o });
const chain = (z, x, pads0, maxPads, durability, o = {}) => ({ z, x, kind: 'chain', pads0, maxPads, durability, ...o });
//  구출 캡슐(r3.14): soldier 와 같은 인자 순서. 스테이지 정의에 objective: { kind: 'capsule', supplyId } 를 함께 둔다(supplyId = 'c' + (순번 + 1)).
//   n = 구출 시 합류 병사 수 — 사람 체감 조정은 여기 인자 한 곳(봇은 이 통을 열지 않아 영향 0)
const capsule = (z, x, n, durability, o = {}) => ({ z, x, kind: 'capsule', n, durability, ...o });
//  차량 통(r3.13): 통 정의의 마지막 인자 o 에 펼친다 — soldier(2000, 120, 3, 6, { ...mv(120, 360, 4), hint }). x0 < x1(px)·period = 왕복 1회 초.
//   통의 x 는 x0 또는 x1 이어야 한다(양 끝에서 출발). 속도 2·(x1−x0)/period 가 STEP 당 반지름(30px) 이하(C-4·VEH-10 이 잠근다)
const mv = (x0, x1, period) => ({ move: { x0, x1, period } });
//  보너스전(r3.15): 스테이지 정의에 bonus: bonus(sec, [target(...), ...]) 를 둔다 — 본전투 승리가 확정된 뒤 sec 초 동안 표적을 맞혀 점수를 쌓는다.
//   target(dz, x0, x1, period, hp, value, o) — dz = 부대 앞 고정 거리(px, 탄 정리선 650 미만이어야 닿는다), x0~x1 = 옆으로 왕복(px, 반지름 22 포함 도로 안),
//   period = 왕복 1회 초, hp = 내구(직격만), value = 파괴 점수, o.phase = 0~1 위상, o.respawn = 재등장까지 초(생략 = BAL3.bonus.respawn).
//   ⚠️사거리 무기(산탄포 range 420)는 전진 중이라 닿는 거리가 range × (vz − scroll) / vz − 대형 깊이 ≈ 200 px 뿐이다 — 그 무기가 나오는 스테이지는 dz 를 그 안에 둔다
//   보너스 스테이지 불변식: 게이트·통·스폰 z 가 전부 eliteZ(없으면 length) 이하(보너스 구간엔 피해원·보상이 없다 — buildStage 가 빌드 시점에 throw 로 잠근다, V3-BONUS B-1)
const bonus = (sec, targets, o = {}) => ({ sec, targets, ...o });
const target = (dz, x0, x1, period, hp, value, o = {}) => ({ dz, x0, x1, period, hp, value, phase: o.phase ?? 0, ...(o.respawn != null ? { respawn: o.respawn } : {}) });
const wall = (z0, z1, L, R) => ({ z0, z1, signs: { L, R } });
const cover = (x0, x1, z0) => ({ kind: 'cover', x0, x1, z0, z1: z0 + 40 });
const wave = (z, kind, xs, o = {}) => ({ z, kind, n: xs.length, xs, corridorHw: null, ...o });
const mass = (z, kind, n, rows = 2, o = {}) => ({ z, kind, n, rows, corridorHw: null, ...o });
//  역할 근사(B-3): 그림만 바꾸고 체력을 올린다. hp 는 스폰 고정값(난이도 배수 무관 — 계약서 3-8 '명시 hp 는 그대로')
const ARMOR = { skin: 'E3_wallguard', hp: 10 };      // 장갑체 = 오래 쏴야 하는 잡졸
const JUMPER = { skin: 'E8_manholejumper' };         // 복병 = 돌격체 그림
const POD = { skin: 'E9_spawnpod', hp: 14 };         // 생성기 = 고정 저격수(소환은 다음 회차)
const MAGNET = { skin: 'E10_magnethead', hp: 9 };    // 방해형 = 저격수 그림
const CART = { skin: 'E7_cartyard', hp: 20 };        // 굼뜬 장갑 = 느린 잡졸(파편은 다음 회차)
const HOUND = { skin: 'E2_ramhound' };               // 돌격체 정위치 그림(4번부터)

//  배제 쌍(분리벽 안 좌/우 통): coverZ 를 벽 z0 기준 공식으로 채운다
function pair(coverZFor, wallZ0, z, left, right, id) {
  const cz = coverZFor(wallZ0, z);
  return [{ ...left, z, pairId: id, coverZ: cz }, { ...right, z, pairId: id, coverZ: cz }];
}

export function makeCourses({ coverZFor }) {
  const C = {};
  //  4 세 갈래 — 한 행에 세 칸(BG1). 시제품 proto3 를 정식 길이로
  C[4] = { version: 1, title: '세 갈래', bg: 1, startUnits: 4, startWeapon: 'rifle', length: 8000, eliteZ: 7600,
    gates: [g3(1500, -4, 3, -6, { hint: '세 칸: 가운데가 늘 정답은 아닙니다' }), g3(4200, 2, -8, 5), g3(6200, -3, -10, 4, { max: 20 })],
    supplies: [soldier(2500, 150, 4, 8), weapon(3300, 330, 'auto', 12), soldier(5200, 240, 5, 14)],
    walls: [],
    spawns: [wave(2000, 'grunt', [120, 200, 280, 360]), wave(3600, 'rusher', [160, 320], HOUND), mass(5000, 'grunt', 10, 2), wave(6800, 'shooter', [150, 330])],
    elite: { z: 7600, hp: 160, summon: false } };
  //  5 가림막 — 가려진 것은 쏠 수 없다(BG2)
  C[5] = { version: 1, title: '가림막', bg: 2, startUnits: 4, startWeapon: 'rifle', length: 8400, eliteZ: 8000,
    gates: [g3(1600, -4, 4, -5, { hint: '가운데 앞 둔덕이 탄을 막습니다. 비스듬히 쏘거나 지나서 쏘세요' }), g3(4000, 3, -9, 2), g2(6400, -12, 6, { max: 20 })],
    supplies: [soldier(2600, 120, 4, 8), soldier(2600, 360, 3, 6), weapon(4900, 240, 'auto', 12)],
    walls: [cover(190, 290, 1220), cover(80, 186, 3620), cover(240, 400, 6020)],
    spawns: [wave(2100, 'grunt', [140, 240, 340]), wave(3300, 'shooter', [200, 280]), mass(5300, 'grunt', 12, 2), wave(6900, 'rusher', [120, 360], HOUND)],
    elite: { z: 8000, hp: 200, summon: false } };
  //  6 달리는 보급(r3.13 차량 3대 — 왕복하는 통은 '지금 자리'가 아니라 '갈 자리'에 서야 열린다. version 2, 정지 통 시절 기록은 1 칸에 보존)(BG4)
  const VH = '움직이는 통은 지금 자리가 아니라 갈 자리에 미리 서야 열립니다';
  C[6] = { version: 2, title: '차선 바꾸기', bg: 4, startUnits: 5, startWeapon: 'rifle', length: 8800, eliteZ: 8400,
    gates: [g2(1400, 2, -6), g2(4600, -8, 3, { max: 20 }), g3(7000, 4, -12, 3, { max: 24 })],
    supplies: [soldier(2000, 120, 3, 6, { ...mv(120, 360, 4), hint: VH }), soldier(2700, 360, 3, 6, { ...mv(120, 360, 4), hint: '오른쪽에서 출발한 통은 왼쪽으로 먼저 갑니다. 탄이 날아가는 동안 통이 어디까지 가는지 보세요' }),
               weapon(3400, 120, 'scatter', 10), soldier(4000, 330, 4, 8, { ...mv(150, 330, 3), hint: '빠른 통은 앞을 더 많이 봐야 합니다. 통이 되돌아오는 끝점에서 기다리면 쉽습니다' }), soldier(5800, 240, 6, 16)],
    walls: [],
    spawns: [wave(2400, 'rusher', [240], HOUND), wave(3100, 'grunt', [100, 180, 300, 380]), wave(5200, 'shooter', [130, 350]), mass(6300, 'grunt', 12, 2), wave(7600, 'rusher', [140, 240, 340], HOUND)],
    elite: { z: 8400, hp: 240, summon: false } };
  //  7 구출 캡슐(r3.14 실제 장치 — 갓길 끝의 캡슐이 판 목표. 놓쳐도 실패는 아니고 보상만 없다. version 2, 근사 통 시절 기록은 1 칸에 보존)(BG3)
  //   캡슐은 놓치기 쉬운 자리(x120 갓길 끝) 그대로. 내구 20·차폐물·게이트·스폰·정예는 근사 시절과 같다
  C[7] = { version: 2, title: '갓길의 보상', bg: 3, startUnits: 5, startWeapon: 'rifle', length: 9000, eliteZ: 8600,
    gates: [g3(1500, -5, 3, -5), g2(3800, 5, -14, { max: 24 }), g3(6600, -6, 6, -6, { max: 20 })],
    supplies: [weapon(2400, 240, 'auto', 12), capsule(4800, 120, 3, 20, { hint: '갓길 끝의 캡슐은 왼쪽 끝까지 붙어야 열립니다. 놓쳐도 실패는 아닙니다' }), soldier(5600, 360, 3, 6)],
    objective: { kind: 'capsule', supplyId: 'c2' },
    walls: [cover(150, 330, 4420)],
    spawns: [wave(2000, 'grunt', [120, 200, 280, 360]), wave(3200, 'rusher', [200, 280], HOUND), wave(4400, 'shooter', [240]), mass(5900, 'grunt', 14, 2), wave(7400, 'shooter', [120, 240, 360])],
    elite: { z: 8600, hp: 280, summon: false } };
  //  8 남은 군단(r3.15 보너스전 실제 장치 — 짧은 본전투 + 소환형 정예를 깨면 승리가 **그 자리에서 확정**되고, 살려 온 군단으로 20초 표적전.
  //   더 많은 병사·강한 무기를 살렸을수록 점수가 오른다. version 2, 근사 시절 기록은 1 칸에 보존)(BG1)
  //   본전투(길이 7800·정예 7400·게이트·통·스폰)는 근사 시절 그대로. 표적 4개(y400·y320·y240·y160, 위상 0/.75/.5/.25): 가까운 것은 느리고 값이 작고, 먼 것은 단단하고 값이 크다.
  //   내구 12/16/20/32·재등장 0.5/0.5/0.5/0.8 은 봇 실측(2026-09-19)으로 점수가 병력·무기에 비례하게 잡은 값(내구 6/10/16·재등장 1.5 는 30 처치에서 포화했다).
  //   넷째 표적(dz 320, 140~340)은 검수 반영 — 표적 3개일 때 기관총 50명 이상이면 셋이 동시에 죽어 '맞힐 게 없는' 프레임이 실제로 보였다(캡처 shot-4)
  C[8] = { version: 2, title: '남은 군단', bg: 1, startUnits: 3, startWeapon: 'rifle', length: 7800, eliteZ: 7400,
    gates: [g2(1300, 3, -5), g3(3600, 4, 6, -12, { max: 24 }), g2(5600, -10, -10, { max: 20, hint: '양쪽 다 음수: 쏴서 0 까지 올리거나 병력을 아끼세요' })],
    supplies: [soldier(2200, 150, 5, 10), soldier(2200, 330, 5, 10), weapon(4500, 240, 'auto', 12), soldier(6500, 240, 8, 20)],
    walls: [],
    spawns: [wave(1800, 'grunt', [140, 340]), mass(3000, 'grunt', 10, 2), wave(4200, 'rusher', [120, 240, 360], HOUND), mass(6200, 'grunt', 16, 2)],
    elite: { z: 7400, hp: 260, summon: true },
    bonus: bonus(20, [target(240, 120, 360, 4.0, 12, 2), target(320, 140, 340, 3.0, 16, 3, { phase: 0.75 }), target(400, 200, 280, 2.2, 20, 3, { phase: 0.5 }), target(480, 105, 375, 6.0, 32, 5, { phase: 0.25, respawn: 0.8 })]) };
  //  9 둘을 동시에(근사: 정예 B2 그림 + 소환 — 복수 정예는 다음 회차)(BG2)
  C[9] = { version: 1, title: '갠트리', bg: 2, startUnits: 5, startWeapon: 'rifle', length: 9400, eliteZ: 9000,
    gates: [g3(1600, -4, 3, -6), g2(4200, -14, 4, { max: 24 }), g3(7000, 5, -12, -3, { max: 24 })],
    supplies: [...pair(coverZFor, 2400, 2900, soldier(0, 120, 4, 8), weapon(0, 326, 'sniper', 14), 'w1'), soldier(5400, 240, 6, 16), chain(6200, 340, 6, 12, 8)],
    walls: [wall(2400, 3600, { kind: 'soldier', n: 4 }, { kind: 'weapon', weapon: 'sniper' })],
    spawns: [wave(4000, 'grunt', [95, 137, 179, 221], { corridorHw: 61 }), wave(4000, 'shooter', [300, 370]), mass(5800, 'grunt', 12, 2), wave(7600, 'rusher', [120, 240, 360], HOUND), wave(8200, 'shooter', [150, 330])],
    elite: { z: 9000, hp: 360, summon: true, skin: 'B2_gantrywidow' } };
  //  10 광장(근사: 넓은 직선 + 추격형 정예 B3 그림 — 아레나 전환은 다음 회차)(BG4)
  C[10] = { version: 1, title: '광장', bg: 4, startUnits: 6, startWeapon: 'rifle', length: 9600, eliteZ: 9200,
    gates: [g2(1400, 4, -8), g3(4400, -6, 5, -6, { max: 20 }), g2(7200, 6, -16, { max: 30 })],
    supplies: [weapon(2200, 240, 'auto', 12), soldier(3300, 120, 5, 10), soldier(3300, 360, 5, 10), weapon(5600, 240, 'heavy', 18), soldier(8000, 240, 8, 20)],
    walls: [],
    spawns: [mass(2600, 'grunt', 10, 2), wave(3900, 'rusher', [100, 200, 280, 380], HOUND), wave(5000, 'shooter', [160, 240, 320]), mass(6500, 'grunt', 16, 2), wave(8400, 'rusher', [140, 340], HOUND)],
    elite: { z: 9200, hp: 420, summon: false, skin: 'B3_railleviathan' } };
  //  11 사냥터(근사: 소환형 정예 B4 그림 + 밀도 — 장판은 다음 회차)(BG4)
  C[11] = { version: 1, title: '사냥터', bg: 4, startUnits: 6, startWeapon: 'rifle', length: 9800, eliteZ: 9400,
    gates: [g3(1500, -5, 4, -5), g3(4600, 3, -10, 6, { max: 24 }), g2(7400, -18, 8, { max: 30 })],
    supplies: [soldier(2300, 240, 5, 10), ...pair(coverZFor, 3000, 3500, soldier(0, 120, 5, 10), weapon(0, 326, 'arc', 14), 'w1'), soldier(6000, 150, 6, 16), weapon(6000, 330, 'auto', 12)],
    walls: [wall(3000, 4200, { kind: 'soldier', n: 5 }, { kind: 'weapon', weapon: 'arc' })],
    spawns: [wave(2000, 'grunt', [120, 200, 280, 360]), wave(5200, 'shooter', [130, 240, 350]), mass(6800, 'grunt', 16, 2), wave(8000, 'rusher', [110, 200, 280, 370], HOUND), mass(8600, 'grunt', 10, 2)],
    elite: { z: 9400, hp: 480, summon: true, skin: 'B4_smelter' } };
  //  12 관문 — 지금까지 배운 것을 한 판에(BG5): 3칸+차폐+분리벽+랜덤 길+정예
  //   r3.13: 정예 직전 병사 8 통(z7200)이 차량 — 벽 활성 구간(w1 3940~5200·w3 7740~8600)·차폐물 사선 밖. version 2
  C[12] = { version: 2, title: '관문', bg: 5, startUnits: 5, startWeapon: 'rifle', length: 10400, eliteZ: 10000,
    gates: [g3(1500, -4, 3, -6), g2(3300, 4, -10, { max: 20 }), g3(6200, -8, 6, -8, { max: 24 }), g2(8600, 8, -20, { max: 30 })],
    supplies: [weapon(2300, 240, 'auto', 12), ...pair(coverZFor, 4000, 4600, soldier(0, 120, 5, 12), weapon(0, 326, 'heavy', 18), 'w1'),
               soldier(7200, 150, 8, 20, { ...mv(150, 330, 3), hint: '정예 앞의 큰 통은 좌우로 달립니다. 통이 되돌아오는 자리에 미리 서세요' }),
               //  랜덤 길 왼쪽의 확정 통(S3 c9 와 같은 꼴: 짝 없는 차폐)
               soldier(8200, 150, 5, 10, { coverZ: coverZFor(7800, 8200) })],
    walls: [wall(4000, 5200, { kind: 'soldier', n: 5 }, { kind: 'weapon', weapon: 'heavy' }), cover(190, 290, 1220), cover(80, 186, 5820), wall(7800, 8600, { kind: 'soldier', n: 5 }, { kind: 'lottery' })],
    lottery: { wallIdx: 3, z: 8200, x: 330, cell: [252, 400] },
    spawns: [wave(2000, 'grunt', [120, 240, 360]), wave(3900, 'rusher', [200, 280], HOUND), wave(5300, 'grunt', [95, 137, 179, 221], { corridorHw: 61 }), wave(5300, 'shooter', [300, 370]), mass(6800, 'grunt', 14, 2), wave(9200, 'shooter', [120, 240, 360]), mass(9500, 'grunt', 10, 2)],
    elite: { z: 10000, hp: 560, summon: true } };
  //  13~14 장갑체(E3): 오래 쏴야 하는 적(BG4)
  C[13] = { version: 1, title: '장갑체', bg: 4, startUnits: 5, startWeapon: 'rifle', length: 8600, eliteZ: 8200,
    gates: [g2(1400, 3, -6), g3(4300, -6, 5, -6, { max: 20 }), g2(6800, -12, 6, { max: 24 })],
    supplies: [weapon(2200, 240, 'auto', 12), soldier(3400, 150, 5, 10), soldier(5400, 330, 6, 16)],
    walls: [],
    spawns: [wave(1900, 'grunt', [200, 280], ARMOR), wave(3000, 'grunt', [120, 240, 360]), wave(4900, 'grunt', [160, 320], ARMOR), mass(6000, 'grunt', 10, 2), wave(7400, 'grunt', [120, 240, 360], ARMOR)],
    elite: { z: 8200, hp: 400, summon: false } };
  C[14] = { version: 1, title: '철벽', bg: 4, startUnits: 5, startWeapon: 'rifle', length: 9200, eliteZ: 8800,
    gates: [g3(1500, -5, 3, -5), g2(4400, 5, -14, { max: 24 }), g3(7000, -8, 7, -8, { max: 24 })],
    supplies: [weapon(2300, 240, 'heavy', 18), soldier(3500, 120, 5, 10), soldier(3500, 360, 5, 10), soldier(5800, 240, 7, 18)],
    walls: [cover(190, 290, 1220)],
    spawns: [wave(2000, 'grunt', [140, 340], ARMOR), wave(3100, 'rusher', [200, 280], HOUND), wave(5000, 'grunt', [120, 240, 360], ARMOR), mass(6400, 'grunt', 12, 2), wave(7800, 'grunt', [100, 180, 300, 380], ARMOR)],
    elite: { z: 8800, hp: 460, summon: false } };
  //  15~16 복병(E8): 차선을 넘나드는 돌격체(BG4)
  C[15] = { version: 1, title: '복병', bg: 4, startUnits: 6, startWeapon: 'rifle', length: 8800, eliteZ: 8400,
    gates: [g2(1400, 2, -7), g3(4200, 4, -10, 4, { max: 20 }), g2(6800, -14, 8, { max: 24 })],
    supplies: [soldier(2200, 150, 5, 10), weapon(3300, 330, 'scatter', 10), soldier(5400, 240, 6, 16)],
    walls: [],
    spawns: [wave(1900, 'rusher', [120, 360], JUMPER), wave(3000, 'grunt', [140, 240, 340]), wave(4800, 'rusher', [100, 200, 280, 380], JUMPER), mass(6000, 'grunt', 10, 2), wave(7400, 'rusher', [160, 240, 320], JUMPER)],
    elite: { z: 8400, hp: 440, summon: false } };
  C[16] = { version: 1, title: '맨홀 거리', bg: 4, startUnits: 6, startWeapon: 'rifle', length: 9400, eliteZ: 9000,
    gates: [g3(1500, -4, 4, -6), g2(4500, -12, 5, { max: 24 }), g3(7200, 6, -14, 6, { max: 30 })],
    supplies: [weapon(2300, 240, 'auto', 12), ...pair(coverZFor, 3200, 3700, soldier(0, 120, 6, 14), weapon(0, 326, 'heavy', 18), 'w1'), soldier(6000, 240, 8, 20)],
    walls: [wall(3200, 4400, { kind: 'soldier', n: 6 }, { kind: 'weapon', weapon: 'heavy' })],
    spawns: [wave(2000, 'rusher', [140, 340], JUMPER), wave(5100, 'rusher', [95, 137, 179, 221], { corridorHw: 61, ...JUMPER }), wave(5100, 'shooter', [300, 370]), mass(6600, 'grunt', 14, 2), wave(8000, 'rusher', [120, 240, 360], JUMPER)],
    elite: { z: 9000, hp: 500, summon: true } };
  //  17~18 생성기(E9): 처리 우선순위(BG4)
  C[17] = { version: 1, title: '생성기', bg: 4, startUnits: 6, startWeapon: 'rifle', length: 9000, eliteZ: 8600,
    gates: [g2(1400, 3, -8), g3(4300, -6, 6, -6, { max: 24 }), g2(6900, 8, -18, { max: 30 })],
    supplies: [weapon(2200, 240, 'auto', 12), soldier(3400, 150, 6, 14), soldier(5500, 330, 7, 18)],
    walls: [],
    spawns: [wave(1900, 'shooter', [240], POD), wave(2600, 'grunt', [120, 200, 280, 360]), wave(4900, 'shooter', [150, 330], POD), mass(5800, 'grunt', 12, 2), wave(7500, 'shooter', [120, 240, 360], POD)],
    elite: { z: 8600, hp: 480, summon: true } };
  C[18] = { version: 1, title: '포드 밭', bg: 4, startUnits: 6, startWeapon: 'rifle', length: 9600, eliteZ: 9200,
    gates: [g3(1500, -5, 4, -5), g2(4400, -14, 6, { max: 24 }), g3(7200, 6, -16, 6, { max: 30 })],
    supplies: [soldier(2300, 120, 5, 10), soldier(2300, 360, 5, 10), weapon(3600, 240, 'arc', 14), soldier(6000, 240, 8, 20)],
    walls: [cover(80, 186, 4020), cover(293, 400, 4020)],
    spawns: [wave(2000, 'shooter', [160, 320], POD), wave(3100, 'grunt', [140, 240, 340]), wave(5000, 'shooter', [120, 240, 360], POD), mass(6600, 'grunt', 16, 2), wave(8000, 'rusher', [100, 200, 280, 380], HOUND)],
    elite: { z: 9200, hp: 540, summon: true } };
  //  19~20 방해형(E10)(BG5)
  C[19] = { version: 1, title: '자석 머리', bg: 5, startUnits: 6, startWeapon: 'rifle', length: 9200, eliteZ: 8800,
    gates: [g2(1400, 4, -8), g3(4300, 5, -12, 5, { max: 24 }), g2(7000, -16, 8, { max: 30 })],
    supplies: [weapon(2200, 240, 'auto', 12), soldier(3400, 150, 6, 14), weapon(5400, 330, 'heavy', 18), soldier(6200, 120, 6, 16)],
    walls: [],
    spawns: [wave(1900, 'shooter', [240], MAGNET), wave(2700, 'grunt', [120, 200, 280, 360]), wave(4900, 'shooter', [150, 330], MAGNET), mass(6000, 'grunt', 14, 2), wave(7700, 'shooter', [120, 240, 360], MAGNET)],
    elite: { z: 8800, hp: 520, summon: false } };
  C[20] = { version: 1, title: '간섭 지대', bg: 5, startUnits: 6, startWeapon: 'rifle', length: 9800, eliteZ: 9400,
    gates: [g3(1500, -5, 5, -5), g2(4500, -14, 7, { max: 30 }), g3(7300, 8, -18, 8, { max: 30 })],
    supplies: [...pair(coverZFor, 2200, 2700, soldier(0, 120, 6, 14), weapon(0, 326, 'sniper', 14), 'w1'), soldier(5600, 240, 8, 20), weapon(6400, 240, 'auto', 12)],
    walls: [wall(2200, 3400, { kind: 'soldier', n: 6 }, { kind: 'weapon', weapon: 'sniper' })],
    spawns: [wave(4100, 'shooter', [95, 137, 179, 221], { corridorHw: 61, ...MAGNET }), wave(4100, 'grunt', [300, 370]), mass(5200, 'grunt', 12, 2), wave(6900, 'shooter', [160, 320], MAGNET), mass(8200, 'grunt', 16, 2)],
    elite: { z: 9400, hp: 600, summon: true } };
  //  21~22 카트야드(E7): 굼뜬 장갑 목표(BG5)
  C[21] = { version: 1, title: '카트야드', bg: 5, startUnits: 6, startWeapon: 'rifle', length: 9400, eliteZ: 9000,
    gates: [g2(1400, 3, -9), g3(4400, -8, 6, -8, { max: 24 }), g2(7100, 8, -20, { max: 30 })],
    supplies: [weapon(2200, 240, 'heavy', 18), soldier(3500, 150, 6, 14), soldier(3500, 330, 6, 14), soldier(5800, 240, 8, 20)],
    walls: [cover(190, 290, 4020)],
    spawns: [wave(1900, 'grunt', [240], CART), wave(2800, 'grunt', [120, 200, 280, 360]), wave(5000, 'grunt', [160, 320], CART), mass(6200, 'grunt', 14, 2), wave(7800, 'grunt', [120, 240, 360], CART)],
    elite: { z: 9000, hp: 560, summon: false } };
  C[22] = { version: 1, title: '고철 행렬', bg: 5, startUnits: 7, startWeapon: 'rifle', length: 10000, eliteZ: 9600,
    gates: [g3(1500, -6, 5, -6), g2(4600, -16, 8, { max: 30 }), g3(7500, 8, -20, 8, { max: 36 })],
    supplies: [weapon(2300, 240, 'auto', 12), ...pair(coverZFor, 3200, 3700, soldier(0, 120, 7, 16), weapon(0, 326, 'arc', 14), 'w1'), soldier(6200, 240, 9, 22), chain(8200, 340, 6, 12, 8)],
    walls: [wall(3200, 4400, { kind: 'soldier', n: 7 }, { kind: 'weapon', weapon: 'arc' })],
    spawns: [wave(2000, 'grunt', [140, 340], CART), wave(5100, 'grunt', [95, 137, 179, 221], { corridorHw: 61 }), wave(5100, 'shooter', [300, 370]), wave(6800, 'grunt', [120, 240, 360], CART), mass(7200, 'grunt', 16, 2), wave(8800, 'rusher', [100, 200, 280, 380], HOUND)],
    elite: { z: 9600, hp: 640, summon: true } };
  //  23 복수 정예(근사: 소환형 정예 B2 그림 + 최대 밀도 — 3체 동시는 다음 회차)(BG5)
  C[23] = { version: 1, title: '세 정예', bg: 5, startUnits: 7, startWeapon: 'rifle', length: 10600, eliteZ: 10200,
    gates: [g2(1400, 4, -10), g3(4400, -8, 8, -8, { max: 30 }), g2(7200, 10, -24, { max: 36 }), g3(9000, -10, 10, -10, { max: 30 })],
    supplies: [weapon(2200, 240, 'auto', 12), soldier(3400, 120, 6, 14), soldier(3400, 360, 6, 14), weapon(5600, 240, 'heavy', 18), soldier(6400, 240, 9, 22), soldier(8000, 150, 6, 16)],
    walls: [cover(190, 290, 4020), cover(80, 186, 8620)],
    spawns: [wave(1900, 'grunt', [140, 340], ARMOR), wave(3000, 'rusher', [120, 240, 360], JUMPER), wave(5000, 'shooter', [150, 330], POD), mass(6000, 'grunt', 16, 2), wave(7800, 'grunt', [120, 240, 360], CART), wave(9400, 'shooter', [120, 240, 360], MAGNET), mass(9700, 'grunt', 12, 2)],
    elite: { z: 10200, hp: 760, summon: true, skin: 'B2_gantrywidow' } };
  //  24 최종(근사: 최종 보스 B5 그림, 최대 체력·소환 — 아레나는 다음 회차)(BG5)
  C[24] = { version: 1, title: '크라운 브레이커', bg: 5, startUnits: 8, startWeapon: 'rifle', length: 11200, eliteZ: 10800,
    gates: [g3(1500, -6, 6, -6), g2(4200, -18, 8, { max: 30 }), g3(6800, 8, -24, 8, { max: 36 }), g2(9200, 12, -30, { max: 40 })],
    supplies: [weapon(2300, 240, 'auto', 12), ...pair(coverZFor, 3000, 3500, soldier(0, 120, 8, 18), weapon(0, 326, 'heavy', 18), 'w1'), soldier(5500, 240, 9, 22), chain(7600, 340, 6, 12, 8), soldier(8400, 120, 8, 20), weapon(8400, 360, 'sniper', 14)],
    walls: [wall(3000, 4200, { kind: 'soldier', n: 8 }, { kind: 'weapon', weapon: 'heavy' }), cover(190, 290, 1220), cover(293, 400, 6420)],
    spawns: [wave(2000, 'grunt', [120, 240, 360]), wave(4900, 'grunt', [95, 137, 179, 221], { corridorHw: 61, ...ARMOR }), wave(4900, 'shooter', [300, 370], MAGNET), mass(6000, 'grunt', 16, 2), wave(7200, 'rusher', [100, 200, 280, 380], JUMPER), wave(8000, 'grunt', [140, 340], CART), mass(9600, 'grunt', 18, 2), wave(10200, 'shooter', [120, 240, 360], POD)],
    elite: { z: 10800, hp: 900, summon: true, skin: 'B5_crownbreaker' } };
  return C;
}

export const COURSE_IDS = Object.freeze(Array.from({ length: 21 }, (_, i) => i + 4));
