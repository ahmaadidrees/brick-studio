import {
  ArrowRight,
  Box,
  Cloud,
  Compass,
  KeyRound,
  LogIn,
  Menu,
  Play,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { BRAND_NAME, BrandLockup } from '../../brand'
import { Button } from '../../ui/Button'
import { AppHeader } from '../../shell'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../localProjectKeys'
import { HeroDemo } from './HeroDemo'
import { PixelLevelArt, ScenePlaceholder } from './LandingArt'
import './landing.css'

/*
 * Brickgineers marketing page. Pure presentation: the hero's recorded demo
 * clips, local CSS/SVG art and `<picture>` media from `/brand/media`; no
 * store, protocol, or 3D imports. Brand name and lockup come from `src/brand`;
 * buttons use the `src/ui` button classes.
 */

/** Root-relative media folder owned by W7. Filenames and intrinsic sizes follow docs/brand/CONTRACTS.md. */
const MEDIA_BASE = '/brand/media'

export type LandingPageProps = {
  /** Destination of "Start building" / "Continue building"; account intents are appended as `?classroom=<intent>`. */
  studioHref?: string
  /** Destination of the 2D builder ("Make a 2D world", "Build in 2D"). */
  platformerHref?: string
  className?: string
}

/** The 2D side's own pages: courses, your levels, play with friends. */
const PLATFORMER_HOME_HREF = '/2d'

type AccountIntent = 'join' | 'signin' | 'teacher'

function intentHref(studioHref: string, intent: AccountIntent): string {
  return `${studioHref}${studioHref.includes('?') ? '&' : '?'}classroom=${intent}`
}

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

/* ------------------------------------------------------------ building --- */

function SectionHeading({ eyebrow, title, lede, id }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; id: string }) {
  return (
    <div className="landing-section-heading">
      {eyebrow && <span className="landing-eyebrow">{eyebrow}</span>}
      <h2 id={id}>{title}</h2>
      {lede && <p>{lede}</p>}
    </div>
  )
}

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
const FACTS = ['Runs in any browser', 'Chromebooks, iPads and laptops', 'Nothing to install', 'Students join with a class code'] as const

const FAQ = [
  {
    question: 'Do I need an account?',
    answer: (
      <>
        No. Start building right away as a guest; your draft is saved in this browser. Accounts are for classes:
        students join with a code from their teacher, then sign in to save worlds online and open class worlds.
      </>
    ),
  },
  {
    question: 'Where is my work saved?',
    answer: (
      <>
        Guest builds are saved in this browser on this device, and you can export a copy at any time. When you sign
        in to a class account, the worlds you save go to your account so you can open them on another device. Guest
        rooms you share by link are temporary: a room expires about two hours after the last activity.
      </>
    ),
  },
  {
    question: 'Can we build together?',
    answer: (
      <>
        Yes. As a guest, choose Build together to create a room and copy its invite link; anyone with the link can join
        while the room is open to new people. In a class, the teacher creates class and group worlds that students find in My Class, no
        link needed. A teacher can close collaboration at any time; the work is kept.
      </>
    ),
  },
] as const

/* ---------------------------------------------------------------- page --- */

