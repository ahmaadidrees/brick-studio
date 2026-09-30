import { ArrowLeft, CircleHelp, Hammer, Lightbulb, Play, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SegmentedControl } from '../../ui'
import { PLAYER_ID, WORLD_ID } from './bricks/builtins'
import { recipeById, type RecipeId } from './bricks/recipes'
import { allBricks, applyRecipe, backToOriginal, baseNoun, brickDef, newBrick, saveAsNewBrick, setProgram, setAppearance, starterDoc, type LabDoc, type NameWord } from './level/doc'
import { clearLabDoc, loadLabDoc, saveLabDoc } from './level/storage'
import { SOUND_LABELS, TARGET_BASE_OPTIONS, type Option, type OptionsProvider } from './program/catalog'
import { LAB_SOUNDS } from './program/types'
import type { Costume, LabDiagnostic } from './program/types'
import { LabSession, type BuildTool, type LabMode, type LabStatus } from './session'
import { CodePanel, type CodePanelHandle } from './ui/CodePanel'
import { CostumePanel } from './ui/CostumePanel'
import { BuildTools, CodeHeader, CodeTools, LiveValues, Problems, ThingList, ViewToggle, type CodeView } from './ui/parts'
import { programText } from './program/text'
import { AuthoringTutorialSheet, CodeHelpSheet, LibrarySheet, NewBrickSheet, RecipesSheet, SaveBrickSheet } from './ui/sheets'
import './lab.css'

type SheetName = 'add' | 'recipes' | 'save' | 'new' | 'help' | 'tutorial' | null
type EditorTab = 'code' | 'costumes' | 'sounds'

/**
 * /2d/lab: the code layer. Everything in the level is a program: the code of whatever is open sits on the left,
 * the stage and what is in the level on the right. Build and Play; code stays editable while playing and changes
 * apply at once. Single player, kept in this browser.
 */
