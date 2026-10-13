import { Flag, Footprints } from 'lucide-react'
import { useMemo } from 'react'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { brickSpeedway } from '@brick-studio/platformer-core/levels/raceCourses'
import { Button, Sheet } from '../../ui'
import { raceThumb } from '../race/raceThumb'
import { levelThumb } from './thumbs'

/** Where each choice goes: the builder, on a new world of that kit. */
export const NEW_WORLD_HREF = {
  platformer: '/2d/build?new=1',
  raceStarter: '/2d/build?new=1&kit=race-starter',
  raceEmpty: '/2d/build?new=1&kit=race-empty',
}

/**
 * "New world": pick a kit. A kit decides the camera, the bricks in the panel and how players move; rooms, invites,
 * saving, Build and Play are the same. A world keeps the kit it starts with.
 */
export function KitPicker({ open, onClose, onPick = (href) => window.location.assign(href) }: { open: boolean; onClose: () => void; onPick?: (href: string) => void }) {
  const pictures = useMemo(
    () => (open ? { platformer: levelThumb(createBlankLevel(160, 27, 'My world'), 'blank:cartoon'), race: raceThumb(brickSpeedway(), 'race:speedway') } : null),
    [open],
  )
  return (
    <Sheet open={open} onClose={onClose} title="New world" description="Pick a kit. A world keeps the kit it starts with." variant="dialog" size="lg" className="p2d-kit-picker">
      <div className="p2d-kits">
        <article className="p2d-kit">
          <div className="p2d-kit-picture">{pictures?.platformer && <img src={pictures.platformer} alt="" className="p2d-smooth" draggable={false} />}</div>
          <h3>
            <Footprints size={18} aria-hidden="true" /> Platformer
          </h3>
          <p>Side view. Run, jump, stomp critters and reach the flag.</p>
          <div className="p2d-kit-actions">
            <Button variant="primary" onClick={() => onPick(NEW_WORLD_HREF.platformer)}>
              Start a platformer
            </Button>
          </div>
        </article>
        <article className="p2d-kit p2d-kit-new">
          <div className="p2d-kit-picture">{pictures?.race && <img src={pictures.race} alt="" className="p2d-smooth" draggable={false} />}</div>
          <h3>
            <Flag size={18} aria-hidden="true" /> Race track <span className="p2d-kit-tag">New</span>
          </h3>
          <p>Top view. Paint a track with boosts, ice and jumps, set the laps, then race it.</p>
          <div className="p2d-kit-actions">
            <Button variant="primary" onClick={() => onPick(NEW_WORLD_HREF.raceStarter)}>
              Starter track
            </Button>
            <Button onClick={() => onPick(NEW_WORLD_HREF.raceEmpty)}>Empty field</Button>
          </div>
        </article>
      </div>
    </Sheet>
  )
}
