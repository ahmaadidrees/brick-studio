import type { BlockDiagnostic, DeviceId, LightColor } from '../program/types'
import type { ActuatorIntent } from './types'

/**
 * The arbiter (contract §8, CP2-PLAN §1): per tick, at most one command per actuator.
 *
 *   1. An intent for a device that is not plugged in is dropped; the device gets one
 *      `device.unplugged` warning per run ("Left motor is not plugged in, so it did nothing").
 *      An intent for a device that is not part of the creation is dropped the same way.
 *   2. A controller script's intent (when joystick moves / when controls update) wins for
 *      every actuator it wrote this tick.
 *   3. Otherwise the later autonomous script in order wins. The overruled block gets one
 *      `runtime.two-scripts-one-motor` info per run; a script writing the same motor twice
 *      in one tick simply keeps its last word.
 *   4. The winner latches: an actuator keeps its last command until another command, Stop
 *      or Reset (a script ending does not stop its motors).
 *
 * Ported in spirit from `codex/robotics-workshop` (`runtime/arbiter.ts`); what changed: no
 * TTL (commands latch instead of expiring), a controller class that wins instead of a
 * policy gate, and the first-writer-wins conflict became later-script-wins with a note.
 */
export type ActuatorKind = 'motor' | 'hinge' | 'light'

export type ArbiterDevice = { id: DeviceId; kind: ActuatorKind; name: string; plugged: boolean }

/** What a motor or hinge motor is doing: running at a power, holding a target, or braked. */
export type MotorCommand = { kind: 'power'; percent: number } | { kind: 'target'; degrees: number } | { kind: 'stop' }

export type ArbitratedCommand =
  | { deviceId: DeviceId; kind: 'motor' | 'hinge'; command: MotorCommand; intent: ActuatorIntent }
  | { deviceId: DeviceId; kind: 'light'; color: LightColor | null; intent: ActuatorIntent }

export type ArbitrationResult = {
  /** The winning intent per actuator this tick, in the order each actuator was first written. */
  winners: ArbitratedCommand[]
  /** Winners whose latched command differs from what the actuator was already doing (what must be applied). */
  changed: ArbitratedCommand[]
  /** New this tick; each problem is reported once per run. */
  diagnostics: BlockDiagnostic[]
}

export type Arbiter = {
  arbitrate(intents: readonly ActuatorIntent[]): ArbitrationResult
  /** The latched command of a motor or hinge motor (`stop` until it is given one). */
  motorCommand(deviceId: DeviceId): MotorCommand
  /** The latched colour of a light (`null` is off). */
  lightColor(deviceId: DeviceId): LightColor | null
  lights(): Record<DeviceId, LightColor | null>
  /** Stop: every motor and hinge motor latches `stop`; lights keep their colour. */
  stopAll(): void
  /** A fresh run: every motor stopped, every light off, and the once-per-run notes forgotten. */
  reset(): void
}

const clampPercent = (value: number) => Math.max(-100, Math.min(100, value))

function commandOf(intent: ActuatorIntent): MotorCommand | null {
  switch (intent.kind) {
    case 'motorPower': return Number.isFinite(intent.percent) ? { kind: 'power', percent: clampPercent(intent.percent) } : null
    case 'motorTarget': return Number.isFinite(intent.degrees) ? { kind: 'target', degrees: intent.degrees } : null
    case 'motorStop': return { kind: 'stop' }
    default: return null
  }
}

const sameCommand = (a: MotorCommand, b: MotorCommand) =>
  a.kind === b.kind && (a.kind !== 'power' || a.percent === (b as typeof a).percent) && (a.kind !== 'target' || a.degrees === (b as typeof a).degrees)

