import { CarFront, Check, CodeXml, Paintbrush, PenLine, Play, Plug, RotateCw, Wrench } from 'lucide-react'
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { PartThumbnail } from '../../brick/PartThumbnail'
import { BRICK_PART_MAP } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import { LIVE_ROOM_CODE_LINE, useCodeView } from '../code/codeViewState'
import { useDriveView } from '../drive/driveViewState'
import { readiness } from '../drive/readiness'
import { useLastTryRow } from '../drive/tryOutcome'
import type { TriedIcon } from '../guide/nextSteps'
import { runStepAction } from '../guide/actions'
import { FIRST_IDEAS_DONE, nextSteps, type NextStep, type StepIcon } from '../guide/nextSteps'
import { deriveCandidate, driveSidesOf, type DerivedCreation, type DerivedHinge, type DerivedMotor } from '../model/creations'
import { installPaintMode } from '../paint/paint'
import { PaintBar, PaintRow } from '../paint/PaintRow'
import { isDeviceRole, roboticsSpec } from '../parts/catalog'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { useStageStore } from '../state/stageStore'
import { DeviceInspector } from '../wiring/DeviceInspector'
import { WiringModeToggle } from '../wiring/WiringModeToggle'
import { Fold } from './Fold'
import { installRobotFocusWatcher, useFocusedCreation } from './robotFocus'
import './robotics.css'

/** The Code view (Blockly and all) loads only when a creation is opened in it. */
const CodeView = lazy(() => import('../code/CodeView'))
/** The Drive view (Drive / Try it) loads only when a robot is opened in it. */
const DriveView = lazy(() => import('../drive/DriveView'))

/**
 * The Robot Workshop's build-mode panels (kid-UX pass, docs/robotics/KID-UX.md §G): the
 * assisted-wiring line, the short "You started a robot!" card, and the robot's panel —
 * its name, a big Drive / Try it and Code, the next steps, then Parts and More (run
 * space, wiring mode, motor tests) folded away. Everything shown is derived from the
 * bricks and the document's robotics section; the panels report structure and never
 * edit it, apart from names, cables and the run space, which are the student's own words.
 */
export function RoboticsPanel({ compact = false, live = false }: { compact?: boolean; live?: boolean }) {
  useEffect(() => {
    installRoboticsWatcher()
    // Lane P: the panel follows the robot the student touches; paint mode.
    installRobotFocusWatcher()
    installPaintMode()
    // Dev-only hook for the QA harnesses (scripts/qa/robotics-*.mjs): the stores, plus what
    // the scene layer adds (a world→screen projector, so a harness can aim a real pointer at a socket).
    if (import.meta.env.DEV) {
      const host = window as unknown as { __robotics?: Record<string, unknown> }
      host.__robotics = Object.assign(host.__robotics ?? {}, { brickStore: useBrickStore, roboticsStore: useRoboticsStore, stageStore: useStageStore, codeView: useCodeView, driveView: useDriveView })
    }
  }, [])
  const card = useRoboticsStore((state) => state.card)
  const coding = useCodeView((state) => state.creationId !== null)
  const driving = useDriveView((state) => state.creationId !== null)
  // Contract §8: no Code or Run in a live room.
  useEffect(() => { if (live && coding) useCodeView.getState().closeCode() }, [live, coding])
  if (coding && !live) return <Suspense fallback={null}><CodeView /></Suspense>
  if (driving) return <Suspense fallback={null}><DriveView live={live} /></Suspense>
  return (
    <>
      <WiringLine />
      {card ? <CreationCard compact={compact} /> : <CreationPanel compact={compact} live={live} />}
      <PaintBar />
    </>
  )
}

function WiringLine() {
  const note = useRoboticsStore((state) => state.wiringNote)
  const dismiss = useRoboticsStore((state) => state.dismissWiringNote)
  const undo = useRoboticsStore((state) => state.undoWiring)
  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(dismiss, 9000)
    return () => window.clearTimeout(timer)
  }, [note, dismiss])
  if (!note) return null
  return (
    <div className="robotics-wiring-line" role="status" data-testid="robotics-wiring-line">
      <span>{note.text}</span>
      {note.undoable && <button type="button" className="robotics-link-button" onClick={undo}>Undo</button>}
      <button type="button" className="robotics-link-button" aria-label="Dismiss" onClick={dismiss}>×</button>
    </div>
  )
}

