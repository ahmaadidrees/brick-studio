# Friction: teacher and class pages

I found 12 friction points, ranked by how many people they likely hurt times how badly; the first five hit almost every class. I only read code, and anything marked (inference) is my reasoning, not a confirmed behaviour. File paths are relative to /Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan.

1. **Teachers can't see a student's work unless the student shares it**
   - Who and when: every teacher, whenever they want to check one child's progress.
   - Evidence: the Worker only returns personal worlds that were shared (`multiplayer/worker/src/classroom/index.ts:263-274`), and the page filters to shared ones again (`src/pages/class/classPageData.ts:86-88`). Roster rows only offer Edit, Reset password and Suspend; nothing links to the student's worlds (`src/classroom/RosterView.tsx:35-49`).
   - Severity: blocks. Fix: a teacher view of each student's worlds, opened from their roster row (L).

2. **The join instructions and QR link send students to the wrong screen**
   - Who and when: every student on day one, and every returning student who scans the QR.
   - Evidence: the code card, the projector page and the printout all say "enter the code, then tap your name" (`ClassCodeCard.tsx:48,67`, `ProjectorPage.tsx:71`). The link has no mode, so it opens "create account" (`joinQuery.ts:29`), and name tiles only appear in sign-in mode (`JoinPage.tsx:187`). New students have no name to tap. Returning students get a sign-up form (inference: some will make duplicate accounts).
   - Severity: confuses. Fix: correct the wording (S); when the class shows names, open on the name tiles with an "I'm new" button (M).

3. **A reset password is hidden, and gone once saved**
   - Who and when: the teacher, mid-lesson, when a kid forgot their password.
   - Evidence: "Generate" makes a random 12-character mixed-case password (`panelShared.ts:9-11`). The field shows dots by default (`PasswordField.tsx:14-17`). Saving closes the form, and the success notice doesn't repeat the password (`ClassPage.tsx:138-139`). It takes 5 or more taps.
   - Severity: annoys, and blocks if the teacher didn't tap Show first. Fix: show the temporary password large after saving, and generate an easy word-plus-number one (S).

4. **The roster doesn't update while 28 kids join**
   - Who and when: the teacher on day one.
   - Evidence: students load only when the class changes (`ClassPage.tsx:101-111`), with no refresh timer anywhere in the class page. The projector page shows no count of who has joined.
   - Severity: confuses. Fix: refresh every 10 seconds while enrollment is open, plus a "12 of you are in" line on the projector (S-M).

5. **Groups are filled one student at a time**
   - Who and when: the teacher running group builds.
   - Evidence: a dropdown plus a submit button per student (`GroupControls.tsx:42-45`), and the Worker accepts one `userId` per call (`index.ts:1029`). The page locks while each request runs (`ClassPage.tsx:211-214`). Seven groups of four means 28 rounds.
   - Severity: annoys a lot. Fix: a multi-select checklist (M), and "split the class into N groups" (M-L).

6. **A teacher's 50-world limit is shared across all classes, and the error tells them to ask their teacher**
   - Who and when: teachers with several sections, partway through the term.
   - Evidence: the database caps worlds at 50 per owner (`supabase/migrations/202609090003_brick_storage_quotas.sql:20`), and class and group worlds are owned by the teacher. The error says "Ask your teacher for help." (`index.ts:92,911`). The Worlds tab has no delete or archive (`WorldsTab.tsx:52-66`).
   - Severity: blocks. Fix: separate wording for teachers (S); let teachers archive or delete class worlds (M).

7. **Stopping chaos is class-wide, buried in Settings, and named three ways**
   - Who and when: the teacher during a messy shared build.
   - Evidence:
     - The header chip says "Collaboration open" but you can't tap it (`ClassPage.tsx:200`).
     - The switch is called "Building together" and needs Settings, then the switch, then a confirm (`SettingsTab.tsx:46-55,90-99`).
     - You can't lock just one world, or remove one student from a whole-class world (`GroupControls.tsx:35`). Suspending them is the only option.
   - Severity: confuses. Fix: make the chip a one-tap "Pause building" button with one name everywhere (S); a per-world lock (M).

8. **The shelf queue is invisible and hard to judge**
   - Who and when: teachers with "check first" turned on (the default).
   - Evidence:
     - The Shelf tab shows no count of waiting items (`ClassPage.tsx:213`).
     - "Peek" shows only how many scripts and the variable names, not the actual blocks (`ShelfTab.tsx:105-112`).
     - The shelf holds 100 items and students are told to "Ask your teacher to clear some space" (`index.ts:93`). Clearing means hiding, then deleting with a confirm, one item at a time (`ShelfTab.tsx:157,171`).
   - Severity: annoys. Fix: a waiting badge (S); bulk approve and clear (M); a read-only block preview (M).

9. **Turning off "Students can share" also shuts the shelf, without saying so**
   - Who and when: a teacher who only meant to stop world sharing.
   - Evidence: the shelf rejects students when sharing is off (`shelf.ts:67`), but the setting's description only mentions builds (`SettingsTab.tsx:57-64`).
   - Severity: confuses. Fix: say so in the description, or split it into two settings (S).

10. **"View class codes" goes to a tab with no code on it**
    - Who and when: the teacher looking for the code mid-lesson.
    - Evidence: the button (`RosterView.tsx:60,78`) opens Settings (`StudentsTab.tsx:75`), which only offers "New class code" (`SettingsTab.tsx:73-76`). The roster also says "enrollment code" while the rest says "class code".
    - Severity: annoys. Fix: scroll to the code card, and use one term (S).

11. **The sign-up form is heavy for 8-year-olds**
    - Who and when: every student on day one.
    - Evidence: 4 fields with 7 live rules, and the submit button stays disabled without saying why (`JoinPage.tsx:152,304`). Usernames must be unique across all schools (`index.ts:509`), so common names will often be taken (inference).
    - Severity: confuses. Fix: say what's still missing next to the button; suggest a free username automatically (M).

12. **A teacher on /worlds is told someone closed collaboration — with their own name**
    - Who and when: a teacher on /worlds after closing collaboration.
    - Evidence: `WorldsPage.tsx:409-410` shows "{teacherName} closed collaboration" and hides class worlds, even for the teacher. The class page says they can still review them (`WorldsTab.tsx:51`).
    - Severity: confuses. Fix: teacher-specific wording and keep the worlds listed (S).

Smaller things:
- The restore list shows "Revision 412 · date", which won't help a teacher pick the save from before things went wrong (`GroupControls.tsx:55`).
- `?demo=` only works in dev builds (`ClassPage.tsx:39`), so teachers have no way to try the app.
- Wrong-password lockout is 12 tries per 5 minutes per username (`index.ts:673,711`), and a teacher reset clears it (`index.ts:868`). That's fine.
- One school IP is allowed 600 sign-in requests per 10 minutes (`index.ts:650`). Several classes joining at once could hit that (inference).
- iPad and projector: the layout has breakpoints at 1080px and 700px (`class.css:296,310`). I found no evidence of tap-target problems.