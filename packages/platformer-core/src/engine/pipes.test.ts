import { describe, expect, it } from 'vitest'
import { TS, sub } from './constants'
import { editDesign } from './designEdit'
import { isValidEvent, type EditOp } from './events'
import { cloneLevel, createBlankLevel, isPipeMouth, levelFromJson, levelToJson } from './level'
import { beginPipeTravel, canEnterPipe, getPipeEntry, H_BIG, PIPE_HOLD_TICKS, PIPE_PHASE_TICKS, POWER, respawn } from './player'
import { harness } from './testHarness'
import { T } from './tiles'
import { applyEvent, createWorld, deserializeWorld, hashWorld, serializeWorld, snapshotWorld } from './world'
import { isValidPose } from '../net/protocol'

function connectedLevel() {
  const d = createBlankLevel(40, 20)
  for (const x of [5, 25]) for (let y = 14; y < 18; y++) {
    d.tiles[y * d.width + x] = T.PIPE_L
    d.tiles[y * d.width + x + 1] = T.PIPE_R
  }
  d.pipes = [{ id: 10, x: 5, y: 14, exitId: 20 }, { id: 20, x: 25, y: 14, exitId: 10 }]
  return d
}
function atEntry() {
  const h = harness(connectedLevel())
  h.p.x = 6 * TS - h.p.w / 2
  h.p.y = 14 * TS - h.p.h
  h.p.onGround = true
  return h
}

describe('stable connected pipe design', () => {
  it('loads old levels and preserves links through save, clone and world keyframes', () => {
    const d = connectedLevel()
    const json = levelToJson(d)
    expect(levelFromJson(json).pipes).toEqual(d.pipes)
    const { pipes: _, ...legacy } = json
    expect(levelFromJson(legacy).pipes).toEqual([])
    const clone = cloneLevel(d)
    clone.pipes![0].x = 6
    expect(d.pipes![0].x).toBe(5)
    const w = createWorld(d)
    expect(deserializeWorld(serializeWorld(w)).design.pipes).toEqual(d.pipes)
    const changed = createWorld(d)
    changed.design.pipes![0].exitId = null
    expect(hashWorld(changed)).not.toBe(hashWorld(w))
    expect(() => levelFromJson({ ...json, pipes: [[10, 5, 14, 99]] })).toThrow('missing pipe exit')
    expect(() => levelFromJson({ ...json, pipes: [[10, 5, 14, 10]] })).toThrow('bad pipe link')
    expect(() => levelFromJson({ ...json, pipes: [[10, 39, 14, null]] })).toThrow('bad pipe mouth')
    expect(() => levelFromJson({ ...json, pipes: [[10, 5, 14, null], [20, 5, 14, null]] })).toThrow('bad pipe mouth')
  })

  it('applies the same ordered operations to saved design and live world, with snapshot-safe undo', () => {
    const d = connectedLevel()
    const w = createWorld(d)
    const snap = snapshotWorld(w)
    const ops: EditOp[] = [{ o: 'pipeDel', id: 20 }]
    for (const op of ops) editDesign(d, op)
    applyEvent(w, { t: 'edit', ops }, 1)
    expect(w.design.pipes).toEqual(d.pipes)
    expect(d.pipes).toEqual([{ id: 10, x: 5, y: 14, exitId: null }])
    expect(snap.design.pipes![0].exitId).toBe(20)
    const undo: EditOp[] = snap.design.pipes!.map((pipe) => ({ o: 'pipe', pipe }))
    for (const op of undo) editDesign(d, op)
    applyEvent(w, { t: 'edit', ops: undo }, 1)
    expect(w.design.pipes).toEqual(snap.design.pipes)
    expect(w.design.pipes).toEqual(d.pipes)
    expect(isValidEvent({ t: 'edit', ops: [{ o: 'pipe', pipe: { id: 10, x: 39, y: 14, exitId: null } }] }, 40, 20)).toBe(false)
    expect(isPipeMouth(w, 5, 15)).toBe(false)
  })
})

