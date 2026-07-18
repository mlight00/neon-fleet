// 전면 개편 Phase A 시네마틱 — 5장, 약 20초.
// 긴 설명 대신 세계관의 질문(코어는 무엇인가, 다음 지배자는 누구인가)을 남긴다.
import { STORY } from './creative-direction.js';

const PANELS = [
  {
    eyebrow: '2347 · COLD WAKE',
    title: '마지막 신호가 꺼졌다.',
    copy: '보이드 스웜의 합창이 식민지를 삼켰고, 인류 함대는 빛이 끊긴 항로에 흩어졌다.',
    tone: 'wake',
    image: 'assets/art2-webp/story/nf2_story_intro_01_cold_wake.webp',
  },
  {
    eyebrow: `${STORY.ai} // EMERGENCY BOOT`,
    title: `${STORY.flagship}, 재점화.`,
    copy: '무장도 함대도 없다. 남은 것은 부서진 정찰함 한 척과, 정체를 감춘 항법 AI뿐.',
    tone: 'lumen',
    image: 'assets/art2-webp/story/nf2_story_intro_02_lumen_boot.webp',
    portrait: 'assets/art2-webp/story/nf2_portrait_echo7.webp',
  },
  {
    eyebrow: 'UNKNOWN RELIC RECOVERED',
    title: `${STORY.core}가 선체를 다시 쓴다.`,
    copy: '적에게서 회수한 빛은 포신과 날개로 조립된다. 어떤 무기를 고르느냐에 따라 함선의 형태도 달라진다.',
    tone: 'forge',
    image: 'assets/art2-webp/story/nf2_story_intro_03_core_rewrite.webp',
  },
  {
    eyebrow: `${STORY.enemy} // INCOMING`,
    title: '“왕관의 조각을 돌려다오.”',
    copy: '군체는 코어를 잃어버린 왕관이라 부른다. 그리고 항로마다 더 거대한 지배자를 깨운다.',
    tone: 'chorus',
    image: 'assets/art2-webp/story/nf2_story_intro_04_chorus.webp',
    portrait: 'assets/art2-webp/story/nf2_portrait_hive_queen.webp',
  },
  {
    eyebrow: 'EXPEDITION DIRECTIVE',
    title: '강해져라. 조합하라. 다음 지배자를 부숴라.',
    copy: '다음 무장은 어떤 모습일까? 항로 끝에는 무엇이 기다릴까? 답은 전진한 함대만이 확인할 수 있다.',
    tone: 'launch',
    image: 'assets/art2-webp/story/nf2_story_intro_05_launch.webp',
  },
];

function panelMarkup(panel, index) {
  return `
    <section class="intro-shot intro-shot--${panel.tone}" data-shot="${index}" aria-hidden="${index ? 'true' : 'false'}">
      <div class="intro-space" aria-hidden="true"><img class="intro-art" src="${panel.image}" alt="" decoding="async">${panel.portrait ? `<img class="intro-portrait" src="${panel.portrait}" alt="" decoding="async">` : ''}</div>
      <div class="intro-copy">
        <span class="intro-eyebrow">${panel.eyebrow}</span>
        <h1>${panel.title}</h1>
        <p>${panel.copy}</p>
      </div>
    </section>`;
}

export function playIntro(onDone) {
  const el = document.createElement('div');
  el.id = 'intro';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '네온 함대 프롤로그');
  el.innerHTML = `
    <div class="intro-vignette"></div>
    ${PANELS.map(panelMarkup).join('')}
    <div class="intro-progress" aria-hidden="true">${PANELS.map((_, i) => `<i class="${i === 0 ? 'active' : ''}"></i>`).join('')}</div>
    <button id="intro-next" aria-label="다음 장면">다음</button>
    <button id="intro-skip">건너뛰기</button>
  `;
  document.getElementById('stage').appendChild(el);

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const shotMs = reduced ? 1800 : 3900;
  const shots = [...el.querySelectorAll('.intro-shot')];
  const dots = [...el.querySelectorAll('.intro-progress i')];
  let index = 0;
  let done = false;
  let timer = 0;

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.classList.add('intro-leave');
    const removeDelay = reduced ? 0 : 420;
    setTimeout(() => { el.remove(); onDone(); }, removeDelay);
  };

  const show = (next) => {
    if (done) return;
    if (next >= shots.length) { finish(); return; }
    index = next;
    shots.forEach((shot, i) => {
      const active = i === index;
      shot.classList.toggle('active', active);
      shot.setAttribute('aria-hidden', active ? 'false' : 'true');
      dots[i].classList.toggle('active', active);
    });
    clearTimeout(timer);
    timer = setTimeout(() => show(index + 1), shotMs);
  };

  requestAnimationFrame(() => show(0));
  el.querySelector('#intro-next').addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });
  el.querySelector('#intro-skip').addEventListener('click', (e) => { e.stopPropagation(); finish(); });
}
