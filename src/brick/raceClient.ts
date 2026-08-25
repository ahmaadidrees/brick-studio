export type RaceConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error'

export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'finished'

export interface RacePose {
  position: [number, number, number]
  rotation: number
  velocity?: [number, number, number]
  animation?: string
  at?: number
}

export interface RacePlayer {
  id: string
  name?: string
  color: string
  pose?: RacePose
  ready?: boolean
  finishedAt?: number
  isHost?: boolean
  connectedAt?: number
}

export interface RaceStatus {
  phase: RacePhase
  countdownAt?: number
  startedAt?: number
  finishOrder?: string[]
}

export interface RaceRoom<TWorld = unknown> {
  roomId: string
  title: string
  document: TWorld
  /** Alias kept for scene consumers. */
  world: TWorld
  status: RaceStatus
  locked?: boolean
  playerCount?: number
}

export interface CreatedRaceRoom<TWorld = unknown> extends RaceRoom<TWorld> {
  hostToken: string
}

export interface RaceClientState {
  connection: RaceConnection
  selfId: string
  players: Record<string, RacePlayer>
  status: RaceStatus
  error?: string
}

type ServerMessage =
  | { type: 'welcome'; selfId?: string; players?: RacePlayer[] | Record<string, RacePlayer>; status?: RaceStatus }
  | { type: 'players'; players: RacePlayer[] | Record<string, RacePlayer> }
  | { type: 'pose'; player: RacePlayer }
  | { type: 'state' | 'status'; status: RaceStatus; players?: RacePlayer[] | Record<string, RacePlayer> }
  | { type: 'player-left'; playerId: string }
  | { type: 'error'; message: string }
  | { type: 'welcome'; playerId: string; players: BackendPlayer[]; status: BackendStatus; startAt?: number | null; finishOrder?: string[] }
  | { type: 'pose'; playerId: string; x: number; y: number; z: number; yaw: number; moving: boolean; jumping: boolean; at: number }
  | { type: 'raceStart'; startAt: number; countdownMs: number }
  | { type: 'raceLive'; startAt: number }
  | { type: 'raceReset' }
  | { type: 'raceFinish'; playerId: string; finishedAt: number; finishOrder: string[] }
  | { type: 'locked'; locked: boolean }

type BackendStatus = 'waiting' | 'countdown' | 'racing'
type BackendPlayer = { playerId: string; isHost?: boolean; ready?: boolean; connectedAt?: number; finishedAt?: number | null }

export interface RaceClientOptions {
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  createWebSocket?: (url: string) => WebSocket
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  now?: () => number
  random?: () => number
  reconnectDelays?: number[]
  poseIntervalMs?: number
  setTimeout?: typeof globalThis.setTimeout
  clearTimeout?: typeof globalThis.clearTimeout
  title?: string
}

const PLAYER_ID_KEY = 'brick-studio-race-player-id'
const PLAYER_COLOR_KEY = 'brick-studio-race-player-color'
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16']
const DEFAULT_STATUS: RaceStatus = { phase: 'lobby' }

function runtimeBaseUrl(): string {
  const configured = import.meta.env.VITE_RACE_SERVER_URL as string | undefined
  return (configured?.trim() || 'http://localhost:8787').replace(/\/$/, '')
}

function playerMap(players: RacePlayer[] | Record<string, RacePlayer> | undefined): Record<string, RacePlayer> {
  if (!players) return {}
  if (!Array.isArray(players)) return { ...players }
  return Object.fromEntries(players.map((player) => [player.id, player]))
}

function colorFor(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0
  return COLORS[Math.abs(hash) % COLORS.length] ?? COLORS[0]
}

function backendPlayers(players: BackendPlayer[]): Record<string, RacePlayer> {
  return Object.fromEntries(players.map((player) => [player.playerId, {
    id: player.playerId, color: colorFor(player.playerId), isHost: player.isHost,
    ready: player.ready, connectedAt: player.connectedAt, finishedAt: player.finishedAt ?? undefined,
  }]))
}

function backendStatus(status: BackendStatus, startAt?: number | null, finishOrder?: string[]): RaceStatus {
  return { phase: status === 'waiting' ? 'lobby' : status, ...(startAt ? { [status === 'countdown' ? 'countdownAt' : 'startedAt']: startAt } : {}), finishOrder }
}

