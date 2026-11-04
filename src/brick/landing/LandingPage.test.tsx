import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_PLAYERS } from '@brick-studio/platformer-core/net/protocol'
import { BRAND_NAME } from '../../brand'
import LandingPage, { ROOM_PLAYERS } from './LandingPage'

vi.mock('../../platformer/ui/thumbs', () => ({ levelThumb: () => '' }))
vi.mock('../../platformer/race/raceThumb', () => ({ raceThumb: () => '' }))
afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks() })

function sourceOf(relativePath: string): string {
  return readFileSync(decodeURIComponent(new URL(relativePath, import.meta.url).pathname), 'utf8')
}

const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement

describe('structure and copy', () => {
  it('renders the landmarks, one h1 and the hero copy from the mock', () => {
    render(<LandingPage />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: BRAND_NAME })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Make your own games, brick by brick.')
    expect(screen.getByText('Free · In your browser · Nothing to install')).toBeInTheDocument()
    expect(screen.getByText(/Snap a platformer or a race track together and press Play\. Every brick has code inside/)).toBeInTheDocument()
    expect(screen.getByText(/No account needed to start\. Free for students, always\./)).toBeInTheDocument()
  })

  it('runs top to bottom: hero, three ways, games, together, teachers', () => {
    render(<LandingPage />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Start simple. Go as deep as you want.',
      'Pick a start. Make it anything.',
      'Send a link. Play it together.',
      'Your whole class, one code away.',
    ])
    const layers = section('Start simple. Go as deep as you want.')
    expect(within(layers).getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace(/^\d/, ''))).toEqual(['Place', 'Tune', 'Open'])
    expect(within(layers).getByRole('img', { name: "The Hero's block code open in the editor" })).toBeInTheDocument()
  })

  it('drops everything that is not in the mock', () => {
    const { container } = render(<LandingPage />)
    const text = container.textContent ?? ''
    for (const gone of ['Build it.', 'Hack it.', 'Three things to make', 'Every brick has code inside.', 'Better with friends', 'Ready to build?', 'Teacher login', 'Student login', 'New project', 'At a glance']) {
      expect(text).not.toContain(gone)
    }
    expect(container.querySelector('video, canvas, iframe, object')).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
  })

  it('never names LEGO or Scratch', () => {
    const { container } = render(<LandingPage />)
    expect(container.textContent).not.toMatch(/lego|scratch/i)
    // (The old host's name, virtual-legos, is an address, not copy.)
    expect(sourceOf('./LandingPage.tsx')).not.toMatch(/\blego\b|\bscratch\b/i)
  })

  it('starts with a skip link that targets the main landmark', () => {
    const { container } = render(<LandingPage />)
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(container.querySelector('a')).toBe(skip)
    expect(skip.getAttribute('href')).toBe(`#${screen.getByRole('main').id}`)
  })

  it('keeps every svg and every overlay decorative, and gives every real picture its words', () => {
    const { container } = render(<LandingPage />)
    expect(container.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0)
    for (const img of container.querySelectorAll('img')) {
      const decorative = img.getAttribute('alt') === '' || img.closest('[aria-hidden="true"]')
      if (!decorative) expect(img.getAttribute('alt')!.length).toBeGreaterThan(10)
    }
    expect(screen.getByRole('img', { name: /A Brickgineers platformer: the Hero jumping/ })).toHaveAttribute('src', '/brand/media/platformer-game-1600.webp')
    // The brick card and the "playing" chip are pictures of the product, not controls.
    expect(screen.getByText('Maya, Sam and Lee are playing').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText('See inside').closest('[aria-hidden="true"]')).not.toBeNull()
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('src')).toMatch(/^\/brand\/media\//)
      expect(img.getAttribute('width')).toMatch(/^\d+$/)
    }
  })

  it('has no domain text and no fake claims', () => {
    const { container } = render(<LandingPage />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\b[a-z0-9-]+\.(com|org|app|io|net|dev|edu)\b/i)
    expect(text).not.toMatch(/testimonial|★|⭐|rated|rating|trusted by|loved by|free forever|pricing|\$\d/i)
    expect(text).not.toMatch(/\d[\d,]*\+?\s*(students|teachers|schools|classrooms|builders|worlds)\b/i)
    expect(text).not.toMatch(/COPPA|FERPA|GDPR|certified|compliant|guarantee|100%/i)
  })
})