export default function LabApp() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const codeRef = useRef<CodePanelHandle>(null)
  const sessionRef = useRef<LabSession | null>(null)
  const [doc, setDoc] = useState<LabDoc>(() => loadLabDoc() ?? starterDoc())
  const [open, setOpen] = useState<string>(PLAYER_ID)
  const [status, setStatus] = useState<LabStatus | null>(null)
  const [notesVersion, setNotesVersion] = useState(0)
  const [sheet, setSheet] = useState<SheetName>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saving')
  const [tool, setToolState] = useState<BuildTool>({ kind: 'select' })
  const [view, setView] = useState<CodeView>('blocks')
  const [editorTab, setEditorTab] = useState<EditorTab>('code')
  const [tidyAsked, setTidyAsked] = useState<{ n: number; reveal: string | null }>({ n: 0, reveal: null })
  const toastTimer = useRef(0)

  const say = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  // The session: made once, with the canvas.
  useEffect(() => {
    const canvas = canvasRef.current!
    const host = stageRef.current!
    const s = new LabSession(canvas, doc)
    sessionRef.current = s
    s.onDoc = (d) => setDoc(d)
    s.onStatus = () => setStatus(s.status())
    s.onNotes = () => setNotesVersion((n) => n + 1)
    s.onGlow = (ids) => codeRef.current?.setGlow(ids)
    s.onOpen = (brick) => setOpen(brick)
    const fit = () => {
      const r = host.getBoundingClientRect()
      s.resize(r.width, r.height, window.devicePixelRatio || 1)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    s.setMode('play')
    s.active = false
    s.start()
    setStatus(s.status())
    return () => {
      observer.disconnect()
      s.stop()
      sessionRef.current = null
    }
    // Made once; the lab document lives in the session from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the lab in this browser, a moment after each change.
  useEffect(() => {
    setSaveState('saving')
    const t = window.setTimeout(() => setSaveState(saveLabDoc(doc) ? 'saved' : 'error'), 500)
    return () => window.clearTimeout(t)
  }, [doc])

  const bricks = useMemo(() => allBricks(doc), [doc])
  const def = brickDef(doc, open) ?? brickDef(doc, PLAYER_ID)!
  const activeEditorTab = def.id === WORLD_ID ? 'code' : editorTab

  // The two level-dependent dropdowns: bricks to make, and things to touch.
  const bricksRef = useRef(bricks)
  bricksRef.current = bricks
  const options: OptionsProvider = useCallback((menu, current) => {
    const list = bricksRef.current.filter((b) => b.id !== PLAYER_ID && b.id !== WORLD_ID)
    const out: Option[] = menu === 'brick' ? list.map((b) => [b.name, b.id]) : [...TARGET_BASE_OPTIONS, ...list.map((b) => [`a ${b.name}`, `brick:${b.id}`] as Option)]
    if (current && !out.some(([, v]) => v === current)) out.push([menu === 'brick' ? 'a brick that is gone' : 'something that is gone', current])
    return out
  }, [])
  const optionsKey = bricks.map((b) => `${b.id}:${b.name}`).join('|')

  const diagnostics: LabDiagnostic[] = useMemo(() => {
    const s = sessionRef.current
    const compiled = s?.book.program(def.id)?.diagnostics ?? []
    const running = s?.notes.get(def.id) ?? []
    return [...compiled, ...running]
    // notesVersion: runtime problems arrive between renders.
  }, [def.id, doc, notesVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // The same code as text, printed from what the compiler made of the blocks.
  const text = useMemo(() => {
    if (view === 'blocks') return ''
    const ir = sessionRef.current?.book.program(def.id)?.ir
    return ir ? programText(ir, view, bricks.map((b) => ({ id: b.id, name: b.name }))) : ''
  }, [view, def.id, doc, bricks]) // eslint-disable-line react-hooks/exhaustive-deps

  const openBrick = useCallback((brick: string) => {
    codeRef.current?.flush()
    setOpen(brick)
    sessionRef.current?.open(brick)
  }, [])

  const onCodeChange = useCallback(
    (brick: string, workspace: unknown) => {
      const s = sessionRef.current
      if (!s) return
      const before = brickDef(s.doc, brick)
      s.setDoc(setProgram(s.doc, brick, workspace))
      if (before?.origin === 'builtin' && brick !== PLAYER_ID && brick !== WORLD_ID) say(`This is your own ${before.name} now. Every ${before.name} here runs it. The original is safe.`)
    },
    [say],
  )

  // After a recipe, tidy the blocks once the new code is in the editor, and show what it added.
  useEffect(() => {
    if (!tidyAsked.n) return
    const t = window.setTimeout(() => {
      codeRef.current?.tidy()
      if (tidyAsked.reveal) codeRef.current?.reveal(tidyAsked.reveal)
    }, 60)
    return () => window.clearTimeout(t)
  }, [tidyAsked])

  const setMode = (mode: LabMode) => {
    codeRef.current?.flush()
    sessionRef.current?.setMode(mode)
    setStatus(sessionRef.current?.status() ?? null)
  }

  const setTool = (t: BuildTool) => {
    setToolState(t)
    const s = sessionRef.current
    if (s) s.tool = t
  }

  const pickBrick = (brick: string) => {
    codeRef.current?.flush()
    const s = sessionRef.current
    if (!s) return
    setSheet(null)
    if (s.mode === 'build') {
      setTool({ kind: 'brick', brick })
      openBrick(brick)
      return
    }
    const id = s.addNear(brick)
    setOpen(brick)
    s.open(brick, id)
    s.activate()
  }

  const showRecipe = (id: RecipeId) => {
    codeRef.current?.flush()
    const s = sessionRef.current
    if (!s) return
    setSheet(null)
    setEditorTab('code')
    const r = applyRecipe(s.doc, id)
    s.setDoc(r.doc)
    if (s.mode !== 'play') s.setMode('play')
    if (r.place) s.dismount()
    const placed = r.place ? s.addNear(r.place) : undefined
    r.alsoPlace?.forEach((brick, index) => s.addNear(brick, -(index + 1) * 3))
    setOpen(r.open)
    s.open(r.open, r.open === r.place ? placed : undefined)
    s.activate()
    setTidyAsked((t) => ({ n: t.n + 1, reveal: id === 'double-jump' ? 'dj-1' : id === 'throw' ? 'throw-1' : null }))
    say(recipeById(id)?.tryIt ?? '')
  }

  const saveNew = (word: NameWord) => {
    codeRef.current?.flush()
    const s = sessionRef.current
    if (!s) return
    const from = open
    const r = saveAsNewBrick(s.doc, from, word)
    s.setDoc(r.doc, { rename: [from, r.id] })
    setSheet(null)
    setOpen(r.id)
    s.open(r.id)
    say(`Saved! It’s in Add a brick now.`)
  }

  const makeNew = (costume: Costume, word: NameWord | null) => {
    codeRef.current?.flush()
    const s = sessionRef.current
    if (!s) return
    const r = newBrick(s.doc, costume, word)
    s.setDoc(r.doc)
    setSheet(null)
    pickBrick(r.id)
    setOpen(r.id)
    say('Your new brick is in the level. Give it some code: start with “when I appear”.')
  }

  const startOver = () => {
    if (!window.confirm('Start the lab over? Your changes and your bricks go away.')) return
    clearLabDoc()
    window.location.reload()
  }

  // "In this level": you first, then the bricks there, then the open brick if it has none there.
  const rows = useMemo(() => {
    const counts = status?.counts ?? []
    const out: { def: NonNullable<ReturnType<typeof brickDef>>; count: number | null }[] = [{ def: brickDef(doc, PLAYER_ID)!, count: null }, { def: brickDef(doc, WORLD_ID)!, count: null }]
    for (const [brick, count] of counts) {
      const d = brickDef(doc, brick)
      if (d && brick !== PLAYER_ID && brick !== WORLD_ID) out.push({ def: d, count })
    }
    if (!out.some((r) => r.def.id === def.id)) out.push({ def, count: 0 })
    return out
  }, [status?.counts, doc, def])

  const mode = status?.mode ?? 'play'
  const placing = tool.kind === 'brick' ? brickDef(doc, tool.brick) : undefined

  return (
    <div className="lab-page">
      <header className="lab-head">
        <a className="lab-back" href="/2d">
          <ArrowLeft size={18} aria-hidden="true" /> 2D worlds
        </a>
        <div className="lab-brand">
          <strong>Code Lab</strong>
          <span>Everything here is code</span>
        </div>
        <SegmentedControl<LabMode>
          label="Build or play"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'build', label: 'Build', icon: <Hammer size={16} /> },
            { value: 'play', label: 'Play', icon: <Play size={16} /> },
          ]}
        />
        <div className="lab-head-end">
          <button type="button" className="lab-button" onClick={() => setSheet('tutorial')}>Try a project</button>
          <button type="button" className="lab-button" onClick={() => setSheet('help')}>
            <CircleHelp size={16} aria-hidden="true" /> How to…
          </button>
          <button type="button" className="lab-button" onClick={() => sessionRef.current?.restart()}>
            <RotateCcw size={16} aria-hidden="true" /> Start again
          </button>
          <button type="button" className="lab-button lab-button-want" onClick={() => setSheet('recipes')}>
            <Lightbulb size={16} aria-hidden="true" /> I want to…
          </button>
        </div>
      </header>

      <main className="lab-main">
        <section className="lab-code" aria-label="Code">
          <CodeHeader
            def={def}
            instanceCount={status?.counts.find(([id]) => id === def.id)?.[1] ?? (def.id === PLAYER_ID ? 1 : 0)}
            canMakeUnique={Boolean(status?.canMakeUnique && status.watch?.brick === def.id)}
            onOriginal={() => {
              codeRef.current?.flush()
              if (sessionRef.current) sessionRef.current.setDoc(backToOriginal(sessionRef.current.doc, def.id))
            }}
            onSave={() => {
              codeRef.current?.flush()
              setSheet('save')
            }}
            onMakeUnique={() => {
              codeRef.current?.flush()
              const unique = sessionRef.current?.makeWatchedUnique()
              if (unique) {
                setOpen(unique)
                say('This one now has its own code. Edit it here to make it different.')
              }
            }}
          />
          {def.id !== WORLD_ID && <div className="lab-editor-tabs" role="tablist" aria-label="Edit this design">
            {(['code', 'costumes', 'sounds'] as const).map((tab) => <button type="button" key={tab} role="tab" aria-selected={activeEditorTab === tab} onClick={() => {
              codeRef.current?.flush()
              setEditorTab(tab)
            }}>{tab === 'code' ? 'Code' : tab === 'costumes' ? 'Costumes' : 'Sounds'}</button>)}
          </div>}
          {activeEditorTab === 'costumes' && <CostumePanel key={def.id} definition={def} onChange={(appearance) => {
            const s = sessionRef.current
            if (s) s.setDoc(setAppearance(s.doc, def.id, appearance))
          }} />}
          {activeEditorTab === 'sounds' && <div className="lab-sound-panel" role="tabpanel" aria-label="Sounds">
            <h3>Try a sound</h3>
            <p>Preview a sound here. In Code, open Sound and use “play sound” to add it to your creation.</p>
            <div>{LAB_SOUNDS.map((sound) => <button type="button" className="lab-button" key={sound} onClick={() => sessionRef.current?.previewSound(sound)}><Play size={16} aria-hidden="true" />{SOUND_LABELS[sound]}</button>)}</div>
          </div>}
          {activeEditorTab === 'code' && <><div className="lab-code-body">
            <CodePanel ref={codeRef} brickId={def.id} program={def.program} options={options} optionsKey={optionsKey} diagnostics={diagnostics} onChange={onCodeChange} />
            {view === 'blocks' && <CodeTools onTidy={() => codeRef.current?.tidy()} onZoom={(n) => codeRef.current?.zoom(n)} />}
            <ViewToggle view={view} onView={setView} />
            {view !== 'blocks' && (
              <pre className="lab-text" aria-label={view === 'js' ? 'The code as JavaScript' : 'The code as Python'}>
                <span className="lab-text-note">{view === 'js' ? '// ' : '# '}READ ONLY — change the code with the blocks.</span>
                {'\n'}
                {text}
              </pre>
            )}
          </div>
          <Problems diagnostics={diagnostics} onReveal={(id) => codeRef.current?.reveal(id)} />
          </>}
        </section>

        <section className="lab-side" aria-label="Stage">
          <div className="lab-stage-frame">
            {mode === 'build' && <BuildTools tool={tool} onTool={setTool} placing={placing} />}
            <div className={`lab-stage${status?.active ? ' active' : ''}`} ref={stageRef}>
              <canvas ref={canvasRef} tabIndex={0} aria-label="The level. Click it to play: arrow keys move, space jumps, X runs, Z and ↑ ↓ are for your code." />
              {mode === 'play' && !status?.active && (
                <button type="button" className="lab-stage-hint" onClick={() => sessionRef.current?.activate()}>
                  <Play size={18} aria-hidden="true" /> Click here to play
                </button>
              )}
              {mode === 'build' && <p className="lab-stage-note">Building: time stands still. Press Play to run it.</p>}
            </div>
            <p className="lab-keys">
              <kbd>←</kbd>
              <kbd>→</kbd> move · <kbd>space</kbd> jump · <kbd>X</kbd> run · <kbd>Z</kbd> <kbd>↑</kbd> <kbd>↓</kbd> for your code
            </p>
          </div>
          <LiveValues status={status} def={status?.watch ? brickDef(doc, status.watch.brick) : undefined} onToggle={(key) => sessionRef.current?.toggleShown(key)} />
          <ThingList rows={rows} open={def.id} onOpen={openBrick} onAdd={() => setSheet('add')} />
          <button type="button" className="lab-start-over" onClick={startOver}>
            Start the lab over
          </button>
          <p className={`lab-save-state${saveState === 'error' ? ' lab-save-state-error' : ''}`} role={saveState === 'error' ? 'alert' : 'status'}>
            {saveState === 'error' ? 'Could not save in this browser. Keep this tab open.' : saveState === 'saved' ? 'Saved in this browser.' : 'Saving in this browser…'}
          </p>
        </section>
      </main>

      {toast && (
        <div className="lab-toast" role="status">
          {toast}
        </div>
      )}

      <LibrarySheet open={sheet === 'add'} bricks={bricks} onClose={() => setSheet(null)} onPick={pickBrick} onNew={() => setSheet('new')} />
      <RecipesSheet open={sheet === 'recipes'} onClose={() => setSheet(null)} onPick={showRecipe} />
      <CodeHelpSheet open={sheet === 'help'} onClose={() => setSheet(null)} />
      <AuthoringTutorialSheet open={sheet === 'tutorial'} onClose={() => setSheet(null)} onStart={showRecipe} />
      <SaveBrickSheet key={`save-${def.id}`} open={sheet === 'save'} def={def} noun={baseNoun(doc, def.id)} onClose={() => setSheet(null)} onSave={saveNew} />
      <NewBrickSheet open={sheet === 'new'} onClose={() => setSheet(null)} onMake={makeNew} />
    </div>
  )
}
