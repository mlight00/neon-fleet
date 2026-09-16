# -*- coding: utf-8 -*-
"""정예 배수(eliteHp·eliteFireRate)만 탐색. balance.js 의 hard/brutal 줄을 임시로 바꿔 probe_one.mjs 를 돌리고 끝나면 원문 복원."""
import re, json, subprocess, sys, os
BAL = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\rush3\balance.js'
PROBE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe_one.mjs')
orig = open(BAL, encoding='utf-8').read()

def set_mult(s, diff, hp, fr):
    pat = re.compile(r'(\n\s*' + diff + r':\s*\{[^\n]*?eliteHp:\s*)([0-9.]+)([^\n]*?eliteFireRate:\s*)([0-9.]+)')
    s2, n = pat.subn(lambda m: m.group(1) + str(hp) + m.group(3) + str(fr), s)
    assert n == 1, (diff, n)
    return s2

def run(diff, hp, fr, ids):
    open(BAL, 'w', encoding='utf-8', newline='\n').write(set_mult(orig, diff, hp, fr))
    r = subprocess.run(['node', PROBE, diff, ids], capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        print('ERR', r.stderr[:500]); sys.exit(1)
    return json.loads(r.stdout.strip().splitlines()[-1])

def ok_hard(o):
    return all(o['aim'][k]['won'] for k in ('1', '2', '3')) and not o['center']['2']['won'] and not o['center']['3']['won']
def ok_brutal(o):
    return o['aim']['1']['won'] and not o['center']['2']['won'] and not o['center']['3']['won']

log = []
try:
    which = sys.argv[1] if len(sys.argv) > 1 else 'both'
    if which in ('hard', 'both'):
        found = None
        for fr in [1.25, 1.15, 1.1, 1.0]:
            for hp in [1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1.0]:
                o = run('hard', hp, fr, '1,2,3')
                line = {'d': 'hard', 'eliteHp': hp, 'eliteFireRate': fr, 'ok': ok_hard(o), 'aim': o['aim'], 'center': o['center']}
                log.append(line); print(json.dumps(line, ensure_ascii=False), flush=True)
                if line['ok']:
                    found = (hp, fr); break
            if found: break
        print('HARD_FOUND', found, flush=True)
    if which in ('brutal', 'both'):
        found = None
        for fr in [1.5, 1.35, 1.25, 1.15, 1.0]:
            for hp in [2.4, 2.2, 2.0, 1.8, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1.0]:
                o = run('brutal', hp, fr, '1')
                line = {'d': 'brutal', 'eliteHp': hp, 'eliteFireRate': fr, 'ok': ok_brutal(o), 'aim': o['aim'], 'center': o['center']}
                log.append(line); print(json.dumps(line, ensure_ascii=False), flush=True)
                if line['ok']:
                    found = (hp, fr); break
            if found: break
        print('BRUTAL_FOUND', found, flush=True)
finally:
    open(BAL, 'w', encoding='utf-8', newline='\n').write(orig)
    json.dump(log, open(os.path.join(os.path.dirname(PROBE), 'search_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('restored balance.js')
