import { ArrowRight, Code2, Flag, FolderOpen, LogIn, Menu, Play, Plus, Square, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { BRAND_NAME, BrandLockup } from '../../brand'
import { Button } from '../../ui/Button'
import { AppHeader, joinPath } from '../../shell'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../localProjectKeys'
import { HeroDemo } from './HeroDemo'
import { PixelLevelArt, ScenePlaceholder } from './LandingArt'
import './landing.css'

// The New project picker draws starter pictures with the 2D renderer: loaded only when someone opens it.
const NewProjectSheet = lazy(() => import('../../projects/NewProjectSheet').then((m) => ({ default: m.NewProjectSheet })))

/*
 * Brickgineers marketing page. Pure presentation: the hero's recorded demo
 * clips, local CSS/SVG art and `<picture>` media from `/brand/media`; no
 * store, protocol, or 3D imports. Brand name and lockup come from `src/brand`;
 * buttons use the `src/ui` button classes.
 */

/** Root-relative media folder owned by W7. Filenames and intrinsic sizes follow docs/brand/CONTRACTS.md. */
const MEDIA_BASE = '/brand/media'

export type LandingPageProps = {
  /** Destination of "Start building" / "Continue building". Account links always go straight to `/join`. */
  studioHref?: string
  /** Destination of the 2D builder ("Make a 2D world", "Build in 2D"). */
  platformerHref?: string
  className?: string
}

/** Every project, on this computer and in the account, plus the starters to play. */
const PROJECTS_HREF = '/projects'
const RACE_STARTER_HREF = '/2d/build?new=1&kit=race-starter'
const HACKABLE_HREF = '/2d/hackable?new=1'
const HELP_HREF = '/help'

/*
 * Account links open the join page in the mode they ask for. They used to go through
 * `/build?classroom=…`, which loaded the 3D builder only to redirect, and left it in Back.
 */
const JOIN_HREF = joinPath()
const SIGNIN_HREF = joinPath({ mode: 'signin' })
const TEACHER_HREF = joinPath({ mode: 'teacher' })

/* --------------------------------------------------------------- media --- */

type BrandPictureProps = {
  /** File stem, e.g. `hero` or `scene-toy-room`; widths are appended as `-800`. */
  name: string
  widths: readonly number[]
  width: number
  height: number
  alt: string
  sizes: string
  /** Above the fold: eager, high priority. Everything else lazy-loads. */
  priority?: boolean
  /** Same-aspect vector art shown until the file has loaded, and instead of it when the file is missing. */
  fallback: ReactNode
  className?: string
}

type MediaStatus = 'pending' | 'loaded' | 'failed'

/**
 * Responsive `<picture>` (avif, webp, png) with explicit intrinsic size so the
 * layout never shifts. The vector fallback is always rendered underneath: the
 * raster fades in over it once it has loaded, and a missing file (before W7's
 * assets land) simply leaves the vector art in place. No code change is needed
 * when the files arrive.
 */
function BrandPicture({ name, widths, width, height, alt, sizes, priority = false, fallback, className }: BrandPictureProps) {
  const [status, setStatus] = useState<MediaStatus>('pending')
  // A cached image can be complete before React attaches onLoad.
  const attach = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) setStatus('loaded')
  }, [])
  const srcSet = (extension: string) => widths.map((w) => `${MEDIA_BASE}/${name}-${w}.${extension} ${w}w`).join(', ')
  const largest = widths[widths.length - 1]
  const classes = ['landing-media', `landing-media-${status}`, className].filter(Boolean).join(' ')
  const fallbackA11y = status === 'failed' && alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true as const }
  return (
    <span className={classes} style={{ aspectRatio: `${width} / ${height}` }}>
      <span className="landing-media-fallback" {...fallbackA11y}>{fallback}</span>
      {status !== 'failed' && (
        <picture>
          <source type="image/avif" srcSet={srcSet('avif')} sizes={sizes} />
          <source type="image/webp" srcSet={srcSet('webp')} sizes={sizes} />
          <img
            ref={attach}
            src={`${MEDIA_BASE}/${name}-${largest}.png`}
            srcSet={srcSet('png')}
            sizes={sizes}
            width={width}
            height={height}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('failed')}
          />
        </picture>
      )}
    </span>
  )
}

