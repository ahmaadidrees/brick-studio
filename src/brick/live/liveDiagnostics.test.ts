import { describe, expect, it } from 'vitest'
import { createLiveDiagnostics, LIVE_DIAGNOSTICS_CAPACITY, type LiveDiagnosticDetails, type LiveDiagnosticEventName } from './liveDiagnostics'

describe('local live diagnostics', () => {
  it('exports a useful ordered reconnect timeline with elapsed time', () => {
    let time = 1000
    const diagnostics = createLiveDiagnostics({ now: () => time })
    diagnostics.record('connection', { connection: 'online', revision: 8, pendingOperations: 1 })
    time += 100
    diagnostics.record('socket_close', { closeCode: 4001 })
    diagnostics.record('error', { code: 'session_replaced' })
    diagnostics.record('error', { code: 'invalid-layout' })
    time += 500
    diagnostics.record('reconnect', { attempt: 1 })
    diagnostics.record('welcome', { revision: 9, playerCount: 3, awaitingSnapshot: false })

    expect(JSON.parse(diagnostics.exportText())).toEqual({
      schema: 'brick-studio.live-diagnostics.v1',
      events: [
        { elapsedMs: 0, event: 'connection', connection: 'online', revision: 8, pendingOperations: 1 },
        { elapsedMs: 100, event: 'socket_close', closeCode: 4001 },
        { elapsedMs: 100, event: 'error', code: 'session_replaced' },
        { elapsedMs: 100, event: 'error', code: 'invalid-layout' },
        { elapsedMs: 600, event: 'reconnect', attempt: 1 },
        { elapsedMs: 600, event: 'welcome', revision: 9, playerCount: 3, awaitingSnapshot: false },
      ],
    })
  })

  it('never copies unknown keys or arbitrary strings from a client/server payload', () => {
    const diagnostics = createLiveDiagnostics({ now: () => 0 })
    const secret = 'student-name password owner=reconnect-token access_token=private'
    diagnostics.record('error', {
      code: secret,
      connection: secret,
      closeCode: secret,
      revision: secret,
      playerCount: { token: secret },
      attempt: [secret],
      pendingOperations: secret,
      awaitingSnapshot: secret,
      roomId: secret,
      profile: { displayName: secret },
      document: { bricks: [secret] },
      message: secret,
      url: `https://example.invalid/live/test?${secret}#${secret}`,
      toJSON: () => ({ secret }),
    } as unknown as LiveDiagnosticDetails)
    diagnostics.record(secret as LiveDiagnosticEventName, { code: secret })

    const report = diagnostics.exportText()
    expect(report).not.toContain(secret)
    expect(JSON.parse(report).events).toEqual([{ elapsedMs: 0, event: 'error', code: 'other' }])
  })

  it('drops nonfinite, negative, fractional and out-of-range numeric fields', () => {
    const diagnostics = createLiveDiagnostics({ now: () => 0 })
    diagnostics.record('sync', { revision: Infinity, pendingOperations: -1, playerCount: 1.5, attempt: NaN, closeCode: 5000 })
    diagnostics.record('welcome', { revision: Number.MAX_SAFE_INTEGER, closeCode: 999 })
    expect(diagnostics.getSnapshot()).toEqual([
      { elapsedMs: 0, event: 'sync' },
      { elapsedMs: 0, event: 'welcome' },
    ])
  })

  it('retains only the latest bounded events and clamps caller capacity', () => {
    for (const [capacity, retained] of [[undefined, LIVE_DIAGNOSTICS_CAPACITY], [3, 3], [10000, 128], [0, 1], [NaN, LIVE_DIAGNOSTICS_CAPACITY]]) {
      const diagnostics = createLiveDiagnostics({ now: () => 0, capacity })
      for (let revision = 0; revision < 200; revision += 1) diagnostics.record('welcome', { revision })
      expect(diagnostics.getSnapshot()).toHaveLength(retained!)
      expect(diagnostics.getSnapshot().at(-1)?.revision).toBe(199)
      expect(diagnostics.getSnapshot()[0]?.revision).toBe(200 - retained!)
    }
  })

  it('coalesces ordinary sync traffic so a busy room retains connection failures', () => {
    const diagnostics = createLiveDiagnostics({ now: () => 0 })
    diagnostics.record('error', { code: 'sync_timeout' })
    diagnostics.record('reconnect', { attempt: 1 })
    for (let revision = 1; revision <= 1000; revision += 1) diagnostics.record('sync', { revision, pendingOperations: 0 })
    expect(diagnostics.getSnapshot()).toEqual([
      { elapsedMs: 0, event: 'error', code: 'sync_timeout' },
      { elapsedMs: 0, event: 'reconnect', attempt: 1 },
      { elapsedMs: 0, event: 'sync', revision: 1000, pendingOperations: 0 },
    ])
  })

  it('does not retain caller references and cannot be changed through exported snapshots', () => {
    const diagnostics = createLiveDiagnostics({ now: () => 0 })
    const input = { revision: 3 }
    diagnostics.record('sync', input)
    input.revision = 100
    const before = diagnostics.getSnapshot()
    expect(Object.isFrozen(before)).toBe(true)
    expect(Object.isFrozen(before[0])).toBe(true)
    diagnostics.record('welcome', { revision: 4 })
    expect(before).toEqual([{ elapsedMs: 0, event: 'sync', revision: 3 }])
  })

  it('keeps each room session isolated and exported methods do not require a receiver', () => {
    const first = createLiveDiagnostics({ now: () => 0 })
    const second = createLiveDiagnostics({ now: () => 0 })
    const { record, exportText } = first
    record('error', { code: 'sync_timeout' })
    expect(JSON.parse(exportText()).events).toHaveLength(1)
    expect(second.getSnapshot()).toEqual([])
  })

  it('keeps elapsed time finite and monotonic even if the clock moves backwards', () => {
    let time = 0
    const diagnostics = createLiveDiagnostics({ now: () => time })
    for (time of [10, -5, NaN, Infinity, 12]) diagnostics.record('reconnect')
    expect(diagnostics.getSnapshot().map((event) => event.elapsedMs)).toEqual([10, 10, 10, 10, 12])
  })
})
