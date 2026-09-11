# Editor usability browser QA — September 11, 2026

Independent Playwright browser checks used actual mouse/pointer and keyboard events against compiled preview `http://127.0.0.1:5198/` and hosted candidate `https://virtual-legos-e05efvw2m-ahmaadidrees-projects.vercel.app` (source `0db2545`). No store actions were invoked to simulate editor gestures.

## Verified interaction and multiplayer

Two isolated browser contexts created a new temporary guest room against the production multiplayer Worker. The room was closed to new members after testing. No student data was used.

1. Two canvas clicks in Top view created two separated bricks.
2. Clicking to select, then dragging the already-selected brick moved only that brick.
3. One Undo returned both clients to the exact baseline document.
4. Shift-click selected both bricks; dragging a selected member translated the group by identical snapped deltas.
5. One Undo returned the entire group to its exact baseline.
6. Duplicate started a pending preview and did not change the authoritative document.
7. Actual pointer movement followed by Enter placed the copied group with preserved relative offsets.
8. Guest browser reload and rejoin recovered the exact same full exported document.

Both clients' full exported JSON documents matched after every step. The hosted run produced zero page exceptions. Local and hosted runs both passed. Harness: `/tmp/brick-editor-two-client.mjs`; hosted evidence: `/tmp/brick-editor-final-hosted-report.json`; screenshot: `/tmp/brick-editor-live-final.png`. Reports omit owner URLs and invite fragments.

Additional final compiled solo checks: Escape while the mouse was held during a drag preserved the exact full document; releasing and selecting again worked. In explicit Select mode, clicking an already-selected brick deselected it as intended. Duplicate followed by Enter while still overlapping was rejected with the exact original document preserved; Escape canceled the preview without changing the document.

## Responsive toolbar

1280×800 desktop toolbar visually inspected. At 375×812, document width remained 375 pixels, but the first candidate's mobile camera/select controls were occluded by the new two-row toolbar. `elementFromPoint` at Frame Build, Top, and Select centers returned the toolbar header. Corrected before release. Rebuilt-candidate retest passed actual clicks on Frame Build, Top, and Select (which changed to Done). More actions opened without intersecting camera/select controls; Export was visible. Screenshots: `/tmp/brick-editor-toolbar-mobile-fixed.png`, `/tmp/brick-editor-toolbar-mobile-menu.png`.

## Scope limits

Camera and live custom-brick preview browser checks are owned by their separate implementation/QA lanes. This report does not claim physical touch-device or school-Chromebook testing. Touch/pen group-preview dragging and invalid placement beyond the board were not independently exercised here.

## Final color follow-up

Source `956c037` at https://virtual-legos-a0borkbbo-ahmaadidrees-projects.vercel.app passed the eight-step two-browser sequence again, additionally selecting a different color during duplicate preview and placing via the visible Place button. Both copies had the selected color and both originals remained byte-for-byte unchanged; guest cold reload/rejoin exports matched. No page exceptions. Final evidence: `/tmp/brick-editor-release-hosted-report.json`. Enter while a color button retains keyboard focus activates that button; the explicit Place button was used after selecting color.

The final build and targeted store/live-client checks passed after removing a duplicate color-property declaration caught by TypeScript in intermediate source `032a209`. That failed build was never promoted.

## Public cutover

Promoted final `956c037` deployment `dpl_jmdRVrE3xhxPJHPJGmMwKFE3EvYR` after GitHub CI34629308382 passed. Re-inspected public alias resolves to that deployment. Fresh signed-out public browser verified the new toolbar, actual preview dimension updates, mobile Frame Build/Top clicks, and guest collaboration entry; zero page exceptions. Authoritative Worker GET document exactly matched the final cold-rejoin UI export (four bricks, revision seven). Vercel error/fatal query found no entries in the sampled fifteen-minute window; static hosting logs do not certify browser or Worker health.
