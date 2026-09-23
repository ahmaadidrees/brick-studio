import type { BodyPose, ContactReport, VisitorPhase } from '../sim/mechanics'
import type { Vec3 } from '../model/vec'
import type { BlockDiagnostic, DeviceId, JoystickAxis, LightColor, ProgramKey } from '../program/types'

/**
 * Checkpoint 2 shared contract: running a program (docs/robotics/CP2-PLAN.md §4).
 *
 * Seeded by the lead. The program lane implements `ProgramRuntime`; the run lane
 * implements `RunController` and the arbiter and calls the runtime once per fixed step.
 * Additive changes only; anything else goes through the lead.
 *
 * Tick order (contract §8), one fixed step each:
 *   1. sample inputs and sensors            → TickSnapshot
 *   2. runtime.tick(snapshot)                 → intents (autonomous scripts first, controller scripts last)
 *   3. arbitrate                              → at most one command per actuator; a controller script
 *                                               wins for actuators it wrote this tick
 *   4. apply to the mechanics, step physics
 *   5. read back                              → readings for the next snapshot and the stage
 */

export type InputSample = {
  /** Keys held now (arrow keys and space). */
  held: Record<ProgramKey, boolean>
  /** Keys that went down since the previous tick (key-repeat coalesced away). */
  pressed: ProgramKey[]
  /** -100..100. The on-screen joystick, or the arrow keys when the joystick is idle. */
  joystick: Record<JoystickAxis, number>
}

export type SensorReading = {
  /** Studs to the nearest hit along the face, or `SENSOR_MAX_RANGE_STUDS` when nothing is in range. */
  distanceStuds: number
  /** A hit exists within range. */
  hit: boolean
}

export type MotorReading = {
  /** The command in force, percent (0 when holding a position target or stopped). */
  powerPercent: number
  /** Measured, percent of full speed, signed. */
  speedPercent: number
  /** Motor: output angle since Run. Hinge motor: arm angle from the built pose. Degrees. */
  positionDegrees: number
  /** False when the device has no cable: it ignores commands. */
  plugged: boolean
  /**
   * Motor turning a wheel of the drive pair: the measured speed as the creation feels it,
   * percent, positive = pushing the creation forward. Two motors at +40 % whose readings
   * here are +40 and -40 are fighting (one is mounted reversed). Null when the motor turns
   * no drive wheel. Informational: blocks read `speedPercent`. (Additive, run lane.)
   */
  forwardPercent?: number | null
  /** Hinge motor: why the arm is not following its command (`locked`: built into the frame; `blocked`: pushing against something). (Additive, run lane.) */
  stuck?: 'locked' | 'blocked' | null
}

export type TickSnapshot = {
  tick: number
  /** Seconds since Run: tick × fixed step. */
  timeSeconds: number
  input: InputSample
  sensors: Record<DeviceId, SensorReading>
  /** Motors and hinge motors. */
  motors: Record<DeviceId, MotorReading>
  buttons: Record<DeviceId, boolean>
}

export type IntentSource = { scriptId: string; blockId?: string; controller: boolean }

export type ActuatorIntent =
  | { kind: 'motorPower'; deviceId: DeviceId; percent: number; source: IntentSource }
  | { kind: 'motorTarget'; deviceId: DeviceId; degrees: number; source: IntentSource }
  /** Hold still where it is (brake). */
  | { kind: 'motorStop'; deviceId: DeviceId; source: IntentSource }
  | { kind: 'light'; deviceId: DeviceId; color: LightColor | null; source: IntentSource }

export type RuntimeTickResult = {
  intents: ActuatorIntent[]
  /** Blocks executing this tick, for highlighting. */
  activeBlockIds: string[]
  /** New this tick (a runtime reports each problem once). */
  diagnostics: BlockDiagnostic[]
  variables: Record<string, number | boolean>
  /** Every script has finished and no controller or event hat can start one. */
  idle: boolean
}

/** Implemented by the program lane (`runtime/createProgramRuntime`). Synchronous and deterministic. */
export interface ProgramRuntime {
  tick(snapshot: TickSnapshot): RuntimeTickResult
  /** Cancel every script. Idempotent. The controller brakes the actuators. */
  stop(): void
}

export type RunSpace = 'testPlate' | 'myWorld'

/**
 * Test props belong to the testing space (contract §7.4): they exist only in a run, never
 * in the document. A wall stands still; a visitor walks up to a point and back when asked,
 * so a sensor has something to see in My world.
 */
export type TestProp =
  | { id: string; kind: 'wall'; center: Vec3; size: Vec3 }
  | { id: string; kind: 'visitor'; path: Vec3[]; size: Vec3; secondsPerLeg: number; /** Which way the figure looks while it waits (world, horizontal). Additive, run lane. */ facing?: Vec3 }

export type SensorBeam = { deviceId: DeviceId; from: Vec3; to: Vec3; hit: boolean }

export type RunPhase = 'ready' | 'running' | 'stopped'

/** What the stage shows; the readings are the values the blocks read (contract §8). */
export type RunObservation = {
  phase: RunPhase
  tick: number
  timeSeconds: number
  sensors: Record<DeviceId, SensorReading>
  motors: Record<DeviceId, MotorReading>
  lights: Record<DeviceId, LightColor | null>
  buttons: Record<DeviceId, boolean>
  beams: SensorBeam[]
  /** Arm bodies touching something (the "built into the frame" stage highlight). */
  contacts: ContactReport[]
  activeBlockIds: string[]
  /** Everything the runtime and controller reported during this run, oldest first, de-duplicated. */
  diagnostics: BlockDiagnostic[]
  /** Chassis speed, studs per second (rover readout). */
  speedStudsPerSecond: number
  variables: Record<string, number | boolean>
  /** The runtime said every script has finished (motors keep their last command). (Additive, run lane.) */
  idle?: boolean
  /** Where the visitor prop is in its walk, when there is one. (Additive, run lane.) */
  visitorPhase?: VisitorPhase | null
}

/** Implemented by the run lane (`run/controller.ts`). One per stage; Reset = dispose and create another. */
export interface RunController {
  readonly space: RunSpace
  readonly phase: RunPhase
  readonly props: readonly TestProp[]
  /** Bricks the stage draws itself while this controller exists (the studio hides its copies). */
  readonly simulatedBrickIds: ReadonlySet<string>
  /** Bricks the studio hides while this stage is shown: the creation's in My world, every brick on the test plate. (Additive, run lane.) */
  readonly hiddenBrickIds: ReadonlySet<string>
  /** Start a program from the current pose (tick 0, fresh runtime). Null runs no program (a bare stage). */
  run(runtime: ProgramRuntime | null): void
  /** Stop the program and brake every actuator; the pose stays. */
  stop(): void
  /** Advance by frame time (fixed steps inside; the mechanics clock policy applies). */
  advance(frameSeconds: number): void
  /** Input from the stage: keys, the on-screen joystick, a clicked button part. */
  setKey(key: ProgramKey, down: boolean): void
  setJoystick(up: number, right: number): void
  setButton(deviceId: DeviceId, down: boolean): void
  /** Send the visitor prop on its walk (gate and signal post in My world). */
  triggerVisitor(): void
  observe(): RunObservation
  poses(): Map<string, BodyPose>
  bodyOfBrick(brickId: string): string | null
  propPoses(): Map<string, BodyPose>
  dispose(): void
}
