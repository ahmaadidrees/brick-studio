import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Blocks, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, MonitorSmartphone, Plus, Search, Settings, Users } from 'lucide-react'
import { BrickMark } from '../../brand'
import { Button, SegmentedControl, Sheet, TextField } from '../../ui'
import { errorMessage, formatSavedDate } from '../../classroom/panelShared'
import type { ClassroomCheckpoint } from '../../classroom/contracts'
import { AccessChip, BuildingChip, CardMenu, InviteesChip, OpenWorldButton, PresenceChips, WorldCard } from './WorldCard'
import { AppHeader, CLASS_PATH, clearRememberedTeacherClass, displayNameFor, NEW_BUILD_HREF, pickTeacherClassId, rememberTeacherClass, type ClassroomSessionState } from '../../shell'
import { InviteSheet } from '../../classroom/InviteSheet'
import { markInvitesSeen, seenInviteIds, unseenInvites } from '../../classroom/inviteSeen'
import { InviteBanner } from './InviteBanner'
import {
  browserWorldsClient, buildHref, byNewest, CONTINUE_DRAFT_HREF, isInviteOnly, isMine, isShared, liveHref, matchesSearch, readLocalDraft,
  SAVE_DRAFT_HREF, sharedForBuilding, signInHref, type Classmate, type LocalDraft, type WorldsClass, type WorldsClient, type WorldSharing, type WorldsWorld,
} from './worldsData'
import { createFakeWorldsClient, FIXTURE_CLASS, teacherSession } from './worldsFixtures'
import './worlds.css'

type Props = {
  client?: WorldsClient
  /** Replaces the current location; overridden in tests. */
  navigate?: (href: string) => void
  storage?: Pick<Storage, 'getItem'>
  /**
   * Which section to open. `class` selects the first class as soon as the
   * classes load; anything else opens your own worlds. Defaults to `?view=` on
   * the URL, which is how the account menu's "My class" reaches this page.
   */
  view?: 'mine' | 'class'
}

let resolvedDefault: WorldsClient | null = null

/**
 * Dev-only preview clients for the QA screenshots: `/worlds?demo=student|teacher`.
 * Resolved once per document: a fresh client on every render would resubscribe
 * and reload in a loop.
 */
function defaultClient(): WorldsClient {
  if (resolvedDefault) return resolvedDefault
  resolvedDefault = pickDefaultClient()
  return resolvedDefault
}

function pickDefaultClient(): WorldsClient {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const demo = new URLSearchParams(window.location.search).get('demo')
    if (demo === 'student') return createFakeWorldsClient()
    if (demo === 'teacher') return createFakeWorldsClient({ session: teacherSession })
    if (demo === 'closed') return createFakeWorldsClient({ classes: [{ ...FIXTURE_CLASS, collaborationOpen: false }] })
    if (demo === 'empty') return createFakeWorldsClient({ worlds: [] })
  }
  return browserWorldsClient
}

/** Matches the CSS breakpoint where the rail becomes a tab row. */
function useNarrow(query = '(max-width: 1024px)') {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
    if (!media) return
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return narrow
}

/**
 * `/worlds` — everything the signed-in account can open: the build still sitting
 * in this browser, worlds saved to the account, classmates' shared worlds and the
 * teacher's class worlds. Sharing is the student's decision (look only by
 * default); the teacher's variant swaps the rail for their classes and can start
 * shared worlds. Signed-out visitors go to sign-in and come back here.
 */
function readView(): 'mine' | 'class' {
  if (typeof window === 'undefined') return 'mine'
  return new URLSearchParams(window.location.search).get('view') === 'class' ? 'class' : 'mine'
}

