# Pass 2: 8-accessibility-copy

Second pass on accessibility and kid-facing copy: 12 new findings plus a copy table, none repeating the first pass. I only read code and ran nothing. Anything marked *(inference)* is about how a browser or screen reader behaves, not something I saw happen. Paths are under `/Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan/src/`.

## Ranked findings

**1. Raw server and validator errors reach kids on about 15 screens.** The first pass only flagged `ClassroomPanel:90` and the error boundary.
- **Who/when:** any kid whose save, share, open or room request fails.
- **Evidence:**
  - `platformer/lab/studio/StudioApp.tsx:51`, `:198`
  - Hackable Open File passes validator text through `persist/ProjectMenu.tsx:43` from `persist/projectIo.ts:75,116`, e.g. "Invalid JSON: …", "Unsupported future schema version…"
  - `platformer/ui/GameScreen.tsx:637,651,700`, fed by `platformer/net/endpoints.ts:38,53` ("Could not open a room (status 503).")
  - `projects/projects.ts:169`, `projects/ProjectSections.tsx:58`, `shell/RenameWorldDialog.tsx:37`, `PowersBar.tsx:126,179`, `hackableCloud.ts:99`, `brick/BrickStudioApp.tsx:1244`, `classroom/useClassroomWorld.ts:81`
  - Fallback text "Request failed (500)." at `classroom/client.ts:134`; the server also sends strings like "A valid expectedRevision is required."
- Confirmed. **Confuses.** **M:** reuse the join page's kid-friendly mapper (`pages/join/JoinPage.tsx:37-48`) everywhere. Lane: NEW (copy/a11y), or B.

**2. Messages, including errors, disappear after about 3 seconds however long they are.**
- **Who/when:** slow readers and screen-reader users in 3D and 2D.
- **Evidence:**
  - Fixed 3.3 s in 3D (`BrickStudioApp.tsx:749`) and 3.2 s in 2D (`GameScreen.tsx:147`).
  - Long errors go through these toasts, e.g. "Your account save needs attention…" (`BrickStudioApp.tsx:1349`).
  - The message area is created at the same moment as its text (`BrickStudioApp.tsx:750`, `GameScreen.tsx:948-950`), so screen readers may not read it *(inference)*. 3D also gives it the label "Studio message".
  - Hackable already does this right: problems stay until dismissed (`persist/StorageNoticeBar.tsx:14-17`).
- Confirmed (screen-reader behaviour is inference). **Confuses.** **S.** Lanes A and E.

**3. Hackable Code dialogs don't work properly from the keyboard.**
- **Evidence:** `code/VariableModal.tsx:55`, `code/ProcedureModal.tsx:103`, `code/PlainScratchCard.tsx:55`, and the Reset/Open confirms at `persist/ProjectMenu.tsx:116,132`. All are marked as modal, but none moves focus in, keeps Tab inside, closes on Escape or returns focus when closed. The shared `ui/Sheet.tsx` already does all four.
- Confirmed. **Blocks** keyboard users; Escape doing nothing annoys everyone else. **S–M** (switch to `Dialog`). Lane F.

**4. You can't build with only a keyboard in 2D or Hackable (3D is fine).**
- **Evidence:**
  - 2D: the level canvas only responds to pointer events and has no label or tab stop (`GameScreen.tsx:799-810`). The key handler (`:365-400`) has no way to place a brick.
  - Hackable: keys only delete or nudge a brick that was already selected by mouse (`Stage.tsx:598-635`).
  - Code uses Blockly with no keyboard-navigation plugin in `package.json` *(inference whether Blockly 13 covers this on its own)*.
