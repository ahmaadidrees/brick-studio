import { Edges, Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { getBuildPlateSize } from '../../brick/buildPlate'
import { createBrickGeometry } from '../../brick/geometry'
import { BRICK_PART_MAP, PLATE_HEIGHT, STUD, brickWorldPosition, rotatedSize } from '../../brick/parts'
import { selectionDraftIsValid, selectionDrafts, useBrickStore } from '../../brick/store'
import type { BrickDraft, BrickInstance } from '../../brick/types'
import { draftSnapState, subscribeDraftSnap } from '../scene/draftSnap'
import { reportFarPlacement, reportPlaced, useBasicsStore } from './basicsState'
import { isFarSpot, setFarHover, stationaryBricks } from './sceneSupport'
import { REFUSAL_TEXT, blockersOf, refusalText, restingFall, restingOnText, type PlacedLike } from './support'
import './basics.css'

/**
 * Kid basics in the build scene (Robot Workshop prototype only; mounted by the studio's build scene
 * next to the robotics layer). Nothing here takes a pointer or writes the document.
 *
 * - What is in the way: while the ghost is red, the bricks it would overlap are outlined in red and a
 *   one-line caption above the ghost says why in kid words ("Something is in the way.", "That's off
 *   the plate."); a refused arrow, Raise/Lower or click outlines its blockers for a moment too.
 * - Where it sits: seen from above (the Top view, or any view looking nearly straight down) the
 *   caption says what the ghost rests on ("On the plate", "On the ground", "On the hub"); a part held
 *   in the air (an axle or a wheel off its mount) shows "In the air", a drop line and a shadow.
 * - A new part flashes for about a second where it landed; one that landed out of view or far away
 *   is reported to the overlay, which offers to show it or undo it.
 */
const RED = '#e5383b'
const FLASH = '#ffd23f'
const FLASH_SECONDS = 1.1
const REFUSAL_SECONDS = 2.6
/** Placed bricks further than this times the orbit target's distance are "far away" for the notice. */
const FAR_PLACED_RATIO = 2
/**
 * A big group (a whole robot moved at once) flashes and outlines its first bricks only, and without
 * edge lines past a handful: each outline is a mesh and every edge line a geometry built on mount.
 */
const MAX_SHELLS = 32
const MAX_EDGED_SHELLS = 12
const noRaycast = () => null
/** Dev only (the harness's verdict): the bricks the red ghost is outlining right now. */
let liveBlockerIds: string[] = []

function useDraftState() {
  const draft = useBrickStore((state) => state.draft)
  const bricks = useBrickStore((state) => state.bricks)
  const movingId = useBrickStore((state) => state.movingId)
  const movingSelection = useBrickStore((state) => state.movingSelection)
  const documentMetadata = useBrickStore((state) => state.documentMetadata)
  const brickBudget = useBrickStore((state) => state.brickBudget)
  return { draft, bricks, movingId, movingSelection, documentMetadata, brickBudget }
}

function Shell({ brick, color, opacity, scale = 1.05, plateSize, edges = true, materialRef }: { brick: PlacedLike; color: string; opacity: number; scale?: number; plateSize: number; edges?: boolean; materialRef?: (material: THREE.MeshBasicMaterial | null) => void }) {
  const part = BRICK_PART_MAP[brick.partId]
  const geometry = useMemo(() => (part ? createBrickGeometry(part) : null), [part])
  if (!geometry) return null
  const [x, y, z] = brickWorldPosition(brick, plateSize)
  return (
    <group position={[x, y, z]} rotation={[0, (brick.rotation * Math.PI) / 2, 0]}>
      <mesh geometry={geometry} scale={scale} raycast={noRaycast} renderOrder={6}>
        <meshBasicMaterial ref={materialRef} color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
        {edges && <Edges scale={1} color={color} lineWidth={3} threshold={20} renderOrder={7} toneMapped={false} />}
      </mesh>
    </group>
  )
}

/** The bricks in the way: of the red ghost now, and of the last refused move for a moment. */
function Blockers({ live }: { live: string[] }) {
  const refusal = useBasicsStore((state) => state.refusal)
  const bricks = useBrickStore((state) => state.bricks)
  const plateSize = useBrickStore((state) => getBuildPlateSize(state.documentMetadata))
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    if (!refusal?.ids.length) return
    setRecent(refusal.ids)
    const timer = window.setTimeout(() => setRecent([]), REFUSAL_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [refusal])
  const ids = useMemo(() => [...new Set([...live, ...recent])].slice(0, MAX_SHELLS), [live, recent])
  return (
    <>
      {ids.map((id) => {
        const brick = bricks.find((candidate) => candidate.id === id)
        return brick ? <Shell key={id} brick={brick} color={RED} opacity={0.22} plateSize={plateSize} edges={ids.length <= MAX_EDGED_SHELLS} /> : null
      })}
    </>
  )
}

/** Whether the camera looks nearly straight down (the Top view, or orbited close to it). */
function useLookingDown() {
  const { camera } = useThree()
  const [down, setDown] = useState(false)
  const direction = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    camera.getWorldDirection(direction)
    const next = direction.y < -0.9
    if (next !== down) setDown(next)
  })
  return down
}

