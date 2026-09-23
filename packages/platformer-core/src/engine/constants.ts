/** Pixels per tile. */
export const TILE = 16
/**
 * Sub-pixel units per pixel. Every position and speed in the simulation is a whole number of
 * these, like the NES games' sub-pixels. Whole numbers keep every player's copy of the world
 * bit-for-bit identical, which the shared world depends on.
 */
export const SUB = 256
export const TS = TILE * SUB
export const TICK_HZ = 60
export const TICK_MS = 1000 / TICK_HZ

/** Pixels (or px/frame, px/frame²) to whole sub-pixel units. */
export const sub = (px: number): number => Math.round(px * SUB)

/** Floor division that also floors negatives. Exact for the integer ranges used here. */
export const fdiv = (a: number, b: number): number => Math.floor(a / b)

/** Defeated enemies and collected placed power-ups come back after this many ticks. */
export const RESPAWN_TICKS = 8 * TICK_HZ

export const LEVEL_MIN_WIDTH = 24
export const LEVEL_MAX_WIDTH = 400
export const LEVEL_MIN_HEIGHT = 15
export const LEVEL_MAX_HEIGHT = 60
export const LEVEL_MAX_OBJECTS = 600
