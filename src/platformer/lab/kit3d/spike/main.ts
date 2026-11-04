/**
 * Hackable 3D spike, dev page (docs/qa/hackable-3d/SPIKE.md): `/dev/hackable-3d-spike.html` on the Vite dev server only
 * (the production build's only entry is index.html).
 *
 * Two browsers in one page, joined the way a Hackable room joins them: Maya (you: arrows or WASD, Space, X to run, drag
 * to turn the camera) and Sam (a bot). Each has its own game on its own HackableTimeline (rooms/timeline.ts). Your
 * events reach your game at once and Sam's 4 ticks late (about 130 ms); Sam's game gets them the other way round. So
 * both games rewind and replay, and the HUD checks that they agree on a tick both have heard everything about.
 *
 * three.js only draws. The bricks use the classic builder's own geometry (src/brick/geometry.ts, read only).
 */
import * as THREE from 'three'
import { createBrickGeometry } from '../../../../brick/geometry'
import { BRICK_PART_MAP, brickWorldPosition } from '../../../../../packages/brick-core/src/parts'
import { worldFingerprint } from '../../core/snapshot'
import type { Runtime } from '../../core/runtime'
import { HackableTimeline } from '../../rooms/timeline'
import type { LevelDesign3, Target3, World3 } from '../contracts3d'
import { addPlayer3d, heroSpawn, HERO3D, lookPlayer3d } from '../engine3d'
import { createRuntime3d } from '../run3d'
import { sampleDesign3d } from '../sample3d'

type Ev = { kind: 'down' | 'up'; key: string } | { kind: 'look'; yaw: number } | { kind: 'join'; name: string }

const params = new URLSearchParams(location.search)
const BRICKS = Number(params.get('bricks') ?? 2000)
const LAG = Number(params.get('lag') ?? 4)

// ------------------------------------------------------------------------------------------------ two games

function apply(runtime: Runtime, ev: Ev, by: number): void {
  if (ev.kind === 'down') runtime.pressKey(ev.key, by)
  else if (ev.kind === 'up') runtime.releaseKey(ev.key, by)
  else if (ev.kind === 'look') lookPlayer3d(runtime, by, ev.yaw)
  else if (ev.kind === 'join') addPlayer3d(runtime, { num: by, name: ev.name }, heroSpawn(design))
}

const design: LevelDesign3 = sampleDesign3d({ bricks: BRICKS })
function game(): HackableTimeline<Ev> {
  const runtime = createRuntime3d(design)
  runtime.greenFlag()
  return new HackableTimeline<Ev>(runtime, apply, { history: 300, snapshotEvery: 4 })
}
const mine = game()
const sams = game()

let seq = 0
let cid = 0
/** The room: stamps an event, applies it at once in its author's game, and delivers it LAG ticks later to the other. */
const inFlight: { at: number; to: HackableTimeline<Ev>; rec: Parameters<HackableTimeline<Ev>['addRemote']>[0] }[] = []
function send(by: number, ev: Ev): void {
  const own = by === 1 ? mine : sams
  const other = by === 1 ? sams : mine
  const tick = own.tick
  const rec = { tick, seq: null as number | null, by, cid: `c${cid++}`, ev }
  own.addLocal(rec)
  const s = seq++
  own.confirm(rec.cid, tick, s)
  inFlight.push({ at: tick + LAG, to: other, rec: { ...rec, seq: s } })
}
send(1, { kind: 'join', name: 'Maya' })
send(2, { kind: 'join', name: 'Sam' })

// Sam: walks onto the Bounce pad, then wanders (a seeded bot, so every reload is the same).
let botSeed = 11
const botRand = () => { botSeed = (Math.imul(botSeed, 1664525) + 1013904223) >>> 0; return botSeed / 2 ** 32 }
const botHeld = new Set<string>()
let botYaw = 0
function bot(tick: number): void {
  const set = (key: string, down: boolean) => {
    if (down === botHeld.has(key)) return
    if (down) botHeld.add(key); else botHeld.delete(key)
    send(2, { kind: down ? 'down' : 'up', key })
  }
  if (tick === 2) { send(2, { kind: 'look', yaw: 0 }); set('up arrow', true) }
  if (tick < 50 || tick % 5) return
  const r = botRand()
  set('up arrow', r < 0.8)
  set('space', botRand() < 0.2)
  set('x', botRand() < 0.3)
  if (botRand() < 0.2) { botYaw = (botYaw + Math.floor(botRand() * 91) - 45 + 360) % 360; send(2, { kind: 'look', yaw: botYaw }) }
}

