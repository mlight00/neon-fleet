# -*- coding: utf-8 -*-
# 2차 검수 반영 최종 브라우저 검증 — 실게임 rush3.html 만 연다(게임 파일 무수정).
import json, sys
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8795/rush3.html'
OUT = 'E:/workspace/claude/neon-fleet/worktrees/v3-lastwar/newmode/v3/build5/'
errs = []
log = []

def attach(pg):
    pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ── A. S2 (저장 없음 = 첫 방문, 기본 난이도 그대로) ───────────────────────
    ctx = b.new_context(viewport={'width': 480, 'height': 800})
    pg = ctx.new_page(); attach(pg)
    pg.goto(BASE)
    pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=20000)
    log.append(('A0 타이틀', pg.evaluate('window.__rush3Dbg()')))
    pg.screenshot(path=OUT + 'verify2-title.png')
    pg.mouse.move(320, 600)
    pg.mouse.click(240, 543)            # STAGE 2
    pg.wait_for_function('window.__rush3Dbg().state === "run"', timeout=10000)

    def hold_until(zmin, cap=400):
        for _ in range(cap):
            pg.mouse.move(320, 600)
            d = pg.evaluate('window.__rush3Dbg()')
            if d['state'] != 'run':
                return d
            if d['z'] >= zmin:
                return d
            pg.wait_for_timeout(25)
        return pg.evaluate('window.__rush3Dbg()')

    d = hold_until(400)                  # g1(z 1140) 이 enterZ 760 안으로 = 닫힌 셔터 + 첫 조우 배너
    log.append(('A1 닫힘 시점', d))
    pg.screenshot(path=OUT + 'verify2-s2-closed.png')

    d = hold_until(812)                  # armZ 340 → z >= 800 에서 열림
    log.append(('A2 열림 시점', d))
    pg.screenshot(path=OUT + 'verify2-s2-open.png')

    for _ in range(600):                 # 우측 −20 을 고른 채 끝까지
        pg.mouse.move(320, 600)
        d = pg.evaluate('window.__rush3Dbg()')
        if d['state'] == 'result':
            break
        pg.wait_for_timeout(50)
    log.append(('A3 결과', pg.evaluate('window.__rush3Dbg()')))
    pg.wait_for_timeout(400)
    pg.screenshot(path=OUT + 'verify2-s2-result.png')
    ctx.close()

    # ── B. S3 랜덤 길 (보통 난이도 선택 — 기본값은 건드리지 않고 화면에서 고른다) ──
    for attempt in range(6):
        ctx = b.new_context(viewport={'width': 480, 'height': 800})
        pg = ctx.new_page(); attach(pg)
        pg.goto(BASE)
        pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=20000)
        pg.mouse.click(183, 399)         # 난이도 '보통'
        pg.wait_for_timeout(150)
        pg.mouse.click(240, 619)         # STAGE 3
        pg.wait_for_function('window.__rush3Dbg().state === "run"', timeout=10000)
        for _ in range(3000):
            pg.mouse.move(320, 600)      # 우측 = 랜덤 길
            d = pg.evaluate('window.__rush3Dbg()')
            if d['state'] == 'result':
                break
            pg.wait_for_timeout(30)
        d = pg.evaluate('window.__rush3Dbg()')
        log.append(('B 시도%d 결과' % (attempt + 1), d))
        pg.wait_for_timeout(400)
        pg.screenshot(path=OUT + 'verify2-s3-lottery-%d.png' % (attempt + 1))
        ctx.close()
        if attempt >= 1:
            break

    b.close()

for k, v in log:
    print(k, json.dumps(v, ensure_ascii=False))
print('ERRORS:', json.dumps([e for e in errs if 'favicon' not in e], ensure_ascii=False))
