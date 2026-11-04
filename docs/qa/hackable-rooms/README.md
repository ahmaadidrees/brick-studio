# Hackable rooms and mods: design, November 3, 2026

The owner asked how to make Hackable games truly multiplayer: hacking the game should change the game everyone is
playing; programming skill should unlock new powers; and kids should want to build and share mods. They said "Yes,
start both", meaning this doc and the lockstep sync test (`LOCKSTEP-SPIKE.md`).

**This started as a proposal; M0 and M1 are now built (see Status).** The owner's decisions are listed at the end.

## In one paragraph

A Hackable room is one game that everyone in it is running and changing together. The room server keeps the clock and
puts every key press and every edit in one order, each stamped with a tick. Every browser runs the same game from
those events, so they all agree. That works because the Hackable core is deterministic, and the sync test showed
Chrome, Safari's engine and Node identical tick for tick. Your own Hero answers your keys at once. Other players' key
presses arrive about 50–100 ms later, so the game rewinds a few ticks and replays, which is the same trick classic
rooms already use for their world. A code edit is just another event: when Maya makes the Coin worth 5, it is worth 5
for everyone on the next tick. Mods are the existing Powers, grown into three sizes and shared on a class Mod shelf
with credit. Skill unlocks what you can do in shared rooms, never the blocks themselves.

## What we can reuse

Classic rooms (`packages/platformer-core/src/net`, `multiplayer/worker/src/platformerRoom.ts`) already have most of the
infrastructure:

| Classic room piece | What it does | Hackable rooms |
|---|---|---|
| `RoomCore` in a Durable Object | One clock; orders events (`StampedEvent`: tick, seq, author); clamps events more than `MAX_LATE` 30 ticks behind or `MAX_EARLY` 10 ahead | Same. Event types change. |
| `Timeline` | Keeps recent snapshots; when an event arrives late, rewinds to just before it and replays | Same idea, over the Hackable `World` |
| `hash` every `HASH_EVERY` 60 ticks | The "provider" player's fingerprint is the reference; anyone who disagrees gets a fresh copy | Same. The fingerprint is `worldState` from the sync test, made cheaper. |
| `keyframe` every 300 ticks, up to 600 KB | The provider sends a snapshot for people joining | Same, once the state gap is fixed (sync test). Gzip makes it 2–13 KB. |
| Invites, owner token, class tickets, `canBuild`, host controls (lock building, close, remove), 16 players, 2-hour expiry | Who may join and build | Same. Roles grow (below). |
| Write-behind saving to the account world | The level is saved about 1 s after edits | Same, with the edited bricks and their workspaces |

**The one big difference:** classic rooms don't simulate players. Each game moves its own player and sends a "pose"
about 20 times a second. That works because classic players follow fixed rules.

In Hackable, kids' code reads and changes Heroes: "touching Hero", a Coin that adds to the score, a Spring that
launches. If other Heroes were only poses, each browser would see a Coin touched at a slightly different moment, and
the games would split. **So every Hero runs inside the shared game, driven by its player's key presses.** Your own
presses apply at once, and others' trigger a rewind. This is the standard "rollback" approach for fighting games, and
the classic `Timeline` already does it for the world.

## How a Hackable room works

### Events the room orders

| Event | From | Applied at the stamped tick |
|---|---|---|
| `keys`: this player's keys down/up | Each player | Changes that player's held keys |
| `join` / `leave` | The room | Adds or removes that player's Hero |
| `edit-brick`: one brick's compiled program, costumes and workspace | Hackers | Replaces the brick (below) |
| `edit-level`: place, move or delete a copy; paint cells; turn a knob | Builders | Changes the level and the running game |
| `mod`: drop a mod from the shelf onto a brick, or add a Rule | Hackers | Same as an edit, plus credit |
| `restart` ("Play again"), `pause` | Host or teacher | Fresh run from the project as edited, or stop the clock |

The room checks every event before ordering it:
- the role allows it;
- size limits;
- `validateDesign` and the shelf's `contentRules`, which already check powers sent to the Worker;
- rate limits.

The room never runs kids' code. The op budget, `CLONE_LIMIT` and the design limits keep any one edit from freezing
anyone's game.

### More than one player: changes to the language

Today a Hackable game has one Hero and one keyboard (`World.keysDown`). In a room:
- **Every player gets a Hero.** It is a copy of the player brick (Hero or Car), not a clone, so it survives "stop all"
  and doesn't count against the clone limit. Each one is placed at the Hero's painted spot, offset a little per
  player.
