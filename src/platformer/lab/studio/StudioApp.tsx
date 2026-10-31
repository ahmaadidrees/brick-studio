import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { browserClassroomClient, type ClassroomClientSurface } from '../../../classroom/client'
import type { ClassroomWorld } from '../../../classroom/contracts'
import { Button } from '../../../ui'
import type { HeaderSaveStatus } from '../../../shell/AppHeader'
import { StudioShell } from './screen/StudioShell'
import { loadProject, watchAndSave } from './storage'
import { clearStorageNotice, getStorageNotice, setStorageNotice, type StorageNotice } from './persist/notice'
import { StudioStore, type StudioProject } from './store'
import { createStarterProject } from './starter'
import { HackableCloudSaver, NotHackableError, RETRY_DELAYS_MS, createHackableWorld, loadHackableWorld, mayWorkLater, newWorldId } from './persist/hackableCloud'
import {
  MAX_HACKABLE_PROJECTS,
  NEW_PROJECT_NAME,
  compactHackableSaves,
  deleteHackableProject,
  hackableHref,
  listHackableProjects,
  loadHackableText,
  newHackableId,
  pendingWorldOf,
  projectKey,
  roomFor,
  setPendingWorld,
  touchHackableEntry,
  type HackableSaveResult,
  type PendingWorld,
} from './persist/hackableProjects'
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
  | { kind: 'local'; id: string; project: StudioProject; pending?: PendingWorld }
  | { kind: 'account'; world: ClassroomWorld; project: StudioProject }
  | { kind: 'viewer'; world: ClassroomWorld; project: StudioProject }
  | { kind: 'new'; project: StudioProject }

/** Where the project on screen is saved now (a new project moves from 'new' to 'local' or 'account'). */
type Home =
  /** `pending`: kept here because the account did not answer; it moves to the account world `pending.id` once it does. */
  | { kind: 'local'; id: string; saved: StudioProject; pending?: PendingWorld }
  /**
   * `saved` null: what the account holds is not known, so the project on screen is saved at once. `backup`: the copy
   * kept on this computer while the account did not answer, removed once the account has the project.
   */
  | { kind: 'account'; world: ClassroomWorld; saved: StudioProject | null; backup?: string }
  | { kind: 'viewer'; world: ClassroomWorld }
  | { kind: 'new' }
  /** A new project neither the account nor this browser would keep: the kid is told to save a file. */
  | { kind: 'unsaved' }

const homeOf = (opened: Opened): Home =>
  opened.kind === 'local' ? { kind: 'local', id: opened.id, saved: opened.project, ...(opened.pending ? { pending: opened.pending } : {}) }
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
  // Waiting to become an account world: moved there once its own account is signed in here (OpenProject).
  const pending = pendingWorldOf(id)
  const mine = pending && session?.user.id === pending.owner ? pending : undefined
  return { kind: 'local', id, project: loadProject(undefined, projectKey(id)), ...(mine ? { pending: mine } : {}) }
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

/**
 * Why this browser cannot keep one more project (a problem card), or null when it can. Room is checked for a whole
 * project, not one character, so a guest learns before building, not at the first save.
 */
function browserCannotKeep(): Extract<Opening, { kind: 'problem' }> | null {
  const room = roomFor()
  if (room === 'blocked') return { kind: 'problem', title: 'This browser won’t save projects', body: 'Saving is turned off in this browser. Sign in to keep projects in your account.' }
  if (room === 'full') return { kind: 'problem', title: 'There’s no more room for projects on this computer', body: 'Remove projects you no longer need in My projects (save them as files first if you want to keep them), or sign in to keep projects in your account.' }
  if (listHackableProjects().length >= MAX_HACKABLE_PROJECTS) {
    return { kind: 'problem', title: 'This computer is full of projects', body: `This browser keeps ${MAX_HACKABLE_PROJECTS} Hackable Platformers. Remove one in My projects, or sign in to keep more in your account.` }
  }
  return null
}

/** Why this computer did not keep a project, in the kid's words, with what to do so it is not lost. */
export function notKeptMessage(reason: Exclude<HackableSaveResult, { ok: true }>['reason'], accountFull = false): string {
  const saveFile = 'Press This project, then Save File, so you do not lose it.'
  if (reason === 'full') return `${accountFull ? 'Your account is full, and this' : 'This'} computer already keeps ${MAX_HACKABLE_PROJECTS} Hackable Platformers, so this project is not saved. ${saveFile}`
  if (reason === 'space') return `${accountFull ? 'Your account is full, and there' : 'There'} is no more room for projects on this computer, so this project is not saved. ${saveFile} Then remove old projects in My projects to make room.`
  return `This browser won’t save projects, so this project is not saved. ${saveFile}`
}

