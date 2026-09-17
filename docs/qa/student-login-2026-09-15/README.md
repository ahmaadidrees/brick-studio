# Student login release — September 15, 2026

Product branch: `codex/student-login-polish`. Base `06a1bbb` (released brand source plus research documents). Main implementation `5b7b9bf`; final product source `a2629ee` fixes the remembered-return-code/new-enrollment edge case. Robotics and the separate landing-simplification worktrees were not changed or included.

## Changes

- Student login is the landing header account action; a Sign in / Create account switch replaces the mixed Student / Join a class / Teacher switch. Teacher Google/password entry is separate. Redundant student-mode links were removed.
- Successful student login/registration remembers only class name and stable return code in versioned local storage. Username, password and session persistence were not expanded. A returning student can change class explicitly.
- Typed student details survive switching forms. Remembered return codes are cleared when choosing Create account, because they are not enrollment invitations. Returning to Sign in restores the remembered class when no replacement code was typed.
- Class-code terminology is consistent on student forms. Code case and surrounding whitespace, and username surrounding whitespace, are normalized without changing passwords.
- Student classroom entry lands in My Class; My Worlds remains adjacent. Save-specific intent is preserved.
- Six-character student passwords work for registration, login, teacher temporary reset and forced replacement. New passwords reject a small common-password list, repeated characters and the username. Existing sign-ins do not apply new-password block rules. Teacher email/password validation remains 8–128 and Google is unchanged.
- Login rate limits group all class-code aliases into the same class/username bucket. No SQL migration or Supabase setting change was required.

## Evidence and provenance

- Full Node22 check on `5b7b9bf` product source: 1,084 frontend tests, 129 Worker tests, core/Worker typechecks, production build. The initial new Worker test mock needed a type correction; final full check passed.
- Final `a2629ee` form-only edge fix: all 76 ClassroomPanel tests and the production build/typecheck passed.
- `provider-staging.json`: 12 hosted checks using six-character student passwords, including save/DB equality, private-world denial, cold login, reset/revocation/replacement, rename/ownership, and closed enrollment with returning login still allowed. Synthetic accounts suspended and classes closed.
- `browser/`: actual local frontend + hosted staging, registration through the form, remembered class, mobile layouts and guest/teacher entry. Cold browser saved-world download exactly equals the authoritative DB document.
- `candidate/`: the same four browser checks on initial immutable production-target frontend `dpl_CKfw4Tok8JxBQXFHAX3w3Uji92qU` and production Worker.
- `production/`: the same checks on brickgineers.com after the initial promotion.
- `final-candidate/`: repeats hosted browser checks on the final immutable frontend, additionally proving remembered return codes are not reused for enrollment.
- Screenshots cover 1366, 1024, 390 and 320px. Animations are completed for captures. No browser page errors in successful runs. This is desktop Chrome and mobile viewport emulation, not physical student/Chromebook acceptance.
- First browser fixture used an invalid hyphenated part ID; corrected to the actual `brick_2x4`. First unpromoted deployment check reached Vercel protection, not the app. Subsequent checks used an existing automation credential scoped only to the exact frontend origin; no protection setting was disabled.
- Vercel build used explicit Node22 because the host's default Node executable has a missing shared-library dependency. Vercel's npm install rewrote lockfile metadata without changing package versions/packages; that metadata-only rewrite was restored.

## Deployments

- Staging Worker: `4eb39cad-51bd-4f8f-a0c3-5d77bba1ffb0`.
- Production Worker: `25338c36-785e-4ae8-b874-a8d1b747a1da`.
- Final frontend: `dpl_D4dsoMoGCxQniDEfEstGACPBCkPU`, https://virtual-legos-h0sg49g4b-ahmaadidrees-projects.vercel.app.
- Public-domain promotion status and final public readback are recorded in `public-release.json`.
- Scope-limited Vercel error query returned no entries after the initial promotion. Successful browser runs had no page errors; this is not ongoing monitoring of all traffic.

## Rollback / later integration

The previous brand frontend is `dpl_5yzfL3EuLRcuj9iW7RH9LtpnNjVX` (https://virtual-legos-923a42tph-ahmaadidrees-projects.vercel.app). If reverting the UI, retain six-character backend login support so newly created student accounts are not locked out. Retain the alias rate-limit fix. No database rollback is needed.

A future robotics or landing release must integrate these production login changes before deployment; their isolated branches predate this pass. Permanent sign-in across tab/browser restarts is intentionally deferred. The stored class preference removes a field, not authentication.
