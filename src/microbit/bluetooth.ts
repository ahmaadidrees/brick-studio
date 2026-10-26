import { create } from 'zustand'
import { IMAGES, TILT_MAX, type ImageName, type OutMessage, type Pin } from './protocol'
import { BleSession, fromBase64, scratchLinkSocketClass, type Peripheral } from './scratchLink'
import { logOut, setSender, useMicrobit } from './store'

/*
 * The Bluetooth link for iPads, through Scrub's Scratch Link bridge. The micro:bit runs Scratch's own micro:bit program
 * (scratch.mit.edu/microbit), flashed once, not the Brickgineers Remote program: that's the program Scrub's bridge
 * expects. Its packets become the same store updates as the USB link, so assignments and reactions work unchanged.
 * Sounds don't: Scratch's program has no speaker commands.
 *
 * Scratch micro:bit protocol (scratch-vm `extensions/scratch3_microbit`), service 0xf005:
 *   rx 5261da01-…  notifications, at least 10 bytes: tiltX int16 BE, tiltY int16 BE (tenths of a degree), button A,
 *                  button B, touch pins 0, 1, 2, gesture bits (1 shaken, 2 jumped, 4 moved)
 *   tx 5261da02-…  0x81 + up to 19 ASCII characters (scroll text), 0x82 + 5 row bytes (bit 0 = left column)
 */

export const SCRATCH_MICROBIT_HEX_PAGE = 'https://scratch.mit.edu/microbit'

const SERVICE = 0xf005
const RX = '5261da01-fa7e-42ab-850b-7c80220097cc'
const TX = '5261da02-fa7e-42ab-850b-7c80220097cc'
const CMD_TEXT = 0x81
const CMD_LEDS = 0x82
const TEXT_MAX = 19
/** No packet for this long means the micro:bit is gone (Scratch uses the same). */
const DATA_TIMEOUT_MS = 4500
const SHAKEN = 1

export type BluetoothPhase = 'idle' | 'searching' | 'connecting' | 'connected'

interface BluetoothState {
  phase: BluetoothPhase
  /** micro:bits found while searching, by Bluetooth name (Scratch's program shows its name on the LEDs). */
  found: Peripheral[]
}

export const useBluetooth = create<BluetoothState>(() => ({ phase: 'idle', found: [] }))

/** True inside Scrub, where a page can reach Bluetooth. */
export const bluetoothAvailable = () => scratchLinkSocketClass() !== null

/** "BBC micro:bit [zuvot]" → "zuvot", the name the micro:bit scrolls on its LEDs. */
export function shortName(name: string): string {
  return /\[([^\]]+)\]/.exec(name)?.[1] ?? name
}

/* ---------- Packets in ---------- */

export interface ScratchPacket {
  /** Tenths of a degree; + is the right edge down. */
  tiltX: number
  /** Tenths of a degree; - is the logo end tipped away (Scratch's "front"). */
  tiltY: number
  a: boolean
  b: boolean
  pins: [boolean, boolean, boolean]
  gestures: number
}

export function parsePacket(bytes: Uint8Array): ScratchPacket | null {
  if (bytes.length < 10) return null
  const int16 = (hi: number, lo: number) => {
    const v = (hi << 8) | lo
    return v >= 0x8000 ? v - 0x10000 : v
  }
  return {
    tiltX: int16(bytes[0], bytes[1]),
    tiltY: int16(bytes[2], bytes[3]),
    a: bytes[4] !== 0,
    b: bytes[5] !== 0,
    pins: [bytes[6] !== 0, bytes[7] !== 0, bytes[8] !== 0],
    gestures: bytes[9],
  }
}

/** Tenths of a degree → the USB link's milli-g scale (what the tilt would read on the accelerometer). */
export function tenthsToMilliG(tenths: number): number {
  const deg = Math.max(-90, Math.min(90, tenths / 10))
  return Math.round(Math.sin((deg * Math.PI) / 180) * TILT_MAX)
}

let last: ScratchPacket | null = null

function receive(p: ScratchPacket) {
  const st = useMicrobit.getState()
  if (!last) st.receive({ t: 'hello', version: 1 })
  const pins: [Pin, boolean, boolean | undefined][] = [
    ['a', p.a, last?.a],
    ['b', p.b, last?.b],
    ['p0', p.pins[0], last?.pins[0]],
    ['p1', p.pins[1], last?.pins[1]],
    ['p2', p.pins[2], last?.pins[2]],
  ]
  for (const [pin, down, before] of pins) {
    if (down !== before && (before !== undefined || down)) st.receive({ t: 'pin', pin, down }, `${pin} ${down ? 1 : 0}`)
  }
  const x = tenthsToMilliG(p.tiltX)
  const y = tenthsToMilliG(-p.tiltY)
  if (!last || x !== tenthsToMilliG(last.tiltX) || y !== tenthsToMilliG(-last.tiltY)) st.receive({ t: 'tilt', x, y })
  if (p.gestures & SHAKEN && !((last?.gestures ?? 0) & SHAKEN)) st.receive({ t: 'gesture', g: 'shake' }, 'g shake')
  last = p
}

/* ---------- Commands out ---------- */

