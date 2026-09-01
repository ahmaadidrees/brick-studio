import { RigidBody } from '@react-three/rapier'
import { EXPLORE_PLATE_COLOR } from './toyRoom'
import {
  ToyRoomAtmosphere,
  ToyRoomColliders,
  ToyRoomWorld,
  useToyRoomFeatures,
} from './ToyRoomWorld'
import { TOY_ROOM_DESCRIPTOR } from './descriptor'
import type { EnvironmentContentModule, EnvironmentRenderProps } from '../types'

export function ToyRoomRig({ compact, reducedMotion, mode }: EnvironmentRenderProps) {
  const features = useToyRoomFeatures(compact, reducedMotion)
  return (
    <>
      <ToyRoomAtmosphere />
      {mode === 'build' && <ToyRoomWorld features={features} />}
    </>
  )
}

export function ToyRoomWorldSlot({ compact, reducedMotion }: EnvironmentRenderProps) {
  const features = useToyRoomFeatures(compact, reducedMotion)
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <ToyRoomColliders />
      </RigidBody>
      <ToyRoomWorld features={features} />
    </>
  )
}

const module: EnvironmentContentModule = {
  descriptor: TOY_ROOM_DESCRIPTOR,
  Rig: ToyRoomRig,
  World: ToyRoomWorldSlot,
  surface: { plateColor: EXPLORE_PLATE_COLOR, showStuds: true, finish: 'clearcoat' },
}

export default module
