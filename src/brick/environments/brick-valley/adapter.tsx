import { ScaledEnvironment } from '../ScaledEnvironment'
import { BrickValley, SceneAtmosphere } from './BrickValleyScene'
import { BRICK_VALLEY_DESCRIPTOR } from './descriptor'
import type { EnvironmentContentModule, EnvironmentRenderProps } from '../types'

export function BrickValleyRig({ compact, reducedMotion, mode, plateSize }: EnvironmentRenderProps) {
  return (
    <>
      <SceneAtmosphere explore />
      {mode === 'build' && <ScaledEnvironment plateSize={plateSize}><BrickValley compact={compact} reducedMotion={reducedMotion} withPhysics={false} /></ScaledEnvironment>}
    </>
  )
}

export function BrickValleyWorldSlot({ compact, reducedMotion, plateSize }: EnvironmentRenderProps) {
  return <ScaledEnvironment plateSize={plateSize}><BrickValley compact={compact} reducedMotion={reducedMotion} /></ScaledEnvironment>
}

const module: EnvironmentContentModule = {
  descriptor: BRICK_VALLEY_DESCRIPTOR,
  Rig: BrickValleyRig,
  World: BrickValleyWorldSlot,
  surface: { plateColor: '#e9edef', showStuds: true, finish: 'clearcoat' },
}

export default module
