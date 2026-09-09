# Classroom cutover record

Status: candidate verification in progress; production has not been promoted.

## Known pre-release rollback targets

- Frontend production alias: https://virtual-legos.vercel.app
- Frontend deployment: dpl_Hndb9jJ7XS6GnZmfG1HJk2LWiX8S
- Immutable frontend: https://virtual-legos-qd9i5i2fm-ahmaadidrees-projects.vercel.app
- Production Worker: brick-studio-multiplayer
- Previous Worker version: f4d8fab8-8441-4e84-95f1-dff34548bbfd
- Production source foundation: c278ebe

Recheck these identities immediately before cutover. The existing frontend expects the old anonymous APIs; rollback must consider frontend and Worker together. New classroom PostgreSQL tables and saved data must be preserved even if application code is rolled back. Do not undo additive migrations or delete Durable Object namespaces.

## Candidate evidence

- Provider HTTP and two-client persistence/revocation: PROVIDER-STAGING-REPORT.json and LIVE-PROVIDER-STAGING-REPORT.json.
- Current staging Worker after legacy recovery and capacity32 change: 89823e31-14bb-4433-a768-3aaa76903cc8. Teacher Google authentication is a subsequent change still being verified.
- Latest full check before capacity/Google additions:635frontend tests,55Worker tests, typechecks and production build passed. Capacity change subsequently passed55Worker tests.
- Actual browser matrix: QA.md. Student/device observations remain separate from automation.

## Cutover sequence

1. Finish Google teacher login, legacy owner recovery and representative hosted capacity verification. Commit the exact reviewed source and record its SHA.
2. Deploy and verify the candidate Worker with required secrets. Preserve old namespaces and migration history.
3. Build the exact frontend candidate with both public backend variables pointing at the intended production Worker. Prepare the production deployment without assigning the public domain; verify its immutable URL.
4. Promote that exact artifact, then cold-load the public alias and verify guest building, teacher sign-in, student sign-in, saved work and classroom discovery against the intended backend.
5. Record new immutable frontend ID, Worker version, source SHA and verification time here. Obtain actual student/Chromebook observations using TEACHER-PILOT.md.

The user authorized delivery and deployment. Production remains unchanged while candidate checks run; no additional approval gate was established.
