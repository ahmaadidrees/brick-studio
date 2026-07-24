/**
 * Server-side port of the Brick Studio placement rules.
 *
 * SPIKE NOTE: the footprint table and the collision math are hand-ported from
 * `src/brick/parts.ts` + `src/brick/store.ts` (draftIsValid) and
 * `src/brick/brickDocument.ts` (validateBrick). The productionization path in
 * MULTIPLAYER_SPIKE.md covers extracting one shared rules package so the two
 * copies cannot drift.
 */

export const GRID_SIZE = 64
export const MAX_BRICKS = 250
export const MAX_Y = 1024
export const MAX_ID_LENGTH = 128

const COLOR_PATTERN = /^#(?:[\da-f]{3}|[\da-f]{6})$/i

/** partId -> grid footprint, mirrored from BRICK_PARTS in src/brick/parts.ts. */
export const PART_FOOTPRINTS = {
  brick_1x1: { width: 1, depth: 1, height: 3 },
  brick_1x2: { width: 1, depth: 2, height: 3 },
  brick_1x4: { width: 1, depth: 4, height: 3 },
  brick_2x2: { width: 2, depth: 2, height: 3 },
  brick_2x3: { width: 2, depth: 3, height: 3 },
  brick_2x4: { width: 2, depth: 4, height: 3 },
  plate_2x4: { width: 2, depth: 4, height: 1 },
  plate_4x6: { width: 4, depth: 6, height: 1 },
  pillar_1x1: { width: 1, depth: 1, height: 9 },
  slope_2x2: { width: 2, depth: 2, height: 3 },
  stair_2x3: { width: 2, depth: 3, height: 3 },
  window_1x4: { width: 1, depth: 4, height: 6 },
  door_1x4: { width: 1, depth: 4, height: 9 },
}

export const COMMAND_OPS = ['place', 'move', 'rotate', 'recolor', 'update', 'delete']

function fail(code, message) {
  return { ok: false, error: { code, message } }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function rotatedFootprint(partId, rotation) {
  const part = PART_FOOTPRINTS[partId]
  return rotation % 2 === 0
    ? { width: part.width, depth: part.depth }
    : { width: part.depth, depth: part.width }
}

/** Structural validation of one brick payload. Mirrors validateBrick. */
export function validateBrickShape(value) {
  if (!isRecord(value)) return fail('invalid-brick', 'Each brick must be an object.')
  const { id, partId, x, y, z, rotation, color } = value
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) {
    return fail('invalid-brick', 'A brick has an invalid id.')
  }
  if (typeof partId !== 'string' || !PART_FOOTPRINTS[partId]) {
    return fail('invalid-brick', 'A brick uses an unknown part id.')
  }
  if (![x, y, z].every((coordinate) => Number.isInteger(coordinate))) {
    return fail('invalid-brick', 'Brick coordinates must be whole grid values.')
  }
  if (x < 0 || z < 0 || y < 0 || y > MAX_Y) {
    return fail('invalid-brick', 'A brick sits outside the supported build range.')
  }
  if (rotation !== 0 && rotation !== 1 && rotation !== 2 && rotation !== 3) {
    return fail('invalid-brick', 'A brick has an invalid rotation.')
  }
  if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
    return fail('invalid-brick', 'A brick has an invalid color.')
  }
  return { ok: true, brick: { id, partId, x, y, z, rotation, color } }
}

/** Grid AABB test, mirrored from draftIsValid in src/brick/store.ts. */
export function bricksCollide(first, second) {
  const firstSize = rotatedFootprint(first.partId, first.rotation)
  const secondSize = rotatedFootprint(second.partId, second.rotation)
  const overlapX = first.x < second.x + secondSize.width && first.x + firstSize.width > second.x
  const overlapZ = first.z < second.z + secondSize.depth && first.z + firstSize.depth > second.z
  const overlapY = first.y < second.y + PART_FOOTPRINTS[second.partId].height
    && first.y + PART_FOOTPRINTS[first.partId].height > second.y
  return overlapX && overlapZ && overlapY
}

