# 작업 전 Git 상태 스냅샷 (2026-07-29)

## git status --short --branch
```
## claude/neon-fleet-analytics-stage1...origin/master
 M css/style.css
 M js/intro.js
 M js/main.js
 M js/render.js
 M js/ui.js
 M tests/sector-map-touch.test.mjs
?? "docs/2026-07-26-Claude-Prolific-15\353\252\205-\354\262\253\354\235\270\354\203\201-\355\205\214\354\212\244\355\212\270-\354\236\221\354\227\205\354\247\200\354\213\234\354\204\234.md"
?? "docs/2026-07-26-Claude-Prolific-\354\262\253\354\235\270\354\203\201\355\205\214\354\212\244\355\212\270-\352\265\254\355\230\204\354\231\204\353\243\214\353\263\264\352\263\240.md"
?? "docs/2026-07-26-Claude-Stage1-\355\226\211\353\217\231\352\263\204\354\270\241-\354\231\270\353\266\200\355\205\214\354\212\244\355\212\270-\354\231\204\353\243\214\353\263\264\352\263\240.md"
?? "docs/2026-07-26-Prolific-\352\262\260\352\263\274\354\247\221\352\263\204\355\205\234\355\224\214\353\246\277.md"
?? "docs/2026-07-26-Prolific-\353\223\261\353\241\235\352\260\222-\353\263\265\354\202\254\354\232\251.md"
?? "docs/2026-07-29-Claude-CrazyGames-Basic-Launch-\354\244\200\353\271\204-\354\236\221\354\227\205\354\247\200\354\213\234\354\204\234.md"
?? docs/analytics/
?? docs/qa/prolific-playtest-20260726/
?? docs/qa/stage1-analytics-20260726/
?? docs/release/
?? docs/research/
?? js/analytics-config.js
?? js/analytics-consent.js
?? js/analytics-events.js
?? js/analytics-ga4.js
?? js/analytics.js
?? js/playtest-config.js
?? js/playtest.js
?? tests/analytics-consent.test.mjs
?? tests/analytics-ga4.test.mjs
?? tests/analytics-wiring.test.mjs
?? tests/analytics.test.mjs
?? tests/consent-ui-listeners.test.mjs
?? tests/playtest-analytics.test.mjs
?? tests/playtest-config.test.mjs
?? tests/playtest-wiring.test.mjs
?? tests/playtest.test.mjs
```

## git diff --stat
```
 css/style.css                   |  60 ++++++
 js/intro.js                     |  21 +-
 js/main.js                      | 407 ++++++++++++++++++++++++++++++++-----
 js/render.js                    |  42 ++--
 js/ui.js                        | 435 +++++++++++++++++++++++++++++++++-------
 tests/sector-map-touch.test.mjs |  16 +-
 6 files changed, 825 insertions(+), 156 deletions(-)
```
