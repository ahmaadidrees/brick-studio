import { act, cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntime } from '../../core/index'
import type { Expr, Stmt } from '../../core/contracts'
import { createStarterProject, STARTER_GOAL } from '../starter'
import { builtInPowers } from '../powers/powers'
import { StudioStore } from '../store'
import { StudioShell } from '../screen/StudioShell'
import { roomGame, TestRoom } from '../testRoom'
import { PlayFeedback } from './PlayFeedback'
import { aboutMyHero, checkLevelForPlay, COINS_VARIABLE, COURSE_CLEAR, HERO_HURT, HERO_OUCH, NO_GOAL_NOTE, NO_HERO_MESSAGE, readCoins, saysOuch } from './playRules'
import { HERO_OUCH as HERO_SAYS } from '../hero/heroBrick'
import beforePits from '../hero/__fixtures__/hero-before-pits.json'

afterEach(cleanup)

const startPlay = (store: StudioStore) => fireEvent.click(screen.getByRole('radio', { name: /Play/ }))

describe('Play feedback in the builder (like /2d/build)', () => {
  it('shows the controls hint and a coin counter when Play starts, and the counter follows the Stage\'s "coins"', async () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    startPlay(store)
    expect(store.getState().mode).toBe('play')
    const hint = screen.getByText(/Space, X or K jumps/)
    expect(hint.textContent).toMatch(/move/)
    expect(hint.textContent).toMatch(/hold Z, J or Shift to run/)
    expect(screen.getByRole('status', { name: 'Coins: 0' })).toBeTruthy()
    // a Coin was collected: the Stage's variable changes, the counter follows
    const runtime = store.getState().runtime!
    const decl = store.getState().project.design.stage.program.variables.find((v) => v.name === 'coins')!
    act(() => {
      runtime.step() // the Stage's "no coins yet" script has run
      runtime.world.stage.variables[decl.id] = 3
    })
    expect(await screen.findByRole('status', { name: 'Coins: 3' })).toBeTruthy()
  })

  it('has no coin counter when the level has no "coins" variable', () => {
    const project = createStarterProject()
    project.design.stage.program.variables = []
    const store = new StudioStore(project)
    render(<StudioShell store={store} />)
    startPlay(store)
    expect(screen.queryByRole('status', { name: /Coins/ })).toBeNull()
    expect(screen.getByText(/Space, X or K jumps/)).toBeTruthy()
  })

  it('"Try again" when the Hero says ouch (it really got hurt, not while it blinks safe), and it goes away by itself', async () => {
    expect(HERO_OUCH).toBe(HERO_SAYS)
    const store = new StudioStore(createStarterProject())
    expect(saysOuch(store.getState().project.design)).toBe(true)
    render(<StudioShell store={store} />)
    startPlay(store)
    expect(screen.queryByText(/Try again/)).toBeNull()
    // "hero hurt" alone may be ignored (the Hero blinks, safe): the Hero says ouch when it is hurt.
    act(() => {
      store.getState().runtime!.broadcast(HERO_HURT)
    })
    expect(screen.queryByText(/Try again/)).toBeNull()
    act(() => {
      store.getState().runtime!.broadcast(HERO_OUCH)
    })
    expect(screen.getByText(/Ouch! Back to the start. Try again!/)).toBeTruthy()
    await waitForElementToBeRemoved(() => screen.queryByText(/Ouch/), { timeout: 3000 })
  })

  it('a Hero from before that never says ouch: "Try again" on hero hurt, as before', () => {
    const project = createStarterProject()
    project.design.bricks.find((b) => b.id === 'brick_hero')!.program = structuredClone(beforePits.program) as never
    project.workspaces.brick_hero = structuredClone(beforePits.workspace)
    const store = new StudioStore(project)
    expect(saysOuch(store.getState().project.design)).toBe(false)
    render(<StudioShell store={store} />)
    startPlay(store)
    act(() => {
      store.getState().runtime!.broadcast(HERO_HURT)
    })
    expect(screen.getByText(/Ouch! Back to the start. Try again!/)).toBeTruthy()
  })

  it('"You made it!" when the Goal says course clear, with Play again and Keep building', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    startPlay(store)
    const first = store.getState().runtime!
    act(() => {
      first.broadcast(COURSE_CLEAR)
    })
    const dialog = screen.getByRole('dialog', { name: 'You made it' })
    expect(dialog.textContent).toMatch(/You made it!/)
    fireEvent.click(screen.getByRole('button', { name: /Play again/ }))
    expect(store.getState().mode).toBe('play')
    expect(store.getState().runtime).not.toBe(first) // a fresh run
    expect(screen.queryByRole('dialog', { name: 'You made it' })).toBeNull()
    act(() => {
      store.getState().runtime!.broadcast('Course Clear') // Scratch broadcasts ignore case
    })
    fireEvent.click(screen.getByRole('button', { name: /Keep building/ }))
    expect(store.getState().mode).toBe('build')
    expect(screen.queryByRole('dialog', { name: 'You made it' })).toBeNull()
  })

  it('Play with no Hero stays in Build and says what to do', () => {
    const store = new StudioStore(createStarterProject())
    store.deleteCopy('copy_hero')
    render(<StudioShell store={store} />)
    startPlay(store)
    expect(store.getState().mode).toBe('build')
    expect(screen.getByText(NO_HERO_MESSAGE)).toBeTruthy()
  })

  it('names a snapped power\'s own key in the hint (Dash: C)', () => {
    const store = new StudioStore(createStarterProject())
    store.snapPower('brick_hero', builtInPowers().find((p) => p.id === 'dash')!)
    render(<StudioShell store={store} />)
    startPlay(store)
    expect(screen.getByText(/Space, X or K jumps/).textContent).toMatch(/hold Z, J or Shift to run · C for Dash/)
  })

  it('Play with no Goal plays, and the hint says there is nowhere to finish', () => {
    const store = new StudioStore(createStarterProject())
    const goal = store.getState().project.design.copies.find((c) => c.brickId === 'brick_goal')!
    store.deleteCopy(goal.id)
    render(<StudioShell store={store} />)
    startPlay(store)
    expect(store.getState().mode).toBe('play')
    expect(screen.getByText(NO_GOAL_NOTE)).toBeTruthy()
  })
})

