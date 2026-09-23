import { activateProgram, addProgram, currentSection, programsOf } from '../code/programActions'
import { useCodeView } from '../code/codeViewState'
import { startPainting } from '../paint/paint'
import { starterFor } from '../program/starters'
import { useRoboticsStore } from '../state/roboticsStore'
import type { StepAction } from './nextSteps'

/**
 * What the "Make it yours" ideas beyond placing a part do (lane P): paint (the robot panel's Paint
 * row, already painting in the brush colour), rename (the cursor in the robot's name field) and
 * code (Code opens on the program that began as the idea's starter, made if there is none yet).
 */
export function runIdeaAction(action: Extract<StepAction, { kind: 'paint' | 'rename' | 'code' }>): void {
  switch (action.kind) {
    case 'paint':
      // The Paint row scrolls itself into sight once it is painting.
      startPainting()
      return
    case 'rename': {
      const field = document.querySelector<HTMLInputElement>('[data-testid=robotics-panel] input.robotics-name')
      field?.focus()
      field?.select()
      return
    }
    case 'code': {
      const creation = useRoboticsStore.getState().model.creations.find((candidate) => candidate.id === action.creationId)
      if (!creation) return
      const existing = programsOf(currentSection(), creation.id).find((program) => program.starter === action.starter)
      if (existing) activateProgram(creation.id, existing.id)
      else {
        const starter = starterFor(creation, action.starter)
        if (starter) addProgram(creation, starter)
      }
      useCodeView.getState().openCode(creation.id)
      return
    }
  }
}
