# Release acceptance evidence

The goal remains active. Evidence applies to the candidate/environment named in each report; earlier passes do not certify a later deployment automatically.

| Requirement | Evidence available | Remaining release check |
| --- | --- | --- |
| Guest building, exploring, custom bricks, local drafts, import/export | QA.md actual browser guest flows | Public alias verified; actual device feedback pending |
| Class-code signup and returning username/password login | PROVIDER-STAGING-REPORT.json and QA.md | Production passed; actual students pending |
| Teacher Google sign-in using existing identity | GOOGLE-LOCAL-REPORT.json real Google flow, authoritative session, cold reload | Public Google login passed; guest draft preserved |
| Durable private My Worlds and recovery | HTTP provider report plus UI cloud saves, exact DB revisions and cold reload | Production browser / PostgreSQL / cold reload passed |
| Private-world/account/class isolation | Provider tests and isolated SQL permissions; direct database access denied | Production provider checks passed |
| Discoverable class/group collaboration | QA.md two browser clients, shared edits and teacher controls | 31-client / 60-edit hosted workload passed; real devices pending |
| Rename, temporary password, forced replacement and suspension | QA.md actual browser controls; provider reset security report | Production live reset regression passed |
| Class access and group removal revoke live access | Hosted live provider report and actual UI blocked views | Production live checks and actual group-removal UI passed |
| Durable concurrent edits and reconnect | Hosted live provider report, actual authoritative PG checks | Production live and staging capacity checks passed |
| Legacy creation retired; saved builds recoverable | LEGACY-RECOVERY.md, route tests, published remix UI and actual owner import/cold reload | Hosted provider route checks passed |
| Preserve production scenes and improve usability | Production-based branch plus browser scene/custom-brick checks; responsive header proof | Real Chromebook interaction |
| Affordable, scalable classroom behavior | COST-MODEL.md operation-delta byte measurement; permission RPC optimization | Capacity retest passed; real device/network and billing observations remain |
| Reusable classroom identity boundary and bounded ClassChat proof | REUSABLE-BOUNDARY.md isolated committed real API/session/PG consumer | Full student SSO is outside this bounded pilot and is not claimed |
| Rover Lab preserved separately | codex/rover-lab-archive at production foundation | Archive branch pushed at c278ebe |
| Exact release deployed with rollback identity | RELEASE-CUTOVER.md pre-release targets | Deployed source 49821fa; exact production identities and alias verified |
| Actual student classroom validation | Not yet obtained | User observations required; automation is not a substitute |

Production delivery and automated capacity verification are complete. Do not mark the goal complete until actual classroom observations are obtained and assessed.
