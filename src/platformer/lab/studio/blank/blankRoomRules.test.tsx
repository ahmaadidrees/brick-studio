/**
 * Start from nothing in a room follows M2's per-player rules (wave 2 integration, fix b; owner decision 2026-11-04,
 * each room player is on their own): a Hurts job sends back only the friend who touched it, a Goal job finishes only
 * that friend, the round ends when everyone has finished, and the Score stays one team Score.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntime, type Runtime } from '../../core'
import type { Target } from '../../core/contracts'
import { bricksOf } from '../../core/project'
import { worldFingerprint, worldFromJson, worldToJson } from '../../core/snapshot'
import { designOfText } from '../../rooms/game'
import { designText } from '../../core/save'
import { aboutMyHero } from '../builder/playRules'
import { costumeFromImage, imageFromRows } from '../pixels'
import { StudioStore } from '../store'
import { roomGame, TestRoom } from '../testRoom'
import { BlankHud } from './BlankHud'
import { createBlankProject } from './blankProject'
import { BORROWABLE, borrowedBrick } from './borrow'
import { giveJob } from './jobs'
import { HURT_MESSAGE, readScore, WIN_MESSAGE } from './blankRules'

afterEach(cleanup)

const square = (colour: string) => costumeFromImage('c', imageFromRows(Array.from({ length: 16 }, () => '#'.repeat(16)), { '#': colour }))
const run = (rt: Runtime, ticks: number) => { for (let i = 0; i < ticks; i++) rt.step() }

/** Zip (Player · walks around) at 40,40; Spike (Hurts) at 200,40; Flag (Goal) at 300,200; Star (Collect) at 100,200. */
function blankRoom(names = ['Ana', 'Ben', 'Cy']) {
  const store = new StudioStore(createBlankProject())
  const zip = store.addBrick('Zip', square('#34c77b'))
  const spike = store.addBrick('Spike', square('#5b6676'))
  const flag = store.addBrick('Flag', square('#e5484d'))
  const star = store.addBrick('Star', square('#f5b301'))
  const walker = store.addBrickFrom(borrowedBrick(store.getState().project.design, BORROWABLE.find((b) => b.id === 'walker')!).brick, borrowedBrick(store.getState().project.design, BORROWABLE.find((b) => b.id === 'walker')!).workspace)
  store.setBrush(null)
  store.addCopy(zip, 40, 40)
  store.addCopy(spike, 200, 40)
  store.addCopy(flag, 300, 200)
  store.addCopy(star, 100, 200)
  store.addCopy(walker, 400, 300)
  giveJob(store, zip, 'player', 'walk')
  giveJob(store, spike, 'hurts')
  giveJob(store, flag, 'goal')
  giveJob(store, star, 'collect')
  const design = designOfText(designText(store.getState().project.design))
  const rt = roomGame(design, names)
  run(rt, 5)
  const zips = [1, 2, 3].slice(0, names.length).map((n) => rt.world.targets.find((t) => t.brickId === zip && t.player === n && !t.isClone)!)
  const at = (brickId: string) => rt.world.targets.find((t) => t.brickId === brickId && !t.isClone)!
  return { rt, design, zips, spike: at(spike), flag: at(flag), star: at(star), walker: at(walker) }
}

const moveTo = (t: Target, to: Target) => { t.x = to.x; t.y = to.y }

