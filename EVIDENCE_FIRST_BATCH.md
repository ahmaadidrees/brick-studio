# Virtual Legos first execution batch evidence

## Isolation record

Recorded before source implementation on 2026-07-20 at 20:43 PDT.

- Required baseline: `078d3ae076207f52c0df0cf0e6a058298e1643e8` (`Initial Brick Studio MVP`).
- Canonical integration worktree: `/Users/ahmaadidrees/.codex/worktrees/4b9c/Virtual Legos`.
- Canonical integration branch: `codex/virtual-legos-execution`.
- User main checkout (untouched): `/Users/ahmaadidrees/Documents/Virtual Legos`, branch `main`, same baseline commit.
- Lane A worktree/branch: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-lanes/world`, `codex/virtual-legos-world`.
- Lane B worktree/branch: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-lanes/mobile`, `codex/virtual-legos-mobile`.
- Lane C worktree/branch: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-lanes/reliability`, `codex/virtual-legos-reliability`.
- No repository `AGENTS.md` instruction file was present.
- Port 5173 is reserved for the user's server and will not be inspected, stopped, restarted, or reused.
- No remote mutation, deployment, push, or pull request is authorized.

## Baseline verification

- `npm ci`: 185 packages installed from the existing lockfile; 0 vulnerabilities.
- `npm test -- --reporter=verbose`: 2 test files passed, 6 tests passed.
- `npm run build`: TypeScript and Vite production build passed. Vite reported the pre-existing large Rapier chunk warning.

## Integrated verification

Pending lane integration.

