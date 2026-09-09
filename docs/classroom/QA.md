# Classroom release acceptance record

Updated 2026-09-09, release worktree `codex/classroom-release` based on `c278ebe`.
This is an in-progress shared working tree. Test counts below describe the sampled
working state, not an immutable deployment or a release approval.

## Current evidence

- 08:48 PDT: frontend Vitest: **59 files, 609 tests passed**.
- 08:49 PDT: worker Vitest: **31 passed, 1 failed**. Classroom admission fixture
  expected101 and received403 at `test/worldRoom.test.ts:755`. Integrity owner
  confirmed fresh access revalidation was being integrated and is updating fixture.
- Core TypeScript passed. Worker TypeScript was temporarily blocked by missing
  `revalidateClassroomWorldAccess` export and possibly undefined access at
  `worldRoom.ts:448`; reported to integration owners.
- Frontend `npm run build` passed. Largest generated chunks were Rapier (~2.24MB
  minified,842KB gzip) and renderer (~878KB minified,233KB gzip). This measures
  transfer artifacts only, not Chromebook responsiveness or memory.
- No browser, real-provider persistence, live deployment, classroom throughput, or
  actual student acceptance has been established by this QA record yet.

## Acceptance matrix

Use isolated test accounts and worlds. Never change an existing teacher password
or inspect unrelated student records. Record exact frontend deployment SHA/URL,
Worker version, Supabase project, browser versions and timestamps with each run.
Compare full validated document content including custom parts, scene, character,
metadata and revision; screenshots or a Saved label alone are insufficient.

| Area | Concrete exercise | Required evidence | Status |
|---|---|---|---|
| Guest | Fresh browser builds/undoes/redoes/explores without account, reloads local draft | UI actions and cold refresh retain complete document | Pending |
| Guest import/export | Export customized scene/custom brick, start new, import, undo and redo | Downloaded JSON equals restored document, custom geometry/metadata survive | Pending |
| Local corruption | Seed malformed draft, load then edit; simulate quota failure | Original quarantined or retained; no silent destruction | Unit coverage; browser pending |
| Registration | Enrollment code + username/password + roster name; duplicate mixed-case username | Real Auth UUID and class-bound row; helpful duplicate error; no email requirement | Pending provider |
| Returning login | Log out, use stable login code; teacher rotates enrollment code | Existing account still logs in; old signup code rejected for new enrollment | Pending provider |
| Reset | Teacher sets temporary password while student has two sessions, then student changes password | Both old sessions/refresh and live sockets denied; temp session restricted; same password rejected; new login works | Pending provider |
| Rename | Teacher renames username while account owns personal/group work | Old login name fails, new name works, same UUID/world ownership/contributions | Pending provider |
| Access | Suspend/reactivate student; close enrollment separately from collaboration | Enrollment close preserves existing access; collaboration close ejects classroom clients but preserves personal data; resume restores permitted access | Pending provider |
| Personal cloud | Guest saves private world, new browser logs in and opens it | Browser → API → authoritative DB document/revision → cold reload match | Pending provider |
| Session isolation | Sign out/switch account during pending save/read; shared-device refresh | Prior account cloud doc/token never exposed or saved into guest/new account draft | Pending browser/provider |
| Save failure | Offline/500/token expiry during autosave, recover later | Unsaved/retry/recovery visible; account-scoped recovery copy; no false Saved state | Pending browser/provider |
| Concurrent save | Same private world in two sessions; simultaneous writes at same revision | Exactly one CAS accepts, other conflicts and retains local work; no silent overwrite | Pending provider |
| Class discovery | Teacher creates class world, student enters My Class | Appropriate world visible/joinable without sharing a URL; outsider list/read denied | Pending provider |
| Group membership | Teacher adds then removes student with open socket | Only members discover/join; removal revokes before success, existing contributions preserved; copied URL cannot rejoin | Pending provider |
| Live editing | Two browsers simultaneously build/undo/customize; disconnect/reconnect | Server-authoritative accepted revisions, identical final document, reconnect has no duplicate/lost accepted edit | Pending browser/provider |
| Restore | Teacher restores checkpoint while members edit, then cold reopen | Serialized/conflict-safe transition; UI, DO and PG agree; pre-restore checkpoint retained | Pending provider |
| Authorization | Guess other class/private IDs, forge identity headers/role, use old tickets | Server denies cross-user access; no direct anon/authenticated brick table/RPC permissions | Pending provider |
| Legacy recovery | Open existing encoded published build and recover into editor | Full build recoverable; old Publish/Race creation absent; recovered import does not silently destroy draft | Pending browser |
| Production scenes | Compare available scenes/customizer and Build/Explore route | Production catalog remains usable; screenshot + actual interaction | Pending browser |
| Classroom load | One actual class joins behind same NAT within lesson window | Signup/login/save/connect latency and errors, observed rate limits; no synthetic success claims | Pending students |
| Target hardware | Weak school Chromebook, representative custom world, two peers | Device/model/browser, load time, frame responsiveness, memory/disconnect observations | Pending students |
| Reuse | Bounded ClassChat adapter against same identity/class boundary | Explicit integration exercise without changing unrelated product Auth/data | Pending integration |

