# Hackable group C, checks lane (2026-11-01)

Branch `claude/hackable-c-checks`, from main `b0d43fe`. Not pushed and not deployed.

Three safety checks on what the Hackable Platformer accepts from outside (project files, power files, the class
shelf). They protect kids whatever writes those files: classmates now, maybe a helper later.

| Item | Status |
| --- | --- |
| 1. Unknown blocks must not silently do nothing | Done |
| 2. Pictures and sounds only from data, never a web address or SVG | Done |
| 3. The class shelf checks the whole power | Done; the Worker checks block types too |

## 1. Unknown blocks

**Known blocks:** `core/editor/knownBlocks.ts` is a plain list of every block type this version can open and run:
- the editor's blocks (`createBlockDefinitions`);
- the shareable-procedures blocks kept so old saves load;
- the literal blocks the compiler reads;
- every runtime opcode (`ALL_PRIMITIVES`, the runtime's control blocks, the hats).

It has no imports, so the Worker can use it. `knownBlocks.test.ts` rebuilds it from what is registered and fails if
it falls behind. It also checks that every palette block is known, and that Blockly blocks Brickgineers can't run
(`controls_if`, `logic_compare`…) are not. `definitions.ts` is untouched.

**Compile:** a block not on the list gets the diagnostic "This block isn’t part of Brickgineers, so it can’t run."
(code `block.unknown`, on that block). The editor already shows it, through the fallback in `DiagnosticsList`
("Block needs attention"). That file belongs to another lane, so I didn't add a title there.

The compiled program is unchanged, so a project holding such a block plays exactly as before. Removed blocks
(`platformer_touchingtile`) keep their own message. An unknown block on its own is reported as unknown instead of
"not connected".

**Opening a project:** `persist/openChecks.ts` counts unknown blocks in both the workspaces and the compiled programs.
Each block is counted once, by its id. The kid then reads "One block in this project isn’t part of Brickgineers, so
it can’t run." (or "# blocks…"). The blocks are kept.

Where it is said:
- opening a file: on the "Opened …" notice;
- this computer (`loadProject`) and the account (`projectFromText`): on the notice bar.

**Powers:** a power with an unknown block anywhere (inputs, shadows, `next`, My Block bodies) is refused: "That power
uses blocks that aren’t part of Brickgineers, so it can’t snap on." It is checked:
- when a file is opened (`readPowerFile`);
- when fetched from the shelf (`readPowerPayload`; it isn't counted as used);
- again in `store.snapPower`, which covers My powers and built-ins.

A kept My power that now fails is hidden from the list. It is still written back when another power is kept or
forgotten, so it is never thrown away.

## 2. Picture and sound sources

**What the app really uses:**
- built-in art and the costume editor make PNG data URLs (`pixels.ts`);
- the sound library makes WAV data URLs.

No same-origin asset paths are used anywhere, so none are allowed.

**Rule** (`core/contentRules.ts`, enforced by `validateDesign`):
- costumes: `data:image/(png|jpeg|webp|gif);base64,…`. No SVG.
- sounds: `data:audio/<type>;base64,…`.
- Both are capped at 200,000 characters, the existing `DESIGN_LIMITS.maxAssetChars`. That limit now comes from
  `MAX_ASSET_CHARS`. The save lane's 5 MB save limit is unchanged.

**Repair (`persist/repairSave.ts`), when a save breaks the rule:**
- **A bad picture** becomes a gray checked PNG of the same size. Name, size, center, opaque box and mask are all kept,
  so the brick stands, bumps and lands the same. If the picture is too big to make, it is left out. Other costumes
  are untouched.
- **A bad sound** keeps its name and length but goes quiet.
- **The kid is told:** "A picture in this project couldn’t be used, so a gray one is in its place." and "A sound in
  this project couldn’t be used, so it is quiet now." (plural forms too).

This runs on every way in: this computer, the account and files. Saves that already open are never touched.

**Powers carry no pictures or sounds.** A power holding `costumes` or `sounds` is refused: "That power has pictures or
sounds in it. A power holds only blocks, so it can’t snap on." Any other field a power doesn't have is refused as
damaged.

## 3. The class shelf checks the whole power

**One shared check:** `checkPowerPayload` in `core/contentRules.ts`. The app uses it, and the Worker imports it by a
relative path (no browser code; `wrangler deploy --dry-run` bundles it).

It checks:
- **Kind and version.**
- **`game`:** missing or `'platformer'` is accepted; anything else is refused.
- **Types:** `fits`, name, credits and what.
- **Variables:** ids, values, and up to 100 of them.
- **Blocks:** Blockly's own keys only; fields are values; connections are `{ block, shadow }`.
- **Limits:**
  - 100 top-level scripts;
  - 2,000 blocks, nested at most 64 deep;
  - files up to 512 KB (the shelf stays at 64 KB);
  - every block type against the known list.

**The Worker** maps the result to `invalid_power` (400), `unknown_blocks` (400), `other_game` (400) or `too_large`
(413). It stores only a power's own fields.

**Block types are checked on the Worker,** since the list is shared. The client checks again before installing anyway,
because shelf items shared before this change were checked only in outline.

No database migration.

## Not changed, on purpose

- **The Worker's Hackable world envelope** still checks only the outline. The app repairs pictures and sounds when it
  opens a project, before anything is drawn, and says so.
- **Oversize pictures** keep their existing repair: compress or shrink, or leave out a brick picture that can't be
  read. That path stays silent, as before.
- **`procedures_callnoreturn` / `procedures_callreturn`** count as known: they are still defined so old saves load.
  The runtime runs only `procedures_call`, so they still do nothing. Turning them into calls would change old
  projects.

## Checks

- `npx tsc -b`: clean. `npm run typecheck:worker`: clean.
- `npx vitest run`: 297 files, 3,307 passed, 25 expected failures.
- `npm run test:worker`: 254 passed.
- Feel tests (`src/platformer/lab/feel`): 50 passed, 25 expected failures.
- Golden fixtures are unchanged. The test walks every one of them, the Hero fixtures, the starter project, the catalog
  and grid bricks, the built-in powers and the sound library: all are known blocks and allowed sources.

**New tests:**
- `core/editor/knownBlocks.test.ts`
- `core/editor/unknownBlocks.test.ts`
- `core/contentRules.test.ts`
- `studio/persist/openChecks.test.ts`
- `studio/powers/powerChecks.test.tsx`
- the Worker's `classroomShelf.test.ts` (a new case)

**Browser** (Vite on 5204, headless Chrome, guest). The harness is in the session scratchpad, `groupc/checks-qa/`. It
used a crafted project file (the Hero's picture is a web address, plus a `logic_compare` block) and two crafted power
files (an unknown block; a power carrying a picture).
- `checks/desktop-1-project-opened.png`, `checks/phone-1-project-opened.png`: the Opened notice says both things, the
  Hero is gray, and the page holds no remote images.
- `checks/desktop-2-code.png`: the diagnostic on the unknown block.
- `checks/desktop-3-power-unknown-block.png`, `checks/desktop-4-power-picture.png`: the power refusals.

Code needs a bigger screen than 390 × 844, so the power messages were checked on desktop only. No page errors.

## Not verified

- Real devices and Safari.
- Signed-in saving and the real shelf against the deployed Worker. The shelf was verified with Worker unit tests and a
  fake shelf in the app tests.
- The account-open notice in the browser (unit-tested only).
