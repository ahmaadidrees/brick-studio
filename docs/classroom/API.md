# Brick Studio classroom API

All endpoints use `/classroom/`. JSON responses are `Cache-Control: no-store`.
The host Worker must apply its allowed-origin CORS policy including Authorization,
PATCH, PUT and DELETE. All routes except register/login/teacher-login/refresh require
`Authorization: Bearer <Supabase access token>`. Errors are
`{error,code,currentRevision?}` with meaningful 4xx/5xx status. Never log request
bodies for authentication routes or expose service credentials to the browser.

## Environment and migration

Required Worker secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`. Trusted teacher UUIDs only: `BRICK_TEACHER_IDS` comma-separated.
Existing Supabase teacher accounts remain unchanged. `auth/teacher-login` supports
an existing password account and explicitly registers its session. An arbitrary
provider bearer does not auto-register itself or resurrect a logged-out session.
Google-only teacher login requires a separately verified exchange flow before release.
No client-selected role, email address, or user metadata grants teacher authority.

Apply all numbered SQL files in `supabase/migrations/` in order to the selected
existing Supabase project. It creates only additive `public.brick_*` objects and
does not modify existing ClassChat tables or accounts. Product tables have RLS
enabled with no browser grants/policies; only the scoped Worker uses service-role
queries. New student credentials are stored by managed Supabase Auth using stable
internal email identifiers, never by Brick Studio password hashing.

Student accounts are class-bound in this first release. The generated internal
email is not a student contact address. Teachers can manage only students in their
own classes and cannot reset unrelated Supabase accounts. Stable user UUIDs own
worlds independently of username spelling. Personal worlds remain private to the
owner; teacher oversight applies to classroom/group worlds.

## Authentication

| Method/path | Body | Response |
|---|---|---|
| POST auth/register | `{classCode,username,password,rosterName}` | `{session,user,classes}` (201) |
| POST auth/login | `{username,password,classCode?}` | `{session,user,classes}` |
| POST auth/roster | `{classCode}` | `{name,canEnroll,showNames,students}` |
| POST auth/teacher-login | `{email,password}` | `{session,user,classes}` |
| POST auth/refresh | `{refreshToken}` | `{session,user,classes}` |
| POST auth/change-password | `{password}` | `{session,user,classes}` |
| POST auth/logout | `{}` | `{ok:true}` |
| GET me | — | `{user,classes}` |

Session shape: `{accessToken,refreshToken,expiresIn}`. User:
`{id,username,rosterName,role:'teacher'|'student',resetRequired}`. Username is 3–24
ASCII letters/numbers/underscore/hyphen, first character alphanumeric; uniqueness
is case-insensitive and global across every class (migration 202609170001). New student passwords are 6–128 characters and reject a small list of common passwords, repeated characters and the username. Existing student sign-in accepts 6–128 characters without applying new-password rules; teacher password sign-in remains 8–128. All codes for one class share the same per-account login attempt bucket. Roster name is private
to the student and teacher, max80. Temporary passwords must be changed to a different
password. Reset-required callers may access only me, change-password, and logout.
Refresh can maintain that restricted session but cannot clear the requirement.

Authentication uses verified Supabase `/user` plus a server-side session_id allowlist
whose auth_version must match the student. Only successful password sign-in registers
a session. A stale provider refresh cannot register itself or acquire a new version.
Reset and suspension advance auth_version, invalidating product access immediately.
Teacher reset also changes managed Auth credentials and globally signs out provider
sessions through a server-only login with the temporary password. Existing passwords
and reset values are never recorded in the audit log.

Password mutations (including teacher changes) hold an atomic per-student database
lease, preventing competing managed-Auth writes. Requests time out after15seconds;
the operation stops issuing requests after120seconds, below the5minute lease.
Uncertain provider failures retain the lease until expiry. Product sign-in checks
the lease and account version before registering a session, so an old password
cannot gain a new-version session during a reset. Teacher provider sessions have
their own explicit allowlist and revocation record.

Enrollment codes are case-insensitive. Rotating a code disables that code for signup
but retains it as a login alias for existing students. `loginCode` is a stable class
identifier for returning login. Teachers alone receive the active enrollment `code`.
Registration is allowed only while enrollment is open. Account-level login throttles
are tighter than the generous school-NAT IP throttle; limits live in Postgres rather
than a process-local map. Supabase's own provider abuse limits also apply and require
real classroom-NAT validation before launch.

## Username-only sign-in and the join-screen roster

Usernames are unique across all classes (`brick_students(username_key)` unique index), so
`POST auth/login` needs only `{username,password}`. Without a `classCode` the student is
resolved by `username_key` alone; a missing username and a wrong password both answer
401 `invalid_credentials` and share one rate bucket keyed by the username. If the database
ever holds two rows for one username the route answers 409 `class_code_required`; a supplied
`classCode` scopes the lookup to that class (and keeps the per-class bucket) exactly as before.

Registration and teacher username edits check the username globally. A taken name answers
409 `username_taken` with `suggestions: string[]`: three free variants (digits or `_digits`
appended within the 24-character limit) checked against the database.

`POST auth/roster` `{classCode}` is public and shares the IP bucket of `auth/class`. It
returns `{name,canEnroll,showNames,students:[{username,displayName}]}` for the tap-your-name
grid on the join screen. `displayName` is the first word of the roster name plus the last
initial with a period ("Ava R."; single-word names stay as is). Suspended students are
excluded and the list is sorted by displayName. When the class has `showNamesOnJoin:false`
the response is `showNames:false, students:[]`. Roster names, ids and credential data never
appear. Unknown codes answer 404 `class_not_found`; a malformed body answers 400
`invalid_input`. Any alias for the class resolves, including rotated codes, because the
returning sign-in code is itself the class's first alias.

Teachers toggle the roster with `PATCH classes/:id {showNamesOnJoin}` (owning teacher only,
same authorization as `enrollmentOpen`); the switch lives in Class settings as "Show names
on the join screen". The client entry view shows Username and Password only; "I have a class
code" reveals the optional code, which then loads the roster.

## Classes and teacher controls

Class: `{id,name,loginCode,code?,enrollmentOpen,collaborationOpen,showNamesOnJoin,studentsCanShare,buildingNow,teacherName}`.
`studentsCanShare` (default true) lets students share personal worlds with classmates (see "Shared personal worlds").
`buildingNow` is the number of distinct accounts connected to the class's live rooms right now; it is filled only on a
teacher's `GET classes` (one internal presence read per live-capable world, at most 150 rooms per request in class
order, and at most 30 such listings per teacher per minute), and is `null` on `GET me`, at sign-in, for students, for
the classes past the 150-room cap, while the per-teacher bucket is empty, or when a room cannot answer. A class with
no live-capable world reports `0` without a presence read. Room objects that never opened still answer (cold, with
nobody), so the cap and the bucket are what bound the fan-out. `teacherName` is always `null`: teacher
accounts carry no roster name in the brick tables (the mock client returns a fixture name).

| Method/path | Body | Response |
|---|---|---|
| GET classes | — | `{classes}` |
| POST classes | `{name}` | `{class}` |
| PATCH classes/:id | `{name?,enrollmentOpen?,collaborationOpen?,showNamesOnJoin?,studentsCanShare?,rotateCode?}` | `{class}` |
| GET classes/:id/students | — | `{students}` |
| PATCH classes/:id/students/:userId | `{username?,rosterName?,suspended?,temporaryPassword?}` | `{student}` |

Student: `{id,username,rosterName,suspended,resetRequired}`. All class mutations and
roster reads require the owning teacher. Suspension preserves worlds and memberships.
Closing enrollment does not revoke existing membership. Closing collaboration denies
student classroom-world access while preserving personal building and saved data.

## Worlds, groups, recovery

World: `{id,title,ownerId,classId,kind,revision,updatedAt,visibility,canEdit,classCanEdit,ownerName,ownerClassId,sharedAt,hiddenByTeacher?,document?}`.
kind is personal, group, or class. Personal worlds belong to their owner and may be shared
with the owner's class (below). Class and group worlds are created by the class teacher;
group access requires explicit membership, class worlds include all active class students.
List omits document; get/create/save/restore/copy include it.

- `visibility`: `private` or `class` (class and group worlds always report `class`).
- `canEdit`: whether the caller may change bricks (owner; classmate of a world shared with
  editing; class/group rules). `classCanEdit` is the owner's sharing setting itself ("build
  together" vs "look only"), independent of the caller; true for class and group worlds.
- `ownerName`: first name plus last initial of the owner (`Teacher` for teacher-owned worlds).
  `ownerClassId`: the owner's class (personal worlds keep `classId` null); null for a teacher's
  personal world. `sharedAt`: when the owner shared it; null while private.
- `hiddenByTeacher`: teachers only; the class teacher hid this shared world from classmates.

| Method/path | Body | Response |
|---|---|---|
| GET worlds | — | `{worlds}` |
| POST worlds | `{title,document,kind?,classId?}` | `{world}` |
| GET worlds/:id | — | `{world}` |
| PATCH worlds/:id | `{title}` | `{world}` |
| PUT worlds/:id | `{expectedRevision,document,title?}` | `{world}` |
| GET worlds/:id/checkpoints | — | `{checkpoints}` |
| POST worlds/:id/restore | `{checkpointId,expectedRevision}` | `{world}` |
| GET worlds/:id/members | — | `{members}` |
| POST worlds/:id/members | `{userId}` | `{members}` |
| DELETE worlds/:id/members/:userId | — | `{members}` |
| PATCH worlds/:id/sharing | `{visibility:'private'|'class',canEdit}` | `{world}` |
| PATCH worlds/:id/visibility | `{hiddenByTeacher}` | `{world}` |
| POST worlds/:id/copy | — | 201 `{world}` |

Members may be changed only by the class teacher and only for group worlds. Removed
members cannot rejoin through copied IDs/links; existing contributions remain. Member
responses expose rosterName only to teachers. Restores/renames require owner or class
teacher. Checkpoints expose `{id,revision,createdAt,reason}`. A row-locked Postgres RPC
compares expectedRevision before accepting a complete validated document, advances
revision and records the previous version periodically (at most once/minute, always
before restore), retaining the latest30. Conflict is HTTP409 `revision_conflict` with
`currentRevision`; clients must never automatically overwrite the server version.
No DELETE-world endpoint is exposed in this initial API.

Legacy live-room owners can use `POST /classroom/legacy-worlds/:32hex/import`
with bearer authentication and `{ownerToken}` (64hex) to save a private copy.
The server verifies the old owner token against the surviving legacy room record,
validates its complete document, and returns201 `{world}`. It is limited to10/minute
per account. Missing/expired legacy records return404; this cannot recover data that
has already expired or been deleted. Reset-required accounts cannot import.

### Shared personal worlds

Migration `202609190001_brick_class_sharing.sql`: `brick_worlds.class_visibility` (`private`|`class`),
`class_can_edit`, `hidden_by_teacher`, `class_shared_at`; `brick_classes.students_can_share`. Personal
worlds keep `class_id` null; the owner's class is resolved through `brick_students.class_id` at read
time, so `GET worlds` finds classmates' shared worlds by owner (students of the caller's class, in
batches of 100 owners) and returns them after the class/group worlds. Students see them only while
the class has `collaborationOpen` and `studentsCanShare`, never hidden ones, and never worlds of
suspended owners; the teacher sees every shared world of their classes with `hiddenByTeacher`.
`canEdit` for a non-owner (a classmate or the class teacher) is true only while the world is shared with
editing, not hidden, and the owner's class has collaboration open and sharing on: the same conditions
`brick_commit_world` checks on save, so a live session is never offered an edit the save would refuse
(migration `202609190002_brick_teacher_edit_alignment.sql` aligns `brick_authorize_world`; the teacher
may still look in those states).

- `PATCH worlds/:id/sharing` — owner only, student role, personal world. 403 `sharing_disabled`
  when the class has sharing off. `visibility:'private'` unshares (clears `canEdit` and `sharedAt`).
  Every change re-authorizes the live room (`sharing_updated`, `membership`): classmates lose the
  room on unshare, keep it with refreshed `canEdit` otherwise; the owner always stays.
- `PATCH worlds/:id/visibility` — teacher of the owner's class only, shared personal worlds
  (unshared ones are 404 to the teacher). Hiding re-authorizes the room (`visibility_updated`).
- `POST worlds/:id/copy` — anyone who can see the world; creates a private personal world for the
  caller titled `<title> (copy)` from the stored document (live edits commit there first). 409
  `world_limit` at 50 saved worlds. Rate: shared with world creation (60/hour).
- Reads by a classmate: `GET worlds/:id` returns the document with `canEdit`. `PUT` by a viewer
  is 403 `read_only`; rename, restore and checkpoints of a personal world are owner-only
  (403 `owner_required`), also for the teacher. A student of another class gets 404. Errors for
  classmates: 403 `world_hidden`, `class_closed`, `sharing_disabled`.
- Live join (`/worlds/:id`, `/worlds/:id/connect`, `live-ticket`): the owner always enters as an
  editor (also on an unshared world); classmates and the class teacher enter a shared world with
  `canEdit` = `class_can_edit`; students are refused while hidden, collaboration closed or sharing
  off. `brick_authorize_world` and `brick_commit_world` enforce the same rules for socket
  re-authorization and live commits (`private_world`, `world_hidden`, `sharing_disabled`,
  `class_closed`; `access_revoked` on commit). `classId` in the live access is null for personal
  worlds. Class-level invalidation (`listClassroomWorldIds`) covers the class's own worlds and its
  students' shared personal worlds.
- Invite links and the class QR point to `/join?classCode=<code>` (`classJoinHref` in
  `src/classroom/client.ts`).

## Live integration

`handleClassroomRequest(request,env,{onAccessChanged,liveParticipants?})`: `liveParticipants(worldIds)`
returns the distinct classroom user ids connected to those rooms (the Worker reads each room's
`GET /internal/classroom-presence`, ids only) or null when unknown; it feeds `buildingNow` on a
teacher's `GET classes` only, bounded by `PRESENCE_ROOM_LIMIT` (150 rooms per request) and the
per-teacher `presence:` rate bucket (`PRESENCE_RATE`, 30 per minute; an empty bucket yields null).
`onAccessChanged` invokes the awaited callback
before returning success after access changes, resets, membership changes, world
save/restore and logout. Event: `{classId?,worldId?,userId?,reason,change}`. Root Worker
must notify affected live DOs; `listClassroomWorldIds(env,{classId?,userId?})` enumerates
IDs only when the event carries no `worldId`, so a world-scoped event never touches the
other worlds of the class. Callback failure reports failure rather than falsely claiming
live access changed; the durable permission mutation remains in effect and
reauthorization is fail-closed.

`change` states whether anyone actually lost access, so a live room can tell a
notification from a revocation. The Worker forwards `{userId?,reason,change}` to each
room's internal invalidation endpoint; a missing or unknown kind counts as `revocation`.

| Route | reason | change | Live room effect |
|---|---|---|---|
| PATCH worlds/:id (rename), PUT worlds/:id | world_saved | metadata (world) | Nobody closes. Under serialized admission the room reloads document, title and revision from Postgres and broadcasts `snapshot`; clients rebase pending edits, later edits commit against the refreshed revision, and an edit that raced the reload is rejected as `save_conflict` by the commit CAS instead of overwriting or applying to the old base. |
| POST worlds/:id/restore | world_restored | metadata (world) | Same, with the restored document. |
| POST worlds/:id/members | members_updated | membership (world) | Every connected session in that world is re-authorized in place through the batch permission check; only sessions now denied close with 4003. Existing members keep building. |
| PATCH classes/:id | class_updated | membership (class) | Same, for every live world of the class. `collaborationOpen:false` closes every student; the teacher keeps oversight. Name, code rotation and enrollment changes close nobody. |
| PATCH classes/:id/students/:userId (username, rosterName) | student_updated | membership (userId) | Only that student's sessions are re-authorized; their display name refreshes and they stay connected. |
| PATCH classes/:id/students/:userId (suspended, temporaryPassword) | student_updated, password_reset | revocation (userId) | That student's sockets close with 4003 immediately, without a database round trip. |
| DELETE worlds/:id/members/:userId | members_updated | revocation (userId) | The removed member's sockets close with 4003; other members are untouched. |
| POST auth/change-password, POST auth/logout | password_changed, logout | revocation (userId) | That user's sockets close with 4003. |

Fail-closed rules. If a membership re-authorization check cannot complete, every
session in scope closes with 4003 and the route answers 503 `live_invalidation_failed`
while the durable mutation stands. If a metadata reload cannot complete, sessions stay
connected on the last confirmed document, the route answers 503 `live_invalidation_failed`,
and the next edit's commit CAS rejects the stale base and refreshes the room. Idle sockets
are still re-checked every minute through the same batch path, and every privileged
socket action still re-authorizes first.

`authorizeClassroomWorld(request,env,worldId)` verifies current account, session,
class access and group membership. It returns userId,username,role,worldId,classId,
canEdit,isTeacher,isOwner,authVersion,sessionId. DOs reauthorize privileged actions,
revalidate idle sockets and disconnect invalid sessions after control notifications.
Client-supplied identity headers must be removed/replaced at the Worker boundary.

`POST /classroom/worlds/:uuid/live-ticket` with bearer authentication returns
`{ticket,expiresIn:60}`. Connect with `/worlds/:id/connect?ticket=<short-lived-ticket>`;
the long-lived access token is never placed in a URL. The signing key is a separate
`CLASSROOM_TICKET_SECRET` with at least32characters. `GET /worlds/:id` uses bearer
authentication. IDs may be UUID or the internal32hex representation.
`revalidateClassroomWorldAccess(env,{userId,sessionId,authVersion},worldId)` checks
current database state after ticket signature/expiry verification; the alias
`reauthorizeClassroomSocket(env,access)` supports trusted socket attachments.

`loadClassroomWorld(env,id)` and `commitClassroomWorld(env,id,document,expectedRevision,identity)`
are server-only helpers for trusted DOs. Commit returns the full new world or throws
ClassroomHttpError409 on conflict. The DO must authorize before use and acknowledge
edits only after durable commit. Identity is `{userId,sessionId,authVersion}`. The
commit RPC locks and verifies current student/session/class/group authorization in
the same transaction as the revision guard, closing revocation-versus-save races.
Character poses never call the document save RPC. Saves are limited to100/10seconds
per account. Atomic triggers cap150students/class and50worlds/owner; world documents
are bounded to2MB and checkpoints to30versions with an8MB/world cumulative cap.

## Verification boundaries

Unit tests cover session revocation, reset gates, trusted teachers, class/group/personal
authorization and guest-route isolation using a fake service adapter. They do not prove
hosted Supabase behavior. Before student rollout, verify with dedicated test identities:

1. Apply migration to the confirmed project; inspect table grants/RLS and function grants.
2. Real register, login, refresh, reset, old-session/old-refresh rejection, new-password
   enforcement, suspension and resume; check shared-NAT throughput with one class.
3. Two different students/classes cannot read guessed private/group/world identifiers.
4. Concurrent real saves: one CAS wins and one conflicts; checkpoints survive fresh login.
5. Open two actual live clients; teacher closes class/removes member/resets password;
   affected socket loses access before success, contributions remain intact, and the
   unaffected client keeps building without a reconnect.
6. Restore with a live room open, then cold-reopen from a different browser and compare
   authoritative DB document/revision, including custom parts and scene settings.
7. Direct anon/authenticated REST reads/writes and RPC calls against brick_* are denied.
8. Rename a world, add a group member and edit class settings while two live clients
   build; neither client disconnects, both receive the refreshed snapshot, later edits
   commit, and `brick_worlds.title`/`revision` match what the clients show.

These checks are separate from real Chromebook and student classroom acceptance.

## Teacher Google sign-in

The existing Supabase Google provider is reused. Brick Studio never provisions a
teacher from profile metadata: only provider-verified UUIDs in `BRICK_TEACHER_IDS`
can receive a registered teacher session.

1. The browser creates a random PKCE verifier, its SHA-256 base64url challenge,
   and an independent random state. Verifier/state and expiry remain in that
   browser tab's session storage.
2. `POST /classroom/auth/teacher-google-start` accepts `{codeChallenge,state}` and
   returns `{url}`. The browser Origin determines the fixed
   `/auth/teacher-callback?state=...` redirect; arbitrary redirect targets are not
   accepted. The authorization URL selects Google, S256, and account selection.
3. On callback the browser checks the saved state/expiry, removes callback query
   values from browser history, and posts `{code,codeVerifier}` to
   `/classroom/auth/teacher-google`.
4. The Worker exchanges the one-time code using Supabase's PKCE endpoint,
   verifies the provider user, checks the teacher UUID allowlist, and registers
   the session before returning the normal `ClassroomAuthResult`.

Access and refresh tokens are returned only in the response body. Google sign-in
requires an allowed Supabase redirect for the exact deployed frontend origin;
existing ClassChat redirect settings must be preserved. Backend unit tests prove
input and teacher-allowlist boundaries, not completion of a real Google consent
flow. See the [Supabase PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
