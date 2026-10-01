import { describe, expect, it } from 'vitest'
import { blankImage, costumeFromImage } from '../pixels'
import { emptyProject, STAGE_ID, StudioStore } from '../store'
import { resizeImage } from './pixelOps'

describe('CostumeEditor logic and store operations', () => {
  it('adds, duplicates, reorders, and deletes costumes', () => {
    const store = new StudioStore(emptyProject())
    const initialCostume = costumeFromImage('idle', blankImage(32, 32))
    const brickId = store.addBrick('Hero', initialCostume)

    // 1. Initial costume
    let brick = store.brick(brickId)!
    expect(brick.costumes.length).toBe(1)
    expect(brick.costumes[0].name).toBe('idle')

    // 2. Add second costume
    const runCostume = costumeFromImage('run1', blankImage(32, 32))
    store.setCostumes(brickId, [...brick.costumes, runCostume])
    brick = store.brick(brickId)!
    expect(brick.costumes.length).toBe(2)
    expect(brick.costumes[1].name).toBe('run1')

    // 3. Duplicate costume
    const duplicate = costumeFromImage('run2', blankImage(32, 32))
    store.setCostumes(brickId, [...brick.costumes, duplicate])
    brick = store.brick(brickId)!
    expect(brick.costumes.length).toBe(3)
    expect(brick.costumes.map((c) => c.name)).toEqual(['idle', 'run1', 'run2'])

    // 4. Reorder: move 'run1' up to index 0
    const reordered = [brick.costumes[1], brick.costumes[0], brick.costumes[2]]
    store.setCostumes(brickId, reordered)
    brick = store.brick(brickId)!
    expect(brick.costumes.map((c) => c.name)).toEqual(['run1', 'idle', 'run2'])

    // 5. Delete costume
    const afterDelete = brick.costumes.filter((c) => c.name !== 'run2')
    store.setCostumes(brickId, afterDelete)
    brick = store.brick(brickId)!
    expect(brick.costumes.length).toBe(2)
    expect(brick.costumes.map((c) => c.name)).toEqual(['run1', 'idle'])

    // 6. Delete again, leaving one (keep at least one)
    const single = [brick.costumes[0]]
    store.setCostumes(brickId, single)
    brick = store.brick(brickId)!
    expect(brick.costumes.length).toBe(1)
  })

  it('sizes stage backdrops to the level view', () => {
    const store = new StudioStore(emptyProject())
    const bounds = store.getState().project.design.bounds
    const levelViewWidth = Math.min(bounds.right - bounds.left, 480)
    const levelViewHeight = bounds.top - bounds.bottom

    expect(levelViewWidth).toBe(480)
    expect(levelViewHeight).toBe(360)

    const backdrop = costumeFromImage(
      'Sky',
      blankImage(levelViewWidth, levelViewHeight)
    )
    store.setCostumes(STAGE_ID, [backdrop])

    const stage = store.brick(STAGE_ID)!
    expect(stage.costumes.length).toBe(1)
    expect(stage.costumes[0].width).toBe(480)
    expect(stage.costumes[0].height).toBe(360)
    expect(stage.costumes[0].rotationCenterX).toBe(240)
    expect(stage.costumes[0].rotationCenterY).toBe(180)
  })

  it('updates costume rotation center accurately', () => {
    const img = blankImage(32, 32)
    const costume = costumeFromImage('centerTest', img, { x: 8, y: 24 })
    expect(costume.rotationCenterX).toBe(8)
    expect(costume.rotationCenterY).toBe(24)
  })

  it('resizes images within the 8–128 px range', () => {
    const img = blankImage(32, 32)
    const resizedSmall = resizeImage(img, 16, 16)
    expect(resizedSmall.width).toBe(16)
    expect(resizedSmall.height).toBe(16)

    const resizedLarge = resizeImage(img, 128, 128)
    expect(resizedLarge.width).toBe(128)
    expect(resizedLarge.height).toBe(128)
  })
})
