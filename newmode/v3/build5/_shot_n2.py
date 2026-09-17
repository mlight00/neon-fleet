# -*- coding: utf-8 -*-
# N2(셔터 표현) 육안 검증 스크린샷(Playwright/Chromium). 게임 파일 무수정 — shutter-shot.html 하네스만 쓴다.
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8795/newmode/v3/build5/shutter-shot.html'
OUT = 'E:/workspace/claude/neon-fleet/worktrees/v3-lastwar/newmode/v3/build5/'

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 480, 'height': 800})
    errs = []
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto(URL)
    pg.wait_for_function('window.__READY === true', timeout=20000)

    def shot(name):
        pg.locator('#shot').screenshot(path=OUT + name)
        print('  ->', name)

    print(pg.evaluate("window.__start(2)"))
    # ① 닫힌 셔터: 숫자·부호가 회색 판 위에 선명하고, 칸 모서리에 자물쇠 · 칸 위 '가까워지면 열림' · 개시선 옆 글 · 첫 조우 배너
    print(pg.evaluate("window.__advance(560, 240)"))
    print(pg.evaluate("window.__tipClosed('g1')"))
    print(pg.evaluate("window.__banner()"))
    pg.evaluate("window.__clearShots()")
    pg.evaluate("window.__draw(1)")
    shot('shot-n2-closed.png')

    # ② 열리는 중 + 열린 직후: 회색 판이 위로 걷히고 '지금 쏘면 +1'
    pg.evaluate("window.__clearBanner()")
    print(pg.evaluate("window.__advance(810, 240)"))
    print('g1', pg.evaluate("window.__advance(812, 240)"))
    print(pg.evaluate("window.__setGateOpen('g1', 0.125)"))
    print(pg.evaluate("window.__tipOpen('g1')"))
    pg.evaluate("window.__clearShots()")
    pg.evaluate("window.__draw(1)")
    shot('shot-n2-opening.png')

    print(pg.evaluate("window.__advance(900, 240)"))
    print(pg.evaluate("window.__setGateOpen('g1', 0)"))
    print(pg.evaluate("window.__tipOpen('g1')"))
    pg.evaluate("window.__clearShots()")
    pg.evaluate("window.__draw(1)")
    shot('shot-n2-open.png')

    print('console errors:', [e for e in errs if 'favicon' not in e])
    b.close()
