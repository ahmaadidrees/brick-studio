import { describe, it, expect } from 'vitest'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { C, T } from '@brick-studio/platformer-core/engine/tiles'
import { advanceWorld, createWorld, hashWorld } from '@brick-studio/platformer-core/engine/world'
import { Editor } from './editor'
import { itemById } from './palette'

function setup() {
  const world = createWorld(createBlankLevel(40, 20, 'Test'))
  const editor = new Editor({ world: () => world, sound: () => {} })
  /** Send whatever the editor produced and advance the world one tick. */
  const tick = () => {
    const ops = editor.flush()
    advanceWorld(world, ops.length ? [{ ev: { t: 'edit', ops }, by: 1 }] : [])
  }
  const click = (tx: number, ty: number, erase = false) => {
    editor.pointerDown(tx * 16 + 8, ty * 16 + 8, erase)
    editor.pointerUp()
    tick()
  }
  const tile = (x: number, y: number) => world.design.tiles[y * world.width + x]
  const content = (x: number, y: number) => world.design.contents[y * world.width + x]
  return { world, editor, tick, click, tile, content }
}

describe('Editor', () => {
  it('paints tiles along a drag, including cells skipped by a fast mouse', () => {
    const h = setup()
    h.editor.select(itemById('hard')!)
    h.editor.pointerDown(2 * 16 + 8, 5 * 16 + 8, false)
    h.editor.pointerMove(9 * 16 + 8, 5 * 16 + 8)
    h.editor.pointerUp()
    h.tick()
    for (let x = 2; x <= 9; x++) expect(h.tile(x, 5)).toBe(T.HARD)
  })

  it('drops items into ? blocks and bricks', () => {
    const h = setup()
    h.editor.select(itemById('qblock')!)
    h.click(5, 10)
    expect(h.content(5, 10)).toBe(C.COIN)
    h.editor.select(itemById('grow')!)
    h.click(5, 10)
    expect(h.tile(5, 10)).toBe(T.QBLOCK)
    expect(h.content(5, 10)).toBe(C.GROW)
    // Off a block, the grow power-up is placed as an object instead.
    h.click(8, 10)
    expect(h.world.design.objects.some((o) => o.kind === 'grow' && o.x === 8 && o.y === 10)).toBe(true)
  })

  it('places pipes down to the ground and erases the whole pipe', () => {
    const h = setup()
    h.editor.select(itemById('pipe')!)
    h.click(10, 14)
    for (let y = 14; y <= 17; y++) {
      expect(h.tile(10, y)).toBe(T.PIPE_L)
      expect(h.tile(11, y)).toBe(T.PIPE_R)
    }
    expect(h.tile(10, 18)).toBe(T.GROUND)
    h.click(11, 16, true)
    for (let y = 14; y <= 17; y++) expect(h.tile(10, y) + h.tile(11, y)).toBe(0)
  })

  it('moves the start instead of adding a second one', () => {
    const h = setup()
    h.editor.select(itemById('start')!)
    h.click(7, 12)
    const starts = h.world.design.objects.filter((o) => o.kind === 'start')
    expect(starts).toHaveLength(1)
    expect([starts[0].x, starts[0].y]).toEqual([7, 12])
  })

  it('undoes and redoes whole strokes exactly', () => {
    const h = setup()
    const before = hashWorld(h.world)
    const beforeTiles = h.world.design.tiles.slice()
    h.editor.select(itemById('brick')!)
    h.editor.pointerDown(3 * 16, 3 * 16, false)
    h.editor.pointerMove(6 * 16, 3 * 16)
    h.editor.pointerUp()
    h.tick()
    h.editor.select(itemById('walker')!)
    h.click(12, 17)
    const afterTiles = h.world.design.tiles.slice()
    const walkers = () => h.world.design.objects.filter((o) => o.kind === 'walker').length
    expect(walkers()).toBe(1)
    h.editor.undo()
    h.tick()
    expect(walkers()).toBe(0)
    h.editor.undo()
    h.tick()
    expect(Array.from(h.world.design.tiles)).toEqual(Array.from(beforeTiles))
    h.editor.redo()
    h.tick()
    h.editor.redo()
    h.tick()
    expect(Array.from(h.world.design.tiles)).toEqual(Array.from(afterTiles))
    expect(walkers()).toBe(1)
    expect(before).not.toBe(hashWorld(h.world))
  })

  it('erases objects before the tile beneath them', () => {
    const h = setup()
    h.editor.select(itemById('shellbug')!)
    h.click(15, 17)
    expect(h.world.design.objects.some((o) => o.kind === 'shellbug')).toBe(true)
    h.click(15, 17, true)
    expect(h.world.design.objects.some((o) => o.kind === 'shellbug')).toBe(false)
    expect(h.tile(15, 18)).toBe(T.GROUND)
  })
})
