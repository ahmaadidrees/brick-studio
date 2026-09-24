import { Hammer, House, Lock, Menu as MenuIcon, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Feel } from '@brick-studio/platformer-core/engine/feel'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'
import { browserClassroomClient } from '../../classroom/client'
import type { ClassroomClassmate, ClassroomWorld, ClassroomWorldSharing } from '../../classroom/contracts'
import { InviteSheet } from '../../classroom/InviteSheet'
import { AppHeader, useClassroomSession, useCompactLayout, type HeaderLivePolicy } from '../../shell'
import { Button, type SaveStatusSource } from '../../ui'
import { CATEGORIES, PALETTE } from '../editor/palette'
import { GameSession, type Mode, type RoomOptions } from '../game/session'
import { formatTime } from '../render/renderer'
import { BuildShell } from './BuildShell'
import { CharacterSheet } from './CharacterSheet'
import { CloudLevelSaver, createCloudLevel } from './cloudLevel'
import { draftSaveMessage, saveDraft, type DraftSaveFailure } from './drafts'
import { FeelPanel } from './FeelPanel'
import { loadFeel, saveFeel } from './feelStore'
import { LevelMenu } from './LevelMenu'
import { Menu, type MenuView } from './Menu'
import { PeopleSheet } from './PeopleSheet'
import { clientKey, hasSeen, markSeen, saveCharacter, savedCharacter, saveSoundPrefs, soundPrefs, type SoundPrefs } from './prefs'
import { playWithFriends } from './rooms'
import { RecoverySheet, recoveryWorldUuid } from './RecoverySheet'
import { SceneSheet } from './SceneSheet'
import { encodeShareCode } from './shareCode'
import { TouchControls } from './TouchControls'

export type LevelSource =
  | { kind: 'course'; id: string }
  | { kind: 'draft'; id: string }
  | { kind: 'new' }
  | { kind: 'shared' }
  /** An account level (a classroom world holding a 2D level), edited alone. */
  | { kind: 'cloud'; world: ClassroomWorld }
  /** A live room: a guest room opened by link, or a class level's room. */
  | { kind: 'room'; roomKind: 'guest' | 'classroom'; roomId: string }

interface Props {
  level: LevelDesign
  source: LevelSource
  startMode: Mode
  onExit: () => void
  exitLabel?: string
  /** Solo courses: go on to the next course, if there is one. */
  onNext?: () => void
  /** Join a live room instead of playing alone. */
  room?: Omit<RoomOptions, 'key' | 'lag'>
}

interface Clear {
  time: number
  best: number
  newBest: boolean
}

type Hint = 'play' | 'build' | null

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/**
 * A 2D level in progress, laid out like the 3D studio: the shared header on top (3D ⇄ 2D, the level's name and save
 * state, Scene, People, Build | Play, the ⋯ menu) and the game below. Building adds the Bricks drawer, Undo and Redo,
 * and the strip that says what a click places. Playing is the game alone, with a pause button.
 *
 * Where edits go: an account level saves to the account a moment after each change; a signed-in student's new
 * level becomes an account level on its first edit (so it shows up in My worlds, ready to share); guests keep a
 * draft in this browser; rooms save by themselves.
 */
