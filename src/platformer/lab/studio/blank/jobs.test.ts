import { describe, expect, it } from 'vitest'
import { createRuntime } from '../../core'
import { validateDesign } from '../../core/project'
import { costumeFromImage, imageFromRows } from '../pixels'
import { StudioStore } from '../store'
import { powerProblem } from '../powers/powers'
import { checkPowerPayload } from '../../core/contentRules'
import { createBlankProject } from './blankProject'
import { giveJob, jobPower, jobSnaps } from './jobs'
import { JOB_IDS, PLAYER_WAYS, readScore, SCORE_ID, WIN_MESSAGE, HURT_MESSAGE } from './blankRules'

const square = (colour: string) => costumeFromImage('c', imageFromRows(Array.from({ length: 16 }, () => '#'.repeat(16)), { '#': colour }))

function game() {
  const store = new StudioStore(createBlankProject())
  const zip = store.addBrick('Zip', square('#34c77b'))
  const star = store.addBrick('Star', square('#f5b301'))
  const flag = store.addBrick('Flag', square('#e5484d'))
  const spike = store.addBrick('Spike', square('#5b6676'))
  const wall = store.addBrick('Wall', square('#c9743a'))
  store.setGridChar(wall, 'W')
  store.setBrush(null)
  return { store, zip, star, flag, spike, wall }
}

const run = (store: StudioStore) => {
  const runtime = createRuntime(store.getState().project.design)
  runtime.greenFlag()
  return runtime
}
const targetOf = (runtime: ReturnType<typeof run>, brickId: string) => runtime.world.targets.find((t) => t.brickId === brickId && !t.isClone)!

