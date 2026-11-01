# Group C, words lane: the Hero's sliders and a plain-words pass (2026-11-01)

Branch `claude/hackable-c-words` from main b0d43fe. Nothing pushed or deployed.

## Items taken

1. The Hero's sliders: four up front, the rest behind a closed "More sliders (28)", grouped Walking / Running /
   Jumping / Falling / Walls, every name in plain words with a one-line hint. Values never change.
2. One plain-words pass over the Hackable mode's kid-facing text (display text only: no opcode, field value or saved
   data changed).

## 1. The Hero's sliders

Where: `studio/hero/heroBrick.ts` (names, hints, `HERO_OLD_VARIABLE_NAMES`), `studio/workshop/knobs.ts` (`knobWords`),
`studio/workshop/KnobsCard.tsx` + `workshop.css` (hint line, "More sliders (N)"), `studio/remix.ts` (the upgrade).

| id | old name | new name | hint |
|---|---|---|---|
| walk_top | walk top speed | **walk speed** | How fast I walk. |
| run_top | run top speed | **run speed** | How fast I run when you hold x. |
| jump_stand | jump standing | **jump power** | How high I jump. |
| fall_gravity | fall gravity | **gravity** | How hard I get pulled down. |
| walk_push | walk push | walk speed-up | How quickly I get up to walking speed. |
| friction | friction | slow down | How quickly I stop when you let go of the arrows. |
| skid | skid | turn around | How quickly I slow down to turn around on the ground. |
| air_push | air push | air steering | How much I can steer while I am in the air. |
| air_turn | air turn | turn in the air | How quickly I turn around in the air. |
| p_top | p speed | full run speed | My fastest run, once the run meter is full. |
| run_push | run push | run speed-up | How quickly I get up to running speed. |
| meter_slack | meter slack | meter wiggle room | How far under run speed still fills the run meter. |
| meter_fill | meter fill ticks | meter fill time | How long each bar of the run meter takes to fill. 30 is one second. |
| meter_drain | meter drain ticks | meter empty time | How long each bar takes to empty when I stop running. 30 is one second. |
| meter_full | meter full | meter bars | How many bars fill the run meter. |
| jump_walk / jump_run / jump_p | jump walking / jump running / jump at p speed | walk / run / full run jump power | How high I jump while I walk / run / when the run meter is full. |
| walk_jump_from / run_jump_from / p_jump_from | walking / running / p jump from | speed for walk / run / full run jump | How fast I must go to get that jump. |
| hold_slow / hold_fast | float gravity slow / fast | float gravity / run float gravity | Lighter gravity while I go up and you hold space. / The same, for a jump from a run. |
| late_ticks / early_ticks | late / early jump ticks | late / early jump time | ...ledge I can still jump / ...a jump press still counts. 30 is one second. |
| max_fall, wall_slide, wall_up | (unchanged) | top fall speed, wall slide speed, wall jump up | hints added |
| wall_shed | wall shed | wall grab slowdown | How much speed I lose when I grab a wall. |
| wall_push | wall jump push | wall jump sideways | How hard a wall jump pushes me away from the wall. |
| wall_lock_ticks | wall jump lock ticks | wall jump no-steer time | How long after a wall jump I can't steer back to the wall. |
| wall_late_ticks | wall late ticks | wall late jump time | How long after I leave a wall I can still wall jump. |

Working memory (palette only): push now → speed-up now, p jump → full run jump, wall late left → wall late jump left,
wall lock left → no-steer time left, wall lock side → no-steer side, fall limit now → top fall speed now, fall excess →
extra fall speed, jump now → jump power now. The rest (steer, arrow, run meter, late jump left...) were already plain.

**"jump power", not "jump height".** The brief listed "Jump height". The number is a take-off speed (`set y speed to
(jump power)`), not a height, and doubling it does not double the height; the code already called it "jump power".
One string to change if you prefer "jump height".

**Sliders on a phone / Surface Duo.** The four up front drop their hints below 600 px wide so they still fit the sheet;
the "More" sliders keep theirs.

