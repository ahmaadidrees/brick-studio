# Scratch-familiar Brickgineers: design proposal

Draft for discussion · 2026-09-29 · No game/runtime changes in this pass.

## Product promise

Start with a working game. Open any gameplay behavior, understand the instructions that produce it, change them, and reuse the invention. Blocks are the first authoring language. Future JavaScript/Python authoring should operate on the same supported program model; arbitrary language execution and lossless conversion are not promised.

The existing Code / Costumes / Sounds layout and stage stay the foundation. This proposal focuses on vocabulary, semantics, and opening behavior definitions. It does not require another editor redesign.

## Three depths in one project

- **Use:** place a working character or object from a library.
- **Inspect:** follow a custom-block call to the actual editable definition that runs.
- **Invent:** assemble the same general blocks, create definitions, and remix objects.

These are actions, not beginner/intermediate/advanced modes. Different objects can be understood at different depths. An inspector must never show an illustrative program while a separate hidden implementation actually produces the behavior. A native engine service must be labeled as such until a behaviorally equivalent editable implementation exists.

## Language direction

Use Scratch's core vocabulary, block shapes, inputs, category order, and meanings as the reference. Familiar labels require familiar behavior. Keep explicit Brickgineers capabilities in a separate category. Track every core family in [the coverage map](CODE-LAB-SCRATCH-COVERAGE.md), including deferred ones, so omissions are deliberate.

Reusable gameplay helpers such as `throw ball`, `patrol`, and eventually `handle jumping` should be library custom blocks/programs. A student must be able to inspect them and assemble the same behavior independently. Engine services such as drawing, key delivery, collision queries, scheduling, resource limits, and networking remain implementation primitives. Students should be able to write responses to those services and, in a deliberately selected experiment, their own motion/collision rules.

Ordinary sprite-relative motion acts on the current sprite. Cross-object inspection uses explicit reporters; communication uses messages. Existing `me` / `it` / `them` operations remain supported for old programs rather than being silently relabeled as Scratch equivalents.

## First teaching example: throw a ball

The design study deliberately uses a small, straight-moving projectile. It demonstrates object ownership, custom blocks, cloning, sequencing, loops, and numbers. It does not attempt gravity, bounce, targeting, damage, or the existing platformer collision system.

**My moves / Hero**

```text
when [z] key pressed
  throw ball

define throw ball
  create clone of [Ball]
```

**Ball** (the original is a hidden reusable sprite)

```text
when green flag clicked
  hide

when I start as a clone
  go to [Hero]
  point in direction ([direction] of [Hero])
  show
  repeat (20)
    move (8) steps
    wait (0.03) seconds
  delete this clone
```

The custom block belongs to Hero. Ball's motion belongs to Ball. Opening the clone target should offer a direct route to Ball's code and a breadcrumb back to the caller. It must not imply that custom blocks can directly call another sprite's procedure. The small wrapper is optional: a student can place `create clone of [Ball]` directly under the key event.

Teaching prompt: predict what changes when `8` becomes `12`, run it, then compare. Keeping the repetition count fixed makes the ball move farther as well as faster. Changing repetition count changes distance and lifetime. Changing the wait changes pacing, not the number of moves. Clones take a snapshot of direction at creation for this example; later movement of Hero must not steer an already-fired ball.

A later curved throw can expose local `xSpeed` and `ySpeed` variables, `change ySpeed by gravity`, and position updates. Collision and one-way-platform semantics need a separate design contract before that experiment.

### Two navigation sketches

1. **Definition beside code:** opening `throw ball` reveals its definition below the call in the same code surface. The caller remains visible. This is the recommended first sketch because it preserves context and fits the existing workspace.
2. **Follow the code:** opening the call focuses the definition with a breadcrumb back to My moves. It is more compact for larger programs, but introduces more navigation.

Both expose the same program, and both lead from `create clone of Ball` to Ball's code. The interaction study is an illustrative local preview, not the real Blockly editor, a complete Scratch interpreter, or evidence of runtime compatibility. Its editable step number and finite throw animation are implemented for the design comparison; dragging/rearranging arbitrary blocks and game saving are outside its scope.

## Decisions before implementation

| Decision | Proposed starting point | Why it matters |
| --- | --- | --- |
| Scope of familiarity | Core Scratch language as a tracked roadmap; implement a coherent teaching slice first | A larger palette alone cannot establish transferable behavior |
| Abstraction | Library custom blocks with real editable definitions | Students can use and inspect the same program |
| First object | An isolated Ball, alongside the existing player | A small test can preserve working platformer controls |
| Motion ownership | Explicit per-object choice of built-in physics or student position scripts | Two movement systems must not move the same object independently |
| Coordinates | New Scratch-style objects use center-based, positive-Y-up coordinates with a defined world origin | Existing bottom-based, positive-Y-down documents need versioned interpretation |
| Scrolling world | Separate world coordinates from camera/screen position; define the meaning of edge before adding edge blocks | A camera edge is not automatically a world boundary |
| Clone identity | Clone a sprite's current state with clone-local variables and a clone-start event | Creating a fresh brick design instance has different semantics |
| Existing documents | Preserve legacy identifiers and meanings; explicit conversion only after rehearsal | Renaming blocks cannot silently migrate motion and data |
| Future languages | Defer editable text languages; retain explicit read-only labels today | The current printed views are not general JavaScript/Python authoring |