export function LandingPage({ studioHref = '/build', platformerHref = '/2d/build', className }: LandingPageProps) {
  // Detected exactly as the studio does; reading never creates or mutates a draft.
  const [continueBuild] = useState(() => {
    try { return window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY) !== null } catch { return false }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const mainId = useId()
  const navId = useId()
  const waysId = useId()
  const friendsId = useId()
  const codeId = useId()
  const teachersId = useId()
  const faqId = useId()
  const finaleId = useId()
  const helpId = useId()
  const privacyId = useId()

  const joinHref = intentHref(studioHref, 'join')
  const signinHref = intentHref(studioHref, 'signin')
  const teacherHref = intentHref(studioHref, 'teacher')

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
  useEffect(() => {
    const hash = window.location.hash
    if (!hash || hash.length < 2) return
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
              <a className="landing-nav-link" href="#two-ways">3D worlds</a>
              <a className="landing-nav-link" href="#two-ways">2D worlds</a>
              <a className="landing-nav-link" href="#teachers">For teachers</a>
              <a className="landing-nav-link" href={teacherHref}>Teacher login</a>
            </nav>
          </>
        }
      />

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
            <span className="landing-eyebrow">3D or 2D · right in your browser</span>
            <h1 id="landing-hero-title">
              Snap it together.
              <br />
              Then play it.
            </h1>
            <p className="landing-hero-lede">Pick a brick, click to place it, press play. Building in 3D or 2D is that easy.</p>
            <p className="landing-hero-builds">
              <a className="landing-stud-button landing-stud-button-3d" href={studioHref}>
                <Box size={22} aria-hidden="true" />
                {continueBuild ? 'Continue in 3D' : 'Build in 3D'}
              </a>
              <a className="landing-stud-button landing-stud-button-2d" href={platformerHref}>
                <Square size={22} aria-hidden="true" />
                Build in 2D
              </a>
            </p>
            {/* A plain GET form: /join reads ?classCode= (src/pages/join/joinQuery.ts). */}
            <form className="landing-code" action="/join" method="get">
              <input type="hidden" name="mode" value="join" />
              <label htmlFor={codeId}>Got a class code?</label>
              <input id={codeId} name="classCode" placeholder="e.g. BRICK-42" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32} required />
              <button type="submit" className="ui-button ui-button-primary">Join</button>
            </form>
            <p className="landing-hero-trust">
              No account needed to start. <a href={signinHref}>Student login</a>
            </p>
          </div>
          <HeroDemo />
        </section>

        <ul className="landing-facts" aria-label="At a glance">
          {FACTS.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>

        <section id="two-ways" className="landing-section landing-ways" aria-labelledby={waysId}>
          <div className="landing-ways-head">
            <h2 id={waysId}>
              Two ways to build.
              <br />
              <span>One set of bricks.</span>
            </h2>
            <p>Both save the same way, share with your class the same way, and sit one tap apart: the 3D / 2D switch at the top of the builder.</p>
          </div>
          <ul className="landing-ways-grid">
            <li className="landing-way landing-way-3d">
              <BrandPicture
                name="scene-toy-room"
                widths={[400, 800]}
                width={800}
                height={500}
                sizes="(max-width: 860px) 100vw, 620px"
                alt="A 3D brick build on a play table in the Toy Room scene"
                fallback={<ScenePlaceholder scene="toy-room" />}
              />
              <div className="landing-way-copy">
                <h3>3D worlds</h3>
                <p>Stack bricks on a plate, pick a scene, then step inside as your character and explore what you built.</p>
                <ul className="landing-chips" aria-label="3D worlds include">
                  <li>Custom bricks</li>
                  <li>4 scenes</li>
                  <li>Walk inside</li>
                </ul>
                <StartCta href={studioHref} continueBuild={continueBuild} />
              </div>
            </li>
            <li className="landing-way landing-way-2d">
              <BrandPicture
                name="world-2d"
                widths={[800]}
                width={800}
                height={500}
                sizes="(max-width: 860px) 100vw, 620px"
                alt="A cartoon 2D world built from bricks, with the player bumping a ? brick"
                fallback={<PixelLevelArt />}
              />
              <div className="landing-way-copy">
                <h3>2D worlds</h3>
                <p>Place bricks, springs and critters in a side-scrolling world, press Play, and run through it. Cartoon or retro pixel.</p>
                <ul className="landing-chips" aria-label="2D worlds include">
                  <li>3 starter worlds</li>
                  <li>Up to 16 friends</li>
                  <li>Touch controls</li>
                </ul>
                <p className="landing-cta-row landing-cta-row-compact">
                  <CtaLink href={platformerHref} variant="primary" icon={<Square size={18} />}>Make a 2D world</CtaLink>
                  <CtaLink href={PLATFORMER_HOME_HREF} icon={<Play size={18} />}>Try a starter world</CtaLink>
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section className="landing-section landing-friends" aria-labelledby={friendsId}>
          <div className="landing-friends-copy">
            <h2 id={friendsId}>Better with friends.</h2>
            <p>Open a room, copy the link, and everyone builds and plays in the same world at the same time. The owner decides who builds.</p>
            <ol className="landing-friends-steps">
              <li>Open a room from any build</li>
              <li>Share the link with your crew</li>
              <li>Build, race and explore together</li>
            </ol>
            <p className="landing-friends-note">Guest rooms last about two hours after the last activity. In a class, shared worlds live in My Class.</p>
          </div>
          <div className="landing-friends-art">
            <BrandPicture
              name="scene-brick-valley"
              widths={[400, 800]}
              width={800}
              height={500}
              sizes="(max-width: 860px) 100vw, 720px"
              alt="A brick build in the Brick Valley scene"
              fallback={<ScenePlaceholder scene="brick-valley" />}
            />
          </div>
        </section>

        <section id="teachers" className="landing-section landing-teachers" aria-labelledby={teachersId}>
          <SectionHeading
            id={teachersId}
            eyebrow="For teachers"
            title="Your whole class, one code away."
            lede="Class codes, saved student worlds, and controls you run, inside the same builder your students can try as guests."
          />
          <ul className="landing-features">
            <li>
              <span className="landing-feature-icon landing-feature-icon-blue" aria-hidden="true"><KeyRound size={20} /></span>
              <h3>Join with a class code</h3>
              <p>Students enroll with the code you give them and choose a username and password. No student email address is needed.</p>
            </li>
            <li>
              <span className="landing-feature-icon landing-feature-icon-coral" aria-hidden="true"><Cloud size={20} /></span>
              <h3>Saved worlds in one place</h3>
              <p>Students save personal worlds to their accounts. Whole-class and group worlds you create appear in My Class for everyone who has access.</p>
            </li>
            <li>
              <span className="landing-feature-icon landing-feature-icon-butter" aria-hidden="true"><SlidersHorizontal size={20} /></span>
              <h3>Controls you run</h3>
              <p>Close enrollment, close collaboration, set a temporary password, suspend or reactivate a student, and restore an earlier checkpoint of a shared world.</p>
            </li>
          </ul>
          <div className="landing-teachers-grid">
            <div className="landing-teachers-note">
              <h3><Compass size={16} aria-hidden="true" />How shared worlds work</h3>
              <p>
                Create a whole-class or group world from any build. Students find it in My Class and join; no invite
                link is needed, and a student who was removed from a group cannot rejoin by link. Shared worlds stay
                open only while you keep collaboration open. Close it whenever you like: students can no longer open
                shared worlds, their contributions are kept, and you can still review the world.
              </p>
            </div>
            <div className="landing-teachers-cta">
              <p className="landing-cta-row landing-cta-row-compact">
                <CtaLink href={teacherHref} variant="primary" icon={<LogIn size={18} />}>Teacher sign in</CtaLink>
                <CtaLink href={studioHref} icon={<Play size={18} />}>Try building first</CtaLink>
                <CtaLink href={joinHref} icon={<KeyRound size={18} />}>Join a class</CtaLink>
              </p>
              <p className="landing-teachers-hint">Continue with your teacher Google account. Email and password sign-in is also available.</p>
              <p className="landing-teachers-hint">
                Teacher accounts are set up in advance by the team running your pilot; this page does not create new teacher accounts.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="landing-section landing-faq" aria-labelledby={faqId}>
          <h2 id={faqId}>Frequently asked questions</h2>
          <div className="landing-faq-list">
            {FAQ.map((item) => (
              <details key={item.question} className="landing-faq-item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-finale" aria-labelledby={finaleId}>
          <h2 id={finaleId}>Ready to build?</h2>
          <p className="landing-cta-row landing-cta-row-compact">
            <StartCta href={studioHref} continueBuild={continueBuild} />
          </p>
          <p className="landing-hero-trust">No account needed to start.</p>
        </section>

        <div className="landing-section landing-fineprint">
          <section id="help" className="landing-fineprint-card" aria-labelledby={helpId}>
            <h2 id={helpId}>Help</h2>
            <dl>
              <dt>Building</dt>
              <dd>Pick a brick from the drawer and tap or click the plate to place it. Undo and redo sit in the toolbar. Explore switches to your character; walk and jump with the keyboard, or with touch controls on phones and tablets.</dd>
              <dt>2D worlds</dt>
              <dd>Choose 2D with the 3D / 2D switch in the builder. Pick bricks, springs, critters or the goal flag from the Bricks drawer and tap or click to place them, then press Play to run through your world. Signed-in students find their 2D worlds in My Worlds and share them with the class the same way as 3D ones.</dd>
              <dt>Saving</dt>
              <dd>Guest drafts save automatically in this browser. The world menu can export any build as a file and import it again later. Signed-in students save to My Worlds.</dd>
              <dt>Sharing</dt>
              <dd>Build together creates a temporary room with an invite link you can copy. Anyone with the link can join while the room is open to new people; the owner can close it. Rooms expire about two hours after the last activity, so export a copy to keep the build.</dd>
              <dt>Students</dt>
              <dd>Join a class with your enrollment code and choose a username and password. Returning students sign in with their class code, username and password. Forgot your password? Ask your teacher for a temporary one.</dd>
              <dt>Teachers</dt>
              <dd>Sign in with your teacher account, create a class, and give students its enrollment code. Create whole-class or group worlds from My Class and manage students from the roster.</dd>
            </dl>
          </section>
          <section id="privacy" className="landing-fineprint-card" aria-labelledby={privacyId}>
            <h2 id={privacyId}>Privacy</h2>
            <p className="landing-fineprint-note">A plain summary of how the app handles your work today. It is not a full privacy policy.</p>
            <ul>
              <li>Guest building stores your draft, settings, and character choices in this browser only. Clearing site data removes them.</li>
              <li>A shared guest room keeps the build and builder names on the server while the room is active, and deletes them about two hours after the last activity.</li>
              <li>A class account stores a username, a roster name that only you and your teacher see, protected sign-in credentials, and the worlds you save. Students never need an email address.</li>
              <li>Teacher sign-in uses your existing teacher account. Google sign-in confirms your existing teacher account.</li>
              <li>Vercel hosts the app, Cloudflare runs shared rooms, and Supabase handles accounts. Fonts are loaded from Google Fonts.</li>
              <li>Questions about a class account go to the teacher. Teachers reach the team that set up their account.</li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="landing-footer">
        <BrandLockup size={24} className="landing-brand landing-brand-footer" />
        <nav className="landing-footer-links" aria-label="Footer">
          <a href="#privacy">Privacy</a>
          <a href="#help">Help</a>
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
