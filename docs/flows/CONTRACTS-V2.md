# Brickgineers flows v2 — lane contracts (2026-09-19)

Approved mock: https://claude.ai/artifact/JzFk8HF1u7zStuvz5WNHHi (the "Flow Review" sheet). It governs layout and copy.
Rule for every screen: things about my build sit beside my build's name; things about me sit in the top-right corner.
Existing hard rules still apply (docs/brand/CONTRACTS.md): identifiers, storage keys, schemas, recovery, guest flows,
44px targets, reduced motion, Node 22, no deploy/push from lanes, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
Usernames are globally unique (migration 202609170001 applied). Lanes work in their own worktrees on branches
`claude/flows-<lane>` from `claude/flows-v2`; the lead merges in the order W1 → W2 → W6 → W3 → W4 → W5 → W7.

## Routes (lead lands the parser; lanes own the pages)

| Path | Route | Owner | Notes |
|---|---|---|---|
| `/` | landing | W2 (header only) | account chip in the corner; body unchanged this pass |
| `/build` | build | W6 (chrome), W2 (header) | `?classroom=` intents keep working: `save` opens the in-editor save sheet; `worlds`, `class`, `join`, `signin`, `teacher` redirect to the pages below |
| `/join` | join | W3 | `?classCode=` prefill; `?mode=signin` for returning students |
| `/worlds` | worlds | W4 | signed-in only; signed out → `/join?mode=signin&next=/worlds` |
| `/class` | class | W5 | teacher only; students → `/worlds`; signed out → `/join?mode=teacher&next=/class` |
| `/class/projector` | class projector | W5 | full-screen code + QR (replaces the modal) |
| `/live/:id`, `/world`, `/auth/teacher-callback` | unchanged | — | |

`src/routes.ts` gains `'join' | 'worlds' | 'class' | 'class-projector'`; `src/main.tsx` lazy-loads each page. Lead lands
both as the first commit on `claude/flows-v2` so every lane builds on it.

## Header component (W2 owns `src/shell/**`; every page consumes)

`<AppHeader variant="landing" | "page" | "editor" ...>` from `src/shell/AppHeader.tsx`:
- Left: `BrandLockup` (mark only in the editor; mark + wordmark elsewhere) linking Home. In the editor: world title as text
  with a pencil (rename callback, account worlds only), a `⋯` "This build" menu (`WorldMenu`: Rename, Download build,
  Import build, New build, separator, Settings), then the `SaveStatus` pill.
- Center (editor only): Scene, Character, People tools (callbacks passed in), then the `ModeSwitch` (Build | Explore,
  `SegmentedControl` styled as a pill; disabled state when Explore is unavailable with the existing reason).
- Right: `AccountChip` from `src/shell/AccountChip.tsx`: reads the classroom session (`browserClassroomClient`
  session store via a small `useClassroomSession()` hook W2 adds in `src/shell/useClassroomSession.ts`, no new storage
  keys); signed out renders a quiet "Sign in" button → `/join?mode=signin`; signed in renders avatar initial, first name
  + last initial, context line (class name for students, "Teacher" for teachers) and opens `AccountMenu`: student =
  My worlds, My class, Save this build to my account (editor only), Switch account, Sign out; teacher = My class,
  My worlds, Show class code on projector, Switch account, Sign out. Landing gets the same chip.
- Phone (≤700px): mark, title, save pill, mode switch, chip icon-only; tools in a second row (existing behaviour).
- Props are plain callbacks; the header never imports the store or the classroom client except through the hook.
W6 replaces the editor's current `Header` with `AppHeader variant="editor"` once W2's commit lands (lead coordinates).

## Data model (W1 owns the migration `supabase/migrations/202609190001_brick_class_sharing.sql`)

- `brick_worlds`: `class_visibility text not null default 'private' check (class_visibility in ('private','class'))`,
  `class_can_edit boolean not null default false`, `hidden_by_teacher boolean not null default false`, and
  `class_shared_at timestamptz` (accepted: W1 added it to back `sharedAt`; set when the owner shares, cleared on
  unshare, unchanged by saves). Personal worlds keep `class_id null`; sharing resolves the owner's class through
  `brick_students.class_id` at read time.
- `brick_classes`: `students_can_share boolean not null default true`.
- Nothing renamed; `kind` values unchanged.

## Worker endpoints (W1 owns `multiplayer/worker/src/classroom/**` and tests)

- `GET /classroom/worlds` (existing) now also returns classmates' shared personal worlds for students whose class has
  `collaboration_open` and `students_can_share`, excluding `hidden_by_teacher`, with new fields on every world:
  `visibility: 'private'|'class'`, `canEdit: boolean` (for the caller: owner, or shared with edit, or class/group rules as
  today), `ownerName: string` (displayName rule: first name + last initial), `sharedAt: string|null`, `hiddenByTeacher`
  (teachers only). Teachers get their classes' shared student worlds including hidden ones.
