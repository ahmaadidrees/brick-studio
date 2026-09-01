import { BrickValley, SceneAtmosphere } from './BrickValleyScene'
import { BRICK_VALLEY_DESCRIPTOR } from './descriptor'
import type { EnvironmentContentModule, EnvironmentRenderProps } from '../types'

export function BrickValleyRig({ compact, reducedMotion, mode }: EnvironmentRenderProps) {
  return (
    <>
      <SceneAtmosphere explore />
      {mode === 'build' && <BrickValley compact={compact} reducedMotion={reducedMotion} withPhysics={false} />}
    </>
  )
}

export function BrickValleyWorldSlot({ compact, reducedMotion }: EnvironmentRenderProps) {
  return <BrickValley compact={compact} reducedMotion={reducedMotion} />
}

const module: EnvironmentContentModule = {
  descriptor: BRICK_VALLEY_DESCRIPTOR,
  Rig: BrickValleyRig,
  World: BrickValleyWorldSlot,
  surface: { plateColor: '#e9edef', showStuds: true, finish: 'clearcoat' },
}

export default module
