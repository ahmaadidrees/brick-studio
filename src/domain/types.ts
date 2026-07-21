export type GameMode = 'build' | 'code' | 'test' | 'play'

export type PartId =
  | 'motor_left'
  | 'motor_right'
  | 'color_sensor'
  | 'seat'
  | 'battery'
  | 'bumper'

export type SlotId =
  | 'drive_left'
  | 'drive_right'
  | 'sensor_front'
  | 'seat_center'
  | 'cargo_rear'
  | 'bumper_front'

export type PartCategory = 'motion' | 'sense' | 'ride' | 'mission' | 'structure'

export type PartDefinition = {
  id: PartId
  name: string
  shortName: string
  category: PartCategory
  color: string
  accent: string
  description: string
  compatibleSlots: SlotId[]
  mass: number
}

export type Connection = {
  instanceId: string
  partId: PartId
  slotId: SlotId
}

export type RoverProgram = {
  speed: number
  stopOnRed: boolean
}

export type SimulationStatus = 'idle' | 'running' | 'stopped' | 'complete'

export type Telemetry = {
  sensorColor: 'none' | 'cream' | 'red'
  distanceTravelled: number
  motorSpeed: number
}
