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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/snap it together\.\s*then play it\./i)
    expect(screen.getByText('Pick a brick, click to place it, press play. Making a 3D build, a platformer or a race track is that easy.')).toBeInTheDocument()
    expect(screen.getAllByText(/No account needed to start\./)).toHaveLength(2)
    expect(screen.getByRole('list', { name: 'At a glance' }).children).toHaveLength(4)
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
    for (const link of screen.getAllByRole('link', { name: /^(Start building|Join a class|Teacher sign in|Try building first|Make a platformer|Make a race track)$/ })) {
      expect(link.className).toMatch(/\bui-button\b/)
    }
    expect(screen.getByRole('button', { name: 'Menu' }).className).toMatch(/\bui-button\b/)
  })

  it('offers New project, My projects, a class code and Student login in the hero', () => {
    render(<LandingPage />)
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
    const order = [...hero.querySelectorAll('a')].map((a) => a.textContent)
    expect(order).toEqual(['My projects', 'Student login'])
    expect(within(hero).getByRole('button', { name: 'New project' })).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: 'My projects' })).toHaveAttribute('href', '/projects')
    expect(within(hero).getByRole('link', { name: 'Student login' })).toHaveAttribute('href', '/build?classroom=signin')

    // A plain GET form: /join?mode=join&classCode=… opens the join page with the code filled in.
    const code = within(hero).getByLabelText('Got a class code?') as HTMLInputElement
    expect(code).toHaveAttribute('name', 'classCode')
    const form = code.closest('form')!
    expect(form).toHaveAttribute('action', '/join')
    expect(form).toHaveAttribute('method', 'get')
    expect(form.querySelector('input[type="hidden"][name="mode"]')).toHaveAttribute('value', 'join')
    expect(within(form).getByRole('button', { name: 'Join' })).toHaveAttribute('type', 'submit')
  })

  it('shows three ways to build, all in My projects: 3D builds, platformers and race tracks', () => {
    render(<LandingPage />)
    const ways = document.getElementById('two-ways')!
    expect(within(ways).getByRole('heading', { level: 2 })).toHaveTextContent(/Three ways to build\.\s*One set of bricks\./)
    for (const name of ['3D builds', 'Platformers', 'Race tracks']) expect(within(ways).getByRole('heading', { level: 3, name })).toBeInTheDocument()
    expect(within(ways).getByRole('link', { name: 'Start building' })).toHaveAttribute('href', '/build')
    expect(within(ways).getByRole('link', { name: 'Make a platformer' })).toHaveAttribute('href', '/2d/build')
    expect(within(ways).getByRole('link', { name: 'Make a race track' })).toHaveAttribute('href', '/2d/build?new=1&kit=race-starter')
    expect(within(ways).getByRole('link', { name: 'Try a starter' })).toHaveAttribute('href', '/projects')
    expect(within(ways).getByRole('link', { name: 'Race a starter' })).toHaveAttribute('href', '/2d/play/speedway')
    expect(within(ways).getByText(/live together in My projects/)).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: BRAND_NAME })
    expect(within(nav).getByRole('link', { name: 'What you can make' })).toHaveAttribute('href', '#two-ways')
    expect(within(nav).getByRole('link', { name: 'My projects' })).toHaveAttribute('href', '/projects')
    expect(screen.getByText('Platformers and race tracks', { selector: 'dt' })).toBeInTheDocument()
  })

  it('opens the New project picker from the hero', async () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    // The sheet is a lazy chunk: under a full test run it can take more than the default second to arrive.
    expect(await screen.findByRole('dialog', { name: 'New project' }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('routes the platformer call to action through the platformerHref contract', () => {
    render(<LandingPage platformerHref="/2d/build?new=1" />)
    expect(screen.getByRole('link', { name: 'Make a platformer' })).toHaveAttribute('href', '/2d/build?new=1')
  })

  it('names the LEGO Group non-affiliation honestly', () => {
    render(<LandingPage />)
    expect(screen.getByText(/not affiliated with or endorsed by the LEGO Group/i)).toBeInTheDocument()
  })

  it('shows building together, and no characters yet', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 2, name: 'Better with friends.' })).toBeInTheDocument()
    expect(screen.getByText('Share the link with your crew')).toBeInTheDocument()
    expect(screen.queryByText(/Nova|Pip|Fern/)).toBeNull()
  })
})

