# Classroom release checkpoint — September 9, 2026

## Compatibility follow-up — deployed

Current public frontend is **dpl_3heqnPcAsVum67TfYfdqDzc7xDYk**, source **7d9be23**, immutable `https://virtual-legos-ph98pn62i-ahmaadidrees-projects.vercel.app`. This supersedes the initial frontend identity below. Worker remains **a1c904e1-3709-41f8-a4de-5ac03dc5c3cd**, source49821fa. Node22 CI exposed ArrayBuffer chunk incompatibility in legacy gzip streams; typed-array chunks fixed both fixture and decoder. All699 tests, types and build passed locally under Node22 and GitHub CI run34382956499. Chrome opened the compressed legacy fixture on the immutable candidate. Public alias promotion was verified. Other classroom runtime code is unchanged; earlier classroom evidence remains scoped to its recorded artifact.


The classroom release is deployed at https://virtual-legos.vercel.app. The goal remains active pending actual student and Chromebook observations.

Use `/Users/ahmaadidrees/.codex/worktrees/brick-classroom-release`, branch `codex/classroom-release`. Deployed application source is **49821fa**; later verification/document commits do not change that runtime identity. Both this branch and `codex/rover-lab-archive` (c278ebe) are pushed. GitHub authentication succeeded.

Production frontend: **dpl_Fuz3vcfibrTWT5hubY5QYkGA3SW6**, immutable `https://virtual-legos-g6gwe9kda-ahmaadidrees-projects.vercel.app`. Production Worker: **a1c904e1-3709-41f8-a4de-5ac03dc5c3cd**. The public alias resolves to this frontend. Persistent production and preview backend environment URLs were verified. See `PRODUCTION-RELEASE.json` and `RELEASE-CUTOVER.md` for exact identities and rollback limitations.

Production verification passed 11 HTTP/provider checks and six live collaboration checks. Actual two-browser edits were confirmed in PostgreSQL and after cold reload. Teacher removal from a group blocked the student canvas while preserving the document. Public Google teacher login preserved the existing eight-brick guest draft. See `QA.md` and production reports.

The final staging capacity workload passed with 31 clients, 60/60 edits, authoritative PostgreSQL persistence, all-client convergence, zero socket errors and zero cleanup failures. Median acknowledgment was 562.46ms and p95 926.19ms at 2Hz poses. This does not establish real Chromebook frame rate or sustained full-class performance. Baseline and transport/fixture failures remain separate evidence. See `CAPACITY-STAGING-RETEST-REPORT.json`.

Supabase project `wfrvgbnmyenidlpmimhl` remains the existing ClassChat V2 project. Migrations 001–005 were applied additively; never rewrite or blindly rerun them. Private ignored credential files must not be printed or committed. Never reset the actual teacher password. Personal Chrome is ahmaadidrees@gmail.com.

The isolated ClassChat identity pilot is committed as **1a7848c** in `/Users/ahmaadidrees/.codex/worktrees/classchat-identity-pilot`, default off and not deployed to ClassChat production. Fourteen tests and five actual API/session/PostgreSQL checks passed; full student SSO and shared resets are not claimed.

Next: collect the already-requested two-student save/reopen/shared-world observations and device details; investigate any reported issues before closing the goal. `TEACHER-PILOT.md` provides the walkthrough.
