import { describe, expect, it } from 'vitest'
import { getBuildBounds } from './bounds'
import {
  BUILD_CAMERA_ABSOLUTE_MAX_DISTANCE,
  BUILD_CAMERA_MIN_DISTANCE,
  clampBuildCameraTarget,
  createBuildFramePose,
  getBuildCameraLimits,
} from './buildCamera'
import { GRID_SIZE, STUD } from './parts'
import type { BrickInstance } from './types'

const edgeBuild: BrickInstance[] = [
  { id: 'edge', partId: 'brick_1x4', x: 60, y: 9, z: 31, rotation: 1, color: '#fff' },
]

describe('bounded Build camera', () => {
  it('keeps the plate in the target envelope and derives bounded zoom from the build and viewport', () => {
    const bounds = getBuildBounds([])
    const landscape = getBuildCameraLimits(bounds, 45, 16 / 9)
    const portrait = getBuildCameraLimits(bounds, 45, 9 / 16)
    const halfPlate = GRID_SIZE * STUD / 2

    expect(landscape.targetMin[0]).toBeLessThan(-halfPlate)
    expect(landscape.targetMax[0]).toBeGreaterThan(halfPlate)
    expect(landscape.minDistance).toBe(BUILD_CAMERA_MIN_DISTANCE)
    expect(landscape.maxDistance).toBeLessThanOrEqual(BUILD_CAMERA_ABSOLUTE_MAX_DISTANCE)
    expect(portrait.maxDistance).toBeGreaterThan(landscape.maxDistance)
  })

  it('clamps an arbitrarily lost orbit target back into the recoverable region', () => {
    const limits = getBuildCameraLimits(getBuildBounds(edgeBuild), 45, 1)
    const output = { x: 0, y: 0, z: 0 }

    expect(clampBuildCameraTarget({ x: 1000, y: -1000, z: -1000 }, limits, output)).toEqual({
      x: limits.targetMax[0],
      y: limits.targetMin[1],
      z: limits.targetMin[2],
    })
  })

  it('frames placed-brick bounds and falls back to the plate for an empty build', () => {
    const buildBounds = getBuildBounds(edgeBuild)
    const buildPose = createBuildFramePose(buildBounds, 'home', 45, 16 / 9)
    const emptyPose = createBuildFramePose(getBuildBounds([]), 'home', 45, 16 / 9)

    expect(buildPose.target.x).toBeCloseTo(buildBounds.center[0])
    expect(buildPose.target.y).toBeCloseTo(buildBounds.center[1])
    expect(buildPose.target.z).toBeCloseTo(buildBounds.center[2])
    expect(emptyPose.target).toEqual({ x: 0, y: 0, z: 0 })
    expect(emptyPose.distance).toBeGreaterThan(buildPose.distance)
  })

  it('focuses a selection without changing the requested target', () => {
    const selected = { x: 4, y: 3, z: -2 }
    const pose = createBuildFramePose(getBuildBounds(edgeBuild), 'selection', 45, 1, selected)

    expect(pose.target).toEqual(selected)
    expect(pose.position).toEqual({ x: 9, y: 7, z: 4 })
  })
})
