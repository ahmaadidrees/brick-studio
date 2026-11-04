/**
 * Hackable 3D spike (docs/qa/hackable-3d/SPIKE.md): a sample 3D project. A build of `n` plain classic bricks (a
 * plate-step ramp up to a deck, then a seeded scatter of stacked parts), the Hero with the classic character's
 * sliders, a coded Bounce pad and two coded Coins. Plain data, the same on every engine.
 */
import type { BrickDef, Expr, Script, Stmt, VariableDecl } from '../core/contracts'
import { BRICK_PART_MAP } from '../../../../packages/brick-core/src/parts'
import { GRID, PLATE, STUD, type BrickDef3, type CopyPlacement3, type LevelDesign3, type SceneryBrick } from './contracts3d'
import { CHARACTER_DEFAULTS } from './physics3d'
import { HERO3D, SCENERY_BRICK } from './engine3d'

const lit = (value: number | string): Expr => ({ kind: 'lit', value })
const st = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}, branches?: Stmt[][]): Stmt => ({ opcode, fields, inputs, ...(branches ? { branches } : {}) })
const rep = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}): Expr => ({ kind: 'block', opcode, fields, inputs })
const script = (id: string, opcode: Script['hat']['opcode'], fields: Record<string, string>, ...body: Stmt[]): Script => ({ id, hat: { opcode, fields, inputs: {} }, body })
const program = (scripts: Script[], variables: VariableDecl[] = []): BrickDef['program'] => ({ scripts, procedures: [], variables, lists: [] })

/** The Hero's sliders: Build's knobs on the Hero, read by the character every substep. */
export const HERO_SLIDERS: VariableDecl[] = [
  { id: 'v_walk', name: 'walk speed', value: CHARACTER_DEFAULTS.walk, showInBuild: true },
  { id: 'v_run', name: 'run speed', value: CHARACTER_DEFAULTS.run, showInBuild: true },
  { id: 'v_jump', name: 'jump speed', value: CHARACTER_DEFAULTS.jump, showInBuild: true },
  { id: 'v_gravity', name: 'gravity', value: CHARACTER_DEFAULTS.gravity, showInBuild: true },
  { id: 'v_air', name: 'air jumps', value: CHARACTER_DEFAULTS.airJumps, showInBuild: true },
]

function hero(): BrickDef3 {
  return {
    id: HERO3D, name: 'Hero', limit: 1, costumes: [], sounds: [],
    shape3d: { w: 0.36, h: 0.72, d: 0.36, look: { color: '#3e83d7', model: 'hero' } },
    program: program([script('hero_land', 'platformer_whenland', {}, st('data_changevariableby', { VARIABLE: 'g_landings' }, { VALUE: lit(1) }))], HERO_SLIDERS),
  }
}

/** Bounce pad: solid; when a Hero lands on it, launch them up and count it. The 9 is what the lockstep test edits. */
function bouncePad(): BrickDef3 {
  return {
    id: 'brick_pad3d', name: 'Bounce pad', costumes: [], sounds: [],
    shape3d: { w: 2 * STUD, h: PLATE, d: 2 * STUD, look: { color: '#e7473c', model: 'pad' } },
    program: program([
      script('pad_start', 'event_whenflagclicked', {}, st('platformer_setsolid', { SOLID: 'on' })),
      script('pad_bump', 'platformer_whenbump', { SIDE: 'bottom', BRICK: 'Hero' },
        st('kit3d_launchlanders', {}, { SPEED: lit(9) }),
        st('data_changevariableby', { VARIABLE: 'g_bounces' }, { VALUE: lit(1) })),
    ]),
  }
}

/** Coin: spins; when a Hero touches it, a coin for everyone and it jumps somewhere random (the seeded RNG). */
function coin(): BrickDef3 {
  const random = (from: number, to: number) => rep('operator_random', {}, { FROM: lit(from), TO: lit(to) })
  return {
    id: 'brick_coin3d', name: 'Coin', costumes: [], sounds: [],
    shape3d: { w: 0.5, h: 0.5, d: 0.5, look: { color: '#f4ca3a', model: 'coin' } },
    program: program([
      script('coin_start', 'event_whenflagclicked', {}, st('control_forever', {}, {}, [[
        st('motion_turnright', {}, { DEGREES: lit(6) }),
        st('control_if', {}, { CONDITION: rep('sensing_touchingobject', { TOUCHINGOBJECTMENU: 'Hero' }) }, [[
          st('data_changevariableby', { VARIABLE: 'g_coins' }, { VALUE: lit(1) }),
          st('kit3d_gotoxyz', {}, { X: random(-6, 6), Y: lit(0.3), Z: random(-6, 6) }),
        ]]),
      ]])),
    ]),
  }
}

