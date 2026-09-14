import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'
import type { CharacterAppearance } from '@brick-studio/core'
import { createMotionSnapshot } from '../avatarMotion'
import { RuntimeCharacterAvatar, useRuntimeCharacter } from '../runtimeContent/character'
import type { CharacterId } from '../types'
import type { CharacterPalette } from './types'
import './character-preview.css'

export type CharacterPreviewProps = {
  characterId: CharacterId | null | undefined
  palette?: CharacterPalette
  appearance?: CharacterAppearance
  reducedMotion?: boolean
}

type PreviewAction = 'idle' | 'walk' | 'run' | 'jump'
const ACTIONS: PreviewAction[] = ['idle', 'walk', 'run', 'jump']

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <p className="character-preview__unavailable" role="status">3D preview is unavailable on this device. You can still choose your character and colors.</p>
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

/** Uses the same lazy character adapter and motion contract as Explore, without physics. */
export function CharacterPreview({ characterId, palette, appearance, reducedMotion = false }: CharacterPreviewProps) {
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
  return <div className="character-preview" ref={container}>
    <div className="character-preview__stage" aria-label="Interactive 3D character preview">
      <PreviewBoundary key={characterId}>
        <Canvas camera={{ position: [0.8, 0.5, 1.8], fov: 34 }} dpr={[1, 1.5]}
          frameloop={animate ? 'always' : 'demand'} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
          fallback={<p className="character-preview__unavailable">3D preview requires WebGL.</p>}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 5, 4]} intensity={2.5} />
          <directionalLight position={[-3, 2, -2]} intensity={1} color="#c4ddff" />
          <PreviewFigure characterId={characterId} palette={palette} appearance={appearance}
            reducedMotion={reducedMotion} action={action} onStatus={setStatus} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]}>
            <circleGeometry args={[0.55, 40]} /><meshStandardMaterial color="#b9ced8" roughness={1} />
          </mesh>
          <OrbitControls target={[0, 0.1, 0]} enablePan={false} enableZoom={false} enableDamping={false}
            minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.8} />
        </Canvas>
      </PreviewBoundary>
      <span className="character-preview__hint">Drag to turn</span>
      {status && <span className="character-preview__status" role="status">{status}</span>}
    </div>
    <div className="character-preview__controls" role="group" aria-label="Preview animation">
      {ACTIONS.map((item) => <button key={item} type="button" aria-pressed={action === item}
        onClick={() => setAction(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      {!reducedMotion && <button type="button" aria-label={playing ? 'Pause character animation' : 'Play character animation'}
        aria-pressed={!playing} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>}
    </div>
    {reducedMotion && <p className="character-preview__motion-note">Motion reduced. Drag to view your character.</p>}
  </div>
}
