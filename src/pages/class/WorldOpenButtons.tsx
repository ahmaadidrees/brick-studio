import { Eye, Play } from 'lucide-react'
import { Button } from '../../ui'
import { worldLookHref, worldRoomHref, type ClassPageWorld } from './classPageData'

/**
 * How the teacher opens a world from the class page. A 3D build or a 2D level opens its live room. A Hackable project
 * is played together in its room (the teacher hosts: Restart, remove a player, close the room), or opened to look
 * inside its bricks.
 */
export function WorldOpenButtons({ world }: { world: Pick<ClassPageWorld, 'id' | 'title' | 'format' | 'kit'> }) {
  if (world.format !== 'hackable') return <Button variant="secondary" size="sm" href={worldRoomHref(world)} aria-label={`Open ${world.title}`}>Open</Button>
  return <>
    <Button variant="secondary" size="sm" icon={<Play size={16} />} href={worldRoomHref(world)} aria-label={`Play ${world.title} together`}>Play together</Button>
    <Button variant="quiet" size="sm" icon={<Eye size={16} />} href={worldLookHref(world)} aria-label={`Look inside ${world.title}`}>Look inside</Button>
  </>
}
