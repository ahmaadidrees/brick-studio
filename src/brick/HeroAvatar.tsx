import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { MotionSnapshotRef } from './avatarMotion'
import {
  HERO_FALL_POSE_SECONDS,
  HERO_JUMP_CLIP_START_SECONDS,
  createHeroAnimationRuntime,
  stepHeroAnimation,
  type HeroAnimationOptions,
  type HeroEmoteKey,
  type HeroPose,
} from './heroAnimation'
import { HERO_MODEL_URL } from './heroModel'
import { EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS } from './parts'

/** Bind-pose height of the vendored model, in its own units. */
const HERO_MODEL_HEIGHT = 4.6
/** Reads a touch taller than the 0.72 m capsule, which is normal for a game character. */
const HERO_VISUAL_HEIGHT = 0.8
const HERO_MODEL_SCALE = HERO_VISUAL_HEIGHT / HERO_MODEL_HEIGHT
const HERO_GROUND_OFFSET = -(EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS)
/** Decals sit a hair above the capsule's lowest point so they never z-fight the floor. */
const HERO_DECAL_OFFSET = HERO_GROUND_OFFSET + 0.004

/** Frame order: after the character step (-1), before drei's mixer update (0). */
const HERO_FRAME_PRIORITY = -0.5

/** Under 1 so the launch clip lingers on its tucked frames for the whole rise. */
const HERO_JUMP_CLIP_RATE = 0.85
const HERO_DUST_SECONDS = 0.42
const HERO_DUST_MIN_STRENGTH = 0.12

const HERO_SOURCE_CLIPS = {
  idle: 'Idle',
  walk: 'Walking',
  run: 'Running',
  jump: 'Jump',
  wave: 'Wave',
  thumbsUp: 'ThumbsUp',
  dance: 'Dance',
} as const

/** Distinct clip name so the airborne hold pose gets its own mixer action. */
const HERO_FALL_CLIP = 'HeroFall'

const HERO_EMOTE_CLIPS: Record<HeroEmoteKey, string> = {
  wave: HERO_SOURCE_CLIPS.wave,
  thumbsUp: HERO_SOURCE_CLIPS.thumbsUp,
  dance: HERO_SOURCE_CLIPS.dance,
}

/**
 * Repaint of the CC0 robot into a studio palette. The shell reads warm orange so
 * the hero separates from the pale plate and from the blue bricks kids build with;
 * cream panels and navy boots/visor give it weight at the ends.
 */
const HERO_SHELL_COLOR = '#f4f0e6'
const HERO_LIMB_COLOR = '#f06a3f'
const HERO_VISOR_COLOR = '#23313e'
const HERO_BOOT_COLOR = '#23313e'
const HERO_GLOVE_COLOR = '#f4f0e6'

function heroPartColor(objectName: string, materialName: string) {
  if (materialName === 'Grey') return objectName.startsWith('Foot') ? HERO_BOOT_COLOR : HERO_SHELL_COLOR
  if (materialName === 'Main') return objectName.startsWith('Hand') ? HERO_GLOVE_COLOR : HERO_LIMB_COLOR
  return HERO_VISOR_COLOR
}

type HeroVisual = {
  scene: THREE.Object3D
  materials: THREE.Material[]
}

function buildHeroVisual(source: THREE.Object3D, castShadow: boolean): HeroVisual {
  const scene = cloneSkinnedScene(source)
  scene.scale.setScalar(HERO_MODEL_SCALE)
  const palette = new Map<string, THREE.MeshStandardMaterial>()
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    // Bones swing the rigid limb meshes well outside their authored bounds.
    mesh.frustumCulled = false
    mesh.castShadow = castShadow
    mesh.receiveShadow = false
    const original = mesh.material
    if (Array.isArray(original)) return
    const color = heroPartColor(mesh.name, original.name)
    let material = palette.get(color)
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        // Toy plastic: a touch of sheen, no chrome.
        roughness: 0.52,
        metalness: 0.14,
      })
      palette.set(color, material)
    }
    mesh.material = material
  })
  return { scene, materials: [...palette.values()] }
}

function buildHeroClips(source: THREE.AnimationClip[], includeEmotes: boolean) {
  const byName = new Map(source.map((clip) => [clip.name, clip]))
  const wanted: string[] = [
    HERO_SOURCE_CLIPS.idle,
    HERO_SOURCE_CLIPS.walk,
    HERO_SOURCE_CLIPS.run,
    HERO_SOURCE_CLIPS.jump,
  ]
  if (includeEmotes) wanted.push(HERO_SOURCE_CLIPS.wave, HERO_SOURCE_CLIPS.thumbsUp, HERO_SOURCE_CLIPS.dance)
  const clips = wanted.map((name) => byName.get(name)).filter((clip): clip is THREE.AnimationClip => Boolean(clip))
  const jump = byName.get(HERO_SOURCE_CLIPS.jump)
  if (jump) {
    const fall = jump.clone()
    fall.name = HERO_FALL_CLIP
    clips.push(fall)
  }
  return clips
}

