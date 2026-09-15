# Help copy (draft for review)

Lane W2. This is the text shown in the `#help` section of the marketing landing page
(`src/brick/landing/LandingPage.tsx`) and the source for a future standalone help page. Every sentence was checked
against the code on 2026-09-14 (file references below). Nothing here is a promise about future features.

## Building

Pick a brick from the drawer and tap or click the plate to place it. Undo and redo sit in the toolbar. Explore switches
to your character; walk and jump with the keyboard, or with touch controls on phones and tablets.

- Undo/Redo: `src/brick/BrickStudioApp.tsx` toolbar (`aria-label="Undo"` / `"Redo"`); disabled only when the stack is
  empty or graphics are paused.
- Keyboard: WASD / arrows move (mode-dependent), Shift runs, Space jumps (twice for a double jump), Esc returns to
  Build (`src/brick/explorePreferences.ts`, `BrickStudioApp.tsx`).
- Touch: movement joystick plus a Jump button (`BrickStudioApp.tsx`), pinch to zoom, drag to look.
- Recenter / Respawn exist with those names.
- Plate sizes 64 / 96 / 128 (`packages/brick-core/src/buildPlate.ts`); shrinking never cuts off bricks.

## Saving

Guest drafts save automatically in this browser. The world menu can export any build as a file and import it again
later. Signed-in students save to My Worlds.

- Guest autosave key `brick-studio.current-project.v1` (`src/brick/localProjectKeys.ts`, `documentPersistence.ts`).
- File format `.brickstudio.json` (`packages/brick-core/src/brickDocument.ts`). Menu items today read **Export** /
  **Import** (`src/brick/StudioMenu.tsx`); the header contract (W4) renames them "Download build" / "Import build".
  The landing copy avoids naming the item so it stays true either way.
- Account tabs: **My Worlds** and **My Class** (`src/classroom/ClassroomPanel.tsx`).

## Sharing

Build together creates a temporary room with an invite link you can copy. Anyone with the link can join while the room
is open to new people; the owner can close it. Rooms expire about two hours after the last activity, so export a copy to
keep the build.

- "Build together" (`StudioMenu.tsx`, `BrickStudioApp.tsx`); "Copy invite link" button (`src/brick/live/CopyInviteButton.tsx`).
- Owner toggle "Close room to new people" / "Open room to new people", "End room" (`src/brick/live/LiveWorldHud.tsx`).
- Idle TTL `WORLD_ROOM_TTL_MS = 2h` for guest rooms only (`multiplayer/worker/src/worldRoom.ts`); classroom worlds do not expire.

## Students

Join a class with your enrollment code and choose a username and password. Returning students use the class sign-in
code. Forgot your password? Ask your teacher for a temporary one.

- Fields: Enrollment code / Sign-in code, username (3–24 chars), "Name your teacher knows" (register only), password
  (min 8) — `src/classroom/ClassroomPanel.tsx`. No student email exists anywhere.
- Teachers set a temporary password; it signs the student out and requires a new password.

## Teachers

Sign in with your teacher account, create a class, and give students its enrollment code. Create whole-class or group
worlds from My Class and manage students from the roster.

- Teacher sign-in: "Continue with Google" (primary) or email + password. Teacher role is an operator allowlist
  (`BRICK_TEACHER_IDS`, `multiplayer/worker/src/classroom/index.ts`); there is **no self-registration**, and the landing
  says so.
- Controls verified: Close/Open enrollment, New enrollment code, Close/Open collaboration, temporary password, suspend /
  reactivate (work kept), restore checkpoint, whole-class / assigned-group worlds, remove from group (contributions
  kept, cannot rejoin by link).
- Closing collaboration: students can no longer open or list shared worlds; live sessions end (`access_revoked` /
  `class_closed`); the teacher can still open worlds to review and manage them. Personal worlds are unaffected.

## Open questions for the user / lead

1. Should Help become a standalone route (`/help`) instead of an in-page section? The footer link currently resolves to
   `/#help`; a route needs a lead decision in `src/routes.ts`.
2. Once W4 renames Export/Import to "Download build" / "Import build", the Help copy may name the items explicitly.
3. Is there a support contact for teachers (the copy says "the team that set up your account")? No address or domain
   may appear in source until the domain decision is made.
4. Should the in-app Quick start overlay (`src/brick/OnboardingGuide.tsx`) and this Help text be unified?
