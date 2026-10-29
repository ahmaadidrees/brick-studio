# Hackable Platformer, ready for kids — October 28, 2026

Code Lab's kid-facing name is now **Hackable Platformer**: a platformer where you can change anything about how it
works, with blocks. This pass makes it a real kind of project next to 3D builds, platformers and race tracks. It lives on
branch `claude/code-lab-on-main`; it is not deployed.

## What changed

1. **The name.**
   - The page is `/2d/hackable`, and the old `/2d/lab/next` address goes there.
   - The tab title reads "<project> · Hackable Platformer · Brickgineers", and the header menu is "This project".
   - Kid-facing "Code Lab" wording is gone: storage messages, the Powers panel ("Built in") and the teacher's Shelf
     tab. "Code Lab" remains the name in the source.
2. **Real projects.**
   - **In this browser:** each project has its own save (`code-lab.project.v1:<id>`) and an entry in
     `code-lab.projects.v1` with its name, date and a small picture of the level, for My projects. A browser keeps up
     to 30.
   - **The older single save** (`code-lab.project.v1`) becomes project `main` where it is, so nothing is moved or lost.
   - **In an account:** a project is an ordinary world whose document is
     `{ format: 'brickgineers-hackable', version: 1, save }`, where `save` is the same envelope as a file.
   - **Saving:** the page saves to the account about a second after each change, one save at a time, like the 2D
     builder. A save someone else made first is reported, never overwritten. A project too big for an account (2 MB)
     says to save a file.
   - **Opening and starting:**
     - "New project → Hackable Platformer" opens `?new=1`. Signed in, that makes an account world; a guest, or a kid
       who is offline, gets one in this browser.
     - `/2d/hackable` with nothing after it opens your newest one in this browser.
   - **My projects** lists, opens, downloads, moves to the account, removes and imports them, the same as the other
     kinds. Code Lab's own "Save file" (a bare save) imports as a Hackable Platformer.
   - **Elsewhere:** a classmate's shared project, an invite, the class page and the 3D studio all open Hackable worlds
     in `/2d/hackable`.
   - **Someone else's project** opens to look at and try: nothing is saved, and "Make my own copy" makes it yours.
     There are no live rooms for Hackable Platformers yet; the Worker refuses to open one in a 3D or 2D room.
3. **Touch controls in Play.**
   - Touch screens (`pointer: coarse`) get the regular platformer's d-pad, Run and Jump.
   - The buttons press keys in the running level (arrows, space, x), the same keys the Hero's code reads. A kid who
     changes which key the Hero uses changes the buttons too.
   - On a screen held upright the buttons get their own strip under the level, like a handheld, so they never cover the
     Hero. The keyboard hint is hidden on touch screens.
4. **Layouts at the Duo's sizes** (folded about 466×678, open about 890×626), an iPhone (390×844) and an iPad held
   upright (820×1180).
   - **Play following the Hero** fills the height on tall screens instead of a band with empty space above and below
     (`followViewWidth`).
   - **On phones**, Play's tools are one row (no zoom buttons), and the coin count sits under them.
   - **Code at tablet widths:** the "Built-in · change a block…" chip wraps to its own line so the brick's name shows,
     and blocks start a little smaller.
   - **Build on an iPad held upright** still fills the level's height, so it starts zoomed in. A version that kept
     more of the level in view left a blank band above it, so I reverted it. Fit shows the whole level.
5. **The New project card:** "Hackable Platformer", with a **New** tag and two of the Hero's blocks over the level
   picture.
6. **Fixed in passing:** reopening a saved project and then opening Code said "Press Restart to try your changes" with
   nothing changed. A save stores blocks with sorted keys and a fresh compile doesn't, so the "did the code change?"
   check now ignores key order.

## How it's checked

- **New tests:**
  - Projects in this browser: the older save, many projects, the limit of 30, pictures, a damaged list.
  - The account document and back, unchanged; the starter is well under the size limit.
  - The account saver: revision, conflict.
  - My projects: list, move, import, links.
  - Files, routes, the follow camera, the touch buttons and the Restart fix.
  - **Worker:**
    - Hackable worlds report their kind.
    - They refuse live and platformer room tickets.
    - They save only over their own kind and drop unknown fields.
    - They refuse a damaged document.
- **In the browser** (dev server, signed out):
  - `/2d/lab/next` opened the older save as project 1.
  - New project made a second one, and My projects listed both with the new one's picture.
  - At the folded size the touch d-pad moved the Hero right and Jump jumped.
  - Build, Code and Play looked right at the sizes above.
- **Not checked:**
  - Signed-in saving against a running Worker: the account path is covered by unit tests only.
  - A real Duo or iPad: emulation can't fake a touch screen above 767px wide.

## Deploying

Same order as the shelf (docs/qa/code-lab-layers):

1. The shelf migration.
2. The Worker: it now accepts Hackable documents.
3. The site.

A site without the new Worker can't save Hackable projects to an account: the old Worker rejects the document.
Projects in this browser work either way.

## The landing page (second pass, same day)

- **A band after "Three ways to build":** "Every brick has code inside."
  - It has the three steps (Build it, Open it up, Change how it plays) and "Try the Hackable Platformer"
    (`/2d/hackable?new=1`).
  - The clip loops beside it, silent, once it is on screen; with reduced motion it stays on its poster with controls.
  - The colours are theme tokens `--landing-hack` and `--landing-hack-soft` (src/styles.css).
- **The hero demo:** its pill is now 3D | 2D | Hackable, and the clips play in turn.
- **For teachers:** a fourth card, "Kids learn to code because they want to", about the class shelf. The cards are now
  two by two.
- **FAQ and Help:**
  - The FAQ starts with "Do students need to know how to code?" (no).
  - Help has a Hackable Platformer entry, which says rooms aren't supported yet.
- **The clip:** `scripts/demo/record-hack.mjs`, the storyboard as a script.
  1. Paint a high ledge, put a coin on it.
  2. Play: one jump falls short.
  3. Code → + Power → Double jump.
  4. Play: jump, jump again, take the coin.

  The starter's first Walker is moved off camera before filming, because it knocks the Hero back on landing.
  `DEMO_PREVIEW=1` dry-runs it and logs the Hero's position; the timings were tuned that way, and the run ends with
  the coin count at 01. `site-media.mjs` now makes `demo-hack.webm / .mp4 / -poster.jpg` with the others.
- **Live on the page only once the Hackable Platformer is deployed:** the band links to it. The shelf card needs the
  shelf migration on production.
