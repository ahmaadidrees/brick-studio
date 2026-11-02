# Hackable Platformer, group C and three safety checks (2026-11-01)

Branch `claude/hackable-c-int`, from `main` b0d43fe, which matches production. It covers group C of the 2026-10-31 UX
explore ("overwhelming": the Hero's code and sliders, plain words, help). It also closes three gaps in how the
Hackable Platformer accepts outside content. The owner's go: "Yes, start group C".

| Lane | Record | What it did |
|---|---|---|
| Hero fold | `hero.md` | The Hero's Code opens on the level-start script, the 4 "When…" scripts and any script the kid made, plus one entry, "How I move · 23 scripts". "Show how it works" opens the movement scripts, still editable, with Back. Only the view changes: nothing moves in the saved program. |
| Plain words | `words.md` | Four sliders up front (walk speed, run speed, jump power, gravity), with the rest under "More sliders", all in plain words. Untouched saved Heroes get the new variable names; a Hero a kid edited keeps its names. "every tick" now reads "over and over". "Platformer blocks". Plain words in the toolbars, menus, Sounds and notices. |
| Help | `help.md` | Three first-run tips, shown once. A Help button (`?`) in the header. The save chip says "Saved" and explains itself when tapped. New brick: pick or draw a picture, name it, and land back in Build. Code is never required. |
| Checks | `checks.md` | Unknown blocks: a diagnostic, and powers that contain them are refused. Pictures and sounds: raster or audio `data:` URLs only, never a web address or SVG; a bad one in a save becomes a placeholder, and the kid is told. Class shelf: the Worker checks the whole power with the app's own rules. |

## Integration commits
- **The tap that opened the brick card could move a slider.** On a phone or Duo the card slides up under the finger. For 400 ms after it opens it now ignores touches. Checked in Chrome at 540x720: without the guard, a second touch 120 ms later set walk speed to 0; with it, nothing changed (`int/tap2-fix.png`).
- **A block that can't run** gets its own title in the problems list.
- **The header on tablets.**
  - The project name always keeps about six letters. Before, on an iPad in portrait it shrank to nothing, which already happened on main.
  - In a tight header the save chip gives way first, down to its icon; then the name, which keeps about six letters. Up to 1024 px (and 1200–1260 px, where the mode switch is centred) the chip and Sign in show just their icons; up to 1366 px My projects shows just its folder. Checked for overlaps at 13 widths from 768 to 1440. Tapping the chip still explains where the project is saved.
  - Wider screens are unchanged (`int/hdr-820.png`, `int/hdr-1366.png`).

## Checks
- `tsc -b` is clean.
- **Full `vitest run` on the merged lanes:** 302 files, 3,365 passed and 25 expected fail.
- **After the integration commits:** 302 files, 3,366 passed and 25 expected fail.
- **`npm run test:worker`:** 254 of 254.
- **`npm run build`:** OK.
- **Browser pass** (own Vite, guest mode, Chrome) at 1366x768, 820x1180, 540x720 and 390x844:
  - first-run tips;
  - the Hero's sliders and "More";
  - Code's top view and "How I move" (Code isn't offered under 540 px, by design);
  - Help, Play, and back to Build.
  - There were no console errors. Screenshots are in `int/`.
- **The pale colour of the "every tick" scripts** inside "How I move" is the same on main, so it isn't a regression.

## Not verified
- Real devices (Duo, iPad, Chromebook), and Safari.
- Signed-in saving and the class shelf against a deployed Worker. These were checked with mocks and Worker tests only.
- Dragging blocks by hand on a touch screen in the Code tab.

## Known, left for later
- **The Hero's script labels still use some engine words** ("p speed", "Coyote time", "Jump buffer", "tick"). They show only inside "How I move". Renaming them needs the fold's label matching and the Hero upgrade to move together. Suggested wording is in `words.md`.
- **On a Duo the costume editor cuts off its "Custom" colour row.** The preset colours are all reachable.
- **On phones under 540 px the save chip stays hidden, as before.** Help explains saving there.
- **Performance with big levels (group D)** isn't in this pass.

## Deploying
The Worker goes first, because the class shelf's deeper check runs there. Then the site. No migration.
