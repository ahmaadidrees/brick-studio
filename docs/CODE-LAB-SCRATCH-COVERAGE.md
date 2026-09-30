# Scratch core coverage map

Source inspection · 2026-09-29 · Restored Code Lab · Proposed priorities, not implementation commitments.

Scratch references: [block definitions](https://github.com/scratchfoundation/scratch-blocks/tree/69dedae2033d02d7607451780e56b0c545003e8f/src/blocks) and [executing primitives](https://github.com/scratchfoundation/scratch-editor/tree/0a534750c47c7557622929816a10c54f61fcbe6f/packages/scratch-vm/src/blocks). Compare the current `src/platformer/lab/program/catalog.ts` with the compiler, runtime, evaluator, and editor. A similarly named block is not counted as verified parity.

**Related** means a current implementation can help, but semantics or authoring differ. **Missing** means no corresponding student block was found in the restored catalog. **Partial** means part of the family exists. No row claims full runtime parity with Scratch. Extensions (Pen, Music, hardware, video, etc.), cloud variables, project importing, and historical hidden opcodes are outside this core map.

## Motion

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| move steps | Missing; set/change speed instead | Instant displacement must be separate from continuous velocity; first projectile slice |
| turn clockwise/counterclockwise; point in direction; direction | Partial: face left/right/toward and turn around | Full direction and rotation convention; 90 right, 0 up; first slice needs direction |
| point towards mouse/sprite | Related: restricted facing targets | Full angle calculation and object selection; later |
| go to x/y; go to sprite/random/mouse | Related: `lab_move_xy`, `lab_move_to` | Lab teleports also stop velocity; target choices and origins differ; first slice needs sprite placement |
| change x; set x; change y; set y | Missing direct blocks after rollback | Positive-Y-up, center origin, no incidental velocity reset; introduce on isolated scripted objects |
| x position; y position | Related: `lab_position` | Lab uses horizontal center and bottom, positive Y down; versioned interpretation required |
| glide to x/y; glide to sprite/random/mouse | Missing | Time-based action with correct yielding/cancellation; later |
| if on edge, bounce; set rotation style | Missing | Define stage/world/camera edge and rotation's effect on hitboxes; later |

## Looks

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| say for seconds; say; think for seconds; think | Partial: timed fixed phrase or literal text | **Lab timed say advances immediately**; Scratch timed say waits. Dynamic text/reporters, persistent say, and think are missing |
| switch costume; next costume; costume number/name | Related: built-in costume plus custom frame blocks | Unify student-facing costume names/numbers without changing saved data; reporters absent |
| switch backdrop; next backdrop; backdrop number/name; switch backdrop and wait (Stage) | Missing | Define stage/world background ownership and events; later |
| change size; set size; size reporter | Partial: set size | Change and reporter absent; collision shape implications need clear semantics |
| change/set effect; clear graphic effects | Related: fixed color choices only | Color selection is not Scratch's effect system; later |
| show; hide | Related: explicit target show/hide | Scratch-style forms act on self; clone visibility inheritance needed first |
| go to front/back layer; go forward/backward layers | Missing | Define render-layer control independent of collisions; later |

## Sound

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| start sound; play sound until done | Partial: play fixed sound without waiting | Sound assets, completion events, waiting, cancellation; later coherent sound slice |
| stop all sounds | Missing | Scope across objects/project |
| change/set pitch or pan effect; clear effects | Missing | Audio model needed |
| change/set volume; volume reporter | Missing | Per-sprite volume and monitor behavior |

## Events

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| when green flag clicked | Related: when I appear | Lab combines initial start and new-instance initialization; separate project start and clone start |
| when key pressed | Related | Lab supports arrows, space, Z, X only. Re-entry is suppressed while its script runs; behavior needs comparison |
| when this sprite clicked; when stage clicked | Partial: object clicked | Stage/world event absent; hidden/cloned sprites and hit testing need defined behavior |
| when backdrop switches | Missing | Requires backdrop support |
| when loudness/timer greater than | Missing | Requires sensing and threshold event semantics |
| broadcast; when I receive | Related: named messages | Lab queues delivery next tick; scheduling and retrigger behavior need comparison |
| broadcast and wait | Missing | Must wait for the receiver threads triggered by this send; not a guessed fixed delay |

## Control

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| wait | Related | Lab quantizes to 60 Hz and at least one tick; verify zero/negative and scheduling behavior |
| repeat; forever | Related | Lab repeat floors/clamps count and can run all passes in one tick; forever yields each tick. Compare observable pacing |
| if; if/else | Related | Boolean input semantics and nested scheduling require parity tests |
| wait until | Related | Existing bounded polling; verify when condition changes |
| repeat until | Missing after rollback | General loop required, separately from rewriting player collision |
| stop all / this script / other scripts in sprite | Partial: stop this script only | Cancellation, scope, and effects need explicit semantics |
| create clone; when I start as a clone; delete this clone | Missing Scratch lifecycle; related make/remove brick | Lab spawns a fresh design instance with appear event. Scratch clones copy current sprite state and start clone scripts; first slice priority |

## Sensing

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| touching sprite/mouse/edge | Related: touching selected target, contact/probe helpers | Hitbox versus rendered-pixel semantics, hidden sprites, target choices, and edge meaning differ |
| touching color; color touching color | Missing | Renderer-level sensing; defer with explicit coverage tracking |
| distance to sprite/mouse | Related: distance to restricted target | **Lab distance is in 16-pixel bricks**, not stage coordinate units; normalize new standard form |
| ask and wait; answer | Missing | Student text values and prompt UI required |
| key pressed? | Related: key held | Limited key set; align naming and input behavior |
| mouse down?; mouse x; mouse y | Missing student reporters | Pointer coordinates must specify world versus screen space |
| set drag mode | Missing | Runtime sprite dragging is separate from editor placement |
| loudness | Missing | Microphone capability and permission flow; defer |
| timer; reset timer | Related: seconds since I appeared | Per-object age cannot substitute for resettable project timer |
| property of sprite/Stage | Partial: restricted position reporter | First slice needs Hero direction; other properties and variable lookup later |
| current date/time; days since 2000; username | Missing | External/non-deterministic values need a deliberate project contract; defer |

## Operators

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| add; subtract; multiply; divide | Related: one arithmetic block with dropdown | Number/text conversions differ; lab deliberately returns 0 on division by 0 |
| random | Related | Lab is seeded and integer-only; Scratch supports decimal ranges; decide reproducibility policy explicitly |
| less than; equal; greater than | Related: numeric comparison dropdown | Scratch text/number coercion needs a specified implementation |
| and; or; not | Related | Keep familiar forms and verify truth behavior |
| join; letter of; length; contains | Missing | String value support required |
| mod; round; math functions (abs, floor, ceiling, sqrt, trig, logs, powers) | Missing | Needed for open-ended math and movement; track all functions rather than adding invention-specific replacements |

## Variables and lists

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| variable reporter; set; change | Related: named numeric variables + older fixed memories | Numeric-only bounded values; no text. Scopes are my/player/world rather than Scratch's sprite/all-sprites model |
| show/hide variable | Partial: watch display + fixed memories shown above object | Student variable monitors need consistent toggling, labels, and editing; do not equate legacy memory display with full monitor support |
| list contents; add; delete item; delete all; insert; replace | Missing | Lists need storage, scoping, indexing, limits, cloning, and persistence |
| item; item number; length; contains | Missing | String/number comparison and index conventions |
| show/hide list | Missing | List monitor UI |

## My Blocks

| Scratch blocks / family | Current lab | Gap / proposed direction |
| --- | --- | --- |
| define; call; number/text inputs; Boolean inputs | Partial: named procedures, up to three numeric inputs | Parameter-shaped calls, text/Boolean values, identity-safe rename, and validation; open-definition navigation already exists |
| run without screen refresh option | Missing | Consider only with explicit execution budget and compatible loop behavior; do not expose an unbounded mode |

## Interaction gaps beyond the palette

- Standard click-to-run-stack and click-reporter-to-see-value behavior is not established by the current editor. Selecting a block currently serves authoring/definition navigation; verify an isolated editor prototype.
- Variables and procedure dialogs exist; they need to map to the selected language semantics rather than merely copying the words.
- Definition navigation currently scrolls to the definition; the design study compares keeping the caller visible with breadcrumb-focused navigation.
- Costume painting exists. Costume/frame naming, preview scale, hitbox changes, and animation playback deserve their own small pass.
- JavaScript and Python are printed read-only views. They are not alternate editable languages today.

## Highest-impact findings

1. Current programming is oriented around changing a physics body's speed. Scratch's direct sprite displacement is largely absent.
2. Familiar labels conceal semantic differences: timed speech, coordinates, distance units, loop pacing, event re-entry, random values, and spawning.
3. Strings, lists, clone lifecycle, general rotation, and broad sensing remain major creative gaps.
4. The existing custom-block machinery gives us a starting point for inspectable reusable behavior, but engine shortcuts cannot honestly be shown as editable definitions yet.

Use the [direction proposal](CODE-LAB-SCRATCH-DIRECTION.md) to choose a first coherent slice. Preserve legacy programs while implementing standard forms; do not globally change old opcodes to acquire new meanings.
