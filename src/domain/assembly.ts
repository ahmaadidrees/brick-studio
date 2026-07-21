import { PARTS, REQUIRED_SLOTS } from './parts'
import type { Connection, SlotId } from './types'

export type CompiledAssembly = {
  totalMass: number
  connectedSlots: Set<SlotId>
  missingSlots: SlotId[]
  readyToDrive: boolean
  readyForMission: boolean
}

export function compileAssembly(connections: Connection[]): CompiledAssembly {
  const connectedSlots = new Set(connections.map((connection) => connection.slotId))
  const missingSlots = REQUIRED_SLOTS.filter((slot) => !connectedSlots.has(slot))
  const totalMass = 3.5 + connections.reduce((sum, connection) => sum + PARTS[connection.partId].mass, 0)

  return {
    totalMass,
    connectedSlots,
    missingSlots,
    readyToDrive: connectedSlots.has('drive_left') && connectedSlots.has('drive_right'),
    readyForMission: missingSlots.length === 0,
  }
}

export const RED_ZONE = { start: -10.9, end: -9.65 }

export function readTrackColor(sensorWorldZ: number, sensorHeight: number) {
  if (sensorHeight > 0.65) return 'none' as const
  if (sensorWorldZ <= RED_ZONE.end && sensorWorldZ >= RED_ZONE.start) return 'red' as const
  return 'cream' as const
}
