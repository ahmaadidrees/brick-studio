# W3 `/join` — screenshots

Captured with `docs/flows/qa/w3/capture.mjs`, which stubs only the public class lookup
(`POST /classroom/auth/roster` → a six-student "Studio 5") so the page can be shot without a worker.
Shots are viewport-sized, not full-page: the page scrolls, so what fits on screen is the thing under review.

```
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
npx vite --port 5250 --strictPort            # in another shell; stop it afterwards
PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
  CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  UI_ORIGIN=http://localhost:5250 node docs/flows/qa/w3/capture.mjs
```

The script fails on a page error or any horizontal overflow. Current run: clean at all nine combinations.

| Scene | State | Files |
|---|---|---|
| `join` | `/join?classCode=ROOM-42`, class resolved, username green, password failing the length rule | `join-{1366x768,1024x768,390x844}.png` |
| `signin-roster` | `?mode=signin`, class code entered, "Ben K." tapped, password labelled for Ben | `signin-roster-…png` |
| `teacher` | `?mode=teacher` with the email/password disclosure open | `teacher-…png` |
