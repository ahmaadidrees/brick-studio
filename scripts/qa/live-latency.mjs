/**
 * Live-room latency probe: how long a brick placement takes to be acknowledged, and how a burst of placements
 * queues, for a guest room (Durable Object only) and, when a student login is supplied, a classroom room
 * (Durable Object + Supabase commit per edit). Drives the real WebSocket protocol with no browser.
 *
 * Environment:
 *   QA_API                    worker origin (default: the staging worker)
 *   QA_ORIGIN                 an allowed frontend origin for the Origin header (default: https://brickgineers.com)
 *   QA_STUDENT_USERNAME/PASSWORD   a classroom student; without them only the guest room is measured
 *   QA_SERIAL (default 20)    sequential placements, one at a time, each timed to its ack
 *   QA_BURST (default 20)     placements sent back to back (the room allows 30 messages per socket per second); reports first/last ack
 *   QA_OUTPUT                 JSON report path (optional)
 *
 * Run: node scripts/qa/live-latency.mjs
 */
import { writeFile } from 'node:fs/promises'
import WebSocket from 'ws'

const api = (process.env.QA_API || 'https://brick-studio-multiplayer-staging.brick-studio-race-worker.workers.dev').replace(/\/+$/, '')
const origin = process.env.QA_ORIGIN || 'https://brickgineers.com'
const SERIAL = Number(process.env.QA_SERIAL || 20), BURST = Number(process.env.QA_BURST || 20)
const V = 1
const ACK_TIMEOUT_MS = 15_000
const document = { schemaVersion: 2, partLibraryVersion: 1, environmentId: 'classic', customParts: [], bricks: [] }
const report = { api, at: new Date().toISOString(), guest: null, classroom: null }

const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] }
const summary = (values) => values.length ? { n: values.length, p50: Math.round(percentile(values, 0.5)), p90: Math.round(percentile(values, 0.9)), max: Math.round(Math.max(...values)) } : null

async function request(path, method, body, token) {
  const response = await fetch(`${api}${path}`, { method, headers: { 'content-type': 'application/json', Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${data.code || data.error || ''}`)
  return data
}

/** One connected builder: resolves after the first snapshot; `place(n)` sends n placements and resolves their ack times. */
function connect(url, playerId, label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin } })
    const waiting = new Map()
    let sequence = 0, sawSnapshot = false
    const applied = [] // peers' applies observed (for time-to-see)
    socket.on('open', () => socket.send(JSON.stringify({ v: V, type: 'setProfile', profile: { displayName: label } })))
    socket.on('error', (error) => reject(new Error(`${label}: socket error ${error.message ?? ''}`)))
    socket.on('close', (code, reason) => { if (!sawSnapshot) reject(new Error(`${label}: closed ${code} ${reason}`)) })
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString())
      // The room greets with `welcome` (document + revision); a later `snapshot` is a resync.
      if ((message.type === 'welcome' || message.type === 'snapshot') && !sawSnapshot) { sawSnapshot = true; resolve(api_) }
      if (message.type === 'apply') {
        const pending = waiting.get(message.opId)
        if (pending) { waiting.delete(message.opId); pending.resolve(performance.now() - pending.sentAt) }
        else applied.push({ opId: message.opId, at: performance.now(), from: message.from })
      }
      if (message.type === 'reject') {
        const pending = waiting.get(message.opId)
        if (pending) { waiting.delete(message.opId); pending.reject(new Error(`${label}: ${message.code} ${message.message}`)) }
      }
      if (message.type === 'error') console.error(label, 'error', message.code, message.message)
    })
    const send = (index) => new Promise((res, rej) => {
      const opId = `${playerId}#${++sequence}`
      const brick = { id: `qa-${playerId}-${sequence}`, partId: 'brick_2x4', x: (index % 20) * 2, y: Math.floor(index / 20) * 3, z: (sequence % 7) * 4, rotation: 0, color: '#5888da' }
      const timer = setTimeout(() => { if (waiting.delete(opId)) rej(new Error(`${label}: no ack for ${opId} within ${ACK_TIMEOUT_MS}ms`)) }, ACK_TIMEOUT_MS)
      waiting.set(opId, { resolve: (value) => { clearTimeout(timer); res(value) }, reject: (error) => { clearTimeout(timer); rej(error) }, sentAt: performance.now() })
      socket.send(JSON.stringify({ v: V, type: 'commands', opId, commands: [{ op: 'place', brick }] }))
    })
    const api_ = {
      serial: async (count) => { const times = []; for (let i = 0; i < count; i += 1) times.push(await send(i)); return times },
      burst: async (count) => { const started = performance.now(); const acks = await Promise.all(Array.from({ length: count }, (_, i) => send(100 + i))); return { started, acks } },
      applied, close: () => socket.close(1000, 'done'),
    }
  })
}

