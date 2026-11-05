/**
 * Borrowed kit bricks react to the game's player (wave 2 integration, fix a). A kit brick's code names the player
 * "Hero"; a game from nothing names it by id (LevelDesign.player), so Borrow points the brick's menus at "the player"
 * (core/contracts.ts PLAYER_MENU). Kit games keep "Hero" and behave exactly as before.
 */
import { describe, expect, it } from 'vitest'
import { createRuntime } from '../../core'
import { PLAYER_MENU, type LevelDesign } from '../../core/contracts'
import { worldFingerprint } from '../../core/snapshot'
import { validateDesign } from '../../core/project'
import { costumeFromImage, imageFromRows } from '../pixels'
import { createStarterProject } from '../starter'
import { createRaceStarterProject } from '../race/raceProject'
import { PLATFORMER_EXTRAS, RACE_EXTRAS } from '../builtins/extras'
import { StudioStore } from '../store'
import { exportProjectJson, importProjectJson } from '../persist/projectIo'
import { createBlankProject } from './blankProject'
import { BORROWABLE, aimAtThePlayer, borrowedBrick } from './borrow'
import { giveJob } from './jobs'
import { HURT_MESSAGE, WIN_MESSAGE } from './blankRules'

const square = (colour: string) => costumeFromImage('c', imageFromRows(Array.from({ length: 16 }, () => '#'.repeat(16)), { '#': colour }))

/** Every menu value naming a brick, anywhere in a program or workspace. */
function namedBricks(code: unknown, out: string[] = []): string[] {
  if (Array.isArray(code)) code.forEach((c) => namedBricks(c, out))
  else if (code && typeof code === 'object' && !ArrayBuffer.isView(code)) {
    for (const [key, value] of Object.entries(code)) {
      if (key === 'fields' && value && typeof value === 'object') {
        for (const [field, v] of Object.entries(value)) if (['TOUCHINGOBJECTMENU', 'OBJECT', 'DISTANCETOMENU', 'BRICK', 'TO', 'TOWARDS'].includes(field) && typeof v === 'string') out.push(v)
      } else namedBricks(value, out)
    }
  }
  return out
}

/** A game from nothing with Zip (Player · walks around) at 40,40, and a borrowed brick. */
function zipAnd(itemId: string) {
  const store = new StudioStore(createBlankProject())
  const zip = store.addBrick('Zip', square('#34c77b'))
  store.setBrush(null)
  store.addCopy(zip, 40, 40)
  giveJob(store, zip, 'player', 'walk')
  const item = BORROWABLE.find((b) => b.id === itemId)!
  const made = borrowedBrick(store.getState().project.design, item)
  const id = store.addBrickFrom(made.brick, made.workspace)
  store.setBrush(null)
  return { store, zip, id, brick: () => store.getState().project.design.bricks.find((b) => b.id === id)! }
}

function play(store: StudioStore) {
  const runtime = createRuntime(store.getState().project.design)
  const said: string[] = []
  runtime.onBroadcast((message) => said.push(message.trim().toLowerCase()))
  runtime.greenFlag()
  return { runtime, said }
}