function topCentreOf(pieces: readonly PlacedLike[], plateSize: number, lift = 0) {
  let x0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let z0 = Number.POSITIVE_INFINITY
  let z1 = Number.NEGATIVE_INFINITY
  let top = 0
  for (const piece of pieces) {
    const part = BRICK_PART_MAP[piece.partId]
    if (!part) continue
    const size = rotatedSize(part, piece.rotation)
    x0 = Math.min(x0, piece.x)
    x1 = Math.max(x1, piece.x + size.width)
    z0 = Math.min(z0, piece.z)
    z1 = Math.max(z1, piece.z + size.depth)
    top = Math.max(top, piece.y + part.height)
  }
  return new THREE.Vector3(((x0 + x1) / 2 - plateSize / 2) * STUD, top * PLATE_HEIGHT + lift, ((z0 + z1) / 2 - plateSize / 2) * STUD)
}

/** A thin line from the part down to where it would land, and its shadow there. */
function DropLine({ pieces, fall, plateSize }: { pieces: readonly PlacedLike[]; fall: number; plateSize: number }) {
  const anchor = pieces[0]
  const part = BRICK_PART_MAP[anchor.partId]
  if (!part) return null
  const size = rotatedSize(part, anchor.rotation)
  const [x, y, z] = brickWorldPosition(anchor, plateSize)
  const floor = y - fall * PLATE_HEIGHT
  const length = fall * PLATE_HEIGHT
  return (
    <group>
      <mesh position={[x, floor + length / 2, z]} raycast={noRaycast} renderOrder={6}>
        <cylinderGeometry args={[0.025, 0.025, Math.max(0.01, length), 8]} />
        <meshBasicMaterial color="#1f2a33" transparent opacity={0.65} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[x, floor + 0.13, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={5}>
        <planeGeometry args={[size.width * STUD * 0.96, size.depth * STUD * 0.96]} />
        <meshBasicMaterial color="#1f2a33" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

type Caption = { text: string; tone: 'blocked' | 'far' | 'air' | 'rest' }

/** The ghost's one-line caption, its blockers, and (when it would fall) its drop line. */
function GhostFeedback() {
  const { draft, bricks, movingId, movingSelection, documentMetadata, brickBudget } = useDraftState()
  const farHover = useBasicsStore((basics) => basics.farHover)
  const snap = useSyncExternalStore(subscribeDraftSnap, draftSnapState)
  const lookingDown = useLookingDown()
  const plateSize = getBuildPlateSize(documentMetadata)
  const view = useMemo(() => {
    if (!draft) return null
    const state = { draft, bricks, movingId, movingSelection, documentMetadata, brickBudget }
    const pieces: BrickDraft[] = selectionDrafts(state)
    const others: BrickInstance[] = stationaryBricks(state)
    const valid = selectionDraftIsValid(state)
    const blocked = valid ? null : blockersOf(pieces, others, plateSize)
    const fall = restingFall(pieces, others)
    return { pieces, others, valid, blocked, fall }
  }, [draft, bricks, movingId, movingSelection, documentMetadata, brickBudget, plateSize])
  // A robot part's connector already says why (lane S's hint at the socket): no second line.
  const hinted = Boolean(draft && snap.hint?.partId === draft.partId)
  const liveIds = view?.blocked?.ids
  useEffect(() => { liveBlockerIds = liveIds ?? [] }, [liveIds])
  // A pointer that leaves the canvas from a far spot (over the header or the drawer) is not "far" any more.
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const leave = () => setFarHover(false)
    canvas.addEventListener('pointerleave', leave)
    return () => canvas.removeEventListener('pointerleave', leave)
  }, [gl])
  if (!view || !draft) return <Blockers live={[]} />
  let caption: Caption | null = null
  if (farHover) caption = { text: REFUSAL_TEXT.tooFar, tone: 'far' }
  else if (view.blocked && !hinted) caption = { text: refusalText(view.blocked) ?? REFUSAL_TEXT.inTheWay, tone: 'blocked' }
  else if (view.fall > 0) caption = { text: 'In the air', tone: 'air' }
  else if (lookingDown && view.valid) caption = { text: restingOnText(view.pieces, view.others), tone: 'rest' }
  const at = topCentreOf(view.pieces, plateSize, 0.45)
  return (
    <>
      <Blockers live={view.blocked?.ids ?? []} />
      {view.fall > 0 && <DropLine pieces={view.pieces} fall={view.fall} plateSize={plateSize} />}
      {caption && (
        <Html position={at} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`kid-basics-caption is-${caption.tone}`} data-testid="kid-basics-caption" data-tone={caption.tone}>{caption.text}</div>
        </Html>
      )}
    </>
  )
}

