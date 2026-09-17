# -*- coding: utf-8 -*-
# GPT 검수 패키지(3차) 생성. 2차용 build4/make-package.py 의 사본에 대상·README·포함 범위만 고쳤다.
# 워킹트리 최신 상태를 그대로 담는다 — 커밋 전이라 git archive 를 쓰지 않는다(커밋은 조율자가 이 뒤에 한다).
#   포함: README.txt · rush3.html · rush/rng.js · rush3/*.js · tests/rush3-*.test.mjs
#         tests/lib/rush3-policies.mjs · newmode/v3/**/*.md|*.json|*.py|*.mjs
#         + review2/ 의 검수자 원본 .csv·.txt (policy-comparison.csv · test-results.txt)
#         + build5·build6 의 png (육안 근거)
#   제외: review/·review2/ 의 png(용량) · 그 밖의 build* png · 그림·소리 자산
import os, zipfile

ROOT = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar'
OUT  = r'E:\workspace\claude\neon-fleet\newmode\GPT검수패키지_v3_1단계_3차_20260917.zip'

# README 의 검사 수는 실제 실행 출력과 같아야 한다(검수 §5 8번 '한 기준').
TESTS_RUSH3 = 243
TESTS_LEGACY = 32

README = """스타포지 러시 v3 — 1단계 3차 검수 패키지 (2026-09-17 생성)

대상: 저장소 E:\\workspace\\claude\\neon-fleet\\worktrees\\v3-lastwar
      브랜치 claude/starforge-v3 · HEAD a46a44d + 미커밋 변경
      = 커밋 1bd1620(코드) + 문서 커밋. 검사 243/243.
배포·푸시 안 함. 기존 게임(rush/*, rush.html, tests/rush-*)은 한 줄도 수정하지 않았다.

검사 수: rush3 {t3}건 전부 통과 · 기존 게임 회귀 {tl}건 전부 통과 (이 패키지 생성 시점 실제 출력)
         문서마다 보이는 211 / 213 / 216 / 234 는 틀린 값이 아니라 그 라운드의 시점 값이다.
         현행 정본은 {t3} 이며, 내력 표가 2차 보고서 §10-4 에 있다.

────────────────────────────────────────────────────────
읽는 순서
────────────────────────────────────────────────────────
1) newmode/v3/검수보고_v3_1단계_2차_20260916.md  의 **§10 부터**   ← 여기부터
     §10   2차 검수 반영과 이사 결정(2026-09-17) — 이번 제출의 요지
     §10-1 검수 §5 완료 기준 8항목별 충족 여부 표
     §10-2 이사 결정 3건과 검수자 권고를 나란히(결정 우선 · 미채택 사유 = 발주자 결정)
     §10-3 미실시 = 스마트폰 실기 · 초보 관찰 (통과 처리하지 않음)
     §10-4 검사 수·검수 대상을 한 기준으로
   그 뒤 같은 문서의 §0~§9 는 2차 제출 시점의 본문이다(배경이 필요할 때 읽는다).
2) newmode/v3/DESIGN_v3_stage1.md                 규칙의 단일 진실(계약서 r3.7 + 수정 라운드 1·2)
3) newmode/v3/review2/01_GPT_2차_검수결과.md      2차 검수 결과 원본(N1~N4 · Q1~Q5 · §5 완료 기준)
   newmode/v3/review2/02_클로드코드_전달문.md     그 전달문 원본
   newmode/v3/review2/regression-results*.json    검수자 회귀 스크립트 결과(21판)
   newmode/v3/review2/review-probe-results.json   검수자 141판 실험 자료
   newmode/v3/review2/policy-comparison.csv       정책별 비교표
   newmode/v3/review2/test-results.txt            검수자가 돌린 검사 출력
4) newmode/v3/build5/완료보고_2차검수반영_20260917.md   N1·N2·N4·Q3 반영(검사 234건 시점)
   newmode/v3/build5/verify2-*.png                       그 라운드 육안 근거 13장
5) newmode/v3/build6/apply-report.md                    이사 결정 3건 반영(검사 {t3}건, 현행)
     §1~§6 함정 외형·부연·난이도 재확인
     §7    수정 라운드 1 — 확정 전 함정 누출을 막았다
     §8    수정 라운드 2 — V3-AUDIO 가 trapHit 을 안 보고 있었다
   newmode/v3/build6/shot-trap-*.png                     함정 외형·결과 화면·공개 전 동일 프레임
6) newmode/v3/build3/difficulty-report.md · build4/default-report.md · build4/lottery-report.md
                                                        난이도 선택기 · 극한 기본값 · 랜덤 길(배경)
7) newmode/v3/검수보고_v3_1단계_20260910.md             1차 보고서
   newmode/v3/review/01_GPT_1단계_검수결과.md           1차 검수 원본(F1~F4)

────────────────────────────────────────────────────────
코드를 직접 돌려 보려면
────────────────────────────────────────────────────────
  검사   node --test tests/rush3-*.test.mjs      → {t3} / {t3} 통과
  회귀   node --test tests/rush-*.test.mjs       → {tl} / {tl} 통과 (기존 게임, 무수정)
  스모크 node -e "import('./rush3/main.js')"     → 오류 없이 끝나면 정상
  실행   rush3.html 을 정적 서버로 연다(file:// 는 모듈 로드가 막힌다).
         예) python tools/nocache-server.py 8779  →  http://127.0.0.1:8779/rush3.html
         콘솔에서 __rush3Dbg() 로 상태 확인.
  ※ 이 zip 에는 tools/nocache-server.py 와 그림·소리 자산이 들어 있지 않다.
     화면을 직접 띄우려면 저장소 쪽에서 실행하시는 편이 빠르다.

────────────────────────────────────────────────────────
주의해서 읽을 것
────────────────────────────────────────────────────────
· 이사 결정 3건(재도전 새 추첨 유지 · 기본 난이도 극한 유지 · 확정 −10 게이트 유지+함정 외형)이
  검수자 권고보다 우선한다. 미채택 2건의 사유는 '발주자 결정'이며, 두 입장을 §10-2 에 나란히 남겼다.
· 이번 라운드(이사 결정 반영)는 표현과 문서다. 규칙(값·maxValue·armZ·시드 정책·풀·난이도 배수)은
  한 줄도 바뀌지 않았다.
· 보고서의 모든 성적표는 봇(고정 입력 정책)의 1판 결정적 시뮬 결과다. 사람의 성공률이 아니다.
· 자동 검사 통과 ≠ 재미 검증. 스마트폰 실기와 초보 플레이테스트는 이번에도 미실시다(§10-3).
· build4/lottery-report.md 의 §1~8 은 1차 작성 시점 기록이다. 현행 기준은 §9·§10 이다.
""".format(t3=TESTS_RUSH3, tl=TESTS_LEGACY)


