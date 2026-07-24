import { GRID_SIZE, STUD } from './parts'

/**
 * "Golden hour" lookdev palette for Explore mode. Late-afternoon sun, warm key
 * against cool sky fill, haze that eats the horizon. Every color and intensity
 * for the rig lives here so the look stays tuned as one system.
 *
 * Build mode never reads these values; its neutral studio rig is untouched.
 */
export const GOLDEN_HOUR = {
  /** Low afternoon sun, raking across the view from the right. */
  sunColor: '#ffb460',
  sunIntensity: 3.8,
  sunElevationDeg: 18,
  sunAzimuthDeg: 118,
  /** Cool sky fill against the warm key (warm-vs-cool contrast). Golden-hour
   * shade is lit by the whole sky, so this stays generous — shadows must read
   * as luminous blue, never black. */
  skyFillColor: '#93b6dc',
  groundBounceColor: '#d0a26e',
  hemisphereIntensity: 1.1,
  ambientColor: '#ffe2bd',
  ambientIntensity: 0.35,
  /** Cool rim from opposite the sun so silhouettes separate from the haze. */
  rimColor: '#a9c6ea',
  rimIntensity: 1.2,
  /** Aerial perspective: warm haze that swallows the far ground. */
  fogColor: '#e5a877',
  fogNear: 45,
  fogFar: 150,
  /** Fallback clear color behind the sky (matches the haze band). */
  backgroundColor: '#eab183',
  /** Compact gradient dome (cheap stand-in for the scattering sky). */
  zenithColor: '#6f9cc7',
  /** Warm ground plane that catches the long shadows outside the plate. */
  groundColor: '#aa7a4c',
  /** Explore-only build plate tint (warmer than the studio plate). */
  plateColor: '#dccfae',
  dustColor: '#ffd9a0',
} as const

export type Vec3 = [number, number, number]

const DEG2RAD = Math.PI / 180

/**
 * Unit direction pointing from the origin toward the sun. Azimuth 0 deg looks
 * down +Z; the default puts the sun low and ahead of the default explore
 * camera so builds are backlit with long shadows reaching the viewer.
 */
export function goldenSunDirection(
  elevationDeg: number = GOLDEN_HOUR.sunElevationDeg,
  azimuthDeg: number = GOLDEN_HOUR.sunAzimuthDeg,
): Vec3 {
  const elevation = elevationDeg * DEG2RAD
  const azimuth = azimuthDeg * DEG2RAD
  const horizontal = Math.cos(elevation)
  return [horizontal * Math.sin(azimuth), Math.sin(elevation), horizontal * Math.cos(azimuth)]
}

/** Sun direction scaled out to a world position (for the shadow-casting light). */
export function goldenSunPosition(distance: number, direction: Vec3 = goldenSunDirection()): Vec3 {
  return [direction[0] * distance, direction[1] * distance, direction[2] * distance]
}

export type GoldenHourQuality = {
  /** Full composer chain: AO, bloom, vignette, grade, filmic tone map. */
  postProcessing: boolean
  /** Physically-plausible scattering sky; compact devices get a gradient dome. */
  scatteringSky: boolean
  /** One-time baked environment map so clearcoat plastic has something to reflect. */
  environmentMap: boolean
  /** Clearcoat "toy plastic" brick materials. */
  clearcoatBricks: boolean
  /** Drifting dust motes. Motion, so reduced motion always disables them. */
  dustMotes: boolean
  shadowMapSize: number
}

/**
 * Performance ladder for the golden-hour rig. Everything heavy stays on the
 * non-compact path; dust motes additionally respect the reduced-motion switch.
 */
export function getGoldenHourQuality(compact: boolean, reducedMotion: boolean): GoldenHourQuality {
  return {
    postProcessing: !compact,
    scatteringSky: !compact,
    environmentMap: !compact,
    clearcoatBricks: !compact,
    dustMotes: !compact && !reducedMotion,
    shadowMapSize: compact ? 512 : 2048,
  }
}

export const DUST_MOTE_COUNT = 180

export type DustMoteBounds = {
  horizontal: number
  minY: number
  maxY: number
}

/** Motes hover over the plate and a little beyond, where the light rakes through. */
export function getDustMoteBounds(): DustMoteBounds {
  return {
    horizontal: GRID_SIZE * STUD * 0.55,
    minY: 0.2,
    maxY: 7.5,
  }
}

export type DustMoteField = {
  count: number
  positions: Float32Array
  seeds: Float32Array
  scales: Float32Array
}

/** Small deterministic PRNG (mulberry32) so the mote field is stable and testable. */
export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic dust-mote field. Height is biased toward the ground so the
 * motes read as light catching dust over the plate rather than uniform snow.
 */
export function createDustMoteField(count: number = DUST_MOTE_COUNT, seed = 20260723): DustMoteField {
  const random = createMulberry32(seed)
  const bounds = getDustMoteBounds()
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const scales = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() * 2 - 1) * bounds.horizontal
    positions[index * 3 + 1] = bounds.minY + (bounds.maxY - bounds.minY) * Math.pow(random(), 1.55)
    positions[index * 3 + 2] = (random() * 2 - 1) * bounds.horizontal
    seeds[index] = random()
    scales[index] = 0.55 + random() * 1.1
  }
  return { count, positions, seeds, scales }
}
