/**
 * The Hackable kits (docs/qa/hackable-modes): one studio and one save format, three games. A project's kit comes from
 * its own design (`design.kit`), never from the address it was opened at, so a saved project always opens as itself.
 *
 * The Platformer and Racing (R1, docs/qa/hackable-modes/R1-SCREENS.md) are ready. 3D (D1) is listed so its projects
 * and powers can be named and refused politely; it turns `ready` on when its engine, toolbox, Build drawer and Stage
 * land.
 */
import { designKit, type KitId, type LevelDesign } from './core/contracts'
import { hasKitEngine } from './core'

export interface KitInfo {
  id: KitId
  /** Kid-facing name: "Hackable Platformer", "Hackable Racing", "Hackable 3D". */
  name: string
  /** Its short address. */
  route: string
  /** The studio can open it: its engine runs and its screens are in. */
  ready: boolean
}

export const KITS: Readonly<Record<KitId, KitInfo>> = {
  platformer: { id: 'platformer', name: 'Hackable Platformer', route: '/2d/hackable', ready: true },
  race: { id: 'race', name: 'Hackable Racing', route: '/2d/hackable-race', ready: true },
  '3d': { id: '3d', name: 'Hackable 3D', route: '/3d/hackable', ready: true },
}

export const kitOf = (design: Pick<LevelDesign, 'kit'>): KitInfo => KITS[designKit(design)]

/** Can this version of the studio open projects of this kit? */
export const kitReady = (kit: KitId): boolean => KITS[kit].ready && hasKitEngine(kit)

/** Why this design cannot open here, in the kid's words, or null when it can. */
export function kitNotReady(design: Pick<LevelDesign, 'kit'>): string | null {
  const kit = kitOf(design)
  return kitReady(kit.id) ? null : `This project is a ${kit.name} project. This version of Brickgineers cannot open ${kit.name} yet.`
}
