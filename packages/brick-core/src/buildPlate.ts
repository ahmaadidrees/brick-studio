export const BUILD_PLATE_SIZES = [64, 96, 128] as const
export type BuildPlateSize = typeof BUILD_PLATE_SIZES[number]
export const DEFAULT_BUILD_PLATE_SIZE: BuildPlateSize = 64

export function isBuildPlateSize(value: unknown): value is BuildPlateSize {
  return BUILD_PLATE_SIZES.some(size => size === value)
}

/** Legacy documents omit the size and always describe the original 64-stud plate. */
export function getBuildPlateSize(document: { plateSize?: unknown }): BuildPlateSize {
  return isBuildPlateSize(document.plateSize) ? document.plateSize : DEFAULT_BUILD_PLATE_SIZE
}
