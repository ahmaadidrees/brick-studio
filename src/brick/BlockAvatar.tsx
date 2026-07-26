import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createFaceTexture } from './avatarFace'
import type { MotionSnapshotRef } from './avatarMotion'
import {
  createToyFigureRuntime,
  faceFrameOffsetX,
  faceFrameOffsetY,
  stepToyFigurePose,
} from './avatarPose'

export type BlockAvatarProps = {
  motion: MotionSnapshotRef
  reducedMotion?: boolean
  /** Matches the current 0.72 m tall Explore capsule by default. */
  scale?: number
  /** Compact renderers get fewer segments, fewer parts, and no clearcoat. */
  compact?: boolean
}

/**
 * Rig layout, in local units where 1.0 = `scale` metres. The figure is authored
 * to span y = -1 (soles) to y = +1 (top of the cap) so the default 0.36 scale
 * lands exactly on the 0.72 m Explore capsule. Nothing here is derived from the
 * collider; the collider is the contract and this is decoration hung off it.
 */
const PELVIS_Y = -0.1
const HIP_LOCAL_Y = -0.1
const HIP_X = 0.155
const KNEE_DROP = 0.34
const ANKLE_DROP = 0.32
const CHEST_Y = 0.02
const SHOULDER_LOCAL_Y = 0.34
const SHOULDER_X = 0.3
const ELBOW_DROP = 0.26
/** Head sits low on the shoulders; the collar cups the jaw so there is no neck to see. */
const HEAD_LOCAL_Y = 0.47
const CRANIUM_LOCAL_Y = 0.24
const THIGH_MID_Y = -0.16
const SHIN_MID_Y = -0.15

/** Head is an ellipsoid: taller than wide, and shallower than it is broad. */
const HEAD_STRETCH_Y = 1.12
const HEAD_STRETCH_Z = 0.94
const CRANIUM_RADIUS = 0.235
/**
 * The face shell and the cap are concentric with the cranium and only a little
 * proud of it, so they stay welded to the skull. Deriving them from the cranium
 * radius keeps them from sinking inside it when the head is resized.
 */
const FACE_RADIUS = CRANIUM_RADIUS * 1.026
const CAP_RADIUS = CRANIUM_RADIUS * 1.045
/** Polar angle where the cap stops, just above the brows. */
const CAP_THETA_LENGTH = 1.15
const CAP_EDGE_Y = Math.cos(CAP_THETA_LENGTH) * CAP_RADIUS * HEAD_STRETCH_Y
const FACE_PHI_LENGTH = 1.55
/**
 * The face shell is drawn square on the canvas, so its vertical arc is shortened
 * by the head's own vertical stretch to keep the features from smearing.
 */
const FACE_THETA_LENGTH = 1.34
const FACE_THETA_CENTER = Math.PI / 2 + 0.18

/**
 * Silhouette of the torso as a lathe profile of [radius, height] pairs. It is
 * widest across the chest and pinches at the waist, which is deliberately the
 * opposite taper to a minifigure's flared trapezoid.
 */
const TORSO_PROFILE: readonly (readonly [number, number])[] = [
  [0, -0.05],
  [0.105, -0.045],
  [0.163, -0.01],
  [0.188, 0.06],
  [0.222, 0.16],
  [0.262, 0.26],
  [0.284, 0.33],
  [0.262, 0.385],
  [0.192, 0.425],
  [0.1, 0.443],
  [0, 0.45],
]

const SUIT_COLOR = '#e8654a'
const TRIM_COLOR = '#2d6a80'
const ACCENT_COLOR = '#f6c445'
const SKIN_COLOR = '#f0bd86'
const DARK_COLOR = '#26313d'

