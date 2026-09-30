import { beforeEach, describe, expect, it } from 'vitest'
import { WORLD_ID } from '../bricks/builtins'
import { body, program, setSpeed, when } from '../bricks/dsl'
import { flatLevel, labHarness } from '../testHarness'
import { backToOriginal, brickDef, levelToJson, makeInstanceUnique, saveAsNewBrick, setAppearance, setProgram, starterDoc, type LabDoc } from './doc'
import type { CostumeSet } from '../costumes/model'
import { loadLabDoc, saveLabDoc } from './storage'

function twoWalkers(): LabDoc {
  const doc = starterDoc()
  return { ...doc, level: levelToJson(flatLevel(60, 16, [
    { id: 1, brick: 'walker', x: 10, y: 13, dir: 1 },
    { id: 2, brick: 'walker', x: 20, y: 13, dir: 1 },
  ])), nextThing: 3 }
}

describe('separate instance designs and browser recovery', () => {
  beforeEach(() => localStorage.clear())

  it('forks one placed object without mutating its source or the other instance', () => {
    const original = twoWalkers()
    const source = JSON.stringify(brickDef(original, 'walker'))
    const result = makeInstanceUnique(original, 1)
    expect(result.id).toBeTruthy()
    expect(original.level.things.map((t) => t.brick)).toEqual(['walker', 'walker'])
    expect(result.doc.level.things.map((t) => t.brick)).toEqual([result.id, 'walker'])
    expect(JSON.stringify(brickDef(result.doc, 'walker'))).toBe(source)
    expect(brickDef(result.doc, result.id!)?.program).not.toBe(brickDef(original, 'walker')?.program)
  })

  it('runs only the fork with its new program, including after save and reload', () => {
    const unique = makeInstanceUnique(twoWalkers(), 1)
    const changed = setProgram(unique.doc, unique.id!, program('custom', when.appear(body('gravity', 0), setSpeed('me', 'right', 3))))
    expect(saveLabDoc(changed)).toBe(true)
    const reopened = loadLabDoc()!
    expect(reopened).toEqual(changed)
    const h = labHarness(reopened)
    h.step()
    expect(h.ofBrick(unique.id!)[0].vx).toBeGreaterThan(h.ofBrick('walker')[0].vx)
    expect(h.ofBrick(unique.id!)).toHaveLength(1)
    expect(h.ofBrick('walker')).toHaveLength(1)
  })

  it('keeps design edits shared across its instances when no fork is requested', () => {
    const changed = setProgram(twoWalkers(), 'walker', program('both', when.appear(body('gravity', 0), setSpeed('me', 'right', 3))))
    const h = labHarness(changed)
    h.step()
    const walkers = h.ofBrick('walker')
    expect(walkers).toHaveLength(2)
    expect(walkers[0].vx).toBe(walkers[1].vx)
    expect(walkers[0].vx).toBeGreaterThan(0)
  })

  it('rejects missing instances and does not turn World rules into a physical brick', () => {
    const doc = twoWalkers()
    expect(makeInstanceUnique(doc, 999)).toEqual({ doc, id: null })
    expect(saveAsNewBrick(doc, WORLD_ID, 'Smart')).toEqual({ doc, id: WORLD_ID })
  })

  it('does not overwrite an existing custom design when choosing a fork id', () => {
    const first = makeInstanceUnique(twoWalkers(), 1)
    const staleCounter = { ...first.doc, nextBrick: 1 }
    const second = makeInstanceUnique(staleCounter, 2)
    expect(second.id).not.toBe(first.id)
    expect(second.doc.bricks[first.id!]).toEqual(first.doc.bricks[first.id!])
  })

  it('preserves edited frames across design copies and browser save without changing physics', () => {
    const appearance: CostumeSet = { version: 1, width: 2, height: 2, fps: 6, frames: [
      { id: 'idle', name: 'Idle', pixels: 'ff0000ff'.repeat(4) },
      { id: 'wave', name: 'Wave', pixels: '0000ffff'.repeat(4) },
    ] }
    const changed = setAppearance(twoWalkers(), 'walker', appearance)
    const edited = setProgram(changed, 'walker', program('changed', when.appear(setSpeed('me', 'right', 9))))
    const reset = backToOriginal(edited, 'walker')
    expect(brickDef(reset, 'walker')?.appearance).toEqual(appearance)
    expect(brickDef(reset, 'walker')?.program).toEqual(brickDef(twoWalkers(), 'walker')?.program)
    const fork = makeInstanceUnique(changed, 1)
    const art = brickDef(fork.doc, fork.id!)!.appearance!
    expect(art).toEqual(appearance)
    expect(art).not.toBe(brickDef(changed, 'walker')!.appearance)
    const saved = saveAsNewBrick(changed, 'walker', 'Happy')
    expect(brickDef(saved.doc, saved.id)?.appearance).toEqual(appearance)
    expect(saveLabDoc(fork.doc)).toBe(true)
    const recovered = loadLabDoc()!
    expect(brickDef(recovered, fork.id!)?.appearance).toEqual(appearance)
    const h = labHarness(recovered)
    expect(h.ofBrick(fork.id!)[0].w).toBe(h.ofBrick('walker')[0].w)
    expect(h.ofBrick(fork.id!)[0].h).toBe(h.ofBrick('walker')[0].h)
  })

  it('rejects malformed art and preserves an older document with no costume data', () => {
    const doc = twoWalkers()
    expect(setAppearance(doc, 'walker', { version: 1, width: -2, height: 2, fps: 6, frames: [] })).toBe(doc)
    expect(saveLabDoc(doc)).toBe(true)
    expect(loadLabDoc()).toEqual(doc)
  })
})
