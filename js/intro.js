// 스타워즈식 인트로 크롤 — 왜 싸우는지 + 최종 목표를 스크롤 텍스트로 전달.
// playIntro(onDone): 전체화면 오버레이 표시, 끝나거나 스킵하면 onDone() 호출.

const OPENING = '서기 2347년.  은하 변방.';
const TITLE = 'NEON FLEET';
const SUBTITLE = '네온 함대';
const PARAGRAPHS = [
  '외계 군체 <b>보이드 스웜</b>이\n은하를 집어삼켰다.',
  '행성이 하나둘 침묵하고,\n인류의 대함대는 모두 무너졌다.',
  '이제 맞설 것은\n낡은 정찰 드론 편대 하나뿐.',
  '에너지 크리스탈을 흡수해 편대를 불리고,\n허름한 드론을 최강의 전투 함선으로 진화시켜라.',
  '워프 게이트를 넘고 군체의 방어선을 뚫어\n더 깊은 전선으로 진격하라.',
  '최종 목표는 단 하나 —\n군체의 심장부에서 여왕 <b>하이브 퀸</b>을 격파하고\n은하를 되찾는 것이다.',
  '파일럿이여, 출격하라.',
];

export function playIntro(onDone) {
  const el = document.createElement('div');
  el.id = 'intro';
  el.innerHTML = `
    <div id="intro-opening">${OPENING}</div>
    <div id="intro-crawl-wrap">
      <div id="intro-crawl">
        <h1>${TITLE}</h1>
        <h2>${SUBTITLE}</h2>
        ${PARAGRAPHS.map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
      </div>
    </div>
    <button id="intro-skip">건너뛰기 ▶</button>
  `;
  document.getElementById('stage').appendChild(el);

  let done = false;
  let raf = 0;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    el.remove();
    onDone();
  };

  const opening = el.querySelector('#intro-opening');
  const wrap = el.querySelector('#intro-crawl-wrap');
  const crawl = el.querySelector('#intro-crawl');

  // 오프닝 문구 페이드
  requestAnimationFrame(() => opening.classList.add('show'));
  setTimeout(() => opening.classList.remove('show'), 3200);

  // 크롤: JS로 매 프레임 transform 제어 (CSS 3D + %translate 버그 회피, 결정적 동작)
  const OPENING_MS = 3600;
  const SPEED = 42;          // px/s (위로 흐르는 속도)
  const ROT = 30;            // 원근 기울기(도)
  let startTime = 0;
  const stageH = () => el.getBoundingClientRect().height || 640;
  const contentH = () => crawl.getBoundingClientRect().height || 900;

  function step(now) {
    if (!startTime) startTime = now;
    const elapsed = now - startTime;
    if (elapsed < OPENING_MS) {
      // 오프닝 동안 크롤은 화면 아래 대기
      crawl.style.transform = `translateX(-50%) rotateX(${ROT}deg) translateY(${stageH()}px)`;
      raf = requestAnimationFrame(step);
      return;
    }
    const t = (elapsed - OPENING_MS) / 1000;
    const y = stageH() - SPEED * t;                 // 화면 아래→위로 흐름
    crawl.style.transform = `translateX(-50%) rotateX(${ROT}deg) translateY(${y}px)`;
    // 크롤 전체가 화면 위로 완전히 빠져나가면 종료
    if (y < -contentH() - 40) { finish(); return; }
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);

  el.querySelector('#intro-skip').addEventListener('click', (e) => {
    e.stopPropagation();
    finish();
  });
}
