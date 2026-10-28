# Code Lab UX audit — October 27, 2026

Walked every surface of `/2d/lab/next` (main `706e7f8`) at 1280×800 and 1024×768. The owner's verdict from the
playtest: all the pieces are there, but it feels all over the place, unpolished and at times overwhelming. The editor
isn't easy to find, there is no motion, and new bricks must take a name from a preset list.

## What's in the way

1. **Too many surfaces, each its own style.** In use at once or in turn:
   - the Bricks drawer;
   - a floating Undo/Redo pill and a floating zoom pill;
   - a bottom "Placing …" strip;
   - the right-hand brick card;
   - the code dock, which replaces the drawer;
   - a full-screen Workshop with its own Test room;
   - three modals (New brick, the name picker, confirms).

   The code dock is a dark Blockly theme inside a light app.
2. **The editor is three steps deep, and the first is a trap.** Ground is always the active brush, so clicking a brick
   in the world paints unless you press Esc first. Then the card opens, then See inside.
3. **The card's tabs don't read as tabs.**
   - Sliders is implied, Look is a text link, and Look has a "Back to sliders" link.
   - The status line is jargon: "1 in this level · copy 1 selected · One per level. Place it again to move it."
   - Values show raw decimals (jump standing 8.125).
   - The Hero shows 4 sliders plus "More sliders for the Hero (28)".
4. **The code dock spends its top on chrome.** Three header rows sit above the blocks: the card header, the remix
   banner and the editor toolbar.
   - The stage shrinks to about 40% without refitting, so the level sits cut off in a corner.
   - Scripts are scattered with large gaps.
   - "Changes apply on Restart" floats over the stage.
5. **Floating pills collide.** On the Look tab, the Undo/Redo pill overlaps the stage bar's Restart.
6. **Two different code editors.**
   - The dock has a categorized flyout and a small toolbar.
   - The Workshop has a continuous palette, +Variable / +List / +Block / Tidy / Center / N sliders, a My Blocks shelf,
     Code / Costumes / Sounds tabs and a Test room.

   Students learn the editor twice.
7. **The "Placing Ground" strip stays** after Esc and while a card is open, so it says you're placing when you aren't.
8. **New brick takes three steps.**
   1. A modal of six templates.
   2. A modal grid of about 45 preset names, with taken ones greyed out. You can't type a name.
   3. The full-screen Workshop.
9. **No motion.** Panels, the dock and the Workshop appear instantly, and the stage resizes instantly. Nothing shows
   where the code came from or where it went.
10. **Play has two floating bars**: the keys hint, and Pause / Restart / Whole level / Follow the Hero / zoom. They sit
    side by side and partly overlap.
11. **The Build view wastes the screen.** The level is fit small in the middle of a large empty field.

## Direction (agreed 2026-10-27)

- **Three modes, top center: Build · Code · Play** (keys 1, 2, 3). Code is a first-class mode like Scratch's Code tab.
  - It opens on the selected brick, or the Hero if none is selected.
  - Double-clicking a brick in Build opens its code.
- **One shell in every mode.** A left column, the stage and a right column, which slide and resize together, so you
  never lose your place.
  - **Build:** Bricks drawer on the left; the world; an inspector on the right (Sliders · Look) only while something
    is selected.
  - **Code:** Scratch's arrangement, which students already know: palette and scripts on the left and in the middle;
    the stage at the top right with Play / Restart; the level's bricks below it ("In this level").
  - **Play:** the world fills the screen, with one small bar.
- **One code editor.** Code mode replaces the Workshop and the Test room; the stage gets a "Just this brick" toggle.
- **Select by default in Build.** Picking a brick from the drawer arms painting, and Esc or the pointer returns to
  select. The bottom strip shows only while painting.
- **New brick in one step.** "+" in the level's brick list makes "My brick 1" and opens it in Code with the name
  selected to type over.
  - "Start from…" chips (Walker, Coin, Spring, Goal) sit in the empty script area.
  - Renaming is a click on the name anywhere it's shown.
- **Remix is a quiet chip on the name** ("Built-in · change a block to make it yours"), not a banner.
- **Plain words.** "2 in this level"; "Every Walker / Just this one". Values are rounded for display.
- **Motion:** 150–250 ms ease-out.
  - Panels slide and the stage resizes with them.
  - Mode changes cross-fade.
  - Code opens zooming from the brick you picked.
  - Selection pulses once, and running blocks glow.
  - All of it is off under reduced motion.

The clickable mocks: https://claude.ai/artifact/KG4VNmSi1dQyEHUGtuajJM
