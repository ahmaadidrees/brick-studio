# UI lane handoff — updated integration

Worktree /Users/ahmaadidrees/.codex/worktrees/brick-classroom-release. Full implementation authorized. No commits yet; files shared with other workers.

## Implemented
- src/classroom/ClassroomPanel.tsx + CSS: guest-first signup/login/teacherlogin, forced password reset; My Worlds create/open/duplicate/rename; My Class create/access toggles/code rotation, student rename/manual or generated temp password/suspension; group add/remove, checkpoint restoration. Backend response contracts confirmed. Signout flushes first, then clears session. World metadata mutations sync active cloud world.
- StudioMenu.tsx: new Save/My Worlds/My Class callbacks; Publish and Rover menu entries removed.
- BrickStudioApp.tsx: visible class/world entries, modal, disabled builder shortcuts while modal; complete-document cloud integration; active-world save status and recovery/download/retry/reload; no old Publish creation or Start Race button; custom brick existingCount propagated. Signed account New Build detaches from cloud before blanking.
- main.tsx: Rover and old race routes removed; legacy published reader retained.
- useClassroomWorld.ts: account-bound session resume after authorizedGET; synchronous global guest-autosave guard, complete latestguest persistence beforecloud switch; active private cloud world suppresses localautosave; signout/account switch restoresguest whileguardheld; scoped recovery and unload pendingwarning. Reload/restore requires user review and exportrecovercopy.
- cloudAutosave.ts + client.ts authored initially but now QA/security owns fixes: CAS serialized saves, safe recovery, authrefresh/sessionepoch/account switches. Do not overwrite their latest changes.
- LiveWorldPage.tsx now exclusively document_integrity agent; auth/tickets/4003 gating and tests landed.

## Validation
`npx vitest run src/brick/BrickStudioApp.test.tsx src/classroom --reporter=dot`:64pass before QAadded2hooktests. QA reports client9/controller4/hook2 passing. App TS passes. React checklist reviewed: hooks unconditional, modal focus trap/Escape, explicit labels, parallel independent lists, serverack only success states. Root owns browser/service verification.

## Remaining
Root browser walkthrough and any discovered fixes; actualclassroom/login/configvalidation. UI polish optional after functional evidence. No teacher live credentials were reset or invented. Teacher login existingprovideraccount only. Keep frontend private documents out of gueststorage; modifications to hook transitions need tests.

## Google teacher sign-in (latest)
User confirmed Google teacher login. Added client.startGoogleTeacher/finishGoogleTeacher with tab-scoped PKCE/state, 10-minute expiration, account-context guard, and same-origin return path. security_review worker backend contract /auth/teacher-google-start and /auth/teacher-google. TeacherGoogleCallback route wired in main; immediately strips callback query, exchanges through backend, returns original MyClass/MyWorlds/Save intent. Guest complete document saved before redirect from root editor. No provider tokens in URL. Teacher email/password fallback retained; student flow unchanged. Root configured actual Supabase callback allowlist and owns browser auth validation. Tests:23classroom tests pass including3Google PKCE cases; frontend tsc passes. googleTeacher.test.ts uses a scoped TS expected-error for Node crypto import since application DOM timer types must not gain Node globals.
