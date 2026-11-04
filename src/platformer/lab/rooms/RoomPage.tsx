/**
 * Joining a Hackable room (docs/qa/hackable-rooms M1): /2d/hackable/r/<room> by link, /2d/hackable/w/<project> for a
 * class project shared with you. You play the room's game with everyone: your own Hero, your keys. Changing the
 * project is the host's (hacking together is M2), so this page is Play only.
 */
import { House, LoaderCircle, LogIn, Play } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AppHeader, joinPath, useClassroomSession } from '../../../shell'
import { Button, TextField } from '../../../ui'
import { clientKey, savedGuestName, saveGuestName } from '../../ui/prefs'
import { Stage } from '../studio/Stage'
import { StudioStore } from '../studio/store'
import { partsFor } from '../studio/screen/kitParts'
import { classRoomSocketUrl, guestRoomInfo, guestRoomSocketUrl, ownerTokenOf, roomHref } from './endpoints'
import type { RoomInfo } from './protocol'
import { RoomBar } from './RoomBar'
import { RoomSession } from './session'
import { StudioRoomLink } from './studioRoom'
import '../studio/studio.css'
import '../studio/screen/screen.css'
import './rooms.css'

export type RoomRoute = { kind: 'guest'; roomId: string } | { kind: 'classroom'; worldId: string }

const leave = () => window.location.assign('/projects')
const NO_STORE = () => () => {}

function Notice({ title, body, busy, children }: { title: string; body?: string; busy?: boolean; children?: ReactNode }) {
  return (
    <div className="p2d-page">
      <AppHeader variant="page" title="Projects" />
      <main className="p2d-notice">
        <div className="p2d-card">
          {busy && <LoaderCircle className="ui-spin" size={28} aria-hidden="true" />}
          <h1 className="p2d-notice-title" role={busy ? 'status' : undefined}>{title}</h1>
          {body && <p className="p2d-lead">{body}</p>}
          {children}
        </div>
      </main>
    </div>
  )
}

export default function RoomPage({ route }: { route: RoomRoute }) {
  const account = useClassroomSession()
  const [info, setInfo] = useState<RoomInfo | null | 'loading'>(route.kind === 'guest' ? 'loading' : null)
  const [error, setError] = useState('')
  const [name, setName] = useState(() => savedGuestName())
  const [joined, setJoined] = useState<string | null>(null)
  useEffect(() => {
    if (route.kind === 'guest') guestRoomInfo(route.roomId).then(setInfo, (e: Error) => setError(e.message))
  }, [route])
  useEffect(() => {
    if (!name && account.displayName) setName(account.displayName)
  }, [account.displayName, name])

  if (route.kind === 'classroom') {
    const signedIn = account.status === 'student' || account.status === 'teacher'
    if (account.status === 'loading') return <Notice title="Opening the room…" busy />
    if (!signedIn)
      return (
        <Notice title="Sign in to play together" body="This room is for a class project. Sign in with your class account, then open the link again.">
          <Button href={joinPath({ next: roomHref.classroom(route.worldId) })} variant="primary" icon={<LogIn size={18} />}>Sign in</Button>
        </Notice>
      )
    return <RoomPlay url={() => classRoomSocketUrl(route.worldId)} name={account.displayName ?? 'Player'} invite={roomHref.classroom(route.worldId)} />
  }

  const ownerToken = ownerTokenOf(route.roomId)
  if (joined) return <RoomPlay url={guestRoomSocketUrl(route.roomId, ownerToken)} name={joined} invite={roomHref.guest(route.roomId)} />
  if (error)
    return (
      <Notice title="The room service is unreachable" body={`${error} Check the connection and try again.`}>
        <Button href="/projects" icon={<House size={18} />}>My projects</Button>
      </Notice>
    )
  if (info === 'loading') return <Notice title="Finding the room…" busy />
  if (info === null)
    return (
      <Notice title="This room has closed" body="Rooms are forgotten about two hours after everyone leaves. Ask for a new link.">
        <Button href="/projects" variant="primary" icon={<House size={18} />}>My projects</Button>
      </Notice>
    )
  const full = !ownerToken && info.full
  const closed = !ownerToken && !info.full && info.closed
  const join = () => {
    const n = name.trim().slice(0, 16) || 'Player'
    saveGuestName(n)
    setJoined(n)
  }
  return (
    <Notice title={`Play “${info.title}” together`} body={info.players === 0 ? 'Nobody is playing yet.' : `${info.players} ${info.players === 1 ? 'player' : 'players'} playing.`}>
      {full ? (
        <p className="p2d-error">This room is full.</p>
      ) : (
        <form className="p2d-name-form" onSubmit={(e) => { e.preventDefault(); join() }}>
          {closed && <p className="p2d-note">The host has closed this room to new players. If you were in it before, you can rejoin.</p>}
          <TextField label="Your name" value={name} maxLength={16} autoFocus autoComplete="off" placeholder="Player" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" size="lg" fullWidth icon={<Play size={20} />}>{closed ? 'Rejoin' : 'Join'}</Button>
        </form>
      )}
      <Button href="/projects" variant="quiet" icon={<House size={18} />}>Back to My projects</Button>
    </Notice>
  )
}

/** Connected: the room's game fills the screen, once the room has sent it. */
function RoomPlay({ url, name, invite }: { url: string | (() => Promise<string>); name: string; invite: string }) {
  const session = useMemo(() => new RoomSession({ name, url, key: clientKey() }), [url, name])
  const [store, setStore] = useState<StudioStore | null>(null)
  useEffect(() => {
    session.connect()
    let made: StudioStore | null = null
    const follow = () => {
      const design = session.runtime?.world.design
      if (!design) return
      if (!made) {
        made = new StudioStore({ design, workspaces: {} })
        made.enterRoom(new StudioRoomLink(session, ''))
        made.setScreen('play')
        setStore(made)
      } else made.followRoomDesign(design)
    }
    const stop = session.onRuntime(follow)
    follow()
    return () => { stop(); session.close() }
  }, [session])
  const view = useSyncExternalStore((fn) => session.subscribe(fn), () => session.view)
  const offline = view.status === 'offline'
  // The host may rename the project while everyone plays.
  const title = useSyncExternalStore(store ? store.subscribe : NO_STORE, () => store?.getState().project.design.name ?? 'Playing together')

  return (
    <div className="hk-room-page">
      <AppHeader variant="page" title={title} />
      {/* The host here (the owner or the teacher) can't edit; the stage's Restart starts everyone again. */}
      <RoomBar session={session} invite={invite} onLeave={leave} />
      <div className="hk-room-stage p2d-game p2d-studio cl-shell" data-screen="play">
        {store ? <RoomStage store={store} /> : <Notice title={offline ? 'Couldn’t join the room' : 'Joining the room…'} body={offline ? view.detail : undefined} busy={!offline} />}
      </div>
    </div>
  )
}

function RoomStage({ store }: { store: StudioStore }) {
  const parts = partsFor(store.getState().project.design)
  const runtime = store.getState().runtime
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(any-pointer: coarse)').matches
  return (
    <div className="cl-stage-frame">
      <Stage store={store} />
      <parts.PlayHud store={store} />
      {touch && runtime && <parts.TouchControls runtime={runtime} store={store} />}
    </div>
  )
}
