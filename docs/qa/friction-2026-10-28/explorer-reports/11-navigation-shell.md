# Pass 2: 11-navigation-shell

I found 13 navigation and shell problems the first pass didn't list. The two worst: a guest's new 2D level vanishes from view after a refresh or sign-in, and Back bounces kids forward again after they sign in. This is from reading code only; I ran nothing. Paths are under `/Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan/`.

**1. A guest's new 2D level disappears on refresh, sign-in or Back**
- **Who/when:** a guest who starts a platformer or race track from New project, a starter, or "Make a race track" (any `/2d/build?new=1` link, with or without `kit=` or `template=`).
- **Evidence:** the level is saved locally, but the address is never changed to `?draft=` (`src/platformer/ui/GameScreen.tsx:198-215`). Signed-in users do get their address updated (`:238`). Reloading `?new=1` opens a blank level (`src/platformer/PlatformerApp.tsx:143`). The guest "Sign in" link returns to that same `?new=1` address (`src/shell/AccountChip.tsx:40`). Each try leaves another "My world" draft, counting toward the 30-draft limit.
- Confirmed in code. **Severity:** loses work (from the kid's view; the level is still in My projects). **Fix:** S. **Lane:** E.

**2. Back bounces forward again after signing in**
- **Who/when:** anyone who opens `/join` while already signed in, or who signs in successfully there.
- **Evidence:** `/join` leaves itself in the browser history when it sends people on (`src/pages/join/JoinPage.tsx:66, 97-101, 168`). Pressing Back reaches `/join`, which sends them forward again. A signed-out 2D `?world=` link has the same loop (`PlatformerApp.tsx:109`).
- Confirmed in code. **Severity:** confuses. **Fix:** S (replace the page instead of adding a history entry). **Lanes:** C, plus E for `PlatformerApp.tsx`.

**3. Landing sign-in links go through the 3D builder**
- **Who/when:** anyone tapping "Student login", "Teacher login", "Join a class" or "Teacher sign in" on the landing page. Signed-in kids see these links too, because the landing page never checks who is signed in.
- **Evidence:** the links point at `/build?classroom=…` (`src/brick/landing/LandingPage.tsx:56-58, 247-249, 301, 360, 534-536`). That loads the 3D builder, changes the address to `/build`, then goes to `/join` (`src/brick/BrickStudioApp.tsx:952-959`). Back from `/join` lands in the 3D builder, not the landing page. The same detour is in `src/brick/live/LiveWorldGate.tsx:182` and `src/classroom/TeacherGoogleCallback.tsx:29`.
- Confirmed in code. **Severity:** confuses, and slow on school Wi-Fi. **Fix:** S (link straight to the join page). **Lanes:** C, and A for `LiveWorldGate.tsx`.

**4. The Hackable Platformer leaves without saving first**
- **Who/when:** a signed-in kid who taps My projects or the logo within about 1.2 seconds of an edit, or while a save has failed.
- **Evidence:** both buttons navigate away directly (`src/platformer/lab/studio/screen/StudioShell.tsx:143, 155`). The only protection is the browser's own "Leave site?" box (`src/platformer/lab/studio/StudioApp.tsx:162`). The 3D and 2D builders save before leaving (`BrickStudioApp.tsx:1346-1357`, `GameScreen.tsx:755`).
- Confirmed in code; that the last edit is actually lost is my inference. **Severity:** loses work. **Fix:** S. **Lane:** F.

**5. `/2d/hackable?new=1` makes a project before any edit**
- **Who/when:** every tap on "Try the Hackable Platformer" or "Start a Hackable Platformer".
- **Evidence:** the project is created as soon as the page opens (`StudioApp.tsx:54-75`). 2D and 3D wait for the first edit. Empty "My platformer" projects pile up toward the account limit or the browser's 30.
- Confirmed in code. **Severity:** annoys. **Fix:** S–M. **Lane:** F.

**6. "Make a platformer" can open an old race track**
- **Who/when:** returning kids, and the next kid on a shared iPad.
- **Evidence:** the button goes to plain `/2d/build` (`LandingPage.tsx:227, 420`), which reopens the newest 2D project of any kind, race tracks included (`PlatformerApp.tsx:123-141`). "Make a race track" and the Hackable button always start a new project.
- Confirmed in code. **Severity:** confuses. **Fix:** S. **Lanes:** C / E.

**7. A missing `?draft=` opens a blank level with no message**
- **Who/when:** pressing Back after "Move to my account" or "Remove" in My projects, or using an old link.
- **Evidence:** `PlatformerApp.tsx:119-143`. The Hackable Platformer shows "That project isn't on this computer" instead (`StudioApp.tsx:79-81`).
- Confirmed in code. **Severity:** confuses (looks like lost work). **Fix:** S. **Lane:** E.

**8. A signed-out Hackable link is a dead end**
- **Evidence:** the card says to sign in, but its only button is "My projects", and the link is lost (`StudioApp.tsx:49-51, 123`). 3D and 2D class rooms bring you back after sign-in.
- Confirmed in code. **Severity:** confuses. **Fix:** S. **Lane:** F.

**9. The header and ⋯ menus differ by mode**

| | 3D | 2D / race | Hackable |
|---|---|---|---|
| Download | "Download a copy" (`.brickgineers`) | "Download a copy" (`.brickgineers`) | "Save File" (`.json` only) |
| New | "New build" (resets in place) | "New project" (picker; its description leaves out Hackable, `LevelMenu.tsx:47`) | only "Reset" |
| Help | quick start | none (`onOpenHelp` dropped, `AppHeader.tsx:261`) | none |
| Back button | leaves | opens the menu (`GameScreen.tsx:320-330`) | leaves |

A Hackable project downloaded from My projects can't be reopened with the Hackable "Open File" button (`persist/ProjectMenu.tsx`, `persist/projectIo.ts:36-48`). Confirmed in code. **Severity:** confuses. **Fix:** M. **Lanes:** E, F, and NEW.

**10. My projects makes projects hard to find and recognise**
- Search skips "On this computer only", and guests get no search (`src/pages/worlds/WorldsPage.tsx:196-217, 345, 358`).
- Account cards have no pictures; race and Hackable both show the same side-scroller art (`WorldCard.tsx:15-16, 36`). A project loses its picture once moved to the account.
- The local 3D build is always listed last, with no date (`src/projects/projects.ts:70`).
- The empty-state text leaves out Hackable (`WorldsPage.tsx:365`).
- Names clash: Hackable starts as "My platformer" while a Platformer starts as "My world". The guest 3D build is "My build" in the header but "My 3D build" on its card.
- Confirmed in code. **Severity:** annoys. **Fix:** S (pictures M). **Lanes:** NEW and C.

**11. The account menu's "New build" is 3D-only on every page**
- **Evidence:** `src/shell/AccountMenu.tsx:54`; the comment at `src/shell/navigation.ts:16-22` is out of date. It sits next to the page's "New project" button.
- Confirmed in code. **Severity:** confuses. **Fix:** S. **Lane:** NEW.

**12. Some My projects links remove the page from Back history**
- **Evidence:** invites, "Open alone" and "Switch account" replace the page in history (`WorldsPage.tsx:91, 355, 376`), so Back skips My projects.
- Confirmed in code. **Severity:** annoys. **Fix:** S. **Lane:** NEW.

**13. Old names and leftover pages**
- `/2d/lab` still works in production. It shows "Code Lab" and "← 2D worlds", and saves somewhere My projects doesn't list (`src/platformer/lab/LabApp.tsx:242-246`, `PlatformerApp.tsx:45`).
- The 2D class room's exit says "Back to My worlds" and goes to `/worlds` (`PlatformerApp.tsx:320-336`).
- The not-found page has no styling or header and offers "Open the studio" rather than My projects (`src/main.tsx:49`). The loading text says "Opening the studio…" for `/projects`, `/join` and `/class` too (`main.tsx:53`).
- Confirmed in code. **Severity:** annoys. **Fix:** S. **Lanes:** NEW, and B for `main.tsx`.

**14. "My 3D build" card may open a different build (inference, needs a test)**
- A signed-in kid who opened an account 3D build earlier in the same tab taps "Open" on the "My 3D build" card. `/build` reopens the account build instead, because leaving doesn't clear the resume key (`BrickStudioApp.tsx:1346-1357`, `src/classroom/useClassroomWorld.ts:72-80`). **Lane:** A.

**File ownership conflicts:**
- `src/platformer/PlatformerApp.tsx` and `routes2d.ts` are outside E's listed folders. Give them to E explicitly.
- A NEW "shell/navigation" lane would own `src/shell/AccountMenu.tsx`, `src/shell/navigation.ts` and `src/pages/worlds/*`.
- That lane would still need small edits in files other lanes own: `main.tsx` (B), `LandingPage.tsx` and `JoinPage.tsx` (C), `LiveWorldGate.tsx` (A). Simplest is to route items 2–3 to C and give B the not-found one-liner.

**Looks solid:**
- Old addresses redirect without breaking Back: `/2d`, `/2d/lab/next`, `/worlds` and `/welcome` all replace the page rather than adding history.
- The 3D builder uses `?new=`, `?world=` and `?classroom=` once and then removes them from the address (`BrickStudioApp.tsx:939-961`), so a refresh never repeats a reset.
- The Hackable Platformer updates its address after opening, so a refresh reopens the same project.
- Opening a project in the wrong builder sends it to the right one.
- 3D and 2D save before leaving.
- In My projects, Remove explains it is permanent and offers a download; Delete goes to Recently deleted with Restore; importing never overwrites without asking.
- The 3D builder's "Replace with a file" spots 2D files and points to My projects.