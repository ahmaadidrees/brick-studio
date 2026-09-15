import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Group } from 'three'
import type { CharacterAppearance } from '@brick-studio/core'
import { Button } from '../../ui'
import { createMotionSnapshot } from '../avatarMotion'
import { RuntimeCharacterAvatar, useRuntimeCharacter } from '../runtimeContent/character'
import type { CharacterId } from '../types'
import type { CharacterPalette } from './types'
import './character-preview.css'

export type CharacterPreviewProps = {
  characterId: CharacterId | null | undefined
  palette?: CharacterPalette
  appearance?: CharacterAppearance
  /** Forces reduced motion; when omitted the studio motion preference and system setting decide. */
  reducedMotion?: boolean
}

export type PreviewAction = 'idle' | 'walk' | 'run' | 'jump'
const ACTIONS: { key: PreviewAction; label: string }[] = [
  { key: 'idle', label: 'Idle' }, { key: 'walk', label: 'Walk' }, { key: 'run', label: 'Run' }, { key: 'jump', label: 'Jump' },
]

/** Same cap as the editor scene: crisp on phones without paying for 3× panels. */
export const PREVIEW_DPR: [number, number] = [1, 1.5]

/** Same inputs as the app's motion preference hook, without coupling the studio to the store. */
const MOTION_PREFERENCE_KEY = 'brick-studio-motion-preference-v1'
const MOTION_PREFERENCE_EVENT = 'brick-studio-motion-preference-change'
function readReducedMotion() {
  let saved: string | null = null
  try { saved = window.localStorage.getItem(MOTION_PREFERENCE_KEY) } catch { /* System preference still applies when storage is blocked. */ }
  const system = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  return saved === 'reduced' || (saved !== 'full' && system)
}
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  query?.addEventListener?.('change', onChange)
  window.addEventListener(MOTION_PREFERENCE_EVENT, onChange)
  return () => {
    query?.removeEventListener?.('change', onChange)
    window.removeEventListener(MOTION_PREFERENCE_EVENT, onChange)
  }
}
export function usePreviewReducedMotion(override?: boolean) {
  const preference = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false)
  return override ?? preference
}

export const PREVIEW_UNAVAILABLE_MESSAGE = '3D preview is unavailable on this device. You can still choose your character and colors.'

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <p className="character-preview__unavailable" role="status">{PREVIEW_UNAVAILABLE_MESSAGE}</p>
      : this.props.children
  }
}

function PreviewFigure({ characterId, palette, appearance, reducedMotion, action, onStatus }: CharacterPreviewProps & {
  action: PreviewAction
  onStatus: (status: string) => void
}) {
  const motion = useRef(createMotionSnapshot({ maxSpeed: 5 }))
  const jump = useRef(0)
  const root = useRef<Group>(null)
  const { loading, error } = useRuntimeCharacter(characterId)
  useEffect(() => {
    onStatus(loading ? 'Loading character…' : error ? 'Character unavailable. Showing Classic Builder.' : '')
  }, [loading, error, onStatus])
  useEffect(() => {
    jump.current = 0
    motion.current.horizontalSpeed = action === 'run' ? 5 : action === 'walk' ? 2 : 0
    motion.current.grounded = action !== 'jump'
    motion.current.verticalVelocity = action === 'jump' ? 3 : 0
    if (action === 'jump') motion.current.jumpSequence += 1
  }, [action])
  useFrame((_, delta) => {
    if (action === 'jump' && !reducedMotion) {
      const previous = jump.current
      jump.current = (previous + Math.min(delta, 0.05)) % 1.6
      const t = jump.current
      const airborne = t < 0.8
      if (t < previous) motion.current.jumpSequence += 1
      if (motion.current.grounded === false && !airborne) motion.current.landSequence += 1
      motion.current.grounded = !airborne
      motion.current.verticalVelocity = airborne ? 3 - 7.5 * t : 0
      motion.current.impact = 3
      if (root.current) root.current.position.y = airborne ? 1.5 * t - 1.875 * t * t : 0
    } else if (root.current) root.current.position.y = 0
  }, -1)
  return <group ref={root}>
    <RuntimeCharacterAvatar characterId={characterId} palette={palette} appearance={appearance}
      motion={motion} reducedMotion={reducedMotion} compact
      onLoadError={() => onStatus('Character unavailable. Showing Classic Builder.')} />
  </group>
}