/**
 * Keep a new project, at the kid's first change: in the account when signed in, otherwise (or when the account is full
 * or out of reach) in this browser. The account world's id is chosen here, so trying again (the answer was lost, or
 * the kid left while it was saving) never makes a second copy: a project kept here because the account did not answer
 * remembers that id (`pending`) and moves to the account under it later. Exported for tests.
 */
export async function keepNewProject(project: StudioProject, client: ClassroomClientSurface = browserClassroomClient): Promise<{ home: Home; href?: string; notice?: StorageNotice }> {
  let accountFull = false
  let pending: PendingWorld | undefined
  let refused = ''
  const session = client.getSession()
  if (session) {
    const worldId = newWorldId()
    try {
      const world = await createHackableWorld(project, client, undefined, worldId)
      return { home: { kind: 'account', world, saved: project }, href: hackableHref.world(world.id) }
    } catch (error) {
      accountFull = (error as { code?: string })?.code === 'world_limit'
      // Offline or out of reach: kept here, and moved to the account under the same id once it answers.
      if (!accountFull && mayWorkLater(error)) pending = { id: worldId, owner: session.user.id }
      else if (!accountFull) refused = error instanceof Error ? error.message : ''
    }
  }
  const id = newHackableId()
  const kept = saveHackableProject(id, project, undefined, undefined, pending)
  if (!kept.ok) {
    return {
      home: { kind: 'unsaved' },
      notice: { id: 'new-not-kept', type: 'error', sticky: false, message: notKeptMessage(kept.reason, accountFull) },
    }
  }
  const notice: StorageNotice | undefined = accountFull
    ? { id: 'account-full', type: 'info', sticky: true, message: 'Your account is full, so this project is saved on this computer. Remove a project you no longer need in My projects, then move this one to your account from there.', actions: [{ label: 'OK', run: clearStorageNotice }] }
    : refused
      ? { id: 'account-refused', type: 'error', message: `This project is saved on this computer, not in your account. ${refused}` }
      : undefined
  return {
    home: { kind: 'local', id, saved: project, ...(pending ? { pending } : {}) },
    href: hackableHref.local(id),
    ...(notice ? { notice } : {}),
  }
}

/** This tab's project, kept as a new project of its own on this computer (another tab saved over it). */
function keepLocalCopy(project: StudioProject): { id: string; copy: StudioProject } | { reason: Exclude<HackableSaveResult, { ok: true }>['reason'] } {
  const title = `${project.design.name} (copy)`.slice(0, 80)
  const copy: StudioProject = { ...project, design: { ...project.design, name: title } }
  const id = newHackableId()
  const kept = saveHackableProject(id, copy)
  return kept.ok ? { id, copy } : { reason: kept.reason }
}