const PICTURES: Record<ImageName, string> = {
  heart: '01010 11111 11111 01110 00100',
  happy: '00000 01010 00000 10001 01110',
  sad: '00000 01010 00000 01110 10001',
  yes: '00000 00001 00010 10100 01000',
  no: '10001 01010 00100 01010 10001',
  surprised: '01010 00000 00100 01010 00100',
  angry: '10001 01010 00000 11111 10101',
  skull: '01110 10101 11111 01110 01110',
  star: '00100 11111 01110 01010 10001',
  diamond: '00100 01010 10001 01010 00100',
  target: '00100 01110 11011 01110 00100',
  arrow_n: '00100 01110 10101 00100 00100',
  arrow_s: '00100 00100 10101 01110 00100',
  arrow_e: '00100 00010 11111 00010 00100',
  arrow_w: '00100 01000 11111 01000 00100',
}

/** Five row bytes for Scratch's LED command; bit 0 is the left column. */
export function pictureRows(image: ImageName): Uint8Array {
  return Uint8Array.from(PICTURES[image].split(' ').map((row) => [...row].reduce((v, c, i) => (c === '1' ? v | (1 << i) : v), 0)))
}

/** The bytes to write for a Remote command, or null when Scratch's program can't do it (sounds, hello). */
export function commandBytes(m: OutMessage): Uint8Array | null {
  const text = (s: string) => {
    const ascii = s.replace(/[^\x20-\x7e]/g, '').slice(0, TEXT_MAX)
    return ascii ? Uint8Array.from([CMD_TEXT, ...[...ascii].map((c) => c.charCodeAt(0))]) : null
  }
  switch (m.t) {
    case 'show':
      return IMAGES.includes(m.image) ? Uint8Array.from([CMD_LEDS, ...pictureRows(m.image)]) : null
    case 'num':
      return text(String(m.n))
    case 'text':
      return text(m.text)
    case 'clear':
      return Uint8Array.from([CMD_LEDS, 0, 0, 0, 0, 0])
    default:
      return null
  }
}

/* ---------- The session ---------- */

let session: BleSession | null = null
let dataTimer: ReturnType<typeof setTimeout> | undefined
/** One write at a time; a newer command replaces one still waiting. */
let writing = false
let queued: Uint8Array | null = null

function armDataTimeout() {
  clearTimeout(dataTimer)
  dataTimer = setTimeout(() => void disconnectBluetooth('The micro:bit stopped answering. Is it still on?'), DATA_TIMEOUT_MS)
}

function flush() {
  if (writing || !queued || !session) return
  const bytes = queued
  queued = null
  writing = true
  session.write(SERVICE, TX, bytes).catch(() => {}).finally(() => {
    writing = false
    flush()
  })
}

function sendCommand(m: OutMessage) {
  const bytes = commandBytes(m)
  if (!bytes) return
  logOut(m.t === 'show' ? `show ${m.image}` : m.t === 'num' ? `num ${m.n}` : m.t === 'text' ? `text ${m.text}` : m.t)
  queued = bytes
  flush()
}

/** Opens Scrub's bridge and starts listing nearby micro:bits running Scratch's program. */
export async function searchBluetooth(): Promise<void> {
  const Socket = scratchLinkSocketClass()
  if (!Socket || session) return
  useBluetooth.setState({ phase: 'searching', found: [] })
  useMicrobit.getState().setLink('connecting')
  const s = new BleSession(Socket, {
    onPeripheral: (p) => useBluetooth.setState((st) => ({ found: [...st.found.filter((f) => f.id !== p.id), p] })),
    onNotify: (base64) => {
      const p = parsePacket(fromBase64(base64))
      if (!p) return
      armDataTimeout()
      receive(p)
    },
    onClose: (error) => {
      if (session !== s) return
      finish(error)
    },
  })
  session = s
  try {
    await s.start()
    await s.discover([SERVICE])
  } catch {
    if (session === s) void disconnectBluetooth("Couldn't search for micro:bits. Is Bluetooth on, and does Scrub have permission?")
  }
}

/** Connects to a micro:bit from the search list. */
export async function connectBluetooth(id: Peripheral['id']): Promise<void> {
  const s = session
  if (!s) return
  useBluetooth.setState({ phase: 'connecting' })
  try {
    await s.connect(id)
    if (session !== s) return
    last = null
    setSender(sendCommand)
    useMicrobit.getState().setLink('connected')
    useBluetooth.setState({ phase: 'connected' })
    armDataTimeout()
    await s.subscribe(SERVICE, RX)
  } catch {
    if (session === s) void disconnectBluetooth("Couldn't connect. Is that micro:bit running Scratch's micro:bit program?")
  }
}

function finish(error?: string) {
  session = null
  clearTimeout(dataTimer)
  writing = false
  queued = null
  last = null
  setSender(null)
  useBluetooth.setState({ phase: 'idle', found: [] })
  useMicrobit.getState().setLink(error ? 'error' : 'idle', error)
}

export async function disconnectBluetooth(error?: string): Promise<void> {
  const s = session
  if (!s) return finish(error)
  session = null
  s.close(error)
  finish(error)
}

/** Lets go of everything when the tab is hidden, like the USB link. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' && session) useMicrobit.getState().releaseAll()
  })
}
