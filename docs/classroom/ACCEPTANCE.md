# Release acceptance evidence

The goal remains active. Evidence applies to the candidate/environment named in each report; earlier passes do not certify a later deployment automatically.

| Requirement | Evidence available | Remaining release check |
| --- | --- | --- |
| Guest building, exploring, custom bricks, local drafts, import/export | QA.md actual browser guest flows | Public alias smoke after cutover |
| Class-code signup and returning username/password login | PROVIDER-STAGING-REPORT.json and QA.md | Public candidate smoke and actual students |
| Teacher Google sign-in using existing identity | GOOGLE-LOCAL-REPORT.json real Google flow, authoritative session, cold reload | Hosted final callback |
| Durable private My Worlds and recovery | HTTP provider report plus UI cloud saves, exact DB revisions and cold reload | Public candidate smoke |
| Private-world/account/class isolation | Provider tests and isolated SQL permissions; direct database access denied | Hosted permission-query version retest |
| Discoverable class/group collaboration | QA.md two browser clients, shared edits and teacher controls | Classroom-sized performance rerun |
| Rename, temporary password, forced replacement and suspension | QA.md actual browser controls; provider reset security report | Updated hosted active-reset regression |
| Class access and group removal revoke live access | Hosted live provider report and actual UI blocked views | Updated queue/batch version hosted retest |
| Durable concurrent edits and reconnect | Hosted live provider report, actual authoritative PG checks | Updated version retest and capacity run |
| Legacy creation retired; saved builds recoverable | LEGACY-RECOVERY.md, route tests, published remix UI and actual owner import/cold reload | Final hosted route smoke |
| Preserve production scenes and improve usability | Production-based branch plus browser scene/custom-brick checks; responsive header proof | Real Chromebook interaction |
| Affordable, scalable classroom behavior | COST-MODEL.md operation-delta byte measurement; permission RPC optimization | Capacity baseline failed; successful rerun required; real device/network observations remain |
| Reusable classroom identity boundary and bounded ClassChat proof | REUSABLE-BOUNDARY.md isolated committed real API/session/PG consumer | Full student SSO is outside this bounded pilot and is not claimed |
| Rover Lab preserved separately | codex/rover-lab-archive at production foundation | Preserve remote branch when pushing release |
| Exact release deployed with rollback identity | RELEASE-CUTOVER.md pre-release targets | Commit candidate, deploy and record immutable versions, verify public alias |
| Actual student classroom validation | Not yet obtained | User observations required; automation is not a substitute |

Do not mark the goal complete while production delivery, capacity verification, or actual classroom observations remain open.
