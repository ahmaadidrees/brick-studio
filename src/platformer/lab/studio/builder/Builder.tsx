import { Hammer, MoreHorizontal, Play } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AppHeader, useCompactLayout } from '../../../../shell'
import { Button, Menu } from '../../../../ui'
import { ProjectMenu } from '../persist/ProjectMenu'
import { StorageNoticeBar } from '../persist/StorageNoticeBar'
import { Stage } from '../Stage'
import { useStudio, type StudioStore } from '../store'
import { BuildPanels } from './BuildPanels'
import { PlayFeedback } from './PlayFeedback'
import { checkLevelForPlay, NO_HERO_MESSAGE } from './playRules'
import { ensureTiles } from './ensureTiles'
import { limitedStore } from './limits'
import { builderSession } from './session'
import type { BrickTemplate } from '../templates'
import './builder.css'

const NO_WORLD_SETUP = () => undefined

/**
 * The Brickgineers 2D builder around the Code Lab stage (docs/qa/code-lab-core/STEP6.md): the app header, the Bricks
 * drawer, undo and redo, and the Placing strip, using the real 2D builder's own components and classes. Code is not on
 * this screen: a placed brick's "See inside" and "+ New brick" open the Brick Workshop.
 */
export function Builder({ store, templates }: { store: StudioStore; templates?: readonly BrickTemplate[] }) {
  const mode = useStudio(store, (s) => s.mode)
  const name = useStudio(store, (s) => s.project.design.name)
  const compact = useCompactLayout()
  const session = builderSession(store)
  const history = session.history
  // The Stage places copies through this view of the store, which keeps the Hero and the Goal to one each.
  const stageStore = useMemo(() => limitedStore(store, history), [store, history])
  useSyncExternalStore(history.subscribe, history.getVersion)
  // Older saves have no tile layer; give them an empty one so painting works.
  useEffect(() => ensureTiles(store), [store])
  const [erasing, setErasingState] = useState(session.erasing)
  const [drawerOpen, setDrawerOpenState] = useState(session.drawerOpen)
  const setErasing = (v: boolean | ((prev: boolean) => boolean)) =>
    setErasingState((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      session.erasing = next
      return next
    })
  const setDrawerOpen = (open: boolean) => {
    session.drawerOpen = open
    setDrawerOpenState(open)
  }
  const build = mode === 'build'

  // Play needs a Hero. Without one, say so kindly and stay in Build instead of starting a level where nothing moves.
  const [playNote, setPlayNote] = useState<string | null>(null)
  useEffect(() => {
    if (!playNote) return
    const t = setTimeout(() => setPlayNote(null), 5000)
    return () => clearTimeout(t)
  }, [playNote])
  const requestMode = (next: 'build' | 'explore') => {
    if (next === 'build') return store.stop()
    if (!checkLevelForPlay(store.getState().project.design).hero) return setPlayNote(NO_HERO_MESSAGE)
    setPlayNote(null)
    store.play()
  }

  // Undo, redo and the Erase key, in Build, unless a field or dialog has the keyboard.
  useEffect(() => {
    if (!build) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        history.redo()
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'e') {
        setErasing((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [build, history])

  return (
    <div className={`p2d-game p2d-studio builder ${build ? 'p2d-building' : 'p2d-playing'}${compact ? ' p2d-compact' : ''}${build && !compact && drawerOpen ? ' builder-drawer-open' : ''}`}>
      <div className="p2d-header builder-header">
        <AppHeader
          variant="editor"
          dimension="2d"
          hideCharacter
          onSwitchDimension={(target) => target === '3d' && window.location.assign('/build')}
          worldTitle={name}
          saveStatus={{ source: { kind: 'local' } }}
          // Scene (cartoon/pixel look, day/underground) has nothing to open in Code Lab. The header's tools group is hidden
          // in builder.css (display: none, so it is not shown or focusable); this handler is only the header's required prop.
          onOpenWorldSetup={NO_WORLD_SETUP}
          mode={build ? 'build' : 'explore'}
          onRequestMode={requestMode}
          canExplore
          modeLabels={{ explore: 'Play', exploreIcon: <Play size={16} />, buildIcon: <Hammer size={16} /> }}
          modeLock={{ locked: false }}
          onOpenHelp={() => {}}
          onGoHome={() => window.location.assign('/')}
          worldMenu={() => (
            <Menu
              label="This world"
              align="end"
              width={360}
              className="builder-project-menu"
              trigger={({ ref, ...props }) => (
                <Button ref={ref} variant="quiet" iconOnly icon={<MoreHorizontal size={20} />} aria-label="This world" title="This world" className="shell-world-menu-trigger" {...props}>
                  This world
                </Button>
              )}
            >
              <ProjectMenu store={store} className="builder-project" />
            </Menu>
          )}
        />
      </div>

      <StorageNoticeBar />

      <div className="p2d-body">
        <div className="builder-stage">
          <Stage store={stageStore} tools={{ history, erasing }} />
        </div>
        {!build && <PlayFeedback store={store} />}
        {build && playNote && (
          <div className="p2d-toast" role="status">
            {playNote}
          </div>
        )}
        {build && (
          <BuildPanels
            store={store}
            history={history}
            erasing={erasing}
            onErasing={setErasing}
            compact={compact}
            drawerOpen={drawerOpen}
            onDrawerOpen={setDrawerOpen}
            templates={templates}
          />
        )}
      </div>
    </div>
  )
}
