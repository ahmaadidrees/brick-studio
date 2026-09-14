# W3 — accounts and classrooms: board captures

Script: `capture.mjs` (this folder). Run against the W3 dev server:

```
PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
UI_ORIGIN=http://127.0.0.1:5193 node docs/brand/qa/w3/capture.mjs
```

Headless Chrome, `reducedMotion: 'reduce'`, device scale 1. Desktop contexts are 1366×768; phone contexts are 390×844
with `isMobile` + `hasTouch` (so the `(pointer: coarse)` layout and the bottom sheet are the real ones); one 320×740
context and one 390×470 context (sign-in with the on-screen keyboard open). Results of the checks go to `results.json`.

## What is real and what is mocked

- **Real app, no mocking:** every board 03 view (`/build?classroom=signin|join|teacher`), the Escape check, the label /
  footer / keyboard checks, and the board 04 callback **failure** (`/auth/teacher-callback` with a stale state).
- **Mocked session + API:** boards 04 (forced password change, save hand-off), 05, 13, 14 and 15. The script seeds
  `sessionStorage['brick-studio.classroom-session.v1']` with a student or teacher session and answers `/classroom/*`
  from in-script fixtures with `page.route` (Studio 5, four students, three personal worlds, one class world, one group
  world, two checkpoints). No server, no live data. The board 04 callback **pending** state seeds the PKCE flow record
  and never answers the token exchange, so the page stays in its pending view.
- **Invalid credentials / expired session / network error** use the same route hook to return a 401 or abort the request.

## Files

| Board | 1366×768 | 390×844 (and other) |
|---|---|---|
| 03 entry | `03-signin-student-1366`, `03-signin-enroll-1366`, `03-signin-teacher-1366`, `03-signin-invalid-1366` | `03-signin-student-390`, `03-signin-enroll-390`, `03-signin-enroll-320` (320×740, inline username rule) |
| 04 recovery | `04-recovery-reset-1366` (mismatch), `04-recovery-save-1366` (duplicate name), `04-callback-pending-1366`, `04-callback-failed-1366` | `04-recovery-reset-390`, `04-recovery-save-390` |
| 05 worlds / class | `05-worlds-1366`, `05-class-1366` (the empty state is visible in `15-safe-network-error-1366`) | `05-worlds-390`, `05-class-390` |
| 13 roster | `13-roster-1366`, `13-roster-manage-1366` (the confirmation dialog pattern is in `14-access-restore-confirm-1366`) | `13-roster-390`, `13-roster-manage-390` |
| 14 access / groups | `14-access-settings-1366`, `14-access-world-controls-1366`, `14-access-restore-confirm-1366` | `14-access-settings-390`, `14-access-world-controls-390` |
| 15 safe states (account-owned) | `15-safe-network-error-1366`, `15-safe-expired-session-1366` | — |
| 16 mobile | — | `16-signin-keyboard-390` (390×470 visual viewport) |

## Checks the script records (`results.json`)

- Labels stay visible while inputs contain text (1366, 390).
- The primary action is inside the viewport at 1366, 390 and 320, and stays visible with the keyboard open (390×470)
  together with the focused password field.
- Escape closes the account panel to the current build and strips `?classroom=`; inside a confirmation, Escape closes
  only the confirmation (the panel stays).
- Invalid credentials keep the typed code and username.
- No `<img>` thumbnails in My Worlds (the mark is used instead).
- The callback failure offers "Try again" and "Keep building".
- An expired session (401 on load) returns to student sign-in with the server's reason, never a silent sign-out.
- **D7:** every visible button, input, select, link and switch option inside the panel is at least 44px tall on the
  touch contexts (student, enrollment and teacher entry, My Worlds, Manage student, Class settings, World controls).
