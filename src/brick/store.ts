import { create } from 'zustand'
import {
  BRICK_STUDIO_MAX_BRICKS,
  createBrickStudioDocument,
  type CreateBrickStudioDocumentOptions,
  parseBrickStudioDocument,
  serializeBrickStudioDocument,
  validateBrickStudioDocument,
  type BrickStudioDocument,
  type BrickStudioDocumentError,
} from './brickDocument'
import { BRICK_BUDGETS } from './budgets'
import { draftIsValid as coreDraftIsValid } from './brickRules'
import { BRICK_COLORS, BRICK_PART_MAP, BRICK_PARTS, GRID_SIZE, registerCustomParts, rotatedSize, supportHeightForFootprint } from './parts'
import { ORBIT_DEFAULT_DISTANCE, ORBIT_DEFAULT_PITCH, ORBIT_DEFAULT_YAW, clampOrbitDistance } from './orbitCamera'
import { clampExplorePitch } from './touchInput'
import type { BrickBudgetProfile, BrickDraft, BrickInstance, BrickMode, ViewPreset } from './types'

export const MAX_HISTORY_ENTRIES = 100
const NUDGE_BATCH_WINDOW_MS = 500

export type BrickHistoryDelta = {
  before: BrickInstance | null
  after: BrickInstance | null
  beforeIndex: number | null
  afterIndex: number | null
}

export type BrickHistoryEntry = {
  documentBefore?: BrickStudioDocument
  documentAfter?: BrickStudioDocument
  deltas: BrickHistoryDelta[]
  selectionBefore: string[]
  selectionAfter: string[]
  label: string
  group: string | null
  recordedAt: number
}

export type BrickClipboard = {
  bricks: BrickDraft[]
}

export type MarqueeState = {
  start: { x: number; y: number }
  current: { x: number; y: number }
  dragging: boolean
}

export type BrickDocumentCommandResult =
  | { ok: true }
  | { ok: false; error: BrickStudioDocumentError }

export type ExploreSpawnStatus = 'idle' | 'finding' | 'ready' | 'unavailable'
export type ExplorePosition = { x: number; y: number; z: number }

export type BrickState = {
  documentMetadata: CreateBrickStudioDocumentOptions
  setDocumentMetadata: (metadata: CreateBrickStudioDocumentOptions) => void
  getDocumentSnapshot: () => BrickStudioDocument
  mode: BrickMode
  bricks: BrickInstance[]
  selectedIds: string[]
  selectedId: string | null
  activePartId: string | null
  activeColor: string
  draft: BrickDraft | null
  movingId: string | null
  movingSelection: { originals: BrickInstance[]; duplicate: boolean; color?: string } | null
  clipboard: BrickClipboard | null
  undoStack: BrickHistoryEntry[]
  redoStack: BrickHistoryEntry[]
  budgetProfile: BrickBudgetProfile
  brickBudget: number
  viewRequest: { preset: ViewPreset; nonce: number }
  touchMove: { x: number; z: number }
  touchMoveMagnitude: number
  touchRunning: boolean
  touchYaw: number
  touchPitch: number
  touchCameraDistance: number
  jumpNonce: number
  exploreRespawnNonce: number
  exploreSpawnStatus: ExploreSpawnStatus
  exploreLastSafePosition: ExplorePosition | null
  reducedMotion: boolean
  selectionMode: boolean
  marquee: MarqueeState | null
  /** Grid coordinates of the build camera focus, published by the scene. */
  viewTarget: { x: number; z: number } | null
  /** True while a pointer is captured dragging the ghost or a grabbed brick; UI chrome freezes. */
  grabInProgress: boolean
  toast: string | null
  /** Screen-reader-only channel: successes announce here, not as a toast. */
  announcement: string | null
  placeFeedback: { id: string; nonce: number } | null
  blockedNonce: number
  setMode: (mode: BrickMode) => void
  choosePart: (partId: string) => void
  setActiveColor: (color: string) => void
  setDraftPosition: (x: number, y: number, z: number) => void
  placeDraft: () => boolean
  cancelInteraction: () => void
  selectBrick: (id: string | null, additive?: boolean) => void
  selectBricks: (ids: string[]) => void
  toggleBrick: (id: string) => void
  clearSelection: () => void
  selectAdjacentBrick: (direction: 1 | -1) => void
  deleteSelected: () => void
  rotate: () => void
  nudge: (dx: number, dy: number, dz: number) => void
  startMove: () => void
  copy: () => void
  paste: () => void
  duplicate: () => void
  resizeSelectedParts: (partIdsByBrickId: Readonly<Record<string, string>>) => boolean
  newBuild: () => boolean
  exportDocument: () => string
  importDocument: (serialized: string) => BrickDocumentCommandResult
  restoreDocument: (document: BrickStudioDocument) => BrickDocumentCommandResult
  undo: () => void
  redo: () => void
  setBudgetProfile: (profile: BrickBudgetProfile) => void
  requestView: (preset: ViewPreset) => void
  setTouchMove: (x: number, z: number, magnitude?: number, running?: boolean) => void
  addTouchYaw: (delta: number) => void
  addTouchLook: (yawDelta: number, pitchDelta: number) => void
  setTouchCameraDistance: (distance: number) => void
  adjustTouchCameraDistance: (delta: number) => void
  recenterCamera: () => void
  requestRespawn: () => void
  markExploreSpawnReady: (position: ExplorePosition) => void
  rememberExplorePosition: (position: ExplorePosition) => void
  markExploreSpawnUnavailable: () => void
  requestJump: () => void
  setReducedMotion: (reducedMotion: boolean) => void
  setSelectionMode: (selectionMode: boolean) => void
  setMarquee: (marquee: MarqueeState | null) => void
  setViewTarget: (x: number, z: number) => void
  setGrabInProgress: (grabInProgress: boolean) => void
  clearToast: () => void
}

const cloneBrick = (brick: BrickInstance) => ({ ...brick })

