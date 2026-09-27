# -*- coding: utf-8 -*-
"""r4.14 배경 그림의 Gemini 워터마크(오른쪽 아래 네 갈래 반짝이) 지우기 — 개선 루프 3바퀴.
   대상 = assets/rush/BG1~5.png · ARENA1~2.png(480×812). 반짝이는 그림마다 늘 같은 자리·같은 모양의 옅은 회백색 네 갈래 별
   (배경 = (401~408, 785) 근처 약 22×28px · 광장 = (396, 741) 근처 약 29×29px — 2026-09-27 캡처·확대로 확인).
   ① 찾기: 예상 자리 반경 32px 안에서 밝기가 넓은 주변(중간값 흐림 45px)보다 8 이상 밝고 채도가 낮은 덩어리 중 예상 자리에 가장 가까운 것.
   ② 본보기 맞추기: 배경끼리는 모양이 같으므로, ①로 뚜렷이 잡힌 본보기(BG1)의 밝기 튐 모양을 각 배경 창에 맞대어(정규화 상관) 가장 잘 맞는 자리를 쓴다
      — 밝은 배경·어두운 배경 어디서든 같은 모양을 찾는다. 광장 두 장은 ①이 둘 다 잡는다.
   ③ 메우기: 가림막(덩어리를 3px 넓힘)을 OpenCV inpaint(TELEA, 반경 6)로 주변 무늬로 채운다. 원본은 --backup 폴더에 먼저 복사한다.
   사용: python tools/bg_unwatermark.py --backup <폴더> [--dry]   (그 뒤 python tools/webp_build.py 로 WebP 를 다시 만든다)"""
import argparse, json, os, shutil
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--backup', required=True)
ap.add_argument('--dry', action='store_true')
o = ap.parse_args()
os.makedirs(o.backup, exist_ok=True)
BG = ['BG1', 'BG2', 'BG3', 'BG4', 'BG5']
EXPECT = {**{n: (405, 785) for n in BG}, 'ARENA1': (396, 741), 'ARENA2': (396, 741)}
R, HALF = 32, 70


def load(name):
    p = os.path.join(ROOT, 'assets', 'rush', name + '.png')
    im = Image.open(p)
    return p, im, np.array(im.convert('RGB'))


def highpass(rgb, ex, ey):
    X0, Y0 = ex - HALF, ey - HALF
    X1, Y1 = min(rgb.shape[1], ex + HALF), min(rgb.shape[0], ey + HALF)
    win = rgb[Y0:Y1, X0:X1].astype(np.int16)
    gray = win.mean(axis=2)
    hp = gray - ndi.median_filter(gray, size=45)
    sat = win.max(axis=2) - win.min(axis=2)
    return hp, sat, (X0, Y0)


def detect(rgb, ex, ey):
    hp, sat, (X0, Y0) = highpass(rgb, ex, ey)
    lab, n = ndi.label((hp > 8) & (sat < 45))
    best = None
    for i, sl in enumerate(ndi.find_objects(lab)):
        area = int((lab[sl] == i + 1).sum())
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        cy, cx = (sl[0].start + sl[0].stop) / 2 + Y0, (sl[1].start + sl[1].stop) / 2 + X0
        dist = ((cx - ex) ** 2 + (cy - ey) ** 2) ** 0.5
        if dist <= R and 30 <= area <= 900 and 10 <= h <= 45 and 10 <= w <= 45 and 0.6 <= h / w <= 1.6:
            if best is None or dist < best['dist']:
                best = {'dist': dist, 'mask': (lab == i + 1), 'sl': sl, 'area': area, 'hp': hp, 'origin': (X0, Y0)}
    return best


report, masks = {}, {}
imgs = {n: load(n) for n in EXPECT}
#  ① 광장 = 찾기 그대로 · 본보기 = BG1 찾기
for n in ['ARENA1', 'ARENA2', 'BG1']:
    d = detect(imgs[n][2], *EXPECT[n])
    if d:
        full = np.zeros(imgs[n][2].shape[:2], bool)
        X0, Y0 = d['origin']
        full[Y0:Y0 + d['mask'].shape[0], X0:X0 + d['mask'].shape[1]] = d['mask']
        masks[n] = full
        report[n] = {'how': 'detect', 'area': d['area']}
