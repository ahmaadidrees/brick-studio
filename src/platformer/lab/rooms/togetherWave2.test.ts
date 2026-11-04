/**
 * Building together with wave 2's other lanes (wave 2 integration, fixes b and c), through the real room core and
 * sessions with every message 45 ms late (roomTestNet.ts):
 *
 * - a game from nothing follows M2's roles: classmates place, paint and change the backdrop; giving a job or choosing
 *   the player is code, which waits for the host; the game's player and backdrop travel as edits (`game`), not as the
 *   host's whole project;
 * - Parity B's bricks go out as edits from the drawer (with their art and sounds), are tuned and recoded live, and every
 *   game agrees.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LevelDesign } from '../core/contracts'
import { designText } from '../core/save'
import { costumeFromImage, imageFromRows } from '../studio/pixels'
import { StudioStore } from '../studio/store'
import { createStarterProject } from '../studio/starter'
import { createBlankProject } from '../studio/blank/blankProject'
import { giveJob } from '../studio/blank/jobs'
import { CHECKPOINT_BRICK_ID } from '../studio/builtins/checkpoint'
import { SPIKY_BRICK_ID } from '../studio/builtins/critters'
import { PLATFORM_BRICK_ID } from '../studio/builtins/platforms'
import { chunks } from './building'
import { applyEdit, diffDesigns, isEditOps, kindOfEdit, type EditOp } from './edits'
import { HackableRoomCore } from './roomCore'
import type { RoomSession } from './session'
import { agree, clock, join, Net, setNow } from './roomTestNet'

beforeEach(() => {
  setNow(1_000_000)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const square = (colour: string) => costumeFromImage('c', imageFromRows(Array.from({ length: 16 }, () => '#'.repeat(16)), { '#': colour }))
const designOf = (s: RoomSession) => s.runtime!.world.design!

/** What a kid's studio would send after `change`, made on a copy of the room's project as this session sees it. */
function editFrom(s: RoomSession, change: (store: StudioStore) => void): EditOp[] {
  const before = designOf(s)
  const workspaces = Object.fromEntries(s.workspaces)
  const store = new StudioStore({ design: before, workspaces })
  change(store)
  const after = store.getState().project
  // As rooms/building.ts: blocks only go out from a kid who may change code.
  const { ops, other } = diffDesigns(before, after.design, workspaces, s.view.code ? after.workspaces : workspaces)
  expect(other).toBe(false)
  return ops
}
const send = (s: RoomSession, ops: EditOp[]) => chunks(ops).every((part) => s.sendEdit(part))

async function room(design: LevelDesign, workspaces: Record<string, unknown>) {
  const core = new HackableRoomCore('r2', designText(design), { now: clock, hostKey: 'HOST', workspaces: { ...workspaces } })
  const net = new Net(core, 45)
  const ana = join(net, 'Ana', true, 'ana-key')
  await net.run(200, [ana])
  const ben = join(net, 'Ben', false, 'ben-key')
  const cy = join(net, 'Cy', false, 'cy-key')
  const all = [ana, ben, cy]
  await net.run(600, all)
  return { core, net, ana, ben, cy, all }
}

/** Zip (Player · walks around), Spike (Hurts), Flag (Goal), Star (no job yet), Wall (tiles 'W'). */
function blankProject() {
  const store = new StudioStore(createBlankProject())
  const zip = store.addBrick('Zip', square('#34c77b'))
  const spike = store.addBrick('Spike', square('#5b6676'))
  const flag = store.addBrick('Flag', square('#e5484d'))
  const star = store.addBrick('Star', square('#f5b301'))
  const wall = store.addBrick('Wall', square('#c9743a'))
  store.setGridChar(wall, 'W')
  store.setBrush(null)
  store.addCopy(zip, 40, 40)
  store.addCopy(spike, 200, 40)
  store.addCopy(flag, 300, 200)
  giveJob(store, zip, 'player', 'walk')
  giveJob(store, spike, 'hurts')
  giveJob(store, flag, 'goal')
  return { project: store.getState().project, zip, star, wall }
}

