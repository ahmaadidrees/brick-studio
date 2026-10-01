/**
 * Kid text: picked word lists for bricks, costumes, and stage backdrops.
 * Outside class worlds, kids choose from picked phrases; no typing free text (spec, "Kid text").
 */

export const BRICK_WORDS = [
  // Characters & Creatures
  'Hero',
  'Player',
  'Monster',
  'Ghost',
  'Robot',
  'Alien',
  'Cat',
  'Dog',
  'Frog',
  'Bird',
  'Fish',
  'Dragon',
  'Walker',
  'Flyer',
  'Jumper',

  // Items & Pickups
  'Coin',
  'Gem',
  'Star',
  'Heart',
  'Key',
  'Potion',
  'Shield',
  'Sword',
  'Burger',
  'Pizza',
  'Apple',
  'Cake',

  // Level & World Objects
  'Platform',
  'Block',
  'Ground',
  'Grass',
  'Stone',
  'Lava',
  'Water',
  'Spike',
  'Spring',
  'Ladder',
  'Door',
  'Chest',
  'Sign',
  'Flag',
  'Portal',
  'Button',
  'Box',
  'Cloud',
  'Tree',
  'Flower',
] as const

export const COSTUME_WORDS = [
  'idle',
  'walk1',
  'walk2',
  'run1',
  'run2',
  'jump',
  'fall',
  'climb',
  'duck',
  'hurt',
  'smile',
  'blink',
  'open',
  'closed',
  'spin1',
  'spin2',
  'glow',
  'flat',
  'happy',
  'sad',
  'sleep',
  'active',
  'off',
  'on',
] as const

export const BACKDROP_WORDS = [
  'Sky',
  'Hills',
  'Mountains',
  'Forest',
  'Cave',
  'Dungeon',
  'Castle',
  'Desert',
  'Snow',
  'Space',
  'Underwater',
  'Sunset',
  'Night',
  'City',
] as const

/** Generate a unique name from candidate words, appending a number if already taken */
export function chooseUniqueName(base: string, existingNames: Iterable<string>): string {
  const taken = new Set(existingNames)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}
