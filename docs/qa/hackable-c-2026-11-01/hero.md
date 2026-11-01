# Hackable group C, 2026-11-01: Hero lane

Branch `claude/hackable-c-hero`, from main `b0d43fe`. Checked in Chrome (Playwright) against Vite on port 5201, guest
mode.

## Item taken
The Hero's Code opens on its ~23 movement scripts. Now it opens short: the level-start script, the 4 receivers, any
script the kid made, and one chip **How I move · 23 scripts · Show how it works**. The chip opens the movement scripts
like a My Block, with the breadcrumb **Hero's scripts › How I move** and **← Back**. Everything there stays editable, the
On/Off switches work, and kids can add blocks.

## What changed, and where
- `studio/hero/heroBrick.ts` (appended at the end; one import gains `readLabel`): `HERO_MOVEMENT_HATS` and
  `heroMovementLabels()`. The labels are read from `createHeroWorkspace()` itself, so they can't drift. The workspace
  isn't touched.
- `studio/code/sections.ts` (new): a small generic "brick sections" table, keyed by the catalog brick (a remix keeps its
  original's). A script folds only if its hat **and** its label match. The Racing Car can add one line here.
- `studio/code/layers.ts`: `LayerState.section`, the base of the path. Adds `openSection`, `currentSection`, Back
  (definition → section → top), the breadcrumb and its jumps, and dropping a section the brick doesn't have.
- `studio/code/affordances.ts`:
  - `SectionTracker` decides which section each script is in.
  - `isShownIn`, `applyView` and `focusView` understand sections. `untrackHidden` is new.
  - `tidyIfOverlapping` only checks scripts of the same section against each other.
  - `cleanUpShown` and `PackedLayout` are new (see below).
- `studio/CodeEditor.tsx`: wiring.
  - The chip shows in the docked column too. LayerBar used to be hidden there at the top view.
  - The diagnostics jump opens the section first.
  - All three save paths go through `serialize`.
- `studio/code/LayerBar.tsx`, `code.css`, `light.css`: the chip, styled like the My Blocks shelf chips, 44px tall. On a
  touch screen the docked Back and breadcrumb are now 44px too (they were 28px).

## Decisions
- **The saved code doesn't change.** The editor only hides scripts and draws them packed together. No events, no undo
  steps, nothing saved. Without packing, the top view opened on the start script, with the receivers about 7,000 units
  below it.
  - Every save writes each packed script's saved position back (`PackedLayout.toSaved`).
  - When a kid drags a packed script, it saves moved by exactly the same amount.
  - Checked both in the browser and in a test that fails if the write-back is removed.
- **Hidden scripts can't catch blocks.** They leave Blockly's connection lookup, so a block dropped where one sits can't
  snap into it unseen. Blockly adds loaded blocks back 1 ms after loading, so the editor takes them out again then, and
  whenever a drag starts.
- **The level-start script stays on the top view.** It isn't an "every tick" or "when I bump" script, so the brief's
  rule leaves it out of the section.
- **The count is 23, not 26.** That's 19 "every tick" scripts plus 4 "when I bump" scripts. The number is computed live,
  so it changes as scripts are added or removed.
- **A script made inside the section stays there for this visit.** That includes one pulled out of another script. The
  next time Code opens, it shows on the top view, because only the Hero's own labelled scripts fold. A script dropped on
  the top view is a top script.
- **Tidy blocks and the open-time tidy work one layer at a time for bricks with sections.** Otherwise they leave gaps
  where folded scripts sit. Other bricks still use Blockly's own `cleanUp`, as before.
- **Old saves with other labels show as they always did.** So does a kid's script with no label, or with a label of its
  own.

## Checks
- `npx tsc -b`: clean.
- New and extended tests, all passing:
  - `code/sections.test.ts` (6): which scripts fold, kid scripts stay on top, other labels show, remixes, counts.
  - `code/layers.test.ts` (+4): section path, Back, breadcrumb, pruning.
  - `code/affordances.test.ts` (+3): the Hero's top view and section split, pins, other bricks unchanged.
  - `code/CodeEditor.sections.test.tsx` (6): the chip and breadcrumb, On/Off in the section, the diagnostic jump,
    kid-script placement, the save being the same with or without opening the section, and no chip on other bricks.
- Full `npx vitest run`: 3284 passed, 25 expected fail, 1 failed. The failure was `core/perf.test.ts` "replays
  identically over 300 ticks", which timed out under load and passes when rerun alone (a flake; it doesn't touch the
  editor).
- Browser (screenshots in `hero/`):
  - At 1366×768, 820×1180 and 540×720 (touch for the last two), the chip is on screen and takes the click.
  - The section shows 23 scripts. Back returns to the top view.
  - No page errors.
  - Back is 44px tall on touch.
- Phone (390×844): Code is turned off there by design ("Code needs a bigger screen", under 540px), so there is no chip to
  reach. Screenshot `phone-390x844-no-code.png`.

## Not verified
- Real iPad, Duo or phone hardware, and Safari.
- Signed-in saving to the cloud. Only the local store save was checked.
- Dragging blocks into section scripts by hand on a touch screen. It was done by mouse and in tests.