describe('a game from nothing in a room follows M2\'s roles', { timeout: 60_000 }, () => {
  it('classmates build and change the backdrop; jobs and the player wait for the host; every game agrees', async () => {
    const { project, zip, star, wall } = blankProject()
    const { core, net, ana, ben, cy, all } = await room(project.design, project.workspaces)
    expect(ben.view.build).toBe(true)
    expect(ben.view.code).toBe(false)

    // Building: a Star placed, Wall cells painted, the backdrop to night. All go out as edits, none as a whole project.
    const build = editFrom(ben, (s) => {
      s.addCopy(star, 120, 120)
      for (let row = 2; row < 6; row++) s.setTile(10, row, 'W')
      s.setBackdrop('night')
    })
    expect(build.map((o) => o.op).sort()).toEqual(['cells', 'copy', 'game'])
    expect(kindOfEdit(designOf(ben), build)).toBe('build')
    expect(send(ben, build)).toBe(true)
    await net.run(800, all)
    expect(ben.rejected).toBe(0)
    for (const s of all) {
      expect(designOf(s).backdrop).toBe('night')
      expect(designOf(s).copies.some((c) => c.brickId === star)).toBe(true)
      expect(s.runtime!.world.targets.some((t) => t.copyId === 'cell:10:3' && t.brickId === wall)).toBe(true)
    }
    expect(designText(designOf(cy))).toBe(core.project)

    // A job is code: refused until the host lets Ben change code.
    const hurts = editFrom(ben, (s) => { giveJob(s, star, 'hurts') })
    expect(kindOfEdit(designOf(ben), hurts)).toBe('code')
    send(ben, hurts)
    await net.run(600, all)
    expect(ben.rejected).toBe(1)
    expect(designText(designOf(ben))).toBe(core.project)
    ana.grantCode(ben.view.me, true)
    await net.run(400, all)
    expect(ben.view.code).toBe(true)
    send(ben, editFrom(ben, (s) => { giveJob(s, star, 'hurts') }))
    await net.run(800, all)
    expect(ben.rejected).toBe(1)
    for (const s of all) expect(JSON.stringify(s.runtime!.world.bricks[star]!.program)).toContain('hero hurt')

    // Choosing the player is code too, and it travels as a `game` edit: Star becomes the player, then the host puts
    // it back.
    const player = editFrom(ben, (s) => { giveJob(s, star, 'player', 'walk') })
    expect(player.some((o) => o.op === 'game' && o.player === star)).toBe(true)
    expect(send(cy, editFrom(cy, (s) => { giveJob(s, star, 'player', 'walk') }))).toBe(true)
    await net.run(600, all)
    expect(cy.rejected).toBe(1)
    send(ben, player)
    await net.run(800, all)
    for (const s of all) expect(designOf(s).player).toBe(star)
    // The history keeps two parts of each change ("placed Star, painted 4 cells"; the backdrop was a third).
    expect(ana.view.history.map((h) => `${h.name} ${h.summary}`)).toEqual([
      'Ben placed Star, painted 4 cells',
      'Ben changed Star’s code',
      'Ben changed Star’s code, made Star the player',
    ])
    const last = [...ana.view.history].reverse().find((h) => !h.undone)!
    ana.undo(last.seq)
    await net.run(800, all)
    for (const s of all) expect(designOf(s).player).toBe(zip)

    await net.run(3000, all)
    const prints = agree(all)
    expect(prints[0]).not.toBeNull()
    expect(new Set(prints).size).toBe(1)
    expect(all.map((s) => s.stats.resyncs)).toEqual([0, 0, 0])
  })

  it('the game edit: checked, applied, put back, and only code when it changes the player', () => {
    const { project, star } = blankProject()
    const d = project.design
    expect(isEditOps([{ op: 'game', backdrop: 'sky' }])).toBe(true)
    expect(isEditOps([{ op: 'game', player: null }])).toBe(true)
    expect(isEditOps([{ op: 'game' }])).toBe(false)
    expect(isEditOps([{ op: 'game', backdrop: 'lava' }])).toBe(false)
    expect(kindOfEdit(d, [{ op: 'game', backdrop: 'sky' }])).toBe('build')
    expect(kindOfEdit(d, [{ op: 'game', player: star }])).toBe('code')
    expect(kindOfEdit(d, [{ op: 'game', player: d.player! }])).toBe('build')
    const applied = applyEdit(d, [{ op: 'game', player: star, backdrop: 'grass' }])
    expect(applied.design).toMatchObject({ player: star, backdrop: 'grass' })
    expect(applied.summary).toBe('made Star the player, changed the backdrop')
    const back = applyEdit(applied.design, applied.undo).design
    expect(back.player).toBe(d.player)
    expect('backdrop' in back).toBe(false)
    // Kit games never have either, so their diffs never carry one.
    const starter = createStarterProject().design
    expect(diffDesigns(starter, { ...starter, name: starter.name }).ops).toEqual([])
  })
})

