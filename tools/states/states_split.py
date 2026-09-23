# -*- coding: utf-8 -*-
"""v7 적 3상태 라인업(Gemini) → 게임 반입 파일 3장.
   ① unchecker 로 가짜 투명(체커 그림) 제거 ② 세로 빈 열로 3칸 분할
   ③ 세 상태는 **같은 캔버스 높이**로 잘라 낸다(칸마다 bbox 로 자르면 상태마다 키가 달라져 그림이 커졌다 작아진다).
   가로는 칸 경계 그대로 두고 좌우 여백만 공통 비율로 줄인다."""
import io, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = r"E:\workspace\claude\neon-fleet\newmode\sprites\states"
DST = r"E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\assets\rush"

def unchecker(path, tol=14):
    im = Image.open(path).convert("RGBA"); a = np.array(im).astype(int)
    rgb = a[:, :, :3]; H, W = rgb.shape[:2]
    mx = rgb.max(axis=2); mn = rgb.min(axis=2); v = rgb.mean(axis=2)
    neutral = (mx - mn) <= tol
    ring = np.concatenate([v[:16].ravel(), v[-16:].ravel(), v[:, :16].ravel(), v[:, -16:].ravel()]).astype(int)
    hist = np.bincount(ring, minlength=256); A = int(hist.argmax()); hist2 = hist.copy(); hist2[max(0, A - 12):A + 13] = 0; B = int(hist2.argmax())
    #  체커 두 색 A·B **사이 값**(경계 안티에일리어싱)까지 배경으로 본다 — 근처만 보면 격자선 자국이 남는다(2026-09-23 실측).
    lo, hi = min(A, B) - 20, max(A, B) + 20
    nearAB = (v >= lo) & (v <= hi)
    #  ⚠️적은 **숯검정**이라 '중립색' 만으로 배경을 잡으면 몸체까지 배경 덩어리에 이어 붙어 통째로 지워진다(2026-09-23 실측).
    #   그래서 배경 후보 = 중립색 **이면서 체커 두 색(A·B) 근처** 인 화소로 좁힌다.
    neutral = neutral & nearAB
    #  ⚠️체커가 **어두운** 판(예: 141/55, 2026-09-24 E10 재생성)에서는 몸체의 짙은 회색 면이 체커 색과 같아,
    #   윤곽선의 가는 틈으로 바깥 배경과 이어지면 통째로 지워졌다. 배경 후보를 2px 깎아 **가는 다리를 끊은 뒤**
    #   테두리에 닿는 덩어리만 고르고, 다시 2px 되돌린다(후보 안에서만) — 넓은 바깥 배경은 그대로 잡히고 몸 안은 안 새어 든다
    core = ndi.binary_erosion(neutral, iterations=2, border_value=1)   # 화면 밖은 배경으로 본다(테두리가 깎이지 않게)
    lab, n = ndi.label(core, structure=np.ones((3, 3)))
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))); border.discard(0)
    bg = ndi.binary_dilation(np.isin(lab, list(border)), iterations=3) & neutral
    lab, n = ndi.label(neutral, structure=np.ones((3, 3)))
    idx = np.arange(1, n + 1)
    sizes = ndi.sum(neutral, lab, index=idx); frac = ndi.sum(nearAB & neutral, lab, index=idx) / np.maximum(sizes, 1)
    objs = ndi.find_objects(lab)
    #  갇힌 체커 조각(pocket) = 두 색 A·B 가 **둘 다** 섞여 있는 덩어리만(체커는 두 색이 번갈아 나온다).
    #   한 색뿐인 덩어리는 몸체의 면이다 — 어두운 체커(141/55)에서 E10 의 짙은 줄무늬가 통째로 지워진 원인(2026-09-24)
    nearA = np.abs(v - A) <= 12; nearB = np.abs(v - B) <= 12
    fa = ndi.sum(nearA & neutral, lab, index=idx) / np.maximum(sizes, 1)
    fb = ndi.sum(nearB & neutral, lab, index=idx) / np.maximum(sizes, 1)
    pockets = []
    for i in range(n):
        if (i + 1) in border or sizes[i] < 200 or frac[i] < 0.9: continue
        if fa[i] < 0.15 or fb[i] < 0.15: continue
        sl = objs[i]; bb = (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start)
        if bb > 0.25 * H * W: continue
        pockets.append(i + 1)
    if pockets: bg |= np.isin(lab, pockets)
    obj = ndi.binary_dilation(~bg, iterations=2)
    #  체커 두 색 **사이**(경계 안티에일리어싱, 예: 147↔199 의 173)는 A·B 근처가 아니어서 살아남아 **격자선 자국**으로 남는다.
    #   남은 덩어리 중 '가늘고 긴 것'(채움율 낮음)과 티끌을 지운다 — 몸체·파편은 채움율이 높아 살아남는다.
    lab2, n2 = ndi.label(obj, structure=np.ones((3, 3)))
    if n2:
        idx2 = np.arange(1, n2 + 1)
        ar = ndi.sum(obj, lab2, index=idx2)
        boxes = ndi.find_objects(lab2)
        drop = []
        for i in range(n2):
            sl = boxes[i]; bb = (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start)
            if ar[i] < 60 or (bb > 0 and ar[i] / bb < 0.08): drop.append(i + 1)
        if drop: obj = obj & ~np.isin(lab2, drop)
    res = np.dstack([rgb.astype(np.uint8), np.where(obj, 255, 0).astype(np.uint8)])
    return Image.fromarray(res, "RGBA"), {"A": A, "B": B, "bgPct": round(float(bg.mean() * 100), 1)}

