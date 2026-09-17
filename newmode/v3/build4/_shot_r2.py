# -*- coding: utf-8 -*-
# 수정 라운드 2 육안 검증 스크린샷(Playwright/Chromium). 게임 파일 무수정 — lottery-shot.html 하네스만 쓴다.
import sys
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8793/newmode/v3/build4/lottery-shot.html'
OUT = 'E:/workspace/claude/neon-fleet/worktrees/v3-lastwar/newmode/v3/build4/'

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

    # ① 확정 전: '?' 표지 + 가림 상자 (trapGate 시드 = lot:3:0)
    print(pg.evaluate("window.__start('lot:3:0')"))
    print(pg.evaluate("window.__advance(5900, 330)"))
    pg.evaluate("window.__draw(1)")
    shot('shot-fix2-1-hidden.png')

    # ② 확정 뒤 우측 통로: −10 확정 게이트가 '확정' 꼬리표와 함께 드러난다(셔터 개방선 앞)
    print(pg.evaluate("window.__advance(6070, 330)"))
    pg.evaluate("window.__setLotOpen(0)")
    pg.evaluate("window.__draw(1)")
    shot('shot-fix2-2-trap.png')

    # ③ 셔터가 열린 뒤(openZ 6094 통과) — 쏴도 숫자가 안 바뀌는 칸
    print(pg.evaluate("window.__advance(6180, 330)"))
    pg.evaluate("window.__clearShots()")   # 사진용: 숫자 위에 탄이 겹치지 않게
    pg.evaluate("window.__draw(1)")
    print('셔터/값', pg.evaluate("(() => { const r = window.__lot(); return r; })()"))
    shot('shot-fix2-3-armed.png')

    # ④ 결과 화면 — 랜덤 길 한 줄
    print(pg.evaluate("window.__advance(6400, 330)"))
    print('결과 한 줄:', pg.evaluate("window.__drawResult(true)"))
    shot('shot-fix2-4-result.png')

    print('console errors:', [e for e in errs if 'favicon' not in e])
    b.close()
