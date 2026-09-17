export type BuildVisibilityRange = { fogNear: number; fogFar: number; cameraFar: number }

/** Default build camera far plane (the Canvas default in BrickStudioScene). */
export const DEFAULT_BUILD_CAMERA_FAR = 240

/** Keep a framed build in front of the atmosphere and camera clipping plane.
 * Portrait screens need much more camera distance than the original scene fog.
 * `minCameraFar` is the far plane the scene had before build framing touched it:
 * an environment such as Brick Valley needs its own horizon (620) kept, so the
 * build only ever pushes the plane further out, never closer than the scene's own.
 * Pass `out` to reuse an object from a per-frame caller.
 */
export function getBuildVisibilityRange(
  distance: number,
  radius: number,
  fogNear: number,
  fogFar: number,
  minCameraFar = DEFAULT_BUILD_CAMERA_FAR,
  out: BuildVisibilityRange = { fogNear: 0, fogFar: 0, cameraFar: 0 },
): BuildVisibilityRange {
  const backOfBuild = distance + radius;
  const fogOffset = Math.max(0, backOfBuild - fogNear);
  out.fogNear = fogNear + fogOffset;
  out.fogFar = fogFar + fogOffset;
  out.cameraFar = Math.max(minCameraFar, backOfBuild + 50);
  return out;
}