def keep(rel):
    rel = rel.replace('\\', '/')
    if rel == 'rush3.html' or rel == 'rush/rng.js':
        return True
    if rel.startswith('rush3/') and rel.endswith('.js'):
        return True
    if rel == 'tests/lib/rush3-policies.mjs':
        return True
    if rel.startswith('tests/') and '/' not in rel[6:] \
       and rel.startswith('tests/rush3-') and rel.endswith('.test.mjs'):
        return True
    if rel.startswith('newmode/v3/'):
        # 검수자 원본은 표 형식(.csv)·검사 출력(.txt)까지 넣는다. png 는 용량 때문에 제외.
        if rel.startswith('newmode/v3/review2/'):
            return rel.endswith(('.md', '.json', '.py', '.mjs', '.csv', '.txt'))
        if rel.startswith('newmode/v3/review/'):
            return rel.endswith(('.md', '.json', '.py', '.mjs'))
        # 육안 근거가 필요한 두 라운드만 png 를 함께 넣는다.
        if rel.startswith('newmode/v3/build5/') or rel.startswith('newmode/v3/build6/'):
            return rel.endswith(('.md', '.json', '.py', '.mjs', '.png', '.html'))
        return rel.endswith(('.md', '.json', '.py', '.mjs'))
    return False


files = []
for base, dirs, names in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '__pycache__')]
    for n in names:
        full = os.path.join(base, n)
        rel = os.path.relpath(full, ROOT).replace('\\', '/')
        if keep(rel):
            files.append((full, rel))
files.sort(key=lambda t: t[1])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
if os.path.exists(OUT):
    os.remove(OUT)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr('README.txt', README)
    for full, rel in files:
        z.write(full, rel)

total = len(files) + 1
print('zip :', OUT)
print('파일:', total, '개 (README.txt 포함)')
print('크기: %.1f KB' % (os.path.getsize(OUT) / 1024))
print('--- 목록 ---')
for _, rel in files:
    print('   ', rel)
