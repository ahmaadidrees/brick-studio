/**
 * Hackable 3D's drawing (docs/qa/hackable-3d/D1.md). three.js ONLY DRAWS: it reads the design (Build) or the running
 * world (Code, Play) and never changes either. Nothing here is part of the game, so nothing here needs to be the same
 * on every browser.
 *
 * - Build bricks are drawn with the classic builder's own part geometry (src/brick/geometry.ts), one InstancedMesh per
 *   part with a colour per instance, rebuilt only when the build (its array) changes.
 * - Code bricks and Heroes are simple models (a coin, a pad, a flag…) in their brick's colour and box size, turned by
 *   their direction, and moved smoothly between ticks (interpolated).
 * - Picking (what is under the pointer) uses three's raycaster against the same meshes.
 */
import * as THREE from 'three'
import { createBrickGeometry } from '../../../../brick/geometry'
import type { BrickPart } from '../../../../../packages/brick-core/src/types'
import { PLATE, STUD, type Model3, type SceneryBrick, type Shape3 } from '../../kit3d/contracts3d'
import { footprint, type PartMap } from '../../kit3d/parts3d'

/** One thing to draw: a placed copy (Build) or a live target (Code, Play). World units. */
export interface Draw3 {
  id: string
  /** The copy it is, for selecting in Build. */
  copyId?: string
  brickId: string
  x: number
  y: number
  z: number
  /** Scratch direction: 90 is the brick as placed. */
  direction: number
  /** A character's facing, degrees, 0 = towards −z. */
  facing?: number
  visible: boolean
  w: number
  h: number
  d: number
  color: string
  model: Model3
  /** A player's Hero in a room (tints it). */
  player?: number
  bubble?: string
  /** Standing on something (the Hero's drawn height eases over steps only then). */
  grounded?: boolean
}

export interface Hit3 {
  kind: 'plate' | 'scenery' | 'target'
  point: THREE.Vector3
  /** The face's outward normal, in world space. */
  normal: THREE.Vector3
  /** Which build brick (index into the build), for `scenery`. */
  index?: number
  /** Which copy or target, for `target`. */
  id?: string
}

const SKY = '#cfe8ff'
const PLATE_GREEN = '#6cc062'
const PLAYER_TINTS: Record<number, string> = { 1: '#3e83d7', 2: '#d765ae', 3: '#ef8d32', 4: '#2eaa9d' }

function partGeometry(part: BrickPart, stock: boolean): THREE.BufferGeometry {
  return createBrickGeometry(part, { cache: stock })
}

/** A simple model for a code brick, `w × h × d`, standing on y = 0, facing +x as placed. */
function makeModel(model: Model3, w: number, h: number, d: number, color: string): THREE.Object3D {
  const mat = (c: string, rough = 0.55) => new THREE.MeshStandardMaterial({ color: c, roughness: rough })
  const group = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.castShadow = false
    group.add(mesh)
    return mesh
  }
  switch (model) {
    case 'hero': {
      add(new THREE.CapsuleGeometry(w / 2, h - w, 6, 12), mat(color), 0, h / 2)
      add(new THREE.SphereGeometry(w * 0.42, 16, 12), mat('#ffd9a8'), 0, h - w * 0.15)
      // A nose, so you can see which way the Hero faces.
      add(new THREE.BoxGeometry(0.1, 0.07, 0.12), mat('#16213e'), 0, h - w * 0.2, w * 0.45)
      break
    }
    case 'coin': {
      const disc = add(new THREE.CylinderGeometry(w / 2, w / 2, w * 0.18, 24), mat(color, 0.25), 0, h / 2)
      disc.rotation.x = Math.PI / 2
      ;(disc.material as THREE.MeshStandardMaterial).metalness = 0.4
      ;(disc.material as THREE.MeshStandardMaterial).emissive = new THREE.Color('#5c4300')
      break
    }
    case 'pad': {
      add(new THREE.BoxGeometry(w, h * 0.6, d), mat('#52636c'), 0, h * 0.3)
      add(new THREE.BoxGeometry(w * 0.86, h * 0.5, d * 0.86), mat(color, 0.4), 0, h * 0.85)
      break
    }
    case 'button': {
      add(new THREE.BoxGeometry(w, h * 0.5, d), mat('#52636c'), 0, h * 0.25)
      add(new THREE.CylinderGeometry(Math.min(w, d) * 0.36, Math.min(w, d) * 0.4, h * 0.7, 20), mat(color, 0.35), 0, h * 0.75)
      break
    }
    case 'flag': {
      add(new THREE.CylinderGeometry(0.04, 0.04, h, 8), mat('#52636c'), 0, h / 2)
      const cloth = add(new THREE.BoxGeometry(w * 0.9, h * 0.28, 0.03), mat('#e0503a'), w * 0.45, h * 0.84)
      cloth.castShadow = false
      add(new THREE.CylinderGeometry(w * 0.45, w * 0.5, 0.06, 16), mat(color), 0, 0.03)
      break
    }
    case 'bar': {
      add(new THREE.BoxGeometry(w, h, d), mat(color, 0.45), 0, h / 2)
      add(new THREE.CylinderGeometry(d * 0.6, d * 0.6, h * 1.4, 16), mat('#16213e'), 0, h * 0.7)
      break
    }
    default:
      add(new THREE.BoxGeometry(w, h, d), mat(color), 0, h / 2)
  }
  return group
}

