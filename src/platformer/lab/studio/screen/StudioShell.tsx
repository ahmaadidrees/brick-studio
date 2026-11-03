import { Box, CircleHelp, Code2, Eraser, Hammer, MoreHorizontal, Pause, Play, RotateCcw, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { AppHeader } from '../../../../shell'
import type { HeaderSaveStatus } from '../../../../shell/AppHeader'
import { Button, Menu } from '../../../../ui'
import { ProjectMenu } from '../persist/ProjectMenu'
import { StorageNoticeBar } from '../persist/StorageNoticeBar'
import { Stage } from '../Stage'
import { screenOf, useStudio, type StudioScreen, type StudioStore } from '../store'
import { TestRoom } from '../workshop/TestRoom'
import { hasPlayer, screensFor } from '../kitScreens'
import { KIT_PARTS } from './kitParts'
import { ensureTiles } from '../builder/ensureTiles'
import { limitedStore } from '../builder/limits'
import { builderSession } from '../builder/session'
import { BuildDrawer, PaintStrip } from './BuildDrawer'
import { CodeColumn } from './CodeColumn'
import { Inspector } from './Inspector'
import { LevelBricks } from './LevelBricks'
import { FirstRunTips, HelpSheet } from './StudioHelp'
import { markTipsSeen, tipsSeen } from './firstRunTips'
import type { BrickTemplate } from '../templates'
import '../builder/builder.css'
import './screen.css'

const NO_WORLD_SETUP = () => undefined
const LEAVE_WAIT_MS = 5000
/** How long the small-screen brick card ignores touches after it opens (longer than a tap's trailing click). */
const INSPECTOR_SETTLE_MS = 400
const assignLocation = (href: string) => window.location.assign(href)
const LOCAL_SAVE: HeaderSaveStatus = { source: { kind: 'local' } }
const PHONE = '(max-width: 767px)'
/** Narrower than a Duo screen (540 px): the palette and scripts have no room, so Code is offered on bigger screens only. */
const NO_CODE = '(max-width: 539px)'
/** Any touch screen, including a touchscreen laptop whose main pointer is a trackpad. */
const TOUCH = '(any-pointer: coarse)'
export const CODE_NEEDS_ROOM = 'Code needs a bigger screen'

const SCREENS: ReadonlyArray<{ id: StudioScreen; label: string; icon: ReactNode; key: string }> = [
  { id: 'build', label: 'Build', icon: <Hammer size={16} />, key: '1' },
  { id: 'code', label: 'Code', icon: <Code2 size={16} />, key: '2' },
  { id: 'play', label: 'Play', icon: <Play size={16} />, key: '3' },
]

/**
 * Code Lab's one shell (docs/qa/code-lab-on-main/UX-AUDIT.md): Build · Code · Play at the top, and a left column, the
 * level and a right column that slide and resize together, so the kid never loses their place. The level is one Stage
 * that stays mounted in every screen.
 *   Build: Bricks drawer · the level · the inspector while something is selected.
 *   Code:  palette and scripts · the level at the top right with "In this level" below it.
 *   Play:  the level fills the screen.
 */
export function StudioShell({ store, templates, saveStatus = LOCAL_SAVE, onRenameProject, banner, onLeave, navigate = assignLocation, firstRunTips = false }: {
  store: StudioStore
  templates?: readonly BrickTemplate[]
  /** Where the project saves to (this browser unless the page says otherwise). */
  saveStatus?: HeaderSaveStatus
  onRenameProject?: (title: string) => Promise<void>
  /** A line under the header, e.g. "this is someone else's project". */
  banner?: ReactNode
  /** Save everything now: the logo and My projects wait for it before leaving. */
  onLeave?: () => Promise<unknown> | void
  /** Leaves the page (tests pass a stand-in). */
  navigate?: (href: string) => void
  /** Show the Build · Code · Play tips if this browser has not seen them (the page turns this on; tests leave it off). */
  firstRunTips?: boolean
}) {
  const screen = useStudio(store, screenOf)
  const selectedCopyId = useStudio(store, (s) => s.selectedCopyId)
  const remixNotice = useStudio(store, (s) => s.remixNotice)
  const name = useStudio(store, (s) => s.project.design.name)
  // The kit's screens (kitScreens.ts) and its React slots (kitParts.tsx).
  const screens = useStudio(store, (s) => screensFor(s.project.design))
  const parts = KIT_PARTS[screens.kit]
  const phone = useMedia(PHONE)
  const noCode = useMedia(NO_CODE)
  const touch = useTouch()
  const runtime = useStudio(store, (s) => s.runtime)
  const paused = useStudio(store, (s) => s.previewPaused)
  const session = builderSession(store)
  const history = session.history
  // The Stage places copies through this view of the store, which keeps the Hero and the Goal to one each.
  const stageStore = useMemo(() => limitedStore(store, history), [store, history])
  useSyncExternalStore(history.subscribe, history.getVersion)
  // Older saves have no tile layer; give them an empty one so painting works.
  useEffect(() => ensureTiles(store), [store])
  const [erasing, setErasingState] = useState(session.erasing)
  const setErasing = (on: boolean) => { session.erasing = on; setErasingState(on) }
  const [sheet, setSheet] = useState(false)
  // On a small screen the brick card slides up under the finger that selected the brick. For a moment after it opens it
  // ignores touches, so that same tap can't land on a slider and change it.
  const [settling, setSettling] = useState(false)
  const inspecting = screen === 'build' && selectedCopyId !== null
  useEffect(() => {
    if (!inspecting || !phone) return
    setSettling(true)
    const t = setTimeout(() => setSettling(false), INSPECTOR_SETTLE_MS)
    return () => { clearTimeout(t); setSettling(false) }
  }, [inspecting, phone])
  const [note, setNote] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  // Shown once per browser: remembered as soon as they show, so a reload does not bring them back (Help does).
  const tipsKey = screens.copy.tipsKey
  const [tips, setTips] = useState(() => firstRunTips && !tipsSeen(undefined, tipsKey))
  useEffect(() => { if (tips) markTipsSeen(undefined, tipsKey) }, [tips, tipsKey])
  // The logo and My projects save first, then go (after LEAVE_WAIT_MS at most, so a slow save never traps the kid; a
  // save still unfinished then is covered by the page's own "Leave site?" warning).
  const leaving = useRef(false)
  const leave = (href: string) => {
    if (leaving.current) return
    leaving.current = true
    const saved = Promise.resolve().then(() => onLeave?.()).catch(() => undefined)
    const wait = new Promise((resolve) => setTimeout(resolve, LEAVE_WAIT_MS))
    void Promise.race([saved, wait]).then(() => {
      leaving.current = false
      navigate(href)
    })
  }
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 5000)
    return () => clearTimeout(t)
  }, [note])
  useEffect(() => {
    if (!remixNotice) return
    const t = setTimeout(() => store.dismissRemixNotice(), 7000)
    return () => clearTimeout(t)
  }, [remixNotice, store])
  // A phone has no room for code: Code is offered on bigger screens only.
  useEffect(() => { if (noCode && screen === 'code') store.setScreen('build') }, [noCode, screen, store])

  const go = (next: StudioScreen) => {
    if (next === screen) return
    if (next === 'code' && noCode) return setNote(CODE_NEEDS_ROOM)
    // Play needs the kit's player (the Hero, the Car). Without one, say so kindly and stay put instead of starting a level
    // where nothing moves.
    const design = store.getState().project.design
    if (next === 'play' && !hasPlayer(design)) return setNote(screensFor(design).copy.noPlayer)
    setNote(null)
    setSheet(false)
    if (next !== 'build') setErasing(false)
    store.setScreen(next)
  }
  const goRef = useRef(go)
  goRef.current = go

  // 1 · 2 · 3 switch screens; in Build, undo, redo, E for Erase and Esc for Select. Never while typing or coding.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof Element && el.closest('.cl-code, .blocklyWidgetDiv, .blocklyDropDownDiv, [role="dialog"]')) return
      if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      const s = store.getState()
      const current = screenOf(s)
      if (!mod && !e.altKey) {
        const target = SCREENS.find((m) => m.key === e.key)
        // Play listens for keys itself; only Build and Code take 1 2 3, and Play's own Build button goes back.
        if (target && current !== 'play') { e.preventDefault(); goRef.current(target.id); return }
      }
      if (current !== 'build') return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        history.redo()
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'e') {
        store.setBrush(null)
        setErasing(!session.erasing)
      } else if (e.key === 'Escape' && (s.brushBrickId || session.erasing)) {
        e.preventDefault()
        store.setBrush(null)
        setErasing(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store, history, session])

  return (
    <div className={`p2d-game p2d-studio cl-shell${phone ? ' cl-phone' : ''}${touch ? ' cl-touch' : ''}`} data-screen={screen} data-inspecting={inspecting ? 'yes' : 'no'} data-sheet={sheet ? 'open' : 'closed'}>
      <div className="p2d-header builder-header">
        <AppHeader
          variant="editor"
          dimension="2d"
          hideCharacter
          onOpenProjects={() => leave('/projects')}
          worldTitle={name}
          onRenameWorld={onRenameProject}
          saveStatus={saveStatus}
          // Scene has nothing to open in Code Lab; the header's tools group is hidden in builder.css.
          onOpenWorldSetup={NO_WORLD_SETUP}
          mode={screen === 'play' ? 'explore' : 'build'}
          onRequestMode={(m) => go(m === 'build' ? 'build' : 'play')}
          canExplore
          modeLock={{ locked: false }}
          modeSwitch={<ModeTabs screen={screen} noCode={noCode} onChange={go} />}
          onOpenHelp={() => setHelp(true)}
          onGoHome={() => leave('/')}
          worldMenu={() => <>
            <Button variant="quiet" iconOnly icon={<CircleHelp size={20} />} aria-label="Help" title="Help" className="cl-help-trigger" onClick={() => setHelp(true)}>
              Help
            </Button>
            <Menu
              label="This project"
              align="end"
              width={360}
              className="builder-project-menu"
              trigger={({ ref, ...props }) => (
                <Button ref={ref} variant="quiet" iconOnly icon={<MoreHorizontal size={20} />} aria-label="This project" title="This project" className="shell-world-menu-trigger" {...props}>
                  This project
                </Button>
              )}
            >
              <ProjectMenu store={store} className="builder-project" />
            </Menu>
          </>}
        />
      </div>

      <StorageNoticeBar />
      {banner}

      <div className="cl-body">
        <div className="cl-slot cl-slot-drawer" inert={screen !== 'build' || (phone && !sheet) ? true : undefined}>
          <BuildDrawer store={store} history={history} erasing={erasing} onErasing={setErasing} onPicked={phone ? () => setSheet(false) : undefined} />
        </div>

        <div className="cl-slot cl-slot-code" inert={screen !== 'code' ? true : undefined}>
          {screen === 'code' && <CodeColumn store={store} templates={templates} />}
        </div>

        <div className="cl-slot cl-slot-stage">
          <div className="cl-stage-frame">
            <Stage store={stageStore} tools={{ history, erasing }} codeView={screen === 'code'} onOpenCode={noCode ? undefined : () => go('code')} />
            {screen === 'code' && <CodeStageBar store={store} testRoom={screens.testRoom} />}
          </div>
          {screen === 'build' && <PaintStrip store={store} erasing={erasing} onErasing={setErasing} />}
          {screen === 'build' && parts.BuildChip && <parts.BuildChip store={store} />}
          {screen === 'play' && <parts.PlayHud store={store} />}
          {screen === 'play' && touch && runtime && !paused && <parts.TouchControls runtime={runtime} store={store} />}
          {tips && screen === 'build' && <FirstRunTips phone={phone} noCode={noCode} copy={screens.copy} onClose={() => setTips(false)} />}
        </div>

        {/* Phones and a Duo: the Bricks sheet is closed most of the time, so Undo and Erase stay out here in their own
            bar under the level, where they never cover the Hero's start. */}
        {screen === 'build' && phone && !sheet && (
          <div className="cl-fabs" role="toolbar" aria-label="Bricks and undo">
            <button type="button" className="cl-fab" onClick={() => setSheet(true)}><Box size={20} aria-hidden="true" /> Bricks</button>
            <span className="cl-tools-gap" />
            <button type="button" className="cl-tool cl-fab-tool" aria-pressed={erasing} onClick={() => { store.setBrush(null); setErasing(!erasing) }}>
              <Eraser size={20} aria-hidden="true" /><span>Erase</span>
            </button>
            <button type="button" className="cl-tool cl-fab-tool" title="Undo" disabled={!history.canUndo} onClick={() => history.undo()}>
              <Undo2 size={20} aria-hidden="true" /><span>Undo</span>
            </button>
          </div>
        )}

        <div className={`cl-slot cl-slot-inspector${settling ? ' cl-settling' : ''}`} inert={!inspecting ? true : undefined}>
          {inspecting && <Inspector store={store} history={history} compact={phone} noCode={noCode} />}
        </div>

        <div className="cl-slot cl-slot-level" inert={screen !== 'code' ? true : undefined}>
          {screen === 'code' && <LevelBricks store={store} />}
        </div>

        {phone && sheet && screen === 'build' && <button type="button" className="cl-sheet-close" aria-label="Close bricks" onClick={() => setSheet(false)}><X size={18} /></button>}
        <HelpSheet open={help} copy={screens.copy} onClose={() => setHelp(false)} onShowTips={() => { setHelp(false); go('build'); setTips(true) }} />
        {(note || remixNotice) && (
          <div className="cl-toast cl-rise" role="status">
            {note ?? remixNotice}
            {!note && remixNotice && <button type="button" className="cl-icon-btn" aria-label="Dismiss" onClick={() => store.dismissRemixNotice()}><X size={16} /></button>}
          </div>
        )}
      </div>
    </div>
  )
}

