/** Keep a framed build in front of the atmosphere and camera clipping plane.
 * Portrait screens need much more camera distance than the original scene fog.
 */
export function getBuildVisibilityRange(distance: number, radius: number, fogNear: number, fogFar: number) {
  const backOfBuild = distance + radius;
  const fogOffset = Math.max(0, backOfBuild - fogNear);
  return {
    fogNear: fogNear + fogOffset,
    fogFar: fogFar + fogOffset,
    cameraFar: Math.max(240, backOfBuild + 50),
  };
}
