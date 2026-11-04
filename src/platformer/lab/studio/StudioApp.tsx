import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { browserClassroomClient, type ClassroomClientSurface } from '../../../classroom/client'
import type { ClassroomWorld } from '../../../classroom/contracts'
import { Users } from 'lucide-react'
import { Button, MenuItem } from '../../../ui'
import { clientKey, savedGuestName } from '../../ui/prefs'
import { designText } from '../core/save'
import { RoomBar } from '../rooms/RoomBar'
import { RoomSession } from '../rooms/session'
import { StudioRoomLink } from '../rooms/studioRoom'
import { classRoomSocketUrl, createGuestRoom, guestRoomSocketUrl, rememberOwnerToken, roomHref } from '../rooms/endpoints'
import type { HeaderSaveStatus } from '../../../shell/AppHeader'
import { StudioShell } from './screen/StudioShell'
import { loadProject, watchAndSave } from './storage'
import { clearStorageNotice, getStorageNotice, setStorageNotice, type StorageNotice } from './persist/notice'
import { StudioStore, type StudioProject } from './store'
import { KIT_SCREENS, type ScreensKit } from './kitScreens'
import { designKit } from '../core/contracts'
import { HackableCloudSaver, NotHackableError, RETRY_DELAYS_MS, createHackableWorld, loadHackableWorld, mayWorkLater, newWorldId } from './persist/hackableCloud'
import {
  MAX_HACKABLE_PROJECTS,
  compactHackableSaves,
  deleteHackableProject,
  entryKit,
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
import { kitNotReady, kitOf } from '../kits'
import './studio.css'

export interface StudioRoute {
  world?: string
  draft?: string
  fresh: boolean
  /** The address's game (/2d/hackable-race): what a new project is, and which newest one opens. Absent: the Platformer. */
  kit?: 'race' | 'blank'
  /** Open the project's room at once (the owner, after inviting classmates to play). */
  together?: boolean
}

const routeKit = (route: Pick<StudioRoute, 'kit'>): ScreensKit => route.kit ?? 'platformer'

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

/** A new project of the address's game: the Platformer's starter level, or Hackable Racing's beginner track. */
const newProject = (kit: ScreensKit): StudioProject => {
  const screens = KIT_SCREENS[kit]
  const project = screens.starter()
  return { ...project, design: { ...project.design, name: screens.copy.projectName } }
}

/** A project's own game, for its address. */
const kitIn = (project: StudioProject) => designKit(project.design)

/** Replace the address without a reload, so a refresh opens this same project. */
const settle = (href: string) => window.history.replaceState(window.history.state, '', href)

/** Exported for tests: what a /2d/hackable (or /2d/hackable-race) address opens. */
export async function openStudioRoute(route: StudioRoute): Promise<Opening> {
  return open(route)
}

/** What a route opens, as its own kit: a project of a kit this version cannot run yet is a problem card, not a Platformer. */
async function open(route: StudioRoute): Promise<Opening> {
  const opening = await openWhere(route)
  if (!('project' in opening)) return opening
  const notReady = kitNotReady(opening.project.design)
  if (notReady) return { kind: 'problem', title: `This is ${kitOf(opening.project.design).name}`, body: notReady }
  fixAddress(opening)
  return opening
}

/**
 * A project opened at another game's address (an older link, or an invite that does not say the game) opens as itself;
 * the address is put right, so a refresh or a copied link names its game.
 */
function fixAddress(opened: Opened) {
  if (opened.kind === 'new') return
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path !== '/2d/hackable' && path !== '/2d/hackable-race' && path !== '/2d/hackable-blank') return
  const href = opened.kind === 'local' ? hackableHref.local(opened.id, kitIn(opened.project)) : hackableHref.world(opened.world.id, kitIn(opened.project))
  if (new URL(href, window.location.origin).pathname !== path) settle(href)
}

