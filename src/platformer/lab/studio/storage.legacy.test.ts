import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from '../core/save'
import { validateDesign } from '../core/project'
import FIXTURE from './__fixtures__/step6b-save.json?raw'
import { fakeGridTemplate } from './builder/testGridBricks'
import { upgradeLegacySaveText } from './legacySave'
import { CODE_LAB_STORAGE_KEY, clearStorageNotice, getStorageNotice, loadProject, saveProject } from './storage'

// gridBrickTemplate is a stub until the step 7 bricks lane merges: these tests use the builder's test double.
vi.mock('./gridBricks', async (orig) => ({ ...(await orig<typeof import('./gridBricks')>()), gridBrickTemplate: (await import('./builder/testGridBricks')).fakeGridTemplate }))

/**
 * A real step 6b save: `exportProjectJson(createStarterProject())` as the 6b starter wrote it (tiles G B Q - O S H, no
 * grid bricks, Hero code with platformer_touchingtile and tile:qblock), with one ? block already hit ('U') before saving.
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
}

const tilesOf = (text: string) => JSON.parse(text).design.tiles.data as string[]
const charsOf = (rows: string[]) => new Set(rows.join('').replaceAll('.', ''))

describe('loading a step 6/6b save (grid bricks, step 7)', () => {
  let storage: MemoryStorage
  beforeEach(() => {
    storage = new MemoryStorage()
    clearStorageNotice()
  })

  it('the fixture really is a step 6b save: tile characters, a used block, no grid bricks, old Hero code', () => {
    expect([...charsOf(tilesOf(FIXTURE))].sort()).toEqual(['-', 'B', 'G', 'H', 'O', 'Q', 'S', 'U'])
    expect(JSON.parse(FIXTURE).design.bricks.some((b: { grid?: unknown }) => b.grid)).toBe(false)
    expect(FIXTURE).toContain('platformer_touchingtile')
  })

  it('adds the standard grid bricks for every character in use, with their workspaces, and rewrites U to Q', () => {
    storage.setItem(CODE_LAB_STORAGE_KEY, FIXTURE)
    const project = loadProject(storage)
    expect(getStorageNotice()).toBeNull()
    const grid = project.design.bricks.filter((b) => b.grid)
    expect(grid.map((b) => b.name).sort()).toEqual(['Bounce block', 'Brick', 'Ground', 'Hard block', 'One-way platform', 'Spikes', '? block'].sort())
    expect(new Map(grid.map((b) => [b.name, b.grid!.char]))).toEqual(
      new Map([['Ground', 'G'], ['Hard block', 'H'], ['Spikes', 'S'], ['One-way platform', '-'], ['Brick', 'B'], ['? block', 'Q'], ['Bounce block', 'O']]),
    )
    for (const b of grid) expect(project.workspaces[b.id]).toBeTruthy()
    expect([...charsOf(project.design.tiles!.data)].sort()).toEqual(['-', 'B', 'G', 'H', 'O', 'Q', 'S'])
    // every non-empty cell belongs to a grid brick, as step 7 validation will insist
    const owned = new Set(grid.map((b) => b.grid!.char))
    for (const ch of charsOf(project.design.tiles!.data)) expect(owned.has(ch)).toBe(true)
  })

  it('keeps everything else: the ? block cells, the other bricks, copies, and the Hero code with platformer_touchingtile', () => {
    storage.setItem(CODE_LAB_STORAGE_KEY, FIXTURE)
    const project = loadProject(storage)
    const before = JSON.parse(FIXTURE)
    const was = before.design.tiles.data as string[]
    const now = project.design.tiles!.data
    // the only difference is U -> Q
    expect(now).toEqual(was.map((r) => r.replaceAll('U', 'Q')))
    expect(project.design.bricks.slice(0, 5).map((b) => b.id)).toEqual(before.design.bricks.map((b: { id: string }) => b.id))
    expect(project.design.copies).toEqual(before.design.copies)
    // old Hero workspace is untouched, platformer_touchingtile and all
    expect(project.workspaces.brick_hero).toEqual(before.workspaces.brick_hero)
    expect(JSON.stringify(project.workspaces.brick_hero)).toContain('platformer_touchingtile')
    expect(project.design.bricks.find((b) => b.id === 'brick_hero')!.program).toEqual(before.design.bricks.find((b: { id: string }) => b.id === 'brick_hero').program)
  })

  it('converted bricks come back from JSON as real bricks (masks decoded) and the design validates', () => {
    const upgraded = upgradeLegacySaveText(FIXTURE)
    const result = parse(upgraded)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ground = result.save.design.bricks.find((b) => b.grid?.char === 'G')!
    const fake = fakeGridTemplate('ground').brick
    expect(ground.costumes[0].mask?.data).toBeInstanceOf(Uint8Array)
    expect([...ground.costumes[0].mask!.data]).toEqual([...fake.costumes[0].mask!.data])
    expect(validateDesign(result.save.design).filter((p) => !/platformer|touchingtile/i.test(p.message))).toEqual([])
  })

  it('a second save and load changes nothing (idempotent) and the converted text is left alone', () => {
    storage.setItem(CODE_LAB_STORAGE_KEY, FIXTURE)
    const first = loadProject(storage)
    expect(saveProject(first, storage)).toBe(true)
    const second = loadProject(storage)
    expect(second.design.bricks.map((b) => b.id)).toEqual(first.design.bricks.map((b) => b.id))
    expect(second.design.tiles).toEqual(first.design.tiles)
    const saved = storage.getItem(CODE_LAB_STORAGE_KEY)!
    expect(upgradeLegacySaveText(saved)).toBe(saved)
  })

  it('lava is converted too, and a new brick id never collides with an existing one', () => {
    const save = JSON.parse(FIXTURE)
    save.design.tiles.data[0] = 'L' + save.design.tiles.data[0].slice(1)
    save.design.bricks.push({ ...save.design.bricks[2], id: 'brick_lava', name: 'Lava lamp', program: { scripts: [], procedures: [], variables: [], lists: [] } })
    save.workspaces.brick_lava = {}
    const project = loadProject((storage.setItem(CODE_LAB_STORAGE_KEY, JSON.stringify(save)), storage))
    const lava = project.design.bricks.filter((b) => b.grid?.char === 'L')
    expect(lava).toHaveLength(1)
    expect(lava[0].id).toBe('brick_lava2')
    expect(new Set(project.design.bricks.map((b) => b.id)).size).toBe(project.design.bricks.length)
  })

  it('a save that already has the grid brick for a character is not given a second one', () => {
    const save = JSON.parse(upgradeLegacySaveText(FIXTURE))
    const count = save.design.bricks.length
    expect(JSON.parse(upgradeLegacySaveText(JSON.stringify(save))).design.bricks).toHaveLength(count)
  })

  it('a level with no tiles, plain text, or damaged JSON passes through untouched', () => {
    const noTiles = JSON.parse(FIXTURE)
    delete noTiles.design.tiles
    const text = JSON.stringify(noTiles)
    expect(upgradeLegacySaveText(text)).toBe(text)
    expect(upgradeLegacySaveText('not json "tiles"')).toBe('not json "tiles"')
    expect(upgradeLegacySaveText('')).toBe('')
  })
})