/** The build plate: green, with a line every two studs. */
function makePlate(size: number): THREE.Group {
  const half = (size / 2) * STUD
  const group = new THREE.Group()
  const slab = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.3, half * 2), new THREE.MeshStandardMaterial({ color: PLATE_GREEN, roughness: 0.9 }))
  slab.position.y = -0.15
  slab.receiveShadow = true
  slab.name = 'plate'
  group.add(slab)
  const pts: number[] = []
  for (let i = 0; i <= size; i += 2) {
    const v = -half + i * STUD
    pts.push(v, 0.002, -half, v, 0.002, half, -half, 0.002, v, half, 0.002, v)
  }
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: '#5dae54' }))
  grid.raycast = () => undefined
  group.add(grid)
  return group
}

interface SceneryGroup { mesh: THREE.InstancedMesh; indexes: number[] }

export class World3View {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400)
  private plate: THREE.Group | null = null
  private plateSize = 0
  private sceneryRoot = new THREE.Group()
  private sceneryGroups: SceneryGroup[] = []
  private sceneryOf: SceneryBrick[] | null = null
  private partsOf: PartMap | null = null
  private targetRoot = new THREE.Group()
  private models = new Map<string, { obj: THREE.Object3D; key: string }>()
  private ghost: THREE.Mesh
  private selection: THREE.Box3Helper
  private shadow: THREE.Mesh
  private raycaster = new THREE.Raycaster()
  private size = { width: 1, height: 1 }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene.background = new THREE.Color(SKY)
    this.scene.fog = new THREE.Fog(SKY, 60, 160)
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6b8f5e', 1.6))
    const sun = new THREE.DirectionalLight('#ffffff', 1.6)
    sun.position.set(12, 30, 18)
    this.scene.add(sun)
    this.scene.add(this.sceneryRoot, this.targetRoot)
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#2f5bea', transparent: true, opacity: 0.35, depthWrite: false }))
    this.ghost.visible = false
    this.ghost.raycast = () => undefined
    this.scene.add(this.ghost)
    this.selection = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#2f5bea'))
    this.selection.visible = false
    this.selection.raycast = () => undefined
    this.scene.add(this.selection)
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: '#16213e', transparent: true, opacity: 0.25, depthWrite: false }))
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.visible = false
    this.shadow.raycast = () => undefined
    this.scene.add(this.shadow)
  }

  resize(width: number, height: number): void {
    this.size = { width: Math.max(1, width), height: Math.max(1, height) }
    this.renderer.setSize(this.size.width, this.size.height, false)
    this.camera.aspect = this.size.width / this.size.height
    this.camera.updateProjectionMatrix()
  }

  setPlate(size: number): void {
    if (size === this.plateSize) return
    if (this.plate) this.scene.remove(this.plate)
    this.plate = makePlate(size)
    this.plateSize = size
    this.scene.add(this.plate)
  }

  /** Draw the build. Only rebuilt when the build itself (the array) or its parts change. */
  setScenery(scenery: SceneryBrick[], parts: PartMap, plate: number, stock: PartMap): void {
    this.setPlate(plate)
    if (scenery === this.sceneryOf && parts === this.partsOf) return
    this.sceneryOf = scenery
    this.partsOf = parts
    for (const g of this.sceneryGroups) {
      this.sceneryRoot.remove(g.mesh)
      g.mesh.dispose()
    }
    this.sceneryGroups = []
    const byPart = new Map<string, number[]>()
    scenery.forEach((b, i) => {
      if (!parts[b.partId]) return
      const list = byPart.get(b.partId)
      if (list) list.push(i)
      else byPart.set(b.partId, [i])
    })
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const one = new THREE.Vector3(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    const color = new THREE.Color()
    for (const [partId, indexes] of byPart) {
      const part = parts[partId]
      const mesh = new THREE.InstancedMesh(partGeometry(part, stock[partId] === part), new THREE.MeshStandardMaterial({ roughness: 0.55 }), indexes.length)
      indexes.forEach((index, i) => {
        const b = scenery[index]
        const f = footprint(part, b.rotation)
        q.setFromAxisAngle(up, (b.rotation * Math.PI) / 2)
        m.compose(new THREE.Vector3((b.x + f.w / 2 - plate / 2) * STUD, b.y * PLATE, (b.z + f.d / 2 - plate / 2) * STUD), q, one)
        mesh.setMatrixAt(i, m)
        mesh.setColorAt(i, color.set(b.color))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      this.sceneryRoot.add(mesh)
      this.sceneryGroups.push({ mesh, indexes })
    }
  }

  /** Draw the code bricks and Heroes (copies in Build, targets while running). */
  drawTargets(list: readonly Draw3[], heroId: string | null): void {
    const seen = new Set<string>()
    for (const t of list) {
      seen.add(t.id)
      const tint = t.model === 'hero' && t.player !== undefined ? PLAYER_TINTS[t.player] ?? t.color : t.color
      const key = `${t.model}|${t.w}|${t.h}|${t.d}|${tint}`
      let entry = this.models.get(t.id)
      if (!entry || entry.key !== key) {
        if (entry) this.targetRoot.remove(entry.obj)
        entry = { obj: makeModel(t.model, t.w, t.h, t.d, tint), key }
        entry.obj.userData.id = t.id
        entry.obj.traverse((o) => { o.userData.id = t.id })
        this.targetRoot.add(entry.obj)
        this.models.set(t.id, entry)
      }
      const o = entry.obj
      o.visible = t.visible
      o.position.set(t.x, t.y, t.z)
      // A character faces where it walks (facing φ looks along (sin φ, cos φ) in x, z: the model's nose is +z). A brick
      // turns by its direction: 90 is as placed, and turning right turns it clockwise seen from above.
      o.rotation.y = t.model === 'hero' ? ((t.facing ?? 180) * Math.PI) / 180 : ((90 - t.direction) * Math.PI) / 180
    }
    for (const [id, entry] of this.models) {
      if (seen.has(id)) continue
      this.targetRoot.remove(entry.obj)
      this.models.delete(id)
    }
    // The Hero's round shadow on whatever is below it: you can see where a jump will land.
    const hero = heroId ? list.find((t) => t.id === heroId && t.visible) : undefined
    if (hero) {
      this.raycaster.set(new THREE.Vector3(hero.x, hero.y + 0.05, hero.z), new THREE.Vector3(0, -1, 0))
      const hits = this.raycaster.intersectObjects([this.sceneryRoot, ...(this.plate ? [this.plate] : [])], true)
      const ground = hits[0]?.point.y
      this.shadow.visible = ground !== undefined
      if (ground !== undefined) this.shadow.position.set(hero.x, ground + 0.01, hero.z)
    } else this.shadow.visible = false
  }

  /** The see-through box where a brick will go (`ok` false: it can't go there). */
  setGhost(box: { x: number; y: number; z: number; w: number; h: number; d: number } | null, ok = true): void {
    if (!box) { this.ghost.visible = false; return }
    this.ghost.visible = true
    this.ghost.scale.set(box.w, box.h, box.d)
    this.ghost.position.set(box.x, box.y + box.h / 2, box.z)
    ;(this.ghost.material as THREE.MeshBasicMaterial).color.set(ok ? '#2f5bea' : '#e0503a')
  }

  /** Outline a drawn thing (the selected copy), or nothing. */
  setSelected(id: string | null): void {
    const entry = id ? this.models.get(id) : undefined
    if (!entry) { this.selection.visible = false; return }
    this.selection.box.setFromObject(entry.obj)
    this.selection.box.expandByScalar(0.04)
    this.selection.visible = true
  }

  /** What is under a point of the canvas (CSS pixels from its top left). */
  pick(px: number, py: number, what: { targets: boolean; scenery: boolean } = { targets: true, scenery: true }): Hit3 | null {
    const ndc = new THREE.Vector2((px / this.size.width) * 2 - 1, -(py / this.size.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const objects: THREE.Object3D[] = []
    if (what.targets) objects.push(this.targetRoot)
    if (what.scenery) objects.push(this.sceneryRoot)
    if (this.plate) objects.push(this.plate)
    const hit = this.raycaster.intersectObjects(objects, true).find((h) => h.object.visible && (h.object.parent?.visible ?? true))
    if (!hit) return null
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0)
    if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      const group = this.sceneryGroups.find((g) => g.mesh === hit.object)
      if (group) {
        // An instanced face normal is in the part's frame: turn it by the instance's own turn.
        const m = new THREE.Matrix4()
        group.mesh.getMatrixAt(hit.instanceId, m)
        const n = hit.face ? hit.face.normal.clone().transformDirection(m) : new THREE.Vector3(0, 1, 0)
        return { kind: 'scenery', point: hit.point, normal: n, index: group.indexes[hit.instanceId] }
      }
    }
    const id = hit.object.userData.id as string | undefined
    if (id) return { kind: 'target', point: hit.point, normal, id }
    return { kind: 'plate', point: hit.point, normal }
  }

  /** Where a world point is on the canvas (CSS pixels), or null behind the camera. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera)
    if (v.z > 1) return null
    return { x: ((v.x + 1) / 2) * this.size.width, y: ((1 - v.y) / 2) * this.size.height }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    for (const g of this.sceneryGroups) g.mesh.dispose()
    this.renderer.dispose()
  }
}

/** An orbit camera: yaw (degrees, 0 looks along −z), pitch (degrees down), distance, around a point. */
export interface Orbit { yaw: number; pitch: number; dist: number; tx: number; ty: number; tz: number }

export function placeCamera(camera: THREE.PerspectiveCamera, o: Orbit): void {
  const yaw = (o.yaw * Math.PI) / 180
  const pitch = (o.pitch * Math.PI) / 180
  const h = Math.cos(pitch) * o.dist
  camera.position.set(o.tx + Math.sin(yaw) * h, o.ty + Math.sin(pitch) * o.dist, o.tz + Math.cos(yaw) * h)
  camera.lookAt(o.tx, o.ty, o.tz)
}

/** A code brick's drawing size and model from its shape. */
export function lookOf(shape: Shape3 | undefined, fallback: { w: number; h: number; d: number }): { w: number; h: number; d: number; color: string; model: Model3 } {
  return { w: shape?.w ?? fallback.w, h: shape?.h ?? fallback.h, d: shape?.d ?? fallback.d, color: shape?.look?.color ?? '#a9b7bd', model: shape?.look?.model ?? 'box' }
}
