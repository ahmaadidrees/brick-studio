import { ScaledEnvironment } from '../ScaledEnvironment'
import { SkyIslandRig, SkyIslandWorld } from './SkyIslandWorld'
import { SKY_ISLAND, SKY_PALETTE } from './skyIsland'
import { SKY_ISLAND_DESCRIPTOR } from './descriptor'
import type { EnvironmentContentModule, EnvironmentRenderProps } from '../types'

export function SkyIslandRigSlot({ compact, reducedMotion, mode, plateSize }: EnvironmentRenderProps) {
  return (
    <>
      <SkyIslandRig compact={compact} />
      {mode === 'build' && <ScaledEnvironment plateSize={plateSize}><SkyIslandWorld compact={compact} reducedMotion={reducedMotion} withPhysics={false} /></ScaledEnvironment>}
    </>
  )
}

export function SkyIslandWorldSlot({ compact, reducedMotion, plateSize }: EnvironmentRenderProps) {
  return <ScaledEnvironment plateSize={plateSize}><SkyIslandWorld compact={compact} reducedMotion={reducedMotion} /></ScaledEnvironment>
}

const module: EnvironmentContentModule = {
  descriptor: SKY_ISLAND_DESCRIPTOR,
  Rig: SkyIslandRigSlot,
  World: SkyIslandWorldSlot,
  surface: { plateColor: SKY_PALETTE.plate, showStuds: false, finish: 'clearcoat' },
  respawnBelowY: SKY_ISLAND.respawnY,
}

export default module
