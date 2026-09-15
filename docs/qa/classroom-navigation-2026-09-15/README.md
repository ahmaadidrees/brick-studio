# Classroom navigation release — 2026-09-15

Product commit: `47929b9b8789bd1532a1b31a6ec6033cbc88c2b6`.
Frontend: `dpl_YjwnSSYBpGaBX2A2aiUdcxiEwqL5`, https://virtual-legos-9ji2h3yto-ahmaadidrees-projects.vercel.app.
Production Worker: `01203a37-cf07-4db0-bff8-6aa79351b4c5`.
Promoted to brickgineers.com and virtual-legos.vercel.app after candidate verification.

## Changes

Visible Sign in / My Class entry; separate landing teacher login; teacher sign-in opens class management. Student invitation links and locally generated QR codes prefill class context. Recognized class codes collapse to a class name with an edit option. Teacher invitations are visible above class sections, with a direct roster password-reset shortcut. Existing codes, guest building, and account/session policies remain compatible. Persistent login across browser closure is deferred.

The additive, rate-limited public class lookup returns only a class name and enrollment availability. No database migration.

## Verification

- Full check passed: 1,088 frontend tests and 133 Worker tests, typechecks, build.
- After final UI changes and two added invite tests: 143 focused tests passed; final production build passed.
- Hosted candidate against production backend: synthetic six-character student enrollment, retained fields, remembered class, cold login and nonempty saved-world equality against authoritative database.
- Teacher dashboard, invitation QR/link, reset-password focus, mobile invitation lookup verified. Teacher session was seeded with synthetic credentials; real Google OAuth was not exercised end-to-end.
- Synthetic students were suspended and fixture class enrollment/collaboration closed afterward.
- Candidate screenshots reviewed at mobile size. Browser checks are not physical Chromebook certification.
- See candidate/results.json and public-smoke.json for candidate and promoted-domain evidence. Public smoke checks exact asset, student entry, guest exit, and uncaught page errors.

## Rollback

Previous frontend: `dpl_9kpgCqod38a7mxbjsqfAkHa5om1m`, https://virtual-legos-lgb76glns-ahmaadidrees-projects.vercel.app (selection-outline release, e80c3c9).
Prefer frontend-only rollback; new Worker endpoint is additive. Previous Worker: `bea31845-904d-4036-886b-efcd2958d03f`.
