# Larger custom bricks

Published source `fa37938`: creator and resize limits now32×32studs and96plates (previously8×8 and12). Constants are shared with document validation. The existing schema and brick/world count budgets remain unchanged.

763frontend tests,65Worker tests, type checks, build, and exact-source GitHub CI34633929389 passed. The Worker regression creates a max-size brick, moves it, evicts the Durable Object, and verifies persisted content and fresh rejoin. Staging then production REST checks accepted/persisted the maximum and rejected each axis above its limit. Production Worker001938a8-3d4c-46be-9386-dce3c5d2eede was deployed before the frontend, preserving remote vars.

Hosted real UI max preview/create/place, two-browser guest export equality, cold reload/rejoin, and authoritative server document equality passed. A fresh public browser verified form limits and imported/rendered the maximum saved brick with zero page exceptions. Public alias resolves to dpl_5zyhpVh5SS7yUUfLpdSkrwaBqw97. QA rooms were closed to new entrants.

Refresh older shared-room tabs before using large definitions. An older frontend/backend validator rejects these larger documents, so rollback must retain expanded validation support once such work has been saved.

Evidence: /tmp/brick-larger-browser-report.json, /tmp/brick-larger-public-report.json, /tmp/brick-larger-production-backend.json, /tmp/brick-larger-public-placed.png.
