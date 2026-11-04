/*
 * Where "Make a game" starts each game. Light on purpose (no renderers, no stores): the landing page reads it too.
 *
 * Every game has two builders: the classic one and the Hackable one (every brick has code inside). The classic
 * builders stay the default until the Hackable versions feel the same (docs/qa/parity-2026-11-03, on
 * claude/hackable-rooms). To switch a game, flip its entry in DEFAULT_BUILDER: the picker's Start button, its picture
 * and its second link all follow.
 */

export type GameId = 'platformer' | 'race'
export type BuilderKind = 'classic' | 'hackable'

/** Which builder each game's Start opens. The one switch for "classic or Hackable first". */
export const DEFAULT_BUILDER: Readonly<Record<GameId, BuilderKind>> = {
  platformer: 'classic',
  race: 'classic',
}

/** A new project in each game's builders. */
export const GAME_START_HREF: Readonly<Record<GameId, Readonly<Record<BuilderKind, string>>>> = {
  platformer: { classic: '/2d/build?new=1', hackable: '/2d/hackable?new=1' },
  race: { classic: '/2d/build?new=1&kit=race-starter', hackable: '/2d/hackable-race?new=1' },
}

/** The other builder's link under Start, in the words a kid would use. */
export const OTHER_BUILDER_LABEL: Readonly<Record<BuilderKind, string>> = {
  hackable: 'Start with code inside',
  classic: 'Start without code',
}

export const otherBuilder = (kind: BuilderKind): BuilderKind => (kind === 'classic' ? 'hackable' : 'classic')

export function gameStart(game: GameId, defaults: Readonly<Record<GameId, BuilderKind>> = DEFAULT_BUILDER) {
  const primary = defaults[game]
  const other = otherBuilder(primary)
  return { builder: primary, href: GAME_START_HREF[game][primary], other: { builder: other, href: GAME_START_HREF[game][other], label: OTHER_BUILDER_LABEL[other] } }
}

/**
 * "Start from nothing" (an empty stage to draw your own bricks on, docs/qa/blank-2d): a new Start from nothing game.
 * The landing card and the picker card appear while this is set (null hides them both); both stay outlined.
 */
export const FROM_NOTHING_HREF: string | null = '/2d/hackable-blank?new=1'

/** A new 3D build: the 3D row's Start (the classic 3D builder stays first until Hackable 3D feels the same). */
export const BUILD_3D_HREF = '/build?new=1'

/** A new Hackable 3D project: the 3D row's "Start with code inside" (OTHER_BUILDER_LABEL.hackable). */
export const HACKABLE_3D_HREF = '/3d/hackable?new=1'
