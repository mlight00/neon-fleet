# -*- coding: utf-8 -*-
"""r4.13 개선 루프 계측 도구: 24판 자동 점검(실제 페이지 · Playwright Chromium · 480×800).
   판마다 5곳(출발 직후 · 코스 45% · 끝맺음 직전 · 보스/중간 보스/대물결 한가운데 · 결과 화면)에서 잠깐 돌려 보고 다음을 모은다.
     · 오류: 페이지 예외 · 콘솔 오류 · HTTP 400 이상 응답
     · 멈춤: 판이 끝나지 않음(끝맺음을 강제로 당겨도 결과 화면이 안 나옴)
     · 글 겹침: 같은 프레임에 그린 서로 다른 글(글자 2개 이상 — 체력 숫자 같은 숫자 글은 뺀다)의 상자가 작은 쪽 넓이의 25% 넘게 겹침
     · 글 넘침: 글 상자가 화면(0~480) 밖으로 나감
   캡처용 조작(앞 구간 건너뛰기 · 병사가 쓰러지지 않게 · 끝맺음 당기기)은 화면을 보이게 하려는 것일 뿐 규칙·난이도와 무관하다.
   결과 = <out>/report.json · summary.md · 판마다 캔버스 그림(JPEG). 임시 정적 서버는 끝나면 반드시 끈다.
   사용: python tools/health_sweep.py [--out 폴더] [--stages 1,2,3] [--root 저장소]"""
import argparse, base64, io, json, os, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

