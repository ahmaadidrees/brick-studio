/**
 * Code Lab core entry point: every lane's primitives in one table, and Play (decision 1: reload the design, then
 * fire the green flag). The UI talks to this module, not to the lane files.
 */
import { clonePrimitives } from './clones'
import type { LevelDesign, PrimitiveTable } from './contracts'
import { dataPrimitives } from './data'
import { looksPrimitives, onGreenFlagLooks, onStopAllLooks } from './looks'
import { motionPrimitives } from './motion'
import { operatorPrimitives } from './operators'
import { instantiate } from './project'
import { Runtime } from './runtime'
import { clearQuestions, sensingPrimitives } from './sensing'
import { onGreenFlagSound, onStopAllSound, soundPrimitives } from './sound'

export const ALL_PRIMITIVES: PrimitiveTable = {
  ...motionPrimitives,
  ...looksPrimitives,
  ...soundPrimitives,
  ...operatorPrimitives,
  ...dataPrimitives,
  ...sensingPrimitives,
  ...clonePrimitives,
}

/** A fresh world and runtime for this design. Call `runtime.greenFlag()` to start, `runtime.step()` per tick. */
export function createRuntime(design: LevelDesign): Runtime {
  return new Runtime(instantiate(design), ALL_PRIMITIVES, {
    greenFlag: [onGreenFlagLooks, onGreenFlagSound],
    stopAll: [onStopAllLooks, onStopAllSound, clearQuestions],
  })
}

/** Play: always restarts from the saved design, then fires the green flag. */
export function play(design: LevelDesign): Runtime {
  const runtime = createRuntime(design)
  runtime.greenFlag()
  return runtime
}

export { Runtime }
