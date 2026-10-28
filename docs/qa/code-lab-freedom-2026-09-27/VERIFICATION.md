# Code Lab creative freedom verification

Implementation branch: `codex/code-lab-freedom`, based on `30afd24`.
Scope: isolated solo `/2d/lab`; no deployment or ordinary 2D/room integration.

## Automated evidence

- Final `npx vitest run src/platformer/lab --maxWorkers=1 --testTimeout=15000`: **71/71**, 9 files.
- Final `npm run build`: passed (TypeScript plus production Vite build).
- `git diff --check`: passed.
- Environment: Node 26.8.2; project declares Node 22.x. This is not a Node 22 certification.
- Build reports large chunk warnings, including Blockly's lab bundle; no bundle optimization claim.

Coverage includes original recipes, named state scopes, nested calls through waits and serialized-world recovery,
recursion bounds, broadcast order and queue limits, world-controller protection, procedure live edits (body,
signature, active call inputs), exact custom names in text views, scoped design copies, document save/load,
Blockly palette round trips, and flushing edits before copying a design.

## Independently observed browser behavior

Chrome on the local dev build:

- Opened the reusable patrol recipe, edited its numeric input with the real Blockly field, and chose
  **Make just this one different**. The new design contained that edit.
- Reloaded the page and reopened the new design: the numeric edit and procedure definition survived.
- Changed the running patrol input from 3 to 2 after the runtime fix; the live speed changed to 2 without restart.
- Opened integrated help and checked its variables, reusable blocks, messages, and coordinates guidance.
- Created the signal example: Z changed the world's signal to 1 and the car's horizontal speed to 3;
  X changed them back to 0. Afterwards normal gravity replaced the example's zero gravity to avoid indefinite
  upward motion after a spring. That final example change passed the full automated suite; its spring interaction
  was not re-rehearsed in the browser.

Codex in-app browser on the final production build at `http://127.0.0.1:5192/2d/lab`:

- Loaded the lab, opened the eight-recipe menu, and ran the reusable patrol.
- Confirmed the custom call, editable definition, live speed, and instance-copy control render together.
- Screenshot: [patrol-preview.png](./patrol-preview.png).

## Remaining product validation

Student/teacher comprehension, Chromebook performance, iPad/touch gameplay, account persistence, multiplayer,
cross-device recovery, and production deployment remain outside this local milestone. Saved projects remain
browser-local; JavaScript and Python panes remain read-only representations.
