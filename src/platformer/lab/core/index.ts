/**
 * Code Lab core entry point: every lane's primitives in one table, and Play (decision 1: reload the design, then
 * fire the green flag). The UI talks to this module, not to the lane files.
 */
import { clonePrimitives } from './clones'
import { DEFAULT_PHYSICS, designKit, type KitId, type LevelDesign, type PrimitiveTable, type World } from './contracts'
import { dataPrimitives } from './data'
import { looksPrimitives, onGreenFlagLooks, onStopAllLooks } from './looks'
import { motionPrimitives } from './motion'
import { operatorPrimitives } from './operators'
import { everyTickLifecycle, physicsStep, platformerPrimitives, selfMovePrimitives } from './platformer'
import { instantiate } from './project'
import { racePrimitives, raceStep } from './race'
import { Runtime, type RuntimeLifecycle } from './runtime'
import { clearQuestions, sensingPrimitives } from './sensing'
import { onGreenFlagSound, onStopAllSound, soundPrimitives } from './sound'
import { kit3dPrimitives } from '../kit3d/blocks3d'
import { instantiate3d, kit3dLifecycle } from '../kit3d/engine3d'
import type { LevelDesign3 } from '../kit3d/contracts3d'

/** The blocks every kit has: Scratch's own (Motion, Looks, Sound, Operators, Variables, Sensing, clones). */
const SCRATCH_PRIMITIVES: PrimitiveTable = {
  ...motionPrimitives,
  ...looksPrimitives,
  ...soundPrimitives,
  ...operatorPrimitives,
  ...dataPrimitives,
  ...sensingPrimitives,
  ...clonePrimitives,
}

export const ALL_PRIMITIVES: PrimitiveTable = {
  ...SCRATCH_PRIMITIVES,
  ...platformerPrimitives,
  ...selfMovePrimitives,
}

/** What a kit adds to the shared runtime: its blocks and the hooks that run around every tick. */
export interface KitEngine {
  primitives: PrimitiveTable
  lifecycle: Partial<RuntimeLifecycle>
  /** The kit makes its own world from the design (3D: every copy gets a z and a box). Missing: the core's instantiate. */
  instantiate?: (design: LevelDesign) => World
}

const platformerEngine: KitEngine = {
  primitives: ALL_PRIMITIVES,
  lifecycle: {
    greenFlag: [onGreenFlagLooks, onGreenFlagSound],
    afterGreenFlag: [everyTickLifecycle.afterGreenFlag],
    stopAll: [onStopAllLooks, onStopAllSound, clearQuestions, everyTickLifecycle.stopAll],
    afterTick: [everyTickLifecycle.afterTick, (runtime) => physicsStep(runtime)],
  },
}

/**
 * Hackable Racing (R1): the Platformer's blocks with gravity left off (cars move themselves with the self-move blocks),
 * plus the Racing blocks. Laps are counted after the tick's scripts have moved the cars.
 */
const raceEngine: KitEngine = {
  primitives: { ...ALL_PRIMITIVES, ...racePrimitives },
  lifecycle: {
    ...platformerEngine.lifecycle,
    afterTick: [...(platformerEngine.lifecycle.afterTick ?? []), raceStep],
  },
}

/**
 * Hackable 3D (D1, docs/qa/hackable-3d/D1.md): Scratch's blocks and the Platformer's, taught a z and studs
 * (kit3d/blocks3d.ts), on its own world (plain build bricks are scenery, code bricks and Heroes are targets) with the 3D
 * physics step after each tick.
 */
const engine3d: KitEngine = {
  primitives: { ...ALL_PRIMITIVES, ...kit3dPrimitives },
  lifecycle: kit3dLifecycle,
  instantiate: (design) => instantiate3d(design as LevelDesign3),
}

/** The kits this core can run. */
const KIT_ENGINES: Partial<Record<KitId, KitEngine>> = { platformer: platformerEngine, race: raceEngine, '3d': engine3d }

export const hasKitEngine = (kit: KitId): boolean => !!KIT_ENGINES[kit]

/** A fresh world and runtime for this design. Call `runtime.greenFlag()` to start, `runtime.step()` per tick. */
export function createRuntime(design: LevelDesign): Runtime {
  const kit = designKit(design)
  const engine = KIT_ENGINES[kit]
  if (!engine) throw new Error(`This version cannot run ${kit} projects yet.`)
  const world = engine.instantiate ? engine.instantiate(design) : instantiate(design)
  // A level with pits has no floor: falling off the bottom is falling out of the level (the sides stay walls).
  if (design.pits === true) world.physics = { ...DEFAULT_PHYSICS, walls: { ...DEFAULT_PHYSICS.walls, bottom: false } }
  return new Runtime(world, engine.primitives, engine.lifecycle)
}

/** Play: always restarts from the saved design, then fires the green flag. */
export function play(design: LevelDesign): Runtime {
  const runtime = createRuntime(design)
  runtime.greenFlag()
  return runtime
}

export { Runtime }
