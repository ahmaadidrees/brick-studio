import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { browserClassroomClient, type ClassroomClientSurface } from '../../../classroom/client'
import type { ClassroomWorld } from '../../../classroom/contracts'
import { Button } from '../../../ui'
import type { HeaderSaveStatus } from '../../../shell/AppHeader'
import { StudioShell } from './screen/StudioShell'
import { loadProject, saveProject, watchAndSave } from './storage'
import { clearStorageNotice, setStorageNotice, type StorageNotice } from './persist/notice'
import { StudioStore, type StudioProject } from './store'
import { createStarterProject } from './starter'
import { HackableCloudSaver, NotHackableError, createHackableWorld, loadHackableWorld } from './persist/hackableCloud'
import { MAX_HACKABLE_PROJECTS, NEW_PROJECT_NAME, hackableHref, listHackableProjects, loadHackableText, newHackableId, projectKey, touchHackableEntry } from './persist/hackableProjects'
import { saveHackableProject } from './persist/hackableSave'
import './studio.css'

export interface StudioRoute {
  world?: string
  draft?: string
  fresh: boolean
}

/**
 * Where the open project lives: this browser, the account, someone else's (look only, nothing is saved), or a new one
 * that is kept (in the account, or this browser) only once the kid changes something.
 */
type Opened =
  | { kind: 'local'; id: string; project: StudioProject }
  | { kind: 'account'; world: ClassroomWorld; project: StudioProject }
  | { kind: 'viewer'; world: ClassroomWorld; project: StudioProject }
  | { kind: 'new'; project: StudioProject }

/** Where the project on screen is saved now (a new project moves from 'new' to 'local' or 'account'). */
type Home =
  | { kind: 'local'; id: string; saved: StudioProject }
  | { kind: 'account'; world: ClassroomWorld; saved: StudioProject }
  | { kind: 'viewer'; world: ClassroomWorld }
  | { kind: 'new' }
  /** A new project neither the account nor this browser would keep: the kid is told to save a file. */
  | { kind: 'unsaved' }

const homeOf = (opened: Opened): Home =>
  opened.kind === 'local' ? { kind: 'local', id: opened.id, saved: opened.project }
    : opened.kind === 'account' ? { kind: 'account', world: opened.world, saved: opened.project }
      : opened.kind === 'viewer' ? { kind: 'viewer', world: opened.world }
        : { kind: 'new' }

type Opening = { kind: 'opening' } | { kind: 'problem'; title: string; body: string } | Opened

const newProject = (): StudioProject => {
  const project = createStarterProject()
  return { ...project, design: { ...project.design, name: NEW_PROJECT_NAME } }
}

/** Replace the address without a reload, so a refresh opens this same project. */
const settle = (href: string) => window.history.replaceState(window.history.state, '', href)

/** Exported for tests: what a /2d/hackable address opens. */
export async function openStudioRoute(route: StudioRoute): Promise<Opening> {
  return open(route)
}

async function open(route: StudioRoute): Promise<Opening> {
  const session = browserClassroomClient.getSession()
  const signedIn = !!session
  if (route.world) {
    try {
      const { world, project } = await loadHackableWorld(route.world)
      // Only the owner saves into it. There are no live rooms for Hackable Platformers, so a classmate (or a teacher)
      // who may build in it would save over the owner's project; they look, and make their own copy to keep changes.
      const mine = world.canEdit && !!session && world.ownerId === session.user.id
      return mine ? { kind: 'account', world, project } : { kind: 'viewer', world, project }
    } catch (error) {
      if (error instanceof NotHackableError) {
        window.location.replace(error.world.format === '2d' ? `/2d/build?world=${route.world}` : `/build?world=${route.world}`)
        return { kind: 'opening' }
      }
      const status = (error as { status?: number })?.status
      return status === 401 || !signedIn
        ? { kind: 'problem', title: 'Sign in to open this project', body: 'It is saved in an account. Sign in, then open it again from My projects.' }
        : { kind: 'problem', title: 'We couldn’t open this project', body: error instanceof Error ? error.message : 'Try again from My projects.' }
    }
  }
  if (route.fresh) {
    // Nothing is made until the kid changes something (keepNewProject), so opening and leaving leaves no empty project.
    // A guest learns now, not after building, that this browser cannot keep another one.
    if (!signedIn) {
      const problem = browserCannotKeep()
      if (problem) return problem
    }
    return { kind: 'new', project: newProject() }
  }
  const id = route.draft ?? listHackableProjects()[0]?.id
  if (!id) return open({ fresh: true })
  // The save itself decides, not the list: a project whose list entry was lost still opens (and is listed again).
  if (route.draft && loadHackableText(id) === null) {
    return { kind: 'problem', title: 'That project isn’t on this computer', body: 'It may have been removed, or saved in a different browser. Your other projects are in My projects.' }
  }
  if (!route.draft) settle(hackableHref.local(id))
  return { kind: 'local', id, project: loadProject(undefined, projectKey(id)) }
}

