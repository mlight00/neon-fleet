# -*- coding: utf-8 -*-
# GPT 검수 패키지(2차) 생성. 워킹트리 최신 상태를 그대로 담는다 — 커밋 전이라 git archive 를 쓰지 않는다.
#   포함: README.txt · rush3.html · rush/rng.js · rush3/*.js · tests/rush3-*.test.mjs
#         tests/lib/rush3-policies.mjs · newmode/v3/**/*.md|*.json|*.py|*.mjs
#   제외: review/ 의 png(용량). 검수자 원본 review/01·02 는 .md 라 자동 포함된다.
import os, sys, zipfile

ROOT = r'E:\workspace\claude\neon-fleet\worktrees\v3-lastwar'
OUT  = r'E:\workspace\claude\neon-fleet\newmode\GPT검수패키지_v3_1단계_2차_20260916.zip'

README = """스타포지 러시 v3 — 1단계 2차 검수 패키지 (2026-09-17 생성)

대상: 저장소 E:\\workspace\\claude\\neon-fleet\\worktrees\\v3-lastwar
      브랜치 claude/starforge-v3 · HEAD 0212bcd + 미커밋 변경(조율자가 커밋 예정)
배포·커밋·푸시 안 함. 기존 게임(rush/*, rush.html, tests/rush-*)은 한 줄도 수정하지 않았다.

────────────────────────────────────────────────────────
읽는 순서
────────────────────────────────────────────────────────
1) newmode/v3/검수보고_v3_1단계_2차_20260916.md   ← 여기부터. 이번 검수 요청 본문
     §1 에 검수자께 드리는 질문 5개가 있다.
2) newmode/v3/DESIGN_v3_stage1.md                  규칙의 단일 진실(계약서 r3.4 + 수정 라운드 2)
3) newmode/v3/review/01_GPT_1단계_검수결과.md      1차 검수 결과 원본(F1~F4)
   newmode/v3/review/02_클로드코드_전달문.md       그 전달문 원본
4) newmode/v3/build2/완료보고_검수반영_20260910.md F1~F4 반영 전후표
5) newmode/v3/build3/difficulty-report.md          난이도 선택기(보통/어려움/극한)
   newmode/v3/build4/default-report.md             기본 난이도를 '극한'으로
6) newmode/v3/build4/lottery-report.md             랜덤 길(로또) — §9 라운드1 · §10 라운드2 가 현행
7) newmode/v3/검수보고_v3_1단계_20260910.md        1차 보고서(배경이 필요할 때)

────────────────────────────────────────────────────────
코드를 직접 돌려 보려면
────────────────────────────────────────────────────────
  검사   node --test tests/rush3-*.test.mjs      → 211 / 211 통과
  회귀   node --test tests/rush-*.test.mjs       → 32 / 32 통과 (기존 게임, 무수정)
  실행   rush3.html 을 정적 서버로 연다(file:// 는 모듈 로드가 막힌다).
         예) python tools/nocache-server.py 8779  →  http://127.0.0.1:8779/rush3.html
         콘솔에서 __rush3Dbg() 로 상태 확인.
  ※ 이 zip 에는 tools/nocache-server.py 와 그림·소리 자산이 들어 있지 않다.
     화면을 직접 띄우려면 저장소 쪽에서 실행하시는 편이 빠르다.

────────────────────────────────────────────────────────
주의해서 읽을 것
────────────────────────────────────────────────────────
· 보고서의 모든 성적표는 봇(고정 입력 정책)의 1판 결정적 시뮬 결과다. 사람의 성공률이 아니다.
· 자동 검사 통과 ≠ 재미 검증. 스마트폰 실기와 초보 플레이테스트는 미실시다.
· lottery-report.md 의 §1~8 은 1차 작성 시점 기록이다. 현행 기준은 §9·§10 이다.
"""

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
        if rel.startswith('newmode/v3/review/') and not rel.endswith(
                ('.md', '.json', '.py', '.mjs')):
            return False                      # review/ 의 png 등은 제외
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
