import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { browserClassroomClient, type ClassroomClientSurface } from '../../../classroom/client'
import type { ClassroomWorld } from '../../../classroom/contracts'
import { Button } from '../../../ui'
import type { HeaderSaveStatus } from '../../../shell/AppHeader'
import { StudioShell } from './screen/StudioShell'
import { loadProject, watchAndSave } from './storage'
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

/** Where the open project lives: this browser, the account, or someone else's (look only, nothing is saved). */
type Opened =
  | { kind: 'local'; id: string; project: StudioProject }
  | { kind: 'account'; world: ClassroomWorld; project: StudioProject }
  | { kind: 'viewer'; world: ClassroomWorld; project: StudioProject }

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
  const signedIn = !!browserClassroomClient.getSession()
  if (route.world) {
    try {
      const { world, project } = await loadHackableWorld(route.world)
      return world.canEdit ? { kind: 'account', world, project } : { kind: 'viewer', world, project }
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
    const project = newProject()
    if (signedIn) {
      try {
        const world = await createHackableWorld(project)
        settle(hackableHref.world(world.id))
        return { kind: 'account', world, project }
      } catch (error) {
        const code = (error as { code?: string })?.code
        if (code === 'world_limit') return { kind: 'problem', title: 'Your account is full', body: 'Remove a project you no longer need in My projects, then try again.' }
        // Offline or the account is unreachable: start it in this browser instead; it can move to the account later.
      }
    }
    const id = newHackableId()
    const saved = saveHackableProject(id, project)
    if (!saved.ok) {
      return saved.reason === 'full'
        ? { kind: 'problem', title: 'This computer is full of projects', body: `This browser keeps ${MAX_HACKABLE_PROJECTS} Hackable Platformers. Remove one in My projects, or sign in to keep more in your account.` }
        : { kind: 'problem', title: 'This browser won’t save projects', body: 'It may be out of space, or saving is turned off. Sign in to keep projects in your account.' }
    }
    settle(hackableHref.local(id))
    return { kind: 'local', id, project }
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
  // The saver's status shows in the header: each change of it re-renders.
  const [, setTick] = useState(0)
  const saver = useMemo(() => (opened.kind === 'account' ? new HackableCloudSaver(opened.world, () => setTick((n) => n + 1)) : null), [opened])

  // This browser: save under the project's own key, then list it with its name and a fresh picture.
  const localFlush = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (opened.kind !== 'local') return
    let pictured = 0
    const watch = watchAndSave(store, {
      key: projectKey(opened.id),
      afterSave: (project) => {
        const now = Date.now()
        const picture = now - pictured > 10_000 ? stagePicture() : undefined
        if (picture) pictured = now
        touchHackableEntry(opened.id, project.design.name, undefined, picture)
      },
    })
    localFlush.current = watch.flush
    return () => { localFlush.current = null; watch() }
  }, [opened, store])

  // The account: save each changed project a moment later, and at once when the tab is put away; warn before leaving
  // with a save still going.
  useEffect(() => {
    if (!saver) return
    let last = store.getState().project
    const unsubscribe = store.subscribe(() => {
      const project = store.getState().project
      if (project !== last) { last = project; saver.schedule(project) }
    })
    const beforeUnload = (e: BeforeUnloadEvent) => { if (saver.dirty) { void saver.flush(); e.preventDefault() } }
    const hidden = () => { if (document.visibilityState === 'hidden' && saver.dirty) void saver.flush() }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', hidden)
    return () => { unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', hidden); void saver.flush() }
  }, [saver, store])

  // The logo and My projects: save first (StudioShell waits for this before it leaves).
  const saveBeforeLeaving = useCallback(async () => {
    localFlush.current?.()
    if (saver) await saver.flush()
  }, [saver])

  const name = useSyncExternalStore(store.subscribe, () => store.getState().project.design.name)
  useEffect(() => { document.title = `${name} · Hackable Platformer · Brickgineers` }, [name])

  const saveStatus: HeaderSaveStatus = saver
    ? { source: { kind: 'cloud', status: saver.status }, detail: saver.status === 'error' ? saver.error : saver.status === 'saved' ? 'Your latest changes are saved to your account.' : 'Saving your latest changes to your account.' }
    : opened.kind === 'viewer'
      ? { source: { kind: 'local', error: 'Not saved' }, detail: 'This project belongs to someone else, so changes here are not saved. Make your own copy to keep them.' }
      : { source: { kind: 'local' } }

  return (
    <div className="studio-screen">
      <StudioShell
        store={store}
        saveStatus={saveStatus}
        onRenameProject={opened.kind === 'viewer' ? undefined : async (title) => store.renameProject(title)}
        onLeave={saveBeforeLeaving}
        banner={opened.kind === 'viewer' ? <ViewerBanner world={opened.world} store={store} /> : undefined}
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
