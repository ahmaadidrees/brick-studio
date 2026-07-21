import type { PartDefinition, PartId, SlotId } from './types'

export const PARTS: Record<PartId, PartDefinition> = {
  motor_left: {
    id: 'motor_left',
    name: 'Left drive motor',
    shortName: 'Left motor',
    category: 'motion',
    color: '#6857e5',
    accent: '#c9c2ff',
    description: 'Snaps to the left side and powers two wheels.',
    compatibleSlots: ['drive_left'],
    mass: 1.4,
  },
  motor_right: {
    id: 'motor_right',
    name: 'Right drive motor',
    shortName: 'Right motor',
    category: 'motion',
    color: '#6857e5',
    accent: '#c9c2ff',
    description: 'Snaps to the right side and powers two wheels.',
    compatibleSlots: ['drive_right'],
    mass: 1.4,
  },
  color_sensor: {
    id: 'color_sensor',
    name: 'Color sensor',
    shortName: 'Color sensor',
    category: 'sense',
    color: '#24a7a0',
    accent: '#a9f4df',
    description: 'Looks down at the road and reports its color.',
    compatibleSlots: ['sensor_front'],
    mass: 0.4,
  },
  seat: {
    id: 'seat',
    name: 'Rider seat',
    shortName: 'Seat',
    category: 'ride',
    color: '#f3a93c',
    accent: '#ffe3a3',
    description: 'Lets your block buddy board the rover.',
    compatibleSlots: ['seat_center'],
    mass: 0.7,
  },
  battery: {
    id: 'battery',
    name: 'Lighthouse battery',
    shortName: 'Battery',
    category: 'mission',
    color: '#f0d548',
    accent: '#fff4ae',
    description: 'The precious cargo needed at the lighthouse.',
    compatibleSlots: ['cargo_rear'],
    mass: 0.8,
  },
  bumper: {
    id: 'bumper',
    name: 'Safety bumper',
    shortName: 'Bumper',
    category: 'structure',
    color: '#ef6d55',
    accent: '#ffc2b4',
    description: 'A cheerful finishing piece for the rover nose.',
    compatibleSlots: ['bumper_front'],
    mass: 0.3,
  },
}

export const PART_ORDER: PartId[] = [
  'motor_left',
  'motor_right',
  'color_sensor',
  'seat',
  'battery',
  'bumper',
]

export const SLOT_LABELS: Record<SlotId, string> = {
  drive_left: 'left drive rail',
  drive_right: 'right drive rail',
  sensor_front: 'front sensor port',
  seat_center: 'center seat studs',
  cargo_rear: 'rear cargo studs',
  bumper_front: 'front bumper pins',
}

export const REQUIRED_SLOTS: SlotId[] = [
  'drive_left',
  'drive_right',
  'sensor_front',
  'seat_center',
  'cargo_rear',
]
