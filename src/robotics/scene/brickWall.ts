import * as THREE from 'three'
import { PLATE_HEIGHT, STUD } from '../../brick/parts'
import type { Vec3 } from '../model/vec'

/**
 * The look of a wall prop (the Test plate's fence and posts, drawn by `StageLayer.tsx`) and of the
 * curb around the plate while a robot is ridden in Explore (`explore/ExploreRides.tsx`), so the two
 * read as the same thing.
 */
let wallTexture: THREE.CanvasTexture | null = null
/** Two courses of running-bond bricks: one tile is 2 bricks (4 studs each) wide and 2 courses (3 plates each) tall. */
export function brickWallTexture(): THREE.CanvasTexture | null {
  if (wallTexture) return wallTexture
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#9d8f7c'
  context.fillRect(0, 0, 256, 128)
  const brick = (x: number, y: number, width: number) => {
    context.fillStyle = '#d8ccb8'
    context.fillRect(x + 3, y + 3, width - 6, 58)
    context.fillStyle = 'rgba(255,255,255,0.18)'
    context.fillRect(x + 3, y + 3, width - 6, 8)
  }
  brick(0, 0, 128)
  brick(128, 0, 128)
  brick(-64, 64, 128)
  brick(64, 64, 128)
  brick(192, 64, 128)
  wallTexture = new THREE.CanvasTexture(canvas)
  wallTexture.colorSpace = THREE.SRGBColorSpace
  wallTexture.wrapS = THREE.RepeatWrapping
  wallTexture.wrapT = THREE.RepeatWrapping
  return wallTexture
}

const tiles = new Map<string, THREE.CanvasTexture>()
/**
 * The brick pattern tiled at brick scale over a wall of this size (world units), or null without a
 * document. One texture per size for the session, shared by every wall that size: walls come and go
 * with every stage and every ride, and a clone per wall was never disposed.
 */
export function brickWallTile(size: Vec3): THREE.CanvasTexture | null {
  const along = Math.max(size.x, size.z)
  const key = `${along.toFixed(3)}:${size.y.toFixed(3)}`
  const cached = tiles.get(key)
  if (cached) return cached
  const base = brickWallTexture()
  if (!base) return null
  const tile = base.clone()
  tile.repeat.set(along / (8 * STUD), size.y / (6 * PLATE_HEIGHT))
  tile.needsUpdate = true
  tiles.set(key, tile)
  return tile
}

/** The cap along a wall's top. */
export const WALL_CAP_COLOR = '#8a7c69'