/** The level as the kid made it: keys in a fixed order, and scripts in any order (the editor tidies them on open). */
export function designSignature(design: StudioProject['design']): string {
  const stable = (value: unknown) => JSON.stringify(value, (_key, v: unknown) => {
    if (ArrayBuffer.isView(v)) return Array.from(v as Uint8Array)
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
    return v
  })
  const brick = (b: StudioProject['design']['stage']) => ({ ...b, program: { ...b.program, scripts: b.program.scripts.map(stable).sort(), procedures: b.program.procedures.map(stable).sort() } })
  return stable({ ...design, stage: brick(design.stage), bricks: design.bricks.map(brick) })
}

/** Why this browser cannot keep one more project (a problem card), or null when it can. */
function browserCannotKeep(): Extract<Opening, { kind: 'problem' }> | null {
  let writable = false
  try {
    const probe = 'code-lab.write-check'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    writable = true
  } catch { /* blocked */ }
  if (!writable) return { kind: 'problem', title: 'This browser won’t save projects', body: 'It may be out of space, or saving is turned off. Sign in to keep projects in your account.' }
  if (listHackableProjects().length >= MAX_HACKABLE_PROJECTS) {
    return { kind: 'problem', title: 'This computer is full of projects', body: `This browser keeps ${MAX_HACKABLE_PROJECTS} Hackable Platformers. Remove one in My projects, or sign in to keep more in your account.` }
  }
  return null
}

/**
 * Keep a new project, at the kid's first change: in the account when signed in, otherwise (or when the account is full
 * or out of reach) in this browser. Exported for tests.
 */
export async function keepNewProject(project: StudioProject, client: ClassroomClientSurface = browserClassroomClient): Promise<{ home: Home; href?: string; notice?: StorageNotice }> {
  let accountFull = false
  if (client.getSession()) {
    try {
      const world = await createHackableWorld(project, client)
      return { home: { kind: 'account', world, saved: project }, href: hackableHref.world(world.id) }
    } catch (error) {
      // Full, offline or out of reach: start it in this browser instead; it can move to the account later.
      accountFull = (error as { code?: string })?.code === 'world_limit'
    }
  }
  const id = newHackableId()
  const kept = saveHackableProject(id, project)
  if (!kept.ok) {
    return {
      home: { kind: 'unsaved' },
      notice: {
        id: 'new-not-kept', type: 'error', sticky: false,
        message: kept.reason === 'full'
          ? `${accountFull ? 'Your account is full, and this' : 'This'} computer already keeps ${MAX_HACKABLE_PROJECTS} Hackable Platformers, so this project is not saved. Press This project, then Save File, so you do not lose it.`
          : 'This browser won’t save projects, so this project is not saved. Press This project, then Save File, so you do not lose it.',
      },
    }
  }
  return {
    home: { kind: 'local', id, saved: project },
    href: hackableHref.local(id),
    ...(accountFull ? { notice: { id: 'account-full', type: 'info', sticky: true, message: 'Your account is full, so this project is saved on this computer. Remove a project you no longer need in My projects, then move this one to your account from there.', actions: [{ label: 'OK', run: clearStorageNotice }] } } : {}),
  }
}