- **"key pressed?" and "when key pressed" mean that Hero's player's keys.** On any other brick or the Stage they mean
  "any player". The scheduler already knows which target each thread belongs to, so this is a small change in
  `sensing.ts`, `pressKey` and `releaseKey`. Single-player games behave exactly as now.
- **New blocks,** under a Players section that appears only in rooms:
  - "when a player joins" / "when a player leaves";
  - "my player's name";
  - "number of players";
  - "touching any player?";
  - "the nearest player's x / y".
- **Variables can be "for everyone" or "for each player".** A per-player variable on the Hero gives scores and a
  leaderboard for free, and "coins" can become per-player with one switch.
- **Ask and answer, and the mouse, are per player.** Sounds and say-bubbles stay local to each screen.

### Hacking live

- **When an edit lands:** the brick is replaced at the stamped tick. Scripts that start from then on, such as hats,
  broadcasts and "every tick", run the new blocks. The sync test did exactly this and all three engines agreed.
  - Scripts already running, such as a forever loop under the green flag, keep their old blocks until they end.
  - **Recommended:** restart only the edited brick's scripts, and say so in the notice. Otherwise kids will wonder why
    the change "didn't work". *(Owner decision 1.)*
- **Everyone sees what changed:** a small notice on everyone's screen, such as "Maya changed Coin: now worth 5". It
  links to the blocks.
- **History and undo:**
  - every change keeps who made it and when;
  - the host, the teacher or the author can **put back** any change. Undo is an event too, so everyone agrees on it;
  - the history makes the room a record of who built what, which teachers will like.
- **Roles,** set by the host:
  - **Player:** plays.
  - **Builder:** also places bricks and turns knobs.
  - **Hacker:** also edits code and drops mods.
  - The teacher can do everything, including pausing the room and locking edits.
  - Classic's `canBuild` is the Builder role. *(Owner decision 3: the defaults in class rooms.)*
- **Griefing limits:**
  - the op budget, so an infinite loop can't freeze the room;
  - the clone limit;
  - a rate limit on edits;
  - edits are only possible inside a room you were invited to;
  - "put back".

### Late joiners, drift and lag

- **A late joiner** gets the project, which is the shared starting point, plus the latest keyframe and the events
  since. Gzip makes the keyframe 2–13 KB.
- **The fingerprint check** runs every 60 ticks. Anyone who has drifted reloads the reference keyframe, which classic
  rooms already do.
- **Rewind** costs about 2–5 ms for ten ticks (sync test). Racing should copy only the targets that change, not its
  ~1,000 track cells.
- **If rewind ever looks bad on slow Chromebooks,** we can delay everyone's input by 2–3 ticks (about 70–100 ms)
  instead. That makes rewinds rare, at the cost of a little sluggishness. We can switch by setting, so the class test
  will tell us which is better.

### Why not run the game on the server?

The Durable Object could run the core, since it doesn't use the DOM. Then each browser would only draw. But:
- it costs CPU on every tick for every room;
- it sends far more data;
- your own Hero would lag by a round trip unless it was predicted anyway, and prediction needs the same determinism;
- it would make Cloudflare's CPU limits a design constraint.

Lockstep keeps the server as cheap as today. Determinism is now shown, so the main risk is gone.

## Mods

Powers already exist: a script snapped onto a brick, with credits, a fingerprint, and a class shelf in the Worker
(`classroom/shelf.ts`) that already accepts powers for each game. **Mods are Powers, grown into three sizes:**

