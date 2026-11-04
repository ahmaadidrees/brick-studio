import { Plus } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { COURSES } from '@brick-studio/platformer-core/levels/courses'
import { RACE_COURSES } from '@brick-studio/platformer-core/levels/raceCourses'
import { Button, Sheet } from '../ui'
// From their own modules, not the shell barrel: screens that mock '../shell' in tests still get the real ones.
import { joinPath } from '../shell/navigation'
import { useClassroomSession } from '../shell/useClassroomSession'
import { raceThumb } from '../platformer/race/raceThumb'
import { levelThumb } from '../platformer/ui/thumbs'
import { BUILD_3D_HREF, DEFAULT_BUILDER, FROM_NOTHING_HREF, GAME_START_HREF, HACKABLE_3D_HREF, OTHER_BUILDER_LABEL, gameStart, type BuilderKind, type GameId } from './gameStarts'
import './projects.css'

/** Where each choice goes: the builder, on a new project of that kind. */
export const NEW_PROJECT_HREF = {
  build3d: BUILD_3D_HREF,
  platformer: GAME_START_HREF.platformer.classic,
  raceStarter: GAME_START_HREF.race.classic,
  template: (id: string) => `/2d/build?new=1&template=${encodeURIComponent(id)}`,
  hackable: GAME_START_HREF.platformer.hackable,
  hackableRace: GAME_START_HREF.race.hackable,
  hackable3d: HACKABLE_3D_HREF,
}

const MEDIA = '/brand/media'
const SIGNIN_HREF = joinPath({ mode: 'signin' })

/** Each game, as its card says it. */
const GAMES: readonly { id: GameId; name: string; blurb: string }[] = [
  { id: 'platformer', name: 'Platformer', blurb: 'Side view. Run, jump and stomp critters to reach the flag.' },
  { id: 'race', name: 'Racing', blurb: 'Top view. Paint a track, set the laps and race.' },
]

/**
 * The picture on a game's card shows what its Start opens. The classic race kit starts on Brick Speedway; Hackable
 * Racing starts on its beginner oval (a capture of a new /2d/hackable-race project, public/brand/media/MEDIA.md).
 */
const GAME_PICTURE: Readonly<Record<GameId, Readonly<Record<BuilderKind, { src: string; position: string }>>>> = {
  platformer: {
    classic: { src: `${MEDIA}/platformer-game-800.webp`, position: '20% 80%' },
    hackable: { src: `${MEDIA}/platformer-game-800.webp`, position: '20% 80%' },
  },
  race: {
    classic: { src: `${MEDIA}/race-track-1200.webp`, position: '30% 85%' },
    hackable: { src: `${MEDIA}/hackable-race-oval-800.webp`, position: '50% 85%' },
  },
}

/** "Or play one first": one starter per game, copied into the builder as the kid's own. */
const STARTER_IDS: readonly { id: string; game: GameId }[] = [
  { id: 'workshop', game: 'platformer' },
  { id: 'speedway', game: 'race' },
  { id: 'oval', game: 'race' },
]

export type NewProjectSheetProps = {
  open: boolean
  onClose: () => void
  onPick?: (href: string) => void
  /** Put the keyboard on this game's Start when the sheet opens (the landing's game cards). */
  focusGame?: GameId
  /** Which builder each game's Start opens (tests); the app uses DEFAULT_BUILDER. */
  defaults?: Readonly<Record<GameId, BuilderKind>>
  /** The empty-stage start; the card shows only when there is one (tests turn it on). */
  fromNothingHref?: string | null
}

/**
 * "Make a game": one card per game. Start opens that game's default builder (classic until the Hackable versions
 * reach parity, src/projects/gameStarts.ts) and the link under it opens the other one. Then 3D (the classic 3D builder
 * first, Hackable 3D one link away), then a starter to play first. A project keeps the kind it starts as; rooms, inviting, saving, Build and Play work the same for all.
 */
