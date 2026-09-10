# Local classroom polish QA — 2026-09-10

Candidate: shared dirty `codex/classroom-polish-today` checkout at /Users/ahmaadidrees/.codex/worktrees/brick-classroom-release. URL http://127.0.0.1:5184, backend https://brick-studio-multiplayer-staging.brick-studio-race-worker.workers.dev. This work is local and not production release approval.

Passed in isolated agent-browser Chrome sessions:
- Fresh guest placed red and blue bricks, undid/redid, chose Toy Room, entered Explore, returned to Build and cold reloaded. Full document retained both bricks and toy-room metadata.
- Dedicated QA teacher email/password login and new isolated QA class creation via UI.
- New student signup through updated UI with Show/Hide password, no prior account, and preserved guest draft.
- UI save to My Worlds. Full API document equals original guest document and authoritative Postgres document, owner and revision.
- UI signout clears session and private list.
- Fresh separate browser session starts empty, signs in using stable returning code, opens saved world, obtains full document equal to original and DB.
- 1280x633 signup submit moved from below viewport(y672–715) to visible(y516–556). At390x844 submit y708–748. No horizontal overflow.
- Header My Worlds label remains stable; cloud title and Saved to account status separate.360px header has no overlap; My Worlds/My Class reachable in overflow.
- No page errors reported in sampled sessions.

Evidence:
- /tmp/brick-polish-qa-signup-final-1280.png
- /tmp/brick-polish-qa-signup-final-mobile.png
- /tmp/brick-polish-qa-cold-reopened.png
- /tmp/brick-polish-qa-db-proof.json

QA class id07d12807-5121-4074-8c82-bc6f18f17661, world3d1f3fed-b27b-415e-8dcf-63e2ef3a9fa3, revision1. Fixture credentials retained privately in /tmp for cleanup; no real student mutations.

Minor follow-up: cloud world open produces 'Restored2 locally saved bricks' toast, inaccurate source wording. Header itself correctly shows cloud title and Saved to account.

Not proved in this pass: rearranged teacher controls, reset/suspension/group flows, live rendering improvement, actual Chromebook/student behavior, production deployment. QA switched to urgent separate anonymous Build together hotfix at root request.
