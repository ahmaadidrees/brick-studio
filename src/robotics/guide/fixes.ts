import { useBrickStore, type BrickHistoryEntry } from '../../brick/store'
import { creationComponent } from '../model/creations'
import { orderFixSteps, planMotorToSide, planPutOnRobot, planWheelFix, type FixOutcome, type FixPlan, type FixRefusal } from '../model/fixPlans'
import type { SnapPose } from '../model/snap'
import { ROBOT_PLATE_PART } from '../parts/catalog'
import { PUT_A_PLATE_DOWN, computeModel, useRoboticsStore, withAdviceMuted, type NoteAction } from '../state/roboticsStore'

/**
 * The one-tap fixes (kid-UX lane W), carried out with the studio's own actions, the way a student
 * would place and move the parts, so everything that follows a placement follows these too:
 * assisted wiring plugs a new motor into the robot's hub, a first motor starts a robot and opens
 * its card. The steps are then folded into one history entry (`mergeHistory`), so one Undo takes
 * the whole fix away. Every pose comes from the planner (`model/fixPlans.ts`), which puts each
 * part on what is under it: nothing a fix moves is left in the air.
 *
 * After a fix the studio is as the student left it: the part they had armed is armed again, or
 * what they had picked is picked again. The line says what was done, with Undo; a fix that can't
 * be done says why and outlines what is in the way.
 */
function turnDraftTo(rotation: number) {
  for (let turn = 0; turn < 4 && useBrickStore.getState().draft?.rotation !== rotation; turn += 1) useBrickStore.getState().rotate()
}

function addPart(partId: string, pose: SnapPose): boolean {
  useBrickStore.getState().choosePart(partId)
  turnDraftTo(pose.rotation)
  useBrickStore.getState().setDraftPosition(pose.x, pose.y, pose.z)
  return useBrickStore.getState().placeDraft()
}

function moveBrick(brickId: string, pose: SnapPose): boolean {
  const store = useBrickStore.getState()
  store.selectBrick(brickId)
  store.startMove()
  if (useBrickStore.getState().movingId !== brickId) return false
  turnDraftTo(pose.rotation)
  useBrickStore.getState().setDraftPosition(pose.x, pose.y, pose.z)
  return useBrickStore.getState().placeDraft()
}

/** History entries recorded after `top` (null: the stack was empty). */
function entriesAfter(top: BrickHistoryEntry | null): number {
  const stack = useBrickStore.getState().undoStack
  if (!top) return stack.length
  const index = stack.lastIndexOf(top)
  return index === -1 ? stack.length : stack.length - 1 - index
}

type Hands = { armed: { partId: string; rotation: number } | null; selected: string[] }

/** What the student had in hand before a fix: an armed part, or picked bricks. */
function hands(): Hands {
  const store = useBrickStore.getState()
  const moving = Boolean(store.movingId || store.movingSelection)
  return {
    armed: store.draft && store.activePartId && !moving ? { partId: store.activePartId, rotation: store.draft.rotation } : null,
    selected: moving ? [] : [...(store.selectedIds.length ? store.selectedIds : store.selectedId ? [store.selectedId] : [])],
  }
}

function giveBack(held: Hands) {
  const store = useBrickStore.getState()
  store.cancelInteraction()
  if (held.armed && store.mode === 'build') {
    useBrickStore.getState().choosePart(held.armed.partId)
    turnDraftTo(held.armed.rotation)
    return
  }
  const present = held.selected.filter((id) => useBrickStore.getState().bricks.some((brick) => brick.id === id))
  if (present.length) useBrickStore.getState().selectBricks(present)
  else useBrickStore.getState().clearSelection()
}

/** Says why a fix can't be done, outlining what is in the way (and where the missing part would go). */
export function showRefusal(outcome: FixRefusal) {
  if (outcome.reason === 'nothing') return
  const action: NoteAction | null = outcome.reason === 'no-plate' ? { kind: 'arm-plate', label: PUT_A_PLATE_DOWN } : null
  useRoboticsStore.setState({ wiringNote: { text: outcome.text, undoable: false, nonce: Date.now(), entry: null, added: [], brickId: outcome.brickId, blockers: outcome.blockers, ghost: outcome.ghost, ...(action ? { action } : {}) } })
}

