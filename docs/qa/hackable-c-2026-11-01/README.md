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

## See inside fixes (2026-11-02)
After four read-only explorers looked at the mode, the owner chose the small See inside fixes ("See inside fixes").
- **One name.** The brick card's button and the "How I move" fold now both say **See inside**, and so does Help. Before, the same idea had four names.
- **A Duo can open code from the brick card.** At 540–767 px the card said "Code needs a bigger screen", even though the Code tab works there. Now it shows See inside and Change costumes; only phones under 540 px get the note (`int/see-inside-duo-card.png`).
- **🔍 means See inside, ? means How it works.** My Block calls keep a 🔍 that opens the block; Platformer blocks get a ? that opens the card instead. Both are round buttons, 36 units wide: about 23 px at the Hero's zoom, where the old emoji was 15 px. They work on touch and have names a screen reader can use. A ? only appears on blocks that have a card.
- **The palette has ? too.** A kid can ask how a Platformer block works before dragging it out. Tapping the ? opens the card without adding the block (`int/how-it-works-palette.png`).
- **The How it works card:**
  - It sits over the whole page, so the palette's categories no longer cover it.
  - It follows the light theme. Its title used to be white on white.
  - It scrolls, and "Got it" stays at the bottom.
  - It never shrinks blocks below 0.6, and has its own − and + buttons plus pinch to zoom. Blockly's own zoom buttons would load their pictures from blockly.com.
  - Esc closes it, focus starts on ✕, and focus goes back to the block afterwards.
  - The title is now "How on ground? works", and the footer explains that this is a picture to look at.
  - On a Duo it fits: 516x640, with "Got it" visible (`int/how-it-works-duo.png`).
- **Checked in Chrome** at 1366x768, 820x1180 (touch) and 540x720 (touch):
  - the card opens from a script and from the palette;
  - Esc closes it and focus returns;
  - zoom works;
  - Duo card → See inside → 🔍 drills into "give a coin".
- **Left for the focused "inside" view (next):** the Hero still opens at the smallest zoom. A drilled-in My Block lands at the right edge instead of in view. On a Duo the code area is still small.

## The inside view (2026-11-02)
Next, the owner said "Yes, build it" to the focused inside view.

- **"How I move" opens as a list** of its 23 scripts, in the order they run (`int/inside-list-1366.png`).
  - Each row has a plain name, what the script does, and its own On/Off switch.
  - "when I bump" scripts are tagged.
  - Tapping a row shows that script alone. "Show all 23 at once" keeps the old view.
- **The trail names where you are,** e.g. "Hero's scripts › How I move › Move › move and collide". It is bigger now: 36 px buttons and 15 px text, where it was 28 px and 12 px. Back goes one step at a time: the My Block, then the script, then the list, then the top.
- **Code opens readable.** Every view opens at 0.85 zoom (0.75 in a narrow editor), with its first script at the top left, so the kid scrolls for more. Before, it shrank everything to fit, which put the Hero at 0.65, and a drilled-in My Block could land at the right edge (`int/inside-drill-1366.png`).
- **Room for the blocks inside.**
  - Inside a section, a script or a My Block, Powers step aside.
  - On a Duo, the level also shrinks to a strip and its bricks and the "Built-in" chip step aside. The blocks area goes from about 208 to 370 px (`int/inside-script-duo.png`).
  - At the top view, everything is back.
- **Plain words on the scripts:** "Late jump" and "Early jump" instead of Coyote time and Jump buffer; "full run speed" instead of p speed; "over and over" and "a moment at a time" instead of tick.
  - These are drawn only. The saved labels, which sort scripts into the section, don't change, so old saves and the Hero upgrade aren't affected.
- **No running glow inside a section.** Nearly every movement script runs every moment, so the glow only washed them out.
- **A script dropped next to the one on screen stays visible** and joins the list. A diagnostic inside "How I move" opens its script directly.
- **Saved data is unchanged:** the "changes nothing it saves" test now walks list → script → all → back.
- **Checked in Chrome** at 1366x768, 820x1180 (touch) and 540x720 (touch): list, script, 🔍 drill, Back ×3, and the Duo layout. The ? block's "give a coin" now opens top-left.
- **Not done:** on a Duo the top view is still about 310 px for the blocks, because the level and its bricks keep their row there.

## Teacher fixes (2026-11-02)
The owner chose "Teacher fixes first" before group C ships. These come from the teacher explorer's day-one and day-two list, limited to fixes that need no Worker change and no policy decision. All of them are on `/class`, plus one line on `/projects`.
- **Open goes to the right place.** On `/class`, "Visit" and "Join" always linked to `/live/…`, which is wrong for 2D levels and Hackable Platformers. Now one "Open" button picks the right page, the same way `/projects` does: a 3D room, `/2d/w/…`, or the Hackable page.
- **Pause building is one button** in the class head, with one confirm ("Keep building" / "Pause now"). When paused, "Resume building" is one tap. Before, pausing took Settings, then a switch, then a confirm (`int/teacher-pause-dialog.jpg`, `int/teacher-paused.jpg`).
- **One name for it: "Building together".** The chips read "Joining open" and "Building together on / paused". The Settings switch, the Worlds tab, `/projects` and Help all say "pause building together" now, instead of a mix of "Collaboration open", "Close collaboration" and "Building together". The old in-studio teacher panel (`ClassView.tsx`) still uses its own words.
- **The roster is near the top.** Once a class has students, the code card folds to one line: the code, the join address, Show on projector, and "QR and join link". The roster starts about 400 px down at 1366x768; before, it was about 940 px. A class with nobody in it yet keeps the full card (`int/teacher-students-1366.jpg`, `-820`, `-390`).
- **"View class codes" opens the code right there,** scrolled into view and focused. Before, it opened Settings, which doesn't show the code. "Fold away" puts it back.
- **The roster columns line up.** Rows had five columns under a four-column header. Checked in Chrome at 1366: the header and row cells start at the same x.
- **The Shelf tab says what's waiting,** e.g. "Shelf · 2 waiting", before the teacher opens it. Opening the tab keeps the count current.
- **The sharing switch says it also closes the shelf.** "Students can share" covers bricks too, which matches what the Worker already does.
- **Smaller fixes:**
  - The rail says "My projects" and links to `/projects`.
  - Chips in narrow cards wrap instead of spilling out.
  - On `/projects`, a teacher whose class is paused is told so, with a link to resume it. Before, it said the teacher had "closed collaboration".
- **Checked:** `tsc -b` clean; `src/pages`, `src/classroom` and `src/shell` tests 383 of 383; build OK. The full suite had 7 time-outs under load (Code sections, slot shadows, the perf replay, the 3D studio), and those 4 files pass alone (78 of 78). Chrome on the `/class?demo=everyday` fixture at 1366x768, 820x1180 and 390x844: the strip, View class codes, Pause → Pause now → Resume, Shelf · 2 waiting, and roster alignment.
- **Tests** cover all three Open link kinds, Pause/Resume with Keep building, the folding card, the waiting count, and the teacher's paused line.
- **Still open, needing a decision or the Worker:**
  - opening teacher sign-up (the `BRICK_TEACHER_IDS` allowlist);
  - a "right now" view of the class, and whether teachers can see unshared work;
  - adding many students to a group at once;
  - a projector spotlight and an "N joined" count;
  - removing the old in-studio teacher dashboard;
  - one "Start a shared world" form.

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
