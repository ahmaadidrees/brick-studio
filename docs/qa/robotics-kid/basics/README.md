# The studio basics a child hits while building a robot: evidence (kid-UX pass, lane M)

Branch `claude/robotics-kid-basics` (from `9f24b4d`), 2026-09-23. Principles: `docs/robotics/KID-UX.md`
(few words, big targets, always show the next step). Everything here is behind `VITE_ROBOTICS_PROTOTYPE=1`
(`vite --mode robotics`) except the one bug fix listed at the end. Harness:
`scripts/qa/robotics-kid-basics.mjs`, real Chrome through Playwright with a real mouse, keyboard and wheel,
against `npx vite --mode robotics --port 5245 --strictPort --host 127.0.0.1` and, for the flag-off check,
`npx vite --port 5246 --strictPort --host 127.0.0.1`:

    PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5245 node scripts/qa/robotics-kid-basics.mjs

The mouse goes where the studio's own world-to-screen projection says a part is (the aiming a student does
by eye). The store, `window.__robotics.basics()` and the camera distance are read only for the verdicts.
`results.json` has every check and the measurements.

## Result: 58 of 58 checks pass

| What testers hit | What the prototype does now | Checks | Pictures |
| --- | --- | --- | --- |
| **1. A wordy first screen; the build started with a 2 × 4 brick being placed** (Maya, Leo, Sam) | "Let's build!", three picture tips in 2–4 words each in the device's words (mouse: *Pick a part · Click to place it · Right-drag to look around*; touch: *…Tap, then Place · Drag to look around*), one big **Start building** and a clear **Build a robot** that opens the drawer (or the touch sheet) on **Start with a kit**. 18 words in all; every button ≥ 44 px; no text under 14 px. **Nothing in hand at start.** | `A.*` | `A1`–`A4` |
| **2. A moved motor left floating at Height 6** (Leo) | A dragged part lands on the surface under the pointer and settles there; it never hangs in the air and never sinks into what it crosses. The ghost shows exactly where it will land while dragging. Moving a part never stacks it on its own old spot (a bug, fixed for everyone: see the end). | `B.*`, `C.no-self-stacking` | `B1`–`B3`, `C7` |
| **2. Adjust → Left "blocked"; the height handle pulled down "left it beside the plate"** (Leo) | Arrows slide one stud and settle: off an edge the part drops (`32/1 → 33/1 → 34/0 on the ground`), back again it steps up onto the plate. Raise and Lower hop only between heights where the part sits on something; **Raise** with nothing up there says *"Parts can't float. Put something under it."*; **Lower** says *"It can't go any lower."* and outlines what it sits on. The height handle does the same: pulled up, the part stays (and says why); a part left in the air (its support deleted) pulled down lands on the plate. With the robot panel open, the strip comes to the front while Adjust is open (at 1366 × 768 Raise, Lower and Resize were hidden behind the panel); it does not move, so nothing under the pointer shifts. | `C.*` | `C1`–`C6` |
| **3. Where you grab decides whether a drag works** (Leo's hub) | The cause was the height handle: it sat on the middle of the part's top, so a grab there (and from the Top view the middle is where a child grabs) started a height change that was refused. The handle now floats clear above the part on screen; a part dragged by its middle or by a corner lands the same way. | `D.*` | `D1`–`D3` |
| **4. A click on top of the gate near the top of the view dropped a brick far behind it** (Noah) | A spot that is far from the build does not move the ghost, and a click there places nothing: *"Too far away. Zoom in to build there."* Rule below. A normal placement flashes yellow for about a second; one that lands out of view anyway (in the harness: aimed, zoomed in, walked off the screen with the arrow keys, Enter) brings up *"Your part landed far away."* with **Show me** (frames it and flashes it) and **Undo**. | `E.*` | `E1`–`E4` |
| **5. Wheel zoom barely moved** (Noah, Maya) | The wheel zooms by how far it turned: **4 notches double the distance** (was ~14), as many back return to 1.000×, and a trackpad swipe of 40 small events (400 px) zooms 2.0× (a fixed 5 % per event made it 7.8×). | `F.*` | `F1` |
| **6. A red preview with no reason** (Leo's wheel over an old plate) | While a ghost is red, one line above it says why in kid words — *"Something is in the way."* or *"That's off the plate."* — and the bricks in the way are outlined in red. A refused click, arrow, Raise/Lower or handle says the same in the status line and outlines them for a moment. (A robot part's own connector hint from the snapping lane wins when it has one.) | `G.*` | `G1`, `G2` |
| **2. "Looked right from the Top view"** | Seen from above (the Top view, or any view within ~25° of straight down) the ghost says what it sits on: *"On the plate"*, *"On the ground"*, *"On the hub"*, *"On a brick"*; a part held in the air (an axle or wheel off its mount) says *"In the air"* with a drop line and a shadow. | `H.*` | `H1`–`H3` |
| **Without the flag** | The studio's own quick start and its armed 2 × 4 brick; arrows keep the height (the part may hang in the air, as before), Page Up lifts one plate, a drag keeps the height, one wheel notch is the studio's 5 % (1.0526×), the old status words. | `I.*` | `I1`, `I2` |

No page errors (`Z.no-page-errors`).

## The rules, and why

**Parts sit on something** (`src/robotics/basics/support.ts`, `moves.ts`, `sceneSupport.ts`). A part (or a
rigid group, e.g. a whole robot) *settles*: every piece falls onto the highest top at or below its base
inside its own footprint, or the ground, and the group stops when its first piece lands. This is placing's
own rule (the ghost sits on the surface under the pointer) made to hold for every move:

- *Placing* and *dragging*: the surface under the pointer is the starting height, then the part settles
  (this also drops a part aimed at the side of a brick, which used to hang beside it). Dragging keeps the
  spot where the part was grabbed, measured on the grid at the part's base, so the grabbed corner stays
  under the pointer and where you grab never decides whether it fits.
- *Arrows*: slide one stud with a **step up of one plate** — a part pushed into a plate's edge climbs onto
  it, off an edge it drops, anything taller is "in the way" (with the brick outlined).
- *Raise/Lower and the height handle*: only heights where the part sits on something in its own column
  (the ground, or the top of a brick under it — e.g. a bridge). Leaving it in the air is never an option.
- Kept as the studio does it: a **kit in hand** (the kits lane stands it on the ground), a **lone axle or
  wheel** (held by what it connects to, not by what is under it — the snapping lane's gap markers cover
  those), and any **snapped** pose.

**No surprise far-away drops** (`src/robotics/basics/farDrop.ts`). Conservative by design; building on or
next to a build, anywhere after panning or zooming there, or on an empty plate the camera looks at never
trips it. A pointer spot is *far* when either:

- **A. deep and away** — more than **1.6×** as far from the camera as the orbit target (a part there is
  drawn at under 60 % of the build's scale) **and** more than **10 studs** outside the rectangle around the
  placed bricks and the orbit target; or
- **B. skimmed past a brick** — the pointer ray passes through a placed brick's box stretched **2 plates**
  above its top (and half a stud to its sides), i.e. it only just missed that brick, **and** lands more than
  **4 studs** outside that brick's footprint. Axles and wheels don't count (their grid boxes are much bigger
  than the rod or tyre a child sees).

On the Gate kit (`E1`): on the lintel's top the ghost sits on the gate; 4 px higher the ray lands about
6 studs behind the gate, only 1.18× as deep as the orbit target, so it is rule B that catches it — the ghost
stays on the gate, the line says to zoom in, a click there places nothing; past the plate the ray hits
nothing and a click at the top of the view places nothing either. Refusing (not clamping) keeps it
predictable: the ghost never jumps to where the child is not looking.

**Zoom** (`src/robotics/basics/wheelZoom.ts`). `factor = exp(k · pixels)`, `k = ln 2 / 400 px` (four 100 px
notches double the distance), lines = 33⅓ px, pages = 800 px, any one event capped at 250 px (a fast spin or
a synthetic 1500 px event moves ~1.5×, never across the world), trackpad pinch (ctrl + wheel) `k = 0.01`.
OrbitControls still does the zooming (toward the cursor, within its limits): only its `zoomSpeed` is set for
the one event and put back once the event has bubbled past it, so touch pinch is untouched.

**The quick start** (`src/robotics/basics/KidQuickStart.tsx`) keeps the studio's dismissal key and the
names of its close button and **Start building**, so every existing script dismisses it the same way.

## Harnesses that must stay green (all against the robotics dev server, final code)

| Harness | Result |
| --- | --- |
| `robotics-kid-basics.mjs` (this lane) | 58 / 58 |
| `robotics-spike-cp1-pointer.mjs` | 78 / 78 |
| `robotics-kid-snap.mjs` | 96 / 96 (to see the whole car at 1024 × 768 it now scrolls out 4 wheel notches, where it took 20 at `9f24b4d`) |
| `robotics-kid-kits.mjs` | 38 / 38 |
| `robotics-kid-guide.mjs` | 116 / 116 |

No expectation in those harnesses was changed.

## Unit tests (`src/robotics/basics/`, 42 tests; full suite 174 files, 1927 tests, all passing)

| File | What it pins down |
| --- | --- |
| `support.test.ts` | settling (single part, rigid group, one-plate step up), what is in the way / off the plate, the heights a part can sit at (a bridge), the handle's landing height, "On the plate" / "In the air", the kid words stay short |
| `moves.test.ts` | arrows off an edge and back, Leo's floating motor nudged left, into something taller, Raise/Lower refusals and hops, a whole robot moving as one, lone axle/wheel keep the studio nudge |
| `farDrop.test.ts` | on/beside the gate is never far; a ray that only just missed the lintel is; deep and away is; axles and wheels don't count |
| `wheelZoom.test.ts` | 4 notches = 2×, in and out cancel, lines/pages/huge events, a 40-event trackpad swipe = 2×, the OrbitControls step mapping, zoomSpeed set for one event and put back after the controls' listener |
| `kidBasics.store.test.ts` | the first brush with and without the flag; without the flag arrows keep the height and Raise lifts one plate (as before); with it arrows settle, Raise/Lower refuse or hop, a moving ghost settles, refusals name what is in the way; the scene helpers |
| `KidQuickStart.test.tsx` | the studio's guide unchanged without the flag; the kid quick start with it (three pictures, both vocabularies, Start building, Build a robot opening the drawer on Start with a kit, nothing in hand); a placement written to the guest project at once with the flag, after 400 ms without it |

## Files

- New, prototype only: `src/robotics/basics/` (`support.ts`, `moves.ts`, `farDrop.ts`, `wheelZoom.ts`,
  `sceneSupport.ts`, `basicsState.ts`, `drawerRequest.ts`, `KidQuickStart.tsx` + `kidQuickStart.css`,
  `BasicsLayer.tsx` (captions, outlines, drop line, flash; dev hooks `__robotics.basics/pick/camera`),
  `BasicsOverlay.tsx` + `basics.css`), `scripts/qa/robotics-kid-basics.mjs`, this folder.
- Shared files, each change local and commented: `src/brick/BrickStudioScene.tsx` (settling in
  `supportedDraftFromPoint`, the far-spot guard on hover and click, the drag landing in `GhostDragInput`, the
  wheel zoom and view publishing in `BuildCamera`, the lazy `BasicsLayer`, the bug fix in `BrickObject`),
  `src/brick/store.ts` (`initialBrush`, kid refusals in `placeDraft`, kid `nudge`, the Move toast),
  `src/brick/VerticalSelectionHandle.tsx` (the handle above the part, resting heights),
  `src/brick/OnboardingGuide.tsx` (the kid quick start), `src/brick/BrickStudioApp.tsx` (the drawer opens on
  Robots on request; the far notice mount), `src/brick/useBrickStudioDocuments.ts` (the prompt guest save).

## Sam's empty build after the simulator crash

How the guest project is written today: every change to the brick array restarts a **400 ms quiet-period
timer** (`connectBrickStudioAutosave`); the project is also written on `pagehide` and when the tab is hidden.
So a just-placed brick reaches `localStorage` about 400 ms later, and a crash or killed tab (no `pagehide`)
loses whatever is newer. Two gaps for the prototype: (1) a robot's own changes — its name, its cables —
change no brick, so they were only written with the next brick change or on `pagehide`; (2) the 400 ms.

Neither explains a *whole* build coming back empty: bricks placed minutes earlier had long been written.
The second iPad session's first screen is a blank build *with the quick start showing again*, which is what
`remote-ipad.mjs --fresh` produces (it clears all of `localStorage` before loading) — most likely the
session was restarted with `--fresh` after the crash. WebKit also writes `localStorage` to disk shortly
after the page does, so a crash of the whole simulator can still lose the last moment of work.

Changed (prototype only, `useBrickStudioDocuments.ts`): a placement or move is written **at once** (in the
same task, after the robotics layer has wired it), and robotics-only changes are saved like brick changes.
Unit test: with the flag a placed brick is in storage with no timer run; without it, only after 400 ms.

## Bug fixes (not behind the flag)

1. **A moving part targeted its own faded original** (`BrickStudioScene.tsx`, `BrickObject`): pointing at
   the part being moved put the ghost *on top of itself*, and placing it there left it floating one part
   higher — how Leo's motor ended up at Height 6. The touch drag already skipped the moving part; the mouse
   hover and the touch tap now do too (the event goes on to whatever is behind it).

That is the only change the unflagged studio sees. Everything else above is behind the flag (the command
strip rule applies only when the robot panel or card is on the page, i.e. with the flag).

## Not done / notes

- The height handle and Raise/Lower now only move between resting heights; lifting a part into the air to
  carry it over something is gone in the prototype (drag it instead).
- The out-of-view notice and the flash use the robotics layer's framing (`requestFrame`) for **Show me**.
- `src/robotics/kits/KitShelf.test.tsx`'s first test waits 1 s for the lazily loaded Robots chunk; on this
  (shared, heavily loaded) machine the button appears ~1.5–1.7 s after `render` starts in both `9f24b4d` and
  this branch (measured three times each), so that test can time out in a full parallel run on a busy machine.
  It passes alone and in the final full run (174 files, 1927 tests).
