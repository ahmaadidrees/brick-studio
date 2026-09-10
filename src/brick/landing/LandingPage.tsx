import {
  ArrowRight,
  Check,
  Crown,
  Footprints,
  Cloud,
  Shapes,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { BrickMark, HeroDiorama } from './LandingArt'
import './landing.css'

/**
 * First-pass Brick Studio landing page. Pure presentation: local CSS/SVG art
 * only, no store, protocol, or 3D imports. The host mounts it at a route and
 * points the two calls to action wherever the studio and live-room flows
 * live; everything else is self-contained.
 */
export type LandingPageProps = {
  /** Destination of every "Start building" call to action. */
  studioHref?: string
  /** Destination of every "Build together" call to action. */
  liveHref?: string
  className?: string
}

function SectionHeading({ eyebrow, title, lede, id }: { eyebrow: string; title: string; lede?: string; id: string }) {
  return (
    <div className="landing-section-heading">
      <span className="landing-eyebrow">{eyebrow}</span>
      <h2 id={id}>{title}</h2>
      {lede && <p>{lede}</p>}
    </div>
  )
}

function CtaPair({ studioHref, liveHref, compact }: { studioHref: string; liveHref: string; compact?: boolean }) {
  return (
    <p className={compact ? 'landing-cta-row landing-cta-row-compact' : 'landing-cta-row'}>
      <a className="landing-cta landing-cta-primary" href={studioHref}>
        Start building
        <ArrowRight size={16} aria-hidden="true" />
      </a>
      <a className="landing-cta landing-cta-secondary" href={liveHref}>
        <Users size={16} aria-hidden="true" />
        Build together
      </a>
    </p>
  )
}

function StepCard({ number, icon, title, children }: { number: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="landing-step">
      <span className="landing-step-number" aria-hidden="true">{number}</span>
      <span className="landing-step-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </li>
  )
}

/** Faux live-room roster, echoing the real HUD so the promise looks like the product. */
function RosterMock() {
  return (
    <div className="landing-roster" aria-hidden="true">
      <div className="landing-roster-header">
        <span className="landing-roster-live">
          <span className="landing-roster-pulse" />Live
        </span>
        <span>7 builders together</span>
      </div>
      <ul>
        <li>
          <span className="landing-roster-dot" style={{ background: '#8d6bd9' }} />
          Ms. Rivera
          <span className="landing-roster-badge landing-roster-owner"><Crown size={10} aria-hidden="true" />Owner</span>
        </li>
        <li>
          <span className="landing-roster-dot" style={{ background: '#1fa3b8' }} />
          Maya
          <span className="landing-roster-badge">You</span>
        </li>
        <li><span className="landing-roster-dot" style={{ background: '#7f9f2f' }} />Leo</li>
        <li><span className="landing-roster-dot" style={{ background: '#e2574c' }} />Sam</li>
        <li className="landing-roster-more">+ 3 more building…</li>
      </ul>
    </div>
  )
}

const WORLD_TILES = [
  { key: 'toy-room', name: 'Toy Room', blurb: 'Build on a play table in a warm bedroom.' },
  { key: 'brick-valley', name: 'Brick Valley', blurb: 'A landscape built from giant toy bricks.' },
  { key: 'sky-island', name: 'Sky Island', blurb: 'A floating meadow above the clouds.' },
] as const

const SWATCHES = ['#e7473c', '#f0be54', '#31a06c', '#3e83d7', '#8d6bd9'] as const

export function LandingPage({ studioHref = '/', liveHref = '/live/new', className }: LandingPageProps) {
  const mainId = useId()
  const stepsId = useId()
  const liveId = useId()
  const worldsId = useId()
  const shareId = useId()
  const classroomId = useId()
  const finaleId = useId()

  return (
    <div className={['brick-landing', className].filter(Boolean).join(' ')}>
      <a className="landing-skip" href={`#${mainId}`}>Skip to content</a>

      <header className="landing-nav">
        <span className="landing-brand">
          <BrickMark size={34} />
          <span className="landing-brand-copy">
            <strong>Brick Studio</strong>
            <small>Build your world</small>
          </span>
        </span>
        <nav aria-label="Brick Studio">
          <a className="landing-nav-link" href={studioHref}>Open the studio</a>
        </nav>
      </header>

      <main id={mainId}>
        <section className="landing-hero" aria-label="Brick Studio introduction">
          <div className="landing-hero-copy">
            <p className="landing-hero-kicker">
              <Sparkles size={13} aria-hidden="true" />
              Build, explore, and create together
            </p>
            <h1>
              Build a brick world.
              <br />
              Then <em>step inside it.</em>
            </h1>
            <p className="landing-hero-lede">
              Brick Studio is a playful world-builder that runs right in the browser. Snap bricks into
              castles and obstacle courses, explore them as your own character, and invite the whole
              class to build with you in a shared world.
            </p>
            <CtaPair studioHref={studioHref} liveHref={liveHref} />
            <p className="landing-hero-trust">
              Build and share a guest room without an account. Join your class to save online. No installs.
            </p>
          </div>
          <div className="landing-hero-stage">
            <HeroDiorama />
          </div>
        </section>

        <section className="landing-section" aria-labelledby={stepsId}>
          <SectionHeading
            id={stepsId}
            eyebrow="How it works"
            title="Three moves, endless worlds"
          />
          <ol className="landing-steps">
            <StepCard number="1" icon={<Shapes size={21} aria-hidden="true" />} title="Snap bricks">
              Tap to place, stack, and recolor from a drawer of parts — with undo, copy, and
              camera moves that feel like play, not homework.
            </StepCard>
            <StepCard number="2" icon={<Footprints size={21} aria-hidden="true" />} title="Step inside">
              Flip to Explore and your build becomes a place: walk it, jump it, climb it as a
              block character of your choice.
            </StepCard>
            <StepCard number="3" icon={<Users size={21} aria-hidden="true" />} title="Build with your class">
              Join with your teacher&rsquo;s class code, choose a username, then find your
              class and group worlds in My Class.
            </StepCard>
          </ol>
        </section>

        <section className="landing-section landing-live" aria-labelledby={liveId}>
          <div className="landing-live-grid">
            <div>
              <SectionHeading
                id={liveId}
                eyebrow="Live worlds"
                title="Build together, actually together"
                lede="Share a guest-room link and build together without signing in. Classroom accounts also give you shared worlds everyone can find in My Class."
              />
              <ul className="landing-checklist">
                <li><Check size={15} aria-hidden="true" />Invite friends by link, or find your class and group worlds in My Class</li>
                <li><Check size={15} aria-hidden="true" />Build together, then step inside and explore</li>
                <li><Check size={15} aria-hidden="true" />Teachers manage who can join and when collaboration is open</li>
              </ul>
              <p className="landing-cta-row landing-cta-row-compact">
                <a className="landing-cta landing-cta-secondary" href={liveHref}>
                  <Users size={16} aria-hidden="true" />
                  Start a shared build
                </a>
              </p>
            </div>
            <RosterMock />
          </div>
        </section>

        <section className="landing-section" aria-labelledby={worldsId}>
          <SectionHeading
            id={worldsId}
            eyebrow="Make it yours"
            title="Pick your scene. Pick your builder."
            lede="Give your world a setting, from a cozy playroom to an island in the sky. Then make your character yours with custom colors."
          />
          <div className="landing-worlds">
            {WORLD_TILES.map((world) => (
              <article key={world.key} className="landing-world-card">
                <span className={`landing-world-art landing-world-art-${world.key}`} aria-hidden="true" />
                <h3>{world.name}</h3>
                <p>{world.blurb}</p>
              </article>
            ))}
            <article className="landing-world-card landing-character-card">
              <span className="landing-character-face" aria-hidden="true">
                <span className="landing-character-eyes" />
                <span className="landing-character-smile" />
              </span>
              <h3>Character colors</h3>
              <p>Dress your explorer in your team colors.</p>
              <span className="landing-swatch-row" aria-hidden="true">
                {SWATCHES.map((color, index) => (
                  <span key={color} className="landing-swatch" style={{ background: color }}>
                    {index === 3 && <Check size={13} aria-hidden="true" />}
                  </span>
                ))}
              </span>
            </article>
          </div>
        </section>

        <section className="landing-section landing-share" aria-labelledby={shareId}>
          <div className="landing-share-card">
            <span className="landing-share-icon" aria-hidden="true"><Cloud size={20} aria-hidden="true" /></span>
            <div>
              <h2 id={shareId}>Keep building tomorrow.</h2>
              <p>
                Join your class and save to My Worlds to pick up your work on another device.
                Solo guest builds stay in this browser. Guest rooms are temporary; export a copy to keep your work.
              </p>
            </div>
            <span className="landing-share-icon landing-share-icon-remix" aria-hidden="true"><Sparkles size={20} aria-hidden="true" /></span>
          </div>
        </section>

        <section className="landing-section" aria-labelledby={classroomId}>
          <SectionHeading
            id={classroomId}
            eyebrow="For classrooms"
            title="Made to survive real school days"
          />
          <ul className="landing-classroom">
            <li>
              <ShieldCheck size={17} aria-hidden="true" />
              <strong>A simple student start</strong>
              <span>A class code, a username, and a password. Students don&rsquo;t need an email address.</span>
            </li>
            <li>
              <Users size={17} aria-hidden="true" />
              <strong>Teacher in charge</strong>
              <span>Manage usernames, reset passwords, and control class and group access.</span>
            </li>
            <li>
              <Footprints size={17} aria-hidden="true" />
              <strong>Open in a browser</strong>
              <span>Keyboard and mouse for building, plus touch controls for exploring on tablets and phones.</span>
            </li>
            <li>
              <Sparkles size={17} aria-hidden="true" />
              <strong>Room to recover</strong>
              <span>Undo a mistake while building, or restore an earlier checkpoint of a world saved online.</span>
            </li>
          </ul>
        </section>

        <section className="landing-finale" aria-labelledby={finaleId}>
          <h2 id={finaleId}>Ready when you are</h2>
          <p>Start with one brick. See where it takes you.</p>
          <CtaPair studioHref={studioHref} liveHref={liveHref} compact />
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-brand landing-brand-footer">
          <BrickMark size={24} />
          <strong>Brick Studio</strong>
        </span>
        <p>
          A creative building playground for curious minds. Brick Studio is an independent
          creation and is not affiliated with or endorsed by the LEGO Group.
        </p>
      </footer>
    </div>
  )
}

export default LandingPage