// ------------------------------------------------------------------------------------------------ input

const KEY: Record<string, string> = {
  ArrowUp: 'up arrow', ArrowDown: 'down arrow', ArrowLeft: 'left arrow', ArrowRight: 'right arrow',
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: 'space', KeyX: 'x',
}
const held = new Set<string>()
addEventListener('keydown', (e) => {
  const key = KEY[e.code]
  if (!key) return
  e.preventDefault()
  if (held.has(key)) return
  held.add(key)
  send(1, { kind: 'down', key })
})
addEventListener('keyup', (e) => {
  const key = KEY[e.code]
  if (!key || !held.has(key)) return
  held.delete(key)
  send(1, { kind: 'up', key })
})

/** Camera yaw in degrees (0 looks along −z). Sent as whole degrees when it changes, at most once a tick. */
let camYaw = 0
let camPitch = 22
let sentYaw = 0
let dragging = false
addEventListener('pointerdown', () => { dragging = true })
addEventListener('pointerup', () => { dragging = false })
addEventListener('pointermove', (e) => {
  if (!dragging) return
  camYaw = (camYaw - e.movementX * 0.4 + 360) % 360
  camPitch = Math.max(5, Math.min(70, camPitch + e.movementY * 0.25))
})

// ------------------------------------------------------------------------------------------------ drawing

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#bfe3ff')
scene.add(new THREE.HemisphereLight('#ffffff', '#6b8f5a', 1.6))
const sun = new THREE.DirectionalLight('#ffffff', 2.2)
sun.position.set(12, 24, 8)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24 })
scene.add(sun)
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200)

const plate = new THREE.Mesh(new THREE.BoxGeometry(64 * 0.62, 0.2, 64 * 0.62), new THREE.MeshStandardMaterial({ color: '#65b85a' }))
plate.position.y = -0.1
plate.receiveShadow = true
scene.add(plate)

/** The build: one InstancedMesh per classic part, the classic geometry, each brick its own colour. */
function drawScenery(): void {
  const byPart = new Map<string, typeof design.scenery3d>()
  for (const b of design.scenery3d) byPart.set(b.partId, [...(byPart.get(b.partId) ?? []), b])
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)
  for (const [partId, bricks] of byPart) {
    const mesh = new THREE.InstancedMesh(createBrickGeometry(BRICK_PART_MAP[partId]), new THREE.MeshStandardMaterial({ roughness: 0.55 }), bricks.length)
    bricks.forEach((b, i) => {
      const [x, y, z] = brickWorldPosition(b)
      q.setFromAxisAngle(up, (b.rotation * Math.PI) / 2)
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, one))
      mesh.setColorAt(i, new THREE.Color(b.color))
    })
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }
}
drawScenery()

const HERO_COLORS: Record<number, string> = { 1: '#3e83d7', 2: '#d765ae' }
const meshes = new Map<string, THREE.Object3D>()
function meshFor(t: Target3, world: World3): THREE.Object3D {
  let mesh = meshes.get(t.id)
  if (mesh) return mesh
  const look = (world.bricks[t.brickId] as { shape3d?: { look?: { model?: string; color: string } } }).shape3d?.look
  if (t.brickId === HERO3D) {
    const group = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.36, 6, 12), new THREE.MeshStandardMaterial({ color: HERO_COLORS[t.player ?? 1] ?? '#3e83d7' }))
    body.position.y = 0.36
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: '#f5eee0' }))
    nose.position.set(0, 0.55, 0.18)
    group.add(body, nose)
    mesh = group
  } else if (look?.model === 'coin') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 20), new THREE.MeshStandardMaterial({ color: look.color, metalness: 0.4, roughness: 0.3 }))
    mesh.rotation.x = Math.PI / 2
    const g = new THREE.Group(); g.add(mesh); mesh = g
  } else {
    const b = t.body3!
    mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshStandardMaterial({ color: look?.color ?? '#e7473c' }))
    mesh.position.y = b.h / 2
    const g = new THREE.Group(); g.add(mesh); mesh = g
  }
  mesh.traverse((o) => { o.castShadow = true })
  scene.add(mesh)
  meshes.set(t.id, mesh)
  return mesh
}

