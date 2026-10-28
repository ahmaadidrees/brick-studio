import * as Blockly from 'blockly/core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '../CodeEditor'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'

afterEach(cleanup)

describe('focused docked code editor', () => {
  it('keeps an unused definition reachable from My Blocks with a breadcrumb back', async () => {
    const store = new StudioStore(createStarterProject())
    store.openCode('brick_coin')
    render(<CodeEditor store={store} docked />)
    await act(async () => { await Blockly.renderManagement.finishQueuedRenders() })
    const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
    act(() => {
      // There is deliberately no call to this definition in any script.
      Blockly.serialization.blocks.append({ type: 'procedures_definition', extraState: { proccode: 'secret dance', argumentNames: [], warp: false } }, ws)
    })
    expect(screen.queryByRole('navigation', { name: 'My Blocks' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Variable' })).toBeNull()
    expect(screen.queryByText(/Code changes apply on Restart/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Undo code' })).toBeInTheDocument()

    const items = ws.getToolboxCategoryCallback('PROCEDURE')!(ws) as unknown as Array<Record<string, unknown>>
    expect(items.some((item) => item.callbackKey === 'MAKE_A_PROCEDURE')).toBe(true)
    const openDefinition = items.find((item) => item.text === 'See inside secret dance')!
    expect(openDefinition).toBeTruthy()
    act(() => ws.getButtonCallback(openDefinition.callbackKey as string)!({} as Blockly.FlyoutButton))
    const trail = screen.getByRole('navigation', { name: 'Where you are' })
    expect(trail).toHaveTextContent('secret dance')
    fireEvent.click(within(trail).getByRole('button', { name: /Back/ }))
    expect(screen.queryByRole('navigation', { name: 'Where you are' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'My Blocks' })).toBeNull()
  }, 60000)

  it('keeps view actions in a dismissible overflow and invokes Blockly undo', async () => {
    const store = new StudioStore(createStarterProject())
    store.openCode('brick_coin')
    render(<CodeEditor store={store} docked />)
    await act(async () => { await Blockly.renderManagement.finishQueuedRenders() })
    const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
    const undo = vi.spyOn(ws, 'undo')
    const tidy = vi.spyOn(ws, 'cleanUp')
    act(() => {
      const block = ws.newBlock('event_whenflagclicked')
      block.initSvg()
      block.render()
      ws.fireChangeListener(new (Blockly.Events.get(Blockly.Events.BLOCK_CREATE))(block))
    })
    expect(screen.getByRole('button', { name: 'Undo code' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo code' }))
    expect(undo).toHaveBeenCalledWith(false)

    const summary = screen.getByLabelText('Code view options')
    const menu = summary.closest('details')!
    expect(menu.open).toBe(false)
    fireEvent.click(summary)
    expect(menu.open).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Tidy blocks' }))
    expect(tidy).toHaveBeenCalledTimes(1)
    expect(menu.open).toBe(false)
    fireEvent.click(summary)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Center code' }), { key: 'Escape' })
    expect(menu.open).toBe(false)
    expect(summary).toHaveFocus()
  }, 60000)
})