type ToyFigureAssets = {
  pelvis: THREE.BufferGeometry
  belt: THREE.BufferGeometry
  torso: THREE.BufferGeometry
  emblem: THREE.BufferGeometry
  collar: THREE.BufferGeometry
  neck: THREE.BufferGeometry
  cranium: THREE.BufferGeometry
  face: THREE.BufferGeometry
  cap: THREE.BufferGeometry
  brim: THREE.BufferGeometry
  nose: THREE.BufferGeometry
  shoulderBall: THREE.BufferGeometry
  elbowBall: THREE.BufferGeometry
  upperArm: THREE.BufferGeometry
  forearm: THREE.BufferGeometry
  hand: THREE.BufferGeometry
  hipBall: THREE.BufferGeometry
  thigh: THREE.BufferGeometry
  shin: THREE.BufferGeometry
  boot: THREE.BufferGeometry
  cuff: THREE.BufferGeometry
  suit: THREE.Material
  trim: THREE.Material
  accent: THREE.Material
  skin: THREE.Material
  dark: THREE.Material
  faceMaterial: THREE.MeshStandardMaterial
  faceTexture: THREE.Texture
  geometries: THREE.BufferGeometry[]
  materials: THREE.Material[]
}

/**
 * Toy plastic. The compact tier drops the clearcoat lobe, which is the single
 * most expensive thing about this look, and leans on roughness alone.
 */
function createPlastic(color: string, compact: boolean): THREE.Material {
  if (compact) return new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0 })
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
  })
}

function createToyFigureAssets(compact: boolean): ToyFigureAssets {
  const sphereRadial = compact ? 12 : 22
  const sphereRings = compact ? 8 : 14
  const capsuleRadial = compact ? 8 : 14
  const capsuleCaps = compact ? 3 : 5
  const latheSegments = compact ? 14 : 26
  const cylinderSegments = compact ? 10 : 18

  const geometries: THREE.BufferGeometry[] = []
  function track<T extends THREE.BufferGeometry>(geometry: T): T {
    geometries.push(geometry)
    return geometry
  }

  const torsoPoints = TORSO_PROFILE.map(([radius, height]) => new THREE.Vector2(radius, height))
  const faceTexture = createFaceTexture(compact ? 96 : 160)
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: faceTexture,
    transparent: true,
    depthWrite: false,
    roughness: 0.5,
    metalness: 0,
  })
  const suit = createPlastic(SUIT_COLOR, compact)
  const trim = createPlastic(TRIM_COLOR, compact)
  const accent = createPlastic(ACCENT_COLOR, compact)
  const skin = createPlastic(SKIN_COLOR, compact)
  const dark = createPlastic(DARK_COLOR, compact)

  return {
    pelvis: track(new THREE.SphereGeometry(0.21, sphereRadial, sphereRings).scale(1.06, 0.66, 0.84)),
    belt: track(new THREE.CylinderGeometry(0.207, 0.203, 0.055, cylinderSegments).scale(1, 1, 0.86)),
    torso: track(new THREE.LatheGeometry(torsoPoints, latheSegments).scale(1, 1, 0.68)),
    emblem: track(new THREE.SphereGeometry(0.062, sphereRadial, sphereRings).scale(1.3, 1.05, 0.3)),
    collar: track(new THREE.CylinderGeometry(0.17, 0.225, 0.065, cylinderSegments).scale(1, 1, 0.86)),
    neck: track(new THREE.CylinderGeometry(0.115, 0.13, 0.09, cylinderSegments).scale(1, 1, 0.92)),
    cranium: track(
      new THREE.SphereGeometry(CRANIUM_RADIUS, sphereRadial, sphereRings).scale(1, HEAD_STRETCH_Y, HEAD_STRETCH_Z),
    ),
    // Curved shell a hair proud of the cranium, carrying the face atlas. Sharing
    // the cranium's baked stretch keeps it welded to the skull at any angle.
    face: track(
      new THREE.SphereGeometry(
        FACE_RADIUS,
        compact ? 14 : 24,
        compact ? 10 : 16,
        Math.PI / 2 - FACE_PHI_LENGTH / 2,
        FACE_PHI_LENGTH,
        FACE_THETA_CENTER - FACE_THETA_LENGTH / 2,
        FACE_THETA_LENGTH,
      ).scale(1, HEAD_STRETCH_Y, HEAD_STRETCH_Z),
    ),
    cap: track(
      new THREE.SphereGeometry(CAP_RADIUS, sphereRadial, compact ? 5 : 9, 0, Math.PI * 2, 0, CAP_THETA_LENGTH)
        .scale(1, HEAD_STRETCH_Y, HEAD_STRETCH_Z),
    ),
    brim: track(new THREE.CylinderGeometry(0.27, 0.27, 0.032, cylinderSegments, 1, false, -0.78, 1.56)),
    nose: track(new THREE.SphereGeometry(0.048, sphereRadial, sphereRings).scale(1, 0.85, 0.9)),
    shoulderBall: track(new THREE.SphereGeometry(0.098, sphereRadial, sphereRings)),
    elbowBall: track(new THREE.SphereGeometry(0.079, sphereRadial, sphereRings)),
    upperArm: track(new THREE.CapsuleGeometry(0.095, 0.09, capsuleCaps, capsuleRadial)),
    forearm: track(new THREE.CapsuleGeometry(0.082, 0.085, capsuleCaps, capsuleRadial)),
    hand: track(new THREE.SphereGeometry(0.098, sphereRadial, sphereRings).scale(1, 1.05, 1.12)),
    hipBall: track(new THREE.SphereGeometry(0.124, sphereRadial, sphereRings)),
    thigh: track(new THREE.CapsuleGeometry(0.112, 0.13, capsuleCaps, capsuleRadial)),
    shin: track(new THREE.CapsuleGeometry(0.096, 0.13, capsuleCaps, capsuleRadial)),
    boot: track(
      new THREE.CapsuleGeometry(0.112, 0.1, capsuleCaps, capsuleRadial).rotateX(Math.PI / 2).scale(1, 0.8, 1),
    ),
    cuff: track(new THREE.CylinderGeometry(0.122, 0.115, 0.055, cylinderSegments)),
    suit,
    trim,
    accent,
    skin,
    dark,
    faceMaterial,
    faceTexture,
    geometries,
    materials: [suit, trim, accent, skin, dark, faceMaterial],
  }
}

