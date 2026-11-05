/**
 * Hackable Racing's track bricks from the classic race kit (parity bucket B, 2026-11-04): grid bricks a track gets when
 * a kid picks them in the drawer (builtins/extras.ts). Pictures follow the classic track art (src/platformer/race
 * raceArt.ts drawRaceTile), drawn on grass, 16 x 16.
 *
 * The walls are solid (`solid [on]`, like the Barrier); how hard a car bounces off each is the Car's own business
 * ("how bouncy is what I hit" in carBrick.ts reads the brick's name). Flowers are ground: the Car drives over them as
 * grass ("Off-road slowdown" reads `ground under me`).
 */
import type { BrickDef, Costume } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../../core/editor/compile'
import { Blocks } from '../blockBuilder'
import { costumeFromImage, imageFromRows } from '../pixels'
import type { MadeBrick } from '../starter'

export const TIRES_BRICK_ID = 'brick_tires'
export const BUMPER_BRICK_ID = 'brick_bumper'
export const TREE_BRICK_ID = 'brick_tree'
export const STAND_BRICK_ID = 'brick_stand'
export const FLOWERS_BRICK_ID = 'brick_flowers'

interface Spec {
  id: string
  name: string
  char: string
  palette: Record<string, string>
  art: (x: number, y: number) => string
  solid: boolean
}

const GRASS = { g: '#5fb244', h: '#6fc254' }
/** The pixel's distance from a point, measured from the pixel's middle. */
const dist = (x: number, y: number, cx: number, cy: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
/** Grass with the classic studs. */
const grass = (x: number, y: number) => (dist(x % 8, y % 8, 4, 4) < 1.6 ? 'h' : 'g')

const SPECS: Readonly<Record<string, Spec>> = {
  [TIRES_BRICK_ID]: {
    id: TIRES_BRICK_ID, name: 'Tire stack', char: 'T', solid: true,
    palette: { ...GRASS, k: '#23262d', w: '#4a5060', r: '#d9473c' },
    art: (x, y) => {
      const cx = x < 8 ? 4 : 12, cy = y < 8 ? 4 : 12
      const d = dist(x, y, cx, cy)
      if (d < 1.7) return (cx + cy) % 3 ? 'w' : 'r'
      return d < 3.9 ? 'k' : grass(x, y)
    },
  },
  [BUMPER_BRICK_ID]: {
    id: BUMPER_BRICK_ID, name: 'Bumper', char: 'U', solid: true,
    palette: { ...GRASS, s: '#4c8a37', p: '#ff5fa2', w: '#ffffff' },
    art: (x, y) => {
      const d = dist(x, y, 8, 8)
      if (d < 2.6) return 'p'
      if (d < 4.4) return 'w'
      if (d < 7) return 'p'
      return dist(x, y, 9, 9.5) < 7 ? 's' : grass(x, y)
    },
  },
  [TREE_BRICK_ID]: {
    id: TREE_BRICK_ID, name: 'Tree', char: 'E', solid: true,
    palette: { ...GRASS, s: '#4c8a37', d: '#2f7d32', l: '#3f9a3c', w: '#9ccf8c' },
    art: (x, y) => {
      if (dist(x, y, 5.5, 5.5) < 1.6) return 'w'
      if (dist(x, y, 7, 7) < 4.6) return 'l'
      if (dist(x, y, 8, 8) < 7.2) return 'd'
      return dist(x, y, 9.5, 10) < 7 ? 's' : grass(x, y)
    },
  },
  [STAND_BRICK_ID]: {
    id: STAND_BRICK_ID, name: 'Grandstand', char: 'S', solid: true,
    // Grey seats in two rows with a crowd of coloured heads (the classic stand's six colours).
    palette: { a: '#8b93a3', b: '#737b8c', '0': '#ef4b3f', '1': '#ffd34d', '2': '#5888DA', '3': '#ffffff', '4': '#2e9d57', '5': '#ff8c1a' },
    art: (x, y) => {
      if (y === 7 || y === 8 || y === 15) return 'b'
      for (let i = 0; i < 6; i++) {
        if (dist(x, y, 2.5 + (i % 3) * 5.5, 3.5 + (i > 2 ? 8 : 0)) < 1.8) return String(i)
      }
      return 'a'
    },
  },
  [FLOWERS_BRICK_ID]: {
    id: FLOWERS_BRICK_ID, name: 'Flowers', char: 'L', solid: false,
    palette: { ...GRASS, '0': '#ff7eb6', '1': '#ffd34d', '2': '#ffffff', '3': '#b18cff' },
    art: (x, y) => {
      for (let i = 0; i < 4; i++) if (dist(x, y, 4 + (i % 2) * 8, 4 + (i >> 1) * 8) < 1.9) return String(i)
      return grass(x, y)
    },
  },
}

function costume(spec: Spec): Costume {
  const rows = Array.from({ length: TILE_SIZE }, (_, y) => Array.from({ length: TILE_SIZE }, (_, x) => spec.art(x, y)).join(''))
  return costumeFromImage(spec.name, imageFromRows(rows, spec.palette), { x: 8, y: 8 })
}

function workspace(spec: Spec): WorkspaceJson {
  const b = new Blocks(spec.id.replace(/^brick_/, 'track_'))
  if (spec.solid) b.flag('When the race starts: cars can\'t drive through me', [b.setSolid('on')])
  return b.workspace()
}

/** A fresh race track brick from the classic kit, by catalog id. */
export function createRaceExtraBrick(id: string): MadeBrick {
  const spec = SPECS[id]
  if (!spec) throw new Error(`createRaceExtraBrick: unknown brick ${id}`)
  const ws = workspace(spec)
  const brick: BrickDef = { id, name: spec.name, costumes: [costume(spec)], sounds: [], program: compileWorkspace(ws).program, grid: { char: spec.char } }
  return { brick, workspace: ws }
}
