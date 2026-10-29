# Pass 2: 10-hackable-depth

I read the code only and ran nothing; anything marked *inference* is unverified. Paths are relative to `src/platformer/lab/studio/` unless shown otherwise. Everything is lane F unless marked. Nothing here repeats the first pass.

## Ranked findings

**1. Getting hurt sends the Hero to a fixed spot, not to where the kid placed it**
- **Who/when:** any kid who moves the Hero. The paint strip invites it: "Click to move your Hero" (`screen/BuildDrawer.tsx:108`).
- **Evidence:** the hurt script is `goTo(HERO_START)`, which is always (60, 24) (`hero/heroBrick.ts:158,541`). Moving the Hero only moves its copy (`builder/limits.ts:44-47`). There are no checkpoints.
- **Status:** confirmed. *Inference:* a hazard painted at that spot causes an endless hurt loop.
- **Severity:** confuses; blocks in the hazard case. **Fix S:** remember x/y when the level starts and return there.

**2. Powers can only be reached from Code**
- **Who/when:** non-coders, and every phone.
- **Evidence:** `PowersBar` appears only in `screen/CodeColumn.tsx:48`. Build's inspector has just Sliders and Look (`screen/Inspector.tsx:97-101`). Phones get no Code at all (`screen/StudioShell.tsx:85`).
- **Status:** confirmed. **Severity:** confuses (the main non-coder feature sits behind Code). **Fix M:** add a Powers section to the inspector for snap and On/Off, and keep "Make" in Code.

**3. Costume editor: Undo is wiped after every stroke, Size crops the drawing, and touch is fragile**
- **Evidence:**
  - Every stroke commits (`CostumeEditor.tsx:292`). That creates a new `asset`, which reruns the load effect (deps at `:141`), and that clears the history (`:130-133`).
  - The Size buttons crop from the top-left instead of scaling (`:356`).
  - The canvas has no `touch-action: none` (`assets/assets.css:482`) inside an `overflow: auto` area (`:460`), and there's no `onPointerCancel` (`:669-672`).
  - The rotation handle is 18px.
- **Status:** confirmed; the broken touch strokes are *inference*. **Severity:** loses work. **Fix S** for each.

**4. Play has no "fix it" path**
- **Who/when:** a kid whose code broke the Hero.
- **Evidence:** Play shows only Pause, Restart and camera buttons (`stage/StageControls.tsx:26`), plus hint, coins, hurt and win messages (`builder/PlayFeedback.tsx`). Block notices are read only in `CodeEditor.tsx:90`.
- **Status:** confirmed. **Severity:** blocks a non-coder. **Fix M:** when the Hero is remixed or has notices, show a chip in Play: "Open its code · Put the original back".

**5. Dash can't be used on a tablet, and Play never names a power's key**
- **Evidence:** Dash reads `z` (`powers/powers.ts:381`). The touch buttons only press the arrows, space and x (`screen/PlayTouchControls.tsx:8-15`). The hint is fixed keyboard text, even on touch (`builder/playRules.ts:17`, `builder/PlayFeedback.tsx:63`).
- **Status:** confirmed. **Severity:** blocks Dash on iPad. **Fix S:** let a power declare its key, add a touch button for it, and add it to the hint.

**6. "Make my own copy" throws away what the kid tried**
- **Evidence:** the banner says "Try anything" (`StudioApp.tsx:202`), but the copy clones the server's original (`:195`).
- **Status:** confirmed. **Severity:** loses work. **Fix S:** build the copy from the open project. Lanes F and accounts.

**7. "Take off" sits right next to On/Off and deletes the kid's edits**
- **Evidence:** a 26px X sits 6px from a 24px switch (`screen/screen.css:289-295`, `PowersBar.tsx:39-40`). `takeOffPower` removes every block in the power's scripts, including blocks the kid edited or attached there (`powers/powers.ts:224-225`). There's no confirm.
- **Status:** confirmed. **Severity:** loses work. **Fix S:** ask first when the power's blocks have changed since it was snapped.

**8. A snapped power's blocks land off-screen, and its chip explains nothing**
- **Evidence:** the power's scripts are placed 700px right of the rightmost script (`powers/powers.ts:193`), and the editor reopens at the top-left (`code/affordances.ts:279-280`). The chip shows only the name and credit, not what it does or its key (`PowersBar.tsx:38`).
- **Status:** confirmed. **Severity:** confuses, and breaks the "flip → peek → tweak" on-ramp. **Fix S:** clicking the chip scrolls to and highlights its scripts.