### How old Heroes keep working (the safety rule)

Blocks point at a variable by its **id** (`fields.VARIABLE = 'p_top'`), never by its name, so a rename can never leave a
block pointing at a missing variable. The one place a name matters is Scratch's `[property] of [brick]` block, which
looks a variable up by name (core/sensing.ts). Chosen approach:

- **New Heroes** get the plain names (they come from `heroVariables()`).
- **An untouched saved Hero** (built-in, not "My Hero", blocks fingerprint exactly the current Hero's, and every
  variable in both the brick and its workspace still has exactly its old name) is renamed when the save opens, in
  `upgradeUntouchedHero` (remix.ts), the same path that already upgrades earlier Heroes. Only the names change: values
  the kid tuned, blocks, compiled program, costumes stay. Through Blockly's own load/save the fingerprint is the same.
- **Earlier Heroes** (the fingerprint list) already move to today's Hero, so they now get the plain names too.
- **A Hero a kid changed** (other blocks, a turned-off script, a power snapped on, "My Hero", or one variable renamed by
  the kid) keeps every name: kid code is never silently rewritten. Its sliders still show the plain words (`knobWords`
  matches by id plus old-or-new name) and the hint adds "In the code it is called “p speed”." A variable the kid renamed
  shows the kid's name.
- **Any brick reading a Hero variable by its old name** ("p speed of Hero") stops the rename, for both paths, so that
  block keeps working. (The editor's "of" menu does not offer Hero variables today, so this guards imported files.)

Tradeoffs to know: the stored save keeps the old names until the next save (the upgrade is in memory on open, as before).
A file opened with ⋯ → Open File is not upgraded until it is opened again (true before this change for earlier Heroes
too: `importProjectJson` does not call `upgradeUntouchedHero`). "Back to the original" on an edited Hero brings the new
names, as it brings back everything else.

Tests: `studio/hero/plainNames.test.tsx` (12 tests) with a new fixture `hero/__fixtures__/hero-before-plain-names.json`
(the starter Hero exactly as main b0d43fe made it). It checks: the fixture holds exactly the old names and today's
blocks (also after a Blockly round trip); an untouched old save opens with the new names, same values, same blocks and
program, valid design, no block pointing at a missing variable, and upgrading twice changes nothing; **the Hero's path,
tick by tick over 167 ticks of walking, running, jumping and turning, is identical** for the old save, the upgraded save
and a new Hero; "Back to the original" disappears after the upgrade; a save file and the editor's own save upgrade the
same way; sliders work (4 + More); edited / "My Hero" / kid-renamed Heroes are left alone with working sliders; a
"p speed of Hero" reader keeps the names; both earlier Hero fixtures upgrade with working sliders; the step 6b save
(an older Hero no fingerprint knows) is left as it is, every block's variable is there, and its sliders read in plain words. Existing
fixtures are byte-identical (`git diff b0d43fe -- '*__fixtures__*'` shows only the new file). Feel tests pass.

## 2. Plain-words pass

- **The "every tick" hat now reads "over and over"** (definitions.ts; opcode `platformer_everytick` unchanged). Not
  "forever": Control already has a forever loop, and a hat with the same word would read as the same block (kids would
  wonder which to use, or try to put one inside the other). "every moment" is vaguer. "over and over" is words a 2nd
  grader reads, says it repeats, and matches no Scratch block. Tooltip: "Runs these blocks over and over, 30 times a
  second, while the level plays. Scripts take turns in the order they were made."
- Toolbox label "Platformer extension" → "Platformer blocks". Short kid tooltips on the Platformer blocks that had none;
  "next tick", "flush against the first solid face", "True when" reworded. Scratch's own block text is untouched.
- "How it works in plain Scratch" cards (plainScratch.ts): "every tick" / "once per tick" → "over and over" /
  "30 times a second".
- Code toolbar: Stage tag "Global" → "Whole level"; "Make a custom block" → "Make your own block"; "N Notices" →
  "N to check"; reset-zoom wording. Docked toolbar "N notices" → "N to check".
- Block notices (DiagnosticsList.tsx): "Block isn't connected" → "This block is not snapped on"; "Could not load
  blocks / ...this workspace" → "These blocks would not open"; "An input lost its name" → "A slot lost its name";
  "needs attention" → "needs a look"; "Jump to block" → "Show me". (`block.no_type` left to the checks lane.)
- ⋯ project menu: "Reset" → "Start over" (button and confirm, matching the existing confirm text); plainer tooltips.
  "Save File" / "Open File" kept: notices in StudioApp, storage.ts and hackableCloud.ts tell kids to press them.
- Sounds panel: "Add synthesized retro sounds from the library!" → "Pick a sound from the sound library."; library help.
- Make a Variable: "Scope" → "Who uses it"; "One global value shared across..." reworded. Make a Block: "Block
  Preview" → "Your block", "Block Parts" → "Parts", "Boolean" → "Yes or no".
- Variable word picker: velocity, opacity, radius, phase, target, thrust → spin, fade, reach, turn, goal, boost;
  category names "Motion & Physics" / "Stats & State" / "Label Connectors" → "Moving" / "Other numbers" / "Joining words".
- Built-in powers: "dash cooldown ticks" → "dash rest time", "hop every ticks" → "hop wait time" (new snaps only; bricks
  that already have the power keep their names).
- Lava's My Block label "every 6th tick" → "every 6th time around".

### Bad words seen in files other lanes own (not changed)

- heroBrick.ts script labels (another lane matches them): "Coyote time", "Jump buffer", "p speed" in three labels
  ("Run with x: ... p speed once the run meter is full", "Run meter: ... full means p speed", "Faster jumps go higher:
  walking, running and p speed ..."), "Forget an old jump press, one tick at a time", "Gravity: pull me down every
  tick". Suggested: "Late jump", "Early jump", "full run speed", "one moment at a time", "over and over".
- DiagnosticsList `block.no_type` "Unrecognized block" (checks lane); the fallback shows the compiler's own message
  (compile.ts: `Disconnected block "motion_movesteps" ignored`, "Workspace is null or not an object").
- `screen/Inspector.tsx` was fine as is.

## Found on the way (not fixed, outside this lane)

At 540x720 (touch), tapping the Hero in Build opened the slider sheet and the same tap's click landed on the "walk
speed" slider under the finger, setting it to 1. Reproduced twice with Playwright's `touchscreen.tap`; a mouse click
does not do it. Worth checking on a real tablet: a kid tapping the Hero could change a slider without knowing. The
screenshots use a mouse click for that reason.

## Checks

- `npx tsc -b`: clean.
- Full `npx vitest run`: 3273 passed, 25 expected fail, 4 failed on the first run, all timeouts under load
  (BrickStudioApp x2, core/perf replay, CodeEditor.loadFailure at 67 s); the three files rerun: 70/70 passed. Flakes.
- Browser (Vite on 5202, Chrome via Playwright, guest mode), screenshots in `docs/qa/hackable-c-2026-11-01/words/`:
  Hero inspector with More closed, open (Walking) and open (Walls) at 1366x768, 820x1180, 540x720, 390x844; Code
  palette (Platformer and Variables) at 1366x768 and 820x1180; at 540x720 and 390x844 Code is not offered ("Code needs a
  bigger screen"), so those sizes show the Build sheet only. Also an end-to-end old save: a file made from the
  pre-change Hero (old names, full run speed tuned to 9) opened with Open File, the page reloaded: the blocks show
  "no-steer time left" (3, none of "wall lock left"), the "full run speed" slider reads 9, and the Hero walks in Play.
  No page errors.

## Not verified

Real devices (iPad, Surface Duo, phones), Safari, signed-in account saving and class rooms (the upgrade runs on every
open path that already ran `upgradeUntouchedHero`, but I did not open an account or class-room project), screen readers
(the hint is wired with `aria-describedby`).
