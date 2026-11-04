/**
 * The classic race kit's track bricks (parity bucket B): offered in Hackable Racing's drawer, added when picked, and
 * driven into or over like the classic ones.
 */
import { describe, expect, it } from 'vitest'
import type { LevelDesign, Target } from '../../core/contracts'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { StudioStore } from '../store'
import { extraEntryId, brickEntryId } from '../builder/catalog'
import { raceDrawerEntries } from './raceDrawer'
import { createRaceStarterProject } from './raceProject'
import { CAR_BRICK_ID } from './carBrick'
import { TIRES_BRICK_ID } from './raceExtras'

/** A race starter store with `id` added from the drawer. */
function withBrick(id: string): StudioStore {
  const store = new StudioStore(createRaceStarterProject())
  expect(store.addCatalogBrick(id)).toBe(id)
  return store
}

/** The track with a column of `ch` painted across the starting straight, a little ahead of the Car, and no racers. */
function wall(design: LevelDesign, ch: string): LevelDesign {
  const car = design.copies.find((c) => c.brickId === CAR_BRICK_ID)!
  const col = Math.floor(car.x / 16) + 14
  return {
    ...design,
    tiles: { ...design.tiles!, data: design.tiles!.data.map((row) => row.slice(0, col) + ch + row.slice(col + 1)) },
    copies: design.copies.filter((c) => !c.brickId.startsWith('brick_racer')),
  }
}

function crash(design: LevelDesign): { before: number; after: number } {
  const rt = play(design)
  const car = rt.world.targets.find((t) => t.brickId === CAR_BRICK_ID && !t.isClone) as Target
  rt.pressKey('up arrow')
  let last = 0
  for (let k = 0; k < 400; k++) {
    rt.step()
    const vx = car.body?.vx ?? 0
    if (last > 1 && vx < 0) return { before: last, after: vx }
    last = vx
  }
  throw new Error('never hit it')
}

describe('Tire stack', () => {
  it('is offered in the drawer under Track, and picking it adds it with its own paint character', () => {
    const offer = raceDrawerEntries(createRaceStarterProject().design.bricks).find((e) => e.id === extraEntryId(TIRES_BRICK_ID))
    expect(offer).toMatchObject({ name: 'Tire stack', category: 'track', brick: undefined })
    const store = withBrick(TIRES_BRICK_ID)
    const design = store.getState().project.design
    const tires = design.bricks.find((b) => b.id === TIRES_BRICK_ID)!
    expect(tires.grid?.char).toBe('T')
    expect(raceDrawerEntries(design.bricks).find((e) => e.id === brickEntryId(TIRES_BRICK_ID))?.brick?.id).toBe(TIRES_BRICK_ID)
    expect(validateDesign(design)).toEqual([])
  })

  it('a track that already paints with T gets another character for it', () => {
    const project = createRaceStarterProject()
    const road = project.design.bricks.find((b) => b.id === 'brick_road')!
    project.design.bricks.push({ ...road, id: 'brick_mine', name: 'Mud', grid: { char: 'T' } })
    const store = new StudioStore(project)
    store.addCatalogBrick(TIRES_BRICK_ID)
    const chars = store.getState().project.design.bricks.flatMap((b) => (b.grid ? [b.grid.char] : []))
    expect(new Set(chars).size).toBe(chars.length)
  })

  it('a car crashing into it hardly bounces: the classic 0.08 of its speed back', () => {
    const design = withBrick(TIRES_BRICK_ID).getState().project.design
    const { before, after } = crash(wall(design, 'T'))
    expect(Math.abs(after + before * 0.08)).toBeLessThan(0.25)
  })
})
