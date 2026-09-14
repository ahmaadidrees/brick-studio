import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog, Sheet } from './Sheet'

afterEach(cleanup)

function Harness({ onCloseOuter, onCloseInner }: { onCloseOuter?: () => void; onCloseInner?: () => void }) {
  const [outer, setOuter] = useState(false)
  const [inner, setInner] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOuter(true)}>Open settings</button>
      <Sheet open={outer} onClose={() => { setOuter(false); onCloseOuter?.() }} title="Settings" description="Make the controls feel right." footer={<button type="button">Done</button>}>
        <input aria-label="World name" />
        <button type="button" onClick={() => setInner(true)}>Open confirm</button>
      </Sheet>
      <Dialog open={inner} onClose={() => { setInner(false); onCloseInner?.() }} title="Open this build?">
        <button type="button">Cancel</button>
      </Dialog>
    </>
  )
}

describe('Sheet', () => {
  it('renders nothing when closed and a labelled modal dialog when open', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Make the controls feel right.')
    expect(dialog).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(dialog.querySelector('.ui-sheet-footer')).toHaveTextContent('Done')
  })

  it('closes on the close button and restores focus to the opener', () => {
    const onClose = vi.fn()
    render(<Harness onCloseOuter={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open settings' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('closes only the topmost dialog on Escape, in the capture phase', () => {
    const outerClose = vi.fn()
    const innerClose = vi.fn()
    const bubbled = vi.fn()
    window.addEventListener('keydown', bubbled)
    render(<Harness onCloseOuter={outerClose} onCloseInner={innerClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open confirm' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Open this build?' }), { key: 'Escape' })
    expect(innerClose).toHaveBeenCalledTimes(1)
    expect(outerClose).not.toHaveBeenCalled()
    expect(bubbled).not.toHaveBeenCalled() // stopped before the global builder shortcuts
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Settings' }), { key: 'Escape' })
    expect(outerClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    window.removeEventListener('keydown', bubbled)
  })

  it('closes on backdrop press but not when non-dismissible', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Sheet open onClose={onClose} title="Confirm"><p>Body</p></Sheet>)
    fireEvent.pointerDown(document.querySelector('.ui-sheet-backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(<Sheet open onClose={onClose} title="Confirm" dismissible={false}><p>Body</p></Sheet>)
    fireEvent.pointerDown(document.querySelector('.ui-sheet-backdrop')!)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cycles Tab within the dialog', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    const close = screen.getByRole('button', { name: 'Close' })
    const done = screen.getByRole('button', { name: 'Done' })
    // Shift+Tab from the panel itself wraps to the last control.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(done).toHaveFocus()
    // Tab from the last control wraps to the first.
    fireEvent.keyDown(done, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(done).toHaveFocus()
  })

  it('focuses the requested element on open', () => {
    function WithInitialFocus() {
      const [ref, setRef] = useState<HTMLInputElement | null>(null)
      return <Sheet open onClose={() => {}} title="Rename" initialFocusRef={{ current: ref }}><input ref={setRef} aria-label="World name" /></Sheet>
    }
    render(<WithInitialFocus />)
    // The ref resolves after the first commit; re-render through state so the effect sees it.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('uses the dialog stacking token', () => {
    render(<Sheet open onClose={() => {}} title="Layered"><p>Body</p></Sheet>)
    expect(document.querySelector('.ui-sheet-root')).toHaveClass('ui-sheet-sheet')
    render(<Dialog open onClose={() => {}} title="Centered"><p>Body</p></Dialog>)
    expect(document.querySelectorAll('.ui-sheet-dialog')).toHaveLength(1)
  })
})
