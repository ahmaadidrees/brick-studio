# Hackable UX group C, help lane (2026-11-01)

Branch `claude/hackable-c-help`, from main `b0d43fe`. Not pushed, not deployed.

Browser checks ran against Vite on port 5203 in headless Chrome, as a guest only. Screenshots are in `help/`, named
`<size>-<step>.png` for 1366x768, 820x1180, 540x720 (Surface Duo, one screen) and 390x844 (the last three with touch).

| Item | Status |
| --- | --- |
| 1. First-run hint | Done |
| 2. Help button in the studio | Done |
| 3. The save chip says "Saved" | Done (guest checked in a browser; account states by unit test only) |
| 4. "New brick" without Code | Done |

## 1. First-run hint

**What it is:** three steps (Build, Code, Play) in a small card over the level's top-left corner, with "Got it" and a
close button. Files: `screen/StudioHelp.tsx` (`FirstRunTips`), `screen/firstRunTips.ts`, `screen/StudioShell.tsx`.

**Where it sits:**
- It has no backdrop, so the level and the drawer still work around it.
- It is shown in Build only. It waits while Code or Play is open and comes back in Build until it is closed.
- Desktop and iPad: top-left of the level, 340 px wide at most. That keeps it clear of the zoom buttons (top right),
  the Hero's start and Play's buttons (bottom).
- Phones and the Duo: under the zoom buttons, with 16 px gutters.
- On a spanned Duo it stays left of the hinge, because it is anchored left and never wider than 340 px.
- Phone words differ: "Press Bricks, pick one…". Under 540 px it says Code needs a bigger screen.

**Shown once:**
- It is remembered in `localStorage` (`brickgineers.hackable.tips.v1`) as soon as it shows, so a reload does not
  bring it back. Help → "Show the first-run tips again" does.
- Every read and write is wrapped in try/catch. A browser that blocks storage shows the tips at each visit, and they
  still close.

**Tests stay stable:** `StudioShell` shows the tips only with `firstRunTips` set, and only `StudioApp` (the page) sets
it. No existing test needed changing for this.

## 2. Help in the studio

**Where it is:**
- A `?` button sits beside ⋯ in the header (`worldMenu` in `StudioShell`), so it is visible at every size.
- `ProjectMenu.tsx` was not touched.
- The regular 2D builder opens its help (Controls) as a `Sheet` from its ⋯ menu. Help reuses the same `Sheet`
  (dialog) for the same look.

**What it says:** short how-tos for:
- Build, including New brick;
- Code: switches, + Power, My Blocks;
- Play;
- Saving and sharing (files, and the chip).

**Its footer:** "Show the first-run tips again" (it goes back to Build first) and "More help", which opens `/help#how`
in a new tab so unsaved work is never left behind. `HelpPage.tsx` was not edited.

**A narrow phone (under 540 px):**
- The header's end buttons are 40 px, and the mode tabs have a little less padding.
- That fits brand, My projects, Build · Code · Play, Sign in, Help and ⋯ on one row; it was measured at 390 px.
- With an account chip wider than the Sign in icon, this may be tighter. Signed-in layout was not checked.

## 3. The save chip

**Files:** `ui/SaveStatus.tsx`, `ui/ui.css`, `shell/AppHeader.tsx`, `storage.ts`, `StudioApp.tsx`, `screen.css`.

**What it says:**
- Guests: "Saving…" from a change until it is written, then "Saved on this computer".
- A failed write: "Couldn't save". `watchAndSave` has a new `onSaveFailed`, so it never says Saved over a failed write.
- A guest's project that is not kept yet still says "On this computer only".
- Accounts keep "Waiting to save…", "Saving to your account…" and "Saved to your account".

**Tapping it:**
- In the Hackable studio the chip is a button (the `explain` prop is opt-in, so other studios are unchanged).
- Tapping it opens one or two sentences on where the project lives and what to do (`SAVE_WORDS` in `StudioApp.tsx`).
  Guests are told to open ⋯ and press Save File.
- Escape or a tap elsewhere closes it. It opens above a save banner.

**Narrow headers:**
- Tablets (768–1180 px) show just "Saved"; the icon says where (a computer or a cloud).
- The Duo shows the icon only; a tap explains.
- Under 540 px there is no room, so the chip stays hidden as before, and Help's "Saving and sharing" covers it.

**Kept from group A, unchanged:**
- retries and Try again;
- "Couldn't save" banners;
- the two-tab copy and its notices;
- the browser-full notice;
- the "saved on this computer for now" account fallback.

The chip's detail strings are the same as before; only the explanations are new.

## 4. New brick without Code

**The new flow:** "+ New brick" in the Bricks drawer opens `screen/NewBrickSheet.tsx`.
1. **Pick a picture:** eight ready-made looks from the existing brick art (Blob, Gold, Coil, Flag, then the grid
   bricks' Brick, Stone, Mystery, Bouncy), or "Draw my own". Drawing opens the real costume editor in a large sheet;
   Next waits until something is painted.
2. **Name it:** the name starts as the look's name and is selected, so typing replaces it. Names are made unique
   ("Walker" becomes "Walker 2"), with the same hint `BrickName` gives while typing.
3. **Make my brick:** back in Build with the new brick armed, so the paint strip says "Painting Walker 2". On phones
   the Bricks sheet closes. Code is never opened.

**Other behavior:**
- Backing out of drawing, or closing the sheet, removes the half-made brick.
- "Open its code" is still in the inspector once a copy is selected. `Inspector.tsx` was not changed.
- The helpers (`brickLooks`, `freeBrickName`, `startNewBrick`, `finishNewBrick`) are in `builder/newBrick.ts`.
  `store.ts` was not changed.

**Decision:** "New brick" inside Code's "In this level" keeps its one-step flow (a brick opens in Code with its name
selected). The kid is already in Code there. Three old shell tests that drove the drawer's New brick now drive that
Code button instead; what they check is unchanged.

**Decision:** a new brick has the same empty flag script as before, so it does nothing in Play until it gets code.
"Start from…" still appears when its code is opened.

## Checks

- `npx tsc -b`: clean.
- Full `npx vitest run`: 294 files, 3,293 passed, plus 25 expected failures. This includes the Hero feel tests. No
  golden fixtures were touched.
- New tests:
  - `screen/StudioHelp.test.tsx`: shown once, blocked storage, Help content, tips again.
  - `screen/NewBrickSheet.test.tsx`: lands in Build with no Code switch, unique names, the draw path, nothing left
    behind.
  - `ui/SaveStatus.test.tsx`: chip states and the explanation.
  - `StudioApp.new.test.tsx`: Saving… → Saved, and Couldn't save on a blocked write.
  - `storage.test.ts`: `onSaveFailed`.
- `multiplayer/worker` was not touched, so `npm run test:worker` was not run.
- Browser, guest, four sizes:
  - the tips, and that they do not come back after a reload;
  - Help, and tips again from Help;
  - chip states: new, Saving…, Saved, each explained, and Couldn't save (storage made to throw);
  - New brick: pictures, the taken-name hint, in Build, drawing, drawn brick in Build.
  - No page errors.

## Not verified

- **Signed-in saving:** the account chip states and their explanations are covered by unit tests only, with no real
  account or Worker. The signed-in header width at 390 px was not checked.
- **Devices and browsers:** real touch devices, Safari/iPadOS, a real Surface Duo (spanned or single), Chromebooks.
- **Drawing on phones:** drawing in the New brick sheet was checked by mouse only. Pinch-zoom inside the sheet was not
  tried. On the Duo the costume editor's "Custom" color row is cut off below the palette; the preset colors are all
  reachable.