export function NewProjectSheet({ open, onClose, onPick = (href) => window.location.assign(href), focusGame, defaults = DEFAULT_BUILDER, fromNothingHref = FROM_NOTHING_HREF }: NewProjectSheetProps) {
  const session = useClassroomSession()
  const focusRef = useRef<HTMLButtonElement>(null)
  const starters = useMemo(() => {
    if (!open) return []
    return STARTER_IDS.flatMap(({ id, game }) => {
      if (game === 'race') {
        const c = RACE_COURSES.find((r) => r.id === id)
        return c ? [{ id, title: c.title, kind: 'Racing', picture: raceThumb(c.level(), `race:${c.id}`) }] : []
      }
      const c = COURSES.find((r) => r.id === id)
      return c ? [{ id, title: c.title, kind: 'Platformer', picture: levelThumb(c.level(), `course:${c.id}`) }] : []
    })
  }, [open])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What do you want to make?"
      description="Pick a start. Every brick can be changed later, and you can always make your own."
      variant="dialog"
      size="lg"
      className="projects-new"
      initialFocusRef={focusGame ? focusRef : undefined}
    >
      <div className="projects-games">
        {GAMES.map((game) => {
          const start = gameStart(game.id, defaults)
          const picture = GAME_PICTURE[game.id][start.builder]
          return (
            <article key={game.id} className="projects-game" data-game={game.id} data-builder={start.builder}>
              <img className="projects-game-picture" src={picture.src} style={{ objectPosition: picture.position }} alt="" draggable={false} />
              <div className="projects-game-body">
                <h3>{game.name}</h3>
                <p>{game.blurb}</p>
                <Button ref={game.id === focusGame ? focusRef : undefined} variant="primary" fullWidth aria-label={`Start a ${game.name === 'Racing' ? 'race' : 'platformer'}`} onClick={() => onPick(start.href)}>
                  Start
                </Button>
                <button type="button" className="projects-game-other" onClick={() => onPick(start.other.href)}>
                  {start.other.label}
                </button>
              </div>
            </article>
          )
        })}
        {fromNothingHref && (
          <article className="projects-game projects-game-blank" data-game="blank">
            <div className="projects-game-picture projects-game-blank-picture" aria-hidden="true">
              <span><Plus size={16} /> New brick</span>
            </div>
            <div className="projects-game-body">
              <h3>From nothing</h3>
              <p>An empty stage. Draw your own bricks and give them code.</p>
              <Button fullWidth aria-label="Start from nothing" onClick={() => onPick(fromNothingHref)}>
                Start
              </Button>
            </div>
          </article>
        )}
      </div>

      {/* The whole row starts a classic 3D build (its Start stretches over it); the link beside it starts Hackable 3D. */}
      <div className="projects-3d" data-game="3d">
        <img src={`${MEDIA}/build-3d-stairs-880.webp`} alt="" draggable={false} />
        <span className="projects-3d-copy">
          <strong id="projects-3d-title">Or build in 3D</strong>
          <span id="projects-3d-text">Stack bricks on a plate, pick a scene, then walk around inside.</span>
        </span>
        <span className="projects-3d-actions">
          <button type="button" className="projects-3d-start" aria-labelledby="projects-3d-title" aria-describedby="projects-3d-text" onClick={() => onPick(NEW_PROJECT_HREF.build3d)}>
            Start
          </button>
          <button type="button" className="projects-game-other projects-3d-other" aria-describedby="projects-3d-title" onClick={() => onPick(NEW_PROJECT_HREF.hackable3d)}>
            {OTHER_BUILDER_LABEL.hackable}
          </button>
        </span>
      </div>

      <section className="projects-starters" aria-labelledby="projects-starters-title">
        <h3 id="projects-starters-title">Or play one first, then make it yours</h3>
        <div className="projects-starter-row">
          {starters.map((s) => (
            <button key={s.id} type="button" className="projects-starter" onClick={() => onPick(NEW_PROJECT_HREF.template(s.id))}>
              <span className="projects-starter-picture">{s.picture && <img src={s.picture} alt="" draggable={false} />}</span>
              <span className="projects-starter-text">
                <span className="projects-starter-title">{s.title}</span>
                <span className="projects-muted">{s.kind}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {session.status === 'guest' && (
        <p className="projects-new-saving">
          {/* Through onPick, like every choice here, so a game that is open saves before it leaves. */}
          Your game saves on this computer.{' '}
          <a href={SIGNIN_HREF} onClick={(event) => { event.preventDefault(); onPick(SIGNIN_HREF) }}>Sign in</a> to keep it in your account.
        </p>
      )}
    </Sheet>
  )
}
