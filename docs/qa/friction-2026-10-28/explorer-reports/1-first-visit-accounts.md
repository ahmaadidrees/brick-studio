# Friction: first visit and accounts

I found 11 likely friction points. Two of them block users completely: a new teacher can't get in at all, and a guest's 3D build gets overwritten. I only read code and ran nothing; anything marked "inferred" is my reasoning from the code, not something I saw happen.

**1. A new teacher has no way to get an account**
- **Who:** a teacher on day one.
- **Evidence:** the server only accepts teacher accounts listed in `BRICK_TEACHER_IDS` (`multiplayer/worker/src/classroom/index.ts:457`). Anyone else gets "This account is not configured as a teacher." The Google callback page then offers only "Try again" and "Keep building" (`src/classroom/TeacherGoogleCallback.tsx:24-31`). The landing page just says accounts are "set up in advance by the team running your pilot" (`src/brick/landing/LandingPage.tsx:539`).
- **Severity:** blocks.
- **Fix (S):** add a "Request teacher access" link or email on the callback error, the join page and the landing page. A self-serve teacher signup would be L.

**2. A guest's 3D build is overwritten with no real undo**
- **Who:** a guest who comes back, taps New project, then 3D build.
- **Evidence:** the browser keeps only one guest 3D build (`src/projects/ProjectSections.tsx:206`). `/build?new=1` clears it after a confirm that promises Undo "during this session" (`src/brick/useBrickStudioDocuments.ts:130`, `src/brick/BrickStudioApp.tsx:1280-1282`). Once the tab closes, the build is gone.
- **Severity:** blocks (work lost).
- **Fix (M):** keep several guest 3D drafts, like 2D drafts already work. At minimum, offer "Download a copy first" in that confirm (S).

**3. The landing page "Got a class code?" box always opens Create account**
- **Who:** a returning kid typing the code from the board.
- **Evidence:** the form hard-codes `mode=join` (`src/brick/landing/LandingPage.tsx:353-357`). The tap-your-name roster only appears in sign-in mode (`src/pages/join/JoinPage.tsx:187`), so the kid gets 7 rules and three fields instead of their name.
- **Severity:** confuses.
- **Fix (S-M):** look the code up first and show "Tap your name" plus a "New? Create account" button.

**4. A shared device lands the next kid in the last kid's projects**
- **Who:** kid B on a class iPad where kid A is still signed in.
- **Evidence:** `/join` sends any signed-in user straight on, even when a class code was typed (`src/pages/join/JoinPage.tsx:97-102`).
- **Severity:** confuses, and is a privacy problem.
- **Fix (S):** when a code is present and someone is signed in, ask "Are you Ava R.? / Not me" before moving on.

**5. "Move all to my account" can take other kids' builds**
- **Who:** a signed-in kid on a shared device.
- **Evidence:** every project on the device is listed and moved (`src/projects/ProjectSections.tsx:44, 70-72`), and each move deletes the local copy (`src/projects/projects.ts:117-122`).
- **Severity:** confuses, and can lose other kids' work. Inferred from the shared-iPad setup.
- **Fix (S):** ask before moving everything, and show each project's age and kind.

**6. "Create account and join" stays greyed out with no reason**
- **Who:** a new student who leaves "Name your teacher knows" empty.
- **Evidence:** the button needs a roster name (`src/pages/join/JoinPage.tsx:152, 304`), but only the username and password have live rule lists (284, 302).
- **Severity:** confuses.
- **Fix (S):** say what's missing under the button, or add the name to the checklist.

**7. Students are told "worlds" and "projects" for the same thing**
- **Who:** all students.
- **Evidence:**
  - "Sign in to open your worlds" (`JoinPage.tsx:25`)
  - "saved worlds" (`EntryViews.tsx:23`)
  - "My Worlds" tab (`ClassroomPanel.tsx:302`)
  - "Project name" next to a "Save world" button (`RecoveryViews.tsx:41, 49`)
  - "My projects" (`AccountMenu.tsx:59`)
- **Severity:** confuses.
- **Fix (S-M):** call it "project" everywhere students see it.

**8. Signing out from the editor may drop the last edits**
- **Who:** a student who signs out right after building.
- **Evidence:** the header menu's sign-out calls `client.signOut()` directly (`src/shell/useClassroomSession.ts:91-97`). It skips the unsaved-changes check the account sheet uses (`ClassroomPanel.tsx:187`). On sign-out the editor calls `leave()` without saving pending edits first (`useClassroomWorld.ts:85`).
- **Severity:** possible lost work. Inferred, needs a quick test.
- **Fix (S):** save pending edits before sign-out, and warn if that fails.

**9. Teachers can't recover a forgotten password**
- **Who:** a teacher using email and password.
- **Evidence:** there is no reset link (`src/pages/join/JoinPage.tsx:339-343`). Students at least get "Ask your teacher" (307).
- **Severity:** blocks that teacher.
- **Fix (S):** a "Forgot password?" link, or a contact line.

**10. The forced new-password screen has no live rules**
- **Who:** a student whose teacher reset their password.
- **Evidence:** there is a single hint and a browser minimum length (`src/classroom/RecoveryViews.tsx:12-13`). A mismatch only shows after Submit (`JoinPage.tsx:171`), and an easy-to-guess password is rejected by the server with no rule shown on screen.
- **Severity:** annoys.
- **Fix (S):** reuse the join page's password checklist and check the two passwords match as the kid types.

**11. On an iPad held upright, the picture pushes the form down**
- **Who:** kids on iPads held upright (portrait).
- **Evidence:** the toy-room image is only hidden below 700px wide (`src/pages/join/join.css:232-234`). At 768-1023px it sits above the card.
- **Severity:** annoys.
- **Fix (S):** hide the image below 1024px.

**Lower-ranked observations:**
- **Two class codes:** after a teacher makes a new enrollment code, they have one code for joining and a different one for signing in. The help text points to buttons that no longer exist, "Join a class" and "Student" (`src/classroom/ClassView.tsx:97-99`). The landing Help section says returning students need their class code (`LandingPage.tsx:582`), but the sign-in page says it is optional.
- **Two different sign-in screens:** the account sheet inside the editor still has its own sign-in copy, "Student login" and "Use your teacher's code for sign-in…" (`EntryViews.tsx:22-26, 106`). It shows raw server error messages instead of the join page's kid-friendly ones (`ClassroomPanel.tsx:90` vs `JoinPage.tsx:37-48`).
- **Guest work on iPads (inferred):** guest work lives only in localStorage. Safari can clear it after about 7 days without a visit, and nothing in the code warns about that beyond "On this computer only" (`ProjectSections.tsx:78`).