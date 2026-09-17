# -*- coding: utf-8 -*-
# S2 g1 셔터 구간을 z 구간별로 연속 촬영 — 닫힌 동안 숫자 판독 · 칸 위 짧은 글 · 열림 문구
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8795/rush3.html'
OUT = 'E:/workspace/claude/neon-fleet/worktrees/v3-lastwar/newmode/v3/build5/'
MARKS = [420, 560, 700, 780, 806, 830, 900]
errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 480, 'height': 800})
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto(BASE)
    pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=20000)
    pg.mouse.move(240, 600)
    pg.mouse.click(240, 543)
    pg.wait_for_function('window.__rush3Dbg().state === "run"', timeout=10000)
    for m in MARKS:
        for _ in range(600):
            pg.mouse.move(240, 600)
            d = pg.evaluate('window.__rush3Dbg()')
            if d['state'] != 'run' or d['z'] >= m:
                break
            pg.wait_for_timeout(15)
        d = pg.evaluate('window.__rush3Dbg()')
        pg.screenshot(path=OUT + 'verify2-shutter-z%d.png' % m)
        print('z%d -> %s' % (m, d))
    ctx.close(); b.close()
print('ERRORS:', [e for e in errs if 'favicon' not in e])
