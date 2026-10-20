/*
 * The text lines a micro:bit running the Brickgineers Remote program and the browser send each other over USB serial
 * (115200 baud, one message per line, ending in "\n"). Both directions ignore lines they don't understand, so either
 * side can add messages later without breaking the other. Students can also write their own remote in MakeCode with
 * `serial write line`, so keep these short and easy to type.
 *
 * micro:bit → browser
 *   bg 1                 hello, with the protocol version (sent on start and in answer to `hi`)
 *   a 1 / a 0            button A down / up (also b, logo, p0, p1, p2)
 *   tilt <x> <y>         accelerometer in milli-g, each clamped to -1024…1024 (raw accelerometer: x is + when the right edge dips, y is + when the logo end dips away from you)
 *   g <gesture>          shake, up, down, left, right, faceup, facedown, freefall, loud
 *
 * browser → micro:bit
 *   hi                   ask for the hello
 *   show <image>         one of IMAGES
 *   num <n>              show a whole number (scrolls if more than one digit)
 *   text <words>         scroll text, at most 40 characters
 *   tone <hz> <ms>       play a tone
 *   tune <name>          one of TUNES
 *   clear                clear the LEDs
 */

export const PROTOCOL_VERSION = 1
export const BAUD_RATE = 115200

export type Pin = 'a' | 'b' | 'logo' | 'p0' | 'p1' | 'p2'
export const PINS: Pin[] = ['a', 'b', 'logo', 'p0', 'p1', 'p2']

export type Gesture = 'shake' | 'up' | 'down' | 'left' | 'right' | 'faceup' | 'facedown' | 'freefall' | 'loud'
export const GESTURES: Gesture[] = ['shake', 'up', 'down', 'left', 'right', 'faceup', 'facedown', 'freefall', 'loud']

/** micro:bit built-in images (MicroPython `Image.<NAME>` in upper case). */
export const IMAGES = ['heart', 'happy', 'sad', 'yes', 'no', 'surprised', 'angry', 'skull', 'star', 'diamond', 'target', 'arrow_n', 'arrow_s', 'arrow_e', 'arrow_w'] as const
export type ImageName = (typeof IMAGES)[number]

/** MicroPython `music.<NAME>` melodies. */
export const TUNES = ['power_up', 'power_down', 'jump_up', 'jump_down', 'ba_ding', 'entertainer', 'nyan', 'dadadadum', 'wawawawaa', 'punchline'] as const
export type TuneName = (typeof TUNES)[number]

export const TILT_MAX = 1024
export const TEXT_MAX = 40

export type InMessage =
  | { t: 'hello'; version: number }
  | { t: 'pin'; pin: Pin; down: boolean }
  | { t: 'tilt'; x: number; y: number }
  | { t: 'gesture'; g: Gesture }

export type OutMessage =
  | { t: 'hi' }
  | { t: 'show'; image: ImageName }
  | { t: 'num'; n: number }
  | { t: 'text'; text: string }
  | { t: 'tone'; hz: number; ms: number }
  | { t: 'tune'; name: TuneName }
  | { t: 'clear' }

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))

/** A line from the micro:bit, or null when it isn't one of ours (REPL noise, a student's own prints). */
export function parseLine(line: string): InMessage | null {
  const parts = line.trim().split(/\s+/)
  const [head, a1, a2] = parts
  if (!head) return null
  const h = head.toLowerCase()
  if (h === 'bg' && parts.length === 2) {
    const v = Number(a1)
    return Number.isInteger(v) && v > 0 ? { t: 'hello', version: v } : null
  }
  if ((PINS as string[]).includes(h) && parts.length === 2 && (a1 === '0' || a1 === '1')) return { t: 'pin', pin: h as Pin, down: a1 === '1' }
  if (h === 'tilt' && parts.length === 3) {
    const x = Number(a1), y = Number(a2)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { t: 'tilt', x: clampInt(x, -TILT_MAX, TILT_MAX), y: clampInt(y, -TILT_MAX, TILT_MAX) }
  }
  if (h === 'g' && parts.length === 2) {
    const g = a1.toLowerCase()
    return (GESTURES as string[]).includes(g) ? { t: 'gesture', g: g as Gesture } : null
  }
  return null
}

/** The line to send for a command, without the trailing newline. */
export function formatMessage(m: OutMessage): string {
  switch (m.t) {
    case 'hi':
      return 'hi'
    case 'show':
      return `show ${m.image}`
    case 'num':
      return `num ${clampInt(m.n, -99999, 99999)}`
    case 'text':
      return `text ${m.text.replace(/[\r\n]+/g, ' ').slice(0, TEXT_MAX)}`
    case 'tone':
      return `tone ${clampInt(m.hz, 20, 20000)} ${clampInt(m.ms, 1, 5000)}`
    case 'tune':
      return `tune ${m.name}`
    case 'clear':
      return 'clear'
  }
}

/** Splits a serial byte stream into lines, keeping a partial line until its end arrives. */
export class LineSplitter {
  private buf = ''
  push(chunk: string): string[] {
    this.buf += chunk
    const lines = this.buf.split(/\r?\n/)
    this.buf = lines.pop() ?? ''
    // A program printing without newlines must not grow the buffer forever.
    if (this.buf.length > 256) this.buf = ''
    return lines.filter((l) => l.length > 0)
  }
}
