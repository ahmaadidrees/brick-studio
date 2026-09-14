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

All lane worktrees (w2–w8) were fast-forward-merged onto `7d9a48b` so every lane consumes the foundation. W6's
in-progress state was snapshotted as a WIP commit first (its staged CSS deletion blocked the merge).

## Merge order and gates

W1 ✔ → W4 → W3 → W5 → W6 → W7 → W2 → W8 evidence. `npm run check` under Node 22 at each boundary, then the W8 run
book (surfaces matrix strict, refinement UI, character customizer, route transfer, local two-client multiplayer,
performance on a quiet host, board captures).

## Open interface items

- W5 → W4: `WorldAndCharacterSheet.onApply` may return `{ ok: false, message }`; W4 returns the plate-resize rejection.
- W5/W2 ← W7: media filenames and intrinsic sizes per CONTRACTS (`scene-*-400` is 400×250, 16:10).
- W6 ← lead: keep "Toy Figure"/"Classic Builder" names; cc0-hero stays selectable, excluded from marketing media.
- W1 request 2 (lane stylesheets override the `:root` aliases) delegated to W2/W3/W4/W5 in their briefs.

## Boundaries

No deploys, pushes, main merges, dependency, env, auth/provider, DNS or live-data changes from this branch. Domain
pairing is unresolved: no domain strings in source. Codex owns independent review and release.
