/**
 * The Car bounces by what it hits (parity bucket B), like the classic car (platformer-core car.ts bounceOf and the
 * bumper's kick): a barrier gives back 0.35 of the speed, a tire stack 0.08, a tree or a grandstand 0.25, and a bumper
 * all of it plus a kick of 2.4 px a frame (4.8 a tick). "what I hit" is the new general block it reads.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_CAR_FEEL } from '@brick-studio/platformer-core/engine/car'
import type { BrickDef, LevelDesign, Target } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { play } from '../../core/index'
import { Blocks } from '../blockBuilder'
import { costumeFromImage, imageFromRows } from '../pixels'
import { createRaceStarterProject } from './raceProject'
import { CAR_BRICK_ID } from './carBrick'
import { upgradeUntouchedBricks, workspaceFingerprint } from '../remix'
import carBefore from './__fixtures__/car-before-what-i-hit.json'
import racerBefore from './__fixtures__/racer-before-what-i-hit.json'

/** A solid grid brick called `name`, painted as a wall across the starting straight just ahead of the Car. */
function wallLevel(name: string): LevelDesign {
  const d = createRaceStarterProject().design
  const b = new Blocks('wall')
  b.flag('solid', [b.setSolid('on')])
  const wall: BrickDef = {
    id: 'brick_test_wall', name, sounds: [], grid: { char: 'Z' },
    costumes: [costumeFromImage('w', imageFromRows(Array.from({ length: 16 }, () => 'K'.repeat(16)), { K: '#111827' }), { x: 8, y: 8 })],
    program: compileWorkspace(b.workspace()).program,
  }
  const car = d.copies.find((c) => c.brickId === CAR_BRICK_ID)!
  const col = Math.floor(car.x / 16) + 14
  const tiles = { ...d.tiles!, data: d.tiles!.data.map((row) => row.slice(0, col) + 'Z' + row.slice(col + 1)) }
  // Only the Car: no Computer racers in the way.
  return { ...d, tiles, bricks: [...d.bricks, wall], copies: d.copies.filter((c) => c.brickId === CAR_BRICK_ID || !c.brickId.startsWith('brick_racer')) }
}

/** Drive flat out into the wall: the Car's x speed just before the hit, and just after its bounce. */
function bounce(name: string): { before: number; after: number } {
  const rt = play(wallLevel(name))
  const car = rt.world.targets.find((t) => t.brickId === CAR_BRICK_ID && !t.isClone) as Target
  rt.pressKey('up arrow')
  let last = 0
  for (let k = 0; k < 400; k++) {
    rt.step()
    const vx = car.body?.vx ?? 0
    if (last > 1 && vx < 0) return { before: last, after: vx }
    last = vx
  }
  throw new Error('never hit the wall')
}

describe('the Car bounces by what it hits', () => {
  // The tick before the hit the Car still speeds up a little, so the speed it hits with is a hair above `before`.
  const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(0.25)

  it('a barrier (or anything else solid) gives back the classic 0.35', () => {
    const { before, after } = bounce('Barrier')
    near(after, -before * DEFAULT_CAR_FEEL.bounce)
    near(bounce('Rock').after, after)
  })

  it('a tire stack soaks it up: 0.08', () => {
    const { before, after } = bounce('Tire stack')
    near(after, -before * 0.08)
  })

  it('a tree or a grandstand: 0.25', () => {
    for (const name of ['Tree', 'Grandstand']) {
      const { before, after } = bounce(name)
      near(after, -before * 0.25)
    }
  })

  it('a bumper gives it all back and kicks: 2.4 px a frame is 4.8 a tick', () => {
    const { before, after } = bounce('Bumper')
    near(after, -before - 2.4 * 2)
  })
})

describe('saves from before "what I hit"', () => {
  it('an untouched Car and Computer racer of parity A upgrade, keeping their slider values', () => {
    expect(workspaceFingerprint(carBefore.workspace)).toBe('cd3793ca')
    expect(workspaceFingerprint(racerBefore.workspace)).toBe('68d4e698')
    const project = createRaceStarterProject()
    const fresh = createRaceStarterProject()
    for (const [id, before] of [['brick_car', carBefore], ['brick_racer', racerBefore]] as const) {
      project.workspaces[id] = structuredClone(before.workspace)
      const brick = project.design.bricks.find((b) => b.id === id)!
      brick.program = structuredClone(before.program) as unknown as BrickDef['program']
      brick.program.variables.find((v) => v.id.endsWith('_top'))!.value = 9
    }
    const up = upgradeUntouchedBricks(project)
    for (const id of ['brick_car', 'brick_racer']) {
      expect(up.workspaces[id]).toEqual(fresh.workspaces[id])
      const vars = up.design.bricks.find((b) => b.id === id)!.program.variables
      expect(vars.find((v) => v.id.endsWith('_top'))!.value).toBe(9)
      expect(vars.find((v) => v.id.endsWith('_tires_bounce'))!.value).toBe(0.08)
    }
  })
})
