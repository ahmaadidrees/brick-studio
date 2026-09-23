import { useBrickStore } from '../../brick/store'
import { useDriveView } from '../drive/driveViewState'
import { plugDeviceIn } from '../wiring/actions'
import { moveMotorToSide } from './fixes'
import { runIdeaAction } from './ideaActions'
import type { StepAction } from './nextSteps'
import { armOnce, putOnRobot } from './oneShot'

/**
 * Does what a next-steps row says, through the studio's own actions: arming a part is
 * the drawer's `choosePart` (then R, as many times as the row asks, and the ghost set where
 * the part goes when the row knows: the other side), plugging in is the wiring inspector's
 * `plugDeviceIn`, playing opens Drive / Try it, a row about a placed brick selects it (so its
 * panel and the command strip's Rotate / Delete are there), and a fix row runs its one-tap fix.
 */
export function runStepAction(action: StepAction): void {
  switch (action.kind) {
    case 'arm': {
      useBrickStore.getState().choosePart(action.partId)
      // Turned until it faces the way the row asks (a fresh part arms unturned; the robotics layer may have moved its ghost).
      for (let turn = 0; turn < 4 && useBrickStore.getState().draft?.rotation !== action.rotation; turn += 1) useBrickStore.getState().rotate()
      if (action.at) useBrickStore.getState().setDraftPosition(action.at.x, action.at.y, action.at.z)
      // An idea's part comes on its robot's top (lane P); placed once, then the brush is put down
      // (guide/oneShot.ts); a row that asks for several keeps it.
      if (action.onRobot) putOnRobot(action.onRobot)
      if (!action.repeat) armOnce(action.partId, action.onRobot ?? null)
      return
    }
    case 'plug':
      plugDeviceIn(action.deviceId)
      return
    case 'play':
      useDriveView.getState().openDrive(action.creationId)
      return
    case 'select':
      useBrickStore.getState().selectBrick(action.brickId)
      return
    case 'paint':
    case 'rename':
    case 'code':
      runIdeaAction(action)
      return
    case 'fix':
      moveMotorToSide(action.brickId)
      return
  }
}
