/**
 * Studio state: the project being made (a LevelDesign plus each brick's Blockly workspace), what is selected, and
 * Build vs Play. Wave 2 lanes read and change state only through this store. Shared contract: change it through the
 * integrator, never inside a lane.
 */
import { useSyncExternalStore } from 'react'
import type { BrickDef, Costume, CopyPlacement, LevelDesign, Sound, Value } from '../core/contracts'
import { compileWorkspace, type Diagnostic } from '../core/editor/compile'
import { play, type Runtime } from '../core/index'

export const STAGE_ID = 'stage'

export interface StudioProject {
  design: LevelDesign
  /** Blockly workspace JSON per brick id (Blockly.serialization.workspaces.save output). The stage uses STAGE_ID. */
  workspaces: Record<string, unknown>
}

export type StudioMode = 'build' | 'play'
export type EditorTab = 'code' | 'costumes' | 'sounds'

export interface StudioState {
  project: StudioProject
  /** Brick whose code/costumes/sounds are open on the left. STAGE_ID for the stage. */
  selectedBrickId: string
  /** Painted copy selected in Build (for knobs, move, delete). */
  selectedCopyId: string | null
  /** Brick the Build brush paints. */
  brushBrickId: string | null
  /** Step 6: tile character the Build brush paints (TILE_CHAR value, '.' erases), or null when painting bricks. */
  brushTile: string | null
  mode: StudioMode
  editorTab: EditorTab
  diagnostics: Record<string, Diagnostic[]>
  /** Live while playing; null in Build. Every Play starts from the saved design (decision 1). */
  runtime: Runtime | null
  /** Bumps on every change; persistence and renderers can watch it. */
  revision: number
  /** Step 6: the brick open in the full-screen Brick Workshop, or null when the builder is showing. */
  workshopBrickId: string | null
}

type Listener = () => void

export class StudioStore {
  private state: StudioState
  private listeners = new Set<Listener>()
  private loadListeners = new Set<Listener>()

  constructor(project: StudioProject) {
    const first = project.design.bricks[0]?.id ?? STAGE_ID
    this.state = {
      project,
      selectedBrickId: first,
      selectedCopyId: null,
      brushBrickId: project.design.bricks[0]?.id ?? null,
      brushTile: null,
      mode: 'build',
      editorTab: 'code',
      diagnostics: {},
      runtime: null,
      revision: 0,
      workshopBrickId: null,
    }
  }