/** Older saves are made smaller once per visit (persist/hackableProjects.ts compactHackableSaves), after opening. */
let compacted = false

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
  /** Set below: what to do when the account refuses a save because the project was saved somewhere else since. */
  const accountConflict = useRef<(project: StudioProject) => void>(() => {})
  const saver = useMemo(
    () => (accountWorld ? new HackableCloudSaver(accountWorld, () => setTick((n) => n + 1), browserClassroomClient, (p) => accountConflict.current(p)) : null),
    [accountWorld],
  )
  useEffect(() => () => saver?.stop(), [saver])
  const savedFirst = home.kind === 'local' || home.kind === 'account' ? home.saved : null
  /** A new project being kept right now (leaving waits for it). */
  const keeping = useRef<Promise<void> | null>(null)

  // Older, bigger saves on this computer are made smaller once per visit, so a guest's browser holds more projects.
  useEffect(() => {
    if (compacted) return
    compacted = true
    const t = setTimeout(() => compactHackableSaves(), 1500)
    return () => clearTimeout(t)
  }, [])

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
    // Leaving while the first save is still on its way would lose it: the browser asks first.
    const beforeUnload = (e: BeforeUnloadEvent) => { if (keeping.current) e.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { live = false; unsubscribe(); window.removeEventListener('beforeunload', beforeUnload) }
  }, [home.kind, store])

  // This browser: save under the project's own key, then list it with its name and a fresh picture. Another tab may
  // save the same project: this tab never writes over that (storage.ts watchAndSave compares with what is kept), and
  // keeps its own changes as a copy instead, so both are kept.
  const localFlush = useRef<((force?: boolean) => void) | null>(null)
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
    const onConflict = (project: StudioProject, theirs: string | null) => {
      const kept = keepLocalCopy(project)
      const elsewhere = theirs === null ? 'This project was removed in another tab' : 'This project was also changed in another tab'
      if ('reason' in kept) {
        // Nothing more is written here; the kid keeps this tab's work with a file.
        setHome({ kind: 'unsaved' })
        setStorageNotice({ id: 'tab-conflict', type: 'error', sticky: false, message: `${elsewhere}, and your changes here could not be kept as a copy. ${notKeptMessage(kept.reason)}` })
        return
      }
      store.renameProject(kept.copy.design.name)
      settle(hackableHref.local(kept.id))
      setHome({ kind: 'local', id: kept.id, saved: store.getState().project })
      setStorageNotice({
        id: 'tab-copy', type: 'info', sticky: true,
        message: `${elsewhere}. To keep both, your changes here are now a new project: “${kept.copy.design.name}”.`,
        actions: [{ label: 'OK', run: clearStorageNotice }],
      })
    }
    const onChangedElsewhere = (theirs: string | null) => {
      // No changes here yet, so the newer one can be shown (a change made here first is kept as a copy).
      setStorageNotice(theirs === null
        ? { id: 'tab-removed', type: 'info', sticky: true, message: 'This project was removed in another tab. If you change something here, it is kept as a new project.', actions: [{ label: 'OK', run: clearStorageNotice }] }
        : { id: 'tab-newer', type: 'info', sticky: true, message: 'This project was changed in another tab.', actions: [{ label: 'Show the newer one', run: () => window.location.reload() }, { label: 'OK', run: clearStorageNotice }] })
    }
    const watch = watchAndSave(store, { key: projectKey(localId), afterSave, onConflict, onChangedElsewhere })
    // Changes made while a new project was being kept are saved now.
    if (savedFirst && store.getState().project !== savedFirst) watch.flush(true)
    localFlush.current = watch.flush
    return () => { localFlush.current = null; watch() }
    // savedFirst only matters when this project starts saving here, so it is not a dependency.
  }, [localId, store])

  // Kept here because the account did not answer at the first save: move it to the account (under the id chosen
  // then, so it is never made twice), trying again a little later each time; "Try again" tries now.
  const pending = home.kind === 'local' ? home.pending : undefined
  useEffect(() => {
    if (!localId || !pending) return
    let live = true
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tell = (message: string) => setStorageNotice({ id: 'account-pending', type: 'info', sticky: true, message, actions: [{ label: 'Try again', run: () => void attempt() }] })
    const attempt = async () => {
      clearTimeout(timer)
      if (!live) return
      if (browserClassroomClient.getSession()?.user.id !== pending.owner) {
        tell('This project is saved on this computer. Sign in to your account again to put it there too.')
        failures += 1
        timer = setTimeout(() => void attempt(), RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1])
        return
      }
      localFlush.current?.()
      try {
        const world = await createHackableWorld(store.getState().project, browserClassroomClient, undefined, pending.id)
        if (!live) return
        if (getStorageNotice()?.id === 'account-pending') clearStorageNotice()
        settle(hackableHref.world(world.id))
        // The account may hold the first version (made before its answer was lost): save what is on screen at once.
        setHome({ kind: 'account', world, saved: null, backup: localId })
      } catch (error) {
        if (!live) return
        if ((error as { code?: string })?.code === 'world_limit' || !mayWorkLater(error)) {
          setPendingWorld(localId, undefined)
          setHome((h) => (h.kind === 'local' && h.id === localId ? { kind: 'local', id: h.id, saved: h.saved } : h))
          setStorageNotice((error as { code?: string })?.code === 'world_limit'
            ? { id: 'account-full', type: 'info', sticky: true, message: 'Your account is full, so this project is saved on this computer. Remove a project you no longer need in My projects, then move this one to your account from there.', actions: [{ label: 'OK', run: clearStorageNotice }] }
            : { id: 'account-refused', type: 'error', message: `This project is saved on this computer, not in your account. ${error instanceof Error ? error.message : ''}` })
          return
        }
        failures += 1
        tell('We couldn’t reach your account, so this project is saved on this computer for now. We keep trying to put it in your account.')
        timer = setTimeout(() => void attempt(), RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1])
      }
    }
    tell('We couldn’t reach your account, so this project is saved on this computer for now. We keep trying to put it in your account.')
    timer = setTimeout(() => void attempt(), opened.kind === 'local' ? 0 : RETRY_DELAYS_MS[0])
    return () => { live = false; clearTimeout(timer) }
    // opened only says whether this page opened the project already waiting (try at once).
  }, [localId, pending, store])

  // The account refused a save because the project was saved somewhere else since (another tab): never save over it;
  // keep this tab's project as a copy (in the account, or this browser when the account is full), and go on there.
  const [copyFailed, setCopyFailed] = useState(false)
  accountConflict.current = (project: StudioProject) => {
    const title = `${project.design.name} (copy)`.slice(0, 80)
    const copy: StudioProject = { ...project, design: { ...project.design, name: title } }
    const tell = (where: string) => setStorageNotice({
      id: 'account-copy', type: 'info', sticky: true,
      message: `A newer version of this project was saved somewhere else. To keep both, your changes here are now a new project${where}: “${title}”.`,
      actions: [{ label: 'OK', run: clearStorageNotice }],
    })
    setCopyFailed(false)
    void createHackableWorld(copy, browserClassroomClient, title, newWorldId()).then((world) => {
      store.renameProject(title)
      settle(hackableHref.world(world.id))
      setHome({ kind: 'account', world, saved: store.getState().project })
      tell('')
    }, (error) => {
      if ((error as { code?: string })?.code === 'world_limit') {
        const kept = keepLocalCopy(project)
        if (!('reason' in kept)) {
          store.renameProject(kept.copy.design.name)
          settle(hackableHref.local(kept.id))
          setHome({ kind: 'local', id: kept.id, saved: store.getState().project })
          tell(' on this computer (your account is full)')
          return
        }
      }
      setCopyFailed(true)
      setStorageNotice({
        id: 'account-conflict', type: 'error', sticky: true,
        message: 'A newer version of this project was saved somewhere else, and your changes here could not be kept as a copy yet. Try again, or press This project, then Save File.',
        actions: [{ label: 'Try again', run: () => accountConflict.current(project) }],
      })
    })
  }

  // The account: save each changed project a moment later, and at once when the tab is put away; warn before leaving
  // with a save still going (or one that failed and is waiting to be tried again).
  useEffect(() => {
    if (!saver) return
    let last = savedFirst ?? store.getState().project
    if (!savedFirst || store.getState().project !== last) { last = store.getState().project; saver.schedule(last) }
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

  // A failed account save: a banner says why, with "Try again" (the saver also keeps trying on its own). Shown once
  // per run of failures (or when the reason changes), so a dismissed banner does not come back at every retry.
  const shownError = useRef('')
  const saverError = saver && saver.status === 'error' && !saver.conflicted ? saver.error : ''
  useEffect(() => {
    if (!saver) return
    if (saverError) {
      if (shownError.current === saverError) return
      shownError.current = saverError
      setStorageNotice({ id: 'account-save', type: 'error', message: saverError, actions: [{ label: 'Try again', run: () => void saver.retry() }] })
    } else if (saver.failures === 0 && shownError.current) {
      shownError.current = ''
      if (getStorageNotice()?.id === 'account-save') clearStorageNotice()
    }
  })

  // Moved to the account from this computer: the copy kept here is removed once the account has the project.
  const backup = home.kind === 'account' ? home.backup : undefined
  useEffect(() => {
    if (!saver || !backup || saver.saves === 0 || saver.dirty) return
    deleteHackableProject(backup)
    setHome((h) => (h.kind === 'account' && h.backup === backup ? { kind: 'account', world: h.world, saved: h.saved } : h))
  })

  // The logo and My projects: save first (StudioShell waits for this before it leaves).
  const saveBeforeLeaving = useCallback(async () => {
    await keeping.current
    localFlush.current?.()
    if (saver) await saver.flush()
  }, [saver])

  const name = useSyncExternalStore(store.subscribe, () => store.getState().project.design.name)
  useEffect(() => { document.title = `${name} · Hackable Platformer · Brickgineers` }, [name])

  const signedIn = !!browserClassroomClient.getSession()
  const saveStatus: HeaderSaveStatus = saver
    ? saver.conflicted
      ? { source: { kind: 'cloud', status: copyFailed ? 'error' : 'saving' }, detail: copyFailed ? 'Your changes here are not saved yet. Press This project, then Save File, so you do not lose them.' : 'Keeping your changes here as a copy.' }
      : { source: { kind: 'cloud', status: saver.status }, detail: saver.status === 'error' ? saver.error : saver.status === 'saved' ? 'Your latest changes are saved to your account.' : 'Saving your latest changes to your account.' }
    : home.kind === 'viewer'
      ? { source: { kind: 'local', error: 'Not saved' }, detail: 'This project belongs to someone else, so changes here are not saved. Make your own copy to keep them.' }
      : home.kind === 'unsaved'
        ? { source: { kind: 'local', error: 'Not saved' }, detail: 'This project is not saved. Press This project, then Save File, so you do not lose it.' }
        : home.kind === 'local' && home.pending
          ? { source: { kind: 'cloud', status: 'pending' }, detail: 'Saved on this computer for now. We keep trying to put it in your account.' }
          : home.kind === 'new' && signedIn
            // Nothing is in the account until its first save works: never "Saved" before the account says so.
            ? { source: { kind: 'cloud', status: 'pending' }, detail: 'Your project is saved to your account as soon as you change something.' }
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
