import {
  BatteryCharging,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Code2,
  Gamepad2,
  Gauge,
  Info,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Route,
  Sparkles,
  Undo2,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo } from 'react'
import RoverIslandScene from './game/RoverIslandScene'
import { useSoundFeedback } from './game/useSoundFeedback'
import { compileAssembly } from './domain/assembly'
import { PART_ORDER, PARTS, REQUIRED_SLOTS, SLOT_LABELS } from './domain/parts'
import type { GameMode, PartId } from './domain/types'
import { useGameStore } from './state/useGameStore'

const MODES: { id: GameMode; label: string; icon: typeof Wrench }[] = [
  { id: 'build', label: 'Build', icon: Wrench },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'test', label: 'Test', icon: Play },
  { id: 'play', label: 'Play', icon: Gamepad2 },
]

function ModeNavigation() {
  const mode = useGameStore((state) => state.mode)
  const setMode = useGameStore((state) => state.setMode)
  const connections = useGameStore((state) => state.connections)
  const assembly = useMemo(() => compileAssembly(connections), [connections])

  return (
    <nav className="mode-nav" aria-label="Project modes">
      {MODES.map(({ id, label, icon: Icon }, index) => {
        const locked = (id === 'test' || id === 'play') && !assembly.readyToDrive
        return (
          <button
            key={id}
            className={`mode-button ${mode === id ? 'active' : ''}`}
            onClick={() => setMode(id)}
            aria-current={mode === id ? 'page' : undefined}
            title={locked ? 'Attach both drive motors first' : `${label} mode`}
          >
            <span className="mode-number">{index + 1}</span>
            <Icon size={17} strokeWidth={2.4} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function MissionCard() {
  const connections = useGameStore((state) => state.connections)
  const stopOnRed = useGameStore((state) => state.program.stopOnRed)
  const telemetry = useGameStore((state) => state.telemetry)
  const missionComplete = useGameStore((state) => state.missionComplete)
  const connectedSlots = new Set(connections.map((connection) => connection.slotId))
  const buildDone = REQUIRED_SLOTS.every((slot) => connectedSlots.has(slot))
  const tested = telemetry.distanceTravelled > 0.5

  const steps = [
    { label: 'Finish the rover', done: buildDone },
    { label: 'Teach it to stop on red', done: stopOnRed },
    { label: 'Run a test', done: tested || missionComplete },
    { label: 'Ride to the lighthouse', done: missionComplete },
  ]
  const nextStep = steps.findIndex((step) => !step.done)

  return (
    <aside className="mission-card glass-card">
      <div className="mission-heading">
        <div className="mission-icon"><Route size={19} /></div>
        <div>
          <span className="eyebrow">Mission 01</span>
          <h2>Power the lighthouse</h2>
        </div>
      </div>
      <p className="mission-copy">Build a rover that can carry the last battery safely to the red dock.</p>
      <div className="mission-steps">
        {steps.map((step, index) => (
          <div key={step.label} className={`mission-step ${step.done ? 'done' : ''} ${index === nextStep ? 'current' : ''}`}>
            <span className="step-check">{step.done ? <Check size={14} /> : index + 1}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function BuildTray() {
  const selectedPart = useGameStore((state) => state.selectedPart)
  const selectPart = useGameStore((state) => state.selectPart)
  const connections = useGameStore((state) => state.connections)
  const undo = useGameStore((state) => state.undo)
  const redo = useGameStore((state) => state.redo)
  const placePart = useGameStore((state) => state.placePart)
  const undoCount = useGameStore((state) => state.undoStack.length)
  const redoCount = useGameStore((state) => state.redoStack.length)
  const selected = PARTS[selectedPart]
  const placedIds = new Set(connections.map((connection) => connection.partId))

  return (
    <section className="build-dock glass-card" aria-label="Parts tray">
      <div className="dock-heading">
        <div>
          <span className="eyebrow">Easy Build</span>
          <h2>Choose a part, then tap its glowing connector</h2>
        </div>
        <div className="history-controls">
          <button className="icon-button" onClick={undo} disabled={!undoCount} aria-label="Undo"><Undo2 size={18} /></button>
          <button className="icon-button" onClick={redo} disabled={!redoCount} aria-label="Redo"><Redo2 size={18} /></button>
        </div>
      </div>
      <div className="part-row">
        {PART_ORDER.map((partId) => {
          const part = PARTS[partId]
          const placed = placedIds.has(partId)
          return (
            <button
              key={partId}
              className={`part-card ${selectedPart === partId ? 'selected' : ''} ${placed ? 'placed' : ''}`}
              style={{ '--part-color': part.color, '--part-accent': part.accent } as React.CSSProperties}
              onClick={() => selectPart(partId)}
            >
              <PartGlyph partId={partId} />
              <span>{part.shortName}</span>
              {placed && <span className="placed-check"><Check size={11} /></span>}
            </button>
          )
        })}
      </div>
      <div className="selected-part-detail">
        <span className="detail-dot" style={{ background: selected.color }} />
        <strong>{selected.name}</strong>
        <span>{selected.description}</span>
        <span className="fits-label">Fits: {selected.compatibleSlots.map((slot) => SLOT_LABELS[slot]).join(', ')}</span>
        <button
          className="quick-snap-button"
          onClick={() => placePart(selected.compatibleSlots[0])}
          disabled={placedIds.has(selectedPart)}
        >
          {placedIds.has(selectedPart) ? <><Check size={13} /> Attached</> : <>Snap it <ChevronRight size={13} /></>}
        </button>
      </div>
    </section>
  )
}

function PartGlyph({ partId }: { partId: PartId }) {
  if (partId.startsWith('motor')) return <Zap size={22} />
  if (partId === 'color_sensor') return <Bot size={22} />
  if (partId === 'seat') return <Gamepad2 size={22} />
  if (partId === 'battery') return <BatteryCharging size={22} />
  return <Wrench size={22} />
}

function CodeLab() {
  const speed = useGameStore((state) => state.program.speed)
  const stopOnRed = useGameStore((state) => state.program.stopOnRed)
  const setProgramSpeed = useGameStore((state) => state.setProgramSpeed)
  const setStopOnRed = useGameStore((state) => state.setStopOnRed)
  const setMode = useGameStore((state) => state.setMode)
  const connections = useGameStore((state) => state.connections)
  const hasSensor = connections.some((connection) => connection.partId === 'color_sensor')

  return (
    <section className="code-panel glass-card">
      <div className="panel-title">
        <div className="panel-icon purple"><Code2 size={20} /></div>
        <div>
          <span className="eyebrow">Code Lab</span>
          <h2>Give your rover a plan</h2>
        </div>
      </div>

      <div className="program-stack">
        <div className="code-block event-block">
          <span className="block-notch" />
          <Play size={17} fill="currentColor" />
          <strong>When program starts</strong>
        </div>

        <div className="code-block motor-block">
          <Zap size={17} />
          <span>Set both motors to</span>
          <strong>{speed}%</strong>
          <input
            type="range"
            min="25"
            max="90"
            step="5"
            value={speed}
            onChange={(event) => setProgramSpeed(Number(event.target.value))}
            aria-label="Motor speed"
          />
        </div>

        {stopOnRed ? (
          <div className="code-block sensor-block">
            <Bot size={17} />
            <span>Wait until sensor sees</span>
            <span className="red-swatch">red</span>
            <button className="remove-block" onClick={() => setStopOnRed(false)} aria-label="Remove stop block"><X size={14} /></button>
          </div>
        ) : (
          <button className="add-code-block" onClick={() => setStopOnRed(true)} disabled={!hasSensor}>
            <span className="add-symbol">+</span>
            {hasSensor ? 'Add “wait until red” block' : 'Attach the color sensor first'}
          </button>
        )}

        <div className={`code-block stop-block ${stopOnRed ? '' : 'muted-block'}`}>
          <CircleStop size={17} />
          <strong>Stop both motors</strong>
        </div>
      </div>

      <div className="code-tip">
        <Info size={17} />
        <span>The sensor reads the road from wherever you attached it. Watch its live value in Test mode.</span>
      </div>
      <button className="primary-button" onClick={() => setMode('test')}>
        Test this program <ChevronRight size={18} />
      </button>
    </section>
  )
}

function TestPanel() {
  const status = useGameStore((state) => state.simulationStatus)
  const telemetry = useGameStore((state) => state.telemetry)
  const program = useGameStore((state) => state.program)
  const connections = useGameStore((state) => state.connections)
  const start = useGameStore((state) => state.startSimulation)
  const pause = useGameStore((state) => state.stopSimulation)
  const reset = useGameStore((state) => state.resetSimulation)
  const setMode = useGameStore((state) => state.setMode)
  const assembly = useMemo(() => compileAssembly(connections), [connections])
  const colorLabel = telemetry.sensorColor === 'none' ? 'No reading' : telemetry.sensorColor

  return (
    <section className="test-panel glass-card">
      <div className="panel-title">
        <div className="panel-icon teal"><Gauge size={21} /></div>
        <div>
          <span className="eyebrow">Test Arena</span>
          <h2>Watch what the rover knows</h2>
        </div>
      </div>

      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span>Color sensor</span>
          <strong className={`sensor-value ${telemetry.sensorColor}`} aria-live="polite"><i /> {colorLabel}</strong>
        </div>
        <div className="telemetry-item">
          <span>Motor A + B</span>
          <strong>{telemetry.motorSpeed}%</strong>
        </div>
        <div className="telemetry-item">
          <span>Distance</span>
          <strong>{telemetry.distanceTravelled.toFixed(1)} m</strong>
        </div>
        <div className="telemetry-item">
          <span>Assembly mass</span>
          <strong>{assembly.totalMass.toFixed(1)} kg</strong>
        </div>
      </div>

      <div className={`program-check ${program.stopOnRed ? 'good' : 'warning'}`}>
        {program.stopOnRed ? <CheckCircle2 size={18} /> : <Info size={18} />}
        <span>{program.stopOnRed ? 'Red stop behavior is active.' : 'This program never checks the color sensor.'}</span>
      </div>

      <div className="simulation-controls">
        {status === 'running' ? (
          <button className="secondary-button" onClick={pause}><Pause size={18} /> Pause</button>
        ) : (
          <button className="primary-button" onClick={start}><Play size={18} fill="currentColor" /> {status === 'stopped' ? 'Run again' : 'Start test'}</button>
        )}
        <button className="secondary-button" onClick={reset}><RotateCcw size={18} /> Reset</button>
      </div>
      <button className="play-next-button" onClick={() => setMode('play')} disabled={!assembly.readyForMission || !program.stopOnRed}>
        <Gamepad2 size={18} />
        {!assembly.readyForMission ? 'Finish the rover to enter Play mode' : !program.stopOnRed ? 'Add the red stop block first' : 'Enter the world and ride'}
      </button>
    </section>
  )
}

function PlayHud() {
  const boarded = useGameStore((state) => state.isBoarded)
  const status = useGameStore((state) => state.simulationStatus)
  const telemetry = useGameStore((state) => state.telemetry)

  return (
    <div className="play-hud">
      <div className="control-hint glass-card">
        <span className="key-cluster"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>
        <span>Move</span>
        <span className="hint-divider" />
        <kbd>E</kbd>
        <span>{boarded ? 'Hop out' : 'Board rover'}</span>
      </div>
      <div className="ride-status glass-card">
        <span className={`status-light ${status}`} />
        <div>
          <span>{boarded ? 'Riding your creation' : 'Walk to the orange seat'}</span>
          <strong>{status === 'running' ? `${telemetry.motorSpeed}% power` : 'Program waiting'}</strong>
        </div>
      </div>
    </div>
  )
}

function Toast() {
  const toast = useGameStore((state) => state.toast)
  const showToast = useGameStore((state) => state.showToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => showToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [showToast, toast])

  if (!toast) return null
  return <div className="toast" role="status" aria-live="polite"><Sparkles size={17} /> {toast}</div>
}

function CompletionOverlay() {
  const complete = useGameStore((state) => state.missionComplete)
  const reset = useGameStore((state) => state.resetSimulation)
  const setMode = useGameStore((state) => state.setMode)
  if (!complete) return null

  return (
    <div className="completion-backdrop">
      <div className="completion-card" role="dialog" aria-modal="true" aria-labelledby="completion-title">
        <div className="success-orbit"><Zap size={34} fill="currentColor" /></div>
        <span className="eyebrow">Mission complete</span>
        <h1 id="completion-title">The lighthouse is alive!</h1>
        <p>You built it, programmed it, tested it, and rode it all the way here.</p>
        <div className="completion-badges">
          <span><Wrench size={16} /> Builder</span>
          <span><Code2 size={16} /> Coder</span>
          <span><Gamepad2 size={16} /> Explorer</span>
        </div>
        <div className="completion-actions">
          <button className="secondary-button" onClick={() => { reset(); setMode('build') }}><Wrench size={18} /> Keep building</button>
          <button className="primary-button" onClick={() => { reset(); setMode('play') }}><RotateCcw size={18} /> Ride again</button>
        </div>
      </div>
    </div>
  )
}

function App() {
  useSoundFeedback()
  const mode = useGameStore((state) => state.mode)
  const connections = useGameStore((state) => state.connections)
  const assembly = useMemo(() => compileAssembly(connections), [connections])
  const corePartCount = REQUIRED_SLOTS.filter((slot) => connections.some((connection) => connection.slotId === slot)).length

  return (
    <main className={`app-shell mode-${mode}`}>
      <div className="scene-layer"><RoverIslandScene /></div>

      <header className="top-bar">
        <div className="brand-lockup">
          <div className="brand-mark"><Bot size={22} /></div>
          <div>
            <span className="brand-name">Rover Island</span>
            <span className="brand-subtitle">A BuildQuest prototype</span>
          </div>
        </div>
        <ModeNavigation />
        <div className={`build-readiness ${assembly.readyForMission ? 'ready' : ''}`}>
          <span>{assembly.readyForMission ? <Check size={15} /> : `${corePartCount}/5`}</span>
          {assembly.readyForMission ? 'Mission ready' : 'Core parts'}
        </div>
      </header>

      {mode !== 'play' && <MissionCard />}
      {mode === 'build' && <BuildTray />}
      {mode === 'code' && <CodeLab />}
      {mode === 'test' && <TestPanel />}
      {mode === 'play' && <PlayHud />}
      <Toast />
      <CompletionOverlay />
    </main>
  )
}

export default App
