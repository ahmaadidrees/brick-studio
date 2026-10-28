import { describe, expect, it } from 'vitest'
import { compileProgram } from '../program/compile'
import { programmableCarProgram, reactiveCharacterScripts } from './authoring'
import { BUILTIN_BRICKS, type BrickDef } from './builtins'
import { program, type BlockJson, type WorkspaceJson } from './dsl'
import { allBricks, applyRecipe, brickDef, starterDoc, type LabDoc } from '../level/doc'
import { T } from '@brick-studio/platformer-core/engine/tiles'
import { flatLevel, labHarness, px } from '../testHarness'

function allBlocks(workspace: WorkspaceJson): BlockJson[] {
  const found: BlockJson[] = []
  const visit = (block: BlockJson) => {
    found.push(block)
    for (const input of Object.values(block.inputs ?? {})) if (input.block) visit(input.block)
    if (block.next?.block) visit(block.next.block)
  }
  workspace.blocks.blocks.forEach(visit)
  return found
}

const refs = [...BUILTIN_BRICKS.map(({ id, name }) => ({ id, name })), { id: 'programmable-car', name: 'Programmable car' }]

function carDoc(): LabDoc {
  const doc = starterDoc()
  doc.bricks['programmable-car'] = {
    id: 'programmable-car', name: 'Programmable car', costume: 'car', basedOn: null, origin: 'mine',
    program: programmableCarProgram(), blurb: 'A car built with regular blocks.',
  } satisfies BrickDef
  return doc
}

describe('student authoring journeys', () => {
  it('builds the ride-on car from general blocks without ride shortcuts', () => {
    const workspace = programmableCarProgram()
    const blocks = allBlocks(workspace)
    expect(compileProgram(workspace, { bricks: refs }).ok).toBe(true)
    expect(blocks.map((block) => block.type)).toContain('lab_set_controls')
    expect(blocks.map((block) => block.type)).toContain('lab_set_physics')
    expect(blocks.map((block) => block.type)).toContain('lab_move_xy')
    expect(blocks.map((block) => block.type)).toContain('lab_variable')
    expect(blocks.map((block) => block.type)).not.toContain('lab_let_ride')
    expect(blocks.map((block) => block.type)).not.toContain('lab_drop_rider')
  })

  it('boards by touching, drives into collision, then exits with the player controls restored', () => {
    const doc = carDoc()
    const level = flatLevel(60, 16, [{ id: 9, brick: 'programmable-car', x: 5, y: 13, dir: 1 }])
    level.tiles[13 * level.width + 9] = T.GROUND
    const h = labHarness(doc, level)
    h.run(5)
    const car = h.ofBrick('programmable-car')[0]
    // Start touching the car, as if the player walked up to it.
    h.player.x = car.x + 1
    h.player.y = car.y
    h.step() // Touching is measured during the simulation frame.
    h.step({}, ['up'])
    expect(h.player.controlsEnabled).toBe(false)
    expect(h.player.physicsEnabled).toBe(false)
    expect(h.player.visible).toBe(true)
    expect(car.rider).toBe(0)
    expect(h.player.riding).toBe(0)

    const start = px(car.x)
    h.run(35, { right: true })
    expect(px(car.x)).toBeGreaterThan(start)
    // A solid tile blocks the car; position blocks only carry the visible player.
    expect(px(car.x + car.w)).toBeLessThanOrEqual(9 * 16 + 1)
    expect(Math.abs(px(h.player.x + h.player.w / 2) - px(car.x + car.w / 2))).toBeLessThan(2)

    h.step({}, ['down'])
    expect(h.player.controlsEnabled).toBe(true)
    expect(h.player.physicsEnabled).toBe(true)
    expect(h.player.visible).toBe(true)
    expect(h.player.riding).toBe(0)
    expect(car.rider).toBe(0)
  })

  it('lets only one of two touching cars claim the player', () => {
    const level = flatLevel(60, 16, [
      { id: 8, brick: 'programmable-car', x: 5, y: 13, dir: 1 },
      { id: 9, brick: 'programmable-car', x: 5, y: 13, dir: -1 },
    ])
    const h = labHarness(carDoc(), level)
    h.run(5)
    const cars = h.ofBrick('programmable-car')
    h.player.x = cars[0].x + 1
    h.player.y = cars[0].y
    h.step()
    h.step({}, ['up'])

    expect(cars.filter((car) => car.variables?.driving === 1)).toHaveLength(1)
    expect(h.player.variables?.vehicle).toBe(1)
    expect(h.player.controlsEnabled).toBe(false)
    expect(h.player.physicsEnabled).toBe(false)
  })

  it('adds costume animation and click-to-speak as ordinary editable scripts', () => {
    const workspace = program('react-character', ...reactiveCharacterScripts())
    const blocks = allBlocks(workspace)
    expect(compileProgram(workspace, { bricks: refs }).ok).toBe(true)
    expect(blocks.map((block) => block.type)).toEqual(expect.arrayContaining(['lab_play_frames', 'lab_when_clicked', 'lab_say_text', 'lab_next_frame']))
    expect(blocks.find((block) => block.type === 'lab_say_text')?.fields?.TEXT).toBe('I made this!')
  })

  it('installs both examples through the normal recipe flow and keeps existing player scripts', () => {
    const basePlayer = brickDef(starterDoc(), 'you')!.program as WorkspaceJson
    const before = allBlocks(basePlayer).length
    const character = applyRecipe(starterDoc(), 'react-character')
    expect(character.open).toBe('you')
    expect(allBlocks(brickDef(character.doc, 'you')!.program as WorkspaceJson).length).toBeGreaterThan(before)
    expect(compileProgram(brickDef(character.doc, 'you')!.program, { bricks: allBricks(character.doc).map(({ id, name }) => ({ id, name })) }).ok).toBe(true)

    const car = applyRecipe(starterDoc(), 'programmable-car')
    expect(car.open).toBe('programmable-car')
    expect(car.place).toBe('programmable-car')
    expect(compileProgram(brickDef(car.doc, 'programmable-car')!.program, { bricks: allBricks(car.doc).map(({ id, name }) => ({ id, name })) }).ok).toBe(true)
  })
})
