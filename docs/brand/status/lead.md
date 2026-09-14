# Lead — Brickgineers direction I integration

Integration worktree `/Users/ahmaadidrees/.codex/worktrees/brand-integration`, branch `claude/brickgineers-brand`.
Resumed 2026-09-14 after the account switch (previous coordinator session ended on HTTP 429; no old writer was
active at resume, verified by process and worktree inspection). Approved package and boards live read-only under
`/Users/ahmaadidrees/.codex/worktrees/brick-product-refinement/outputs/branding/`.

## Integrated so far

| Step | Commit | Verification |
|---|---|---|
| Contracts | `f8c7ad3` | — |
| W0 entry intents, CharacterStudio extraction, LiveStateViews, /dev/ui | `3fc41bd` | 920 tests, typecheck |
| W1 foundation (tokens, mark, wordmark, primitives, identity assets, gallery) | `7d9a48b` (merge) | 104 files / 957 tests, app typecheck |
| Lead rebrand of lead-owned copy (loading, storage/import errors, brick-core import errors, worker messages, README) | `e7292f7` | 957 tests, worker 78 tests, all typechecks |
| W2 landing (boards 01/02/16) | `1edce3c` (merge) | 968 tests |
| W7 Toy Room polish + media pipeline; media recaptured after W6 | `cadd114` (merge), `cfd69a7` | 976 tests |
| W6 character studio + brand-palette avatars (Blender-regenerated Pip/Fern/Nova) | `57b9c06` (merge) | 1004 tests |
| W8 QA harness, baseline (defects D1–D10 with owners), run book | `db83458` (merge) | 1004 tests |
| W3 accounts/classrooms (boards 03/04/05/13/14/15/16) + classroom client strings | `618d040` (merge), `5f9d1f7` | 1048 tests |
| W5 scene/plate, custom bricks, resize, color (boards 08/10/16; D2/D5/D6/D7 fixed) | `6950d4b` (merge) | 1064 tests |
| W6 D7 remainder (44px character controls on touch) | `95e019b` (merge) | 1064 tests |
| W4 editor/Explore/collaboration/recovery shell (boards 06/07/11/12/15/16; D1/D3/D4/D7/D8/D9/D10) | `8b2f8db` (merge) | 1066 tests; `npm run check` green (worker 78, build) |
| W1 second pass: Button href/pressed, Field required name, Select, SegmentedControl describedby, 44px coarse rule, Sheet focus; consistency review | `7083387` (merge) | 109 files / 1075 tests |

All lane worktrees (w2–w8) were fast-forward-merged onto `7d9a48b` so every lane consumes the foundation. W6's
in-progress state was snapshotted as a WIP commit first (its staged CSS deletion blocked the merge).

## Merge order and gates

All lanes merged at `7083387`. Next: W8 integrated run (strict surfaces matrix, refinement UI, character customizer, schema round trip, board captures, local two-client multiplayer, route transfer, performance on a quiet host) → lead fixes → final candidate. `npm run check` under Node 22 at each boundary, then the W8 run
book (surfaces matrix strict, refinement UI, character customizer, route transfer, local two-client multiplayer,
performance on a quiet host, board captures).

## Open interface items

- W5 → W4: `WorldAndCharacterSheet.onApply` may return `{ ok: false, message }`; W4 returns the plate-resize rejection.
- W5/W2 ← W7: media filenames and intrinsic sizes per CONTRACTS (`scene-*-400` is 400×250, 16:10).
- W6 ← lead: keep "Toy Figure"/"Classic Builder" names; cc0-hero stays selectable, excluded from marketing media.
- W1 request 2 (lane stylesheets override the `:root` aliases) delegated to W2/W3/W4/W5 in their briefs.

## Known flake

`src/brick/BrickStudioApp.test.tsx` "applies a custom group color as one undoable edit and keeps Cancel local" failed
once in a full run right after the W1 merge while another lane's suite was running; passes alone and on rerun
(1075/1075). W8 re-runs it three times in the integrated pass.

## Boundaries

No deploys, pushes, main merges, dependency, env, auth/provider, DNS or live-data changes from this branch. Domain
pairing is unresolved: no domain strings in source. Codex owns independent review and release.