function useCardCreation(): DerivedCreation | null {
  const card = useRoboticsStore((state) => state.card)
  const model = useRoboticsStore((state) => state.model)
  return useMemo(() => {
    if (!card) return null
    if (card.creationId) return model.creations.find((creation) => creation.id === card.creationId) ?? null
    // The candidate is derived exactly like a saved creation would be.
    return deriveCandidate(model.input, card.anchorBrickIds, card.suggestedName)
  }, [card, model])
}

/**
 * The card a first robotics part opens (contract §4): a title, the robot's name with a good
 * default, and one button to keep building. What joined means sits behind the "?". Later
 * parts never reopen it; joining two robots does (they become one).
 */
function CreationCard({ compact }: { compact: boolean }) {
  const card = useRoboticsStore((state) => state.card)!
  const creation = useCardCreation()
  const confirm = useRoboticsStore((state) => state.confirmCard)
  const [name, setName] = useState(card.suggestedName)
  const [why, setWhy] = useState(false)
  const whyId = useId()
  useEffect(() => { setName(card.suggestedName) }, [card.suggestedName, card.placedBrickId])
  if (!creation) return null
  const joining = card.joining
  const title = joining ? `${joinNames(joining.names)} are one robot now!` : card.creationId ? 'Name your robot' : 'You started a robot!'
  const swings = creation.hinges.some((hinge) => !hinge.locked && hinge.armBrickIds.length > 0)
  const stuck = creation.hinges.some((hinge) => hinge.locked)
  const submit = (event: FormEvent) => { event.preventDefault(); confirm(name, false) }
  return (
    <aside className={`robotics-card${compact ? ' compact' : ''}`} aria-label={joining ? 'Robots joined' : 'New robot'} data-testid="robotics-creation-card" data-popover-avoid="">
      <form className="robotics-card-form" onSubmit={submit}>
        <header className="robotics-card-head">
          <strong>{title}</strong>
          <button type="button" className="robotics-help-button" aria-expanded={why} aria-controls={whyId} aria-label={why ? 'Hide what this means' : 'What does this mean?'} onClick={() => setWhy(!why)} data-testid="robotics-card-why">?</button>
        </header>
        {why && (
          <div className="robotics-card-why" id={whyId}>
            <p>{joining ? 'Bricks joined by studs move together, so these are one robot now. Their code comes too.' : 'Bricks joined by studs move together. The blue bricks are your robot.'}</p>
            {swings && <p>The coral bricks swing on the hinge motor.</p>}
            {stuck && <p>The red bricks hold the arm, so it can’t swing.</p>}
            <p>To add a brick to it, attach it to the robot.</p>
          </div>
        )}
        <label className="robotics-field">
          Robot name
          <input type="text" aria-label="Robot name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="off" />
        </label>
        <button type="submit" className="robotics-big-button primary robotics-card-go">Keep building</button>
      </form>
    </aside>
  )
}

