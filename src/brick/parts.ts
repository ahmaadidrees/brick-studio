import type { BrickPart } from './types'

export const STUD = 0.62
export const PLATE_HEIGHT = 0.18
export const GRID_SIZE = 64

export const BRICK_PARTS: BrickPart[] = [
  { id: 'brick_1x1', name: '1 × 1 Brick', width: 1, depth: 1, height: 3, kind: 'brick', icon: '1×1' },
  { id: 'brick_1x2', name: '1 × 2 Brick', width: 1, depth: 2, height: 3, kind: 'brick', icon: '1×2' },
  { id: 'brick_1x4', name: '1 × 4 Brick', width: 1, depth: 4, height: 3, kind: 'brick', icon: '1×4' },
  { id: 'brick_2x2', name: '2 × 2 Brick', width: 2, depth: 2, height: 3, kind: 'brick', icon: '2×2' },
  { id: 'brick_2x3', name: '2 × 3 Brick', width: 2, depth: 3, height: 3, kind: 'brick', icon: '2×3' },
  { id: 'brick_2x4', name: '2 × 4 Brick', width: 2, depth: 4, height: 3, kind: 'brick', icon: '2×4' },
  { id: 'plate_2x4', name: '2 × 4 Plate', width: 2, depth: 4, height: 1, kind: 'plate', icon: '▱' },
  { id: 'plate_4x6', name: '4 × 6 Plate', width: 4, depth: 6, height: 1, kind: 'plate', icon: '4×6' },
  { id: 'pillar_1x1', name: 'Tall Pillar', width: 1, depth: 1, height: 9, kind: 'brick', icon: '▥' },
  { id: 'slope_2x2', name: '2 × 2 Slope', width: 2, depth: 2, height: 3, kind: 'slope', icon: '◢' },
  { id: 'stair_2x3', name: 'Three Steps', width: 2, depth: 3, height: 3, kind: 'stair', icon: '▟' },
  { id: 'window_1x4', name: 'Window Frame', width: 1, depth: 4, height: 6, kind: 'window', icon: '▣' },
  { id: 'door_1x4', name: 'Door Frame', width: 1, depth: 4, height: 9, kind: 'door', icon: '▯' },
]

export const BRICK_PART_MAP = Object.fromEntries(BRICK_PARTS.map((part) => [part.id, part])) as Record<string, BrickPart>

export const BRICK_COLORS = [
  '#e7473c', '#ef8d32', '#f4ca3a', '#65b85a', '#2eaa9d', '#3e83d7',
  '#6857d9', '#d765ae', '#f5eee0', '#a9b7bd', '#52636c', '#7b5238',
]

export function rotatedSize(part: BrickPart, rotation: number) {
  return rotation % 2 === 0
    ? { width: part.width, depth: part.depth }
    : { width: part.depth, depth: part.width }
}

export function brickWorldPosition(brick: Pick<import('./types').BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'>) {
  const part = BRICK_PART_MAP[brick.partId]
  const size = rotatedSize(part, brick.rotation)
  return [
    (brick.x + size.width / 2 - GRID_SIZE / 2) * STUD,
    brick.y * PLATE_HEIGHT,
    (brick.z + size.depth / 2 - GRID_SIZE / 2) * STUD,
  ] as [number, number, number]
}