function drawWorld(world: World3): void {
  const live = new Set<string>()
  for (const t of world.targets) {
    if (!t.body3 || typeof t.z !== 'number') continue
    live.add(t.id)
    const mesh = meshFor(t, world)
    mesh.visible = t.visible
    mesh.position.set(t.x, t.y, t.z)
    // Facing is degrees from −z for the character; coins spin with their Scratch direction.
    if (t.body3.character) mesh.rotation.y = ((t.body3.character.facing) * Math.PI) / 180
    else mesh.rotation.y = (-t.direction * Math.PI) / 180
  }
  for (const [id, mesh] of meshes) if (!live.has(id)) { scene.remove(mesh); meshes.delete(id) }
}

// ------------------------------------------------------------------------------------------------ loop

const hud = document.getElementById('hud')!
let acc = 0
let last = performance.now()
let stepMs = 0
let agree = '…'
const camAt = new THREE.Vector3()
function frame(now: number): void {
  acc += Math.min(250, now - last)
  last = now
  while (acc >= 1000 / 30) {
    acc -= 1000 / 30
    const tick = mine.tick
    const yaw = Math.round(camYaw) % 360
    if (yaw !== sentYaw) { sentYaw = yaw; send(1, { kind: 'look', yaw }) }
    bot(tick)
    for (let i = inFlight.length - 1; i >= 0; i--) {
      if (inFlight[i].at > tick) continue
      inFlight[i].to.addRemote(inFlight[i].rec)
      inFlight.splice(i, 1)
    }
    const t0 = performance.now()
    mine.advanceTo(tick + 1)
    sams.advanceTo(tick + 1)
    stepMs = performance.now() - t0
    // A tick everyone has heard all about (LAG + a little), kept by both: do the two games agree on it?
    const check = Math.floor((tick - LAG - 8) / 4) * 4
    if (check > 0 && tick % 15 === 0) {
      const a = mine.snapshotAt(check)
      const b = sams.snapshotAt(check)
      if (a && b) agree = worldFingerprint(a) === worldFingerprint(b) ? `agree at tick ${check} ✓` : `DIFFER at tick ${check} ✗`
    }
  }
  const world = mine.runtime.world as World3
  drawWorld(world)
  const me = world.targets.find((t) => t.player === 1 && !t.isClone)
  if (me) camAt.lerp(new THREE.Vector3(me.x, me.y + 0.5, me.z), 0.2)
  const dist = 4.2
  const yawR = (camYaw * Math.PI) / 180
  const pitchR = (camPitch * Math.PI) / 180
  camera.position.set(camAt.x + Math.sin(yawR) * Math.cos(pitchR) * dist, camAt.y + Math.sin(pitchR) * dist, camAt.z + Math.cos(yawR) * Math.cos(pitchR) * dist)
  camera.lookAt(camAt)
  const v = world.stage.variables
  hud.textContent = [
    `${design.scenery3d.length} bricks · tick ${world.tick} · this frame's ticks ${stepMs.toFixed(2)} ms (both games)`,
    `coins ${v.g_coins} · bounces ${v.g_bounces} · landings ${v.g_landings}`,
    `rewinds: mine ${mine.rewinds} (${mine.replayedTicks} ticks replayed), Sam's ${sams.rewinds}`,
    `Sam's game and mine ${agree}`,
  ].join('\n')
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()
requestAnimationFrame(frame)
Object.assign(window as unknown as Record<string, unknown>, { spike3d: { mine, sams, design } })
