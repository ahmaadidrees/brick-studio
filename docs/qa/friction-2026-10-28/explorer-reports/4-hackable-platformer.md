# Friction: Hackable Platformer

I found 11 friction points, ranked by how many kids they likely hurt times how badly. Paths are relative to `src/platformer/lab/studio/` unless shown otherwise. I read code only and ran nothing, so anything marked *inference* is unverified.

**1. Code undo is wiped often, and the only recovery is hidden and all-or-nothing**
- **Who/when:** a kid who deletes or breaks the Hero's main script, then switches brick, snaps a power or flips a power On/Off.
- **Evidence:**
  - Undo resets whenever the editor rebuilds: `CodeEditor.tsx:286`, which reruns on brick switch and on every power change (`CodeEditor.tsx:349`, `store.ts` `applyPowerChange`).
  - The only way back is "Back to the original", inside Build's ⋯ menu (`screen/Inspector.tsx:88-90`). The Code screen has no way to it (`screen/CodeColumn.tsx:34`).
  - It brings back all of the brick's code, sliders and costumes (`remix.ts` `restoreBrickOriginal`) and can't be undone (`store.ts:250-253`, not recorded in Build's undo).
- **Severity:** blocks.
- **Fix:** keep one undo stack per brick across rebuilds, and add a "Bring back this script from the original" option in Code. M–L.

**2. Code is cramped on an upright iPad, and the On/Off switch is tiny**
- **Who/when:** school iPads held upright (768–1023px wide).
- **Evidence:**
  - The right column keeps `clamp(320px, 36vw, 380px)` (`screen/screen.css:227`), so palette and scripts share roughly 420px (*inference*).
  - Blocks start at 0.72 zoom below 1024px (`CodeEditor.tsx:177`).
  - The switch is 42×22 (`code/affordances.ts:114-115`), about 30×16 on screen at that zoom, well under a 44px tap target.
- **Severity:** confuses, and can block.
- **Fix:** below 1024px, fold the level into a collapsible strip; give the switch a hit area of at least 44px. M.

**3. Hero slider changes can't be undone, and Ctrl+Z quietly undoes something else**
- **Who/when:** a first change to the Hero (for example dragging jump or gravity to an extreme).
- **Evidence:**
  - Brick-wide sliders call `setBrickSlider` and skip the undo history (`workshop/KnobsCard.tsx:30`, `screen/Inspector.tsx:69`; `builder/history.ts:3-4` says knob changes are left out).
  - So Ctrl+Z in Build removes the last placed brick instead (`screen/StudioShell.tsx:115-118`).
  - There's no per-slider "back to normal".
- **Severity:** confuses and loses work.
- **Fix:** record brick-wide slider edits in the history (`knobEdit` already merges drags) and add a reset button per slider. S.

**4. Nothing tells a first-time kid that bricks have code**
- **Who/when:** the first visit.
- **Evidence:**
  - Help does nothing: `onOpenHelp={() => {}}` (`screen/StudioShell.tsx:154`), and the custom `worldMenu` replaces the menu that has the Help item (`shell/AppHeader.tsx:261`).
  - Code opens from a hidden double-click (`Stage.tsx:714-716`) or "Open its code", which only shows after selecting a brick (`screen/Inspector.tsx:133`).
- **Severity:** confuses.
- **Fix:** on first load, pulse the Hero with "Tap me to see my code", and wire up Help or remove it. S–M.

**5. A new brick "does nothing" because it isn't in the level**
- **Who/when:** making a brick from scratch.
- **Evidence:** `createNewBrick` opens Code without placing a copy (`builder/newBrick.ts:17-24`). The Restart note still appears (your Known section says so) and Restart shows nothing. Nothing says "not placed yet".
- **Severity:** confuses.
- **Fix:** an "Isn't in the level yet — Place it" chip in the Code header that switches to Build with that brick ready to place. S.

**6. The Hero's slider names are physics jargon with no explanation**
- **Who/when:** non-coders tuning the Hero.
- **Evidence:** names like "p speed", "meter slack", "wall shed", "skid", "late jump ticks" and "float gravity fast" (`hero/heroBrick.ts:95-131`). The card shows the name only (`workshop/KnobsCard.tsx:21`), and the kid-word reasons in the code's `from` field are never shown.
- **Severity:** confuses.
- **Fix:** rename them in plain words and show a one-line "what it does" under each. S–M.

**7. Hints are written for mouse and keyboard on touch devices**
- **Who/when:** iPad and touch Chromebook users in Build.
- **Evidence:** "right-click erases" (`screen/BuildDrawer.tsx:115`), double-click to open code (`Stage.tsx:714`), and Ctrl+Z tooltips.
- **Severity:** annoys.
- **Fix:** switch the hint text when `(pointer: coarse)` matches. S.

**8. Reset or Open-file replaces the whole project with no undo**
- **Who/when:** a curious kid in "This project".
- **Evidence:** `persist/ProjectMenu.tsx:57-147` (a confirm dialog only). Build's undo clears on load (`builder/history.ts:33`), and the local save then overwrites the project.
- **Severity:** loses work, but it's rare.
- **Fix:** keep the last version and offer "Undo reset" for a minute. S–M.

**9. Bricks a kid made can never be removed**
- **Who/when:** after several "My brick N" experiments.
- **Evidence:** `store.ts:384` `deleteBrick` has no caller in the UI.
- **Severity:** annoys; the drawer clutters up.
- **Fix:** a "Delete this brick" item in the Code header, with a confirm. S.

**10. The "couldn't open blocks" message is a dead end**
- **Who/when:** a damaged or older save.
- **Evidence:** `CodeEditor.tsx:633` says "Close this editor, then open the brick again", but the docked Code screen has no close button.
- **Severity:** blocks, but it's rare.
- **Fix:** add a "Try again" button and a "Bring back the original" option. S.

**11. Many bricks may slow the game down with no message (*inference*)**
- **Who/when:** big class levels.
- **Evidence:** one shared budget of 20,000 operations per tick for every script (`core/contracts.ts:21`, `core/runtime.ts:428`). The perf test only covers 20 bodies (`core/perf.test.ts:116`). If the Hero's every-tick loop doesn't finish, the game would likely run in slow motion silently.
- **Severity:** confuses.
- **Fix:** a perf test with about 100 scripted copies, plus a "Your level is working hard" note when the budget runs out. M.

**Not counted:** script run order, powers running after the basics, and no Code on phones, as you asked. Error messages only cover broken block layout (loose or unrecognised blocks); nothing reports a script that runs but has no effect.