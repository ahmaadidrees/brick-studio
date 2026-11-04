/**
 * What each Hackable kit's screens need to know (docs/qa/hackable-modes/R1-SCREENS.md, section B): its starter, which
 * brick is the player, what the Bricks drawer offers, where Code starts, what the toolbox shows, the Stage's background
 * and the words kids read. The studio's readers ask this descriptor instead of assuming a Platformer, so a kit's lane
 * changes its own values here (or in the files these point at) without touching the shared shell.
 *
 * Plain data and functions, no React: store.ts imports it. The React slots (HUD, touch controls, Build chip) are in
 * screen/kitParts.tsx.
 *
 * store.ts → kitScreens → starter → store is a cycle, so nothing imported is read while this module loads: imported
 * functions are called later, and imported lists are read through getters.
 */
import { designKit, type BrickDef, type LevelDesign } from '../core/contracts'
import type { StudioProject } from './store'
import { createStarterProject } from './starter'
import { createRaceStarterProject } from './race/raceProject'
import { CATALOG_CATEGORIES, activeEntryId, drawerEntries, standardKeyOf, standardTemplate, type DrawerEntry } from './builder/catalog'
import { NO_HERO_MESSAGE, PLAY_CONTROLS_HINT } from './builder/playRules'
import { TIPS_SEEN_KEY } from './screen/firstRunTips'
import { RACE_COPY } from './race/raceCopy'
import { raceDrawerActive, raceDrawerCategories, raceDrawerEntries, raceDrawerHint } from './race/raceDrawer'
import { createStarter3dProject, PROJECT_NAME_3D } from './three/project3d'

export type ScreensKit = 'platformer' | 'race' | '3d'

/** The words a kit's screens use. */
export interface KitCopy {
  /** A new project's name: "My platformer", "My race track". */
  projectName: string
  /** The player brick's name, as kids see it: "Hero", "Car". */
  player: string
  /** Play pressed with no player placed. */
  noPlayer: string
  /** The keys, in a line, while Play starts. */
  controlsHint: string
  /** Play's camera button: "Follow the Hero". */
  followLabel: string
  /** Where this browser remembers the first-run tips were seen (one per kit). */
  tipsKey: string
  /**
   * The first-run tips. `buildPhone` is for a phone (the drawer is a sheet behind a Bricks button), `codeSmall` for a
   * screen too small for Code.
   */
  tips: { build: string; buildPhone: string; code: string; codeSmall: string; play: string }
  /** Help's Play paragraph. */
  helpPlay: string
}

export interface KitDrawer {
  categories: ReadonlyArray<{ id: string; label: string }>
  /** Everything the drawer lists, in order (the "+ New brick" tile is added by the panel). */
  entries(bricks: readonly BrickDef[]): DrawerEntry[]
  /** The words in the paint strip while this grid brick is armed, if any. */
  hint(brick: BrickDef): string | undefined
  /** The entry the armed brush matches, or null. */
  active(brushBrickId: string | null, bricks: readonly BrickDef[]): string | null
}

export interface KitScreens {
  kit: ScreensKit
  /** A new project of this kit. */
  starter(): StudioProject
  /** The brick the camera follows, Play needs and Code opens on (remixed copies count: isPlayerBrick). */
  playerBrickId: string
  drawer: KitDrawer
  /** Code's "Start from…" for a fresh brick: BRICK_TEMPLATES ids, in that list's order. */
  codeStarts: readonly string[]
  /** Code shows "+ Power". */
  powers: boolean
  /** Code offers "Just this brick" (a small test room built around a helper Hero). */
  testRoom: boolean
  /** The palette: a Racing category, the 3D category (in place of Platformer), and block types left out. */
  toolbox: { racing: boolean; threeD?: boolean; hide: readonly string[] }
  /** What the Stage draws behind the level when it has no backdrop ('3d': the Stage slot is a three.js world). */
  background: 'sky' | 'grass' | '3d'
  /** Play's follow camera width in steps; the Stage's own choice when missing. */
  followViewWidth?: number
  copy: KitCopy
}

const PLATFORMER_COPY: KitCopy = {
  projectName: 'My platformer',
  player: 'Hero',
  get noPlayer() { return NO_HERO_MESSAGE },
  get controlsHint() { return PLAY_CONTROLS_HINT },
  followLabel: 'Follow the Hero',
  get tipsKey() { return TIPS_SEEN_KEY },
  tips: {
    build: 'Pick a brick, then tap or click the level to place it.',
    buildPhone: 'Press Bricks, pick one, then tap the level to place it.',
    code: 'Open a brick’s code. Switch a script off to see what it does.',
    codeSmall: 'On a bigger screen, open a brick’s code. Switch a script off to see what it does.',
    play: 'Press Play to try your level.',
  },
  helpPlay: 'Press Play to try your level. The arrow keys (or A and D) move, Space, X or K jumps, and Z, J or Shift runs. On a touch screen, use the buttons on the screen. Press Build to go back.',
}

