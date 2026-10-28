import { describe, expect, it } from 'vitest'
import { back, breadcrumb, currentProccode, drillInto, goToDepth, isTop, labelData, proccodeWords, pruneMissing, readLabel, TOP_VIEW } from './layers'

describe('layered code view: the drill-in and back state machine', () => {
  it('starts at the top, with no definition on screen', () => {
    expect(isTop(TOP_VIEW)).toBe(true)
    expect(currentProccode(TOP_VIEW)).toBeNull()
  })

  it('drilling into a call shows that definition, and Back returns to the top', () => {
    const inside = drillInto(TOP_VIEW, 'jump')
    expect(currentProccode(inside)).toBe('jump')
    expect(isTop(inside)).toBe(false)
    expect(isTop(back(inside))).toBe(true)
  })

  it('Back at the top stays at the top', () => {
    expect(back(TOP_VIEW)).toBe(TOP_VIEW)
  })

  it('drilling from inside a definition stacks, and Back pops one at a time', () => {
    const a = drillInto(TOP_VIEW, 'walk at %s')
    const b = drillInto(a, 'turn around')
    expect(b.stack).toEqual(['walk at %s', 'turn around'])
    expect(back(b)).toEqual(a)
    expect(back(back(b))).toEqual(TOP_VIEW)
  })

  it('drilling into the definition already on screen does nothing', () => {
    const a = drillInto(TOP_VIEW, 'jump')
    expect(drillInto(a, 'jump')).toBe(a)
  })

  it('a block that calls back into an earlier one returns to it instead of growing the path', () => {
    const path = drillInto(drillInto(TOP_VIEW, 'a'), 'b')
    expect(drillInto(path, 'a').stack).toEqual(['a'])
  })

  it('breadcrumb jumps: depth 0 is the top, depth n keeps the first n drills', () => {
    const path = drillInto(drillInto(TOP_VIEW, 'a'), 'b')
    expect(goToDepth(path, 0)).toEqual(TOP_VIEW)
    expect(goToDepth(path, 1).stack).toEqual(['a'])
    expect(goToDepth(path, 2)).toBe(path)
    expect(goToDepth(path, 9)).toBe(path)
  })

  it('deleting a definition while drilled in drops the view back out of it', () => {
    const path = drillInto(drillInto(TOP_VIEW, 'a'), 'b')
    expect(pruneMissing(path, (p) => p !== 'b').stack).toEqual(['a'])
    expect(pruneMissing(path, (p) => p !== 'a')).toEqual(TOP_VIEW)
    expect(pruneMissing(path, () => true)).toBe(path)
  })

  it('writes the breadcrumb as "Hero\'s scripts › jump"', () => {
    expect(breadcrumb(drillInto(TOP_VIEW, 'jump'), 'Hero')).toEqual(["Hero's scripts", 'jump'])
    expect(breadcrumb(TOP_VIEW, 'Walker')).toEqual(["Walker's scripts"])
    expect(proccodeWords('walk at %s speed %b')).toBe('walk at speed')
  })

  it('reads and writes the label string', () => {
    expect(labelData('  Walk back and forth ')).toBe('label:Walk back and forth')
    expect(labelData('   ')).toBeUndefined()
    expect(readLabel('label:Walk back and forth')).toBe('Walk back and forth')
    expect(readLabel('something else')).toBe('')
    expect(readLabel(null)).toBe('')
  })
})
