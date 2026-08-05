# -*- coding: utf-8 -*-
"""VARCO/Tripo GLB → 게임용 다이어트 (§G-5 파이프라인 2단계)
사용: python scripts/glb_diet.py <입력.glb> <출력.glb>
  1) gltfpack -si 0.016 -sa -noq  : 50만 tri → ~8천 (aggressive — UV 아일랜드 많은 AI 메시는 -sa 필수)
  2) 텍스처 4K → 1K (diffuse=JPG q88, 나머지=PNG) — bufferView 전체 재패킹
결과 목표: ≤2MB, ≤1만 tri (원본 51MB/50만 tri 급 입력 기준)
"""
import struct, json, io, os, sys, subprocess, tempfile
from PIL import Image

def diet(src, dst, ratio=0.016):
    tmp = os.path.join(tempfile.gettempdir(), '_glb_diet_tmp.glb')
    r = subprocess.run(['npx', '--yes', 'gltfpack', '-i', src, '-o', tmp,
                        '-si', str(ratio), '-sa', '-noq'], shell=True, capture_output=True, text=True)
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
        if max(pil.size) > 1024:
            pil = pil.resize((1024, 1024), Image.LANCZOS)
        out = io.BytesIO()
        if (im.get('name') or '').lower() in ('diffuse', 'basecolor', 'albedo') or i == 1:
            pil.convert('RGB').save(out, 'JPEG', quality=88); im['mimeType'] = 'image/jpeg'
        else:
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
    diet(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 0.016)
