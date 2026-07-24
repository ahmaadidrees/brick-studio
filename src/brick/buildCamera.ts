import { getFrameDistance, type BuildBounds } from './bounds'
import { GRID_SIZE, PLATE_HEIGHT, STUD } from './parts'
import type { ViewPreset } from './types'

export const BUILD_CAMERA_MIN_DISTANCE = 3
export const BUILD_CAMERA_ABSOLUTE_MAX_DISTANCE = 180
const TARGET_HORIZONTAL_MARGIN = STUD * 4
const TARGET_VERTICAL_MARGIN = STUD * 6
const HOME_DIRECTION = [14, 12, 16] as const

// Empty plate: non-selection presets frame a ~16-stud working area instead of the
// whole plate so the first brick lands at a readable zoom. Mirrors the getBuildBounds
// shape and padding (STUD * 2 horizontal, PLATE_HEIGHT * 3 vertical) so
// getFrameDistance treats it like real bounds. Camera limits still span the plate.
const WORKING_HALF_EXTENT = STUD * 8 + STUD * 2
const WORKING_HALF_HEIGHT = PLATE_HEIGHT + PLATE_HEIGHT * 3
const WORKING_AREA_BOUNDS: BuildBounds = {
  min: [-WORKING_HALF_EXTENT, -WORKING_HALF_HEIGHT, -WORKING_HALF_EXTENT],
  max: [WORKING_HALF_EXTENT, WORKING_HALF_HEIGHT, WORKING_HALF_EXTENT],
  center: [0, 0, 0],
  size: [WORKING_HALF_EXTENT * 2, WORKING_HALF_HEIGHT * 2, WORKING_HALF_EXTENT * 2],
  empty: true,
}

export type BuildCameraLimits = {
  targetMin: [number, number, number]
  targetMax: [number, number, number]
  minDistance: number
  maxDistance: number
}

export type BuildCameraPoint = {
  x: number
  y: number
  z: number
}

export type BuildFramePose = {
  target: BuildCameraPoint
  position: BuildCameraPoint
  distance: number
}

/**
 * Keeps navigation centered on the recoverable plate/build region. Framing still
 * uses the tighter placed-brick bounds, while panning always retains the plate.
 */
export function getBuildCameraLimits(
  bounds: BuildBounds,
  verticalFovDegrees: number,
  aspect: number,
): BuildCameraLimits {
  const halfPlate = GRID_SIZE * STUD / 2
  const frameDistance = getFrameDistance(bounds, verticalFovDegrees, aspect)

  return {
    targetMin: [
      Math.min(-halfPlate, bounds.min[0]) - TARGET_HORIZONTAL_MARGIN,
      -PLATE_HEIGHT,
      Math.min(-halfPlate, bounds.min[2]) - TARGET_HORIZONTAL_MARGIN,
    ],
    targetMax: [
      Math.max(halfPlate, bounds.max[0]) + TARGET_HORIZONTAL_MARGIN,
      Math.max(PLATE_HEIGHT, bounds.max[1]) + TARGET_VERTICAL_MARGIN,
      Math.max(halfPlate, bounds.max[2]) + TARGET_HORIZONTAL_MARGIN,
    ],
    minDistance: BUILD_CAMERA_MIN_DISTANCE,
    maxDistance: Math.min(
      BUILD_CAMERA_ABSOLUTE_MAX_DISTANCE,
      Math.max(42, frameDistance * 1.2),
    ),
  }
}

export function clampBuildCameraTarget<T extends BuildCameraPoint>(
  target: BuildCameraPoint,
  limits: BuildCameraLimits,
  output: T,
) {
  output.x = Math.max(limits.targetMin[0], Math.min(limits.targetMax[0], target.x))
  output.y = Math.max(limits.targetMin[1], Math.min(limits.targetMax[1], target.y))
  output.z = Math.max(limits.targetMin[2], Math.min(limits.targetMax[2], target.z))
  return output
}

export function createBuildFramePose(
  bounds: BuildBounds,
  preset: ViewPreset,
  verticalFovDegrees: number,
  aspect: number,
  selectedTarget: BuildCameraPoint | null = null,
): BuildFramePose {
  const frameBounds = bounds.empty && preset !== 'selection' ? WORKING_AREA_BOUNDS : bounds
  const target = preset === 'selection' && selectedTarget
    ? { ...selectedTarget }
    : { x: frameBounds.center[0], y: frameBounds.center[1], z: frameBounds.center[2] }
  const distance = preset === 'selection'
    ? 6
    : getFrameDistance(frameBounds, verticalFovDegrees, aspect)

  if (preset === 'top') {
    return {
      target,
      position: { x: target.x, y: target.y + distance, z: target.z + 0.01 },
      distance,
    }
  }

  if (preset === 'front') {
    return {
      target,
      position: { x: target.x, y: target.y + Math.max(5, distance * 0.24), z: target.z + distance },
      distance,
    }
  }

  if (preset === 'right') {
    return {
      target,
      position: { x: target.x + distance, y: target.y + Math.max(5, distance * 0.24), z: target.z },
      distance,
    }
  }

  if (preset === 'selection') {
    return {
      target,
      position: { x: target.x + 5, y: target.y + 4, z: target.z + 6 },
      distance,
    }
  }

  const magnitude = Math.hypot(...HOME_DIRECTION)
  return {
    target,
    position: {
      x: target.x + HOME_DIRECTION[0] / magnitude * distance,
      y: target.y + HOME_DIRECTION[1] / magnitude * distance,
      z: target.z + HOME_DIRECTION[2] / magnitude * distance,
    },
    distance,
  }
}
