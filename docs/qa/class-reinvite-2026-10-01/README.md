# Whole-class targeted reinvite recovery

Released October 1, 2026 while investigating the user's continued kick/rejoin report. One source-confirmed recovery gap was fixed; the user's exact latest classroom flow is not yet identified.

People directed owners to Invite again, but personal worlds shared with Everyone in class had no such action and the server rejected targeted resend in class visibility. The sharing sheet now offers explicit selected-classmate Invite again in both sharing modes. The server records only those active same-class recipients, sends fresh notifications, and restores only those recipients through the existing trusted invitation event. Save who can join remains a sharing update and does not restore removed players. Other removals, editing locks, hidden worlds and classroom restrictions remain in force.

## Deployment

- Production https://brickgineers.com, READY; product commit `788382d8927b93849b4ce65b5f5bdd2def97fa03`.
- Vercel deployment `dpl_5myewNREzfbhgS47MxJHWMfkKe2z`, https://virtual-legos-77288e2eb-ahmaadidrees-projects.vercel.app.
- Worker version `dacc45a4-2960-41fc-a3be-3df1d00995a1`.
- React/Vite production prebuilt output, freshly pulled production settings, successful build; duration not captured.
- Worker deployed before frontend. No SQL, room protocol or Durable Object migration changes.
- Includes the prior increase to 2,000 placed bricks and 64 custom designs; generated animation drafts are not deployed.

## Focused checks and limitations

16 Worker invitation tests and 12 sharing-sheet tests passed, plus app and Worker typechecks. Routed synthetic tests exercise actual ticket/room routing and Durable Object sockets: owner kick, fresh student denial, unchanged sharing save still denied, targeted resend, fresh welcome. Both members-only and whole-class modes are covered. Other kicked accounts remain denied, locked building stays locked, invalid targets are rejected, and class-wide recipient invitation acknowledgement persists.

Public domain was inspected and resolves to the READY deployment above. Vercel error logs for the prior hour returned no logs; static frontend logs do not prove Worker runtime behavior. Log-drain configuration was not audited.

The two-account local browser rehearsal stopped at a native confirmation/focus failure. It is incomplete and does not prove kick acceptance or rejoin. No production student identity or classroom data was accessed. Real signed-in student browser testing remains manual; user clarification about the exact reported flow is pending.

Save and refresh both owner and student clients, then owner People → Invite more → select removed classmate → Invite again. Student opens the new invitation. Merely trying an old link after removal is not a new invitation.

## Recovery

Previous website `dpl_DUFupDYZgxAHRHQK93dSqkYzopvG`, Worker `13806073-2294-4f31-bf30-1b77530d8065`. Rolling back preserves the capacity increases but removes whole-class targeted recovery. No rollback executed.