**9. Power sliders on the Hero run away**
- **Evidence:** `KnobsCard` builds the range from the current value for anything that isn't a built-in Hero setting (`workshop/knobs.ts:63-72`). The comment there admits the range doubles at the right end. This hits "second jump power" and "dash speed".
- **Status:** confirmed. **Severity:** confuses. **Fix S:** anchor the range the way Inspector's `ranges` does.

**10. An account save conflict offers only "Reload"**
- **Evidence:** `persist/hackableCloud.ts:98`. Reloading drops this tab's work, and after an error nothing retries until the next edit (`:105`).
- **Status:** confirmed. **Severity:** loses work for kids on two tabs or devices. **Fix M:** add "Save mine as a copy" and a Retry button. Lanes F and accounts.

**11. The block palette speaks Scratch and buries the Platformer blocks**
- **Evidence:**
  - The Platformer category is last of ten and labelled "Platformer extension" (`core/editor/toolbox.ts:366-370`).
  - The start block says "when ⚑ clicked", but there's no flag anywhere in the game (`core/editor/definitions.ts:653`); the "not connected" notice repeats it (`code/DiagnosticsList.tsx:17`).
  - Most Platformer blocks have empty tooltips (`definitions.ts:1538-1611`), and tooltips only show on hover.
  - The magnifier cards explain "in plain Scratch" (`code/plainScratch.ts:249`).
- **Status:** confirmed. **Severity:** confuses. **Fix S.**

**12. "Open File" errors are developer text**
- **Evidence:** raw validator messages are joined and shown (`persist/projectIo.ts:67-74`), for example "schemaVersion must be a non-negative integer." (`core/save.ts:371`). Both pickers accept any .json, so power and project files get mixed up.
- **Status:** confirmed. **Severity:** confuses. **Fix S:** use kid words, and when a power file is opened here say "Open it from + Power".

**13. "Make a power" lists every kid script as "A script with no label"**
- **Evidence:** `PowersBar.tsx:140`, `screen/labels.ts:11`. **Status:** confirmed. **Severity:** confuses. **Fix S:** fall back to the hat and first block.

**14. "Show as a slider" only exists when a variable is created**
- **Evidence:** `setVariableKnob` is only called on create (`CodeEditor.tsx:441`). There's no way to turn an existing variable into a slider, or to remove one. **Status:** confirmed. **Severity:** confuses. **Fix S–M.**

**15. Sounds do nothing without code**
- **Evidence:** every starter brick has `sounds: []` (`starter.ts:217,521`, `hero/heroBrick.ts:563`), and the Sounds tab gives no hint how to hear one. **Status:** confirmed. **Severity:** confuses. **Fix M:** add slots like "when I jump / land / get hurt".

**16. Smaller items**
- **My powers:** kept only in this browser and can't be removed; `forgetPower` has no caller (`powers/library.ts:40`). Annoys. S–M.
- **Power conflicts (*inference*):** Double jump fires on the same press as the Hero's wall jump and uses up the extra jump, because powers run after the Hero's scripts (`powers/powers.ts:202`). The same power can also be snapped twice with no warning. Annoys. S.
- **Unopenable account saves (*inference*):** `powerFromFile` checks a file's shape but not its values (`powers/powers.ts:329`). The account saver writes without validating (`persist/hackableCloud.ts:90-91`), while local save does validate (`storage.ts:193`). So a bad power file could save an account project that won't reopen. Loses work, rare. S.
- **Reset renames the project** to "Starter Platformer" (`persist/ProjectMenu.tsx:57`, `starter.ts:527`), and the notices say "world" inside a "project" UI. Annoys. S.
- **Browser storage (*inference*):** a few hundred KB per project likely fills the ~5 MB browser limit before the 30-project cap (`persist/hackableProjects.ts:16`). Loses work. M.

## Looks solid
- No user-visible "Code Lab" text in `/2d/hackable`; it only appears in console warnings. The old `/2d/lab` page still says "Code Lab" (`src/platformer/lab/LabApp.tsx:246`, `src/platformer/PlatformerApp.tsx:45`), but nothing links to it.
- Snapping and taking off powers is clean: fresh ids, clashing variables renamed, not treated as a remix, and covered by tests. Credits carry over when a power is remade, and the class shelf messages (signed out, loading, waiting, error) are kind.
- Opening an account project handles the wrong kind of project (redirects), sign-in and newer versions, and the page warns before leaving while a cloud save is unfinished.
- Win and hurt feedback, "Play again" / "Keep building", and the no-Hero and no-Goal notes work well.
- Build's brick names match `/2d/build`.