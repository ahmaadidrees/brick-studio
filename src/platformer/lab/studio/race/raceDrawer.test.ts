/**
 * Hackable Racing's Bricks drawer: Track / Racers / Start / My bricks, plain hints, and the 'B' clash (the Boost pad and
 * the Platformer's Brick are both 'B') never mislabels or misselects anything.
 */
import { describe, expect, it } from 'vitest'
import { KIT_SCREENS } from '../kitScreens'
import { activeEntryId, brickEntryId, drawerEntries, gridEntryId, standardKeyOf } from '../builder/catalog'
import { createStarterProject } from '../starter'
import { compileBrickEdit } from '../remix'
import type { WorkspaceBlockJson, WorkspaceJson } from '../../core/editor/compile'
import { createRaceStarterProject } from './raceProject'
import { CAR_BRICK_ID } from './carBrick'
import { raceDrawerActive, raceDrawerEntries, raceDrawerHint } from './raceDrawer'

const race = () => createRaceStarterProject().design
const BANNED = /\b(tick|ticks|sprite|kit)\b/i

describe('the race drawer', () => {
  it('groups Track, Racers, Start and My bricks', () => {
    expect(KIT_SCREENS.race.drawer.categories.map((c) => c.label)).toEqual(['Track', 'Racers', 'Start', 'My bricks'])
    const entries = raceDrawerEntries(race().bricks)
    expect(entries.map((e) => [e.name, e.category])).toEqual([
      ['Road', 'track'],
      ['Dirt', 'track'],
      ['Ice', 'track'],
      ['Barrier', 'track'],
      ['Boost pad', 'track'],
      ['Finish line', 'track'],
      ['Car', 'racers'],
      ['Computer racer', 'racers'],
      ['Starter', 'start'],
    ])
    // Every entry arms the level's own brick, by id.
    for (const e of entries) expect(e.id).toBe(brickEntryId(e.brick!.id))
  })

  it('gives every built-in brick a short, plain hint', () => {
    for (const e of raceDrawerEntries(race().bricks)) {
      expect(e.hint, e.name).toBeTruthy()
      expect(e.hint!.length, e.name).toBeLessThanOrEqual(60)
      expect(e.hint, e.name).not.toMatch(BANNED)
    }
    const ice = race().bricks.find((b) => b.id === 'brick_ice')!
    expect(KIT_SCREENS.race.drawer.hint(ice)).toBe('Slippery: cars slide on it')
  })

  it('puts a remixed Car and a brick of the kid’s own under My bricks', () => {
    const project = createRaceStarterProject()
    const workspace = structuredClone(project.workspaces[CAR_BRICK_ID]) as WorkspaceJson
    ;((Array.isArray(workspace.blocks) ? workspace.blocks : workspace.blocks!.blocks!) as WorkspaceBlockJson[]).push({ id: 'kid_block', type: 'looks_show' })
    const remixed = compileBrickEdit(project, CAR_BRICK_ID, workspace).project.design
    const own = { ...remixed.bricks[0], id: 'brick_7', name: 'Puddle', grid: { char: 'P' } }
    const entries = raceDrawerEntries([...remixed.bricks, own])
    expect(entries.find((e) => e.brick?.id === CAR_BRICK_ID)).toMatchObject({ name: 'My Car', category: 'mine' })
    expect(entries.find((e) => e.brick?.id === 'brick_7')).toMatchObject({ name: 'Puddle', category: 'mine', hint: undefined })
    expect(entries.at(-1)!.name).toBe('Puddle')
  })
})

describe("the 'B' clash: the Boost pad and the Platformer's Brick", () => {
  it('the race drawer shows, hints and arms the Boost pad as itself', () => {
    const design = race()
    const boost = design.bricks.find((b) => b.id === 'brick_boost')!
    expect(boost.grid?.char).toBe('B')
    const entry = KIT_SCREENS.race.drawer.entries(design.bricks).find((e) => e.brick?.id === 'brick_boost')!
    expect(entry).toMatchObject({ id: brickEntryId('brick_boost'), name: 'Boost pad', category: 'track', hint: 'Shoots cars forward' })
    expect(entry.key).toBeUndefined()
    expect(raceDrawerHint(boost)).toBe('Shoots cars forward')
    expect(KIT_SCREENS.race.drawer.active('brick_boost', design.bricks)).toBe(brickEntryId('brick_boost'))
    expect(raceDrawerActive('brick_boost', design.bricks)).not.toBe(gridEntryId('brick'))
    // No race entry is a Platformer grid entry (picking one would add the Platformer's Brick).
    expect(KIT_SCREENS.race.drawer.entries(design.bricks).some((e) => e.id.startsWith('grid:'))).toBe(false)
  })

  it("the Platformer's catalog never takes the Boost pad for its Brick", () => {
    const boost = race().bricks.find((b) => b.id === 'brick_boost')!
    expect(standardKeyOf(boost)).toBeUndefined()
    expect(activeEntryId('brick_boost', [boost])).toBe(brickEntryId('brick_boost'))
    expect(KIT_SCREENS.platformer.drawer.hint(boost)).toBeUndefined()
    const entries = drawerEntries([boost])
    expect(entries.find((e) => e.id === gridEntryId('brick'))).toMatchObject({ name: 'Brick', brick: undefined })
  })

  it("the Platformer's drawer is unchanged: its Brick is still the Brick", () => {
    const design = createStarterProject().design
    const brick = design.bricks.find((b) => b.id === 'brick_brick')!
    expect(standardKeyOf(brick)).toBe('brick')
    expect(activeEntryId('brick_brick', design.bricks)).toBe(gridEntryId('brick'))
    const entry = drawerEntries(design.bricks).find((e) => e.id === gridEntryId('brick'))!
    expect(entry).toMatchObject({ name: 'Brick', brick: { id: 'brick_brick' }, category: 'blocks' })
    expect(KIT_SCREENS.platformer.drawer.hint(brick)).toBe('Solid. Hops when the Hero bumps it from below')
    // A remixed Brick, and an old save whose Brick has no catalog id, still stand for it.
    expect(standardKeyOf({ ...brick, remixOf: 'brick_brick' })).toBe('brick')
    expect(standardKeyOf({ ...brick, id: 'grid_B' })).toBe('brick')
  })
})