function applyHistoryEntry(bricks: BrickInstance[], entry: BrickHistoryEntry, direction: 'undo' | 'redo') {
  const changedIds = new Set(entry.deltas.flatMap((delta) => {
    const id = delta.before?.id ?? delta.after?.id
    return id ? [id] : []
  }))
  const next = bricks.filter((brick) => !changedIds.has(brick.id)).map(cloneBrick)
  const replacements = entry.deltas.flatMap((delta) => {
    const brick = direction === 'undo' ? delta.before : delta.after
    const index = direction === 'undo' ? delta.beforeIndex : delta.afterIndex
    return brick ? [{ brick, index }] : []
  }).sort((first, second) => (first.index ?? next.length) - (second.index ?? next.length))

  for (const replacement of replacements) {
    const index = Math.max(0, Math.min(replacement.index ?? next.length, next.length))
    next.splice(index, 0, cloneBrick(replacement.brick))
  }
  return next
}

function appendHistory(stack: BrickHistoryEntry[], entry: BrickHistoryEntry) {
  const next = [...stack, entry]
  return next.length > MAX_HISTORY_ENTRIES ? next.slice(next.length - MAX_HISTORY_ENTRIES) : next
}

function recordNudge(stack: BrickHistoryEntry[], entry: BrickHistoryEntry) {
  const previous = stack.at(-1)
  if (
    previous
    && previous.group === entry.group
    && entry.group !== null
    && entry.recordedAt - previous.recordedAt <= NUDGE_BATCH_WINDOW_MS
  ) {
    return [
      ...stack.slice(0, -1),
      {
        ...previous,
        deltas: previous.deltas.map((delta, index) => ({
          ...delta,
          after: entry.deltas[index]?.after ? cloneBrick(entry.deltas[index].after!) : delta.after,
          afterIndex: entry.deltas[index]?.afterIndex ?? delta.afterIndex,
        })),
        recordedAt: entry.recordedAt,
      },
    ]
  }
  return appendHistory(stack, entry)
}

function historyEntry(
  deltas: BrickHistoryDelta[],
  label: string,
  group: string | null = null,
  selectionBefore = deltas.flatMap((delta) => delta.before ? [delta.before.id] : []),
  selectionAfter = deltas.flatMap((delta) => delta.after ? [delta.after.id] : []),
): BrickHistoryEntry {
  return {
    deltas: deltas.map((delta) => ({
      before: delta.before ? cloneBrick(delta.before) : null,
      after: delta.after ? cloneBrick(delta.after) : null,
      beforeIndex: delta.beforeIndex,
      afterIndex: delta.afterIndex,
    })),
    selectionBefore: [...selectionBefore],
    selectionAfter: [...selectionAfter],
    label,
    group,
    recordedAt: Date.now(),
  }
}

function singleHistoryEntry(
  before: BrickInstance | null,
  after: BrickInstance | null,
  beforeIndex: number | null,
  afterIndex: number | null,
  label: string,
  group: string | null = null,
) {
  return historyEntry([{ before, after, beforeIndex, afterIndex }], label, group)
}

function replacementHistoryEntry(
  before: BrickInstance[],
  after: BrickInstance[],
  label: string,
): BrickHistoryEntry {
  const beforeById = new Map(before.map((brick, index) => [brick.id, { brick, index }]))
  const afterById = new Map(after.map((brick, index) => [brick.id, { brick, index }]))
  const orderedIds = [
    ...before.map((brick) => brick.id),
    ...after.filter((brick) => !beforeById.has(brick.id)).map((brick) => brick.id),
  ]
  const deltas = orderedIds.map((id) => {
    const previous = beforeById.get(id)
    const next = afterById.get(id)
    return {
      before: previous?.brick ?? null,
      after: next?.brick ?? null,
      beforeIndex: previous?.index ?? null,
      afterIndex: next?.index ?? null,
    }
  })
  return historyEntry(deltas, label, null, [], [])
}

function buildsAreEqual(first: BrickInstance[], second: BrickInstance[]) {
  return first.length === second.length
    && first.every((brick, index) => {
      const other = second[index]
      return other
        && brick.id === other.id
        && brick.partId === other.partId
        && brick.x === other.x
        && brick.y === other.y
        && brick.z === other.z
        && brick.rotation === other.rotation
        && brick.color === other.color
    })
}

function selectedBricks(state: Pick<BrickState, 'bricks' | 'selectedIds' | 'selectedId'>) {
  const selected = new Set(effectiveSelectedIds(state))
  return state.bricks.filter((brick) => selected.has(brick.id))
}

function effectiveSelectedIds(state: Pick<BrickState, 'selectedIds' | 'selectedId'>) {
  return state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : []
}

function selectionPatch(ids: string[]) {
  return { selectedIds: ids, selectedId: ids.at(-1) ?? null }
}

export function draftIsValid(draft: BrickDraft, bricks: BrickInstance[], ignoredId: string | null = null) {
  return coreDraftIsValid(draft, bricks, ignoredId)
}

/** All preview pieces translated relative to the first selected brick. */
export function selectionDrafts(state: Pick<BrickState, 'draft' | 'movingSelection'>): BrickDraft[] {
  if (!state.draft) return []
  const originals = state.movingSelection?.originals
  if (!originals?.length || originals.length === 1) return [{ ...state.draft }]
  const anchor = originals[0]
  return originals.map((brick) => ({ ...brick,
    color: state.movingSelection?.color ?? brick.color,
    x: brick.x + state.draft!.x - anchor.x,
    y: brick.y + state.draft!.y - anchor.y,
    z: brick.z + state.draft!.z - anchor.z,
  }))
}

export function selectionDraftIsValid(state: Pick<BrickState, 'draft' | 'movingSelection' | 'movingId' | 'bricks' | 'brickBudget'>): boolean {
  if (!state.draft) return false
  if (!state.movingSelection) return draftIsValid(state.draft, state.bricks, state.movingId)
  const { originals, duplicate } = state.movingSelection
  // Never overwrite an edit or deletion received while a move was in progress.
  if (!duplicate && originals.some((original) => {
    const current = state.bricks.find((brick) => brick.id === original.id)
    return !current || !buildsAreEqual([original], [current])
  })) return false
  const ids = new Set(originals.map((brick) => brick.id))
  const remaining = duplicate ? state.bricks : state.bricks.filter((brick) => !ids.has(brick.id))
  return validateBrickGroup(selectionDrafts(state), remaining, duplicate ? state.brickBudget : Math.max(state.brickBudget, state.bricks.length)).valid
}

export type BrickGroupValidation = {
  valid: boolean
  reason: 'budget' | 'placement' | null
}

