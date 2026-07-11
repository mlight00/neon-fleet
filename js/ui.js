// DOM 오버레이: 타이틀 / 결과(성공·실패) / 격납고 / 모듈 드래프트 화면
import { hangarCost } from './logic.js';
import { MODULE_BY_ID } from './modules.js';
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
      <p>드론을 바쳐 업그레이드할 때마다 <b>모듈</b>을 골라<br>매 원정 다른 빌드로 끝까지 도전!</p>
      <p>📱 드래그 · 🖱 마우스 · ⌨ ←→ 로 이동</p>
      <p><small>⚡ 꾹 누르면(홀드) 자동사격 멈추고 <b>차지 랜스</b> 충전 → 놓으면 정면 관통 발사</small></p>
      <p class="big">최고 도달 STAGE ${stage}</p>
      ${best > 0 ? `<p>최고 함대 화력: ${best.toLocaleString()} · 코인 ${coins.toLocaleString()}</p>` : ''}
      ${saveOk ? '' : '<p style="color:#ff3d71">⚠ 이 브라우저에선 기록 저장이 꺼져 있어요</p>'}
      <div class="btn-row">
        <button id="btn-start">출격</button>
        ${onHangar ? '<button id="btn-hangar" class="sub-btn">격납고</button>' : ''}
      </div>
      <div class="title-links">
        ${onIntro ? '<button id="btn-intro" class="link-btn">📖 스토리 다시보기</button>' : ''}
        ${onReset ? '<button id="btn-reset" class="link-btn danger">기록 초기화</button>' : ''}
      </div>
    `);
    document.getElementById('btn-start').addEventListener('click', onStart);
    if (onHangar) document.getElementById('btn-hangar').addEventListener('click', onHangar);
    if (onIntro) document.getElementById('btn-intro').addEventListener('click', onIntro);
    if (onReset) document.getElementById('btn-reset').addEventListener('click', onReset);
  },

  /** 초기화 확인 대화 */
  showResetConfirm({ onConfirm, onCancel }) {
    panel(`
      <h2 style="color:#ff3d71">기록 초기화</h2>
      <p>스테이지 진행, 코인, 격납고 강화,<br>최고 기록이 <b>모두 삭제</b>됩니다.</p>
      <p style="color:#ff9c41"><small>되돌릴 수 없습니다.</small></p>
      <button id="btn-reset-yes" style="background:linear-gradient(135deg,#ff3d71,#ff9c41)">초기화</button>
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
            ${maxed ? 'MAX' : `🪙 ${cost.toLocaleString()}`}
          </button>
        </div>`;
    }).join('');
    panel(`
      <h2>격납고</h2>
      <p class="big">보유 코인: 🪙 ${data.coins.toLocaleString()}</p>
      <div class="h-list">${rows}</div>
      <p><small>강화는 영구 적용됩니다. 코인은 판을 진행하며 모입니다.</small></p>
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
      <p>계속하려면 아래 버튼 또는 <b>ESC</b></p>
      <div class="btn-row">
        <button id="btn-resume">게임 재개하기</button>
        ${onQuit ? '<button id="btn-quit" class="sub-btn">끝내기</button>' : ''}
      </div>
      ${onQuit ? '<p><small>끝내도 이번 판에 모은 코인과 기록은 저장됩니다</small></p>' : ''}
    `);
    document.getElementById('btn-resume').addEventListener('click', onResume);
    if (onQuit) document.getElementById('btn-quit').addEventListener('click', onQuit);
  },

  showLose({ stage, maxPower = 0, coins, best = 0, isRecord, modules = [], onRetry, onHangar }) {
    const mods = modules.length
      ? `<p style="font-size:16px;letter-spacing:2px;margin-top:6px">${modules.map((m) => m.icon + (m.count > 1 ? m.count : '')).join(' ')}</p>` : '';
    panel(`
      <h2 style="color:#ff3d71">원정 종료</h2>
      <p class="big">STAGE ${stage} 도달</p>
      <p>최대 함대 화력: <b>${maxPower.toLocaleString()}</b> ${isRecord ? '<span class="record">★ 신기록!</span>' : ''}</p>
      ${mods}
      ${coins > 0 ? `<p>획득 코인: <b>🪙 +${coins.toLocaleString()}</b></p>` : ''}
      ${best > 0 && !isRecord ? `<p>최고 기록: ${best.toLocaleString()}</p>` : ''}
      <p style="color:#9fb8d8"><small>죽으면 처음부터 — 격납고 강화로 더 멀리</small></p>
      <div class="btn-row">
        <button id="btn-retry">새 원정</button>
        ${onHangar ? '<button id="btn-hangar" class="sub-btn">격납고</button>' : ''}
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
      <h2 style="color:#ffd93d">업그레이드 · 모듈 선택</h2>
      <p><small>하나를 골라 함대를 강화 — 원정 내내 유지·중첩됩니다</small></p>
      <div style="display:flex;gap:8px;justify-content:center;margin:12px 0;flex-wrap:wrap">${cards}</div>
      ${ownedRow}
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:8px">🖱 클릭 · ⌨ ←→ 이동 · Space 선택</p>
    `);
    overlay.querySelectorAll('.draft-card').forEach((b) => {
      b.addEventListener('click', () => onPick(b.dataset.id));
    });
    attachKeyNav(overlay.querySelectorAll('.draft-card'), (b) => onPick(b.dataset.id));
  },

  /** 섹터 분기 맵: 갈림길에서 다음 노드를 고른다 (게임 일시 정지) */
  showSectorMap({ map, currentId = null, doneIds = [], sector, coins = 0, onPick }) {
    const META = {
      combat: { icon: '⚔️', label: '교전', color: '#ff6b6b' },
      elite: { icon: '☠️', label: '정예', color: '#ff4cd2' },
      hazard: { icon: '☄️', label: '위험', color: '#ff9c41' },
      supply: { icon: '💎', label: '보급', color: '#6fe3ff' },
      repair: { icon: '🔧', label: '정비', color: '#7cff6b' },
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
      <p><small>빛나는 노드를 골라 진격 (위 = 섹터 보스)</small></p>
      <div style="position:relative;width:${W}px;height:${H}px;margin:6px auto">
        <svg width="${W}" height="${H}" style="position:absolute;left:0;top:0;pointer-events:none">${lines}</svg>
        ${nodes}
      </div>
      <p style="font-size:10.5px;color:#9fb8d8;line-height:1.6">${legend}</p>
      <p style="font-size:10.5px;color:#9fb8d8">🖱 클릭 · ⌨ ←→ 이동 · Space 선택 &nbsp; 🪙 ${coins.toLocaleString()}</p>
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
      <h2 style="color:#3ff5e0">STAGE ${stage} 클리어!</h2>
      <p class="big">${bossName} 격파</p>
      <div style="margin:10px 0;line-height:1.8">
        <div>함대 화력 <b>${power.toLocaleString()}</b></div>
        <div>${tierName} · 드론 ${drones}기</div>
        <div>원정 코인 <b>🪙 ${coins.toLocaleString()}</b></div>
      </div>
      ${mods ? '<p style="color:#9fb8d8"><small>보유 모듈</small></p>' + mods : ''}
      <p style="color:#ff9c41"><small>다음 스테이지는 적이 더 강해집니다</small></p>
      <button id="btn-next">STAGE ${nextStage} 출격 ▶</button>
    `);
    document.getElementById('btn-next').addEventListener('click', onNext);
  },
};
