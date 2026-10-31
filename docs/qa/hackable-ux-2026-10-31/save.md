# Hackable UX fix pass, save lane (2026-10-31)

Branch `claude/hackable-ux-save`, from `origin/main` e4d4930. Not pushed and not deployed.

The browser checks ran against Vite on port 5194 with headless Chrome. The harness is in the session scratchpad,
`save-qa/` (`guest.mjs`, `account.mjs`, `lib.mjs`).

The local fake-accounts stack can't save Hackable worlds. So account flows used a Playwright stub of `/classroom/*`
that follows the Worker's rules:
- revisions, with `409 revision_conflict` on a stale save;
- rename changes the title only;
- create is idempotent by `id`.

**Everything marked "account" was verified against that stub and unit-test mocks only, not the real Worker or the
database.** The Worker change itself is covered by `npm run test:worker`.

| Item | Status |
| --- | --- |
| [4·1] Over 2,000 bricks nothing saves | Fixed |
| [4·4] Guest browser fills after about 8 projects | Fixed |
| [5·1] Two tabs on one local project | Fixed |
| [5·2, 5·5] Account saving fails silently, no retry | Fixed |
| [5·3] Leaving during the first account save makes two copies | Mostly fixed |
| [5·6] Rename and Duplicate are undone on open | Fixed |

## [4·1] Over 2,000 bricks nothing saves: fixed

**Where the limit comes from:** `core/project.ts` `DESIGN_LIMITS.maxCopies` (2,000). It is enforced only when the save
is validated, locally and for the account alike. It is not the Worker's `world_limit`, which counts projects.

**Fix:** the limit is now enforced where bricks are placed (`builder/limits.ts` `limitedStore`). The brick after the
2,000th is refused, and the kid sees "This level is full: it holds 2,000 bricks. Erase some to make room for new ones."

**Why not raise the limit:** at about 2,000 bricks Play already runs at about 3 fps on a throttled Chromebook-class CPU
([4·3]).

**Verified:**
- `builder/limits.test.ts`.
- Browser: a level at 1,999 bricks, then three clicks. The level keeps 2,000 on screen and 2,000 saved, and the
  message shows (`q3-level-full.png`).

## [4·4] Guest browser fills after about 8 projects: fixed

**Cause:** the bulk was indentation, not compiled programs. A starter project is 596,000 characters indented and
166,000 compact; its workspaces and programs are about 75,000 characters each.

**Why programs are still stored:** dropping them would mean recompiling on open. That would quietly change how an
untouched project behaves if the compiler changes later. Storing compact JSON is lossless and needs no recompiling.

**What changed:**
- **Compact saves:** projects are now stored as compact JSON (`projectStorageText`).
- **Migrating old saves:** older indented saves are rewritten compactly in place by `compactHackableSaves`. The JSON
  is the same, nothing is ever dropped, and a save is only written over the exact text that was just read. This
  runs once per visit and on any save that hits the browser's limit, which is then retried.
- **Checking space:** opening a new project checks there is room for a whole project (`roomFor`), not one character.
- **Honest messages:**
  - The new message: "There is no more room for projects on this computer … Press This project, then Save File …
    Then remove old projects in My projects." Save File comes first, so the kid isn't sent off the page with unsaved
    work.
  - A blocked browser now gets a different message from a full one.

**Verified:**
- Unit tests in `hackableProjects.test.ts` and `storage.test.ts`.
- Browser:
  - 8 indented projects filled the origin.
  - A new project then opened.
  - After the first change, all 9 projects were compact (about 166,000 characters each) and reopened with their names.
  - Truly full: the problem card (`q2b-truly-full.png`).
  - A save that doesn't fit: the banner (`q2c-save-does-not-fit.png`).

**Not done (another lane's file):** the notice bar still covers the Costumes and Sounds tabs. That is shell layout CSS.

## [5·1] Two tabs on one local project: fixed

**How it works now:**
- `watchAndSave` remembers the save this tab last read or wrote.
- It never writes over a different one, and it listens for `storage` events.
- An indented save and a compact save of the same project count as the same.

**Conflict with changes in this tab:**
- This tab's project is kept as a new project, "<name> (copy)".
- The tab switches to that copy.
- The kid sees "This project was also changed in another tab. To keep both, your changes here are now a new
  project…".

**No changes in this tab:** the kid sees "This project was changed in another tab" with **Show the newer one**.

**A project removed in another tab:** if this tab then saves, its work is kept as a copy.

**Verified:**
- `storage.test.ts`.
- Browser:
  - The original keeps tab A's name.
  - The copy has tab B's coin, and B's later saves land in the copy (`q1-two-tabs-tabB.png`).

## [5·2, 5·5] Account saving fails silently, no retry: fixed

**Before the first save:** the chip says "Waiting to save…", not "Saved to your account".

**First save fails:**
- The project is saved on this computer.
- A banner says so, with **Try again**, and the chip stays "Waiting to save…".
- It retries on a schedule (2 s, 5 s, 10 s, 30 s, then every minute). When it succeeds, the project moves to the
  account and the copy on this computer is removed once the account confirms a save.

**Later saves fail:**
- The banner reads "We couldn't reach your account … We keep trying … do not close this tab", with **Try again**.
- The saver retries on the same schedule.
- Leaving asks first.
- No message says "Reload" any more.

**Signed out:** the kid is told plainly, and saving resumes after they sign back in.

**Revision conflict (another tab):** this tab's work becomes an account copy, "<name> (copy)". If the account is full,
the copy goes on this computer.

**Verified:**
- `hackableCloud.test.ts` and `StudioApp.test.tsx`.
- Browser (account): `a1-first-save-failed.png`, `a1b-moved-to-account.png`, `a3-save-failed.png`,
  `a4-account-two-tabs.png`.

## [5·3] Leaving during the first account save makes two copies: mostly fixed

**What changed:**
- **Client-chosen id:** the app chooses the world id itself (a UUID).
- **Worker:** `POST /classroom/worlds` accepts `id` and returns the existing world when asked again, so the create is
  idempotent. Someone else's world or a deleted world with that id is refused. Older Workers ignore the field.
- **Leaving:** leaving while the first save is in flight asks first.
- **Reopening:** a project left waiting remembers the id. When it's reopened it moves to the same account world, with
  no second copy, and the copy on this computer is removed.

**Verified:**
- Browser (account): leave, then reopen, ends with 1 world and 0 local copies.
- Worker tests.

**Still open:** until the waiting copy on this computer is opened again, My projects shows it next to the account
card. The account list (`pages/worlds`) doesn't hide it.

## [5·6] Rename and Duplicate are undone on open: fixed

`loadHackableWorld` now uses the world's title as the project name, so Rename, Duplicate, and Worker copies stick.

**Verified:**
- `hackableCloud.test.ts`.
- Browser (account): a project titled "Beta" with "Alpha" inside opens as "Beta", and its first save keeps "Beta".

## Tests

- `npx tsc -b`: clean.
- `npx vitest run src/platformer/lab src/projects src/classroom src/pages src/shell`: 1,803 passed, plus 25 expected
  failures.
- `npm run test:worker`: 253 passed. The Worker typecheck is clean.
