import { SkyIslandRig, SkyIslandWorld } from './SkyIslandWorld'
import { SKY_ISLAND, SKY_PALETTE } from './skyIsland'
import { SKY_ISLAND_DESCRIPTOR } from './descriptor'
import type { EnvironmentContentModule, EnvironmentRenderProps } from '../types'

export function SkyIslandRigSlot({ compact }: EnvironmentRenderProps) {
  return <SkyIslandRig compact={compact} />
}

export function SkyIslandWorldSlot({ compact, reducedMotion }: EnvironmentRenderProps) {
  return <SkyIslandWorld compact={compact} reducedMotion={reducedMotion} />
}

const module: EnvironmentContentModule = {
  descriptor: SKY_ISLAND_DESCRIPTOR,
  Rig: SkyIslandRigSlot,
  World: SkyIslandWorldSlot,
  surface: { plateColor: SKY_PALETTE.plate, showStuds: false, finish: 'clearcoat' },
  respawnBelowY: SKY_ISLAND.respawnY,
}

export default module
