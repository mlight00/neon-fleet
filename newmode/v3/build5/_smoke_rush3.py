# -*- coding: utf-8 -*-
# 실게임 페이지(rush3.html) 부팅 스모크 — 콘솔 오류 0 · 타이틀에서 S2 출격 후 프레임이 도는지
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8795/rush3.html'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 480, 'height': 800})
    errs = []
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto(URL)
    pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=20000)
    print('title:', pg.evaluate('window.__rush3Dbg()'))
    pg.mouse.click(240, (436 + 76 + 31) / 1)   # STAGE 2 버튼(논리=CSS 1:1)
    pg.wait_for_timeout(4000)
    print('run  :', pg.evaluate('window.__rush3Dbg()'))
    print('save :', pg.evaluate("localStorage.getItem('starforgeRush.v3')"))
    print('console errors:', [e for e in errs if 'favicon' not in e])
    b.close()
