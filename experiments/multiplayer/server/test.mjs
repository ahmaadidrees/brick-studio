/**
 * Relay end-to-end tests. Run with `npm test` inside this directory — they use
 * Node's built-in test runner plus the `ws` client, spin the relay up on an
 * ephemeral port, and drive real WebSocket pairs. The root Brick Studio vitest
 * suite intentionally excludes experiments/**.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import WebSocket from 'ws'
import { createBrickRelay } from './relay.js'
import { applyCommands } from './validator.js'

const V = 1

function brick(id, overrides = {}) {
  return { id, partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#e7473c', ...overrides }
}

class TestClient {
  constructor(port) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}`)
    this.inbox = []
    this.waiters = []
    this.socket.on('message', (data) => {
      const message = JSON.parse(data.toString())
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.match(message))
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1)
        waiter.resolve(message)
      } else {
        this.inbox.push(message)
      }
    })
  }

  async opened() {
    if (this.socket.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve)
      this.socket.once('error', reject)
    })
  }

  send(message) {
    this.socket.send(JSON.stringify(message))
  }

  /** Resolves with the first buffered or future message matching the predicate. */
  next(match, timeoutMs = 2000) {
    const index = this.inbox.findIndex((message) => match(message))
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== wrapped)
        reject(new Error('timed out waiting for a matching relay message'))
      }, timeoutMs)
      const wrapped = (message) => {
        clearTimeout(timer)
        resolve(message)
      }
      this.waiters.push({ match, resolve: wrapped })
    })
  }

  async join(room, clientId) {
    await this.opened()
    this.send({ v: V, type: 'hello', room, clientId })
    return this.next((message) => message.type === 'welcome')
  }

  close() {
    this.socket.close()
  }
}

async function withRelay(run) {
  const relay = createBrickRelay({ port: 0, gcIntervalMs: 50, emptyRoomTtlMs: 100 })
  const port = await relay.ready
  const clients = []
  const connect = () => {
    const client = new TestClient(port)
    clients.push(client)
    return client
  }
  try {
    await run({ relay, port, connect })
  } finally {
    for (const client of clients) client.close()
    await relay.close()
  }
}

test('snapshot on join, accepted commands rebroadcast to the whole room', async () => {
  await withRelay(async ({ connect }) => {
    const amy = connect()
    const welcomeA = await amy.join('ABC', 'builder-amy-1')
    assert.equal(welcomeA.revision, 0)
    assert.deepEqual(welcomeA.snapshot, [])
    assert.equal(welcomeA.peers, 1)

    amy.send({ v: V, type: 'commands', commands: [{ op: 'place', brick: brick('b1') }] })
    const echo = await amy.next((message) => message.type === 'apply')
    assert.equal(echo.revision, 1)
    assert.equal(echo.from, 'builder-amy-1')

    const ben = connect()
    const welcomeB = await ben.join('ABC', 'builder-ben-2')
    assert.equal(welcomeB.revision, 1)
    assert.deepEqual(welcomeB.snapshot, [brick('b1')])
    assert.equal(welcomeB.peers, 2)

    ben.send({ v: V, type: 'commands', commands: [{ op: 'place', brick: brick('b2', { x: 30, z: 30 }) }] })
    const applied = await amy.next((message) => message.type === 'apply' && message.revision === 2)
    assert.equal(applied.from, 'builder-ben-2')
    assert.equal(applied.commands[0].brick.id, 'b2')
  })
})

test('overlapping batch is rejected privately with a rollback snapshot', async () => {
  await withRelay(async ({ connect }) => {
    const amy = connect()
    const ben = connect()
    await amy.join('ROOM1', 'builder-amy-1')
    await ben.join('ROOM1', 'builder-ben-2')

    amy.send({ v: V, type: 'commands', commands: [{ op: 'place', brick: brick('b1') }] })
    await ben.next((message) => message.type === 'apply' && message.revision === 1)

    ben.send({ v: V, type: 'commands', commands: [{ op: 'place', brick: brick('b2', { x: 11, z: 11 }) }] })
    const reject = await ben.next((message) => message.type === 'reject')
    assert.equal(reject.code, 'overlap')
    assert.equal(reject.revision, 1)
    assert.deepEqual(reject.snapshot, [brick('b1')])

    amy.send({ v: V, type: 'commands', commands: [{ op: 'move', brick: brick('b1', { x: 40, z: 40 }) }] })
    const applied = await amy.next((message) => message.type === 'apply' && message.revision === 2)
    assert.equal(applied.commands[0].op, 'move')
    assert.equal(ben.inbox.some((message) => message.type === 'reject'), false)
  })
})

