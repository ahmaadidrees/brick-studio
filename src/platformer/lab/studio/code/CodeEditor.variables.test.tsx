import * as Blockly from 'blockly/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CodeEditor } from '../CodeEditor'
import { createStarterProject } from '../starter'
import { STAGE_ID, StudioStore } from '../store'

afterEach(cleanup)

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

async function openStage() {
  const store = new StudioStore(createStarterProject())
  store.openCode(STAGE_ID)
  render(<CodeEditor store={store} docked />)
  await act(async () => { await Blockly.renderManagement.finishQueuedRenders() })
  const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
  const setBlock = ws.getAllBlocks(false).find((b) => b.type === 'data_setvariableto')!
  return { store, ws, setBlock }
}
const optionNames = (block: Blockly.Block) => (block.getField('VARIABLE') as Blockly.FieldDropdown).getOptions(false).map((o) => o[0])

describe('variables in the Code tab', () => {
  it('a typed name shows in the menus at once, and a used name is refused kindly', async () => {
    const { ws, setBlock } = await openStage()
    act(() => ws.getButtonCallback('MAKE_A_VARIABLE')!({} as Blockly.FlyoutButton))
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Coins' } })
    expect(document.querySelector('.code-name-problem')).toHaveTextContent('There’s already a variable called “Coins”')
    expect(screen.getByRole('button', { name: 'Create Variable' })).toBeDisabled()
    fireEvent.change(name, { target: { value: 'lives' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Variable' }))
    expect(optionNames(setBlock)).toEqual(['coins', 'lives', 'Rename variable', 'Delete the "coins" variable'])
  }, 60000)

  it('Rename from the variable menu renames it everywhere it shows, and the block keeps its variable', async () => {
    const { store, setBlock } = await openStage()
    const id = setBlock.getFieldValue('VARIABLE')
    act(() => { setBlock.getField('VARIABLE')!.setValue('__rename_variable__') })
    await tick()
    expect(setBlock.getFieldValue('VARIABLE')).toBe(id)
    const input = screen.getByLabelText('New name') as HTMLInputElement
    expect(input.value).toBe('coins')
    fireEvent.change(input, { target: { value: 'gems' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(setBlock.getField('VARIABLE')!.getText()).toBe('gems')
    expect(store.brick(STAGE_ID)!.program.variables.map((v) => v.name)).toEqual(['gems'])
  }, 60000)

  it('Delete asks when blocks use the variable, and refuses while other bricks still use it', async () => {
    const { setBlock } = await openStage()
    act(() => { setBlock.getField('VARIABLE')!.setValue('__delete_variable__') })
    await tick()
    // The ? block counts coins too.
    expect(screen.getByRole('dialog')).toHaveTextContent('Take it out of their code first')
  }, 60000)
})
