import { BrickValley, SceneAtmosphere } from './BrickValleyScene'
import { BRICK_VALLEY_DESCRIPTOR } from './descriptor'
import type { EnvironmentContentModule, EnvironmentRenderProps } from '../types'

export function BrickValleyRig(_props: EnvironmentRenderProps) {
  return <SceneAtmosphere explore />
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
