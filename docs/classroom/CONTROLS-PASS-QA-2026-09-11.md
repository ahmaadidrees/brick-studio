# Controls pass browser QA — 2026-09-11

Status: exact final candidate browser verification complete; see final section. Production promotion/public alias verification is owned by the release coordinator.

## Candidate and fixtures

Final candidate source `904d31207eca604e83e6e9c0eb5e4f10ccef36a5`; immutable URL recorded below.

The isolated browser harness uses two fresh Chrome contexts, real pointer and keyboard events, file-input import, and menu-driven JSON downloads. It records page exceptions and received multiplayer frames. It does not call application store actions to manufacture UI success.

Roof fixture: a 6 × 8 floor at plate 0, four corner pillars from plate 1 to 10, roof at plate 10, and two separated loose bricks for group selection. A second elevated fixture raises floor/pillars/roof by 30 plates (floor 30, roof 40, expected interior placement 31). The open sides allow an actual camera ray to target the interior floor beneath the roof. The fixture is imported through the normal file chooser.

## Required checks

- Selection via click, Shift-click, and empty-space marquee.
- Right-drag orbit and Shift-right-drag pan preserve selection and leave document content unchanged, including gestures crossing selected bricks.
- Drag a selected group, verify rigid relative offsets, undo once, and compare both clients' exported documents with authoritative room updates.
- Place a brick on the interior floor beneath a roof; exported elevation must remain at the floor height rather than roof height.
- Place on the roof intentionally; reject a brick taller than the interior clearance without a silent elevation jump.
- Explore Follow and Free look; switching preserves initial view and manual orbit pauses automatic follow.
- Standard, arrow-camera, and WASD-camera mappings: camera keys rotate without simultaneously moving the character; movement keys still move.
- Persist preferences across cold reload; visible keyboard hints follow active mapping.
- Keyboard camera controls do not trigger while typing in an input.

## Results

Initial compiled candidate at http://127.0.0.1:5198 (entry asset `index-D_tWu-R5.js`) passed the following UI checks before a coordinated rebuild for final Settings/header integration:

- Elevated interior: same real cursor position as the production before-case shows Y31; clicking and exporting creates the ninth brick at x31,y31,z34, below roof40.
- Click + Shift-click selects the two loose bricks. Real left drag moves both +4 X with unchanged relative offsets and elevation; a single UI Undo restores both.
- Right-drag starting on a selected brick and Shift-right-drag pan retain the two-brick selection and leave exported JSON exactly unchanged.
- Explore arrow-camera + Free look exposes matching movement hints and rotates the rendered view on an actual held arrow key. Full mapping/room verification awaits final candidate.
- Initial guest-room attempt could not reach service because another validation build had replaced dist with a localhost backend configuration. Root identified and is rebuilding with explicit backend URLs; this is not a controls failure.

Before-case reproduced on public production using only an isolated local guest browser: import elevated fixture, select 1 × 1 Brick, aim at visible interior floor. Inspector reports Y41, confirming roof-height snapping instead of intended Y31. Fixture import followed by menu Export preserves the exact eight fixture bricks.

Real school Chromebook performance and physical touch-device behavior remain separate checks; desktop browser emulation is not device certification.

### Integrated local candidate (`index-H01NqEVo.js`)

- Two isolated Chrome contexts joined a QA-only guest room using the production Worker. Elevated interior click created a brick at `(31,31,34)`; both menu exports matched exactly.
- Actual group drag moved both loose bricks +4 X, preserving their relative offsets and Y0. Both exports converged. One Undo restored the exact pre-drag document on both clients. Received server `apply` revisions 1–3 covered these mutations.
- Marquee cancellation: began a rectangle with prior two-brick selection, pressed Escape while holding the pointer, waited 400ms, released over a brick. Prior selection remained. Subsequent orbit/pan worked, retained two selected, and left exported document unchanged.
- Custom 1 × 1 × 12-plate brick targeted at floor31 remains blocked beneath roof40; real click leaves exported document unchanged. Intentional roof placement creates a 1 × 1 brick at Y41.
- Peer cold reload followed by normal Join returns the exact same ten-brick exported document. No page exceptions recorded.
- Explore core key mapping works after clicking blank header to blur a focused button: Arrow-camera produces visible orbit with ~0 positional drift; WASD still moves ~1.43 units. WASD-camera produces visible orbit with ~0.012 residual drift from prior motion; arrows move ~1.34 units. Standard arrows and WASD both move (~1.40 and ~1.44 units).
- **Blocker found:** closing Settings restores focus to its trigger; clicking the canvas does not remove button focus. The new keyboard guard blocks buttons, making subsequent camera/movement keys inert. Reported to Explore worker and root for correction; final candidate must verify canvas focus handoff. The core mapping results above used a genuine UI workaround, not app state mutation.

