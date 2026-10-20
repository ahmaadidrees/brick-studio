# micro:bit on Brickgineers: editor and controller design

Draft for discussion · 2026-10-19 · Branch `claude/microbit-editor-plan`, made from production `claude/projects-home`
f093826 (live on brickgineers.com since 2026-10-15). No product code changes in this pass. The block-by-block plan is
in [MICROBIT-COVERAGE.md](MICROBIT-COVERAGE.md).

## Product promise

Students program their micro:bit on brickgineers.com and can do what they do in MakeCode. Then they turn the same
micro:bit into a controller for any of their Brickgineers worlds: 3D, platformer or race. They write both ends: the
program on the micro:bit decides what it sends, and the world can answer back (a heart on the LEDs when you grab a
coin, a buzz when you get hurt).

Why build our own instead of sending students to MakeCode:
- MakeCode is slow on school Chromebooks, and at one school its domains don't load on the network.
  brickgineers.com does load there, so an editor served from our own origin avoids the filter.
- The controller link needs blocks that MakeCode doesn't have, plus a connection that stays open while the world runs.
- Projects, sign-in and classes already live in Brickgineers (My projects, since the 2026-10-15 release).

## What's live today, and where a micro:bit plugs in

Production has three modes. Each already merges more than one input source, so a micro:bit is one more source and
not a new control system.

| Mode | Route | Input today | Where the micro:bit plugs in |
| --- | --- | --- | --- |
| 3D world | `/build`, `/live/<id>` | Keyboard, on-screen joystick | `src/brick/BrickStudioApp.tsx`: the touch joystick calls `setMove(x, z, magnitude, running)` and a jump nonce. A tilt stick feeds the same call, so movement is analog |
| Platformer | `/2d/build`, `/2d/play/…`, rooms | Keyboard, game controller, touch | `src/platformer/input/input.ts`: `Input` merges keys, `padHeld` and `touchHeld` into actions (`left right up down jump run …`). Add a `microbitHeld` set the same way |
| Race | `/2d/build?kit=race-…` | Same `Input` | Same `Input`. `src/platformer/race/raceRun.ts:143` makes `steer` −1…1 from left/right keys; add an optional analog steer so tilting steers proportionally |

Because input is local to each student's browser, a micro:bit in a multiplayer room drives only that student's own
character, and **the room Worker needs no changes for the USB link.**

## Decisions to agree

