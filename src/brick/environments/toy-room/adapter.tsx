import { ScaledEnvironment } from '../ScaledEnvironment'
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

export function ToyRoomRig({ compact, reducedMotion, mode, plateSize }: EnvironmentRenderProps) {
  const features = useToyRoomFeatures(compact, reducedMotion)
  return (
    <>
      <ToyRoomAtmosphere />
      {mode === 'build' && <ScaledEnvironment plateSize={plateSize}><ToyRoomWorld features={features} /></ScaledEnvironment>}
    </>
  )
}

export function ToyRoomWorldSlot({ compact, reducedMotion, plateSize }: EnvironmentRenderProps) {
  const features = useToyRoomFeatures(compact, reducedMotion)
  return (
    <ScaledEnvironment plateSize={plateSize}>
      <RigidBody type="fixed" colliders={false}>
        <ToyRoomColliders />
      </RigidBody>
      <ToyRoomWorld features={features} />
    </ScaledEnvironment>
  )
}

const module: EnvironmentContentModule = {
  descriptor: TOY_ROOM_DESCRIPTOR,
  Rig: ToyRoomRig,
  World: ToyRoomWorldSlot,
  surface: { plateColor: EXPLORE_PLATE_COLOR, showStuds: true, finish: 'clearcoat' },
}

export default module