describe('one way in each', () => {
  it('has Games, For teachers, Help and Class code in the header, then Sign in', () => {
    render(<LandingPage />)
    const nav = screen.getByRole('navigation', { name: BRAND_NAME })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Games', '#games'],
      ['For teachers', '#teachers'],
      ['Help', '/help'],
      ['Class code', '/join'],
    ])
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/join?mode=signin')
    expect(screen.queryByRole('link', { name: /my projects/i })).toBeNull()
  })

  it('offers Make a game and Join your class in the hero, nothing else', () => {
    render(<LandingPage />)
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
    expect(within(hero).getAllByRole('button').map((b) => b.textContent)).toEqual(['Make a game'])
    expect(within(hero).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Got a class code? Join your class', '/join']])
  })

  it('opens the picker from Make a game', async () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Make a game' }))
    // The sheet is a lazy chunk: under a full test run it can take more than the default second to arrive.
    expect(await screen.findByRole('dialog', { name: 'What do you want to make?' }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('opens the picker from a game card with that game’s Start ready', async () => {
    render(<LandingPage />)
    const games = section('Pick a start. Make it anything.')
    const racing = within(games).getByRole('button', { name: 'Racing' })
    expect(racing).toHaveAccessibleDescription('Paint a track with boosts, ice and jumps, then race your friends.')
    fireEvent.click(racing)
    const dialog = await screen.findByRole('dialog', { name: 'What do you want to make?' }, { timeout: 5000 })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Start a race' }))
  })

  it('links the 3D card to the 3D builder, with its picture described', () => {
    render(<LandingPage />)
    const games = section('Pick a start. Make it anything.')
    expect(within(games).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Platformer', 'Racing', 'Start from nothing', 'Build in 3D'])
    expect(within(games).getByRole('link', { name: 'Start building in 3D' })).toHaveAttribute('href', '/build')
    expect(within(games).getByRole('img', { name: /stacked like stairs/ })).toHaveAttribute('src', '/brand/media/build-3d-stairs-880.webp')
  })

  it('routes the 3D call to action through the studioHref contract', () => {
    render(<LandingPage studioHref="/studio" />)
    expect(screen.getByRole('link', { name: 'Start building in 3D' })).toHaveAttribute('href', '/studio')
  })

  it('links "Start from nothing" to a new Blank 2D game, and hides it when it has no address', () => {
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: 'Start from nothing' })).toHaveAttribute('href', '/2d/hackable-blank?new=1')
    expect(screen.getByText(/and you can begin from an empty stage\./)).toBeInTheDocument()
    cleanup()
    render(<LandingPage fromNothingHref={null} />)
    expect(screen.queryByText('Start from nothing')).toBeNull()
    expect(screen.queryByText(/empty stage/)).toBeNull()
  })

  it('points a returning kid at My projects only when something is saved on this computer, never touching it', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<LandingPage />)
    expect(screen.queryByRole('link', { name: /My projects/ })).toBeNull()
    cleanup()

    window.localStorage.setItem('brick-studio.2d.drafts.v1', JSON.stringify([{ id: 'a', title: 'Mine', updated: 1 }]))
    setItem.mockClear()
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: 'Your games are in My projects' })).toHaveAttribute('href', '/projects')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('falls back quietly when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    render(<LandingPage />)
    expect(screen.getByRole('button', { name: 'Make a game' })).toBeInTheDocument()
  })
})

describe('together, teachers and footer', () => {
  it('says how many can play in a room, from the room server’s own cap', () => {
    render(<LandingPage />)
    expect(ROOM_PLAYERS).toBe(MAX_PLAYERS)
    const together = section('Send a link. Play it together.')
    expect(within(together).getAllByRole('listitem').map((li) => li.textContent)).toEqual([`Up to ${MAX_PLAYERS} players in a room`, 'Build together or just play', 'Works with a class code too'])
    expect(within(together).getByRole('img', { name: /race track/ })).toBeInTheDocument()
  })

  it('makes four promises to teachers and links to teacher sign in and the class code help', () => {
    render(<LandingPage />)
    const teachers = section('Your whole class, one code away.')
    expect(teachers.id).toBe('teachers')
    expect([...teachers.querySelectorAll('li strong')].map((s) => s.textContent)).toEqual(['No student emails', 'No AI', 'Runs on Chromebooks', 'Free for students'])
    expect(within(teachers).getByRole('link', { name: 'Teacher sign in' })).toHaveAttribute('href', '/join?mode=teacher')
    expect(within(teachers).getByRole('link', { name: 'How class codes work' })).toHaveAttribute('href', '/help#teachers')
  })

  it('signs off as the mock does, with Help, Privacy and For teachers', () => {
    render(<LandingPage />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.querySelector('.brand-lockup .brand-wordmark')).toHaveTextContent(BRAND_NAME)
    expect(within(footer).getByText('Built by a teacher, for kids who make things.')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Footer' })).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Help', '/help'],
      ['Privacy', '/help#privacy'],
      ['For teachers', '#teachers'],
    ])
  })

  it('resolves every in-page anchor to an element that exists', () => {
    const { container } = render(<LandingPage />)
    for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const id = link.getAttribute('href')!.slice(1)
      expect(document.getElementById(id), `#${id} must exist`).not.toBeNull()
    }
  })

  it('sends an old /#privacy, /#help or /#faq link to its place on /help', () => {
    const replace = vi.fn()
    const location = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...location, hash: '#privacy', hostname: location.hostname, replace } })
    try {
      render(<LandingPage />)
      expect(replace).toHaveBeenCalledWith('/help#privacy')
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: location })
    }
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
    fireEvent.click(within(nav).getByRole('link', { name: 'Games' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('bundle and asset boundaries', () => {
  it('imports nothing heavy: no 3D, scene, store, protocol or picker modules', () => {
    for (const file of ['./LandingPage.tsx', './index.ts']) {
      const source = sourceOf(file)
      expect(source).not.toMatch(/from\s+'three'/)
      expect(source).not.toMatch(/@react-three/)
      expect(source).not.toMatch(/BrickStudioScene|BrickStudioApp/)
      expect(source).not.toMatch(/from\s+'[^']*store'/)
      expect(source).not.toMatch(/liveProtocol|liveRoomModel|net\/protocol/)
      expect(source).not.toMatch(/environments\/|characters\//)
      // The picker (and its renderers) is a lazy chunk.
      expect(source).not.toMatch(/^import .*NewProjectSheet/m)
    }
    // The start config the landing shares with the picker stays light.
    expect(sourceOf('../../projects/gameStarts.ts')).not.toMatch(/^import /m)
  })

  it('fetches nothing from the network and respects reduced motion in its stylesheet', () => {
    const css = sourceOf('./landing.css')
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/url\(\s*['"]?https?:/i)
    expect(css).toMatch(/prefers-reduced-motion/)
    // The sole external URL is an explicit legacy-host migration link; it is not fetched.
    expect(sourceOf('./LandingPage.tsx').match(/https?:\/\/[^'"\s<>]+/g)).toEqual(['https://brickgineers.com'])
  })
})
