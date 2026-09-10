import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import LandingPage from './LandingPage'

afterEach(cleanup)

function sourceOf(relativePath: string): string {
  return readFileSync(decodeURIComponent(new URL(relativePath, import.meta.url).pathname), 'utf8')
}

describe('semantics and structure', () => {
  it('renders complete landmark structure with one h1 and labelled sections', () => {
    render(<LandingPage />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Brick Studio' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/build a brick world/i)
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(5)
    expect(screen.getByRole('heading', { name: /build together, actually together/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /pick your scene/i })).toBeInTheDocument()
  })

  it('starts with a skip link that targets the main landmark', () => {
    const { container } = render(<LandingPage />)
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(container.querySelector('a')).toBe(skip)
    expect(skip.getAttribute('href')).toBe(`#${screen.getByRole('main').id}`)
  })

  it('keeps every svg decorative so copy carries all meaning', () => {
    const { container } = render(<LandingPage />)
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(4)
    expect(container.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0)
  })

  it('names the LEGO Group non-affiliation honestly', () => {
    render(<LandingPage />)
    expect(screen.getByText(/not affiliated with or endorsed by the LEGO Group/i)).toBeInTheDocument()
  })
})

describe('calls to action', () => {
  it('points Start building and Build together at safe defaults, twice each', () => {
    render(<LandingPage />)

    const starts = screen.getAllByRole('link', { name: /start building/i })
    expect(starts).toHaveLength(2)
    for (const link of starts) expect(link).toHaveAttribute('href', '/')

    const together = screen.getAllByRole('link', { name: /build together/i })
    expect(together).toHaveLength(2)
    for (const link of together) expect(link).toHaveAttribute('href', '/live/new')

    expect(screen.getByRole('link', { name: /start a shared build/i })).toHaveAttribute('href', '/live/new')
    expect(screen.getByRole('link', { name: 'Open the studio' })).toHaveAttribute('href', '/')
  })

  it('routes every call to action through the studioHref/liveHref contract', () => {
    render(<LandingPage studioHref="/studio" liveHref="/live/party" />)

    for (const link of screen.getAllByRole('link', { name: /start building/i })) {
      expect(link).toHaveAttribute('href', '/studio')
    }
    expect(screen.getByRole('link', { name: 'Open the studio' })).toHaveAttribute('href', '/studio')
    for (const link of screen.getAllByRole('link', { name: /build together/i })) {
      expect(link).toHaveAttribute('href', '/live/party')
    }
    expect(screen.getByRole('link', { name: /start a shared build/i })).toHaveAttribute('href', '/live/party')
  })
})

describe('bundle and asset boundaries', () => {
  it('renders no raster media or embedded frames', () => {
    const { container } = render(<LandingPage />)
    expect(container.querySelector('img, canvas, video, iframe, picture, object')).toBeNull()
  })

  it('imports nothing heavy: no 3D, scene, store, or protocol modules', () => {
    for (const file of ['./LandingPage.tsx', './LandingArt.tsx', './index.ts']) {
      const source = sourceOf(file)
      expect(source).not.toMatch(/from\s+'three'/)
      expect(source).not.toMatch(/@react-three/)
      expect(source).not.toMatch(/BrickStudioScene|BrickStudioApp/)
      expect(source).not.toMatch(/from\s+'[^']*store'/)
      expect(source).not.toMatch(/liveProtocol|liveRoomModel/)
    }
  })

  it('fetches nothing from the network and respects reduced motion in its stylesheet', () => {
    const css = sourceOf('./landing.css')
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/url\(\s*['"]?https?:/i)
    expect(css).toMatch(/prefers-reduced-motion/)
    const tsx = sourceOf('./LandingPage.tsx') + sourceOf('./LandingArt.tsx')
    expect(tsx).not.toMatch(/https?:\/\//)
  })
})
