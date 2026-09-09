# Hosted outer Worker boundary verification

Observed 2026-09-09, 09:04–09:05 PDT against `https://brick-studio-multiplayer-staging.brick-studio-race-worker.workers.dev` using Node fetch. Deployment version was not exposed in responses; correlate this time with root's deployment log. No production alias tested.

| Probe | Observed result |
| --- | --- |
| Anonymous POST /worlds | 410 legacy_collaboration_retired |
| Anonymous POST /rooms | 410 legacy_collaboration_retired |
| Public /internal/classroom-invalidate with forged init header | 404 not_found |
| GET world with forged x-classroom-access, no bearer | 401 sign_in_required |
| Connect with forged identity header and invalid ticket | 401 invalid_live_ticket |
| Request from hostile Origin | 403 origin_not_allowed, no CORS allowance |
| Valid application Origin OPTIONS | 204; GET/POST/PUT/PATCH/DELETE/OPTIONS; content-type and authorization allowed |
| Dedicated fixture teacher login | 200, teacher role |
| Authenticated fixture world list | 200, four worlds; valid application origin reflected |
| Authenticated shared-world live ticket | 200, ticket present, expiresIn 60 |
| Authenticated GET compact live world ID | 200, revision 3, document present |
| Valid signed ticket against another world | 403 wrong_world |

All app-level responses checked were Cache-Control no-store. Python urllib's default User-Agent was blocked by the Cloudflare edge with error 1010; it did not reach Worker routing and was not counted as application authorization proof. Node fetch reached the Worker successfully.

Local source verification at the same checkpoint: worker source and test TypeScript pass; eleven targeted classroomRoutes tests pass. These cover ticket tampering/expiration/misconfiguration, canonical IDs, origin rules, legacy retirement, trusted-header/capability stripping, wrong-world rejection, and awaiting live invalidation before reporting control success.

This check used a new dedicated teacher test session without resetting/logging out other sessions or altering fixture documents, members, or class controls. Ticket issuance initializes the existing fixture's live DO when needed. Two-client behavior, authoritative concurrent writes, real student/Chromebook acceptance, and deployment identity remain separate evidence.
