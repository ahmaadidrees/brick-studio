import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { brickOriginFor } from '../model/grid'
import { rotateByQuat, type Vec3 } from '../model/vec'
import { useDriveView } from '../drive/driveViewState'
import { useStageStore } from '../state/stageStore'
import { useRoboticsStore } from '../state/roboticsStore'

/**
 * In the Drive view's My world, the camera keeps the robot in view as it drives: each frame the
 * orbit target and the camera move together by how far the robot's middle moved, so the student's
 * own viewing angle and zoom stay as they left them (they can still orbit). The fenced test plate
 * is framed whole and never followed. Camera state only; nothing is written.
 */
export default function DriveFollow() {
  const driving = useDriveView((state) => state.creationId)
  const stage = useStageStore((state) => state.stage)
  const { camera, controls } = useThree()
  const last = useRef<{ generation: number; center: Vec3 } | null>(null)
  const active = Boolean(driving && stage && stage.creationId === driving && stage.space === 'myWorld' && stage.creation.drivePair)

  useFrame((_, delta) => {
    if (!active || !stage) { last.current = null; return }
    const center = robotCenter(stage)
    if (!center) return
    if (!last.current || last.current.generation !== stage.generation) {
      last.current = { generation: stage.generation, center }
      return
    }
    const orbit = controls as OrbitControlsImpl | null
    if (!orbit?.target) return
    // Ease toward the robot so a Reset (a jump back to the built pose) glides instead of snapping.
    const ease = Math.min(1, delta * 8)
    const moved = { x: (center.x - last.current.center.x) * ease, y: 0, z: (center.z - last.current.center.z) * ease }
    if (Math.abs(moved.x) < 1e-5 && Math.abs(moved.z) < 1e-5) return
    orbit.target.set(orbit.target.x + moved.x, orbit.target.y, orbit.target.z + moved.z)
    camera.position.set(camera.position.x + moved.x, camera.position.y, camera.position.z + moved.z)
    orbit.update()
    last.current = { generation: stage.generation, center: { x: last.current.center.x + moved.x, y: center.y, z: last.current.center.z + moved.z } }
  })
  return null
}

/** Where the robot's middle is now: its built middle carried by the body that holds its hub (or its first brick). */
function robotCenter(stage: NonNullable<ReturnType<typeof useStageStore.getState>['stage']>): Vec3 | null {
  const creation = stage.creation
  const anchorId = creation.hubs[0]?.brickId ?? creation.brickIds[0]
  if (!anchorId) return null
  const bodyId = stage.controller.bodyOfBrick(anchorId)
  const pose = bodyId ? stage.controller.poses().get(bodyId) : undefined
  if (!pose) return null
  const input = useRoboticsStore.getState().model.input
  const bricks = input.bricks.filter((brick) => creation.brickIds.includes(brick.id))
  if (!bricks.length) return null
  let x = 0
  let z = 0
  for (const brick of bricks) {
    const origin = brickOriginFor(brick, input.partMap[brick.partId], input.plateSize)
    x += origin.x
    z += origin.z
  }
  const built = { x: x / bricks.length, y: 0, z: z / bricks.length }
  const moved = rotateByQuat(pose.rotation, built)
  return { x: moved.x + pose.position.x, y: 0, z: moved.z + pose.position.z }
}