function disposeToyFigureAssets(assets: ToyFigureAssets) {
  for (const geometry of assets.geometries) geometry.dispose()
  for (const material of assets.materials) material.dispose()
  assets.faceTexture.dispose()
}

/**
 * Articulated toy figure for Explore mode.
 *
 * The transform stack below the physics-follow group is ordered so animation can
 * never rotate the owning rigid body: facing, then lean, then whole-body squash,
 * then the visual-only flip, and only then the hips and spine. All joint angles
 * come from `stepToyFigurePose`, which is pure and unit-tested; this file only
 * writes them onto nodes.
 */
export const BlockAvatar = memo(function BlockAvatar({
  motion,
  reducedMotion = false,
  scale = 0.36,
  compact = false,
}: BlockAvatarProps) {
  const physicsFollow = useRef<THREE.Group>(null)
  const facing = useRef<THREE.Group>(null)
  const lean = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const flip = useRef<THREE.Group>(null)
  const pelvis = useRef<THREE.Group>(null)
  const chest = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const leftShoulder = useRef<THREE.Group>(null)
  const rightShoulder = useRef<THREE.Group>(null)
  const leftElbow = useRef<THREE.Group>(null)
  const rightElbow = useRef<THREE.Group>(null)
  const leftHip = useRef<THREE.Group>(null)
  const rightHip = useRef<THREE.Group>(null)
  const leftKnee = useRef<THREE.Group>(null)
  const rightKnee = useRef<THREE.Group>(null)
  const leftAnkle = useRef<THREE.Group>(null)
  const rightAnkle = useRef<THREE.Group>(null)
  const leftThigh = useRef<THREE.Mesh>(null)
  const rightThigh = useRef<THREE.Mesh>(null)
  const leftShin = useRef<THREE.Mesh>(null)
  const rightShin = useRef<THREE.Mesh>(null)

  const runtime = useRef(createToyFigureRuntime(motion.current))
  const shownFaceFrame = useRef(-1)
  const assets = useMemo(() => createToyFigureAssets(compact), [compact])

  useEffect(() => () => disposeToyFigureAssets(assets), [assets])

  useFrame((_, frameDelta) => {
    const pose = stepToyFigurePose(runtime.current, motion.current, frameDelta, reducedMotion)

    if (facing.current) facing.current.rotation.y = pose.facingYaw
    if (lean.current) {
      lean.current.rotation.x = pose.bodyPitch
      lean.current.rotation.z = pose.bodyRoll
    }
    if (squash.current) {
      squash.current.position.y = pose.rootY
      squash.current.scale.set(pose.rootScaleXZ, pose.rootScaleY, pose.rootScaleXZ)
    }
    if (flip.current) flip.current.rotation.x = pose.flipRotationX
    if (pelvis.current) {
      pelvis.current.rotation.y = pose.pelvisYaw
      pelvis.current.rotation.z = pose.pelvisRoll
    }
    if (chest.current) {
      chest.current.rotation.x = pose.chestPitch
      chest.current.rotation.y = pose.chestYaw
      chest.current.rotation.z = pose.chestRoll
    }
    if (head.current) {
      head.current.rotation.x = pose.headPitch
      head.current.rotation.y = pose.headYaw
      head.current.rotation.z = pose.headRoll
    }

    if (leftShoulder.current) {
      leftShoulder.current.rotation.x = pose.leftShoulderPitch
      leftShoulder.current.rotation.z = pose.leftShoulderRoll
    }
    if (rightShoulder.current) {
      rightShoulder.current.rotation.x = pose.rightShoulderPitch
      rightShoulder.current.rotation.z = pose.rightShoulderRoll
    }
    // Elbows and knees are one-way hinges, so flexion is negated for the arms
    // (forearm folds forward) and kept positive for the legs (shin folds back).
    if (leftElbow.current) leftElbow.current.rotation.x = -pose.leftElbowFlex
    if (rightElbow.current) rightElbow.current.rotation.x = -pose.rightElbowFlex

    if (leftHip.current) {
      leftHip.current.rotation.x = pose.leftHipPitch
      leftHip.current.rotation.z = pose.leftHipRoll
    }
    if (rightHip.current) {
      rightHip.current.rotation.x = pose.rightHipPitch
      rightHip.current.rotation.z = pose.rightHipRoll
    }
    if (leftKnee.current) leftKnee.current.rotation.x = pose.leftKneeFlex
    if (rightKnee.current) rightKnee.current.rotation.x = pose.rightKneeFlex
    if (leftAnkle.current) leftAnkle.current.rotation.x = pose.leftFootPitch
    if (rightAnkle.current) rightAnkle.current.rotation.x = pose.rightFootPitch

    // Legs stretch on the launch and compress on the landing. Joint offsets move
    // with the segment meshes so the limb lengthens without opening a seam.
    const stretch = pose.limbStretch
    if (leftKnee.current) leftKnee.current.position.y = -KNEE_DROP * stretch
    if (rightKnee.current) rightKnee.current.position.y = -KNEE_DROP * stretch
    if (leftAnkle.current) leftAnkle.current.position.y = -ANKLE_DROP * stretch
    if (rightAnkle.current) rightAnkle.current.position.y = -ANKLE_DROP * stretch
    for (const thigh of [leftThigh.current, rightThigh.current]) {
      if (!thigh) continue
      thigh.scale.y = stretch
      thigh.position.y = THIGH_MID_Y * stretch
    }
    for (const shin of [leftShin.current, rightShin.current]) {
      if (!shin) continue
      shin.scale.y = stretch
      shin.position.y = SHIN_MID_Y * stretch
    }

    if (pose.faceFrame !== shownFaceFrame.current) {
      shownFaceFrame.current = pose.faceFrame
      assets.faceTexture.offset.set(faceFrameOffsetX(pose.faceFrame), faceFrameOffsetY(pose.faceFrame))
    }
  })

  const {
    suit, trim, accent, skin, dark, faceMaterial,
    pelvis: pelvisGeometry, belt, torso, emblem, collar, neck,
    cranium, face, cap, brim, nose,
    shoulderBall, elbowBall, upperArm, forearm, hand,
    hipBall, thigh, shin, boot, cuff,
  } = assets

  const arm = (
    side: 'left' | 'right',
    shoulderRef: typeof leftShoulder,
    elbowRef: typeof leftElbow,
  ) => {
    const sign = side === 'left' ? -1 : 1
    return (
      <group ref={shoulderRef} position={[sign * SHOULDER_X, SHOULDER_LOCAL_Y, 0]}>
        {/* Joints are colour-matched to the limb they belong to, so the ball
            silhouette reads as articulation instead of scattered black dots. */}
        <mesh geometry={shoulderBall} material={suit} />
        <mesh geometry={upperArm} material={suit} position={[0, -0.12, 0]} castShadow />
        <group ref={elbowRef} position={[0, -ELBOW_DROP, 0]}>
          {compact ? null : <mesh geometry={elbowBall} material={skin} />}
          <mesh geometry={forearm} material={skin} position={[0, -0.11, 0]} castShadow />
          <mesh geometry={hand} material={accent} position={[0, -0.265, 0]} />
        </group>
      </group>
    )
  }

  const leg = (
    side: 'left' | 'right',
    hipRef: typeof leftHip,
    kneeRef: typeof leftKnee,
    ankleRef: typeof leftAnkle,
    thighRef: typeof leftThigh,
    shinRef: typeof leftShin,
  ) => {
    const sign = side === 'left' ? -1 : 1
    return (
      <group ref={hipRef} position={[sign * HIP_X, HIP_LOCAL_Y, 0]}>
        <mesh geometry={hipBall} material={trim} />
        <mesh ref={thighRef} geometry={thigh} material={trim} position={[0, THIGH_MID_Y, 0]} castShadow />
        <group ref={kneeRef} position={[0, -KNEE_DROP, 0]}>
          <mesh ref={shinRef} geometry={shin} material={trim} position={[0, SHIN_MID_Y, 0]} castShadow />
          <group ref={ankleRef} position={[0, -ANKLE_DROP, 0]}>
            <mesh geometry={boot} material={dark} position={[0, -0.05, 0.035]} castShadow />
            {compact ? null : <mesh geometry={cuff} material={accent} position={[0, 0.012, 0.008]} />}
          </group>
        </group>
      </group>
    )
  }

  return (
    <group ref={physicsFollow} scale={scale}>
      <group ref={facing}>
        <group ref={lean}>
          <group ref={squash}>
            <group ref={flip}>
              <group ref={pelvis} position={[0, PELVIS_Y, 0]}>
                <mesh geometry={pelvisGeometry} material={trim} position={[0, 0.01, 0]} castShadow />
                <mesh geometry={belt} material={dark} position={[0, 0.1, 0]} />
                {leg('left', leftHip, leftKnee, leftAnkle, leftThigh, leftShin)}
                {leg('right', rightHip, rightKnee, rightAnkle, rightThigh, rightShin)}
              </group>

              <group ref={chest} position={[0, CHEST_Y, 0]}>
                <mesh geometry={torso} material={suit} castShadow />
                {compact ? null : <mesh geometry={emblem} material={accent} position={[0, 0.265, 0.172]} />}
                <mesh geometry={neck} material={skin} position={[0, 0.435, 0]} />
                <mesh geometry={collar} material={accent} position={[0, 0.425, 0]} />
                {arm('left', leftShoulder, leftElbow)}
                {arm('right', rightShoulder, rightElbow)}

                <group ref={head} position={[0, HEAD_LOCAL_Y, 0]}>
                  <mesh geometry={cranium} material={skin} position={[0, CRANIUM_LOCAL_Y, 0]} castShadow />
                  <mesh geometry={face} material={faceMaterial} position={[0, CRANIUM_LOCAL_Y, 0]} renderOrder={1} />
                  {compact ? null : <mesh geometry={nose} material={skin} position={[0, 0.179, 0.213]} />}
                  <mesh geometry={cap} material={suit} position={[0, CRANIUM_LOCAL_Y, 0]} castShadow />
                  {/* The brim survives the compact tier: without it the cap reads
                      as a bald dome and the character loses its silhouette. */}
                  <mesh
                    geometry={brim}
                    material={accent}
                    position={[0, CRANIUM_LOCAL_Y + CAP_EDGE_Y, 0]}
                    rotation={[0.2, 0, 0]}
                  />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
})
