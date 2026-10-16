# Slice 1 student walkthrough

2026-10-15, local `/2d/lab/next` on port 5280. Separate origin from the previous port 5186 preview. Browser UI actions used the actual card, Blockly editor, palette and modal controls. Screenshots were captured during the integrated development pass; some precede the final compact toolbar polish.

1. **Start:** Ground is selected, Hero stays in place. Follow the Hero is the default when the real-level preview starts. [Ground first](01-ground-first.png).
2. **Slider scope:** Walker default changed 3→5 through All copies. Just this one changed the selected copy to 4, showing own value and Use the brick's value. Reset removed the override. Later changed a copy to 4 again, cold reloaded and observed 4 under Just this one. [Override](02-copy-slider.png), [cold reopen](02-copy-value-reopened.png). Runtime assertions separately prove inherited copies update while overridden copies retain their values.
3. **See inside:** Code docks beside the actual level; palette opens/closes and keyboard resizing works. Execution-highlighted DOM nodes were present while running; Pause cleared them to zero. [Code beside world](03-code-beside-world.png).
4. **Value versus structure:** In turn around, changed numeric 0→1; name remained Walker. Dragged a say block from Looks into the workspace: name became My Walker, both copies retained their definition ID, remix badge/toast appeared. The intentionally disconnected block correctly produced a diagnostic. Restart ran a new world. [Number edit](04-number-edit-no-remix.png), [structural edit](04-structural-edit-remix.png). A regression additionally proves Restart before the 300ms editor debounce executes the latest blocks.
5. **Restore:** Brick actions → Back to the original → confirm restored Walker and default speed 3. [Restored](05-restored-original.png). Same-ID editor reset and stale-save guards have dedicated tests.
6. **Hero:** Sliders open first with four primary values and collapsed additional sliders. Code opens folded with four grouped calls; jump drill-in and the Back breadcrumb work. Done returns to Sliders. [Sliders](06-hero-sliders.png), [folded code](06-hero-folded.png), [jump drill-in](06-hero-drill-in.png).
7. **Make:** + New brick → Empty → picked Cake (existing names disabled). Workshop opened on a flag hat with Drag blocks under this hat. Done selected Cake as the brush; My bricks filter listed it. [Empty hat](07-empty-brick-hat.png), [My bricks](07-my-bricks.png). Cake remains as a harmless local preview example, unplaced.
8. **Small screen:** At a narrower-than-768px viewport, the card retained Sliders/Look and disabled See inside with Code needs a bigger screen. [Small screen](08-small-screen.png). Temporary desktop viewport override was reset after checks.

## Boundaries

No real device/4x CPU performance measurement, classroom multiplayer, cloud/account saving or production release was attempted. Those are not established by this walkthrough. Hero movement tolerances remain covered by the existing feel suite; longer hands-on feel/keyboard playtest is left to the owner.
