/**
 * Hackable Racing's starter project (docs/qa/hackable-modes/R1-SCREENS.md B.3): the beginner track, the Car, two
 * Computer racers and the Starter, with every brick's blocks, so the studio can open, code and save it like the
 * Platformer's starter.
 */
import type { StudioProject } from '../store'
import { CAR_BRICK_ID, RACER_BRICK_ID, createCarWorkspace, createRacerWorkspace } from './carBrick'
import { STARTER_BRICK_ID, TRACK_BRICK_KEYS, createBeginnerRace, createRaceStageWorkspace, createStarterWorkspace, trackWorkspace } from './raceTrack'

export function createRaceStarterProject(): StudioProject {
  const design = createBeginnerRace()
  const workspaces: Record<string, unknown> = {
    [design.stage.id]: createRaceStageWorkspace(),
    ...Object.fromEntries(TRACK_BRICK_KEYS.map((key) => [`brick_${key}`, trackWorkspace(key)])),
    [STARTER_BRICK_ID]: createStarterWorkspace(),
    [CAR_BRICK_ID]: createCarWorkspace(),
    [RACER_BRICK_ID]: createRacerWorkspace(),
  }
  return { design, workspaces }
}
