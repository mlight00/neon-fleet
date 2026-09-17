# -*- coding: utf-8 -*-
# 이사 결정 ①③ 육안 검증 스크린샷(Playwright/Chromium). 게임 파일 무수정 — build6/trap-shot.html 하네스만 쓴다.
#   ① shot-trap-reveal.png  : '?' 가 걷힌 뒤 함정 게이트가 붉은 봉쇄 장치로 보이는 장면
#   ② shot-trap-result.png  : 결과 화면 — 랜덤 길 한 줄 + [다시 도전] 아래 "랜덤 길은 새로 추첨"
import functools, http.server, json, os, socketserver, threading, time

ROOT = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar'
OUT = os.path.join(ROOT, 'newmode', 'v3', 'build6')
PORT = 8806


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
        pg = b.new_page(viewport={'width': 480, 'height': 800})
        errs = []
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        pg.goto(f'http://127.0.0.1:{PORT}/newmode/v3/build6/trap-shot.html')
        pg.wait_for_function('window.__READY === true', timeout=20000)

        def shot(name):
            pg.locator('#shot').screenshot(path=os.path.join(OUT, name))
            log.append(['shot', name])

        # trapGate 가 걸리는 시드(lot:3:0) — 검사 SEED_OF 와 같은 조립 규칙
        lot = pg.evaluate("window.__start('lot:3:0')")
        log.append(['lottery', lot])
        assert lot['pick'] == 'trapGate', lot
        # ① 공개 직후(확정선 통과 뒤, 개시선 전): 붉은 봉쇄 바 + 큰 자물쇠 + 배지
        log.append(['advance', pg.evaluate("window.__advance(6060, 330)")])
        pg.evaluate("window.__setLotOpen(0)")
        pg.evaluate("window.__clearShots()")
        pg.evaluate("window.__draw(1)")
        log.append(['row@reveal', pg.evaluate("window.__row('g2')")])
        shot('shot-trap-reveal.png')

        # ② 결과 화면: 실제 적용량 문구 + [다시 도전] 아래 부연
        log.append(['advance', pg.evaluate("window.__advance(6600, 330)")])
        log.append(['row@passed', pg.evaluate("window.__row('g2')")])
        log.append(['result', pg.evaluate("window.__drawResult(true)")])
        shot('shot-trap-result.png')

        log.append(['console errors', [e for e in errs if 'favicon' not in e]])
        b.close()
finally:
    srv.shutdown()
    print(json.dumps(log, ensure_ascii=False, indent=1))
