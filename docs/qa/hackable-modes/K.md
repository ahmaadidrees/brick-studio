# Slice K: the kits seam — October 29, 2026

The owner's decisions on the proposal's open questions came back on October 29 (README.md). This is slice K, which kids
cannot see: every Platformer project, power and save works as before.

## What changed

- **A project says which kit it is.**
  - `LevelDesign.kit` is `'platformer' | 'race' | '3d'` (`core/contracts.ts` `KitId`).
  - When it is missing, the project is a Platformer. The studio never writes `'platformer'`, so saves made before
    kits, and the golden saves, are byte-for-byte unchanged.
  - `validateDesign` rejects a kit it does not know.
- **The core picks the engine by kit.** `createRuntime` looks the design's kit up in `KIT_ENGINES` (`core/index.ts`).
  - Only the Platformer is registered, with the same primitives and lifecycle hooks as before.
  - Racing (R1) and 3D (D1) add theirs there.
  - A design whose kit has no engine is refused with a clear error, so it never runs as a Platformer.
- **The kit registry** is in `src/platformer/lab/kits.ts`.
  - It holds the kid-facing names (Hackable Platformer, Hackable Racing, Hackable 3D) and the short addresses the owner
    chose (`/2d/hackable`, `/2d/hackable-race`, `/3d/hackable`).
  - It also answers whether this version can open a kit.
- **A saved project opens as its own kit, whatever address it came from.**
  - The studio reads the kit from the save.
  - A Racing or 3D project opened today, from an account, this browser or a file, shows "This is Hackable Racing"
    rather than opening as a Platformer.
  - The tab title names the project's kit.
- **A power shows only in its own game.**
  - Power files get an optional `game`. Missing means the Platformer, so built-in powers and every existing power file
    are unchanged.
  - A power made in a Racing project is a Racing power.
  - "+ Power" lists only powers for the project's game: built-in, My powers and the class shelf.
  - Opening a power file for another game says whose it is.
  - The store refuses to snap a power from another game.
  - A power file naming a game this version does not know is not opened.
- **The class shelf** needs no migration.
  - `game` lives in the payload.
  - The Worker checks it on share and refuses unknown games.
  - Lists select `game:payload->>game`, and items carry `game` (missing means the Platformer).
- **Hackable account projects (Worker):**
  - `worldKit` reports `race` or `3d` for Hackable Racing and Hackable 3D projects. Platformers report nothing, as
    before.
  - "This is a Hackable Platformer. Open it there." names the project's own kit.
  - A save cannot change a Hackable project's kit.

## Held for R1 and D1

These are deliberately not in K, because kids would see them:

- the new addresses as routes;
- the "New project" entries;
- the My projects card labels for Racing and 3D;
- generic copy that still says "Hackable Platformers", such as "This browser keeps … Hackable Platformers".

R1's UI waits for the notes from today's class test.

## Tests

- **New:**
  - `src/platformer/lab/kits.test.ts` (11 tests): the kit validates, saves and reopens; unknown kits are refused;
    Racing and 3D are not runnable yet; files open as their own kit; powers are filtered by game.
  - Worker: a shelf test for `game`, and a Hackable Racing project that keeps its kit.
- **Unchanged and passing:**
  - Platformer feel tests (`feel/feel.test.ts`);
  - the side-by-side self-move test (`core/selfmove.test.ts`);
  - golden saves (`core/save.test.ts`);
  - powers tests (`studio/powers/*.test.ts`, `screen/PowersBar.test.tsx`).
