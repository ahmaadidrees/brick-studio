#!/usr/bin/env node

import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LIVE_MAX_PLAYERS } from '../packages/brick-core/src/protocol.ts'

export const LIVE_LOAD_CLIENTS = LIVE_MAX_PLAYERS
export const DEFAULT_POSES_PER_CLIENT = 3
export const DEFAULT_LOAD_TIMEOUT_MS = 15_000

const PRODUCTION_VIRTUAL_LEGOS_HOSTS = new Set([
  'virtual-legos.vercel.app',
  'virtual-legos.com',
  'www.virtual-legos.com',
  'virtuallegos.com',
  'www.virtuallegos.com',
])

function parseBoundedInteger(value, fallback, name, minimum, maximum) {
  if (value === undefined || value === '') return fallback
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a whole number.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`)
  }
  return parsed
}

export function isProductionVirtualLegosUrl(url) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  return PRODUCTION_VIRTUAL_LEGOS_HOSTS.has(hostname)
    || /^brick-studio-multiplayer\.[a-z0-9-]+\.workers\.dev$/.test(hostname)
}

export function parseLoadOptions(environment = process.env) {
  const rawServerUrl = environment.LIVE_SERVER_URL?.trim()
  if (!rawServerUrl) throw new Error('LIVE_SERVER_URL is required.')

  let serverUrl
  try {
    serverUrl = new URL(rawServerUrl)
  } catch {
    throw new Error('LIVE_SERVER_URL must be a valid absolute URL.')
  }
  if (serverUrl.protocol !== 'http:' && serverUrl.protocol !== 'https:') {
    throw new Error('LIVE_SERVER_URL must use http: or https:.')
  }
  if (serverUrl.username || serverUrl.password) {
    throw new Error('LIVE_SERVER_URL must not contain credentials.')
  }
  if ((serverUrl.pathname !== '/' && serverUrl.pathname !== '') || serverUrl.search || serverUrl.hash) {
    throw new Error('LIVE_SERVER_URL must be a bare origin without a path, query, or hash.')
  }
  const allowProduction = environment.ALLOW_PRODUCTION_LOAD === '1'
  if (isProductionVirtualLegosUrl(serverUrl) && !allowProduction) {
    throw new Error('Refusing to load-test a production Virtual Legos origin. Set ALLOW_PRODUCTION_LOAD=1 only with explicit approval.')
  }

  return {
    serverUrl: serverUrl.origin,
    allowProduction,
    clients: LIVE_LOAD_CLIENTS,
    posesPerClient: parseBoundedInteger(
      environment.LOAD_POSES_PER_CLIENT,
      DEFAULT_POSES_PER_CLIENT,
      'LOAD_POSES_PER_CLIENT',
      1,
      10,
    ),
    timeoutMs: parseBoundedInteger(
      environment.LOAD_TIMEOUT_MS,
      DEFAULT_LOAD_TIMEOUT_MS,
      'LOAD_TIMEOUT_MS',
      1_000,
      60_000,
    ),
  }
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}

function percentile(values, fraction) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  return sorted[Math.max(0, index)]
}

function rounded(milliseconds) {
  return Math.round(milliseconds * 100) / 100
}

function byteLength(value) {
  if (typeof value === 'string') return Buffer.byteLength(value)
  if (value instanceof ArrayBuffer) return value.byteLength
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size
  return Buffer.byteLength(String(value))
}

function redactPotentialSecrets(value) {
  return value.replace(/(ownerToken(?:=|%3D))[^&\s]+/gi, '$1[REDACTED]')
}

async function messageText(value) {
  if (typeof value === 'string') return value
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8')
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8')
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.text()
  return String(value)
}

function websocketUrl(serverUrl, roomId, playerId, ownerToken) {
  const url = new URL(`/worlds/${encodeURIComponent(roomId)}/connect`, `${serverUrl}/`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('playerId', playerId)
  if (ownerToken) url.searchParams.set('ownerToken', ownerToken)
  return url.toString()
}

function createCounters() {
  return {
    httpRequests: 0,
    httpBytesSent: 0,
    httpBytesReceived: 0,
    websocketAttempts: 0,
    websocketOpened: 0,
    websocketMessagesSent: 0,
    websocketMessagesReceived: 0,
    websocketBytesSent: 0,
    websocketBytesReceived: 0,
    socketErrors: 0,
    serverErrors: 0,
    parseErrors: 0,
    overflowRejectionEvents: 0,
  }
}

async function createTestWorld(options, counters, runId) {
  const document = {
    schemaVersion: 2,
    partLibraryVersion: 1,
    environmentId: 'classic',
    customParts: [],
    bricks: [{
      id: `seed_${runId}`,
      partId: 'brick_1x1',
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      color: '#e7473c',
    }],
  }
  const payload = JSON.stringify({
    title: `Live load ${runId}`,
    document,
    profile: { displayName: 'Load owner' },
  })
  counters.httpRequests += 1
  counters.httpBytesSent += Buffer.byteLength(payload)
  const startedAt = performance.now()
  const response = await fetch(`${options.serverUrl}/worlds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(options.timeoutMs),
  })
  const responseText = await response.text()
  counters.httpBytesReceived += Buffer.byteLength(responseText)
  let body
  try { body = JSON.parse(responseText) } catch { body = null }
  if (!response.ok) {
    const detail = body?.message ?? body?.error ?? response.statusText
    throw new Error(`World creation failed (${response.status}): ${String(detail)}`)
  }
  if (!body || typeof body.roomId !== 'string' || typeof body.ownerToken !== 'string') {
    throw new Error('World creation returned an invalid response.')
  }
  return {
    roomId: body.roomId,
    ownerToken: body.ownerToken,
    latencyMs: performance.now() - startedAt,
  }
}