## Release gates

1. Repeat complete tests/typecheck/build after integration owners report readiness;
   capture commit and ensure test coverage still targets the new routes/controls.
2. Run browser and authoritative provider matrix on an immutable hosted candidate.
   Any local mock result stays labeled local/mock.
3. Promote the exact verified artifact and repeat critical auth/save/join checks on
   the public alias; record rollback target and backend compatibility.
4. Obtain teacher/student observations for classroom and target-device rows. Keep
   those gates open until observations exist, even if every automated check passes.

## Local browser evidence, 08:51–08:54 PDT

Vite process handle56890 at `http://127.0.0.1:5182/`; agent-browser session
`brick-release-qa` (Chromium controlled by agent-browser0.37.1). This samples the
in-progress working tree, not hosted release identity.

- Immediate startup inspection showed rendered 3D classic scene and interactive
  brick controls; no Vite error overlay, body contained1038 characters of UI.
  Screenshot `/tmp/brick-release-qa-start.png` visually inspected.
- Without any account, clicked Place Brick, created named custom brick `QA custom
  block`, placed it, Undo and Redo. Local authoritative draft contained two brick
  instances and the custom definition.
- Reloaded the page: two bricks and custom part remained; entered Explore and
  returned to Build through visible controls. Screenshot
  `/tmp/brick-release-qa-explore.png` captured.
- Export downloaded `/tmp/brick-release-qa-export.brickstudio.json`. Started New
  Build through confirmation and uploaded that exact exported file. Accepted
  replace confirmation; local draft regained original IDs, positions, colors,
  custom definition, classic environment and schema/library versions.
- This confirms local guest persistence/export/import flow. It does not establish
  cloud persistence, physical device performance, or classroom acceptance.

- Legacy uncompressed encoded `/world#…` fixture built from the actual exported
  custom world opened in published Explore view with Remix and no Start Race.
  Remix displayed a modal warning before replacing the existing guest draft;
  Cancel returned to reader. A second Remix + explicit Replace navigated to `/`
  and retained both brick instances plus `QA custom block` in the local document.
  This is a generated legacy-format fixture, not an inventory of every historical
  student link. Compressed v2 links still require browser verification.

## Account-switch and autosave regressions, 09:04 PDT

Client requests now bind the login context before their first fetch. A delayed A
response (success or401), refresh, or logout cannot retry A's body with B's token,
return A's payload to B, or clear B's session. Same-login parallel401 requests share
a refresh. Native fetch is invoked with the global receiver; root's actual browser
login exposed the receiver issue missed by ordinary mocks, and a receiver-sensitive
regression now covers it.

15 focused tests pass across client, cloud controller, and hook; app TypeScript
passes. Controller cases cover in-flight revision chaining, conflict retention
without silent retry/adopting the server revision, account switches, and disposal
not clearing a replacement controller's recovery. Hook tests exercise actual guest
autosave guard plus cloud attach/signout and delayed resume after account switch.
These are local deterministic regressions, not hosted account/persistence proof.

## Real-provider browser exercise, 09:09–09:24 PDT

Actual Chromium UI at local Vite5182 → local Worker8788 → existing Supabase
`wfrvgbnmyenidlpmimhl`. This is real provider persistence with local frontend/Worker,
not hosted candidate or actual student-device proof. Separate teacher and student
browser sessions were used; credentials were loaded privately from ignored fixture
configuration and never entered into source or this report.

- Teacher sign-in succeeded. Created `UI QA Sep9 0910` through UI, class
  `712e2874-0026-4cba-9f5a-c9a3e9a1a92c`. Minor UX findings sent to UI owner: new
  class did not automatically select itself; loading briefly claimed no classes.
- New browser guest placed a brick, then self-registered with displayed class code,
  selected username/password and private roster name. Test student UUID
  `533d646f-96a6-4d86-8bd4-e1e08579bc02`.
- Created and placed custom brick `Cloud QA custom`, saved through My Worlds form
  as `UI QA cloud custom`, world `dab7b7d2-fa1a-4f86-a4dd-5dc7b2d26909`.
  Reload restored account world. Placed another custom brick, observed Unsaved →
  Saved. Direct authoritative PG read confirmed revision2,3bricks,1custom definition.
  Signing out restored the guest2brick draft rather than overwriting it with cloud3.
- Returning student sign-in succeeded. Teacher created classwide
  `UI QA shared world`, UUID `f43e5276-e77e-42b9-a4c3-c39822e49745`. Both browsers
  joined through their My Class lists without exchanging links. People displayed2.
  Teacher placed stock2×4, student placed1×1 atop it; both UIs displayed2bricks.
  PG subsequently confirmed revision3 with both accepted contributions.
- Teacher clicked Close collaboration. Teacher live UI displayed
  `Classroom access changed. Rejoin from My Class.` PG confirmed collaboration
  closed and both contributions preserved. Student browser automation became
  unresponsive and eventually reported `Resource temporarily unavailable (os error
  35)` after daemon retries. Therefore student rendered revocation is NOT verified
  by this run; backend revocation evidence belongs to separate provider tests.
