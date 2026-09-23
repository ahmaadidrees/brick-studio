import { House, LoaderCircle, LogIn, Play } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createBlankLevel, type LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { COURSES, courseById } from '@brick-studio/platformer-core/levels/courses'
import type { RoomInfo } from '@brick-studio/platformer-core/net/protocol'
import { browserClassroomClient } from '../classroom/client'
import { AppHeader, currentPath, goToJoin, useClassroomSession } from '../shell'
import { Button, TextField } from '../ui'
import { classRoomSocketUrl, guestRoomInfo, guestRoomSocketUrl } from './net/endpoints'
import { parse2dRoute, type Route2D } from './routes2d'
import { NotALevelError, cloudWorldInfo, loadCloudLevel } from './ui/cloudLevel'
import { listDrafts, loadDraft } from './ui/drafts'
import { GameScreen, type LevelSource } from './ui/GameScreen'
import { Home2D } from './ui/Home2D'
import { ownerTokenFor, saveGuestName, savedGuestName } from './ui/prefs'
import { decodeShareCode } from './ui/shareCode'
import './ui/platformer.css'

/** The /2d chunk: one page per load, like the rest of the app (every navigation is a full page load). */
export default function PlatformerApp() {
  const [route] = useState<Route2D>(() => parse2dRoute(window.location))
  switch (route.kind) {
    case 'home':
      return <Home2D />
    case 'build':
      return <BuildPage {...route} />
    case 'course':
      return <CoursePage id={route.id} />
    case 'shared':
      return <SharedPage code={route.code} />
    case 'guest':
      return <GuestRoomPage roomId={route.roomId} />
    case 'classroom':
      return <ClassRoomPage worldId={route.worldId} />
    default:
      return (
        <Notice title="We couldn't find that page">
          <Button href="/2d" variant="primary" icon={<House size={18} />}>
            2D worlds
          </Button>
        </Notice>
      )
  }
}

const HOME = () => window.location.assign('/2d')

/** A centered card for loading and error states, under the shared page header. */
function Notice({ title, body, busy, children }: { title: string; body?: string; busy?: boolean; children?: ReactNode }) {
  return (
    <div className="p2d-page">
      <AppHeader variant="page" title="2D worlds" />
      <main className="p2d-notice">
        <div className="p2d-card">
          {busy && <LoaderCircle className="ui-spin" size={28} aria-hidden="true" />}
          <h1 className="p2d-notice-title" role={busy ? 'status' : undefined}>
            {title}
          </h1>
          {body && <p className="p2d-lead">{body}</p>}
          {children}
        </div>
      </main>
    </div>
  )
}

type Loaded = { level: LevelDesign; source: LevelSource }

function BuildPage({ world, draft, fresh }: { world?: string; draft?: string; fresh: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const done = (value: Loaded) => !cancelled && setLoaded(value)
    void (async () => {
      if (world) {
        if (!browserClassroomClient.getSession()) return goToJoin({ mode: 'signin', next: currentPath() })
        try {
          const { world: w, level } = await loadCloudLevel(world)
          done({ level, source: { kind: 'cloud', world: w } })
        } catch (e) {
          if (e instanceof NotALevelError) return window.location.replace(`/build?world=${encodeURIComponent(world)}`)
          if (!cancelled) setError(e instanceof Error ? e.message : 'This world could not be opened.')
        }
        return
      }
      if (draft) {
        const level = loadDraft(draft)
        if (level) return done({ level, source: { kind: 'draft', id: draft } })
      }
      if (!fresh && !draft) {
        // "Your latest 2D world": the account's newest, else this browser's newest, else a new one.
        if (browserClassroomClient.getSession()) {
          try {
            const me = browserClassroomClient.getSession()?.user.id
            const latest = (await browserClassroomClient.listWorlds()).filter((w) => w.format === '2d' && w.kind === 'personal' && w.ownerId === me)
            latest.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
            if (latest[0]) {
              const { world: w, level } = await loadCloudLevel(latest[0].id)
              window.history.replaceState(null, '', `/2d/build?world=${encodeURIComponent(w.id)}`)
              return done({ level, source: { kind: 'cloud', world: w } })
            }
          } catch {
            // Fall through to this browser's levels.
          }
        }
        const recent = listDrafts()[0]
        const level = recent ? loadDraft(recent.id) : null
        if (recent && level) return done({ level, source: { kind: 'draft', id: recent.id } })
      }
      done({ level: createBlankLevel(160, 27, 'My world'), source: { kind: 'new' } })
    })()
    return () => {
      cancelled = true
    }
  }, [world, draft, fresh])

  if (error)
    return (
      <Notice title="This world could not be opened" body={error}>
        <Button href="/2d" variant="primary" icon={<House size={18} />}>
          2D worlds
        </Button>
      </Notice>
    )
  if (!loaded) return <Notice title="Opening your world…" busy />
  // Someone else's level opened here (not through its room) is for playing only.
  const readOnly = loaded.source.kind === 'cloud' && !loaded.source.world.canEdit
  return <GameScreen level={loaded.level} source={loaded.source} startMode={readOnly ? 'play' : 'build'} onExit={HOME} exitLabel="Back to 2D worlds" />
}

function CoursePage({ id }: { id: string }) {
  const course = courseById(id)
  if (!course)
    return (
      <Notice title="We couldn't find that course">
        <Button href="/2d" variant="primary" icon={<House size={18} />}>
          2D worlds
        </Button>
      </Notice>
    )
  const index = COURSES.indexOf(course)
  const next = COURSES[index + 1]
  return (
    <GameScreen
      level={course.level()}
      source={{ kind: 'course', id: course.id }}
      startMode="play"
      onExit={HOME}
      exitLabel="Back to 2D worlds"
      onNext={next ? () => window.location.assign(`/2d/play/${next.id}`) : undefined}
    />
  )
}