/** A small real 3D toy-room stage; no scene assets, physics or extra canvases. */
function PreviewStudioSet() {
  const stage = useRef<Group>(null)
  useFrame(({ camera }) => {
    // The room stays behind the turntable as the camera rotates around the
    // character, so a full turn never puts the backdrop in front of the avatar.
    if (stage.current) stage.current.rotation.y = Math.atan2(camera.position.x, camera.position.z)
  })
  return <group ref={stage}>
    <mesh position={[0, 0.6, -0.82]}>
      <boxGeometry args={[8, 4, 0.06]} /><meshStandardMaterial color="#6c89bc" roughness={1} />
    </mesh>
    <mesh position={[0, -0.45, 0]}>
      <boxGeometry args={[8, 0.06, 8]} /><meshStandardMaterial color="#e3bd83" roughness={1} />
    </mesh>
    <mesh position={[0, -0.405, 0]}>
      <cylinderGeometry args={[0.55, 0.55, 0.065, 48]} /><meshStandardMaterial color="#afc9ee" roughness={0.85} />
    </mesh>
    <mesh position={[-0.66, 0.17, -0.64]}>
      <boxGeometry args={[0.62, 0.045, 0.23]} /><meshStandardMaterial color="#e8c991" roughness={1} />
    </mesh>
    {['#f17861', '#f3ca74', '#9fcac2', '#b8cae8'].map((color, index) => <mesh key={color} position={[-0.86 + index * 0.13, 0.3 + (index % 2) * 0.025, -0.65]}>
      <boxGeometry args={[0.095, 0.21 + (index % 2) * 0.05, 0.13]} /><meshStandardMaterial color={color} roughness={1} />
    </mesh>)}
    <mesh position={[0.73, 0.24, -0.7]}>
      <boxGeometry args={[0.33, 0.47, 0.045]} /><meshStandardMaterial color="#e8c991" roughness={1} />
    </mesh>
    <mesh position={[0.73, 0.24, -0.67]}>
      <boxGeometry args={[0.28, 0.42, 0.025]} /><meshStandardMaterial color="#c5dbed" roughness={1} />
    </mesh>
    <mesh position={[0.72, 0.3, -0.65]}>
      <circleGeometry args={[0.065, 24]} /><meshBasicMaterial color="#f3ca74" />
    </mesh>
  </group>
}

/**
 * The one live Canvas in the studio: the same lazy character adapter and motion
 * contract as Explore, without physics. It renders on demand (no continuous
 * frames) whenever it is paused, scrolled out of view, in a hidden tab, or under
 * reduced motion; unmounting disposes the renderer and the avatar's materials.
 */
export function CharacterPreview({ characterId, palette, appearance, reducedMotion: reducedMotionInput }: CharacterPreviewProps) {
  const reducedMotion = usePreviewReducedMotion(reducedMotionInput)
  const [action, setAction] = useState<PreviewAction>('idle')
  const [playing, setPlaying] = useState(true)
  const [visible, setVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(true)
  const [status, setStatus] = useState('')
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden)
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 },
    )
    if (container.current) observer?.observe(container.current)
    return () => { document.removeEventListener('visibilitychange', onVisibility); observer?.disconnect() }
  }, [])
  const animate = playing && visible && pageVisible && !reducedMotion
  const choose = (next: PreviewAction) => { setAction(next); setPlaying(true) }
  return <div className="character-preview" ref={container} data-animating={animate || undefined}>
    <div className="character-preview__stage" aria-label="Interactive 3D character preview">
      <PreviewBoundary key={characterId}>
        <Canvas camera={{ position: [0.8, 0.5, 1.8], fov: 34 }} dpr={PREVIEW_DPR}
          frameloop={animate ? 'always' : 'demand'} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
          fallback={<p className="character-preview__unavailable">3D preview requires WebGL.</p>}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 5, 4]} intensity={2.5} color="#fff4e0" />
          <directionalLight position={[-3, 2, -2]} intensity={1} color="#c4ddff" />
          <PreviewFigure characterId={characterId} palette={palette} appearance={appearance}
            reducedMotion={reducedMotion} action={action} onStatus={setStatus} />
          <PreviewStudioSet />
          <OrbitControls target={[0, 0.1, 0]} enablePan={false} enableZoom={false} enableDamping={false}
            minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.8} />
        </Canvas>
      </PreviewBoundary>
      <span className="character-preview__hint"><RotateCcw aria-hidden="true" size={14} />Drag to turn</span>
      {status && <span className="character-preview__status" role="status">{status}</span>}
    </div>
    <div className="character-preview__controls" role="group" aria-label="Preview animation">
      {ACTIONS.map(({ key, label }) => (
        <Button key={key} variant="quiet" size="sm" className="character-preview__action" aria-pressed={action === key} onClick={() => choose(key)}>{label}</Button>
      ))}
      {!reducedMotion && (
        <Button
          variant="quiet"
          size="sm"
          className="character-preview__action character-preview__pause"
          aria-label={playing ? 'Pause character animation' : 'Play character animation'}
          aria-pressed={!playing}
          icon={playing ? <Pause size={15} /> : <Play size={15} />}
          onClick={() => setPlaying(!playing)}
        >{playing ? 'Pause' : 'Play'}</Button>
      )}
    </div>
    {reducedMotion && <p className="character-preview__motion-note">Motion is reduced, so the preview holds still. Drag to view your character from any side.</p>}
  </div>
}
