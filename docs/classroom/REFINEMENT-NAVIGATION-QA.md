# Refinement navigation — local verification

Branch: `codex/product-refinement`, based on Claude recovery integration `20859d1`.
This is a local checkpoint, not a production release or completion of the broader refinement goal.

## Implemented

- Home lives at `/`, the editor at `/build`; `/welcome` canonicalizes to Home. Existing live, published and classroom callback routes retain their meaning. Editor-return links, including older room recovery, target `/build`.
- World title opens the world menu: Home, My Worlds, My Class, save/export/import and the existing project actions. Save status remains independently visible.
- Explore/Back stays prominent. Scene and Character are visible and open the corresponding tab. Build together and Settings remain accessible at narrow widths.
- Undo/Redo, box selection (touch) and camera views share an editing toolbar. Capacity is secondary. Mouse direct-selection behavior remains unchanged.
- Home flushes guest/account work before navigating; account-save failure keeps the editor open. Live Home uses the existing beforeunload pending/recovery guard.
- Landing offers Continue building when a local draft exists. It never mutates the draft.
- Menu keyboard navigation and Escape return focus without cancelling an in-progress brick placement. The placed-brick selector retains its existing shortcuts.
- Duplicate empty-world instructions no longer overlap; landscape notices sit below the editing toolbar.

## Evidence

Node 22.23.2:

- Full frontend suite: 90 files, 866 tests passed.
- TypeScript and production build passed; existing large-chunk warning remains.
- `git diff --check` passed.

Browser verification command:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/path/to/chrome node scripts/qa/verify-refinement-ui.mjs
```

The committed harness is restricted to localhost. It used installed Playwright with isolated headless Chrome contexts, because the agent-browser CLI was unavailable. Default origin is `http://127.0.0.1:5190` and results/screenshots are in `/tmp/brick-refinement-ui`.

All six cases passed: 1366x768, 1024x768, 768x1024, touch 390x844, touch 320x740, touch landscape 844x390. Rendered header/toolbar buttons stayed within the viewport and did not overlap. Settings fit each viewport. Character opened the Character tab; menu entries remained accessible; Escape restored title-menu focus. No page exceptions or root-recovery screens occurred in the final cold-context harness.

The harness placed a brick through the actual UI, used Home, followed Continue building and observed one brick reopened. The complete local-storage document before and after reopening matched. A separate manual Playwright pass verified the same flow in the narrow layout. Desktop, Chromebook-width, 320px-touch and landscape screenshots were visually inspected.

The obsolete `mobileHeaderLayout.test.ts` tested arithmetic for independently positioned controls by parsing old CSS declarations. It was removed because the controls now share a flex toolbar; the real-browser bounds/overlap checks above replace that misleading source-level evidence.

During iterative development, hot replacement after changing hook order caused a caught React recovery screen. A cold reload and the final fresh-context checks passed. This does not establish hosted release behavior.

## Remaining goal work

- Persisted plate dimensions, safe resizing, limits and scene/placement/authority propagation.
- Expanded custom bricks with performance measurements.
- Dedicated modular character customizer, original content, appearance persistence and multiplayer verification.
- Wider camera visual/interior validation (constants and camera tests are already updated).
- Hosted candidate, authoritative account/live persistence and multiplayer checks, full integration checks, deployment and release evidence.

Browser size/touch emulation is not proof of physical Chromebook or phone performance. No frontend or Worker deployment was performed in this checkpoint.