tmpl = detect(imgs['BG1'][2], *EXPECT['BG1'])
assert tmpl, 'BG1 본보기를 못 찾음'
sl = tmpl['sl']
pad = 3
ty0, ty1, tx0, tx1 = sl[0].start - pad, sl[0].stop + pad, sl[1].start - pad, sl[1].stop + pad
T = tmpl['hp'][ty0:ty1, tx0:tx1].astype(np.float32)
TM = ndi.binary_dilation(tmpl['mask'][ty0:ty1, tx0:tx1], iterations=0) if False else tmpl['mask'][ty0:ty1, tx0:tx1]
#  ② 배경 2~5: 본보기 모양을 창에 맞대어 가장 잘 맞는 자리(정규화 상관). 어두운 배경(BG4·BG5)은 상관이 약해 엉뚱한 곳을 잡았다(0.4 대 (395,755)) —
#   2026-09-27 에 찾기·확대로 확인한 가운데를 고정값으로 쓴다(FIXED). 고정값 쪽은 가림막을 더 넓혀(5px) 자리 어긋남 몇 px 을 덮는다
FIXED = {'BG4': (404, 784), 'BG5': (408, 785)}
for n in BG[1:]:
    rgb = imgs[n][2]
    ex, ey = EXPECT[n]
    if n in FIXED:
        cx0, cy0 = FIXED[n]
        full = np.zeros(rgb.shape[:2], bool)
        y0, x0 = cy0 - TM.shape[0] // 2, cx0 - TM.shape[1] // 2
        full[y0:y0 + TM.shape[0], x0:x0 + TM.shape[1]] = TM
        masks[n] = ndi.binary_dilation(full, iterations=2)
        report[n] = {'how': 'fixed', 'at': [cx0, cy0]}
        continue
    hp, sat, (X0, Y0) = highpass(rgb, ex, ey)
    res = cv2.matchTemplate(hp.astype(np.float32), T, cv2.TM_CCOEFF_NORMED)
    #  예상 자리 반경 R 안에서만
    yy, xx = np.mgrid[0:res.shape[0], 0:res.shape[1]]
    cx, cy = xx + X0 + T.shape[1] / 2, yy + Y0 + T.shape[0] / 2
    res = np.where(((cx - ex) ** 2 + (cy - ey) ** 2) <= R * R, res, -1)
    y, x = np.unravel_index(int(np.argmax(res)), res.shape)
    score = float(res[y, x])
    if score < 0.5:
        report[n] = {'how': 'match', 'score': round(score, 2), 'skip': True}
        continue
    full = np.zeros(rgb.shape[:2], bool)
    full[Y0 + y:Y0 + y + TM.shape[0], X0 + x:X0 + x + TM.shape[1]] = TM
    masks[n] = full
    report[n] = {'how': 'match', 'score': round(score, 2), 'at': [int(X0 + x + T.shape[1] / 2), int(Y0 + y + T.shape[0] / 2)]}
#  ③ 메우기: 광장(고른 바닥) = inpaint · 배경 1~5 = **위쪽에서 옮겨 붙이기** — 반짝이가 건물 세로 기둥 가장자리에 걸쳐 있어 inpaint 는
#   가장자리를 뭉개 얼룩이 됐다(2026-09-27 전후 비교). 같은 x 줄의 25~120px 위(±6px)에서 가림막 둘레가 가장 비슷한 자리를 골라
#   그 무늬를 부드러운 가장자리(가우스 2px)로 겹쳐 붙인다 — 세로선이 이어진다
def shift_copy(rgb, mask):
    ring = ndi.binary_dilation(mask, iterations=6) & ~mask
    ys, xs = np.nonzero(ring)
    best = None
    for dy in range(25, 121):
        for dx in range(-6, 7):
            sy, sx = ys - dy, xs + dx
            if sy.min() < 0 or sx.min() < 0 or sx.max() >= rgb.shape[1]:
                continue
            d = float(((rgb[ys, xs].astype(np.int32) - rgb[sy, sx].astype(np.int32)) ** 2).mean())
            if best is None or d < best[0]:
                best = (d, dy, dx)
    _, dy, dx = best
    src = np.roll(np.roll(rgb, dy, axis=0), -dx, axis=1)
    a = cv2.GaussianBlur(ndi.binary_dilation(mask, iterations=2).astype(np.float32), (0, 0), 2)[:, :, None]
    return (rgb * (1 - a) + src * a).clip(0, 255).astype(np.uint8), (dy, dx, round(best[0], 1))


for n, m in masks.items():
    p, im, rgb = imgs[n]
    mask = ndi.binary_dilation(m, iterations=3)
    report[n]['maskPx'] = int(mask.sum())
    if o.dry:
        continue
    shutil.copy(p, os.path.join(o.backup, n + '.png'))
    if n.startswith('BG'):
        fixed_rgb, how = shift_copy(rgb, mask)
        report[n]['copyFrom'] = {'dy': how[0], 'dx': how[1], 'ringDiff': how[2]}
        out = Image.fromarray(fixed_rgb)
    else:
        fixed = cv2.inpaint(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), (mask * 255).astype(np.uint8), 6, cv2.INPAINT_TELEA)
        out = Image.fromarray(cv2.cvtColor(fixed, cv2.COLOR_BGR2RGB))
    if im.mode == 'RGBA':
        out = Image.fromarray(np.dstack([np.array(out), np.array(im)[:, :, 3]]), 'RGBA')
    out.save(p, optimize=True)
print(json.dumps(report, ensure_ascii=False))
json.dump(report, open(os.path.join(o.backup, 'unwatermark_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
