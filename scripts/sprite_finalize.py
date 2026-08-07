# -*- coding: utf-8 -*-
"""§G-9 3D 렌더 → 게임 2D 스프라이트 마감.

이유: 3D 렌더는 사실적 PBR 이라 게임 2D 아트(발광·채도를 과장해 어두운 우주 배경에서 개체를 즉시 식별시키는 그림)
보다 어둡고 밋밋하다. 그대로 넣으면 "예쁘지만 안 보이는" 스프라이트가 된다(실측 판단).
그래서 렌더 원본을 (1) 채도·밝기 보정 (2) 실루엣 외곽 발광(어두운 배경 대비) 순으로 마감한 뒤 교체한다.

사용: python scripts/sprite_finalize.py <입력.png> <출력경로> [--glow 색상] [--sat 1.25] [--bright 1.10]
"""
import sys
from PIL import Image, ImageEnhance, ImageFilter


def fit_to_reference(im, ref):
    """정사각 타이트 렌더를 원본 스프라이트(ref)의 캔버스 규격·채움비에 맞춘다.

    게임은 스프라이트 캔버스 비율에 blit 배율을 묶어 둔다(SHIP_ART_ASPECT 등). 규격이 바뀌면
    개체 크기·히트박스 표시가 어긋나므로, 원본의 (캔버스 크기, 알파 bbox 채움비, bbox 중심)을
    그대로 재현한다. 종횡비가 달라도 '화면에서 차지하는 크기'가 원본과 같아진다.
    """
    rw, rh = ref.size
    rb = ref.split()[3].getbbox() or (0, 0, rw, rh)
    ref_w, ref_h = rb[2] - rb[0], rb[3] - rb[1]
    ref_cx, ref_cy = (rb[0] + rb[2]) / 2, (rb[1] + rb[3]) / 2

    b = im.split()[3].getbbox()
    if not b:
        return im.resize((rw, rh), Image.LANCZOS)
    body = im.crop(b)
    # 원본 bbox 안에 들어가는 최대 배율(종횡비 보존)
    k = min(ref_w / body.width, ref_h / body.height)
    nw, nh = max(1, round(body.width * k)), max(1, round(body.height * k))
    body = body.resize((nw, nh), Image.LANCZOS)

    out = Image.new('RGBA', (rw, rh), (0, 0, 0, 0))
    out.paste(body, (round(ref_cx - nw / 2), round(ref_cy - nh / 2)))
    return out


def finalize(src, dst, sat=1.25, bright=1.10, glow=None, glow_strength=0.55, glow_radius=9, ref=None):
    im = Image.open(src).convert('RGBA')
    if ref is not None:
        im = fit_to_reference(im, Image.open(ref).convert('RGBA'))
    rgb = Image.merge('RGB', im.split()[:3])
    alpha = im.split()[3]

    rgb = ImageEnhance.Color(rgb).enhance(sat)
    rgb = ImageEnhance.Brightness(rgb).enhance(bright)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
    body = Image.merge('RGBA', (*rgb.split(), alpha))

    if glow:
        # 실루엣(알파)을 흐려 만든 후광을 본체 뒤에 깔아 어두운 배경에서 윤곽이 뜨게 한다.
        halo_a = alpha.filter(ImageFilter.GaussianBlur(glow_radius))
        halo_a = halo_a.point(lambda v: int(min(255, v * glow_strength)))
        halo = Image.new('RGBA', im.size, glow + (0,))
        halo.putalpha(halo_a)
        out = Image.alpha_composite(halo, body)
    else:
        out = body

    if dst.lower().endswith('.webp'):
        out.save(dst, 'WEBP', quality=92, method=6, lossless=False)
    else:
        out.save(dst)
    return out.size


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2:
        print(__doc__)
        sys.exit(1)
    kw = {}
    glow = None
    i = 2
    while i < len(a):
        if a[i] == '--sat':
            kw['sat'] = float(a[i + 1]); i += 2
        elif a[i] == '--bright':
            kw['bright'] = float(a[i + 1]); i += 2
        elif a[i] == '--glow':
            h = a[i + 1].lstrip('#')
            glow = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)); i += 2
        elif a[i] == '--glowstr':
            kw['glow_strength'] = float(a[i + 1]); i += 2
        else:
            i += 1
    print(finalize(a[0], a[1], glow=glow, **kw))
