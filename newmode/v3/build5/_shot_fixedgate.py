# -*- coding: utf-8 -*-
# 수정 라운드 1(2026-09-17) 육안 검증: 확정 −10 행이 열린 한 화면 · 대조군 −15 행.
# 게임 파일 무수정 — shutter-shot.html 하네스만 쓴다(문구는 하네스가 isFixedGateRow 로 고른다 = 셸과 같은 판정).
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

    for pick, name in [('trapGate', 'shot-n2-fixedgate.png'), ('badGate', 'shot-n2-opengate.png')]:
        info = pg.evaluate("window.__startLot('%s')" % pick)
        print(pick, info)
        # 분리벽 w3 우측 통로로 붙어 랜덤 길 게이트가 열리는 지점까지 진행
        print(' ', pg.evaluate("window.__advance(4000, 240)"))
        print(' ', pg.evaluate("window.__advance(%d, 330)" % (info['z'] - info['armZ'] + 4)))
        print(' ', pg.evaluate("window.__rowInfo('%s')" % info['rowId']))
        print('  tip =', pg.evaluate("window.__tipArm('%s')" % info['rowId']))
        pg.evaluate("window.__revealLot()")
        pg.evaluate("window.__setGateOpen('%s', 0)" % info['rowId'])
        pg.evaluate("window.__clearShots()")
        pg.evaluate("window.__draw(1)")
        pg.locator('#shot').screenshot(path=OUT + name)
        print('  ->', name)

    print('console errors:', [e for e in errs if 'favicon' not in e])
    b.close()
