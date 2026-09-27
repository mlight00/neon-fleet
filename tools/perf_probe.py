# -*- coding: utf-8 -*-
"""r4.17 휴대폰 성능 측정(개선 루프 6바퀴): 무거운 장면의 프레임 시간을 CPU 를 N배 느리게 흉내 내어(CDP Emulation.setCPUThrottlingRate) 잰다.
   장면: A = 일반 구간 병사 150명·적 다수(13판 중간) · B = 광장 보스전 병사 100명(24판) · C = 대물결 끝 병사 120명(22판) · D = 보스 광역 공격 병사 100명(12판 쇳물)
   재는 것(장면마다 2초 데우고 6초): 프레임 간격 중간값·95%값·16.7ms(60fps) 넘은 비율 · 한 프레임 스크립트 시간(rAF 콜백 안 — 규칙 STEP + 그리기) 중간값·95%값.
   캡처용 조작(앞 구간 건너뛰기·병력 채우기·병사 보호·광장 충격 끄기)은 장면을 만들려는 것일 뿐 규칙·난이도와 무관하다. 임시 정적 서버는 끝나면 끈다.
   사용: python tools/perf_probe.py [--rate 4] [--out 폴더] [--root 저장소] [--scenes A,B,C,D]"""
import argparse, io, json, os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

ap = argparse.ArgumentParser()
ap.add_argument('--root', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument('--out', default=os.path.join(r'E:\workspace\claude\neon-fleet\review\perf', time.strftime('%Y%m%d_%H%M')))
ap.add_argument('--rate', type=float, default=4.0)
ap.add_argument('--scenes', default='A,B,C,D')
o = ap.parse_args()
os.makedirs(o.out, exist_ok=True)

def free_port():
    while True:
        s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close()
        if 10000 < p < 60000: return p

SEED = json.dumps({'starforgeRush.v3': json.dumps({'v': 3, 'stages': {}, 'lastStage': 1, 'difficulty': 'brutal', 'volume': 0, 'mute': True, 'seenShutter': True, 'seenVehicle': True}),
                   'starforgeRush.v3.wallet': json.dumps({'coins': 0, 'runNo': 1, 'paid': [], 'firstClears': list(range(1, 25)), 'up': {'power': 0, 'rate': 0, 'multi': 0}})})
#  rAF 가로채기: 콜백이 불린 시각(프레임 간격)과 콜백 안에서 쓴 시간(스크립트 시간)을 모은다. __rec 가 참일 때만
INIT = r"""
(() => { try {
  if (!sessionStorage.getItem('__seeded')) { const seed = %s; localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); }
} catch (e) {}
  window.__rec = false; window.__ts = []; window.__js = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); if (window.__rec) { window.__ts.push(t); window.__js.push(performance.now() - s); } });
})();
""" % SEED
GUARD = """() => { clearInterval(window.__guard); window.__guard = setInterval(() => { const a = window.__rush3App; const r = a && a.getRun();
  if (!r || a.getState() !== 'run') return; for (const u of r.units) if (u.hp < 2) u.hp = 2;
  if (r.arena && r.arena.boss) { r.arena.boss.touchDmg = 0; if (r.arena.boss.shock) r.arena.boss.shock.dmg = 0; } }, 16); }"""
JUMP = """(z) => { const run = window.__rush3App.getRun(); run.z = run.prevZ = z;
  let i = run.spawnCursor; while (i < run.spawns.length && run.spawns[i].z <= z) i++; run.spawnCursor = i;
  run.enemies = run.enemies.filter((e) => e.z > z - 150); return i; }"""
FILL = """async (n) => { const run = window.__rush3App.getRun(); const sq = await import('/rush3/squad.js');
  if (run.units.length < n) sq.addUnits(run, n - run.units.length); run.weapon = 'auto'; run.weaponMk = 2; return run.units.length; }"""
ENDZ = "() => { const r = window.__rush3App.getRun(); return r.eliteZ ?? r.finishZ ?? r.length ?? null; }"
COUNTS = "() => { const r = window.__rush3App.getRun(); return { units: r.units.length, enemies: r.enemies.length, bullets: r.bullets.length, eshots: (r.eshots || []).length, bosses: (r.bosses || []).filter((b) => !b.dead).length, state: window.__rush3App.getState() }; }"
#  장면: (이름, 판, 위치(끝맺음 기준 비율 또는 끝맺음 − px), 병력)
SCENES = {'A': ('일반 구간 병사 150명', 13, ('frac', 0.55), 150), 'B': ('광장 보스전 병사 100명', 24, ('end', -30), 100),
          'C': ('대물결 끝 병사 120명', 22, ('end', -200), 120), 'D': ('보스 광역 공격 병사 100명', 12, ('end', -30), 100)}

def pct(xs, q):
    if not xs: return None
    s = sorted(xs); return s[min(len(s) - 1, int(q * (len(s) - 1)))]

port = free_port(); base = 'http://127.0.0.1:%d' % port
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', o.root], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
res = {}
try:
    time.sleep(0.8)
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        for key in [k.strip() for k in o.scenes.split(',') if k.strip()]:
            name, sid, where, n = SCENES[key]
            c = br.new_context(viewport={'width': 480, 'height': 800}, device_scale_factor=2)
            c.add_init_script(INIT)
            p = c.new_page()
            p.goto(base + '/rush3.html?dev=1')
            p.wait_for_function('() => !!window.__rush3App')
            p.evaluate('() => window.__rush3App.ready')
            p.wait_for_timeout(1500)
            p.evaluate('(s) => window.__rush3App.startRun(s)', sid)
            p.evaluate(GUARD)
            p.wait_for_timeout(1500)
            ez = p.evaluate(ENDZ) or 6000
            z = ez * where[1] if where[0] == 'frac' else ez + where[1]
            p.evaluate(JUMP, z)
            p.evaluate(FILL, n)
            cdp = c.new_cdp_session(p)
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': o.rate})
            p.wait_for_timeout(2000)
            p.evaluate('() => { window.__ts = []; window.__js = []; window.__rec = true; }')
            p.wait_for_timeout(6000)
            ts, js = p.evaluate('() => { window.__rec = false; return [window.__ts, window.__js]; }')
            cnt = p.evaluate(COUNTS)
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
            p.screenshot(path=os.path.join(o.out, 'scene_%s.png' % key))
            gaps = [b - a for a, b in zip(ts, ts[1:])]
            r = {'scene': name, 'stage': sid, 'frames': len(ts), 'fps': round(len(gaps) / (sum(gaps) / 1000), 1) if gaps else 0,
                 'gapMedMs': round(pct(gaps, 0.5), 1) if gaps else None, 'gapP95Ms': round(pct(gaps, 0.95), 1) if gaps else None,
                 'over16_7': round(sum(1 for g in gaps if g > 17.5) / max(1, len(gaps)), 2),
                 'jsMedMs': round(pct(js, 0.5), 2) if js else None, 'jsP95Ms': round(pct(js, 0.95), 2) if js else None, 'counts': cnt}
            res[key] = r
            print(key, json.dumps(r, ensure_ascii=False), flush=True)
            c.close()
        br.close()
finally:
    srv.terminate()
    try: srv.wait(timeout=5)
    except Exception: srv.kill()
json.dump({'rate': o.rate, 'when': time.strftime('%Y-%m-%d %H:%M'), 'scenes': res}, io.open(os.path.join(o.out, 'perf.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('out', o.out)