test('brick cap, unknown-brick edits, and idempotent deletes', async () => {
  await withRelay(async ({ connect, relay }) => {
    const amy = connect()
    await amy.join('CAP', 'builder-amy-1')
    const room = relay.rooms.get('CAP')
    room.bricks = Array.from({ length: 250 }, (_, index) => {
      const x = (index % 32) * 2
      const z = Math.floor(index / 32) * 2
      return brick(`fill-${index}`, { partId: 'brick_1x1', x, z })
    })

    amy.send({ v: V, type: 'commands', commands: [{ op: 'place', brick: brick('extra', { partId: 'brick_1x1', x: 0, y: 3, z: 0 }) }] })
    const capReject = await amy.next((message) => message.type === 'reject')
    assert.equal(capReject.code, 'brick-limit')

    amy.send({ v: V, type: 'commands', commands: [{ op: 'recolor', brick: brick('never-existed', { color: '#3e83d7' }) }] })
    const unknownReject = await amy.next((message) => message.type === 'reject')
    assert.equal(unknownReject.code, 'unknown-brick')

    amy.send({ v: V, type: 'commands', commands: [{ op: 'delete', id: 'already-gone' }] })
    const applied = await amy.next((message) => message.type === 'apply')
    assert.equal(applied.revision, 1)
  })
})

test('resync returns the current document and malformed traffic closes cleanly', async () => {
  await withRelay(async ({ connect }) => {
    const amy = connect()
    await amy.join('SYNC', 'builder-amy-1')
    amy.send({ v: V, type: 'commands', commands: [{ op: 'place', brick: brick('b1') }] })
    await amy.next((message) => message.type === 'apply')

    amy.send({ v: V, type: 'resync' })
    const snapshot = await amy.next((message) => message.type === 'snapshot')
    assert.equal(snapshot.revision, 1)
    assert.deepEqual(snapshot.snapshot, [brick('b1')])

    const rude = connect()
    await rude.opened()
    rude.socket.send('this is not json')
    const error = await rude.next((message) => message.type === 'error')
    assert.equal(error.code, 'invalid-json')
    await new Promise((resolve) => rude.socket.once('close', resolve))

    const ben = connect()
    const welcome = await ben.join('SYNC', 'builder-ben-2')
    assert.equal(welcome.revision, 1)
  })
})

test('room codes are normalized and invalid hellos are refused', async () => {
  await withRelay(async ({ connect }) => {
    const lower = connect()
    const welcome = await lower.join('abc', 'builder-amy-1')
    assert.equal(welcome.room, 'ABC')

    const invalid = connect()
    await invalid.opened()
    invalid.send({ v: V, type: 'hello', room: 'not a room!', clientId: 'builder-x-9' })
    const error = await invalid.next((message) => message.type === 'error')
    assert.equal(error.code, 'invalid-room')
  })
})

test('empty rooms are garbage collected after the ttl', async () => {
  await withRelay(async ({ connect, relay }) => {
    const amy = connect()
    await amy.join('GONE', 'builder-amy-1')
    amy.close()
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(relay.rooms.has('GONE'), false)
  })
})

test('validator staging lets one batch rearrange bricks atomically', () => {
  const bricks = [brick('a', { x: 0, z: 0 }), brick('b', { x: 2, z: 0 })]
  const swapped = applyCommands(bricks, [
    { op: 'move', brick: brick('a', { x: 2, z: 0 }) },
    { op: 'move', brick: brick('b', { x: 0, z: 0 }) },
  ])
  assert.equal(swapped.ok, true)
  assert.deepEqual(swapped.bricks.map((entry) => [entry.id, entry.x]), [['a', 2], ['b', 0]])

  const conflicting = applyCommands(bricks, [
    { op: 'move', brick: brick('a', { x: 2, z: 0 }) },
    { op: 'move', brick: brick('a', { x: 4, z: 0 }) },
  ])
  assert.equal(conflicting.ok, false)
  assert.equal(conflicting.error.code, 'conflicting-batch')
})
