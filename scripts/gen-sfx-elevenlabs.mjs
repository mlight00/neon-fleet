// ── ElevenLabs 공식 API 로 효과음 48개 생성 → 게임 규격 OGG ─────────────────────────────
//
//  이사님 유료 전환(Starter) 후 재생성용. 브라우저 UI 자동화는 다운로드 메뉴가 자동 클릭에
//  반응하지 않아(§G-44 실측) 막혔다 — 공식 API 는 그런 제약이 없다.
//
//  ⚠️API 키는 **환경변수로만** 받는다. 코드·저장소에 절대 남기지 않는다(이사님 Safety 규칙).
//     PowerShell:  $env:ELEVENLABS_API_KEY = "..." ; node scripts/gen-sfx-elevenlabs.mjs
//     Git Bash  :  ELEVENLABS_API_KEY=... node scripts/gen-sfx-elevenlabs.mjs
//
//  키 발급: https://elevenlabs.io/app/settings/api-keys
//
//  결과: assets/sound/_new-sfx/ 에 nf_sfx_<id>_<n>.ogg 48개.
//        기존 파일은 건드리지 않는다 — 들어보고 승인한 뒤 별도로 교체한다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/sound/_new-sfx');
const TMP = join(OUT, '_raw');
const FF = process.env.FFMPEG || 'C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe';

//  키는 두 곳에서만 읽는다. **저장소 안에는 절대 두지 않는다** — 이 리포는 공개다.
//   ① 환경변수 `ELEVENLABS_API_KEY` (그 셸에서만 유효, 디스크에 안 남는다)
//   ② 저장소 **바깥** 키 파일 `neon-fleet/.secrets/elevenlabs.key`
//      worktree·repo 어느 쪽에도 속하지 않아 git 이 추적 자체를 못 하는 위치다(실측 확인).
const KEY_FILE = join(ROOT, '../../.secrets/elevenlabs.key');
let KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY && existsSync(KEY_FILE)) KEY = readFileSync(KEY_FILE, 'utf8').trim();
if (!KEY) {
  console.error('\n[중단] API 키를 찾지 못했습니다. 둘 중 하나로 넣어 주세요.\n');
  console.error('  (1) 환경변수 — 이 창에서만 유효, 디스크에 안 남음');
  console.error('      PowerShell:  $env:ELEVENLABS_API_KEY = "발급받은키"\n');
  console.error('  (2) 키 파일 — 저장소 밖. 클로드가 대신 실행할 수 있음');
  console.error('      ' + KEY_FILE);
  console.error('      파일에 키 한 줄만 넣고 저장\n');
  console.error('  키 발급: https://elevenlabs.io/app/settings/api-keys\n');
  process.exit(1);
}
//  ⚠️키 전체를 절대 출력하지 않는다 — 로그·에러 캡처로 새어 나갈 수 있다.
console.log('  키 확인: ' + KEY.slice(0, 3) + '***' + KEY.slice(-2) + ' (길이 ' + KEY.length + ')');
//  ⚠️흔한 실수: 목록 화면의 **키 ID**(64자 hex)를 키로 착각해 넣는다(§G-44 실제 발생).
//   진짜 키는 생성 직후 한 번만 보여주며 `sk_` 로 시작한다. 여기서 미리 걸러 400 을 낭비하지 않는다.
if (!KEY.startsWith('sk_')) {
  console.error('\n[중단] 이건 API 키가 아니라 **키 ID** 로 보입니다.');
  console.error('  진짜 키는 sk_ 로 시작하고, **생성 직후 한 번만** 표시됩니다.');
  console.error('  목록에 보이는 값은 ID 라서 인증에 쓸 수 없습니다.');
  console.error('  → https://elevenlabs.io/app/settings/api-keys 에서 새 키를 만들고,');
  console.error('     그 자리에서 복사해 다시 저장해 주세요.\n');
  process.exit(1);
}

