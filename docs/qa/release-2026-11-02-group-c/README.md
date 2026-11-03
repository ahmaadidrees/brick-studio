# Hackable group C and teacher fixes: November 2, 2026

Branch `claude/hackable-c-int` (PR #26) at ae66701, from main b0d43fe, which was production. The owner said "Deploy it".

It contains:
- group C: the Hero's code folded into "How I move", plain-word sliders, Help and the first-run tips, the save chip, the New brick flow, and three safety checks;
- the See inside fixes;
- the inside view: "How I move" as a list, one script at a time, at a readable zoom;
- the teacher fixes on `/class`: Open links, Pause building, the folded code card, roster alignment, and the Shelf count.

The full record is `docs/qa/hackable-c-2026-11-01/README.md`.

**Worker:** `512ffc8a-79d6-4d73-8660-13cdc8099eb7`, deployed first because the class shelf now checks the whole power.
- Rollback: `27e06ef6-8809-4c72-9e61-f6efa09b7f8c`.
- `npm run test:worker`: 254 of 254.

**Website:** `dpl_2nPvkRBea8z219tUqn1XFNCahzyn` on https://brickgineers.com, serving `index-5H_njvGE.js`.
- Rollback: `dpl_81rJzvvVRm4NBEXwJ4Txz4yH56aZ` (the landing release of 2026-11-01). To roll back, run `vercel promote dpl_81rJzvvVRm4NBEXwJ4Txz4yH56aZ`, then `npx wrangler rollback 27e06ef6-8809-4c72-9e61-f6efa09b7f8c` in `multiplayer/worker`.
- **How it was built:**
  1. Copied `.vercel/project.json` from `ux/int`, then ran `vercel pull` for production and `npm run build`.
  2. Carried `micro/` and `config.json` over from `ux/int`'s output; `diff -rq` was clean.
  3. Ran `vercel deploy --prebuilt --prod` once, and confirmed the result with `vercel inspect brickgineers.com`.

**No migration.**

**Checks before:**
- `tsc -b` is clean and the build is OK.
- `src/pages`, `src/classroom` and `src/shell`: 383 of 383.
- The full vitest run had 7 time-outs under load (3,370 passed, 25 expected fail). The 4 files involved pass alone, 78 of 78.

**Checks after** (Claude's browser pane, signed out):
- `/`, `/help`, `/join`, `/projects`, `/class`, `/2d/hackable`, `/2d/build` and `/micro/` all return 200.
- Hackable: the first-run tips show. Hero → Code shows "How I move · 23 scripts"; See inside opens the list with plain names and On/Off switches. No console errors.
- `/join?classCode=` with a made-up code: the new Worker answers 404, and the page says to check the code with the teacher.

**Not checked:**
- `/class` signed in as a teacher, against the live Worker. It was checked on the local demo fixture only.
- Signed-in saving.
- Real devices (Duo, iPad, Chromebook) and Safari.
