import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRAND_NAME } from '../../brand'
import LandingPage from './LandingPage'

afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks() })

function sourceOf(relativePath: string): string {
  return readFileSync(decodeURIComponent(new URL(relativePath, import.meta.url).pathname), 'utf8')
}

describe('semantics and structure', () => {
  it('renders complete landmark structure with one h1 and the brand hero copy', () => {
    render(<LandingPage />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: BRAND_NAME })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/build a world\.\s*then step inside\./i)
    expect(screen.getByText('Create, explore, and build together in your browser.')).toBeInTheDocument()
    expect(screen.getAllByText('No account needed to start.')).toHaveLength(2)
    expect(screen.getByText('Share a link to build together as guests. Join your class to save online.')).toBeInTheDocument()
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

  it('uses the shared brand lockup and src/ui button classes', () => {
    const { container } = render(<LandingPage />)
    expect(screen.getByRole('banner').querySelector('.brand-lockup .brand-wordmark')).toHaveTextContent(BRAND_NAME)
    expect(screen.getByRole('contentinfo').querySelector('.brand-lockup .brand-wordmark')).toHaveTextContent(BRAND_NAME)
    expect(container.textContent).not.toMatch(/Brick Studio/)
    for (const link of screen.getAllByRole('link', { name: /^(Start building|Join a class|Teacher sign in|Try building first|See classroom tools)$/ })) {
      expect(link.className).toMatch(/\bui-button\b/)
    }
    expect(screen.getByRole('button', { name: 'Menu' }).className).toMatch(/\bui-button\b/)
  })

  it('places a phone-only Sign in link in the hero after the buttons (board 16)', () => {
    render(<LandingPage />)
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
    const signin = within(hero).getByRole('link', { name: 'Student login' })
    expect(signin).toHaveAttribute('href', '/build?classroom=signin')
    expect(signin.closest('.landing-hero-signin')).not.toBeNull()
    const order = [...hero.querySelectorAll('a')].map((a) => a.textContent)
    expect(order).toEqual(['Start building', 'Make a 2D world', 'Join a class', 'Student login'])
  })

  it('makes 2D building a first-class choice: hero, a two-ways section and the nav', () => {
    render(<LandingPage />)
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
    expect(within(hero).getByRole('link', { name: 'Make a 2D world' })).toHaveAttribute('href', '/2d/build')
    expect(within(hero).getByRole('link', { name: 'Make a 2D world' }).className).toMatch(/\bui-button\b/)

    const ways = document.getElementById('two-ways')!
    expect(within(ways).getByRole('heading', { level: 2 })).toHaveTextContent('Stack it in 3D. Or draw it in 2D.')
    expect(within(ways).getByRole('heading', { level: 3, name: '3D worlds' })).toBeInTheDocument()
    expect(within(ways).getByRole('heading', { level: 3, name: /2D worlds/ })).toBeInTheDocument()
    expect(within(ways).getByRole('link', { name: 'Build in 3D' })).toHaveAttribute('href', '/build')
    expect(within(ways).getByRole('link', { name: 'Build in 2D' })).toHaveAttribute('href', '/2d/build')
    expect(within(ways).getByRole('link', { name: 'Try a starter world' })).toHaveAttribute('href', '/2d')
    expect(within(ways).getByText(/the 3D \/ 2D switch at the top of the builder/)).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: BRAND_NAME })
    expect(within(nav).getByRole('link', { name: '2D worlds' })).toHaveAttribute('href', '#two-ways')
    expect(screen.getByText('2D worlds', { selector: 'dt' })).toBeInTheDocument()
  })

  it('routes the 2D calls to action through the platformerHref contract', () => {
    render(<LandingPage platformerHref="/2d/build?new=1" />)
    expect(screen.getByRole('link', { name: 'Make a 2D world' })).toHaveAttribute('href', '/2d/build?new=1')
    expect(screen.getByRole('link', { name: 'Build in 2D' })).toHaveAttribute('href', '/2d/build?new=1')
  })

  it('names the LEGO Group non-affiliation honestly', () => {
    render(<LandingPage />)
    expect(screen.getByText(/not affiliated with or endorsed by the LEGO Group/i)).toBeInTheDocument()
  })

  it('lists the three steps, the three real scenes and Nova', () => {
    render(<LandingPage />)
    const steps = screen.getAllByRole('heading', { level: 3, name: /^(Build it|Explore it|Bring friends)$/ })
    expect(steps.map((h) => h.textContent)).toEqual(['Build it', 'Explore it', 'Bring friends'])
    for (const scene of ['Toy Room', 'Brick Valley', 'Sky Island']) {
      expect(screen.getByRole('heading', { level: 3, name: scene })).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeInTheDocument()
    expect(screen.getByText('Nova')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Character color examples' }).children.length).toBeGreaterThanOrEqual(6)
  })
})

