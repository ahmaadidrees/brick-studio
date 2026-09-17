# Hosted refinement multiplayer QA

2026-09-14 UTC. Actual hosted browser UI at `https://virtual-legos-788vjxwd9-ahmaadidrees-projects.vercel.app`, connecting to staging worker `https://brick-studio-multiplayer-staging.brick-studio-race-worker.workers.dev` (parent reported deployment9032bff3). No production tests. Protected preview accessed with authorized temporary browser cookie; access token deliberately omitted.

Two isolated system-Chrome contexts created and joined a temporary guest world through the UI. No app source, environment variables, or production state were changed. Evidence is browser UI plus received WebSocket messages, server GET, downloaded document, and independent cold join; this is not a protocol-only rehearsal.

## Confirmed sequence

1. Owner filled builder name and clicked Create my live room.
2. Share → Copy invite link produced a guest URL without the owner's fragment. Second browser opened the invite, filled a different name, and clicked Join the room.
3. Owner used Scene →96×96 →Apply, then128×128 →Apply. Peer received each replacement document.
4. Owner chose1×1 Brick, moved its preview with63 ArrowRight presses, then clicked Place brick. Peer received the apply event.
5. Authoritative staging GET returned revision3, schema3, plateSize128, one brick at x126,y0,z63. This lies beyond the original64-stud range and close to the expanded edge.
6. Share →Export copy downloaded JSON exactly equal to that authoritative document.
7. An independent fresh browser context opened the same invite and joined through the UI. Its welcome document exactly equaled the prior UI export and server GET, including revision3 and the edge brick.
8. Owner selected Toy Figure through Character UI and peer received its characterId update.
9. A further pair of independent browsers joined the same staging room; guest selected new Nova character through UI and observer received `characterId: nova`.

10. Toy Figure Bun and Glasses were selected through the hosted UI in another joined guest browser. The observer received `characterId: toy-figure`, `appearance.hair: bun`, and `appearance.accessory: glasses`.

Final successful room: `bf2be5f204417673c9bbfa1ab485d623`. These are temporary staging rooms; no live student data was used. Raw evidence and export: `/tmp/brick-refinement-multiplayer/results.json`, `/tmp/brick-refinement-multiplayer/export.json`. Cold-join screenshot: `/tmp/brick-refinement-multiplayer/cold-peer.png`.

## Test corrections and scope

The first preview URL was protected; the final hosted URL above worked with the provided access cookie. A brief localhost/staging fallback created one room before hosted access became available; it is not counted as hosted evidence.

Initial harness attempts used the wrong role for character choices (`button` instead of `radio`) and tested rejoin availability before hydration. The selectors were corrected. Cold persistence was proved with a separate fresh browser instead of relying on the premature reload attempt. An immediate Scene-tab log after clicking Character was not sufficient to establish a product bug; no Character-shortcut defect is claimed.

Profile transmission was checked in the second browser's actual received players messages. This does not independently prove the remote avatar visually renders every accessory. Classroom authentication, old-client compatibility,1000-brick load, and production behavior are outside this bounded run. The tested hosted candidate precedes the parent's later mobile-only CSS commit; no claim that this is the final production artifact is made.

## Final public production smoke

Completed 2026-09-14T06:34:32.302Z using exactly two guest browser contexts and one disposable room, `01dcbe3c52475e84886d08c87310dda9` (title Disposable release QA). Public origin `https://virtual-legos.vercel.app`; actual WebSocket backend confirmed `https://brick-studio-multiplayer.brick-studio-race-worker.workers.dev`. No preview cookie used.

Parent-supplied released identities: frontend deployment `dpl_7TRb3UJpviAGr4k6e1agzdbAcfN5` (m41egxddv), worker version `073e877d-02c3-425b-b083-56815d36bb2a`. This smoke exercised the public alias after promotion; deployment mapping is parent-supplied, not independently queried by this harness.

Passed UI create, invite copy, second-client join, resize96 then128, and placement at x126,y0,z63. Peer observed edits. Toy Figure Bun/Glasses appearance and Nova character both reached the peer players profile. Downloaded UI export exactly matched authoritative GET revision3/schema3/plateSize128; cold peer reload and UI rejoin received exactly the same document. No browser page errors.

Cleanup: owner used Room → Close room to new people; authoritative GET confirmed `locked: true`. Both browser contexts closed. No student rooms/accounts touched and no load test performed. Evidence: `/tmp/brick-refinement-production/results.json`, `export.json`, `owner.png`, and `peer.png`.
