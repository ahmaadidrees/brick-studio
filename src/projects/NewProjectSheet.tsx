import { Blocks, Code2, Flag, Footprints } from 'lucide-react'
import { useMemo } from 'react'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { COURSES } from '@brick-studio/platformer-core/levels/courses'
import { RACE_COURSES, brickSpeedway } from '@brick-studio/platformer-core/levels/raceCourses'
import { Button, Sheet } from '../ui'
import { raceThumb } from '../platformer/race/raceThumb'
import { levelThumb } from '../platformer/ui/thumbs'
import './projects.css'

/** Where each choice goes: the builder, on a new project of that kind. */
export const NEW_PROJECT_HREF = {
  build3d: '/build?new=1',
  platformer: '/2d/build?new=1',
  raceStarter: '/2d/build?new=1&kit=race-starter',
  raceEmpty: '/2d/build?new=1&kit=race-empty',
  template: (id: string) => `/2d/build?new=1&template=${encodeURIComponent(id)}`,
  hackable: '/2d/hackable?new=1',
}

/**
 * "New project": what do you want to make? A project keeps the kind it starts as. Each kind starts empty or from a
 * starter; rooms, inviting, saving, Build and Play work the same for all of them.
 */
export function NewProjectSheet({ open, onClose, onPick = (href) => window.location.assign(href) }: { open: boolean; onClose: () => void; onPick?: (href: string) => void }) {
  const pictures = useMemo(() => {
    if (!open) return null
    return {
      platformer: levelThumb(createBlankLevel(160, 27, 'My world'), 'blank:cartoon'),
      race: raceThumb(brickSpeedway(), 'race:speedway'),
      starters: [
        ...COURSES.map((c) => ({ id: c.id, title: c.title, kind: 'Platformer', picture: levelThumb(c.level(), `course:${c.id}`) })),
        ...RACE_COURSES.map((c) => ({ id: c.id, title: c.title, kind: 'Race track', picture: raceThumb(c.level(), `race:${c.id}`) })),
      ],
    }
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="New project" description="What do you want to make? A project keeps the kind it starts as." variant="dialog" size="lg" className="projects-new">
      <div className="projects-kinds">
        <article className="projects-kind">
          <div className="projects-kind-picture">
            <img src="/brand/media/demo-3d-poster.jpg" alt="" draggable={false} />
          </div>
          <h3>
            <Blocks size={18} aria-hidden="true" /> 3D build
          </h3>
          <p>Snap bricks together in 3D: houses, robots, whole towns. Walk around in it.</p>
          <div className="projects-kind-actions">
            <Button variant="primary" onClick={() => onPick(NEW_PROJECT_HREF.build3d)}>
              Start a 3D build
            </Button>
          </div>
        </article>
        <article className="projects-kind">
          <div className="projects-kind-picture">{pictures?.platformer && <img src={pictures.platformer} alt="" draggable={false} />}</div>
          <h3>
            <Footprints size={18} aria-hidden="true" /> Platformer
          </h3>
          <p>Side view. Run, jump, stomp critters and reach the flag.</p>
          <div className="projects-kind-actions">
            <Button variant="primary" onClick={() => onPick(NEW_PROJECT_HREF.platformer)}>
              Start a platformer
            </Button>
          </div>
        </article>
        <article className="projects-kind projects-kind-hackable">
          <div className="projects-kind-picture">
            {pictures?.platformer && <img src={pictures.platformer} alt="" draggable={false} />}
            {/* A taste of what is inside: two of the Hero's own blocks over the level. */}
            <span className="projects-hack-blocks" aria-hidden="true">
              <span className="projects-hack-block projects-hack-hat">when I land</span>
              <span className="projects-hack-block">change <b>jumps left</b> to <i>2</i></span>
            </span>
          </div>
          <h3>
            <Code2 size={18} aria-hidden="true" /> Hackable Platformer <span className="projects-new-tag">New</span>
          </h3>
          <p>A platformer where you can change anything about how it works, with blocks. Open any brick, even your Hero.</p>
          <div className="projects-kind-actions">
            <Button variant="primary" onClick={() => onPick(NEW_PROJECT_HREF.hackable)}>
              Start a Hackable Platformer
            </Button>
          </div>
        </article>
        <article className="projects-kind">
          <div className="projects-kind-picture">{pictures?.race && <img src={pictures.race} alt="" draggable={false} />}</div>
          <h3>
            <Flag size={18} aria-hidden="true" /> Race track
          </h3>
          <p>Top view. Paint a track with boosts, ice and jumps, set the laps, then race it.</p>
          <div className="projects-kind-actions">
            <Button variant="primary" onClick={() => onPick(NEW_PROJECT_HREF.raceStarter)}>
              Starter track
            </Button>
            <Button onClick={() => onPick(NEW_PROJECT_HREF.raceEmpty)}>Empty field</Button>
          </div>
        </article>
      </div>
      <section className="projects-starters" aria-labelledby="projects-starters-title">
        <h3 id="projects-starters-title">Or start from a starter</h3>
        <p className="projects-muted">A copy that's yours to change.</p>
        <div className="projects-starter-row">
          {pictures?.starters.map((s) => (
            <button key={s.id} type="button" className="projects-starter" onClick={() => onPick(NEW_PROJECT_HREF.template(s.id))}>
              <span className="projects-starter-picture">{s.picture && <img src={s.picture} alt="" draggable={false} />}</span>
              <span className="projects-starter-title">{s.title}</span>
              <span className="projects-muted">{s.kind}</span>
            </button>
          ))}
        </div>
      </section>
    </Sheet>
  )
}
