# Friction: 3D builder and rooms

I found 11 friction points, ranked by how many kids they likely hurt times how badly. Most are backed by code; the ones I couldn't confirm in code are marked as inferences. Paths are relative to `/Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan`.

**1. A guest room's build disappears when the room expires**
- **Who:** friends building together without accounts who close the tab or come back the next day.
- **Evidence:** rooms expire 2h after the last activity (`multiplayer/worker/src/worldRoom.ts:136`), and the builder's local autosave is switched off while you're in a room (`src/brick/liveAutosaveGuard.ts:20`). The only way to keep the build is a manual "Download a copy from People" (`src/brick/live/LiveWorldGate.tsx:175`). Coming back later just shows "This room is closed" with no way to get the build back (`src/brick/LiveWorldPage.tsx:533`). Leaving warns only if edits are still unconfirmed (`src/brick/live/LiveWorldHud.tsx:116`).
- **Severity:** blocks (lost work).
- **Fix:** when a kid leaves, or every few minutes, keep a copy of the room's build in the browser, and offer "Continue your copy" on the closed-room screen. M.

**2. Signed-in kids can't find their build again in a new tab**
- **Who:** students coming back the next lesson.
- **Evidence:** which account world to reopen is stored in sessionStorage, which only lasts for one tab (`src/brick/BrickStudioApp.tsx:225,237,1384`). After the first save the browser copy is cleared (`:1149`). *Inference:* a fresh `/build` opens a blank plate, and the first brick creates another "Untitled build" (`:226`).
- **Severity:** confuses (looks like lost work, and leaves duplicate builds).
- **Fix:** remember the last world in localStorage per user, or show "Continue <last build>" on an empty plate. S–M.

**3. Explore mode on a big build will likely stutter on a Chromebook**
- **Who:** kids who reach a few hundred to 2,000 bricks (the limit, `packages/brick-core/src/brickDocument.ts:12`).
- **Evidence:** Build mode draws bricks efficiently in batches. Explore draws every brick on its own and gives each one its own physics body (`src/brick/BrickStudioScene.tsx:1812,1410-1420`). The lighter graphics setting only kicks in on screens under 600px, so a 1366×768 Chromebook gets shadows (`src/brick/rendererQuality.ts`, `src/brick/BrickStudioScene.tsx:1980`). *Inference:* low frame rates.
- **Severity:** annoys or blocks.
- **Fix:** draw Explore bricks in batches too, and pick graphics quality based on device speed rather than screen size. M–L.

**4. "Use as my local build" silently replaces the kid's own build**
- **Who:** room guests who want to keep the room's build.
- **Evidence:** `src/brick/LiveWorldPage.tsx:584-587` overwrites the one saved browser build with no confirm.
- **Severity:** blocks (lost work).
- **Fix:** confirm first, and download the old build automatically. S.

**5. "New build" promises Undo that won't survive a refresh**
- **Who:** guests.
- **Evidence:** the confirm says "You can Undo during this session" (`src/brick/useBrickStudioDocuments.ts:130`). But the browser keeps only one saved build (`src/brick/localProjectKeys.ts:2`), so autosave overwrites the old one.
- **Severity:** blocks (lost work).
- **Fix:** keep the last 3 builds, or say plainly that the old build will be gone. S–M.

**6. Placing vs selecting on iPad is a hidden mode**
- **Who:** first build on an iPad.
- **Evidence:** the brick stays loaded after Place, so tapping a placed brick moves the preview instead of selecting it. Kids must "Tap Cancel, then tap a brick", and that tip sits in a collapsed details section (`src/brick/OnboardingGuide.tsx:53-61`). Placing itself takes two steps, tap then Place.
- **Severity:** confuses.
- **Fix:** add a visible Build/Select toggle, or let a tap on a placed brick select it while a brick is loaded. M.

**7. Rotate isn't taught, and is greyed out with no reason**
- **Who:** every new builder.
- **Evidence:** the quick start never mentions rotating (`src/brick/OnboardingGuide.tsx`). The keyboard hint shows only when something is selected on a mouse device (`src/brick/CommandStrip.tsx:219`). When placing a group, Rotate is disabled with no tooltip (`:177`); the store's message ("Place this group before rotating it", `src/brick/store.ts:778`) can't appear because the button can't be pressed.
- **Severity:** annoys.
- **Fix:** add a Rotate step to the quick start, and let the disabled button show why when tapped. S.

**8. Hosts have no End room or remove-player control**
- **Who:** a teacher or kid host when someone griefs the build.
- **Evidence:** End room only shows if the page is given an end-room handler, and the route never passes one (`src/main.tsx:32`, `src/brick/live/LiveWorldHud.tsx:286`). There's no kick anywhere in `src/brick`. The only host control is Lock (`:266-276`), which doesn't affect people already inside.
- **Severity:** blocks moderation.
- **Fix:** connect End room, and add "Remove from room". M.

**9. Host powers live only in the tab's web address**
- **Who:** hosts who close the tab, switch device, or copy the address bar.
- **Evidence:** the owner key is kept only in the URL (`src/brick/LiveWorldPage.tsx:563-567`, warning at `:688`). *Inference:* copying the address bar instead of the Invite button hands friends host powers; losing the tab loses them.
- **Severity:** confuses.
- **Fix:** also save the owner key in localStorage, and drop it from the address bar after joining. S.

**10. Deleting gives no visible feedback**
- **Who:** kids who tap Delete by mistake.
- **Evidence:** deleting sets only a screen-reader `announcement`, not a toast (`src/brick/store.ts:765-772`). Undo, placing and rotating do show toasts.
- **Severity:** annoys.
- **Fix:** show a "Deleted · Undo" toast. S.

**11. Jargon in the room screens**
- **Evidence:**
  - "Publish snapshot", "Get latest world", "Copy diagnostics" (`src/brick/live/LiveWorldHud.tsx:284-305`).
  - ".brickstudio file … with Import" (`src/brick/live/LiveStateViews.tsx:24`).
  - "realtime sync client is still being wired in" (`src/brick/LiveWorldPage.tsx:682`).
  - *Inference:* on iPad, recovery files go to the Files app, where kids can't easily find them.
- **Severity:** confuses.
- **Fix:** rename buttons in kid language, hide Diagnostics behind a teacher option. S.

**What looks solid:** disconnects pause building with clear wording and retry automatically (`src/brick/live/liveRoomModel.ts:177-179`, `src/brick/liveRoomClient.ts:27`). Graphics crashes pause the editor cleanly. Tap targets are mostly 44px or larger. Blocked browser storage is detected and explained.