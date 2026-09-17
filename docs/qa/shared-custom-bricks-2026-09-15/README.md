# Shared custom brick creation — production release

Product SHA: a322f70, branch codex/shared-custom-bricks.
Frontend: dpl_tSUvRHwoWWY4THm5c77Gqek4bcQW, https://virtual-legos-iht907nlp-ahmaadidrees-projects.vercel.app.
Worker: bea31845-904d-4036-886b-efcd2958d03f.
Both brickgineers.com and virtual-legos.vercel.app serve /assets/index-CKr5-IbW.js.

Any connected builder can add a custom part in Build while caught up. Additions validate and append against the authoritative document, preserving current bricks/metadata and concurrent parts. Existing definitions cannot be overwritten. Classroom authorization, read-only rejection, schema compatibility, size/count limits, deduplication and mutation rate limits remain enforced. Full document replacement and resizing still require owner authority. Uses existing snapshot messages so older clients can receive definitions.

Validation: 1,088 frontend tests, 132 Worker tests, Worker/test typechecks and final production TypeScript/Vite build passed. New tests cover concurrent non-owner additions, duplicate ID rejection, invalid sizes, cap, retry deduplication, and client pending-part rebase. Two isolated Chrome contexts verified simultaneous non-owner creation, convergence of both catalogs, placement of another participant's part, authoritative server document and cold reload. Passed local/staging and public production; JSON/screenshots alongside this file. No real student data used; synthetic guest rooms follow normal room lifecycle. Not a classroom-scale load or physical device test.

Rollback: frontend dpl_DhGkhjicqb3so4QMmpvJSDcd1Fou, backend82b03692-0bff-4850-91b6-7026ea6d8ed6. Prefer frontend-only rollback first because prior UI remains compatible with the additive backend API.
