"""난이도 선택 브라우저 검증 — rush3.html(Playwright Chromium). build2/browser-verify.py 를 참고해 새로 작성(원본 무수정).
   A) 타이틀: 난이도 토글 클릭(어려움) → dbg.difficulty·저장 difficulty · 키 3/1/2 → brutal/normal/hard
   B) 출격(S1, hard): HUD 난이도 태그 스크린샷 · 저장 키 `2:hard` 에 attempts 1(normal 칸 `2` 없음)
   C) 무조작(x 240)으로 결과 화면까지 → 결과 제목 옆 표기 스크린샷 · `2:hard` 칸에 cleared/best 기록
   D) 새로고침 → 난이도 기억(hard) → 극한 클릭 → 출격 → HUD 태그(극한) · `2:brutal` 칸
   pageerror 0 · HTTP 4xx/5xx 0 이 합격선."""
import functools, http.server, json, socketserver, threading, time

ROOT = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar'
OUT = ROOT + r'\newmode\v3\build3'
PORT = 8803
KEY = 'starforgeRush.v3'
#  main.DIFF_TOGGLE 과 같은 값(논리 좌표): x0 138, w 90, gap 6, y 382, h 34 → 칸 중심 x = 183 / 279 / 375, y = 399
TOGGLE_X = {'normal': 183, 'hard': 279, 'brutal': 375}
TOGGLE_Y = 399
STAGE1_Y = 436 + 31


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()

from playwright.sync_api import sync_playwright  # noqa: E402

rep = {'pageerrors': [], 'console_err': [], 'http_fail': [], 'steps': []}


def step(name, **kw):
    rep['steps'].append({'name': name, **kw})
    print('[step]', name, json.dumps(kw, ensure_ascii=False)[:500], flush=True)


def open_page(p, clear=True):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 480, 'height': 800}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: rep['pageerrors'].append(str(e)))
    pg.on('console', lambda m: rep['console_err'].append([m.type, m.text]) if m.type in ('error', 'warning') else None)
    pg.on('response', lambda r: rep['http_fail'].append([r.status, r.url]) if r.status >= 400 else None)
    pg.goto(f'http://127.0.0.1:{PORT}/rush3.html')
    pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=10000)
    time.sleep(1.0)
    cv = pg.evaluate('(()=>{const c=document.getElementById("game3"),b=c.getBoundingClientRect();'
                     'return{cssW:b.width,cssH:b.height,l:b.left,t:b.top}})()')
    return b, pg, cv


def saved(pg):
    raw = pg.evaluate(f'localStorage.getItem("{KEY}")')
    return json.loads(raw) if raw else None


def main():
    with sync_playwright() as p:
        b, pg, cv = open_page(p)
        dbg = lambda: pg.evaluate('window.__rush3Dbg()')  # noqa: E731

        def css(lx, ly):
            return (cv['l'] + lx * cv['cssW'] / 480, cv['t'] + ly * cv['cssH'] / 800)

        # ───────── A) 타이틀 토글·키
        d = dbg()
        step('load', dbg=d, ok=(d['state'] == 'title' and d['difficulty'] == 'normal'))
        pg.screenshot(path=OUT + r'\bv3-01-title-normal.png')
        pg.mouse.click(*css(TOGGLE_X['hard'], TOGGLE_Y))
        time.sleep(0.3)
        d = dbg(); sv = saved(pg)
        step('clickHard', dbg=d, savedDifficulty=(sv or {}).get('difficulty'),
             ok=(d['state'] == 'title' and d['difficulty'] == 'hard' and (sv or {}).get('difficulty') == 'hard'))
        pg.screenshot(path=OUT + r'\bv3-02-title-hard.png')
        keys = []
        for k, want in (('3', 'brutal'), ('1', 'normal'), ('2', 'hard')):
            pg.keyboard.press(k)
            time.sleep(0.15)
            keys.append([k, dbg()['difficulty'], want])
        step('keys123', keys=keys, ok=all(a == w for _, a, w in keys))

        # ───────── B) 출격(S1, hard): HUD 태그 · 저장 키
        pg.mouse.click(*css(240, STAGE1_Y))
        time.sleep(0.8)
        d = dbg(); sv = saved(pg)
        vers = ((sv or {}).get('stages', {}).get('1', {}) or {}).get('versions', {})
        step('startS1hard', dbg=d, versions=vers,
             ok=(d['state'] == 'run' and d['stageId'] == 1 and d['difficulty'] == 'hard'
                 and vers.get('2:hard', {}).get('attempts') == 1 and '2' not in vers))
        pg.screenshot(path=OUT + r'\bv3-03-hud-hard.png')

        # ───────── C) 무조작(x 240)으로 결과까지(봇표: hard S1 center = 완주 11명, 약 43초)
        pg.mouse.move(*css(240, 600))
        t0 = time.time()
        while time.time() - t0 < 120:
            d = dbg()
            if d['state'] != 'run':
                break
            pg.mouse.move(*css(240, 600))
            time.sleep(0.1)
        time.sleep(2.2)
        d = dbg(); sv = saved(pg)
        vers = ((sv or {}).get('stages', {}).get('1', {}) or {}).get('versions', {})
        rec = vers.get('2:hard', {})
        step('reachResultHard', dbg=d, rec=rec, keys=sorted(vers.keys()),
             ok=(d['state'] == 'result' and rec.get('attempts') == 1 and 'cleared' in rec and '2' not in vers))
        pg.screenshot(path=OUT + r'\bv3-04-result-hard.png')

        # ───────── D) 새로고침(같은 컨텍스트 = localStorage 유지) → 난이도 기억 → 극한 → 출격 → HUD 태그 · `2:brutal`
        #  ⚠️ 브라우저를 닫고 다시 열면 새 컨텍스트라 localStorage 가 비어 '기억' 검사가 성립하지 않는다 — 반드시 reload 로
        pg.reload()
        pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=10000)
        time.sleep(1.0)
        d = dbg()
        step('reloadRemembersHard', dbg=d, ok=(d['state'] == 'title' and d['difficulty'] == 'hard'))
        pg.mouse.click(*css(TOGGLE_X['brutal'], TOGGLE_Y))
        time.sleep(0.3)
        d = dbg()
        step('clickBrutal', dbg=d, ok=(d['difficulty'] == 'brutal'))
        pg.screenshot(path=OUT + r'\bv3-05-title-brutal.png')
        pg.mouse.click(*css(240, STAGE1_Y))
        time.sleep(1.0)
        d = dbg(); sv = saved(pg)
        vers = ((sv or {}).get('stages', {}).get('1', {}) or {}).get('versions', {})
        step('startS1brutal', dbg=d, keys=sorted(vers.keys()),
             ok=(d['state'] == 'run' and d['difficulty'] == 'brutal' and vers.get('2:brutal', {}).get('attempts') == 1
                 and vers.get('2:hard', {}).get('attempts') == 1 and '2' not in vers))
        pg.screenshot(path=OUT + r'\bv3-06-hud-brutal.png')
        b.close()


try:
    main()
finally:
    srv.shutdown()
    rep['ok_all'] = (all(s.get('ok', True) for s in rep['steps'])
                     and not rep['pageerrors'] and not rep['http_fail'])
    with open(OUT + r'\browser-verify.json', 'w', encoding='utf-8') as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    print('PAGEERRORS', rep['pageerrors'])
    print('CONSOLE', rep['console_err'][:10])
    print('HTTPFAIL', rep['http_fail'][:10])
    print('OK_ALL', rep['ok_all'])
