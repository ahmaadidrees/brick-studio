# Pass 2: 7-data-durability

Root: `/Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan`. All paths below are under it. I only read code and ran nothing. Nothing here repeats the first pass. Where I add to a first-pass item, I say so at the end.

**1. Opening the Stage's Costumes breaks saving for the whole Hackable project**
- **Who/when:** any kid who taps Code → Stage → Costumes.
- **Evidence:**
  - The starter Stage has no costumes (`src/platformer/lab/studio/starter.ts:520`). So the costume editor makes a 480×360 "Sky" backdrop on its own (`CostumeEditor.tsx:98-107`).
  - Pictures are stored as uncompressed PNGs (`pixels.ts:117-130`). That backdrop works out to about 922,000 characters, and the limit for one picture is 200,000 (`core/project.ts:59,428`).
  - On this computer: every save after that is refused with "Try undoing your last change" (`storage.ts:190-200`). Build's undo doesn't cover costumes (`builder/history.ts:4`).
  - In an account: the save doesn't check the project (`persist/hackableCloud.ts:90-91`), so the account accepts it. Reopening runs the full check (`hackableSave.ts:17-19`) and shows "could not be opened… newer version" (`hackableCloud.ts:34`).
- **Status:** confirmed in code by the size arithmetic, not run. Reproduce with: Stage → Costumes, wait a second, reload.
- **Severity:** loses work (the whole account project).
- **Fix:** S–M. Don't create a backdrop until the kid paints one, and compress it. Check the project before each account save.
- **Lane:** F

**2. An old 3D tab overwrites the build just by being hidden or closed**
- **Who/when:** guests on Chromebooks with yesterday's `/build` tab still open.
- **Evidence:** `flush` saves whether or not anything changed (`src/brick/documentPersistence.ts:123-130`). It runs on every `pagehide` and every switch away from the tab (`useBrickStudioDocuments.ts:101-104`). Nothing listens for changes made in other tabs; the only `storage` listener is for sign-in (`src/classroom/sessionStore.ts:119`). Closing the old tab saves its old build over the new one, and a blank old tab saves an empty plate.
- **Status:** confirmed.
- **Severity:** loses work.
- **Fix:** S to only save when something changed, plus M for a "changed in another tab" banner.
- **Lane:** A

**3. The same project open in two tabs: the last tab to save silently wins (2D, Hackable, My powers)**
- **Evidence:**
  - Each mode has one save slot per project (`src/platformer/ui/drafts.ts:59-67`, `lab/studio/storage.ts:202`).
  - `/2d/build` and `/2d/hackable` with no project in the address reopen the newest project (`PlatformerApp.tsx:139`, `StudioApp.tsx:77`), which makes two tabs on one project easy.
  - My powers reads its list once per tab, so a power made in tab B wipes powers made in tab A (`powers/library.ts:27-36`).
  - Here, unlike item 2, an old tab only writes after it is edited.
- **Status:** confirmed.
- **Severity:** loses work.
- **Fix:** M, one shared watcher for changes from other tabs.
- **Lane:** NEW (or B)

**4. 2D account levels never warn before the tab closes, and 2D/Hackable accounts keep no recovery copy**
- **Evidence:**
  - `save()` returns true whenever an account saver exists (`src/platformer/ui/GameScreen.tsx:218-221`), so the leave-page warning (`:281-285`) never fires, even while saving is pending or has failed.
  - The save that starts when the tab hides doesn't keep going once the page closes (`src/classroom/client.ts:92`), and the header logo is a plain link (`src/shell/AppHeader.tsx:154`).
  - 2D and Hackable keep no session copy of unsaved work (`cloudLevel.ts`, `hackableCloud.ts`), unlike 3D (`cloudAutosave.ts:13-19`).
  - *(inference)* iPad Safari doesn't show leave-page warnings, so Hackable's warning (`StudioApp.tsx:162`) doesn't help there.
- **Status:** confirmed.
- **Severity:** loses work (the last ~1s, or everything since a failed save).
- **Fix:** S for the 2D warning; M for a recovery copy in both modes.
- **Lane:** E + F

**5. The same account world in two tabs or devices: the second tab can never save**
- **Evidence:**
  - 3D Retry re-sends the stale revision forever (`cloudAutosave.ts:30`). The kid's only choices are Download, Retry or Reload (`BrickStudioApp.tsx:1524`).
  - 2D and Hackable say "Reload to get it" but give no button (`cloudLevel.ts:104`, `hackableCloud.ts:97`). 2D's "Retry save" then says "Check your connection" (`GameScreen.tsx:622`).
  - The Worker sends back `currentRevision` (`multiplayer/worker/src/classroom/index.ts:1010`), but no client uses it.
  - The copy blames "someone / somewhere else" when it's the kid's own other tab.
- **Status:** confirmed.
- **Severity:** loses work and confuses.
- **Fix:** M. Offer "Keep this version" (save over it; the old one stays in checkpoints) and "Open the other version" (after an automatic download).
- **Lane:** B (plus call sites in E and F)

