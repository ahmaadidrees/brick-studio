import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeContentBoundary } from './contentBoundary'

function Flaky({ shouldThrow, renders }: { shouldThrow: boolean; renders: () => void }) {
  renders()
  if (shouldThrow) throw new Error('render failed')
  return <p>content</p>
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RuntimeContentBoundary', () => {
  it('swaps in the fallback, reports once, and does not re-enter the failing subtree', () => {
    const onError = vi.fn()
    const renders = vi.fn()
    const tree = (shouldThrow: boolean) => (
      <RuntimeContentBoundary fallback={<p>fallback</p>} resetKey="hero" onError={onError}>
        <Flaky shouldThrow={shouldThrow} renders={renders} />
      </RuntimeContentBoundary>
    )
    const view = render(tree(true))

    expect(screen.getByText('fallback')).toBeInTheDocument()
    expect(screen.queryByText('content')).toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)

    const attempts = renders.mock.calls.length
    view.rerender(tree(true))
    view.rerender(tree(false))
    expect(renders.mock.calls.length).toBe(attempts)
    expect(screen.getByText('fallback')).toBeInTheDocument()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('retries the content only when the reset key changes', () => {
    const renders = vi.fn()
    const tree = (resetKey: string, shouldThrow: boolean) => (
      <RuntimeContentBoundary fallback={<p>fallback</p>} resetKey={resetKey}>
        <Flaky shouldThrow={shouldThrow} renders={renders} />
      </RuntimeContentBoundary>
    )
    const view = render(tree('hero', true))
    expect(screen.getByText('fallback')).toBeInTheDocument()

    view.rerender(tree('classic', false))
    expect(screen.getByText('content')).toBeInTheDocument()

    view.rerender(tree('hero', true))
    expect(screen.getByText('fallback')).toBeInTheDocument()
  })
})