function trackedSocket({ url, playerId, counters, overflow = false }) {
  const attemptedAt = performance.now()
  const socket = new WebSocket(url)
  const record = {
    playerId,
    socket,
    attemptedAt,
    openedAt: null,
    welcomedAt: null,
    welcome: null,
    maxPresence: 0,
    poseMessages: 0,
    latestPoses: new Map(),
    appliedOpIds: new Set(),
    errors: [],
    typedErrors: [],
    rejectionSignals: [],
    closed: false,
    closeCode: null,
    closeReason: '',
    overflow,
    closing: false,
  }
  counters.websocketAttempts += 1

  socket.addEventListener('open', () => {
    record.openedAt = performance.now()
    counters.websocketOpened += 1
    if (!overflow) sendJson(record, {
      v: 1,
      type: 'setProfile',
      profile: { displayName: `Load ${playerId.slice(-2)}` },
    }, counters)
  })
  socket.addEventListener('message', (event) => {
    counters.websocketMessagesReceived += 1
    counters.websocketBytesReceived += byteLength(event.data)
    void messageText(event.data).then((text) => {
      let message
      try { message = JSON.parse(text) } catch {
        counters.parseErrors += 1
        record.errors.push('invalid_json')
        return
      }
      if (!message || typeof message !== 'object') return
      if (message.type === 'welcome') {
        record.welcome = message
        record.welcomedAt = performance.now()
        if (Array.isArray(message.players)) record.maxPresence = Math.max(record.maxPresence, message.players.length)
      } else if (message.type === 'players' && Array.isArray(message.players)) {
        record.maxPresence = Math.max(record.maxPresence, message.players.length)
      } else if (message.type === 'pose') {
        record.poseMessages += 1
        record.latestPoses.set(message.playerId, message)
      } else if (message.type === 'apply' && typeof message.opId === 'string') {
        record.appliedOpIds.add(message.opId)
      } else if (message.type === 'error') {
        const code = typeof message.code === 'string' ? message.code : 'server_error'
        record.typedErrors.push(code)
        if (overflow) {
          counters.overflowRejectionEvents += 1
          record.rejectionSignals.push(`server:${code}`)
        }
        else {
          counters.serverErrors += 1
          record.errors.push(code)
        }
      }
    }).catch((error) => {
      counters.parseErrors += 1
      record.errors.push(error instanceof Error ? error.message : String(error))
    })
  })
  socket.addEventListener('error', (event) => {
    const detail = redactPotentialSecrets(
      typeof event.message === 'string' && event.message ? event.message : 'websocket_error',
    )
    if (overflow) {
      counters.overflowRejectionEvents += 1
      record.rejectionSignals.push(`socket:${detail}`)
    }
    else {
      counters.socketErrors += 1
      record.errors.push(detail)
    }
  })
  socket.addEventListener('close', (event) => {
    record.closed = true
    record.closeCode = event.code
    record.closeReason = event.reason
    if (overflow) {
      counters.overflowRejectionEvents += 1
      record.rejectionSignals.push(`close:${event.code}${event.reason ? `:${event.reason}` : ''}`)
    }
    else if (!record.closing) record.errors.push(`unexpected_close_${event.code}`)
  })
  return record
}