describe('the words the builder listens for are the ones the bricks use', () => {
  const messages = (stmts: Stmt[], out: Set<string>) => {
    const expr = (e: Expr) => {
      if (e.kind === 'lit' && typeof e.value === 'string') out.add(e.value)
      if (e.kind === 'block') Object.values(e.inputs).forEach(expr)
    }
    for (const s of stmts) {
      if (s.opcode === 'event_broadcast') Object.values(s.inputs).forEach(expr)
      s.branches?.forEach((b) => messages(b, out))
    }
  }
  const sent = (brickId: string) => {
    const brick = createStarterProject().design.bricks.find((b) => b.id === brickId)!
    const out = new Set<string>()
    for (const sc of brick.program.scripts) messages(sc.body, out)
    for (const p of brick.program.procedures) messages(p.body, out)
    return out
  }

  it('the Goal broadcasts course clear; Walker and Spikes broadcast hero hurt; the Stage counts "coins"', () => {
    expect(sent('brick_goal')).toContain(COURSE_CLEAR)
    expect(sent('brick_walker')).toContain(HERO_HURT)
    expect(sent('brick_spikes')).toContain(HERO_HURT)
    const design = createStarterProject().design
    expect(design.stage.program.variables.map((v) => v.name)).toContain(COINS_VARIABLE)
  })

  it('in the real engine, a Hero standing on the Goal makes the Goal broadcast course clear (observed, no engine rule)', () => {
    const design = createStarterProject().design
    const hero = design.copies.find((c) => c.id === 'copy_hero')!
    hero.x = STARTER_GOAL.x
    hero.y = STARTER_GOAL.y
    const runtime = createRuntime(design)
    const heard: string[] = []
    runtime.onBroadcast((m) => heard.push(m))
    runtime.greenFlag()
    for (let i = 0; i < 20 && !heard.includes(COURSE_CLEAR); i++) runtime.step()
    expect(heard).toContain(COURSE_CLEAR)
    expect(readCoins(runtime, design)).toBe(0)
  })

  it('in the real engine, a Walker on the Hero makes the Hero hurt (hero hurt)', () => {
    const design = createStarterProject().design
    const hero = design.copies.find((c) => c.id === 'copy_hero')!
    const walker = design.copies.find((c) => c.brickId === 'brick_walker')!
    walker.x = hero.x
    walker.y = hero.y + 4
    const runtime = createRuntime(design)
    const heard: string[] = []
    runtime.onBroadcast((m) => heard.push(m))
    runtime.greenFlag()
    for (let i = 0; i < 30 && !heard.includes(HERO_HURT); i++) runtime.step()
    expect(heard).toContain(HERO_HURT)
  })

  it('checkLevelForPlay finds the Hero and the Goal by name', () => {
    const design = createStarterProject().design
    expect(checkLevelForPlay(design)).toEqual({ hero: true, goal: true })
    const bare = { ...design, copies: design.copies.filter((c) => c.brickId !== 'brick_hero' && c.brickId !== 'brick_goal') }
    expect(checkLevelForPlay(bare)).toEqual({ hero: false, goal: false })
  })
})

