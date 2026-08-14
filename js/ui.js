// DOM 오버레이: 타이틀 / 결과(성공·실패) / 격납고 / 모듈 드래프트 / 무기 진화 / 교리 화면
import { hangarCost } from './logic.js';
import { MODULE_BY_ID } from './modules.js';
import { WEAPON_LABELS, WEAPON_COLORS } from './render.js';
import { sfx } from './audio.js';

const overlay = document.getElementById('overlay');

// Prolific 전용 표시 번역. 원본 ID와 효과 수치는 바꾸지 않는다.
const MODULE_EN = {
  dmg: ['Firepower Core', 'Damage +8%'],
  rate: ['Fire Accelerator', 'Fire rate +8%'],
  pierce: ['Piercing Rounds', 'Shots pierce 1 additional enemy'],
  explode: ['Explosive Rounds', 'Defeated enemies cause a small explosion'],
  crit: ['Critical Circuit', 'Critical chance +5% · critical damage ×2'],
  boss: ['Hunter Mark', 'Damage to bosses +10%'],
  harvest: ['Harvest Drones', 'Drones gained from crystals and supply +30%'],
  evolve: ['Efficient Design', 'Drones required for flagship upgrades −15%'],
  scavenge: ['Drone Recovery', 'Higher chance to gain drones from defeated enemies'],
  armor: ['Phase Armor', 'Drones lost in collisions −25%'],
  shieldregen: ['Reactive Shield', 'Periodically blocks one hit'],
  swarm: ['Fleet Synergy', 'More drones increase damage'],
  chgPower: ['Charge Amplifier', 'Charge-shot damage +12%'],
  chgSpeed: ['Rapid Charging', 'Charge speed +35%'],
  chgMax: ['Limit Break', 'Maximum charge level +1'],
};
export const DOCTRINE_EN = {
  swarm: ['Drone Command', 'Stronger drone and cruiser attacks'],
  lance: ['Charge Assault', 'Stronger charge shots and frontal attacks'],
  phase: ['Evasive Tactics', 'Better movement and evasion'],
};
export const KEYSTONE_EN = {
  swarm_forge: ['Swarm Forge', 'Every 10 defeats summons 2 ghost cruisers for 8 seconds', 'Cruiser damage +25% while summoned', 'Flagship damage −10%'],
  lance_echo: ['Echo Lance', 'A charge shot fires one echo along the same path', 'The echo deals 45% of the original damage', 'Automatic attack damage −12%'],
  phase_afterimage: ['Phase Afterimage', 'Every 5 defeats creates a nearby shockwave', 'The shockwave clears up to 8 enemy shots', 'Taking damage resets Focus and immediately ends Rush'],
};
const EVOLUTION_EN = {
  vulcan_storm: ['Storm Vulcan', 'Wide shots ricochet to nearby enemies', 'Strong against groups', 'Lower damage to a single target'],
  vulcan_needle: ['Needle Gatling', 'Rapid piercing shots in a tight line', 'Strong against bosses', 'Weak against spread-out enemies'],
  laser_prism: ['Prism Array', 'The piercing beam splits sideways', 'Strong against groups', 'No split effect on bosses'],
  laser_cutter: ['Null Cutter', 'Occasional heavy beams clear enemy shots', 'Strong defense against bullet patterns', 'Lower direct damage'],
  homing_wasp: ['Wasp Swarm', 'Launches five small homing missiles', 'Tracks spread-out enemies', 'Lower damage per missile'],
  homing_siege: ['Siege Torpedo', 'A slow torpedo creates a huge explosion', 'Very strong against bosses', 'Slow fire rate'],
  vulcan_tempest: ['Tempest', 'Faster barrages cover a wider area', 'Maximum area coverage', 'Lower single-target efficiency'],
  vulcan_lance: ['Lance Vulcan', 'Piercing shots focus on one point', 'Maximum single-target damage', 'Very narrow coverage'],
  laser_nova: ['Nova Beam', 'A thicker, stronger piercing beam', 'Much higher damage and piercing', ''],
  laser_reaper: ['Reaper Beam', 'Rapid cutting beams', 'Much faster fire rate', 'Lower damage per beam'],
  homing_legion: ['Legion', 'Continuously launches many homing missiles', 'Maximum missile count and tracking', 'Lower damage per missile'],
  homing_nova: ['Nova Torpedo', 'A decisive torpedo with a massive blast', 'Maximum damage and blast radius', 'Very slow fire rate'],
};

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

function panel(html, cls = '') {
  clearNav();
  overlay.innerHTML = `<div class="panel${cls ? ' ' + cls : ''}">${html}</div>`;
  overlay.classList.remove('hidden');
}

