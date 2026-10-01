# Invites, character motion and pipes: local manual testing

This setup exercises the real frontend, Worker invite/sharing/ticket handlers and authenticated 2D/3D Durable Object rooms. Accounts and provider storage are synthetic. It makes no production requests, uses no production secrets, deploys nothing and applies no Supabase migrations.

## Start and stop

From this worktree, after dependencies are installed, use Node 22 (the project's configured version):

```sh
node scripts/local/start.mjs
```

On this Mac, Node 22 is available at `/opt/homebrew/opt/node@22/bin`; if needed, prefix the command with `PATH=/opt/homebrew/opt/node@22/bin:$PATH`.

Open <http://127.0.0.1:5185/join?mode=signin&next=%2Fworlds>. Keep the launcher terminal open. Ctrl+C stops the fixture, Vite and local Worker. Ports are 5185 (app), 8798 (fixture/provider), 8799 (Worker) and 9235 (inspector). The launcher refuses occupied ports.

`node scripts/local/start.mjs --prepare` writes fixture data, account details and local Wrangler configuration without starting servers. `node scripts/local/start.mjs --reset` replaces all synthetic account/world/invite and Durable Object state before starting. Reset refuses to run while these ports are occupied. Do not reset while retaining an old signed-in tab; sign out and sign in again afterward.

The launcher prints the runtime directory under the OS temporary directory. Its `classroom-fixture.json`, `worker-state/` and `accounts.json` survive a normal server restart. The OS may eventually clean its temporary directory. Runtime files are outside the repository. No package or Worker deployment configuration is changed.

## Synthetic accounts and initial worlds

Every fixture account uses the password `local-bricks-42`.

| Account | Use |
| --- | --- |
| `local_builder` | Owns the initial 2D and 3D worlds; edits sharing and resends invites |
| `local_guest` | Receives both initial invites; use a second browser profile/private window |
| `local_observer` | Additional invited account for membership changes and account isolation |
| `local-teacher@example.test` | Teacher email/password sign-in; review class or hide shared worlds |

The class is **Local Test Makers**, code **ROOM-11**. These are fictional fixtures. Student sign-in works without a class code. Teacher entrance: <http://127.0.0.1:5185/join?mode=teacher>. Use the email/password option; Google OAuth is unavailable locally.

The builder owns **Invite Brick Playground** (3D, two bricks) and **Motion and Pipes Runway** (2D, flat course, start and goal). Both initially invite the guest and observer with editing allowed. On a fresh fixture, the 2D course includes a two-way pipe pair at zero-based columns 24 and 56, mouth row 23, and an ordinary unconnected pipe at column 40. Data prepared before this fixture addition may retain the earlier flat course; use `--reset` to recreate it.

World IDs are generated when the fixture is created. Find them in the printed `accounts.json` or <http://127.0.0.1:8798/__local/info>. Owned worlds open from Worlds in their ordinary editors. Shared invites open the authenticated room for that same world: `/live/<world-id-without-dashes>` for 3D and `/2d/w/<world-id-without-dashes>` for 2D.

Use different browser profiles or private windows for different accounts. The real app stores sessions per tab; a duplicated tab may inherit its starting session. Test account switching explicitly rather than assuming two adjacent tabs signed in separately.

## Invite rehearsal

1. Sign in as `local_guest`. Find the two invites in the header and Shared with you, with correct 2D/3D and editing labels.
2. Open the invite panel, dismiss it, reload and reopen. Seen state should persist through the server and remain tied to this account. Opening the panel should not destroy the shared-world entry.
3. Go to each world. Verify the real 2D/3D destination, successful room connection and a shared edit. Join acknowledgement should remain after reload/server restart.
4. As the builder, change the invite set while keeping the guest selected. The guest's existing ID/seen/joined state should remain; adding/removing the observer should affect only the changed member.
5. Explicitly resend to the guest. It should receive a fresh invite ID with unread/unjoined state. Confirm a visible-tab refresh notices it and a Play-mode toast never steals movement/jump focus.
6. Change sharing to look-only; reconnect as the guest and verify build controls/edits are refused. Remove the guest or make the world private and verify the already-open room loses access. Switch to `local_observer` and confirm account state does not carry over.
7. Test changing to class sharing and back to selected classmates, and teacher hiding/showing a world. Revoked or hidden worlds should leave the invite list until access is restored.

## Motion and pipes rehearsal

1. Open the runway as the builder. Play and compare idle, slow movement, acceleration, Shift-running, stopping, reversing, jumping and landing. Inspect Builder first, then Bot/Fox, with both cartoon and pixel styles. Look for head-height jumps, leg snapping, pedaling and obvious foot sliding.
2. Stand centered on a connected pipe mouth and press Down. Verify entry/exit motion, return travel, no repeated immediate entry while holding Down, and ordinary crouch away from a pipe. The middle pipe should remain solid ordinary terrain. Use visible touch controls in a narrow/mobile layout too.
3. In Build, select a pipe, connect an existing exit or place a new exit, toggle both ways and disconnect. Matching letters should identify the connection. Erase a pipe and undo/redo; terrain, endpoint and links should behave together. Save, refresh and reopen the same world.
4. Join the same 2D world in the guest window. Observe the builder entering/exiting a pipe; then swap roles. The remote character should show pipe travel rather than remain frozen or walk across the map. Confirm linked endpoints survive room saves and a cold reopen.
5. Check a blocked exit and a grown/big character. Entry should fail safely when there is insufficient clearance. Check an old level without pipe records still opens and ordinary pipes retain their previous behavior.

## What this proves and what it does not

- The frontend uses its real `ClassroomClient`, HTTP transport, session store and account routes. Most basic account/class/list/save endpoints use the existing QA mock.
- Invite listing/acknowledgement/resend, sharing updates, teacher visibility changes and tickets are forwarded to the **real Worker handlers**. Invite membership rows preserve unchanged state; explicit resend changes identity and clears acknowledgements.
- Authenticated rooms use the **real local Durable Objects**, protocol, WebSockets, permission rechecks, persistence and room commit paths. Their reads and authorization/commit RPCs use a small localhost fake-provider adapter. It persists authored documents and invite rows to the fixture JSON file.
- Local session tokens are deliberately synthetic. The adapter trusts its local session registry; it does not implement Supabase authentication, JWT validation, SQL migrations, RLS, database constraints/transactions, provider outages, production quotas/rate limits or Google OAuth. Unsupported provider operations return an error instead of silently succeeding.
- This is a manual-test environment, not authoritative SQL/provider or production verification. Successful compilation or an HTTP health response does not prove the student flows above; mark each flow after observing it.

Fixture health: <http://127.0.0.1:8798/__local/health>. Local account/world metadata: <http://127.0.0.1:8798/__local/info>.
