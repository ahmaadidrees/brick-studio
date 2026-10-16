/**
 * Studio state: the project being made (a LevelDesign plus each brick's Blockly workspace), what is selected, and
 * Build vs Play. Wave 2 lanes read and change state only through this store. Shared contract: change it through the
 * integrator, never inside a lane.
 */
import { useSyncExternalStore } from 'react'
import type { BrickDef, Costume, CopyPlacement, LevelDesign, Sound, Value } from '../core/contracts'
import { type Diagnostic } from '../core/editor/compile'
import { play, type Runtime } from '../core/index'
import { parseGridCopyId } from '../core/contracts'
import { compileBrickEdit, canResetBrick, restoreBrickOriginal } from './remix'

export const STAGE_ID = 'stage'

export interface StudioProject {
  design: LevelDesign
  /** Blockly workspace JSON per brick id (Blockly.serialization.workspaces.save output). The stage uses STAGE_ID. */
  workspaces: Record<string, unknown>
}

export type StudioMode = 'build' | 'play'
export type CardTab = 'sliders' | 'code' | 'look'
export type SliderScope = 'all' | 'one'
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
  cardTab: CardTab
  sliderScope: SliderScope
  previewPaused: boolean
  /** The saved program differs from the current run; sliders are applied live instead. */
  pendingCodeChanges: boolean
  remixNotice: string | null
  editorResetRevision: number
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
  private beforeRunListeners = new Set<Listener>()
  private runningCode: string | null = null

  private makeRuntime(): Runtime {
    this.runningCode = codeFingerprint(this.state.project)
    return play(this.state.project.design)
  }

  constructor(project: StudioProject) {
    const first = project.design.bricks[0]?.id ?? STAGE_ID
    this.state = {
      project,
      selectedBrickId: first,
      selectedCopyId: null,
      brushBrickId: initialBrush(project),
      brushTile: null,
      mode: 'build',
      editorTab: 'code',
      cardTab: 'sliders',
      sliderScope: 'all',
      previewPaused: false,
      pendingCodeChanges: false,
      remixNotice: null,
      editorResetRevision: 0,
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
    if (copyId === null) return this.closeCard()
    const design = this.state.project.design
    const cell = parseGridCopyId(copyId)
    const brickId = cell
      ? design.bricks.find((b) => b.grid?.char === design.tiles?.data[cell.row]?.[cell.col])?.id
      : design.copies.find((c) => c.id === copyId)?.brickId
    this.set({ selectedCopyId: copyId, ...(brickId ? { selectedBrickId: brickId } : {}),
      ...(copyId !== this.state.selectedCopyId ? { cardTab: 'sliders' as const, sliderScope: 'all' as const } : {}) })
  }

  setBrush(brickId: string | null) {
    this.closeCard()
    this.set({ brushBrickId: brickId, brushTile: null })
  }

  /** Step 6: paint tiles instead of bricks. */
  setTileBrush(ch: string | null) {
    this.closeCard()
    this.set({ brushTile: ch, brushBrickId: ch ? null : this.state.brushBrickId })
  }

  setEditorTab(tab: EditorTab) {
    this.set({ editorTab: tab })
  }

  /** Play: a fresh runtime from the saved design, green flag fired. The Stage lane steps it. */
  play() {
    for (const listener of [...this.beforeRunListeners]) listener()
    this.state.runtime?.stopAll()
    this.set({ mode: 'play', runtime: this.makeRuntime(), previewPaused: false, pendingCodeChanges: false })
  }

  /** Back to Build. Nothing from the run is kept. */
  stop() {
    this.state.runtime?.stopAll()
    this.set({ mode: 'build', runtime: null, previewPaused: false, pendingCodeChanges: false })
  }

  setCardTab(cardTab: CardTab) {
    if (cardTab === 'code') return this.openCode(this.state.selectedBrickId)
    this.set({ cardTab })
  }

  setSliderScope(sliderScope: SliderScope) { this.set({ sliderScope }) }

  closeCard() {
    if (this.state.mode === 'build') this.state.runtime?.stopAll()
    this.set({ selectedCopyId: null, cardTab: 'sliders', sliderScope: 'all',
      ...(this.state.mode === 'build' ? { runtime: null, previewPaused: false, pendingCodeChanges: false } : {}) })
  }

  openCode(brickId: string) {
    this.set({ selectedBrickId: brickId, cardTab: 'code',
      ...(!this.state.runtime ? { runtime: this.makeRuntime(), previewPaused: false, pendingCodeChanges: false } : {}) })
  }

  closeCode() { this.set({ cardTab: 'sliders' }) }

  startPreview() {
    this.set({ previewPaused: false, ...(!this.state.runtime ? { runtime: this.makeRuntime(), pendingCodeChanges: false } : {}) })
  }

  pausePreview() {
    const runtime = this.state.runtime
    if (runtime) {
      for (const key of [...runtime.world.keysDown]) runtime.releaseKey(key)
      runtime.world.mouse.down = false
    }
    this.set({ previewPaused: true })
  }

  restartPreview() {
    for (const listener of [...this.beforeRunListeners]) listener()
    this.state.runtime?.stopAll()
    this.set({ runtime: this.makeRuntime(), previewPaused: false, pendingCodeChanges: false })
  }

  dismissRemixNotice() { this.set({ remixNotice: null }) }

  /** Commit the open editor before a run, including edits still inside its debounce window. */
  onBeforeRun = (listener: Listener): (() => void) => {
    this.beforeRunListeners.add(listener)
    return () => { this.beforeRunListeners.delete(listener) }
  }

  canResetBrick(brickId: string) { return canResetBrick(this.state.project, brickId) }

  resetBrickOriginal(brickId: string) {
    const project = restoreBrickOriginal(this.state.project, brickId)
    this.set({ project, pendingCodeChanges: !!this.state.runtime && codeFingerprint(project) !== this.runningCode, remixNotice: null, editorResetRevision: this.state.editorResetRevision + 1 })
  }

  /** A brick default changes every copy without its own starting value; the live preview follows immediately. */
  setBrickSlider(brickId: string, variableId: string, value: Value) {
    if (!this.brick(brickId)?.program.variables.some((v) => v.id === variableId)) return
    this.updateBrick(brickId, (b) => ({ ...b, program: { ...b.program,
      variables: b.program.variables.map((v) => v.id === variableId ? { ...v, value } : v) } }))
    const design = this.state.project.design
    for (const target of this.state.runtime?.world.targets ?? []) {
      if (target.brickId !== brickId) continue
      const own = design.copies.find((c) => c.id === target.copyId)?.knobs
      if (!own || !Object.hasOwn(own, variableId)) target.variables[variableId] = value
    }
  }

  // ------------------------------------------------------------ Brick Workshop (step 6)

  /** Open the full-screen workshop on a brick ("See inside" or "+ New brick"). Leaves Play first. */
  openWorkshop(brickId: string) {
    if (this.state.runtime) this.stop()
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
    const result = compileBrickEdit(this.state.project, brickId, workspace)
    this.set({ project: result.project, pendingCodeChanges: !!this.state.runtime && codeFingerprint(result.project) !== this.runningCode,
      diagnostics: { ...this.state.diagnostics, [brickId]: result.diagnostics },
      ...(result.remixed ? { remixNotice: `You changed a block, so this is now ${result.remixed}. The original ${brick.name} is untouched.` } : {}) })
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
    if (!showInBuild) {
      const design = this.state.project.design
      this.setDesign({ ...design, copies: design.copies.map((copy) => {
        if (copy.brickId !== brickId || !copy.knobs || !Object.hasOwn(copy.knobs, variableId)) return copy
        const knobs = { ...copy.knobs }
        delete knobs[variableId]
        return { ...copy, knobs }
      }) })
    }
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
    const copy = d.copies.find((c) => c.id === copyId)
    if (!copy) return
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
    const effective = value ?? this.brick(copy.brickId)?.program.variables.find((v) => v.id === variableId)?.value
    if (effective !== undefined) for (const target of this.state.runtime?.world.targets ?? []) {
      if (target.copyId === copyId) target.variables[variableId] = effective
    }
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
    this.set({ project, mode: 'build', runtime: null, selectedCopyId: null, selectedBrickId: project.design.bricks[0]?.id ?? STAGE_ID, brushBrickId: initialBrush(project), brushTile: null, workshopBrickId: null, cardTab: 'sliders', sliderScope: 'all', previewPaused: false, pendingCodeChanges: false, remixNotice: null, editorResetRevision: this.state.editorResetRevision + 1, diagnostics: {} })
    for (const l of [...this.loadListeners]) l()
  }
}

/** Runtime changes come from scripts/declarations, never view layout or live slider starting values. */
function codeFingerprint(project: StudioProject): string {
  return JSON.stringify([project.design.stage, ...project.design.bricks].map((brick) => ({
    id: brick.id,
    scripts: brick.program.scripts,
    procedures: brick.program.procedures,
    variables: brick.program.variables.map(({ id, name }) => ({ id, name })),
    lists: brick.program.lists.map(({ id, name }) => ({ id, name })),
  })))
}

function initialBrush(project: StudioProject): string | null {
  return project.design.bricks.find((b) => b.grid?.char === 'G')?.id ?? project.design.bricks.find((b) => b.limit !== 1 && !b.isStage)?.id ?? null
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
