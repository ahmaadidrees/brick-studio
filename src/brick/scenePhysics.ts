export const CAMERA_PROBE_RADIUS = 0.22
export const CAMERA_SURFACE_PADDING = 0.08
export const CAMERA_MIN_DISTANCE = 0.65

const CAMERA_RECOVERY_RATE = 4.5

/**
 * Obstructions contract the boom immediately; a clear path restores the
 * requested distance gradually so the camera does not snap away from walls.
 */
export function resolveCameraBoomDistance(
  currentDistance: number | null,
  desiredDistance: number,
  obstructionTimeOfImpact: number | null,
  delta: number,
) {
  const allowedDistance = obstructionTimeOfImpact === null
    ? desiredDistance
    : Math.max(CAMERA_MIN_DISTANCE, obstructionTimeOfImpact - CAMERA_SURFACE_PADDING)

  if (currentDistance === null || allowedDistance < currentDistance) return allowedDistance
  return allowedDistance + (currentDistance - allowedDistance) * Math.exp(-CAMERA_RECOVERY_RATE * delta)
}