export function GameScreen({ level, source, startMode, onExit, exitLabel, onNext, room }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<GameSession | null>(null)
  const draftId = useRef<string | null>(source.kind === 'draft' ? source.id : null)
  const savedEdits = useRef(0)
  // Why the level could not be kept in this browser, while that is so (the header says so; leaving asks first).
  const [localFailure, setLocalFailure] = useState<DraftSaveFailure | null>(null)
  const localFailureRef = useRef<DraftSaveFailure | null>(null)
  const toastTimer = useRef(0)
  const saver = useRef<CloudLevelSaver | null>(null)
  /** A signed-in builder's first save, while the level becomes an account level. */
  const creatingCloud = useRef<Promise<void> | null>(null)
  /** The first save to the account failed: this level is kept in this browser for the rest of the visit. */
  const cloudFailed = useRef(false)
  /** Save whatever is unsaved right now (set by the session effect). */
  const saveNow = useRef<() => boolean>(() => true)
  const account = useClassroomSession()
  const signedIn = account.status === 'student' || account.status === 'teacher'
  const signedInRef = useRef(signedIn)
  signedInRef.current = signedIn
  const inRoom = !!room
  const [feel, setFeel] = useState<Feel>(loadFeel)
  const [feelOpen, setFeelOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [menuView, setMenuView] = useState<MenuView>('main')
  const [people, setPeople] = useState(false)
  const [scene, setScene] = useState(false)
  const [characterOpen, setCharacterOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [character, setCharacter] = useState<CharacterId>(savedCharacter)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const compact = useCompactLayout()
  const [mode, setMode] = useState<Mode>(startMode)
  const [sound, setSound] = useState<SoundPrefs>(() => soundPrefs(inRoom))
  const [showStats, setShowStats] = useState(false)
  const [touch, setTouch] = useState(coarse)
  const [toast, setToast] = useState<string | null>(null)
  const [title, setTitle] = useState(level.title)
  const [hint, setHint] = useState<Hint>(null)
  const [portrait, setPortrait] = useState(false)
  const [portraitOk, setPortraitOk] = useState(false)
  const [clear, setClear] = useState<Clear | null>(null)
  const [sharing, setSharing] = useState(false)
  const [classmates, setClassmates] = useState<ClassroomClassmate[] | null>(null)
  const [classmatesError, setClassmatesError] = useState('')
  const [busy, setBusy] = useState(false)
  const [, refresh] = useState(0)

  const say = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }

  useEffect(() => {
    const host = hostRef.current!
    // ?lag=150 simulates that many milliseconds of network delay each way (for testing).
    const lag = Number(new URLSearchParams(location.search).get('lag') ?? 0) || 0
    const s = new GameSession(canvasRef.current!, level, {
      feel: loadFeel(),
      character,
      room: room ? { ...room, lag, key: clientKey() } : undefined,
      recordKey: source.kind === 'course' ? `course:${source.id}` : null,
    })
    sessionRef.current = s
    if (source.kind === 'cloud' && source.world.canEdit) saver.current = new CloudLevelSaver(source.world, () => refresh((n) => n + 1))
    // Dev builds expose the session for scripted play-testing from the console.
    if (import.meta.env.DEV) (window as unknown as { __game2d: GameSession }).__game2d = s
    const prefs = soundPrefs(inRoom)
    s.sound.setMuted(prefs.muted)
    s.sound.setMusic(prefs.music)
    s.onStatus = () => refresh((n) => n + 1)
    s.onMenu = () => {
      setMenuView('main')
      setMenu((m) => !m)
    }
    s.onModeChange = () => setMode(s.mode)
    s.onToast = say
    // Let the goal fanfare play, then offer what to do next.
    s.onClear = (time, best, newBest) =>
      window.setTimeout(() => {
        if (s.player.clearTime === time) setClear({ time, best, newBest })
      }, 1600)
    s.editor.onChange = () => refresh((n) => n + 1)
    s.onRoom = () => {
      refresh((n) => n + 1)
      setTitle(s.timeline.world.design.title)
    }
    if (startMode === 'build') s.setMode('build')
    const fit = () => {
      const r = host.getBoundingClientRect()
      s.resize(r.width, r.height, window.devicePixelRatio || 1)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(host)
    fit()
    s.start()

    /** Keep the level in this browser. The edit count only counts as saved once the browser has it. */
    const keepLocally = (edits: number) => {
      const result = saveDraft(draftId.current, s.timeline.world.design)
      if (result.ok) {
        draftId.current = result.id
        savedEdits.current = edits
        if (localFailureRef.current) {
          localFailureRef.current = null
          setLocalFailure(null)
        }
        return true
      }
      if (localFailureRef.current !== result.reason) {
        localFailureRef.current = result.reason
        setLocalFailure(result.reason)
        say(draftSaveMessage(result.reason))
      }
      return false
    }

    // Keep the player's work: save a moment after edits, and on the way out. Returns false when work is unsaved.
    const save = (): boolean => {
      if (s.room || s.editCount === savedEdits.current) return true
      const edits = s.editCount
      const design = s.timeline.world.design
      if (saver.current) {
        savedEdits.current = edits
        saver.current.schedule(design)
        return true
      }
      if (source.kind === 'cloud') return true // someone else's level, opened to look at
      if (signedInRef.current && !cloudFailed.current) {
        // On its way to the account, not there yet: nothing counts as saved until it lands.
        if (creatingCloud.current) return false
        // A signed-in builder's level goes to the account on its first edit, so it is in My worlds, ready to share.
        creatingCloud.current = createCloudLevel(design)
          .then((world) => {
            saver.current = new CloudLevelSaver(world, () => refresh((n) => n + 1))
            savedEdits.current = s.editCount
            saver.current.schedule(s.timeline.world.design)
            window.history.replaceState(window.history.state, '', `/2d/build?world=${encodeURIComponent(world.id)}`)
            say('Saved to your account. Find it in My worlds.')
          })
          .catch((error: { code?: string; message?: string }) => {
            // From now on this level is kept in this browser (keepLocally says so itself if that fails too).
            creatingCloud.current = null
            cloudFailed.current = true
            if (!keepLocally(s.editCount)) return
            say(error?.code === 'world_limit' ? 'Your account is full, so this world is saved in this browser only.' : 'Could not save to your account, so this world is saved in this browser for now.')
          })
        return false
      }
      return keepLocally(edits)
    }
    saveNow.current = save
    const autosave = window.setInterval(save, 1000)
    const unlock = () => s.sound.unlock()
    const onTouch = () => setTouch(true)
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      save()
      void saver.current?.flush()
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', onTouch, { passive: true })
    // Closing the tab with work the browser would not keep: ask first.
    const onUnload = (event: BeforeUnloadEvent) => {
      if (save()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      save()
      void saver.current?.flush()
      window.clearInterval(autosave)
      ro.disconnect()
      s.stop()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onHide)
      sessionRef.current = null
    }
    // The session is created once per level; later prop changes are not expected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  // Solo games pause while a menu or card is open; in rooms the world keeps going but you stand still.
  const covered = menu || !!clear || sharing || people || scene || characterOpen || recoveryOpen
  useEffect(() => {
    const s = sessionRef.current
    if (!s) return
    s.setPaused(covered && s.solo)
    s.input.setSuspended(covered)
  }, [covered])

  // Back (including Safari's edge swipe) opens the menu instead of leaving the game.
  useEffect(() => {
    history.pushState({ p2dGame: true }, '')
    const onPop = () => {
      history.pushState({ p2dGame: true }, '')
      setMenuView('main')
      setMenu(true)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(orientation: portrait)')
    const on = () => setPortrait(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // First-time hints: controls when you first play, how to place things when you first build.
  useEffect(() => {
    if (mode === 'play' && !hasSeen('play')) {
      markSeen('play')
      setHint('play')
      const t = window.setTimeout(() => setHint((h) => (h === 'play' ? null : h)), 9000)
      return () => window.clearTimeout(t)
    }
    if (mode === 'build' && (!hasSeen('build') || source.kind === 'new')) {
      markSeen('build')
      setHint('build')
      return
    }
    setHint((h) => (h === 'build' && mode !== 'build' ? null : h))
  }, [mode, source.kind])

  // Keyboard shortcuts that are not movement.
  const spaceHeld = useRef(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = sessionRef.current
      if (!s) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.code === 'Backquote') setFeelOpen((v) => !v)
      if (e.code === 'F3') {
        e.preventDefault()
        setShowStats((v) => !v)
      }
      if (s.mode !== 'build' || s.input.suspended) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) s.editor.redo()
        else s.editor.undo()
        return
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault()
        s.editor.redo()
        return
      }
      if (mod) return
      if (e.code === 'Space') spaceHeld.current = true
      if (e.code === 'KeyE') s.editor.setErasing(!s.editor.erasing)
      if (e.code === 'KeyR') s.editor.flip()
      if (e.code === 'KeyP' && s.editor.hover) {
        s.placeResume(s.editor.hover[0], s.editor.hover[1])
        say('Play will start here')
      }
      // [ and ] step through the categories; 1 to 9 pick within the chosen block's category.
      const category = s.editor.item.category
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        const i = CATEGORIES.findIndex((c) => c.id === category)
        const next = CATEGORIES[(i + (e.code === 'BracketLeft' ? CATEGORIES.length - 1 : 1)) % CATEGORIES.length]
        const first = PALETTE.find((p) => p.category === next.id)
        if (first) s.editor.select(first)
      }
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (digit) {
        const items = PALETTE.filter((p) => p.category === category)
        const item = items[Number(digit[1]) - 1]
        if (item) s.editor.select(item)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Pointer input for building: one finger or the mouse paints, two fingers or space/middle-drag pan.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const panning = useRef(false)
  const worldAt = (e: React.PointerEvent) => {
    const s = sessionRef.current!
    return s.renderer.toWorld(e.clientX, e.clientY, Math.round(s.camera.x), Math.round(s.camera.y))
  }
  const onPointerDown = (e: React.PointerEvent) => {
    const s = sessionRef.current
    if (!s || s.mode !== 'build') return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2 || e.button === 1 || spaceHeld.current) {
      // A second finger means pan: take back whatever the first finger just placed.
      if (pointers.current.size >= 2) s.editor.abortStroke()
      else s.editor.cancelStroke()
      panning.current = true
      return
    }
    const [wx, wy] = worldAt(e)
    s.editor.pointerDown(wx, wy, e.button === 2)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = sessionRef.current
    if (!s || s.mode !== 'build') return
    const prev = pointers.current.get(e.pointerId)
    if (panning.current && prev) {
      const r = s.renderer.canvas.getBoundingClientRect()
      const k = s.renderer.width / r.width / Math.max(1, pointers.current.size)
      s.panCamera(-(e.clientX - prev.x) * k, -(e.clientY - prev.y) * k)
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      return
    }
    if (prev) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const [wx, wy] = worldAt(e)
    s.editor.pointerMove(wx, wy)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = sessionRef.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) panning.current = false
    s?.editor.pointerUp()
  }
  const onWheel = (e: React.WheelEvent) => {
    const s = sessionRef.current
    if (!s || s.mode !== 'build') return
    s.panCamera(e.deltaX * 0.5 + (e.shiftKey ? e.deltaY * 0.5 : 0), e.shiftKey ? 0 : e.deltaY * 0.5)
  }

  // Keep the level clear of whatever covers the edges of the game: the drawer and the strip while building,
  // the touch buttons while playing.
  const insetMode = useRef<Mode | null>(null)
  useEffect(() => {
    const s = sessionRef.current
    const stage = hostRef.current
    if (!s || !stage) return
    const area = stage.getBoundingClientRect()
    const strip = stage.parentElement?.querySelector('.p2d-strip, .brick-creative-dock')
    const drawer = stage.parentElement?.querySelector('.part-library')
    if (mode === 'build') {
      s.setBottomInset(strip ? area.bottom - strip.getBoundingClientRect().top + 8 : 0)
      s.setLeftInset(drawer ? drawer.getBoundingClientRect().right - area.left + 8 : 0)
    } else {
      s.setBottomInset(touch ? s.renderer.canvas.getBoundingClientRect().height * 0.22 : 0)
      s.setLeftInset(0)
    }
    // Entering build mode: bring the player into the part of the screen the drawer and strip leave free.
    if (mode === 'build' && insetMode.current !== 'build') s.focusPlayer()
    insetMode.current = mode
  })

  const s = sessionRef.current
  const build = mode === 'build'
  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      say(done)
    } catch {
      window.prompt('Copy this link', text)
    }
  }
  const shareLink = async () => {
    if (!s) return
    const code = await encodeShareCode(s.timeline.world.design)
    await copy(`${location.origin}/2d/play#l=${code}`, 'Link copied. Anyone who opens it gets this world.')
  }
  const inviteLink = source.kind === 'room' ? `${location.origin}/2d/${source.roomKind === 'guest' ? 'r' : 'w'}/${source.roomId}` : undefined
  const invite = inviteLink ? () => void copy(inviteLink, source.kind === 'room' && source.roomKind === 'classroom' ? 'Link copied. Classmates who can open this world can join with it.' : 'Invite link copied') : undefined
  const rename = async (next: string) => {
    const t = next.trim().slice(0, 60) || 'Untitled world'
    if (s && t !== s.timeline.world.design.title) s.applyEdit([{ o: 'title', title: t }])
    setTitle(t)
  }
  const changeSound = (p: SoundPrefs) => {
    setSound(p)
    saveSoundPrefs(p, inRoom)
    s?.sound.unlock()
    s?.sound.setMuted(p.muted)
    s?.sound.setMusic(p.music)
  }
  const changeFeel = (f: Feel) => {
    setFeel(f)
    saveFeel(f)
    s?.setFeel(f)
  }
  const changeCharacter = (id: CharacterId) => {
    setCharacter(id)
    saveCharacter(id)
    sessionRef.current?.setCharacter(id)
  }
  const openMenu = (view: MenuView = 'main') => {
    setMenuView(view)
    setMenu(true)
  }
  const tryBuild = () => {
    if (s?.setMode('build')) setMenu(false)
  }
  /** Leave once any account save has landed. */
  const leave = async (then: () => void) => {
    // Save now rather than on the next autosave tick; a level still becoming an account level finishes that first.
    let saved = saveNow.current()
    // A first save to the account still on its way: wait for it, then ask again (it may have fallen back, or failed).
    if (creatingCloud.current) {
      await creatingCloud.current
      saved = saveNow.current()
    }
    if (!saved && !confirm('This world is not saved anywhere yet. Leave anyway and lose it?\n\nCancel, then use "Copy a link to this world" in the menu to keep it.')) return
    if (saver.current && !(await saver.current.flush())) {
      say('Your world has not saved yet. Check your connection, then try again.')
      return
    }
    then()
  }
  const switchTo3D = () => void leave(() => window.location.assign('/build'))
  // Sharing an account level with the class: the same invite sheet as My worlds.
  const cloudWorld = saver.current?.world ?? (source.kind === 'cloud' ? source.world : null)
  const ownsCloudWorld = !!cloudWorld && cloudWorld.ownerId === account.user?.id
  const teachesCloudWorld = !!cloudWorld && account.status === 'teacher' && (account.classes ?? []).some(({ id }) => id === cloudWorld.ownerClassId || id === cloudWorld.classId)
  const canShareWithClass = !!cloudWorld && account.status === 'student' && cloudWorld.ownerId === account.user?.id && cloudWorld.kind === 'personal'

  /** Reuse a saved world when classmates already have access; never create a guest copy of account work. */
  const startRoom = () => {
    if (!s || busy) return
    if (cloudWorld) {
      if (cloudWorld.visibility === 'private') {
        if (canShareWithClass) openShare()
        else say('This saved world is private. Ask its owner to share it with your class.')
        return
      }
      setBusy(true)
      void leave(() => window.location.assign(`/2d/w/${cloudWorld.id.replaceAll('-', '')}?invited=1`)).finally(() => setBusy(false))
      return
    }
    setBusy(true)
    void leave(() =>
      playWithFriends(s.timeline.world.design).catch((error: Error) => {
        say(error.message)
        setBusy(false)
      }),
    )
  }

  const recoveryWorldId = signedIn && (ownsCloudWorld || teachesCloudWorld)
    ? recoveryWorldUuid(cloudWorld!.id)
    : signedIn && source.kind === 'room' && source.roomKind === 'classroom' && s?.classroomRoom && s.joined && s.isHost
      ? recoveryWorldUuid(source.roomId)
      : null
  const openShare = () => {
    const classId = account.classes?.[0]?.id
    setMenu(false)
    setSharing(true)
    if (classmates !== null || !classId) return
    browserClassroomClient.listClassmates(classId).then(setClassmates, (error: Error) => setClassmatesError(error.message))
  }
  const answerShare = async (next: ClassroomWorldSharing) => {
    if (!cloudWorld || !s) return
    setBusy(true)
    try {
      if (saver.current) {
        saver.current.schedule(s.timeline.world.design)
        // Never open the class room (which loads the saved copy) while this editor holds newer work.
        if (!(await saver.current.flush())) {
          say('Your world has not saved yet, so sharing waits. Check your connection, then try again.')
          return
        }
      }
      const updated = await browserClassroomClient.setWorldSharing(cloudWorld.id, next)
      if (saver.current) saver.current.world = { ...saver.current.world, ...updated }
      setSharing(false)
      // Building together happens in the level's live room, where the owner is already waiting.
      if (next.visibility !== 'private' && next.canEdit) window.location.assign(`/2d/w/${cloudWorld.id.replaceAll('-', '')}?invited=1`)
      else say(next.visibility === 'private' ? 'Only you can see this world now.' : 'Shared. Your classmates can play it from My worlds.')
    } catch (error) {
      say(error instanceof Error ? error.message : 'Sharing did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const saveSource: SaveStatusSource = inRoom
    ? { kind: 'live', connection: s?.roomStatus ?? 'connecting' }
    : saver.current
      ? { kind: 'cloud', status: saver.current.status }
      : { kind: 'local', error: localFailure ? draftSaveMessage(localFailure) : undefined }
  const players = s?.room?.players ?? []
  const livePolicy: HeaderLivePolicy | undefined =
    inRoom && s
      ? { connection: s.roomStatus, isOwner: s.isHost, roomTitle: title, peopleCount: s.joined ? players.length : undefined, onOpenPeople: s.joined ? () => setPeople(true) : undefined }
      : undefined
  const buildHint = hint === 'build' && build && (s?.editCount ?? 0) === 0
  // A toast takes the hint's place at the top rather than landing on it.
  const playHint = hint === 'play' && !build && !!s?.joined && !covered && !toast
  const offlineAfterJoin = !!s?.room && s.joined && s.roomStatus === 'offline'
  const sceneLocked = !s ? null : s.canBuild ? null : (s.buildBlockedReason ?? 'You can play this world, but not change it.')
  // A pointer click on a header button hands the keyboard straight back to the game (keyboard users keep focus).
  const releaseFocus = (e: React.MouseEvent) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button:not([aria-haspopup])')
    // A sheet needs its opener to keep focus so Escape can return there.
    if (e.detail > 0 && button && !button.classList.contains('app-header-tool')) button.blur()
  }

  return (
    <div className={`p2d-game p2d-studio ${build ? 'p2d-building' : 'p2d-playing'} ${touch ? 'p2d-is-touch' : ''} ${compact ? 'p2d-compact' : ''}`} data-joined={s?.joined ? 'yes' : 'no'}>
      <div className="p2d-header" onClickCapture={releaseFocus}>
        <AppHeader
          variant="editor"
          dimension="2d"
          onSwitchDimension={inRoom ? undefined : (target) => target === '3d' && switchTo3D()}
          worldTitle={title}
          onRenameWorld={s?.canBuild ? rename : undefined}
          renameMaxLength={60}
          saveStatus={{ source: saveSource }}
          onOpenWorldSetup={(tab) => tab === 'character' ? setCharacterOpen(true) : setScene(true)}
          onStartLiveWorld={inRoom ? undefined : startRoom}
          startLiveTitle="Open a room for friends with this world"
          livePolicy={livePolicy}
          mode={build ? 'build' : 'explore'}
          onRequestMode={(next) => (next === 'build' ? tryBuild() : s?.setMode('play'))}
          canExplore
          modeLabels={{ explore: 'Play', exploreIcon: <Play size={16} />, buildIcon: s && !s.canBuild ? <Lock size={16} /> : <Hammer size={16} /> }}
          modeLock={{ locked: false }}
          onOpenHelp={() => openMenu('controls')}
          onGoHome={() => void leave(() => window.location.assign('/'))}
          worldMenu={({ openRename }) => (
            <LevelMenu
              onRename={openRename}
              onShareLink={s?.solo ? () => void shareLink() : undefined}
              onInvite={invite}
              onShareWithClass={canShareWithClass ? openShare : undefined}
              onRecoveryCopies={recoveryWorldId ? () => setRecoveryOpen(true) : undefined}
              onResetWorld={s?.solo && build ? () => s.resetWorld() : undefined}
              onNewLevel={inRoom ? undefined : () => void leave(() => window.location.assign('/2d/build?new=1'))}
              sound={sound}
              onSound={changeSound}
              onControls={() => openMenu('controls')}
              onFeel={() => setFeelOpen(true)}
              onExit={() => void leave(onExit)}
              exitLabel={exitLabel ?? 'Back'}
            />
          )}
        />
      </div>

      <div className="p2d-body">
        <div
          className="p2d-stage"
          ref={hostRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => s?.editor.leave()}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={onWheel}
        >
          <canvas ref={canvasRef} className="p2d-canvas" />
        </div>

        {build && s && <BuildShell editor={s.editor} theme={s.timeline.world.design.theme} look={s.timeline.world.design.style} compact={compact} touch={touch} drawerOpen={drawerOpen} onDrawerOpen={setDrawerOpen} />}

        {!build && s && (
          <div className="p2d-play-tools" onClickCapture={releaseFocus}>
            <Button iconOnly icon={s.solo ? <Pause size={20} /> : <MenuIcon size={20} />} aria-label={s.solo ? 'Pause' : 'Menu'} title={s.solo ? 'Pause (Esc)' : 'Menu (Esc)'} onClick={() => openMenu()}>
              {s.solo ? 'Pause' : 'Menu'}
            </Button>
          </div>
        )}
        {!build && touch && s && !covered && <TouchControls input={s.input} />}

        {playHint && (
          <div className="p2d-hint p2d-hint-top" role="status">
            {touch ? (
              <>
                Slide on the pad to move. <b>Jump</b> jumps, hold it to go higher. Hold <b>Run</b> to go fast.
              </>
            ) : (
              <>
                <kbd>←</kbd> <kbd>→</kbd> move · <kbd>Space</kbd> jumps (hold to go higher) · hold <kbd>Shift</kbd> to run
              </>
            )}
            {source.kind === 'course' && <span className="p2d-hint-goal"> Reach the flag at the end!</span>}
          </div>
        )}
        {buildHint && (
          <div className="p2d-hint p2d-hint-dock" role="status">
            {touch ? 'Pick a brick, then tap or drag to place it. Two fingers look around.' : 'Pick a brick, then click or drag to place it. Right-click erases.'}
          </div>
        )}

        {s?.room && !s.joined && (
          <div className="p2d-overlay">
            <div className="p2d-card">
              <p className="p2d-lead">{s.roomStatus === 'offline' ? s.roomDetail || 'Could not join the room.' : 'Joining the room…'}</p>
              {s.roomStatus === 'offline' && (
                <Button fullWidth icon={<House size={18} />} onClick={onExit}>
                  {exitLabel ?? 'Back'}
                </Button>
              )}
            </div>
          </div>
        )}
        {offlineAfterJoin && s?.roomDetail && (
          <div className="p2d-overlay">
            <div className="p2d-card">
              <p className="p2d-lead">{s.roomDetail}</p>
              <Button fullWidth icon={<House size={18} />} onClick={onExit}>
                {exitLabel ?? 'Back'}
              </Button>
            </div>
          </div>
        )}

        {clear && !menu && (
          <div className="p2d-overlay">
            <div className="p2d-card p2d-clear" role="dialog" aria-label="You made it">
              <p className="p2d-kicker">{source.kind === 'course' ? 'Starter world' : 'Flag reached'}</p>
              <h2 className="p2d-clear-title">{clear.newBest ? 'New best time!' : 'You made it!'}</h2>
              <p className="p2d-clear-time">
                <span>Time</span> {formatTime(clear.time)}
                {clear.best >= 0 && !clear.newBest && (
                  <>
                    {' '}
                    · <span>Best</span> {formatTime(clear.best)}
                  </>
                )}
              </p>
              {onNext && (
                <Button variant="primary" fullWidth icon={<Play size={18} />} onClick={onNext} autoFocus>
                  Next world
                </Button>
              )}
              <Button
                variant={onNext ? 'secondary' : 'primary'}
                fullWidth
                icon={<RotateCcw size={18} />}
                autoFocus={!onNext}
                onClick={() => {
                  setClear(null)
                  sessionRef.current?.restartRun()
                }}
              >
                Play again
              </Button>
              {source.kind !== 'course' && s?.canBuild && (
                <Button
                  fullWidth
                  icon={<Hammer size={18} />}
                  onClick={() => {
                    setClear(null)
                    sessionRef.current?.setMode('build')
                  }}
                >
                  Keep building
                </Button>
              )}
              <Button fullWidth variant="quiet" icon={<House size={18} />} onClick={() => void leave(onExit)}>
                {exitLabel ?? 'Back'}
              </Button>
            </div>
          </div>
        )}

        {touch && portrait && !portraitOk && !menu && !build && (
          <div className="p2d-overlay p2d-rotate">
            <div className="p2d-card">
              <div className="p2d-phone" aria-hidden="true" />
              <p className="p2d-lead">Turn sideways for a bigger view</p>
              <Button fullWidth onClick={() => setPortraitOk(true)}>
                Play like this
              </Button>
            </div>
          </div>
        )}

        {toast && (
          <div className="p2d-toast" role="status">
            {toast}
          </div>
        )}

        {showStats && s && (
          <div className="p2d-stats">
            {s.stats.fps} fps · sim {s.stats.simMs.toFixed(2)} ms · draw {s.stats.renderMs.toFixed(2)} ms · {s.stats.entities} things · tick {s.stats.tick} · rollbacks {s.stats.rollbacks}
            {s.room ? ` · resyncs ${s.stats.resyncs} · ping ${s.room.rtt} ms` : ''} · {s.renderer.width}×{s.renderer.height} @{s.renderer.scale}x
          </div>
        )}
      </div>

      {s && (
        <Menu
          open={menu}
          view={menuView}
          session={s}
          building={build}
          title={title}
          sound={sound}
          onSound={changeSound}
          touch={touch}
          onClose={() => setMenu(false)}
          onRestart={() => {
            setMenu(false)
            s.restartRun()
          }}
          onFeel={() => {
            setMenu(false)
            setFeelOpen(true)
          }}
          onExit={() => void leave(onExit)}
          exitLabel={exitLabel ?? 'Back'}
        />
      )}
      {s && <PeopleSheet open={people} onClose={() => setPeople(false)} session={s} onInvite={invite} inviteLink={inviteLink} />}
      <CharacterSheet open={characterOpen} selected={character} onSelect={changeCharacter} onClose={() => setCharacterOpen(false)} />
      <RecoverySheet open={recoveryOpen} worldId={recoveryWorldId} worldTitle={title} onClose={() => setRecoveryOpen(false)} />
      {s && (
        <SceneSheet
          open={scene}
          onClose={() => setScene(false)}
          design={s.timeline.world.design}
          lockedReason={sceneLocked}
          onStyle={(style) => {
            s.applyEdit([{ o: 'style', style }])
            refresh((n) => n + 1)
          }}
          onTheme={(theme) => {
            s.applyEdit([{ o: 'theme', theme }])
            refresh((n) => n + 1)
          }}
        />
      )}
      {sharing && cloudWorld && (
        <InviteSheet
          world={cloudWorld}
          className={account.className ?? 'your class'}
          classmates={classmates}
          classmatesError={classmatesError || undefined}
          busy={busy}
          onInvite={(next) => void answerShare(next)}
          onStopSharing={cloudWorld.visibility !== 'private' ? () => void answerShare({ visibility: 'private', canEdit: false }) : undefined}
          onClose={() => setSharing(false)}
        />
      )}
      {feelOpen && <FeelPanel feel={feel} onChange={changeFeel} onClose={() => setFeelOpen(false)} />}
    </div>
  )
}
