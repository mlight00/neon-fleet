# 친구 테스트 리뷰 설문 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 간결판(2026-10-03 연휴 일정 — 작성자가 이 세션에서 직접 실행). 코드 전문은 각 단계의 커밋에 있다.

**Goal:** 결과 화면에서 친구가 짧은 설문을 쓰면 답과 자동 기록이 LaserMoon 구글 설문지로 들어가게 한다.

**Architecture:** 순수 모듈 `rush3/review.js`(문항·칸 번호·보낼 값·초대 판정) + DOM 창 `rush3/reviewui.js` + 셸 상태 `'review'`(main.js) + 저장 새 칸(save.js). 전송은 `fetch(no-cors)` 로 구글 설문지 formResponse 에 보낸다.

**Tech Stack:** 바닐라 JS(ES 모듈) · Canvas 2D 셸 · node:test · Playwright(Python) · 구글 설문지.

**Spec:** `docs/superpowers/specs/2026-10-03-friend-review-survey-design.md`

## Global Constraints
- 선택지 글자: 난이도 `너무 쉬움 / 조금 쉬움 / 딱 좋음 / 조금 어려움 / 너무 어려움` · 또 `또 할래요 / 가끔 할 것 같아요 / 이번으로 충분해요` · 좋았던 것 `부대가 커지는 맛 / 게이트 고르기 / 보스전 / 무기 바꾸기 / 스토리 그림 / 잘 모르겠어요` · 재미 `1`~`5`. 설문지와 한 글자도 같아야 한다.
- 설문지 11문항 순서: 재미있었나요? · 난이도는 어땠나요? · 또 하고 싶나요? · 제일 좋았던 것 하나 · 한마디 (불편했던 점·버그·바라는 점) · 이름이나 별명 · 최고 스테이지 · 판 수 · 플레이 시간(분) · 기기 · 기타 기록. 필수 없음.
- 한마디 300자 · 별명 20자. 초대 = 판 수 3 이상 · 1회. 창 열린 뒤 0.6초 누르기 무시.
- 결과 화면 버튼 id `review`, 글 `리뷰 남기기`(작은 보조 버튼, 오른쪽 위). 진입점 `boot(…, { story: true, review: true })`, `?dev=1` 이면 끔(`&review=1` 이면 켬).
- 저장 새 칸: playSec · reviewAnon · reviewAsked · reviewSent · reviewPending(defaults·normalize 둘 다). 스키마 v 3 유지.
- 보이는 글은 한국어 · 어절 중간 줄바꿈 금지(창 CSS `word-break: keep-all`) · 입력 글자 16px 이상.
- 실제 전송 검사는 별명 `[테스트]` · 응답 삭제 금지. 커밋 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 파일 고치기 도우미는 LF 만(외톨이 CR 0) · 파이썬 스크립트는 Write 로 쓴다(인라인 heredoc 금지).

---

### Task 1: 구글 설문지 만들기(LaserMoon 계정, 크롬 장치 29eea008)
**산출:** 공개 ID · formResponse 주소 · 칸 번호 11개 → `E:\workspace\claude\neon-fleet\review\20261003_review\form.json`
- [ ] `forms.new` 로 빈 설문지 → 제목 `스타포지 러시 친구 테스트 리뷰` · 설명 `게임 안 설문에서 보낸 응답이 모입니다. 7번부터는 게임이 자동으로 채우는 칸입니다.`
- [ ] 11문항(종류: 선형 배율 1~5(1 별로 · 5 최고) · 객관식 ×3 · 장문형 · 단답형 ×6), 필수 모두 끔
- [ ] 설정: 이메일 수집 안 함 · 응답 1회 제한 끔 → 게시(링크가 있는 모든 사용자) → 응답 탭에서 새 시트 연결
- [ ] 공개 viewform 페이지에서 `FB_PUBLIC_LOAD_DATA_` 를 읽어 문항 제목 ↔ entry 번호, `form.action` 을 form.json 에 적는다

### Task 2: `rush3/review.js`(순수) + 검사
**Produces:** `REVIEW_GAME_VER='r4.34'` · `REVIEW_FORM{action,viewUrl,entry{fun,diff,again,best,note,name,reach,runs,mins,device,etc}}` · `REVIEW_QS[{key,label,kind:'stars'|'choice'|'text'|'line',options,required}]` · `REVIEW_KEYS` · `REVIEW_LIMITS{note:300,name:20}` · `REVIEW_INVITE_RUNS=3` · `REVIEW_UI_LOCK=0.6` ·
`reviewMissing(ans)→key[]` · `recordFields(rec)→{reach,runs,mins,device,etc}` · `buildReviewPairs(ans,rec,form?)→[[entry,value]]`(빈 값·표에 없는 선택 값은 뺀다, 길이 자름) · `shouldInvite({runs,asked,sent})` · `deviceLabel(ua,touchPoints)→'휴대폰 · 아이폰 · 카카오톡'` · `makeAnon(rand?)→8자[0-9a-z]` · `recordLine(rec)→'최고 STAGE 9 · 12판'`
rec = `{ reach, cleared, runs, mins, story, device, ver, anon }`
- [ ] 검사 `tests/rush3-review.test.mjs` REVIEW-1~5(문항 표·칸 번호 형식 · 필수 · 보낼 값 순서/자르기/빼기 · 기기 이름 5종 UA · 초대 표 · 익명 번호 · 기록 한 줄) 먼저 쓰고 실패 확인
- [ ] 구현 → `node --test tests/rush3-review.test.mjs` 통과 → 커밋