describe('the time (parity bucket A, 2026-11-03)', () => {
  it('formats like the classic timer, and keeps a best time per level for as long as the page is open', async () => {
    const { bestTime, formatPlayTime, recordClear } = await import('./playRules')
    expect(formatPlayTime(0)).toBe('0:00.0')
    expect(formatPlayTime(30 * 75.25)).toBe('1:15.3')
    // Its own level id: other tests here clear the starter level too.
    const design = { ...createStarterProject().design, id: 'best_time_test' }
    const other = { ...design, copies: design.copies.map((c) => (c.id === 'copy_goal' ? { ...c, x: c.x - 16 } : c)) }
    expect(bestTime(design)).toBeNull()
    expect(recordClear(design, 600)).toBe(false)
    expect(recordClear(design, 700)).toBe(false)
    expect(bestTime(design)).toBe(600)
    expect(recordClear(design, 500)).toBe(true)
    expect(bestTime(design)).toBe(500)
    expect(bestTime(other)).toBeNull()
  })

  it('shows the time while playing, and the time and best on "You made it!"', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    startPlay(store)
    expect(screen.getByRole('timer').textContent).toMatch(/0:00\.0/)
    const runtime = store.getState().runtime!
    for (let i = 0; i < 90; i++) runtime.step()
    act(() => {
      runtime.broadcast(COURSE_CLEAR)
    })
    const dialog = screen.getByRole('dialog', { name: 'You made it' })
    expect(dialog.textContent).toMatch(/Time 0:03\.0/)
  })

  it('in a room the time counts from the play\'s start, and the host\'s Play again forgets the last finish', () => {
    const project = createStarterProject()
    project.design.id = 'room_time_test'
    const store = new StudioStore(project)
    // The room's clock was already at 300 when this play started.
    const room = new TestRoom(roomGame(project.design, ['Maya'], 300))
    store.enterRoom(room)
    store.play()
    render(<PlayFeedback store={store} />)
    for (let i = 0; i < 60; i++) room.game.step()
    act(() => {
      room.game.broadcast(COURSE_CLEAR)
    })
    expect(screen.getByRole('dialog', { name: 'You made it' }).textContent).toMatch(/Time 0:02\.0/)

    // Play again rebuilds the game under the same screen: the card goes, and the new game is still heard.
    room.rebuild(roomGame(project.design, ['Maya'], 1000))
    act(() => {
      room.game.broadcast('boing')
    })
    expect(screen.queryByRole('dialog', { name: 'You made it' })).toBeNull()
    for (let i = 0; i < 30; i++) room.game.step()
    act(() => {
      room.game.broadcast(COURSE_CLEAR)
    })
    expect(screen.getByRole('dialog', { name: 'You made it' }).textContent).toMatch(/Time 0:01\.0/)
  })
})

describe('in a room, each screen shows its own Hero\'s feedback', () => {
  /** Maya (1) and Sam (2) in the starter level; the Goal, and a Hero moved onto it. */
  function room() {
    const project = createStarterProject()
    const game = roomGame(project.design, ['Maya', 'Sam'])
    game.step()
    const world = game.world
    const hero = (num: number) => world.targets.find((t) => t.player === num && !t.isClone)!
    const goal = world.targets.find((t) => t.brickId === 'brick_goal' && !t.isClone)!
    const onGoal = (num: number) => Object.assign(hero(num), { x: goal.x, y: goal.y })
    return { project, game, world, hero, goal, onGoal }
  }

  it('a Hero\'s own words are its player\'s; the Goal\'s are about the Hero touching it; outside a room, everyone\'s', () => {
    const { world, hero, goal, onGoal } = room()
    expect(aboutMyHero(world, hero(1), 1)).toBe(true)
    expect(aboutMyHero(world, hero(2), 1)).toBe(false)
    // Nobody at the Goal (a kid's own "course clear"): everyone's.
    expect(aboutMyHero(world, goal, 1)).toBe(true)
    onGoal(2)
    expect(aboutMyHero(world, goal, 1)).toBe(false)
    expect(aboutMyHero(world, goal, 2)).toBe(true)
    // Not in a room, or the screen's own broadcast.
    expect(aboutMyHero(world, hero(2), 0)).toBe(true)
    expect(aboutMyHero(world, undefined, 1)).toBe(true)
  })

  it('"Try again" for our Hero\'s ouch only, and "You made it!" only when our Hero reaches the Goal', () => {
    const { project, game, hero, goal, onGoal } = room()
    const store = new StudioStore(project)
    store.enterRoom(new TestRoom(game, 1))
    store.play()
    render(<PlayFeedback store={store} />)
    act(() => {
      game.broadcast(HERO_OUCH, hero(2))
    })
    expect(screen.queryByText(/Try again/)).toBeNull()
    act(() => {
      game.broadcast(HERO_OUCH, hero(1))
    })
    expect(screen.getByText(/Ouch! Back to the start. Try again!/)).toBeTruthy()

    onGoal(2)
    act(() => {
      game.broadcast(COURSE_CLEAR, goal)
    })
    expect(screen.queryByRole('dialog', { name: 'You made it' })).toBeNull()
    onGoal(1)
    act(() => {
      game.broadcast(COURSE_CLEAR, goal)
    })
    expect(screen.getByRole('dialog', { name: 'You made it' })).toBeTruthy()
  })
})
