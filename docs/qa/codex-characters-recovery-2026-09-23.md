# 2D characters and durable recovery copies

Implemented locally on `codex/2d-characters`, from Claude's 2D candidate `987c4a9049bb325dd944ce04e5febab3335c51ab`. GPT-6 Sol workers handled the renderer, character protocol, selector and recovery storage in separate lanes. Configuration, dependencies and original Claude worktrees were not changed. Nothing was pushed, merged to main, or deployed.

## Characters

- Builder, Bolt Bot and Brick Fox use the three approved generated sprite sheets. Classic remains available and is the rendering fallback if an image cannot load.
- The shared header's Character action opens a keyboard-accessible selector with cropped previews. Choice takes effect immediately and persists in this browser when storage permits; blocked storage still allows a choice for the current visit.
- Both local and remote players render the selection. The server allowlists character IDs and strips unrecognized pose properties rather than accepting asset URLs. Older clients appear as Classic. Cosmetics do not enter saved worlds, collision rules or deterministic simulation hashes.
- Rejoining a new room epoch clears stale remote pose history so a lower restarted clock cannot freeze a character selection.
- Idle, movement, jump, crouch, landing and related gameplay poses use a curated subset of the generated cells. A few special actions reuse nearby poses. Pixel terrain can also use these illustrated characters; the new artwork is not a separate pixel-art costume set.

## Recovery fix

The earlier Wi-Fi review's W3 was a confirmed loss path: a conflict copy lived inside the expiring room record. Recovery snapshots now live under separate durable keys, survive room expiry, and do not overwrite earlier snapshots. Legacy copies migrate before expiry. A bounded archive keeps sixteen copies; when full, pending work parks rather than evicting a copy.

Owners and teachers get a Recovery copies menu with dated downloads and a deliberately confirmed Remove copy action. Downloading does not delete or replace anything. Removing one selected archive entry leaves the current world and pending edits intact and schedules a normal permission-checked save retry. Both public routes and the Durable Object check authorization; guest, classmate, spoofed grant and wrong-world access are rejected.

## Verification

- Final `npm run check`: **1,456 app tests and 222 Worker tests**, all typechecks and production build pass. Log: `test-results/codex-integration/check.log`.
- Existing `scripts/qa/platformer-2d.mjs`: **19/19** local browser checks, zero page errors. Covers editor saving, 2D/3D transitions, two-player movement/building/permissions, iPad-sized touch interaction and phone layouts.
- New `scripts/qa/platformer-characters.mjs`: **7/7**, zero browser errors. Covers all four choices, loaded assets, reload persistence, keyboard/Escape/focus return, two independent browser profiles exchanging character poses, legacy fallback, and a 390-pixel phone selector.
- Screenshots and results: `test-results/platformer-characters/` and `test-results/platformer-integration/`.
- Recovery expiry, bounded retention, fresh authorization and deletion behavior use the local Durable Object runtime and a fake account database. The recovery UI has component coverage for load/download/confirmation/failure. No real-account recovery download or database persistence rehearsal was performed.

## Remaining before classroom release

This does **not** close the earlier 2D Wi-Fi review. The following remain on the existing 2D transport/sharing path: preservation of unacknowledged construction through reconnect/resync (W1), stalled handshake/silence deadlines and wake recovery (W2), ghost/full-room session recovery (W5), and routing signed-in People sharing to the same persistent classroom world rather than a temporary guest copy (W6). The independent 3D branch contains the new invitation/re-entry refresh work; it is not integrated here.

The character PNGs total about **6.6 MiB**, and the selector loads all three preview sheets when opened. Runtime rendering falls back while assets load or fail, but these draft sources should become smaller production atlases and more consistent animation frames before broad school rollout. No real Chromebook performance, slow-network asset timing or physical iPad test was measured here.

Recommended order: complete 2D preservation/transport and the same-world classroom flow; rehearse real-account reconnect, owner-away editing and cold return on staging; then finish sprite size/animation polish and run a limited classroom pilot.
