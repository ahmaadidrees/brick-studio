import { RT } from '@brick-studio/platformer-core/engine/raceTiles'
import type { PaletteItem, RaceCategory } from './palette'

/*
 * The race kit's Bricks drawer. Icons are `race:<tile id>` (or `race:start`), drawn by RaceArt. Item boxes, coins and
 * critters come with milestone 4.
 */

export const RACE_CATEGORIES: { id: RaceCategory; label: string }[] = [
  { id: 'ground', label: 'Ground' },
  { id: 'edges', label: 'Edges' },
  { id: 'speed', label: 'Speed' },
  { id: 'race-course', label: 'Start and finish' },
  { id: 'scenery', label: 'Scenery' },
]

const tile = (id: string, label: string, category: RaceCategory, t: number, hint: string): PaletteItem => ({
  id,
  label,
  category,
  icon: `race:${t}`,
  place: { kind: 'tile', tile: t, content: 0 },
  hint,
})

export const RACE_PALETTE: PaletteItem[] = [
  tile('race-road', 'Road', 'ground', RT.ROAD, 'Full speed'),
  tile('race-dirt', 'Dirt', 'ground', RT.DIRT, 'A little slower than road'),
  tile('race-grass', 'Grass', 'ground', RT.GRASS, 'Cars slow down a lot'),
  tile('race-ice', 'Ice', 'ground', RT.ICE, 'Slippery: cars slide'),
  tile('race-water', 'Water', 'ground', RT.WATER, 'Drive in and you drop back on the road. Jump it!'),
  tile('race-barrier', 'Barrier', 'edges', RT.BARRIER, 'Cars bounce off'),
  tile('race-tires', 'Tire stack', 'edges', RT.TIRES, 'Soft: cars stop without bouncing much'),
  tile('race-bumper', 'Bumper', 'edges', RT.BUMPER, 'Kicks cars away like a pinball bumper'),
  tile('race-boost', 'Boost pad', 'speed', RT.BOOST_R, 'A burst of speed if you drive the arrow’s way · R turns it'),
  tile('race-ramp', 'Jump ramp', 'speed', RT.RAMP, 'Cars fly over water and anything else'),
  { id: 'race-start', label: 'Starting grid', category: 'race-course', icon: 'race:start', place: { kind: 'object', obj: 'start', alt: 0 }, hint: 'Click to move the grid · R turns it' },
  tile('race-finish', 'Finish line', 'race-course', RT.FINISH, 'Paint it across the road · R turns which way laps count'),
  tile('race-tree', 'Tree', 'scenery', RT.TREE, 'Scenery that blocks cars'),
  tile('race-flowers', 'Flowers', 'scenery', RT.FLOWERS, 'Scenery you can drive over (like grass)'),
  tile('race-stand', 'Grandstand', 'scenery', RT.STAND, 'Scenery that blocks cars'),
]

/** Bricks that R turns. */
export const turnsWithR = (item: PaletteItem) => item.id === 'race-boost' || item.id === 'race-start' || item.id === 'race-finish'