- `PATCH /classroom/worlds/:id/sharing` body `{ visibility: 'private'|'class', canEdit: boolean }` — owner only, student
  role, class must have `students_can_share`; 403 `sharing_disabled` otherwise. Unsharing sets visibility private and
  closes the live room to non-owners (reuse the class-closed path).
- `PATCH /classroom/worlds/:id/visibility` body `{ hiddenByTeacher: boolean }` — teacher of the owner's class only.
- `PATCH /classroom/classes/:id` accepts `studentsCanShare`. `classView` returns `studentsCanShare`.
- `POST /classroom/worlds/:id/copy` — caller can see the world → creates a personal world for the caller titled
  "<title> (copy)" from the authoritative document (409 `world_limit` if the caller is at their limit). Response = world.
- Live join authorization (`worldAccess`): a shared personal world admits classmates as viewers (`canEdit:false`) when
  `class_visibility='class'`; as editors when `class_can_edit` too; owner always edits; requires `collaboration_open`
  and not `hidden_by_teacher`. The existing `permission.canEdit` plumbing in the live HUD renders the read-only state.
- Invite links: `ClassInvite` and the QR encode `/join?classCode=<code>` (account creation first).
- Errors: JSON `{ error, code }` as today.

## Client (`src/classroom/client.ts`, `contracts.ts`) — W1 adds the calls, pages consume

`ClassroomWorld` gains `visibility, canEdit, ownerName, sharedAt, hiddenByTeacher?`; `ClassroomClass` gains
`studentsCanShare`. New: `client.setWorldSharing(id, { visibility, canEdit })`, `client.setWorldHidden(id, hidden)`,
`client.copyWorld(id)`. Pages built before W1 lands use `src/classroom/mockClient.ts` (W1 ships it in its first commit
with fixtures: one class, six students, three own worlds, four classmates' worlds, two teacher worlds).

## Pages

- **W3 `/join`** (`src/pages/join/**`): code-first for new students with the class name chip, live rule checklist for
  username (3–24, letters/digits/_/-, starts with letter or digit, no spaces) and password (≥6, not username, not
  common), server suggestions as chips on `username_taken`, "I already have an account" → sign-in; sign-in = username +
  password only, "I have a class code" reveals code + tap-your-name roster (`auth/roster`), "Not you? Change class",
  remembered class, `?next=` redirect after success, "Keep building as a guest". Page scrolls as a whole.
- **W4 `/worlds`** (`src/pages/worlds/**`): rail (Mine / class), draft strip for the browser build (Continue, Save to my
  account → in-editor save sheet via `/build?classroom=save`), own worlds (Open, Share with my class / Sharing…, ⋯ with
  Rename/Duplicate/Checkpoints), share sheet (look only | build with me, default look), "Shared by classmates" (Join if
  canEdit, Visit, Make my own copy), teacher worlds (Join). Teacher variant: classes in the rail, "Start a shared world".
  Collaboration closed → one explanatory line, cards hidden. 1024 and 390 layouts.
- **W5 `/class`** (`src/pages/class/**`): first-run stepper (name, invite, start), code card (projector, copy join link,
  print QR), tabs Students / Worlds / Settings, "Shared by students" row with Visit and Hide from class, roster with
  search, reset password, manage; Settings holds enrollment, collaboration, students can share, show names on join,
  rotate code, new class. `/class/projector` full screen. Existing ClassroomPanel views may be reused as internals but
  the dialog frame goes away for teachers.
- **W6 editor** (`src/brick/**` chrome only): command strip (`src/brick/CommandStrip.tsx`) replacing the placing panel,
  selection bar and hint bubble; states: idle / brush loaded / selected (Rotate, Duplicate, Color popover with the
  twelve swatches + Any color, Delete); camera cluster bottom-right; undo/redo top-left; drawer palette labelled Brush
  color; Settings removed from the header (lives in the ⋯ menu); in-editor save sheet kept; `?classroom=` redirects.
- **W7 QA** (`scripts/qa/**`, `docs/flows/qa/**`): locators for the new pages, six-viewport matrix over `/join`,
  `/worlds`, `/class`, `/class/projector`, editor states; scripted end-to-end on a local worker with synthetic classes:
  teacher first run → invite → student creates account (taken name, weak password) → builds → shares (look, then build)
  → classmate visits, joins, copies → teacher hides → unshare while a classmate is inside; plus the existing harnesses.

## Definition of done per lane

Typecheck + focused tests green per commit; full `npx vitest run` before the report; screenshots at 1366×768, 1024×768,
390×844 under `docs/flows/qa/<lane>/`; status note `docs/flows/status/<lane>.md` with requests for the lead.
