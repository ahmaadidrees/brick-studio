import { describe, expect, it } from 'vitest'
import { applyRoomEvent, designOfText, freshGame, gameFromBase } from '../../rooms/game'
import { checkProject } from '../../rooms/roomCore'
import { designText } from '../../core/save'
import { worldToJson } from '../../core/snapshot'
import { costumeFromImage, imageFromRows } from '../pixels'
import { StudioStore } from '../store'
import { createBlankProject } from './blankProject'
import { giveJob } from './jobs'
import { readScore } from './blankRules'

const square = () => costumeFromImage('c', imageFromRows(Array.from({ length: 16 }, () => '#'.repeat(16)), { '#': '#34c77b' }))

function blankGame(player = true) {
  const store = new StudioStore(createBlankProject())
  const zip = store.addBrick('Zip', square())
  const star = store.addBrick('Star', square())
  store.setBrush(null)
  store.addCopy(zip, 40, 40)
  store.addCopy(star, 200, 200)
  if (player) giveJob(store, zip, 'player', 'walk')
  giveJob(store, star, 'collect')
  // The room reads the project from its text, as every browser in it does.
  return { design: designOfText(designText(store.getState().project.design)), zip, star }
}

describe('Start from nothing: Play together (rooms M1, before lane E)', () => {
  it('each friend gets a copy of the stored player brick, and their keys move only their own', () => {
    const { design, zip } = blankGame()
    let runtime = freshGame(design, 0)
    runtime = applyRoomEvent(runtime, { t: 'join', num: 1, name: 'Ana' }, 0) ?? runtime
    runtime = applyRoomEvent(runtime, { t: 'join', num: 2, name: 'Ben' }, 0) ?? runtime
    const zips = runtime.world.targets.filter((t) => t.brickId === zip && !t.isClone)
    expect(zips.map((t) => t.player)).toEqual([1, 2])
    const [ana, ben] = zips
    const benStart = { x: ben.x, y: ben.y }
    applyRoomEvent(runtime, { t: 'key', key: 'right arrow', down: true }, 1)
    for (let i = 0; i < 10; i++) runtime.step()
    expect(ana.x).toBeGreaterThan(40)
    expect({ x: ben.x, y: ben.y }).toEqual(benStart)
  })

  it('the team score is one Score; a friend joining from a keyframe sees the same game', () => {
    const { design, zip } = blankGame()
    const runtime = freshGame(design, 0)
    applyRoomEvent(runtime, { t: 'join', num: 1, name: 'Ana' }, 0)
    applyRoomEvent(runtime, { t: 'key', key: 'right arrow', down: true }, 1)
    applyRoomEvent(runtime, { t: 'key', key: 'up arrow', down: true }, 1)
    for (let i = 0; i < 80; i++) runtime.step()
    expect(readScore(runtime, design)).toBe(1)
    const copy = gameFromBase({ project: designText(design), tick: runtime.world.tick, world: worldToJson(runtime.world) } as never)
    expect(readScore(copy, design)).toBe(1)
    expect(copy.world.player).toBe(zip)
  })

  it('the room (and its Worker) accepts the project as a blank game', () => {
    const { design } = blankGame()
    expect(checkProject(designText(design))).toEqual({ ok: true, kit: 'blank' })
    expect(checkProject(designText(design), 'platformer')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('a game with no player yet still opens a room: friends join and watch', () => {
    const { design } = blankGame(false)
    const runtime = freshGame(design, 0)
    expect(() => {
      applyRoomEvent(runtime, { t: 'join', num: 1, name: 'Ana' }, 0)
      for (let i = 0; i < 10; i++) runtime.step()
    }).not.toThrow()
    expect(runtime.world.players?.map((p) => p.num)).toEqual([1])
  })
})
