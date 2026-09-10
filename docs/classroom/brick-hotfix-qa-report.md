# Anonymous Build together hotfix QA — 2026-09-10

Candidate frontend: http://127.0.0.1:5185/ from /Users/ahmaadidrees/.codex/worktrees/brick-guest-hotfix, source00a90ff frozen by root. Backend staging version15de2174-9290-43e1-8903-8344db540d12. All browser contexts are isolated anonymous QA contexts; no real student mutations.

PASS:
1. Fresh Studio placed one brick, selected Build together, reached /live/new with no account prompt and current-build1brick seed selected.
2. UI creation with room name + builder name succeeded; owner loaded seeded room.
3. Share→Copy invite supplied clean /live/<32hex> URL without owner fragment. Clipboard write captured via test shim because headless clipboard read permission denied; exact payload checked.
4. Second anonymous browser joined using builder name only, saw same seed, both clients displayed2people.
5. Owner and guest each added a different colored brick; complete document snapshots identical,3bricks.
6. Owner switched Explore; guest entered Explore with Respawn available; guest Build/Explore controls disabled.
7. Owner closed room to newpeople; guest saw locked state and no owner lockcontrol.
8. Existing guest reloaded; name-prefilled joinform offered; Join succeeded while locked and retained Explore + exact3brick document equalowner.
9. Fresh third context blocked at 'This room is closed to new joins'.
10. Protected new QA classroom sharedworld50f5ff0c-a074-4483-89b1-99711fb770f0: unsigned browser fetch and directNode GET /worlds/<32hex> + /connect both401 with JSON code sign_in_required; no document leaked. Browser /live/<32hex> prompts classroom auth.
11. Owner and guest pageerrors empty in sampled happyflow.

Evidence screenshots:
- /tmp/brick-hotfix-qa-create-guest.png
- /tmp/brick-hotfix-qa-guest-explore.png
- /tmp/brick-hotfix-qa-reconnected.png
- /tmp/brick-hotfix-qa-newcomer-locked.png
- /tmp/brick-hotfix-qa-classroom-signin-required.png
Data: /tmp/brick-hotfix-qa-synced-document.json, /tmp/brick-hotfix-protected-qa.json.

Limits: staged provider plus local rendered UI proof; does not certify production alias, schoolChromebook GPU, classroomNAT load, or realstudentacceptance. Refresh intentionally offers saved-name Join form rather than automatic rejoin. Root handles deployment verification.