Clone state, inherited visibility/costume/variables, initialization ordering, concurrent shots, clone limits, and cleanup must all be specified. In the first implementation, the original Ball has built-in physics disabled; its clones inherit that setting, so only the student's position instructions move them. This is an explicit object property, not an invisible heuristic.

## Evaluate the editor separately from the language

The existing editor uses Blockly with custom `lab_*` definitions and its own compiler/runtime. Official Scratch Blocks supplies Scratch's editing surface; the Scratch VM provides program execution. Swapping editors does not implement missing runtime semantics.

The earlier [compatibility spike](SCRATCH-BLOCKS-SPIKE.md) is historical evidence of a package/runtime mismatch, not a current adoption decision. Once the navigation sketch is chosen, compare the current editor and official Scratch Blocks in a disposable, isolated surface with the same tiny project. Assess block geometry, snapping, named procedure inputs, click-to-run, definition navigation, accessibility, and save/reopen. Recheck package versions then. Do not couple that decision to rewriting player physics.

## Suggested implementation sequence after design review

1. Save an explicit baseline checkpoint of the accepted work and record existing game behavior. The current worktree contains earlier uncommitted work; do not treat HEAD as the accepted authoring baseline.
2. Choose the definition-navigation interaction using the attached design study. Complete the missing semantic decisions in the coverage map.
3. Run the isolated editor comparison with a representative custom block. Choose a single editor/runtime integration strategy.
4. Implement the smallest coherent projectile slice: clone lifecycle, sprite position/direction, finite loop and wait, and opening the running definition. Do not replace the player controller. Keep unsupported blocks out of the active palette until they execute correctly.
5. Rehearse the teacher journey in the browser: find the call, open its definition, follow Ball, change 8 to 12, predict/run, save/reopen. Test two simultaneous shots and clone cleanup.
6. Rehearse the original game: variable-height jumping, forgiving jump timing, one-way/moving platforms, springs, hazards, enemies, native animation, and existing recipes. Compare against the recorded baseline before integrating.
7. Expand core coverage in teaching-sized groups, then separately explore an inspectable player movement program with behavior parity tests.

## Acceptance for the first real slice

- Opening a custom block reaches its actual executing body; edits affect the behavior observed.
- A familiar Scratch example can be constructed without a new invention-specific engine opcode.
- Standard motion, cloning, and waiting mean what the lesson says; legacy blocks retain their old meaning.
- Ball uses explicit scripted motion while Hero keeps existing controls; the original game's movement does not change.
- A clone's local values are isolated. Repeated throws do not multiply recursively. Clones are deleted and bounded.
- Readable errors point to the responsible block. A script cannot freeze the app.
- Changed code survives browser-local save/reopen. Cloud/classroom/multiplayer/device behavior is a separate validation scope.

## Source and evidence boundary

This is a source comparison and design proposal, not a new game runtime verification. Current lab files were read on 2026-09-29. Scratch reference snapshots: `scratch-blocks` develop `69dedae2033d02d7607451780e56b0c545003e8f`; `scratch-editor` develop `0a534750c47c7557622929816a10c54f61fcbe6f`.

- [Scratch Blocks](https://github.com/scratchfoundation/scratch-blocks): editor and core block definitions.
- [Scratch editor packages](https://github.com/scratchfoundation/scratch-editor): VM, rendering, GUI, and paint are separate modules.
- [Scratch My Blocks materials](https://www.scratchfoundation.org/learn/learning-library/my-blocks-custom-blocks): custom blocks and parameters.
- [Scratch clone startup](https://scratch.mit.edu/help/studio/tips/blocks/clone-startup/): separate clone-start event.
- Local evidence: `src/platformer/lab/program/catalog.ts`, `program/types.ts`, `runtime/runtime.ts`, `runtime/evaluate.ts`, `sim/physics.ts`, `ui/CodePanel.tsx`, `bricks/builtins.ts`.

## Design-study checks

Checked in the in-app browser on 2026-09-29: both navigation variants reveal the definition; the clone target opens Ball's code; editing the step value changes the finite throw from 160 to 240 steps; the clone disappears after the run. Inspected at 736-pixel and 320-pixel content widths; the narrow layout has no measured horizontal overflow. No browser console errors were recorded. JavaScript syntax and repository whitespace checks pass. These checks apply to the illustrative study only. No application source, dependency, saved game, or runtime behavior was changed by this design pass.
