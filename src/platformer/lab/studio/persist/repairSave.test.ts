import { beforeEach, describe, expect, it } from 'vitest'
import type { ClassroomClientSurface } from '../../../../classroom/client'
import type { ClassroomWorld } from '../../../../classroom/contracts'
import { DESIGN_LIMITS } from '../../core/project'
import { parse } from '../../core/save'
import { oldCostume } from '../assets/oldPictures.testkit'
import { decodePngSync } from '../assets/pixelOps'
import { blankImage, costumeFromImage, type PixelImage } from '../pixels'
import { createStarterProject } from '../starter'
import { clearStorageNotice, getStorageNotice, isSaveHeld, loadProject, saveProject } from '../storage'
import { loadHackableWorld } from './hackableCloud'
import { LEGACY_KEY } from './hackableProjects'
import { projectFromDocument } from './hackableSave'
import { exportProjectJson, importProjectJson } from './projectIo'
import { parseSaveText, repairSaveText } from './repairSave'

function sky(width = 480, height = 360): PixelImage {
  const img = blankImage(width, height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) img.data.set(y > 250 ? [70, 160, 80, 255] : [120, 190, 250, 255], (y * width + x) * 4)
  return img
}

function noise(width: number, height: number): PixelImage {
  const img = blankImage(width, height)
  let s = 5
  for (let i = 0; i < img.data.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    img.data[i] = i % 4 === 3 ? 255 : s >>> 24
  }
  return img
}

/** The text of a save holding `stage` costumes (and, optionally, a Hero costume) written by the old editor. */
function oldSave(stage: unknown[], heroCostumes?: unknown[]): string {
  const project = createStarterProject()
  project.design.name = 'Lava jump'
  const env = JSON.parse(exportProjectJson(project))
  env.design.stage.costumes = stage
  if (heroCostumes) env.design.bricks[0].costumes = heroCostumes
  return JSON.stringify(env, null, 2)
}

const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (v: number, i: number) => v === b[i])

beforeEach(() => {
  localStorage.clear()
  clearStorageNotice()
})

describe('saves the old blank Stage backdrop broke open again', () => {
  const broken = () => oldSave([oldCostume('Sky', blankImage(480, 360))])

  it('the game itself refuses them as they are', () => {
    expect(broken().length).toBeGreaterThan(900_000)
    expect(parse(broken()).ok).toBe(false)
  })

  it('on this computer: the project opens with the day sky, nothing held back, and saves again', () => {
    localStorage.setItem(LEGACY_KEY, broken())
    const project = loadProject(undefined, LEGACY_KEY)
    expect(project.design.name).toBe('Lava jump')
    expect(project.design.stage.costumes).toEqual([])
    expect(getStorageNotice()).toBeNull()
    expect(isSaveHeld()).toBe(false)
    expect(saveProject(project, undefined, LEGACY_KEY)).toBe(true)
    // About the size of a fresh starter project again (the 922,000-character backdrop is gone).
    expect(localStorage.getItem(LEGACY_KEY)!.length).toBeLessThan(exportProjectJson(createStarterProject()).length + 50_000)
  })

  it('in the account: the project opens instead of “could not be opened”', async () => {
    const save = JSON.parse(broken())
    expect(projectFromDocument({ format: 'brickgineers-hackable', version: 1, save })?.design.name).toBe('Lava jump')
    const world = { id: 'w1', title: 'Lava jump', revision: 4, format: 'hackable', canEdit: true, document: { format: 'brickgineers-hackable', version: 1, save } } as unknown as ClassroomWorld
    const client = { getWorld: async () => world } as unknown as ClassroomClientSurface
    const opened = await loadHackableWorld('w1', client)
    expect(opened.project.design.stage.costumes).toEqual([])
  })

  it('from a file: Open File reads it', () => {
    const result = importProjectJson(broken())
    expect(result.ok).toBe(true)
  })
})

describe('other pictures the old editor saved', () => {
  it('a painted backdrop that was too big is kept, compressed, pixel for pixel', () => {
    const painted = sky()
    const result = parseSaveText(oldSave([oldCostume('Sky', painted)]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.repaired).toBe(true)
    const [backdrop] = result.save.design.stage.costumes
    expect(backdrop.asset!.length).toBeLessThanOrEqual(DESIGN_LIMITS.maxAssetChars)
    expect(sameBytes(decodePngSync(backdrop.asset!)!.data, painted.data)).toBe(true)
  })

  it('a backdrop too busy to compress is shrunk until it fits (the stage stretches it over the level)', () => {
    const result = parseSaveText(oldSave([oldCostume('Static', noise(480, 360))]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [backdrop] = result.save.design.stage.costumes
    expect(backdrop.name).toBe('Static')
    expect(backdrop.width).toBeLessThan(480)
    expect(backdrop.asset!.length).toBeLessThanOrEqual(DESIGN_LIMITS.maxAssetChars)
  })

  it('a blank costume’s empty opaque box no longer stops the project from opening', () => {
    const hero = createStarterProject().design.bricks[0]
    const heroCostume = JSON.parse(exportProjectJson(createStarterProject())).design.bricks[0].costumes[0]
    const text = oldSave([], [heroCostume, oldCostume('costume2', blankImage(32, 32))])
    expect(parse(text).ok).toBe(false)
    const result = parseSaveText(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const costumes = result.save.design.bricks.find((b) => b.id === hero.id)!.costumes
    expect(costumes.map((c) => c.name)).toEqual([hero.costumes[0].name, 'costume2'])
    expect(costumes[1].opaque).toBeUndefined()
  })

  it('a project in memory holding one still saves (put right on the way out) instead of refusing every change', () => {
    const project = createStarterProject()
    const bad = { ...costumeFromImage('Sky', blankImage(4, 4)), asset: oldCostume('Sky', sky()).asset, width: 480, height: 360 }
    bad.mask = costumeFromImage('Sky', sky()).mask
    project.design.stage = { ...project.design.stage, costumes: [bad] }
    expect(parse(exportProjectJson(project)).ok).toBe(false)
    expect(saveProject(project, undefined, 'k')).toBe(true)
    expect(parse(localStorage.getItem('k')!).ok).toBe(true)
  })

  it('leaves healthy saves, newer versions and non-saves alone', () => {
    expect(repairSaveText(exportProjectJson(createStarterProject()))).toBeNull()
    expect(repairSaveText('{nope')).toBeNull()
    const newer = JSON.parse(oldSave([oldCostume('Sky', blankImage(480, 360))]))
    newer.schemaVersion = 99
    const result = parseSaveText(JSON.stringify(newer))
    expect(result.ok).toBe(false)
  })
})
