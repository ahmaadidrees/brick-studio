/**
 * Building together (docs/qa/hackable-rooms M2): one studio and the room it plays in.
 *
 * - **Out:** a moment after the kid changes the project (placing, painting, a slider, code), the change goes to the room
 *   as edit operations (rooms/edits.ts diffDesigns), never the whole project, so two kids building at once don't
 *   overwrite each other. Only the host can change what operations can't carry (the level's name or size): that goes
 *   as the whole project, as in M1.
 * - **In:** when the room's project changes (someone else's edit, or ours refused), the studio takes it once nothing
 *   of ours is still on its way.
 * - **Blocks:** a kid who may change code gets every brick's blocks from the room before Code opens, so the editor
 *   never starts from an empty canvas. The host gives the room any blocks it lacks or has older.
 * - **Presence:** what the kid is editing ("Walker's code", "Building") goes to everyone's room bar.
 */
import type { LevelDesign } from '../core/contracts'
import { designText } from '../core/save'
import { isStructuralWorkspaceChange } from '../studio/remix'
import { screenOf, STAGE_ID, type StudioStore } from '../studio/store'
import { diffDesigns, kindOfEdit, type EditOp } from './edits'
import type { RoomSession } from './session'

/** Changes go out at most this often while a kid keeps painting (one stroke is a few edits, not hundreds). */
export const EDIT_SEND_MS = 150
/** The studio takes the room's project after this long without news, once nothing of ours is on its way. */
export const FOLLOW_MS = 120

const brickIds = (design: LevelDesign) => [STAGE_ID, ...design.bricks.map((b) => b.id)]

export class RoomBuilder {
  /** The project the studio and the room last agreed on (plus what we have sent since). Null until the first sync. */
  private synced: LevelDesign | null = null
  private syncedWorkspaces: Record<string, unknown> = {}
  private sendTimer: ReturnType<typeof setTimeout> | undefined
  private followTimer: ReturnType<typeof setTimeout> | undefined
  private adopting = false
  private editing: string | null | undefined
  private asked = new Set<string>()

  constructor(readonly session: RoomSession, readonly store: StudioStore) {}

  start(): () => void {
    const offRuntime = this.session.onRuntime(() => this.later())
    const offEdits = this.session.onEdits(() => this.later())
    const offView = this.session.subscribe(() => this.rights())
    const offStore = this.store.subscribe(() => this.changed())
    this.later()
    return () => {
      clearTimeout(this.sendTimer)
      clearTimeout(this.followTimer)
      offRuntime()
      offEdits()
      offView()
      offStore()
      this.store.setRoomRights(null)
    }
  }

  /** The room's project as our game has it now. */
  private roomDesign(): LevelDesign | undefined {
    return this.session.runtime?.world.design
  }

  /** The room has said, for every brick, whether it has blocks for it. Asks for the ones it has not. */
  private roomAnswered(): boolean {
    const design = this.roomDesign()
    if (!design) return false
    let all = true
    for (const id of brickIds(design)) {
      if (this.session.workspaces.has(id) || this.session.missingWorkspaces.has(id)) continue
      all = false
      if (!this.asked.has(id)) {
        this.asked.add(id)
        this.session.askWorkspace(id)
      }
    }
    return all
  }

  /**
   * The kid's rights in the studio. Code waits for every brick's blocks, in the studio itself: the session has them a
   * moment before the studio takes them (follow, after FOLLOW_MS, or later while our own edits are on their way), and a
   * Code editor opened in between started from an empty canvas, saved it over the brick (the Hero's scripts gone, the
   * brick renamed "My Hero") and sent that to everyone as a code change (found in the wave 2 browser run).
   */
  private rights() {
    const view = this.session.view
    if (view.status !== 'online' && !this.store.getState().roomRights) return
    const code = view.code && this.synced !== null && this.roomAnswered() && this.blocksInStudio()
    this.store.setRoomRights({ build: view.build, code })
    this.presence()
  }

  /** Every brick's blocks the room has sent are in the studio's project. */
  private blocksInStudio(): boolean {
    const workspaces = this.store.getState().project.workspaces
    for (const id of this.session.workspaces.keys()) if (workspaces[id] === undefined) return false
    return true
  }

  /** The kid changed something: send it soon (a stroke in progress goes in a few pieces). */
  private changed() {
    this.presence()
    if (this.adopting || !this.synced) return
    const project = this.store.getState().project
    if (project.design === this.synced && project.workspaces === this.syncedWorkspaces) return
    if (this.sendTimer) return
    this.sendTimer = setTimeout(() => {
      this.sendTimer = undefined
      this.send()
    }, EDIT_SEND_MS)
  }

