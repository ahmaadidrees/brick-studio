import { RACE_TILE_ID_COUNT, isDir4, type Dir4 } from './raceTiles'
import { TILE_ID_COUNT } from './tiles'

/**
 * A level's kit decides the camera, the bricks in the panel, how players move and what its tile bytes mean. It is
 * chosen when the level is made and never changes. Levels saved before kits existed are platformers.
 */
export type Kit = 'platformer' | 'race'
export const KITS: Kit[] = ['platformer', 'race']

export const kitOf = (d: { kit?: Kit }): Kit => d.kit ?? 'platformer'
export const tileIdCount = (kit: Kit): number => (kit === 'race' ? RACE_TILE_ID_COUNT : TILE_ID_COUNT)

/** A race level's own settings. */
export interface RaceSettings {
  laps: number
  /** Which way the starting grid faces. */
  startDir: Dir4
  /** Laps count when you cross the finish line this way. */
  finishDir: Dir4
  /** ? blocks hand out items. Off is pure racing. */
  items: boolean
}
export const RACE_MAX_LAPS = 9
export const DEFAULT_RACE: RaceSettings = { laps: 3, startDir: 0, finishDir: 0, items: true }

export function isValidRaceSettings(r: unknown): r is RaceSettings {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return Number.isInteger(o.laps) && (o.laps as number) >= 1 && (o.laps as number) <= RACE_MAX_LAPS && isDir4(o.startDir) && isDir4(o.finishDir) && typeof o.items === 'boolean'
}

/** Saved form: [laps, startDir, finishDir, items 0/1]. */
export type RaceSettingsJson = [number, number, number, number]
export const raceToJson = (r: RaceSettings): RaceSettingsJson => [r.laps, r.startDir, r.finishDir, r.items ? 1 : 0]
export function raceFromJson(j: unknown): RaceSettings {
  if (j === undefined) return { ...DEFAULT_RACE }
  if (!Array.isArray(j) || j.length !== 4) throw new Error('bad race settings')
  const [laps, startDir, finishDir, items] = j
  const r = { laps, startDir, finishDir, items: items === 1 }
  if ((items !== 0 && items !== 1) || !isValidRaceSettings(r)) throw new Error('bad race settings')
  return r
}
