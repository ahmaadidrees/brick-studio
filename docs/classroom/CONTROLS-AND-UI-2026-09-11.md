# Controls and Settings pass

## Intended behavior

Build uses distinct editing and camera gestures: left-click selects, Shift-click adds or removes, blank-space left-drag box-selects, and dragging selected bricks moves the group at its existing elevation. Right-drag orbits, Shift-right-drag pans, and Space-left-drag provides a trackpad alternative. Enter places an armed brick; Escape cancels. Camera gestures preserve selection.

Surface placement targets the pointed-at floor instead of the highest overlapping roof. Invalid headroom remains blocked instead of moving the preview upstairs. Decorative stud tops snap to the brick's nominal top plane.

Explore offers locally remembered Follow/Free look and three keyboard mappings. Manual camera input pauses automatic following. Follow suppresses automatic turning while strafing or moving backward to avoid camera-relative steering feedback. Free look retains the chosen camera angle while travelling with the character.

## UI scope

A single prominent Explore action becomes Back to building. The existing shared-world authority checks remain in that path; the redundant return button is removed. Settings is available from Build, Explore, and published viewing, with Camera/Keyboard, Motion & comfort, and Build controls sections. Settings affect the current device, not room documents. Scene and character customization remain a visible creative action. Frequent editing and collaboration actions remain directly available.

## Next focused header pass

Proposed layout: world title/menu plus save status on the left; People and Settings on the right; a separate mode action; compact editing toolbar for Undo/Redo, selection editing, and camera reset. Keep Scene/Character outside Settings.

Move rename, import/export, and world navigation into the title menu only after connecting explicit rename callbacks for local, saved-account, and live worlds. Reuse StudioMenu commands rather than duplicating behavior. Consolidating People requires the membership callbacks currently owned by LiveWorldHud. Moving the editing row needs a coordinated responsive pass through BuildShell and mobile overlays. These parent boundaries are intentionally deferred to avoid broadening this controls release.

## Verification

See CONTROLS-PASS-QA-2026-09-11.md for actual browser evidence. Production promotion and exact source identity are recorded in PRODUCTION-RELEASE.json after verification. Browser viewport emulation does not certify physical Chromebook or touch-device performance.