describe('upright pipe travel', () => {
  it('requires a deliberate Down hold and preserves the run while entering and emerging', () => {
    const h = atEntry()
    h.p.power = POWER.SPARK
    h.p.h = H_BIG
    h.p.y = 14 * TS - H_BIG
    h.p.coins = 7
    h.p.checkpoint = 88
    h.p.runStart = 123
    h.run(PIPE_HOLD_TICKS - 1, { down: true })
    expect(h.p.pipe).toBeNull()
    h.step({ down: true })
    expect(h.p.pipe?.phase).toBe('enter')
    expect(h.p.h).toBe(H_BIG)
    h.run(PIPE_PHASE_TICKS, { down: true })
    expect(h.p.pipe).toMatchObject({ phase: 'exit', mouthX: 25, mouthY: 14, progress: 0 })
    h.run(PIPE_PHASE_TICKS, { down: true })
    expect(h.p.pipe).toBeNull()
    expect(h.p.x + h.p.w / 2).toBe(26 * TS)
    expect(h.p.y + h.p.h).toBe(14 * TS)
    expect([h.p.power, h.p.coins, h.p.checkpoint, h.p.runStart]).toEqual([POWER.SPARK, 7, 88, 123])
    expect([h.p.vx, h.p.vy]).toEqual([0, 0])
    expect(h.emitted).toEqual([])
    h.run(PIPE_HOLD_TICKS * 2, { down: true })
    expect(h.p.pipe).toBeNull()
    h.step()
    h.run(PIPE_HOLD_TICKS, { down: true })
    expect(h.p.pipe?.exitId).toBe(10)
  })

  it('checks both mouth columns, standing height, hazards and centering before touch entry', () => {
    const h = atEntry()
    expect(canEnterPipe(h.p, h.ctx)).toBe(true)
    h.p.power = POWER.BIG
    // The upper row does not intersect a small character, but blocks a big one.
    h.world.tiles[12 * 40 + 26] = T.HARD
    expect(beginPipeTravel(h.p, h.ctx)).toBe(false)
    h.p.power = POWER.SMALL
    expect(canEnterPipe(h.p, h.ctx)).toBe(true)
    h.world.tiles[13 * 40 + 26] = T.LAVA
    expect(beginPipeTravel(h.p, h.ctx)).toBe(false)
    h.world.tiles[13 * 40 + 26] = T.EMPTY
    h.p.x += sub(6)
    expect(getPipeEntry(h.p, h.world)).toBeUndefined()
  })

  it('cancels transit when an exit is edited shut and clears transit on respawn', () => {
    const h = atEntry()
    expect(beginPipeTravel(h.p, h.ctx)).toBe(true)
    h.run(PIPE_PHASE_TICKS)
    h.world.tiles[13 * 40 + 25] = T.HARD
    h.step()
    expect(h.p.pipe).toBeNull()
    expect(h.p.x + h.p.w / 2).toBe(6 * TS)
    h.world.tiles[13 * 40 + 25] = T.EMPTY
    h.p.onGround = true
    h.p.pipeLock = 0
    expect(beginPipeTravel(h.p, h.ctx)).toBe(true)
    respawn(h.p, h.ctx, false)
    expect(h.p.pipe).toBeNull()
    expect(h.p.pipeLock).toBe(0)
  })

  it('validates bounded remote clipping metadata and cosmetic blend fields', () => {
    const pose = { m: 0, x: 10, y: 20, f: 1, a: 'stand', s: 0, v: 1, q: 0, t: 1 }
    expect(isValidPose({ ...pose, pi: { x: 5, y: 14, phase: 0, progress: 127 }, gb: 12, gw: 255, lc: 0 })).toBe(true)
    expect(isValidPose({ ...pose, pi: { x: 5, y: 14, phase: 2, progress: 127 } })).toBe(false)
    expect(isValidPose({ ...pose, pi: { x: 400, y: 14, phase: 0, progress: 127 } })).toBe(false)
    expect(isValidPose({ ...pose, pi: { x: 5, y: 14, phase: 0, progress: -1 } })).toBe(false)
    expect(isValidPose({ ...pose, gb: 256 })).toBe(false)
  })
})
