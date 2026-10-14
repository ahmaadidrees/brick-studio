import { describe, expect, it } from 'vitest'
import { createBlankRaceLevel } from '@brick-studio/platformer-core/engine/level'
import { RT } from '@brick-studio/platformer-core/engine/raceTiles'
import { advanceWorld, createWorld } from '@brick-studio/platformer-core/engine/world'
import { Editor } from './editor'
import { RACE_PALETTE } from './racePalette'

const item = (id: string) => RACE_PALETTE.find((p) => p.id === id)!

function setup() {
  const world = createWorld(createBlankRaceLevel(40, 20, 'Track'))
  const editor = new Editor({ world: () => world, sound: () => {} })
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
  const start = () => world.design.objects.find((o) => o.kind === 'start')!
  return { world, editor, tick, click, tile, start }
}

describe('Editor on a race track', () => {
  it('starts with the race kit’s bricks in hand and paints race tiles', () => {
    const h = setup()
    expect(h.editor.race).toBe(true)
    expect(h.editor.item.id).toBe('race-road')
    h.editor.pointerDown(2 * 16 + 8, 5 * 16 + 8, false)
    h.editor.pointerMove(9 * 16 + 8, 5 * 16 + 8)
    h.editor.pointerUp()
    h.tick()
    for (let x = 2; x <= 9; x++) expect(h.tile(x, 5)).toBe(RT.ROAD)
  })

  it('paints under the starting grid without removing it, and erasing there keeps the grid', () => {
    const h = setup()
    const s = h.start()
    h.click(s.x, s.y)
    expect(h.tile(s.x, s.y)).toBe(RT.ROAD)
    expect(h.start()).toBeDefined()
    h.click(s.x, s.y, true)
    expect(h.tile(s.x, s.y)).toBe(RT.GRASS)
    expect(h.start()).toBeDefined()
  })

  it('moves the grid onto road without clearing the road', () => {
    const h = setup()
    h.click(10, 10)
    h.editor.select(item('race-start'))
    h.click(10, 10)
    expect(h.start()).toMatchObject({ x: 10, y: 10 })
    expect(h.tile(10, 10)).toBe(RT.ROAD)
  })

  it('R turns the boost pad in hand, so pads point where they were turned', () => {
    const h = setup()
    h.editor.select(item('race-boost'))
    h.click(3, 3)
    h.editor.flip()
    h.click(4, 3)
    h.editor.flip()
    h.editor.flip()
    h.click(5, 3)
    expect([h.tile(3, 3), h.tile(4, 3), h.tile(5, 3)]).toEqual([RT.BOOST_R, RT.BOOST_D, RT.BOOST_U])
  })

  it('R on the finish line and the grid changes the track’s settings, shared and undoable', () => {
    const h = setup()
    h.editor.select(item('race-finish'))
    h.editor.flip()
    h.editor.flip() // two quick turns build on each other before the world catches up
    h.tick()
    expect(h.world.design.race?.finishDir).toBe(2)
    h.editor.select(item('race-start'))
    h.editor.flip()
    h.tick()
    expect(h.world.design.race?.startDir).toBe(1)
    h.editor.undo()
    h.tick()
    expect(h.world.design.race?.startDir).toBe(0)
    h.editor.undo()
    h.editor.undo()
    h.tick()
    expect(h.world.design.race?.finishDir).toBe(0)
  })

  it('laps are a setting too', () => {
    const h = setup()
    h.editor.setRace({ laps: 5 })
    h.tick()
    expect(h.world.design.race?.laps).toBe(5)
  })

  it('boost pads side by side are never mistaken for a pipe (they share its tile numbers)', () => {
    const h = setup()
    h.editor.select(item('race-boost'))
    h.click(6, 6)
    h.editor.flip()
    h.click(7, 6)
    expect([h.tile(6, 6), h.tile(7, 6)]).toEqual([RT.BOOST_R, RT.BOOST_D])
    expect(h.editor.pipeMouths).toEqual([])
    h.editor.select(item('race-road'))
    h.click(6, 6)
    expect(h.editor.selectedPipe).toBeNull()
    expect(h.tile(6, 6)).toBe(RT.ROAD)
    h.click(7, 6, true)
    expect(h.tile(7, 6)).toBe(RT.GRASS)
    expect(h.tile(6, 6)).toBe(RT.ROAD)
  })

  it('puts Walkers on top of the road, never on a wall, and R turns which way they walk', () => {
    const h = setup()
    h.click(8, 8)
    h.editor.select(item('race-walker'))
    h.click(8, 8)
    h.editor.flip()
    h.click(8, 4)
    h.click(0, 4)
    const walkers = h.world.design.objects.filter((o) => o.kind === 'walker')
    expect(walkers.map((o) => [o.x, o.y, o.alt])).toEqual([[8, 8, 0], [8, 4, 1]])
    expect(h.tile(8, 8)).toBe(RT.ROAD)
    h.click(8, 8, true)
    expect(h.world.design.objects.filter((o) => o.kind === 'walker')).toHaveLength(1)
    expect(h.tile(8, 8)).toBe(RT.ROAD)
  })

  it('Items on and off is a track setting', () => {
    const h = setup()
    h.editor.setRace({ items: false })
    h.tick()
    expect(h.world.design.race?.items).toBe(false)
  })
})
