import { describe, expect, it } from 'vitest'
import { createHeroWorkspace, HERO_BRICK_ID, heroMovementLabels } from '../hero/heroBrick'
import { readLabel } from './layers'
import { scriptCount, sectionEntries, sectionOfScript, sectionsForBrick, sectionTitle } from './sections'

type Top = { type: string; data?: string }
const heroTops = (): Top[] => (createHeroWorkspace().blocks as unknown as { blocks: Top[] }).blocks
const hero = sectionsForBrick({ id: HERO_BRICK_ID })
const of = (b: Top) => sectionOfScript(b.type, readLabel(b.data), hero)

describe('brick sections: which scripts fold into "How I move"', () => {
  it('folds every Hero "every tick" and "when I bump" script, and nothing else', () => {
    const tops = heroTops()
    const movement = tops.filter((b) => b.type === 'platformer_everytick' || b.type === 'platformer_whenbump')
    expect(movement.length).toBeGreaterThan(20)
    for (const b of movement) expect(of(b), readLabel(b.data)).toBe('how-i-move')
    const rest = tops.filter((b) => !movement.includes(b))
    // The level-start script, the four receivers and the "move and collide" definition stay out of the section.
    expect(rest.map((b) => b.type).sort()).toEqual([
      'event_whenbroadcastreceived', 'event_whenbroadcastreceived', 'event_whenbroadcastreceived', 'event_whenbroadcastreceived',
      'event_whenflagclicked', 'procedures_definition',
    ])
    for (const b of rest) expect(of(b)).toBeNull()
  })

  it('reads the labels from the Hero workspace itself, so they cannot drift', () => {
    const labels = heroMovementLabels()
    expect(labels.size).toBe(heroTops().filter((b) => of(b) === 'how-i-move').length)
    expect(labels.has('Gravity: pull me down every tick')).toBe(true)
    expect(labels.has('When I get hurt: go back to where I started')).toBe(false)
  })

  it('keeps a script a kid writes on the top view: no label, a label of their own, or a Hero label on another hat', () => {
    expect(sectionOfScript('platformer_everytick', '', hero)).toBeNull()
    expect(sectionOfScript('platformer_everytick', 'My double jump', hero)).toBeNull()
    expect(sectionOfScript('platformer_whenbump', 'Bounce off walls', hero)).toBeNull()
    expect(sectionOfScript('event_whenflagclicked', 'Gravity: pull me down every tick', hero)).toBeNull()
    expect(sectionOfScript('platformer_whenbump', 'Gravity: pull me down every tick', hero)).toBe('how-i-move')
  })

  it('shows an old save whose labels differ just as before', () => {
    expect(sectionOfScript('platformer_everytick', 'Gravity: pull me down', hero)).toBeNull()
    expect(sectionOfScript('platformer_everytick', 'gravity: pull me down every tick', hero)).toBeNull()
  })

  it('belongs to the Hero and its remixes only', () => {
    expect(hero.map((s) => s.title)).toEqual(['How I move'])
    expect(sectionsForBrick({ id: 'brick_hero_2', remixOf: HERO_BRICK_ID })).toBe(hero)
    expect(sectionsForBrick({ id: 'brick_walker' })).toEqual([])
    expect(sectionsForBrick({ id: 'brick_custom', remixOf: 'brick_walker' })).toEqual([])
    expect(sectionsForBrick(null)).toEqual([])
  })

  it('counts each section for its entry, and leaves out an empty one', () => {
    expect(sectionEntries(hero, ['how-i-move', null, 'how-i-move', null])).toEqual([{ id: 'how-i-move', title: 'How I move', count: 2 }])
    expect(sectionEntries(hero, [null, null])).toEqual([])
    expect(sectionEntries(hero, heroTops().map(of))[0].count).toBe(heroMovementLabels().size)
    expect(sectionTitle(hero, 'how-i-move')).toBe('How I move')
    expect(scriptCount(1)).toBe('1 script')
    expect(scriptCount(23)).toBe('23 scripts')
  })
})
