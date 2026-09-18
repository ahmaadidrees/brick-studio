import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BRAND_NAME } from '../brand'
import { Gallery } from './Gallery'

afterEach(cleanup)

describe('Gallery', () => {
  it('renders every section with the brand lockup, a header, a sign-in form and an openable sheet', () => {
    render(<Gallery />)
    expect(screen.getByRole('heading', { level: 1, name: 'Component gallery' })).toBeInTheDocument()
    expect(screen.getAllByText(BRAND_NAME).length).toBeGreaterThan(1)
    for (const id of ['app-header', 'header', 'signin', 'sheet', 'mark', 'tokens', 'buttons', 'fields', 'segmented', 'status']) {
      expect(document.querySelector(`[data-gallery-section="${id}"]`), id).not.toBeNull()
    }
    expect(screen.getAllByRole('link', { name: `${BRAND_NAME} Home` }).length).toBeGreaterThanOrEqual(4)
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveClass('ui-button-primary')
    expect(screen.getByRole('link', { name: 'Start building' })).toHaveClass('ui-button', 'ui-button-primary')
    expect(screen.getByLabelText('Class').tagName).toBe('SELECT')
    expect(screen.getByRole('radiogroup', { name: 'Plate size' })).toHaveAccessibleDescription('Your creation stays centered.')
    expect(screen.getByRole('form', { name: 'Welcome back' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open settings sheet' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Settings' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('never spells a domain', () => {
    const { container } = render(<Gallery />)
    expect(container.textContent).not.toMatch(/\.(com|app|org|dev)\b/)
  })
})
