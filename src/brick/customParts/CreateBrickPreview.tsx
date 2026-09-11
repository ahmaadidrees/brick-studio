import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createBrickGeometry } from '../geometry'
import { customPartToBrickPart } from '../parts'
import type { CreateBrickDraft } from './definition'

type PreviewScene = {
  update: (draft: CreateBrickDraft) => void
}

/** A single demand-rendered viewport. Draft geometry is never put in the world cache. */
export function CreateBrickPreview({ draft, hint }: { draft: CreateBrickDraft; hint: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<PreviewScene | null>(null)
  const latestDraft = useRef(draft)
  latestDraft.current = draft
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas: element, alpha: true, antialias: true, powerPreference: 'low-power' })
    } catch {
      setUnavailable(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x63788b, 2.8))
    const light = new THREE.DirectionalLight(0xffffff, 3.2)
    light.position.set(6, 10, 8)
    scene.add(light)
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200)
    camera.position.set(8, 7, 10)
    const controls = new OrbitControls(camera, element)
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = false
    const material = new THREE.MeshStandardMaterial({ color: '#528fda', roughness: 0.32, metalness: 0.04 })
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    scene.add(mesh)
    const render = () => renderer.render(scene, camera)
    let radius = 1
    const frame = () => {
      const vertical = THREE.MathUtils.degToRad(camera.fov / 2)
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
      const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.12
      camera.position.sub(controls.target).normalize().multiplyScalar(distance).add(controls.target)
      controls.update()
      render()
    }
    const resize = () => {
      const { width, height } = element.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      frame()
    }
    controls.addEventListener('change', render)
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    const update = (value: CreateBrickDraft) => {
      const geometry = createBrickGeometry(customPartToBrickPart({ ...value, id: 'create-brick-preview' }), { cache: false })
      geometry.computeBoundingSphere()
      const sphere = geometry.boundingSphere!
      radius = Math.max(0.1, sphere.radius)
      mesh.geometry.dispose()
      mesh.geometry = geometry
      mesh.position.copy(sphere.center).multiplyScalar(-1)
      resize()
    }
    sceneRef.current = { update }
    update(latestDraft.current)
    return () => {
      sceneRef.current = null
      observer.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      mesh.geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }, [])

  useEffect(() => { sceneRef.current?.update(draft) }, [draft])

  return (
    <figure className="create-brick-preview" aria-label="Live brick preview">
      <canvas ref={canvas} aria-label="3D preview of your brick. Drag to rotate." />
      <figcaption>
        <strong>{draft.width} × {draft.depth} studs · {draft.height} plates</strong>
        <span>{unavailable ? '3D preview unavailable on this device.' : hint ?? 'Drag the brick to see every side'}</span>
      </figcaption>
    </figure>
  )
}