function buildBlobTexture() {
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,0.92)')
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.42)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function applyWeight(action: THREE.AnimationAction | null | undefined, weight: number) {
  if (!action) return
  // `setEffectiveWeight` reads `enabled`, so the flag has to be set first.
  action.enabled = weight > 0
  action.setEffectiveWeight(weight)
}

export type HeroAvatarProps = {
  motion: MotionSnapshotRef
  reducedMotion?: boolean
  /** Phone/compact renderer: drops the flourish clips and swaps shadows for a blob. */
  compact?: boolean
}

/**
 * Explore-only hero. Drives a rigged CC0 character from the controller's
 * MotionSnapshot: it reads physics and never writes it, and every rotation lives
 * on wrappers below the rigid body so animation can never move the collider.
 */
export const HeroAvatar = memo(function HeroAvatar({
  motion,
  reducedMotion = false,
  compact = false,
}: HeroAvatarProps) {
  const { scene: sourceScene, animations } = useGLTF(HERO_MODEL_URL, false, false)
  const visual = useMemo(() => buildHeroVisual(sourceScene, !compact), [sourceScene, compact])
  const clips = useMemo(() => buildHeroClips(animations, !compact), [animations, compact])
  const { actions, mixer } = useAnimations(clips, visual.scene)

  const facing = useRef<THREE.Group>(null)
  const lean = useRef<THREE.Group>(null)
  const flip = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const blob = useRef<THREE.Mesh>(null)
  const dust = useRef<THREE.Mesh>(null)
  const jumpRestartSeen = useRef(0)
  const emoteRestartSeen = useRef(0)

  // Measured clip lengths keep the flourish timer honest if the model is ever re-exported.
  const options = useMemo<Partial<HeroAnimationOptions>>(() => {
    const durations: Partial<Record<HeroEmoteKey, number>> = {}
    for (const key of Object.keys(HERO_EMOTE_CLIPS) as HeroEmoteKey[]) {
      const clip = clips.find((candidate) => candidate.name === HERO_EMOTE_CLIPS[key])
      if (clip) durations[key] = clip.duration
    }
    return { emoteDurations: durations as Record<HeroEmoteKey, number> }
  }, [clips])

  const runtime = useRef<ReturnType<typeof createHeroAnimationRuntime> | null>(null)
  if (!runtime.current) runtime.current = createHeroAnimationRuntime(motion.current, options)

  const blobTexture = useMemo(() => (compact ? buildBlobTexture() : null), [compact])

  useEffect(() => () => {
    for (const material of visual.materials) material.dispose()
  }, [visual])

  useEffect(() => () => blobTexture?.dispose(), [blobTexture])

  useLayoutEffect(() => {
    const looping = [
      actions[HERO_SOURCE_CLIPS.idle],
      actions[HERO_SOURCE_CLIPS.walk],
      actions[HERO_SOURCE_CLIPS.run],
    ]
    for (const action of looping) {
      if (!action) continue
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY)
      action.enabled = false
      action.setEffectiveWeight(0)
      action.play()
    }

    const jump = actions[HERO_SOURCE_CLIPS.jump]
    if (jump) {
      jump.setLoop(THREE.LoopOnce, 1)
      jump.clampWhenFinished = true
      jump.timeScale = HERO_JUMP_CLIP_RATE
      jump.enabled = false
      jump.setEffectiveWeight(0)
      jump.play()
      jump.time = HERO_JUMP_CLIP_START_SECONDS
    }

    // The airborne hold is the launch clip frozen on its tucked frame.
    const fall = actions[HERO_FALL_CLIP]
    if (fall) {
      fall.setLoop(THREE.LoopOnce, 1)
      fall.clampWhenFinished = true
      fall.enabled = false
      fall.setEffectiveWeight(0)
      fall.play()
      fall.time = HERO_FALL_POSE_SECONDS
      fall.paused = true
    }

    for (const name of Object.values(HERO_EMOTE_CLIPS)) {
      const action = actions[name]
      if (!action) continue
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.enabled = false
      action.setEffectiveWeight(0)
      action.play()
    }

    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer])

  useFrame((_, frameDelta) => {
    const current = runtime.current
    if (!current) return
    const pose = stepHeroAnimation(current, motion.current, frameDelta, reducedMotion)

    if (pose.jumpRestartSequence !== jumpRestartSeen.current) {
      jumpRestartSeen.current = pose.jumpRestartSequence
      const jump = actions[HERO_SOURCE_CLIPS.jump]
      if (jump) {
        jump.reset()
        jump.timeScale = HERO_JUMP_CLIP_RATE
        // Skip the crouch: the body is already off the ground by the time we see this.
        jump.time = HERO_JUMP_CLIP_START_SECONDS
      }
    }

    if (pose.emoteRestartSequence !== emoteRestartSeen.current) {
      emoteRestartSeen.current = pose.emoteRestartSequence
      const emote = pose.emote ? actions[HERO_EMOTE_CLIPS[pose.emote]] : null
      emote?.reset()
    }

    const weights = pose.weights
    applyWeight(actions[HERO_SOURCE_CLIPS.idle], weights.idle)
    applyWeight(actions[HERO_SOURCE_CLIPS.jump], weights.jump)
    applyWeight(actions[HERO_FALL_CLIP], weights.fall)

    // Walk and Run share a duration and a rate, so leaving both enabled keeps their
    // footfalls phase-locked and the crossfade between them never skates.
    const walk = actions[HERO_SOURCE_CLIPS.walk]
    if (walk) {
      walk.enabled = true
      walk.setEffectiveWeight(weights.walk)
      walk.timeScale = pose.locomotionTimeScale
    }
    const run = actions[HERO_SOURCE_CLIPS.run]
    if (run) {
      run.enabled = true
      run.setEffectiveWeight(weights.run)
      run.timeScale = pose.locomotionTimeScale
    }

    for (const key of Object.keys(HERO_EMOTE_CLIPS) as HeroEmoteKey[]) {
      applyWeight(actions[HERO_EMOTE_CLIPS[key]], pose.emote === key ? pose.emoteWeight : 0)
    }

    if (facing.current) facing.current.rotation.y = pose.facingYaw
    if (lean.current) {
      lean.current.rotation.x = pose.leanPitch
      lean.current.rotation.z = pose.leanRoll
    }
    if (flip.current) flip.current.rotation.x = pose.flipRotationX
    if (squash.current) squash.current.scale.set(pose.squashXZ, pose.squashY, pose.squashXZ)

    applyBlob(blob.current, pose)
    applyDust(dust.current, pose, reducedMotion)
  }, HERO_FRAME_PRIORITY)

  return (
    <group>
      {blobTexture ? (
        <mesh ref={blob} rotation-x={-Math.PI / 2} position-y={HERO_DECAL_OFFSET} renderOrder={-1}>
          <circleGeometry args={[0.29, 20]} />
          <meshBasicMaterial
            map={blobTexture}
            color="#5c6b74"
            transparent
            depthWrite={false}
            opacity={0}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      <mesh ref={dust} rotation-x={-Math.PI / 2} position-y={HERO_DECAL_OFFSET} visible={false} renderOrder={1}>
        <ringGeometry args={[0.62, 1, 24]} />
        <meshBasicMaterial color="#cbbca2" transparent depthWrite={false} opacity={0} toneMapped={false} />
      </mesh>
      <group ref={facing}>
        <group ref={lean}>
          <group ref={flip}>
            <group position-y={HERO_GROUND_OFFSET}>
              <group ref={squash}>
                {/* dispose={null}: the clone shares geometry with the cached glTF,
                    so unmounting on a mode switch must not free it. */}
                <primitive object={visual.scene} dispose={null} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
})

function applyBlob(mesh: THREE.Mesh | null, pose: HeroPose) {
  if (!mesh) return
  const material = mesh.material as THREE.MeshBasicMaterial
  const contact = pose.groundContact
  material.opacity = contact * 0.5
  mesh.visible = material.opacity > 0.01
  const spread = 0.86 + contact * 0.14
  mesh.scale.set(spread, spread, 1)
}

function applyDust(mesh: THREE.Mesh | null, pose: HeroPose, reducedMotion: boolean) {
  if (!mesh) return
  const material = mesh.material as THREE.MeshBasicMaterial
  const active = !reducedMotion
    && pose.landingStrength > HERO_DUST_MIN_STRENGTH
    && pose.landingElapsed < HERO_DUST_SECONDS
    && pose.groundContact > 0.5
  if (!active) {
    if (mesh.visible) mesh.visible = false
    return
  }
  const progress = pose.landingElapsed / HERO_DUST_SECONDS
  const fade = (1 - progress) * (1 - progress)
  // Peaks a little wider than the robot's stance — a puff, not a shockwave.
  const spread = 0.13 + progress * 0.13 * (0.7 + pose.landingStrength * 0.6)
  mesh.visible = true
  mesh.scale.set(spread, spread, 1)
  material.opacity = fade * 0.5 * pose.landingStrength
}
