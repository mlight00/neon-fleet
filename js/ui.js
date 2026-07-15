// DOM 오버레이: 타이틀 / 결과(성공·실패) / 격납고 / 모듈 드래프트 / 무기 진화 / 교리 화면
import { hangarCost } from './logic.js';
import { MODULE_BY_ID } from './modules.js';
import { WEAPON_LABELS, WEAPON_COLORS } from './render.js';
import { sfx } from './audio.js';

const overlay = document.getElementById('overlay');

// 오버레이 내 모든 버튼 클릭에 UI 클릭음 (개별 핸들러보다 위임이 간단)
overlay?.addEventListener('click', (e) => {
  if (e.target.closest('button')) sfx('click');
}, true);

// ─── 키보드 방향키 메뉴 탐색 (일시정지 오버레이 전용: 섹터맵·드래프트) ───
// 화면이 멈춘 선택 화면에서 마우스 없이 ←→(↑↓)로 이동, Space/Enter로 확정.
let navState = null; // { buttons:[el], idx, onConfirm }
function navHighlight() {
  if (!navState) return;
  navState.buttons.forEach((b, k) => {
    const on = k === navState.idx;
    b.style.boxShadow = on
      ? '0 0 0 4px #ffffff, 0 0 22px 5px #3ff5e0' + (b._baseShadow ? ', ' + b._baseShadow : '')
      : (b._baseShadow || '');
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}
function navMove(d) {
  if (!navState || !navState.buttons.length) return;
  navState.idx = (navState.idx + d + navState.buttons.length) % navState.buttons.length;
  navHighlight();
  sfx('click');
}
function clearNav() { navState = null; }
/** 선택 가능한 버튼 목록에 키보드 탐색을 부착 (가운데 항목에 초기 포커스) */
function attachKeyNav(buttons, onConfirm, initialIdx) {
  const list = Array.from(buttons);
  if (!list.length) { navState = null; return; }
  list.forEach((b) => { b._baseShadow = b.style.boxShadow || ''; });
  const mid = Math.floor((list.length - 1) / 2);
  const idx = initialIdx == null ? mid : Math.max(0, Math.min(list.length - 1, initialIdx));
  navState = { buttons: list, idx, onConfirm };
  navHighlight();
  // 마우스 hover와 동기화 → 키보드·마우스 혼용이 자연스럽게
  list.forEach((b, k) => b.addEventListener('mousemove', () => {
    if (navState && navState.idx !== k) { navState.idx = k; navHighlight(); }
  }));
}
// 단일 캡처 핸들러: 메뉴가 열려 있을 때만 방향키·스페이스를 가로채 게임 입력(input.js)과의 충돌을 막는다.
window.addEventListener('keydown', (e) => {
  if (!navState) return;
  const k = e.key;
  const prev = k === 'ArrowLeft' || k === 'ArrowUp';
  const next = k === 'ArrowRight' || k === 'ArrowDown';
  const confirm = k === ' ' || k === 'Spacebar' || k === 'Enter' || e.code === 'Space';
  if (!prev && !next && !confirm) return;   // ESC 등은 통과 (일시정지 등)
  e.preventDefault();
  e.stopImmediatePropagation();             // 게임 키 입력으로 전달 차단
  if (e.repeat && confirm) return;          // 스페이스 오토리핏이 다음 화면을 오확정하지 않게
  if (prev) navMove(-1);
  else if (next) navMove(1);
  else { const b = navState.buttons[navState.idx], cb = navState.onConfirm; clearNav(); cb(b); }
}, true);

function panel(html) {
  clearNav();
  overlay.innerHTML = `<div class="panel">${html}</div>`;
  overlay.classList.remove('hidden');
}

export const ui = {
  hide() {
    clearNav();
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  },

  showTitle({ best, stage, coins = 0, saveOk, onStart, onHangar, onIntro, onReset }) {
    panel(`
      <h1>NEON FLEET</h1>
      <p>네온 함대</p>
      <p class="big">최고 기록: 스테이지 ${stage}</p>
      <p style="font-size:12.5px;color:#9fb8d8;margin:10px 0 2px">좌우로 이동해 적과 적 탄환을 피하세요. 공격은 자동입니다.</p>
      <p style="font-size:11.5px;color:#7f93b0;margin:0">차지 샷: PC는 Space·마우스 홀드, 모바일은 ⚡ 버튼 홀드.</p>
      ${saveOk ? '' : '<p style="color:#ff3d71;font-size:11px">⚠ 현재 브라우저에서는 기록을 저장할 수 없습니다.</p>'}
      <div class="btn-row">
        <button id="btn-start">출격하기</button>
        ${onHangar ? '<button id="btn-hangar" class="sub-btn">격납고 · 영구 강화</button>' : ''}
      </div>
      <div class="title-links">
        ${onIntro ? '<button id="btn-intro" class="link-btn">📖 스토리 다시 보기</button>' : ''}
        ${onReset ? '<button id="btn-reset" class="link-btn danger">기록 초기화</button>' : ''}
      </div>
    `);
    document.getElementById('btn-start').addEventListener('click', onStart);
    if (onHangar) document.getElementById('btn-hangar').addEventListener('click', onHangar);
    if (onIntro) document.getElementById('btn-intro').addEventListener('click', onIntro);
    if (onReset) document.getElementById('btn-reset').addEventListener('click', onReset);
  },

  /** 첫 출격 조작 안내 (루트 노드 자동 진입 직전 1회만 표시) */
  showFirstGuide({ onStart }) {
    panel(`
      <h2>첫 출격 안내</h2>
      <p style="font-size:14px;color:#dbe8ff;margin:14px 0 6px">좌우로 이동해 경로를 선택하세요.</p>
      <p style="font-size:13px;color:#9fb8d8;margin:0 0 6px"><b style="color:#3ff5e0">청록</b>은 성장, <b style="color:#ff3d71">자홍</b>은 손실입니다.</p>
      <p style="font-size:12px;color:#7f93b0;margin:0 0 4px">PC: Space·마우스 홀드 · 모바일: ⚡ 버튼 홀드</p>
      <button id="btn-guide-start">출격 시작 ▶</button>
    `);
    document.getElementById('btn-guide-start').addEventListener('click', onStart);
  },

  /** 초기화 확인 대화 */
  showResetConfirm({ onConfirm, onCancel }) {
    panel(`
      <h2 style="color:#ff3d71">모든 기록을 삭제할까요?</h2>
      <p>스테이지 진행 기록, 코인, 격납고 강화,<br>최고 기록이 <b>모두 삭제</b>됩니다.</p>
      <p style="color:#ff9c41"><small>삭제한 기록은 복구할 수 없습니다.</small></p>
      <button id="btn-reset-yes" style="background:linear-gradient(135deg,#ff3d71,#ff9c41)">모두 삭제</button>
      <button id="btn-reset-no" class="sub-btn">취소</button>
    `);
    document.getElementById('btn-reset-yes').addEventListener('click', onConfirm);
    document.getElementById('btn-reset-no').addEventListener('click', onCancel);
  },

  /** 격납고: 코인으로 영구 강화 구매 */
  showHangar({ data, hangar, squadBase, onBuy, onBack }) {
    const cur = {
      drones: (lv) => `${squadBase.start + lv * hangar.upgrades.drones.step}기`,
      dmg: (lv) => (squadBase.damage + lv * hangar.upgrades.dmg.step).toFixed(1),
      rate: (lv) => `${(squadBase.fireRate + lv * hangar.upgrades.rate.step).toFixed(1)}/s`,
      coin: (lv) => `x${(1 + lv * hangar.upgrades.coin.step).toFixed(1)}`,
    };
    const rows = Object.entries(hangar.upgrades).map(([key, def]) => {
      const lv = data.up[key];
      const maxed = lv >= hangar.maxLv;
      const cost = maxed ? 0 : hangarCost(def.base, lv, hangar.costGrowth);
      const afford = data.coins >= cost;
      const pips = Array.from({ length: hangar.maxLv }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `
        <div class="h-row">
          <div class="h-info">
            <b>${def.name}</b>
            <span class="h-pips">${pips}</span>
            <small>${def.desc}: ${cur[key](lv)}${maxed ? '' : ' → ' + cur[key](lv + 1)}</small>
          </div>
          <button class="h-buy" data-key="${key}" ${maxed || !afford ? 'disabled' : ''}>
            ${maxed ? '최고 레벨 (MAX)' : `강화 🪙 ${cost.toLocaleString()}`}
          </button>
        </div>`;
    }).join('');
    panel(`
      <h2>격납고 · 영구 강화</h2>
      <p class="big">보유 코인: 🪙 ${data.coins.toLocaleString()}</p>
      <div class="h-list">${rows}</div>
      <p><small>격납고 강화는 모든 출격에 영구 적용됩니다. 코인은 플레이 중 획득할 수 있습니다.</small></p>
      <button id="btn-back">돌아가기</button>
    `);
    overlay.querySelectorAll('.h-buy').forEach((b) => {
      b.addEventListener('click', () => onBuy(b.dataset.key));
    });
    document.getElementById('btn-back').addEventListener('click', onBack);
  },

  /** 일시정지 오버레이: 재개 또는 판 포기(끝내기) */
  showPause({ onResume, onQuit }) {
    panel(`
      <h2>일시정지</h2>
      <p>아래 버튼 또는 <b>ESC</b>를 눌러 계속하세요.</p>
      <div class="btn-row">
        <button id="btn-resume">계속하기</button>
        ${onQuit ? '<button id="btn-quit" class="sub-btn">출격 종료</button>' : ''}
      </div>
      ${onQuit ? '<p><small>지금 종료해도 이번 출격에서 획득한 코인과 기록은 저장됩니다.</small></p>' : ''}
    `);
    document.getElementById('btn-resume').addEventListener('click', onResume);
    if (onQuit) document.getElementById('btn-quit').addEventListener('click', onQuit);
  },

  showLose({ stage, maxPower = 0, coins, bonus = 0, best = 0, isRecord, modules = [], onRetry, onHangar }) {
    const mods = modules.length
      ? `<p style="font-size:16px;letter-spacing:2px;margin-top:6px">${modules.map((m) => m.icon + (m.count > 1 ? m.count : '')).join(' ')}</p>` : '';
    const total = (coins || 0) + (bonus || 0);
    const coinBlock = bonus > 0
      ? `<div style="margin:6px 0;line-height:1.6">
           <div>전투 획득 <b>🪙 +${(coins || 0).toLocaleString()}</b></div>
           <div style="color:#7cff9c">원정 진행 보상 <b>+${bonus.toLocaleString()}</b></div>
           <div>총 획득 <b>🪙 +${total.toLocaleString()}</b></div>
         </div>`
      : (total > 0 ? `<p>획득 코인: <b>🪙 +${total.toLocaleString()}</b></p>` : '');
    panel(`
      <h2 style="color:#ff3d71">출격 종료</h2>
      <p class="big">스테이지 ${stage} 도달</p>
      <p>최대 함대 화력: <b>${maxPower.toLocaleString()}</b> ${isRecord ? '<span class="record">★ 신기록!</span>' : ''}</p>
      ${mods}
      ${coinBlock}
      ${best > 0 && !isRecord ? `<p>역대 최고 화력: ${best.toLocaleString()}</p>` : ''}
      <p style="color:#9fb8d8"><small>격납고에서 영구 강화하고 더 멀리 진격하세요.</small></p>
      <div class="btn-row">
        <button id="btn-retry">다시 출격</button>
        ${onHangar ? '<button id="btn-hangar" class="sub-btn">격납고 · 영구 강화</button>' : ''}
      </div>
    `);
    document.getElementById('btn-retry').addEventListener('click', onRetry);
    if (onHangar) document.getElementById('btn-hangar').addEventListener('click', onHangar);
  },

  /** 진화 모듈 드래프트: 3장 중 택1 (게임 일시 정지 중) */
  showDraft({ options, owned = [], onPick }) {
    const RARE = { common: '#3ff5e0', rare: '#ffd93d' };
    const cards = options.map((id) => {
      const m = MODULE_BY_ID[id];
      const have = owned.find((o) => o.id === id);
      return `
        <button class="draft-card" data-id="${id}" style="flex:1;min-width:92px;max-width:130px;padding:12px 6px;border:2px solid ${RARE[m.rarity]};background:rgba(255,255,255,0.05);border-radius:12px;display:flex;flex-direction:column;gap:5px;align-items:center;cursor:pointer">
          <div style="font-size:30px;line-height:1">${m.icon}</div>
          <div style="font-weight:bold;font-size:13px;color:${RARE[m.rarity]}">${m.name}${have ? ` ×${have.count}` : ''}</div>
          <div style="font-size:10.5px;color:#9fb8d8;line-height:1.3">${m.desc}</div>
        </button>`;
    }).join('');
    const ownedRow = owned.length
      ? `<p style="font-size:15px;letter-spacing:2px;margin-top:8px;opacity:0.85">${owned.map((o) => o.icon + (o.count > 1 ? o.count : '')).join(' ')}</p>` : '';
    panel(`
      <h2 style="color:#ffd93d">전투 모듈 선택</h2>
      <p><small>1개를 선택하세요. 효과는 이번 출격 동안 유지되며 같은 모듈은 중첩됩니다.</small></p>
      <div style="display:flex;gap:8px;justify-content:center;margin:12px 0;flex-wrap:wrap">${cards}</div>
      ${ownedRow}
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:8px">🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정</p>
    `);
    overlay.querySelectorAll('.draft-card').forEach((b) => {
      b.addEventListener('click', () => onPick(b.dataset.id));
    });
    attachKeyNav(overlay.querySelectorAll('.draft-card'), (b) => onPick(b.dataset.id));
  },

  /** 무기 진화 2택 (Lv3 후 같은 색 캡슐). 게임 일시 정지. */
  showWeaponEvolution({ weapon, options, onPick, tier = 1, repick = false }) {
    const col = WEAPON_COLORS[weapon] || '#3ff5e0';
    const cards = options.map((o) => `
        <button class="evo-card" data-id="${o.id}" aria-label="${o.name}: ${o.shape}" style="flex:1;min-width:120px;max-width:180px;padding:14px 10px;border:2px solid ${col};background:rgba(255,255,255,0.05);border-radius:14px;display:flex;flex-direction:column;gap:6px;align-items:center;cursor:pointer">
          <div style="font-weight:bold;font-size:15px;color:${col}">${o.name}</div>
          <div style="font-size:12px;color:#dfe9ff;line-height:1.3">${o.shape}</div>
          <div style="font-size:11px;color:#7cff9c">▲ ${o.pro}</div>
          ${o.con ? `<div style="font-size:11px;color:#ff9c9c">▼ ${o.con}</div>` : ''}
        </button>`).join('');
    const title = tier === 2 ? `${WEAPON_LABELS[weapon] || '무기'} 초진화 선택` : `${WEAPON_LABELS[weapon] || '무기'} 진화 선택`;
    const sub = repick ? '초진화형을 다시 선택할 수 있습니다. 기존 효과는 새 효과로 교체됩니다.'
      : tier === 2 ? '초진화형 1개를 선택하세요. 진화 무기의 특성이 크게 강화됩니다.'
      : '진화형 1개를 선택하세요. 공격 방식이 바뀌며 이번 출격 동안 유지됩니다.';
    panel(`
      <h2 style="color:${col}">${title}</h2>
      <p><small>${sub}</small></p>
      <div style="display:flex;gap:12px;justify-content:center;margin:14px 0;flex-wrap:wrap">${cards}</div>
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:6px">🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정</p>
    `);
    overlay.querySelectorAll('.evo-card').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
    attachKeyNav(overlay.querySelectorAll('.evo-card'), (b) => onPick(b.dataset.id));
  },

  /** 기함 교리 3택 (첫 업그레이드 1회). 게임 일시 정지. */
  showDoctrineDraft({ options, onPick }) {
    const cards = options.map((d) => `
        <button class="doc-card" data-id="${d.id}" aria-label="${d.name}: ${d.desc}" style="flex:1;min-width:108px;max-width:160px;padding:14px 8px;border:2px solid #ffd93d;background:rgba(255,255,255,0.05);border-radius:14px;display:flex;flex-direction:column;gap:6px;align-items:center;cursor:pointer">
          <div style="font-size:30px;line-height:1">${d.icon}</div>
          <div style="font-weight:bold;font-size:14px;color:#ffd93d">${d.name}</div>
          <div style="font-size:11px;color:#dfe9ff;line-height:1.3">${d.desc}</div>
        </button>`).join('');
    panel(`
      <h2 style="color:#ffd93d">함대 전투 스타일 선택</h2>
      <p><small>이번 출격의 성장 방향입니다. 한 번만 선택하며 기함 등급이 내려가도 유지됩니다.</small></p>
      <div style="display:flex;gap:10px;justify-content:center;margin:14px 0;flex-wrap:wrap">${cards}</div>
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:6px">🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정</p>
    `);
    overlay.querySelectorAll('.doc-card').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
    attachKeyNav(overlay.querySelectorAll('.doc-card'), (b) => onPick(b.dataset.id));
  },

  /** 키스톤 3택 (첫 섹터 보스 후 1회). 각 카드에 행동 변화·장점·대가 명시. 게임 일시 정지. */
  showKeystoneDraft({ options, onPick, sector = 1 }) {
    const cards = options.map((k) => `
        <button class="ks-card" data-id="${k.id}" aria-label="${k.name}: ${k.change}" style="flex:1;min-width:110px;max-width:170px;padding:14px 9px;border:2px solid #b44cff;background:rgba(255,255,255,0.05);border-radius:14px;display:flex;flex-direction:column;gap:6px;align-items:center;cursor:pointer">
          <div style="font-size:30px;line-height:1">${k.icon}</div>
          <div style="font-weight:bold;font-size:14px;color:#d9b3ff">${k.name}</div>
          <div style="font-size:11px;color:#dfe9ff;line-height:1.3">${k.change}</div>
          <div style="font-size:11px;color:#7cff9c">▲ ${k.pro}</div>
          <div style="font-size:11px;color:#ff9c9c">대가: ${k.con}</div>
        </button>`).join('');
    panel(`
      <div style="font-size:13px;color:#ffd93d;font-weight:bold;margin-bottom:4px">🏆 섹터 ${sector} 보스 격파!</div>
      <h2 style="color:#b44cff;margin-top:0">핵심 특성 선택</h2>
      <p><small>강력한 효과와 대가가 함께 있는 특성입니다. 이번 출격에서 <b>1개만</b> 선택하며 끝까지 유지됩니다.</small></p>
      <div style="display:flex;gap:10px;justify-content:center;margin:14px 0;flex-wrap:wrap">${cards}</div>
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:6px">🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정</p>
    `);
    overlay.querySelectorAll('.ks-card').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
    attachKeyNav(overlay.querySelectorAll('.ks-card'), (b) => onPick(b.dataset.id));
  },

  /** 섹터 분기 맵: 갈림길에서 다음 노드를 고른다 (게임 일시 정지) */
  showSectorMap({ map, currentId = null, doneIds = [], sector, coins = 0, onPick }) {
    const META = {
      combat: { icon: '⚔️', label: '전투', color: '#ff6b6b' },
      elite: { icon: '☠️', label: '정예 전투', color: '#ff4cd2' },
      hazard: { icon: '☄️', label: '위험 지역', color: '#ff9c41' },
      supply: { icon: '💎', label: '보급', color: '#6fe3ff' },
      repair: { icon: '🔧', label: '수리', color: '#7cff6b' },
      boss: { icon: '👑', label: '보스', color: '#ffd93d' },
    };
    const W = 300, H = 430, mx = 46, my = 40, SP = 84;
    const idToNode = {};
    map.cols.forEach((col) => col.forEach((n) => { idToNode[n.id] = n; }));
    const current = currentId != null ? idToNode[currentId] : null;
    const reach = current ? current.next.map((r) => map.cols[current.col + 1][r]) : map.cols[0];
    const reachIds = new Set(reach.map((n) => n.id));
    const done = new Set(doneIds);
    const pos = (node) => {
      const n = map.cols[node.col].length;
      return { x: W / 2 + (node.row - (n - 1) / 2) * SP, y: H - my - (node.col / map.depth) * (H - 2 * my) };
    };
    let lines = '';
    for (const col of map.cols) for (const node of col) {
      if (!node.next) continue;
      const p = pos(node);
      for (const r of node.next) {
        const nn = map.cols[node.col + 1][r]; const q = pos(nn);
        const active = reachIds.has(nn.id) && (current ? node.id === current.id : node.col === 0);
        lines += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${active ? '#3ff5e0' : 'rgba(200,220,255,0.14)'}" stroke-width="${active ? 2.5 : 1.5}"/>`;
      }
    }
    let nodes = '';
    for (const col of map.cols) for (const node of col) {
      const p = pos(node); const m = META[node.type];
      const isReach = reachIds.has(node.id); const isDone = done.has(node.id);
      const op = isDone ? 0.3 : isReach ? 1 : 0.62;
      const bd = isReach ? '#3ff5e0' : m.color;
      const glow = isReach ? 'box-shadow:0 0 12px #3ff5e0;' : '';
      const st = `position:absolute;left:${p.x - 22}px;top:${p.y - 22}px;width:44px;height:44px;border-radius:50%;border:2px solid ${bd};background:rgba(10,16,28,0.9);font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:${op};${glow}${isReach ? 'cursor:pointer' : 'cursor:default'}`;
      nodes += isReach
        ? `<button data-node="${node.id}" style="${st}" title="${m.label}">${m.icon}</button>`
        : `<div style="${st}" title="${m.label}">${m.icon}</div>`;
    }
    const legend = Object.values(META).map((m) => `<span style="white-space:nowrap">${m.icon}${m.label}</span>`).join(' · ');
    panel(`
      <h2 style="color:#3ff5e0">섹터 ${sector} · 항로 선택</h2>
      <p><small>빛나는 지점을 선택해 진격하세요. 맨 위 지점은 섹터 보스입니다.</small></p>
      <div style="position:relative;width:${W}px;height:${H}px;margin:6px auto">
        <svg width="${W}" height="${H}" style="position:absolute;left:0;top:0;pointer-events:none">${lines}</svg>
        ${nodes}
      </div>
      <p style="font-size:10.5px;color:#9fb8d8;line-height:1.6">${legend}</p>
      <p style="font-size:10.5px;color:#9fb8d8">🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정 &nbsp; 보유 코인 🪙 ${coins.toLocaleString()}</p>
    `);
    const pickNode = (b) => onPick(idToNode[+b.dataset.node]);
    overlay.querySelectorAll('[data-node]').forEach((b) => {
      b.addEventListener('click', () => pickNode(b));
    });
    attachKeyNav(overlay.querySelectorAll('[data-node]'), pickNode);
  },

  /** 스테이지 클리어 성과 요약 + 여유 시간 (준비되면 다음 스테이지) */
  showStageClear({ stage, nextStage, bossName, power, drones, tierName, coins, modules = [], onNext }) {
    const mods = modules.length
      ? `<p style="font-size:15px;letter-spacing:2px;margin-top:4px">${modules.map((m) => m.icon + (m.count > 1 ? m.count : '')).join(' ')}</p>` : '';
    panel(`
      <h2 style="color:#3ff5e0">스테이지 ${stage} 클리어!</h2>
      <p class="big">${bossName} 격파!</p>
      <div style="margin:10px 0;line-height:1.8">
        <div>함대 화력 <b>${power.toLocaleString()}</b></div>
        <div>기함 ${tierName} · 드론 ${drones}기</div>
        <div>보유 코인 <b>🪙 ${coins.toLocaleString()}</b></div>
      </div>
      ${mods ? '<p style="color:#9fb8d8"><small>보유 모듈</small></p>' + mods : ''}
      <p style="color:#ff9c41"><small>다음 스테이지는 난이도가 더 높습니다.</small></p>
      <button id="btn-next">스테이지 ${nextStage} 출격 ▶</button>
    `);
    document.getElementById('btn-next').addEventListener('click', onNext);
  },
};
