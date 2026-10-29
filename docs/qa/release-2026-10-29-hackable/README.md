# Hackable Platformer + overnight friction fixes — October 29, 2026

Branch `claude/friction-int` (`257a83d`, PR #23, stacked on PR #22 `claude/code-lab-on-main`), from production
`claude/microbit-scrub` (`e7b9638`), which it contains. The owner asked for it to be shipped with the class shelf so their
students could test the Hackable Platformer the same day.

## What ships

- **The Hackable Platformer at `/2d/hackable`.** This is its first time on production. It includes the landing-page band.
  The details are in `docs/qa/hackable-platformer` and `docs/qa/code-lab-redesign`.
- **The class shelf.** Students share powers through "+ Power" and "Share with my class". Teachers get a Shelf tab on
  `/class`.
- **The overnight friction fixes.** They cover saving, Hackable data, powers, 2D and joining. The details are in
  `docs/qa/friction-2026-10-28/OVERNIGHT.md`.

## Deploy order and ids

1. **Migration `202610280001_brick_class_shelf.sql`**, applied with the Supabase Management API to the shared project
   (`wfrvgbnmyenidlpmimhl`) at about 08:29 PT, with the owner's go.
   - **Before:** no `brick_shelf_items` table, no new columns, 72 classes.
   - **After:** the table exists with RLS on and the quota trigger, and all 72 classes have the defaults
     `shelf_needs_review = true` and `race_heroes = 'shelf'`.
   - The change only adds things, so it stays in place on a rollback.
2. **Worker `brick-studio-multiplayer`:** version `b91ebb87-7023-4031-b1fe-52fccbd41d7c`. Rollback is `ebf601fb-7afc-48e9-8f08-e2a78db381be`.
   - `npm run test:worker` passed 251 of 251 first.
   - Afterwards, `/classroom/classes/x/shelf` answered 401 `sign_in_required`.
3. **Website:** `dpl_2o3U5LrtXKLVYHuooFZq9Yh7Yjx5`, aliased to https://brickgineers.com and deployed once. Rollback is
   `dpl_5HjM9wQgXoxwDWGQXn69zJHGEETY`.
   - It was built locally with `npm run build` and the production environment from `vercel pull`.
   - It serves `index-Cyvwnfco.js`, and the Scrub marker is still in `index.html`.
   - `.vercel/output/static` holds `dist` plus `micro/`, copied unchanged from the 2026-10-25 output (`diff -rq` was
     clean). `config.json` is the 2026-10-25 one, with the `/micro`, `/static/*` and `/docs/static/*` routes.

To roll back, run `vercel promote dpl_5HjM9wQgXoxwDWGQXn69zJHGEETY` and `wrangler rollback ebf601fb-…`. Leave the
migration in place. If Hackable projects were saved to accounts before a rollback, they stay in the database. The old
site can't open them until this release ships again.

## Checks

- **Before the deploy:**
  - CI passed on PR #22 and PR #23.
  - On the integrated branch, the full vitest run passed 3,198, plus 25 expected-fail.
  - `tsc -b` and the build passed.
  - The Worker suite passed 251.
  - The six browser journeys on the local stack all passed. The list is in OVERNIGHT.md.
- **On brickgineers.com after the deploy** (Claude's browser pane, signed out, 1366×768):
  - The landing page loads.
  - `/2d/hackable?new=1` opens the project, which gets its `?draft=` address at the first change.
  - Stage → Costumes opens with no error.
  - Paint a stroke, then place 3 coins in Build, then reload: the stroke and the coins are kept.
  - Play runs.
  - There were no console errors.
  - `/`, `/join`, `/class`, `/projects`, `/2d/build`, `/2d/hackable` and `/micro` all return 200.
- **Not checked by Claude:**
  - Signed-in journeys on production. Claude doesn't sign in to real accounts.
  - The class shelf with real students.
  - Physical iPads, Chromebooks and Duos.

## For the class test today

1. **Before the students, on a class device**, do one signed-in run:
   1. Enter the class code and pick your name.
   2. Open the Hackable Platformer.
   3. Change something and reload. The change should still be there, and the header should say it's saved to the account.
2. **To try the shelf:**
   1. A student makes a power and taps "Share with my class".
   2. Approve it in the `/class` Shelf tab. Students' items wait for the teacher by default.
   3. Another student adds it through "+ Power".
3. **Known issues to expect:**
   - Painting a Stage backdrop turns the sky pale.
   - Importing a Hackable project over about 2 MB while signed in shows a generic error.
   - A failed "My powers" save still says it worked.
