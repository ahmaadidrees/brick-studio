import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRaceRoom, getRaceRoom, RaceClient } from './raceClient'

class FakeSocket {
  static OPEN = 1
  readyState = 0
  sent: string[] = []
  private listeners: Record<string, Array<(event: { data?: string }) => void>> = {}
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    ;(this.listeners[type] ??= []).push(listener)
  }
  send(value: string) { this.sent.push(value) }
  close() { this.readyState = 3; this.emit('close') }
  emit(type: string, data?: string) { this.listeners[type]?.forEach((listener) => listener({ data })) }
  open() { this.readyState = 1; this.emit('open') }
  message(value: object) { this.emit('message', JSON.stringify(value)) }
}

describe('race REST client', () => {
  it('creates and fetches rooms using the configured server', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ roomId: 'ABC123', hostToken: 'secret', world: { bricks: [] }, status: { phase: 'lobby' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ roomId: 'ABC123', world: { bricks: [] }, status: { phase: 'lobby' } }) })
    await createRaceRoom({ bricks: [] }, { baseUrl: 'https://race.example/', fetch: fetcher })
    await getRaceRoom('ABC 123', { baseUrl: 'https://race.example/', fetch: fetcher })
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://race.example/rooms', expect.objectContaining({ method: 'POST' }))
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://race.example/rooms/ABC%20123', undefined)
  })
})

describe('RaceClient', () => {
  let sockets: FakeSocket[]
  let storage: Map<string, string>
  beforeEach(() => {
    sockets = []
    storage = new Map()
    vi.stubGlobal('WebSocket', { OPEN: 1 })
  })

  function client(extra = {}) {
    return new RaceClient({
      baseUrl: 'https://race.example',
      createWebSocket: (url) => {
        const socket = new FakeSocket(url)
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
      storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => void storage.set(key, value) },
      random: () => 0,
      ...extra,
    })
  }

  it('persists identity, connects securely, and applies server state', () => {
    const first = client()
    const id = first.getSnapshot().selfId
    const second = client()
    expect(second.getSnapshot().selfId).toBe(id)
    second.connect('ROOM 1', 'host secret')
    expect(sockets[0].url).toContain('wss://race.example/rooms/ROOM%201/connect?')
    expect(sockets[0].url).toContain('hostToken=host+secret')
    sockets[0].open()
    expect(second.getSnapshot().connection).toBe('connected')
    sockets[0].message({ type: 'welcome', selfId: id, players: [{ id: 'peer', color: '#fff' }], status: { phase: 'racing', startedAt: 10 } })
    expect(second.getSnapshot()).toMatchObject({ status: { phase: 'racing' }, players: { peer: { id: 'peer' } } })
    sockets[0].message({ type: 'pose', player: { id: 'peer', color: '#fff', pose: { position: [1, 2, 3], rotation: 1 } } })
    expect(second.getSnapshot().players.peer.pose?.position).toEqual([1, 2, 3])
  })

  it('throttles poses and exposes host commands', () => {
    vi.useFakeTimers()
    let now = 1_000
    const race = client({ now: () => now, poseIntervalMs: 100 })
    race.connect('ROOM', 'secret')
    sockets[0].open()
    race.sendPose({ position: [0, 0, 0], rotation: 0 })
    now += 10
    race.sendPose({ position: [2, 0, 0], rotation: 0 })
    expect(sockets[0].sent.filter((raw) => JSON.parse(raw).type === 'pose')).toHaveLength(1)
    now += 90
    vi.advanceTimersByTime(100)
    const poses = sockets[0].sent.map((raw) => JSON.parse(raw)).filter((message) => message.type === 'pose')
    expect(poses).toHaveLength(2)
    expect([poses[1].x, poses[1].y, poses[1].z]).toEqual([2, 0, 0])
    expect(race.startRace()).toBe(true)
    expect(race.resetRace()).toBe(true)
    expect(sockets[0].sent.map((raw) => JSON.parse(raw)).slice(-2)).toEqual([{ type: 'start', countdownMs: 3000 }, { type: 'reset' }])
    vi.useRealTimers()
  })

  it('reconnects after an unexpected close', () => {
    vi.useFakeTimers()
    const race = client({ reconnectDelays: [50] })
    race.connect('ROOM')
    sockets[0].open()
    sockets[0].emit('close')
    expect(race.getSnapshot().connection).toBe('reconnecting')
    vi.advanceTimersByTime(50)
    expect(sockets).toHaveLength(2)
    sockets[1].open()
    expect(race.getSnapshot().connection).toBe('connected')
    vi.useRealTimers()
  })
})
