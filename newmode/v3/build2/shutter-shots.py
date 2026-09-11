"""S2 게이트 셔터 닫힘→열림 스크린샷만 다시(게이트가 화면 안쪽에 보이는 z 에서)."""
import functools, http.server, json, os, socketserver, threading, time

ROOT = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar'
OUT = os.path.join(ROOT, 'newmode', 'v3', 'build2')
PORT = 8802


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
from playwright.sync_api import sync_playwright  # noqa: E402

out = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 480, 'height': 800}, device_scale_factor=2)
        pg = ctx.new_page()
        pg.goto(f'http://127.0.0.1:{PORT}/rush3.html')
        pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=10000)
        time.sleep(1.0)
        cv = pg.evaluate('(()=>{const c=document.getElementById("game3"),b=c.getBoundingClientRect();'
                         'return{cssW:b.width,cssH:b.height,l:b.left,t:b.top}})()')
        css = lambda lx, ly: (cv['l'] + lx * cv['cssW'] / 480, cv['t'] + ly * cv['cssH'] / 800)  # noqa: E731
        dbg = lambda: pg.evaluate('window.__rush3Dbg()')  # noqa: E731
        pg.mouse.click(*css(240, 543))
        time.sleep(0.4)
        pg.mouse.move(*css(120, 600))
        want = [(690, 790, 'bv-02-s2-gate-closed.png'),
                (815, 885, 'bv-03-s2-gate-open.png'),
                (930, 1010, 'bv-03b-s2-gate-open.png')]
        i = 0
        t0 = time.time()
        while time.time() - t0 < 30 and i < len(want):
            z = dbg()['z']
            lo, hi, name = want[i]
            if lo < z < hi:
                pg.screenshot(path=os.path.join(OUT, name))
                out.append([name, z])
                i += 1
            elif z >= hi:
                i += 1
            time.sleep(0.02)
        b.close()
finally:
    srv.shutdown()
    print(json.dumps(out, ensure_ascii=False))
