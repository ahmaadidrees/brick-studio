/** Every colour the game draws with. Original palette, NES-flavoured. */
export const PAL = {
  outline: '#1d1a2e',
  white: '#fffdf5',
  black: '#0d0b16',

  skin: '#f6c08c',
  skinShade: '#d98f5c',
  hair: '#6b3a1f',
  hat: '#ffcf33',
  hatLight: '#fff29a',
  hatShade: '#dc9418',
  shirt: '#f4f1e8',
  shirtShade: '#c6bfae',
  boot: '#5a2e14',
  bootLight: '#8c4f24',

  // Day ground: a studded green plate on warm brick earth.
  grass: '#5fcf52',
  grassLight: '#a8f07e',
  grassShade: '#2f9340',
  earth: '#d4884a',
  earthLight: '#f2b273',
  earthShade: '#a45d2c',
  mortar: '#7a3f1c',

  // Underground ground: cool stone.
  stone: '#5b7fb0',
  stoneLight: '#93b6e0',
  stoneShade: '#3b5784',
  stoneMortar: '#223556',

  brick: '#d9652b',
  brickLight: '#f7a060',
  brickShade: '#a8441a',
  brickMortar: '#5e2410',

  gold: '#ffc22e',
  goldLight: '#fff09a',
  goldShade: '#d98913',
  goldDeep: '#8a5207',

  used: '#9c6b45',
  usedLight: '#c8956a',
  usedShade: '#6d4527',

  hard: '#a9b3c6',
  hardLight: '#e1e6f0',
  hardShade: '#6f7a92',
  hardDeep: '#454e66',

  bounce: '#fff1d0',
  bounceShade: '#e2c58c',
  bouncePink: '#ff6f9f',

  plate: '#46a2ff',
  plateLight: '#a9d8ff',
  plateShade: '#2466c2',

  pipe: '#35c26a',
  pipeLight: '#a8f2b8',
  pipeShade: '#1e7c40',
  pipeDeep: '#124d28',

  spike: '#e8edf6',
  spikeShade: '#8e98ae',
  spikeBase: '#4a5068',

  lava: '#ff7a1c',
  lavaLight: '#ffd23f',
  lavaDeep: '#c0341a',

  spring: '#e8453a',
  springLight: '#ff9a8a',
  springMetal: '#9aa3b8',

  sky: '#79b8ff',
  skyUnder: '#10131f',
  hill: '#66cc6a',
  hillShade: '#3f9e52',
  hillFar: '#a7dca0',
  hillFarShade: '#86c48a',
  cloud: '#ffffff',
  cloudShade: '#cfe3ff',
  bush: '#48b84e',
  bushLight: '#8fe07a',

  metal: '#9aa3b8',
  metalLight: '#dfe5f1',
  metalShade: '#5f6880',
  red: '#e0453a',
  redLight: '#ff8a7a',
  green: '#3aa85a',
  greenLight: '#8fe0a0',
  greenShade: '#236b3a',
  blue: '#3d7cf0',
  blueLight: '#9cc2ff',
  purple: '#8e5bd9',
  spark: '#7fe8ff',
  sparkCore: '#ffffff',
  sparkDeep: '#2f8cff',
} as const

/** Overall colours for players 1-16 (colour, shade). */
export const PLAYER_COLORS: [string, string][] = [
  ['#2f6fe0', '#1d47a3'],
  ['#e0453a', '#a52a22'],
  ['#34a853', '#23763a'],
  ['#8e5bd9', '#5f3aa0'],
  ['#f08a24', '#b3611a'],
  ['#1fb5a8', '#147d74'],
  ['#ef5fa7', '#b03d7a'],
  ['#8a94a6', '#5d6678'],
  ['#27408f', '#172863'],
  ['#9c2f4f', '#6c1f36'],
  ['#86c92c', '#5b8f1c'],
  ['#3fb4f0', '#2780b0'],
  ['#9a6236', '#6a4124'],
  ['#3a3548', '#221f2c'],
  ['#d8a520', '#9a7414'],
  ['#e6e1d6', '#aea690'],
]

export const PLAYER_COLOR_NAMES = ['Blue', 'Red', 'Green', 'Purple', 'Orange', 'Teal', 'Pink', 'Grey', 'Navy', 'Maroon', 'Lime', 'Sky', 'Brown', 'Black', 'Gold', 'White']

/** A player's colour pair by player number (1-based). */
export function playerColor(num: number): [string, string] {
  return PLAYER_COLORS[(Math.max(1, num) - 1) % PLAYER_COLORS.length]
}
