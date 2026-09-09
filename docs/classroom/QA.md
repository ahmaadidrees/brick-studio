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
