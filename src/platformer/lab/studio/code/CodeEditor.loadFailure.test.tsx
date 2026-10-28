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
  it('restoring the original reloads the same brick and discards its pending editor save', { timeout: 60000 }, async () => {
    const store = new StudioStore(createStarterProject())
    store.selectBrick('brick_coin')
    const original = structuredClone(store.brick('brick_coin')!.program)
    const view = render(<CodeEditor store={store} />)
    const oldWorkspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
    vi.useFakeTimers()
    await act(async () => {
      const block = oldWorkspace.newBlock('event_whenflagclicked')
      block.initSvg()
      block.render()
      Blockly.Events.fire(new (Blockly.Events.get(Blockly.Events.BLOCK_CREATE))(block))
      vi.advanceTimersByTime(50)
      await Promise.resolve()
    })
    act(() => store.resetBrickOriginal('brick_coin'))
    expect(Blockly.getMainWorkspace()).not.toBe(oldWorkspace)
    await act(async () => { vi.advanceTimersByTime(1000); await Promise.resolve() })
    view.unmount()
    expect(store.brick('brick_coin')!.program).toEqual(original)
  })

  it('Restart flushes a fresh block edit before the 300ms autosave delay', { timeout: 60000 }, async () => {
    const store = new StudioStore(createStarterProject())
    store.openCode('brick_coin')
    const view = render(<CodeEditor store={store} docked />)
    const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
    const previousRuntime = store.getState().runtime
    await act(async () => { await Blockly.renderManagement.finishQueuedRenders(); await Promise.resolve() })
    vi.useFakeTimers()
    let hatId = ''
    await act(async () => {
      Blockly.Events.disable()
      try {
        const hat = ws.newBlock('event_whenflagclicked')
        const move = ws.newBlock('motion_setx')
        const position = ws.newBlock('math_number')
        position.setFieldValue(321, 'NUM')
        move.getInput('X')!.connection!.connect(position.outputConnection!)
        hat.nextConnection!.connect(move.previousConnection!)
        for (const block of [hat, move, position]) { block.initSvg(); block.render() }
        hat.moveBy(1000, 2000)
        hatId = hat.id
      } finally { Blockly.Events.enable() }
      // Deliver the exact change directly, leaving the editor's 300ms save pending.
      ws.fireChangeListener(new (Blockly.Events.get(Blockly.Events.BLOCK_CREATE))(ws.getBlockById(hatId)!))
      vi.advanceTimersByTime(50)
      await Promise.resolve()
    })
    expect(store.brick('brick_coin')!.program.scripts.some((script) => script.id === hatId)).toBe(false)
    act(() => store.restartPreview())
    const runtime = store.getState().runtime!
    expect(runtime).not.toBe(previousRuntime)
    expect(runtime.world.bricks.brick_coin.program.scripts.some((script) => script.id === hatId)).toBe(true)
    act(() => runtime.step())
    expect(runtime.world.targets.find((target) => target.brickId === 'brick_coin')!.x).toBe(321)
    view.unmount()
  })

})
