/**
 * Checkpoint 2 shared contract: programs (docs/robotics/CP2-PLAN.md §3).
 *
 * Seeded by the lead and shared by the program lane (compiler, runtime) and the run
 * lane (controller, arbiter). Additive changes only (a new optional field, a new union
 * member both sides can ignore); anything else goes through the lead.
 *
 * Units are the student's: studs, degrees, seconds, percent. Never X/Y/Z.
 */

/** A device is its brick: the brick id is the stable device identity blocks and cables use. */
export type DeviceId = string

export type LightColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'white'
export const LIGHT_COLORS: readonly LightColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white']

/** Keyboard keys a `when key … pressed` hat and a `key … held` reporter can name. */
export type ProgramKey = 'up' | 'down' | 'left' | 'right' | 'space'
export const PROGRAM_KEYS: readonly ProgramKey[] = ['up', 'down', 'left', 'right', 'space']

/** `joystick up amount` / `joystick right amount`, -100..100. Arrow keys drive the same axes. */
export type JoystickAxis = 'up' | 'right'

/** The distance sensor's reach. Nothing closer reads as this many studs ("nothing seen"). */
export const SENSOR_MAX_RANGE_STUDS = 40
/** `when <sensor> sees something` means a hit closer than this. */
export const SEES_SOMETHING_STUDS = 5

export type BinaryOp = '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '!=' | 'and' | 'or' | 'min' | 'max'

/** Every node carries the Blockly block id it came from, so the runtime can highlight and diagnose it. */
export type Expr =
  | { kind: 'number'; value: number; blockId?: string }
  | { kind: 'boolean'; value: boolean; blockId?: string }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; blockId?: string }
  | { kind: 'not'; operand: Expr; blockId?: string }
  /** Studs to the nearest thing along the sensor's face; `SENSOR_MAX_RANGE_STUDS` when nothing is in range. */
  | { kind: 'sensorDistance'; deviceId: DeviceId; blockId?: string }
  /** True when something is closer than `withinStuds`. */
  | { kind: 'sensorSees'; deviceId: DeviceId; withinStuds: Expr; blockId?: string }
  /** Degrees: a motor's output angle since Run, or a hinge motor's arm angle from its built pose. */
  | { kind: 'motorPosition'; deviceId: DeviceId; blockId?: string }
  /** Percent of full speed, signed. */
  | { kind: 'motorSpeed'; deviceId: DeviceId; blockId?: string }
  | { kind: 'buttonPressed'; deviceId: DeviceId; blockId?: string }
  | { kind: 'joystick'; axis: JoystickAxis; blockId?: string }
  | { kind: 'keyHeld'; key: ProgramKey; blockId?: string }
  /** Seconds since Run. */
  | { kind: 'timer'; blockId?: string }
  | { kind: 'variable'; name: string; blockId?: string }

/**
 * Statements. Helper blocks (drive / turn / drive using joystick) are lowered by the
 * compiler to `runMotor` on the creation's drive pair with the reversal already folded
 * into the sign, so the IR never needs to know what a drive pair is.
 *
 * Actuator commands latch: a motor keeps the last speed or target it was given until
 * another command, Stop or Reset (a script ending does not stop its motors).
 */
export type Stmt =
  | { op: 'runMotor'; deviceId: DeviceId; percent: Expr; blockId?: string }
  /** Motor: turn the output to an absolute angle (degrees since Run). Hinge motor: arm to this angle (clamped to its range). */
  | { op: 'turnMotorTo'; deviceId: DeviceId; degrees: Expr; blockId?: string }
  | { op: 'stopMotor'; deviceId: DeviceId; blockId?: string }
  /** `stop motors`: every motor and hinge motor in the creation, held where it is. */
  | { op: 'stopAllMotors'; blockId?: string }
  | { op: 'setLight'; deviceId: DeviceId; color: LightColor | null; blockId?: string }
  | { op: 'wait'; seconds: Expr; blockId?: string }
  | { op: 'waitUntil'; condition: Expr; blockId?: string }
  | { op: 'repeat'; count: Expr; body: Stmt[]; blockId?: string }
  | { op: 'forever'; body: Stmt[]; blockId?: string }
  | { op: 'if'; condition: Expr; then: Stmt[]; else?: Stmt[]; blockId?: string }
  | { op: 'setVariable'; name: string; value: Expr; blockId?: string }
  | { op: 'changeVariable'; name: string; by: Expr; blockId?: string }
  | { op: 'stopScript'; blockId?: string }

