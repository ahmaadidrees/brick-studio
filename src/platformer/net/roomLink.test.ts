import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomLink, type RoomHandlers } from './roomLink'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  constructor(readonly url: string) { FakeWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.() }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.() }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
}

const handlers = (): RoomHandlers => ({
  welcome: vi.fn(), resync: vi.fn(), event: vi.fn(), reject: vi.fn(), pose: vi.fn(),
  players: vi.fn(), settings: vi.fn(), saved: vi.fn(), notice: vi.fn(), bonk: vi.fn(), status: vi.fn(),
})

describe('RoomLink recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('recovers a stalled ticket request and ignores its late result', async () => {
    const resolvers: ((url: string) => void)[] = []
    const ticket = vi.fn(() => new Promise<string>((r) => { resolvers.push(r) }))
    const link = new RoomLink('room', 'Ada', handlers(), { url: ticket })
    link.connect()
    await vi.advanceTimersByTimeAsync(10_800)
    expect(ticket).toHaveBeenCalledTimes(2)
    resolvers[0]('wss://late')
    await Promise.resolve()
    expect(FakeWebSocket.instances).toHaveLength(0)
    link.close()
  })

  it('retries a socket that opens but never completes its handshake', async () => {
    const link = new RoomLink('room', 'Ada', handlers(), { url: 'wss://room' })
    link.connect()
    const first = FakeWebSocket.instances[0]
    first.open()
    await vi.advanceTimersByTimeAsync(10_800)
    expect(FakeWebSocket.instances).toHaveLength(2)
    first.message({ type: 'error', code: 'access', message: 'stale' })
    expect(link.status).toBe('reconnecting')
    link.close()
  })

  it('keeps a welcomed socket alive on inbound heartbeats and retries it when silent', async () => {
    const link = new RoomLink('room', 'Ada', handlers(), { url: 'wss://room' })
    link.connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    ws.message({
      type: 'welcome', you: 1, host: true, roomId: 'room', epoch: 0, now: 0,
      base: {}, events: [], players: [], settings: {}, canBuild: true, classroom: false,
    })
    await vi.advanceTimersByTimeAsync(9_000)
    ws.message({ type: 'pong', c: 0, s: 0 })
    await vi.advanceTimersByTimeAsync(9_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_800)
    expect(FakeWebSocket.instances).toHaveLength(2)
    link.close()
  })

  it('cancels pending retry and callbacks on close', async () => {
    const link = new RoomLink('room', 'Ada', handlers(), { url: 'wss://room' })
    link.connect()
    FakeWebSocket.instances[0].close()
    link.close()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(link.status).toBe('offline')
  })
})
