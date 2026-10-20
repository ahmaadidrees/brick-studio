# Brickgineers Remote firmware

`main.py` is the one fixed MicroPython program for the BBC micro:bit V2. It is flashed once; all mapping of inputs to game actions happens in the browser. The built file is `public/microbit/brickgineers-remote.hex` (served at `/microbit/brickgineers-remote.hex`).

## Protocol (USB serial, 115200 baud, one line per message)

The source of truth is `src/microbit/protocol.ts`.

micro:bit → browser
- `bg 1` on start and in answer to `hi`
- `a 1` / `a 0` for a, b, logo, p0, p1, p2 (down / up)
- `tilt <x> <y>` milli-g, clamped to ±1024, sent when either value moved by more than 40 (checked 20×/s), plus a keep-alive every 500 ms
- `g <gesture>`: shake, up, down, left, right, faceup, facedown, freefall, loud

browser → micro:bit
- `hi`, `show <image>`, `num <n>`, `text <words>` (max 40 chars), `tone <hz> <ms>`, `tune <name>`, `clear`
- Unknown or malformed lines are ignored. Lines over 64 characters are dropped. Display and music never block the input loop. Tones and tunes play on the built-in speaker only (not pin 0), so they don't disturb the p0 touch input.

## Rebuild

```bash
npm run build:microbit-remote
```

This adds `main.py` to the vendored MicroPython with `@microbit/microbit-fs` and writes `public/microbit/brickgineers-remote.hex`. Run `npx vitest run firmware/remote/remote-hex.test.ts` to check the hex matches `main.py`. Rebuild and commit the hex whenever `main.py` changes.

To flash: drag the `.hex` onto the MICROBIT drive.

## Vendored firmware

`vendor/micropython-microbit-v2.1.2.hex`, the official MicroPython for micro:bit V2, v2.1.2 (V2 only):
- URL: https://github.com/microbit-foundation/micropython-microbit-v2/releases/download/v2.1.2/micropython-microbit-v2.1.2.hex
- SHA-256: `66fae07b71777e9e3a6b5122a27930b24cc0be5002ab9a67e92494c54a1645ef` (checked by the build script)
