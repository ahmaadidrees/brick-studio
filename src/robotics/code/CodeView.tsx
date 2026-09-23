import { ArrowLeft, Crosshair, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBrickStore } from '../../brick/store'
import type { DerivedCreation } from '../model/creations'
import type { Vec3 } from '../model/vec'
import { starterGoal, type Starter } from '../program/starters'
import type { BlockDiagnostic, CompileResult, ProgramKey } from '../program/types'
import type { RunSpace, TestProp } from '../run/types'
import { createProgramRuntime } from '../runtime'
import { FIXED_STEP } from '../sim/mechanics'
import { useRoboticsStore } from '../state/roboticsStore'
import { useStageStore } from '../state/stageStore'
import { WiringModeToggle } from '../wiring/WiringModeToggle'
import { BlocklyWorkspace, type BlocklyWorkspaceHandle } from './BlocklyWorkspace'
import { useCodeView } from './codeViewState'
import { activateProgram, activeProgramOf, addProgram, currentSection, ensureProgramFor, programsOf, removeProgram, renameProgramTo } from './programActions'
import { ProgramTabs } from './ProgramTabs'
import { StagePanel } from './StagePanel'
import { programUsesInput } from './stageReadings'
import { suspendStudioShortcuts } from './studioKeys'
import './code.css'

/**
 * The Code view (contract §6, CP2-PLAN §7, the mock's Code board). It lives inside the
 * build shell over the canvas's left part; the 3D canvas on the right is the stage (one
 * WebGL context). While it is open the drawer, the creation panel and the command strip
 * are hidden (`code.css`), the builder's keyboard shortcuts are off (`studioKeys.ts`),
 * and a stage is open for the creation. Back to build closes the stage (the run is
 * discarded) and the construction is exactly what it was.
 */
export default function CodeView() {
  const creationId = useCodeView((state) => state.creationId)
  const creation = useRoboticsStore((state) => (creationId ? state.model.creations.find((candidate) => candidate.id === creationId) ?? null : null))
  // A creation deleted while its code is open (or an unknown id): back to Build.
  useEffect(() => { if (creationId && !creation) useCodeView.getState().closeCode() }, [creationId, creation])
  if (!creation) return null
  return <CodeViewFor key={creation.id} creation={creation} />
}

const PROP_MARGIN = 0.4

/** World points that should be in view with the creation: the wall's corners, the visitor's path. */
export function propFramePoints(props: readonly TestProp[]): Vec3[] {
  const points: Vec3[] = []
  for (const prop of props) {
    if (prop.kind === 'wall') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) points.push({ x: prop.center.x + (sx * (prop.size.x / 2 + PROP_MARGIN)), y: prop.center.y + prop.size.y / 2, z: prop.center.z + (sz * (prop.size.z / 2 + PROP_MARGIN)) })
    } else {
      for (const point of prop.path) points.push({ x: point.x, y: point.y + prop.size.y / 2, z: point.z })
    }
  }
  return points
}

type Ran = { programId: string; revision: number }

