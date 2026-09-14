import * as THREE from 'three'
import type { CharacterPalette } from '../types'
import type { OriginalCharacterId } from './descriptors'

export const ORIGINAL_MODEL_URLS = {
  pip: new URL('../../../../assets/characters-original/pip.glb', import.meta.url).href,
  fern: new URL('../../../../assets/characters-original/fern.glb', import.meta.url).href,
  nova: new URL('../../../../assets/characters-original/nova.glb', import.meta.url).href,
} as const

const MATERIAL_CHANNELS: Record<OriginalCharacterId, Record<string, string>> = {
  pip: { Sunshine: 'primary', Lagoon: 'secondary', Signal: 'accent' },
  fern: { Moss: 'primary', Clay: 'secondary', Sunshine: 'accent' },
  nova: { Orchid: 'primary', Pink: 'secondary', Signal: 'accent' },
}

/** Geometry is shared with the loader cache; materials and transforms are instance-owned. */
export function cloneOriginalVisual(source: THREE.Object3D, id: OriginalCharacterId, palette: CharacterPalette, castShadow: boolean) {
  const scene = source.clone(true)
  const materials = new Map<THREE.Material, THREE.Material>()
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = castShadow
    mesh.receiveShadow = false
    const copy = (original: THREE.Material) => {
      let material = materials.get(original)
      if (!material) {
        material = original.clone()
        const color = palette[MATERIAL_CHANNELS[id][original.name]]
        if (color && material instanceof THREE.MeshStandardMaterial) {
          material.color.set(color)
          if (material.emissiveIntensity > 0) material.emissive.set(color)
        }
        materials.set(original, material)
      }
      return material
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material)
  })
  const name = id[0].toUpperCase() + id.slice(1)
  const pivots = ['Head', 'Arm_L', 'Arm_R', 'Leg_L', 'Leg_R'].map((part) => {
    const object = scene.getObjectByName(`${name}_${part}`)
    return object ? { object, bind: object.quaternion.clone() } : null
  })
  return { scene, materials: [...materials.values()], pivots }
}