export const ui = {
  hide() {
    clearNav();
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  },

  showTitle({ best, stage, coins = 0, saveOk, onStart, onCampaign25 = null, onHangar, onIntro, onReset, onEndless = null, endlessUnlocked = false, endlessBest = 0 }) {
    panel(`
      <div class="title-mark">
        <img class="title-emblem" src="assets/art2-webp/branding/emblem.webp" alt="">
        <div class="title-words">
          <span class="tw-neon">NEON</span><span class="tw-fleet">FLEET</span>
          <span class="tw-tag">REBUILD // EVOLVE // BREAK THE CROWN</span>
        </div>
      </div>
      <p class="title-kor">네온 함대</p>
      <p class="big">최고 기록: 스테이지 ${stage}</p>
      ${endlessUnlocked ? `<p style="font-size:12px;color:#ffd93d;margin:2px 0">🌌 은하 해방 · 무한 원정 최고 섹터 ${endlessBest}</p>` : ''}
      <p style="font-size:12.5px;color:#9fb8d8;margin:10px 0 2px">좌우로 이동해 적과 적 탄환을 피하세요. 공격은 자동입니다.</p>
      <p style="font-size:11.5px;color:#7f93b0;margin:0">차지 샷: PC는 Space·마우스 홀드, 모바일은 ⚡ 버튼 홀드.</p>
      ${saveOk ? '' : '<p style="color:#ff3d71;font-size:11px">⚠ 현재 브라우저에서는 기록을 저장할 수 없습니다.</p>'}
      <div class="btn-row">
        ${onCampaign25 ? '<button id="btn-campaign25">25분 캠페인</button>' : ''}
        <button id="btn-start">${onCampaign25 ? '섹터 원정' : '출격하기'}</button>
      </div>
      <div class="btn-row" style="margin-top:8px">
        ${onEndless ? '<button id="btn-endless" class="sub-btn">🌌 무한 원정</button>' : ''}
        ${onHangar ? '<button id="btn-hangar" class="sub-btn">격납고 · 영구 강화</button>' : ''}
      </div>
      <div class="title-links">
        ${onIntro ? '<button id="btn-intro" class="link-btn">📖 스토리 다시 보기</button>' : ''}
        ${onReset ? '<button id="btn-reset" class="link-btn danger">기록 초기화</button>' : ''}
      </div>
    `, 'title-screen');
    document.getElementById('btn-start').addEventListener('click', onStart);
    if (onCampaign25) document.getElementById('btn-campaign25').addEventListener('click', onCampaign25);
    if (onEndless) document.getElementById('btn-endless').addEventListener('click', onEndless);
    if (onHangar) document.getElementById('btn-hangar').addEventListener('click', onHangar);
    if (onIntro) document.getElementById('btn-intro').addEventListener('click', onIntro);
    if (onReset) document.getElementById('btn-reset').addEventListener('click', onReset);
  },

  /** 캠페인 승리 화면 (§6.3): 은하 해방 + 무한 원정 해금. */
  showVictory({ coins = 0, best = 0, onTitle, onEndless, onRestart, lang = 'ko' }) {
    const en = lang === 'en';
    panel(`
      <h1 style="color:#ffd93d">${en ? 'GALAXY LIBERATED' : '은하 해방'}</h1>
      <p class="big">${en ? 'You defeated the Hive Queen.' : '하이브 퀸을 격파했습니다.'}</p>
      <p style="color:#3ff5e0;margin:8px 0">${en ? 'Endless Expedition unlocked.' : '무한 원정이 해금되었습니다.'}</p>
      <div style="margin:10px 0;line-height:1.7">
        <div>${en ? 'Run earnings' : '이번 원정 획득'} 🪙 ${coins.toLocaleString()}</div>
        <div>${en ? 'Best fleet power' : '최고 함대 화력'} <b>${best.toLocaleString()}</b></div>
      </div>
      <div class="btn-row" style="flex-direction:column;gap:10px;align-items:stretch">
        <button id="btn-vic-endless">${en ? '🌌 Start Endless Expedition' : '🌌 무한 원정 시작'}</button>
        <button id="btn-vic-restart" class="sub-btn">${en ? 'Restart campaign' : '캠페인 다시 시작'}</button>
        ${en ? '' : '<button id="btn-vic-title" class="sub-btn">타이틀로</button>'}
      </div>
    `);
    document.getElementById('btn-vic-endless').addEventListener('click', onEndless);
    document.getElementById('btn-vic-restart').addEventListener('click', onRestart);
    const titleBtn = document.getElementById('btn-vic-title');
    if (titleBtn) titleBtn.addEventListener('click', onTitle);
  },

  /** 첫 출격 조작 안내 (루트 노드 자동 진입 직전 1회만 표시).
   *  combo=true(섹터 무기 조합)면 **무기 선택 게이트**가 없으므로 그 대신 실제 성장 경로(POW·크리스탈)를 안내한다.
   *  ⚠️게이트는 두 종류다. 없앤 것은 weaponGate(무기 선택 막대) 하나뿐이고,
   *   성장/손실 게이트(gatePair · 청록 ×2 / 자홍 ÷2)는 그대로 남아 있다 — 두 번째 노드부터 86% 등장(시드 400 실측).
   *   그래서 combo 판에도 청록/자홍 한 줄이 반드시 있어야 한다. 예전에 이 줄이 빠져서
   *   "설명은 못 듣고 물건은 만나는" 상태였다(§첫90초 설계서 §2-3, 이사 결정 '가'). */
  showFirstGuide({ onStart, combo = false, lang = 'ko' }) {
    if (lang === 'en') {
      // Prolific 첫인상 테스트 전용 영어 간이 가이드(작업지시서 §4.2·§4.3).
      panel(`
        <h2>How to play</h2>
        <p style="font-size:14px;color:#dbe8ff;margin:14px 0 6px">Move left/right to dodge enemies and bullets. Firing is automatic.</p>
        <p style="font-size:13px;color:#9fb8d8;margin:0 0 6px"><b style="color:#3ff5e0">Cyan</b> routes help you grow; <b style="color:#ff3d71">magenta</b> routes cost you.</p>
        <p style="font-size:13px;color:#9fb8d8;margin:0 0 6px">Pick up <b style="color:#ffd93d">POW</b> to upgrade your weapon and <b style="color:#6fe3ff">crystals</b> to add drones.</p>
        <p style="font-size:12px;color:#7f93b0;margin:0 0 4px">Charge shot — PC: hold Space or the mouse button · Mobile: hold the ⚡ button</p>
        <button id="btn-guide-start" aria-label="Start the playtest">Start ▶</button>
      `);
      document.getElementById('btn-guide-start').addEventListener('click', onStart);
      return;
    }
    const body = combo ? `
      <p style="font-size:14px;color:#dbe8ff;margin:14px 0 6px">좌우로 움직여 피하고, 사격은 자동입니다.</p>
      <p style="font-size:13px;color:#9fb8d8;margin:0 0 6px">갈림길에서 <b style="color:#3ff5e0">청록</b>은 성장, <b style="color:#ff3d71">자홍</b>은 손실입니다.</p>
      <p style="font-size:13px;color:#9fb8d8;margin:0 0 6px"><b style="color:#ffd93d">POW</b>는 무기 강화, <b style="color:#6fe3ff">크리스탈</b>은 드론 보급입니다.</p>
      <p style="font-size:13px;color:#9fb8d8;margin:0 0 6px">교전 중반의 <b style="color:#ff9c41">중간 보스</b>를 잡으면 POW가 떨어집니다.<br>첫 POW로 <b>보조 무기</b>를 골라 무기 조합을 완성하세요.</p>
      <p style="font-size:12px;color:#7f93b0;margin:0 0 4px">PC: Space·마우스 홀드 · 모바일: ⚡ 버튼 홀드</p>
    ` : `
      <p style="font-size:14px;color:#dbe8ff;margin:14px 0 6px">좌우로 이동해 경로를 선택하세요.</p>
      <p style="font-size:13px;color:#9fb8d8;margin:0 0 6px"><b style="color:#3ff5e0">청록</b>은 성장, <b style="color:#ff3d71">자홍</b>은 손실입니다.</p>
      <p style="font-size:12px;color:#7f93b0;margin:0 0 4px">PC: Space·마우스 홀드 · 모바일: ⚡ 버튼 홀드</p>
    `;
    panel(`
      <h2>첫 출격 안내</h2>
      ${body}
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
  showHangar({ data, hangar, squadBase, onBuy, onBack, lang = 'ko' }) {
    const en = lang === 'en';
    // 포털 영어 격납고. 강화 이름·설명 영어(§P0-2). 수치·비용 로직은 그대로.
    const HANGAR_EN = {
      drones: ['Drones', 'Starting fleet size'],
      dmg: ['Damage', 'Attack power'],
      rate: ['Fire rate', 'Shots per second'],
      coin: ['Coin gain', 'Coin multiplier'],
      magnet: ['Magnet', 'Coin pickup range'],
      hull: ['Hull', 'Flagship integrity'],
      cruiser: ['Cruiser power', 'Cruiser attack bonus'],
    };
    const nm = (key, def) => (en ? (HANGAR_EN[key]?.[0] || def.name) : def.name);
    const ds = (key, def) => (en ? (HANGAR_EN[key]?.[1] || def.desc) : def.desc);
    const U = hangar.upgrades;
    const cur = {
      drones: (lv) => `${squadBase.start + lv * U.drones.step}${en ? '' : '기'}`,
      dmg: (lv) => (squadBase.damage + lv * U.dmg.step).toFixed(1),
      rate: (lv) => `${(squadBase.fireRate + lv * U.rate.step).toFixed(1)}/s`,
      coin: (lv) => `x${(1 + lv * U.coin.step).toFixed(1)}`,
      magnet: (lv) => `+${lv * U.magnet.step}px`,
      hull: (lv) => `+${lv * U.hull.step}`,
      cruiser: (lv) => `+${lv * U.cruiser.step}`,
    };
    const fmtCur = (key, lv) => (cur[key] ? cur[key](lv) : `Lv ${lv}`);   // 미정의 키 안전 폴백
    const rows = Object.entries(hangar.upgrades).map(([key, def]) => {
      const lv = data.up[key];
      const maxed = lv >= hangar.maxLv;
      const cost = maxed ? 0 : hangarCost(def.base, lv, hangar.costGrowth);
      const afford = data.coins >= cost;
      const pips = Array.from({ length: hangar.maxLv }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `
        <div class="h-row">
          <div class="h-info">
            <b>${nm(key, def)}</b>
            <span class="h-pips">${pips}</span>
            <small>${ds(key, def)}: ${fmtCur(key, lv)}${maxed ? '' : ' → ' + fmtCur(key, lv + 1)}</small>
          </div>
          <button class="h-buy" data-key="${key}" ${maxed || !afford ? 'disabled' : ''}>
            ${maxed ? (en ? 'MAX' : '최고 레벨 (MAX)') : `${en ? 'Upgrade' : '강화'} 🪙 ${cost.toLocaleString()}`}
          </button>
        </div>`;
    }).join('');
    panel(`
      <h2>${en ? 'Hangar · Permanent Upgrades' : '격납고 · 영구 강화'}</h2>
      <p class="big">${en ? 'Coins' : '보유 코인'}: 🪙 ${data.coins.toLocaleString()}</p>
      <div class="h-list">${rows}</div>
      <p><small>${en ? 'Hangar upgrades apply permanently to every run. Earn coins while playing.' : '격납고 강화는 모든 출격에 영구 적용됩니다. 코인은 플레이 중 획득할 수 있습니다.'}</small></p>
      <button id="btn-back">${en ? 'Back' : '돌아가기'}</button>
    `);
    overlay.querySelectorAll('.h-buy').forEach((b) => {
      b.addEventListener('click', () => onBuy(b.dataset.key));
    });
    document.getElementById('btn-back').addEventListener('click', onBack);
  },

  /** 일시정지 오버레이: 재개 또는 판 포기(끝내기) */
  showPause({ onResume, onQuit, lang = 'ko', cameraZoom = 1, onZoomOut, onZoomReset, onZoomIn, chaseView = false, onToggleChase }) {
    const en = lang === 'en';
    // 카메라 배율 행(§8): [−] [100%] [+]. 가운데 퍼센트 버튼은 누르면 초기화. 세 콜백이 모두 있을 때만 표시.
    const hasCam = !!(onZoomOut && onZoomReset && onZoomIn);
    const pct = Math.round((cameraZoom || 1) * 100);
    // 함미 추적 시점 토글 버튼(§8.2): 현재 상태에 따라 문구 전환. 모바일은 이 버튼으로 진입/복귀.
    const chaseLabel = chaseView ? (en ? 'Tactical View' : '전술 시점') : (en ? 'Pursuit View' : '함미 추적 시점');
    const chaseAria = chaseView ? (en ? 'Switch to tactical view' : '전술 시점으로 전환') : (en ? 'Switch to pursuit view' : '함미 추적 시점으로 전환');
    const chaseRow = onToggleChase ? `
      <div class="cam-row">
        <button id="btn-chase-view" class="cam-btn cam-chase" aria-label="${chaseAria}">${chaseLabel}</button>
      </div>` : '';
    const camRow = hasCam ? `
      <div class="cam-row" role="group" aria-label="${en ? 'Camera zoom' : '카메라 배율'}">
        <span class="cam-label">${en ? 'Camera' : '카메라'}</span>
        <button id="btn-zoom-out" class="cam-btn" aria-label="${en ? 'Zoom out' : '축소'}">−</button>
        <button id="btn-zoom-reset" class="cam-btn cam-pct" aria-label="${en ? 'Reset zoom to 100%' : '배율 100%로 초기화'}">${pct}%</button>
        <button id="btn-zoom-in" class="cam-btn" aria-label="${en ? 'Zoom in' : '확대'}">+</button>
      </div>${chaseRow}` : '';
    if (en) {
      panel(`
        <h2>Paused</h2>
        <p>Press the button below or <b>ESC</b> to continue.</p>
        ${camRow}
        <div class="btn-row">
          <button id="btn-resume" aria-label="Resume the game">Resume</button>
          ${onQuit ? '<button id="btn-quit" class="sub-btn" aria-label="End this run">End run</button>' : ''}
        </div>
      `);
    } else {
      panel(`
        <h2>일시정지</h2>
        <p>아래 버튼 또는 <b>ESC</b>를 눌러 계속하세요.</p>
        ${camRow}
        <div class="btn-row">
          <button id="btn-resume">계속하기</button>
          ${onQuit ? '<button id="btn-quit" class="sub-btn">출격 종료</button>' : ''}
        </div>
        ${onQuit ? '<p><small>지금 종료해도 이번 출격에서 획득한 코인과 기록은 저장됩니다.</small></p>' : ''}
      `);
    }
    document.getElementById('btn-resume').addEventListener('click', onResume);
    if (onQuit) document.getElementById('btn-quit').addEventListener('click', onQuit);
    if (hasCam) {
      document.getElementById('btn-zoom-out').addEventListener('click', onZoomOut);
      document.getElementById('btn-zoom-reset').addEventListener('click', onZoomReset);
      document.getElementById('btn-zoom-in').addEventListener('click', onZoomIn);
    }
    if (onToggleChase) { const cb = document.getElementById('btn-chase-view'); if (cb) cb.addEventListener('click', onToggleChase); }
  },

  showLose({ stage, maxPower = 0, coins, bonus = 0, best = 0, isRecord, modules = [], onRetry, onChangeWeapon = null, onHangar, freeUpgrade = null, lang = 'ko' }) {
    const en = lang === 'en';
    const mods = modules.length
      ? `<p style="font-size:16px;letter-spacing:2px;margin-top:6px">${modules.map((m) => m.icon + (m.count > 1 ? m.count : '')).join(' ')}</p>` : '';
    const total = (coins || 0) + (bonus || 0);
    const coinBlock = bonus > 0
      ? `<div style="margin:6px 0;line-height:1.6">
           <div>${en ? 'Combat earnings' : '전투 획득'} <b>🪙 +${(coins || 0).toLocaleString()}</b></div>
           <div style="color:#7cff9c">${en ? 'Expedition bonus' : '원정 진행 보상'} <b>+${bonus.toLocaleString()}</b></div>
           <div>${en ? 'Total earned' : '총 획득'} <b>🪙 +${total.toLocaleString()}</b></div>
         </div>`
      : (total > 0 ? `<p>${en ? 'Coins earned' : '획득 코인'}: <b>🪙 +${total.toLocaleString()}</b></p>` : '');
    // P0-A: 첫 실제 사망 무료 긴급 개조. options 있으면 선택 카드, chosenName 있으면 완료 문구.
    let freeBlock = '';
    if (freeUpgrade && freeUpgrade.options && freeUpgrade.options.length) {
      const cards = freeUpgrade.options.map((o, i) =>
        `<button class="draft-card free-up" data-idx="${i}" aria-label="${en ? 'Free emergency upgrade' : '무료 긴급 개조'}: ${o.name} ${o.delta}">
           <div class="card-label">${o.name}</div>
           <div class="card-desc" style="color:#ffd93d;font-weight:700">${o.delta}</div>
         </button>`).join('');
      freeBlock = `
        <div class="free-upgrade" style="margin:12px 0 4px;padding:12px 8px 10px;border:1px solid rgba(124,255,156,0.35);border-radius:10px;background:rgba(124,255,156,0.06)">
          <p class="big" style="color:#7cff9c;font-size:15px;margin:0">${en ? 'First run support · One free emergency upgrade' : '첫 원정 지원 · 무료 긴급 개조 1회'}</p>
          <p style="font-size:12px;color:#cfe6d6;margin:4px 0 0">${en ? 'We recovered your run data. Choose an upgrade to keep permanently.' : '실패 데이터를 회수했습니다. 다음 출격부터 영구 적용할 개조를 고르세요.'}</p>
          <div class="draft-row">${cards}</div>
        </div>`;
    } else if (freeUpgrade && freeUpgrade.chosenName) {
      freeBlock = `
        <div class="free-upgrade" style="margin:12px 0 4px;padding:10px;border:1px solid rgba(124,255,156,0.35);border-radius:10px;background:rgba(124,255,156,0.06)">
          <p class="big" style="color:#7cff9c;font-size:15px;margin:0">${freeUpgrade.chosenName} · ${en ? 'Free emergency upgrade applied' : '무료 긴급 개조 완료'}</p>
          <p style="font-size:12px;color:#cfe6d6;margin:4px 0 0">${en ? "It's now permanent for future runs." : '다음 출격부터 영구 적용됩니다.'}</p>
        </div>`;
    }
    panel(`
      <h2 style="color:#ff3d71">${en ? 'RUN OVER' : '출격 종료'}</h2>
      <p class="big">${en ? `Reached Sector ${stage}` : `스테이지 ${stage} 도달`}</p>
      <p>${en ? 'Max fleet power' : '최대 함대 화력'}: <b>${maxPower.toLocaleString()}</b> ${isRecord ? `<span class="record">${en ? '★ New record!' : '★ 신기록!'}</span>` : ''}</p>
      ${mods}
      ${coinBlock}
      ${best > 0 && !isRecord ? `<p>${en ? 'Best fleet power' : '역대 최고 화력'}: ${best.toLocaleString()}</p>` : ''}
      ${freeBlock}
      <p style="color:#9fb8d8"><small>${en ? 'Upgrade permanently in the Hangar to push further.' : '격납고에서 영구 강화하고 더 멀리 진격하세요.'}</small></p>
      <div class="btn-row">
        <button id="btn-retry">${en ? 'PLAY AGAIN' : '다시 출격'}</button>
        ${onChangeWeapon ? `<button id="btn-change-weapon" class="sub-btn">${en ? 'Change weapon' : '무기 변경'}</button>` : ''}
        ${onHangar ? `<button id="btn-hangar" class="sub-btn">${en ? 'Hangar · Upgrades' : '격납고 · 영구 강화'}</button>` : ''}
      </div>
    `);
    document.getElementById('btn-retry').addEventListener('click', onRetry);
    if (onChangeWeapon) document.getElementById('btn-change-weapon').addEventListener('click', onChangeWeapon);
    if (onHangar) document.getElementById('btn-hangar').addEventListener('click', onHangar);
    // 무료 개조 카드: 첫 클릭 즉시 전체 비활성(연속 탭 차단) + main.onPick(저장 쪽에서도 재검사).
    if (freeUpgrade && freeUpgrade.options && freeUpgrade.options.length) {
      const cardEls = Array.from(overlay.querySelectorAll('.free-up'));
      cardEls.forEach((b) => b.addEventListener('click', () => {
        if (b.disabled) return;
        cardEls.forEach((x) => { x.disabled = true; });
        freeUpgrade.onPick(freeUpgrade.options[+b.dataset.idx].key);
      }));
    }
  },

  /** 코어루프 사람 플레이 선택창 (전면개편 §5.1: 시작 무기·행동 변화·두 번째 무기·프레임). 게임 정지. */
  showCoreLoopPick({ title, subtitle = '', options, onPick }) {
    clearNav();
    const cards = options.map((o, i) => `
      <button class="draft-card" data-idx="${i}" style="border-color:${o.color || '#3ff5e0'}">
        <div class="card-icon">${o.icon || ''}</div>
        <div class="card-label" style="color:${o.color || '#eaf4ff'}">${o.label}</div>
        <div class="card-desc">${o.desc || ''}</div>
      </button>`).join('');
    panel(`
      <h2 style="color:#3ff5e0;font-size:19px">${title}</h2>
      ${subtitle ? `<p style="color:#9fb8d8;font-size:13px;margin-top:2px">${subtitle}</p>` : ''}
      <div class="draft-row">${cards}</div>
    `);
    const btns = Array.from(overlay.querySelectorAll('.draft-card'));
    const pickBtn = (b) => { const idx = +b.dataset.idx; onPick(options[idx].id, idx); };   // attachKeyNav은 '버튼 요소'를 넘김 → data-idx로 인덱스 복원(Codex 홀리스틱: 키보드 확정 예외로 캠페인 정지 방지)
    btns.forEach((b) => b.addEventListener('click', () => pickBtn(b)));
    attachKeyNav(btns, pickBtn);
  },

  /** 8분 결과 화면 (전면개편 §5.9). 시작→최종 함체, 무기 2·공명, 피해 비율, 내구도, 다음 설계도 실루엣. */
  showCoreLoopResult({ snap, build, startHull, hull, hullMax, startTier, tier, tierNames, mainWeapon, wingWeapon, weaponLabels, resonanceName, onSame, onNew }) {
    const wl = (w) => (w ? (weaponLabels[w] || w) : '—');
    const dmgW = snap.damageByWeapon || {}, dmgR = snap.damageByResonance || {};
    const total = Object.values(dmgW).reduce((a, b) => a + b, 0) + Object.values(dmgR).reduce((a, b) => a + b, 0) || 1;
    const pct = (v) => Math.round((v / total) * 100);
    const bar = (label, v, color) => `
      <div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:13px">
        <span style="min-width:120px;text-align:right;color:#bcd">${label}</span>
        <span style="flex:1;height:12px;background:#0d1424;border-radius:6px;overflow:hidden">
          <span style="display:block;height:100%;width:${pct(v)}%;background:${color}"></span></span>
        <b style="min-width:38px;color:${color}">${pct(v)}%</b></div>`;
    const rows = [
      dmgW.vulcan ? bar('발칸', dmgW.vulcan, '#ffd36b') : '',
      dmgW.laser ? bar('레이저', dmgW.laser, '#5cc8ff') : '',
      dmgW.homing ? bar('유도 미사일', dmgW.homing, '#c8ff6b') : '',
      dmgW.sideGun ? bar('측면 포대', dmgW.sideGun, '#ffb84d') : '',   // 함체 T4+ 기능(총합에 포함되므로 행도 렌더 → 100% 정합, Codex 3차 P2)
      dmgW.apex ? bar('에이펙스 펄스', dmgW.apex, '#ffe17a') : '',      // 함체 T5 Apex(총합 정합)
      dmgW.fleet ? bar('함대·전투기', dmgW.fleet, '#7dffb0') : '',      // §7.2 세 번째 슬롯 함대 시스템(결과 통계 구분)
      dmgR.railStorm ? bar('공명·레일 스톰', dmgR.railStorm, '#9fe8ff') : '',
      dmgR.microMissile ? bar('공명·미사일 포화', dmgR.microMissile, '#ffb0e0') : '',
      dmgR.seekerBeam ? bar('공명·시커 빔', dmgR.seekerBeam, '#b0ffd0') : '',
    ].join('');
    const resShare = Math.round((snap.resonanceShare || 0) * 100);
    const ttk = snap.bossTtkSec != null ? `${snap.bossTtkSec}초` : '—';
    panel(`
      <h2 style="color:#3ff5e0">8분 핵심 재미 결과</h2>
      <p class="big" style="font-size:16px">${build.label}</p>
      <div style="text-align:left;max-width:420px;margin:8px auto;line-height:1.7;font-size:14px">
        <div>함체 <b>${tierNames[startTier]}</b> → <b style="color:#ffd93d">${tierNames[Math.min(tier, tierNames.length - 1)]}</b></div>
        <div>무기 <b>${wl(mainWeapon)}</b> + <b>${wl(wingWeapon)}</b> · 공명 <b style="color:#9fe8ff">${resonanceName}</b></div>
        <div>기함 내구도 <b>${Math.round(hull)}</b> / ${hullMax} <span style="color:#ff8a8a">(받은 피해 ${Math.round(snap.hullDamageTaken || 0)})</span></div>
        <div>순양함 격침 <b>${snap.cruiserLosses || 0}</b>척 · 긴급 재건 <b>${snap.emergencyRebuilds || 0}</b>회</div>
        <div>검증 보스 B22 TTK <b>${ttk}</b> · 공명 기여도 <b>${resShare}%</b></div>
      </div>
      <div style="margin:10px 0 4px;color:#8fb4d8;font-size:12px">피해 비율</div>
      <div style="max-width:420px;margin:0 auto 10px">${rows}</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin:8px 0;color:#7f93b0;font-size:12px">
        <span style="font-size:26px;filter:blur(1px);opacity:.5">🛰️</span> 다음 설계도: <b style="letter-spacing:3px">? ? ?</b>
      </div>
      <div class="btn-row">
        <button id="btn-cl-same">같은 조합 다시</button>
        <button id="btn-cl-new" class="sub-btn">새 조합 시도</button>
      </div>
    `);
    document.getElementById('btn-cl-same').addEventListener('click', onSame);
    document.getElementById('btn-cl-new').addEventListener('click', onNew);
  },

  /** 25분 캠페인 전용 결과(§7.6): 6지역 보스 TTK 표 + Gate 2 시스템(함체 T5·함대·경로·정예·공명) 요약 + 피해 비율. */
  showCampaign25Result({ reason, regionResults, regions, build, finalTier, tierNames, fleetActive, fleetLabel, pathChoicesMade, eliteWavesFired, resonanceName, hull, hullMax, damageByWeapon, damageByResonance, weaponLabels, onSame, onNew }) {
    const cleared = reason === 'clear';
    const dmgW = damageByWeapon || {}, dmgR = damageByResonance || {};
    const total = Object.values(dmgW).reduce((a, b) => a + b, 0) + Object.values(dmgR).reduce((a, b) => a + b, 0) || 1;
    const pct = (v) => Math.round((v / total) * 100);
    const bar = (label, v, color) => (v ? `
      <div style="display:flex;align-items:center;gap:8px;margin:2px 0;font-size:12px">
        <span style="min-width:104px;text-align:right;color:#bcd">${label}</span>
        <span style="flex:1;height:10px;background:#0d1424;border-radius:5px;overflow:hidden"><span style="display:block;height:100%;width:${pct(v)}%;background:${color}"></span></span>
        <b style="min-width:34px;color:${color}">${pct(v)}%</b></div>` : '');
    const dmgRows = [
      bar('발칸', dmgW.vulcan, '#ffd36b'), bar('레이저', dmgW.laser, '#5cc8ff'), bar('유도 미사일', dmgW.homing, '#c8ff6b'),
      bar('측면 포대', dmgW.sideGun, '#ffb84d'), bar('에이펙스', dmgW.apex, '#ffe17a'), bar('함대·전투기', dmgW.fleet, '#7dffb0'),
      bar('공명·레일 스톰', dmgR.railStorm, '#9fe8ff'), bar('공명·미사일 포화', dmgR.microMissile, '#ffb0e0'), bar('공명·시커 빔', dmgR.seekerBeam, '#b0ffd0'),
    ].join('');
    const rows = regions.map((rg) => {
      const res = (regionResults || []).find((x) => x.region === rg.i);
      const ttk = res && res.ttk != null ? `${res.ttk}초` : '—';
      const killed = res && res.killed;
      return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:${killed ? '#dff0ff' : '#7f93b0'}">
        <span>${rg.i}. ${rg.name} <b style="color:#9fb8d8">${rg.boss}</b></span><b style="color:${killed ? '#7dffb0' : '#ff8a8a'}">${ttk}</b></div>`;
    }).join('');
    panel(`
      <h2 style="color:${cleared ? '#7dffb0' : '#ff8a8a'}">${cleared ? '은하 해방 · 25분 완주' : '작전 종료'}</h2>
      <p class="big" style="font-size:15px">${build.label}</p>
      <div style="text-align:left;max-width:440px;margin:8px auto;line-height:1.6;font-size:13px">
        <div>함체 <b style="color:#ffd93d">${tierNames[Math.min(finalTier, tierNames.length - 1)]}</b> · 함대 <b style="color:#7dffb0">${fleetActive ? fleetLabel : '미전개'}</b> · 공명 <b style="color:#9fe8ff">${resonanceName}</b></div>
        <div>경로 선택 <b>${pathChoicesMade || 0}</b>회 · 정예 웨이브 <b>${eliteWavesFired || 0}</b>회 · 기함 내구도 <b>${Math.round(hull)}</b>/${hullMax}</div>
      </div>
      <div style="margin:8px 0 3px;color:#8fb4d8;font-size:12px">지역 보스 TTK</div>
      <div style="max-width:440px;margin:0 auto 8px">${rows}</div>
      <div style="margin:8px 0 3px;color:#8fb4d8;font-size:12px">피해 비율</div>
      <div style="max-width:440px;margin:0 auto 10px">${dmgRows}</div>
      <div class="btn-row">
        <button id="btn-c25-same">같은 조합 다시</button>
        <button id="btn-c25-new" class="sub-btn">새 조합 시도</button>
      </div>
    `);
    document.getElementById('btn-c25-same').addEventListener('click', onSame);
    document.getElementById('btn-c25-new').addEventListener('click', onNew);
  },

  /** 진화 모듈 드래프트: 3장 중 택1 (게임 일시 정지 중) */
  showDraft({ options, owned = [], onPick, lang = 'ko' }) {
    const RARE = { common: '#3ff5e0', rare: '#ffd93d' };
    const cards = options.map((id) => {
      const m = MODULE_BY_ID[id];
      const en = lang === 'en' ? MODULE_EN[id] : null;
      const name = en?.[0] || m.name;
      const desc = en?.[1] || m.desc;
      const have = owned.find((o) => o.id === id);
      return `
        <button class="draft-card" data-id="${id}" style="flex:1;min-width:92px;max-width:130px;padding:12px 6px;border:2px solid ${RARE[m.rarity]};background:rgba(255,255,255,0.05);border-radius:12px;display:flex;flex-direction:column;gap:5px;align-items:center;cursor:pointer">
          <div style="font-size:30px;line-height:1">${m.icon}</div>
          <div style="font-weight:bold;font-size:13px;color:${RARE[m.rarity]}">${name}${have ? ` ×${have.count}` : ''}</div>
          <div style="font-size:10.5px;color:#9fb8d8;line-height:1.3">${desc}</div>
        </button>`;
    }).join('');
    const ownedRow = owned.length
      ? `<p style="font-size:15px;letter-spacing:2px;margin-top:8px;opacity:0.85">${owned.map((o) => o.icon + (o.count > 1 ? o.count : '')).join(' ')}</p>` : '';
    panel(`
      <h2 style="color:#ffd93d">${lang === 'en' ? 'Choose a combat module' : '전투 모듈 선택'}</h2>
      <p><small>${lang === 'en' ? 'Pick one. Its effect lasts for this run, and duplicate modules stack.' : '1개를 선택하세요. 효과는 이번 출격 동안 유지되며 같은 모듈은 중첩됩니다.'}</small></p>
      <div style="display:flex;gap:8px;justify-content:center;margin:12px 0;flex-wrap:wrap">${cards}</div>
      ${ownedRow}
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:8px">${lang === 'en' ? '🖱 Click to choose · ⌨ ←→ move · Space to confirm' : '🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정'}</p>
    `);
    overlay.querySelectorAll('.draft-card').forEach((b) => {
      b.addEventListener('click', () => onPick(b.dataset.id));
    });
    attachKeyNav(overlay.querySelectorAll('.draft-card'), (b) => onPick(b.dataset.id));
  },

  /** 무기 진화 2택 (Lv3 후 같은 색 캡슐). 게임 일시 정지. */
  showWeaponEvolution({ weapon, options, onPick, tier = 1, repick = false, lang = 'ko' }) {
    const col = WEAPON_COLORS[weapon] || '#3ff5e0';
    const cards = options.map((o) => {
      const en = lang === 'en' ? EVOLUTION_EN[o.id] : null;
      const name = en?.[0] || o.name, shape = en?.[1] || o.shape, pro = en?.[2] || o.pro, con = en ? en[3] : o.con;
      return `
        <button class="evo-card" data-id="${o.id}" aria-label="${name}: ${shape}" style="flex:1;min-width:120px;max-width:180px;padding:14px 10px;border:2px solid ${col};background:rgba(255,255,255,0.05);border-radius:14px;display:flex;flex-direction:column;gap:6px;align-items:center;cursor:pointer">
          <div style="font-weight:bold;font-size:15px;color:${col}">${name}</div>
          <div style="font-size:12px;color:#dfe9ff;line-height:1.3">${shape}</div>
          <div style="font-size:11px;color:#7cff9c">▲ ${pro}</div>
          ${con ? `<div style="font-size:11px;color:#ff9c9c">▼ ${con}</div>` : ''}
        </button>`;
    }).join('');
    const weaponName = lang === 'en' ? ({ vulcan: 'Vulcan', laser: 'Laser', homing: 'Homing Missiles' }[weapon] || 'Weapon') : (WEAPON_LABELS[weapon] || '무기');
    const title = lang === 'en'
      ? `${weaponName} ${tier === 2 ? 'super evolution' : 'evolution'}`
      : tier === 2 ? `${weaponName} 초진화 선택` : `${weaponName} 진화 선택`;
    const sub = lang === 'en'
      ? (repick ? 'Choose a new super evolution. It replaces the current one.'
        : tier === 2 ? 'Pick one super evolution for a major behavior upgrade.' : 'Pick one evolution. It changes this weapon for the rest of the run.')
      : repick ? '초진화형을 다시 선택할 수 있습니다. 기존 효과는 새 효과로 교체됩니다.'
        : tier === 2 ? '초진화형 1개를 선택하세요. 진화 무기의 특성이 크게 강화됩니다.'
          : '진화형 1개를 선택하세요. 공격 방식이 바뀌며 이번 출격 동안 유지됩니다.';
    panel(`
      <h2 style="color:${col}">${title}</h2>
      <p><small>${sub}</small></p>
      <div style="display:flex;gap:12px;justify-content:center;margin:14px 0;flex-wrap:wrap">${cards}</div>
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:6px">${lang === 'en' ? '🖱 Click to choose · ⌨ ←→ move · Space to confirm' : '🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정'}</p>
    `);
    overlay.querySelectorAll('.evo-card').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
    attachKeyNav(overlay.querySelectorAll('.evo-card'), (b) => onPick(b.dataset.id));
  },

  /** 기함 교리 3택 (첫 업그레이드 1회). 게임 일시 정지. */
  showDoctrineDraft({ options, onPick, lang = 'ko' }) {
    const cards = options.map((d) => {
      const en = lang === 'en' ? DOCTRINE_EN[d.id] : null;
      const name = en?.[0] || d.name, desc = en?.[1] || d.desc;
      return `
        <button class="doc-card" data-id="${d.id}" aria-label="${name}: ${desc}" style="flex:1;min-width:108px;max-width:160px;padding:14px 8px;border:2px solid #ffd93d;background:rgba(255,255,255,0.05);border-radius:14px;display:flex;flex-direction:column;gap:6px;align-items:center;cursor:pointer">
          <div style="font-size:30px;line-height:1">${d.icon}</div>
          <div style="font-weight:bold;font-size:14px;color:#ffd93d">${name}</div>
          <div style="font-size:11px;color:#dfe9ff;line-height:1.3">${desc}</div>
        </button>`;
    }).join('');
    panel(`
      <h2 style="color:#ffd93d">${lang === 'en' ? 'Choose a fleet doctrine' : '함대 전투 스타일 선택'}</h2>
      <p><small>${lang === 'en' ? 'This sets the growth direction for this run. Choose once.' : '이번 출격의 성장 방향입니다. 한 번만 선택하며 기함 등급이 내려가도 유지됩니다.'}</small></p>
      <div style="display:flex;gap:10px;justify-content:center;margin:14px 0;flex-wrap:wrap">${cards}</div>
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:6px">${lang === 'en' ? '🖱 Click to choose · ⌨ ←→ move · Space to confirm' : '🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정'}</p>
    `);
    overlay.querySelectorAll('.doc-card').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
    attachKeyNav(overlay.querySelectorAll('.doc-card'), (b) => onPick(b.dataset.id));
  },

  /** 키스톤 3택 (첫 섹터 보스 후 1회). 각 카드에 행동 변화·장점·대가 명시. 게임 일시 정지. */
  showKeystoneDraft({ options, onPick, sector = 1, lang = 'ko' }) {
    const cards = options.map((k) => {
      const en = lang === 'en' ? KEYSTONE_EN[k.id] : null;
      const name = en?.[0] || k.name, change = en?.[1] || k.change, pro = en?.[2] || k.pro, con = en?.[3] || k.con;
      return `
        <button class="ks-card" data-id="${k.id}" aria-label="${name}: ${change}" style="flex:1;min-width:110px;max-width:170px;padding:14px 9px;border:2px solid #b44cff;background:rgba(255,255,255,0.05);border-radius:14px;display:flex;flex-direction:column;gap:6px;align-items:center;cursor:pointer">
          <div style="font-size:30px;line-height:1">${k.icon}</div>
          <div style="font-weight:bold;font-size:14px;color:#d9b3ff">${name}</div>
          <div style="font-size:11px;color:#dfe9ff;line-height:1.3">${change}</div>
          <div style="font-size:11px;color:#7cff9c">▲ ${pro}</div>
          <div style="font-size:11px;color:#ff9c9c">${lang === 'en' ? 'Cost' : '대가'}: ${con}</div>
        </button>`;
    }).join('');
    panel(`
      <div style="font-size:13px;color:#ffd93d;font-weight:bold;margin-bottom:4px">${lang === 'en' ? `🏆 Sector ${sector} boss defeated!` : `🏆 섹터 ${sector} 보스 격파!`}</div>
      <h2 style="color:#b44cff;margin-top:0">${lang === 'en' ? 'Choose a keystone' : '핵심 특성 선택'}</h2>
      <p><small>${lang === 'en' ? 'Each keystone has a powerful effect and a cost. Pick <b>one</b> for this run.' : '강력한 효과와 대가가 함께 있는 특성입니다. 이번 출격에서 <b>1개만</b> 선택하며 끝까지 유지됩니다.'}</small></p>
      <div style="display:flex;gap:10px;justify-content:center;margin:14px 0;flex-wrap:wrap">${cards}</div>
      <p style="font-size:10.5px;color:#9fb8d8;margin-top:6px">${lang === 'en' ? '🖱 Click to choose · ⌨ ←→ move · Space to confirm' : '🖱 클릭 선택 · ⌨ ←→ 이동 · Space 확정'}</p>
    `);
    overlay.querySelectorAll('.ks-card').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
    attachKeyNav(overlay.querySelectorAll('.ks-card'), (b) => onPick(b.dataset.id));
  },

  /** 정비 노드: 긴급 수리 vs 모듈 정비(유료) 택1 (§5.5). 버튼은 라벨만 표기(이사). */
  showRepair({ cost, coins, canAfford, onHeal, onModule, lang = 'ko' }) {
    panel(`
      <h2 style="color:#7cff6b">${lang === 'en' ? '🔧 Repair node' : '🔧 정비 노드'}</h2>
      <p><small>${lang === 'en' ? `Choose one. Coins 🪙 ${coins.toLocaleString()}` : `하나만 선택할 수 있습니다. 보유 코인 🪙 ${coins.toLocaleString()}`}</small></p>
      <div class="btn-row" style="flex-direction:column;gap:10px;align-items:stretch;width:300px;max-width:82vw;margin:14px auto 0">
        ${lang === 'en'
          ? '<button id="btn-repair-heal" class="repair-btn">🩹 Emergency repair</button>'
          : '<button id="btn-repair-heal" class="repair-btn">🩹 긴급 수리</button>'}
        ${lang === 'en'
          ? `<button id="btn-repair-mod" class="repair-btn"${canAfford ? '' : ' disabled style="opacity:0.5;cursor:not-allowed"'}>🧩 Service a module</button>`
          : `<button id="btn-repair-mod" class="repair-btn"${canAfford ? '' : ' disabled style="opacity:0.5;cursor:not-allowed"'}>🧩 모듈 정비</button>`}
      </div>
      ${canAfford ? '' : `<p style="color:#ff9c41;font-size:11px">${lang === 'en' ? `You need ${(cost - coins).toLocaleString()} more coins for module service.` : `모듈 정비에 코인이 ${(cost - coins).toLocaleString()} 부족합니다.`}</p>`}
    `);
    document.getElementById('btn-repair-heal').addEventListener('click', onHeal);
    const mb = document.getElementById('btn-repair-mod');
    if (canAfford) mb.addEventListener('click', onModule);
  },

  /** 긴급 수리 세부: 기함 내구도가 손상됐을 때 [기함 내구도 수리] vs [드론 보충] 택1 (이사). */
  showEmergencyRepair({ hullPct, drones, onHull, onDrone, onBack, lang = 'ko' }) {
    panel(`
      <h2 style="color:#7cff6b">${lang === 'en' ? '🩹 Emergency repair' : '🩹 긴급 수리'}</h2>
      <p><small>${lang === 'en' ? `Flagship hull is at <b style="color:#ff9c41">${hullPct}%</b>. Choose one.` : `기함 내구도가 손상되었습니다 · 현재 <b style="color:#ff9c41">${hullPct}%</b>. 하나를 선택하세요.`}</small></p>
      <div class="btn-row" style="flex-direction:column;gap:10px;align-items:stretch;width:300px;max-width:82vw;margin:14px auto 0">
        <button id="btn-em-hull" class="repair-btn">${lang === 'en' ? '🛠️ Repair flagship hull' : '🛠️ 기함 내구도 수리'}</button>
        <button id="btn-em-drone" class="repair-btn">${lang === 'en' ? `🚀 Reinforce drones · +${drones}` : `🚀 드론 보충 · +${drones}`}</button>
        ${onBack ? `<button id="btn-em-back" class="repair-btn sub-btn">${lang === 'en' ? '← Back' : '← 뒤로'}</button>` : ''}
      </div>
    `);
    document.getElementById('btn-em-hull').addEventListener('click', onHull);
    document.getElementById('btn-em-drone').addEventListener('click', onDrone);
    if (onBack) document.getElementById('btn-em-back').addEventListener('click', onBack);
  },

  /** 섹터 분기 맵: 갈림길에서 다음 노드를 고른다 (게임 일시 정지) */
  showSectorMap({ map, currentId = null, doneIds = [], sector, coins = 0, onPick, lang = 'ko' }) {
    const META = {
      combat: { icon: '⚔️', label: '전투', color: '#ff6b6b' },
      elite: { icon: '☠️', label: '정예 전투', color: '#ff4cd2' },
      hazard: { icon: '☄️', label: '위험 지역', color: '#ff9c41' },
      supply: { icon: '💎', label: '보급', color: '#6fe3ff' },
      repair: { icon: '🔧', label: '수리', color: '#7cff6b' },
      boss: { icon: '👑', label: '보스', color: '#ffd93d' },
    };
    // 노드 보상·위험 요약(정보 영역·접근 가능 이름·툴팁 공용). 지도 토폴로지·보상 수치는 바꾸지 않는다.
    const REWARD = {
      combat: '코인 보통 · 모듈 3택',
      supply: '드론 다수 · 구간 짧음',
      hazard: '코인 +20% · 모듈 3택',
      elite: '코인 +80% · 모듈 4택(희귀 보장)',
      repair: '긴급 수리 또는 유료 모듈 정비',
      boss: '섹터 보스 — 돌파 시 다음 섹터',
    };
    // Prolific 첫인상 테스트 영어 표기(작업지시서 §4.3). 지도 로직·보상 수치는 그대로.
    const META_EN = { combat: 'Combat', elite: 'Elite combat', hazard: 'Hazard', supply: 'Supply', repair: 'Repair', boss: 'Boss' };
    const REWARD_EN = {
      combat: 'Coins · pick 1 of 3 modules', supply: 'Drones · short leg',
      hazard: '+20% coins · pick 1 of 3', elite: '+80% coins · pick 1 of 4 (rare guaranteed)',
      repair: 'Emergency repair or paid module service', boss: 'Sector boss — clear to advance',
    };
    const nlabel = (t) => (lang === 'en' ? (META_EN[t] || META[t].label) : META[t].label);
    const nreward = (t) => (lang === 'en' ? (REWARD_EN[t] || '') : (REWARD[t] || ''));
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
    // 접근 가능한 이름: 같은 종류 노드가 여럿이어도 열·순번으로 고유해야 한다(P0-D §6.3).
    //  reach 배열 순서를 좌→우로 정렬해 'N번째'가 화면 순서와 일치하게 한다.
    const reachOrder = reach.slice().sort((a, b) => pos(a).x - pos(b).x);
    const ariaFor = (node) => {
      const m = META[node.type];
      const ord = reachOrder.indexOf(node) + 1;
      if (lang === 'en') return `${nlabel(node.type)}, route ${ord} in column ${node.col + 1}, ${nreward(node.type)}`;
      return `${m.label}, ${node.col + 1}열 ${ord}번째 항로, ${REWARD[node.type] || ''}`;
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
      const st = `box-sizing:border-box;appearance:none;-webkit-appearance:none;padding:0;margin:0;position:absolute;left:${p.x - 22}px;top:${p.y - 22}px;width:44px;height:44px;border-radius:50%;border:2px solid ${bd};background:rgba(10,16,28,0.9);font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:${op};${glow}${isReach ? 'cursor:pointer' : 'cursor:default'}`;
      nodes += isReach
        ? `<button class="map-node" data-node="${node.id}" data-id="${node.id}" style="${st}" title="${nlabel(node.type)}" aria-pressed="false" aria-label="${ariaFor(node)}">${m.icon}</button>`
        : `<div class="map-node" data-id="${node.id}" style="${st}" title="${nlabel(node.type)}" aria-label="${nlabel(node.type)}">${m.icon}</div>`;
    }
    const legend = Object.entries(META).map(([t, m]) => `<span style="white-space:nowrap">${m.icon}${nlabel(t)}</span>`).join(' · ');
    // 터치·펜 등 coarse pointer 환경에서만 확정 버튼·2단계 안내를 노출한다(데스크톱은 1클릭 확정 유지).
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const en = lang === 'en';
    const guide = en
      ? (coarse
        ? '👆 Tap a route to select, then tap again or use the button to confirm.'
        : '🖱 Click to advance · hover for details · ⌨ ←→ move · Enter to confirm')
      : (coarse
        ? '👆 항로를 탭해 선택하고, 다시 탭하거나 아래 버튼으로 확정하세요.'
        : '🖱 클릭으로 진격 · 마우스오버 설명 · ⌨ ←→ 이동 · Enter 확정');
    const T = en
      ? { head: `Sector ${sector} · Choose your route`, sub: 'Pick a glowing point to advance. The top point is the sector boss.', info: 'Choose a route.', confirmAria: 'Advance along the selected route', confirmLabel: 'Advance this route ▶', coins: 'Coins' }
      : { head: `섹터 ${sector} · 항로 선택`, sub: '빛나는 지점을 선택해 진격하세요. 맨 위 지점은 섹터 보스입니다.', info: '항로를 선택하세요.', confirmAria: '선택한 항로로 진격', confirmLabel: '이 항로로 진격 ▶', coins: '보유 코인' };
    panel(`
      <h2 style="color:#3ff5e0">${T.head}</h2>
      <p><small>${T.sub}</small></p>
      <div style="position:relative;width:${W}px;height:${H}px;margin:6px auto">
        <svg width="${W}" height="${H}" style="position:absolute;left:0;top:0;pointer-events:none">${lines}</svg>
        ${nodes}
        <div id="map-tip" style="position:absolute;display:none;transform:translate(-50%,-100%);font-size:13px;font-weight:600;line-height:1.3;color:#eaf3ff;background:rgba(4,8,16,0.96);border:1px solid #3ff5e0;border-radius:8px;padding:6px 11px;white-space:nowrap;pointer-events:none;z-index:20;box-shadow:0 4px 16px rgba(0,0,0,0.6)"></div>
      </div>
      <div id="map-info" aria-live="polite" style="min-height:34px;margin:4px auto 2px;max-width:280px;padding:7px 10px;border:1px solid rgba(120,200,255,0.22);border-radius:8px;background:rgba(8,14,26,0.7);font-size:12.5px;line-height:1.45;color:#cfe4ff">${T.info}</div>
      <button id="map-confirm" disabled style="display:${coarse ? 'block' : 'none'};width:230px;max-width:78vw;margin:8px auto 0;border-radius:8px" aria-label="${T.confirmAria}">${T.confirmLabel}</button>
      <p style="font-size:10.5px;color:#9fb8d8;line-height:1.6">${legend}</p>
      <p style="font-size:10.5px;color:#9fb8d8">${guide} &nbsp; ${T.coins} 🪙 ${coins.toLocaleString()}</p>
    `);
    const tip = overlay.querySelector('#map-tip');
    const info = overlay.querySelector('#map-info');
    const confirmBtn = overlay.querySelector('#map-confirm');
    const infoText = (node) => `${META[node.type].icon} ${nlabel(node.type)} — ${nreward(node.type)}`;

    let selectedId = null;      // 터치 1단계 선택(미확정)
    let confirmed = false;      // onPick 1회 가드 (두 번째 탭·확정 버튼 동시 입력 방어)
    const confirmPick = (node, method) => { if (confirmed || !node) return; confirmed = true; onPick(node, method); };
    const selectNode = (node) => {
      selectedId = node.id;
      overlay.querySelectorAll('.map-node[data-node]').forEach((b) => {
        const on = +b.dataset.node === node.id;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.style.boxShadow = on ? '0 0 16px #ffd93d, 0 0 6px #ffd93d' : '0 0 12px #3ff5e0';
        b.style.borderColor = on ? '#ffd93d' : '#3ff5e0';
      });
      info.textContent = infoText(node);
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.setAttribute('aria-label', `${ariaFor(node)} — ${en ? 'advance' : '진격'}`); }
    };

    // 마우스 오버·키보드 포커스: 툴팁 + 정보 영역 갱신(선택 확정과 무관한 미리보기)
    overlay.querySelectorAll('.map-node').forEach((el) => {
      const node = idToNode[+el.dataset.id]; if (!node) return;
      const p = pos(node);
      const show = () => {
        tip.textContent = infoText(node);
        tip.style.left = Math.max(84, Math.min(W - 84, p.x)) + 'px';
        tip.style.top = (p.y - 26) + 'px';
        tip.style.display = 'block';
        if (reachIds.has(node.id)) info.textContent = infoText(node);
      };
      const hide = () => { tip.style.display = 'none'; };
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', show);
      el.addEventListener('blur', hide);
    });

    // 노드 확정 경로:
    //  - 마우스 클릭: 즉시 확정 (기존 데스크톱 동작)
    //  - 터치(coarse) 탭: 첫 탭=선택+설명, 같은 노드 두 번째 탭=확정, 다른 노드 탭=선택만 변경
    //  - 키보드 Enter/Space: attachKeyNav가 확정(아래) — click은 e.detail===0으로 걸러 2단계로 새지 않게 한다
    overlay.querySelectorAll('[data-node]').forEach((b) => {
      const node = idToNode[+b.dataset.node];
      let lastPT = '';
      b.addEventListener('pointerdown', (e) => { lastPT = e.pointerType; });
      b.addEventListener('click', (e) => {
        if (e.detail === 0) return;   // 키보드가 유발한 click — attachKeyNav가 처리
        const touch = lastPT === 'touch' || (lastPT === '' && coarse);
        lastPT = '';
        if (touch) { if (selectedId === node.id) confirmPick(node, 'touch_confirm'); else selectNode(node); }
        else confirmPick(node, 'pointer_confirm');
      });
    });
    if (confirmBtn) confirmBtn.addEventListener('click', () => { if (selectedId != null) confirmPick(idToNode[selectedId], 'touch_confirm'); });
    // 키보드: Enter/Space는 attachKeyNav가 onConfirm으로 직접 확정(click 미경유) → 항상 1회 확정
    attachKeyNav(overlay.querySelectorAll('[data-node]'), (b) => confirmPick(idToNode[+b.dataset.node], 'keyboard_confirm'));
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

  // ─── 개인정보 동의 UI(작업지시서 §9). overlay 패널이 아니라 #stage 위 별도 요소로 그려
  //     타이틀 시작 버튼을 막지 않고, 전투 중엔 숨긴다. gtag를 직접 부르지 않고 콜백만 전달한다.
  showConsentBanner({ onAllow, onDeny, onDetails }) {
    let el = document.getElementById('nf-consent');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nf-consent';
      el.className = 'nf-consent';
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', '익명 플레이 데이터 수집 동의');
      document.getElementById('stage').appendChild(el);
    }
    el.innerHTML = `
      <div class="nf-consent-inner">
        <p class="nf-consent-title">익명 플레이 데이터</p>
        <p class="nf-consent-body">게임을 더 재미있게 개선하기 위해 출격·선택·진행 정보를 수집할 수 있습니다. 이름·이메일 같은 직접 식별정보는 보내지 않습니다.</p>
        <div class="nf-consent-btns">
          <button id="nf-consent-allow">익명 데이터 허용</button>
          <button id="nf-consent-deny" class="sub-btn">허용 안 함</button>
          <button id="nf-consent-details" class="link-btn">수집 항목 보기</button>
        </div>
      </div>`;
    el.classList.remove('hidden');
    el.querySelector('#nf-consent-allow').addEventListener('click', (e) => { e.stopPropagation(); onAllow(); });
    el.querySelector('#nf-consent-deny').addEventListener('click', (e) => { e.stopPropagation(); onDeny(); });
    el.querySelector('#nf-consent-details').addEventListener('click', (e) => { e.stopPropagation(); onDetails && onDetails(); });
  },
  hideConsentBanner() {
    const el = document.getElementById('nf-consent');
    if (el) el.classList.add('hidden');
  },

  /** 수집 항목 안내(작업지시서 §9.5). 무엇을 왜 보내는지·철회 방법을 명시. */
  showConsentDetails({ onAllow, onDeny, onClose }) {
    let el = document.getElementById('nf-consent-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nf-consent-modal';
      el.className = 'nf-consent-modal';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', '수집 항목 안내');
      document.getElementById('stage').appendChild(el);
    }
    el.innerHTML = `
      <div class="nf-consent-card">
        <h2>익명 플레이 데이터 수집 안내</h2>
        <p class="nf-consent-purpose">수집 목적: 어디서 이탈하는지, 다시 출격하는지, 어떤 빌드를 고르는지 파악해 게임을 개선합니다.</p>
        <ul class="nf-consent-list">
          <li>출격·전투 진입·섹터 진행(어디까지 갔는지)</li>
          <li>교리·키스톤·무기 진화 등 빌드 선택 종류</li>
          <li>사망 원인·도달 섹터·재출격 여부</li>
          <li>모바일/데스크톱 구분, 세션 내 몇 번째 출격인지</li>
        </ul>
        <p class="nf-consent-note">보내지 <b>않는</b> 것: 이름·이메일·연락처 같은 직접 식별정보, 전체 URL·쿠키·기기 지문.</p>
        <p class="nf-consent-note">Google Analytics(GA4)로 처리되며, Google이 브라우저·기기·네트워크 정보를 처리할 수 있습니다. 데이터는 일정 기간 후 삭제되고, ⚙ 설정에서 언제든 철회할 수 있습니다.</p>
        <div class="nf-consent-btns">
          <button id="nf-consent-modal-allow">익명 데이터 허용</button>
          <button id="nf-consent-modal-deny" class="sub-btn">허용 안 함</button>
          <button id="nf-consent-modal-close" class="link-btn">닫기</button>
        </div>
      </div>`;
    el.classList.remove('hidden');
    el.querySelector('#nf-consent-modal-allow').addEventListener('click', (e) => { e.stopPropagation(); onAllow(); });
    el.querySelector('#nf-consent-modal-deny').addEventListener('click', (e) => { e.stopPropagation(); onDeny(); });
    el.querySelector('#nf-consent-modal-close').addEventListener('click', (e) => { e.stopPropagation(); onClose && onClose(); });
  },
  hideConsentDetails() {
    const el = document.getElementById('nf-consent-modal');
    if (el) el.classList.add('hidden');
  },

  // ─── Prolific 첫인상 테스트 전용 화면(작업지시서 §4·§5). 모두 영어. gtag를 직접 부르지 않고 콜백만 전달한다. ───

  /** 영어 시작 화면 + 익명 데이터 동의(§4.1). 동의는 여기서 결정한다. */
  showPlaytestIntro({ onAgree, onDecline }) {
    panel(`
      <div class="title-mark">
        <div class="title-words">
          <span class="tw-neon">NEON</span><span class="tw-fleet">FLEET</span>
          <span class="tw-tag">4-MINUTE PLAYTEST</span>
        </div>
      </div>
      <h2 style="margin:6px 0 2px">NEON FLEET — 4-Minute Playtest</h2>
      <ul style="text-align:left;max-width:340px;margin:8px auto;font-size:13px;line-height:1.6;color:#dbe8ff">
        <li>A browser arcade roguelite — no download and no account required.</li>
        <li>Play for up to 4 minutes, then answer 5 short questions.</li>
        <li>Use a desktop/laptop keyboard or mouse.</li>
      </ul>
      <div style="max-width:340px;margin:10px auto;padding:9px 11px;border:1px solid rgba(120,200,255,0.22);border-radius:8px;background:rgba(8,14,26,0.6);font-size:12px;line-height:1.55;color:#cfe4ff">
        <p style="margin:0 0 4px"><b>Anonymous data</b> — with your consent we record gameplay progress, choices, device group, and your categorical survey answers.</p>
        <p style="margin:0">We never send your name, email, typed free text, full URL, cookie, device fingerprint, or Prolific ID.</p>
      </div>
      <div class="btn-row" style="flex-direction:column;gap:10px;align-items:stretch">
        <button id="pt-agree" aria-label="I agree and start the playtest">I agree — Start</button>
        <button id="pt-decline" class="sub-btn" aria-label="I do not agree">I do not agree</button>
      </div>
    `, 'title-screen');
    document.getElementById('pt-agree').addEventListener('click', onAgree);
    document.getElementById('pt-decline').addEventListener('click', onDecline);
  },

  /**
   * 5문항 설문(§5). 자유 입력 없음. onSubmit(answers)→{ok,missing}를 받아 누락을 표시한다.
   * 성공 시 상위(main)가 완료 흐름을 처리하므로 여기서는 제출 버튼만 잠근다(중복 방지 보강).
   */
  showPlaytestSurvey({ onSubmit }) {
    const scale = [1, 2, 3, 4, 5];
    const rating = (name, label) => `
      <fieldset class="pt-q" data-group="${name}" style="border:1px solid rgba(120,200,255,0.22);border-radius:8px;margin:8px 0;padding:8px 10px">
        <legend style="font-size:13px;color:#eaf3ff;padding:0 4px">${label}</legend>
        <div class="pt-opts" role="group" aria-label="${label}" style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
          ${scale.map((v) => `<button type="button" class="pt-opt" data-value="${v}" aria-pressed="false" style="min-width:44px;min-height:44px;border-radius:8px">${v}</button>`).join('')}
        </div>
        <p class="pt-scale" style="font-size:10.5px;color:#7f93b0;margin:4px 0 0;text-align:center">1 = low · 5 = high</p>
      </fieldset>`;
    const choice = (name, label, opts) => `
      <fieldset class="pt-q" data-group="${name}" style="border:1px solid rgba(120,200,255,0.22);border-radius:8px;margin:8px 0;padding:8px 10px">
        <legend style="font-size:13px;color:#eaf3ff;padding:0 4px">${label}</legend>
        <div class="pt-opts" role="group" aria-label="${label}" style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
          ${opts.map(([v, t]) => `<button type="button" class="pt-opt" data-value="${v}" aria-pressed="false" style="min-height:44px;border-radius:8px;padding:0 10px">${t}</button>`).join('')}
        </div>
      </fieldset>`;
    panel(`
      <h2>A few quick questions</h2>
      <p style="font-size:12px;color:#9fb8d8;margin:0 0 6px">All 5 are required. Thanks for playing!</p>
      <div style="max-width:360px;margin:0 auto;text-align:left">
        ${rating('fun_rating', 'How fun was the game during these few minutes?')}
        ${rating('clarity_rating', 'How clear were the controls and choices?')}
        ${rating('replay_intent', 'If you had more time, how likely would you be to start another run?')}
        ${choice('peak_moment', 'What felt most exciting?', [['dodging', 'Dodging'], ['weapon_power', 'Weapon power'], ['build_choice', 'Build choice'], ['progression', 'Progression'], ['boss_or_elite', 'Boss / elite'], ['nothing_yet', 'Nothing yet'], ['other', 'Other']])}
        ${choice('friction_area', 'What got in the way the most?', [['controls', 'Controls'], ['visual_clarity', 'Visual clarity'], ['choice_clarity', 'Choice clarity'], ['difficulty', 'Difficulty'], ['performance', 'Performance'], ['nothing', 'Nothing'], ['other', 'Other']])}
      </div>
      <p id="pt-error" role="alert" style="display:none;color:#ff6b6b;font-size:12px;margin:4px 0">Please answer all 5 questions.</p>
      <button id="pt-submit" aria-label="Submit and return to Prolific">Submit and return to Prolific</button>
    `);
    const answers = {};
    const RATINGS = new Set(['fun_rating', 'clarity_rating', 'replay_intent']);
    overlay.querySelectorAll('.pt-q').forEach((fs) => {
      const group = fs.dataset.group;
      fs.querySelectorAll('.pt-opt').forEach((b) => {
        b.addEventListener('click', () => {
          fs.querySelectorAll('.pt-opt').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          fs.style.borderColor = 'rgba(120,200,255,0.22)';
          answers[group] = RATINGS.has(group) ? parseInt(b.dataset.value, 10) : b.dataset.value;
        });
      });
    });
    const submitBtn = document.getElementById('pt-submit');
    const errEl = document.getElementById('pt-error');
    let locked = false;
    submitBtn.addEventListener('click', () => {
      if (locked) return;
      const res = onSubmit({ ...answers });
      if (res && res.ok === false) {
        errEl.style.display = 'block';
        const miss = new Set(res.missing || []);
        overlay.querySelectorAll('.pt-q').forEach((fs) => {
          fs.style.borderColor = miss.has(fs.dataset.group) ? '#ff6b6b' : 'rgba(120,200,255,0.22)';
        });
        return;
      }
      locked = true;                 // 성공: 중복 제출 방지(흐름 로직도 이중 차단)
      submitBtn.disabled = true;
      errEl.style.display = 'none';
    });
  },

  /** 완료 안내(완료 URL이 없을 때 §5, 또는 동의 거부 반환 URL이 없을 때 §4.1). */
  showPlaytestComplete({ message } = {}) {
    panel(`
      <h2>Thank you</h2>
      <p style="font-size:13px;color:#dbe8ff;max-width:340px;margin:8px auto;line-height:1.6">${message || 'Test complete — return to Prolific and enter the completion code shown in the study.'}</p>
    `);
  },
};