  /** Send what changed since the room and the studio last agreed. */
  send() {
    const synced = this.synced
    if (!synced) return
    const { design, workspaces } = this.store.getState().project
    if (design === synced && workspaces === this.syncedWorkspaces) return
    const view = this.session.view
    // Blocks only go out from a kid who may change code.
    // Opening a brick in Code saves its blocks again, tidied: that alone is no change for anyone else.
    const { ops, other } = diffDesigns(synced, design, this.syncedWorkspaces, view.code ? workspaces : this.syncedWorkspaces, (_id, before, after) => before === undefined || isStructuralWorkspaceChange(before, after))
    if (other) {
      if (view.host && this.session.sendProject(designText(design), false)) return this.agree(design, workspaces)
      return this.followNow()
    }
    if (!ops.length) return this.agree(design, workspaces)
    if (!view[kindOfEdit(synced, ops)]) return this.followNow()
    // A big edit (a costume, a long paint) goes in pieces, each a whole operation.
    for (const part of chunks(ops)) if (!this.session.sendEdit(part)) return this.followNow()
    this.agree(design, workspaces)
  }

  private agree(design: LevelDesign, workspaces: Record<string, unknown>) {
    this.synced = design
    this.syncedWorkspaces = workspaces
  }

  /** Something changed in the room: take it in a moment. */
  private later() {
    clearTimeout(this.followTimer)
    this.followTimer = setTimeout(() => this.follow(), FOLLOW_MS)
    this.rights()
  }

  /** Take the room's project now (our edit was refused, or we may not make it). */
  private followNow() {
    clearTimeout(this.sendTimer)
    this.sendTimer = undefined
    this.agree(this.roomDesign() ?? this.synced!, this.syncedWorkspaces)
    this.follow(true)
  }

  /** The studio takes the room's project, unless something of ours is still on its way. */
  follow(force = false) {
    clearTimeout(this.followTimer)
    const room = this.roomDesign()
    if (!room) return
    if (!force && (this.sendTimer || this.session.editsInFlight > 0)) {
      this.followTimer = setTimeout(() => this.follow(), FOLLOW_MS)
      return
    }
    if (this.synced === null && this.session.view.host) return this.hostArrives(room)
    const state = this.store.getState()
    const workspaces = { ...state.project.workspaces }
    let wsChanged = false
    for (const [id, ws] of this.session.workspaces) {
      if (workspaces[id] !== ws) {
        workspaces[id] = ws
        wsChanged = true
      }
    }
    const sameDesign = state.project.design === room || designText(room) === designText(state.project.design)
    this.adopting = true
    try {
      this.store.adoptRoomProject(sameDesign ? state.project.design : room, wsChanged ? workspaces : state.project.workspaces)
    } finally {
      this.adopting = false
    }
    const now = this.store.getState().project
    this.agree(now.design, now.workspaces)
    this.rights()
  }

  /**
   * The host arrives with the project on screen (maybe newer than the room's: a class room starts from the account's
   * copy). Once the room has said which blocks it has, everything that differs goes in: changes as edits, blocks the
   * room lacks or has older.
   */
  private hostArrives(room: LevelDesign) {
    if (!this.roomAnswered()) {
      this.followTimer = setTimeout(() => this.follow(), FOLLOW_MS)
      return
    }
    const mine = this.store.getState().project.workspaces
    const theirs: Record<string, unknown> = {}
    for (const [id, ws] of this.session.workspaces) {
      // The same blocks: keep our object, so they don't go out again.
      if (mine[id] !== undefined && JSON.stringify(mine[id]) === JSON.stringify(ws)) {
        theirs[id] = mine[id]
        this.session.workspaces.set(id, mine[id])
      } else theirs[id] = ws
    }
    this.agree(room, theirs)
    this.send()
    this.rights()
  }

  /** What the kid is editing, for everyone's room bar. */
  private presence() {
    const s = this.store.getState()
    const screen = screenOf(s)
    let what: string | null = null
    if (screen === 'code') {
      const design = s.project.design
      const name = s.selectedBrickId === STAGE_ID || s.selectedBrickId === design.stage.id ? 'the Stage' : design.bricks.find((b) => b.id === s.selectedBrickId)?.name
      what = name ? `${name}’s code` : 'Code'
    } else if (screen === 'build' && s.roomRights?.build) what = 'Building'
    if (what === this.editing || this.session.view.status !== 'online') return
    this.editing = what
    this.session.setEditing(what)
  }
}

/** Operations in sends of a size the room takes: at most 16 at a time, a big brick on its own. */
export function chunks(ops: EditOp[]): EditOp[][] {
  const out: EditOp[][] = []
  let part: EditOp[] = []
  let bytes = 0
  for (const op of ops) {
    const size = op.op === 'brick' ? JSON.stringify(op).length : 64
    if (part.length && (part.length >= 16 || bytes + size > 200_000)) {
      out.push(part)
      part = []
      bytes = 0
    }
    part.push(op)
    bytes += size
  }
  if (part.length) out.push(part)
  return out
}
