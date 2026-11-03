/**
 * The R1 screens contract (docs/qa/hackable-modes/R1-SCREENS.md B.5): Hackable Racing's starter is a whole project the
 * studio can open, save and run; its bricks are built-in; and the Car is the player, remixed or not.
 */
import { describe, expect, it } from 'vitest'
import type { WorkspaceBlockJson, WorkspaceJson } from '../core/editor/compile'
import { compileWorkspace } from '../core/editor/compile'
import { validateDesign } from '../core/project'
import { play } from '../core/index'
import { computeRaceLoop } from '../core/race'
import { KIT_SCREENS, hasPlayer, isPlayerBrick, playerBrickOf, screensFor } from './kitScreens'
import { createRaceStarterProject } from './race/raceProject'
import { CAR_BRICK_ID } from './race/carBrick'
import { createStarterProject } from './starter'
import { canResetBrick, catalogOriginal, compileBrickEdit } from './remix'
import { isCatalogBrick } from './builder/catalog'
import { checkedHackableDocument, projectFromText } from './persist/hackableSave'
import { exportProjectJson } from './persist/projectIo'
import { StudioStore, type StudioProject } from './store'

function remixCar(project: StudioProject): StudioProject {
  const workspace = structuredClone(project.workspaces[CAR_BRICK_ID]) as WorkspaceJson
  const roots = (Array.isArray(workspace.blocks) ? workspace.blocks : workspace.blocks!.blocks!) as WorkspaceBlockJson[]
  roots.push({ id: 'kid_block', type: 'looks_show' })
  return compileBrickEdit(project, CAR_BRICK_ID, workspace).project
}

describe('the R1 screens contract', () => {
  it('the race starter validates, saves, reopens and runs', () => {
    const project = KIT_SCREENS.race.starter()
    expect(project.design.kit).toBe('race')
    expect(validateDesign(project.design)).toEqual([])
    expect(computeRaceLoop(project.design.tiles, project.design.bricks).ok).toBe(true)
    // The save checks the account and this browser use.
    expect(checkedHackableDocument(project).ok).toBe(true)
    const back = projectFromText(exportProjectJson(project))
    expect(back?.design.kit).toBe('race')
    expect(Object.keys(back?.workspaces ?? {}).sort()).toEqual(Object.keys(project.workspaces).sort())
    const runtime = play(project.design)
    for (let i = 0; i < 60; i++) runtime.step()
    runtime.stopAll()
  })

  it('every brick in the race starter has its blocks, and they compile to the brick it has', () => {
    const { design, workspaces } = createRaceStarterProject()
    for (const brick of [design.stage, ...design.bricks]) {
      expect(workspaces[brick.id], brick.name).toBeDefined()
      const compiled = compileWorkspace(workspaces[brick.id], { variables: brick.program.variables, lists: brick.program.lists })
      expect(compiled.diagnostics, brick.name).toEqual([])
      expect(compiled.program.scripts, brick.name).toEqual(brick.program.scripts)
      expect(compiled.program.procedures, brick.name).toEqual(brick.program.procedures)
    }
  })

  it('every race brick counts as built-in, untouched, and the Platformer starter still does too', () => {
    for (const project of [createRaceStarterProject(), createStarterProject()]) {
      for (const brick of project.design.bricks) {
        expect(isCatalogBrick(brick), brick.name).toBe(true)
        expect(canResetBrick(project, brick.id), brick.name).toBe(false)
      }
    }
  })

  it('finds the Car as the race player, and the Hero as the Platformer one', () => {
    const race = createRaceStarterProject().design
    expect(screensFor(race)).toBe(KIT_SCREENS.race)
    expect(isPlayerBrick(race, CAR_BRICK_ID)).toBe(true)
    expect(isPlayerBrick(race, 'brick_racer')).toBe(false)
    expect(playerBrickOf(race)?.id).toBe(CAR_BRICK_ID)
    expect(hasPlayer(race)).toBe(true)
    expect(hasPlayer({ ...race, copies: race.copies.filter((c) => c.brickId !== CAR_BRICK_ID) })).toBe(false)

    const platformer = createStarterProject().design
    expect(screensFor(platformer)).toBe(KIT_SCREENS.platformer)
    expect(isPlayerBrick(platformer, 'brick_hero')).toBe(true)
    expect(isPlayerBrick(platformer, CAR_BRICK_ID)).toBe(false)
    expect(hasPlayer(platformer)).toBe(true)
  })

  it('a remixed Car is still the player, and still knows its original', () => {
    const remixed = remixCar(createRaceStarterProject())
    const car = remixed.design.bricks.find((b) => b.id === CAR_BRICK_ID)!
    expect(car.name).toBe('My Car')
    expect(car.remixOf).toBe(CAR_BRICK_ID)
    expect(isCatalogBrick(car)).toBe(false)
    expect(catalogOriginal(car)?.brick.name).toBe('Car')
    expect(canResetBrick(remixed, CAR_BRICK_ID)).toBe(true)
    expect(isPlayerBrick(remixed.design, CAR_BRICK_ID)).toBe(true)
    expect(hasPlayer(remixed.design)).toBe(true)

    // A copy of My Car under its own id counts too.
    const copy = { ...car, id: 'brick7' }
    const design = { ...remixed.design, bricks: [...remixed.design.bricks.filter((b) => b.id !== CAR_BRICK_ID), copy], copies: remixed.design.copies.map((c) => (c.brickId === CAR_BRICK_ID ? { ...c, brickId: 'brick7' } : c)) }
    expect(isPlayerBrick(design, 'brick7')).toBe(true)
    expect(playerBrickOf(design)?.id).toBe('brick7')
    expect(hasPlayer(design)).toBe(true)
  })

  it('Code opens on the kit player: the Car in a race, the Hero in a Platformer', () => {
    const race = new StudioStore(createRaceStarterProject())
    race.setScreen('code')
    expect(race.getState().selectedBrickId).toBe(CAR_BRICK_ID)
    race.stop()
    const platformer = new StudioStore(createStarterProject())
    platformer.setScreen('code')
    expect(platformer.getState().selectedBrickId).toBe('brick_hero')
    platformer.stop()
  })

  it('setFinishDirection turns the finish line, and leaves anything else alone', () => {
    const store = new StudioStore(createRaceStarterProject())
    const finish = () => store.brick('brick_finish')!.grid!.finish
    expect(finish()).toBe(90)
    store.setFinishDirection('brick_finish', -90)
    expect(finish()).toBe(-90)
    expect(validateDesign(store.getState().project.design)).toEqual([])
    store.setFinishDirection('brick_finish', 45 as never)
    expect(finish()).toBe(-90)
    const road = store.brick('brick_road')
    store.setFinishDirection('brick_road', 0)
    expect(store.brick('brick_road')).toBe(road)
  })

  it('the race drawer lists the level’s own bricks by id: the Boost pad is never the Platformer’s Brick', () => {
    const { design } = createRaceStarterProject()
    const drawer = KIT_SCREENS.race.drawer
    const entries = drawer.entries(design.bricks)
    const boost = entries.find((e) => e.brick?.id === 'brick_boost')!
    expect(boost).toMatchObject({ name: 'Boost pad', category: 'track' })
    expect(entries.find((e) => e.brick?.id === CAR_BRICK_ID)?.category).toBe('racers')
    expect(entries.find((e) => e.brick?.id === 'brick_starter')?.category).toBe('start')
    expect(entries.every((e) => drawer.categories.some((c) => c.id === e.category))).toBe(true)
    expect(drawer.active('brick_boost', design.bricks)).toBe(boost.id)
  })
})