describe('calls to action and anchors', () => {
  it('points every entry link at the studio routes and account intents', () => {
    render(<LandingPage />)

    const starts = screen.getAllByRole('link', { name: 'Start building' })
    expect(starts).toHaveLength(3)
    for (const link of starts) expect(link).toHaveAttribute('href', '/build')

    const joins = screen.getAllByRole('link', { name: 'Join a class' })
    expect(joins).toHaveLength(1)
    for (const link of joins) expect(link).toHaveAttribute('href', '/build?classroom=join')

    // The header's student entry is the shell's account chip (flows v2); the hero keeps its own link.
    const signins = screen.getAllByRole('link', { name: 'Student login' })
    expect(signins).toHaveLength(1)
    for (const link of signins) expect(link).toHaveAttribute('href', '/build?classroom=signin')
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/join?mode=signin')
    expect(screen.getByRole('link', { name: 'Teacher sign in' })).toHaveAttribute('href', '/build?classroom=teacher')
    expect(screen.getByRole('link', { name: 'Try building first' })).toHaveAttribute('href', '/build')
    expect(screen.getByText('Continue with your teacher Google account. Email and password sign-in is also available.')).toBeInTheDocument()
  })

  it('routes every studio call to action through the studioHref contract', () => {
    render(<LandingPage studioHref="/studio" />)
    for (const link of screen.getAllByRole('link', { name: 'Start building' })) expect(link).toHaveAttribute('href', '/studio')
    expect(screen.getByRole('link', { name: 'Try building first' })).toHaveAttribute('href', '/studio')
    for (const link of screen.getAllByRole('link', { name: 'Join a class' })) expect(link).toHaveAttribute('href', '/studio?classroom=join')
    for (const link of screen.getAllByRole('link', { name: 'Student login' })) expect(link).toHaveAttribute('href', '/studio?classroom=signin')
    expect(screen.getByRole('link', { name: 'Teacher sign in' })).toHaveAttribute('href', '/studio?classroom=teacher')
  })

  it('resolves every in-page anchor to an element that exists', () => {
    const { container } = render(<LandingPage />)
    const nav = screen.getByRole('navigation', { name: BRAND_NAME })
    expect(within(nav).getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '#how-it-works')
    expect(within(nav).getByRole('link', { name: 'For teachers' })).toHaveAttribute('href', '#teachers')
    expect(within(nav).queryByRole('link', { name: /explore worlds/i })).toBeNull()
    expect(screen.getByRole('link', { name: 'See classroom tools' })).toHaveAttribute('href', '#teachers')
    const footer = screen.getByRole('navigation', { name: 'Footer' })
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '#privacy')
    expect(within(footer).getByRole('link', { name: 'Help' })).toHaveAttribute('href', '#help')

    for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const id = link.getAttribute('href')!.slice(1)
      expect(document.getElementById(id), `#${id} must exist`).not.toBeNull()
    }
    expect(screen.getByRole('heading', { name: 'From your first brick to your own world.' }).closest('#how-it-works')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'More creating. Less setup.' }).closest('#teachers')).not.toBeNull()
  })

  it('offers Start building for a first visit and Continue building for a real local draft, never touching the draft', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')

    render(<LandingPage />)
    expect(screen.queryAllByRole('link', { name: 'Continue building' })).toHaveLength(0)
    cleanup()

    const saved = JSON.stringify({ version: 1, bricks: [{ id: 'kept' }] })
    window.localStorage.setItem('brick-studio.current-project.v1', saved)
    setItem.mockClear()
    render(<LandingPage />)
    const continues = screen.getAllByRole('link', { name: 'Continue building' })
    expect(continues).toHaveLength(3)
    for (const link of continues) expect(link).toHaveAttribute('href', '/build')
    expect(screen.queryAllByRole('link', { name: 'Start building' })).toHaveLength(0)

    expect(window.localStorage.getItem('brick-studio.current-project.v1')).toBe(saved)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('falls back to Start building when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    render(<LandingPage />)
    expect(screen.getAllByRole('link', { name: 'Start building' })).toHaveLength(3)
  })
})