function joinNames(names: string[]) {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function roleTitle(role: string | undefined) {
  switch (role) {
    case 'hub': return 'Hub'
    case 'motor': return 'Motor'
    case 'hinge-motor': return 'Hinge motor'
    case 'distance-sensor': return 'Sensor'
    case 'light': return 'Light'
    case 'button': return 'Button'
    case 'wheel': return 'Wheel'
    case 'axle': return 'Axle'
    case 'seat': return 'Seat'
    default: return 'Part'
  }
}

function CreationPanel({ compact, live }: { compact: boolean; live: boolean }) {
  const creation = useFocusedCreation()
  const selectedId = useBrickStore((state) => state.selectedId)
  const bricks = useBrickStore((state) => state.bricks)
  const [collapsed, setCollapsed] = useState(false)
  const [partsOpen, setPartsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const reasonId = useId()
  // A part picked: its card sits under the next step, so the panel shows its top (lane P).
  const aside = useRef<HTMLElement>(null)
  useEffect(() => { if (selectedId) aside.current?.scrollTo?.({ top: 0 }) }, [selectedId])
  const selected = selectedId ? bricks.find((brick) => brick.id === selectedId) ?? null : null
  const selectedSpec = selected ? roboticsSpec(selected.partId) : null
  if (!creation && !selectedSpec) return null
  const inspector = selected && selectedSpec
    ? (isDeviceRole(selectedSpec.role) ? <DeviceInspector brickId={selected.id} creation={creation} /> : <SelectedPart creation={creation} brickId={selected.id} role={selectedSpec.role} />)
    : null
  return (
    <aside ref={aside} className={`robotics-panel${compact ? ' compact' : ''}${collapsed ? ' collapsed' : ''}`} aria-label="Robot" data-testid="robotics-panel" data-popover-avoid="">
      <header className="robotics-panel-head">
        {creation ? <RobotName key={creation.id} creation={creation} /> : <strong className="robotics-panel-title">Robot part</strong>}
        <button type="button" className="robotics-link-button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'Show' : 'Hide'}</button>
      </header>
      {!collapsed && (
        <>
          {creation && <PlayButtons creation={creation} live={live} reasonId={reasonId} />}
          {creation && live && <p className="robotics-live-line" data-testid="robotics-live-code-line">{LIVE_ROOM_CODE_LINE}</p>}
          {/* A part the student picked: only the step that matters now stays above its panel. */}
          {creation && <NextSteps creation={creation} live={live} focus={inspector !== null} reasonId={reasonId} />}
          {inspector}
          {creation && <PaintRow creation={creation} />}
          {creation && (
            <Fold title="Parts" note={creation.lines.attached} open={partsOpen} onToggle={() => setPartsOpen(!partsOpen)} testId="robotics-parts-fold">
              <ul className="robotics-lines">
                <li>{creation.lines.attached} · {creation.lines.parts}</li>
                <DriveSidesLines creation={creation} />
              </ul>
              <PartRows creation={creation} selectedId={selectedId} />
            </Fold>
          )}
          {creation && (
            <Fold title="More" open={moreOpen} onToggle={() => setMoreOpen(!moreOpen)} testId="robotics-more-fold">
              <RunSpace creation={creation} />
              <WiringModeToggle />
              <NudgeControls creation={creation} />
            </Fold>
          )}
        </>
      )}
    </aside>
  )
}

/** The robot's name, the student's own: edited in place, saved on Enter or when the field is left. */
function RobotName({ creation }: { creation: DerivedCreation }) {
  const rename = useRoboticsStore((state) => state.renameCreation)
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      aria-label="Robot name"
      className="robotics-name"
      maxLength={40}
      autoComplete="off"
      value={draft ?? creation.name}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { if (draft !== null && draft.trim() && draft !== creation.name) rename(creation.id, draft); setDraft(null) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        if (event.key === 'Escape') { setDraft(null); (event.target as HTMLInputElement).blur() }
      }}
    />
  )
}

