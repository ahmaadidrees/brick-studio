# Privacy summary (draft for review, not a policy)

Lane W2. This is the text shown in the `#privacy` section of the marketing landing page
(`src/brick/landing/LandingPage.tsx`). It is deliberately labeled "A plain summary of how the app handles your work
today. It is not a full privacy policy." A real privacy policy needs review by the user (the teacher running the pilot)
and, if the app is offered to other schools, by whoever is legally responsible. **Publication dependency:** no approved
privacy text exists anywhere in the repository (checked `docs/`, `public/`, `src/` on 2026-09-14).

## Current copy

- Guest building stores your draft, settings, and character choices in this browser only. Clearing site data removes
  them.
- A shared guest room keeps the build and builder names on the server while the room is active, and deletes them about
  two hours after the last activity.
- A class account stores a username, a roster name that only you and your teacher see, a password, and the worlds you
  save. Students never need an email address.
- Teacher sign-in uses your existing teacher account. Google sign-in shares your Google account identity with the app
  only to confirm that account.
- Questions about a class account go to the teacher. Teachers reach the team that set up their account.

## What each line is based on

| Line | Source |
|---|---|
| Guest data stays in the browser | `src/brick/localProjectKeys.ts`, `documentPersistence.ts`, `contentPreferences.ts` (localStorage only) |
| Guest rooms expire ~2 h after last activity | `multiplayer/worker/src/worldRoom.ts` `WORLD_ROOM_TTL_MS`; guest names are room state |
| Student account fields | `src/classroom/ClassroomPanel.tsx`; server synthesizes an internal email, no real student email |
| Google identity only | `multiplayer/worker/src/classroom/googleOAuth.ts` requests no extra scopes (PKCE, `prompt=select_account`) |
| Teacher accounts provisioned by an operator | `BRICK_TEACHER_IDS` allowlist in `multiplayer/worker/src/classroom/index.ts` |

## Deliberately not claimed

No COPPA / FERPA / GDPR statements, no retention period for class accounts, no data-processor list, no cookie statement,
no age statement, no contact address. Each of these needs a decision before it can be written.

## Open questions for the user / lead

1. Who is the responsible party named in a real policy (the teacher, the school, or the developer)?
2. Retention: how long are class accounts and saved worlds kept after a class ends? Is there a deletion process a
   teacher can run? (The roster has suspend/reactivate; deletion is not verified.)
3. Hosting/processors to disclose: Supabase (auth + Postgres), Cloudflare Workers / Durable Objects (rooms), Vercel
   (static hosting) — confirm the list before naming vendors publicly.
4. Does the analytics-free claim hold? No analytics script was found in `index.html` or `src/`; confirm the hosting
   platform adds none.
5. Student age and school consent: any statement here depends on the pilot's own agreements.
6. Should Privacy become a standalone route (`/privacy`)? Same routing decision as Help.
