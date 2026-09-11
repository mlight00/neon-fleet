"""검수 반영 최종 브라우저 검증 — rush3.html(Playwright Chromium).
   A) S1: 로드·콘솔 오류 0 · 마우스 이동 후 방향키 조향 · 마우스 재이동 복귀(F1)
   B) S2: 게이트 셔터 닫힘→열림(스크린샷) · 분리벽에서 한쪽 통만 열림(units/weapon 관찰) · 결과 화면
   ※ build/browser-smoke.py 를 참고해 새로 작성. 원본은 수정하지 않았다."""
import functools, http.server, json, socketserver, threading, time

ROOT = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar'
OUT = ROOT + r'\newmode\v3\build2'
PORT = 8801


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()

from playwright.sync_api import sync_playwright  # noqa: E402

rep = {'pageerrors': [], 'console_err': [], 'http_fail': [], 'steps': []}


def step(name, **kw):
    rep['steps'].append({'name': name, **kw})
    print('[step]', name, json.dumps(kw, ensure_ascii=False)[:400], flush=True)


def open_page(p):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 480, 'height': 800}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: rep['pageerrors'].append(str(e)))
    pg.on('console', lambda m: rep['console_err'].append([m.type, m.text]) if m.type in ('error', 'warning') else None)
    pg.on('response', lambda r: rep['http_fail'].append([r.status, r.url]) if r.status >= 400 else None)
    pg.goto(f'http://127.0.0.1:{PORT}/rush3.html')
    pg.wait_for_function('typeof window.__rush3Dbg === "function"', timeout=10000)
    time.sleep(1.0)
    cv = pg.evaluate('(()=>{const c=document.getElementById("game3"),b=c.getBoundingClientRect();'
                     'return{cssW:b.width,cssH:b.height,l:b.left,t:b.top}})()')
    return b, pg, cv


def main():
    with sync_playwright() as p:
        # ───────── A) S1 에서 입력 전환(F1)
        b, pg, cv = open_page(p)
        dbg = lambda: pg.evaluate('window.__rush3Dbg()')  # noqa: E731

        def css(lx, ly):
            return (cv['l'] + lx * cv['cssW'] / 480, cv['t'] + ly * cv['cssH'] / 800)

        step('load', dbg=dbg(), ok=(dbg()['state'] == 'title'))
        pg.screenshot(path=OUT + r'\bv-01-title.png')
        pg.mouse.click(*css(240, 467))          # STAGE 1 (y = 436 + 0*76 .. +62)
        time.sleep(0.4)
        step('startS1', dbg=dbg(), ok=(dbg()['state'] == 'run' and dbg()['stageId'] == 1))
        pg.mouse.move(*css(240, 600))
        time.sleep(0.5)
        x0 = dbg()['x']
        pg.keyboard.down('ArrowRight')
        time.sleep(2.0)
        x1 = dbg()['x']
        pg.keyboard.up('ArrowRight')
        time.sleep(0.6)
        x2 = dbg()['x']                         # 키를 놓은 뒤 옛 마우스 위치(240)로 돌아가지 않아야 한다
        pg.mouse.move(*css(200, 600))           # 마우스 재이동 → 마우스가 다시 이긴다
        time.sleep(1.4)
        x3 = dbg()['x']
        alive = dbg()['state'] == 'run'
        step('keyAfterMouse', x0=x0, afterKey2s=x1, afterRelease=x2, afterMouseAgain=x3, stillRunning=alive,
             ok=(alive and x1 - x0 > 80 and abs(x2 - x1) < 25 and abs(x3 - 200) < 25))
        b.close()

        # ───────── B) S2 에서 셔터·분리벽·결과
        b, pg, cv = open_page(p)
        dbg = lambda: pg.evaluate('window.__rush3Dbg()')  # noqa: E731
        pg.mouse.click(*css(240, 543))          # STAGE 2 (y = 436 + 1*76 .. +62)
        time.sleep(0.4)
        step('startS2', dbg=dbg(), ok=(dbg()['state'] == 'run' and dbg()['stageId'] == 2))

        # g1(z1140, armZ 340) → run.z 800 부터 열린다. 좌 칸 +1 차선(x120)에 붙어 통과한다
        pg.mouse.move(*css(120, 600))
        shot_closed = shot_open = None
        t0 = time.time()
        while time.time() - t0 < 30:
            z = dbg()['z']
            if shot_closed is None and 470 < z < 780:
                pg.screenshot(path=OUT + r'\bv-02-s2-gate-closed.png')
                shot_closed = z
            if shot_open is None and 830 < z < 1100:
                pg.screenshot(path=OUT + r'\bv-03-s2-gate-open.png')
                shot_open = z
                break
            time.sleep(0.03)
        step('gateShutterShots', closedAtZ=shot_closed, openAtZ=shot_open,
             ok=(shot_closed is not None and shot_open is not None))

        # 분리벽 w1(z1800~3000): 왼쪽 통 c1(병사 +3)만 노린다 → units +3 · weapon 은 rifle 유지
        pre = None
        wall_shot = False
        t0 = time.time()
        while time.time() - t0 < 60:
            d = dbg()
            if d['state'] != 'run':
                break
            z = d['z']
            if pre is None and z >= 1700:
                pre = {'z': z, 'units': d['units'], 'weapon': d['weapon']}
            pg.mouse.move(*css(120, 600))
            if not wall_shot and 2250 < z < 2500:
                pg.screenshot(path=OUT + r'\bv-04-s2-wall.png')
                wall_shot = True
            if z > 3100:
                break
            time.sleep(0.06)
        d = dbg()
        post = {'z': d['z'], 'units': d['units'], 'weapon': d['weapon'], 'state': d['state']}
        got_soldier = pre is not None and post['units'] - pre['units'] >= 3
        got_weapon = pre is not None and pre['weapon'] == 'rifle' and post['weapon'] == 'auto'
        step('wallOneSideOnly', pre=pre, post=post, gotSoldier=got_soldier, gotWeapon=got_weapon,
             ok=(got_soldier != got_weapon))    # 정확히 하나만

        # 결과 화면까지: z5400 게이트는 좌 칸 +2(x120) · z5800 좌 통 · 그 뒤 중앙
        t0 = time.time()
        while time.time() - t0 < 150:
            d = dbg()
            if d['state'] != 'run':
                break
            z = d['z']
            pg.mouse.move(*css(120 if z < 6100 else 240, 600))
            time.sleep(0.06)
        time.sleep(2.2)
        d = dbg()
        step('reachResult', dbg=d, ok=(d['state'] == 'result'))
        pg.screenshot(path=OUT + r'\bv-05-s2-result.png')
        saved = pg.evaluate('localStorage.getItem("starforgeRush.v3")')
        step('saved', raw=saved, ok=(saved is not None))
        b.close()


try:
    main()
finally:
    srv.shutdown()
    rep['ok_all'] = (all(s.get('ok', True) for s in rep['steps'])
                     and not rep['pageerrors'] and not rep['http_fail'])
    with open(OUT + r'\browser-verify.json', 'w', encoding='utf-8') as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    print('PAGEERRORS', rep['pageerrors'])
    print('CONSOLE', rep['console_err'][:10])
    print('HTTPFAIL', rep['http_fail'][:10])
    print('OK_ALL', rep['ok_all'])