/** Each placement flashes what it put down for about a second, and reports it when it landed out of view. */
function PlacedFlash() {
  const flash = useBasicsStore((state) => state.flash)
  const bricks = useBrickStore((state) => state.bricks)
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const plateSize = useBrickStore((state) => getBuildPlateSize(state.documentMetadata))
  const { camera, controls, size } = useThree()
  const materials = useRef(new Map<string, THREE.MeshBasicMaterial>())
  const started = useRef(0)
  const [shown, setShown] = useState<string[]>([])

  // A real placement (the store's placeFeedback nonce), a move included: flash what it put down.
  useEffect(() => useBrickStore.subscribe((state, previous) => {
    if (!state.placeFeedback || state.placeFeedback === previous.placeFeedback) return
    const id = state.placeFeedback.id
    reportPlaced(state.selectedIds.includes(id) ? state.selectedIds : [id])
  }), [])

  useEffect(() => {
    if (!flash) return
    started.current = performance.now()
    setShown(flash.ids.slice(0, MAX_SHELLS))
    const hide = window.setTimeout(() => setShown([]), FLASH_SECONDS * 1000)
    // After any framing the placement asked for has run: is it where the student can see it?
    const check = window.setTimeout(() => {
      const placed = useBrickStore.getState().bricks.filter((brick) => flash.ids.includes(brick.id))
      if (!placed.length) return
      const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target
      const centre = new THREE.Vector3()
      for (const brick of placed) centre.add(new THREE.Vector3(...brickWorldPosition(brick, plateSize)))
      centre.divideScalar(placed.length)
      const depth = camera.position.distanceTo(centre)
      const projected = centre.clone().project(camera)
      const offScreen = projected.z > 1 || Math.abs(projected.x) > 0.96 || Math.abs(projected.y) > 0.96
      const far = target ? depth / Math.max(1e-6, camera.position.distanceTo(target)) > FAR_PLACED_RATIO : false
      reportFarPlacement(offScreen || far ? placed.map((brick) => brick.id) : [])
    }, 420)
    return () => { window.clearTimeout(hide); window.clearTimeout(check) }
  }, [flash, camera, controls, plateSize, size.width, size.height])

  useFrame(() => {
    if (!shown.length) return
    const progress = Math.min(1, (performance.now() - started.current) / (FLASH_SECONDS * 1000))
    // Two soft pulses that fade out; held steady when the student asked for less motion.
    const level = reducedMotion ? 0.45 : (1 - progress) * (0.35 + 0.3 * Math.abs(Math.sin(progress * Math.PI * 2)))
    for (const material of materials.current.values()) material.opacity = level
  })

  return (
    <>
      {shown.map((id) => {
        const brick = bricks.find((candidate) => candidate.id === id)
        return brick ? <Shell key={`${id}:${flash?.nonce}`} brick={brick} color={FLASH} opacity={0.5} scale={1.08} plateSize={plateSize} edges={shown.length <= MAX_EDGED_SHELLS} materialRef={(material) => { if (material) materials.current.set(id, material); else materials.current.delete(id) }} /> : null
      })}
    </>
  )
}

export default function BasicsLayer() {
  const mode = useBrickStore((state) => state.mode)
  if (mode !== 'build') return null
  return (
    <>
      <GhostFeedback />
      <PlacedFlash />
      <DevHook />
    </>
  )
}

/**
 * Dev only: lets the QA harness read what the student is shown and measure the view (never used to
 * decide anything): `basics()` (captions, flash, notices), `camera()` (distance to the orbit target)
 * and `pick(x, y)` (what a pointer at that page point hits, and whether the far-drop rule calls it far).
 */
function DevHook() {
  const { camera, controls, gl, scene } = useThree()
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as { __robotics?: Record<string, unknown> }
    const hook = (host.__robotics = host.__robotics ?? {})
    hook.basics = () => {
      const caption = document.querySelector<HTMLElement>('[data-testid=kid-basics-caption]')
      return { ...useBasicsStore.getState(), caption: caption ? { text: caption.textContent, tone: caption.dataset.tone } : null, blockers: [...liveBlockerIds] }
    }
    const target = () => (controls as unknown as { target?: THREE.Vector3 } | null)?.target ?? null
    hook.camera = () => {
      const at = target()
      return { distance: at ? camera.position.distanceTo(at) : null, position: camera.position.toArray(), target: at?.toArray() ?? null }
    }
    hook.pick = (x: number, y: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), camera)
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        const data = hit.object.userData
        if (!Array.isArray(data.brickIds) && typeof data.brickId !== 'string' && data.isBaseplate !== true) continue
        const state = useBrickStore.getState()
        const at = target()
        return { point: hit.point.toArray(), onBrick: data.isBaseplate !== true, far: isFarSpot(state, hit.point), depthRatio: at ? camera.position.distanceTo(hit.point) / camera.position.distanceTo(at) : null }
      }
      return null
    }
    return () => { delete hook.basics; delete hook.camera; delete hook.pick }
  }, [camera, controls, gl, scene])
  return null
}
