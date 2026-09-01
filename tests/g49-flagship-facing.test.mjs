// §G-49 — 기함 3D 모델이 **앞을 보는지** 실제 지오메트리로 검사한다.
//
//  왜 필요한가: 이사 제보 "t0 부터 t5 까지 앞뒤가 뒤집힌다". 그때 테이블 검사는 통과하고 있었다 —
//  소스에 `rotY: Math.PI` 가 적혀 있는지만 봤기 때문이다. **적힌 값이 맞는지는 아무도 안 봤다.**
//  회전이 맞는지는 모델을 읽어야만 알 수 있다. 그래서 여기서 GLB 를 직접 파싱한다.
//
//  판정 기준: 게임 함미 카메라는 배 뒤에 있고 기수가 **+z** 를 봐야 한다.
//   기수는 좁은 끝이다 — 긴 축의 양 끝 10% 구간에서 단면 폭을 재면 좁은 쪽이 기수다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAG3D } from '../js/chase3d-prop-defs.js';

const ROOT = new URL('../', import.meta.url);

/** GLB 에서 모든 POSITION 정점을 읽는다(비압축 float32 전제 — 우리 파이프라인 산출물). */
function readPositions(rel) {
  const buf = readFileSync(new URL(rel, ROOT));
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binOff = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binOff);
  const bin = buf.subarray(binOff + 8, binOff + 8 + binLen);
  const pts = [];
  for (const mesh of json.meshes) {
    for (const pr of mesh.primitives) {
      const acc = json.accessors[pr.attributes.POSITION];
      assert.equal(acc.componentType, 5126, `${rel}: POSITION 이 float32 가 아니다 — 파서를 고쳐라`);
      const bv = json.bufferViews[acc.bufferView];
      const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const stride = bv.byteStride || 12;
      for (let i = 0; i < acc.count; i++) {
        const o = base + i * stride;
        pts.push([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]);
      }
    }
  }
  return pts;
}

/** FLAG3D 의 rotX/rotY 를 적용한다(렌더러가 홀더에 거는 것과 같은 순서). */
function applyRot(p, def) {
  let [x, y, z] = p;
  if (def.rotX) {           // X 축 회전
    const c = Math.cos(def.rotX), s = Math.sin(def.rotX);
    [y, z] = [y * c - z * s, y * s + z * c];
  }
  if (def.rotY) {           // Y 축 회전
    const c = Math.cos(def.rotY), s = Math.sin(def.rotY);
    [x, z] = [x * c + z * s, -x * s + z * c];
  }
  return [x, y, z];
}

test('G49-FACING: 기함 6등급의 기수가 회전 적용 후 +z 를 본다', () => {
  for (const [tier, def] of Object.entries(FLAG3D)) {
    const pts = readPositions(def.glb).map((p) => applyRot(p, def));
    assert.ok(pts.length > 100, `T${tier}: 정점이 너무 적다(${pts.length})`);

    const mn = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])));
    const mx = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
    const ext = [0, 1, 2].map((i) => mx[i] - mn[i]);

    //  ① 회전 뒤에는 **z 가 가장 긴 축**이어야 한다(배는 앞뒤로 길다).
    assert.ok(ext[2] >= ext[0] && ext[2] >= ext[1],
      `T${tier}: 회전 뒤 긴 축이 z 가 아니다 — ${ext.map((v) => v.toFixed(2)).join(' × ')} (rotX 를 확인하라)`);

    //  ② 양 끝 10% 구간의 단면 폭 — **좁은 쪽이 기수**이고 +z 여야 한다.
    const loEdge = mn[2] + ext[2] * 0.10;
    const hiEdge = mn[2] + ext[2] * 0.90;
    const spanOf = (sel) => {
      const s = pts.filter((p) => sel(p[2]));
      if (!s.length) return 0;
      return Math.max(
        Math.max(...s.map((p) => p[0])) - Math.min(...s.map((p) => p[0])),
        Math.max(...s.map((p) => p[1])) - Math.min(...s.map((p) => p[1])),
      );
    };
    const rear = spanOf((v) => v < loEdge);    // -z 끝
    const nose = spanOf((v) => v > hiEdge);    // +z 끝
    assert.ok(nose < rear,
      `T${tier}: 앞뒤가 뒤집혔다 — +z 끝 폭 ${nose.toFixed(3)} 이 -z 끝 ${rear.toFixed(3)} 보다 넓다. `
      + `FLAG3D[${tier}] 의 rotY 를 ${def.rotY ? '빼라' : 'Math.PI 로 넣어라'}`);
  }
});