| # | Decision | Proposal | Why |
| --- | --- | --- | --- |
| D1 | Which micro:bits | **V2 only** | MicroPython gives programs a 64 KB heap on V2 and only 10 KB on V1, which is too little for the event runtime. V2 has been the only model sold since 2020. Confirm your schools' kits |
| D2 | What runs on the micro:bit | **Blocks → MicroPython** (firmware pinned at v2.1.2, the release python.microbit.org ships) with a small Brickgineers runtime file (`bg.py`) | No compiler to host: the firmware is a static file, and `@microbit/microbit-fs` (MIT) adds our `.py` files to it in the browser. The same Python runs in the official simulator. Students get a real Python view of their blocks |
| D3 | The link to the world | **USB serial first, radio gateway second. No Bluetooth** | MicroPython on micro:bit has no Bluetooth for user programs, only the radio. USB is reliable on Chromebooks. The radio gateway covers iPads and cable-free rooms |
| D4 | Where it lives and what it's called | **A route in the same app**, for example `/remote`, with a product name of our own (for example "Brickgineers Remote") and the wording "works with the BBC micro:bit". **No `microbit.brickgineers.com`** | Shares sign-in, My projects and classes. The Micro:bit Educational Foundation's brand guidelines don't allow "micro:bit" in a product name, logo or domain name; "works with the BBC micro:bit" is their recommended wording |
| D5 | Editor | **Blockly**, with MakeCode's categories, colors, block shapes and wording | Students switching from MakeCode find blocks where they expect them. Code Lab already uses Blockly (on its unmerged branches; Blockly isn't in production `package.json` yet). Don't copy MakeCode's code; match its behavior |
| D6 | Network | **Everything served from brickgineers.com**: firmware, simulator, Blockly, fonts. A service worker caches the editor | That's what gets past the school filter that blocks MakeCode. Offline use is a bonus |
| D7 | Python editing | Read-only Python view in S1; editable Python later, **one way** (Python can't go back to blocks) | Round-tripping is what makes MakeCode's JavaScript view expensive. We don't need it to start |

What we give up with D2, said plainly:
- **Speed:** MicroPython is slower than MakeCode's compiled code. It's fine for buttons, display, radio and sensors.
  Tight pin loops, NeoPixel animation and fast sound may need care.
- **Extensions:** MakeCode's GitHub extensions can't run. We add the kits our schools use (coverage map, Extensions).
- **Radio wire format:** a MakeCode micro:bit and a Brickgineers one won't talk over radio until we copy MakeCode's
  packet layout (coverage map, Radio, Later).

## How it works

```text
 Blockly workspace JSON
   → typed program (IR), validated: size limits, unknown blocks rejected      src/microbit/program/
   → Python code (main.py) + bg.py runtime                                    src/microbit/python/
   → micro:bit file system image + official MicroPython V2 firmware → .hex    (micro:bit Foundation JS library)
   → flash over WebUSB (@microbit/microbit-connection, MIT: partial flashing)  or download the .hex
 The simulator runs the same main.py + bg.py beside the blocks.
```

- The IR step is the same idea as Code Lab's `program/compile.ts`: no `eval`, no string-pasting of block text. Every
  block has a typed definition, and codegen is a function of the IR. Variable and function names are made safe
  (Python keywords, unicode, duplicates).
- The libraries are the ones python.microbit.org is built on. The firmware hex is a static asset with a version in its name. A project records which runtime and firmware
  version it was built with, so an old project still flashes the same way.

### The runtime (`bg.py`)

MakeCode is event-driven: `on button A pressed`, several `forever`s, `pause` inside handlers, all at once.
MicroPython has one thread, and the micro:bit build has no `asyncio`. The runtime makes up the difference with
**coroutines (Python generators and `yield from`, core MicroPython features; still to test on a board)**:

- Every script compiles to a generator function. `pause(ms)` becomes `yield from bg.pause(ms)`. Scripts that never
  pause still get a `yield`, so they are generators too.
- One scheduler loop (`bg.run()`) steps the ready coroutines and, every pass, checks for events: buttons
  (`was_pressed`), gestures (`was_gesture`), logo and pin touch edges, loud/quiet sounds, radio packets, serial
  lines, timers. It then starts the matching handlers.
- Loops (`repeat`, `while`, `for`) yield once per pass, so a busy loop can't starve the display, the radio or the
  link. MakeCode doesn't yield in tight loops; the cost needs measuring.
- Blocking-looking blocks (`show string` scrolling, `play melody until done`) start the hardware without waiting
  and then yield until the expected end.
- Re-entry follows MakeCode: if `on button A` is still running when A is pressed again, decide by test whether the
  press is queued or dropped (match MakeCode).
- Errors: an exception shows a short code on the LEDs and is sent to the editor over serial with the block's ID, so
  the editor can highlight the block that broke.

Example: what a student's blocks become.

```python
# generated from blocks — do not edit
from microbit import *
import bg

score = 0

def on_a():
    global score
    score += 1
    yield from bg.show_number(score)

def forever_1():
    while True:
        if bg.tilt_x() > 30:
            bg.link.hold('right')
        else:
            bg.link.release('right')
        yield from bg.pause(20)

bg.on_button('A', on_a)
bg.forever(forever_1)
bg.run()
```

## The Brickgineers link

### Blocks (a "Brickgineers" category on the micro:bit side)

| Block | Meaning |
| --- | --- |
| `press [jump]` · `hold [right]` · `release [right]` | An action, as if a key were pressed. The action list is the world's own: `left right up down jump run` (and for race: `gas brake`) |
| `set stick x (…) y (…)` | Analog stick, −100…100 on each axis. Drives 3D movement and race steering |
| `use tilt as the stick` | Shortcut: tilt sets the stick every pass |
| `send number [name] = (…)` · `send message [text]` | Free-form values for Code Lab worlds later; the live modes ignore them |
| `when the world says [coin / hurt / goal / lap / finish / any]` · `world message` | Events coming back from the game |
| `connected to a world?` | Reporter |

The **default remote** is itself a blocks project in the library: tilt is the stick, A jumps, B runs. Students can
open it, see how it works and remix it. This matches Code Lab's rule: use it, look inside, invent your own.

### Messages

Text lines over USB serial, prefixed so they don't mix with the student's own serial output:

```text
micro:bit → world   @bg1 hi <deviceId> <runtimeVersion>
                    @bg1 d jump      (down)     @bg1 u jump   (up)     @bg1 p jump   (tap)
                    @bg1 s 40 -100   (stick)    @bg1 v speed 12        @bg1 m hello
world → micro:bit   @bg1 e coin      @bg1 e lap 2      @bg1 m <text>
```

- Stick updates are sent only when they change, at most about 30 times a second. Lines are short, and nothing ever
  contains byte 0x03 (Ctrl-C would stop the program).
- In the browser, a `MicrobitLink` service turns lines into calls into the input hooks above. It ignores unknown
  lines, limits messages per second, and releases every held action when the micro:bit is unplugged or the tab
  loses focus. That's the same rule as the existing `blur` handling in `Input`.
- **Connecting** is a "Connect micro:bit" button in each mode's settings, plus on the `/remote` page. WebUSB needs
  a click from the user, and the browser remembers the device afterwards.

### Transports

1. **USB serial (S1).** Chromebooks and laptops. The cable is also the flashing cable.
2. **Simulator (S1).** The micro:bit Foundation's MicroPython V2 simulator (MIT) runs in an iframe and is built to
   be self-hosted. It passes serial and radio output out through `postMessage`, and takes button, sensor, serial and
   radio input back in. So it can be the controller for a world opened in the same browser, and a student without
   hardware can still play and test. Its API is marked "not yet stable", so pin the version we host.
3. **Radio gateway (S2): for iPads and cable-free rooms.** Students' micro:bits send the same messages over radio.
   One gateway micro:bit on the teacher's computer forwards them to the Brickgineers Worker, which sends each one to
   the student's tab.
   - To pair, the student presses A+B, the LEDs show a 3-digit code, and they type it into Brickgineers.
   - This adds a network round trip. It needs measuring on a school network before we promise it for the
     platformer, which needs fast reactions more than 3D or race do.
   - Also needs: radio group per class, and a check that each student can only drive their own character.

## iPads

- **No WebUSB, Web Serial or Web Bluetooth in iPad Safari.** Flashing and the USB link don't work there.
- **Programming:** the student downloads the `.hex` in Safari, opens it in Files, and shares it to the official
  micro:bit app, which sends it over Bluetooth (V2 only). That's the micro:bit Foundation's route for Python on
  iPad. **Risk:** a support article says non-MakeCode hex files can fail in the app, so test our hex on the school's
  iPads early. The simulator works on iPads as normal.
- **Controller:** the radio gateway (S2) on the teacher's computer, or a Chromebook or laptop at the station.
- **Later, if iPads matter a lot:** a small native wrapper app with Bluetooth flashing built in. Not planned yet.

## Projects and classes

- A new project kind, **`microbit`**, next to `3d`, `platformer` and `race` in `src/projects/projectFile.ts`
  (`ProjectKind`). It stores the blocks JSON, the runtime and firmware versions, and the name. The Python and the hex
  are always rebuilt from the blocks, never stored as the source.
- Import and export as a project file like the other kinds. Export `.hex` and `.py` too.
- A teacher's class view lists students' micro:bit projects like other projects. Assigning a starter remote to a
  class comes later.

## Checks

- **Codegen tests:** golden files per block (blocks JSON → expected Python), plus tests that reject an invalid
  program.
- **Behavior tests:** run generated programs in the simulator headlessly in CI, script the inputs (press A, tilt,
  shake) and assert on LEDs, sound and serial output. For S1 blocks, compare against what MakeCode does with the same
  program on a real micro:bit, and record the results the way Code Lab's conformance docs do.
- **On-device checklist:** a page like `docs/CHROMEBOOK-CHECKLIST.md`: flash time, first connect, controller
  latency (tilt to on-screen movement, in ms) in all three modes, unplug/replug, two tabs.
- **School network check:** load `/remote` and flash at the school where MakeCode is blocked, before S1 is called
  done.

## Slices

| Slice | Done means |
| --- | --- |
| **S0 spike** (localhost) | Hand-written MicroPython remote + `MicrobitLink` over Web Serial drives the Hero, a race car and the 3D character. Latency measured. Flashing a generated hex over WebUSB from our page works |
| **S1 editor + USB controller** | `/remote` with Blockly, S1 blocks, simulator, Python view, WebUSB flash, My projects. Default remote in the library. "Connect micro:bit" in all three modes. Events back for coin and hurt (platformer), lap and finish (race) |
| **S2** | S2 blocks, data charts, tutorials, offline. Radio gateway with iPad pairing |
| **S3** | Long tail, NeoPixel/servo/sonar, editable Python |
| **Later** | Code Lab worlds react to free-form `send number / message` with their own hats. MakeCode radio wire compatibility. MakeCode project import |

## Open questions

1. How many micro:bits are V1 in your classrooms (D1)?
2. At the school where MakeCode fails, what exactly is blocked: makecode.com domains, the CDN, WebSockets? Does
   brickgineers.com fully work there, including rooms?
3. Do the iPads have the micro:bit app, and can students install apps? Are the iPads managed?
4. Can managed Chromebooks use WebUSB/Web Serial, or has the admin blocked it? Admins control this with
   `DefaultWebUsbGuardSetting` / `WebUsbBlockedForUrls` and `DefaultSerialGuardSetting` / `SerialBlockedForUrls`,
   so test on a real student device, and if needed ask IT to allow brickgineers.com.
5. Which kits and accessories do you use (NeoPixels, servos, a robot kit)? That decides the Extensions row.
6. Where should the remote's events come from for 3D (coin, hurt)? The 3D world has no score events yet.
7. Naming: what do we call it? "Brickgineers Remote" is a placeholder (see D4).

## Alternatives considered

- **Send students to MakeCode.** It's slow on school Chromebooks, blocked at one school, and has no Brickgineers
  link blocks.
- **Host a static MakeCode ourselves** (`pxt staticpkg`; pxt-microbit is MIT). It gets past the network block and
  keeps everything MakeCode does. It's still the same heavy editor, it's unclear how sharing and extensions behave in
  a static build, and the link would have to be a MakeCode extension. **This is a good stopgap for the blocked school
  while S1 is built**, not the product.
- **Bluetooth link.** Not possible from MicroPython (D3), and not available in iPad Safari anyway.
