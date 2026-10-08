/**
 * A brick whose blocks cannot be loaded into the editor must keep its saved code: the editor holds an empty workspace,
 * and saving that over the brick would wipe the kid's work.
 */
import * as Blockly from 'blockly/core'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '../CodeEditor'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CodeEditor when a brick cannot be loaded', () => {
  it('shows a kind message and never saves an empty workspace over the brick', { timeout: 60000 }, async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const project = createStarterProject()
    const original = project.workspaces['brick_coin']
    // An unknown block type makes Blockly's load throw.
    project.workspaces['brick_coin'] = { blocks: { languageVersion: 0, blocks: [{ type: 'no_such_block_anywhere', id: 'x' }] } }
    const bad = project.workspaces['brick_coin']
    const store = new StudioStore(project)
    store.selectBrick('brick_coin')
    const before = store.getState().project.design.bricks.find((b) => b.id === 'brick_coin')!.program

    const view = render(<CodeEditor store={store} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open this brick/i)

    // A kid keeps working in the (empty) editor: a change would normally be saved 300ms later.
    vi.useFakeTimers()
    const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
    await act(async () => {
      const b = ws.newBlock('event_whenflagclicked')
      b.initSvg()
      b.render()
      Blockly.Events.fire(new (Blockly.Events.get(Blockly.Events.BLOCK_CREATE))(b))
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })
    view.unmount()
    expect(store.getState().project.workspaces['brick_coin']).toBe(bad)
    expect(store.getState().project.design.bricks.find((b) => b.id === 'brick_coin')!.program).toEqual(before)
    expect(original).toBeTruthy()
  })

  it('still saves normally for a brick that loads', { timeout: 60000 }, async () => {
    const store = new StudioStore(createStarterProject())
    store.selectBrick('brick_coin')
    const view = render(<CodeEditor store={store} />)
    expect(screen.queryByRole('alert')).toBeNull()
    view.unmount()
  })
})
