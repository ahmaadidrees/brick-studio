# Brick Workshop: UX explore pass (read-only)

Date 2026-10-07. Viewport 1366x768, fresh starter level, `localhost:5280/2d/lab/next`. Opened Hero, Walker, Coin, Spring,
Goal, ? block, Ground, Lava, Bounce block, Spikes, plus two new bricks (Block and Empty templates). Edits were made on
Spikes, ? block, a new custom block, and a Platformer block. No source file was touched.

Method note: bricks were opened through the real path (click brick, See inside, + New brick, Done) for Hero, Stone (Block
template) and Cake (Empty template), and through `devOpen.ts` for the rest. Script text was dumped from the store, so
the per-brick table below reflects the real saved scripts and their labels.

## What already works well

- **Script labels are the best thing here.** Every stack has a one-line grey comment in kid language ("When the Hero
  bumps me from below: give a coin"). Coin, ? block, Walker, Goal and the new Block template can be understood in
  under 20 seconds.
- **Drill-in is solid.** 🔍 chip row (MY BLOCKS) at the top, breadcrumb "Walker's scripts > walk at", big blue Back
  button. After Back, edits are still there. Make a Block lands you directly inside the new definition with the
  breadcrumb showing.
- **Plain-Scratch card** on a Platformer block (tested `change x speed by 1`) is clear: a title with the block name
  highlighted, a plain sentence, a real picture of the equivalent stack, "Read only: these are ordinary Scratch blocks",
  and a "Got it" button.
- **Make a Block lands inside the definition**, and the new block appears at the top of My Blocks. It feels like Scratch.
- **Edits take effect.** Changing the Spikes broadcast to `bounce` and `change coins by 2` both reached the store, and
  the test room restarts itself after each edit. Back/Done kept the edits. A new brick appears in the palette, selected
  for painting, with "0 in My world".
- **The "Block (snaps to grid)" template** teaches exactly one idea (bump from below, say Bonk) and reads like Scratch.
- **Costumes tab** (pixel painter, 16/24/32/48/64 sizes, big swatches) and the **Sound library** (play-to-preview, 10
  clear names) are friendly and uncluttered.
- **Header** "N in My world" and "Changes apply to every copy" tell the shared-brick story. The placed-brick count
  is a nice touch.
- **Wording is all kid-safe.** No jargon in the stack labels, and the word-bank pickers (block names, brick names)
  are consistently kid-safe.
- **Warning toast** ("Block isn't connected, snap under a hat block") is the right idea.

## Per-brick script readability

Rating is from a kid who knows Scratch: A = read and edit with no help, B = readable but one thing needs explaining,
C = needs a teacher, D = not readable by a student.

| Brick | Rating | Notes |
|---|---|---|
| Coin | A | `show / forever [spin, check for Hero]`. Definitions are 1 block and 1 `if touching Hero`. Textbook. |
| Goal | A | `forever [check for the Hero]`. Inside: `say Course clear!`, `broadcast course clear`, `stop all`. |
| Ground, Hard block, One-way platform | A | One block each: `solid on` / `only on top`. But three bricks that are the same script. |
| Spikes | A | Two stacks. Hurting is a bump hat plus `broadcast hero hurt`. Comment goes stale if you edit the broadcast (finding 4). |
| Bounce block | B | `when I bump bottom of Hero`: "bottom of Hero" is the Hero's bottom. Broadcast `bounce` plus `squash` (switch costume, wait 0.1, switch back). Nice. |
| Lava | B | `bubble` uses `change lava frame by 1` and `if (lava frame mod 6) = 0, next costume`. A Scratch kid would write `wait 0.2`. Hazard logic is `forever, if touching Hero`, a different style from Spikes (bump hat) for the same job. |
| Spring | B | `forever [launch the Hero]`; the comment says "if the Hero lands on me" but the code is `if touching Hero, broadcast boing` (fires every tick while touching, even from the side). |
| Walker | B | Good top level (`walk at (speed)`, `turn around`, `check for stomp`). Inside, `way` (1/-1) multiplied into `point in direction (way x 90)` and `set x speed to (way x speed)` is cleverer than a kid would write. `when I bump left/right of anything` labelled "on my right/left" (finding 3). |
| Brick | B | `hop` is `repeat 2 change y by 2, wait 0, repeat 2 change y by -2, set y to home`. The `wait 0` is odd. |
| ? block | B | The top level is excellent. Trap: `give a coin` hides a once-only guard, `set used to 1`, `switch costume`, `change coins`, `create clone`, all in one block (finding 1). |
| New "Block" template | A | `solid on`, `when I bump top of Hero, say Bonk!, wait 1, say (empty)`. |
| New "Empty" template | D (for first minute) | A black void with no hint (finding 5). |
| Hero | D | Main stack is fine (`forever [read keys, feel the wall, walk, run meter, jump, fall]`). `walk` is about 80 blocks with 9 nested if/else, `jump` ~45, `fall` has an `excess/limit/wall shed` algorithm. About 25 variables with names like `wall late left`, `early jump left`, `space was down`, `top speed now`. Not student-readable, nor meant to be (see finding 2). |

## Findings

### 1. [should fix] "Give 2 coins" the obvious way silently does nothing

Evidence: ? block, add a second `give a coin` under the first (drag from My Blocks). The test room still gives one
coin, because `give a coin` contains `if used = 0 then set used to 1...`. Changing `change coins by 1` to `2` (inside the
definition) works. There was nothing in the stack to tell a kid why the second call is ignored.

Why it matters: the owner goal is "simplify without hiding". This is the first edit a student will try on a ? block.
`give a coin` also does four unrelated things (guard, costume swap, score, spawn the popup coin), so the name lies.

Fix (a simplification): split it. Top level becomes
`when I bump top of Hero → if used = 0 { set used to 1, switch costume to used, give a coin }`, where `give a coin`
is only `change coins by 1` + `create clone`. The once-guard is visible in the main stack, and a second `give a coin`
inside the `if` works. Remove the pretend-simple name `give a coin` from carrying the guard.

### 2. [should fix] Hero: the Code tab invites a student to a wall of blocks

Evidence: Hero, 🔍 on `walk`. The definition fills the code area (zoom is large and not fit-to-view), about 80 blocks,
variables such as `wall late left`. Console shows no errors, but a 12-year-old opening this will not learn anything.

Why it matters: the teacher will tell students "open the Hero". The Hero is the one brick every kid opens first.

Fix: lead with the Knobs, not the code. When the brick is the Hero, show a one-line banner at the top of the code area
("The Hero's moves are long. Try the sliders on the right first. Curious? Open `walk`."), and auto-fit (zoom to fit)
the first view of any definition taller than the code area. Do not add features: this is two lines of copy and one
`fit()` call. Optionally collapse `More tuning (28)` by default (already collapsed).

### 3. [should fix] Bump hat sides are reversed from the label for the mover

Evidence: Walker. Stack labelled "When I run into something on my right: turn around" contains
`when I bump [left] of [anything]`. The same pattern on the Hero ("on my right", hat says `left`). For a solid brick
(? block) `when I bump [top] of [Hero]` means the Hero's top, i.e. the ? block was hit from below.

Why it matters: a Scratch kid reads "bump left of anything" as "I hit the left of something" or "something hit my left".
For the Walker the comment and hat contradict each other, and for the ? block `top` reads as "my top" but the
comment says "from below". It is the only place where code and comment disagree.

Fix (simplest, no engine change): reword the hat's text so it states the rule in the same direction for both roles,
for example `when I bump [anything]'s [left] side`... or at least make the Walker/Hero comments match the hat
("When I run into something's left side: turn around"). Longer term, use "my right side" for the mover as a hat
option. At minimum fix the two comments.

### 4. [should fix] Comments go stale the moment a kid edits

Evidence: Spikes. Change `broadcast [hero hurt]` to `bounce`. The comment above still says "When the Hero bumps me from
any side: hurt the Hero". Same after adding a second `give a coin` (comment says "give a coin").

Why it matters: the comments are the brick's documentation; after one edit they actively lie, and kids will trust them
over the code. A student's own scripts have no comment at all, so edited bricks look half-done.

Fix: keep the comments (they are great) but make them obviously editable: in Scratch you can right-click, add comment.
Add a faint "✎ your note" placeholder under each comment, or simply show a small badge `edited` on a labelled script
whose body changed since the template. Smallest version: nothing in code, but tell the teacher in the lesson. Do not
build auto-regenerated text.

### 5. [should fix] "Empty" brick is a black void; the first 30 seconds have no hint

Evidence: + New brick, Empty, pick "Cake". The code area is empty, the test room shows a purple blob that does nothing,
no hat block, no message. The flyout opens on My Blocks with only a "Make a Block" button.

Why it matters: this is the one place a student starts from scratch. A 10-year-old will not know to open Events.

Fix: give the Empty template a single starter stack, `when ⚑ clicked` plus the comment "Start here: drag blocks under
the green flag". That is the same hat they already know. Alternatively a grey drop-hint in the empty workspace.

### 6. [should fix] The tiny 🔍 is overloaded and hard to hit

Evidence: Zoom in/out buttons in the toolbar are labelled `🔍+` / `🔍−`, the same glyph as "See inside" on My Blocks
and on Platformer blocks. The in-block 🔍 is about 10-12 px wide at 1366x768; two of my clicks on it missed (one landed
on the block label, and one on the warning bubble).

Why it matters: on a Chromebook trackpad a kid will miss it, and "🔍 = zoom" in Scratch muscle memory conflicts with "🔍 =
look inside". Platformer blocks also have an inline 🔍 inside reporters (`🔍 x speed`), which adds noise in every
expression of the Hero.

Fix: change zoom to Scratch's usual `+`/`−` icons (or `Zoom in`/`Zoom out` text), keep 🔍 only for "see inside". Make the
click target of the block 🔍 at least 24 px (padding, not size). Remove the 🔍 from reporter blocks inside expressions
(keep it on stack blocks), or show it only when the block is hovered.

### 7. [should fix] Code area is cramped at 1366x768

Evidence: Hero and ? block. The flyout takes about 190 px and the code area has about 510 px; the Test room and Knobs
column on the right takes about 400 px. A dropped Platformer block landed half off-screen (at the edge). The warning
toast ("1 block needs attention") covers the lower quarter of the code area.

Why it matters: Scratch kids drag blocks into the middle of the workspace; here the drop zone is a narrow
column. Scripts at fixed y positions also overlap once a stack grows (? block's `give a coin` stack ran into the next
comment after one added block, Tidy fixes it).

Fix (removals): (a) make the Test room column narrower by default (it is mostly empty sky) or collapsible; (b) hide the
Knobs card when the brick has none (Spikes, ? block, Ground...): "none yet" cards take room and prompt a variable
lesson nobody asked for; (c) show the toast inline in the toolbar (the `1 Notice` pill exists) instead of a floating
panel over the code.

### 8. [polish] Palette clutter a Scratch kid will not use in a level

Evidence: Sensing: `ask and wait`, `answer`, `username`, `loudness`, `set drag mode`, `current year`, `days since 2000`,
`touching color`, `color is touching`. Events: `when backdrop switches to`, `when stage clicked`. Looks: `switch backdrop`,
`next backdrop`. Sound: pitch effect blocks. Also the `Platformer` category heading is followed by a second heading
"Platformer extension".

Why it matters: this is the "intimidating" part. These blocks either do nothing in a platformer or are asking for
trouble (`username`, `ask and wait`).

Fix: remove them from the toolbox, not from the compiler (so imported projects still load). Keep Motion/Looks/
Sound/Events/Control/Sensing/Operators/Variables as today, My Blocks first, Platformer last. Rename the second heading
to nothing (delete it).

### 9. [polish] Stock Blockly "to do something / return / if return" flashes in the flyout

Evidence: right after opening any workshop, the My Blocks flyout shows pink `to [do something]`, `[return]` and
`if <> return` (non-Scratch blocks) for about a second before the Scratch-style flyout takes over. Console warnings:
"Block definition procedures_defnoreturn overwrites previous definition", "Unable to find [category][flyoutinflater]
in the registry" (6 times). No errors.

Fix: suppress the first paint (hide the flyout until the custom inflater is registered), or register the inflater before
mounting. The warnings are harmless in dev but the flash looks broken.

### 10. [polish] Toolbar and header wording

- `🎛️ 4 Build Knobs` pill: jargon and duplicates the Knobs card; it is not clickable. Remove it, or say "4 sliders".
- Two different "Center" buttons (code toolbar `🎯 Center`; Costumes tab `Center`, which centers the picture).
  Rename the costume one "Center picture".
- Sounds tab: `+ + Add sound` (double plus) and an empty-state "Browse library" that duplicates the top button. Keep one.
- "Changes apply to every copy" is small and low-contrast at the top right; it is the single most important idea
  about bricks. Make it the same size as the "N in My world" subtitle.
- Builder says "This world", workshop says "My world". Pick one.
- Make a Block: the dialog pre-fills the name `jump`, which already exists on the Hero (a new block called `jump` in a ?
  block looks like the Hero's). Start with an empty Label slot or the word the kid just chose last time.
- Make a Block with the word picker open pushes the footer (`Cancel` / `Create Block`) to the bottom edge of the
  768px viewport; it is clipped, and the picker needs `Done` first. Collapse the explainer text or cap the picker height.
- Make a Block cannot take free text; names come from a word bank (jump, dash, spin, bounce, glide, teleport, patrol,
  stomp, float...). This is consistent with the "pick a name for your brick" screens, and keeps names safe, but a kid
  will want `give two coins`. At least allow combining two or three words (the "Add a label" button seems to do this;
  say so in the helper text: "Add another word to make a longer name").
- "Run without screen refresh (warp speed)" is faithful Scratch but meaningless to a 10-year-old. Hide it behind a
  disclosure, or drop it.

### 11. [polish] Other small things

- Palette tile for the ? block reads like "7 block" at 1366x768 (the label font renders `?` like `7`).
- Hero respawn is hard-coded `go to x:60 y:24`: if a student drags the Hero start elsewhere, dying sends it back to the
  wrong place. Use a variable or `go to` of the starting position.
- Goal ends with `stop all`, which kills every script including the test room, so the room freezes after the Hero
  touches the Goal; fine in a level, surprising when tinkering.
- The test room needs a click, then arrow keys, to try anything; the helper Hero is tiny. The hint line ("Click the
  room, then use the arrow keys, space and X.") is good. For non-Hero bricks, move the helper Hero near the brick
  instead of in the far-left corner, so a kid sees the effect without a platforming detour.
- Costume names in the ? block are `?`, `used`, `coin`: a `coin` costume on a ? block is a mystery until you read
  `rise and vanish`.
- No brick has any sound attached, so `play sound` is an empty menu; the coin and Bounce block could each ship with
  `coin` and `boing`.

## Top simplifications (summary)

1. Put the once-only guard in the ? block's top-level stack (finding 1).
2. Add a Hero banner pointing to the Knobs, and fit-to-view definitions (finding 2).
3. Make Walker/Hero comments match the hat sides (finding 3).
4. Give the Empty template a `when ⚑ clicked` hat (finding 5).
5. Remove ~15 irrelevant Sensing/Events/Looks blocks from the toolbox (finding 8).
6. Stop using 🔍 for zoom; bigger click target for See inside (finding 6).
7. Hide the Knobs card and Build Knobs pill on bricks with no knobs (findings 7 and 10).
