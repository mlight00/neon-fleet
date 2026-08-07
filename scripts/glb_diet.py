# -*- coding: utf-8 -*-
"""VARCO/Tripo GLB → 게임용 다이어트 (§G-5 파이프라인 2단계)
사용: python scripts/glb_diet.py <입력.glb> <출력.glb>
  1) gltfpack -si 0.016 -sa -noq  : 50만 tri → ~8천 (aggressive — UV 아일랜드 많은 AI 메시는 -sa 필수)
  2) 텍스처 4K → 1K (diffuse=JPG q88, 나머지=PNG) — bufferView 전체 재패킹
결과 목표: ≤2MB, ≤1만 tri (원본 51MB/50만 tri 급 입력 기준)
"""
import struct, json, io, os, sys, subprocess, tempfile
from PIL import Image

def diet(src, dst, ratio=0.06, tex=1024, quality=90, aggressive=True):
    """ratio >= 0.99 = 단순화 스킵(VARCO 리메시본 등 이미 정리된 토폴로지) — 양자화만 적용해 메시 용량 절감.

    tex/quality = diffuse 목표 해상도·JPEG 품질. 포털 배포본(50MB 예산)은 낮춰 쓰고, 개발본은 기본값.
    aggressive=False = gltfpack -sa 생략 — 리메시된 균일 토폴로지는 일반 단순화로도 형태가 유지된다
    (-sa 는 UV 아일랜드를 무시해 '녹은 무늬'를 만든 전력이 있다 — §G-5 실측).
    """
    tmp = os.path.join(tempfile.gettempdir(), '_glb_diet_tmp.glb')
    args = ['npx', '--yes', 'gltfpack', '-i', src, '-o', tmp]
    if ratio < 0.99:
        args += ['-si', str(ratio)]
        if aggressive:
            args += ['-sa']
    r = subprocess.run(args, shell=True, capture_output=True, text=True)
    if not os.path.exists(tmp):
        raise SystemExit('gltfpack 실패: ' + r.stderr[-400:])
    f = open(tmp, 'rb')
    struct.unpack('<III', f.read(12))
    clen, _ = struct.unpack('<II', f.read(8))
    doc = json.loads(f.read(clen).decode('utf-8'))
    blen, _ = struct.unpack('<II', f.read(8))
    buf = f.read(blen); f.close()

    img_new = {}
    for i, im in enumerate(doc.get('images', [])):
        bv = doc['bufferViews'][im['bufferView']]
        raw = buf[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        pil = Image.open(io.BytesIO(raw))
        out = io.BytesIO()
        if (im.get('name') or '').lower() in ('diffuse', 'basecolor', 'albedo') or i == 1:
            if max(pil.size) > tex: pil = pil.resize((tex, tex), Image.LANCZOS)
            from PIL import ImageEnhance
            pil = ImageEnhance.Color(pil.convert('RGB')).enhance(1.12)   # 파이프라인 채도 손실 보상
            pil.save(out, 'JPEG', quality=quality, subsampling=0); im['mimeType'] = 'image/jpeg'
        else:
            # normal 등 보조맵은 512 로 충분(화면 표시 크기 기준) — 50MB 빌드 예산의 주범
            aux = max(256, tex // 2)
            if max(pil.size) > aux: pil = pil.resize((aux, aux), Image.LANCZOS)
            pil.convert('RGB').save(out, 'PNG', optimize=True); im['mimeType'] = 'image/png'
        img_new[im['bufferView']] = out.getvalue()

    new_buf = bytearray()
    for idx, bv in enumerate(doc['bufferViews']):
        data = img_new.get(idx) or buf[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        while len(new_buf) % 4: new_buf.append(0)
        bv['byteOffset'] = len(new_buf); bv['byteLength'] = len(data)
        new_buf.extend(data)
    doc['buffers'][0]['byteLength'] = len(new_buf)

    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    while len(js) % 4: js += b' '
    while len(new_buf) % 4: new_buf.append(0)
    with open(dst, 'wb') as o:
        o.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(new_buf)))
        o.write(struct.pack('<II', len(js), 0x4E4F534A)); o.write(js)
        o.write(struct.pack('<II', len(new_buf), 0x004E4942)); o.write(bytes(new_buf))
    os.remove(tmp)
    tri = sum(doc['accessors'][pr['indices']]['count'] // 3 for m in doc['meshes'] for pr in m['primitives'] if 'indices' in pr)
    print(f'{os.path.basename(src)} -> {os.path.basename(dst)}: {tri} tri, {os.path.getsize(dst)//1024} KB')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit('사용: python scripts/glb_diet.py <입력.glb> <출력.glb> [ratio]')
    a = sys.argv[1:]
    pos = [x for x in a if not x.startswith('--')]
    def opt(name, cast, dflt):
        return cast(a[a.index(name) + 1]) if name in a else dflt
    diet(pos[0], pos[1], float(pos[2]) if len(pos) > 2 else 0.06,
         tex=opt('--tex', int, 1024), quality=opt('--quality', int, 90),
         aggressive='--noaggr' not in a)
