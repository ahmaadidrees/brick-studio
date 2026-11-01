# Landing page polish, /help and the New project sheet: November 1, 2026

Branch `claude/landing-polish` (PR #25), from main 1939d80. The owner picked direction A ("Build it. Play it. Hack it.") from three
mocks on a design canvas, then said "Ship to prod".

**Website:** `dpl_81rJzvvVRm4NBEXwJ4Txz4yH56aZ`, on https://brickgineers.com, serving `index-BR0sf3zS.js`.
- Rollback is `dpl_9LwqASAcw2GWy2FVTP3cjaTXmQGE`, the Hackable UX fixes release of 2026-10-31.
- Built locally with the production settings from `vercel pull`.
- `micro/` and `config.json` were carried over unchanged (`diff -rq` was clean).
- The Worker is unchanged (`27e06ef6`), and there is no migration.

To roll back, run `vercel promote dpl_9LwqASAcw2GWy2FVTP3cjaTXmQGE`.

**Checks:**
- **Before:** `tsc -b` passed; the full vitest run had 3,266 passed plus 25 expected-fail.
- **Screenshots:** headless at 375, 540, 820, 1114 and 1440 px, with no sideways scroll and no console errors.
- **After** (Claude's browser pane, signed out):
  - `/`, `/help`, `/privacy`, `/join`, `/projects`, `/2d/hackable` and `/micro` all return 200.
  - The new hero renders.
  - New project opens the sheet with the cards two by two.
  - `/privacy` lands on `/help#privacy` and scrolls to it.
  - There were no console errors.

**Not checked:** real devices, including the owner's Duo and iPad.
