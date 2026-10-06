import type { BrickDef } from '../../core/contracts'
import type { GridBrickKey, GridBrickTemplate } from '../gridBricks'
import { costumeFromImage, imageFromRows } from '../pixels'

/**
 * TEST DOUBLE for `gridBrickTemplate` (studio/gridBricks.ts). The real one is filled in by the step 7 bricks lane; until
 * it merges the stub throws, so builder tests mock it with this: same keys, chars, names and categories, plain 16x16
 * costumes and no scripts. Not shipped code.
 */
const SPEC: Record<GridBrickKey, { name: string; char: string; color: string; color2?: string; category: 'terrain' | 'blocks'; hint?: string }> = {
  ground: { name: 'Ground', char: 'G', color: '#59a640', color2: '#8a5a33', category: 'terrain' },
  hard: { name: 'Hard block', char: 'H', color: '#888c99', category: 'terrain' },
  spikes: { name: 'Spikes', char: 'S', color: '#c0c4cc', category: 'terrain' },
  lava: { name: 'Lava', char: 'L', color: '#e8561e', category: 'terrain' },
  semi: { name: 'One-way platform', char: '-', color: '#b08850', category: 'terrain', hint: 'Jump up through it, land on top' },
  brick: { name: 'Brick', char: 'B', color: '#c8662a', category: 'blocks' },
  qblock: { name: '? block', char: 'Q', color: '#f2c230', category: 'blocks' },
  bounce: { name: 'Bounce block', char: 'O', color: '#3ec1a0', category: 'blocks', hint: 'Land on it to spring up' },
}

const solid = (name: string, color: string) => costumeFromImage(name, imageFromRows(Array.from({ length: 16 }, () => '#'.repeat(16)), { '#': color }))

export function fakeGridTemplate(key: GridBrickKey): GridBrickTemplate {
  const s = SPEC[key]
  const brick: Omit<BrickDef, 'id'> = {
    name: s.name,
    grid: { char: s.char, ...(s.color2 ? { autotile: true } : {}) },
    costumes: s.color2 ? [solid('top', s.color), solid('fill', s.color2)] : [solid('costume', s.color)],
    sounds: [],
    program: { scripts: [], procedures: [], variables: [], lists: [] },
  }
  return { key, brick, workspace: { blocks: { languageVersion: 0, blocks: [] }, marker: `fake-${key}` }, category: s.category, ...(s.hint ? { hint: s.hint } : {}) }
}
