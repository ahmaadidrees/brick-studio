/**
 * Tile ids of the race kit. A level's kit decides which list its tile bytes mean: a race level stores these, a
 * platformer level the ones in tiles.ts. Grass is 0 so an empty field is all grass. Boost pads carry their arrow.
 */
export const RT = {
  GRASS: 0,
  ROAD: 1,
  DIRT: 2,
  ICE: 3,
  WATER: 4,
  BARRIER: 5,
  TIRES: 6,
  BUMPER: 7,
  BOOST_R: 8,
  BOOST_D: 9,
  BOOST_L: 10,
  BOOST_U: 11,
  RAMP: 12,
  FINISH: 13,
  ITEM: 14,
  COIN: 15,
  TREE: 16,
  FLOWERS: 17,
  STAND: 18,
} as const
export type RaceTileId = (typeof RT)[keyof typeof RT]
export const RACE_TILE_ID_COUNT = 19

/** Directions: 0 right, 1 down, 2 left, 3 up. Rows grow downwards, like the tile grid. */
export type Dir4 = 0 | 1 | 2 | 3
export const DIR4: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
export const isDir4 = (n: unknown): n is Dir4 => n === 0 || n === 1 || n === 2 || n === 3

/** Cars cannot drive through these. */
export const raceSolid = (t: number): boolean =>
  t === RT.BARRIER || t === RT.TIRES || t === RT.BUMPER || t === RT.TREE || t === RT.STAND

/** Part of the track: the lap path runs over these (and water, which you jump). */
export const raceTrack = (t: number): boolean =>
  t === RT.ROAD || t === RT.DIRT || t === RT.ICE || t === RT.RAMP || t === RT.FINISH || t === RT.ITEM || t === RT.COIN || isRaceBoost(t)

export const isRaceBoost = (t: number): boolean => t >= RT.BOOST_R && t <= RT.BOOST_U
/** The arrow of a boost pad, or -1. */
export const raceBoostDir = (t: number): Dir4 | -1 => (isRaceBoost(t) ? ((t - RT.BOOST_R) as Dir4) : -1)

/** Grass-like ground: slow to drive on, and where road meets it the road gets a kerb. */
export const raceGrassy = (t: number): boolean => t === RT.GRASS || t === RT.FLOWERS || t === RT.TREE || t === RT.STAND

export type RaceSurface = 'road' | 'dirt' | 'ice' | 'grass' | 'water'
export function raceSurface(t: number): RaceSurface {
  if (t === RT.DIRT) return 'dirt'
  if (t === RT.ICE) return 'ice'
  if (t === RT.WATER) return 'water'
  if (t === RT.GRASS || t === RT.FLOWERS) return 'grass'
  return 'road'
}