- Confirmed. **Blocks** keyboard and switch users. **L** (copy 3D's Enter/arrow model, `BrickStudioApp.tsx:147-164`). Lanes E and F.

**5. Hackable buttons with low contrast.**
- "Create Variable/List/Block" is white on orange or pink, 2.3–2.9:1. Inline styles at `VariableModal.tsx:212` and `ProcedureModal.tsx:325` override the blue that `code/light.css:69` intended.
- "BLOCK PREVIEW:" label is 2.4:1 (`code/code.css:658`).
- Storage-notice action buttons are white on #5888da, 3.53:1 (`persist/projectMenu.css:206`). That is the pairing `styles.css:9` says never to use.
- Confirmed. **Annoys.** **S.** Lane F.

**6. In Hackable Build, the selected brick's outline is nearly invisible.**
- **Evidence:** gold `#ffd43b` on the sky `#cfe8f7` is 1.12:1, and the white corner squares are 1.27:1 (`stage/gridCells.ts:8`, `stage/renderer.ts:19,452-466`). The code switch's focus ring uses the same gold, 1.35:1 (`code/light.css:92`).
- Confirmed. **Confuses.** **S:** add a dark inner stroke. Lane F.

**7. Hackable "ask" question gets no focus and no announcement.**
- **Evidence:** `stage/AskDialog.tsx:20`. The game waits while the kid hunts for the answer box.
- Confirmed. **Confuses.** **S.** Lane F.

**8. Every page is titled "Brickgineers" except Hackable.**
- **Evidence:** `index.html:8`; only `StudioApp.tsx:168` sets a title. The 2D and Hackable editors also have no main heading or main landmark.
- Confirmed. **Annoys.** **S.** Lane NEW.

**9. Colour swatches are read out as hex codes.**
- **Evidence:** "Use color #E53935" (`brick/CommandStrip.tsx:65`); "Color #ff4c4c" with no "selected" state (`CostumeEditor.tsx:706`).
- Confirmed. **Annoys.** **S.** Lanes A and F.

**10. Visible names don't match spoken names, which breaks voice control.**
- **Evidence:** the button shows "People" but is named "Build together" (`BrickStudioApp.tsx:321-322`); "Save File"/"Open File" vs "Save project to file"/"Open project from file" (`ProjectMenu.tsx:72-91`); "Center" vs "Reset zoom" (`EditorToolbar.tsx:133`).
- Confirmed. **Annoys.** **S.**

**11. Motion gaps.**
- The 2D player flickers at about 15 Hz for up to 4 seconds after a hit, with no reduced-motion check (`platformer/game/session.ts:1111`, `:325`). The sprite is small, so it's probably below flash limits *(inference)*.
- Race start lights are an image with no announcement (`race/RaceHudView.tsx:70`).
- Confirmed. **Annoys.** **S.** Lane E.

**12. "Code Lab" still shows to kids, but only on the old `/2d/lab` address.**
- **Evidence:** "Opening the code lab…" (`platformer/PlatformerApp.tsx:45`); a "Code Lab" header and a "2D worlds" back link that bounces to My projects (`platformer/lab/LabApp.tsx:242-246`). Nothing links there.
- Otherwise the name is clean: `App.tsx:186` is dead code and the rest are comments or console logs.
- **Annoys.** **S** (redirect to `/2d/hackable`). Lane F.

## Copy fixes (confirmed; all kid-facing)

| file:line | Now | Suggest |
|---|---|---|
| `BrickStudioApp.tsx:1252` | "Some edits are only in recovery storage…Continue?" | "Some changes haven't saved yet. Leave anyway?" |
| `BrickStudioApp.tsx:1321` | "…recovery details appear in the live session controls." | "Lost connection. Open People to see what to do." |
| `classroom/cloudAutosave.ts:18` | "Device recovery storage is full. Export this build…" | "This computer is full. Download your build first." |
| `ClassroomPanel.tsx:212,231` | "Resolve the pending world save before renaming." | "Wait until it says Saved, then try again." |
| `liveRoomClient.ts:679,694,707` | "The live world connection closed before your change could be confirmed." | "Connection lost. Your last change might not be saved." |
| `liveRoomClient.ts:1089,1162`; `LiveWorldPage.tsx:148,165` | "Live sync is catching up…" / "wait for sync" | "Hang on, everyone's screens are catching up." |
| `liveRoomClient.ts:797` (33 words) | "…previous session could not be confirmed…" | "Some changes didn't reach the room. Download them from People." |
| `liveRoomClient.ts:1058,1062` | "Your visible work is still available to export." | "You can still download what you see." |
| `GraphicsPausedOverlay.tsx:47,64` | ".brickstudio.json file" / "restore graphics…" | "Downloaded a copy." / "The picture froze. Waiting…" |
| `OnboardingGuide.tsx:52,60` | "orbit", "pan", "the brush stays loaded" | "spin the view", "slide", "the brick stays in your hand" |
| `VariableModal.tsx:138,173` | "Scope" / "One global value shared across every brick and the stage" | "Who uses it?" / "All bricks share one value" |
| `ProcedureModal.tsx:231,305-307` | "input (boolean)", "Run without screen refresh… single frame" | "yes/no input", "Run it all at once" |
| `code/DiagnosticsList.tsx:31` | "…loading this workspace." | "These blocks didn't load." |
| `storage.ts:160-186` | 45-word notices | "We couldn't open your last save. It's safe. Start fresh, or save it to a file?" |
| `platformer/ui/RecoverySheet.tsx:111` | "Version 412" | the time only |

**Inconsistent names (beyond worlds vs projects):**
- **Playing together:** "Build together" / "People" / "Shared world" (`ui/SaveStatus.tsx:46`) / "live world" (13 strings) / "room".
- **Saving to a file:** "Export a file" (`LiveWorldHud.tsx:311`) / "Export a copy" (`BrickStudioApp.tsx:1244`) / "Download a copy… Import a file" (`GameScreen.tsx:786`) / "Save File" and "Open File" (`ProjectMenu.tsx`).
- **Inside Hackable:** "level" in some places ("In this level", the stage's label) and "world" in others ("Started a new world", `ProjectMenu.tsx:62`).

## Looks solid
- **Shared dialogs and menus:** `ui/Sheet.tsx` handles focus in and back out, keeps Tab inside, and Escape closes only the top one. `ui/Menu.tsx` has arrow keys, Escape and focus return. The 2D pause, People and Recovery sheets use them.
- **Icon buttons:** a scan of about 594 buttons found no unlabelled icon-only button. `Button` enforces labels (`ui/Button.tsx:71`).
- **Focus rings:** a global ring (`styles.css:156-157`), with focus styles restored on the Hackable stage and test room.
- **Design colours:** every text/muted/warning/danger/success pairing passes 4.5:1 (I computed them). The landing's teacher and Hackable bands pass too.
- **Reduced motion:** a global kill switch (`styles.css:195`). The landing demo has a Pause button and doesn't autoplay when reduced motion is on.
- **3D keyboard path:** place, nudge, step through bricks, plus a list of placed bricks for screen readers (`CommandStrip.tsx:248`).
- **Smaller things that work:**
  - Landing skip link and page language.
  - No zoom lock.
  - Form fields have labels and error states.
  - Save status is shown in words.
  - Hackable keeps problem notices on screen until dismissed.
  - The On/Off switch shows text and works from the keyboard.