**6. A 2D account level the app can't read sends the page into an endless redirect**
- **Evidence:** any check failure throws `NotALevelError` (`cloudLevel.ts:22-23`), which redirects to `/build` (`PlatformerApp.tsx:113`). 3D sees a 2D document and sends it straight back (`BrickStudioApp.tsx:1406`).
- **Trigger:** *(inference)* an older tab or deploy opening a level that has a newer object kind or kit (`level.ts:227-246`).
- **Severity:** blocks that project.
- **Fix:** S.
- **Lane:** E

**7. Unreadable local drafts: 3D and 2D give the kid no way back**
- **3D:** the message promises the draft is "kept in recovery storage" (`useBrickStudioDocuments.ts:84`, `documentPersistence.ts:66-68`), but nothing ever reads `brick-studio.recovery-project.v1`. The message is also raw jargon ("Unsupported … schema version"), and My projects hides the build (`src/projects/projects.ts:52-55`).
- **2D:** `?draft=` with an unreadable draft quietly opens a blank level (`PlatformerApp.tsx:118-121,141`). Download and Move say "no longer on this computer" (`ProjectSections.tsx:66`, `projects.ts:116`).
- **Status:** confirmed.
- **Severity:** confuses (the work is still stored but looks lost).
- **Fix:** S. Copy Hackable's notice with "Save my old world to a file" (`storage.ts:153-176`).
- **Lanes:** A + E

**8. A 3D account world that won't load still gets the guest build saved into it**
- **Evidence:** `attach` ignores whether loading the world worked (`useClassroomWorld.ts:59-65`; `store.ts:1026-1029` only shows a toast). The editor keeps the guest build, and the next edit saves it into the account world. The open-from-link path doesn't check the document either (`BrickStudioApp.tsx:1403-1409`).
- **Trigger:** needs a newer-version world *(inference)*. Checkpoints can undo it.
- **Severity:** loses work (rare).
- **Fix:** S.
- **Lane:** B

**9. Getting files back in**
- Hackable's "Open File" can't open the `.brickgineers` copy that My projects downloads. The picker only shows `.json` (`ProjectMenu.tsx:97`), and the kid gets "schemaVersion must be a non-negative integer" (`projectIo.ts:68-77`). Confirmed. Confuses. S, lane F.
- Downloads free the file the moment the download starts (`projectFile.ts:129`, `documentPersistence.ts:179`, `projectIo.ts:58`, `storage.ts:357`); power files wait 1s first (`library.ts:69`). *(inference)* iPad Safari may drop these downloads, and its file picker may grey out `.brickgineers` files. Needs a device test. S, lane B.

**10. Hackable at the 50-world limit: the kid can't start a new one at all**
- **Evidence:** `StudioApp.tsx:63` shows "Your account is full" with only a My projects button. 2D falls back to saving in the browser instead (`GameScreen.tsx:244-252`).
- **Status:** confirmed.
- **Severity:** blocks that kid.
- **Fix:** S.
- **Lane:** F

**11. Smaller ones**
- Hackable doesn't save when the tab is hidden (`storage.ts:331-334`, `StudioApp.tsx:156-165`). Annoys. S, lane F.
- My powers swallows a failed save and still says "is in My powers" (`library.ts:36`, `PowersBar.tsx:64-65`). S, lane F.
- *(inference)* The Hackable size check counts compact JSON (`hackableProjects.ts:19`), but the database counts its own spaced-out form (`supabase/migrations/202609090003_brick_storage_quotas.sql:29`). Projects of about 1.7–2 MB pass the check, then get the server's generic error instead of "save it as a file". S.
- Nothing asks the browser to keep storage permanently or checks how much space is left, and all modes share the site's ~5 MB (Hackable stores a picture per project). *(inference)*

**Additions to first-pass items (severity unchanged)**
- **B5:** the 3D recovery copy lives in sessionStorage (`useClassroomWorld.ts:64`), so it disappears with the tab.
- **A5:** the 3D menu's "Replace with a file" (`src/shell/WorldMenu.tsx:45`) is a third way to overwrite the one guest build.

**Looks solid**
- **Hackable:** unreadable or newer saves are held back, and the kid can save them to a file (`storage.ts:141-178`). It never writes a save it couldn't open again, and a full disk gets its own message.
- **2D drafts:** reading the list fresh on every save keeps other drafts safe across tabs. A full list refuses the new level instead of dropping an old one (`drafts.ts:59-67`).
- **3D:** builds are checked before writing, blocked storage shows in the header, and switching modes saves first (`BrickStudioApp.tsx:1346-1356`).
- **Accounts:** every save checks the revision. The 3D account copy resumes after a reload. The Worker refuses saves that would change a world's kind, caps request size, and caps checkpoints at 8 MB.
- **My projects import:** reads every old file format and only replaces the guest 3D build after asking. Share links are size-capped with a friendly error.