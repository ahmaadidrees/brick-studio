import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Compass } from 'lucide-react'
import { Button, ButtonLink } from './Button'

afterEach(cleanup)

describe('Button', () => {
  it('defaults to type=button and the secondary variant', () => {
    render(<Button>Scene</Button>)
    const button = screen.getByRole('button', { name: 'Scene' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('ui-button', 'ui-button-secondary', 'ui-button-md')
  })

  it('applies variant and size classes', () => {
    render(<><Button variant="primary" size="lg">Explore</Button><Button variant="danger" size="sm">Delete</Button><Button variant="quiet">Quiet</Button></>)
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveClass('ui-button-primary', 'ui-button-lg')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('ui-button-danger', 'ui-button-sm')
    expect(screen.getByRole('button', { name: 'Quiet' })).toHaveClass('ui-button-quiet')
  })

  it('keeps icons decorative so the label is the name', () => {
    render(<Button icon={<Compass data-testid="icon" />}>Explore</Button>)
    const button = screen.getByRole('button', { name: 'Explore' })
    expect(button.querySelector('.ui-button-icon')).toHaveAttribute('aria-hidden', 'true')
  })

  it('requires a name for icon-only buttons and hides the visual label', () => {
    render(<Button iconOnly icon={<Compass />} aria-label="Settings">Settings</Button>)
    const button = screen.getByRole('button', { name: 'Settings' })
    expect(button).toHaveClass('ui-button-icon-only')
    expect(button.querySelector('.ui-button-label')).toBeNull()
  })

  it('blocks clicks and announces busy while loading, keeping a visible label', () => {
    const onClick = vi.fn()
    render(<Button loading loadingLabel="Saving…" onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Saving…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    expect(button.querySelector('svg.ui-spin')).not.toBeNull()
  })

  it('is disabled when asked and activates from the keyboard otherwise', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button disabled onClick={onClick}>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    rerender(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    button.focus()
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders a link with the same classes when given an href', () => {
    render(<Button href="#help" variant="primary" size="lg" icon={<Compass />}>Read the help</Button>)
    const link = screen.getByRole('link', { name: 'Read the help' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '#help')
    expect(link).not.toHaveAttribute('type')
    expect(link).toHaveClass('ui-button', 'ui-button-primary', 'ui-button-lg')
    link.focus()
    expect(link).toHaveFocus()
  })

  it('drops the href and announces disabled on an inert link', () => {
    const onClick = vi.fn()
    render(<><Button href="/build" disabled onClick={onClick}>Open</Button><ButtonLink href="/build" loading loadingLabel="Opening…">Open</ButtonLink></>)
    const disabled = screen.getByRole('link', { name: 'Open' })
    expect(disabled).not.toHaveAttribute('href')
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(disabled)
    expect(onClick).not.toHaveBeenCalled()
    const busy = screen.getByRole('link', { name: 'Opening…' })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).not.toHaveAttribute('href')
  })

  it('exposes a toggle through the pressed prop', () => {
    const { rerender } = render(<Button pressed={false}>Follow</Button>)
    const button = screen.getByRole('button', { name: 'Follow' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).not.toHaveClass('ui-button-pressed')
    rerender(<Button pressed>Follow</Button>)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveClass('ui-button-pressed')
    rerender(<Button>Follow</Button>)
    expect(button).not.toHaveAttribute('aria-pressed')
  })
})
