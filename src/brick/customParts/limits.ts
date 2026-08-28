/** Off until a product surface explicitly opts into compilation. */
export const CUSTOM_PART_ENGINE_ENABLED_BY_DEFAULT = false

export const CUSTOM_PART_LIMITS = Object.freeze({
  schemaVersion: 1,
  maxNameLength: 40,
  maxWidthStuds: 8,
  maxDepthStuds: 8,
  maxHeightPlates: 12,
  maxBoxes: 32,
  maxMaterials: 4,
  maxColliders: 16,
  minBoxAxis: 1 / 64,
  maxDecimalPlaces: 6,
  maxCombinedBoxVolumeMultiplier: 2,
  maxCombinedColliderVolumeMultiplier: 1.25,
  maxValidationIssues: 32,
})

export const CUSTOM_PART_WORLD_UNITS = Object.freeze({
  stud: 0.62,
  plate: 0.18,
})
