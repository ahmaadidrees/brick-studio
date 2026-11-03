import { describe, expect, it } from 'vitest'
import { ALL_SCRIPTS, back, breadcrumb, currentProccode, currentScript, currentSection, drillInto, goToDepth, isScriptList, isTop, labelData, openScript, openSection, plainLabel, proccodeWords, pruneMissing, readLabel, splitLabel, TOP_VIEW } from './layers'
import { createCarWorkspace, createRacerWorkspace } from '../race/carBrick'

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

  it('a section opens on its list; a script, then drills keep both, and Back unwinds one step at a time', () => {
    const list = openSection('how-i-move')
    expect(isScriptList(list)).toBe(true)
    const walk = openScript('how-i-move', 'walk-id')
    expect(isScriptList(walk)).toBe(false)
    expect(currentScript(walk)).toBe('walk-id')
    expect(currentScript(openScript('how-i-move', ALL_SCRIPTS))).toBeNull()
    const drilled = drillInto(walk, 'move and collide')
    expect(drilled).toEqual({ stack: ['move and collide'], section: 'how-i-move', script: 'walk-id' })
    expect(back(drilled)).toEqual(walk)
    expect(back(walk)).toEqual(list)
    expect(back(list)).toEqual(TOP_VIEW)
  })

  it('the trail names the script, and its jumps count the list and the script', () => {
    const title = (id: string) => (id === 'how-i-move' ? 'How I move' : id)
    const drilled = drillInto(openScript('how-i-move', 'walk-id'), 'move and collide')
    expect(breadcrumb(drilled, 'Hero', title, () => 'Walk')).toEqual(["Hero's scripts", 'How I move', 'Walk', 'move and collide'])
    expect(breadcrumb(openScript('how-i-move', ALL_SCRIPTS), 'Hero', title)).toEqual(["Hero's scripts", 'How I move', 'All of them'])
    expect(goToDepth(drilled, 0)).toEqual(TOP_VIEW)
    expect(goToDepth(drilled, 1)).toEqual(openSection('how-i-move'))
    expect(goToDepth(drilled, 2)).toEqual(openScript('how-i-move', 'walk-id'))
    expect(goToDepth(drilled, 3)).toBe(drilled)
  })

  it('a script that is gone goes back to the list', () => {
    expect(pruneMissing(openScript('how-i-move', 'gone'), () => true, () => true, () => false)).toEqual(openSection('how-i-move'))
    expect(pruneMissing(openScript('how-i-move', ALL_SCRIPTS), () => true, () => true, () => false)).toEqual(openScript('how-i-move', ALL_SCRIPTS))
  })

  it('draws labels in plain words, and splits a name from what it does', () => {
    expect(plainLabel('Coyote time: I can still jump for a moment after running off a ledge')).toBe('Late jump: I can still jump for a moment after running off a ledge')
    expect(plainLabel('Run meter: fills while I run flat out on the ground; full means p speed')).toBe('Run meter: fills while I run flat out on the ground; full means full run speed')
    expect(plainLabel('Gravity: pull me down every tick')).toBe('Gravity: pull me down over and over')
    expect(plainLabel('Forget an old jump press, one tick at a time')).toBe('Forget an old jump press, a moment at a time')
    expect(splitLabel('Jump buffer: pressing jump just before I land still counts')).toEqual({ name: 'Early jump', detail: 'pressing jump just before I land still counts' })
    expect(splitLabel('Read the arrow keys, x and space')).toEqual({ name: 'Read the arrow keys, x and space', detail: '' })
  })

  it('draws the Car\'s engine words plainly too, and leaves no "tick" in any Car or racer label', () => {
    expect(plainLabel('Grip and drift: my tyres stop only some of a slide each tick, and on ice hardly any'))
      .toBe('Grip and drift: my tyres stop only some of a slide each moment, and on ice hardly any')
    expect(splitLabel('Start each tick with the normal numbers: road speed, and on rails (no sliding)'))
      .toEqual({ name: 'Start each moment with the normal numbers', detail: 'road speed, and on rails (no sliding)' })
    // Only whole words: "ticket" and a kid's "Tick tock" stay as they are.
    expect(plainLabel('My ticket each ticket')).toBe('My ticket each ticket')
    const tops = (ws: { blocks?: unknown }) => (ws.blocks as { blocks: Array<{ data?: string }> }).blocks
    for (const ws of [createCarWorkspace(), createRacerWorkspace()]) {
      for (const b of tops(ws)) expect(plainLabel(readLabel(b.data)), readLabel(b.data)).not.toMatch(/\bticks?\b/i)
    }
  })
})
