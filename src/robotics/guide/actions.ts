import { useBrickStore } from '../../brick/store'
import { useDriveView } from '../drive/driveViewState'
import { plugDeviceIn } from '../wiring/actions'
import { moveMotorToSide } from './fixes'
import type { StepAction } from './nextSteps'

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
      for (let turn = 0; turn < action.rotation; turn += 1) useBrickStore.getState().rotate()
      if (action.at) useBrickStore.getState().setDraftPosition(action.at.x, action.at.y, action.at.z)
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
    case 'fix':
      moveMotorToSide(action.brickId)
      return
  }
}
