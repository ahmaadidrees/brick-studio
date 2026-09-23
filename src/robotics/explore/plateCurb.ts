import { PLATE_HEIGHT, STUD } from '../../brick/parts'
import type { Vec3 } from '../model/vec'
import type { TestProp } from '../run/types'

/**
 * The curb around the build plate while a robot drives in My world (a ride in Explore, and the Drive
 * view's My world). Pure.
 *
 * Why a curb: a driving robot runs in its own physics world (`run/controller.ts`), whose flat ground
 * reaches 20 units past the plate that nothing draws, while Explore's own ground is the plate: in the
 * Classic studio there is nothing past it at all (the character falls and respawns), and a world's
 * scenery (the Toy Room's desk, Brick Valley's hills, Sky Island) is not in the robot's world. So the
 * only ground both agree on is the plate. A robot that crossed its edge used to float on invisible
 * ground and, two studs out, was taken away with its rider thrown off. Instead, a low wall stands just
 * outside the edge, drawn where the student can see it and solid for the robot: it bumps and stops,
 * like the Test plate's fence. The walls meet at the corners, so there is no gap to slip through.
 */
export const CURB = Object.freeze({
  /** As tall as the Test plate's fence (4 plates), nearly a wheel's radius: a wheel pushing on it cannot climb it. */
  plates: 4,
  thicknessStuds: 1,
})

/** The walls beyond the plate's +Z, -Z, -X and +X edges. */
export const CURB_PROP_IDS = ['curb-z-max', 'curb-z-min', 'curb-x-min', 'curb-x-max'] as const

export const isCurbProp = (prop: TestProp): prop is Extract<TestProp, { kind: 'wall' }> => prop.kind === 'wall' && prop.id.startsWith('curb-')

/** Half the plate's width, world units (the plate is centred on the origin). */
export const plateHalfWidth = (plateSize: number) => (plateSize * STUD) / 2

/** The curb's four walls, standing on the ground just outside the plate's edge (world units). */
export function plateCurb(plateSize: number): TestProp[] {
  const half = plateHalfWidth(plateSize)
  const thick = CURB.thicknessStuds * STUD
  const height = CURB.plates * PLATE_HEIGHT
  const middle = half + thick / 2
  const across = 2 * (half + thick)
  const wall = (id: string, center: Vec3, size: Vec3): TestProp => ({ id, kind: 'wall', center, size })
  return [
    wall(CURB_PROP_IDS[0], { x: 0, y: height / 2, z: middle }, { x: across, y: height, z: thick }),
    wall(CURB_PROP_IDS[1], { x: 0, y: height / 2, z: -middle }, { x: across, y: height, z: thick }),
    wall(CURB_PROP_IDS[2], { x: -middle, y: height / 2, z: 0 }, { x: thick, y: height, z: 2 * half }),
    wall(CURB_PROP_IDS[3], { x: middle, y: height / 2, z: 0 }, { x: thick, y: height, z: 2 * half }),
  ]
}
