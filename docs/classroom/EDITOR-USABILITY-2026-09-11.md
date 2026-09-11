# Editor usability release

## Resulting behavior

- Build camera can orbit upward toward taller structures; screen-space panning and cursor-centered zoom are enabled. Camera bounds keep the viewpoint above the baseplate. Explore can look upward, with its existing sphere-cast obstruction handling retained.
- Drag an already-selected brick to reposition the selection as a snapped group. Release places valid moves. Invalid drops remain previews for correction or cancellation. Escape cancels. Select-mode taps still toggle membership; modifier clicks and empty-space marquee remain available.
- Duplicate starts a movable copy preview at the original position. It does not create overlapping committed bricks or silently search sideways. Move to a valid location and place. Copy/Paste retains its previous valid-offset behavior.
- Group placement is one undo entry and one live command batch. An authoritative change to any original cancels an active move; unrelated peer changes preserve the preview. Resync and Explore transitions clear pending placement previews.
- A consistent responsive toolbar emphasizes world/save context, mode switching, collaboration, and world actions. Selection controls and quick-start instructions describe the new behavior.
- Create a Brick has a live, rotatable preview of the actual geometry. Dimensions, template, and studs update without registering temporary parts. Invalid intermediate input keeps the last valid preview with guidance. Smooth/full stud settings now reach the world renderer as well as the preview.

## Validation

- Node 22 full check: 759 frontend tests and 64 Worker tests, core/Worker type checks, and production build passed (823 tests total).
- Focused tests cover camera bounds and actual Rapier floor obstruction, group collision/undo/cancellation, unchanged snapped positions avoiding store notifications, preview form updates, custom geometry studs/cache isolation, and the client/store atomic multiplayer move boundary.
- Compiled local frontend against the production Worker passed real-pointer two-browser guest single/group drag, undo, duplicate positioning/placement, exact UI-exported document equality, and cold guest reload/rejoin. No browser page exceptions were observed in that flow. The disposable QA room was closed to new entrants.
- Further camera, preview, responsive, and hosted release evidence is recorded in the accompanying QA/release manifest once complete.

## Boundaries

- Frontend release; no Worker deployment, database migration, auth change, or real student data modification.
- Explore zoom remains character-centered. Build zoom follows the cursor.
- Rotate an assembled group after placing it; rotating a group during translation preview is intentionally disabled.
- Real school Chromebook and student testing remains necessary. Guest rooms remain temporary, and existing save/recovery limitations are unchanged.
- Previous production frontend: `dpl_6EivCt87xvNyiZUy1pP9gx6PrD5g`, source `3e4c886`. Retain the current production Worker when rolling back this frontend.