describe('mobile menu', () => {
  it('toggles the navigation with aria-expanded, closes on link click and on Escape', () => {
    render(<LandingPage />)
    const toggle = screen.getByRole('button', { name: 'Menu' })
    const nav = screen.getByRole('navigation', { name: BRAND_NAME })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', nav.id)
    expect(nav).not.toHaveAttribute('data-open')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(nav).toHaveAttribute('data-open', 'true')

    fireEvent.keyDown(nav, { key: 'Escape' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(toggle)

    fireEvent.click(toggle)
    fireEvent.click(within(nav).getByRole('link', { name: 'How it works' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('factual FAQ, help and privacy', () => {
  it('answers the three questions honestly', () => {
    render(<LandingPage />)
    for (const question of ['Do I need an account?', 'Where is my work saved?', 'Can we build together?']) {
      expect(screen.getByText(question)).toBeInTheDocument()
    }
    expect(screen.getByText(/your draft is saved in this browser/i)).toBeInTheDocument()
    expect(screen.getByText(/a room expires about two hours after the last activity/i)).toBeInTheDocument()
    expect(screen.getByText(/a teacher can close collaboration at any time; the work is kept/i)).toBeInTheDocument()
  })

  it('does not advertise teacher self-service registration or a public world gallery', () => {
    render(<LandingPage />)
    expect(screen.getByText(/this page does not create new teacher accounts/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /create (a )?teacher account/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /explore worlds/i })).toBeNull()
  })

  it('has help and privacy sections with no domain text and no fake claims', () => {
    const { container } = render(<LandingPage />)
    expect(screen.getByRole('heading', { name: 'Help' }).closest('#help')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Privacy' }).closest('#privacy')).not.toBeNull()
    expect(screen.getByText(/it is not a full privacy policy/i)).toBeInTheDocument()

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\b[a-z0-9-]+\.(com|org|app|io|net|dev|edu)\b/i)
    expect(text).not.toMatch(/testimonial|★|⭐|rated|rating|trusted by|loved by|free forever|pricing|\$\d/i)
    expect(text).not.toMatch(/\d[\d,]*\+?\s*(students|teachers|schools|classrooms|builders|worlds)\b/i)
    expect(text).not.toMatch(/COPPA|FERPA|GDPR|certified|compliant|guarantee|100%/i)
    expect(text).not.toMatch(/students? (learn|improve|score|achieve)/i)
  })
})

describe('bundle and asset boundaries', () => {
  it('uses <picture> with explicit sizes: an eager hero and lazy below-fold media, no frames or canvases', () => {
    const { container } = render(<LandingPage />)
    expect(container.querySelector('canvas, video, iframe, object')).toBeNull()

    const pictures = container.querySelectorAll('picture')
    expect(pictures.length).toBe(5)
    for (const picture of pictures) {
      const img = picture.querySelector('img')!
      expect(img.getAttribute('width')).toMatch(/^\d+$/)
      expect(img.getAttribute('height')).toMatch(/^\d+$/)
      expect(picture.querySelector('source[type="image/webp"]')).not.toBeNull()
      for (const src of [img.getAttribute('src'), ...[...picture.querySelectorAll('source')].map((s) => s.getAttribute('srcset'))]) {
        expect(src).toMatch(/^\/brand\/media\//)
      }
    }

    const hero = container.querySelector('.landing-hero img')!
    expect(hero).toHaveAttribute('width', '1600')
    expect(hero).toHaveAttribute('height', '960')
    expect(hero).toHaveAttribute('loading', 'eager')
    expect(hero).toHaveAttribute('fetchpriority', 'high')
    expect(hero.getAttribute('alt')).not.toBe('')

    const belowFold = [...container.querySelectorAll('img')].filter((img) => img !== hero)
    expect(belowFold).toHaveLength(4)
    for (const img of belowFold) expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('offers avif, webp and png sources for every picture', () => {
    const { container } = render(<LandingPage />)
    for (const picture of container.querySelectorAll('picture')) {
      const types = [...picture.querySelectorAll('source')].map((s) => s.getAttribute('type'))
      expect(types).toEqual(['image/avif', 'image/webp'])
      expect(picture.querySelector('img')!.getAttribute('src')).toMatch(/\.png$/)
    }
    const heroSources = [...container.querySelectorAll('.landing-hero source')].map((s) => s.getAttribute('srcset'))
    expect(heroSources[0]).toBe('/brand/media/hero-800.avif 800w, /brand/media/hero-1200.avif 1200w, /brand/media/hero-1600.avif 1600w')
  })

  it('paints the vector art under every picture until the raster loads, and keeps it when the file is missing', () => {
    const { container } = render(<LandingPage />)
    const frame = container.querySelector('.landing-hero .landing-media')!
    expect(frame.getAttribute('style')).toContain('aspect-ratio: 1600 / 960')
    expect(frame.className).toContain('landing-media-pending')
    const fallback = frame.querySelector('.landing-media-fallback')!
    expect(fallback).toHaveAttribute('aria-hidden', 'true')
    expect(fallback.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('.landing-media-fallback svg')).toHaveLength(5)

    const hero = frame.querySelector<HTMLImageElement>('img')!
    fireEvent.error(hero)
    expect(frame.querySelector('picture')).toBeNull()
    expect(frame.className).toContain('landing-media-failed')
    expect(fallback).toHaveAttribute('role', 'img')
    expect(fallback).toHaveAttribute('aria-label', hero.alt)
    expect(frame.querySelector('svg')).not.toBeNull()

    const scene = container.querySelector<HTMLImageElement>('.landing-world-card img')!
    fireEvent.load(scene)
    expect(scene.closest('.landing-media')!.className).toContain('landing-media-loaded')
  })

  it('imports nothing heavy: no 3D, scene, store, or protocol modules', () => {
    for (const file of ['./LandingPage.tsx', './LandingArt.tsx', './index.ts']) {
      const source = sourceOf(file)
      expect(source).not.toMatch(/from\s+'three'/)
      expect(source).not.toMatch(/@react-three/)
      expect(source).not.toMatch(/BrickStudioScene|BrickStudioApp/)
      expect(source).not.toMatch(/from\s+'[^']*store'/)
      expect(source).not.toMatch(/liveProtocol|liveRoomModel/)
      expect(source).not.toMatch(/environments\/|characters\//)
    }
  })

  it('fetches nothing from the network and respects reduced motion in its stylesheet', () => {
    const css = sourceOf('./landing.css')
    expect(css).not.toMatch(/@import/)
    // No local `--landing-*` definitions: the page inherits the :root palette from src/styles.css.
    expect(css).not.toMatch(/--landing-[\w-]*\s*:/)
    expect(css).not.toMatch(/url\(\s*['"]?https?:/i)
    expect(css).toMatch(/prefers-reduced-motion/)
    const tsx = sourceOf('./LandingPage.tsx') + sourceOf('./LandingArt.tsx')
    // The sole external URL is an explicit legacy-host migration link; it is not fetched.
    expect(tsx.match(/https?:\/\/[^'"\s<>]+/g)).toEqual(['https://brickgineers.com'])
  })
})