async function openWhere(route: StudioRoute): Promise<Opening> {
  const session = browserClassroomClient.getSession()
  const signedIn = !!session
  if (route.world) {
    try {
      const { world, project } = await loadHackableWorld(route.world)
      // Only the owner saves into it. A Hackable project's room is for playing (docs/qa/hackable-rooms), not building
      // together, so a classmate (or a teacher) who may build in it would save over the owner's project; they look,
      // play in the room, and make their own copy to keep changes.
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
    return { kind: 'new', project: newProject(routeKit(route)) }
  }
  // The newest project of this address's game (an entry made before kits is a Platformer).
  const id = route.draft ?? listHackableProjects().find((e) => entryKit(e) === routeKit(route))?.id
  if (!id) return openWhere({ fresh: true, ...(route.kit ? { kit: route.kit } : {}) })
  // The save itself decides, not the list: a project whose list entry was lost still opens (and is listed again).
  if (route.draft && loadHackableText(id) === null) {
    return { kind: 'problem', title: 'That project isn’t on this computer', body: 'It may have been removed, or saved in a different browser. Your other projects are in My projects.' }
  }
  if (!route.draft) settle(hackableHref.local(id, routeKit(route)))
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
    return { kind: 'problem', title: 'This computer is full of projects', body: `This browser keeps ${MAX_HACKABLE_PROJECTS} Hackable projects. Remove one in My projects, or sign in to keep more in your account.` }
  }
  return null
}

/** Why this computer did not keep a project, in the kid's words, with what to do so it is not lost. */
export function notKeptMessage(reason: Exclude<HackableSaveResult, { ok: true }>['reason'], accountFull = false): string {
  const saveFile = 'Press This project, then Save File, so you do not lose it.'
  if (reason === 'full') return `${accountFull ? 'Your account is full, and this' : 'This'} computer already keeps ${MAX_HACKABLE_PROJECTS} Hackable projects, so this project is not saved. ${saveFile}`
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
      return { home: { kind: 'account', world, saved: project }, href: hackableHref.world(world.id, kitIn(project)) }
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
    href: hackableHref.local(id, kitIn(project)),
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
 * /2d/hackable and /2d/hackable-race: the Hackable Platformer (Code Lab on the new core) and Hackable Racing, one studio
 * that reads the game from the project. One shell with Build · Code · Play
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
  return <OpenProject opened={opening} together={!!route.together} />
}

