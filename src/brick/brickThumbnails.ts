import * as THREE from 'three'
import { createBrickGeometry } from './geometry'
import type { BrickPart } from './types'

export const THUMBNAIL_PIXELS = 128
const FRAME_PADDING = 1.08
const CAMERA_DISTANCE = 20
/** Hero three-quarter angle: the direction the camera looks along, toward the part. */
export const THUMBNAIL_VIEW_DIRECTION: [number, number, number] = [-1, -0.82, -1]

export type ThumbnailFraming = {
  halfWidth: number
  halfHeight: number
  center: [number, number, number]
}

type ThumbnailStage = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
  placeholder: THREE.BufferGeometry
}

const dataUrlCache = new Map<string, string>()
let stage: ThumbnailStage | null = null
// null until probed. A host without WebGL never gains it, so the verdict outlives disposal.
let webglSupported: boolean | null = null

export function thumbnailCacheKey(part: BrickPart, color: string) {
  return `${part.id}|${color.toLowerCase()}`
}

/**
 * Smallest orthographic frustum that contains an axis-aligned box seen along
 * `direction`, plus padding. Framing every part this way keeps a 1×1 stud and a
 * 6×8 plate the same visual weight in the drawer.
 */
export function thumbnailFraming(
  min: [number, number, number],
  max: [number, number, number],
  direction: [number, number, number] = THUMBNAIL_VIEW_DIRECTION,
  padding = FRAME_PADDING,
): ThumbnailFraming {
  const forward = new THREE.Vector3(...direction).normalize()
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward)
  // A straight-down view has no unique right vector; pick one so framing stays finite.
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  right.normalize()
  const up = new THREE.Vector3().crossVectors(forward, right).normalize()
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ]

  let halfWidth = 0
  let halfHeight = 0
  const corner = new THREE.Vector3()
  for (let index = 0; index < 8; index += 1) {
    corner.set(
      (index & 1 ? max : min)[0] - center[0],
      (index & 2 ? max : min)[1] - center[1],
      (index & 4 ? max : min)[2] - center[2],
    )
    halfWidth = Math.max(halfWidth, Math.abs(corner.dot(right)))
    halfHeight = Math.max(halfHeight, Math.abs(corner.dot(up)))
  }

  return {
    halfWidth: Math.max(halfWidth * padding, 0.001),
    halfHeight: Math.max(halfHeight * padding, 0.001),
    center,
  }
}

function createStage(): ThumbnailStage | null {
  if (stage) return stage
  if (webglSupported === false) return null

  try {
    const canvas = document.createElement('canvas')
    canvas.width = THUMBNAIL_PIXELS
    canvas.height = THUMBNAIL_PIXELS
    // preserveDrawingBuffer keeps the pixels readable by toDataURL after render().
    const context = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })
    if (!context) {
      webglSupported = false
      return null
    }
    webglSupported = true

    const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true })
    renderer.setSize(THUMBNAIL_PIXELS, THUMBNAIL_PIXELS, false)
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(4, 7, 5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xd9e6f4, 1.2)
    fill.position.set(-6, 2, -4)
    scene.add(fill)

    const placeholder = new THREE.BufferGeometry()
    const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 })
    const mesh = new THREE.Mesh(placeholder, material)
    scene.add(mesh)

    stage = {
      renderer,
      scene,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_DISTANCE * 3),
      mesh,
      material,
      placeholder,
    }
    return stage
  } catch {
    webglSupported = false
    return null
  }
}

/**
 * Data URL of a part rendered in `color`, or null when WebGL is unavailable and
 * the caller should fall back. Every part/colour pair renders once ever.
 */
export function renderPartThumbnail(part: BrickPart, color: string): string | null {
  const key = thumbnailCacheKey(part, color)
  const cached = dataUrlCache.get(key)
  if (cached) return cached

  const active = createStage()
  if (!active) return null

  try {
    const geometry = createBrickGeometry(part)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (!box) return null

    const framing = thumbnailFraming(box.min.toArray(), box.max.toArray())
    const center = new THREE.Vector3(...framing.center)
    active.mesh.geometry = geometry
    active.material.color.set(color)

    active.camera.left = -framing.halfWidth
    active.camera.right = framing.halfWidth
    active.camera.top = framing.halfHeight
    active.camera.bottom = -framing.halfHeight
    active.camera.updateProjectionMatrix()
    active.camera.position
      .set(...THUMBNAIL_VIEW_DIRECTION)
      .normalize()
      .multiplyScalar(-CAMERA_DISTANCE)
      .add(center)
    active.camera.lookAt(center)

    active.renderer.render(active.scene, active.camera)
    const url = active.renderer.domElement.toDataURL('image/png')
    dataUrlCache.set(key, url)
    return url
  } catch {
    return null
  }
}

export function partThumbnailCacheSize() {
  return dataUrlCache.size
}

/** Releases the shared renderer. Part geometry is owned by geometry.ts and stays cached. */
export function disposePartThumbnails() {
  dataUrlCache.clear()
  if (!stage) return
  stage.mesh.geometry = stage.placeholder
  stage.placeholder.dispose()
  stage.material.dispose()
  stage.renderer.dispose()
  stage.renderer.forceContextLoss()
  stage = null
}
