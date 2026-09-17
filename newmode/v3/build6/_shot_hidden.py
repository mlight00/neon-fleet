# -*- coding: utf-8 -*-
# 수정 라운드 1 지적 1 육안 검증(Playwright/Chromium). 게임 파일 무수정 — build6/trap-hidden-shot.html 하네스만 쓴다.
#   ① shot-trap-hidden.png : '?' 상자가 아직 덮고 있는 구간에서 막힌 탄의 스파크 색(함정 판)
#   ② shot-trap-hidden-bad.png : 같은 시점의 꽝 게이트 판(대조군) — 둘이 같아 보여야 한다
import functools, http.server, json, os, socketserver, threading

ROOT = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar'
OUT = os.path.join(ROOT, 'newmode', 'v3', 'build6')
PORT = 8807


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
from playwright.sync_api import sync_playwright  # noqa: E402

log = []
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for pick, name in (('trapGate', 'shot-trap-hidden.png'), ('badGate', 'shot-trap-hidden-bad.png')):
            pg = b.new_page(viewport={'width': 480, 'height': 800})
            errs = []
            pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
            pg.goto('http://127.0.0.1:%d/newmode/v3/build6/trap-hidden-shot.html' % PORT)
            pg.wait_for_function('window.__READY === true', timeout=20000)
            t = pg.evaluate("window.__timeFor('%s')" % pick)
            assert t, pick
            pg.evaluate("window.__boot(%d)" % t)
            pg.wait_for_function('window.__app !== undefined', timeout=20000)
            lot = pg.evaluate("window.__start(3)")
            assert lot['pick'] == pick, lot
            # z4200 까지: 갈림길 앞은 중앙, 그 뒤로는 우측 통로 조준
            pg.evaluate("window.__aim(240)")
            for _ in range(400):
                z = pg.evaluate("window.__frames(4)")
                if z >= 4000:
                    break
            pg.evaluate("window.__aim(330)")
            mark = pg.evaluate("window.__sfxLen()")
            # '?' 가 아직 덮고 있는 동안, 막힘 파편이 화면에 떠 있는 프레임에서 멈춘다
            shot_state = None
            for _ in range(600):
                st = pg.evaluate("window.__state()")
                # '?' 상자와 파편이 **함께 화면에 보이는** 구간(확정선 바로 앞)에서 멈춘다 — 상자는 y=640-(6300-z)
                if st['z'] > 5840 and st['parts'] > 0 and st['z'] < st['revealZ'] - 5:
                    shot_state = st
                    break
                pg.evaluate("window.__frames(1)")
            assert shot_state, 'pre-reveal frame with parts not found: ' + pick
            log.append([pick, 'state', shot_state, 'partColors', pg.evaluate("window.__partColors()"),
                        'sfx', sorted(set(pg.evaluate("window.__sfxFrom(%d)" % mark)))])
            pg.locator('#shot').screenshot(path=os.path.join(OUT, name))
            log.append([pick, 'shot', name, 'console errors', [e for e in errs if 'favicon' not in e]])
            pg.close()
        b.close()
finally:
    srv.shutdown()
    print(json.dumps(log, ensure_ascii=False, indent=1))
