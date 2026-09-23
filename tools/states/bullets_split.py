# -*- coding: utf-8 -*-
"""v8 탄환 라인업(Gemini) → BULLET_auto / BULLET_sniper / BULLET_scatter.
   states_split.py 의 unchecker(체커·흰 배경 제거)를 그대로 쓰고, 칸마다 **자기 bbox** 로 잘라 높이 256 으로 맞춘다
   (탄은 무기마다 길이가 달라 render.BULLET_LEN 이 화면 길이를 정한다 — 세 칸 공통 세로 구간을 쓰면 짧은 탄에 빈 여백이 남는다)."""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('ss', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'states_split_lib.py'))

SRC = r"E:\workspace\claude\neon-fleet\newmode\sprites\bullets_v8\L_bullets_v8.png"
DST = r"E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\assets\rush"
NAMES = ["BULLET_auto", "BULLET_sniper", "BULLET_scatter"]

def run(unchecker):
    im, info = unchecker(SRC)
    a = np.array(im)[:, :, 3]
    cols = (a > 8).sum(axis=0).astype(float)
    k = 9; sm = np.convolve(cols, np.ones(k) / k, mode='same'); W = im.width
    w1 = (int(W * 0.24), int(W * 0.45)); w2 = (int(W * 0.55), int(W * 0.78))
    cuts = sorted([w1[0] + int(np.argmin(sm[w1[0]:w1[1]])), w2[0] + int(np.argmin(sm[w2[0]:w2[1]]))])
    xs = [0] + cuts + [W]
    out = []
    for i, nm in enumerate(NAMES):
        part = im.crop((xs[i], 0, xs[i + 1], im.height))
        bb = part.getbbox()
        part = part.crop(bb)
        pad = 4
        cv = Image.new("RGBA", (part.width + 2 * pad, part.height + 2 * pad), (0, 0, 0, 0)); cv.paste(part, (pad, pad))
        h = 256; w = max(1, round(cv.width * h / cv.height))
        cv = cv.resize((w, h), Image.LANCZOS)
        cv.save(os.path.join(DST, nm + ".png"), optimize=True)
        out.append((nm, cv.size))
    return info, cuts, out
