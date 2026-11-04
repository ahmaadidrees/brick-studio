/**
 * The Walker walks at the classic Walker's speed (parity bucket A, 2026-11-03): 0.5 px a frame, so 30 steps a second,
 * 1 a tick. It was 3, three times too fast. Saved Walkers still at the old default move to the new one when the project
 * opens; a speed the kid chose stays.
 */
import { describe, expect, it } from 'vitest'
import { play } from '../core/index'
import { BUILT_IN_DEFAULT_CHANGES, upgradeUntouchedBricks } from './remix'
import { createStarterProject, WALKER_SPEED, WALKER_SPEED_BEFORE } from './starter'
import type { StudioProject } from './store'

const speedOf = (p: StudioProject) => p.design.bricks.find((b) => b.id === 'brick_walker')!.program.variables.find((v) => v.id === 'brick_walker_speed')!.value

function savedWithSpeed(speed: number): StudioProject {
  const project = createStarterProject()
  const walker = project.design.bricks.find((b) => b.id === 'brick_walker')!
  walker.program.variables = walker.program.variables.map((v) => (v.id === 'brick_walker_speed' ? { ...v, value: speed } : v))
  return project
}

describe('the Walker', () => {
  it('walks 30 steps a second, like the classic Walker', () => {
    expect(WALKER_SPEED).toBe(1)
    expect(BUILT_IN_DEFAULT_CHANGES.brick_walker).toEqual([{ variable: 'brick_walker_speed', from: WALKER_SPEED_BEFORE, to: WALKER_SPEED }])
    const rt = play(createStarterProject().design)
    const walker = rt.world.targets.find((t) => t.copyId === 'copy_walker_slow')!
    for (let i = 0; i < 10; i++) rt.step()
    const from = walker.x
    for (let i = 0; i < 30; i++) rt.step()
    expect(Math.abs(walker.x - from)).toBe(30)
  })

  it('a saved Walker still at the old speed gets the classic one; a speed the kid chose stays', () => {
    const old = savedWithSpeed(WALKER_SPEED_BEFORE)
    const up = upgradeUntouchedBricks(old)
    expect(speedOf(up)).toBe(WALKER_SPEED)
    expect(upgradeUntouchedBricks(up)).toBe(up)
    const chosen = savedWithSpeed(5)
    expect(upgradeUntouchedBricks(chosen)).toBe(chosen)
  })

  it('a Walker with changed blocks, or a copy with its own speed, keeps it', () => {
    const edited = savedWithSpeed(WALKER_SPEED_BEFORE)
    const ws = edited.workspaces.brick_walker as { blocks: { blocks: unknown[] } }
    ws.blocks.blocks = ws.blocks.blocks.slice(1)
    expect(speedOf(upgradeUntouchedBricks(edited))).toBe(WALKER_SPEED_BEFORE)
    const own = savedWithSpeed(WALKER_SPEED_BEFORE)
    own.design.copies.find((c) => c.id === 'copy_walker_fast')!.knobs = { brick_walker_speed: 3 }
    expect(upgradeUntouchedBricks(own).design.copies.find((c) => c.id === 'copy_walker_fast')!.knobs).toEqual({ brick_walker_speed: 3 })
  })
})
