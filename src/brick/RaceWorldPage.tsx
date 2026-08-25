import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import BrickStudioApp from './BrickStudioApp'
import type { RaceAvatarPose, RemoteRaceAvatar } from './BrickStudioScene'
import type { PublishedWorld } from './publishedWorlds'
import { getRaceRoom, RaceClient, type RaceClientState, type RaceStatus } from './raceClient'

function roomIdFromPath() {
  const match = window.location.pathname.match(/^\/race\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : ''
}

function hostTokenFromHash() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  return params.get('host') ?? undefined
}

function statusLabel(status: RaceStatus, now: number) {
  if (status.phase === 'countdown' && status.countdownAt) {
    return { headline: String(Math.max(1, Math.ceil((status.countdownAt - now) / 1_000))), detail: 'Get ready', countdown: true }
  }
  if (status.phase === 'racing') return { headline: 'Go!', detail: 'Race in progress', countdown: false }
  if (status.phase === 'finished') return { headline: 'Finished!', detail: 'Race complete', countdown: false }
  return { headline: 'Lobby', detail: 'Waiting for the host', countdown: false }
}

function RaceHud({ roomId, host, state, onStart, onReset }: {
  roomId: string
  host: boolean
  state: RaceClientState
  onStart: () => void
  onReset: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (state.status.phase !== 'countdown') return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [state.status.phase])
  const status = statusLabel(state.status, now)
  const players = Object.values(state.players)
  const copyGuestLink = async () => {
    const link = new URL(`/race/${encodeURIComponent(roomId)}`, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Share this race link:', link)
    }
  }
  return <>
    <div className="race-hud">
      <div className="race-room-card">
        <div><span>Race room</span><strong>{roomId}</strong></div>
        <span className="race-participants" aria-label={`${players.length} racers`}>{players.length}</span>
        <button type="button" onClick={copyGuestLink}>{copied ? 'Copied!' : 'Copy join link'}</button>
      </div>
      {host && <div className="race-host-card">
        <span>Host controls</span>
        <button className="primary" type="button" onClick={onStart} disabled={state.connection !== 'connected' || state.status.phase === 'countdown'}>Start</button>
        <button type="button" onClick={onReset} disabled={state.connection !== 'connected'}>Reset</button>
      </div>}
    </div>
    <div className="race-status"><strong>{status.headline}</strong><span>{status.detail} · {state.connection}</span></div>
    {status.countdown && <div className="race-countdown" aria-live="assertive">{status.headline}</div>}
    {state.error && <div className="race-error" role="alert">{state.error}</div>}
  </>
}

export default function RaceWorldPage() {
  const roomId = useMemo(roomIdFromPath, [])
  const hostToken = useMemo(hostTokenFromHash, [])
  const client = useMemo(() => new RaceClient(), [])
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot)
  const [world, setWorld] = useState<PublishedWorld | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!roomId) {
      setError('This race link is invalid.')
      return
    }
    getRaceRoom<PublishedWorld>(roomId)
      .then((room) => {
        if (!active) return
        setWorld(room.world)
        client.connect(roomId, hostToken)
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not open this race.') })
    return () => {
      active = false
      client.disconnect()
    }
  }, [client, hostToken, roomId])

  const sendPose = useCallback((pose: RaceAvatarPose) => {
    const speed = pose.horizontalSpeed
    client.sendPose({
      position: pose.position,
      rotation: pose.facingYaw,
      velocity: [Math.sin(pose.facingYaw) * speed, 0, Math.cos(pose.facingYaw) * speed],
      animation: pose.grounded ? (speed > 0.1 ? 'moving' : 'idle') : 'jumping',
    })
  }, [client])

  const remoteAvatars = useMemo<RemoteRaceAvatar[]>(() => Object.values(state.players)
    .filter((player) => player.id !== state.selfId && player.pose)
    .map((player) => {
      const pose = player.pose!
      const velocity = pose.velocity ?? [0, 0, 0]
      return {
        id: player.id,
        name: player.name,
        color: player.color,
        position: pose.position,
        facingYaw: pose.rotation,
        horizontalSpeed: Math.hypot(velocity[0], velocity[2]),
        grounded: pose.animation !== 'air' && pose.animation !== 'jumping',
      }
    }), [state.players, state.selfId])

  if (error) return <main className="published-world-state"><h1>Race unavailable</h1><p>{error}</p><a href="/">Open Brick Studio</a></main>
  if (!world) return <main className="published-world-state"><h1>Joining race…</h1><p>Loading room {roomId}</p></main>

  return <BrickStudioApp
    publishedWorld={world}
    raceScene={{ onLocalAvatarPose: sendPose, remoteAvatars }}
    raceOverlay={<RaceHud roomId={roomId} host={Boolean(hostToken)} state={state} onStart={() => client.startRace()} onReset={() => client.resetRace()} />}
  />
}