export function validateBrickGroup(
  drafts: BrickDraft[],
  bricks: BrickInstance[],
  brickBudget: number,
): BrickGroupValidation {
  if (bricks.length + drafts.length > brickBudget) return { valid: false, reason: 'budget' }

  const staged = bricks.map(cloneBrick)
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index]
    if (!draftIsValid(draft, staged)) return { valid: false, reason: 'placement' }
    staged.push({ ...draft, id: `group-validation-${index}` })
  }
  return { valid: true, reason: null }
}

const PASTE_OFFSET_STEP = 2

export function findGroupPasteDrafts(
  clipboard: BrickClipboard,
  bricks: BrickInstance[],
  brickBudget: number,
): { drafts: BrickDraft[] | null; reason: BrickGroupValidation['reason'] } {
  if (bricks.length + clipboard.bricks.length > brickBudget) return { drafts: null, reason: 'budget' }

  for (let distance = PASTE_OFFSET_STEP; distance <= GRID_SIZE; distance += PASTE_OFFSET_STEP) {
    const offsets = [
      [distance, distance],
      [-distance, distance],
      [distance, -distance],
      [-distance, -distance],
      [distance, 0],
      [0, distance],
      [-distance, 0],
      [0, -distance],
    ] as const
    for (const [xOffset, zOffset] of offsets) {
      const drafts = clipboard.bricks.map((brick) => ({
        ...brick,
        x: brick.x + xOffset,
        z: brick.z + zOffset,
      }))
      if (validateBrickGroup(drafts, bricks, brickBudget).valid) return { drafts, reason: null }
    }
  }
  return { drafts: null, reason: 'placement' }
}

