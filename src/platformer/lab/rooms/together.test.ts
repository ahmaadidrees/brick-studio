/**
 * Building together (docs/qa/hackable-rooms M2), with the room and three players' sessions in one process, every
 * message 30-60 ms late (the same harness as room.test.ts): who may make which edits, the room's history and undo,
 * blocks for the code editors, presence, and every game agreeing through it all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { brickToWire, designText } from '../core/save'
import { worldFingerprint } from '../core/snapshot'
import { createStarterProject } from '../studio/starter'
import type { LinkSocket } from './link'
import { HackableRoomCore, type RoomSocket } from './roomCore'
import { RoomSession } from './session'
import type { EditOp } from './edits'
import type { LevelDesign } from '../core/contracts'

let now = 0
const clock = () => now

class Net {
  room: HackableRoomCore
  lag: number
  queue: { at: number; fn: () => void }[] = []
  constructor(room: HackableRoomCore, lag = 60) {
    this.room = room
    this.lag = lag
  }
  later(fn: () => void, lag = this.lag) {
    this.queue.push({ at: now + lag, fn })
  }
  /** A socket for a session: open at once, every message delayed both ways. */
  socket = (): LinkSocket => {
    const net = this
    const server: RoomSocket = {
      send: (data) => net.later(() => client.onmessage?.({ data })),
      close: () => net.later(() => { client.readyState = 3; client.onclose?.() }),
    }
    const client = {
      readyState: 1,
      onopen: null as (() => void) | null,
      onmessage: null as ((e: { data: unknown }) => void) | null,
      onclose: null as (() => void) | null,
      send: (data: string) => net.later(() => net.room.message(server, data)),
      close: () => {
        client.readyState = 3
        net.later(() => net.room.disconnect(server), 0)
      },
    }
    this.room.connect(server)
    queueMicrotask(() => client.onopen?.())
    return client
  }
  /** Run time forward in `step` ms steps (1 by default), delivering messages and playing every session's frames. */
  async run(ms: number, sessions: RoomSession[], step = 1) {
    const end = now + ms
    while (now < end) {
      now += step
      await Promise.resolve()
      const due = this.queue.filter((m) => m.at <= now)
      this.queue = this.queue.filter((m) => m.at > now)
      for (const m of due) m.fn()
      if (now % 16 < step) for (const s of sessions) s.frame(now)
    }
  }
}

function join(net: Net, name: string, host = false, key?: string) {
  const s = new RoomSession({ name, url: 'test://room', socket: net.socket, now: clock, ...(host ? { hostKey: 'HOST' } : {}), ...(key ? { key } : {}) })
  s.connect()
  return s
}

/** Each session's fingerprint of the game as tick `t` was about to run. */
const printsAt = (sessions: RoomSession[], t: number) => sessions.map((s) => {
  const snap = s.timeline!.snapshotAt(t)
  return snap ? worldFingerprint(snap) : null
})

beforeEach(() => {
  now = 1_000_000
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})


const starter = () => createStarterProject()

/** The Walker's flag script starts with one more block: a code change. */
function walkerCode(design: LevelDesign): EditOp {
  const walker = design.bricks.find((b) => b.id === 'brick_walker')!
  // "point in direction (way x 90)" becomes "way x 91": a real change to its blocks, still a valid program.
  const text = JSON.stringify(walker.program)
  if (!text.includes('"value":90')) throw new Error('The Walker changed: pick another number to edit.')
  const program = JSON.parse(text.replace('"value":90', '"value":91')) as typeof walker.program
  return { op: 'brick', brick: brickToWire({ ...walker, program }), ws: { blocks: { languageVersion: 0, blocks: [] }, note: 'Sam' } }
}

const coinAt = (design: LevelDesign, id: string, x: number): EditOp => ({ op: 'copy', copy: { ...design.copies.find((c) => c.brickId === 'brick_coin')!, id, x, y: 120 } })

