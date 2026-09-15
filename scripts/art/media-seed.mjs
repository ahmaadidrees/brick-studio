// Seed world for marketing captures: a small castle in the Brickgineers palette on the default 64 plate.
// Coordinates are studs (x, z), plate units (y); a brick is 3 plates tall. Every piece is a real catalog part so the
// document passes the shared-core validation exactly as a student's world would. Kept small (under 80 bricks) so it
// reads at hero size and stays cheap to render in every scene.

// Slightly lifted pigments retain the approved blue/coral/butter identity under the real dusk lighting.
export const SEED_COLORS = {
  blue: '#488DFF',
  coral: '#FF6644',
  butter: '#FFD343',
  white: '#FFFBF2',
  green: '#6FB26A',
  ink: '#263C51',
}

const { blue, coral, butter, white, green } = SEED_COLORS

let counter = 0
function brick(partId, x, y, z, color, rotation = 0) {
  counter += 1
  return { id: `seed-${counter}`, partId, x, y, z, rotation, color }
}

/** Stacked 2×2 bricks plus a butter wedge roof. */
function tower(x, z, colors, height = 3) {
  const pieces = []
  for (let level = 0; level < height; level += 1) pieces.push(brick('brick_2x2', x, level * 3, z, colors[level % colors.length]))
  pieces.push(brick('slope_2x2', x, height * 3, z, butter, 2))
  return pieces
}

export function createSeedBricks() {
  counter = 0
  return [
    // Front towers flank the gate; back towers are a level taller.
    ...tower(25, 33, [blue, blue, coral, coral, butter, blue], 6),
    ...tower(37, 33, [blue, blue, coral, coral, butter, blue], 6),
    ...tower(25, 27, [coral, coral, butter, butter, blue, blue, coral, butter], 8),
    ...tower(37, 27, [coral, coral, butter, butter, blue, blue, coral, butter], 8),

    // Front wall with an archway gate (arch_1x4 rotated to span 4 studs along x).
    brick('arch_1x4', 30, 0, 35, coral, 1),
    brick('brick_1x3', 27, 0, 35, coral, 1),
    brick('brick_1x3', 27, 3, 35, butter, 1),
    brick('brick_1x3', 27, 6, 35, coral, 1),
    brick('brick_1x3', 34, 0, 35, coral, 1),
    brick('brick_1x3', 34, 3, 35, butter, 1),
    brick('brick_1x3', 34, 6, 35, coral, 1),
    // Battlements along the top of the front wall.
    brick('brick_1x1', 27, 9, 35, white),
    brick('brick_1x1', 29, 9, 35, white),
    brick('brick_1x1', 31, 9, 35, white),
    brick('brick_1x1', 33, 9, 35, white),
    brick('brick_1x1', 35, 9, 35, white),

    // Side walls between the towers.
    brick('brick_2x4', 25, 0, 29, blue),
    brick('brick_2x4', 25, 3, 29, white),
    brick('brick_2x4', 37, 0, 29, blue),
    brick('brick_2x4', 37, 3, 29, white),

    // Back wall.
    brick('brick_2x4', 27, 0, 27, coral, 1),
    brick('brick_2x4', 31, 0, 27, butter, 1),
    brick('brick_2x2', 35, 0, 27, coral),
    brick('brick_2x4', 27, 3, 27, butter, 1),
    brick('brick_2x4', 31, 3, 27, coral, 1),
    brick('brick_2x2', 35, 3, 27, butter),
    brick('brick_2x4', 27, 6, 27, coral, 1),
    brick('brick_2x4', 31, 6, 27, butter, 1),
    brick('brick_2x2', 35, 6, 27, coral),

    // The keep in the courtyard, with a flag pole and a coral pennant.
    brick('brick_4x4', 30, 0, 30, butter),
    brick('brick_4x4', 30, 3, 30, blue),
    brick('brick_4x4', 30, 6, 30, butter),
    brick('brick_4x4', 30, 9, 30, blue),
    brick('brick_4x4', 30, 12, 30, white),
    brick('brick_4x4', 30, 15, 30, blue),
    brick('brick_4x4', 30, 18, 30, blue),
    brick('brick_4x4', 30, 21, 30, butter),
    brick('pillar_1x1', 31, 24, 31, butter),
    brick('brick_1x2', 32, 30, 31, coral, 1),

    // Loose bricks left on the plate around the castle.
    brick('brick_2x4', 19, 0, 40, coral, 1),
    brick('brick_2x2', 42, 0, 39, butter),
    brick('brick_1x4', 17, 0, 30, blue),
    brick('slope_2x2', 44, 0, 30, green, 3),
    brick('brick_2x3', 41, 0, 43, white),
    brick('brick_1x2', 28, 0, 41, green, 1),
  ].map((piece) => ({ ...piece, z: piece.z + 10 }))
}

export const SEED_WORLD = {
  environmentId: 'toy-room',
  plateSize: 64,
}
