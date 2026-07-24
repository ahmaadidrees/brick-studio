import type { BrickMode } from './types'

/**
 * "Crisp showcase" look development for Explore mode.
 *
 * The showcase path turns Explore into a high-key product render: studio
 * lightformer reflections, clearcoat plastic, screen-space AO, SMAA and a
 * punchy ACES grade. It is deliberately gated so that:
 *
 * - Build mode keeps its existing warm workshop look, untouched.
 * - Compact renderers (phones / small viewports) keep the exact pre-showcase
 *   Explore presentation — no post-processing, no environment map, no
 *   clearcoat shading — matching the app's performance ladder.
 */
export function shouldUseExploreShowcase(mode: BrickMode, compactRenderer: boolean): boolean {
  return mode === 'explore' && !compactRenderer
}

/** Single tuning surface for the showcase grade and light rig. */
export const EXPLORE_SHOWCASE = {
  /** Cool studio-white backdrop; the cyc floor uses the same color so the horizon disappears. */
  background: '#eef2f6',
  /** Neutral exposure — the ACES shoulder does the rolloff; lights set the key. */
  toneMappingExposure: 1,
  /** Key light: bright, slightly warm-neutral, crisp 2048 shadow map. */
  key: { color: '#ffffff', intensity: 1.4, position: [18, 26, 12] as const, shadowMapSize: 2048 },
  /**
   * Camera-following cool kicker that separates avatar and bricks from the
   * ground. It sits behind the build at a back-three-quarter azimuth (offset
   * radians away from the exact view axis) so its specular streak on the
   * polished plate lands outside the camera's mirror band instead of flaring
   * down the middle of the frame.
   */
  rim: { color: '#bdd6ff', intensity: 1.05, height: 13, distance: 24, azimuthOffset: 0.65 },
  hemisphere: { sky: '#ffffff', ground: '#cdd6de', intensity: 0.26 },
  ambient: 0.12,
  /** Screen-space AO that grounds every brick without dirtying the high-key white. */
  ao: { radius: 0.5, intensity: 2.8, distanceFalloff: 0.75 },
  /** Restrained HDR bloom — only true speculars well above white glint. */
  bloom: { intensity: 0.12, luminanceThreshold: 1.3, luminanceSmoothing: 0.25 },
  /** Punchy contrast/saturation grade applied after the ACES curve. */
  grade: { brightness: 0, contrast: 0.085, saturation: 0.14, vignetteOffset: 0.26, vignetteDarkness: 0.22 },
  /** Polished-acrylic plate and stud caps. */
  plate: { color: '#e9eef2', studColor: '#e6ebf0' },
} as const

/** Glossy ABS-style plastic for bricks on the showcase path. */
export const SHOWCASE_BRICK_MATERIAL = {
  roughness: 0.36,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.22,
  envMapIntensity: 0.35,
} as const
