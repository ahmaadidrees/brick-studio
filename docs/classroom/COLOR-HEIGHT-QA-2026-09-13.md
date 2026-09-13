# Custom color and vertical selection movement QA — 2026-09-13

Status: local and exact hosted candidate checks passed; final evidence below.

## Method

Two isolated Chrome contexts use real file import, pointer/keyboard inputs, menu-driven JSON downloads, and received multiplayer messages. No app store action calls are used to claim UI success. Simple fixture has two 2 × 2 bricks at X29, Z30/Z34, Y0. Ceiling fixture adds a 6 × 8 plate at Y12 above both targets.

## Required verification

- Custom hex/wheel draft does not mutate build until Apply. Apply changes the selected group in one operation; one Undo restores colors. Cancel leaves document untouched.
- Vertical handle drag keeps X/Z fixed and snaps to plate heights. Group relative offsets remain fixed; one Undo restores the group.
- Escape/cancel does not commit. Raising into the ceiling gives blocked feedback and preserves the original document on invalid release.
- Two clients export the exact same document after committed edits and Undo, matching the authoritative Worker GET; cold reload/rejoin returns that document.
- Mobile color dialog and selection height handle remain accessible and usable. Desktop emulation is not physical-device certification.

## Results

Initial compiled candidate asset `index-TNm6ETVk.js`; final local cancellation asset `index-HiAADFZi.js`.

### Initial compiled candidate — local 5201

- Solo actual UI: selected two bricks; hex `#12abef` + Cancel left exported JSON exactly unchanged. Apply colored both bricks; one Undo restored the exact initial document.
- Solo height: actual 80px upward handle drag moved both bricks to Y2 with fixed X29/Z30/Z34. One Undo exactly restored both. Escape during a 100px drag followed by release left the document unchanged.
- Multiplayer ceiling fixture: color `#ad45e8` Apply changed only the two selected targets; owner/peer exports matched. One Undo restored exact original document on both clients.
- Actual 80px group-height drag moved both targets to Y4, ceiling stayed Y12, X/Z fixed. Peer export matched. One Undo restored originals.
- Invalid raise: 200px upward drag showed `Height +10` and red handle border (`rgb(193,61,61)`); release automatically restored originals. Owner and peer exports matched authoritative Worker GET at revision4 exactly. Peer cold reload → Join returned the same document. No page exceptions.
- Mobile touch emulation at390×844: actual touchscreen tap selected one brick, then CDP `Input.dispatchTouchEvent` start/move/end on the 44px handle moved only that brick to Y9 with X/Z fixed. Verified via menu Export. This uses browser touch input, not application state mutation; it is not physical-device certification.

Resize/orientation cancellation was included in the final candidate verified below.

### Exact final candidate

Source `8150db4`; immutable frontend `https://virtual-legos-op2qck2xy-ahmaadidrees-projects.vercel.app`.

- Final local resize cancellation passed: resize event during an active height drag followed by release left the exported document unchanged. The harness waits for browser resize delivery; an immediate release before resize delivery naturally precedes cancellation.
- Hosted two-context guest room: editing hex `#f274ad` while the dialog remained open left the peer document unchanged. Apply changed both selected bricks to that color; peer export matched; one Undo exactly restored the starting document.
- Hosted actual 80px vertical group drag moved both to Y2 with fixed X29 and Z30/Z34. Peer export matched; one Undo exactly restored the starting document.
- Authoritative Worker GET at revision4 exactly matched the final UI document. Peer cold reload → Join returned the exact same document. No page exceptions.
- Both local and hosted QA rooms were closed to new people through owner UI; authoritative GET confirmed locked. All isolated QA browser contexts closed.
- Root independently verified hosted color dialog at375×667 and320×568, including Apply, actual custom swatch, and no overflow. Root owns CI/promotion/public-alias confirmation.

Result: no remaining blocker found. Physical touch-device and student Chromebook testing remain separate from Chrome emulation.

### Production release

Promoted deployment `dpl_4WCw3aXeLDmie11jVXDswyd1MA92`; public alias inspection confirms the exact candidate. CI run34788153753 passed (798 frontend +65 Worker tests; types/build). Fresh signed-out public browser applied `#19c8a1`, verified the resulting swatch, and recorded zero exceptions. Vercel error/fatal sample returned no logs; this is supplementary to browser and authoritative data checks.