/** A small picture of the level for My projects, taken from the stage as the kid works. */
function stagePicture(): string | undefined {
  const canvas = document.querySelector<HTMLCanvasElement>('.cl-stage-frame canvas')
  if (!canvas || !canvas.width || !canvas.height) return undefined
  try {
    // 16:9 like the cards; from the bottom of the stage, where the ground and most bricks are.
    const out = document.createElement('canvas')
    out.width = 320
    out.height = 180
    const h = Math.min(canvas.height, (canvas.width * 9) / 16)
    const w = (h * 16) / 9
    out.getContext('2d')?.drawImage(canvas, (canvas.width - w) / 2, canvas.height - h, w, h, 0, 0, out.width, out.height)
    return out.toDataURL('image/jpeg', 0.7)
  } catch {
    return undefined
  }
}

/**
 * /2d/hackable: the Hackable Platformer (Code Lab on the new core). One shell with Build · Code · Play
 * (docs/qa/code-lab-on-main/UX-AUDIT.md); Code is the only code editor. Each project lives in this browser or in the
 * account, like every other kind in My projects.
 */
export default function StudioApp({ route }: { route: StudioRoute }) {
  const [opening, setOpening] = useState<Opening>({ kind: 'opening' })
  useEffect(() => {
    let live = true
    void open(route).then((o) => { if (live) setOpening(o) })
    return () => { live = false }
  }, [route])
  if (opening.kind === 'opening') return <div className="studio-screen studio-opening" role="status">Opening your project…</div>
  if (opening.kind === 'problem') {
    return (
      <div className="studio-screen studio-opening">
        <div className="studio-problem" role="alert">
          <h1>{opening.title}</h1>
          <p>{opening.body}</p>
          <Button href="/projects" variant="primary">My projects</Button>
        </div>
      </div>
    )
  }
  return <OpenProject opened={opening} />
}

