# Build together — lane contracts (2026-09-21)

Mock: https://claude.ai/artifact/L5VxMHMxqAdf7f7g5AucWt. Base branch `claude/bt-base` (forked from main bf7b4ce)
carries these stubs; every lane forks from it. Keep storage keys, tables, RPCs and the live protocol unchanged.

## The idea
One verb, one sheet, same room. "Invite classmates" (Worlds card) and "Build together" (editor strip, live room
"Invite more") all open `InviteSheet` (src/classroom/InviteSheet.tsx). Building is the default; look-only is a switch.
When the owner invites for building they land in the live room `/live/<id-without-dashes>?invited=1`, the same room
the friends' "Join and build" opens. The friend gets a count on the account chip, a banner on /worlds and
"N building now" on the card. Guests (no account) keep the old seeded `/live/new` room.

## Shared interfaces (already on the base branch)
- `ClassroomWorld.buildingNow?: number | null`, `buildingNames?: string[]` — filled by `GET /worlds?presence=1` only,
  only for shared worlds (own shared + class + members), caller excluded from `buildingNames`.
- `src/classroom/InviteSheet.tsx` — `InviteSheetProps`, `inviteAudienceLabel()`. Lane A replaces the placeholder body.
- `src/classroom/inviteSeen.ts` — `unseenInvites(worlds, userId)`, `markInvitesSeen(ids)`, key `brickgineers.seen-invites.v1`.

## Lane A — worker presence + the sheet (Fable) — owns multiplayer/worker/**, src/classroom/**
1. Worker: `GET /worlds?presence=1` adds `buildingNow`/`buildingNames` per shared world. New route option
   `liveParticipantsByWorld(worldIds) => Map<worldId, userId[]> | null` next to `liveParticipants`; the room endpoint
   `/internal/classroom-presence` already answers userIds. Bounds: at most PRESENCE_ROOM_LIMIT rooms (own shared first,
   then invited, then class), per-caller rate `presence:<userId>` reusing PRESENCE_RATE; over budget → null, never 5xx.
   Names via the existing display-name path (first name + last initial). Tests in the worker suite.
2. `InviteSheet` real implementation + `invite-sheet.css` (Sheet primitive, `variant="dialog"`, 44px targets, works at
   Chromebook 1366×768 and iPad portrait; roster grid 2 cols, scrolls inside the sheet past ~8 names). Behaviour per
   the mock: tiles toggle; "Everyone in class" chip clears/overrides picks; look-only switch; CTA text from
   `inviteAudienceLabel`; disabled with "Pick someone first" when nothing chosen; reopened on a shared world it
   preloads audience/picks/look-only and shows Stop sharing. Tests: pick → onInvite `{visibility:'members', canEdit:true, members:[…]}`;
   everyone + look → `{visibility:'class', canEdit:false}`.
3. `mockClient`: honour `?presence=1` with fixture presence (castle: 2 building, names ['Ava P.','Ben K.']).
4. Delete nothing in src/pages/**; lane B removes ShareSheet.

## Lane B — /worlds (Opus) — owns src/pages/worlds/**
Per mock boards 2 and 4. Fetch `/worlds?presence=1` (add `presence` flag to `WorldsClient.listWorlds`).
- Own card: button "Invite classmates" (Users icon) opens InviteSheet. When shared with `classCanEdit` the primary
  becomes "Build together" → `liveHref`, secondary icon-only gear "Who can join" reopens the sheet; ⋯ menu gains
  "Open alone" (buildHref) and "Stop sharing". Chips: "<Name> is here" per `buildingNames` (max 2, then "+N"),
  "<Name> invited" for members not present (max 2, then "+N"), else existing Shared chip.
- After `onInvite` with `canEdit`: `setWorldSharing`, then `window.location.assign(liveHref(world) + '?invited=1')`.
  Look-only: stay, toast-free, card updates.
- Friend: banner section above My worlds for `unseenInvites()` (newest first, max 3): "<Owner> invited you to build
  <Title>", live line "<names> building right now" when `buildingNames` non-empty, buttons "Not now"
  (markInvitesSeen) and "Join and build" (markInvitesSeen then liveHref; label "Visit" when !canEdit).
  "Shared with you" cards: "N building now" chip (green) when > 0, primary "Join and build" / "Visit".
- Remove `ShareSheet.tsx`; update WorldsPage tests. Keep teacher variant working (teacher never sees the banner).

## Lane C — editor, live room, header (Fable) — owns src/brick/**, src/shell/**
Per mock board 3.
- Command strip "Build together" (`onStartLiveWorld`): signed-in student on a cloud world (`cloud.world` set, kind
  personal) → open InviteSheet inside the editor (classmates via `browserClassroomClient` `/classes/<ownerClassId>/classmates`
  where classId = the student's class from `useClassroomSession`). On invite: `cloud.flush()`, PATCH
  `/worlds/<id>/sharing`, then `canEdit` ? assign `/live/<id>?invited=1` : toast "Shared with <audience>. They can look
  from their Worlds page." Guest or teacher: unchanged `/live/new` path. A signed-in student on an UNSAVED fresh
  build: create the account world first (the auto-create path already exists), then continue.
- Live room (LiveWorldPage/LiveWorldHud), classroom room where the caller is the owner of a personal world: people
  panel gets "Invite more" → InviteSheet (same PATCH; no navigation). On `?invited=1`: toast "Invites sent. <audience>
  will find <Title> on their Worlds page." then strip the param (history.replaceState). Header presence chip: reuse the
  existing presence roster; copy "Building with <names>" / "Waiting for <invited names not here>" when known.
- Header (AccountChip, page + editor variants): for signed-in students fetch `/worlds` once on mount (no presence),
  badge = `unseenInvites().length` (coral dot with count, aria-label "N invites"); AccountMenu "My worlds" description
  becomes "1 invite waiting" when > 0. Skip the fetch for teachers and guests.

## QA (coordinator)
Full `npm run check`, then manual: student A invites B for building → A in room; B sees badge + banner → Join lands in
the same room, both see each other; look-only path; Not now hides banner; teacher class page still shows the world.
