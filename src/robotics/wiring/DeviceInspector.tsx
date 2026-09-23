import { Check, PenLine, RotateCw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PartThumbnail } from '../../brick/PartThumbnail'
import { BRICK_PART_MAP } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import { freePorts, hubPorts, livePort, type PortState } from '../model/control'
import { deviceName, driveSidesOf, type DerivedCreation, type FacingWord } from '../model/creations'
import { isDeviceRole, roboticsSpec, type HubPort, type RoboticsDeviceKind } from '../parts/catalog'
import { moveMotorToSide, putOnRobot } from '../guide/fixes'
import { sideStepText } from '../drive/readiness'
import { MOTORS_GO_ON_THE_SIDES, MOVE_TO_SIDE, TURN_IT, planPutOnRobot } from '../model/fixPlans'
import { nearestRobot, partWord } from '../model/placementAdvice'
import { useRoboticsStore } from '../state/roboticsStore'
import { Fold } from '../ui/Fold'
import { DEVICE_NAME_LIMIT, hubForDevice, lastKnownDeviceName, moveDeviceToPort, plugDeviceIn, renameDevice, swapDevicePorts, unplugDevice } from './actions'
import { selectDeviceReading } from './readings'
import './wiring.css'

/**
 * The device inspector (contract §5, the mock's Wiring board): shown in the creation
 * panel while a device is selected. Simple first (lane P, docs/robotics/KID-UX.md): its
 * name, one line in a third grader's words saying what it does and whether it is plugged
 * in, and "Plug it in" when it is not; the studio's Color and Delete stay in the command
 * strip. Everything else sits behind the part's own More: the plugged-in state, the hub's
 * four port chips (free / used by another device / this one / free but was a deleted
 * part's), what the device is doing right now, the block that uses it (with "Not plugged
 * in" when it is unplugged) and the wiring buttons. A chip on a free port moves or plugs
 * the device there; a chip on a used port swaps with that device. Selecting the hub says
 * it is the robot's brain and what is plugged into it, by name; its More lists the ports,
 * and a port with a device selects that device. Every part starts with its More shut.
 */
export function DeviceInspector({ brickId, creation }: { brickId: string; creation: DerivedCreation | null }) {
  const model = useRoboticsStore((state) => state.model)
  const brick = model.input.bricks.find((candidate) => candidate.id === brickId) ?? null
  const role = brick ? roboticsSpec(brick.partId)?.role : undefined
  if (!brick || !role || !isDeviceRole(role)) return null
  return role === 'hub' ? <HubInspector key={brickId} hubId={brickId} /> : <DeviceWiring key={brickId} brickId={brickId} role={role} creation={creation} />
}

const ROLE_TITLES: Record<RoboticsDeviceKind, string> = { hub: 'Hub', motor: 'Motor', 'hinge-motor': 'Hinge motor', 'distance-sensor': 'Distance sensor', light: 'Light', button: 'Button' }

function useWiringContext() {
  const model = useRoboticsStore((state) => state.model)
  return useMemo(() => {
    const byId = new Map(model.input.bricks.map((brick) => [brick.id, brick]))
    return { model, byId, context: { section: model.section, input: model.input, present: byId, byId } }
  }, [model])
}

/** The hub's ports; a stale cable's last known name is read from the history, so it is a dependency too. */
function usePorts(hubId: string | null): PortState[] {
  const { model, byId } = useWiringContext()
  const undoStack = useBrickStore((state) => state.undoStack)
  const documentMetadata = useBrickStore((state) => state.documentMetadata)
  return useMemo(() => (hubId ? hubPorts(model.section, hubId, byId, (id) => lastKnownDeviceName(id, { undoStack, documentMetadata })) : []), [model, byId, hubId, undoStack, documentMetadata])
}

/**
 * The part's name, the student's own. It sits just under the next step, so a tap that lands a
 * little low must not open an iPad's keyboard (lane P): the name only becomes a text field from
 * its pencil, or from a mouse click on it. Saved on Enter or when the field is left.
 */