function OpenProject({ opened }: { opened: Opened }) {
  const store = useMemo(() => new StudioStore(opened.project), [opened])
  // Dev only: the console can reach the store (window.__studio) to check state while testing.
  if (import.meta.env.DEV) (window as unknown as { __studio?: StudioStore }).__studio = store
  const [home, setHome] = useState<Home>(() => homeOf(opened))
  useEffect(() => setHome(homeOf(opened)), [opened])
  // The saver's status shows in the header: each change of it re-renders.
  const [, setTick] = useState(0)
  const accountWorld = home.kind === 'account' ? home.world : null
  const saver = useMemo(() => (accountWorld ? new HackableCloudSaver(accountWorld, () => setTick((n) => n + 1)) : null), [accountWorld])
  const savedFirst = home.kind === 'local' || home.kind === 'account' ? home.saved : null
  /** A new project being kept right now (leaving waits for it). */
  const keeping = useRef<Promise<void> | null>(null)

  // A new project: kept at the kid's first change (then the address names it, so a refresh reopens it). Opening Code
  // re-saves the Hero's blocks in the editor's own order; that is not a change.
  useEffect(() => {
    if (home.kind !== 'new') return
    const first = designSignature(store.getState().project.design)
    let seen = store.getState().project
    let started = false
    let live = true
    const unsubscribe = store.subscribe(() => {
      const project = store.getState().project
      if (started || project === seen) return
      seen = project
      if (designSignature(project.design) === first) return
      started = true
      keeping.current = keepNewProject(project).then(({ home: next, href, notice }) => {
        keeping.current = null
        if (!live) return
        if (href) settle(href)
        if (notice) setStorageNotice(notice)
        setHome(next)
      })
    })
    return () => { live = false; unsubscribe() }
  }, [home.kind, store])

  // This browser: save under the project's own key, then list it with its name and a fresh picture.
  const localFlush = useRef<(() => void) | null>(null)
  const localId = home.kind === 'local' ? home.id : null
  useEffect(() => {
    if (!localId) return
    let pictured = 0
    const afterSave = (project: StudioProject) => {
      const now = Date.now()
      const picture = now - pictured > 10_000 ? stagePicture() : undefined
      if (picture) pictured = now
      touchHackableEntry(localId, project.design.name, undefined, picture)
    }
    const watch = watchAndSave(store, { key: projectKey(localId), afterSave })
    // Changes made while a new project was being kept are saved now.
    if (savedFirst && store.getState().project !== savedFirst && saveProject(store.getState().project, undefined, projectKey(localId))) afterSave(store.getState().project)
    localFlush.current = watch.flush
    return () => { localFlush.current = null; watch() }
    // savedFirst only matters when this project starts saving here, so it is not a dependency.
  }, [localId, store])

  // The account: save each changed project a moment later, and at once when the tab is put away; warn before leaving
  // with a save still going.
  useEffect(() => {
    if (!saver) return
    let last = savedFirst ?? store.getState().project
    if (store.getState().project !== last) { last = store.getState().project; saver.schedule(last) }
    const unsubscribe = store.subscribe(() => {
      const project = store.getState().project
      if (project !== last) { last = project; saver.schedule(project) }
    })
    const beforeUnload = (e: BeforeUnloadEvent) => { if (saver.dirty) { void saver.flush(); e.preventDefault() } }
    const hidden = () => { if (document.visibilityState === 'hidden' && saver.dirty) void saver.flush() }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', hidden)
    return () => { unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', hidden); void saver.flush() }
    // savedFirst only matters when this project starts saving here, so it is not a dependency.
  }, [saver, store])

  // The logo and My projects: save first (StudioShell waits for this before it leaves).
  const saveBeforeLeaving = useCallback(async () => {
    await keeping.current
    localFlush.current?.()
    if (saver) await saver.flush()
  }, [saver])

  const name = useSyncExternalStore(store.subscribe, () => store.getState().project.design.name)
  useEffect(() => { document.title = `${name} · Hackable Platformer · Brickgineers` }, [name])

  const saveStatus: HeaderSaveStatus = saver
    ? { source: { kind: 'cloud', status: saver.status }, detail: saver.status === 'error' ? saver.error : saver.status === 'saved' ? 'Your latest changes are saved to your account.' : 'Saving your latest changes to your account.' }
    : home.kind === 'viewer'
      ? { source: { kind: 'local', error: 'Not saved' }, detail: 'This project belongs to someone else, so changes here are not saved. Make your own copy to keep them.' }
      : home.kind === 'unsaved'
        ? { source: { kind: 'local', error: 'Not saved' }, detail: 'This project is not saved. Press This project, then Save File, so you do not lose it.' }
        : home.kind === 'new' && browserClassroomClient.getSession()
          ? { source: { kind: 'cloud', status: 'saved' }, detail: 'Your project is saved to your account as soon as you change something.' }
          : { source: { kind: 'local' } }

  return (
    <div className="studio-screen">
      <StudioShell
        store={store}
        saveStatus={saveStatus}
        onRenameProject={home.kind === 'viewer' ? undefined : async (title) => store.renameProject(title)}
        onLeave={saveBeforeLeaving}
        banner={home.kind === 'viewer' ? <ViewerBanner world={home.world} store={store} /> : undefined}
      />
    </div>
  )
}

/**
 * "Make my own copy": the project as it is on screen, with everything the kid tried, as a new project of theirs (the
 * server's copy would take the owner's saved version and drop those tries). It carries its new name inside it, so the
 * first save does not rename it back. With the account full, the copy is kept in this browser instead.
 */
export async function makeOwnCopy(world: Pick<ClassroomWorld, 'title'>, project: StudioProject, client: ClassroomClientSurface = browserClassroomClient): Promise<string> {
  const title = `${world.title} (copy)`.slice(0, 80)
  const copy: StudioProject = { ...project, design: { ...project.design, name: title } }
  try {
    const mine = await createHackableWorld(copy, client, title)
    return hackableHref.world(mine.id)
  } catch (error) {
    if ((error as { code?: string })?.code !== 'world_limit') throw error
    const id = newHackableId()
    if (!saveHackableProject(id, copy).ok) throw new Error('Your account is full, and this browser could not keep the copy either. Remove a project in My projects, then try again.')
    return hackableHref.local(id)
  }
}

/** Someone else's project: look and try things, then make your own copy to keep changes. */
function ViewerBanner({ world, store }: { world: ClassroomWorld; store: StudioStore }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const copy = async () => {
    setBusy(true)
    try {
      window.location.assign(await makeOwnCopy(world, store.getState().project))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The copy could not be made.')
      setBusy(false)
    }
  }
  return (
    <div className="studio-viewer-banner" role="status">
      <span>{error || `This is ${world.ownerName}’s project. Try anything; changes here aren’t saved.`}</span>
      <Button variant="primary" size="sm" loading={busy} loadingLabel="Copying…" onClick={() => void copy()}>Make my own copy</Button>
    </div>
  )
}