function CodeViewFor({ creation }: { creation: DerivedCreation }) {
  const section = useRoboticsStore((state) => state.model.section)
  const programs = useMemo(() => programsOf(section, creation.id), [section, creation.id])
  const active = useMemo(() => activeProgramOf(section, creation.id), [section, creation.id])
  const stage = useStageStore((state) => (state.stage?.creationId === creation.id ? state.stage : null))
  const observation = useStageStore((state) => (state.stage?.creationId === creation.id ? state.stageObservation : null))
  const loading = useStageStore((state) => state.stageLoading)
  const stageNotice = useStageStore((state) => state.stageNotice)
  const workspace = useRef<BlocklyWorkspaceHandle>(null)
  const [compile, setCompile] = useState<CompileResult | null>(null)
  const [runBlocked, setRunBlocked] = useState<string | null>(null)
  const [ran, setRan] = useState<Ran | null>(null)
  const [saveProblem, setSaveProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // First run (contract §6): a program opened before its first edit gets the small palette, collapsed.
  const firstRunAtOpen = useRef(new Map<string, boolean>())
  const [allBlocks, setAllBlocks] = useState<ReadonlySet<string>>(() => new Set())
  if (active && !firstRunAtOpen.current.has(active.id)) firstRunAtOpen.current.set(active.id, active.revision === 0)
  const firstRun = Boolean(active && firstRunAtOpen.current.get(active.id) && !allBlocks.has(active.id))

  // Open: studio keys off, no half-finished build gesture, a program to show, a stage to run it on.
  useEffect(() => {
    const release = suspendStudioShortcuts()
    // No half-finished move, no armed brush (a click on the stage must never place a brick), no selection.
    useBrickStore.getState().cancelInteraction()
    // A studio message left over from Build (or the cancel's own hint) would sit over the stage bar.
    useBrickStore.getState().clearToast()
    useBrickStore.getState().selectBrick(null)
    if (!ensureProgramFor(creation)) setError('This creation’s programs could not be opened.')
    void useStageStore.getState().openStage(creation.id)
    return () => {
      release()
      useStageStore.getState().closeStage()
    }
    // The view is keyed by creation id; the creation object changes with every build edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation.id])

  // Frame the creation and its wall or visitor into the stage area (never under a panel):
  // when the stage first opens, and on every reset (Reset, a program switch, the space switch).
  const framed = useRef(false)
  const frame = useCallback(() => {
    const current = useStageStore.getState().stage
    const points = current && current.creationId === creation.id ? propFramePoints(current.controller.props) : []
    useRoboticsStore.getState().requestFrame(creation.brickIds, points)
  }, [creation.id, creation.brickIds])
  useEffect(() => {
    if (!stage || framed.current) return
    framed.current = true
    frame()
  }, [stage, frame])

  const onCompiled = useCallback((result: CompileResult) => {
    setCompile(result)
    if (result.ok) setRunBlocked(null)
  }, [])

  const resetRun = useCallback(() => {
    setRan(null)
    setRunBlocked(null)
    useStageStore.getState().resetStage()
    frame()
  }, [frame])

  const run = () => {
    const handle = workspace.current
    if (!handle || !active) return
    handle.flush()
    const result = handle.compileNow()
    if (!result) return
    if (!result.ok) {
      const first = result.diagnostics.find((diagnostic) => diagnostic.severity === 'error')
      setRunBlocked(first?.message ?? 'Fix the blocks marked in red first.')
      if (first?.blockId) handle.revealBlock(first.blockId)
      return
    }
    setRunBlocked(null)
    const saved = activeProgramOf(currentSection(), creation.id) ?? active
    useStageStore.getState().runOnStage(createProgramRuntime(result.ir, { fixedStep: FIXED_STEP }))
    setRan({ programId: saved.id, revision: saved.revision })
  }

  const selectProgram = (programId: string) => {
    workspace.current?.flush()
    activateProgram(creation.id, programId)
    resetRun()
  }
  const add = (starter: Starter) => {
    workspace.current?.flush()
    const result = addProgram(creation, starter)
    if (!result.ok) { setError(result.reason); return }
    setError(null)
    resetRun()
  }
  const remove = (programId: string) => {
    if (programs.length <= 1) return
    removeProgram(programId)
    if (ran?.programId === programId || active?.id === programId) resetRun()
  }
  const chooseSpace = (space: RunSpace) => {
    if ((stage?.space ?? creation.testSpace) === space) return
    // Saved as the creation's run space (an ordinary edit), then the run starts over there.
    useRoboticsStore.getState().setTestSpace(creation.id, space)
    resetRun()
  }
  const back = () => {
    workspace.current?.flush()
    useCodeView.getState().closeCode()
  }
  const onJoystick = useCallback((up: number, right: number) => useStageStore.getState().setStageJoystick(up, right), [])
  const onKey = useCallback((key: ProgramKey, down: boolean) => useStageStore.getState().setStageKey(key, down), [])

  const ours = Boolean(active && ran && ran.programId === active.id)
  const running = observation?.phase === 'running'
  const runDiagnostics: readonly BlockDiagnostic[] = ours && observation && observation.phase !== 'ready' ? observation.diagnostics : EMPTY
  const activeBlockIds: readonly string[] = ours && running ? observation!.activeBlockIds : EMPTY
  const changed = Boolean(active && ran && observation && observation.phase !== 'ready' && (ran.programId !== active.id || ran.revision !== active.revision))
  const hasVisitor = Boolean(stage?.controller.props.some((prop) => prop.kind === 'visitor'))
  const problems = useMemo(() => problemList([...(compile?.diagnostics ?? []), ...runDiagnostics]), [compile, runDiagnostics])

  return (
    <>
      <section className="robo-code-editor" aria-label={`Code for ${creation.name}`} data-shortcut-pause="" data-testid="robo-code">
        <header className="robo-code-head">
          <button type="button" className="robo-back" onClick={back} data-testid="robo-back"><ArrowLeft size={16} aria-hidden="true" />Back to build</button>
          <strong className="robo-code-name" title={creation.name}>{creation.name}</strong>
          <span className="robo-spacer" />
          <WiringModeToggle />
        </header>
        {active && (
          <ProgramTabs
            creation={creation}
            programs={programs}
            activeId={active.id}
            onSelect={selectProgram}
            onAdd={add}
            onRename={renameProgramTo}
            onDelete={remove}
          />
        )}
        {(error || saveProblem || problems.length > 0) && (
          <ul className="robo-problems" aria-label="Problems" data-testid="robo-problems">
            {error && <li className="error"><span className="robo-pill error">Can’t do that</span>{error}</li>}
            {saveProblem && <li className="error"><span className="robo-pill error">Not saved</span>{saveProblem}</li>}
            {problems.slice(0, 3).map((problem) => (
              <li key={problem.key} className={problem.severity}>
                <span className={`robo-pill ${problem.severity}`}>{problem.severity === 'error' ? 'Can’t run' : problem.severity === 'warning' ? 'Heads up' : 'Note'}</span>
                {problem.blockId ? <button type="button" className="robo-problem-link" onClick={() => workspace.current?.revealBlock(problem.blockId!)}>{problem.message}</button> : <span>{problem.message}</span>}
              </li>
            ))}
            {problems.length > 3 && <li className="more">and {problems.length - 3} more, marked on the blocks</li>}
          </ul>
        )}
        <div className="robo-code-body">
          {active && (
            <BlocklyWorkspace
              ref={workspace}
              program={active}
              creation={creation}
              firstRun={firstRun}
              paletteCollapsed={Boolean(firstRunAtOpen.current.get(active.id))}
              runDiagnostics={runDiagnostics}
              activeBlockIds={activeBlockIds}
              onCompiled={onCompiled}
              onSaveProblem={setSaveProblem}
            />
          )}
          {firstRun && active && (
            <button type="button" className="robo-all-blocks" onClick={() => setAllBlocks(new Set([...allBlocks, active.id]))} title="Show every block in the palette">More blocks</button>
          )}
          <div className="robo-zoom" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" onClick={() => workspace.current?.zoomBy(-1)}><ZoomOut size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Zoom in" onClick={() => workspace.current?.zoomBy(1)}><ZoomIn size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Back to the middle" onClick={() => workspace.current?.recenter()}><Crosshair size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </section>
      <StagePanel
        creation={creation}
        observation={observation}
        loading={loading}
        space={stage?.space ?? creation.testSpace}
        hasVisitor={hasVisitor}
        showInput={Boolean(active && programUsesInput(active.workspace))}
        runBlocked={runBlocked}
        changed={changed}
        notice={stageNotice?.reason === 'edit' ? 'The build changed, so the stage went back to the built pose.' : null}
        goal={active ? starterGoal(active.starter) : null}
        highlightGoal={firstRun}
        onRun={run}
        onStop={() => useStageStore.getState().stopStage()}
        onReset={resetRun}
        onSpace={chooseSpace}
        onVisitor={() => useStageStore.getState().triggerVisitor()}
        onFrame={frame}
        onJoystick={onJoystick}
        onKey={onKey}
      />
    </>
  )
}

const EMPTY: readonly never[] = Object.freeze([])

type Problem = { key: string; severity: BlockDiagnostic['severity']; message: string; blockId: string | null }

/** Diagnostics as the problems list reads them: errors first, one line per message. */
export function problemList(diagnostics: readonly BlockDiagnostic[]): Problem[] {
  const rank = { error: 0, warning: 1, info: 2 } as const
  const seen = new Set<string>()
  const list: Problem[] = []
  for (const diagnostic of [...diagnostics].sort((a, b) => rank[a.severity] - rank[b.severity])) {
    const key = `${diagnostic.severity}|${diagnostic.message}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push({ key, severity: diagnostic.severity, message: diagnostic.message, blockId: diagnostic.blockId })
  }
  return list
}