function NameField({ brickId, name }: { brickId: string; name: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  /** Escape leaves the field without saving: the blur that follows must not save the draft. */
  const abandoned = useRef(false)
  const editing = draft !== null
  useEffect(() => setDraft(null), [brickId, name])
  useEffect(() => {
    if (!editing) return
    field.current?.focus()
    field.current?.select()
  }, [editing])
  const commit = () => {
    if (draft !== null && draft.trim() && draft.trim() !== name) renameDevice(brickId, draft)
    setDraft(null)
  }
  return (
    <div className="wiring-name-row">
      <input
        ref={field}
        type="text"
        className={`wiring-name${editing ? ' editing' : ''}`}
        aria-label="Device name"
        maxLength={DEVICE_NAME_LIMIT}
        readOnly={!editing}
        // Read-only it is not a stop for Tab (the pencil is) and a tap on it does not light it up.
        tabIndex={editing ? 0 : -1}
        value={draft ?? name}
        onPointerDown={(event) => { if (!editing && event.pointerType === 'mouse') setDraft(name) }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (abandoned.current) abandoned.current = false
          else if (editing) commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          if (event.key === 'Escape') { abandoned.current = true; setDraft(null); (event.target as HTMLInputElement).blur() }
        }}
      />
      {!editing && (
        <button type="button" className="wiring-rename" aria-label={`Rename ${name}`} title="Change the name" onClick={() => setDraft(name)} data-testid="wiring-rename">
          <PenLine size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** The part as the drawer draws it, in its own colour: the first thing in its card. */
function PartPicture({ brickId }: { brickId: string }) {
  const brick = useBrickStore((state) => state.bricks.find((candidate) => candidate.id === brickId) ?? null)
  const part = brick ? BRICK_PART_MAP[brick.partId] : undefined
  const color = brick?.color
  const tinted = useMemo(() => (part && color ? { ...part, defaultColor: color } : null), [part, color])
  if (!tinted) return null
  return <span className="wiring-picture" aria-hidden="true"><PartThumbnail part={tinted} /></span>
}

/**
 * Big Turn and Remove for the part in its card (Sam, 8, on an iPad: "big Turn and Remove buttons").
 * They are the command strip's Rotate and Delete, for this part alone.
 */
function PartButtons({ brickId, name }: { brickId: string; name: string }) {
  const only = () => {
    const state = useBrickStore.getState()
    if (state.selectedIds.length !== 1 || state.selectedId !== brickId) state.selectBrick(brickId)
    return useBrickStore.getState()
  }
  return (
    <div className="wiring-part-actions">
      <button type="button" className="wiring-big-button" aria-label={`Turn ${name}`} title="Turn it a quarter (R)" onClick={() => only().rotate()} data-testid="wiring-turn">
        <RotateCw size={20} aria-hidden="true" />Turn
      </button>
      <button type="button" className="wiring-big-button danger" aria-label={`Remove ${name}`} title="Take it off (Delete)" onClick={() => only().deleteSelected()} data-testid="wiring-remove">
        <Trash2 size={20} aria-hidden="true" />Remove
      </button>
    </div>
  )
}

function RoleIcon({ role }: { role: RoboticsDeviceKind }) {
  const paths: Record<RoboticsDeviceKind, ReactNode> = {
    hub: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h.01M16 9h.01M8 15h.01M16 15h.01" /></>,
    motor: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4M8 4h8M9 14h.01M15 14h.01" /></>,
    'hinge-motor': <><rect x="5" y="12" width="14" height="8" rx="2" /><path d="M12 12V8a4 4 0 0 1 4-4h2" /></>,
    'distance-sensor': <><rect x="3" y="8" width="18" height="10" rx="2" /><circle cx="8.5" cy="13" r="2" /><circle cx="15.5" cy="13" r="2" /></>,
    light: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" /></>,
    button: <><rect x="4" y="12" width="16" height="7" rx="2" /><path d="M8 12V9h8v3" /></>,
  }
  return (
    <span className={`wiring-icon role-${role}`} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{paths[role]}</svg>
    </span>
  )
}

function describe(role: RoboticsDeviceKind, brickId: string, creation: DerivedCreation | null): string {
  const title = ROLE_TITLES[role]
  if (!creation) return `${title} · not part of a creation yet`
  switch (role) {
    case 'motor': {
      const motor = creation.motors.find((candidate) => candidate.brickId === brickId)
      if (!motor) return title
      const chain = motor.axleId ? (motor.wheelIds.length ? 'wheel on its axle' : 'axle in it, no wheel') : 'nothing in its socket'
      return `${title} · ${chain}${motor.drives ? ` · runs ${motor.drives}${motor.drives === 'backward' ? ' (reversed)' : ''}` : ''}`
    }
    case 'hinge-motor': {
      const hinge = creation.hinges.find((candidate) => candidate.brickId === brickId)
      if (!hinge) return title
      return hinge.locked ? `${title} · arm built into the frame` : `${title} · swings ${hinge.armBrickIds.length} ${hinge.armBrickIds.length === 1 ? 'brick' : 'bricks'} · zero is as built`
    }
    case 'distance-sensor': {
      const sensor = creation.sensors.find((candidate) => candidate.brickId === brickId)
      return sensor ? `${title} · faces ${sensor.facing}` : title
    }
    default: return `${title} · in ${creation.name}`
  }
}

const SEES: Record<FacingWord, string> = {
  forward: 'it sees what is in front',
  backward: 'it sees what is behind',
  left: 'it looks to the left',
  right: 'it looks to the right',
  'the far side': 'it looks to the far side',
  'the near side': 'it looks to the near side',
  up: 'it looks up',
  down: 'it looks down',
}

/** What the part does, in a third grader's words, for the inspector's first line (no ports, no numbers). */
export function whatItDoes(role: Exclude<RoboticsDeviceKind, 'hub'>, brickId: string, creation: DerivedCreation | null): string {
  if (!creation) return 'Not on a robot yet'
  switch (role) {
    case 'motor': {
      const motor = creation.motors.find((candidate) => candidate.brickId === brickId)
      if (!motor || !motor.axleId) return 'Turns a wheel once it has an axle'
      if (!motor.wheelIds.length) return 'Turns its axle. Add a wheel to it.'
      const sides = driveSidesOf(creation)
      if (sides?.left.includes(brickId)) return sides.left.length > 1 ? 'Turns a wheel on the left' : 'Turns the left wheel'
      if (sides?.right.includes(brickId)) return sides.right.length > 1 ? 'Turns a wheel on the right' : 'Turns the right wheel'
      return 'Turns its wheel'
    }
    case 'hinge-motor': {
      const hinge = creation.hinges.find((candidate) => candidate.brickId === brickId)
      if (hinge?.locked) return 'Swings the arm, but the arm is stuck'
      if (!hinge?.armBrickIds.length) return 'Swings an arm. Put a long brick on it.'
      return creation.kind === 'gate' ? 'Swings the gate open' : 'Swings the arm'
    }
    case 'distance-sensor': {
      const sensor = creation.sensors.find((candidate) => candidate.brickId === brickId)
      if (creation.kind !== 'rover') return 'The robot’s eyes: it sees who walks up'
      return `The robot’s eyes: ${sensor ? SEES[sensor.facing] : 'it sees what is in front'}`
    }
    case 'light': return 'Lights up in a color'
    case 'button': return 'Does something when it is pressed'
  }
}

/** The block that uses this device, as the Code view draws it (plan §5 colours). */
function BlockPreview({ role, name, port }: { role: RoboticsDeviceKind; name: string; port: HubPort | null }) {
  const dropdown = <span className="wiring-dd">{port ? `${name} · ${port}` : name} ▾</span>
  const value = (text: string) => <span className="wiring-dd value">{text}</span>
  let tone = 'motion'
  let body: ReactNode
  switch (role) {
    case 'motor': body = <>run {dropdown} at {value('40')} %</>; break
    case 'hinge-motor': body = <>turn {dropdown} to {value('90')} °</>; break
    case 'distance-sensor': tone = 'sensing'; body = <>{dropdown} distance (studs)</>; break
    case 'light': tone = 'light'; body = <>set {dropdown} to {value('red ▾')}</>; break
    default: tone = 'events'; body = <>when {dropdown} pressed</>; break
  }
  return (
    <div className="wiring-code">
      <span className="wiring-label">In Code</span>
      <span className={`wiring-block ${tone}`} data-testid="wiring-block">
        {body}
        {!port && <span className="wiring-pill red">Not plugged in</span>}
      </span>
    </div>
  )
}

const UNPLUGGED_HINTS: Record<Exclude<RoboticsDeviceKind, 'hub'>, string> = {
  motor: 'Nothing turns until a cable reaches a port.',
  'hinge-motor': 'The arm stays put until a cable reaches a port.',
  'distance-sensor': 'It reports nothing until a cable reaches a port.',
  light: 'It stays dark until a cable reaches a port.',
  button: 'Presses go unheard until a cable reaches a port.',
}

/**
 * A device lying beside a robot but not on it (kid-UX lane W): the robot it belongs with and the
 * one tap that puts it on, or why it can't go on. Null when it is on a robot, or near none.
 */
function useBesideRobot(brickId: string, onRobot: boolean) {
  const model = useRoboticsStore((state) => state.model)
  return useMemo(() => {
    if (onRobot) return null
    const brick = model.input.bricks.find((candidate) => candidate.id === brickId)
    const robot = brick ? nearestRobot(model.input, model.creations, brick) : null
    return brick && robot ? { robot, fix: planPutOnRobot(model.input, robot, brickId) } : null
  }, [model, brickId, onRobot])
}

function DeviceWiring({ brickId, role, creation }: { brickId: string; role: Exclude<RoboticsDeviceKind, 'hub'>; creation: DerivedCreation | null }) {
  const { model, byId, context } = useWiringContext()
  const brick = byId.get(brickId)!
  const name = deviceName(model.input, brick)
  const cable = livePort(model.section, brickId, byId)
  const plugged = cable !== null
  const onRobot = Boolean(creation?.brickIds.includes(brickId))
  const beside = useBesideRobot(brickId, onRobot)
  const motor = role === 'motor' ? creation?.motors.find((candidate) => candidate.brickId === brickId) ?? null : null
  // A motor that can't turn a wheel where it stands: why, and the one tap that puts it right (kid-UX lane W).
  const stuck = motor && !motor.axleId && (['covered', 'facing-in', 'high'].includes(motor.socketRoom ?? 'open') || motor.crossways) ? motor : null
  const covered = stuck !== null
  const hubId = useMemo(() => hubForDevice(brickId, context), [brickId, context])
  const ports = usePorts(hubId)
  const free = hubId ? freePorts(model.section, hubId, byId) : []
  const reading = useRoboticsStore((state) => selectDeviceReading(state, brickId, role, plugged))
  const nameOfPort = (port: PortState) => {
    const other = port.deviceId ? byId.get(port.deviceId) : null
    return other ? deviceName(model.input, other) : 'a part'
  }

  let stateLabel: string
  let stateTone: 'green' | 'red'
  let hint: string
  if (beside) {
    // Not on the robot beside it: never "add a hub" to a robot that has one; say where it goes.
    stateLabel = `Not on ${beside.robot.name}`
    stateTone = 'red'
    hint = `This ${partWord(role)} isn't on ${beside.robot.name} yet.${beside.fix.ok ? '' : ` ${beside.fix.text}`}`
  } else if (plugged) {
    stateLabel = `Port ${cable.port}`
    stateTone = 'green'
    hint = `The cable and port ${cable.port} are lit on the hub. The name follows the device, not the port.`
  } else if (!hubId) {
    stateLabel = 'No hub'
    stateTone = 'red'
    hint = onRobot && creation ? `Add a hub to ${creation.name} to plug it in.` : 'Add a hub to plug it in.'
  } else if (!free.length) {
    stateLabel = 'No free port'
    stateTone = 'red'
    hint = 'Ports A–D are all used. Unplug something to free one, or swap with a port below.'
  } else {
    stateLabel = 'Unplugged'
    stateTone = 'red'
    hint = UNPLUGGED_HINTS[role]
  }
  const stale = ports.filter((port) => port.staleName)
  const [more, setMore] = useState(false)
  const actionable = Boolean(beside) || covered || !plugged

  return (
    <section className="wiring-inspector wiring-card" aria-label={`${name} wiring`} data-testid="robotics-device-inspector" data-device-id={brickId}>
      <div className="wiring-head">
        <PartPicture brickId={brickId} />
        <div className="wiring-head-text">
          <NameField brickId={brickId} name={name} />
          <span className="wiring-does" data-testid="wiring-does">
            {whatItDoes(role, brickId, creation)} · {plugged ? <span className="wiring-plugged">plugged in<Check size={15} strokeWidth={3} aria-hidden="true" /></span> : hubId ? 'not plugged in' : 'add a hub to plug it in'}
          </span>
        </div>
      </div>
      {/* What the child must act on, with its one tap (kid-UX lane W): kept out of More (lane P). */}
      {actionable && <p className="wiring-hint" data-testid="wiring-hint">{hint}</p>}
      {stuck && <p className="wiring-hint" data-testid="wiring-side-hint">{stuck.socketRoom === 'covered' || stuck.socketRoom === 'high' ? MOTORS_GO_ON_THE_SIDES : sideStepText(stuck)}</p>}
      {(beside?.fix.ok || covered) && (
        <div className="wiring-actions">
          {beside?.fix.ok && <button type="button" className="wiring-button primary" onClick={() => putOnRobot(brickId, beside.robot.id)} data-testid="wiring-put-on">{beside.fix.label}</button>}
          {stuck && <button type="button" className="wiring-button primary" onClick={() => moveMotorToSide(brickId)} data-testid="wiring-to-side">{stuck.socketRoom === 'covered' || stuck.socketRoom === 'high' ? MOVE_TO_SIDE : TURN_IT}</button>}
        </div>
      )}
      {!plugged && free[0] && <button type="button" className="wiring-button primary wiring-plug-in" onClick={() => plugDeviceIn(brickId, free[0])} data-testid="wiring-plug-in">Plug it in</button>}
      <PartButtons brickId={brickId} name={name} />
      <Fold title="More" label={`More about ${name}`} open={more} onToggle={() => setMore(!more)} testId="robotics-part-more">
        <span className="wiring-head-role"><RoleIcon role={role} /><span className="wiring-sub" data-testid="wiring-sub">{describe(role, brickId, creation)}</span></span>
        <div className="wiring-box">
          <div className="wiring-row">
            <span className="wiring-label">Plugged in</span>
            <span className={`wiring-pill ${stateTone}`} data-testid="wiring-state">{stateLabel}</span>
          </div>
          {hubId && (
            <div className="wiring-row">
              <span id={`wiring-ports-${brickId}`}>Port</span>
              <div className="wiring-chips" role="group" aria-labelledby={`wiring-ports-${brickId}`}>
                {ports.map((port) => {
                  const mine = port.deviceId === brickId && !port.deviceMissing
                  const other = port.used && !mine ? nameOfPort(port) : null
                  const state = mine ? 'this' : port.used ? 'used' : port.staleName ? 'stale' : 'free'
                  const label = mine
                    ? `Port ${port.port}: ${name} is plugged in here`
                    : other
                      ? `Port ${port.port}: ${other}. Swap with ${other}`
                      : `Port ${port.port}: free${port.staleName ? ` (was ${port.staleName})` : ''}. ${plugged ? 'Move' : 'Plug'} ${name} ${plugged ? 'here' : 'in here'}`
                  return (
                    <button
                      key={port.port}
                      type="button"
                      className={`wiring-port ${state}`}
                      data-port={port.port}
                      data-state={state}
                      aria-label={label}
                      title={label}
                      aria-pressed={mine}
                      disabled={mine}
                      onClick={() => {
                        if (other && port.deviceId) swapDevicePorts(brickId, port.deviceId)
                        else if (plugged) moveDeviceToPort(brickId, port.port)
                        else plugDeviceIn(brickId, port.port)
                      }}
                    >
                      {port.port}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {stale.length > 0 && <p className="wiring-note" data-testid="wiring-stale">{stale.map((port) => `Port ${port.port} is free (was ${port.staleName})`).join(' · ')}</p>}
          <div className="wiring-row">
            <span>Right now</span>
            <strong data-testid="wiring-reading">{reading}</strong>
          </div>
          {!actionable && <p className="wiring-hint" data-testid="wiring-hint">{hint}</p>}
        </div>
        <BlockPreview role={role} name={name} port={cable?.port ?? null} />
        <div className="wiring-actions">
          {plugged && <button type="button" className="wiring-button" onClick={() => unplugDevice(brickId)}>Unplug</button>}
          {plugged && free[0] && <button type="button" className="wiring-button" onClick={() => moveDeviceToPort(brickId, free[0])}>Move to port {free[0]}</button>}
          {!plugged && free[0] && <button type="button" className="wiring-button primary" onClick={() => plugDeviceIn(brickId, free[0])}>Plug into port {free[0]}</button>}
        </div>
      </Fold>
    </section>
  )
}

function joinNames(names: readonly string[]) {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function HubInspector({ hubId }: { hubId: string }) {
  const { model, byId } = useWiringContext()
  const hub = byId.get(hubId)!
  const name = deviceName(model.input, hub)
  const ports = usePorts(hubId)
  const used = ports.filter((port) => port.used).length
  const select = useBrickStore((state) => state.selectBrick)
  const [more, setMore] = useState(false)
  const plugged = ports.flatMap((port) => {
    const device = port.used && port.deviceId && !port.deviceMissing ? byId.get(port.deviceId) : null
    return device ? [deviceName(model.input, device)] : []
  })
  return (
    <section className="wiring-inspector wiring-card" aria-label={`${name} ports`} data-testid="robotics-hub-inspector" data-device-id={hubId}>
      <div className="wiring-head">
        <PartPicture brickId={hubId} />
        <div className="wiring-head-text">
          <NameField brickId={hubId} name={name} />
          <span className="wiring-does" data-testid="wiring-does">The robot’s brain</span>
        </div>
      </div>
      <p className="wiring-hub-plugged" data-testid="hub-plugged">{plugged.length ? `Plugged in: ${joinNames(plugged)}` : 'Nothing is plugged in yet.'}</p>
      <PartButtons brickId={hubId} name={name} />
      <Fold title="More" label={`More about ${name}`} open={more} onToggle={() => setMore(!more)} testId="robotics-part-more">
        <span className="wiring-head-role"><RoleIcon role="hub" /><span className="wiring-sub">Hub · {used === 4 ? 'all four ports used' : `${4 - used} of 4 ports free`}</span></span>
        <ul className="wiring-hub-ports" aria-label="Ports">
          {ports.map((port) => {
            const device = port.used && port.deviceId ? byId.get(port.deviceId) : null
            const deviceLabel = device ? deviceName(model.input, device) : null
            return (
              <li key={port.port}>
                {device ? (
                  <button type="button" className="wiring-hub-port" data-port={port.port} data-state="used" onClick={() => select(device.id)} aria-label={`Port ${port.port}: ${deviceLabel}. Select ${deviceLabel}`}>
                    <span className="wiring-port used" aria-hidden="true">{port.port}</span>
                    <span>{deviceLabel}</span>
                  </button>
                ) : (
                  <div className="wiring-hub-port" data-port={port.port} data-state={port.staleName ? 'stale' : 'free'}>
                    <span className={`wiring-port ${port.staleName ? 'stale' : 'free'}`} aria-hidden="true">{port.port}</span>
                    <span>Port {port.port} · free{port.staleName ? ` (was ${port.staleName})` : ''}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Fold>
    </section>
  )
}