function SharedPage({ code }: { code: string | null }) {
  const [level, setLevel] = useState<LevelDesign | null>(null)
  const [error, setError] = useState(code ? '' : 'This link does not include a world.')
  useEffect(() => {
    if (!code) return
    decodeShareCode(code).then(setLevel, () => setError('That share link could not be read. Ask for a new one.'))
  }, [code])
  if (error)
    return (
      <Notice title="This world could not be opened" body={error}>
        <Button href="/2d" variant="primary" icon={<House size={18} />}>
          2D worlds
        </Button>
      </Notice>
    )
  if (!level) return <Notice title="Opening the world…" busy />
  return <GameScreen level={level} source={{ kind: 'shared' }} startMode="play" onExit={HOME} exitLabel="Back to 2D worlds" />
}

/** Before joining a guest room: check it exists and ask for a name (signed-in users get theirs filled in). */
function GuestRoomPage({ roomId }: { roomId: string }) {
  const account = useClassroomSession()
  const [info, setInfo] = useState<RoomInfo | null | 'loading'>('loading')
  const [error, setError] = useState('')
  const [name, setName] = useState(() => savedGuestName())
  const [joined, setJoined] = useState<string | null>(null)
  const ownerToken = ownerTokenFor(roomId)
  useEffect(() => {
    guestRoomInfo(roomId).then(setInfo, (e: Error) => setError(e.message))
  }, [roomId])
  useEffect(() => {
    if (!name && account.displayName) setName(account.displayName)
  }, [account.displayName, name])

  if (joined)
    return (
      <GameScreen
        level={createBlankLevel(40, 20, '…')}
        source={{ kind: 'room', roomKind: 'guest', roomId }}
        startMode="play"
        room={{ roomId, name: joined, url: guestRoomSocketUrl(roomId, ownerToken) }}
        onExit={HOME}
        exitLabel="Leave the room"
      />
    )
  if (error)
    return (
      <Notice title="The room service is unreachable" body={`${error} Check the connection and try again.`}>
        <Button href="/2d" icon={<House size={18} />}>
          2D worlds
        </Button>
      </Notice>
    )
  if (info === 'loading') return <Notice title="Finding the room…" busy />
  if (info === null)
    return (
      <Notice title="This room has closed" body="Rooms are forgotten about two hours after everyone leaves. Ask for a new link, or open your own.">
        <Button href="/2d" variant="primary" icon={<House size={18} />}>
          2D worlds
        </Button>
      </Notice>
    )
  const refused = !ownerToken && (info.full ? 'This room is full.' : info.closed ? 'The host has closed this room to new players.' : null)
  const join = () => {
    const n = name.trim().slice(0, 16) || 'Builder'
    saveGuestName(n)
    setJoined(n)
  }
  return (
    <Notice title={`${ownerToken ? 'Your room' : 'Join'} “${info.title}”`} body={info.players === 0 ? 'Nobody is inside yet.' : `${info.players} ${info.players === 1 ? 'player' : 'players'} inside.`}>
      {refused ? (
        <p className="p2d-error">{refused}</p>
      ) : (
        <form
          className="p2d-name-form"
          onSubmit={(e) => {
            e.preventDefault()
            join()
          }}
        >
          <TextField label="Your name" value={name} maxLength={16} autoFocus autoComplete="off" placeholder="Builder" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" size="lg" fullWidth icon={<Play size={20} />}>
            {ownerToken ? 'Open the room' : 'Join'}
          </Button>
        </form>
      )}
      <Button href="/2d" variant="quiet" icon={<House size={18} />}>
        Back to 2D worlds
      </Button>
    </Notice>
  )
}

/** A class level's live room: signed-in only; the Worker checks this account may open it and names the host. */
function ClassRoomPage({ worldId }: { worldId: string }) {
  const account = useClassroomSession()
  const [title, setTitle] = useState<string | null>(null)
  const [error, setError] = useState('')
  const signedIn = account.status === 'student' || account.status === 'teacher'
  useEffect(() => {
    if (!browserClassroomClient.getSession()) return
    cloudWorldInfo(worldId).then(
      (w) => {
        if (w.format !== '2d') return window.location.replace(`/live/${worldId.replaceAll('-', '')}`)
        setTitle(w.title)
      },
      (e: Error) => setError(e.message),
    )
  }, [worldId, signedIn])
  if (!signedIn && account.status !== 'loading')
    return (
      <Notice title="Sign in to open this world" body="Class worlds open for the students and teacher of the class.">
        <Button variant="primary" icon={<LogIn size={18} />} onClick={() => goToJoin({ mode: 'signin', next: currentPath() })}>
          Sign in
        </Button>
      </Notice>
    )
  if (error)
    return (
      <Notice title="This world could not be opened" body={error}>
        <Button href="/worlds" variant="primary" icon={<House size={18} />}>
          My worlds
        </Button>
      </Notice>
    )
  if (!title) return <Notice title="Opening the world…" busy />
  const invited = new URLSearchParams(window.location.search).get('invited') === '1'
  if (invited) window.history.replaceState(null, '', window.location.pathname)
  return (
    <GameScreen
      level={createBlankLevel(40, 20, title)}
      source={{ kind: 'room', roomKind: 'classroom', roomId: worldId.replaceAll('-', '') }}
      startMode="play"
      room={{ roomId: worldId.replaceAll('-', ''), name: account.displayName ?? 'Builder', url: () => classRoomSocketUrl(worldId) }}
      onExit={() => window.location.assign('/worlds')}
      exitLabel="Back to My worlds"
    />
  )
}
