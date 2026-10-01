import { describe, expect, it } from 'vitest'
import type { BrickDef, LevelDesign, Target, World } from '../../core/contracts'
import { costumeFromImage, imageFromRows } from '../pixels'
import { copyHitTest, pickCopy, pickTarget } from './picking'

function makeTestCostume(name: string, fillChar = '#') {
  // 10x10 costume with '#' filled
  return costumeFromImage(
    name,
    imageFromRows(
      [
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
        fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar + fillChar,
      ],
      { [fillChar]: '#ff0000' },
    ),
  )
}

function makeDonutCostume(name: string) {
  // 10x10 costume with transparent hole in middle
  return costumeFromImage(
    name,
    imageFromRows(
      [
        '##########',
        '##########',
        '##......##',
        '##......##',
        '##......##',
        '##......##',
        '##......##',
        '##......##',
        '##########',
        '##########',
      ],
      { '#': '#00ff00' },
    ),
  )
}

describe('hit-picking order', () => {
  const costumeSolid = makeTestCostume('solid')
  const costumeDonut = makeDonutCostume('donut')

  const brickA: BrickDef = {
    id: 'brickA',
    name: 'Brick A',
    costumes: [costumeSolid],
    sounds: [],
    program: { scripts: [], procedures: [], variables: [], lists: [] },
  }
  const brickB: BrickDef = {
    id: 'brickB',
    name: 'Brick B',
    costumes: [costumeDonut],
    sounds: [],
    program: { scripts: [], procedures: [], variables: [], lists: [] },
  }

  const stageTarget: Target = {
    id: 'stage',
    brickId: 'stage',
    isStage: true,
    isClone: false,
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    draggable: false,
    costumeIndex: 0,
    rotationStyle: 'all around',
    effects: { color: 0, fisheye: 0, whirl: 0, pixelate: 0, mosaic: 0, brightness: 0, ghost: 0 },
    volume: 100,
    soundEffects: { pitch: 0, pan: 0 },
    variables: {},
    lists: {},
    bubble: null,
    edgeHatState: {},
  }

  function makeSpriteTarget(id: string, brickId: string, x: number, y: number, visible = true): Target {
    return {
      ...stageTarget,
      id,
      brickId,
      isStage: false,
      x,
      y,
      visible,
    }
  }

  it('picks the topmost target when multiple targets overlap', () => {
    const bottomTarget = makeSpriteTarget('tBottom', 'brickA', 100, 100)
    const topTarget = makeSpriteTarget('tTop', 'brickA', 100, 100)

    const world: World = {
      tick: 0,
      timerStartTick: 0,
      bounds: { left: 0, right: 960, bottom: 0, top: 360 },
      stage: stageTarget,
      targets: [bottomTarget, topTarget], // topTarget is in front
      bricks: { brickA },
      keysDown: new Set(),
      mouse: { x: 0, y: 0, down: false },
      answer: '',
      rngState: 1,
      cloneCount: 0,
      nextTargetId: 10,
    }

    // Click in center of both sprites (100, 100)
    const picked = pickTarget(world, 100, 100)
    expect(picked.id).toBe('tTop')
  })

  it('skips a hidden target even if it is on top, picking the target beneath', () => {
    const bottomTarget = makeSpriteTarget('tBottom', 'brickA', 100, 100, true)
    const topTarget = makeSpriteTarget('tTop', 'brickA', 100, 100, false) // hidden

    const world: World = {
      tick: 0,
      timerStartTick: 0,
      bounds: { left: 0, right: 960, bottom: 0, top: 360 },
      stage: stageTarget,
      targets: [bottomTarget, topTarget],
      bricks: { brickA },
      keysDown: new Set(),
      mouse: { x: 0, y: 0, down: false },
      answer: '',
      rngState: 1,
      cloneCount: 0,
      nextTargetId: 10,
    }

    const picked = pickTarget(world, 100, 100)
    expect(picked.id).toBe('tBottom')
  })

  it('falls through transparent pixels of topmost target to target behind', () => {
    // Bottom target is solid 10x10 at (100, 100)
    const bottomTarget = makeSpriteTarget('tBottom', 'brickA', 100, 100)
    // Top target is donut (transparent hole in middle) at (100, 100)
    const topTarget = makeSpriteTarget('tTop', 'brickB', 100, 100)

    const world: World = {
      tick: 0,
      timerStartTick: 0,
      bounds: { left: 0, right: 960, bottom: 0, top: 360 },
      stage: stageTarget,
      targets: [bottomTarget, topTarget],
      bricks: { brickA, brickB },
      keysDown: new Set(),
      mouse: { x: 0, y: 0, down: false },
      answer: '',
      rngState: 1,
      cloneCount: 0,
      nextTargetId: 10,
    }

    // Center (100, 100) is in the donut hole (transparent), so bottomTarget is hit!
    const pickedCenter = pickTarget(world, 100, 100)
    expect(pickedCenter.id).toBe('tBottom')

    // Rim (104, 104) is opaque on donut, so topTarget is hit!
    const pickedRim = pickTarget(world, 104, 104)
    expect(pickedRim.id).toBe('tTop')
  })

  it('falls through to world.stage when clicking empty space', () => {
    const target = makeSpriteTarget('t1', 'brickA', 100, 100)
    const world: World = {
      tick: 0,
      timerStartTick: 0,
      bounds: { left: 0, right: 960, bottom: 0, top: 360 },
      stage: stageTarget,
      targets: [target],
      bricks: { brickA },
      keysDown: new Set(),
      mouse: { x: 0, y: 0, down: false },
      answer: '',
      rngState: 1,
      cloneCount: 0,
      nextTargetId: 10,
    }

    const picked = pickTarget(world, 800, 200)
    expect(picked).toBe(stageTarget)
    expect(picked.isStage).toBe(true)
  })

  it('picks copies correctly in Build mode', () => {
    const design: LevelDesign = {
      id: 'lvl1',
      name: 'Test Level',
      bounds: { left: 0, right: 960, bottom: 0, top: 360 },
      stage: { ...stageTarget, name: 'Stage', costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
      bricks: [brickA, brickB],
      copies: [
        { id: 'copy1', brickId: 'brickA', x: 50, y: 50 },
        { id: 'copy2', brickId: 'brickA', x: 50, y: 50 }, // copy2 is in front
      ],
      seed: 1,
    }

    // Both copies at (50, 50); copy2 is in front (later in array)
    const picked = pickCopy(design, 50, 50)
    expect(picked?.id).toBe('copy2')

    // Clicking empty space
    expect(pickCopy(design, 400, 200)).toBeNull()
  })
})
