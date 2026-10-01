/**
 * Runtime clones. `makeClone` copies the C01 snapshot and shallow-copies local lists (C11).
 * It does not copy bubbles, volume, sound effects, or any running script.
 *
 * `control_create_clone_of` clones `_myself_` (the current target, even when that target is
 * already a clone) or the named brick's first non-clone via `findOriginal`. A brick that exists
 * but has no painted copy is cloned from Scratch's new-sprite defaults placed at the level's
 * bottom-left corner (`bounds.left`, `bounds.bottom`). The stage is never cloned. The 300-clone
 * cap is enforced here; `makeClone` itself always returns a target.
 */
import { CLONE_LIMIT, EFFECT_NAMES } from './contracts'
import type { BrickDef, EffectName, Primitive, PrimitiveCtx, PrimitiveTable, Target, Value, World } from './contracts'

function freshEffects(): Record<EffectName, number> {
  const effects = {} as Record<EffectName, number>
  for (const name of EFFECT_NAMES) effects[name] = 0
  return effects
}

function copyEffects(source: Target): Record<EffectName, number> {
  const effects = freshEffects()
  for (const name of EFFECT_NAMES) effects[name] = source.effects[name] ?? 0
  return effects
}

/** Snapshot of `source` at this moment. Always returns a new clone target; does not insert it. */
export function makeClone(world: World, source: Target): Target {
  const lists: Record<string, Value[]> = {}
  for (const [id, items] of Object.entries(source.lists)) lists[id] = items.slice()
  const id = String(world.nextTargetId)
  world.nextTargetId += 1
  return {
    id,
    brickId: source.brickId,
    isStage: false,
    isClone: true,
    copyId: source.copyId,
    x: source.x,
    y: source.y,
    direction: source.direction,
    draggable: source.draggable,
    visible: source.visible,
    size: source.size,
    costumeIndex: source.costumeIndex,
    rotationStyle: source.rotationStyle,
    effects: copyEffects(source),
    volume: 100,
    soundEffects: { pitch: 0, pan: 0 },
    variables: { ...source.variables },
    lists,
    bubble: null,
    edgeHatState: { ...source.edgeHatState },
  }
}

/** Pose used when a named brick has no painted copy to snapshot. */
function defaultsFor(world: World, brick: BrickDef): Target {
  const variables: Record<string, Value> = {}
  for (const decl of brick.program.variables) variables[decl.id] = decl.value
  const lists: Record<string, Value[]> = {}
  for (const decl of brick.program.lists) lists[decl.id] = decl.value.slice()
  return {
    id: `default:${brick.id}`,
    brickId: brick.id,
    isStage: false,
    isClone: false,
    x: world.bounds.left,
    y: world.bounds.bottom,
    direction: 90,
    size: 100,
    visible: true,
    draggable: false,
    costumeIndex: 0,
    rotationStyle: 'all around',
    effects: freshEffects(),
    volume: 100,
    soundEffects: { pitch: 0, pan: 0 },
    variables,
    lists,
    bubble: null,
    edgeHatState: {},
  }
}

function brickNamed(world: World, name: string): BrickDef | undefined {
  for (const brick of Object.values(world.bricks)) {
    if (!brick.isStage && brick.name === name) return brick
  }
  return undefined
}

function asText(value: Value): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return value ? 'true' : 'false'
}

function cloneOption(ctx: PrimitiveCtx): string {
  const field = ctx.field('CLONE_OPTION')
  if (field !== '') return field
  const arg = ctx.arg('CLONE_OPTION')
  if (arg === '') return '_myself_'
  return asText(arg)
}

const createCloneOf: Primitive = (ctx) => {
  const option = cloneOption(ctx)
  const world = ctx.runtime.world
  let source: Target | undefined
  if (option === '_myself_') {
    source = ctx.target
  } else {
    source = ctx.runtime.findOriginal(option)
    if (!source) {
      const brick = brickNamed(world, option)
      if (!brick) return
      source = defaultsFor(world, brick)
    }
  }
  if (source.isStage) return
  if (world.cloneCount >= CLONE_LIMIT) return
  const clone = makeClone(world, source)
  const added = ctx.runtime.addClone(clone, source)
  if (added && clone.visible) ctx.runtime.requestRedraw()
}

const deleteThisClone: Primitive = (ctx) => {
  ctx.runtime.removeClone(ctx.target)
}

export const clonePrimitives: PrimitiveTable = {
  control_create_clone_of: createCloneOf,
  control_delete_this_clone: deleteThisClone,
}
