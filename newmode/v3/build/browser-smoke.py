"""rush3.html 브라우저 스모크 — Playwright(Chromium). 정적 서버를 스레드로 띄우고 실제 rush3/main.js 결선을 두드린다."""
import functools, http.server, json, socketserver, threading, time, sys

ROOT = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar'
OUT = ROOT + r'\newmode\v3\build'
PORT = 8799


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()

from playwright.sync_api import sync_playwright  # noqa: E402

report = {'pageerrors': [], 'console_err': [], 'http_fail': [], 'steps': []}


def step(name, **kw):
    report['steps'].append({'name': name, **kw})
    print('[step]', name, json.dumps(kw, ensure_ascii=False)[:300])


def run(dpr, touch):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 480, 'height': 800}, device_scale_factor=dpr, has_touch=touch)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: report['pageerrors'].append(str(e)))
        pg.on('console', lambda m: report['console_err'].append(m.text) if m.type in ('error', 'warning') else None)
        pg.on('response', lambda r: report['http_fail'].append((r.status, r.url)) if r.status >= 400 else None)
        pg.goto(f'http://127.0.0.1:{PORT}/rush3.html')
        pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=10000)
        time.sleep(1.2)
        dbg = lambda: pg.evaluate('window.__rush3Dbg()')  # noqa: E731
        step('title', dpr=dpr, touch=touch, dbg=dbg())
        cv = pg.evaluate('(()=>{const c=document.getElementById("game3");const b=c.getBoundingClientRect();return {w:c.width,h:c.height,cssW:b.width,cssH:b.height,dpr:devicePixelRatio,l:b.left,t:b.top}})()')
        step('canvas', **cv, dprOk=(abs(cv['w'] - round(cv['cssW'] * min(dpr, 2))) <= 1 and abs(cv['h'] - round(cv['cssH'] * min(dpr, 2))) <= 1))
        pg.screenshot(path=OUT + f'\\shot-title-dpr{dpr}.png')

        def css(lx, ly):
            return (cv['l'] + lx * cv['cssW'] / 480, cv['t'] + ly * cv['cssH'] / 800)

        # 스테이지 1 버튼(논리 60..420 × 436..498)
        x, y = css(240, 467)
        if touch:
            pg.touchscreen.tap(x, y)
        else:
            pg.mouse.click(x, y)
        time.sleep(0.3)
        d = dbg()
        step('afterStageClick', dbg=d, ok=(d['state'] == 'run' and d['stageId'] == 1))

        # 3초 진행 → z ≈ 570
        time.sleep(3.0)
        d = dbg()
        step('after3s', dbg=d, ok=(400 < d['z'] < 760 and d['bullets'] >= 0))

        # ESC 일시정지: 1초 뒤 z 불변
        pg.keyboard.press('Escape')
        time.sleep(0.2)
        z0 = dbg()['z']
        time.sleep(1.0)
        d = dbg()
        step('escPause', dbg=d, ok=(d['state'] == 'paused' and d['z'] == z0))
        pg.screenshot(path=OUT + f'\\shot-paused-dpr{dpr}.png')
        pg.keyboard.press('Escape')
        time.sleep(0.3)
        step('escResume', dbg=dbg(), ok=(dbg()['state'] == 'run'))

        # blur → 자동 일시정지 → ESC 재개
        pg.evaluate('window.dispatchEvent(new Event("blur"))')
        time.sleep(0.2)
        step('blurAutoPause', dbg=dbg(), ok=(dbg()['state'] == 'paused'))
        pg.keyboard.press('Escape')
        time.sleep(0.2)

        # visibilitychange(hidden) → 자동 일시정지
        pg.evaluate('Object.defineProperty(document, "hidden", {configurable:true, get(){return true}}); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "hidden", {configurable:true, get(){return false}});')
        time.sleep(0.2)
        step('visibilityAutoPause', dbg=dbg(), ok=(dbg()['state'] == 'paused'))
        pg.keyboard.press('Escape')
        time.sleep(0.2)

        if touch:
            # 터치 드래그: 실제 리스너 경로(PointerEvent pointerType touch)
            tx0 = pg.evaluate('window.__rush3Dbg().x')
            x1, y1 = css(200, 300)
            pg.evaluate(f'''(()=>{{const c=document.getElementById("game3");
              c.dispatchEvent(new PointerEvent("pointerdown",{{clientX:{x1},clientY:{y1},pointerType:"touch",pointerId:1,bubbles:true}}));}})()''')
            time.sleep(0.15)
            xa = pg.evaluate('window.__rush3Dbg().x')
            x2, _ = css(300, 300)
            pg.evaluate(f'''(()=>{{const c=document.getElementById("game3");
              c.dispatchEvent(new PointerEvent("pointermove",{{clientX:{x2},clientY:{y1},pointerType:"touch",pointerId:1,bubbles:true}}));}})()''')
            time.sleep(0.6)
            xb = pg.evaluate('window.__rush3Dbg().x')
            pg.evaluate('window.dispatchEvent(new PointerEvent("pointerup",{pointerType:"touch",pointerId:1}))')
            step('touchDrag', x0=tx0, afterDown=xa, afterMove=xb, ok=(abs(xa - tx0) < 12 and xb > xa + 40))

        # 봇: z 구간별 차선(마우스 호버 = pointerX)
        def lane(z):
            if z < 1400: return 320
            if z < 2300: return 240
            if z < 3300: return 320
            if z < 4400: return 240
            if z < 6100: return 330
            return 240
        t0 = time.time(); shots = {'mid': False, 'boss': False}
        last = None
        while time.time() - t0 < 150:
            d = dbg()
            if d['state'] != 'run':
                break
            lx = lane(d['z'])
            if lx != last:
                x, y = css(lx, 600)
                if touch:
                    # 터치 환경: 드래그로 목표까지 이동
                    cx = d['x']
                    xa_, ya_ = css(cx, 600); xb_, _ = css(lx, 600)
                    pg.evaluate(f'''(()=>{{const c=document.getElementById("game3");
                      c.dispatchEvent(new PointerEvent("pointerdown",{{clientX:{xa_},clientY:{ya_},pointerType:"touch",pointerId:5,bubbles:true}}));
                      c.dispatchEvent(new PointerEvent("pointermove",{{clientX:{xb_},clientY:{ya_},pointerType:"touch",pointerId:5,bubbles:true}}));
                      window.dispatchEvent(new PointerEvent("pointerup",{{pointerType:"touch",pointerId:5}}));}})()''')
                else:
                    pg.mouse.move(x, y)
                last = lx
            if not shots['mid'] and d['z'] > 2000:
                pg.screenshot(path=OUT + f'\\shot-run-dpr{dpr}.png'); shots['mid'] = True
            if not shots['boss'] and d['boss']:
                time.sleep(1.0); pg.screenshot(path=OUT + f'\\shot-boss-dpr{dpr}.png'); shots['boss'] = True
            time.sleep(0.1)
        d = dbg()
        step('runEnd', dbg=d, seconds=round(time.time() - t0, 1), ok=(d['state'] == 'result'))
        time.sleep(1.5)
        pg.screenshot(path=OUT + f'\\shot-result-dpr{dpr}.png')
        saved = pg.evaluate('localStorage.getItem("starforgeRush.v3")')
        step('saved', raw=saved, ok=(saved is not None and '"attempts":1' in saved))
        # 결과 화면 버튼: 다시 도전(480..536) 클릭 → 다시 run
        x, y = css(240, 508)
        pg.mouse.click(x, y)
        time.sleep(0.3)
        d = dbg()
        step('retryClick', dbg=d, ok=(d['state'] == 'run' and d['stageId'] == 1))
        # 일시정지 → 스테이지 선택 → 타이틀
        pg.keyboard.press('Escape'); time.sleep(0.2)
        x, y = css(240, 502); pg.mouse.click(x, y); time.sleep(0.3)
        step('giveupToTitle', dbg=dbg(), ok=(dbg()['state'] == 'title'))
        b.close()


try:
    run(2, False)
    run(1, True)
finally:
    srv.shutdown()
    report['ok_all'] = all(s.get('ok', True) for s in report['steps']) and not report['pageerrors'] and not report['http_fail']
    with open(OUT + r'\browser-smoke.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print('PAGEERRORS', report['pageerrors'])
    print('CONSOLE', report['console_err'][:10])
    print('HTTPFAIL', report['http_fail'][:10])
    print('OK_ALL', report['ok_all'])
