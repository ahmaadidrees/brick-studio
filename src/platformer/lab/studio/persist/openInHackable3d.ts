/**
 * "Open in Hackable 3D" from the classic 3D builder (docs/qa/hackable-3d/SPIKE.md, "How existing 3D builds would
 * open"): a copy of the build as a new Hackable 3D project, kept the way a new project from /3d/hackable?new=1 is kept
 * (in the account when signed in, else this browser; StudioApp keepNewProject). The classic build is never changed.
 *
 * The classic builder imports this module only when the kid asks (it brings the whole studio with it).
 */
import { browserClassroomClient, type ClassroomClientSurface } from '../../../../classroom/client'
import type { BrickStudioDocument } from '../../../../../packages/brick-core/src/brickDocument'
import { keepNewProject } from '../StudioApp'
import { classicToHackable3d } from '../three/project3d'

/** What the kid reads when this computer would not keep the copy (and the account did not either). */
export const NOT_KEPT_3D = 'We couldn’t keep a Hackable 3D copy on this computer. Remove a project you no longer need in My projects, or sign in, then try again. Your 3D build is unchanged.'

/**
 * Copy a classic 3D build into a new Hackable 3D project and keep it. Returns the project's address. Throws, with the
 * kid's reason, when it could not be kept anywhere. `document` is read, never changed.
 */
export async function keepClassicAsHackable3d(
  document: Pick<BrickStudioDocument, 'bricks' | 'customParts' | 'plateSize' | 'environmentId'>,
  name: string,
  client: ClassroomClientSurface = browserClassroomClient,
): Promise<string> {
  const project = classicToHackable3d(document, name)
  const { home, href } = await keepNewProject(project, client)
  if (home.kind === 'unsaved' || !href) throw new Error(NOT_KEPT_3D)
  return href
}
