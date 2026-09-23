import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useBrickStore } from '../../brick/store'
import { freePorts, hubPorts, livePort, type PortState } from '../model/control'
import { deviceName, type DerivedCreation } from '../model/creations'
import { isDeviceRole, roboticsSpec, type HubPort, type RoboticsDeviceKind } from '../parts/catalog'
import { moveMotorToSide, putOnRobot } from '../guide/fixes'
import { MOTORS_GO_ON_THE_SIDES, MOVE_TO_SIDE, planPutOnRobot } from '../model/fixPlans'
import { nearestRobot, partWord } from '../model/placementAdvice'
import { useRoboticsStore } from '../state/roboticsStore'
import { DEVICE_NAME_LIMIT, hubForDevice, lastKnownDeviceName, moveDeviceToPort, plugDeviceIn, renameDevice, swapDevicePorts, unplugDevice } from './actions'
import { selectDeviceReading } from './readings'
import './wiring.css'

/**
 * The device inspector (contract §5, the mock's Wiring board): shown in the creation
 * panel while a device is selected. Name field, plugged-in state, the hub's four port
 * chips (free / used by another device / this one / free but was a deleted part's),
 * what the device is doing right now, the block that uses it (with "Not plugged in"
 * when it is unplugged) and the wiring buttons. A chip on a free port moves or plugs
 * the device there; a chip on a used port swaps with that device. Selecting the hub
 * shows its ports and what is in each; a port with a device selects that device.
 */
export function DeviceInspector({ brickId, creation }: { brickId: string; creation: DerivedCreation | null }) {
  const model = useRoboticsStore((state) => state.model)
  const brick = model.input.bricks.find((candidate) => candidate.id === brickId) ?? null
  const role = brick ? roboticsSpec(brick.partId)?.role : undefined
  if (!brick || !role || !isDeviceRole(role)) return null
  return role === 'hub' ? <HubInspector hubId={brickId} /> : <DeviceWiring brickId={brickId} role={role} creation={creation} />
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

function NameField({ brickId, name }: { brickId: string; name: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => setDraft(null), [brickId, name])
  const commit = () => {
    if (draft !== null && draft.trim() && draft.trim() !== name) renameDevice(brickId, draft)
    setDraft(null)
  }
  return (
    <input
      type="text"
      className="wiring-name"
      aria-label="Device name"
      maxLength={DEVICE_NAME_LIMIT}
      value={draft ?? name}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        if (event.key === 'Escape') { setDraft(null); (event.target as HTMLInputElement).blur() }
      }}
    />
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
  const covered = role === 'motor' && Boolean(creation?.motors.find((motor) => motor.brickId === brickId)?.socketCovered)
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

  return (
    <section className="wiring-inspector" aria-label={`${name} wiring`} data-testid="robotics-device-inspector" data-device-id={brickId}>
      <div className="wiring-head">
        <RoleIcon role={role} />
        <div className="wiring-head-text">
          <NameField brickId={brickId} name={name} />
          <span className="wiring-sub" data-testid="wiring-sub">{describe(role, brickId, creation)}</span>
        </div>
      </div>
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
        <p className="wiring-hint" data-testid="wiring-hint">{hint}</p>
        {covered && <p className="wiring-hint" data-testid="wiring-side-hint">{MOTORS_GO_ON_THE_SIDES}</p>}
      </div>
      {(beside?.fix.ok || covered) && (
        <div className="wiring-actions">
          {beside?.fix.ok && <button type="button" className="wiring-button primary" onClick={() => putOnRobot(brickId, beside.robot.id)} data-testid="wiring-put-on">{beside.fix.label}</button>}
          {covered && <button type="button" className="wiring-button primary" onClick={() => moveMotorToSide(brickId)} data-testid="wiring-to-side">{MOVE_TO_SIDE}</button>}
        </div>
      )}
      <BlockPreview role={role} name={name} port={cable?.port ?? null} />
      <div className="wiring-actions">
        {plugged && <button type="button" className="wiring-button" onClick={() => unplugDevice(brickId)}>Unplug</button>}
        {plugged && free[0] && <button type="button" className="wiring-button" onClick={() => moveDeviceToPort(brickId, free[0])}>Move to port {free[0]}</button>}
        {!plugged && free[0] && <button type="button" className="wiring-button primary" onClick={() => plugDeviceIn(brickId, free[0])}>Plug into port {free[0]}</button>}
      </div>
    </section>
  )
}

function HubInspector({ hubId }: { hubId: string }) {
  const { model, byId } = useWiringContext()
  const hub = byId.get(hubId)!
  const name = deviceName(model.input, hub)
  const ports = usePorts(hubId)
  const used = ports.filter((port) => port.used).length
  const select = useBrickStore((state) => state.selectBrick)
  return (
    <section className="wiring-inspector" aria-label={`${name} ports`} data-testid="robotics-hub-inspector" data-device-id={hubId}>
      <div className="wiring-head">
        <RoleIcon role="hub" />
        <div className="wiring-head-text">
          <NameField brickId={hubId} name={name} />
          <span className="wiring-sub">Hub · {used === 4 ? 'all four ports used' : `${4 - used} of 4 ports free`}</span>
        </div>
      </div>
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
      <p className="wiring-hint">Select a port’s part to see its cable. Cables route themselves; there is nothing to drag along a path.</p>
    </section>
  )
}
