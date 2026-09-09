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
| POST auth/login | `{classCode,username,password}` | `{session,user,classes}` |
| POST auth/teacher-login | `{email,password}` | `{session,user,classes}` |
| POST auth/refresh | `{refreshToken}` | `{session,user,classes}` |
| POST auth/change-password | `{password}` | `{session,user,classes}` |
| POST auth/logout | `{}` | `{ok:true}` |
| GET me | — | `{user,classes}` |

Session shape: `{accessToken,refreshToken,expiresIn}`. User:
`{id,username,rosterName,role:'teacher'|'student',resetRequired}`. Username is 3–24
ASCII letters/numbers/underscore/hyphen, first character alphanumeric; uniqueness
is case-insensitive within a class. Password length is 8–128. Roster name is private
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

## Classes and teacher controls

Class: `{id,name,loginCode,code?,enrollmentOpen,collaborationOpen}`.

| Method/path | Body | Response |
|---|---|---|
| GET classes | — | `{classes}` |
| POST classes | `{name}` | `{class}` |
| PATCH classes/:id | `{name?,enrollmentOpen?,collaborationOpen?,rotateCode?}` | `{class}` |
| GET classes/:id/students | — | `{students}` |
| PATCH classes/:id/students/:userId | `{username?,rosterName?,suspended?,temporaryPassword?}` | `{student}` |

Student: `{id,username,rosterName,suspended,resetRequired}`. All class mutations and
roster reads require the owning teacher. Suspension preserves worlds and memberships.
Closing enrollment does not revoke existing membership. Closing collaboration denies
student classroom-world access while preserving personal building and saved data.

## Worlds, groups, recovery

World: `{id,title,ownerId,classId,kind,revision,updatedAt,document?}`. kind is personal,
group, or class. Personal worlds are owner-only. Shared worlds are created by the
class teacher; group access requires explicit membership, class worlds include all
active class students. List omits document; get/create/save/restore include it.

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

Members may be changed only by the class teacher and only for group worlds. Removed
members cannot rejoin through copied IDs/links; existing contributions remain. Member
responses expose rosterName only to teachers. Restores/renames require owner or class
teacher. Checkpoints expose `{id,revision,createdAt,reason}`. A row-locked Postgres RPC
compares expectedRevision before accepting a complete validated document, advances
revision and records the previous version periodically (at most once/minute, always
before restore), retaining the latest30. Conflict is HTTP409 `revision_conflict` with
`currentRevision`; clients must never automatically overwrite the server version.
No DELETE-world endpoint is exposed in this initial API.

## Live integration

`handleClassroomRequest(request,env,{onAccessChanged})` invokes the awaited callback
before returning success after access changes, resets, membership changes, world
save/restore and logout. Event: `{classId?,worldId?,userId?,reason}`. Root Worker must
notify affected live DOs; `listClassroomWorldIds(env,{classId?,userId?})` enumerates IDs.
Callback failure reports failure rather than falsely claiming live access changed;
the durable permission mutation remains in effect and reauthorization is fail-closed.

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
   affected socket loses access before success, contributions remain intact.
6. Restore with a live room open, then cold-reopen from a different browser and compare
   authoritative DB document/revision, including custom parts and scene settings.
7. Direct anon/authenticated REST reads/writes and RPC calls against brick_* are denied.

These checks are separate from real Chromebook and student classroom acceptance.
