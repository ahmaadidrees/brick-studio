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
import { BLANK_COPY, BLANK_DRAWER_CATEGORIES, backdropOf, blankDrawerActive, blankDrawerEntries, createBlankProject } from './blank/blankProject'

export type ScreensKit = 'platformer' | 'race' | 'blank'
/** What the Stage draws behind the level when it has no backdrop picture. */
export type StageBackground = 'sky' | 'grass' | 'paper' | 'night'

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
  /**
   * The brick the camera follows, Play needs and Code opens on (remixed copies count: isPlayerBrick). Empty for Start from
   * nothing, whose player is the design's own `player` brick.
   */
  playerBrickId: string
  /** Play waits for a placed player (the Hero, the Car). Start from nothing plays without one, like Scratch. */
  playNeedsPlayer: boolean
  /**
   * Start from nothing's screens (docs/qa/blank-2d): the empty-stage button, the next-step line instead of the tips,
   * Borrow under the drawer, One thing / Tiles when naming a brick, the Stage card, and "Give it a job" on the card.
   */
  fromNothing: boolean
  drawer: KitDrawer
  /** Code's "Start from…" for a fresh brick: BRICK_TEMPLATES ids, in that list's order. */
  codeStarts: readonly string[]
  /** Code shows "+ Power". */
  powers: boolean
  /** Code offers "Just this brick" (a small test room built around a helper Hero). */
  testRoom: boolean
  /** The palette: a Racing category, block types left out, and Start from nothing's one Game category. */
  toolbox: { racing: boolean; hide: readonly string[]; game?: boolean }
  /** What the Stage draws behind the level when it has no backdrop (Start from nothing: the design's, backgroundOf). */
  background: StageBackground
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
    playNeedsPlayer: true,
    fromNothing: false,
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
    playNeedsPlayer: true,
    fromNothing: false,
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
  blank: {
    kit: 'blank',
    starter: () => createBlankProject(),
    playerBrickId: '',
    playNeedsPlayer: false,
    fromNothing: true,
    drawer: {
      get categories() { return BLANK_DRAWER_CATEGORIES },
      entries: (bricks) => blankDrawerEntries(bricks),
      hint: () => undefined,
      active: (brushBrickId, bricks) => blankDrawerActive(brushBrickId, bricks),
    },
    // "Start from…" offers the jobs instead (studio/blank/jobs.ts, CodeColumn).
    codeStarts: [],
    powers: true,
    // The test room is built around a helper Hero; a game from nothing runs whole.
    testRoom: false,
    // Every Platformer and Racing block, in one Game category (core/editor/toolbox.ts).
    toolbox: { racing: true, hide: [], game: true },
    background: 'paper',
    get copy() { return BLANK_COPY },
  },
}

/** A design's screens. A kit with no screens yet (3D) gets the Platformer's; the studio refuses to open it anyway. */
export const screensFor = (design: Pick<LevelDesign, 'kit'>): KitScreens => {
  const kit = designKit(design)
  return kit === 'race' ? KIT_SCREENS.race : kit === 'blank' ? KIT_SCREENS.blank : KIT_SCREENS.platformer
}

/** What the Stage draws behind this design: the kit's, or the backdrop a Start from nothing game picked. */
export const backgroundOf = (design: Pick<LevelDesign, 'kit' | 'backdrop'>): StageBackground =>
  designKit(design) === 'blank' ? backdropOf(design) : screensFor(design).background

/**
 * Is this brick the kit's player? Its own id, a remix of it ("My Car" remembers it was the Car), or a brick the kid
 * named after it ("Hero", any case), as Play's check has always counted the Hero.
 */
export function isPlayerBrick(design: LevelDesign, brickId: string): boolean {
  const brick = design.bricks.find((b) => b.id === brickId)
  return !!brick && isPlayer(design, brick)
}

/** Start from nothing names its player by id (`design.player`); the kits by their player brick, a remix or its name. */
function isPlayer(design: Pick<LevelDesign, 'kit' | 'player'>, brick: Pick<BrickDef, 'id' | 'name' | 'remixOf'>): boolean {
  if (designKit(design) === 'blank') return !!design.player && brick.id === design.player
  const screens = screensFor(design)
  return brick.id === screens.playerBrickId || brick.remixOf === screens.playerBrickId || brick.name.trim().toLowerCase() === screens.copy.player.toLowerCase()
}

/** The first brick (in the level's order) that is the player, for the camera to follow. */
export function playerBrickOf(design: Pick<LevelDesign, 'kit' | 'bricks' | 'player'>): BrickDef | undefined {
  return design.bricks.find((b) => isPlayer(design, b))
}

/** Play can start: a copy of the player is placed. */
export function hasPlayer(design: LevelDesign): boolean {
  const ids = new Set(design.bricks.filter((b) => isPlayer(design, b)).map((b) => b.id))
  return design.copies.some((c) => ids.has(c.brickId))
}

/** The player's id, for screens that need one: the design's own (Start from nothing) or the kit's player brick. */
export function playerIdOf(design: Pick<LevelDesign, 'kit' | 'bricks' | 'player'>): string | undefined {
  return designKit(design) === 'blank' ? design.player : screensFor(design).playerBrickId
}
