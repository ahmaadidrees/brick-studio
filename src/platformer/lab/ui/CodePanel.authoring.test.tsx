import * as Blockly from 'blockly/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodePanel } from './CodePanel'

afterEach(cleanup)

const empty = { blocks: { languageVersion: 0, blocks: [] } }
const workspace = () => (window as unknown as { __labWorkspace: () => Blockly.WorkspaceSvg }).__labWorkspace()

describe('CodePanel authoring', () => {
  it('creates a named variable, saves its declaration, and restores its palette', () => {
    const onChange = vi.fn()
    const view = render(<CodePanel brickId="walker" program={empty} options={() => [['Ball', 'ball']]} optionsKey="ball" diagnostics={[]} onChange={onChange} />)
    act(() => workspace().getButtonCallback('LAB_MAKE_VARIABLE')?.({} as Blockly.FlyoutButton))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'score' } })
    fireEvent.click(screen.getByRole('button', { name: /Who can use it/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Keep this number for' }), { target: { value: 'world' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onChange).toHaveBeenCalledOnce()
    const saved = onChange.mock.calls[0][1] as { labVariables?: Array<{ name: string; scope: string }> }
    expect(saved.labVariables).toEqual([{ name: 'score', scope: 'world' }])
    view.unmount()

    render(<CodePanel brickId="walker" program={saved} options={() => [['Ball', 'ball']]} optionsKey="ball" diagnostics={[]} onChange={vi.fn()} />)
    const toolbox = workspace().getToolbox()?.getToolboxItems().find((item) => item.getId() === 'variables') as Blockly.ToolboxCategory | undefined
    const contents = toolbox?.getContents()
    expect(Array.isArray(contents) ? (contents as Array<{ kind: string; fields?: Record<string, unknown> }>).filter((item) => item.kind === 'block').map((item) => item.fields?.NAME) : []).toEqual(['score', 'score', 'score'])
  })

  it('creates a named definition and offers a matching call block', () => {
    const onChange = vi.fn()
    render(<CodePanel brickId="walker" program={empty} options={() => [['Ball', 'ball']]} optionsKey="ball" diagnostics={[]} onChange={onChange} />)
    act(() => workspace().getButtonCallback('LAB_MAKE_BLOCK')?.({} as Blockly.FlyoutButton))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'boost' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Input 1' }), { target: { value: 'power' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(workspace().getTopBlocks(false).find((block) => block.type === 'lab_define')?.getFieldValue('NAME')).toBe('boost')
    expect(onChange).toHaveBeenCalledOnce()
    const toolbox = workspace().getToolbox()?.getToolboxItems().find((item) => item.getId() === 'myBlocks') as Blockly.ToolboxCategory | undefined
    const contents = toolbox?.getContents()
    expect(Array.isArray(contents) ? (contents as Array<{ kind: string; type?: string; fields?: Record<string, unknown> }>).filter((item) => item.kind === 'block').map((item) => [item.type, item.fields?.NAME]) : []).toEqual([
      ['lab_call', 'boost'],
      ['lab_argument', 'power'],
    ])
  })

})