describe('Parity B bricks in a room, built together', { timeout: 60_000 }, () => {
  it('a Checkpoint and a Spiky from the drawer, the platform tuned and recoded live: every game agrees', async () => {
    const start = new StudioStore(createStarterProject())
    start.addCopy(start.addCatalogBrick(PLATFORM_BRICK_ID)!, 600, 200)
    const { design, workspaces } = start.getState().project
    const { core, net, ana, ben, cy, all } = await room(design, workspaces)

    // Ben adds a Checkpoint and a Spiky from the drawer: new bricks (with their art and the classic jingle) are building.
    const add = editFrom(ben, (s) => {
      s.addCopy(s.addCatalogBrick(CHECKPOINT_BRICK_ID)!, 220, 32)
      s.addCopy(s.addCatalogBrick(SPIKY_BRICK_ID)!, 700, 300)
    })
    expect(kindOfEdit(designOf(ben), add)).toBe('build')
    expect(send(ben, add)).toBe(true)
    await net.run(1000, all)
    expect(ben.rejected).toBe(0)
    for (const s of all) {
      expect(s.runtime!.world.targets.some((t) => t.brickId === CHECKPOINT_BRICK_ID)).toBe(true)
      expect(s.runtime!.world.targets.some((t) => t.brickId === SPIKY_BRICK_ID)).toBe(true)
    }
    expect(designText(designOf(cy))).toBe(core.project)

    // Cy turns the platform's speed slider (building), then, with code, changes its code (restarts only it).
    const tune = editFrom(cy, (s) => s.setBrickSlider(PLATFORM_BRICK_ID, `${PLATFORM_BRICK_ID}_speed`, 3))
    expect(kindOfEdit(designOf(cy), tune)).toBe('build')
    send(cy, tune)
    await net.run(800, all)
    expect(cy.rejected).toBe(0)
    for (const s of all) expect(s.runtime!.world.targets.find((t) => t.brickId === PLATFORM_BRICK_ID)!.variables[`${PLATFORM_BRICK_ID}_speed`]).toBe(3)
    ana.setRoles({ code: true })
    await net.run(400, all)
    // The blocks came from the room (Cy may code now); one script fewer is a code change.
    cy.askWorkspace(PLATFORM_BRICK_ID)
    await net.run(300, all)
    const recode = editFrom(cy, (s) => {
      const ws = structuredClone(s.getState().project.workspaces[PLATFORM_BRICK_ID]) as { blocks: { blocks: unknown[] } }
      ws.blocks.blocks = ws.blocks.blocks.slice(0, -1)
      s.setWorkspace(PLATFORM_BRICK_ID, ws)
    })
    expect(kindOfEdit(designOf(cy), recode)).toBe('code')
    send(cy, recode)
    await net.run(1000, all)
    expect(cy.rejected).toBe(0)
    expect(ben.view.notice).toMatch(/Cy changed Moving platform’s code\. Its scripts started again\./)

    await net.run(3000, all)
    const prints = agree(all)
    expect(prints[0]).not.toBeNull()
    expect(new Set(prints).size).toBe(1)
    expect(all.map((s) => s.stats.resyncs)).toEqual([0, 0, 0])
  })
})
