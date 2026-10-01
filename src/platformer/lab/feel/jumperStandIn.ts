/**
 * The stand-in hero used until the open-block Hero exists: the starter's Jumper (step 3) on a floor made of the starter's Ground.
 * It has no momentum, run, variable jump height, coyote time or buffer, so it is expected to miss most tolerances.
 */
import type { LevelDesign } from '../core/contracts'
import { compileWorkspace } from '../core/editor/compile'
import { createCostumes, createJumperWorkspace, createStarterProject } from '../studio/starter'
import type { CodeLabHeroOptions } from './adapter'

export function createJumperStandInOptions(): CodeLabHeroOptions {
  // The starter now uses the Hero; the Jumper brick is rebuilt here from its workspace so the stand-in stays the same.
  const { design: starter } = createStarterProject()
  const jumper = { id: 'brick_jumper', name: 'Jumper', costumes: [createCostumes().jumperCostume], sounds: [], program: compileWorkspace(createJumperWorkspace()).program }
  const design: LevelDesign = {
    ...starter,
    bricks: [...starter.bricks, jumper],
    copies: [...starter.copies, { id: 'copy_jumper', brickId: 'brick_jumper', x: 60, y: 40 }],
  }
  const keep = new Set(['brick_ground', 'brick_jumper'])
  const flat: LevelDesign = {
    ...design,
    bricks: design.bricks.filter((b) => keep.has(b.id)),
    // Ground and the Jumper only: no platforms, walkers or coins nearby (STEP5.md: "nothing nearby").
    copies: design.copies.filter((c) => keep.has(c.brickId)).map((c) => (c.id === 'copy_jumper' ? { ...c, y: 24 } : c)),
  }
  return { design: flat, heroCopyId: 'copy_jumper' }
}