/** Build · Code · Play with a sliding highlight; one tab stop, arrow keys move (radiogroup, like SegmentedControl). */
function ModeTabs({ screen, noCode, onChange }: { screen: StudioScreen; noCode: boolean; onChange: (s: StudioScreen) => void }) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const at = SCREENS.findIndex((m) => m.id === screen)
  const move = (e: ReactKeyboardEvent, from: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    let next = (from + step + SCREENS.length) % SCREENS.length
    if (noCode && SCREENS[next].id === 'code') next = (next + step + SCREENS.length) % SCREENS.length
    onChange(SCREENS[next].id)
    buttons.current[next]?.focus()
  }
  return (
    <div className="cl-modes" role="radiogroup" aria-label="Studio mode">
      <span className="cl-modes-ind" aria-hidden="true" style={{ transform: `translateX(${at * 100}%)` }} />
      {SCREENS.map((m, i) => {
        const off = noCode && m.id === 'code'
        return (
          <button key={m.id} ref={(el) => { buttons.current[i] = el }} type="button" role="radio" aria-checked={m.id === screen} tabIndex={m.id === screen ? 0 : -1}
            aria-disabled={off || undefined} title={off ? CODE_NEEDS_ROOM : `${m.label} (${m.key})`}
            className="cl-mode" onClick={() => onChange(m.id)} onKeyDown={(e) => move(e, i)}>
            <span aria-hidden="true">{m.icon}</span><span>{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Over Code's small level: pause, restart, and run the whole level or just this brick. A kit without a test room
 * (`testRoom`, Racing for now: the room is built around a helper Hero) always runs the whole level.
 */
function CodeStageBar({ store, testRoom }: { store: StudioStore; testRoom: boolean }) {
  const solo = useStudio(store, (s) => s.codeSolo) && testRoom
  const paused = useStudio(store, (s) => s.previewPaused)
  const pending = useStudio(store, (s) => s.pendingCodeChanges)
  const brickId = useStudio(store, (s) => s.selectedBrickId)
  const [restartKey, setRestartKey] = useState(0)
  return <>
    {solo && <div className="cl-room-box cl-fade"><TestRoom store={store} brickId={brickId} bare restartKey={restartKey} /></div>}
    <div className="cl-stage-bar" role="toolbar" aria-label="Level preview">
      {!solo && <button type="button" className="cl-btn cl-btn-sm cl-btn-icon" aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'} onMouseDown={(e) => e.preventDefault()} onClick={() => paused ? store.startPreview() : store.pausePreview()}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>}
      <button type="button" className={`cl-btn cl-btn-sm cl-btn-icon${pending && !solo ? ' cl-btn-attn' : ''}`} aria-label="Restart" title={pending && !solo ? 'Restart to try your changes' : 'Restart'} onMouseDown={(e) => e.preventDefault()} onClick={() => solo ? setRestartKey((n) => n + 1) : store.restartPreview()}><RotateCcw size={16} /></button>
      <span className="cl-tools-gap" />
      {testRoom && <div className="cl-seg cl-seg-sm" role="group" aria-label="What runs">
        <button type="button" aria-pressed={!solo} onClick={() => store.setCodeSolo(false)}>Whole level</button>
        <button type="button" aria-pressed={solo} onClick={() => store.setCodeSolo(true)}>Just this brick</button>
      </div>}
    </div>
    {pending && !solo && <span className="cl-stage-note cl-rise" role="status">Press Restart to try your changes</span>}
  </>
}

/**
 * Play's on-screen buttons: on for any touch screen, and from the first touch on a screen that says it has none (a
 * touchscreen Chromebook in laptop mode can report only its trackpad).
 */
function useTouch(): boolean {
  const media = useMedia(TOUCH)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (touched) return
    const onDown = (e: PointerEvent) => { if (e.pointerType === 'touch') setTouched(true) }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [touched])
  return media || touched
}

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const update = () => setOn(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return on
}
