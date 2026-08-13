// ── §G-34 §3-5 / §9 — 개발 저장 서버 동시성 회귀 ──
//  Codex 5차 G-5[중대]: `exists` 확인과 `os.replace` 사이가 원자적이지 않다.
//  ThreadingTCPServer 의 두 스레드가 둘 다 "없음"을 보면 **둘 다 성공**하거나 마지막이 첫 파일을 덮어쓴다.
//  기본 no-overwrite 계약("같은 이름 재저장은 409")이 동시 요청에서 깨진다.
//
//  ⚠️이 테스트는 **실제 서버 프로세스를 띄워** HTTP 로 때린다(문자열 대조 금지 — §G-34 §2-7).
//  ⚠️사용자 `_shots` 를 건드리지 않는다. 임시 폴더 + 임시 포트만 쓰고 끝나면 지운다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = resolve(fileURLToPath(new URL('../../_tools/nocache-server.py', import.meta.url)));
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TOKEN = 'race-test-token';
//  포트 충돌을 피하려고 실행마다 다른 값을 쓴다(테스트가 병렬로 돌아도 안전하게).
const PORT = 8500 + (process.pid % 300);

/** 최소 PNG — magic 검사(§G-28 P0-4)를 통과해야 저장 경로까지 도달한다. */
const PNG_B64 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]).toString('base64');

function startServer(shotDir, extraArgs = []) {
  const p = spawn('python', ['-u', SERVER, String(PORT), ROOT, `--token=${TOKEN}`, ...extraArgs], {
    env: { ...process.env, NF_SHOT_DIR: shotDir, PYTHONIOENCODING: 'utf-8' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return p;
}

/** 서버가 실제로 응답할 때까지 기다린다(고정 sleep 은 느리고 불안정하다). */
async function waitReady(timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/index.html`, { cache: 'no-store' });
      if (r.status) return true;
    } catch { /* 아직 안 떴다 */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

const post = (name, token = TOKEN) =>
  fetch(`http://127.0.0.1:${PORT}/__save?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'X-NF-Token': token },      // §G-34 §9: 새 사용 예시는 헤더 우선
    body: PNG_B64,
  }).then((r) => r.status).catch(() => 'ERR');

test('G34-SERVER-RACE: 같은 이름 동시 저장은 정확히 하나만 200, 나머지는 409', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nf-race-'));
  const srv = startServer(dir);
  try {
    assert.ok(await waitReady(), '서버가 떴다');

    //  ① 같은 이름으로 6개를 **동시에** 던진다. 경쟁이 있으면 2개 이상 200 이 되거나 파일이 덮어써진다.
    const results = await Promise.all(Array.from({ length: 6 }, () => post('race.png')));
    const ok = results.filter((s) => s === 200).length;
    const conflict = results.filter((s) => s === 409).length;
    assert.equal(ok, 1, `정확히 하나만 성공해야 한다 — 실측 200:${ok} / 409:${conflict} / 전체 ${JSON.stringify(results)}`);
    assert.equal(ok + conflict, results.length, '200 아니면 409 — 다른 코드가 나오면 계약 위반');

    //  ② 파일은 하나만 남고 내용이 온전해야 한다(.part 잔여 0).
    const files = readdirSync(dir);
    assert.deepEqual(files, ['race.png'], `임시 조각이 남지 않는다 — 실측 ${JSON.stringify(files)}`);
    const buf = readFileSync(join(dir, 'race.png'));
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG 매직이 온전하다');

    //  ③ 다른 이름은 병렬로 전부 성공해야 한다(직렬화가 이름 단위인지 확인).
    const many = await Promise.all(['a.png', 'b.png', 'c.png', 'd.png'].map((n) => post(n)));
    assert.deepEqual(many, [200, 200, 200, 200], `다른 이름은 병렬 허용 — 실측 ${JSON.stringify(many)}`);
  } finally {
    srv.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('G34-SERVER-RACE-OVERWRITE: --overwrite 에서는 동시 요청이 모두 200 이어도 파일이 깨지지 않는다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nf-race-ow-'));
  const srv = startServer(dir, ['--overwrite']);
  try {
    assert.ok(await waitReady(), '서버가 떴다');
    const results = await Promise.all(Array.from({ length: 4 }, () => post('ow.png')));
    //  ⚠️Windows 는 **열려 있는 파일을 os.replace 하지 못한다.** 같은 이름에 동시 교체가 몰리면
    //   일부 요청이 실패할 수 있고 이는 플랫폼 제약이다. §G-34 §9 의 실제 계약은 "전부 성공"이 아니라
    //   **손상 0 · .part 잔여 0** 이므로 그것을 검증한다(성공이 하나도 없으면 그건 결함).
    const ok = results.filter((s) => s === 200).length;
    assert.ok(ok >= 1, `적어도 하나는 저장돼야 한다 — 실측 ${JSON.stringify(results)}`);
    assert.ok(results.every((s) => s === 200 || s === 'ERR' || s === 500),
      `409 는 나오면 안 된다(덮어쓰기 허용) — 실측 ${JSON.stringify(results)}`);
    const files = readdirSync(dir);
    assert.deepEqual(files, ['ow.png'], `.part 잔여 0 — 실측 ${JSON.stringify(files)}`);
    const buf = readFileSync(join(dir, 'ow.png'));
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(buf.length, 72, '온전한 크기(8 매직 + 64 패딩)');
  } finally {
    srv.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
