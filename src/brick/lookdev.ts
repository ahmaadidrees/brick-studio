/**
 * "Toy photography" look development for Explore mode.
 *
 * Pure logic only: the feature ladder that keeps heavy effects off the compact
 * renderer path, plus the deterministic per-brick surface variation used by the
 * scene components. Kept free of three/react imports so it stays unit-testable.
 */

export type ExploreLookdevFeatures = {
  /** Post-processing chain: AO, depth of field, bloom, vignette, filmic grade. */
  postprocessing: boolean
  /** Soft blurred contact-shadow wash under the baseplate and build. */
  contactShadows: boolean
  /** Drifting macro-photo dust motes. Added motion, so reduced motion removes them. */
  dustMotes: boolean
  /** Clearcoat ABS-plastic materials for bricks, baseplate, and avatar. */
  premiumMaterials: boolean
  /** Key-light shadow map resolution for the active tier. */
  shadowMapSize: number
}

/**
 * Explore visual ladder. Compact renderers (phones) keep the cheap path: no
 * post-processing, no contact-shadow render target, standard materials, and the
 * small shadow map. Reduced motion removes the only animated garnish (dust).
 */
export function exploreLookdevFeatures(
  compactRenderer: boolean,
  reducedMotion: boolean,
): ExploreLookdevFeatures {
  return {
    postprocessing: !compactRenderer,
    contactShadows: !compactRenderer,
    dustMotes: !compactRenderer && !reducedMotion,
    premiumMaterials: !compactRenderer,
    shadowMapSize: compactRenderer ? 512 : 2048,
  }
}

/** Warm seamless studio sweep replacing Build mode's flat gray-white fog. */
export const EXPLORE_BACKDROP_COLOR = '#efe4d1'
export const EXPLORE_FLOOR_COLOR = '#e2d0b4'
export const EXPLORE_FOG_NEAR = 30
export const EXPLORE_FOG_FAR = 100
export const EXPLORE_KEY_LIGHT_COLOR = '#ffeeda'
export const EXPLORE_RIM_LIGHT_COLOR = '#dfeaff'
export const EXPLORE_CONTACT_SHADOW_COLOR = '#5a4632'
export const EXPLORE_PLATE_COLOR = '#edeae2'

/** Molded ABS plastic: glossy, with slight per-part mold variation. */
export const EXPLORE_BRICK_ROUGHNESS_BASE = 0.3
export const EXPLORE_BRICK_ROUGHNESS_SPAN = 0.16
export const EXPLORE_BRICK_CLEARCOAT = 0.7
export const EXPLORE_BRICK_CLEARCOAT_ROUGHNESS = 0.24

/**
 * Deterministic per-brick jitter in [0, 1). FNV-1a over the brick id, so the
 * same brick always molds the same and re-renders never shimmer.
 */
export function brickSurfaceJitter(brickId: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < brickId.length; index += 1) {
    hash ^= brickId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return ((hash >>> 8) & 0xffff) / 0x10000
}

/** Explore-mode roughness for a brick: base gloss plus its mold jitter. */
export function exploreBrickRoughness(brickId: string): number {
  return EXPLORE_BRICK_ROUGHNESS_BASE + brickSurfaceJitter(brickId) * EXPLORE_BRICK_ROUGHNESS_SPAN
}
