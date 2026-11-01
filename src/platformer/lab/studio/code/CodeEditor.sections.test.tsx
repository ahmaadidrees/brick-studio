import * as Blockly from 'blockly/core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '../CodeEditor'
import { heroMovementLabels } from '../hero/heroBrick'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { getLabel, isScriptOff } from './affordances'

afterEach(cleanup)

const HERO = 'brick_hero'
type SavedTop = { id: string; x?: number; y?: number; type: string }

async function openHero(docked = true) {
  const store = new StudioStore(createStarterProject())
  store.openCode(HERO)
  const view = render(<CodeEditor store={store} docked={docked} />)
  await act(async () => { await Blockly.renderManagement.finishQueuedRenders() })
  const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
  return { store, ws, view }
}

const isMovement = (b: Blockly.Block) => heroMovementLabels().has(getLabel(b))
const shownIds = (ws: Blockly.WorkspaceSvg) => ws.getTopBlocks(false).filter((b) => b.getSvgRoot().style.display !== 'none').map((b) => b.id)

/** A new top-level hat, as dropping one from the palette makes. */
function addScript(ws: Blockly.WorkspaceSvg, type = 'platformer_everytick'): Blockly.BlockSvg {
  let block!: Blockly.BlockSvg
  act(() => {
    block = ws.newBlock(type)
    block.initSvg()
    block.render()
    ws.fireChangeListener(new (Blockly.Events.get(Blockly.Events.BLOCK_CREATE))(block))
  })
  return block
}

describe('the Hero\'s code: movement folded into "How I move"', () => {
  it('opens on the receivers and one "How I move" entry, which opens with a breadcrumb and Back', async () => {
    const { ws } = await openHero()
    const movement = ws.getTopBlocks(false).filter(isMovement)
    expect(movement.length).toBe(heroMovementLabels().size)

    const entry = screen.getByRole('button', { name: /How I move/ })
    expect(entry).toHaveTextContent(`How I move · ${movement.length} scripts`)
    expect(entry).toHaveTextContent('Show how it works')
    const top = shownIds(ws).map((id) => ws.getBlockById(id)!.type)
    expect(top).toEqual(['event_whenflagclicked', ...Array(4).fill('event_whenbroadcastreceived')])

    fireEvent.click(entry)
    const trail = screen.getByRole('navigation', { name: 'Where you are' })
    expect(within(trail).getByRole('button', { name: "Hero's scripts" })).toBeInTheDocument()
    expect(within(trail).getByText('How I move')).toHaveAttribute('aria-current', 'page')
    expect(shownIds(ws).sort()).toEqual(movement.map((b) => b.id).sort())

    fireEvent.click(within(trail).getByRole('button', { name: /Back/ }))
    expect(screen.queryByRole('navigation', { name: 'Where you are' })).toBeNull()
    expect(shownIds(ws).map((id) => ws.getBlockById(id)!.type)).toEqual(top)
  }, 60000)

  it('keeps every script editable in the section: its On/Off switch turns it off', async () => {
    const { ws } = await openHero()
    fireEvent.click(screen.getByRole('button', { name: /How I move/ }))
    const gravity = ws.getTopBlocks(false).find((b) => getLabel(b) === 'Gravity: pull me down every tick')!
    const toggle = gravity.getSvgRoot().querySelector('.code-script-switch')!
    expect(toggle).toBeTruthy()
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(isScriptOff(gravity)).toBe(true)
  }, 60000)

  it('a diagnostic on a block inside a folded script opens "How I move" first', async () => {
    const { store, ws } = await openHero()
    const jump = ws.getTopBlocks(false).find((b) => getLabel(b) === "Jump: space jumps when I'm on the ground")!
    const inner = jump.getDescendants(false)[3]
    const select = vi.spyOn(inner, 'select')
    act(() => {
      ;(store as unknown as { set(patch: object): void }).set({ diagnostics: { [HERO]: [{ message: 'Check this block', severity: 'warning', blockId: inner.id }] } })
    })
    fireEvent.click(screen.getByRole('button', { name: /Check this block/ }))
    expect(screen.getByRole('navigation', { name: 'Where you are' })).toHaveTextContent('How I move')
    expect(shownIds(ws)).toContain(jump.id)
    expect(select).toHaveBeenCalled()
  }, 60000)

  it('a kid\'s script dropped on the top view stays on top; one made inside the section stays in it', async () => {
    const { ws } = await openHero()
    const count = heroMovementLabels().size
    const onTop = addScript(ws)
    expect(shownIds(ws)).toContain(onTop.id)
    expect(screen.getByRole('button', { name: /How I move/ })).toHaveTextContent(`${count} scripts`)

    fireEvent.click(screen.getByRole('button', { name: /How I move/ }))
    expect(shownIds(ws)).not.toContain(onTop.id)
    const inside = addScript(ws, 'platformer_whenbump')
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(shownIds(ws)).toContain(onTop.id)
    expect(shownIds(ws)).not.toContain(inside.id)
    expect(screen.getByRole('button', { name: /How I move/ })).toHaveTextContent(`${count + 1} scripts`)
  }, 60000)

  it('changes nothing it saves: the same blocks, order and places as without the fold', async () => {
    const saved = async (visit: boolean) => {
      const { store, ws, view } = await openHero()
      if (visit) {
        fireEvent.click(screen.getByRole('button', { name: /How I move/ }))
        fireEvent.click(screen.getByRole('button', { name: /Back/ }))
        fireEvent.click(screen.getByRole('button', { name: /How I move/ }))
      }
      // An edit that saves (flushed when the editor closes).
      await act(async () => {
        ws.getVariableMap().createVariable('kid var', '', 'kid_var')
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
      view.unmount()
      return (store.getState().project.workspaces[HERO] as { blocks: { blocks: SavedTop[] } }).blocks.blocks
    }
    const plain = await saved(false)
    const visited = await saved(true)
    expect(visited.map((b) => `${b.id}:${b.type}@${b.x},${b.y}`)).toEqual(plain.map((b) => `${b.id}:${b.type}@${b.x},${b.y}`))
  }, 180000)

  it('other bricks show no section entry', async () => {
    const store = new StudioStore(createStarterProject())
    store.openCode('brick_walker')
    render(<CodeEditor store={store} docked />)
    await act(async () => { await Blockly.renderManagement.finishQueuedRenders() })
    expect(screen.queryByRole('button', { name: /How I move/ })).toBeNull()
  }, 60000)
})