/** Drive (a rover) or Try it (a gate, a signal light), on only when the robot is ready; Code beside it. */
function PlayButtons({ creation, live, reasonId }: { creation: DerivedCreation; live: boolean; reasonId: string }) {
  const status = readiness(creation)
  const playable = status.ready && !live
  return (
    <div className="robotics-play">
      {status.kind && (
        <button
          type="button"
          className={`robotics-big-button robotics-play-button${status.ready ? ' ready' : ''}`}
          disabled={!playable}
          aria-describedby={!status.ready ? reasonId : undefined}
          title={!status.ready ? status.reason ?? undefined : undefined}
          onClick={() => useDriveView.getState().openDrive(creation.id)}
          data-testid="robotics-play-button"
        >
          {status.kind === 'drive' ? <CarFront size={22} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
          {status.kind === 'drive' ? 'Drive' : 'Try it'}
        </button>
      )}
      <button type="button" className="robotics-big-button robotics-code-button" onClick={() => useCodeView.getState().openCode(creation.id)} disabled={live} data-testid="robotics-code-button">
        <CodeXml size={20} aria-hidden="true" />
        Code
      </button>
    </div>
  )
}

/**
 * The robot's next steps as big rows: done ones checked, the one to do now highlighted,
 * the ones after it still tappable (a student may build in any order). Once the robot is
 * ready only "Ready to drive!" (or "Ready to try!") stays, and ideas follow. With a part
 * picked, only the step to do now stays above that part's panel.
 */
function NextSteps({ creation, live, focus, reasonId }: { creation: DerivedCreation; live: boolean; focus: boolean; reasonId: string }) {
  const model = useRoboticsStore((state) => state.model)
  // Kid lane Y: after a try, the ready row says what happened ("It worked! Try it again").
  const tried = useLastTryRow(creation.id)
  const rows = useMemo(() => nextSteps(creation, model, { tried }), [creation, model, tried])
  const path = rows.filter((row) => row.group === 'step')
  const choices = rows.filter((row) => row.group === 'choice')
  const ideas = rows.filter((row) => row.group === 'idea')
  const ready = path.some((row) => row.id === 'ready' && row.state === 'current')
  // Once it is ready the checked steps have done their job: "Ready to drive!" and the ideas take their place.
  const shown = focus || ready ? path.filter((row) => row.state === 'current') : path
  const headingId = useId()
  return (
    <section className="robotics-steps" aria-labelledby={headingId} data-testid="robotics-next-steps">
      <h3 className="robotics-section-title" id={headingId}>{shown.length === 1 && shown[0].state !== 'done' ? 'Next step' : 'Next steps'}</h3>
      {shown.length > 0 && (
        <ol className="robotics-step-list">
          {shown.map((row) => <StepRow key={row.id} row={row} live={live} textId={row.state === 'current' && row.id !== 'ready' ? reasonId : undefined} />)}
        </ol>
      )}
      {choices.length > 0 && (
        <>
          <h4 className="robotics-subtitle">What should it do?</h4>
          <ul className="robotics-step-list">{choices.map((row) => <StepRow key={row.id} row={row} live={live} />)}</ul>
        </>
      )}
      {ready && !focus && ideas.length > 0 && (
        <>
          <h4 className="robotics-subtitle">{ideas.some((row) => row.text === FIRST_IDEAS_DONE) ? 'More ideas' : 'Make it yours'}</h4>
          <ul className="robotics-step-list" data-testid="robotics-ideas">{ideas.map((row) => <StepRow key={row.id} row={row} live={live} />)}</ul>
        </>
      )}
    </section>
  )
}

function StepRow({ row, live, textId }: { row: NextStep; live: boolean; textId?: string }) {
  const body = (
    <>
      <StepIconView icon={row.icon} />
      <span className="robotics-step-text" id={textId}>
        {row.text}
        {row.hint && <small>{row.hint}</small>}
      </span>
    </>
  )
  if (row.state === 'done' && row.action) {
    // A "Make it yours" idea done once can be done again (paint it again, rename it…): still a button, with its tick.
    const again = row.action
    return (
      <li className="robotics-step done again" data-step={row.id} data-state="done">
        <button type="button" className="robotics-step-button again" disabled={live && again.kind === 'code'} onClick={() => runStepAction(again)}>
          <span className="robotics-step-check" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
          <span className="robotics-step-text">{row.text}</span>
          <span className="visually-hidden"> (done)</span>
        </button>
      </li>
    )
  }
  if (row.state === 'done') {
    return (
      <li className="robotics-step done" data-step={row.id} data-state="done">
        <span className="robotics-step-check" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
        <span className="robotics-step-text">{row.text}</span>
        <span className="visually-hidden"> (done)</span>
      </li>
    )
  }
  if (!row.action) return <li className={`robotics-step waiting ${row.state}`} data-step={row.id} data-state={row.state}>{body}</li>
  const action = row.action
  return (
    <li className={`robotics-step ${row.state}`} data-step={row.id} data-state={row.state}>
      <button
        type="button"
        className={`robotics-step-button ${row.state}`}
        aria-current={row.state === 'current' ? 'step' : undefined}
        disabled={live && (action.kind === 'play' || action.kind === 'code')}
        onClick={() => runStepAction(action)}
      >
        {body}
      </button>
    </li>
  )
}

function StepIconView({ icon }: { icon: StepIcon | TriedIcon }) {
  if ('symbol' in icon && icon.symbol === 'worked') return <span className="robotics-step-icon symbol worked" aria-hidden="true"><Check size={22} /></span>
  if ('part' in icon) {
    const part = BRICK_PART_MAP[icon.part]
    if (part) return <span className="robotics-step-icon" aria-hidden="true"><PartThumbnail part={part} /></span>
  }
  const symbol = 'symbol' in icon ? icon.symbol : 'fix'
  const Icon = symbol === 'plug' ? Plug : symbol === 'drive' ? CarFront : symbol === 'try' ? Play : symbol === 'turn' ? RotateCw : symbol === 'paint' ? Paintbrush : symbol === 'name' ? PenLine : symbol === 'code' ? CodeXml : Wrench
  return <span className={`robotics-step-icon symbol ${symbol}`} aria-hidden="true"><Icon size={22} /></span>
}

function RunSpace({ creation }: { creation: DerivedCreation }) {
  const setTestSpace = useRoboticsStore((state) => state.setTestSpace)
  return (
    <div className="robotics-space" role="group" aria-label="Where it runs">
      <span>Where it runs</span>
      <button type="button" className={`robotics-chip${creation.testSpace === 'testPlate' ? ' active' : ''}`} aria-pressed={creation.testSpace === 'testPlate'} onClick={() => setTestSpace(creation.id, 'testPlate')}>Test plate</button>
      <button type="button" className={`robotics-chip${creation.testSpace === 'myWorld' ? ' active' : ''}`} aria-pressed={creation.testSpace === 'myWorld'} onClick={() => setTestSpace(creation.id, 'myWorld')}>My world</button>
    </div>
  )
}

function motorName(creation: DerivedCreation, id: string) {
  return creation.motors.find((motor) => motor.brickId === id)?.name ?? 'motor'
}

/**
 * Which motors drive on each side (every motor with a wheel on the drive axis: a four-wheel car's
 * four), and which of them face the other way: the same power turns their wheels backward, which
 * Drive and the drive block take care of.
 */
function DriveSidesLines({ creation }: { creation: DerivedCreation }) {
  const sides = driveSidesOf(creation)
  if (!sides) return null
  const names = (ids: readonly string[]) => joinNames(ids.map((id) => motorName(creation, id)))
  return (
    <>
      <li data-testid="robotics-drive-sides">Left side: {names(sides.left)} · Right side: {names(sides.right)}</li>
      {sides.reversedIds.length > 0 && <li>{names(sides.reversedIds)} {sides.reversedIds.length === 1 ? 'faces' : 'face'} the other way</li>}
    </>
  )
}

/** A picked axle, wheel or seat (devices get the wiring inspector instead). */
function SelectedPart({ creation, brickId, role }: { creation: DerivedCreation | null; brickId: string; role: string }) {
  const model = useRoboticsStore((state) => state.model)
  let text: string
  if (role === 'wheel') {
    const wheel = creation?.wheels.find((candidate) => candidate.brickId === brickId) ?? null
    text = wheel ? (wheel.onAxle ? `On an axle${wheel.motorId ? ` in ${motorName(creation!, wheel.motorId)}` : ' with no motor'}` : wheel.note ?? 'Not on an axle') : 'Not on an axle. Put it on the end of an axle.'
  } else if (role === 'axle') {
    const axle = model.creations.flatMap((candidate) => candidate.axles).find((candidate) => candidate.brickId === brickId)
    text = axle ? `${axle.motorId ? `In ${motorName(creation!, axle.motorId)}` : 'Not in a motor'} · ${axle.wheelIds.length ? `${axle.wheelIds.length} wheel${axle.wheelIds.length === 1 ? '' : 's'} on it` : 'no wheel on it'}` : 'Not in a motor. Put it in a motor’s axle hole.'
  } else if (role === 'seat') {
    text = creation?.seats.includes(brickId) ? `On ${creation.name}. In Explore, walk up and press E to ride.` : 'Put it on a robot to ride it in Explore.'
  } else {
    text = creation ? `Part of ${creation.name}` : 'Not part of a robot yet'
  }
  return <p className="robotics-selected" data-testid="robotics-selected-part"><strong>{roleTitle(role) === 'Part' ? role : roleTitle(role)}</strong> · {text}</p>
}

function describeMotor(motor: DerivedMotor) {
  const chain = motor.axleId ? (motor.wheelIds.length ? 'axle and wheel on it' : 'axle in it, no wheel') : 'no axle yet'
  const plugged = motor.plugged ? 'plugged in' : 'Not plugged in'
  // A mirror-mounted motor turns its wheel the other way for the same power: Drive and the drive block handle it.
  const drives = motor.drives === 'backward' ? ' · faces the other way' : motor.drives === 'sideways' ? ' · pushes sideways' : ''
  return `${chain} · ${plugged}${drives}`
}

function describeHinge(hinge: DerivedHinge) {
  const plugged = hinge.plugged ? 'plugged in' : 'Not plugged in'
  if (hinge.locked) return `arm stuck to the frame, so it can't swing · ${plugged}`
  if (!hinge.armBrickIds.length) return `no arm on it yet · ${plugged}`
  return `swings ${hinge.armBrickIds.length} ${hinge.armBrickIds.length === 1 ? 'brick' : 'bricks'} · ${plugged}`
}

function PartRows({ creation, selectedId = null }: { creation: DerivedCreation; selectedId?: string | null }) {
  const hingeReports = useRoboticsStore((state) => state.hingeReports)
  const rows: { id: string; text: string; tone?: 'warn' | 'bad'; ports?: { port: string; device: string | null }[] }[] = []
  const devices = [...creation.motors, ...creation.hinges, ...creation.sensors, ...creation.lights, ...creation.buttons]
  for (const hub of creation.hubs) rows.push({ id: hub.brickId, text: `${hub.name} · plugs`, ports: (['A', 'B', 'C', 'D'] as const).map((port) => ({ port, device: devices.find((device) => device.port?.hubId === hub.brickId && device.port.port === port)?.name ?? null })) })
  for (const motor of creation.motors) rows.push({ id: motor.brickId, text: `${motor.name} · ${describeMotor(motor)}`, tone: motor.plugged ? undefined : 'warn' })
  for (const hinge of creation.hinges) {
    const report = hingeReports[hinge.brickId]
    // Open or shut, not degrees (a 9-year-old does not read "°", lane P); open past the Try it view's 20°.
    rows.push({ id: hinge.brickId, text: `${hinge.name} · ${describeHinge(hinge)}${report ? ` · ${Math.abs(report.angle) >= 20 ? 'open' : 'shut'}${report.blocked ? ' · blocked' : ''}` : ''}`, tone: hinge.locked ? 'bad' : hinge.plugged ? undefined : 'warn' })
  }
  for (const wheel of creation.wheels) rows.push({ id: wheel.brickId, text: `Wheel · ${wheel.onAxle ? `on an axle${wheel.motorId ? ` in ${motorName(creation, wheel.motorId)}` : ''}` : wheel.note ?? 'Not on an axle'}`, tone: wheel.onAxle ? undefined : 'bad' })
  for (const sensor of creation.sensors) rows.push({ id: sensor.brickId, text: `${sensor.name} · faces ${sensor.facing} · ${sensor.plugged ? 'plugged in' : 'Not plugged in'}`, tone: sensor.plugged ? undefined : 'warn' })
  for (const device of [...creation.lights, ...creation.buttons]) rows.push({ id: device.brickId, text: `${device.name} · ${device.plugged ? 'plugged in' : 'Not plugged in'}`, tone: device.plugged ? undefined : 'warn' })
  if (!rows.length) return null
  return (
    <ul className="robotics-parts" aria-label="Parts found">
      {rows.map((row) => (
        <li key={row.id} className={`${row.tone ?? ''}${row.id === selectedId ? ' selected' : ''}`} data-brick-id={row.id}>
          {row.text}
          {row.ports && (
            <span className="robotics-port-chips">
              {row.ports.map(({ port, device }) => <span key={port} className={`robotics-port-chip${device ? ' used' : ''}`} title={device ? `Port ${port}: ${device}` : `Port ${port}: free`} aria-label={device ? `Port ${port}, ${device}` : `Port ${port}, free`}>{port}</span>)}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Motor tests without code (the checkpoint-1 mechanics check), kept in More for grown-ups and curious
 * builders, in plain words: spin, swing open, shut (no percents or degrees; lane P). The powers and
 * angles are the ones they always were: 40 %, ±60°, 0°.
 */
function NudgeControls({ creation }: { creation: DerivedCreation }) {
  const sim = useRoboticsStore((state) => state.sim)
  const simLoading = useRoboticsStore((state) => state.simLoading)
  const startSim = useRoboticsStore((state) => state.startSim)
  const nudgeMotor = useRoboticsStore((state) => state.nudgeMotor)
  const nudgeHinge = useRoboticsStore((state) => state.nudgeHinge)
  const driveForward = useRoboticsStore((state) => state.driveForward)
  const stopAll = useRoboticsStore((state) => state.stopAll)
  const resetSim = useRoboticsStore((state) => state.resetSim)
  const contacts = useRoboticsStore((state) => state.contacts)
  const running = sim?.creationId === creation.id
  const ensure = async () => { if (!running) await startSim(creation.id) }
  const nudgeable = creation.motors.length > 0 || creation.hinges.length > 0
  if (!nudgeable) return null
  return (
    <section className="robotics-nudge" aria-label="Test the motors">
      <header><strong>Test the motors</strong><span>no code needed</span></header>
      {creation.drivePair && (
        <div className="robotics-nudge-row">
          <button type="button" className="studio-button" onClick={async () => { await ensure(); driveForward(creation.id, 0.4) }}>Drive forward</button>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); driveForward(creation.id, -0.4) }}>Drive back</button>
        </div>
      )}
      {creation.motors.map((motor) => (
        <div className="robotics-nudge-row" key={motor.brickId}>
          <span className="robotics-nudge-label">{motor.name}</span>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeMotor(motor.brickId, 0.4) }}>Spin</button>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeMotor(motor.brickId, -0.4) }}>Spin back</button>
          <button type="button" className="studio-button" onClick={() => nudgeMotor(motor.brickId, 0)} disabled={!running}>Stop</button>
        </div>
      ))}
      {creation.hinges.map((hinge) => (
        <div className="robotics-nudge-row" key={hinge.brickId}>
          <span className="robotics-nudge-label">{hinge.name}</span>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeHinge(hinge.brickId, 60) }}>Swing open</button>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeHinge(hinge.brickId, -60) }}>Swing the other way</button>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeHinge(hinge.brickId, 0) }}>Shut</button>
        </div>
      ))}
      <div className="robotics-nudge-row">
        <button type="button" className="studio-button" onClick={stopAll} disabled={!running}>Stop all</button>
        <button type="button" className="studio-button" onClick={resetSim} disabled={!running} data-testid="robotics-reset">Reset</button>
        <span className="robotics-nudge-status" data-testid="robotics-sim-status">{simLoading ? 'Starting…' : running ? 'Running' : 'Stopped'}</span>
      </div>
      {running && contacts.length > 0 && (
        <p className="robotics-contact" data-testid="robotics-contact">The arm is touching {contacts.map((contact) => (contact.otherBrickId ? 'a brick' : 'the plate')).slice(0, 1)}.</p>
      )}
    </section>
  )
}