ap = argparse.ArgumentParser()
ap.add_argument('--root', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument('--out', default=os.path.join(r'E:\workspace\claude\neon-fleet\review\health', time.strftime('%Y%m%d_%H%M')))
ap.add_argument('--stages', default=','.join(str(i) for i in range(1, 25)))
o = ap.parse_args()
os.makedirs(o.out, exist_ok=True)
STAGES = [int(x) for x in o.stages.split(',') if x.strip()]

def free_port():
    while True:
        s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close()
        if 10000 < p < 60000: return p

SEED = json.dumps({'starforgeRush.v3': json.dumps({'v': 3, 'stages': {}, 'lastStage': 1, 'difficulty': 'brutal', 'volume': 0, 'mute': True, 'seenShutter': True, 'seenVehicle': True}),
                   'starforgeRush.v3.wallet': json.dumps({'coins': 0, 'runNo': 1, 'paid': [], 'firstClears': list(range(1, 25)), 'up': {'power': 0, 'rate': 0, 'multi': 0}})})
#  글 그리기 가로채기: 같은 프레임에 그린 글의 상자(캔버스 좌표)를 모은다. 프레임 경계 = requestAnimationFrame 콜백 시작
INIT = r"""
(() => { try {
  if (!sessionStorage.getItem('__seeded')) { const seed = %s; localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); }
} catch (e) {}
  window.__frameTexts = []; window.__cur = []; window.__layer = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { window.__frameTexts = window.__cur; window.__cur = []; window.__layer = 0; cb(t); });
  //  층: 화면 전체를 짙게 덮는 사각형(결과·일시정지·강화 화면의 어두운 막, 배경 바탕)을 그릴 때마다 한 층 올린다 —
  //   막 아래(뒤)에 깔린 도로 글과 막 위의 글은 겹쳐도 보이지 않으니 같은 층끼리만 견준다. 그라디언트(피격 붉은 테두리)는 층으로 치지 않는다
  const fr = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    try { const tr = this.getTransform(), cw = this.canvas.width, ch = this.canvas.height;
      if (typeof this.fillStyle === 'string' && Math.abs(tr.a * w) >= cw * 0.9 && Math.abs(tr.d * h) >= ch * 0.9) {
        const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(this.fillStyle); const al = (m ? +m[1] : 1) * this.globalAlpha;
        if (al >= 0.45) window.__layer++; }
    } catch (e) {}
    return fr.call(this, x, y, w, h); };
  const px = (font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return m ? +m[1] : 10; };
  const rec = function (t, x, y, maxW) {
    const s = String(t); if (!s.trim()) return;
    const tr = this.getTransform(); const size = px(this.font);
    let w = this.measureText(s).width; if (maxW != null && w > maxW) w = maxW;
    const al = this.textAlign, bl = this.textBaseline;
    let left = al === 'center' ? x - w / 2 : (al === 'right' || al === 'end') ? x - w : x;
    let top = bl === 'middle' ? y - size / 2 : (bl === 'top' || bl === 'hanging') ? y : bl === 'bottom' || bl === 'ideographic' ? y - size : y - size * 0.8;
    window.__cur.push({ t: s, l: tr.a * left + tr.e, tp: tr.d * top + tr.f, w: tr.a * w, h: tr.d * size, a: this.globalAlpha, L: window.__layer });
  };
  for (const k of ['fillText', 'strokeText']) { const f = CanvasRenderingContext2D.prototype[k];
    CanvasRenderingContext2D.prototype[k] = function (t, x, y, m) { try { rec.call(this, t, x, y, m); } catch (e) {} return f.call(this, t, x, y, m); }; }
})();
""" % SEED

GUARD = """() => { clearInterval(window.__guard); window.__guard = setInterval(() => { const a = window.__rush3App; const r = a && a.getRun();
  if (!r || a.getState() !== 'run') return; for (const u of r.units) if (u.hp < 2) u.hp = 2; }, 16); }"""
JUMP = """(z) => { const run = window.__rush3App.getRun(); run.z = run.prevZ = z;
  let i = run.spawnCursor; while (i < run.spawns.length && run.spawns[i].z <= z) i++; run.spawnCursor = i;
  run.enemies = run.enemies.filter((e) => e.z > z - 150); return i; }"""
ENDZ = "() => { const r = window.__rush3App.getRun(); return r.eliteZ ?? r.finishZ ?? r.length ?? null; }"
#  끝맺음 당기기: 보스·중간 보스 = 체력 1 · 대물결 = 결승선 너머
FORCE_END = """() => { const r = window.__rush3App.getRun(); if (!r) return 'no-run';
  const alive = (r.bosses || []).filter((b) => !b.dead); if (alive.length) { for (const b of alive) b.hp = 1; return 'boss'; }
  if (r.finishZ != null) { r.z = r.prevZ = r.finishZ + 2; return 'finish'; } return 'none'; }"""
STATE = "() => { const a = window.__rush3App; const r = a.getRun(); return { state: a.getState(), z: r ? Math.round(r.z) : null, n: r ? r.units.length : 0, bosses: r ? (r.bosses || []).filter((b) => !b.dead).length : 0 }; }"

LETTERS = re.compile(r'[A-Za-z가-힣]')

def overlaps(texts):
    #  같은 글·같은 자리(외곽선 + 채움 두 번 그리기)는 하나로. 글자 2개 이상만(숫자 글 = 체력·병력 수는 겹쳐도 판 흐름)
    seen, boxes = set(), []
    for b in texts:
        if len(LETTERS.findall(b['t'])) < 2 or b['a'] <= 0.05: continue
        key = (b['t'], round(b['l']), round(b['tp']))
        if key in seen: continue
        seen.add(key); boxes.append(b)
    out = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i], boxes[j]
            if a['t'] == b['t'] or a.get('L', 0) != b.get('L', 0): continue
            ix = min(a['l'] + a['w'], b['l'] + b['w']) - max(a['l'], b['l'])
            iy = min(a['tp'] + a['h'], b['tp'] + b['h']) - max(a['tp'], b['tp'])
            if ix <= 0 or iy <= 0: continue
            small = min(a['w'] * a['h'], b['w'] * b['h'])
            if small > 0 and ix * iy / small > 0.25:
                out.append({'a': a['t'], 'b': b['t'], 'ratio': round(ix * iy / small, 2), 'at': [round(max(a['l'], b['l'])), round(max(a['tp'], b['tp']))]})
    spill = [{'t': b['t'], 'l': round(b['l']), 'r': round(b['l'] + b['w'])} for b in boxes if b['l'] < -1 or b['l'] + b['w'] > 481]
    return out, spill

def snap(p, name):
    d = p.evaluate("() => document.getElementById('game3').toDataURL('image/jpeg', 0.8)")
    open(os.path.join(o.out, name), 'wb').write(base64.b64decode(d.split(',')[1]))

def checkpoint(p, stage, tag, wait_ms, report):
    p.wait_for_timeout(wait_ms)
    texts = p.evaluate('() => window.__frameTexts')
    ov, sp = overlaps(texts)
    st = p.evaluate(STATE)
    name = 'S%02d_%s.jpg' % (stage, tag)
    snap(p, name)
    report.append({'stage': stage, 'at': tag, 'state': st, 'overlaps': ov, 'spill': sp, 'img': name})
    return st

