import { ArrowRight, Check, Menu, Play, Plus, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { BRAND_NAME, BrandLockup } from '../../brand'
import { Button } from '../../ui/Button'
import { AppHeader, joinPath } from '../../shell'
import { FROM_NOTHING_HREF, type GameId } from '../../projects/gameStarts'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../localProjectKeys'
import './landing.css'

// The "Make a game" picker draws starter pictures with the 2D renderer: loaded only when someone opens it.
const NewProjectSheet = lazy(() => import('../../projects/NewProjectSheet').then((m) => ({ default: m.NewProjectSheet })))

/*
 * Brickgineers home page: "Make your own games, brick by brick." Pure presentation: `/brand/media` pictures and CSS
 * art, no store, protocol, or 3D imports. Brand name and lockup come from `src/brand`; buttons use the `src/ui`
 * button classes. The layout follows the owner-approved mock (2026-11-03): hero, three ways to work, the games,
 * playing together, teachers, footer.
 */

const MEDIA = '/brand/media'

export type LandingPageProps = {
  /** Destination of "Start building in 3D". Account links always go straight to `/join`. */
  studioHref?: string
  className?: string
  /** The empty-stage start; its card shows only when there is one (tests turn it on). */
  fromNothingHref?: string | null
}

const PROJECTS_HREF = '/projects'
const HELP_HREF = '/help'
const JOIN_HREF = joinPath()
const TEACHER_HREF = joinPath({ mode: 'teacher' })

/** Players in one 2D room (platformer-core MAX_PLAYERS; the landing test keeps these equal). */
export const ROOM_PLAYERS = 16

/** Old in-page anchors for what now lives on /help. */
const MOVED_TO_HELP: Readonly<Record<string, string>> = { help: 'how', faq: 'faq', privacy: 'privacy' }

/*
 * Anything made on this computer: the 3D build, a 2D draft or a Hackable project. Read only (never created or
 * changed here), so a returning kid without an account still finds My projects. Keys: src/brick/localProjectKeys.ts,
 * src/platformer/ui/drafts.ts and src/platformer/lab/studio/persist/hackableProjects.ts.
 */
const LOCAL_WORK_KEYS = [BRICK_STUDIO_LOCAL_STORAGE_KEY, 'brick-studio.2d.drafts.v1', 'code-lab.projects.v1', 'code-lab.project.v1'] as const

function hasLocalWork(): boolean {
  try {
    return LOCAL_WORK_KEYS.some((key) => {
      const value = window.localStorage.getItem(key)
      return value !== null && value !== '[]' && value !== '{}' && value !== ''
    })
  } catch {
    return false
  }
}

/* ------------------------------------------------------------ pictures --- */

const FRIENDS = [
  { src: `${MEDIA}/character-pip-400.webp`, tint: '#FFE7A3' },
  { src: `${MEDIA}/character-nova-400.webp`, tint: '#CFE0FF' },
  { src: `${MEDIA}/character-fern-400.webp`, tint: '#D4F2DC' },
] as const

function Faces() {
  return (
    <span className="landing-faces">
      {FRIENDS.map((f) => <img key={f.src} src={f.src} alt="" width={28} height={28} style={{ background: f.tint }} loading="lazy" decoding="async" />)}
    </span>
  )
}

/** A Hackable Platformer level, with a ? block's code open over it and friends playing. The overlays are decoration. */
function HeroShot() {
  return (
    <figure className="landing-hero-art">
      <span className="landing-shot">
        <img
          className="landing-shot-picture"
          src={`${MEDIA}/platformer-game-1600.webp`}
          srcSet={`${MEDIA}/platformer-game-800.webp 800w, ${MEDIA}/platformer-game-1600.webp 1600w`}
          sizes="(max-width: 960px) 100vw, 640px"
          width={1600}
          height={988}
          alt="A Brickgineers platformer: the Hero jumping toward a row of bricks and ? blocks, with critters and coins"
          fetchPriority="high"
          decoding="async"
        />
        <span className="landing-shot-playing" aria-hidden="true"><Faces />Maya, Sam and Lee are playing</span>
        <span className="landing-shot-you" aria-hidden="true">You</span>
        <span className="landing-shot-pick" aria-hidden="true" />
      </span>
      <span className="landing-brick-card" aria-hidden="true">
        <span className="landing-brick-card-head">
          <span className="landing-q">?</span>
          <strong>? block</strong>
          <span className="landing-brick-card-see">See inside</span>
        </span>
        <span className="landing-blocks">
          <span className="landing-block landing-block-hat">when the Hero bumps my <i>bottom</i></span>
          <span className="landing-block landing-block-var">change <i>coins</i> by <b>1</b></span>
          <span className="landing-block landing-block-looks">switch costume to <i>used</i></span>
        </span>
      </span>
    </figure>
  )
}

/** Two friends racing, the room bar on top and what just changed. Decoration around a real track picture. */
function RoomShot() {
  return (
    <figure className="landing-shot landing-room-shot">
      <img className="landing-shot-picture" src={`${MEDIA}/race-track-1200.webp`} width={1200} height={750} alt="A race track seen from above with several cars racing" loading="lazy" decoding="async" />
      <span className="landing-room-bar" aria-hidden="true">
        <Faces />
        3 playing
        <span className="landing-room-copy">Copy link</span>
      </span>
      <span className="landing-room-toast" aria-hidden="true">Maya changed the Boost pad: now twice as fast</span>
    </figure>
  )
}

/* ---------------------------------------------------------------- page --- */

export function LandingPage({ studioHref = '/build', className, fromNothingHref = FROM_NOTHING_HREF }: LandingPageProps) {
  const [localWork] = useState(hasLocalWork)
  const [menuOpen, setMenuOpen] = useState(false)
  // Which picker is open: the hero's (no game) or a game card's (that game's Start gets the keyboard).
  const [picker, setPicker] = useState<{ game?: GameId } | null>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const mainId = useId()
  const navId = useId()
  const layersId = useId()
  const gamesId = useId()
  const togetherId = useId()
  const teachersId = useId()

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const onNavKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !menuOpen) return
    event.preventDefault()
    setMenuOpen(false)
    menuButton.current?.focus()
  }, [menuOpen])

  // This page is a lazy chunk, so a deep link such as /#teachers arrives
  // before its target exists; resolve it once the sections are mounted, and
  // again after the web fonts swap in (their metrics shift what sits above).
  // Help, the questions and privacy moved to /help: old links follow them there.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash || hash.length < 2) return
    const moved = MOVED_TO_HELP[hash.slice(1)]
    if (moved) { window.location.replace(`${HELP_HREF}#${moved}`); return }
    let target: HTMLElement | null = null
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))) } catch { target = null }
    if (!target) return
    let cancelled = false
    const reveal = () => { if (!cancelled) target?.scrollIntoView({ block: 'start' }) }
    reveal()
    document.fonts?.ready.then(reveal, () => undefined)
    return () => { cancelled = true }
  }, [])

  return (
    <div className={['brick-landing', 'landing-home', className].filter(Boolean).join(' ')}>
      <a className="landing-skip" href={`#${mainId}`}>Skip to content</a>

      {/* Shared shell header: lockup = Home, page links, account chip in the corner (Sign in → /join?mode=signin). */}
      <AppHeader
        variant="landing"
        className="landing-nav"
        onKeyDown={onNavKeyDown}
        navigation={
          <>
            <Button
              ref={menuButton}
              variant="secondary"
              className="landing-menu-toggle"
              icon={menuOpen ? <X size={20} /> : <Menu size={20} />}
              aria-expanded={menuOpen}
              aria-controls={navId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menu
            </Button>
            <nav id={navId} aria-label={BRAND_NAME} data-open={menuOpen || undefined} onClick={closeMenu}>
              <a className="landing-nav-link" href="#games">Games</a>
              <a className="landing-nav-link" href="#teachers">For teachers</a>
              <a className="landing-nav-link" href={HELP_HREF}>Help</a>
              <a className="landing-nav-link" href={JOIN_HREF}>Class code</a>
            </nav>
          </>
        }
      />

      {picker && (
        <Suspense fallback={null}>
          <NewProjectSheet open focusGame={picker.game} onClose={() => setPicker(null)} />
        </Suspense>
      )}
      <main id={mainId}>
        {window.location.hostname === 'virtual-legos.vercel.app' && (
          <aside className="landing-legacy-notice" aria-label="New Brickgineers address">
            <details>
              <summary>Brickgineers has a new home <ArrowRight size={16} aria-hidden="true" /></summary>
              <div className="landing-legacy-body">
                <p>
                  Your draft at this address stays in this browser. Continue building here, then export a copy
                  from the world menu or sign in and save it to your account before moving to the new address.
                </p>
                <p>
                  Importing an exported build moves the build itself. Browser preferences, your outfit collection,
                  and ownership of guest rooms stay at this address.
                </p>
                <a href="https://brickgineers.com" target="_blank" rel="noopener noreferrer">
                  Open brickgineers.com in a new tab <ArrowRight size={16} aria-hidden="true" />
                </a>
              </div>
            </details>
          </aside>
        )}

        <section id="top" className="landing-band landing-hero-band" aria-labelledby="landing-hero-title">
          <div className="landing-wrap landing-hero">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">Free · In your browser · Nothing to install</p>
              <h1 id="landing-hero-title">Make your own games, brick by brick.</h1>
              <p className="landing-hero-lede">
                Snap a platformer or a race track together and press Play. Every brick has code inside, so when you're
                ready, you can change how anything works. Then send a link and play it with friends.
              </p>
              <div className="landing-hero-actions">
                <button type="button" className="landing-make" onClick={() => setPicker({})}>
                  <Play size={20} fill="currentColor" aria-hidden="true" />
                  Make a game
                </button>
                <a className="landing-join" href={JOIN_HREF}>Got a class code? Join your class</a>
              </div>
              <p className="landing-hero-note">
                No account needed to start. Free for students, always.
                {localWork && <> <a href={PROJECTS_HREF}>Your games are in My projects</a>.</>}
              </p>
            </div>
            <HeroShot />
          </div>
        </section>

        <section className="landing-band" aria-labelledby={layersId}>
          <div className="landing-wrap landing-stack">
            <div className="landing-heading">
              <h2 id={layersId}>Start simple. Go as deep as you want.</h2>
              <p>Every project works the same three ways. A kid can make a whole game without code, and the code is always one tap away when they're ready.</p>
            </div>
            <div className="landing-layers">
              <article className="landing-layer">
                <h3><span className="landing-step">1</span>Place</h3>
                <p>Paint bricks into a level and press Play. Ground, springs, critters, a goal.</p>
                <ul className="landing-palette" aria-label="Some of the bricks">
                  <li><span className="landing-tile landing-tile-ground" aria-hidden="true" />Ground</li>
                  <li><span className="landing-tile landing-tile-q" aria-hidden="true">?</span>? block</li>
                  <li><span className="landing-tile landing-tile-spring" aria-hidden="true" />Spring</li>
                  <li><span className="landing-tile landing-tile-walker" aria-hidden="true" />Walker</li>
                  <li><span className="landing-tile landing-tile-coin" aria-hidden="true" />Coin</li>
                </ul>
              </article>
              <article className="landing-layer">
                <h3><span className="landing-step">2</span>Tune</h3>
                <p>Every brick has sliders. Jump higher, drive faster, make the critters sneaky.</p>
                <div className="landing-sliders">
                  {([['Jump power', 70], ['Run speed', 50], ['Jumps in the air', 67]] as const).map(([name, value]) => (
                    <div key={name} className="landing-slider">
                      <span>{name}</span>
                      <span className="landing-slider-track" aria-hidden="true"><span style={{ width: `${value}%` }} /></span>
                    </div>
                  ))}
                </div>
              </article>
              <article className="landing-layer">
                <h3><span className="landing-step landing-step-open">3</span>Open</h3>
                <p>See inside any brick, even the Hero. It's real block code: change it, or make a brick from nothing.</p>
                <div className="landing-code-shot">
                  <img src={`${MEDIA}/hero-code-1000.webp`} width={1000} height={670} alt="The Hero's block code open in the editor" loading="lazy" decoding="async" />
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="games" className="landing-band landing-band-soft" aria-labelledby={gamesId}>
          <div className="landing-wrap landing-stack">
            <div className="landing-heading">
              <h2 id={gamesId}>Pick a start. Make it anything.</h2>
              <p>
                A platformer or a race gets you playing in a minute. They're starting points, not limits: every brick can be changed
                {fromNothingHref ? ', and you can begin from an empty stage.' : '.'}
              </p>
            </div>
            <div className="landing-games">
              <article className="landing-game">
                <img src={`${MEDIA}/platformer-game-800.webp`} width={800} height={494} alt="" loading="lazy" decoding="async" style={{ objectPosition: '20% 80%' }} />
                <div className="landing-game-copy">
                  <h3><button type="button" className="landing-game-open" aria-describedby="landing-game-platformer" onClick={() => setPicker({ game: 'platformer' })}>Platformer</button></h3>
                  <p id="landing-game-platformer">Run, jump and stomp to the flag. Change how the Hero moves.</p>
                </div>
              </article>
              <article className="landing-game">
                <img src={`${MEDIA}/race-track-1200.webp`} width={1200} height={750} alt="" loading="lazy" decoding="async" style={{ objectPosition: '30% 80%' }} />
                <div className="landing-game-copy">
                  <h3><button type="button" className="landing-game-open" aria-describedby="landing-game-race" onClick={() => setPicker({ game: 'race' })}>Racing</button></h3>
                  <p id="landing-game-race">Paint a track with boosts, ice and jumps, then race your friends.</p>
                </div>
              </article>
              {fromNothingHref && (
                <article className="landing-game landing-game-blank">
                  <span className="landing-game-blank-art" aria-hidden="true"><span><Plus size={18} /> New brick</span></span>
                  <div className="landing-game-copy">
                    <h3><a className="landing-game-open" href={fromNothingHref} aria-describedby="landing-game-blank">Start from nothing</a></h3>
                    <p id="landing-game-blank">An empty stage. Draw your own bricks and give them code.</p>
                  </div>
                </article>
              )}
            </div>
            <article className="landing-3d">
              <img src={`${MEDIA}/build-3d-stairs-880.webp`} width={880} height={540} alt="A character standing on red, yellow, green and blue bricks stacked like stairs on a 3D plate" loading="lazy" decoding="async" />
              <div className="landing-3d-copy">
                <p className="landing-eyebrow">Not making a game?</p>
                <h3>Build in 3D</h3>
                <p>Stack bricks on a plate, pick a scene, then walk around inside what you built. With friends, too.</p>
                <a className="landing-3d-link" href={studioHref}>Start building in 3D</a>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-band" aria-labelledby={togetherId}>
          <div className="landing-wrap landing-together">
            <div className="landing-together-copy">
              <h2 id={togetherId}>Send a link. Play it together.</h2>
              <p>Open a room and everyone plays the same game, each with their own Hero. Change a brick and it changes for everyone, right away.</p>
              <ul className="landing-checks">
                <li><Check size={20} strokeWidth={3} aria-hidden="true" />Up to {ROOM_PLAYERS} players in a room</li>
                <li><Check size={20} strokeWidth={3} aria-hidden="true" />Build together or just play</li>
                <li><Check size={20} strokeWidth={3} aria-hidden="true" />Works with a class code too</li>
              </ul>
            </div>
            <RoomShot />
          </div>
        </section>

        <section id="teachers" className="landing-band landing-teachers" aria-labelledby={teachersId}>
          <div className="landing-wrap landing-teachers-inner">
            <div className="landing-teachers-copy">
              <p className="landing-eyebrow">For teachers</p>
              <h2 id={teachersId}>Your whole class, one code away.</h2>
              <p>Students join with a class code and keep their work in their own account. You see every project and share the best powers on a class shelf.</p>
              <p className="landing-teachers-actions">
                <a className="landing-teachers-primary" href={TEACHER_HREF}>Teacher sign in</a>
                <a className="landing-teachers-secondary" href={`${HELP_HREF}#teachers`}>How class codes work</a>
              </p>
            </div>
            <ul className="landing-promises">
              <li><strong>No student emails</strong><span>A class code and a username. Nothing else.</span></li>
              <li><strong>No AI</strong><span>Every brick, level and script is made by a kid.</span></li>
              <li><strong>Runs on Chromebooks</strong><span>And iPads and laptops. Nothing to install.</span></li>
              <li><strong>Free for students</strong><span>Always. Classroom tools come later.</span></li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="landing-footer landing-home-footer">
        <div className="landing-wrap landing-footer-row">
          <BrandLockup size={24} className="landing-brand landing-brand-footer" />
          <p>Built by a teacher, for kids who make things.</p>
          <nav className="landing-footer-links" aria-label="Footer">
            <a href={HELP_HREF}>Help</a>
            <a href={`${HELP_HREF}#privacy`}>Privacy</a>
            <a href="#teachers">For teachers</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
