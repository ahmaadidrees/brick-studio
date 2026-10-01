/**
 * Kid-friendly word lists for Code Lab Wave 2.
 * Kids pick from these word lists rather than typing freeform text.
 * Covers: variables, lists, broadcast messages, custom block labels, and inputs.
 */

export interface WordCategory {
  id: string
  name: string
  words: string[]
}

export const VARIABLE_CATEGORIES: WordCategory[] = [
  {
    id: 'game',
    name: 'Game & Score',
    words: [
      'score',
      'points',
      'coins',
      'gems',
      'stars',
      'lives',
      'health',
      'level',
      'timer',
      'keys',
      'ammo',
      'energy',
      'power',
      'shield',
      'combo',
      'streak',
    ],
  },
  {
    id: 'physics',
    name: 'Motion & Physics',
    words: [
      'speed',
      'jump height',
      'gravity',
      'bounce',
      'friction',
      'weight',
      'distance',
      'angle',
      'direction',
      'thrust',
      'drift',
      'velocity',
    ],
  },
  {
    id: 'stats',
    name: 'Stats & State',
    words: [
      'count',
      'size',
      'delay',
      'cooldown',
      'opacity',
      'strength',
      'step',
      'phase',
      'target',
      'radius',
      'volume',
      'pitch',
    ],
  },
]

export const ALL_VARIABLE_WORDS: string[] = Array.from(
  new Set(VARIABLE_CATEGORIES.flatMap((c) => c.words)),
)

export const LIST_CATEGORIES: WordCategory[] = [
  {
    id: 'items',
    name: 'Items & Loot',
    words: [
      'inventory',
      'items',
      'bag',
      'loot',
      'treasures',
      'cards',
      'tools',
      'weapons',
      'badges',
      'collected',
    ],
  },
  {
    id: 'world',
    name: 'World & Quests',
    words: [
      'high scores',
      'enemies',
      'waypoints',
      'messages',
      'words',
      'secrets',
      'friends',
      'quests',
      'checkpoints',
      'history',
    ],
  },
]

export const ALL_LIST_WORDS: string[] = Array.from(
  new Set(LIST_CATEGORIES.flatMap((c) => c.words)),
)

export const BROADCAST_CATEGORIES: WordCategory[] = [
  {
    id: 'flow',
    name: 'Game Flow',
    words: [
      'start game',
      'game over',
      'victory',
      'level complete',
      'next level',
      'reset',
      'respawn',
      'ready',
      'go',
      'pause',
    ],
  },
  {
    id: 'action',
    name: 'Events & Action',
    words: [
      'player hit',
      'power up',
      'danger',
      'alert',
      'boss fight',
      'open door',
      'close door',
      'collect item',
      'jump',
      'bounce',
      'trigger switch',
      'shake camera',
    ],
  },
]

export const ALL_BROADCAST_WORDS: string[] = Array.from(
  new Set(BROADCAST_CATEGORIES.flatMap((c) => c.words)),
)

export const PROCEDURE_LABEL_CATEGORIES: WordCategory[] = [
  {
    id: 'movement',
    name: 'Movement',
    words: [
      'jump',
      'dash',
      'spin',
      'bounce',
      'glide',
      'slide',
      'hover',
      'flip',
      'teleport',
      'patrol',
      'stomp',
      'float',
    ],
  },
  {
    id: 'effects',
    name: 'Effects & Actions',
    words: [
      'flash',
      'shake',
      'blink',
      'explode',
      'celebrate',
      'dance',
      'cheer',
      'heal',
      'attack',
      'collect',
      'reset',
      'setup',
    ],
  },
  {
    id: 'connectors',
    name: 'Label Connectors',
    words: [
      'times',
      'by',
      'to',
      'with',
      'and',
      'until',
      'for',
      'at',
      'then',
    ],
  },
]

export const ALL_PROCEDURE_LABEL_WORDS: string[] = Array.from(
  new Set(PROCEDURE_LABEL_CATEGORIES.flatMap((c) => c.words)),
)

export const PROCEDURE_INPUT_WORDS: string[] = [
  'steps',
  'times',
  'speed',
  'height',
  'delay',
  'amount',
  'power',
  'distance',
  'direction',
  'duration',
  'count',
  'size',
  'x',
  'y',
]

export const PROCEDURE_BOOLEAN_WORDS: string[] = [
  'fast?',
  'active?',
  'ready?',
  'touching?',
  'visible?',
  'inverted?',
  'grounded?',
  'charged?',
  'enabled?',
  'done?',
]