def split3(im, base, names, mingap=12):
    a = np.array(im)[:, :, 3]
    cols = (a > 8).sum(axis=0).astype(float)
    #  칸 경계 = '완전히 빈 열'이 아니라 **잉크가 가장 적은 골**로 찾는다(체커 경계 찌꺼기가 남아 빈 열이 없다).
    #   세 상태가 고르게 놓이므로 1/3·2/3 부근 창에서 각각 최솟값을 고른다.
    k = 9; sm = np.convolve(cols, np.ones(k) / k, mode='same')
    W = im.width
    w1 = (int(W * 0.24), int(W * 0.45)); w2 = (int(W * 0.55), int(W * 0.78))
    c1 = w1[0] + int(np.argmin(sm[w1[0]:w1[1]])); c2 = w2[0] + int(np.argmin(sm[w2[0]:w2[1]]))
    cuts = sorted([c1, c2])
    xs = [0] + cuts + [im.width]
    rows = np.where((a > 8).any(axis=1))[0]
    y0, y1 = int(rows.min()), int(rows.max()) + 1          # 세 상태 공통 세로 구간
    pad = 6
    out = []
    for i, nm in enumerate(names):
        part = im.crop((xs[i], max(0, y0 - pad), xs[i + 1], min(im.height, y1 + pad)))
        pa = np.array(part)[:, :, 3]
        pcols = np.where((pa > 8).any(axis=0))[0]
        lx, rx = int(pcols.min()), int(pcols.max()) + 1     # 가로 여백만 칸별로 정리
        part = part.crop((max(0, lx - pad), 0, min(part.width, rx + pad), part.height))
        part.save(os.path.join(DST, nm + ".png"))
        out.append((nm, part.size))
    return out, cuts

#  사용법: python tools/states/states_split.py S_E7:E7_cartyard S_E8:E8_manholejumper ...
#   (인자 없으면 첫 반입 4종). 원본 = newmode/sprites/states/<S_..>.png · 결과 = assets/rush/<그림>_{hit,dmg,dead}.png (높이 512 로 축소)
if __name__ == "__main__":
    args = sys.argv[1:]
    JOBS = [tuple(a.split(":", 1)) for a in args] if args else [("S_E1", "E1_scrapbit"), ("S_E2", "E2_ramhound"), ("S_E5", "E5_wheeler"), ("S_E6", "E6_signaler")]
    tiles = []
    for src, base in JOBS:
        im, info = unchecker(os.path.join(SRC, src + ".png"))
        names = [base + s for s in ("_hit", "_dmg", "_dead")]
        out, cuts = split3(im, base, names)
        print(src, info, out if out else ("SPLIT FAIL", cuts))
        if not out: continue
        for nm, _ in out:
            p = os.path.join(DST, nm + ".png"); t = Image.open(p).convert("RGBA")
            if t.height > 512: t = t.resize((round(t.width * 512 / t.height), 512), Image.LANCZOS)
            t.save(p, optimize=True)
            v = t.copy(); v.thumbnail((200, 200)); bg = Image.new("RGBA", v.size, (40, 90, 40, 255)); bg.alpha_composite(v); tiles.append(bg)
    if tiles:
        W = sum(t.width for t in tiles) + 6 * (len(tiles) - 1); H = max(t.height for t in tiles)
        m = Image.new("RGB", (W, H), (40, 90, 40)); x = 0
        for t in tiles: m.paste(t.convert("RGB"), (x, 0)); x += t.width + 6
        out = os.path.join(SRC, "_preview_last.png")
        m.save(out); print("preview", out, m.size)
