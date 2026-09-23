import { useBrickStore } from '../../brick/store'
import { useDriveView } from '../drive/driveViewState'
import { plugDeviceIn } from '../wiring/actions'
import type { StepAction } from './nextSteps'

/**
 * Does what a next-steps row says, through the studio's own actions: arming a part is
 * the drawer's `choosePart` (then R, as many times as the row asks), plugging in is the
 * wiring inspector's `plugDeviceIn`, playing opens Drive / Try it, and a row about a
 * placed brick selects it (so its panel and the command strip's Rotate / Delete are there).
 */
export function runStepAction(action: StepAction): void {
  switch (action.kind) {
    case 'arm': {
      useBrickStore.getState().choosePart(action.partId)
      for (let turn = 0; turn < action.rotation; turn += 1) useBrickStore.getState().rotate()
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
  }
}
