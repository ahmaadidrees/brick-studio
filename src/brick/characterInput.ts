export type MutablePlanarVector = {
  x: number
  z: number
}

const INPUT_EPSILON = 1e-6

/**
 * Reads keyboard movement at the input boundary. Forward is always positive:
 * W/Up => z = +1, S/Down => z = -1. This same convention is used by touch.
 */
export function readKeyboardMove(keys: ReadonlySet<string>, out: MutablePlanarVector) {
  out.x = Number(keys.has('d') || keys.has('arrowright'))
    - Number(keys.has('a') || keys.has('arrowleft'))
  out.z = Number(keys.has('w') || keys.has('arrowup'))
    - Number(keys.has('s') || keys.has('arrowdown'))
  return clampPlanarInput(out.x, out.z, out)
}

/** Combines keyboard and already-normalized touch axes without exceeding unit length. */
export function combineMoveAxes(
  keyboard: Readonly<MutablePlanarVector>,
  touch: Readonly<MutablePlanarVector>,
  out: MutablePlanarVector,
) {
  return clampPlanarInput(keyboard.x + touch.x, keyboard.z + touch.z, out)
}

/** Preserves analog magnitude while clamping diagonals to the unit circle. */
export function clampPlanarInput(x: number, z: number, out: MutablePlanarVector) {
  const lengthSquared = x * x + z * z
  if (lengthSquared > 1) {
    const inverseLength = 1 / Math.sqrt(lengthSquared)
    out.x = x * inverseLength
    out.z = z * inverseLength
  } else if (lengthSquared <= INPUT_EPSILON) {
    out.x = 0
    out.z = 0
  } else {
    out.x = x
    out.z = z
  }
  return out
}

/**
 * Converts positive-forward input into a world-space direction using the live
 * camera yaw. `yaw` follows Brick Studio's orbit convention: the camera sits
 * behind `(-sin(yaw), -cos(yaw))`, so forward points away from the camera.
 *
 * The right basis is chosen from the actual view basis. At the initial yaw of
 * PI, forward is world -Z and screen-right is world +X.
 */
export function cameraRelativeMove(
  rightInput: number,
  forwardInput: number,
  yaw: number,
  out: MutablePlanarVector,
) {
  const inputLengthSquared = rightInput * rightInput + forwardInput * forwardInput
  if (inputLengthSquared <= INPUT_EPSILON) {
    out.x = 0
    out.z = 0
    return out
  }

  const inputScale = inputLengthSquared > 1 ? 1 / Math.sqrt(inputLengthSquared) : 1
  const right = rightInput * inputScale
  const forward = forwardInput * inputScale
  const sinYaw = Math.sin(yaw)
  const cosYaw = Math.cos(yaw)

  // forward = (sinYaw, cosYaw), view-right = (-cosYaw, sinYaw)
  out.x = sinYaw * forward - cosYaw * right
  out.z = cosYaw * forward + sinYaw * right
  return out
}

export function planarMagnitude(vector: Readonly<MutablePlanarVector>) {
  return Math.min(1, Math.hypot(vector.x, vector.z))
}