async function measure(label, ownerUrl, ownerId, peerUrl, peerId) {
  const owner = await connect(ownerUrl, ownerId, `${label} owner`)
  console.error(label, 'owner connected')
  const peer = peerUrl ? await connect(peerUrl, peerId, `${label} peer`) : null
  if (peer) console.error(label, 'peer connected')
  const serial = await owner.serial(SERIAL)
  console.error(label, 'serial ack ms', JSON.stringify(summary(serial)))
  const burst = await owner.burst(BURST)
  console.error(label, 'burst done')
  const burstSpan = Math.max(...burst.acks) - Math.min(...burst.acks)
  await new Promise((r) => setTimeout(r, 500))
  const seenByPeer = peer ? peer.applied.length : null
  owner.close(); peer?.close()
  const result = {
    serialAckMs: summary(serial),
    burst: { sent: BURST, firstAckMs: Math.round(Math.min(...burst.acks)), lastAckMs: Math.round(Math.max(...burst.acks)), perOpMs: Math.round(burstSpan / Math.max(1, BURST - 1)) },
    peerSawApplies: seenByPeer,
  }
  console.log(label, JSON.stringify(result))
  return result
}

try {
  // Guest room: create through the same route the app uses, connect as owner (ownerToken) and as one peer.
  const created = await request('/worlds', 'POST', { title: 'Latency probe', document, profile: { displayName: 'Probe owner' } })
  const ws = api.replace(/^http/, 'ws')
  const ownerId = 'probeowner01', peerId = 'probepeer001'
  report.guest = await measure('guest',
    `${ws}/worlds/${created.roomId}/connect?playerId=${ownerId}&documentSchema=3&ownerToken=${encodeURIComponent(created.ownerToken)}`, ownerId,
    `${ws}/worlds/${created.roomId}/connect?playerId=${peerId}&documentSchema=3&profile=${encodeURIComponent(JSON.stringify({ displayName: 'Probe peer' }))}`, peerId)

  if (process.env.QA_STUDENT_USERNAME && process.env.QA_STUDENT_PASSWORD) {
    const login = await request('/classroom/auth/login', 'POST', { username: process.env.QA_STUDENT_USERNAME, password: process.env.QA_STUDENT_PASSWORD })
    const token = login.session.accessToken, userId = login.user.id
    const world = (await request('/classroom/worlds', 'POST', { title: 'Latency probe (classroom)', document }, token)).world
    const ticket = (await request(`/classroom/worlds/${world.id}/live-ticket`, 'POST', undefined, token)).ticket
    const roomId = world.id.replaceAll('-', '')
    report.classroom = await measure('classroom', `${ws}/worlds/${roomId}/connect?ticket=${encodeURIComponent(ticket)}&documentSchema=3`, userId, null, null)
    report.classroomWorldId = world.id
  } else {
    console.log('classroom: skipped (set QA_STUDENT_USERNAME and QA_STUDENT_PASSWORD to measure a classroom room)')
  }
  if (process.env.QA_OUTPUT) await writeFile(process.env.QA_OUTPUT, JSON.stringify(report, null, 2))
} catch (error) {
  console.error('FAILED', error.message)
  process.exit(1)
}