async function threeInARoom() {
  const project = starter()
  const room = new HackableRoomCore('r1', designText(project.design), { now: clock, hostKey: 'HOST', workspaces: { ...project.workspaces } })
  const net = new Net(room, 45)
  const maya = join(net, 'Maya', true, 'maya-key')
  await net.run(200, [maya])
  const sam = join(net, 'Sam', false, 'sam-key')
  const ben = join(net, 'Ben', false, 'ben-key')
  const all = [maya, sam, ben]
  await net.run(600, all)
  return { project, room, net, maya, sam, ben, all }
}

const designOf = (s: RoomSession) => s.runtime!.world.design!
const agree = (all: RoomSession[]) => {
  const t = Math.min(...all.map((s) => s.timeline!.tick)) - 30
  const at = Math.floor(t / 4) * 4
  return all.map((s) => { const snap = s.timeline!.snapshotAt(at); return snap ? worldFingerprint(snap) : null })
}

describe('building together (docs/qa/hackable-rooms M2)', { timeout: 60_000 }, () => {
  it('classmates build by default; code waits for the host, for everyone or one at a time', async () => {
    const { project, room, net, maya, sam, ben, all } = await threeInARoom()
    expect(sam.view.build).toBe(true)
    expect(sam.view.code).toBe(false)
    expect(maya.view.code).toBe(true)
    // Sam and Ben build at once: both Coins land in every game.
    expect(sam.sendEdit([coinAt(project.design, 'copy_coin_sam', 300)])).toBe(true)
    expect(ben.sendEdit([coinAt(project.design, 'copy_coin_ben', 340), { op: 'cells', cells: [[12, 6, 'G']] }])).toBe(true)
    await net.run(800, all)
    for (const s of all) {
      const ids = designOf(s).copies.map((c) => c.id)
      expect(ids).toContain('copy_coin_sam')
      expect(ids).toContain('copy_coin_ben')
      expect(s.runtime!.world.targets.some((t) => t.copyId === 'cell:12:6')).toBe(true)
    }
    expect(designText(designOf(sam))).toBe(room.project)
    // Sam may not change code yet: the room refuses it, and his game goes back.
    expect(sam.sendEdit([walkerCode(project.design)])).toBe(true)
    await net.run(600, all)
    expect(sam.rejected).toBe(1)
    expect(sam.view.notice).toMatch(/code is off for you/i)
    expect(designText(designOf(sam))).toBe(room.project)
    // The host lets Sam (only Sam) change code. He changes the Walker live.
    maya.grantCode(sam.view.me, true)
    await net.run(400, all)
    expect(sam.view.code).toBe(true)
    expect(ben.view.code).toBe(false)
    expect(maya.view.players.find((p) => p.name === 'Sam')?.code).toBe(true)
    sam.sendEdit([walkerCode(project.design)])
    await net.run(1200, all)
    expect(sam.rejected).toBe(1)
    for (const s of all) {
      const walkers = s.runtime!.world.targets.filter((t) => t.brickId === 'brick_walker' && !t.isClone)
      expect(walkers.length).toBe(2)
      expect(JSON.stringify(s.runtime!.world.bricks.brick_walker!.program)).toContain('"value":91')
    }
    // Everyone else heard about it; the blocks travelled with it.
    expect(ben.view.notice).toMatch(/Sam changed Walker’s code\. Its scripts started again\./)
    expect(ben.workspaces.get('brick_walker')).toMatchObject({ note: 'Sam' })
    expect(room.workspaces.brick_walker).toMatchObject({ note: 'Sam' })
    // Ben still can't.
    ben.sendEdit([walkerCode(project.design)])
    await net.run(600, all)
    expect(ben.rejected).toBe(1)
    // Code on for everyone, then off: Ben in, then out again; Sam keeps his own.
    maya.setRoles({ code: true })
    await net.run(300, all)
    expect(ben.view.code).toBe(true)
    maya.setRoles({ code: false })
    await net.run(300, all)
    expect(ben.view.code).toBe(false)
    expect(sam.view.code).toBe(true)
    await net.run(3000, all)
    const prints = agree(all)
    expect(prints[0]).not.toBeNull()
    expect(new Set(prints).size).toBe(1)
    expect(all.map((s) => s.stats.resyncs)).toEqual([0, 0, 0])
  })

  it('the history: each player puts back their own change, the host anyone\'s, and every game agrees', async () => {
    const { project, room, net, maya, sam, ben, all } = await threeInARoom()
    sam.sendEdit([coinAt(project.design, 'copy_coin_sam', 300)])
    await net.run(400, all)
    ben.sendEdit([coinAt(project.design, 'copy_coin_ben', 340)])
    await net.run(600, all)
    expect(ben.view.history.map((h) => `${h.name} ${h.summary}`)).toEqual(['Sam placed Coin', 'Ben placed Coin'])
    const samsSeq = ben.view.history[0]!.seq
    // Ben can't put back Sam's change.
    ben.undo(samsSeq)
    await net.run(400, all)
    expect(designOf(ben).copies.some((c) => c.id === 'copy_coin_sam')).toBe(true)
    expect(ben.view.notice).toMatch(/Only the host/)
    // Sam can.
    sam.undo(samsSeq)
    await net.run(600, all)
    for (const s of all) expect(designOf(s).copies.some((c) => c.id === 'copy_coin_sam')).toBe(false)
    expect(maya.view.history.find((h) => h.seq === samsSeq)?.undone).toBe(true)
    expect(maya.view.notice).toMatch(/Sam put back their change: placed Coin\./)
    // The host's Undo last change: Ben's Coin.
    const last = [...maya.view.history].reverse().find((h) => !h.undone)!
    maya.undo(last.seq)
    await net.run(600, all)
    for (const s of all) expect(designOf(s).copies.some((c) => c.id === 'copy_coin_ben')).toBe(false)
    expect(room.project).toBe(designText(project.design))
    await net.run(2500, all)
    expect(new Set(agree(all)).size).toBe(1)
  })

  it('building off: nobody but the host builds; a late joiner gets the project as edited', async () => {
    const { project, room, net, maya, sam, all } = await threeInARoom()
    sam.sendEdit([coinAt(project.design, 'copy_coin_sam', 300)])
    await net.run(500, all)
    maya.setRoles({ build: false })
    await net.run(300, all)
    expect(sam.view.build).toBe(false)
    expect(sam.sendEdit([coinAt(project.design, 'copy_coin_late', 360)])).toBe(false)
    expect(maya.sendEdit([{ op: 'uncopy', id: 'copy_coin_1' }])).toBe(true)
    await net.run(KEYFRAME_EVERY_MS + 2000, all)
    const lee = join(net, 'Lee', false, 'lee-key')
    const five = [...all, lee]
    await net.run(1500, five)
    const ids = designOf(lee).copies.map((c) => c.id)
    expect(ids).toContain('copy_coin_sam')
    expect(ids).not.toContain('copy_coin_1')
    expect(designText(designOf(lee))).toBe(room.project)
    await net.run(2500, five)
    expect(new Set(agree(five)).size).toBe(1)
  })

  it('blocks on request, and who is editing what', async () => {
    const { project, net, sam, ben, maya, all } = await threeInARoom()
    sam.askWorkspace('brick_walker')
    sam.askWorkspace('nothing_here')
    await net.run(300, all)
    expect(JSON.stringify(sam.workspaces.get('brick_walker'))).toBe(JSON.stringify(project.workspaces.brick_walker))
    expect(sam.missingWorkspaces.has('nothing_here')).toBe(true)
    sam.setEditing('Walker’s code')
    ben.setEditing('Building\u0007')
    await net.run(300, all)
    expect(maya.view.players.find((p) => p.name === 'Sam')?.editing).toBe('Walker’s code')
    expect(maya.view.players.find((p) => p.name === 'Ben')?.editing).toBe('Building')
    sam.setEditing(null)
    await net.run(300, all)
    expect(maya.view.players.find((p) => p.name === 'Sam')?.editing).toBeUndefined()
  })
})

const KEYFRAME_EVERY_MS = 600 * 34
