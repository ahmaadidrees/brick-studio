# Pass 2: 9-student-in-class

I found 10 new student-side issues; none repeat the first pass. The worst three lose work or open the wrong project: Hackable Platformer "build together" and its invite link (#1), a silent swap to another build when a session ends (#2), and Undo being wiped in 3D rooms (#3). I only read code and ran nothing. Paths are under `/Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan/`.

**1. Inviting classmates to build a Hackable Platformer is broken twice**
- Who/when: a student invites classmates to build their Hackable project from /worlds.
- Evidence:
  - The redirect builds `/2d/hackable?world=<id>?invited=1` (`src/pages/worlds/WorldsPage.tsx:252`, `worldsData.ts:142`). The route parser then rejects the id (`src/platformer/routes2d.ts:45-47`). So the student opens their latest local draft, or a brand-new account project if they have none (`StudioApp.tsx:77-78`).
  - Hackable projects have no live rooms. A classmate with build access opens the owner's project as a normal saving editor (`StudioApp.tsx:42`), so both kids save over the same project. After the first clash, every save fails with "A newer version… Reload to get it" (`persist/hackableCloud.ts:98`), and reloading throws away that kid's changes.
  - The invite sheet still promises "they build with you, live, in the same room", and building is the default (`src/classroom/InviteSheet.tsx:58,138`).
- Confirmed in code. Severity: loses work. Fix: S (force look-only plus "Make my own copy" for Hackable; fix the `?`/`&` join). No Worker change. Lane F (it also touches `src/pages/worlds` and `InviteSheet`).

**2. When a session ends against the kid's will, their screen swaps to a different build**
- Who/when: the teacher suspends a kid or resets their password, or another tab signs out, mid-lesson.
- Evidence:
  - A failed token refresh signs the kid out (`src/classroom/client.ts:117-119`). The editor then runs `leave()`, which loads the old guest build and clears the error and the "reopen this world" key (`useClassroomWorld.ts:22-31,85`). The kid sees no message, and the unsaved edits survive only in this tab's sessionStorage.
  - In live rooms, a lost session replaces the whole room with the sign-in panel (`src/brick/LiveWorldPage.tsx:311-322`, `src/platformer/PlatformerApp.tsx:304-311`). That skips the recovery-download card.
- This is different from first-pass item 8 (choosing Sign out). Confirmed in code. Severity: loses work. Fix: S–M (keep the world on screen, read-only, with "You were signed out: sign in to keep saving" and Download). No Worker change. Lane B, plus A and E for rooms.

**3. In 3D rooms, Undo is wiped for everyone, and a teacher's restore has no message or a wrong one**
- Who/when: everyone in a 3D room when the teacher restores a checkpoint, the owner renames the world, or any edit is rejected.
- Evidence:
  - The room sends a fresh copy of the world after every rename, save or restore (`multiplayer/worker/src/worldRoom.ts:1025`). Each fresh copy, and each rejected edit, clears every kid's undo and redo (`src/brick/liveRoomClient.ts:273,836,846,853`).
  - If nobody had unsaved edits, the restore shows no message at all.
  - If someone did, the message says "Someone saved a newer version… could not be kept", though it was an older version (`worldRoom.ts:160,1080`).
  - The 2D message says the copy is kept "for the teacher" even on a student's own level (`platformerRoom.ts:61`).
- Confirmed in code. Severity: loses work (Undo) and confuses. Fix: M to keep undo entries whose bricks still exist (lane A); the messages need a Worker change.

**4. Getting kicked out of a 3D room gives no reason and no way back**
- Who/when: collaboration closed, the owner stopped sharing, the kid was removed from a group, or the kid was suspended.
- Evidence:
  - The card shows "Classroom access changed" as both heading and message, then "Rejoin from My Class", with no link (`liveRoomClient.ts:1012`, `src/brick/live/LiveStateViews.tsx:90-91`). "Try reconnecting" just hits the same refusal.
  - In 2D, the room passes the raw "World not found." through when the owner unshares or the kid is removed (`platformerRoom.ts:514`, `classroom/index.ts:1058-1060`).
- Confirmed in code. Severity: confuses. Fix: S (after the kick, ask `/worlds/:id` for the reason and map it to kid words; add a "My class" button). No Worker change. Lanes A and E.

**5. Look-only 3D rooms look fully editable**
- Who/when: a classmate visiting a world shared "just look".
- Evidence: the room's welcome message doesn't say whether this kid may edit (`packages/brick-core/src/protocol.ts:51-63`), and the editor assumes everyone can (`liveRoomModel.ts:176-188`). Every brick bounces back with "Room update. You do not have editing access…" (`worldRoom.ts:820-822`, `LiveWorldHud.tsx:348`). Neither 2D nor 3D rooms offer "Make my own copy".
- Confirmed in code. Severity: confuses. Fix: S–M, using `world.canEdit`, which the page already loads (`LiveWorldPage.tsx:381`). No Worker change. Lane A.

**6. The owner can trample classmates who are building right now**
- Who/when: the owner uses "Open alone" or "Stop sharing" while "Ava is here" shows on the card.
- Evidence: neither has a confirm (`WorldsPage.tsx:376,381`). Saving from "Open alone" races the room: the room's last edits get dropped, or the owner's autosave stops on a conflict (inference about timing).
- Caution for lane B: auto-retry must not retry a revision conflict (409), or it will loop.
- Severity: loses work. Fix: S (confirm using the names already on the card). No Worker change. Lane NEW (`/worlds`).

**7. Class shelf states the kid never sees**
- Hidden ("Not now") items: the server already sends the kid's own hidden items (`multiplayer/worker/src/classroom/shelf.ts:76`), but the list only shows approved and waiting ones, so the power just vanishes (`PowersBar.tsx:167-168`).
- No way to take your own power off the shelf: the server allows it, but nothing in the student's app calls it.
- "Share with my class" only appears right after making a power (`PowersBar.tsx:119-127`); a power in My powers can't be shared later.
- With sharing off, the panel says "Nothing on your class shelf yet… you could be first" and keeps the Share button, which then fails (`PowersBar.tsx:185`). The shelf reply carries no sharing flag (`shelf.ts:63`).
- Confirmed in code. Severity: confuses. Fix: S each. Sharing-off needs a Worker change or an extra `/classes` call. Lane F.

**8. On shared devices, powers can be credited to the wrong kid**
- Evidence: "Made by" is filled from the browser's last maker before the signed-in name (`PowersBar.tsx:102`), and My powers live per browser, not per account (`powers/library.ts:7-8`). Once a power is snapped on, classmates see the typed credit, not the checked author (`PowersBar.tsx:16,38`).
- Confirmed in code; impersonation is an inference. Severity: confuses. Fix: S. Lane F.

**9. Today's class build is hard to find**
- Evidence: students land on "Mine" (`WorldsPage.tsx:135,352`). The teacher's worlds sit below "Shared by classmates" and show no "N building now" chip (`:414-439`). Being added to a group world sends no invite, because invites cover personal worlds only (`index.ts:393`).
- Confirmed in code. Severity: annoys. Fix: S (a "Today in {class}" strip on Mine, teacher's worlds first). Lane NEW.

**10. A student isn't told the teacher hid their world**
- Evidence: the hidden flag is sent to teachers only (`index.ts:597`), so the owner's card still says "Shared · build together". Separately, when collaboration is closed, "Invite classmates" just disappears with no reason (`WorldsPage.tsx:242,390`).
- Confirmed in code. Severity: confuses. Fix: S. The hidden flag needs a Worker change; the invite note is client-only. Lane NEW.

**Smaller:**
- "Ask your teacher for help" on the account-full error reaches students who could delete a project themselves (`index.ts:895,978`). Map it in the client; Hackable already does (`StudioApp.tsx:64`).
- In class worlds, the locked message says "The owner closed this world" when the owner is the teacher (`liveRoomClient.ts:1018`).

**Looks solid:**
- Building clashes are explained in kid words ("That brick was removed by another builder", `worldRoom.ts:355`).
- When a 3D class world can't save, the room keeps the edits and tries again later (`worldRoom.ts:1273`).
- The access-changed card has Download plus a leave warning (`LiveStateViews.tsx:71-124`).
- Sign-in renewal runs one at a time across tabs, and a network blip doesn't sign anyone out (`client.ts:103-121`).
- The join page says "Your account is paused" in kid words (`JoinPage.tsx:45`).
- "Waiting for your teacher" is clear on the shelf.
- The Hackable viewer banner with "Make my own copy" works well.