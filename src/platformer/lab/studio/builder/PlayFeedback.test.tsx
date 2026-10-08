import { act, cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntime } from '../../core/index'
import type { Expr, Stmt } from '../../core/contracts'
import { createStarterProject, STARTER_GOAL } from '../starter'
import { StudioStore } from '../store'
import { Builder } from './Builder'
import { checkLevelForPlay, COINS_VARIABLE, COURSE_CLEAR, HERO_HURT, NO_GOAL_NOTE, NO_HERO_MESSAGE, readCoins } from './playRules'

afterEach(cleanup)

const startPlay = (store: StudioStore) => fireEvent.click(screen.getByRole('radio', { name: /Play/ }))

describe('Play feedback in the builder (like /2d/build)', () => {
  it('shows the controls hint and a coin counter when Play starts, and the counter follows the Stage\'s "coins"', async () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    startPlay(store)
    expect(store.getState().mode).toBe('play')
    const hint = screen.getByText(/Space jumps/)
    expect(hint.textContent).toMatch(/move/)
    expect(hint.textContent).toMatch(/hold X to run/)
    expect(hint.textContent).not.toMatch(/Shift/) // the Hero runs on X (heroBrick.ts "read keys")
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
    render(<Builder store={store} templates={[]} />)
    startPlay(store)
    expect(screen.queryByRole('status', { name: /Coins/ })).toBeNull()
    expect(screen.getByText(/Space jumps/)).toBeTruthy()
  })

  it('"Try again" when the Hero is hurt (hero hurt broadcast), and it goes away by itself', async () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    startPlay(store)
    expect(screen.queryByText(/Try again/)).toBeNull()
    act(() => {
      store.getState().runtime!.broadcast(HERO_HURT)
    })
    expect(screen.getByText(/Ouch! Back to the start. Try again!/)).toBeTruthy()
    await waitForElementToBeRemoved(() => screen.queryByText(/Ouch/), { timeout: 3000 })
  })

  it('"You made it!" when the Goal says course clear, with Play again and Keep building', () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
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
    render(<Builder store={store} templates={[]} />)
    startPlay(store)
    expect(store.getState().mode).toBe('build')
    expect(screen.getByText(NO_HERO_MESSAGE)).toBeTruthy()
  })

  it('Play with no Goal plays, and the hint says there is nowhere to finish', () => {
    const store = new StudioStore(createStarterProject())
    const goal = store.getState().project.design.copies.find((c) => c.brickId === 'brick_goal')!
    store.deleteCopy(goal.id)
    render(<Builder store={store} templates={[]} />)
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