### Task 3: 저장 새 칸(save.js) + 검사
- [ ] REVIEW-6: 기본값(playSec 0 · reviewAnon '' · reviewAsked false · reviewSent 0 · reviewPending null) · 정규화(음수·NaN → 0, 익명 번호는 `^[0-9a-z]{4,16}$` 만, 보낼 값은 문자열 쌍 20개·400자 이하 배열만) · patch 유지
- [ ] defaults·normalize 에 추가 → 통과 → 커밋

### Task 4: 셸 연결(main.js · render.js · 검사 셸) + 검사
**Consumes:** Task 2·3. **Produces:** api `openReview(mode)` · `closeReview()` · `submitReview(ans)→Promise<{ok}>` · `getReviewOpen()`
- deps: `review`(켜기) · `reviewUi`(창 공장 `(cb:{onSubmit,onClose,viewUrl,now})→{open({mode,line,sent}),close(),isOpen()}`, 기본 = createReviewUi(doc,cb)) · `fetch` · `makeAnon`
- 상태 `'review'`: view 는 결과 화면 그대로(버튼 없음) · render 는 `result || review` 에서 drawResult · 캔버스 누르기 무시 · keydown 은 ESC 만(창 닫기) — Enter/Space/조향은 게임으로 가지 않는다
- 결과 버튼 `{ id:'review', x:344, y:14, w:122, h:40, label:'리뷰 남기기', small:true }`(RESULT_REVIEW_SLOT) → openReview('form')
- finishRun: playSec += run.time(개발용 판 제외) · 결과 화면이 되면 maybeInvite() · endStory 가 결과로 갈 때도 maybeInvite()
- 전송: reviewPending 먼저 적고 → fetch(action,{method:'POST',mode:'no-cors',body:URLSearchParams}) → resolve 면 pending 비우고 reviewSent+1 · reject 면 pending 유지. boot 때 pending 이 있으면 한 번 다시 보낸다
- [ ] `tests/lib/rush3-shell.mjs` bootApp 에 review·reviewUi·fetch·makeAnon·nav 전달
- [ ] REVIEW-7~10(버튼 유무 · 창 열기/ESC · Enter 무시 · 3판 초대 1회 · 보스 승리 컷 뒤 초대 · 전송 성공/실패/재전송 · playSec) 먼저 쓰고 실패 확인 → 구현 → 통과 → 커밋

### Task 5: 설문 창 `rush3/reviewui.js`(DOM)
- 초대 카드(제목 `리뷰 1분만 부탁해요!` · [쓰기] [나중에]) · 보낸 적이 있으면 맨 위에 `이미 N번 보내 주셨어요. 고마워요!` · 설문(별 5 · 고르기 칩 · 긴 글 · 짧은 글 · `게임 기록(…)도 함께 보내요` · [보내기] [닫기]) · 보낸 뒤 `고마워요! 잘 받았어요.` · 실패 줄 + `구글 설문지에서 직접 쓰기` 링크
- [보내기]는 reviewMissing 이 빌 때만 켜짐 · 0.6초 잠금 · 창 안 keydown 은 바깥으로 올려 보내지 않는다
- [ ] 진입점에 `review: true` → 커밋

### Task 6: 브라우저 확인 · 실제 전송
- [ ] 로컬 서버 + Playwright(390×844, 카카오톡 아이폰 UA) `rush3.html?dev=1&review=1`: 3판(출격 → 작전 중단) → 초대 캡처 → [쓰기] → 설문 캡처 → `[테스트]` 응답 보내기 → 감사 화면 캡처. 결과 화면 [리뷰 남기기] 캡처. 콘솔 오류 0
- [ ] 크롬(LaserMoon)에서 응답 시트를 열어 11칸이 모두 들어왔는지 확인(2~3건)

### Task 7: 전체 검사 · 배포 · 기록
- [ ] `node --test tests/rush3-*.test.mjs` · `node --test tests/rush-*.test.mjs` 통과
- [ ] `git push origin HEAD:master` → 실제 주소에서 결과 화면 버튼·창 확인
- [ ] CHANGELOG r4.34 · DESIGN 문단 · INBOX(10/3 지시) · LOOP(릴리스마다 REVIEW_GAME_VER 올리기 · 응답 보는 법) · status_resume · 메모리
- [ ] 단톡방 안내문 초안 `E:\workspace\claude\neon-fleet\review\20261003_review\단톡방_안내문.txt`
