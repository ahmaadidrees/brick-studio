import { Box, Code2, Hammer, MoreHorizontal, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { AppHeader } from '../../../../shell'
import type { HeaderSaveStatus } from '../../../../shell/AppHeader'
import { Button, Menu } from '../../../../ui'
import { ProjectMenu } from '../persist/ProjectMenu'
import { StorageNoticeBar } from '../persist/StorageNoticeBar'
import { Stage } from '../Stage'
import { screenOf, useStudio, type StudioScreen, type StudioStore } from '../store'
import { TestRoom } from '../workshop/TestRoom'
import { PlayFeedback } from '../builder/PlayFeedback'
import { PlayTouchControls } from './PlayTouchControls'
import { checkLevelForPlay, NO_HERO_MESSAGE } from '../builder/playRules'
import { ensureTiles } from '../builder/ensureTiles'
import { limitedStore } from '../builder/limits'
import { builderSession } from '../builder/session'
import { BuildDrawer, PaintStrip } from './BuildDrawer'
import { CodeColumn } from './CodeColumn'
import { Inspector } from './Inspector'
import { LevelBricks } from './LevelBricks'
import type { BrickTemplate } from '../templates'
import '../builder/builder.css'
import './screen.css'

const NO_WORLD_SETUP = () => undefined
const LEAVE_WAIT_MS = 5000
const assignLocation = (href: string) => window.location.assign(href)
const LOCAL_SAVE: HeaderSaveStatus = { source: { kind: 'local' } }
const PHONE = '(max-width: 767px)'
/** Touch screens get on-screen buttons in Play (the same test as the regular platformer). */
const TOUCH = '(pointer: coarse)'
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
export function StudioShell({ store, templates, saveStatus = LOCAL_SAVE, onRenameProject, banner, onLeave, navigate = assignLocation }: {
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
}) {
  const screen = useStudio(store, screenOf)
  const selectedCopyId = useStudio(store, (s) => s.selectedCopyId)
  const remixNotice = useStudio(store, (s) => s.remixNotice)
  const name = useStudio(store, (s) => s.project.design.name)
  const phone = useMedia(PHONE)
  const touch = useMedia(TOUCH)
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
  const [note, setNote] = useState<string | null>(null)
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
  useEffect(() => { if (phone && screen === 'code') store.setScreen('build') }, [phone, screen, store])

  const go = (next: StudioScreen) => {
    if (next === screen) return
    if (next === 'code' && phone) return setNote(CODE_NEEDS_ROOM)
    // Play needs a Hero. Without one, say so kindly and stay put instead of starting a level where nothing moves.
    if (next === 'play' && !checkLevelForPlay(store.getState().project.design).hero) return setNote(NO_HERO_MESSAGE)
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

  const inspecting = screen === 'build' && selectedCopyId !== null
  return (
    <div className={`p2d-game p2d-studio cl-shell${phone ? ' cl-phone' : ''}`} data-screen={screen} data-inspecting={inspecting ? 'yes' : 'no'} data-sheet={sheet ? 'open' : 'closed'}>
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
          modeSwitch={<ModeTabs screen={screen} phone={phone} onChange={go} />}
          onOpenHelp={() => {}}
          onGoHome={() => leave('/')}
          worldMenu={() => (
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
          )}
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
            <Stage store={stageStore} tools={{ history, erasing }} codeView={screen === 'code'} onOpenCode={phone ? undefined : () => go('code')} />
            {screen === 'code' && <CodeStageBar store={store} />}
          </div>
          {screen === 'build' && <PaintStrip store={store} erasing={erasing} onErasing={setErasing} />}
          {screen === 'play' && <PlayFeedback store={store} />}
          {screen === 'play' && touch && runtime && !paused && <PlayTouchControls runtime={runtime} />}
          {screen === 'build' && phone && !sheet && (
            <button type="button" className="cl-fab" onClick={() => setSheet(true)}><Box size={20} aria-hidden="true" /> Bricks</button>
          )}
        </div>

        <div className="cl-slot cl-slot-inspector" inert={!inspecting ? true : undefined}>
          {inspecting && <Inspector store={store} history={history} compact={phone} />}
        </div>

        <div className="cl-slot cl-slot-level" inert={screen !== 'code' ? true : undefined}>
          {screen === 'code' && <LevelBricks store={store} />}
        </div>

        {phone && sheet && screen === 'build' && <button type="button" className="cl-sheet-close" aria-label="Close bricks" onClick={() => setSheet(false)}><X size={18} /></button>}
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
function ModeTabs({ screen, phone, onChange }: { screen: StudioScreen; phone: boolean; onChange: (s: StudioScreen) => void }) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const at = SCREENS.findIndex((m) => m.id === screen)
  const move = (e: ReactKeyboardEvent, from: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    let next = (from + step + SCREENS.length) % SCREENS.length
    if (phone && SCREENS[next].id === 'code') next = (next + step + SCREENS.length) % SCREENS.length
    onChange(SCREENS[next].id)
    buttons.current[next]?.focus()
  }
  return (
    <div className="cl-modes" role="radiogroup" aria-label="Studio mode">
      <span className="cl-modes-ind" aria-hidden="true" style={{ transform: `translateX(${at * 100}%)` }} />
      {SCREENS.map((m, i) => {
        const off = phone && m.id === 'code'
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

/** Over Code's small level: pause, restart, and run the whole level or just this brick. */
function CodeStageBar({ store }: { store: StudioStore }) {
  const solo = useStudio(store, (s) => s.codeSolo)
  const paused = useStudio(store, (s) => s.previewPaused)
  const pending = useStudio(store, (s) => s.pendingCodeChanges)
  const brickId = useStudio(store, (s) => s.selectedBrickId)
  const [restartKey, setRestartKey] = useState(0)
  return <>
    {solo && <div className="cl-room-box cl-fade"><TestRoom store={store} brickId={brickId} bare restartKey={restartKey} /></div>}
    <div className="cl-stage-bar" role="toolbar" aria-label="Level preview">
      {!solo && <button type="button" className="cl-btn cl-btn-sm cl-btn-icon" aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'} onClick={() => paused ? store.startPreview() : store.pausePreview()}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>}
      <button type="button" className={`cl-btn cl-btn-sm cl-btn-icon${pending && !solo ? ' cl-btn-attn' : ''}`} aria-label="Restart" title={pending && !solo ? 'Restart to try your changes' : 'Restart'} onClick={() => solo ? setRestartKey((n) => n + 1) : store.restartPreview()}><RotateCcw size={16} /></button>
      <span className="cl-tools-gap" />
      <div className="cl-seg cl-seg-sm" role="group" aria-label="What runs">
        <button type="button" aria-pressed={!solo} onClick={() => store.setCodeSolo(false)}>Whole level</button>
        <button type="button" aria-pressed={solo} onClick={() => store.setCodeSolo(true)}>Just this brick</button>
      </div>
    </div>
    {pending && !solo && <span className="cl-stage-note cl-rise" role="status">Press Restart to try your changes</span>}
  </>
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