describe('Start from nothing: the six jobs are built-in powers', () => {
  it('every job and every way of moving passes the same checks as a shared power, for the blank game only', () => {
    for (const job of JOB_IDS) for (const way of job === 'player' ? PLAYER_WAYS : (['walk'] as const)) {
      const power = jobPower(job, way)
      expect(power.game).toBe('blank')
      expect(power.credits).toEqual(['Brickgineers'])
      expect(powerProblem(power), `${job} ${way}`).toBeNull()
      expect(checkPowerPayload(power).ok).toBe(true)
    }
  })

  it('Player · walks around: the arrow keys move it, a Wall stops it, and it is the player', () => {
    const { store, zip, wall } = game()
    store.addCopy(zip, 40, 40)
    // A wall column at x 96..112.
    for (let row = 0; row < 22; row++) store.setTile(6, row, 'W')
    expect(giveJob(store, zip, 'player', 'walk')).not.toBeNull()
    giveJob(store, wall, 'wall')
    const design = store.getState().project.design
    expect(design.player).toBe(zip)
    expect(validateDesign(design)).toEqual([])
    expect(store.getState().diagnostics[zip] ?? []).toEqual([])
    // Its speed is a slider.
    expect(design.bricks.find((b) => b.id === zip)!.program.variables.filter((v) => v.showInBuild).map((v) => v.name)).toEqual(['speed'])
    const runtime = run(store)
    runtime.pressKey('right arrow')
    for (let i = 0; i < 60; i++) runtime.step()
    const me = targetOf(runtime, zip)
    expect(me.x).toBeGreaterThan(60)
    // Stopped flush against the wall's left side (x 96), half its 16-step width short.
    expect(me.x).toBeLessThanOrEqual(88.01)
    runtime.releaseKey('right arrow')
    runtime.pressKey('up arrow')
    for (let i = 0; i < 10; i++) runtime.step()
    expect(targetOf(runtime, zip).y).toBeGreaterThan(60)
  })

  it('Collect adds its points to the one Score and vanishes; Goal says You win!; Hurts sends the player back', () => {
    const { store, zip, star, flag, spike } = game()
    store.addCopy(zip, 40, 40)
    store.addCopy(star, 80, 40)
    store.addCopy(spike, 100, 140)
    store.addCopy(flag, 200, 40)
    giveJob(store, zip, 'player', 'walk')
    giveJob(store, star, 'collect')
    giveJob(store, spike, 'hurts')
    giveJob(store, flag, 'goal')
    const design = store.getState().project.design
    expect(design.stage.program.variables.map((v) => [v.id, v.name])).toEqual([[SCORE_ID, 'Score']])
    // Points is a slider; make this Star worth 5.
    const points = design.bricks.find((b) => b.id === star)!.program.variables.find((v) => v.name === 'points')!
    store.setBrickSlider(star, points.id, 5)
    const runtime = run(store)
    const heard: string[] = []
    runtime.onBroadcast((m) => { heard.push(m) })
    expect(readScore(runtime, store.getState().project.design)).toBe(0)
    runtime.pressKey('right arrow')
    for (let i = 0; i < 20; i++) runtime.step()
    expect(readScore(runtime, store.getState().project.design)).toBe(5)
    expect(targetOf(runtime, star).visible).toBe(false)
    runtime.releaseKey('right arrow')
    // Up to the Spike: hurt, back to the start.
    runtime.pressKey('up arrow')
    for (let i = 0; i < 40 && !heard.includes(HURT_MESSAGE); i++) runtime.step()
    expect(heard).toContain(HURT_MESSAGE)
    runtime.releaseKey('up arrow')
    runtime.step()
    expect(targetOf(runtime, zip).y).toBe(40)
    expect(targetOf(runtime, zip).x).toBe(40)
    // Along to the Flag: You win.
    runtime.pressKey('right arrow')
    for (let i = 0; i < 80 && !heard.includes(WIN_MESSAGE); i++) runtime.step()
    expect(heard).toContain(WIN_MESSAGE)
  })

  it('Falls drops onto a Wall', () => {
    const { store, star, wall } = game()
    store.addCopy(star, 40, 200)
    for (let col = 0; col < 30; col++) store.setTile(col, 2, 'W')
    giveJob(store, star, 'falls')
    giveJob(store, wall, 'wall')
    const runtime = run(store)
    for (let i = 0; i < 90; i++) runtime.step()
    // The wall row's top is y 48; the 16-step Star stands on it.
    expect(targetOf(runtime, star).y).toBeCloseTo(56, 0)
  })

  it('Runs and jumps and Drives move the brick with the arrow keys too', () => {
    for (const way of ['jump', 'drive'] as const) {
      const { store, zip } = game()
      store.addCopy(zip, 40, 40)
      giveJob(store, zip, 'player', way)
      expect(store.getState().diagnostics[zip] ?? [], way).toEqual([])
      const runtime = run(store)
      const before = { ...targetOf(runtime, zip) }
      runtime.pressKey(way === 'jump' ? 'right arrow' : 'up arrow')
      for (let i = 0; i < 45; i++) runtime.step()
      const after = targetOf(runtime, zip)
      expect(Math.hypot(after.x - before.x, after.y - before.y), way).toBeGreaterThan(10)
    }
  })

  it('a job switches off, comes off, and a new way of moving replaces the old one; the player goes with its job', () => {
    const { store, zip, star } = game()
    giveJob(store, zip, 'player', 'walk')
    giveJob(store, zip, 'player', 'drive')
    let brick = store.brick(zip)!
    expect(jobSnaps(brick).map((j) => j.snap.job)).toEqual(['player:drive'])
    const snap = jobSnaps(brick)[0].snap
    store.setPowerOn(zip, snap.id, false)
    expect(store.isPowerOn(zip, snap.id)).toBe(false)
    store.setPowerOn(zip, snap.id, true)
    // Giving another brick the Player job moves the player (an unchanged job comes off the old one).
    giveJob(store, star, 'player', 'walk')
    expect(store.getState().project.design.player).toBe(star)
    expect(jobSnaps(store.brick(zip)!)).toEqual([])
    store.takeOffPower(star, jobSnaps(store.brick(star)!)[0].snap.id)
    expect(store.getState().project.design.player).toBeUndefined()
    brick = store.brick(star)!
    expect(brick.program.scripts).toEqual([])
  })

  it('a Wall of tiles: jobs fit grid bricks', () => {
    const { store, wall } = game()
    expect(giveJob(store, wall, 'wall')).not.toBeNull()
    expect(jobSnaps(store.brick(wall)!).map((j) => j.job)).toEqual(['wall'])
  })
})