port = free_port(); base = 'http://127.0.0.1:%d' % port
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', o.root], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
rows, errors, ends = [], [], {}
t_start = time.time()
try:
    for _ in range(50):
        try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
        except OSError: time.sleep(0.1)
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        for sid in STAGES:
            c = br.new_context(viewport={'width': 480, 'height': 800}, device_scale_factor=1)
            c.add_init_script(INIT)
            p = c.new_page()
            errs = []
            p.on('pageerror', lambda e, errs=errs: errs.append('pageerror: ' + str(e)))
            p.on('console', lambda m, errs=errs: errs.append('console: ' + m.text) if m.type == 'error' else None)
            p.on('response', lambda r, errs=errs: errs.append('http %d %s' % (r.status, r.url.split('/neon-fleet')[-1] if '/neon-fleet' in r.url else r.url.replace(base, ''))) if r.status >= 400 else None)
            p.goto(base + '/rush3.html?dev=1')
            p.wait_for_function('() => !!window.__rush3App')
            p.evaluate('() => window.__rush3App.ready')
            p.wait_for_timeout(300)
            p.evaluate('(s) => window.__rush3App.startRun(s)', sid)
            p.evaluate(GUARD)
            checkpoint(p, sid, '1_start', 2500, rows)
            ez = p.evaluate(ENDZ) or 6000
            p.evaluate(JUMP, ez * 0.45); checkpoint(p, sid, '2_mid', 2500, rows)
            p.evaluate(JUMP, ez - 260); checkpoint(p, sid, '3_before_end', 3000, rows)
            p.evaluate(JUMP, ez - 30); checkpoint(p, sid, '4_end_fight', 5000, rows)
            how = p.evaluate(FORCE_END)
            t0 = time.time(); st = None
            while time.time() - t0 < 25:
                st = p.evaluate(STATE)
                if st['state'] == 'result': break
                if st['state'] == 'run' and how == 'boss' and st['bosses'] > 0: p.evaluate(FORCE_END)
                p.wait_for_timeout(250)
            ends[sid] = {'forced': how, 'final': st['state'] if st else None, 'sec': round(time.time() - t0, 1)}
            checkpoint(p, sid, '5_result', 600, rows)
            errors += [{'stage': sid, 'e': e} for e in errs]
            print('S%02d' % sid, json.dumps(ends[sid], ensure_ascii=False), 'errors', len(errs), flush=True)
            c.close()
        br.close()
finally:
    srv.terminate()
    try: srv.wait(timeout=5)
    except Exception: srv.kill()

ov_rows = [r for r in rows if r['overlaps']]
sp_rows = [r for r in rows if r['spill']]
stuck = [s for s, v in ends.items() if v['final'] != 'result']
report = {'when': time.strftime('%Y-%m-%d %H:%M'), 'sec': round(time.time() - t_start), 'stages': STAGES, 'errors': errors, 'stuck': stuck,
          'ends': ends, 'overlapCount': sum(len(r['overlaps']) for r in rows), 'spillCount': sum(len(r['spill']) for r in rows), 'rows': rows}
json.dump(report, io.open(os.path.join(o.out, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
#  사람이 읽는 요약(겹친 글은 같은 짝을 한 줄로 묶는다)
pairs = {}
for r in rows:
    for x in r['overlaps']:
        k = (x['a'], x['b']); pairs.setdefault(k, []).append('S%02d %s' % (r['stage'], r['at']))
lines = ['# 24판 자동 점검 결과(%s)' % report['when'], '',
         '- 점검한 판: %d개 × 5곳 · 걸린 시간 %d초' % (len(STAGES), report['sec']),
         '- 오류(페이지 예외·콘솔 오류·HTTP 400 이상): %d건' % len(errors),
         '- 끝나지 않은 판(끝맺음을 당겨도 결과 화면이 안 나옴): %s' % (', '.join(map(str, stuck)) or '없음'),
         '- 글 겹침: %d건(서로 다른 짝 %d가지) · 글 넘침: %d건' % (report['overlapCount'], len(pairs), report['spillCount']), '']
if errors:
    lines += ['## 오류', ''] + ['- S%02d %s' % (e['stage'], e['e'][:160]) for e in errors[:40]] + ['']
if pairs:
    lines += ['## 겹친 글(짝 · 나온 곳)', '']
    for (a, b), where in sorted(pairs.items(), key=lambda kv: -len(kv[1])):
        lines.append('- "%s" ↔ "%s" — %d곳: %s' % (a, b, len(where), ', '.join(where[:6]) + (' …' if len(where) > 6 else '')))
    lines.append('')
if sp_rows:
    lines += ['## 화면 밖으로 나간 글', ''] + ['- S%02d %s: %s' % (r['stage'], r['at'], ', '.join('"%s"(%d~%d)' % (s['t'], s['l'], s['r']) for s in r['spill'])) for r in sp_rows] + ['']
io.open(os.path.join(o.out, 'summary.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print('\n'.join(lines[:8]))
print('out', o.out)
