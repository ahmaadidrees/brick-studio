import { BAUD_RATE, LineSplitter, formatMessage, parseLine, type OutMessage } from './protocol'
import { logOut, setSender, useMicrobit } from './store'

/*
 * The USB serial connection to a real micro:bit (Web Serial: Chrome and Edge on computers and Chromebooks).
 * Lines in become store updates; commands out become lines. Unplugging, or the tab being hidden, lets go of everything.
 */

/** The micro:bit's USB interface chip (Arm DAPLink) vendor id. */
const MICROBIT_VENDOR = 0x0d28

interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}
interface SerialLike {
  requestPort(o?: { filters: { usbVendorId: number }[] }): Promise<SerialPortLike>
  getPorts(): Promise<SerialPortLike[]>
  addEventListener(type: 'disconnect', h: (e: Event) => void): void
}

const serial = (): SerialLike | null =>
  typeof navigator !== 'undefined' && 'serial' in navigator ? ((navigator as unknown as { serial: SerialLike }).serial) : null

let port: SerialPortLike | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
let watching = false

function watch() {
  if (watching || typeof window === 'undefined') return
  watching = true
  const release = () => useMicrobit.getState().releaseAll()
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') release()
  })
  serial()?.addEventListener('disconnect', (e) => {
    if ((e.target as unknown) === port || (e as unknown as { port?: unknown }).port === port) void disconnect()
  })
}

const encoder = new TextEncoder()

function sendLine(m: OutMessage) {
  if (!writer) return
  const text = formatMessage(m)
  logOut(text)
  writer.write(encoder.encode(text + '\n')).catch(() => void disconnect('The micro:bit stopped answering'))
}

/** Asks the student to pick their micro:bit (the browser's own chooser), then listens to it. */
export async function connect(): Promise<void> {
  const s = serial()
  const st = useMicrobit.getState()
  if (!s) return st.setLink('unsupported')
  if (port) return
  watch()
  st.setLink('connecting')
  try {
    const p = await s.requestPort({ filters: [{ usbVendorId: MICROBIT_VENDOR }] })
    await p.open({ baudRate: BAUD_RATE })
    port = p
    writer = p.writable?.getWriter() ?? null
    setSender(sendLine)
    useMicrobit.getState().setLink('connected')
    sendLine({ t: 'hi' })
    void readLoop(p)
  } catch (err) {
    port = null
    const name = (err as { name?: string })?.name
    // Closing the chooser without picking is not an error.
    if (name === 'NotFoundError') useMicrobit.getState().setLink('idle')
    else useMicrobit.getState().setLink('error', name === 'SecurityError' ? 'This computer does not allow websites to use USB devices' : 'Could not open the micro:bit. Is another tab using it?')
  }
}

async function readLoop(p: SerialPortLike) {
  const decoder = new TextDecoder()
  const lines = new LineSplitter()
  while (port === p && p.readable) {
    reader = p.readable.getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        for (const line of lines.push(decoder.decode(value, { stream: true }))) {
          const m = parseLine(line)
          if (m) useMicrobit.getState().receive(m, line)
        }
      }
    } catch {
      // A read error (unplugged mid-read): fall through and disconnect.
      break
    } finally {
      reader.releaseLock()
      reader = null
    }
  }
  if (port === p) void disconnect('The micro:bit was unplugged')
}

export async function disconnect(error?: string): Promise<void> {
  const p = port
  port = null
  setSender(null)
  useMicrobit.getState().setLink(error ? 'error' : 'idle', error)
  try {
    await reader?.cancel()
  } catch {
    // already gone
  }
  try {
    writer?.releaseLock()
  } catch {
    // already gone
  }
  writer = null
  try {
    await p?.close()
  } catch {
    // already closed or unplugged
  }
}
