/**
 * Checkpoint (parity bucket B): touch the flag and getting hurt brings the Hero back there instead of to its start,
 * like the classic checkpoint. Compared with the classic Hero walking the same course: start, a checkpoint, a pit.
 */
import { describe, expect, it } from 'vitest'
import { SUB, TILE } from '@brick-studio/platformer-core/engine/constants'
import { harness } from '@brick-studio/platformer-core/engine/testHarness'
import type { LevelDesign, Target } from '../../core/contracts'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { createHeroTestDesign, FLOOR_TOP, HERO_START_X } from '../hero/heroLevel'
import { HERO_BRICK_ID } from '../hero/heroBrick'
import { createStarterProject } from '../starter'
import { drawerEntries, extraEntryId } from '../builder/catalog'
import { CHECKPOINT_BRICK_ID, CHECKPOINT_SOUND, createCheckpointBrick } from './checkpoint'

/** Classic: start at column 2, a checkpoint at column 10, the floor ends after column 19, then a pit. */
function classicRun(checkpoint: boolean) {
  const rows = Array.from({ length: 10 }, () => '.'.repeat(40).split(''))
  for (let c = 0; c < 20; c++) rows[9]![c] = '#'
  rows[8]![2] = '@'
  if (checkpoint) rows[8]![10] = 'C'
  const h = harness(rows.map((r) => r.join('')))
  let died = false
  for (let f = 0; f < 900; f++) {
    h.step({ right: !died })
    if (h.p.dead) died = true
    if (died && !h.p.dead) break
  }
  for (let f = 0; f < 20; f++) h.step()
  // Respawned: centre x and box bottom, in pixels.
  return { x: (h.p.x + h.p.w / 2) / SUB, bottom: (h.p.y + h.p.h) / SUB, died }
}

const CHECKPOINT_X = 160 + 8

/** Hackable: the Hero at HERO_START_X, a Checkpoint standing on the floor at CHECKPOINT_X, the floor ends at 512 over a pit. */
function course(checkpoints: number[]): LevelDesign {
  const d = createHeroTestDesign({ floorEnd: 512 })
  const cp = createCheckpointBrick()
  return {
    ...d,
    pits: true,
    bricks: [...d.bricks, cp.brick],
    copies: [...d.copies, ...checkpoints.map((x, i) => ({ id: `copy_cp_${i}`, brickId: cp.brick.id, x, y: FLOOR_TOP + 16 }))],
  }
}

function hackableRun(checkpoints: number[]) {
  const rt = play(course(checkpoints))
  const hero = (): Target => rt.world.targets.find((t) => t.brickId === HERO_BRICK_ID && !t.isClone)!
  // Let it find where it first stands (its start), then walk.
  for (let k = 0; k < 5; k++) rt.step()
  rt.pressKey('right arrow')
  let fell = false
  for (let k = 0; k < 450; k++) {
    rt.step()
    if (!fell && hero().y < 0) {
      fell = true
      rt.releaseKey('right arrow')
    }
    if (fell && hero().visible && hero().y > 0 && hero().body?.onGround) break
  }
  for (let k = 0; k < 10; k++) rt.step()
  const flags = rt.world.targets.filter((t) => t.brickId === CHECKPOINT_BRICK_ID).map((t) => t.costumeIndex)
  // The Hero's box is bottom aligned in its 16 x 16 costume: its bottom is 8 below y.
  return { x: hero().x, bottom: hero().y - 8, fell, flags }
}

describe('Checkpoint', () => {
  it('is a valid brick in a level', () => {
    expect(validateDesign(course([CHECKPOINT_X]))).toEqual([])
    const cp = createCheckpointBrick().brick
    expect(cp.costumes.map((c) => c.name)).toEqual(['down', 'up'])
    expect(cp.sounds.map((s) => s.name)).toEqual([CHECKPOINT_SOUND])
    expect(cp.sounds[0]!.asset).toMatch(/^data:audio\/wav;base64,/)
    expect(createCheckpointBrick().brick.sounds[0]!.asset).toBe(cp.sounds[0]!.asset)
  })

  it('classic: with no checkpoint the Hero comes back at the start; past one, at the checkpoint', () => {
    const none = classicRun(false)
    expect(none.died).toBe(true)
    expect(none.x).toBe(2 * TILE + 8)
    const cp = classicRun(true)
    expect(cp.x).toBe(10 * TILE + 8)
    expect(cp.bottom).toBe(none.bottom)
  })

  it('Hackable: the same. No checkpoint, back at the start; past one, back by the flag, standing', () => {
    const none = hackableRun([])
    expect(none.fell).toBe(true)
    expect(none.x).toBe(HERO_START_X)
    const cp = hackableRun([CHECKPOINT_X])
    expect(cp.fell).toBe(true)
    // Classic puts the Hero in the middle of the flag's tile. This Hero comes back where it stood when it reached the
    // flag, walking right: less than a tile before the middle.
    expect(cp.x).toBeLessThanOrEqual(CHECKPOINT_X)
    expect(CHECKPOINT_X - cp.x).toBeLessThan(TILE)
    expect(cp.bottom).toBe(FLOOR_TOP)
    expect(cp.flags).toEqual([1])
  })

  it('only the newest flag is up, and the Hero comes back at the newest', () => {
    const two = hackableRun([CHECKPOINT_X, 360])
    expect(two.flags).toEqual([0, 1])
    expect(360 - two.x).toBeLessThan(TILE)
    expect(two.x).toBeLessThanOrEqual(360)
  })

  it('plays the classic checkpoint jingle once per flag', () => {
    const rt = play(course([CHECKPOINT_X]))
    rt.pressKey('right arrow')
    for (let k = 0; k < 120; k++) rt.step()
    const played = rt.notes.flatMap((note) => (note.kind === 'sound' ? [note.sound] : []))
    expect(played.filter((s) => s === CHECKPOINT_SOUND)).toHaveLength(1)
  })

  it('the drawer offers it under Start and goal', () => {
    expect(drawerEntries(createStarterProject().design.bricks).find((e) => e.id === extraEntryId(CHECKPOINT_BRICK_ID))).toMatchObject({ name: 'Checkpoint', category: 'course' })
  })
})
