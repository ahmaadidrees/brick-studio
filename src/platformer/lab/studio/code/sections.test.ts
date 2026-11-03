import { describe, expect, it } from 'vitest'
import { createHeroWorkspace, HERO_BRICK_ID, heroMovementLabels } from '../hero/heroBrick'
import { CAR_BRICK_ID, RACER_BRICK_ID, carDrivingLabels, createCarWorkspace, createRacerWorkspace, racerDrivingLabels } from '../race/carBrick'
import { readLabel, splitLabel } from './layers'
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

describe('brick sections: the Car\'s "How I drive"', () => {
  const carTops = (): Top[] => (createCarWorkspace().blocks as unknown as { blocks: Top[] }).blocks
  const racerTops = (): Top[] => (createRacerWorkspace().blocks as unknown as { blocks: Top[] }).blocks
  const car = sectionsForBrick({ id: CAR_BRICK_ID })
  const ofCar = (b: Top) => sectionOfScript(b.type, readLabel(b.data), car)

  it('folds every "over and over" script and leaves the start, the countdown, the last lap and the My Block on top', () => {
    expect(car.map((s) => s.title)).toEqual(['How I drive'])
    const tops = carTops()
    const driving = tops.filter((b) => b.type === 'platformer_everytick')
    expect(driving.length).toBeGreaterThanOrEqual(10)
    for (const b of driving) expect(ofCar(b), readLabel(b.data)).toBe('how-i-drive')
    const rest = tops.filter((b) => !driving.includes(b))
    expect(rest.map((b) => readLabel(b.data).split(':')[0])).toEqual([
      'When the race starts', 'When the countdown says go', 'Drive and bounce off barriers', 'When I finish my last lap',
    ])
    for (const b of rest) expect(ofCar(b)).toBeNull()
  })

  it('counts exactly the Car\'s labels, read from its own workspace', () => {
    const labels = carDrivingLabels()
    expect(sectionEntries(car, carTops().map(ofCar))).toEqual([{ id: 'how-i-drive', title: 'How I drive', count: labels.size }])
    expect(labels.size).toBe(carTops().filter((b) => b.type === 'platformer_everytick').length)
    expect(labels.has('Read the arrow keys: left and right steer, up is gas, down is brake')).toBe(true)
    expect(labels.has('When I finish my last lap: stop, and put my name on the results')).toBe(false)
  })

  it('gives every driving script a short name for the list and the trail', () => {
    for (const label of carDrivingLabels()) {
      const { name, detail } = splitLabel(label)
      expect(name.length, label).toBeLessThanOrEqual(48)
      expect(detail.length, label).toBeGreaterThan(0)
      expect(name, label).not.toMatch(/\btick\b/)
    }
    expect(splitLabel('Split my speed: forward (the way I point) and sideways (sliding)').name).toBe('Split my speed')
  })

  it('keeps a kid\'s script on the top view', () => {
    expect(sectionOfScript('platformer_everytick', '', car)).toBeNull()
    expect(sectionOfScript('platformer_everytick', 'My nitro button', car)).toBeNull()
    expect(sectionOfScript('race_whenlap', 'Grip: sideways sliding fades by my grip', car)).toBeNull()
    expect(sectionOfScript('platformer_everytick', 'Grip: sideways sliding fades by my grip', car)).toBe('how-i-drive')
    // The Hero's labels are not the Car's.
    expect(sectionOfScript('platformer_everytick', 'Gravity: pull me down every tick', car)).toBeNull()
  })

  it('folds a remixed Car ("My Car", and a copy of it under its own id) like the Car', () => {
    expect(sectionsForBrick({ id: CAR_BRICK_ID, remixOf: CAR_BRICK_ID })).toBe(car)
    expect(sectionsForBrick({ id: 'brick7', remixOf: CAR_BRICK_ID })).toBe(car)
  })

  it('folds a Computer racer the same way, with its own "Drive along the track"', () => {
    const racer = sectionsForBrick({ id: RACER_BRICK_ID })
    expect(racer.map((s) => s.title)).toEqual(['How I drive'])
    const ofRacer = (b: Top) => sectionOfScript(b.type, readLabel(b.data), racer)
    const folded = racerTops().filter((b) => ofRacer(b) === 'how-i-drive')
    expect(folded.length).toBe(racerDrivingLabels().size)
    expect(folded.length).toBe(racerTops().filter((b) => b.type === 'platformer_everytick').length)
    expect(racerDrivingLabels().has('Drive along the track')).toBe(true)
    expect(racerDrivingLabels().has('Read the arrow keys: left and right steer, up is gas, down is brake')).toBe(false)
  })
})
