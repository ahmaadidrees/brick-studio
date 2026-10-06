import { describe, expect, it } from 'vitest'
import type { BrickDef, LevelDesign, Target, World } from '../../core/contracts'
import { fakeGridTemplate } from '../builder/testGridBricks'
import { fitCamera } from './camera'
import { cellCostumeIndex, gridBrickIndex, visibleCells } from './gridCells'
import { ImageCache, drawGridCells, renderPlayMode } from './renderer'

const ground: BrickDef = { ...fakeGridTemplate('ground').brick, id: 'g' }
const qblock: BrickDef = { ...fakeGridTemplate('qblock').brick, id: 'q' }

function design(rows: string[], bricks: BrickDef[] = [ground, qblock]): LevelDesign {
  return {
    id: 'd',
    name: 'd',
    seed: 1,
    bounds: { left: 0, right: rows[0].length * 16, bottom: 0, top: rows.length * 16 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks,
    copies: [],
    tiles: { cols: rows[0].length, rows: rows.length, data: rows },
  }
}

describe('autotile costume rule (GridSpec): costume 2 when the cell directly above holds the same brick', () => {
  const d = design(['GGG', 'G.G', '.Q.'])
  it('picks grass (1) on top, dirt (2) under another ground; the row index is bottom-up', () => {
    const t = d.tiles!
    expect(cellCostumeIndex(t, ground, 0, 1)).toBe(0) // above it (row 2) is empty
    expect(cellCostumeIndex(t, ground, 0, 0)).toBe(1) // row 1 above is ground
    expect(cellCostumeIndex(t, ground, 2, 2)).toBe(0)
    expect(cellCostumeIndex(t, ground, 1, 2)).toBe(0)
    expect(cellCostumeIndex(t, ground, 1, 0)).toBe(0) // gap above
  })
  it('a brick without autotile, or with one costume, always uses costume 1', () => {
    expect(cellCostumeIndex({ cols: 1, rows: 2, data: ['Q', 'Q'] }, qblock, 0, 0)).toBe(0)
    expect(cellCostumeIndex({ cols: 1, rows: 2, data: ['G', 'G'] }, { ...ground, costumes: [ground.costumes[0]] }, 0, 0)).toBe(0)
  })
  it('indexes grid bricks by character', () => {
    expect([...gridBrickIndex(d).keys()].sort()).toEqual(['G', 'Q'])
  })
})

/** A recording canvas context: counts drawImage calls and remembers the image each one used. */
function fakeCtx() {
  const draws: { img: unknown; x: number; y: number; w?: number; h?: number }[] = []
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    filter: '',
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillRect() {},
    strokeRect() {},
    setLineDash() {},
    translate() {},
    rotate() {},
    scale() {},
    drawImage(img: unknown, x: number, y: number, w?: number, h?: number) {
      draws.push({ img, x, y, w, h })
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, draws }
}

/** An image cache whose images are plain tagged objects, so tests need no real image decoding. */
function fakeCache(): ImageCache {
  const cache = new ImageCache()
  const imgs = new Map<string, unknown>()
  cache.getImage = (url: string) => {
    if (!imgs.has(url)) imgs.set(url, { url, width: 16, height: 16, complete: true, naturalWidth: 16 })
    return imgs.get(url) as HTMLImageElement
  }
  return cache
}

describe('Build draws each filled cell with its brick costume', () => {
  it('draws one image per filled cell on screen, grass on top and dirt under it', () => {
    const d = design(['.....', 'GGG..', 'GQG..'].reverse())
    // rows are bottom-up: row 0 = 'GQG..', row 1 = 'GGG..'
    const { ctx, draws } = fakeCtx()
    const vp = { width: 480, height: 360 }
    drawGridCells(ctx, d, fitCamera(d.bounds, vp), vp, fakeCache())
    expect(draws).toHaveLength(6)
    const grass = ground.costumes[0].asset
    const dirt = ground.costumes[1].asset
    const used = draws.map((x) => (x.img as { url: string }).url)
    // bottom row: ground under ground = dirt, ? block, ground under ground = dirt
    expect(used.filter((u) => u === dirt)).toHaveLength(2)
    expect(used.filter((u) => u === grass)).toHaveLength(3)
    expect(used.filter((u) => u === qblock.costumes[0].asset)).toHaveLength(1)
  })

  it('cells off screen are not drawn', () => {
    const d = design(['G'.repeat(60), 'G'.repeat(60)])
    const { ctx, draws } = fakeCtx()
    const vp = { width: 160, height: 120 }
    const cam = { x: 80, y: 16, viewWidth: 160 }
    drawGridCells(ctx, d, cam, vp, fakeCache())
    expect(draws.length).toBeGreaterThan(0)
    expect(draws.length).toBeLessThanOrEqual((160 / 16 + 2) * 2)
    expect(visibleCells(d.tiles!, cam, vp).c1).toBeLessThan(15)
  })

  it('an empty design or one with no grid bricks draws nothing and does not throw', () => {
    const { ctx, draws } = fakeCtx()
    const vp = { width: 480, height: 360 }
    const d = design(['GG', 'GG'], [])
    expect(() => drawGridCells(ctx, d, fitCamera(d.bounds, vp), vp, fakeCache())).not.toThrow()
    expect(draws).toHaveLength(0)
  })
})

describe('Play draws cells as ordinary targets (2,000+ sprites)', () => {
  function worldWith(n: number): World {
    const targets: Target[] = Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      brickId: 'g',
      isStage: false,
      isClone: false,
      copyId: `cell:${i % 250}:${Math.floor(i / 250)}`,
      x: (i % 250) * 16 + 8,
      y: Math.floor(i / 250) * 16 + 8,
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
    }))
    return {
      tick: 0,
      timerStartTick: 0,
      bounds: { left: 0, right: 4000, bottom: 0, top: 320 },
      stage: { ...targets[0], id: 'stage', isStage: true, brickId: 'stage' },
      targets,
      bricks: { g: ground, stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } } },
    } as unknown as World
  }

  it('draws only the sprites on screen (fast path, no per-sprite save/restore), whatever the level size', () => {
    const w = worldWith(4000)
    const { ctx, draws } = fakeCtx()
    const vp = { width: 800, height: 400 }
    renderPlayMode(ctx, w, { camera: { x: 400, y: 160, viewWidth: 800 }, viewport: vp }, fakeCache())
    // 800/16 = 50 columns of 16 rows on screen: about 800 cells (plus a margin), not 4,000
    expect(draws.length).toBeGreaterThan(780)
    expect(draws.length).toBeLessThan(1000)
  })

  it('4,000 sprites render in well under a frame budget (recorded in the report)', () => {
    const w = worldWith(4000)
    const { ctx } = fakeCtx()
    const vp = { width: 4000, height: 320 }
    const cache = fakeCache()
    const camera = { x: 2000, y: 160, viewWidth: 4000 }
    renderPlayMode(ctx, w, { camera, viewport: vp }, cache) // warm
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) renderPlayMode(ctx, w, { camera, viewport: vp }, cache)
    const perFrame = (performance.now() - t0) / 20
    console.info(`renderPlayMode: 4,000 sprites, all on screen: ${perFrame.toFixed(2)} ms per frame (fake canvas)`)
    expect(perFrame).toBeLessThan(16)
  })
})
