import * as THREE from 'three'
import { createBrickGeometry } from '../../brick/geometry'
import { BRICK_PART_MAP, PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { roboticsSpec } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { KITS, kitById, type KitId } from './kits'

/**
 * Kit pictures: each kit's own bricks drawn with the studio's own part geometry (the shapes
 * the ghost and the placed kit have), from the side that shows what the kit does: the Buggy's
 * big wheels and eyes, the Gate's door swung open, the Signal light lit up. Rendered once into
 * PNG data URLs on a small offscreen WebGL canvas that is released straight after. Without
 * WebGL (tests, a lost context) the card draws its illustration instead.
 */
export const KIT_PICTURE_PIXELS = { width: 264, height: 176 }

export type KitPictureStyle = {
  /** The direction the camera looks along, toward the kit (a kit's front faces -Z). */
  view: [number, number, number]
  /**
   * A hinge's arm drawn turned by `degrees` about the hinge's vertical axis, with a curved arrow
   * over it sweeping `arrow` degrees the way it opens (positive turns +X toward -Z).
   */
  swing?: { hingeId: string; armIds: string[]; degrees: number; arrow?: number; arrowY?: number; arrowColor?: string; arrowRadius?: number }
  /** Parts drawn lit up, with a glow around them. */
  glowing?: string[]
}

export const KIT_PICTURE_STYLES: Record<KitId, KitPictureStyle> = {
  buggy: { view: [-0.55, -0.42, 1] },
  // The door a little open inside the red frame, and an arrow over the frame the way it swings.
  gate: { view: [-0.55, -0.75, 1], swing: { hingeId: 'kit:gate:gate-hinge', armIds: ['kit:gate:gate-door'], degrees: 35, arrow: 65, arrowY: 17, arrowRadius: 1.7 } },
  'signal-light': { view: [0.6, -0.6, 1], glowing: ['kit:signal-light:signal-light'] },
  'robot-base': { view: [-0.72, -0.72, 1] },
}

const pictures = new Map<KitId, string | null>()

const INK = '#263c51'
const LIT_LIGHT = '#ff3b30'

export function cachedKitPicture(kitId: KitId): string | null | undefined {
  return pictures.get(kitId)
}

function partOf(brick: BrickInstance) {
  return roboticsSpec(brick.partId)?.part ?? BRICK_PART_MAP[brick.partId]
}

/** Footprint centre at the bottom face, in the kit's own frame (the scene's rule, with the kit's corner at the origin). */
function brickOrigin(brick: BrickInstance): THREE.Vector3 {
  const size = rotatedSize(partOf(brick)!, brick.rotation)
  return new THREE.Vector3((brick.x + size.width / 2) * STUD, brick.y * PLATE_HEIGHT, (brick.z + size.depth / 2) * STUD)
}

/** The kit as meshes, its arm swung and its lights lit; everything disposable is returned with it. */
function kitScene(kitId: KitId, style: KitPictureStyle): { group: THREE.Group; disposables: { dispose(): void }[] } {
  const kit = kitById(kitId)
  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []
  const hinge = style.swing ? kit.bricks.find((candidate) => candidate.id === style.swing!.hingeId) : undefined
  let arm: THREE.Group | null = null
  if (hinge && style.swing) {
    arm = new THREE.Group()
    arm.position.copy(brickOrigin(hinge)).setY(0)
    arm.rotation.y = (style.swing.degrees * Math.PI) / 180
    group.add(arm)
  }
  for (const brick of kit.bricks) {
    const part = partOf(brick)
    if (!part) continue
    const glowing = style.glowing?.includes(brick.id) ?? false
    // A light drawn lit up shines red (the Signal light's starter colour), whatever it looks like switched off.
    const color = glowing && roboticsSpec(brick.partId)?.role === 'light' ? LIT_LIGHT : brick.color
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02, ...(glowing ? { emissive: new THREE.Color(color), emissiveIntensity: 1 } : {}) })
    disposables.push(material)
    const mesh = new THREE.Mesh(createBrickGeometry(part), material)
    mesh.position.copy(brickOrigin(brick))
    mesh.rotation.y = (brick.rotation * Math.PI) / 2
    if (arm && style.swing?.armIds.includes(brick.id)) {
      mesh.position.sub(arm.position)
      arm.add(mesh)
    } else group.add(mesh)
    if (roboticsSpec(brick.partId)?.role === 'distance-sensor') {
      // Its eyes, darkened so they read as eyes at thumbnail size (the part is one colour).
      const width = part.width * STUD
      const depth = part.depth * STUD
      for (const side of [-1, 1]) {
        const geometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20).rotateX(Math.PI / 2)
        const pupil = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.4 })
        disposables.push(geometry, pupil)
        const eye = new THREE.Mesh(geometry, pupil)
        eye.position.set(side * width * 0.25, part.height * PLATE_HEIGHT / 2, -depth / 2 - 0.05)
        mesh.add(eye)
      }
    }
    if (glowing) {
      // A soft halo in two shells: it reads as "on" at thumbnail size.
      const center = brickOrigin(brick).add(new THREE.Vector3(0, part.height * PLATE_HEIGHT * 0.62, 0))
      for (const [radius, opacity] of [[0.5, 0.34], [0.8, 0.16]] as const) {
        const geometry = new THREE.SphereGeometry(radius, 24, 16)
        const halo = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
        disposables.push(geometry, halo)
        const shell = new THREE.Mesh(geometry, halo)
        shell.position.copy(center)
        shell.renderOrder = 2
        group.add(shell)
      }
    }
  }
  if (arm && hinge && style.swing?.arrow) {
    // The way the arm swings: a curved arrow around the hinge's axis, just over the arm.
    const armTop = Math.max(...kit.bricks.filter((candidate) => style.swing!.armIds.includes(candidate.id)).map((candidate) => (candidate.y + partOf(candidate)!.height) * PLATE_HEIGHT))
    const sweep = (Math.abs(style.swing.arrow) * Math.PI) / 180
    const radius = style.swing.arrowRadius ?? 1.45
    const material = new THREE.MeshStandardMaterial({ color: style.swing.arrowColor ?? INK, roughness: 0.5 })
    const arc = new THREE.TorusGeometry(radius, 0.09, 10, 40, sweep).rotateX(-Math.PI / 2)
    const head = new THREE.ConeGeometry(0.24, 0.5, 16)
    disposables.push(material, arc, head)
    const arrow = new THREE.Group()
    arrow.position.set(arm.position.x, style.swing.arrowY !== undefined ? style.swing.arrowY * PLATE_HEIGHT : armTop + 0.12, arm.position.z)
    // The arc starts where the arm is drawn and sweeps on the way it opens.
    arrow.rotation.y = (style.swing.degrees * Math.PI) / 180 - (style.swing.arrow < 0 ? sweep : 0)
    arrow.add(new THREE.Mesh(arc, material))
    const end = style.swing.arrow < 0 ? 0 : sweep
    const tip = new THREE.Mesh(head, material)
    tip.position.set(radius * Math.cos(end), 0, -radius * Math.sin(end))
    const tangent = new THREE.Vector3(-Math.sin(end), 0, -Math.cos(end)).multiplyScalar(style.swing.arrow < 0 ? -1 : 1)
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent)
    arrow.add(tip)
    group.add(arrow)
  }
  return { group, disposables }
}

