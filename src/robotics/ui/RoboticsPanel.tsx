import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useBrickStore } from '../../brick/store'
import { LIVE_ROOM_CODE_LINE, useCodeView } from '../code/codeViewState'
import { deriveCandidate, type DerivedCreation, type DerivedHinge, type DerivedMotor } from '../model/creations'
import { isDeviceRole, roboticsSpec } from '../parts/catalog'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { useStageStore } from '../state/stageStore'
import { DeviceInspector } from '../wiring/DeviceInspector'
import { WiringModeToggle } from '../wiring/WiringModeToggle'
import './robotics.css'

/** The Code view (Blockly and all) loads only when a creation is opened in it. */
const CodeView = lazy(() => import('../code/CodeView'))

/**
 * The Robot Workshop's build-mode panels (checkpoint 1): the assisted-wiring line,
 * the creation card (contract §4, mock board 1b) and the creation panel with the
 * dev-only mechanics Nudge. Everything shown is derived from the bricks and the
 * document's robotics section; the panels report structure and never edit it, apart
 * from names, cables and the run space, which are the student's own words.
 */
export function RoboticsPanel({ compact = false, live = false }: { compact?: boolean; live?: boolean }) {
  useEffect(() => {
    installRoboticsWatcher()
    // Dev-only hook for the QA harnesses (scripts/qa/robotics-spike-cp1*.mjs): the stores, plus what
    // the scene layer adds (a world→screen projector, so a harness can aim a real pointer at a socket).
    if (import.meta.env.DEV) {
      const host = window as unknown as { __robotics?: Record<string, unknown> }
      host.__robotics = Object.assign(host.__robotics ?? {}, { brickStore: useBrickStore, roboticsStore: useRoboticsStore, stageStore: useStageStore, codeView: useCodeView })
    }
  }, [])
  const card = useRoboticsStore((state) => state.card)
  const coding = useCodeView((state) => state.creationId !== null)
  // Contract §8: no Code or Run in a live room.
  useEffect(() => { if (live && coding) useCodeView.getState().closeCode() }, [live, coding])
  if (coding && !live) return <Suspense fallback={null}><CodeView /></Suspense>
  return (
    <>
      <WiringLine />
      {card ? <CreationCard compact={compact} live={live} /> : <CreationPanel compact={compact} live={live} />}
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

function CreationCard({ compact, live }: { compact: boolean; live: boolean }) {
  const card = useRoboticsStore((state) => state.card)!
  const creation = useCardCreation()
  const close = useRoboticsStore((state) => state.closeCard)
  const confirm = useRoboticsStore((state) => state.confirmCard)
  const bricks = useBrickStore((state) => state.bricks)
  const [name, setName] = useState(card.suggestedName)
  useEffect(() => { setName(card.suggestedName) }, [card.suggestedName, card.placedBrickId])
  if (!creation) return null
  const placed = bricks.find((brick) => brick.id === card.placedBrickId)
  const placedRole = placed ? roboticsSpec(placed.partId)?.role : undefined
  const title = card.creationId ? `${roleTitle(placedRole)} added to ${creation.name}` : `${roleTitle(placedRole)} added`
  const subtitle = creation.hinges.length ? 'This creation has a part that swings.' : creation.kind === 'signal' ? 'This creation can sense and signal.' : 'This creation can be coded.'
  const baseBodies = creation.bodies.filter((body) => !creation.armBodyIds.includes(body.id))
  const baseCount = baseBodies.reduce((total, body) => total + body.brickIds.filter((id) => !creation.hinges.some((hinge) => hinge.armBrickIds.includes(id))).length, 0)
  const armCount = creation.hinges.reduce((total, hinge) => total + hinge.armBrickIds.length, 0)
  return (
    <aside className={`robotics-card${compact ? ' compact' : ''}`} aria-label={card.creationId ? 'Creation' : 'New creation'} data-testid="robotics-creation-card">
      <header className="robotics-card-head">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </header>
      <label className="robotics-field">
        Name it
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} aria-label="Creation name" />
      </label>
      <div className="robotics-structure">
        <div className="robotics-structure-row"><strong>{creation.lines.attached}</strong><span className="robotics-pill blue">highlighted in blue</span></div>
        {creation.hinges.length > 0 && !creation.hinges.every((hinge) => hinge.locked) && (
          <div className="robotics-structure-row"><span><strong>{armCount} {armCount === 1 ? 'brick swings' : 'bricks swing'}</strong> on the hinge · {baseCount} {baseCount === 1 ? 'stays' : 'stay'} put</span><span className="robotics-pill coral">highlighted in coral</span></div>
        )}
        {creation.hinges.some((hinge) => hinge.locked) && (
          <div className="robotics-structure-row"><span><strong>The arm is built into the frame</strong></span><span className="robotics-pill red">contact highlighted</span></div>
        )}
        <p>Bricks joined by studs move together. To include a brick, attach it. This card reports what is joined; it doesn't change it.</p>
      </div>
      <ul className="robotics-lines">
        <li><span className="robotics-check">✓</span>{creation.lines.parts}</li>
        <li><span className="robotics-dot">·</span>{creation.lines.ready}</li>
      </ul>
      <PartRows creation={creation} compact />
      <WiringModeToggle />
      <div className="robotics-card-actions">
        <button type="button" className="studio-button" onClick={() => { confirm(name, false); close() }}>Not now</button>
        <button type="button" className="studio-button studio-button-primary" onClick={() => confirm(name, true)} disabled={live}>Code this creation</button>
      </div>
      {live && <p className="robotics-live-line" data-testid="robotics-live-code-line">{LIVE_ROOM_CODE_LINE}</p>}
    </aside>
  )
}

function roleTitle(role: string | undefined) {
  switch (role) {
    case 'hub': return 'Hub'
    case 'motor': return 'Motor'
    case 'hinge-motor': return 'Hinge motor'
    case 'distance-sensor': return 'Distance sensor'
    case 'light': return 'Light'
    case 'button': return 'Button'
    default: return 'Part'
  }
}

function useFocusedCreation(): DerivedCreation | null {
  const creations = useRoboticsStore((state) => state.model.creations)
  const selectedId = useBrickStore((state) => state.selectedId)
  const simCreationId = useRoboticsStore((state) => state.sim?.creationId ?? null)
  return useMemo(() => {
    if (simCreationId) return creations.find((creation) => creation.id === simCreationId) ?? null
    if (selectedId) {
      const owner = creations.find((creation) => creation.brickIds.includes(selectedId) || creation.wheels.some((wheel) => wheel.brickId === selectedId))
      if (owner) return owner
    }
    return creations.length ? creations[creations.length - 1] : null
  }, [creations, selectedId, simCreationId])
}

function CreationPanel({ compact, live }: { compact: boolean; live: boolean }) {
  const creation = useFocusedCreation()
  const selectedId = useBrickStore((state) => state.selectedId)
  const bricks = useBrickStore((state) => state.bricks)
  const rename = useRoboticsStore((state) => state.renameCreation)
  const setTestSpace = useRoboticsStore((state) => state.setTestSpace)
  const [collapsed, setCollapsed] = useState(false)
  const [draftName, setDraftName] = useState<string | null>(null)
  const selected = selectedId ? bricks.find((brick) => brick.id === selectedId) ?? null : null
  const selectedSpec = selected ? roboticsSpec(selected.partId) : null
  if (!creation && !selectedSpec) return null
  return (
    <aside className={`robotics-panel${compact ? ' compact' : ''}${collapsed ? ' collapsed' : ''}`} aria-label="Robotics" data-testid="robotics-panel">
      <header className="robotics-panel-head">
        {creation ? (
          <input
            type="text"
            aria-label="Creation name"
            className="robotics-name"
            value={draftName ?? creation.name}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={() => { if (draftName !== null && draftName.trim() && draftName !== creation.name) rename(creation.id, draftName); setDraftName(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }}
          />
        ) : <strong>Robotics</strong>}
        {creation && <button type="button" className="studio-button studio-button-primary robotics-code-button" onClick={() => useCodeView.getState().openCode(creation.id)} disabled={live} data-testid="robotics-code-button">Code</button>}
        <button type="button" className="robotics-link-button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'Show' : 'Hide'}</button>
      </header>
      {creation && live && <p className="robotics-live-line" data-testid="robotics-live-code-line">{LIVE_ROOM_CODE_LINE}</p>}
      {!collapsed && (
        <>
          {selected && selectedSpec && (isDeviceRole(selectedSpec.role) ? <DeviceInspector brickId={selected.id} creation={creation} /> : <SelectedPart creation={creation} brickId={selected.id} role={selectedSpec.role} />)}
          {creation && (
            <>
              <ul className="robotics-lines">
                <li><span className="robotics-check">✓</span>{creation.lines.attached} · {creation.lines.parts}</li>
                <li><span className="robotics-dot">·</span>{creation.lines.ready}</li>
                {creation.drivePair && <li><span className="robotics-dot">·</span>Drive: {motorName(creation, creation.drivePair.leftId)} + {motorName(creation, creation.drivePair.rightId)}{creation.drivePair.reversedIds.length ? ` · ${creation.drivePair.reversedIds.map((id) => motorName(creation, id)).join(', ')} reversed` : ''}</li>}
              </ul>
              <PartRows creation={creation} selectedId={selectedId} />
              <div className="robotics-space" role="group" aria-label="Where it runs">
                <span>Runs</span>
                <button type="button" className={`robotics-chip${creation.testSpace === 'testPlate' ? ' active' : ''}`} aria-pressed={creation.testSpace === 'testPlate'} onClick={() => setTestSpace(creation.id, 'testPlate')}>on the test plate</button>
                <button type="button" className={`robotics-chip${creation.testSpace === 'myWorld' ? ' active' : ''}`} aria-pressed={creation.testSpace === 'myWorld'} onClick={() => setTestSpace(creation.id, 'myWorld')}>in my world</button>
              </div>
              <WiringModeToggle />
              <NudgeControls creation={creation} />
            </>
          )}
        </>
      )}
    </aside>
  )
}

function motorName(creation: DerivedCreation, id: string) {
  return creation.motors.find((motor) => motor.brickId === id)?.name ?? 'motor'
}

function SelectedPart({ creation, brickId, role }: { creation: DerivedCreation | null; brickId: string; role: string }) {
  const model = useRoboticsStore((state) => state.model)
  let text: string
  if (role === 'wheel') {
    const wheel = creation?.wheels.find((candidate) => candidate.brickId === brickId) ?? null
    text = wheel ? (wheel.onAxle ? `On an axle${wheel.motorId ? ` in ${motorName(creation!, wheel.motorId)}` : ' with no motor'}` : wheel.note ?? 'Not on an axle') : 'Not on an axle · a decorative brick until an axle end reaches its hole'
  } else if (role === 'axle') {
    const axle = model.creations.flatMap((candidate) => candidate.axles).find((candidate) => candidate.brickId === brickId)
    text = axle ? `${axle.motorId ? `In ${motorName(creation!, axle.motorId)}` : 'Not in a motor socket'} · ${axle.wheelIds.length ? `${axle.wheelIds.length} wheel${axle.wheelIds.length === 1 ? '' : 's'} on it` : 'no wheel on it'}` : 'Loose · not in a socket'
  } else if (role === 'motor') {
    const motor = creation?.motors.find((candidate) => candidate.brickId === brickId)
    text = motor ? describeMotor(motor) : 'Not part of a creation yet'
  } else if (role === 'hinge-motor') {
    const hinge = creation?.hinges.find((candidate) => candidate.brickId === brickId)
    text = hinge ? describeHinge(hinge) : 'Not part of a creation yet'
  } else if (role === 'distance-sensor') {
    const sensor = creation?.sensors.find((candidate) => candidate.brickId === brickId)
    text = sensor ? `Faces ${sensor.facing} · ${sensor.plugged ? `port ${sensor.port!.port}` : 'Not plugged in'}` : 'Not part of a creation yet'
  } else if (role === 'hub') {
    const section = model.section
    const used = section.connections.filter((connection) => connection.hubId === brickId)
    text = used.length ? `Ports: ${used.map((connection) => `${connection.port} ${deviceLabel(creation, connection.deviceId)}`).join(', ')}` : 'No cables yet'
  } else {
    const device = creation ? [...creation.lights, ...creation.buttons].find((candidate) => candidate.brickId === brickId) : null
    text = device ? (device.plugged ? `Plugged into port ${device.port!.port}` : 'Not plugged in') : role === 'seat' ? 'A seat · a creation with a seat can be ridden in Explore (later)' : 'Not part of a creation yet'
  }
  return <p className="robotics-selected" data-testid="robotics-selected-part"><strong>{roleTitle(role) === 'Part' ? role : roleTitle(role)}</strong> · {text}</p>
}

function deviceLabel(creation: DerivedCreation | null, deviceId: string) {
  if (!creation) return deviceId
  const all = [...creation.motors, ...creation.hinges, ...creation.sensors, ...creation.lights, ...creation.buttons]
  return all.find((device) => device.brickId === deviceId)?.name ?? 'missing part'
}

function describeMotor(motor: DerivedMotor) {
  const chain = motor.axleId ? (motor.wheelIds.length ? `axle and wheel on it` : 'axle in it, no wheel') : 'nothing in its socket'
  const plugged = motor.plugged ? `port ${motor.port!.port}` : 'Not plugged in'
  const drives = motor.drives ? ` · runs ${motor.drives}${motor.drives === 'backward' ? ' (reversed)' : ''}` : ''
  return `${chain} · ${plugged}${drives}`
}

function describeHinge(hinge: DerivedHinge) {
  if (hinge.locked) return `arm built into the frame, so it can't swing · ${hinge.plugged ? `port ${hinge.port!.port}` : 'Not plugged in'}`
  return `fixed side on the frame, moving side carries ${hinge.armBrickIds.length} ${hinge.armBrickIds.length === 1 ? 'brick' : 'bricks'} · zero is as built · ${hinge.plugged ? `port ${hinge.port!.port}` : 'Not plugged in'}`
}

function PartRows({ creation, selectedId = null, compact = false }: { creation: DerivedCreation; selectedId?: string | null; compact?: boolean }) {
  const hingeReports = useRoboticsStore((state) => state.hingeReports)
  const rows: { id: string; text: string; tone?: 'warn' | 'bad' }[] = []
  const devices = [...creation.motors, ...creation.hinges, ...creation.sensors, ...creation.lights, ...creation.buttons]
  for (const hub of creation.hubs) rows.push({ id: hub.brickId, text: `${hub.name} · ports ${['A', 'B', 'C', 'D'].map((port) => `${port}${devices.find((device) => device.port?.hubId === hub.brickId && device.port.port === port) ? '●' : '○'}`).join(' ')}` })
  for (const motor of creation.motors) rows.push({ id: motor.brickId, text: `${motor.name} · ${describeMotor(motor)}`, tone: motor.plugged ? undefined : 'warn' })
  for (const hinge of creation.hinges) {
    const report = hingeReports[hinge.brickId]
    rows.push({ id: hinge.brickId, text: `${hinge.name} · ${describeHinge(hinge)}${report ? ` · at ${Math.round(report.angle)}°${report.blocked ? ' · blocked' : ''}` : ''}`, tone: hinge.locked ? 'bad' : hinge.plugged ? undefined : 'warn' })
  }
  for (const wheel of creation.wheels) rows.push({ id: wheel.brickId, text: `Wheel · ${wheel.onAxle ? `on an axle${wheel.motorId ? ` in ${motorName(creation, wheel.motorId)}` : ''}` : wheel.note ?? 'Not on an axle'}`, tone: wheel.onAxle ? undefined : 'bad' })
  for (const sensor of creation.sensors) rows.push({ id: sensor.brickId, text: `${sensor.name} · faces ${sensor.facing} · ${sensor.plugged ? `port ${sensor.port!.port}` : 'Not plugged in'}`, tone: sensor.plugged ? undefined : 'warn' })
  for (const device of [...creation.lights, ...creation.buttons]) rows.push({ id: device.brickId, text: `${device.name} · ${device.plugged ? `port ${device.port!.port}` : 'Not plugged in'}`, tone: device.plugged ? undefined : 'warn' })
  if (!rows.length) return null
  return (
    <ul className={`robotics-parts${compact ? ' compact' : ''}`} aria-label="Parts found">
      {rows.map((row) => <li key={row.id} className={`${row.tone ?? ''}${row.id === selectedId ? ' selected' : ''}`} data-brick-id={row.id}>{row.text}</li>)}
    </ul>
  )
}

function NudgeControls({ creation }: { creation: DerivedCreation }) {
  const sim = useRoboticsStore((state) => state.sim)
  const simLoading = useRoboticsStore((state) => state.simLoading)
  const startSim = useRoboticsStore((state) => state.startSim)
  const nudgeMotor = useRoboticsStore((state) => state.nudgeMotor)
  const nudgeHinge = useRoboticsStore((state) => state.nudgeHinge)
  const driveForward = useRoboticsStore((state) => state.driveForward)
  const stopAll = useRoboticsStore((state) => state.stopAll)
  const resetSim = useRoboticsStore((state) => state.resetSim)
  const motorAngles = useRoboticsStore((state) => state.motorAngles)
  const contacts = useRoboticsStore((state) => state.contacts)
  const running = sim?.creationId === creation.id
  const ensure = async () => { if (!running) await startSim(creation.id) }
  const nudgeable = creation.motors.length > 0 || creation.hinges.length > 0
  if (!nudgeable) return null
  return (
    <section className="robotics-nudge" aria-label="Nudge (mechanics only)">
      <header><strong>Nudge</strong><span>mechanics only · no code yet</span></header>
      {creation.drivePair && (
        <div className="robotics-nudge-row">
          <button type="button" className="studio-button" onClick={async () => { await ensure(); driveForward(creation.id, 0.4) }}>Drive forward 40%</button>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); driveForward(creation.id, -0.4) }}>Back 40%</button>
        </div>
      )}
      {creation.motors.map((motor) => (
        <div className="robotics-nudge-row" key={motor.brickId}>
          <span className="robotics-nudge-label">{motor.name}{running && motorAngles[motor.brickId] !== undefined ? ` · ${Math.round((motorAngles[motor.brickId] * 180) / Math.PI)}°` : ''}</span>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeMotor(motor.brickId, 0.4) }}>Run 40%</button>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeMotor(motor.brickId, -0.4) }}>Run −40%</button>
          <button type="button" className="studio-button" onClick={() => nudgeMotor(motor.brickId, 0)} disabled={!running}>Stop</button>
        </div>
      ))}
      {creation.hinges.map((hinge) => (
        <div className="robotics-nudge-row" key={hinge.brickId}>
          <span className="robotics-nudge-label">{hinge.name}</span>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeHinge(hinge.brickId, 60) }}>Swing to 60°</button>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeHinge(hinge.brickId, -60) }}>Swing to −60°</button>
          <button type="button" className="studio-button" onClick={async () => { await ensure(); nudgeHinge(hinge.brickId, 0) }}>Back to 0°</button>
        </div>
      ))}
      <div className="robotics-nudge-row">
        <button type="button" className="studio-button" onClick={stopAll} disabled={!running}>Stop all</button>
        <button type="button" className="studio-button" onClick={resetSim} disabled={!running} data-testid="robotics-reset">Reset</button>
        <span className="robotics-nudge-status" data-testid="robotics-sim-status">{simLoading ? 'Starting…' : running ? 'Running · construction untouched' : 'Built pose'}</span>
      </div>
      {running && contacts.length > 0 && (
        <p className="robotics-contact" data-testid="robotics-contact">Arm touching {contacts.map((contact) => (contact.otherBrickId ? 'a brick' : 'the plate')).slice(0, 1)} · highlighted</p>
      )}
    </section>
  )
}
