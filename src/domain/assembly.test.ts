import { describe, expect, it } from 'vitest'
import { compileAssembly, readTrackColor } from './assembly'
import type { Connection } from './types'

const connection = (partId: Connection['partId'], slotId: Connection['slotId']): Connection => ({
  instanceId: `${partId}-${slotId}`,
  partId,
  slotId,
})

describe('assembly compiler', () => {
  it('requires both drive sides before the rover can move', () => {
    const oneMotor = compileAssembly([connection('motor_left', 'drive_left')])
    const twoMotors = compileAssembly([
      connection('motor_left', 'drive_left'),
      connection('motor_right', 'drive_right'),
    ])

    expect(oneMotor.readyToDrive).toBe(false)
    expect(twoMotors.readyToDrive).toBe(true)
  })

  it('recognizes a mission-ready rover', () => {
    const assembly = compileAssembly([
      connection('motor_left', 'drive_left'),
      connection('motor_right', 'drive_right'),
      connection('color_sensor', 'sensor_front'),
      connection('seat', 'seat_center'),
      connection('battery', 'cargo_rear'),
    ])

    expect(assembly.readyForMission).toBe(true)
    expect(assembly.missingSlots).toHaveLength(0)
  })
})

describe('physical color sensor', () => {
  it('reads red only while low enough and over the stopping tile', () => {
    expect(readTrackColor(-10.2, 0.25)).toBe('red')
    expect(readTrackColor(-10.2, 0.9)).toBe('none')
    expect(readTrackColor(-7, 0.25)).toBe('cream')
  })
})
