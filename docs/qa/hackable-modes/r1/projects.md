# R1 lane 1: projects and words — November 2, 2026

Branch `claude/racing-r1-projects`, from the contract (a202bb8). Two commits: 8e64821 (the work) and b7c3298
(`KITS.race.ready` flipped last, with the tests that need it). Nothing pushed, merged or deployed.

## What changed

- **Address.** `/2d/hackable-race` (plus `?new=1`, `?draft=`, `?world=`) parses to `{ kind: 'studio', kit: 'race' }`
  (`routes2d.ts`). `/2d/hackable` parses exactly as before (no `kit`). The loading text says "Opening Hackable
  Racing…" there (`PlatformerApp.tsx`). A class world redirect uses the world's kit.
- **New project.** `StudioApp` takes `route.kit`: `?new=1` opens `KIT_SCREENS[kit].starter()` named
  `copy.projectName` ("My race track" on the beginner track). The Platformer path is the same starter and name as before.
  New project has a **Hackable Racing** card right after the Hackable Platformer (`NEW_PROJECT_HREF.hackableRace`).
- **Kept with its game.**
  - `HackableEntry.kit` (`'race' | '3d'`). There is no kit for a Platformer, so Platformer entries are written byte for
    byte as before. An entry with no kit is a Platformer (`entryKit`).
  - `touchHackableEntry` and `saveHackableText` take the kit. Without it, the entry keeps its own kit, and
    `saveHackableText` reads it from the save. A list rebuilt from the saves reads `design.kit`. An unknown kit in the
    list is dropped (the save keeps it).
  - `saveHackableProject` passes `designKit`.
  - **Account:** `world.kit`.
- **Addresses by game.** `hackableHref.local/world(id, kit?)` and `hackableHref.fresh(kit?)` (now a function; nothing
  used the old string). `hackableRoute(kit)`: 3D falls back to `/2d/hackable`, which says what the project is.
  - My projects (`projects.ts`): `listLocalProjects`, `projectHref`, import and move.
  - `/worlds` (`buildHref`, `liveHref`) and `/class` Open (`worldRoomHref`).
  - A server that doesn't report `kit` yet still gets the race address from the document after a move or import.
- **The address is put right.** A project opened at the other game's address (an old link, or an invite without a kit)
  opens as itself, and the address is replaced with its own game's (`fixAddress`).
- **Newest by game.** With no project named, `/2d/hackable-race` opens the newest race project and `/2d/hackable` the
  newest Platformer.
- **Make my own copy** and the tab-conflict and account-conflict copies keep the game and its address.
- **My projects kind.** `ProjectKind` adds `'hackable-race'`, labelled "Hackable Racing", with `isHackableKind`,
  `hackableKind` and `kindOfContent`. A file's own `kind` stays `'hackable'` for both games (the game is in the save),
  so older versions still read race files. `WorldCard` gets the chip through `kindOfWorld`.
- **Words.**
  - The shared 30-project limit says "Hackable projects": the studio problem card, `notKeptMessage` and import.
  - File messages: "A Hackable project file can be up to 5 MB" and "That Hackable project could not be opened".
    `NotHackableError` says "not a Hackable project". An untitled account copy is named after its game.
  - `raceCopy.ts` is settled. `controlsHint` is "steer · up is gas · down is brake", written to follow the ← → keys
    like the Platformer's. Play's tip is "Press Play to race your track." `helpPlay` mentions beating the computer
    racers.
  - Help: `RACE_HELP` gives the subtitle, the Build paragraphs (paint the track; the Car's sliders) and no "+ Power"
    paragraph. `StudioHelp.helpFor(copy)` reads `copy.help` and falls back to the Platformer's words, which are
    unchanged.
  - Tips use `copy.tipsKey`, which the shell already passes, so the race tips show even after the Platformer's were seen.
- **Start over** in a race project goes back to the beginner track, keeping the game and the name. Its wording ("the
  beginner track") follows the game.
- **Open File** passes the project's kit, and `importProjectJson(text, kit)` refuses a file of the other game: "That
  file is a Hackable Racing project. Open it from My projects." This is because an account refuses a kit change.
- `legacySave.ts` returns the text unchanged when the save's design names a kit.
- `KITS.race.ready = true`. This was the last change.

**Platformer expectations that changed, on purpose:**

- "Hackable Platformers" became "Hackable projects" in the limit messages, because the limit is shared.
- The generic file messages above.
- `kits.test`: Racing is now ready, and a race file opens as a race track.

## Tests

New or extended:

- `routes2d`: race addresses.
- `hackableProjects`: an old entry without a kit is a Platformer; Platformer entries have no kit; the kit survives
  saves, renames and a pending world; it is rebuilt from saves; unknown kits are dropped; the limit is shared; hrefs
  match `KITS` routes; names match `KIT_SCREENS`.
- `StudioApp.new`: a new race track in the page (name, game, title, kept at the race address); keep in the account or
  this browser; the newest project per address; an old entry without a kit; the address put right; an account race
  world; Make my own copy, including when the account is full; the shared limit's words.
- `projects`, `projectFile`, `ProjectSections`.
- New `NewProjectSheet.test.tsx`: card order and hrefs.
- `kits.test`: ready, plus a file of the other game.
- Tips and Help per kit (`StudioHelp.test`), `ProjectMenu` (Start over, Open File kit).
- New `legacySave.test.ts`, `worldsData.hackable.test.ts` and `classPageData.hackable.test.ts`.

**Gate:**

- `npx tsc -b` is clean.
- `vitest run src/platformer src/projects src/pages src/classroom src/shell`: 2199 passed, 25 expected fail, and 6
  timeouts under load (load average about 33, with other lanes running).
- The timed-out files passed when rerun alone: perf, CodeEditor.loadFailure, fileRoundTrip, carBrick, and
  CodeEditor.sections (234 s alone). `StudioApp.new` also timed out once under load and passed on three reruns.

## Integrator requests

1. `kitScreens.ts` `KitCopy`: add `help?: KitHelp` (`import type { KitHelp } from './screen/StudioHelp'`) so the race
   Help words are part of the contract. Today `RACE_COPY` carries them and `helpFor` reads them structurally.
2. `builder/PlayFeedback.tsx:64` (lane 4 or the integrator): render `{screens.copy.controlsHint}` instead of
   `PLAY_CONTROLS_HINT` after the ← → keys. The race hint is written to follow them.
3. `classroom/ClassroomPanel.tsx:202` and `brick/BrickStudioApp.tsx:1417`: use
   `hackableHref.world(world.id, world.kit)` instead of the literal `/2d/hackable?world=`.
   `classroom/StudentInvites.tsx:11`: pass the invite's kit if invites carry one. Until then the studio puts the address
   right after opening.

## Not done

- Copy left for later (as the plan says), still "Hackable Platformer": `classroom/contracts.ts`, `InviteSheet.tsx`,
  `ShelfTab.tsx`, `HelpPage.tsx` and the landing page.
- A Hackable 3D project would show as "Hackable Platformer" in My projects (D1).
- New project's Racing card uses the older race track's picture (`brickSpeedway`) with two Car blocks over it.
  Drawing the beginner track there would pull the game into the projects chunk.
- Not checked in a real browser; jsdom only.
