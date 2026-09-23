import type { RoboticsDeviceKind } from '../parts/catalog'
import type { LightColor } from '../program/types'
import type { RunObservation, SensorReading } from '../run/types'
import type { RoboticsState } from '../state/roboticsStore'
import { useStageStore } from '../state/stageStore'

/**
 * "Right now" in the device inspector (contract §5: selecting a device shows its
 * current reading or output). Everything the inspector shows about a live device
 * goes through `selectDeviceReading`, so the Code view can point it at the stage
 * later by changing `liveReading` alone (see `readingFromObservation`). Today the
 * only live source in Build is the mechanics Nudge.
 */
export type DeviceReadingValues = {
  /** Motors and hinge motors. Degrees: a motor's output angle, or the arm angle from its built pose. */
  motor?: { powerPercent: number; positionDegrees: number; blocked?: boolean; hinge?: boolean }
  sensor?: SensorReading
  light?: LightColor | null
  button?: boolean
}

type ReadingState = Pick<RoboticsState, 'sim' | 'motorAngles' | 'hingeReports'>

/** What the Nudge knows about a device right now, or null when no nudge runs it. */
export function readingFromNudge(state: ReadingState, deviceId: string): DeviceReadingValues | null {
  const { sim } = state
  if (!sim || sim.mechanics.disposed) return null
  const hinge = state.hingeReports[deviceId]
  if (hinge) return { motor: { powerPercent: 0, positionDegrees: hinge.angle, blocked: hinge.blocked, hinge: true } }
  const angle = state.motorAngles[deviceId]
  if (angle === undefined) return null
  return { motor: { powerPercent: sim.mechanics.motorPower(deviceId) * 100, positionDegrees: (angle * 180) / Math.PI } }
}

/** The same values read off a run's observation (the Code view's stage), for when it feeds the inspector. */
export function readingFromObservation(observation: Pick<RunObservation, 'motors' | 'sensors' | 'lights' | 'buttons'>, deviceId: string): DeviceReadingValues | null {
  const motor = observation.motors[deviceId]
  if (motor) return { motor: { powerPercent: motor.powerPercent, positionDegrees: motor.positionDegrees } }
  const sensor = observation.sensors[deviceId]
  if (sensor) return { sensor }
  if (deviceId in observation.lights) return { light: observation.lights[deviceId] }
  if (deviceId in observation.buttons) return { button: observation.buttons[deviceId] }
  return null
}

/** The live source the inspector reads: the open stage's observation first (the Code view's run), else the Nudge. */
function liveReading(state: ReadingState, deviceId: string): DeviceReadingValues | null {
  const observation = useStageStore.getState().stageObservation
  return (observation && readingFromObservation(observation, deviceId)) ?? readingFromNudge(state, deviceId)
}

const degrees = (value: number) => `${Math.round(value)}°`

/** Plain words for a reading: "No power" when unplugged, "Stopped" at rest, the live values while something runs. */
export function describeReading(role: RoboticsDeviceKind, plugged: boolean, values: DeviceReadingValues | null): string {
  if (role === 'hub') return ''
  if (!plugged) return 'No power'
  if (values?.motor) {
    const { powerPercent, positionDegrees, blocked, hinge } = values.motor
    if (hinge || role === 'hinge-motor') return `Arm at ${degrees(positionDegrees)}${blocked ? ' · blocked' : ''}`
    const power = Math.round(powerPercent)
    return power === 0 ? `Stopped · output at ${degrees(positionDegrees)}` : `${power} % · output at ${degrees(positionDegrees)}`
  }
  if (values?.sensor) return values.sensor.hit ? `Sees something ${values.sensor.distanceStuds.toFixed(1)} studs away` : 'Nothing in range'
  if (values && 'light' in values) return values.light ? `Lit ${values.light}` : 'Off'
  if (values && 'button' in values) return values.button ? 'Pressed' : 'Not pressed'
  switch (role) {
    case 'motor':
    case 'hinge-motor': return 'Stopped'
    case 'distance-sensor': return 'Waiting · it reads when the creation runs'
    case 'light': return 'Off'
    case 'button': return 'Not pressed'
  }
}

/**
 * The one selector the inspector reads "Right now" through. It returns a string, so a
 * component can subscribe with it directly and re-render only when the words change.
 */
export function selectDeviceReading(state: ReadingState, deviceId: string, role: RoboticsDeviceKind, plugged: boolean): string {
  return describeReading(role, plugged, plugged ? liveReading(state, deviceId) : null)
}
