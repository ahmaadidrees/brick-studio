import * as Blockly from 'blockly/core'
import { act, cleanup, render } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodePanel, type CodePanelHandle } from './CodePanel'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CodePanel pending edits', () => {
  it('flushes the edited workspace before a design can be forked', async () => {
    const ref = createRef<CodePanelHandle>()
    const onChange = vi.fn()
    render(<CodePanel ref={ref} brickId="walker" program={{ blocks: { languageVersion: 0, blocks: [] } }} options={() => [['Ball', 'ball']]} optionsKey="ball" diagnostics={[]} onChange={onChange} />)
    const ws = (window as unknown as { __labWorkspace: () => Blockly.WorkspaceSvg }).__labWorkspace()
    expect(ws).toBeTruthy()
    act(() => ref.current?.flush())
    expect(onChange).not.toHaveBeenCalled()
    vi.useFakeTimers()
    await act(async () => {
      ws.newBlock('lab_when_appear')
      await Promise.resolve()
    })
    expect(onChange).not.toHaveBeenCalled()
    act(() => ref.current?.flush())
    expect(onChange).toHaveBeenCalledOnce()
    const saved = onChange.mock.calls[0][1] as { blocks?: { blocks?: Array<{ type?: string }> } }
    expect(saved.blocks?.blocks?.[0]?.type).toBe('lab_when_appear')
    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledOnce()
  })
})