function OpenProject({ opened, together }: { opened: Opened; together: boolean }) {
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
  // What the chip says for this browser: "Saving…" from a change until it is written, then "Saved on this computer".
  const [localSave, setLocalSave] = useState<LocalSave>('saved')
  useEffect(() => {
    if (!localId) return
    setLocalSave('saved')
    let pictured = 0
    const afterSave = (project: StudioProject) => {
      setLocalSave('saved')
      const now = Date.now()
      const picture = now - pictured > 10_000 ? stagePicture() : undefined
      if (picture) pictured = now
      touchHackableEntry(localId, project.design.name, undefined, picture, kitIn(project))
    }
    let shown = store.getState().project
    const unsubscribeChip = store.subscribe(() => {
      const project = store.getState().project
      if (project !== shown) { shown = project; setLocalSave('saving') }
    })
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
      settle(hackableHref.local(kept.id, kitIn(kept.copy)))
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
    const watch = watchAndSave(store, { key: projectKey(localId), afterSave, onSaveFailed: () => setLocalSave('error'), onConflict, onChangedElsewhere })
    // Changes made while a new project was being kept are saved now.
    if (savedFirst && store.getState().project !== savedFirst) watch.flush(true)
    localFlush.current = watch.flush
    return () => { localFlush.current = null; unsubscribeChip(); watch() }
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
    let busy = false
    const attempt = async () => {
      clearTimeout(timer)
      // "Try again" while a try is still on its way waits for that one.
      if (!live || busy) return
      if (browserClassroomClient.getSession()?.user.id !== pending.owner) {
        tell('This project is saved on this computer. Sign in to your account again to put it there too.')
        failures += 1
        timer = setTimeout(() => void attempt(), RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1])
        return
      }
      localFlush.current?.()
      busy = true
      try {
        const world = await createHackableWorld(store.getState().project, browserClassroomClient, undefined, pending.id)
        busy = false
        if (!live) return
        if (getStorageNotice()?.id === 'account-pending') clearStorageNotice()
        settle(hackableHref.world(world.id, kitIn(store.getState().project)))
        // The account may hold the first version (made before its answer was lost): save what is on screen at once.
        setHome({ kind: 'account', world, saved: null, backup: localId })
      } catch (error) {
        busy = false
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
      settle(hackableHref.world(world.id, kitIn(copy)))
      setHome({ kind: 'account', world, saved: store.getState().project })
      tell('')
    }, (error) => {
      if ((error as { code?: string })?.code === 'world_limit') {
        const kept = keepLocalCopy(project)
        if (!('reason' in kept)) {
          store.renameProject(kept.copy.design.name)
          settle(hackableHref.local(kept.id, kitIn(kept.copy)))
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
  const kitName = useSyncExternalStore(store.subscribe, () => kitOf(store.getState().project.design).name)
  useEffect(() => { document.title = `${name} · ${kitName} · Brickgineers` }, [name, kitName])

  const signedIn = !!browserClassroomClient.getSession()
  const saveStatus: HeaderSaveStatus = saver
    ? saver.conflicted
      ? copyFailed
        ? { source: { kind: 'cloud', status: 'error' }, detail: 'Your changes here are not saved yet. Press This project, then Save File, so you do not lose them.', explain: SAVE_WORDS.conflictFailed }
        : { source: { kind: 'cloud', status: 'saving' }, detail: 'Keeping your changes here as a copy.', explain: SAVE_WORDS.conflict }
      : saver.status === 'error'
        ? { source: { kind: 'cloud', status: 'error' }, detail: saver.error, explain: `${saver.error} ${SAVE_WORDS.accountRetry}` }
        : saver.status === 'saved'
          ? { source: { kind: 'cloud', status: 'saved' }, detail: 'Your latest changes are saved to your account.', explain: SAVE_WORDS.account }
          : { source: { kind: 'cloud', status: saver.status }, detail: 'Saving your latest changes to your account.', explain: SAVE_WORDS.accountSaving }
    : home.kind === 'viewer'
      ? { source: { kind: 'local', error: 'Not saved' }, detail: 'This project belongs to someone else, so changes here are not saved. Make your own copy to keep them.', explain: SAVE_WORDS.viewer }
      : home.kind === 'unsaved'
        ? { source: { kind: 'local', error: 'Not saved' }, detail: 'This project is not saved. Press This project, then Save File, so you do not lose it.', explain: SAVE_WORDS.notSaved }
        : home.kind === 'local' && home.pending
          ? { source: { kind: 'cloud', status: 'pending' }, detail: 'Saved on this computer for now. We keep trying to put it in your account.', explain: SAVE_WORDS.waitingForAccount }
          : home.kind === 'new' && signedIn
            // Nothing is in the account until its first save works: never "Saved" before the account says so.
            ? { source: { kind: 'cloud', status: 'pending' }, detail: 'Your project is saved to your account as soon as you change something.', explain: SAVE_WORDS.newAccount }
            : home.kind === 'local'
              ? localSave === 'error'
                ? { source: { kind: 'local', error: 'Not saved' }, detail: 'Your latest change could not be saved on this computer.', explain: SAVE_WORDS.localFailed }
                : { source: { kind: 'local', state: localSave }, explain: SAVE_WORDS.local }
              : { source: { kind: 'local' }, explain: SAVE_WORDS.newLocal }

  // Play together (docs/qa/hackable-rooms M1): an account project opens its class room, anything else a room by link.
  // Someone else's project joins the owner's room instead.
  const [room, setRoom] = useState<OpenRoom | null>(null)
  const roomRef = useRef(room)
  roomRef.current = room
  useEffect(() => () => roomRef.current?.stop(), [])
  const leaveRoom = useCallback(() => {
    roomRef.current?.stop()
    setRoom(null)
  }, [])
  const startRoom = async () => {
    if (home.kind === 'viewer') return window.location.assign(roomHref.classroom(home.world.id))
    if (roomRef.current) return
    try {
      setRoom(await openRoom(store, home.kind === 'account' ? home.world.id : null))
    } catch (error) {
      setStorageNotice({ id: 'room', type: 'error', message: error instanceof Error ? error.message : 'The room could not be opened. Try again.' })
    }
  }
  // Invited classmates to play (My projects): the owner arrives with the room already open. Only the owner's account
  // project has a room to open here; anyone else's address goes to the room's own page.
  const openTogether = useRef(together)
  useEffect(() => {
    if (!openTogether.current || home.kind === 'new') return
    openTogether.current = false
    if (home.kind === 'account') settle(hackableHref.world(home.world.id, kitIn(store.getState().project)))
    if (home.kind === 'account' || home.kind === 'viewer') void startRoom()
  })
  const viewerBanner = home.kind === 'viewer' ? <ViewerBanner world={home.world} store={store} /> : undefined
  const roomBanner = room ? <RoomBar session={room.session} invite={room.invite} onLeave={leaveRoom} leaveLabel="Stop playing together" editing /> : undefined

  return (
    <div className="studio-screen">
      <StudioShell
        store={store}
        saveStatus={saveStatus}
        onRenameProject={home.kind === 'viewer' ? undefined : async (title) => store.renameProject(title)}
        onLeave={saveBeforeLeaving}
        firstRunTips
        banner={roomBanner || viewerBanner ? <>{roomBanner}{viewerBanner}</> : undefined}
        menuExtra={!room && (
          <MenuItem
            icon={<Users size={18} />}
            label="Play together"
            description={home.kind === 'viewer' ? 'Join this project’s room, with everyone playing it.' : `Open a room and send the link: everyone plays your game, each with their own ${designKit(store.getState().project.design) === 'blank' ? 'player' : 'Hero'}.`}
            onSelect={() => void startRoom()}
          />
        )}
      />
    </div>
  )
}

interface OpenRoom {
  session: RoomSession
  /** The page people join from. */
  invite: string
  stop: () => void
}

/**
 * Open this project's room and play in it: Play shows the room's game from now on, and changes to the project go to
 * everyone (studio/store.ts StudioRoom, rooms/studioRoom.ts).
 */
async function openRoom(store: StudioStore, worldId: string | null): Promise<OpenRoom> {
  const design = store.getState().project.design
  const text = designText(design)
  let url: string | (() => Promise<string>)
  let invite: string
  if (worldId) {
    url = () => classRoomSocketUrl(worldId)
    invite = roomHref.classroom(worldId)
  } else {
    const { roomId, ownerToken } = await createGuestRoom(text, design.name)
    rememberOwnerToken(roomId, ownerToken)
    url = guestRoomSocketUrl(roomId, ownerToken)
    invite = roomHref.guest(roomId)
  }
  const session = new RoomSession({ name: savedGuestName() || 'Player', url, key: clientKey() })
  // A class room starts from the account's copy; the host's project as it is on screen goes in at once.
  const link = new StudioRoomLink(session, worldId ? '' : text)
  let pushed = false
  const unsubscribe = session.subscribe(() => {
    if (pushed || !session.view.host || !session.runtime) return
    pushed = true
    link.playAgain(store.getState().project.design, false)
  })
  const unwatch = link.watch(store)
  session.connect()
  store.enterRoom(link)
  return {
    session,
    invite,
    stop: () => {
      unsubscribe()
      unwatch()
      session.close()
      store.leaveRoom()
    },
  }
}

type LocalSave = 'saving' | 'saved' | 'error'

const KEEP_A_FILE = 'To keep a copy somewhere else, open the ⋯ menu (This project) and press Save File.'

/** What tapping the save chip says: where this project lives, and what to do. One or two short sentences each. */
export const SAVE_WORDS = {
  local: `This project is saved in this browser, on this computer only. ${KEEP_A_FILE}`,
  newLocal: `This project is saved in this browser, on this computer only, as soon as you change something. ${KEEP_A_FILE}`,
  localFailed: 'Your latest change could not be saved on this computer. Open the ⋯ menu (This project) and press Save File, so you do not lose it.',
  account: 'This project is saved to your account. Sign in on any computer to open it from My projects.',
  accountSaving: 'Saving your latest changes to your account. Keep this tab open until it says Saved.',
  accountRetry: 'We keep trying. Keep this tab open until it says Saved.',
  newAccount: 'This project is saved to your account as soon as you change something.',
  waitingForAccount: 'This project is saved on this computer for now. We keep trying to put it in your account.',
  conflict: 'A newer version was saved somewhere else, so your changes here are being kept as a copy.',
  conflictFailed: 'Your changes here are not saved yet. Open the ⋯ menu (This project) and press Save File, so you do not lose them.',
  viewer: 'This is someone else’s project, so changes here are not saved. Press Make my own copy to keep them.',
  notSaved: 'This project is not saved. Open the ⋯ menu (This project) and press Save File, so you do not lose it.',
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
    return hackableHref.world(mine.id, kitIn(copy))
  } catch (error) {
    if ((error as { code?: string })?.code !== 'world_limit') throw error
    const id = newHackableId()
    if (!saveHackableProject(id, copy).ok) throw new Error('Your account is full, and this browser could not keep the copy either. Remove a project in My projects, then try again.')
    return hackableHref.local(id, kitIn(copy))
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