  getState = (): StudioState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<StudioState>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 }
    for (const l of this.listeners) l()
  }

  private setDesign(design: LevelDesign, workspaces = this.state.project.workspaces) {
    this.set({ project: { design, workspaces } })
  }

  // ------------------------------------------------------------ selection and modes

  selectBrick(brickId: string) {
    this.set({ selectedBrickId: brickId })
  }

  selectCopy(copyId: string | null) {
    this.set({ selectedCopyId: copyId })
  }

  setBrush(brickId: string | null) {
    this.set({ brushBrickId: brickId, brushTile: null })
  }

  /** Step 6: paint tiles instead of bricks. */
  setTileBrush(ch: string | null) {
    this.set({ brushTile: ch, brushBrickId: ch ? null : this.state.brushBrickId })
  }

  setEditorTab(tab: EditorTab) {
    this.set({ editorTab: tab })
  }

  /** Play: a fresh runtime from the saved design, green flag fired. The Stage lane steps it. */
  play() {
    this.set({ mode: 'play', runtime: play(this.state.project.design), selectedCopyId: null })
  }

  /** Back to Build. Nothing from the run is kept. */
  stop() {
    this.state.runtime?.stopAll()
    this.set({ mode: 'build', runtime: null })
  }

  // ------------------------------------------------------------ Brick Workshop (step 6)

  /** Open the full-screen workshop on a brick ("See inside" or "+ New brick"). Leaves Play first. */
  openWorkshop(brickId: string) {
    if (this.state.mode === 'play') this.stop()
    this.set({ workshopBrickId: brickId, selectedBrickId: brickId })
  }

  /** "Done": back to the builder, exactly where the kid was. */
  closeWorkshop() {
    this.set({ workshopBrickId: null })
  }

  // ------------------------------------------------------------ tiles (step 6)

  /** Set one tile cell (row 0 = bottom). Grows nothing: cells outside the layer are ignored. */
  setTile(col: number, row: number, ch: string) {
    const d = this.state.project.design
    const layer = d.tiles
    if (!layer || col < 0 || row < 0 || col >= layer.cols || row >= layer.rows || ch.length !== 1) return
    if (layer.data[row][col] === ch) return
    const data = layer.data.slice()
    data[row] = data[row].slice(0, col) + ch + data[row].slice(col + 1)
    this.setDesign({ ...d, tiles: { ...layer, data } })
  }

  // ------------------------------------------------------------ bricks

  brick(brickId: string): BrickDef | undefined {
    const d = this.state.project.design
    return brickId === STAGE_ID ? d.stage : d.bricks.find((b) => b.id === brickId)
  }

  /** Add a brick and select it. `costume` is its first costume (a brick always has at least one). */
  addBrick(name: string, costume: Costume): string {
    const id = uniqueId('brick', new Set(this.state.project.design.bricks.map((b) => b.id)))
    const brick: BrickDef = { id, name, costumes: [costume], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } }
    const d = this.state.project.design
    this.setDesign({ ...d, bricks: [...d.bricks, brick] })
    this.set({ selectedBrickId: id, brushBrickId: id, editorTab: 'code' })
    return id
  }

  /** Step 6: add a whole brick (from a template) with its workspace, select it and return its id. */
  addBrickFrom(brick: Omit<BrickDef, 'id'>, workspace: unknown): string {
    const d = this.state.project.design
    const id = uniqueId('brick', new Set(d.bricks.map((b) => b.id)))
    this.setDesign({ ...d, bricks: [...d.bricks, { ...brick, id }] }, { ...this.state.project.workspaces, [id]: workspace })
    this.setWorkspace(id, workspace)
    this.set({ selectedBrickId: id, brushBrickId: id, brushTile: null })
    return id
  }

  renameBrick(brickId: string, name: string) {
    this.updateBrick(brickId, (b) => ({ ...b, name }))
  }

  /** Removes the brick, its copies and its workspace. */
  deleteBrick(brickId: string) {
    const d = this.state.project.design
    const workspaces = { ...this.state.project.workspaces }
    delete workspaces[brickId]
    this.setDesign({ ...d, bricks: d.bricks.filter((b) => b.id !== brickId), copies: d.copies.filter((c) => c.brickId !== brickId) }, workspaces)
    const s = this.state
    this.set({
      selectedBrickId: s.selectedBrickId === brickId ? (d.bricks.find((b) => b.id !== brickId)?.id ?? STAGE_ID) : s.selectedBrickId,
      brushBrickId: s.brushBrickId === brickId ? null : s.brushBrickId,
    })
  }

  setCostumes(brickId: string, costumes: Costume[]) {
    this.updateBrick(brickId, (b) => ({ ...b, costumes }))
  }

  setSounds(brickId: string, sounds: Sound[]) {
    this.updateBrick(brickId, (b) => ({ ...b, sounds }))
  }

  /**
   * Save a brick's workspace and recompile it. Variable defaults and showInBuild flags carry over from the brick's
   * current declarations (Blockly does not know about them).
   */
  setWorkspace(brickId: string, workspace: unknown) {
    const brick = this.brick(brickId)
    if (!brick) return
    const { program, diagnostics } = compileWorkspace(workspace, { variables: brick.program.variables, lists: brick.program.lists })
    const workspaces = { ...this.state.project.workspaces, [brickId]: workspace }
    this.updateBrick(brickId, (b) => ({ ...b, program }), workspaces)
    this.set({ diagnostics: { ...this.state.diagnostics, [brickId]: diagnostics } })
  }

  /** Mark a local variable as a Build knob (or not), with its default value. */
  setVariableKnob(brickId: string, variableId: string, showInBuild: boolean, value?: Value) {
    this.updateBrick(brickId, (b) => ({
      ...b,
      program: {
        ...b.program,
        variables: b.program.variables.map((v) => (v.id === variableId ? { ...v, showInBuild, value: value ?? v.value } : v)),
      },
    }))
  }

  private updateBrick(brickId: string, fn: (b: BrickDef) => BrickDef, workspaces?: Record<string, unknown>) {
    const d = this.state.project.design
    if (brickId === STAGE_ID) this.setDesign({ ...d, stage: fn(d.stage) }, workspaces)
    else this.setDesign({ ...d, bricks: d.bricks.map((b) => (b.id === brickId ? fn(b) : b)) }, workspaces)
  }

  // ------------------------------------------------------------ painted copies (Build)

  addCopy(brickId: string, x: number, y: number): string {
    const d = this.state.project.design
    const id = uniqueId('copy', new Set(d.copies.map((c) => c.id)))
    this.setDesign({ ...d, copies: [...d.copies, { id, brickId, x, y }] })
    return id
  }

  updateCopy(copyId: string, patch: Partial<Omit<CopyPlacement, 'id' | 'brickId'>>) {
    const d = this.state.project.design
    this.setDesign({ ...d, copies: d.copies.map((c) => (c.id === copyId ? { ...c, ...patch } : c)) })
  }

  setKnob(copyId: string, variableId: string, value: Value | undefined) {
    const d = this.state.project.design
    this.setDesign({
      ...d,
      copies: d.copies.map((c) => {
        if (c.id !== copyId) return c
        const knobs = { ...c.knobs }
        if (value === undefined) delete knobs[variableId]
        else knobs[variableId] = value
        return { ...c, knobs }
      }),
    })
  }

  deleteCopy(copyId: string) {
    const d = this.state.project.design
    this.setDesign({ ...d, copies: d.copies.filter((c) => c.id !== copyId) })
    if (this.state.selectedCopyId === copyId) this.set({ selectedCopyId: null })
  }

  /** Called after every `load`: the world was replaced, so anything remembered about the old one (undo) must go. */
  onLoad = (listener: Listener): (() => void) => {
    this.loadListeners.add(listener)
    return () => this.loadListeners.delete(listener)
  }

  /** Replace the whole project (load). Returns to Build. */
  load(project: StudioProject) {
    this.state.runtime?.stopAll()
    this.set({ project, mode: 'build', runtime: null, selectedCopyId: null, selectedBrickId: project.design.bricks[0]?.id ?? STAGE_ID, diagnostics: {} })
    for (const l of [...this.loadListeners]) l()
  }
}

function uniqueId(prefix: string, taken: Set<string>): string {
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`
    if (!taken.has(id)) return id
  }
}

/** Subscribe a component to part of the studio state. */
export function useStudio<T>(store: StudioStore, select: (s: StudioState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()))
}

/** An empty project: a stage and no bricks, level 960 × 360 steps. */
export function emptyProject(): StudioProject {
  return {
    design: {
      id: 'level1',
      name: 'My level',
      seed: 1,
      bounds: { left: 0, right: 960, bottom: 0, top: 360 },
      stage: { id: STAGE_ID, name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
      bricks: [],
      copies: [],
      tiles: { cols: 60, rows: 22, data: Array.from({ length: 22 }, () => '.'.repeat(60)) },
    },
    workspaces: {},
  }
}