export default function WorldsPage({ client: injectedClient, navigate: injectedNavigate, storage, view }: Props) {
  // Both defaults must stay referentially stable: they feed a store subscription
  // and an effect that would otherwise re-run on every render.
  const client = useMemo(() => injectedClient ?? defaultClient(), [injectedClient])
  const navigate = useMemo(() => injectedNavigate ?? ((href: string) => window.location.replace(href)), [injectedNavigate])
  const session = useSyncExternalStore(client.subscribe, client.getSession, client.getSession)
  const [worlds, setWorlds] = useState<WorldsWorld[]>([])
  const [classes, setClasses] = useState<WorldsClass[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [section, setSection] = useState('mine')
  const [search, setSearch] = useState('')
  const [inviteWorld, setInviteWorld] = useState<WorldsWorld | null>(null)
  /** Invites this browser has already answered; kept in state so "Not now" re-renders the banner at once. */
  const [seen, setSeen] = useState(() => seenInviteIds())
  /** The invite picker's roster: loaded the first time a share sheet opens, kept for the page's life. */
  const [classmates, setClassmates] = useState<Classmate[] | null>(null)
  const [classmatesError, setClassmatesError] = useState('')
  const [renameTarget, setRenameTarget] = useState<WorldsWorld | null>(null)
  const [checkpointTarget, setCheckpointTarget] = useState<WorldsWorld | null>(null)
  const [checkpoints, setCheckpoints] = useState<ClassroomCheckpoint[]>([])
  const [draft, setDraft] = useState<LocalDraft | null>(null)
  const narrow = useNarrow()
  const renameField = useRef<HTMLInputElement>(null)
  /** Consumed once, when the classes arrive; switching sections by hand wins afterwards. */
  const pendingView = useRef((view ?? readView()) === 'class')

  const teacher = session?.user.role === 'teacher'
  const me = session?.user.id ?? ''

  // Presence-only: the browser draft is read once, never created or replaced here.
  useEffect(() => { setDraft(readLocalDraft(storage ?? globalThis.localStorage)) }, [storage])

  useEffect(() => { if (!session) navigate(signInHref('/worlds')) }, [session, navigate])

  useEffect(() => {
    if (!session) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    Promise.all([client.listWorlds({ presence: true }), client.listClasses()])
      .then(([nextWorlds, nextClasses]) => {
        if (cancelled) return
        setWorlds(nextWorlds); setClasses(nextClasses)
        // A teacher returns to the class they last picked; a student has one.
        if (pendingView.current && nextClasses[0]) { setSection(teacher ? pickTeacherClassId(nextClasses) : nextClasses[0].id); pendingView.current = false }
      })
      .catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [client, session, teacher])

  const reload = async () => {
    const [nextWorlds, nextClasses] = await Promise.all([client.listWorlds({ presence: true }), client.listClasses()])
    setWorlds(nextWorlds); setClasses(nextClasses)
  }
  const run = (work: () => Promise<void>) => {
    void (async () => {
      setBusy(true); setError(''); setNotice('')
      try { await work() } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) }
    })()
  }

  const myWorlds = useMemo(() => worlds.filter(world => isMine(world, me)).sort(byNewest), [worlds, me])
  /** Quiet invites this student has not answered yet, newest first; a teacher is never invited to anything. */
  const invites = useMemo(() => (teacher ? [] : unseenInvites(worlds, me, seen)), [teacher, worlds, me, seen])
  /**
   * A shared personal world belongs to its owner's class (`ownerClassId`). A
   * teacher on multiple classes must not see the same student world under
   * every class rail item; a world with no `ownerClassId` (older data, or a
   * fixture that never set it) falls back to showing under the first class.
   */
  const belongsToClass = (world: WorldsWorld, classId: string) =>
    world.ownerClassId === classId || (world.ownerClassId == null && classId === classes[0]?.id)
  const sections = useMemo(() => [
    { id: 'mine', label: teacher ? 'My worlds' : 'Mine', count: myWorlds.length },
    ...classes.map(item => ({
      id: item.id,
      label: item.name,
      // A closed class shows nothing, so its count says nothing either.
      count: item.collaborationOpen === false ? 0
        : worlds.filter(world => world.classId === item.id || (world.kind === 'personal' && world.ownerId !== me && isShared(world) && belongsToClass(world, item.id))).length,
    })),
  ], [classes, myWorlds.length, teacher, worlds, me])

  useEffect(() => { if (!sections.some(item => item.id === section)) setSection('mine') }, [sections, section])

  if (!session) return <main className="worlds-page worlds-redirect"><p role="status">Taking you to sign in…</p></main>

  const headerSession: ClassroomSessionState = {
    status: teacher ? 'teacher' : 'student',
    user: session.user,
    classes: session.classes,
    className: teacher ? undefined : classes[0]?.name,
    displayName: displayNameFor(session.user),
    signOut: async () => run(async () => { clearRememberedTeacherClass(); await client.signOut() }),
    switchAccount: async () => { clearRememberedTeacherClass(); await client.signOut(); navigate(signInHref('/worlds')) },
  }

  const currentClass = classes.find(item => item.id === section) ?? null
  const sharedInClass = worlds
    .filter(world => world.kind === 'personal' && world.ownerId !== me && isShared(world) && !(world.hiddenByTeacher && !teacher)
      && (currentClass ? belongsToClass(world, currentClass.id) : false))
    .sort(byNewest)
  // A student's quiet invites get their own section; the teacher sees them among the rest with an invitees chip.
  const invitedWorlds = teacher ? [] : sharedInClass.filter(isInviteOnly)
  const classmateWorlds = teacher ? sharedInClass : sharedInClass.filter(world => !isInviteOnly(world))
  const classWorlds = worlds.filter(world => world.kind !== 'personal' && world.classId === currentClass?.id).sort(byNewest)
  const collaborationClosed = Boolean(currentClass && !currentClass.collaborationOpen)
  // The teacher can turn class sharing off; the button goes away rather than
  // waiting for the server's `sharing_disabled`. Already-shared worlds keep
  // their chip so a student can still stop sharing.
  const myClass = classes[0]
  const canShare = !teacher && myClass?.studentsCanShare !== false && myClass?.collaborationOpen !== false
  const filter = (list: WorldsWorld[]) => list.filter(world => matchesSearch(world, search))

  /**
   * The one answer to the invite sheet. Inviting people to BUILD ends in the live room, the same room
   * "Join and build" opens for them, so the owner is already there when the first friend arrives.
   * Look-only sharing (and Stop sharing) stays on this page and just refreshes the card.
   */
  const invite = (target: WorldsWorld, sharing: WorldSharing) => run(async () => {
    await client.setWorldSharing(target.id, sharing)
    if (sharing.visibility !== 'private' && sharing.canEdit) { window.location.assign(`${liveHref(target)}?invited=1`); return }
    await reload(); setInviteWorld(null)
    if (sharing.visibility === 'private') setNotice(`“${target.title}” is private again.`)
  })
  const stopSharing = (world: WorldsWorld) => invite(world, { visibility: 'private', canEdit: false })
  /** Opens the invite sheet; the roster loads once, in the background, and never blocks the sheet. */
  const openInvite = (world: WorldsWorld) => {
    setInviteWorld(world)
    if (classmates !== null || teacher || !myClass) return
    setClassmatesError('')
    client.listClassmates(myClass.id).then(setClassmates).catch(failure => setClassmatesError(errorMessage(failure)))
  }
  /** "Not now" and "Join and build" both answer the invite, so the banner never asks twice. */
  const answerInvite = (world: WorldsWorld) => {
    markInvitesSeen([world.id])
    setSeen(current => new Set([...current, world.id]))
  }
  const rename = (title: string) => {
    const target = renameTarget
    if (!target) return
    run(async () => { await client.renameWorld(target.id, title.trim()); await reload(); setRenameTarget(null); setNotice('World renamed.') })
  }
  const duplicate = (world: WorldsWorld) => run(async () => {
    await client.duplicateWorld(world); await reload(); setNotice(`Duplicated “${world.title}”.`)
  })
  const openCheckpoints = (world: WorldsWorld) => run(async () => {
    setCheckpoints(await client.listCheckpoints(world.id)); setCheckpointTarget(world)
  })
  const restore = (world: WorldsWorld, checkpointId: string) => run(async () => {
    await client.restoreCheckpoint(world.id, checkpointId); await reload(); setCheckpointTarget(null)
    setNotice('World restored. Open it to see the recovered version.')
  })
  const copy = (world: WorldsWorld) => run(async () => {
    const created = await client.copyWorld(world.id)
    await reload(); setSection('mine')
    setNotice(`“${created.title}” is in your worlds now.`)
  })
  const hide = (world: WorldsWorld) => run(async () => {
    await client.setWorldHidden(world.id, !world.hiddenByTeacher); await reload()
    setNotice(world.hiddenByTeacher ? `“${world.title}” is visible to the class again.` : `“${world.title}” is hidden from the class.`)
  })
  const createShared = (title: string, kind: 'class' | 'group') => {
    if (!currentClass) return
    run(async () => {
      await client.createSharedWorld(currentClass.id, title, kind); await reload()
      setNotice(kind === 'group' ? `“${title}” is ready. Add students in World controls.` : `“${title}” is ready for the whole class.`)
    })
  }

  /*
   * A rail entry still only filters this page. The teacher's selected class
   * also offers the way back to /class, because the class page is where the
   * roster, the code and the settings live and nothing else on this page
   * pointed at it.
   */
  const railItems = sections.map(item => <Fragment key={item.id}>
    <button type="button" className={`worlds-rail-item${item.id === section ? ' worlds-rail-current' : ''}`} aria-current={item.id === section ? 'page' : undefined} onClick={() => { setSection(item.id); setSearch(''); if (teacher && item.id !== 'mine') rememberTeacherClass(item.id) }}>
      <span className="worlds-rail-label">{item.id === 'mine' ? <Blocks size={16} aria-hidden="true" /> : <Users size={16} aria-hidden="true" />}{item.label}</span>
      <span className="worlds-rail-count">{item.count}</span>
    </button>
    {teacher && item.id !== 'mine' && item.id === section && (
      <a className="worlds-rail-open-class" href={`${CLASS_PATH}?classId=${encodeURIComponent(item.id)}`}>
        <ExternalLink size={14} aria-hidden="true" /> Open class page
      </a>
    )}
  </Fragment>)

  const heading = section === 'mine' ? 'My worlds' : currentClass?.name ?? 'Class'
  const counts = section === 'mine'
    ? `${myWorlds.length} ${myWorlds.length === 1 ? 'world' : 'worlds'} saved to your account`
    : collaborationClosed ? 'Collaboration is closed right now.'
      : `${classmateWorlds.length + classWorlds.length} ${classmateWorlds.length + classWorlds.length === 1 ? 'world' : 'worlds'} ${teacher ? 'in this class' : 'to join'}`

  return <div className="worlds-page">
    <AppHeader
      variant="page"
      title="Worlds"
      actions={<>
        {teacher && <Button href={CLASS_PATH} variant="secondary" size="sm" icon={<Users size={16} />}>My class</Button>}
        <Button href="/build" variant="secondary" size="sm">Open the studio</Button>
      </>}
      session={headerSession}
    />
    <div className="worlds-layout">
      {narrow
        ? <nav className="worlds-tabs" aria-label="Worlds sections">{railItems}</nav>
        : <nav className="worlds-rail" aria-label="Worlds sections">
          {railItems}
          {teacher && <a className="worlds-rail-new" href="/class"><Plus size={16} aria-hidden="true" /> New class</a>}
        </nav>}

      <main className="worlds-main" id="worlds-main">
        <div className="worlds-title-row">
          <div>
            <h1>{heading}</h1>
            <p className="worlds-counts">{counts}</p>
          </div>
          <div className="worlds-title-actions">
            {/* The one obvious way to start something, on every section of this page. */}
            <Button href={NEW_BUILD_HREF} variant="primary" icon={<Plus size={18} />}>New build</Button>
            {!collaborationClosed && <TextField className="worlds-search" label="Search worlds" type="search" icon={<Search size={16} />} value={search} onChange={event => setSearch(event.target.value)} />}
          </div>
        </div>

        {error && <p className="worlds-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></p>}
        {notice && <p className="worlds-notice" role="status"><CircleCheck size={18} aria-hidden="true" /><span>{notice}</span></p>}
        {loading && <p className="worlds-loading" role="status"><LoaderCircle className="ui-spin" size={18} aria-hidden="true" /> Loading your worlds…</p>}

        {!loading && section === 'mine' && <>
          <InviteBanner invites={invites} busy={busy} onDismiss={answerInvite} onJoin={answerInvite} />

          {draft && <section className="worlds-draft" aria-label="Build in progress">
            <MonitorSmartphone size={22} aria-hidden="true" />
            <div className="worlds-draft-text">
              <strong>Build in progress on this device</strong>
              <small>This browser only · {draft.bricks} {draft.bricks === 1 ? 'brick' : 'bricks'}</small>
            </div>
            <div className="worlds-draft-actions">
              <Button href={CONTINUE_DRAFT_HREF} variant="secondary" size="sm">Continue building</Button>
              <Button href={SAVE_DRAFT_HREF} variant="primary" size="sm">Save to my account</Button>
            </div>
          </section>}

          <section aria-label="Saved to your account" className="worlds-section">
            <h2 className="worlds-section-title">Saved to your account</h2>
            {filter(myWorlds).length === 0
              ? <EmptyState
                title={myWorlds.length ? 'No worlds match that search' : 'Your first world starts here.'}
                message={myWorlds.length ? 'Try another word from the world’s name.' : 'Build something in the studio, then save it to your account to open it on any device.'}
                action={myWorlds.length ? undefined : <Button href="/build" variant="primary">Open the studio</Button>} />
              : <div className="worlds-grid">{filter(myWorlds).map(world => {
                const shared = isShared(world)
                // Shared for building: the world is a room now, so the obvious button walks into it.
                const together = shared && sharedForBuilding(world)
                return <WorldCard
                  key={world.id}
                  world={world}
                  chip={<PresenceChips world={world} />}
                  menu={<CardMenu label={`More for ${world.title}`} items={[
                    ...(shared ? [{ label: 'Open alone', onSelect: () => navigate(buildHref(world)) }] : []),
                    { label: 'Rename', onSelect: () => setRenameTarget(world) },
                    { label: 'Duplicate', onSelect: () => duplicate(world) },
                    { label: 'Checkpoints', onSelect: () => openCheckpoints(world) },
                    ...(shared ? [{ label: 'Stop sharing', onSelect: () => stopSharing(world) }] : []),
                  ]} />}
                >
                  {together
                    ? <OpenWorldButton href={liveHref(world)} label="Build together" busy={busy} />
                    : <OpenWorldButton href={buildHref(world)} label="Open" busy={busy} />}
                  {shared
                    ? <Button variant="secondary" size="sm" iconOnly icon={<Settings size={16} />} aria-label="Who can join" disabled={busy} onClick={() => openInvite(world)}>Who can join</Button>
                    : canShare && <Button variant="secondary" size="sm" icon={<Users size={16} />} disabled={busy} onClick={() => openInvite(world)}>Invite classmates</Button>}
                </WorldCard>
              })}</div>}
          </section>
        </>}

        {!loading && section !== 'mine' && currentClass && <>
          {collaborationClosed
            ? <p className="worlds-closed" role="status">{currentClass.teacherName || 'Your teacher'} closed collaboration. Class worlds come back when it reopens.</p>
            : <>
              {teacher && <StartSharedWorld busy={busy} className={currentClass.name} onCreate={createShared} />}

              {/* Quiet invites: only the classmates the owner picked see this section, and only when it has something. */}
              {!teacher && filter(invitedWorlds).length > 0 && <section aria-label="Shared with you" className="worlds-section">
                <h2 className="worlds-section-title">Shared with you</h2>
                <div className="worlds-grid">{filter(invitedWorlds).map(world => <WorldCard
                  key={world.id}
                  world={world}
                  byline={`${world.ownerName} invited you`}
                  chip={<><AccessChip world={world} /><BuildingChip world={world} /></>}
                >
                  {world.canEdit && <OpenWorldButton href={liveHref(world)} label="Join and build" busy={busy} />}
                  <OpenWorldButton href={liveHref(world)} label="Visit" variant={world.canEdit ? 'secondary' : 'primary'} busy={busy} />
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => copy(world)}>Make my own copy</Button>
                </WorldCard>)}</div>
              </section>}

              <section aria-label={teacher ? 'Shared by students' : 'Shared by classmates'} className="worlds-section">
                <h2 className="worlds-section-title">{teacher ? 'Shared by students' : 'Shared by classmates'}</h2>
                {filter(classmateWorlds).length === 0
                  ? <EmptyState title={teacher ? 'No student worlds yet' : 'Nothing shared yet'} message={teacher ? 'When a student shares a world with the class it appears here.' : 'When a classmate shares a world, you will find it here.'} />
                  : <div className="worlds-grid">{filter(classmateWorlds).map(world => <WorldCard
                    key={world.id}
                    world={world}
                    byline={world.ownerName}
                    chip={<><AccessChip world={world} /><BuildingChip world={world} />{teacher && <InviteesChip world={world} />}</>}
                  >
                    {world.canEdit && <OpenWorldButton href={liveHref(world)} label="Join and build" busy={busy} />}
                    <OpenWorldButton href={liveHref(world)} label="Visit" variant={world.canEdit ? 'secondary' : 'primary'} busy={busy} />
                    {teacher
                      ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => hide(world)}>{world.hiddenByTeacher ? 'Show to class' : 'Hide from class'}</Button>
                      : <Button variant="secondary" size="sm" disabled={busy} onClick={() => copy(world)}>Make my own copy</Button>}
                  </WorldCard>)}</div>}
              </section>

              <section aria-label={teacher ? 'Class worlds' : 'Teacher’s worlds'} className="worlds-section">
                <h2 className="worlds-section-title">{teacher ? 'Class worlds' : 'Teacher’s worlds'}</h2>
                {filter(classWorlds).length === 0
                  ? <EmptyState title="No class worlds yet" message={teacher ? 'Start a shared world above and your class can join it right away.' : 'Your teacher’s class worlds will appear here when they are ready.'} />
                  : <div className="worlds-grid">{filter(classWorlds).map(world => <WorldCard key={world.id} world={world} byline={world.ownerName}>
                    <OpenWorldButton href={liveHref(world)} label="Join" busy={busy} />
                    {teacher && <Button variant="secondary" size="sm" disabled={busy} onClick={() => openCheckpoints(world)}>World controls</Button>}
                  </WorldCard>)}</div>}
              </section>
            </>}
        </>}
      </main>
    </div>

    {inviteWorld && <InviteSheet
      world={inviteWorld}
      className={classes[0]?.name ?? 'your class'}
      busy={busy}
      classmates={classmates}
      classmatesError={classmatesError || undefined}
      onInvite={sharing => invite(inviteWorld, sharing)}
      onStopSharing={isShared(inviteWorld) ? () => stopSharing(inviteWorld) : undefined}
      onClose={() => setInviteWorld(null)}
    />}

    {renameTarget && <Sheet open variant="dialog" size="sm" title="Rename world" description={`“${renameTarget.title}” keeps everything inside it.`} initialFocusRef={renameField} onClose={() => setRenameTarget(null)}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={() => setRenameTarget(null)}>Cancel</Button>
        <Button type="submit" form="worlds-rename-form" variant="primary" loading={busy} loadingLabel="Saving…">Save name</Button>
      </>}>
      <form id="worlds-rename-form" onSubmit={event => { event.preventDefault(); rename(new FormData(event.currentTarget).get('title') as string) }}>
        <TextField ref={renameField} label="World name" name="title" defaultValue={renameTarget.title} required maxLength={80} autoComplete="off" />
      </form>
    </Sheet>}

    {checkpointTarget && <Sheet open variant="dialog" size="sm" title={`Checkpoints for “${checkpointTarget.title}”`} description="Restore an earlier version if something went wrong." onClose={() => setCheckpointTarget(null)}
      footer={<Button variant="secondary" disabled={busy} onClick={() => setCheckpointTarget(null)}>Close</Button>}>
      {checkpoints.length === 0
        ? <p className="worlds-help">No checkpoints yet. One is kept every time this world is restored or changed a lot.</p>
        : <ul className="worlds-checkpoints">{checkpoints.map(checkpoint => <li key={checkpoint.id}>
          <div><strong>Version {checkpoint.revision}</strong><small>{formatSavedDate(checkpoint.createdAt)} · {checkpoint.reason}</small></div>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => restore(checkpointTarget, checkpoint.id)}>Restore</Button>
        </li>)}</ul>}
    </Sheet>}
  </div>
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <div className="worlds-empty">
    <BrickMark size={44} variant="outline" title={null} />
    <div><h3>{title}</h3><p>{message}</p>{action}</div>
  </div>
}

/** Teacher-only: the existing create-shared-world contract (title + whole class / assigned group). */
function StartSharedWorld({ busy, className, onCreate }: { busy: boolean; className: string; onCreate: (title: string, kind: 'class' | 'group') => void }) {
  const [kind, setKind] = useState<'class' | 'group'>('class')
  const [title, setTitle] = useState('')
  return <form className="worlds-start" onSubmit={event => { event.preventDefault(); if (title.trim()) { onCreate(title.trim(), kind); setTitle('') } }}>
    <h2 className="worlds-section-title">Start a shared world</h2>
    <p className="worlds-help">Starts as an empty plate; build in it from the studio. {className} can join it right away.</p>
    <div className="worlds-start-row">
      <TextField label="Shared world name" name="title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={80} autoComplete="off" />
      <SegmentedControl<'class' | 'group'> label="Access" showLabel value={kind} onChange={setKind} options={[{ value: 'class', label: 'Whole class' }, { value: 'group', label: 'Assigned group' }]} />
      <Button type="submit" variant="primary" loading={busy} loadingLabel="Creating…" disabled={!title.trim()}>Start world</Button>
    </div>
  </form>
}
