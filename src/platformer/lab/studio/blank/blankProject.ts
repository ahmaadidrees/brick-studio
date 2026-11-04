/**
 * Start from nothing (kit `blank`, docs/qa/blank-2d): an empty stage the size of Scratch's, a plain paper backdrop with
 * the grid on, no bricks. The kid draws every brick, gives them jobs (studio/blank/jobs.ts) or writes their own code.
 *
 * Plain data, no React: kitScreens.ts imports it (store.ts → kitScreens → here, so nothing from store is read while this
 * module loads).
 */
import { BACKDROPS, TILE_SIZE, type Backdrop, type BrickDef, type LevelDesign } from '../../core/contracts'
import { brickEntryId, placeableBricks, type DrawerEntry } from '../builder/catalog'
import { STAGE_ID, type StudioProject } from '../store'
import type { KitCopy } from '../kitScreens'

/** One screen: 30 x 22 cells of 16 steps (480 x 352 steps), about Scratch's 480 x 360 stage. */
export const BLANK_COLS = 30
export const BLANK_ROWS = 22

/** The sizes the Stage card offers, in cells. The first is a new game's. */
export const STAGE_SIZES: ReadonlyArray<{ id: string; label: string; what: string; cols: number; rows: number }> = [
  { id: 'one', label: 'One screen', what: 'Like a Scratch stage', cols: BLANK_COLS, rows: BLANK_ROWS },
  { id: 'wide', label: 'Wide', what: 'Two screens side by side', cols: BLANK_COLS * 2, rows: BLANK_ROWS },
  { id: 'tall', label: 'Tall', what: 'Two screens, one on top', cols: BLANK_COLS, rows: BLANK_ROWS * 2 },
  { id: 'big', label: 'Big', what: 'Four screens', cols: BLANK_COLS * 2, rows: BLANK_ROWS * 2 },
]

export const BACKDROP_NAMES: Readonly<Record<Backdrop, string>> = { paper: 'Paper', sky: 'Sky', grass: 'Grass', night: 'Night' }
export const backdropOf = (design: Pick<LevelDesign, 'backdrop'>): Backdrop => (design.backdrop && BACKDROPS.includes(design.backdrop) ? design.backdrop : 'paper')

/** A design's size in cells (its tile layer, or its bounds when it has none). */
export function stageCells(design: Pick<LevelDesign, 'bounds' | 'tiles'>): { cols: number; rows: number } {
  if (design.tiles) return { cols: design.tiles.cols, rows: design.tiles.rows }
  return { cols: Math.round((design.bounds.right - design.bounds.left) / TILE_SIZE), rows: Math.round((design.bounds.top - design.bounds.bottom) / TILE_SIZE) }
}

/** A new Start from nothing game: a stage and nothing else. */
export function createBlankProject(): StudioProject {
  return {
    design: {
      id: 'level1',
      name: BLANK_COPY.projectName,
      kit: 'blank',
      seed: 1,
      bounds: { left: 0, right: BLANK_COLS * TILE_SIZE, bottom: 0, top: BLANK_ROWS * TILE_SIZE },
      stage: { id: STAGE_ID, name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
      bricks: [],
      copies: [],
      tiles: { cols: BLANK_COLS, rows: BLANK_ROWS, data: Array.from({ length: BLANK_ROWS }, () => '.'.repeat(BLANK_COLS)) },
    },
    workspaces: {},
  }
}

export const BLANK_COPY: KitCopy = {
  projectName: 'My game',
  player: 'player',
  noPlayer: 'Nothing is the player yet. Tap a brick, then give it the Player job.',
  controlsHint: 'The arrow keys move the player',
  followLabel: 'Follow the player',
  tipsKey: 'brickgineers.blank.tips',
  tips: {
    build: 'Start by drawing a brick.',
    buildPhone: 'Press Bricks, then New brick to draw one.',
    code: 'Open a brick’s code. Its job’s blocks are in there too.',
    codeSmall: 'On a bigger screen, open a brick’s code.',
    play: 'Press Play to try your game.',
  },
  helpPlay: 'Press Play to try your game. The player moves with the arrow keys; Runs and jumps also jumps with Space, and Drives speeds up with the up arrow. Press Build to go back.',
}

/** The drawer: only the kid's own bricks (and the ones they borrowed). Borrow lives under it (screen/BorrowPanel). */
export const BLANK_DRAWER_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [{ id: 'mine', label: 'My bricks' }]

export function blankDrawerEntries(bricks: readonly BrickDef[]): DrawerEntry[] {
  return placeableBricks(bricks).map((b) => ({ id: brickEntryId(b.id), name: b.name, category: 'mine', brick: b, asset: b.costumes[0]?.asset }))
}

export function blankDrawerActive(brushBrickId: string | null, bricks: readonly BrickDef[]): string | null {
  return brushBrickId && bricks.some((b) => b.id === brushBrickId) ? brickEntryId(brushBrickId) : null
}
