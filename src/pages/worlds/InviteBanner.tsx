import { Play } from 'lucide-react'
import { Button } from '../../ui'
import { initialsOf, liveHref, nameList, type WorldsWorld } from './worldsData'

type Props = {
  /** Already narrowed to the unseen invites, newest first; the banner shows at most three. */
  invites: WorldsWorld[]
  busy?: boolean
  /** "Not now": remember this invite and drop it from the banner. */
  onDismiss: (world: WorldsWorld) => void
  /** "Join and build" / "Visit": remember it too, then let the link take the student to the room. */
  onJoin: (world: WorldsWorld) => void
}

const MAX = 3

/**
 * "Finn O. invited you to build Pixel Arcade" — the student's way into a world a classmate opened
 * for them, above their own worlds and only until they answer it. Nothing here is a teacher's view:
 * the banner exists for invites (`visibility: 'members'`) the student has not dismissed or joined.
 */
export function InviteBanner({ invites, busy, onDismiss, onJoin }: Props) {
  const shown = invites.slice(0, MAX)
  if (shown.length === 0) return null
  return <section className="worlds-invites" aria-label="Invites">
    {shown.map(world => {
      const here = world.buildingNames ?? []
      return <article key={world.id} className="worlds-invite" aria-label={`Invite to ${world.title}`}>
        <span className="worlds-invite-disc" aria-hidden="true">{initialsOf(world.ownerName)}</span>
        <div className="worlds-invite-text">
          <strong>{world.ownerName} invited you to {world.canEdit ? 'build' : 'look at'} {world.title}</strong>
          {here.length > 0 && <small className="worlds-invite-live">
            <span className="worlds-live-dot" aria-hidden="true" /> {nameList(here)} building right now
          </small>}
        </div>
        <div className="worlds-invite-actions">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => onDismiss(world)}>Not now</Button>
          <Button href={liveHref(world)} variant="primary" size="sm" icon={<Play size={16} />} onClick={() => onJoin(world)}>
            {world.canEdit ? 'Join and build' : 'Visit'}
          </Button>
        </div>
      </article>
    })}
  </section>
}