- Cleanup via authenticated classroom API confirmed enrollment=false,
  collaboration=false, and this test student suspended=true. Test worlds retained
  for evidence; no unrelated students/classes were changed.

Still required: hosted UI repetition, forced-password-reset and rename UI, group
member control UI, student rendered revocation in a responsive browser, cross-device
cold sign-in/open, physical Chromebook and classroom observations.

## Student revocation follow-up (integrity lane)

The prior student automation error was resolved by independent reproduction in fresh
agent-browser session `brick-revocation-proof` around09:19–09:21PDT. Actual student
login at local5182/API8788 entered the existing2brick shared world. Teacher API
class-close caused rendered `Classroom access changed`, with zero canvas elements;
`/tmp/brick-student-after-revoke.png` was visually verified by the integrity worker.
Fresh browser stayed responsive. Fixture class/student were closed/suspended again.
This establishes local-browser student class revocation; the original daemon os35
was an isolated automation observation failure, not reproduced product behavior.

## Teacher controls through actual UI, subsequent local-provider run

Reused only dedicated class712e2874-0026-4cba-9f5a-c9a3e9a1a92c and test student
533d646f-96a6-4d86-8bd4-e1e08579bc02. Fresh independent browser sessions
`brick-controls-proof` and `brick-controls-student`, frontend5182/API8788.

- Teacher Manage → Reactivate access succeeded. Teacher changed username from
  `ui_qa_student` to `ui_qa_renamed` through Save changes. Student logged in through
  UI using renamed username and unchanged password.
- Teacher manually filled Temporary password and saved. The old student session's
  next account request returned to sign-in; it could not retain account access.
- Temporary-password login rendered only forced New password/Repeat/Set/Sign out
  controls. Reusing the temporary password returned the explicit error requiring a
  different password. A different password succeeded and restored account sections.
- My Worlds still listed `UI QA cloud custom`; Open restored3bricks, proving rename
  and password reset preserved the same student's saved-world ownership.
- Teacher opened collaboration, created Assigned group `UI QA removable group`
  (f7c9a61a-41ce-4862-8f56-ccbe9e1522c8), opened World controls, and added the student
  using Add to group. Student discovered and joined through My Class and placed a
  stock brick.
- Teacher clicked Remove from group while student was live. Student rendered
  `Classroom access changed. Rejoin from My Class.` Screenshot
  `/tmp/brick-group-removal-student.png` captured and visually inspected. Reloading
  the same live URL ultimately rendered `Cannot open this classroom world / World
  not found.` PG inspection confirmed group revision2, the contributed brick
  preserved, and zero membership rows.
- Cleanup via authenticated classroom API confirmed enrollment/collaboration closed
  and test student suspended. Renamed fixture account and test-world evidence remain;
  private fixture password file was updated for authorized future QA.

These controls now have actual local UI → real-provider evidence. Hosted candidate
repetition and real teacher/student hardware observations remain separate gates.

## Immutable production frontend and production Worker browser proof

Verified `https://virtual-legos-g6gwe9kda-ahmaadidrees-projects.vercel.app/` with
production Worker `https://brick-studio-multiplayer.brick-studio-race-worker.workers.dev`
(versiona1c904e1-3709-41f8-a4de-5ac03dc5c3cd). Isolated browser contexts used an
owner-authorized Vercel CLI deployment-bypass cookie; no protection setting was
changed and no actual teacher Google account was used.

- Dedicated teacher password UI login succeeded. Created `Final production browser
  QA`, class8e61d6a0-3fbe-4cfc-87ce-40c28980304b, and shared class world
  66eb7193-a8f3-48ec-8da6-dacf8a4002bf through UI.
- Independent student context registered via displayed class code, then discovered
  and joined the same world through My Class. Student fixture UUID
  f3a41827-e087-4ea6-8374-f19b9633395e. Both UIs displayed People2.
- Teacher placed a brick; both rendered1brick. Student placed a second brick;
  teacher displayed2. Student cold reload retained2. Direct PG inspection matched
  revision3 and2brick instances. Screenshot `/tmp/brick-production-two-client.png`
  captured and visually inspected after first synchronized edit.
- For independent production group-revocation verification, teacher created Assigned
  group `Final production group removal`, world2eb16d48-4b05-473b-ad92-ef92c10afb54,
  added the fixture student through World controls, and student joined from My Class
  and placed a brick. Teacher Remove from group caused student to render
  `Classroom access changed. Rejoin from My Class.` and zero canvas elements.
  `/tmp/brick-production-group-removal.png` captured and visually inspected.
  PG retained revision2 and1brick, with zero group membership rows.
- Authenticated browser API cleanup confirmed enrollment/collaboration closed and
  fixture student suspended. Python urllib's production login returned403 whereas
  existing authenticated browser requests succeeded; no product authentication
  failure is inferred from that transport-specific result.

This is actual immutable frontend → production API/WebSocket → authoritative PG →
render/cold reload evidence using synthetic teacher/student accounts on one machine.
It does not certify actual classroom devices or student observations.
