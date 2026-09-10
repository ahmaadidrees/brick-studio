# Production immutable anonymous collaboration smoke — 2026-09-10

Frontend https://virtual-legos-e1j2m3cin-ahmaadidrees-projects.vercel.app, source00a90ff; production Worker68ede359-0bbe-44db-a8d7-5e38a32c567d supplied by root. Rendered using two isolated anonymous agent-browser contexts with authorized preview protection cookies, no classroom accounts.

Passed:
- Create new room using only room and builder names.
- Copy invite emits clean roomURL without owner capability (clipboard write captured testshim; readpermission is unavailable headless).
- Second context joins with buildername only.
- Owner and guest place blue/red bricks through actual UI; each UIExport full JSON document identical2bricks.
- Owner Explore switch propagates to guest.
- Guest reload, saved-name Join, restored Explore and2bricks.
- Pageerrors empty in both contexts.
- Owner closes room to newpeople after QA.

Roomid d20ef332d96665e99c33efde66cc5ed8.
Artifacts:
- /tmp/brick-hotfix-prod-owner.brickstudio.json
- /tmp/brick-hotfix-prod-guest.brickstudio.json
- /tmp/brick-hotfix-prod-qa-owner.png
- /tmp/brick-hotfix-prod-qa-guest.png
- /tmp/brick-hotfix-prod-qa-reopened.png

Root handles aliaspromotion/identity; this proof describes productionbackend plus immutablefrontend beforepromotion, not the publicalias. Classroom protected anonymous denial tested separately in staging browser with app401 sign_in_required. No actualstudents/Chromebook/NATload tested.
