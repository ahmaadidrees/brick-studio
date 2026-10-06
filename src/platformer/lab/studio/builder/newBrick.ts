/** "+ New brick": start from a brick that works (BRICK_TEMPLATES), name it from a picked word, open the workshop. */
import { blankImage, costumeFromImage } from '../pixels'
import { chooseUniqueName } from '../assets/words'
import type { StudioStore } from '../store'
import type { BrickTemplate } from '../templates'

/**
 * Make a brick from a template and open the workshop on it. Returns the new brick's id.
 * `word` is the name the kid picked; it is made unique among the level's bricks ("Robot 2").
 */
export function createBrickFromTemplate(store: StudioStore, template: BrickTemplate, word: string): string {
  const design = store.getState().project.design
  const name = chooseUniqueName(word, design.bricks.map((b) => b.name))
  const taken = new Set(design.bricks.map((b) => b.id))
  let n = 1
  while (taken.has(`${template.id}_${n}`)) n++
  const { brick, workspace } = template.make(`${template.id}_${n}`, name)
  const { id: _id, ...rest } = brick
  const id = store.addBrickFrom({ ...rest, name }, workspace)
  store.openWorkshop(id)
  return id
}

/** When there are no templates yet: a brick with one blank costume, so a kid can still start. */
export function createBlankBrick(store: StudioStore, word: string): string {
  const names = store.getState().project.design.bricks.map((b) => b.name)
  const name = chooseUniqueName(word, names)
  const id = store.addBrick(name, costumeFromImage(name, blankImage(32, 32)))
  store.openWorkshop(id)
  return id
}
