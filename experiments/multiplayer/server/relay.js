/**
 * Minimal authoritative relay for the Brick Studio multiplayer spike.
 *
 * One process, rooms keyed by code, the full brick document per room held in
 * memory. Clients send atomic command batches; the relay validates them with
 * the ported placement rules and rebroadcasts accepted batches (revision-
 * stamped) to every member of the room, sender included. Rejected batches get
 * a private `reject` carrying a fresh snapshot so the sender can roll back its
 * optimistic change. See MULTIPLAYER_SPIKE.md at the repo root for the full
 * protocol.
 */

import { WebSocketServer } from 'ws'
import { MAX_BRICKS, applyCommands } from './validator.js'

export const PROTOCOL_VERSION = 1
export const DEFAULT_PORT = 8787
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{1,12}$/
export const CLIENT_ID_PATTERN = /^[a-zA-Z0-9-]{4,64}$/

const MAX_COMMANDS_PER_BATCH = 500
const MAX_MESSAGES_PER_WINDOW = 400
const RATE_WINDOW_MS = 10_000

export function normalizeRoomCode(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null
}

export function createBrickRelay({
  port = DEFAULT_PORT,
  host,
  maxBricks = MAX_BRICKS,
  emptyRoomTtlMs = 10 * 60_000,
  gcIntervalMs = 60_000,
  log = () => {},
} = {}) {
  const wss = new WebSocketServer({ port, host, maxPayload: 1_000_000 })
  /** @type {Map<string, { bricks: any[], revision: number, clients: Set<any>, emptySince: number | null }>} */
  const rooms = new Map()

  const ready = new Promise((resolve, reject) => {
    wss.once('listening', () => resolve(wss.address().port))
    wss.once('error', reject)
  })

  const send = (socket, message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
  }
  const broadcast = (room, message) => {
    const data = JSON.stringify(message)
    for (const member of room.clients) {
      if (member.readyState === member.OPEN) member.send(data)
    }
  }
  const refuse = (socket, code, message) => {
    send(socket, { v: PROTOCOL_VERSION, type: 'error', code, message })
    socket.close()
  }

  const gcTimer = setInterval(() => {
    const now = Date.now()
    for (const [code, room] of rooms) {
      if (room.clients.size === 0 && room.emptySince !== null && now - room.emptySince >= emptyRoomTtlMs) {
        rooms.delete(code)
        log(`room ${code} expired after sitting empty`)
      }
    }
  }, gcIntervalMs)
  gcTimer.unref?.()

  wss.on('connection', (socket) => {
    /** @type {{ roomCode: string, clientId: string } | null} */
    let session = null
    let windowStart = Date.now()
    let windowCount = 0

    socket.on('error', () => {})
    socket.on('message', (data, isBinary) => {
      if (isBinary) return refuse(socket, 'binary-unsupported', 'This relay only speaks JSON text frames.')

      const now = Date.now()
      if (now - windowStart > RATE_WINDOW_MS) {
        windowStart = now
        windowCount = 0
      }
      windowCount += 1
      if (windowCount > MAX_MESSAGES_PER_WINDOW) {
        return refuse(socket, 'rate-limited', 'Too many messages; slow down and reconnect.')
      }

      let message
      try {
        message = JSON.parse(data.toString())
      } catch {
        return refuse(socket, 'invalid-json', 'Messages must be JSON.')
      }
      if (typeof message !== 'object' || message === null) {
        return refuse(socket, 'invalid-message', 'Messages must be JSON objects.')
      }

      if (!session) {
        if (message.type !== 'hello') return refuse(socket, 'hello-required', 'Say hello with a room code first.')
        if (message.v !== PROTOCOL_VERSION) return refuse(socket, 'unsupported-protocol', `This relay speaks protocol v${PROTOCOL_VERSION}.`)
        const roomCode = normalizeRoomCode(message.room)
        if (!roomCode) return refuse(socket, 'invalid-room', 'Room codes are 1-12 letters or digits.')
        if (typeof message.clientId !== 'string' || !CLIENT_ID_PATTERN.test(message.clientId)) {
          return refuse(socket, 'invalid-client-id', 'Client ids must be 4-64 url-safe characters.')
        }
        let room = rooms.get(roomCode)
        if (!room) {
          room = { bricks: [], revision: 0, clients: new Set(), emptySince: null }
          rooms.set(roomCode, room)
          log(`room ${roomCode} opened`)
        }
        room.clients.add(socket)
        room.emptySince = null
        session = { roomCode, clientId: message.clientId }
        send(socket, {
          v: PROTOCOL_VERSION,
          type: 'welcome',
          room: roomCode,
          revision: room.revision,
          snapshot: room.bricks,
          peers: room.clients.size,
        })
        broadcast(room, { v: PROTOCOL_VERSION, type: 'peers', peers: room.clients.size })
        log(`client joined ${roomCode} (${room.clients.size} online, revision ${room.revision})`)
        return
      }

      const room = rooms.get(session.roomCode)
      if (!room) return refuse(socket, 'room-expired', 'This room expired; reconnect to start it fresh.')

      if (message.type === 'commands') {
        if (!Array.isArray(message.commands) || message.commands.length > MAX_COMMANDS_PER_BATCH) {
          return send(socket, {
            v: PROTOCOL_VERSION,
            type: 'reject',
            code: 'invalid-batch',
            message: `Batches carry 1-${MAX_COMMANDS_PER_BATCH} commands.`,
            revision: room.revision,
            snapshot: room.bricks,
          })
        }
        const result = applyCommands(room.bricks, message.commands, { maxBricks })
        if (!result.ok) {
          send(socket, {
            v: PROTOCOL_VERSION,
            type: 'reject',
            code: result.error.code,
            message: result.error.message,
            revision: room.revision,
            snapshot: room.bricks,
          })
          return
        }
        room.bricks = result.bricks
        room.revision += 1
        broadcast(room, {
          v: PROTOCOL_VERSION,
          type: 'apply',
          from: session.clientId,
          revision: room.revision,
          commands: message.commands,
        })
        return
      }

      if (message.type === 'resync') {
        send(socket, { v: PROTOCOL_VERSION, type: 'snapshot', revision: room.revision, snapshot: room.bricks })
        return
      }

      refuse(socket, 'unknown-message', `Unknown message type: ${String(message.type)}.`)
    })

    socket.on('close', () => {
      if (!session) return
      const room = rooms.get(session.roomCode)
      if (!room) return
      room.clients.delete(socket)
      if (room.clients.size === 0) {
        room.emptySince = Date.now()
      } else {
        broadcast(room, { v: PROTOCOL_VERSION, type: 'peers', peers: room.clients.size })
      }
      log(`client left ${session.roomCode} (${room.clients.size} online)`)
    })
  })

  return {
    wss,
    rooms,
    ready,
    close: () => {
      clearInterval(gcTimer)
      for (const socket of wss.clients) socket.terminate()
      return new Promise((resolve) => wss.close(() => resolve(undefined)))
    },
  }
}
