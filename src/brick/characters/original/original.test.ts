import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ADDITIVE_CHARACTER_BY_ID } from '../index'
import { cloneOriginalVisual } from './model'

for (const id of ['pip', 'fern', 'nova'] as const) describe(`${id} delivery`, () => {
  it('loads the real binary, preserves ground and animation pivots, and isolates tint', async () => {
    const file = readFileSync(`assets/characters-original/${id}.glb`)
    expect(file.byteLength).toBeLessThan(200_000)
    const buffer = new Uint8Array(file).buffer
    const gltf = await new GLTFLoader().parseAsync(buffer, '')
    const bounds = new Box3().setFromObject(gltf.scene)
    expect(bounds.min.y).toBeCloseTo(0, 5)
    expect(bounds.getSize(new Vector3()).y).toBeCloseTo(1, 5)
    const a = cloneOriginalVisual(gltf.scene, id, { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' }, true)
    const b = cloneOriginalVisual(gltf.scene, id, {}, false)
    expect(a.pivots.filter(Boolean)).toHaveLength(5)
    expect(a.materials.every((material) => !b.materials.includes(material))).toBe(true)
    expect(a.materials.some((material) => material instanceof MeshStandardMaterial && material.color.getHexString() === 'ff0000')).toBe(true)
    const meshes: Mesh[] = []
    a.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object) })
    expect(meshes.length).toBeGreaterThan(15)
    for (const mesh of meshes) {
      const source = gltf.scene.getObjectByName(mesh.name) as Mesh
      expect(mesh.geometry).toBe(source.geometry)
      expect(mesh.material).not.toBe(source.material)
    }
    const registration = await ADDITIVE_CHARACTER_BY_ID.get(id)?.load()
    expect(registration?.descriptor.id).toBe(id)
    expect(registration?.Avatar).toBeTypeOf('function')
    expect(registration?.preload).toBeTypeOf('function')
    a.materials.forEach((material) => material.dispose())
    b.materials.forEach((material) => material.dispose())
  })
})
