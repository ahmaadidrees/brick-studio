# micro:bit editor: MakeCode coverage map

Plan · 2026-10-19 · Branch `claude/microbit-editor-plan` (from production `claude/projects-home` f093826) · Proposed
priorities, not implementation commitments. The design lives in [MICROBIT-EDITOR.md](MICROBIT-EDITOR.md).

The goal is "anything a student does in MakeCode for micro:bit, they can do in Brickgineers", plus the Brickgineers
link. This map tracks every MakeCode toolbox family so omissions are deliberate, the same way
[the Scratch coverage map](https://github.com/ahmaadidrees/brick-studio/blob/claude/code-lab-baseline/docs/CODE-LAB-SCRATCH-COVERAGE.md)
does for Code Lab.

**Basis** is what the generated MicroPython stands on: **native** (a MicroPython module does it), **runtime** (our
`bg` runtime file on the micro:bit, written in Python, see the design doc), or **none** (no practical way on
MicroPython). A row is only "done" when the block runs the same on the device and in the simulator, with a test. A
similar-looking block does not count.

**Tiers**
- **S1**: the first editor slice. A classroom can do the usual first five MakeCode lessons and drive a Brickgineers
  world.
- **S2**: the rest of the core toolbox. Most MakeCode classroom projects work.
- **S3**: the long tail, plus the most common extensions.
- **Later / Not planned**: written down so the gap is a choice.

V2-only blocks are marked **V2**. The editor targets **micro:bit V2 only** (decision D1 in the design doc).

## Basic

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| on start; forever | runtime | `on start` is the module body; each `forever` is a coroutine that yields every pass (MakeCode yields about 20 ms) | S1 |
| show number; show string; show icon; show leds; show arrow; clear screen | native `display`, `Image` | `show leds` uses a 5×5 field like MakeCode's. Scrolling text blocks the script, as in MakeCode | S1 |
| pause (ms) | runtime | `yield from bg.pause(ms)` so other scripts keep running | S1 |

## Input

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| on button A / B / A+B pressed; button is pressed | native `button_a/b` | A+B needs a short "both down" window, matched to MakeCode's feel by test | S1 |
| on shake / logo up / logo down / screen up / screen down / tilt left / tilt right / free fall / 3g / 6g / 8g | native `accelerometer` gestures | Map MakeCode names to MicroPython gesture names | S1 |
| acceleration (mg) x/y/z/strength; rotation pitch/roll | native + runtime math | Pitch/roll computed in the runtime, same formula and units as MakeCode | S1 |
| on logo pressed / released / touched / long pressed **V2**; logo is pressed **V2** | native `pin_logo` + runtime edge detection | Long press timed in the runtime | S1 |
| on loud sound / quiet sound **V2**; sound level **V2**; set loud sound threshold **V2** | native `microphone` | MakeCode's 0–255 level scale must be matched | S1 |
| light level; temperature | native | | S1 |
| compass heading; calibrate compass; magnetic force | native `compass` | Calibration is the device's own game; matches MakeCode | S2 |
| on pin P0/P1/P2 pressed / released; pin is pressed | native `pin.is_touched` + runtime edges | Capacitive vs resistive touch mode follows MakeCode's default per pin | S2 |
| running time (ms / micros) | native `running_time`, `time.ticks_us` | | S1 |
| set accelerometer range | native | | S3 |

## Music

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| play tone for beat; ring tone; rest; play melody (built-in or melody editor); start melody in background / until done / looping | native `music` + runtime for background playback | MakeCode's melody editor gets an equivalent field. Background melodies run as a coroutine | S1 |
| tempo (bpm); set / change tempo | native `music.set_tempo` | | S1 |
| play sound giggle / happy / hello / … **V2**; sound effect editor **V2** | native `audio` SoundEffect | Verify the built-in sounds exist with the same names, or bundle equivalents | S2 |
| set volume; volume **V2** | native `set_volume` | | S1 |
| set built-in speaker on/off **V2** | native `speaker` | | S2 |
| stop all sounds | native `music.stop`, `audio.stop` | | S2 |
| on music event (melody started / ended / note played …) | runtime | Only for melodies the runtime plays | S3 |
| analog pitch pin; set audio pin | native `music.play(pin=…)` | | S3 |

## LED

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| plot; unplot; toggle; point x y; plot brightness; point brightness | native `display.set_pixel/get_pixel` | MakeCode brightness 0–255 → MicroPython 0–9, rounded the same way every time | S1 |
| plot bar graph | runtime | Same scaling as MakeCode, including its serial side effect: decide whether to copy it | S2 |
| set / read brightness; stop animation; enable LED display on/off | native `display.on/off` + runtime | Global brightness is emulated per pixel | S2 |

## Radio

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| radio set group; send number / string / value; on received number / string / value | native `radio` + runtime packet format | Our own packet format (see the design doc). MakeCode limits strings to 19 characters and value names to 8; keep the same limits so programs move across. MicroPython's 32-byte default message length fits that. **Not wire-compatible with MakeCode radio in S1**, so a MakeCode micro:bit and a Brickgineers one can't talk yet | S1 |
| received packet signal strength / serial number / time | native `radio.receive_full` (RSSI, time) + runtime | Serial number carried inside our packet | S2 |
| set transmit power; set frequency band; set transmit serial number | native `radio.config` | | S2 |
| MakeCode wire compatibility | runtime | Read and write MakeCode's packet layout so mixed classrooms work | Later |

## Loops, Logic, Variables, Math, Text, Arrays, Functions

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| repeat; while; for index from 0 to; for element of list; break; continue | native Python | `repeat`, `while` and `for` yield once per pass, so a busy loop can't freeze the display or the radio. MakeCode runs tight loops without yielding: measure the speed cost | S1 |
| every (ms) | runtime | Coroutine with a drift-corrected timer | S1 |
| if / else if / else; compare; and / or / not; true / false | native | | S1 |
| variables: set, change, reporter | native | Variables are global, as in MakeCode. Names are made safe for Python | S1 |
| math: + − × ÷, remainder, min/max, abs, sqrt, sin/cos/tan, round/floor/ceiling/truncate, pick random, random true/false, constrain, map, integer ÷, idiv | native + runtime | MakeCode `÷` is float, `idiv` integer, and integer overflow behaves differently. Match MakeCode's results where a classroom would notice | S1 |
| text: join, length, compare, substring, char at, parse to number, convert to text, includes, index of | native | | S2 |
| arrays: create, get/set at index, length, add, remove, insert, find, reverse, shuffle, sort … | native lists | Out-of-range reads return 0 / undefined in MakeCode. Match that instead of crashing | S2 |
| functions with parameters and return values | native | Each call into a function that might pause is a `yield from` | S2 |

## Images and Game

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| create image / big image; show image at offset; scroll image; arrow images; icon images | native `Image` | | S2 |
| game: create sprite, move, turn, change/set x/y/direction, if on edge bounce, touching, touching edge, delete; score, change score, life, game over, countdown, pause/resume | runtime | A small sprite engine on the 5×5 grid in Python, same rules as MakeCode's | S2 |

## Pins

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| digital read / write; analog read / write; analog set period | native | | S2 |
| servo write; servo set pulse | native `write_analog` + runtime | | S2 |
| pulse in; on pin pulsed; set pull; set pin events | native `machine.time_pulse_us` + runtime | Verify `time_pulse_us` exists on V2 | S3 |
| map | native math | | S2 |
| i2c read/write number; spi write / frequency / format / pins | native `i2c`, `spi` | | S3 |

## Serial

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| serial write line / number / value / string; read line / until / string; on data received | native `print`, `uart` | **The Brickgineers link also uses USB serial.** Serial blocks and the link share it through the runtime (see the design doc) | S2 |
| serial redirect to pins / USB; set baud rate; set rx buffer size | native `uart.init` | Redirecting to pins disconnects the Brickgineers USB link. The editor warns | S3 |
| show data / console / charts (in the editor) | editor | Reads `name:value` serial lines and draws charts, like MakeCode | S2 |

## Control and Power

| MakeCode blocks | Basis | Plan | Tier |
| --- | --- | --- | --- |
| run in background | runtime | Starts a coroutine | S2 |
| reset; wait (µs); device serial number / name | native `reset`, `machine` | The device name comes from the runtime: define one consistent with MakeCode's five-letter names | S3 |
| raise event; on event; event timestamp / value | runtime | | S3 |
| power: deep sleep, wake on button / pin, full power **V2** (a beta MakeCode extension) | native `power` (`deep_sleep`, `off`) | | S3 |
| data logger **V2** (MakeCode extension) | native `log` | Also show the log in the editor | S3 |

## Extensions

| MakeCode extension | Plan | Tier |
| --- | --- | --- |
| NeoPixel | native `neopixel`, with the same block shapes as MakeCode's extension | S3 |
| Servo (pxt-servo) | runtime on `write_analog` | S3 |
| Sonar / ultrasonic (HC-SR04) | runtime on pulse timing | S3 |
| Popular kits (Kitronik, ELECFREAKS, DFRobot, 4tronix) | Only the kits your schools actually use, as runtime files. Ask before choosing | Later |
| Bluetooth services | **Not planned on MicroPython** (see D2 in the design doc) | Not planned |
| Arbitrary GitHub MakeCode extensions | Not planned. They are TypeScript compiled by MakeCode | Not planned |

## Editor features beyond blocks

| MakeCode feature | Plan | Tier |
| --- | --- | --- |
| Simulator beside the code | The micro:bit Foundation's MicroPython V2 simulator, self-hosted, running the exact generated Python | S1 |
| Download / flash over WebUSB | WebUSB flashing with partial flashing. Plain .hex download as the fallback (and for iPads) | S1 |
| Projects and sharing | Projects live in My projects as a new "micro:bit" kind. Share links follow the 2D share rules | S1 |
| JavaScript / Python view | A Python view, read-only in S1. Editing Python is S3, and is one way: Python edits can't go back to blocks | S1 read / S3 edit |
| LED image, melody and sound-effect editors | Fields inside blocks | S1 (LED, melody) / S2 (sound effect) |
| Tutorials | Step-by-step tutorials in the editor, starting with the first five MakeCode lessons | S2 |
| Import a MakeCode .hex or project | Not planned in the first slices. MakeCode stores TypeScript source, which would need converting | Later |
| Offline use | All files come from brickgineers.com. A service worker keeps the editor working when the network is down | S2 |
