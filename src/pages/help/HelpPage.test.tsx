import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAppRoute } from '../../routes'
import HelpPage from './HelpPage'

afterEach(cleanup)

describe('/help', () => {
  it('answers the questions honestly', () => {
    render(<HelpPage />)
    for (const question of ['Do students need to know how to code?', 'Do I need an account?', 'Where is my work saved?', 'Can we build together?']) {
      expect(screen.getByText(question)).toBeInTheDocument()
    }
    expect(screen.getByText(/your draft is saved in this browser/i)).toBeInTheDocument()
    expect(screen.getByText(/a room expires about two hours after the last activity/i)).toBeInTheDocument()
    expect(screen.getByText(/a teacher can close collaboration at any time; the work is kept/i)).toBeInTheDocument()
  })

  it('has how-to, teacher and privacy sections at their anchors, with no domain text and no fake claims', () => {
    const { container } = render(<HelpPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How it works' }).closest('#how')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'For teachers' }).closest('#teachers')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Privacy' }).closest('#privacy')).not.toBeNull()
    expect(screen.getByText(/it is not a full privacy policy/i)).toBeInTheDocument()
    expect(screen.getByText(/restore an earlier checkpoint of a shared world/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Teacher sign in' })).toHaveAttribute('href', '/join?mode=teacher')

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\b[a-z0-9-]+\.(com|org|app|io|net|dev|edu)\b/i)
    expect(text).not.toMatch(/testimonial|★|⭐|rated|rating|trusted by|loved by|free forever|pricing|\$\d/i)
    expect(text).not.toMatch(/COPPA|FERPA|GDPR|certified|compliant|guarantee|100%/i)
  })

  it('is reached at /help and /privacy', () => {
    expect(resolveAppRoute({ pathname: '/help', search: '', hash: '' }, { dev: false })).toEqual({ route: 'help' })
    expect(resolveAppRoute({ pathname: '/help/', search: '', hash: '#faq' }, { dev: false })).toEqual({ route: 'help', canonicalPath: '/help#faq' })
    expect(resolveAppRoute({ pathname: '/privacy', search: '', hash: '' }, { dev: false })).toEqual({ route: 'help', canonicalPath: '/help#privacy' })
  })
})
