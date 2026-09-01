# tools/rush-import-sprites.py — newmode\sprites 의 생성 원본을 게임 규격으로 반입한다.
#  · 체크무늬/흰 배경이 구워진 PNG 도 자동 투명화(무채색·밝음 외곽 채우기 — M01 실측 방식)
#  · 알파 경계로 잘라 세로 512px 로 축소 → assets/rush/<이름>.png
#   python tools/rush-import-sprites.py            (전체)
#   python tools/rush-import-sprites.py M01        (한 장)
import os
import sys
from collections import deque

from PIL import Image

SRC = r'E:\workspace\claude\neon-fleet\newmode\sprites'
DST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'rush')
NAMES = ['M01', 'M02', 'M03', 'M04', 'M05', 'SOLDIER', 'M01_front',
         'E1_scrapbit', 'E2_ramhound', 'E3_wallguard', 'E4_needleeye',
         'E5_wheeler', 'E6_signaler', 'E7_cartyard', 'E8_manholejumper', 'E9_spawnpod', 'E10_magnethead',
         'B1_grader', 'B2_gantrywidow', 'B3_railleviathan', 'B4_smelter', 'B5_crownbreaker',
         'GATE', 'BG1', 'BG2', 'BG3', 'BG4', 'BG5']


def is_bg(p):
    r, g, b, a = p
    mx, mn = max(r, g, b), min(r, g, b)
    return a > 0 and (mx - mn) <= 6 and mn >= 190


def strip_bg(im):
    im = im.convert('RGBA')
    if im.getextrema()[3][0] < 255:      # 이미 투명 알파가 있으면 그대로
        return im
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(px[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return im


def run(only=None):
    os.makedirs(DST, exist_ok=True)
    for name in NAMES:
        if only and name != only:
            continue
        #  M-01.png / M01_clean.png / e-01·b-01·bg-01 같은 변형 이름도 받아준다
        cands = [name, name.replace('M0', 'M-0'), name + '_clean']
        import re
        m = re.match(r'^([EB]|BG)(\d+)_?', name)
        if m:
            cands.append('%s-%02d' % (m.group(1).lower(), int(m.group(2))))
        src = next((os.path.join(SRC, c + '.png') for c in cands
                    if os.path.exists(os.path.join(SRC, c + '.png'))), None)
        if not src:
            print('  없음(건너뜀):', name)
            continue
        if name.startswith('BG'):
            #  배경: 불투명 그대로, 폭 480 축소 + 상단 48px 를 하단과 크로스블렌드(세로 무한 타일 이음새 제거)
            im = Image.open(src).convert('RGB')
            r = 480 / im.size[0]
            im = im.resize((480, max(1, int(im.size[1] * r))), Image.LANCZOS)
            F = 48
            w2, h2 = im.size
            px2 = im.load()
            for y in range(F):
                a = y / F                              # 0=하단 복제, 1=원래 상단
                for x in range(w2):
                    tr, tg, tb = px2[x, y]
                    br, bg_, bb = px2[x, h2 - F + y]
                    px2[x, y] = (int(br * (1 - a) + tr * a), int(bg_ * (1 - a) + tg * a), int(bb * (1 - a) + tb * a))
            im = im.crop((0, 0, w2, h2 - F))           # 겹친 만큼 잘라 완전 순환
            out = os.path.join(DST, name + '.png')
            im.save(out, optimize=True)
            print('  반입(배경/이음새):', name, im.size, '->', out)
            continue
        im = strip_bg(Image.open(src))
        bb = im.split()[3].getbbox()
        if bb:
            im = im.crop(bb)
        r = 512 / im.size[1]
        im = im.resize((max(1, int(im.size[0] * r)), 512), Image.LANCZOS)
        out = os.path.join(DST, name + '.png')
        im.save(out, optimize=True)
        print('  반입:', name, im.size, '->', out)


if __name__ == '__main__':
    run(sys.argv[1] if len(sys.argv) > 1 else None)
