# -*- coding: utf-8 -*-
"""r4.12 로딩 개선: 게임이 불러오는 PNG 그림마다 옆에 같은 크기의 WebP 를 만든다(PNG 는 그대로 — 옛 브라우저·검사 ART-1 이 쓴다).
   대상 = rush3/sprites.js 가 불러오는 목록(SPRITE_KEYS3 → assets/rush/, SHEETS3 → assets/rush3/, 무기 아이콘 → assets/rush3/weapons/).
   결과 목록 = assets/webp-manifest.json { "상대경로(.png)": { w, h, png, webp } } — 검사가 WebP 크기가 PNG 와 같은지 본다.
   사용: python tools/webp_build.py            (바뀐 PNG 만 다시 만든다 — PNG 가 WebP 보다 새것이면)
         python tools/webp_build.py --force    (전부 다시)"""
import json, os, re, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORCE = '--force' in sys.argv
#  품질: 캐릭터·효과(투명) = q 85 · 배경(불투명) = q 80. 알파는 무손실 품질 100(기본) — 연기·빛 번짐의 반투명 띠가 계단지지 않게
Q_ALPHA, Q_OPAQUE = 85, 80


def targets():
    #  sprites.js 를 Node 로 읽어 실제 불러오는 파일 목록을 그대로 얻는다(목록을 두 곳에 적지 않는다)
    js = r"""
import('./rush3/sprites.js').then((m) => {
  const out = [];
  for (const name of Object.values(m.SPRITE_KEYS3)) out.push('assets/rush/' + name + '.png');
  for (const meta of Object.values(m.SHEETS3)) if (!meta.pending) out.push(m.SHEET_BASE3 + meta.file + '.png');
  for (const id of m.WEAPON_ICON_IDS3) for (const mk of [1, 2, 3]) out.push(m.WEAPON_ICON_BASE3 + 'W_' + id + '_' + mk + '.png');
  console.log(JSON.stringify([...new Set(out)]));
});
"""
    r = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def main():
    man_path = os.path.join(ROOT, 'assets', 'webp-manifest.json')
    man = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) and not FORCE else {}
    tot_png = tot_webp = made = 0
    missing = []
    for rel in targets():
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            missing.append(rel)
            continue
        dst = src[:-4] + '.webp'
        if FORCE or not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
            im = Image.open(src)
            has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
            im = im.convert('RGBA' if has_alpha else 'RGB')
            im.save(dst, 'WEBP', quality=Q_ALPHA if has_alpha else Q_OPAQUE, method=6, alpha_quality=100)
            made += 1
        w, h = Image.open(src).size
        ww, wh = Image.open(dst).size
        assert (w, h) == (ww, wh), rel + ' 크기 다름'
        man[rel] = {'w': w, 'h': h, 'png': os.path.getsize(src), 'webp': os.path.getsize(dst)}
        tot_png += man[rel]['png']; tot_webp += man[rel]['webp']
    json.dump(dict(sorted(man.items())), open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('만든 WebP', made, '/ 대상', len(man), '· PNG 합계 %.1f MB → WebP %.1f MB' % (tot_png / 1048576, tot_webp / 1048576))
    if missing:
        print('없는 PNG(건너뜀):', ', '.join(missing))


if __name__ == '__main__':
    main()