let PLAN = JSON.parse(readFileSync(join(ROOT, 'scripts/_sfx_plan.json'), 'utf8'));
//  인자로 id 를 주면 그것만 다시 만든다 — 한두 소리만 손볼 때 48개를 다 뽑지 않는다.
//   예: node scripts/gen-sfx-elevenlabs.mjs vulcan hit damage
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (ONLY.length) {
  PLAN = PLAN.filter((x) => ONLY.includes(x.id));
  if (!PLAN.length) { console.error('[중단] 그런 id 가 없습니다: ' + ONLY.join(', ')); process.exit(1); }
  console.log('  대상 한정: ' + PLAN.map((x) => x.id).join(', '));
}
mkdirSync(TMP, { recursive: true });

//  ⚠️무기·타격은 프롬프트를 문자 그대로 따라야 한다(prompt_influence 높게).
//   차임·UI 는 음악적 해석 여지를 줘야 자연스럽다(낮게). 프롬프트 문서 §"How to use" 규칙 그대로.
const LITERAL = new Set(['vulcan', 'laser', 'missile', 'lance_fire', 'hit', 'explode_s', 'explode_l', 'damage', 'shield_pop', 'boss_die']);

/** 한 프롬프트로 1개 생성. ElevenLabs 는 요청당 1개를 돌려준다 — 변형은 호출을 반복한다. */
async function generate(prompt, seconds, influence) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: seconds,
      prompt_influence: influence,
      model_id: 'eleven_text_to_sound_v2',
      output_format: 'mp3_44100_128',
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 게임 규격으로 변환: 앞 무음 제거 → 목표 길이 → 페이드아웃 → 피크 제한 → 48kHz 모노 OGG */
function toSpec(src, dst, dur) {
  const fade = Math.max(0.03, dur * 0.12);
  const filters = [
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0',
    `afade=t=out:st=${Math.max(0, dur - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
    'alimiter=limit=0.89',
  ].join(',');
  execFileSync(FF, ['-y', '-v', 'error', '-i', src, '-t', String(dur), '-af', filters,
    '-ac', '1', '-ar', '48000', '-c:a', 'libvorbis', '-b:a', '96k', dst]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let made = 0, failed = [];
const total = PLAN.reduce((s, p) => s + p.n, 0);

console.log(`\n효과음 생성 시작 — ${PLAN.length}종 / ${total}파일\n`);

for (const item of PLAN) {
  //  ⚠️ElevenLabs 최소 길이는 0.5초다. 그보다 짧은 목표는 0.5초로 만든 뒤 잘라 쓴다.
  const genSec = Math.max(0.5, Math.min(22, item.dur * 1.6));
  const influence = LITERAL.has(item.id) ? 0.8 : 0.5;
  for (let n = 1; n <= item.n; n++) {
    const tag = `nf_sfx_${item.id}_${n}`;
    try {
      const buf = await generate(item.prompt, genSec, influence);
      const raw = join(TMP, tag + '.mp3');
      writeFileSync(raw, buf);
      toSpec(raw, join(OUT, tag + '.ogg'), item.dur);
      made++;
      console.log(`  [${String(made).padStart(2)}/${total}] ${tag}.ogg  (${item.dur}s, 영향도 ${influence})`);
    } catch (e) {
      failed.push({ tag, err: String(e.message).slice(0, 120) });
      console.log(`  [실패] ${tag} — ${String(e.message).slice(0, 100)}`);
    }
    await sleep(600);   // 레이트리밋 여유
  }
}

rmSync(TMP, { recursive: true, force: true });
console.log(`\n[결과] 생성 ${made} / ${total}`);
if (failed.length) {
  console.log('  실패:');
  for (const f of failed) console.log(`   ${f.tag} — ${f.err}`);
} else {
  console.log('  전부 성공. 다음: 시청 페이지에서 들어보고 승인 → 교체.');
}