describe('Start from nothing in a room: each friend is on their own', () => {
  it('a Hurts job sends back only the friend who touched it', () => {
    const { rt, zips, spike } = blankRoom()
    const heard: Array<{ m: string; about?: readonly number[] }> = []
    rt.onBroadcast((m, _from, about) => heard.push({ m: m.trim().toLowerCase(), about }))
    const benStart = { x: zips[1]!.x, y: zips[1]!.y }
    // Ana and Cy walk away from the start; Ben walks into the Spike.
    zips[0]!.x = 120
    zips[2]!.x = 140
    moveTo(zips[1]!, spike)
    run(rt, 3)
    const hurt = heard.find((h) => h.m === HURT_MESSAGE)!
    expect(hurt.about).toEqual([2])
    expect({ x: zips[1]!.x, y: zips[1]!.y }).toEqual(benStart)
    expect(zips[0]!.x).toBe(120)
    expect(zips[2]!.x).toBe(140)
    // Each screen's "Ouch!" is Ben's only.
    expect([1, 2, 3].map((me) => aboutMyHero(rt.world, spike, me, hurt.about))).toEqual([false, true, false])
  })

  it('a borrowed Walker (aimed at "the player") hurts only the friend it touches', () => {
    const { rt, zips, walker } = blankRoom()
    zips[0]!.x = 120
    let about: readonly number[] | undefined
    rt.onBroadcast((m, _from, a) => { if (m.trim().toLowerCase() === HURT_MESSAGE) about ??= a })
    moveTo(zips[2]!, walker)
    run(rt, 3)
    expect(about).toEqual([3])
    expect(zips[0]!.x).toBe(120)
  })

  it('a Goal job finishes only the friend who reached it; the round ends when everyone has', () => {
    const { rt, zips, flag } = blankRoom()
    const won: Array<readonly number[] | undefined> = []
    rt.onBroadcast((m, _from, about) => { if (m.trim().toLowerCase() === WIN_MESSAGE) won.push(about) })
    moveTo(zips[0]!, flag)
    run(rt, 3)
    const slot = (n: number) => rt.world.players!.find((p) => p.num === n)!
    expect(slot(1).finished).toBeGreaterThan(0)
    expect(slot(2).finished).toBeUndefined()
    expect(won).toEqual([[1]])
    // The game goes on: Ben still moves; Ana sits out.
    expect(rt.world.everyTick).toBe(true)
    const benX = zips[1]!.x
    const anaAt = { x: zips[0]!.x, y: zips[0]!.y }
    rt.pressKey('right arrow', 2)
    rt.pressKey('left arrow', 1)
    run(rt, 15)
    expect(zips[1]!.x).toBeGreaterThan(benX)
    expect({ x: zips[0]!.x, y: zips[0]!.y }).toEqual(anaAt)
    rt.releaseKey('right arrow', 2)
    for (const n of [2, 3]) {
      moveTo(zips[n - 1]!, flag)
      run(rt, 3)
    }
    expect(rt.world.players!.every((p) => p.finished !== undefined)).toBe(true)
    expect(rt.world.everyTick).toBe(false)
  })

  it('the Score stays one team Score: whoever collects, everyone sees it', () => {
    const { rt, design, zips, star } = blankRoom()
    moveTo(zips[1]!, star)
    run(rt, 3)
    expect(readScore(rt, design)).toBe(1)
    expect(star.visible).toBe(false)
  })

  it('solo, a Hurts job and a Goal job work as before (no one in particular)', () => {
    const { design } = blankRoom()
    const rt = createRuntime(design)
    rt.world.design = design
    rt.greenFlag()
    const heard: Array<{ m: string; about?: readonly number[] }> = []
    rt.onBroadcast((m, _from, about) => heard.push({ m: m.trim().toLowerCase(), about }))
    const zip = rt.world.targets.find((t) => t.brickId === design.player)!
    const flag = rt.world.targets.find((t) => t.brickId !== design.player && t.brickId === design.bricks.find((b) => b.name === 'Flag')!.id)!
    moveTo(zip, flag)
    run(rt, 3)
    expect(heard.find((h) => h.m === WIN_MESSAGE)).toEqual({ m: WIN_MESSAGE, about: undefined })
    expect(rt.world.everyTick).toBe(false)
  })

  it('two games given the same events agree, through a keyframe, after a hurt and a finish', () => {
    const play = () => {
      const { rt, zips, spike, flag } = blankRoom()
      moveTo(zips[1]!, spike)
      moveTo(zips[0]!, flag)
      run(rt, 2)
      return rt
    }
    const a = play()
    const b = play()
    expect(worldFingerprint(a.world)).toBe(worldFingerprint(b.world))
    const design = a.world.design!
    const c = createRuntime(design)
    c.restoreWorld(worldFromJson(worldToJson(a.world), bricksOf(design), design))
    for (const rt of [a, c]) {
      rt.pressKey('up arrow', 3)
      run(rt, 40)
    }
    expect(worldFingerprint(c.world)).toBe(worldFingerprint(a.world))
  })
})

describe('Start from nothing in a room: the screens', () => {
  it('Ana sees only her own "Ouch!"; Ben\'s finish is a notice; her own card waits for the host', async () => {
    const { rt, design, zips, spike, flag } = blankRoom(['Ana', 'Ben'])
    const store = new StudioStore({ design, workspaces: {} })
    const testRoom = new TestRoom(rt, 1)
    testRoom.host = false
    store.enterRoom(testRoom)
    store.play()
    render(<BlankHud store={store} />)
    // Ben touches the Spike: not Ana's Ouch.
    moveTo(zips[1]!, spike)
    act(() => run(rt, 3))
    expect(screen.queryByText('Ouch! Back to the start.')).toBeNull()
    // Ben reaches the Flag: a notice for Ana, no card.
    moveTo(zips[1]!, flag)
    act(() => run(rt, 3))
    expect(await screen.findByText(/^Ben finished, 0:0\d\.\d$/)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'You win' })).toBeNull()
    // Ana touches the Spike: her Ouch.
    moveTo(zips[0]!, spike)
    act(() => run(rt, 3))
    expect(screen.getByText('Ouch! Back to the start.')).toBeTruthy()
    // Ana reaches the Flag: her card, everyone has finished, and only the host starts again.
    moveTo(zips[0]!, flag)
    act(() => run(rt, 3))
    await screen.findByRole('dialog', { name: 'You win' })
    expect(await screen.findByText(/Everyone has finished\. The host starts the next round\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull()
  })

  it('solo, Play again and Keep building are on the card as before', () => {
    const { design } = blankRoom()
    const store = new StudioStore({ design, workspaces: {} })
    store.play()
    render(<BlankHud store={store} />)
    const rt = store.getState().runtime!
    const zip = rt.world.targets.find((t) => t.brickId === design.player)!
    moveTo(zip, rt.world.targets.find((t) => t.brickId === design.bricks.find((b) => b.name === 'Flag')!.id)!)
    act(() => run(rt, 3))
    expect(screen.getByRole('dialog', { name: 'You win' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keep building' })).toBeTruthy()
  })
})