/** Carries a plan out as one Undo; false (and nothing changed) when it could not be done as planned. */
export function applyFixPlan(plan: FixPlan): boolean {
  const start = useBrickStore.getState()
  if (start.mode !== 'build' || start.graphicsPaused) return false
  const ordered = orderFixSteps(computeModel(start).input, plan.steps)
  if (!ordered) return false
  const held = hands()
  const top = start.undoStack.at(-1) ?? null
  if (start.draft) start.cancelInteraction()
  let ok = true
  withAdviceMuted(() => {
    for (const step of ordered) {
      ok = step.op === 'add' ? addPart(step.partId, step.pose) : moveBrick(step.brickId, step.pose)
      if (!ok) break
    }
  })
  const recorded = entriesAfter(top)
  useBrickStore.getState().cancelInteraction()
  if (!ok) {
    for (let step = 0; step < recorded; step += 1) useBrickStore.getState().undo()
    giveBack(held)
    return false
  }
  if (recorded > 0) useBrickStore.getState().mergeHistory(recorded, plan.undoLabel)
  giveBack(held)
  useBrickStore.setState({ toast: null })
  useRoboticsStore.setState({ wiringNote: { text: plan.done, undoable: true, nonce: Date.now(), entry: useBrickStore.getState().undoStack.at(-1) ?? null, added: [], brickId: plan.brickId, tone: 'done' } })
  return true
}

function carryOut(outcome: FixOutcome): FixOutcome {
  if (!outcome.ok) showRefusal(outcome)
  else if (!applyFixPlan(outcome)) showRefusal({ ok: false, brickId: outcome.brickId, reason: 'no-room', text: 'Something is in the way. Try a bigger plate.', blockers: [], ghost: null })
  return outcome
}

/** A wheel that can't spin: onto an axle end, onto a waiting motor, or a new motor and axle for it. */
export function fixWheel(wheelId: string): FixOutcome {
  return carryOut(planWheelFix(computeModel(useBrickStore.getState()).input, wheelId))
}

/** A part beside a robot, put on it where it works. `creationId` may be the unnamed robot the card is about ("candidate"). */
export function putOnRobot(brickId: string, creationId: string): FixOutcome {
  const model = computeModel(useBrickStore.getState())
  const card = useRoboticsStore.getState().card
  const robot = model.creations.find((creation) => creation.id === creationId)
    ?? (creationId === 'candidate' && card && !card.creationId ? { name: card.suggestedName, brickIds: card.anchorBrickIds } : null)
  if (!robot) return { ok: false, brickId, reason: 'nothing', text: '', blockers: [], ghost: null }
  return carryOut(planPutOnRobot(model.input, robot, brickId))
}

/** A motor whose socket is over its plate, moved to the side (across from the robot's other motor when it has one). */
export function moveMotorToSide(motorId: string): FixOutcome {
  const model = computeModel(useBrickStore.getState())
  const robot = model.creations.find((creation) => creation.brickIds.includes(motorId)) ?? { brickIds: creationComponent(model.input, motorId) }
  return carryOut(planMotorToSide(model.input, motorId, robot))
}

/** Takes a part off (a loose wheel nobody needs): the studio's own Delete, one Undo. */
export function removePart(brickId: string): boolean {
  const held = hands()
  const store = useBrickStore.getState()
  if (store.mode !== 'build' || !store.bricks.some((brick) => brick.id === brickId)) return false
  store.cancelInteraction()
  useBrickStore.getState().selectBrick(brickId)
  useBrickStore.getState().deleteSelected()
  giveBack({ ...held, selected: held.selected.filter((id) => id !== brickId) })
  return true
}

/** Arms the robot plate, as the drawer's first robot tile does. */
export function armRobotPlate() {
  useBrickStore.getState().choosePart(ROBOT_PLATE_PART)
}

/** What a line's button does. */
export function runNoteAction(action: NoteAction): void {
  switch (action.kind) {
    case 'fix-wheel': fixWheel(action.brickId); return
    case 'put-on': putOnRobot(action.brickId, action.creationId); return
    case 'motor-to-side': moveMotorToSide(action.brickId); return
    case 'arm-plate': armRobotPlate(); return
  }
}
