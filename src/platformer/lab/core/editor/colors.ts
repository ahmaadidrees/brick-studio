/** Block category colors (Scratch's, plus the Platformer extension's own). Shared by definitions.ts and tileBlocks.ts. */
export const CATEGORY_COLORS = {
  motion: '#4C97FF',
  looks: '#9966FF',
  sound: '#CF63CF',
  events: '#FFBF00',
  control: '#FFAB19',
  sensing: '#4CBFE6',
  operators: '#59C059',
  variables: '#FF8C1A',
  lists: '#FF661A',
  procedures: '#FF6680',
  /** Platformer extension (step 3): its own color, not shared with any Scratch category. */
  platformer: '#2BB3A3',
} as const
