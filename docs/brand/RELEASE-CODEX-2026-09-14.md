# Brickgineers release — independently verified and deployed

Production: **https://brickgineers.com**. Completed September14,2026 Pacific (September15 UTC).

Product source `dfe3496493fec47ad3cb076cf3093b56c3d7039e`, branch `claude/brickgineers-brand`. Later commits contain evidence only. Frontend `dpl_5yzfL3EuLRcuj9iW7RH9LtpnNjVX`, immutable https://virtual-legos-923a42tph-ahmaadidrees-projects.vercel.app. Production Worker `c5da8fcb-a7c3-4deb-aec9-32b7bf1698fb`; staging `01b230d6-11c1-4a9b-a0ab-3b7828db83e9`.

## Visual review and improvements

Compared approved direction I and the16surface boards in the product-refinement branding package against actual browser renders. Seven file-disjoint workers supported review/polish, followed by sequential integration and release checks.

- Landing: closer mock proportions, larger lockup, white surfaces, compact sections, clear guest/classroom calls to action.
- Real Toy Room: sunset window in view, vivid castle composition, gold lamp with warm underside and matching light direction; actual captured runtime assets replace the distant empty-wall hero.
- Editor: prominent Explore transition, framed utilities, lighter brick tiles, simpler gesture hint, visible mobile creative labels, floating Settings card.
- Character studio: wide preview/customization/outfits workspace, actual small3Dstage, responsive mobile layout. Historical figure-like drawings replaced with accurate runtime portraits.
- Custom parts/color: tall preview, wider workspace, hue ring and saturation/value square with keyboard sliders retained.
- Account/live entry: consistent brand, readable cards, authentic scene illustrations, compact classroom controls.

The implementation deliberately uses working3Dmodels and honest application data. It is not pixel-identical to the illustrative mock: real scene/model detail and freely movable camera composition differ; world cards have no invented build thumbnails; saved outfit cards show palettes; marketing/teacher information shares one long page; file replacement still uses native confirmation. The runtime palette/composition and layouts were iterated materially closer rather than covering the editor with a flat mock.

## Bugs found and fixed during verification

1. Portrait framing could place restored builds entirely behind opaque fog. Build fog/clipping now follow document bounds, while Explore restores original atmosphere. The250-brick mobile fixture visibly renders.
2. Guest labels could claim a completed browser save without observing a successful write. They now say “This browser only”; storage failure messaging remains available.
3. Personal Manage requested unsupported membership data and blocked checkpoint recovery. It now loads personal checkpoints correctly.
4. Teacher world listing exceeded the Worker subrequest ceiling at24classes. Authorized class/code/world queries are batched and provider result pages preserved. Student closed-class/group and personal-world privacy checks remain enforced.60-class tests verify bounded requests.
5. A world-list failure blocked otherwise available class controls. Successful lists now remain usable while the error is shown.

## Independent verification

| Scope | Result |
|---|---|
| Node22 `npm run check` on final product source | 1081frontend tests,126worker tests, core/worker typechecks and production build passed |
| Strict responsive matrix | 275/275;22creative and8final-media rechecks. See `qa/codex/editor-visual-verification.md` for integration-run SHA provenance |
| Document compatibility | Schema2, schema3, legacy1 import/export/reload/Home→Continue equality3/3 |
| Staging provider | 11API and6authenticated socket checks, authoritative DB readback; exact fixture cleanup verified |
| Hosted account browser | 9scoped checks: enrollment, nonempty save/coldopen, personal checkpoints, teacher username/temp-password and forced replacement |
| Teacher many-class regression | Actual24classes/18worlds now200, IDs equal authoritative authorized rows; student's personalworld still denied toteacher |
| Guest collaboration | 9steps each on staging-local, hosted preview, immutable production candidate, and new-domain owner/old-domain peer; exports equal authoritative document; cold rejoin matches; test rooms locked afterward |
| New-domain production accounts | 4/4: healthy teacherlists, nonempty student save, cold browser exactDB equality, old-host account reopen equality; syntheticstudent suspended/classclosed afterward |
| Google teacher sign-in | Real Chrome roundtrip from brickgineers.com through Google/Supabase back to authenticated teacher MyWorlds; no real classroom records changed |
| Guest domain migration | Old-host export/reload, separate new-origin storage, new-host import/reload full equality; oldhost stays available |
| Scene/performance smoke | Maximum64×64×192 custompart on128plate validates; all3Explore scenes spawn/travel/return with no pageerrors. RAFp95~16.7–16.8ms on M5Max, not GPU or physicalChromebook certification |
| Production transfer | Landing168KB measured, no editor/physics eagerly loaded; actual network timing totals in `qa/codex/production-transfer.json` |
| Production visual smoke | Desktop1366×768 and phone390×844 landing: no pageerrors or horizontal overflow |

Evidence lives in `docs/brand/qa/codex`. All account mutations used dedicated synthetic fixtures. Scope-limited error inspection returned no Vercel entries or self-IP Worker error events; this is not ongoing monitoring or an assurance about all traffic.

## Domain and operational behavior

- Apex serves the reviewed production artifact. `www` returns308 to apex preserving path/query; valid HTTPS verified after certificate issuance.
- `virtual-legos.vercel.app` continues serving the app without a forced redirect. Old browser drafts, preferences and owner sessions remain accessible there.
- Legacy landing explains export/import or account-save migration. Files do not transfer preferences, outfit collections or live-room ownership.
- Shared exact-origin policy admits apex/www and legacy/recognized previews, rejecting deceptive hosts, public HTTP/ports and opaque origins. New-domain/legacy HTTP preflights and Google-start verified.
- Supabase callbacks were added without removing other projects' redirects or changing its global Site URL. Google provider callbacks/scopes stayed unchanged.
- Existing Vercel project `virtual-legos` retained; Node setting aligned to22.x. No storage keys, schemas, IDs, databases or Worker bindings renamed.

Privacy remains a factual product summary, explicitly not a complete policy; responsible-party/support/retention decisions still need the operator before a wider public launch. Physical student/Chromebook acceptance remains a separate real-device pass.

## Rollback

Previous compatible frontend: `dpl_7TRb3UJpviAGr4k6e1agzdbAcfN5`, https://virtual-legos-m41egxddv-ahmaadidrees-projects.vercel.app. Prefer frontend rollback while retaining additive origin support and the tested batching fix. Do not revert Worker/schema support or overwrite shared Supabase configuration. Preserve both origins' draft access.