describe('Borrowed bricks react to the player, not to a brick named Hero', () => {
  it('Borrow points every borrowed brick that named the Hero at "the player"; the Hero and Car keep their code', () => {
    const { design } = createBlankProject()
    let aimed = 0
    for (const item of BORROWABLE) {
      const raw = item.make()
      const made = borrowedBrick(design, item)
      const before = namedBricks([raw.brick.program, raw.workspace])
      const after = namedBricks([made.brick.program, made.workspace])
      if (item.player) {
        expect(after, item.id).toEqual(before)
        continue
      }
      expect(after, item.id).not.toContain('Hero')
      if (before.includes('Hero')) {
        aimed++
        expect(after, item.id).toContain(PLAYER_MENU)
      }
    }
    // Walker, Coin, Spring, Goal, Spikes, Checkpoint, Spiky, Flyer, Shellbug.
    expect(aimed).toBeGreaterThanOrEqual(9)
  })

  it('a Walker touching Zip sends Zip back to the start (hero hurt)', () => {
    const { store, zip, id } = zipAnd('walker')
    store.addCopy(id, 40, 40)
    expect(validateDesign(store.getState().project.design)).toEqual([])
    const { runtime, said } = play(store)
    for (let i = 0; i < 5; i++) runtime.step()
    expect(said).toContain(HURT_MESSAGE)
    expect(runtime.world.targets.find((t) => t.brickId === zip)!.x).toBe(40)
  })

  it('a Coin vanishes when Zip touches it, and not before', () => {
    const { store, id } = zipAnd('coin')
    const far = store.addCopy(id, 300, 200)
    const near = store.addCopy(id, 48, 40)
    const { runtime } = play(store)
    for (let i = 0; i < 5; i++) runtime.step()
    const copy = (copyId: string) => runtime.world.targets.find((t) => t.copyId === copyId || t.id === copyId)!
    expect(copy(near).visible).toBe(false)
    expect(copy(far).visible).toBe(true)
  })

  it('the Goal finishes the game when Zip reaches it', () => {
    const { store, id } = zipAnd('goal')
    store.addCopy(id, 44, 40)
    const { runtime, said } = play(store)
    for (let i = 0; i < 5; i++) runtime.step()
    expect(said).toContain(WIN_MESSAGE)
  })

  it('Spikes hurt Zip when Zip bumps them ("when I bump [any side] of [the player]")', () => {
    const { store, id, brick } = zipAnd('spikes')
    // A column of Spikes cells just right of Zip; Zip walks into it.
    for (let row = 0; row < 22; row++) store.setTile(5, row, brick().grid!.char)
    const { runtime, said } = play(store)
    runtime.pressKey('right arrow')
    for (let i = 0; i < 40; i++) runtime.step()
    expect(said).toContain(HURT_MESSAGE)
    expect(id).toBeTruthy()
  })

  it('Parity B: Spiky hurts Zip, a Checkpoint says checkpoint for Zip, a Flyer and a Shellbug hurt or get stomped by Zip', () => {
    for (const [item, word] of [['spiky', HURT_MESSAGE], ['checkpoint', 'checkpoint'], ['flyer', HURT_MESSAGE], ['shellbug', HURT_MESSAGE]] as const) {
      const { store, id } = zipAnd(item)
      store.addCopy(id, 40, 40)
      expect(validateDesign(store.getState().project.design), item).toEqual([])
      const { runtime, said } = play(store)
      for (let i = 0; i < 10; i++) runtime.step()
      expect(said, item).toContain(word)
    }
  })

  it('the same Walker with the kit\'s own code (naming "Hero") never sees Zip: the rewrite is what makes it react', () => {
    const { store, id: _borrowed } = zipAnd('coin')
    const kit = BORROWABLE.find((b) => b.id === 'walker')!.make()
    const id = store.addBrickFrom({ ...kit.brick, name: 'Kit walker' }, kit.workspace)
    store.setBrush(null)
    expect(namedBricks(store.getState().project.design.bricks.find((b) => b.id === id)!.program)).toContain('Hero')
    store.addCopy(id, 40, 40)
    const { runtime, said } = play(store)
    for (let i = 0; i < 5; i++) runtime.step()
    expect(said).not.toContain(HURT_MESSAGE)
  })

  it('"the player" follows the game: no player means it names nothing; choosing another player moves it', () => {
    const { store, zip, id } = zipAnd('walker')
    const bob = store.addBrick('Bob', square('#4a90d9'))
    store.setBrush(null)
    store.addCopy(bob, 200, 40)
    store.addCopy(id, 200, 40)
    let { runtime, said } = play(store)
    for (let i = 0; i < 5; i++) runtime.step()
    expect(said).not.toContain(HURT_MESSAGE) // Zip is the player, and far away
    giveJob(store, bob, 'player', 'walk')
    expect(store.getState().project.design.player).toBe(bob)
    ;({ runtime, said } = play(store))
    for (let i = 0; i < 5; i++) runtime.step()
    expect(said).toContain(HURT_MESSAGE)
    expect(zip).not.toBe(bob)
  })
})