/**
 * What starts a script (contract §6 hats). Event hats fire on a rising edge; a trigger
 * that arrives while the same script is still running is ignored. Controller hats
 * (`joystickMoves`, `controlsUpdate`) run to completion every tick, after every other
 * script (contract §8), and may not wait or loop forever.
 */
export type ScriptTrigger =
  | { kind: 'run' }
  | { kind: 'sensorSees'; deviceId: DeviceId }
  | { kind: 'buttonPressed'; deviceId: DeviceId }
  | { kind: 'keyPressed'; key: ProgramKey }
  /** Every tick while the joystick or arrow keys are off centre, plus the one tick they return to centre. */
  | { kind: 'joystickMoves' }
  /** Every tick (advanced). */
  | { kind: 'controlsUpdate' }

export const isControllerTrigger = (trigger: ScriptTrigger) => trigger.kind === 'joystickMoves' || trigger.kind === 'controlsUpdate'

export type Script = { id: string; trigger: ScriptTrigger; body: Stmt[]; hatBlockId: string }

export type ProgramIR = { irVersion: 1; scripts: Script[] }

export const IR_LIMITS = Object.freeze({
  maxNodes: 1_000,
  maxDepth: 32,
  maxRepeatCount: 10_000,
  maxOpsPerTick: 5_000,
  maxScripts: 16,
  maxVariables: 32,
})

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type DiagnosticCode =
  /** A block names a device whose brick is gone: "front sensor is missing". */
  | 'device.missing'
  /** A block names a device with no cable: "Not plugged in". The program still runs; that block does nothing. */
  | 'device.unplugged'
  /** A block names a device that is not part of this creation. */
  | 'device.not-in-creation'
  /** A hinge motor whose arm is built into the frame was told to move (run lane, additive): it cannot swing. */
  | 'device.locked'
  /** A helper (drive / turn / joystick drive) with no drive pair: "Choose two drive motors first". */
  | 'drive.no-pair'
  /** Blocks not under a hat are ignored. */
  | 'program.loose-blocks'
  | 'program.no-scripts'
  | 'program.too-big'
  /** A controller script (when joystick moves / when controls update) that waits or loops forever. */
  | 'program.controller-waits'
  | 'program.unknown-block'
  /** An input slot left empty: a number slot uses 0, a condition slot counts as false. */
  | 'program.empty-slot'
  /** Runtime faults and notes. */
  | 'runtime.budget-exceeded'
  | 'runtime.non-finite'
  | 'runtime.two-scripts-one-motor'
  /** The runtime threw; the controller stopped the run (run lane, additive). */
  | 'runtime.error'

export type BlockDiagnostic = {
  code: DiagnosticCode
  severity: DiagnosticSeverity
  /** Plain words for a student, naming their parts. */
  message: string
  blockId: string | null
  deviceId?: DeviceId
  scriptId?: string
}

/** A compile error blocks Run; warnings and infos do not. */
export type CompileResult = { ir: ProgramIR; diagnostics: BlockDiagnostic[]; ok: boolean }

/**
 * A program as the document stores it (robotics section `programs`, additive to v1).
 * The Blockly workspace JSON is the source of truth; the IR is compiled from it at Run
 * and never stored. `deviceNames` remembers the last name each referenced device had,
 * so a block whose brick was deleted can still say which part is missing.
 */
export type RoboticsProgram = {
  id: string
  creationId: string
  name: string
  /** `Blockly.serialization.workspaces.save` output. */
  workspace: unknown
  deviceNames: Record<DeviceId, string>
  /** Which starter it began as, if any (for the goal line). */
  starter?: string
  /** Increments on every saved edit; a run records the revision it compiled. */
  revision: number
}

export const PROGRAM_LIMITS = Object.freeze({
  maxWorkspaceBytes: 200_000,
  maxProgramsPerCreation: 8,
  maxNameLength: 40,
})