export function brickFits(brick, bricks) {
  const size = rotatedFootprint(brick.partId, brick.rotation)
  if (brick.x + size.width > GRID_SIZE || brick.z + size.depth > GRID_SIZE) return false
  return bricks.every((other) => !bricksCollide(brick, other))
}

/**
 * Applies one atomic command batch against the authoritative brick document.
 *
 * Rules:
 * - at most one command per brick id per batch (the client diff guarantees it)
 * - `place` requires a fresh id; `move`/`rotate`/`recolor`/`update` require an
 *   existing id (a miss means another builder changed it first — server-order-wins)
 * - `delete` is idempotent so racing deletes never reject
 * - collision staging removes deleted + replaced bricks first, so batches that
 *   rearrange bricks (imports, undo of a group move) validate as a whole
 * - the whole batch is rejected on the first violation; nothing is applied
 *
 * Returns { ok: true, bricks } or { ok: false, error: { code, message } }.
 */
export function applyCommands(bricks, commands, { maxBricks = MAX_BRICKS } = {}) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return fail('invalid-batch', 'A command batch must be a non-empty array.')
  }

  const byId = new Map(bricks.map((brick) => [brick.id, brick]))
  const touchedIds = new Set()
  const deletedIds = new Set()
  /** @type {{ brick: any, replaces: boolean }[]} */
  const upserts = []

  for (const command of commands) {
    if (!isRecord(command) || !COMMAND_OPS.includes(command.op)) {
      return fail('invalid-command', 'A command in the batch is malformed.')
    }
    if (command.op === 'delete') {
      if (typeof command.id !== 'string' || command.id.length === 0 || command.id.length > MAX_ID_LENGTH) {
        return fail('invalid-command', 'A delete command has an invalid id.')
      }
      if (touchedIds.has(command.id)) return fail('conflicting-batch', 'A batch may only touch each brick once.')
      touchedIds.add(command.id)
      deletedIds.add(command.id)
      continue
    }
    const validated = validateBrickShape(command.brick)
    if (!validated.ok) return validated
    const brick = validated.brick
    if (touchedIds.has(brick.id)) return fail('conflicting-batch', 'A batch may only touch each brick once.')
    touchedIds.add(brick.id)
    if (command.op === 'place') {
      if (byId.has(brick.id)) return fail('duplicate-id', 'A placed brick reuses an existing id.')
      upserts.push({ brick, replaces: false })
    } else {
      if (!byId.has(brick.id)) return fail('unknown-brick', 'That brick was already changed or removed by another builder.')
      upserts.push({ brick, replaces: true })
    }
  }

  const replacedIds = new Set(upserts.filter((upsert) => upsert.replaces).map((upsert) => upsert.brick.id))
  const stage = bricks.filter((brick) => !deletedIds.has(brick.id) && !replacedIds.has(brick.id))
  const accepted = []
  for (const upsert of upserts) {
    if (!brickFits(upsert.brick, [...stage, ...accepted])) {
      return fail('overlap', 'A brick in the batch overlaps another brick or leaves the build plate.')
    }
    accepted.push(upsert.brick)
  }

  if (stage.length + accepted.length > maxBricks) {
    return fail('brick-limit', `The room is limited to ${maxBricks} bricks.`)
  }

  const replacements = new Map(
    upserts.filter((upsert) => upsert.replaces).map((upsert) => [upsert.brick.id, upsert.brick]),
  )
  const next = bricks
    .filter((brick) => !deletedIds.has(brick.id))
    .map((brick) => replacements.get(brick.id) ?? brick)
  for (const upsert of upserts) {
    if (!upsert.replaces) next.push(upsert.brick)
  }
  return { ok: true, bricks: next }
}