describe('Kit games are unchanged', () => {
  it('the Platformer starter still names "Hero" and has no player; "the player" names nothing there', () => {
    const project = createStarterProject()
    expect(project.design.player).toBeUndefined()
    const names = namedBricks(project.design.bricks.map((b) => b.program))
    expect(names).toContain('Hero')
    expect(names).not.toContain(PLAYER_MENU)
    const runtime = createRuntime(project.design)
    expect(runtime.findOriginal(PLAYER_MENU)).toBeUndefined()
  })

  it('kit games play to the same fingerprints as before this change (Platformer and Racing, with Parity B\'s bricks)', () => {
    // Every 60th tick of 360, computed on the integration tree before "the player" existed (fce5b428).
    const GOLDEN = {
      platformer: [1439889706, 3722416426, 3406303018, 2901430058, 2096037162, 1044751018],
      platformerExtras: [3221610830, 3406086478, 3763996750, 3721364558, 328366926, 509345102],
      race: [3107029303, 926244603, 1940723253, 451896442, 1112758513, 201516213],
      raceExtras: [391826708, 2504220359, 2759707606, 3131963365, 1067312272, 2046420059],
    }
    const prints = (design: LevelDesign, keys: string[]) => {
      const rt = createRuntime(design)
      rt.greenFlag()
      for (const k of keys) rt.pressKey(k)
      const out: number[] = []
      for (let i = 1; i <= 360; i++) {
        rt.step()
        if (i % 60 === 0) out.push(worldFingerprint(rt.world))
      }
      return out
    }
    const extras = new StudioStore(createStarterProject())
    let x = 120
    for (const e of PLATFORMER_EXTRAS) {
      const id = extras.addCatalogBrick(e.id)
      if (id) extras.addCopy(id, (x += 40), 60)
    }
    const track = new StudioStore(createRaceStarterProject())
    for (const e of RACE_EXTRAS) track.addCatalogBrick(e.id)
    expect({
      platformer: prints(createStarterProject().design, ['right arrow', 'space']),
      platformerExtras: prints(extras.getState().project.design, ['right arrow']),
      race: prints(createRaceStarterProject().design, ['up arrow']),
      raceExtras: prints(track.getState().project.design, ['up arrow', 'left arrow']),
    }).toEqual(GOLDEN)
  })

  it('aimAtThePlayer touches only menus that name the Hero, never broadcasts or other text', () => {
    const code = { fields: { TOUCHINGOBJECTMENU: 'Hero', BROADCAST_OPTION: 'Hero', TEXT: 'Hero' }, inputs: { MESSAGE: { kind: 'lit', value: 'Hero' } } }
    expect(aimAtThePlayer(code)).toEqual({ fields: { TOUCHINGOBJECTMENU: PLAYER_MENU, BROADCAST_OPTION: 'Hero', TEXT: 'Hero' }, inputs: { MESSAGE: { kind: 'lit', value: 'Hero' } } })
  })
})

describe('Borrowing the same kind of brick twice', () => {
  it('a second Walker, a Car twice, or a Walker and a Spiky still save and open again (each brick has ids of its own)', () => {
    const store = new StudioStore(createBlankProject())
    for (const id of ['walker', 'walker', 'spiky', 'flyer', 'shellbug', 'car', 'car', 'racer', 'checkpoint', 'checkpoint']) {
      const item = BORROWABLE.find((b) => b.id === id)!
      const made = borrowedBrick(store.getState().project.design, item)
      if (item.needs) store.ensureStageData(item.needs.variables ?? [], item.needs.lists ?? [])
      store.addBrickFrom(made.brick, made.workspace)
    }
    const design = store.getState().project.design
    expect(validateDesign(design)).toEqual([])
    const reopened = importProjectJson(exportProjectJson(store.getState().project), 'blank')
    expect(reopened.ok).toBe(true)
    // The second Walker's blocks and program agree on its own speed slider.
    const walkers = design.bricks.filter((b) => b.name.startsWith('Walker'))
    expect(walkers).toHaveLength(2)
    const [a, b] = walkers.map((w) => w.program.variables.find((v) => v.name === 'speed')!.id)
    expect(a).not.toBe(b)
    const second = walkers[1]!
    expect(JSON.stringify(store.getState().project.workspaces[second.id])).toContain(JSON.stringify(b))
    expect(JSON.stringify(store.getState().project.workspaces[second.id])).not.toContain(JSON.stringify(a))
  })
})