/* ------------------------------------------------------------ hackable --- */

/** A still from the Hackable Platformer: the Hero on a ledge it reached with Double jump (scripts/demo/record-hack.mjs). */
function HackableStill() {
  return (
    <img
      className="landing-hack-picture"
      src={`${MEDIA_BASE}/hackable-ledge.jpg`}
      alt="The Hero standing on a high ledge it reached with a Double jump power, in the Hackable Platformer"
      width={960}
      height={720}
      loading="lazy"
      decoding="async"
    />
  )
}

/* ------------------------------------------------------------ building --- */

type CtaLinkProps = {
  href: string
  variant?: 'primary' | 'secondary'
  icon?: ReactNode
  trailingIcon?: ReactNode
  className?: string
  children: ReactNode
}

/** A link styled with the shared `src/ui` button classes (large size). */
function CtaLink({ href, variant = 'secondary', icon, trailingIcon, className, children }: CtaLinkProps) {
  return (
    <a className={['ui-button', `ui-button-${variant}`, 'ui-button-lg', 'landing-cta', className].filter(Boolean).join(' ')} href={href}>
      {icon && <span className="ui-button-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-button-label">{children}</span>
      {trailingIcon && <span className="ui-button-icon" aria-hidden="true">{trailingIcon}</span>}
    </a>
  )
}

function StartCta({ href, continueBuild, className }: { href: string; continueBuild: boolean; className?: string }) {
  return (
    <CtaLink href={href} variant="primary" icon={<Play size={18} />} className={className}>
      {continueBuild ? 'Continue building' : 'Start building'}
    </CtaLink>
  )
}

/** The strip under the hero: plain facts, no numbers to decode. */
const FACTS = ['Chromebooks, iPads and laptops', 'No account needed to start', 'Students join with a class code', 'No student email addresses'] as const

/** Old in-page anchors for what now lives on /help. */
const MOVED_TO_HELP: Readonly<Record<string, string>> = { help: 'how', faq: 'faq', privacy: 'privacy' }

/* ---------------------------------------------------------------- page --- */

export function LandingPage({ studioHref = '/build', platformerHref = '/2d/build', className }: LandingPageProps) {
  // Detected exactly as the studio does; reading never creates or mutates a draft.
  const [continueBuild] = useState(() => {
    try { return window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY) !== null } catch { return false }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const mainId = useId()
  const navId = useId()
  const waysId = useId()
  const friendsId = useId()
  const hackId = useId()
  const codeId = useId()
  const teachersId = useId()
  const finaleId = useId()

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
    <div className={['brick-landing', className].filter(Boolean).join(' ')}>
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
              <a className="landing-nav-link" href="#two-ways">What you can make</a>
              <a className="landing-nav-link" href={PROJECTS_HREF}>My projects</a>
              <a className="landing-nav-link" href="#teachers">For teachers</a>
              <a className="landing-nav-link" href={HELP_HREF}>Help</a>
              <a className="landing-nav-link" href={TEACHER_HREF}>Teacher login</a>
            </nav>
          </>
        }
      />

      {newOpen && (
        <Suspense fallback={null}>
          <NewProjectSheet open onClose={() => setNewOpen(false)} />
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
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">Free for students · Nothing to install</span>
            <h1 id="landing-hero-title">
              Build it.
              <br />
              Play it.
              <br />
              <span className="landing-hero-hack">Hack it.</span>
            </h1>
            <p className="landing-hero-lede">Snap bricks into 3D worlds, platformers and race tracks, then open any brick and change how it works with code blocks.</p>
            <p className="landing-hero-builds">
              <button type="button" className="landing-stud-button landing-stud-button-3d" onClick={() => setNewOpen(true)}>
                <Plus size={22} aria-hidden="true" />
                New project
              </button>
              <a className="landing-stud-button landing-stud-button-2d" href={PROJECTS_HREF}>
                <FolderOpen size={22} aria-hidden="true" />
                {continueBuild ? 'Continue a project' : 'My projects'}
              </a>
            </p>
            {/* A plain GET form: /join?classCode= with no mode looks the class up, then shows the names to tap
                plus "I'm new" (src/pages/join/joinQuery.ts), so a returning kid never lands on account creation. */}
            <form className="landing-code" action="/join" method="get">
              <label htmlFor={codeId}>Got a class code?</label>
              <input id={codeId} name="classCode" placeholder="e.g. BRICK-42" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32} required />
              <button type="submit" className="ui-button ui-button-primary">Join</button>
            </form>
            <p className="landing-hero-trust">
              No account needed to start. <a href={SIGNIN_HREF}>Student login</a>
            </p>
          </div>
          <HeroDemo />
        </section>

        <ul className="landing-facts" aria-label="At a glance">
          {FACTS.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>

        <section id="two-ways" className="landing-section landing-ways" aria-labelledby={waysId}>
          <div className="landing-ways-head">
            <h2 id={waysId}>Three things to make. One set of bricks.</h2>
            <p>Every project saves the same way, shares with your class the same way, and lives in My projects.</p>
          </div>
          <ul className="landing-ways-grid">
            <li className="landing-way landing-way-3d">
              <BrandPicture
                name="scene-toy-room"
                widths={[400, 800]}
                width={800}
                height={500}
                sizes="(max-width: 860px) 100vw, 420px"
                alt="A 3D brick build on a play table in the Toy Room scene"
                fallback={<ScenePlaceholder scene="toy-room" />}
              />
              <div className="landing-way-copy">
                <h3>3D builds</h3>
                <p>Stack bricks on a plate, pick a scene, then walk inside what you built.</p>
                <p className="landing-way-links">
                  <StartCta href={studioHref} continueBuild={continueBuild} />
                </p>
              </div>
            </li>
            <li className="landing-way landing-way-2d landing-way-code">
              <BrandPicture
                name="world-2d"
                widths={[800]}
                width={800}
                height={500}
                sizes="(max-width: 860px) 100vw, 420px"
                alt="A cartoon 2D world built from bricks, with the player bumping a ? brick"
                fallback={<PixelLevelArt />}
              />
              <span className="landing-way-tag"><Code2 size={15} aria-hidden="true" /> Code inside</span>
              <div className="landing-way-copy">
                <h3>Platformers</h3>
                <p>Place bricks, springs and critters, press Play and run through it. Open any brick to change how it works.</p>
                <p className="landing-way-links">
                  <CtaLink href={platformerHref} variant="primary" icon={<Square size={18} />}>Make a platformer</CtaLink>
                  <CtaLink href={HACKABLE_HREF} icon={<Code2 size={18} />}>Open the code</CtaLink>
                </p>
              </div>
            </li>
            <li className="landing-way landing-way-race">
              <span className="landing-media landing-media-loaded" style={{ aspectRatio: '800 / 500' }}>
                <img src={`${MEDIA_BASE}/race-track-1200.webp`} width={1200} height={750} alt="A race track seen from above, with ? blocks, a boost strip, a ramp over the water and cars racing" loading="lazy" decoding="async" />
              </span>
              <div className="landing-way-copy">
                <h3>Race tracks</h3>
                <p>Paint a track with boosts, ice and jumps, set the laps, then race your class.</p>
                <p className="landing-way-links">
                  <CtaLink href={RACE_STARTER_HREF} variant="primary" icon={<Flag size={18} />}>Make a race track</CtaLink>
                  <CtaLink href="/2d/play/speedway" icon={<Play size={18} />}>Race a starter</CtaLink>
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section id="hackable" className="landing-section landing-hack-wrap" aria-labelledby={hackId}>
          <div className="landing-hack">
            <div className="landing-hack-copy">
              <span className="landing-eyebrow landing-hack-eyebrow">The Hackable Platformer</span>
              <h2 id={hackId}>Every brick has code inside.</h2>
              <ol className="landing-hack-steps">
                <li><span><b>Build</b> a level with bricks, springs and a goal.</span></li>
                <li><span><b>Open</b> any brick, even your Hero, and see its blocks.</span></li>
                <li><span><b>Change</b> how it plays: a triple jump, faster critters, a brick nobody else has.</span></li>
              </ol>
              <p className="landing-hack-cta">
                <a className="landing-butter-button" href={HACKABLE_HREF}>Try the Hackable Platformer</a>
                <span className="landing-hack-note">No coding needed to start.</span>
              </p>
            </div>
            <div className="landing-hack-art">
              <HackableStill />
              <span className="landing-hack-blocks" aria-hidden="true">
                <span className="landing-hack-block landing-hack-hat">when I land</span>
                <span className="landing-hack-block">change <b>jumps left</b> to <i>3</i></span>
              </span>
            </div>
          </div>
        </section>

        <section className="landing-section landing-friends" aria-labelledby={friendsId}>
          <div className="landing-friends-art">
            <BrandPicture
              name="scene-brick-valley"
              widths={[400, 800]}
              width={800}
              height={500}
              sizes="(max-width: 760px) 100vw, 320px"
              alt="A brick build in the Brick Valley scene"
              fallback={<ScenePlaceholder scene="brick-valley" />}
            />
          </div>
          <div className="landing-friends-copy">
            <h2 id={friendsId}>Better with friends.</h2>
            <p>Open a room, share the link, and everyone builds and plays in the same world at the same time. The owner decides who builds.</p>
          </div>
        </section>

        <section id="teachers" className="landing-teachers" aria-labelledby={teachersId}>
          <div className="landing-teachers-inner">
            <span className="landing-eyebrow">For teachers</span>
            <h2 id={teachersId}>Your whole class, one code away.</h2>
            <ul className="landing-features">
              <li>
                <h3>No student emails</h3>
                <p>Students join with your class code and pick a username and password.</p>
              </li>
              <li>
                <h3>Work that's saved</h3>
                <p>Every project saves to the student's account, and class worlds live in one place.</p>
              </li>
              <li>
                <h3>Coding they want to do</h3>
                <p>A student who makes a new power shares it on the class shelf. You check it first.</p>
              </li>
              <li>
                <h3>No AI</h3>
                <p>Every brick, level and script is made by a kid. You run the class controls.</p>
              </li>
            </ul>
            <p className="landing-cta-row">
              <CtaLink href={TEACHER_HREF} variant="primary" icon={<LogIn size={18} />}>Teacher sign in</CtaLink>
              <CtaLink href={studioHref} icon={<Play size={18} />}>Try building first</CtaLink>
              <a className="landing-text-link" href={`${HELP_HREF}#teachers`}>How class controls work <ArrowRight size={16} aria-hidden="true" /></a>
            </p>
            <p className="landing-teachers-hint">Teacher accounts are set up by the {BRAND_NAME} team for now. Sign in with your teacher Google account or email.</p>
          </div>
        </section>

        <section className="landing-finale" aria-labelledby={finaleId}>
          <h2 id={finaleId}>Ready to build?</h2>
          <p className="landing-finale-cta">
            <a className="landing-butter-button" href={studioHref}>{continueBuild ? 'Continue building' : 'Start building'}</a>
            <a className="landing-finale-join" href={JOIN_HREF}>Join a class</a>
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <BrandLockup size={24} className="landing-brand landing-brand-footer" />
        <nav className="landing-footer-links" aria-label="Footer">
          <a href={HELP_HREF}>Help</a>
          <a href={`${HELP_HREF}#privacy`}>Privacy</a>
          <a href={SIGNIN_HREF}>Student login</a>
          <a href={TEACHER_HREF}>Teacher sign in</a>
        </nav>
        <p>
          A creative building playground for curious minds. {BRAND_NAME} is an independent
          creation and is not affiliated with or endorsed by the LEGO Group.
        </p>
      </footer>
    </div>
  )
}

export default LandingPage