/** Plain parts the scatter picks from (all classic parts, weighted toward bricks and plates). */
const SCATTER = ['brick_2x4', 'brick_2x2', 'brick_1x4', 'plate_2x4', 'plate_4x6', 'brick_1x2', 'slope_2x2', 'stair_2x3', 'corner_2x2', 'round_1x1', 'brick_4x4', 'pillar_1x1', 'door_1x4', 'arch_1x4', 'plate_6x8', 'brick_2x6']
const COLORS = ['#e7473c', '#ef8d32', '#f4ca3a', '#65b85a', '#2eaa9d', '#3e83d7', '#6857d9', '#d765ae', '#f5eee0', '#a9b7bd']

const footprint = (b: SceneryBrick) => {
  const part = BRICK_PART_MAP[b.partId]
  return b.rotation % 2 ? { w: part.depth, d: part.width } : { w: part.width, d: part.depth }
}

/** Plate-step ramp, a deck, then a scatter up to `n` bricks, stacked on whatever is below (like the builder does). */
export function sampleScenery(n: number, seed = 7): SceneryBrick[] {
  const out: SceneryBrick[] = []
  // A ramp of 2 × 4 plates, one plate higher every two studs (walkable by autostep), up to a 6 × 8 deck.
  for (let i = 0; i < 12 && out.length < n; i++) {
    for (let y = 0; y <= i && out.length < n; y++) out.push({ partId: 'plate_2x4', x: 36 + i * 2, z: 26, y, rotation: 0, color: COLORS[i % COLORS.length] })
  }
  for (let y = 0; y < 13 && out.length < n; y += 3) out.push({ partId: 'brick_4x4', x: 60, z: 26, y: Math.min(y, 10), rotation: 0, color: '#a9b7bd' })
  if (out.length < n) out.push({ partId: 'plate_6x8', x: 58, z: 24, y: 13, rotation: 0, color: '#65b85a' })

  let s = seed >>> 0
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 }
  const heights = new Int32Array(GRID * GRID)
  for (const b of out) {
    const f = footprint(b)
    for (let x = b.x; x < b.x + f.w; x++) for (let z = b.z; z < b.z + f.d; z++) heights[x * GRID + z] = Math.max(heights[x * GRID + z], b.y + BRICK_PART_MAP[b.partId].height)
  }
  let guard = 0
  while (out.length < n && guard++ < n * 20) {
    const partId = SCATTER[Math.floor(rand() * SCATTER.length)]
    const rotation = Math.floor(rand() * 4) as 0 | 1 | 2 | 3
    const probe: SceneryBrick = { partId, x: 0, z: 0, y: 0, rotation, color: COLORS[Math.floor(rand() * COLORS.length)] }
    const f = footprint(probe)
    probe.x = Math.floor(rand() * (GRID - f.w + 1))
    probe.z = Math.floor(rand() * (GRID - f.d + 1))
    // Keep the start, the pad and the coins' corner of the plate clear.
    if (probe.x < 40 && probe.x + f.w > 22 && probe.z < 44 && probe.z + f.d > 20) continue
    let y = 0
    for (let x = probe.x; x < probe.x + f.w; x++) for (let z = probe.z; z < probe.z + f.d; z++) y = Math.max(y, heights[x * GRID + z])
    if (y > 27) continue
    probe.y = y
    const top = y + BRICK_PART_MAP[partId].height
    for (let x = probe.x; x < probe.x + f.w; x++) for (let z = probe.z; z < probe.z + f.d; z++) heights[x * GRID + z] = top
    out.push(probe)
  }
  return out
}

export interface SampleOptions {
  /** Plain build bricks. */
  bricks: number
  /** SPIKE: every build brick a target instead of scenery. */
  sceneryAsTargets?: boolean
  seed?: number
}

export function sampleDesign3d(opts: SampleOptions): LevelDesign3 {
  const copies: CopyPlacement3[] = [
    { id: 'hero', brickId: HERO3D, x: 0, y: 0, z: 4 * STUD },
    { id: 'pad', brickId: 'brick_pad3d', x: 0, y: 0, z: 0 },
    { id: 'coin1', brickId: 'brick_coin3d', x: 0.3, y: 0.3, z: 1.5 },
    { id: 'coin2', brickId: 'brick_coin3d', x: -3 * STUD, y: 0.3, z: -2 * STUD },
  ]
  const bricks: BrickDef3[] = [hero(), bouncePad(), coin()]
  if (opts.sceneryAsTargets) bricks.push({ id: SCENERY_BRICK, name: 'Brick', costumes: [], sounds: [], program: program([]) })
  return {
    id: 'spike3d', name: 'Hackable 3D spike', kit: '3d',
    bounds: { left: -GRID * STUD / 2, right: GRID * STUD / 2, bottom: 0, top: 40 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: program([], [
      { id: 'g_coins', name: 'coins', value: 0 }, { id: 'g_bounces', name: 'bounces', value: 0 }, { id: 'g_landings', name: 'landings', value: 0 },
    ]) },
    bricks, copies, seed: opts.seed ?? 42,
    scenery3d: sampleScenery(opts.bricks),
    ...(opts.sceneryAsTargets ? { sceneryAsTargets: true } : {}),
  }
}
