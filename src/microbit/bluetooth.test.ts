import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDLE_BOARD } from './assign'
import { bluetoothAvailable, commandBytes, connectBluetooth, disconnectBluetooth, parsePacket, pictureRows, searchBluetooth, shortName, tenthsToMilliG, useBluetooth } from './bluetooth'
import { fromBase64, toBase64, type ScratchLinkSocket } from './scratchLink'
import { useMicrobit } from './store'

type Msg = { jsonrpc: '2.0'; id?: number; method?: string; params?: Record<string, unknown>; result?: unknown }

/** Scrub's socket, answering like Scratch Link: discover finds one micro:bit, connect and read succeed. */
class FakeSocket implements ScratchLinkSocket {
  static last: FakeSocket | null = null
  sent: Msg[] = []
  private opened = false
  private onOpen = () => {}
  private onClose: (e?: unknown) => void = () => {}
  private handle: (m: Msg) => void = () => {}
  constructor(readonly type: string) {
    FakeSocket.last = this
  }
  open() {
    this.opened = true
    queueMicrotask(() => this.onOpen())
  }
  close() {
    this.opened = false
    this.onClose()
  }
  isOpen() {
    return this.opened
  }
  sendMessage(m: object) {
    const msg = m as Msg
    this.sent.push(msg)
    if (msg.method === undefined) return
    queueMicrotask(() => {
      if (msg.method === 'discover') this.handle({ jsonrpc: '2.0', method: 'didDiscoverPeripheral', params: { peripheralId: 'p1', name: 'BBC micro:bit [zuvot]', rssi: -40 } })
      this.handle({ jsonrpc: '2.0', id: msg.id, result: null })
    })
  }
  setOnOpen(cb: () => void) {
    this.onOpen = cb
  }
  setOnClose(cb: (e?: unknown) => void) {
    this.onClose = cb
  }
  setOnError() {}
  setHandleMessage(cb: (m: never) => void) {
    this.handle = cb as (m: Msg) => void
  }
  /** The micro:bit reports its state. */
  notify(bytes: number[]) {
    this.handle({ jsonrpc: '2.0', method: 'characteristicDidChange', params: { message: toBase64(Uint8Array.from(bytes)) } })
  }
}

const packet = ({ tiltX = 0, tiltY = 0, a = 0, b = 0, p0 = 0, gestures = 0 } = {}) => [
  (tiltX >> 8) & 0xff, tiltX & 0xff, (tiltY >> 8) & 0xff, tiltY & 0xff, a, b, p0, 0, 0, gestures,
]
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  ;(self as unknown as { Scratch?: unknown }).Scratch = { ScratchLinkSafariSocket: FakeSocket }
  useMicrobit.setState({ status: 'unsupported', error: '', hello: false, board: IDLE_BOARD, monitor: [] })
})
afterEach(async () => {
  await disconnectBluetooth()
  delete (self as unknown as { Scratch?: unknown }).Scratch
})

describe('Scratch micro:bit protocol', () => {
  it('reads a packet: signed tilt, buttons, pins and gestures', () => {
    const p = parsePacket(Uint8Array.from(packet({ tiltX: -300, tiltY: 450, a: 1, p0: 1, gestures: 1 })))
    expect(p).toEqual({ tiltX: -300, tiltY: 450, a: true, b: false, pins: [true, false, false], gestures: 1 })
    expect(parsePacket(Uint8Array.from([1, 2, 3]))).toBeNull()
  })

  it('turns tenths of a degree into the USB link scale', () => {
    expect(tenthsToMilliG(0)).toBe(0)
    expect(tenthsToMilliG(900)).toBe(1024)
    expect(tenthsToMilliG(-300)).toBe(-512)
  })

  it('writes pictures as five row bytes and text as ASCII, and skips sounds', () => {
    expect([...pictureRows('heart')]).toEqual([0b01010, 0b11111, 0b11111, 0b01110, 0b00100])
    expect([...commandBytes({ t: 'show', image: 'arrow_e' })!].slice(0, 1)).toEqual([0x82])
    expect([...commandBytes({ t: 'num', n: 12 })!]).toEqual([0x81, 49, 50])
    expect(commandBytes({ t: 'text', text: 'x'.repeat(40) })!.length).toBe(20)
    expect(commandBytes({ t: 'tone', hz: 440, ms: 100 })).toBeNull()
    expect(commandBytes({ t: 'hi' })).toBeNull()
  })

  it('shows the name the micro:bit scrolls', () => {
    expect(shortName('BBC micro:bit [zuvot]')).toBe('zuvot')
    expect(shortName('micro:bit')).toBe('micro:bit')
  })
})

describe('Bluetooth link through Scrub', () => {
  it('is only offered where Scrub provides the bridge', () => {
    expect(bluetoothAvailable()).toBe(true)
    delete (self as unknown as { Scratch?: unknown }).Scratch
    expect(bluetoothAvailable()).toBe(false)
  })

  it('finds a micro:bit, connects, and turns packets into board state', async () => {
    await searchBluetooth()
    await flush()
    expect(useBluetooth.getState().found).toEqual([{ id: 'p1', name: 'BBC micro:bit [zuvot]' }])
    expect(FakeSocket.last!.sent[0]).toMatchObject({ method: 'discover', params: { filters: [{ services: [0xf005] }] } })

    await connectBluetooth('p1')
    expect(useMicrobit.getState().status).toBe('connected')
    expect(useBluetooth.getState().phase).toBe('connected')
    expect(FakeSocket.last!.sent.map((m) => m.method)).toEqual(['discover', 'connect', 'read'])

    FakeSocket.last!.notify(packet({ tiltX: 300, tiltY: -300, a: 1 }))
    const board = useMicrobit.getState().board
    expect(useMicrobit.getState().hello).toBe(true)
    expect(board.pins.a).toBe(true)
    // Right edge down is + x; logo end tipped away (Scratch's negative y) is + y, as on USB.
    expect(board.tilt).toEqual({ x: 512, y: 512 })

    FakeSocket.last!.notify(packet({ gestures: 1 }))
    expect(useMicrobit.getState().board.pins.a).toBe(false)
    expect(useMicrobit.getState().board.pulses.shake).toBeGreaterThan(0)
  })

  it('sends Remote reactions to the LEDs', async () => {
    await searchBluetooth()
    await flush()
    await connectBluetooth('p1')
    useMicrobit.getState().send({ t: 'show', image: 'heart' })
    await flush()
    const write = FakeSocket.last!.sent.find((m) => m.method === 'write')
    expect(write?.params).toMatchObject({ serviceId: 0xf005, characteristicId: '5261da02-fa7e-42ab-850b-7c80220097cc', encoding: 'base64' })
    expect([...fromBase64(write!.params!.message as string)]).toEqual([0x82, 0b01010, 0b11111, 0b11111, 0b01110, 0b00100])
  })

  it('lets go when the micro:bit stops sending', async () => {
    vi.useFakeTimers()
    try {
      const searching = searchBluetooth()
      await vi.runAllTicks()
      await vi.advanceTimersByTimeAsync(0)
      await searching
      const connecting = connectBluetooth('p1')
      await vi.advanceTimersByTimeAsync(0)
      await connecting
      expect(useMicrobit.getState().status).toBe('connected')
      await vi.advanceTimersByTimeAsync(5000)
      expect(useMicrobit.getState().status).toBe('error')
      expect(useBluetooth.getState().phase).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })
})
