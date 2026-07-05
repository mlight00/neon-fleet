// DOM 오버레이: 타이틀 / 결과(성공·실패) / 격납고 화면
import { hangarCost } from './logic.js';
import { sfx } from './audio.js';

const overlay = document.getElementById('overlay');

// 오버레이 내 모든 버튼 클릭에 UI 클릭음 (개별 핸들러보다 위임이 간단)
overlay?.addEventListener('click', (e) => {
  if (e.target.closest('button')) sfx('click');
}, true);

function panel(html) {
  overlay.innerHTML = `<div class="panel">${html}</div>`;
  overlay.classList.remove('hidden');
}

export const ui = {
  hide() {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  },

  showTitle({ best, stage, coins = 0, saveOk, onStart, onHangar, onIntro, onReset }) {
    panel(`
      <h1>NEON FLEET</h1>
      <p>네온 함대</p>
      <p>좌우로 움직여 편대를 키우고<br>하이브 퀸을 격파하세요!</p>
      <p>📱 드래그 · 🖱 마우스 · ⌨ ←→</p>
      <p class="big">STAGE ${stage}</p>
      ${best > 0 ? `<p>최고 편대 기록: ${best} · 코인 ${coins.toLocaleString()}</p>` : ''}
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

  showWin({ stage, count, coins, best, isRecord, topPercent, onNext, onHangar }) {
    panel(`
      <h2 style="color:#3ff5e0">STAGE ${stage} 클리어!</h2>
      <p class="big">하이브 퀸 격파</p>
      <p>남은 편대: <b>${count}</b>기 ${isRecord ? '<span class="record">★ 신기록!</span>' : ''}</p>
      <p>획득 코인: <b>🪙 +${coins.toLocaleString()}</b></p>
      <p class="big">전체 파일럿 상위 ${topPercent}%!</p>
      ${best > 0 && !isRecord ? `<p>최고 기록: ${best}</p>` : ''}
      <p style="color:#ff9c41">다음 스테이지는 적이 더 강해집니다</p>
      <div class="btn-row">
        <button id="btn-retry">STAGE ${stage + 1} ▶</button>
        ${onHangar ? '<button id="btn-hangar" class="sub-btn">격납고</button>' : ''}
      </div>
    `);
    document.getElementById('btn-retry').addEventListener('click', onNext);
    if (onHangar) document.getElementById('btn-hangar').addEventListener('click', onHangar);
  },

  /** 일시정지 오버레이 */
  showPause({ onResume }) {
    panel(`
      <h2>일시정지</h2>
      <p>계속하려면 아래 버튼 또는 <b>ESC</b></p>
      <button id="btn-resume">계속하기</button>
    `);
    document.getElementById('btn-resume').addEventListener('click', onResume);
  },

  showLose({ stage, progress, coins, onRetry, onHangar }) {
    panel(`
      <h2 style="color:#ff3d71">편대 전멸...</h2>
      <p>STAGE ${stage} — 진행도 <b>${Math.round(progress * 100)}%</b>에서 격추</p>
      ${coins > 0 ? `<p>위로 코인: <b>🪙 +${coins.toLocaleString()}</b></p>` : ''}
      <p style="color:#9fb8d8"><small>막히면 격납고에서 함대를 강화하세요</small></p>
      <div class="btn-row">
        <button id="btn-retry">다시 도전</button>
        ${onHangar ? '<button id="btn-hangar" class="sub-btn">격납고</button>' : ''}
      </div>
    `);
    document.getElementById('btn-retry').addEventListener('click', onRetry);
    if (onHangar) document.getElementById('btn-hangar').addEventListener('click', onHangar);
  },
};
