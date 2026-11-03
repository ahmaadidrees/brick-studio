/**
 * A power is checked in full (core/contentRules.ts) wherever it comes in: a file, My powers, the class shelf (again,
 * whatever the Worker checked), and once more as it snaps on. One holding a block this version does not have, or for
 * another game, never snaps on, and the kid reads why.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { PowersBar } from '../screen/PowersBar'
import { keepPower, MY_POWERS_KEY, myPowers, resetPowerCache } from './library'
import { builtInPowers, powerProblem, powerToFile, readPowerFile, readPowerPayload, type PowerBrick } from './powers'

afterEach(() => { cleanup(); localStorage.removeItem(MY_POWERS_KEY); resetPowerCache() })

const dash = () => builtInPowers().find((p) => p.id === 'dash')!
/** Dash, with one block somewhere inside it that this version does not have. */
function withUnknownBlock(): PowerBrick {
  const p = structuredClone(dash())
  p.blocks[0] = { ...p.blocks[0], next: { block: { type: 'hack_teleport', id: 'zz' } } } as never
  return p
}
const UNKNOWN = 'That power uses blocks that aren’t part of Brickgineers, so it can’t snap on.'

describe('reading a power', () => {
  it('a good file reads back as the same power', () => {
    expect(readPowerFile(powerToFile(dash()))).toEqual({ ok: true, power: dash() })
  })

  it('says why a file cannot snap on', () => {
    expect(readPowerFile('not json')).toEqual({ ok: false, message: 'That file isn’t a power. Power files end in .power.json.' })
    expect(readPowerFile(powerToFile(withUnknownBlock()))).toEqual({ ok: false, message: UNKNOWN })
    expect(readPowerFile(JSON.stringify({ ...dash(), game: 'kart' }))).toEqual({ ok: false, message: 'That power is for a game this version of Brickgineers doesn’t know yet.' })
    expect(readPowerPayload({ ...dash(), game: 'platformer' }).ok).toBe(true)
  })

  it('the store will not snap one on, however it got there', () => {
    const store = new StudioStore(createStarterProject())
    expect(powerProblem(withUnknownBlock())).toBe(UNKNOWN)
    expect(store.snapPower('brick_hero', withUnknownBlock())).toBeNull()
    expect(store.brick('brick_hero')!.powers ?? []).toEqual([])
    expect(store.snapPower('brick_hero', dash())).not.toBeNull()
  })

  it('My powers does not list one, but never throws it away when another is kept', () => {
    const bad = JSON.parse(powerToFile(withUnknownBlock()))
    localStorage.setItem(MY_POWERS_KEY, JSON.stringify([bad]))
    resetPowerCache()
    expect(myPowers()).toEqual([])
    keepPower(dash())
    expect(JSON.parse(localStorage.getItem(MY_POWERS_KEY)!)).toEqual([JSON.parse(powerToFile(dash())), bad])
  })
})

describe('in "+ Power"', () => {
  const openPicker = (props: Partial<Parameters<typeof PowersBar>[0]> = {}) => {
    const store = new StudioStore(createStarterProject())
    render(<PowersBar store={store} brick={store.brick('brick_hero')!} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    return { store, panel: screen.getByRole('dialog', { name: 'Snap a power onto Hero' }) }
  }

  it('opening a power file with an unknown block says so and keeps it out of My powers', async () => {
    const { panel } = openPicker()
    const input = panel.querySelector('input[type="file"]') as HTMLInputElement
    const text = powerToFile(withUnknownBlock())
    const file = { name: 'teleport.power.json', text: async () => text }
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
    expect(within(panel).getByRole('status').textContent).toBe(UNKNOWN)
    expect(myPowers()).toEqual([])
  })

  it('a class shelf power with an unknown block is checked again here and refused, and not counted as used', async () => {
    const classId = '33333333-3333-4333-8333-000000000001'
    const session = { status: 'student', classes: [{ id: classId }], displayName: 'Ana K.', signOut: async () => {}, switchAccount: async () => {} } as never
    const item = { id: 'i1', kind: 'power', name: 'Teleport', what: 'Zap!', by: 'Sam R.', mine: false, status: 'approved', uses: 0, createdAt: '' }
    const calls: string[] = []
    const api = {
      list: async () => ({ items: [item], needsReview: true, raceHeroes: 'shelf' }),
      get: async () => { calls.push('get'); return { ...item, payload: withUnknownBlock() } },
      used: async () => { calls.push('used'); return { uses: 1 } },
    } as never
    const { store, panel } = openPicker({ shelfApi: api, session })
    const pick = await screen.findByRole('button', { name: /Teleport/ })
    await act(async () => { fireEvent.click(pick) })
    expect(within(panel).getByRole('alert').textContent).toBe(UNKNOWN)
    expect(calls).toEqual(['get'])
    expect(store.brick('brick_hero')!.powers ?? []).toEqual([])
  })
})
