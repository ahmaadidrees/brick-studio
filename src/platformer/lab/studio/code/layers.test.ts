import { describe, expect, it } from 'vitest'
import { back, breadcrumb, currentProccode, currentSection, drillInto, goToDepth, isTop, labelData, openSection, proccodeWords, pruneMissing, readLabel, TOP_VIEW } from './layers'

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

  it('opens a section from the top, and Back returns to the top', () => {
    const inside = openSection('how-i-move')
    expect(isTop(inside)).toBe(false)
    expect(currentSection(inside)).toBe('how-i-move')
    expect(currentProccode(inside)).toBeNull()
    expect(back(inside)).toEqual(TOP_VIEW)
    expect(currentSection(TOP_VIEW)).toBeNull()
  })

  it('drilling from inside a section keeps it as the base: Back goes to the section, then the top', () => {
    const drilled = drillInto(openSection('how-i-move'), 'move and collide')
    expect(currentProccode(drilled)).toBe('move and collide')
    expect(currentSection(drilled)).toBeNull()
    expect(back(drilled)).toEqual(openSection('how-i-move'))
    expect(back(back(drilled))).toEqual(TOP_VIEW)
  })

  it('writes the breadcrumb as "Hero\'s scripts › How I move", and its jumps count the section', () => {
    const title = (id: string) => (id === 'how-i-move' ? 'How I move' : id)
    const drilled = drillInto(openSection('how-i-move'), 'move and collide')
    expect(breadcrumb(openSection('how-i-move'), 'Hero', title)).toEqual(["Hero's scripts", 'How I move'])
    expect(breadcrumb(drilled, 'Hero', title)).toEqual(["Hero's scripts", 'How I move', 'move and collide'])
    expect(goToDepth(drilled, 0)).toEqual(TOP_VIEW)
    expect(goToDepth(drilled, 1)).toEqual(openSection('how-i-move'))
    expect(goToDepth(drilled, 2)).toBe(drilled)
  })

  it('deleting a definition inside a section keeps the section; a section the brick lacks drops to the top', () => {
    const drilled = drillInto(openSection('how-i-move'), 'move and collide')
    expect(pruneMissing(drilled, () => false)).toEqual(openSection('how-i-move'))
    expect(pruneMissing(openSection('gone'), () => true, (id) => id !== 'gone')).toEqual(TOP_VIEW)
    expect(pruneMissing(drilled, () => true, (id) => id !== 'how-i-move')).toEqual({ stack: ['move and collide'] })
  })
})