describe('calls to action and anchors', () => {
  it('points every entry link at the studio routes and account intents', () => {
    render(<LandingPage />)

    const starts = screen.getAllByRole('link', { name: 'Start building' })
    expect(starts).toHaveLength(2)
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
    expect(within(nav).getByRole('link', { name: 'For teachers' })).toHaveAttribute('href', '#teachers')
    expect(within(nav).queryByRole('link', { name: /explore worlds/i })).toBeNull()
    const footer = screen.getByRole('navigation', { name: 'Footer' })
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '#privacy')
    expect(within(footer).getByRole('link', { name: 'Help' })).toHaveAttribute('href', '#help')

    for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const id = link.getAttribute('href')!.slice(1)
      expect(document.getElementById(id), `#${id} must exist`).not.toBeNull()
    }
    expect(screen.getByRole('heading', { name: 'Your whole class, one code away.' }).closest('#teachers')).not.toBeNull()
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
    expect(continues).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Continue a project' })).toHaveAttribute('href', '/projects')
    for (const link of continues) expect(link).toHaveAttribute('href', '/build')
    expect(screen.queryAllByRole('link', { name: 'Start building' })).toHaveLength(0)

    expect(window.localStorage.getItem('brick-studio.current-project.v1')).toBe(saved)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('falls back to Start building when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    render(<LandingPage />)
    expect(screen.getAllByRole('link', { name: 'Start building' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'My projects' }).length).toBeGreaterThan(0)
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
    fireEvent.click(within(nav).getByRole('link', { name: 'What you can make' }))
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
  it('uses <picture> with explicit sizes, all lazy below the hero, and no frames or canvases', () => {
    const { container } = render(<LandingPage />)
    expect(container.querySelector('canvas, iframe, object')).toBeNull()

    const pictures = container.querySelectorAll('picture')
    expect(pictures.length).toBe(3)
    for (const picture of pictures) {
      const img = picture.querySelector('img')!
      expect(img.getAttribute('width')).toMatch(/^\d+$/)
      expect(img.getAttribute('height')).toMatch(/^\d+$/)
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(img.getAttribute('alt')).not.toBe('')
      const types = [...picture.querySelectorAll('source')].map((s) => s.getAttribute('type'))
      expect(types).toEqual(['image/avif', 'image/webp'])
      expect(img.getAttribute('src')).toMatch(/^\/brand\/media\/.*\.png$/)
      for (const src of [...picture.querySelectorAll('source')].map((s) => s.getAttribute('srcset'))) expect(src).toMatch(/^\/brand\/media\//)
    }
  })

  it('paints the vector art under every picture until the raster loads, and keeps it when the file is missing', () => {
    const { container } = render(<LandingPage />)
    const frame = container.querySelector('.landing-way-2d .landing-media')!
    expect(frame.getAttribute('style')).toContain('aspect-ratio: 800 / 500')
    expect(frame.className).toContain('landing-media-pending')
    const fallback = frame.querySelector('.landing-media-fallback')!
    expect(fallback).toHaveAttribute('aria-hidden', 'true')
    expect(fallback.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('.landing-media-fallback svg')).toHaveLength(3)

    const img = frame.querySelector<HTMLImageElement>('img')!
    fireEvent.error(img)
    expect(frame.querySelector('picture')).toBeNull()
    expect(frame.className).toContain('landing-media-failed')
    expect(fallback).toHaveAttribute('role', 'img')
    expect(fallback).toHaveAttribute('aria-label', img.alt)

    const scene = container.querySelector<HTMLImageElement>('.landing-way-3d img')!
    fireEvent.load(scene)
    expect(scene.closest('.landing-media')!.className).toContain('landing-media-loaded')
  })

  it('plays the recorded demo clips in turn, with a pill, a pause button and full screen', () => {
    const { container } = render(<LandingPage />)
    const video = container.querySelector<HTMLVideoElement>('.landing-demo-video')!
    expect([...video.querySelectorAll('source')].map((s) => s.getAttribute('src'))).toEqual(['/brand/media/demo-3d.webm', '/brand/media/demo-3d.mp4'])
    expect(video.muted).toBe(true)
    expect(video).toHaveAttribute('poster', '/brand/media/demo-3d-poster.jpg')

    const pills = () => within(screen.getByRole('radiogroup', { name: 'Choose a demo' })).getAllByRole('radio')
    expect(pills().map((p) => p.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    fireEvent.ended(video)
    expect(pills().map((p) => p.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    expect(container.querySelector('.landing-demo-video source')).toHaveAttribute('src', '/brand/media/demo-2d.webm')
    fireEvent.click(pills()[0])
    expect(container.querySelector('.landing-demo-video source')).toHaveAttribute('src', '/brand/media/demo-3d.webm')

    // A radio group: only the chosen pill is in the tab order, and arrow keys move the choice and focus.
    expect(pills().map((p) => p.tabIndex)).toEqual([0, -1])
    fireEvent.keyDown(pills()[0], { key: 'ArrowRight' })
    expect(pills().map((p) => p.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    expect(document.activeElement).toBe(pills()[1])
    fireEvent.keyDown(pills()[1], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(pills()[0])

    fireEvent.click(screen.getByRole('button', { name: 'Pause the demo' }))
    expect(screen.getByRole('button', { name: 'Play the demo' })).toBeInTheDocument()

    // The full-screen cut only loads once asked for.
    expect(container.querySelector('.landing-demo-dialog video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(container.querySelector('.landing-demo-dialog video source')).toHaveAttribute('src', '/brand/media/demo-full.mp4')
  })

  it('shows the Hackable Platformer: its band and picture, the teacher shelf card and the coding question', () => {
    const { container } = render(<LandingPage />)
    expect(screen.getByRole('heading', { name: 'Every brick has code inside.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try the Hackable Platformer' })).toHaveAttribute('href', '/2d/hackable?new=1')
    expect(container.querySelector('.landing-hack-picture')).toHaveAttribute('src', '/brand/media/hackable-ledge.jpg')
    expect(container.querySelector('.landing-hack video')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Kids learn to code because they want to' })).toBeInTheDocument()
    expect(screen.getByText('Do students need to know how to code?')).toBeInTheDocument()
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
