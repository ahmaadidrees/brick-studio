/** Plain numeric vectors so the model stays free of three.js and Rapier types. */
export type Vec3 = { x: number; y: number; z: number }
export type Quat = { x: number; y: number; z: number; w: number }

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b))
export function normalize(a: Vec3): Vec3 {
  const l = length(a)
  return l > 0 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 }
}

/** Grid-derived coordinates only differ by floating-point noise; anything under a hundredth of a plate is "the same point". */
export const POINT_TOLERANCE = 1e-4
export const samePoint = (a: Vec3, b: Vec3, tolerance = POINT_TOLERANCE): boolean => distance(a, b) <= tolerance
export const sameDirection = (a: Vec3, b: Vec3): boolean => dot(a, b) > 0.999
export const parallel = (a: Vec3, b: Vec3): boolean => Math.abs(dot(a, b)) > 0.999

/** Rotates `v` by unit quaternion `q` (q v q*). */
export function rotateByQuat(q: Quat, v: Vec3): Vec3 {
  const { x: qx, y: qy, z: qz, w: qw } = q
  const tx = 2 * (qy * v.z - qz * v.y)
  const ty = 2 * (qz * v.x - qx * v.z)
  const tz = 2 * (qx * v.y - qy * v.x)
  return {
    x: v.x + qw * tx + (qy * tz - qz * ty),
    y: v.y + qw * ty + (qz * tx - qx * tz),
    z: v.z + qw * tz + (qx * ty - qy * tx),
  }
}

export const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w })

/** `a · b` (Hamilton product). */
export function multiplyQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
}

/** Unit quaternion for a right-hand rotation of `radians` about `axis` (unit). */
export function axisAngleQuat(axis: Vec3, radians: number): Quat {
  const half = radians / 2
  const s = Math.sin(half)
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(half) }
}

/**
 * Signed twist of the rotation `q` about `axis`, in radians (the swing/twist
 * decomposition). Used to read a revolute joint's angle from its two bodies' rotations.
 */
export function twistAboutAxis(q: Quat, axis: Vec3): number {
  const projected = dot({ x: q.x, y: q.y, z: q.z }, axis)
  const angle = 2 * Math.atan2(projected, q.w)
  return wrapAngle(angle)
}

/** Wraps to (-π, π]. */
export function wrapAngle(radians: number): number {
  let a = radians % (2 * Math.PI)
  if (a <= -Math.PI) a += 2 * Math.PI
  if (a > Math.PI) a -= 2 * Math.PI
  return a
}

export const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180
export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