Screenshots are temporary artifacts under `/tmp/mapping-*-before.png` and `/tmp/mapping-*-after.png`; the image pair for WASD-camera visibly changes view while retaining the same character location.

### Final logic candidate and hosted verification

Source `d5fb8f9`, final local entry asset `index-B2cRE6En.js`, hosted candidate `https://virtual-legos-cqobjerc2-ahmaadidrees-projects.vercel.app`.

- Focus blocker corrected and browser-verified: Settings → Done → viewport click focuses the Explore region; actual W input moves 1.66 units locally and 1.64 units hosted as observed by the peer's received authoritative pose stream.
- Settings modal Delete, 2, and Cmd-Z leave the modal open, Build mode unchanged, and exported document exactly unchanged. Preferences also do not modify the shared document.
- Build Space-drag after selecting leaves document content unchanged. Low room placement additionally verified at Y1 beneath roof10 using a real click and file export.
- Hosted fresh guest room and two isolated browsers: interior placement Y31; selected group drag +4 X; one Undo exact restoration; owner and peer exports match after each change.
- Authoritative Worker `GET /worlds/{qa-room-id}` at revision3 exactly matches both UI exports. Peer cold reload → Join yields that exact same document.
- Owner Explore action changes shared room mode correctly. Settings preferences Free look + arrow-camera survive owner cold reload and normal Rejoin as owner. No page exceptions recorded.
- Root is independently covering responsive hosted widths. A final CSS-only follow-up may supersede this immutable candidate; it requires a short final hosted smoke and root responsive recheck.

Native confirmation handling and explicit waiting for the rejoin form were required in the harness. An initial too-early rejoin check timed out; waiting for the actual form and clicking Rejoin completed successfully. This was harness timing, not an application failure.

### Exact final candidate smoke

Source `904d31207eca604e83e6e9c0eb5e4f10ccef36a5`, immutable frontend `https://virtual-legos-his7ggwvi-ahmaadidrees-projects.vercel.app`, deployment `dpl_Bg2n5ga6s6yw6jRY9b3yRSZHqi6z`.

Fresh guest room with two isolated contexts passes actual interior placement at Y31. Owner UI export, peer UI export, and authoritative Worker GET document are exactly equal at revision1. Owner switches to Explore, selects WASD-camera through Settings, closes Settings, clicks viewport, and ArrowDown moves 1.33 units in the peer's received pose stream. No page exceptions recorded. The final QA room was closed to new people through the owner UI and authoritative GET confirms `locked: true`; the previous hosted QA room was also closed through its owner UI.

Status: requested logic checks and exact final candidate smoke passed; root owns final CI/promotion/public-alias verification and responsive layout evidence. No remaining QA blocker identified. Actual student Chromebook and physical touch-device rehearsal remains outside this desktop Chrome verification.

### Promotion and responsive verification

Root verified Settings and mode controls in actual Chrome at 1366×768, 1024×768, 375×667, and 320×568 across the candidate sequence. The final candidate fixes the 1024px collaboration visibility and excessively wrapped hints. Mobile Settings scrolls through Motion and Build sections with its Done button always reachable. Compact collaboration opens the guest room form directly.

CI run 34648317379 passed for exact source 904d312: 788 frontend tests, 65 Worker tests, types and production build. Root promoted deployment dpl_Bg2n5ga6s6yw6jRY9b3yRSZHqi6z and re-inspected the public alias to that exact deployment. A fresh signed-out public browser opened Settings, imported the fixture, entered Explore, changed keyboard mapping, and returned keyboard focus to the viewport without page exceptions. The sampled Vercel error/fatal log query returned no entries; this is not a substitute for Worker/browser verification above.