export const KIT_SCREENS: Readonly<Record<ScreensKit, KitScreens>> = {
  platformer: {
    kit: 'platformer',
    starter: () => createStarterProject(),
    playerBrickId: 'brick_hero',
    drawer: {
      get categories() { return CATALOG_CATEGORIES },
      entries: (bricks) => drawerEntries(bricks),
      hint: (brick) => {
        const key = brick.grid ? standardKeyOf(brick) : undefined
        return key ? standardTemplate(key)?.hint : undefined
      },
      active: (brushBrickId, bricks) => activeEntryId(brushBrickId, bricks),
    },
    codeStarts: ['walker', 'coin', 'spring', 'goal'],
    powers: true,
    testRoom: true,
    toolbox: { racing: false, hide: [] },
    background: 'sky',
    copy: PLATFORMER_COPY,
  },
  race: {
    kit: 'race',
    starter: () => createRaceStarterProject(),
    playerBrickId: 'brick_car',
    drawer: {
      get categories() { return raceDrawerCategories() },
      entries: (bricks) => raceDrawerEntries(bricks),
      hint: (brick) => raceDrawerHint(brick),
      active: (brushBrickId, bricks) => raceDrawerActive(brushBrickId, bricks),
    },
    codeStarts: [],
    powers: false,
    testRoom: false,
    // Lane 3 settles the list; these are the Platformer blocks that make no sense for a car seen from above.
    toolbox: { racing: true, hide: ['platformer_whenland', 'platformer_whenleaveground', 'platformer_setgravity', 'platformer_onground', 'platformer_setonground'] },
    background: 'grass',
    get copy() { return RACE_COPY },
  },
  // Hackable 3D (D1, docs/qa/hackable-3d/D1.md). Its drawer, Stage, test room and HUD are React slots
  // (screen/kitParts.tsx); the drawer data here is unused because the 3D drawer lists parts, not bricks.
  '3d': {
    kit: '3d',
    starter: () => createStarter3dProject(),
    playerBrickId: 'brick_hero3d',
    drawer: { categories: [], entries: () => [], hint: () => undefined, active: () => null },
    codeStarts: [],
    powers: false,
    testRoom: true,
    // The 2D-only Platformer blocks: moving by your own sweep, the old hit flags, and setting "on ground" by hand.
    toolbox: { racing: false, threeD: true, hide: ['platformer_setmover', 'platformer_moveuntilhit', 'platformer_hitsomething', 'platformer_tellhit', 'platformer_setonground', 'motion_ifonedgebounce'] },
    background: '3d',
    get copy() { return COPY_3D },
  },
}

const COPY_3D: KitCopy = {
  get projectName() { return PROJECT_NAME_3D },
  player: 'Hero',
  noPlayer: 'Place the Hero first: it is under Code bricks in the Bricks drawer.',
  controlsHint: 'Arrows or WASD move, Space jumps, X runs, drag to look around',
  followLabel: 'Follow the Hero',
  tipsKey: 'brickgineers.hackable3d.tips',
  tips: {
    build: 'Pick a brick, then click a stud to place it. Drag to look around.',
    buildPhone: 'Press Bricks, pick one, then tap a stud to place it.',
    code: 'Open a code brick’s code. Change a number, then press Restart.',
    codeSmall: 'On a bigger screen, open a code brick’s code.',
    play: 'Press Play to try your world.',
  },
  helpPlay: 'Press Play to try your world. The arrow keys (or WASD) move, Space jumps, and X runs. Drag the world to turn the camera; the Hero walks the way the camera looks. Press Build to go back.',
}

/** A design's screens. */
export const screensFor = (design: Pick<LevelDesign, 'kit'>): KitScreens => KIT_SCREENS[designKit(design)]

/**
 * Is this brick the kit's player? Its own id, a remix of it ("My Car" remembers it was the Car), or a brick the kid
 * named after it ("Hero", any case), as Play's check has always counted the Hero.
 */
export function isPlayerBrick(design: LevelDesign, brickId: string): boolean {
  const brick = design.bricks.find((b) => b.id === brickId)
  return !!brick && isPlayer(screensFor(design), brick)
}

function isPlayer(screens: KitScreens, brick: Pick<BrickDef, 'id' | 'name' | 'remixOf'>): boolean {
  return brick.id === screens.playerBrickId || brick.remixOf === screens.playerBrickId || brick.name.trim().toLowerCase() === screens.copy.player.toLowerCase()
}

/** The first brick (in the level's order) that is the player, for the camera to follow. */
export function playerBrickOf(design: Pick<LevelDesign, 'kit' | 'bricks'>): BrickDef | undefined {
  const screens = screensFor(design)
  return design.bricks.find((b) => isPlayer(screens, b))
}

/** Play can start: a copy of the player is placed. */
export function hasPlayer(design: LevelDesign): boolean {
  const screens = screensFor(design)
  const ids = new Set(design.bricks.filter((b) => isPlayer(screens, b)).map((b) => b.id))
  return design.copies.some((c) => ids.has(c.brickId))
}