function createBrickId() {
  return `brick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Shared by draft and placed rotation so the rounding bias is identical.
// Math.trunc (round half toward zero) rather than Math.round: round(1.5)=2 but
// round(-1.5)=-1, which would drift odd-delta parts by +2 studs per four turns.
function centerPivotRotation(target: Pick<BrickDraft, 'partId' | 'x' | 'z' | 'rotation'>) {
  const part = BRICK_PART_MAP[target.partId]
  const rotation = ((target.rotation + 1) % 4) as BrickDraft['rotation']
  const oldSize = rotatedSize(part, target.rotation)
  const newSize = rotatedSize(part, rotation)
  return {
    rotation,
    x: target.x + Math.trunc((oldSize.width - newSize.width) / 2),
    z: target.z + Math.trunc((oldSize.depth - newSize.depth) / 2),
    size: newSize,
  }
}

function rotateBrickGroup(bricks: BrickInstance[]): BrickInstance[] | null {
  if (!bricks.length) return []
  const bounds = bricks.map((brick) => {
    const size = rotatedSize(BRICK_PART_MAP[brick.partId], brick.rotation)
    return { brick, size }
  })
  const minX = Math.min(...bounds.map(({ brick }) => brick.x))
  const minZ = Math.min(...bounds.map(({ brick }) => brick.z))
  const maxX = Math.max(...bounds.map(({ brick, size }) => brick.x + size.width))
  const maxZ = Math.max(...bounds.map(({ brick, size }) => brick.z + size.depth))
  // Coordinates are doubled so half-stud group pivots remain exact. A result
  // that cannot land back on the stud grid rejects the whole operation.
  const pivotX2 = minX + maxX
  const pivotZ2 = minZ + maxZ

  const rotated: BrickInstance[] = []
  for (const { brick, size } of bounds) {
    const rotation = ((brick.rotation + 1) % 4) as BrickInstance['rotation']
    const nextSize = rotatedSize(BRICK_PART_MAP[brick.partId], rotation)
    const centerX2 = brick.x * 2 + size.width
    const centerZ2 = brick.z * 2 + size.depth
    const nextCenterX2 = pivotX2 - (centerZ2 - pivotZ2)
    const nextCenterZ2 = pivotZ2 + (centerX2 - pivotX2)
    const x2 = nextCenterX2 - nextSize.width
    const z2 = nextCenterZ2 - nextSize.depth
    if (x2 % 2 !== 0 || z2 % 2 !== 0) return null
    rotated.push({ ...brick, rotation, x: x2 / 2, z: z2 / 2 })
  }
  return rotated
}

function transformedSelectionIsValid(
  transformed: BrickInstance[],
  state: Pick<BrickState, 'bricks' | 'selectedIds' | 'selectedId' | 'brickBudget'>,
) {
  const selected = new Set(effectiveSelectedIds(state))
  const stationary = state.bricks.filter((brick) => !selected.has(brick.id))
  const drafts = transformed.map(({ id: _id, ...brick }) => brick)
  return validateBrickGroup(drafts, stationary, state.brickBudget).valid
}

function suggestedDraft(
  partId: string,
  color: string,
  origin: { x: number; z: number } | null = null,
  bricks: BrickInstance[] = [],
): BrickDraft {
  const part = BRICK_PART_MAP[partId]
  const centerX = origin?.x ?? GRID_SIZE / 2
  const centerZ = origin?.z ?? GRID_SIZE / 2
  const x = Math.max(0, Math.min(GRID_SIZE - part.width, Math.floor(centerX - part.width / 2)))
  const z = Math.max(0, Math.min(GRID_SIZE - part.depth, Math.floor(centerZ - part.depth / 2)))
  return { partId, x, y: supportHeightForFootprint(bricks, x, z, part.width, part.depth), z, rotation: 0, color }
}

function describeBrick(brick: BrickInstance, index: number, count: number) {
  return `${BRICK_PART_MAP[brick.partId].name}, brick ${index + 1} of ${count}, at X ${brick.x}, Y ${brick.y}, Z ${brick.z}.`
}

export const useBrickStore = create<BrickState>((set, get) => ({
  mode: 'build',
  bricks: [],
  selectedIds: [],
  selectedId: null,
  activePartId: BRICK_PARTS[5].id,
  activeColor: BRICK_COLORS[5],
  draft: suggestedDraft(BRICK_PARTS[5].id, BRICK_COLORS[5]),
  movingId: null, movingSelection: null,
  clipboard: null,
  documentMetadata: {},
  setDocumentMetadata: (metadata) => {
    const next = { environmentId: metadata.environmentId, customParts: metadata.customParts ?? [] }
    if (JSON.stringify(get().documentMetadata) === JSON.stringify(next)) return
    registerCustomParts(metadata.customParts ?? [])
    set({ documentMetadata: { environmentId: metadata.environmentId, customParts: metadata.customParts?.map((part) => ({ ...part })) ?? [] } })
  },
  getDocumentSnapshot: () => createBrickStudioDocument(get().bricks, get().documentMetadata),
  undoStack: [],
  redoStack: [],
  budgetProfile: 'desktop',
  brickBudget: BRICK_BUDGETS.desktop,
  viewRequest: { preset: 'home', nonce: 0 },
  touchMove: { x: 0, z: 0 },
  touchMoveMagnitude: 0,
  touchRunning: false,
  touchYaw: ORBIT_DEFAULT_YAW,
  touchPitch: ORBIT_DEFAULT_PITCH,
  touchCameraDistance: ORBIT_DEFAULT_DISTANCE,
  jumpNonce: 0,
  exploreRespawnNonce: 0,
  exploreSpawnStatus: 'idle',
  exploreLastSafePosition: null,
  reducedMotion: false,
  selectionMode: false,
  marquee: null,
  viewTarget: null,
  grabInProgress: false,
  toast: 'Pick a brick, position it over the plate, then place it.',
  announcement: null,
  placeFeedback: null,
  blockedNonce: 0,

  setMode: (mode) => {
    const state = get()
    const rearmed = state.activePartId ? suggestedDraft(state.activePartId, state.activeColor, state.viewTarget, state.bricks) : null
    set({
      mode,
      selectedIds: [],
      selectedId: null,
      draft: mode === 'build' ? state.draft ?? rearmed : null,
      movingId: mode === 'explore' ? null : state.movingId,
      movingSelection: mode === 'explore' ? null : state.movingSelection,
      touchMove: { x: 0, z: 0 },
      touchMoveMagnitude: 0,
      touchRunning: false,
      exploreSpawnStatus: mode === 'explore' ? 'finding' : 'idle',
      selectionMode: false,
      marquee: null,
      // A mode switch outlives any pointer capture; a stranded true would freeze the chrome.
      grabInProgress: false,
      announcement: mode === 'explore' ? 'Explore mode: walk around the world you built.' : 'Build mode: back at the build plate.',
    })
  },
  choosePart: (partId) => set((state) => ({
    activePartId: partId,
    selectedIds: [],
    selectedId: null,
    movingId: null, movingSelection: null,
    draft: suggestedDraft(partId, state.activeColor, state.viewTarget, state.bricks),
    announcement: `${BRICK_PART_MAP[partId].name} ready to place.`,
  })),
  setActiveColor: (color) => {
    const state = get()
    if (state.draft) {
      set({ activeColor: color, draft: { ...state.draft, color },
        ...(state.movingSelection ? { movingSelection: { ...state.movingSelection, color } } : {}),
      })
      return
    }
    const targets = selectedBricks(state).filter((brick) => brick.color !== color)
    if (!targets.length) {
      set({ activeColor: color })
      return
    }
    const deltas = targets.map((brick) => {
      const index = state.bricks.findIndex((candidate) => candidate.id === brick.id)
      return { before: brick, after: { ...brick, color }, beforeIndex: index, afterIndex: index }
    })
    const targetIds = new Set(targets.map((brick) => brick.id))
    const selectedNow = effectiveSelectedIds(state)
    set({
      bricks: state.bricks.map((brick) => targetIds.has(brick.id) ? { ...brick, color } : brick),
      activeColor: color,
      undoStack: appendHistory(state.undoStack, historyEntry(
        deltas,
        targets.length === 1 ? 'Change brick color' : `Recolor ${targets.length} bricks`,
        null,
        selectedNow,
        selectedNow,
      )),
      redoStack: [],
      announcement: targets.length === 1 ? 'Brick recolored.' : `${targets.length} bricks recolored.`,
    })
  },
  setDraftPosition: (x, y, z) => set((state) => {
    const draft = state.draft
    if (!draft || (draft.x === x && draft.y === y && draft.z === z)) return state
    return { draft: { ...draft, x, y, z } }
  }),
  placeDraft: () => {
    const state = get()
    if (!state.draft || !selectionDraftIsValid(state)) {
      // blockedNonce marks a discrete rejected placement (overlap/out-of-bounds
      // only, not budget) so the ghost shake never keys off continuous validity.
      set({ toast: 'That placement overlaps another brick or falls outside the plate.', blockedNonce: state.blockedNonce + 1 })
      return false
    }
    if (!state.movingId && state.bricks.length >= state.brickBudget) {
      set({ toast: `This world's ${state.brickBudget}-brick build limit is full. Delete a brick to place another.` })
      return false
    }

    if (state.movingSelection) {
      const { originals, duplicate } = state.movingSelection
      const drafts = selectionDrafts(state)
      const after = drafts.map((draft, index) => ({ ...draft, id: duplicate ? createBrickId() : originals[index].id }))
      const afterById = new Map(after.map((brick) => [brick.id, brick]))
      const ids = after.map((brick) => brick.id)
      const beforeIds = originals.map((brick) => brick.id)
      const deltas = after.map((brick, index) => ({
        before: duplicate ? null : originals[index], after: brick,
        beforeIndex: duplicate ? null : state.bricks.findIndex((item) => item.id === brick.id),
        afterIndex: duplicate ? state.bricks.length + index : state.bricks.findIndex((item) => item.id === brick.id),
      }))
      const changed = duplicate || !buildsAreEqual(originals, after)
      set({
        bricks: duplicate ? [...state.bricks, ...after] : state.bricks.map((brick) => afterById.get(brick.id) ?? brick),
        ...selectionPatch(ids), draft: null, movingId: null, movingSelection: null, activePartId: null,
        undoStack: changed ? appendHistory(state.undoStack, historyEntry(deltas, `${duplicate ? 'Duplicate' : 'Move'} ${after.length === 1 ? 'brick' : `${after.length} bricks`}`, null, beforeIds, ids)) : state.undoStack,
        redoStack: changed ? [] : state.redoStack,
        announcement: `${duplicate ? 'Duplicated' : 'Moved'} ${after.length} ${after.length === 1 ? 'brick' : 'bricks'}.`,
        placeFeedback: { id: ids[0], nonce: (state.placeFeedback?.nonce ?? 0) + 1 },
      })
    } else if (state.movingId) {
      const index = state.bricks.findIndex((brick) => brick.id === state.movingId)
      const before = state.bricks[index]
      if (!before) return false
      const after = { ...state.draft, id: before.id }
      set({
        bricks: state.bricks.map((brick) => brick.id === before.id ? after : brick),
        ...selectionPatch([before.id]),
        movingId: null, movingSelection: null,
        draft: null,
        activePartId: null,
        undoStack: appendHistory(state.undoStack, singleHistoryEntry(before, after, index, index, 'Move brick')),
        redoStack: [],
        announcement: `Moved ${BRICK_PART_MAP[after.partId].name} to X ${after.x}, Y ${after.y}, Z ${after.z}.`,
        placeFeedback: { id: before.id, nonce: (state.placeFeedback?.nonce ?? 0) + 1 },
      })
    } else {
      const id = createBrickId()
      const brick = { ...state.draft, id }
      const index = state.bricks.length
      const part = BRICK_PART_MAP[brick.partId]
      set({
        bricks: [...state.bricks, brick],
        ...selectionPatch([]),
        // The brush stays loaded: the same part/color/rotation re-arms, offered
        // on top of the just-placed brick so the fresh ghost spawns valid.
        // History selections stay empty so redo cannot re-select the brick.
        draft: { ...state.draft, y: brick.y + part.height },
        undoStack: appendHistory(state.undoStack, historyEntry([{ before: null, after: brick, beforeIndex: null, afterIndex: index }], 'Place brick', null, [], [])),
        redoStack: [],
        announcement: `Placed ${BRICK_PART_MAP[brick.partId].name} at X ${brick.x}, Y ${brick.y}, Z ${brick.z}.`,
        placeFeedback: { id, nonce: (state.placeFeedback?.nonce ?? 0) + 1 },
      })
    }
    return true
  },
  cancelInteraction: () => {
    const state = get()
    if (state.draft) {
      const restoredIds = state.movingSelection?.originals.map((brick) => brick.id).filter((id) => state.bricks.some((brick) => brick.id === id)) ?? (state.movingId ? [state.movingId] : [])
      set({
        draft: null,
        movingId: null, movingSelection: null,
        activePartId: null,
        ...selectionPatch(restoredIds),
        announcement: state.movingId ? 'Move canceled.' : 'Placement canceled.',
      })
    } else if (effectiveSelectedIds(state).length) {
      set({ ...selectionPatch([]), announcement: 'Selection cleared.' })
    }
  },
  selectBrick: (selectedId, additive = false) => {
    const state = get()
    const selected = state.bricks.find((brick) => brick.id === selectedId)
    if (additive && selected) {
      get().toggleBrick(selected.id)
      return
    }
    const index = selected ? state.bricks.indexOf(selected) : -1
    set({
      ...selectionPatch(selected ? [selected.id] : []),
      activePartId: null,
      draft: null,
      movingId: null, movingSelection: null,
      announcement: selected ? describeBrick(selected, index, state.bricks.length) : state.announcement,
    })
  },
  selectBricks: (ids) => {
    const state = get()
    const available = new Set(state.bricks.map((brick) => brick.id))
    const seen = new Set<string>()
    const selectedIds = ids.filter((id) => available.has(id) && !seen.has(id) && Boolean(seen.add(id)))
    set({
      ...selectionPatch(selectedIds),
      activePartId: null,
      draft: null,
      movingId: null, movingSelection: null,
      announcement: selectedIds.length > 1
        ? `${selectedIds.length} bricks selected.`
        : selectedIds.length === 1
          ? describeBrick(state.bricks.find((brick) => brick.id === selectedIds[0])!, state.bricks.findIndex((brick) => brick.id === selectedIds[0]), state.bricks.length)
          : 'Selection cleared.',
    })
  },
  toggleBrick: (id) => {
    const state = get()
    if (!state.bricks.some((brick) => brick.id === id)) return
    const current = effectiveSelectedIds(state)
    const selectedIds = current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    set({
      ...selectionPatch(selectedIds),
      activePartId: null,
      draft: null,
      movingId: null, movingSelection: null,
      announcement: selectedIds.length > 1 ? `${selectedIds.length} bricks selected.` : selectedIds.length === 1 ? '1 brick selected.' : 'Selection cleared.',
    })
  },
  clearSelection: () => set((state) => ({ ...selectionPatch([]), marquee: null,
    ...(state.movingSelection ? { draft: null, movingId: null, movingSelection: null, activePartId: null } : {}),
    announcement: 'Selection cleared.' })),
  selectAdjacentBrick: (direction) => {
    const state = get()
    if (state.bricks.length === 0) {
      set({ toast: 'There are no placed bricks to select.' })
      return
    }
    const currentIndex = state.bricks.findIndex((brick) => brick.id === state.selectedId)
    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : state.bricks.length - 1)
      : (currentIndex + direction + state.bricks.length) % state.bricks.length
    const selected = state.bricks[nextIndex]
    set({
      ...selectionPatch([selected.id]),
      activePartId: null,
      draft: null,
      movingId: null, movingSelection: null,
      announcement: describeBrick(selected, nextIndex, state.bricks.length),
    })
  },
  deleteSelected: () => {
    const state = get()
    const selected = selectedBricks(state)
    if (!selected.length) return
    const selectedSet = new Set(selected.map((brick) => brick.id))
    const deltas = selected.map((brick) => ({
      before: brick,
      after: null,
      beforeIndex: state.bricks.findIndex((candidate) => candidate.id === brick.id),
      afterIndex: null,
    }))
    set({
      bricks: state.bricks.filter((brick) => !selectedSet.has(brick.id)),
      ...(state.movingSelection ? { draft: null, movingId: null, movingSelection: null, activePartId: null } : {}),
      ...selectionPatch([]),
      undoStack: appendHistory(state.undoStack, historyEntry(deltas, selected.length === 1 ? 'Delete brick' : `Delete ${selected.length} bricks`, null, effectiveSelectedIds(state), [])),
      redoStack: [],
      announcement: selected.length === 1 ? 'Brick deleted.' : `${selected.length} bricks deleted.`,
    })
  },
  rotate: () => {
    const state = get()
    if (state.draft) {
      if ((state.movingSelection?.originals.length ?? 0) > 1) {
        set({ toast: 'Place this group before rotating it.' })
        return
      }
      const next = centerPivotRotation(state.draft)
      set({ draft: { ...state.draft, rotation: next.rotation, x: next.x, z: next.z } })
    } else if (effectiveSelectedIds(state).length > 1) {
      const before = selectedBricks(state)
      const after = rotateBrickGroup(before)
      if (!after) {
        set({ toast: 'This group cannot rotate without leaving the stud grid.' })
        return
      }
      if (!transformedSelectionIsValid(after, state)) {
        set({ toast: 'Not enough room to rotate this group.' })
        return
      }
      const afterById = new Map(after.map((brick) => [brick.id, brick]))
      const selectedNow = effectiveSelectedIds(state)
      const deltas = before.map((brick) => {
        const index = state.bricks.findIndex((candidate) => candidate.id === brick.id)
        return { before: brick, after: afterById.get(brick.id)!, beforeIndex: index, afterIndex: index }
      })
      set({
        bricks: state.bricks.map((brick) => afterById.get(brick.id) ?? brick),
        undoStack: appendHistory(state.undoStack, historyEntry(deltas, `Rotate ${before.length} bricks`, null, selectedNow, selectedNow)),
        redoStack: [],
        announcement: `${before.length} bricks rotated together.`,
      })
    } else if (effectiveSelectedIds(state).length === 1 && state.selectedId) {
      const index = state.bricks.findIndex((item) => item.id === state.selectedId)
      const before = state.bricks[index]
      if (!before) return
      const next = centerPivotRotation(before)
      const after = {
        ...before,
        rotation: next.rotation,
        x: Math.min(Math.max(next.x, 0), GRID_SIZE - next.size.width),
        z: Math.min(Math.max(next.z, 0), GRID_SIZE - next.size.depth),
      }
      if (draftIsValid(after, state.bricks, before.id)) {
        set({
          bricks: state.bricks.map((item) => item.id === before.id ? after : item),
          undoStack: appendHistory(state.undoStack, singleHistoryEntry(before, after, index, index, 'Rotate brick')),
          redoStack: [],
          announcement: 'Brick rotated.',
        })
      } else {
        set({ toast: 'Not enough room to rotate this brick.' })
      }
    }
  },
  nudge: (dx, dy, dz) => {
    const state = get()
    if (!state.draft && effectiveSelectedIds(state).length > 1) {
      const before = selectedBricks(state)
      const after = before.map((brick) => ({ ...brick, x: brick.x + dx, y: brick.y + dy, z: brick.z + dz }))
      if (after.some((brick) => brick.y < 0) || !transformedSelectionIsValid(after, state)) {
        set({ toast: 'That group move is blocked by the plate edge or another brick.' })
        return
      }
      const afterById = new Map(after.map((brick) => [brick.id, brick]))
      const selectedNow = effectiveSelectedIds(state)
      const deltas = before.map((brick) => {
        const index = state.bricks.findIndex((candidate) => candidate.id === brick.id)
        return { before: brick, after: afterById.get(brick.id)!, beforeIndex: index, afterIndex: index }
      })
      const group = `nudge:${[...selectedNow].sort().join(',')}`
      set({
        bricks: state.bricks.map((brick) => afterById.get(brick.id) ?? brick),
        undoStack: recordNudge(state.undoStack, historyEntry(deltas, `Move ${before.length} bricks`, group, selectedNow, selectedNow)),
        redoStack: [],
        announcement: `${before.length} bricks moved together.`,
      })
      return
    }
    const target = state.draft ?? state.bricks.find((brick) => brick.id === state.selectedId)
    if (!target) return
    const next = { ...target, x: target.x + dx, y: Math.max(0, target.y + dy), z: target.z + dz }
    const ignored = state.draft ? state.movingId : state.selectedId
    if (state.movingSelection ? !selectionDraftIsValid({ ...state, draft: next }) : !draftIsValid(next, state.bricks, ignored)) {
      set({ toast: 'That move is blocked by the plate edge or another brick.' })
      return
    }
    if (state.draft) {
      set({ draft: next })
    } else {
      const index = state.bricks.findIndex((brick) => brick.id === state.selectedId)
      const before = state.bricks[index]
      if (!before) return
      const after = { ...next, id: before.id }
      const entry = singleHistoryEntry(before, after, index, index, 'Move brick', `nudge:${before.id}`)
      set({
        bricks: state.bricks.map((brick) => brick.id === before.id ? after : brick),
        undoStack: recordNudge(state.undoStack, entry),
        redoStack: [],
        announcement: `Brick moved to X ${after.x}, Y ${after.y}, Z ${after.z}.`,
      })
    }
  },
  startMove: () => {
    const state = get()
    const originals = selectedBricks(state).map(cloneBrick)
    const brick = originals[0]
    if (brick) set({ draft: { ...brick }, movingId: brick.id, movingSelection: { originals, duplicate: false }, activePartId: brick.partId, toast: 'Drag to a new valid location.' })
  },
  copy: () => {
    const state = get()
    const copied = selectedBricks(state)
    if (!copied.length) return
    const clipboard = {
      bricks: copied.map(({ id: _id, ...brick }) => ({ ...brick })),
    }
    set({ clipboard, announcement: copied.length === 1 ? 'Brick copied.' : `${copied.length} bricks copied.` })
  },
  paste: () => {
    const state = get()
    if (!state.clipboard?.bricks.length) return
    const placement = findGroupPasteDrafts(state.clipboard, state.bricks, state.brickBudget)
    if (!placement.drafts) {
      set({
        toast: placement.reason === 'budget'
          ? `Pasting ${state.clipboard.bricks.length} bricks would exceed this world's ${state.brickBudget}-brick limit.`
          : 'The copied group has no valid offset on the plate. Nothing was pasted.',
      })
      return
    }
    const pasted = placement.drafts.map((draft) => ({ ...draft, id: createBrickId() }))
    const startIndex = state.bricks.length
    const pastedIds = pasted.map((brick) => brick.id)
    const deltas = pasted.map((brick, index) => ({ before: null, after: brick, beforeIndex: null, afterIndex: startIndex + index }))
    set({
      bricks: [...state.bricks, ...pasted],
      ...selectionPatch(pastedIds),
      draft: null,
      movingId: null, movingSelection: null,
      activePartId: null,
      undoStack: appendHistory(state.undoStack, historyEntry(deltas, pasted.length === 1 ? 'Paste brick' : `Paste ${pasted.length} bricks`, null, effectiveSelectedIds(state), pastedIds)),
      redoStack: [],
      announcement: pasted.length === 1 ? 'Brick pasted.' : `${pasted.length} bricks pasted.`,
    })
  },
  duplicate: () => {
    const state = get()
    const originals = selectedBricks(state).map(cloneBrick)
    if (!originals.length) return
    if (state.bricks.length + originals.length > state.brickBudget) {
      set({ toast: `Duplicating this selection would exceed this world's ${state.brickBudget}-brick limit.` })
      return
    }
    set({ draft: { ...originals[0] }, movingId: null, movingSelection: { originals, duplicate: true },
      activePartId: originals[0].partId, toast: 'Move the copy to a free location, then place it.' })
  },
  resizeSelectedParts: (partIdsByBrickId) => {
    const state = get()
    const before = selectedBricks(state)
    if (!before.length) return false
    const after = before.map((brick) => ({ ...brick, partId: partIdsByBrickId[brick.id] ?? brick.partId }))
    if (after.some((brick) => !BRICK_PART_MAP[brick.partId]) || !transformedSelectionIsValid(after, state)) {
      set({ toast: 'That resize would overlap another brick or leave the build plate.' })
      return false
    }
    if (after.every((brick, index) => brick.partId === before[index].partId)) {
      set({ toast: 'Choose at least one size change.' })
      return false
    }
    const afterById = new Map(after.map((brick) => [brick.id, brick]))
    const selectedNow = effectiveSelectedIds(state)
    const deltas = before.map((brick) => {
      const index = state.bricks.findIndex((candidate) => candidate.id === brick.id)
      return { before: brick, after: afterById.get(brick.id)!, beforeIndex: index, afterIndex: index }
    })
    set({
      bricks: state.bricks.map((brick) => afterById.get(brick.id) ?? brick),
      undoStack: appendHistory(state.undoStack, historyEntry(deltas, before.length === 1 ? 'Resize brick' : `Resize ${before.length} bricks`, null, selectedNow, selectedNow)),
      redoStack: [],
      announcement: before.length === 1 ? 'Brick resized.' : `${before.length} bricks resized together.`,
    })
    return true
  },
  newBuild: () => {
    const state = get()
    const beforeDocument = state.getDocumentSnapshot()
    const blankDocument = createBrickStudioDocument([])
    const hadBuild = JSON.stringify(beforeDocument) !== JSON.stringify(blankDocument)
    registerCustomParts([])
    set({
      documentMetadata: { environmentId: blankDocument.environmentId, customParts: [] },
      mode: 'build',
      bricks: [],
      ...selectionPatch([]),
      activePartId: null,
      draft: null,
      movingId: null, movingSelection: null,
      clipboard: null,
      redoStack: hadBuild ? [] : state.redoStack,
      undoStack: hadBuild
        ? appendHistory(state.undoStack, { ...replacementHistoryEntry(state.bricks, [], 'New Build'), documentBefore: beforeDocument, documentAfter: blankDocument })
        : state.undoStack,
      viewRequest: { preset: 'home', nonce: state.viewRequest.nonce + 1 },
      selectionMode: false,
      marquee: null,
      touchMove: { x: 0, z: 0 },
      touchMoveMagnitude: 0,
      touchRunning: false,
      exploreSpawnStatus: 'idle',
      exploreLastSafePosition: null,
      toast: hadBuild ? 'Started a new blank build. Undo can restore the previous build.' : 'This build is already blank.',
    })
    return hadBuild
  },
  exportDocument: () => serializeBrickStudioDocument(get().getDocumentSnapshot()),
  importDocument: (serialized) => {
    const state = get()
    const result = parseBrickStudioDocument(serialized, { maxBricks: state.brickBudget })
    if (!result.ok) {
      set({ toast: result.error.message })
      return result
    }
    const nextBricks = result.document.bricks.map(cloneBrick)
    const beforeDocument = state.getDocumentSnapshot()
    const changed = JSON.stringify(beforeDocument) !== JSON.stringify(result.document)
    registerCustomParts(result.document.customParts)
    set({
      mode: 'build',
      bricks: nextBricks,
      documentMetadata: { environmentId: result.document.environmentId, customParts: result.document.customParts },
      ...selectionPatch([]),
      activePartId: null,
      draft: null,
      movingId: null, movingSelection: null,
      clipboard: null,
      redoStack: changed ? [] : state.redoStack,
      undoStack: changed
        ? appendHistory(state.undoStack, { ...replacementHistoryEntry(state.bricks, nextBricks, 'Import project'), documentBefore: beforeDocument, documentAfter: result.document })
        : state.undoStack,
      viewRequest: { preset: 'home', nonce: state.viewRequest.nonce + 1 },
      selectionMode: false,
      marquee: null,
      touchMove: { x: 0, z: 0 },
      touchMoveMagnitude: 0,
      touchRunning: false,
      exploreSpawnStatus: 'idle',
      exploreLastSafePosition: null,
      toast: changed ? `Imported ${nextBricks.length} bricks.` : 'The imported project already matches this build.',
    })
    return { ok: true }
  },
  restoreDocument: (document) => {
    const result = validateBrickStudioDocument(document, { maxBricks: BRICK_STUDIO_MAX_BRICKS })
    if (!result.ok) {
      set({ toast: result.error.message })
      return result
    }
    const restoredBricks = result.document.bricks.map(cloneBrick)
    registerCustomParts(result.document.customParts)
    set((state) => ({
      mode: 'build',
      bricks: restoredBricks,
      documentMetadata: { environmentId: result.document.environmentId, customParts: result.document.customParts },
      ...selectionPatch([]),
      activePartId: null,
      draft: null,
      movingId: null, movingSelection: null,
      clipboard: null,
      undoStack: [],
      redoStack: [],
      viewRequest: { preset: 'home', nonce: state.viewRequest.nonce + 1 },
      touchMove: { x: 0, z: 0 },
      touchMoveMagnitude: 0,
      touchRunning: false,
      exploreSpawnStatus: 'idle',
      exploreLastSafePosition: null,
      selectionMode: false,
      marquee: null,
      toast: restoredBricks.length
        ? `Opened a build with ${restoredBricks.length} bricks.`
        : 'Opened a blank build.',
    }))
    return { ok: true }
  },
  undo: () => {
    const state = get()
    const previous = state.undoStack.at(-1)
    if (!previous) return
    // An armed brush survives undo; a restored selection would fight it, so
    // the selection restore only applies while no brush is armed.
    const brushArmed = !previous.documentBefore && Boolean(state.draft && !state.movingId && !state.movingSelection)
    if (previous.documentBefore) registerCustomParts(previous.documentBefore.customParts)
    set({
      ...(previous.documentBefore ? { documentMetadata: { environmentId: previous.documentBefore.environmentId, customParts: previous.documentBefore.customParts }, activePartId: null, clipboard: null } : {}),
      bricks: previous.documentBefore?.bricks.map(cloneBrick) ?? applyHistoryEntry(state.bricks, previous, 'undo'),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: appendHistory(state.redoStack, previous),
      ...selectionPatch(brushArmed ? [] : previous.selectionBefore),
      movingId: null, movingSelection: null,
      draft: brushArmed ? state.draft : null,
      toast: `Undid: ${previous.label}.`,
    })
  },
  redo: () => {
    const state = get()
    const next = state.redoStack.at(-1)
    if (!next) return
    const netAddition = next.deltas.reduce((total, delta) => total + (delta.after ? 1 : 0) - (delta.before ? 1 : 0), 0)
    if (state.bricks.length + netAddition > state.brickBudget) {
      set({ toast: `Redo would exceed this world's ${state.brickBudget}-brick limit.` })
      return
    }
    const brushArmed = !next.documentAfter && Boolean(state.draft && !state.movingId && !state.movingSelection)
    if (next.documentAfter) registerCustomParts(next.documentAfter.customParts)
    set({
      ...(next.documentAfter ? { documentMetadata: { environmentId: next.documentAfter.environmentId, customParts: next.documentAfter.customParts }, activePartId: null, clipboard: null } : {}),
      bricks: next.documentAfter?.bricks.map(cloneBrick) ?? applyHistoryEntry(state.bricks, next, 'redo'),
      undoStack: appendHistory(state.undoStack, next),
      redoStack: state.redoStack.slice(0, -1),
      ...selectionPatch(brushArmed ? [] : next.selectionAfter),
      movingId: null, movingSelection: null,
      draft: brushArmed ? state.draft : null,
      toast: `Redid: ${next.label}.`,
    })
  },
  setBudgetProfile: (budgetProfile) => set({ budgetProfile, brickBudget: BRICK_BUDGETS[budgetProfile] }),
  requestView: (preset) => set((state) => ({ viewRequest: { preset, nonce: state.viewRequest.nonce + 1 } })),
  setTouchMove: (x, z, magnitude = Math.min(1, Math.hypot(x, z)), running = false) => set({
    touchMove: { x, z },
    touchMoveMagnitude: magnitude,
    touchRunning: running,
  }),
  addTouchYaw: (delta) => set((state) => ({ touchYaw: state.touchYaw + delta })),
  addTouchLook: (yawDelta, pitchDelta) => set((state) => ({
    touchYaw: state.touchYaw + yawDelta,
    touchPitch: clampExplorePitch(state.touchPitch + pitchDelta),
  })),
  setTouchCameraDistance: (touchCameraDistance) => set({ touchCameraDistance: clampOrbitDistance(touchCameraDistance) }),
  adjustTouchCameraDistance: (delta) => set((state) => ({ touchCameraDistance: clampOrbitDistance(state.touchCameraDistance + delta) })),
  recenterCamera: () => set({
    touchYaw: ORBIT_DEFAULT_YAW,
    touchPitch: ORBIT_DEFAULT_PITCH,
    touchCameraDistance: ORBIT_DEFAULT_DISTANCE,
    announcement: 'Camera recentered.',
  }),
  requestRespawn: () => set((state) => ({
    exploreRespawnNonce: state.exploreRespawnNonce + 1,
    exploreSpawnStatus: 'finding',
    touchMove: { x: 0, z: 0 },
    touchMoveMagnitude: 0,
    touchRunning: false,
    touchYaw: ORBIT_DEFAULT_YAW,
    touchPitch: ORBIT_DEFAULT_PITCH,
    touchCameraDistance: ORBIT_DEFAULT_DISTANCE,
    announcement: 'Finding a safe spot.',
  })),
  markExploreSpawnReady: (exploreLastSafePosition) => set({
    exploreSpawnStatus: 'ready',
    exploreLastSafePosition,
    announcement: 'Ready to explore.',
  }),
  rememberExplorePosition: (exploreLastSafePosition) => set({ exploreLastSafePosition }),
  markExploreSpawnUnavailable: () => set({
    exploreSpawnStatus: 'unavailable',
    announcement: 'No safe spot is available. Return to Build and clear some room, then try again.',
  }),
  requestJump: () => set((state) => ({ jumpNonce: state.jumpNonce + 1 })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setSelectionMode: (selectionMode) => set({
    selectionMode,
    marquee: null,
    ...(selectionMode ? { draft: null, movingId: null, movingSelection: null, activePartId: null } : {}),
    toast: selectionMode ? 'Select mode: tap bricks or drag empty space. Tap Done when finished.' : null,
    announcement: selectionMode ? 'Select mode on.' : 'Select mode finished.',
  }),
  setMarquee: (marquee) => set((state) => state.marquee === marquee ? state : { marquee }),
  setGrabInProgress: (grabInProgress) => set((state) => state.grabInProgress === grabInProgress ? state : { grabInProgress }),
  setViewTarget: (x, z) => set((state) => {
    const clampedX = Math.max(0, Math.min(GRID_SIZE, Math.round(x)))
    const clampedZ = Math.max(0, Math.min(GRID_SIZE, Math.round(z)))
    return state.viewTarget?.x === clampedX && state.viewTarget?.z === clampedZ
      ? state
      : { viewTarget: { x: clampedX, z: clampedZ } }
  }),
  clearToast: () => set({ toast: null }),
}))