export function createArbiter(devices: readonly ArbiterDevice[]): Arbiter {
  const byId = new Map(devices.map((device) => [device.id, device]))
  const motors = new Map<DeviceId, MotorCommand>()
  const lights = new Map<DeviceId, LightColor | null>()
  const warnedDevices = new Set<string>()
  const notedBlocks = new Set<string>()

  const resetLatches = () => {
    motors.clear()
    lights.clear()
    for (const device of devices) {
      if (device.kind === 'light') lights.set(device.id, null)
      else motors.set(device.id, { kind: 'stop' })
    }
  }
  resetLatches()

  const warnOnce = (key: string, diagnostic: BlockDiagnostic, into: BlockDiagnostic[]) => {
    if (warnedDevices.has(key)) return
    warnedDevices.add(key)
    into.push(diagnostic)
  }

  const noteOverruled = (loser: ActuatorIntent, winner: ActuatorIntent, device: ArbiterDevice, into: BlockDiagnostic[]) => {
    if (device.kind === 'light') return
    const key = loser.source.blockId ?? `${loser.source.scriptId}:${device.id}`
    if (notedBlocks.has(key)) return
    notedBlocks.add(key)
    const message = winner.source.controller
      ? `A controller script also drives ${device.name} and wins, so this block was overruled.`
      : `Another script also drives ${device.name}; the later script wins, so this block was overruled.`
    into.push({ code: 'runtime.two-scripts-one-motor', severity: 'info', message, blockId: loser.source.blockId ?? null, deviceId: device.id, scriptId: loser.source.scriptId })
  }

  return {
    arbitrate(intents) {
      const diagnostics: BlockDiagnostic[] = []
      const winning = new Map<DeviceId, ActuatorIntent>()
      for (const intent of intents) {
        const device = byId.get(intent.deviceId)
        if (!device) {
          warnOnce(`missing:${intent.deviceId}`, { code: 'device.not-in-creation', severity: 'warning', message: 'That part is not part of this creation, so it did nothing.', blockId: intent.source.blockId ?? null, deviceId: intent.deviceId, scriptId: intent.source.scriptId }, diagnostics)
          continue
        }
        const isLightIntent = intent.kind === 'light'
        if (isLightIntent !== (device.kind === 'light')) continue
        if (!device.plugged) {
          warnOnce(`unplugged:${device.id}`, { code: 'device.unplugged', severity: 'warning', message: `${device.name} is not plugged in, so it did nothing`, blockId: intent.source.blockId ?? null, deviceId: device.id, scriptId: intent.source.scriptId }, diagnostics)
          continue
        }
        if (!isLightIntent && !commandOf(intent)) continue
        const current = winning.get(device.id)
        if (!current) { winning.set(device.id, intent); continue }
        if (current.source.controller && !intent.source.controller) {
          // A controller script already wrote this actuator this tick: it keeps it.
          noteOverruled(intent, current, device, diagnostics)
          continue
        }
        if (current.source.scriptId !== intent.source.scriptId) noteOverruled(current, intent, device, diagnostics)
        winning.set(device.id, intent)
      }

      const winners: ArbitratedCommand[] = []
      const changed: ArbitratedCommand[] = []
      for (const [deviceId, intent] of winning) {
        const device = byId.get(deviceId)!
        if (intent.kind === 'light') {
          const entry: ArbitratedCommand = { deviceId, kind: 'light', color: intent.color, intent }
          winners.push(entry)
          if (lights.get(deviceId) !== intent.color) changed.push(entry)
          lights.set(deviceId, intent.color)
          continue
        }
        const command = commandOf(intent)!
        const entry: ArbitratedCommand = { deviceId, kind: device.kind as 'motor' | 'hinge', command, intent }
        winners.push(entry)
        const latched = motors.get(deviceId)
        if (!latched || !sameCommand(latched, command)) changed.push(entry)
        motors.set(deviceId, command)
      }
      return { winners, changed, diagnostics }
    },
    motorCommand: (deviceId) => motors.get(deviceId) ?? { kind: 'stop' },
    lightColor: (deviceId) => lights.get(deviceId) ?? null,
    lights: () => Object.fromEntries(lights),
    stopAll() {
      for (const id of motors.keys()) motors.set(id, { kind: 'stop' })
    },
    reset() {
      resetLatches()
      warnedDevices.clear()
      notedBlocks.clear()
    },
  }
}