function sendJson(record, message, counters) {
  if (record.socket.readyState !== WebSocket.OPEN) {
    throw new Error(`Socket ${record.playerId} is not open.`)
  }
  const serialized = JSON.stringify(message)
  record.socket.send(serialized)
  counters.websocketMessagesSent += 1
  counters.websocketBytesSent += Buffer.byteLength(serialized)
}

async function waitUntil(predicate, { timeoutMs, label, records = [] }) {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    const unexpected = records.flatMap((record) => record.errors.map((error) => `${record.playerId}: ${error}`))
    if (unexpected.length > 0) throw new Error(`Unexpected WebSocket error while waiting for ${label}: ${unexpected.join('; ')}`)
    if (predicate()) return performance.now() - startedAt
    await sleep(20)
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.`)
}

async function closeAll(records) {
  for (const record of records) {
    if (!record?.socket) continue
    record.closing = true
    try {
      if (record.socket.readyState === WebSocket.OPEN) record.socket.close(1000, 'load test complete')
      else if (record.socket.readyState === WebSocket.CONNECTING) {
        try { record.socket.close() } catch {
          record.socket.addEventListener('open', () => {
            try { record.socket.close(1000, 'load test complete') } catch { /* already closed */ }
          }, { once: true })
        }
      }
    } catch { /* cleanup remains best effort */ }
  }
  const deadline = performance.now() + 2_000
  while (performance.now() < deadline) {
    if (records.every((record) => !record?.socket || record.socket.readyState === WebSocket.CLOSED)) return
    await sleep(20)
  }
}

function assertWelcome(record, roomId, owner) {
  if (record.welcome?.roomId !== roomId) throw new Error(`${record.playerId} received a welcome for the wrong room.`)
  if (record.welcome?.playerId !== record.playerId) throw new Error(`${record.playerId} received the wrong welcome identity.`)
  if (Boolean(record.welcome?.isOwner) !== owner) throw new Error(`${record.playerId} received the wrong owner role.`)
}

function reportLatency(records) {
  const values = records.map((record) => record.welcomedAt - record.attemptedAt)
  return {
    min: rounded(Math.min(...values)),
    p50: rounded(percentile(values, 0.5)),
    p95: rounded(percentile(values, 0.95)),
    max: rounded(Math.max(...values)),
  }
}

export async function runLiveWorldLoad(options) {
  if (typeof WebSocket !== 'function') throw new Error('This Node runtime does not provide the WebSocket API.')
  const counters = createCounters()
  const records = []
  let overflowRecord
  const totalStartedAt = performance.now()
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 10)

  try {
    const created = await createTestWorld(options, counters, runId)
    const connectionStartedAt = performance.now()
    for (let index = 0; index < options.clients; index += 1) {
      const playerId = `load_${runId}_${String(index + 1).padStart(2, '0')}`
      records.push(trackedSocket({
        url: websocketUrl(options.serverUrl, created.roomId, playerId, index === 0 ? created.ownerToken : undefined),
        playerId,
        counters,
      }))
    }

    await waitUntil(
      () => records.every((record) => record.welcome),
      { timeoutMs: options.timeoutMs, label: `${options.clients} welcomes`, records },
    )
    records.forEach((record, index) => assertWelcome(record, created.roomId, index === 0))
    await waitUntil(
      () => records.every((record) => record.maxPresence >= options.clients),
      { timeoutMs: options.timeoutMs, label: `${options.clients}-player presence convergence`, records },
    )
    const presenceAt = performance.now()

    const poseStartedAt = performance.now()
    for (let step = 0; step < options.posesPerClient; step += 1) {
      for (let index = 0; index < records.length; index += 1) {
        sendJson(records[index], {
          v: 1,
          type: 'pose',
          x: index * 2,
          y: 1,
          z: step,
          yaw: step * 0.1,
          moving: step < options.posesPerClient - 1,
          jumping: false,
        }, counters)
      }
      await sleep(100)
    }
    // Poses are intentionally coalesced by the service. Network bursts can drop
    // intermediate samples; verify everyone's final position instead of requiring
    // delivery of every sample. Repeat the idle pose as the real client does.
    for (let index = 0; index < records.length; index += 1) {
      sendJson(records[index], {
        v: 1, type: 'pose', x: index * 2, y: 1, z: options.posesPerClient - 1,
        yaw: (options.posesPerClient - 1) * 0.1, moving: false, jumping: false,
      }, counters)
    }
    await waitUntil(
      () => records.every(record => records.every(peer => peer === record
        || (record.latestPoses.get(peer.playerId)?.z === options.posesPerClient - 1
          && record.latestPoses.get(peer.playerId)?.moving === false))),
      { timeoutMs: options.timeoutMs, label: 'final peer positions on every client', records },
    )
    const poseCompleteAt = performance.now()

    const owner = records[0]
    const editOpId = `${owner.playerId}#1`
    const editStartedAt = performance.now()
    sendJson(owner, {
      v: 1,
      type: 'commands',
      opId: editOpId,
      commands: [{
        op: 'place',
        brick: {
          id: `edit_${runId}`,
          partId: 'brick_1x1',
          x: 4,
          y: 0,
          z: 4,
          rotation: 0,
          color: '#3e83d7',
        },
      }],
    }, counters)
    await waitUntil(
      () => records.every((record) => record.appliedOpIds.has(editOpId)),
      { timeoutMs: options.timeoutMs, label: 'edit broadcast to all clients', records },
    )
    const editCompleteAt = performance.now()

    const overflowStartedAt = performance.now()
    const overflowClientNumber = options.clients + 1
    const overflowId = `load_${runId}_${overflowClientNumber}`
    overflowRecord = trackedSocket({
      url: websocketUrl(options.serverUrl, created.roomId, overflowId),
      playerId: overflowId,
      counters,
      overflow: true,
    })
    await waitUntil(
      () => overflowRecord.rejectionSignals.length > 0 && !overflowRecord.welcome,
      { timeoutMs: options.timeoutMs, label: `client ${overflowClientNumber} rejection`, records },
    )
    if (overflowRecord.welcome) throw new Error(`Client ${overflowClientNumber} was welcomed even though the room was full.`)
    if (records.some((record) => record.socket.readyState !== WebSocket.OPEN)) {
      throw new Error('A connected client was displaced when the overflow client was rejected.')
    }

    return {
      ok: true,
      target: options.serverUrl,
      roomId: created.roomId,
      clientsWelcomed: records.length,
      presenceVerified: records.every((record) => record.maxPresence >= options.clients),
      poseMessagesPerClient: options.posesPerClient,
      peerPosesObservedByOwner: owner.poseMessages,
      finalPeerPositionsVerifiedOnAllClients: true,
      editRevisionObservedByAll: true,
      overflowClient: {
        number: overflowClientNumber,
        rejected: true,
        typedErrors: overflowRecord.typedErrors,
        signals: overflowRecord.rejectionSignals,
        closeCode: overflowRecord.closeCode,
        closeReason: overflowRecord.closeReason,
      },
      latencyMs: {
        createWorld: rounded(created.latencyMs),
        welcomes: reportLatency(records),
        allConnectedAndPresent: rounded(presenceAt - connectionStartedAt),
        poseBurstAndObservation: rounded(poseCompleteAt - poseStartedAt),
        editBroadcast: rounded(editCompleteAt - editStartedAt),
        overflowClientRejection: rounded(performance.now() - overflowStartedAt),
        total: rounded(performance.now() - totalStartedAt),
      },
      counters,
    }
  } finally {
    await closeAll([...records, overflowRecord].filter(Boolean))
  }
}

export async function main(environment = process.env) {
  const options = parseLoadOptions(environment)
  if (options.allowProduction) {
    console.warn('WARNING: ALLOW_PRODUCTION_LOAD=1 is set; the production safety guard is bypassed.')
  }
  const report = await runLiveWorldLoad(options)
  console.log(JSON.stringify(report, null, 2))
  return report
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Live world load test failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