/**
 * The tightest orthographic box around the kit (and its glow) as the camera sees it, plus a
 * margin: every vertex projected on the camera's right and up axes (a box around the bounding
 * box would leave the kit small).
 */
function framing(group: THREE.Object3D, view: THREE.Vector3, aspect: number) {
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), view).normalize()
  const up = new THREE.Vector3().crossVectors(view, right).normalize()
  let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity
  const point = new THREE.Vector3()
  group.updateMatrixWorld(true)
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const positions = object.geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld)
      const r = point.dot(right)
      const u = point.dot(up)
      minR = Math.min(minR, r); maxR = Math.max(maxR, r); minU = Math.min(minU, u); maxU = Math.max(maxU, u)
    }
  })
  const padding = 1.1
  const halfHeight = Math.max((maxU - minU) / 2, (maxR - minR) / 2 / aspect) * padding
  const center = right.clone().multiplyScalar((minR + maxR) / 2).add(up.clone().multiplyScalar((minU + maxU) / 2))
  return { halfWidth: halfHeight * aspect, halfHeight, center }
}

type Stage = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera }

function createStage(): Stage | null {
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = KIT_PICTURE_PIXELS.width
  canvas.height = KIT_PICTURE_PIXELS.height
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true })
  if (!context) return null
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true })
  renderer.setSize(KIT_PICTURE_PIXELS.width, KIT_PICTURE_PIXELS.height, false)
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.45))
  const key = new THREE.DirectionalLight(0xffffff, 2.3)
  key.position.set(5, 9, -5)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xd9e6f4, 1.1)
  fill.position.set(-6, 3, 5)
  scene.add(fill)
  return { renderer, scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200) }
}

function drawKit(stage: Stage, kitId: KitId, style: KitPictureStyle): string {
  const { group, disposables } = kitScene(kitId, style)
  try {
    stage.scene.add(group)
    const view = new THREE.Vector3(...style.view).normalize()
    const frame = framing(group, view, KIT_PICTURE_PIXELS.width / KIT_PICTURE_PIXELS.height)
    const { camera } = stage
    camera.left = -frame.halfWidth
    camera.right = frame.halfWidth
    camera.top = frame.halfHeight
    camera.bottom = -frame.halfHeight
    camera.updateProjectionMatrix()
    // Along the view axis the camera only needs to stand clear of the kit.
    camera.position.copy(frame.center).addScaledVector(view, -60)
    camera.up.set(0, 1, 0)
    camera.lookAt(frame.center)
    stage.renderer.render(stage.scene, camera)
    return stage.renderer.domElement.toDataURL('image/png')
  } finally {
    stage.scene.remove(group)
    for (const item of disposables) item.dispose()
  }
}

function withStage<T>(work: (stage: Stage | null) => T): T {
  installRoboticsParts()
  let stage: Stage | null = null
  try {
    stage = createStage()
  } catch {
    stage = null
  }
  try {
    return work(stage)
  } finally {
    // Part geometry is owned by geometry.ts's cache; only the renderer and its context go.
    stage?.renderer.dispose()
    stage?.renderer.forceContextLoss()
  }
}

/**
 * Draws every kit once and caches the pictures (null for a kit that could not be drawn). The
 * canvas and its WebGL context are released before this returns.
 */
export function renderKitPictures(): void {
  if (KITS.every((kit) => pictures.has(kit.id))) return
  withStage((stage) => {
    for (const kit of KITS) {
      if (pictures.has(kit.id)) continue
      let url: string | null = null
      try {
        url = stage ? drawKit(stage, kit.id, KIT_PICTURE_STYLES[kit.id]) : null
      } catch {
        url = null
      }
      pictures.set(kit.id, url)
    }
  })
}

/** One kit drawn in a given style, uncached: for choosing the styles above by eye. */
export function drawKitPicture(kitId: KitId, style: KitPictureStyle): string | null {
  return withStage((stage) => (stage ? drawKit(stage, kitId, style) : null))
}

/** For tests. */
export function clearKitPicturesForTests() {
  pictures.clear()
}
