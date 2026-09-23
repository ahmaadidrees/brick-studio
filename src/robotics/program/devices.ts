import type { DerivedCreation, DerivedDevice } from '../model/creations'
import { DEVICE_FIELD_KINDS, NO_DEVICE, noDeviceOption, type DeviceMenuKind, type DeviceMenuOption } from './catalog/blocks'
import type { DeviceId, RoboticsProgram } from './types'
import { isRecord, walkBlocks } from './workspaceJson'

/**
 * Device dropdowns and remembered names (contract §6, CP2-PLAN §1 "Device identity").
 *
 * A block keeps the brick id; the name and the port are labels read off the build every
 * time the menu is built. Blockly refuses a value that is not among a dropdown's options
 * and quietly falls back to the first one, which would re-point a block at another part
 * the moment its part is deleted. So every id the program references stays in the menu,
 * labelled `front sensor (missing)` from the program's `deviceNames`, and the compiler,
 * not the menu, reports the problem.
 */

export type ProgramDeviceSource = Pick<RoboticsProgram, 'workspace' | 'deviceNames'>

export const DEVICE_KIND_WORDS: Readonly<Record<DeviceMenuKind, string>> = Object.freeze({ motor: 'motor', sensor: 'sensor', light: 'light', button: 'button' })

/** The creation's devices a dropdown of this kind lists, in build order (motors, then hinge motors). */
export function devicesOfKind(creation: DerivedCreation, kind: DeviceMenuKind): DerivedDevice[] {
  switch (kind) {
    case 'motor': return [...creation.motors, ...creation.hinges]
    case 'sensor': return creation.sensors
    case 'light': return creation.lights
    case 'button': return creation.buttons
  }
}

/** `Left motor · A`, or `Left motor · not plugged in`. */
export function deviceLabel(device: Pick<DerivedDevice, 'name' | 'port' | 'plugged'>): string {
  return device.plugged && device.port ? `${device.name} · ${device.port.port}` : `${device.name} · not plugged in`
}

export type DeviceReference = { kind: DeviceMenuKind; deviceId: DeviceId }

/** Every device id the workspace's blocks name, with the kind of field that names it, first mention first. */
export function referencedDevices(workspace: unknown): DeviceReference[] {
  const found: DeviceReference[] = []
  const seen = new Set<string>()
  walkBlocks(workspace, (block) => {
    if (!isRecord(block.fields)) return
    for (const [field, value] of Object.entries(block.fields)) {
      const kind = DEVICE_FIELD_KINDS[field]
      if (!kind || typeof value !== 'string' || value === NO_DEVICE) continue
      const key = `${kind}:${value}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ kind, deviceId: value })
    }
  })
  return found
}

function allDevices(creation: DerivedCreation): { device: DerivedDevice; kind: DeviceMenuKind }[] {
  return (['motor', 'sensor', 'light', 'button'] as const).flatMap((kind) => devicesOfKind(creation, kind).map((device) => ({ device, kind })))
}

/**
 * Dropdown options for one kind of device: the creation's devices labelled with their
 * port, then any id the program (or `keep`, the field's current value) references that
 * the creation no longer has, labelled as missing so the value survives. Never empty:
 * a creation with no device of the kind gets the single `no … yet` option.
 */
export function deviceOptions(creation: DerivedCreation, program: ProgramDeviceSource | null | undefined, kind: DeviceMenuKind, keep?: string | null): DeviceMenuOption[] {
  const options: DeviceMenuOption[] = devicesOfKind(creation, kind).map((device) => [deviceLabel(device), device.brickId])
  const listed = new Set(options.map(([, value]) => value))
  const referenced = program ? referencedDevices(program.workspace).filter((reference) => reference.kind === kind).map((reference) => reference.deviceId) : []
  if (keep && keep !== NO_DEVICE) referenced.push(keep)
  for (const deviceId of referenced) {
    if (listed.has(deviceId)) continue
    listed.add(deviceId)
    const elsewhere = allDevices(creation).find((entry) => entry.device.brickId === deviceId)
    if (elsewhere) options.push([`${elsewhere.device.name} (not a ${DEVICE_KIND_WORDS[kind]})`, deviceId])
    else options.push([`${program?.deviceNames[deviceId] ?? `A ${DEVICE_KIND_WORDS[kind]}`} (missing)`, deviceId])
  }
  return options.length ? options : [noDeviceOption(kind)]
}

/**
 * `deviceNames` refreshed from the build: every id the workspace references gets its
 * current name when the creation still has it and keeps its last known name when it
 * does not; ids no longer referenced are forgotten. Returns the same program when
 * nothing changed, so a caller can skip a write.
 */
export function rememberDeviceNames<P extends ProgramDeviceSource>(program: P, creation: DerivedCreation): P {
  const present = new Map(allDevices(creation).map(({ device }) => [device.brickId, device.name]))
  const next: Record<string, string> = {}
  for (const { deviceId } of referencedDevices(program.workspace)) {
    const name = present.get(deviceId) ?? program.deviceNames[deviceId]
    if (name) next[deviceId] = name
  }
  const sorted = Object.fromEntries(Object.keys(next).sort().map((deviceId) => [deviceId, next[deviceId]]))
  const before = program.deviceNames
  const same = Object.keys(sorted).length === Object.keys(before).length && Object.entries(sorted).every(([deviceId, name]) => before[deviceId] === name)
  return same ? program : { ...program, deviceNames: sorted }
}