| Mod | What it is | Example |
|---|---|---|
| **Power** | Scripts that snap onto one brick (today's Powers) | Triple jump, wall jump, a car's drift boost |
| **Brick** | A new brick with its own costumes and code | A Walker that throws things, a Teleporter, a Ghost car |
| **Rule** | Stage-level code that changes the whole game | Low gravity, Tag, a countdown, "the floor is lava", Capture the flag |

**The Mod shelf** grows out of the class shelf:
- each mod shows its author and "used in 12 rooms";
- a remix keeps the line of credit: "based on Sam's Triple Jump". `SnappedPower.credits` already does this;
- a short "what it does" and a 5-second preview;
- the teacher can hide a mod;
- **in a room,** a Hacker drags a mod onto a brick (or a Rule onto the Stage), and everyone's game changes on the
  next tick, with the notice and credit;
- sharing stays inside the class. *(Owner decision 5: whether it ever goes wider.)*

**The loop we want:** I make a mod, I drop it into a room, classmates play with it, they see my name, they remix it,
and I see "used in 12 rooms".

## Literacy unlocks

- **Never lock blocks.** Every block stays available, which fits the blank-canvas idea and doesn't frustrate kids.
- **Skill unlocks what you can do in shared spaces:**

| Shown by doing (checked by the game) | Unlocks |
|---|---|
| Changed a number in a script, and it ran | Builder in your own rooms; your first Power on the shelf |
| Made a variable change, and it was read later | Per-player variables; Score Rules |
| An "if" that went both ways during play | Hacker role in your own rooms |
| A loop, or "every tick" with your own blocks | Brick mods |
| A broadcast that something else received | Rule mods |
| A clone, or a My Block used twice | Hosting a room for classmates |
| A mod of yours used by someone else | Publishing to the class Mod shelf |

- **How the game checks:**
  - The runtime already reports which blocks ran each tick (`onExecutedBlocks`).
  - A concept counts only when the block **ran in play**, not when it merely sits on the canvas.
  - No AI is involved, which matches the no-AI positioning.
- **Concept badges** appear on each kid's profile. The teacher gets a class grid of who has shown which concept, which
  is evidence for grading.
- **Avoid unlocks that are only cosmetic.** The reward is more power in the shared world.

*(Owner decision 4: whether to use unlocks at all, and whether teachers can override them.)*

## Phases

| Phase | What | Rough size |
|---|---|---|
| **M0: groundwork (kids see nothing)** | Move game state into `World` (sync test table); `nextThreadId`; per-player keys and several Heroes; a cheap fingerprint every 60 ticks; snapshot and rewind; the "save to JSON at any tick" test; the sync test with two players and class projects; Firefox | ~1 week |
| **M1: play together** | A Hackable room type on `RoomCore` (events above, keyframes, fingerprint resync); join from the invite sheet and class page; everyone's Hero; Play again; the owner's edits go live | ~1 week |
| **M2: hack together** | Roles; live code edits from Hackers; notices; history and put back; teacher pause and lock; write-behind saving | ~1 week |
| **M3: mods** | Mod shelf (Power / Brick / Rule), credit and remix, "used in N rooms", drop a mod into a live room | ~1 week |
| **M4: unlocks** | Concept checks from executed blocks, badges, the teacher's concept grid, the unlock table | 1–2 weeks |

- Racing gets all of this through the same kit seam (`KIT_ENGINES`): its Car is the player brick, and laps move into
  `World` in M0.
- Hackable 3D (D1) would build on the same room once it exists.
- Once M1–M2 ship, Hackable can take over the Platformer and Racing names from the classic games. That settles the
  five-kinds question.

**Risks:**
- Rewind cost on slow Chromebooks. The fallback is input delay.
- Kids' projects that are far heavier than the starters.
- Kids griefing each other: roles, rate limits and put back.
- Late joiners, until M0 is done.

## Decisions for the owner

1. **When a code edit lands, do the edited brick's running scripts restart?** I recommend yes.
2. **Do a kid's own Hero mods follow them into other rooms, or does the room's project always win?** I recommend the
   room wins, which is simpler and fair. A kid's mods go in through the shelf.
3. **Default roles in a class room:** owner and teacher can do everything. Classmates: Player, Builder or Hacker?
4. **Literacy unlocks:** yes or no, and can the teacher override them?
5. **Sharing beyond the class:** never, later with teacher approval, or open to a school?

## Status

- **M0 done 2026-11-03:** see `M0.md`.
- **M1 done 2026-11-03** (local, not deployed): see `M1.md`. Play together from the studio, link and class rooms, every
  player's Hero, the host's live edits and Restart.
- **Ready to ship 2026-11-03** (local, not deployed): see `SHIP.md`. Play together from My projects, the class page
  and the invite sheet; host controls; reconnects; presence for every room kind.
- **Live 2026-11-04** with Parity A and Landing v2 (PR #28).
- **M2 done 2026-11-04** (local, not deployed): see `M2.md`. Per-player room rules (hurt and finish), then building
  together: classmates build, code when the host allows, live code edits restart that brick, history and undo, class
  rooms save write-behind with a recovery copy. Owner decisions 1 and 3 as decided on 2026-11-04.

## Next step (as first written)

**M0.** First, the state fixes, so `scripts/qa/lockstep/run.mjs --strict-rejoin` goes green. Then per-player
keys and several Heroes, with the sync test extended to two players. Nothing in M0 changes what a kid sees.