function websocketUrl(baseUrl: string, roomId: string, playerId: string, hostToken?: string): string {
  const url = new URL(`${baseUrl}/rooms/${encodeURIComponent(roomId)}/connect`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('playerId', playerId)
  if (hostToken) url.searchParams.set('hostToken', hostToken)
  return url.toString()
}

function readOrCreateIdentity(options: RaceClientOptions): { id: string; color: string } {
  const storage = options.storage ?? (typeof sessionStorage === 'undefined' ? undefined : sessionStorage)
  const random = options.random ?? Math.random
  let id = storage?.getItem(PLAYER_ID_KEY) ?? ''
  let color = storage?.getItem(PLAYER_COLOR_KEY) ?? ''
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `player-${random().toString(36).slice(2, 12)}`
    storage?.setItem(PLAYER_ID_KEY, id)
  }
  if (!color) {
    color = COLORS[Math.floor(random() * COLORS.length)] ?? COLORS[0]
    storage?.setItem(PLAYER_COLOR_KEY, color)
  }
  return { id, color }
}

async function jsonRequest<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init)
  if (!response.ok) throw new Error(`Race server request failed (${response.status})`)
  return response.json() as Promise<T>
}

export async function createRaceRoom<TWorld>(world: TWorld, options: RaceClientOptions = {}): Promise<CreatedRaceRoom<TWorld>> {
  const baseUrl = (options.baseUrl ?? runtimeBaseUrl()).replace(/\/$/, '')
  const fetcher = options.fetch ?? globalThis.fetch
  const created = await jsonRequest<{ roomId: string; hostToken: string }>(fetcher, `${baseUrl}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: options.title ?? 'Brick Studio Race', document: world }),
  })
  return { ...created, title: options.title ?? 'Brick Studio Race', document: world, world, status: DEFAULT_STATUS }
}

export async function getRaceRoom<TWorld>(roomId: string, options: RaceClientOptions = {}): Promise<RaceRoom<TWorld>> {
  const baseUrl = (options.baseUrl ?? runtimeBaseUrl()).replace(/\/$/, '')
  const room = await jsonRequest<{ title: string; document: TWorld; status: BackendStatus; locked?: boolean; players?: BackendPlayer[] }>(options.fetch ?? globalThis.fetch, `${baseUrl}/rooms/${encodeURIComponent(roomId)}`)
  return { roomId, title: room.title, document: room.document, world: room.document, status: backendStatus(room.status), locked: room.locked, playerCount: room.players?.length }
}

export class RaceClient {
  private readonly options: Required<Pick<RaceClientOptions, 'now' | 'random' | 'reconnectDelays' | 'poseIntervalMs' | 'setTimeout' | 'clearTimeout'>> & RaceClientOptions
  private state: RaceClientState
  private listeners = new Set<() => void>()
  private socket?: WebSocket
  private roomId?: string
  private hostToken?: string
  private reconnectAttempt = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private lastPoseAt = -Infinity
  private pendingPose?: RacePose
  private poseTimer?: ReturnType<typeof setTimeout>
  private intentionallyClosed = false
  readonly color: string

  constructor(options: RaceClientOptions = {}) {
    const identity = readOrCreateIdentity(options)
    this.color = identity.color
    this.state = { connection: 'idle', selfId: identity.id, players: {}, status: DEFAULT_STATUS }
    this.options = {
      ...options,
      now: options.now ?? (() => Date.now()),
      random: options.random ?? Math.random,
      reconnectDelays: options.reconnectDelays ?? [250, 500, 1_000, 2_000, 5_000],
      poseIntervalMs: options.poseIntervalMs ?? 75,
      setTimeout: options.setTimeout ?? ((handler, timeout) => globalThis.setTimeout(handler, timeout)),
      clearTimeout: options.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer)),
    }
  }

  getSnapshot = (): RaceClientState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  connect(roomId: string, hostToken?: string): void {
    this.disconnect(true)
    this.roomId = roomId
    this.hostToken = hostToken
    this.intentionallyClosed = false
    this.reconnectAttempt = 0
    this.openSocket('connecting')
  }

  disconnect(permanent = true): void {
    this.intentionallyClosed = permanent
    if (this.reconnectTimer) this.options.clearTimeout(this.reconnectTimer)
    if (this.poseTimer) this.options.clearTimeout(this.poseTimer)
    this.reconnectTimer = undefined
    this.poseTimer = undefined
    const socket = this.socket
    this.socket = undefined
    socket?.close()
    if (permanent) this.update({ connection: 'closed' })
  }

  sendPose(pose: RacePose): void {
    this.pendingPose = { ...pose, at: pose.at ?? this.options.now() }
    const wait = this.options.poseIntervalMs - (this.options.now() - this.lastPoseAt)
    if (wait <= 0) this.flushPose()
    else if (!this.poseTimer) this.poseTimer = this.options.setTimeout(() => {
      this.poseTimer = undefined
      this.flushPose()
    }, wait)
  }

  startRace(countdownMs = 3_000): boolean {
    return this.send({ type: 'start', countdownMs })
  }

  resetRace(): boolean {
    return this.send({ type: 'reset' })
  }

  finishRace(): boolean { return this.send({ type: 'finish' }) }

  lockRoom(locked: boolean): boolean { return this.send({ type: 'lock', locked }) }

  setReady(ready: boolean): boolean {
    return this.send({ type: 'ready', ready })
  }

  private openSocket(connection: RaceConnection): void {
    if (!this.roomId || this.intentionallyClosed) return
    this.update({ connection, error: undefined })
    const baseUrl = (this.options.baseUrl ?? runtimeBaseUrl()).replace(/\/$/, '')
    const createWebSocket = this.options.createWebSocket ?? ((url: string) => new WebSocket(url))
    const socket = createWebSocket(websocketUrl(baseUrl, this.roomId, this.state.selfId, this.hostToken))
    this.socket = socket
    socket.addEventListener('open', () => {
      if (socket !== this.socket) return
      this.reconnectAttempt = 0
      this.update({ connection: 'connected' })
    })
    socket.addEventListener('message', (event) => this.handleMessage(event.data))
    socket.addEventListener('error', () => {
      if (socket === this.socket) this.update({ connection: 'error', error: 'Race connection failed' })
    })
    socket.addEventListener('close', () => {
      if (socket !== this.socket || this.intentionallyClosed) return
      this.socket = undefined
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return
    const delays = this.options.reconnectDelays
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)] ?? 1_000
    this.reconnectAttempt += 1
    this.update({ connection: 'reconnecting' })
    this.reconnectTimer = this.options.setTimeout(() => {
      this.reconnectTimer = undefined
      this.openSocket('reconnecting')
    }, delay)
  }

  private handleMessage(raw: unknown): void {
    try {
      const message = JSON.parse(String(raw)) as ServerMessage
      if (message.type === 'welcome') {
        this.update({
          selfId: 'playerId' in message ? message.playerId : message.selfId ?? this.state.selfId,
          players: 'playerId' in message ? backendPlayers(message.players as BackendPlayer[]) : playerMap(message.players),
          status: typeof message.status === 'string' ? backendStatus(message.status, message.startAt, message.finishOrder) : message.status ?? this.state.status,
        })
      } else if (message.type === 'players') {
        const players = message.players as RacePlayer[] | Record<string, RacePlayer> | BackendPlayer[]
        this.update({ players: Array.isArray(players) && players.length > 0 && 'playerId' in players[0] ? backendPlayers(players as BackendPlayer[]) : playerMap(players as RacePlayer[]) })
      } else if (message.type === 'pose') {
        if ('player' in message) this.update({ players: { ...this.state.players, [message.player.id]: message.player } })
        else {
          const existing = this.state.players[message.playerId] ?? { id: message.playerId, color: colorFor(message.playerId) }
          this.update({ players: { ...this.state.players, [message.playerId]: { ...existing, pose: {
            position: [message.x, message.y, message.z], rotation: message.yaw,
            velocity: message.moving ? [0, 0, 1] : [0, 0, 0], animation: message.jumping ? 'jumping' : message.moving ? 'moving' : 'idle', at: message.at,
          } } } })
        }
      } else if (message.type === 'state' || message.type === 'status') {
        this.update({ status: message.status, ...(message.players ? { players: playerMap(message.players) } : {}) })
      } else if (message.type === 'player-left') {
        const players = { ...this.state.players }
        delete players[message.playerId]
        this.update({ players })
      } else if (message.type === 'error') {
        this.update({ error: 'message' in message ? message.message : String((message as { error?: string }).error ?? 'Race server error') })
      } else if (message.type === 'raceStart') {
        this.update({ status: { phase: 'countdown', countdownAt: message.startAt, finishOrder: [] } })
      } else if (message.type === 'raceLive') {
        this.update({ status: { ...this.state.status, phase: 'racing', startedAt: message.startAt } })
      } else if (message.type === 'raceReset') {
        this.update({ status: DEFAULT_STATUS })
      } else if (message.type === 'raceFinish') {
        const player = this.state.players[message.playerId]
        this.update({
          status: { ...this.state.status, finishOrder: message.finishOrder },
          ...(player ? { players: { ...this.state.players, [message.playerId]: { ...player, finishedAt: message.finishedAt } } } : {}),
        })
      }
    } catch {
      this.update({ error: 'Race server sent an invalid message' })
    }
  }

  private flushPose(): void {
    if (!this.pendingPose) return
    const pose = this.pendingPose
    if (this.send({
      type: 'pose', x: pose.position[0], y: pose.position[1], z: pose.position[2], yaw: pose.rotation,
      moving: pose.animation === 'moving' || Boolean(pose.velocity?.some((value) => Math.abs(value) > 0.01)),
      jumping: pose.animation === 'jumping',
    })) {
      this.pendingPose = undefined
      this.lastPoseAt = this.options.now()
    }
  }

  private send(message: object): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  private update(patch: Partial<RaceClientState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
}
